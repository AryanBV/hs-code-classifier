/**
 * Populate hierarchical embeddings via Cohere embed-v4 (1536-dim, search_document).
 *
 * Phase 3 v3 (cascaded retrieval): embeds all 4 levels of the HS hierarchy:
 *   chapter (97)  +  heading (1,232)  +  subheading (5,613)  +  tariff_line (12,460)
 *   = 19,402 total vectors
 *
 * Each level uses level-appropriate context-concatenated text so the embedding
 * captures both the level's own semantics and its parent path.
 *
 * Idempotent per level: only processes rows WHERE embedding IS NULL.
 *
 * Concurrency: 4 parallel workers per level. Cohere trial cap is 2000 inputs/min;
 * our throughput stays comfortably below that.
 *
 * Cost: ~$0.50 - $0.70 for the full hierarchy at $0.12/MTok.
 *
 * Run:
 *   cd backend && npx tsx scripts/populate-embeddings-cohere.ts
 *   cd backend && npx tsx scripts/populate-embeddings-cohere.ts --level tariff_line
 *   cd backend && npx tsx scripts/populate-embeddings-cohere.ts --dry-run --limit 5
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_URL = 'https://api.cohere.com/v2/embed';
const MODEL = 'embed-v4.0';
const BATCH_SIZE = 96;
const TARGET_DIM = 1536;
const CONCURRENCY = 2;
const MIN_BATCH_DELAY_MS = 6000; // Per-worker. 2 workers × 60s/6s × 96 inputs
                                 // = 1920 inputs/min total — just under Cohere
                                 // trial's 2000-inputs/min cap. Keep 2 workers
                                 // for resilience (one stalling doesn't halt
                                 // throughput).
const MAX_RETRIES = 6;           // Bumped from 4 — longer recovery window.
const PRICE_PER_MTOK = 0.12;

type Level = 'chapter' | 'heading' | 'subheading' | 'tariff_line';
const LEVELS: Level[] = ['chapter', 'heading', 'subheading', 'tariff_line'];

interface CliFlags {
  dryRun: boolean;
  limit: number | null;
  level: Level | 'all';
}

interface BatchRow {
  pk: string; // The primary-key value of the row (chapter, heading, subheading, or code)
  embed_input: string;
}

interface EmbedResponse {
  embeddings: { float: number[][] };
  meta?: { billed_units?: { input_tokens?: number } };
}

interface LevelConfig {
  table: string;
  pkColumn: string;
  fetchSql: (limit: number) => Promise<BatchRow[]>;
  indexName: string;
}

function parseCliFlags(): CliFlags {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 && argv[limitIdx + 1] ? Number.parseInt(argv[limitIdx + 1], 10) : null;
  const levelIdx = argv.indexOf('--level');
  const levelArg = levelIdx >= 0 ? argv[levelIdx + 1] : 'all';
  if (levelArg !== 'all' && !LEVELS.includes(levelArg as Level)) {
    throw new Error(`--level must be one of: ${LEVELS.join(', ')}, all`);
  }
  return { dryRun, limit, level: levelArg as Level | 'all' };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(texts: string[], attempt = 1): Promise<EmbedResponse> {
  const body = {
    model: MODEL,
    texts,
    input_type: 'search_document',
    embedding_types: ['float'],
    output_dimension: TARGET_DIM,
  };

  const res = await fetch(COHERE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt > MAX_RETRIES) {
      throw new Error(`Cohere ${res.status}: retries exhausted`);
    }
    const backoff = 2 ** attempt * 1500;
    console.warn(`  HTTP ${res.status}; backoff ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
    await sleep(backoff);
    return embedBatch(texts, attempt + 1);
  }

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Cohere ${res.status} ${res.statusText}: ${raw.slice(0, 500)}`);
  }

  const parsed = (await res.json()) as EmbedResponse;
  if (!Array.isArray(parsed?.embeddings?.float) || parsed.embeddings.float.length !== texts.length) {
    throw new Error(
      `Cohere returned ${parsed?.embeddings?.float?.length ?? 0} embeddings for ${texts.length} inputs`,
    );
  }
  return parsed;
}

async function persistBatch(
  table: string,
  pkColumn: string,
  rows: BatchRow[],
  embeddings: number[][],
): Promise<void> {
  if (rows.length === 0) return;

  const params: string[] = [];
  const valueClauses: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const vec = embeddings[i];
    if (vec.length !== TARGET_DIM) {
      throw new Error(`row ${rows[i].pk}: expected ${TARGET_DIM}-dim, got ${vec.length}`);
    }
    const pkPlaceholder = `$${params.length + 1}`;
    params.push(rows[i].pk);
    const vecPlaceholder = `$${params.length + 1}`;
    params.push(`[${vec.join(',')}]`);
    valueClauses.push(`(${pkPlaceholder}::text, ${vecPlaceholder}::vector)`);
  }

  const sql = `
    UPDATE ${table} AS t
    SET embedding = u.vec
    FROM (VALUES ${valueClauses.join(', ')}) AS u(pk, vec)
    WHERE t.${pkColumn} = u.pk
  `;

  await prisma.$executeRawUnsafe(sql, ...params);
}

// ===== Level-specific fetch functions =====

async function fetchChaptersPending(limit: number): Promise<BatchRow[]> {
  // Chapter-level embed input: just the chapter title (after INITCAP since
  // chapters.title is upper-case in the DB).
  return prisma.$queryRaw<BatchRow[]>`
    SELECT
      c.chapter AS pk,
      INITCAP(c.title) AS embed_input
    FROM chapters c
    WHERE c.embedding IS NULL
      AND c.title IS NOT NULL
      AND length(trim(c.title)) > 0
    ORDER BY c.chapter
    LIMIT ${limit}
  `;
}

async function fetchHeadingsPending(limit: number): Promise<BatchRow[]> {
  // Heading-level: chapter context + heading title.
  return prisma.$queryRaw<BatchRow[]>`
    SELECT
      h.heading AS pk,
      (INITCAP(c.title) || '. ' || h.title) AS embed_input
    FROM headings h
    JOIN chapters c ON h.chapter = c.chapter
    WHERE h.embedding IS NULL
      AND h.title IS NOT NULL
      AND length(trim(h.title)) > 0
    ORDER BY h.heading
    LIMIT ${limit}
  `;
}

async function fetchSubheadingsPending(limit: number): Promise<BatchRow[]> {
  // Subheading-level: chapter + heading + subheading + india_specific_note when present.
  return prisma.$queryRaw<BatchRow[]>`
    SELECT
      s.subheading AS pk,
      (
        INITCAP(c.title) || '. ' ||
        h.title || '. ' ||
        s.title ||
        COALESCE('. ' || s.india_specific_note, '')
      ) AS embed_input
    FROM subheadings s
    JOIN headings h ON s.heading = h.heading
    JOIN chapters c ON h.chapter = c.chapter
    WHERE s.embedding IS NULL
      AND s.title IS NOT NULL
      AND length(trim(s.title)) > 0
    ORDER BY s.subheading
    LIMIT ${limit}
  `;
}

async function fetchTariffLinesPending(limit: number): Promise<BatchRow[]> {
  // Tariff-line level: full hierarchy + tariff description + optional india note + optional policy_condition.
  // Per Strategy 2 refinement: keep enrichment SHORT AND DISTINGUISHING; skip
  // chapter_subheading_notes (often paragraph-long, dilutes signal).
  return prisma.$queryRaw<BatchRow[]>`
    SELECT
      t.code AS pk,
      (
        INITCAP(c.title) || '. ' ||
        h.title || '. ' ||
        s.title || '. ' ||
        t.description ||
        COALESCE('. ' || s.india_specific_note, '') ||
        COALESCE('. Policy condition: ' || t.policy_condition, '') ||
        '.'
      ) AS embed_input
    FROM tariff_lines t
    JOIN subheadings s ON t.subheading = s.subheading
    JOIN headings    h ON s.heading    = h.heading
    JOIN chapters    c ON h.chapter    = c.chapter
    WHERE t.embedding IS NULL
      AND t.description IS NOT NULL
      AND length(trim(t.description)) > 0
    ORDER BY t.code
    LIMIT ${limit}
  `;
}

const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  chapter: {
    table: 'chapters',
    pkColumn: 'chapter',
    fetchSql: fetchChaptersPending,
    indexName: 'idx_chapters_embedding_hnsw',
  },
  heading: {
    table: 'headings',
    pkColumn: 'heading',
    fetchSql: fetchHeadingsPending,
    indexName: 'idx_headings_embedding_hnsw',
  },
  subheading: {
    table: 'subheadings',
    pkColumn: 'subheading',
    fetchSql: fetchSubheadingsPending,
    indexName: 'idx_subheadings_embedding_hnsw',
  },
  tariff_line: {
    table: 'tariff_lines',
    pkColumn: 'code',
    fetchSql: fetchTariffLinesPending,
    indexName: 'idx_tariff_lines_embedding_hnsw',
  },
};

async function ensureHnswIndex(level: Level): Promise<void> {
  const cfg = LEVEL_CONFIGS[level];
  const existing = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = ${cfg.table}
      AND indexdef ILIKE '%hnsw%'
  `;
  if (existing.length > 0) {
    console.log(`  [${level}] HNSW index already present: ${existing.map((r) => r.indexname).join(', ')}`);
    return;
  }

  console.log(`  [${level}] Creating HNSW index ${cfg.indexName}...`);
  const t = Date.now();
  await prisma.$executeRawUnsafe(`
    CREATE INDEX ${cfg.indexName}
    ON ${cfg.table}
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
  console.log(`  [${level}] HNSW index created in ${formatDuration(Date.now() - t)}.`);
}

async function countPending(level: Level): Promise<{ total: number; pending: number }> {
  const cfg = LEVEL_CONFIGS[level];
  const [{ total, pending }] = await prisma.$queryRawUnsafe<{ total: bigint; pending: bigint }[]>(
    `SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE embedding IS NULL)::bigint AS pending FROM ${cfg.table}`,
  );
  return { total: Number(total), pending: Number(pending) };
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

async function populateLevel(level: Level, flags: CliFlags): Promise<{ tokens: number; rows: number }> {
  const cfg = LEVEL_CONFIGS[level];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Level: ${level} (${cfg.table})`);
  console.log('='.repeat(60));

  const start = await countPending(level);
  console.log(`Baseline: ${start.total} total ${cfg.table}, ${start.pending} missing embeddings.`);

  if (start.pending === 0) {
    console.log('Nothing to do for this level.');
    return { tokens: 0, rows: 0 };
  }

  const cap = flags.limit ?? start.pending;
  console.log(`Target: ${Math.min(cap, start.pending)} rows. Concurrency: ${CONCURRENCY}.`);

  console.log(`Fetching pending rows for ${level}...`);
  const allPending = await cfg.fetchSql(cap);
  console.log(`Loaded ${allPending.length} pending rows into worker queue.`);

  const batches: BatchRow[][] = [];
  for (let i = 0; i < allPending.length; i += BATCH_SIZE) {
    batches.push(allPending.slice(i, i + BATCH_SIZE));
  }

  const state = {
    processed: 0,
    totalTokens: 0,
    batchCount: 0,
    nextBatch: 0,
  };
  const t0 = Date.now();

  async function worker(id: number): Promise<void> {
    let lastBatchEndMs = 0;
    while (true) {
      const idx = state.nextBatch++;
      if (idx >= batches.length) return;
      const rows = batches[idx];

      // Per-worker throttle: ensure each worker waits MIN_BATCH_DELAY_MS
      // between API calls. With CONCURRENCY=2 + MIN_BATCH_DELAY=3200ms,
      // sustained rate is 2 × 60/3.2 = ~38 batches/min × 96 = ~3600 inputs/min.
      // Hits the Cohere 2000/min cap intermittently → retries handle the rest.
      if (lastBatchEndMs > 0) {
        const sinceLast = Date.now() - lastBatchEndMs;
        if (sinceLast < MIN_BATCH_DELAY_MS) {
          await sleep(MIN_BATCH_DELAY_MS - sinceLast);
        }
      }

      const tBatch = Date.now();
      const texts = rows.map((r) => r.embed_input);
      const resp = await embedBatch(texts);
      const tokens = resp.meta?.billed_units?.input_tokens ?? 0;

      if (!flags.dryRun) {
        await persistBatch(cfg.table, cfg.pkColumn, rows, resp.embeddings.float);
      } else {
        for (const vec of resp.embeddings.float) {
          if (vec.length !== TARGET_DIM) {
            throw new Error(`dry-run dim check failed: got ${vec.length}-dim`);
          }
        }
      }

      state.processed += rows.length;
      state.totalTokens += tokens;
      state.batchCount += 1;
      lastBatchEndMs = Date.now();

      const elapsed = Date.now() - t0;
      const rate = (state.processed / elapsed) * 1000;
      const remaining = allPending.length - state.processed;
      const eta = (remaining / rate) * 1000;
      const cost = (state.totalTokens / 1_000_000) * PRICE_PER_MTOK;
      const batchMs = Date.now() - tBatch;

      console.log(
        `  [${level}] w${id} batch ${(idx + 1).toString().padStart(3)}/${batches.length}  ` +
          `+${rows.length.toString().padStart(2)} rows  ` +
          `[${state.processed}/${allPending.length}]  ` +
          `tokens=${tokens.toString().padStart(4)} (Σ=${state.totalTokens})  ` +
          `\$${cost.toFixed(4)}  ` +
          `batch=${batchMs}ms  ` +
          `ETA=${formatDuration(eta)}`,
      );
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const totalElapsed = Date.now() - t0;
  const totalCost = (state.totalTokens / 1_000_000) * PRICE_PER_MTOK;
  console.log(`\n[${level}] Done. ${state.processed} rows in ${formatDuration(totalElapsed)}. Tokens: ${state.totalTokens.toLocaleString()}. Cost: $${totalCost.toFixed(4)}.`);

  return { tokens: state.totalTokens, rows: state.processed };
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Hierarchical embedding population — Cohere embed-v4 @ 1536-dim');
  console.log('='.repeat(60));

  if (!COHERE_API_KEY || COHERE_API_KEY === 'your-cohere-api-key') {
    console.error('FAIL: COHERE_API_KEY not set in backend/.env (or still placeholder)');
    process.exit(1);
  }

  const flags = parseCliFlags();
  if (flags.dryRun) console.log('DRY-RUN MODE: no DB writes; embeddings discarded after dim-check.');
  if (flags.limit) console.log(`LIMIT: processing at most ${flags.limit} rows per level.`);
  console.log(`LEVEL: ${flags.level === 'all' ? LEVELS.join(' -> ') : flags.level}`);

  const levelsToRun: Level[] = flags.level === 'all' ? LEVELS : [flags.level];
  let totalTokens = 0;
  let totalRows = 0;
  const tStart = Date.now();

  for (const level of levelsToRun) {
    const result = await populateLevel(level, flags);
    totalTokens += result.tokens;
    totalRows += result.rows;
  }

  console.log('\n' + '='.repeat(60));
  console.log('All levels complete.');
  console.log('='.repeat(60));
  console.log(`Rows processed: ${totalRows}`);
  console.log(`Tokens billed:  ${totalTokens.toLocaleString()}`);
  console.log(`Total cost:     $${((totalTokens / 1_000_000) * PRICE_PER_MTOK).toFixed(4)}`);
  console.log(`Elapsed:        ${formatDuration(Date.now() - tStart)}`);

  if (flags.dryRun) {
    console.log('\nDRY-RUN: no changes persisted. Re-run without --dry-run to commit.');
    await prisma.$disconnect();
    return;
  }

  // Build HNSW indexes only for levels that fully completed (--limit excluded).
  if (flags.limit === null) {
    console.log('\n--- HNSW indexes ---');
    for (const level of levelsToRun) {
      const end = await countPending(level);
      if (end.pending === 0) {
        await ensureHnswIndex(level);
      } else {
        console.log(`  [${level}] Skipping HNSW index: ${end.pending} rows still missing.`);
      }
    }
  } else {
    console.log('\nSkipping HNSW indexes: --limit was set (run without --limit to finalise).');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Script failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});

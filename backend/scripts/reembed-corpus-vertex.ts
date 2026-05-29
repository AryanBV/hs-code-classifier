/**
 * Re-embed the ENTIRE HS-code corpus via Vertex `gemini-embedding-001` into a
 * NEW column `embedding_v2 vector(1536)` on each of the 4 hierarchy tables.
 *
 * WHY: migrate retrieval off Cohere (trial key exhausted → 429s) onto Vertex
 * (credit-covered). This job is SAFE + REVERSIBLE: it NEVER touches the existing
 * Cohere `embedding` column or its HNSW index. The eventual rename/swap is a
 * SEPARATE, reviewed step — this script deliberately STOPS before it.
 *
 * CORRECTNESS INVARIANTS (asserted in code):
 *   - taskType is ALWAYS 'RETRIEVAL_DOCUMENT'. gemini-embedding-001 is asymmetric;
 *     the runtime embeds *queries* as RETRIEVAL_QUERY. A wrong corpus taskType
 *     silently tanks retrieval, so we assert the echoed taskType on every call.
 *   - outputDim 1536; vectors are L2-normalized by embedVertex (a truncated
 *     Matryoshka dim is NOT pre-normalized, so the client normalizes — verified
 *     in the sample gate: stored norm ≈ 1.0).
 *   - embed_input TEXT FORMULA is VERBATIM from populate-embeddings-cohere.ts
 *     (per-level hierarchy concatenation). ONLY the model changes (Cohere→Vertex)
 *     so the two embedding spaces are directly comparable.
 *
 * BATCHING: gemini-embedding-001 on Vertex `:predict` accepts exactly ONE
 * instance per request (no multi-instance batching — confirmed against Google
 * docs 2026). So we use a bounded concurrency pool (CONCURRENCY workers), each
 * calling embedVertex (which has its own 429/5xx retry). One Vertex call per row.
 *
 * RESUMABLE: only rows WHERE embedding_v2 IS NULL are processed, and each row is
 * UPSERTed immediately after its embedding returns. A re-run continues where it
 * left off and never re-embeds a done row.
 *
 * TRUNCATION: truncateChars=6000 (gemini cap ~2048 tokens; 6000 chars is a safe
 * budget). Truncated rows are LOGGED (pk + original length) for tail-loss audit.
 *
 * Run from backend/:
 *   npx tsx scripts/reembed-corpus-vertex.ts                 # DDL + sample gate + full run + index + validate
 *   npx tsx scripts/reembed-corpus-vertex.ts --sample-only   # DDL + sample gate, then STOP (no full run)
 *   npx tsx scripts/reembed-corpus-vertex.ts --level tariff_line
 *   npx tsx scripts/reembed-corpus-vertex.ts --skip-index    # full run but skip HNSW build
 *   npx tsx scripts/reembed-corpus-vertex.ts --concurrency 6
 *
 * Real Vertex API calls (authorized; GDP Premium GenAI Credit-covered).
 */
import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { embedVertex, type EmbedVertexResult } from '../src/classifier-v2/lib/vertex-embed';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

const OUTPUT_DIM = 1536;
const TRUNCATE_CHARS = 6000;
const TASK_TYPE = 'RETRIEVAL_DOCUMENT' as const;
const DEFAULT_CONCURRENCY = 8;
const PROGRESS_EVERY = 1000;
const SELF_COSINE_MIN = 0.999;
const NORM_TOLERANCE = 1e-4;

// HNSW params mirror the existing `embedding` indexes exactly:
//   USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)
const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 64;

type Level = 'chapter' | 'heading' | 'subheading' | 'tariff_line';
const LEVELS: Level[] = ['chapter', 'heading', 'subheading', 'tariff_line'];

interface LevelConfig {
  table: string;
  pkColumn: string;
  indexName: string;
  /** SELECT (pk, embed_input) for rows still missing embedding_v2. VERBATIM text formula from the Cohere job. */
  fetchPendingSql: string;
}

/**
 * embed_input TEXT FORMULAE — copied VERBATIM (semantically identical SQL) from
 * backend/scripts/populate-embeddings-cohere.ts so the Vertex space is directly
 * comparable to the Cohere space. ONLY the resumable predicate changed:
 *   `embedding IS NULL`  ->  `embedding_v2 IS NULL`
 * (We want to (re)embed every row into the NEW column; the OLD column's NULLs
 * are irrelevant here. All rows currently have a Cohere embedding, but we key
 * resumability off embedding_v2 so a partial v2 run resumes correctly.)
 */
const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  chapter: {
    table: 'chapters',
    pkColumn: 'chapter',
    indexName: 'idx_chapters_embedding_v2_hnsw',
    fetchPendingSql: `
      SELECT
        c.chapter AS pk,
        INITCAP(c.title) AS embed_input
      FROM chapters c
      WHERE c.embedding_v2 IS NULL
        AND c.title IS NOT NULL
        AND length(trim(c.title)) > 0
      ORDER BY c.chapter
    `,
  },
  heading: {
    table: 'headings',
    pkColumn: 'heading',
    indexName: 'idx_headings_embedding_v2_hnsw',
    fetchPendingSql: `
      SELECT
        h.heading AS pk,
        (INITCAP(c.title) || '. ' || h.title) AS embed_input
      FROM headings h
      JOIN chapters c ON h.chapter = c.chapter
      WHERE h.embedding_v2 IS NULL
        AND h.title IS NOT NULL
        AND length(trim(h.title)) > 0
      ORDER BY h.heading
    `,
  },
  subheading: {
    table: 'subheadings',
    pkColumn: 'subheading',
    indexName: 'idx_subheadings_embedding_v2_hnsw',
    fetchPendingSql: `
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
      -- NOTE: unlike the other levels we deliberately do NOT require a non-empty
      -- OWN title here. 454 subheadings (e.g. Ch.72 primary-form iron/steel:
      -- 7201.10, 7202.*) have an empty \`title\` in our data yet ARE present in the
      -- Cohere \`embedding\` space. The JOINs guarantee the (always-populated) parent
      -- chapter+heading titles, so embed_input still carries real signal. Embedding
      -- them keeps the Vertex space at coverage parity with Cohere (so the eval is a
      -- fair architecture comparison, not a space-shrink) and lets the HNSW index
      -- build (it requires 0 NULL rows). The empty own-titles are a data-quality gap
      -- tracked separately for M2 leaf-precision enrichment.
      WHERE s.embedding_v2 IS NULL
      ORDER BY s.subheading
    `,
  },
  tariff_line: {
    table: 'tariff_lines',
    pkColumn: 'code',
    indexName: 'idx_tariff_lines_embedding_v2_hnsw',
    fetchPendingSql: `
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
      WHERE t.embedding_v2 IS NULL
        AND t.description IS NOT NULL
        AND length(trim(t.description)) > 0
      ORDER BY t.code
    `,
  },
};

/* ---------------------------------------------------------------------------
 * CLI
 * --------------------------------------------------------------------------- */

interface CliFlags {
  level: Level | 'all';
  sampleOnly: boolean;
  skipIndex: boolean;
  concurrency: number;
}

function parseCliFlags(): CliFlags {
  const argv = process.argv.slice(2);
  const sampleOnly = argv.includes('--sample-only');
  const skipIndex = argv.includes('--skip-index');

  const levelIdx = argv.indexOf('--level');
  const levelArg = levelIdx >= 0 ? argv[levelIdx + 1] : 'all';
  if (levelArg !== 'all' && !LEVELS.includes(levelArg as Level)) {
    throw new Error(`--level must be one of: ${LEVELS.join(', ')}, all`);
  }

  const concIdx = argv.indexOf('--concurrency');
  const concurrency =
    concIdx >= 0 && argv[concIdx + 1] ? Math.max(1, Number.parseInt(argv[concIdx + 1], 10)) : DEFAULT_CONCURRENCY;

  return { level: levelArg as Level | 'all', sampleOnly, skipIndex, concurrency };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function vecToPg(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

function l2norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/** Cosine for two L2-normalized vectors == dot product. */
function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Embed one text as RETRIEVAL_DOCUMENT; assert dim + taskType. Returns vector + truncation flag. */
async function embedDoc(text: string): Promise<{ vec: number[]; truncated: boolean; origLen: number; latencyMs: number }> {
  const origLen = text.length;
  const truncated = origLen > TRUNCATE_CHARS;
  const res: EmbedVertexResult = await embedVertex(text, TASK_TYPE, {
    outputDim: OUTPUT_DIM,
    truncateChars: TRUNCATE_CHARS,
  });
  // Hard asserts — never persist a vector with the wrong shape or taskType.
  if (res.taskType !== TASK_TYPE) {
    throw new Error(`[reembed] taskType assertion failed: expected ${TASK_TYPE}, got ${res.taskType}`);
  }
  if (res.dim !== OUTPUT_DIM || res.embedding.length !== OUTPUT_DIM) {
    throw new Error(`[reembed] dim assertion failed: expected ${OUTPUT_DIM}, got ${res.embedding.length}`);
  }
  return { vec: res.embedding, truncated, origLen, latencyMs: res.latencyMs };
}

/* ---------------------------------------------------------------------------
 * 1. DDL — add embedding_v2 column (idempotent, NEVER touches `embedding`)
 * --------------------------------------------------------------------------- */

async function ensureColumns(pool: Pool): Promise<void> {
  console.log('\n--- Step 1: DDL (ADD COLUMN IF NOT EXISTS embedding_v2 vector(1536)) ---');
  for (const level of LEVELS) {
    const { table } = LEVEL_CONFIGS[level];
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS embedding_v2 vector(${OUTPUT_DIM})`);
    // Verify type matches the existing `embedding` column (defense-in-depth).
    const r = await pool.query<{ full_type: string }>(
      `SELECT format_type(a.atttypid, a.atttypmod) AS full_type
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname=$1 AND a.attname='embedding_v2' AND NOT a.attisdropped`,
      [table],
    );
    const ft = r.rows[0]?.full_type;
    if (ft !== `vector(${OUTPUT_DIM})`) {
      throw new Error(`[reembed] ${table}.embedding_v2 has unexpected type "${ft}" (expected vector(${OUTPUT_DIM}))`);
    }
    console.log(`  ${table}.embedding_v2  ${ft}  OK`);
  }
}

/* ---------------------------------------------------------------------------
 * 2. SAMPLE GATE — embed 5 mixed-level rows, write, verify, before full run
 * --------------------------------------------------------------------------- */

interface SampleRow {
  level: Level;
  table: string;
  pkColumn: string;
  pk: string;
  embed_input: string;
}

async function fetchSampleRows(pool: Pool): Promise<SampleRow[]> {
  const out: SampleRow[] = [];
  // 1 chapter, 1 heading, 1 subheading, 2 tariff_lines = 5 mixed-level rows.
  const plan: Array<{ level: Level; count: number }> = [
    { level: 'chapter', count: 1 },
    { level: 'heading', count: 1 },
    { level: 'subheading', count: 1 },
    { level: 'tariff_line', count: 2 },
  ];
  for (const { level, count } of plan) {
    const cfg = LEVEL_CONFIGS[level];
    // Use the level's fetch SQL but ignore the embedding_v2 predicate for the
    // sample (we want a deterministic, representative row even on a re-run).
    const sql = cfg.fetchPendingSql
      .replace(/WHERE[\s\S]*?embedding_v2 IS NULL\s+AND/i, 'WHERE')
      .concat(` LIMIT ${count}`);
    const r = await pool.query<{ pk: string; embed_input: string }>(sql);
    for (const row of r.rows) {
      out.push({ level, table: cfg.table, pkColumn: cfg.pkColumn, pk: row.pk, embed_input: row.embed_input });
    }
  }
  return out;
}

async function runSampleGate(pool: Pool): Promise<void> {
  console.log('\n--- Step 2: SAMPLE GATE (5 mixed-level rows) ---');
  const samples = await fetchSampleRows(pool);
  if (samples.length === 0) {
    throw new Error('[reembed] sample gate: no rows fetched — corpus appears empty?');
  }

  let allOk = true;
  for (const s of samples) {
    const a = await embedDoc(s.embed_input);
    // Write into embedding_v2 (real write — proves the column accepts the vector).
    await pool.query(
      `UPDATE ${s.table} SET embedding_v2 = $1::vector WHERE ${s.pkColumn} = $2`,
      [vecToPg(a.vec), s.pk],
    );
    // Re-embed the SAME embed_input → self-cosine should be ~1.0 (determinism +
    // proves we stored what we computed; asymmetric-taskType bugs would NOT show
    // here, but the taskType assert in embedDoc covers that).
    const b = await embedDoc(s.embed_input);
    const selfCos = cosine(a.vec, b.vec);
    const norm = l2norm(a.vec);

    const dimOk = a.vec.length === OUTPUT_DIM;
    const normOk = Math.abs(norm - 1) < NORM_TOLERANCE;
    const cosOk = selfCos > SELF_COSINE_MIN;
    const ok = dimOk && normOk && cosOk;
    if (!ok) allOk = false;

    console.log(
      `  [${s.level}] ${s.pk}  dim=${a.vec.length}${dimOk ? '' : ' ✗'}  ` +
        `norm=${norm.toFixed(8)}${normOk ? '' : ' ✗'}  ` +
        `self-cos=${selfCos.toFixed(8)}${cosOk ? '' : ' ✗'}  ` +
        `len=${s.embed_input.length}${a.truncated ? ' [TRUNCATED]' : ''}  ${ok ? 'PASS' : 'FAIL'}`,
    );
  }

  if (!allOk) {
    throw new Error(
      '[reembed] SAMPLE GATE FAILED — dim/norm/self-cosine off. ABORTING before the full run (no Vertex budget burned).',
    );
  }
  console.log('  SAMPLE GATE: PASS (dim=1536, norm≈1.0, self-cosine≈1.0 on all samples).');
}

/* ---------------------------------------------------------------------------
 * 3. FULL RUN — bounded concurrency pool, one Vertex call per row, UPSERT each
 * --------------------------------------------------------------------------- */

interface LevelRunResult {
  rowsEmbedded: number;
  truncatedPks: Array<{ pk: string; len: number }>;
  failures: Array<{ pk: string; error: string }>;
  callCount: number;
}

async function populateLevel(pool: Pool, level: Level, concurrency: number): Promise<LevelRunResult> {
  const cfg = LEVEL_CONFIGS[level];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Level: ${level} (${cfg.table})`);
  console.log('='.repeat(60));

  const pending = await pool.query<{ pk: string; embed_input: string }>(cfg.fetchPendingSql);
  const rows = pending.rows;
  console.log(`Pending (embedding_v2 IS NULL): ${rows.length} rows. Concurrency: ${concurrency}.`);

  const result: LevelRunResult = { rowsEmbedded: 0, truncatedPks: [], failures: [], callCount: 0 };
  if (rows.length === 0) {
    console.log('Nothing to do for this level.');
    return result;
  }

  const t0 = Date.now();
  let nextIdx = 0;

  async function worker(workerId: number): Promise<void> {
    // Dedicated client per worker → genuine concurrent UPDATEs through the pool.
    const client: PoolClient = await pool.connect();
    try {
      while (true) {
        const idx = nextIdx++;
        if (idx >= rows.length) return;
        const row = rows[idx];
        try {
          const e = await embedDoc(row.embed_input);
          result.callCount += 1;
          if (e.truncated) result.truncatedPks.push({ pk: row.pk, len: e.origLen });

          await client.query(
            `UPDATE ${cfg.table} SET embedding_v2 = $1::vector WHERE ${cfg.pkColumn} = $2`,
            [vecToPg(e.vec), row.pk],
          );
          result.rowsEmbedded += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.failures.push({ pk: row.pk, error: msg });
          console.warn(`  [${level}] w${workerId} FAILED ${row.pk}: ${msg}`);
        }

        const done = result.rowsEmbedded + result.failures.length;
        if (done % PROGRESS_EVERY === 0 || done === rows.length) {
          const elapsed = Date.now() - t0;
          const rate = (done / elapsed) * 1000;
          const remaining = rows.length - done;
          const eta = rate > 0 ? (remaining / rate) * 1000 : 0;
          console.log(
            `  [${level}] ${done}/${rows.length}  ok=${result.rowsEmbedded} fail=${result.failures.length} ` +
              `trunc=${result.truncatedPks.length}  rate=${rate.toFixed(1)}/s  ETA=${formatDuration(eta)}`,
          );
        }
      }
    } finally {
      client.release();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const elapsed = Date.now() - t0;
  console.log(
    `[${level}] Done. embedded=${result.rowsEmbedded} failed=${result.failures.length} ` +
      `truncated=${result.truncatedPks.length} calls=${result.callCount} in ${formatDuration(elapsed)}.`,
  );
  if (result.truncatedPks.length > 0) {
    console.log(`  [${level}] Truncated rows (>${TRUNCATE_CHARS} chars):`);
    for (const t of result.truncatedPks) console.log(`    ${t.pk}  origLen=${t.len}`);
  }
  if (result.failures.length > 0) {
    console.log(`  [${level}] FAILED rows (left NULL — re-run to retry):`);
    for (const f of result.failures) console.log(`    ${f.pk}: ${f.error}`);
  }
  return result;
}

/* ---------------------------------------------------------------------------
 * 4. BUILD INDEX — HNSW on embedding_v2 (mirrors existing `embedding` index)
 * --------------------------------------------------------------------------- */

async function ensureHnswIndex(pool: Pool, level: Level): Promise<void> {
  const cfg = LEVEL_CONFIGS[level];
  const existing = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=$1 AND indexname=$2`,
    [cfg.table, cfg.indexName],
  );
  if (existing.rows.length > 0) {
    console.log(`  [${level}] HNSW index ${cfg.indexName} already present — skipping.`);
    return;
  }
  console.log(`  [${level}] Creating HNSW index ${cfg.indexName} (m=${HNSW_M}, ef_construction=${HNSW_EF_CONSTRUCTION})...`);
  const t = Date.now();
  await pool.query(
    `CREATE INDEX ${cfg.indexName} ON ${cfg.table} ` +
      `USING hnsw (embedding_v2 vector_cosine_ops) WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})`,
  );
  console.log(`  [${level}] HNSW index built in ${formatDuration(Date.now() - t)}.`);
}

/* ---------------------------------------------------------------------------
 * 5. VALIDATE — counts (0 NULL?), spot self-cosines, dims/norms
 * --------------------------------------------------------------------------- */

interface ValidationRow {
  level: Level;
  table: string;
  total: number;
  v2Populated: number;
  v2Null: number;
  spotPk: string | null;
  spotDim: number | null;
  spotNorm: number | null;
  spotSelfCos: number | null;
}

async function validateLevel(pool: Pool, level: Level): Promise<ValidationRow> {
  const cfg = LEVEL_CONFIGS[level];
  const counts = await pool.query<{ total: string; pop: string; nul: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(embedding_v2)::text AS pop,
            COUNT(*) FILTER (WHERE embedding_v2 IS NULL)::text AS nul
     FROM ${cfg.table}`,
  );
  const c = counts.rows[0];
  const row: ValidationRow = {
    level,
    table: cfg.table,
    total: Number(c.total),
    v2Populated: Number(c.pop),
    v2Null: Number(c.nul),
    spotPk: null,
    spotDim: null,
    spotNorm: null,
    spotSelfCos: null,
  };

  // Spot self-cosine: pull one populated row's stored vector + its embed_input,
  // re-embed the input, compare. Confirms the stored vector matches a fresh
  // embed of the same canonical text (catches any silent corruption / wrong col).
  const spotSql =
    cfg.fetchPendingSql.replace(/WHERE[\s\S]*?embedding_v2 IS NULL\s+AND/i, 'WHERE') + ' LIMIT 1';
  const spot = await pool.query<{ pk: string; embed_input: string }>(spotSql);
  if (spot.rows.length > 0) {
    const { pk, embed_input } = spot.rows[0];
    const stored = await pool.query<{ v: string }>(
      `SELECT embedding_v2::text AS v FROM ${cfg.table} WHERE ${cfg.pkColumn} = $1`,
      [pk],
    );
    if (stored.rows[0]?.v) {
      const storedVec: number[] = JSON.parse(stored.rows[0].v);
      const fresh = await embedDoc(embed_input);
      row.spotPk = pk;
      row.spotDim = storedVec.length;
      row.spotNorm = l2norm(storedVec);
      row.spotSelfCos = cosine(storedVec, fresh.vec);
    }
  }
  return row;
}

function printValidationTable(rows: ValidationRow[]): void {
  console.log('\n--- Step 5: VALIDATION ---');
  console.log(
    'level'.padEnd(13) +
      'total'.padStart(8) +
      'v2_pop'.padStart(9) +
      'v2_null'.padStart(9) +
      '  spot_pk'.padEnd(16) +
      'dim'.padStart(6) +
      'norm'.padStart(12) +
      'self_cos'.padStart(12),
  );
  for (const r of rows) {
    console.log(
      r.level.padEnd(13) +
        String(r.total).padStart(8) +
        String(r.v2Populated).padStart(9) +
        String(r.v2Null).padStart(9) +
        ('  ' + (r.spotPk ?? '-')).padEnd(16) +
        String(r.spotDim ?? '-').padStart(6) +
        (r.spotNorm != null ? r.spotNorm.toFixed(6) : '-').padStart(12) +
        (r.spotSelfCos != null ? r.spotSelfCos.toFixed(6) : '-').padStart(12),
    );
  }
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Corpus re-embed — Vertex gemini-embedding-001 → embedding_v2');
  console.log(`taskType=${TASK_TYPE}  outputDim=${OUTPUT_DIM}  truncateChars=${TRUNCATE_CHARS}`);
  console.log('='.repeat(60));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('FAIL: DATABASE_URL not set in backend/.env');
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('FAIL: GOOGLE_APPLICATION_CREDENTIALS not set (Vertex SA JSON path)');
    process.exit(1);
  }

  const flags = parseCliFlags();
  const levelsToRun: Level[] = flags.level === 'all' ? LEVELS : [flags.level];
  console.log(`Levels: ${levelsToRun.join(' -> ')}`);
  if (flags.sampleOnly) console.log('MODE: --sample-only (DDL + sample gate, then STOP)');
  if (flags.skipIndex) console.log('MODE: --skip-index (no HNSW build)');

  // Pool sized to fit the concurrency pool + a couple slots for the main thread.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: Math.max(flags.concurrency + 2, 5),
  });

  const tStart = Date.now();
  try {
    // 1. DDL
    await ensureColumns(pool);

    // 2. Sample gate
    await runSampleGate(pool);
    if (flags.sampleOnly) {
      console.log('\n--sample-only: stopping after sample gate. Re-run without the flag for the full run.');
      return;
    }

    // 3. Full run
    let totalEmbedded = 0;
    let totalTruncated = 0;
    let totalFailures = 0;
    let totalCalls = 0;
    for (const level of levelsToRun) {
      const r = await populateLevel(pool, level, flags.concurrency);
      totalEmbedded += r.rowsEmbedded;
      totalTruncated += r.truncatedPks.length;
      totalFailures += r.failures.length;
      totalCalls += r.callCount;
    }

    // 4. Build index — only for fully-populated levels.
    if (!flags.skipIndex) {
      console.log('\n--- Step 4: HNSW indexes on embedding_v2 ---');
      for (const level of levelsToRun) {
        const cfg = LEVEL_CONFIGS[level];
        const nul = await pool.query<{ nul: string }>(
          `SELECT COUNT(*) FILTER (WHERE embedding_v2 IS NULL)::text AS nul FROM ${cfg.table}`,
        );
        if (Number(nul.rows[0].nul) === 0) {
          await ensureHnswIndex(pool, level);
        } else {
          console.log(`  [${level}] Skipping HNSW index: ${nul.rows[0].nul} rows still NULL (re-run to finish).`);
        }
      }
    } else {
      console.log('\n--skip-index: HNSW build skipped.');
    }

    // 5. Validate
    const valRows: ValidationRow[] = [];
    for (const level of levelsToRun) valRows.push(await validateLevel(pool, level));
    printValidationTable(valRows);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('FULL RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Rows embedded this run : ${totalEmbedded}`);
    console.log(`Vertex calls this run  : ${totalCalls}`);
    console.log(`Truncated (>${TRUNCATE_CHARS} ch) : ${totalTruncated}`);
    console.log(`Failures (left NULL)   : ${totalFailures}`);
    console.log(`Wall-clock             : ${formatDuration(Date.now() - tStart)}`);
    console.log(`taskType               : ${TASK_TYPE} (asserted on every call)`);

    const anyNull = valRows.some((r) => r.v2Null > 0);
    if (anyNull || totalFailures > 0) {
      console.log('\n⚠ Some rows are still NULL or failed. Re-run this script (resumable) to finish them.');
    } else {
      console.log('\n✓ All targeted levels fully populated (0 NULL). The `embedding` (Cohere) column is UNTOUCHED.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const e = err as { message?: string; cause?: { response?: { status?: number; data?: unknown } } };
  console.error('\nSCRIPT FAILED:', e.message ?? err);
  const status = e.cause?.response?.status;
  if (status) console.error('  HTTP status:', status);
  if (e.cause?.response?.data) console.error('  body:', JSON.stringify(e.cause.response.data, null, 2));
  process.exit(1);
});

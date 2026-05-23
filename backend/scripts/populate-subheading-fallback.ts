/**
 * Supplementary embedding pass for the 454 subheadings whose title field is
 * empty (a Phase 2 extraction gap, mostly in chapters 72-73 iron/steel).
 *
 * Strategy: synthesize the embed_input from PARENT context + an aggregate of
 * the subheading's tariff_line descriptions. This gives a meaningful semantic
 * vector even though the subheading row itself has no title text.
 *
 * Format:
 *   "[chapter title]. [heading title]. Subheading [code]: [tariff_desc_1; tariff_desc_2; ...]."
 *
 * Run: cd backend && npx tsx scripts/populate-subheading-fallback.ts
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
const CONCURRENCY = 4;
const PRICE_PER_MTOK = 0.12;

interface BatchRow {
  pk: string;
  embed_input: string;
}

interface EmbedResponse {
  embeddings: { float: number[][] };
  meta?: { billed_units?: { input_tokens?: number } };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(texts: string[], attempt = 1): Promise<EmbedResponse> {
  const res = await fetch(COHERE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      texts,
      input_type: 'search_document',
      embedding_types: ['float'],
      output_dimension: TARGET_DIM,
    }),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 4) throw new Error(`Cohere ${res.status}: retries exhausted`);
    await sleep(2 ** attempt * 1500);
    return embedBatch(texts, attempt + 1);
  }
  if (!res.ok) throw new Error(`Cohere ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as EmbedResponse;
}

async function persistBatch(rows: BatchRow[], embeddings: number[][]): Promise<void> {
  if (rows.length === 0) return;
  const params: string[] = [];
  const valueClauses: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const codePlaceholder = `$${params.length + 1}`;
    params.push(rows[i].pk);
    const vecPlaceholder = `$${params.length + 1}`;
    params.push(`[${embeddings[i].join(',')}]`);
    valueClauses.push(`(${codePlaceholder}::text, ${vecPlaceholder}::vector)`);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE subheadings AS t
     SET embedding = u.vec
     FROM (VALUES ${valueClauses.join(', ')}) AS u(pk, vec)
     WHERE t.subheading = u.pk`,
    ...params,
  );
}

async function fetchEmptyTitleWithFallback(): Promise<BatchRow[]> {
  // For each empty-title subheading: parent context + aggregated tariff_line descriptions.
  // Aggregation makes the subheading's embedding represent what it CONTAINS,
  // which is semantically meaningful for cascade retrieval.
  return prisma.$queryRaw<BatchRow[]>`
    SELECT
      s.subheading AS pk,
      (
        INITCAP(c.title) || '. ' ||
        h.title || '. ' ||
        'Subheading ' || s.subheading || ': ' ||
        COALESCE(
          string_agg(t.description, '; ' ORDER BY t.code),
          '(no tariff line descriptions available)'
        )
      ) AS embed_input
    FROM subheadings s
    JOIN headings h ON s.heading = h.heading
    JOIN chapters c ON h.chapter = c.chapter
    LEFT JOIN tariff_lines t ON t.subheading = s.subheading
    WHERE s.embedding IS NULL
      AND (s.title IS NULL OR length(trim(s.title)) = 0)
    GROUP BY s.subheading, c.title, h.title
    ORDER BY s.subheading
  `;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Supplementary subheading-fallback embedding pass');
  console.log('='.repeat(60));

  if (!COHERE_API_KEY || COHERE_API_KEY === 'your-cohere-api-key') {
    console.error('FAIL: COHERE_API_KEY not set in backend/.env');
    process.exit(1);
  }

  console.log('Fetching empty-title subheadings with fallback text...');
  const allPending = await fetchEmptyTitleWithFallback();
  console.log(`Loaded ${allPending.length} empty-title subheadings.\n`);

  if (allPending.length === 0) {
    console.log('Nothing to do. Disconnecting.');
    await prisma.$disconnect();
    return;
  }

  const batches: BatchRow[][] = [];
  for (let i = 0; i < allPending.length; i += BATCH_SIZE) {
    batches.push(allPending.slice(i, i + BATCH_SIZE));
  }

  const state = { processed: 0, totalTokens: 0, batchCount: 0, nextBatch: 0 };
  const t0 = Date.now();

  async function worker(id: number): Promise<void> {
    while (true) {
      const idx = state.nextBatch++;
      if (idx >= batches.length) return;
      const rows = batches[idx];

      const tBatch = Date.now();
      const resp = await embedBatch(rows.map((r) => r.embed_input));
      const tokens = resp.meta?.billed_units?.input_tokens ?? 0;
      await persistBatch(rows, resp.embeddings.float);

      state.processed += rows.length;
      state.totalTokens += tokens;
      state.batchCount += 1;

      const elapsed = Date.now() - t0;
      const remaining = allPending.length - state.processed;
      const rate = (state.processed / elapsed) * 1000;
      const eta = (remaining / rate) * 1000;
      const cost = (state.totalTokens / 1_000_000) * PRICE_PER_MTOK;
      console.log(
        `  w${id} batch ${(idx + 1).toString().padStart(3)}/${batches.length}  ` +
          `+${rows.length} rows  [${state.processed}/${allPending.length}]  ` +
          `tokens=${tokens} (Σ=${state.totalTokens})  $${cost.toFixed(4)}  ` +
          `batch=${Date.now() - tBatch}ms  ETA=${formatDuration(eta)}`,
      );
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  console.log(`\nDone. ${state.processed} rows in ${formatDuration(Date.now() - t0)}.`);
  console.log(`Cost: $${((state.totalTokens / 1_000_000) * PRICE_PER_MTOK).toFixed(4)}.`);

  // Verify
  const final = await prisma.$queryRaw<{ remaining: bigint }[]>`
    SELECT COUNT(*)::bigint AS remaining FROM subheadings WHERE embedding IS NULL
  `;
  console.log(`Subheadings still without embedding: ${final[0].remaining}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fallback pass failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});

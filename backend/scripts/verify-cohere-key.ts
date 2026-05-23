/**
 * Verify Cohere API key works for embed-v4 at 1536-dim.
 *
 * One read-only API call. Confirms the key is valid, embed-v4 is accessible
 * on the trial tier, and the 1536-dim output config is honoured.
 *
 * Cost: ~$0.0000001 (1 dummy input, ~5 tokens).
 *
 * Run: cd backend && npx tsx scripts/verify-cohere-key.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const COHERE_API_KEY = process.env.COHERE_API_KEY;

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Cohere API key verification — embed-v4 @ 1536-dim');
  console.log('='.repeat(60));

  if (!COHERE_API_KEY || COHERE_API_KEY === 'your-cohere-api-key') {
    console.error('FAIL: COHERE_API_KEY not set in backend/.env (or still placeholder)');
    process.exit(1);
  }

  console.log(`\nKey loaded (length=${COHERE_API_KEY.length}, prefix=${COHERE_API_KEY.slice(0, 4)}...).`);

  const url = 'https://api.cohere.com/v2/embed';
  const body = {
    model: 'embed-v4.0',
    texts: ['Suspension parts and accessories of motor vehicles'],
    input_type: 'search_document',
    embedding_types: ['float'],
    output_dimension: 1536,
  };

  console.log('\nPOST', url);
  console.log('Body:', JSON.stringify({ ...body, texts: ['<sample>'] }));

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - t0;

  console.log(`\nHTTP ${res.status} ${res.statusText} (${elapsedMs}ms)`);

  const raw = await res.text();

  if (!res.ok) {
    console.error('FAIL: non-200 response.');
    console.error('Body:', raw.slice(0, 500));
    if (res.status === 401 || res.status === 403) {
      console.error('\n→ Key looks invalid. Re-check value in backend/.env.');
    } else if (res.status === 429) {
      console.error('\n→ Rate-limited. Wait a minute and retry. Trial tier limit is ~2000 inputs/min.');
    }
    process.exit(1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('FAIL: response was 200 but not JSON.');
    console.error('Body:', raw.slice(0, 500));
    process.exit(1);
  }

  const embedding: number[] | undefined = parsed?.embeddings?.float?.[0];

  if (!Array.isArray(embedding)) {
    console.error('FAIL: response shape unexpected. No embeddings.float[0] array.');
    console.error('Keys at top:', Object.keys(parsed ?? {}));
    console.error('Body slice:', raw.slice(0, 500));
    process.exit(1);
  }

  if (embedding.length !== 1536) {
    console.error(`FAIL: expected 1536-dim, got ${embedding.length}-dim.`);
    console.error('Cohere likely silently honoured a different output_dimension.');
    process.exit(1);
  }

  const norm = Math.sqrt(embedding.reduce((acc, x) => acc + x * x, 0));
  const sample = embedding.slice(0, 4).map((x) => x.toFixed(4)).join(', ');

  console.log('\nPASS — Cohere embed-v4 responding as expected.');
  console.log(`  dim:    ${embedding.length}`);
  console.log(`  norm:   ${norm.toFixed(4)} (should be ~1.0 for normalised float embeddings)`);
  console.log(`  sample: [${sample}, ...]`);
  console.log(`  meta:   ${JSON.stringify(parsed?.meta ?? {}).slice(0, 200)}`);

  console.log('\nReady to populate full corpus.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

/**
 * Empirical calibration of the MV-04 verifier embedding cosine floor.
 *
 * Background
 * ----------
 * L5 verifier rule MV-04 (layers/L5-verifier.ts) FAILs a candidate code when the
 * cosine between the L2 query embedding (Cohere embed-v4, input_type:'search_query',
 * of the SHORT L0-normalized query) and the candidate's stored
 * `tariff_lines.embedding` (a search_document embedding of a LONG hierarchy-
 * concatenated text) falls below EMBEDDING_COSINE_FLOOR.
 *
 * The original 0.55 floor was set without an empirical distribution and rejects
 * CORRECT codes: query↔document cosine for correct codes runs ~0.30-0.45 because
 * the query (short) and document (long, hierarchical) texts are asymmetric, even
 * though both vectors are correctly L2-normalized Cohere embed-v4.
 *
 * This script builds two empirical distributions over the eval gold and reports
 * the floor that best separates them:
 *   1. CORRECT distribution — cosine(query, gold expected_code embedding).
 *      These are the cosines MV-04 SHOULD pass.
 *   2. WRONG distribution    — cosine(query, a realistic-confusable wrong code) and
 *      cosine(query, an unrelated code). These approximate hallucinated /
 *      poisoned selections that MV-04 SHOULD reject.
 *
 * It DOES NOT re-embed the corpus. It embeds only the ~N gold queries via the same
 * runtime Cohere client used at retrieval time (small authorized cash spend), and
 * reads stored corpus embeddings straight from Postgres.
 *
 * Run: cd backend && npx tsx --require dotenv/config scripts/calibrate-cosine-floor.ts
 *
 * It is read-only against the DB and idempotent; safe to re-run.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { normalize } from '../src/classifier-v2/layers/L0-normalization';
import { embed } from '../src/classifier-v2/lib/cohere-client';
import { masterSuite } from '../src/eval/test-suites/master-suite';

/* ---------------------------------------------------------------------------
 * Config
 * --------------------------------------------------------------------------- */

const CANDIDATE_FLOORS = [0.15, 0.2, 0.22, 0.25, 0.28, 0.3, 0.35, 0.4, 0.45, 0.55];
const CODE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

/* ---------------------------------------------------------------------------
 * Stats helpers
 * --------------------------------------------------------------------------- */

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0] as number;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  const a = sortedAsc[lo] as number;
  const b = sortedAsc[hi] as number;
  return a + (b - a) * frac;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(4) : 'NaN';
}

/* ---------------------------------------------------------------------------
 * DB
 * --------------------------------------------------------------------------- */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Mirror the exact MV-04 SQL: 1 - (embedding <=> $vec). Returns null if no row / null embedding. */
async function cosineForCode(vec: string, code: string): Promise<number | null> {
  const sql = `
    SELECT 1 - (embedding <=> $1::vector) AS cosine
    FROM tariff_lines
    WHERE code = $2 AND embedding IS NOT NULL
    LIMIT 1
  `;
  const res = await pool.query<{ cosine: string | number | null }>(sql, [vec, code]);
  const row = res.rows[0];
  if (!row || row.cosine === null) return null;
  const c = Number(row.cosine);
  return Number.isFinite(c) ? c : null;
}

/** Pick a realistic-confusable wrong code: random sibling under a DIFFERENT heading
 *  in the SAME chapter (a near-miss the model might plausibly emit). */
async function pickSameChapterDifferentHeading(goldCode: string): Promise<string | null> {
  const chapter = goldCode.slice(0, 2);
  const heading = goldCode.replace('.', '').slice(0, 4); // NNNN
  const sql = `
    SELECT code FROM tariff_lines
    WHERE LEFT(code, 2) = $1
      AND REPLACE(LEFT(code, 4), '.', '') <> $2
      AND embedding IS NOT NULL
      AND code <> $3
    ORDER BY random()
    LIMIT 1
  `;
  const res = await pool.query<{ code: string }>(sql, [chapter, heading, goldCode]);
  return res.rows[0]?.code ?? null;
}

/** Pick a fully unrelated wrong code: random code in a DIFFERENT chapter. */
async function pickDifferentChapter(goldCode: string): Promise<string | null> {
  const chapter = goldCode.slice(0, 2);
  const sql = `
    SELECT code FROM tariff_lines
    WHERE LEFT(code, 2) <> $1
      AND embedding IS NOT NULL
    ORDER BY random()
    LIMIT 1
  `;
  const res = await pool.query<{ code: string }>(sql, [chapter]);
  return res.rows[0]?.code ?? null;
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const classifyCases = masterSuite.filter(
    (c) => c.expected_routing === 'classify' && c.expected_code && CODE_RE.test(c.expected_code),
  );

  console.log('='.repeat(80));
  console.log('MV-04 EMBEDDING COSINE FLOOR — EMPIRICAL CALIBRATION');
  console.log('='.repeat(80));
  console.log(`Gold classify cases with an 8-digit expected_code: ${classifyCases.length}`);
  console.log(
    `(of ${masterSuite.length} total; embedding the L0-normalized query via Cohere search_query)\n`,
  );

  const correctCosines: number[] = [];
  const wrongSameChapter: number[] = [];
  const wrongDiffChapter: number[] = [];

  // Per-case detail for the lowest correct cosines (diagnostic for overfitting check).
  const correctDetail: Array<{ id: string; code: string; query: string; cosine: number }> = [];

  let goldMissingEmbedding = 0;
  let i = 0;
  for (const tc of classifyCases) {
    i++;
    const goldCode = tc.expected_code as string;

    // Reproduce the runtime query text MV-04 sees: L0 normalize, then search_query embed.
    const norm = await normalize(tc.query);
    const embedText = norm.normalized_query.trim().length > 0 ? norm.normalized_query : tc.query;
    const { embedding } = await embed(embedText, { inputType: 'search_query' });
    const vec = `[${embedding.join(',')}]`;

    const cCorrect = await cosineForCode(vec, goldCode);
    if (cCorrect === null) {
      goldMissingEmbedding++;
    } else {
      correctCosines.push(cCorrect);
      correctDetail.push({ id: tc.id, code: goldCode, query: tc.query, cosine: cCorrect });
    }

    const sib = await pickSameChapterDifferentHeading(goldCode);
    if (sib) {
      const cSib = await cosineForCode(vec, sib);
      if (cSib !== null) wrongSameChapter.push(cSib);
    }

    const unrel = await pickDifferentChapter(goldCode);
    if (unrel) {
      const cUn = await cosineForCode(vec, unrel);
      if (cUn !== null) wrongDiffChapter.push(cUn);
    }

    if (i % 25 === 0) {
      process.stdout.write(`  …embedded ${i}/${classifyCases.length} queries\n`);
    }
  }

  const allWrong = [...wrongSameChapter, ...wrongDiffChapter];

  const cSorted = [...correctCosines].sort((a, b) => a - b);
  const wSorted = [...allWrong].sort((a, b) => a - b);
  const wSibSorted = [...wrongSameChapter].sort((a, b) => a - b);
  const wDiffSorted = [...wrongDiffChapter].sort((a, b) => a - b);

  console.log('\n' + '-'.repeat(80));
  console.log('CORRECT-CODE DISTRIBUTION (cosines MV-04 should PASS)');
  console.log('-'.repeat(80));
  console.log(`  n            = ${cSorted.length}  (gold rows missing embedding: ${goldMissingEmbedding})`);
  console.log(`  min          = ${fmt(cSorted[0] ?? NaN)}`);
  console.log(`  P1           = ${fmt(percentile(cSorted, 1))}`);
  console.log(`  P5           = ${fmt(percentile(cSorted, 5))}`);
  console.log(`  P10          = ${fmt(percentile(cSorted, 10))}`);
  console.log(`  P25          = ${fmt(percentile(cSorted, 25))}`);
  console.log(`  median (P50) = ${fmt(percentile(cSorted, 50))}`);
  console.log(`  mean         = ${fmt(mean(cSorted))}`);
  console.log(`  max          = ${fmt(cSorted[cSorted.length - 1] ?? NaN)}`);

  console.log('\n' + '-'.repeat(80));
  console.log('WRONG-CODE DISTRIBUTION (cosines MV-04 should ideally REJECT)');
  console.log('-'.repeat(80));
  console.log(`  n (combined) = ${wSorted.length}  (same-chapter ${wSibSorted.length} + diff-chapter ${wDiffSorted.length})`);
  console.log(`  min          = ${fmt(wSorted[0] ?? NaN)}`);
  console.log(`  median (P50) = ${fmt(percentile(wSorted, 50))}`);
  console.log(`  mean         = ${fmt(mean(wSorted))}`);
  console.log(`  P75          = ${fmt(percentile(wSorted, 75))}`);
  console.log(`  P90          = ${fmt(percentile(wSorted, 90))}`);
  console.log(`  P95          = ${fmt(percentile(wSorted, 95))}`);
  console.log(`  P99          = ${fmt(percentile(wSorted, 99))}`);
  console.log(`  max          = ${fmt(wSorted[wSorted.length - 1] ?? NaN)}`);
  console.log(`  [same-chapter] median = ${fmt(percentile(wSibSorted, 50))}  P90 = ${fmt(percentile(wSibSorted, 90))}  max = ${fmt(wSibSorted[wSibSorted.length - 1] ?? NaN)}`);
  console.log(`  [diff-chapter] median = ${fmt(percentile(wDiffSorted, 50))}  P90 = ${fmt(percentile(wDiffSorted, 90))}  max = ${fmt(wDiffSorted[wDiffSorted.length - 1] ?? NaN)}`);

  console.log('\n' + '-'.repeat(80));
  console.log('CANDIDATE-FLOOR TABLE');
  console.log('  recall (TP%)  = % of CORRECT codes that PASS (>= floor)   — want HIGH');
  console.log('  FP% (all)     = % of WRONG codes that PASS (>= floor)     — want LOW');
  console.log('  FP% (sib)     = % of same-chapter wrong that PASS');
  console.log('-'.repeat(80));
  console.log('  floor   recall   FP%(all)  FP%(sib)  FP%(diff)   correct-rejected');
  for (const floor of CANDIDATE_FLOORS) {
    const tp = cSorted.filter((x) => x >= floor).length;
    const recall = (tp / cSorted.length) * 100;
    const fpAll = (wSorted.filter((x) => x >= floor).length / wSorted.length) * 100;
    const fpSib = wSibSorted.length
      ? (wSibSorted.filter((x) => x >= floor).length / wSibSorted.length) * 100
      : NaN;
    const fpDiff = wDiffSorted.length
      ? (wDiffSorted.filter((x) => x >= floor).length / wDiffSorted.length) * 100
      : NaN;
    const rejected = cSorted.length - tp;
    console.log(
      `  ${floor.toFixed(2)}    ${recall.toFixed(1).padStart(5)}%   ${fpAll
        .toFixed(1)
        .padStart(6)}%   ${fpSib.toFixed(1).padStart(6)}%   ${fpDiff
        .toFixed(1)
        .padStart(6)}%      ${rejected}`,
    );
  }

  // Separability: simple threshold-free overlap proxy. Report how many correct
  // codes fall below the wrong-distribution median, and vice-versa.
  const wrongMedian = percentile(wSorted, 50);
  const correctMedian = percentile(cSorted, 50);
  const correctBelowWrongMedian = cSorted.filter((x) => x < wrongMedian).length;
  const wrongAboveCorrectMedian = wSorted.filter((x) => x > correctMedian).length;

  console.log('\n' + '-'.repeat(80));
  console.log('SEPARABILITY');
  console.log('-'.repeat(80));
  console.log(`  correct median = ${fmt(correctMedian)} ; wrong median = ${fmt(wrongMedian)}`);
  console.log(
    `  correct codes below wrong-median: ${correctBelowWrongMedian}/${cSorted.length} ` +
      `(${((correctBelowWrongMedian / cSorted.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  wrong codes above correct-median: ${wrongAboveCorrectMedian}/${wSorted.length} ` +
      `(${((wrongAboveCorrectMedian / wSorted.length) * 100).toFixed(1)}%)`,
  );

  // 10 lowest correct cosines (which cases a given floor would wrongly reject).
  const lowest = [...correctDetail].sort((a, b) => a.cosine - b.cosine).slice(0, 12);
  console.log('\n  12 LOWEST correct-code cosines (most at-risk of false-reject):');
  for (const d of lowest) {
    console.log(`    ${fmt(d.cosine)}  ${d.code}  ${d.id}  "${d.query.slice(0, 52)}"`);
  }

  console.log('\n' + '='.repeat(80));
  await pool.end();
}

main().catch((err) => {
  console.error('Calibration failed:', err);
  void pool.end();
  process.exit(1);
});

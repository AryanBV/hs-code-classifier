// backend/src/eval/measure-brain-chapters.ts
// Measure Brain's suggested_chapters accuracy vs chapter-router (ARY-47)
// Usage: npx tsx src/eval/measure-brain-chapters.ts [sample-size] [results-file]

// dotenv MUST load before any classifier imports (OpenAI client is created at import time)
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport, EvalDetail, EvalTestCase } from './types';
import { masterSuite } from './test-suites/master-suite';

// Dynamic import to ensure env vars are loaded first
async function loadBrain() {
  const { analyzeBrain } = await import('../classifier/brain');
  return analyzeBrain;
}

// ---------------------------------------------------------------------------
// Load eval results
// ---------------------------------------------------------------------------

const sampleSizeArg = parseInt(process.argv[2] || '50', 10);
const resultsFile = process.argv[3] || 'brain-master-2026-02-10.json';
const resultsPath = path.resolve(__dirname, '../../eval-results', resultsFile);
const report: EvalReport = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

// Build lookup: test_case_id -> masterSuite entry (for category)
const testCaseMap = new Map<string, EvalTestCase>(masterSuite.map(tc => [tc.id, tc]));

function getCat(d: EvalDetail): string {
  return testCaseMap.get(d.test_case_id)?.category || 'unknown';
}

// ---------------------------------------------------------------------------
// Get correctly-routed classify cases
// ---------------------------------------------------------------------------

const classifyCases: EvalDetail[] = report.details.filter(
  (d: EvalDetail) => d.routing_correct && d.expected_routing === 'classify' && d.expected_chapter,
);

// ---------------------------------------------------------------------------
// Stratified sampling by category
// ---------------------------------------------------------------------------

// Group by category
const byCategory = new Map<string, EvalDetail[]>();
for (const tc of classifyCases) {
  const cat = getCat(tc);
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat)!.push(tc);
}

// Deterministic pseudo-random shuffle (seeded for reproducibility)
let seed = 42;
function seededRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return seed / 2147483647;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const sampleSize = Math.min(sampleSizeArg, classifyCases.length);
const sample: EvalDetail[] = [];
const categorySamples: Record<string, number> = {};

// Calculate proportional allocation per category
const categoryAllocation: [string, number][] = [];
let allocated = 0;
const categories = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [cat, cases] of categories) {
  const catSize = Math.max(1, Math.round(cases.length / classifyCases.length * sampleSize));
  categoryAllocation.push([cat, catSize]);
  allocated += catSize;
}

// Adjust to hit exact sample size
if (allocated > sampleSize) {
  // Trim from largest categories
  let excess = allocated - sampleSize;
  for (const entry of categoryAllocation) {
    if (excess <= 0) break;
    if (entry[1] > 1) {
      entry[1]--;
      excess--;
    }
  }
} else if (allocated < sampleSize) {
  // Add to largest categories
  let deficit = sampleSize - allocated;
  for (const entry of categoryAllocation) {
    if (deficit <= 0) break;
    const cat = entry[0];
    const available = byCategory.get(cat)!.length;
    if (entry[1] < available) {
      entry[1]++;
      deficit--;
    }
  }
}

// Take stratified sample
for (const [cat, catSampleSize] of categoryAllocation) {
  const cases = byCategory.get(cat) || [];
  const shuffled = shuffle(cases);
  const taken = shuffled.slice(0, catSampleSize);
  sample.push(...taken);
  categorySamples[cat] = taken.length;
}

// Final trim (safety)
sample.splice(sampleSize);

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

interface MeasureResult {
  id: string;
  query: string;
  category: string;
  expected: string;
  suggested: string[];
  routerPicked: string;
  brainHit: boolean;
  routerHit: boolean;
}

async function measure(): Promise<void> {
  const analyzeBrain = await loadBrain();

  let brainCorrect = 0;
  let routerCorrect = 0;
  let bothCorrect = 0;
  let brainOnlyRight = 0;
  let routerOnlyRight = 0;
  let bothWrong = 0;
  let errors = 0;

  const results: MeasureResult[] = [];

  console.log(`Measuring Brain chapter accuracy on ${sample.length} cases (stratified from ${classifyCases.length})...\n`);
  console.log(`Category allocation:`);
  for (const [cat, count] of Object.entries(categorySamples).sort((a, b) => b[1] - a[1])) {
    const total = byCategory.get(cat)?.length || 0;
    console.log(`  ${cat.padEnd(15)} ${count} / ${total} cases`);
  }
  console.log('');

  for (let i = 0; i < sample.length; i++) {
    const tc = sample[i]!;
    const expected = tc.expected_chapter!;
    const cat = getCat(tc);

    try {
      const brainOutput = await analyzeBrain(tc.query);
      const suggested = brainOutput.suggested_chapters || [];
      const brainHit = suggested.includes(expected);
      const routerHit = tc.chapter_correct === true;

      if (brainHit) brainCorrect++;
      if (routerHit) routerCorrect++;
      if (brainHit && routerHit) bothCorrect++;
      if (brainHit && !routerHit) brainOnlyRight++;
      if (!brainHit && routerHit) routerOnlyRight++;
      if (!brainHit && !routerHit) bothWrong++;

      results.push({
        id: tc.test_case_id,
        query: tc.query,
        category: cat,
        expected,
        suggested,
        routerPicked: tc.actual_chapter || '??',
        brainHit,
        routerHit,
      });

      const status = brainHit ? 'BRAIN-OK  ' : 'BRAIN-MISS';
      console.log(
        `[${String(i + 1).padStart(3)}/${sample.length}] ${status} [${cat.padEnd(12)}] ${tc.test_case_id}: suggested=[${suggested}] expected=${expected}`,
      );

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors++;
      console.error(`[${String(i + 1).padStart(3)}/${sample.length}] ERROR ${tc.test_case_id}: ${err}`);
    }
  }

  const total = results.length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`BRAIN vs CHAPTER-ROUTER ACCURACY (${total} cases, ${errors} errors)`);
  console.log(`${'='.repeat(70)}\n`);

  console.log(`Brain contains expected chapter: ${brainCorrect} / ${total} (${(brainCorrect / total * 100).toFixed(1)}%)`);
  console.log(`Chapter-router picked correct:   ${routerCorrect} / ${total} (${(routerCorrect / total * 100).toFixed(1)}%)`);
  console.log(`\nOverlap matrix:`);
  console.log(`  Both correct:      ${bothCorrect}`);
  console.log(`  Brain-only right:  ${brainOnlyRight} <-- Brain recovers these from router failures`);
  console.log(`  Router-only right: ${routerOnlyRight} <-- DANGER: trusting Brain would regress these`);
  console.log(`  Both wrong:        ${bothWrong}`);

  const netGain = brainOnlyRight - routerOnlyRight;
  console.log(`\nNet gain from trusting Brain: ${brainOnlyRight} - ${routerOnlyRight} = ${netGain > 0 ? '+' : ''}${netGain} cases`);

  // ---------------------------------------------------------------------------
  // Per-category Brain accuracy
  // ---------------------------------------------------------------------------

  console.log(`\n=== PER-CATEGORY BRAIN ACCURACY ===\n`);
  const catStats: Record<string, { total: number; brainOk: number; routerOk: number; brainOnly: number; routerOnly: number }> = {};
  for (const r of results) {
    if (!catStats[r.category]) catStats[r.category] = { total: 0, brainOk: 0, routerOk: 0, brainOnly: 0, routerOnly: 0 };
    const s = catStats[r.category]!;
    s.total++;
    if (r.brainHit) s.brainOk++;
    if (r.routerHit) s.routerOk++;
    if (r.brainHit && !r.routerHit) s.brainOnly++;
    if (!r.brainHit && r.routerHit) s.routerOnly++;
  }
  console.log(`${'Category'.padEnd(15)} ${'Brain%'.padStart(7)} ${'Router%'.padStart(8)} ${'B-only'.padStart(7)} ${'R-only'.padStart(7)} ${'Cases'.padStart(6)}`);
  for (const [cat, s] of Object.entries(catStats).sort((a, b) => b[1].total - a[1].total)) {
    const bPct = (s.brainOk / s.total * 100).toFixed(0);
    const rPct = (s.routerOk / s.total * 100).toFixed(0);
    console.log(`${cat.padEnd(15)} ${(bPct + '%').padStart(7)} ${(rPct + '%').padStart(8)} ${String(s.brainOnly).padStart(7)} ${String(s.routerOnly).padStart(7)} ${String(s.total).padStart(6)}`);
  }

  // ---------------------------------------------------------------------------
  // Decision verdict
  // ---------------------------------------------------------------------------

  console.log(`\n=== DECISION MATRIX ===\n`);
  const brainPct = brainCorrect / total;
  const routerPct = routerCorrect / total;
  console.log(`Brain chapter accuracy:  ${(brainPct * 100).toFixed(1)}%`);
  console.log(`Router chapter accuracy: ${(routerPct * 100).toFixed(1)}%`);

  if (brainPct > 0.80) {
    console.log(`\nVERDICT: Brain accuracy > 80% --> TRUST Brain's chapters directly (Root Fix 1: GO)`);
  } else if (brainPct > routerPct) {
    console.log(`\nVERDICT: Brain accuracy ${(brainPct * 100).toFixed(1)}% > Router ${(routerPct * 100).toFixed(1)}% --> TRUST Brain with router validation (Root Fix 1: GO with safety)`);
  } else {
    console.log(`\nVERDICT: Brain accuracy <= Router accuracy --> DO NOT trust Brain's chapters (Root Fix 1: SKIP)`);
  }

  if (routerOnlyRight > total * 0.1) {
    console.log(`\nWARNING: ${routerOnlyRight} router-only-right cases (${(routerOnlyRight / total * 100).toFixed(0)}%). Need safety mechanism in Root Fix 1.`);
  }

  // ---------------------------------------------------------------------------
  // Detailed case lists
  // ---------------------------------------------------------------------------

  const brainOnlyCases = results.filter(r => r.brainHit && !r.routerHit);
  if (brainOnlyCases.length > 0) {
    console.log(`\n--- Brain-only-right cases (${brainOnlyCases.length}) — Brain recovers these from router failures ---`);
    for (const r of brainOnlyCases) {
      console.log(`  ${r.id} [${r.category}]: "${r.query}" | expected=${r.expected} suggested=[${r.suggested}] router=${r.routerPicked}`);
    }
  }

  const routerOnlyCases = results.filter(r => !r.brainHit && r.routerHit);
  if (routerOnlyCases.length > 0) {
    console.log(`\n--- Router-only-right cases (${routerOnlyCases.length}) — DANGER: trusting Brain would break these ---`);
    for (const r of routerOnlyCases) {
      console.log(`  ${r.id} [${r.category}]: "${r.query}" | expected=${r.expected} suggested=[${r.suggested}] router=${r.routerPicked}`);
    }
  }

  const bothWrongCases = results.filter(r => !r.brainHit && !r.routerHit);
  if (bothWrongCases.length > 0) {
    console.log(`\n--- Both-wrong cases (${bothWrongCases.length}) — Neither Brain nor router got the right chapter ---`);
    for (const r of bothWrongCases) {
      console.log(`  ${r.id} [${r.category}]: "${r.query}" | expected=${r.expected} suggested=[${r.suggested}] router=${r.routerPicked}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Save results
  // ---------------------------------------------------------------------------

  const outputPath = path.resolve(__dirname, '../../eval-results/brain-chapter-accuracy.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        metadata: {
          timestamp: new Date().toISOString(),
          sampleSize: total,
          totalClassifyCases: classifyCases.length,
          resultsFile,
          samplingMethod: 'stratified-by-category',
          categorySamples,
        },
        summary: {
          brainCorrect,
          routerCorrect,
          bothCorrect,
          brainOnlyRight,
          routerOnlyRight,
          bothWrong,
          total,
          errors,
          brainPct: (brainPct * 100).toFixed(1),
          routerPct: (routerPct * 100).toFixed(1),
          netGain,
        },
        perCategory: catStats,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved: ${outputPath}`);
}

measure().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

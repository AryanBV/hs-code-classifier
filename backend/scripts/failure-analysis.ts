// backend/scripts/failure-analysis.ts
// ARY-51: 5-bucket failure categorization for eval results
// Usage: npx tsx scripts/failure-analysis.ts [results-file]
//
// Reusable — run after any eval to see where failures concentrate.

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport, EvalDetail, EvalTestCase } from '../src/eval/types';
import { masterSuite } from '../src/eval/test-suites/master-suite';
import { normalizeHSCode } from '../src/eval/scorer';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const resultsFile = process.argv[2] || 'eval-2026-02-10.json';
const resultsPath = path.resolve(__dirname, '../eval-results', resultsFile);
const report: EvalReport = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
const details = report.details;

const testCaseMap = new Map<string, EvalTestCase>(masterSuite.map(tc => [tc.id, tc]));

function getCat(d: EvalDetail): string {
  return testCaseMap.get(d.test_case_id)?.category || 'unknown';
}

function pct(num: number, den: number): string {
  if (den === 0) return 'N/A';
  return (num / den * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// Bucket definitions
// ---------------------------------------------------------------------------

type FailureBucket =
  | 'brain_routing_wrong'
  | 'right_chapter_wrong_heading'
  | 'close_miss'
  | 'right_heading_wrong_code'
  | 'genuine_ambiguity';

const BUCKET_LABELS: Record<FailureBucket, string> = {
  brain_routing_wrong: 'Brain routing wrong',
  right_chapter_wrong_heading: 'Right chapter, wrong heading',
  close_miss: 'Close miss',
  right_heading_wrong_code: 'Right heading, wrong code',
  genuine_ambiguity: 'Genuine ambiguity',
};

interface CategorizedFailure {
  detail: EvalDetail;
  bucket: FailureBucket;
  category: string;
}

// ---------------------------------------------------------------------------
// Bucket assignment (strict waterfall — each case in exactly one bucket)
// ---------------------------------------------------------------------------

function first6Match(expected: string, actual: string): boolean {
  const e = normalizeHSCode(expected);
  const a = normalizeHSCode(actual);
  return e.substring(0, 6) === a.substring(0, 6) && e !== a;
}

function isGenuineAmbiguity(d: EvalDetail): boolean {
  const tc = testCaseMap.get(d.test_case_id);
  if (!tc) return false;
  if (tc.alternative_chapters?.includes(d.actual_chapter || '')) return true;
  if (tc.ground_truth_confidence === 'low' || tc.ground_truth_confidence === 'medium') return true;
  return false;
}

function categorizeFailure(d: EvalDetail): FailureBucket {
  // 1. Brain routing wrong: chapter is wrong
  if (!d.chapter_correct) return 'brain_routing_wrong';

  // 2. Right chapter, wrong heading
  if (!d.heading_correct) return 'right_chapter_wrong_heading';

  // Heading is correct from here. Check code-level failures.
  // 3. Close miss: first 6 normalized digits match, last 2 differ
  if (d.expected_code && d.actual_code && first6Match(d.expected_code, d.actual_code)) {
    return 'close_miss';
  }

  // 4. Genuine ambiguity: plausible alternative
  if (isGenuineAmbiguity(d)) return 'genuine_ambiguity';

  // 5. Right heading, wrong code (catch-all for remaining)
  return 'right_heading_wrong_code';
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

// Filter to code-level failures:
// - expected_routing === 'classify' and correctly routed
// - Has expected_code ground truth
// - code_correct === false
const codeFailures = details.filter(d =>
  d.expected_routing === 'classify' &&
  d.routing_correct &&
  d.expected_code &&
  !d.code_correct
);

const categorized: CategorizedFailure[] = codeFailures.map(d => ({
  detail: d,
  bucket: categorizeFailure(d),
  category: getCat(d),
}));

const classifyCasesWithCodeGT = details.filter(d =>
  d.expected_routing === 'classify' && d.routing_correct && d.expected_code
);

// ---------------------------------------------------------------------------
// Output: Summary table
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(70)}`);
console.log(`5-BUCKET FAILURE ANALYSIS — ${report.metadata.run_id}`);
console.log(`${'='.repeat(70)}\n`);

console.log(`Total code-level failures: ${codeFailures.length} / ${classifyCasesWithCodeGT.length} classify cases with code GT\n`);

const bucketOrder: FailureBucket[] = [
  'brain_routing_wrong',
  'right_chapter_wrong_heading',
  'close_miss',
  'right_heading_wrong_code',
  'genuine_ambiguity',
];

const bucketCounts: Record<FailureBucket, CategorizedFailure[]> = {
  brain_routing_wrong: [],
  right_chapter_wrong_heading: [],
  close_miss: [],
  right_heading_wrong_code: [],
  genuine_ambiguity: [],
};

for (const cf of categorized) {
  bucketCounts[cf.bucket].push(cf);
}

console.log(`| Bucket                        | Count | % of Failures | Fixable?    |`);
console.log(`|-------------------------------|-------|---------------|-------------|`);
for (const bucket of bucketOrder) {
  const count = bucketCounts[bucket].length;
  const pctVal = pct(count, codeFailures.length);
  const fixable = bucket === 'genuine_ambiguity' ? 'No' :
    bucket === 'close_miss' ? 'Partially' : 'Yes';
  console.log(`| ${BUCKET_LABELS[bucket].padEnd(29)} | ${String(count).padStart(5)} | ${(pctVal + '%').padStart(13)} | ${fixable.padEnd(11)} |`);
}

// ---------------------------------------------------------------------------
// Output: Top 3 buckets with representative examples
// ---------------------------------------------------------------------------

const sortedBuckets = bucketOrder
  .map(b => ({ bucket: b, cases: bucketCounts[b] }))
  .filter(b => b.cases.length > 0)
  .sort((a, b) => b.cases.length - a.cases.length);

console.log(`\n${'='.repeat(70)}`);
console.log(`TOP 3 BUCKETS: REPRESENTATIVE EXAMPLES`);
console.log(`${'='.repeat(70)}\n`);

for (const { bucket, cases } of sortedBuckets.slice(0, 3)) {
  console.log(`\n### ${BUCKET_LABELS[bucket]} — ${cases.length} cases\n`);

  // Pick up to 3 diverse examples (different categories if possible)
  const seen = new Set<string>();
  const examples: CategorizedFailure[] = [];
  for (const cf of cases) {
    if (examples.length >= 3) break;
    if (!seen.has(cf.category)) {
      examples.push(cf);
      seen.add(cf.category);
    }
  }
  for (const cf of cases) {
    if (examples.length >= 3) break;
    if (!examples.includes(cf)) examples.push(cf);
  }

  for (let i = 0; i < examples.length; i++) {
    const d = examples[i]!.detail;
    const cat = examples[i]!.category;
    console.log(`Example ${i + 1}: ${d.test_case_id} [${cat}] "${d.query}"`);
    console.log(`  Expected: Ch.${d.expected_chapter} -> ${d.expected_heading} -> ${d.expected_code}`);
    console.log(`  Got:      Ch.${d.actual_chapter || '??'} -> ${d.actual_heading || '????'} -> ${d.actual_code || '????????'}`);
    console.log(`  Brain output: not captured in eval data`);

    if (bucket === 'brain_routing_wrong') {
      console.log(`  Root cause: Brain routed to chapter ${d.actual_chapter} instead of ${d.expected_chapter}`);
    } else if (bucket === 'right_chapter_wrong_heading') {
      console.log(`  Root cause: Heading search (pgvector/rules) picked ${d.actual_heading} instead of ${d.expected_heading} within Ch.${d.expected_chapter}`);
    } else if (bucket === 'close_miss') {
      console.log(`  Root cause: Code selector LLM picked nearby variant ${d.actual_code} instead of ${d.expected_code} (same subheading)`);
    } else if (bucket === 'right_heading_wrong_code') {
      console.log(`  Root cause: Code selector LLM picked ${d.actual_code} instead of ${d.expected_code} under heading ${d.expected_heading}`);
    } else {
      console.log(`  Root cause: Genuinely ambiguous — multiple valid codes possible`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Output: Per-category code accuracy
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(70)}`);
console.log(`PER-CATEGORY CODE ACCURACY`);
console.log(`${'='.repeat(70)}\n`);

const perCat: Record<string, { total: number; correct: number; failures: Record<FailureBucket, number> }> = {};
for (const d of classifyCasesWithCodeGT) {
  const cat = getCat(d);
  if (!perCat[cat]) perCat[cat] = {
    total: 0, correct: 0,
    failures: { brain_routing_wrong: 0, right_chapter_wrong_heading: 0, close_miss: 0, right_heading_wrong_code: 0, genuine_ambiguity: 0 },
  };
  perCat[cat]!.total++;
  if (d.code_correct) perCat[cat]!.correct++;
}
for (const cf of categorized) {
  const entry = perCat[cf.category];
  if (entry) entry.failures[cf.bucket]++;
}

console.log(`| Category       | Cases | Code Acc | Worst Failure Bucket              |`);
console.log(`|----------------|-------|----------|-----------------------------------|`);
for (const [cat, stats] of Object.entries(perCat).sort((a, b) => b[1].total - a[1].total)) {
  const acc = pct(stats.correct, stats.total);
  const worstBucket = (Object.entries(stats.failures) as [FailureBucket, number][])
    .sort((a, b) => b[1] - a[1])[0];
  const worstLabel = worstBucket && worstBucket[1] > 0
    ? `${BUCKET_LABELS[worstBucket[0]]} (${worstBucket[1]})`
    : '—';
  console.log(`| ${cat.padEnd(14)} | ${String(stats.total).padStart(5)} | ${(acc + '%').padStart(8)} | ${worstLabel.padEnd(33)} |`);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`END 5-BUCKET ANALYSIS`);
console.log(`${'='.repeat(70)}\n`);

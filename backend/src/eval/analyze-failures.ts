// backend/src/eval/analyze-failures.ts
// Failure cascade analysis for Brain v1 eval results (ARY-47)
// Usage: npx tsx src/eval/analyze-failures.ts [results-file]

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport, EvalDetail, EvalTestCase } from './types';
import { masterSuite } from './test-suites/master-suite';

// ---------------------------------------------------------------------------
// Load eval results
// ---------------------------------------------------------------------------

const resultsFile = process.argv[2] || 'brain-master-2026-02-10.json';
const resultsPath = path.resolve(__dirname, '../../eval-results', resultsFile);
const report: EvalReport = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
const details = report.details;

// Build lookup: test_case_id -> masterSuite entry (for category, difficulty, etc.)
const testCaseMap = new Map<string, EvalTestCase>(masterSuite.map(tc => [tc.id, tc]));

function getCat(d: EvalDetail): string {
  return testCaseMap.get(d.test_case_id)?.category || 'unknown';
}

function getDiff(d: EvalDetail): string {
  return testCaseMap.get(d.test_case_id)?.difficulty || 'unknown';
}

function pct(num: number, den: number): string {
  if (den === 0) return 'N/A';
  return (num / den * 100).toFixed(1);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`FAILURE CASCADE ANALYSIS — ${report.metadata.run_id} (${details.length} cases)`);
console.log(`${'='.repeat(70)}\n`);

// ---------------------------------------------------------------------------
// DATA QUALITY CHECKS
// ---------------------------------------------------------------------------

console.log(`=== DATA QUALITY CHECKS ===\n`);

// Check: expected_chapter matches first 2 digits of expected_code
const chapterCodeMismatches = details.filter(d => {
  if (!d.expected_code || !d.expected_chapter) return false;
  const codeChapter = d.expected_code.replace(/\./g, '').substring(0, 2);
  return codeChapter !== d.expected_chapter;
});
console.log(`Chapter/code ground-truth mismatches: ${chapterCodeMismatches.length}`);
for (const d of chapterCodeMismatches) {
  const codeChapter = d.expected_code!.replace(/\./g, '').substring(0, 2);
  console.log(`  ${d.test_case_id}: expected_chapter=${d.expected_chapter} but expected_code=${d.expected_code} (chapter from code: ${codeChapter})`);
}

// Check: expected_heading matches first 4 digits of expected_code
const headingCodeMismatches = details.filter(d => {
  if (!d.expected_code || !d.expected_heading) return false;
  const codeHeading = d.expected_code.replace(/\./g, '').substring(0, 4);
  return codeHeading !== d.expected_heading;
});
console.log(`Heading/code ground-truth mismatches: ${headingCodeMismatches.length}`);
for (const d of headingCodeMismatches) {
  const codeHeading = d.expected_code!.replace(/\./g, '').substring(0, 4);
  console.log(`  ${d.test_case_id}: expected_heading=${d.expected_heading} but expected_code=${d.expected_code} (heading from code: ${codeHeading})`);
}

// Check: expected_heading first 2 digits match expected_chapter
const headingChapterMismatches = details.filter(d => {
  if (!d.expected_heading || !d.expected_chapter) return false;
  return d.expected_heading.substring(0, 2) !== d.expected_chapter;
});
console.log(`Heading/chapter ground-truth mismatches: ${headingChapterMismatches.length}`);
for (const d of headingChapterMismatches) {
  console.log(`  ${d.test_case_id}: expected_chapter=${d.expected_chapter} but expected_heading=${d.expected_heading} (chapter from heading: ${d.expected_heading!.substring(0, 2)})`);
}

const totalDQIssues = chapterCodeMismatches.length + headingCodeMismatches.length + headingChapterMismatches.length;
console.log(`\nTotal data quality issues: ${totalDQIssues}`);

// ---------------------------------------------------------------------------
// ROUTING
// ---------------------------------------------------------------------------

console.log(`\n=== ROUTING ===\n`);

const routingCorrect = details.filter(d => d.routing_correct);
const routingWrong = details.filter(d => !d.routing_correct);
const classifyAsClassify = details.filter(d => d.expected_routing === 'classify' && d.actual_routing === 'classify');
const classifyAsAsk = details.filter(d => d.expected_routing === 'classify' && d.actual_routing === 'ask');
const classifyAsReject = details.filter(d => d.expected_routing === 'classify' && (d.actual_routing === 'reject' || d.error));
const askAsAsk = details.filter(d => d.expected_routing === 'ask' && d.actual_routing === 'ask');
const askAsClassify = details.filter(d => d.expected_routing === 'ask' && d.actual_routing === 'classify');
const rejectAsAsk = details.filter(d => d.expected_routing === 'reject' && d.actual_routing === 'ask');

console.log(`Total cases:              ${details.length}`);
console.log(`Routing correct:          ${routingCorrect.length} / ${details.length} (${pct(routingCorrect.length, details.length)}%)`);
console.log(`\nRouting breakdown:`);
console.log(`  classify_as_classify:   ${classifyAsClassify.length}`);
console.log(`  classify_as_ask:        ${classifyAsAsk.length} <-- LOST ACCURACY (Brain asks when should classify)`);
console.log(`  classify_as_reject/err: ${classifyAsReject.length}`);
console.log(`  ask_as_ask:             ${askAsAsk.length}`);
console.log(`  ask_as_classify:        ${askAsClassify.length}`);
console.log(`  reject_as_ask:          ${rejectAsAsk.length}`);

// List classify_as_ask cases (free accuracy left on table)
if (classifyAsAsk.length > 0) {
  console.log(`\n--- classify_as_ask cases (${classifyAsAsk.length}) — Brain asks when should classify ---`);
  for (const d of classifyAsAsk) {
    console.log(`  ${d.test_case_id} [${getCat(d)}]: "${d.query}" (expected Ch.${d.expected_chapter})`);
  }
}

// List errors
const errorCases = details.filter(d => d.error);
if (errorCases.length > 0) {
  console.log(`\n--- Error cases (${errorCases.length}) ---`);
  for (const d of errorCases) {
    console.log(`  ${d.test_case_id}: "${d.query}" — ${d.error}`);
  }
}

// ---------------------------------------------------------------------------
// GROUND TRUTH COVERAGE
// ---------------------------------------------------------------------------

const classifyCases = details.filter(d => d.routing_correct && d.expected_routing === 'classify');
const n = classifyCases.length;

const casesWithChapterGT = classifyCases.filter(d => d.expected_chapter);
const casesWithHeadingGT = classifyCases.filter(d => d.expected_heading);
const casesWithCodeGT = classifyCases.filter(d => d.expected_code);

console.log(`\n=== GROUND TRUTH COVERAGE ===\n`);
console.log(`Correctly-routed classify cases: ${n}`);
console.log(`  With expected_chapter:  ${casesWithChapterGT.length} / ${n}`);
console.log(`  With expected_heading:  ${casesWithHeadingGT.length} / ${n} (${n - casesWithHeadingGT.length} missing → inflate heading failure counts)`);
console.log(`  With expected_code:     ${casesWithCodeGT.length} / ${n} (${n - casesWithCodeGT.length} missing → inflate code failure counts)`);

// ---------------------------------------------------------------------------
// CLASSIFICATION CASCADE
// ---------------------------------------------------------------------------

const chapterCorrectList = classifyCases.filter(d => d.chapter_correct);
const chapterWrongList = classifyCases.filter(d => !d.chapter_correct && d.expected_chapter);

// Heading: only count against cases that HAVE heading ground truth
const headingGTWithCorrectChapter = casesWithHeadingGT.filter(d => d.chapter_correct);
const headingCorrectFiltered = headingGTWithCorrectChapter.filter(d => d.heading_correct);
const headingWrongFiltered = headingGTWithCorrectChapter.filter(d => !d.heading_correct);

// Code: only count against cases that HAVE code ground truth AND heading was correct
const codeGTWithCorrectHeading = casesWithCodeGT.filter(d => d.heading_correct);
const codeCorrectFiltered = codeGTWithCorrectHeading.filter(d => d.code_correct);
const codeWrongFiltered = codeGTWithCorrectHeading.filter(d => !d.code_correct);

// Also compute unfiltered (ALL cases, matching the eval report's methodology)
const headingCorrectAll = classifyCases.filter(d => d.heading_correct);
const codeCorrectAll = classifyCases.filter(d => d.code_correct);

console.log(`\n=== CLASSIFICATION CASCADE ===\n`);
console.log(`--- Unfiltered (eval report methodology — includes cases with no ground truth) ---`);
console.log(`Chapter correct:       ${chapterCorrectList.length} / ${n} (${pct(chapterCorrectList.length, n)}%)`);
console.log(`Heading correct:       ${headingCorrectAll.length} / ${n} (${pct(headingCorrectAll.length, n)}%) ← inflated denominator`);
console.log(`Code correct:          ${codeCorrectAll.length} / ${n} (${pct(codeCorrectAll.length, n)}%) ← inflated denominator`);

console.log(`\n--- Filtered (ground-truth-available cases only — TRUE accuracy) ---`);
console.log(`Chapter correct:       ${chapterCorrectList.length} / ${casesWithChapterGT.length} (${pct(chapterCorrectList.length, casesWithChapterGT.length)}%)`);
console.log(`\nOf ${chapterCorrectList.length} correct-chapter cases WITH heading ground truth (${headingGTWithCorrectChapter.length}):`);
console.log(`  Heading correct:     ${headingCorrectFiltered.length} / ${headingGTWithCorrectChapter.length} (${pct(headingCorrectFiltered.length, headingGTWithCorrectChapter.length)}%)`);
console.log(`  Heading FAILED:      ${headingWrongFiltered.length} cases`);
console.log(`\nOf ${headingCorrectFiltered.length} correct-heading cases WITH code ground truth (${codeGTWithCorrectHeading.length}):`);
console.log(`  Code correct:        ${codeCorrectFiltered.length} / ${codeGTWithCorrectHeading.length} (${pct(codeCorrectFiltered.length, codeGTWithCorrectHeading.length)}%)`);
console.log(`  Code FAILED:         ${codeWrongFiltered.length} cases`);

// ---------------------------------------------------------------------------
// CHAPTER FAILURES
// ---------------------------------------------------------------------------

console.log(`\n=== CHAPTER FAILURES (${chapterWrongList.length} cases) ===\n`);
const chapterPatterns: Record<string, EvalDetail[]> = {};
for (const d of chapterWrongList) {
  const key = `Ch.${d.expected_chapter} -> Ch.${d.actual_chapter}`;
  if (!chapterPatterns[key]) chapterPatterns[key] = [];
  chapterPatterns[key]!.push(d);
}
const sortedChapterPatterns = Object.entries(chapterPatterns).sort((a, b) => b[1].length - a[1].length);
for (const [pattern, cases] of sortedChapterPatterns) {
  console.log(`${pattern}: ${cases.length} case(s)`);
  for (const c of cases.slice(0, 3)) {
    console.log(`    ${c.test_case_id} [${getCat(c)}] [${getDiff(c)}]: "${c.query}"`);
  }
  if (cases.length > 3) console.log(`    ... and ${cases.length - 3} more`);
}

// ---------------------------------------------------------------------------
// HEADING FAILURES (where chapter was correct, filtered to heading GT)
// ---------------------------------------------------------------------------

console.log(`\n=== HEADING FAILURES (chapter correct + heading GT, ${headingWrongFiltered.length} cases) ===\n`);
const headingPatterns: Record<string, EvalDetail[]> = {};
for (const d of headingWrongFiltered) {
  const key = `${d.expected_heading} -> ${d.actual_heading} (Ch.${d.expected_chapter})`;
  if (!headingPatterns[key]) headingPatterns[key] = [];
  headingPatterns[key]!.push(d);
}
const sortedHeadingPatterns = Object.entries(headingPatterns).sort((a, b) => b[1].length - a[1].length);
for (const [pattern, cases] of sortedHeadingPatterns.slice(0, 30)) {
  console.log(`${pattern}: ${cases.length} case(s)`);
  for (const c of cases.slice(0, 3)) {
    console.log(`    ${c.test_case_id} [${getCat(c)}]: "${c.query}"`);
  }
}

// ---------------------------------------------------------------------------
// CODE FAILURES (where heading was correct, filtered to code GT)
// ---------------------------------------------------------------------------

console.log(`\n=== CODE FAILURES (heading correct + code GT, ${codeWrongFiltered.length} cases) ===\n`);
let otherCodeCount = 0;
for (const d of codeWrongFiltered) {
  const actualNorm = (d.actual_code || '').replace(/\./g, '');
  const isOther = actualNorm.endsWith('00') || actualNorm.endsWith('90');
  if (isOther) otherCodeCount++;
  console.log(`  ${d.test_case_id} [${getCat(d)}]: "${d.query}"`);
  console.log(`    Expected: ${d.expected_code} | Got: ${d.actual_code} ${isOther ? '<-- POSSIBLE "Other"/general code' : ''}`);
}
console.log(`\n  "Other"/general code selections: ${otherCodeCount} / ${codeWrongFiltered.length} (${pct(otherCodeCount, codeWrongFiltered.length)}%)`);
if (otherCodeCount > 0) {
  console.log(`  ^^^ Code selector prompt says "prefer the more general one" — this bias causes these failures`);
}

// ---------------------------------------------------------------------------
// PER-CHAPTER ACCURACY (chapters with >= 3 cases)
// ---------------------------------------------------------------------------

console.log(`\n=== PER-CHAPTER ACCURACY (chapters with >= 3 cases) ===\n`);
const perChapter: Record<string, { correct: number; total: number }> = {};
for (const d of classifyCases) {
  const ch = d.expected_chapter || 'unknown';
  if (!perChapter[ch]) perChapter[ch] = { correct: 0, total: 0 };
  perChapter[ch]!.total++;
  if (d.chapter_correct) perChapter[ch]!.correct++;
}
const sortedChapters = Object.entries(perChapter)
  .filter(([, v]) => v.total >= 3)
  .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
for (const [ch, stats] of sortedChapters) {
  console.log(`  Ch.${ch.padStart(2, '0')}: ${String(stats.correct).padStart(3)} / ${String(stats.total).padStart(3)} (${pct(stats.correct, stats.total).padStart(5)}%)`);
}

// ---------------------------------------------------------------------------
// PER-CATEGORY ACCURACY
// ---------------------------------------------------------------------------

console.log(`\n=== PER-CATEGORY ACCURACY ===\n`);
const perCategory: Record<string, { total: number; chCorrect: number; hCorrect: number; hGT: number; cCorrect: number; cGT: number }> = {};
for (const d of classifyCases) {
  const cat = getCat(d);
  if (!perCategory[cat]) perCategory[cat] = { total: 0, chCorrect: 0, hCorrect: 0, hGT: 0, cCorrect: 0, cGT: 0 };
  const entry = perCategory[cat]!;
  entry.total++;
  if (d.chapter_correct) entry.chCorrect++;
  if (d.expected_heading) {
    entry.hGT++;
    if (d.heading_correct) entry.hCorrect++;
  }
  if (d.expected_code) {
    entry.cGT++;
    if (d.code_correct) entry.cCorrect++;
  }
}
console.log(`${'Category'.padEnd(15)} ${'Ch%'.padStart(6)} ${'H%'.padStart(8)} ${'C%'.padStart(8)} ${'Cases'.padStart(6)}`);
for (const [cat, s] of Object.entries(perCategory).sort((a, b) => b[1].total - a[1].total)) {
  const chPct = pct(s.chCorrect, s.total);
  const hPct = s.hGT > 0 ? `${pct(s.hCorrect, s.hGT)}` : 'N/A';
  const cPct = s.cGT > 0 ? `${pct(s.cCorrect, s.cGT)}` : 'N/A';
  console.log(`${cat.padEnd(15)} ${(chPct + '%').padStart(6)} ${(hPct + (s.hGT > 0 ? '%' : '')).padStart(8)} ${(cPct + (s.cGT > 0 ? '%' : '')).padStart(8)} ${String(s.total).padStart(6)}`);
}

// ---------------------------------------------------------------------------
// CONFIDENCE CALIBRATION
// ---------------------------------------------------------------------------

console.log(`\n=== CONFIDENCE CALIBRATION ===\n`);
const confBuckets = [
  { label: '0-50', min: 0, max: 50 },
  { label: '50-70', min: 50, max: 70 },
  { label: '70-90', min: 70, max: 90 },
  { label: '90-100', min: 90, max: 101 },
];
console.log(`${'Confidence'.padEnd(12)} ${'Cases'.padStart(6)} ${'Ch%'.padStart(6)} ${'H%'.padStart(6)} ${'C%'.padStart(6)}`);
for (const bucket of confBuckets) {
  const inBucket = classifyCases.filter(d => {
    const conf = d.confidence ?? 0;
    return conf >= bucket.min && conf < bucket.max;
  });
  if (inBucket.length === 0) {
    console.log(`${bucket.label.padEnd(12)} ${String(0).padStart(6)}`);
    continue;
  }
  const chOk = inBucket.filter(d => d.chapter_correct).length;
  const hOk = inBucket.filter(d => d.heading_correct).length;
  const cOk = inBucket.filter(d => d.code_correct).length;
  console.log(`${bucket.label.padEnd(12)} ${String(inBucket.length).padStart(6)} ${(pct(chOk, inBucket.length) + '%').padStart(6)} ${(pct(hOk, inBucket.length) + '%').padStart(6)} ${(pct(cOk, inBucket.length) + '%').padStart(6)}`);
}

// ---------------------------------------------------------------------------
// LOSS SUMMARY
// ---------------------------------------------------------------------------

console.log(`\n=== LOSS SUMMARY ===\n`);
const routingLosses = classifyAsAsk.length + classifyAsReject.length;
console.log(`Routing losses:       ${routingLosses} cases (${classifyAsAsk.length} classify->ask, ${classifyAsReject.length} classify->reject/err)`);
console.log(`Chapter losses:       ${chapterWrongList.length} / ${n} correctly-routed classify cases (${pct(chapterWrongList.length, n)}%)`);
console.log(`Heading losses:       ${headingWrongFiltered.length} / ${headingGTWithCorrectChapter.length} correct-chapter cases with heading GT (${pct(headingWrongFiltered.length, headingGTWithCorrectChapter.length)}%)`);
console.log(`Code losses:          ${codeWrongFiltered.length} / ${codeGTWithCorrectHeading.length} correct-heading cases with code GT (${pct(codeWrongFiltered.length, codeGTWithCorrectHeading.length)}%)`);
console.log(`\nTotal correct 8-digit (all classify):    ${codeCorrectAll.length} / ${n} (${pct(codeCorrectAll.length, n)}%)`);
console.log(`Total correct 8-digit (with code GT):    ${codeCorrectFiltered.length} / ${casesWithCodeGT.length} (${pct(codeCorrectFiltered.length, casesWithCodeGT.length)}%)`);

// ---------------------------------------------------------------------------
// ABSOLUTE COUNTS (for the cascade waterfall)
// ---------------------------------------------------------------------------

console.log(`\n=== ABSOLUTE CASCADE WATERFALL ===\n`);
console.log(`Start:                                ${details.length} total cases`);
console.log(`├─ Routing correct:                   ${routingCorrect.length} (${pct(routingCorrect.length, details.length)}%)`);
console.log(`│  └─ Of which classify:              ${n}`);
console.log(`│     ├─ Chapter correct:             ${chapterCorrectList.length} (${pct(chapterCorrectList.length, n)}%)`);
console.log(`│     │  ├─ Heading correct (w/ GT):  ${headingCorrectFiltered.length} / ${headingGTWithCorrectChapter.length} (${pct(headingCorrectFiltered.length, headingGTWithCorrectChapter.length)}%)`);
console.log(`│     │  │  └─ Code correct (w/ GT):  ${codeCorrectFiltered.length} / ${codeGTWithCorrectHeading.length} (${pct(codeCorrectFiltered.length, codeGTWithCorrectHeading.length)}%)`);
console.log(`│     │  └─ No heading GT:            ${chapterCorrectList.length - headingGTWithCorrectChapter.length} cases (cannot evaluate)`);
console.log(`│     └─ Chapter wrong:               ${chapterWrongList.length}`);
console.log(`├─ Routing wrong:                     ${routingWrong.length}`);
console.log(`│  ├─ classify->ask:                  ${classifyAsAsk.length}`);
console.log(`│  ├─ classify->reject/err:           ${classifyAsReject.length}`);
console.log(`│  └─ other misroutes:                ${routingWrong.length - classifyAsAsk.length - classifyAsReject.length}`);

console.log(`\n${'='.repeat(70)}`);
console.log(`END ANALYSIS`);
console.log(`${'='.repeat(70)}\n`);

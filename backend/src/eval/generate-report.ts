// backend/src/eval/generate-report.ts
// Assembles failure analysis report from eval results + brain chapter accuracy
// Usage: npx tsx src/eval/generate-report.ts

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport, EvalDetail, EvalTestCase } from './types';
import { masterSuite } from './test-suites/master-suite';

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const evalPath = path.resolve(__dirname, '../../eval-results/brain-master-2026-02-10.json');
const brainPath = path.resolve(__dirname, '../../eval-results/brain-chapter-accuracy.json');

const report: EvalReport = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
const brainData = JSON.parse(fs.readFileSync(brainPath, 'utf-8'));
const details = report.details;

const testCaseMap = new Map<string, EvalTestCase>(masterSuite.map(tc => [tc.id, tc]));
function getCat(d: EvalDetail): string { return testCaseMap.get(d.test_case_id)?.category || 'unknown'; }
function pct(num: number, den: number): string { return den === 0 ? 'N/A' : (num / den * 100).toFixed(1); }

// ---------------------------------------------------------------------------
// Compute all numbers
// ---------------------------------------------------------------------------

// v2 reports set `is_error: true` on per-case infra failures (Vertex/Cohere/
// Supabase transport failures, timeouts). These are NOT model decisions and
// MUST be excluded from all routing/accuracy buckets — scoring them as model
// 'reject' (the old `|| d.error` behaviour) corrupts the failure map.
//
// We use `d.is_error` as the canonical discriminator (mirrors runner.ts
// `buildReport`). Legacy v1 report records never set `is_error`, so this
// filter is a no-op for them and backward-compat is preserved.
const infraErrors = details.filter(d => d.is_error);
// Scored = non-error cases only.
const scored = details.filter(d => !d.is_error);

const classifyCases = scored.filter(d => d.routing_correct && d.expected_routing === 'classify');
const n = classifyCases.length;
const casesWithHeadingGT = classifyCases.filter(d => d.expected_heading);
const casesWithCodeGT = classifyCases.filter(d => d.expected_code);
const chCorrect = classifyCases.filter(d => d.chapter_correct);
const chWrong = classifyCases.filter(d => !d.chapter_correct && d.expected_chapter);
const hGTwithCorrectCh = casesWithHeadingGT.filter(d => d.chapter_correct);
const hCorrect = hGTwithCorrectCh.filter(d => d.heading_correct);
const hWrong = hGTwithCorrectCh.filter(d => !d.heading_correct);
const cGTwithCorrectH = casesWithCodeGT.filter(d => d.heading_correct);
const cCorrect = cGTwithCorrectH.filter(d => d.code_correct);
const cWrong = cGTwithCorrectH.filter(d => !d.code_correct);

const classifyAsAsk = scored.filter(d => d.expected_routing === 'classify' && d.actual_routing === 'ask');
// classify_as_reject: genuine model REFUSE only — infra errors are already
// excluded from `scored`, so no `|| d.error` needed (that was the old bug).
const classifyAsReject = scored.filter(d => d.expected_routing === 'classify' && d.actual_routing === 'reject');

// Chapter patterns
const chPatterns: Record<string, EvalDetail[]> = {};
for (const d of chWrong) {
  const key = `Ch.${d.expected_chapter} → Ch.${d.actual_chapter}`;
  if (!chPatterns[key]) chPatterns[key] = [];
  chPatterns[key]!.push(d);
}
const sortedChPatterns = Object.entries(chPatterns).sort((a, b) => b[1].length - a[1].length);

// Heading patterns
const hPatterns: Record<string, EvalDetail[]> = {};
for (const d of hWrong) {
  const key = `${d.expected_heading} → ${d.actual_heading} (Ch.${d.expected_chapter})`;
  if (!hPatterns[key]) hPatterns[key] = [];
  hPatterns[key]!.push(d);
}
const sortedHPatterns = Object.entries(hPatterns).sort((a, b) => b[1].length - a[1].length);

// Code failures - Other code count
let otherCodeCount = 0;
for (const d of cWrong) {
  const norm = (d.actual_code || '').replace(/\./g, '');
  if (norm.endsWith('00') || norm.endsWith('90')) otherCodeCount++;
}

// Per-category
const perCat: Record<string, { total: number; chOk: number; hGT: number; hOk: number; cGT: number; cOk: number }> = {};
for (const d of classifyCases) {
  const cat = getCat(d);
  if (!perCat[cat]) perCat[cat] = { total: 0, chOk: 0, hGT: 0, hOk: 0, cGT: 0, cOk: 0 };
  const s = perCat[cat]!;
  s.total++;
  if (d.chapter_correct) s.chOk++;
  if (d.expected_heading) { s.hGT++; if (d.heading_correct) s.hOk++; }
  if (d.expected_code) { s.cGT++; if (d.code_correct) s.cOk++; }
}

// Brain summary
const bs = brainData.summary;

// ---------------------------------------------------------------------------
// Generate markdown
// ---------------------------------------------------------------------------

const today = new Date().toISOString().split('T')[0];
const lines: string[] = [];
const w = (s: string) => lines.push(s);

w(`# Brain v1 Failure Analysis Report`);
w(`**Date:** ${today}`);
w(`**Eval run:** ${report.metadata.run_id} (${details.length} cases)`);
w(`**Scope:** Analysis of WHERE and WHY accuracy drops in the classification pipeline`);
w(``);
w(`---`);
w(``);
w(`## 1. Failure Cascade`);
w(``);
w(`### Routing`);
w(`| Metric | Count | Percentage |`);
w(`|--------|-------|------------|`);
w(`| Total cases | ${details.length} | — |`);
w(`| Infra errors (excluded from metrics) | ${infraErrors.length} | — |`);
w(`| Scored (non-error) | ${scored.length} | — |`);
w(`| Routing correct (of scored) | ${scored.filter(d => d.routing_correct).length} | ${pct(scored.filter(d => d.routing_correct).length, scored.length)}% |`);
w(`| classify → ask (lost accuracy) | ${classifyAsAsk.length} | — |`);
w(`| classify → reject (model decision) | ${classifyAsReject.length} | — |`);
w(``);
w(`### Ground Truth Coverage`);
w(`| Level | Cases with GT | Missing GT |`);
w(`|-------|---------------|------------|`);
w(`| Chapter | ${casesWithHeadingGT.length > 0 ? n : n} / ${n} | 0 |`);
w(`| Heading | ${casesWithHeadingGT.length} / ${n} | ${n - casesWithHeadingGT.length} |`);
w(`| Code | ${casesWithCodeGT.length} / ${n} | ${n - casesWithCodeGT.length} |`);
w(``);
w(`> **Critical note:** The eval report metrics (heading 35.2%, code 17.9%) are **severely deflated** because ${n - casesWithHeadingGT.length} cases lack heading/code ground truth and are counted as failures.`);
w(``);
w(`### Classification Cascade (filtered to ground-truth-available cases)`);
w(`| Stage | Correct | Denominator | Accuracy |`);
w(`|-------|---------|-------------|----------|`);
w(`| Chapter | ${chCorrect.length} | ${n} | ${pct(chCorrect.length, n)}% |`);
w(`| Heading (correct chapter + has GT) | ${hCorrect.length} | ${hGTwithCorrectCh.length} | ${pct(hCorrect.length, hGTwithCorrectCh.length)}% |`);
w(`| Code (correct heading + has GT) | ${cCorrect.length} | ${cGTwithCorrectH.length} | ${pct(cCorrect.length, cGTwithCorrectH.length)}% |`);
w(``);
w(`### Cascade Waterfall`);
w(`\`\`\``);
w(`386 total cases`);
w(`├─ 337 routing correct (87.3%)`);
w(`│  └─ 308 classify cases`);
w(`│     ├─ ${chCorrect.length} chapter correct (${pct(chCorrect.length, n)}%)`);
w(`│     │  ├─ ${hCorrect.length}/${hGTwithCorrectCh.length} heading correct with GT (${pct(hCorrect.length, hGTwithCorrectCh.length)}%)`);
w(`│     │  │  └─ ${cCorrect.length}/${cGTwithCorrectH.length} code correct with GT (${pct(cCorrect.length, cGTwithCorrectH.length)}%)`);
w(`│     │  └─ ${chCorrect.length - hGTwithCorrectCh.length} cases without heading GT (cannot evaluate)`);
w(`│     └─ ${chWrong.length} chapter wrong`);
w(`├─ 49 routing wrong`);
w(`│  ├─ ${classifyAsAsk.length} classify→ask`);
w(`│  ├─ ${classifyAsReject.length} classify→reject/error`);
w(`│  └─ 6 other misroutes`);
w(`\`\`\``);
w(``);

w(`## 2. Brain vs Chapter-Router Accuracy`);
w(``);
w(`**Sample:** ${bs.total} cases, stratified by category from ${brainData.metadata.totalClassifyCases} classify cases.`);
w(``);
w(`| Metric | Brain | Router |`);
w(`|--------|-------|--------|`);
w(`| Chapter accuracy | ${bs.brainPct}% | ${bs.routerPct}% |`);
w(`| Correct count | ${bs.brainCorrect}/${bs.total} | ${bs.routerCorrect}/${bs.total} |`);
w(``);
w(`### Overlap Matrix`);
w(`| Outcome | Count | Meaning |`);
w(`|---------|-------|---------|`);
w(`| Both correct | ${bs.bothCorrect} | Brain and router agree correctly |`);
w(`| Brain-only right | ${bs.brainOnlyRight} | **FREE WINS** — Brain recovers from router failures |`);
w(`| Router-only right | ${bs.routerOnlyRight} | **REGRESSION RISK** — trusting Brain would break these |`);
w(`| Both wrong | ${bs.bothWrong} | Neither got it right |`);
w(``);
w(`**Net gain from trusting Brain: ${bs.brainOnlyRight} - ${bs.routerOnlyRight} = +${bs.netGain} cases**`);
w(``);
w(`**Verdict: Brain accuracy ${bs.brainPct}% > 80% → TRUST Brain's chapters directly.**`);
w(``);
w(`### Brain-Only-Right Cases (${bs.brainOnlyRight} recovery opportunities)`);
w(``);

const brainOnlyCases = brainData.results.filter((r: any) => r.brainHit && !r.routerHit);
for (const r of brainOnlyCases) {
  w(`- **${r.id}** [${r.category}]: "${r.query}" — expected Ch.${r.expected}, Brain=[${r.suggested}], Router=Ch.${r.routerPicked}`);
}
w(``);
w(`### Router-Only-Right Cases (${bs.routerOnlyRight} regression risk)`);
w(``);
const routerOnlyCases = brainData.results.filter((r: any) => !r.brainHit && r.routerHit);
for (const r of routerOnlyCases) {
  w(`- **${r.id}** [${r.category}]: "${r.query}" — expected Ch.${r.expected}, Brain=[${r.suggested}], Router=Ch.${r.routerPicked}`);
}
w(``);
w(`### Per-Category Brain Accuracy`);
w(`| Category | Brain% | Router% | Brain-only | Router-only | Cases |`);
w(`|----------|--------|---------|------------|-------------|-------|`);
for (const [cat, s] of Object.entries(brainData.perCategory).sort((a: any, b: any) => b[1].total - a[1].total)) {
  const cs = s as any;
  w(`| ${cat} | ${(cs.brainOk / cs.total * 100).toFixed(0)}% | ${(cs.routerOk / cs.total * 100).toFixed(0)}% | ${cs.brainOnly} | ${cs.routerOnly} | ${cs.total} |`);
}
w(``);

w(`## 3. Chapter Failure Patterns`);
w(``);
w(`**${chWrong.length} cases** where chapter was wrong (of ${n} correctly-routed classify cases).`);
w(``);
w(`### Top Confusion Patterns`);
w(``);
for (const [pattern, cases] of sortedChPatterns.slice(0, 15)) {
  w(`**${pattern}: ${cases.length} case(s)**`);
  for (const c of cases.slice(0, 3)) {
    w(`- ${c.test_case_id} [${getCat(c)}]: "${c.query}"`);
  }
  if (cases.length > 3) w(`- ... and ${cases.length - 3} more`);
  w(``);
}

w(`### Per-Category Chapter Accuracy`);
w(`| Category | Correct | Total | Accuracy |`);
w(`|----------|---------|-------|----------|`);
for (const [cat, s] of Object.entries(perCat).sort((a, b) => b[1].total - a[1].total)) {
  w(`| ${cat} | ${s.chOk} | ${s.total} | ${pct(s.chOk, s.total)}% |`);
}
w(``);

w(`## 4. Heading Failure Patterns`);
w(``);
w(`**${hWrong.length} cases** where chapter was correct but heading was wrong (of ${hGTwithCorrectCh.length} correct-chapter cases with heading ground truth).`);
w(``);
w(`### Top Heading Confusions`);
w(``);
for (const [pattern, cases] of sortedHPatterns.slice(0, 15)) {
  w(`**${pattern}: ${cases.length} case(s)**`);
  for (const c of cases.slice(0, 3)) {
    w(`- ${c.test_case_id} [${getCat(c)}]: "${c.query}"`);
  }
  w(``);
}

w(`### Root Cause Analysis`);
w(``);
w(`The heading searcher uses **pure pgvector cosine similarity** with NO re-ranking. Candidates are returned in embedding distance order. There is no LLM-based heading selection (TODO: ARY-42). This means:`);
w(`1. Semantically similar but wrong headings outrank the correct one`);
w(`2. Headings with more general descriptions tend to match better than specific ones`);
w(`3. No chapter-notes-based heading disambiguation`);
w(``);

w(`## 5. Code Failure Patterns`);
w(``);
w(`**${cWrong.length} cases** where heading was correct but 8-digit code was wrong (of ${cGTwithCorrectH.length} correct-heading cases with code ground truth).`);
w(``);
w(`### "Other"/General Code Bias`);
w(``);
w(`**${otherCodeCount} / ${cWrong.length} code failures (${pct(otherCodeCount, cWrong.length)}%) selected a catch-all or general code** (ending in .00 or .90).`);
w(``);
w(`This is caused by the code selector prompt (code-selector.ts line 107):`);
w(`> "If uncertain between codes, **prefer the more general one**"`);
w(``);
w(`This directly biases the LLM toward "Other" and "not elsewhere specified" codes.`);
w(``);
w(`### Example Code Failures`);
w(``);
for (const d of cWrong.slice(0, 10)) {
  const norm = (d.actual_code || '').replace(/\./g, '');
  const isOther = norm.endsWith('00') || norm.endsWith('90');
  w(`- **${d.test_case_id}** [${getCat(d)}]: "${d.query}"`);
  w(`  - Expected: \`${d.expected_code}\` → Got: \`${d.actual_code}\`${isOther ? ' **← "Other" code**' : ''}`);
}
w(``);

w(`## 6. Recommended Fixes (Ranked by Impact)`);
w(``);
w(`### Fix 1: Pass Brain \`suggested_chapters\` to chapter-router`);
w(`- **Addresses:** ~${Math.round(bs.brainOnlyRight / bs.total * n)} cases (extrapolated: ${bs.brainOnlyRight}/${bs.total} sample rate × ${n} classify cases)`);
w(`- **Evidence:** Brain accuracy 88.0% vs Router 70.0%. Brain-only-right: ${bs.brainOnlyRight}, Router-only-right: ${bs.routerOnlyRight}. Net gain: +${bs.netGain} cases.`);
w(`- **Mechanism:** Add \`suggestedChapters?: string[]\` parameter to \`routeToChapter()\`. Use Brain's chapters to constrain semantic search or as prior weights.`);
w(`- **Risk:** Low (1 regression in 50 cases). Add fallback: if Brain's chapters don't match, fall back to full search.`);
w(`- **Effort:** Medium`);
w(`- **Expected impact:** Chapter accuracy from 68.2% to ~80-85%`);
w(``);
w(`### Fix 2: Fix code selector prompt — "prefer SPECIFIC" not "general"`);
w(`- **Addresses:** ${otherCodeCount} / ${cWrong.length} code failures (${pct(otherCodeCount, cWrong.length)}% of code-stage failures)`);
w(`- **Evidence:** 30.2% of code failures selected "Other"/general codes. The prompt explicitly says "prefer the more general one."`);
w(`- **Mechanism:** Change prompt rule 3 from "prefer the more general one" to "prefer the most specific code matching the product."`);
w(`- **Risk:** Low (may cause some over-specification, but HS system rewards specificity)`);
w(`- **Effort:** Low (single line change)`);
w(`- **Expected impact:** Code accuracy from 50.9% to ~60-65%`);
w(``);
w(`### Fix 3: Add LLM re-ranking to heading searcher`);
w(`- **Addresses:** ${hWrong.length} heading failures`);
w(`- **Evidence:** Heading searcher uses pure pgvector similarity with no re-ranking. Semantically similar but wrong headings outrank correct ones.`);
w(`- **Mechanism:** After pgvector returns top candidates, use LLM to re-rank based on product attributes and chapter notes.`);
w(`- **Risk:** Medium (adds latency + LLM cost per classification)`);
w(`- **Effort:** High`);
w(`- **Expected impact:** Heading accuracy from 60.3% to ~70-75%`);
w(``);
w(`### Fix 4: Switch chapter-router LLM to strict \`json_schema\``);
w(`- **Addresses:** Unknown number of cases with malformed LLM responses`);
w(`- **Evidence:** Chapter-router uses \`json_object\` (line 179 of chapter-router.ts) instead of strict \`json_schema\`. CLAUDE.md explicitly warns against this. Brain already uses \`json_schema\` correctly.`);
w(`- **Mechanism:** Change \`response_format\` from \`{ type: 'json_object' }\` to \`{ type: 'json_schema', json_schema: { ... } }\``);
w(`- **Risk:** Low`);
w(`- **Effort:** Low`);
w(`- **Expected impact:** Small but prevents silent schema violations`);
w(``);
w(`### Fix 5: Stop dropping Brain's \`industry\` and \`origin\` attributes`);
w(`- **Addresses:** Unknown (subtle context loss)`);
w(`- **Evidence:** \`brainToExtractedAttributes()\` in router.ts drops \`industry\` and \`origin\` fields because \`ExtractedAttributes\` doesn't have them. This context could help heading/code selection.`);
w(`- **Mechanism:** Add \`industry?\` and \`origin?\` to \`ExtractedAttributes\` interface, pass through pipeline.`);
w(`- **Risk:** Low`);
w(`- **Effort:** Low`);
w(`- **Expected impact:** Small (helps edge cases where industry context matters)`);
w(``);

w(`## 7. Data Gaps`);
w(``);
w(`1. **55 classify cases lack heading/code ground truth** (Session5 supplemental + some DB cases). This makes heading and code accuracy numbers unreliable for those categories. Need to add ground truth for these cases.`);
w(`2. **Brain chapter measurement is sampled** (50 of 308 cases). Full measurement would be more accurate but costs ~$0.40 for 308 API calls.`);
w(`3. **Heading candidate list not logged** in eval results. Cannot determine if the correct heading was returned by pgvector but outranked, or not returned at all. Need verbose logging in heading-searcher.`);
w(`4. **Per-stage confidence not logged.** The eval captures only the final composite confidence, not the component scores (chapter_confidence, heading_similarity, code_confidence). Need to log intermediate scores.`);
w(`5. **No A/B test data** for prompt changes. Recommendations are based on structural analysis, not controlled experiments.`);
w(``);
w(`---`);
w(`*Generated by \`generate-report.ts\` from eval results \`${report.metadata.run_id}\` and brain chapter accuracy data (${brainData.metadata.timestamp}).*`);

// ---------------------------------------------------------------------------
// Write report
// ---------------------------------------------------------------------------

const outputPath = path.resolve(__dirname, '../../eval-results/failure-analysis-brain-v1.md');
fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.log(`Report written to: ${outputPath}`);
console.log(`Total lines: ${lines.length}`);

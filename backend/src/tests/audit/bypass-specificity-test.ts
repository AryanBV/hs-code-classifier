// backend/src/tests/audit/bypass-specificity-test.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { extractAttributes } from '../../classifier/attribute-extractor';
import { routeToChapter } from '../../classifier/chapter-router';
import { findHeading } from '../../classifier/heading-searcher';
import { selectCode } from '../../classifier/code-selector';

// Import test data
import testData from '../test-data/comprehensive-test-set.json';

interface AuditResult {
  query: string;
  expectedChapter: string;
  expectedHeading: string;

  // Stage 1: Attribute Extraction
  extractedAttributes: any;
  attributeExtractionTime: number;

  // Stage 2: Chapter Routing
  routedChapter: string;
  chapterConfidence: number;
  chapterRuleUsed: string | null;
  chapterLLMFallback: boolean;
  chapterRoutingTime: number;
  chapterCorrect: boolean;

  // Stage 3: Heading Search
  foundHeading: string;
  headingSimilarity: number;
  headingCandidates: string[];
  headingSearchTime: number;
  headingCorrect: boolean;

  // Stage 4-5: Code Selection
  selectedCode: string;
  codeConfidence: number;
  codeSelectionTime: number;

  // Overall
  totalTime: number;
  error?: string;
}

async function runBypassAudit() {
  console.log('='.repeat(60));
  console.log('DIAGNOSTIC AUDIT: Bypassing Specificity Check');
  console.log('='.repeat(60));

  // Take 100 cases from Tier 1 (manually verified - most reliable ground truth)
  const tier1Cases = (testData as any).testCases
    .filter((tc: any) => tc.tier === 1)
    .slice(0, 100);

  console.log(`\nRunning ${tier1Cases.length} Tier 1 cases (bypassing Stage 0)\n`);

  const results: AuditResult[] = [];

  for (let i = 0; i < tier1Cases.length; i++) {
    const testCase = tier1Cases[i];
    const result: AuditResult = {
      query: testCase.query,
      expectedChapter: testCase.expectedChapter,
      expectedHeading: testCase.expectedHeading || testCase.expectedChapter.padEnd(4, '0'),
      extractedAttributes: null,
      attributeExtractionTime: 0,
      routedChapter: '',
      chapterConfidence: 0,
      chapterRuleUsed: null,
      chapterLLMFallback: false,
      chapterRoutingTime: 0,
      chapterCorrect: false,
      foundHeading: '',
      headingSimilarity: 0,
      headingCandidates: [],
      headingSearchTime: 0,
      headingCorrect: false,
      selectedCode: '',
      codeConfidence: 0,
      codeSelectionTime: 0,
      totalTime: 0
    };

    const totalStart = Date.now();

    try {
      // STAGE 1: Attribute Extraction (NO specificity check)
      const attrStart = Date.now();
      const attributes = await extractAttributes(testCase.query);
      result.extractedAttributes = attributes;
      result.attributeExtractionTime = Date.now() - attrStart;

      // STAGE 2: Chapter Routing
      const routeStart = Date.now();
      const chapterResult = await routeToChapter(attributes);
      result.routedChapter = chapterResult.chapter;
      result.chapterConfidence = chapterResult.confidence;
      result.chapterRuleUsed = chapterResult.rule_applied || null;
      result.chapterLLMFallback = !chapterResult.rule_applied;
      result.chapterRoutingTime = Date.now() - routeStart;
      result.chapterCorrect = chapterResult.chapter === testCase.expectedChapter;

      // STAGE 3: Heading Search
      const headingStart = Date.now();
      const headingResult = await findHeading(attributes, chapterResult.chapter);
      result.foundHeading = headingResult.heading;
      result.headingSimilarity = headingResult.similarity;
      result.headingCandidates = headingResult.candidates.map((c: any) => c.code);
      result.headingSearchTime = Date.now() - headingStart;
      result.headingCorrect = headingResult.heading === result.expectedHeading;

      // STAGE 4-5: Code Selection
      const codeStart = Date.now();
      const codeResult = await selectCode(attributes, headingResult.heading);
      result.selectedCode = codeResult.code;
      result.codeConfidence = codeResult.confidence;
      result.codeSelectionTime = Date.now() - codeStart;

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.totalTime = Date.now() - totalStart;
    results.push(result);

    // Progress indicator
    const status = result.chapterCorrect ? '\u2713' : '\u2717';
    console.log(`[${i + 1}/${tier1Cases.length}] ${status} "${testCase.query.substring(0, 40)}..." -> Ch.${result.routedChapter} (expected Ch.${testCase.expectedChapter})`);

    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Analysis
  analyzeResults(results);

  return results;
}

function analyzeResults(results: AuditResult[]) {
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT RESULTS ANALYSIS');
  console.log('='.repeat(60));

  const total = results.length;
  const chapterCorrect = results.filter(r => r.chapterCorrect).length;
  const headingCorrect = results.filter(r => r.headingCorrect).length;
  const errors = results.filter(r => r.error).length;

  // 1. Overall Accuracy (without specificity blocker)
  console.log('\n### 1. ACCURACY WITHOUT SPECIFICITY CHECK ###');
  console.log(`Chapter Accuracy: ${chapterCorrect}/${total} (${(chapterCorrect/total*100).toFixed(1)}%)`);
  console.log(`Heading Accuracy: ${headingCorrect}/${total} (${(headingCorrect/total*100).toFixed(1)}%)`);
  console.log(`Errors: ${errors}/${total}`);

  // 2. Rule vs LLM Breakdown
  const ruleUsed = results.filter(r => r.chapterRuleUsed && !r.error);
  const llmFallback = results.filter(r => r.chapterLLMFallback && !r.error);

  const ruleCorrect = ruleUsed.filter(r => r.chapterCorrect).length;
  const llmCorrect = llmFallback.filter(r => r.chapterCorrect).length;

  console.log('\n### 2. RULE vs LLM PERFORMANCE ###');
  console.log(`Rule-based routing: ${ruleUsed.length} cases`);
  console.log(`  - Correct: ${ruleCorrect}/${ruleUsed.length} (${ruleUsed.length ? (ruleCorrect/ruleUsed.length*100).toFixed(1) : 0}%)`);
  console.log(`LLM fallback routing: ${llmFallback.length} cases`);
  console.log(`  - Correct: ${llmCorrect}/${llmFallback.length} (${llmFallback.length ? (llmCorrect/llmFallback.length*100).toFixed(1) : 0}%)`);

  // 3. Which Rules Are Working/Failing
  console.log('\n### 3. RULE PERFORMANCE BREAKDOWN ###');
  const ruleStats = new Map<string, { correct: number; total: number; failures: string[] }>();

  for (const r of results) {
    if (r.chapterRuleUsed) {
      if (!ruleStats.has(r.chapterRuleUsed)) {
        ruleStats.set(r.chapterRuleUsed, { correct: 0, total: 0, failures: [] });
      }
      const stat = ruleStats.get(r.chapterRuleUsed)!;
      stat.total++;
      if (r.chapterCorrect) {
        stat.correct++;
      } else {
        stat.failures.push(`"${r.query}" -> Ch.${r.routedChapter} (expected Ch.${r.expectedChapter})`);
      }
    }
  }

  for (const [rule, stats] of ruleStats.entries()) {
    const pct = (stats.correct / stats.total * 100).toFixed(0);
    const status = stats.correct === stats.total ? '\u2713' : '\u2717';
    console.log(`${status} ${rule}: ${stats.correct}/${stats.total} (${pct}%)`);
    if (stats.failures.length > 0 && stats.failures.length <= 3) {
      stats.failures.forEach(f => console.log(`    FAIL: ${f}`));
    } else if (stats.failures.length > 3) {
      stats.failures.slice(0, 3).forEach(f => console.log(`    FAIL: ${f}`));
      console.log(`    ... and ${stats.failures.length - 3} more failures`);
    }
  }

  // 4. LLM Fallback Failures (These are chapters without rules)
  console.log('\n### 4. LLM FALLBACK FAILURES (Chapters without rules) ###');
  const llmFailures = results.filter(r => r.chapterLLMFallback && !r.chapterCorrect && !r.error);

  const failureByExpectedChapter = new Map<string, string[]>();
  for (const f of llmFailures) {
    if (!failureByExpectedChapter.has(f.expectedChapter)) {
      failureByExpectedChapter.set(f.expectedChapter, []);
    }
    failureByExpectedChapter.get(f.expectedChapter)!.push(
      `"${f.query}" -> Ch.${f.routedChapter}`
    );
  }

  const sortedChapters = [...failureByExpectedChapter.entries()]
    .sort((a, b) => b[1].length - a[1].length);

  for (const [chapter, failures] of sortedChapters.slice(0, 10)) {
    console.log(`Chapter ${chapter}: ${failures.length} failures`);
    failures.slice(0, 2).forEach(f => console.log(`    ${f}`));
    if (failures.length > 2) {
      console.log(`    ... and ${failures.length - 2} more`);
    }
  }

  // 5. Timing Analysis
  console.log('\n### 5. TIMING ANALYSIS ###');
  const avgTotal = results.reduce((sum, r) => sum + r.totalTime, 0) / total;
  const avgAttr = results.reduce((sum, r) => sum + r.attributeExtractionTime, 0) / total;
  const avgRoute = results.reduce((sum, r) => sum + r.chapterRoutingTime, 0) / total;
  const avgHeading = results.reduce((sum, r) => sum + r.headingSearchTime, 0) / total;
  const avgCode = results.reduce((sum, r) => sum + r.codeSelectionTime, 0) / total;

  console.log(`Average total time: ${avgTotal.toFixed(0)}ms`);
  console.log(`  - Attribute extraction: ${avgAttr.toFixed(0)}ms`);
  console.log(`  - Chapter routing: ${avgRoute.toFixed(0)}ms`);
  console.log(`  - Heading search: ${avgHeading.toFixed(0)}ms`);
  console.log(`  - Code selection: ${avgCode.toFixed(0)}ms`);

  // 6. Attribute Extraction Quality
  console.log('\n### 6. ATTRIBUTE EXTRACTION QUALITY ###');
  let hasForm = 0, hasMaterial = 0, hasFunction = 0, hasUse = 0;

  for (const r of results) {
    if (r.extractedAttributes) {
      if (r.extractedAttributes.form) hasForm++;
      if (r.extractedAttributes.material) hasMaterial++;
      if (r.extractedAttributes.function) hasFunction++;
      if (r.extractedAttributes.intended_use) hasUse++;
    }
  }

  console.log(`Extracted form: ${hasForm}/${total} (${(hasForm/total*100).toFixed(0)}%)`);
  console.log(`Extracted material: ${hasMaterial}/${total} (${(hasMaterial/total*100).toFixed(0)}%)`);
  console.log(`Extracted function: ${hasFunction}/${total} (${(hasFunction/total*100).toFixed(0)}%)`);
  console.log(`Extracted intended_use: ${hasUse}/${total} (${(hasUse/total*100).toFixed(0)}%)`);

  // 7. Key Questions Answered
  console.log('\n### 7. KEY DIAGNOSTIC QUESTIONS ###');
  console.log(`Q: What is accuracy WITHOUT the specificity blocker?`);
  console.log(`A: Chapter ${(chapterCorrect/total*100).toFixed(1)}%, Heading ${(headingCorrect/total*100).toFixed(1)}%`);

  console.log(`\nQ: Are hard-coded rules accurate when they fire?`);
  console.log(`A: ${ruleUsed.length ? (ruleCorrect/ruleUsed.length*100).toFixed(1) : 'N/A'}% accuracy`);

  console.log(`\nQ: Is LLM fallback working?`);
  console.log(`A: ${llmFallback.length ? (llmCorrect/llmFallback.length*100).toFixed(1) : 'N/A'}% accuracy`);

  console.log(`\nQ: Which is the bigger problem - rules or LLM?`);
  if (ruleUsed.length > 0 && llmFallback.length > 0) {
    const rulePct = ruleCorrect / ruleUsed.length;
    const llmPct = llmCorrect / llmFallback.length;
    if (rulePct > llmPct) {
      console.log(`A: LLM fallback is weaker (${(llmPct*100).toFixed(0)}% vs ${(rulePct*100).toFixed(0)}%)`);
    } else {
      console.log(`A: Rules are weaker (${(rulePct*100).toFixed(0)}% vs ${(llmPct*100).toFixed(0)}%)`);
    }
  }

  // 8. Save detailed results
  const fs = require('fs');
  const outputPath = 'src/tests/results/audit-results.json';

  // Ensure results directory exists
  const dir = require('path').dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total,
      chapterCorrect,
      headingCorrect,
      chapterAccuracy: (chapterCorrect/total*100).toFixed(1) + '%',
      headingAccuracy: (headingCorrect/total*100).toFixed(1) + '%',
      ruleBasedCount: ruleUsed.length,
      ruleBasedAccuracy: ruleUsed.length ? (ruleCorrect/ruleUsed.length*100).toFixed(1) + '%' : 'N/A',
      llmFallbackCount: llmFallback.length,
      llmFallbackAccuracy: llmFallback.length ? (llmCorrect/llmFallback.length*100).toFixed(1) + '%' : 'N/A',
      avgResponseTime: avgTotal.toFixed(0) + 'ms'
    },
    rulePerformance: Object.fromEntries(ruleStats),
    llmFailuresByChapter: Object.fromEntries(failureByExpectedChapter),
    detailedResults: results
  }, null, 2));

  console.log(`\nDetailed results saved to: ${outputPath}`);
}

// Run the audit
runBypassAudit().catch(console.error);

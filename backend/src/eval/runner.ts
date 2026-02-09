// backend/src/eval/runner.ts
//
// CRITICAL: dotenv must load BEFORE classifier import
import dotenv from 'dotenv';
dotenv.config();

import { classify } from '../classifier';
import { ClassificationResult } from '../classifier/types';
import { EvalTestCase, EvalReport, EvalDetail } from './types';
import {
  normalizeHSCode,
  determineActualRouting,
  scoreClassification,
  scoreQuestionQuality,
  buildConfusionMatrix,
} from './scorer';
import { masterSuite, validateSuite } from './test-suites/master-suite';
import { quickSuite } from './test-suites/quick-suite';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface RunConfig {
  suite: 'master' | 'quick';
  category?: string;
  runId: string;
}

function parseArgs(): RunConfig {
  const args = process.argv.slice(2);
  let suite: 'master' | 'quick' = 'master';
  let category: string | undefined;
  let runId = `eval-${new Date().toISOString().slice(0, 10)}`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--suite' && next) { suite = next as 'master' | 'quick'; i++; }
    else if (arg === '--category' && next) { category = next; i++; }
    else if (arg === '--run-id' && next) { runId = next; i++; }
  }

  return { suite, category, runId };
}

// ---------------------------------------------------------------------------
// Run a single test case
// ---------------------------------------------------------------------------

async function runTestCase(tc: EvalTestCase): Promise<EvalDetail> {
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: 30 seconds')), 30000)
    );

    const result = await Promise.race([
      classify(tc.query),
      timeoutPromise,
    ]) as ClassificationResult;

    const elapsed = Date.now() - startTime;
    const actualRouting = determineActualRouting(result);
    const routingCorrect = actualRouting === tc.expected_routing;

    // Classification result
    if (actualRouting === 'classify' && result.responseType === 'classification') {
      const actualCode = result.hsCode || '';
      const normalized = normalizeHSCode(actualCode);
      const actualChapter = normalized.substring(0, 2);
      const actualHeading = normalized.substring(0, 4);
      const scoring = scoreClassification(tc, actualCode);

      return {
        test_case_id: tc.id,
        query: tc.query,
        expected_routing: tc.expected_routing,
        actual_routing: actualRouting,
        routing_correct: routingCorrect,
        expected_chapter: tc.expected_chapter,
        actual_chapter: actualChapter,
        chapter_correct: scoring.chapterCorrect,
        expected_heading: tc.expected_heading,
        actual_heading: actualHeading,
        heading_correct: scoring.headingCorrect,
        expected_code: tc.expected_code,
        actual_code: actualCode,
        code_correct: scoring.codeCorrect,
        alternative_chapters: tc.alternative_chapters,
        alternative_match: tc.alternative_chapters?.includes(actualChapter) ?? false,
        confidence: result.confidence,
        response_time_ms: elapsed,
        score: routingCorrect ? scoring.score : 0,
      };
    }

    // Question result
    if (actualRouting === 'ask' && result.responseType === 'question') {
      const qScore = scoreQuestionQuality(
        tc.query,
        result.question || '',
        result.options?.map(o => ({ label: o.label })),
      );

      return {
        test_case_id: tc.id,
        query: tc.query,
        expected_routing: tc.expected_routing,
        actual_routing: actualRouting,
        routing_correct: routingCorrect,
        question_asked: result.question,
        question_score: qScore,
        response_time_ms: elapsed,
        score: routingCorrect ? (qScore / 2) * 100 : 0,
      };
    }

    // Unexpected routing
    return {
      test_case_id: tc.id,
      query: tc.query,
      expected_routing: tc.expected_routing,
      actual_routing: actualRouting,
      routing_correct: routingCorrect,
      response_time_ms: elapsed,
      score: 0,
    };
  } catch (err) {
    return {
      test_case_id: tc.id,
      query: tc.query,
      expected_routing: tc.expected_routing,
      actual_routing: 'reject',
      routing_correct: tc.expected_routing === 'reject',
      response_time_ms: Date.now() - startTime,
      score: 0,
      error: String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Build report from details
// ---------------------------------------------------------------------------

function buildReport(
  details: EvalDetail[],
  runId: string,
  suiteName: string,
  startTime: Date,
): EvalReport {
  const durationSeconds = Math.round((Date.now() - startTime.getTime()) / 1000);
  const errors = details.filter(d => d.error).length;

  // Routing
  const routingCorrect = details.filter(d => d.routing_correct).length;
  const confusionMatrix = buildConfusionMatrix(details);

  // Classification (only correctly-routed classify cases)
  const classifyDetails = details.filter(
    d => d.routing_correct && d.expected_routing === 'classify',
  );
  const n = classifyDetails.length || 1;
  const chapterCorrect = classifyDetails.filter(d => d.chapter_correct).length;
  const headingCorrect = classifyDetails.filter(d => d.heading_correct).length;
  const codeCorrect = classifyDetails.filter(d => d.code_correct).length;

  const chapterAcc = (chapterCorrect / n) * 100;
  const headingAcc = (headingCorrect / n) * 100;
  const codeAcc = (codeCorrect / n) * 100;
  const weighted = chapterAcc * 0.4 + headingAcc * 0.3 + codeAcc * 0.3;

  // Per-chapter breakdown
  const perChapter: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const d of classifyDetails) {
    const ch = d.expected_chapter || 'unknown';
    if (!perChapter[ch]) perChapter[ch] = { correct: 0, total: 0, accuracy: 0 };
    perChapter[ch]!.total++;
    if (d.chapter_correct) perChapter[ch]!.correct++;
  }
  for (const ch of Object.keys(perChapter)) {
    const entry = perChapter[ch]!;
    entry.accuracy = entry.total > 0 ? (entry.correct / entry.total) * 100 : 0;
  }

  // Question quality (only correctly-routed ask cases)
  const askDetails = details.filter(d => d.routing_correct && d.expected_routing === 'ask');
  const askN = askDetails.length || 1;
  const targeted = askDetails.filter(d => (d.question_score ?? 0) >= 1).length;
  const relevant = askDetails.filter(d => (d.question_score ?? 0) >= 2).length;

  return {
    metadata: {
      timestamp: startTime.toISOString(),
      run_id: runId,
      total_cases: details.length,
      duration_seconds: durationSeconds,
      model: 'gpt-4o-mini',
      notes: suiteName === 'master' ? 'Full eval suite (tier 1+2 + session5 + ask)' : `Suite: ${suiteName}`,
      errors,
      suite: suiteName,
    },
    routing: {
      accuracy: (routingCorrect / details.length) * 100,
      confusion_matrix: confusionMatrix,
    },
    classification: {
      weighted_average: weighted,
      chapter_accuracy: chapterAcc,
      heading_accuracy: headingAcc,
      code_accuracy: codeAcc,
      per_chapter_breakdown: perChapter,
    },
    question_quality: {
      targeted_pct: (targeted / askN) * 100,
      relevant_pct: (relevant / askN) * 100,
      average_score: askDetails.reduce((sum, d) => sum + (d.question_score ?? 0), 0) / askN,
    },
    details,
  };
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

function pad(n: number, width = 4): string {
  return String(n).padStart(width);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function printSummary(report: EvalReport): void {
  const { metadata, routing, classification, question_quality } = report;

  console.log(`\n=== EVAL REPORT: ${metadata.run_id} ===`);
  console.log(`Total: ${metadata.total_cases} cases | Duration: ${formatDuration(metadata.duration_seconds)} | Model: ${metadata.model}`);
  if (metadata.errors > 0) console.log(`Errors: ${metadata.errors}`);

  // Routing
  console.log(`\nROUTING`);
  console.log(`  Accuracy: ${routing.accuracy.toFixed(1)}% (${report.details.filter(d => d.routing_correct).length}/${metadata.total_cases})`);
  const cm = routing.confusion_matrix;
  console.log(`  Confusion Matrix:`);
  console.log(`                  Predicted`);
  console.log(`              Classify  Ask  Reject`);
  console.log(`  Classify    ${pad(cm.classify_as_classify)}   ${pad(cm.classify_as_ask)}   ${pad(cm.classify_as_reject)}`);
  console.log(`  Ask         ${pad(cm.ask_as_classify)}   ${pad(cm.ask_as_ask)}   ${pad(cm.ask_as_reject)}`);
  console.log(`  Reject      ${pad(cm.reject_as_classify)}   ${pad(cm.reject_as_ask)}   ${pad(cm.reject_as_reject)}`);

  // Classification
  const classifyN = report.details.filter(d => d.routing_correct && d.expected_routing === 'classify').length;
  console.log(`\nCLASSIFICATION (correctly-routed classify cases only, n=${classifyN})`);
  console.log(`  Chapter:  ${classification.chapter_accuracy.toFixed(1)}%`);
  console.log(`  Heading:  ${classification.heading_accuracy.toFixed(1)}%`);
  console.log(`  8-digit:  ${classification.code_accuracy.toFixed(1)}%`);
  console.log(`  Weighted: ${classification.weighted_average.toFixed(1)}%`);

  // Question quality
  const askN = report.details.filter(d => d.routing_correct && d.expected_routing === 'ask').length;
  console.log(`\nQUESTION QUALITY (correctly-routed ask cases only, n=${askN})`);
  console.log(`  Targeted: ${question_quality.targeted_pct.toFixed(1)}%`);
  console.log(`  Relevant: ${question_quality.relevant_pct.toFixed(1)}%`);

  // Top failures
  const failures = report.details
    .filter(d => !d.routing_correct || (d.expected_routing === 'classify' && !d.chapter_correct))
    .slice(0, 10);
  if (failures.length > 0) {
    console.log(`\nTOP FAILURES:`);
    for (const f of failures) {
      const expected = f.expected_chapter ? `Ch.${f.expected_chapter}` : f.expected_routing;
      const actual = f.actual_chapter ? `Ch.${f.actual_chapter}` : f.actual_routing;
      console.log(`  ${f.test_case_id}: "${f.query.substring(0, 50)}" -> ${actual} (expected ${expected})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = parseArgs();

  // Select suite
  let testCases: EvalTestCase[];
  if (config.suite === 'quick') {
    testCases = quickSuite;
  } else {
    validateSuite(masterSuite);
    testCases = masterSuite;
  }

  // Filter by category
  if (config.category) {
    testCases = testCases.filter(tc => tc.category === config.category);
    if (testCases.length === 0) {
      console.error(`No test cases found for category: ${config.category}`);
      process.exit(1);
    }
  }

  console.log(`Starting eval run: ${config.runId}`);
  console.log(`Suite: ${config.suite}${config.category ? ` (category: ${config.category})` : ''}`);
  console.log(`Cases: ${testCases.length}`);
  console.log('');

  const startTime = new Date();
  const details: EvalDetail[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]!;
    const progress = `[${String(i + 1).padStart(3)}/${testCases.length}]`;

    const detail = await runTestCase(tc);
    details.push(detail);

    // Progress logging
    const status = detail.error ? 'ERR '
      : !detail.routing_correct ? 'ROUT'
      : detail.chapter_correct === false ? 'FAIL'
      : 'OK  ';

    console.log(`${progress} ${status} ${tc.id}: "${tc.query.substring(0, 45)}" (${detail.response_time_ms}ms)`);

    // Rate limiting: 500ms between calls
    if (i < testCases.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const report = buildReport(details, config.runId, config.suite, startTime);
  printSummary(report);

  // Save results
  const resultsDir = path.resolve(__dirname, '../../eval-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outputPath = path.join(resultsDir, `${config.runId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

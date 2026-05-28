// backend/src/eval/runner.ts
//
// CRITICAL: dotenv must load BEFORE classifier import
import dotenv from 'dotenv';
dotenv.config();

import { classifyForEval, isSystemError } from './v2-adapter';
import type { ClassifyResult } from '../classifier-v2/types';
import { estimateCostUsd } from '../classifier-v2/cost';
import { EvalTestCase, EvalReport, EvalDetail } from './types';
import {
  normalizeHSCode,
  determineActualRouting,
  scoreClassification,
  scoreQuestionQuality,
  buildConfusionMatrix,
} from './scorer';
import { mapWithConcurrency } from './concurrency';
import { masterSuite, validateSuite } from './test-suites/master-suite';
import { quickSuite } from './test-suites/quick-suite';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Max test cases classified concurrently (bounded pool). */
const CONCURRENCY = 8;

/** Per-case wall-clock timeout (ms). */
const CASE_TIMEOUT_MS = 30000;

/**
 * APPROXIMATE flat USD cost per LLM call, used for `est_cost_usd`.
 *
 * The orchestrator surfaces only `diagnostics.llm_calls` (a count) — NOT
 * per-call token usage — so a precise per-case USD is not yet computable. We
 * derive a single representative figure from the real price table
 * (`estimateCostUsd`) using a typical Select-call token shape (large prompt:
 * chapter/section notes + ≤5 candidate rows + GIRs ≈ 8K input; ~1K output).
 * `est_cost_usd = llm_calls × this`. Order-of-magnitude only, NOT billing.
 * Re-derived from the price table on every run so it can't silently drift.
 */
const REPRESENTATIVE_CALL_USD = estimateCostUsd('gemini-3.5-flash', {
  promptTokens: 8000,
  outputTokens: 1000,
  thoughtsTokens: 0,
  totalTokens: 9000,
});

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
// v2 diagnostics → EvalDetail
// ---------------------------------------------------------------------------

/**
 * Extract the optional v2 diagnostics fields from a raw ClassifyResult into the
 * partial EvalDetail shape. `verifier_rejected_but_correct` requires knowing
 * whether the final code matched the gold, so the caller passes it in.
 */
export function extractDiagnostics(
  raw: ClassifyResult,
  codeCorrect: boolean,
): Pick<EvalDetail, 'escalation_path' | 'llm_calls' | 'est_cost_usd' | 'verifier_rejected_but_correct'> {
  const path = raw.diagnostics.escalation_path;
  const llmCalls = raw.diagnostics.llm_calls;

  // verifier rejected-then-recovered: a repair (L5:repair*) or a would-escalate
  // (L6:would_escalate) appears in the path AND the answer was ultimately correct.
  const verifierRejected = path.some(
    (p) => p.startsWith('L5:repair') || p === 'L6:would_escalate',
  );

  return {
    escalation_path: path,
    llm_calls: llmCalls,
    est_cost_usd: llmCalls * REPRESENTATIVE_CALL_USD, // APPROX — see REPRESENTATIVE_CALL_USD
    verifier_rejected_but_correct: verifierRejected && codeCorrect,
  };
}

/**
 * Build a per-case ERROR EvalDetail. Used for BOTH thrown exceptions (I1:
 * timeout / persistent Cohere/Supabase L2/L3 transport failure) and v2
 * `system_error` results (C1: persistent Vertex transport failure). An error is
 * an INFRA failure, NOT a model decision: `is_error` flags it so buildReport
 * EXCLUDES it from routing/accuracy metrics. We deliberately do NOT set
 * `actual_routing`/`routing_correct` — an error is not a model routing decision,
 * and pretending it was 'reject' (the old behavior) would corrupt the baseline.
 * Diagnostics are attached when available (system_error carries them; a thrown
 * error has none).
 */
function buildErrorDetail(
  tc: EvalTestCase,
  errorMessage: string,
  elapsed: number,
  raw?: ClassifyResult,
): EvalDetail {
  const detail: EvalDetail = {
    test_case_id: tc.id,
    query: tc.query,
    expected_routing: tc.expected_routing,
    actual_routing: 'error',
    routing_correct: false,
    response_time_ms: elapsed,
    score: 0,
    error: errorMessage,
    is_error: true,
  };
  if (raw) Object.assign(detail, extractDiagnostics(raw, false));
  return detail;
}

// ---------------------------------------------------------------------------
// Run a single test case
// ---------------------------------------------------------------------------

export async function runTestCase(tc: EvalTestCase): Promise<EvalDetail> {
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${CASE_TIMEOUT_MS / 1000} seconds`)), CASE_TIMEOUT_MS)
    );

    const { legacy: result, raw } = await Promise.race([
      classifyForEval(tc.query),
      timeoutPromise,
    ]);

    const elapsed = Date.now() - startTime;

    // C1 (CRITICAL): a system_error is a persistent INFRA failure surfaced by the
    // orchestrator, NOT a model decision. mapV2ToLegacy returns null for it, so
    // feeding it to the scorer would count it as a model 'reject' and corrupt the
    // routing baseline. Detect it BEFORE scoring and bucket it as a per-case ERROR.
    if (isSystemError(raw)) {
      const se = raw.system_error!;
      return buildErrorDetail(tc, `system_error[${se.stage}]: ${se.message}`, elapsed, raw);
    }

    const actualRouting = determineActualRouting(result);
    const routingCorrect = actualRouting === tc.expected_routing;

    // Classification result
    if (actualRouting === 'classify' && result?.responseType === 'classification') {
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
        ...extractDiagnostics(raw, scoring.codeCorrect),
      };
    }

    // Question result
    if (actualRouting === 'ask' && result?.responseType === 'question') {
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
        ...extractDiagnostics(raw, false),
      };
    }

    // Unexpected routing (incl. genuine model REFUSE → routing 'reject')
    return {
      test_case_id: tc.id,
      query: tc.query,
      expected_routing: tc.expected_routing,
      actual_routing: actualRouting,
      routing_correct: routingCorrect,
      response_time_ms: elapsed,
      score: 0,
      ...extractDiagnostics(raw, false),
    };
  } catch (err) {
    // I1 (IMPORTANT): a THROWN error (timeout, or a persistent Cohere/Supabase
    // L2/L3 transport failure — only Vertex transport becomes a system_error) is
    // an INFRA failure, tolerated and EXCLUDED from accuracy. Record it as a
    // per-case ERROR, NOT a 'reject', and NEVER abort the whole run.
    return buildErrorDetail(tc, String(err), Date.now() - startTime);
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
  const errors = details.filter(d => d.is_error).length;

  // Per-case ERRORS (infra failures: thrown exceptions + v2 system_error) are
  // EXCLUDED from ALL accuracy/routing metrics so a transient outage cannot
  // corrupt the baseline. They are counted in `errors` and reported separately.
  const scored = details.filter(d => !d.is_error);

  // Routing (over scored cases only)
  const routingCorrect = scored.filter(d => d.routing_correct).length;
  const routingDenom = scored.length || 1;
  const confusionMatrix = buildConfusionMatrix(scored);

  // Classification (only correctly-routed classify cases)
  const classifyDetails = scored.filter(
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

  // Question quality (only correctly-routed ask cases, errors excluded)
  const askDetails = scored.filter(d => d.routing_correct && d.expected_routing === 'ask');
  const askN = askDetails.length || 1;
  const targeted = askDetails.filter(d => (d.question_score ?? 0) >= 1).length;
  const relevant = askDetails.filter(d => (d.question_score ?? 0) >= 2).length;

  return {
    metadata: {
      timestamp: startTime.toISOString(),
      run_id: runId,
      total_cases: details.length,
      duration_seconds: durationSeconds,
      model: 'classifier-v2 (Gemini 3.5 Flash + Cohere)',
      notes: suiteName === 'master' ? 'Full eval suite (tier 1+2 + session5 + ask)' : `Suite: ${suiteName}`,
      errors,
      suite: suiteName,
    },
    routing: {
      // Errors excluded — denominator is scored (non-error) cases only.
      accuracy: (routingCorrect / routingDenom) * 100,
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

  const scored = report.details.filter(d => !d.is_error);
  const scoredN = scored.length;

  console.log(`\n=== EVAL REPORT: ${metadata.run_id} ===`);
  console.log(`Total: ${metadata.total_cases} cases | Duration: ${formatDuration(metadata.duration_seconds)} | Model: ${metadata.model}`);
  if (metadata.errors > 0) {
    console.log(`Errors (infra, excluded from metrics): ${metadata.errors} | Scored: ${scoredN}`);
  }

  // Routing (errors excluded from denominator)
  console.log(`\nROUTING`);
  console.log(`  Accuracy: ${routing.accuracy.toFixed(1)}% (${scored.filter(d => d.routing_correct).length}/${scoredN})`);
  const cm = routing.confusion_matrix;
  console.log(`  Confusion Matrix:`);
  console.log(`                  Predicted`);
  console.log(`              Classify  Ask  Reject`);
  console.log(`  Classify    ${pad(cm.classify_as_classify)}   ${pad(cm.classify_as_ask)}   ${pad(cm.classify_as_reject)}`);
  console.log(`  Ask         ${pad(cm.ask_as_classify)}   ${pad(cm.ask_as_ask)}   ${pad(cm.ask_as_reject)}`);
  console.log(`  Reject      ${pad(cm.reject_as_classify)}   ${pad(cm.reject_as_ask)}   ${pad(cm.reject_as_reject)}`);

  // Classification
  const classifyN = scored.filter(d => d.routing_correct && d.expected_routing === 'classify').length;
  console.log(`\nCLASSIFICATION (correctly-routed classify cases only, n=${classifyN})`);
  console.log(`  Chapter:  ${classification.chapter_accuracy.toFixed(1)}%`);
  console.log(`  Heading:  ${classification.heading_accuracy.toFixed(1)}%`);
  console.log(`  8-digit:  ${classification.code_accuracy.toFixed(1)}%`);
  console.log(`  Weighted: ${classification.weighted_average.toFixed(1)}%`);

  // Question quality
  const askN = scored.filter(d => d.routing_correct && d.expected_routing === 'ask').length;
  console.log(`\nQUESTION QUALITY (correctly-routed ask cases only, n=${askN})`);
  console.log(`  Targeted: ${question_quality.targeted_pct.toFixed(1)}%`);
  console.log(`  Relevant: ${question_quality.relevant_pct.toFixed(1)}%`);

  // Top failures (model failures only — infra errors listed separately below)
  const failures = scored
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

  // Infra errors (excluded from metrics)
  const errorDetails = report.details.filter(d => d.is_error).slice(0, 10);
  if (errorDetails.length > 0) {
    console.log(`\nERRORS (infra — excluded from accuracy):`);
    for (const e of errorDetails) {
      console.log(`  ${e.test_case_id}: "${e.query.substring(0, 50)}" -> ${e.error}`);
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
  console.log(`Cases: ${testCases.length} | Concurrency: ${CONCURRENCY}`);
  console.log('');

  const startTime = new Date();

  // Bounded-concurrency pool (N=CONCURRENCY). Results come back in INPUT ORDER
  // (mapWithConcurrency guarantees details[i] ↔ testCases[i]), so the report and
  // aggregate stay deterministic regardless of which cases finish first.
  // Per-case errors are caught INSIDE runTestCase, so the pool never aborts.
  let completed = 0;
  const details: EvalDetail[] = await mapWithConcurrency(
    testCases,
    CONCURRENCY,
    async (tc) => {
      const detail = await runTestCase(tc);

      // Progress logging — order reflects COMPLETION, not input index (expected
      // under concurrency); the saved report.details remains input-ordered.
      completed++;
      const progress = `[${String(completed).padStart(3)}/${testCases.length}]`;
      const status = detail.is_error ? 'ERR '
        : !detail.routing_correct ? 'ROUT'
        : detail.chapter_correct === false ? 'FAIL'
        : 'OK  ';
      console.log(`${progress} ${status} ${tc.id}: "${tc.query.substring(0, 45)}" (${detail.response_time_ms}ms)`);

      return detail;
    },
  );

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

// Only run the live eval when invoked directly (tsx/node entrypoint) — NOT when
// imported by a unit test, which mocks the adapter and tests helpers in isolation.
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

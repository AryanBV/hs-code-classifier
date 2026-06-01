// backend/src/eval/runner.ts
//
// CRITICAL: dotenv must load BEFORE classifier import
import dotenv from 'dotenv';
dotenv.config();

import { classifyForEval, isSystemError } from './v2-adapter';
import type { ClassifyResult } from '../classifier-v2/types';
import {
  ESCALATION_REPAIR_PREFIX,
  ESCALATION_WOULD_ESCALATE_MARKER,
} from '../classifier-v2/escalation';
import { estimateCostUsd, estimateCostUsdByModel } from '../classifier-v2/cost';
import type { TokenUsageTotals } from '../classifier-v2/lib/token-meter';
import { EvalTestCase, EvalReport, EvalDetail } from './types';
import {
  normalizeHSCode,
  determineActualRouting,
  scoreClassification,
  scoreQuestionQuality,
  buildConfusionMatrix,
} from './scorer';
import { mapWithConcurrency } from './concurrency';
import { runAnswerSimulation } from './answer-simulator';
import {
  wilsonInterval,
  brierScore,
  eceEqualMass,
  bootstrapECE,
  percentile,
  topKCodeAccuracy,
  type CalibrationSample,
  type TopKCase,
} from './metrics';
import { masterSuite, validateSuite } from './test-suites/master-suite';
import { quickSuite } from './test-suites/quick-suite';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Max test cases classified concurrently (bounded pool). */
const CONCURRENCY = 8;

/** Per-case wall-clock timeout (ms). A genuine 4x-Select repair/escalation case
 * runs ~60-75s (each L4 Select ~13-20s); 90s gives headroom without masking hangs.
 *
 * Override via `CASE_TIMEOUT_MS` env var (ms) for slow-model probes — e.g. the
 * pro-select-probe routes L4 through gemini-3.1-pro-preview at thinking_level=high,
 * where a single Select call alone can run ~40-50s and a repair iteration pushes a
 * case past the default 90s. Unset → default 90s (committed behavior unchanged). */
const CASE_TIMEOUT_MS = (() => {
  const raw = process.env.CASE_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 90000;
})();

/** Confidence threshold for the GRADED confident-wrong variant (computed, NOT a gate). */
const CONFIDENT_WRONG_TAU = 0.7;

/** Equal-mass bins for ECE (spec §2.4: ≤5). */
const ECE_BINS = 5;

/** Bootstrap resamples for the ECE CI (spec §2.4: 1000, seeded deterministically). */
const ECE_BOOTSTRAP_RESAMPLES = 1000;

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
  /**
   * OPT-IN. When true, an ASK on a case carrying a gold code triggers the
   * gold-answer simulation (answer-simulator.ts): derive the user's answer from
   * the gold tariff_line_attributes value and score the final code end-to-end.
   * Default false — when off, routing/classification metrics + report are
   * byte-for-byte unchanged (purely additive).
   */
  simulateAnswers: boolean;
  /**
   * OPT-IN targeted subset. When set, only the listed test-case ids run (after
   * suite + category selection). Lets a measurement iteration replay just the
   * wrong/regression-guard cases fast. Empty/undefined → run the full selection.
   */
  ids?: string[];
}

function parseArgs(): RunConfig {
  const args = process.argv.slice(2);
  let suite: 'master' | 'quick' = 'master';
  let category: string | undefined;
  let runId = `eval-${new Date().toISOString().slice(0, 10)}`;
  let simulateAnswers = false;
  let ids: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--suite' && next) { suite = next as 'master' | 'quick'; i++; }
    else if (arg === '--category' && next) { category = next; i++; }
    else if (arg === '--run-id' && next) { runId = next; i++; }
    else if (arg === '--simulate-answers') { simulateAnswers = true; }
    else if (arg === '--ids' && next) {
      // Comma-separated case ids → targeted subset (trimmed, empties dropped).
      ids = next.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      i++;
    }
  }

  return { suite, category, runId, simulateAnswers, ...(ids ? { ids } : {}) };
}

/**
 * Filter a test-case list down to an explicit set of ids (the `--ids` targeted
 * subset). Order follows the SUITE order, not the requested-id order, so the
 * report stays deterministic. `unknownIds` surfaces requested ids absent from the
 * (already suite/category-filtered) input so the caller can warn. Pure + additive
 * — extracted from `main` so it's unit-testable without invoking a live run.
 */
export function filterByIds(
  cases: EvalTestCase[],
  ids: string[],
): { filtered: EvalTestCase[]; unknownIds: string[] } {
  const wanted = new Set(ids);
  const filtered = cases.filter((tc) => wanted.has(tc.id));
  const found = new Set(filtered.map((tc) => tc.id));
  const unknownIds = ids.filter((id) => !found.has(id));
  return { filtered, unknownIds };
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
): Pick<
  EvalDetail,
  | 'escalation_path'
  | 'llm_calls'
  | 'est_cost_usd'
  | 'cost_is_real'
  | 'token_usage'
  | 'verifier_rejected_but_correct'
> {
  const path = raw.diagnostics.escalation_path;
  const llmCalls = raw.diagnostics.llm_calls;
  const tokenUsage = raw.diagnostics.token_usage;

  // verifier rejected-then-recovered: a repair (L5:repair*) or a would-escalate
  // (L6:would_escalate) appears in the path AND the answer was ultimately correct.
  const verifierRejected = path.some(
    (p) => p.startsWith(ESCALATION_REPAIR_PREFIX) || p === ESCALATION_WOULD_ESCALATE_MARKER,
  );

  // A3: prefer REAL per-token cost when the orchestrator surfaced token_usage —
  // sum estimateCostUsdByModel over each model's actual token sums. Fall back to
  // the flat llm_calls × REPRESENTATIVE_CALL_USD ONLY when token_usage is absent
  // (e.g. the legacy classifier, which produces no token_usage).
  let estCost: number;
  let costIsReal: boolean;
  if (tokenUsage !== undefined) {
    estCost = 0;
    for (const [model, t] of Object.entries(tokenUsage.byModel)) {
      estCost += estimateCostUsdByModel(model, {
        promptTokens: t.promptTokens,
        outputTokens: t.outputTokens,
        thoughtsTokens: t.thoughtsTokens,
        totalTokens: t.totalTokens,
      });
    }
    costIsReal = true;
  } else {
    estCost = llmCalls * REPRESENTATIVE_CALL_USD; // APPROX — see REPRESENTATIVE_CALL_USD
    costIsReal = false;
  }

  return {
    escalation_path: path,
    llm_calls: llmCalls,
    est_cost_usd: estCost,
    cost_is_real: costIsReal,
    ...(tokenUsage !== undefined ? { token_usage: tokenUsage } : {}),
    verifier_rejected_but_correct: verifierRejected && codeCorrect,
  };
}

/**
 * EVAL-ONLY (additive, behavior-neutral): the ranked candidate CODES the
 * classifier considered for a delivered classification — SELECTED CODE FIRST,
 * then the model's `alternatives_considered` (in the model's own ranking order).
 *
 * SOURCE + FIDELITY: this is the `selected_code + alternatives_considered` PROXY,
 * NOT the full L3 reranked candidate set. We deliberately do NOT enable
 * `captureTrace` to read L3's `filtered_candidates`: that set mixes 6-digit
 * subheadings with 8-digit leaves (not directly top-k-comparable to an 8-digit
 * gold code) and would require a classify()-side change to surface, whereas
 * `classification.alternatives_considered` is ALREADY on the result, is code-only
 * (select-v2.md schema pattern `^\d{4}\.\d{2}(\.\d{2})?$`, maxItems 4), and needs
 * no behavior change. Limitation: it is a LOWER bound on true retrieval top-k —
 * a gold code retrieved into L4's set but neither selected nor listed by the
 * model will not appear here. De-duplicated (selected code is dropped from the
 * tail if the model also echoed it) while preserving rank order. Returns
 * `undefined` when the result is not a delivered classification (ASK/REFUSE).
 */
export function buildCandidateCodes(raw: ClassifyResult): string[] | undefined {
  if (raw.decision !== 'CLASSIFY' || !raw.classification) return undefined;
  const c = raw.classification;
  const ranked = [c.code, ...c.alternatives_considered];
  // Stable de-dup preserving first occurrence (keeps the selected code in slot 0).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of ranked) {
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
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

export async function runTestCase(
  tc: EvalTestCase,
  simulateAnswers = false,
): Promise<EvalDetail> {
  const startTime = Date.now();

  // Per-case timeout. The timer handle is captured so it can be cleared once the
  // race settles — otherwise every fast case (the majority) would leave a live
  // 90s timer keeping the process alive long after the eval visibly finishes, and
  // the timeout promise would reject an already-settled race (unhandledRejection).
  // `.unref()` ensures a stray timer never blocks process exit on its own.
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Timeout: ${CASE_TIMEOUT_MS / 1000} seconds`)),
        CASE_TIMEOUT_MS,
      );
      timeoutHandle.unref?.();
    });

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
        // EVAL-ONLY (additive): ranked candidate codes (selected first) for top-k.
        // Spread so the key is ABSENT (not undefined) when not a classification.
        ...(() => {
          const cc = buildCandidateCodes(raw);
          return cc ? { candidate_codes: cc } : {};
        })(),
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

      const askDetail: EvalDetail = {
        test_case_id: tc.id,
        query: tc.query,
        expected_routing: tc.expected_routing,
        actual_routing: actualRouting,
        routing_correct: routingCorrect,
        // Carry the gold labels even on an ASK so a gold case the system ASKed
        // ENTERS the frozen scoring population as a miss (EVAL_DESIGN.md §1) —
        // it must NOT vanish from the denominator. chapter/heading/code_correct
        // stay UNDEFINED (the system did not deliver a code), which buildReport
        // treats as not-correct → a frozen-denominator miss.
        ...(tc.expected_chapter !== undefined ? { expected_chapter: tc.expected_chapter } : {}),
        ...(tc.expected_heading !== undefined ? { expected_heading: tc.expected_heading } : {}),
        ...(tc.expected_code !== undefined ? { expected_code: tc.expected_code } : {}),
        question_asked: result.question,
        question_score: qScore,
        response_time_ms: elapsed,
        score: routingCorrect ? (qScore / 2) * 100 : 0,
        ...extractDiagnostics(raw, false),
      };

      // OPT-IN answer simulation: when on AND this case carries a gold code,
      // derive the user's answer from the gold tariff_line_attributes value and
      // score the final code end-to-end. The routing/score/question_score base is
      // unchanged by the flag; `ask_recovery_attempt` is attached ONLY when the
      // flag is on. (Note: the ASK detail now also carries expected_* gold labels
      // regardless of the flag — required so a gold case the system ASKed enters
      // the frozen scoring population as a miss; see EVAL_DESIGN.md §1.)
      if (simulateAnswers && tc.expected_code) {
        const recovery = await runAnswerSimulation(tc.query, raw, tc.expected_code);
        const finalCode = recovery.final_code_if_classify;
        const goldNorm = normalizeHSCode(tc.expected_code);
        const finalNorm = finalCode ? normalizeHSCode(finalCode) : '';
        askDetail.ask_recovery_attempt = {
          initial_question_id: recovery.initial_question_id,
          // Which lever raised the question — surfaced from the v2 ClassifyResult.
          // Sibling-ASK tags `question.trigger='sibling'`; a triage ASK leaves it
          // absent. Populated only when present so triage cases stay byte-identical.
          ...(raw.question?.trigger ? { ask_trigger: raw.question.trigger } : {}),
          rounds_attempted: recovery.rounds_attempted,
          final_decision: recovery.final_decision,
          ...(finalCode ? { final_code_if_classify: finalCode } : {}),
          code_correct_after_recovery: recovery.code_correct_after_recovery,
          chapter_correct_after_recovery:
            finalNorm.length >= 2 && finalNorm.substring(0, 2) === goldNorm.substring(0, 2),
          heading_correct_after_recovery:
            finalNorm.length >= 4 && finalNorm.substring(0, 4) === goldNorm.substring(0, 4),
          answer_matches: recovery.answer_matches,
        };
      }

      return askDetail;
    }

    // Unexpected routing (incl. genuine model REFUSE → routing 'reject'). Carry
    // the gold labels so a gold case the system REFUSEd enters the frozen scoring
    // population as a miss (EVAL_DESIGN.md §1 — closes the REFUSE leak), and the
    // population-closure partition can see it under refused_with_gold.
    return {
      test_case_id: tc.id,
      query: tc.query,
      expected_routing: tc.expected_routing,
      actual_routing: actualRouting,
      routing_correct: routingCorrect,
      ...(tc.expected_chapter !== undefined ? { expected_chapter: tc.expected_chapter } : {}),
      ...(tc.expected_heading !== undefined ? { expected_heading: tc.expected_heading } : {}),
      ...(tc.expected_code !== undefined ? { expected_code: tc.expected_code } : {}),
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
  } finally {
    // Clear the per-case timer regardless of which side of the race won, so a
    // settled-but-still-pending timeout neither keeps the process alive nor
    // rejects an already-resolved promise (unhandledRejection).
    if (timeoutHandle) clearTimeout(timeoutHandle);
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

  // -------------------------------------------------------------------------
  // FROZEN scoring population (EVAL_DESIGN.md §1): every non-error case carrying
  // a gold code, INDEPENDENT of routing. A gold case routed to ASK/REFUSE counts
  // as a miss — it is NOT dropped. THIS is the primary, gateable accuracy.
  // -------------------------------------------------------------------------
  const goldCases = scored.filter(d => d.expected_code !== undefined);
  const goldN = goldCases.length;
  const primaryChapterK = goldCases.filter(d => d.chapter_correct === true).length;
  const primaryHeadingK = goldCases.filter(d => d.heading_correct === true).length;
  const primaryCodeK = goldCases.filter(d => d.code_correct === true).length;

  // -------------------------------------------------------------------------
  // EVAL-ONLY top-k code accuracy (additive; NOT a gate). Over the SAME frozen
  // gold-code population: is the gold code among the first k candidate codes
  // (selected first + alternatives_considered)? A gold case that ASKed/REFUSEd
  // carries no candidate_codes → empty list → a top-k miss kept in the denom.
  // Omitted entirely when there are no gold cases (goldN === 0) so an all-ASK /
  // all-error run's report stays byte-for-byte unchanged.
  // -------------------------------------------------------------------------
  const topKCases: TopKCase[] = goldCases.map(d => ({
    goldCode: d.expected_code as string,
    candidateCodes: d.candidate_codes ?? [],
  }));

  // Conditional precision (the OLD numbers) — kept ONLY as a labeled diagnostic.
  const conditionalN = classifyDetails.length;

  // -------------------------------------------------------------------------
  // confident-wrong (§3): system delivered a CLASSIFICATION and the code was
  // wrong. Answered set = cases the system classified (actual_routing classify).
  // -------------------------------------------------------------------------
  const answered = scored.filter(d => d.actual_routing === 'classify');
  const confidentWrongDetails = answered.filter(d => d.code_correct === false);
  const confidentWrongIds = confidentWrongDetails.map(d => d.test_case_id);

  // Graded τ=0.7 variant (computed only). Restrict to answered cases carrying a
  // confidence; undefined when none do.
  const answeredWithConf = answered.filter(d => typeof d.confidence === 'number');
  const gradedAnswered = answeredWithConf.filter(d => (d.confidence ?? 0) >= CONFIDENT_WRONG_TAU);
  const gradedWrong = gradedAnswered.filter(d => d.code_correct === false);

  // -------------------------------------------------------------------------
  // Calibration (§4): over classify cases carrying a confidence + binary correct.
  // -------------------------------------------------------------------------
  const calibrationSamples: CalibrationSample[] = answered
    .filter(d => typeof d.confidence === 'number' && typeof d.code_correct === 'boolean')
    .map(d => ({ confidence: d.confidence as number, correct: d.code_correct as boolean }));

  // -------------------------------------------------------------------------
  // Latency (§7) + cost roll-up. response_time_ms is on every scored case.
  // -------------------------------------------------------------------------
  const latencies = scored.map(d => d.response_time_ms);
  const estTotalUsd = scored.reduce((s, d) => s + (d.est_cost_usd ?? 0), 0);

  // A3 token roll-up. Sum REAL token usage across scored cases that carried it.
  // `is_order_of_magnitude` is true iff ANY scored case fell back to the flat
  // per-call estimate (cost_is_real !== true) — then the total mixes real + est.
  const tokenScored = scored.filter(
    (d): d is EvalDetail & { token_usage: TokenUsageTotals } => d.token_usage !== undefined,
  );
  const anyFlatFallback = scored.some(d => d.cost_is_real !== true);
  const tokenTotals = tokenScored.length > 0
    ? tokenScored.reduce(
        (acc, d) => {
          acc.prompt_tokens += d.token_usage.promptTokens;
          acc.output_tokens += d.token_usage.outputTokens;
          acc.thoughts_tokens += d.token_usage.thoughtsTokens;
          acc.cached_tokens += d.token_usage.cachedTokens;
          acc.total_tokens += d.token_usage.totalTokens;
          acc.llm_calls += d.token_usage.llmCalls;
          acc.cases_with_token_usage += 1;
          return acc;
        },
        {
          prompt_tokens: 0,
          output_tokens: 0,
          thoughts_tokens: 0,
          cached_tokens: 0,
          total_tokens: 0,
          llm_calls: 0,
          cases_with_token_usage: 0,
        },
      )
    : undefined;

  // -------------------------------------------------------------------------
  // POPULATION CLOSURE (§2): partition the frozen gold population by routing so
  // the EFFECTIVE denominator can never silently leak a REFUSE/missing case.
  // -------------------------------------------------------------------------
  // Each partition counted by a POSITIVE membership predicate (FIX-2) — NOT as a
  // complement/remainder. This makes the sum-check a genuine validation: a gold
  // case whose routing matches NONE of the four predicates is silently
  // mis-bucketed, the sum is < goldN, and the assertion FIRES (instead of a
  // catch-all remainder absorbing it and masking the leak).
  const directClassifyN = goldCases.filter(d => d.actual_routing === 'classify').length;
  const askCasesN = goldCases.filter(
    d => d.actual_routing === 'ask' && d.ask_recovery_attempt !== undefined,
  ).length;
  const refusedWithGoldN = goldCases.filter(d => d.actual_routing === 'reject').length;
  // POSITIVE predicate: ASK without a simulation attempt (e.g. flag-off). A miss
  // kept in the denominator — NOT a catch-all for arbitrary routings.
  const askedNotSimulatedN = goldCases.filter(
    d => d.actual_routing === 'ask' && d.ask_recovery_attempt === undefined,
  ).length;
  const closed =
    directClassifyN + askCasesN + refusedWithGoldN + askedNotSimulatedN === goldN;

  if (!closed) {
    throw new Error(
      `buildReport: population closure FAILED — gold-code cases must partition exactly. ` +
        `direct_classify(${directClassifyN}) + ask_cases(${askCasesN}) + ` +
        `refused_with_gold(${refusedWithGoldN}) + asked_not_simulated(${askedNotSimulatedN}) ` +
        `!== scored_with_gold(${goldN}). The EFFECTIVE denominator is untrustworthy; aborting.`,
    );
  }

  // End-to-end metrics (ONLY present when --simulate-answers ran: detected by the
  // presence of at least one ask_recovery_attempt). Purely additive — when absent
  // the report is byte-for-byte identical to the baseline. The EFFECTIVE accuracy
  // uses the frozen goldN denominator (passed in) so the REFUSE leak is closed.
  const endToEnd = buildEndToEndMetrics(scored, goldCases);

  return {
    metadata: {
      timestamp: startTime.toISOString(),
      run_id: runId,
      total_cases: details.length,
      duration_seconds: durationSeconds,
      model: 'classifier-v2 (Vertex gemini-embedding-001 + Gemini-Flash reranker)',
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
    primary_accuracy: {
      gold_code_cases: goldN,
      chapter: wilsonInterval(primaryChapterK, goldN),
      heading: wilsonInterval(primaryHeadingK, goldN),
      code: wilsonInterval(primaryCodeK, goldN),
    },
    // EVAL-ONLY top-k (additive). Spread so the key is ABSENT (not undefined) on a
    // run with no gold cases — keeps the serialized report shape unchanged there.
    ...(goldN > 0
      ? {
          top_k_code_accuracy: {
            gold_code_cases: goldN,
            top_1: topKCodeAccuracy(topKCases, 1),
            top_3: topKCodeAccuracy(topKCases, 3),
          },
        }
      : {}),
    precision_when_classifying: {
      n: conditionalN,
      chapter: wilsonInterval(chapterCorrect, conditionalN),
      heading: wilsonInterval(headingCorrect, conditionalN),
      code: wilsonInterval(codeCorrect, conditionalN),
    },
    confident_wrong: {
      answered_count: answered.length,
      count: confidentWrongDetails.length,
      rate: wilsonInterval(confidentWrongDetails.length, answered.length),
      case_ids: confidentWrongIds,
      ...(answeredWithConf.length > 0
        ? {
            graded_tau_0_7: {
              threshold: CONFIDENT_WRONG_TAU,
              answered_count: gradedAnswered.length,
              count: gradedWrong.length,
              rate: wilsonInterval(gradedWrong.length, gradedAnswered.length),
              case_ids: gradedWrong.map(d => d.test_case_id),
            },
          }
        : {}),
    },
    ...(calibrationSamples.length > 0
      ? {
          calibration: (() => {
            const ece = eceEqualMass(calibrationSamples, ECE_BINS);
            const ci = bootstrapECE(calibrationSamples, ECE_BINS, ECE_BOOTSTRAP_RESAMPLES);
            return {
              sample_count: calibrationSamples.length,
              brier_score: brierScore(calibrationSamples),
              ece: ece.ece,
              ece_ci: { lower: ci.lower, upper: ci.upper, resamples: ci.resamples },
              bins_requested: ECE_BINS,
              reliability_bins: ece.bins,
            };
          })(),
        }
      : {}),
    latency: {
      median_ms: percentile(latencies, 50),
      p95_ms: percentile(latencies, 95),
      sample_count: latencies.length,
    },
    cost: {
      est_total_usd: estTotalUsd,
      // Real per-token total iff EVERY scored case carried token_usage (no flat
      // fallback was mixed in); order-of-magnitude otherwise.
      is_order_of_magnitude: anyFlatFallback,
      ...(tokenTotals !== undefined ? { token_totals: tokenTotals } : {}),
    },
    population_closure: {
      scored_with_gold: goldN,
      direct_classify: directClassifyN,
      ask_cases: askCasesN,
      refused_with_gold: refusedWithGoldN,
      asked_not_simulated: askedNotSimulatedN,
      closed,
    },
    question_quality: {
      targeted_pct: (targeted / askN) * 100,
      relevant_pct: (relevant / askN) * 100,
      average_score: askDetails.reduce((sum, d) => sum + (d.question_score ?? 0), 0) / askN,
    },
    // Spread so the key is ABSENT (not `undefined`) on a baseline run — keeps the
    // serialized report byte-for-byte identical when --simulate-answers is off.
    ...(endToEnd ? { end_to_end_metrics: endToEnd } : {}),
    details,
  };
}

/**
 * Compute end-to-end metrics across scored (non-error) details. Returns
 * `undefined` when NO detail carries an `ask_recovery_attempt` (i.e. the eval ran
 * without --simulate-answers) so the report stays byte-for-byte unchanged.
 *
 * Denominator (`scored_with_gold`): every scored case that carries a gold code —
 * direct classify cases AND cases the system ASKed (which gold-classify cases
 * triggered the simulation on). A correct end-to-end outcome is either a direct
 * classify with the right code OR an ASK recovered to the right code after the
 * gold answer. This is the honest "if the user answers, do we reach the code?"
 * accuracy that the baseline routing/classification metrics cannot see.
 */
function buildEndToEndMetrics(
  scored: EvalDetail[],
  goldCases: EvalDetail[],
): NonNullable<EvalReport['end_to_end_metrics']> | undefined {
  const recovered = scored.filter(d => d.ask_recovery_attempt !== undefined);
  if (recovered.length === 0) return undefined;

  // Direct classify cases (system actually classified) carrying a gold code.
  const directClassify = scored.filter(
    d => d.actual_routing === 'classify' && d.expected_code !== undefined,
  );
  const classifyDirectCorrect = directClassify.filter(d => d.code_correct).length;
  const classifyDirectChapter = directClassify.filter(d => d.chapter_correct).length;
  const classifyDirectHeading = directClassify.filter(d => d.heading_correct).length;

  // ASK-recovery cases (always carry a gold code — the runner only simulates then).
  const askCaseCount = recovered.length;
  const askRecoveredCorrect = recovered.filter(
    d => d.ask_recovery_attempt!.code_correct_after_recovery,
  ).length;
  const askRecoveredChapter = recovered.filter(
    d => d.ask_recovery_attempt!.chapter_correct_after_recovery,
  ).length;
  const askRecoveredHeading = recovered.filter(
    d => d.ask_recovery_attempt!.heading_correct_after_recovery,
  ).length;
  const askUnanswerable = recovered.filter(
    d => d.ask_recovery_attempt!.final_decision === 'UNANSWERABLE',
  ).length;
  const refusedAfterAsk = recovered.filter(
    d => d.ask_recovery_attempt!.final_decision === 'REFUSE',
  ).length;
  const askRoundsTotal = recovered.reduce(
    (sum, d) => sum + d.ask_recovery_attempt!.rounds_attempted, 0,
  );

  // SIBLING-ASK lever sub-metrics — the subset of recovery cases whose initial
  // question was raised by the sibling lever (ask_trigger==='sibling'). With the
  // lever OFF (default), NO case carries that trigger → count 0, rate 0.
  const siblingAskCases = recovered.filter(
    d => d.ask_recovery_attempt!.ask_trigger === 'sibling',
  );
  const siblingAskCount = siblingAskCases.length;
  const siblingAskRecoveredCorrect = siblingAskCases.filter(
    d => d.ask_recovery_attempt!.code_correct_after_recovery,
  ).length;

  // LEGACY (recovered-only) denominator — kept for backward compatibility.
  const scoredWithGold = directClassify.length + askCaseCount;
  const denom = scoredWithGold || 1;

  // EFFECTIVE accuracy (§2): CONSTANT denominator = ALL non-error gold cases (the
  // same frozen population as primary_accuracy). outright-correct (a direct
  // classify whose code matched) + ASK-recovered-correct, over goldN. Anything
  // else — REFUSE, asked-not-simulated, ASK-unrecovered, classify-wrong — stays a
  // miss in the denominator (this is what closes the REFUSE leak).
  const effectiveDenom = goldCases.length;
  const effChapterK = classifyDirectChapter + askRecoveredChapter;
  const effHeadingK = classifyDirectHeading + askRecoveredHeading;
  const effCodeK = classifyDirectCorrect + askRecoveredCorrect;

  return {
    ask_case_count: askCaseCount,
    ask_recovered_correct: askRecoveredCorrect,
    ask_recoverability_rate: askCaseCount > 0 ? (askRecoveredCorrect / askCaseCount) * 100 : 0,
    ask_recovery_avg_rounds: askCaseCount > 0 ? askRoundsTotal / askCaseCount : 0,
    ask_unanswerable: askUnanswerable,
    classify_direct_correct: classifyDirectCorrect,
    scored_with_gold: scoredWithGold,
    end_to_end_chapter_accuracy: ((classifyDirectChapter + askRecoveredChapter) / denom) * 100,
    end_to_end_heading_accuracy: ((classifyDirectHeading + askRecoveredHeading) / denom) * 100,
    end_to_end_code_accuracy: ((classifyDirectCorrect + askRecoveredCorrect) / denom) * 100,
    effective_chapter: wilsonInterval(effChapterK, effectiveDenom),
    effective_heading: wilsonInterval(effHeadingK, effectiveDenom),
    effective_code: wilsonInterval(effCodeK, effectiveDenom),
    ask_recovery_ci: wilsonInterval(askRecoveredCorrect, askCaseCount),
    refused_after_ask: refusedAfterAsk,
    sibling_ask_count: siblingAskCount,
    sibling_ask_recovered_correct: siblingAskRecoveredCorrect,
    sibling_ask_recoverability_rate:
      siblingAskCount > 0 ? (siblingAskRecoveredCorrect / siblingAskCount) * 100 : 0,
  };
}

/** Test-only re-export: build a report from synthetic details (skips metadata). */
export function buildReportForTest(details: EvalDetail[]): EvalReport {
  return buildReport(details, 'test', 'quick', new Date());
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

/** Format a RateCI as "62.3% [57.7,66.9] (k/n)". */
function fmtCI(ci: { rate: number; lower: number; upper: number; k: number; n: number }): string {
  const pct = (x: number): string => (x * 100).toFixed(1);
  return `${pct(ci.rate)}% [${pct(ci.lower)},${pct(ci.upper)}] (${ci.k}/${ci.n})`;
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

  // PRIMARY accuracy (FROZEN denominator — the number we gate on).
  const pa = report.primary_accuracy;
  console.log(`\nPRIMARY ACCURACY (FROZEN denom = all ${pa.gold_code_cases} gold-code cases, routing-independent — GATE ON THIS)`);
  console.log(`  Chapter:  ${fmtCI(pa.chapter)}`);
  console.log(`  Heading:  ${fmtCI(pa.heading)}`);
  console.log(`  8-digit:  ${fmtCI(pa.code)}`);

  // EVAL-ONLY top-k (additive; NOT a gate) — selected + alternatives_considered PROXY.
  const tk = report.top_k_code_accuracy;
  if (tk) {
    console.log(`\nTOP-K 8-DIGIT (EVAL-ONLY, frozen denom = ${tk.gold_code_cases}; selected+alternatives PROXY — NOT a gate)`);
    console.log(`  top-1:  ${fmtCI(tk.top_1)}`);
    console.log(`  top-3:  ${fmtCI(tk.top_3)}`);
  }

  // Secondary diagnostic — the OLD routing-conditional precision (dilutable).
  const pwc = report.precision_when_classifying;
  console.log(`\nprecision_when_classifying (SECONDARY DIAGNOSTIC, conditional n=${pwc.n} — do NOT gate)`);
  console.log(`  Chapter:  ${fmtCI(pwc.chapter)}  Heading: ${fmtCI(pwc.heading)}  8-digit: ${fmtCI(pwc.code)}`);

  // confident-wrong (headline harm metric).
  const cw = report.confident_wrong;
  console.log(`\nCONFIDENT-WRONG (delivered classification + wrong code; answered set n=${cw.answered_count})`);
  console.log(`  Count: ${cw.count}  Rate: ${fmtCI(cw.rate)}`);
  if (cw.case_ids.length > 0) console.log(`  Case IDs (MANUAL REVIEW each): ${cw.case_ids.join(', ')}`);
  if (cw.graded_tau_0_7) {
    console.log(`  Graded τ=0.7 (computed, not a gate): ${cw.graded_tau_0_7.count}/${cw.graded_tau_0_7.answered_count}`);
  }

  // Calibration.
  const cal = report.calibration;
  if (cal) {
    console.log(`\nCALIBRATION (n=${cal.sample_count})`);
    console.log(`  Brier: ${cal.brier_score.toFixed(4)}  ECE: ${cal.ece.toFixed(4)} [${cal.ece_ci.lower.toFixed(4)},${cal.ece_ci.upper.toFixed(4)}] (${cal.ece_ci.resamples} boot)`);
  }

  // Latency + cost.
  console.log(`\nLATENCY / COST (n=${report.latency.sample_count})`);
  console.log(`  Median: ${report.latency.median_ms}ms  p95: ${report.latency.p95_ms}ms`);
  const costQual = report.cost.is_order_of_magnitude
    ? 'ORDER-OF-MAGNITUDE — some cases used the flat per-call estimate'
    : 'REAL per-token cost (A3 token meter)';
  console.log(`  Est total cost: $${report.cost.est_total_usd.toFixed(4)} (${costQual})`);
  const tt = report.cost.token_totals;
  if (tt) {
    console.log(
      `  Tokens (real, ${tt.cases_with_token_usage} cases / ${tt.llm_calls} LLM calls): ` +
        `prompt ${tt.prompt_tokens} | output ${tt.output_tokens} | thoughts ${tt.thoughts_tokens} | ` +
        `cached ${tt.cached_tokens} | total ${tt.total_tokens}`,
    );
  }

  // Population closure (trust-spine invariant).
  const pc = report.population_closure;
  console.log(`\nPOPULATION CLOSURE: ${pc.closed ? 'OK' : 'FAILED'} — ${pc.direct_classify} classify + ${pc.ask_cases} ask + ${pc.refused_with_gold} refuse + ${pc.asked_not_simulated} not-simulated = ${pc.scored_with_gold} gold cases`);

  // Classification (legacy view — kept for backward comparison).
  const classifyN = scored.filter(d => d.routing_correct && d.expected_routing === 'classify').length;
  console.log(`\nCLASSIFICATION (LEGACY view — correctly-routed classify cases only, n=${classifyN})`);
  console.log(`  Chapter:  ${classification.chapter_accuracy.toFixed(1)}%`);
  console.log(`  Heading:  ${classification.heading_accuracy.toFixed(1)}%`);
  console.log(`  8-digit:  ${classification.code_accuracy.toFixed(1)}%`);
  console.log(`  Weighted: ${classification.weighted_average.toFixed(1)}%`);

  // Question quality
  const askN = scored.filter(d => d.routing_correct && d.expected_routing === 'ask').length;
  console.log(`\nQUESTION QUALITY (correctly-routed ask cases only, n=${askN})`);
  console.log(`  Targeted: ${question_quality.targeted_pct.toFixed(1)}%`);
  console.log(`  Relevant: ${question_quality.relevant_pct.toFixed(1)}%`);

  // End-to-end (only when --simulate-answers ran — otherwise omitted entirely)
  const e2e = report.end_to_end_metrics;
  if (e2e) {
    console.log(`\nEND-TO-END (--simulate-answers: gold answer fed back on ASK)`);
    console.log(`  ASK recoverability: ${e2e.ask_recoverability_rate.toFixed(1)}% (${e2e.ask_recovered_correct}/${e2e.ask_case_count} ASK cases reached the correct code)`);
    console.log(`  ASK avg rounds: ${e2e.ask_recovery_avg_rounds.toFixed(2)} | unanswerable: ${e2e.ask_unanswerable}`);
    console.log(`  ASK-recovery (k/n, Wilson CI): ${fmtCI(e2e.ask_recovery_ci)}${e2e.ask_recovery_ci.n < 30 ? '  [n<30 — do NOT gate]' : ''}`);
    console.log(`  EFFECTIVE accuracy (outright + recovered, CONSTANT denom = all gold cases — SECONDARY/UX bar):`);
    console.log(`    Chapter:  ${fmtCI(e2e.effective_chapter)}`);
    console.log(`    Heading:  ${fmtCI(e2e.effective_heading)}`);
    console.log(`    8-digit:  ${fmtCI(e2e.effective_code)}`);
    console.log(`  [legacy recovered-only-denom n=${e2e.scored_with_gold}: chapter ${e2e.end_to_end_chapter_accuracy.toFixed(1)}% / heading ${e2e.end_to_end_heading_accuracy.toFixed(1)}% / 8-digit ${e2e.end_to_end_code_accuracy.toFixed(1)}%]`);
    if (e2e.sibling_ask_count > 0) {
      console.log(`  SIBLING-ASK lever: ${e2e.sibling_ask_recoverability_rate.toFixed(1)}% recoverable (${e2e.sibling_ask_recovered_correct}/${e2e.sibling_ask_count} sibling-ASK cases reached the correct code)`);
    }
  }

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

  // Filter by explicit case ids (targeted subset for fast measurement iterations).
  if (config.ids) {
    const { filtered, unknownIds } = filterByIds(testCases, config.ids);
    if (unknownIds.length > 0) {
      console.warn(`Warning: --ids requested ${unknownIds.length} unknown case id(s): ${unknownIds.join(', ')}`);
    }
    if (filtered.length === 0) {
      console.error(`No test cases matched --ids: ${config.ids.join(', ')}`);
      process.exit(1);
    }
    testCases = filtered;
  }

  console.log(`Starting eval run: ${config.runId}`);
  console.log(`Suite: ${config.suite}${config.category ? ` (category: ${config.category})` : ''}${config.ids ? ` (ids: ${testCases.length}/${config.ids.length} matched)` : ''}`);
  console.log(`Cases: ${testCases.length} | Concurrency: ${CONCURRENCY}${config.simulateAnswers ? ' | answer-simulation: ON' : ''}`);
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
      const detail = await runTestCase(tc, config.simulateAnswers);

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

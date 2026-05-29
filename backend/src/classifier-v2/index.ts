/**
 * Phase 4 v2 classifier entry point — the ORCHESTRATOR.
 *
 * This module's SOLE responsibility is to SEQUENCE the pipeline layers and map
 * the final layer output to a `ClassifyResult`. No layer logic lives here — each
 * layer (L0..L5) is imported and called with an input constructed strictly per
 * the `types.ts` contract; the canonical PASS → CLASSIFY mapping is delegated to
 * `selectToClassifyResult`.
 *
 * Architecture: backend/docs/ARCHITECTURE.md §2 (8-layer pipeline overview),
 * §3 (per-layer I/O contract). Phase 4.2a plan: this is Task 6 (CLASSIFY happy
 * path). The repair loop (Task 7), single-shot backtrack (Task 8), ASK (Task 9),
 * REFUSE + error handling (Task 10) and continueWithAnswer multi-turn (Task 11)
 * are NOT implemented here — the structure leaves clearly-marked slots for them.
 */
import { normalize } from './layers/L0-normalization';
import { triage } from './layers/L1-triage';
import { retrieve } from './layers/L2-retrieval';
import { rulesFilter } from './layers/L3-rules-filter';
import { select } from './layers/L4-select';
import { verify } from './layers/L5-verifier';
import { selectQGSBatch } from './layers/QGS-generator';
import { selectToClassifyResult, buildDiagnostics } from './select-to-result';
import { BaselineEscalation, ESCALATION_REPAIR_PREFIX } from './escalation';
import { MaxTokensError } from './lib/vertex-client';
import { LlmOutputValidationError } from './schemas';
import type {
  ChapterCode,
  ClarifyingQuestion,
  ClarifyingQuestionBatch,
  ClassifyResult,
  L4Input,
  L5Input,
  NormalizedInput,
  PipelineRunState,
  PipelineSystemError,
  PipelineTraceEvent,
  RulesFilterInput,
  SelectOutput,
  TriageInput,
  TriageOutput,
  VerifierRuleFailure,
} from './types';

/** Default Q-budget per the v2 lock (sub-spec 02 §B.5). */
const DEFAULT_Q_BUDGET = 3;

export interface ClassifyOptions {
  /** Multi-turn replay — populated on rounds 2+ per triage-v2.md (Task 11). */
  previousAnswers?: Record<string, string>;
  /** Override the clarifying-question budget. Defaults to {@link DEFAULT_Q_BUDGET}. */
  q_budget?: number;
  /**
   * When true, attach the full `state.trace` (every layer event + payload) to
   * `result.diagnostics.trace` before returning. For debug/CLI use only.
   * Has ZERO effect on prod behavior when unset — the field is absent entirely.
   */
  captureTrace?: boolean;
}

/* ---------------------------------------------------------------------------
 * Trace seam helpers
 * --------------------------------------------------------------------------- */

/**
 * When `captureTrace` is true, clone the result and attach the full trace
 * snapshot to `diagnostics.trace`. This is the ONLY place trace is attached —
 * every return path in classify() routes through this helper so prod code
 * (captureTrace unset) is never touched. The field is absent from the object
 * entirely when captureTrace is false/undefined.
 */
function finalize(
  result: ClassifyResult,
  state: PipelineRunState,
  captureTrace: boolean,
): ClassifyResult {
  if (!captureTrace) return result;
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      trace: [...state.trace],
    },
  };
}

/* ---------------------------------------------------------------------------
 * State helpers
 * --------------------------------------------------------------------------- */

/** Record a layer hop into the run state (escalation_path + trace event). */
function recordLayer(
  state: PipelineRunState,
  layer: PipelineTraceEvent['layer'],
  event: string,
  payload?: Record<string, unknown>,
): void {
  state.escalation_path.push(layer);
  const traceEvent: PipelineTraceEvent = {
    layer,
    t_ms: state.started_at !== undefined ? Date.now() - state.started_at : 0,
    event,
  };
  if (payload !== undefined) traceEvent.payload = payload;
  state.trace.push(traceEvent);
}

/** Derive the 2-digit chapter from a 6- or 8-digit ITC-HS code. */
function chapterOf(code: string): ChapterCode {
  return code.slice(0, 2);
}

/**
 * Build the L1 FALLBACK single-question from a triage ASK output.
 *
 * Synthesizes a stable `question_id` from the discriminating_attribute so the
 * API surface is consistent across calls. This is the candidate-UNAWARE fallback
 * used when the candidate-aware QGS yields nothing (genuinely indistinguishable
 * set, no usable TLA rows, etc.).
 *
 * @throws if the triage output arrives with a null clarifying_question despite
 *   decision==='ASK' (incoherent triage — the L1 cross-field guard should
 *   prevent this) rather than emitting an ASK with an empty question.
 */
function buildFallbackQuestion(t: TriageOutput): ClarifyingQuestion {
  const cq = t.clarifying_question;
  if (cq === null) {
    // Should be unreachable: L1 cross-field guard enforces ASK ⇒ non-null.
    throw new Error(
      'classifier-v2: Triage returned ASK with null clarifying_question (incoherent triage output).',
    );
  }
  return {
    question_id: `ask_${cq.discriminating_attribute}`,
    question_text: cq.fallback_question_text,
    discriminating_attribute: cq.discriminating_attribute,
    options: cq.fallback_options,
    qgs_used: false,
  };
}

/**
 * Why the candidate-aware QGS did not produce a batch, so the L1-fallback trace
 * can distinguish the cause (observability only — behavior is identical):
 *   - `qgs_error` — `selectQGSBatch` (or L2/L3 before it) THREW (e.g. retrieval /
 *     embedding error). The ASK is preserved via the L1 fallback regardless.
 *   - `qgs_null`  — QGS returned `null` (genuinely indistinguishable set, no usable
 *     TLA rows, or <2 survivors). A normal "no question" outcome, not an error.
 */
type QgsFallbackReason = 'qgs_error' | 'qgs_null';

/**
 * Map a TriageOutput with decision:'ASK' to a ClassifyResult with decision:'ASK'.
 *
 * When a candidate-aware QGS `batch` is supplied, the result surfaces BOTH the
 * full `questions` batch AND `question` = `batch.questions[0]` (the highest
 * info-gain question) for single-question consumers. With no batch, it falls
 * back to the L1 single fallback question and records `fallbackReason` on the
 * trace so the QGS miss-cause is observable (`qgs_error` vs `qgs_null`).
 */
function triageToAsk(
  t: TriageOutput,
  state: PipelineRunState,
  batch: ClarifyingQuestionBatch | null,
  fallbackReason: QgsFallbackReason,
): ClassifyResult {
  if (batch !== null && batch.questions.length > 0) {
    const primary = batch.questions[0]!;
    recordLayer(state, 'QGS', 'ask', {
      questions: batch.questions.length,
      attributes: batch.questions.map((q) => q.discriminating_attribute),
      total_ig: batch.total_ig_potential,
    });
    return {
      decision: 'ASK',
      question: primary,
      questions: batch,
      diagnostics: buildDiagnostics(state),
    };
  }

  const question = buildFallbackQuestion(t);
  recordLayer(state, 'L1', 'ask', {
    discriminating_attribute: question.discriminating_attribute,
    qgs_fallback_reason: fallbackReason,
  });
  return {
    decision: 'ASK',
    question,
    diagnostics: buildDiagnostics(state),
  };
}

/**
 * Candidate-aware ASK: run L2 → L3 against the triage ASK's candidate chapters
 * to obtain the LIVE candidate set, then ask the QGS to generate an info-gain
 * question BATCH over it. Falls back CLEANLY to the L1 single question when the
 * candidate set is genuinely indistinguishable / unavailable / empty (the QGS
 * returns null) or when retrieval/rules fail (we never block an ASK on a
 * retrieval hiccup — the fallback question is always available).
 *
 * Used at BOTH ASK sites (first-pass + backtrack re-entry) via a shared path.
 */
async function handleTriageAsk(
  t: TriageOutput,
  normalized: NormalizedInput,
  state: PipelineRunState,
  opts: { backtrack: boolean },
): Promise<ClassifyResult> {
  let batch: ClarifyingQuestionBatch | null = null;
  // Default reason: QGS ran and returned null (the common "no usable question"
  // outcome). Flipped to `qgs_error` only if the L2/L3/QGS path THROWS.
  let fallbackReason: QgsFallbackReason = 'qgs_null';
  try {
    const headNouns = t.extracted_attributes.head_nouns_for_fts;
    const retrievalOut = await retrieve({
      normalized_query: normalized.normalized_query,
      raw_tokens: normalized.raw_tokens,
      composite_flag: normalized.composite_flag,
      candidate_chapters: t.candidate_chapters,
      head_nouns_for_fts: headNouns,
    });
    recordLayer(state, 'L2', 'retrieve', {
      strategy: retrievalOut.retrieval_strategy,
      candidates: retrievalOut.candidates.length,
      for_ask: true,
      ...(opts.backtrack ? { backtrack: true } : {}),
    });

    const rulesOut = await rulesFilter({
      l2_output: retrievalOut,
      normalized_query: normalized.normalized_query,
      raw_tokens: normalized.raw_tokens,
      head_nouns_for_fts: headNouns,
      candidate_chapters: t.candidate_chapters,
      // For an ASK we are not driving the backtrack gate; suppress re-signal.
      backtrack_attempted: true,
    });
    recordLayer(state, 'L3', 'rules_filter', {
      survivors: rulesOut.filtered_candidates.length,
      for_ask: true,
      ...(opts.backtrack ? { backtrack: true } : {}),
    });

    // A null return is the indistinguishable / no-candidate outcome (qgs_null,
    // already the default); only a THROW below is qgs_error.
    batch = await selectQGSBatch({ candidates: rulesOut.filtered_candidates });
  } catch {
    // A retrieval/rules/QGS hiccup must NEVER drop the ASK — fall back to the
    // L1 single question. (Genuine Vertex transport errors don't reach here —
    // L2/L3/QGS are deterministic DB/compute, not Vertex LLM calls.) Record the
    // distinct cause for observability — behavior is identical to the null path.
    batch = null;
    fallbackReason = 'qgs_error';
  }

  return triageToAsk(t, state, batch, fallbackReason);
}

/**
 * Map a TriageOutput with decision:'REFUSE' to a ClassifyResult REFUSE.
 *
 * Mirrors {@link triageToAsk}: a single canonical mapping reused at BOTH triage
 * sites (first-pass and backtrack re-entry). Handles every model-originated
 * triage refusal uniformly — genuine out-of-scope (`services_not_goods`, etc.),
 * the invalid-JSON synthetic refuse (`incoherent_query`, produced INSIDE L1 after
 * its own retry per ARCHITECTURE §7), and Q-budget exhaustion
 * (`function_only_no_substance`). This is a MODEL decision, so `system_error` is
 * deliberately NOT set — that field is the orchestrator's infra-failure
 * discriminator only.
 *
 * @param reasonOverride Optional reason to substitute (used by the defensive
 *   incoherent-ASK guard, which synthesizes a refusal from an inconsistent ASK).
 */
function triageToRefuse(
  t: TriageOutput,
  state: PipelineRunState,
  reasonOverride?: string,
): ClassifyResult {
  return {
    decision: 'REFUSE',
    refusal: {
      reason: reasonOverride ?? t.refusal_reason ?? '',
      out_of_scope_class: t.out_of_scope_class,
      verifier_failures: [],
    },
    diagnostics: buildDiagnostics(state),
  };
}

/**
 * Map a Select REFUSE (`selected_code === null`) to a ClassifyResult REFUSE.
 *
 * Reused for BOTH the initial select AND every repair-loop select (closes the
 * Task-7 gap: a repair select returning null must REFUSE here, never fall
 * through to `chapterOf('')`/verify on an empty code). A select refusal is a
 * MODEL decision — `system_error` is NOT set. `out_of_scope_class` is null
 * because a select refusal is a "no faithful classification" outcome, not a
 * triage scope classification.
 */
function selectToRefuse(selectOut: SelectOutput, state: PipelineRunState): ClassifyResult {
  return {
    decision: 'REFUSE',
    refusal: {
      reason: selectOut.refusal?.reason ?? 'No faithful classification',
      out_of_scope_class: null,
      verifier_failures: [],
    },
    diagnostics: buildDiagnostics(state),
  };
}

/**
 * Narrow an escaped error to a genuine Vertex transport/system failure per
 * ARCHITECTURE §7 ("Vertex 5xx persistent").
 *
 * vertex-client does its OWN exponential backoff (max 3) on 5xx/429/transient
 * network errors; when that is exhausted it rethrows a generic `Error` whose
 * message is prefixed `[vertex-client] After N retry attempts:` (original on
 * `.cause`). We match THAT prefix exactly so the catch is surgical:
 *   - `MaxTokensError` (budget config, not transport) is excluded → propagates.
 *   - `LlmOutputValidationError` is never thrown to the orchestrator (the layers
 *     swallow it → incoherent_query REFUSE) but is excluded here defensively.
 *   - Programming bugs (TypeError, plain Errors without the prefix) are NOT
 *     matched → they propagate and surface in tests, never masked as a clean
 *     system_error.
 */
function isVertexTransportError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  if (err instanceof MaxTokensError) return false;
  if (err instanceof LlmOutputValidationError) return false;
  return err.message.startsWith('[vertex-client] After ');
}

/**
 * Build a ClassifyResult that surfaces a persistent infra/transport failure to
 * the user as a system error (ARCHITECTURE §7) — never a fabricated
 * classification. `system_error` is the discriminator: a normal model REFUSE
 * does not set it, so eval can treat this as a per-case ERROR.
 */
function systemErrorResult(
  stage: PipelineSystemError['stage'],
  err: Error,
  state: PipelineRunState,
): ClassifyResult {
  return {
    decision: 'REFUSE',
    refusal: {
      reason: `System error during classification: ${err.message}`,
      out_of_scope_class: null,
      verifier_failures: [],
    },
    system_error: { stage, message: err.message, retryable: true },
    diagnostics: buildDiagnostics(state),
  };
}

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Phase 4 v2 entry point. Runs the L0→L5 CLASSIFY happy path.
 *
 * Happy path only (Task 6): on a Triage `CLASSIFY` decision and a Verifier
 * `passed:true`, returns a CLASSIFY result. Triage ASK/REFUSE, zero-candidate
 * backtrack, the verifier→select repair loop, and error handling are handled by
 * Tasks 7-11 (not yet implemented). Until those land, non-happy-path branches
 * are intentionally absent — they will slot into the marked blocks below.
 *
 * @param query Raw user query.
 * @param opts  Optional previousAnswers (multi-turn, Task 11) + q_budget override.
 */
export async function classify(
  query: string,
  opts: ClassifyOptions = {},
): Promise<ClassifyResult> {
  const previousAnswers = opts.previousAnswers ?? {};
  const q_budget_remaining = opts.q_budget ?? DEFAULT_Q_BUDGET;
  const captureTrace = opts.captureTrace ?? false;

  const state: PipelineRunState = {
    query,
    normalized_query: '',
    previousAnswers,
    q_budget_remaining,
    backtrack_attempted: false,
    escalation_path: [],
    trace: [],
    started_at: Date.now(),
    llm_calls: 0,
  };

  // §7 system-error contract: track the LLM stage currently executing so that if
  // a persistent Vertex transport error escapes (after vertex-client's own
  // backoff), we attribute it to the right stage. The whole pipeline body runs
  // inside the try; ONLY genuine transport errors are converted to a
  // system_error result (see isVertexTransportError) — everything else (incl.
  // programming bugs) propagates so it surfaces in tests rather than masking as
  // a clean infra failure.
  let currentStage: PipelineSystemError['stage'] = 'pipeline';
  try {
  /* ---- L0 — Input Normalization (deterministic) ----------------------- */
  const normalized = await normalize(query, previousAnswers);
  state.normalized_query = normalized.normalized_query;
  recordLayer(state, 'L0', 'normalize', { composite_flag: normalized.composite_flag });

  /* ---- L1 — Triage (LLM) ---------------------------------------------- */
  const triageInput: TriageInput = {
    normalized_query: normalized.normalized_query,
    previousAnswers,
    q_budget_remaining,
    constraint_hint: null,
  };
  currentStage = 'L1';
  const triageOut = await triage(triageInput);
  state.llm_calls = (state.llm_calls ?? 0) + 1;
  recordLayer(state, 'L1', 'triage', { decision: triageOut.decision });

  // ASK → candidate-aware QGS (L2→L3→QGS) with clean fallback to the L1 single
  // question. REFUSE → maps every model refusal (incl. the L1 invalid-JSON
  // synthetic incoherent_query refuse and Q-budget exhaustion).
  if (triageOut.decision === 'ASK') {
    return finalize(await handleTriageAsk(triageOut, normalized, state, { backtrack: false }), state, captureTrace);
  }
  if (triageOut.decision === 'REFUSE') {
    recordLayer(state, 'L1', 'refuse', { out_of_scope_class: triageOut.out_of_scope_class });
    return finalize(triageToRefuse(triageOut, state), state, captureTrace);
  }

  const head_nouns_for_fts = triageOut.extracted_attributes.head_nouns_for_fts;

  /* ---- L2 — Hybrid Retrieval (deterministic) -------------------------- */
  const retrievalOut = await retrieve({
    normalized_query: normalized.normalized_query,
    raw_tokens: normalized.raw_tokens,
    composite_flag: normalized.composite_flag,
    candidate_chapters: triageOut.candidate_chapters,
    head_nouns_for_fts,
  });
  recordLayer(state, 'L2', 'retrieve', {
    strategy: retrievalOut.retrieval_strategy,
    candidates: retrievalOut.candidates.length,
  });

  /* ---- L3 — Rules Filter + Collapse + Backtrack Gate (deterministic) --- *
   * The effective triage/retrieval/rules outputs below start as the first-pass
   * values and are reassigned inside the single-shot backtrack gate if the gate
   * fires. Using `let` here (not `const`) is intentional — the gate mutates them
   * exactly once.                                                               */

  // First-pass L3 run.
  let activeTriageOut = triageOut;
  let activeRetrievalOut = retrievalOut;
  let activeHeadNouns  = head_nouns_for_fts;

  const rulesFilterInput: RulesFilterInput = {
    l2_output: retrievalOut,
    normalized_query: normalized.normalized_query,
    raw_tokens: normalized.raw_tokens,
    head_nouns_for_fts: activeHeadNouns,
    candidate_chapters: triageOut.candidate_chapters,
    backtrack_attempted: state.backtrack_attempted,
  };
  let activeRulesOut = await rulesFilter(rulesFilterInput);
  recordLayer(state, 'L3', 'rules_filter', {
    survivors: activeRulesOut.filtered_candidates.length,
    backtrack_signal: activeRulesOut.backtrack_signal,
  });

  // --- Single-shot backtrack gate (Task 8) --------------------------------
  // When L3 cannot find enough candidates it emits backtrack_signal:true with a
  // constraint_hint. The orchestrator re-enters triage ONCE with that hint, then
  // re-retrieves and re-filters. The `state.backtrack_attempted` flag enforces
  // single-shot: even if the 2nd rulesFilter also returns backtrack_signal:true,
  // the block is never entered again (the flag was set to true before re-entry).
  if (activeRulesOut.backtrack_signal && !state.backtrack_attempted) {
    state.backtrack_attempted = true;

    // Re-call triage with the constraint_hint from L3 (counts as an LLM call).
    const backtrackTriageInput: TriageInput = {
      normalized_query: normalized.normalized_query,
      previousAnswers,
      q_budget_remaining,
      constraint_hint: activeRulesOut.constraint_hint,
    };
    currentStage = 'L1';
    const backtrackTriageOut = await triage(backtrackTriageInput);
    state.llm_calls = (state.llm_calls ?? 0) + 1;
    recordLayer(state, 'L1', 'triage', { decision: backtrackTriageOut.decision, backtrack: true });

    // ASK → candidate-aware QGS (same shared path). REFUSE → canonical mapping
    // (naturally covers the L3 backtrack_no_fit REFUSE L1 emits when the
    // constraint can't be met).
    if (backtrackTriageOut.decision === 'ASK') {
      return finalize(await handleTriageAsk(backtrackTriageOut, normalized, state, { backtrack: true }), state, captureTrace);
    }
    if (backtrackTriageOut.decision === 'REFUSE') {
      recordLayer(state, 'L1', 'refuse', {
        out_of_scope_class: backtrackTriageOut.out_of_scope_class,
        backtrack: true,
      });
      return finalize(triageToRefuse(backtrackTriageOut, state), state, captureTrace);
    }

    // Re-retrieve with the updated candidate_chapters from re-triage.
    const backtrackRetrievalOut = await retrieve({
      normalized_query: normalized.normalized_query,
      raw_tokens: normalized.raw_tokens,
      composite_flag: normalized.composite_flag,
      candidate_chapters: backtrackTriageOut.candidate_chapters,
      head_nouns_for_fts: backtrackTriageOut.extracted_attributes.head_nouns_for_fts,
    });
    recordLayer(state, 'L2', 'retrieve', {
      strategy: backtrackRetrievalOut.retrieval_strategy,
      candidates: backtrackRetrievalOut.candidates.length,
      backtrack: true,
    });

    // Re-filter; backtrack_attempted is now true → L3 will NOT re-signal.
    const backtrackRulesFilterInput: RulesFilterInput = {
      l2_output: backtrackRetrievalOut,
      normalized_query: normalized.normalized_query,
      raw_tokens: normalized.raw_tokens,
      head_nouns_for_fts: backtrackTriageOut.extracted_attributes.head_nouns_for_fts,
      candidate_chapters: backtrackTriageOut.candidate_chapters,
      backtrack_attempted: state.backtrack_attempted, // true — single-shot enforced
    };
    const backtrackRulesOut = await rulesFilter(backtrackRulesFilterInput);
    recordLayer(state, 'L3', 'rules_filter', {
      survivors: backtrackRulesOut.filtered_candidates.length,
      backtrack_signal: backtrackRulesOut.backtrack_signal,
      backtrack: true,
    });

    // Promote backtrack outputs — these are what L4/L5 will see.
    activeTriageOut    = backtrackTriageOut;
    activeRetrievalOut = backtrackRetrievalOut;
    activeHeadNouns    = backtrackTriageOut.extracted_attributes.head_nouns_for_fts;
    activeRulesOut     = backtrackRulesOut;
  }

  // --- Zero-candidate escalation (after gate, before L4) ------------------
  if (activeRulesOut.filtered_candidates.length === 0) {
    return finalize(BaselineEscalation.onZeroCandidates(state), state, captureTrace);
  }

  /* ---- L4 — Select + L5 — Verify (with repair loop, Task 7) ----------- *
   * Attempt 0 = initial select+verify. On failure, up to 3 repair iterations
   * re-call select with verifier_failures + repair_iteration, then re-verify
   * the new output. First pass wins; after 3 failed repairs (4 total verify
   * failures) hand off to BaselineEscalation.onVerifierExhausted.            */

  /** Build the L5Input for the current select output. Reuse active L2 query vector. */
  function buildL5Input(currentSelectOut: SelectOutput): L5Input {
    const code = currentSelectOut.selected_code ?? '';
    return {
      select_output: currentSelectOut,
      candidate_code: code,
      candidate_chapter: chapterOf(code),
      // Reuse L2's query vector — the single Cohere embed lives in L2 (avoids
      // the redundant orchestrator re-embed that doubled cash-billed embed spend).
      // After backtrack, this is the re-retrieve's vector (correct for re-triage scope).
      query_embedding: activeRetrievalOut.query_embedding,
      filtered_candidates: activeRulesOut.filtered_candidates,
      matched_exclusions: activeRulesOut.matched_exclusions,
      composite_flag: normalized.composite_flag,
      raw_tokens: normalized.raw_tokens,
      head_nouns_for_fts: activeHeadNouns,
    };
  }

  // --- Initial select (attempt 0, no repair metadata) --------------------
  const baseL4Input: L4Input = {
    normalized_query: normalized.normalized_query,
    raw_tokens: normalized.raw_tokens,
    composite_flag: normalized.composite_flag,
    extracted_attributes: activeTriageOut.extracted_attributes,
    candidate_chapters: activeTriageOut.candidate_chapters,
    filtered_candidates: activeRulesOut.filtered_candidates,
    matched_exclusions: activeRulesOut.matched_exclusions,
  };
  currentStage = 'L4';
  let currentSelectOut = await select(baseL4Input);
  state.llm_calls = (state.llm_calls ?? 0) + 1;
  recordLayer(state, 'L4', 'select', {
    selected_code: currentSelectOut.selected_code,
    self_confidence: currentSelectOut.self_confidence,
  });

  // Select REFUSE (null code) → ClassifyResult REFUSE (no verify — there is no
  // code to check). A model decision, so system_error is not set.
  if (currentSelectOut.selected_code === null) {
    recordLayer(state, 'L4', 'refuse');
    return finalize(selectToRefuse(currentSelectOut, state), state, captureTrace);
  }

  let currentVerifyOut = await verify(buildL5Input(currentSelectOut));
  recordLayer(state, 'L5', 'verify', {
    passed:       currentVerifyOut.passed,
    failed_rules: currentVerifyOut.failed_rules.map((f) => f.rule_id),
  });

  if (currentVerifyOut.passed) {
    return finalize(selectToClassifyResult(currentSelectOut, state, { escalated_to_deep_think: false }), state, captureTrace);
  }

  // --- Repair loop: up to 3 repair iterations (i = 0, 1, 2) -------------
  let lastFailures: VerifierRuleFailure[] = currentVerifyOut.failed_rules;

  for (let i = 0; i < 3; i++) {
    // Push a trace event for this repair attempt (before re-selecting).
    recordLayer(state, `${ESCALATION_REPAIR_PREFIX}${i}` as PipelineTraceEvent['layer'], 'repair', {
      repair_iteration: i + 1,
      failed_rules: lastFailures.length,
    });

    // Re-call select with repair feedback (this IS an LLM call).
    const repairL4Input: L4Input = {
      ...baseL4Input,
      verifier_failures: lastFailures,
      repair_iteration: i + 1,
    };
    currentStage = 'L4';
    currentSelectOut = await select(repairL4Input);
    state.llm_calls = (state.llm_calls ?? 0) + 1;
    recordLayer(state, 'L4', 'select', {
      selected_code: currentSelectOut.selected_code,
      self_confidence: currentSelectOut.self_confidence,
      repair_iteration: i + 1,
    });

    // A repair select may itself refuse (null code). Close the Task-7 gap: REFUSE
    // here rather than feed an empty code into chapterOf('')/verify.
    if (currentSelectOut.selected_code === null) {
      recordLayer(state, 'L4', 'refuse', { repair_iteration: i + 1 });
      return finalize(selectToRefuse(currentSelectOut, state), state, captureTrace);
    }

    // Re-verify the repaired output (L5 is NOT an LLM call — no llm_calls increment).
    currentVerifyOut = await verify(buildL5Input(currentSelectOut));
    recordLayer(state, 'L5', 'verify', {
      passed:           currentVerifyOut.passed,
      failed_rules:     currentVerifyOut.failed_rules.map((f) => f.rule_id),
      repair_iteration: i + 1,
    });

    if (currentVerifyOut.passed) {
      return finalize(selectToClassifyResult(currentSelectOut, state, { escalated_to_deep_think: false }), state, captureTrace);
    }

    lastFailures = currentVerifyOut.failed_rules;
  }

  // All 3 repairs exhausted — hand off to escalation policy.
  return finalize(BaselineEscalation.onVerifierExhausted(state, currentSelectOut, lastFailures), state, captureTrace);
  } catch (err) {
    // §7 "Vertex 5xx persistent": surface a system-error to the user, NEVER a
    // fabricated classification. We narrow to GENUINE transport failures only
    // (isVertexTransportError) — MaxTokensError, LlmOutputValidationError (the
    // layers swallow these anyway), and any programming bug propagate untouched
    // so real defects surface in tests instead of masquerading as clean infra
    // failures. `currentStage` records the LLM stage that was executing.
    if (isVertexTransportError(err)) {
      recordLayer(state, currentStage === 'L4' ? 'L4' : 'L1', 'system_error', {
        stage: currentStage,
        message: err.message,
      });
      return finalize(systemErrorResult(currentStage, err, state), state, captureTrace);
    }
    throw err;
  }
}

/**
 * Multi-turn continuation entry point (Task 11).
 *
 * Folds the user's answer to a clarifying question back into `previousAnswers`
 * and re-enters `classify` from L1 (triage replays all prior answers as binding
 * facts and does NOT re-ask). The 3-round Q-budget cap (ARCHITECTURE §8, §7) is
 * enforced by {@link continueWithAnswers} on the number of clarifying ROUNDS
 * (distinct re-entries), NOT the number of answer keys — a single QGS batch of
 * several answers is ONE round (see {@link continueWithAnswers} for the rationale).
 *
 * Signature mirrors the legacy API route body `{ originalQuery, answerId,
 * answerLabel }` but drops `answerLabel` (not needed for previousAnswers keying;
 * QGS guarantees both ids match `^[a-z][a-z0-9_]*$`). The wizard carries the
 * full `previousAnswers` map (and the `rounds` counter) from round to round, so
 * it passes them in via `opts`. Delegating a 1-entry map = exactly ONE round, so
 * this function's behavior is unchanged by the rounds-based cap.
 *
 * @param originalQuery  The original user query (unchanged across all rounds).
 * @param questionId     The id of the question being answered (e.g. `'ask_form'`).
 * @param answerId       The id of the selected option (e.g. `'hex'`).
 * @param opts.previousAnswers  Answers accumulated from earlier rounds (default: {}).
 * @param opts.rounds    Clarifying rounds already completed BEFORE this call
 *                       (default 0). Threaded forward by callers across turns.
 */
export async function continueWithAnswer(
  originalQuery: string,
  questionId: string,
  answerId: string,
  opts?: { previousAnswers?: Record<string, string>; rounds?: number },
): Promise<ClassifyResult> {
  return continueWithAnswers(
    originalQuery,
    { [questionId]: answerId },
    { previousAnswers: opts?.previousAnswers, rounds: opts?.rounds },
  );
}

/**
 * Multi-turn continuation accepting a BATCH of answers in ONE round (QGS batch).
 *
 * The candidate-aware QGS may surface several questions in a single ASK turn;
 * the wizard collects all of them and folds them back together. This entry point
 * folds the whole `batchAnswers` map into `previousAnswers` and re-enters
 * `classify` ONCE — so a QGS batch consumes a SINGLE conceptual clarifying round,
 * not one per question. `continueWithAnswer` (singular) delegates here with a
 * 1-entry map, so its behavior is byte-for-byte unchanged.
 *
 * The Q-budget cap (ARCHITECTURE §8) counts clarifying ROUNDS — distinct
 * `continueWithAnswers` re-entries — NOT the number of answered questionIds. A
 * QGS batch of up to {@link QGS_HARD_CAP} answers folded in ONE call is exactly
 * ONE round, so it consumes exactly ONE budget slot. Counting answer KEYS would
 * let a single 3-question batch exhaust the whole budget in one turn and break
 * any legitimate follow-up round. The caller threads `opts.rounds` (rounds
 * already completed) from turn to turn; this call is round `opts.rounds + 1`, and
 * we short-circuit to REFUSE (before any LLM call) once that exceeds `q_budget`.
 *
 * @param originalQuery  The original user query (unchanged across all rounds).
 * @param batchAnswers   Map of questionId → answerId answered THIS round (≥1).
 * @param opts.previousAnswers  Answers accumulated from earlier rounds (default {}).
 * @param opts.rounds    Clarifying rounds already completed BEFORE this call
 *                       (default 0). This call is round `rounds + 1`.
 * @param opts.q_budget  Round budget (default {@link DEFAULT_Q_BUDGET} = 3).
 */
export async function continueWithAnswers(
  originalQuery: string,
  batchAnswers: Record<string, string>,
  opts?: { previousAnswers?: Record<string, string>; rounds?: number; q_budget?: number },
): Promise<ClassifyResult> {
  const prior = opts?.previousAnswers ?? {};
  const priorRounds = opts?.rounds ?? 0;
  const roundBudget = opts?.q_budget ?? DEFAULT_Q_BUDGET;

  // Build the merged answers map (adds THIS round's batch to prior rounds).
  // Answers are keyed by questionId: re-answering the same question OVERWRITES
  // the prior answer. Key COUNT is irrelevant to the budget — the cap is on
  // rounds (re-entries), not on how many questions a batch carried.
  const newPreviousAnswers: Record<string, string> = { ...prior, ...batchAnswers };

  // This invocation is the next clarifying ROUND. A QGS batch (≥1 answers folded
  // in one call) counts as exactly ONE round.
  const thisRound = priorRounds + 1;

  // Round cap: once this would be the (roundBudget+1)th round, the Q-budget is
  // exhausted. Short-circuit here so zero LLM calls are made for this hopeless
  // round — triage also enforces this, but defense-in-depth is cheap here.
  if (thisRound > roundBudget) {
    const capState: PipelineRunState = {
      query: originalQuery,
      normalized_query: '',
      previousAnswers: newPreviousAnswers,
      q_budget_remaining: 0,
      backtrack_attempted: false,
      escalation_path: [],
      trace: [],
      started_at: Date.now(),
      llm_calls: 0,
    };
    return {
      decision: 'REFUSE',
      refusal: {
        reason: `Q-budget exhausted after ${roundBudget} clarifying rounds`,
        out_of_scope_class: 'function_only_no_substance',
        verifier_failures: [],
      },
      diagnostics: buildDiagnostics(capState),
    };
  }

  // Remaining Q-budget AFTER consuming THIS round (rounds, not answer keys).
  const q_budget = roundBudget - thisRound;

  // Delegate entirely to classify — no pipeline logic lives here.
  return classify(originalQuery, { previousAnswers: newPreviousAnswers, q_budget });
}

export type { ClassifyResult } from './types';

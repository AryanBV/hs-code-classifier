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
import { selectToClassifyResult, buildDiagnostics } from './select-to-result';
import { BaselineEscalation } from './escalation';
import { MaxTokensError } from './lib/vertex-client';
import { LlmOutputValidationError } from './schemas';
import type {
  ChapterCode,
  ClarifyingQuestion,
  ClassifyResult,
  L4Input,
  L5Input,
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
 * Map a TriageOutput with decision:'ASK' to a ClassifyResult with decision:'ASK'.
 *
 * Synthesizes a stable `question_id` from the discriminating_attribute so the
 * API surface is consistent across calls. QGS (Task QGS wiring) will later
 * replace the *selection* of the question — this seam remains unchanged.
 *
 * Defensive guard: if the triage output somehow arrives here with a null
 * clarifying_question despite decision==='ASK' (incoherent triage — the L1
 * isTriageOutput guard should prevent this), we throw a clear error rather than
 * emitting an ASK with an empty question.
 */
function triageToAsk(t: TriageOutput, state: PipelineRunState): ClassifyResult {
  const cq = t.clarifying_question;
  if (cq === null) {
    // Should be unreachable: L1 cross-field guard enforces ASK ⇒ non-null.
    throw new Error(
      'classifier-v2: Triage returned ASK with null clarifying_question (incoherent triage output).',
    );
  }

  const question: ClarifyingQuestion = {
    question_id: `ask_${cq.discriminating_attribute}`,
    question_text: cq.fallback_question_text,
    discriminating_attribute: cq.discriminating_attribute,
    options: cq.fallback_options,
  };

  recordLayer(state, 'L1', 'ask', { discriminating_attribute: cq.discriminating_attribute });

  return {
    decision: 'ASK',
    question,
    diagnostics: buildDiagnostics(state),
  };
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

  // ASK → Task 9. REFUSE → Task 10 (maps every model refusal, incl. the L1
  // invalid-JSON synthetic incoherent_query refuse and Q-budget exhaustion).
  if (triageOut.decision === 'ASK') {
    return triageToAsk(triageOut, state);
  }
  if (triageOut.decision === 'REFUSE') {
    recordLayer(state, 'L1', 'refuse', { out_of_scope_class: triageOut.out_of_scope_class });
    return triageToRefuse(triageOut, state);
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

    // ASK → Task 9. REFUSE → Task 10 (same canonical mapping; naturally covers
    // the L3 backtrack_no_fit REFUSE L1 emits when the constraint can't be met).
    if (backtrackTriageOut.decision === 'ASK') {
      return triageToAsk(backtrackTriageOut, state);
    }
    if (backtrackTriageOut.decision === 'REFUSE') {
      recordLayer(state, 'L1', 'refuse', {
        out_of_scope_class: backtrackTriageOut.out_of_scope_class,
        backtrack: true,
      });
      return triageToRefuse(backtrackTriageOut, state);
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
    return BaselineEscalation.onZeroCandidates(state);
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
    return selectToRefuse(currentSelectOut, state);
  }

  let currentVerifyOut = await verify(buildL5Input(currentSelectOut));
  recordLayer(state, 'L5', 'verify', { passed: currentVerifyOut.passed });

  if (currentVerifyOut.passed) {
    return selectToClassifyResult(currentSelectOut, state, { escalated_to_deep_think: false });
  }

  // --- Repair loop: up to 3 repair iterations (i = 0, 1, 2) -------------
  let lastFailures: VerifierRuleFailure[] = currentVerifyOut.failed_rules;

  for (let i = 0; i < 3; i++) {
    // Push a trace event for this repair attempt (before re-selecting).
    recordLayer(state, `L5:repair${i}` as PipelineTraceEvent['layer'], 'repair', {
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
      return selectToRefuse(currentSelectOut, state);
    }

    // Re-verify the repaired output (L5 is NOT an LLM call — no llm_calls increment).
    currentVerifyOut = await verify(buildL5Input(currentSelectOut));
    recordLayer(state, 'L5', 'verify', { passed: currentVerifyOut.passed, repair_iteration: i + 1 });

    if (currentVerifyOut.passed) {
      return selectToClassifyResult(currentSelectOut, state, { escalated_to_deep_think: false });
    }

    lastFailures = currentVerifyOut.failed_rules;
  }

  // All 3 repairs exhausted — hand off to escalation policy.
  return BaselineEscalation.onVerifierExhausted(state, currentSelectOut, lastFailures);
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
      return systemErrorResult(currentStage, err, state);
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
 * enforced here as a short-circuit BEFORE any LLM call — if adding this answer
 * would produce a 4th distinct answer (`newPreviousAnswers.length > 3`), we
 * immediately REFUSE with `function_only_no_substance` rather than waste an L1
 * call that triage would also refuse.
 *
 * Signature mirrors the legacy API route body `{ originalQuery, answerId,
 * answerLabel }` but drops `answerLabel` (not needed for previousAnswers keying;
 * QGS guarantees both ids match `^[a-z][a-z0-9_]*$`). The wizard carries the
 * full `previousAnswers` map from round to round, so it passes it in via `opts`.
 *
 * @param originalQuery  The original user query (unchanged across all rounds).
 * @param questionId     The id of the question being answered (e.g. `'ask_form'`).
 * @param answerId       The id of the selected option (e.g. `'hex'`).
 * @param opts.previousAnswers  Answers accumulated from earlier rounds (default: {}).
 */
export async function continueWithAnswer(
  originalQuery: string,
  questionId: string,
  answerId: string,
  opts?: { previousAnswers?: Record<string, string> },
): Promise<ClassifyResult> {
  const prior = opts?.previousAnswers ?? {};

  // Build the merged answers map (adds this round's answer to prior rounds).
  // Answers are keyed by questionId: re-answering the same question OVERWRITES
  // the prior answer and does NOT consume a new Q-budget slot (the 3-round cap
  // counts distinct questionIds in Object.keys(newPreviousAnswers), not calls).
  const newPreviousAnswers: Record<string, string> = { ...prior, [questionId]: answerId };

  // 3-round cap: if we now have more than 3 distinct answers, the Q-budget is
  // exhausted. Short-circuit here so zero LLM calls are made for this hopeless
  // 4th round — triage also enforces this, but defense-in-depth is cheap here.
  if (Object.keys(newPreviousAnswers).length > 3) {
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
        reason: 'Q-budget exhausted after 3 clarifying rounds',
        out_of_scope_class: 'function_only_no_substance',
        verifier_failures: [],
      },
      diagnostics: buildDiagnostics(capState),
    };
  }

  // Compute the remaining Q-budget AFTER consuming this answer (each answer uses
  // one slot; budget starts at DEFAULT_Q_BUDGET = 3).
  const q_budget = DEFAULT_Q_BUDGET - Object.keys(newPreviousAnswers).length;

  // Delegate entirely to classify — no pipeline logic lives here.
  return classify(originalQuery, { previousAnswers: newPreviousAnswers, q_budget });
}

export type { ClassifyResult } from './types';

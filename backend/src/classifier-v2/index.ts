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
import type {
  ChapterCode,
  ClarifyingQuestion,
  ClassifyResult,
  L4Input,
  L5Input,
  PipelineRunState,
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
  const triageOut = await triage(triageInput);
  state.llm_calls = (state.llm_calls ?? 0) + 1;
  recordLayer(state, 'L1', 'triage', { decision: triageOut.decision });

  // ASK → Task 9 (implemented). REFUSE → Task 10 (placeholder below).
  if (triageOut.decision === 'ASK') {
    return triageToAsk(triageOut, state);
  }
  if (triageOut.decision !== 'CLASSIFY') {
    // REFUSE — Task 10 not yet implemented.
    throw new Error(
      `classifier-v2: Triage decision '${triageOut.decision}' not yet handled (REFUSE=Task 10).`,
    );
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
    const backtrackTriageOut = await triage(backtrackTriageInput);
    state.llm_calls = (state.llm_calls ?? 0) + 1;
    recordLayer(state, 'L1', 'triage', { decision: backtrackTriageOut.decision, backtrack: true });

    // ASK → Task 9 (implemented). REFUSE → Task 10 (placeholder).
    if (backtrackTriageOut.decision === 'ASK') {
      return triageToAsk(backtrackTriageOut, state);
    }
    if (backtrackTriageOut.decision !== 'CLASSIFY') {
      // REFUSE — Task 10 not yet implemented.
      throw new Error(
        `classifier-v2: Backtrack re-triage decision '${backtrackTriageOut.decision}' not yet handled (REFUSE=Task 10).`,
      );
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
  let currentSelectOut = await select(baseL4Input);
  state.llm_calls = (state.llm_calls ?? 0) + 1;
  recordLayer(state, 'L4', 'select', {
    selected_code: currentSelectOut.selected_code,
    self_confidence: currentSelectOut.self_confidence,
  });

  // Select REFUSE (null code) is Task 10. Happy path expects a selected code.
  if (currentSelectOut.selected_code === null) {
    throw new Error('classifier-v2: Select REFUSE not yet handled (Task 10).');
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
    currentSelectOut = await select(repairL4Input);
    state.llm_calls = (state.llm_calls ?? 0) + 1;
    recordLayer(state, 'L4', 'select', {
      selected_code: currentSelectOut.selected_code,
      self_confidence: currentSelectOut.self_confidence,
      repair_iteration: i + 1,
    });

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
}

/**
 * Multi-turn continuation entry point (Task 11). Not yet implemented — kept on
 * the module surface so the export shape is stable for downstream importers.
 */
export async function continueWithAnswer(
  _originalQuery: string,
  _answerId: string,
  _answerLabel: string,
): Promise<ClassifyResult> {
  throw new Error('continueWithAnswer not implemented (Task 11)');
}

export type { ClassifyResult } from './types';

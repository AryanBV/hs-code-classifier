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
import {
  select,
  computeSiblingDiscriminators,
  getTariffLineAttributesForCodes,
} from './layers/L4-select';
import { verify } from './layers/L5-verifier';
import { selectQGSBatch } from './layers/QGS-generator';
import {
  isAttributePinnedByQuery,
  computeSiblingRerankMargin,
  evaluateCalibratedClassify,
} from './lib/sibling-ask-trigger';
import { getTariffLineParentChains } from './lib/supabase-client';
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
  RetrievalCandidate,
  RulesFilterInput,
  SelectOutput,
  TriageExtractedAttributes,
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
  // CALIBRATED-CLASSIFY upgrade (env-gated; default OFF). Set inside the try once
  // L2/L3 have run; an ASK→CLASSIFY upgrade short-circuits the ASK below.
  let calibrated: ClassifyResult | null = null;
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

    // CALIBRATED-CLASSIFY: if L2/L3 already pinned the dominant leaf, upgrade the
    // ASK to a CLASSIFY (env-gated; default OFF → zero work, byte-identical). The
    // helper reuses the already-computed retrievalOut + rulesOut — no extra L2/L3.
    calibrated = await maybeCalibratedClassifyFromAsk({
      retrievalOut,
      rulesOut,
      normalized,
      triageOut: t,
      state,
    });
  } catch {
    // A retrieval/rules/QGS hiccup must NEVER drop the ASK — fall back to the
    // L1 single question. (Genuine Vertex transport errors don't reach here —
    // L2/L3/QGS are deterministic DB/compute, not Vertex LLM calls.) Record the
    // distinct cause for observability — behavior is identical to the null path.
    batch = null;
    fallbackReason = 'qgs_error';
  }

  // An ASK→CLASSIFY upgrade short-circuits the ASK. (When the lever is off — the
  // default — `calibrated` is always null and this is a no-op.)
  if (calibrated !== null) return calibrated;

  return triageToAsk(t, state, batch, fallbackReason);
}

/* ---------------------------------------------------------------------------
 * SIBLING-ASK elicitation lever (POST-L4 uncertainty gate; env-gated; default
 * OFF → byte-identical)
 *
 * ~50% of leaf-sibling selection errors are genuine query UNDER-SPECIFICATION:
 * the deciding attribute exists in tariff_line_attributes but NOT in the
 * exporter's query, so L4 can only GUESS it. The earlier PRE-L4 trigger over-
 * fired (~33% ask-rate) because it asked on EVERY sibling group regardless of
 * whether L4 would have nailed it — tanking outright accuracy. This redesign
 * lets L4 SELECT first (+ run its L5/repair loop), then asks ONE targeted
 * question ONLY when L4's OWN self-confidence says it is genuinely stuck on a
 * sibling. The question is built on the SPECIFIC discriminating attribute of the
 * sibling group the chosen leaf belongs to, with options drawn from the competing
 * siblings' actual TLA values — so the gold leaf's value is always among the
 * options (this fixes the prior 65% recoverability ceiling).
 *
 * GATE: the entire lever is behind `SIBLING_ASK_ENABLED === 'true'`. When that
 * env var is unset/anything else, `maybeSiblingAskPostL4` returns null BEFORE
 * doing any DB/QGS/compute work — so the committed default pipeline is
 * byte-for-byte unchanged (L4's classification is finalized verbatim). This is
 * opt-in for A/B measurement; it is flipped on only after the milestone gate
 * passes.
 *
 * Tunability (for threshold sweeps without code changes):
 *   - SIBLING_ASK_ENABLED            'true' → on; anything else → off (default).
 *   - SIBLING_ASK_MARGIN_THRESHOLD   float, default 0.05. The lever is eligible
 *     only when the rerank-score margin between the top-2 same-subheading
 *     siblings of the selected leaf is BELOW this threshold (small margin = the
 *     reranker could not separate them = genuinely confusable). Replaces the
 *     uncalibrated self_confidence enum (ECE ~18%). Sweep to find the
 *     ask-rate ≤15% / recoverability ≥75% operating point.
 * --------------------------------------------------------------------------- */

/** True only when the lever is explicitly enabled for this process. */
function siblingAskEnabled(): boolean {
  return process.env.SIBLING_ASK_ENABLED === 'true';
}

/** Default rerank-margin cutoff: siblings closer than this are "too confusable to guess". */
const DEFAULT_SIBLING_ASK_MARGIN_THRESHOLD = 0.05;

/** Read + parse the (sweepable) rerank-margin threshold; falls back to the default. */
function siblingAskMarginThreshold(): number {
  const raw = process.env.SIBLING_ASK_MARGIN_THRESHOLD;
  if (raw === undefined) return DEFAULT_SIBLING_ASK_MARGIN_THRESHOLD;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SIBLING_ASK_MARGIN_THRESHOLD;
}

/**
 * POST-L4 SIBLING-ASK uncertainty gate. Called AFTER L4 (Select) + its L5/repair
 * loop produced a CLASSIFY-bound `SelectOutput`. Returns a `ClassifyResult`
 * (decision:'ASK', `question.trigger='sibling'`) when ALL conditions hold, else
 * `null` (⇒ the orchestrator finalizes L4's classification UNCHANGED). NEVER
 * throws — any internal error is swallowed and yields null (keep L4's result).
 *
 * Fire iff ALL hold:
 *   - GATE  env `SIBLING_ASK_ENABLED === 'true'` (else null, ZERO work).
 *   - skip  `qBudgetRemaining <= 0` (shared Q-budget) OR `candidates < 2`.
 *   - C1    L4 returned a CLASSIFY with a non-null `selectedCode`.
 *   - C2    the rerank-margin between the top-2 same-subheading siblings of the
 *           selected leaf is < `SIBLING_ASK_MARGIN_THRESHOLD` (default 0.05) —
 *           i.e. the reranker could not separate the siblings (genuinely
 *           confusable). A null margin (<2 rerankable siblings) is treated
 *           conservatively as "cannot assess → no fire".
 *   - S1    the SELECTED leaf is in a same-subheading sibling group:
 *           `computeSiblingDiscriminators` yields a group whose 6-digit subheading
 *           equals the selected code's subheading (≥2 codes, ≥1 differing field).
 *   - S3    `selectQGSBatch` returns a non-null batch (SILENT-DISCRIMINATOR guard).
 *   - S3b   the batch contains a question on a field that the SELECTED group
 *           actually DIFFERS on (the SPECIFIC discriminator) — options then come
 *           from the competing siblings' real TLA values (recoverability fix).
 *   - S2    that question's attribute is NOT pinned by the query
 *           (`isAttributePinnedByQuery` is false).
 *
 * On a fire, records a `SIBLING-ASK` trace step and surfaces BOTH the full batch
 * (`questions`) and the chosen question (`question`, with `trigger='sibling'`).
 */
async function maybeSiblingAskPostL4(params: {
  selectedCode:         string;
  selfConfidence:       SelectOutput['self_confidence'];
  candidates:           RetrievalCandidate[];
  extractedAttributes:  TriageExtractedAttributes;
  rawTokens:            string[];
  qBudgetRemaining:     number;
  state:                PipelineRunState;
}): Promise<ClassifyResult | null> {
  // GATE — default OFF. Return BEFORE any DB/QGS/compute work so the committed
  // default pipeline is byte-for-byte identical.
  if (!siblingAskEnabled()) return null;

  try {
    const {
      selectedCode, selfConfidence, candidates,
      extractedAttributes, rawTokens, qBudgetRemaining, state,
    } = params;

    // Q-budget + candidate-count preconditions (cheap, no I/O).
    if (qBudgetRemaining <= 0) return null;
    if (candidates.length < 2) return null;

    // The selected leaf's 6-digit subheading ("NNNN.NN") — the group it competes
    // in. Derived BEFORE the uncertainty gate so the margin can be scoped to it.
    const selectedSubheading = /^\d{4}\.\d{2}\.\d{2}$/.test(selectedCode)
      ? selectedCode.slice(0, 7)
      : (/^\d{4}\.\d{2}$/.test(selectedCode) ? selectedCode : null);
    if (selectedSubheading === null) return null;

    // C2 — uncertainty gate (rerank-margin). Engage only when the reranker could
    // NOT separate the top-2 same-subheading siblings (small margin = genuinely
    // confusable). Replaces the uncalibrated self_confidence enum (ECE ~18%).
    // (C1 — non-null selectedCode — is guaranteed by the call site.)
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, selectedSubheading);
    if (margin === null) return null;                         // can't assess uncertainty → conservative no-fire
    if (margin >= siblingAskMarginThreshold()) return null;   // siblings well-separated → confident, don't ask

    // Pre-fetch the candidate TLA ONCE and reuse for BOTH the sibling diff and
    // the QGS generator (a small indexed lookup; no double round trip).
    const codes = candidates.map((c) => c.code);
    const tlaByCode = await getTariffLineAttributesForCodes(codes);

    // S1 — the SELECTED leaf must sit in a real sibling group. computeSibling-
    // Discriminators omits all-identical groups, so any returned group qualifies;
    // we additionally require the group to be the chosen leaf's own subheading.
    const siblingGroups = computeSiblingDiscriminators(candidates, tlaByCode);
    const selectedGroup = siblingGroups.find((g) => g.subheading === selectedSubheading);
    if (selectedGroup === undefined) return null;

    // S3 — let QGS decide if a usable info-gain question exists over the live set.
    // Pass the pre-fetched TLA via the deps seam (no second DB round trip for it).
    const batch = await selectQGSBatch({
      candidates,
      deps: { fetchTLA: async () => tlaByCode },
    });
    if (batch === null || batch.questions.length === 0) return null;

    // S3b — pick the batch question built on the SELECTED group's SPECIFIC
    // discriminator. The group's `differing_fields` are DB-column names (e.g.
    // `function_`); the question's `discriminating_attribute` is the PUBLIC key
    // (e.g. `function`). Normalize the trailing underscore so they line up.
    const groupAttrs = new Set(selectedGroup.differing_fields.map(toPublicAttribute));
    const question = batch.questions.find((q) => groupAttrs.has(q.discriminating_attribute));
    if (question === undefined) return null;

    // S2 — that question's attribute must NOT be pinned by the query. If the user
    // already specified it, asking adds nothing → finalize L4.
    if (isAttributePinnedByQuery(question.discriminating_attribute, extractedAttributes, rawTokens)) {
      return null;
    }

    // FIRE. Surface the chosen question FIRST (so single-question consumers ask the
    // sibling discriminator) and tag every batch question trigger='sibling'.
    const reordered = [question, ...batch.questions.filter((q) => q !== question)];
    const taggedQuestions: ClarifyingQuestion[] = reordered.map((q) => ({
      ...q,
      trigger: 'sibling',
    }));
    const taggedBatch: ClarifyingQuestionBatch = {
      ...batch,
      questions: taggedQuestions,
    };
    const taggedPrimary = taggedQuestions[0]!;

    recordLayer(state, 'SIBLING-ASK', 'ask', {
      discriminating_attribute: taggedPrimary.discriminating_attribute,
      margin,
      top_codes: topCodes,
      self_confidence: selfConfidence, // logged only — no longer gates
      selected_code: selectedCode,
      subheading: selectedSubheading,
      questions: taggedQuestions.length,
      total_ig: taggedBatch.total_ig_potential,
    });

    return {
      decision: 'ASK',
      question: taggedPrimary,
      questions: taggedBatch,
      diagnostics: buildDiagnostics(state),
    };
  } catch {
    // The lever must NEVER throw — a DB/QGS/compute hiccup degrades gracefully:
    // return null ⇒ the orchestrator finalizes L4's classification unchanged.
    return null;
  }
}

/**
 * Normalize a sibling-group differing-field name (DB-column space, where
 * `function` carries a trailing underscore for Postgres reserved-word adjacency)
 * to the PUBLIC `AttributeKey` used on a ClarifyingQuestion. Only `function_`
 * differs; every other column name is identical to its public key.
 */
function toPublicAttribute(dbField: string): string {
  return dbField === 'function_' ? 'function' : dbField;
}

/* ---------------------------------------------------------------------------
 * Shared L4 (Select) + L5 (Verify) + repair-loop runner
 *
 * Extracted VERBATIM from the main classify() body so the SAME sequence drives
 * BOTH the main CLASSIFY path AND the CALIBRATED-CLASSIFY lever (which converts
 * an L1 ASK into a CLASSIFY by running this exact select/verify/repair loop on
 * the already-retrieved candidate set). The main path's behavior is byte-for-byte
 * identical to before extraction (proven by index.test.ts): every recordLayer
 * event, llm_calls increment, REFUSE/escalation branch, and the post-L4 sibling
 * gate are preserved in order.
 *
 * Returns a ClassifyResult that is NOT yet wrapped by finalize(captureTrace) — the
 * trace-seam wrapping stays single-sourced at the call sites (so this helper has
 * zero knowledge of captureTrace). `ctx.setStage` mutates the caller's
 * `currentStage` so a Vertex transport error thrown from select() is still
 * attributed to stage 'L4' by classify()'s outer catch.
 * --------------------------------------------------------------------------- */

interface SelectVerifyRepairContext {
  state:             PipelineRunState;
  activeRetrievalOut: { query_embedding: number[] };
  activeRulesOut:    { filtered_candidates: RetrievalCandidate[]; matched_exclusions: L4Input['matched_exclusions'] };
  activeTriageOut:   TriageOutput;
  normalized:        NormalizedInput;
  activeHeadNouns:   string[];
  qBudgetRemaining:  number;
  /** Mutates the caller's currentStage so the outer §7 catch attributes correctly. */
  setStage:          (stage: PipelineSystemError['stage']) => void;
}

async function runSelectVerifyRepair(
  baseL4Input: L4Input,
  ctx: SelectVerifyRepairContext,
): Promise<ClassifyResult> {
  const { state, activeRetrievalOut, activeRulesOut, activeTriageOut, normalized, activeHeadNouns, qBudgetRemaining, setStage } = ctx;

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

  /**
   * Finalize a verifier-PASS Select as a CLASSIFY result — but FIRST run the
   * POST-L4 SIBLING-ASK uncertainty gate (env-gated; default OFF). When the gate
   * is off (or any condition fails / it errors) the L4 classification is returned
   * UNCHANGED; when it fires, a SIBLING-ASK ClassifyResult is returned instead.
   * Shared by the initial-pass and repair-loop pass exits so the gate hooks in
   * exactly once per CLASSIFY outcome.
   */
  async function finalizeClassifyWithSiblingGate(passingSelectOut: SelectOutput): Promise<ClassifyResult> {
    const code = passingSelectOut.selected_code;
    if (code !== null) {
      const siblingAsk = await maybeSiblingAskPostL4({
        selectedCode:        code,
        selfConfidence:      passingSelectOut.self_confidence,
        candidates:          activeRulesOut.filtered_candidates,
        extractedAttributes: activeTriageOut.extracted_attributes,
        rawTokens:           normalized.raw_tokens,
        qBudgetRemaining,
        state,
      });
      if (siblingAsk !== null) return siblingAsk;
    }
    return selectToClassifyResult(passingSelectOut, state, { escalated_to_deep_think: false });
  }

  // --- Initial select (attempt 0, no repair metadata) --------------------
  setStage('L4');
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
  recordLayer(state, 'L5', 'verify', {
    passed:       currentVerifyOut.passed,
    failed_rules: currentVerifyOut.failed_rules.map((f) => f.rule_id),
  });

  if (currentVerifyOut.passed) {
    return finalizeClassifyWithSiblingGate(currentSelectOut);
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
    setStage('L4');
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
    recordLayer(state, 'L5', 'verify', {
      passed:           currentVerifyOut.passed,
      failed_rules:     currentVerifyOut.failed_rules.map((f) => f.rule_id),
      repair_iteration: i + 1,
    });

    if (currentVerifyOut.passed) {
      return finalizeClassifyWithSiblingGate(currentSelectOut);
    }

    lastFailures = currentVerifyOut.failed_rules;
  }

  // All 3 repairs exhausted — hand off to escalation policy.
  return BaselineEscalation.onVerifierExhausted(state, currentSelectOut, lastFailures);
}

/* ---------------------------------------------------------------------------
 * CALIBRATED-CLASSIFY lever (ASK → CLASSIFY upgrade; env-gated; default OFF →
 * byte-identical). The MIRROR of the POST-L4 SIBLING-ASK lever.
 *
 * When L1 Triage returns ASK, handleTriageAsk ALREADY runs L2 (retrieve) + L3
 * (rulesFilter) + the QGS batch to build the candidate-aware question. This lever
 * inspects THOSE already-computed survivors: when they concentrate into ONE
 * residual subheading with a DOMINANT (large) rerank margin — the OPPOSITE
 * polarity of sibling-ASK's small-margin confusable signal — the gold leaf is
 * effectively pinned, so asking the user adds nothing. We instead run the EXACT
 * select/verify/repair sequence on the in-scope candidates and, if it verifies,
 * return a CLASSIFY. It can ONLY upgrade ASK→CLASSIFY: a select REFUSE or an
 * exhausted repair loop returns null → the original ASK is preserved (this lever
 * NEVER emits REFUSE).
 *
 * GATE: behind `CALIBRATED_CLASSIFY_ENABLED === 'true'`. Unset/anything else →
 * returns null BEFORE any work, so handleTriageAsk is byte-for-byte identical to
 * today. Opt-in for A/B measurement.
 *
 * Tunability (threshold sweeps without code changes):
 *   - CALIBRATED_CLASSIFY_ENABLED        'true' → on; anything else → off (default).
 *   - CALIBRATED_CLASSIFY_MARGIN         float, default 0.15 (gate B dominant cutoff).
 *   - CALIBRATED_CLASSIFY_STRONG_MARGIN  float, default 0.30 (gate C STRONG cutoff;
 *     at/above it the verbatim-pin DB fetch is skipped).
 * --------------------------------------------------------------------------- */

/** True only when the lever is explicitly enabled for this process. */
function calibratedClassifyEnabled(): boolean {
  return process.env.CALIBRATED_CLASSIFY_ENABLED === 'true';
}

/** Default gate-B dominant-margin cutoff. */
const DEFAULT_CALIBRATED_CLASSIFY_MARGIN = 0.15;
/** Default gate-C STRONG-margin cutoff (skip verbatim-pin DB fetch above it). */
const DEFAULT_CALIBRATED_CLASSIFY_STRONG_MARGIN = 0.3;

/** Read + parse the (sweepable) dominant-margin threshold; falls back to the default. */
function calibratedClassifyMargin(): number {
  const raw = process.env.CALIBRATED_CLASSIFY_MARGIN;
  if (raw === undefined) return DEFAULT_CALIBRATED_CLASSIFY_MARGIN;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_CALIBRATED_CLASSIFY_MARGIN;
}

/** Read + parse the (sweepable) STRONG-margin threshold; falls back to the default. */
function calibratedClassifyStrongMargin(): number {
  const raw = process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN;
  if (raw === undefined) return DEFAULT_CALIBRATED_CLASSIFY_STRONG_MARGIN;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_CALIBRATED_CLASSIFY_STRONG_MARGIN;
}

/** Lowercase + trim, mirroring L0's normalization basis for substring/token comparison. */
function ccNormalizeText(s: string): string {
  return s.toLowerCase().trim();
}

/** Order-insensitive significant word-token set of a string (for Jaccard). */
function ccTokenSet(s: string): Set<string> {
  return new Set(
    ccNormalizeText(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

/**
 * Gate-C VERBATIM half: does the normalized query (near-)pin the TOP survivor's
 * description? True when the query is a substring of the description (or vice
 * versa) OR their token sets have Jaccard ≥ 0.8. Pure + total.
 */
function ccVerbatimPin(normalizedQuery: string, description: string): boolean {
  const q = ccNormalizeText(normalizedQuery);
  const d = ccNormalizeText(description);
  if (q.length === 0 || d.length === 0) return false;
  if (d.includes(q) || q.includes(d)) return true;

  const qs = ccTokenSet(q);
  const ds = ccTokenSet(d);
  if (qs.size === 0 || ds.size === 0) return false;
  let inter = 0;
  for (const t of qs) if (ds.has(t)) inter += 1;
  const union = qs.size + ds.size - inter;
  if (union === 0) return false;
  return inter / union >= 0.8;
}

/**
 * CALIBRATED-CLASSIFY orchestrator helper. Mirrors maybeSiblingAskPostL4's shape:
 * env-gate FIRST (return null with ZERO work when off), never throws, returns null
 * to fall through to the original ASK.
 *
 * Fire path (gate A ∧ B from the pure fn, AND gate C = STRONG or VERBATIM):
 *   1. evaluateCalibratedClassify(rulesOut.filtered_candidates) — A (one subheading)
 *      + B (dominant/single-survivor margin). Not firing → null.
 *   2. Gate C — STRONG (margin ≥ strongMargin) short-circuits true. Else fetch the
 *      survivor descriptions (ONE Postgres PK lookup, no LLM) and require the TOP
 *      survivor's description to be (near-)pinned by the normalized query.
 *   3. On C-pass, build an L4Input from the in-scope normalized/triage/rules state
 *      and run the SHARED runSelectVerifyRepair. A CLASSIFY result is returned; a
 *      REFUSE / escalation outcome is discarded → null (preserve the original ASK).
 */
async function maybeCalibratedClassifyFromAsk(params: {
  retrievalOut: { query_embedding: number[] };
  rulesOut:     { filtered_candidates: RetrievalCandidate[]; matched_exclusions: L4Input['matched_exclusions'] };
  normalized:   NormalizedInput;
  triageOut:    TriageOutput;
  state:        PipelineRunState;
}): Promise<ClassifyResult | null> {
  // GATE — default OFF. Return BEFORE any DB/compute work so handleTriageAsk is
  // byte-for-byte identical when the lever is unset.
  if (!calibratedClassifyEnabled()) return null;

  try {
    const { retrievalOut, rulesOut, normalized, triageOut, state } = params;

    const decision = evaluateCalibratedClassify(rulesOut.filtered_candidates, {
      margin: calibratedClassifyMargin(),
      strongMargin: calibratedClassifyStrongMargin(),
    });
    if (!decision.fire) return null;

    // Gate C — STRONG (skip DB) OR VERBATIM-PIN (one PK lookup, no LLM).
    let verbatimMatch = false;
    if (!decision.strong) {
      const survivorCodes = rulesOut.filtered_candidates.map((c) => c.code);
      const chains = await getTariffLineParentChains(survivorCodes);
      // The TOP survivor (dominant leaf) — fall back to the first survivor when
      // the pure fn could not name a top code (single-survivor null-margin path).
      const topCode = decision.topCode ?? survivorCodes[0] ?? null;
      const topChain = topCode !== null ? chains.find((c) => c.code === topCode) : undefined;
      if (topChain === undefined) return null; // no description to pin against → preserve ASK
      verbatimMatch = ccVerbatimPin(normalized.normalized_query, topChain.description);
      if (!verbatimMatch) return null; // neither strong nor verbatim → preserve ASK
    }

    // FIRE — run the EXACT select/verify/repair sequence on the in-scope set.
    const headNouns = triageOut.extracted_attributes.head_nouns_for_fts;
    const l4Input: L4Input = {
      normalized_query: normalized.normalized_query,
      raw_tokens: normalized.raw_tokens,
      composite_flag: normalized.composite_flag,
      extracted_attributes: triageOut.extracted_attributes,
      candidate_chapters: triageOut.candidate_chapters,
      filtered_candidates: rulesOut.filtered_candidates,
      matched_exclusions: rulesOut.matched_exclusions,
    };

    recordLayer(state, 'CALIBRATED-CLASSIFY', 'classify', {
      subheading: decision.subheading,
      margin: decision.marginVal,
      verbatim_match: verbatimMatch,
      strong: decision.strong,
    });

    const result = await runSelectVerifyRepair(l4Input, {
      state,
      activeRetrievalOut: retrievalOut,
      activeRulesOut: rulesOut,
      activeTriageOut: triageOut,
      normalized,
      activeHeadNouns: headNouns,
      qBudgetRemaining: state.q_budget_remaining,
      // The lever's own catch swallows transport errors → preserve the ASK; the
      // stage holder is a no-op here (handleTriageAsk has no §7 stage attribution).
      setStage: () => {},
    });

    // ONLY an upgrade to CLASSIFY is allowed. A REFUSE / escalation-shaped result
    // (or anything non-CLASSIFY) falls through to the original ASK — this lever
    // NEVER emits REFUSE.
    if (result.decision !== 'CLASSIFY') return null;

    recordLayer(state, 'CALIBRATED-CLASSIFY', 'upgraded', {
      subheading: decision.subheading,
      selected_code: result.classification?.code ?? null,
    });
    return result;
  } catch {
    // Never throw — any DB/compute hiccup degrades gracefully to the original ASK.
    return null;
  }
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
   * Delegated to the shared runSelectVerifyRepair runner (also driven by the
   * CALIBRATED-CLASSIFY lever) — behavior is byte-for-byte identical to the prior
   * inline block (proven by index.test.ts). The §7 stage attribution is preserved
   * via the setStage callback, which mutates this scope's `currentStage`.        */
  const baseL4Input: L4Input = {
    normalized_query: normalized.normalized_query,
    raw_tokens: normalized.raw_tokens,
    composite_flag: normalized.composite_flag,
    extracted_attributes: activeTriageOut.extracted_attributes,
    candidate_chapters: activeTriageOut.candidate_chapters,
    filtered_candidates: activeRulesOut.filtered_candidates,
    matched_exclusions: activeRulesOut.matched_exclusions,
  };
  const result = await runSelectVerifyRepair(baseL4Input, {
    state,
    activeRetrievalOut,
    activeRulesOut,
    activeTriageOut,
    normalized,
    activeHeadNouns,
    qBudgetRemaining: q_budget_remaining,
    setStage: (s) => { currentStage = s; },
  });
  return finalize(result, state, captureTrace);
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

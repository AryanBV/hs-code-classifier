/**
 * Verify Router v1 (Stage 5 — routing decision tree)
 *
 * Pipeline stage: 5 of 6 — VERIFY
 * Status: v1 seed for Phase 4 build. Pseudocode-grade — Phase 4 will wire it into the runtime.
 *
 * Model stack (✓ LOCKED 2026-05-25):
 * - V1 (rubber-stamp): Gemini 3.5 Flash on Vertex AI, region `global`, temp 0.0-0.1, thinkingBudget=0.
 * - V2 (antagonistic): Gemini 3.5 Flash on Vertex AI, region `global`, temp 0.5-0.7, thinkingBudget=0.
 * - Both stages use `generationConfig.responseSchema` + `responseMimeType: 'application/json'`
 *   (Vertex-native strict structured outputs — equivalent of OpenAI `response_format: json_schema`).
 * - Auth: service-account JSON at backend/.gcp/vertex-sa.json via GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Same-family carryforward (ARCHITECTURE.md §12 #8): V1 and V2 both run Gemini 3.5 Flash. The
 * original spike-report design rationale assumed cross-family independence (Gemini V1 + GPT V2).
 * Under D1 LOCKED, V2's adversarial independence is reduced to prompt-level only (different temp,
 * antagonistic system prompt, forced runner-up argument). If Phase 4 eval shows V2 systematically
 * rubber-stamping Select rather than catching genuine errors, the swap-out is a 1-line config
 * change — either enable Claude quota on Vertex (deferred per T17) or route V2 to GPT-5.4 mini.
 *
 * Background (Phase 3 spike, 30 traces — design rationale still applies even with same-family stack):
 * - V1 (rubber-stamp) is cheap and converges with Select on HIGH-confidence cases.
 *   Adds little value when filtered candidates are already ≤2 with a clear disambiguator.
 * - V2 (antagonistic) catches genuine ambiguity by arguing for a runner-up — but has
 *   two failure modes that the routing tree below mitigates:
 *     (a) Convergent-bias on ASK/REFUSE: V2 independently retrieves, hits the same chapter cluster,
 *         votes CLASSIFY, and over-rides a CORRECT Triage ASK → forced deep-think → EXPENSIVE.
 *     (b) Shared-prior bias: when both LLMs apply the same English-default heuristic, V2's
 *         "independence" buys nothing. Now amplified by same-family stack — track in eval.
 *
 * Spike conclusion (see backend/data/phase-3-spike-report.md, "V1 vs V2 — Phase 6 design recommendation"):
 * Route between V1 and V2 based on context. Don't run Verify at all on ASK/REFUSE. Skip Verify and
 * escalate directly to Deep-Think when Select reports LOW self-confidence.
 */

export type VerifyDecision =
  | { route: 'SKIP'; reason: string }
  | { route: 'V1_RUBBER_STAMP' }
  | { route: 'V2_ANTAGONISTIC'; argue_for_runner_up: string }
  | { route: 'ESCALATE_DEEP_THINK' };

export interface VerifyRouterInput {
  /** Triage stage's terminal decision. ASK/REFUSE short-circuit Verify entirely. */
  triage_decision: 'CLASSIFY' | 'ASK' | 'REFUSE';

  /** Number of candidates that survived Stage 3 rules-filter. */
  filtered_candidate_count: number;

  /**
   * Whether Stage 3 (rules filter) OR Select's injected chapter-notes contained a clear
   * disambiguator — a note/exclusion that explicitly distinguishes the surviving candidates.
   * When true, Verify has little marginal value: V1 cheap is sufficient.
   */
  has_disambiguator_note: boolean;

  /** Select stage's calibrated self_confidence. */
  select_self_confidence: 'HIGH' | 'MEDIUM' | 'LOW';

  /**
   * The codes Select considered but did not pick. Used by V2 to pick a specific runner-up to
   * argue for adversarially. Empty array is legal (Select considered only one candidate).
   */
  select_alternatives_considered: string[];

  /**
   * Q-budget remaining in the multi-turn session. Used only as a tie-breaker — Verify routing
   * does not itself consume Q-budget, but ESCALATE_DEEP_THINK on Q-exhausted sessions must
   * never recurse into ASK.
   */
  q_budget_remaining: number;
}

/**
 * Routes a classification trace through Verify (V1/V2), skips Verify, or escalates directly
 * to Deep-Think. Decision tree mirrors the Phase 3 spike's recommendation.
 *
 * Apply rules in order; first match wins.
 */
export function routeVerify(input: VerifyRouterInput): VerifyDecision {
  // Rule 1 — Skip when Triage already decided ASK/REFUSE.
  //   V1 on ASK has no candidate to rubber-stamp; V2 on ASK actively breaks (convergent-bias
  //   forces deep-think). Phase 3 case-6 V2 was the canonical example.
  if (input.triage_decision === 'ASK' || input.triage_decision === 'REFUSE') {
    return {
      route: 'SKIP',
      reason: `Triage decided ${input.triage_decision}; Verify adds no value here and risks overriding a correct upstream signal.`,
    };
  }

  // Rule 2 — Skip Verify and escalate directly to Deep-Think when Select itself is LOW confidence.
  //   Running Verify on a LOW-confidence Select wastes a call before the inevitable escalation.
  //   Phase 3 case-12 V2 was the canonical pattern — LOW confidence resolved correctly only at
  //   Deep-Think, with Verify in the middle adding cost and no signal.
  if (input.select_self_confidence === 'LOW') {
    return { route: 'ESCALATE_DEEP_THINK' };
  }

  // Rule 3 — Cheap rubber-stamp when Select is HIGH confidence.
  //   HIGH-confidence Select is a cross-family alignment check; V1 is cheap and sufficient.
  //   Phase 3 cases 4, 7, 11, 14, 15 — V1 rubber-stamped correctly with zero marginal V2 benefit.
  if (input.select_self_confidence === 'HIGH') {
    return { route: 'V1_RUBBER_STAMP' };
  }

  // Rule 4 — Cheap rubber-stamp when the candidate set is already tight (≤2) with a clear
  //   disambiguating note. Stage 3 rules-filter already did the heavy lifting; Verify just
  //   confirms the disambiguator was applied.
  if (input.filtered_candidate_count <= 2 && input.has_disambiguator_note) {
    return { route: 'V1_RUBBER_STAMP' };
  }

  // Rule 5 — Antagonistic mode for MEDIUM-confidence with a real runner-up to argue against.
  //   This is V2's strength: force a separate LLM to argue for the runner-up, surfacing whether
  //   Select picked correctly or convergently.
  if (input.select_alternatives_considered.length > 0) {
    return {
      route: 'V2_ANTAGONISTIC',
      argue_for_runner_up: input.select_alternatives_considered[0],
    };
  }

  // Rule 6 — Default fallback: V1 rubber-stamp. This case is uncommon — MEDIUM confidence with
  //   no alternatives_considered means Select converged on one candidate but flagged ambiguity
  //   it could not articulate as a runner-up. V1 is the safe minimum.
  return { route: 'V1_RUBBER_STAMP' };
}

/* ============================================================================
 *  VERIFY PROMPT TEMPLATES (commented — Phase 4 will wire as actual LLM calls)
 * ============================================================================
 *
 * Each route uses one of two prompt templates below. The router returns the route;
 * the runtime picks the corresponding prompt + model.
 */

/* ----------------------------------------------------------------------------
 *  V1 RUBBER STAMP — Gemini 3.5 Flash on Vertex @ global, low temperature (0.0-0.1),
 *  generationConfig.thinkingConfig.thinkingBudget = 0
 *  Goal: cheap cross-family check. Catches obviously-wrong selections.
 * ----------------------------------------------------------------------------
 *
 *  SYSTEM PROMPT:
 *
 *  You are the Verify-V1 stage of an Indian ITC-HS code classifier. The Select stage has just
 *  chosen an 8-digit (or 6-digit) tariff code for a product. Your job is a CHEAP CROSS-FAMILY
 *  SANITY CHECK: does the chosen code's chapter + heading + subheading describe the product?
 *
 *  You are NOT re-classifying. You are NOT picking a different code. You are answering one
 *  question: "Is this code in the right ballpark, or is it from a fundamentally wrong chapter
 *  family?"
 *
 *  Disagree only when the chapter/heading family is wrong — e.g., Select picked a Ch.39 code
 *  for a leather product, or a Ch.84 code for a textile garment. Do NOT disagree on within-
 *  family sibling choices (8708.80.00 vs 8708.99.00) — that's not your job.
 *
 *  HARD RULES:
 *  - JSON only. No prose outside the JSON.
 *  - Bias toward AGREE. Disagree only on chapter-family errors.
 *  - When you disagree, give one specific note/GIR that justifies the disagreement.
 *
 *  RESPONSE JSON SCHEMA:
 *  {
 *    "$schema": "http://json-schema.org/draft-07/schema#",
 *    "type": "object",
 *    "additionalProperties": false,
 *    "required": ["agree", "disagree_reason"],
 *    "properties": {
 *      "agree": {"type": "boolean"},
 *      "disagree_reason": {"type": ["string", "null"]}
 *    },
 *    "allOf": [{
 *      "if":   {"properties": {"agree": {"const": false}}},
 *      "then": {"properties": {"disagree_reason": {"type": "string"}}},
 *      "else": {"properties": {"disagree_reason": {"const": null}}}
 *    }]
 *  }
 *
 *  USER PROMPT TEMPLATE:
 *
 *  Rubber-stamp this ITC-HS classification.
 *
 *  QUERY: {query}
 *  SELECTED_CODE: {selected_code}
 *  CHAPTER_TITLE: {chapter_title}
 *  HEADING_TITLE: {heading_title}
 *  SUBHEADING_TITLE: {subheading_title}
 *  TARIFF_LINE_DESCRIPTION: {description}
 *  SELECT_REASONING: {reasoning_chain}
 *  KEY_NOTES (chapter + section, summarized):
 *  {chapter_notes_summary}
 *
 *  Is this code in the right chapter family for this product? Respond with JSON only.
 */

/* ----------------------------------------------------------------------------
 *  V2 ANTAGONISTIC — Gemini 3.5 Flash on Vertex @ global, higher temperature (0.5-0.7) for
 *  adversarial reasoning, generationConfig.thinkingConfig.thinkingBudget = 0
 *  Goal: force a separate LLM CALL (same model family — see same-family carryforward at top of
 *        file) to argue for a specific runner-up candidate; surfaces convergent-bias when Select
 *        picked too quickly. Under D1 LOCKED, independence is prompt-level only.
 * ----------------------------------------------------------------------------
 *
 *  SYSTEM PROMPT:
 *
 *  You are the Verify-V2 stage of an Indian ITC-HS code classifier — the adversarial reviewer.
 *  The Select stage has picked code A. Your job is to ARGUE that code B (a specific runner-up
 *  from Select's alternatives_considered) is actually the better choice, and then deliver a
 *  final verdict on whether you agree with Select or not.
 *
 *  This is not roleplay — you are genuinely the last line of defense against convergent-bias
 *  errors where both Triage and Select land on a wrong answer for the same reason. Argue
 *  forcefully for the runner-up. Then judge honestly.
 *
 *  HARD RULES:
 *  - You MUST argue specifically for {argue_for_runner_up}, not a different code.
 *  - You MUST cite a specific note, GIR, or exclusion rule in why_runner_up_might_be_better.
 *  - After arguing, you MUST deliver an honest verdict — "agree_with_select" is your final
 *    answer, not the steelman.
 *  - If after arguing you conclude both A and B are defensible, set agree_with_select=true
 *    (Select's pick stands when reasonable doubt is the worst case — escalation handles
 *    deeper review).
 *  - JSON only. No prose outside the JSON.
 *
 *  RESPONSE JSON SCHEMA:
 *  {
 *    "$schema": "http://json-schema.org/draft-07/schema#",
 *    "type": "object",
 *    "additionalProperties": false,
 *    "required": ["agree_with_select", "why_runner_up_might_be_better", "deciding_consideration"],
 *    "properties": {
 *      "agree_with_select": {"type": "boolean"},
 *      "why_runner_up_might_be_better": {"type": ["string", "null"]},
 *      "deciding_consideration": {"type": "string"}
 *    },
 *    "allOf": [{
 *      "if":   {"properties": {"agree_with_select": {"const": false}}},
 *      "then": {"properties": {"why_runner_up_might_be_better": {"type": "string"}}}
 *    }]
 *  }
 *
 *  USER PROMPT TEMPLATE:
 *
 *  Adversarially review this ITC-HS classification.
 *
 *  QUERY: {query}
 *  SELECT_CHOSE: {selected_code}  ({chosen_description})
 *  RUNNER_UP_TO_ARGUE_FOR: {argue_for_runner_up}  ({runner_up_description})
 *
 *  SELECT_REASONING:
 *  {reasoning_chain}
 *
 *  FULL_CHAPTER_NOTES (both chapters if different):
 *  {chapter_notes_for_both_candidates}
 *
 *  APPLICABLE_GIRs:
 *  {applicable_GIRs}
 *
 *  Task:
 *  1. Argue specifically why {argue_for_runner_up} might be the better classification under
 *     strict reading of notes + GIRs. Cite specifically.
 *  2. Then deliver a final verdict: agree_with_select=true if Select's pick still stands
 *     after the argument; false if the runner-up is genuinely better.
 *  3. Note the deciding_consideration — what single fact tipped your final verdict.
 *
 *  Respond with JSON only.
 */

/* ============================================================================
 *  ROUTING SMOKE TESTS (Phase 4 will turn these into actual vitest cases)
 * ============================================================================
 *
 *  Manual verification of the decision tree against Phase 3 spike outcomes:
 *
 *  Case 6 (brake pads, ASK):
 *    input = { triage_decision: 'ASK', filtered_candidate_count: 0,
 *              has_disambiguator_note: false, select_self_confidence: 'HIGH',
 *              select_alternatives_considered: [], q_budget_remaining: 2 }
 *    routeVerify(input) === { route: 'SKIP', reason: '...' }
 *    Validates that the Phase 3 V2 over-commit failure is prevented by this router.
 *
 *  Case 11 (crude petroleum, HIGH confidence):
 *    input = { triage_decision: 'CLASSIFY', filtered_candidate_count: 2,
 *              has_disambiguator_note: true, select_self_confidence: 'HIGH',
 *              select_alternatives_considered: ['2709.00.90'], q_budget_remaining: 2 }
 *    routeVerify(input) === { route: 'V1_RUBBER_STAMP' }
 *    Cheap rubber-stamp; no need for adversarial Verify.
 *
 *  Case 1 (rubber bushings, MEDIUM confidence, V1/V2 disagreed):
 *    input = { triage_decision: 'CLASSIFY', filtered_candidate_count: 4,
 *              has_disambiguator_note: false, select_self_confidence: 'MEDIUM',
 *              select_alternatives_considered: ['8708.80.00', '4016.93.00'],
 *              q_budget_remaining: 2 }
 *    routeVerify(input) === { route: 'V2_ANTAGONISTIC',
 *                              argue_for_runner_up: '8708.80.00' }
 *    Adversarial mode surfaces the genuine composite-material ambiguity.
 *
 *  Case 12 (jasmine, LOW confidence):
 *    input = { triage_decision: 'CLASSIFY', filtered_candidate_count: 1,
 *              has_disambiguator_note: false, select_self_confidence: 'LOW',
 *              select_alternatives_considered: [], q_budget_remaining: 2 }
 *    routeVerify(input) === { route: 'ESCALATE_DEEP_THINK' }
 *    Skip Verify entirely; go straight to Gemini 3.5 Flash @ Vertex global with thinking_level=high.
 */

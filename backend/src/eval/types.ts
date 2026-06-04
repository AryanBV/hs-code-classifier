// backend/src/eval/types.ts

import type { RateCI, ReliabilityBin } from './metrics';
import type { TokenUsageTotals } from '../classifier-v2/lib/token-meter';

export interface EvalTestCase {
  id: string;                    // e.g., "TC001", "S5-AUTO-003", "INT-001"
  query: string;
  source: string;                // e.g., "comprehensive-tier1", "session5-ambiguous"
  category: string;              // "automotive" | "textile" | "chemical" | "food_agri" | "metal" | "electronics" | "ambiguous" | "edge_case" | "other"

  // Ground truth labels
  expected_routing: 'classify' | 'ask' | 'reject';
  expected_chapter?: string;     // e.g., "87"
  expected_heading?: string;     // e.g., "8708"
  expected_code?: string;        // e.g., "8708.30.00"
  alternative_chapters?: string[];  // for ambiguous cases (from session5)
  expected_ambiguity?: string;   // for ask cases: what makes this ambiguous

  // Metadata
  difficulty: 'easy' | 'medium' | 'hard';
  tier?: 1 | 2 | 3;
  notes?: string;
  ground_truth_confidence?: 'high' | 'medium' | 'low';

  /* ---- STAGED calibrated-ASK fields (S0; OPTIONAL, additive) --------------- *
   * These fields are carried ONLY by the STAGED divergence-staging gold cases
   * (backend/src/eval/gold/divergence-staging.ts) and are absent on every frozen
   * master-suite case, so the frozen suite + report are unaffected. They drive the
   * over-ask / under-ask split metrics (CALIBRATED-ASK-EVAL-PLAN.md §2). All
   * OPTIONAL so the existing 385-case run never carries them.                    */

  /**
   * The discriminating attribute axis the case turns on (e.g. 'form',
   * 'composition', 'processing_state'). For a should-ASK case this is the silent
   * axis the system must ask about; for a should-NOT-ask residual-default case it
   * documents the single axis that is already pinned (or absent). Free-form label
   * — NOT validated against the AttributeKey enum, since staged axes may be
   * coarser than the runtime attribute vocabulary. Undefined on frozen cases.
   */
  expected_axis?: string;

  /**
   * SEPARATE, HUMAN-JUDGED signal (CALIBRATED-ASK-EVAL-PLAN.md §2): whether the
   * silent axis is genuinely answerable by a typical exporter from a single
   * targeted clarifying question with concrete options. This is a CURATION
   * judgement recorded by the gold author — it is DISTINCT from, and never
   * auto-derived from, the TLA-driven answer simulator (`answer-simulator.ts`),
   * which measures whether the GOLD attribute value happens to match an offered
   * option. The report surfaces COUNTS of this field; it never computes it.
   * `undefined`/null on frozen cases and wherever a human has not judged it.
   */
  option_answerability?: 'answerable' | 'hard' | 'unanswerable' | null;
}

export interface EvalReport {
  metadata: {
    timestamp: string;
    run_id: string;
    total_cases: number;
    duration_seconds: number;
    model: string;
    notes: string;
    errors: number;
    suite: string;              // "master" | "quick" | category name
  };
  routing: {
    accuracy: number;
    confusion_matrix: {
      classify_as_classify: number;
      classify_as_ask: number;
      classify_as_reject: number;
      ask_as_classify: number;
      ask_as_ask: number;
      ask_as_reject: number;
      reject_as_classify: number;
      reject_as_ask: number;
      reject_as_reject: number;
    };
  };
  classification: {
    weighted_average: number;
    chapter_accuracy: number;
    heading_accuracy: number;
    code_accuracy: number;
    per_chapter_breakdown: Record<string, { correct: number; total: number; accuracy: number }>;
  };

  /**
   * FROZEN SCORING POPULATION (EVAL_DESIGN.md §1). PRIMARY accuracy: denominator =
   * every non-error case carrying a gold code, INDEPENDENT of routing. A gold case
   * the system routed to ASK/REFUSE/(any non-classify) counts as a MISS — it is
   * NOT dropped. This kills the dilution trap where rerouting hard cases to ASK
   * shrinks n and inflates the conditional number. Each rate carries a Wilson 95%
   * CI. THIS is the number to gate on, never `precision_when_classifying`.
   */
  primary_accuracy: {
    /** |gold-code cases| (non-error) — the constant frozen denominator. */
    gold_code_cases: number;
    chapter: RateCI;
    heading: RateCI;
    code: RateCI;
  };

  /**
   * EVAL-ONLY top-k instrumentation (additive; NOT a gate). Over the SAME frozen
   * gold-code denominator as `primary_accuracy` (every non-error case carrying a
   * gold code), the fraction where the gold 8-digit code appears among the first
   * `k` `candidate_codes` (selected first + the model's `alternatives_considered`).
   * top-1 by construction equals `primary_accuracy.code` on delivered
   * classifications. A gold case that ASKed/REFUSEd/errored carries no
   * candidate_codes → it is a top-k MISS but stays in the denominator.
   *
   * FIDELITY: this measures the `selected + alternatives_considered` PROXY, a
   * LOWER bound on true retrieval top-k (see `EvalDetail.candidate_codes`). Absent
   * entirely when no scored case carries a gold code (denominator 0).
   */
  top_k_code_accuracy?: {
    /** Frozen denominator = all non-error gold-code cases (same as primary_accuracy). */
    gold_code_cases: number;
    /** Gold code is the FIRST candidate (selected). k=1, with Wilson 95% CI. */
    top_1: RateCI;
    /** Gold code is within the first 3 candidates. k=3, with Wilson 95% CI. */
    top_3: RateCI;
  };

  /**
   * SECONDARY DIAGNOSTIC — the OLD routing-conditional numbers (correct over
   * correctly-routed classify cases only). Relabeled to make explicit it is a
   * conditional precision, NOT the headline accuracy. Mirrors `classification.*`
   * but with CIs and an explicit (shrinking) denominator. NEVER gate on this.
   */
  precision_when_classifying: {
    /** correctly-routed classify cases (the conditional, dilutable denominator). */
    n: number;
    chapter: RateCI;
    heading: RateCI;
    code: RateCI;
  };

  /**
   * confident-wrong (EVAL_DESIGN.md §3): the system CLASSIFIED (responseType
   * 'classification') AND the 8-digit code was wrong — a confidently delivered
   * wrong answer. The headline harm metric (gated on absolute count + manual
   * review, not a threshold). Rate is over the ANSWERED set (cases the system
   * classified). The caseId list is for mandatory manual review.
   */
  confident_wrong: {
    /** Cases the system delivered as a classification (the answered set). */
    answered_count: number;
    /** Of those, how many had a wrong 8-digit code. */
    count: number;
    /** count / answered_count, with Wilson 95% CI. */
    rate: RateCI;
    /** Every confident-wrong test_case_id — for manual "is it indefensible?" review. */
    case_ids: string[];
    /**
     * OPTIONAL graded variant at τ=0.7: confident-wrong restricted to cases whose
     * `confidence` ≥ 0.7. Computed for visibility only — NOT a gate. Undefined when
     * no answered case carries a confidence.
     */
    graded_tau_0_7?: {
      threshold: number;
      /** Answered cases with confidence ≥ τ. */
      answered_count: number;
      count: number;
      rate: RateCI;
      case_ids: string[];
    };
  };

  /**
   * Calibration (EVAL_DESIGN.md §4) over classify cases carrying a confidence AND
   * a binary correctness. `brier_score` is the headline scalar; ECE uses
   * EQUAL-MASS bins (≤5) with a deterministic bootstrap CI. The reliability bins
   * are a directional diagnostic only. NEVER emit a "within 5%" claim — the CI is
   * the honest statement. Undefined when no classify case carries a confidence.
   */
  calibration?: {
    /** Classify cases with a confidence used for calibration. */
    sample_count: number;
    /** Mean squared error of the confidence forecasts (lower better). */
    brier_score: number;
    /** Expected Calibration Error (equal-mass bins). */
    ece: number;
    /** Deterministic bootstrap CI for ECE (1000 resamples, seeded). */
    ece_ci: { lower: number; upper: number; resamples: number };
    /** Number of equal-mass bins used (≤5). */
    bins_requested: number;
    /** Reliability bins (diagnostic). */
    reliability_bins: ReliabilityBin[];
  };

  /**
   * Latency over scored (non-error) cases, from per-case `response_time_ms`.
   * Order-of-magnitude wall-clock under the eval's concurrency, NOT a production
   * SLA measurement, but the p95/median shape is the budget signal.
   */
  latency: {
    median_ms: number;
    p95_ms: number;
    /** Cases contributing a response_time_ms. */
    sample_count: number;
  };

  /**
   * Cost roll-up. `est_total_usd` = Σ per-case `est_cost_usd`. As of A3, when
   * every scored case carried real `token_usage`, the per-case cost is the REAL
   * per-token cost and `is_order_of_magnitude` is false; `token_totals` then
   * carries the summed prompt/output/thoughts/cached tokens. If any scored case
   * lacked token_usage (legacy fallback), the figure mixes real + flat estimates
   * and `is_order_of_magnitude` is true. `token_totals` is present whenever at
   * least one scored case surfaced token_usage.
   */
  cost: {
    /** Total USD across scored cases (REAL per-token when token_usage present, else flat fallback). */
    est_total_usd: number;
    /**
     * True when the figure is NOT a precise per-token billing total — i.e. at
     * least one scored case fell back to the flat per-call estimate. False when
     * every scored case carried real token_usage (then est_total_usd is real).
     */
    is_order_of_magnitude: boolean;
    /**
     * Suite-level REAL token sums across all scored cases that carried
     * `token_usage` (A3). Absent when no scored case surfaced token usage
     * (e.g. a legacy-classifier run) — so a legacy run's report is unchanged.
     */
    token_totals?: {
      prompt_tokens: number;
      output_tokens: number;
      thoughts_tokens: number;
      cached_tokens: number;
      total_tokens: number;
      llm_calls: number;
      /** Cases that contributed real token_usage to these sums. */
      cases_with_token_usage: number;
    };
  };

  /**
   * POPULATION CLOSURE assertion (EVAL_DESIGN.md §2). Partitions the frozen
   * gold-code population by how the system routed each case so the EFFECTIVE
   * denominator can never silently leak a REFUSE/missing case. `closed` is true
   * iff `direct_classify + ask_cases + refused_with_gold + asked_not_simulated
   * === scored_with_gold`. buildReport THROWS when it is false.
   */
  population_closure: {
    scored_with_gold: number;
    direct_classify: number;
    ask_cases: number;
    refused_with_gold: number;
    /** ASK/other gold cases NOT carrying a simulation attempt (e.g. flag-off). */
    asked_not_simulated: number;
    closed: boolean;
  };

  question_quality: {
    targeted_pct: number;
    relevant_pct: number;
    average_score: number;
  };

  /**
   * End-to-end multi-turn ASK-recovery metrics. Present ONLY when the eval ran
   * with `--simulate-answers` (additive — omitted entirely otherwise, so a
   * baseline run's report is byte-for-byte unchanged). See answer-simulator.ts.
   *
   * `ask_recoverability_rate`: of cases the SYSTEM routed to ASK that carry a
   *   gold code, the fraction that reach the correct 8-digit code after the gold
   *   answer is fed back (multi-turn).
   * `end_to_end_*_accuracy`: chapter/heading/8-digit accuracy counting BOTH
   *   classify-direct-correct cases AND ask-then-correctly-answered cases over
   *   the same denominator (all scored cases that carry a gold code).
   */
  end_to_end_metrics?: {
    /** Cases the system ASKed that carry a gold code (the recovery denominator). */
    ask_case_count: number;
    /** Of those, how many reached the correct 8-digit code after the gold answer. */
    ask_recovered_correct: number;
    /** ask_recovered_correct / ask_case_count × 100 (0 when no ask cases). */
    ask_recoverability_rate: number;
    /** Average rounds attempted across the ASK-recovery cases. */
    ask_recovery_avg_rounds: number;
    /** ASK cases where no offered option matched the gold value (unanswerable). */
    ask_unanswerable: number;
    /** Direct classify cases (system CLASSIFY) with a correct 8-digit code. */
    classify_direct_correct: number;
    /**
     * LEGACY denominator (FIX-3): direct-classify cases + simulated-ASK cases
     * ONLY. It EXCLUDES gold cases the system REFUSEd (and any asked-not-simulated
     * gold case), so it is NOT the constant frozen denominator and can shrink as
     * cases reroute. Retained for backward comparison with old reports. The
     * spec-correct constant denominator is `goldCases.length` (the frozen
     * population), used by the `effective_*` metrics below.
     */
    scored_with_gold: number;
    /** LEGACY combined chapter accuracy over `scored_with_gold` (recovered-only denom — prefer `effective_chapter`). */
    end_to_end_chapter_accuracy: number;
    /** LEGACY combined heading accuracy over `scored_with_gold` (prefer `effective_heading`). */
    end_to_end_heading_accuracy: number;
    /** LEGACY combined 8-digit accuracy over `scored_with_gold` (prefer `effective_code`). */
    end_to_end_code_accuracy: number;

    /**
     * EFFECTIVE accuracy (EVAL_DESIGN.md §2) with a CONSTANT denominator = ALL
     * non-error gold-code cases (the same frozen population as primary_accuracy),
     * NOT just direct-classify + simulated-ask. = (outright-correct +
     * ASK-recovered-correct ≤2 rounds) / |gold-classify cases|. Wrong-after-ASK =
     * miss. This closes the REFUSE leak: a gold case that REFUSEd or was never
     * simulated stays in the denominator as a miss. Each carries a Wilson 95% CI.
     * The `end_to_end_*` fields above keep the legacy (recovered-only) denominator
     * for backward compatibility; `effective_*` is the spec-correct number.
     */
    effective_chapter: RateCI;
    effective_heading: RateCI;
    effective_code: RateCI;
    /** ASK-recovery as k/n with a Wilson 95% CI (never gate at n<30). */
    ask_recovery_ci: RateCI;
    /** Gold cases that REFUSEd after the ASK simulation (counted as misses). */
    refused_after_ask: number;

    /**
     * SIBLING-ASK lever sub-metrics (additive). Of the simulated ASK-recovery
     * cases, the subset whose initial question was raised by the SIBLING-ASK lever
     * (`ask_recovery_attempt.ask_trigger === 'sibling'`). When the lever is OFF
     * (default) NO case carries that trigger, so `sibling_ask_count` is 0 and the
     * rate is 0 — the report shape is unchanged but the values are inert.
     *
     * `sibling_ask_recoverability_rate`: of the sibling-ASK cases, the fraction
     * that reached the correct 8-digit code after the gold answer was fed back —
     * the milestone-gate signal ("the questions we ask must be answerable").
     */
    sibling_ask_count: number;
    /** sibling-ASK cases that recovered the correct 8-digit code. */
    sibling_ask_recovered_correct: number;
    /** sibling_ask_recovered_correct / sibling_ask_count × 100 (0 when none). */
    sibling_ask_recoverability_rate: number;
  };

  /**
   * OVER-ASK / UNDER-ASK split metrics (CALIBRATED-ASK-EVAL-PLAN.md §2 — the
   * RDC-X / cross-subheading-ASK flip gate). ADDITIVE: present on EVERY report
   * (the rates are simply 0/empty when no labeled cases exist), so the frozen
   * 385-case run is unaffected. These are computed PURELY from the per-case
   * ground-truth `expected_routing` + the system's `actual_routing` (+ the
   * optional `ask_trigger` slice), so they NEVER require `--simulate-answers` for
   * the two rates themselves; `ask_recoverability` reuses the simulation path.
   *
   * Definitions (see metrics.ts `routingSplitMetrics`):
   *  - over_ask  = of gold cases whose `expected_routing === 'classify'`, the
   *    fraction the system routed to ASK (a FALSE ask). Wilson 95% CI.
   *  - under_ask = of gold cases whose `expected_routing === 'ask'`, the fraction
   *    the system delivered a classification (a MISSED ask). Wilson 95% CI.
   *  - ask_recoverability = of cases that the system ASKed AND that carry a
   *    simulated recovery attempt, the fraction that reached the correct gold
   *    8-digit code after the gold answer (the "answerable question" signal).
   *    Empty (0/0) when `--simulate-answers` did not run.
   *  - `by_trigger` slices each rate by the lever that fired (triage / sibling /
   *    cross_subheading), so the cross-subheading lever's contribution to
   *    over-ask is isolated (CALIBRATED-ASK-EVAL-PLAN.md §2). A slice key is
   *    present only when ≥1 case carries that trigger.
   */
  routing_split_metrics: RoutingSplitMetrics;

  details: EvalDetail[];
}

/**
 * One trigger-sliced view of the over-ask / under-ask / recoverability rates.
 * For `over_ask` the slice is "of the cases the system over-asked WITH this
 * lever, …". For `under_ask` it is "of the missed asks, the subset whose
 * ground-truth axis maps to this lever, …" (a missed ask has no FIRED trigger, so
 * the slice is keyed by the case's GT axis→trigger mapping when present, else
 * aggregated under `triage`). For `ask_recoverability` it is "of THIS lever's
 * fired asks, the fraction recovered". See metrics.ts `routingSplitMetrics`.
 */
export interface RoutingSplitByTrigger {
  /** Lever label: 'triage' | 'sibling' | 'cross_subheading'. */
  trigger: string;
  over_ask: RateCI;
  under_ask: RateCI;
  ask_recoverability: RateCI;
}

/** OVER-ASK / UNDER-ASK split metric block (CALIBRATED-ASK-EVAL-PLAN.md §2). */
export interface RoutingSplitMetrics {
  /**
   * OVER-ASK rate: of gold cases whose ground-truth `expected_routing` is
   * `classify`, the fraction the system returned `responseType === 'question'`
   * (a false ASK). Wilson 95% CI. n=0 → rate 0, [0,1] (no labeled classify case).
   */
  over_ask_rate: RateCI;
  /**
   * UNDER-ASK rate: of gold cases whose ground-truth `expected_routing` is `ask`,
   * the fraction the system returned `responseType === 'classification'` (a
   * missed ASK). Wilson 95% CI. n=0 → rate 0, [0,1] (no labeled ask case).
   */
  under_ask_rate: RateCI;
  /**
   * ASK-RECOVERABILITY: of cases the system ASKed that carry a simulated recovery
   * attempt (i.e. `--simulate-answers` ran AND a gold answer existed), the
   * fraction that reached the correct gold 8-digit code after the gold answer.
   * Wilson 95% CI. n=0 → rate 0, [0,1] (no simulated ask case).
   */
  ask_recoverability: RateCI;
  /** Number of gold cases with `expected_routing === 'classify'` (over-ask denom). */
  expected_classify_count: number;
  /** Number of gold cases with `expected_routing === 'ask'` (under-ask denom). */
  expected_ask_count: number;
  /**
   * Per-trigger slices. Present only for triggers that ≥1 case carries — empty
   * array when no case carries a trigger (the frozen-suite default). Lets a gate
   * isolate the cross-subheading lever's over-ask contribution.
   */
  by_trigger: RoutingSplitByTrigger[];
  /**
   * Counts of the SEPARATE, human-judged `option_answerability` label across
   * cases that carry it (CALIBRATED-ASK-EVAL-PLAN.md §2). Diagnostic only — NOT a
   * rate, NEVER auto-derived. All zero when no case carries the label (frozen).
   */
  option_answerability_counts: {
    answerable: number;
    hard: number;
    unanswerable: number;
    /** Cases carrying NO human judgement (label absent/null). */
    unjudged: number;
  };
}

export interface EvalDetail {
  test_case_id: string;
  query: string;
  expected_routing: string;
  actual_routing: string;
  routing_correct: boolean;
  expected_chapter?: string;
  actual_chapter?: string;
  chapter_correct?: boolean;
  expected_heading?: string;
  actual_heading?: string;
  heading_correct?: boolean;
  expected_code?: string;
  actual_code?: string;
  code_correct?: boolean;
  alternative_chapters?: string[];
  alternative_match?: boolean;

  /**
   * STAGED gold-case label (S0, OPTIONAL, additive): the case's GROUND-TRUTH
   * expected routing axis for the over-ask / under-ask split metrics, copied
   * verbatim from `EvalTestCase.expected_routing`. Already a top-level GT label,
   * but mirrored onto the detail so the metrics + a saved report can slice by it
   * without re-joining the suite. Absent has no effect (frozen cases keep it).
   */
  // (expected_routing above already carries the GT routing — no extra field.)

  /**
   * EVAL-ONLY (S0; OPTIONAL, additive, behavior-neutral): which lever raised the
   * clarifying question on an ASK detail, copied from the v2 result's
   * `question.trigger` (`'triage' | 'sibling' | 'cross_subheading'`). Present on
   * ANY ASK case (NOT only simulated-recovery cases), so the over-ask / under-ask
   * rates can be sliced by trigger even without `--simulate-answers`. Absent on
   * non-ASK details and on ASK details whose question carried no trigger (legacy /
   * the current live L1 triage ask, which is therefore reported under the
   * `triage` slice by convention). This is a SUPERSET surface of the
   * `ask_recovery_attempt.ask_trigger` (which exists only on simulated cases).
   */
  ask_trigger?: 'triage' | 'sibling' | 'cross_subheading';

  /**
   * STAGED gold-case label (S0; OPTIONAL, additive): SEPARATE, human-judged
   * option-answerability copied from `EvalTestCase.option_answerability` for
   * report counting. NEVER auto-derived (it is a curation judgement, distinct
   * from the answer-simulator's TLA match). Absent/null on frozen cases.
   */
  option_answerability?: 'answerable' | 'hard' | 'unanswerable' | null;

  /**
   * EVAL-ONLY instrumentation (additive, behavior-neutral). The ranked list of
   * 8-/6-digit candidate CODES the classifier considered for this case, SELECTED
   * CODE FIRST, followed by the model's `alternatives_considered` (in the model's
   * own ranking order). Populated ONLY on a delivered classification (decision
   * CLASSIFY); absent on ASK/REFUSE/error. Lets a re-run compute top-k accuracy
   * (is the gold code among the first k considered) WITHOUT re-running the model.
   *
   * SOURCE + FIDELITY: this is the `selected_code + classification.alternatives_
   * considered` PROXY, not the full L3 reranked candidate set. `alternatives_
   * considered` is a code-only array (select-v2.md schema: pattern
   * `^\d{4}\.\d{2}(\.\d{2})?$`, maxItems 4), so the proxy carries at most 5 codes
   * and reflects what the MODEL chose to surface as runners-up — NOT every code
   * L4 saw. A gold code that was retrieved into L4's candidate set but which the
   * model neither selected nor listed will NOT appear here (top-k is a LOWER
   * bound on true retrieval recall). Codes are stored verbatim (dotted form); the
   * scorer normalizes before comparison.
   */
  candidate_codes?: string[];

  question_asked?: string;
  question_score?: number;
  confidence?: number;
  response_time_ms: number;
  score: number;
  error?: string;

  /**
   * True for per-case ERRORS — thrown exceptions (timeout, persistent
   * Cohere/Supabase L2/L3 transport failure) AND v2 `system_error` results
   * (persistent Vertex transport failure surfaced by the orchestrator). These
   * are INFRA failures, not model decisions: they are tolerated, counted/reported
   * separately, and EXCLUDED from routing/accuracy metrics (so a transient
   * outage cannot corrupt the baseline). A normal model REFUSE is NOT an error.
   */
  is_error?: boolean;

  /* ---- v2 diagnostics (Phase 4.2a Task 12) -------------------------------- *
   * Captured from the raw ClassifyResult.diagnostics. Optional because the
   * legacy classifier does not produce them; populated for every v2 case
   * (including errors, when diagnostics are available).                        */

  /** Layer hops the query passed through, e.g. ['L0','L1','L2',...]. */
  escalation_path?: string[];
  /** Count of LLM calls made for this case (L1/L4/L6/L7). */
  llm_calls?: number;
  /**
   * USD cost for this case. As of A3, when the orchestrator surfaces real
   * per-call token usage (`diagnostics.token_usage`), this is the REAL per-token
   * cost summed across models (`cost_is_real: true`). When token_usage is absent
   * (e.g. the legacy classifier), it falls back to `llm_calls ×
   * REPRESENTATIVE_CALL_USD` (a flat per-call estimate — see runner.ts) and
   * `cost_is_real` is false/absent. Undefined when llm_calls is unavailable.
   */
  est_cost_usd?: number;
  /**
   * True when `est_cost_usd` was computed from REAL per-token usage
   * (`diagnostics.token_usage`); false/absent when it is the flat per-call
   * fallback. Lets the report flag whether the cost figure is real or estimated.
   */
  cost_is_real?: boolean;
  /**
   * REAL per-call Gemini token sums for this case (A3), copied from
   * `ClassifyResult.diagnostics.token_usage`. Present only when the v2
   * orchestrator surfaced it (absent for the legacy classifier). `llmCalls`
   * counts ALL metered generateContent calls (L1 + L4 + repair/backtrack selects
   * + the L2 Gemini-Flash reranker) and is therefore a SUPERSET of (>=)
   * `llm_calls`, which counts only L1/L4 (and would-be L6/L7) decision calls.
   */
  token_usage?: TokenUsageTotals;
  /**
   * True when the verifier rejected/escalated the chosen answer at least once
   * (escalation_path contains an 'L5:repair*' entry or 'L6:would_escalate')
   * AND the final code matched the gold. Surfaces "correct answers the verifier
   * almost killed" — a calibration signal for verifier strictness.
   */
  verifier_rejected_but_correct?: boolean;

  /**
   * Multi-turn ASK-recovery trace. Populated ONLY when the eval ran with
   * `--simulate-answers` AND this case's system decision was ASK AND the case
   * carries a gold code. Additive: absent entirely in a baseline run, so an
   * existing detail object is byte-for-byte unchanged when the flag is off.
   *
   * The simulated answer is always the gold-true `tariff_line_attributes` value
   * for the asked discriminating attribute — an HONEST measure of "if the user
   * answers correctly, do we reach the right code?", not gaming.
   */
  ask_recovery_attempt?: {
    initial_question_id: string;
    /**
     * Which lever raised the initial clarifying question this recovery attempt
     * answered: `'triage'` (L1 chapter-level ASK), `'sibling'` (the SIBLING-ASK
     * leaf-disambiguation lever, fired between L3 and L4), or `'cross_subheading'`
     * (the CROSS-SUBHEADING ASK lever, also fired between L3 and L4 but spanning
     * 2+ subheadings). Mirrors `ClarifyingQuestion.trigger`. Absent when the
     * trigger is unknown (treated as triage). Lets the report split recoverability
     * by lever (sibling_ask_*, cross_subheading_ask_*).
     */
    ask_trigger?: 'triage' | 'sibling' | 'cross_subheading';
    rounds_attempted: number;
    final_decision: 'CLASSIFY' | 'ASK' | 'REFUSE' | 'UNANSWERABLE';
    final_code_if_classify?: string;
    /** Final code matched the gold 8-digit code after multi-turn recovery. */
    code_correct_after_recovery: boolean;
    /** True iff the recovered chapter (first 2 digits) matched gold. */
    chapter_correct_after_recovery: boolean;
    /** True iff the recovered heading (first 4 digits) matched gold. */
    heading_correct_after_recovery: boolean;
    answer_matches: {
      round: number;
      question_id: string;
      discriminating_attribute: string;
      gold_attribute_value: string | null;
      derived_answer_id: string | null;
      answer_found: boolean;
      system_decision_after: 'CLASSIFY' | 'ASK' | 'REFUSE' | 'UNANSWERABLE';
    }[];
  };
}

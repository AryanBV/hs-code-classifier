// backend/src/eval/types.ts

import type { RateCI, ReliabilityBin } from './metrics';

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
   * Cost roll-up. `est_total_usd` = Σ per-case `est_cost_usd` (each itself an
   * APPROX `llm_calls × representative-per-call`). Clearly ORDER-OF-MAGNITUDE —
   * real per-token instrumentation is deferred (no runtime change here).
   */
  cost: {
    /** APPROX total USD across scored cases (order-of-magnitude only). */
    est_total_usd: number;
    /** True — flags that this is NOT a real per-token billing figure. */
    is_order_of_magnitude: true;
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

  details: EvalDetail[];
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
   * APPROXIMATE USD cost for this case. The orchestrator does NOT yet surface
   * per-call token usage (only `llm_calls`), so precise USD is not computable
   * per case. This is `llm_calls × REPRESENTATIVE_CALL_USD` (a documented flat
   * per-call estimate — see runner.ts). Treat as an order-of-magnitude figure
   * for relative comparison, NOT a billing number. Undefined when llm_calls is
   * unavailable.
   */
  est_cost_usd?: number;
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
     * answered: `'triage'` (L1 chapter-level ASK) or `'sibling'` (the SIBLING-ASK
     * leaf-disambiguation lever, fired between L3 and L4). Mirrors
     * `ClarifyingQuestion.trigger`. Absent when the trigger is unknown (treated as
     * triage). Lets the report split recoverability by lever (sibling_ask_*).
     */
    ask_trigger?: 'triage' | 'sibling';
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

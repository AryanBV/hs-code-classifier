// backend/src/eval/types.ts

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
  question_quality: {
    targeted_pct: number;
    relevant_pct: number;
    average_score: number;
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
}

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
}

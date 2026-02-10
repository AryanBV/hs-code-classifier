// backend/src/eval/gt-fix/types.ts

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DBCandidate {
  code: string;
  description: string;
  similarity?: number; // pgvector cosine similarity (0-1)
}

export interface GTFixProposal {
  case_id: string;
  query: string;
  source_file: string;
  fix_type: 'invalid_code' | 'missing_gt' | 'llm_flag';

  // Current ground truth
  current_chapter?: string;
  current_heading?: string;
  current_code?: string;

  // Proposed changes
  proposed_chapter?: string;
  proposed_heading?: string;
  proposed_code?: string;

  // Evidence
  confidence: ConfidenceLevel;
  reasoning: string;
  candidates: DBCandidate[];
  code_exists_in_db: boolean;

  // LLM-flag specific
  llm_source?: string;
  needs_verification?: boolean;
  tier?: number;
}

export interface GTFixReport {
  metadata: {
    script: string;
    timestamp: string;
    total_cases_analyzed: number;
    proposals_generated: number;
    by_confidence: Record<ConfidenceLevel, number>;
  };
  proposals: GTFixProposal[];
}

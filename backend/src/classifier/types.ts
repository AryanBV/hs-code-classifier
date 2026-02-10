// backend/src/classifier/types.ts

export interface ExtractedAttributes {
  material?: string;
  form?: string;
  function?: string;
  intended_use?: string;
  processing_state?: string;
  composition?: string;
  packaging?: string;
  industry?: string;
  origin?: string;
  raw_query: string;
}

export interface SpecificityResult {
  score: number;  // 0-100
  known_attributes: ExtractedAttributes;
  missing_attributes: string[];
  should_ask_question: boolean;
  suggested_question?: QuestionResponse;
}

export interface ChapterRoutingResult {
  chapter: string;  // 2-digit code
  confidence: number;
  reasoning: string;
  rule_applied?: string;
  notes_used?: string[];
  girs_applied?: string[];  // Track which GIRs influenced the decision
}

export interface HeadingSearchResult {
  heading: string;  // 4-digit code
  description: string;
  similarity: number;
  candidates: HeadingCandidate[];
}

export interface HeadingCandidate {
  code: string;
  description: string;
  similarity: number;
}

export interface CodeSelectionResult {
  code: string;  // 8-digit code
  description: string;
  confidence: number;
  reasoning: string;
}

export interface ClassificationResult {
  responseType: 'classification' | 'question';
  hsCode?: string;
  description?: string;
  confidence?: number;
  reasoning?: string;
  question?: string;
  options?: QuestionOption[];
  context?: string;
  brain_used?: boolean;
}

export interface QuestionResponse {
  question: string;
  options: QuestionOption[];
  context: string;
  attribute_needed: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  leads_to_chapter?: string;
}

export interface HsCodeRecord {
  id: number;
  code: string;
  description: string;
  notes: HsCodeNotes | null;
  parent_code: string | null;
  level: number;
}

export interface HsCodeNotes {
  chapterNumber?: string;
  chapterTitle?: string;
  chapterNotes?: string[];
  sectionNotes?: string[];
  policyConditions?: PolicyCondition[];
  exportLicensingNotes?: string;
}

export interface PolicyCondition {
  number?: number;
  description: string;
}

export interface ChapterRule {
  id: string;
  name: string;
  description: string;
  condition: (attrs: ExtractedAttributes) => boolean;
  chapter: string;
  priority: number;
  legal_basis: string;
}

// Legacy interfaces for backward compatibility
export interface ClassificationRequest {
  query: string;
  countryCode?: string;
}

// ===== Brain Module Types (M3: ARY-26/ARY-27) =====

export interface QAPair {
  question: string;
  answer: string;
}

export interface BrainAttributes {
  material: string;
  form: string;
  function: string;
  intended_use: string;
  processing_state: string;
  composition: string;
  industry: string;
  origin: string;
}

export interface BrainQuestion {
  text: string;
  options: BrainQuestionOption[];
  attribute_needed: string;
  context: string;
}

export interface BrainQuestionOption {
  id: string;
  label: string;
  leads_to_chapter: string;
  description: string;
}

export interface BrainOutput {
  attributes: BrainAttributes;
  readiness: {
    score: number;
    missing_critical: string[];
    has_ambiguity: boolean;
  };
  decision: 'classify' | 'ask_targeted' | 'disambiguate' | 'reject';
  confidence: number;
  reasoning: string;
  question: BrainQuestion;
  suggested_chapters: string[];
}

export interface RouteDecision {
  action: 'classify' | 'ask' | 'reject';
  attributes?: ExtractedAttributes;
  suggestedChapters?: string[];
  question?: QuestionResponse;
  message?: string;
}

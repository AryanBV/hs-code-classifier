/**
 * Frozen API contract for the Prevyl ITC-HS classifier.
 *
 * Source of truth: backend `src/api/v2-api-adapter.ts` (`ApiClassifyResponse`)
 * + `src/api/classify.ts` (route). Do NOT drift from it.
 *
 * IMPORTANT — band-only by design:
 * The backend DTO carries a numeric `confidence` (0-100) and a raw `selfConfidence`
 * enum. The locked product rule is that the UI shows a confidence BAND ONLY and
 * NEVER renders the number. To make that impossible to violate by accident, the
 * client (`lib/api.ts`) strips `confidence`, `confidenceP`, and `selfConfidence`
 * before handing results to components. Components only ever see the UI types below.
 */

// ----------------------------------------------------------------------------
// Shared value types
// ----------------------------------------------------------------------------

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface Alternative {
  /** Leaf code, e.g. "7318.15.90" */
  code: string;
  /** Leaf tariff-line description hydrated from the DB. */
  description: string;
}

export type CitationType = 'note' | 'exclusion' | 'leaf_description';

export type GIRIdentifier =
  | 'GIR-1'
  | 'GIR-2(a)'
  | 'GIR-2(b)'
  | 'GIR-3(a)'
  | 'GIR-3(b)'
  | 'GIR-3(c)'
  | 'GIR-4'
  | 'GIR-5(a)'
  | 'GIR-5(b)'
  | 'GIR-6';

export interface CitationPrimary {
  type: CitationType;
  /** DB locator, e.g. "headings.7318", "chapter_exclusions.id=842". */
  source_ref: string;
  /** Verbatim DB text (the note/exclusion/leaf text — NOT the product description). */
  verbatim_text: string;
  note_or_exclusion_id: number | null;
}

export interface Citation {
  primary: CitationPrimary;
  gir_applied: GIRIdentifier;
}

export interface ClassificationComponent {
  name: string;
  material: string;
  role: 'primary' | 'secondary' | 'auxiliary';
}

/** Out-of-scope refusal buckets (the ~5 the UI buckets on, plus internal ones). */
export type RefuseReason =
  | 'extraterrestrial'
  | 'fictional'
  | 'services_not_goods'
  | 'contraband'
  | 'weapons_restricted_class'
  | 'function_only_no_substance'
  | 'incoherent_query'
  | 'genuinely_indistinguishable'
  | 'backtrack_no_fit';

export type AttributeKey =
  | 'material'
  | 'form'
  | 'function'
  | 'intended_use'
  | 'processing_state'
  | 'composition';

export interface QuestionOption {
  /** Stable snake_case token; becomes the answerId. */
  id: string;
  label: string;
}

// ----------------------------------------------------------------------------
// WIRE types — exactly what the backend sends. Internal to lib/api.ts.
// ----------------------------------------------------------------------------

export interface WireClassification {
  responseType: 'classification';
  hsCode: string;
  description: string;
  /** 0-100; hidden — stripped before reaching components. */
  confidence: number;
  confidenceBand: ConfidenceBand;
  /** reserved 0..1 calibrated prob; absent at launch; hidden. */
  confidenceP?: number;
  reasoning: string;
  alternatives: Alternative[];
  isSixDigit: boolean;
  exportPolicy: string | null;
  policyCondition: string | null;
  indiaSpecific: boolean;
  /** raw signal behind the band; hidden — stripped before components. */
  selfConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  citation: Citation;
  components: ClassificationComponent[] | null;
  processingTimeMs?: number;
}

export interface WireQuestion {
  responseType: 'question';
  question: string;
  options: QuestionOption[];
  questionId: string;
  discriminatingAttribute: AttributeKey | string;
  processingTimeMs?: number;
}

export interface WireRefused {
  responseType: 'refused';
  message: string;
  reason: RefuseReason | null;
  processingTimeMs?: number;
}

export type WireResponse = WireClassification | WireQuestion | WireRefused;

// ----------------------------------------------------------------------------
// UI types — what components consume. Numeric confidence is NOT present.
// ----------------------------------------------------------------------------

export interface UiClassification {
  responseType: 'classification';
  hsCode: string;
  description: string;
  confidenceBand: ConfidenceBand;
  reasoning: string;
  alternatives: Alternative[];
  isSixDigit: boolean;
  exportPolicy: string | null;
  policyCondition: string | null;
  indiaSpecific: boolean;
  citation: Citation;
  components: ClassificationComponent[] | null;
  processingTimeMs?: number;
}

export interface UiQuestion {
  responseType: 'question';
  question: string;
  options: QuestionOption[];
  questionId: string;
  discriminatingAttribute: AttributeKey | string;
  processingTimeMs?: number;
}

export interface UiRefused {
  responseType: 'refused';
  message: string;
  reason: RefuseReason | null;
  processingTimeMs?: number;
}

export type ClassifyResult = UiClassification | UiQuestion | UiRefused;

// ----------------------------------------------------------------------------
// Request shapes
// ----------------------------------------------------------------------------

export interface ClassifyRequest {
  query: string;
}

/** POST /api/classify/answer — multi-turn continuation (v2 contract). */
export interface AnswerRequest {
  /** The ORIGINAL query, verbatim, kept constant across the session. */
  originalQuery: string;
  /** Echoes the question's questionId. */
  questionId: string;
  /** The chosen option's id. */
  answerId: string;
  /** Prior rounds' {questionId: answerId} map. */
  previousAnswers?: Record<string, string>;
  /** Number of clarifying rounds already completed. */
  rounds?: number;
}

/**
 * Transient/limit envelopes returned OUTSIDE the responseType union:
 * - 503 system_error / timeout: { error, retryable: true }
 * - 503 daily ceiling:          { error: 'Daily limit reached', retryable: false }
 */
export interface ServiceError {
  error: string;
  retryable: boolean;
}

export class ClassifyError extends Error {
  constructor(
    message: string,
    readonly kind: 'transient' | 'daily_limit' | 'network' | 'bad_request',
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ClassifyError';
  }
}

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
// Trade-intelligence (additive). Mirrors the backend `TradeIntelligence` shape
// in `backend/src/api/trade-intel-assembler.ts` (EXPERIENCE-DESIGN §4.4 /
// TRADE-INTELLIGENCE-PLAN §5). Every datum carries `asOn` + `sourceUrl` +
// `indicative: true`. Sparse-friendly: each sub-block may be null. This is a
// hand-mirrored contract — keep it byte-aligned with the backend type.
// ----------------------------------------------------------------------------

export type ExportPolicyStatus = 'Free' | 'Restricted' | 'Prohibited' | 'STE';
export type PolicySeverity = 'danger' | 'warning' | 'notice' | 'grey';

export interface TradeExportPolicy {
  status: ExportPolicyStatus | null;
  statusPlain: string;
  severity: PolicySeverity;
  conditionVerbatim: string | null;
  conditionMissing: boolean;
  asOn: string | null;
  sourceUrl: string;
  stale: boolean;
  staleAdvisory: string | null;
  indicative: true;
}

export interface TradeExportDuty {
  isNil: boolean;
  rateText: string | null;
  conditionVerbatim: string | null;
  mappable: boolean;
  /** TRUE only for the mappable=false misattribution guard (not staleness). */
  verify: boolean;
  /** TRUE when past the freshness budget. The value is still SHOWN (with advisory). */
  stale: boolean;
  staleAdvisory: string | null;
  asOn: string | null;
  sourceUrl: string | null;
  indicative: true;
}

export interface TradeIncentive {
  kind: 'rosctl' | 'rodtep';
  ratePct: number;
  cap: string | null;
  capUnit: string | null;
  /** TRUE when past the freshness budget. The value is still SHOWN (with advisory). */
  stale: boolean;
  staleAdvisory: string | null;
  asOn: string;
  sourceUrl: string;
  indicative: true;
}

export interface TradeUqc {
  code: string;
  label: string | null;
}

/** A datum withheld for being stale-past-budget (not export policy, which is never hidden). */
export interface TradeVerifyState {
  verifyOnly: true;
  asOn: string | null;
  sourceUrl: string | null;
  indicative: true;
}

export interface TradeFlag {
  type: 'scomet' | 'qco' | 'adcvd';
  message: string;
  sourceUrl: string;
  versionDate: string | null;
  absenceNotClearance: true;
}

export interface TradeIntelligence {
  exportPolicy: TradeExportPolicy;
  exportDuty: TradeExportDuty | TradeVerifyState | null;
  incentive: TradeIncentive | TradeVerifyState | null;
  uqc: TradeUqc | null;
  flags: TradeFlag[];
  disclaimer: string;
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
  /**
   * ADDITIVE (Track A): dated/indicative trade-intelligence for the final code.
   * Best-effort + OPTIONAL — null/absent when the backend holds no trade-intel
   * data (Phase-1 pre-ingest) or a query fails. NOT a hidden field, so it flows
   * through to `UiClassification` via the Omit untouched (the band-only strip in
   * `lib/api.ts` only removes the confidence signals).
   */
  tradeIntelligence?: TradeIntelligence | null;
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
//
// STRUCTURAL honesty guarantee: the UI types are DERIVED from the Wire types by
// OMITTING the hidden numeric signals (`confidence`, `confidenceP`,
// `selfConfidence`). They are not hand-maintained parallel interfaces, so they
// cannot drift back into exposing a number — if a hidden field is ever added to
// a Wire type, it is absent from the UI type by construction, and the `toUi`
// strip in `lib/api.ts` stays type-sound. Components consuming `ClassifyResult`
// have NO type-level access to the percentage; the band is the only signal.
// ----------------------------------------------------------------------------

/** The keys stripped at the wire→UI boundary so the percentage can never render. */
export type HiddenConfidenceKey = 'confidence' | 'confidenceP' | 'selfConfidence';

export type UiClassification = Omit<WireClassification, HiddenConfidenceKey>;

export type UiQuestion = WireQuestion;

export type UiRefused = WireRefused;

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

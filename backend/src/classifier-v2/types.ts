import type { PredicateRef } from './db/predicate-dsl';

/**
 * Shared TypeScript interfaces for the Phase 4 v2 classifier pipeline.
 *
 * Source-of-truth references:
 *   - Pipeline overview + per-layer I/O contract: backend/docs/ARCHITECTURE.md §2, §3
 *   - QGS info-gain + Backtrack ConstraintHint:  backend/docs/sub-specs/02-qgs-and-backtrack.md §A, §B.1
 *   - Verifier rules + Predicate DSL:            backend/docs/sub-specs/01-verifier-rules.md
 *   - Triage response schema:                    backend/prompts/triage-v2.md (RESPONSE JSON SCHEMA)
 *   - Select response schema:                    backend/prompts/select-v2.md (RESPONSE JSON SCHEMA)
 *
 * This file contains types only — no runtime logic. Layer implementations
 * (L0..L8) live in `backend/src/classifier-v2/layers/`.
 */

/* ============================================================================
 * Common scalars
 * ============================================================================ */

/** 2-digit chapter code (DB CHECK: `^\\d{2}$`). */
export type ChapterCode = string;

/** 4-digit heading code (DB CHECK: `^\\d{4}$`). */
export type HeadingCode = string;

/** 6-digit subheading code (DB CHECK: `^\\d{4}\\.\\d{2}$`). */
export type SubheadingCode = string;

/** 8-digit tariff line code (DB CHECK: `^\\d{4}\\.\\d{2}\\.\\d{2}$`). */
export type TariffLineCode = string;

/** Any hierarchical level we might attach to a retrieval candidate. */
export type HierarchyLevel = 'chapter' | 'heading' | 'subheading' | 'tariff_line';

/** Triage attribute axis vocabulary (matches triage-v2.md). */
export type AttributeKey =
  | 'material'
  | 'form'
  | 'function'
  | 'intended_use'
  | 'processing_state'
  | 'composition';

/** Select self-confidence enum (matches select-v2.md). */
export type SelfConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** GIR identifier enum used across Select / Verifier. */
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

/** out_of_scope_class enum (triage-v2.md + sub-spec 02 §B.4 additions). */
export type OutOfScopeClass =
  | 'extraterrestrial'
  | 'fictional'
  | 'services_not_goods'
  | 'contraband'
  | 'weapons_restricted_class'
  | 'function_only_no_substance'
  | 'incoherent_query'
  | 'genuinely_indistinguishable'
  | 'backtrack_no_fit';

/* ============================================================================
 * Layer 0 — Input Normalization
 * ============================================================================ */

/** Single alias substitution record (audit trail). */
export interface AliasApplied {
  alias:         string;
  replaced_with: string;
}

export interface NormalizedInput {
  /** Original user query (verbatim). */
  query: string;
  /** Alias-substituted, lowercased, whitespace-normalized query (L0 output). */
  normalized_query: string;
  /** Tokenized form of normalized_query — preserves user terms incl. abbreviations. */
  raw_tokens: string[];
  /** Layer 0 multi-material/multi-component heuristic. Drives GIR 3(b) requirement in Select. */
  composite_flag: boolean;
  /** Audit trail of alias substitutions actually applied (in order). */
  aliases_applied: AliasApplied[];
}

/* ============================================================================
 * Layer 1 — Triage (per backend/prompts/triage-v2.md + sub-spec 02 §B.1)
 * ============================================================================ */

/** Backtrack hint built by L3 when all candidates are excluded (sub-spec 02 §B.1). */
export interface ConstraintHint {
  exclude_chapters:    ChapterCode[];
  prefer_chapters:     ChapterCode[];
  reason:              string;
  source_exclusion_id: number;
}

export interface TriageInput {
  normalized_query:   string;
  previousAnswers:    Record<string, string>;
  q_budget_remaining: number;
  constraint_hint:    ConstraintHint | null;
}

export interface TriageExtractedAttributes {
  material:                    string | null;
  material_confidence:         number | null;
  form:                        string | null;
  form_confidence:             number | null;
  function:                    string | null;
  function_confidence:         number | null;
  intended_use:                string | null;
  intended_use_confidence:     number | null;
  processing_state:            string | null;
  processing_state_confidence: number | null;
  composition:                 string | null;
  composition_confidence:      number | null;
  head_nouns_for_fts:          string[];
  raw_tokens:                  string[];
}

export interface TriageFallbackOption {
  /** Stable snake_case token; becomes the previousAnswers key on next round. */
  id:    string;
  label: string;
}

export interface TriageClarifyingQuestion {
  discriminating_attribute: AttributeKey;
  /** ≤200 chars (200 per schema; the prose says ≤120 for QGS fallback). */
  fallback_question_text:   string;
  fallback_options:         TriageFallbackOption[];
}

/** Verbatim shape from triage-v2.md RESPONSE JSON SCHEMA. */
export interface TriageOutput {
  decision:              'CLASSIFY' | 'ASK' | 'REFUSE';
  extracted_attributes:  TriageExtractedAttributes;
  candidate_chapters:    ChapterCode[];
  completeness_signal:   number;
  clarifying_question:   TriageClarifyingQuestion | null;
  refusal_reason:        string | null;
  out_of_scope_class:    OutOfScopeClass | null;
}

/* ============================================================================
 * Layer 2 — Hybrid Retrieval
 * ============================================================================ */

/** A single retrieval candidate with all per-stage scores attached. */
export interface RetrievalCandidate {
  /** The code at the hierarchy level this candidate represents. */
  code:           string;
  level:          HierarchyLevel;
  /** Cosine similarity from Cohere embed-v4 (0..1). */
  cosine_score:   number;
  /** Postgres FTS rank score; null when FTS did not contribute. */
  fts_rank:       number | null;
  /** Cohere Rerank 4 Pro relevance score; null before rerank. */
  rerank_score:   number | null;
  /** Hierarchy chain {chapter, heading, subheading, code} where defined. */
  parent_chain: {
    chapter:     ChapterCode | null;
    heading:     HeadingCode | null;
    subheading:  SubheadingCode | null;
    tariff_line: TariffLineCode | null;
  };
}

/** Pre-filter hit from GIN-FTS on chapter_exclusions.excluded_product_text. */
export interface ExclusionPreFilterHit {
  exclusion_id:           number;
  source_chapter:         ChapterCode;
  excluded_product_text:  string;
  redirects_to_chapter:   ChapterCode[];
}

/** Per-code score map entry (cosine + FTS rank + rerank). */
export interface RetrievalScoreEntry {
  cosine_score: number;
  fts_rank:     number | null;
  rerank_score: number | null;
}

/** FTS hit row promoted to L2 output. */
export interface FtsMatch {
  code:         string;
  matched_text: string;
  rank:         number;
}

/** Per-step latency + count instrumentation emitted by L2. */
export interface L2TraceEntry {
  step:      string;
  latencyMs: number;
  count:     number;
}

/** L2 strategy flag — controls whether L2 ran the full cascade or skipped rerank. */
export type RetrievalStrategy = 'direct_leaf_lookup' | 'cascade_full';

export interface RetrievalOutput {
  candidates:             RetrievalCandidate[];
  retrieval_scores:       Record<string, RetrievalScoreEntry>;
  fts_matches:            FtsMatch[];
  exclusion_pre_filter:   ExclusionPreFilterHit[];
  retrieval_strategy:     RetrievalStrategy;
  trace:                  L2TraceEntry[];
}

/* ============================================================================
 * Layer 3 — Rules Filter + Collapse
 * ============================================================================ */

/** A chapter_exclusions row that fired against a candidate in L3. */
export interface ExclusionMatch {
  exclusion_id:          number;
  source_chapter:        ChapterCode;
  excluded_product_text: string;
  redirects_to_chapter:  ChapterCode[];
  /** The candidate code(s) this exclusion took out. */
  affected_codes:        string[];
}

/** Reason taxonomy for an L3 candidate drop. */
export type L3DropReason = 'excluded' | 'collapsed_below_top5';

/** A candidate dropped by L3, recorded for audit + dropped_log emission. */
export interface DroppedCandidate {
  code:                   string;
  chapter:                ChapterCode;
  reason:                 L3DropReason;
  matched_exclusion_id?:  number;
  rerank_score?:          number | null;
}

/** Per-step latency + count instrumentation emitted by L3 (mirrors L2TraceEntry). */
export interface L3TraceEntry {
  step:      string;
  latencyMs: number;
  count:     number;
}

/**
 * L3 input — what the orchestrator hands the rules-filter layer. Combines the
 * full L2 retrieval output with the small subset of pipeline state we need to
 * decide whether to fire the single-shot backtrack gate.
 */
export interface RulesFilterInput {
  l2_output:           RetrievalOutput;
  normalized_query:    string;
  raw_tokens:          string[];
  head_nouns_for_fts:  string[];
  candidate_chapters:  ChapterCode[];
  /** From PipelineRunState — single-shot enforcement (sub-spec 02 §B.5). */
  backtrack_attempted: boolean;
}

export interface RulesFilterOutput {
  /** ≤5 surviving candidates after exclusions + multi-destination collapse. */
  filtered_candidates: RetrievalCandidate[];
  matched_exclusions:  ExclusionMatch[];
  dropped_log:         DroppedCandidate[];
  /** True when <2 candidates survive AND backtrack has not yet been attempted. */
  backtrack_signal:    boolean;
  /** Populated iff backtrack_signal === true; otherwise null. */
  constraint_hint:     ConstraintHint | null;
  trace:               L3TraceEntry[];
}

/* ============================================================================
 * Layer 4 — Select (per backend/prompts/select-v2.md)
 * ============================================================================ */

export type SelectCitationType = 'note' | 'exclusion' | 'leaf_description';

export interface SelectCitationPrimary {
  type:                 SelectCitationType;
  /** DB locator (e.g., `chapters.notes[2]`, `chapter_exclusions.id=842`). */
  source_ref:           string;
  /** Verbatim DB text — verifier MV-04 enforces TF-IDF ≥ 0.6 against source. */
  verbatim_text:        string;
  note_or_exclusion_id: number | null;
}

export interface SelectCitation {
  primary:     SelectCitationPrimary;
  gir_applied: GIRIdentifier;
}

export interface SelectComponent {
  name:     string;
  material: string;
  role:     'primary' | 'secondary' | 'auxiliary';
}

export interface SelectRefusal {
  reason: string;
}

/* ----------------------------------------------------------------------------
 * Layer 4 — Select INPUT + multi-signal context shapes
 * ---------------------------------------------------------------------------- */

/** Input handed to L4 by the orchestrator (assembled from L0/L1/L3 outputs). */
export interface L4Input {
  /** From L0 — alias-normalized query (verbatim user-facing string omitted). */
  normalized_query: string;
  /** From L0 — tokenized normalized query. */
  raw_tokens: string[];
  /** From L0 — multi-material / multi-component heuristic; gates GIR-3(b). */
  composite_flag: boolean;
  /** From L1 — full extracted-attribute bundle. */
  extracted_attributes: TriageExtractedAttributes;
  /** From L1 — chapters the model thought plausible. */
  candidate_chapters: ChapterCode[];
  /** From L3 — ≤5 surviving candidates after exclusion filter + collapse. */
  filtered_candidates: RetrievalCandidate[];
  /** From L3 — exclusion rules that fired during filtering. */
  matched_exclusions: ExclusionMatch[];
  /**
   * Optional repair feedback when L4 is re-invoked after Verifier rejection.
   * Null on first invocation; orchestrator populates on repair iterations.
   */
  verifier_failures?: VerifierRuleFailure[] | null;
  /** 0 on first invocation; 1-3 on repair iterations. */
  repair_iteration?: number;
  /** Optional override for current_year injection — defaults to new Date().getUTCFullYear(). */
  current_year?: number;
}

/** Candidate row shape rendered into the Select prompt (from DB). */
export interface SelectCandidateRow {
  code:                 string;
  is_six_digit_only:    boolean;
  description:          string;
  chapter:              ChapterCode;
  heading:              HeadingCode;
  subheading:           SubheadingCode;
  subheading_title:     string | null;
  heading_title:        string | null;
  chapter_title:        string | null;
  export_policy:        string | null;
  policy_condition:     string | null;
  india_specific:       boolean;
  india_specific_note:  string | null;
  retrieval_score:      number | null;
}

/** Per-chapter notes bundle injected into the Select user prompt. */
export interface SelectChapterNotesBundle {
  notes:                      unknown[];
  chapter_subheading_notes:   unknown[];
  supplementary_notes:        unknown[];
  export_licensing_notes:     unknown[];
  /** Section-level notes for this chapter's parent section. */
  section_notes:              unknown[];
}

/** Light-weight notes_claim shape consumed by L4 (subset of db/types NotesClaim). */
export interface SelectNotesClaim {
  id:           number;
  source:       'chapter_note' | 'section_note' | 'subheading_note' | 'heading_note';
  source_ref:   string;
  claim_type:   string;
  claim_text:   string;
  predicate:    string;
  applies_to:   ChapterCode[];
}

/** Multi-signal context bundle assembled in parallel for L4. */
export interface SelectContext {
  /** Candidate rows (fully hydrated from DB) — same ordering as filtered_candidates. */
  candidates:                  SelectCandidateRow[];
  /** Tariff-line attribute records, keyed by code. May be empty (O2 still extracting). */
  tariff_line_attributes:      Record<string, unknown>;
  /** Scoped notes_claims — only claims whose applies_to ∩ candidate_chapters ≠ ∅. */
  notes_claims:                SelectNotesClaim[];
  /** Per-chapter notes bundles, keyed by 2-digit chapter code. */
  chapter_notes_by_chapter:    Record<ChapterCode, SelectChapterNotesBundle>;
  /** Matched exclusion rules from L3 — passed through verbatim. */
  matched_exclusion_rules:     ExclusionMatch[];
  /** GIRs always supplied to the model (full set). */
  applicable_GIRs:             string;
  /** System fact: current calendar year (UTC). */
  current_year:                number;
}

/** Verbatim shape from select-v2.md RESPONSE JSON SCHEMA. */
export interface SelectOutput {
  /** 8-digit code, 6-digit subheading (fallback path), or null (refusal). */
  selected_code:             string | null;
  selected_code_is_six_digit: boolean;
  export_policy:             string | null;
  policy_condition:          string | null;
  india_specific_flag:       boolean;
  /** 2-5 bullets per MV-09. */
  reasoning_chain:           string[];
  citation:                  SelectCitation;
  exclusions_checked:        number[];
  self_confidence:           SelfConfidence;
  alternatives_considered:   string[];
  /** Required when citation.gir_applied === 'GIR-3(b)'; null otherwise. */
  components:                SelectComponent[] | null;
  refusal:                   SelectRefusal | null;
}

/* ============================================================================
 * Layer 5 — Mechanical Verifier
 * ============================================================================ */

/** Single verifier rule failure (structured for prompt repair feedback). */
export interface VerifierRuleFailure {
  /** e.g., 'MV-01'..'MV-10' (see ARCHITECTURE.md §6). */
  rule_id:        string;
  rule_name:      string;
  /** Stable enum for programmatic dispatch on the repair loop. */
  failure_code?:  string;
  failure_detail: string;
  /** JSON-path-ish pointer into SelectOutput. */
  field_path?:    string;
  suggested_fix?: string;
}

/** Per-rule trace entry — emitted regardless of PASS/FAIL/SKIP outcome. */
export interface VerifierTraceEntry {
  rule_id:   string;
  latencyMs: number;
  result:    'PASS' | 'FAIL' | 'SKIP';
}

/**
 * Input handed to L5 by the orchestrator. Aggregates outputs from L0..L4 plus
 * the query embedding from L2 (needed for Rule 4 cosine-floor check).
 */
export interface L5Input {
  select_output:        SelectOutput;
  /** selected_code extracted for convenience; mirrors select_output.selected_code. */
  candidate_code:       string;
  /** Chapter of selected_code; derived from code prefix. */
  candidate_chapter:    ChapterCode;
  /** Cohere embed-v4 query embedding from L2 — Rule 4 cosine floor. */
  query_embedding:      number[];
  /** From L3 — the candidate set L4 chose from. */
  filtered_candidates:  RetrievalCandidate[];
  /** From L3 — exclusion rules the orchestrator passed to L4. */
  matched_exclusions:   ExclusionMatch[];
  /** From L0 — multi-material heuristic. Drives Rule 5 GIR-3(b). */
  composite_flag:       boolean;
  /** From L0 — tokenized normalized query (Rule 2 secondary FTS query). */
  raw_tokens:           string[];
  /** From L1 — head nouns used in FTS queries (Rule 2). */
  head_nouns_for_fts:   string[];
}

/** Verifier output — extended Phase 4 v2 shape with skipped + trace. */
export interface VerifierOutput {
  passed:               boolean;
  failed_rules:         VerifierRuleFailure[];
  /** notes_claims predicates that returned SKIP — audit for O2 coverage gaps. */
  skipped_predicates:   PredicateRef[];
  /** Multi-line block injected into Select prompt on repair iteration. */
  repair_feedback:      string;
  /** Per-rule outcome trace for audit + eval. */
  trace:                VerifierTraceEntry[];
}

/** Alias preserved for ARCHITECTURE.md §3 L5 I/O row terminology. */
export type L5Output = VerifierOutput;

/* ============================================================================
 * Predicate DSL (re-exported from db/predicate-dsl.ts)
 *
 * Canonical Predicate type lives in `./db/predicate-dsl` — it is a strict
 * superset of the prior local definition (adds ARRAY_CONTAINS / ARRAY_OVERLAPS
 * and the three-valued PASS/FAIL/SKIP evaluator). See sub-spec 01 §"Rules 7/8/9
 * — Predicate DSL" for the authoritative spec.
 * ============================================================================ */

export type { Predicate, PredicateRef, PredicateEvalResult } from './db/predicate-dsl';

/* ============================================================================
 * Pipeline run state (carried through L0..L8)
 * ============================================================================ */

/** Trace event captured at each layer for audit + eval. */
export interface PipelineTraceEvent {
  layer:    'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'QGS';
  /** Wall-clock ms from pipeline start to this event. */
  t_ms:     number;
  /** Stage label / sub-event id. */
  event:    string;
  /** Free-form payload for offline inspection. */
  payload?: Record<string, unknown>;
}

export interface PipelineRunState {
  query:                 string;
  normalized_query:      string;
  previousAnswers:       Record<string, string>;
  /** Decrements with each ASK; starts at 3 per v2 lock. */
  q_budget_remaining:    number;
  /** Single-shot enforcement flag (sub-spec 02 §B.5). */
  backtrack_attempted:   boolean;
  /** Layer ids the query has passed through ('L0','L1',...,'L7'). */
  escalation_path:       string[];
  trace:                 PipelineTraceEvent[];
  /** Epoch ms when the pipeline started; orchestrator sets it. Used for diagnostics.latency_ms. */
  started_at?:           number;
  /** Running count of LLM calls (L1/L4/L6/L7); orchestrator increments. Used for diagnostics.llm_calls. */
  llm_calls?:            number;
}

/* ============================================================================
 * Final API response shape (what index.ts → classify() returns)
 * ============================================================================ */

export type ClassifyDecision = 'CLASSIFY' | 'ASK' | 'REFUSE';

/** Wizard-facing clarifying question (built by QGS from Triage's discriminating_attribute). */
export interface ClarifyingQuestion {
  question_id:              string;
  question_text:            string;
  discriminating_attribute: AttributeKey;
  options:                  TriageFallbackOption[];
}

export interface ClassifyResult {
  decision: ClassifyDecision;

  /** Populated when decision === 'CLASSIFY'. */
  classification?: {
    code:                       string;
    is_six_digit:               boolean;
    export_policy:              string | null;
    policy_condition:           string | null;
    india_specific:             boolean;
    citation:                   SelectCitation;
    reasoning_chain:            string[];
    self_confidence:            SelfConfidence;
    alternatives_considered:    string[];
    components:                 SelectComponent[] | null;
    escalated_to_deep_think:    boolean;
  };

  /** Populated when decision === 'ASK'. */
  question?: ClarifyingQuestion;

  /** Populated when decision === 'REFUSE'. */
  refusal?: {
    reason:            string;
    out_of_scope_class: OutOfScopeClass | null;
    verifier_failures: VerifierRuleFailure[];
  };

  /** Pipeline diagnostics — always present. */
  diagnostics: {
    escalation_path: string[];
    latency_ms:      number;
    /** Sum across L1, L4, L6, L7 calls. */
    llm_calls:       number;
  };
}

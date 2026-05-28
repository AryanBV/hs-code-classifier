/**
 * Integration test for the v2 classifier orchestrator — CLASSIFY happy path.
 *
 * Mocks all 6 layers (L0..L5) plus the Cohere client (query-embedding source for
 * L5Input.query_embedding) so no network / DB calls happen. Asserts that a query
 * whose L1→…→L5 returns `passed:true` produces a `decision:'CLASSIFY'` result
 * with the selected code and the full escalation_path L0→L5.
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/index.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NormalizedInput,
  TriageOutput,
  RetrievalOutput,
  RulesFilterOutput,
  SelectOutput,
  VerifierOutput,
  RetrievalCandidate,
  TriageExtractedAttributes,
} from './types';

/* ---------------------------------------------------------------------------
 * Layer mocks (registered BEFORE importing the SUT)
 * --------------------------------------------------------------------------- */

const normalizeMock  = vi.fn();
const triageMock     = vi.fn();
const retrieveMock   = vi.fn();
const rulesFilterMock = vi.fn();
const selectMock     = vi.fn();
const verifyMock     = vi.fn();
const embedMock      = vi.fn();

vi.mock('./layers/L0-normalization', () => ({
  normalize: (...args: unknown[]) => normalizeMock(...args),
}));
vi.mock('./layers/L1-triage', () => ({
  triage: (...args: unknown[]) => triageMock(...args),
}));
vi.mock('./layers/L2-retrieval', () => ({
  retrieve: (...args: unknown[]) => retrieveMock(...args),
}));
vi.mock('./layers/L3-rules-filter', () => ({
  rulesFilter: (...args: unknown[]) => rulesFilterMock(...args),
}));
vi.mock('./layers/L4-select', () => ({
  select: (...args: unknown[]) => selectMock(...args),
}));
vi.mock('./layers/L5-verifier', () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
}));
vi.mock('./lib/cohere-client', () => ({
  embed: (...args: unknown[]) => embedMock(...args),
}));

// Import the SUT AFTER mocks are registered.
import { classify } from './index';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function mkAttributes(): TriageExtractedAttributes {
  return {
    material: 'stainless steel',
    material_confidence: 0.9,
    form: 'bolt',
    form_confidence: 0.9,
    function: null,
    function_confidence: null,
    intended_use: null,
    intended_use_confidence: null,
    processing_state: null,
    processing_state_confidence: null,
    composition: null,
    composition_confidence: null,
    head_nouns_for_fts: ['bolt'],
    raw_tokens: ['stainless', 'steel', 'hex', 'bolt'],
  };
}

function mkCandidate(code: string): RetrievalCandidate {
  return {
    code,
    level: 'tariff_line',
    cosine_score: 0.8,
    fts_rank: 0.5,
    rerank_score: 0.95,
    parent_chain: {
      chapter: code.slice(0, 2),
      heading: code.slice(0, 4),
      subheading: code.slice(0, 7),
      tariff_line: code,
    },
  };
}

const normalizedOut: NormalizedInput = {
  query: 'stainless steel hex bolts M10',
  normalized_query: 'stainless steel hex bolts m10',
  raw_tokens: ['stainless', 'steel', 'hex', 'bolts', 'm10'],
  composite_flag: false,
  aliases_applied: [],
};

const triageOut: TriageOutput = {
  decision: 'CLASSIFY',
  extracted_attributes: mkAttributes(),
  candidate_chapters: ['73'],
  completeness_signal: 0.85,
  clarifying_question: null,
  refusal_reason: null,
  out_of_scope_class: null,
};

const SELECTED = '7318.15.00';

const retrievalOut: RetrievalOutput = {
  candidates: [mkCandidate(SELECTED), mkCandidate('7318.16.00')],
  retrieval_scores: {},
  fts_matches: [],
  exclusion_pre_filter: [],
  retrieval_strategy: 'cascade_full',
  trace: [],
};

const rulesFilterOut: RulesFilterOutput = {
  filtered_candidates: [mkCandidate(SELECTED), mkCandidate('7318.16.00')],
  matched_exclusions: [],
  dropped_log: [],
  backtrack_signal: false,
  constraint_hint: null,
  trace: [],
};

const selectOut: SelectOutput = {
  selected_code: SELECTED,
  selected_code_is_six_digit: false,
  export_policy: 'Free',
  policy_condition: null,
  india_specific_flag: false,
  reasoning_chain: ['Threaded fastener of steel.', 'Heading 7318 covers screws/bolts.'],
  citation: {
    primary: {
      type: 'leaf_description',
      source_ref: 'tariff_lines:code=7318.15.00',
      verbatim_text: 'Other screws and bolts',
      note_or_exclusion_id: null,
    },
    gir_applied: 'GIR-1',
  },
  exclusions_checked: [],
  self_confidence: 'HIGH',
  alternatives_considered: ['7318.16.00'],
  components: null,
  refusal: null,
};

const verifierPass: VerifierOutput = {
  passed: true,
  failed_rules: [],
  skipped_predicates: [],
  repair_feedback: '',
  trace: [],
};

/* ---------------------------------------------------------------------------
 * Tests
 * --------------------------------------------------------------------------- */

describe('classify() — CLASSIFY happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], latencyMs: 1 });
  });

  it('returns a CLASSIFY decision with the selected code', async () => {
    const res = await classify('stainless steel hex bolts M10');
    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(res.classification?.is_six_digit).toBe(false);
    expect(res.classification?.export_policy).toBe('Free');
    expect(res.classification?.self_confidence).toBe('HIGH');
    expect(res.classification?.escalated_to_deep_think).toBe(false);
  });

  it('records the full escalation_path L0→L5', async () => {
    const res = await classify('stainless steel hex bolts M10');
    expect(res.diagnostics.escalation_path).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
  });

  it('counts exactly 2 LLM calls (L1 triage + L4 select)', async () => {
    const res = await classify('stainless steel hex bolts M10');
    expect(res.diagnostics.llm_calls).toBe(2);
  });

  it('runs the layers in order with correctly-shaped inputs', async () => {
    await classify('stainless steel hex bolts M10');

    // L0
    expect(normalizeMock).toHaveBeenCalledTimes(1);
    // L1 — TriageInput
    expect(triageMock).toHaveBeenCalledTimes(1);
    const triageInput = triageMock.mock.calls[0][0];
    expect(triageInput.normalized_query).toBe(normalizedOut.normalized_query);
    expect(triageInput.q_budget_remaining).toBe(3);
    expect(triageInput.constraint_hint).toBeNull();
    expect(triageInput.previousAnswers).toEqual({});

    // L2 — L2Input shape
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    const l2Input = retrieveMock.mock.calls[0][0];
    expect(l2Input.normalized_query).toBe(normalizedOut.normalized_query);
    expect(l2Input.candidate_chapters).toEqual(['73']);
    expect(l2Input.head_nouns_for_fts).toEqual(['bolt']);
    expect(l2Input.composite_flag).toBe(false);

    // L3 — RulesFilterInput shape
    expect(rulesFilterMock).toHaveBeenCalledTimes(1);
    const l3Input = rulesFilterMock.mock.calls[0][0];
    expect(l3Input.l2_output).toBe(retrievalOut);
    expect(l3Input.candidate_chapters).toEqual(['73']);
    expect(l3Input.backtrack_attempted).toBe(false);

    // L4 — L4Input shape
    expect(selectMock).toHaveBeenCalledTimes(1);
    const l4Input = selectMock.mock.calls[0][0];
    expect(l4Input.filtered_candidates).toEqual(rulesFilterOut.filtered_candidates);
    expect(l4Input.matched_exclusions).toEqual([]);
    expect(l4Input.extracted_attributes).toEqual(triageOut.extracted_attributes);

    // L5 — L5Input shape
    expect(verifyMock).toHaveBeenCalledTimes(1);
    const l5Input = verifyMock.mock.calls[0][0];
    expect(l5Input.select_output).toBe(selectOut);
    expect(l5Input.candidate_code).toBe(SELECTED);
    expect(l5Input.candidate_chapter).toBe('73');
    expect(Array.isArray(l5Input.query_embedding)).toBe(true);
    expect(l5Input.query_embedding.length).toBeGreaterThan(0);
  });

  it('obtains the query embedding from the Cohere client for L5Input', async () => {
    await classify('stainless steel hex bolts M10');
    expect(embedMock).toHaveBeenCalledTimes(1);
  });
});

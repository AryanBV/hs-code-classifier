/**
 * Integration test for the v2 classifier orchestrator — CLASSIFY happy path.
 *
 * Mocks all 6 layers (L0..L5) so no network / DB calls happen. The orchestrator
 * no longer embeds the query itself — it reuses the query vector L2 surfaces on
 * `RetrievalOutput.query_embedding` (the single Cohere embed lives in L2). Asserts
 * that a query whose L1→…→L5 returns `passed:true` produces a `decision:'CLASSIFY'`
 * result with the selected code and the full escalation_path L0→L5.
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

/** The query vector L2 surfaces; the orchestrator must reuse THIS for L5. */
const L2_QUERY_EMBEDDING = [0.11, 0.22, 0.33, 0.44];

const retrievalOut: RetrievalOutput = {
  candidates: [mkCandidate(SELECTED), mkCandidate('7318.16.00')],
  retrieval_scores: {},
  fts_matches: [],
  exclusion_pre_filter: [],
  retrieval_strategy: 'cascade_full',
  query_embedding: L2_QUERY_EMBEDDING,
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

  it('reuses L2 query embedding for L5Input (no orchestrator re-embed)', async () => {
    await classify('stainless steel hex bolts M10');
    const l5Input = verifyMock.mock.calls[0][0];
    // Proves reuse, not re-embed: the vector must be the exact one L2 surfaced.
    expect(l5Input.query_embedding).toBe(L2_QUERY_EMBEDDING);
  });
});

/* ---------------------------------------------------------------------------
 * Repair loop tests (Task 7)
 * --------------------------------------------------------------------------- */

/** A verifier failure object to inject as a repair signal. */
const VERIFIER_FAILURE = {
  rule_id: 'R01',
  rule_name: 'CHAPTER_MATCH',
  status: 'FAIL' as const,
  predicate: null,
  evidence: 'Chapter mismatch',
  skipped_reason: null,
};

const verifierFail: VerifierOutput = {
  passed: false,
  failed_rules: [VERIFIER_FAILURE],
  skipped_predicates: [],
  repair_feedback: 'Chapter does not match selected code.',
  trace: [],
};

/** Second SelectOutput with a different code (repair attempt 1 output). */
const selectOutRepair1: SelectOutput = {
  ...selectOut,
  selected_code: '7318.16.00',
  self_confidence: 'MEDIUM',
};

/** Third SelectOutput (repair attempt 2 output — the one that passes). */
const selectOutRepair2: SelectOutput = {
  ...selectOut,
  selected_code: '7318.15.00',
  self_confidence: 'HIGH',
};

describe('classify() — verifier repair loop (Task 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
  });

  it('retries select up to 3× on verifier fail, stops at first pass (fail, fail, pass)', async () => {
    // select: initial → repair1 → repair2
    selectMock
      .mockResolvedValueOnce(selectOut)       // attempt 0 (initial)
      .mockResolvedValueOnce(selectOutRepair1) // repair iteration 1
      .mockResolvedValueOnce(selectOutRepair2); // repair iteration 2

    // verify: fail, fail, pass
    verifyMock
      .mockResolvedValueOnce(verifierFail) // attempt 0 fails
      .mockResolvedValueOnce(verifierFail) // repair 1 fails
      .mockResolvedValueOnce(verifierPass); // repair 2 passes

    const res = await classify('stainless steel hex bolts M10');

    // 1. Decision is CLASSIFY (successful repair)
    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe('7318.15.00');

    // 2. select called 3 times total (initial + 2 repairs)
    expect(selectMock).toHaveBeenCalledTimes(3);

    // 3. verify called 3 times (one per select call)
    expect(verifyMock).toHaveBeenCalledTimes(3);

    // 4. repair select calls carry verifier_failures and incrementing repair_iteration
    const l4Call1 = selectMock.mock.calls[1][0]; // repair iteration 1
    expect(l4Call1.verifier_failures).toEqual([VERIFIER_FAILURE]);
    expect(l4Call1.repair_iteration).toBe(1);

    const l4Call2 = selectMock.mock.calls[2][0]; // repair iteration 2
    expect(l4Call2.verifier_failures).toEqual([VERIFIER_FAILURE]);
    expect(l4Call2.repair_iteration).toBe(2);

    // 5. initial select call has no repair metadata (or null/undefined)
    const l4Call0 = selectMock.mock.calls[0][0]; // initial attempt
    expect(l4Call0.verifier_failures == null).toBe(true);
    expect(l4Call0.repair_iteration == null).toBe(true);

    // 6. LLM calls = 1 (triage) + 3 (select×3) = 4
    expect(res.diagnostics.llm_calls).toBe(4);

    // 7. Trace includes repair events
    expect(res.diagnostics.escalation_path).toContain('L5:repair0');
    expect(res.diagnostics.escalation_path).toContain('L5:repair1');
  });

  it('invokes BaselineEscalation.onVerifierExhausted after 3 repair failures (4 total verify failures)', async () => {
    // select: initial + 3 repairs (4 total)
    selectMock
      .mockResolvedValueOnce(selectOut)        // attempt 0
      .mockResolvedValueOnce(selectOutRepair1) // repair 1
      .mockResolvedValueOnce(selectOutRepair2) // repair 2
      .mockResolvedValueOnce(selectOut);       // repair 3

    // verify: fail all 4 times
    verifyMock
      .mockResolvedValueOnce(verifierFail) // attempt 0
      .mockResolvedValueOnce(verifierFail) // repair 1
      .mockResolvedValueOnce(verifierFail) // repair 2
      .mockResolvedValueOnce(verifierFail); // repair 3

    const res = await classify('stainless steel hex bolts M10');

    // 1. Still returns CLASSIFY (BaselineEscalation emits best result, not REFUSE)
    expect(res.decision).toBe('CLASSIFY');

    // 2. select called 4 times total (initial + 3 repairs)
    expect(selectMock).toHaveBeenCalledTimes(4);

    // 3. verify called 4 times
    expect(verifyMock).toHaveBeenCalledTimes(4);

    // 4. escalation_path has the would_escalate marker from BaselineEscalation
    expect(res.diagnostics.escalation_path).toContain('L6:would_escalate');

    // 5. repair_iteration on each repair call
    const l4Call1 = selectMock.mock.calls[1][0];
    expect(l4Call1.repair_iteration).toBe(1);
    const l4Call2 = selectMock.mock.calls[2][0];
    expect(l4Call2.repair_iteration).toBe(2);
    const l4Call3 = selectMock.mock.calls[3][0];
    expect(l4Call3.repair_iteration).toBe(3);

    // 6. LLM calls = 1 (triage) + 4 (select×4) = 5
    expect(res.diagnostics.llm_calls).toBe(5);
  });
});

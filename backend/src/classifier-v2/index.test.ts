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

/* ---------------------------------------------------------------------------
 * Single-shot backtrack gate tests (Task 8)
 * --------------------------------------------------------------------------- */

/**
 * A ConstraintHint emitted by L3 when all candidates are excluded and backtrack
 * has not yet been attempted.
 */
const CONSTRAINT_HINT = {
  exclude_chapters: ['73'],
  prefer_chapters: ['82'],
  reason: 'All Ch.73 codes excluded by exclusion rule 42',
  source_exclusion_id: 42,
};

/**
 * L3 output that fires the backtrack signal (first pass — backtrack_attempted=false).
 */
const rulesFilterBacktrack: RulesFilterOutput = {
  filtered_candidates: [],
  matched_exclusions: [],
  dropped_log: [],
  backtrack_signal: true,
  constraint_hint: CONSTRAINT_HINT,
  trace: [],
};

/**
 * A second TriageOutput that L1 returns after receiving the constraint_hint.
 * Models a different candidate chapter from the re-triage.
 */
const triageOutBacktrack: TriageOutput = {
  decision: 'CLASSIFY',
  extracted_attributes: mkAttributes(),
  candidate_chapters: ['82'],
  completeness_signal: 0.80,
  clarifying_question: null,
  refusal_reason: null,
  out_of_scope_class: null,
};

/**
 * A second RetrievalOutput returned on the backtrack re-retrieve.
 */
const retrievalOutBacktrack: RetrievalOutput = {
  candidates: [mkCandidate('8204.11.00')],
  retrieval_scores: {},
  fts_matches: [],
  exclusion_pre_filter: [],
  retrieval_strategy: 'cascade_full',
  query_embedding: [0.55, 0.66, 0.77, 0.88],
  trace: [],
};

/**
 * L3 output after the successful backtrack re-filter — candidates present,
 * backtrack_signal=false (because backtrack_attempted will be true this time).
 */
const rulesFilterAfterBacktrack: RulesFilterOutput = {
  filtered_candidates: [mkCandidate('8204.11.00')],
  matched_exclusions: [],
  dropped_log: [],
  backtrack_signal: false,
  constraint_hint: null,
  trace: [],
};

/** SelectOutput for the backtrack-chosen code. */
const selectOutBacktrack: SelectOutput = {
  ...selectOut,
  selected_code: '8204.11.00',
  self_confidence: 'HIGH',
};

describe('classify() — single-shot backtrack gate (Task 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    selectMock.mockResolvedValue(selectOutBacktrack);
    verifyMock.mockResolvedValue(verifierPass);
  });

  it('re-enters triage once with constraint_hint when L3 fires backtrack_signal', async () => {
    // 1st triage → CLASSIFY (no constraint_hint)
    // 2nd triage → CLASSIFY with constraint_hint
    triageMock
      .mockResolvedValueOnce(triageOut)
      .mockResolvedValueOnce(triageOutBacktrack);

    // 1st retrieve → original candidates
    // 2nd retrieve → backtrack candidates
    retrieveMock
      .mockResolvedValueOnce(retrievalOut)
      .mockResolvedValueOnce(retrievalOutBacktrack);

    // 1st rulesFilter → fires backtrack_signal
    // 2nd rulesFilter → candidates present, no backtrack
    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack)
      .mockResolvedValueOnce(rulesFilterAfterBacktrack);

    const res = await classify('stainless steel hex bolts M10');

    // Decision is CLASSIFY with the backtrack-chosen code
    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe('8204.11.00');

    // triage called TWICE
    expect(triageMock).toHaveBeenCalledTimes(2);

    // 2nd triage call receives the constraint_hint
    const triage2ndInput = triageMock.mock.calls[1][0];
    expect(triage2ndInput.constraint_hint).toEqual(CONSTRAINT_HINT);
    // Other TriageInput fields are unchanged
    expect(triage2ndInput.normalized_query).toBe(normalizedOut.normalized_query);
    expect(triage2ndInput.previousAnswers).toEqual({});
    expect(triage2ndInput.q_budget_remaining).toBe(3);

    // 1st triage has constraint_hint=null
    const triage1stInput = triageMock.mock.calls[0][0];
    expect(triage1stInput.constraint_hint).toBeNull();

    // retrieve called TWICE
    expect(retrieveMock).toHaveBeenCalledTimes(2);

    // rulesFilter called TWICE
    expect(rulesFilterMock).toHaveBeenCalledTimes(2);

    // 2nd rulesFilter receives backtrack_attempted=true (single-shot enforcement)
    const l3_2ndInput = rulesFilterMock.mock.calls[1][0];
    expect(l3_2ndInput.backtrack_attempted).toBe(true);

    // 1st rulesFilter received backtrack_attempted=false
    const l3_1stInput = rulesFilterMock.mock.calls[0][0];
    expect(l3_1stInput.backtrack_attempted).toBe(false);

    // state.backtrack_attempted reflected in diagnostics
    // (not directly in ClassifyResult, but we verify via call counts)

    // LLM calls: 1 (triage-1) + 1 (triage-2) + 1 (select) = 3
    expect(res.diagnostics.llm_calls).toBe(3);
  });

  it('does NOT re-enter triage a 2nd time even if 2nd rulesFilter fires backtrack_signal again', async () => {
    // Both rulesFilter calls return backtrack_signal:true — but the gate must be single-shot.
    const rulesFilterStillBacktrack: RulesFilterOutput = {
      ...rulesFilterBacktrack,
      // Even with backtrack_signal=true on 2nd call, triage must NOT be called again.
    };

    triageMock
      .mockResolvedValueOnce(triageOut)
      .mockResolvedValueOnce(triageOutBacktrack);

    retrieveMock
      .mockResolvedValueOnce(retrievalOut)
      .mockResolvedValueOnce(retrievalOutBacktrack);

    // Both filter calls return backtrack_signal:true — 2nd should be ignored.
    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack)
      .mockResolvedValueOnce(rulesFilterStillBacktrack);

    // The 2nd rulesFilter still has 0 candidates → zero-candidate path (REFUSE).
    // We only care about triage call count here, not decision.
    const res = await classify('stainless steel hex bolts M10');

    // triage was called EXACTLY TWICE — not a 3rd time
    expect(triageMock).toHaveBeenCalledTimes(2);

    // The result is REFUSE/backtrack_no_fit because candidates are still empty
    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.out_of_scope_class).toBe('backtrack_no_fit');
  });

  it('returns REFUSE with backtrack_no_fit when filtered_candidates is empty after backtrack', async () => {
    // Only one triage call, but filter returns empty candidates immediately (no backtrack signal
    // on first call — just zero candidates).
    const rulesFilterZero: RulesFilterOutput = {
      filtered_candidates: [],
      matched_exclusions: [],
      dropped_log: [],
      backtrack_signal: false,   // no backtrack signal — still zero candidates
      constraint_hint: null,
      trace: [],
    };

    triageMock.mockResolvedValueOnce(triageOut);
    retrieveMock.mockResolvedValueOnce(retrievalOut);
    rulesFilterMock.mockResolvedValueOnce(rulesFilterZero);

    const res = await classify('stainless steel hex bolts M10');

    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.out_of_scope_class).toBe('backtrack_no_fit');
    expect(res.refusal?.verifier_failures).toEqual([]);

    // triage called only once (no backtrack signal)
    expect(triageMock).toHaveBeenCalledTimes(1);
    // select and verify never called
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * ASK path tests (Task 9)
 * --------------------------------------------------------------------------- */

/** TriageOutput with decision:'ASK' and a clarifying question. */
const triageOutAsk: TriageOutput = {
  decision: 'ASK',
  extracted_attributes: mkAttributes(),
  candidate_chapters: [],
  completeness_signal: 0.4,
  clarifying_question: {
    discriminating_attribute: 'form',
    fallback_question_text: 'Knitted or woven?',
    fallback_options: [
      { id: 'knit', label: 'Knitted' },
      { id: 'woven', label: 'Woven' },
    ],
  },
  refusal_reason: null,
  out_of_scope_class: null,
};

describe('classify() — ASK path (Task 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    // retrieve/rulesFilter/select/verify should never be called on ASK
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
  });

  it('returns decision:ASK with correctly mapped question on first-pass triage ASK', async () => {
    triageMock.mockResolvedValue(triageOutAsk);

    const res = await classify('cotton fabric');

    // Top-level decision
    expect(res.decision).toBe('ASK');

    // question must be present and fully mapped
    expect(res.question).toBeDefined();
    expect(res.question?.question_text).toBe('Knitted or woven?');
    expect(res.question?.discriminating_attribute).toBe('form');
    expect(res.question?.options).toEqual([
      { id: 'knit', label: 'Knitted' },
      { id: 'woven', label: 'Woven' },
    ]);
    // question_id is the stable synthesized id
    expect(res.question?.question_id).toBe('ask_form');

    // classification must not be set
    expect(res.classification).toBeUndefined();

    // diagnostics always present
    expect(res.diagnostics).toBeDefined();
    expect(res.diagnostics.escalation_path).toContain('L0');
    expect(res.diagnostics.escalation_path).toContain('L1');

    // Pipeline stopped at L1 — layers after triage must not have been called
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(rulesFilterMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('returns decision:ASK on backtrack re-triage ASK (same triageToAsk mapping)', async () => {
    // First triage → CLASSIFY (triggers backtrack path)
    // Second triage (backtrack re-entry) → ASK
    triageMock
      .mockResolvedValueOnce(triageOut)        // first pass → CLASSIFY
      .mockResolvedValueOnce(triageOutAsk);     // backtrack re-entry → ASK

    // First rulesFilter fires backtrack_signal; second never called
    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack)
      .mockResolvedValue(rulesFilterOut);       // fallback (should not be reached)

    retrieveMock
      .mockResolvedValueOnce(retrievalOut)      // first retrieve
      .mockResolvedValue(retrievalOutBacktrack); // backtrack retrieve (called)

    const res = await classify('cotton fabric');

    expect(res.decision).toBe('ASK');
    expect(res.question?.question_text).toBe('Knitted or woven?');
    expect(res.question?.discriminating_attribute).toBe('form');
    expect(res.question?.question_id).toBe('ask_form');
    expect(res.question?.options).toEqual([
      { id: 'knit', label: 'Knitted' },
      { id: 'woven', label: 'Woven' },
    ]);

    // triage called twice (first pass + backtrack)
    expect(triageMock).toHaveBeenCalledTimes(2);
    // select/verify must not have been called
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * REFUSE paths + §7 system-error contract (Task 10)
 * --------------------------------------------------------------------------- */

/** A triage REFUSE (services-not-goods) — a genuine model decision. */
const triageOutRefuseServices: TriageOutput = {
  decision: 'REFUSE',
  extracted_attributes: mkAttributes(),
  candidate_chapters: [],
  completeness_signal: 0,
  clarifying_question: null,
  refusal_reason: 'services',
  out_of_scope_class: 'services_not_goods',
};

/** The synthetic REFUSE L1 emits internally after its invalid-JSON retry path. */
const triageOutRefuseIncoherent: TriageOutput = {
  decision: 'REFUSE',
  extracted_attributes: mkAttributes(),
  candidate_chapters: [],
  completeness_signal: 0,
  clarifying_question: null,
  refusal_reason: 'Triage produced invalid JSON twice; refusing to guess.',
  out_of_scope_class: 'incoherent_query',
};

/**
 * Mirror of the error vertex-client throws after exhausting its own backoff
 * (lib/vertex-client.ts: `[vertex-client] After 3 retry attempts: ...` with the
 * original error on `.cause`). The orchestrator narrows its catch to THIS shape.
 */
function mkVertexTransportError(cause?: unknown): Error {
  const err = new Error('[vertex-client] After 3 retry attempts: 503 Service Unavailable');
  (err as Error & { cause?: unknown }).cause = cause ?? { response: { status: 503 } };
  return err;
}

/** A SelectOutput refusal (null code) — a genuine model REFUSE from L4. */
const selectOutRefuse: SelectOutput = {
  ...selectOut,
  selected_code: null,
  export_policy: null,
  policy_condition: null,
  refusal: { reason: 'no faithful match' },
};

describe('classify() — REFUSE paths + §7 system error (Task 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
  });

  // (a) Triage REFUSE → ClassifyResult REFUSE; no system_error; downstream not called.
  it('(a) maps a triage REFUSE to a ClassifyResult REFUSE without invoking downstream layers', async () => {
    triageMock.mockResolvedValue(triageOutRefuseServices);

    const res = await classify('legal consulting services');

    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.out_of_scope_class).toBe('services_not_goods');
    expect(res.refusal?.reason).toBe('services');
    expect(res.refusal?.verifier_failures).toEqual([]);
    // The discriminator must NOT be set for a normal model REFUSE.
    expect(res.system_error).toBeUndefined();
    expect(res.classification).toBeUndefined();

    // Pipeline stopped at L1 — no retrieval / select / verify.
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(rulesFilterMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();

    // diagnostics always present
    expect(res.diagnostics.escalation_path).toContain('L1');
  });

  // (b) Transport error from triage → result carries system_error, NOT a CLASSIFY.
  it('(b) surfaces a system_error (NOT a fabricated CLASSIFY) when a vertex transport error escapes triage', async () => {
    const transportErr = mkVertexTransportError();
    triageMock.mockRejectedValue(transportErr);

    const res = await classify('stainless steel hex bolts M10');

    // The hard invariant: no fabricated classification.
    expect(res.decision).not.toBe('CLASSIFY');
    expect(res.classification).toBeUndefined();

    // system_error SET and retryable — distinguishable from a normal REFUSE.
    expect(res.system_error).toBeDefined();
    expect(res.system_error?.retryable).toBe(true);
    expect(res.system_error?.stage).toBe('L1');
    // The cause message is carried through for diagnosis.
    expect(res.system_error?.message).toContain('[vertex-client] After 3 retry attempts');

    // decision is REFUSE (graceful surface), but discriminated by system_error.
    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.reason).toContain('System error');

    // downstream layers never ran
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  // (b') Programming errors must NOT be swallowed as system_error.
  it("(b') does NOT swallow a non-transport programming error — it propagates", async () => {
    triageMock.mockRejectedValue(new TypeError('cannot read property foo of undefined'));

    await expect(classify('stainless steel hex bolts M10')).rejects.toThrow(
      /cannot read property foo/,
    );
  });

  // (c) Invalid-JSON path arrives as an L1 synthetic REFUSE incoherent_query.
  it('(c) maps L1 post-retry synthetic REFUSE incoherent_query through to a ClassifyResult REFUSE', async () => {
    // NOTE: the actual invalid-JSON retry happens INSIDE L1 (tested in L1's own
    // suite). Here we simulate L1 having already produced the synthetic refuse.
    triageMock.mockResolvedValue(triageOutRefuseIncoherent);

    const res = await classify('asdkjfh qwerty zzz');

    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.out_of_scope_class).toBe('incoherent_query');
    expect(res.system_error).toBeUndefined();
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  // (d) Select REFUSE (null code) on the INITIAL select → ClassifyResult REFUSE.
  it('(d) maps an initial Select REFUSE (null code) to a ClassifyResult REFUSE with the reason carried', async () => {
    triageMock.mockResolvedValue(triageOut);
    selectMock.mockResolvedValue(selectOutRefuse);

    const res = await classify('stainless steel hex bolts M10');

    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.reason).toBe('no faithful match');
    expect(res.refusal?.out_of_scope_class).toBeNull();
    expect(res.refusal?.verifier_failures).toEqual([]);
    expect(res.system_error).toBeUndefined();
    expect(res.classification).toBeUndefined();

    // Initial select ran; verify must NOT run on a refusal (no code to verify).
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  // (d') Select REFUSE on a REPAIR-loop select → REFUSE (Task-7 null-code gap closed, no crash).
  it("(d') maps a REPAIR-loop Select REFUSE (null code) to a ClassifyResult REFUSE without crashing", async () => {
    triageMock.mockResolvedValue(triageOut);

    // initial select → valid code; verify fails → repair; repair select → REFUSE (null code).
    selectMock
      .mockResolvedValueOnce(selectOut)        // attempt 0
      .mockResolvedValueOnce(selectOutRefuse); // repair 1 → refusal

    verifyMock.mockResolvedValueOnce(verifierFail); // attempt 0 fails → enter repair

    const res = await classify('stainless steel hex bolts M10');

    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.reason).toBe('no faithful match');
    expect(res.system_error).toBeUndefined();
    expect(res.classification).toBeUndefined();

    // select ran twice (initial + repair 1); verify ran once (initial only —
    // the repair refusal has no code to verify).
    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
});

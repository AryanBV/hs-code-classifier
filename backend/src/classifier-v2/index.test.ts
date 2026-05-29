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
  VerifierRuleFailure,
} from './types';
import { MaxTokensError } from './lib/vertex-client';

/* ---------------------------------------------------------------------------
 * Layer mocks (registered BEFORE importing the SUT)
 * --------------------------------------------------------------------------- */

const normalizeMock  = vi.fn();
const triageMock     = vi.fn();
const retrieveMock   = vi.fn();
const rulesFilterMock = vi.fn();
const selectMock     = vi.fn();
const verifyMock     = vi.fn();
const qgsMock        = vi.fn();

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
vi.mock('./layers/QGS-generator', () => ({
  selectQGSBatch: (...args: unknown[]) => qgsMock(...args),
}));

// Import the SUT AFTER mocks are registered.
import { classify, continueWithAnswer, continueWithAnswers } from './index';

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
const VERIFIER_FAILURE: VerifierRuleFailure = {
  rule_id: 'MV-01',
  rule_name: 'CHAPTER_MATCH',
  failure_code: 'CHAPTER_MISMATCH',
  failure_detail: 'Selected code chapter 73 does not match candidate chapter 82',
  field_path: 'selected_code',
  suggested_fix: 'Choose a code in chapter 82',
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

  it('FIX 3: L5 verify trace events surface failed_rules ids (not just passed)', async () => {
    selectMock
      .mockResolvedValueOnce(selectOut)
      .mockResolvedValueOnce(selectOutRepair2);
    verifyMock
      .mockResolvedValueOnce(verifierFail)  // attempt 0 fails (failed_rules: [MV-01])
      .mockResolvedValueOnce(verifierPass); // repair 1 passes (no failures)

    const res = await classify('stainless steel hex bolts M10', { captureTrace: true });
    const trace = res.diagnostics.trace ?? [];
    const l5Events = trace.filter((t) => t.layer === 'L5' && t.event === 'verify');
    expect(l5Events.length).toBeGreaterThanOrEqual(2);

    // First L5 verify failed → payload carries the failed rule ids.
    const firstFail = l5Events[0];
    expect(firstFail?.payload?.passed).toBe(false);
    expect(firstFail?.payload?.failed_rules).toEqual(['MV-01']);

    // Passing L5 verify → empty failed_rules list (still present, observable).
    const lastPass = l5Events[l5Events.length - 1];
    expect(lastPass?.payload?.passed).toBe(true);
    expect(lastPass?.payload?.failed_rules).toEqual([]);
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

describe('classify() — ASK path (QGS candidate-aware seam)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    // On ASK the orchestrator now runs L2→L3→QGS to obtain the candidate set.
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
    // Default: QGS yields nothing → orchestrator falls back to the L1 question.
    qgsMock.mockResolvedValue(null);
  });

  it('falls back to the L1 single question when QGS yields nothing', async () => {
    triageMock.mockResolvedValue(triageOutAsk);

    const res = await classify('cotton fabric');

    expect(res.decision).toBe('ASK');
    // Fallback (candidate-unaware) question, fully mapped.
    expect(res.question).toBeDefined();
    expect(res.question?.question_text).toBe('Knitted or woven?');
    expect(res.question?.discriminating_attribute).toBe('form');
    expect(res.question?.options).toEqual([
      { id: 'knit', label: 'Knitted' },
      { id: 'woven', label: 'Woven' },
    ]);
    expect(res.question?.question_id).toBe('ask_form');
    expect(res.question?.qgs_used).toBe(false);
    // No batch when falling back.
    expect(res.questions).toBeUndefined();

    expect(res.classification).toBeUndefined();
    expect(res.diagnostics.escalation_path).toContain('L0');
    expect(res.diagnostics.escalation_path).toContain('L1');

    // The candidate-aware seam DID run L2→L3→QGS (but not L4/L5).
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(rulesFilterMock).toHaveBeenCalledTimes(1);
    expect(qgsMock).toHaveBeenCalledTimes(1);
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  // FIX B: a QGS null return records fallback reason qgs_null on the L1 ask trace.
  it('records qgs_fallback_reason=qgs_null on the L1 ask trace when QGS returns null', async () => {
    triageMock.mockResolvedValue(triageOutAsk);
    qgsMock.mockResolvedValue(null); // genuinely indistinguishable / no candidates

    const res = await classify('cotton fabric', { captureTrace: true });

    expect(res.decision).toBe('ASK');
    const trace = res.diagnostics.trace ?? [];
    const l1Ask = trace.find((t) => t.layer === 'L1' && t.event === 'ask');
    expect(l1Ask).toBeDefined();
    expect(l1Ask?.payload?.qgs_fallback_reason).toBe('qgs_null');
  });

  // FIX B: a QGS throw records fallback reason qgs_error — behavior identical
  // (still falls back to the L1 single question), but the cause is observable.
  it('records qgs_fallback_reason=qgs_error on the L1 ask trace when QGS throws', async () => {
    triageMock.mockResolvedValue(triageOutAsk);
    qgsMock.mockRejectedValue(new Error('L2 embedding error (e.g. retrieval/embed failure)'));

    const res = await classify('cotton fabric', { captureTrace: true });

    // Behavior unchanged: still an ASK with the L1 fallback question.
    expect(res.decision).toBe('ASK');
    expect(res.question?.question_id).toBe('ask_form');
    expect(res.question?.qgs_used).toBe(false);

    const trace = res.diagnostics.trace ?? [];
    const l1Ask = trace.find((t) => t.layer === 'L1' && t.event === 'ask');
    expect(l1Ask).toBeDefined();
    expect(l1Ask?.payload?.qgs_fallback_reason).toBe('qgs_error');
  });

  it('surfaces the QGS batch (question + questions) when QGS produces one', async () => {
    triageMock.mockResolvedValue(triageOutAsk);
    const batch = {
      questions: [
        {
          question_id: 'ask_processing_state',
          question_text: 'Is the coffee roasted or not roasted?',
          discriminating_attribute: 'processing_state' as const,
          options: [
            { id: 'roasted', label: 'Roasted' },
            { id: 'green', label: 'Not roasted (green)' },
            { id: 'other', label: 'Other' },
            { id: 'none', label: 'None' },
          ],
          info_gain_score: 1.0,
          qgs_used: true,
        },
        {
          question_id: 'ask_material',
          question_text: 'Which species?',
          discriminating_attribute: 'material' as const,
          options: [
            { id: 'arabica', label: 'Arabica' },
            { id: 'robusta', label: 'Robusta' },
            { id: 'other', label: 'Other' },
            { id: 'none', label: 'None' },
          ],
          info_gain_score: 0.8,
          qgs_used: true,
        },
      ],
      total_ig_potential: 1.8,
    };
    qgsMock.mockResolvedValue(batch);

    const res = await classify('coffee');

    expect(res.decision).toBe('ASK');
    // Primary question mirrors questions[0].
    expect(res.question?.question_id).toBe('ask_processing_state');
    expect(res.question?.qgs_used).toBe(true);
    // Full batch surfaced.
    expect(res.questions).toBeDefined();
    expect(res.questions?.questions).toHaveLength(2);
    expect(res.questions?.total_ig_potential).toBeCloseTo(1.8, 6);
    // QGS got the L3 filtered candidates.
    expect(qgsMock).toHaveBeenCalledTimes(1);
    const qgsArg = qgsMock.mock.calls[0][0] as { candidates: unknown[] };
    expect(qgsArg.candidates).toEqual(rulesFilterOut.filtered_candidates);
    // Diagnostics record the QGS hop.
    expect(res.diagnostics.escalation_path).toContain('QGS');
  });

  it('returns decision:ASK on backtrack re-triage ASK (shared QGS seam)', async () => {
    // First triage → CLASSIFY (triggers backtrack path); second → ASK.
    triageMock
      .mockResolvedValueOnce(triageOut)        // first pass → CLASSIFY
      .mockResolvedValueOnce(triageOutAsk);     // backtrack re-entry → ASK

    // First rulesFilter fires backtrack_signal.
    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack)
      .mockResolvedValue(rulesFilterOut);

    retrieveMock
      .mockResolvedValueOnce(retrievalOut)
      .mockResolvedValue(retrievalOutBacktrack);

    const res = await classify('cotton fabric');

    expect(res.decision).toBe('ASK');
    // QGS returns null (default) → fallback L1 question.
    expect(res.question?.question_text).toBe('Knitted or woven?');
    expect(res.question?.discriminating_attribute).toBe('form');
    expect(res.question?.question_id).toBe('ask_form');

    expect(triageMock).toHaveBeenCalledTimes(2);
    // QGS attempted for the ASK.
    expect(qgsMock).toHaveBeenCalled();
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

/* ---------------------------------------------------------------------------
 * continueWithAnswer — multi-turn ASK (Task 11)
 * --------------------------------------------------------------------------- */

describe('continueWithAnswer() — multi-turn (Task 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);       // returns CLASSIFY by default
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
  });

  // Test 1: Round 1 — folds answer into previousAnswers, decrements budget to 2,
  // and re-enters classify (which calls triage with previousAnswers + q_budget_remaining=2).
  it('round 1: folds questionId+answerId into previousAnswers, calls triage with q_budget_remaining=2', async () => {
    const res = await continueWithAnswer('stainless bolts', 'q_form', 'hex', {
      previousAnswers: {},
    });

    // Pipeline ran to completion (triage returned CLASSIFY → happy path)
    expect(res.decision).toBe('CLASSIFY');

    // L1 (triage) was called once with the folded previousAnswers and decremented budget
    expect(triageMock).toHaveBeenCalledTimes(1);
    const triageCallInput = triageMock.mock.calls[0][0];
    expect(triageCallInput.previousAnswers).toEqual({ q_form: 'hex' });
    expect(triageCallInput.q_budget_remaining).toBe(2);
  });

  // Test 2: round cap — when 3 clarifying rounds are already complete, a 4th
  // re-entry must short-circuit BEFORE any triage/LLM call and return REFUSE
  // function_only_no_substance. The cap counts ROUNDS (re-entries), not answer keys.
  it('round cap: refuses with function_only_no_substance on the 4th round — NO triage call', async () => {
    const res = await continueWithAnswer('stainless bolts', 'q_fourth', 'x', {
      previousAnswers: { a: '1', b: '2', c: '3' },
      rounds: 3, // 3 rounds already completed → this would be the 4th
    });

    // Must REFUSE — Q-budget exhausted
    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.out_of_scope_class).toBe('function_only_no_substance');
    expect(res.refusal?.reason).toBeTruthy();
    // Defense-in-depth: no LLM calls whatsoever (short-circuited before classify)
    expect(triageMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
    // system_error must NOT be set (this is a model/policy decision, not an infra error)
    expect(res.system_error).toBeUndefined();
    // diagnostics always present
    expect(res.diagnostics).toBeDefined();
  });

  // Test 3: Mid-round — when previousAnswers has 1 entry and triage returns ASK again
  // (q_budget still > 0), continueWithAnswer returns ASK (multi-turn continues).
  it('mid-round: returns ASK when triage still asks a follow-up (q_budget > 0)', async () => {
    // Triage returns ASK again on this round (asking a second question)
    const triageOutAsk2: TriageOutput = {
      decision: 'ASK',
      extracted_attributes: mkAttributes(),
      candidate_chapters: [],
      completeness_signal: 0.5,
      clarifying_question: {
        discriminating_attribute: 'material',
        fallback_question_text: 'What is the material?',
        fallback_options: [
          { id: 'steel', label: 'Steel' },
          { id: 'plastic', label: 'Plastic' },
        ],
      },
      refusal_reason: null,
      out_of_scope_class: null,
    };
    triageMock.mockResolvedValue(triageOutAsk2);

    const res = await continueWithAnswer('cotton fabric', 'q_form', 'woven', {
      previousAnswers: { q_knit: 'no' },
      rounds: 1, // one clarifying round already completed → this is round 2
    });

    // Returns ASK — multi-turn continues
    expect(res.decision).toBe('ASK');
    expect(res.question?.discriminating_attribute).toBe('material');
    expect(res.question?.question_id).toBe('ask_material');

    // Triage was called with the accumulated previousAnswers (both q_knit + q_form)
    // and q_budget_remaining = 3 (budget) - 2 (this round) = 1
    expect(triageMock).toHaveBeenCalledTimes(1);
    const triageCallInput = triageMock.mock.calls[0][0];
    expect(triageCallInput.previousAnswers).toEqual({ q_knit: 'no', q_form: 'woven' });
    expect(triageCallInput.q_budget_remaining).toBe(1);

    // Pipeline stopped at L1 (ASK)
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  // Test 4: no previousAnswers opts at all — defaults to empty, budget stays at 2 after fold.
  it('handles missing opts (no previousAnswers provided) — treats as empty, q_budget=2 after fold', async () => {
    const res = await continueWithAnswer('stainless bolts', 'q_form', 'hex');

    expect(res.decision).toBe('CLASSIFY');
    const triageCallInput = triageMock.mock.calls[0][0];
    expect(triageCallInput.previousAnswers).toEqual({ q_form: 'hex' });
    expect(triageCallInput.q_budget_remaining).toBe(2);
  });

  // Test 5 (FIX A): a QGS BATCH of 3 answers folded in ONE continueWithAnswers call
  // counts as exactly ONE round — the Q-budget is NOT exhausted, and triage runs
  // with q_budget_remaining = 3 - 1 = 2. (Under the old key-counting cap this batch
  // would have exhausted the budget in one turn and short-circuited to REFUSE.)
  it('round cap: a batch of 3 answers in ONE call is ONE round (budget NOT exhausted)', async () => {
    const res = await continueWithAnswers(
      'coffee',
      { ask_processing_state: 'roasted', ask_material: 'arabica', ask_form: 'ground' },
      { previousAnswers: {}, rounds: 0 },
    );

    // Pipeline ran — NOT short-circuited to REFUSE.
    expect(res.decision).toBe('CLASSIFY');
    expect(res.system_error).toBeUndefined();

    // Triage WAS called (proves no short-circuit) with all 3 folded answers and
    // q_budget_remaining = 2 (one round consumed, two remain).
    expect(triageMock).toHaveBeenCalledTimes(1);
    const triageCallInput = triageMock.mock.calls[0][0];
    expect(triageCallInput.previousAnswers).toEqual({
      ask_processing_state: 'roasted',
      ask_material: 'arabica',
      ask_form: 'ground',
    });
    expect(triageCallInput.q_budget_remaining).toBe(2);
  });

  // Test 6 (FIX A): three successive rounds (rounds 1,2,3) all run; the 4th
  // re-entry (rounds=3 already complete) short-circuits to REFUSE — the cap is on
  // ROUNDS. Each round here carries a 3-answer batch, proving key-count is irrelevant.
  it('round cap: 3 successive rounds run, the 4th hits the cap (rounds, not keys)', async () => {
    const batch = (n: number): Record<string, string> => ({
      [`q_${n}_a`]: 'x',
      [`q_${n}_b`]: 'y',
      [`q_${n}_c`]: 'z',
    });
    const merged: Record<string, string> = {};

    // Rounds 1..3 each run the pipeline (triage IS called).
    for (let round = 0; round < 3; round++) {
      vi.clearAllMocks();
      triageMock.mockResolvedValue(triageOut);
      retrieveMock.mockResolvedValue(retrievalOut);
      rulesFilterMock.mockResolvedValue(rulesFilterOut);
      selectMock.mockResolvedValue(selectOut);
      verifyMock.mockResolvedValue(verifierPass);

      Object.assign(merged, batch(round + 1));
      const res = await continueWithAnswers('multi', batch(round + 1), {
        previousAnswers: { ...merged },
        rounds: round,
      });

      // Each of the first 3 rounds runs the pipeline (no premature cap).
      expect(res.decision).toBe('CLASSIFY');
      expect(triageMock).toHaveBeenCalledTimes(1);
      expect(triageMock.mock.calls[0][0].q_budget_remaining).toBe(3 - (round + 1));
    }

    // 4th round (3 already complete) → cap hit, REFUSE, NO triage call.
    vi.clearAllMocks();
    triageMock.mockResolvedValue(triageOut);
    const capped = await continueWithAnswers('multi', batch(4), {
      previousAnswers: { ...merged },
      rounds: 3,
    });
    expect(capped.decision).toBe('REFUSE');
    expect(capped.refusal?.out_of_scope_class).toBe('function_only_no_substance');
    expect(triageMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * New edge-case tests (orchestrator hardening)
 * --------------------------------------------------------------------------- */

describe('classify() — backtrack re-entry REFUSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
  });

  it('returns REFUSE (not system_error) when backtrack 2nd triage returns REFUSE', async () => {
    // A REFUSE that L1 may return when the constraint_hint cannot be satisfied.
    const triageOutRefuseBacktrackNoFit: TriageOutput = {
      decision: 'REFUSE',
      extracted_attributes: mkAttributes(),
      candidate_chapters: [],
      completeness_signal: 0,
      clarifying_question: null,
      refusal_reason: 'No chapter satisfies the constraint hint',
      out_of_scope_class: 'backtrack_no_fit',
    };

    // First triage → CLASSIFY, first L3 → backtrack_signal:true.
    triageMock
      .mockResolvedValueOnce(triageOut)
      .mockResolvedValueOnce(triageOutRefuseBacktrackNoFit);

    retrieveMock
      .mockResolvedValueOnce(retrievalOut)
      .mockResolvedValueOnce(retrievalOutBacktrack);

    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack);
    // 2nd rulesFilter is never reached because 2nd triage returns REFUSE.

    const res = await classify('stainless steel hex bolts M10');

    // Must be a model REFUSE, NOT a system error.
    expect(res.decision).toBe('REFUSE');
    expect(res.system_error).toBeUndefined();
    expect(res.refusal?.out_of_scope_class).toBe('backtrack_no_fit');

    // triage was called twice (first pass + backtrack re-entry).
    expect(triageMock).toHaveBeenCalledTimes(2);
    // select and verify must not have run.
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe('classify() — system error from L4 select (stage L4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    verifyMock.mockResolvedValue(verifierPass);
  });

  it('surfaces system_error with stage L4 (not a fabricated CLASSIFY) when select throws vertex transport error', async () => {
    const transportErr = mkVertexTransportError();
    selectMock.mockRejectedValue(transportErr);

    const res = await classify('stainless steel hex bolts M10');

    // Hard invariant: never a fabricated classification.
    expect(res.decision).not.toBe('CLASSIFY');
    expect(res.classification).toBeUndefined();

    // system_error must be set and attributed to L4.
    expect(res.system_error).toBeDefined();
    expect(res.system_error?.stage).toBe('L4');
    expect(res.system_error?.retryable).toBe(true);
    expect(res.system_error?.message).toContain('[vertex-client] After');

    // result is REFUSE with system discriminator.
    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.reason).toContain('System error');

    // verify never ran (error during select).
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe('classify() — system error during backtrack re-triage (stage L1, 2nd triage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
  });

  it('surfaces system_error (stage L1) when backtrack 2nd triage throws vertex transport error', async () => {
    const transportErr = mkVertexTransportError();

    // First triage → CLASSIFY; first L3 → backtrack_signal:true.
    triageMock
      .mockResolvedValueOnce(triageOut)
      .mockRejectedValueOnce(transportErr); // 2nd triage (backtrack) throws.

    retrieveMock
      .mockResolvedValueOnce(retrievalOut)
      .mockResolvedValueOnce(retrievalOutBacktrack);

    rulesFilterMock.mockResolvedValueOnce(rulesFilterBacktrack);

    const res = await classify('stainless steel hex bolts M10');

    // Must NOT be CLASSIFY — no code was selected.
    expect(res.decision).not.toBe('CLASSIFY');
    expect(res.classification).toBeUndefined();

    // system_error set, attributed to L1 (where the backtrack triage lives).
    expect(res.system_error).toBeDefined();
    expect(res.system_error?.stage).toBe('L1');
    expect(res.system_error?.retryable).toBe(true);

    // result is REFUSE with system discriminator.
    expect(res.decision).toBe('REFUSE');
    expect(res.refusal?.reason).toContain('System error');

    // downstream never ran.
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe('classify() — MaxTokensError propagation (not swallowed as system_error)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
  });

  it('propagates MaxTokensError thrown by triage — does NOT convert to system_error', async () => {
    const maxTokensErr = new MaxTokensError(
      '',
      { promptTokens: 100000, outputTokens: 0, thoughtsTokens: 99000, totalTokens: 100000 },
      'gemini-3.5-flash',
    );
    triageMock.mockRejectedValue(maxTokensErr);

    // Must reject (propagate), NOT resolve with a system_error REFUSE.
    await expect(classify('stainless steel hex bolts M10')).rejects.toThrow(MaxTokensError);

    // Confirm downstream never ran.
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });
});

describe('classify() — post-backtrack L5 uses 2nd retrieve embedding (not 1st)', () => {
  beforeEach(() => {
    // Use resetAllMocks to clear both call history AND the Once-queue — this
    // guarantees no leftover Once values leak in from previous tests.
    vi.resetAllMocks();
    normalizeMock.mockResolvedValue(normalizedOut);
    selectMock.mockResolvedValue(selectOutBacktrack);
    verifyMock.mockResolvedValue(verifierPass);
  });

  it('passes the post-backtrack (2nd) retrieve query_embedding to L5, not the original', async () => {
    // First triage → CLASSIFY; second triage → CLASSIFY.
    triageMock
      .mockResolvedValueOnce(triageOut)
      .mockResolvedValueOnce(triageOutBacktrack);

    // 1st retrieve → L2_QUERY_EMBEDDING = [0.11, ...]; 2nd retrieve → [0.55, ...].
    retrieveMock
      .mockResolvedValueOnce(retrievalOut)          // query_embedding = [0.11, 0.22, 0.33, 0.44]
      .mockResolvedValueOnce(retrievalOutBacktrack); // query_embedding = [0.55, 0.66, 0.77, 0.88]

    rulesFilterMock
      .mockResolvedValueOnce(rulesFilterBacktrack)
      .mockResolvedValueOnce(rulesFilterAfterBacktrack);

    const res = await classify('stainless steel hex bolts M10');
    expect(res.decision).toBe('CLASSIFY');

    // Verify retrieve was called exactly twice (first pass + backtrack).
    expect(retrieveMock).toHaveBeenCalledTimes(2);

    // L5 (verify) must have received the SECOND (backtrack) embedding, not the first.
    expect(verifyMock).toHaveBeenCalledTimes(1);
    const l5Input = verifyMock.mock.calls[0][0];
    expect(l5Input.query_embedding).toEqual([0.55, 0.66, 0.77, 0.88]);
    // Negative assertion: must NOT be the original embedding.
    expect(l5Input.query_embedding).not.toEqual(L2_QUERY_EMBEDDING);
  });
});

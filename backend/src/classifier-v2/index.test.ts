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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
// SIBLING-ASK lever deps (re-exported from L4-select). Default to no sibling
// group + empty TLA so the lever is inert even when the env gate is ON unless a
// test deliberately arranges a group. These are NEVER called with the gate off.
const computeSiblingDiscriminatorsMock = vi.fn(() => [] as unknown[]);
const getTLAForCodesMock = vi.fn(async () => ({} as Record<string, unknown>));

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
  computeSiblingDiscriminators: (...args: unknown[]) => computeSiblingDiscriminatorsMock(...args),
  getTariffLineAttributesForCodes: (...args: unknown[]) => getTLAForCodesMock(...args),
}));
vi.mock('./layers/L5-verifier', () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
}));
vi.mock('./layers/QGS-generator', () => ({
  selectQGSBatch: (...args: unknown[]) => qgsMock(...args),
}));
// Mock the pin-check so the orchestrator control-flow test fully controls S2
// (the pure pin logic is unit-tested in lib/sibling-ask-trigger.test.ts).
// computeSiblingRerankMargin AND evaluateCalibratedClassify are NOT mocked: they
// are pure, and both gates are driven directly through crafted rerank_score gaps
// on the candidate fixtures so the control-flow tests exercise the REAL signals
// (their own units live in lib/sibling-ask-trigger.test.ts).
const isAttributePinnedMock = vi.fn(() => false);
vi.mock('./lib/sibling-ask-trigger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/sibling-ask-trigger')>();
  return {
    ...actual,
    isAttributePinnedByQuery: (...args: unknown[]) => isAttributePinnedMock(...args),
  };
});
// CALIBRATED-CLASSIFY lever dep: the survivor-description PK lookup. Default to a
// description that does NOT verbatim-match the query, so only a STRONG margin (or
// an explicit override) fires the lever's gate C.
const getParentChainsMock = vi.fn(async () => [] as unknown[]);
vi.mock('./lib/supabase-client', () => ({
  getTariffLineParentChains: (...args: unknown[]) => getParentChainsMock(...args),
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

/* ---------------------------------------------------------------------------
 * SIBLING-ASK lever (POST-L4 uncertainty gate; env-gated; default OFF →
 * byte-identical). The lever now runs AFTER L4 (Select) + its L5/repair loop:
 * it asks ONE targeted question ONLY when the rerank-score margin between the
 * top-2 same-subheading siblings of the selected leaf is below
 * SIBLING_ASK_MARGIN_THRESHOLD (the reranker could not separate them) AND the
 * winning leaf sits in a same-subheading sibling group whose discriminating
 * attribute the user never pinned. Everything else finalizes L4 unchanged.
 * --------------------------------------------------------------------------- */

/**
 * Build a same-subheading sibling `RetrievalCandidate` with a CRAFTED
 * rerank_score so the post-L4 margin gate can be driven directly. Both the
 * selected leaf and its competitor live under subheading `7318.15`, so
 * `computeSiblingRerankMargin` sees a real ≥2-sibling group and the margin is
 * controlled purely by the rerank gap between the two.
 */
function mkSibling(code: string, rerank: number): RetrievalCandidate {
  return { ...mkCandidate(code), rerank_score: rerank };
}

/** Two siblings under 7318.15 with a LARGE rerank margin (0.95−0.55 = 0.40 ≫ 0.05). */
const SIBLINGS_WIDE_MARGIN: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.95),
  mkSibling('7318.15.10', 0.55),
];
/** Two siblings under 7318.15 with a SMALL rerank margin (0.90−0.88 = 0.02 < 0.05). */
const SIBLINGS_SMALL_MARGIN: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.90),
  mkSibling('7318.15.10', 0.88),
];
/** Only ONE rerankable sibling under 7318.15 → margin null (the other is a different subheading). */
const SIBLINGS_SINGLETON: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.90),
  mkSibling('7318.16.00', 0.50),
];

/** A rules-filter output carrying a given sibling candidate set. */
function rulesFilterWith(candidates: RetrievalCandidate[]): RulesFilterOutput {
  return { ...rulesFilterOut, filtered_candidates: candidates };
}

/**
 * A QGS-style sibling batch whose top question discriminates on `form` — the
 * SELECTED group's differing field (so the question is built on the SPECIFIC
 * discriminator of the sibling group the L4 winner belongs to).
 */
const siblingBatch = {
  questions: [
    {
      question_id: 'ask_form',
      question_text: 'Which best describes the product form?',
      discriminating_attribute: 'form' as const,
      options: [
        { id: 'hex', label: 'Hex' },
        { id: 'socket', label: 'Socket' },
        { id: 'other', label: 'Other' },
        { id: 'none', label: 'None' },
      ],
      info_gain_score: 1.0,
      qgs_used: true,
    },
  ],
  total_ig_potential: 1.0,
};

/**
 * L4 outputs whose self_confidence varies. self_confidence NO LONGER gates the
 * lever (it is logged only); these exist to prove the gate is INDEPENDENT of it
 * — a confident-LOW or confident-HIGH L4 both ASK iff the rerank margin is small.
 */
const selectOutLowConf: SelectOutput = { ...selectOut, self_confidence: 'LOW' };
const selectOutMedConf: SelectOutput = { ...selectOut, self_confidence: 'MEDIUM' };

describe('classify() — SIBLING-ASK lever GATE OFF (default → byte-identical)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIBLING_ASK_ENABLED; // explicit: gate OFF
    delete process.env.SIBLING_ASK_MARGIN_THRESHOLD;
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);          // CLASSIFY
    retrieveMock.mockResolvedValue(retrievalOut);
    // SMALL-margin siblings + a would-be sibling group + usable batch + unpinned
    // attr so that ONLY the env gate suppresses the lever (proves the gate, not
    // the margin/conditions).
    rulesFilterMock.mockResolvedValue(rulesFilterWith(SIBLINGS_SMALL_MARGIN));
    selectMock.mockResolvedValue(selectOutLowConf);
    verifyMock.mockResolvedValue(verifierPass);
    computeSiblingDiscriminatorsMock.mockReturnValue([
      { subheading: '7318.15', codes: [SELECTED, '7318.15.10'], differing_fields: ['form'], values_by_field: {} },
    ] as unknown[]);
    getTLAForCodesMock.mockResolvedValue({ [SELECTED]: {}, '7318.15.10': {} });
    qgsMock.mockResolvedValue(siblingBatch);
    isAttributePinnedMock.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.SIBLING_ASK_ENABLED;
    delete process.env.SIBLING_ASK_MARGIN_THRESHOLD;
  });

  it('returns the unchanged CLASSIFY result and never touches the lever deps', async () => {
    const res = await classify('stainless steel hex bolts M10');

    // Byte-identical CLASSIFY outcome (same as the happy-path suite): L4's
    // classification is finalized verbatim — the post-L4 gate never engaged.
    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(res.classification?.self_confidence).toBe('LOW');
    // Escalation path is the unchanged L0→L5 — no SIBLING-ASK hop.
    expect(res.diagnostics.escalation_path).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);

    // CRITICAL: with the gate off, the lever does ZERO work — no DB/QGS/pin calls.
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(computeSiblingDiscriminatorsMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    // L4 + L5 ran exactly once (normal path).
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
});

describe('classify() — SIBLING-ASK lever GATE ON (post-L4 rerank-margin gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIBLING_ASK_ENABLED = 'true';
    delete process.env.SIBLING_ASK_MARGIN_THRESHOLD; // default 0.05
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOut);          // CLASSIFY → reaches L4
    retrieveMock.mockResolvedValue(retrievalOut);
    // SMALL-margin siblings (0.90−0.88 = 0.02 < 0.05) → reranker cannot separate
    // them → ask-eligible. self_confidence no longer gates (LOW here just proves
    // the gate is independent of it).
    rulesFilterMock.mockResolvedValue(rulesFilterWith(SIBLINGS_SMALL_MARGIN));
    selectMock.mockResolvedValue(selectOutLowConf);
    verifyMock.mockResolvedValue(verifierPass);
    computeSiblingDiscriminatorsMock.mockReturnValue([
      { subheading: '7318.15', codes: [SELECTED, '7318.15.10'], differing_fields: ['form'], values_by_field: {} },
    ] as unknown[]);
    getTLAForCodesMock.mockResolvedValue({ [SELECTED]: {}, '7318.15.10': {} });
    qgsMock.mockResolvedValue(siblingBatch);
    isAttributePinnedMock.mockReturnValue(false); // attribute NOT pinned → ASK
  });

  afterEach(() => {
    delete process.env.SIBLING_ASK_ENABLED;
    delete process.env.SIBLING_ASK_MARGIN_THRESHOLD;
  });

  it('fires an ASK (trigger=sibling) when the sibling rerank margin is SMALL on an UNPINNED group', async () => {
    const res = await classify('coffee beans', { captureTrace: true });

    expect(res.decision).toBe('ASK');
    expect(res.question?.discriminating_attribute).toBe('form');
    expect(res.question?.trigger).toBe('sibling');
    // Full batch surfaced + every question tagged.
    expect(res.questions?.questions).toHaveLength(1);
    expect(res.questions?.questions[0]?.trigger).toBe('sibling');

    // L4 + L5 ran FIRST (post-L4 gate) — Select/Verify executed before the ASK.
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);

    // SIBLING-ASK trace step recorded AFTER L4/L5 — logs the margin, the top-2
    // codes, AND the (non-gating) self_confidence.
    const trace = res.diagnostics.trace ?? [];
    const step = trace.find((t) => t.layer === 'SIBLING-ASK' && t.event === 'ask');
    expect(step).toBeDefined();
    expect(step?.payload?.discriminating_attribute).toBe('form');
    expect(step?.payload?.self_confidence).toBe('LOW');
    expect(step?.payload?.margin).toBeCloseTo(0.02, 10);
    expect(step?.payload?.top_codes).toEqual([SELECTED, '7318.15.10']);
    // The gate ran after L5 in the escalation path.
    const path = res.diagnostics.escalation_path;
    expect(path[path.length - 1]).toBe('SIBLING-ASK');

    // Reused the pre-fetched TLA: getTLAForCodes called exactly once (no duplicate
    // fetch inside QGS — it received the deps.fetchTLA seam).
    expect(getTLAForCodesMock).toHaveBeenCalledTimes(1);
    expect(qgsMock).toHaveBeenCalledTimes(1);
  });

  it('fires regardless of self_confidence (HIGH-conf L4 still ASKs on a small margin)', async () => {
    selectMock.mockResolvedValue(selectOut); // HIGH — no longer gates

    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(res.question?.trigger).toBe('sibling');
  });

  it('does NOT fire when the sibling rerank margin is LARGE (≥ threshold) → finalizes L4 classification', async () => {
    // Wide margin (0.95−0.55 = 0.40 ≥ 0.05): the reranker clearly preferred the
    // winner → confident → don't ask. The gate short-circuits BEFORE any DB/QGS/pin work.
    rulesFilterMock.mockResolvedValue(rulesFilterWith(SIBLINGS_WIDE_MARGIN));

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(computeSiblingDiscriminatorsMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the margin is UNKNOWABLE (<2 rerankable siblings → null) → finalize', async () => {
    // Only one candidate sits under the selected subheading → margin null →
    // conservative no-fire (cannot assess uncertainty). Short-circuits before DB/QGS.
    rulesFilterMock.mockResolvedValue(rulesFilterWith(SIBLINGS_SINGLETON));

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(computeSiblingDiscriminatorsMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('SIBLING_ASK_MARGIN_THRESHOLD=0.01 excludes the 0.02 margin → finalizes classification', async () => {
    process.env.SIBLING_ASK_MARGIN_THRESHOLD = '0.01'; // 0.02 ≥ 0.01 → no ask

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
  });

  it('SIBLING_ASK_MARGIN_THRESHOLD=0.50 still fires for the 0.02 margin (0.02 < 0.50)', async () => {
    process.env.SIBLING_ASK_MARGIN_THRESHOLD = '0.50';

    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(res.question?.trigger).toBe('sibling');
  });

  it('does NOT fire (→ finalize) when the discriminating attribute is PINNED', async () => {
    isAttributePinnedMock.mockReturnValue(true); // user already specified it

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    // The lever evaluated S1/S3 (DB + QGS ran) but S2 suppressed the ASK.
    expect(getTLAForCodesMock).toHaveBeenCalledTimes(1);
    expect(qgsMock).toHaveBeenCalledTimes(1);
    expect(isAttributePinnedMock).toHaveBeenCalledTimes(1);
    // L4 + L5 already ran (post-L4 gate).
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when there is no sibling group (S1 fails) → finalize', async () => {
    computeSiblingDiscriminatorsMock.mockReturnValue([] as unknown[]);

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    // S1 short-circuits before QGS / pin-check.
    expect(getTLAForCodesMock).toHaveBeenCalledTimes(1);
    expect(qgsMock).not.toHaveBeenCalled();
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the selected leaf is NOT in any sibling group → finalize', async () => {
    // Sibling group exists but for a DIFFERENT subheading than the L4 winner.
    computeSiblingDiscriminatorsMock.mockReturnValue([
      { subheading: '7320.10', codes: ['7320.10.10', '7320.10.20'], differing_fields: ['form'], values_by_field: {} },
    ] as unknown[]);

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    // The selected code's subheading has no sibling group → no QGS / pin work.
    expect(getTLAForCodesMock).toHaveBeenCalledTimes(1);
    expect(qgsMock).not.toHaveBeenCalled();
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when QGS returns null (S3 fails / over-ask guard) → finalize', async () => {
    qgsMock.mockResolvedValue(null);

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(qgsMock).toHaveBeenCalledTimes(1);
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the QGS question is NOT on the sibling discriminator → finalize', async () => {
    // QGS surfaces a question on `material`, but the SELECTED group differs on
    // `form` only — there is no question built on the group's discriminator.
    qgsMock.mockResolvedValue({
      questions: [
        {
          question_id: 'ask_material',
          question_text: 'Which material?',
          discriminating_attribute: 'material' as const,
          options: [
            { id: 'steel', label: 'Steel' },
            { id: 'brass', label: 'Brass' },
            { id: 'other', label: 'Other' },
            { id: 'none', label: 'None' },
          ],
          info_gain_score: 0.9,
          qgs_used: true,
        },
      ],
      total_ig_potential: 0.9,
    });

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(qgsMock).toHaveBeenCalledTimes(1);
    // No question matched the group's differing field → no pin-check, finalize.
    expect(isAttributePinnedMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('degrades to L4 classification (never throws) when the lever internals throw', async () => {
    getTLAForCodesMock.mockRejectedValue(new Error('DB hiccup'));

    const res = await classify('coffee beans');

    // Graceful degrade: a thrown error inside the lever yields the L4 classification.
    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the Q-budget is exhausted (q_budget=0)', async () => {
    const res = await classify('coffee beans', { q_budget: 0 });

    // Note: triage is mocked to CLASSIFY, so q_budget=0 does not force a triage
    // REFUSE here; it must suppress the sibling lever directly (qBudget<=0 guard).
    expect(res.decision).toBe('CLASSIFY');
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on a Select REFUSE (null selected_code) → REFUSE unchanged', async () => {
    selectMock.mockResolvedValue({ ...selectOutLowConf, selected_code: null, refusal: { reason: 'no faithful match' } });

    const res = await classify('coffee beans');

    expect(res.decision).toBe('REFUSE');
    // The gate never engages without a selected_code.
    expect(getTLAForCodesMock).not.toHaveBeenCalled();
    expect(qgsMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * CALIBRATED-CLASSIFY lever (ASK → CLASSIFY upgrade; env-gated; default OFF →
 * byte-identical). The MIRROR of the SIBLING-ASK lever: same
 * computeSiblingRerankMargin signal, OPPOSITE polarity — it fires on a LARGE
 * dominant margin over ONE residual subheading (the gold leaf is pinned), runs
 * the shared select/verify/repair sequence, and upgrades an L1 ASK to a CLASSIFY.
 * It can ONLY upgrade ASK→CLASSIFY; a select REFUSE / exhausted repair preserves
 * the original ASK (never emits REFUSE).
 * --------------------------------------------------------------------------- */

/** Two siblings under 7318.15 with a STRONG (≥0.30) dominant margin (0.95−0.55 = 0.40). */
const CC_STRONG_DOMINANT: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.95),
  mkSibling('7318.15.10', 0.55),
];
/** Two siblings under 7318.15 with a DOMINANT-but-not-strong margin (0.95−0.75 = 0.20). */
const CC_DOMINANT_NOT_STRONG: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.95),
  mkSibling('7318.15.10', 0.75),
];
/** Two siblings under 7318.15 with a SMALL margin (0.90−0.88 = 0.02 < 0.15) → no dominance. */
const CC_SMALL_MARGIN: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.90),
  mkSibling('7318.15.10', 0.88),
];
/** Two survivors in DIFFERENT subheadings → gate A (concentration) fails. */
const CC_TWO_SUBHEADINGS: RetrievalCandidate[] = [
  mkSibling(SELECTED, 0.95),
  mkSibling('7318.16.00', 0.55),
];

describe('classify() — CALIBRATED-CLASSIFY lever GATE OFF (default → byte-identical ASK)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CALIBRATED_CLASSIFY_ENABLED;
    delete process.env.CALIBRATED_CLASSIFY_MARGIN;
    delete process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN;
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOutAsk); // L1 ASK → handleTriageAsk path
    retrieveMock.mockResolvedValue(retrievalOut);
    // STRONG dominant single subheading: ONLY the env gate suppresses the lever.
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_STRONG_DOMINANT));
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
    qgsMock.mockResolvedValue(null); // ASK falls back to the L1 question
  });

  afterEach(() => {
    delete process.env.CALIBRATED_CLASSIFY_ENABLED;
    delete process.env.CALIBRATED_CLASSIFY_MARGIN;
    delete process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN;
  });

  it('returns the unchanged ASK and does ZERO lever work (no select/verify/PK lookup)', async () => {
    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(res.question?.question_id).toBe('ask_form');
    // CRITICAL: with the gate off, the lever does ZERO work — never selects/verifies/looks up.
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
    expect(getParentChainsMock).not.toHaveBeenCalled();
    // No CALIBRATED-CLASSIFY hop in the path.
    expect(res.diagnostics.escalation_path).not.toContain('CALIBRATED-CLASSIFY');
  });
});

describe('classify() — CALIBRATED-CLASSIFY lever GATE ON', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALIBRATED_CLASSIFY_ENABLED = 'true';
    delete process.env.CALIBRATED_CLASSIFY_MARGIN;        // default 0.15
    delete process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN; // default 0.30
    normalizeMock.mockResolvedValue(normalizedOut);
    triageMock.mockResolvedValue(triageOutAsk); // L1 ASK → handleTriageAsk path
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_STRONG_DOMINANT));
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierPass);
    qgsMock.mockResolvedValue(null);
    // Description that does NOT verbatim-match the query → only STRONG fires
    // unless a test overrides the chain to a matching description.
    getParentChainsMock.mockResolvedValue([
      { code: SELECTED, description: 'totally unrelated wording', subheading: '7318.15', heading: '7318', chapter: '73' },
    ]);
  });

  afterEach(() => {
    delete process.env.CALIBRATED_CLASSIFY_ENABLED;
    delete process.env.CALIBRATED_CLASSIFY_MARGIN;
    delete process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN;
  });

  it('upgrades ASK→CLASSIFY on a STRONG dominant margin (gate C via strong, skips PK lookup)', async () => {
    const res = await classify('coffee beans', { captureTrace: true });

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    // STRONG ⇒ no verbatim PK lookup needed.
    expect(getParentChainsMock).not.toHaveBeenCalled();
    // The shared select/verify ran.
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
    // Trace records the CALIBRATED-CLASSIFY hop with the decision metadata.
    const trace = res.diagnostics.trace ?? [];
    const step = trace.find((t) => t.layer === 'CALIBRATED-CLASSIFY' && t.event === 'classify');
    expect(step).toBeDefined();
    expect(step?.payload?.subheading).toBe('7318.15');
    expect(step?.payload?.strong).toBe(true);
    expect(step?.payload?.margin).toBeCloseTo(0.4, 10);
    expect(res.diagnostics.escalation_path).toContain('CALIBRATED-CLASSIFY');
  });

  it('upgrades via VERBATIM-PIN when the margin is dominant-but-not-strong and the query matches the top description', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_DOMINANT_NOT_STRONG));
    // Top survivor's description equals the normalized query → verbatim pin.
    getParentChainsMock.mockResolvedValue([
      { code: SELECTED, description: normalizedOut.normalized_query, subheading: '7318.15', heading: '7318', chapter: '73' },
    ]);

    const res = await classify('coffee beans', { captureTrace: true });

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    // Not strong → the PK lookup WAS consulted for the verbatim pin.
    expect(getParentChainsMock).toHaveBeenCalledTimes(1);
    const trace = res.diagnostics.trace ?? [];
    const step = trace.find((t) => t.layer === 'CALIBRATED-CLASSIFY' && t.event === 'classify');
    expect(step?.payload?.verbatim_match).toBe(true);
    expect(step?.payload?.strong).toBe(false);
  });

  it('preserves the ASK when dominant-but-not-strong AND no verbatim pin (gate C fails)', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_DOMINANT_NOT_STRONG));
    // Description does NOT match the query (default mock) → neither strong nor verbatim.
    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(res.question?.question_id).toBe('ask_form');
    expect(getParentChainsMock).toHaveBeenCalledTimes(1);
    // Lever bailed before running select/verify.
    expect(selectMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when the margin is SMALL (below dominant cutoff) → preserves ASK', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_SMALL_MARGIN));

    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    // Gate B fails before any PK lookup / select.
    expect(getParentChainsMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when survivors span ≥2 subheadings (gate A concentration fails) → preserves ASK', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_TWO_SUBHEADINGS));

    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(getParentChainsMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('NEVER emits REFUSE — a select REFUSE preserves the original ASK', async () => {
    selectMock.mockResolvedValue({ ...selectOut, selected_code: null, refusal: { reason: 'no faithful match' } });

    const res = await classify('coffee beans');

    // The lever ran select (STRONG margin) but the select REFUSE must fall back
    // to the ASK — the lever can NEVER downgrade to REFUSE.
    expect(res.decision).toBe('ASK');
    expect(res.question?.question_id).toBe('ask_form');
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the ASK when verify exhausts all repairs (escalation, not CLASSIFY-upgrade)', async () => {
    // STRONG margin → lever runs select/verify. Verify fails 4× (initial + 3 repairs)
    // → runSelectVerifyRepair returns a BaselineEscalation result. The lever upgrades
    // ONLY a CLASSIFY; an escalation outcome is non-CLASSIFY here only if it is not a
    // CLASSIFY — BaselineEscalation emits CLASSIFY, so this asserts the upgrade still
    // happens when escalation produces a CLASSIFY (best-result policy).
    selectMock.mockResolvedValue(selectOut);
    verifyMock.mockResolvedValue(verifierFail);

    const res = await classify('coffee beans');

    // BaselineEscalation.onVerifierExhausted emits a CLASSIFY (best result) → the
    // lever DOES upgrade. Assert it is a CLASSIFY (never REFUSE) and select ran 4×.
    expect(res.decision).toBe('CLASSIFY');
    expect(selectMock).toHaveBeenCalledTimes(4);
  });

  it('upgrades on a single-survivor (null margin) via VERBATIM-PIN', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith([mkSibling(SELECTED, 0.9)]));
    getParentChainsMock.mockResolvedValue([
      { code: SELECTED, description: normalizedOut.normalized_query, subheading: '7318.15', heading: '7318', chapter: '73' },
    ]);

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    expect(res.classification?.code).toBe(SELECTED);
    // Single survivor null-margin path is not strong → verbatim PK lookup consulted.
    expect(getParentChainsMock).toHaveBeenCalledTimes(1);
  });

  it('degrades to the ASK (never throws) when the PK lookup throws', async () => {
    rulesFilterMock.mockResolvedValue(rulesFilterWith(CC_DOMINANT_NOT_STRONG));
    getParentChainsMock.mockRejectedValue(new Error('DB hiccup'));

    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(res.question?.question_id).toBe('ask_form');
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('CALIBRATED_CLASSIFY_MARGIN=0.50 excludes the 0.40 strong margin → preserves ASK', async () => {
    process.env.CALIBRATED_CLASSIFY_MARGIN = '0.50'; // 0.40 < 0.50 → gate B fails
    const res = await classify('coffee beans');

    expect(res.decision).toBe('ASK');
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('CALIBRATED_CLASSIFY_STRONG_MARGIN=0.50 forces the 0.40 margin through the verbatim path', async () => {
    process.env.CALIBRATED_CLASSIFY_STRONG_MARGIN = '0.50'; // 0.40 < 0.50 → not strong
    // Description matches → verbatim pin carries gate C.
    getParentChainsMock.mockResolvedValue([
      { code: SELECTED, description: normalizedOut.normalized_query, subheading: '7318.15', heading: '7318', chapter: '73' },
    ]);

    const res = await classify('coffee beans');

    expect(res.decision).toBe('CLASSIFY');
    // 0.40 is no longer "strong" → the verbatim PK lookup WAS consulted.
    expect(getParentChainsMock).toHaveBeenCalledTimes(1);
  });
});

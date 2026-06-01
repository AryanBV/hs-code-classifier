/**
 * A3 token-meter wiring test for the orchestrator.
 *
 * Proves the end-to-end seam: classify() runs its pipeline inside runWithMeter;
 * the L1/L4 LLM calls (and the L2 reranker, when it fires) go through the REAL
 * generateContent facade (which calls recordUsage); and the accumulated totals
 * land on diagnostics.token_usage.
 *
 * Invariant under test: token_usage.llmCalls is a SUPERSET of (>=)
 * diagnostics.llm_calls. The meter counts EVERY metered generateContent (L1 +
 * L4 + repair/backtrack selects + the L2 Gemini-Flash reranker), whereas
 * diagnostics.llm_calls counts only L1/L4 (and would-be L6/L7) decision calls
 * and intentionally excludes retrieval/reranking. When retrieval makes no
 * facade call (reranker fully mocked away) they happen to be equal; when the
 * reranker fires, llmCalls === llm_calls + (rerank generateContent calls).
 *
 * Strategy: the deterministic layers (L0/L2/L3/L5) are mocked to fixed outputs.
 * L1 triage and L4 select are mocked to each invoke the REAL facade
 * `generateContent` ONCE (the developer provider is mocked to return a fixed
 * usage, so there is NO network). One test additionally makes the retrieve mock
 * fire a facade call (a stand-in for the reranker) so the SUPERSET shape is
 * actually exercised — the test would FAIL if someone re-coupled the meter to
 * llm_calls.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/index.token-usage.test.ts
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
} from './types';
import type { GenerateContentResult } from './lib/llm-provider';

/* ---- Mock the developer provider so the REAL facade returns a fixed usage --- */
const FLASH_USAGE: GenerateContentResult['usage'] = {
  promptTokens: 1000,
  outputTokens: 200,
  thoughtsTokens: 50,
  totalTokens: 1250,
  cachedTokens: 300,
};
const mockDevGenerateContent = vi.fn();
vi.mock('./lib/gemini-developer-client', () => ({
  GeminiDeveloperLlmProvider: class {
    generateContent(...args: unknown[]): unknown {
      return mockDevGenerateContent(...args);
    }
  },
}));

/* ---- Layer mocks (deterministic, except L1/L4 call the real facade) -------- */
const normalizeMock = vi.fn();
const retrieveMock = vi.fn();
const rulesFilterMock = vi.fn();
const verifyMock = vi.fn();
const qgsMock = vi.fn();
const computeSiblingDiscriminatorsMock = vi.fn(() => [] as unknown[]);
const getTLAForCodesMock = vi.fn(async () => ({} as Record<string, unknown>));

vi.mock('./layers/L0-normalization', () => ({
  normalize: (...args: unknown[]) => normalizeMock(...args),
}));
// L1 triage: invokes the REAL facade once (an LLM call), then returns its output.
vi.mock('./layers/L1-triage', async () => {
  const { generateContent } = await import('./lib/llm-provider');
  return {
    triage: async (): Promise<TriageOutput> => {
      await generateContent({ model: 'gemini-3.5-flash', prompt: 'triage', thinkingLevel: 'low' });
      return triageOut;
    },
  };
});
vi.mock('./layers/L2-retrieval', () => ({
  retrieve: (...args: unknown[]) => retrieveMock(...args),
}));
vi.mock('./layers/L3-rules-filter', () => ({
  rulesFilter: (...args: unknown[]) => rulesFilterMock(...args),
}));
// L4 select: invokes the REAL facade once (an LLM call), then returns its output.
vi.mock('./layers/L4-select', async () => {
  const { generateContent } = await import('./lib/llm-provider');
  return {
    select: async (): Promise<SelectOutput> => {
      await generateContent({ model: 'gemini-3.5-flash', prompt: 'select', thinkingLevel: 'low' });
      return selectOut;
    },
    computeSiblingDiscriminators: (...args: unknown[]) => computeSiblingDiscriminatorsMock(...args),
    getTariffLineAttributesForCodes: (...args: unknown[]) => getTLAForCodesMock(...args),
  };
});
vi.mock('./layers/L5-verifier', () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
}));
vi.mock('./layers/QGS-generator', () => ({
  selectQGSBatch: (...args: unknown[]) => qgsMock(...args),
}));
vi.mock('./lib/supabase-client', () => ({
  getTariffLineParentChains: vi.fn(async () => [] as unknown[]),
}));

import { classify } from './index';

/* ---- Fixtures -------------------------------------------------------------- */
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

const SELECTED = '7318.15.00';

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

const retrievalOut: RetrievalOutput = {
  candidates: [mkCandidate(SELECTED), mkCandidate('7318.16.00')],
  retrieval_scores: {},
  fts_matches: [],
  exclusion_pre_filter: [],
  retrieval_strategy: 'cascade_full',
  query_embedding: [0.1, 0.2, 0.3, 0.4],
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
  reasoning_chain: ['Threaded fastener of steel.'],
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

/* ---- Tests ----------------------------------------------------------------- */
describe('classify() — A3 diagnostics.token_usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LLM_PROVIDER; // default → developer provider (mocked)
    normalizeMock.mockResolvedValue(normalizedOut);
    retrieveMock.mockResolvedValue(retrievalOut);
    rulesFilterMock.mockResolvedValue(rulesFilterOut);
    verifyMock.mockResolvedValue(verifierPass);
    mockDevGenerateContent.mockResolvedValue({
      text: '{}',
      usage: FLASH_USAGE,
      finishReason: 'STOP',
      latencyMs: 1,
      model: 'gemini-3.5-flash',
    } satisfies GenerateContentResult);
  });

  afterEach(() => {
    delete process.env.LLM_PROVIDER;
  });

  it('populates token_usage from the real per-call usage (L1 + L4 = 2 calls)', async () => {
    const res = await classify('stainless steel hex bolts M10');
    expect(res.decision).toBe('CLASSIFY');

    const tu = res.diagnostics.token_usage;
    expect(tu).toBeDefined();
    if (!tu) throw new Error('token_usage missing');

    // Two metered facade calls (L1 triage + L4 select), each FLASH_USAGE.
    expect(tu.llmCalls).toBe(2);
    expect(tu.promptTokens).toBe(2000);
    expect(tu.outputTokens).toBe(400);
    expect(tu.thoughtsTokens).toBe(100);
    expect(tu.totalTokens).toBe(2500);
    expect(tu.cachedTokens).toBe(600);
    expect(tu.byModel['gemini-3.5-flash'].calls).toBe(2);
  });

  it('holds the SUPERSET invariant token_usage.llmCalls >= diagnostics.llm_calls', async () => {
    const res = await classify('stainless steel hex bolts M10');
    const tu = res.diagnostics.token_usage;
    if (!tu) throw new Error('token_usage missing');
    // Meter counts EVERY metered generateContent; llm_calls counts only L1/L4
    // decision calls. The meter is a superset, never a subset.
    expect(tu.llmCalls).toBeGreaterThanOrEqual(res.diagnostics.llm_calls);
    // With the reranker fully mocked away, retrieval makes NO facade call, so
    // the only metered calls are the two L1/L4 decision calls and they coincide.
    expect(tu.llmCalls).toBe(res.diagnostics.llm_calls);
  });

  it('counts the L2 reranker generateContent in token_usage but NOT in llm_calls (true superset)', async () => {
    // Make retrieval fire ONE real facade call — a stand-in for the L2
    // Gemini-Flash reranker, which calls generateContent through this same
    // facade from inside the retrieval step. This is the production shape the
    // fully-mocked retrieval hides: a metered call that is NOT an llm_call.
    const { generateContent } = await import('./lib/llm-provider');
    const RERANK_CALLS = 1;
    retrieveMock.mockImplementation(async () => {
      for (let i = 0; i < RERANK_CALLS; i++) {
        await generateContent({ model: 'gemini-3.5-flash', prompt: 'rerank', thinkingLevel: 'low' });
      }
      return retrievalOut;
    });

    const res = await classify('stainless steel hex bolts M10');
    expect(res.decision).toBe('CLASSIFY');
    const tu = res.diagnostics.token_usage;
    if (!tu) throw new Error('token_usage missing');

    // L1 + L4 = 2 decision calls; reranker adds 1 metered (non-decision) call.
    expect(res.diagnostics.llm_calls).toBe(2);
    expect(tu.llmCalls).toBe(res.diagnostics.llm_calls + RERANK_CALLS);
    expect(tu.llmCalls).toBeGreaterThan(res.diagnostics.llm_calls);
    // Three metered FLASH_USAGE calls in total (2 decision + 1 rerank).
    expect(tu.byModel['gemini-3.5-flash'].calls).toBe(2 + RERANK_CALLS);
    expect(tu.promptTokens).toBe(1000 * (2 + RERANK_CALLS));
  });
});

/**
 * Unit tests for the Reranker abstraction (mocked — no network).
 *
 * `./llm-provider` and `./cohere-client` are mocked. Asserts the GeminiFlash
 * reranker's recall-safety contract is exactly right:
 *  (a) correct id->score mapping, sort desc, topN cap;
 *  (b) an OMITTED candidate gets score 0 and is APPENDED (never dropped);
 *  (c) a HALLUCINATED id (not in input) is IGNORED;
 *  (d) malformed/empty LLM output degrades to input order with 0 scores (no throw);
 *  (e) a transient LLM error becomes a retryable RetrievalProviderError;
 *  (f) CohereReranker passes the cohere-client shape through (+ wraps errors);
 *  (g) getReranker default + env switch + voyage-throws + unknown-throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
// reranker now imports `generateContent` from the A2 provider seam, so the mock
// must target `./llm-provider` (not `./vertex-client`). Keep the real type
// re-exports the reranker relies on (VertexResponseSchema) via importOriginal.
vi.mock('./llm-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llm-provider')>();
  return {
    ...actual,
    generateContent: (...args: unknown[]) => mockGenerateContent(...args),
  };
});

const mockCohereRerank = vi.fn();
// `vi.mock` factories are hoisted above the module body, so anything they
// reference must also be hoisted. Declare the fake error class inside
// `vi.hoisted` so it exists when the factory runs (avoids the TDZ
// "Cannot access 'FakeCohereError' before initialization" error).
const { FakeCohereError } = vi.hoisted(() => {
  class FakeCohereError extends Error {
    constructor(
      message: string,
      public readonly status: number | null,
    ) {
      super(message);
      this.name = 'CohereError';
    }
  }
  return { FakeCohereError };
});
vi.mock('./cohere-client', () => ({
  rerank: (...args: unknown[]) => mockCohereRerank(...args),
  CohereError: FakeCohereError,
}));

import {
  GeminiFlashReranker,
  CohereReranker,
  getReranker,
  type RerankDocument,
} from './reranker';
import { RetrievalProviderError } from './retrieval-errors';

function llmReply(rankings: Array<{ id: string; score: number }>): { text: string } {
  return { text: JSON.stringify({ rankings }) };
}

const DOCS: RerankDocument[] = [
  { id: 'A', text: 'screws of stainless steel' },
  { id: 'B', text: 'fresh cut roses' },
  { id: 'C', text: 'hex bolts of stainless steel M10' },
];

describe('GeminiFlashReranker', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('has a stable name', () => {
    expect(new GeminiFlashReranker().name).toBe('gemini-flash/gemini-3.5-flash');
  });

  it('(a) maps id->score, sorts desc, and respects topN', async () => {
    mockGenerateContent.mockResolvedValue(
      llmReply([
        { id: 'A', score: 0.6 },
        { id: 'B', score: 0.1 },
        { id: 'C', score: 0.95 },
      ]),
    );
    const r = new GeminiFlashReranker();
    const { ranked } = await r.rerank('stainless steel hex bolts', DOCS, { topN: 2 });

    expect(ranked.map((x) => x.id)).toEqual(['C', 'A']); // sorted desc, capped to 2
    expect(ranked[0].relevance_score).toBeCloseTo(0.95, 6);
    expect(ranked[1].relevance_score).toBeCloseTo(0.6, 6);
  });

  it('returns ALL when topN is omitted, sorted desc', async () => {
    mockGenerateContent.mockResolvedValue(
      llmReply([
        { id: 'A', score: 0.6 },
        { id: 'B', score: 0.1 },
        { id: 'C', score: 0.95 },
      ]),
    );
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);
    expect(ranked.map((x) => x.id)).toEqual(['C', 'A', 'B']);
    expect(ranked).toHaveLength(3);
  });

  it('(b) an OMITTED candidate gets score 0 and is appended after the scored ones (never dropped)', async () => {
    // Model scores A and C but omits B entirely.
    mockGenerateContent.mockResolvedValue(
      llmReply([
        { id: 'A', score: 0.5 },
        { id: 'C', score: 0.9 },
      ]),
    );
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);

    // All three preserved; scored ones first (desc), omitted (B, score 0) last.
    expect(ranked).toHaveLength(3);
    expect(ranked.map((x) => x.id)).toEqual(['C', 'A', 'B']);
    const b = ranked.find((x) => x.id === 'B');
    expect(b?.relevance_score).toBe(0);
  });

  it('(c) a HALLUCINATED id not in the input set is ignored', async () => {
    mockGenerateContent.mockResolvedValue(
      llmReply([
        { id: 'A', score: 0.5 },
        { id: 'ZZZ', score: 0.99 }, // not an input id
        { id: 'B', score: 0.2 },
        { id: 'C', score: 0.8 },
      ]),
    );
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((x) => x.id).sort()).toEqual(['A', 'B', 'C']);
    expect(ranked.find((x) => x.id === 'ZZZ')).toBeUndefined();
  });

  it('(d) malformed JSON degrades to input order with 0 scores (no throw)', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not json at all {{{' });
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);
    expect(ranked.map((x) => x.id)).toEqual(['A', 'B', 'C']); // input order preserved
    expect(ranked.every((x) => x.relevance_score === 0)).toBe(true);
  });

  it('(d) empty rankings array degrades to input order with 0 scores', async () => {
    mockGenerateContent.mockResolvedValue(llmReply([]));
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);
    expect(ranked.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    expect(ranked.every((x) => x.relevance_score === 0)).toBe(true);
  });

  it('clamps out-of-range scores into [0,1]', async () => {
    mockGenerateContent.mockResolvedValue(
      llmReply([
        { id: 'A', score: 1.7 },
        { id: 'B', score: -0.4 },
        { id: 'C', score: 0.5 },
      ]),
    );
    const { ranked } = await new GeminiFlashReranker().rerank('q', DOCS);
    const byId = Object.fromEntries(ranked.map((x) => [x.id, x.relevance_score]));
    expect(byId.A).toBe(1);
    expect(byId.B).toBe(0);
    expect(byId.C).toBe(0.5);
  });

  it('(e) wraps a transient LLM error into a retryable RetrievalProviderError', async () => {
    const transient = Object.assign(new Error('After 3 retry attempts: 503'), {});
    mockGenerateContent.mockRejectedValue(transient);
    const r = new GeminiFlashReranker();
    try {
      await r.rerank('q', DOCS);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      expect((e as RetrievalProviderError).provider).toBe('vertex');
      expect((e as RetrievalProviderError).retryable).toBe(true);
    }
  });

  it('rejects empty documents with a RetrievalProviderError (no LLM call)', async () => {
    await expect(new GeminiFlashReranker().rerank('q', [])).rejects.toBeInstanceOf(
      RetrievalProviderError,
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty query with a RetrievalProviderError', async () => {
    await expect(new GeminiFlashReranker().rerank('', DOCS)).rejects.toBeInstanceOf(
      RetrievalProviderError,
    );
  });
});

describe('CohereReranker', () => {
  beforeEach(() => {
    mockCohereRerank.mockReset();
  });

  it('has a stable name', () => {
    expect(new CohereReranker().name).toBe('cohere/rerank-v4.0-pro');
  });

  it('(f) passes the cohere-client shape through (id + relevance_score, sorted)', async () => {
    mockCohereRerank.mockResolvedValue({
      ranked: [
        { id: 'C', relevance_score: 0.91 },
        { id: 'A', relevance_score: 0.4 },
        { id: 'B', relevance_score: 0.02 },
      ],
      latencyMs: 12,
    });
    const { ranked, latencyMs } = await new CohereReranker().rerank('q', DOCS, { topN: 2 });
    expect(latencyMs).toBe(12);
    expect(ranked).toEqual([
      { id: 'C', relevance_score: 0.91 },
      { id: 'A', relevance_score: 0.4 },
      { id: 'B', relevance_score: 0.02 },
    ]);
    // topN is forwarded to cohere-client (which caps server-side)
    const [, , opts] = mockCohereRerank.mock.calls[0] as [string, unknown, { topN?: number }];
    expect(opts.topN).toBe(2);
  });

  it('wraps a CohereError into a RetrievalProviderError with retryable derived from status', async () => {
    mockCohereRerank.mockRejectedValue(new FakeCohereError('rate limited', 429));
    try {
      await new CohereReranker().rerank('q', DOCS);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      expect((e as RetrievalProviderError).provider).toBe('cohere');
      expect((e as RetrievalProviderError).retryable).toBe(true);
    }
  });

  it('wraps a hard CohereError (400) as non-retryable', async () => {
    mockCohereRerank.mockRejectedValue(new FakeCohereError('bad request', 400));
    try {
      await new CohereReranker().rerank('q', DOCS);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as RetrievalProviderError).retryable).toBe(false);
    }
  });
});

describe('getReranker', () => {
  const original = process.env.RERANKER;
  afterEach(() => {
    if (original === undefined) delete process.env.RERANKER;
    else process.env.RERANKER = original;
  });

  it('returns GeminiFlashReranker by default (env unset)', () => {
    delete process.env.RERANKER;
    expect(getReranker().name).toBe('gemini-flash/gemini-3.5-flash');
  });

  it("returns GeminiFlashReranker for RERANKER='gemini-flash'", () => {
    process.env.RERANKER = 'gemini-flash';
    expect(getReranker().name).toBe('gemini-flash/gemini-3.5-flash');
  });

  it("returns CohereReranker for RERANKER='cohere'", () => {
    process.env.RERANKER = 'cohere';
    expect(getReranker().name).toBe('cohere/rerank-v4.0-pro');
  });

  it("throws a clear 'not implemented' error for RERANKER='voyage'", () => {
    process.env.RERANKER = 'voyage';
    expect(() => getReranker()).toThrow(RetrievalProviderError);
    expect(() => getReranker()).toThrow(/voyage.*not implemented|VOYAGE_API_KEY/i);
  });

  it('throws a clear error for an unknown RERANKER value', () => {
    process.env.RERANKER = 'banana';
    expect(() => getReranker()).toThrow(/Unknown RERANKER='banana'/);
  });
});

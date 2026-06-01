/**
 * Unit tests for the Gemini Developer API embedding client (Phase A2) — mocked.
 *
 * `@google/genai` is mocked so the provider's wiring is asserted with NO network:
 *  (a) name + dim are the single source of truth (developer/gemini-embedding-001, 1536);
 *  (b) normalizes the returned vector to unit norm (L2);
 *  (c) returns the requested 1536 dims and forwards taskType + outputDimensionality;
 *  (d) rejects a bad taskType at the boundary (no SDK call) as RetrievalProviderError;
 *  (e) a dimensionality mismatch fails loud (non-retryable);
 *  (f) retries a transient 503 then succeeds;
 *  (g) requires GEMINI_API_KEY.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEmbedContent = vi.fn();
const mockCtor = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    public models: { embedContent: (...a: unknown[]) => unknown };
    constructor(opts: unknown) {
      mockCtor(opts);
      this.models = { embedContent: (...a: unknown[]) => mockEmbedContent(...a) };
    }
  },
}));

import { GeminiDeveloperEmbeddingProvider } from './gemini-developer-embed';
import * as backoff from './retry-backoff';
import { RetrievalProviderError } from './retrieval-errors';

/** A raw (non-unit) 1536-dim vector whose only nonzero entries are 3 and 4 (norm 5). */
function rawVec(): number[] {
  const v = new Array<number>(1536).fill(0);
  v[0] = 3;
  v[1] = 4;
  return v;
}

function apiError(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

/** A 429 ApiError whose message is the JSON error body, like the @google/genai SDK. */
function rateLimitError(opts: { retryDelay?: string; proseSeconds?: number }): Error & {
  status: number;
} {
  const details: Array<Record<string, unknown>> = [];
  if (opts.retryDelay !== undefined) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.RetryInfo',
      retryDelay: opts.retryDelay,
    });
  }
  const prose =
    opts.proseSeconds !== undefined
      ? `Resource has been exhausted. Please retry in ${opts.proseSeconds}s.`
      : 'Resource has been exhausted (e.g. check quota).';
  const body = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: prose, details } };
  const e = new Error(JSON.stringify(body)) as Error & { status: number };
  e.status = 429;
  return e;
}

function l2norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe('GeminiDeveloperEmbeddingProvider', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  let sleepSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockEmbedContent.mockReset();
    mockCtor.mockReset();
    process.env.GEMINI_API_KEY = 'test-free-tier-key';
    delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    sleepSpy = vi.spyOn(backoff, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sleepSpy.mockRestore();
    delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('exposes name + dim as the single source of truth', () => {
    const p = new GeminiDeveloperEmbeddingProvider();
    expect(p.name).toBe('developer/gemini-embedding-001');
    expect(p.dim).toBe(1536);
  });

  it('normalizes the returned vector to unit norm and returns 1536 dims', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: rawVec() }] });
    const p = new GeminiDeveloperEmbeddingProvider();
    const res = await p.embed('stainless steel hex bolts', { taskType: 'RETRIEVAL_QUERY' });

    expect(res.dim).toBe(1536);
    expect(res.embedding.length).toBe(1536);
    expect(l2norm(res.embedding)).toBeCloseTo(1, 10);
    // 3/5, 4/5 after normalization.
    expect(res.embedding[0]).toBeCloseTo(0.6, 10);
    expect(res.embedding[1]).toBeCloseTo(0.8, 10);
  });

  it('forwards taskType + outputDimensionality(1536) + model to embedContent', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: rawVec() }] });
    const p = new GeminiDeveloperEmbeddingProvider();
    await p.embed('Bolts and screws of stainless steel', { taskType: 'RETRIEVAL_DOCUMENT' });

    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    const params = mockEmbedContent.mock.calls[0][0] as {
      model: string;
      contents: string;
      config: { taskType: string; outputDimensionality: number };
    };
    expect(params.model).toBe('gemini-embedding-001');
    expect(params.contents).toBe('Bolts and screws of stainless steel');
    expect(params.config.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(params.config.outputDimensionality).toBe(1536);
  });

  it('rejects a bad taskType at the boundary as RetrievalProviderError (no SDK call)', async () => {
    const p = new GeminiDeveloperEmbeddingProvider();
    for (const bad of ['query', 'RETRIEVAL_DOC', 'document', '', 'retrieval_query'] as unknown[]) {
      mockEmbedContent.mockReset();
      try {
        await p.embed('x', { taskType: bad as 'RETRIEVAL_QUERY' });
        throw new Error(`should have thrown for taskType=${String(bad)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(RetrievalProviderError);
        expect((e as RetrievalProviderError).retryable).toBe(false);
        expect((e as Error).message).toMatch(/taskType/i);
      }
      expect(mockEmbedContent).not.toHaveBeenCalled();
    }
  });

  it('fails loud (non-retryable) on a dimensionality mismatch', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [1, 2, 3] }] });
    const p = new GeminiDeveloperEmbeddingProvider();
    try {
      await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      expect((e as RetrievalProviderError).retryable).toBe(false);
      expect((e as Error).message).toMatch(/dimensionality mismatch/i);
    }
    // Mismatch is a hard error → never retried.
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });

  it('fails loud on a malformed (empty) response', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [] }] });
    const p = new GeminiDeveloperEmbeddingProvider();
    await expect(p.embed('x', { taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(
      RetrievalProviderError,
    );
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 then succeeds', async () => {
    mockEmbedContent
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ embeddings: [{ values: rawVec() }] });
    const p = new GeminiDeveloperEmbeddingProvider();
    const res = await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    expect(res.dim).toBe(1536);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
  });

  it('wraps a hard 400 into a non-retryable RetrievalProviderError', async () => {
    mockEmbedContent.mockRejectedValue(apiError(400));
    const p = new GeminiDeveloperEmbeddingProvider();
    try {
      await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      expect((e as RetrievalProviderError).retryable).toBe(false);
    }
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });

  it('truncateChars from the constructor caps the input before sending', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: rawVec() }] });
    const p = new GeminiDeveloperEmbeddingProvider(10);
    await p.embed('this text is definitely longer than ten characters', { taskType: 'RETRIEVAL_DOCUMENT' });
    const params = mockEmbedContent.mock.calls[0][0] as { contents: string };
    expect(params.contents).toBe('this text ');
    expect(params.contents.length).toBe(10);
  });

  it('throws a clear RetrievalProviderError when GEMINI_API_KEY is missing (no SDK call)', async () => {
    delete process.env.GEMINI_API_KEY;
    const p = new GeminiDeveloperEmbeddingProvider();
    await expect(p.embed('x', { taskType: 'RETRIEVAL_QUERY' })).rejects.toThrow(
      /GEMINI_API_KEY is not set/,
    );
    expect(mockEmbedContent).not.toHaveBeenCalled();
  });

  it('429 with structured RetryInfo.retryDelay="8s" → waits ~8s then succeeds', async () => {
    mockEmbedContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '8s' }))
      .mockResolvedValueOnce({ embeddings: [{ values: rawVec() }] });

    const p = new GeminiDeveloperEmbeddingProvider();
    const res = await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    expect(res.dim).toBe(1536);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy.mock.calls[0][0] as number).toBe(8250);
  });

  it('429 with the delay ONLY in the prose ("retry in 12.5s") → parses 12.5s', async () => {
    mockEmbedContent
      .mockRejectedValueOnce(rateLimitError({ proseSeconds: 12.5 }))
      .mockResolvedValueOnce({ embeddings: [{ values: rawVec() }] });

    const p = new GeminiDeveloperEmbeddingProvider();
    await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    expect(sleepSpy.mock.calls[0][0] as number).toBe(12500 + 250);
  });

  it('429 requested delay ABOVE the cap → waits only GEMINI_MAX_RETRY_WAIT_MS', async () => {
    process.env.GEMINI_MAX_RETRY_WAIT_MS = '5000';
    mockEmbedContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '40s' }))
      .mockResolvedValueOnce({ embeddings: [{ values: rawVec() }] });

    const p = new GeminiDeveloperEmbeddingProvider();
    await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    expect(sleepSpy.mock.calls[0][0] as number).toBe(5000);
  });

  it('sustained 429 → gives up after the bounded attempts and throws RetrievalProviderError (no infinite loop)', async () => {
    mockEmbedContent.mockRejectedValue(rateLimitError({ retryDelay: '1s' }));

    const p = new GeminiDeveloperEmbeddingProvider();
    await expect(p.embed('x', { taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(
      RetrievalProviderError,
    );
    expect(mockEmbedContent).toHaveBeenCalledTimes(5);
    expect(sleepSpy).toHaveBeenCalledTimes(4);
  });

  it('503 → uses FAST exponential backoff, not the long rate-limit wait', async () => {
    mockEmbedContent
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ embeddings: [{ values: rawVec() }] });

    const p = new GeminiDeveloperEmbeddingProvider();
    const res = await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    expect(res.dim).toBe(1536);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    const waited = sleepSpy.mock.calls[0][0] as number;
    expect(waited).toBeGreaterThanOrEqual(500);
    expect(waited).toBeLessThan(700);
  });
});

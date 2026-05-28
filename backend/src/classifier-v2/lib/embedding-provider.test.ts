/**
 * Unit tests for the EmbeddingProvider abstraction (mocked — no network).
 *
 * `./vertex-embed` is mocked so the provider's wiring is asserted in isolation:
 *  (a) VertexEmbeddingProvider.embed forwards taskType + outputDim to embedVertex
 *      and returns the vector/dim/latency;
 *  (b) name + dim are the single source of truth (vertex/gemini-embedding-001, 1536);
 *  (c) truncateChars from the constructor is forwarded (corpus job), and omitted
 *      by default (runtime query path);
 *  (d) a vendor error is wrapped into a provider-neutral RetrievalProviderError
 *      (retryable flag derived from transience);
 *  (e) getEmbeddingProvider returns vertex by default and throws on unknown env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEmbedVertex = vi.fn();
vi.mock('./vertex-embed', () => ({
  embedVertex: (...args: unknown[]) => mockEmbedVertex(...args),
}));

import {
  VertexEmbeddingProvider,
  getEmbeddingProvider,
} from './embedding-provider';
import { RetrievalProviderError } from './retrieval-errors';

function httpError(status: number): Error & { response: { status: number } } {
  const e = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  e.response = { status };
  return e;
}

describe('VertexEmbeddingProvider', () => {
  beforeEach(() => {
    mockEmbedVertex.mockReset();
  });

  it('exposes name + dim as the single source of truth', () => {
    const p = new VertexEmbeddingProvider();
    expect(p.name).toBe('vertex/gemini-embedding-001');
    expect(p.dim).toBe(1536);
  });

  it('forwards taskType + outputDim(1536) to embedVertex and returns vector/dim/latency', async () => {
    const embedding = new Array<number>(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    mockEmbedVertex.mockResolvedValue({
      embedding,
      dim: 1536,
      taskType: 'RETRIEVAL_QUERY',
      latencyMs: 42,
    });

    const p = new VertexEmbeddingProvider();
    const res = await p.embed('stainless steel hex bolts', { taskType: 'RETRIEVAL_QUERY' });

    // returns the vector/dim/latency
    expect(res.embedding).toBe(embedding);
    expect(res.dim).toBe(1536);
    expect(res.latencyMs).toBe(42);

    // forwards taskType + outputDim
    expect(mockEmbedVertex).toHaveBeenCalledTimes(1);
    const [text, taskType, opts] = mockEmbedVertex.mock.calls[0] as [
      string,
      string,
      { outputDim?: number; truncateChars?: number },
    ];
    expect(text).toBe('stainless steel hex bolts');
    expect(taskType).toBe('RETRIEVAL_QUERY');
    expect(opts.outputDim).toBe(1536);
    // no truncation on the default (runtime query) provider
    expect(opts.truncateChars).toBeUndefined();
  });

  it('forwards RETRIEVAL_DOCUMENT for corpus-side embedding', async () => {
    mockEmbedVertex.mockResolvedValue({
      embedding: [1, 0, 0],
      dim: 1536,
      taskType: 'RETRIEVAL_DOCUMENT',
      latencyMs: 1,
    });
    const p = new VertexEmbeddingProvider();
    await p.embed('Bolts and screws of stainless steel', { taskType: 'RETRIEVAL_DOCUMENT' });
    const [, taskType] = mockEmbedVertex.mock.calls[0] as [string, string, unknown];
    expect(taskType).toBe('RETRIEVAL_DOCUMENT');
  });

  it('forwards truncateChars from the constructor (corpus re-embed job)', async () => {
    mockEmbedVertex.mockResolvedValue({
      embedding: [1, 0, 0],
      dim: 1536,
      taskType: 'RETRIEVAL_DOCUMENT',
      latencyMs: 1,
    });
    const p = new VertexEmbeddingProvider(2000);
    await p.embed('long corpus row text', { taskType: 'RETRIEVAL_DOCUMENT' });

    const [, , opts] = mockEmbedVertex.mock.calls[0] as [
      string,
      string,
      { outputDim?: number; truncateChars?: number },
    ];
    expect(opts.truncateChars).toBe(2000);
    expect(opts.outputDim).toBe(1536);
  });

  it('wraps a transient vendor error into a retryable RetrievalProviderError', async () => {
    mockEmbedVertex.mockRejectedValue(httpError(429));
    const p = new VertexEmbeddingProvider();

    await expect(p.embed('x', { taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(
      RetrievalProviderError,
    );
    try {
      await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      const rpe = e as RetrievalProviderError;
      expect(rpe.provider).toBe('vertex');
      expect(rpe.retryable).toBe(true);
      expect((rpe as RetrievalProviderError & { cause?: unknown }).cause).toBeDefined();
    }
  });

  it('wraps a hard vendor error into a non-retryable RetrievalProviderError', async () => {
    mockEmbedVertex.mockRejectedValue(httpError(400));
    const p = new VertexEmbeddingProvider();
    try {
      await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetrievalProviderError);
      expect((e as RetrievalProviderError).retryable).toBe(false);
      expect((e as RetrievalProviderError).provider).toBe('vertex');
    }
  });

  it('(I2) validates taskType at the provider boundary and throws RetrievalProviderError (no network call)', async () => {
    const p = new VertexEmbeddingProvider();
    for (const bad of ['query', 'RETRIEVAL_DOC', 'document', '', 'retrieval_query'] as unknown[]) {
      mockEmbedVertex.mockReset();
      try {
        await p.embed('x', { taskType: bad as 'RETRIEVAL_QUERY' });
        throw new Error(`should have thrown for taskType=${String(bad)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(RetrievalProviderError);
        expect((e as RetrievalProviderError).provider).toBe('vertex');
        expect((e as RetrievalProviderError).retryable).toBe(false);
        expect((e as Error).message).toMatch(/taskType/i);
      }
      // A wrong taskType must be rejected BEFORE forwarding to embedVertex —
      // otherwise the corpus/query would be silently mis-embedded.
      expect(mockEmbedVertex).not.toHaveBeenCalled();
    }
  });

  it('(I2) accepts the two valid taskTypes and forwards them', async () => {
    mockEmbedVertex.mockResolvedValue({
      embedding: [1, 0, 0],
      dim: 1536,
      taskType: 'RETRIEVAL_QUERY',
      latencyMs: 1,
    });
    const p = new VertexEmbeddingProvider();
    await p.embed('x', { taskType: 'RETRIEVAL_QUERY' });
    await p.embed('y', { taskType: 'RETRIEVAL_DOCUMENT' });
    expect(mockEmbedVertex).toHaveBeenCalledTimes(2);
    expect((mockEmbedVertex.mock.calls[0] as [string, string, unknown])[1]).toBe('RETRIEVAL_QUERY');
    expect((mockEmbedVertex.mock.calls[1] as [string, string, unknown])[1]).toBe('RETRIEVAL_DOCUMENT');
  });
});

describe('getEmbeddingProvider', () => {
  const original = process.env.EMBEDDING_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.EMBEDDING_PROVIDER;
    else process.env.EMBEDDING_PROVIDER = original;
  });

  it('returns the Vertex provider by default (env unset)', () => {
    delete process.env.EMBEDDING_PROVIDER;
    const p = getEmbeddingProvider();
    expect(p.name).toBe('vertex/gemini-embedding-001');
    expect(p.dim).toBe(1536);
  });

  it("returns the Vertex provider for EMBEDDING_PROVIDER='vertex'", () => {
    process.env.EMBEDDING_PROVIDER = 'vertex';
    expect(getEmbeddingProvider().name).toBe('vertex/gemini-embedding-001');
  });

  it('throws a clear RetrievalProviderError for an unknown provider', () => {
    process.env.EMBEDDING_PROVIDER = 'cohere';
    expect(() => getEmbeddingProvider()).toThrow(RetrievalProviderError);
    expect(() => getEmbeddingProvider()).toThrow(/Unknown EMBEDDING_PROVIDER='cohere'/);
  });

  it('(M5) reads env at CALL time, not at module-load', () => {
    // First call with an unknown value throws; flipping back to a valid value
    // on the NEXT call succeeds — proves no import-frozen singleton.
    process.env.EMBEDDING_PROVIDER = 'cohere';
    expect(() => getEmbeddingProvider()).toThrow(RetrievalProviderError);
    process.env.EMBEDDING_PROVIDER = 'vertex';
    expect(getEmbeddingProvider().name).toBe('vertex/gemini-embedding-001');
  });
});

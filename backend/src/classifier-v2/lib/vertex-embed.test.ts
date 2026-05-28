/**
 * Unit tests for the Vertex `gemini-embedding-001` client (pure logic, mocked).
 *
 * The HTTP/auth layer (`./auth`) is mocked: `getAuthClient()` returns a fake
 * AuthClient whose `.request()` resolves a KNOWN raw (un-normalized) vector, and
 * `getProjectId()` returns a dummy project. No network is touched.
 *
 * Asserts:
 *  (a) correct parse of predictions[0].embeddings.values into number[]
 *  (b) output is L2-normalized (norm ≈ 1.0)
 *  (c) reported dim === embedding.length
 *  (d) direction is preserved by normalization (ratios unchanged)
 *  (e) malformed response throws a clear error
 *  (f) request wire shape uses task_type + outputDimensionality + :predict path
 *  (g) taskType is a REQUIRED param and is echoed verbatim in the request + result
 *  (h) a returned vector whose length !== requested outputDim throws (dim guard)
 *  (i) a zero-norm (degenerate) vector throws rather than emitting NaNs
 *  (j) truncateChars opt-in truncates the input; default is non-lossy
 *  (k) retry does NOT fire on non-retryable 4xx (400/401/403)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module BEFORE importing the client under test.
const mockRequest = vi.fn();
vi.mock('./auth', () => ({
  getAuthClient: vi.fn(async () => ({ request: mockRequest })),
  getProjectId: vi.fn(async () => 'test-project'),
}));

import { embedVertex, l2Normalize } from './vertex-embed';

/** Euclidean (L2) norm of a vector. */
function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/** Build an HTTP-error-like object the way google-auth-library surfaces it. */
function httpError(status: number): Error & { response: { status: number } } {
  const e = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  e.response = { status };
  return e;
}

describe('l2Normalize', () => {
  it('returns a unit-length vector', () => {
    const out = l2Normalize([3, 4]); // norm 5
    expect(norm(out)).toBeCloseTo(1.0, 12);
    expect(out[0]).toBeCloseTo(0.6, 12);
    expect(out[1]).toBeCloseTo(0.8, 12);
  });

  it('throws on an all-zero (degenerate) vector instead of emitting NaN', () => {
    expect(() => l2Normalize([0, 0, 0])).toThrow(/zero|non-finite/i);
  });

  it('throws on a non-finite vector (NaN/Inf component)', () => {
    expect(() => l2Normalize([1, Number.NaN, 2])).toThrow(/non-finite|zero/i);
  });
});

describe('embedVertex', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('parses values into number[], L2-normalizes, and reports dim + taskType', async () => {
    // Known raw (un-normalized) vector. norm = 5.
    const raw = [3, 0, 4, 0];
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: raw } }] },
    });

    const res = await embedVertex('hello world', 'RETRIEVAL_DOCUMENT', { outputDim: 4 });

    // (a) parsed into number[]
    expect(Array.isArray(res.embedding)).toBe(true);
    expect(res.embedding.every((x) => typeof x === 'number')).toBe(true);
    // (b) L2-normalized
    expect(norm(res.embedding)).toBeCloseTo(1.0, 12);
    // (c) dim reported correctly
    expect(res.dim).toBe(4);
    expect(res.dim).toBe(res.embedding.length);
    // (d) direction preserved (3/5, 0, 4/5, 0)
    expect(res.embedding[0]).toBeCloseTo(0.6, 12);
    expect(res.embedding[2]).toBeCloseTo(0.8, 12);
    // taskType echoed back
    expect(res.taskType).toBe('RETRIEVAL_DOCUMENT');
    // latency surfaced
    expect(typeof res.latencyMs).toBe('number');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('sends the correct wire shape (task_type, outputDimensionality, :predict)', async () => {
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: [1, 0, 0] } }] },
    });

    await embedVertex('stainless steel hex bolts', 'RETRIEVAL_QUERY', {
      outputDim: 3,
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const arg = mockRequest.mock.calls[0][0] as {
      url: string;
      method: string;
      data: { instances: Array<{ content: string; task_type: string }>; parameters: { outputDimensionality: number } };
    };
    expect(arg.method).toBe('POST');
    expect(arg.url).toContain(':predict');
    expect(arg.url).toContain('publishers/google/models/gemini-embedding-001');
    expect(arg.url).toContain('us-central1-aiplatform.googleapis.com');
    expect(arg.data.instances[0].content).toBe('stainless steel hex bolts');
    expect(arg.data.instances[0].task_type).toBe('RETRIEVAL_QUERY');
    expect(arg.data.parameters.outputDimensionality).toBe(3);
  });

  it('sends the REQUIRED taskType verbatim in the request body (RETRIEVAL_DOCUMENT)', async () => {
    const raw = new Array<number>(1536).fill(1);
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: raw } }] },
    });

    const res = await embedVertex('corpus row text', 'RETRIEVAL_DOCUMENT');

    expect(res.dim).toBe(1536);
    expect(norm(res.embedding)).toBeCloseTo(1.0, 10);

    const arg = mockRequest.mock.calls[0][0] as {
      data: { instances: Array<{ task_type: string }>; parameters: { outputDimensionality: number } };
    };
    // task_type is sent verbatim — no default substitution.
    expect(arg.data.instances[0].task_type).toBe('RETRIEVAL_DOCUMENT');
    expect(arg.data.parameters.outputDimensionality).toBe(1536);
    expect(res.taskType).toBe('RETRIEVAL_DOCUMENT');
  });

  it('throws if the returned vector length !== requested outputDim (dim guard)', async () => {
    // Ask for 1536 but the API returns 3072 (e.g. truncation param ignored).
    const raw = new Array<number>(3072).fill(1);
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: raw } }] },
    });

    await expect(
      embedVertex('mismatch', 'RETRIEVAL_DOCUMENT', { outputDim: 1536 }),
    ).rejects.toThrow(/expected dim 1536, got 3072/i);
  });

  it('throws on a zero-norm returned vector instead of poisoning with NaNs', async () => {
    const raw = new Array<number>(4).fill(0); // length matches outputDim but norm 0
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: raw } }] },
    });

    await expect(
      embedVertex('degenerate', 'RETRIEVAL_DOCUMENT', { outputDim: 4 }),
    ).rejects.toThrow(/zero|non-finite/i);
  });

  it('truncates input to truncateChars when set (opt-in)', async () => {
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: [1, 0, 0, 0] } }] },
    });

    const longText = 'x'.repeat(5000);
    await embedVertex(longText, 'RETRIEVAL_DOCUMENT', { outputDim: 4, truncateChars: 100 });

    const arg = mockRequest.mock.calls[0][0] as {
      data: { instances: Array<{ content: string }> };
    };
    expect(arg.data.instances[0].content.length).toBe(100);
  });

  it('does NOT truncate by default (non-lossy)', async () => {
    mockRequest.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: [1, 0, 0, 0] } }] },
    });

    const longText = 'y'.repeat(5000);
    await embedVertex(longText, 'RETRIEVAL_DOCUMENT', { outputDim: 4 });

    const arg = mockRequest.mock.calls[0][0] as {
      data: { instances: Array<{ content: string }> };
    };
    expect(arg.data.instances[0].content.length).toBe(5000);
  });

  it('throws a clear error on a malformed response (missing values)', async () => {
    mockRequest.mockResolvedValue({ data: { predictions: [{ embeddings: {} }] } });
    await expect(embedVertex('x', 'RETRIEVAL_QUERY')).rejects.toThrow(/malformed response/i);
  });

  it('throws a clear error when predictions is empty', async () => {
    mockRequest.mockResolvedValue({ data: { predictions: [] } });
    await expect(embedVertex('x', 'RETRIEVAL_QUERY')).rejects.toThrow(/malformed response/i);
  });

  it('rejects empty input without calling the network', async () => {
    await expect(embedVertex('', 'RETRIEVAL_QUERY')).rejects.toThrow(/non-empty string/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does NOT retry a non-retryable 4xx (400) — single call, rethrows', async () => {
    mockRequest.mockRejectedValue(httpError(400));
    await expect(embedVertex('bad request', 'RETRIEVAL_QUERY')).rejects.toThrow(/HTTP 400/);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry 401/403 (auth) — single call each', async () => {
    mockRequest.mockRejectedValue(httpError(401));
    await expect(embedVertex('unauth', 'RETRIEVAL_QUERY')).rejects.toThrow(/HTTP 401/);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    mockRequest.mockReset();
    mockRequest.mockRejectedValue(httpError(403));
    await expect(embedVertex('forbidden', 'RETRIEVAL_QUERY')).rejects.toThrow(/HTTP 403/);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('DOES retry a retryable 429 then succeeds', async () => {
    const raw = [1, 0, 0, 0];
    mockRequest
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce({ data: { predictions: [{ embeddings: { values: raw } }] } });

    const res = await embedVertex('rate limited', 'RETRIEVAL_QUERY', { outputDim: 4 });
    expect(res.dim).toBe(4);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});

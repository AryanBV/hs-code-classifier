// NOTE: classify.ts reads CLASSIFY_MAX_CONCURRENCY + V2_TIMEOUT_MS into
// module-level consts at import time, so they MUST be set BEFORE the dynamic
// import of './classify' in start(). We pin a small concurrency cap (so the gate
// is exercisable) and a long-but-finite timeout default here at module scope.
process.env.CLASSIFY_MAX_CONCURRENCY = '1';
process.env.V2_TIMEOUT_MS = '300';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/* ---------------------------------------------------------------------------
 * Mock the job-store + classifier modules so the endpoints make NO live calls.
 * --------------------------------------------------------------------------- */

const createJobMock = vi.fn();
const getJobMock = vi.fn();

vi.mock('./job-store', () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
  getJob: (...args: unknown[]) => getJobMock(...args),
}));

const legacyClassifyMock = vi.fn();
const legacyContinueMock = vi.fn();
vi.mock('../classifier', () => ({
  classify: (...args: unknown[]) => legacyClassifyMock(...args),
  continueWithAnswer: (...args: unknown[]) => legacyContinueMock(...args),
}));

const v2ClassifyMock = vi.fn();
const v2ContinueMock = vi.fn();
vi.mock('../classifier-v2', () => ({
  classify: (...args: unknown[]) => v2ClassifyMock(...args),
  continueWithAnswers: (...args: unknown[]) => v2ContinueMock(...args),
}));

// mapV2Result is only reached on the v2 INLINE path (not async); stub to a no-op DTO.
vi.mock('./v2-api-adapter', () => ({
  mapV2Result: vi.fn(async () => ({ responseType: 'refused', message: 'm', reason: null })),
}));

// Cost monitor: control the ceiling via reserveSlot + spy on recordUsage (B1b).
// reserveSlot returns true (slot admitted) by default; tests flip it to false to
// simulate the daily ceiling.
const reserveSlotMock = vi.fn(() => true);
const recordUsageMock = vi.fn();
vi.mock('./cost-monitor', () => ({
  costMonitor: {
    reserveSlot: () => reserveSlotMock(),
    recordUsage: (...args: unknown[]) => recordUsageMock(...args),
    getDailyStats: () => ({}),
  },
  recordInputFromTokenUsage: (usage: unknown, decision: string) => ({ usage, decision }),
}));

// Rate limiter: the per-route classify limiter is a pass-through in these tests
// (we exercise it separately in rateLimiter.test.ts).
vi.mock('../middleware/rateLimiter', () => ({
  classifyRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

/** Minimal v2 ClassifyResult-shaped object the route can map/record. */
function v2Result(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decision: 'CLASSIFY',
    diagnostics: { escalation_path: ['L0', 'L1', 'L4', 'L5'], latency_ms: 1, llm_calls: 2 },
    classification: { code: '7318.15.00' },
    ...over,
  };
}

/* ---------------------------------------------------------------------------
 * Tiny real HTTP harness (no supertest). Mounts the router and fetches over a
 * loopback port, so we exercise the actual express request lifecycle.
 * --------------------------------------------------------------------------- */

let app: Express;
let server: Server;
let baseUrl: string;

async function start(): Promise<void> {
  // Import AFTER mocks are registered.
  const { default: classifyRouter } = await import('./classify');
  app = express();
  app.use(express.json());
  app.use('/api/classify', classifyRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stop(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, json: await res.json() };
}

beforeEach(async () => {
  vi.clearAllMocks();
  reserveSlotMock.mockReturnValue(true);
  delete process.env.CLASSIFY_ASYNC;
  delete process.env.USE_V2_CLASSIFIER;
  delete process.env.NODE_ENV;
  await start();
});

afterEach(async () => {
  delete process.env.CLASSIFY_ASYNC;
  delete process.env.USE_V2_CLASSIFIER;
  delete process.env.NODE_ENV;
  await stop();
});

describe('POST /api/classify — async mode ON', () => {
  beforeEach(() => {
    process.env.CLASSIFY_ASYNC = 'true';
  });

  it('returns 202 {jobId,status,queuePosition} and enqueues a classify job', async () => {
    createJobMock.mockResolvedValue({ id: 'job-xyz', status: 'queued', queue_position: 2 });

    const { status, json } = await post('/api/classify', {
      query: 'stainless steel hex bolts',
      previousAnswers: { a: 'b' },
      clientToken: 'tok-1',
    });

    expect(status).toBe(202);
    expect(json).toEqual({ jobId: 'job-xyz', status: 'queued', queuePosition: 2 });
    expect(createJobMock).toHaveBeenCalledWith({
      kind: 'classify',
      query: 'stainless steel hex bolts',
      previous_answers: { a: 'b' },
      client_token: 'tok-1',
    });
    // Must NOT have invoked the classifier inline.
    expect(v2ClassifyMock).not.toHaveBeenCalled();
    expect(legacyClassifyMock).not.toHaveBeenCalled();
  });

  it('still validates query (400) before enqueueing', async () => {
    const { status } = await post('/api/classify', { query: 'ab' }); // too short
    expect(status).toBe(400);
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it('POST /answer returns 202 and enqueues an answer job', async () => {
    createJobMock.mockResolvedValue({ id: 'job-ans', status: 'queued', queue_position: 1 });

    const { status, json } = await post('/api/classify/answer', {
      originalQuery: 'orig',
      questionId: 'ask_material',
      answerId: 'steel',
      previousAnswers: { p: 'q' },
      rounds: 1,
    });

    expect(status).toBe(202);
    expect(json.jobId).toBe('job-ans');
    expect(createJobMock).toHaveBeenCalledWith({
      kind: 'answer',
      query: 'orig',
      question_id: 'ask_material',
      answer_id: 'steel',
      previous_answers: { p: 'q' },
      rounds: 1,
      client_token: null,
    });
    expect(v2ContinueMock).not.toHaveBeenCalled();
  });

  it('POST /answer returns 400 when required params are missing', async () => {
    const { status } = await post('/api/classify/answer', { originalQuery: 'orig' });
    expect(status).toBe(400);
    expect(createJobMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/classify/job/:id', () => {
  it('returns status/stage/progress/result for a known job', async () => {
    getJobMock.mockResolvedValue({
      id: 'job-1',
      status: 'done',
      stage: 'L5',
      progress: [{ stage: 'L1', event: 'triage', t_ms: 5 }],
      queue_position: 0,
      result: { responseType: 'classification', hsCode: '7318.15.00' },
      error: null,
    });

    const { status, json } = await get('/api/classify/job/job-1');
    expect(status).toBe(200);
    expect(json.jobId).toBe('job-1');
    expect(json.status).toBe('done');
    expect(json.stage).toBe('L5');
    expect(json.progress).toEqual([{ stage: 'L1', event: 'triage', t_ms: 5 }]);
    expect(json.result).toEqual({ responseType: 'classification', hsCode: '7318.15.00' });
    expect(json.error).toBeUndefined();
  });

  it('returns 404 for an unknown job', async () => {
    getJobMock.mockResolvedValue(null);
    const { status, json } = await get('/api/classify/job/nope');
    expect(status).toBe(404);
    expect(json.error).toBe('Job not found');
  });
});

describe('async flag OFF — existing sync behavior unchanged', () => {
  it('runs the LEGACY classifier inline and does NOT enqueue', async () => {
    // CLASSIFY_ASYNC unset, USE_V2 unset → legacy path.
    legacyClassifyMock.mockResolvedValue({ responseType: 'classification', hsCode: '0101.21.00' });

    const { status, json } = await post('/api/classify', { query: 'live horses' });

    expect(status).toBe(200);
    expect(legacyClassifyMock).toHaveBeenCalledWith('live horses', { previousAnswers: undefined });
    expect(json.hsCode).toBe('0101.21.00');
    expect(json.processingTimeMs).toBeTypeOf('number');
    // No job enqueued.
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it('legacy /answer path unchanged when async OFF', async () => {
    legacyContinueMock.mockResolvedValue({ responseType: 'classification', hsCode: '0101.21.00' });

    const { status, json } = await post('/api/classify/answer', {
      originalQuery: 'orig',
      answerId: 'a1',
      answerLabel: 'Label',
    });

    expect(status).toBe(200);
    expect(legacyContinueMock).toHaveBeenCalledWith('orig', 'a1', 'Label');
    expect(json.hsCode).toBe('0101.21.00');
    expect(createJobMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B0 error-contract + B1b cost guardrail on the v2 inline path.
// ---------------------------------------------------------------------------

describe('v2 inline path — B0 error contract (503 vs scrubbed 500)', () => {
  beforeEach(() => {
    process.env.USE_V2_CLASSIFIER = 'true';
  });

  it('maps a system_error result to a 503 retryable (NOT 500)', async () => {
    v2ClassifyMock.mockResolvedValue(
      v2Result({
        decision: 'REFUSE',
        system_error: { stage: 'L1', message: '[gemini-developer-client] After 6 retry attempts: 503', retryable: true },
      }),
    );

    const { status, json } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(503);
    expect(json.error).toBe('Classification temporarily unavailable');
    expect(json.retryable).toBe(true);
  });

  it('PROD: an unexpected throw returns a SCRUBBED 500 (no raw provider text leaked)', async () => {
    process.env.NODE_ENV = 'production';
    const secret = 'connect ECONNREFUSED https://secret-host.internal:443 key=sk-LEAK';
    v2ClassifyMock.mockRejectedValue(new Error(secret));

    const { status, json } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(500);
    expect(json.error).toBe('Classification failed');
    expect(json.message).toBe('An unexpected error occurred');
    // The raw provider text must NOT leak in production.
    expect(JSON.stringify(json)).not.toContain('secret-host');
    expect(JSON.stringify(json)).not.toContain('sk-LEAK');
  });

  it('DEV: an unexpected throw surfaces the message (debug aid)', async () => {
    process.env.NODE_ENV = 'development';
    v2ClassifyMock.mockRejectedValue(new Error('dev detail here'));

    const { status, json } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(500);
    expect(json.message).toBe('dev detail here');
  });
});

describe('v2 inline path — B1b cost observability + daily ceiling', () => {
  beforeEach(() => {
    process.env.USE_V2_CLASSIFIER = 'true';
  });

  it('records the classification into the cost monitor on a successful CLASSIFY', async () => {
    v2ClassifyMock.mockResolvedValue(v2Result());

    const { status } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(200);
    // Slot reserved exactly once at entry; usage recorded exactly once on completion.
    expect(reserveSlotMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock.mock.calls[0]![0]).toMatchObject({ decision: 'CLASSIFY' });
  });

  it('records even a system_error outcome (cost truth on a 503)', async () => {
    v2ClassifyMock.mockResolvedValue(
      v2Result({ decision: 'REFUSE', system_error: { stage: 'L1', message: 'x', retryable: true } }),
    );

    const { status } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(503);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock.mock.calls[0]![0]).toMatchObject({ decision: 'system_error' });
  });

  it('enforces the hard daily ceiling: 503 (retryable:false) BEFORE classifying when reserveSlot denies', async () => {
    reserveSlotMock.mockReturnValue(false);

    const { status, json } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(503);
    expect(json.error).toBe("We've hit today's free classification limit. Please try again tomorrow.");
    expect(json.retryable).toBe(false);
    // The classifier must NOT have run (the ceiling gates BEFORE any LLM call).
    expect(v2ClassifyMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('ceiling also gates the /answer continuation path', async () => {
    reserveSlotMock.mockReturnValue(false);

    const { status, json } = await post('/api/classify/answer', {
      originalQuery: 'orig',
      questionId: 'ask_material',
      answerId: 'steel',
    });

    expect(status).toBe(503);
    expect(json.error).toBe("We've hit today's free classification limit. Please try again tomorrow.");
    expect(v2ContinueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Query length cap (item 3).
// ---------------------------------------------------------------------------

describe('query length cap', () => {
  it('POST / rejects a query over 1000 chars with 400 (retryable:false)', async () => {
    const { status, json } = await post('/api/classify', { query: 'x'.repeat(1001) });
    expect(status).toBe(400);
    expect(json.error).toBe(
      'Product description is too long — please shorten it to under 1000 characters.',
    );
    expect(json.retryable).toBe(false);
    expect(legacyClassifyMock).not.toHaveBeenCalled();
    expect(v2ClassifyMock).not.toHaveBeenCalled();
  });

  it('POST / accepts a query at exactly 1000 chars', async () => {
    legacyClassifyMock.mockResolvedValue({ responseType: 'classification', hsCode: '0101.21.00' });
    const { status } = await post('/api/classify', { query: 'x'.repeat(1000) });
    expect(status).toBe(200);
  });

  it('POST /answer rejects an originalQuery over 1000 chars with 400', async () => {
    const { status, json } = await post('/api/classify/answer', {
      originalQuery: 'x'.repeat(1001),
      answerId: 'a1',
      answerLabel: 'Label',
    });
    expect(status).toBe(400);
    expect(json.error).toBe(
      'Product description is too long — please shorten it to under 1000 characters.',
    );
    expect(legacyContinueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Internal shared-secret gate (item 2). The middleware is NOT mocked, so it runs
// for real; only INTERNAL_API_TOKEN controls it.
// ---------------------------------------------------------------------------

describe('internal shared-secret gate', () => {
  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  it('fails OPEN when INTERNAL_API_TOKEN is unset (no header required)', async () => {
    legacyClassifyMock.mockResolvedValue({ responseType: 'classification', hsCode: '0101.21.00' });
    const { status } = await post('/api/classify', { query: 'live horses' });
    expect(status).toBe(200);
  });

  it('returns 403 when the token is set but the header is missing/wrong', async () => {
    process.env.INTERNAL_API_TOKEN = 'sekret';
    const { status, json } = await post('/api/classify', { query: 'live horses' });
    expect(status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(json.retryable).toBe(false);
    expect(legacyClassifyMock).not.toHaveBeenCalled();
  });

  it('allows the request when the correct token header is presented', async () => {
    process.env.INTERNAL_API_TOKEN = 'sekret';
    legacyClassifyMock.mockResolvedValue({ responseType: 'classification', hsCode: '0101.21.00' });
    const res = await fetch(`${baseUrl}/api/classify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': 'sekret' },
      body: JSON.stringify({ query: 'live horses' }),
    });
    expect(res.status).toBe(200);
  });

  it('gates the /answer route too (403 with a set token + no header)', async () => {
    process.env.INTERNAL_API_TOKEN = 'sekret';
    const { status } = await post('/api/classify/answer', {
      originalQuery: 'orig',
      answerId: 'a1',
      answerLabel: 'Label',
    });
    expect(status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Concurrency gate + honest timeout body (items 1 + 6) on the v2 inline path.
// ---------------------------------------------------------------------------

describe('v2 inline path — concurrency gate + timeout body', () => {
  // CLASSIFY_MAX_CONCURRENCY=1 + V2_TIMEOUT_MS=300 are pinned at module scope
  // (top of file) because classify.ts reads them into consts at import time.
  beforeEach(() => {
    process.env.USE_V2_CLASSIFIER = 'true';
  });

  it('returns a 503 busy body when the in-flight cap is reached', async () => {
    // First request blocks until we release it; second should hit the gate.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    v2ClassifyMock.mockImplementation(async () => {
      await gate;
      return v2Result();
    });

    const first = post('/api/classify', { query: 'first request here' });
    // Give the first request a tick to enter the pipeline (inFlight++).
    await new Promise((r) => setTimeout(r, 30));

    const second = await post('/api/classify', { query: 'second request here' });
    expect(second.status).toBe(503);
    expect(second.json.error).toBe(
      'The classifier is busy right now. Please try again in a moment.',
    );
    expect(second.json.retryable).toBe(true);

    // Release the first BEFORE the 300ms timeout would fire.
    release();
    const firstResolved = await first;
    expect(firstResolved.status).toBe(200);
  });

  it('the in-flight slot is released after completion (next request succeeds)', async () => {
    v2ClassifyMock.mockResolvedValue(v2Result());
    const a = await post('/api/classify', { query: 'sequential one' });
    const b = await post('/api/classify', { query: 'sequential two' });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('a server-side timeout returns the honest timeout 503 body', async () => {
    // V2_TIMEOUT_MS=300 (module scope) → a never-resolving pipeline times out.
    v2ClassifyMock.mockImplementation(
      () => new Promise(() => {/* never resolves → timeout fires */}),
    );

    const { status, json } = await post('/api/classify', { query: 'will time out here' });
    expect(status).toBe(503);
    expect(json.error).toBe('Classification timed out — it is taking longer than expected.');
    expect(json.retryable).toBe(true);
  });
});

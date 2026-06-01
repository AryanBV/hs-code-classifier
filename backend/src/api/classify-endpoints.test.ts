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

// Cost monitor: control the ceiling + spy on recordClassification (B1b).
const isOverDailyLimitMock = vi.fn(() => false);
const recordClassificationMock = vi.fn();
vi.mock('./cost-monitor', () => ({
  costMonitor: {
    isOverDailyLimit: () => isOverDailyLimitMock(),
    recordClassification: (...args: unknown[]) => recordClassificationMock(...args),
    getDailyStats: () => ({}),
  },
  recordInputFromTokenUsage: (usage: unknown, decision: string) => ({ usage, decision }),
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
  isOverDailyLimitMock.mockReturnValue(false);
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
    expect(recordClassificationMock).toHaveBeenCalledTimes(1);
    expect(recordClassificationMock.mock.calls[0]![0]).toMatchObject({ decision: 'CLASSIFY' });
  });

  it('records even a system_error outcome (cost truth on a 503)', async () => {
    v2ClassifyMock.mockResolvedValue(
      v2Result({ decision: 'REFUSE', system_error: { stage: 'L1', message: 'x', retryable: true } }),
    );

    const { status } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(503);
    expect(recordClassificationMock).toHaveBeenCalledTimes(1);
    expect(recordClassificationMock.mock.calls[0]![0]).toMatchObject({ decision: 'system_error' });
  });

  it('enforces the hard daily ceiling: 503 {Daily limit reached, retryable:false} BEFORE classifying', async () => {
    isOverDailyLimitMock.mockReturnValue(true);

    const { status, json } = await post('/api/classify', { query: 'stainless steel hex bolts' });

    expect(status).toBe(503);
    expect(json.error).toBe('Daily limit reached');
    expect(json.retryable).toBe(false);
    // The classifier must NOT have run (the ceiling gates BEFORE any LLM call).
    expect(v2ClassifyMock).not.toHaveBeenCalled();
    expect(recordClassificationMock).not.toHaveBeenCalled();
  });

  it('ceiling also gates the /answer continuation path', async () => {
    isOverDailyLimitMock.mockReturnValue(true);

    const { status, json } = await post('/api/classify/answer', {
      originalQuery: 'orig',
      questionId: 'ask_material',
      answerId: 'steel',
    });

    expect(status).toBe(503);
    expect(json.error).toBe('Daily limit reached');
    expect(v2ContinueMock).not.toHaveBeenCalled();
  });
});

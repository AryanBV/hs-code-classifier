import { describe, it, expect, vi } from 'vitest';
import { ClassifierWorker } from './classifier-worker';
import type { WorkerDeps } from './classifier-worker';
import type { JobRow } from './job-store';
import type { ClassifyResult } from '../classifier-v2/types';
import type { ApiClassifyResponse } from './v2-api-adapter';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function makeJob(over: Partial<JobRow> = {}): JobRow {
  return {
    id:               'job-1',
    status:           'running',
    kind:             'classify',
    query:            'stainless steel hex bolts M10',
    previous_answers: {},
    rounds:           0,
    question_id:      null,
    answer_id:        null,
    stage:            null,
    progress:         [],
    queue_position:   null,
    result:           null,
    error:            null,
    attempts:         1,
    client_token:     null,
    created_at:       '2026-06-01T00:00:00.000Z',
    started_at:       '2026-06-01T00:00:01.000Z',
    finished_at:      null,
    expires_at:       '2026-06-02T00:00:00.000Z',
    ...over,
  };
}

const classifyOk: ClassifyResult = {
  decision: 'CLASSIFY',
  classification: {
    code: '7318.15.00',
    is_six_digit: false,
    export_policy: 'Free',
    policy_condition: null,
    india_specific: false,
    citation: {
      primary: {
        type: 'leaf_description',
        source_ref: 'tariff_lines:code=7318.15.00',
        verbatim_text: 'Other screws and bolts',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-1',
    },
    reasoning_chain: ['steel bolt → 7318'],
    self_confidence: 'HIGH',
    alternatives_considered: [],
    components: null,
    escalated_to_deep_think: false,
  },
  diagnostics: { escalation_path: [], latency_ms: 1, llm_calls: 1 },
} as ClassifyResult;

const systemErrorResult: ClassifyResult = {
  decision: 'REFUSE',
  refusal: { reason: 'System error', out_of_scope_class: null, verifier_failures: [] },
  system_error: { stage: 'L4', message: 'Vertex 5xx persistent', retryable: true },
  diagnostics: { escalation_path: [], latency_ms: 1, llm_calls: 1 },
} as ClassifyResult;

const mappedDto: ApiClassifyResponse = {
  responseType: 'classification',
  hsCode: '7318.15.00',
  description: 'Other screws and bolts of iron or steel',
  confidence: 90,
  reasoning: 'steel bolt → 7318',
  alternatives: [],
  isSixDigit: false,
  exportPolicy: 'Free',
  policyCondition: null,
  indiaSpecific: false,
  selfConfidence: 'HIGH',
  citation: classifyOk.classification!.citation,
  components: null,
};

/** Build mock deps. `queue` is drained one job per claim (FIFO); null when empty. */
function makeDeps(over: Partial<WorkerDeps> & { queue?: JobRow[] } = {}): {
  deps: WorkerDeps;
  completeJob: ReturnType<typeof vi.fn>;
  failJob: ReturnType<typeof vi.fn>;
  classify: ReturnType<typeof vi.fn>;
  continueAnswers: ReturnType<typeof vi.fn>;
  mapResult: ReturnType<typeof vi.fn>;
} {
  const queue = over.queue ?? [];
  const completeJob = vi.fn(async () => {});
  const failJob = vi.fn(async () => {});
  const claimNextQueued = vi.fn(async () => queue.shift() ?? null);
  const classify = over.classify
    ? (over.classify as ReturnType<typeof vi.fn>)
    : vi.fn(async () => classifyOk);
  const continueAnswers = over.continueAnswers
    ? (over.continueAnswers as ReturnType<typeof vi.fn>)
    : vi.fn(async () => classifyOk);
  const mapResult = over.mapResult
    ? (over.mapResult as ReturnType<typeof vi.fn>)
    : vi.fn(async () => mappedDto);

  const deps: WorkerDeps = {
    classify: classify as unknown as WorkerDeps['classify'],
    continueAnswers: continueAnswers as unknown as WorkerDeps['continueAnswers'],
    store: { claimNextQueued, completeJob, failJob },
    mapResult: mapResult as unknown as WorkerDeps['mapResult'],
    onError: () => {},
  };
  return { deps, completeJob, failJob, classify, continueAnswers, mapResult };
}

/**
 * Drive the worker deterministically: await an explicit tick (so claiming has
 * happened) then spin until in-flight jobs settle (process() is fired without
 * await inside tick). Tolerates the start()-kick already being in progress.
 */
async function drain(worker: ClassifierWorker): Promise<void> {
  await worker.tick();
  for (let i = 0; i < 200 && worker.activeJobs > 0; i++) {
    await new Promise((r) => setImmediate(r));
  }
  // One more flush so the trailing .finally()/await in process() resolves.
  await new Promise((r) => setImmediate(r));
}

describe('ClassifierWorker — happy path', () => {
  it('claims a queued classify job → classifyV2 → completeJob(mapV2Result)', async () => {
    const { deps, completeJob, classify, mapResult } = makeDeps({
      queue: [makeJob({ kind: 'classify', query: 'hex bolts', previous_answers: { a: 'b' } })],
    });
    const worker = new ClassifierWorker(deps);

    // start() does an immediate kick-tick; the huge interval prevents extra ticks.
    worker.start(100000);
    await drain(worker);
    worker.stop();

    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledWith('hex bolts', { previousAnswers: { a: 'b' } });
    expect(mapResult).toHaveBeenCalledWith(classifyOk);
    expect(completeJob).toHaveBeenCalledWith('job-1', mappedDto);
  });

  it('an answer job calls continueWithAnswersV2 with {[question_id]:answer_id} + rounds', async () => {
    const { deps, continueAnswers, completeJob } = makeDeps({
      queue: [
        makeJob({
          kind: 'answer',
          query: 'orig query',
          question_id: 'ask_material',
          answer_id: 'steel',
          previous_answers: { prior: 'x' },
          rounds: 1,
        }),
      ],
    });
    const worker = new ClassifierWorker(deps);
    worker.start(100000);
    await drain(worker);
    worker.stop();

    expect(continueAnswers).toHaveBeenCalledTimes(1);
    expect(continueAnswers).toHaveBeenCalledWith(
      'orig query',
      { ask_material: 'steel' },
      { previousAnswers: { prior: 'x' }, rounds: 1 },
    );
    expect(completeJob).toHaveBeenCalledTimes(1);
  });
});

describe('ClassifierWorker — error mapping', () => {
  it('result.system_error → failJob({retryable:true}), never completeJob', async () => {
    const classify = vi.fn(async () => systemErrorResult);
    const { deps, completeJob, failJob } = makeDeps({ queue: [makeJob()], classify });
    const worker = new ClassifierWorker(deps);
    worker.start(100000);
    await drain(worker);
    worker.stop();

    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith('job-1', {
      message: 'Vertex 5xx persistent',
      retryable: true,
    });
  });

  it('an unexpected throw → failJob({retryable:false})', async () => {
    const classify = vi.fn(async () => {
      throw new Error('kaboom');
    });
    const { deps, completeJob, failJob } = makeDeps({ queue: [makeJob()], classify });
    const worker = new ClassifierWorker(deps);
    worker.start(100000);
    await drain(worker);
    worker.stop();

    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith('job-1', { message: 'kaboom', retryable: false });
  });
});

describe('ClassifierWorker — single-flight + lifecycle', () => {
  it('processes at most one job at a time (no overlapping ticks)', async () => {
    let active = 0;
    let maxActive = 0;
    const classify = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return classifyOk;
    });
    const { deps } = makeDeps({
      queue: [makeJob({ id: 'a' }), makeJob({ id: 'b' }), makeJob({ id: 'c' })],
      classify,
    });
    const worker = new ClassifierWorker(deps);
    worker.start(5); // fast polling to try to overlap
    // Let several ticks fire while jobs are in flight.
    await new Promise((r) => setTimeout(r, 120));
    worker.stop();
    await drain(worker);

    expect(maxActive).toBe(1); // single-flight held across ticks
  });

  it('start() is idempotent and stop() is clean (no claims after stop)', async () => {
    const { deps } = makeDeps({ queue: [] });
    const claimSpy = deps.store.claimNextQueued as ReturnType<typeof vi.fn>;
    const worker = new ClassifierWorker(deps);

    worker.start(100000);
    worker.start(100000); // second call is a no-op
    expect(worker.isRunning).toBe(true);
    await drain(worker);

    worker.stop();
    worker.stop(); // idempotent
    expect(worker.isRunning).toBe(false);

    const callsAfterStop = claimSpy.mock.calls.length;
    // A manual tick after stop must claim nothing.
    await worker.tick();
    expect(claimSpy.mock.calls.length).toBe(callsAfterStop);
  });

  it('tick() does nothing when the queue is empty', async () => {
    const { deps, completeJob, failJob } = makeDeps({ queue: [] });
    const worker = new ClassifierWorker(deps);
    worker.start(100000);
    await drain(worker);
    worker.stop();
    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
  });
});

// backend/src/api/classifier-worker.ts
//
// Phase B single-worker drain loop. The public API only ENQUEUES jobs; this
// worker is the SOLE consumer of the queue. On each tick it claims the oldest
// queued job and runs it through the v2 pipeline, then stores the flat DTO
// (done) or a structured error (failed).
//
// Rate-limiting: the worker adds NO limiter of its own. The proactive Gemini
// token-bucket limiter at the generateContent facade already paces every LLM
// call to the 5-RPM free-tier budget, so a single in-flight job is inherently
// safe. The worker is therefore SINGLE-FLIGHT by default (WORKER_CONCURRENCY=1)
// — at most one job runs at a time and ticks never overlap.
//
// Testability: classifyV2 / continueWithAnswersV2 / the job-store fns / the DTO
// mapper are all injectable via the constructor `deps`, so the loop is unit-
// tested with mocks and makes ZERO live API/DB calls. The default deps wire the
// real implementations.

import {
  classify as classifyV2,
  continueWithAnswers as continueWithAnswersV2,
} from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import { mapV2Result } from './v2-api-adapter';
import type { ApiClassifyResponse } from './v2-api-adapter';
import {
  claimNextQueued as defaultClaimNextQueued,
  completeJob as defaultCompleteJob,
  failJob as defaultFailJob,
} from './job-store';
import type { JobRow } from './job-store';

/* ---------------------------------------------------------------------------
 * Injectable dependency seam (defaults = the real implementations)
 * --------------------------------------------------------------------------- */

/** v2 classify() shape the worker depends on. */
export type ClassifyFn = (
  query: string,
  opts: { previousAnswers?: Record<string, string> },
) => Promise<ClassifyResult>;

/** v2 continueWithAnswers() shape the worker depends on. */
export type ContinueFn = (
  originalQuery: string,
  batchAnswers: Record<string, string>,
  opts: { previousAnswers?: Record<string, string>; rounds?: number },
) => Promise<ClassifyResult>;

/** Job-store surface the worker depends on. */
export interface WorkerJobStore {
  claimNextQueued(): Promise<JobRow | null>;
  completeJob(id: string, result: ApiClassifyResponse): Promise<void>;
  failJob(id: string, error: { message: string; retryable: boolean }): Promise<void>;
}

/** DTO mapper shape (mirrors v2-api-adapter.mapV2Result). */
export type MapResultFn = (result: ClassifyResult) => Promise<ApiClassifyResponse>;

export interface WorkerDeps {
  classify:        ClassifyFn;
  continueAnswers: ContinueFn;
  store:           WorkerJobStore;
  mapResult:       MapResultFn;
  /** Optional log sink (defaults to console.error). */
  onError?:        (message: string, err: unknown) => void;
}

function defaultDeps(): WorkerDeps {
  return {
    classify:        (query, opts) => classifyV2(query, opts),
    continueAnswers: (q, answers, opts) => continueWithAnswersV2(q, answers, opts),
    store: {
      claimNextQueued: defaultClaimNextQueued,
      completeJob:     defaultCompleteJob,
      failJob:         defaultFailJob,
    },
    mapResult:        (result) => mapV2Result(result),
    onError:          (message, err) => console.error(`[worker] ${message}`, err),
  };
}

/** Resolve the per-process worker concurrency (env-overridable; default 1). */
function workerConcurrency(): number {
  const raw = process.env.WORKER_CONCURRENCY;
  if (raw === undefined) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/* ---------------------------------------------------------------------------
 * ClassifierWorker
 * --------------------------------------------------------------------------- */

export class ClassifierWorker {
  private readonly deps:        WorkerDeps;
  private readonly concurrency: number;

  /** Number of jobs currently being processed (single-flight ⇒ 0 or 1 by default). */
  private inFlight = 0;
  /** True between start() and stop(); gates new ticks. */
  private running = false;
  /** Poll timer handle; cleared on stop. */
  private timer: NodeJS.Timeout | null = null;
  /** Guard so a long-running drain can't be re-entered by an overlapping tick. */
  private ticking = false;

  constructor(deps: Partial<WorkerDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
    this.concurrency = workerConcurrency();
  }

  /** True while the worker is running (between start and stop). For tests/observability. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Jobs currently in flight. For tests/observability. */
  get activeJobs(): number {
    return this.inFlight;
  }

  /**
   * Start the drain loop. Idempotent — a second call while running is a no-op.
   * `pollIntervalMs` is how often an idle worker re-checks the queue.
   */
  start(pollIntervalMs = 1000): void {
    if (this.running) return;
    this.running = true;
    // Kick one tick immediately so a queued job isn't delayed a full interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), pollIntervalMs);
    // Don't keep the event loop alive solely for the poll timer.
    this.timer.unref?.();
  }

  /**
   * Stop the drain loop. Idempotent. Clears the poll timer and flips `running`
   * off so no NEW jobs are claimed. A job already in flight is allowed to finish
   * (its DB write completes); only claiming is gated.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One drain tick. Claims as many jobs as the remaining concurrency budget
   * allows (default 1) and processes each. Non-overlapping: a tick that fires
   * while a previous tick is still claiming returns immediately (`ticking`
   * guard); in-flight jobs are tracked by `inFlight` so single-flight holds even
   * across timer ticks.
   */
  async tick(): Promise<void> {
    if (!this.running) return;
    if (this.ticking) return;
    this.ticking = true;
    try {
      // Claim up to the free concurrency budget. With concurrency=1 this claims
      // at most one job and only when none is in flight.
      while (this.running && this.inFlight < this.concurrency) {
        const job = await this.deps.store.claimNextQueued();
        if (job === null) break; // queue empty
        // Track in-flight synchronously BEFORE awaiting so a re-entrant tick sees it.
        this.inFlight += 1;
        // Process WITHOUT awaiting here so concurrency>1 can claim the next job;
        // each job decrements inFlight on completion.
        void this.process(job).finally(() => {
          this.inFlight -= 1;
        });
        // For single-flight (concurrency=1) the while-guard now blocks further
        // claims until the in-flight job settles.
      }
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Run a single claimed job end-to-end and persist the outcome:
   *   - kind='classify' → classifyV2(query, {previousAnswers})
   *   - kind='answer'   → continueWithAnswersV2(query, {[question_id]:answer_id},
   *                                             {previousAnswers, rounds})
   * Mapping:
   *   - result.system_error  → failJob({message, retryable:true})  (transient infra)
   *   - otherwise            → completeJob(mapV2Result(result))    (CLASSIFY/ASK/REFUSE)
   *   - unexpected throw     → failJob({message, retryable:false}) (bug/programming error)
   */
  private async process(job: JobRow): Promise<void> {
    try {
      let result: ClassifyResult;
      if (job.kind === 'answer') {
        const batchAnswers =
          job.question_id !== null && job.answer_id !== null
            ? { [job.question_id]: job.answer_id }
            : {};
        result = await this.deps.continueAnswers(job.query, batchAnswers, {
          previousAnswers: job.previous_answers,
          rounds:          job.rounds,
        });
      } else {
        result = await this.deps.classify(job.query, {
          previousAnswers: job.previous_answers,
        });
      }

      // Persistent infra/transport failure (ARCHITECTURE §7) → failed/retryable.
      if (result.system_error !== undefined) {
        await this.deps.store.failJob(job.id, {
          message:   result.system_error.message,
          retryable: true,
        });
        return;
      }

      // CLASSIFY / ASK / REFUSE → map to the flat DTO and mark done.
      const dto = await this.deps.mapResult(result);
      await this.deps.store.completeJob(job.id, dto);
    } catch (err) {
      // Unexpected throw (bug, mapper failure, DB hiccup mid-run) → non-retryable.
      const message = err instanceof Error ? err.message : String(err);
      this.deps.onError?.(`job ${job.id} failed`, err);
      try {
        await this.deps.store.failJob(job.id, { message, retryable: false });
      } catch (failErr) {
        // If even failJob throws, there is nothing more to do but log — never
        // let the rejection escape and crash the poll loop.
        this.deps.onError?.(`job ${job.id} failJob also threw`, failErr);
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * Process-wide singleton (started from index.ts, stopped on shutdown)
 * --------------------------------------------------------------------------- */

let _worker: ClassifierWorker | null = null;

/** Get-or-create the process worker singleton. */
export function getWorker(): ClassifierWorker {
  if (_worker === null) _worker = new ClassifierWorker();
  return _worker;
}

/** Start the singleton worker (idempotent). */
export function startWorker(pollIntervalMs?: number): ClassifierWorker {
  const w = getWorker();
  w.start(pollIntervalMs);
  return w;
}

/** Stop the singleton worker if it exists (idempotent). */
export function stopWorker(): void {
  if (_worker !== null) _worker.stop();
}

/** Test-only: reset the singleton so each test gets a fresh worker. */
export function _resetWorkerForTesting(): void {
  if (_worker !== null) _worker.stop();
  _worker = null;
}

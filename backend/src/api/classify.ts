// backend/src/api/classify.ts

import { Router, Request, Response, NextFunction } from 'express';
import { classify, continueWithAnswer } from '../classifier';
import {
  classify as classifyV2,
  continueWithAnswers as continueWithAnswersV2,
} from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import { mapV2Result } from './v2-api-adapter';
import { createJob, getJob } from './job-store';
import { costMonitor, recordInputFromTokenUsage } from './cost-monitor';
import { recordUsageEvent } from '../classifier-v2/lib/supabase-client';
import { classifyRateLimiter } from '../middleware/rateLimiter';
import { randomUUID, timingSafeEqual } from 'crypto';

const router = Router();

/* ---------------------------------------------------------------------------
 * Input bounds
 * --------------------------------------------------------------------------- */

/** Max accepted product-description length (after trim). Cross-package contract. */
const MAX_QUERY_LENGTH = 1000;

/* ---------------------------------------------------------------------------
 * Concurrency gate (highest-value availability fix)
 *
 * The v2 pipeline is slow (p95 ~40-80s) and the free-tier LLM is RPM-bounded, so
 * a burst of concurrent classifications would queue at the provider and blow the
 * timeout for everyone. We cap the number of v2 pipelines running AT ONCE in this
 * (single) process. Over the cap → an immediate, honest 503 instead of a slow
 * failure. This is in-memory and single-replica (same invariant as the cost
 * monitor + rate limiter). It does NOT reserve a daily slot (that is separate).
 * --------------------------------------------------------------------------- */

/** Max v2 pipelines running concurrently in this process. */
const CLASSIFY_MAX_CONCURRENCY = Number(process.env.CLASSIFY_MAX_CONCURRENCY ?? 2);

/** Live count of v2 pipelines in flight (incremented under the gate, always decremented). */
let inFlight = 0;

/** 503 body for the concurrency gate (busy now, retry shortly). */
function v2Busy(res: Response): Response {
  return res.status(503).json({
    error: 'The classifier is busy right now. Please try again in a moment.',
    retryable: true,
  });
}

/* ---------------------------------------------------------------------------
 * Internal shared-secret gate
 *
 * The public classify endpoints are intended to be reached ONLY via the frontend
 * BFF, which forwards an `x-internal-token` header. When INTERNAL_API_TOKEN is
 * set we require an exact (constant-time) match, else 403.
 *
 * When it is UNSET, behavior is environment-dependent (fail-CLOSED in prod):
 *   - production: respond 503 'Service not configured' and RETURN. A production
 *     deploy missing the secret is a MISCONFIGURATION, never an open door.
 *   - dev/test:   log a warning and call next() (fail-open for local convenience).
 *
 * Applied to POST '/' and POST '/answer' only (NOT health / job poll).
 * --------------------------------------------------------------------------- */

/** Constant-time string compare that also returns false on a length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Once-guards so the unconfigured-gate notice is logged once, not per request. */
let loggedUnconfiguredProd = false;
let loggedUnconfiguredDev = false;

/** Express middleware: enforce the internal token; fail-CLOSED in production. */
function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (expected === undefined || expected === '') {
    if (process.env.NODE_ENV === 'production') {
      // Fail-CLOSED: a production deploy missing the secret is a misconfiguration.
      if (!loggedUnconfiguredProd) {
        loggedUnconfiguredProd = true;
        console.error(
          '[API] INTERNAL_API_TOKEN is not configured in production — refusing classify requests (fail-closed).',
        );
      }
      res.status(503).json({ error: 'Service not configured', retryable: false });
      return;
    }
    // dev/test: fail-open for local convenience.
    if (!loggedUnconfiguredDev) {
      loggedUnconfiguredDev = true;
      console.warn(
        '[API] INTERNAL_API_TOKEN is not set — internal-token gate disabled (dev/test only).',
      );
    }
    next();
    return;
  }
  const provided = req.header('x-internal-token');
  if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
    res.status(403).json({ error: 'Forbidden', retryable: false });
    return;
  }
  next();
}

/** Short per-request id for correlating the structured cost log line. */
function newReqId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Emit ONE structured JSON cost-log line per v2 classification AND record it into
 * the in-process daily cost monitor (B1b). The TRUTH for RPM/cost is
 * `diagnostics.token_usage` (the meter) — `diagnostics.llm_calls` excludes the
 * reranker + internal retries, so we read llmCalls/totalTokens/byModel from
 * token_usage. Repair iterations come from the escalation diagnostics when
 * present. This is the observability that was missing during the May overspend.
 */
function recordV2Cost(reqId: string, result: ClassifyResult, processingTimeMs: number): void {
  const usage = result.diagnostics.token_usage;
  const decision = result.system_error !== undefined ? 'system_error' : result.decision;
  // Record TOKEN usage only (the request was already counted at entry via
  // reserveSlot, so this must NOT increment the daily request counter again).
  costMonitor.recordUsage(recordInputFromTokenUsage(usage, decision));
  // DURABLE persistence (survives redeploys). Fire-and-forget: the HTTP response
  // must NOT wait on the DB write, and a DB error must NEVER break or delay the
  // classification. recordUsageEvent swallows its own errors; the extra .catch is
  // belt-and-suspenders so an unexpected synchronous reject can never bubble.
  void recordUsageEvent({
    decision,
    llmCalls:    usage?.llmCalls ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    byModel:     usage?.byModel ?? {},
    reqId,
  }).catch(() => { /* already logged inside recordUsageEvent; never throw */ });
  // repairIterations is derived from the escalation_path: each repair attempt
  // records an `L5:repair*` entry (ESCALATION_REPAIR_PREFIX). No dedicated
  // diagnostics field exists, so we count the markers (0 when none).
  const repairIterations = result.diagnostics.escalation_path.filter((e) =>
    e.startsWith('L5:repair'),
  ).length;
  const logLine = {
    type:             'classification_cost',
    reqId,
    decision,
    llmCalls:         usage?.llmCalls ?? 0,
    totalTokens:      usage?.totalTokens ?? 0,
    byModel:          usage?.byModel ?? {},
    repairIterations,
    processingTimeMs,
  };
  console.log(JSON.stringify(logLine));
}

/** 503 body for the hard daily-classification ceiling (B1b runaway-loop stop). */
function dailyLimitReached(res: Response): Response {
  return res.status(503).json({
    error: "We've hit today's free classification limit. Please try again tomorrow.",
    retryable: false,
  });
}

/**
 * Async (job-queue) mode. When `CLASSIFY_ASYNC === 'true'`, POST /api/classify
 * and /api/classify/answer ENQUEUE a job (202 + jobId) instead of running the
 * pipeline inline, and the single rate-limited worker drains it. Clients poll
 * GET /api/classify/job/:id. DEFAULT OFF → the existing sync behavior (legacy or
 * v2-inline per useV2()) is byte-for-byte unchanged until we cut over.
 */
function asyncMode(): boolean {
  return process.env.CLASSIFY_ASYNC === 'true';
}

/* ---------------------------------------------------------------------------
 * v2 rewire — feature-flagged OFF by default (zero production change).
 *
 * When `USE_V2_CLASSIFIER === 'true'`, the routes call the Phase-4 v2 pipeline
 * and map its rich `ClassifyResult` onto the FLAT external DTO via mapV2Result.
 * When the flag is unset/anything-else, the routes run the EXISTING legacy code
 * path UNCHANGED — byte-for-byte identical behavior, fully reversible.
 * --------------------------------------------------------------------------- */

/** True only when the v2 pipeline is explicitly enabled for this process. */
function useV2(): boolean {
  return process.env.USE_V2_CLASSIFIER === 'true';
}

/**
 * Server-side timeout for the v2 path ONLY. v2 p95 is ~60s and there is no
 * internal Vertex deadline, so a runaway pipeline could hang the request
 * indefinitely. We race classify() against an ~80s timeout (mirrors the per-case
 * race in src/eval/runner.ts). A timeout rejects with V2_TIMEOUT_ERROR, which
 * the route maps to a 503 retryable response — identical to the system_error
 * path so the frontend treats both transient failures the same way.
 */
const V2_TIMEOUT_MS = Number(process.env.V2_TIMEOUT_MS ?? 80_000);
const V2_TIMEOUT_ERROR = Symbol('v2-timeout');

/**
 * Run a v2 pipeline call under the server-side timeout race. Resolves with the
 * ClassifyResult, or rejects with V2_TIMEOUT_ERROR if the deadline elapses
 * first. The timer is always cleared so a settled race never leaves a live
 * timer keeping the event loop alive (and `.unref()` lets the process exit even
 * if one slips through).
 */
function withV2Timeout(work: Promise<ClassifyResult>): Promise<ClassifyResult> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(V2_TIMEOUT_ERROR), V2_TIMEOUT_MS);
    timeoutHandle.unref?.();
  });
  return Promise.race([work, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

/** Standard 503 body for a transient v2 failure (system_error / infra). */
function v2Unavailable(res: Response): Response {
  return res.status(503).json({
    error: 'Classification temporarily unavailable',
    retryable: true,
  });
}

/** 503 body for the server-side timeout race (honest: it ran too long). */
function v2TimedOut(res: Response): Response {
  return res.status(503).json({
    error: 'Classification timed out — it is taking longer than expected.',
    retryable: true,
  });
}

/**
 * Route-level 500 fallback for an UNEXPECTED throw (not a handled timeout/
 * system_error → those return 503). PRODUCTION HYGIENE (B0): in production the
 * response body must NEVER echo the raw provider error text (it can contain a
 * provider URL/key-shaped substring or internal detail); we scrub to a generic
 * message and keep the real error in the server log only. In dev the message is
 * surfaced to aid debugging.
 */
function classifyFailed(res: Response, error: unknown): Response {
  console.error('[API] Classification error:', error);
  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: 'Classification failed',
    message: isProd
      ? 'An unexpected error occurred'
      : error instanceof Error
        ? error.message
        : 'Unknown error',
  });
}

/**
 * POST /api/classify
 * Main classification endpoint
 */
router.post('/', requireInternalToken, classifyRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { query, previousAnswers } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter',
        example: { query: 'ceramic brake pads for trucks' }
      });
    }

    if (query.length < 3) {
      return res.status(400).json({
        error: 'Query too short. Please provide a more detailed product description.'
      });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: 'Product description is too long — please shorten it to under 1000 characters.',
        retryable: false,
      });
    }

    console.log(`\n[API] Classification request: "${query}"`);
    const startTime = Date.now();

    // Async (job-queue) mode — enqueue + 202; the worker drains it. Gated OFF by
    // default so the inline sync behavior below is unchanged until cutover.
    if (asyncMode()) {
      const clientToken =
        typeof req.body.clientToken === 'string' ? req.body.clientToken : null;
      const created = await createJob({
        kind: 'classify',
        query,
        previous_answers:
          previousAnswers !== null && typeof previousAnswers === 'object'
            ? (previousAnswers as Record<string, string>)
            : {},
        client_token: clientToken,
      });
      return res.status(202).json({
        jobId:         created.id,
        status:        created.status,
        queuePosition: created.queue_position,
      });
    }

    if (useV2()) {
      // Concurrency gate FIRST (does NOT reserve a daily slot): an immediate 503
      // when too many pipelines are already running, so a burst fails fast rather
      // than queuing at the RPM-bounded provider and timing everyone out.
      if (inFlight >= CLASSIFY_MAX_CONCURRENCY) {
        console.warn('[API] v2 concurrency gate — busy, refusing');
        return v2Busy(res);
      }

      // HARD daily-classification ceiling (B1b): reserve a slot AT ENTRY. Counts
      // the request exactly once (even if it later fails/times out) and refuses
      // BEFORE any LLM call when the day's ceiling is reached.
      if (!costMonitor.reserveSlot()) {
        console.error('[API] Daily classification limit reached — refusing');
        return dailyLimitReached(res);
      }

      const reqId = newReqId();
      inFlight++;
      try {
        let result: ClassifyResult;
        try {
          result = await withV2Timeout(classifyV2(query, { previousAnswers }));
        } catch (raceErr) {
          if (raceErr === V2_TIMEOUT_ERROR) {
            console.error(`[API] [${reqId}] v2 classification timed out after ${V2_TIMEOUT_MS}ms`);
            return v2TimedOut(res);
          }
          throw raceErr;
        }

        const processingTimeMs = Date.now() - startTime;
        // Cost observability (B1b): record + emit the structured log line for EVERY
        // metered outcome — incl. system_error — so the daily counter + cost truth
        // reflect real token spend even on a 503.
        recordV2Cost(reqId, result, processingTimeMs);

        // Persistent infra/transport failure (ARCHITECTURE §7) → 503 retryable.
        if (result.system_error !== undefined) {
          console.error(`[API] [${reqId}] v2 system_error:`, result.system_error.message);
          return v2Unavailable(res);
        }

        console.log(`[API] [${reqId}] Completed (v2) in ${processingTimeMs}ms`);
        return res.json({
          ...(await mapV2Result(result)),
          processingTimeMs,
        });
      } finally {
        inFlight--;
      }
    }

    const result = await classify(query, { previousAnswers });

    const duration = Date.now() - startTime;
    console.log(`[API] Completed in ${duration}ms`);

    return res.json({
      ...result,
      processingTimeMs: duration
    });

  } catch (error) {
    return classifyFailed(res, error);
  }
});

/**
 * POST /api/classify/answer
 * Continue classification after user answers a question
 */
router.post('/answer', requireInternalToken, classifyRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { originalQuery, answerId, answerLabel, questionId, previousAnswers, rounds } = req.body;

    // Query-length cap on originalQuery — placed where it is first known so it
    // covers BOTH the async + v2 continuation branches below.
    if (typeof originalQuery === 'string' && originalQuery.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: 'Product description is too long — please shorten it to under 1000 characters.',
        retryable: false,
      });
    }

    // Async (job-queue) mode — enqueue an 'answer' job + 202; the worker drains it.
    // Gated OFF by default so the inline sync behavior below is unchanged.
    if (asyncMode()) {
      if (!originalQuery || !questionId || !answerId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['originalQuery', 'questionId', 'answerId'],
        });
      }
      const clientToken =
        typeof req.body.clientToken === 'string' ? req.body.clientToken : null;
      const created = await createJob({
        kind: 'answer',
        query: originalQuery,
        question_id: questionId,
        answer_id: answerId,
        previous_answers:
          previousAnswers !== null && typeof previousAnswers === 'object'
            ? (previousAnswers as Record<string, string>)
            : {},
        rounds: typeof rounds === 'number' ? rounds : 0,
        client_token: clientToken,
      });
      return res.status(202).json({
        jobId:         created.id,
        status:        created.status,
        queuePosition: created.queue_position,
      });
    }

    if (useV2()) {
      // v2 continuation: fold the answered question back into previousAnswers and
      // re-enter the pipeline. Requires the questionId (to key the answer) + the
      // selected answerId. previousAnswers + rounds are threaded by the wizard.
      if (!originalQuery || !questionId || !answerId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['originalQuery', 'questionId', 'answerId']
        });
      }

      // Concurrency gate FIRST (does NOT reserve a daily slot).
      if (inFlight >= CLASSIFY_MAX_CONCURRENCY) {
        console.warn('[API] v2 concurrency gate — busy, refusing');
        return v2Busy(res);
      }

      // HARD daily-classification ceiling (B1b): reserve a slot AT ENTRY so a
      // runaway multi-turn loop cannot bypass the cap, counted exactly once.
      if (!costMonitor.reserveSlot()) {
        console.error('[API] Daily classification limit reached — refusing');
        return dailyLimitReached(res);
      }

      console.log(`[API] Continue (v2) with answer: "${answerId}" to "${questionId}"`);
      const reqId = newReqId();
      const startTime = Date.now();

      inFlight++;
      try {
        let result: ClassifyResult;
        try {
          result = await withV2Timeout(
            continueWithAnswersV2(
              originalQuery,
              { [questionId]: answerId },
              { previousAnswers, rounds },
            ),
          );
        } catch (raceErr) {
          if (raceErr === V2_TIMEOUT_ERROR) {
            console.error(`[API] [${reqId}] v2 continuation timed out after ${V2_TIMEOUT_MS}ms`);
            return v2TimedOut(res);
          }
          throw raceErr;
        }

        const processingTimeMs = Date.now() - startTime;
        recordV2Cost(reqId, result, processingTimeMs);

        if (result.system_error !== undefined) {
          console.error(`[API] [${reqId}] v2 system_error:`, result.system_error.message);
          return v2Unavailable(res);
        }

        return res.json({
          ...(await mapV2Result(result)),
          processingTimeMs,
        });
      } finally {
        inFlight--;
      }
    }

    if (!originalQuery || !answerId || !answerLabel) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['originalQuery', 'answerId', 'answerLabel']
      });
    }

    console.log(`[API] Continue with answer: "${answerLabel}"`);

    const result = await continueWithAnswer(originalQuery, answerId, answerLabel);

    return res.json(result);

  } catch (error) {
    return classifyFailed(res, error);
  }
});

/**
 * GET /api/classify/job/:id
 * Poll a job's status/progress/result. 404 when unknown/expired.
 *
 * Always available (independent of CLASSIFY_ASYNC) so a job enqueued while async
 * mode was on stays pollable. Returns the live queue position while pending.
 */
router.get('/job/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (id === undefined || id.length === 0) {
      return res.status(400).json({ error: 'Missing job id' });
    }
    const view = await getJob(id);
    if (view === null) {
      return res.status(404).json({
        error: 'Job not found',
        jobId: id,
      });
    }
    return res.json({
      jobId:         view.id,
      status:        view.status,
      stage:         view.stage,
      progress:      view.progress,
      queuePosition: view.queue_position,
      ...(view.result !== null ? { result: view.result } : {}),
      ...(view.error !== null ? { error: view.error } : {}),
    });
  } catch (error) {
    console.error('[API] Job poll error:', error);
    return res.status(500).json({
      error: 'Failed to fetch job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/classify/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hs-code-classifier',
    timestamp: new Date().toISOString()
  });
});

export default router;

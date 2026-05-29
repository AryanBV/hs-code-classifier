// backend/src/api/classify.ts

import { Router, Request, Response } from 'express';
import { classify, continueWithAnswer } from '../classifier';
import {
  classify as classifyV2,
  continueWithAnswers as continueWithAnswersV2,
} from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import { mapV2Result } from './v2-api-adapter';

const router = Router();

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
const V2_TIMEOUT_MS = 80_000;
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

/** Standard 503 body for a transient v2 failure (timeout or system_error). */
function v2Unavailable(res: Response): Response {
  return res.status(503).json({
    error: 'Classification temporarily unavailable',
    retryable: true,
  });
}

/**
 * POST /api/classify
 * Main classification endpoint
 */
router.post('/', async (req: Request, res: Response) => {
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

    console.log(`\n[API] Classification request: "${query}"`);
    const startTime = Date.now();

    if (useV2()) {
      let result: ClassifyResult;
      try {
        result = await withV2Timeout(classifyV2(query, { previousAnswers }));
      } catch (raceErr) {
        if (raceErr === V2_TIMEOUT_ERROR) {
          console.error(`[API] v2 classification timed out after ${V2_TIMEOUT_MS}ms`);
          return v2Unavailable(res);
        }
        throw raceErr;
      }

      // Persistent infra/transport failure (ARCHITECTURE §7) → 503 retryable.
      if (result.system_error !== undefined) {
        console.error('[API] v2 system_error:', result.system_error.message);
        return v2Unavailable(res);
      }

      const processingTimeMs = Date.now() - startTime;
      console.log(`[API] Completed (v2) in ${processingTimeMs}ms`);
      return res.json({
        ...(await mapV2Result(result)),
        processingTimeMs,
      });
    }

    const result = await classify(query, { previousAnswers });

    const duration = Date.now() - startTime;
    console.log(`[API] Completed in ${duration}ms`);

    return res.json({
      ...result,
      processingTimeMs: duration
    });

  } catch (error) {
    console.error('[API] Classification error:', error);
    return res.status(500).json({
      error: 'Classification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/classify/answer
 * Continue classification after user answers a question
 */
router.post('/answer', async (req: Request, res: Response) => {
  try {
    const { originalQuery, answerId, answerLabel, questionId, previousAnswers, rounds } = req.body;

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

      console.log(`[API] Continue (v2) with answer: "${answerId}" to "${questionId}"`);
      const startTime = Date.now();

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
          console.error(`[API] v2 continuation timed out after ${V2_TIMEOUT_MS}ms`);
          return v2Unavailable(res);
        }
        throw raceErr;
      }

      if (result.system_error !== undefined) {
        console.error('[API] v2 system_error:', result.system_error.message);
        return v2Unavailable(res);
      }

      const processingTimeMs = Date.now() - startTime;
      return res.json({
        ...(await mapV2Result(result)),
        processingTimeMs,
      });
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
    console.error('[API] Answer continuation error:', error);
    return res.status(500).json({
      error: 'Classification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
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

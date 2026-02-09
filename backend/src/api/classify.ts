// backend/src/api/classify.ts

import { Router, Request, Response } from 'express';
import { classify, continueWithAnswer } from '../classifier';

const router = Router();

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
    const { originalQuery, answerId, answerLabel } = req.body;

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

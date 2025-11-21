import { Router, Request, Response } from 'express';
import { classifyProduct } from '../services/confidence-scorer.service';
import { ClassifyRequest, ClassifyResponse, ErrorResponse } from '../types/classification.types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/classify
 *
 * Classify a product and return HS code suggestions
 *
 * @body {ClassifyRequest} - Product description, country, questionnaire answers
 * @returns {ClassifyResponse} - Classification results with confidence scores
 */
router.post('/classify', async (req: Request, res: Response) => {
  try {
    const requestData: ClassifyRequest = req.body;

    // TODO: Add input validation
    if (!requestData.productDescription || requestData.productDescription.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: 'Validation Error',
        message: 'Product description is required',
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    logger.info(`Classification request for: "${requestData.productDescription.substring(0, 50)}..."`);

    // TODO: Implement classification logic
    // This will call the confidence scorer which orchestrates all 3 methods
    const result: ClassifyResponse = await classifyProduct(requestData);

    logger.info(`Classification completed with ${result.results.length} results`);

    return res.status(200).json(result);

  } catch (error) {
    logger.error('Error in /api/classify endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    const errorResponse: ErrorResponse = {
      error: 'Internal Server Error',
      message: 'Failed to classify product',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' && error instanceof Error
        ? error.message
        : undefined
    };

    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/feedback
 *
 * Submit user feedback on a classification result
 *
 * @body {classificationId, feedback, correctedCode?}
 * @returns {success, message}
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { classificationId, feedback, correctedCode } = req.body;

    // TODO: Validate input
    if (!classificationId || !feedback) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'classificationId and feedback are required',
        timestamp: new Date().toISOString()
      });
    }

    // TODO: Implement feedback storage in database
    // Update user_classifications table with feedback

    logger.info(`Feedback received for classification ${classificationId}: ${feedback}`);

    return res.status(200).json({
      success: true,
      message: 'Feedback recorded successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in /api/feedback endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to record feedback',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/history
 *
 * Get classification history for a session
 *
 * @query {sessionId, limit?}
 * @returns {history: ClassificationResult[]}
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { sessionId, limit = '10' } = req.query;

    // TODO: Validate input
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'sessionId is required',
        timestamp: new Date().toISOString()
      });
    }

    // TODO: Implement history retrieval from database
    // Query user_classifications table by sessionId

    logger.info(`History request for session ${sessionId}, limit: ${limit}`);

    return res.status(200).json({
      history: [],
      sessionId,
      count: 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in /api/history endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve history',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/categories
 *
 * Get available product categories
 *
 * @returns {categories: string[]}
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    // TODO: Implement category retrieval from decision_trees table

    logger.info('Categories request');

    return res.status(200).json({
      categories: [
        {
          name: 'Automotive Parts',
          chapterRange: '87',
          available: true
        }
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in /api/categories endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve categories',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

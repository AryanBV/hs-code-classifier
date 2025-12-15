/**
 * Conversational Classification Routes
 *
 * API endpoints for LLM-generated clarifying questions during HS code classification.
 * Supports multi-turn conversations where the LLM can ask questions before classifying.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  classifyConversational,
  getConversation,
  abandonConversation,
  getConversationStats
} from '../services/conversational-classifier.service';
import { ConversationalClassifyRequest } from '../types/conversation.types';

const router = Router();

/**
 * POST /api/classify-conversational
 *
 * Start a new classification conversation or continue an existing one.
 *
 * Request Body:
 * - productDescription: string (required for new conversation)
 * - sessionId: string (required)
 * - conversationId?: string (to continue existing conversation)
 * - answers?: Record<string, string> (user's answers to questions)
 *
 * Response:
 * - If questions needed: { responseType: 'questions', questions: [...], ... }
 * - If classification ready: { responseType: 'classification', result: {...}, ... }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const {
      productDescription,
      sessionId,
      conversationId,
      answers
    } = req.body as ConversationalClassifyRequest;

    // Validation
    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // For new conversations, productDescription is required
    if (!conversationId && !productDescription?.trim()) {
      res.status(400).json({
        success: false,
        error: 'Product description is required for new conversations',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // For continued conversations, answers are required
    if (conversationId && (!answers || Object.keys(answers).length === 0)) {
      res.status(400).json({
        success: false,
        error: 'Answers are required when continuing a conversation',
        timestamp: new Date().toISOString()
      });
      return;
    }

    logger.info(`Conversational classify request - ${conversationId ? 'continuing' : 'new'}`);

    // Call service
    const result = await classifyConversational({
      productDescription: productDescription || '',
      sessionId,
      conversationId,
      answers
    });

    // Log performance
    const responseTime = Date.now() - startTime;
    logger.info(`Conversational response in ${responseTime}ms - type: ${result.responseType}`);

    // Return appropriate status code
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error('Conversational classification error');
    logger.error(error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Internal server error during classification',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/classify-conversational/:conversationId
 *
 * Get details of a specific conversation (for debugging/audit).
 */
router.get('/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        success: false,
        error: 'Conversation ID is required'
      });
      return;
    }

    const conversation = await getConversation(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      conversation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching conversation');
    logger.error(error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation'
    });
  }
});

/**
 * DELETE /api/classify-conversational/:conversationId
 *
 * Abandon a conversation (user wants to start over).
 */
router.delete('/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        success: false,
        error: 'Conversation ID is required'
      });
      return;
    }

    const success = await abandonConversation(conversationId);

    if (success) {
      res.status(200).json({
        success: true,
        message: 'Conversation abandoned',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Conversation not found or already completed'
      });
    }

  } catch (error) {
    logger.error('Error abandoning conversation');
    logger.error(error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to abandon conversation'
    });
  }
});

/**
 * GET /api/classify-conversational/stats/overview
 *
 * Get conversation statistics (for analytics dashboard).
 */
router.get('/stats/overview', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getConversationStats();

    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching conversation stats');
    logger.error(error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

/**
 * POST /api/classify-conversational/skip
 *
 * Skip remaining questions and get best guess classification.
 * Used when user doesn't want to answer more questions.
 */
router.post('/skip', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId, sessionId } = req.body;

    if (!conversationId || !sessionId) {
      res.status(400).json({
        success: false,
        error: 'Conversation ID and Session ID are required'
      });
      return;
    }

    // Get the conversation
    const conversation = await getConversation(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
      return;
    }

    if (conversation.status !== 'active') {
      res.status(400).json({
        success: false,
        error: 'Conversation is not active'
      });
      return;
    }

    // Force classification by passing empty answers
    // The service will detect max rounds exceeded and classify
    const result = await classifyConversational({
      productDescription: conversation.productDescription,
      sessionId,
      conversationId,
      answers: {} // Empty answers signal "skip"
    });

    res.status(200).json(result);

  } catch (error) {
    logger.error('Error skipping to classification');
    logger.error(error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to skip to classification'
    });
  }
});

export default router;

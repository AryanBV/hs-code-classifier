/**
 * Conversational Classification Routes
 *
 * API endpoints for LLM-generated clarifying questions during HS code classification.
 * Supports multi-turn conversations where the LLM can ask questions before classifying.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  classifyWithLLMNavigator,
  getConversation,
  abandonConversation,
  getConversationStats,
  skipToClassification
} from '../services/llm-conversational-classifier.service';
import { ConversationalClassifyRequest } from '../types/conversation.types';

const router = Router();

// ========================================
// LLM Navigator Classifier Route
// ========================================
// Uses pure LLM navigation with NO hardcoded product lists.
// The LLM navigates the HS code hierarchy and asks relevant questions.

/**
 * POST /api/classify-conversational
 *
 * Start a new classification conversation or continue an existing one.
 * Uses LLM to navigate HS code hierarchy dynamically.
 *
 * Request Body:
 * - productDescription: string (required for new conversation)
 * - sessionId: string (required)
 * - conversationId?: string (to continue existing conversation)
 * - answers?: Record<string, string> (user's answers to questions)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { productDescription, sessionId, conversationId, answers } = req.body;

    // Validation
    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!conversationId && !productDescription?.trim()) {
      res.status(400).json({
        success: false,
        error: 'Product description is required for new conversations',
        timestamp: new Date().toISOString()
      });
      return;
    }

    logger.info(`[CLASSIFY] ${conversationId ? 'Continuing' : 'New'} conversation`);

    // Call the LLM navigator classifier
    const result = await classifyWithLLMNavigator({
      productDescription: productDescription || '',
      sessionId,
      conversationId,
      answers
    });

    // Log performance
    const responseTime = Date.now() - startTime;
    logger.info(`[CLASSIFY] Response in ${responseTime}ms - type: ${result.responseType}`);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[CLASSIFY] Error: ${errorMsg}`);

    res.status(500).json({
      success: false,
      error: 'Internal server error during classification',
      timestamp: new Date().toISOString()
    });
  }
});

// Legacy /llm endpoint - redirects to main endpoint for backward compatibility
router.post('/llm', async (req: Request, res: Response): Promise<void> => {
  // Just forward to main handler
  const startTime = Date.now();

  try {
    const { productDescription, sessionId, conversationId, answers } = req.body;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!conversationId && !productDescription?.trim()) {
      res.status(400).json({
        success: false,
        error: 'Product description is required for new conversations',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const result = await classifyWithLLMNavigator({
      productDescription: productDescription || '',
      sessionId,
      conversationId,
      answers
    });

    const responseTime = Date.now() - startTime;
    logger.info(`[LLM ROUTE] Response in ${responseTime}ms - type: ${result.responseType}`);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[LLM ROUTE] Error: ${errorMsg}`);

    res.status(500).json({
      success: false,
      error: 'Internal server error during LLM classification',
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
 * Uses forceClassification to navigate to a final code without asking more questions.
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

    logger.info(`[SKIP] Forcing classification for conversation: ${conversationId}`);

    // Use the new skipToClassification function which forces LLM to pick without asking
    const result = await skipToClassification(conversationId);

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

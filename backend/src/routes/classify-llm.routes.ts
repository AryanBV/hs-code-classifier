import { Router, Request, Response } from 'express';
import { classifyWithLLM } from '../services/llm-validation.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/classify-llm
 *
 * NEW: LLM-enhanced classification endpoint (Phase 7 & 8)
 * Uses hybrid approach: Multi-candidate retrieval + GPT-4o-mini validation
 *
 * This provides 56.7% accuracy with high confidence scores and reasoning
 *
 * @body {productDescription: string, candidateLimit?: number}
 * @returns {code, confidence, reasoning, alternatives, responseTime}
 */
router.post('/classify-llm', async (req: Request, res: Response) => {
  try {
    const { productDescription, candidateLimit = 10 } = req.body;

    // Validation
    if (!productDescription || typeof productDescription !== 'string' || productDescription.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Product description is required',
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`LLM Classification request for: "${productDescription.substring(0, 50)}..."`);

    // Call LLM classification service
    const result = await classifyWithLLM(productDescription, candidateLimit);

    logger.info(`LLM Classification completed: ${result.code} (${result.confidence}% confidence)`);

    return res.status(200).json({
      success: true,
      result: {
        hsCode: result.code,
        description: result.description,
        confidence: result.confidence,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
        performance: {
          totalTime: result.responseTime,
          searchTime: result.searchTime,
          llmTime: result.llmTime
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in /api/classify-llm endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to classify product',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' && error instanceof Error
        ? error.message
        : undefined
    });
  }
});

/**
 * POST /api/classify-llm/batch
 *
 * Batch classification endpoint for multiple products
 *
 * @body {products: string[], candidateLimit?: number}
 * @returns {results: Array<{product, hsCode, confidence, reasoning}>}
 */
router.post('/classify-llm/batch', async (req: Request, res: Response) => {
  try {
    const { products, candidateLimit = 10 } = req.body;

    // Validation
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Products array is required and must not be empty',
        timestamp: new Date().toISOString()
      });
    }

    if (products.length > 100) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Maximum 100 products per batch request',
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`Batch LLM Classification request for ${products.length} products`);

    const results = [];
    for (const product of products) {
      if (typeof product === 'string' && product.trim().length > 0) {
        const result = await classifyWithLLM(product, candidateLimit);
        results.push({
          product,
          hsCode: result.code,
          confidence: result.confidence,
          reasoning: result.reasoning
        });
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(`Batch classification completed: ${results.length} products classified`);

    return res.status(200).json({
      success: true,
      results,
      total: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in /api/classify-llm/batch endpoint');
    logger.error(error instanceof Error ? error.message : String(error));

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process batch classification',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

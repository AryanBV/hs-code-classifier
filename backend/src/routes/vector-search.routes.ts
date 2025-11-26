import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { VectorSearchService } from '../services/vector-search.service';

const router = Router();

// Initialize services (in production, these would be injected)
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const vectorSearch = new VectorSearchService(prisma, openai);

/**
 * POST /search
 * Semantic search for HS codes
 * Body: { query: string, limit?: number, threshold?: number }
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit = 10, threshold = 0.5 } = req.body;

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        error: 'Query is required and must not be empty',
      });
      return;
    }

    const results = await vectorSearch.semanticSearch(query, { limit, threshold });

    res.json({
      success: true,
      query,
      resultCount: results.length,
      results,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
    });
  }
});

/**
 * POST /hybrid-search
 * Hybrid search combining semantic search with optional keyword filtering
 * Body: { query: string, keywords?: string[], limit?: number, threshold?: number }
 */
router.post('/hybrid-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, keywords, limit = 10, threshold = 0.5 } = req.body;

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        error: 'Query is required and must not be empty',
      });
      return;
    }

    const results = await vectorSearch.hybridSearch(query, {
      limit,
      threshold,
      keywords: keywords || [],
    });

    res.json({
      success: true,
      query,
      keywordsApplied: keywords?.length || 0,
      resultCount: results.length,
      results,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Hybrid search failed',
      message: error.message,
    });
  }
});

/**
 * GET /similar/:hsCode
 * Find similar HS codes to a given code
 * Query params: limit?, threshold?
 */
router.get('/similar/:hsCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const hsCode = req.params.hsCode || '';
    const limitStr = String(req.query.limit || '10');
    const thresholdStr = String(req.query.threshold || '0.5');

    const results = await vectorSearch.findSimilarCodes(hsCode, {
      limit: parseInt(limitStr),
      threshold: parseFloat(thresholdStr),
    });

    res.json({
      success: true,
      hsCode,
      resultCount: results.length,
      results,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Finding similar codes failed',
      message: error.message,
    });
  }
});

/**
 * POST /batch-search
 * Batch search for multiple queries
 * Body: { queries: string[], limit?: number, threshold?: number }
 */
router.post('/batch-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { queries, limit = 10, threshold = 0.5 } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      res.status(400).json({
        error: 'Queries array is required and must not be empty',
      });
      return;
    }

    const results = await vectorSearch.batchSearch(queries, { limit, threshold });

    const response: any = {
      success: true,
      queryCount: queries.length,
      results: {},
    };

    results.forEach((searchResults, query) => {
      response.results[query] = {
        resultCount: searchResults.length,
        matches: searchResults,
      };
    });

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      error: 'Batch search failed',
      message: error.message,
    });
  }
});

/**
 * GET /stats
 * Get vector search statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await vectorSearch.getSearchStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message,
    });
  }
});

/**
 * POST /embedding
 * Generate embedding for a text (useful for testing)
 * Body: { text: string }
 */
router.post('/embedding', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      res.status(400).json({
        error: 'Text is required and must not be empty',
      });
      return;
    }

    const embedding = await vectorSearch.generateEmbedding(text);

    res.json({
      success: true,
      text,
      embeddingDimensions: embedding.length,
      embedding: embedding.slice(0, 10), // Return first 10 dimensions for preview
      fullEmbeddingLength: embedding.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Embedding generation failed',
      message: error.message,
    });
  }
});

export default router;

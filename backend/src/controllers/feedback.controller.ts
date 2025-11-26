/**
 * Feedback Controller (Phase 5C)
 *
 * Handles HTTP requests for feedback submission and analytics
 * Validates inputs, calls service layer, and formats responses
 */

import { Request, Response } from 'express';
import {
  logFeedback,
  getFeedbackStats,
  getFeedbackRecords,
  getFeedbackRecordCount,
  getFeedbackByChapter,
  clearFeedbackStore
} from '../services/feedback.service';
import { logger } from '../utils/logger';

/**
 * TypeScript interfaces for request/response
 */
export interface FeedbackRequest {
  classificationId: string;
  productDescription: string;
  suggestedCode: string;
  suggestedChapter?: string;
  confidence?: number;
  rating: number;
  userCorrectedCode?: string;
  feedbackNotes?: string;
  countryCode?: string;
}

export interface FeedbackResponse {
  success: boolean;
  feedbackId?: number;
  message: string;
  data?: any;
}

/**
 * POST /api/feedback
 * Submit feedback for a classification result
 */
export async function submitFeedback(req: Request, res: Response): Promise<void> {
  try {
    const {
      classificationId,
      productDescription,
      suggestedCode,
      rating,
      userCorrectedCode,
      feedbackNotes
    } = req.body as FeedbackRequest;

    // Validate required fields
    if (!classificationId || !productDescription || !suggestedCode || typeof rating !== 'number') {
      const response: FeedbackResponse = {
        success: false,
        message: 'Missing required fields: classificationId, productDescription, suggestedCode, rating'
      };
      res.status(400).json(response);
      return;
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      const response: FeedbackResponse = {
        success: false,
        message: 'Rating must be between 1 and 5'
      };
      res.status(400).json(response);
      return;
    }

    // Log feedback to database
    await logFeedback(
      classificationId,
      productDescription,
      suggestedCode,
      rating,
      userCorrectedCode,
      feedbackNotes
    );

    const response: FeedbackResponse = {
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        classificationId,
        rating,
        timestamp: new Date().toISOString()
      }
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in submitFeedback');
    logger.error(error instanceof Error ? error.message : String(error));

    const response: FeedbackResponse = {
      success: false,
      message: 'Failed to submit feedback'
    };

    res.status(500).json(response);
  }
}

/**
 * GET /api/feedback/stats
 * Get aggregated feedback statistics
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await getFeedbackStats();

    const response = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in getStats');
    logger.error(error instanceof Error ? error.message : String(error));

    const response = {
      success: false,
      message: 'Failed to retrieve statistics'
    };

    res.status(500).json(response);
  }
}

/**
 * GET /api/feedback/history
 * Get paginated feedback history
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Validate pagination params
    if (page < 1 || limit < 1 || limit > 100) {
      const response = {
        success: false,
        message: 'Invalid pagination parameters (page >= 1, 1 <= limit <= 100)'
      };
      res.status(400).json(response);
      return;
    }

    const offset = (page - 1) * limit;
    const records = await getFeedbackRecords(limit, offset);
    const total = await getFeedbackRecordCount();

    const response = {
      success: true,
      data: {
        records,
        pagination: {
          total,
          page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in getHistory');
    logger.error(error instanceof Error ? error.message : String(error));

    const response = {
      success: false,
      message: 'Failed to retrieve feedback history'
    };

    res.status(500).json(response);
  }
}

/**
 * GET /api/feedback/category/:chapter
 * Get feedback statistics for a specific HS chapter
 */
export async function getCategoryStats(req: Request, res: Response): Promise<void> {
  try {
    const { chapter } = req.params;

    // Validate chapter format
    if (!chapter || !/^\d{2}$/.test(chapter)) {
      const response = {
        success: false,
        message: 'Invalid chapter format (must be 2 digits)'
      };
      res.status(400).json(response);
      return;
    }

    const records = await getFeedbackByChapter(chapter, 100);

    if (records.length === 0) {
      const response = {
        success: false,
        message: `No feedback found for chapter ${chapter}`
      };
      res.status(404).json(response);
      return;
    }

    // Calculate stats for this chapter
    const totalFeedback = records.length;
    const ratedRecords = records.filter(r => r.rating !== null);
    const averageRating = ratedRecords.length > 0
      ? ratedRecords.reduce((sum, r) => sum + (r.rating || 0), 0) / ratedRecords.length
      : 0;

    const correctionsNeeded = records.filter(
      r => r.userCorrectedCode && r.userCorrectedCode !== r.suggestedCode
    ).length;
    const correctionRate = (correctionsNeeded / totalFeedback) * 100;

    const response = {
      success: true,
      data: {
        chapter,
        totalFeedback,
        averageRating: Math.round(averageRating * 10) / 10,
        correctionRate: Math.round(correctionRate * 10) / 10,
        recentFeedback: records.slice(0, 10)  // Last 10 feedback records
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in getCategoryStats');
    logger.error(error instanceof Error ? error.message : String(error));

    const response = {
      success: false,
      message: 'Failed to retrieve category statistics'
    };

    res.status(500).json(response);
  }
}

/**
 * DELETE /api/feedback/clear (admin only)
 * Clear all feedback records (for testing/reset)
 */
export async function clearFeedback(req: Request, res: Response): Promise<void> {
  try {
    // In production, add auth check here
    logger.warn('Clearing all feedback records - admin action');

    await clearFeedbackStore();

    const response = {
      success: true,
      message: 'All feedback records have been cleared'
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in clearFeedback');
    logger.error(error instanceof Error ? error.message : String(error));

    const response = {
      success: false,
      message: 'Failed to clear feedback'
    };

    res.status(500).json(response);
  }
}

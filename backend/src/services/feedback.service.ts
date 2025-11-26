/**
 * User Feedback Service (Phase 5C - Database-Backed)
 *
 * Collects user feedback to improve classification accuracy
 * Tracks corrections, ratings, and user satisfaction
 * Persists feedback to PostgreSQL/Supabase database
 */

import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

export interface UserFeedback {
  searchId: string;           // Unique ID for the search
  query: string;              // Original product query
  returnedCode: string;       // Code we returned
  userCorrectedCode?: string; // What user says is correct
  rating: number;             // 1-5: 1 = bad, 5 = perfect
  notes?: string;             // User comments
  timestamp: Date;
}

export interface FeedbackStats {
  totalFeedback: number;
  averageRating: number;
  correctionRate: number;      // % of results that needed correction
  top3Corrections: Array<{
    fromCode: string;
    toCode: string;
    count: number;
  }>;
  categoryPerformance: Record<string, {
    averageRating: number;
    correctionRate: number;
    sampleSize: number;
  }>;
}

// In-memory fallback storage when database is unavailable
let feedbackStore: any[] = [];

/**
 * Log user feedback for a search result (database-first with in-memory fallback)
 */
export async function logFeedback(
  classificationId: string,
  productDescription: string,
  returnedCode: string,
  rating: number,
  userCorrectedCode?: string,
  feedbackNotes?: string
): Promise<void> {
  try {
    // Validate rating
    if (rating < 1 || rating > 5) {
      logger.warn(`Invalid rating ${rating}, clamping to 1-5`);
    }
    const clampedRating = Math.max(1, Math.min(5, rating));

    // Extract chapter from both codes
    const suggestedChapter = returnedCode.substring(0, 2);
    const correctedChapter = userCorrectedCode?.substring(0, 2);

    logger.debug(
      `Logging feedback: ${classificationId} | Product: "${productDescription.substring(0, 50)}..." | ${returnedCode} → ${userCorrectedCode || 'no correction'} | Rating: ${clampedRating}/5`
    );

    // Create feedback record
    const feedbackRecord = {
      classificationId,
      productDescription,
      suggestedCode: returnedCode,
      suggestedChapter,
      confidence: 75.0, // Default confidence - can be parameterized
      rating: clampedRating,
      userCorrectedCode: userCorrectedCode || null,
      correctedChapter: correctedChapter || null,
      feedbackNotes: feedbackNotes || null,
      classificationMethod: 'unknown', // Can be passed as parameter
      countryCode: 'IN', // Default country code
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Try to store in database using Prisma
    let storedInDatabase = false;
    try {
      await prisma.classificationFeedback.create({
        data: feedbackRecord
      });
      storedInDatabase = true;
      logger.info(
        `✓ Feedback persisted to database: ${classificationId}`
      );
    } catch (dbError) {
      // If database fails, fall back to in-memory storage
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database write failed, using in-memory fallback: ${errorMsg}`);
      feedbackStore.push(feedbackRecord);
      logger.debug(`Feedback stored in-memory. Total records: ${feedbackStore.length}`);
    }
  } catch (error) {
    logger.error('Error logging feedback');
    logger.error(error instanceof Error ? error.message : String(error));
    // Don't re-throw - let system continue even if feedback fails
  }
}

/**
 * Get feedback statistics from database (with in-memory fallback)
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
  try {
    let feedbackRecords: any[] = [];
    let useInMemory = false;

    // Try to fetch from database
    try {
      feedbackRecords = await prisma.classificationFeedback.findMany({
        orderBy: { createdAt: 'desc' }
      });
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database query failed, using in-memory feedback data: ${errorMsg}`);
      feedbackRecords = feedbackStore;
      useInMemory = true;
    }

    if (feedbackRecords.length === 0) {
      return {
        totalFeedback: 0,
        averageRating: 0,
        correctionRate: 0,
        top3Corrections: [],
        categoryPerformance: {}
      };
    }

    // Calculate basic stats
    const totalFeedback = feedbackRecords.length;
    const ratedRecords = feedbackRecords.filter(r => r.rating !== null);
    const averageRating = ratedRecords.length > 0
      ? ratedRecords.reduce((sum, r) => sum + (r.rating || 0), 0) / ratedRecords.length
      : 0;

    // Count corrections
    const correctionsNeeded = feedbackRecords.filter(
      r => r.userCorrectedCode && r.userCorrectedCode !== r.suggestedCode
    ).length;
    const correctionRate = (correctionsNeeded / totalFeedback) * 100;

    // Find top corrections (codes that were wrong and needed correction)
    const correctionMap = new Map<string, number>();
    feedbackRecords.forEach(record => {
      if (record.userCorrectedCode && record.userCorrectedCode !== record.suggestedCode) {
        const key = `${record.suggestedCode}→${record.userCorrectedCode}`;
        correctionMap.set(key, (correctionMap.get(key) || 0) + 1);
      }
    });

    const top3Corrections = Array.from(correctionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([correction, count]) => {
        const parts = correction.split('→');
        return { fromCode: parts[0] || '', toCode: parts[1] || '', count };
      });

    // Category performance by chapter
    const categoryPerformance: Record<string, {
      totalRatings: number;
      sumRatings: number;
      corrections: number;
    }> = {};

    feedbackRecords.forEach(record => {
      const cat = record.suggestedChapter || 'Unknown';
      if (!categoryPerformance[cat]) {
        categoryPerformance[cat] = { totalRatings: 0, sumRatings: 0, corrections: 0 };
      }
      categoryPerformance[cat].totalRatings++;
      if (record.rating !== null) {
        categoryPerformance[cat].sumRatings += record.rating;
      }
      if (record.userCorrectedCode && record.userCorrectedCode !== record.suggestedCode) {
        categoryPerformance[cat].corrections++;
      }
    });

    const categoryPerformanceFormatted: Record<string, {
      averageRating: number;
      correctionRate: number;
      sampleSize: number;
    }> = {};

    Object.entries(categoryPerformance).forEach(([cat, stats]) => {
      categoryPerformanceFormatted[cat] = {
        averageRating: stats.totalRatings > 0 ? stats.sumRatings / stats.totalRatings : 0,
        correctionRate: (stats.corrections / stats.totalRatings) * 100,
        sampleSize: stats.totalRatings
      };
    });

    if (useInMemory) {
      logger.info(`Stats calculated from in-memory data: ${totalFeedback} records`);
    }

    return {
      totalFeedback,
      averageRating: Math.round(averageRating * 10) / 10,
      correctionRate: Math.round(correctionRate * 10) / 10,
      top3Corrections,
      categoryPerformance: categoryPerformanceFormatted
    };
  } catch (error) {
    logger.error('Error getting feedback stats');
    logger.error(error instanceof Error ? error.message : String(error));
    return {
      totalFeedback: 0,
      averageRating: 0,
      correctionRate: 0,
      top3Corrections: [],
      categoryPerformance: {}
    };
  }
}

/**
 * Get feedback records for analysis with pagination (with in-memory fallback)
 */
export async function getFeedbackRecords(
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  try {
    try {
      const records = await prisma.classificationFeedback.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' }
      });
      return records;
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database query failed, using in-memory feedback data: ${errorMsg}`);
      // Sort by createdAt descending, then apply pagination
      const sorted = feedbackStore.sort((a, b) =>
        (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
      );
      return sorted.slice(offset, offset + limit);
    }
  } catch (error) {
    logger.error('Error retrieving feedback records');
    logger.error(error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Get feedback records count for pagination (with in-memory fallback)
 */
export async function getFeedbackRecordCount(): Promise<number> {
  try {
    try {
      return await prisma.classificationFeedback.count();
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database query failed, using in-memory feedback count: ${errorMsg}`);
      return feedbackStore.length;
    }
  } catch (error) {
    logger.error('Error counting feedback records');
    return 0;
  }
}

/**
 * Get feedback by classification ID (with in-memory fallback)
 */
export async function getFeedbackByClassificationId(classificationId: string): Promise<any | null> {
  try {
    try {
      return await prisma.classificationFeedback.findUnique({
        where: { classificationId }
      });
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database query failed, using in-memory feedback data: ${errorMsg}`);
      const record = feedbackStore.find(r => r.classificationId === classificationId);
      return record || null;
    }
  } catch (error) {
    logger.error(`Error retrieving feedback for ${classificationId}`);
    return null;
  }
}

/**
 * Get feedback by chapter/code for category analysis (with in-memory fallback)
 */
export async function getFeedbackByChapter(chapter: string, limit: number = 50): Promise<any[]> {
  try {
    try {
      return await prisma.classificationFeedback.findMany({
        where: { suggestedChapter: chapter },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database query failed, using in-memory feedback data: ${errorMsg}`);
      // Filter and sort in-memory records
      return feedbackStore
        .filter(r => r.suggestedChapter === chapter)
        .sort((a, b) =>
          (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
        )
        .slice(0, limit);
    }
  } catch (error) {
    logger.error(`Error retrieving feedback for chapter ${chapter}`);
    return [];
  }
}

/**
 * Clear feedback store (for testing) - DELETE ALL RECORDS
 */
export async function clearFeedbackStore(): Promise<void> {
  try {
    try {
      const deleted = await prisma.classificationFeedback.deleteMany();
      logger.info(`Cleared ${deleted.count} feedback records from database`);
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database delete failed, clearing in-memory feedback: ${errorMsg}`);
      const count = feedbackStore.length;
      feedbackStore = [];
      logger.info(`Cleared ${count} feedback records from in-memory storage`);
    }
  } catch (error) {
    logger.error('Error clearing feedback store');
    logger.error(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get feedback store size (for debugging) - COUNT records in database or in-memory
 */
export async function getFeedbackStoreSize(): Promise<number> {
  try {
    try {
      return await prisma.classificationFeedback.count();
    } catch (dbError) {
      // Fall back to in-memory if database unavailable
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Database count failed, using in-memory feedback size: ${errorMsg}`);
      return feedbackStore.length;
    }
  } catch (error) {
    logger.error('Error getting feedback store size');
    return 0;
  }
}

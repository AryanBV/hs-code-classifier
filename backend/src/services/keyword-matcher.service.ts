/**
 * Keyword Matching Service
 *
 * Extracts keywords from product description and matches against
 * hs_codes table using PostgreSQL full-text search
 *
 * Weight: 30% of final confidence score
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { KeywordMatchResult, ExtractedKeywords } from '../types/classification.types';

/**
 * Extract keywords from product description
 *
 * @param description - Product description text
 * @returns Extracted keywords (primary, secondary, filtered)
 *
 * TODO: Implement keyword extraction logic
 * - Remove stopwords (the, a, an, is, are, etc.)
 * - Convert to lowercase
 * - Extract nouns and important terms
 * - Identify primary vs secondary keywords
 */
export function extractKeywords(description: string): ExtractedKeywords {
  logger.debug(`Extracting keywords from: "${description.substring(0, 50)}..."`);

  // TODO: Implement extraction logic
  const words = description.toLowerCase().split(/\s+/);

  return {
    primary: words.slice(0, 3), // Placeholder
    secondary: words.slice(3, 6), // Placeholder
    filtered: words // Placeholder
  };
}

/**
 * Match keywords against hs_codes database
 *
 * @param keywords - Extracted keywords from product description
 * @param countryCode - Optional country code filter (default: "IN")
 * @returns Array of matching HS codes with scores
 *
 * TODO: Implement PostgreSQL full-text search
 * - Use GIN index on keywords array
 * - Calculate match score based on:
 *   * Number of matching keywords
 *   * Position/importance of matched keywords
 *   * Keyword frequency
 * - Return top 5 matches sorted by score
 */
export async function matchKeywords(
  keywords: string[],
  countryCode: string = 'IN'
): Promise<KeywordMatchResult[]> {
  logger.debug(`Matching keywords: ${keywords.join(', ')}`);

  try {
    // TODO: Implement database query
    // Example query structure:
    // const results = await prisma.hsCode.findMany({
    //   where: {
    //     countryCode,
    //     keywords: {
    //       hasSome: keywords // PostgreSQL array overlap
    //     }
    //   },
    //   take: 5
    // });

    // TODO: Calculate match scores
    // TODO: Sort by match score
    // TODO: Return formatted results

    // Placeholder return
    return [];

  } catch (error) {
    logger.error('Error in keyword matching');
    logger.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Main keyword matching function
 *
 * @param productDescription - Full product description
 * @param countryCode - Country code (default: "IN")
 * @returns Top keyword match results with confidence scores
 *
 * This orchestrates the full keyword matching process:
 * 1. Extract keywords from description
 * 2. Match against database
 * 3. Calculate confidence scores (0-100)
 * 4. Return top matches
 */
export async function keywordMatch(
  productDescription: string,
  countryCode: string = 'IN'
): Promise<KeywordMatchResult[]> {
  logger.info('Starting keyword matching');

  // Step 1: Extract keywords
  const extractedKeywords = extractKeywords(productDescription);

  // Step 2: Match against database
  const matches = await matchKeywords(
    [...extractedKeywords.primary, ...extractedKeywords.secondary],
    countryCode
  );

  // Step 3: Return results
  logger.info(`Keyword matching found ${matches.length} matches`);
  return matches;
}

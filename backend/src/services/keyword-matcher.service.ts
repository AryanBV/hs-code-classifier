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
 * Stopwords to filter out from keyword extraction
 * Common English words that don't help in HS code classification
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
  'these', 'those', 'it', 'its'
]);

/**
 * Extract keywords from product description
 *
 * @param description - Product description text
 * @returns Extracted keywords (primary, secondary, filtered)
 *
 * Algorithm:
 * 1. Convert to lowercase
 * 2. Remove punctuation (keep spaces)
 * 3. Split into words
 * 4. Filter out stopwords
 * 5. Filter out words shorter than 3 characters
 * 6. Filter out pure numbers
 * 7. Deduplicate while preserving order
 * 8. Primary = first 5, Secondary = next 5, Filtered = all
 */
export function extractKeywords(description: string): ExtractedKeywords {
  logger.debug(`Extracting keywords from: "${description.substring(0, 50)}..."`);

  // Step 1: Convert to lowercase
  let text = description.toLowerCase();

  // Step 2: Remove punctuation but keep spaces (replace with space)
  text = text.replace(/[^a-z0-9\s]/g, ' ');

  // Step 3: Split into words
  const words = text.split(/\s+/).filter(word => word.length > 0);

  // Step 4-6: Filter stopwords, short words, and pure numbers
  const filtered = words.filter(word => {
    // Remove stopwords
    if (STOPWORDS.has(word)) return false;

    // Remove words shorter than 3 characters
    if (word.length < 3) return false;

    // Remove pure numbers
    if (/^\d+$/.test(word)) return false;

    return true;
  });

  // Step 7: Deduplicate while preserving order
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const word of filtered) {
    if (!seen.has(word)) {
      seen.add(word);
      deduplicated.push(word);
    }
  }

  // Step 8: Split into primary and secondary
  const primary = deduplicated.slice(0, 5);
  const secondary = deduplicated.slice(5, 10);

  logger.debug(`Extracted ${deduplicated.length} keywords total`);
  logger.debug(`Primary keywords: [${primary.join(', ')}]`);
  logger.debug(`Secondary keywords: [${secondary.join(', ')}]`);

  return {
    primary,
    secondary,
    filtered: deduplicated
  };
}

/**
 * Match keywords against hs_codes database
 *
 * @param keywords - Extracted keywords from product description
 * @param countryCode - Optional country code filter (default: "IN")
 * @param primaryKeywords - Optional primary keywords for bonus scoring
 * @returns Array of matching HS codes with scores
 *
 * Uses PostgreSQL array overlap operator to find HS codes
 * whose keywords array overlaps with the input keywords.
 *
 * Match score calculation:
 * - Base score: (matched_keywords / total_keywords) * 100
 * - Bonus: +10 points if ALL primary keywords are matched
 * - Maximum score: 100
 */
export async function matchKeywords(
  keywords: string[],
  countryCode: string = 'IN',
  primaryKeywords: string[] = []
): Promise<KeywordMatchResult[]> {
  logger.debug(`Matching ${keywords.length} keywords against database`);
  logger.debug(`Keywords: ${keywords.join(', ')}`);
  if (primaryKeywords.length > 0) {
    logger.debug(`Primary keywords for bonus: ${primaryKeywords.join(', ')}`);
  }

  try {
    // Query database for HS codes with overlapping keywords
    const hsCodes = await prisma.hsCode.findMany({
      where: {
        countryCode,
        keywords: {
          hasSome: keywords // PostgreSQL array overlap operator
        }
      }
    });

    logger.debug(`Found ${hsCodes.length} HS codes with keyword overlap`);

    // Calculate match scores for each HS code
    const results: KeywordMatchResult[] = hsCodes.map(hsCode => {
      // Find which keywords matched
      const matchedKeywords = hsCode.keywords.filter(kw =>
        keywords.includes(kw.toLowerCase())
      );

      // Calculate base match score
      // Score = (matched keywords / input keywords) * 100
      // This gives higher scores to HS codes that match more of our keywords
      let matchScore = Math.round((matchedKeywords.length / keywords.length) * 100);

      // Apply bonus if ALL primary keywords are matched
      if (primaryKeywords.length > 0) {
        const primaryMatched = primaryKeywords.every(pk =>
          matchedKeywords.some(mk => mk.toLowerCase() === pk.toLowerCase())
        );

        if (primaryMatched) {
          logger.debug(`Bonus applied for ${hsCode.code}: All primary keywords matched`);
          matchScore += 10;
        }
      }

      // Cap score at 100
      matchScore = Math.min(matchScore, 100);

      return {
        hsCode: hsCode.code,
        matchScore,
        matchedKeywords,
        description: hsCode.description
      };
    });

    // Sort by match score (highest first)
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Return top 5 matches
    const topMatches = results.slice(0, 5);

    if (topMatches.length > 0 && topMatches[0]) {
      logger.debug(`Top match: ${topMatches[0].hsCode} (score: ${topMatches[0].matchScore})`);
    }

    return topMatches;

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
  logger.info(`Product description: "${productDescription.substring(0, 100)}..."`);

  // Step 1: Extract keywords
  const extractedKeywords = extractKeywords(productDescription);

  if (extractedKeywords.filtered.length === 0) {
    logger.warn('No keywords extracted from description');
    return [];
  }

  // Step 2: Match against database using primary + secondary keywords
  // Pass primary keywords separately for bonus scoring
  const matches = await matchKeywords(
    [...extractedKeywords.primary, ...extractedKeywords.secondary],
    countryCode,
    extractedKeywords.primary  // Primary keywords for +10 bonus
  );

  // Step 3: Return results
  logger.info(`Keyword matching found ${matches.length} matches`);
  if (matches.length > 0 && matches[0]) {
    logger.info(`Best match: ${matches[0].hsCode} with score ${matches[0].matchScore}`);
  }

  return matches;
}

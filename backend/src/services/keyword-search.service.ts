/**
 * Layer 1: Keyword Search Service
 *
 * Extracts keywords from product descriptions and matches them against:
 * - keywords field (pre-configured HS code keywords)
 * - commonProducts field (typical products for each code)
 * - synonyms field (alternative names)
 *
 * Returns codes with highest keyword match scores for accurate initial filtering
 */

import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

interface KeywordMatch {
  code: string;
  description: string;
  keywordScore: number;
  matchedKeywords: string[];
  reason: string;
}

/**
 * Tokenize text into lowercase words, removing punctuation
 */
function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter(word => word.length > 2); // Only keep words with 3+ characters
}

/**
 * Calculate keyword match score
 *
 * Algorithm:
 * 1. Extract keywords from user query
 * 2. For each code, check if keywords appear in: keywords, commonProducts, synonyms fields
 * 3. Score based on: match count, field importance, position weighting
 */
function calculateKeywordScore(
  userKeywords: string[],
  codeKeywords: string[],
  commonProducts: string[],
  synonyms: string[],
  description: string
): { score: number; matched: string[]; reason: string } {
  const matched: string[] = [];
  let score = 0;

  // Combine all HS code metadata
  const allCodeText = [
    ...codeKeywords,
    ...commonProducts,
    ...synonyms,
    description
  ]
    .join(' ')
    .toLowerCase();

  // Check each user keyword
  for (const userKeyword of userKeywords) {
    const lowerKeyword = userKeyword.toLowerCase();

    // Exact word match in keywords (highest weight) - must be whole word
    if (codeKeywords.some(k => {
      const lowerK = k.toLowerCase();
      return lowerK.includes(lowerKeyword) ||
             lowerK.split(/[\s\-_,]+/).some(w => w.includes(lowerKeyword));
    })) {
      score += 25;  // Increased from 20
      matched.push(userKeyword);
    }
    // Exact match in common_products
    else if (commonProducts.some(p => {
      const lowerP = p.toLowerCase();
      return lowerP.includes(lowerKeyword) ||
             lowerP.split(/[\s\-_,]+/).some(w => w.includes(lowerKeyword));
    })) {
      score += 20;  // Increased from 15
      matched.push(userKeyword);
    }
    // Exact match in synonyms
    else if (synonyms.some(s => {
      const lowerS = s.toLowerCase();
      return lowerS.includes(lowerKeyword) ||
             lowerS.split(/[\s\-_,]+/).some(w => w.includes(lowerKeyword));
    })) {
      score += 15;  // Increased from 10
      matched.push(userKeyword);
    }
    // Partial match in description
    else if (description.toLowerCase().includes(lowerKeyword)) {
      score += 8;  // Increased from 5
      matched.push(userKeyword);
    }
  }

  // Normalize score: divide by total possible matches
  const maxScore = userKeywords.length * 25; // Max 25 points per keyword (updated)
  const normalizedScore = (score / maxScore) * 100;

  // Generate reason
  let reason = '';
  if (matched.length === userKeywords.length) {
    reason = `All ${matched.length} keywords matched`;
  } else if (matched.length > 0) {
    reason = `${matched.length}/${userKeywords.length} keywords matched: ${matched.join(', ')}`;
  } else {
    reason = 'No keywords matched';
  }

  return {
    score: Math.min(100, normalizedScore),
    matched,
    reason
  };
}

/**
 * Keyword search - Layer 1 of 4-layer pipeline
 *
 * @param query - Product description from user
 * @param topN - Number of top results to return
 * @returns Codes sorted by keyword match score
 */
export async function keywordSearch(
  query: string,
  topN: number = 10
): Promise<KeywordMatch[]> {
  logger.info(`Starting keyword search for: "${query.substring(0, 100)}..."`);

  try {
    // Step 1: Extract keywords from query
    const userKeywords = tokenizeQuery(query);
    logger.debug(`Extracted keywords: ${userKeywords.join(', ')}`);

    if (userKeywords.length === 0) {
      logger.warn('No keywords extracted from query');
      return [];
    }

    // Step 2: Get all codes with their metadata
    const allCodes = await prisma.hsCode.findMany({
      select: {
        code: true,
        description: true,
        descriptionClean: true,
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    logger.info(`Searching through ${allCodes.length} codes`);

    // Step 3: Score each code by keyword matches
    const scoredCodes: KeywordMatch[] = allCodes
      .map(code => {
        // Handle array or null for keywords
        const keywordArray: string[] = Array.isArray(code.keywords) ? (code.keywords as string[]) : [];
        const productsArray: string[] = Array.isArray(code.commonProducts) ? (code.commonProducts as string[]) : [];
        const synonymsArray: string[] = Array.isArray(code.synonyms) ? (code.synonyms as string[]) : [];

        const { score, matched, reason } = calculateKeywordScore(
          userKeywords,
          keywordArray,
          productsArray,
          synonymsArray,
          code.description || ''
        );

        return {
          code: code.code,
          description: code.descriptionClean || code.description || '',
          keywordScore: score,
          matchedKeywords: matched,
          reason
        };
      })
      // Only keep codes with at least one keyword match
      .filter(result => result.keywordScore > 0)
      // Sort by score descending
      .sort((a, b) => b.keywordScore - a.keywordScore)
      // Take top N
      .slice(0, topN);

    logger.info(
      `Keyword search found ${scoredCodes.length} matching codes (threshold: >0% match)`
    );

    if (scoredCodes.length > 0 && scoredCodes[0]) {
      logger.debug(
        `Top result: ${scoredCodes[0].code} (${scoredCodes[0].keywordScore.toFixed(1)}% score)`
      );
    }

    return scoredCodes;
  } catch (error) {
    logger.error('Error in keyword search');
    logger.error(error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Extract product category from query using simple keyword detection
 *
 * Maps user input to HS chapters:
 * - Fruit/produce → Chapter 08
 * - Textiles/fabric → Chapter 52-54
 * - Machinery/engines → Chapter 84
 * - Electronics → Chapter 85
 * etc.
 *
 * @param query - Product description
 * @returns Chapter numbers that are likely relevant
 */
export function detectRelevantChapters(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const relevantChapters: Set<string> = new Set();

  // Chapter 08: Edible fruit and nuts
  if (/\b(fruit|mango|apple|banana|orange|grape|kiwi|blueberry|strawberry|nut|almond|walnut|cashew|pistachio|edible)\b/i.test(lowerQuery)) {
    relevantChapters.add('08');
  }

  // Chapter 52-54: Textiles
  if (/\b(fabric|cloth|textile|cotton|wool|silk|linen|weave|woven|yarn|thread|garment|apparel|clothing)\b/i.test(lowerQuery)) {
    relevantChapters.add('52');
    relevantChapters.add('53');
    relevantChapters.add('54');
    relevantChapters.add('55');
  }

  // Chapter 84: Machinery and engines
  if (/\b(engine|motor|machine|pump|compressor|turbine|diesel|fuel|mechanical|automotive|vehicle|parts|component)\b/i.test(lowerQuery)) {
    relevantChapters.add('84');
  }

  // Chapter 85: Electronics
  if (/\b(electronic|phone|smartphone|mobile|computer|circuit|electrical|battery|cable|wire|equipment|device)\b/i.test(lowerQuery)) {
    relevantChapters.add('85');
  }

  // Chapter 29: Organic chemicals
  if (/\b(chemical|organic|compound|liquid|acid|base|salt|polymer|plastic|resin)\b/i.test(lowerQuery)) {
    relevantChapters.add('29');
  }

  // Chapter 38: Miscellaneous chemicals
  if (/\b(coolant|lubricant|solvent|cleaner|additive|catalyst)\b/i.test(lowerQuery)) {
    relevantChapters.add('38');
  }

  return Array.from(relevantChapters);
}

/**
 * Get all chapters for a list of codes
 * Used to filter keyword results by relevant chapters only
 */
export async function getChaptersForCodes(codes: string[]): Promise<string[]> {
  const chapterSet = new Set<string>();

  for (const code of codes) {
    // Extract chapter from code (first 2 digits)
    const chapter = code.substring(0, 2);
    if (chapter && !isNaN(parseInt(chapter, 10))) {
      chapterSet.add(chapter);
    }
  }

  return Array.from(chapterSet);
}

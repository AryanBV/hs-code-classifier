/**
 * Layer 2: Chapter Filtering Service
 *
 * Filters HS codes to relevant chapters based on product category detection.
 * This dramatically reduces search space (from 10,468 codes to ~100-500 per category).
 *
 * Why this layer works:
 * - HS codes are organized hierarchically by chapter (product type)
 * - A "cotton fabric" query should ONLY search Chapter 52, not all 10,468 codes
 * - This ensures vector search (Layer 3) works on the correct category
 */

import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

interface ChapterInfo {
  chapter: string;
  description: string;
  confidence: number; // 0-100, how confident we are this is the right category
}

interface FilteredCodes {
  codes: Array<{
    code: string;
    description: string;
    chapter: string;
  }>;
  chapters: string[];
  filterReason: string;
}

/**
 * HS Code Chapter Mappings
 * Maps product categories to HS chapters
 */
export const CHAPTER_KEYWORDS: Record<string, { chapters: string[]; narrowChapters?: string[]; keywords: string[] }> = {
  'fruits_produce': {
    chapters: ['08'],
    keywords: ['fruit', 'produce', 'mango', 'apple', 'banana', 'orange', 'grape', 'kiwi', 'blueberry', 'strawberry', 'nut', 'almond', 'walnut', 'cashew', 'pistachio']
  },
  'vegetables': {
    chapters: ['07'],
    keywords: ['vegetable', 'tomato', 'carrot', 'lettuce', 'onion', 'potato', 'pepper', 'broccoli', 'cabbage', 'cucumber', 'spinach', 'garlic', 'bean', 'pea', 'corn']
  },
  'fish_seafood': {
    chapters: ['03', '04', '05'],
    narrowChapters: ['03'],  // Fish specifically
    keywords: ['fish', 'seafood', 'salmon', 'tilapia', 'shrimp', 'crab', 'lobster', 'marine', 'aquatic', 'caught', 'fillets', 'fresh fish', 'sea food']
  },
  'dairy_products': {
    chapters: ['04'],
    narrowChapters: ['04'],  // Dairy specifically
    keywords: ['milk', 'dairy', 'cheese', 'butter', 'yogurt', 'lactose', 'cream', 'cow milk', 'fresh milk', 'liquid milk', 'milk products']
  },
  'coffee_tea_spices': {
    chapters: ['09'],
    narrowChapters: ['09'],  // Spices specifically
    keywords: ['coffee', 'tea', 'spice', 'pepper', 'cinnamon', 'turmeric', 'cardamom', 'cumin', 'cloves', 'nutmeg', 'beverage', 'roasted', 'ground']
  },
  'cotton': {
    chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
    narrowChapters: ['52'],  // Cotton specifically
    keywords: ['cotton', 'woven cotton', 'cotton fabric', 'cotton apparel', 'cotton cloth', 'cotton textile', 'cotton weave', 'cotton material', 'cotton garment', 'cotton jersey', 'cotton knit', 'cotton woven', 'cotton twill', 'cotton plain', 'cotton sateen', 'cott fab', 'cott']
  },
  'wool': {
    chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
    narrowChapters: ['53'],  // Wool specifically
    keywords: ['wool', 'woolen', 'wool fabric', 'wool textile', 'wool woven', 'wool knit', 'wool material', 'wool cloth', 'wool apparel', 'wool weave', 'woolen cloth']
  },
  'textiles': {
    chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
    keywords: ['fabric', 'cloth', 'textile', 'silk', 'linen', 'weave', 'woven', 'yarn', 'thread', 'garment', 'apparel', 'clothing']
  },
  'machinery_engines': {
    chapters: ['84'],
    keywords: ['engine', 'motor', 'machine', 'pump', 'compressor', 'turbine', 'diesel', 'fuel', 'mechanical', 'automotive', 'vehicle', 'parts', 'component']
  },
  'electronics': {
    chapters: ['85'],
    keywords: ['electronic', 'phone', 'smartphone', 'mobile', 'computer', 'circuit', 'electrical', 'battery', 'cable', 'wire', 'equipment', 'device']
  },
  'chemicals': {
    chapters: ['29', '38'],
    keywords: ['chemical', 'organic', 'compound', 'acid', 'base', 'salt', 'polymer', 'plastic', 'resin', 'coolant', 'lubricant', 'solvent', 'cleaner', 'additive', 'catalyst']
  },
  'cereals': {
    chapters: ['10'],
    keywords: ['grain', 'wheat', 'rice', 'cereal', 'corn', 'maize', 'barley', 'milling', 'flour', 'oats', 'consumption']
  },
  'metals': {
    chapters: ['72', '73', '74', '75', '76', '78', '79', '80', '81'],
    keywords: ['metal', 'steel', 'iron', 'aluminum', 'copper', 'brass', 'stainless', 'alloy', 'ingot', 'plate', 'wire', 'sheet']
  },
  'plastics': {
    chapters: ['39'],
    keywords: ['plastic', 'polymer', 'polypropylene', 'polyethylene', 'PVC', 'resin', 'polystyrene']
  }
};

/**
 * Detect product category and return relevant chapters
 *
 * @param query - Product description
 * @returns List of relevant chapters with confidence scores
 */
export function detectChaptersFromQuery(query: string): ChapterInfo[] {
  const lowerQuery = query.toLowerCase();
  const detectedCategories: Map<string, number> = new Map();

  // Score each category based on keyword matches
  for (const [category, categoryData] of Object.entries(CHAPTER_KEYWORDS)) {
    const { keywords } = categoryData;
    let score = 0;

    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        // Score based on keyword length - longer keywords are more specific
        // Base 10 points + 1 point per character (rewards multi-word phrases)
        const keywordScore = 10 + keyword.length;
        score += keywordScore;
      }
    }

    if (score > 0) {
      detectedCategories.set(category, score);
    }
  }

  // Sort by confidence score and convert to chapters
  const sortedCategories = Array.from(detectedCategories.entries())
    .sort((a, b) => b[1] - a[1]);

  const chapterInfo: ChapterInfo[] = [];
  const addedChapters = new Set<string>();

  for (const [category, score] of sortedCategories) {
    const categoryData = CHAPTER_KEYWORDS[category];
    if (!categoryData) continue;

    // Use narrowChapters if available (for specific materials like cotton)
    // Otherwise use full chapters list
    const chaptersToUse = categoryData.narrowChapters || categoryData.chapters;
    const confidence = Math.min(100, score);

    for (const chapter of chaptersToUse) {
      if (!addedChapters.has(chapter)) {
        chapterInfo.push({
          chapter,
          description: category,
          confidence
        });
        addedChapters.add(chapter);
      }
    }
  }

  return chapterInfo;
}

/**
 * Get all codes from a list of chapters
 *
 * @param chapters - List of chapter numbers (e.g., ['52', '08', '84'])
 * @returns Filtered codes organized by chapter
 */
export async function getCodesByChapters(chapters: string[]): Promise<FilteredCodes> {
  if (!chapters || chapters.length === 0) {
    logger.warn('No chapters provided for filtering');
    return {
      codes: [],
      chapters: [],
      filterReason: 'No chapters specified'
    };
  }

  try {
    logger.info(`Filtering codes by chapters: ${chapters.join(', ')}`);

    // Query codes from specified chapters
    const filteredCodes = await prisma.hsCode.findMany({
      where: {
        chapter: {
          in: chapters
        }
      },
      select: {
        code: true,
        description: true,
        chapter: true
      }
    });

    logger.info(
      `Found ${filteredCodes.length} codes in chapters ${chapters.join(', ')}`
    );

    return {
      codes: filteredCodes,
      chapters,
      filterReason: `Filtered to chapters: ${chapters.join(', ')}`
    };
  } catch (error) {
    logger.error('Error filtering codes by chapters');
    logger.error(error instanceof Error ? error.message : String(error));
    return {
      codes: [],
      chapters,
      filterReason: 'Error filtering codes'
    };
  }
}

/**
 * Smart chapter filtering with fallback
 *
 * If query is too generic and matches many chapters, narrows to top 1-3 most relevant
 * This prevents search space from becoming too large
 *
 * @param query - Product description
 * @param maxChapters - Maximum number of chapters to include (default: 3)
 * @returns Filtered codes from most relevant chapters
 */
export async function smartChapterFilter(
  query: string,
  maxChapters: number = 3
): Promise<FilteredCodes> {
  logger.info(`Smart chapter filtering for query: "${query.substring(0, 100)}..."`);

  // Detect chapters from query
  const detectedChapters = detectChaptersFromQuery(query);

  if (detectedChapters.length === 0) {
    logger.warn('No chapters detected from query - will search all codes');
    // Return all codes without chapter filter
    const allCodes = await prisma.hsCode.findMany({
      select: {
        code: true,
        description: true,
        chapter: true
      },
      take: 100 // Limit to prevent overwhelming results
    });

    return {
      codes: allCodes,
      chapters: [],
      filterReason: 'Generic query - searched sample of all codes'
    };
  }

  // If too many chapters detected, keep only top ones
  const chaptersToUse = detectedChapters
    .slice(0, maxChapters)
    .map(c => c.chapter);

  logger.info(
    `Detected ${detectedChapters.length} potential chapters, using top ${chaptersToUse.length}: ${chaptersToUse.join(', ')}`
  );

  // Get codes from selected chapters
  return getCodesByChapters(chaptersToUse);
}

/**
 * Filter a list of codes by chapter
 *
 * Used when you already have a list of codes and want to filter by chapter
 *
 * @param codes - List of HS codes
 * @param chapters - Chapters to keep
 * @returns Filtered codes
 */
export function filterCodesByChapters(
  codes: Array<{ code: string; [key: string]: any }>,
  chapters: string[]
): Array<{ code: string; [key: string]: any }> {
  if (!chapters || chapters.length === 0) {
    return codes;
  }

  return codes.filter(code => {
    const chapter = code.code.substring(0, 2);
    return chapters.includes(chapter);
  });
}

/**
 * Get chapter statistics (for debugging)
 * Shows how many codes are in each chapter
 */
export async function getChapterStats(): Promise<Record<string, number>> {
  try {
    const stats: Record<string, number> = {};

    const chapters = await prisma.hsCode.groupBy({
      by: ['chapter'],
      _count: true
    });

    for (const ch of chapters) {
      if (ch.chapter) {
        stats[ch.chapter] = ch._count;
      }
    }

    return stats;
  } catch (error) {
    logger.error('Error getting chapter stats');
    return {};
  }
}

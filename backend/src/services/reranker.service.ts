// backend/src/services/reranker.service.ts
// Function-Over-Material Reranker for HS Code Classification
// Phase 7.3.1 - Critical fix for textile classification

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Candidate {
  code: string;
  description: string;
  chapter: string;
  similarity: number;
  isLeaf: boolean;
  level: number;
}

export interface RerankedCandidate extends Candidate {
  originalSimilarity: number;
  adjustedSimilarity: number;
  adjustmentReason?: string;
}

export interface RerankerConfig {
  enableFunctionOverMaterial: boolean;
  enableFinishedProductBoost: boolean;
  boostAmount: number;      // How much to boost finished goods (default: 0.15)
  penaltyAmount: number;    // How much to penalize raw materials (default: 0.10)
  debug: boolean;
}

const DEFAULT_CONFIG: RerankerConfig = {
  enableFunctionOverMaterial: true,
  enableFinishedProductBoost: true,
  boostAmount: 0.15,
  penaltyAmount: 0.10,
  debug: false
};

// ═══════════════════════════════════════════════════════════════════════════
// FINISHED PRODUCT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Keywords that indicate a FINISHED PRODUCT (not raw material)
 * When detected, we boost finished goods chapters and penalize raw material chapters
 */
const FINISHED_PRODUCT_KEYWORDS: Record<string, {
  targetChapters: string[];   // Chapters to BOOST
  penalizeChapters: string[]; // Chapters to PENALIZE
  priority: number;           // Higher = stronger signal
}> = {
  // ═══════════════════════════════════════════════════════════════════════
  // APPAREL & CLOTHING (boost Ch.61-62, penalize Ch.50-55)
  // ═══════════════════════════════════════════════════════════════════════

  // T-shirts, shirts, tops
  't-shirt': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'tshirt': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  't shirt': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'shirt': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 8 },
  'blouse': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'top': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 5 },

  // Bottoms
  'pants': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'trousers': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'jeans': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'shorts': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'skirt': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },

  // Dresses & traditional
  'dress': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'saree': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'sari': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'kurta': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'kurti': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'salwar': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'lehenga': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },

  // Outerwear
  'jacket': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'coat': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'sweater': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'pullover': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'cardigan': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'hoodie': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'sweatshirt': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },

  // Underwear & nightwear
  'underwear': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'bra': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'panties': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'pajamas': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'nightgown': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },

  // Accessories
  'socks': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'stockings': { targetChapters: ['61'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'gloves': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 8 },
  'scarf': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 8 },
  'shawl': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'tie': { targetChapters: ['61', '62'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 8 },

  // ═══════════════════════════════════════════════════════════════════════
  // HOME TEXTILES (boost Ch.63, penalize Ch.50-55)
  // ═══════════════════════════════════════════════════════════════════════

  'bedsheet': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'bed sheet': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'bedsheets': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'bed linen': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'bedding': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'pillow cover': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'pillowcase': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'duvet': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'blanket': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'quilt': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'towel': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'curtain': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'curtains': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'tablecloth': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'napkin': { targetChapters: ['63'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 9 },
  'carpet': { targetChapters: ['57'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'rug': { targetChapters: ['57'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 10 },
  'mat': { targetChapters: ['57'], penalizeChapters: ['50', '51', '52', '53', '54', '55'], priority: 7 },

  // ═══════════════════════════════════════════════════════════════════════
  // BAGS & LUGGAGE (boost Ch.42, penalize material chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'bag': { targetChapters: ['42', '63'], penalizeChapters: ['39', '41', '50', '51', '52', '53', '54', '55'], priority: 7 },
  'handbag': { targetChapters: ['42'], penalizeChapters: ['39', '41', '71', '73'], priority: 10 },
  'purse': { targetChapters: ['42'], penalizeChapters: ['39', '41', '71', '73'], priority: 10 },
  'wallet': { targetChapters: ['42'], penalizeChapters: ['39', '41', '71', '73'], priority: 10 },
  'backpack': { targetChapters: ['42'], penalizeChapters: ['39', '63'], priority: 10 },
  'suitcase': { targetChapters: ['42'], penalizeChapters: ['39', '73', '76'], priority: 10 },
  'luggage': { targetChapters: ['42'], penalizeChapters: ['39', '73', '76'], priority: 10 },
  'briefcase': { targetChapters: ['42'], penalizeChapters: ['39', '73', '76'], priority: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTWEAR (boost Ch.64, penalize material chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'shoes': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'shoe': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'sandals': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'boots': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'slippers': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'sneakers': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },
  'footwear': { targetChapters: ['64'], penalizeChapters: ['39', '40', '41'], priority: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // FURNITURE (boost Ch.94, penalize material chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'furniture': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'chair': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'table': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 9 },
  'desk': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'sofa': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'couch': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'bed': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 9 },
  'cupboard': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'wardrobe': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },
  'cabinet': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 9 },
  'shelf': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 8 },
  'bookshelf': { targetChapters: ['94'], penalizeChapters: ['44', '73', '76', '39'], priority: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // TOYS & GAMES (boost Ch.95, penalize component chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'toy': { targetChapters: ['95'], penalizeChapters: ['39', '85', '87', '73'], priority: 10 },
  'toys': { targetChapters: ['95'], penalizeChapters: ['39', '85', '87', '73'], priority: 10 },
  'game': { targetChapters: ['95'], penalizeChapters: ['85'], priority: 7 },
  'doll': { targetChapters: ['95'], penalizeChapters: ['39'], priority: 10 },
  'puzzle': { targetChapters: ['95'], penalizeChapters: ['39', '48'], priority: 10 },
  'stuffed animal': { targetChapters: ['95'], penalizeChapters: ['39', '63'], priority: 10 },
  'plush': { targetChapters: ['95'], penalizeChapters: ['39', '63'], priority: 9 },
  'action figure': { targetChapters: ['95'], penalizeChapters: ['39'], priority: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // JEWELRY & ACCESSORIES (boost Ch.71, penalize material chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'jewelry': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'jewellery': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'necklace': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'bracelet': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'earrings': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'ring': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 8 },
  'pendant': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },
  'brooch': { targetChapters: ['71'], penalizeChapters: ['39', '73', '74', '76'], priority: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOMOTIVE PARTS (boost Ch.87, penalize material chapters)
  // ═══════════════════════════════════════════════════════════════════════

  'car parts': { targetChapters: ['87'], penalizeChapters: ['39', '40', '73', '76'], priority: 10 },
  'auto parts': { targetChapters: ['87'], penalizeChapters: ['39', '40', '73', '76'], priority: 10 },
  'spare parts': { targetChapters: ['87', '84', '85'], penalizeChapters: ['39', '73', '76'], priority: 7 },
  'brake pad': { targetChapters: ['87'], penalizeChapters: ['68', '69'], priority: 10 },
  'brake pads': { targetChapters: ['87'], penalizeChapters: ['68', '69'], priority: 10 },
  'bumper': { targetChapters: ['87'], penalizeChapters: ['39', '73'], priority: 10 },
  'headlight': { targetChapters: ['87'], penalizeChapters: ['85', '70'], priority: 10 },
  'windshield': { targetChapters: ['87'], penalizeChapters: ['70'], priority: 10 },
  'radiator': { targetChapters: ['87'], penalizeChapters: ['73', '76'], priority: 9 },
  'exhaust': { targetChapters: ['87'], penalizeChapters: ['73'], priority: 9 },
  'muffler': { targetChapters: ['87'], penalizeChapters: ['73'], priority: 9 },
};

/**
 * Raw material chapters that should be PENALIZED when finished product is detected
 */
const RAW_MATERIAL_CHAPTERS: Record<string, string> = {
  '50': 'silk',
  '51': 'wool',
  '52': 'cotton',
  '53': 'vegetable fibers',
  '54': 'synthetic filaments',
  '55': 'synthetic staple fibers',
  '39': 'plastics',
  '40': 'rubber',
  '41': 'leather raw',
  '44': 'wood',
  '70': 'glass',
  '72': 'iron and steel',
  '73': 'iron/steel articles',
  '74': 'copper',
  '75': 'nickel',
  '76': 'aluminium',
};

/**
 * Finished goods chapters that should be BOOSTED when finished product is detected
 */
const FINISHED_GOODS_CHAPTERS: Record<string, string> = {
  '42': 'leather goods, bags',
  '57': 'carpets',
  '61': 'knitted apparel',
  '62': 'woven apparel',
  '63': 'made-up textiles',
  '64': 'footwear',
  '65': 'headgear',
  '71': 'jewelry',
  '87': 'vehicles and parts',
  '94': 'furniture',
  '95': 'toys',
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE RERANKING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect finished product keywords in the user's query
 * Returns array of detected keywords with their configurations
 */
function detectFinishedProductKeywords(query: string): Array<{
  keyword: string;
  config: typeof FINISHED_PRODUCT_KEYWORDS[string];
}> {
  const normalizedQuery = query.toLowerCase().trim();
  const detected: Array<{
    keyword: string;
    config: typeof FINISHED_PRODUCT_KEYWORDS[string];
  }> = [];

  // Sort keywords by length (longer first) to match more specific terms first
  const sortedKeywords = Object.keys(FINISHED_PRODUCT_KEYWORDS)
    .sort((a, b) => b.length - a.length);

  for (const keyword of sortedKeywords) {
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
    if (regex.test(normalizedQuery)) {
      const keywordConfig = FINISHED_PRODUCT_KEYWORDS[keyword];
      if (keywordConfig) {
        detected.push({
          keyword,
          config: keywordConfig
        });
      }
    }
  }

  return detected;
}

/**
 * Calculate adjusted similarity score for a candidate based on detected keywords
 */
function calculateAdjustedScore(
  candidate: Candidate,
  detectedKeywords: Array<{ keyword: string; config: typeof FINISHED_PRODUCT_KEYWORDS[string] }>,
  config: RerankerConfig
): { adjustedScore: number; reason: string } {

  let adjustedScore = candidate.similarity;
  const reasons: string[] = [];

  if (detectedKeywords.length === 0) {
    return { adjustedScore, reason: 'No adjustment - no finished product keywords detected' };
  }

  const candidateChapter = candidate.chapter.replace(/^0+/, ''); // Normalize: "09" -> "9", "52" -> "52"

  // Find the highest priority keyword that applies
  const sortedByPriority = [...detectedKeywords].sort((a, b) => b.config.priority - a.config.priority);
  const primaryKeyword = sortedByPriority[0];

  if (!primaryKeyword) {
    return { adjustedScore, reason: 'No adjustment - no applicable keywords' };
  }

  const { targetChapters, penalizeChapters, priority } = primaryKeyword.config;

  // Normalize chapter lists for comparison
  const normalizedTargets = targetChapters.map(c => c.replace(/^0+/, ''));
  const normalizedPenalties = penalizeChapters.map(c => c.replace(/^0+/, ''));

  // Calculate boost/penalty based on priority (higher priority = stronger adjustment)
  const priorityMultiplier = priority / 10; // Convert 1-10 to 0.1-1.0
  const boostAmount = config.boostAmount * priorityMultiplier;
  const penaltyAmount = config.penaltyAmount * priorityMultiplier;

  // Apply boost if candidate is in target chapters
  if (normalizedTargets.includes(candidateChapter)) {
    adjustedScore += boostAmount;
    reasons.push(`+${(boostAmount * 100).toFixed(0)}% boost for "${primaryKeyword.keyword}" → Ch.${candidateChapter}`);
  }

  // Apply penalty if candidate is in penalized chapters
  if (normalizedPenalties.includes(candidateChapter)) {
    adjustedScore -= penaltyAmount;
    reasons.push(`-${(penaltyAmount * 100).toFixed(0)}% penalty for raw material Ch.${candidateChapter}`);
  }

  // Ensure score stays in valid range
  adjustedScore = Math.max(0, Math.min(1, adjustedScore));

  return {
    adjustedScore,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No adjustment applied'
  };
}

/**
 * Main reranking function
 * Takes semantic search results and returns reranked candidates
 */
export function rerankCandidates(
  query: string,
  candidates: Candidate[],
  config: Partial<RerankerConfig> = {}
): RerankedCandidate[] {

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enableFunctionOverMaterial) {
    // Reranking disabled - return as-is with adjusted fields
    return candidates.map(c => ({
      ...c,
      originalSimilarity: c.similarity,
      adjustedSimilarity: c.similarity,
      adjustmentReason: 'Reranking disabled'
    }));
  }

  // Step 1: Detect finished product keywords in the query
  const detectedKeywords = detectFinishedProductKeywords(query);

  if (finalConfig.debug) {
    logger.info(`[RERANKER] Query: "${query}"`);
    logger.info(`[RERANKER] Detected keywords: ${detectedKeywords.map(k => k.keyword).join(', ') || 'none'}`);
  }

  // Step 2: Calculate adjusted scores for each candidate
  const rerankedCandidates: RerankedCandidate[] = candidates.map(candidate => {
    const { adjustedScore, reason } = calculateAdjustedScore(
      candidate,
      detectedKeywords,
      finalConfig
    );

    return {
      ...candidate,
      originalSimilarity: candidate.similarity,
      adjustedSimilarity: adjustedScore,
      adjustmentReason: reason
    };
  });

  // Step 3: Re-sort by adjusted similarity (descending)
  rerankedCandidates.sort((a, b) => b.adjustedSimilarity - a.adjustedSimilarity);

  if (finalConfig.debug) {
    logger.info(`[RERANKER] Top 5 after reranking:`);
    rerankedCandidates.slice(0, 5).forEach((c, i) => {
      const change = c.adjustedSimilarity - c.originalSimilarity;
      const changeStr = change > 0 ? `+${(change * 100).toFixed(0)}%` :
                        change < 0 ? `${(change * 100).toFixed(0)}%` : '0%';
      logger.info(`  ${i + 1}. Ch.${c.chapter} ${c.code}: ${(c.originalSimilarity * 100).toFixed(1)}% → ${(c.adjustedSimilarity * 100).toFixed(1)}% (${changeStr})`);
    });
  }

  return rerankedCandidates;
}

/**
 * Convert reranked candidates back to standard candidate format
 * (updates similarity to adjusted value for downstream processing)
 */
export function applyReranking(rerankedCandidates: RerankedCandidate[]): Candidate[] {
  return rerankedCandidates.map(rc => ({
    code: rc.code,
    description: rc.description,
    chapter: rc.chapter,
    similarity: rc.adjustedSimilarity, // Use adjusted score going forward
    isLeaf: rc.isLeaf,
    level: rc.level
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  detectFinishedProductKeywords,
  calculateAdjustedScore,
  FINISHED_PRODUCT_KEYWORDS,
  RAW_MATERIAL_CHAPTERS,
  FINISHED_GOODS_CHAPTERS,
  DEFAULT_CONFIG
};

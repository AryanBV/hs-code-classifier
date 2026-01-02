// backend/src/services/input-specificity.service.ts
// Analyzes how specific/detailed a user's product description is
// Used to dynamically adjust confidence thresholds

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SpecificityAnalysis {
  score: number;              // 0.0 to 1.0
  level: 'high' | 'medium' | 'low';
  wordCount: number;
  indicators: string[];       // What made it specific
  adjustedGapThreshold: number;
  adjustedConfidenceThreshold: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIFICITY INDICATORS
// ═══════════════════════════════════════════════════════════════════════════

// Product varieties (very specific)
const VARIETY_KEYWORDS = [
  // Coffee
  'arabica', 'robusta', 'liberica', 'excelsa',
  // Rice
  'basmati', 'jasmine', 'sona masoori', 'ponni', 'kolam', 'gobindobhog',
  // Tea
  'darjeeling', 'assam', 'nilgiri', 'oolong', 'green tea', 'black tea',
  // Fruits
  'alphonso', 'kesar', 'langra', 'dasheri', 'totapuri', 'banganapalli',
  // Spices
  'kashmiri', 'guntur', 'byadgi', 'malabar', 'tellicherry',
  // Textiles
  'khadi', 'chanderi', 'banarasi', 'kanchipuram', 'paithani', 'pochampally',
  // Wood
  'teak', 'rosewood', 'sandalwood', 'sheesham', 'mango wood',
];

// Processing states (adds specificity)
const PROCESSING_KEYWORDS = [
  'roasted', 'unroasted', 'raw', 'processed', 'refined', 'unrefined',
  'fresh', 'frozen', 'dried', 'dehydrated', 'smoked', 'cured',
  'organic', 'natural', 'synthetic', 'artificial',
  'handmade', 'machine made', 'hand knitted', 'hand woven',
  'polished', 'unpolished', 'milled', 'unmilled', 'husked', 'dehusked',
  'peeled', 'unpeeled', 'shelled', 'deshelled',
  'instant', 'ground', 'whole', 'powdered', 'granulated',
  'bleached', 'unbleached', 'dyed', 'undyed', 'printed', 'embroidered',
];

// Size/quantity indicators
const SIZE_KEYWORDS = [
  'small', 'medium', 'large', 'xl', 'xxl', 'xs',
  'king', 'queen', 'twin', 'single', 'double',
  'mini', 'micro', 'giant', 'jumbo',
  '5kg', '10kg', '25kg', '50kg', '100kg',
  '500g', '1kg', '2kg',
  '100ml', '250ml', '500ml', '1l', '2l', '5l',
];

// Color indicators
const COLOR_KEYWORDS = [
  'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown',
  'grey', 'gray', 'pink', 'purple', 'orange', 'gold', 'silver',
  'beige', 'navy', 'maroon', 'cream', 'ivory', 'turquoise',
];

// Material indicators (when combined with product type)
const MATERIAL_KEYWORDS = [
  'cotton', 'silk', 'wool', 'polyester', 'nylon', 'rayon', 'linen', 'jute',
  'leather', 'synthetic leather', 'faux leather', 'genuine leather',
  'steel', 'stainless steel', 'iron', 'aluminum', 'aluminium', 'copper', 'brass',
  'plastic', 'rubber', 'silicone',
  'wood', 'wooden', 'bamboo', 'cane', 'rattan',
  'glass', 'ceramic', 'porcelain', 'clay',
  'gold', 'silver', 'platinum',
];

// Brand names (very specific)
const BRAND_KEYWORDS = [
  'iphone', 'samsung', 'sony', 'lg', 'panasonic', 'philips',
  'nike', 'adidas', 'puma', 'reebok',
  'gucci', 'louis vuitton', 'prada', 'armani',
  'apple', 'dell', 'hp', 'lenovo', 'asus', 'acer',
  'toyota', 'honda', 'bmw', 'mercedes', 'audi', 'volkswagen',
  'tata', 'mahindra', 'maruti', 'bajaj', 'hero',
  'nescafe', 'bru', 'tata tea', 'lipton', 'red label',
];

// Unit measurements (adds specificity)
const UNIT_PATTERN = /\b(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|ml|l|liter|litre|mm|cm|m|inch|inches|ft|feet|pcs|pieces|units|w|watt|watts|v|volt|volts|amp|amps|hz|mhz|ghz|gb|tb|mb)\b/i;

// Number pattern (quantities, model numbers)
const NUMBER_PATTERN = /\b\d+\b/;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze the specificity of a product description
 * Returns a score from 0 (very vague) to 1 (very specific)
 */
export function analyzeInputSpecificity(query: string): SpecificityAnalysis {
  const normalizedQuery = query.toLowerCase().trim();
  const words = normalizedQuery.split(/\s+/).filter(w => w.length > 1);
  const wordCount = words.length;

  let score = 0;
  const indicators: string[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 1: Word Count (base specificity)
  // ─────────────────────────────────────────────────────────────────────────
  // 1 word = 0.1, 2 words = 0.2, 3 words = 0.3, 4+ words = 0.4 max
  const wordCountScore = Math.min(wordCount * 0.1, 0.4);
  score += wordCountScore;
  if (wordCount >= 3) {
    indicators.push(`${wordCount} words`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 2: Variety Keywords (strongest indicator)
  // ─────────────────────────────────────────────────────────────────────────
  for (const variety of VARIETY_KEYWORDS) {
    if (normalizedQuery.includes(variety)) {
      score += 0.25;
      indicators.push(`variety: ${variety}`);
      break; // Only count once
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 3: Processing State
  // ─────────────────────────────────────────────────────────────────────────
  let processingFound = 0;
  for (const proc of PROCESSING_KEYWORDS) {
    if (normalizedQuery.includes(proc)) {
      processingFound++;
      if (processingFound === 1) {
        score += 0.15;
        indicators.push(`processing: ${proc}`);
      } else if (processingFound === 2) {
        score += 0.05; // Diminishing returns
      }
    }
    if (processingFound >= 2) break;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 4: Size/Quantity
  // ─────────────────────────────────────────────────────────────────────────
  for (const size of SIZE_KEYWORDS) {
    if (normalizedQuery.includes(size)) {
      score += 0.1;
      indicators.push(`size: ${size}`);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 5: Units (very specific)
  // ─────────────────────────────────────────────────────────────────────────
  if (UNIT_PATTERN.test(normalizedQuery)) {
    score += 0.15;
    const match = normalizedQuery.match(UNIT_PATTERN);
    if (match) {
      indicators.push(`unit: ${match[0]}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 6: Numbers (model numbers, quantities)
  // ─────────────────────────────────────────────────────────────────────────
  if (NUMBER_PATTERN.test(normalizedQuery) && !UNIT_PATTERN.test(normalizedQuery)) {
    score += 0.08;
    indicators.push('has numbers');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 7: Color
  // ─────────────────────────────────────────────────────────────────────────
  for (const color of COLOR_KEYWORDS) {
    if (new RegExp(`\\b${color}\\b`).test(normalizedQuery)) {
      score += 0.08;
      indicators.push(`color: ${color}`);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 8: Material (when combined with product)
  // ─────────────────────────────────────────────────────────────────────────
  for (const material of MATERIAL_KEYWORDS) {
    if (normalizedQuery.includes(material)) {
      score += 0.05;
      indicators.push(`material: ${material}`);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factor 9: Brand Names (very specific)
  // ─────────────────────────────────────────────────────────────────────────
  for (const brand of BRAND_KEYWORDS) {
    if (normalizedQuery.includes(brand)) {
      score += 0.2;
      indicators.push(`brand: ${brand}`);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Normalize score to 0-1 range
  // ─────────────────────────────────────────────────────────────────────────
  score = Math.min(score, 1.0);

  // ─────────────────────────────────────────────────────────────────────────
  // Determine specificity level
  // ─────────────────────────────────────────────────────────────────────────
  let level: 'high' | 'medium' | 'low';
  if (score >= 0.5) {
    level = 'high';
  } else if (score >= 0.25) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calculate adjusted thresholds
  // ─────────────────────────────────────────────────────────────────────────
  // Base thresholds
  const BASE_GAP_THRESHOLD = 0.08;
  const BASE_CONFIDENCE_THRESHOLD = 0.55;

  // For high specificity inputs, we can be more lenient with gap
  // For low specificity inputs, we keep strict thresholds
  //
  // Specificity 0.0 → gap threshold 0.08 (strict)
  // Specificity 0.5 → gap threshold 0.04 (lenient)
  // Specificity 1.0 → gap threshold 0.02 (very lenient)

  const gapReduction = score * 0.06; // Max reduction of 0.06 (from 0.08 to 0.02)
  const adjustedGapThreshold = Math.max(0.02, BASE_GAP_THRESHOLD - gapReduction);

  // Also slightly lower confidence threshold for specific inputs
  const confReduction = score * 0.08; // Max reduction of 0.08 (from 0.55 to 0.47)
  const adjustedConfidenceThreshold = Math.max(0.47, BASE_CONFIDENCE_THRESHOLD - confReduction);

  return {
    score,
    level,
    wordCount,
    indicators,
    adjustedGapThreshold,
    adjustedConfidenceThreshold
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: LOG SPECIFICITY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export function logSpecificityAnalysis(query: string, analysis: SpecificityAnalysis): void {
  logger.info(`[SPECIFICITY] Query: "${query}"`);
  logger.info(`[SPECIFICITY] Score: ${(analysis.score * 100).toFixed(0)}% (${analysis.level})`);
  logger.info(`[SPECIFICITY] Indicators: ${analysis.indicators.join(', ') || 'none'}`);
  logger.info(`[SPECIFICITY] Adjusted thresholds: gap=${(analysis.adjustedGapThreshold * 100).toFixed(1)}%, conf=${(analysis.adjustedConfidenceThreshold * 100).toFixed(1)}%`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  VARIETY_KEYWORDS,
  PROCESSING_KEYWORDS,
  SIZE_KEYWORDS,
  COLOR_KEYWORDS,
  MATERIAL_KEYWORDS,
  BRAND_KEYWORDS
};

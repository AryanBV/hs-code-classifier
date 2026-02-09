/**
 * Semantic-First Classifier Service
 * 
 * THE NEW APPROACH: Use semantic search as the PRIMARY classification method.
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import OpenAI from 'openai';
import { rerankCandidates, applyReranking, RerankedCandidate } from './reranker.service';
import { analyzeInputSpecificity, logSpecificityAnalysis, SpecificityAnalysis } from './input-specificity.service';
import {
  analyzeQueryTerms,
  logTermAnalysis,
  TermAnalysis
} from './query-term-analyzer.service';
import {
  ruleIntegration,
  IntegrationResult,
  CONFIDENCE_CONFIG as RULE_CONFIDENCE_CONFIG
} from './rule-engine-integration.service';
import {
  classifyAndDetermineChapter,
  ChapterDeterminationResult,
} from './product-type-classifier.service';
import {
  determineHeading,
  HeadingDeterminationResult,
} from './heading-determination.service';
import {
  selectCode,
  hasDifferentiators,
  CodeSelectionResult,
  CodeSelectionQuestionResult,
} from './code-selection.service';
// Phase 4: Coverage-aware confidence
import {
  calculateHeadingCoverage,
  getCoverageMultiplier,
} from './heading-coverage.service';
import { detectConfusingPair, ConfusingPair } from '../data/confusing-chapter-pairs';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Types
export interface SemanticCandidate {
  code: string;
  description: string;
  chapter: string;
  similarity: number;
  isLeaf: boolean;
  level: number;
}

export interface CandidateAnalysis {
  candidates: SemanticCandidate[];
  topCandidate: SemanticCandidate | null;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  distinguishingAttribute: string | null;
  spanMultipleChapters: boolean;
  spanMultipleHeadings: boolean;
  confusingPairDetected?: ConfusingPair;
}

export interface ClassificationQuestion {
  id: string;
  text: string;
  attribute: string;
  options: QuestionOption[];
  reasoning: string;
}

export interface QuestionOption {
  code: string;
  label: string;
  description: string;
  codesIncluded: string[];
}

export interface ClassificationResult {
  type: 'classification' | 'question' | 'need_more_info' | 'error';
  code?: string;
  description?: string;
  confidence?: number;
  reasoning?: string;
  alternatives?: Array<{ code: string; description: string; similarity: number }>;
  question?: ClassificationQuestion;
  message?: string;
  // Phase 4: Coverage and confidence breakdown
  headingCoverage?: {
    percentage: number;
    level: 'high' | 'medium' | 'low' | 'none';
    multiplierApplied: number;
    reason: string;
  };
  confidenceBreakdown?: {
    overall: number;
    chapter?: { value: number; reason: string };
    heading?: { value: number; reason: string };
    subheading?: { value: number; reason: string };
    eightDigit?: { value: number; reason: string };
  };
}

export interface ConversationContext {
  originalQuery: string;
  answeredQuestions: Array<{
    questionId: string;
    attribute: string;
    selectedCode: string;
    selectedLabel: string;
  }>;
  narrowedCandidates: SemanticCandidate[];
  accumulatedKeywords: string[];
}

// Constants
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
// Phase 0B: Raised thresholds for "better no code than wrong code" requirement
const HIGH_CONFIDENCE_THRESHOLD = 0.70;  // Raised from 0.55
const CONFIDENCE_GAP_THRESHOLD = 0.15;   // Raised from 0.08 - need clear winner
const MIN_SIMILARITY_THRESHOLD = 0.25;
const INITIAL_SEARCH_LIMIT = 30;
const FINAL_OPTIONS_LIMIT = 6;

/**
 * CLARITY RULES - 100% Clarity Principle
 * Ask when uncertain, classify when certain
 */
const CLARITY_RULES = {
  // Vague queries (1-2 words) need higher confidence
  VAGUE_QUERY_THRESHOLD: 0.85,

  // Specific queries (3+ words) can classify at lower confidence
  SPECIFIC_QUERY_THRESHOLD: 0.75,

  // If top 2 candidates span different chapters with small gap, ASK
  CHAPTER_CONFUSION_GAP: 0.15,

  // If confusing pair detected, ALWAYS ASK
  CONFUSING_PAIR_OVERRIDE: true,

  // Cap confidence for "Other" codes (*.90, *.99)
  MAX_OTHER_CODE_CONFIDENCE: 70,
};

/**
 * Determine if we should ask for clarity instead of classifying
 */
function shouldAskForClarity(
  topCandidate: { similarity: number; chapter: string },
  secondCandidate: { similarity: number; chapter: string } | undefined,
  query: string,
  confusingPair: ConfusingPair | null
): { shouldAsk: boolean; reason: string } {
  // Rule 1: Confusing pair ALWAYS asks
  if (confusingPair && CLARITY_RULES.CONFUSING_PAIR_OVERRIDE) {
    return {
      shouldAsk: true,
      reason: `Known confusing pair: Ch.${confusingPair.chapters.join('/')}`
    };
  }

  // Rule 2: Different chapters with small gap
  if (secondCandidate && topCandidate.chapter !== secondCandidate.chapter) {
    const gap = topCandidate.similarity - secondCandidate.similarity;
    if (gap < CLARITY_RULES.CHAPTER_CONFUSION_GAP) {
      return {
        shouldAsk: true,
        reason: `Multiple chapters with only ${(gap * 100).toFixed(1)}% gap`
      };
    }
  }

  // Rule 3: Vague query needs higher confidence
  const wordCount = query.split(/\s+/).filter(w => w.length > 2).length;
  const threshold = wordCount <= 2
    ? CLARITY_RULES.VAGUE_QUERY_THRESHOLD
    : CLARITY_RULES.SPECIFIC_QUERY_THRESHOLD;

  if (topCandidate.similarity < threshold) {
    return {
      shouldAsk: true,
      reason: `${wordCount <= 2 ? 'Vague' : 'Specific'} query below ${(threshold * 100).toFixed(0)}% threshold`
    };
  }

  return { shouldAsk: false, reason: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 0B: Query Specificity Threshold Calibration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get effective classification threshold based on query specificity.
 *
 * Phase 0B Change: Instead of CAPPING confidence (which overrides semantic scores),
 * we RAISE the threshold for vague queries. This keeps the similarity score
 * accurate but requires higher confidence for classification.
 *
 * Rationale: "Better no code than wrong code"
 * - Vague 1-word queries need 80% confidence to classify
 * - 2-word queries need 75% confidence
 * - Specific 3+ word queries use normal 70% threshold
 *
 * @param query - The user's product description
 * @returns Effective threshold for classification decision
 */
function getEffectiveThreshold(query: string): number {
  // Count meaningful words (length > 2)
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;

  if (wordCount === 1) {
    logger.info(`[SEMANTIC] Query specificity: Single word query - threshold raised to 80%`);
    return 0.80;  // 1 word: need 80% to classify
  } else if (wordCount === 2) {
    logger.info(`[SEMANTIC] Query specificity: Two word query - threshold raised to 75%`);
    return 0.75;  // 2 words: need 75% to classify
  }

  return HIGH_CONFIDENCE_THRESHOLD;  // 3+ words: normal 70% threshold
}

/**
 * Apply query specificity calibration to confidence scores.
 *
 * PHASE 0B: CHANGED from capping to threshold approach.
 * Now returns confidence unchanged - use getEffectiveThreshold() for decisions.
 *
 * The confidence score now reflects TRUE semantic similarity.
 * Classification decisions use dynamic thresholds based on query specificity.
 */
function applyQuerySpecificityCalibration(
  rawConfidence: number,
  query: string,
): number {
  // PHASE 0B: No longer cap confidence
  // Return raw confidence unchanged - threshold handles vague queries
  // This preserves the semantic similarity score for display/debugging

  // Count meaningful words for logging only
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;

  if (wordCount <= 2) {
    const effectiveThreshold = getEffectiveThreshold(query);
    logger.info(`[SEMANTIC] Query "${query}" (${wordCount} words): confidence ${rawConfidence}%, effective threshold ${(effectiveThreshold * 100).toFixed(0)}%`);
  }

  return Math.round(rawConfidence);
}

// Core Functions
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    input: text,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error('Failed to generate embedding');
  return embedding;
}

export async function semanticSearchCandidates(
  query: string,
  limit: number = INITIAL_SEARCH_LIMIT,
  threshold: number = MIN_SIMILARITY_THRESHOLD
): Promise<SemanticCandidate[]> {
  logger.info(`[SEMANTIC] Searching: "${query}"`);
  
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const results: Array<{ code: string; description: string; chapter: string; similarity: string }> = await prisma.$queryRaw`
    SELECT code, description, chapter,
      ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
    FROM hs_codes
    WHERE (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  const candidates: SemanticCandidate[] = results.map(r => ({
    code: r.code,
    description: r.description,
    chapter: r.chapter,
    similarity: parseFloat(r.similarity),
    isLeaf: r.code.replace(/\./g, '').length >= 8,
    level: r.code.replace(/\./g, '').length
  }));

  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    if (topCandidate) {
      logger.info(`[SEMANTIC] Found ${candidates.length}, top: ${topCandidate.code} (${topCandidate.similarity})`);
    }
  }
  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1A: CHAPTER-CONSTRAINED SEMANTIC SEARCH
// Search ONLY within a specific chapter for high-confidence chapter determinations
// ═══════════════════════════════════════════════════════════════════════════

export async function semanticSearchWithinChapter(
  query: string,
  chapter: string,
  limit: number = INITIAL_SEARCH_LIMIT,
  threshold: number = MIN_SIMILARITY_THRESHOLD
): Promise<SemanticCandidate[]> {
  logger.info(`[SEMANTIC-CHAPTER] Searching within Ch.${chapter}: "${query}"`);

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Search ONLY within the specified chapter
  const results: Array<{ code: string; description: string; chapter: string; similarity: string }> = await prisma.$queryRaw`
    SELECT code, description, chapter,
      ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
    FROM hs_codes
    WHERE (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
      AND chapter = ${chapter}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  const candidates: SemanticCandidate[] = results.map(r => ({
    code: r.code,
    description: r.description,
    chapter: r.chapter,
    similarity: parseFloat(r.similarity),
    isLeaf: r.code.replace(/\./g, '').length >= 8,
    level: r.code.replace(/\./g, '').length
  }));

  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    if (topCandidate) {
      logger.info(`[SEMANTIC-CHAPTER] Found ${candidates.length} in Ch.${chapter}, top: ${topCandidate.code} (${topCandidate.similarity})`);
    }
  } else {
    logger.warn(`[SEMANTIC-CHAPTER] No candidates found in Ch.${chapter}, falling back to all chapters`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1B: HEADING-CONSTRAINED SEMANTIC SEARCH
// Search ONLY within a specific heading for high-confidence heading determinations
// ═══════════════════════════════════════════════════════════════════════════

export async function semanticSearchWithinHeading(
  query: string,
  heading: string,
  limit: number = INITIAL_SEARCH_LIMIT,
  threshold: number = MIN_SIMILARITY_THRESHOLD
): Promise<SemanticCandidate[]> {
  logger.info(`[SEMANTIC-HEADING] Searching within heading ${heading}: "${query}"`);

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Search ONLY within the specified heading (codes starting with heading)
  const headingPattern = `${heading}%`;
  const results: Array<{ code: string; description: string; chapter: string; similarity: string }> = await prisma.$queryRaw`
    SELECT code, description, chapter,
      ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
    FROM hs_codes
    WHERE (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
      AND code LIKE ${headingPattern}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  const candidates: SemanticCandidate[] = results.map(r => ({
    code: r.code,
    description: r.description,
    chapter: r.chapter,
    similarity: parseFloat(r.similarity),
    isLeaf: r.code.replace(/\./g, '').length >= 8,
    level: r.code.replace(/\./g, '').length
  }));

  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    if (topCandidate) {
      logger.info(`[SEMANTIC-HEADING] Found ${candidates.length} in heading ${heading}, top: ${topCandidate.code} (${topCandidate.similarity})`);
    }
  } else {
    logger.warn(`[SEMANTIC-HEADING] No candidates found in heading ${heading}`);
  }

  return candidates;
}

/**
 * Boost candidates from a specific heading
 */
function boostHeadingCandidates(candidates: SemanticCandidate[], heading: string, boostAmount: number): SemanticCandidate[] {
  return candidates.map(c => {
    const codeNormalized = c.code.replace(/\./g, '');
    if (codeNormalized.startsWith(heading)) {
      return { ...c, similarity: Math.min(1, c.similarity + boostAmount) };
    }
    return c;
  }).sort((a, b) => b.similarity - a.similarity);
}

export function analyzeCandidates(
  candidates: SemanticCandidate[],
  specificity?: SpecificityAnalysis,
  query?: string
): CandidateAnalysis {
  if (candidates.length === 0) {
    return {
      candidates: [], topCandidate: null, confidence: 'low', confidenceScore: 0,
      distinguishingAttribute: null, spanMultipleChapters: false, spanMultipleHeadings: false
    };
  }

  const top = candidates[0];
  if (!top) {
    return {
      candidates: [], topCandidate: null, confidence: 'low', confidenceScore: 0,
      distinguishingAttribute: null, spanMultipleChapters: false, spanMultipleHeadings: false
    };
  }

  const second = candidates.length > 1 ? candidates[1] : null;
  // BUG FIX: Use score if set by rule engine, otherwise fall back to similarity
  const topScore = (top as any).score ?? top.similarity;
  const secondScore = second ? ((second as any).score ?? second.similarity) : 0;
  const gap = second ? topScore - secondScore : 0.2;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  let confidenceScore = topScore;

  // Use adjusted thresholds if specificity analysis is provided
  const effectiveConfThreshold = specificity?.adjustedConfidenceThreshold ?? HIGH_CONFIDENCE_THRESHOLD;
  const effectiveGapThreshold = specificity?.adjustedGapThreshold ?? CONFIDENCE_GAP_THRESHOLD;

  // Log threshold adjustment
  if (specificity && (effectiveGapThreshold !== CONFIDENCE_GAP_THRESHOLD)) {
    logger.info(`[ANALYZE] Thresholds adjusted: gap ${(CONFIDENCE_GAP_THRESHOLD * 100).toFixed(1)}% → ${(effectiveGapThreshold * 100).toFixed(1)}%, conf ${(HIGH_CONFIDENCE_THRESHOLD * 100).toFixed(1)}% → ${(effectiveConfThreshold * 100).toFixed(1)}%`);
  }

  // HIGH: similarity >= threshold AND gap >= threshold
  if (topScore >= effectiveConfThreshold && gap >= effectiveGapThreshold) {
    confidence = 'high';
    confidenceScore = Math.min(0.99, topScore + gap);
    logger.info(`[ANALYZE] HIGH confidence: sim=${(topScore * 100).toFixed(1)}% >= ${(effectiveConfThreshold * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}% >= ${(effectiveGapThreshold * 100).toFixed(1)}%`);
  }
  // MEDIUM: similarity >= 45% AND gap >= 3%
  else if (topScore >= 0.45 && gap >= 0.03) {
    confidence = 'medium';
    logger.info(`[ANALYZE] MEDIUM confidence: sim=${(topScore * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}%`);
  }
  // LOW: everything else
  else {
    logger.info(`[ANALYZE] LOW confidence: sim=${(topScore * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}%`);
  }

  const topTen = candidates.slice(0, 10);
  const chapters = new Set(topTen.map(c => c.chapter));
  const headings = new Set(topTen.map(c => c.code.substring(0, 4)));

  let distinguishingAttribute: string | null = null;
  if (chapters.size > 1) distinguishingAttribute = 'chapter';
  else if (headings.size > 1) distinguishingAttribute = 'heading';
  else distinguishingAttribute = detectDistinguishingAttribute(topTen);

  // Check for confusing chapter pairs
  let confusingPairDetected: ConfusingPair | undefined;
  if (query && chapters.size >= 2) {
    const topChapters = Array.from(chapters);
    confusingPairDetected = detectConfusingPair(query, topChapters) || undefined;

    if (confusingPairDetected) {
      logger.info(`[ANALYSIS] Confusing pair DETECTED: Ch.${confusingPairDetected.chapters[0]} vs Ch.${confusingPairDetected.chapters[1]}`);
      // Force low confidence to trigger question
      confidence = 'low';
      distinguishingAttribute = 'chapter';
    }
  }

  logger.info(`[ANALYSIS] Confidence: ${confidence}, Chapters: ${chapters.size}, Headings: ${headings.size}`);

  return {
    candidates, topCandidate: top, confidence, confidenceScore, distinguishingAttribute,
    spanMultipleChapters: chapters.size > 1, spanMultipleHeadings: headings.size > 1,
    confusingPairDetected
  };
}

function detectDistinguishingAttribute(candidates: SemanticCandidate[]): string | null {
  if (candidates.length < 2) return null;
  const descs = candidates.map(c => c.description.toLowerCase());
  
  const patterns: Array<{ name: string; re: RegExp[] }> = [
    { name: 'material', re: [/\bof cotton\b/, /\bof wool\b/, /\bof silk\b/, /\bof synthetic\b/] },
    { name: 'grade', re: [/\ba grade\b/, /\bb grade\b/, /\bc grade\b/, /\bab grade\b/, /\bpb grade\b/] },
    { name: 'processing', re: [/\bplantation\b/, /\bcherry\b/, /\bparchment\b/, /\broasted\b/, /\binstant\b/] },
    { name: 'variety', re: [/\barabica\b/, /\brobusta\b/, /\brob\b/, /\bbasmati\b/] },
  ];

  for (const p of patterns) {
    let count = 0;
    for (const d of descs) if (p.re.some(r => r.test(d))) count++;
    if (count >= 2 && count < descs.length) return p.name;
  }
  return 'specific_type';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.2: QUERY-AWARE LABEL SELECTION
// Fixes the LABEL_BUG where labels showed generic descriptions instead of
// query-relevant descriptions (e.g., "Other" instead of "Screws, bolts, nuts")
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Selects the most relevant code from a group based on query term matching.
 * This fixes the LABEL_BUG where labels showed generic descriptions instead
 * of query-relevant descriptions.
 *
 * @param codes - Array of HS codes with descriptions and similarities
 * @param query - The original user query
 * @returns The code whose description best matches the query terms
 */
function selectQueryRelevantCode(
  codes: SemanticCandidate[],
  query: string
): SemanticCandidate {
  if (!codes || codes.length === 0) {
    throw new Error('Cannot select from empty codes array');
  }

  if (codes.length === 1) {
    return codes[0]!;
  }

  // Extract meaningful query words (length > 2, not common stop words)
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'been', 'other', 'not']);
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (queryWords.length === 0) {
    // No meaningful query words, fall back to highest similarity
    return codes[0]!;
  }

  // Score each code by how many query words appear in its description
  let bestCode = codes[0]!;
  let bestScore = 0;

  for (const code of codes) {
    const desc = code.description.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      if (desc.includes(word)) {
        score++;
        // Bonus for exact word match (not substring)
        const wordPattern = new RegExp('\\b' + word + '\\b', 'i');
        if (wordPattern.test(desc)) {
          score += 0.5;
        }
      }
    }

    // Penalize "Other" descriptions - they should be last resort
    if (desc.startsWith('other') || desc.includes('- other') || desc.includes(': other')) {
      score -= 2;
    }

    // Tie-breaker: prefer higher similarity if scores are equal
    if (score > bestScore || (score === bestScore && code.similarity > bestCode.similarity)) {
      bestScore = score;
      bestCode = code;
    }
  }

  // Log when we override the default selection
  if (bestCode !== codes[0]) {
    logger.info(`[LABEL-FIX] Query "${query.substring(0, 30)}..." → Changed label from "${codes[0]!.description.substring(0, 30)}..." to "${bestCode.description.substring(0, 30)}..."`);
  }

  return bestCode;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.4: CHAPTER CONTEXT BOOST
// Adjusts chapter ranking based on context clues in the query.
// This fixes regressions where the semantic search returns wrong chapter first.
// ═══════════════════════════════════════════════════════════════════════════

interface ChapterContextRule {
  pattern: RegExp;
  boost: Record<string, number>;  // Chapter -> boost value (positive = boost, negative = penalty)
  description: string;
}

const CHAPTER_CONTEXT_RULES: ChapterContextRule[] = [
  // MEDICINE FORM TERMS: "tablets", "capsules", "syrup" → boost medicine chapter
  {
    pattern: /\b(tablets?|capsules?|syrups?|injections?|medicines?|drugs?|pharmaceutical)\b/i,
    boost: { '30': 0.15, '29': -0.10 },  // Boost Ch.30 (medicines), penalize Ch.29 (chemicals)
    description: 'Medicine form detected'
  },

  // FOOD/SPICE CONTEXT: turmeric/ginger/pepper + powder/ground → boost spice chapter
  {
    pattern: /\b(turmeric|ginger|pepper|cumin|coriander|cardamom|cinnamon|cloves?|saffron)\b.*\b(powder|ground|dried|whole|spice)\b/i,
    boost: { '09': 0.12, '33': -0.08 },  // Boost Ch.09 (spices), penalize Ch.33 (cosmetics)
    description: 'Spice/food product detected'
  },
  {
    pattern: /\b(powder|ground|dried|whole|spice)\b.*\b(turmeric|ginger|pepper|cumin|coriander|cardamom|cinnamon|cloves?|saffron)\b/i,
    boost: { '09': 0.12, '33': -0.08 },
    description: 'Spice/food product detected (reverse order)'
  },

  // SILK FABRIC: "silk" + fabric/garment terms → boost silk chapter
  {
    pattern: /\bsilk\b/i,
    boost: { '50': 0.12, '52': -0.05, '62': -0.03 },  // Boost Ch.50 (silk), penalize cotton/garments
    description: 'Silk material detected'
  },

  // COTTON FABRIC: "cotton" + fabric/garment terms → boost cotton chapter
  {
    pattern: /\bcotton\b/i,
    boost: { '52': 0.10, '50': -0.05 },  // Boost Ch.52 (cotton), penalize silk
    description: 'Cotton material detected'
  },

  // WOOL FABRIC: "wool" → boost wool chapter
  {
    pattern: /\bwool(en|len)?\b/i,
    boost: { '51': 0.12, '52': -0.05, '50': -0.05 },
    description: 'Wool material detected'
  },

  // LEATHER PRODUCTS: "leather" + product terms → boost leather articles, not raw hides
  {
    pattern: /\bleather\b.*\b(bags?|shoes?|belts?|wallets?|handbags?|jackets?|accessories)\b/i,
    boost: { '42': 0.12, '41': -0.08 },  // Boost Ch.42 (leather articles), penalize Ch.41 (raw hides)
    description: 'Leather product detected'
  },

  // STEEL PRODUCTS: "steel/iron" + product terms → boost articles chapter
  {
    pattern: /\b(stainless\s+)?steel\b.*\b(bolts?|nuts?|screws?|washers?|fasteners?|bottles?|containers?)\b/i,
    boost: { '73': 0.10, '72': -0.08 },  // Boost Ch.73 (articles of iron/steel), penalize Ch.72 (raw)
    description: 'Steel product detected'
  },
  {
    pattern: /\b(bolts?|nuts?|screws?|washers?|fasteners?)\b.*\b(stainless\s+)?steel\b/i,
    boost: { '73': 0.10, '72': -0.08 },
    description: 'Steel fastener detected (reverse order)'
  },

  // PLASTIC PRODUCTS: "plastic" + product terms → boost plastic articles
  {
    pattern: /\bplastics?\b.*\b(toys?|bottles?|containers?|bags?|boxes?|cases?)\b/i,
    boost: { '39': 0.08, '95': 0.05 },  // Ch.39 plastics articles, Ch.95 toys
    description: 'Plastic product detected'
  },
];

/**
 * Get the context-based boost for a chapter based on query analysis.
 * Returns 0 if no context rules match.
 */
function getChapterContextBoost(chapter: string, query: string): number {
  let totalBoost = 0;

  for (const rule of CHAPTER_CONTEXT_RULES) {
    if (rule.pattern.test(query)) {
      const boost = rule.boost[chapter];
      if (boost !== undefined) {
        logger.info(`[CONTEXT-BOOST] ${rule.description}: Ch.${chapter} ${boost > 0 ? '+' : ''}${(boost * 100).toFixed(0)}%`);
        totalBoost += boost;
      }
    }
  }

  return totalBoost;
}

/**
 * Apply context boosts to chapter groups before sorting.
 * This ensures correct chapters appear first when context clues match.
 */
function applyChapterContextBoosts(
  groups: Map<string, SemanticCandidate[]>,
  query: string
): Map<string, { chapter: string; codes: SemanticCandidate[]; boostedSimilarity: number }> {
  const boostedGroups = new Map<string, { chapter: string; codes: SemanticCandidate[]; boostedSimilarity: number }>();

  for (const [chapter, codes] of groups.entries()) {
    const baseSimilarity = codes[0]?.similarity ?? 0;
    const contextBoost = getChapterContextBoost(chapter, query);
    const boostedSimilarity = baseSimilarity + contextBoost;

    if (contextBoost !== 0) {
      logger.info(`[CONTEXT-BOOST] Ch.${chapter}: ${(baseSimilarity * 100).toFixed(1)}% → ${(boostedSimilarity * 100).toFixed(1)}%`);
    }

    boostedGroups.set(chapter, { chapter, codes, boostedSimilarity });
  }

  return boostedGroups;
}

/**
 * Apply context boosts directly to candidates array.
 * This is called BEFORE confidence analysis to ensure correct chapters rank first.
 */
function applyContextBoostsToCandidates(
  candidates: SemanticCandidate[],
  query: string
): SemanticCandidate[] {
  // Check if any context rules match
  let hasBoostApplied = false;

  const boostedCandidates = candidates.map(c => {
    const boost = getChapterContextBoost(c.chapter, query);
    if (boost !== 0) {
      hasBoostApplied = true;
      return { ...c, similarity: Math.max(0, Math.min(1, c.similarity + boost)) };
    }
    return c;
  });

  if (hasBoostApplied) {
    // Re-sort by boosted similarity
    boostedCandidates.sort((a, b) => b.similarity - a.similarity);

    // Log the top result change
    const originalTop = candidates[0];
    const newTop = boostedCandidates[0];
    if (originalTop && newTop && originalTop.code !== newTop.code) {
      logger.info(`[CONTEXT-BOOST] Top result changed: ${originalTop.code} (Ch.${originalTop.chapter}) → ${newTop.code} (Ch.${newTop.chapter})`);
    }
  }

  return boostedCandidates;
}

/**
 * PHASE 2C: Apply heading-level boosts/penalties based on query context.
 *
 * DEPRECATED (Phase 0A): Hard-coded heading boosts have been migrated to the
 * database-driven rule engine. Chapter notes and classification rules in the
 * database now handle:
 * - Coffee heading boosts (0901 vs 0905)
 * - Toy heading boosts (9503)
 * - Silk saree boosts (Ch.62 vs fabric chapters)
 * - Phone case boosts (3926)
 *
 * The rule engine (rule-engine.service.ts) now applies these boosts via:
 * 1. chapter_notes table (exclusions/inclusions)
 * 2. classification_rules table (boosts/penalties)
 *
 * This function is kept as a fallback but should not be called.
 * If you see issues with heading selection, check the database rules.
 */
function applyHeadingLevelBoosts(
  candidates: SemanticCandidate[],
  _query: string
): SemanticCandidate[] {
  // DEPRECATED: Return candidates unchanged - rule engine handles this now
  logger.info(`[HEADING-BOOST] DEPRECATED: Hard-coded boosts disabled, using database rules`);
  return candidates;
}

// Question Generation
export async function generateQuestion(query: string, analysis: CandidateAnalysis): Promise<ClassificationQuestion | null> {
  const { candidates, spanMultipleChapters, spanMultipleHeadings, distinguishingAttribute, confusingPairDetected } = analysis;
  if (candidates.length === 0) return null;

  // Priority: Use confusing pair's smart question if detected
  if (confusingPairDetected) {
    logger.info(`[QUESTION] Using confusing pair question for Ch.${confusingPairDetected.chapters[0]} vs Ch.${confusingPairDetected.chapters[1]}`);
    return {
      id: `confusing_${confusingPairDetected.chapters.join('_')}_${Date.now()}`,
      text: confusingPairDetected.question,
      attribute: 'chapter_disambiguation',
      options: confusingPairDetected.options.map(opt => ({
        code: opt.chapter,
        label: opt.label,
        description: `${opt.description}. Examples: ${opt.examples}`,
        codesIncluded: []
      })),
      reasoning: `"${query}" could be Chapter ${confusingPairDetected.chapters[0]} or ${confusingPairDetected.chapters[1]}. These chapters are commonly confused.`
    };
  }

  if (spanMultipleChapters) return generateChapterQuestion(candidates, query);
  if (spanMultipleHeadings) return generateHeadingQuestion(candidates, query);
  return generateAttributeQuestion(candidates, distinguishingAttribute, query);
}

function generateChapterQuestion(candidates: SemanticCandidate[], query: string): ClassificationQuestion {
  const groups = new Map<string, SemanticCandidate[]>();
  for (const c of candidates.slice(0, 15)) {
    const arr = groups.get(c.chapter) || [];
    arr.push(c);
    groups.set(c.chapter, arr);
  }

  // PHASE 9.4 FIX: Apply context boosts before sorting
  const boostedGroups = applyChapterContextBoosts(groups, query);

  // Sort by boosted similarity instead of raw similarity
  const sorted = [...boostedGroups.values()]
    .filter(g => g.codes.length > 0 && g.codes[0] !== undefined)
    .sort((a, b) => b.boostedSimilarity - a.boostedSimilarity)
    .slice(0, 5);

  const options: QuestionOption[] = sorted
    .filter(g => g.codes[0] !== undefined)
    .map(g => {
      // PHASE 9.2 FIX: Use query-relevant code for label instead of first/highest-similarity
      const relevant = selectQueryRelevantCode(g.codes, query);
      return {
        code: g.chapter,
        label: createFriendlyLabel(relevant.description),
        description: relevant.description,
        codesIncluded: g.codes.map(c => c.code)
      };
    });

  return {
    id: `chapter_${Date.now()}`, text: 'Which category best describes your product?',
    attribute: 'chapter', options, reasoning: `Product "${query}" could fall under multiple categories.`
  };
}

function generateHeadingQuestion(candidates: SemanticCandidate[], query: string): ClassificationQuestion {
  const groups = new Map<string, SemanticCandidate[]>();
  for (const c of candidates.slice(0, 15)) {
    const h = c.code.substring(0, 4);
    const arr = groups.get(h) || [];
    arr.push(c);
    groups.set(h, arr);
  }

  const sorted = [...groups.entries()]
    .filter(([, cands]) => cands.length > 0 && cands[0] !== undefined)
    .sort((a, b) => {
      const aFirst = a[1][0];
      const bFirst = b[1][0];
      return (bFirst?.similarity ?? 0) - (aFirst?.similarity ?? 0);
    })
    .slice(0, 5);

  const options: QuestionOption[] = sorted
    .filter(([, cands]) => cands[0] !== undefined)
    .map(([h, cands]) => {
      // PHASE 9.2 FIX: Use query-relevant code for label instead of first/highest-similarity
      const relevant = selectQueryRelevantCode(cands, query);
      return {
        code: h,
        label: createFriendlyLabel(relevant.description),
        description: relevant.description,
        codesIncluded: cands.map(c => c.code)
      };
    });

  return {
    id: `heading_${Date.now()}`, text: 'Which type of product is this?',
    attribute: 'heading', options, reasoning: `Select the product type for "${query}".`
  };
}

function generateAttributeQuestion(candidates: SemanticCandidate[], attr: string | null, query: string): ClassificationQuestion {
  const groups = groupByAttribute(candidates.slice(0, 12), attr);

  if (groups.size === 0) {
    const options: QuestionOption[] = candidates.slice(0, FINAL_OPTIONS_LIMIT).map(c => ({
      code: c.code, label: createFriendlyLabel(c.description),
      description: c.description, codesIncluded: [c.code]
    }));
    return { id: `direct_${Date.now()}`, text: 'Which option best matches?', attribute: 'direct', options, reasoning: `Select for "${query}".` };
  }

  const sorted = [...groups.entries()]
    .filter(([, cands]) => cands.length > 0 && cands[0] !== undefined)
    .sort((a, b) => {
      const aFirst = a[1][0];
      const bFirst = b[1][0];
      return (bFirst?.similarity ?? 0) - (aFirst?.similarity ?? 0);
    })
    .slice(0, FINAL_OPTIONS_LIMIT);

  const options: QuestionOption[] = sorted
    .filter(([, cands]) => cands[0] !== undefined)
    .map(([val, cands]) => {
      // PHASE 9.2 FIX: Use query-relevant code for description
      const relevant = selectQueryRelevantCode(cands, query);
      return {
        code: relevant.code, label: capitalize(val),
        description: relevant.description, codesIncluded: cands.map(c => c.code)
      };
    });

  const qText: Record<string, string> = {
    material: 'What material?', grade: 'What grade?', processing: 'How processed?', variety: 'What variety?'
  };
  return { id: `attr_${Date.now()}`, text: qText[attr || ''] || 'Which option?', attribute: attr || 'type', options, reasoning: `Need ${attr} for "${query}".` };
}

function groupByAttribute(candidates: SemanticCandidate[], attr: string | null): Map<string, SemanticCandidate[]> {
  const groups = new Map<string, SemanticCandidate[]>();
  if (!attr) return groups;
  for (const c of candidates) {
    const val = extractAttrValue(c.description, attr);
    if (val) {
      const arr = groups.get(val) || [];
      arr.push(c);
      groups.set(val, arr);
    }
  }
  return groups;
}

function extractAttrValue(desc: string, attr: string): string | null {
  const d = desc.toLowerCase();
  if (attr === 'material') {
    const m = d.match(/of (cotton|wool|silk|synthetic|leather|plastic|steel)/);
    return m?.[1] ?? null;
  }
  if (attr === 'grade') {
    const g = d.match(/(a|b|c|ab|pb)\s*grade/i);
    return g?.[1] ? `${g[1].toUpperCase()} Grade` : null;
  }
  if (attr === 'processing') {
    if (d.includes('plantation')) return 'Plantation';
    if (d.includes('cherry')) return 'Cherry';
    if (d.includes('parchment')) return 'Parchment';
    if (d.includes('instant')) return 'Instant';
    return null;
  }
  if (attr === 'variety') {
    if (d.includes('arabica')) return 'Arabica';
    if (d.includes('robusta') || /\brob\b/.test(d)) return 'Robusta';
    return null;
  }
  const firstPart = desc.split(/[:\-–]/)[0];
  return firstPart?.trim().substring(0, 40) ?? null;
}

function createFriendlyLabel(desc: string): string {
  let l = desc.replace(/^[\d.]+\s*[-:]\s*/, '').replace(/^[-:\s]+/, '');
  l = l.replace(/,?\s*(whether or not|including|excluding).*$/i, '');
  l = l.split(/[,;]/)[0]?.trim() || l;
  l = capitalize(l);
  return l.length > 50 ? l.substring(0, 47) + '...' : l;
}

function capitalize(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }


// LLM Verification
async function llmVerify(query: string, candidates: SemanticCandidate[]): Promise<{ code: string; confidence: number; reasoning: string } | null> {
  if (candidates.length === 0) return null;
  
  const list = candidates.slice(0, 8).map((c, i) => `${i + 1}. ${c.code}: ${c.description} (${(c.similarity * 100).toFixed(1)}%)`).join('\n');
  const prompt = `Expert HS classifier. Select best code for: "${query}"\n\nCandidates:\n${list}\n\nRules: Function over material, prefer 8-digit, avoid "Other".\n\nRespond:\nCODE: [code]\nCONFIDENCE: [0-1]\nREASONING: [one line]`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 150
    });
    const text = resp.choices[0]?.message?.content || '';
    const code = text.match(/CODE:\s*(\d{4}(?:\.\d{2}){0,2})/)?.[1];
    const conf = text.match(/CONFIDENCE:\s*([\d.]+)/)?.[1];
    const reason = text.match(/REASONING:\s*(.+)/)?.[1];
    if (code) return { code, confidence: conf ? parseFloat(conf) : 0.7, reasoning: reason?.trim() || 'LLM verified' };
  } catch (e) { logger.error(`[LLM] ${e}`); }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMINANT CHAPTER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if candidates have a dominant chapter (80%+ of top results)
 * Used to allow direct classification even when technically multi-chapter
 */
function getDominantChapter(candidates: SemanticCandidate[], topN: number = 5): {
  hasDominant: boolean;
  dominantChapter: string | null;
  dominantPercentage: number;
} {
  if (candidates.length === 0) {
    return { hasDominant: false, dominantChapter: null, dominantPercentage: 0 };
  }

  // Get top N candidates
  const topCandidates = candidates.slice(0, Math.min(topN, candidates.length));

  // Count chapters
  const chapterCounts: Record<string, number> = {};
  for (const c of topCandidates) {
    const chapter = c.code.substring(0, 2);
    chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1;
  }

  // Find dominant chapter
  let maxCount = 0;
  let dominantChapter: string | null = null;
  for (const [chapter, count] of Object.entries(chapterCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantChapter = chapter;
    }
  }

  const dominantPercentage = maxCount / topCandidates.length;
  const hasDominant = dominantPercentage >= 0.8; // 80% threshold

  if (hasDominant) {
    logger.info(`[DOMINANT] Chapter ${dominantChapter} dominates: ${(dominantPercentage * 100).toFixed(0)}% of top ${topCandidates.length}`);
  }

  return { hasDominant, dominantChapter, dominantPercentage };
}

// Main Classification
export async function classifyProduct(query: string, context: ConversationContext | null = null): Promise<ClassificationResult> {
  try {
    if (!query || query.trim().length < 2) return { type: 'need_more_info', message: 'Please provide more details.' };

    logger.info(`[CLASSIFY] "${query}"`);

    // STEP 0: Analyze input specificity
    const specificity = analyzeInputSpecificity(query);
    logSpecificityAnalysis(query, specificity);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.2: Query Term Analysis
    // Analyze query terms to separate product from packaging/material
    // ═══════════════════════════════════════════════════════════════════════════
    const termAnalysis = analyzeQueryTerms(query);
    logTermAnalysis(termAnalysis);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.3: Use fullQueryWithoutPackaging instead of primaryQuery
    // This keeps material terms (cotton, silicone) which are important for
    // chapter selection, while still removing packaging terms (1kg, bags)
    // ═══════════════════════════════════════════════════════════════════════════

    // Use fullQueryWithoutPackaging - includes materials, excludes only packaging
    const searchQuery = (termAnalysis.fullQueryWithoutPackaging.length >= 3)
      ? termAnalysis.fullQueryWithoutPackaging
      : query;

    logger.info(`[CLASSIFY] Original query: "${query}"`);
    logger.info(`[CLASSIFY] Search query (full, no packaging): "${searchQuery}"`);
    logger.info(`[CLASSIFY] Primary query (for reference): "${termAnalysis.primaryQuery}"`);

    // Log what was removed (packaging terms)
    if (termAnalysis.packagingTerms.length > 0) {
      logger.info(`[CLASSIFY] Packaging terms excluded: [${termAnalysis.packagingTerms.join(', ')}]`);
    }

    // Build enhanced query for continuation (context)
    const baseQuery = context?.answeredQuestions.length
      ? `${searchQuery} ${context.answeredQuestions.map(q => q.selectedLabel).join(' ')}`
      : searchQuery;

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1A: CHAPTER DETERMINATION ENGINE
    // Determine the correct chapter BEFORE semantic search to fix structural failures
    // ═══════════════════════════════════════════════════════════════════════════
    let chapterDetermination: ChapterDeterminationResult | null = null;
    let headingDetermination: HeadingDeterminationResult | null = null;
    let rawCandidates: SemanticCandidate[];

    try {
      chapterDetermination = await classifyAndDetermineChapter(query);
      const chapterConf = chapterDetermination.chapter.confidence;
      const determinedChapter = chapterDetermination.chapter.chapter;

      logger.info(`[CLASSIFY] Chapter determination: Ch.${determinedChapter} (${chapterConf}%) - ${chapterDetermination.chapter.method}`);

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 1B: HEADING DETERMINATION ENGINE
      // Determine the correct heading AFTER chapter determination
      // ═══════════════════════════════════════════════════════════════════════════
      if (chapterConf >= 70 && determinedChapter !== '00') {
        try {
          headingDetermination = await determineHeading({
            chapter: determinedChapter,
            query: query,
            attributes: {
              material: chapterDetermination.classification.material || undefined,
              form: chapterDetermination.classification.form,
              use: chapterDetermination.classification.use || undefined,
            },
            chapterConfidence: chapterConf,
          });

          if (headingDetermination && headingDetermination.heading) {
            logger.info(`[CLASSIFY] Heading determination: ${headingDetermination.heading} (${headingDetermination.confidence}%) - ${headingDetermination.method}`);

            // ═══════════════════════════════════════════════════════════════════════════
            // PHASE 2B: DIFFERENTIATOR-BASED 8-DIGIT CODE SELECTION
            // Try to select the exact 8-digit code using differentiator matching
            // ═══════════════════════════════════════════════════════════════════════════
            if (headingDetermination.confidence >= 75) {
              try {
                // Check if we have differentiators for this heading
                const hasDiffs = await hasDifferentiators(headingDetermination.heading);

                if (hasDiffs) {
                  logger.info(`[CLASSIFY] Phase 2B: Attempting differentiator-based code selection for heading ${headingDetermination.heading}`);

                  const codeResult = await selectCode(
                    query,
                    headingDetermination.heading,
                    headingDetermination.confidence
                  );

                  // Phase 2C: Handle question response from fallback strategy
                  if ('responseType' in codeResult && codeResult.responseType === 'question') {
                    const questionResult = codeResult as CodeSelectionQuestionResult;
                    logger.info(`[CLASSIFY] Phase 2C: Code selection requesting question: ${questionResult.question}`);
                    return {
                      type: 'question',
                      question: {
                        id: 'phase2c_question',
                        text: questionResult.question,
                        attribute: 'clarification',
                        options: questionResult.options.map((opt, i) => ({
                          code: `opt_${i}`,
                          label: opt,
                          description: opt,
                          codesIncluded: [],
                        })),
                        reasoning: questionResult.reason || 'Additional information needed',
                      },
                    };
                  }

                  const classificationResult = codeResult as CodeSelectionResult;

                  // If code selection succeeded with good confidence, return directly
                  // Phase 2C: Also accept 'other' and 'fallback' methods when confidence is reasonable
                  const acceptableMethods = ['differentiator', 'semantic', 'hybrid', 'other', 'fallback'];
                  const isMethodAcceptable = acceptableMethods.includes(classificationResult.method) || classificationResult.method === 'catch_all';
                  const minConfidence = ['other', 'fallback', 'catch_all'].includes(classificationResult.method) ? 55 : 60;

                  if (classificationResult.confidence >= minConfidence && isMethodAcceptable) {
                    // FIX STAGE 2: Apply query specificity calibration
                    const calibratedConfidence = applyQuerySpecificityCalibration(classificationResult.confidence, query);

                    logger.info(`[CLASSIFY] Phase 2B/2C SUCCESS: ${classificationResult.hsCode} (${calibratedConfidence}%) via ${classificationResult.method}`);

                    return {
                      type: 'classification',
                      code: classificationResult.hsCode,
                      description: classificationResult.description,
                      confidence: calibratedConfidence,
                      reasoning: `Phase 2B/2C: ${classificationResult.reasoning}${classificationResult.assumptions ? ` [Assumptions: ${classificationResult.assumptions.map(a => a.category).join(', ')}]` : ''}`,
                      alternatives: classificationResult.alternatives.map(alt => ({
                        code: alt.hsCode,
                        description: alt.description,
                        similarity: alt.confidence / 100,
                      })),
                    };
                  } else {
                    logger.info(`[CLASSIFY] Phase 2B/2C: Low confidence (${classificationResult.confidence}%) for method ${classificationResult.method}, falling back to semantic search`);
                  }
                } else {
                  logger.info(`[CLASSIFY] Phase 2B: No differentiators for heading ${headingDetermination.heading}, using semantic search`);
                }
              } catch (codeSelectionError) {
                logger.warn(`[CLASSIFY] Phase 2B code selection failed: ${codeSelectionError}`);
              }
            }
          }
        } catch (headingError) {
          logger.warn(`[CLASSIFY] Heading determination failed: ${headingError}`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 1B: HEADING-CONSTRAINED SEARCH
      // When both chapter and heading have high confidence, search within heading
      // ═══════════════════════════════════════════════════════════════════════════
      if (chapterConf >= 90 && determinedChapter !== '00' && headingDetermination && headingDetermination.heading && headingDetermination.confidence >= 85) {
        // HIGHEST CONFIDENCE: Search only within the determined heading
        logger.info(`[CLASSIFY] HIGH confidence heading - searching within ${headingDetermination.heading} only`);
        rawCandidates = await semanticSearchWithinHeading(baseQuery, headingDetermination.heading, 20);

        // Fallback to chapter search if heading-constrained returns too few
        if (rawCandidates.length < 3) {
          logger.warn(`[CLASSIFY] Only ${rawCandidates.length} candidates in heading ${headingDetermination.heading}, expanding to chapter`);
          const chapterCandidates = await semanticSearchWithinChapter(baseQuery, determinedChapter);
          // Merge: prioritize heading-constrained results
          const headingCodes = new Set(rawCandidates.map(c => c.code));
          for (const c of chapterCandidates) {
            if (!headingCodes.has(c.code)) {
              rawCandidates.push(c);
            }
          }
          // Boost candidates from determined heading
          rawCandidates = boostHeadingCandidates(rawCandidates, headingDetermination.heading, 0.15);
        }
      } else if (chapterConf >= 90 && determinedChapter !== '00') {
        // HIGH CONFIDENCE CHAPTER: Search only within the determined chapter
        logger.info(`[CLASSIFY] HIGH confidence chapter - searching within Ch.${determinedChapter} only`);
        rawCandidates = await semanticSearchWithinChapter(baseQuery, determinedChapter);

        // Apply heading boost if we have medium confidence heading
        if (headingDetermination && headingDetermination.heading && headingDetermination.confidence >= 70) {
          logger.info(`[CLASSIFY] Applying heading boost for ${headingDetermination.heading} (+15%)`);
          rawCandidates = boostHeadingCandidates(rawCandidates, headingDetermination.heading, 0.15);
        }

        // Fallback to all chapters if constrained search returns too few results
        if (rawCandidates.length < 5) {
          logger.warn(`[CLASSIFY] Only ${rawCandidates.length} candidates in Ch.${determinedChapter}, expanding search`);
          const allCandidates = await semanticSearchCandidates(baseQuery);
          // Merge: prioritize chapter-constrained results, then add from all
          const chapterCodes = new Set(rawCandidates.map(c => c.code));
          for (const c of allCandidates) {
            if (!chapterCodes.has(c.code)) {
              // Penalize candidates from other chapters when we have high confidence
              const penalizedCandidate = c.chapter === determinedChapter
                ? c
                : { ...c, similarity: Math.max(0, c.similarity - 0.20) };
              rawCandidates.push(penalizedCandidate);
            }
          }
          rawCandidates.sort((a, b) => b.similarity - a.similarity);
        }
      } else if (chapterConf >= 70 && determinedChapter !== '00') {
        // MEDIUM CONFIDENCE: Search all but boost determined chapter
        logger.info(`[CLASSIFY] MEDIUM confidence chapter - searching all, boosting Ch.${determinedChapter}`);
        rawCandidates = await semanticSearchCandidates(baseQuery, 50);

        // Boost candidates from determined chapter
        rawCandidates = rawCandidates.map(c => ({
          ...c,
          similarity: c.chapter === determinedChapter
            ? Math.min(1, c.similarity + 0.15)  // +15% boost
            : c.similarity,
        }));

        // Apply heading boost if available
        if (headingDetermination && headingDetermination.heading && headingDetermination.confidence >= 60) {
          logger.info(`[CLASSIFY] Applying heading boost for ${headingDetermination.heading} (+10%)`);
          rawCandidates = boostHeadingCandidates(rawCandidates, headingDetermination.heading, 0.10);
        }

        // Re-sort by similarity
        rawCandidates.sort((a, b) => b.similarity - a.similarity);
        rawCandidates = rawCandidates.slice(0, 30);
      } else {
        // LOW CONFIDENCE: Use standard semantic search
        logger.info(`[CLASSIFY] LOW confidence chapter - using standard semantic search`);
        rawCandidates = await semanticSearchCandidates(baseQuery);
      }
    } catch (chapterError) {
      logger.warn(`[CLASSIFY] Chapter determination failed, using standard search: ${chapterError}`);
      rawCandidates = await semanticSearchCandidates(baseQuery);
    }

    if (rawCandidates.length === 0) return { type: 'need_more_info', message: 'No matches found. Try different description.' };

    // STEP 1.5: RERANK - Function over Material
    logger.info(`[CLASSIFY] Applying function-over-material reranking...`);
    const rerankedCandidates = rerankCandidates(baseQuery, rawCandidates, { debug: true });
    let candidates = applyReranking(rerankedCandidates);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.2: Material-Aware Chapter Guidance
    // If query has material terms, penalize raw material codes when product terms exist
    // ═══════════════════════════════════════════════════════════════════════════
    if (termAnalysis.hasMaterial && termAnalysis.productTerms.length > 0) {
      const materialTerms = termAnalysis.materialTerms;

      // Material to raw material code mapping (to PENALIZE)
      const rawMaterialCodes: Record<string, string[]> = {
        'silicone': ['3910'],      // Silicone oil - penalize when we have product terms like "cases"
        'rubber': ['4001', '4002', '4003'],  // Raw rubber
        'plastic': ['3901', '3902', '3903', '3904', '3905'],  // Raw plastics
        'leather': ['4101', '4102', '4103'],  // Raw hides
        'cotton': ['5201', '5202', '5203'],  // Raw cotton
        'wool': ['5101', '5102', '5103'],    // Raw wool
        'silk': ['5001', '5002', '5003'],    // Raw silk
        'steel': ['7201', '7202', '7203'],   // Raw iron/steel
        'iron': ['7201', '7202', '7203'],
        'aluminum': ['7601'],               // Raw aluminum
        'copper': ['7401', '7402', '7403'], // Raw copper
        'wood': ['4401', '4402', '4403'],   // Raw wood
        'glass': ['7001', '7002'],          // Raw glass
      };

      for (const material of materialTerms) {
        const rawCodes = rawMaterialCodes[material.toLowerCase()];
        if (rawCodes) {
          logger.info(`[MATERIAL-GUIDE] Material "${material}" detected with product "${termAnalysis.productTerms.join(', ')}"`);
          logger.info(`[MATERIAL-GUIDE] Penalizing raw material codes: ${rawCodes.join(', ')}`);

          candidates = candidates.map(c => {
            const heading = c.code.substring(0, 4);
            if (rawCodes.some(rc => heading.startsWith(rc))) {
              logger.info(`[MATERIAL-GUIDE] Penalizing raw material code ${c.code} (-20% similarity)`);
              return { ...c, similarity: Math.max(0, c.similarity - 0.20) };
            }
            return c;
          });

          // Re-sort after penalty
          candidates.sort((a, b) => b.similarity - a.similarity);
        }
      }
    }

    // Log reranking impact
    if (rawCandidates.length > 0 && candidates.length > 0) {
      const originalTop = rawCandidates[0];
      const newTop = candidates[0];
      if (originalTop && newTop && originalTop.code !== newTop.code) {
        logger.info(`[CLASSIFY] Reranking changed top result: ${originalTop.code} (Ch.${originalTop.chapter}) → ${newTop.code} (Ch.${newTop.chapter})`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 9.4: Apply context boosts BEFORE confidence analysis
    // This ensures medicine/spice/silk context clues affect chapter ranking
    // ═══════════════════════════════════════════════════════════════════════════
    candidates = applyContextBoostsToCandidates(candidates, query);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2B: RULE ENGINE INTEGRATION
    // Apply database-driven rules for chapter exclusions and boosts
    // ═══════════════════════════════════════════════════════════════════════════
    let ruleIntegrationResult: IntegrationResult | null = null;
    try {
      ruleIntegrationResult = await ruleIntegration.integrate(query, candidates);

      // Use filtered and boosted candidates from rule engine
      if (ruleIntegrationResult.boostedCandidates.length > 0) {
        candidates = ruleIntegrationResult.boostedCandidates;
        logger.info(`[CLASSIFY] Rule engine: ${ruleIntegrationResult.ruleResult.appliedRules.length} rules applied, ${ruleIntegrationResult.filterResult.removedCount} candidates filtered`);
      }
    } catch (ruleError) {
      logger.warn(`[CLASSIFY] Rule engine failed, continuing without: ${ruleError}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2C: HEADING-LEVEL BOOSTS
    // Apply heading-level adjustments for specific product categories
    // ═══════════════════════════════════════════════════════════════════════════
    candidates = applyHeadingLevelBoosts(candidates, query);

    const leafs = candidates.filter(c => c.isLeaf);
    const analysis = analyzeCandidates(leafs.length > 0 ? leafs : candidates, specificity, query);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2B: ENHANCED CONFIDENCE CHECK
    // Use rule engine confidence boost for classification decision
    // ═══════════════════════════════════════════════════════════════════════════

    // Check if rule engine provides strong confidence
    // BUG FIX: Use candidates[0] directly instead of analysis.topCandidate
    // because leaf filtering may incorrectly exclude boosted candidates (e.g., 9503.00)
    const ruleEngineTopCandidate = candidates[0];
    if (ruleIntegrationResult?.confidenceResult.shouldClassify && ruleEngineTopCandidate) {
      const enhancedConfidence = ruleIntegrationResult.confidenceResult.confidence;
      logger.info(`[CLASSIFY] Rule engine confident: ${(enhancedConfidence * 100).toFixed(1)}% - ${ruleIntegrationResult.confidenceResult.reason}`);
      logger.info(`[CLASSIFY] Using top boosted candidate: ${ruleEngineTopCandidate.code}`);

      // Generate explanation from rule engine
      const explanation = ruleIntegration.generateExplanation(ruleIntegrationResult, ruleEngineTopCandidate.code);
      const reasoningParts = [
        `"${query}" → ${ruleEngineTopCandidate.description}`,
        explanation.reasoning
      ].filter(Boolean);

      // FIX STAGE 2: Apply query specificity calibration
      const rawConfidence = Math.round(enhancedConfidence * 100);
      const calibratedConfidence = applyQuerySpecificityCalibration(rawConfidence, query);

      return {
        type: 'classification',
        code: ruleEngineTopCandidate.code,
        description: ruleEngineTopCandidate.description,
        confidence: calibratedConfidence,
        reasoning: reasoningParts.join('. '),
        alternatives: candidates.slice(1, 4).map(c => ({
          code: c.code,
          description: c.description,
          similarity: c.similarity
        }))
      };
    }

    // HIGH CONFIDENCE (original logic as fallback)
    if (analysis.confidence === 'high' && analysis.topCandidate) {
      logger.info(`[CLASSIFY] High → ${analysis.topCandidate.code}`);
      return buildResult(analysis.topCandidate, analysis.candidates.slice(1, 4), analysis.confidenceScore, query);
    }

    // HIGH SPECIFICITY PATH: Direct classification for specific product descriptions
    // Bypass multi-chapter check if there's a dominant chapter (80%+ of results)
    // PHASE 0B: Use dynamic threshold based on query word count
    const effectiveThreshold = getEffectiveThreshold(query);

    if (
      specificity.level === 'high' &&
      analysis.topCandidate &&
      analysis.topCandidate.similarity >= effectiveThreshold  // PHASE 0B: Dynamic threshold
    ) {
      // Check for dominant chapter
      const dominantCheck = getDominantChapter(candidates);

      // Allow direct classification if:
      // 1. Single chapter (original check), OR
      // 2. Dominant chapter exists (80%+ of results in same chapter)
      const canClassifyDirectly = !analysis.spanMultipleChapters || dominantCheck.hasDominant;

      if (canClassifyDirectly) {
        logger.info(`[CLASSIFY] Direct classification: high specificity (${(specificity.score * 100).toFixed(0)}%) with ${(analysis.topCandidate.similarity * 100).toFixed(1)}% similarity (threshold: ${(effectiveThreshold * 100).toFixed(0)}%)`);
        if (dominantCheck.hasDominant && analysis.spanMultipleChapters) {
          logger.info(`[CLASSIFY] Multi-chapter bypassed: Ch.${dominantCheck.dominantChapter} dominates at ${(dominantCheck.dominantPercentage * 100).toFixed(0)}%`);
        }

        // Apply query specificity calibration (now just logs, no longer caps)
        const rawConfidence = Math.round(analysis.topCandidate.similarity * 100);
        const calibratedConfidence = applyQuerySpecificityCalibration(rawConfidence, query);

        return {
          type: 'classification',
          code: analysis.topCandidate.code,
          description: analysis.topCandidate.description,
          confidence: calibratedConfidence,
          reasoning: `"${query}" → ${analysis.topCandidate.description}`,
          alternatives: candidates.slice(1, 4).map(c => ({
            code: c.code,
            description: c.description,
            similarity: c.similarity
          }))
        };
      } else {
        logger.info(`[CLASSIFY] High specificity but no dominant chapter - proceeding to questions`);
      }
    } else if (specificity.level === 'high' && analysis.topCandidate) {
      // PHASE 0B: Log when threshold not met
      logger.info(`[CLASSIFY] High specificity but similarity ${(analysis.topCandidate.similarity * 100).toFixed(1)}% below threshold ${(effectiveThreshold * 100).toFixed(0)}% - proceeding to questions`);
    }

    // MEDIUM - LLM verify
    if (analysis.confidence === 'medium' && analysis.topCandidate) {
      const llm = await llmVerify(baseQuery, analysis.candidates);
      if (llm && llm.confidence >= 0.75) {
        const match = analysis.candidates.find(c => c.code === llm.code) || analysis.topCandidate;
        return buildResult(match, analysis.candidates.filter(c => c.code !== llm.code).slice(0, 3), llm.confidence, query, llm.reasoning);
      }
    }

    // LOW - Question
    const q = await generateQuestion(query, analysis);
    if (q) return { type: 'question', question: q };

    // Fallback
    if (analysis.topCandidate) {
      const llm = await llmVerify(baseQuery, analysis.candidates);
      if (llm) {
        const match = analysis.candidates.find(c => c.code === llm.code) || analysis.topCandidate;
        return buildResult(match, [], llm.confidence * 0.8, query, llm.reasoning);
      }
    }
    return { type: 'need_more_info', message: 'Unable to classify.' };
  } catch (e) {
    logger.error(`[CLASSIFY] ${e}`);
    return { type: 'error', message: `Error: ${e instanceof Error ? e.message : 'Unknown'}` };
  }
}

async function buildResult(top: SemanticCandidate, alts: SemanticCandidate[], conf: number, query: string, extra?: string): Promise<ClassificationResult> {
  const v = await prisma.hsCode.findFirst({ where: { code: top.code }, select: { code: true, description: true } });
  const code = v?.code || top.code;
  const desc = v?.description || top.description;
  let reasoning = `"${query}" → ${desc}`;
  if (extra) reasoning += `. ${extra}`;

  const alternatives = alts.filter(a => !a.description.toLowerCase().startsWith('other')).slice(0, 3)
    .map(a => ({ code: a.code, description: a.description, similarity: a.similarity }));

  // FIX STAGE 2: Apply query specificity calibration
  const rawConfidence = Math.round(conf * 100);
  let calibratedConfidence = applyQuerySpecificityCalibration(rawConfidence, query);

  // Phase 4: Calculate coverage-aware confidence
  const heading = code.length >= 4 ? code.substring(0, 4) : code;
  const coverage = await calculateHeadingCoverage(heading);
  const coverageMultiplier = getCoverageMultiplier(coverage);

  // Apply coverage multiplier
  const preCoverageConfidence = calibratedConfidence;
  calibratedConfidence = Math.round(calibratedConfidence * coverageMultiplier.multiplier);

  logger.info(`[BUILD] Coverage-aware: ${preCoverageConfidence}% * ${coverageMultiplier.multiplier} = ${calibratedConfidence}% (${coverage.coverageLevel} coverage: ${coverage.coveragePercentage}%)`);

  // Build confidence breakdown (simplified)
  const confidenceBreakdown = {
    overall: calibratedConfidence,
    chapter: { value: Math.round(calibratedConfidence * 1.1), reason: 'Based on product category' },
    heading: { value: Math.round(calibratedConfidence * 1.05), reason: 'Based on semantic match' },
    subheading: { value: calibratedConfidence, reason: `Coverage: ${coverage.coveragePercentage}%` },
    eightDigit: { value: calibratedConfidence, reason: coverageMultiplier.reason },
  };

  return {
    type: 'classification',
    code,
    description: desc,
    confidence: calibratedConfidence,
    reasoning,
    alternatives,
    headingCoverage: {
      percentage: coverage.coveragePercentage,
      level: coverage.coverageLevel,
      multiplierApplied: coverageMultiplier.multiplier,
      reason: coverageMultiplier.reason,
    },
    confidenceBreakdown,
  };
}

// Answer Handling
export async function handleAnswer(originalQuery: string, question: ClassificationQuestion, selectedCode: string, prev: ConversationContext | null = null): Promise<ClassificationResult> {
  const opt = question.options.find(o => o.code === selectedCode);
  if (!opt) return { type: 'error', message: 'Invalid option.' };

  const ctx: ConversationContext = prev || { originalQuery, answeredQuestions: [], narrowedCandidates: [], accumulatedKeywords: [] };
  ctx.answeredQuestions.push({ questionId: question.id, attribute: question.attribute, selectedCode, selectedLabel: opt.label });
  ctx.accumulatedKeywords.push(opt.label.toLowerCase());

  if (opt.codesIncluded.length === 1) {
    const sc = opt.codesIncluded[0];
    if (sc && sc.replace(/\./g, '').length >= 8) {
      const info = await prisma.hsCode.findFirst({ where: { code: sc }, select: { code: true, description: true } });
      if (info) return { type: 'classification', code: info.code, description: info.description, confidence: 92, reasoning: `Selected: ${ctx.answeredQuestions.map(q => q.selectedLabel).join(', ')}` };
    }
  }
  return classifyProduct(originalQuery, ctx);
}

export function createConversationContext(q: string): ConversationContext {
  return { originalQuery: q, answeredQuestions: [], narrowedCandidates: [], accumulatedKeywords: [] };
}

// Legacy Format
export function convertToLegacyFormat(r: ClassificationResult): any {
  if (r.type === 'classification') {
    return { success: true, responseType: 'classification', data: {
      hsCode: r.code, description: r.description, confidence: r.confidence, reasoning: r.reasoning,
      alternatives: r.alternatives?.map(a => ({ code: a.code, description: a.description, reason: `Similar (${Math.round(a.similarity * 100)}%)` })) || []
    }};
  }
  if (r.type === 'question') {
    return { success: true, responseType: 'question', data: {
      questionContext: r.question?.reasoning,
      questions: [{ id: r.question?.id, text: r.question?.text, type: 'single', options: r.question?.options.map(o => ({ code: o.code, label: o.label, description: o.description })) || [], priority: 'high' }]
    }};
  }
  return { success: false, responseType: r.type, error: r.message };
}

export { semanticSearchCandidates as searchCandidates };

// ========================================
// PART B: Frontend Response Adapter
// ========================================

export interface FrontendResponse {
  success: boolean;
  conversationId: string;
  responseType: 'classification' | 'questions' | 'error';
  result?: {
    hsCode: string;
    description: string;
    confidence: number;
    reasoning: string;
    alternatives: Array<{ code: string; description: string; reason?: string }>;
    // Phase 4: Coverage and confidence breakdown
    headingCoverage?: {
      percentage: number;
      level: 'high' | 'medium' | 'low' | 'none';
      multiplierApplied: number;
      reason: string;
    };
    confidenceBreakdown?: {
      overall: number;
      chapter?: { value: number; reason: string };
      heading?: { value: number; reason: string };
      subheading?: { value: number; reason: string };
      eightDigit?: { value: number; reason: string };
    };
  };
  questions?: Array<{
    id: string;
    text: string;
    options: string[];
    allowOther: boolean;
    priority: 'required' | 'optional';
  }>;
  questionContext?: string;
  conversationSummary?: {
    totalQuestions: number;
    productDescription: string;
    keyDecisions: string[];
  };
  roundNumber?: number;
  totalQuestionsAsked?: number;
  timestamp: string;
  error?: string;
}

// Conversation state cache (in-memory)
const conversationCache = new Map<string, {
  productDescription: string;
  context: ConversationContext;
  roundNumber: number;
  totalQuestionsAsked: number;
  keyDecisions: string[];
  lastQuestion?: ClassificationQuestion;
}>();

export function adaptForFrontend(
  result: ClassificationResult,
  conversationId: string,
  productDescription: string,
  roundNumber: number = 1,
  totalQuestionsAsked: number = 0,
  keyDecisions: string[] = []
): FrontendResponse {
  const timestamp = new Date().toISOString();

  // Handle classification result
  if (result.type === 'classification') {
    return {
      success: true,
      conversationId,
      responseType: 'classification',
      result: {
        hsCode: result.code || '',
        description: result.description || '',
        confidence: result.confidence || 0,
        reasoning: result.reasoning || '',
        alternatives: (result.alternatives || []).map(alt => ({
          code: alt.code,
          description: alt.description,
          reason: `Similarity: ${Math.round((alt.similarity || 0) * 100)}%`
        })),
        // Phase 4: Include coverage and breakdown in response
        headingCoverage: result.headingCoverage,
        confidenceBreakdown: result.confidenceBreakdown,
      },
      conversationSummary: {
        totalQuestions: totalQuestionsAsked,
        productDescription,
        keyDecisions
      },
      timestamp
    };
  }

  // Handle question result
  if (result.type === 'question' && result.question) {
    // Convert question options from objects to "CODE::Label" strings
    const stringOptions = result.question.options.map(opt =>
      `${opt.code}::${opt.label}`
    );

    return {
      success: true,
      conversationId,
      responseType: 'questions',
      questions: [{
        id: result.question.id,
        text: result.question.text,
        options: stringOptions,
        allowOther: false,
        priority: 'required'
      }],
      questionContext: result.question.reasoning,
      roundNumber,
      totalQuestionsAsked,
      timestamp
    };
  }

  // Handle need_more_info
  if (result.type === 'need_more_info') {
    return {
      success: false,
      conversationId,
      responseType: 'error',
      error: result.message || 'Please provide more details about your product.',
      timestamp
    };
  }

  // Handle error
  return {
    success: false,
    conversationId,
    responseType: 'error',
    error: result.message || 'Classification failed',
    timestamp
  };
}

export async function classifyWithSemanticSearch(request: {
  productDescription: string;
  sessionId?: string;
  conversationId?: string;
  answers?: Record<string, string>;
}): Promise<FrontendResponse> {
  const { productDescription, conversationId, answers } = request;

  // Generate or use existing conversation ID
  const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Check if this is a continuation (answer to previous question)
    if (conversationId && answers && conversationCache.has(conversationId)) {
      const cached = conversationCache.get(conversationId)!;

      // Get the answer from the answers object
      const lastQuestion = cached.lastQuestion;
      if (lastQuestion) {
        const answerKeys = Object.keys(answers);
        const answerKey = answerKeys.find(k => k === lastQuestion.id) || answerKeys[0];
        const selectedValue = answerKey ? answers[answerKey] : undefined;

        if (selectedValue) {
          // Extract just the code part if it's in "CODE::Label" format
          const code = selectedValue.includes('::')
            ? selectedValue.split('::')[0]
            : selectedValue;

          // Record the decision
          const selectedOption = lastQuestion.options.find(o => o.code === code);
          if (selectedOption) {
            cached.keyDecisions.push(`${lastQuestion.attribute}: ${selectedOption.label}`);
          }

          // Handle the answer
          const result = await handleAnswer(
            cached.productDescription,
            lastQuestion,
            code ?? '',
            cached.context
          );

          cached.totalQuestionsAsked++;
          cached.roundNumber++;

          // If result is another question, cache it
          if (result.type === 'question' && result.question) {
            cached.lastQuestion = result.question;
            conversationCache.set(conversationId, cached);
          } else {
            // Classification complete, cleanup
            conversationCache.delete(conversationId);
          }

          return adaptForFrontend(
            result,
            conversationId,
            cached.productDescription,
            cached.roundNumber,
            cached.totalQuestionsAsked,
            cached.keyDecisions
          );
        }
      }
    }

    // New classification request
    const context = createConversationContext(productDescription);
    const result = await classifyProduct(productDescription, context);

    // Cache conversation state if it's a question
    if (result.type === 'question' && result.question) {
      conversationCache.set(convId, {
        productDescription,
        context,
        roundNumber: 1,
        totalQuestionsAsked: 1,
        keyDecisions: [],
        lastQuestion: result.question
      });
    }

    return adaptForFrontend(
      result,
      convId,
      productDescription,
      1,
      result.type === 'question' ? 1 : 0,
      []
    );

  } catch (error) {
    logger.error(`[SEMANTIC-CLASSIFY] Error: ${error}`);
    return {
      success: false,
      conversationId: convId,
      responseType: 'error',
      error: error instanceof Error ? error.message : 'Classification failed',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * PHASE 2: Chapter Predictor Service
 *
 * Predicts likely HS code chapters based on product description keywords.
 * Uses a combination of:
 * 1. Functional overrides (function > material) - CHECKED FIRST
 * 2. Keyword trigger matching
 * 3. Confidence scoring
 * 4. Ambiguity detection
 *
 * CRITICAL: This service solves the "brake pads" problem where initial search
 * returns wrong chapters (cosmetic pads, sanitary pads) instead of vehicle parts.
 */

import * as fs from 'fs';
import * as path from 'path';

// ========================================
// Types
// ========================================

interface ChapterConfig {
  name: string;
  include: string[];
  exclude: string[];
  priority: number;
  notes?: string;
}

interface FunctionalOverride {
  keywords: string[];
  forceChapter: string;
  reason: string;
}

interface AmbiguousTerm {
  possibleChapters: string[];
  disambiguationQuestion: string;
  options: { label: string; chapter: string }[];
}

export interface ChapterPrediction {
  chapter: string;
  name: string;
  confidence: number;
  matchedKeywords: string[];
  reason: string;
}

export interface PredictionResult {
  predictions: ChapterPrediction[];
  isAmbiguous: boolean;
  ambiguityInfo?: {
    term: string;
    question: string;
    options: { label: string; chapter: string }[];
  };
  functionalOverride?: {
    chapter: string;
    reason: string;
  };
}

interface ChapterTriggersData {
  metadata: {
    version: string;
    lastUpdated: string;
    description: string;
  };
  chapters: Record<string, ChapterConfig>;
  functionalOverrides: {
    description: string;
    rules: FunctionalOverride[];
  };
  ambiguousTerms: {
    description: string;
    terms: Record<string, AmbiguousTerm>;
  };
}

// ========================================
// Data Loading (Singleton Pattern)
// ========================================

let chapterData: ChapterTriggersData | null = null;

function loadChapterData(): ChapterTriggersData {
  if (chapterData) return chapterData;

  try {
    const dataPath = path.join(__dirname, '../data/chapter-triggers.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    chapterData = JSON.parse(rawData) as ChapterTriggersData;
    console.log('[PHASE 2] Chapter triggers data loaded successfully');
    return chapterData;
  } catch (error) {
    console.error('[PHASE 2] Failed to load chapter-triggers.json:', error);
    // Return minimal fallback data
    chapterData = {
      metadata: { version: '0.0.0', lastUpdated: '', description: 'Fallback' },
      chapters: {},
      functionalOverrides: { description: '', rules: [] },
      ambiguousTerms: { description: '', terms: {} }
    };
    return chapterData;
  }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Normalize query for matching
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Check if query contains any of the keywords
 * Uses multiple matching strategies:
 * 1. Exact phrase match (for multi-word keywords like "brake pads")
 * 2. Word boundary match (for single words)
 */
function matchesKeywords(query: string, keywords: string[]): string[] {
  const normalizedQuery = normalizeQuery(query);
  const matches: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();

    // PHASE 2: Multi-word phrase matching (e.g., "brake pads")
    if (normalizedKeyword.includes(' ')) {
      // For multi-word keywords, check if the phrase exists
      if (normalizedQuery.includes(normalizedKeyword)) {
        matches.push(keyword);
        continue;
      }
    }

    // Single word: Use word boundary matching
    // This prevents "tea" from matching "steam" or "teats"
    const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    if (regex.test(normalizedQuery)) {
      matches.push(keyword);
    }
  }

  return matches;
}

// ========================================
// Core Functions
// ========================================

/**
 * PHASE 2: Check for functional overrides (function > material)
 * This is the MOST IMPORTANT check - must run FIRST before any search
 *
 * Examples:
 * - "brake pads for cars" → force Chapter 87 (vehicle parts)
 * - "ceramic brake pads" → force Chapter 87 (NOT ceramics Ch.69)
 * - "plastic toys" → force Chapter 95 (NOT plastics Ch.39)
 */
export function checkFunctionalOverrides(query: string): FunctionalOverride | null {
  const data = loadChapterData();
  const normalizedQuery = normalizeQuery(query);

  console.log(`[PHASE 2] Checking functional overrides for: "${query}"`);

  for (const rule of data.functionalOverrides.rules) {
    const matches = matchesKeywords(normalizedQuery, rule.keywords);
    if (matches.length > 0) {
      console.log(`[PHASE 2] FUNCTIONAL OVERRIDE MATCHED!`);
      console.log(`[PHASE 2]   Keywords matched: ${matches.join(', ')}`);
      console.log(`[PHASE 2]   Forcing Chapter: ${rule.forceChapter}`);
      console.log(`[PHASE 2]   Reason: ${rule.reason}`);
      return rule;
    }
  }

  console.log(`[PHASE 2] No functional override applies`);
  return null;
}

/**
 * PHASE 2: Quick check if functional override exists
 */
export function hasFunctionalOverride(query: string): boolean {
  return checkFunctionalOverrides(query) !== null;
}

/**
 * PHASE 2: Get the chapter from functional override (if any)
 */
export function getFunctionalOverrideChapter(query: string): string | null {
  const override = checkFunctionalOverrides(query);
  return override?.forceChapter || null;
}

/**
 * SMART DISAMBIGUATION: Product-specific patterns that resolve ambiguity
 * These are checked BEFORE the generic disambiguation logic
 */
const SMART_DISAMBIGUATION: Record<string, {
  clearIndicators: { pattern: RegExp; chapter: string; reason: string }[];
}> = {
  'coffee': {
    clearIndicators: [
      // Chapter 09 indicators (raw/roasted coffee beans)
      { pattern: /\barabica\b/i, chapter: '09', reason: 'Arabica variety specified' },
      { pattern: /\brobusta\b/i, chapter: '09', reason: 'Robusta variety specified' },
      { pattern: /\brob\b/i, chapter: '09', reason: 'Rob (Robusta) variety specified' },
      { pattern: /\bnot\s*roasted\b/i, chapter: '09', reason: 'Not roasted = raw beans' },
      { pattern: /\bunroasted\b/i, chapter: '09', reason: 'Unroasted = raw beans' },
      { pattern: /\bgreen\s*coffee\b/i, chapter: '09', reason: 'Green coffee = raw beans' },
      { pattern: /\braw\s*coffee\b/i, chapter: '09', reason: 'Raw coffee = beans' },
      { pattern: /\broasted\b(?!\s*(instant|soluble|extract))/i, chapter: '09', reason: 'Roasted coffee' },
      { pattern: /\bcoffee\s*bean[s]?\b/i, chapter: '09', reason: 'Coffee beans' },
      { pattern: /\bplantation\b/i, chapter: '09', reason: 'Plantation grade = raw beans' },
      { pattern: /\bgrade\s*[a-c]\b/i, chapter: '09', reason: 'Grade specification = raw beans' },
      { pattern: /\b[a-c]\s*grade\b/i, chapter: '09', reason: 'Grade specification = raw beans' },
      { pattern: /\bparchment\b/i, chapter: '09', reason: 'Parchment processing = raw beans' },
      { pattern: /\bcherry\b/i, chapter: '09', reason: 'Cherry processing = raw beans' },
      { pattern: /\bhusk[s]?\b/i, chapter: '09', reason: 'Coffee husks = Ch.09' },
      { pattern: /\bskin[s]?\b/i, chapter: '09', reason: 'Coffee skins = Ch.09' },
      { pattern: /\bdecaf(feinated)?\b(?!\s*instant)/i, chapter: '09', reason: 'Decaffeinated beans' },

      // Chapter 21 indicators (instant/extract/preparations)
      { pattern: /\binstant\b/i, chapter: '21', reason: 'Instant coffee' },
      { pattern: /\bsoluble\b/i, chapter: '21', reason: 'Soluble coffee' },
      { pattern: /\bextract\b/i, chapter: '21', reason: 'Coffee extract' },
      { pattern: /\bessence\b/i, chapter: '21', reason: 'Coffee essence' },
      { pattern: /\bconcentrate\b/i, chapter: '21', reason: 'Coffee concentrate' },
      { pattern: /\b3[- ]?in[- ]?1\b/i, chapter: '21', reason: '3-in-1 coffee mix' },
      { pattern: /\bcoffee\s*mix\b/i, chapter: '21', reason: 'Coffee mix' },
    ]
  },
  'tea': {
    clearIndicators: [
      // Chapter 09 indicators (tea leaves)
      { pattern: /\bgreen\s*tea\b/i, chapter: '09', reason: 'Green tea leaves' },
      { pattern: /\bblack\s*tea\b/i, chapter: '09', reason: 'Black tea leaves' },
      { pattern: /\boolong\b/i, chapter: '09', reason: 'Oolong tea leaves' },
      { pattern: /\bwhite\s*tea\b/i, chapter: '09', reason: 'White tea leaves' },
      { pattern: /\btea\s*lea(f|ves)\b/i, chapter: '09', reason: 'Tea leaves' },

      // Chapter 21 indicators (instant/extract)
      { pattern: /\binstant\s*tea\b/i, chapter: '21', reason: 'Instant tea' },
      { pattern: /\btea\s*extract\b/i, chapter: '21', reason: 'Tea extract' },
    ]
  },
  'coffee powder': {
    clearIndicators: [
      // Ground roasted = Ch.09
      { pattern: /\bground\b.*\broasted\b/i, chapter: '09', reason: 'Ground roasted coffee' },
      { pattern: /\broasted\b.*\bground\b/i, chapter: '09', reason: 'Roasted ground coffee' },
      // Instant = Ch.21
      { pattern: /\binstant\b/i, chapter: '21', reason: 'Instant coffee powder' },
      { pattern: /\bsoluble\b/i, chapter: '21', reason: 'Soluble coffee powder' },
    ]
  }
};

/**
 * PHASE 2: Check for ambiguous terms that need user disambiguation
 * Returns info for generating a question BEFORE searching
 *
 * ENHANCED: Now checks for SMART disambiguation patterns first
 */
export function checkAmbiguousTerms(query: string): { term: string; info: AmbiguousTerm } | null {
  const data = loadChapterData();
  const normalizedQuery = normalizeQuery(query);

  console.log(`[PHASE 2] Checking ambiguous terms for: "${query}"`);

  for (const [term, info] of Object.entries(data.ambiguousTerms.terms)) {
    // Check if the ambiguous term is present in the query
    const termLower = term.toLowerCase();

    // Use word boundary matching for single words
    const escapedTerm = termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const termRegex = new RegExp(`\\b${escapedTerm}\\b`, 'i');

    if (!termRegex.test(normalizedQuery)) {
      continue; // Term not present
    }

    console.log(`[PHASE 2] Found ambiguous term: "${term}"`);

    // ========================================
    // SMART DISAMBIGUATION: Check product-specific patterns FIRST
    // ========================================
    const smartPatterns = SMART_DISAMBIGUATION[termLower];
    if (smartPatterns) {
      for (const indicator of smartPatterns.clearIndicators) {
        if (indicator.pattern.test(query)) {
          console.log(`[PHASE 2] SMART DISAMBIGUATED: "${indicator.reason}" → Ch.${indicator.chapter}`);
          return null;  // No ambiguity - clear indicator found
        }
      }
    }

    // ========================================
    // LEGACY: Generic disambiguation check
    // ========================================
    let hasDisambiguation = false;

    for (const chapter of info.possibleChapters) {
      const chapterConfig = data.chapters[chapter];
      if (!chapterConfig) continue;

      // Check if include keywords (beyond the ambiguous term itself) are present
      const otherIncludes = chapterConfig.include.filter(kw =>
        kw.toLowerCase() !== termLower &&
        !termLower.includes(kw.toLowerCase()) &&
        !kw.toLowerCase().includes(termLower)
      );

      const includeMatches = matchesKeywords(normalizedQuery, otherIncludes);

      // If we have strong include matches, the query is already disambiguated
      if (includeMatches.length >= 1) {
        console.log(`[PHASE 2] Disambiguated by keyword "${includeMatches[0]}" → Ch.${chapter}`);
        hasDisambiguation = true;
        break;
      }

      // Also check exclude keywords - if present, it's disambiguated to another chapter
      const excludeMatches = matchesKeywords(normalizedQuery, chapterConfig.exclude);
      if (excludeMatches.length > 0) {
        console.log(`[PHASE 2] Disambiguated by exclusion "${excludeMatches[0]}" (not Ch.${chapter})`);
        hasDisambiguation = true;
        break;
      }
    }

    if (!hasDisambiguation) {
      console.log(`[PHASE 2] AMBIGUOUS - Need to ask user`);
      console.log(`[PHASE 2]   Question: ${info.disambiguationQuestion}`);
      return { term, info };
    }
  }

  console.log(`[PHASE 2] No ambiguous terms found`);
  return null;
}

/**
 * Get the resolved chapter when smart disambiguation succeeds
 * Returns the chapter code or null if no clear indicator
 */
export function getSmartDisambiguatedChapter(query: string): { chapter: string; reason: string } | null {
  const normalizedQuery = normalizeQuery(query);

  for (const [term, patterns] of Object.entries(SMART_DISAMBIGUATION)) {
    // Check if the term is in the query
    const termRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!termRegex.test(normalizedQuery)) continue;

    for (const indicator of patterns.clearIndicators) {
      if (indicator.pattern.test(query)) {
        console.log(`[PHASE 2] Smart disambiguation: "${indicator.reason}" → Ch.${indicator.chapter}`);
        return { chapter: indicator.chapter, reason: indicator.reason };
      }
    }
  }

  return null;
}

/**
 * Calculate chapter scores based on keyword matches
 */
function calculateChapterScores(query: string): Map<string, { score: number; matches: string[]; excludes: string[] }> {
  const data = loadChapterData();
  const scores = new Map<string, { score: number; matches: string[]; excludes: string[] }>();
  const normalizedQuery = normalizeQuery(query);

  for (const [chapter, config] of Object.entries(data.chapters)) {
    const includeMatches = matchesKeywords(normalizedQuery, config.include);
    const excludeMatches = matchesKeywords(normalizedQuery, config.exclude);

    if (includeMatches.length > 0) {
      // Base score from number of matches
      let score = includeMatches.length * 20;

      // Apply priority multiplier (higher priority = stronger match)
      score *= (config.priority / 5);

      // Heavy penalty for exclude matches
      score -= excludeMatches.length * 30;

      // Bonus for longer/more specific (multi-word) matches
      for (const match of includeMatches) {
        if (match.split(' ').length > 1) {
          score += 15; // Significant bonus for phrase matches
        }
      }

      if (score > 0) {
        scores.set(chapter, {
          score,
          matches: includeMatches,
          excludes: excludeMatches
        });
      }
    }
  }

  return scores;
}

/**
 * PHASE 2: Main prediction function
 * Returns predicted chapters with confidence and ambiguity detection
 */
export function predictChapters(query: string): PredictionResult {
  const data = loadChapterData();

  console.log(`[PHASE 2] Predicting chapters for: "${query}"`);

  // STEP 1: Check for functional overrides FIRST (highest priority)
  const functionalOverride = checkFunctionalOverrides(query);
  if (functionalOverride) {
    const chapter = functionalOverride.forceChapter;
    const chapterConfig = data.chapters[chapter];

    return {
      predictions: [{
        chapter,
        name: chapterConfig?.name || `Chapter ${chapter}`,
        confidence: 0.95, // High confidence for functional overrides
        matchedKeywords: matchesKeywords(query, functionalOverride.keywords),
        reason: functionalOverride.reason
      }],
      isAmbiguous: false,
      functionalOverride: {
        chapter,
        reason: functionalOverride.reason
      }
    };
  }

  // STEP 2: Check for ambiguous terms
  const ambiguity = checkAmbiguousTerms(query);

  // STEP 3: Calculate chapter scores from keyword matching
  const scores = calculateChapterScores(query);

  // Convert to sorted predictions
  const predictions: ChapterPrediction[] = [];
  let totalScore = 0;

  scores.forEach((data, chapter) => {
    totalScore += data.score;
  });

  scores.forEach((scoreData, chapter) => {
    const chapterConfig = data.chapters[chapter];
    predictions.push({
      chapter,
      name: chapterConfig?.name || `Chapter ${chapter}`,
      confidence: totalScore > 0 ? scoreData.score / totalScore : 0,
      matchedKeywords: scoreData.matches,
      reason: scoreData.excludes.length > 0
        ? `Matched: ${scoreData.matches.join(', ')}. Excluded: ${scoreData.excludes.join(', ')}`
        : `Matched: ${scoreData.matches.join(', ')}`
    });
  });

  // Sort by confidence descending
  predictions.sort((a, b) => b.confidence - a.confidence);

  // Normalize confidence scores to max of 0.99
  if (predictions.length > 0) {
    const firstPrediction = predictions[0];
    if (firstPrediction && firstPrediction.confidence > 0) {
      const maxConfidence = firstPrediction.confidence;
      predictions.forEach(p => {
        p.confidence = Math.min(0.99, p.confidence / maxConfidence);
      });
    }
  }

  // Log predictions
  console.log(`[PHASE 2] Predictions:`);
  predictions.slice(0, 3).forEach((p, i) => {
    console.log(`[PHASE 2]   ${i + 1}. Ch.${p.chapter} (${p.name}): ${(p.confidence * 100).toFixed(1)}%`);
    console.log(`[PHASE 2]      Matched: ${p.matchedKeywords.join(', ')}`);
  });

  // Determine if ambiguous (top 2 chapters within 15% of each other OR known ambiguous term)
  let isAmbiguous = false;
  if (predictions.length >= 2) {
    const first = predictions[0];
    const second = predictions[1];
    if (first && second) {
      const gap = first.confidence - second.confidence;
      if (gap < 0.15) {
        isAmbiguous = true;
        console.log(`[PHASE 2] AMBIGUOUS: Top 2 predictions within 15% confidence`);
      }
    }
  }

  // If we detected a specific ambiguous term, use that info
  if (ambiguity) {
    return {
      predictions,
      isAmbiguous: true,
      ambiguityInfo: {
        term: ambiguity.term,
        question: ambiguity.info.disambiguationQuestion,
        options: ambiguity.info.options
      }
    };
  }

  return {
    predictions,
    isAmbiguous
  };
}

/**
 * PHASE 2: Get confidence boost for a code based on chapter predictions
 * Used by multi-candidate-search to boost/penalize candidate scores
 *
 * @param code - The HS code to check
 * @param predictions - Array of chapter predictions
 * @param query - Original query (for functional override check)
 * @returns Boost value to add to candidate score
 */
export function calculateChapterBoost(
  code: string,
  predictions: ChapterPrediction[],
  query: string
): number {
  const codeChapter = code.substring(0, 2);

  // PHASE 2: CRITICAL - Check for functional override
  // If active, give MASSIVE boost to correct chapter, MASSIVE penalty to others
  const functionalOverride = checkFunctionalOverrides(query);
  if (functionalOverride) {
    if (codeChapter === functionalOverride.forceChapter) {
      // Correct chapter gets +30 boost
      return 30;
    } else {
      // Wrong chapter gets -20 penalty
      return -20;
    }
  }

  // Standard chapter boost based on predictions
  for (let i = 0; i < predictions.length; i++) {
    const prediction = predictions[i];
    if (prediction && prediction.chapter === codeChapter) {
      // Top prediction gets +15, second gets +10, third gets +5, etc.
      const boost = Math.max(0, 15 - (i * 5));
      return boost * prediction.confidence;
    }
  }

  // Code's chapter not in predictions = small penalty
  return -5;
}

/**
 * PHASE 2: Get predicted chapters as simple string array
 * For backward compatibility with existing code
 */
export function getPredictedChaptersArray(query: string): string[] {
  const result = predictChapters(query);
  return result.predictions.map(p => p.chapter);
}

/**
 * Debug function to explain predictions
 */
export function explainChapterPredictions(query: string): string {
  const result = predictChapters(query);

  let explanation = `Query: "${query}"\n\n`;

  if (result.functionalOverride) {
    explanation += `FUNCTIONAL OVERRIDE APPLIED\n`;
    explanation += `   Chapter: ${result.functionalOverride.chapter}\n`;
    explanation += `   Reason: ${result.functionalOverride.reason}\n\n`;
  }

  if (result.isAmbiguous && result.ambiguityInfo) {
    explanation += `AMBIGUOUS TERM DETECTED: "${result.ambiguityInfo.term}"\n`;
    explanation += `   Question: ${result.ambiguityInfo.question}\n`;
    explanation += `   Options:\n`;
    for (const opt of result.ambiguityInfo.options) {
      explanation += `     - ${opt.label} -> Ch.${opt.chapter}\n`;
    }
    explanation += '\n';
  }

  explanation += `CHAPTER PREDICTIONS:\n`;
  for (const pred of result.predictions.slice(0, 5)) {
    explanation += `   Ch.${pred.chapter} (${pred.name}): ${(pred.confidence * 100).toFixed(1)}%\n`;
    explanation += `      Matched: ${pred.matchedKeywords.join(', ')}\n`;
  }

  return explanation;
}

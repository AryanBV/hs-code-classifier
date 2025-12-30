import { prisma } from '../utils/prisma';
import { distance as levenshtein } from 'fastest-levenshtein';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { calculateEnhancedScore, extractMeaningfulTerms } from './candidate-scoring.service';
import { parseQuery, calculateContextBoost } from './query-parser.service';
// PHASE 2: Import chapter predictor for functional overrides and chapter prediction
import {
  predictChapters,
  checkFunctionalOverrides,
  calculateChapterBoost,
  getPredictedChaptersArray,
  ChapterPrediction
} from './chapter-predictor.service';
// PHASE 3: Import elimination service for filtering candidates
import { filterCandidatesByElimination, extractModifiersFromText } from './elimination.service';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface Candidate {
  code: string;
  score: number;
  matchType: string;
  description?: string;
  source: 'fuzzy' | 'semantic' | 'combined';
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance normalized by length
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshtein(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

/**
 * Find best fuzzy matches for a query word against a list of target words
 */
function findBestFuzzyMatches(queryWord: string, targetWords: string[], threshold: number = 0.75): string[] {
  const matches: { word: string; score: number }[] = [];

  for (const target of targetWords) {
    const score = calculateSimilarity(queryWord, target);
    if (score >= threshold) {
      matches.push({ word: target, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, 5).map(m => m.word);
}

/**
 * Enhanced fuzzy keyword search returning TOP N candidates
 * @param query - User search query
 * @param limit - Maximum number of candidates to return (default: 50)
 * @returns Array of candidates sorted by score
 */
export async function fuzzyKeywordSearchMulti(query: string, limit: number = 50): Promise<Candidate[]> {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (queryWords.length === 0) return [];

  try {
    // Get all HS codes with their searchable text
    const allCodes = await prisma.hsCode.findMany({
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    const results: { code: string; score: number; matchType: string; description: string }[] = [];

    for (const hsCode of allCodes) {
      let score = 0;
      let matchType = 'none';

      // Collect all searchable terms
      const searchTerms = [
        ...(hsCode.keywords || []),
        ...(hsCode.commonProducts || []),
        ...(hsCode.synonyms || []),
        ...hsCode.description.toLowerCase().split(/\s+/)
      ].filter(term => term.length > 2);

      // Check each query word against search terms
      for (const queryWord of queryWords) {
        // Exact match check (highest priority)
        const exactMatch = searchTerms.find(term =>
          term.toLowerCase() === queryWord.toLowerCase()
        );

        if (exactMatch) {
          score += 10;
          matchType = 'exact';
          continue;
        }

        // Partial match check
        const partialMatch = searchTerms.find(term =>
          term.toLowerCase().includes(queryWord.toLowerCase()) ||
          queryWord.toLowerCase().includes(term.toLowerCase())
        );

        if (partialMatch) {
          score += 5;
          if (matchType !== 'exact') matchType = 'partial';
          continue;
        }

        // Fuzzy match check (for typos)
        const fuzzyMatches = findBestFuzzyMatches(queryWord, searchTerms, 0.75);

        if (fuzzyMatches.length > 0) {
          score += 3;
          if (matchType === 'none') matchType = 'fuzzy';
        }
      }

      if (score > 0) {
        results.push({
          code: hsCode.code,
          score,
          matchType,
          description: hsCode.description
        });
      }
    }

    // Sort by score descending and return top N
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => ({
      code: r.code,
      score: r.score,
      matchType: r.matchType,
      description: r.description,
      source: 'fuzzy' as const
    }));

  } catch (error) {
    console.error('Fuzzy search error:', error);
    return [];
  }
}

/**
 * Semantic search returning TOP N candidates using vector similarity
 * ENHANCED with keyword matching, query context, and chapter prediction
 * CRITICAL FIX: Two-pass search to ensure predicted chapter codes are included
 * PHASE 2: Now checks for functional overrides FIRST to scope search
 * @param query - User search query
 * @param limit - Maximum number of candidates to return (default: 50)
 * @returns Array of candidates sorted by enhanced score
 */
export async function semanticSearchMulti(query: string, limit: number = 50): Promise<Candidate[]> {
  try {
    // PHASE 2: Check functional overrides FIRST
    // This ensures "brake pads for cars" searches Chapter 87, not all chapters
    const functionalOverride = checkFunctionalOverrides(query);
    const forceChapter = functionalOverride?.forceChapter || null;

    if (forceChapter) {
      console.log(`[PHASE 2] Functional override active: Forcing search to Chapter ${forceChapter}`);
      console.log(`[PHASE 2] Reason: ${functionalOverride?.reason}`);
    }

    // Generate embedding for query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0]?.embedding;
    if (!queryEmbedding) return [];

    // Parse query for context-aware scoring
    const queryAnalysis = parseQuery(query);
    // PHASE 2: Get predicted chapters as array for backward compatibility
    const predictedChapters = getPredictedChaptersArray(query);
    // PHASE 2: Get full prediction result for chapter boost calculation
    const chapterPrediction = predictChapters(query);

    // Set HNSW ef_search parameter for accurate search
    await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

    // PHASE 2: PASS 1 - Semantic search (scoped to forced chapter if functional override active)
    let globalResults: any[];

    if (forceChapter) {
      // PHASE 2: Search ONLY within the forced chapter
      // This is CRITICAL for "brake pads for cars" - ensures we only get Ch.87 codes
      const chapterPattern = `${forceChapter}%`;
      console.log(`[PHASE 2] Searching only within Chapter ${forceChapter}`);

      globalResults = await prisma.$queryRaw`
        SELECT
          code,
          description,
          keywords,
          common_products as "commonProducts",
          synonyms,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM hs_codes
        WHERE embedding IS NOT NULL
          AND code LIKE ${chapterPattern}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `;
      console.log(`[PHASE 2] Found ${globalResults.length} codes from Chapter ${forceChapter}`);
    } else {
      // No functional override - search all chapters
      globalResults = await prisma.$queryRaw`
        SELECT
          code,
          description,
          keywords,
          common_products as "commonProducts",
          synonyms,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM hs_codes
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `;
    }

    // PASS 2: Chapter-specific semantic search for predicted chapters (ENHANCED)
    // This ensures codes from the correct chapter are included even if semantic score is lower
    // PHASE 2: Skip if functional override is active (we already searched that chapter exclusively)
    let chapterResults: any[] = [];
    if (predictedChapters.length > 0 && !forceChapter) {
      // Search within top predicted chapter - get MORE results (limit instead of limit/2)
      const topChapter = predictedChapters[0];
      const chapterPattern = `${topChapter}%`;

      chapterResults = await prisma.$queryRaw`
        SELECT
          code,
          description,
          keywords,
          common_products as "commonProducts",
          synonyms,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM hs_codes
        WHERE embedding IS NOT NULL
          AND code LIKE ${chapterPattern}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `;

      // If we have a second predicted chapter, search it too
      if (predictedChapters.length > 1) {
        const secondChapter = predictedChapters[1];
        const secondPattern = `${secondChapter}%`;

        const secondResults: any[] = await prisma.$queryRaw`
          SELECT
            code,
            description,
            keywords,
            common_products as "commonProducts",
            synonyms,
            1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
          FROM hs_codes
          WHERE embedding IS NOT NULL
            AND code LIKE ${secondPattern}
          ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
          LIMIT ${Math.floor(limit / 2)}
        `;

        chapterResults = [...chapterResults, ...secondResults];
      }
    }

    // PASS 3: Keyword-based search within predicted chapters (NEW - ensures exact keyword matches)
    // This is critical for functional products where semantic search might miss exact matches
    // PHASE 2: Use forceChapter if functional override is active
    let keywordResults: any[] = [];
    const keywordSearchChapter = forceChapter || (predictedChapters.length > 0 ? predictedChapters[0] : null);
    if (keywordSearchChapter) {
      const queryTerms = extractMeaningfulTerms(query);
      const topChapter = keywordSearchChapter;
      const chapterPattern = `${topChapter}%`;

      if (queryTerms.length > 0) {
        // Build search conditions for each query term
        // Search in description, keywords array, common_products array, and synonyms array
        const searchConditions: string[] = [];
        const searchParams: any[] = [chapterPattern];

        for (const term of queryTerms) {
          const termPattern = `%${term.toLowerCase()}%`;
          searchParams.push(termPattern);
          const paramIndex = searchParams.length;
          
          searchConditions.push(`
            LOWER(description) LIKE $${paramIndex} OR
            EXISTS (SELECT 1 FROM unnest(keywords) AS kw WHERE LOWER(kw::text) LIKE $${paramIndex}) OR
            EXISTS (SELECT 1 FROM unnest(common_products) AS cp WHERE LOWER(cp::text) LIKE $${paramIndex}) OR
            EXISTS (SELECT 1 FROM unnest(synonyms) AS syn WHERE LOWER(syn::text) LIKE $${paramIndex})
          `);
        }

        // Use Prisma's findMany with raw SQL for complex array searches
        // First try: search for codes matching any query term
        try {
          const allCodesInChapter = await prisma.hsCode.findMany({
            where: {
              code: { startsWith: topChapter }
            },
            select: {
              code: true,
              description: true,
              keywords: true,
              commonProducts: true,
              synonyms: true
            },
            take: 200  // Get more codes to filter
          });

          // Filter codes that match query keywords
          const queryLower = query.toLowerCase();
          keywordResults = allCodesInChapter
            .filter(code => {
              const allText = [
                code.description,
                ...(code.keywords || []),
                ...(code.commonProducts || []),
                ...(code.synonyms || [])
              ].join(' ').toLowerCase();

              // Check if any query term matches
              return queryTerms.some(term => allText.includes(term.toLowerCase()));
            })
            .slice(0, 20)
            .map(code => ({
              code: code.code,
              description: code.description,
              keywords: code.keywords || [],
              commonProducts: code.commonProducts || [],
              synonyms: code.synonyms || [],
              similarity: 0.8  // Base similarity for keyword matches
            }));
        } catch (error) {
          console.warn('Keyword search error:', error);
          // Continue without keyword results
        }
      }
    }

    // Combine and deduplicate results
    const seenCodes = new Set<string>();
    const allResults: any[] = [];

    // Add global results first
    for (const r of globalResults) {
      if (!seenCodes.has(r.code)) {
        seenCodes.add(r.code);
        allResults.push(r);
      }
    }

    // Add chapter-specific results (these are critical for correct classification)
    for (const r of chapterResults) {
      if (!seenCodes.has(r.code)) {
        seenCodes.add(r.code);
        allResults.push(r);
      }
    }

    // Add keyword-based results (PASS 3 - ensures exact keyword matches appear)
    for (const r of keywordResults) {
      if (!seenCodes.has(r.code)) {
        seenCodes.add(r.code);
        allResults.push(r);
      }
    }

    // Apply enhanced scoring to each candidate
    const enhancedResults = allResults.map(r => {
      const semanticScore = Number(r.similarity) * 10; // Base semantic score (0-10)

      // Apply keyword matching bonus (0-15 points)
      const keywordBonus = calculateEnhancedScore(
        query,
        {
          code: r.code,
          description: r.description,
          keywords: r.keywords,
          commonProducts: r.commonProducts,
          synonyms: r.synonyms
        },
        0 // We only want the bonus, not semantic score again
      );

      // Apply query context boost (0-10 points)
      const contextBoost = calculateContextBoost(
        {
          code: r.code,
          description: r.description,
          keywords: r.keywords,
          commonProducts: r.commonProducts
        },
        queryAnalysis
      );

      // PHASE 2: Apply chapter prediction boost (dynamic: -20 to +30 points when functional override active)
      const chapterBoost = calculateChapterBoost(r.code, chapterPrediction.predictions, query);

      // Total enhanced score = semantic + keyword + context + chapter
      const totalScore = semanticScore + keywordBonus + contextBoost + chapterBoost;

      return {
        code: r.code,
        score: totalScore,
        matchType: 'semantic+keywords+context+chapter',
        description: r.description,
        source: 'semantic' as const
      };
    });

    // Sort by enhanced score and return top N
    enhancedResults.sort((a, b) => b.score - a.score);

    return enhancedResults.slice(0, limit);

  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

/**
 * Filter out noisy fuzzy matches that match only common words
 */
function filterNoisyFuzzyMatches(candidates: Candidate[], query: string): Candidate[] {
  // Common noise words that shouldn't match alone
  const commonWords = new Set(['pads', 'pad', 'for', 'the', 'and', 'with', 'other', 'parts']);

  // Extract meaningful query terms (2+ chars, not common words)
  const queryTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !commonWords.has(w));

  return candidates.filter(candidate => {
    // Keep candidates with score > 25 (likely good matches)
    if (candidate.score > 25) return true;

    // For lower scores, check if they match meaningful terms
    // or if it's just matching common noise words
    const description = (candidate.description || '').toLowerCase();

    // Count how many meaningful query terms appear in description
    const meaningfulMatches = queryTerms.filter(term => description.includes(term)).length;

    // Require at least 2 meaningful term matches for low-scoring fuzzy results
    // This filters out "shoulder pads", "mattress pads" when searching for "brake pads"
    return meaningfulMatches >= 2;
  });
}

/**
 * Combine and deduplicate candidates from multiple sources
 * IMPROVED: Prioritizes semantic search results and filters noisy fuzzy matches
 * @param fuzzyCandidates - Candidates from fuzzy search
 * @param semanticCandidates - Candidates from semantic search
 * @param limit - Maximum number of final candidates (default: 50)
 * @returns Deduplicated and ranked candidates
 */
export function combineCandidates(
  fuzzyCandidates: Candidate[],
  semanticCandidates: Candidate[],
  limit: number = 50
): Candidate[] {
  const candidateMap = new Map<string, Candidate>();

  // CRITICAL FIX: Filter out noisy fuzzy matches first
  // This prevents "shoulder pads", "mattress pads" from drowning out real results
  const filteredFuzzy = fuzzyCandidates.filter(c => {
    // Keep high-scoring fuzzy matches (>25)
    if (c.score > 25) return true;

    // For lower scores, only keep if code looks relevant (not random sports equipment, textiles, etc.)
    const code = c.code;
    const chapter = code.substring(0, 2);

    // Common automotive/industrial chapters
    const relevantChapters = ['87', '84', '68', '40', '73', '85', '86', '89'];

    // Keep if in relevant chapter OR high match type quality
    return relevantChapters.includes(chapter) || c.matchType === 'exact';
  });

  // PRIORITY 1: Add semantic candidates (these understand context better)
  // Weight semantic results heavily as they found 8708.30.00 at position 2
  for (const candidate of semanticCandidates) {
    candidateMap.set(candidate.code, {
      ...candidate,
      score: candidate.score * 1.5, // Boost semantic scores by 50%
      source: 'semantic'
    });
  }

  // PRIORITY 2: Merge filtered fuzzy candidates
  for (const candidate of filteredFuzzy) {
    const existing = candidateMap.get(candidate.code);

    if (existing) {
      // Code appears in both - combine scores
      // Give more weight to semantic (0.7) than fuzzy (0.3) since semantic understands context
      const semanticWeight = 0.7;
      const fuzzyWeight = 0.3;

      candidateMap.set(candidate.code, {
        code: candidate.code,
        score: existing.score * semanticWeight + candidate.score * fuzzyWeight,
        matchType: 'exact+semantic',
        description: existing.description || candidate.description,
        source: 'combined'
      });
    } else {
      // New candidate from fuzzy search only
      candidateMap.set(candidate.code, candidate);
    }
  }

  // Convert to array and sort by combined score WITH specificity bonus
  const combined = Array.from(candidateMap.values());

  // Helper: Check if code is 8-digit format (XXXX.XX.XX)
  const is8Digit = (code: string) => /^\d{4}\.\d{2}\.\d{2}$/.test(code);

  // Sort by score first, then by code specificity (strongly prefer 8-digit codes)
  combined.sort((a, b) => {
    // Strong boost for 8-digit codes
    const aIs8 = is8Digit(a.code);
    const bIs8 = is8Digit(b.code);

    // Apply 15% score boost for 8-digit codes
    const aScore = aIs8 ? a.score * 1.15 : a.score;
    const bScore = bIs8 ? b.score * 1.15 : b.score;

    const scoreDiff = bScore - aScore;

    // If scores are very close (within 1.0), prefer 8-digit codes
    if (Math.abs(scoreDiff) < 1.0) {
      // 8-digit codes always win
      if (aIs8 && !bIs8) return -1;
      if (!aIs8 && bIs8) return 1;

      // If both are 8-digit or both are not, prefer more specific codes
      const aSpecificity = a.code.replace(/\./g, '').length;
      const bSpecificity = b.code.replace(/\./g, '').length;
      return bSpecificity - aSpecificity;
    }

    return scoreDiff;
  });

  return combined.slice(0, limit);
}

/**
 * Main function: Get top N candidates from all search methods combined
 * PHASE 3: Now applies elimination filtering based on user-specified modifiers
 * @param query - User search query
 * @param limit - Maximum number of candidates to return (default: 50)
 * @returns Combined and deduplicated candidates
 */
export async function getTopCandidates(query: string, limit: number = 50): Promise<Candidate[]> {
  // CRITICAL DECISION: For multi-word queries (3+ words), rely primarily on semantic search
  // Fuzzy search creates too much noise for specific product queries like "ceramic brake pads for motorcycles"
  const queryWords = query.trim().split(/\s+/);

  let candidates: Candidate[];

  if (queryWords.length >= 3) {
    // Multi-word query: Use semantic search ONLY
    // Semantic search with HNSW index understands context and finds the right codes
    // This ensures 8708.30.00 appears at position 2 instead of being drowned out by noise
    candidates = await semanticSearchMulti(query, limit);
  } else {
    // For short queries (1-2 words), use combined approach
    const [fuzzyCandidates, semanticCandidates] = await Promise.all([
      fuzzyKeywordSearchMulti(query, limit),
      semanticSearchMulti(query, limit)
    ]);

    // Combine and deduplicate
    candidates = combineCandidates(fuzzyCandidates, semanticCandidates, limit);
  }

  // PHASE 3: Apply elimination filtering based on user-specified modifiers
  // This ensures "Arabica coffee" only returns Arabica codes, not Robusta
  const queryAnalysis = parseQuery(query);
  const eliminationResult = filterCandidatesByElimination(
    candidates.map(c => ({ code: c.code, description: c.description || '', score: c.score, matchType: c.matchType, source: c.source })),
    {
      productTypeModifiers: queryAnalysis.productTypeModifiers,
      modifiers: queryAnalysis.modifiers,
      originalQuery: query
    }
  );

  if (eliminationResult.eliminatedCount > 0) {
    console.log(`[PHASE 3] Elimination filter in search: ${candidates.length} -> ${eliminationResult.filteredCodes.length} candidates`);
    console.log(`[PHASE 3] Applied rules: ${eliminationResult.appliedRules.join(', ')}`);

    // Return filtered candidates with their original properties
    const filteredCodes = new Set(eliminationResult.filteredCodes.map(c => c.code));
    return candidates.filter(c => filteredCodes.has(c.code));
  }

  return candidates;
}

/**
 * Get detailed candidate information including metadata
 * @param codes - Array of HS codes to fetch details for
 * @returns Array of detailed candidate information
 */
export async function getCandidateDetails(codes: string[]): Promise<any[]> {
  try {
    const details = await prisma.hsCode.findMany({
      where: {
        code: { in: codes }
      },
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true,
        notes: true
      }
    });

    return details;
  } catch (error) {
    console.error('Error fetching candidate details:', error);
    return [];
  }
}

/**
 * ROOT CAUSE FIX: Scoped semantic search for functional overrides
 *
 * When a functional override forces a chapter (e.g., Ch.87 for "brake pads"),
 * this function performs semantic search ONLY within that chapter to find
 * the correct heading/subheading.
 *
 * This solves the problem where hierarchical navigation picks 8701 (Tractors)
 * instead of 8708 (Brakes) - because semantic search understands "brake pads"
 * matches 8708.30 (brakes and servo-brakes) much better than 8701.
 *
 * @param query - User's product description (e.g., "brake pads for cars")
 * @param chapterPrefix - The chapter to search within (e.g., "87")
 * @param limit - Maximum results to return (default: 10)
 * @returns Array of candidates within the specified chapter, sorted by semantic relevance
 */
export async function getScopedSemanticCandidates(
  query: string,
  chapterPrefix: string,
  limit: number = 10
): Promise<Candidate[]> {
  console.log(`[ROOT FIX] Running scoped semantic search in Ch.${chapterPrefix} for: "${query}"`);

  try {
    // Generate embedding for query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0]?.embedding;
    if (!queryEmbedding) {
      console.warn('[ROOT FIX] Failed to generate embedding');
      return [];
    }

    // Set HNSW ef_search parameter for accurate search
    await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

    // Semantic search scoped to the specific chapter
    const chapterPattern = `${chapterPrefix}%`;

    const scopedResults: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        keywords,
        common_products as "commonProducts",
        synonyms,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL
        AND code LIKE ${chapterPattern}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit * 3}
    `;

    console.log(`[ROOT FIX] Found ${scopedResults.length} codes from Ch.${chapterPrefix}`);

    // Parse query for context-aware scoring
    const queryAnalysis = parseQuery(query);

    // Apply enhanced scoring
    const enhancedResults = scopedResults.map(r => {
      const semanticScore = Number(r.similarity) * 10;

      // Apply keyword matching bonus
      const keywordBonus = calculateEnhancedScore(
        query,
        {
          code: r.code,
          description: r.description,
          keywords: r.keywords,
          commonProducts: r.commonProducts,
          synonyms: r.synonyms
        },
        0
      );

      // Apply query context boost
      const contextBoost = calculateContextBoost(
        {
          code: r.code,
          description: r.description,
          keywords: r.keywords,
          commonProducts: r.commonProducts
        },
        queryAnalysis
      );

      // Total score (no chapter boost needed since all are same chapter)
      const totalScore = semanticScore + keywordBonus + contextBoost;

      return {
        code: r.code,
        score: totalScore,
        matchType: 'scoped-semantic',
        description: r.description,
        source: 'semantic' as const
      };
    });

    // Sort by score and return top N
    enhancedResults.sort((a, b) => b.score - a.score);
    const topResults = enhancedResults.slice(0, limit);

    // Log top 5 results for debugging
    console.log(`[ROOT FIX] Top results from Ch.${chapterPrefix}:`);
    topResults.slice(0, 5).forEach((r, i) => {
      const shortDesc = r.description.substring(0, 60);
      console.log(`[ROOT FIX]   ${i + 1}. ${r.code}: ${shortDesc}... (score: ${r.score.toFixed(1)})`);
    });

    return topResults;

  } catch (error) {
    console.error('[ROOT FIX] Scoped semantic search error:', error);
    return [];
  }
}

/**
 * ROOT CAUSE FIX: Get the best 4-digit heading for a query within a chapter
 *
 * This is used by llm-navigator when functional override is active.
 * Instead of picking the first heading (8701 for Ch.87), it finds the
 * semantically best heading (8708 for "brake pads").
 *
 * @param query - User's product description
 * @param chapterPrefix - The chapter to search (e.g., "87")
 * @returns The best 4-digit heading code and description, or null if none found
 */
export async function getBestHeadingInChapter(
  query: string,
  chapterPrefix: string
): Promise<{ code: string; description: string; score: number } | null> {
  console.log(`[ROOT FIX] Finding best heading in Ch.${chapterPrefix} for: "${query}"`);

  // Get semantic candidates
  const candidates = await getScopedSemanticCandidates(query, chapterPrefix, 30);

  if (candidates.length === 0) {
    console.log(`[ROOT FIX] No candidates found in Ch.${chapterPrefix}`);
    return null;
  }

  // ROOT FIX: Extract 4-digit heading from each candidate
  // KEY INSIGHT: Use the HIGHEST single score for each heading, not average
  // This ensures 8708.30.00 (score 18.0) beats 8703.xx (many but lower scores)
  const headingScores = new Map<string, { maxScore: number; totalScore: number; description: string; count: number; bestCode: string }>();

  for (const candidate of candidates) {
    // Extract 4-digit heading from code (e.g., "8708.30.00" -> "8708")
    const codeNoDotsLength = candidate.code.replace(/\./g, '').length;
    let heading: string;

    if (codeNoDotsLength === 4) {
      // Already a 4-digit heading
      heading = candidate.code;
    } else if (candidate.code.includes('.')) {
      // Has dots: take first 4 digits before first dot, or first segment
      const parts = candidate.code.split('.');
      heading = parts[0] || candidate.code.substring(0, 4);
    } else {
      // No dots: take first 4 chars
      heading = candidate.code.substring(0, 4);
    }

    // Aggregate score for this heading, tracking MAXIMUM score
    const existing = headingScores.get(heading);
    if (existing) {
      existing.totalScore += candidate.score;
      existing.count += 1;
      // Update max score and best code if this candidate has higher score
      if (candidate.score > existing.maxScore) {
        existing.maxScore = candidate.score;
        existing.description = candidate.description || '';
        existing.bestCode = candidate.code;
      }
    } else {
      headingScores.set(heading, {
        maxScore: candidate.score,
        totalScore: candidate.score,
        description: candidate.description || '',
        count: 1,
        bestCode: candidate.code
      });
    }
  }

  // Find the heading with highest MAXIMUM score (not average!)
  // This ensures the heading with the single best match wins
  let bestHeading: string | null = null;
  let bestScore = 0;
  let bestDescription = '';
  let bestCode = '';

  console.log(`[ROOT FIX] Heading scores:`);
  headingScores.forEach((data, heading) => {
    // Use MAX score as primary, with small bonus for count (up to 3 points)
    // This prevents many low-scoring matches from outweighing a single high-scoring match
    const countBonus = Math.min(data.count - 1, 3) * 0.5; // Max +1.5 points for multiple matches
    const effectiveScore = data.maxScore + countBonus;

    console.log(`[ROOT FIX]   ${heading}: maxScore=${data.maxScore.toFixed(1)}, count=${data.count}, effective=${effectiveScore.toFixed(1)}`);

    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestHeading = heading;
      bestDescription = data.description;
      bestCode = data.bestCode;
    }
  });

  if (!bestHeading) {
    console.log(`[ROOT FIX] Could not determine best heading`);
    return null;
  }

  // Get the actual heading from database to get accurate description
  const headingInfo = await prisma.hsCode.findFirst({
    where: { code: bestHeading },
    select: { code: true, description: true }
  });

  const result = {
    code: headingInfo?.code || bestHeading,
    description: headingInfo?.description || bestDescription,
    score: bestScore
  };

  console.log(`[ROOT FIX] Best heading: ${result.code} - ${result.description.substring(0, 50)}...`);
  return result;
}

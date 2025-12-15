import { prisma } from '../utils/prisma';
import { distance as levenshtein } from 'fastest-levenshtein';


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
 * Check if two words are similar enough (fuzzy match)
 */
function isFuzzyMatch(word1: string, word2: string, threshold: number = 0.75): boolean {
  return calculateSimilarity(word1, word2) >= threshold;
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
 * Enhanced keyword search with fuzzy matching for typo tolerance
 */
export async function fuzzyKeywordSearch(query: string): Promise<{ code: string; score: number; matchType: string } | null> {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (queryWords.length === 0) return null;

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

    const results: { code: string; score: number; matchType: string }[] = [];

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
        results.push({ code: hsCode.code, score, matchType });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results[0] || null;

  } catch (error) {
    console.error('Fuzzy search error:', error);
    return null;
  }
}

/**
 * Spell correction: suggest corrected terms from the database
 */
export async function suggestCorrections(word: string, limit: number = 5): Promise<string[]> {
  try {
    // Get all unique terms from database
    const allCodes = await prisma.hsCode.findMany({
      select: {
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    const allTerms = new Set<string>();

    for (const code of allCodes) {
      [...(code.keywords || []), ...(code.commonProducts || []), ...(code.synonyms || [])].forEach(term => {
        if (term.length > 2) allTerms.add(term.toLowerCase());
      });
    }

    // Find closest matches
    const suggestions = findBestFuzzyMatches(word, Array.from(allTerms), 0.70);

    return suggestions.slice(0, limit);

  } catch (error) {
    console.error('Suggestion error:', error);
    return [];
  }
}

export { calculateSimilarity, isFuzzyMatch };

import { PrismaClient } from '@prisma/client';
import { distance as levenshtein } from 'fastest-levenshtein';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
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
 * @param limit - Maximum number of candidates to return (default: 10)
 * @returns Array of candidates sorted by score
 */
export async function fuzzyKeywordSearchMulti(query: string, limit: number = 10): Promise<Candidate[]> {
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
 * @param query - User search query
 * @param limit - Maximum number of candidates to return (default: 10)
 * @returns Array of candidates sorted by similarity
 */
export async function semanticSearchMulti(query: string, limit: number = 10): Promise<Candidate[]> {
  try {
    // Generate embedding for query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0]?.embedding;
    if (!queryEmbedding) return [];

    // Find most similar HS codes using cosine similarity
    const results: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `;

    return results.map(r => ({
      code: r.code,
      score: Number(r.similarity) * 10, // Normalize to 0-10 scale like fuzzy search
      matchType: 'semantic',
      description: r.description,
      source: 'semantic' as const
    }));

  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

/**
 * Combine and deduplicate candidates from multiple sources
 * @param fuzzyCandidates - Candidates from fuzzy search
 * @param semanticCandidates - Candidates from semantic search
 * @param limit - Maximum number of final candidates (default: 10)
 * @returns Deduplicated and ranked candidates
 */
export function combineCandidates(
  fuzzyCandidates: Candidate[],
  semanticCandidates: Candidate[],
  limit: number = 10
): Candidate[] {
  const candidateMap = new Map<string, Candidate>();

  // Add fuzzy candidates first (they have higher priority if exact matches)
  for (const candidate of fuzzyCandidates) {
    candidateMap.set(candidate.code, candidate);
  }

  // Merge semantic candidates, combining scores if duplicate
  for (const candidate of semanticCandidates) {
    const existing = candidateMap.get(candidate.code);

    if (existing) {
      // Code appears in both - combine scores with weighted average
      // Fuzzy exact/partial matches are more reliable than semantic
      const fuzzyWeight = existing.matchType === 'exact' ? 0.7 : 0.6;
      const semanticWeight = 1 - fuzzyWeight;

      candidateMap.set(candidate.code, {
        code: candidate.code,
        score: existing.score * fuzzyWeight + candidate.score * semanticWeight,
        matchType: existing.matchType === 'exact' ? 'exact+semantic' : 'fuzzy+semantic',
        description: existing.description || candidate.description,
        source: 'combined'
      });
    } else {
      // New candidate from semantic search
      candidateMap.set(candidate.code, candidate);
    }
  }

  // Convert to array and sort by combined score
  const combined = Array.from(candidateMap.values());
  combined.sort((a, b) => b.score - a.score);

  return combined.slice(0, limit);
}

/**
 * Main function: Get top N candidates from all search methods combined
 * @param query - User search query
 * @param limit - Maximum number of candidates to return (default: 10)
 * @returns Combined and deduplicated candidates
 */
export async function getTopCandidates(query: string, limit: number = 10): Promise<Candidate[]> {
  // Run fuzzy and semantic search in parallel for speed
  const [fuzzyCandidates, semanticCandidates] = await Promise.all([
    fuzzyKeywordSearchMulti(query, limit),
    semanticSearchMulti(query, limit)
  ]);

  // Combine and deduplicate
  const finalCandidates = combineCandidates(fuzzyCandidates, semanticCandidates, limit);

  return finalCandidates;
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

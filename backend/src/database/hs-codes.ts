// backend/src/database/hs-codes.ts

import { prisma } from '../utils/prisma';

/**
 * Get chapter notes for routing decisions
 */
export async function getChapterNotes(chapters: string[]): Promise<Map<string, any>> {
  const results = await prisma.$queryRaw`
    SELECT code, description, notes
    FROM hs_codes
    WHERE LENGTH(code) = 2
    AND code = ANY(${chapters})
  ` as any[];

  const notesMap = new Map();
  for (const row of results) {
    notesMap.set(row.code, {
      description: row.description,
      notes: row.notes
    });
  }
  return notesMap;
}

/**
 * Semantic search WITHIN a specific chapter
 * CRITICAL: This searches only within the determined chapter
 */
export async function searchWithinChapter(
  queryEmbedding: number[],
  chapter: string,
  level: number = 4,  // 4 = heading, 7 = subheading, 10 = tariff line
  limit: number = 10
): Promise<any[]> {
  // Convert embedding array to pgvector format
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const chapterPattern = `${chapter}%`;

  // pgvector cosine similarity search filtered by chapter
  const results = await prisma.$queryRaw`
    SELECT
      code,
      description,
      notes,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM hs_codes
    WHERE code LIKE ${chapterPattern}
    AND LENGTH(code) = ${level}
    AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  ` as any[];

  return results;
}

/**
 * Get all tariff-line codes (10-char dotted format) under a heading
 */
export async function getCodesUnderHeading(heading: string): Promise<any[]> {
  const headingPattern = `${heading}%`;

  const results = await prisma.$queryRaw`
    SELECT code, description, notes
    FROM hs_codes
    WHERE code LIKE ${headingPattern}
    AND LENGTH(code) = 10
    ORDER BY code
  ` as any[];

  return results;
}

/**
 * Semantic search across ALL chapters (for initial candidate finding)
 */
export async function globalSemanticSearch(
  queryEmbedding: number[],
  limit: number = 30
): Promise<any[]> {
  // Convert embedding array to pgvector format
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRaw`
    SELECT
      code,
      description,
      notes,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM hs_codes
    WHERE LENGTH(code) >= 4
    AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  ` as any[];

  return results;
}

/**
 * Get all chapter-level codes (for routing)
 */
export async function getAllChapters(): Promise<any[]> {
  const results = await prisma.$queryRaw`
    SELECT code, description, notes
    FROM hs_codes
    WHERE LENGTH(code) = 2
    ORDER BY code
  ` as any[];

  return results;
}

/**
 * Get specific code by code string
 */
export async function getCodeByCode(code: string): Promise<any | null> {
  const results = await prisma.$queryRaw`
    SELECT code, description, notes
    FROM hs_codes
    WHERE code = ${code}
    LIMIT 1
  ` as any[];

  return results[0] || null;
}

/**
 * Get codes by heading (4-digit prefix)
 */
export async function getCodesByHeading(heading: string): Promise<any[]> {
  const headingPattern = `${heading}%`;

  const results = await prisma.$queryRaw`
    SELECT code, description, notes, keywords
    FROM hs_codes
    WHERE code LIKE ${headingPattern}
    ORDER BY code
  ` as any[];

  return results;
}

/**
 * Get codes by chapter (2-digit prefix)
 */
export async function getCodesByChapter(chapter: string): Promise<any[]> {
  const chapterPattern = `${chapter}%`;

  const results = await prisma.$queryRaw`
    SELECT code, description, notes
    FROM hs_codes
    WHERE code LIKE ${chapterPattern}
    ORDER BY code
  ` as any[];

  return results;
}

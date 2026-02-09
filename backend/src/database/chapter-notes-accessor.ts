/**
 * Chapter Notes Accessor Service
 *
 * Provides cached access to chapter notes and GIR rules for classification.
 * Follows functional module pattern (not NestJS).
 *
 * Key features:
 * - Module-level Map cache with TTL
 * - Batch loading for multiple chapters
 * - GIR rules access
 * - Formatted output for LLM prompts
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import {
  GIR_RULES,
  GIRRule,
  getGIRRule as getGIRRuleFromData,
  getAllGIRRules as getAllGIRRulesFromData,
  getPartsClassificationRules as getPartsGIRsFromData,
  formatGIRsForPrompt as formatGIRsFromData,
  getGIRSummary as getGIRSummaryFromData
} from '../data/gir-rules';

// ============ INTERFACES ============

export interface PolicyCondition {
  number: number;
  description: string;
}

export interface ChapterNotesData {
  chapterNumber: string;
  chapterTitle: string | null;
  chapterNotes: string[];
  sectionNotes: string[];
  policyConditions: PolicyCondition[];
}

export interface ChapterNotesResult extends ChapterNotesData {
  hasNotes: boolean;
  fromCache: boolean;
}

export interface NotesForClassification {
  chapters: Map<string, ChapterNotesResult>;
  relevantGIRs: GIRRule[];
  formattedForPrompt: string;
}

interface CachedChapterNotes {
  notes: ChapterNotesData;
  cachedAt: number;
}

// ============ CACHE CONFIGURATION ============

const notesCache = new Map<string, CachedChapterNotes>();
const TTL_MS = 30 * 60 * 1000; // 30 minutes

// Chapters with missing notes (from Session 1B audit)
const CHAPTERS_WITHOUT_NOTES = new Set([
  '50', '52', '53', '64', '75', '76', '78', '79', '80', '81'
]);

// ============ CACHE HELPERS ============

function isCacheValid(entry: CachedChapterNotes): boolean {
  return Date.now() - entry.cachedAt < TTL_MS;
}

function normalizeChapterNumber(chapter: string): string {
  const cleaned = chapter.replace(/\D/g, '');
  return cleaned.length >= 2
    ? cleaned.substring(0, 2).padStart(2, '0')
    : cleaned.padStart(2, '0');
}

// ============ CORE NOTES ACCESS ============

export async function getChapterNotesResult(chapterNumber: string): Promise<ChapterNotesResult> {
  const normalized = normalizeChapterNumber(chapterNumber);

  // Check cache first
  const cached = notesCache.get(normalized);
  if (cached && isCacheValid(cached)) {
    return {
      ...cached.notes,
      hasNotes: cached.notes.chapterNotes.length > 0 || cached.notes.sectionNotes.length > 0,
      fromCache: true
    };
  }

  // Query database
  const result = await queryChapterNotes(normalized);

  // Update cache
  notesCache.set(normalized, {
    notes: result,
    cachedAt: Date.now()
  });

  return {
    ...result,
    hasNotes: result.chapterNotes.length > 0 || result.sectionNotes.length > 0,
    fromCache: false
  };
}

export async function getChapterNotes(chapterNumber: string): Promise<string[]> {
  const result = await getChapterNotesResult(chapterNumber);
  return result.chapterNotes;
}

export async function getSectionNotes(chapterNumber: string): Promise<string[]> {
  const result = await getChapterNotesResult(chapterNumber);
  return result.sectionNotes;
}

export async function getChapterTitle(chapterNumber: string): Promise<string | null> {
  const result = await getChapterNotesResult(chapterNumber);
  return result.chapterTitle;
}

export async function hasNotes(chapterNumber: string): Promise<boolean> {
  const normalized = normalizeChapterNumber(chapterNumber);

  // Quick check for known missing chapters
  if (CHAPTERS_WITHOUT_NOTES.has(normalized)) {
    return false;
  }

  const result = await getChapterNotesResult(normalized);
  return result.hasNotes;
}

export async function getPolicyConditions(hsCode: string): Promise<PolicyCondition[]> {
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT notes->'policyConditions' as policy_conditions
      FROM hs_codes WHERE code = ${hsCode} LIMIT 1
    `;

    if (!result.length || !result[0].policy_conditions) return [];

    return result[0].policy_conditions
      .filter((c: any) => c && typeof c === 'object')
      .map((c: any) => ({
        number: Number(c.number) || 0,
        description: String(c.description || '')
      }));
  } catch (error) {
    logger.error(`Error fetching policy conditions for ${hsCode}: ${error}`);
    return [];
  }
}

// ============ BATCH LOADING ============

export async function getMultipleChapterNotes(
  chapters: string[]
): Promise<Map<string, ChapterNotesResult>> {
  const result = new Map<string, ChapterNotesResult>();
  const uncached: string[] = [];

  // Check cache first
  for (const ch of chapters) {
    const normalized = normalizeChapterNumber(ch);
    const cached = notesCache.get(normalized);

    if (cached && isCacheValid(cached)) {
      result.set(normalized, {
        ...cached.notes,
        hasNotes: cached.notes.chapterNotes.length > 0 || cached.notes.sectionNotes.length > 0,
        fromCache: true
      });
    } else {
      uncached.push(normalized);
    }
  }

  // Batch fetch uncached chapters
  if (uncached.length > 0) {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          notes->>'chapterNumber' as chapter_number,
          notes->>'chapterTitle' as chapter_title,
          notes->'chapterNotes' as chapter_notes,
          notes->'sectionNotes' as section_notes,
          notes->'policyConditions' as policy_conditions
        FROM hs_codes
        WHERE notes->>'chapterNumber' = ANY(${uncached})
          AND LENGTH(code) = 10
          AND notes IS NOT NULL
        GROUP BY notes->>'chapterNumber', notes->>'chapterTitle',
                 notes->'chapterNotes', notes->'sectionNotes', notes->'policyConditions'
      `;

      // Process results
      const fetchedChapters = new Set<string>();

      for (const row of rows) {
        const chapterNum = row.chapter_number;
        if (!chapterNum) continue;

        fetchedChapters.add(chapterNum);

        const notes: ChapterNotesData = {
          chapterNumber: chapterNum,
          chapterTitle: row.chapter_title || null,
          chapterNotes: parseJsonArray(row.chapter_notes),
          sectionNotes: parseJsonArray(row.section_notes),
          policyConditions: parsePolicyConditions(row.policy_conditions)
        };

        notesCache.set(chapterNum, {
          notes,
          cachedAt: Date.now()
        });

        result.set(chapterNum, {
          ...notes,
          hasNotes: notes.chapterNotes.length > 0 || notes.sectionNotes.length > 0,
          fromCache: false
        });
      }

      // Handle chapters not found in DB
      for (const ch of uncached) {
        if (!fetchedChapters.has(ch)) {
          const emptyNotes = createEmptyResult(ch);
          notesCache.set(ch, {
            notes: emptyNotes,
            cachedAt: Date.now()
          });
          result.set(ch, {
            ...emptyNotes,
            hasNotes: false,
            fromCache: false
          });
        }
      }
    } catch (error) {
      logger.error(`Error batch fetching chapter notes: ${error}`);

      // Return empty results for uncached chapters on error
      for (const ch of uncached) {
        if (!result.has(ch)) {
          result.set(ch, {
            ...createEmptyResult(ch),
            hasNotes: false,
            fromCache: false
          });
        }
      }
    }
  }

  return result;
}

// ============ GIR ACCESS (re-export from data module) ============

export function getGIRRules(): GIRRule[] {
  return getAllGIRRulesFromData();
}

export function getGIRRule(ruleNumber: string): GIRRule | undefined {
  return getGIRRuleFromData(ruleNumber);
}

export function getPartsClassificationGIRs(): GIRRule[] {
  return getPartsGIRsFromData();
}

export function formatGIRsForPrompt(ruleNumbers?: string[]): string {
  return formatGIRsFromData(ruleNumbers);
}

export function getGIRSummary(): string {
  return getGIRSummaryFromData();
}

// ============ COMBINED ACCESS ============

export async function getNotesForClassification(
  candidateChapters: string[],
  includeGIRs: string[] = ['1', '2a', '3a', '3b']
): Promise<NotesForClassification> {
  // Get notes for all candidate chapters
  const chapters = await getMultipleChapterNotes(candidateChapters);

  // Get relevant GIRs
  const relevantGIRs = GIR_RULES.filter(r => includeGIRs.includes(r.number));

  // Format for LLM prompt
  const formattedForPrompt = formatNotesForPrompt(chapters, relevantGIRs);

  return { chapters, relevantGIRs, formattedForPrompt };
}

// ============ CACHE MANAGEMENT ============

export function clearCache(): void {
  const size = notesCache.size;
  notesCache.clear();
  logger.info(`Chapter notes cache cleared (${size} entries)`);
}

export function getCacheStats(): { size: number; chapters: string[] } {
  return {
    size: notesCache.size,
    chapters: Array.from(notesCache.keys())
  };
}

export async function preloadCache(chapters: string[]): Promise<void> {
  await getMultipleChapterNotes(chapters);
  logger.info(`Preloaded cache with ${chapters.length} chapters`);
}

// ============ PRIVATE HELPERS ============

async function queryChapterNotes(chapterNumber: string): Promise<ChapterNotesData> {
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        notes->>'chapterNumber' as chapter_number,
        notes->>'chapterTitle' as chapter_title,
        notes->'chapterNotes' as chapter_notes,
        notes->'sectionNotes' as section_notes,
        notes->'policyConditions' as policy_conditions
      FROM hs_codes
      WHERE notes->>'chapterNumber' = ${chapterNumber}
        AND LENGTH(code) = 10
        AND notes IS NOT NULL
      LIMIT 1
    `;

    if (!result.length) {
      return createEmptyResult(chapterNumber);
    }

    const row = result[0];
    return {
      chapterNumber,
      chapterTitle: row.chapter_title || null,
      chapterNotes: parseJsonArray(row.chapter_notes),
      sectionNotes: parseJsonArray(row.section_notes),
      policyConditions: parsePolicyConditions(row.policy_conditions)
    };
  } catch (error) {
    logger.error(`Error querying notes for chapter ${chapterNumber}: ${error}`);
    return createEmptyResult(chapterNumber);
  }
}

function createEmptyResult(chapterNumber: string): ChapterNotesData {
  return {
    chapterNumber,
    chapterTitle: null,
    chapterNotes: [],
    sectionNotes: [],
    policyConditions: []
  };
}

function parseJsonArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parsePolicyConditions(value: any): PolicyCondition[] {
  if (!value) return [];

  try {
    const arr = Array.isArray(value) ? value : JSON.parse(value);
    return arr
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        number: Number(item.number) || 0,
        description: String(item.description || '')
      }));
  } catch {
    return [];
  }
}

function formatNotesForPrompt(
  chapters: Map<string, ChapterNotesResult>,
  girs: GIRRule[]
): string {
  const parts: string[] = [];

  // Chapter notes section
  const chaptersArray = Array.from(chapters.entries());
  for (const [chNum, notes] of chaptersArray) {
    if (notes.hasNotes) {
      parts.push(`## Chapter ${chNum}: ${notes.chapterTitle || 'Unknown'}\n`);

      if (notes.chapterNotes.length > 0) {
        parts.push('### Chapter Notes:\n');
        notes.chapterNotes.slice(0, 5).forEach((note, i) => {
          parts.push(`${i + 1}. ${note}\n`);
        });
      }

      if (notes.sectionNotes.length > 0) {
        parts.push('\n### Section Notes:\n');
        notes.sectionNotes.slice(0, 3).forEach((note, i) => {
          parts.push(`${i + 1}. ${note}\n`);
        });
      }

      parts.push('\n');
    } else {
      parts.push(`## Chapter ${chNum}: [Notes not available]\n\n`);
    }
  }

  // GIR section
  if (girs.length > 0) {
    parts.push('## General Interpretive Rules\n\n');
    girs.forEach(gir => {
      parts.push(`**GIR ${gir.number} - ${gir.title}:**\n${gir.application}\n\n`);
    });
  }

  return parts.join('');
}

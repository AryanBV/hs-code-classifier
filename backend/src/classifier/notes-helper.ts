// backend/src/classifier/notes-helper.ts
//
// Shared helper for injecting chapter notes into classification stages.
// Thin wrapper over chapter-notes-accessor with metadata filtering + truncation.

import { getChapterNotesResult } from '../database/chapter-notes-accessor';
import { logger } from '../utils/logger';

const METADATA_HEADER_PREFIX = 'Sl.No.';
const MAX_NOTES_LENGTH = 2000;

/**
 * Get formatted chapter notes suitable for LLM prompt injection.
 * Filters metadata headers, truncates to 2000 chars.
 * Returns null if chapter has no notes.
 */
export async function getFormattedChapterNotes(chapter: string): Promise<string | null> {
  try {
    const result = await getChapterNotesResult(chapter);

    if (!result.hasNotes) {
      return null;
    }

    const parts: string[] = [];

    if (result.chapterNotes.length > 0) {
      const filteredNotes = result.chapterNotes.filter(
        note => !note.startsWith(METADATA_HEADER_PREFIX)
      );
      if (filteredNotes.length > 0) {
        parts.push('Chapter Notes:');
        filteredNotes.forEach((note, i) => {
          parts.push(`${i + 1}. ${note}`);
        });
      }
    }

    if (result.sectionNotes.length > 0) {
      parts.push('');
      parts.push('Section Notes:');
      result.sectionNotes.slice(0, 3).forEach((note, i) => {
        parts.push(`${i + 1}. ${note}`);
      });
    }

    if (parts.length === 0) return null;

    const combined = parts.join('\n');
    if (combined.length > MAX_NOTES_LENGTH) {
      const truncated = combined.substring(0, MAX_NOTES_LENGTH);
      const lastNewline = truncated.lastIndexOf('\n');
      return (lastNewline > MAX_NOTES_LENGTH * 0.5)
        ? truncated.substring(0, lastNewline) + '\n[truncated]'
        : truncated + '... [truncated]';
    }

    return combined;
  } catch (error) {
    logger.error(`Failed to get chapter notes for ${chapter}: ${error}`);
    return null;
  }
}

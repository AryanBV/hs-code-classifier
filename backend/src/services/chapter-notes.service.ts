/**
 * Chapter Notes Service
 *
 * Handles retrieval and formatting of Chapter/Section Notes for HS classification.
 *
 * In HS nomenclature, classification requires reading notes in this order:
 * 1. General Rules of Interpretation (GRI)
 * 2. Section Notes (e.g., Section IV covers food products)
 * 3. Chapter Notes (e.g., Chapter 21 notes)
 * 4. Subheading Notes
 *
 * Notes can:
 * - Define terms used in the chapter
 * - Include/exclude specific products
 * - Provide classification priorities
 * - Override general descriptions
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ========================================
// Types
// ========================================

export interface ChapterNote {
  type: 'section' | 'chapter' | 'subheading' | 'definition' | 'exclusion' | 'inclusion';
  code: string;           // Section/Chapter/Subheading code
  noteNumber?: string;    // Note 1, 2, 3, etc.
  content: string;        // The actual note text
  keywords: string[];     // Key terms mentioned in the note
  affectedCodes?: string[]; // Codes this note affects
}

export interface NoteContext {
  sectionNotes: ChapterNote[];
  chapterNotes: ChapterNote[];
  subheadingNotes: ChapterNote[];
  relevantDefinitions: ChapterNote[];
  exclusions: ChapterNote[];
  inclusions: ChapterNote[];
}

// ========================================
// Chapter to Section Mapping
// ========================================

const CHAPTER_TO_SECTION: Record<string, { section: string; name: string }> = {
  '01': { section: 'I', name: 'Live animals; animal products' },
  '02': { section: 'I', name: 'Live animals; animal products' },
  '03': { section: 'I', name: 'Live animals; animal products' },
  '04': { section: 'I', name: 'Live animals; animal products' },
  '05': { section: 'I', name: 'Live animals; animal products' },
  '06': { section: 'II', name: 'Vegetable products' },
  '07': { section: 'II', name: 'Vegetable products' },
  '08': { section: 'II', name: 'Vegetable products' },
  '09': { section: 'II', name: 'Vegetable products' },
  '10': { section: 'II', name: 'Vegetable products' },
  '11': { section: 'II', name: 'Vegetable products' },
  '12': { section: 'II', name: 'Vegetable products' },
  '13': { section: 'II', name: 'Vegetable products' },
  '14': { section: 'II', name: 'Vegetable products' },
  '15': { section: 'III', name: 'Animal/vegetable fats and oils' },
  '16': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '17': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '18': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '19': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '20': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '21': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '22': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '23': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  '24': { section: 'IV', name: 'Prepared foodstuffs; beverages' },
  // Add more sections as needed...
};

// ========================================
// Main Functions
// ========================================

/**
 * Get all relevant notes for a given HS code
 */
export async function getNotesForCode(hsCode: string): Promise<NoteContext> {
  const chapter = hsCode.substring(0, 2);
  const heading = hsCode.substring(0, 4);
  const subheading = hsCode.substring(0, 7);  // XXXX.XX

  const result: NoteContext = {
    sectionNotes: [],
    chapterNotes: [],
    subheadingNotes: [],
    relevantDefinitions: [],
    exclusions: [],
    inclusions: []
  };

  try {
    // Get the HS code record with notes
    const hsCodeRecord = await prisma.hsCode.findFirst({
      where: { code: hsCode },
      select: { notes: true }
    });

    // Try to get chapter-level notes
    const chapterRecord = await prisma.hsCode.findFirst({
      where: {
        OR: [
          { code: chapter },
          { chapter: chapter, notes: { not: undefined } }
        ]
      },
      select: { code: true, notes: true }
    });

    // Parse notes if they exist
    if (hsCodeRecord?.notes) {
      const parsedNotes = parseNotes(hsCodeRecord.notes, hsCode);
      categorizeNotes(parsedNotes, result);
    }

    if (chapterRecord?.notes && chapterRecord.code !== hsCode) {
      const parsedChapterNotes = parseNotes(chapterRecord.notes, chapter);
      categorizeNotes(parsedChapterNotes, result);
    }

    // Add hardcoded critical notes that might not be in DB
    addCriticalNotes(chapter, result);

  } catch (error) {
    logger.error('Error getting notes for code: ' + (error instanceof Error ? error.message : String(error)));
  }

  return result;
}

/**
 * Parse notes from JSON storage
 */
function parseNotes(notesJson: any, sourceCode: string): ChapterNote[] {
  const notes: ChapterNote[] = [];

  if (!notesJson) return notes;

  // Handle various note formats
  if (typeof notesJson === 'string') {
    notes.push({
      type: 'chapter',
      code: sourceCode,
      content: notesJson,
      keywords: extractKeywordsFromNote(notesJson)
    });
  } else if (Array.isArray(notesJson)) {
    for (const note of notesJson) {
      if (typeof note === 'string') {
        notes.push({
          type: 'chapter',
          code: sourceCode,
          content: note,
          keywords: extractKeywordsFromNote(note)
        });
      } else if (note && typeof note === 'object') {
        notes.push({
          type: note.type || 'chapter',
          code: sourceCode,
          noteNumber: note.number || note.noteNumber,
          content: note.content || note.text || JSON.stringify(note),
          keywords: note.keywords || extractKeywordsFromNote(note.content || ''),
          affectedCodes: note.affectedCodes
        });
      }
    }
  } else if (typeof notesJson === 'object') {
    // Handle object format with numbered notes
    for (const [key, value] of Object.entries(notesJson)) {
      const content = typeof value === 'string' ? value : JSON.stringify(value);
      notes.push({
        type: determineNoteType(content),
        code: sourceCode,
        noteNumber: key,
        content,
        keywords: extractKeywordsFromNote(content)
      });
    }
  }

  return notes;
}

/**
 * Determine the type of note based on content
 */
function determineNoteType(content: string): ChapterNote['type'] {
  const contentLower = content.toLowerCase();

  if (contentLower.includes('does not include') ||
    contentLower.includes('does not cover') ||
    contentLower.includes('excluded') ||
    contentLower.includes('not applicable')) {
    return 'exclusion';
  }

  if (contentLower.includes('includes') ||
    contentLower.includes('covers') ||
    contentLower.includes('applies to')) {
    return 'inclusion';
  }

  if (contentLower.includes('means') ||
    contentLower.includes('refers to') ||
    contentLower.includes('defined as') ||
    contentLower.match(/^"\w+"/)) {
    return 'definition';
  }

  return 'chapter';
}

/**
 * Extract keywords from note content
 */
function extractKeywordsFromNote(content: string): string[] {
  const keywords: string[] = [];

  // Extract quoted terms (definitions)
  const quotedMatches = content.match(/"([^"]+)"/g);
  if (quotedMatches) {
    keywords.push(...quotedMatches.map(m => m.replace(/"/g, '').toLowerCase()));
  }

  // Extract HS code references
  const codeMatches = content.match(/\b\d{4}(?:\.\d{2})?(?:\.\d{2})?\b/g);
  if (codeMatches) {
    keywords.push(...codeMatches);
  }

  // Extract key product terms
  const productTerms = [
    'coffee', 'tea', 'cocoa', 'sugar', 'milk', 'cream', 'flour', 'starch',
    'instant', 'roasted', 'extract', 'essence', 'concentrate', 'flavoured',
    'decaffeinated', 'preparation', 'mixture'
  ];

  const contentLower = content.toLowerCase();
  for (const term of productTerms) {
    if (contentLower.includes(term)) {
      keywords.push(term);
    }
  }

  return [...new Set(keywords)];
}

/**
 * Categorize parsed notes into the result structure
 */
function categorizeNotes(notes: ChapterNote[], result: NoteContext): void {
  for (const note of notes) {
    switch (note.type) {
      case 'section':
        result.sectionNotes.push(note);
        break;
      case 'chapter':
        result.chapterNotes.push(note);
        break;
      case 'subheading':
        result.subheadingNotes.push(note);
        break;
      case 'definition':
        result.relevantDefinitions.push(note);
        break;
      case 'exclusion':
        result.exclusions.push(note);
        break;
      case 'inclusion':
        result.inclusions.push(note);
        break;
    }
  }
}

/**
 * Add critical hardcoded notes for important chapters
 */
function addCriticalNotes(chapter: string, result: NoteContext): void {
  const criticalNotes: Record<string, ChapterNote[]> = {
    '09': [
      {
        type: 'chapter',
        code: '09',
        noteNumber: '1',
        content: 'This Chapter covers coffee, tea, maté and spices. Mixtures of these products are classified according to the component which gives them their essential character.',
        keywords: ['coffee', 'tea', 'maté', 'spices', 'mixtures']
      },
      {
        type: 'definition',
        code: '09',
        content: 'Coffee includes roasted coffee, unroasted coffee, coffee husks and skins, and coffee substitutes containing coffee.',
        keywords: ['coffee', 'roasted', 'unroasted', 'husks', 'skins', 'substitutes']
      }
    ],
    '21': [
      {
        type: 'chapter',
        code: '21',
        noteNumber: '1',
        content: 'This Chapter does not cover: (a) mixed vegetables of heading 07.12; (b) roasted coffee substitutes containing coffee in any proportion (heading 09.01).',
        keywords: ['vegetables', 'coffee substitutes', 'roasted']
      },
      {
        type: 'definition',
        code: '21',
        noteNumber: '2',
        content: 'Extracts, essences and concentrates of coffee, tea or maté include preparations based on these extracts, essences or concentrates.',
        keywords: ['extracts', 'essences', 'concentrates', 'coffee', 'tea', 'preparations']
      },
      {
        type: 'inclusion',
        code: '2101',
        content: 'Heading 21.01 covers: (a) Extracts, essences and concentrates of coffee and preparations with a basis of these extracts, essences or concentrates; (b) Roasted chicory and other roasted coffee substitutes, and extracts, essences and concentrates thereof.',
        keywords: ['extracts', 'concentrates', 'instant coffee', 'chicory', 'substitutes']
      }
    ]
  };

  if (criticalNotes[chapter]) {
    for (const note of criticalNotes[chapter]) {
      categorizeNotes([note], result);
    }
  }
}

/**
 * Format notes for inclusion in LLM prompt
 */
export function formatNotesForPrompt(noteContext: NoteContext, maxLength: number = 2000): string {
  const lines: string[] = [];

  // Prioritize: Definitions > Exclusions > Inclusions > Chapter Notes

  if (noteContext.relevantDefinitions.length > 0) {
    lines.push('**DEFINITIONS:**');
    for (const def of noteContext.relevantDefinitions.slice(0, 3)) {
      lines.push(`• ${def.content}`);
    }
    lines.push('');
  }

  if (noteContext.exclusions.length > 0) {
    lines.push('**EXCLUSIONS (products NOT covered):**');
    for (const exc of noteContext.exclusions.slice(0, 3)) {
      lines.push(`• ${exc.content}`);
    }
    lines.push('');
  }

  if (noteContext.inclusions.length > 0) {
    lines.push('**INCLUSIONS (products specifically covered):**');
    for (const inc of noteContext.inclusions.slice(0, 3)) {
      lines.push(`• ${inc.content}`);
    }
    lines.push('');
  }

  if (noteContext.chapterNotes.length > 0) {
    lines.push('**CHAPTER NOTES:**');
    for (const note of noteContext.chapterNotes.slice(0, 3)) {
      const prefix = note.noteNumber ? `Note ${note.noteNumber}: ` : '';
      lines.push(`• ${prefix}${note.content}`);
    }
    lines.push('');
  }

  // Truncate if too long
  let result = lines.join('\n');
  if (result.length > maxLength) {
    result = result.substring(0, maxLength - 100) + '\n\n... [Notes truncated for length]';
  }

  return result;
}

/**
 * Check if a product should be excluded based on chapter notes
 */
export function checkExclusionFromNotes(
  productDescription: string,
  noteContext: NoteContext
): { excluded: boolean; reason: string; suggestedChapter?: string } {
  const productLower = productDescription.toLowerCase();

  for (const exclusion of noteContext.exclusions) {
    // Check if any exclusion keywords match the product
    for (const keyword of exclusion.keywords) {
      if (productLower.includes(keyword.toLowerCase())) {
        // Look for alternative chapter suggestions in the note
        const chapterMatch = exclusion.content.match(/heading\s+(\d{2}\.\d{2})/i);
        return {
          excluded: true,
          reason: exclusion.content,
          suggestedChapter: chapterMatch ? chapterMatch[1] : undefined
        };
      }
    }
  }

  return { excluded: false, reason: '' };
}

export default {
  getNotesForCode,
  formatNotesForPrompt,
  checkExclusionFromNotes
};

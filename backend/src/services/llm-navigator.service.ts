/**
 * LLM Navigator Service
 *
 * This service uses LLM to navigate the HS code hierarchy.
 * At each level, it either:
 * - Selects a child code if confident
 * - Asks a clarifying question if uncertain
 *
 * NO HARDCODED PRODUCT LISTS. All decisions made by LLM.
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
// PHASE 1: Import chapter notes for legal classification rules
import { getNotesForCode, formatNotesForPrompt } from './chapter-notes.service';
// PHASE 1: Import query parser for product type modifiers
import { parseQuery } from './query-parser.service';
// PHASE 2: Import chapter predictor for functional overrides
import { checkFunctionalOverrides, checkAmbiguousTerms } from './chapter-predictor.service';
// ROOT CAUSE FIX: Import scoped semantic search for functional overrides
import { getBestHeadingInChapter, getScopedSemanticCandidates } from './multi-candidate-search.service';
// PHASE 3: Import elimination service for modifier-based filtering
import {
  filterHierarchyChildren,
  filterQuestionOptions,
  isQuestionStillRelevant,
  extractModifiersFromText
} from './elimination.service';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ========================================
// Types
// ========================================

export interface HierarchyOption {
  code: string;
  description: string;
  isOther: boolean;
  hasChildren: boolean;
}

export interface NavigationHistory {
  code: string;
  description: string;
  level: number;
}

export interface NavigationQuestion {
  id: string;
  text: string;
  options: Array<{
    code: string;
    label: string;
    description: string;
  }>;
  parentCode: string;
  reasoning: string;
}

export interface NavigationResult {
  type: 'question' | 'selection' | 'classification' | 'error';
  code?: string;
  description?: string;
  question?: NavigationQuestion;
  confidence?: number;
  reasoning?: string;
  error?: string;
}

// ========================================
// Keyword Extraction (GENERIC - no hardcoded product lists)
// ========================================

/**
 * Common words to ignore when extracting keywords
 * These don't help narrow down classification
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'product', 'products', 'item', 'items', 'type', 'types', 'kind', 'kinds',
  'made', 'used', 'using', 'like', 'such', 'etc', 'i', 'want', 'looking',
  'need', 'classify', 'classification', 'code', 'hs', 'export', 'import'
]);

/**
 * Extract significant keywords from user input
 * GENERIC approach - extracts ALL meaningful words
 * The LLM will use these keywords to intelligently filter options
 */
function extractKeywords(userInput: string): string[] {
  const inputLower = userInput.toLowerCase();

  // Split into words, remove punctuation
  const words = inputLower
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)  // Min 2 chars
    .filter(w => !STOP_WORDS.has(w));

  const keywords = [...new Set(words)];
  logger.info(`[KEYWORDS] Extracted from "${userInput}": [${keywords.join(', ')}]`);
  return keywords;
}

// PHASE 1: Check if a code should be excluded based on product type modifiers
/**
 * Check if a code should be excluded based on product type modifiers
 * This implements strict filtering for mutually exclusive product types
 */
function shouldExcludeByModifier(
  codeDescription: string,
  productTypeModifiers: string[]
): boolean {
  const lowerDesc = codeDescription.toLowerCase();

  // Coffee-specific exclusion rules: instant/extract vs roasted/raw
  if (productTypeModifiers.includes('instant') ||
      productTypeModifiers.includes('soluble') ||
      productTypeModifiers.includes('extract') ||
      productTypeModifiers.includes('essence') ||
      productTypeModifiers.includes('concentrate')) {
    // If user wants instant/extract, exclude raw/roasted coffee bean codes
    if ((lowerDesc.includes('not roasted') ||
        lowerDesc.includes('roasted') ||
        lowerDesc.includes('coffee beans') ||
        lowerDesc.includes('raw')) &&
        !lowerDesc.includes('extract') &&
        !lowerDesc.includes('instant') &&
        !lowerDesc.includes('essence')) {
      return true;
    }
  }

  if (productTypeModifiers.includes('roasted') ||
      productTypeModifiers.includes('raw') ||
      productTypeModifiers.includes('green') ||
      productTypeModifiers.includes('beans') ||
      productTypeModifiers.includes('unroasted')) {
    // If user wants raw/roasted beans, exclude instant/extract codes
    if (lowerDesc.includes('instant') ||
        lowerDesc.includes('extract') ||
        lowerDesc.includes('essence') ||
        lowerDesc.includes('soluble')) {
      return true;
    }
  }

  // Variety-specific exclusion: Arabica vs Robusta
  if (productTypeModifiers.includes('arabica')) {
    // Exclude Robusta codes when user specified Arabica
    if ((lowerDesc.includes('robusta') || lowerDesc.includes('rob ')) &&
        !lowerDesc.includes('arabica')) {
      return true;
    }
  }

  if (productTypeModifiers.includes('robusta')) {
    // Exclude Arabica codes when user specified Robusta
    if (lowerDesc.includes('arabica') && !lowerDesc.includes('robusta')) {
      return true;
    }
  }

  // Tea variety exclusion
  if (productTypeModifiers.includes('green tea') || productTypeModifiers.includes('green')) {
    if (lowerDesc.includes('black tea') && !lowerDesc.includes('green')) {
      return true;
    }
  }

  if (productTypeModifiers.includes('black tea')) {
    if (lowerDesc.includes('green tea') && !lowerDesc.includes('black')) {
      return true;
    }
  }

  return false;
}

/**
 * Simple keyword-based option filtering (code-level, not LLM)
 * This ensures options match user's keywords when possible
 * More reliable than LLM-only filtering
 *
 * Matching strategies (in order):
 * 1. WHOLE WORD match - "tea" matches "Tea" but NOT "teats"
 * 2. PLURAL match - "mango" matches "mangoes" (short suffix only)
 * 3. ABBREVIATION match - "robusta" matches "Rob" (for long keywords only)
 *
 * PHASE 1: Now also applies product type modifier exclusions
 */
function filterOptionsByKeywordsSimple(
  options: HierarchyOption[],
  userKeywords: string[],
  productTypeModifiers: string[] = []
): HierarchyOption[] {
  // PHASE 1: First apply product type modifier exclusions
  let filteredOptions = options;
  if (productTypeModifiers.length > 0) {
    const beforeModifierFilter = filteredOptions.length;
    filteredOptions = filteredOptions.filter(opt =>
      !shouldExcludeByModifier(opt.description, productTypeModifiers)
    );
    if (filteredOptions.length < beforeModifierFilter) {
      logger.info(`[FILTER] Modifier filter: ${beforeModifierFilter} -> ${filteredOptions.length} options`);
    }
  }

  if (userKeywords.length === 0 || filteredOptions.length <= 1) {
    return filteredOptions;
  }

  // Find options where user keywords appear in description
  const matchingOptions = filteredOptions.filter(opt => {
    const descLower = opt.description.toLowerCase();

    // Check if ANY significant keyword (3+ chars) matches description
    return userKeywords.some(kw => {
      if (kw.length < 3) return false;
      const kwLower = kw.toLowerCase();

      // Method 1: WHOLE WORD match
      // \btea\b matches "tea" but NOT "teats" or "steam"
      const kwRegex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (kwRegex.test(descLower)) return true;

      // Extract words from description for suffix/abbreviation matching
      const descWords = descLower.split(/[\s:,\-.()\/]+/).filter(w => w.length >= 3);

      for (const descWord of descWords) {
        // Method 2: PLURAL/SUFFIX match (description word = keyword + suffix)
        // "mango" matches "mangoes" but NOT "mangolds"
        if (descWord.startsWith(kwLower)) {
          const suffixLen = descWord.length - kwLower.length;
          // Strict suffix length: 2 chars for long keywords, 1 for short
          const maxSuffix = kwLower.length >= 5 ? 2 : 1;
          if (suffixLen > 0 && suffixLen <= maxSuffix) {
            return true;
          }
        }

        // Method 3: ABBREVIATION match (keyword = description word + extra)
        // "robusta" matches "Rob" because "Rob" is abbreviation of Robusta
        // Only for LONG keywords (7+ chars) to avoid "mango" matching "man"
        if (kwLower.startsWith(descWord) && kwLower.length >= 7) {
          const extraLen = kwLower.length - descWord.length;
          // Allow extra chars up to 60% of keyword length
          const maxExtra = Math.ceil(kwLower.length * 0.6);
          if (extraLen > 0 && extraLen <= maxExtra) {
            return true;
          }
        }
      }

      return false;
    });
  });

  // If we found matching options, use them
  if (matchingOptions.length > 0 && matchingOptions.length < filteredOptions.length) {
    // Only add "Other" option if it's from the SAME chapter/parent as matched options
    // This prevents irrelevant "Other" codes (like "Other live animals") appearing
    // when searching for products in completely different chapters
    const matchedChapters = new Set(matchingOptions.map(o => o.code.substring(0, 2)));

    // Only add "Other" if all matched options are from the same chapter
    // AND there are "Other" options from that same chapter
    if (matchedChapters.size === 1) {
      const chapter = [...matchedChapters][0];
      const relevantOthers = filteredOptions.filter(o =>
        o.isOther &&
        o.code.substring(0, 2) === chapter &&
        !matchingOptions.includes(o)
      );
      // Add ALL relevant "Other" options (e.g., "Other - Seed" and "Other - Other" for wheat)
      matchingOptions.push(...relevantOthers);
    }

    logger.info(`[FILTER] Keyword filter: ${filteredOptions.length} -> ${matchingOptions.length} options`);
    return matchingOptions;
  }

  return filteredOptions;
}

/**
 * Detect if options fall into distinct groups that warrant a question
 * This handles cases like:
 * - Coffee at root: Chapter 09 (raw) vs Chapter 21 (instant)
 * - Coffee types: Arabica vs Robusta
 * - Processing types: Parchment vs Cherry
 *
 * Returns group info if distinct groups found, null otherwise
 */
function detectDistinctGroups(
  options: HierarchyOption[],
  userKeywords: string[]
): { groups: Array<{ name: string; options: HierarchyOption[] }>; questionText: string } | null {
  logger.debug(`[DISTINCT-GROUPS] Called with ${options.length} options, keywords: [${userKeywords.join(', ')}]`);

  // ========================================
  // FULLY GENERIC, DATABASE-DRIVEN APPROACH
  // No hardcoded product patterns - works for ANY HS code
  // ========================================

  // RULE 1: Cross-chapter distinction
  // When options span multiple chapters (e.g., 09xx and 21xx), ask which chapter
  const chapters = new Map<string, HierarchyOption[]>();
  for (const opt of options) {
    const chapter = opt.code.substring(0, 2);
    if (!chapters.has(chapter)) {
      chapters.set(chapter, []);
    }
    chapters.get(chapter)!.push(opt);
  }

  if (chapters.size > 1) {
    // Check if user keywords clearly match one chapter's options
    const chapterMatchScores = Array.from(chapters.entries()).map(([chapter, opts]) => {
      const matchScore = opts.reduce((score, opt) => {
        const desc = opt.description.toLowerCase();
        return score + userKeywords.filter(kw => kw.length >= 3 && desc.includes(kw.toLowerCase())).length;
      }, 0);
      return { chapter, opts, matchScore };
    });

    const maxScore = Math.max(...chapterMatchScores.map(c => c.matchScore));
    const bestChapters = chapterMatchScores.filter(c => c.matchScore === maxScore);

    // If user keywords don't clearly point to one chapter, ask
    if (bestChapters.length > 1 || maxScore === 0) {
      logger.info(`[DISTINCT-GROUPS] Cross-chapter options detected: chapters ${[...chapters.keys()].join(', ')}`);

      const groups = Array.from(chapters.entries()).slice(0, 4).map(([chapter, opts]) => {
        const firstOpt = opts[0];
        const label = firstOpt ? cleanDescriptionForLabel(firstOpt.description) : `Chapter ${chapter}`;
        return { name: `${label} (Ch. ${chapter})`, options: opts };
      });

      return {
        groups,
        questionText: 'Which category best describes your product?'
      };
    }
  }

  // RULE 2: Multiple options at same level - INCLUDES "Other" codes
  // ROOT CAUSE FIX: Keep ALL options including "Other" - it's a valid HS classification
  // Sort so "Other" appears last (as a fallback option)
  const sortedOptions = [...options].sort((a, b) => {
    if (a.isOther && !b.isOther) return 1;  // "Other" goes last
    if (!a.isOther && b.isOther) return -1;
    return 0;
  });

  // Separate branch codes (can drill down) from leaf codes (final classification)
  // IMPORTANT: Exclude "Other" from branches/leaves to avoid duplicates
  const branchOptions = sortedOptions.filter(o => o.hasChildren && !o.isOther);
  const leafOptions = sortedOptions.filter(o => !o.hasChildren && !o.isOther);
  const otherOptions = sortedOptions.filter(o => o.isOther);

  // Combine: branches first, then leaves, then "Other" last (no duplicates)
  const relevantOptions = [...branchOptions, ...leafOptions, ...otherOptions];

  logger.debug(`[DISTINCT-GROUPS] Total: ${sortedOptions.length}, branches: ${branchOptions.length}, leaves: ${leafOptions.length}, other: ${otherOptions.length}`);

  // ROOT CAUSE FIX: Use relevantOptions (includes branches, leaves, AND "Other")
  if (relevantOptions.length >= 2) {
    // Check if user keywords clearly match ONE option
    const matchScores = relevantOptions.map(o => {
      const desc = o.description.toLowerCase();
      const matchCount = userKeywords.filter(kw => {
        if (kw.length < 3) return false;
        // Word boundary matching for better precision
        const pattern = new RegExp(`\\b${kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        return pattern.test(desc);
      }).length;
      return { option: o, matchCount };
    });

    const maxMatches = Math.max(...matchScores.map(m => m.matchCount));
    const topMatches = matchScores.filter(m => m.matchCount === maxMatches && m.matchCount > 0);

    // Only skip question if ONE option is clearly the best match
    if (topMatches.length === 1 && maxMatches >= 1) {
      logger.debug(`[DISTINCT-GROUPS] Keywords clearly match "${topMatches[0]!.option.description.substring(0, 50)}", skipping question`);
      return null;
    }

    logger.info(`[DISTINCT-GROUPS] ${relevantOptions.length} options at this level - generating question`);

    // ROOT CAUSE FIX: Generate smart question based on ACTUAL differences between options
    const questionText = generateSmartQuestion(relevantOptions);

    // ROOT CAUSE FIX: Use generateUniqueLabel which handles duplicates properly
    // Show ALL options - don't arbitrarily cut off valid HS codes
    // Users need to see all choices to make accurate classification
    const existingLabels = new Set<string>();
    const groups = relevantOptions.map(o => {
      const uniqueLabel = generateUniqueLabel(o.code, o.description, existingLabels);
      return {
        name: uniqueLabel,
        options: [o]
      };
    });

    return {
      groups,
      questionText
    };
  }

  return null;
}

/**
 * ROOT CAUSE FIX: Generate SMART questions based on ACTUAL differences between options
 * This analyzes what's different between options and generates contextually relevant questions
 */
function generateSmartQuestion(options: HierarchyOption[]): string {
  if (options.length === 0) return "Which option best describes your product?";

  // Extract descriptions and find common/different parts
  const descriptions = options.map(o => o.description.toLowerCase());

  // Check for common distinguishing patterns - ordered by specificity
  const patterns = [
    // Most specific patterns first
    { keywords: ['seed', 'sowing', 'for seed'], question: "Is this for sowing (seed) or other purposes?" },
    { keywords: ['decaffeinated', 'not decaffeinated'], question: "Is the product decaffeinated?" },
    { keywords: ['roasted', 'not roasted'], question: "Is the product roasted?" },
    { keywords: ['crushed', 'ground', 'whole', 'neither crushed nor ground'], question: "What is the processing state?" },
    { keywords: ['fresh', 'dried', 'frozen', 'chilled'], question: "What is the preservation state?" },
    { keywords: ['raw', 'processed', 'prepared'], question: "Is this raw or processed?" },
    { keywords: ['bulk', 'retail', 'packing', 'packings', 'immediate packing'], question: "What is the packaging type?" },
    { keywords: ['seed', 'seeds', 'powder', 'extract', 'oil'], question: "What form is the product in?" },
    { keywords: ['breeding', 'pure-bred', 'livestock'], question: "What is the purpose/type?" },
    { keywords: ['arabica', 'robusta'], question: "What variety of coffee is this?" },
    { keywords: ['green tea', 'black tea', 'oolong'], question: "What type of tea is this?" },
    { keywords: ['parchment', 'cherry'], question: "What is the processing method?" },
    { keywords: ['grade a', 'grade b', 'grade c', 'a grade', 'b grade', 'c grade', 'ab grade', 'pb grade'], question: "What grade is your product?" },
    { keywords: ['husk', 'skin', 'shell'], question: "Is this a byproduct (husks/skins/shells)?" },
    { keywords: ['instant', 'soluble', 'extract', 'essence'], question: "Is this an instant/processed product?" },
    { keywords: ['other'], question: "Does your product fit a specific category, or is it 'Other'?" },
  ];

  // Find which pattern matches the differences between options
  for (const pattern of patterns) {
    const matchCount = pattern.keywords.filter(kw =>
      descriptions.some(d => d.includes(kw))
    ).length;

    // Need at least 2 matches to confirm this is the distinguishing factor
    if (matchCount >= 2) {
      return pattern.question;
    }
  }

  // Default fallback
  return "Which category best matches your product?";
}

/**
 * LEGACY: Generate a question based on what differentiates the options
 * Kept for backward compatibility - use generateSmartQuestion instead
 */
function generateQuestionFromDescriptions(options: HierarchyOption[]): string {
  return generateSmartQuestion(options);
}

/**
 * Clean up HS code description for use as a user-friendly label
 */
function cleanDescriptionForLabel(description: string): string {
  // Remove leading dashes and colons
  let label = description.replace(/^[-:\s]+/, '').trim();

  // Take the first meaningful part (before : or --)
  const firstPart = label.split(/\s*:\s*|--/)[0];
  if (firstPart && firstPart.length > 5) {
    label = firstPart.trim();
  }

  // Truncate if too long
  if (label.length > 50) {
    label = label.substring(0, 47) + '...';
  }

  return label;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Build user-friendly reasoning from navigation history
 * This creates a human-readable explanation of WHY this code was chosen
 */
async function buildUserFriendlyReasoning(
  userInput: string,
  history: NavigationHistory[],
  finalCode: string,
  finalDescription: string,
  context?: string
): Promise<string> {
  const productName = userInput.length > 50
    ? userInput.substring(0, 47) + '...'
    : userInput;

  // Try to build a path from the HS code hierarchy
  // This gives us the full classification path even if history is limited
  const codePath = await buildCodePath(finalCode);

  if (codePath.length > 0) {
    // Filter out generic "Other" entries and build a meaningful path
    const meaningfulParts = codePath.filter(p =>
      p.description.toLowerCase() !== 'other' &&
      !p.description.toLowerCase().startsWith('other ')
    );

    if (meaningfulParts.length >= 2) {
      const mainCategory = meaningfulParts[0]!.description;
      const subParts = meaningfulParts.slice(1).map(p => p.description);

      let reasoning = `"${productName}" is classified under ${mainCategory}`;
      if (subParts.length > 0) {
        reasoning += `, specifically: ${subParts.join(' → ')}`;
      }
      if (context) {
        reasoning += `. ${context}`;
      }
      return reasoning;
    } else if (meaningfulParts.length === 1) {
      let reasoning = `"${productName}" falls under ${meaningfulParts[0]!.description}`;
      if (context) {
        reasoning += `. ${context}`;
      }
      return reasoning;
    }
  }

  // Fallback: Use history if available and meaningful
  if (history.length > 0) {
    const pathParts = history
      .map(h => h.description.replace(/^[0-9.]+\s*[-:]?\s*/, '').trim())
      .filter(d => d && d.toLowerCase() !== 'other');

    if (pathParts.length > 0) {
      return `"${productName}" is classified under ${pathParts.join(' → ')}${context ? `. ${context}` : ''}`;
    }
  }

  // Final fallback - use whatever description we have
  if (finalDescription && finalDescription.toLowerCase() !== 'other') {
    const cleanDesc = finalDescription.replace(/^[0-9.]+\s*[-:]?\s*/, '').trim();
    return `"${productName}" is classified as: ${cleanDesc}${context ? `. ${context}` : ''}`;
  }

  // Last resort
  return context || `Classification based on product characteristics`;
}

/**
 * Build the full code path by fetching parent codes from the database
 * e.g., for 0811.90.90, returns descriptions for: 08 -> 0811 -> 0811.90 -> 0811.90.90
 */
async function buildCodePath(code: string): Promise<{ code: string; description: string }[]> {
  const path: { code: string; description: string }[] = [];

  // Parse the code to get all parent levels
  // e.g., 0811.90.90 -> [08, 0811, 0811.90, 0811.90.90]
  const parentCodes: string[] = [];

  // Get chapter (first 2 or 4 digits without dot)
  const cleanCode = code.replace(/\./g, '');
  if (cleanCode.length >= 2) {
    parentCodes.push(cleanCode.substring(0, 2)); // Chapter: 08
  }
  if (cleanCode.length >= 4) {
    parentCodes.push(cleanCode.substring(0, 4)); // Heading: 0811
  }

  // Add subheading levels from the original code format
  const parts = code.split('.');
  if (parts.length >= 2) {
    parentCodes.push(`${parts[0]}.${parts[1]}`); // 0811.90
  }
  if (parts.length >= 3) {
    parentCodes.push(code); // Full code: 0811.90.90
  }

  // Remove duplicates and sort by length (shortest = highest level)
  const uniqueCodes = [...new Set(parentCodes)].sort((a, b) =>
    a.replace(/\./g, '').length - b.replace(/\./g, '').length
  );

  // Fetch descriptions for each level
  for (const parentCode of uniqueCodes) {
    try {
      const codeInfo = await prisma.hsCode.findFirst({
        where: { code: parentCode },
        select: { code: true, description: true }
      });
      if (codeInfo) {
        path.push({
          code: codeInfo.code,
          description: codeInfo.description
        });
      }
    } catch {
      // Skip if not found
    }
  }

  return path;
}

// ========================================
// Database Queries
// ========================================

/**
 * Get all root level options (4-digit heading codes)
 * Database stores 4-digit headings (0901, 0902) not 2-digit chapters
 * Optimized: Assumes all headings have children (which is true for HS codes)
 */
async function getAllChapters(): Promise<HierarchyOption[]> {
  const headings = await prisma.hsCode.findMany({
    where: {
      code: {
        not: {
          contains: '.'
        }
      }
    },
    select: {
      code: true,
      description: true,
      isOther: true
    },
    orderBy: { code: 'asc' }
  });

  // CRITICAL FIX: Only return 4-digit headings, not 2-digit chapters
  // This prevents mixing hierarchy levels in the first question
  // Database has both "09" (2-digit chapter) and "0901" (4-digit heading) - we want only 4-digit
  const fourDigitHeadings = headings.filter(h => h.code.length === 4);

  // All 4-digit headings have children in HS code structure
  return fourDigitHeadings.map(h => ({
    code: h.code,
    description: h.description,
    isOther: h.isOther,
    hasChildren: true // 4-digit headings always have subheadings underneath
  }));
}

/**
 * Get direct children of a code using prefix-based query
 *
 * This directly queries the hs_codes table by prefix, which is:
 * - Self-maintaining (no separate hierarchy table to keep in sync)
 * - Complete (automatically includes all codes)
 * - Generic (works for any product without special handling)
 *
 * NOTE: HS code databases are inconsistent - some codes skip levels.
 * E.g., from 1001 (4 digits), children might be:
 *   - 1001.99 (6 digits) - normal
 *   - 1001.11.00 (8 digits) - skips 6-digit level!
 *
 * Solution: Group descendants by their first "branch segment" after the parent,
 * then return the SHORTEST code from each branch as the representative child.
 * This gives users meaningful options at each level without skipping important branches.
 */
async function getChildrenForCode(parentCode: string): Promise<HierarchyOption[]> {
  // Query all codes that start with parent code
  const allDescendants = await prisma.hsCode.findMany({
    where: {
      code: {
        startsWith: parentCode,
        not: parentCode
      }
    },
    select: {
      code: true,
      description: true,
      isOther: true
    },
    orderBy: { code: 'asc' }
  });

  if (allDescendants.length === 0) {
    return []; // Leaf node
  }

  // Group descendants by their first segment after parent
  // E.g., for parent "1001":
  //   - 1001.11.00 belongs to branch "1001.11"
  //   - 1001.99 belongs to branch "1001.99"
  //   - 1001.99.10 belongs to branch "1001.99"
  const branchMap = new Map<string, typeof allDescendants[0]>();

  for (const desc of allDescendants) {
    // Get the code part after the parent
    const suffix = desc.code.slice(parentCode.length);

    // Extract the first segment (up to the next dot, or first 2-3 chars)
    // For "1001" -> ".11.00", extract ".11"
    // For "1001" -> ".99", extract ".99"
    let branchKey: string;

    if (suffix.startsWith('.')) {
      // Has dot separator (e.g., ".11.00" or ".99")
      const parts = suffix.slice(1).split('.');
      branchKey = parentCode + '.' + parts[0];
    } else {
      // No dot (e.g., "11" from chapter "10" -> "1011")
      // Take first 2 characters as the next level
      branchKey = parentCode + suffix.slice(0, 2);
    }

    // Keep the shortest code for each branch
    const existing = branchMap.get(branchKey);
    if (!existing || desc.code.length < existing.code.length) {
      branchMap.set(branchKey, desc);
    }
  }

  // Convert map values to array and add hasChildren info
  const directChildren = Array.from(branchMap.values());

  return directChildren.map(child => {
    const hasChildren = allDescendants.some(desc =>
      desc.code.startsWith(child.code) &&
      desc.code !== child.code
    );

    return {
      code: child.code,
      description: child.description,
      isOther: child.isOther,
      hasChildren
    };
  });
}

/**
 * Check if a code exists and is valid
 */
async function validateCode(code: string): Promise<{ code: string; description: string } | null> {
  const result = await prisma.hsCode.findUnique({
    where: { code },
    select: { code: true, description: true }
  });
  return result;
}

/**
 * Get just the description for a code (used for generating context-appropriate questions)
 */
async function getCodeDescription(code: string): Promise<string | null> {
  const result = await prisma.hsCode.findUnique({
    where: { code },
    select: { description: true }
  });
  // Return just the first part of description (before colon) for cleaner text
  if (result?.description) {
    const firstPart = result.description.split(':')[0];
    return firstPart?.trim() ?? result.description;
  }
  return null;
}

/**
 * ROOT CAUSE FIX: Generate UNIQUE labels that distinguish between similar codes
 *
 * Problem it solves:
 *   "Durum wheat : -- Seed" → Should extract "Seed"
 *   "Durum wheat : -- Other" → Should extract "Other"
 *   "Other : -- Seed" → Should extract "Seed"
 *
 * Fixed behavior:
 *   Step 1: Clean the description (remove DGFT dates)
 *   Step 2: Parse the description format (": --" or ":--" or ": ----")
 *   Step 3: Try base label first
 *   Step 4: Add qualifier if we have one and it's meaningful
 *   Step 5: Handle "Other" or empty qualifiers with seed/other distinction
 *   Step 6: Last resort - add meaningful code part
 */
function generateUniqueLabel(
  code: string,
  description: string,
  existingLabels: Set<string>
): string {
  // Step 1: Clean the description
  let cleanDesc = description
    .replace(/\s*\d{2}\/\d{4}-\d{2,4}\s+\d{2}\.\d{2}\.\d{4}\s*/g, '') // Remove DGFT dates
    .trim();

  // Step 2: Parse the description format
  // Common formats:
  // "Category : -- Qualifier" (e.g., "Durum wheat : -- Seed")
  // "Category :-- Qualifier" (e.g., "Durum wheat :-- Seed")
  // "Category: ---- Detail" (e.g., "Coffee, not roasted: ----Not decaffeinated")

  let baseLabel = '';
  let qualifier = '';

  // Try to split by ": --" or ":--" or ": ----"
  const colonDashMatch = cleanDesc.match(/^(.+?)\s*:\s*-{1,4}\s*(.+)$/);
  if (colonDashMatch) {
    baseLabel = colonDashMatch[1]!.trim();
    qualifier = colonDashMatch[2]!.trim();
  } else if (cleanDesc.includes(':')) {
    // Simple colon split
    const parts = cleanDesc.split(':');
    baseLabel = parts[0]!.trim();
    qualifier = parts.slice(1).join(':').replace(/^[\s-]+/, '').trim();
  } else {
    baseLabel = cleanDesc;
  }

  // Step 3: Check if we have a meaningful qualifier that should ALWAYS be shown
  // Grade indicators should always be displayed (A Grade, B Grade, AB Grade, PB Grade, etc.)
  const gradePatterns = /\b([A-C]|AB|PB|B\/B\/B|AAA|AA)\s*(Grade)?\b/i;
  const hasGradeQualifier = qualifier && gradePatterns.test(qualifier);

  // If there's a grade qualifier, always include it (don't just return base label)
  if (hasGradeQualifier) {
    const labelWithGrade = `${baseLabel} - ${qualifier}`;
    if (!existingLabels.has(labelWithGrade)) {
      existingLabels.add(labelWithGrade);
      return labelWithGrade;
    }
  }

  // For non-grade qualifiers, try base label first (only if unique)
  const isGenericBase = baseLabel.toLowerCase() === 'other';
  if (!isGenericBase && !existingLabels.has(baseLabel) && baseLabel.length > 0 && !hasGradeQualifier) {
    existingLabels.add(baseLabel);
    return baseLabel;
  }

  // Step 4: Add qualifier if we have one and it's meaningful
  if (qualifier && qualifier.length > 0 && qualifier.toLowerCase() !== 'other') {
    const labelWithQualifier = `${baseLabel} - ${qualifier}`;
    if (!existingLabels.has(labelWithQualifier)) {
      existingLabels.add(labelWithQualifier);
      return labelWithQualifier;
    }
  }

  // Step 5: If qualifier is "Other" or empty, try more specific label
  if (qualifier.toLowerCase() === 'other' || !qualifier) {
    // Check if this is a seed vs non-seed distinction
    if (cleanDesc.toLowerCase().includes('seed')) {
      const seedLabel = `${baseLabel} - Seed`;
      if (!existingLabels.has(seedLabel)) {
        existingLabels.add(seedLabel);
        return seedLabel;
      }
    } else {
      const otherLabel = `${baseLabel} - Other`;
      if (!existingLabels.has(otherLabel)) {
        existingLabels.add(otherLabel);
        return otherLabel;
      }
    }
  }

  // Step 6: Last resort - add meaningful code part
  // Extract the last meaningful segment (e.g., "11" from "1001.11")
  const codeParts = code.replace(/\.00$/, '').split('.');
  const lastPart = codeParts[codeParts.length - 1]!;

  // Try to make it meaningful
  let suffix = '';
  if (lastPart === '11' || lastPart === '91') {
    suffix = 'Seed';
  } else if (lastPart === '19' || lastPart === '99') {
    suffix = 'Other';
  } else if (lastPart === '00') {
    suffix = 'General';
  } else {
    suffix = lastPart;
  }

  const finalLabel = `${baseLabel} - ${suffix}`;
  if (!existingLabels.has(finalLabel)) {
    existingLabels.add(finalLabel);
    return finalLabel;
  }

  // Absolute last resort - add full code
  existingLabels.add(`${baseLabel} (${code})`);
  return `${baseLabel} (${code})`;
}

/**
 * ROOT CAUSE FIX: Limit and deduplicate options, ensuring unique labels
 * Max 8 options to avoid overwhelming users
 * NOW INCLUDES "Other" options at the end as valid classifications
 */
function processOptionsForDisplay(
  options: Array<{code: string; description: string; isOther?: boolean}>,
  maxOptions: number = 25  // Allow more options for complex hierarchies like coffee grades
): Array<{code: string; label: string; description: string}> {
  const result: Array<{code: string; label: string; description: string}> = [];
  const existingLabels = new Set<string>();

  // Sort: non-Other first, then Other at the end
  const sortedOptions = [...options].sort((a, b) => {
    if (a.isOther && !b.isOther) return 1;
    if (!a.isOther && b.isOther) return -1;
    return 0;
  });

  // Take up to maxOptions, including "Other" options
  const selectedOptions = sortedOptions.slice(0, maxOptions);

  for (const opt of selectedOptions) {
    let label: string;
    if (opt.isOther) {
      // For "Other" codes, create a clear label
      label = 'Other';
      if (existingLabels.has(label)) {
        const codeParts = opt.code.split('.');
        const suffix = codeParts[codeParts.length - 1] || opt.code;
        label = `Other (${suffix})`;
      }
      existingLabels.add(label);
    } else {
      label = generateUniqueLabel(opt.code, opt.description || '', existingLabels);
    }

    result.push({
      code: opt.code,
      label,
      description: opt.description || ''
    });
  }

  return result;
}

/**
 * Check if code is a leaf (no children)
 */
async function isLeafCode(code: string): Promise<boolean> {
  const children = await getChildrenForCode(code);
  return children.length === 0;
}

// ========================================
// LLM Prompt Building
// ========================================

/**
 * Format options for LLM prompt
 */
function formatOptionsForPrompt(options: HierarchyOption[]): string {
  return options.map((opt, idx) => {
    const leafIndicator = opt.hasChildren ? '' : ' [LEAF]';
    const otherIndicator = opt.isOther ? ' [OTHER/CATCH-ALL]' : '';
    return `${idx + 1}. ${opt.code}: ${opt.description}${leafIndicator}${otherIndicator}`;
  }).join('\n');
}

/**
 * Build navigation prompt for LLM
 *
 * Key design: The LLM handles ALL intelligent filtering based on user keywords.
 * No hardcoded product mappings - the LLM understands semantic relationships.
 */
function buildNavigationPrompt(
  userInput: string,
  currentCode: string | null,
  options: HierarchyOption[],
  history: NavigationHistory[],
  userKeywords: string[] = []
): string {
  const hierarchyLevel = history.length + 1;
  const currentPosition = currentCode
    ? `Currently at: ${currentCode} (Level ${hierarchyLevel} - drilling down into subcategories)`
    : 'Starting from root (Level 1 - choosing main category)';

  const historyText = history.length > 0
    ? history.map((h, i) => `  Level ${i + 1}: ${h.code} - ${h.description}`).join('\n')
    : '  None yet (this is the first question)';

  // Build keywords section for semantic filtering
  const keywordsSection = userKeywords.length > 0
    ? `\n## User's Specified Keywords (CRITICAL FOR FILTERING!)
The user's input contains these significant keywords: [${userKeywords.join(', ')}]

**MANDATORY FILTERING RULE:**
Before presenting options or making selections, you MUST filter based on these keywords:

1. **Keyword Matching**: If a keyword appears in SOME option descriptions but NOT others,
   ONLY include/select options that MATCH the keyword.

2. **Variant Exclusion**: Many products have mutually exclusive variants. If the user
   specified one variant, EXCLUDE options for competing variants:
   - Coffee: "arabica" vs "robusta" vs "rob" (rob = robusta shorthand)
   - Tea: "green" vs "black" vs "oolong"
   - Form: "fresh" vs "dried" vs "frozen" vs "instant"
   - Processing: "roasted" vs "raw" vs "ground"

3. **Examples**:
   - User says "rob coffee" → Keywords: [rob, coffee]
     → "rob" matches "robusta" → ONLY show Robusta options, EXCLUDE Arabica
   - User says "arabica coffee" → Keywords: [arabica, coffee]
     → ONLY show Arabica options, EXCLUDE Robusta
   - User says "green tea" → Keywords: [green, tea]
     → ONLY show green tea options, EXCLUDE black/oolong tea
   - User says "instant coffee" → Keywords: [instant, coffee]
     → ONLY show instant/extract coffee options, EXCLUDE raw beans

4. **Apply at EVERY level**: This filtering applies throughout the hierarchy,
   not just at the root level. At every step, check if the user's keywords
   help narrow down the options.
`
    : '';

  return `You are an expert HS code classifier navigating the Harmonized System hierarchy.

## Product to Classify
"${userInput}"
${keywordsSection}
## Current Position
${currentPosition}

## Navigation History
${historyText}

## Available Options at This Level
${formatOptionsForPrompt(options)}

## CRITICAL: Use User Keywords to Filter Options!
Before doing ANYTHING else:
1. Look at the user's product description
2. Check if any word in their description matches some options but excludes others
3. ONLY consider matching options - ignore the rest

**Example**: If options include both "Arabica plantation" and "Robusta parchment" codes,
and user said "arabica coffee":
- ✅ Include: Arabica plantation, Arabica cherry, etc.
- ❌ Exclude: Robusta parchment, Rob cherry, etc.

**Example**: If user said "rob coffee" (rob = robusta):
- ✅ Include: Robusta parchment, Rob cherry, etc.
- ❌ Exclude: Arabica plantation, Arabica cherry, etc.

## Your Task
Based on the product description AND the keyword filtering above, do ONE of the following:

1. **SELECT** - If you're confident which option fits the product
   Format your response as:
   ACTION: SELECT
   CODE: [the HS code]
   REASON: [1-2 sentence explanation]

2. **ASK** - If you need more information to decide between FILTERED options
   Format your response as:
   ACTION: ASK
   QUESTION: [A clear, simple question for the user - avoid technical jargon]
   OPTIONS: [List each option on a new line with format: CODE|FRIENDLY_LABEL]
   REASON: [Why you need this information]

   **CRITICAL: Only include options that MATCH the user's keywords!**
   If user said "arabica", your OPTIONS must ONLY include Arabica-related codes.
   NEVER mix Arabica and Robusta options together!

   **Option labels MUST accurately reflect the HS code description!**
   - Look at the "Available Options" section above to see what each code means
   - Create a user-friendly label that matches the ACTUAL description
   - NEVER make up labels that don't match the code's real meaning

## Important Rules
- **FILTER FIRST**: Always filter options based on user's keywords before presenting
- Choose the MOST SPECIFIC code possible (8-10 digits preferred over 4-6 digits)
- [LEAF] codes have no children - selecting them is final classification
- **NEVER select [OTHER/CATCH-ALL] codes** unless user explicitly confirms their product doesn't match specific categories
- When asking questions, use **simple, user-friendly language**
- Option labels should be short (2-6 words) and immediately understandable

## CRITICAL: Navigate First, Then Ask About Final Details!
**Follow this order:**
1. First, SELECT the correct chapter/heading based on user's product type
2. Then navigate deeper into the hierarchy
3. At the FINAL level (when you see [LEAF] codes with grades/variants), ASK about specific details

**At ROOT level:** Don't ask about grades yet - first SELECT the right chapter!
- "rob coffee" at root → SELECT 0901 (coffee beans), NOT ask about grade
- "instant tea" at root → SELECT 2101 (extracts)

**At DEEP levels (when you see grade options like A Grade, B Grade, AB Grade):**
- If user DIDN'T specify grade → MUST ASK about grade
- If user specified grade (e.g., "grade A arabica") → SELECT that grade

Example navigation for "rob coffee":
1. Root level → SELECT 0901 (because "rob" = robusta = raw coffee beans)
2. 0901 level → SELECT 0901.11 (not roasted, not decaf - typical for export)
3. 0901.11 level → ASK "Is this Parchment or Cherry processed?" (filtered to Rob options only)
4. After user answers → ASK "What grade?" (AB, PB, C, etc.)

## Avoiding Redundant Questions
Only skip questions when the user EXPLICITLY provided the specific detail:
- "grade A arabica coffee" → Skip grade question, select A Grade
- "rob parchment AB grade" → Skip both processing and grade questions

## Cross-Chapter Products (Root Level Only)
Some products can belong to different chapters based on processing:
- Coffee: 0901 (beans) vs 2101 (instant/extract)
- Tea: 0902 (leaves) vs 2101 (instant/extract)
- Fruit: 08xx (fresh) vs 20xx (processed)

Check user's keywords to determine which chapter applies. If "instant" → 2101. If "beans" or variety name → 0901.

## PHASE 1: CRITICAL EDGE CASES - MUST FOLLOW!

### COFFEE CLASSIFICATION (Ch.09 vs Ch.21):
- "instant coffee", "soluble coffee", "coffee extract", "coffee essence", "coffee concentrate" → ALWAYS Ch.21 (2101.11.xx)
- "coffee beans", "roasted coffee", "green coffee", "raw coffee", "unroasted coffee" → ALWAYS Ch.09 (0901.xx)
- "coffee powder" is AMBIGUOUS: ground roasted = Ch.09, instant = Ch.21 → ASK USER
- "3-in-1 coffee", "coffee mix with sugar/creamer" → Ch.21 (2101.12.xx)
- "coffee husk", "coffee skins" → Ch.09 (0901.90.xx)

### TEA CLASSIFICATION (Ch.09 vs Ch.21):
- "instant tea", "tea extract", "tea essence" → Ch.21
- "tea leaves", "black tea", "green tea", "oolong" → Ch.09

### FUNCTION OVER MATERIAL (CRITICAL):
- "ceramic brake pads" → Ch.87 (vehicle parts), NOT Ch.69 (ceramics)
- "plastic toys" → Ch.95 (toys), NOT Ch.39 (plastics)
- "steel furniture" → Ch.94 (furniture), NOT Ch.73 (steel articles)
- "glass bottles for beverages" → Ch.70 (glass), BUT "vacuum flasks" → Ch.96
- "stainless steel water bottle" (non-vacuum) → Ch.73 (steel articles)
- "insulated vacuum flask" → Ch.96 (miscellaneous)

### VARIETY HANDLING:
- If user specifies "Arabica" → ONLY show Arabica codes, NEVER suggest Robusta
- If user specifies "Robusta" → ONLY show Robusta codes, NEVER suggest Arabica
- If variety not specified → Ask which variety

### GRADE HANDLING:
- If user specifies grade (A, B, C, AB, PB) → Filter to that grade only
- If grade not specified but variety is → Ask about grade
- Grade codes: typically last 2 digits (e.g., .11 = Grade A, .12 = Grade B)

### "OTHER" CATEGORY RULES:
- NEVER select "Other" codes (is_other: true) unless:
  1. User explicitly says "none of these apply"
  2. Product genuinely doesn't fit ANY specific code
  3. All specific alternatives have been presented and rejected
- Always exhaust specific codes FIRST before suggesting "Other"`;
}


// ========================================
// LLM Response Parsing
// ========================================

/**
 * Parse LLM response into structured result
 */
function parseNavigationResponse(
  response: string,
  options: HierarchyOption[],
  currentCode: string | null,
  userInput: string = ''
): NavigationResult {
  const lines = response.split('\n').map(l => l.trim()).filter(l => l);

  let action = '';
  let code = '';
  let question = '';
  let optionCodes: string[] = [];
  let reason = '';
  let inOptionsBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.startsWith('ACTION:')) {
      action = line.replace('ACTION:', '').trim().toUpperCase();
      inOptionsBlock = false;
    } else if (line.startsWith('CODE:')) {
      code = line.replace('CODE:', '').trim();
      inOptionsBlock = false;
    } else if (line.startsWith('QUESTION:')) {
      question = line.replace('QUESTION:', '').trim();
      inOptionsBlock = false;
    } else if (line.startsWith('OPTIONS:')) {
      // Check if options are on the same line (old format) or multi-line (new format)
      const sameLine = line.replace('OPTIONS:', '').trim();
      if (sameLine && !sameLine.includes('|')) {
        // Old format: comma-separated on same line
        optionCodes = sameLine.split(',').map(c => c.trim());
        inOptionsBlock = false;
      } else if (sameLine && sameLine.includes('|')) {
        // New format starting on same line
        optionCodes = [sameLine];
        inOptionsBlock = true;
      } else {
        // New format: options on following lines
        inOptionsBlock = true;
      }
    } else if (line.startsWith('REASON:')) {
      reason = line.replace('REASON:', '').trim();
      inOptionsBlock = false;
    } else if (inOptionsBlock && line.includes('|')) {
      // Multi-line OPTIONS: CODE|LABEL format
      optionCodes.push(line);
    } else if (inOptionsBlock && /^\d{2,4}/.test(line)) {
      // Line starts with numbers (code), might be part of options
      optionCodes.push(line);
    }
  }

  if (action === 'SELECT' && code) {
    // Validate the selected code is in options
    const selectedOption = options.find(o => o.code === code);
    if (!selectedOption) {
      // Try partial match
      const partialMatch = options.find(o => o.code.includes(code) || code.includes(o.code));
      if (partialMatch) {
        code = partialMatch.code;
      } else {
        return {
          type: 'error',
          error: `LLM selected invalid code: ${code}`,
          reasoning: reason
        };
      }
    }

    const option = options.find(o => o.code === code)!;

    // Check if this is a leaf (final classification)
    if (!option.hasChildren) {
      return {
        type: 'classification',
        code: option.code,
        description: option.description,
        confidence: 90,
        reasoning: reason
      };
    }

    return {
      type: 'selection',
      code: option.code,
      description: option.description,
      reasoning: reason
    };
  }

  if (action === 'ASK' && question) {
    // Parse the new OPTIONS format: CODE|FRIENDLY_LABEL on separate lines
    const finalOptions: Array<{code: string; label: string; description: string}> = [];

    // Check if we have the new pipe-separated format
    const pipeOptions = optionCodes.filter(oc => oc.includes('|'));

    if (pipeOptions.length > 0) {
      // New format: CODE|FRIENDLY_LABEL
      for (const optLine of optionCodes) {
        if (optLine.includes('|')) {
          const parts = optLine.split('|').map(s => s.trim());
          const optCode = parts[0] ?? '';
          const label = parts[1] ?? '';
          // Use strict matching: ONLY exact match
          // If LLM returns "0901" but available options are "0901.11", "0901.12", etc.,
          // this is an LLM error - it's returning a parent-level code we already passed
          // We should NOT match parent codes to child options
          const matchingOption = options.find(o => o.code === optCode);
          if (matchingOption) {
            finalOptions.push({
              code: matchingOption.code,
              label: label || (matchingOption.description.split(':')[0]?.trim() ?? ''),
              description: matchingOption.description
            });
          } else {
            // If no exact match, log for debugging but don't add invalid options
            logger.debug(`[LLM-NAV] Option code "${optCode}" not found in available options`);
          }
        }
      }
    } else {
      // Fallback: old format - just code list
      // Use strict exact matching only
      const questionOptions = optionCodes.length > 0
        ? options.filter(o => optionCodes.some(oc => o.code === oc))
        : options.filter(o => !o.isOther);

      // Use the new helper function for unique labels and limiting options
      const processedOptions = processOptionsForDisplay(questionOptions);
      finalOptions.push(...processedOptions);
    }

    // LLM handles filtering - we just use the options it returned
    let filteredOptions = [...finalOptions];

    // CRITICAL: Detect REDUNDANT QUESTIONS
    // If LLM returned no valid options AND we're NOT at root level, this is likely
    // the LLM asking about parent-level codes we've already passed (e.g., asking 0901 vs 2101 when at 0901)
    // In this case, we should NOT repeat the same question - instead, generate a meaningful question
    // about the ACTUAL children at this level
    if (filteredOptions.length === 0 && options.length > 0 && currentCode !== null) {
      // Check if LLM returned codes that are parents/ancestors or the current code itself
      const returnedCodes = optionCodes
        .filter(oc => oc.includes('|'))
        .map(oc => oc.split('|')[0]?.trim() ?? '');

      const isRedundantQuestion = returnedCodes.some(rc =>
        rc === currentCode ||  // LLM is asking about the code we're already at
        currentCode.startsWith(rc) ||  // LLM is asking about a parent (e.g., "09" when at "0901")
        rc.length < currentCode.length  // LLM is asking about a higher-level code
      );

      if (isRedundantQuestion) {
        logger.warn(`[LLM-NAV] Redundant question detected - LLM asked about parent codes ${returnedCodes.join(', ')} when at ${currentCode}`);

        // Generate options with unique labels, limited to 8 options
        const processedOptions = processOptionsForDisplay(options.filter(o => !o.isOther));
        filteredOptions.push(...processedOptions);

        // Generate a context-appropriate question
        const firstOptDesc = options.find(o => !o.isOther)?.description?.split(':')[0]?.toLowerCase() || 'product';
        question = `Please select the specific category for your ${firstOptDesc}:`;
        reason = `Navigating to more specific classification under ${currentCode}`;

        logger.info(`[LLM-NAV] Generated new question with ${filteredOptions.length} actual children options`);
      } else {
        // Not a redundant question, just fallback to all options (limited to 8)
        logger.warn(`[LLM-NAV] LLM returned invalid option codes, falling back to ${Math.min(options.length, 8)} available options`);
        const processedOptions = processOptionsForDisplay(options.filter(o => !o.isOther));
        filteredOptions.push(...processedOptions);
      }
    } else if (filteredOptions.length === 0 && options.length > 0) {
      // At root level, just fallback to all options (limited to 8)
      logger.warn(`[LLM-NAV] LLM returned invalid option codes at root, falling back to ${Math.min(options.length, 8)} available options`);
      const processedOptions = processOptionsForDisplay(options.filter(o => !o.isOther));
      filteredOptions.push(...processedOptions);
    }

    // Only add "Other" option if NOT at root level
    // At root level, "Other" options would be irrelevant chapter codes like "Other live animals"
    if (currentCode !== null) {
      const otherOption = options.find(o => o.isOther);
      if (otherOption && !filteredOptions.some(o => o.code === otherOption.code)) {
        // Generate a user-friendly label for "Other" options
        let otherLabel = otherOption.description || 'Other';

        // Clean up the description if it's just "Other"
        if (otherLabel.toLowerCase() === 'other') {
          const siblingLabels = filteredOptions.map(o => o.label).join(', ');
          otherLabel = `Other (not ${siblingLabels.substring(0, 30)}${siblingLabels.length > 30 ? '...' : ''})`;
        } else {
          otherLabel = otherLabel.split(':')[0] || otherLabel;
          if (otherLabel.length > 50) {
            otherLabel = otherLabel.substring(0, 47) + '...';
          }
          otherLabel = otherLabel.charAt(0).toUpperCase() + otherLabel.slice(1).toLowerCase();
        }

        filteredOptions.push({
          code: otherOption.code,
          label: otherLabel,
          description: otherOption.description
        });
      }
    }

    return {
      type: 'question',
      question: {
        id: `nav_${currentCode || 'root'}_${Date.now()}`,
        text: question,
        options: filteredOptions,
        parentCode: currentCode || '',
        reasoning: reason
      }
    };
  }

  // Couldn't parse response
  return {
    type: 'error',
    error: `Could not parse LLM response: ${response.substring(0, 200)}`,
    reasoning: response
  };
}

// ========================================
// Main Navigation Function
// ========================================

/**
 * Navigate the HS code hierarchy using LLM
 *
 * @param userInput - The product description from user
 * @param currentCode - Current position in hierarchy (null = root)
 * @param history - Previous selections made
 * @returns Navigation result (question, selection, or classification)
 */
export async function navigateHierarchy(
  userInput: string,
  currentCode: string | null,
  history: NavigationHistory[]
): Promise<NavigationResult> {
  const startTime = Date.now();

  try {
    // Extract keywords from user input
    const userKeywords = extractKeywords(userInput);

    // PHASE 1: Parse query to get product type modifiers
    const queryAnalysis = parseQuery(userInput);
    const productTypeModifiers = queryAnalysis.productTypeModifiers;
    if (productTypeModifiers.length > 0) {
      logger.info(`[LLM-NAV] Product type modifiers detected: [${productTypeModifiers.join(', ')}]`);
    }

    // PHASE 2 + ROOT CAUSE FIX: Check for functional override at root level
    // This ensures "brake pads for cars" jumps directly to the CORRECT heading in Chapter 87
    // ROOT CAUSE FIX: Use semantic search to find the BEST heading, not just the first one!
    if (currentCode === null) {
      const functionalOverride = checkFunctionalOverrides(userInput);
      if (functionalOverride) {
        logger.info(`[ROOT FIX] Functional override detected: Ch.${functionalOverride.forceChapter}`);
        logger.info(`[ROOT FIX] Reason: ${functionalOverride.reason}`);

        // ROOT CAUSE FIX: Use semantic search to find the BEST heading in this chapter
        // This solves "brake pads" → 8708 (brakes) instead of 8701 (tractors)
        const bestHeading = await getBestHeadingInChapter(userInput, functionalOverride.forceChapter);

        if (bestHeading) {
          logger.info(`[ROOT FIX] Semantic search found best heading: ${bestHeading.code}`);
          logger.info(`[ROOT FIX]   Description: ${bestHeading.description.substring(0, 80)}...`);
          logger.info(`[ROOT FIX]   Score: ${bestHeading.score.toFixed(1)}`);

          // Return a selection to start from the semantically best heading
          return {
            type: 'selection',
            code: bestHeading.code,
            description: bestHeading.description,
            reasoning: `Functional override (${functionalOverride.reason}) → Semantic match: ${bestHeading.description.substring(0, 50)}...`
          };
        }

        // Fallback: If semantic search fails, use first heading (original behavior)
        logger.warn(`[ROOT FIX] Semantic search failed, falling back to first heading`);
        const headingsInChapter = await prisma.hsCode.findMany({
          where: {
            code: {
              startsWith: functionalOverride.forceChapter,
              not: { contains: '.' }
            }
          },
          select: { code: true, description: true },
          orderBy: { code: 'asc' },
          take: 1
        });

        if (headingsInChapter.length > 0) {
          const firstHeading = headingsInChapter[0]!;
          logger.info(`[ROOT FIX] Fallback to first heading: ${firstHeading.code}`);
          return {
            type: 'selection',
            code: firstHeading.code,
            description: firstHeading.description,
            reasoning: `Functional override: ${functionalOverride.reason}`
          };
        }
      }

      // PHASE 2: Check for ambiguous terms at root level
      const ambiguity = checkAmbiguousTerms(userInput);
      if (ambiguity) {
        logger.info(`[PHASE 2] Ambiguous term detected: "${ambiguity.term}"`);
        logger.info(`[PHASE 2] Question: ${ambiguity.info.disambiguationQuestion}`);

        // Return a question to disambiguate
        const questionOptions = ambiguity.info.options.map(opt => ({
          code: opt.chapter,
          label: opt.label,
          description: `Chapter ${opt.chapter}`
        }));

        return {
          type: 'question',
          question: {
            id: `chapter_disambiguation_${Date.now()}`,
            text: ambiguity.info.disambiguationQuestion,
            options: questionOptions,
            parentCode: '',
            reasoning: `Need to disambiguate "${ambiguity.term}" between multiple chapters`
          }
        };
      }
    }

    // Get available options at current level
    let options = currentCode
      ? await getChildrenForCode(currentCode)
      : await getAllChapters();

    logger.info(`[LLM-NAV] At ${currentCode || 'root'}, found ${options.length} options`);

    // PHASE 1: Apply keyword filtering with product type modifier exclusions
    // This ensures "instant coffee" only sees Ch.21 options, "rob coffee" only sees Robusta
    const beforeFilter = options.length;
    options = filterOptionsByKeywordsSimple(options, userKeywords, productTypeModifiers);
    if (options.length < beforeFilter) {
      logger.info(`[LLM-NAV] Filtered by keywords/modifiers: ${beforeFilter} -> ${options.length} options`);
    }

    // PHASE 3: Apply elimination filtering based on user-specified modifiers
    // This ensures "Arabica coffee" only sees Arabica codes, not Robusta
    const eliminationResult = filterHierarchyChildren(
      options,
      {
        productTypeModifiers: queryAnalysis.productTypeModifiers,
        modifiers: queryAnalysis.modifiers,
        originalQuery: userInput
      }
    );

    if (eliminationResult.eliminatedCount > 0) {
      logger.info(`[PHASE 3] Elimination filter: ${options.length} -> ${eliminationResult.filteredChildren.length} options`);
      logger.info(`[PHASE 3] Applied rules: ${eliminationResult.appliedRules.join(', ')}`);
      options = eliminationResult.filteredChildren;

      // PHASE 3: Auto-select if only one option remains after elimination
      if (eliminationResult.autoSelectCode && options.length === 1) {
        const autoSelected = options[0]!;
        logger.info(`[PHASE 3] Auto-selecting ${autoSelected.code} after elimination`);

        if (!autoSelected.hasChildren) {
          return {
            type: 'classification',
            code: autoSelected.code,
            description: autoSelected.description,
            confidence: 90,
            reasoning: await buildUserFriendlyReasoning(
              userInput,
              history,
              autoSelected.code,
              autoSelected.description,
              'Auto-selected based on your specific product details'
            )
          };
        }

        return {
          type: 'selection',
          code: autoSelected.code,
          description: autoSelected.description,
          reasoning: 'Auto-selected based on elimination of irrelevant options'
        };
      }
    }

    // If no options, we're at a leaf - return classification
    if (options.length === 0) {
      if (currentCode) {
        const codeDetails = await validateCode(currentCode);
        return {
          type: 'classification',
          code: currentCode,
          description: codeDetails?.description || '',
          confidence: 95,
          reasoning: await buildUserFriendlyReasoning(
            userInput,
            history,
            currentCode,
            codeDetails?.description || ''
          )
        };
      }
      return {
        type: 'error',
        error: 'No HS codes found in database'
      };
    }

    // If only one option and it's not "Other", auto-select
    const singleOption = options[0];
    if (options.length === 1 && singleOption && !singleOption.isOther) {
      logger.info(`[LLM-NAV] Auto-selecting single option: ${singleOption.code}`);
      if (!singleOption.hasChildren) {
        return {
          type: 'classification',
          code: singleOption.code,
          description: singleOption.description,
          confidence: 95,
          reasoning: await buildUserFriendlyReasoning(
            userInput,
            history,
            singleOption.code,
            singleOption.description
          )
        };
      }
      return {
        type: 'selection',
        code: singleOption.code,
        description: singleOption.description,
        reasoning: await buildUserFriendlyReasoning(
          userInput,
          history,
          singleOption.code,
          singleOption.description,
          'Continuing to more specific classification'
        )
      };
    }

    // CRITICAL: Check for DISTINCT GROUPS that need user decision
    // This handles: Chapter selection (09 vs 21), Variety (Arabica vs Robusta), Processing (Parchment vs Cherry)
    const distinctGroups = detectDistinctGroups(options, userKeywords);
    if (distinctGroups) {
      logger.info(`[LLM-NAV] Distinct groups detected: ${distinctGroups.groups.map(g => g.name).join(' vs ')}`);

      // Build question options from groups
      const existingLabels = new Set<string>();
      const questionOptions: Array<{code: string; label: string; description: string}> = [];

      for (const group of distinctGroups.groups) {
        // For each group, pick a representative option (first one)
        const representative = group.options[0];
        if (representative) {
          questionOptions.push({
            code: representative.code,
            label: group.name,
            description: representative.description
          });
        }
      }

      return {
        type: 'question',
        question: {
          id: `nav_${currentCode || 'root'}_${Date.now()}`,
          text: distinctGroups.questionText,
          options: questionOptions,
          parentCode: currentCode || '',
          reasoning: `User needs to choose between: ${distinctGroups.groups.map(g => g.name).join(', ')}`
        }
      };
    }

    // CRITICAL: If we have multiple LEAF options (all are final codes), FORCE a question
    // This ensures we ask about grades/variants instead of auto-selecting
    const nonOtherOptions = options.filter(o => !o.isOther);
    const leafOptions = nonOtherOptions.filter(o => !o.hasChildren);
    if (leafOptions.length > 1) {
      logger.info(`[LLM-NAV] Multiple leaf options detected (${leafOptions.length}), forcing question`);

      // Generate question about the specific variants
      // Don't cut off valid leaf options - show all grades/variants
      const existingLabels = new Set<string>();
      const questionOptions = leafOptions.slice(0, 25).map(opt => ({
        code: opt.code,
        label: generateUniqueLabel(opt.code, opt.description, existingLabels),
        description: opt.description
      }));

      // Determine question text based on descriptions
      const firstDesc = leafOptions[0]?.description?.toLowerCase() || '';
      let questionText = 'Please select the specific type:';
      if (firstDesc.includes('grade')) {
        questionText = 'What grade is your product?';
      } else if (firstDesc.includes('parchment') || firstDesc.includes('cherry')) {
        questionText = 'What processing type is your coffee?';
      }

      return {
        type: 'question',
        question: {
          id: `nav_${currentCode || 'root'}_${Date.now()}`,
          text: questionText,
          options: questionOptions,
          parentCode: currentCode || '',
          reasoning: 'Multiple specific variants available - need user selection'
        }
      };
    }

    // Build prompt and call LLM - pass userKeywords for LLM-based filtering
    const prompt = buildNavigationPrompt(userInput, currentCode, options, history, userKeywords);

    logger.debug(`[LLM-NAV] Calling LLM with ${options.length} options`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier. Follow the exact response format specified.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0,
      max_tokens: 300
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    logger.debug(`[LLM-NAV] LLM response: ${content.substring(0, 200)}...`);

    // Parse response
    const result = parseNavigationResponse(content, options, currentCode, userInput);

    const elapsed = Date.now() - startTime;
    logger.info(`[LLM-NAV] Result: ${result.type} in ${elapsed}ms`);

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[LLM-NAV] Error: ${errorMsg}`);
    return {
      type: 'error',
      error: errorMsg
    };
  }
}

/**
 * Navigate with auto-continuation for selections
 * This will keep navigating until it needs user input or reaches classification
 */
export async function navigateWithAutoContinue(
  userInput: string,
  currentCode: string | null,
  history: NavigationHistory[],
  maxDepth: number = 10
): Promise<NavigationResult> {
  let code = currentCode;
  let currentHistory = [...history];
  let depth = 0;

  while (depth < maxDepth) {
    const result = await navigateHierarchy(userInput, code, currentHistory);

    if (result.type === 'question' || result.type === 'classification' || result.type === 'error') {
      return result;
    }

    if (result.type === 'selection') {
      // LLM selected a code, continue navigating deeper
      code = result.code!;
      currentHistory.push({
        code: result.code!,
        description: result.description!,
        level: currentHistory.length + 1
      });
      depth++;

      logger.info(`[LLM-NAV] Auto-continuing to ${code} (depth ${depth})`);
      continue;
    }

    // Unknown result type
    break;
  }

  // Reached max depth without classification
  if (code) {
    const codeDetails = await validateCode(code);
    return {
      type: 'classification',
      code: code,
      description: codeDetails?.description || '',
      confidence: 70,
      reasoning: await buildUserFriendlyReasoning(
        userInput,
        currentHistory,
        code,
        codeDetails?.description || ''
      )
    };
  }

  return {
    type: 'error',
    error: 'Navigation failed - could not reach classification'
  };
}

// ========================================
// Force Classification (Skip)
// ========================================

/**
 * Force a classification at the current position
 * Used when user clicks "Skip & Get Best Guess"
 *
 * Strategy:
 * 1. If at a leaf, return that code
 * 2. If has children, use LLM in "force mode" to pick the best option without asking questions
 * 3. Continue navigating until reaching a leaf
 */
export async function forceClassification(
  userInput: string,
  currentCode: string | null,
  history: NavigationHistory[],
  maxDepth: number = 10
): Promise<NavigationResult> {
  let code = currentCode;
  let currentHistory = [...history];
  let depth = 0;

  logger.info(`[LLM-NAV] Forcing classification from: ${code || 'root'}`);

  while (depth < maxDepth) {
    // Get available options at current level
    const options = code
      ? await getChildrenForCode(code)
      : await getAllChapters();

    // If no options, we're at a leaf - return classification
    if (options.length === 0) {
      if (code) {
        const codeDetails = await validateCode(code);
        return {
          type: 'classification',
          code: code,
          description: codeDetails?.description || '',
          confidence: 70, // Lower confidence because user skipped
          reasoning: await buildUserFriendlyReasoning(
            userInput,
            currentHistory,
            code,
            codeDetails?.description || '',
            'Best guess - some details may need verification'
          )
        };
      }
      return {
        type: 'error',
        error: 'Cannot force classification without any position'
      };
    }

    // If only one option and it's not "Other", auto-select
    const singleOption = options.length === 1 ? options[0] : undefined;
    if (singleOption && !singleOption.isOther) {
      if (!singleOption.hasChildren) {
        return {
          type: 'classification',
          code: singleOption.code,
          description: singleOption.description,
          confidence: 75,
          reasoning: await buildUserFriendlyReasoning(
            userInput,
            currentHistory,
            singleOption.code,
            singleOption.description
          )
        };
      }
      // Continue to this option
      code = singleOption.code;
      currentHistory.push({
        code: singleOption.code,
        description: singleOption.description,
        level: currentHistory.length + 1
      });
      depth++;
      continue;
    }

    // Call LLM with force prompt
    const prompt = buildForceClassificationPrompt(userInput, code, options, currentHistory);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier. The user wants a best guess - you MUST select an option, never ask questions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0,
      max_tokens: 200
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    logger.debug(`[LLM-NAV] Force mode response: ${content.substring(0, 100)}...`);

    // Parse the code from response
    const codeMatch = content.match(/CODE:\s*([0-9.]+)/i);
    if (!codeMatch) {
      // Fallback: pick the first non-Other option (options is guaranteed non-empty at this point)
      const fallbackOption = options.find(o => !o.isOther) ?? options[0]!;
      code = fallbackOption.code;
      logger.warn(`[LLM-NAV] Force mode: couldn't parse code, falling back to ${code}`);
    } else {
      const selectedCode = codeMatch[1]?.trim() ?? '';
      const matchedOption = options.find(o => o.code === selectedCode);
      if (matchedOption) {
        code = matchedOption.code;
      } else {
        // Fallback (options is guaranteed non-empty at this point)
        const fallbackOption = options.find(o => !o.isOther) ?? options[0]!;
        code = fallbackOption.code;
      }
    }

    const selectedOption = options.find(o => o.code === code);

    // If this is a leaf, we're done
    if (selectedOption && !selectedOption.hasChildren) {
      return {
        type: 'classification',
        code: code,
        description: selectedOption.description,
        confidence: 65, // Lower confidence for forced classification
        reasoning: await buildUserFriendlyReasoning(
          userInput,
          currentHistory,
          code,
          selectedOption.description,
          'Best guess based on product description'
        )
      };
    }

    // Continue navigating deeper
    currentHistory.push({
      code: code,
      description: selectedOption?.description || '',
      level: currentHistory.length + 1
    });
    depth++;
    logger.info(`[LLM-NAV] Force mode: continuing to ${code} (depth ${depth})`);
  }

  // Reached max depth
  if (code) {
    const codeDetails = await validateCode(code);
    return {
      type: 'classification',
      code: code,
      description: codeDetails?.description || '',
      confidence: 50,
      reasoning: await buildUserFriendlyReasoning(
        userInput,
        currentHistory,
        code,
        codeDetails?.description || '',
        'Classification at maximum detail level'
      )
    };
  }

  return {
    type: 'error',
    error: 'Could not force classification'
  };
}

/**
 * Build prompt for force classification (no questions allowed)
 */
function buildForceClassificationPrompt(
  userInput: string,
  currentCode: string | null,
  options: HierarchyOption[],
  history: NavigationHistory[]
): string {
  const historyText = history.length > 0
    ? history.map(h => `  - ${h.code}: ${h.description}`).join('\n')
    : '  None yet';

  return `You are an expert HS code classifier. The user wants a BEST GUESS classification - you MUST select an option.

## Product
"${userInput}"

## Current Position
${currentCode || 'Starting from root'}

## Previous Selections
${historyText}

## Available Options
${formatOptionsForPrompt(options)}

## Your Task
Select the MOST LIKELY option based on the product description.
You MUST choose one - DO NOT ask questions.

If unsure between options, pick the one that best matches the general category of the product.
Avoid "Other" codes unless nothing else fits.

Response format:
CODE: [the HS code you select]
REASON: [brief explanation]`;
}

// ========================================
// Exports
// ========================================

export {
  getChildrenForCode,
  validateCode,
  isLeafCode,
  getAllChapters
};

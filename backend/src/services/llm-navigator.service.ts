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

  // All headings have children in HS code structure
  return headings.map(h => ({
    code: h.code,
    description: h.description,
    isOther: h.isOther,
    hasChildren: true // Headings always have subheadings underneath
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
 */
function buildNavigationPrompt(
  userInput: string,
  currentCode: string | null,
  options: HierarchyOption[],
  history: NavigationHistory[]
): string {
  const hierarchyLevel = history.length + 1;
  const currentPosition = currentCode
    ? `Currently at: ${currentCode} (Level ${hierarchyLevel} - drilling down into subcategories)`
    : 'Starting from root (Level 1 - choosing main category)';

  const historyText = history.length > 0
    ? history.map((h, i) => `  Level ${i + 1}: ${h.code} - ${h.description}`).join('\n')
    : '  None yet (this is the first question)';

  return `You are an expert HS code classifier navigating the Harmonized System hierarchy.

## Product to Classify
"${userInput}"

## Current Position
${currentPosition}

## Navigation History
${historyText}

## Available Options at This Level
${formatOptionsForPrompt(options)}

## Your Task
Based on the product description, do ONE of the following:

1. **SELECT** - If you're confident which option fits the product
   Format your response as:
   ACTION: SELECT
   CODE: [the HS code]
   REASON: [1-2 sentence explanation]

2. **ASK** - If you need more information to decide between options
   Format your response as:
   ACTION: ASK
   QUESTION: [A clear, simple question for the user - avoid technical jargon]
   OPTIONS: [List each option on a new line with format: CODE|FRIENDLY_LABEL]
   REASON: [Why you need this information]

   **CRITICAL: Option labels MUST accurately reflect the HS code description!**
   - Look at the "Available Options" section above to see what each code means
   - Create a user-friendly label that matches the ACTUAL description
   - NEVER make up labels that don't match the code's real meaning

   Example: If option is "2101.30.10: Roasted chicory [LEAF]"
   - GOOD: 2101.30.10|Roasted chicory
   - BAD: 2101.30.10|Instant coffee ← WRONG! This doesn't match the description!

## Important Rules
- Choose the MOST SPECIFIC code possible (8-10 digits preferred over 4-6 digits)
- [LEAF] codes have no children - selecting them is final classification
- **CRITICAL: NEVER select [OTHER/CATCH-ALL] codes unless the user has EXPLICITLY confirmed their product doesn't match any specific category**
- If the user's input is vague or doesn't specify details (like grade, variety, type), you MUST ASK a clarifying question
- "Other" means the user's product genuinely doesn't fit ANY specific category - NOT that they didn't mention details
- When in doubt, ASK. It's better to ask one question than to wrongly classify as "Other"
- Consider the ENTIRE product description, including form, material, and purpose
- When asking questions, use **simple, user-friendly language** - NOT technical HS code descriptions
- Option labels should be short (2-6 words) and immediately understandable to a non-expert
- **NEVER use "Other" or "None of the above" as an option label** - instead describe what the "Other" category actually means
  - BAD: "0811.90.90|Other"
  - GOOD: "0811.90.90|Without added sugar"
  - BAD: "0901.90|Other coffee"
  - GOOD: "0901.90|Coffee husks or skins"

## CRITICAL: Generate UNIQUE Questions for Each Level
**NEVER repeat the same question text at different hierarchy levels!**
Each question MUST be specific to the current options being presented.
Look at the "Current Position" to see what level you're at - use this to craft appropriate questions.

**Question patterns by level:**
- Level 1 (root): Ask about FORM or CATEGORY - "What form is your [product] in?"
- Level 2: Ask about TYPE or VARIETY - "What type of [specific category] is this?"
- Level 3: Ask about SPECIFIC CHARACTERISTICS - "Is this [characteristic A] or [characteristic B]?"
- Level 4+: Ask about FINAL DETAILS - "Does this contain [ingredient]?" or "Is this [specific variant]?"

BAD (same question repeated):
- Level 1: "What form is your coffee product in?"
- Level 2: "What form is your coffee product in?" ← WRONG! Question should change!

GOOD (contextually appropriate questions):
- Level 1: "What form is your coffee product in?" (raw vs processed)
- Level 2: "Is this actual coffee extract or a coffee substitute?" (type within category)
- Level 3: "Is this roasted chicory or another coffee substitute?" (specific variant)

## Examples of Good Questions with User-Friendly Options
- Question: "What form is your coffee in?"
  OPTIONS:
  0901|Raw or roasted coffee beans
  2101|Instant coffee or coffee extract

- Question: "What type of wheat is this?"
  OPTIONS:
  1001.11|Durum wheat (for pasta)
  1001.91|Common wheat (for bread)

- Question: "Is this for planting or consumption?"
  OPTIONS:
  1001.11|Seeds for planting
  1001.19|For eating/processing

## When to Select "Other"
ONLY select an [OTHER/CATCH-ALL] code if:
1. The user explicitly says their product doesn't match any listed category, OR
2. You've already asked clarifying questions and the answers confirm it doesn't fit specific codes

## CRITICAL: Cross-Chapter Awareness (WHEN AT ROOT LEVEL)
Some products can belong to DIFFERENT chapters depending on their form or processing level.
When classifying these products FROM THE ROOT LEVEL (before selecting a heading), you MUST ASK about form/processing.

**IMPORTANT: Only include the EXACT heading codes listed below - do NOT add any other codes!**

| Product Term | ONLY These Headings (4-digit codes) |
|--------------|-------------------------------------|
| coffee       | 0901 (raw/roasted beans) OR 2101 (instant coffee, extracts) |
| tea          | 0902 (tea leaves) OR 2101 (tea extracts, instant tea) |
| cocoa        | 1801-1805 (cocoa products) OR 1905-1906 (chocolate products) |
| milk         | 0401-0402 (liquid milk) OR 1901 (milk-based preparations) |
| fruit        | 0801-0814 (fresh fruit) OR 2001-2009 (preserved fruit) |
| vegetables   | 0701-0714 (fresh vegetables) OR 2001-2005 (preserved vegetables) |
| meat         | 0201-0210 (fresh meat) OR 1601-1602 (prepared meat) |
| fish         | 0301-0307 (fresh fish) OR 1604-1605 (prepared fish) |

**Rules:**
1. Check if the user's description already clarifies the form (e.g., "instant coffee" = 2101, "green coffee beans" = 0901)
2. If NOT clarified, you MUST ASK about the form/processing level BEFORE selecting a heading
3. **ONLY include options from the headings listed above - NEVER add other unrelated headings!**

Example for "coffee" at root level (EXACTLY 2 options, no more):
ACTION: ASK
QUESTION: What form is your coffee product in?
OPTIONS:
0901|Raw or roasted coffee beans
2101|Instant coffee, coffee extract, or coffee essence
REASON: Coffee products can be classified in different chapters depending on their processing level`;
}

// ========================================
// Cross-Chapter Product Filtering
// ========================================

/**
 * Known cross-chapter products and their valid chapter codes
 * This filters out LLM hallucinations that add irrelevant chapters
 */
const CROSS_CHAPTER_PRODUCTS: Record<string, string[]> = {
  'coffee': ['09', '21'],
  'tea': ['09', '21'],
  'cocoa': ['18', '19'],
  'chocolate': ['17', '18', '19'],
  'milk': ['04', '19'],
  'fruit': ['08', '20'],
  'vegetable': ['07', '20'],
  'vegetables': ['07', '20'],
  'meat': ['02', '16'],
  'fish': ['03', '16'],
  'seafood': ['03', '16'],
};

/**
 * PRE-FILTER root options BEFORE sending to LLM to reduce token usage
 * For known cross-chapter products, only send relevant chapter headings
 * This reduces prompts from 1125 options (~20K tokens) to 2-10 options (~500 tokens)
 */
function preFilterRootOptions(
  userInput: string,
  options: HierarchyOption[]
): HierarchyOption[] {
  const inputLower = userInput.toLowerCase();

  // Check for cross-chapter products
  for (const [product, validChapters] of Object.entries(CROSS_CHAPTER_PRODUCTS)) {
    if (inputLower.includes(product)) {
      // Filter to only include headings from valid chapters
      const filtered = options.filter(opt => {
        const chapterCode = opt.code.substring(0, 2);
        return validChapters.includes(chapterCode);
      });

      if (filtered.length > 0) {
        logger.info(`[LLM-NAV] Cross-chapter product "${product}" - filtered to chapters: ${validChapters.join(', ')}`);
        return filtered;
      }
    }
  }

  // If no cross-chapter match, return original (will use full list)
  // TODO: Add keyword-based filtering for other products to further reduce tokens
  return options;
}

/**
 * Filter options to only include valid chapters for cross-chapter products
 * This prevents the LLM from hallucinating irrelevant chapters
 * Works with both 2-digit chapter codes (09) and 4-digit heading codes (0901)
 */
function filterCrossChapterOptions(
  userInput: string,
  options: Array<{code: string; label: string; description: string}>,
  currentCode: string | null
): Array<{code: string; label: string; description: string}> {
  // Only apply at root level (no current code)
  if (currentCode !== null) {
    return options;
  }

  // Check if user input matches any cross-chapter product
  const inputLower = userInput.toLowerCase();
  for (const [product, validChapters] of Object.entries(CROSS_CHAPTER_PRODUCTS)) {
    if (inputLower.includes(product)) {
      // Filter options to only include valid chapters
      // Handle both 2-digit (09) and 4-digit (0901) codes
      const filtered = options.filter(opt => {
        // Extract chapter from code: "09" -> "09", "0901" -> "09", "0901.11" -> "09"
        const chapterCode = opt.code.replace(/\./g, '').substring(0, 2);
        return validChapters.includes(chapterCode);
      });

      // Only return filtered if we found matching options
      if (filtered.length > 0) {
        return filtered;
      }
    }
  }

  return options;
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
          const matchingOption = options.find(o => o.code === optCode || o.code.includes(optCode) || optCode.includes(o.code));
          if (matchingOption) {
            finalOptions.push({
              code: matchingOption.code,
              label: label || (matchingOption.description.split(':')[0]?.trim() ?? ''),
              description: matchingOption.description
            });
          }
        }
      }
    } else {
      // Fallback: old format - just code list
      const questionOptions = optionCodes.length > 0
        ? options.filter(o => optionCodes.some(oc => o.code.includes(oc) || oc.includes(o.code)))
        : options.filter(o => !o.isOther);

      for (const opt of questionOptions) {
        // Generate user-friendly label from description
        const desc = opt.description || '';
        // Take first part before colon, or first few words
        let label = desc.split(':')[0] || desc;
        // Truncate long labels and clean up
        if (label.length > 50) {
          label = label.substring(0, 47) + '...';
        }
        // Convert to sentence case
        label = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();

        finalOptions.push({
          code: opt.code,
          label: label.trim(),
          description: desc
        });
      }
    }

    // Filter out irrelevant chapters for cross-chapter products FIRST
    // This must happen before adding "Other" options
    let filteredOptions = filterCrossChapterOptions(userInput, finalOptions, currentCode);

    // Check if this is a cross-chapter question at root level
    // We need to check BOTH if filtering occurred AND if the product matches cross-chapter products
    const inputLower = userInput.toLowerCase();
    const isCrossChapterProduct = Object.keys(CROSS_CHAPTER_PRODUCTS).some(product =>
      inputLower.includes(product)
    );
    const isCrossChapterQuestion = currentCode === null && isCrossChapterProduct;

    // Only add "Other" option if NOT at root level cross-chapter question
    // Cross-chapter questions are specifically about form/processing, not "other"
    if (!isCrossChapterQuestion) {
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
    // Get available options at current level
    let options = currentCode
      ? await getChildrenForCode(currentCode)
      : await getAllChapters();

    // PRE-FILTER at root level to reduce token usage
    // For cross-chapter products, only send relevant chapters to LLM
    if (currentCode === null) {
      const filteredOptions = preFilterRootOptions(userInput, options);
      if (filteredOptions.length > 0 && filteredOptions.length < options.length) {
        logger.info(`[LLM-NAV] Pre-filtered from ${options.length} to ${filteredOptions.length} options`);
        options = filteredOptions;
      }
    }

    logger.info(`[LLM-NAV] At ${currentCode || 'root'}, found ${options.length} options`);

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

    // Build prompt and call LLM
    const prompt = buildNavigationPrompt(userInput, currentCode, options, history);

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

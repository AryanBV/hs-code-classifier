/**
 * Exclusion-Based Classifier Service
 *
 * Handles "Other" codes classification using exclusion logic.
 *
 * In HS nomenclature:
 * - Specific codes describe particular products (e.g., "flavoured instant coffee")
 * - "Other" codes are catch-alls for products NOT matching specific codes
 *
 * Classification logic for "Other" codes:
 * 1. Find all sibling codes under the same parent
 * 2. Identify which are "specific" vs "other"
 * 3. If product DOESN'T match ANY specific code → it goes to "Other"
 *
 * Example:
 *   2101.11.10 = Instant coffee, flavoured
 *   2101.11.20 = Instant coffee, Other
 *
 *   "unflavored instant coffee" → doesn't match "flavoured" → goes to "Other" (2101.11.20)
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ========================================
// Types
// ========================================

export interface SiblingCode {
  code: string;
  description: string;
  isOther: boolean;
  specificTerms: string[];  // Key terms that define this code
  exclusionTerms: string[]; // Terms that would EXCLUDE a product from this code
}

export interface ExclusionAnalysis {
  parentCode: string;
  parentDescription: string;
  siblings: SiblingCode[];
  hasOtherCode: boolean;
  otherCode: SiblingCode | null;
  specificCodes: SiblingCode[];
}

export interface ClassificationDecision {
  matchedCode: string | null;
  isOtherClassification: boolean;
  reasoning: string;
  matchedSpecificTerms: string[];
  excludedFromCodes: string[];
}

// ========================================
// Main Functions
// ========================================

/**
 * Analyze sibling codes under a parent to understand "Other" vs "Specific" codes
 */
export async function analyzeExclusionContext(parentCode: string): Promise<ExclusionAnalysis | null> {
  try {
    // Get parent code details
    const parent = await prisma.hsCode.findFirst({
      where: { code: parentCode },
      select: { code: true, description: true, notes: true }
    });

    if (!parent) {
      return null;
    }

    // Get all sibling codes (children of same parent)
    const siblings = await prisma.hsCode.findMany({
      where: {
        code: { startsWith: parentCode },
        NOT: { code: parentCode }
      },
      select: { code: true, description: true, isOther: true, notes: true },
      orderBy: { code: 'asc' }
    });

    // Filter to direct children only (same level)
    const parentLevel = getCodeDigits(parentCode);
    const targetLevel = parentLevel + 2;

    const directSiblings = siblings.filter(s => getCodeDigits(s.code) === targetLevel);

    if (directSiblings.length === 0) {
      return null;
    }

    // Analyze each sibling
    const analyzedSiblings: SiblingCode[] = directSiblings.map(sibling => {
      const isOther = isOtherCode(sibling.description, sibling.isOther);
      const specificTerms = extractSpecificTerms(sibling.description);
      const exclusionTerms = extractExclusionTerms(sibling.description);

      return {
        code: sibling.code,
        description: sibling.description,
        isOther,
        specificTerms,
        exclusionTerms
      };
    });

    const otherCodes = analyzedSiblings.filter(s => s.isOther);
    const specificCodes = analyzedSiblings.filter(s => !s.isOther);

    return {
      parentCode,
      parentDescription: parent.description,
      siblings: analyzedSiblings,
      hasOtherCode: otherCodes.length > 0,
      otherCode: otherCodes[0] || null,
      specificCodes
    };

  } catch (error) {
    logger.error('Error analyzing exclusion context: ' + (error instanceof Error ? error.message : String(error)));
    return null;
  }
}

/**
 * Determine if a product should go to an "Other" code using exclusion logic
 */
export async function classifyWithExclusion(
  productDescription: string,
  candidateCode: string
): Promise<ClassificationDecision> {
  const productLower = productDescription.toLowerCase();

  // Find the parent code (go up one level)
  const parentCode = getParentCode(candidateCode);
  if (!parentCode) {
    return {
      matchedCode: candidateCode,
      isOtherClassification: false,
      reasoning: 'No parent code found for exclusion analysis',
      matchedSpecificTerms: [],
      excludedFromCodes: []
    };
  }

  // Analyze siblings for exclusion
  const analysis = await analyzeExclusionContext(parentCode);
  if (!analysis) {
    return {
      matchedCode: candidateCode,
      isOtherClassification: false,
      reasoning: 'Could not analyze sibling codes',
      matchedSpecificTerms: [],
      excludedFromCodes: []
    };
  }

  // Check each specific code - does the product MATCH any?
  const matchedSpecific: SiblingCode[] = [];
  const excludedFrom: string[] = [];

  for (const specific of analysis.specificCodes) {
    const matchScore = calculateMatchScore(productLower, specific);

    if (matchScore.matches) {
      matchedSpecific.push(specific);
    } else if (matchScore.excluded) {
      excludedFrom.push(specific.code);
    }
  }

  // Decision logic
  if (matchedSpecific.length === 1) {
    // Clear match to a specific code
    return {
      matchedCode: matchedSpecific[0]!.code,
      isOtherClassification: false,
      reasoning: `Product matches specific code: ${matchedSpecific[0]!.description}`,
      matchedSpecificTerms: matchedSpecific[0]!.specificTerms,
      excludedFromCodes: []
    };
  } else if (matchedSpecific.length > 1) {
    // Ambiguous - matches multiple specific codes
    return {
      matchedCode: null, // Need clarification
      isOtherClassification: false,
      reasoning: `Product could match multiple codes: ${matchedSpecific.map(s => s.code).join(', ')}`,
      matchedSpecificTerms: matchedSpecific.flatMap(s => s.specificTerms),
      excludedFromCodes: []
    };
  } else if (excludedFrom.length > 0 && analysis.hasOtherCode && analysis.otherCode) {
    // Product is explicitly NOT matching any specific code → goes to "Other"
    return {
      matchedCode: analysis.otherCode.code,
      isOtherClassification: true,
      reasoning: `Product does not match specific codes (${excludedFrom.join(', ')}), classified as "Other": ${analysis.otherCode.description}`,
      matchedSpecificTerms: [],
      excludedFromCodes: excludedFrom
    };
  } else if (analysis.hasOtherCode && analysis.otherCode) {
    // No clear match to specific codes, and "Other" exists
    return {
      matchedCode: analysis.otherCode.code,
      isOtherClassification: true,
      reasoning: `No specific code matched, classified as "Other": ${analysis.otherCode.description}`,
      matchedSpecificTerms: [],
      excludedFromCodes: analysis.specificCodes.map(s => s.code)
    };
  }

  // Fallback - return the original candidate
  return {
    matchedCode: candidateCode,
    isOtherClassification: false,
    reasoning: 'No exclusion-based decision could be made',
    matchedSpecificTerms: [],
    excludedFromCodes: []
  };
}

// ========================================
// Helper Functions
// ========================================

/**
 * Check if a code is an "Other" code based on its description
 */
function isOtherCode(description: string, dbIsOther: boolean): boolean {
  if (dbIsOther) return true;

  const descLower = description.toLowerCase();

  // Common patterns for "Other" codes
  const otherPatterns = [
    /^other\b/i,
    /\bother\b$/i,
    /\bother:$/i,
    /^-+\s*other/i,
    /\bnes\b/i,  // "not elsewhere specified"
    /\bn\.e\.s\.?/i,
    /not elsewhere specified/i,
    /not specified/i,
    /\bmisc\b/i,
    /miscellaneous/i
  ];

  return otherPatterns.some(pattern => pattern.test(descLower));
}

/**
 * Extract specific terms that define a code
 * E.g., "Instant coffee, flavoured" → ["flavoured", "flavored"]
 */
function extractSpecificTerms(description: string): string[] {
  const terms: string[] = [];
  const descLower = description.toLowerCase();

  // Remove common prefixes
  const cleaned = descLower
    .replace(/^-+\s*/, '')  // Remove leading dashes
    .replace(/^other:\s*/i, '')  // Remove "Other:"
    .trim();

  // Extract key terms
  // Flavour variants
  if (/flavou?red/.test(cleaned)) {
    terms.push('flavoured', 'flavored', 'flavour', 'flavor');
  }
  if (/unflavou?red/.test(cleaned)) {
    terms.push('unflavoured', 'unflavored', 'plain', 'natural');
  }

  // Processing terms
  if (/roasted/.test(cleaned)) terms.push('roasted');
  if (/unroasted/.test(cleaned) || /not roasted/.test(cleaned)) {
    terms.push('unroasted', 'green', 'raw');
  }
  if (/decaffeinated/.test(cleaned)) terms.push('decaffeinated', 'decaf');
  if (/instant/.test(cleaned)) terms.push('instant', 'soluble');

  // Coffee species
  if (/arabica/.test(cleaned)) terms.push('arabica');
  if (/robusta/.test(cleaned)) terms.push('robusta');

  // Tea types
  if (/green tea/.test(cleaned)) terms.push('green tea', 'green');
  if (/black tea/.test(cleaned)) terms.push('black tea', 'black');

  // Grades
  if (/\ba\s*grade/i.test(cleaned)) terms.push('a grade', 'grade a');
  if (/\bb\s*grade/i.test(cleaned)) terms.push('b grade', 'grade b');
  if (/\bc\s*grade/i.test(cleaned)) terms.push('c grade', 'grade c');

  // Size/packaging
  if (/bulk/.test(cleaned)) terms.push('bulk', 'loose');
  if (/packet|bag/.test(cleaned)) terms.push('packet', 'bag', 'packaged');

  // If we couldn't extract specific terms, use significant words from description
  if (terms.length === 0) {
    const words = cleaned.split(/[,\s:;]+/)
      .filter(w => w.length > 3)
      .filter(w => !['with', 'from', 'than', 'that', 'this', 'other', 'exceeding'].includes(w));
    terms.push(...words.slice(0, 3));
  }

  return [...new Set(terms)];  // Remove duplicates
}

/**
 * Extract terms that would EXCLUDE a product from this code
 * E.g., "flavoured" code excludes "unflavoured" products
 */
function extractExclusionTerms(description: string): string[] {
  const terms: string[] = [];
  const descLower = description.toLowerCase();

  // If code is for "flavoured", then "unflavoured" products are excluded
  if (/\bflavou?red\b/.test(descLower) && !/\bunflavou?red\b/.test(descLower)) {
    terms.push('unflavoured', 'unflavored', 'plain', 'without flavour', 'without flavor');
  }

  // If code is for "roasted", then "unroasted" products are excluded
  if (/\broasted\b/.test(descLower) && !/\bunroasted\b/.test(descLower)) {
    terms.push('unroasted', 'green', 'raw');
  }

  // If code is for "decaffeinated", regular coffee is excluded
  if (/\bdecaffeinated\b/.test(descLower)) {
    terms.push('regular', 'caffeinated', 'with caffeine');
  }

  return terms;
}

/**
 * Calculate match score between product description and a specific code
 */
function calculateMatchScore(
  productLower: string,
  code: SiblingCode
): { matches: boolean; excluded: boolean; score: number } {
  let score = 0;
  let matches = false;
  let excluded = false;

  // Check for positive matches (specific terms)
  for (const term of code.specificTerms) {
    if (productLower.includes(term.toLowerCase())) {
      score += 10;
      matches = true;
    }
  }

  // Check for exclusion terms (product has terms that exclude it from this code)
  for (const term of code.exclusionTerms) {
    if (productLower.includes(term.toLowerCase())) {
      score -= 20;  // Strong penalty
      excluded = true;
      matches = false;  // Can't match if excluded
    }
  }

  // Special case: Check for negation patterns in product
  // E.g., "unflavoured" explicitly negates "flavoured"
  const negationPatterns = [
    { positive: /\bflavou?red\b/, negative: /\bunflavou?red\b/ },
    { positive: /\broasted\b/, negative: /\bunroasted\b/ },
    { positive: /\bdecaf/, negative: /\bregular\b|\bwith caffeine\b/ }
  ];

  for (const pattern of negationPatterns) {
    const codeHasPositive = pattern.positive.test(code.description.toLowerCase());
    const productHasNegative = pattern.negative.test(productLower);

    if (codeHasPositive && productHasNegative) {
      excluded = true;
      matches = false;
      score -= 30;
    }
  }

  return { matches, excluded, score };
}

/**
 * Get parent code (one level up)
 */
function getParentCode(code: string): string | null {
  const parts = code.split('.');
  if (parts.length <= 1) return null;

  parts.pop();
  return parts.join('.');
}

/**
 * Get number of significant digits in an HS code
 */
function getCodeDigits(code: string): number {
  return code.replace(/\./g, '').length;
}

/**
 * Format exclusion context for LLM prompt
 */
export function formatExclusionContextForPrompt(analysis: ExclusionAnalysis): string {
  if (!analysis) return '';

  const lines: string[] = [
    `**EXCLUSION ANALYSIS FOR ${analysis.parentCode}:**`,
    `Parent: ${analysis.parentDescription}`,
    '',
    'Sibling codes under this parent:'
  ];

  for (const sibling of analysis.siblings) {
    const marker = sibling.isOther ? '[OTHER/CATCH-ALL]' : '[SPECIFIC]';
    lines.push(`  ${sibling.code}: ${sibling.description} ${marker}`);
    if (sibling.specificTerms.length > 0 && !sibling.isOther) {
      lines.push(`    → Key terms: ${sibling.specificTerms.join(', ')}`);
    }
  }

  if (analysis.hasOtherCode) {
    lines.push('');
    lines.push('⚠️ IMPORTANT: "Other" code exists! Classification rules:');
    lines.push('  - If product MATCHES a specific code → use that specific code');
    lines.push('  - If product does NOT match ANY specific code → use "Other" code');
    lines.push(`  - "Other" code: ${analysis.otherCode!.code}`);
  }

  return lines.join('\n');
}

export default {
  analyzeExclusionContext,
  classifyWithExclusion,
  formatExclusionContextForPrompt
};

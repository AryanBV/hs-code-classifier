/**
 * Hierarchy Context Service
 *
 * Provides hierarchy-aware context for HS code classification.
 * Analyzes child codes to derive distinguishing dimensions and generate questions.
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ========================================
// Types
// ========================================

export interface HierarchyDimension {
  name: string;           // e.g., "Species", "Processing", "Grade"
  values: string[];       // e.g., ["Arabica", "Robusta"]
  pattern: string;        // Regex pattern that extracted this
}

export interface SuggestedQuestion {
  id: string;
  dimension: string;
  text: string;
  options: string[];
  priority: 'required' | 'optional';
}

export interface ChildCodeInfo {
  code: string;
  description: string;
  level: number;          // 4=heading, 6=subheading, 8=tariff
  isLeaf: boolean;        // True if no further children
  keywords: string[];
}

export interface HierarchyContext {
  parentCode: string;
  parentDescription: string;
  parentLevel: number;
  childCodes: ChildCodeInfo[];
  dimensions: HierarchyDimension[];
  suggestedQuestions: SuggestedQuestion[];
  hasDeepHierarchy: boolean;  // True if children have their own children
}

// ========================================
// Main Functions
// ========================================

/**
 * Get hierarchy context for a given HS code
 * Returns all children, derived dimensions, and suggested questions
 */
export async function getHierarchyContext(parentCode: string): Promise<HierarchyContext | null> {
  try {
    // Get parent code details
    const parent = await prisma.hsCode.findFirst({
      where: { code: parentCode },
      select: { code: true, description: true }
    });

    if (!parent) {
      logger.warn(`Parent code not found: ${parentCode}`);
      return null;
    }

    const parentLevel = getCodeLevel(parentCode);

    // Get all direct children (one level deeper)
    const children = await getDirectChildren(parentCode);

    if (children.length === 0) {
      return {
        parentCode,
        parentDescription: parent.description,
        parentLevel,
        childCodes: [],
        dimensions: [],
        suggestedQuestions: [],
        hasDeepHierarchy: false
      };
    }

    // Check if any children have their own children
    const hasDeepHierarchy = await checkDeepHierarchy(children.map(c => c.code));

    // Extract dimensions from child descriptions
    const dimensions = extractDimensionsFromChildren(children);

    // Generate questions from dimensions
    const suggestedQuestions = generateQuestionsFromDimensions(dimensions, parentCode);

    return {
      parentCode,
      parentDescription: parent.description,
      parentLevel,
      childCodes: children,
      dimensions,
      suggestedQuestions,
      hasDeepHierarchy
    };

  } catch (error) {
    logger.error('Error getting hierarchy context: ' + (error instanceof Error ? error.message : String(error)));
    return null;
  }
}

/**
 * Get all children of a parent code at the next level
 */
async function getDirectChildren(parentCode: string): Promise<ChildCodeInfo[]> {
  const parentLevel = getCodeLevel(parentCode);
  const targetLevel = parentLevel + 2; // Next level (4->6, 6->8, 8->10)

  // Build the prefix pattern
  // For "0901" -> find "0901.XX"
  // For "0901.11" -> find "0901.11.XX"
  const prefix = parentCode;

  const children = await prisma.hsCode.findMany({
    where: {
      code: {
        startsWith: prefix
      },
      NOT: {
        code: parentCode
      }
    },
    select: {
      code: true,
      description: true,
      keywords: true
    },
    orderBy: { code: 'asc' }
  });

  // Filter to only direct children (not grandchildren)
  const directChildren = children.filter(c => {
    const childLevel = getCodeLevel(c.code);
    // For 4-digit parent, get 6-digit children
    // For 6-digit parent, get 8-digit children
    return childLevel === targetLevel;
  });

  // Check which are leaf nodes using batch query (avoids N+1 problem)
  const childCodes = directChildren.map(c => c.code);
  const hasGrandchildrenMap = await checkHasChildrenBatch(childCodes);

  return directChildren.map((child) => ({
    code: child.code,
    description: child.description,
    level: getCodeLevel(child.code),
    isLeaf: !hasGrandchildrenMap.get(child.code),
    keywords: child.keywords || []
  }));
}

/**
 * Check if any of the codes have children (uses batch query)
 */
async function checkDeepHierarchy(codes: string[]): Promise<boolean> {
  if (codes.length === 0) return false;
  const hasChildrenMap = await checkHasChildrenBatch(codes);
  return Array.from(hasChildrenMap.values()).some(v => v);
}

/**
 * Batch check if multiple codes have children (single query instead of N queries)
 * This fixes the N+1 query problem that was exhausting the connection pool
 */
async function checkHasChildrenBatch(codes: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  // Initialize all codes as having no children
  codes.forEach(code => result.set(code, false));

  if (codes.length === 0) return result;

  // Single query: find any codes that start with any of our parent codes
  // We use a raw query for efficiency with multiple prefixes
  const allDescendants = await prisma.hsCode.findMany({
    where: {
      OR: codes.map(code => ({
        code: {
          startsWith: code,
          not: code
        }
      }))
    },
    select: { code: true },
    take: 100 // Limit to avoid huge result sets
  });

  // Mark which parent codes have children
  for (const descendant of allDescendants) {
    for (const parentCode of codes) {
      if (descendant.code.startsWith(parentCode) && descendant.code !== parentCode) {
        result.set(parentCode, true);
        break; // Found a child, move to next descendant
      }
    }
  }

  return result;
}

/**
 * Check if a single code has any children (kept for backward compatibility)
 */
async function checkHasChildren(code: string): Promise<boolean> {
  const map = await checkHasChildrenBatch([code]);
  return map.get(code) || false;
}

/**
 * Get the level of an HS code (4, 6, 8, or 10 digits)
 */
function getCodeLevel(code: string): number {
  const digits = code.replace(/\./g, '');
  return digits.length;
}

// ========================================
// Dimension Extraction
// ========================================

/**
 * Extract distinguishing dimensions from child code descriptions
 */
function extractDimensionsFromChildren(children: ChildCodeInfo[]): HierarchyDimension[] {
  const dimensions: HierarchyDimension[] = [];
  const descriptions = children.map(c => c.description);

  // Common dimension patterns to look for
  const patterns = [
    // Species/Variety patterns
    { name: 'Species', regex: /\b(Arabica|Robusta|Liberica)\b/i },
    { name: 'Tea Type', regex: /\b(Green tea|Black tea|Oolong|White tea)\b/i },
    { name: 'Variety', regex: /\b(Basmati|Non-basmati|Jasmine|Long grain|Short grain)\b/i },

    // Processing/Form patterns
    { name: 'Processing', regex: /\b(plantation|cherry|parchment|washed|unwashed|hulled)\b/i },
    { name: 'Form', regex: /\b(fresh|frozen|dried|preserved|processed|prepared|powdered|ground|whole|cut)\b/i },
    { name: 'State', regex: /\b(raw|cooked|roasted|unroasted|fermented|not fermented)\b/i },

    // Quality/Grade patterns
    { name: 'Grade', regex: /\b([A-C] Grade|Grade [A-C]|AB Grade|PB Grade|BB Grade|Premium|Standard)\b/i },
    { name: 'Quality', regex: /\b(first quality|second quality|reject|special|extra)\b/i },

    // Size/Packaging patterns
    { name: 'Size', regex: /\b(not exceeding \d+|exceeding \d+|small|medium|large|≤?\s*\d+\s*(g|kg|mm|cm))\b/i },
    { name: 'Packaging', regex: /\b(bulk|retail|immediate packings|packets|bags)\b/i },

    // Content/Composition patterns
    { name: 'Content', regex: /\b(containing|with|without|added|pure|mixed|blended)\b/i },
    { name: 'Material', regex: /\b(cotton|silk|wool|polyester|synthetic|natural)\b/i },

    // Use/Purpose patterns
    { name: 'Purpose', regex: /\b(for sowing|breeding|consumption|industrial|medicinal)\b/i },
    { name: 'Target', regex: /\b(men|women|children|infant|adult)\b/i },
  ];

  // Check each pattern against all descriptions
  for (const pattern of patterns) {
    const matches = new Set<string>();

    for (const desc of descriptions) {
      const match = desc.match(pattern.regex);
      if (match) {
        matches.add(match[0]);
      }
    }

    // If we found multiple different values, this is a distinguishing dimension
    if (matches.size >= 2) {
      dimensions.push({
        name: pattern.name,
        values: Array.from(matches),
        pattern: pattern.regex.source
      });
    }
  }

  // Also try to extract dimensions from description structure
  const structuralDimensions = extractStructuralDimensions(descriptions);
  dimensions.push(...structuralDimensions);

  return dimensions;
}

/**
 * Extract dimensions from description structure
 * E.g., "Arabica plantation: A Grade" -> extracts "Arabica plantation" and "A Grade" as separate dimensions
 */
function extractStructuralDimensions(descriptions: string[]): HierarchyDimension[] {
  const dimensions: HierarchyDimension[] = [];

  // Look for patterns with colons or dashes that indicate hierarchy
  // E.g., "Arabica plantation: ---- A Grade"
  const prefixGroups = new Map<string, Set<string>>();
  const suffixGroups = new Map<string, Set<string>>();

  for (const desc of descriptions) {
    // Split by common delimiters
    const parts = desc.split(/\s*[:\-–—]+\s*/);

    if (parts.length >= 2) {
      const prefix = parts[0]?.trim();
      const suffix = parts[parts.length - 1]?.trim();

      if (prefix) {
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, new Set());
        }
        if (suffix) {
          prefixGroups.get(prefix)!.add(suffix);
        }
      }

      if (suffix) {
        if (!suffixGroups.has(suffix)) {
          suffixGroups.set(suffix, new Set());
        }
        if (prefix) {
          suffixGroups.get(suffix)!.add(prefix);
        }
      }
    }
  }

  // Find prefixes that have multiple different suffixes (e.g., "Arabica plantation" -> A, B, C Grade)
  for (const [prefix, suffixes] of prefixGroups) {
    if (suffixes.size >= 2 && !prefix.toLowerCase().includes('other')) {
      // This prefix has multiple variants - the suffixes are a dimension
      const cleanSuffixes = Array.from(suffixes)
        .map(s => s.replace(/^-+\s*/, '').trim())
        .filter(s => s.length > 0 && !s.toLowerCase().includes('other'));

      if (cleanSuffixes.length >= 2) {
        // Try to name the dimension based on content
        const dimensionName = inferDimensionName(cleanSuffixes);
        dimensions.push({
          name: dimensionName,
          values: cleanSuffixes,
          pattern: `structural:suffix`
        });
      }
    }
  }

  // Find suffixes that have multiple different prefixes (e.g., "A Grade" -> Arabica, Robusta)
  for (const [suffix, prefixes] of suffixGroups) {
    if (prefixes.size >= 2 && !suffix.toLowerCase().includes('other')) {
      const cleanPrefixes = Array.from(prefixes)
        .filter(p => !p.toLowerCase().includes('other'));

      if (cleanPrefixes.length >= 2) {
        const dimensionName = inferDimensionName(cleanPrefixes);
        // Only add if not already covered
        if (!dimensions.some(d => d.name === dimensionName)) {
          dimensions.push({
            name: dimensionName,
            values: cleanPrefixes,
            pattern: `structural:prefix`
          });
        }
      }
    }
  }

  return dimensions;
}

/**
 * Infer the name of a dimension from its values
 */
function inferDimensionName(values: string[]): string {
  const joinedLower = values.join(' ').toLowerCase();

  // Check for common patterns
  if (joinedLower.match(/grade|quality/)) return 'Grade';
  if (joinedLower.match(/arabica|robusta|liberica/)) return 'Coffee Species';
  if (joinedLower.match(/plantation|cherry|parchment/)) return 'Processing Method';
  if (joinedLower.match(/green|black|oolong|white/)) return 'Tea Type';
  if (joinedLower.match(/fresh|frozen|dried|preserved/)) return 'Form';
  if (joinedLower.match(/\d+\s*(g|kg|mm|cm)/)) return 'Size';
  if (joinedLower.match(/roasted|unroasted/)) return 'Roasting';
  if (joinedLower.match(/decaffeinated/)) return 'Caffeine';
  if (joinedLower.match(/men|women|child|infant/)) return 'Target User';
  if (joinedLower.match(/cotton|silk|wool|polyester/)) return 'Material';

  // Default to generic name
  return 'Type';
}

// ========================================
// Question Generation
// ========================================

/**
 * Generate questions from extracted dimensions
 */
function generateQuestionsFromDimensions(
  dimensions: HierarchyDimension[],
  parentCode: string
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];

  for (let i = 0; i < dimensions.length && i < 2; i++) {
    const dim = dimensions[i]!;
    const question = createQuestionForDimension(dim, parentCode, i);
    questions.push(question);
  }

  return questions;
}

/**
 * Create a user-friendly question for a dimension
 */
function createQuestionForDimension(
  dimension: HierarchyDimension,
  parentCode: string,
  index: number
): SuggestedQuestion {
  // Generate question text based on dimension name
  let questionText = '';

  switch (dimension.name.toLowerCase()) {
    case 'species':
    case 'coffee species':
      questionText = 'What species of coffee is it?';
      break;
    case 'tea type':
      questionText = 'What type of tea is it?';
      break;
    case 'processing':
    case 'processing method':
      questionText = 'How was the product processed?';
      break;
    case 'form':
      questionText = 'In what form is the product?';
      break;
    case 'state':
      questionText = 'What is the state of the product?';
      break;
    case 'grade':
    case 'quality':
      questionText = 'What is the grade/quality of the product?';
      break;
    case 'size':
    case 'packaging':
      questionText = 'What is the packaging/size?';
      break;
    case 'material':
      questionText = 'What material is it made of?';
      break;
    case 'purpose':
      questionText = 'What is the intended use?';
      break;
    case 'target user':
      questionText = 'Who is the target user?';
      break;
    case 'roasting':
      questionText = 'Is it roasted or unroasted?';
      break;
    case 'caffeine':
      questionText = 'Is it decaffeinated?';
      break;
    case 'variety':
      questionText = 'What variety is it?';
      break;
    default:
      questionText = `What ${dimension.name.toLowerCase()} is it?`;
  }

  return {
    id: `q_${parentCode.replace(/\./g, '')}_${dimension.name.toLowerCase().replace(/\s+/g, '_')}_${index}`,
    dimension: dimension.name,
    text: questionText,
    options: dimension.values.slice(0, 5), // Limit to 5 options
    priority: index === 0 ? 'required' : 'optional'
  };
}

// ========================================
// Utility Functions
// ========================================

/**
 * Find the common parent of multiple codes
 */
export async function findCommonParent(codes: string[]): Promise<string | null> {
  if (codes.length === 0) return null;
  if (codes.length === 1) return codes[0]!;

  // Find the longest common prefix
  let prefix = codes[0]!;

  for (const code of codes.slice(1)) {
    while (!code.startsWith(prefix) && prefix.length > 0) {
      // Remove last segment
      const parts = prefix.split('.');
      parts.pop();
      prefix = parts.join('.');
    }
  }

  // Verify this prefix exists as a code
  if (prefix) {
    const exists = await prisma.hsCode.findFirst({
      where: { code: prefix },
      select: { code: true }
    });
    if (exists) return prefix;
  }

  return null;
}

/**
 * Get the full path from a parent to a specific child
 */
export async function getHierarchyPath(fromCode: string, toCode: string): Promise<string[]> {
  const path: string[] = [fromCode];

  let current = fromCode;
  const targetParts = toCode.split('.');

  for (let i = 1; i <= targetParts.length; i++) {
    const nextCode = targetParts.slice(0, i).join('.');
    if (nextCode !== current && nextCode.startsWith(fromCode)) {
      // Verify this code exists
      const exists = await prisma.hsCode.findFirst({
        where: { code: nextCode },
        select: { code: true }
      });
      if (exists) {
        path.push(nextCode);
        current = nextCode;
      }
    }
  }

  return path;
}

/**
 * Match user answers to child codes and find the best match
 */
export function matchAnswersToChildren(
  children: ChildCodeInfo[],
  answers: Record<string, string>
): ChildCodeInfo[] {
  const answerValues = Object.values(answers).map(v =>
    v.toLowerCase().replace('other:', '').trim()
  );

  // Score each child based on how many answer values match its description
  const scored = children.map(child => {
    const descLower = child.description.toLowerCase();
    let score = 0;

    for (const answer of answerValues) {
      if (descLower.includes(answer.toLowerCase())) {
        score += 10;
      }
      // Partial matches
      const answerWords = answer.split(/\s+/);
      for (const word of answerWords) {
        if (word.length > 2 && descLower.includes(word)) {
          score += 2;
        }
      }
    }

    return { child, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return children with positive scores
  return scored.filter(s => s.score > 0).map(s => s.child);
}

export default {
  getHierarchyContext,
  findCommonParent,
  getHierarchyPath,
  matchAnswersToChildren
};

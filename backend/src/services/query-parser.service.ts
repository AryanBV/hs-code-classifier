/**
 * Query Parser Service
 *
 * Parses user queries to distinguish primary subject from context.
 *
 * Problem: "diesel engine for trucks" matches complete trucks (8704.x)
 *          instead of engines (8408.x) because semantic search treats all
 *          words equally.
 *
 * Solution: Parse query structure:
 * - Primary Subject: What to classify ("diesel engine")
 * - Context: Where it's used ("for trucks")
 * - Modifiers: Descriptive attributes ("diesel")
 *
 * This allows boosting codes matching the PRIMARY subject over codes
 * that only match the context.
 */

export interface QueryAnalysis {
  primarySubject: string;  // Main product to classify
  context: string[];       // Application/usage context
  modifiers: string[];     // Descriptive attributes (materials)
  productTypeModifiers: string[];  // PHASE 1: Processing state, form, variety modifiers
  rawQuery: string;        // Original query
}

/**
 * Context patterns that indicate usage/application
 * e.g., "engine FOR trucks", "parts USED IN aircraft"
 */
const CONTEXT_PATTERNS = [
  /(.+?)\s+for\s+(.+)/i,
  /(.+?)\s+used in\s+(.+)/i,
  /(.+?)\s+in\s+(.+)/i,
  /(.+?)\s+of\s+(.+)/i,
  /(.+?)\s+from\s+(.+)/i
];

/**
 * Material/attribute modifiers that describe the product
 * e.g., "cotton t-shirt", "steel bolts", "plastic toys"
 */
const MATERIAL_MODIFIERS = new Set([
  'cotton', 'wool', 'silk', 'synthetic',
  'steel', 'iron', 'aluminum', 'copper', 'brass',
  'plastic', 'rubber', 'wood', 'wooden', 'metal',
  'leather', 'glass', 'ceramic', 'paper'
]);

// PHASE 1: Product type modifiers that indicate processing state, form, or variety
// These affect chapter selection (e.g., "instant" → Ch.21, "roasted" → Ch.09)
const PRODUCT_TYPE_MODIFIERS = [
  // Processing state - Coffee/Tea specific
  'instant', 'soluble', 'extract', 'concentrate', 'essence',
  'roasted', 'unroasted', 'raw', 'green', 'ground', 'whole',
  'decaffeinated', 'decaf', 'caffeinated',

  // Form indicators
  'powder', 'powdered', 'granules', 'granulated', 'beans', 'leaves',
  'liquid', 'frozen', 'dried', 'fresh', 'preserved', 'canned',
  'flakes', 'chips', 'chunks', 'sliced', 'diced', 'minced',

  // Grade/Quality indicators
  'grade a', 'grade b', 'grade c', 'plantation', 'premium',
  'organic', 'conventional', 'certified',

  // Coffee varieties
  'arabica', 'robusta', 'liberica', 'excelsa',

  // Tea varieties
  'black tea', 'green tea', 'white tea', 'oolong', 'pu-erh',

  // Processing methods
  'washed', 'unwashed', 'natural', 'honey processed',
  'fermented', 'unfermented', 'pasteurized', 'homogenized',

  // Function indicators (for material vs function disambiguation)
  'for vehicles', 'for cars', 'for trucks', 'automotive',
  'for industrial use', 'for household use', 'for cooking',
];

/**
 * Parse query into structured components
 *
 * @param query - User's search query
 * @returns Structured query analysis
 */
export function parseQuery(query: string): QueryAnalysis {
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  // PHASE 1: Extract product type modifiers
  const productTypeModifiers: string[] = [];
  for (const modifier of PRODUCT_TYPE_MODIFIERS) {
    if (lowerQuery.includes(modifier.toLowerCase())) {
      productTypeModifiers.push(modifier);
    }
  }

  // Try to match context patterns
  for (const pattern of CONTEXT_PATTERNS) {
    const match = trimmedQuery.match(pattern);

    if (match && match[1] && match[2]) {
      const primarySubject = match[1].trim();
      const context = match[2].trim();

      // Extract modifiers from primary subject
      const modifiers = extractModifiers(primarySubject);

      return {
        primarySubject,
        context: [context],
        modifiers,
        productTypeModifiers,  // PHASE 1: Include product type modifiers
        rawQuery: trimmedQuery
      };
    }
  }

  // No context pattern found - entire query is the primary subject
  const modifiers = extractModifiers(trimmedQuery);

  return {
    primarySubject: trimmedQuery,
    context: [],
    modifiers,
    productTypeModifiers,  // PHASE 1: Include product type modifiers
    rawQuery: trimmedQuery
  };
}

/**
 * Extract material/attribute modifiers from text
 *
 * @param text - Text to analyze
 * @returns Array of identified modifiers
 */
function extractModifiers(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const modifiers: string[] = [];

  for (const word of words) {
    if (MATERIAL_MODIFIERS.has(word)) {
      modifiers.push(word);
    }
  }

  return modifiers;
}

/**
 * Calculate boost score for a candidate based on query analysis
 *
 * Candidates matching the PRIMARY SUBJECT get higher boost than
 * candidates matching only the CONTEXT.
 *
 * @param candidate - Candidate code metadata
 * @param analysis - Parsed query analysis
 * @returns Boost score (0-10 points)
 */
export function calculateContextBoost(
  candidate: {
    code: string;
    description: string;
    keywords?: string[];
    commonProducts?: string[];
  },
  analysis: QueryAnalysis
): number {
  const candidateText = [
    candidate.description,
    ...(candidate.keywords || []),
    ...(candidate.commonProducts || [])
  ].join(' ').toLowerCase();

  let boost = 0;

  // Check if candidate matches PRIMARY SUBJECT
  const primaryWords = analysis.primarySubject.toLowerCase().split(/\s+/);
  let primaryMatches = 0;

  for (const word of primaryWords) {
    if (word.length > 2 && candidateText.includes(word)) {
      primaryMatches++;
    }
  }

  if (primaryMatches > 0) {
    // Strong boost for matching primary subject
    boost += Math.min(primaryMatches * 3, 10);
  }

  // Check if candidate matches CONTEXT (but not primary)
  if (analysis.context.length > 0 && primaryMatches === 0) {
    const contextWords = analysis.context.join(' ').toLowerCase().split(/\s+/);
    let contextMatches = 0;

    for (const word of contextWords) {
      if (word.length > 2 && candidateText.includes(word)) {
        contextMatches++;
      }
    }

    if (contextMatches > 0) {
      // Small penalty for ONLY matching context (not the primary subject)
      boost -= 3;
    }
  }

  return Math.max(0, boost); // Don't go negative
}

/**
 * Get human-readable explanation of query parsing
 *
 * @param analysis - Parsed query analysis
 * @returns Formatted string for debugging/logging
 */
export function explainQueryAnalysis(analysis: QueryAnalysis): string {
  let explanation = `Query: "${analysis.rawQuery}"\n`;
  explanation += `Primary Subject: "${analysis.primarySubject}"\n`;

  if (analysis.context.length > 0) {
    explanation += `Context: ${analysis.context.join(', ')}\n`;
  } else {
    explanation += `Context: None\n`;
  }

  if (analysis.modifiers.length > 0) {
    explanation += `Modifiers: ${analysis.modifiers.join(', ')}\n`;
  } else {
    explanation += `Modifiers: None\n`;
  }

  return explanation;
}

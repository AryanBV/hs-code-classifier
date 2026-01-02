/**
 * Attribute-Based Intelligent Classifier Service
 *
 * This service implements SMART classification by:
 * 1. Extracting product attributes from user input
 * 2. Checking if all required attributes are present
 * 3. Auto-classifying when complete (no questions needed)
 * 4. Generating targeted questions only for MISSING attributes
 *
 * This solves:
 * - "Arabica coffee grade A not roasted not decaffeinated" → AUTO-CLASSIFY to 0901.11.10
 * - "Arabica coffee not roasted" → ASK only about decaf status
 * - "coffee" → ASK about chapter (09 vs 21), then drill down
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ========================================
// PHASE 4: Database-Driven Types
// ========================================

interface ChildCode {
  code: string;
  description: string;
  isOther?: boolean;
}

interface DistinguishingAttribute {
  attributeName: string;  // e.g., 'grade', 'variety', 'processingMethod'
  options: Array<{
    value: string;        // e.g., 'a', 'arabica', 'plantation'
    codes: string[];      // Which codes have this value
    label: string;        // Human-readable label for UI
  }>;
}

// ========================================
// Types
// ========================================

export interface ProductAttributes {
  baseProduct: string | null;           // "coffee", "tea", "wheat"
  variety: string | null;               // "arabica", "robusta", "basmati"
  grade: string | null;                 // "A", "B", "C", "AB", "PB"
  roasted: boolean | null;              // true = roasted, false = not roasted
  decaffeinated: boolean | null;        // true = decaf, false = regular
  form: string | null;                  // "beans", "ground", "instant", "extract"
  processingMethod: string | null;      // "parchment", "cherry", "plantation"
  packaging: string | null;             // "bulk", "retail"
  chapter: string | null;               // Resolved chapter if determined
}

export interface AttributeRequirement {
  attribute: keyof ProductAttributes;
  required: boolean;
  possibleValues?: string[];
  questionText: string;
  options: Array<{ value: string; label: string; code?: string }>;
}

export interface CompletenessResult {
  isComplete: boolean;
  missingAttributes: string[];
  confidence: number;
  suggestedCode: string | null;
  attributes: ProductAttributes;
  nextQuestion: AttributeRequirement | null;
  reasoning: string;
}

export interface AttributeClassificationResult {
  type: 'auto-classify' | 'question' | 'delegate';
  code?: string;
  description?: string;
  confidence?: number;
  reasoning?: string;
  question?: {
    id: string;
    text: string;
    options: Array<{ code: string; label: string; description: string }>;
    attribute: string;
  };
  // If 'delegate', pass to LLM navigator
  delegateReason?: string;
}

// ========================================
// Coffee Attribute Mappings
// ========================================

/**
 * Coffee HS Code Structure:
 *
 * 0901 - Coffee
 * ├── 0901.1 - Coffee, not roasted
 * │   ├── 0901.11 - Not decaffeinated
 * │   │   ├── 0901.11.10 - Arabica (A grade / Plantation A / Arabica Plantation A)
 * │   │   ├── 0901.11.20 - Robusta (R grade / Robusta Parchment / Robusta Cherry)
 * │   │   └── 0901.11.90 - Other
 * │   └── 0901.12 - Decaffeinated
 * │       ├── 0901.12.10 - Arabica
 * │       ├── 0901.12.20 - Robusta
 * │       └── 0901.12.90 - Other
 * ├── 0901.2 - Coffee, roasted
 * │   ├── 0901.21 - Not decaffeinated
 * │   │   ├── 0901.21.10 - In grain (beans)
 * │   │   └── 0901.21.20 - Ground
 * │   └── 0901.22 - Decaffeinated
 * │       ├── 0901.22.10 - In grain (beans)
 * │       └── 0901.22.20 - Ground
 * └── 0901.90 - Other (husks, skins, substitutes)
 *
 * 2101 - Extracts and preparations
 * └── 2101.11 - Extracts, essences and concentrates of coffee
 *     ├── 2101.11.10 - Instant coffee (soluble)
 *     └── 2101.11.20 - Other (liquid concentrates, etc.)
 */

// ========================================
// Database-Driven Coffee Classification
// ========================================
// IMPORTANT: Never use hardcoded HS codes! Always query the database.
// The database is the source of truth for actual tariff codes.
//
// Database structure for coffee (0901.11.xx - not roasted, not decaf):
// - 0901.11.11 to 0901.11.19: Arabica plantation (grades A, B, C, Other)
// - 0901.11.21 to 0901.11.29: Arabica Cherry (grades AB, PB, C, B/B/B, Other)
// - 0901.11.31 to 0901.11.39: Rob Parchment (grades AB, PB, C, Other)
// - 0901.11.41 to 0901.11.49: Rob Cherry (grades AB, PB, C, B/B/B, Bulk, Other)
// - 0901.11.90: Other

// ========================================
// PHASE 4: Database-Driven Helper Functions
// ========================================

/**
 * Get direct children of an HS code from the database
 * Uses the hierarchy table for efficiency
 */
async function getChildrenFromDatabase(parentCode: string): Promise<ChildCode[]> {
  logger.info(`[PHASE 4] Getting children for: ${parentCode}`);

  // First try using the hierarchy table
  const hierarchy = await prisma.$queryRaw<Array<{ children_codes: string[] }>>`
    SELECT children_codes FROM hs_code_hierarchy WHERE code = ${parentCode}
  `;

  const firstHierarchy = hierarchy[0];
  if (hierarchy.length > 0 && firstHierarchy && firstHierarchy.children_codes && firstHierarchy.children_codes.length > 0) {
    // Get descriptions for children codes
    const childrenCodes = firstHierarchy.children_codes;
    const children = await prisma.hsCode.findMany({
      where: { code: { in: childrenCodes } },
      select: { code: true, description: true, isOther: true },
      orderBy: { code: 'asc' }
    });

    logger.info(`[PHASE 4] Found ${children.length} children via hierarchy table`);
    return children;
  }

  // Fallback: query directly using LIKE pattern
  const children = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: parentCode + '.' },
      NOT: { code: parentCode }
    },
    select: { code: true, description: true, isOther: true },
    orderBy: { code: 'asc' }
  });

  // Filter to only direct children (one level deeper)
  const parentDepth = parentCode.replace(/\./g, '').length;
  const directChildren = children.filter(c => {
    const childDepth = c.code.replace(/\./g, '').length;
    // Direct children are 2 digits deeper (e.g., 0901.11 -> 0901.11.11)
    return childDepth === parentDepth + 2;
  });

  logger.info(`[PHASE 4] Found ${directChildren.length} direct children via LIKE pattern`);
  return directChildren;
}

/**
 * Get the description for an HS code
 */
async function getDescriptionForCode(code: string): Promise<string> {
  const result = await prisma.hsCode.findFirst({
    where: { code },
    select: { description: true }
  });
  return result?.description || '';
}

/**
 * Analyze children to find what attribute distinguishes them
 * Returns the distinguishing attribute with options, or null if can't determine
 */
function analyzeChildrenForDistinguishingAttribute(
  children: ChildCode[],
  knownAttributes: ProductAttributes
): DistinguishingAttribute | null {
  logger.info(`[PHASE 4] Analyzing ${children.length} children for distinguishing attribute`);

  // Skip "Other" codes for pattern analysis (but keep them as fallback)
  const nonOtherChildren = children.filter(c =>
    !c.isOther && !c.description.toLowerCase().trim().match(/^other$/i)
  );

  if (nonOtherChildren.length === 0) {
    logger.info(`[PHASE 4] All children are "Other" codes`);
    return null;
  }

  // Pattern 1: Grade detection (A, B, C, AB, PB, B/B/B)
  const gradePattern = /(?:----\s*)?([ABC]|AB|PB|B\/B\/B)\s*Grade|Grade\s*([ABC]|AB|PB|B\/B\/B)/i;
  const gradeMatches = nonOtherChildren.map(c => {
    const match = c.description.match(gradePattern);
    const gradeMatch = match ? (match[1] ?? match[2]) : null;
    const grade = gradeMatch ? gradeMatch.toUpperCase() : null;
    return { code: c.code, grade, description: c.description };
  });

  const gradesFound = gradeMatches.filter(m => m.grade);

  // If most children have grades and we don't know the grade, ask about it
  if (gradesFound.length >= nonOtherChildren.length * 0.5 && !knownAttributes.grade) {
    const uniqueGrades = [...new Set(gradesFound.map(m => m.grade))];
    logger.info(`[PHASE 4] Children differ by GRADE: ${uniqueGrades.join(', ')}`);

    return {
      attributeName: 'grade',
      options: uniqueGrades.map(g => ({
        value: g!.toLowerCase().replace(/\//g, ''),
        codes: gradesFound.filter(m => m.grade === g).map(m => m.code),
        label: `Grade ${g}`
      }))
    };
  }

  // Pattern 2: Variety + Processing method (Arabica plantation, Arabica Cherry, Rob Parchment, Rob cherry)
  const varietyProcessingPatterns = [
    { pattern: /arabica\s*plantation/i, variety: 'arabica', processing: 'plantation', label: 'Arabica Plantation' },
    { pattern: /arabica\s*cherry/i, variety: 'arabica', processing: 'cherry', label: 'Arabica Cherry' },
    { pattern: /rob\s*parchment/i, variety: 'robusta', processing: 'parchment', label: 'Robusta Parchment' },
    { pattern: /rob\s*cherry/i, variety: 'robusta', processing: 'cherry', label: 'Robusta Cherry' },
    { pattern: /\barabica\b/i, variety: 'arabica', processing: null, label: 'Arabica' },
    { pattern: /\brobusta\b|\brob\b/i, variety: 'robusta', processing: null, label: 'Robusta' }
  ];

  // Check if we need to ask about variety/processing
  if (!knownAttributes.variety || !knownAttributes.processingMethod) {
    const varietyMatches = nonOtherChildren.map(c => {
      for (const vp of varietyProcessingPatterns) {
        if (vp.pattern.test(c.description)) {
          return {
            code: c.code,
            variety: vp.variety,
            processing: vp.processing,
            label: vp.label,
            description: c.description
          };
        }
      }
      return { code: c.code, variety: null, processing: null, label: null, description: c.description };
    });

    const matchedVarieties = varietyMatches.filter(m => m.variety || m.processing);

    if (matchedVarieties.length >= nonOtherChildren.length * 0.5) {
      // Group by unique variety+processing combinations
      const combinedLabels = [...new Set(matchedVarieties.map(m => m.label))].filter(Boolean);

      if (combinedLabels.length > 1) {
        // Need to ask about variety/processing method
        const attrName = knownAttributes.variety ? 'processingMethod' : 'varietyProcessing';
        logger.info(`[PHASE 4] Children differ by VARIETY/PROCESSING: ${combinedLabels.join(', ')}`);

        return {
          attributeName: attrName,
          options: combinedLabels.map(label => ({
            value: label!.toLowerCase().replace(/\s+/g, '_'),
            codes: matchedVarieties.filter(m => m.label === label).map(m => m.code),
            label: label!
          }))
        };
      }
    }
  }

  // Pattern 3: Form detection (beans, ground, bulk, instant)
  const formPatterns = [
    { pattern: /\b(whole\s*)?beans?\b|in\s*grain/i, value: 'beans', label: 'Whole beans' },
    { pattern: /\bground\b/i, value: 'ground', label: 'Ground' },
    { pattern: /\bbulk\b/i, value: 'bulk', label: 'Bulk' },
    { pattern: /\binstant\b|\bsoluble\b/i, value: 'instant', label: 'Instant/Soluble' }
  ];

  if (!knownAttributes.form) {
    const formMatches = nonOtherChildren.map(c => {
      for (const fp of formPatterns) {
        if (fp.pattern.test(c.description)) {
          return { code: c.code, form: fp.value, label: fp.label };
        }
      }
      return { code: c.code, form: null, label: null };
    });

    const formsFound = formMatches.filter(m => m.form);
    const uniqueForms = [...new Set(formsFound.map(m => m.form))];

    if (uniqueForms.length > 1) {
      logger.info(`[PHASE 4] Children differ by FORM: ${uniqueForms.join(', ')}`);
      return {
        attributeName: 'form',
        options: uniqueForms.map(f => ({
          value: f!,
          codes: formsFound.filter(m => m.form === f).map(m => m.code),
          label: formsFound.find(m => m.form === f)?.label || f!
        }))
      };
    }
  }

  logger.info(`[PHASE 4] Cannot determine distinguishing attribute`);
  return null;
}

/**
 * Determine current position in HS hierarchy based on known attributes
 * Returns the most specific code we can determine
 */
async function determineCurrentCode(attributes: ProductAttributes): Promise<string | null> {
  if (!attributes.baseProduct) return null;

  // For coffee
  if (attributes.baseProduct === 'coffee') {
    // Check for instant coffee first (Chapter 21)
    if (attributes.form === 'instant' || attributes.chapter === '21') {
      return '2101.11';
    }

    // Regular coffee (Chapter 09)
    let code = '0901';

    // Level 1: Need roasted status to go deeper
    if (attributes.roasted === null) {
      return code; // Can't go deeper without roasted status
    }

    if (attributes.roasted === false) {
      code = '0901.1';
    } else {
      code = '0901.2';
    }

    // Level 2: Need decaf status to go deeper
    if (attributes.decaffeinated === null) {
      return code;
    }

    if (attributes.decaffeinated === false) {
      code = code + '1'; // 0901.11 or 0901.21
    } else {
      code = code + '2'; // 0901.12 or 0901.22
    }

    return code;
  }

  // For tea
  if (attributes.baseProduct === 'tea') {
    if (attributes.form === 'instant') {
      return '2101.20';
    }
    return '0902';
  }

  return null;
}

/**
 * Generate question text for an attribute
 */
function generatePhase4QuestionText(attributeName: string): string {
  const questions: Record<string, string> = {
    grade: 'What grade is the coffee?',
    variety: 'What variety of coffee is it?',
    varietyProcessing: 'What type of coffee is this?',
    processingMethod: 'How was the coffee processed?',
    form: 'What form is the product in?',
    roasted: 'Is the coffee roasted?',
    decaffeinated: 'Is the coffee decaffeinated?',
    hierarchySelection: 'Which category best matches your product?'
  };

  return questions[attributeName] || `Please specify the ${attributeName}`;
}

// ========================================
// PHASE 6.5.1-ROOT: Database-Driven Question Builder
// ========================================

/**
 * Build a question directly from database-driven distinguisher analysis
 * This ensures options come from actual HS codes, not hardcoded lists
 *
 * PHASE 6.5.1-ROOT: Core function that replaces hardcoded question generation
 *
 * @param distinguisher - The result from analyzeChildrenForDistinguishingAttribute()
 * @returns AttributeRequirement with database-driven options, or null if invalid
 */
function buildQuestionFromDistinguisher(
  distinguisher: DistinguishingAttribute | null
): AttributeRequirement | null {

  // Safety check - no distinguisher means we can't build a question
  if (!distinguisher) {
    logger.warn('[PHASE 6.5.1-ROOT] No distinguisher provided');
    return null;
  }

  // Safety check - no options means nothing to ask
  if (!distinguisher.options || distinguisher.options.length === 0) {
    logger.warn(`[PHASE 6.5.1-ROOT] Distinguisher has no options: ${distinguisher.attributeName}`);
    return null;
  }

  // Log for debugging - this proves options come from database
  const optionsSummary = distinguisher.options.map(o => `${o.label}(${o.codes?.length || 0})`).join(', ');
  logger.info(`[PHASE 6.5.1-ROOT] Building database-driven question: ${distinguisher.attributeName} with ${distinguisher.options.length} options: [${optionsSummary}]`);

  // Build the question with database-driven options
  return {
    attribute: distinguisher.attributeName as keyof ProductAttributes,
    required: true,
    questionText: generatePhase4QuestionText(distinguisher.attributeName),
    options: distinguisher.options.map(opt => ({
      value: opt.value,
      label: opt.label,
      code: opt.codes[0] || ''
    }))
  };
}

/**
 * Handle single-option auto-selection scenario
 * When only one valid option exists, we can auto-select it without asking the user
 *
 * PHASE 6.5.1-ROOT: Reduces unnecessary questions
 *
 * @param distinguisher - The distinguisher with a single option
 * @param attributes - Current known attributes to update
 * @returns Updated attributes with auto-selected value, or null if not applicable
 */
function autoSelectSingleOption(
  distinguisher: DistinguishingAttribute,
  attributes: ProductAttributes
): { updatedAttributes: ProductAttributes; autoSelectedValue: string; autoSelectedCodes: string[] } | null {

  if (!distinguisher || distinguisher.options.length !== 1) {
    return null;
  }

  const singleOption = distinguisher.options[0];
  if (!singleOption) {
    return null;
  }

  logger.info(`[PHASE 6.5.1-ROOT] Single valid option detected - auto-selecting: ${distinguisher.attributeName}=${singleOption.value} (${singleOption.label}) -> [${singleOption.codes?.join(', ') || 'none'}]`);

  // Create a copy of attributes to update
  const updatedAttributes = { ...attributes };

  // Update the appropriate attribute based on distinguisher type
  switch (distinguisher.attributeName) {
    case 'grade':
      updatedAttributes.grade = singleOption.value;
      break;
    case 'varietyProcessing':
    case 'variety':
      // Parse combined value like 'arabica_plantation'
      if (singleOption.value.includes('_')) {
        const [variety, processing] = singleOption.value.split('_');
        if (variety) updatedAttributes.variety = variety;
        if (processing) updatedAttributes.processingMethod = processing;
      } else {
        updatedAttributes.variety = singleOption.value;
      }
      break;
    case 'processingMethod':
      updatedAttributes.processingMethod = singleOption.value;
      break;
    case 'form':
      updatedAttributes.form = singleOption.value;
      break;
  }

  return {
    updatedAttributes,
    autoSelectedValue: singleOption.value,
    autoSelectedCodes: singleOption.codes || []
  };
}

// ========================================
// END PHASE 6.5.1-ROOT Helper Functions
// ========================================

/**
 * Find matching child code based on known attribute value
 */
function findMatchingChildCode(
  children: ChildCode[],
  attributeName: string,
  attributeValue: string,
  attributes: ProductAttributes
): string | null {
  const valueLower = attributeValue.toLowerCase();

  for (const child of children) {
    const descLower = child.description.toLowerCase();

    switch (attributeName) {
      case 'grade':
        // Match grade patterns like "A Grade", "AB Grade", "PB Grade"
        const gradePattern = new RegExp(`\\b${valueLower}\\s*grade|grade\\s*${valueLower}|----\\s*${valueLower}`, 'i');
        if (gradePattern.test(descLower)) {
          // Also verify variety/processing if known
          if (attributes.variety === 'arabica' && !descLower.includes('arabica')) continue;
          if (attributes.variety === 'robusta' && !descLower.includes('rob')) continue;
          if (attributes.processingMethod === 'plantation' && !descLower.includes('plantation')) continue;
          if (attributes.processingMethod === 'cherry' && !descLower.includes('cherry')) continue;
          if (attributes.processingMethod === 'parchment' && !descLower.includes('parchment')) continue;
          return child.code;
        }
        break;

      case 'varietyProcessing':
      case 'variety':
      case 'processingMethod':
        if (valueLower.includes('arabica_plantation') || valueLower === 'arabica_plantation') {
          if (descLower.includes('arabica') && descLower.includes('plantation')) return child.code;
        } else if (valueLower.includes('arabica_cherry') || valueLower === 'arabica_cherry') {
          if (descLower.includes('arabica') && descLower.includes('cherry')) return child.code;
        } else if (valueLower.includes('robusta_parchment') || valueLower === 'robusta_parchment') {
          if (descLower.includes('rob') && descLower.includes('parchment')) return child.code;
        } else if (valueLower.includes('robusta_cherry') || valueLower === 'robusta_cherry') {
          if (descLower.includes('rob') && descLower.includes('cherry')) return child.code;
        } else if (valueLower.includes('arabica')) {
          if (descLower.includes('arabica')) return child.code;
        } else if (valueLower.includes('robusta') || valueLower.includes('rob')) {
          if (descLower.includes('rob')) return child.code;
        }
        break;

      case 'form':
        if (valueLower === 'beans' && (descLower.includes('bean') || descLower.includes('grain'))) return child.code;
        if (valueLower === 'ground' && descLower.includes('ground')) return child.code;
        if (valueLower === 'bulk' && descLower.includes('bulk')) return child.code;
        break;
    }
  }

  return null;
}

// ========================================
// End of PHASE 4 Helper Functions
// ========================================

// ========================================
// PHASE 5.1: Generic Single-Match Detection
// ========================================

/**
 * PHASE 5.1: Checks if a code description matches a specific attribute value.
 * This is GENERIC and works for any product type.
 *
 * @param description - The code's description from database
 * @param attributeKey - The attribute name (grade, variety, processingMethod, etc.)
 * @param attributeValue - The value to match against
 * @returns true if the description matches the attribute value
 */
function doesCodeMatchAttribute(
  description: string,
  attributeKey: string,
  attributeValue: string | boolean
): boolean {
  const desc = description.toLowerCase();
  const value = String(attributeValue).toLowerCase();

  switch (attributeKey) {
    case 'grade':
      // Match grade patterns: "A Grade", "Grade A", "---- A Grade"
      const gradePatterns = [
        new RegExp(`\\b${value}\\s*grade\\b`, 'i'),
        new RegExp(`grade\\s*${value}\\b`, 'i'),
        new RegExp(`----\\s*${value}\\s*grade`, 'i'),
        new RegExp(`\\b${value}\\b`, 'i')  // Simple match as fallback
      ];
      return gradePatterns.some(p => p.test(description));

    case 'variety':
      if (value === 'arabica') return desc.includes('arabica');
      if (value === 'robusta') return desc.includes('rob');
      return desc.includes(value);

    case 'processingMethod':
      if (value === 'plantation') return desc.includes('plantation');
      if (value === 'cherry') return desc.includes('cherry');
      if (value === 'parchment') return desc.includes('parchment');
      return desc.includes(value);

    case 'roasted':
      // For roasted attribute, we're usually already in the right branch
      // based on the HS code (0901.1x = not roasted, 0901.2x = roasted)
      return true;

    case 'decaffeinated':
      // Similar - usually already filtered by HS position
      return true;

    case 'form':
      if (value === 'bulk') return desc.includes('bulk');
      // For 'beans': Green/unroasted coffee codes (0901.11/12) are ALL beans by definition
      // So 'beans' is not a distinguishing attribute - return true to not filter
      if (value === 'beans') return true;
      if (value === 'ground') return desc.includes('ground');
      if (value === 'instant') return desc.includes('instant') || desc.includes('soluble');
      return desc.includes(value);

    default:
      // Generic: check if value appears in description
      return desc.includes(value);
  }
}

/**
 * PHASE 5.1: Filters a list of codes to only those matching ALL known attributes.
 * Returns codes that are still valid candidates.
 *
 * This is the core of single-match detection - after each answer,
 * we filter codes by ALL known attributes. If only 1 code matches -> auto-classify!
 *
 * @param codes - List of candidate codes with descriptions
 * @param attributes - Current known product attributes
 * @returns Filtered list of codes matching all known attributes
 */
function filterCodesByAllAttributes(
  codes: Array<{ code: string; description: string }>,
  attributes: ProductAttributes
): Array<{ code: string; description: string }> {

  // Get all non-null attributes (skip meta attributes)
  const knownAttributes = Object.entries(attributes)
    .filter(([key, value]) => value !== null && value !== undefined)
    .filter(([key]) => !['baseProduct', 'chapter', 'packaging'].includes(key));

  logger.info(`[PHASE 5.1] [SINGLE-MATCH] Filtering ${codes.length} codes by ${knownAttributes.length} known attributes`);
  logger.info(`[PHASE 5.1] [SINGLE-MATCH] Known attributes: ${JSON.stringify(Object.fromEntries(knownAttributes))}`);

  const matchingCodes = codes.filter(code => {
    // Skip "Other" catch-all codes for matching purposes
    if (code.description.toLowerCase().trim() === 'other') return false;
    if (code.code.endsWith('.90') || code.code.endsWith('.99')) return false;

    // Check ALL known attributes
    for (const [key, value] of knownAttributes) {
      if (!doesCodeMatchAttribute(code.description, key, value)) {
        return false;
      }
    }

    return true;
  });

  logger.info(`[PHASE 5.1] [SINGLE-MATCH] Found ${matchingCodes.length} matching codes`);
  if (matchingCodes.length <= 5) {
    logger.info(`[PHASE 5.1] [SINGLE-MATCH] Matching codes: ${matchingCodes.map(c => c.code).join(', ')}`);
  }

  return matchingCodes;
}

// ========================================
// End of PHASE 5.1 Helper Functions
// ========================================

/**
 * Find the best matching 8-digit code from the database based on attributes
 */
async function findCoffeeCodeFromDatabase(
  attributes: ProductAttributes
): Promise<{ code: string; description: string } | null> {
  // Step 1: Determine the 6-digit subheading based on roasted/decaf status
  let subheading = '0901';

  if (attributes.roasted === false) {
    // Not roasted
    if (attributes.decaffeinated === false) {
      subheading = '0901.11'; // Not roasted, not decaffeinated
    } else if (attributes.decaffeinated === true) {
      subheading = '0901.12'; // Not roasted, decaffeinated
    }
  } else if (attributes.roasted === true) {
    // Roasted
    if (attributes.decaffeinated === false) {
      subheading = '0901.21'; // Roasted, not decaffeinated
    } else if (attributes.decaffeinated === true) {
      subheading = '0901.22'; // Roasted, decaffeinated
    }
  }

  logger.info(`[ATTR-CLASSIFIER] Looking for codes under subheading: ${subheading}`);

  // Step 2: Get all 8-digit children from database
  const children = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: subheading },
      // Only get 8-digit codes (tariff items)
      AND: [
        { code: { not: { equals: subheading } } } // Exclude the subheading itself
      ]
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  // Filter to only 8-digit codes (format: XXXX.XX.XX)
  const tariffCodes = children.filter(c => {
    const cleanCode = c.code.replace(/\./g, '');
    return cleanCode.length === 8;
  });

  logger.info(`[ATTR-CLASSIFIER] Found ${tariffCodes.length} tariff codes under ${subheading}`);

  if (tariffCodes.length === 0) {
    logger.warn(`[ATTR-CLASSIFIER] No 8-digit codes found under ${subheading}`);
    return null;
  }

  // Step 3: Score candidates based on attributes
  const scored = tariffCodes.map(candidate => {
    const score = scoreCoffeeCandidate(candidate, attributes);
    return { ...candidate, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const topCandidates = scored.slice(0, 3).map(c =>
    `${c.code} (score: ${c.score}): ${c.description.substring(0, 50)}...`
  );
  logger.info(`[ATTR-CLASSIFIER] Top candidates: ${JSON.stringify(topCandidates)}`);

  // Return best match
  if (scored[0] && scored[0].score > 0) {
    return { code: scored[0].code, description: scored[0].description };
  }

  // Fallback: return first code if no scoring match
  return tariffCodes[0] || null;
}

/**
 * Score a candidate code against the extracted attributes
 */
function scoreCoffeeCandidate(
  candidate: { code: string; description: string },
  attributes: ProductAttributes
): number {
  let score = 0;
  const descLower = candidate.description.toLowerCase();

  // Variety matching (high weight)
  if (attributes.variety === 'arabica') {
    if (descLower.includes('arabica')) {
      score += 30;
    } else if (descLower.includes('rob')) {
      score -= 20; // Penalty for wrong variety
    }
  } else if (attributes.variety === 'robusta') {
    if (descLower.includes('rob')) {
      score += 30;
    } else if (descLower.includes('arabica')) {
      score -= 20; // Penalty for wrong variety
    }
  }

  // Processing method matching
  if (attributes.processingMethod === 'plantation') {
    if (descLower.includes('plantation')) score += 15;
  } else if (attributes.processingMethod === 'cherry') {
    if (descLower.includes('cherry')) score += 15;
  } else if (attributes.processingMethod === 'parchment') {
    if (descLower.includes('parchment')) score += 15;
  }

  // Grade matching (exact match preferred)
  if (attributes.grade) {
    const gradeUpper = attributes.grade.toUpperCase();
    // Check for exact grade match in description
    if (descLower.includes(`${gradeUpper.toLowerCase()} grade`) ||
        descLower.includes(`grade ${gradeUpper.toLowerCase()}`)) {
      score += 20;
    } else if (descLower.includes(gradeUpper.toLowerCase())) {
      score += 10;
    }

    // Specific grade patterns
    if (gradeUpper === 'A' && descLower.includes('a grade')) score += 10;
    if (gradeUpper === 'B' && descLower.includes('b grade')) score += 10;
    if (gradeUpper === 'C' && descLower.includes('c grade')) score += 10;
    if (gradeUpper === 'AB' && descLower.includes('ab grade')) score += 10;
    if (gradeUpper === 'PB' && (descLower.includes('pb grade') || descLower.includes('peaberry'))) score += 10;
  }

  // Packaging matching
  if (attributes.packaging === 'bulk') {
    if (descLower.includes('bulk')) score += 10;
  }

  // Form matching for roasted coffee
  if (attributes.form === 'ground') {
    if (descLower.includes('ground')) score += 15;
    else if (descLower.includes('other')) score += 5; // "Other" often includes ground
  } else if (attributes.form === 'beans') {
    if (descLower.includes('bean') || descLower.includes('grain')) score += 15;
    else if (descLower.includes('bulk')) score += 10; // Bulk often means beans
  }

  // Penalize "Other" codes slightly (prefer specific codes)
  if (candidate.code.endsWith('.90') || descLower === 'other') {
    score -= 5;
  }

  return score;
}

/**
 * Find instant coffee code from database
 */
async function findInstantCoffeeCode(
  attributes: ProductAttributes
): Promise<{ code: string; description: string } | null> {
  // Get instant coffee codes (2101.11.xx)
  const codes = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '2101.11' }
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  // Filter to 8-digit codes
  const tariffCodes = codes.filter(c => {
    const cleanCode = c.code.replace(/\./g, '');
    return cleanCode.length === 8;
  });

  if (tariffCodes.length === 0) return null;

  // Score based on attributes
  const scored = tariffCodes.map(c => {
    let score = 0;
    const descLower = c.description.toLowerCase();

    if (attributes.form === 'instant') {
      if (descLower.includes('instant')) score += 20;
      // Default to not flavoured unless specified
      if (descLower.includes('not flavoured') || descLower.includes('unflavoured')) score += 10;
    } else if (attributes.form === 'extract' || attributes.form === 'essence') {
      if (descLower.includes('other') || descLower.includes('aroma')) score += 10;
    }

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] || tariffCodes[0] || null;
}

// Required attributes for coffee classification
const COFFEE_REQUIRED_ATTRIBUTES: AttributeRequirement[] = [
  {
    attribute: 'form',
    required: true,
    possibleValues: ['beans', 'instant', 'extract', 'husk'],
    questionText: 'What form is your coffee product?',
    options: [
      { value: 'beans', label: 'Coffee beans (raw or roasted)', code: '0901' },
      { value: 'instant', label: 'Instant/soluble coffee', code: '2101.11.10' },
      { value: 'extract', label: 'Coffee extract/essence/concentrate', code: '2101.11.20' },
      { value: 'husk', label: 'Coffee husks, skins, or substitutes', code: '0901.90' }
    ]
  },
  {
    attribute: 'roasted',
    required: true,
    possibleValues: ['roasted', 'not_roasted'],
    questionText: 'Is the coffee roasted?',
    options: [
      { value: 'not_roasted', label: 'Not roasted (green coffee beans)' },
      { value: 'roasted', label: 'Roasted coffee' }
    ]
  },
  {
    attribute: 'decaffeinated',
    required: true,
    possibleValues: ['decaf', 'not_decaf'],
    questionText: 'Is the coffee decaffeinated?',
    options: [
      { value: 'not_decaf', label: 'Regular (not decaffeinated)' },
      { value: 'decaf', label: 'Decaffeinated' }
    ]
  },
  {
    attribute: 'variety',
    required: true,
    possibleValues: ['arabica', 'robusta', 'other'],
    questionText: 'What variety of coffee?',
    options: [
      { value: 'arabica', label: 'Arabica' },
      { value: 'robusta', label: 'Robusta' },
      { value: 'other', label: 'Other variety' }
    ]
  }
];

// ========================================
// Attribute Extraction
// ========================================

/**
 * Extract product attributes from user input using pattern matching
 */
export function extractAttributes(userInput: string): ProductAttributes {
  const input = userInput.toLowerCase().trim();

  const attributes: ProductAttributes = {
    baseProduct: null,
    variety: null,
    grade: null,
    roasted: null,
    decaffeinated: null,
    form: null,
    processingMethod: null,
    packaging: null,
    chapter: null
  };

  // ========================================
  // Base Product Detection
  // ========================================

  if (/\bcoffee\b/.test(input)) {
    attributes.baseProduct = 'coffee';
  } else if (/\btea\b/.test(input)) {
    attributes.baseProduct = 'tea';
  } else if (/\bwheat\b/.test(input)) {
    attributes.baseProduct = 'wheat';
  } else if (/\brice\b/.test(input)) {
    attributes.baseProduct = 'rice';
  } else if (/\bpepper\b/.test(input)) {
    attributes.baseProduct = 'pepper';
  }

  // ========================================
  // Coffee-Specific Attribute Extraction
  // ========================================

  if (attributes.baseProduct === 'coffee') {
    // Form detection
    if (/\binstant\b|\bsoluble\b/.test(input)) {
      attributes.form = 'instant';
      attributes.chapter = '21';  // Chapter 21 for instant coffee
    } else if (/\bextract\b|\bessence\b|\bconcentrate\b/.test(input)) {
      attributes.form = 'extract';
      attributes.chapter = '21';
    } else if (/\bhusk\b|\bskin\b|\bshell\b/.test(input)) {
      attributes.form = 'husk';
      attributes.chapter = '09';
    } else if (/\bsubstitute\b/.test(input)) {
      attributes.form = 'substitute';
      attributes.chapter = '09';
    } else if (/\bground\b/.test(input)) {
      attributes.form = 'ground';
      attributes.chapter = '09';
    } else if (/\bbean\b|\bbeans\b/.test(input)) {
      attributes.form = 'beans';
      attributes.chapter = '09';
    } else {
      // Default to beans for raw coffee descriptions
      attributes.form = 'beans';
      attributes.chapter = '09';
    }

    // Roasted status
    if (/\bnot\s*roasted\b|\bunroasted\b|\braw\b|\bgreen\s*coffee\b/.test(input)) {
      attributes.roasted = false;
    } else if (/\broasted\b/.test(input)) {
      attributes.roasted = true;
    }

    // Decaffeination status
    if (/\bnot\s*decaf\b|\bnot\s*decaffeinated\b|\bregular\b|\bcaffeinated\b|\bwith\s*caffeine\b/.test(input)) {
      attributes.decaffeinated = false;
    } else if (/\bdecaf\b|\bdecaffeinated\b|\bcaffeine[\s-]*free\b/.test(input)) {
      attributes.decaffeinated = true;
    }

    // Variety detection
    if (/\barabica\b/.test(input)) {
      attributes.variety = 'arabica';
    } else if (/\brobusta\b|\brob\b/.test(input)) {
      attributes.variety = 'robusta';
    } else if (/\bliberica\b/.test(input)) {
      attributes.variety = 'liberica';
    } else if (/\bexcelsa\b/.test(input)) {
      attributes.variety = 'excelsa';
    }

    // Grade detection
    const gradeMatch = input.match(/\bgrade\s*([a-c])\b|\b([a-c])\s*grade\b|\bplantation\s*([a-c])\b/i);
    if (gradeMatch) {
      attributes.grade = (gradeMatch[1] || gradeMatch[2] || gradeMatch[3] || '').toLowerCase();
    } else if (/\bab\s*grade\b|\bgrade\s*ab\b/i.test(input)) {
      attributes.grade = 'ab';
    } else if (/\bpb\s*grade\b|\bgrade\s*pb\b|\bpeaberry\b/i.test(input)) {
      attributes.grade = 'pb';
    }

    // Processing method
    if (/\bparchment\b/.test(input)) {
      attributes.processingMethod = 'parchment';
    } else if (/\bcherry\b/.test(input)) {
      attributes.processingMethod = 'cherry';
    } else if (/\bplantation\b/.test(input)) {
      attributes.processingMethod = 'plantation';
    }

    // Packaging
    if (/\bbulk\b/.test(input)) {
      attributes.packaging = 'bulk';
    } else if (/\bretail\b|\bpack(ed|ing|s)?\b/.test(input)) {
      attributes.packaging = 'retail';
    }
  }

  // ========================================
  // Tea-Specific Attribute Extraction
  // ========================================

  if (attributes.baseProduct === 'tea') {
    // Form detection
    if (/\binstant\b|\bsoluble\b/.test(input)) {
      attributes.form = 'instant';
      attributes.chapter = '21';
    } else if (/\bextract\b|\bessence\b/.test(input)) {
      attributes.form = 'extract';
      attributes.chapter = '21';
    } else if (/\bleav(es?)\b|\bleaf\b/.test(input)) {
      attributes.form = 'leaves';
      attributes.chapter = '09';
    } else {
      attributes.form = 'leaves';
      attributes.chapter = '09';
    }

    // Tea variety detection
    if (/\bgreen\s*tea\b|\bgreen\b/.test(input)) {
      attributes.variety = 'green';
    } else if (/\bblack\s*tea\b|\bblack\b/.test(input)) {
      attributes.variety = 'black';
    } else if (/\boolong\b/.test(input)) {
      attributes.variety = 'oolong';
    } else if (/\bwhite\s*tea\b|\bwhite\b/.test(input)) {
      attributes.variety = 'white';
    }
  }

  logger.info(`[ATTR-EXTRACT] Input: "${userInput.substring(0, 50)}..."`);
  logger.info(`[ATTR-EXTRACT] Extracted: ${JSON.stringify(attributes)}`);

  return attributes;
}

// ========================================
// Completeness Analysis
// ========================================

/**
 * Analyze if we have enough information to classify
 * NOW ASYNC to support database queries
 */
export async function analyzeCompleteness(attributes: ProductAttributes): Promise<CompletenessResult> {
  const result: CompletenessResult = {
    isComplete: false,
    missingAttributes: [],
    confidence: 0,
    suggestedCode: null,
    attributes,
    nextQuestion: null,
    reasoning: ''
  };

  // Handle coffee specifically - now with database query
  if (attributes.baseProduct === 'coffee') {
    return await analyzeCoffeeCompleteness(attributes);
  }

  // Handle tea specifically
  if (attributes.baseProduct === 'tea') {
    return analyzeTeaCompleteness(attributes);
  }

  // For unknown products, delegate to LLM navigator
  result.reasoning = 'Product type not recognized for attribute-based classification';
  return result;
}

/**
 * PHASE 4: Analyze coffee classification completeness using DATABASE-DRIVEN hierarchy
 * PHASE 4.5: Enhanced with better logging and grade detection
 * This replaces the hardcoded attribute checking with dynamic hierarchy traversal
 */
async function analyzeCoffeeCompleteness(attributes: ProductAttributes): Promise<CompletenessResult> {
  logger.info(`[PHASE 4.5] === analyzeCoffeeCompleteness START ===`);
  logger.info(`[PHASE 4.5] Input attributes: ${JSON.stringify(attributes)}`);

  const result: CompletenessResult = {
    isComplete: false,
    missingAttributes: [],
    confidence: 0,
    suggestedCode: null,
    attributes,
    nextQuestion: null,
    reasoning: ''
  };

  // CASE 1: Instant/Extract coffee → query database for Chapter 21 codes
  if (attributes.form === 'instant' || attributes.form === 'extract') {
    const instantResult = await findInstantCoffeeCode(attributes);
    result.isComplete = true;
    result.suggestedCode = instantResult?.code || '2101.11.20';
    result.confidence = 95;
    result.reasoning = `Instant/extract coffee → ${result.suggestedCode}`;
    logger.info(`[PHASE 4.5] CASE 1: Instant/extract coffee → ${result.suggestedCode}`);
    return result;
  }

  // CASE 2: Coffee husks/skins/substitutes
  if (attributes.form === 'husk' || attributes.form === 'substitute') {
    result.isComplete = true;
    result.suggestedCode = attributes.form === 'husk' ? '0901.90.10' : '0901.90.90';
    result.confidence = 90;
    result.reasoning = `Coffee byproduct → ${result.suggestedCode}`;
    logger.info(`[PHASE 4.5] CASE 2: Coffee byproduct → ${result.suggestedCode}`);
    return result;
  }

  // CASE 3: Regular coffee beans - USE DATABASE-DRIVEN HIERARCHY NAVIGATION
  logger.info(`[PHASE 4.5] CASE 3: Regular coffee beans - starting database-driven completeness check`);

  // Step 1: First check basic required attributes (roasted, decaf)
  // These are needed to determine the 6-digit subheading
  if (attributes.roasted === null) {
    result.missingAttributes = ['roasted'];
    result.nextQuestion = generateCoffeeQuestion('roasted');
    result.reasoning = 'Need to know if coffee is roasted';
    result.confidence = 30;
    logger.info(`[PHASE 4.5] Missing 'roasted' attribute, returning question`);
    return result;
  }

  if (attributes.decaffeinated === null) {
    result.missingAttributes = ['decaffeinated'];
    result.nextQuestion = generateCoffeeQuestion('decaffeinated');
    result.reasoning = 'Need to know if coffee is decaffeinated';
    result.confidence = 40;
    logger.info(`[PHASE 4.5] Missing 'decaffeinated' attribute, returning question`);
    return result;
  }

  // Step 2: For roasted coffee, check form (beans vs ground)
  if (attributes.roasted === true && attributes.form !== 'beans' && attributes.form !== 'ground') {
    result.missingAttributes = ['roasted_form'];
    result.nextQuestion = generateCoffeeQuestion('roasted_form');
    result.reasoning = 'Need to know if roasted coffee is beans or ground';
    result.confidence = 50;
    logger.info(`[PHASE 4.5] Missing 'roasted_form' attribute, returning question`);
    return result;
  }

  // Step 3: Determine current position in hierarchy
  const currentCode = await determineCurrentCode(attributes);
  logger.info(`[PHASE 4.5] Step 3: Determined current position: ${currentCode}`);

  if (!currentCode) {
    logger.warn(`[PHASE 4.5] Cannot determine position in HS hierarchy`);
    result.reasoning = 'Cannot determine position in HS hierarchy';
    return result;
  }

  // Step 4: Get children from database
  const children = await getChildrenFromDatabase(currentCode);
  logger.info(`[PHASE 4.5] Step 4: Found ${children.length} children of ${currentCode}`);

  // Step 5: If no children, we're at a leaf node - COMPLETE!
  if (children.length === 0) {
    const codeDigits = currentCode.replace(/\./g, '').length;
    logger.info(`[PHASE 4.5] Step 5: No children found, code digits: ${codeDigits}`);
    if (codeDigits >= 8) {
      result.isComplete = true;
      result.suggestedCode = currentCode;
      result.confidence = 92;
      result.reasoning = buildCoffeeReasoning(attributes);
      const desc = await getDescriptionForCode(currentCode);
      if (desc) result.reasoning += ` → ${desc}`;
      logger.info(`[PHASE 4.5] LEAF NODE: Auto-classifying to ${currentCode}`);
      return result;
    }
  }

  // Step 6: If only one non-"Other" child, check if we should auto-select
  const nonOtherChildren = children.filter(c => !c.isOther && c.description.toLowerCase() !== 'other');
  logger.info(`[PHASE 4.5] Step 6: Non-other children count: ${nonOtherChildren.length}`);
  if (nonOtherChildren.length === 1 && nonOtherChildren[0]) {
    // Check if this single child is a leaf
    const singleChild = nonOtherChildren[0];
    const singleChildChildren = await getChildrenFromDatabase(singleChild.code);
    if (singleChildChildren.length === 0) {
      result.isComplete = true;
      result.suggestedCode = singleChild.code;
      result.confidence = 88;
      result.reasoning = `${buildCoffeeReasoning(attributes)} → ${singleChild.description}`;
      logger.info(`[PHASE 4.5] SINGLE CHILD: Auto-classifying to ${singleChild.code}`);
      return result;
    }
  }

  // Step 7: Multiple children - find what distinguishes them
  // PHASE 6.5.1-ROOT: Filter children by ALL known attributes BEFORE calling distinguisher
  // This ensures we only show options that are valid for the user's previous answers
  logger.info(`[PHASE 6.5.1-ROOT] Step 7: Filtering children by known attributes before distinguisher analysis...`);

  const filteredChildren = filterCodesByAllAttributes(children, attributes);
  const codesToAnalyze = filteredChildren.length > 0 ? filteredChildren : nonOtherChildren;

  logger.info(`[PHASE 6.5.1-ROOT] Step 7: After filtering - ${filteredChildren.length} filtered, using ${codesToAnalyze.length} for analysis`);

  // PHASE 6.5.1-ROOT: If filtering narrows to exactly 1 code, check if it's a leaf and auto-classify
  if (codesToAnalyze.length === 1 && codesToAnalyze[0]) {
    const singleMatch = codesToAnalyze[0];
    const singleMatchChildren = await getChildrenFromDatabase(singleMatch.code);

    if (singleMatchChildren.length === 0) {
      // It's a leaf node - auto-classify!
      logger.info(`[PHASE 6.5.1-ROOT] SINGLE FILTERED MATCH: Auto-classifying to ${singleMatch.code}`);
      result.isComplete = true;
      result.suggestedCode = singleMatch.code;
      result.confidence = 92;
      result.reasoning = `${buildCoffeeReasoning(attributes)} → ${singleMatch.description}`;
      return result;
    } else {
      // Has children - recurse into it
      logger.info(`[PHASE 6.5.1-ROOT] Single filtered match has children, recursing into ${singleMatch.code}`);
      return await analyzeCoffeeCompletenessAtCode(singleMatch.code, attributes);
    }
  }

  logger.info(`[PHASE 4.5] Step 7: Analyzing ${codesToAnalyze.length} codes for distinguishing attribute...`);
  const distinguisher = analyzeChildrenForDistinguishingAttribute(codesToAnalyze, attributes);

  if (distinguisher) {
    logger.info(`[PHASE 4.5] FOUND DISTINGUISHER: ${distinguisher.attributeName} with ${distinguisher.options.length} options`);

    // Check if we already know this attribute
    const knownValue = getAttributeValue(attributes, distinguisher.attributeName);
    logger.info(`[PHASE 4.5] Known value for ${distinguisher.attributeName}: ${knownValue || 'null'}`);

    if (knownValue) {
      // We know the value - find matching child and recurse
      const matchingCode = findMatchingChildFromDistinguisher(distinguisher, knownValue, attributes, children);

      if (matchingCode) {
        logger.info(`[PHASE 4.5] Known ${distinguisher.attributeName}=${knownValue}, narrowed to ${matchingCode}`);
        // Recurse to check if this child needs more questions
        return await analyzeCoffeeCompletenessAtCode(matchingCode, attributes);
      } else {
        logger.warn(`[PHASE 4.5] Could not find matching code for ${distinguisher.attributeName}=${knownValue}`);
      }
    }

    // We don't know this attribute - need to ask
    logger.info(`[PHASE 4.5] Need to ask about ${distinguisher.attributeName}`);
    result.missingAttributes = [distinguisher.attributeName];
    result.confidence = 60;
    result.reasoning = `Need to determine ${distinguisher.attributeName} to narrow down classification`;
    result.nextQuestion = {
      attribute: distinguisher.attributeName as keyof ProductAttributes,
      required: true,
      questionText: generatePhase4QuestionText(distinguisher.attributeName),
      options: distinguisher.options.map((opt, idx) => ({
        value: opt.value,
        label: opt.label,
        code: opt.codes[0] || ''
      }))
    };
    logger.info(`[PHASE 4.5] Returning question for ${distinguisher.attributeName}: ${result.nextQuestion.questionText}`);

    return result;
  }

  // Step 8: Can't determine distinguishing attribute
  logger.warn(`[PHASE 4.5] Step 8: NO DISTINGUISHER FOUND - this may cause issues!`);
  logger.info(`[PHASE 4.5] Trying scoring fallback...`);

  const bestMatch = await findCoffeeCodeFromDatabase(attributes);
  if (bestMatch) {
    result.isComplete = true;
    result.suggestedCode = bestMatch.code;
    result.confidence = 75; // Lower confidence since we couldn't determine via hierarchy
    result.reasoning = `${buildCoffeeReasoning(attributes)} → ${bestMatch.description}`;
    logger.info(`[PHASE 4.5] SCORING FALLBACK: Auto-classifying to ${bestMatch.code}`);
    return result;
  }

  // ========================================
  // PHASE 6.5.1-ROOT: Database-Driven Fallback
  // Try to build database-driven questions using filtered children
  // ========================================
  logger.warn(`[PHASE 6.5.1-ROOT] Scoring fallback failed, trying database-driven question generation`);

  // PHASE 6.5.1-ROOT: Try to build a database-driven question from filtered children
  // Use the already-filtered 'codesToAnalyze' from Step 7
  if (codesToAnalyze && codesToAnalyze.length > 0) {
    // Try to find a distinguishing attribute among remaining codes
    const fallbackDistinguisher = analyzeChildrenForDistinguishingAttribute(codesToAnalyze, attributes);

    if (fallbackDistinguisher) {
      logger.info(`[PHASE 6.5.1-ROOT] Found fallback distinguisher: ${fallbackDistinguisher.attributeName} with ${fallbackDistinguisher.options.length} options`);

      // PHASE 6.5.1-ROOT: Handle single-option auto-selection
      if (fallbackDistinguisher.options.length === 1) {
        const autoSelect = autoSelectSingleOption(fallbackDistinguisher, attributes);
        if (autoSelect && autoSelect.autoSelectedCodes.length === 1) {
          const autoCode = autoSelect.autoSelectedCodes[0];
          if (autoCode) {
            logger.info(`[PHASE 6.5.1-ROOT] Fallback auto-selecting to ${autoCode}`);
            result.isComplete = true;
            result.suggestedCode = autoCode;
            result.confidence = 88;
            result.reasoning = `${buildCoffeeReasoning(autoSelect.updatedAttributes)} → auto-selected`;
            return result;
          }
        }
      }

      // Multiple options - build database-driven question
      result.nextQuestion = buildQuestionFromDistinguisher(fallbackDistinguisher);
      if (result.nextQuestion) {
        result.missingAttributes = [fallbackDistinguisher.attributeName];
        result.confidence = 50;
        result.reasoning = `Need ${fallbackDistinguisher.attributeName} to determine exact classification`;
        logger.info(`[PHASE 6.5.1-ROOT] Returning database-driven fallback question for ${fallbackDistinguisher.attributeName}`);
        return result;
      }
    }
  }

  // If we know variety but not grade, try database-driven grade options
  if (attributes.variety && !attributes.grade) {
    logger.info(`[PHASE 6.5.1-ROOT] Known variety (${attributes.variety}) but no grade - trying database-driven grade question`);

    // Try to get grades from database for this variety
    const varietyPattern = attributes.variety.toLowerCase();
    const gradesFromDb = codesToAnalyze
      .map(c => {
        const gradeMatch = c.description.match(/(?:----\s*)?([ABC]|AB|PB|B\/B\/B)\s*Grade|Grade\s*([ABC]|AB|PB|B\/B\/B)/i);
        if (gradeMatch) {
          const grade = (gradeMatch[1] ?? gradeMatch[2])?.toUpperCase();
          return { grade, code: c.code };
        }
        return null;
      })
      .filter((g): g is { grade: string; code: string } => g !== null);

    const uniqueGrades = [...new Set(gradesFromDb.map(g => g.grade))];

    if (uniqueGrades.length > 0) {
      logger.info(`[PHASE 6.5.1-ROOT] Found ${uniqueGrades.length} grades from database: ${uniqueGrades.join(', ')}`);
      result.missingAttributes = ['grade'];
      result.confidence = 50;
      result.reasoning = 'Need coffee grade to determine exact classification';
      result.nextQuestion = {
        attribute: 'grade',
        required: true,
        questionText: 'What grade is the coffee?',
        options: uniqueGrades.map(g => ({
          value: g.toLowerCase().replace(/\//g, ''),
          label: `Grade ${g}`,
          code: gradesFromDb.find(gdb => gdb.grade === g)?.code || ''
        }))
      };
      logger.info(`[PHASE 6.5.1-ROOT] Returning database-driven grade question with ${uniqueGrades.length} options`);
      return result;
    }

    // Ultimate fallback for grade - use generateCoffeeQuestion (deprecated path)
    logger.warn(`[PHASE 6.5.1-ROOT] No grades found in database, using hardcoded fallback (DEPRECATED)`);
    result.missingAttributes = ['grade'];
    result.confidence = 50;
    result.reasoning = 'Need coffee grade to determine exact classification';
    result.nextQuestion = generateCoffeeQuestion('grade');
    logger.info(`[PHASE 4.5] Returning grade question (hardcoded fallback)`);
    return result;
  }

  // If we don't know variety, try database-driven variety options
  if (!attributes.variety) {
    logger.info(`[PHASE 6.5.1-ROOT] No variety known - trying database-driven variety question`);

    // Try to get variety/processing from database
    const varietyProcessingPatterns = [
      { pattern: /arabica\s*plantation/i, value: 'arabica_plantation', label: 'Arabica Plantation' },
      { pattern: /arabica\s*cherry/i, value: 'arabica_cherry', label: 'Arabica Cherry' },
      { pattern: /rob\s*parchment/i, value: 'robusta_parchment', label: 'Robusta Parchment' },
      { pattern: /rob\s*cherry/i, value: 'robusta_cherry', label: 'Robusta Cherry' }
    ];

    const varietiesFromDb = codesToAnalyze
      .map(c => {
        for (const vp of varietyProcessingPatterns) {
          if (vp.pattern.test(c.description)) {
            return { value: vp.value, label: vp.label, code: c.code };
          }
        }
        return null;
      })
      .filter((v): v is { value: string; label: string; code: string } => v !== null);

    const uniqueVarieties = [...new Map(varietiesFromDb.map(v => [v.value, v])).values()];

    if (uniqueVarieties.length > 0) {
      logger.info(`[PHASE 6.5.1-ROOT] Found ${uniqueVarieties.length} variety/processing options from database`);
      result.missingAttributes = ['varietyProcessing'];
      result.confidence = 50;
      result.reasoning = 'Need coffee variety and processing method';
      result.nextQuestion = {
        attribute: 'variety',
        required: true,
        questionText: 'What type of coffee is this?',
        options: uniqueVarieties.map(v => ({
          value: v.value,
          label: v.label,
          code: v.code
        }))
      };
      logger.info(`[PHASE 6.5.1-ROOT] Returning database-driven variety question with ${uniqueVarieties.length} options`);
      return result;
    }

    // Ultimate fallback for variety - use hardcoded options (deprecated path)
    logger.warn(`[PHASE 6.5.1-ROOT] No varieties found in database, using hardcoded fallback (DEPRECATED)`);
    result.missingAttributes = ['varietyProcessing'];
    result.confidence = 50;
    result.reasoning = 'Need coffee variety and processing method';
    result.nextQuestion = {
      attribute: 'variety',
      required: true,
      questionText: 'What type of coffee is this?',
      options: [
        { value: 'arabica_plantation', label: 'Arabica Plantation' },
        { value: 'arabica_cherry', label: 'Arabica Cherry' },
        { value: 'robusta_parchment', label: 'Robusta Parchment' },
        { value: 'robusta_cherry', label: 'Robusta Cherry' }
      ]
    };
    logger.info(`[PHASE 4.5] Returning variety question (hardcoded fallback)`);
    return result;
  }

  // Ultimate fallback - show hierarchy selection (shouldn't reach here with the above fixes)
  logger.warn(`[PHASE 4.5] ULTIMATE FALLBACK: Showing hierarchy selection`);
  result.missingAttributes = ['hierarchySelection'];
  result.confidence = 30;
  result.reasoning = 'Please select the best matching category';
  result.nextQuestion = {
    attribute: 'form' as keyof ProductAttributes, // Use 'form' as a proxy
    required: true,
    questionText: 'Which category best matches your product?',
    options: children.slice(0, 8).map(c => ({
      value: c.code,
      label: c.description,
      code: c.code
    }))
  };

  return result;
}

/**
 * Helper to get attribute value by name
 */
function getAttributeValue(attributes: ProductAttributes, attrName: string): string | null {
  switch (attrName) {
    case 'grade': return attributes.grade;
    case 'variety': return attributes.variety;
    case 'processingMethod': return attributes.processingMethod;
    case 'form': return attributes.form;
    case 'varietyProcessing':
      // Combined variety + processing
      if (attributes.variety && attributes.processingMethod) {
        return `${attributes.variety}_${attributes.processingMethod}`;
      }
      return attributes.variety || attributes.processingMethod;
    default: return null;
  }
}

/**
 * Find matching child code from distinguisher options
 */
function findMatchingChildFromDistinguisher(
  distinguisher: DistinguishingAttribute,
  knownValue: string,
  attributes: ProductAttributes,
  children: ChildCode[]
): string | null {
  const valueLower = knownValue.toLowerCase();

  // Find matching option in distinguisher
  for (const option of distinguisher.options) {
    if (option.value.toLowerCase() === valueLower ||
        option.label.toLowerCase().includes(valueLower) ||
        valueLower.includes(option.value.toLowerCase())) {

      // For grade, also check variety/processing match
      if (distinguisher.attributeName === 'grade') {
        for (const code of option.codes) {
          const child = children.find(c => c.code === code);
          if (child) {
            const descLower = child.description.toLowerCase();
            // Verify variety/processing matches if known
            if (attributes.variety === 'arabica' && !descLower.includes('arabica')) continue;
            if (attributes.variety === 'robusta' && !descLower.includes('rob')) continue;
            if (attributes.processingMethod === 'plantation' && !descLower.includes('plantation')) continue;
            if (attributes.processingMethod === 'cherry' && !descLower.includes('cherry')) continue;
            if (attributes.processingMethod === 'parchment' && !descLower.includes('parchment')) continue;
            return code;
          }
        }
      }

      // Return first matching code for this option
      if (option.codes.length > 0 && option.codes[0]) {
        return option.codes[0];
      }
    }
  }

  return null;
}

/**
 * Recursively check completeness at a specific code position
 */
async function analyzeCoffeeCompletenessAtCode(
  code: string,
  attributes: ProductAttributes
): Promise<CompletenessResult> {
  const result: CompletenessResult = {
    isComplete: false,
    missingAttributes: [],
    confidence: 0,
    suggestedCode: null,
    attributes,
    nextQuestion: null,
    reasoning: ''
  };

  const children = await getChildrenFromDatabase(code);

  // Leaf node
  if (children.length === 0) {
    result.isComplete = true;
    result.suggestedCode = code;
    result.confidence = 92;
    const desc = await getDescriptionForCode(code);
    result.reasoning = `${buildCoffeeReasoning(attributes)} → ${desc}`;
    logger.info(`[PHASE 5.1] LEAF NODE: Auto-classifying to ${code}`);
    return result;
  }

  // ============================================
  // PHASE 5.1: SINGLE-MATCH DETECTION
  // Filter children by ALL known attributes BEFORE asking questions
  // If only ONE code matches -> AUTO-CLASSIFY immediately!
  // ============================================

  logger.info(`[PHASE 5.1] Checking for single-match at code: ${code}`);

  // Filter children by ALL known attributes
  const matchingChildren = filterCodesByAllAttributes(children, attributes);

  logger.info(`[PHASE 5.1] After filtering by attributes: ${matchingChildren.length} codes match`);

  // If only ONE code matches all known attributes -> AUTO-CLASSIFY!
  if (matchingChildren.length === 1) {
    const matchedCode = matchingChildren[0];
    if (matchedCode) {
      logger.info(`[PHASE 5.1] SINGLE MATCH FOUND: ${matchedCode.code}`);

      // Check if this is a leaf node (8-digit code)
      const matchedChildren = await getChildrenFromDatabase(matchedCode.code);

      if (matchedChildren.length === 0) {
        // It's a leaf - classify immediately!
        logger.info(`[PHASE 5.1] AUTO-CLASSIFYING to ${matchedCode.code}`);
        result.isComplete = true;
        result.suggestedCode = matchedCode.code;
        result.confidence = 92;
        result.missingAttributes = [];
        result.reasoning = `${buildCoffeeReasoning(attributes)} → ${matchedCode.description}`;
        return result;
      } else {
        // Has children - recurse into it
        logger.info(`[PHASE 5.1] Single match has children, recursing into ${matchedCode.code}`);
        return analyzeCoffeeCompletenessAtCode(matchedCode.code, attributes);
      }
    }
  }

  // If ZERO codes match (shouldn't happen, but safety check)
  if (matchingChildren.length === 0) {
    logger.warn(`[PHASE 5.1] No codes match all attributes! Using all children.`);
    // Fall back to using all children for subsequent logic
  }

  // ============================================
  // END PHASE 5.1 SINGLE-MATCH DETECTION
  // ============================================

  // Multiple codes still match - need to ask more questions
  // Check for distinguishing attribute among children (use filtered if available)
  const codesToAnalyze = matchingChildren.length > 0 ? matchingChildren : children;
  const distinguisher = analyzeChildrenForDistinguishingAttribute(codesToAnalyze, attributes);

  if (!distinguisher) {
    // Can't distinguish - use first non-other child or scoring fallback
    const nonOther = children.filter(c => !c.isOther);
    if (nonOther.length === 1 && nonOther[0]) {
      return await analyzeCoffeeCompletenessAtCode(nonOther[0].code, attributes);
    }

    // Use scoring as fallback
    const bestMatch = await findCoffeeCodeFromDatabase(attributes);
    if (bestMatch) {
      result.isComplete = true;
      result.suggestedCode = bestMatch.code;
      result.confidence = 75;
      result.reasoning = buildCoffeeReasoning(attributes);
      return result;
    }

    // Fallback to "Other"
    const otherCode = children.find(c => c.isOther);
    if (otherCode) {
      result.isComplete = true;
      result.suggestedCode = otherCode.code;
      result.confidence = 60;
      result.reasoning = `${buildCoffeeReasoning(attributes)} → Other`;
      return result;
    }

    return result;
  }

  // Check if we know the distinguishing attribute
  const knownValue = getAttributeValue(attributes, distinguisher.attributeName);

  if (knownValue) {
    const matchingCode = findMatchingChildFromDistinguisher(distinguisher, knownValue, attributes, children);
    if (matchingCode) {
      return await analyzeCoffeeCompletenessAtCode(matchingCode, attributes);
    }
  }

  // Need to ask about this attribute
  result.missingAttributes = [distinguisher.attributeName];
  result.confidence = 60;
  result.reasoning = `Need to determine ${distinguisher.attributeName}`;
  result.nextQuestion = {
    attribute: distinguisher.attributeName as keyof ProductAttributes,
    required: true,
    questionText: generatePhase4QuestionText(distinguisher.attributeName),
    options: distinguisher.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
      code: opt.codes[0] || ''
    }))
  };

  return result;
}

/**
 * Determine the exact coffee HS code from attributes
 * NOW QUERIES THE DATABASE instead of using hardcoded mappings
 */
async function determineCoffeeCode(attributes: ProductAttributes): Promise<string> {
  // Use database query to find the actual code
  const result = await findCoffeeCodeFromDatabase(attributes);

  if (result) {
    logger.info(`[ATTR-CLASSIFIER] Database returned code: ${result.code}`);
    return result.code;
  }

  // Fallback to "Other" codes if no match found
  // These are guaranteed to exist in the database
  logger.warn(`[ATTR-CLASSIFIER] No specific match found, using "Other" code`);

  if (attributes.roasted === false) {
    if (attributes.decaffeinated === false) {
      return '0901.11.90'; // Other not roasted, not decaf
    } else {
      return '0901.12.00'; // Decaffeinated (single code in DB)
    }
  } else if (attributes.roasted === true) {
    if (attributes.decaffeinated === false) {
      return '0901.21.90'; // Other roasted, not decaf
    } else {
      return '0901.22.90'; // Other roasted, decaf
    }
  }

  return '0901.11.90'; // Ultimate fallback
}

/**
 * Build human-readable reasoning for coffee classification
 */
function buildCoffeeReasoning(attributes: ProductAttributes): string {
  const parts: string[] = [];

  if (attributes.variety) {
    parts.push(attributes.variety.charAt(0).toUpperCase() + attributes.variety.slice(1));
  }

  parts.push('coffee');

  if (attributes.roasted === false) {
    parts.push('not roasted (green beans)');
  } else if (attributes.roasted === true) {
    parts.push('roasted');
    if (attributes.form === 'ground') {
      parts.push('ground');
    } else {
      parts.push('in grain');
    }
  }

  if (attributes.decaffeinated === true) {
    parts.push('decaffeinated');
  } else if (attributes.decaffeinated === false) {
    parts.push('regular (with caffeine)');
  }

  if (attributes.grade) {
    parts.push(`Grade ${attributes.grade.toUpperCase()}`);
  }

  return parts.join(', ');
}

/**
 * Generate a question for a missing coffee attribute
 * PHASE 4.5: Enhanced with grade and varietyProcessing questions
 *
 * @deprecated PHASE 6.5.1-ROOT: This function uses HARDCODED options.
 * For database-driven options, use buildQuestionFromDistinguisher() with the result of
 * analyzeChildrenForDistinguishingAttribute(). This function is kept for:
 * - Binary questions (roasted, decaffeinated, roasted_form) that don't need database lookup
 * - Ultimate fallback when database queries fail
 *
 * The main classification flow in analyzeCoffeeCompleteness() now uses database-driven options.
 */
function generateCoffeeQuestion(missingAttribute: string): AttributeRequirement {
  // PHASE 6.5.1-ROOT: Log when this deprecated function is called for non-binary attributes
  if (!['roasted', 'decaffeinated', 'roasted_form'].includes(missingAttribute)) {
    logger.warn(`[PHASE 6.5.1-ROOT] DEPRECATED: generateCoffeeQuestion called for ${missingAttribute} - should use database-driven options`);
  }
  logger.info(`[PHASE 4.5] generateCoffeeQuestion called for: ${missingAttribute}`);

  switch (missingAttribute) {
    case 'roasted':
      return {
        attribute: 'roasted',
        required: true,
        questionText: 'Is the coffee roasted or not roasted (green)?',
        options: [
          { value: 'not_roasted', label: 'Not roasted (green coffee beans)' },
          { value: 'roasted', label: 'Roasted coffee' }
        ]
      };

    case 'decaffeinated':
      return {
        attribute: 'decaffeinated',
        required: true,
        questionText: 'Is the coffee decaffeinated?',
        options: [
          { value: 'not_decaf', label: 'Regular (not decaffeinated)' },
          { value: 'decaf', label: 'Decaffeinated' }
        ]
      };

    case 'variety':
      return {
        attribute: 'variety',
        required: true,
        questionText: 'What variety of coffee is this?',
        options: [
          { value: 'arabica', label: 'Arabica' },
          { value: 'robusta', label: 'Robusta' },
          { value: 'other', label: 'Other variety' }
        ]
      };

    case 'roasted_form':
      return {
        attribute: 'form',
        required: true,
        questionText: 'What form is the roasted coffee?',
        options: [
          { value: 'beans', label: 'Whole beans (in grain)' },
          { value: 'ground', label: 'Ground coffee' }
        ]
      };

    // PHASE 4.5: Add grade question
    case 'grade':
      return {
        attribute: 'grade',
        required: true,
        questionText: 'What grade is the coffee?',
        options: [
          { value: 'a', label: 'Grade A' },
          { value: 'b', label: 'Grade B' },
          { value: 'c', label: 'Grade C' },
          { value: 'ab', label: 'Grade AB' },
          { value: 'pb', label: 'Grade PB (Peaberry)' }
        ]
      };

    // PHASE 4.5: Add combined variety/processing question
    case 'varietyProcessing':
      return {
        attribute: 'variety',
        required: true,
        questionText: 'What type of coffee is this?',
        options: [
          { value: 'arabica_plantation', label: 'Arabica Plantation' },
          { value: 'arabica_cherry', label: 'Arabica Cherry' },
          { value: 'robusta_parchment', label: 'Robusta Parchment' },
          { value: 'robusta_cherry', label: 'Robusta Cherry' }
        ]
      };

    // PHASE 4.5: Add processing method question
    case 'processingMethod':
      return {
        attribute: 'processingMethod',
        required: true,
        questionText: 'How was the coffee processed?',
        options: [
          { value: 'plantation', label: 'Plantation' },
          { value: 'cherry', label: 'Cherry' },
          { value: 'parchment', label: 'Parchment' }
        ]
      };

    default:
      logger.warn(`[PHASE 4.5] No specific question for: ${missingAttribute}, using form fallback`);
      return {
        attribute: 'form',
        required: true,
        questionText: 'What form is your coffee product?',
        options: [
          { value: 'beans', label: 'Coffee beans (raw or roasted)' },
          { value: 'instant', label: 'Instant/soluble coffee' },
          { value: 'extract', label: 'Coffee extract/essence' }
        ]
      };
  }
}

/**
 * Analyze tea classification completeness
 */
function analyzeTeaCompleteness(attributes: ProductAttributes): CompletenessResult {
  const result: CompletenessResult = {
    isComplete: false,
    missingAttributes: [],
    confidence: 0,
    suggestedCode: null,
    attributes,
    nextQuestion: null,
    reasoning: ''
  };

  // Instant/Extract tea → Chapter 21
  if (attributes.form === 'instant' || attributes.form === 'extract') {
    result.isComplete = true;
    result.suggestedCode = '2101.20.00';  // Tea extracts
    result.confidence = 90;
    result.reasoning = 'Instant/extract tea → Chapter 21';
    return result;
  }

  // Tea leaves → Chapter 09 (0902)
  result.missingAttributes = [];

  if (attributes.variety === null) {
    result.missingAttributes.push('variety');
    result.nextQuestion = {
      attribute: 'variety',
      required: true,
      questionText: 'What type of tea is this?',
      options: [
        { value: 'green', label: 'Green tea' },
        { value: 'black', label: 'Black tea (fermented)' },
        { value: 'other', label: 'Other (oolong, white, etc.)' }
      ]
    };
    result.reasoning = 'Need tea variety to classify';
    return result;
  }

  // Has variety - can classify
  result.isComplete = true;
  if (attributes.variety === 'green') {
    result.suggestedCode = '0902.10.10';  // Green tea, packets <= 3kg
  } else if (attributes.variety === 'black') {
    result.suggestedCode = '0902.30.10';  // Black tea, packets <= 3kg
  } else {
    result.suggestedCode = '0902.10.90';  // Other tea
  }
  result.confidence = 85;
  result.reasoning = `${attributes.variety} tea leaves → ${result.suggestedCode}`;

  return result;
}

// ========================================
// Main Classification Function
// ========================================

/**
 * Main entry point for attribute-based classification
 *
 * @returns
 * - 'auto-classify': All attributes known, returns HS code directly
 * - 'question': Missing attribute, returns targeted question
 * - 'delegate': Product not suitable for attribute classification, delegate to LLM
 */
export async function classifyByAttributes(
  userInput: string
): Promise<AttributeClassificationResult> {
  logger.info(`[ATTR-CLASSIFIER] Processing: "${userInput.substring(0, 60)}..."`);

  // Step 1: Extract attributes from user input
  const attributes = extractAttributes(userInput);

  // Step 2: If no base product identified, delegate to LLM
  if (!attributes.baseProduct) {
    logger.info(`[ATTR-CLASSIFIER] No base product identified, delegating to LLM`);
    return {
      type: 'delegate',
      delegateReason: 'Product type not recognized for attribute-based classification'
    };
  }

  // Step 3: Analyze completeness (now async with database queries)
  const completeness = await analyzeCompleteness(attributes);

  // Step 4: If complete, auto-classify
  if (completeness.isComplete && completeness.suggestedCode) {
    logger.info(`[ATTR-CLASSIFIER] AUTO-CLASSIFY: ${completeness.suggestedCode}`);

    // Get the code description from database
    const codeInfo = await prisma.hsCode.findUnique({
      where: { code: completeness.suggestedCode },
      select: { code: true, description: true }
    });

    return {
      type: 'auto-classify',
      code: completeness.suggestedCode,
      description: codeInfo?.description || completeness.reasoning,
      confidence: completeness.confidence,
      reasoning: completeness.reasoning
    };
  }

  // Step 5: If we have a next question, return it
  if (completeness.nextQuestion) {
    logger.info(`[ATTR-CLASSIFIER] QUESTION: ${completeness.nextQuestion.questionText}`);

    return {
      type: 'question',
      question: {
        id: `attr_${completeness.nextQuestion.attribute}_${Date.now()}`,
        text: completeness.nextQuestion.questionText,
        options: completeness.nextQuestion.options.map((opt, idx) => ({
          code: opt.code || '',
          label: opt.label,
          description: opt.label
        })),
        attribute: completeness.nextQuestion.attribute
      }
    };
  }

  // Step 6: Fallback - delegate to LLM
  logger.info(`[ATTR-CLASSIFIER] Delegating to LLM: ${completeness.reasoning}`);
  return {
    type: 'delegate',
    delegateReason: completeness.reasoning || 'Could not determine classification path'
  };
}

/**
 * Process an answer to an attribute question
 */
export function processAttributeAnswer(
  currentAttributes: ProductAttributes,
  attribute: string,
  value: string
): ProductAttributes {
  const updated = { ...currentAttributes };

  switch (attribute) {
    case 'roasted':
      updated.roasted = value === 'roasted' || value === 'true';
      break;
    case 'decaffeinated':
      updated.decaffeinated = value === 'decaf' || value === 'decaffeinated' || value === 'true';
      break;
    case 'variety':
      updated.variety = value;
      break;
    case 'form':
      updated.form = value;
      break;
    case 'processingMethod':
      updated.processingMethod = value;
      break;
    case 'grade':
      updated.grade = value;
      break;
    case 'chapter':
      updated.chapter = value;
      break;
  }

  logger.info(`[ATTR-CLASSIFIER] Updated attributes: ${JSON.stringify(updated)}`);
  return updated;
}

// ========================================
// PHASE 3: Generate Attribute Question
// ========================================

/**
 * Generate a question for a specific missing attribute
 * Used when continuing from a previous attribute answer
 *
 * PHASE 6.5.1-ROOT NOTE: This function currently uses hardcoded options via generateCoffeeQuestion.
 * The main classification flow (analyzeCoffeeCompleteness) has been updated to use database-driven
 * options. This function should ideally be refactored to be async and query the database,
 * but that requires changes to the calling code in llm-conversational-classifier.service.ts.
 *
 * TODO: Refactor to use database-driven options (requires async conversion)
 */
export function generateAttributeQuestion(
  attributes: ProductAttributes,
  missingAttribute: string
): { text: string; options: Array<{ code: string; label: string; description: string }>; attribute: string } {

  // PHASE 6.5.1-ROOT: Log deprecation warning
  logger.info(`[PHASE 6.5.1-ROOT] generateAttributeQuestion called for ${missingAttribute} - uses hardcoded options (TODO: make async for database-driven)`);

  // Use the existing generateCoffeeQuestion logic for coffee-related attributes
  // NOTE: This still uses hardcoded options - see TODO above
  if (attributes.baseProduct === 'coffee') {
    const requirement = generateCoffeeQuestion(missingAttribute);
    return {
      text: requirement.questionText,
      options: requirement.options.map((opt) => ({
        code: opt.code || '',
        label: opt.label,
        description: opt.label
      })),
      attribute: missingAttribute
    };
  }

  // Fallback for other products
  const fallbackQuestions: Record<string, { text: string; options: Array<{ code: string; label: string; description: string }> }> = {
    decaffeinated: {
      text: 'Is the product decaffeinated?',
      options: [
        { code: '', label: 'Regular (not decaffeinated)', description: 'Contains caffeine' },
        { code: '', label: 'Decaffeinated', description: 'Caffeine removed' }
      ]
    },
    roasted: {
      text: 'Is the product roasted?',
      options: [
        { code: '', label: 'Not roasted (green/raw)', description: 'Unprocessed' },
        { code: '', label: 'Roasted', description: 'Heat processed' }
      ]
    },
    variety: {
      text: 'What variety is this?',
      options: [
        { code: '', label: 'Arabica', description: 'Arabica variety' },
        { code: '', label: 'Robusta', description: 'Robusta variety' },
        { code: '', label: 'Other', description: 'Other variety' }
      ]
    },
    grade: {
      text: 'What grade is this product?',
      options: [
        { code: '', label: 'Grade A', description: 'Highest quality' },
        { code: '', label: 'Grade B', description: 'Standard quality' },
        { code: '', label: 'Grade C', description: 'Economy grade' },
        { code: '', label: 'Other grade', description: 'Other classification' }
      ]
    },
    form: {
      text: 'What form is the product in?',
      options: [
        { code: '', label: 'Whole beans', description: 'Unground' },
        { code: '', label: 'Ground', description: 'Processed into powder' },
        { code: '', label: 'Instant/Soluble', description: 'Dissolves in water' }
      ]
    }
  };

  const fallback = fallbackQuestions[missingAttribute];
  if (fallback) {
    return { ...fallback, attribute: missingAttribute };
  }

  return {
    text: `Please specify the ${missingAttribute}`,
    options: [
      { code: '', label: 'Yes', description: 'Affirmative' },
      { code: '', label: 'No', description: 'Negative' }
    ],
    attribute: missingAttribute
  };
}

/**
 * PHASE 3: Enhanced processAttributeAnswer that handles option_X format
 * Parses the answer label and updates attributes accordingly
 */
export function processAttributeAnswerFromLabel(
  currentAttributes: ProductAttributes,
  attributeKey: string,
  answerLabel: string
): ProductAttributes {
  const updated = { ...currentAttributes };
  const labelLower = answerLabel.toLowerCase();

  logger.info(`[PHASE 3] Processing answer for '${attributeKey}': "${answerLabel}"`);

  switch (attributeKey) {
    case 'decaffeinated':
      // "Regular (not decaffeinated)" → false, "Decaffeinated" → true
      updated.decaffeinated = !labelLower.includes('not') &&
                              !labelLower.includes('regular') &&
                              labelLower.includes('decaf');
      break;

    case 'roasted':
      // "Not roasted (green coffee beans)" → false, "Roasted coffee" → true
      updated.roasted = !labelLower.includes('not') &&
                        !labelLower.includes('green') &&
                        labelLower.includes('roast');
      break;

    case 'variety':
      if (labelLower.includes('arabica')) {
        updated.variety = 'arabica';
      } else if (labelLower.includes('robusta') || labelLower.includes('rob')) {
        updated.variety = 'robusta';
      } else {
        updated.variety = 'other';
      }
      break;

    case 'grade':
      if (labelLower.includes('grade a') || labelLower === 'a') {
        updated.grade = 'a';
      } else if (labelLower.includes('grade b') || labelLower === 'b') {
        updated.grade = 'b';
      } else if (labelLower.includes('grade c') || labelLower === 'c') {
        updated.grade = 'c';
      } else if (labelLower.includes('ab')) {
        updated.grade = 'ab';
      } else if (labelLower.includes('pb') || labelLower.includes('peaberry')) {
        updated.grade = 'pb';
      }
      break;

    case 'form':
    case 'roasted_form':
      if (labelLower.includes('bean') || labelLower.includes('grain')) {
        updated.form = 'beans';
      } else if (labelLower.includes('ground')) {
        updated.form = 'ground';
      } else if (labelLower.includes('instant') || labelLower.includes('soluble')) {
        updated.form = 'instant';
      } else if (labelLower.includes('extract') || labelLower.includes('essence')) {
        updated.form = 'extract';
      }
      break;

    case 'processingMethod':
      if (labelLower.includes('plantation')) {
        updated.processingMethod = 'plantation';
      } else if (labelLower.includes('cherry')) {
        updated.processingMethod = 'cherry';
      } else if (labelLower.includes('parchment')) {
        updated.processingMethod = 'parchment';
      }
      break;
  }

  logger.info(`[PHASE 3] Updated attributes: ${JSON.stringify(updated)}`);
  return updated;
}

// ========================================
// Exports
// ========================================

export {
  COFFEE_REQUIRED_ATTRIBUTES,
  findCoffeeCodeFromDatabase,
  scoreCoffeeCandidate,
  // PHASE 5.1: Export helper functions for early single-match detection
  determineCurrentCode,
  getChildrenFromDatabase,
  filterCodesByAllAttributes
  // generateAttributeQuestion and processAttributeAnswerFromLabel are already exported inline
};

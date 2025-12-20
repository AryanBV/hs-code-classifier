/**
 * Question Tracker Service
 *
 * Tracks which critical dimensions have been covered during a classification conversation.
 * Ensures mandatory questions are NEVER skipped, regardless of LLM confidence.
 *
 * KEY RESPONSIBILITIES:
 * 1. Initialize coverage tracking for new conversations
 * 2. Check if dimensions are already covered in the description
 * 3. Update coverage from user answers
 * 4. Validate coverage before allowing classification
 * 5. Generate fallback questions for uncovered dimensions
 */

import { logger } from '../utils/logger';
import {
  CRITICAL_DIMENSIONS,
  CriticalDimension,
  QuestionCoverage,
  DimensionCoverage,
  DimensionStatus,
  getRelevantDimensions,
  isDimensionCoveredInDescription,
  extractChaptersFromCodes,
  getUncoveredMandatory,
  shouldBlockClassification,
} from '../types/critical-dimensions.types';
import type { ClarifyingQuestion } from '../types/conversation.types';

// ========================================
// Coverage Initialization
// ========================================

/**
 * Initialize coverage tracking for a new conversation
 *
 * @param conversationId - Unique conversation ID
 * @param productDescription - Original product description
 * @param candidateCodes - Top candidate HS codes from search
 * @returns Initial coverage state
 */
export function initializeCoverage(
  conversationId: string,
  productDescription: string,
  candidateCodes: string[]
): QuestionCoverage {
  // Extract chapters from candidate codes
  const chapters = extractChaptersFromCodes(candidateCodes);
  logger.debug(`Detected chapters for coverage: ${chapters.join(', ')}`);

  // Get relevant dimensions for this product
  const relevantDimensions = getRelevantDimensions(productDescription, chapters);
  logger.debug(`Relevant dimensions: ${relevantDimensions.map(d => d.name).join(', ')}`);

  // Initialize coverage for each dimension
  const dimensions: DimensionCoverage[] = relevantDimensions.map(dim => {
    // Check if already covered in description
    const isCoveredInDesc = isDimensionCoveredInDescription(dim, productDescription);

    return {
      dimension: dim.name,
      status: isCoveredInDesc ? 'covered_implicit' : 'uncovered',
      coveredBy: isCoveredInDesc ? 'inferred_from_description' : undefined,
      value: undefined, // Will be extracted if covered
      isMandatory: dim.mandatory,
    };
  });

  // Count mandatory dimensions
  const mandatoryDimensions = dimensions.filter(d => d.isMandatory);
  const coveredMandatory = mandatoryDimensions.filter(
    d => d.status === 'covered_implicit' || d.status === 'covered_explicit'
  ).length;

  const coverage: QuestionCoverage = {
    conversationId,
    productDescription,
    detectedChapter: chapters.length > 0 ? chapters[0] : undefined,
    dimensions,
    totalMandatory: mandatoryDimensions.length,
    coveredMandatory,
    isComplete: coveredMandatory >= mandatoryDimensions.length,
    lastUpdated: new Date().toISOString(),
  };

  logger.info(
    `Coverage initialized: ${coveredMandatory}/${mandatoryDimensions.length} mandatory covered. ` +
    `Uncovered: ${getUncoveredMandatory(coverage).map(d => d.dimension).join(', ') || 'none'}`
  );

  return coverage;
}

// ========================================
// Coverage Updates
// ========================================

/**
 * Update coverage when user provides answers
 *
 * @param coverage - Current coverage state
 * @param answers - User's answers (questionId -> answer)
 * @param questions - Questions that were asked
 * @returns Updated coverage state
 */
export function updateCoverageFromAnswers(
  coverage: QuestionCoverage,
  answers: Record<string, string>,
  questions: ClarifyingQuestion[]
): QuestionCoverage {
  const updatedDimensions = [...coverage.dimensions];

  // Map question IDs to dimensions they cover
  // Questions from hierarchy service have IDs like "q_090111_species_0"
  // Questions from fallback have IDs like "fallback_material"
  for (const [questionId, answer] of Object.entries(answers)) {
    // Find which dimension this question covers
    for (let i = 0; i < updatedDimensions.length; i++) {
      const dim = updatedDimensions[i]!;
      const dimNameLower = dim.dimension.toLowerCase().replace(/[_\s]/g, '');

      // Check if question ID contains dimension name
      const questionIdLower = questionId.toLowerCase().replace(/[_\s]/g, '');
      if (questionIdLower.includes(dimNameLower)) {
        updatedDimensions[i] = {
          ...dim,
          status: answer.startsWith('other:') ? 'skipped' : 'covered_explicit',
          coveredBy: questionId,
          value: answer.replace('other:', '').trim(),
        };
        logger.debug(`Dimension ${dim.dimension} covered by answer: ${answer}`);
        break;
      }
    }

    // Also check by question text content for fallback questions
    const question = questions.find(q => q.id === questionId);
    if (question) {
      for (let i = 0; i < updatedDimensions.length; i++) {
        const dim = updatedDimensions[i]!;
        if (updatedDimensions[i]!.status === 'uncovered') {
          // Check if question text relates to this dimension
          const dimDef = CRITICAL_DIMENSIONS.find(d => d.name === dim.dimension);
          if (dimDef && question.text.toLowerCase().includes(dimDef.displayName.toLowerCase())) {
            updatedDimensions[i] = {
              ...dim,
              status: answer.startsWith('other:') ? 'skipped' : 'covered_explicit',
              coveredBy: questionId,
              value: answer.replace('other:', '').trim(),
            };
            break;
          }
        }
      }
    }
  }

  // Also check if answers themselves cover any dimensions
  const allAnswers = Object.values(answers).join(' ').toLowerCase();
  for (let i = 0; i < updatedDimensions.length; i++) {
    const dim = updatedDimensions[i]!;
    if (dim.status === 'uncovered') {
      const dimDef = CRITICAL_DIMENSIONS.find(d => d.name === dim.dimension);
      if (dimDef && isDimensionCoveredInDescription(dimDef, allAnswers)) {
        updatedDimensions[i] = {
          ...dim,
          status: 'covered_implicit',
          coveredBy: 'inferred_from_answers',
        };
        logger.debug(`Dimension ${dim.dimension} inferred from answers`);
      }
    }
  }

  // Recalculate completeness
  const mandatoryDimensions = updatedDimensions.filter(d => d.isMandatory);
  const coveredMandatory = mandatoryDimensions.filter(
    d => d.status === 'covered_implicit' || d.status === 'covered_explicit'
  ).length;

  return {
    ...coverage,
    dimensions: updatedDimensions,
    coveredMandatory,
    isComplete: coveredMandatory >= coverage.totalMandatory,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update coverage from hierarchy-derived questions
 * Call this AFTER hierarchy context generates questions
 *
 * @param coverage - Current coverage state
 * @param hierarchyDimensions - Dimensions detected in hierarchy analysis
 */
export function updateCoverageFromHierarchy(
  coverage: QuestionCoverage,
  hierarchyDimensions: Array<{ name: string; values: string[] }>
): QuestionCoverage {
  const updatedDimensions = [...coverage.dimensions];

  // Mark dimensions that will be covered by hierarchy questions
  for (const hierDim of hierarchyDimensions) {
    // Try to match hierarchy dimension to our critical dimensions
    const dimName = mapHierarchyDimensionName(hierDim.name);

    for (let i = 0; i < updatedDimensions.length; i++) {
      const dim = updatedDimensions[i]!;
      if (dim.dimension === dimName && dim.status === 'uncovered') {
        // Mark as "will be covered by hierarchy question"
        // We don't change status yet - it will be changed when user answers
        logger.debug(`Hierarchy will cover dimension: ${dim.dimension}`);
      }
    }
  }

  return {
    ...coverage,
    dimensions: updatedDimensions,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Map hierarchy dimension names to our standard names
 */
function mapHierarchyDimensionName(hierName: string): string {
  const mapping: Record<string, string> = {
    'Species': 'species_variety',
    'Coffee Species': 'species_variety',
    'Tea Type': 'species_variety',
    'Variety': 'species_variety',
    'Processing': 'processing_level',
    'Processing Method': 'processing_level',
    'Form': 'form_state',
    'State': 'form_state',
    'Roasting': 'processing_level',
    'Caffeine': 'caffeine_content',
    'Grade': 'quality_grade',
    'Quality': 'quality_grade',
    'Material': 'material',
    'Packaging': 'packaging_type',
    'Size': 'weight_capacity',
    'Purpose': 'end_use',
    'Target': 'target_user',
    'Target User': 'target_user',
    'Type': 'product_type',
  };

  return mapping[hierName] || hierName.toLowerCase().replace(/\s+/g, '_');
}

// ========================================
// Coverage Validation
// ========================================

/**
 * Validate coverage before allowing classification
 *
 * @param coverage - Current coverage state
 * @param forceClassify - Whether max rounds reached (force classification)
 * @returns Validation result
 */
export function validateCoverage(
  coverage: QuestionCoverage,
  forceClassify: boolean = false
): {
  isValid: boolean;
  missingMandatory: string[];
  warning?: string;
} {
  const blockCheck = shouldBlockClassification(coverage);

  if (forceClassify) {
    // Even if forced, log what we're missing
    if (blockCheck.blocked) {
      logger.warn(
        `FORCED CLASSIFICATION with missing mandatory dimensions: ${blockCheck.missingDimensions.join(', ')}`
      );
    }
    return {
      isValid: true,
      missingMandatory: blockCheck.missingDimensions,
      warning: blockCheck.blocked
        ? `Classification forced despite missing: ${blockCheck.missingDimensions.join(', ')}`
        : undefined,
    };
  }

  if (blockCheck.blocked) {
    logger.info(`Classification blocked - missing: ${blockCheck.missingDimensions.join(', ')}`);
  }

  return {
    isValid: !blockCheck.blocked,
    missingMandatory: blockCheck.missingDimensions,
  };
}

// ========================================
// Fallback Question Generation
// ========================================

/**
 * Generate fallback questions for uncovered mandatory dimensions
 * Use this when hierarchy questions don't cover all mandatory dimensions
 *
 * @param coverage - Current coverage state
 * @param maxQuestions - Maximum questions to generate
 * @returns Array of fallback questions
 */
export function generateFallbackQuestions(
  coverage: QuestionCoverage,
  maxQuestions: number = 2
): ClarifyingQuestion[] {
  const uncovered = getUncoveredMandatory(coverage);
  const questions: ClarifyingQuestion[] = [];

  for (let i = 0; i < uncovered.length && i < maxQuestions; i++) {
    const dim = uncovered[i]!;
    const dimDef = CRITICAL_DIMENSIONS.find(d => d.name === dim.dimension);

    if (!dimDef) continue;

    // Generate options based on the dimension
    const options = generateOptionsForDimension(dimDef, coverage.productDescription);

    questions.push({
      id: `fallback_${dim.dimension}`,
      text: dimDef.questionTemplate,
      options,
      allowOther: true,
      priority: 'required',
    });

    logger.debug(`Generated fallback question for: ${dim.dimension}`);
  }

  return questions;
}

/**
 * Generate appropriate options for a dimension based on context
 */
function generateOptionsForDimension(
  dimension: CriticalDimension,
  productDescription: string
): string[] {
  const descLower = productDescription.toLowerCase();

  // Context-aware option generation
  switch (dimension.name) {
    case 'material':
      if (descLower.match(/shirt|dress|pants|fabric|textile|cloth/)) {
        return ['Cotton', 'Polyester', 'Silk', 'Wool', 'Synthetic blend'];
      }
      if (descLower.match(/bag|wallet|belt/)) {
        return ['Leather', 'Synthetic leather', 'Fabric', 'Plastic'];
      }
      if (descLower.match(/shoe|boot|sandal/)) {
        return ['Leather', 'Rubber', 'Textile', 'Synthetic'];
      }
      return ['Natural material', 'Synthetic material', 'Mixed/blended'];

    case 'species_variety':
      if (descLower.includes('coffee')) {
        return ['Arabica', 'Robusta', 'Liberica', 'Blend'];
      }
      if (descLower.includes('tea')) {
        return ['Green tea', 'Black tea', 'Oolong', 'White tea', 'Herbal tea'];
      }
      if (descLower.includes('rice')) {
        return ['Basmati', 'Non-basmati long grain', 'Short grain', 'Jasmine'];
      }
      return ['Primary variety', 'Secondary variety', 'Mixed/blend'];

    case 'form_state':
      if (descLower.match(/fruit|vegetable|meat|fish|seafood/)) {
        return ['Fresh', 'Frozen', 'Dried', 'Preserved/canned', 'Processed'];
      }
      if (descLower.match(/coffee|tea|spice/)) {
        return ['Whole', 'Ground/powdered', 'Extract/concentrate', 'Instant'];
      }
      return ['Raw/unprocessed', 'Processed', 'Prepared/ready-to-use'];

    case 'processing_level':
      if (descLower.includes('coffee')) {
        return ['Roasted', 'Unroasted (green)', 'Instant/soluble'];
      }
      if (descLower.match(/oil|fat/)) {
        return ['Crude/unrefined', 'Refined', 'Virgin/extra virgin'];
      }
      return ['Unprocessed/raw', 'Partially processed', 'Fully processed'];

    case 'end_use':
      if (descLower.match(/pump|motor|valve|machine/)) {
        return ['Industrial', 'Agricultural', 'Automotive', 'Domestic/household', 'Medical'];
      }
      if (descLower.match(/chemical|compound|substance/)) {
        return ['Industrial', 'Pharmaceutical/medical', 'Cosmetic', 'Food/beverage'];
      }
      return ['Consumer/retail', 'Industrial/commercial', 'Specialized/professional'];

    case 'product_type':
      if (descLower.includes('pump')) {
        return ['Water pump', 'Fuel pump', 'Oil pump', 'Hydraulic pump', 'Vacuum pump'];
      }
      if (descLower.includes('motor')) {
        return ['Electric motor', 'Combustion engine', 'Servo/stepper motor'];
      }
      return ['Standard type', 'Specialized type', 'Custom/other'];

    case 'packaging_type':
      return ['Bulk packaging (commercial)', 'Retail packaging (consumer)', 'Not specified'];

    case 'target_user':
      return ["Men's", "Women's", "Children's", 'Unisex/all'];

    case 'quality_grade':
      return ['Premium/Grade A', 'Standard/Grade B', 'Economy/Grade C'];

    case 'caffeine_content':
      return ['Regular (with caffeine)', 'Decaffeinated'];

    default:
      return ['Option 1', 'Option 2', 'Option 3'];
  }
}

// ========================================
// Question Merging & Prioritization
// ========================================

/**
 * Merge hierarchy questions with fallback questions
 * Prioritizes hierarchy questions but adds fallback for uncovered dimensions
 *
 * @param hierarchyQuestions - Questions from hierarchy analysis
 * @param coverage - Current coverage state
 * @param maxTotal - Maximum total questions
 * @returns Merged and prioritized questions
 */
export function mergeQuestions(
  hierarchyQuestions: ClarifyingQuestion[],
  coverage: QuestionCoverage,
  maxTotal: number = 3
): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];

  // First, add hierarchy questions (they're more specific)
  for (const hq of hierarchyQuestions) {
    if (questions.length >= maxTotal) break;
    questions.push(hq);
  }

  // Check which dimensions are covered by hierarchy questions
  const coveredByHierarchy = new Set<string>();
  for (const hq of hierarchyQuestions) {
    // Extract dimension from question ID or content
    const dimName = extractDimensionFromQuestion(hq);
    if (dimName) {
      coveredByHierarchy.add(dimName);
    }
  }

  // Generate fallback questions for remaining uncovered dimensions
  if (questions.length < maxTotal) {
    // Update coverage to reflect hierarchy questions
    const updatedCoverage = { ...coverage };

    // Get fallback questions for dimensions not covered by hierarchy
    const fallbackQ = generateFallbackQuestions(updatedCoverage, maxTotal - questions.length);

    // Only add fallback questions for dimensions not covered by hierarchy
    for (const fq of fallbackQ) {
      const dimName = fq.id.replace('fallback_', '');
      if (!coveredByHierarchy.has(dimName) && questions.length < maxTotal) {
        questions.push(fq);
      }
    }
  }

  return questions;
}

/**
 * Extract dimension name from a question
 */
function extractDimensionFromQuestion(question: ClarifyingQuestion): string | null {
  const idLower = question.id.toLowerCase();
  const textLower = question.text.toLowerCase();

  // Check for common dimension indicators
  const patterns: Array<{ regex: RegExp; dimension: string }> = [
    { regex: /species|variety/, dimension: 'species_variety' },
    { regex: /material|made of|composition/, dimension: 'material' },
    { regex: /form|state|fresh|frozen/, dimension: 'form_state' },
    { regex: /process|roast/, dimension: 'processing_level' },
    { regex: /grade|quality/, dimension: 'quality_grade' },
    { regex: /use|purpose/, dimension: 'end_use' },
    { regex: /packag|bulk|retail/, dimension: 'packaging_type' },
    { regex: /type|kind/, dimension: 'product_type' },
    { regex: /caffeine|decaf/, dimension: 'caffeine_content' },
    { regex: /target|user|men|women|child/, dimension: 'target_user' },
  ];

  for (const { regex, dimension } of patterns) {
    if (regex.test(idLower) || regex.test(textLower)) {
      return dimension;
    }
  }

  return null;
}

// ========================================
// Coverage Logging (for debugging)
// ========================================

/**
 * Log current coverage state for debugging
 */
export function logCoverageState(coverage: QuestionCoverage, prefix: string = ''): void {
  logger.debug(`${prefix}Coverage state for conversation ${coverage.conversationId}:`);
  logger.debug(`  Product: "${coverage.productDescription.substring(0, 50)}..."`);
  logger.debug(`  Chapter: ${coverage.detectedChapter || 'unknown'}`);
  logger.debug(`  Mandatory: ${coverage.coveredMandatory}/${coverage.totalMandatory}`);
  logger.debug(`  Complete: ${coverage.isComplete}`);

  for (const dim of coverage.dimensions) {
    const mandatory = dim.isMandatory ? '[M]' : '[ ]';
    logger.debug(`    ${mandatory} ${dim.dimension}: ${dim.status} ${dim.value ? `(${dim.value})` : ''}`);
  }
}

// ========================================
// Exports
// ========================================

export default {
  initializeCoverage,
  updateCoverageFromAnswers,
  updateCoverageFromHierarchy,
  validateCoverage,
  generateFallbackQuestions,
  mergeQuestions,
  logCoverageState,
};

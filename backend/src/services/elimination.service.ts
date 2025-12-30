/**
 * Elimination Service
 *
 * Implements eliminative reasoning for HS code classification.
 * Each piece of user information eliminates irrelevant codes.
 *
 * Example: "Arabica coffee beans" should:
 * - INCLUDE: All Arabica codes
 * - EXCLUDE: All Robusta codes
 * - ASK: Only about Arabica-specific details (grade, roasted/raw)
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// ========================================
// Types
// ========================================

export interface EliminationResult {
  shouldInclude: boolean;
  reason: string;
  matchedRule?: string;
}

export interface FilterResult {
  filteredCodes: any[];
  eliminatedCount: number;
  appliedRules: string[];
}

interface VarietyRule {
  include: string[];
  exclude: string[];
  description: string;
}

interface ProcessingStateRule {
  mustBeInChapter?: string;
  exclude: string[];
  description: string;
}

interface MaterialRule {
  forceChapter: string;
  excludeChapters: string[];
  description: string;
}

interface FormRule {
  include: string[];
  exclude: string[];
  description: string;
}

interface DecaffeinationRule {
  include: string[];
  exclude: string[];
  description: string;
}

interface FlavoringRule {
  include: string[];
  exclude: string[];
  description: string;
}

interface EliminationRules {
  metadata: {
    version: string;
    description: string;
  };
  varietyExclusions: Record<string, Record<string, VarietyRule>>;
  processingStateExclusions: Record<string, Record<string, ProcessingStateRule>>;
  gradeExclusions: Record<string, Record<string, VarietyRule>>;
  materialExclusions: Record<string, MaterialRule>;
  formExclusions: Record<string, FormRule>;
  decaffeinationExclusions: Record<string, DecaffeinationRule>;
  flavoringExclusions: Record<string, FlavoringRule>;
}

// ========================================
// Rules Loading
// ========================================

let eliminationRules: EliminationRules | null = null;

function loadEliminationRules(): void {
  if (eliminationRules) return;

  try {
    const rulesPath = path.join(__dirname, '../data/elimination-rules.json');
    const rawData = fs.readFileSync(rulesPath, 'utf-8');
    eliminationRules = JSON.parse(rawData);
    logger.info(`[ELIMINATION] Loaded elimination rules v${eliminationRules?.metadata?.version}`);
  } catch (error) {
    logger.error(`[ELIMINATION] Failed to load elimination rules: ${error}`);
    // Initialize with empty rules to prevent crashes
    eliminationRules = {
      metadata: { version: '0.0.0', description: 'Fallback empty rules' },
      varietyExclusions: {},
      processingStateExclusions: {},
      gradeExclusions: {},
      materialExclusions: {},
      formExclusions: {},
      decaffeinationExclusions: {},
      flavoringExclusions: {}
    };
  }
}

// ========================================
// Modifier Extraction
// ========================================

/**
 * Extract all modifiers from parsed query
 */
export function extractAllModifiers(parsedQuery: {
  productTypeModifiers?: string[];
  materialModifiers?: string[];
  modifiers?: string[];
}): string[] {
  const modifiers: string[] = [];

  if (parsedQuery.productTypeModifiers) {
    modifiers.push(...parsedQuery.productTypeModifiers.map(m => m.toLowerCase()));
  }

  if (parsedQuery.materialModifiers) {
    modifiers.push(...parsedQuery.materialModifiers.map(m => m.toLowerCase()));
  }

  if (parsedQuery.modifiers) {
    modifiers.push(...parsedQuery.modifiers.map(m => m.toLowerCase()));
  }

  return [...new Set(modifiers)]; // Deduplicate
}

/**
 * Extract modifiers from original query string
 * Used when we only have the raw query, not parsed query
 */
export function extractModifiersFromText(text: string): string[] {
  loadEliminationRules();
  const lowerText = text.toLowerCase();
  const modifiers: string[] = [];

  // Check variety exclusions
  for (const varieties of Object.values(eliminationRules!.varietyExclusions)) {
    for (const [variety, rules] of Object.entries(varieties)) {
      if (rules.include.some(inc => lowerText.includes(inc.toLowerCase()))) {
        modifiers.push(variety);
      }
    }
  }

  // Check processing state exclusions
  for (const states of Object.values(eliminationRules!.processingStateExclusions)) {
    for (const state of Object.keys(states)) {
      if (lowerText.includes(state.toLowerCase())) {
        modifiers.push(state);
      }
    }
  }

  // Check grade exclusions
  for (const grades of Object.values(eliminationRules!.gradeExclusions)) {
    for (const [grade, rules] of Object.entries(grades)) {
      if (rules.include.some(inc => lowerText.includes(inc.toLowerCase()))) {
        modifiers.push(grade);
      }
    }
  }

  // Check form exclusions
  for (const [form, rules] of Object.entries(eliminationRules!.formExclusions)) {
    if (rules.include.some(inc => lowerText.includes(inc.toLowerCase()))) {
      modifiers.push(form);
    }
  }

  // Check decaffeination
  for (const [decaf, rules] of Object.entries(eliminationRules!.decaffeinationExclusions)) {
    if (rules.include.some(inc => lowerText.includes(inc.toLowerCase()))) {
      modifiers.push(decaf);
    }
  }

  // Check flavoring
  for (const [flavor, rules] of Object.entries(eliminationRules!.flavoringExclusions)) {
    if (rules.include.some(inc => lowerText.includes(inc.toLowerCase()))) {
      modifiers.push(flavor);
    }
  }

  return [...new Set(modifiers)];
}

/**
 * Extract modifiers from user's answer to a question
 */
export function extractModifiersFromAnswer(answer: { code: string; description: string }): string[] {
  const modifiers: string[] = [];
  const lowerDesc = answer.description.toLowerCase();

  // Extract variety
  if (lowerDesc.includes('arabica')) modifiers.push('arabica');
  if (lowerDesc.includes('robusta')) modifiers.push('robusta');
  if (lowerDesc.includes('liberica')) modifiers.push('liberica');

  // Extract processing state
  if (lowerDesc.includes('roasted') && !lowerDesc.includes('not roasted') && !lowerDesc.includes('unroasted')) {
    modifiers.push('roasted');
  }
  if (lowerDesc.includes('not roasted') || lowerDesc.includes('unroasted')) {
    modifiers.push('raw');
    modifiers.push('unroasted');
  }
  if (lowerDesc.includes('decaffeinated')) modifiers.push('decaffeinated');
  if (lowerDesc.includes('instant')) modifiers.push('instant');
  if (lowerDesc.includes('soluble')) modifiers.push('soluble');
  if (lowerDesc.includes('extract')) modifiers.push('extract');

  // Extract grade
  if (lowerDesc.includes('grade a') || lowerDesc.includes('a grade') || lowerDesc.includes('plantation a')) {
    modifiers.push('grade a');
  }
  if (lowerDesc.includes('grade b') || lowerDesc.includes('b grade') || lowerDesc.includes('plantation b')) {
    modifiers.push('grade b');
  }
  if (lowerDesc.includes('grade c') || lowerDesc.includes('c grade') || lowerDesc.includes('plantation c')) {
    modifiers.push('grade c');
  }

  // Extract form
  if (lowerDesc.includes('beans') || lowerDesc.includes('whole bean')) {
    modifiers.push('beans');
  }
  if (lowerDesc.includes('ground')) modifiers.push('ground');
  if (lowerDesc.includes('powder')) modifiers.push('powder');
  if (lowerDesc.includes('leaves') || lowerDesc.includes('leaf')) modifiers.push('leaves');

  // Extract tea types
  if (lowerDesc.includes('green tea') || (lowerDesc.includes('green') && lowerDesc.includes('tea'))) {
    modifiers.push('green tea');
  }
  if (lowerDesc.includes('black tea') || (lowerDesc.includes('black') && lowerDesc.includes('tea'))) {
    modifiers.push('black tea');
  }

  return [...new Set(modifiers)];
}

// ========================================
// Exclusion Checks
// ========================================

/**
 * Check if a code should be eliminated based on variety exclusions
 */
function checkVarietyExclusion(
  codeDescription: string,
  modifiers: string[]
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();

  for (const [product, varieties] of Object.entries(eliminationRules!.varietyExclusions)) {
    for (const [variety, rules] of Object.entries(varieties)) {
      // Check if user specified this variety
      const userSpecifiedVariety = modifiers.some(m =>
        rules.include.some(inc => m.includes(inc.toLowerCase()))
      );

      if (userSpecifiedVariety) {
        // Check if code description contains excluded varieties
        for (const excluded of rules.exclude) {
          if (lowerDesc.includes(excluded.toLowerCase())) {
            // But make sure it doesn't ALSO contain the included variety
            const hasIncluded = rules.include.some(inc =>
              lowerDesc.includes(inc.toLowerCase())
            );

            if (!hasIncluded) {
              return {
                shouldInclude: false,
                reason: `Excluded: User specified "${variety}", code contains "${excluded}"`,
                matchedRule: `varietyExclusion:${product}:${variety}`
              };
            }
          }
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No variety exclusion applies' };
}

/**
 * Check if a code should be eliminated based on processing state
 *
 * KEY INSIGHT (ROOT CAUSE FIX):
 * If a rule specifies `mustBeInChapter` and the code IS in that chapter,
 * we should KEEP the code - the chapter match takes precedence over
 * description-based exclusions.
 *
 * The description exclusions are meant to filter out codes from WRONG chapters
 * (e.g., filter Ch.09 raw coffee codes when user wants instant coffee).
 * They should NOT eliminate correct-chapter codes due to incidental word matches
 * (e.g., 2101 saying "ROASTED CHICORY" should not be excluded by "roasted").
 *
 * Logic flow:
 * 1. If mustBeInChapter specified and code is NOT in that chapter → EXCLUDE
 * 2. If mustBeInChapter specified and code IS in that chapter → KEEP (skip desc check)
 * 3. If no mustBeInChapter → apply description exclusions
 */
function checkProcessingStateExclusion(
  code: string,
  codeDescription: string,
  modifiers: string[]
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();
  const codeChapter = code.substring(0, 2);

  for (const [product, states] of Object.entries(eliminationRules!.processingStateExclusions)) {
    for (const [state, rules] of Object.entries(states)) {
      // Check if user specified this processing state
      if (modifiers.includes(state.toLowerCase())) {
        // Check chapter constraint
        if (rules.mustBeInChapter) {
          if (codeChapter !== rules.mustBeInChapter) {
            // Code is NOT in the required chapter - EXCLUDE
            return {
              shouldInclude: false,
              reason: `Excluded: "${state}" must be in Ch.${rules.mustBeInChapter}, code is in Ch.${codeChapter}`,
              matchedRule: `processingState:${product}:${state}:chapter`
            };
          } else {
            // ROOT CAUSE FIX: Code IS in the correct chapter - KEEP IT
            // Skip description-based exclusions because mustBeInChapter takes precedence
            // This prevents false positives like excluding 2101 (Ch.21) for "instant coffee"
            // just because the description mentions "roasted chicory"
            logger.debug(`[ELIMINATION] KEEPING ${code} - in correct chapter ${rules.mustBeInChapter} for "${state}"`);
            return {
              shouldInclude: true,
              reason: `Included: Code is in correct chapter ${rules.mustBeInChapter} for "${state}"`
            };
          }
        }

        // No mustBeInChapter specified - apply description exclusions
        for (const excluded of rules.exclude) {
          if (lowerDesc.includes(excluded.toLowerCase())) {
            return {
              shouldInclude: false,
              reason: `Excluded: User specified "${state}", code description contains "${excluded}"`,
              matchedRule: `processingState:${product}:${state}:description`
            };
          }
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No processing state exclusion applies' };
}

/**
 * Check if a code should be eliminated based on grade
 */
function checkGradeExclusion(
  codeDescription: string,
  modifiers: string[],
  originalQuery: string
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();
  const lowerQuery = originalQuery.toLowerCase();

  for (const [product, grades] of Object.entries(eliminationRules!.gradeExclusions)) {
    for (const [grade, rules] of Object.entries(grades)) {
      // Check if user specified this grade (in modifiers or original query)
      const userSpecifiedGrade =
        modifiers.some(m => rules.include.some(inc => m.includes(inc.toLowerCase()))) ||
        rules.include.some(inc => lowerQuery.includes(inc.toLowerCase()));

      if (userSpecifiedGrade) {
        // Check if code description contains excluded grades
        for (const excluded of rules.exclude) {
          if (lowerDesc.includes(excluded.toLowerCase())) {
            return {
              shouldInclude: false,
              reason: `Excluded: User specified "${grade}", code contains "${excluded}"`,
              matchedRule: `gradeExclusion:${product}:${grade}`
            };
          }
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No grade exclusion applies' };
}

/**
 * Check if a code should be eliminated based on form
 */
function checkFormExclusion(
  codeDescription: string,
  modifiers: string[]
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();

  for (const [form, rules] of Object.entries(eliminationRules!.formExclusions)) {
    // Check if user specified this form
    const userSpecifiedForm = modifiers.some(m =>
      rules.include.some(inc => m.includes(inc.toLowerCase()))
    );

    if (userSpecifiedForm) {
      // Check if code description contains excluded forms
      for (const excluded of rules.exclude) {
        if (lowerDesc.includes(excluded.toLowerCase())) {
          return {
            shouldInclude: false,
            reason: `Excluded: User specified "${form}" form, code contains "${excluded}"`,
            matchedRule: `formExclusion:${form}`
          };
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No form exclusion applies' };
}

/**
 * Check if a code should be eliminated based on decaffeination status
 */
function checkDecaffeinationExclusion(
  codeDescription: string,
  modifiers: string[]
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();

  for (const [status, rules] of Object.entries(eliminationRules!.decaffeinationExclusions)) {
    // Check if user specified this decaffeination status
    const userSpecifiedStatus = modifiers.some(m =>
      rules.include.some(inc => m.includes(inc.toLowerCase()))
    );

    if (userSpecifiedStatus) {
      // Check if code description contains excluded status
      for (const excluded of rules.exclude) {
        if (lowerDesc.includes(excluded.toLowerCase())) {
          return {
            shouldInclude: false,
            reason: `Excluded: User specified "${status}", code contains "${excluded}"`,
            matchedRule: `decaffeinationExclusion:${status}`
          };
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No decaffeination exclusion applies' };
}

/**
 * Check if a code should be eliminated based on flavoring status
 */
function checkFlavoringExclusion(
  codeDescription: string,
  modifiers: string[]
): EliminationResult {
  loadEliminationRules();

  const lowerDesc = codeDescription.toLowerCase();

  for (const [status, rules] of Object.entries(eliminationRules!.flavoringExclusions)) {
    // Check if user specified this flavoring status
    const userSpecifiedStatus = modifiers.some(m =>
      rules.include.some(inc => m.includes(inc.toLowerCase()))
    );

    if (userSpecifiedStatus) {
      // Check if code description contains excluded status
      for (const excluded of rules.exclude) {
        if (lowerDesc.includes(excluded.toLowerCase())) {
          return {
            shouldInclude: false,
            reason: `Excluded: User specified "${status}", code contains "${excluded}"`,
            matchedRule: `flavoringExclusion:${status}`
          };
        }
      }
    }
  }

  return { shouldInclude: true, reason: 'No flavoring exclusion applies' };
}

/**
 * Check if a code should be eliminated based on material exclusions
 * (e.g., "brake pads for cars" should force Chapter 87, not material chapters)
 */
function checkMaterialExclusion(
  code: string,
  modifiers: string[],
  originalQuery: string
): EliminationResult {
  loadEliminationRules();

  const lowerQuery = originalQuery.toLowerCase();
  const codeChapter = code.substring(0, 2);

  for (const [keyword, rules] of Object.entries(eliminationRules!.materialExclusions)) {
    // Check if query contains this keyword
    if (lowerQuery.includes(keyword.toLowerCase())) {
      // Check if code is in an excluded chapter
      if (rules.excludeChapters.includes(codeChapter)) {
        return {
          shouldInclude: false,
          reason: `Excluded: "${keyword}" forces Ch.${rules.forceChapter}, code is in excluded Ch.${codeChapter}`,
          matchedRule: `materialExclusion:${keyword}`
        };
      }
    }
  }

  return { shouldInclude: true, reason: 'No material exclusion applies' };
}

// ========================================
// Main Elimination Functions
// ========================================

/**
 * Main function: Filter candidates using eliminative reasoning
 */
export function filterCandidatesByElimination(
  candidates: Array<{ code: string; description: string; [key: string]: any }>,
  parsedQuery: {
    productTypeModifiers?: string[];
    materialModifiers?: string[];
    modifiers?: string[];
    originalQuery: string;
  }
): FilterResult {
  loadEliminationRules();

  const modifiers = extractAllModifiers(parsedQuery);

  // Also extract modifiers from the original query text
  const textModifiers = extractModifiersFromText(parsedQuery.originalQuery);
  const allModifiers = [...new Set([...modifiers, ...textModifiers])];

  const appliedRules: string[] = [];
  let eliminatedCount = 0;

  if (allModifiers.length === 0) {
    // No modifiers to filter by
    return {
      filteredCodes: candidates,
      eliminatedCount: 0,
      appliedRules: []
    };
  }

  logger.info(`[ELIMINATION] Filtering ${candidates.length} candidates with modifiers: [${allModifiers.join(', ')}]`);

  const filteredCodes = candidates.filter(candidate => {
    // Check variety exclusions
    const varietyResult = checkVarietyExclusion(candidate.description, allModifiers);
    if (!varietyResult.shouldInclude) {
      eliminatedCount++;
      if (varietyResult.matchedRule && !appliedRules.includes(varietyResult.matchedRule)) {
        appliedRules.push(varietyResult.matchedRule);
      }
      return false;
    }

    // Check processing state exclusions
    const processingResult = checkProcessingStateExclusion(
      candidate.code,
      candidate.description,
      allModifiers
    );
    if (!processingResult.shouldInclude) {
      eliminatedCount++;
      if (processingResult.matchedRule && !appliedRules.includes(processingResult.matchedRule)) {
        appliedRules.push(processingResult.matchedRule);
      }
      return false;
    }

    // Check grade exclusions
    const gradeResult = checkGradeExclusion(
      candidate.description,
      allModifiers,
      parsedQuery.originalQuery
    );
    if (!gradeResult.shouldInclude) {
      eliminatedCount++;
      if (gradeResult.matchedRule && !appliedRules.includes(gradeResult.matchedRule)) {
        appliedRules.push(gradeResult.matchedRule);
      }
      return false;
    }

    // Check form exclusions
    const formResult = checkFormExclusion(candidate.description, allModifiers);
    if (!formResult.shouldInclude) {
      eliminatedCount++;
      if (formResult.matchedRule && !appliedRules.includes(formResult.matchedRule)) {
        appliedRules.push(formResult.matchedRule);
      }
      return false;
    }

    // Check decaffeination exclusions
    const decafResult = checkDecaffeinationExclusion(candidate.description, allModifiers);
    if (!decafResult.shouldInclude) {
      eliminatedCount++;
      if (decafResult.matchedRule && !appliedRules.includes(decafResult.matchedRule)) {
        appliedRules.push(decafResult.matchedRule);
      }
      return false;
    }

    // Check flavoring exclusions
    const flavorResult = checkFlavoringExclusion(candidate.description, allModifiers);
    if (!flavorResult.shouldInclude) {
      eliminatedCount++;
      if (flavorResult.matchedRule && !appliedRules.includes(flavorResult.matchedRule)) {
        appliedRules.push(flavorResult.matchedRule);
      }
      return false;
    }

    // Check material exclusions (for functional products)
    const materialResult = checkMaterialExclusion(
      candidate.code,
      allModifiers,
      parsedQuery.originalQuery
    );
    if (!materialResult.shouldInclude) {
      eliminatedCount++;
      if (materialResult.matchedRule && !appliedRules.includes(materialResult.matchedRule)) {
        appliedRules.push(materialResult.matchedRule);
      }
      return false;
    }

    return true;
  });

  if (eliminatedCount > 0) {
    logger.info(`[ELIMINATION] Filtered: ${candidates.length} -> ${filteredCodes.length} candidates`);
    logger.info(`[ELIMINATION] Applied rules: ${appliedRules.join(', ')}`);
  }

  // SAFETY CHECK: If elimination removed ALL candidates, something may be wrong
  // Fall back to original candidates or chapter-filtered candidates
  if (filteredCodes.length === 0 && candidates.length > 0) {
    logger.warn('[ELIMINATION] WARNING: All candidates eliminated! Applying fallback logic.');
    logger.warn(`[ELIMINATION] Original candidates: ${candidates.map(c => c.code).join(', ')}`);
    logger.warn(`[ELIMINATION] Modifiers applied: ${allModifiers.join(', ')}`);

    // Try to determine if there's a "correct" chapter from the rules
    // Look for mustBeInChapter rules that match our modifiers
    let correctChapter: string | null = null;
    for (const states of Object.values(eliminationRules!.processingStateExclusions)) {
      for (const [state, rules] of Object.entries(states)) {
        if (allModifiers.includes(state.toLowerCase()) && rules.mustBeInChapter) {
          correctChapter = rules.mustBeInChapter;
          break;
        }
      }
      if (correctChapter) break;
    }

    if (correctChapter) {
      // Return candidates from the correct chapter
      const chapterCandidates = candidates.filter(c => c.code.startsWith(correctChapter!));
      if (chapterCandidates.length > 0) {
        logger.warn(`[ELIMINATION] Falling back to ${chapterCandidates.length} candidates from Ch.${correctChapter}`);
        return {
          filteredCodes: chapterCandidates,
          eliminatedCount: candidates.length - chapterCandidates.length,
          appliedRules: [`fallback:chapter:${correctChapter}`]
        };
      }
    }

    // Last resort: return original candidates
    logger.warn('[ELIMINATION] Falling back to ALL original candidates');
    return {
      filteredCodes: candidates,
      eliminatedCount: 0,
      appliedRules: ['fallback:all']
    };
  }

  return {
    filteredCodes,
    eliminatedCount,
    appliedRules
  };
}

/**
 * Filter question options using elimination rules
 * This is used when generating questions to only show relevant options
 */
export function filterQuestionOptions(
  options: Array<{ code: string; description: string; label: string }>,
  parsedQuery: {
    productTypeModifiers?: string[];
    materialModifiers?: string[];
    modifiers?: string[];
    originalQuery: string;
  }
): Array<{ code: string; description: string; label: string }> {
  const result = filterCandidatesByElimination(options, parsedQuery);
  return result.filteredCodes as Array<{ code: string; description: string; label: string }>;
}

/**
 * Check if a question is still relevant after elimination
 * Returns false if all options except one have been eliminated
 */
export function isQuestionStillRelevant(
  originalOptions: Array<{ code: string; description: string }>,
  parsedQuery: {
    productTypeModifiers?: string[];
    materialModifiers?: string[];
    modifiers?: string[];
    originalQuery: string;
  }
): { relevant: boolean; remainingOptions: number; autoSelectCode?: string } {
  const result = filterCandidatesByElimination(originalOptions, parsedQuery);

  if (result.filteredCodes.length === 0) {
    // All options eliminated - something is wrong, keep original
    logger.warn('[ELIMINATION] All options eliminated - keeping original options');
    return { relevant: true, remainingOptions: originalOptions.length };
  }

  if (result.filteredCodes.length === 1) {
    // Only one option left - auto-select it
    const autoSelect = result.filteredCodes[0];
    logger.info(`[ELIMINATION] Auto-selecting ${autoSelect.code} - only option after elimination`);
    return {
      relevant: false,
      remainingOptions: 1,
      autoSelectCode: autoSelect.code
    };
  }

  // Multiple options remain - question is still relevant
  return { relevant: true, remainingOptions: result.filteredCodes.length };
}

/**
 * Filter children codes when navigating the hierarchy
 * Returns filtered children and indicates if auto-selection should happen
 */
export function filterHierarchyChildren(
  children: Array<{ code: string; description: string; isOther: boolean; hasChildren: boolean }>,
  parsedQuery: {
    productTypeModifiers?: string[];
    materialModifiers?: string[];
    modifiers?: string[];
    originalQuery: string;
  }
): {
  filteredChildren: Array<{ code: string; description: string; isOther: boolean; hasChildren: boolean }>;
  autoSelectCode?: string;
  eliminatedCount: number;
  appliedRules: string[];
} {
  const result = filterCandidatesByElimination(children, parsedQuery);

  // Cast back to original type
  const filteredChildren = result.filteredCodes as Array<{
    code: string;
    description: string;
    isOther: boolean;
    hasChildren: boolean;
  }>;

  // Check for auto-selection
  const nonOtherOptions = filteredChildren.filter(c => !c.isOther);

  if (nonOtherOptions.length === 1 && result.eliminatedCount > 0) {
    // Only one non-Other option left after elimination
    return {
      filteredChildren,
      autoSelectCode: nonOtherOptions[0]!.code,
      eliminatedCount: result.eliminatedCount,
      appliedRules: result.appliedRules
    };
  }

  return {
    filteredChildren,
    eliminatedCount: result.eliminatedCount,
    appliedRules: result.appliedRules
  };
}

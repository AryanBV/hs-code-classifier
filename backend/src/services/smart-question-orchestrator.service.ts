/**
 * Smart Question Orchestrator Service
 *
 * Orchestrates the question-asking flow for HS code classification.
 * Ensures questions are asked in the RIGHT order, at the RIGHT time,
 * and only when they are RELEVANT.
 *
 * KEY PRINCIPLES:
 * 1. HIERARCHY-FIRST: Follow HS code hierarchy (Chapter → Heading → Subheading → Tariff)
 * 2. DEPENDENCY-AWARE: Some questions only matter after others are answered
 * 3. UPFRONT BATCHING: Ask all critical questions in round 1 when possible
 * 4. QUALITY OVER QUANTITY: Filter out low-quality, redundant, or irrelevant questions
 * 5. SMART SKIPPING: Skip questions when answer can be inferred from context
 */

import { logger } from '../utils/logger';
import { CodeDifferential, DifferentialType, DifferentialOption } from './code-differential.service';
import { DynamicQuestion } from './dynamic-question.service';
import { ClarifyingQuestion } from '../types/conversation.types';
import { Candidate } from './multi-candidate-search.service';

// ========================================
// Types
// ========================================

/**
 * Question priority levels that determine asking order
 */
export type QuestionPriority =
  | 'critical'    // Must ask - determines major branch (Species, Material, Type)
  | 'important'   // Should ask - refines classification (Processing, Form, State)
  | 'clarifying'  // Nice to ask - fine details (Grade, Size, Packaging)
  | 'optional';   // Only if ambiguous (Color, Brand, Model)

/**
 * Question dependency - when one question depends on another
 */
export interface QuestionDependency {
  questionId: string;
  dependsOn: string[];        // Question IDs that must be answered first
  condition?: string;         // Condition for when this question is relevant
  skipIfAnswerContains?: string[];  // Skip if any of these in description/answers
}

/**
 * Smart question with enhanced metadata
 */
export interface SmartQuestion {
  id: string;
  text: string;
  options: string[];
  allowOther: boolean;
  priority: QuestionPriority;
  hierarchyLevel: number;     // 1 = top level, 2 = mid, 3 = fine detail
  dependencies: string[];     // Questions that must be answered first
  skipConditions: SkipCondition[];
  impactScore: number;        // How many codes does this distinguish (0-100)
  differential?: CodeDifferential;
  category: QuestionCategory;
}

export interface SkipCondition {
  type: 'description_contains' | 'answer_contains' | 'candidate_count' | 'confidence_threshold';
  value: string | number;
  operator?: 'equals' | 'contains' | 'less_than' | 'greater_than';
}

export type QuestionCategory =
  | 'identity'      // What IS it (species, type, material)
  | 'state'         // What STATE is it in (form, processing, roasted)
  | 'quality'       // What QUALITY (grade, purity)
  | 'specification' // Technical specs (size, weight, wattage)
  | 'packaging'     // How packaged (bulk, retail)
  | 'use'           // Intended use (industrial, household)
  | 'target'        // Target user (men, women, children)
  | 'other';        // Catch-all

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  questions: SmartQuestion[];
  totalPending: number;
  skippedQuestions: SkippedQuestion[];
  readyToClassify: boolean;
  classifyReason?: string;
  nextRoundQuestions: SmartQuestion[];  // Questions for next round if any
}

export interface SkippedQuestion {
  question: SmartQuestion;
  reason: string;
}

// ========================================
// Question Category Mappings
// ========================================

const DIFFERENTIAL_TO_CATEGORY: Record<DifferentialType, QuestionCategory> = {
  'species': 'identity',
  'material': 'identity',
  'term': 'identity',
  'form': 'state',
  'processing': 'state',
  'grade': 'quality',
  'specification': 'specification',
  'size': 'specification',
  'price': 'specification',
  'packaging': 'packaging',
  'use': 'use',
  'gender': 'target',
};

const CATEGORY_PRIORITY: Record<QuestionCategory, QuestionPriority> = {
  'identity': 'critical',
  'state': 'important',
  'quality': 'clarifying',
  'specification': 'clarifying',
  'packaging': 'clarifying',
  'use': 'important',
  'target': 'clarifying',
  'other': 'optional',
};

const CATEGORY_HIERARCHY_LEVEL: Record<QuestionCategory, number> = {
  'identity': 1,
  'state': 2,
  'use': 2,
  'quality': 3,
  'specification': 3,
  'packaging': 3,
  'target': 3,
  'other': 4,
};

// ========================================
// Quality Filters
// ========================================

/**
 * Filter out low-quality differentials that would produce poor questions
 */
export function filterLowQualityDifferentials(
  differentials: CodeDifferential[],
  productDescription: string,
  candidates: Candidate[]
): { kept: CodeDifferential[]; filtered: CodeDifferential[]; filterReasons: Map<string, string> } {
  const kept: CodeDifferential[] = [];
  const filtered: CodeDifferential[] = [];
  const filterReasons = new Map<string, string>();
  const descLower = productDescription.toLowerCase();

  for (const diff of differentials) {
    const reason = shouldFilterDifferential(diff, descLower, candidates);
    if (reason) {
      filtered.push(diff);
      filterReasons.set(diff.id, reason);
      logger.debug(`[QUALITY FILTER] Removed "${diff.feature}": ${reason}`);
    } else {
      kept.push(diff);
    }
  }

  logger.info(`[QUALITY FILTER] Kept ${kept.length}/${differentials.length} differentials`);
  return { kept, filtered, filterReasons };
}

/**
 * Check if a differential should be filtered out
 */
function shouldFilterDifferential(
  diff: CodeDifferential,
  descLower: string,
  candidates: Candidate[]
): string | null {
  // CRITICAL: NEVER filter variety/species differentials - they are essential for correct classification
  // These differentiate final codes (e.g., mango varieties, coffee types)
  if (diff.type === 'species' || diff.id.startsWith('sibling_') || diff.id.startsWith('variety_')) {
    logger.debug(`[QUALITY FILTER] Keeping critical differential: ${diff.feature} (type: ${diff.type})`);
    return null; // Never filter
  }

  // 1. Filter differentials with too few affected codes
  if (diff.affectedCodes.length < 2) {
    return 'Affects less than 2 codes';
  }

  // 2. Filter differentials where options are product names (not characteristics)
  if (hasProductNameOptions(diff)) {
    return 'Options appear to be product names, not characteristics';
  }

  // 3. Filter differentials with only one meaningful option
  const meaningfulOptions = diff.options.filter(o =>
    !isGenericOption(o.value) && o.matchingCodes.length > 0
  );
  if (meaningfulOptions.length < 2) {
    return 'Less than 2 meaningful options';
  }

  // 4. Filter differentials already answered by description
  const matchedOptions = diff.options.filter(o =>
    descLower.includes(o.value.toLowerCase())
  );
  if (matchedOptions.length === 1) {
    return `Already covered by description: "${matchedOptions[0]?.value}"`;
  }

  // 5. Filter term differentials with technical jargon options
  if (diff.type === 'term' && hasOnlyTechnicalOptions(diff)) {
    return 'Options are technical codes/jargon, not user-friendly';
  }

  // 6. Filter differentials where all options map to same codes
  const uniqueCodeSets = new Set(
    diff.options.map(o => o.matchingCodes.sort().join(','))
  );
  if (uniqueCodeSets.size < 2) {
    return 'All options map to the same codes';
  }

  return null;
}

/**
 * Check if options appear to be product names rather than characteristics
 */
function hasProductNameOptions(diff: CodeDifferential): boolean {
  // Product names typically:
  // - Contain numbers (model numbers)
  // - Are very short (abbreviations)
  // - Match the sample description too closely

  const suspiciousCount = diff.options.filter(o => {
    const val = o.value.toLowerCase();
    // Check if it's a very short term (likely abbreviation/code)
    if (val.length <= 2 && !/\d/.test(val)) return true;
    // Check if it contains HS code patterns
    if (/\d{4}\.\d{2}/.test(val)) return true;
    // Check if it's just "other" or similar
    if (['other', 'others', 'n.e.s', 'n.e.s.', 'nes'].includes(val)) return false; // These are OK
    return false;
  }).length;

  return suspiciousCount > diff.options.length / 2;
}

/**
 * Check if an option value is too generic to be useful
 */
function isGenericOption(value: string): boolean {
  const genericTerms = [
    'other', 'others', 'n.e.s', 'n.e.s.', 'nes', 'etc', 'etc.',
    'not elsewhere specified', 'not specified', 'unspecified',
    'miscellaneous', 'general', 'various', 'different', 'mixed',
  ];
  return genericTerms.includes(value.toLowerCase().trim());
}

/**
 * Check if all options are technical/jargon
 */
function hasOnlyTechnicalOptions(diff: CodeDifferential): boolean {
  const technicalPatterns = [
    /^\d{4}\.\d{2}/,           // HS code pattern
    /^[A-Z]{2,5}$/,            // All caps abbreviation
    /\d{3,}[A-Z]/,             // Model number like pattern
    /^[<>≤≥]\s*\d/,           // Comparison operators
  ];

  const technicalCount = diff.options.filter(o =>
    technicalPatterns.some(p => p.test(o.value))
  ).length;

  return technicalCount > diff.options.length * 0.7;
}

// ========================================
// Question Dependency Resolution
// ========================================

/**
 * Build dependency graph for questions
 */
export function buildDependencyGraph(
  questions: SmartQuestion[]
): Map<string, QuestionDependency> {
  const graph = new Map<string, QuestionDependency>();

  // Define standard dependencies between question categories
  const categoryDependencies: Record<QuestionCategory, QuestionCategory[]> = {
    'identity': [],                           // No dependencies - ask first
    'state': ['identity'],                    // Need to know WHAT it is first
    'use': ['identity'],                      // Need to know WHAT before WHY
    'quality': ['identity', 'state'],         // Need to know what and state first
    'specification': ['identity'],            // Need to know what first
    'packaging': ['identity', 'state'],       // Usually last-level distinction
    'target': ['identity'],                   // Need to know what first
    'other': ['identity', 'state', 'quality'] // Depends on everything
  };

  // Build dependencies for each question
  for (const question of questions) {
    const requiredCategories = categoryDependencies[question.category] || [];

    // Find questions in required categories
    const dependencies = questions
      .filter(q => requiredCategories.includes(q.category) && q.id !== question.id)
      .map(q => q.id);

    graph.set(question.id, {
      questionId: question.id,
      dependsOn: dependencies,
    });
  }

  return graph;
}

/**
 * Resolve question order based on dependencies
 */
export function resolveQuestionOrder(
  questions: SmartQuestion[],
  answeredQuestionIds: Set<string>
): SmartQuestion[] {
  const dependencyGraph = buildDependencyGraph(questions);
  const ordered: SmartQuestion[] = [];
  const pending = new Set(questions.map(q => q.id));

  // Iteratively add questions whose dependencies are satisfied
  let maxIterations = questions.length * 2;
  while (pending.size > 0 && maxIterations > 0) {
    maxIterations--;

    for (const questionId of pending) {
      const deps = dependencyGraph.get(questionId)?.dependsOn || [];

      // Check if all dependencies are satisfied (answered or in ordered list)
      const allSatisfied = deps.every(depId =>
        answeredQuestionIds.has(depId) ||
        ordered.some(q => q.id === depId)
      );

      if (allSatisfied || deps.length === 0) {
        const question = questions.find(q => q.id === questionId);
        if (question) {
          ordered.push(question);
          pending.delete(questionId);
        }
      }
    }
  }

  // Add any remaining questions (circular deps or other issues)
  for (const questionId of pending) {
    const question = questions.find(q => q.id === questionId);
    if (question) {
      ordered.push(question);
    }
  }

  return ordered;
}

// ========================================
// Smart Question Selection
// ========================================

/**
 * Select the best questions to ask in this round
 */
export function selectQuestionsForRound(
  allQuestions: SmartQuestion[],
  productDescription: string,
  previousAnswers: Record<string, string>,
  currentRound: number,
  maxQuestionsPerRound: number,
  candidateCount: number,
  confidenceScore: number
): OrchestrationResult {
  const descLower = productDescription.toLowerCase();
  const answeredIds = new Set(Object.keys(previousAnswers));

  // Step 1: Filter out already answered questions
  const unanswered = allQuestions.filter(q => !answeredIds.has(q.id));

  // Step 2: Apply skip conditions
  const { eligible, skipped } = applySkipConditions(
    unanswered,
    descLower,
    previousAnswers,
    candidateCount,
    confidenceScore
  );

  // Step 3: Resolve order based on dependencies
  const ordered = resolveQuestionOrder(eligible, answeredIds);

  // Step 4: Group by priority for this round
  const roundQuestions = selectByRoundStrategy(
    ordered,
    currentRound,
    maxQuestionsPerRound
  );

  // Step 5: Check if ready to classify
  const readyToClassify = checkReadyToClassify(
    eligible,
    roundQuestions,
    candidateCount,
    confidenceScore
  );

  return {
    questions: roundQuestions,
    totalPending: eligible.length - roundQuestions.length,
    skippedQuestions: skipped,
    readyToClassify: readyToClassify.ready,
    classifyReason: readyToClassify.reason,
    nextRoundQuestions: ordered.slice(roundQuestions.length)
  };
}

/**
 * Apply skip conditions to filter questions
 */
function applySkipConditions(
  questions: SmartQuestion[],
  descLower: string,
  previousAnswers: Record<string, string>,
  candidateCount: number,
  confidenceScore: number
): { eligible: SmartQuestion[]; skipped: SkippedQuestion[] } {
  const eligible: SmartQuestion[] = [];
  const skipped: SkippedQuestion[] = [];
  const allAnswersLower = Object.values(previousAnswers).join(' ').toLowerCase();

  for (const question of questions) {
    let skipReason: string | null = null;

    for (const condition of question.skipConditions) {
      if (skipReason) break;

      switch (condition.type) {
        case 'description_contains':
          if (descLower.includes(String(condition.value).toLowerCase())) {
            skipReason = `Description already contains "${condition.value}"`;
          }
          break;

        case 'answer_contains':
          if (allAnswersLower.includes(String(condition.value).toLowerCase())) {
            skipReason = `Previous answer already contains "${condition.value}"`;
          }
          break;

        case 'candidate_count':
          if (condition.operator === 'less_than' && candidateCount < Number(condition.value)) {
            skipReason = `Only ${candidateCount} candidates remain`;
          }
          break;

        case 'confidence_threshold':
          if (condition.operator === 'greater_than' && confidenceScore > Number(condition.value)) {
            skipReason = `Confidence ${confidenceScore}% exceeds threshold ${condition.value}%`;
          }
          break;
      }
    }

    if (skipReason) {
      skipped.push({ question, reason: skipReason });
    } else {
      eligible.push(question);
    }
  }

  return { eligible, skipped };
}

/**
 * Select questions based on round strategy
 *
 * ROUND STRATEGY:
 * - Round 1: Ask ALL critical questions + important questions (up to limit)
 * - Round 2: Ask remaining important + clarifying questions
 * - Round 3+: Ask only clarifying questions needed for final distinction
 */
function selectByRoundStrategy(
  orderedQuestions: SmartQuestion[],
  currentRound: number,
  maxQuestions: number
): SmartQuestion[] {
  const selected: SmartQuestion[] = [];

  if (currentRound === 1) {
    // Round 1: Prioritize critical and important questions
    // First add all critical questions
    const critical = orderedQuestions.filter(q => q.priority === 'critical');
    selected.push(...critical);

    // Then add important questions up to limit
    const important = orderedQuestions.filter(q => q.priority === 'important');
    const remainingSlots = maxQuestions - selected.length;
    selected.push(...important.slice(0, Math.max(0, remainingSlots)));

  } else if (currentRound === 2) {
    // Round 2: Focus on important and clarifying questions
    const important = orderedQuestions.filter(q => q.priority === 'important');
    const clarifying = orderedQuestions.filter(q => q.priority === 'clarifying');

    selected.push(...important.slice(0, Math.min(2, maxQuestions)));
    const remainingSlots = maxQuestions - selected.length;
    selected.push(...clarifying.slice(0, Math.max(0, remainingSlots)));

  } else {
    // Round 3+: Only high-impact clarifying questions
    const highImpact = orderedQuestions
      .filter(q => q.impactScore > 30)
      .slice(0, maxQuestions);
    selected.push(...highImpact);
  }

  // Ensure we don't exceed max
  return selected.slice(0, maxQuestions);
}

/**
 * Check if we're ready to classify without more questions
 */
function checkReadyToClassify(
  remainingQuestions: SmartQuestion[],
  selectedQuestions: SmartQuestion[],
  candidateCount: number,
  confidenceScore: number
): { ready: boolean; reason: string } {
  // Ready if: no more questions to ask
  if (remainingQuestions.length === 0 && selectedQuestions.length === 0) {
    return { ready: true, reason: 'All questions answered' };
  }

  // Ready if: only 1 candidate remains
  if (candidateCount === 1) {
    return { ready: true, reason: 'Single candidate remaining' };
  }

  // Ready if: high confidence and no critical questions left
  const hasCritical = remainingQuestions.some(q => q.priority === 'critical') ||
                     selectedQuestions.some(q => q.priority === 'critical');
  if (confidenceScore >= 90 && !hasCritical) {
    return { ready: true, reason: `High confidence (${confidenceScore}%) with no critical questions` };
  }

  // Ready if: very few candidates and only optional questions left
  const hasImportant = remainingQuestions.some(q =>
    q.priority === 'critical' || q.priority === 'important'
  );
  if (candidateCount <= 2 && !hasImportant) {
    return { ready: true, reason: `Only ${candidateCount} candidates with optional questions remaining` };
  }

  // Not ready - need to ask questions
  return { ready: false, reason: '' };
}

// ========================================
// Convert Differentials to Smart Questions
// ========================================

/**
 * Convert code differentials to smart questions with enhanced metadata
 */
export function convertToSmartQuestions(
  differentials: CodeDifferential[],
  productDescription: string
): SmartQuestion[] {
  const descLower = productDescription.toLowerCase();

  return differentials.map(diff => {
    const category = DIFFERENTIAL_TO_CATEGORY[diff.type] || 'other';
    const priority = determinePriority(diff, category);
    const hierarchyLevel = CATEGORY_HIERARCHY_LEVEL[category] || 3;
    const impactScore = calculateImpactScore(diff);
    const skipConditions = generateSkipConditions(diff, descLower);

    return {
      id: `smart_${diff.id}`,
      text: diff.questionHint || generateQuestionText(diff),
      // Include HS code prefix in format "CODE::DisplayText" so frontend can distinguish
      // real HS code "Other" options from generic "Other" inputs
      options: diff.options.slice(0, 5).map(o => {
        // If option has exactly one matching code, include it as prefix
        if (o.matchingCodes.length === 1) {
          return `${o.matchingCodes[0]}::${o.displayText}`;
        }
        // For multi-code options, just use displayText
        return o.displayText;
      }),
      allowOther: true,
      priority,
      hierarchyLevel,
      dependencies: [],  // Will be filled by buildDependencyGraph
      skipConditions,
      impactScore,
      differential: diff,
      category
    };
  });
}

/**
 * Determine question priority based on differential type and importance
 */
function determinePriority(diff: CodeDifferential, category: QuestionCategory): QuestionPriority {
  // Base priority from category
  let priority = CATEGORY_PRIORITY[category];

  // Boost priority if high importance (affects many codes)
  if (diff.importance >= 10) {
    if (priority === 'clarifying') priority = 'important';
    if (priority === 'optional') priority = 'clarifying';
  }

  // Boost certain types that are always critical
  if (['species', 'material'].includes(diff.type)) {
    priority = 'critical';
  }

  return priority;
}

/**
 * Calculate impact score (0-100) based on how many codes this distinguishes
 */
function calculateImpactScore(diff: CodeDifferential): number {
  // Base score on number of affected codes
  const baseScore = Math.min(diff.affectedCodes.length * 5, 50);

  // Bonus for binary distinctions (clearer choice)
  const binaryBonus = diff.distinctionType === 'binary' ? 20 : 0;

  // Bonus for high-value types
  const typeBonus = ['species', 'material', 'form', 'processing'].includes(diff.type) ? 20 : 0;

  return Math.min(100, baseScore + binaryBonus + typeBonus);
}

/**
 * Generate skip conditions for a question
 */
function generateSkipConditions(diff: CodeDifferential, descLower: string): SkipCondition[] {
  const conditions: SkipCondition[] = [];

  // Skip if description already contains a unique option
  for (const option of diff.options) {
    if (option.value.length >= 4 && !isGenericOption(option.value)) {
      conditions.push({
        type: 'description_contains',
        value: option.value,
        operator: 'contains'
      });
    }
  }

  // Skip packaging questions if confident enough
  if (diff.type === 'packaging') {
    conditions.push({
      type: 'confidence_threshold',
      value: 85,
      operator: 'greater_than'
    });
  }

  // Skip grade questions if only 1 candidate
  if (diff.type === 'grade') {
    conditions.push({
      type: 'candidate_count',
      value: 1,
      operator: 'less_than'
    });
  }

  return conditions;
}

/**
 * Generate user-friendly question text from differential
 */
function generateQuestionText(diff: CodeDifferential): string {
  const typeQuestions: Record<DifferentialType, string> = {
    'species': 'What species or variety is this product?',
    'material': 'What is the primary material?',
    'term': 'Which type best describes this product?',
    'form': 'In what form is the product?',
    'processing': 'What level of processing has it undergone?',
    'grade': 'What is the quality grade?',
    'specification': `What is the ${diff.feature.toLowerCase()}?`,
    'size': 'What is the size or weight category?',
    'price': 'What is the price range?',
    'packaging': 'How is the product packaged?',
    'use': 'What is the intended use?',
    'gender': 'Who is the target user?'
  };

  return typeQuestions[diff.type] || `What is the ${diff.feature.toLowerCase()}?`;
}

// ========================================
// Main Orchestration Function
// ========================================

/**
 * Main orchestration function - determines what questions to ask
 */
export async function orchestrateQuestions(
  differentials: CodeDifferential[],
  productDescription: string,
  previousAnswers: Record<string, string>,
  currentRound: number,
  candidates: Candidate[],
  confidenceScore: number,
  maxQuestionsPerRound: number = 3
): Promise<OrchestrationResult> {

  // Step 1: Filter low-quality differentials
  const { kept: qualityDifferentials } = filterLowQualityDifferentials(
    differentials,
    productDescription,
    candidates
  );

  // Step 2: Convert to smart questions
  const smartQuestions = convertToSmartQuestions(qualityDifferentials, productDescription);

  // Step 3: Select questions for this round
  const result = selectQuestionsForRound(
    smartQuestions,
    productDescription,
    previousAnswers,
    currentRound,
    maxQuestionsPerRound,
    candidates.length,
    confidenceScore
  );

  logger.info(`[ORCHESTRATOR] Round ${currentRound}: Selected ${result.questions.length} questions, ` +
    `${result.skippedQuestions.length} skipped, ${result.totalPending} pending`);

  return result;
}

/**
 * Convert SmartQuestions to standard ClarifyingQuestions for frontend
 */
export function toStandardFormat(questions: SmartQuestion[]): ClarifyingQuestion[] {
  return questions.map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    allowOther: q.allowOther,
    priority: q.priority === 'critical' || q.priority === 'important' ? 'required' : 'optional'
  }));
}

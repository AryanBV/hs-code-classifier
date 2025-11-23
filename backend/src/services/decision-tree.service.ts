/**
 * Decision Tree Service
 *
 * Applies rule-based classification logic using decision trees
 * stored in the decision_trees table
 *
 * Weight: 40% of final confidence score
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import {
  DecisionTreeResult,
  QuestionnaireAnswers,
  DecisionTreeFlow,
  DecisionRule
} from '../types/classification.types';

/**
 * Load decision tree for a specific category
 *
 * @param categoryName - Product category name (e.g., "Automotive Parts")
 * @returns Decision tree flow with questions and rules
 *
 * TODO: Implement database query
 * - Query decision_trees table by categoryName
 * - Parse JSONB decision_flow
 * - Return structured DecisionTreeFlow
 */
export async function loadDecisionTree(categoryName: string): Promise<DecisionTreeFlow | null> {
  logger.debug(`Loading decision tree for category: ${categoryName}`);

  try {
    const tree = await prisma.decisionTree.findUnique({
      where: { categoryName }
    });

    if (!tree) {
      logger.warn(`No decision tree found for category: ${categoryName}`);
      return null;
    }

    // Parse JSONB decision_flow into structured DecisionTreeFlow
    const decisionFlow = tree.decisionFlow as unknown as DecisionTreeFlow;

    logger.debug(`Decision tree loaded successfully: ${decisionFlow.questions.length} questions, ${decisionFlow.rules.length} rules`);

    return decisionFlow;

  } catch (error) {
    logger.error('Error loading decision tree');
    logger.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Evaluate decision tree rules against questionnaire answers
 *
 * @param decisionFlow - Decision tree structure
 * @param answers - User's questionnaire answers
 * @param keywords - Extracted keywords from product description
 * @returns Matching rules with confidence boosts
 *
 * TODO: Implement rule evaluation logic
 * - Iterate through all rules in decision tree
 * - Check if rule conditions match answers
 * - Check if keywords match rule keyword requirements
 * - Calculate confidence based on:
 *   * Number of conditions matched
 *   * Confidence boost from rule
 *   * Specificity of rule
 * - Return matched rules sorted by confidence
 */
export function evaluateRules(
  decisionFlow: DecisionTreeFlow,
  answers: QuestionnaireAnswers,
  keywords: string[]
): DecisionRule[] {
  logger.debug('Evaluating decision tree rules');
  logger.debug(`Total rules to evaluate: ${decisionFlow.rules.length}`);
  logger.debug(`Keywords available: [${keywords.join(', ')}]`);
  logger.debug(`Answers provided: ${JSON.stringify(answers)}`);

  // Filter rules that match all conditions
  const matchedRules: DecisionRule[] = [];

  for (let i = 0; i < decisionFlow.rules.length; i++) {
    const rule = decisionFlow.rules[i];
    if (!rule) continue;

    logger.debug(`\nEvaluating rule ${i + 1}/${decisionFlow.rules.length}`);
    logger.debug(`Rule conditions: ${JSON.stringify(rule.conditions)}`);
    logger.debug(`Rule suggests: ${rule.suggestedCodes.join(', ')}`);
    logger.debug(`Confidence boost: ${rule.confidenceBoost}`);

    // Check if this rule's conditions match
    const isMatch = checkConditions(rule.conditions, answers, keywords);

    if (isMatch) {
      logger.info(`✓ Rule ${i + 1} MATCHED: ${rule.suggestedCodes.join(', ')} (boost: ${rule.confidenceBoost})`);
      matchedRules.push(rule);
    } else {
      logger.debug(`✗ Rule ${i + 1} did not match`);
    }
  }

  // Sort matched rules by confidence boost (highest first)
  matchedRules.sort((a, b) => b.confidenceBoost - a.confidenceBoost);

  logger.info(`Evaluation complete: ${matchedRules.length} rules matched out of ${decisionFlow.rules.length} total`);

  if (matchedRules.length > 0) {
    const topCodes = matchedRules.slice(0, 3).map(r =>
      `${r.suggestedCodes.join(', ')} (boost: ${r.confidenceBoost})`
    ).join(' | ');
    logger.info(`Top matched rules: ${topCodes}`);
  }

  return matchedRules;
}

/**
 * Check if a rule's conditions match the provided answers
 *
 * @param conditions - Rule conditions from decision tree
 * @param answers - User's questionnaire answers
 * @param keywords - Extracted keywords from product description
 * @returns true if all conditions match
 *
 * Handles:
 * - Keyword conditions: checks if all required keywords are present
 * - Question conditions: checks if answer matches expected value
 * - Different answer types: string, array, number
 * - Case-insensitive matching for keywords
 */
function checkConditions(
  conditions: { [key: string]: string | string[] | undefined },
  answers: QuestionnaireAnswers,
  keywords: string[]
): boolean {
  logger.debug(`Checking conditions: ${JSON.stringify(conditions)}`);

  // Check each condition in the rule
  for (const [conditionKey, expectedValue] of Object.entries(conditions)) {
    // Skip undefined values
    if (expectedValue === undefined) {
      continue;
    }

    // Handle keyword conditions
    if (conditionKey === 'keywords') {
      // Expected value should be array of required keywords
      const requiredKeywords = Array.isArray(expectedValue) ? expectedValue : [expectedValue];

      logger.debug(`Checking keyword condition: requires [${requiredKeywords.join(', ')}]`);
      logger.debug(`Available keywords: [${keywords.join(', ')}]`);

      // Check if ALL required keywords are present (case-insensitive)
      const hasAllKeywords = requiredKeywords.every(requiredKw =>
        keywords.some(availableKw =>
          availableKw.toLowerCase().includes(requiredKw.toLowerCase())
        )
      );

      if (!hasAllKeywords) {
        logger.debug(`Keyword condition failed: missing some required keywords`);
        return false;
      }

      logger.debug(`Keyword condition passed`);
      continue;
    }

    // Handle question answer conditions
    const userAnswer = answers[conditionKey];

    // If question was not answered, condition fails
    if (userAnswer === undefined || userAnswer === null) {
      logger.debug(`Question condition failed: ${conditionKey} not answered`);
      return false;
    }

    // Handle array answers (multiple choice questions)
    if (Array.isArray(expectedValue)) {
      // Check if user's answer is in the array of expected values
      const matched = expectedValue.some(val => {
        if (Array.isArray(userAnswer)) {
          // User selected multiple answers
          return userAnswer.includes(val);
        }
        return userAnswer === val;
      });

      if (!matched) {
        logger.debug(`Question condition failed: ${conditionKey} = ${JSON.stringify(userAnswer)}, expected one of [${expectedValue.join(', ')}]`);
        return false;
      }
    } else {
      // Single value expected
      // Handle string comparison (case-sensitive for questionnaire answers)
      if (userAnswer !== expectedValue) {
        logger.debug(`Question condition failed: ${conditionKey} = ${JSON.stringify(userAnswer)}, expected ${expectedValue}`);
        return false;
      }
    }

    logger.debug(`Question condition passed: ${conditionKey} = ${JSON.stringify(userAnswer)}`);
  }

  // All conditions matched
  logger.debug(`All conditions matched`);
  return true;
}

/**
 * Main decision tree classification function
 *
 * @param categoryName - Detected product category
 * @param questionnaireAnswers - User's questionnaire answers
 * @param keywords - Extracted keywords from product description
 * @returns Decision tree classification results
 *
 * This orchestrates the full decision tree process:
 * 1. Load decision tree for category
 * 2. Evaluate rules against answers
 * 3. Calculate confidence scores (0-100)
 * 4. Generate reasoning for matched rules
 * 5. Return top 3 results
 */
export async function applyDecisionTree(
  categoryName: string,
  questionnaireAnswers: QuestionnaireAnswers,
  keywords: string[]
): Promise<DecisionTreeResult[]> {
  logger.info(`Applying decision tree for category: ${categoryName}`);

  // Step 1: Load decision tree
  const decisionFlow = await loadDecisionTree(categoryName);

  if (!decisionFlow) {
    logger.warn(`No decision tree found for category: ${categoryName}`);
    return [];
  }

  // Step 2: Evaluate rules
  const matchedRules = evaluateRules(decisionFlow, questionnaireAnswers, keywords);

  if (matchedRules.length === 0) {
    logger.warn('No rules matched in decision tree');
    return [];
  }

  logger.info(`Decision tree found ${matchedRules.length} matching rules`);

  // Step 3: Convert matched rules to DecisionTreeResult[]
  const results: DecisionTreeResult[] = [];
  const processedCodes = new Set<string>(); // Track processed codes to avoid duplicates

  for (const rule of matchedRules) {
    // Each rule can suggest multiple HS codes
    for (const hsCode of rule.suggestedCodes) {
      // Skip if we already processed this code
      if (processedCodes.has(hsCode)) {
        logger.debug(`Skipping duplicate HS code: ${hsCode}`);
        continue;
      }

      processedCodes.add(hsCode);

      // Calculate confidence score
      // Base confidence: 60-80 depending on number of conditions matched
      const numConditions = Object.keys(rule.conditions).length;
      const baseConfidence = Math.min(60 + (numConditions * 5), 80);

      // Add confidence boost from rule
      const finalConfidence = Math.min(baseConfidence + rule.confidenceBoost / 10, 100);

      // Generate reasoning
      const reasoning = generateReasoningFromRule(rule, questionnaireAnswers, keywords);

      // Extract which conditions were matched
      const rulesMatched = Object.entries(rule.conditions)
        .map(([key, value]) => {
          if (key === 'keywords') {
            const kws = Array.isArray(value) ? value : [value];
            return `Keywords: ${kws.join(', ')}`;
          }
          return `${key}: ${Array.isArray(value) ? value.join(' or ') : value}`;
        });

      results.push({
        hsCode,
        confidence: Math.round(finalConfidence),
        rulesMatched,
        reasoning
      });

      logger.debug(`Added result: ${hsCode} (confidence: ${Math.round(finalConfidence)})`);
    }
  }

  // Sort by confidence (highest first) and return top 3
  results.sort((a, b) => b.confidence - a.confidence);
  const topResults = results.slice(0, 3);

  logger.info(`Returning ${topResults.length} classification results`);
  if (topResults.length > 0 && topResults[0]) {
    logger.info(`Top result: ${topResults[0].hsCode} (confidence: ${topResults[0].confidence}%)`);
  }

  return topResults;
}

/**
 * Generate human-readable reasoning from matched rule
 *
 * @param rule - Matched decision rule
 * @param answers - User's questionnaire answers
 * @param _keywords - Product keywords (unused for now)
 * @returns Reasoning string
 */
function generateReasoningFromRule(
  rule: DecisionRule,
  answers: QuestionnaireAnswers,
  _keywords: string[]
): string {
  const reasons: string[] = [];

  // Analyze conditions to build reasoning
  for (const [key, value] of Object.entries(rule.conditions)) {
    if (key === 'keywords') {
      const kws = Array.isArray(value) ? value : [value];
      reasons.push(`Product contains keywords: ${kws.join(', ')}`);
    } else if (key.startsWith('q')) {
      // Question ID
      const answer = answers[key];
      reasons.push(`${key} = "${answer}"`);
    } else if (key === 'q6_material') {
      reasons.push(`Primary material: ${value}`);
    }
  }

  // Add confidence boost explanation
  if (rule.confidenceBoost >= 90) {
    reasons.push('High-confidence rule match');
  } else if (rule.confidenceBoost >= 80) {
    reasons.push('Strong rule match');
  }

  const reasoningText = reasons.length > 0
    ? `Decision tree classification based on: ${reasons.join('; ')}.`
    : `Classification based on ${Object.keys(rule.conditions).length} matching conditions.`;

  return reasoningText;
}

/**
 * Detect product category from description (for initial classification)
 *
 * @param productDescription - Product description text
 * @returns Detected category name
 *
 * Uses simple keyword matching for MVP phase.
 * Can be enhanced with AI-based category detection in Phase 2+.
 *
 * Automotive keywords cover:
 * - Braking systems, Engine components, Filtration, Electrical/Lighting
 * - Suspension, Transmission, Exhaust, Cooling, Bearings
 * - Vehicles: car, motorcycle, truck, SUV
 */
export async function detectCategory(productDescription: string): Promise<string> {
  logger.debug('Detecting product category');
  logger.debug(`Description: "${productDescription.substring(0, 100)}..."`);

  const lowerDesc = productDescription.toLowerCase();

  // Comprehensive automotive parts keywords (covers all 20 test products)
  const automotiveKeywords = [
    // Braking system
    'brake', 'braking', 'rotor', 'caliper', 'pad', 'disc',
    // Engine components
    'engine', 'piston', 'cylinder', 'spark', 'plug', 'fuel', 'pump',
    'crankshaft', 'camshaft', 'valve', 'gasket',
    // Filtration
    'filter', 'air filter', 'oil filter', 'fuel filter',
    // Electrical/Lighting
    'headlight', 'lamp', 'bulb', 'wiper', 'alternator', 'generator',
    'battery', 'starter', 'electrical',
    // Suspension
    'suspension', 'shock', 'absorber', 'strut', 'spring',
    // Transmission & Clutch
    'transmission', 'clutch', 'gearbox', 'drivetrain', 'axle',
    // Exhaust
    'exhaust', 'muffler', 'catalytic', 'silencer',
    // Cooling system
    'radiator', 'coolant', 'antifreeze', 'thermostat', 'hose',
    // Bearings & Rotation
    'bearing', 'wheel bearing', 'hub',
    // Rubber/Belt components
    'timing belt', 'serpentine', 'v-belt', 'cv joint', 'boot',
    // Vehicle types
    'vehicle', 'car', 'automobile', 'motorcycle', 'bike', 'truck', 'suv',
    'automotive', 'auto parts'
  ];

  // Check if description contains any automotive keyword
  const hasAutomotiveKeyword = automotiveKeywords.some(keyword =>
    lowerDesc.includes(keyword)
  );

  if (hasAutomotiveKeyword) {
    logger.info('Category detected: Automotive Parts');
    return 'Automotive Parts';
  }

  // Default fallback for non-automotive products
  logger.info('Category detected: General (no automotive keywords found)');
  return 'General';
}

/**
 * LLM Conversational Classifier Service
 *
 * A SIMPLIFIED classifier that uses LLM to navigate the HS code hierarchy.
 * NO HARDCODED PRODUCT LISTS. All decisions made by LLM.
 *
 * Flow:
 * 1. User provides product description
 * 2. LLM navigates hierarchy level by level
 * 3. At each level: LLM either selects (if confident) or asks question (if uncertain)
 * 4. Continue until reaching a leaf code (final classification)
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import {
  navigateWithAutoContinue,
  forceClassification,
  NavigationResult,
  NavigationHistory,
  validateCode
} from './llm-navigator.service';
// PHASE 3: Import elimination service for extracting modifiers from answers
import { extractModifiersFromAnswer, extractModifiersFromText } from './elimination.service';
// INTELLIGENT CLASSIFICATION: Import attribute-based classifier for smart auto-classification
import {
  classifyByAttributes,
  extractAttributes,
  analyzeCompleteness,
  ProductAttributes,
  AttributeClassificationResult,
  // PHASE 3: Additional imports for attribute answer handling
  generateAttributeQuestion,
  processAttributeAnswerFromLabel,
  // PHASE 5.1: Import helper functions for early single-match detection
  determineCurrentCode,
  getChildrenFromDatabase,
  filterCodesByAllAttributes
} from './attribute-classifier.service';

// ========================================
// PHASE 5.2: Alternative Codes Quality Fix
// Generic functions to filter out "Other" catch-all codes
// ========================================

/**
 * Checks if an HS code is a "catch-all" or "Other" code.
 * These are codes that represent unspecified categories.
 *
 * GENERIC - works for ANY HS code based on patterns.
 */
function isCatchAllCode(code: string, description?: string): boolean {
  // Pattern 1: Check description for "Other"
  if (description) {
    const descLower = description.toLowerCase().trim();
    if (descLower === 'other' || descLower === '- other' || descLower === '-- other') {
      return true;
    }
    // Also catch "Other <something>" or "<something>: Other"
    if (descLower.startsWith('other ') || descLower.endsWith(': other')) {
      return true;
    }
  }

  // Pattern 2: Check code ending patterns
  // Get the last segment of the code (after last dot)
  const parts = code.split('.');
  const lastPart = parts[parts.length - 1];

  // Codes ending in 90 or 99 are typically "Other" categories
  if (lastPart === '90' || lastPart === '99') {
    return true;
  }

  // Codes ending in 9 at subgroup level (e.g., .19, .29, .39, .49)
  // These are "Other" within a subgroup
  if (lastPart && lastPart.length === 2 && lastPart.endsWith('9')) {
    // .09, .19, .29, .39, .49, .59, .69, .79, .89
    return true;
  }

  // Pattern 3: Check for "unspecified" or "n.e.s." (not elsewhere specified)
  if (description) {
    const descLower = description.toLowerCase();
    if (descLower.includes('n.e.s') || descLower.includes('not elsewhere specified')) {
      return true;
    }
    if (descLower.includes('unspecified') || descLower.includes('not specified')) {
      return true;
    }
  }

  return false;
}

/**
 * Determines why this code is shown as an alternative.
 * Helps users understand the difference.
 */
function determineAlternativeReason(
  selectedCode: string,
  altCode: string,
  altDescription: string
): string {
  const descLower = altDescription.toLowerCase();

  // Check for grade difference
  const gradeMatch = descLower.match(/([abc]|ab|pb|b\/b\/b)\s*grade/i);
  if (gradeMatch && gradeMatch[1]) {
    return `Different grade (${gradeMatch[1].toUpperCase()})`;
  }

  // Check for processing method difference
  if (descLower.includes('plantation')) return 'Plantation processing';
  if (descLower.includes('cherry')) return 'Cherry processing';
  if (descLower.includes('parchment')) return 'Parchment processing';

  // Check for variety difference
  if (descLower.includes('arabica')) return 'Arabica variety';
  if (descLower.includes('robusta') || descLower.includes('rob ')) return 'Robusta variety';

  // Check for form difference
  if (descLower.includes('roasted')) return 'Roasted coffee';
  if (descLower.includes('decaffeinated')) return 'Decaffeinated';
  if (descLower.includes('instant') || descLower.includes('soluble')) return 'Instant/soluble form';
  if (descLower.includes('ground')) return 'Ground coffee';

  // Check for state/condition
  if (descLower.includes('not roasted')) return 'Not roasted';
  if (descLower.includes('not decaffeinated')) return 'Not decaffeinated';

  // Generic fallback
  return 'Similar product category';
}

/**
 * Filters alternative codes to remove catch-alls and improve quality.
 * Returns up to maxCount meaningful alternatives with reasons.
 */
function filterAlternativeCodes(
  alternatives: Array<{code: string, description: string}>,
  selectedCode: string,
  maxCount: number = 3
): Array<{code: string, description: string, reason: string}> {

  // Step 1: Remove catch-all codes
  const meaningful = alternatives.filter(alt => {
    if (isCatchAllCode(alt.code, alt.description)) {
      logger.info(`[ALT-FILTER] Excluding catch-all: ${alt.code} (${alt.description})`);
      return false;
    }
    return true;
  });

  logger.info(`[ALT-FILTER] After removing catch-alls: ${meaningful.length} alternatives remain`);

  // Step 2: Sort by relevance (codes closer in number are more relevant)
  const selectedNum = parseInt(selectedCode.replace(/\./g, ''));
  meaningful.sort((a, b) => {
    const aNum = parseInt(a.code.replace(/\./g, ''));
    const bNum = parseInt(b.code.replace(/\./g, ''));
    return Math.abs(aNum - selectedNum) - Math.abs(bNum - selectedNum);
  });

  // Step 3: Add reason for each alternative
  const withReasons = meaningful.slice(0, maxCount).map(alt => {
    const reason = determineAlternativeReason(selectedCode, alt.code, alt.description);
    return {
      code: alt.code,
      description: alt.description,
      reason
    };
  });

  logger.info(`[PHASE 5.2] Returning ${withReasons.length} quality alternatives for ${selectedCode}`);

  return withReasons;
}

// ========================================
// Types
// ========================================

export interface LLMClassifyRequest {
  sessionId: string;
  productDescription?: string;
  conversationId?: string;
  answers?: Record<string, string>; // questionId -> selected code
}

export interface LLMClassifyResponse {
  success: boolean;
  conversationId: string;
  responseType: 'questions' | 'classification' | 'error';

  // Explicit round number for frontend deduplication
  roundNumber?: number;

  // If responseType === 'questions' (matches frontend format)
  questions?: Array<{
    id: string;
    text: string;
    options: string[];  // Frontend expects string array, not objects
    allowOther: boolean;
    priority: 'required' | 'optional';
  }>;
  questionContext?: string;

  // Keep internal question data for answer processing
  _questionData?: Array<{
    code: string;
    label: string;
    description: string;
  }>;

  // If responseType === 'classification'
  result?: {
    hsCode: string;
    description: string;
    confidence: number;
    reasoning: string;
    // PHASE 5.2: Added optional reason field for alternative codes
    alternatives: Array<{ code: string; description: string; reason?: string }>;
    clarificationImpact: string;
  };

  // Conversation summary
  conversationSummary?: {
    totalRounds: number;
    questionsAsked: number;
    answersProvided: number;
    durationMs: number;
    history: Array<{
      turn: number;
      type: 'question' | 'classification';
      content: string;
      timestamp: string;
    }>;
  };

  error?: string;
  timestamp: string;
}

// Track user decisions for better reasoning
interface UserDecision {
  questionText: string;
  selectedOption: { code: string; label: string };
  alternatives: Array<{ code: string; label: string }>;
}

// Navigation state interface with PHASE 3 attribute tracking
interface NavigationState {
  productDescription: string;
  currentCode: string | null;
  history: NavigationHistory[];
  pendingQuestionId: string | null;
  pendingQuestionOptions?: Array<{ code: string; label: string; description: string }>;
  pendingQuestionText?: string;
  userDecisions: UserDecision[];
  // PHASE 3: Track accumulated modifiers from original query and user answers
  accumulatedModifiers: string[];
  // PHASE 3: Track if pending question is an attribute question
  pendingQuestionType?: 'attribute' | 'hierarchy';
  // PHASE 3: Store extracted attributes for continuation
  _extractedAttributes?: ProductAttributes;
  // PHASE 3: Track which attribute we're asking about
  _pendingAttributeKey?: string;
}

// In-memory cache for conversation navigation state
const navigationStateCache = new Map<string, NavigationState>();

// ========================================
// Main Classification Function
// ========================================

/**
 * Main entry point for LLM-based conversational classification
 */
export async function classifyWithLLMNavigator(
  request: LLMClassifyRequest
): Promise<LLMClassifyResponse> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!request.sessionId?.trim()) {
      return createErrorResponse('Session ID is required');
    }

    // New conversation or continuing?
    if (request.conversationId && request.answers) {
      return await continueConversation(request, startTime);
    } else {
      if (!request.productDescription?.trim()) {
        return createErrorResponse('Product description is required');
      }
      return await startNewConversation(request, startTime);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[LLM-CLASSIFIER] Error: ${errorMsg}`);
    return createErrorResponse(errorMsg);
  }
}

// ========================================
// New Conversation
// ========================================

async function startNewConversation(
  request: LLMClassifyRequest,
  startTime: number
): Promise<LLMClassifyResponse> {
  logger.info(`[LLM-CLASSIFIER] Starting new conversation for: "${request.productDescription!.substring(0, 50)}..."`);

  // Create conversation record
  const conversation = await prisma.classificationConversation.create({
    data: {
      sessionId: request.sessionId,
      productDescription: request.productDescription!,
      status: 'active',
      enhancedQuery: request.productDescription!
    }
  });

  // PHASE 3: Extract initial modifiers from the product description
  const initialModifiers = extractModifiersFromText(request.productDescription!);
  logger.info(`[LLM-CLASSIFIER] Initial modifiers: [${initialModifiers.join(', ')}]`);

  // ========================================
  // INTELLIGENT CLASSIFICATION: Try attribute-based classification FIRST
  // This handles complete descriptions like "Arabica coffee grade A not roasted not decaffeinated"
  // ========================================
  logger.info(`[INTELLIGENT] Attempting attribute-based classification...`);
  const attrResult = await classifyByAttributes(request.productDescription!);

  // Case 1: AUTO-CLASSIFY - All attributes known, no questions needed!
  if (attrResult.type === 'auto-classify' && attrResult.code) {
    logger.info(`[INTELLIGENT] AUTO-CLASSIFIED: ${attrResult.code} (${attrResult.confidence}%)`);

    // Store the turn
    await prisma.conversationTurn.create({
      data: {
        conversationId: conversation.id,
        turnNumber: 1,
        responseType: 'classification',
        hsCode: attrResult.code,
        hsDescription: attrResult.description,
        confidence: attrResult.confidence,
        reasoning: attrResult.reasoning,
        llmModel: 'attribute-classifier',
        responseTimeMs: Date.now() - startTime
      }
    });

    // Mark conversation as completed
    await prisma.classificationConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'completed',
        finalHsCode: attrResult.code,
        finalConfidence: attrResult.confidence,
        finalReasoning: attrResult.reasoning,
        finalDescription: attrResult.description,
        completedAt: new Date(),
        totalRounds: 1,
        totalQuestions: 0
      }
    });

    // Get alternatives (sibling codes)
    const alternatives = await getAttributeAlternatives(attrResult.code);

    return {
      success: true,
      conversationId: conversation.id,
      responseType: 'classification',
      result: {
        hsCode: attrResult.code,
        description: attrResult.description || '',
        confidence: attrResult.confidence || 92,
        reasoning: attrResult.reasoning || 'Classified by attribute analysis',
        alternatives,
        clarificationImpact: 'Direct classification - all attributes were provided in the description.'
      },
      conversationSummary: {
        totalRounds: 1,
        questionsAsked: 0,
        answersProvided: 0,
        durationMs: Date.now() - startTime,
        history: [{
          turn: 1,
          type: 'classification',
          content: `${attrResult.code} - ${attrResult.description}`,
          timestamp: new Date().toISOString()
        }]
      },
      timestamp: new Date().toISOString()
    };
  }

  // Case 2: QUESTION - Missing attribute, ask targeted question
  if (attrResult.type === 'question' && attrResult.question) {
    logger.info(`[INTELLIGENT] TARGETED QUESTION: ${attrResult.question.text}`);

    // Store the question turn
    await prisma.conversationTurn.create({
      data: {
        conversationId: conversation.id,
        turnNumber: 1,
        responseType: 'question',
        questionContext: `Missing attribute: ${attrResult.question.attribute}`,
        questions: [{
          id: attrResult.question.id,
          text: attrResult.question.text,
          options: attrResult.question.options.map(o => o.label),
          allowOther: true,
          priority: 'required'
        }] as any,
        llmModel: 'attribute-classifier',
        responseTimeMs: Date.now() - startTime
      }
    });

    // Update conversation
    await prisma.classificationConversation.update({
      where: { id: conversation.id },
      data: {
        totalQuestions: 1,
        totalRounds: 1
      }
    });

    // Initialize navigation state with extracted attributes
    // PHASE 3: Properly track attribute question state
    const extractedAttrs = extractAttributes(request.productDescription!);
    navigationStateCache.set(conversation.id, {
      productDescription: request.productDescription!,
      currentCode: null,
      history: [],
      pendingQuestionId: attrResult.question.id,
      pendingQuestionText: attrResult.question.text,
      pendingQuestionOptions: attrResult.question.options,
      userDecisions: [],
      accumulatedModifiers: initialModifiers,
      // PHASE 3: Mark this as an attribute question
      pendingQuestionType: 'attribute',
      // PHASE 3: Store extracted attributes for continuation
      _extractedAttributes: extractedAttrs,
      // PHASE 3: Track which attribute we're asking about
      _pendingAttributeKey: attrResult.question.attribute
    });

    // Convert options to frontend format
    const questionOptions = attrResult.question.options.map(opt =>
      `${opt.code}::${opt.label}`
    );

    return {
      success: true,
      conversationId: conversation.id,
      responseType: 'questions',
      roundNumber: 1,
      questions: [{
        id: attrResult.question.id,
        text: attrResult.question.text,
        options: questionOptions,
        allowOther: true,
        priority: 'required' as const
      }],
      questionContext: `To accurately classify your ${extractedAttrs.baseProduct || 'product'}, we need this information.`,
      _questionData: attrResult.question.options,
      conversationSummary: {
        totalRounds: 1,
        questionsAsked: 1,
        answersProvided: 0,
        durationMs: Date.now() - startTime,
        history: [{
          turn: 1,
          type: 'question',
          content: attrResult.question.text,
          timestamp: new Date().toISOString()
        }]
      },
      timestamp: new Date().toISOString()
    };
  }

  // Case 3: DELEGATE - Fall back to LLM navigator
  logger.info(`[INTELLIGENT] Delegating to LLM navigator: ${attrResult.delegateReason}`);

  // Initialize navigation state
  navigationStateCache.set(conversation.id, {
    productDescription: request.productDescription!,
    currentCode: null,
    history: [],
    pendingQuestionId: null,
    userDecisions: [],
    // PHASE 3: Start with modifiers extracted from the original query
    accumulatedModifiers: initialModifiers
  });

  // Start navigation from root
  // PHASE 2 FIX: Pass initial modifiers extracted from the product description
  logger.info(`[PHASE 2 FIX] Starting navigation with ${initialModifiers.length} initial modifiers: [${initialModifiers.join(', ')}]`);
  const result = await navigateWithAutoContinue(
    request.productDescription!,
    null,
    [],
    initialModifiers  // PHASE 2 FIX: Pass initial modifiers extracted from product description
  );

  return await processNavigationResult(
    conversation.id,
    result,
    startTime,
    1
  );
}

/**
 * Get alternative codes for attribute-based classification
 * Returns sibling codes from the same parent
 * PHASE 5.2: Now filters out catch-all codes and adds reasons
 */
async function getAttributeAlternatives(code: string): Promise<Array<{ code: string; description: string; reason?: string }>> {
  try {
    // Get parent code
    const hierarchy = await prisma.hsCodeHierarchy.findUnique({
      where: { code },
      select: { parentCode: true }
    });

    if (!hierarchy?.parentCode) {
      return [];
    }

    // Get siblings
    const parentHierarchy = await prisma.hsCodeHierarchy.findUnique({
      where: { code: hierarchy.parentCode },
      select: { childrenCodes: true }
    });

    if (!parentHierarchy?.childrenCodes) {
      return [];
    }

    // Get sibling codes (exclude the selected one)
    const siblingCodes = parentHierarchy.childrenCodes.filter(c => c !== code);

    // Get descriptions
    const siblings = await prisma.hsCode.findMany({
      where: { code: { in: siblingCodes } },
      select: { code: true, description: true }
    });

    // ============================================
    // PHASE 5.2: FILTER OUT CATCH-ALL CODES
    // ============================================
    const filteredAlternatives = filterAlternativeCodes(siblings, code, 3);

    logger.info(`[PHASE 5.2] getAttributeAlternatives: Returning ${filteredAlternatives.length} quality alternatives for ${code}`);

    return filteredAlternatives;
  } catch (error) {
    logger.error(`[PHASE 5.2] Error getting alternatives: ${error}`);
    return [];
  }
}

// ========================================
// Continue Conversation
// ========================================

// ========================================
// PHASE 3: Handle Attribute Answer
// ========================================

/**
 * Handle an answer to an attribute question
 * Re-calls the attribute classifier with updated attributes
 */
async function handleAttributeAnswer(
  conversationId: string,
  state: NavigationState,
  answers: Record<string, string>,
  startTime: number
): Promise<LLMClassifyResponse> {
  logger.info(`[FLOW] === handleAttributeAnswer CALLED ===`);
  logger.info(`[PHASE 4.5] === ATTRIBUTE ANSWER FLOW ===`);

  // Get the answer (format: "option_X::Label" or just "option_X")
  const answerKey = Object.keys(answers)[0] || '';
  const answerValue = answers[answerKey] || '';

  logger.info(`[PHASE 3] Answer: ${answerValue}`);
  logger.info(`[PHASE 3] Current attributes: ${JSON.stringify(state._extractedAttributes)}`);
  logger.info(`[PHASE 3] Pending attribute key: ${state._pendingAttributeKey}`);

  // Parse the answer to extract the option index and label
  const [optionId, labelPart] = answerValue.includes('::')
    ? [answerValue.split('::')[0]?.trim() ?? '', answerValue.split('::')[1]?.trim() ?? '']
    : [answerValue, ''];

  // Find the selected option from pending options
  let selectedLabel = labelPart;
  if (!selectedLabel && state.pendingQuestionOptions) {
    // Try to find by matching option index
    const optionIndex = optionId.replace('option_', '');
    const idx = parseInt(optionIndex, 10);
    if (!isNaN(idx) && state.pendingQuestionOptions[idx]) {
      selectedLabel = state.pendingQuestionOptions[idx].label;
    } else {
      // Try to find by code match
      const matchedOption = state.pendingQuestionOptions.find(opt => opt.code === optionId);
      if (matchedOption) {
        selectedLabel = matchedOption.label;
      }
    }
  }

  logger.info(`[PHASE 3] Selected option: ${optionId}, Label: "${selectedLabel}"`);

  // Update attributes using processAttributeAnswerFromLabel
  const currentAttrs = state._extractedAttributes || extractAttributes(state.productDescription);
  const attributeKey = state._pendingAttributeKey || '';

  const updatedAttributes = processAttributeAnswerFromLabel(
    currentAttrs,
    attributeKey,
    selectedLabel
  );

  logger.info(`[PHASE 4.5] Updated attributes: ${JSON.stringify(updatedAttributes)}`);

  // ============================================
  // PHASE 5.1: EARLY SINGLE-MATCH CHECK
  // Check if only ONE code matches ALL known attributes BEFORE calling analyzeCompleteness
  // This provides faster auto-classification when possible
  // ============================================

  logger.info(`[PHASE 5.1] Starting early single-match check...`);

  // Get current position in hierarchy based on known attributes
  const currentCode = await determineCurrentCode(updatedAttributes);

  if (currentCode) {
    logger.info(`[PHASE 5.1] Current position in hierarchy: ${currentCode}`);

    // Get children of current code
    const children = await getChildrenFromDatabase(currentCode);
    logger.info(`[PHASE 5.1] Found ${children.length} children at ${currentCode}`);

    if (children.length > 0) {
      // Filter children by ALL known attributes
      const matchingChildren = filterCodesByAllAttributes(children, updatedAttributes);

      logger.info(`[PHASE 5.1] Early check: ${matchingChildren.length} codes match after answer`);

      // If only ONE code matches -> AUTO-CLASSIFY IMMEDIATELY!
      if (matchingChildren.length === 1) {
        const match = matchingChildren[0];

        if (match) {
          // Check if it's a leaf (no children)
          const matchChildren = await getChildrenFromDatabase(match.code);

          if (matchChildren.length === 0) {
            // SINGLE MATCH LEAF - AUTO-CLASSIFY NOW!
            logger.info(`[PHASE 5.1] EARLY AUTO-CLASSIFY to ${match.code}`);

            // Get conversation for turn tracking
            const earlyConversation = await prisma.classificationConversation.findUnique({
              where: { id: conversationId },
              include: { turns: { orderBy: { turnNumber: 'desc' }, take: 1 } }
            });

            if (earlyConversation) {
              const earlyTurnNumber = (earlyConversation.turns[0]?.turnNumber || 0) + 1;

              // Store the answer in the turn record
              const earlyLastTurn = earlyConversation.turns[0];
              if (earlyLastTurn) {
                await prisma.conversationTurn.update({
                  where: { id: earlyLastTurn.id },
                  data: {
                    userAnswers: answers as any,
                    answeredAt: new Date()
                  }
                });
              }

              // Store classification turn
              await prisma.conversationTurn.create({
                data: {
                  conversationId,
                  turnNumber: earlyTurnNumber,
                  responseType: 'classification',
                  hsCode: match.code,
                  hsDescription: match.description,
                  confidence: 92,
                  reasoning: `Single-match auto-classification after PHASE 5.1 early check`,
                  llmModel: 'attribute-classifier',
                  responseTimeMs: Date.now() - startTime
                }
              });

              // Mark conversation as completed
              await prisma.classificationConversation.update({
                where: { id: conversationId },
                data: {
                  status: 'completed',
                  finalHsCode: match.code,
                  finalConfidence: 92,
                  finalReasoning: 'Single-match auto-classification',
                  finalDescription: match.description,
                  completedAt: new Date(),
                  totalRounds: earlyTurnNumber
                }
              });

              // Clear cache
              navigationStateCache.delete(conversationId);

              // Get alternatives (sibling codes)
              const earlyAlternatives = await getAttributeAlternatives(match.code);

              // Build conversation summary
              const earlySummary = await buildConversationSummary(conversationId, startTime);

              return {
                success: true,
                conversationId,
                responseType: 'classification',
                result: {
                  hsCode: match.code,
                  description: match.description,
                  confidence: 92,
                  reasoning: 'Single-match auto-classification - all attributes identified a unique code',
                  alternatives: earlyAlternatives,
                  clarificationImpact: `Classification determined after ${earlySummary?.questionsAsked || 1} clarifying question(s) via PHASE 5.1 early detection.`
                },
                conversationSummary: earlySummary,
                timestamp: new Date().toISOString()
              };
            }
          } else {
            logger.info(`[PHASE 5.1] Single match ${match.code} has ${matchChildren.length} children, continuing to analyzeCompleteness`);
          }
        }
      }
    }
  } else {
    logger.info(`[PHASE 5.1] Could not determine current code from attributes, skipping early check`);
  }

  // ============================================
  // END PHASE 5.1 EARLY CHECK
  // ============================================

  // Re-check completeness with updated attributes
  logger.info(`[PHASE 4.5] Calling analyzeCompleteness...`);
  const completenessResult = await analyzeCompleteness(updatedAttributes);

  logger.info(`[PHASE 4.5] Completeness result:`);
  logger.info(`[PHASE 4.5]   isComplete: ${completenessResult.isComplete}`);
  logger.info(`[PHASE 4.5]   suggestedCode: ${completenessResult.suggestedCode}`);
  logger.info(`[PHASE 4.5]   missingAttributes: [${completenessResult.missingAttributes.join(', ')}]`);
  logger.info(`[PHASE 4.5]   nextQuestion: ${completenessResult.nextQuestion ? completenessResult.nextQuestion.questionText : 'null'}`);
  logger.info(`[PHASE 4.5]   confidence: ${completenessResult.confidence}`);

  // Get conversation from database for turn tracking
  const conversation = await prisma.classificationConversation.findUnique({
    where: { id: conversationId },
    include: { turns: { orderBy: { turnNumber: 'desc' }, take: 1 } }
  });

  if (!conversation) {
    return createErrorResponse('Conversation not found');
  }

  const turnNumber = (conversation.turns[0]?.turnNumber || 0) + 1;

  // Store the answer in the turn record
  const lastTurn = conversation.turns[0];
  if (lastTurn) {
    await prisma.conversationTurn.update({
      where: { id: lastTurn.id },
      data: {
        userAnswers: answers as any,
        answeredAt: new Date()
      }
    });
  }

  // CASE 1: All attributes known - AUTO-CLASSIFY!
  if (completenessResult.isComplete && completenessResult.suggestedCode) {
    logger.info(`[PHASE 4.5] CASE 1 TRIGGERED: AUTO-CLASSIFYING to ${completenessResult.suggestedCode}`);

    // Get code description
    const codeInfo = await prisma.hsCode.findUnique({
      where: { code: completenessResult.suggestedCode },
      select: { code: true, description: true }
    });

    // Store classification turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'classification',
        hsCode: completenessResult.suggestedCode,
        hsDescription: codeInfo?.description || completenessResult.reasoning,
        confidence: completenessResult.confidence,
        reasoning: completenessResult.reasoning,
        llmModel: 'attribute-classifier',
        responseTimeMs: Date.now() - startTime
      }
    });

    // Mark conversation as completed
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        status: 'completed',
        finalHsCode: completenessResult.suggestedCode,
        finalConfidence: completenessResult.confidence,
        finalReasoning: completenessResult.reasoning,
        finalDescription: codeInfo?.description,
        completedAt: new Date(),
        totalRounds: turnNumber
      }
    });

    // Clear cache
    navigationStateCache.delete(conversationId);

    // Get alternatives (sibling codes)
    const alternatives = await getAttributeAlternatives(completenessResult.suggestedCode);

    // Build conversation summary
    const summary = await buildConversationSummary(conversationId, startTime);

    return {
      success: true,
      conversationId,
      responseType: 'classification',
      result: {
        hsCode: completenessResult.suggestedCode,
        description: codeInfo?.description || '',
        confidence: completenessResult.confidence || 92,
        reasoning: completenessResult.reasoning || 'Classified by attribute analysis',
        alternatives,
        clarificationImpact: `Classification determined after ${summary?.questionsAsked || 1} clarifying question(s).`
      },
      conversationSummary: summary,
      timestamp: new Date().toISOString()
    };
  }

  // CASE 2: Still missing attributes WITH nextQuestion - ask next attribute question
  if (completenessResult.missingAttributes.length > 0 && completenessResult.nextQuestion) {
    logger.info(`[PHASE 4.5] CASE 2: Has nextQuestion for missing attributes: ${completenessResult.missingAttributes.join(', ')}`);

    const nextAttrKey = completenessResult.nextQuestion.attribute;
    const nextQuestion = generateAttributeQuestion(updatedAttributes, nextAttrKey);

    // Store the question turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'question',
        questionContext: `Missing attribute: ${nextAttrKey}`,
        questions: [{
          id: `attr_${nextAttrKey}_${Date.now()}`,
          text: nextQuestion.text,
          options: nextQuestion.options.map(o => o.label),
          allowOther: true,
          priority: 'required'
        }] as any,
        llmModel: 'attribute-classifier',
        responseTimeMs: Date.now() - startTime
      }
    });

    // Update conversation question count
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        totalQuestions: { increment: 1 },
        totalRounds: turnNumber
      }
    });

    // Update state with new attributes and pending question
    navigationStateCache.set(conversationId, {
      ...state,
      _extractedAttributes: updatedAttributes,
      _pendingAttributeKey: nextAttrKey,
      pendingQuestionType: 'attribute',
      pendingQuestionOptions: nextQuestion.options,
      pendingQuestionText: nextQuestion.text,
      pendingQuestionId: `attr_${nextAttrKey}_${Date.now()}`
    });

    // Build conversation summary
    const summary = await buildConversationSummary(conversationId, startTime);

    // Convert options to frontend format
    const questionOptions = nextQuestion.options.map(opt =>
      `${opt.code}::${opt.label}`
    );

    return {
      success: true,
      conversationId,
      responseType: 'questions',
      roundNumber: turnNumber,
      questions: [{
        id: `attr_${nextAttrKey}_${Date.now()}`,
        text: nextQuestion.text,
        options: questionOptions,
        allowOther: true,
        priority: 'required' as const
      }],
      questionContext: `To accurately classify your ${updatedAttributes.baseProduct || 'product'}, we need this information.`,
      _questionData: nextQuestion.options,
      conversationSummary: summary,
      timestamp: new Date().toISOString()
    };
  }

  // ========================================
  // PHASE 4.5 FIX: CASE 2.5 - Has missing attributes but NO nextQuestion
  // This is the root cause of the infinite loop!
  // Generate a question ourselves instead of delegating to navigator
  // ========================================
  if (completenessResult.missingAttributes && completenessResult.missingAttributes.length > 0) {
    const missingAttr = completenessResult.missingAttributes[0] || 'grade';
    logger.info(`[PHASE 4.5] CASE 2.5: Missing attribute WITHOUT nextQuestion: ${missingAttr}`);
    logger.info(`[PHASE 4.5] Generating question for missing attribute instead of delegating to navigator`);

    // Generate a question for the missing attribute
    const nextQuestion = generateAttributeQuestion(updatedAttributes, missingAttr);

    // Check if we're asking the same question again (loop prevention)
    if (state._pendingAttributeKey === missingAttr) {
      logger.warn(`[PHASE 4.5] LOOP DETECTED: Same attribute being asked again: ${missingAttr}`);
      logger.info(`[PHASE 4.5] Breaking loop by using scoring fallback or delegating`);
      // Fall through to CASE 3 to break the loop
    } else {
      // Store the question turn
      await prisma.conversationTurn.create({
        data: {
          conversationId,
          turnNumber,
          responseType: 'question',
          questionContext: `Missing attribute (generated): ${missingAttr}`,
          questions: [{
            id: `attr_${missingAttr}_${Date.now()}`,
            text: nextQuestion.text,
            options: nextQuestion.options.map(o => o.label),
            allowOther: true,
            priority: 'required'
          }] as any,
          llmModel: 'attribute-classifier',
          responseTimeMs: Date.now() - startTime
        }
      });

      // Update conversation question count
      await prisma.classificationConversation.update({
        where: { id: conversationId },
        data: {
          totalQuestions: { increment: 1 },
          totalRounds: turnNumber
        }
      });

      // Update state with new attributes and pending question - STAY IN ATTRIBUTE MODE
      navigationStateCache.set(conversationId, {
        ...state,
        _extractedAttributes: updatedAttributes,
        _pendingAttributeKey: missingAttr,
        pendingQuestionType: 'attribute',  // IMPORTANT: Stay in attribute mode!
        pendingQuestionOptions: nextQuestion.options,
        pendingQuestionText: nextQuestion.text,
        pendingQuestionId: `attr_${missingAttr}_${Date.now()}`
      });

      // Build conversation summary
      const summary = await buildConversationSummary(conversationId, startTime);

      // Convert options to frontend format
      const questionOptions = nextQuestion.options.map(opt =>
        `${opt.code}::${opt.label}`
      );

      return {
        success: true,
        conversationId,
        responseType: 'questions',
        roundNumber: turnNumber,
        questions: [{
          id: `attr_${missingAttr}_${Date.now()}`,
          text: nextQuestion.text,
          options: questionOptions,
          allowOther: true,
          priority: 'required' as const
        }],
        questionContext: `To accurately classify your ${updatedAttributes.baseProduct || 'product'}, we need this information.`,
        _questionData: nextQuestion.options,
        conversationSummary: summary,
        timestamp: new Date().toISOString()
      };
    }
  }

  // CASE 3: Attribute classifier can't continue - delegate to navigator
  logger.warn(`[PHASE 4.5] CASE 3 TRIGGERED: Attribute classifier can't continue - delegating to navigator`);
  logger.info(`[PHASE 4.5] This should rarely happen after PHASE 4.5 fixes`);

  // Clear attribute state, switch to hierarchy
  navigationStateCache.set(conversationId, {
    ...state,
    pendingQuestionType: 'hierarchy',
    _extractedAttributes: undefined,
    _pendingAttributeKey: undefined
  });

  // Continue with navigator
  const result = await navigateWithAutoContinue(
    state.productDescription,
    state.currentCode,
    state.history,
    state.accumulatedModifiers || []
  );

  return await processNavigationResult(
    conversationId,
    result,
    startTime,
    turnNumber,
    state.userDecisions
  );
}

// ========================================
// Constants for Loop Prevention
// ========================================
const MAX_QUESTIONS_LIMIT = 7; // Safety limit to prevent infinite loops

/**
 * Force classification when max questions limit is reached
 * This ensures the conversation completes even if we haven't reached a leaf code
 */
async function forceClassificationFromState(
  conversationId: string,
  conversation: any,
  startTime: number
): Promise<LLMClassifyResponse> {
  logger.info(`[LLM-CLASSIFIER] Forcing classification for conversation: ${conversationId}`);

  // Get navigation state from cache or reconstruct
  let state = navigationStateCache.get(conversationId);

  if (!state) {
    // Reconstruct minimal state from database
    const allTurns = await prisma.conversationTurn.findMany({
      where: { conversationId },
      orderBy: { turnNumber: 'asc' }
    });

    let currentCode: string | null = null;
    const history: NavigationHistory[] = [];

    for (const turn of allTurns) {
      if (turn.userAnswers) {
        const userAnswers = turn.userAnswers as Record<string, string>;
        for (const [_questionId, selectedAnswer] of Object.entries(userAnswers)) {
          if (selectedAnswer) {
            let code = selectedAnswer;
            if (selectedAnswer.includes('::')) {
              code = selectedAnswer.split('::')[0]?.trim() ?? selectedAnswer;
            } else if (selectedAnswer.includes(':')) {
              code = selectedAnswer.split(':')[0]?.trim() ?? selectedAnswer;
            }

            const codeDetails = await validateCode(code);
            if (codeDetails) {
              history.push({
                code,
                description: codeDetails.description,
                level: history.length + 1
              });
              currentCode = code;
            }
          }
        }
      }
    }

    state = {
      productDescription: conversation.productDescription,
      currentCode,
      history,
      pendingQuestionId: null,
      userDecisions: [],
      accumulatedModifiers: extractModifiersFromText(conversation.productDescription)
    };
  }

  // Use forceClassification from navigator service
  const result = await forceClassification(
    state.productDescription,
    state.currentCode,
    state.history
  );

  const turnNumber = (conversation.totalRounds || 0) + 1;

  // Process the result through the standard handler
  return await processNavigationResult(
    conversationId,
    result,
    startTime,
    turnNumber,
    state.userDecisions
  );
}

async function continueConversation(
  request: LLMClassifyRequest,
  startTime: number
): Promise<LLMClassifyResponse> {
  const { conversationId, answers } = request;

  logger.info(`[FLOW] === continueConversation CALLED ===`);
  logger.info(`[FLOW] Conversation ID: ${conversationId}`);
  logger.info(`[FLOW] Answers received: ${JSON.stringify(answers)}`);

  // Get conversation from database
  const conversation = await prisma.classificationConversation.findUnique({
    where: { id: conversationId },
    include: { turns: { orderBy: { turnNumber: 'desc' }, take: 1 } }
  });

  if (!conversation) {
    return createErrorResponse('Conversation not found');
  }

  if (conversation.status === 'completed') {
    return createErrorResponse('Conversation already completed');
  }

  // ========================================
  // SAFETY CHECK: Maximum questions limit
  // ========================================
  const currentTotalQuestions = conversation.totalQuestions || 0;
  logger.info(`[LLM-CLASSIFIER] Questions asked so far: ${currentTotalQuestions}/${MAX_QUESTIONS_LIMIT}`);

  if (currentTotalQuestions >= MAX_QUESTIONS_LIMIT) {
    logger.warn(`[LLM-CLASSIFIER] MAX QUESTIONS LIMIT REACHED (${MAX_QUESTIONS_LIMIT}). Forcing classification.`);
    // Force classification at current position
    return await forceClassificationFromState(conversationId!, conversation, startTime);
  }

  // Get navigation state from cache
  let state = navigationStateCache.get(conversationId!);

  if (!state) {
    // Reconstruct state from database
    const allTurns = await prisma.conversationTurn.findMany({
      where: { conversationId: conversationId! },
      orderBy: { turnNumber: 'asc' }
    });

    const history: NavigationHistory[] = [];
    let currentCode: string | null = null;

    for (const turn of allTurns) {
      if (turn.userAnswers) {
        const userAnswers = turn.userAnswers as Record<string, string>;
        for (const [_questionId, selectedCode] of Object.entries(userAnswers)) {
          if (selectedCode) {
            const codeDetails = await validateCode(selectedCode);
            if (codeDetails) {
              history.push({
                code: selectedCode,
                description: codeDetails.description,
                level: history.length + 1
              });
              currentCode = selectedCode;
            }
          }
        }
      }
    }

    // PHASE 3: Extract modifiers from the original product description
    const reconstructedModifiers = extractModifiersFromText(conversation.productDescription);

    state = {
      productDescription: conversation.productDescription,
      currentCode,
      history,
      pendingQuestionId: null,
      userDecisions: [],
      // PHASE 3: Reconstruct accumulated modifiers from product description
      accumulatedModifiers: reconstructedModifiers
    };
    navigationStateCache.set(conversationId!, state);
  }

  // ========================================
  // PHASE 4.5: Check if this is an attribute question answer
  // ========================================
  logger.info(`[FLOW] State pendingQuestionType: ${state.pendingQuestionType || 'none'}`);
  logger.info(`[FLOW] State _pendingAttributeKey: ${state._pendingAttributeKey || 'none'}`);
  logger.info(`[FLOW] State _extractedAttributes: ${JSON.stringify(state._extractedAttributes)}`);

  if (state.pendingQuestionType === 'attribute' && answers) {
    logger.info('[FLOW] ROUTING TO: handleAttributeAnswer (attribute question detected)');
    return handleAttributeAnswer(conversationId!, state, answers, startTime);
  }

  logger.info('[FLOW] ROUTING TO: Navigator (not an attribute question)');

  // Process user's answer
  if (answers) {
    const lastTurn = conversation.turns[0];
    if (lastTurn) {
      // Update the turn with user's answers
      await prisma.conversationTurn.update({
        where: { id: lastTurn.id },
        data: {
          userAnswers: answers as any,
          answeredAt: new Date()
        }
      });
    }

    // Extract the selected code from answers
    // Answer format is "CODE::LABEL" or just "CODE"
    const selectedAnswer = Object.values(answers)[0];
    if (selectedAnswer) {
      // Parse the code from the answer (remove label if present)
      let selectedCode = selectedAnswer;
      if (selectedAnswer.includes('::')) {
        selectedCode = selectedAnswer.split('::')[0]?.trim() ?? selectedAnswer;
      } else if (selectedAnswer.includes(':')) {
        // Legacy format "CODE: label"
        selectedCode = selectedAnswer.split(':')[0]?.trim() ?? selectedAnswer;
      }

      logger.info(`[LLM-CLASSIFIER] User selected: ${selectedAnswer} -> code: ${selectedCode}`);

      const codeDetails = await validateCode(selectedCode);
      if (codeDetails) {
        state.history.push({
          code: selectedCode,
          description: codeDetails.description,
          level: state.history.length + 1
        });
        state.currentCode = selectedCode;
        logger.info(`[LLM-CLASSIFIER] Updated current position to: ${selectedCode}`);

        // PHASE 3: Extract modifiers from the selected answer and add to accumulated modifiers
        const answerModifiers = extractModifiersFromAnswer({
          code: selectedCode,
          description: codeDetails.description
        });
        if (answerModifiers.length > 0) {
          const newModifiers = answerModifiers.filter(m => !state.accumulatedModifiers.includes(m));
          if (newModifiers.length > 0) {
            state.accumulatedModifiers.push(...newModifiers);
            logger.info(`[PHASE 3] Added modifiers from answer: [${newModifiers.join(', ')}]`);
            logger.info(`[PHASE 3] Total accumulated modifiers: [${state.accumulatedModifiers.join(', ')}]`);
          }
        }

        // Record user's decision for better reasoning
        if (state.pendingQuestionText && state.pendingQuestionOptions) {
          const selectedLabel = selectedAnswer.includes('::')
            ? (selectedAnswer.split('::')[1]?.trim() ?? codeDetails.description)
            : codeDetails.description;

          const alternatives = state.pendingQuestionOptions
            .filter(opt => opt.code !== selectedCode)
            .map(opt => ({ code: opt.code, label: opt.label }));

          state.userDecisions.push({
            questionText: state.pendingQuestionText,
            selectedOption: { code: selectedCode, label: selectedLabel },
            alternatives
          });

          // Clear pending question data
          state.pendingQuestionText = undefined;
          state.pendingQuestionOptions = undefined;
        }

        // ========================================
        // TERMINATION CHECK: Is this an 8-digit terminal code?
        // ========================================
        const cleanCode = selectedCode.replace(/\./g, '');
        if (cleanCode.length === 8) {
          logger.info(`[LLM-CLASSIFIER] TERMINAL CODE REACHED: ${selectedCode} (8 digits)`);
          // This is a final classification - process through standard handler
          const turnNumber = (conversation.turns[0]?.turnNumber || 0) + 1;
          const terminalResult: NavigationResult = {
            type: 'classification',
            code: selectedCode,
            description: codeDetails.description,
            confidence: 92,
            reasoning: `Terminal 8-digit code reached after ${currentTotalQuestions} questions`
          };
          return await processNavigationResult(
            conversationId!,
            terminalResult,
            startTime,
            turnNumber,
            state.userDecisions
          );
        }

        // ========================================
        // TERMINATION CHECK: Does this code have children?
        // Check both HsCodeHierarchy AND direct HsCode prefix query for robustness
        // ========================================

        // First check: HsCodeHierarchy table
        const hierarchy = await prisma.hsCodeHierarchy.findUnique({
          where: { code: selectedCode },
          select: { childrenCodes: true }
        });

        // Second check: Direct HsCode prefix query (fallback)
        const childCodesCount = await prisma.hsCode.count({
          where: {
            code: {
              startsWith: selectedCode,
              not: selectedCode
            }
          }
        });

        const hasNoChildren = (
          (!hierarchy?.childrenCodes || hierarchy.childrenCodes.length === 0) &&
          childCodesCount === 0
        );

        if (hasNoChildren) {
          logger.info(`[LLM-CLASSIFIER] LEAF CODE REACHED: ${selectedCode} (no children in hierarchy or HsCode table)`);
          // No children means this is a final classification
          const turnNumber = (conversation.turns[0]?.turnNumber || 0) + 1;
          const leafResult: NavigationResult = {
            type: 'classification',
            code: selectedCode,
            description: codeDetails.description,
            confidence: 90,
            reasoning: `Leaf code (no children) reached after ${currentTotalQuestions} questions`
          };
          return await processNavigationResult(
            conversationId!,
            leafResult,
            startTime,
            turnNumber,
            state.userDecisions
          );
        }

        const childCount = hierarchy?.childrenCodes?.length || childCodesCount;
        logger.info(`[LLM-CLASSIFIER] Code ${selectedCode} has ${childCount} children, continuing navigation`);
      } else {
        logger.warn(`[LLM-CLASSIFIER] Could not validate code: ${selectedCode}`);
      }
    }
  }

  // Continue navigation from current position
  // PHASE 2 FIX: Pass accumulated modifiers to the navigator
  // This ensures the navigator uses ALL information the user has provided (original query + answers)
  logger.info(`[PHASE 2 FIX] Passing ${state.accumulatedModifiers.length} modifiers to navigator: [${state.accumulatedModifiers.join(', ')}]`);
  const result = await navigateWithAutoContinue(
    state.productDescription,
    state.currentCode,
    state.history,
    state.accumulatedModifiers || []  // PHASE 2 FIX: NOW PASSED!
  );

  const turnNumber = (conversation.turns[0]?.turnNumber || 0) + 1;

  return await processNavigationResult(
    conversationId!,
    result,
    startTime,
    turnNumber,
    state.userDecisions
  );
}

// ========================================
// Process Navigation Result
// ========================================

async function processNavigationResult(
  conversationId: string,
  result: NavigationResult,
  startTime: number,
  turnNumber: number,
  userDecisions: UserDecision[] = []
): Promise<LLMClassifyResponse> {
  const responseTimeMs = Date.now() - startTime;

  if (result.type === 'error') {
    logger.error(`[LLM-CLASSIFIER] Navigation error: ${result.error}`);

    return {
      success: false,
      conversationId,
      responseType: 'error',
      error: result.error,
      timestamp: new Date().toISOString()
    };
  }

  if (result.type === 'question') {
    logger.info(`[LLM-CLASSIFIER] Asking question: "${result.question!.text}"`);

    // Store the question turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'question',
        questionContext: result.question!.reasoning,
        questions: [{
          id: result.question!.id,
          text: result.question!.text,
          options: result.question!.options.map(o => o.label),
          allowOther: true,
          priority: 'required'
        }] as any,
        llmModel: 'gpt-4o-mini',
        responseTimeMs
      }
    });

    // Update conversation
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        totalQuestions: { increment: 1 },
        totalRounds: turnNumber
      }
    });

    // Update navigation state with question data for tracking user decisions
    const state = navigationStateCache.get(conversationId);
    if (state) {
      state.pendingQuestionId = result.question!.id;
      state.pendingQuestionText = result.question!.text;
      state.pendingQuestionOptions = result.question!.options;
    }

    // Build conversation summary
    const summary = await buildConversationSummary(conversationId, startTime);

    // Convert options to frontend format
    // Format: "CODE::FRIENDLY_LABEL" - use :: as separator to parse later
    // Display shows only the label, but we need code for processing answers
    const questionOptions = result.question!.options.map(opt =>
      `${opt.code}::${opt.label}`
    );

    return {
      success: true,
      conversationId,
      responseType: 'questions',  // Frontend expects plural
      roundNumber: turnNumber,  // Explicit round number for frontend deduplication
      questions: [{
        id: result.question!.id,
        text: result.question!.text,
        options: questionOptions,
        allowOther: true,
        priority: 'required' as const
      }],
      questionContext: result.question!.reasoning,
      // Keep original data for answer processing
      _questionData: result.question!.options,
      conversationSummary: summary,
      timestamp: new Date().toISOString()
    };
  }

  if (result.type === 'classification' || result.type === 'selection') {
    // For selections that led to leaf, treat as classification
    if (result.type === 'selection') {
      // Check if we're at a leaf
      const children = await prisma.hsCodeHierarchy.findUnique({
        where: { code: result.code! },
        select: { childrenCodes: true }
      });

      if (children?.childrenCodes?.length) {
        // Not at leaf yet - this shouldn't happen with navigateWithAutoContinue
        // but handle it gracefully
        logger.warn(`[LLM-CLASSIFIER] Selection at non-leaf: ${result.code}`);
      }
    }

    logger.info(`[LLM-CLASSIFIER] Classification complete: ${result.code} (${result.confidence}%)`);

    // Get full code details
    const codeDetails = await validateCode(result.code!);

    // Store classification turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'classification',
        hsCode: result.code,
        hsDescription: codeDetails?.description || result.description,
        confidence: result.confidence,
        reasoning: result.reasoning,
        llmModel: 'gpt-4o-mini',
        responseTimeMs
      }
    });

    // Mark conversation as completed
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        status: 'completed',
        finalHsCode: result.code,
        finalConfidence: result.confidence,
        finalReasoning: result.reasoning,
        finalDescription: codeDetails?.description || result.description,
        completedAt: new Date(),
        totalRounds: turnNumber
      }
    });

    // Clean up cache
    navigationStateCache.delete(conversationId);

    // Build conversation summary
    const summary = await buildConversationSummary(conversationId, startTime);

    // Build enhanced reasoning with structured format for frontend
    const classificationPath = buildClassificationPath(userDecisions, result.code!, codeDetails?.description || '');
    const enhancedReasoning = JSON.stringify(classificationPath);

    // Build SMART alternatives - only show sibling codes from same parent
    // NOT alternatives from earlier branch decisions (those are irrelevant)
    const alternatives = await buildSmartAlternatives(result.code!, userDecisions);

    return {
      success: true,
      conversationId,
      responseType: 'classification',
      result: {
        hsCode: result.code!,
        description: codeDetails?.description || result.description || '',
        confidence: result.confidence || 90,
        reasoning: enhancedReasoning,
        alternatives,
        clarificationImpact: buildClarificationImpact(summary)
      },
      conversationSummary: summary,
      timestamp: new Date().toISOString()
    };
  }

  // Unknown result type
  return createErrorResponse('Unknown navigation result');
}

// ========================================
// Helper Functions
// ========================================

async function buildConversationSummary(
  conversationId: string,
  startTime: number
): Promise<LLMClassifyResponse['conversationSummary']> {
  const turns = await prisma.conversationTurn.findMany({
    where: { conversationId },
    orderBy: { turnNumber: 'asc' }
  });

  const history = turns.map(turn => ({
    turn: turn.turnNumber,
    type: turn.responseType as 'question' | 'classification',
    content: turn.responseType === 'question'
      ? (turn.questions as any)?.[0]?.text || 'Question'
      : `${turn.hsCode} - ${turn.hsDescription || ''}`,
    timestamp: turn.createdAt.toISOString()
  }));

  const questionsAsked = turns.filter(t => t.responseType === 'question').length;
  const answersProvided = turns.filter(t => t.userAnswers !== null).length;

  return {
    totalRounds: turns.length,
    questionsAsked,
    answersProvided,
    durationMs: Date.now() - startTime,
    history
  };
}

function buildClarificationImpact(
  summary: LLMClassifyResponse['conversationSummary']
): string {
  if (!summary || summary.questionsAsked === 0) {
    return 'Direct classification - no clarifying questions needed.';
  }

  return `Classification determined after ${summary.questionsAsked} clarifying question(s) across ${summary.totalRounds} round(s).`;
}

/**
 * Build a structured classification path showing the decision tree
 */
interface ClassificationPath {
  chapter: { code: string; name: string };
  heading: { code: string; name: string };
  finalCode: { code: string; description: string };
  userAnswers: Array<{ question: string; answer: string }>;
}

function buildClassificationPath(
  userDecisions: UserDecision[],
  finalCode: string,
  finalDescription: string
): ClassificationPath {
  // Extract chapter and heading from final code
  const chapter = finalCode.substring(0, 2);
  const heading = finalCode.substring(0, 4);

  // Map chapter codes to names (common chapters)
  const chapterNames: Record<string, string> = {
    '09': 'Coffee, Tea, Maté and Spices',
    '08': 'Edible Fruit and Nuts',
    '07': 'Edible Vegetables',
    '84': 'Nuclear Reactors, Boilers, Machinery',
    '85': 'Electrical Machinery and Equipment',
    '87': 'Vehicles',
    '73': 'Articles of Iron or Steel',
    '39': 'Plastics and Articles Thereof',
    '62': 'Articles of Apparel (not knitted)',
    '61': 'Articles of Apparel (knitted)',
    '94': 'Furniture, Bedding, Lamps',
    '95': 'Toys, Games and Sports Equipment',
  };

  return {
    chapter: {
      code: chapter,
      name: chapterNames[chapter] || `Chapter ${chapter}`
    },
    heading: {
      code: heading,
      name: `Heading ${heading}`
    },
    finalCode: {
      code: finalCode,
      description: finalDescription
    },
    userAnswers: userDecisions.map(d => ({
      question: d.questionText,
      answer: d.selectedOption.label
    }))
  };
}

/**
 * Build smart alternatives - only sibling codes from the same parent
 * NOT alternatives from earlier branch decisions
 * PHASE 5.2: Now filters out catch-all codes and adds reasons
 */
async function buildSmartAlternatives(
  finalCode: string,
  userDecisions: UserDecision[]
): Promise<Array<{ code: string; description: string; reason?: string }>> {
  try {
    // Get the final code's hierarchy info
    const hierarchy = await prisma.hsCodeHierarchy.findUnique({
      where: { code: finalCode },
      select: { parentCode: true }
    });

    if (!hierarchy?.parentCode) {
      // No parent - return last question's alternatives only (filtered)
      if (userDecisions.length > 0) {
        const lastDecision = userDecisions[userDecisions.length - 1];
        if (lastDecision) {
          const alts = lastDecision.alternatives.map(alt => ({
            code: alt.code,
            description: alt.label
          }));
          // PHASE 5.2: Filter even fallback alternatives
          return filterAlternativeCodes(alts, finalCode, 3);
        }
      }
      return [];
    }

    // Get all sibling codes (children of the same parent)
    const parentHierarchy = await prisma.hsCodeHierarchy.findUnique({
      where: { code: hierarchy.parentCode },
      select: { childrenCodes: true }
    });

    if (!parentHierarchy?.childrenCodes) {
      return [];
    }

    // Filter out the selected code and get details for siblings
    const siblingCodes = parentHierarchy.childrenCodes.filter(c => c !== finalCode);

    // Get descriptions for sibling codes
    const siblings = await prisma.hsCode.findMany({
      where: { code: { in: siblingCodes } },
      select: { code: true, description: true }
    });

    // ============================================
    // PHASE 5.2: FILTER OUT CATCH-ALL CODES
    // ============================================
    const filteredAlternatives = filterAlternativeCodes(siblings, finalCode, 3);

    logger.info(`[PHASE 5.2] buildSmartAlternatives: Returning ${filteredAlternatives.length} quality alternatives for ${finalCode}`);

    return filteredAlternatives;
  } catch (error) {
    logger.warn(`[LLM-CLASSIFIER] Error building smart alternatives: ${error}`);
    // Fallback to last question's alternatives (filtered)
    if (userDecisions.length > 0) {
      const lastDecision = userDecisions[userDecisions.length - 1];
      if (lastDecision) {
        const alts = lastDecision.alternatives.map(alt => ({
          code: alt.code,
          description: alt.label
        }));
        // PHASE 5.2: Filter even fallback alternatives
        return filterAlternativeCodes(alts, finalCode, 3);
      }
    }
    return [];
  }
}

function createErrorResponse(error: string): LLMClassifyResponse {
  return {
    success: false,
    conversationId: '',
    responseType: 'error',
    error,
    timestamp: new Date().toISOString()
  };
}

// ========================================
// Exported Helper Functions for Routes
// ========================================

/**
 * Get conversation by ID
 */
export async function getConversation(conversationId: string) {
  return await prisma.classificationConversation.findUnique({
    where: { id: conversationId },
    include: {
      turns: {
        orderBy: { turnNumber: 'asc' }
      }
    }
  });
}

/**
 * Abandon (delete) a conversation
 */
export async function abandonConversation(conversationId: string): Promise<boolean> {
  try {
    const conversation = await prisma.classificationConversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation || conversation.status === 'completed') {
      return false;
    }

    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: { status: 'abandoned' }
    });

    // Clean up cache
    navigationStateCache.delete(conversationId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get conversation statistics
 */
export async function getConversationStats() {
  const total = await prisma.classificationConversation.count();
  const completed = await prisma.classificationConversation.count({
    where: { status: 'completed' }
  });
  const active = await prisma.classificationConversation.count({
    where: { status: 'active' }
  });
  const abandoned = await prisma.classificationConversation.count({
    where: { status: 'abandoned' }
  });

  return {
    total,
    completed,
    active,
    abandoned,
    completionRate: total > 0 ? (completed / total * 100).toFixed(1) + '%' : '0%'
  };
}

/**
 * Skip remaining questions and force classification at current position
 *
 * This function:
 * 1. Retrieves the current navigation state (position in hierarchy)
 * 2. Forces classification using LLM without asking more questions
 * 3. Returns the best guess result with lower confidence
 */
export async function skipToClassification(
  conversationId: string
): Promise<LLMClassifyResponse> {
  const startTime = Date.now();

  logger.info(`[LLM-CLASSIFIER] Skipping to classification for: ${conversationId}`);

  try {
    // Get conversation from database
    const conversation = await prisma.classificationConversation.findUnique({
      where: { id: conversationId },
      include: { turns: { orderBy: { turnNumber: 'desc' }, take: 1 } }
    });

    if (!conversation) {
      return createErrorResponse('Conversation not found');
    }

    if (conversation.status === 'completed') {
      return createErrorResponse('Conversation already completed');
    }

    // Get navigation state from cache or reconstruct from database
    let state = navigationStateCache.get(conversationId);

    if (!state) {
      // Reconstruct state from database
      const allTurns = await prisma.conversationTurn.findMany({
        where: { conversationId },
        orderBy: { turnNumber: 'asc' }
      });

      const history: NavigationHistory[] = [];
      let currentCode: string | null = null;

      for (const turn of allTurns) {
        if (turn.userAnswers) {
          const userAnswers = turn.userAnswers as Record<string, string>;
          for (const [_questionId, selectedCode] of Object.entries(userAnswers)) {
            if (selectedCode) {
              // Parse code from "CODE::LABEL" format if needed
              let code = selectedCode;
              if (selectedCode.includes('::')) {
                code = selectedCode.split('::')[0]?.trim() ?? selectedCode;
              } else if (selectedCode.includes(':')) {
                code = selectedCode.split(':')[0]?.trim() ?? selectedCode;
              }

              const codeDetails = await validateCode(code);
              if (codeDetails) {
                history.push({
                  code: code,
                  description: codeDetails.description,
                  level: history.length + 1
                });
                currentCode = code;
              }
            }
          }
        }
      }

      // PHASE 3: Extract modifiers from the original product description
      const skipModifiers = extractModifiersFromText(conversation.productDescription);

      state = {
        productDescription: conversation.productDescription,
        currentCode,
        history,
        pendingQuestionId: null,
        userDecisions: [],
        // PHASE 3: Include accumulated modifiers
        accumulatedModifiers: skipModifiers
      };
    }

    logger.info(`[LLM-CLASSIFIER] Skip: current position is ${state.currentCode || 'root'}, history length: ${state.history.length}`);

    // Force classification from current position
    const result = await forceClassification(
      state.productDescription,
      state.currentCode,
      state.history
    );

    const turnNumber = (conversation.turns[0]?.turnNumber || 0) + 1;

    // Process the result (pass userDecisions for better reasoning)
    return await processNavigationResult(
      conversationId,
      result,
      startTime,
      turnNumber,
      state.userDecisions
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[LLM-CLASSIFIER] Skip error: ${errorMsg}`);
    return createErrorResponse(errorMsg);
  }
}

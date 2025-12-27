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
    alternatives: Array<{ code: string; description: string }>;
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

// In-memory cache for conversation navigation state
const navigationStateCache = new Map<string, {
  productDescription: string;
  currentCode: string | null;
  history: NavigationHistory[];
  pendingQuestionId: string | null;
  pendingQuestionOptions?: Array<{ code: string; label: string; description: string }>;
  pendingQuestionText?: string;
  userDecisions: UserDecision[];
}>();

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

  // Initialize navigation state
  navigationStateCache.set(conversation.id, {
    productDescription: request.productDescription!,
    currentCode: null,
    history: [],
    pendingQuestionId: null,
    userDecisions: []
  });

  // Start navigation from root
  const result = await navigateWithAutoContinue(
    request.productDescription!,
    null,
    []
  );

  return await processNavigationResult(
    conversation.id,
    result,
    startTime,
    1
  );
}

// ========================================
// Continue Conversation
// ========================================

async function continueConversation(
  request: LLMClassifyRequest,
  startTime: number
): Promise<LLMClassifyResponse> {
  const { conversationId, answers } = request;

  logger.info(`[LLM-CLASSIFIER] Continuing conversation: ${conversationId}`);

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

    state = {
      productDescription: conversation.productDescription,
      currentCode,
      history,
      pendingQuestionId: null,
      userDecisions: []
    };
    navigationStateCache.set(conversationId!, state);
  }

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
        selectedCode = selectedAnswer.split('::')[0].trim();
      } else if (selectedAnswer.includes(':')) {
        // Legacy format "CODE: label"
        selectedCode = selectedAnswer.split(':')[0].trim();
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

        // Record user's decision for better reasoning
        if (state.pendingQuestionText && state.pendingQuestionOptions) {
          const selectedLabel = selectedAnswer.includes('::')
            ? selectedAnswer.split('::')[1].trim()
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
      } else {
        logger.warn(`[LLM-CLASSIFIER] Could not validate code: ${selectedCode}`);
      }
    }
  }

  // Continue navigation from current position
  const result = await navigateWithAutoContinue(
    state.productDescription,
    state.currentCode,
    state.history
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
 */
async function buildSmartAlternatives(
  finalCode: string,
  userDecisions: UserDecision[]
): Promise<Array<{ code: string; description: string }>> {
  try {
    // Get the final code's hierarchy info
    const hierarchy = await prisma.hsCodeHierarchy.findUnique({
      where: { code: finalCode },
      select: { parentCode: true }
    });

    if (!hierarchy?.parentCode) {
      // No parent - return last question's alternatives only
      if (userDecisions.length > 0) {
        const lastDecision = userDecisions[userDecisions.length - 1];
        return lastDecision.alternatives.map(alt => ({
          code: alt.code,
          description: alt.label
        }));
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

    return siblings.map(s => ({
      code: s.code,
      description: s.description
    }));
  } catch (error) {
    logger.warn(`[LLM-CLASSIFIER] Error building smart alternatives: ${error}`);
    // Fallback to last question's alternatives
    if (userDecisions.length > 0) {
      const lastDecision = userDecisions[userDecisions.length - 1];
      return lastDecision.alternatives.map(alt => ({
        code: alt.code,
        description: alt.label
      }));
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
                code = selectedCode.split('::')[0].trim();
              } else if (selectedCode.includes(':')) {
                code = selectedCode.split(':')[0].trim();
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

      state = {
        productDescription: conversation.productDescription,
        currentCode,
        history,
        pendingQuestionId: null,
        userDecisions: []
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

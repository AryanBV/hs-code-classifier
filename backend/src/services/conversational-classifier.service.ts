/**
 * Conversational Classifier Service
 *
 * Implements LLM-generated clarifying questions for accurate HS code classification.
 * The LLM decides whether to ask questions or classify directly based on input specificity.
 *
 * Key Features:
 * - Dynamic question generation based on product ambiguity
 * - Multi-turn conversation with context preservation
 * - Maximum 5 questions across 3 rounds
 * - Full audit trail in database
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Candidate, getTopCandidates } from './multi-candidate-search.service';
import {
  getHierarchyContext,
  findCommonParent,
  matchAnswersToChildren,
  HierarchyContext
} from './hierarchy-context.service';
import {
  analyzeExclusionContext,
  classifyWithExclusion,
  formatExclusionContextForPrompt,
  ExclusionAnalysis
} from './exclusion-classifier.service';
import {
  getNotesForCode,
  formatNotesForPrompt,
  NoteContext
} from './chapter-notes.service';
import {
  ConversationalClassifyRequest,
  ConversationalClassifyResponse,
  ConversationContext,
  ClarifyingQuestion,
  ClassificationResult,
  LLMDecision,
  UserAnswers,
  ConversationSummary,
  ConversationHistoryItem,
  MAX_QUESTIONS,
  MAX_ROUNDS,
  MAX_QUESTIONS_PER_ROUND
} from '../types/conversation.types';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ========================================
// Main Entry Point
// ========================================

/**
 * Main classification function - handles both new and continued conversations
 */
export async function classifyConversational(
  request: ConversationalClassifyRequest
): Promise<ConversationalClassifyResponse> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!request.productDescription?.trim()) {
      return createErrorResponse('Product description is required');
    }

    if (!request.sessionId?.trim()) {
      return createErrorResponse('Session ID is required');
    }

    // New conversation or continuing?
    if (request.conversationId && request.answers) {
      return await continueConversation(request, startTime);
    } else {
      return await startNewConversation(request, startTime);
    }
  } catch (error) {
    logger.error('Conversational classification error');
    logger.error(error instanceof Error ? error.message : String(error));
    return createErrorResponse('Classification failed. Please try again.');
  }
}

// ========================================
// New Conversation
// ========================================

/**
 * Start a new classification conversation
 */
async function startNewConversation(
  request: ConversationalClassifyRequest,
  startTime: number
): Promise<ConversationalClassifyResponse> {
  logger.info(`Starting new conversation for: "${request.productDescription.substring(0, 50)}..."`);

  // Create conversation record
  const conversation = await prisma.classificationConversation.create({
    data: {
      sessionId: request.sessionId,
      productDescription: request.productDescription,
      status: 'active',
      enhancedQuery: request.productDescription
    }
  });

  // Get candidates
  const candidates = await getTopCandidates(request.productDescription, 50);

  if (candidates.length === 0) {
    await markConversationCompleted(conversation.id, {
      hsCode: '',
      description: 'No matching codes found',
      confidence: 0,
      reasoning: 'No HS codes match this product description',
      alternatives: []
    });

    return {
      success: true,
      conversationId: conversation.id,
      responseType: 'classification',
      result: {
        hsCode: '',
        description: 'No matching codes found',
        confidence: 0,
        reasoning: 'No HS codes match this product description. Please try a different description.',
        alternatives: []
      },
      timestamp: new Date().toISOString()
    };
  }

  // Build context for LLM
  const context: ConversationContext = {
    originalQuery: request.productDescription,
    enhancedQuery: request.productDescription,
    currentRound: 1,
    totalQuestionsAsked: 0,
    maxQuestions: MAX_QUESTIONS,
    maxRounds: MAX_ROUNDS,
    previousTurns: []
  };

  // Get LLM decision
  const llmStartTime = Date.now();
  const decision = await getLLMDecision(context, candidates);
  const llmTime = Date.now() - llmStartTime;

  // Process decision
  return await processLLMDecision(
    conversation.id,
    context,
    decision,
    candidates,
    llmTime,
    startTime
  );
}

// ========================================
// Continue Conversation
// ========================================

/**
 * Continue an existing conversation with user's answers
 */
async function continueConversation(
  request: ConversationalClassifyRequest,
  startTime: number
): Promise<ConversationalClassifyResponse> {
  logger.info(`Continuing conversation: ${request.conversationId}`);

  // Load conversation
  const conversation = await prisma.classificationConversation.findUnique({
    where: { id: request.conversationId },
    include: {
      turns: {
        orderBy: { turnNumber: 'asc' }
      }
    }
  });

  if (!conversation) {
    return createErrorResponse('Conversation not found');
  }

  if (conversation.status !== 'active') {
    return createErrorResponse('Conversation is no longer active');
  }

  // Find the last question turn
  const lastQuestionTurn = conversation.turns
    .filter(t => t.responseType === 'question')
    .pop();

  if (!lastQuestionTurn) {
    return createErrorResponse('No questions to answer');
  }

  // Update the turn with user's answers
  await prisma.conversationTurn.update({
    where: { id: lastQuestionTurn.id },
    data: {
      userAnswers: request.answers,
      answeredAt: new Date()
    }
  });

  // Build enhanced query from original + all answers
  const enhancedQuery = buildEnhancedQuery(
    conversation.productDescription,
    conversation.turns,
    request.answers!
  );

  // Update conversation with enhanced query
  await prisma.classificationConversation.update({
    where: { id: conversation.id },
    data: { enhancedQuery }
  });

  // Get new candidates with enhanced query
  const candidates = await getTopCandidates(enhancedQuery, 50);

  // Build context
  const previousTurns = conversation.turns
    .filter(t => t.responseType === 'question')
    .map(t => ({
      turnNumber: t.turnNumber,
      questions: t.questions as unknown as ClarifyingQuestion[] | undefined,
      answers: t.userAnswers as unknown as UserAnswers | undefined
    }));

  // Add current answers to previous turns
  if (previousTurns.length > 0 && previousTurns[previousTurns.length - 1]) {
    previousTurns[previousTurns.length - 1]!.answers = request.answers;
  }

  const totalQuestionsAsked = previousTurns.reduce((sum, t) => {
    return sum + (t.questions?.length || 0);
  }, 0);

  const context: ConversationContext = {
    originalQuery: conversation.productDescription,
    enhancedQuery,
    currentRound: conversation.totalRounds + 1,
    totalQuestionsAsked,
    maxQuestions: MAX_QUESTIONS,
    maxRounds: MAX_ROUNDS,
    previousTurns
  };

  // Get LLM decision
  const llmStartTime = Date.now();
  const decision = await getLLMDecision(context, candidates);
  const llmTime = Date.now() - llmStartTime;

  // Process decision
  return await processLLMDecision(
    conversation.id,
    context,
    decision,
    candidates,
    llmTime,
    startTime
  );
}

// ========================================
// LLM Decision
// ========================================

/**
 * Ask LLM to decide: ask questions or classify
 */
async function getLLMDecision(
  context: ConversationContext,
  candidates: Candidate[]
): Promise<LLMDecision> {
  try {
    // Get full details for candidates
    const codes = candidates.slice(0, 20).map(c => c.code);
    const fullDetails = await prisma.hsCode.findMany({
      where: { code: { in: codes } },
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true
      }
    });

    // Get hierarchy context for the top candidate
    // This provides child codes and derived questions
    let hierarchyContext: HierarchyContext | null = null;
    let exclusionContexts: ExclusionAnalysis[] = [];
    let noteContext: NoteContext | null = null;

    if (candidates.length > 0) {
      const topCode = candidates[0]!.code;
      // Find the most likely parent code to explore
      const parentCode = await findBestParentToExplore(candidates);
      if (parentCode) {
        // Get hierarchy context (child codes and dimensions)
        hierarchyContext = await getHierarchyContext(parentCode);
        logger.debug(`Hierarchy context for ${parentCode}: ${hierarchyContext?.childCodes.length || 0} children, ${hierarchyContext?.dimensions.length || 0} dimensions`);
      }

      // Get exclusion context for ALL unique 7-character parents in candidates
      // This ensures we have exclusion info for whichever code the LLM chooses
      const uniqueParents = new Set<string>();
      for (const candidate of candidates.slice(0, 20)) {
        if (candidate.code.length >= 7) {
          uniqueParents.add(candidate.code.substring(0, 7));
        }
      }

      for (const parent of uniqueParents) {
        try {
          const exclusion = await analyzeExclusionContext(parent);
          if (exclusion?.hasOtherCode) {
            exclusionContexts.push(exclusion);
            logger.debug(`Exclusion context for ${parent}: has "Other" code ${exclusion.otherCode?.code}`);
          }
        } catch (e) {
          // Ignore errors for individual parents
        }
      }
      logger.debug(`Found ${exclusionContexts.length} exclusion contexts from ${uniqueParents.size} parents`);

      // Get chapter notes for the top candidate
      noteContext = await getNotesForCode(topCode);
      logger.debug(`Chapter notes: ${noteContext?.chapterNotes.length || 0} notes, ${noteContext?.relevantDefinitions.length || 0} definitions`);
    }

    const prompt = createClarificationPrompt(context, candidates, fullDetails, hierarchyContext, exclusionContexts, noteContext);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // Using full GPT-4o for better question generation
      messages: [
        {
          role: 'system',
          content: `You are an expert HS code classification specialist. Your role is to either:
1. Ask clarifying questions if the product description is ambiguous
2. Provide a final classification if you have enough information

Always respond with valid JSON only. Be precise and helpful.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const decision = JSON.parse(content) as LLMDecision;
    logger.debug(`LLM decision: ${decision.decision}`);

    return decision;

  } catch (error) {
    logger.error('LLM decision error, falling back to classification');
    logger.error(error instanceof Error ? error.message : String(error));

    // Fallback: classify with top candidates
    return {
      decision: 'classify',
      rankedOptions: candidates.slice(0, 3).map((c, i) => ({
        code: c.code,
        confidence: Math.max(50, 90 - (i * 15)),
        rank: i + 1
      })),
      reasoning: 'Classification based on search results'
    };
  }
}

/**
 * Find the best parent code to explore for hierarchy context
 * This identifies which code's children we should analyze for question generation
 */
async function findBestParentToExplore(candidates: Candidate[]): Promise<string | null> {
  if (candidates.length === 0) return null;

  // Group candidates by their 4-digit heading
  const headingGroups = new Map<string, Candidate[]>();
  for (const candidate of candidates.slice(0, 20)) {
    const heading = candidate.code.substring(0, 4);
    if (!headingGroups.has(heading)) {
      headingGroups.set(heading, []);
    }
    headingGroups.get(heading)!.push(candidate);
  }

  // Find the heading with most candidates (likely the correct chapter)
  let bestHeading = '';
  let maxCount = 0;
  for (const [heading, group] of headingGroups) {
    if (group.length > maxCount) {
      maxCount = group.length;
      bestHeading = heading;
    }
  }

  if (!bestHeading) return null;

  // Now find the best 6-digit parent within this heading
  const headingCandidates = headingGroups.get(bestHeading) || [];

  // Group by 6-digit subheading
  const subheadingGroups = new Map<string, Candidate[]>();
  for (const candidate of headingCandidates) {
    // Extract 6-digit: XXXX.XX
    const subheading = candidate.code.substring(0, 7);
    if (!subheadingGroups.has(subheading)) {
      subheadingGroups.set(subheading, []);
    }
    subheadingGroups.get(subheading)!.push(candidate);
  }

  // Find the subheading with most candidates
  let bestSubheading = '';
  maxCount = 0;
  for (const [subheading, group] of subheadingGroups) {
    if (group.length > maxCount) {
      maxCount = group.length;
      bestSubheading = subheading;
    }
  }

  // If multiple candidates share a 6-digit parent, explore that parent's children
  if (bestSubheading && maxCount > 1) {
    // Verify this code exists
    const exists = await prisma.hsCode.findFirst({
      where: { code: bestSubheading },
      select: { code: true }
    });
    if (exists) return bestSubheading;
  }

  // Otherwise, explore the 4-digit heading
  const headingExists = await prisma.hsCode.findFirst({
    where: { code: bestHeading },
    select: { code: true }
  });

  return headingExists ? bestHeading : null;
}

/**
 * Create the prompt for LLM clarification decision
 */
function createClarificationPrompt(
  context: ConversationContext,
  candidates: Candidate[],
  fullDetails: any[],
  hierarchyContext: HierarchyContext | null,
  exclusionContexts: ExclusionAnalysis[],
  noteContext: NoteContext | null
): string {
  // Format candidates
  const candidatesText = candidates.slice(0, 15).map((c, idx) => {
    const details = fullDetails.find(d => d.code === c.code);
    return `${idx + 1}. ${c.code} - ${details?.description || 'N/A'} (Score: ${c.score.toFixed(1)})`;
  }).join('\n');

  // Format conversation history
  let historyText = 'No previous questions.';
  if (context.previousTurns.length > 0) {
    historyText = context.previousTurns.map(turn => {
      const qText = turn.questions?.map(q => `Q: ${q.text}`).join('\n') || '';
      const aText = turn.answers
        ? Object.entries(turn.answers).map(([k, v]) => `A: ${v}`).join('\n')
        : 'Not answered yet';
      return `Round ${turn.turnNumber}:\n${qText}\n${aText}`;
    }).join('\n\n');
  }

  // Check if we should force classification
  const forceClassify = context.currentRound > context.maxRounds ||
    context.totalQuestionsAsked >= context.maxQuestions;

  // Format hierarchy context if available
  let hierarchySection = '';
  if (hierarchyContext && hierarchyContext.childCodes.length > 0) {
    const childCodesText = hierarchyContext.childCodes
      .slice(0, 15)
      .map(c => `  - ${c.code}: ${c.description}${c.isLeaf ? ' [LEAF]' : ''}`)
      .join('\n');

    const dimensionsText = hierarchyContext.dimensions
      .map(d => `  - ${d.name}: ${d.values.join(', ')}`)
      .join('\n');

    const suggestedQuestionsText = hierarchyContext.suggestedQuestions
      .map(q => `  - "${q.text}" (Options: ${q.options.join(', ')})`)
      .join('\n');

    hierarchySection = `
**HIERARCHY ANALYSIS (CRITICAL - USE THIS FOR QUESTIONS):**
Parent Code: ${hierarchyContext.parentCode} - ${hierarchyContext.parentDescription}
Has Deeper Hierarchy: ${hierarchyContext.hasDeepHierarchy ? 'Yes (children have children)' : 'No (these are leaf codes)'}

Child Codes Under This Parent:
${childCodesText}

Distinguishing Dimensions Found:
${dimensionsText || '  (None detected - analyze child descriptions manually)'}

Suggested Questions Based on Hierarchy:
${suggestedQuestionsText || '  (None generated - create questions from child code differences)'}

⚠️ IMPORTANT: The child codes above show exactly what distinguishes the 8-digit tariff lines.
Use these differences to formulate your questions. For example:
- If children differ by "Arabica" vs "Robusta", ask about coffee species
- If children differ by "A Grade" vs "B Grade", ask about quality grade
- If children differ by "plantation" vs "cherry", ask about processing method
`;
  }

  // Format exclusion context for "Other" codes classification
  let exclusionSection = '';
  if (exclusionContexts.length > 0) {
    const exclusionParts = exclusionContexts.map((exclusionContext: ExclusionAnalysis) => {
      const specificCodesText = exclusionContext.specificCodes
        .map((c: { code: string; description: string; specificTerms: string[] }) =>
          `    - ${c.code}: ${c.description} [SPECIFIC: ${c.specificTerms.join(', ')}]`)
        .join('\n');

      return `
  Parent: ${exclusionContext.parentCode} (${exclusionContext.parentDescription})
  Specific codes (product MUST match one of these to use them):
${specificCodesText}
  "Other" code (use when product does NOT match any specific code):
    - ${exclusionContext.otherCode!.code}: ${exclusionContext.otherCode!.description}`;
    }).join('\n');

    exclusionSection = `
**"OTHER" CODE CLASSIFICATION LOGIC (CRITICAL!):**
The following categories have "Other" catch-all codes. Use them when product does NOT match specific codes:
${exclusionParts}

⚠️ CLASSIFICATION RULE FOR "OTHER" CODES:
1. Check if product MATCHES a specific code (has the specific terms like "flavoured", "roasted", etc.)
2. If YES → use that specific code
3. If NO (e.g., "unflavoured", "plain", "without", or just not mentioned) → use the "Other" code
4. Example: "unflavoured instant coffee" does NOT match "flavoured" → classify as "Other" (2101.11.20)
5. Example: "plain green tea" does NOT match "flavoured" → classify as "Other"
`;
  }

  // Format chapter notes
  let notesSection = '';
  if (noteContext) {
    const formattedNotes = formatNotesForPrompt(noteContext, 1000);
    if (formattedNotes.length > 0) {
      notesSection = `
**CHAPTER NOTES (Legal Classification Rules):**
${formattedNotes}
`;
    }
  }

  return `**PRODUCT TO CLASSIFY:**
"${context.enhancedQuery}"

**ORIGINAL INPUT:**
"${context.originalQuery}"

**CONVERSATION HISTORY:**
${historyText}

**TOP CANDIDATE HS CODES:**
${candidatesText}
${hierarchySection}${exclusionSection}${notesSection}
**CURRENT STATUS:**
- Round: ${context.currentRound} of ${context.maxRounds}
- Questions asked: ${context.totalQuestionsAsked} of ${context.maxQuestions}
${forceClassify ? '- ⚠️ MUST CLASSIFY NOW (max questions/rounds reached)' : ''}

**YOUR TASK:**
${forceClassify ? 'You MUST provide a final classification now.' : `Decide whether to:
1. ASK CLARIFYING QUESTIONS - if the product is ambiguous and questions would help
2. CLASSIFY DIRECTLY - if you have enough information for accurate classification`}

**WHEN TO ASK QUESTIONS:**
- PRIORITIZE questions derived from HIERARCHY ANALYSIS above (species, grade, processing method)
- Material is unclear (e.g., "shirt" - cotton? polyester? silk?)
- Form/state is ambiguous (e.g., "mango" - fresh? dried? juice? pulp?)
- End use is unclear (e.g., "pump" - water? fuel? medical?)
- Target market matters (e.g., "shoes" - men? women? children?)
- Processing level unclear (e.g., "chicken" - live? fresh? frozen? cooked?)
- Multiple candidate codes in different chapters have similar scores

**CRITICAL: USE HIERARCHY-DERIVED QUESTIONS FIRST!**
If the HIERARCHY ANALYSIS section shows child codes with distinguishing dimensions like:
- Species (Arabica, Robusta) → Ask "What species of coffee?"
- Grade (A, B, C, PB, AB) → Ask "What grade is the product?"
- Processing (plantation, cherry, parchment) → Ask "How was it processed?"
These hierarchy-derived questions are MORE IMPORTANT than generic questions!

**WHEN TO CLASSIFY DIRECTLY:**
- Description is specific (e.g., "100% cotton men's t-shirt size M")
- Only one clear candidate exists
- Candidates are all in the same subheading
- Previous answers have resolved ambiguity

**QUESTION GUIDELINES (if asking):**
- Ask 1-2 questions maximum per round
- Questions must help distinguish between HS codes
- Options should cover 3-5 most likely answers
- Always include allowOther: true for edge cases
- Make questions clear and simple

**IMPORTANT - 8-DIGIT CODE REQUIREMENT:**
India uses 8-digit ITC-HS codes (e.g., 0902.10.10, not 0902.10).
- ALWAYS return 8-digit codes in format XXXX.XX.XX
- 6-digit codes (XXXX.XX) are parent categories - drill down to 8-digit
- If you see candidates like "0902.10", look for children like "0902.10.10", "0902.10.20"
- If the exact 8-digit is uncertain, ask a clarifying question about pack size/form/type

**RESPONSE FORMAT (STRICT JSON):**

If asking questions:
{
  "decision": "ask_questions",
  "context": "Brief explanation why these questions help (1 sentence)",
  "questions": [
    {
      "id": "q${context.currentRound}_descriptive_name",
      "text": "Clear question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "allowOther": true,
      "priority": "required"
    }
  ]
}

If classifying (MUST use 8-digit codes):
{
  "decision": "classify",
  "rankedOptions": [
    {"code": "1234.56.78", "confidence": 92, "rank": 1},
    {"code": "1234.56.90", "confidence": 78, "rank": 2},
    {"code": "1234.57.00", "confidence": 65, "rank": 3}
  ],
  "reasoning": "Detailed explanation of why this code is correct...",
  "clarificationImpact": ${context.previousTurns.length > 0 ? '"How the clarifications helped narrow down the classification"' : 'null'}
}`;
}

// ========================================
// Process LLM Decision
// ========================================

/**
 * Process LLM decision and return appropriate response
 */
async function processLLMDecision(
  conversationId: string,
  context: ConversationContext,
  decision: LLMDecision,
  candidates: Candidate[],
  llmTime: number,
  startTime: number
): Promise<ConversationalClassifyResponse> {
  // Get current turn count
  const existingTurns = await prisma.conversationTurn.count({
    where: { conversationId }
  });
  const turnNumber = existingTurns + 1;

  if (decision.decision === 'ask_questions' && decision.questions && decision.questions.length > 0) {
    // Store question turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'question',
        questionContext: decision.context,
        questions: decision.questions as unknown as any,
        llmModel: 'gpt-4o',
        responseTimeMs: llmTime,
        candidatesFound: candidates.length
      }
    });

    // Update conversation metrics
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        totalQuestions: context.totalQuestionsAsked + decision.questions.length,
        totalRounds: context.currentRound
      }
    });

    logger.info(`Asking ${decision.questions.length} questions in round ${context.currentRound}`);

    return {
      success: true,
      conversationId,
      responseType: 'questions',
      questions: decision.questions,
      questionContext: decision.context || 'To provide the most accurate HS code, we need a bit more information.',
      roundNumber: context.currentRound,
      totalQuestionsAsked: context.totalQuestionsAsked + decision.questions.length,
      timestamp: new Date().toISOString()
    };

  } else {
    // Classification decision
    const rankedOptions = decision.rankedOptions || [];
    const topOption = rankedOptions[0];

    // Get full details for selected code - ensuring 8-digit format
    let selectedCode = topOption?.code || candidates[0]?.code || '';
    let description = '';
    let confidence = topOption?.confidence || 50;

    if (selectedCode) {
      // Ensure we have an 8-digit code
      const validatedCode = await ensureEightDigitCode(selectedCode);
      selectedCode = validatedCode.code;
      description = validatedCode.description;

      logger.debug(`Code validation: ${topOption?.code} -> ${selectedCode}`);
    }

    // Get alternatives - also ensuring 8-digit format
    const alternativeCodes = rankedOptions.slice(1, 4).map(o => o.code);
    const alternativeDetails: { code: string; description: string }[] = [];

    for (const altCode of alternativeCodes) {
      const validated = await ensureEightDigitCode(altCode);
      if (validated.code && validated.code !== selectedCode) {
        alternativeDetails.push(validated);
      }
    }

    const result: ClassificationResult = {
      hsCode: selectedCode,
      description,
      confidence,
      reasoning: decision.reasoning || 'Classification based on product analysis',
      alternatives: alternativeDetails.map((alt, idx) => ({
        code: alt.code,
        description: alt.description,
        confidence: rankedOptions[idx + 1]?.confidence
      })),
      clarificationImpact: decision.clarificationImpact || undefined
    };

    // Store classification turn
    await prisma.conversationTurn.create({
      data: {
        conversationId,
        turnNumber,
        responseType: 'classification',
        hsCode: result.hsCode,
        hsDescription: result.description,
        confidence: result.confidence,
        reasoning: result.reasoning,
        alternatives: result.alternatives as unknown as any,
        llmModel: 'gpt-4o',
        responseTimeMs: llmTime,
        candidatesFound: candidates.length
      }
    });

    // Mark conversation as completed
    await markConversationCompleted(conversationId, result);

    // Build conversation summary
    const summary = await buildConversationSummary(conversationId, startTime);

    logger.info(`Classification complete: ${result.hsCode} (${result.confidence}%)`);

    return {
      success: true,
      conversationId,
      responseType: 'classification',
      result,
      conversationSummary: summary,
      timestamp: new Date().toISOString()
    };
  }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Validate and ensure 8-digit HS code format
 * If a 6-digit code is provided, try to find the best 8-digit child code
 */
async function ensureEightDigitCode(code: string): Promise<{ code: string; description: string }> {
  // Check if code is already 8-digit (format: XXXX.XX.XX)
  const is8Digit = /^\d{4}\.\d{2}\.\d{2}$/.test(code);

  if (is8Digit) {
    // Verify it exists in database
    const existing = await prisma.hsCode.findFirst({
      where: { code },
      select: { code: true, description: true }
    });
    if (existing) {
      return existing;
    }
  }

  // Try to find child codes if this is a parent code
  const normalizedCode = code.replace(/\./g, '');
  const codePattern = code.replace(/\./g, '').substring(0, 6); // Get first 6 digits

  // Find all 8-digit children of this code
  const childCodes = await prisma.hsCode.findMany({
    where: {
      code: {
        startsWith: code.substring(0, 7) // Match heading (e.g., "0902.10")
      },
      AND: {
        code: {
          not: code // Exclude the parent itself
        }
      }
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  // Filter to only 8-digit codes
  const eightDigitChildren = childCodes.filter(c => /^\d{4}\.\d{2}\.\d{2}$/.test(c.code));

  if (eightDigitChildren.length > 0) {
    // Return the first child (most general) or the one that's not "Other"
    const nonOther = eightDigitChildren.find(c => !c.description.toLowerCase().includes('other'));
    return nonOther || eightDigitChildren[0]!;
  }

  // If no children found, check if the code itself exists
  const selfCode = await prisma.hsCode.findFirst({
    where: { code },
    select: { code: true, description: true }
  });

  if (selfCode) {
    return selfCode;
  }

  // Fallback: try adding .00 to make it 8-digit
  const paddedCode = code.includes('.')
    ? (code.split('.').length === 2 ? `${code}.00` : code)
    : `${code.substring(0, 4)}.${code.substring(4, 6)}.00`;

  const paddedResult = await prisma.hsCode.findFirst({
    where: { code: paddedCode },
    select: { code: true, description: true }
  });

  return paddedResult || { code, description: '' };
}

/**
 * Build enhanced query from original description and all answers
 */
function buildEnhancedQuery(
  originalDescription: string,
  turns: any[],
  latestAnswers: UserAnswers
): string {
  const allAnswers: string[] = [];

  // Collect answers from previous turns
  for (const turn of turns) {
    if (turn.responseType === 'question' && turn.userAnswers) {
      const answers = turn.userAnswers as UserAnswers;
      for (const answer of Object.values(answers)) {
        if (answer && !answer.startsWith('other:')) {
          allAnswers.push(answer);
        } else if (answer?.startsWith('other:')) {
          allAnswers.push(answer.replace('other:', '').trim());
        }
      }
    }
  }

  // Add latest answers
  for (const answer of Object.values(latestAnswers)) {
    if (answer && !answer.startsWith('other:')) {
      allAnswers.push(answer);
    } else if (answer?.startsWith('other:')) {
      allAnswers.push(answer.replace('other:', '').trim());
    }
  }

  // Build enhanced query
  if (allAnswers.length === 0) {
    return originalDescription;
  }

  return `${originalDescription}. Additional details: ${allAnswers.join(', ')}`;
}

/**
 * Mark conversation as completed
 */
async function markConversationCompleted(
  conversationId: string,
  result: ClassificationResult
): Promise<void> {
  await prisma.classificationConversation.update({
    where: { id: conversationId },
    data: {
      status: 'completed',
      finalHsCode: result.hsCode,
      finalConfidence: result.confidence,
      finalReasoning: result.reasoning,
      finalDescription: result.description,
      completedAt: new Date()
    }
  });
}

/**
 * Build conversation summary for response
 */
async function buildConversationSummary(
  conversationId: string,
  startTime: number
): Promise<ConversationSummary> {
  const conversation = await prisma.classificationConversation.findUnique({
    where: { id: conversationId },
    include: {
      turns: {
        orderBy: { turnNumber: 'asc' }
      }
    }
  });

  const history: ConversationHistoryItem[] = [];
  let questionsAsked = 0;
  let answersProvided = 0;

  if (conversation) {
    for (const turn of conversation.turns) {
      if (turn.responseType === 'question') {
        const questions = turn.questions as ClarifyingQuestion[] | null;
        if (questions) {
          for (const q of questions) {
            questionsAsked++;
            history.push({
              turn: turn.turnNumber,
              type: 'question',
              content: q.text,
              timestamp: turn.createdAt.toISOString()
            });
          }
        }

        const answers = turn.userAnswers as UserAnswers | null;
        if (answers) {
          for (const [qId, answer] of Object.entries(answers)) {
            answersProvided++;
            history.push({
              turn: turn.turnNumber,
              type: 'answer',
              content: qId,
              selectedOption: answer,
              timestamp: turn.answeredAt?.toISOString() || turn.createdAt.toISOString()
            });
          }
        }
      } else if (turn.responseType === 'classification') {
        history.push({
          turn: turn.turnNumber,
          type: 'classification',
          content: `${turn.hsCode} - ${turn.hsDescription}`,
          timestamp: turn.createdAt.toISOString()
        });
      }
    }
  }

  return {
    totalRounds: conversation?.totalRounds || 0,
    questionsAsked,
    answersProvided,
    durationMs: Date.now() - startTime,
    history
  };
}

/**
 * Create error response
 */
function createErrorResponse(message: string): ConversationalClassifyResponse {
  return {
    success: false,
    conversationId: '',
    responseType: 'classification',
    error: message,
    timestamp: new Date().toISOString()
  };
}

// ========================================
// Conversation Management
// ========================================

/**
 * Get conversation by ID
 */
export async function getConversation(conversationId: string) {
  return prisma.classificationConversation.findUnique({
    where: { id: conversationId },
    include: {
      turns: {
        orderBy: { turnNumber: 'asc' }
      }
    }
  });
}

/**
 * Abandon a conversation
 */
export async function abandonConversation(conversationId: string): Promise<boolean> {
  try {
    await prisma.classificationConversation.update({
      where: { id: conversationId },
      data: {
        status: 'abandoned',
        completedAt: new Date()
      }
    });
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
  const abandoned = await prisma.classificationConversation.count({
    where: { status: 'abandoned' }
  });
  const active = await prisma.classificationConversation.count({
    where: { status: 'active' }
  });

  const avgRounds = await prisma.classificationConversation.aggregate({
    where: { status: 'completed' },
    _avg: { totalRounds: true }
  });

  const avgQuestions = await prisma.classificationConversation.aggregate({
    where: { status: 'completed' },
    _avg: { totalQuestions: true }
  });

  return {
    total,
    completed,
    abandoned,
    active,
    completionRate: total > 0 ? (completed / total) * 100 : 0,
    abandonmentRate: total > 0 ? (abandoned / total) * 100 : 0,
    averageRounds: avgRounds._avg.totalRounds || 0,
    averageQuestions: avgQuestions._avg.totalQuestions || 0
  };
}

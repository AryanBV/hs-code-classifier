/**
 * Conversation Types for LLM-Generated Clarifying Questions
 *
 * These types define the API contract for conversational classification,
 * where the LLM can ask clarifying questions before making a final classification.
 */

// ========================================
// Request Types
// ========================================

/**
 * Request to start or continue a classification conversation
 */
export interface ConversationalClassifyRequest {
  /** Product description from user */
  productDescription: string;

  /** Continue existing conversation (omit for new conversation) */
  conversationId?: string;

  /** Client session ID for tracking */
  sessionId: string;

  /** User's answers to previous questions */
  answers?: UserAnswers;
}

/**
 * User's answers to clarifying questions
 * Key is questionId, value is selected option or "other:custom text"
 */
export interface UserAnswers {
  [questionId: string]: string;
}

// ========================================
// Response Types
// ========================================

/**
 * Unified response - either asks questions or provides classification
 */
export interface ConversationalClassifyResponse {
  /** Whether the request succeeded */
  success: boolean;

  /** Unique conversation ID (use to continue conversation) */
  conversationId: string;

  /** Response type: 'questions' or 'classification' */
  responseType: 'questions' | 'classification';

  // ----- If responseType = 'questions' -----

  /** Array of clarifying questions to ask */
  questions?: ClarifyingQuestion[];

  /** Brief explanation of why these questions help */
  questionContext?: string;

  /** Current round number (1, 2, or 3) */
  roundNumber?: number;

  /** Total questions asked so far in this conversation */
  totalQuestionsAsked?: number;

  // ----- If responseType = 'classification' -----

  /** Final classification result */
  result?: ClassificationResult;

  /** Summary of the conversation for audit/display */
  conversationSummary?: ConversationSummary;

  // ----- Always present -----

  /** ISO timestamp of response */
  timestamp: string;

  /** Error message if success is false */
  error?: string;
}

/**
 * A single clarifying question
 */
export interface ClarifyingQuestion {
  /** Unique question ID (e.g., "q1_material", "q2_form") */
  id: string;

  /** Question text to display */
  text: string;

  /** Multiple choice options */
  options: string[];

  /** Whether to show "Other" with text input */
  allowOther: boolean;

  /** Question priority */
  priority: 'required' | 'optional';
}

/**
 * Final classification result
 */
export interface ClassificationResult {
  /** HS code (e.g., "0804.50.20") */
  hsCode: string;

  /** Official description of the HS code */
  description: string;

  /** Confidence score 0-100 */
  confidence: number;

  /** Detailed reasoning explaining the classification */
  reasoning: string;

  /** Alternative HS codes that might apply */
  alternatives: AlternativeCode[];

  /** Explanation of how clarifications improved accuracy */
  clarificationImpact?: string;
}

/**
 * Alternative HS code suggestion
 */
export interface AlternativeCode {
  /** HS code */
  code: string;

  /** Description */
  description: string;

  /** Confidence for this alternative */
  confidence?: number;
}

/**
 * Summary of the conversation for audit trail
 */
export interface ConversationSummary {
  /** Number of question rounds */
  totalRounds: number;

  /** Total questions asked */
  questionsAsked: number;

  /** Total answers provided by user */
  answersProvided: number;

  /** Total conversation duration in milliseconds */
  durationMs: number;

  /** All Q&A pairs for display */
  history: ConversationHistoryItem[];
}

/**
 * Single item in conversation history
 */
export interface ConversationHistoryItem {
  /** Turn number */
  turn: number;

  /** Type of turn */
  type: 'question' | 'answer' | 'classification';

  /** Question text or classification result */
  content: string;

  /** For answers: the selected option */
  selectedOption?: string;

  /** Timestamp */
  timestamp: string;
}

// ========================================
// Internal Service Types
// ========================================

/**
 * Context passed to LLM for decision making
 */
export interface ConversationContext {
  /** Original product description */
  originalQuery: string;

  /** Enhanced query built from original + all answers */
  enhancedQuery: string;

  /** Current round number */
  currentRound: number;

  /** Total questions asked so far */
  totalQuestionsAsked: number;

  /** Maximum questions allowed */
  maxQuestions: number;

  /** Maximum rounds allowed */
  maxRounds: number;

  /** Previous Q&A pairs */
  previousTurns: PreviousTurn[];
}

/**
 * Previous turn data for context
 */
export interface PreviousTurn {
  /** Turn number */
  turnNumber: number;

  /** Questions asked (if question turn) */
  questions?: ClarifyingQuestion[];

  /** User's answers */
  answers?: UserAnswers;
}

/**
 * LLM decision response (parsed from JSON)
 */
export interface LLMDecision {
  /** Decision type */
  decision: 'ask_questions' | 'classify';

  // ----- If decision = 'ask_questions' -----

  /** Context for why asking */
  context?: string;

  /** Questions to ask */
  questions?: ClarifyingQuestion[];

  // ----- If decision = 'classify' -----

  /** Ranked classification options */
  rankedOptions?: RankedOption[];

  /** Classification reasoning */
  reasoning?: string;

  /** Impact of clarifications */
  clarificationImpact?: string;
}

/**
 * Ranked HS code option from LLM
 */
export interface RankedOption {
  /** HS code */
  code: string;

  /** Confidence score */
  confidence: number;

  /** Rank (1 = best) */
  rank: number;

  /** Description (added from database) */
  description?: string;
}

// ========================================
// Database Types (matching Prisma schema)
// ========================================

/**
 * Conversation status enum
 */
export type ConversationStatus = 'active' | 'completed' | 'abandoned';

/**
 * Turn response type enum
 */
export type TurnResponseType = 'question' | 'classification';

// ========================================
// Constants
// ========================================

/** Maximum questions allowed per conversation */
export const MAX_QUESTIONS = 6;

/** Maximum rounds allowed per conversation */
export const MAX_ROUNDS = 3;

/** Maximum questions per round (increased to ensure critical dimensions are covered) */
export const MAX_QUESTIONS_PER_ROUND = 3;

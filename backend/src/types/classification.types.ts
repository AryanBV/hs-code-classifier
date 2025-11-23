/**
 * TypeScript type definitions for HS Code Classification system
 */

// ========================================
// Request/Response Types
// ========================================

/**
 * Classification request payload
 */
export interface ClassifyRequest {
  productDescription: string;
  destinationCountry?: string;
  questionnaireAnswers?: QuestionnaireAnswers;
}

/**
 * Dynamic questionnaire answers
 * Key-value pairs where key is question ID and value is the answer
 */
export interface QuestionnaireAnswers {
  [questionId: string]: string | string[] | number;
}

/**
 * Classification response
 */
export interface ClassifyResponse {
  success: boolean;
  results: ClassificationResult[];
  classificationId: string;
  timestamp: string;
}

/**
 * Individual classification result
 */
export interface ClassificationResult {
  hsCode: string;
  description: string;
  confidence: number; // 0-100
  reasoning: string;
  countryMapping?: CountryMappingInfo;
  method?: ClassificationMethod; // Which method suggested this code
}

/**
 * Country-specific mapping information
 */
export interface CountryMappingInfo {
  india: string;
  destination?: string;
  destinationCountry?: string;
  importDuty?: string;
  specialRequirements?: string;
}

/**
 * Classification methods used
 */
export enum ClassificationMethod {
  KEYWORD_MATCH = 'keyword_match',
  DECISION_TREE = 'decision_tree',
  AI_REASONING = 'ai_reasoning',
  HYBRID = 'hybrid'
}

// ========================================
// Service Layer Types
// ========================================

/**
 * Keyword matching result
 */
export interface KeywordMatchResult {
  hsCode: string;
  matchScore: number; // 0-100
  matchedKeywords: string[];
  description: string;
}

/**
 * Decision tree classification result
 */
export interface DecisionTreeResult {
  hsCode: string;
  confidence: number; // 0-100
  rulesMatched: string[];
  reasoning: string;
}

/**
 * AI classification result from OpenAI
 */
export interface AIClassificationResult {
  hsCode: string;
  confidence: number; // 0-100
  reasoning: string;
  alternativeCodes?: string[];
}

/**
 * Combined confidence score from all methods
 */
export interface ConfidenceScore {
  finalScore: number; // 0-100
  breakdown: {
    keywordMatch: number;
    decisionTree: number;
    aiReasoning: number;
  };
  weights: {
    keywordMatch: number; // 0.30
    decisionTree: number; // 0.40
    aiReasoning: number;  // 0.30
  };
}

// ========================================
// Database Types (from Prisma)
// ========================================

/**
 * HS Code database record
 */
export interface HsCodeRecord {
  id: number;
  code: string;
  chapter: string;
  heading: string;
  subheading: string;
  countryCode: string;
  description: string;
  keywords: string[];
  commonProducts: string[];
  parentCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Decision tree structure stored in database
 */
export interface DecisionTreeFlow {
  questions: Question[];
  rules: DecisionRule[];
}

/**
 * Question in decision tree
 */
export interface Question {
  id: string;
  text: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'number';
  options?: string[];
  nextQuestionMap?: { [answer: string]: string | null };
}

/**
 * Decision rule for classification
 */
export interface DecisionRule {
  conditions: {
    [questionId: string]: string | string[] | undefined;
  };
  suggestedCodes: string[];
  confidenceBoost: number; // 0-100
}

/**
 * User classification record for tracking
 */
export interface UserClassificationRecord {
  id: number;
  sessionId: string | null;
  productDescription: string;
  categoryDetected: string | null;
  questionnaireAnswers: QuestionnaireAnswers | null;
  suggestedHsCode: string | null;
  confidenceScore: number | null;
  countryCode: string | null;
  userFeedback: 'correct' | 'incorrect' | 'unsure' | null;
  correctedCode: string | null;
  createdAt: Date;
}

// ========================================
// Utility Types
// ========================================

/**
 * Extracted keywords from product description
 */
export interface ExtractedKeywords {
  primary: string[];   // Most important keywords
  secondary: string[]; // Supporting keywords
  filtered: string[];  // Stopwords removed
}

/**
 * Category detection result
 */
export interface CategoryDetection {
  category: string;
  confidence: number;
  subcategories?: string[];
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  details?: any;
}

// ========================================
// Constants
// ========================================

/**
 * Default confidence score weights
 */
export const DEFAULT_WEIGHTS = {
  KEYWORD_MATCH: 0.30,
  DECISION_TREE: 0.40,
  AI_REASONING: 0.30
} as const;

/**
 * Minimum confidence threshold for suggestions
 */
export const MIN_CONFIDENCE_THRESHOLD = 50;

/**
 * Maximum number of alternative codes to return
 */
export const MAX_ALTERNATIVE_CODES = 3;

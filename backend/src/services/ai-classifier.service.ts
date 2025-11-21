/**
 * AI Classification Service
 *
 * Uses OpenAI GPT-4o for edge case classification and reasoning generation
 *
 * Weight: 30% of final confidence score
 * Usage: Limited to 20% of queries to control costs
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger';
import {
  AIClassificationResult,
  QuestionnaireAnswers,
  KeywordMatchResult,
  DecisionTreeResult
} from '../types/classification.types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Build prompt for HS code classification
 *
 * @param productDescription - Product description
 * @param questionnaireAnswers - User's questionnaire answers
 * @param keywordMatches - Results from keyword matching (for context)
 * @param decisionTreeResults - Results from decision tree (for context)
 * @returns Formatted prompt for GPT-4o
 *
 * TODO: Implement prompt engineering
 * - Include product description
 * - Include questionnaire answers
 * - Include context from keyword matching and decision tree
 * - Specify desired output format (JSON)
 * - Include examples for few-shot learning
 * - Add constraints (return valid HS codes only)
 */
function buildClassificationPrompt(
  productDescription: string,
  questionnaireAnswers: QuestionnaireAnswers,
  keywordMatches: KeywordMatchResult[],
  decisionTreeResults: DecisionTreeResult[]
): string {
  // TODO: Implement comprehensive prompt
  // Example structure:
  /*
  You are an expert in HS code classification for Indian exports.

  Product Description: ${productDescription}

  Questionnaire Answers:
  ${JSON.stringify(questionnaireAnswers, null, 2)}

  Context from other methods:
  - Keyword matching suggests: ${keywordMatches.map(m => m.hsCode).join(', ')}
  - Decision tree suggests: ${decisionTreeResults.map(r => r.hsCode).join(', ')}

  Task: Classify this product and provide:
  1. Most likely HS code (6-10 digits, Indian format)
  2. Confidence score (0-100)
  3. Clear reasoning for your classification
  4. Alternative codes if applicable

  Return response as JSON:
  {
    "hsCode": "8708.30.10",
    "confidence": 85,
    "reasoning": "This product is...",
    "alternativeCodes": ["8708.30.90"]
  }
  */

  // Placeholder prompt
  return `Classify this product: ${productDescription}`;
}

/**
 * Call OpenAI API for classification
 *
 * @param prompt - Formatted classification prompt
 * @returns Parsed AI classification result
 *
 * TODO: Implement OpenAI API call
 * - Use GPT-4o model
 * - Set appropriate temperature (0.3-0.5 for consistency)
 * - Parse JSON response
 * - Handle API errors gracefully
 * - Add retry logic for transient failures
 * - Log token usage for cost tracking
 */
async function callOpenAI(prompt: string): Promise<AIClassificationResult> {
  logger.debug('Calling OpenAI API for classification');

  try {
    // TODO: Implement API call
    // const response = await openai.chat.completions.create({
    //   model: 'gpt-4o',
    //   messages: [
    //     {
    //       role: 'system',
    //       content: 'You are an expert HS code classifier for Indian exports.'
    //     },
    //     {
    //       role: 'user',
    //       content: prompt
    //     }
    //   ],
    //   temperature: 0.3,
    //   response_format: { type: 'json_object' }
    // });

    // TODO: Parse response
    // const result = JSON.parse(response.choices[0].message.content);

    // TODO: Log token usage
    // logger.info(`OpenAI tokens used: ${response.usage?.total_tokens}`);

    // Placeholder return
    return {
      hsCode: '0000.00.00',
      confidence: 0,
      reasoning: 'AI classification not yet implemented',
      alternativeCodes: []
    };

  } catch (error) {
    logger.error('Error calling OpenAI API');
    logger.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Validate AI classification result
 *
 * @param result - AI classification result
 * @returns true if result is valid
 *
 * TODO: Implement validation
 * - Check HS code format (should be 4-10 digits with optional dots)
 * - Verify confidence is between 0-100
 * - Ensure reasoning is present and meaningful
 * - Validate alternative codes if provided
 */
function validateAIResult(result: AIClassificationResult): boolean {
  // TODO: Implement validation logic
  if (!result.hsCode || !result.reasoning) {
    return false;
  }

  if (result.confidence < 0 || result.confidence > 100) {
    return false;
  }

  // Placeholder validation
  return true;
}

/**
 * Main AI classification function
 *
 * @param productDescription - Product description
 * @param questionnaireAnswers - User's questionnaire answers
 * @param keywordMatches - Context from keyword matching
 * @param decisionTreeResults - Context from decision tree
 * @param forceAI - Force AI classification even if confidence is high from other methods
 * @returns AI classification result
 *
 * This orchestrates the AI classification process:
 * 1. Build comprehensive prompt with all context
 * 2. Call OpenAI API
 * 3. Parse and validate response
 * 4. Return structured result
 *
 * Cost optimization:
 * - Only call AI if other methods have low confidence
 * - Or if explicitly requested (forceAI = true)
 * - Track usage to stay within budget
 */
export async function classifyWithAI(
  productDescription: string,
  questionnaireAnswers: QuestionnaireAnswers,
  keywordMatches: KeywordMatchResult[] = [],
  decisionTreeResults: DecisionTreeResult[] = [],
  forceAI: boolean = false
): Promise<AIClassificationResult | null> {
  logger.info('Starting AI classification');

  // TODO: Implement cost optimization logic
  // Check if AI is needed based on other methods' confidence
  // if (!forceAI && hasHighConfidenceFromOtherMethods()) {
  //   logger.info('Skipping AI - other methods have high confidence');
  //   return null;
  // }

  try {
    // Step 1: Build prompt
    const prompt = buildClassificationPrompt(
      productDescription,
      questionnaireAnswers,
      keywordMatches,
      decisionTreeResults
    );

    // Step 2: Call OpenAI
    const result = await callOpenAI(prompt);

    // Step 3: Validate result
    if (!validateAIResult(result)) {
      logger.warn('AI result validation failed');
      return null;
    }

    logger.info(`AI classification complete: ${result.hsCode} (confidence: ${result.confidence})`);
    return result;

  } catch (error) {
    logger.error('AI classification failed');
    logger.error(error instanceof Error ? error.message : String(error));

    // Return null on error - other methods can still provide results
    return null;
  }
}

/**
 * Generate reasoning using AI (can be used separately)
 *
 * @param hsCode - HS code to explain
 * @param productDescription - Product description
 * @returns Human-readable reasoning
 *
 * TODO: Implement reasoning generation
 * - Use GPT-4o to explain why a specific HS code is correct
 * - Can be used to generate reasoning even if classification came from other methods
 */
export async function generateReasoning(
  hsCode: string,
  productDescription: string
): Promise<string> {
  logger.debug(`Generating reasoning for HS code ${hsCode}`);

  // TODO: Implement reasoning generation
  // Call OpenAI with prompt asking to explain why this code is correct

  return `Classification reasoning will be generated in Phase 1 implementation.`;
}

/**
 * AI Classification Service
 *
 * Uses OpenAI GPT-4o-mini (November 2024) for edge case classification
 * Model: gpt-4o-mini
 * Pricing: $0.15/M input tokens, $0.60/M output tokens (98.5% cheaper than GPT-4 Turbo)
 *
 * Weight: 30% of final confidence score
 * Usage: Limited to control costs with rate limiting
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
 * @returns Formatted prompt for GPT-4o-mini
 */
function buildClassificationPrompt(
  productDescription: string,
  questionnaireAnswers: QuestionnaireAnswers,
  keywordMatches: KeywordMatchResult[],
  decisionTreeResults: DecisionTreeResult[]
): string {
  const keywordSuggestions = keywordMatches.slice(0, 3).map(m => m.hsCode).join(', ') || 'None';
  const treeSuggestions = decisionTreeResults.slice(0, 3).map(r => r.hsCode).join(', ') || 'None';

  return `You are an expert in HS code classification for Indian exports following the Harmonized System of Nomenclature.

Product Description: ${productDescription}

Product Characteristics:
- Material: ${questionnaireAnswers.materialComposition || 'Not specified'}
- Primary Function: ${questionnaireAnswers.primaryFunction || 'Not specified'}
- Product Type: ${questionnaireAnswers.productType || 'Not specified'}
- End Use: ${questionnaireAnswers.endUse || 'Not specified'}

Context from other classification methods:
- Keyword matching suggests: ${keywordSuggestions}
- Decision tree suggests: ${treeSuggestions}

Task: Classify this product according to Indian HS Code (ITC-HS) format and provide:
1. Most likely HS code (6-10 digits, use dots for formatting like 8708.30.10)
2. Confidence score (0-100, be conservative)
3. Clear reasoning explaining why this code is correct
4. Up to 2 alternative codes if applicable

Rules:
- Prefer longer codes (8+ digits) when material/function is clearly specified
- Consider the General Rules for Interpretation (GRI)
- Prioritize function over material when both are valid
- Return ONLY valid Indian HS codes

Return response as valid JSON (no markdown):
{
  "hsCode": "8708.30.10",
  "confidence": 85,
  "reasoning": "This product is classified under Chapter 87 (vehicles and parts) because...",
  "alternativeCodes": ["8708.30.90"]
}`;
}

/**
 * Call OpenAI API for classification
 *
 * @param prompt - Formatted classification prompt
 * @returns Parsed AI classification result
 *
 * Uses GPT-4o-mini (November 2024) for cost efficiency
 * Temperature: 0.3 for consistent, focused responses
 * Logs token usage for cost tracking
 */
async function callOpenAI(prompt: string): Promise<AIClassificationResult> {
  logger.debug('Calling OpenAI API (gpt-4o-mini) for classification');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier for Indian exports. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 500  // Limit output tokens for cost control
    });

    // Parse response
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as AIClassificationResult;

    // Log token usage for cost tracking
    const usage = response.usage;
    if (usage) {
      const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;  // $0.15/M tokens
      const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;  // $0.60/M tokens
      const totalCost = inputCost + outputCost;

      logger.info(`OpenAI tokens: ${usage.total_tokens} (input: ${usage.prompt_tokens}, output: ${usage.completion_tokens})`);
      logger.info(`Estimated cost: $${totalCost.toFixed(6)}`);
    }

    return result;

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
 * Validates:
 * - HS code format (4-10 digits with optional dots)
 * - Confidence range (0-100)
 * - Reasoning presence and length
 * - Alternative codes format if provided
 */
function validateAIResult(result: AIClassificationResult): boolean {
  // Check required fields
  if (!result.hsCode || !result.reasoning) {
    logger.warn('AI result missing required fields');
    return false;
  }

  // Validate confidence range
  if (result.confidence < 0 || result.confidence > 100) {
    logger.warn(`Invalid confidence score: ${result.confidence}`);
    return false;
  }

  // Validate HS code format (digits and dots only, 4-12 characters)
  const hsCodePattern = /^[\d.]{4,12}$/;
  if (!hsCodePattern.test(result.hsCode)) {
    logger.warn(`Invalid HS code format: ${result.hsCode}`);
    return false;
  }

  // Check reasoning has meaningful content
  if (result.reasoning.length < 20) {
    logger.warn('Reasoning too short');
    return false;
  }

  // Validate alternative codes if present
  if (result.alternativeCodes && result.alternativeCodes.length > 0) {
    for (const code of result.alternativeCodes) {
      if (!hsCodePattern.test(code)) {
        logger.warn(`Invalid alternative code format: ${code}`);
        return false;
      }
    }
  }

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
 * Uses GPT-4o-mini to explain why a specific HS code is correct
 * Can be used to generate reasoning even if classification came from other methods
 */
export async function generateReasoning(
  hsCode: string,
  productDescription: string
): Promise<string> {
  logger.debug(`Generating reasoning for HS code ${hsCode}`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier. Explain classifications clearly and concisely.'
        },
        {
          role: 'user',
          content: `Explain why HS code "${hsCode}" is the correct classification for this product: "${productDescription}".

Include:
1. Which chapter/heading this belongs to and why
2. Key characteristics that led to this classification
3. What makes this code more appropriate than similar alternatives

Keep the explanation under 200 words.`
        }
      ],
      temperature: 0.4,
      max_tokens: 300
    });

    const reasoning = response.choices[0].message.content || 'Unable to generate reasoning';

    // Log token usage
    if (response.usage) {
      logger.info(`Reasoning generation tokens: ${response.usage.total_tokens}`);
    }

    return reasoning;

  } catch (error) {
    logger.error('Error generating reasoning');
    logger.error(error instanceof Error ? error.message : String(error));
    return `Classification to HS code ${hsCode} based on product characteristics.`;
  }
}

/**
 * AI Reasoner Service
 *
 * Generates detailed explanations and reasoning for HS code classifications
 * Uses OpenAI GPT-4o-mini to explain why a specific code is correct
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ReasoningResult {
  reasoning: string;
  confidence: number;
  explanation: string;
  alternatives?: string[];
}

/**
 * Generate detailed reasoning for an HS code classification
 *
 * @param hsCode - The HS code to explain
 * @param description - HS code description
 * @param productDescription - Product being classified
 * @returns Detailed reasoning and explanation
 */
export async function generateReasoningForCode(
  hsCode: string,
  description: string,
  productDescription: string
): Promise<ReasoningResult> {
  logger.debug(`Generating reasoning for HS code ${hsCode}`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier for Indian exports. Provide clear, technical explanations of HS code classifications.'
        },
        {
          role: 'user',
          content: `Explain why HS code "${hsCode}" (${description}) is the correct classification for this product:

Product: "${productDescription}"

Provide:
1. Chapter/Heading explanation
2. Why this code matches the product
3. Confidence level (0-100)
4. Key decision factors

Return as JSON only:
{
  "reasoning": "short reasoning",
  "confidence": 85,
  "explanation": "detailed explanation",
  "alternatives": []
}`
        }
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as ReasoningResult;

    logger.info(`Reasoning generated for ${hsCode}: ${result.confidence}% confidence`);
    return result;

  } catch (error) {
    logger.error('Error generating reasoning');
    logger.error(error instanceof Error ? error.message : String(error));

    // Return default reasoning if AI fails
    return {
      reasoning: `Classification to HS code ${hsCode} based on product characteristics.`,
      confidence: 0,
      explanation: `Unable to generate detailed explanation. Product matches HS code ${hsCode} (${description}).`
    };
  }
}

/**
 * Generate confidence score based on text similarity analysis
 *
 * @param productDescription - Product being classified
 * @param hsCodeDescription - HS code description
 * @returns Confidence score (0-100)
 */
export async function evaluateConfidence(
  productDescription: string,
  hsCodeDescription: string
): Promise<number> {
  logger.debug('Evaluating classification confidence');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at evaluating HS code classification confidence. Return ONLY a number 0-100.'
        },
        {
          role: 'user',
          content: `How confident are you (0-100) that this product:
"${productDescription}"

Should be classified under:
"${hsCodeDescription}"

Return only the number.`
        }
      ],
      temperature: 0.2,
      max_tokens: 10
    });

    const content = response.choices[0]?.message?.content?.trim() || '0';
    const confidence = Math.min(100, Math.max(0, parseInt(content, 10) || 0));

    logger.debug(`Confidence score: ${confidence}%`);
    return confidence;

  } catch (error) {
    logger.error('Error evaluating confidence');
    logger.error(error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * Determine if a product needs additional clarification
 *
 * @param productDescription - Product being classified
 * @returns True if clarification needed, false otherwise
 */
export async function needsClarification(
  productDescription: string
): Promise<boolean> {
  logger.debug('Checking if clarification is needed');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HS code classifier. Return ONLY true or false.'
        },
        {
          role: 'user',
          content: `Does this product description need clarification to classify accurately?
"${productDescription}"

Return only: true or false`
        }
      ],
      temperature: 0.2,
      max_tokens: 10
    });

    const content = response.choices[0]?.message?.content?.trim().toLowerCase() || 'false';
    return content === 'true';

  } catch (error) {
    logger.error('Error checking clarification need');
    logger.error(error instanceof Error ? error.message : String(error));
    return false;
  }
}

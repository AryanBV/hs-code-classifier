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
 * AI Call Tracker for Rate Limiting
 *
 * Tracks daily API calls to stay within budget
 * Daily limit: 100 calls (ensures cost < $5/day at ~$0.02/call)
 */
const aiCallTracker = {
  callsToday: 0,
  dailyLimit: 100,
  lastReset: new Date().toDateString()
};

/**
 * Check if AI rate limit has been exceeded
 *
 * @returns true if within limit, false if exceeded
 *
 * Automatically resets counter at midnight
 * Logs current usage for monitoring
 */
function checkRateLimit(): boolean {
  const today = new Date().toDateString();

  // Reset counter if new day
  if (aiCallTracker.lastReset !== today) {
    logger.info(`AI rate limit reset: ${aiCallTracker.callsToday} calls used yesterday`);
    aiCallTracker.callsToday = 0;
    aiCallTracker.lastReset = today;
  }

  // Check limit
  if (aiCallTracker.callsToday >= aiCallTracker.dailyLimit) {
    logger.warn(`AI rate limit exceeded: ${aiCallTracker.callsToday}/${aiCallTracker.dailyLimit} calls used today`);
    return false;
  }

  // Increment counter
  aiCallTracker.callsToday++;
  logger.info(`AI call ${aiCallTracker.callsToday}/${aiCallTracker.dailyLimit} today`);

  return true;
}

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

Few-shot Examples (Verified automotive parts classifications):

1. "Ceramic brake pads for motorcycles, finished product"
   → 8708.30.00 (Chapter 87: Vehicles; Heading 8708: Parts and accessories; Subheading: Brakes and servo-brakes)

2. "Engine oil filter paper element"
   → 8421.23.00 (Chapter 84: Machinery; Heading 8421: Filtering apparatus; Subheading: Oil filters for internal combustion engines)

3. "LED headlight bulb for motorcycles 6000K white light 30W"
   → 8539.29.40 (Chapter 85: Electrical equipment; Heading 8539: Electric lamps; Subheading: LED lamps)

4. "Hydraulic shock absorber for passenger cars gas-charged"
   → 8708.80.00 (Chapter 87: Vehicles; Heading 8708: Parts and accessories; Subheading: Suspension systems)

5. "Piston rings set for 4-cylinder petrol engine"
   → 8409.91.13 (Chapter 84: Machinery; Heading 8409: Parts for engines; Subheading: Pistons and piston rings)

6. "Friction clutch disc for manual transmission cars"
   → 8708.93.00 (Chapter 87: Vehicles; Heading 8708: Parts and accessories; Subheading: Clutches and parts)

7. "Radiator coolant antifreeze ethylene glycol concentrate"
   → 3820.00.00 (Chapter 38: Miscellaneous chemical products; Heading 3820: Antifreeze preparations)

8. "Spark plug for petrol engines copper electrode"
   → 8511.10.00 (Chapter 85: Electrical equipment; Heading 8511: Ignition equipment; Subheading: Spark plugs)

9. "Timing belt rubber toothed design for camshaft"
   → 4010.32.90 (Chapter 40: Rubber; Heading 4010: Conveyor or transmission belts; Subheading: Endless timing belts)

10. "Ball bearings deep groove for wheel hub sealed type"
    → 8482.10.20 (Chapter 84: Machinery; Heading 8482: Ball or roller bearings; Subheading: Ball bearings)

Task: Classify this product according to Indian HS Code (ITC-HS) format and provide:
1. Most likely HS code (6-10 digits, use dots for formatting like 8708.30.10)
2. Confidence score (0-100, be conservative - typically 70-85 for clear cases)
3. Clear reasoning explaining chapter, heading, and why this code is correct
4. Up to 2 alternative codes if applicable

Rules:
- Follow the examples above for similar products
- Prefer longer codes (8+ digits) when material/function is clearly specified
- Consider the General Rules for Interpretation (GRI)
- Prioritize function over material when both are valid
- Return ONLY valid Indian HS codes
- Use dots for formatting (e.g., 8708.30.00 not 87083000)

Return response as valid JSON (no markdown):
{
  "hsCode": "8708.30.00",
  "confidence": 85,
  "reasoning": "This product is classified under Chapter 87 (vehicles and parts), Heading 8708 (parts and accessories of motor vehicles), Subheading 8708.30 (brakes and servo-brakes and parts thereof) because...",
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
    const content = response.choices[0]?.message?.content;
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

  // Step 1: Calculate combined confidence from keyword + decision tree
  let keywordConfidence = 0;
  let treeConfidence = 0;

  if (keywordMatches.length > 0 && keywordMatches[0]) {
    keywordConfidence = keywordMatches[0].matchScore;
  }

  if (decisionTreeResults.length > 0 && decisionTreeResults[0]) {
    treeConfidence = decisionTreeResults[0].confidence;
  }

  // Combined confidence: keyword (30% weight) + decision tree (40% weight)
  const combinedConfidence = (keywordConfidence * 0.3) + (treeConfidence * 0.4);

  logger.info(`Combined confidence: ${combinedConfidence.toFixed(1)}% (keyword: ${keywordConfidence}% × 0.3 + tree: ${treeConfidence}% × 0.4)`);

  // Step 2: Decide if AI should be called
  // Only call AI if:
  // 1. Combined confidence < 70% (other methods uncertain), OR
  // 2. Explicitly requested (forceAI = true)
  if (!forceAI && combinedConfidence >= 70) {
    logger.info(`Skipping AI - combined confidence sufficient: ${combinedConfidence.toFixed(1)}% >= 70%`);
    logger.info(`  Cost savings: ~$0.0002 per skipped classification`);
    return null;
  }

  // Step 3: Check rate limit before making expensive API call
  if (!checkRateLimit()) {
    logger.warn('AI classification skipped - rate limit exceeded');
    logger.warn('Falling back to keyword + decision tree results only');
    return null;
  }

  logger.info(`Calling AI - combined confidence: ${combinedConfidence.toFixed(1)}% < 70% (threshold)`);
  logger.info(`  Expected cost: ~$0.0002 per classification`);

  try {
    // Step 4: Build prompt
    const prompt = buildClassificationPrompt(
      productDescription,
      questionnaireAnswers,
      keywordMatches,
      decisionTreeResults
    );

    // Step 5: Call OpenAI
    const result = await callOpenAI(prompt);

    // Step 6: Validate result
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

    const reasoning = response.choices[0]?.message?.content || 'Unable to generate reasoning';

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

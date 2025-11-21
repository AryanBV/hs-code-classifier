/**
 * Confidence Scorer Service
 *
 * Orchestrates all 3 classification methods and combines their results
 * into a final weighted confidence score
 *
 * Weights:
 * - Keyword Match: 30%
 * - Decision Tree: 40%
 * - AI Reasoning: 30%
 */

import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import {
  ClassifyRequest,
  ClassifyResponse,
  ClassificationResult,
  ConfidenceScore,
  DEFAULT_WEIGHTS,
  MIN_CONFIDENCE_THRESHOLD,
  MAX_ALTERNATIVE_CODES
} from '../types/classification.types';

// Import classification methods
import { keywordMatch, extractKeywords } from './keyword-matcher.service';
import { applyDecisionTree, detectCategory } from './decision-tree.service';
import { classifyWithAI } from './ai-classifier.service';

/**
 * Calculate weighted confidence score from all methods
 *
 * @param keywordScore - Score from keyword matching (0-100)
 * @param decisionTreeScore - Score from decision tree (0-100)
 * @param aiScore - Score from AI reasoning (0-100)
 * @returns Combined confidence score with breakdown
 *
 * Formula:
 * Final Score = (keyword × 0.30) + (decisionTree × 0.40) + (AI × 0.30)
 */
function calculateConfidence(
  keywordScore: number,
  decisionTreeScore: number,
  aiScore: number
): ConfidenceScore {
  const finalScore = Math.round(
    (keywordScore * DEFAULT_WEIGHTS.KEYWORD_MATCH) +
    (decisionTreeScore * DEFAULT_WEIGHTS.DECISION_TREE) +
    (aiScore * DEFAULT_WEIGHTS.AI_REASONING)
  );

  return {
    finalScore,
    breakdown: {
      keywordMatch: keywordScore,
      decisionTree: decisionTreeScore,
      aiReasoning: aiScore
    },
    weights: {
      keywordMatch: DEFAULT_WEIGHTS.KEYWORD_MATCH,
      decisionTree: DEFAULT_WEIGHTS.DECISION_TREE,
      aiReasoning: DEFAULT_WEIGHTS.AI_REASONING
    }
  };
}

/**
 * Merge and deduplicate results from all methods
 *
 * @param keywordResults - Results from keyword matching
 * @param decisionTreeResults - Results from decision tree
 * @param aiResult - Result from AI classification
 * @returns Deduplicated and scored results
 *
 * TODO: Implement result merging logic
 * - Group results by HS code
 * - If same code suggested by multiple methods, boost confidence
 * - Calculate final confidence using weighted formula
 * - Sort by confidence score
 * - Return top results
 */
function mergeResults(
  keywordResults: any[],
  decisionTreeResults: any[],
  aiResult: any
): ClassificationResult[] {
  logger.debug('Merging results from all classification methods');

  // TODO: Implement comprehensive merging logic
  // Example structure:
  // const resultMap = new Map<string, ClassificationResult>();
  //
  // Process keyword results
  // Process decision tree results
  // Process AI result
  //
  // Combine scores for duplicate codes
  // Sort by final confidence
  // Return top N results

  // Placeholder return
  return [];
}

/**
 * Get country mapping for an HS code
 *
 * @param indiaCode - India HS code
 * @param destinationCountry - Destination country code
 * @returns Country mapping info (local code, duty, requirements)
 *
 * TODO: Implement country mapping lookup
 * - Query country_mappings table
 * - Return mapping if exists
 * - Return null if no mapping found
 */
async function getCountryMapping(
  indiaCode: string,
  destinationCountry?: string
) {
  if (!destinationCountry) {
    return undefined;
  }

  try {
    // TODO: Implement database query
    // const mapping = await prisma.countryMapping.findFirst({
    //   where: {
    //     indiaCode,
    //     country: destinationCountry
    //   }
    // });

    // Placeholder return
    return undefined;

  } catch (error) {
    logger.error('Error fetching country mapping');
    return undefined;
  }
}

/**
 * Store classification in database for tracking
 *
 * @param request - Original classification request
 * @param results - Classification results
 * @param categoryDetected - Detected product category
 * @returns Classification ID for tracking
 *
 * TODO: Implement database storage
 * - Insert into user_classifications table
 * - Generate unique classification ID
 * - Store for analytics and learning
 */
async function storeClassification(
  request: ClassifyRequest,
  results: ClassificationResult[],
  categoryDetected: string
): Promise<string> {
  try {
    // TODO: Implement database insert
    // const classification = await prisma.userClassification.create({
    //   data: {
    //     sessionId: generateSessionId(),
    //     productDescription: request.productDescription,
    //     categoryDetected,
    //     questionnaireAnswers: request.questionnaireAnswers,
    //     suggestedHsCode: results[0]?.hsCode,
    //     confidenceScore: results[0]?.confidence,
    //     countryCode: request.destinationCountry
    //   }
    // });

    // Placeholder ID
    const classificationId = `cls_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info(`Classification stored with ID: ${classificationId}`);
    return classificationId;

  } catch (error) {
    logger.error('Error storing classification');
    logger.error(error instanceof Error ? error.message : String(error));
    return `cls_${Date.now()}`;
  }
}

/**
 * Main classification orchestrator
 *
 * @param request - Classification request (description, country, answers)
 * @returns Classification response with results and confidence scores
 *
 * This is the main entry point that:
 * 1. Extracts keywords from product description
 * 2. Detects product category
 * 3. Runs all 3 classification methods in parallel
 * 4. Merges and scores results
 * 5. Adds country mappings
 * 6. Stores classification for tracking
 * 7. Returns final results
 */
export async function classifyProduct(request: ClassifyRequest): Promise<ClassifyResponse> {
  const startTime = Date.now();
  logger.info('===== Starting Product Classification =====');
  logger.info(`Product: "${request.productDescription.substring(0, 100)}..."`);

  try {
    // Step 1: Extract keywords
    const keywords = extractKeywords(request.productDescription);
    logger.debug(`Keywords extracted: ${keywords.primary.join(', ')}`);

    // Step 2: Detect category
    const category = await detectCategory(request.productDescription);
    logger.info(`Category detected: ${category}`);

    // Step 3: Run all 3 methods (can be parallelized)
    logger.info('Running classification methods...');

    // TODO: Implement parallel execution
    const [keywordResults, decisionTreeResults, aiResult] = await Promise.allSettled([
      keywordMatch(request.productDescription, request.destinationCountry),
      applyDecisionTree(
        category,
        request.questionnaireAnswers || {},
        keywords.primary
      ),
      classifyWithAI(
        request.productDescription,
        request.questionnaireAnswers || {},
        [], // keywordResults - pass after they're ready
        []  // decisionTreeResults - pass after they're ready
      )
    ]);

    // TODO: Extract results from Promise.allSettled
    // Handle fulfilled and rejected promises
    // const keywordMatches = keywordResults.status === 'fulfilled' ? keywordResults.value : [];

    // Step 4: Merge results and calculate confidence
    // TODO: Implement result merging
    const mergedResults: ClassificationResult[] = [];

    // Step 5: Add country mappings
    // TODO: Implement country mapping lookup for each result

    // Step 6: Filter by confidence threshold
    const filteredResults = mergedResults.filter(
      r => r.confidence >= MIN_CONFIDENCE_THRESHOLD
    );

    // Step 7: Limit to top results
    const topResults = filteredResults.slice(0, MAX_ALTERNATIVE_CODES);

    // Step 8: Store classification
    const classificationId = await storeClassification(request, topResults, category);

    // Step 9: Build response
    const response: ClassifyResponse = {
      success: true,
      results: topResults.length > 0 ? topResults : [{
        hsCode: '0000.00.00',
        description: 'No confident classification found',
        confidence: 0,
        reasoning: 'Unable to classify with sufficient confidence. Please provide more details or try manual classification.',
      }],
      classificationId,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - startTime;
    logger.info(`===== Classification Complete (${duration}ms) =====`);
    logger.info(`Results: ${response.results.length} codes found`);
    logger.info(`Top result: ${response.results[0]?.hsCode} (${response.results[0]?.confidence}% confidence)`);

    return response;

  } catch (error) {
    logger.error('===== Classification Failed =====');
    logger.error(error instanceof Error ? error.message : String(error));

    // Return error response
    return {
      success: false,
      results: [{
        hsCode: '0000.00.00',
        description: 'Classification error',
        confidence: 0,
        reasoning: 'An error occurred during classification. Please try again.'
      }],
      classificationId: `cls_error_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get classification confidence breakdown
 *
 * @param classificationId - Classification ID
 * @returns Detailed confidence breakdown
 *
 * TODO: Implement confidence breakdown retrieval
 * - Query user_classifications table
 * - Return detailed breakdown of how confidence was calculated
 * - Useful for debugging and transparency
 */
export async function getConfidenceBreakdown(classificationId: string): Promise<ConfidenceScore | null> {
  logger.debug(`Getting confidence breakdown for ${classificationId}`);

  // TODO: Implement retrieval logic
  return null;
}

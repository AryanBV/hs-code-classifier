import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { Candidate, getTopCandidates } from './multi-candidate-search.service';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const prisma = new PrismaClient();

export interface ClassificationResult {
  code: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    code: string;
    description: string;
  }>;
  responseTime: number;
  searchTime: number;
  llmTime: number;
}

/**
 * Format candidates for LLM prompt
 */
function formatCandidatesForPrompt(candidates: Candidate[], fullDetails: any[]): string {
  return candidates.map((candidate, idx) => {
    const details = fullDetails.find(d => d.code === candidate.code);

    let candidateText = `${idx + 1}. HS Code: ${candidate.code}\n`;
    candidateText += `   Description: ${details?.description || 'N/A'}\n`;
    candidateText += `   Match Score: ${candidate.score.toFixed(2)}\n`;
    candidateText += `   Match Type: ${candidate.matchType}\n`;

    if (details?.keywords && details.keywords.length > 0) {
      candidateText += `   Keywords: ${details.keywords.join(', ')}\n`;
    }

    if (details?.commonProducts && details.commonProducts.length > 0) {
      candidateText += `   Common Products: ${details.commonProducts.join(', ')}\n`;
    }

    if (details?.synonyms && details.synonyms.length > 0) {
      candidateText += `   Synonyms: ${details.synonyms.join(', ')}\n`;
    }

    return candidateText;
  }).join('\n');
}

/**
 * Create the LLM validation prompt
 */
function createValidationPrompt(query: string, candidatesText: string): string {
  return `You are an expert in Harmonized System (HS) codes for international trade classification. Your task is to select the BEST matching HS code from the provided candidates for a given product query.

User Query: "${query}"

Top Candidate HS Codes (sorted by relevance):

${candidatesText}

Instructions:
1. Carefully analyze the user's query and each candidate HS code
2. Consider the description, keywords, common products, and synonyms for each code
3. Select the SINGLE BEST matching HS code that most accurately classifies the product
4. Provide a confidence score (0-100) for your selection
5. Explain your reasoning in 1-2 sentences

IMPORTANT:
- If the query is ambiguous or could match multiple codes, choose the most general/common one
- Consider both exact matches and semantic similarity
- Higher match scores indicate better keyword/fuzzy matching
- Trust your expertise in HS code classification

Return your response in this EXACT JSON format:
{
  "selectedCode": "the HS code you selected",
  "confidence": 85,
  "reasoning": "Brief explanation of why this code is the best match",
  "alternativeCodes": ["alternative1", "alternative2"]
}`;
}

/**
 * Validate candidates using LLM and select best match
 */
async function validateWithLLM(
  query: string,
  candidates: Candidate[]
): Promise<{
  selectedCode: string;
  confidence: number;
  reasoning: string;
  alternatives: string[];
}> {
  try {
    // Get full details for candidates
    const codes = candidates.map(c => c.code);
    const fullDetails = await prisma.hsCode.findMany({
      where: { code: { in: codes } },
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    // Format candidates for prompt
    const candidatesText = formatCandidatesForPrompt(candidates, fullDetails);

    // Create prompt
    const prompt = createValidationPrompt(query, candidatesText);

    // Call GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in HS code classification. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent results
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    // Parse JSON response
    const result = JSON.parse(content);

    return {
      selectedCode: result.selectedCode || candidates[0]?.code || '',
      confidence: result.confidence || 0,
      reasoning: result.reasoning || 'No reasoning provided',
      alternatives: result.alternativeCodes || []
    };

  } catch (error) {
    console.error('LLM validation error:', error);

    // Fallback to top candidate if LLM fails
    return {
      selectedCode: candidates[0]?.code || '',
      confidence: 50,
      reasoning: 'LLM validation failed, using top search result',
      alternatives: candidates.slice(1, 3).map(c => c.code)
    };
  }
}

/**
 * Main classification function with LLM validation
 * @param query - User's product query
 * @param candidateLimit - Number of candidates to retrieve (default: 10)
 * @returns Classification result with selected code and reasoning
 */
export async function classifyWithLLM(
  query: string,
  candidateLimit: number = 10
): Promise<ClassificationResult> {
  const startTime = Date.now();

  // Step 1: Get top candidates from multi-search
  const searchStartTime = Date.now();
  const candidates = await getTopCandidates(query, candidateLimit);
  const searchTime = Date.now() - searchStartTime;

  if (candidates.length === 0) {
    return {
      code: '',
      confidence: 0,
      reasoning: 'No matching HS codes found',
      alternatives: [],
      responseTime: Date.now() - startTime,
      searchTime,
      llmTime: 0
    };
  }

  // Step 2: Validate with LLM
  const llmStartTime = Date.now();
  const validation = await validateWithLLM(query, candidates);
  const llmTime = Date.now() - llmStartTime;

  // Step 3: Get full details for selected code and alternatives
  const selectedDetails = await prisma.hsCode.findFirst({
    where: { code: validation.selectedCode },
    select: { code: true, description: true }
  });

  const alternativeDetails = await prisma.hsCode.findMany({
    where: { code: { in: validation.alternatives } },
    select: { code: true, description: true }
  });

  return {
    code: validation.selectedCode,
    confidence: validation.confidence,
    reasoning: validation.reasoning,
    alternatives: alternativeDetails.map(alt => ({
      code: alt.code,
      description: alt.description
    })),
    responseTime: Date.now() - startTime,
    searchTime,
    llmTime
  };
}

/**
 * Batch classification for multiple queries
 * @param queries - Array of product queries
 * @param candidateLimit - Number of candidates per query
 * @returns Array of classification results
 */
export async function batchClassifyWithLLM(
  queries: string[],
  candidateLimit: number = 10
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];

  for (const query of queries) {
    const result = await classifyWithLLM(query, candidateLimit);
    results.push(result);

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Calculate estimated cost for LLM classification
 * GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
 */
export function estimateClassificationCost(
  numQueries: number,
  avgCandidates: number = 10
): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
} {
  // Rough estimates based on typical prompt sizes
  const inputTokensPerQuery = 500 + (avgCandidates * 150); // System prompt + candidates
  const outputTokensPerQuery = 100; // JSON response

  const totalInputTokens = inputTokensPerQuery * numQueries;
  const totalOutputTokens = outputTokensPerQuery * numQueries;

  const inputCost = (totalInputTokens / 1_000_000) * 0.150;
  const outputCost = (totalOutputTokens / 1_000_000) * 0.600;

  return {
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    estimatedCost: inputCost + outputCost
  };
}

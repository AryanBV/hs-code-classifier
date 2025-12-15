import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { Candidate, getTopCandidates } from './multi-candidate-search.service';
import { prisma } from '../utils/prisma';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


export interface ClassificationResult {
  code: string;
  description: string;
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
  return `You are a senior customs classification specialist with 15+ years of experience in Harmonized System (HS) tariff classification. Your expertise is critical for international trade compliance.

**PRODUCT TO CLASSIFY:** "${query}"

**CANDIDATE HS CODES:**

${candidatesText}

**YOUR TASK:**
Analyze the product and rank the TOP 3 most accurate HS codes from the candidates above. Lives and businesses depend on getting this right - incorrect classification leads to fines, shipment delays, and legal issues.

**CRITICAL CLASSIFICATION PRINCIPLES:**

**1. SPECIFICITY IS MANDATORY (Most Important Rule)**
   - ALWAYS choose the MOST SPECIFIC code available (8-10 digits: 8708.30.00, 6109.10.00)
   - NEVER choose headings (4-6 digits: 87, 8708, 6109) if specific subheadings exist
   - Example: If you see both "8708" and "8708.30.00", ALWAYS choose "8708.30.00"
   - Customs requires maximum specificity - general headings are NOT acceptable

**2. FUNCTION OVER MATERIAL (Essential Rule)**
   - Classify by PRIMARY USE/FUNCTION, not material composition
   - "ceramic brake pads for cars" = Chapter 87 (automotive parts by function)
   - "ceramic tiles" = Chapter 69 (ceramic products by material)
   - **Brake pads are classified as vehicle parts** (Ch.87), NOT friction materials (Ch.68)

**3. FINISHED vs RAW PRODUCTS**
   - Finished products → classified by end use (e.g., leather shoes = Ch.64 footwear)
   - Raw materials → classified by material (e.g., leather hides = Ch.41 raw leather)
   - Semi-finished → classified by current state and most common use

**4. CHAPTER-SPECIFIC GUIDANCE**
   - Ch.61-62: Textiles - distinguish by fabric type (knitted vs woven) and garment type
   - Ch.84-85: Machinery/Electronics - very specific, many similar codes
   - Ch.87: Vehicles & Parts - parts classified here even if made of other materials
   - Ch.39: Plastics - distinguish by form (bottles, sheets, etc.)
   - Ch.73: Steel products - distinguish by specific product type

**5. KEYWORD ANALYSIS**
   - Match ALL key terms in the query, not just one
   - "cotton t-shirt" needs BOTH cotton AND t-shirt characteristics
   - Don't match "steel nuts" to "steel bolts" - nuts and bolts are different codes

**6. COMMON CLASSIFICATION ERRORS TO AVOID**
   - ❌ Choosing parent heading when specific code exists
   - ❌ Classifying automotive parts by material instead of function
   - ❌ Ignoring product's end use or context
   - ❌ Matching partial keywords instead of full product description
   - ❌ Confusing similar products (e.g., wrist watch vs pocket watch)

**CONFIDENCE GUIDELINES:**
   - 90-100%: Exact match, all characteristics align, specific code
   - 75-89%: Strong match, correct category, minor uncertainty on subheading
   - 60-74%: Reasonable match, correct chapter but some ambiguity
   - <60%: Questionable - significant uncertainty, may need expert review

**QUALITY CHECKLIST (Verify before responding):**
   ✓ Selected the MOST SPECIFIC code available?
   ✓ Classified by FUNCTION/USE, not just material?
   ✓ Matched ALL keywords in the query, not partial?
   ✓ Correct chapter for product type?
   ✓ Checked for similar-sounding but different codes?

**RESPONSE FORMAT (STRICT JSON):**
{
  "rankedOptions": [
    {
      "code": "most specific and accurate HS code",
      "confidence": 92,
      "rank": 1
    },
    {
      "code": "second best alternative",
      "confidence": 78,
      "rank": 2
    },
    {
      "code": "third alternative",
      "confidence": 65,
      "rank": 3
    }
  ],
  "reasoning": "Explain your top choice: Why this chapter? Why this specific code? What makes it better than alternatives?"
}

**Remember:** You're protecting businesses from customs violations. Be thorough, be specific, be accurate.`;
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

    // Parse JSON response with ranked options
    const result = JSON.parse(content);
    const rankedOptions = result.rankedOptions || [];

    // Extract top choice and alternatives from ranked list
    const topChoice = rankedOptions[0] || null;
    const alternativeCodes = rankedOptions.slice(1, 3).map((opt: any) => opt.code);

    return {
      selectedCode: topChoice?.code || candidates[0]?.code || '',
      confidence: topChoice?.confidence || 0,
      reasoning: result.reasoning || 'No reasoning provided',
      alternatives: alternativeCodes
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
 * @param candidateLimit - Number of candidates to retrieve (default: 50)
 * @returns Classification result with selected code and reasoning
 */
export async function classifyWithLLM(
  query: string,
  candidateLimit: number = 50
): Promise<ClassificationResult> {
  const startTime = Date.now();

  // Step 1: Get top candidates from multi-search
  const searchStartTime = Date.now();
  const candidates = await getTopCandidates(query, candidateLimit);
  const searchTime = Date.now() - searchStartTime;

  if (candidates.length === 0) {
    return {
      code: '',
      description: '',
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
    description: selectedDetails?.description || '',
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
 * @param candidateLimit - Number of candidates per query (default: 50)
 * @returns Array of classification results
 */
export async function batchClassifyWithLLM(
  queries: string[],
  candidateLimit: number = 50
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

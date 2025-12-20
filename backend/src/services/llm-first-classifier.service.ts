/**
 * LLM-First HS Code Classification Service
 *
 * This approach asks the LLM directly for the HS code, then validates
 * it exists in our database. This leverages the LLM's trained knowledge
 * of HS codes rather than relying on semantic search.
 *
 * Flow:
 * 1. Ask LLM: "What is the 8-digit Indian HS code for [product]?"
 * 2. Validate the code exists in our database
 * 3. If not found, ask LLM for alternatives and try those
 * 4. Fallback to semantic search only if LLM fails
 */

import { prisma } from '../utils/prisma';
import OpenAI from 'openai';
import { semanticSearchMulti } from './multi-candidate-search.service';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ClassificationResult {
  code: string;
  description: string;
  confidence: number;
  reasoning: string;
  method: 'llm-direct' | 'llm-alternative' | 'semantic-fallback';
  alternativeCodes: Array<{
    code: string;
    description: string;
    reason: string;
  }>;
}

/**
 * LLM-First classification - asks LLM directly for the HS code
 */
export async function classifyWithLLMFirst(
  productDescription: string
): Promise<ClassificationResult> {
  console.log(`\n🤖 LLM-First Classification: "${productDescription}"`);
  console.log('═'.repeat(80));

  // STEP 1: Ask LLM directly for the HS code
  console.log('\n📋 Step 1: Asking LLM for HS code directly');

  const llmResponse = await askLLMForHSCode(productDescription);

  console.log(`   LLM suggests: ${llmResponse.primaryCode}`);
  console.log(`   Confidence: ${(llmResponse.confidence * 100).toFixed(0)}%`);
  console.log(`   Alternatives: ${llmResponse.alternatives.map(a => a.code).join(', ')}`);

  // STEP 2: Validate primary code exists in database
  console.log('\n🔍 Step 2: Validating code in database');

  let validatedCode = await findCodeInDatabase(llmResponse.primaryCode);

  if (validatedCode) {
    console.log(`   ✅ Found: ${validatedCode.code} - ${validatedCode.description}`);

    return {
      code: validatedCode.code,
      description: validatedCode.description,
      confidence: llmResponse.confidence,
      reasoning: llmResponse.reasoning,
      method: 'llm-direct',
      alternativeCodes: llmResponse.alternatives.map(a => ({
        code: a.code,
        description: a.description || '',
        reason: a.reason
      }))
    };
  }

  // STEP 3: Try alternative codes from LLM
  console.log('\n🔄 Step 3: Primary code not found, trying alternatives');

  for (const alt of llmResponse.alternatives) {
    validatedCode = await findCodeInDatabase(alt.code);
    if (validatedCode) {
      console.log(`   ✅ Found alternative: ${validatedCode.code} - ${validatedCode.description}`);

      return {
        code: validatedCode.code,
        description: validatedCode.description,
        confidence: llmResponse.confidence * 0.9, // Slightly lower confidence for alternative
        reasoning: `Primary code ${llmResponse.primaryCode} not in database. Using alternative: ${alt.reason}`,
        method: 'llm-alternative',
        alternativeCodes: []
      };
    }
  }

  // STEP 4: Try to find a related code in the same chapter
  console.log('\n🔍 Step 4: Searching for related codes in same chapter');

  const chapter = llmResponse.primaryCode.substring(0, 2);
  const relatedCode = await findRelatedCodeInChapter(chapter, productDescription);

  if (relatedCode) {
    console.log(`   ✅ Found related code: ${relatedCode.code} - ${relatedCode.description}`);

    return {
      code: relatedCode.code,
      description: relatedCode.description,
      confidence: llmResponse.confidence * 0.85,
      reasoning: `Exact code not found. Using related code from Chapter ${chapter}: ${relatedCode.description}`,
      method: 'llm-alternative',
      alternativeCodes: []
    };
  }

  // STEP 5: Fallback to semantic search (last resort)
  console.log('\n⚠️ Step 5: Falling back to semantic search');

  const semanticResults = await semanticSearchMulti(productDescription, 10);

  if (semanticResults.length > 0) {
    const topResult = semanticResults[0]!;
    const topCode = await prisma.hsCode.findFirst({
      where: { code: topResult.code },
      select: { code: true, description: true }
    });

    if (topCode) {
      console.log(`   ✅ Semantic search found: ${topCode.code} - ${topCode.description}`);

      return {
        code: topCode.code,
        description: topCode.description,
        confidence: 0.6, // Lower confidence for semantic fallback
        reasoning: `LLM codes not found in database. Semantic search result: ${topCode.description}`,
        method: 'semantic-fallback',
        alternativeCodes: []
      };
    }
  }

  // Final fallback - should rarely happen
  throw new Error(`Could not classify: ${productDescription}`);
}

/**
 * Ask LLM directly for the HS code
 */
async function askLLMForHSCode(productDescription: string): Promise<{
  primaryCode: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{ code: string; reason: string; description?: string }>;
}> {
  const systemPrompt = `You are an expert Indian Customs HS Code classification specialist with 20+ years of experience in ITC-HS (Indian Trade Classification based on Harmonized System).

Your task is to provide the EXACT 8-digit Indian HS code for the given product.

CRITICAL CLASSIFICATION RULES:

1. CODE FORMAT: Always provide 8-digit codes in format: XXXX.XX.XX (e.g., 6109.10.00)

2. FUNCTION OVER MATERIAL: Classify by PRIMARY FUNCTION, not material composition:
   - Plastic toy car → 9503 (toys), NOT 3926 (plastic articles)
   - Ceramic brake pads → 8708 (vehicle parts), NOT 6909 (ceramics)
   - Leather handbag → 4202 (bags), NOT 4104 (leather)
   - Steel kitchen knife → 8211 (knives), NOT 7323 (steel articles)

3. CHAPTER GUIDE:
   - 01-05: Live animals, meat, fish, dairy
   - 06-14: Plants, vegetables, fruits, cereals, seeds
   - 15: Fats and oils
   - 16-24: Prepared foods, beverages, tobacco
   - 25-27: Minerals, ores, fuels (salt=2501, cement=2523)
   - 28-38: Chemicals, pharmaceuticals, fertilizers
   - 39-40: Plastics, rubber (raw materials only)
   - 41-43: Leather, furskins
   - 44-49: Wood, paper, printed matter
   - 50-63: TEXTILES (CRITICAL):
     * 50: Silk and silk products
     * 51: Wool, animal hair
     * 52: Cotton (raw, yarn, fabrics)
     * 53: Other vegetable fibers (jute, linen)
     * 54: Man-made filaments
     * 55: Man-made staple fibers
     * 56: Wadding, felt, nonwovens
     * 57: Carpets
     * 58: Special woven fabrics
     * 59: Impregnated/coated textiles
     * 60: Knitted/crocheted fabrics
     * 61: KNITTED apparel (t-shirts, sweaters, underwear)
     * 62: WOVEN apparel (shirts, suits, dresses)
     * 63: Made-up textile articles (bed linen, curtains, bags)
   - 64-67: Footwear, headgear
   - 68-70: Stone, ceramic, glass
   - 71: Jewelry, precious metals
   - 72-83: Base metals (iron, steel, copper, aluminum)
   - 84-85: Machinery, electrical equipment
   - 86-89: Vehicles, aircraft, ships
   - 90: Optical, medical instruments (eyeglasses=9004)
   - 91-92: Clocks, musical instruments
   - 94: Furniture, lighting
   - 95: Toys, games, sports equipment
   - 96-97: Miscellaneous, art, antiques

4. TEXTILE APPAREL RULES:
   - T-shirts: 6109 (knitted)
   - Shirts with collar: 6105 (knitted) or 6205 (woven)
   - Bed linen: 6302
   - Pure silk fabric: 5007
   - Pure silk saree: 5007 (fabric) or 6206 (if women's garment)

5. CONFIDENCE LEVELS:
   - 0.95+: Very certain, common product with clear classification
   - 0.85-0.94: Confident but some ambiguity possible
   - 0.70-0.84: Multiple valid classifications exist
   - Below 0.70: Uncertain, need more information

RESPOND IN JSON FORMAT ONLY:
{
  "primaryCode": "XXXX.XX.XX",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this code, referencing the chapter and classification logic",
  "alternatives": [
    {"code": "XXXX.XX.XX", "reason": "Why this could also apply"}
  ]
}`;

  const userPrompt = `Classify this product for Indian export customs: "${productDescription}"

Provide the most specific 8-digit ITC-HS code. Consider the primary function of the product.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    primaryCode: response.primaryCode || '',
    confidence: response.confidence || 0.5,
    reasoning: response.reasoning || '',
    alternatives: response.alternatives || []
  };
}

/**
 * Find a code in the database (exact match or closest parent match)
 * Returns the most specific matching code in our database
 */
async function findCodeInDatabase(code: string): Promise<{ code: string; description: string } | null> {
  if (!code) return null;

  // Normalize the code - remove dots and get digits only
  const codeNoDots = code.replace(/\./g, '').trim();
  if (codeNoDots.length < 4) return null;

  // Build all possible code formats to try
  const variations: string[] = [];

  // Full 8-digit format: XXXX.XX.XX
  if (codeNoDots.length >= 8) {
    variations.push(`${codeNoDots.substring(0, 4)}.${codeNoDots.substring(4, 6)}.${codeNoDots.substring(6, 8)}`);
  }

  // 6-digit format: XXXX.XX
  if (codeNoDots.length >= 6) {
    variations.push(`${codeNoDots.substring(0, 4)}.${codeNoDots.substring(4, 6)}`);
  }

  // 4-digit format: XXXX
  variations.push(codeNoDots.substring(0, 4));

  // Also try the original code as-is
  if (!variations.includes(code)) {
    variations.unshift(code);
  }

  // Try exact matches first (most specific)
  for (const variant of variations) {
    const result = await prisma.hsCode.findFirst({
      where: { code: variant },
      select: { code: true, description: true }
    });
    if (result) {
      console.log(`      DB lookup: exact match for "${variant}"`);
      return result;
    }
  }

  // Try prefix matches (find codes that start with our code)
  for (const variant of variations) {
    const result = await prisma.hsCode.findFirst({
      where: { code: { startsWith: variant } },
      select: { code: true, description: true },
      orderBy: { code: 'asc' }
    });
    if (result) {
      console.log(`      DB lookup: prefix match "${variant}" -> "${result.code}"`);
      return result;
    }
  }

  console.log(`      DB lookup: no match found for "${code}"`);
  return null;
}

/**
 * Find a related code in the same chapter based on keywords
 */
async function findRelatedCodeInChapter(
  chapter: string,
  productDescription: string
): Promise<{ code: string; description: string } | null> {
  const keywords = productDescription.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Try to find a code with matching keywords
  for (const keyword of keywords.slice(0, 3)) {
    const result = await prisma.hsCode.findFirst({
      where: {
        chapter: chapter,
        OR: [
          { description: { contains: keyword, mode: 'insensitive' } },
          { keywords: { has: keyword } }
        ]
      },
      select: { code: true, description: true }
    });

    if (result) return result;
  }

  return null;
}

export { ClassificationResult };

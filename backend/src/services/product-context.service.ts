/**
 * Product Context Service
 *
 * Analyzes product descriptions to detect context information like:
 * - Product state (fresh, processed, packaged, raw, intermediate, finished good)
 * - Primary characteristics (form, material, function)
 * - Intended use (food, apparel, machinery, etc.)
 *
 * This context is used to filter and penalize false positive matches.
 * Example: "Fresh mangoes" should not match "Mango slices in brine" (processed)
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ProductContext {
  state: ProductState;
  characteristics: string[];
  category: string;
  confidence: number;
}

export type ProductState = 'fresh' | 'processed' | 'packaged' | 'raw_material' | 'intermediate' | 'finished_good' | 'unknown';

/**
 * Detect product state from product description
 *
 * @param productDescription - Product description text
 * @returns Product state and context information
 *
 * States:
 * - fresh: Unprocessed, natural state (fresh fruit, vegetables)
 * - processed: Changed form through processing (sliced, dried, cooked)
 * - packaged: Pre-packaged ready-to-use (canned, bottled, wrapped)
 * - raw_material: Basic input material (cotton fiber, steel ingots)
 * - intermediate: Partially processed component (yarn, fabric, wire)
 * - finished_good: Final product ready for consumer (clothing, electronics)
 * - unknown: Cannot determine state
 */
export async function detectProductState(productDescription: string): Promise<ProductContext> {
  logger.debug(`Detecting product state for: "${productDescription.substring(0, 80)}..."`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing product descriptions to detect their state and characteristics.

Return a JSON response ONLY with this structure:
{
  "state": "fresh|processed|packaged|raw_material|intermediate|finished_good|unknown",
  "characteristics": ["characteristic1", "characteristic2"],
  "category": "food|textile|machinery|material|electronics|other",
  "confidence": 0-100
}

Guidelines:
- "fresh": Unprocessed natural state (fresh fruit, vegetables, raw meat)
- "processed": Changed form through processing (sliced, dried, cooked, pressed)
- "packaged": Pre-packaged ready-to-use product (canned, bottled, wrapped)
- "raw_material": Basic input material (cotton fiber, steel ingots, crude oil)
- "intermediate": Partially processed component (yarn, fabric, wire, dough)
- "finished_good": Final product ready for consumer (clothing, gadgets, appliances)

Return ONLY valid JSON, no additional text.`
        },
        {
          role: 'user',
          content: `Analyze this product description and return its state and characteristics:

"${productDescription}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as Omit<ProductContext, 'state'> & { state: string };

    // Validate state
    const validStates: ProductState[] = ['fresh', 'processed', 'packaged', 'raw_material', 'intermediate', 'finished_good', 'unknown'];
    const state = validStates.includes(result.state as ProductState) ? (result.state as ProductState) : 'unknown';

    logger.debug(`Product state detected: ${state} (${result.confidence}% confidence)`);

    return {
      state,
      characteristics: Array.isArray(result.characteristics) ? result.characteristics : [],
      category: result.category || 'other',
      confidence: Math.min(100, Math.max(0, result.confidence || 0))
    };

  } catch (error) {
    logger.error('Error detecting product state');
    logger.error(error instanceof Error ? error.message : String(error));

    return {
      state: 'unknown',
      characteristics: [],
      category: 'other',
      confidence: 0
    };
  }
}

/**
 * Calculate state match penalty between product and HS code
 *
 * @param productState - Detected product state
 * @param hsCodeDescription - HS code description
 * @returns Penalty multiplier (1.0 = no penalty, 0.5 = 50% penalty, 0.0 = full rejection)
 *
 * Examples:
 * - Fresh mangoes + "Mango slices in brine" → 0.3 (heavy penalty, processed mismatch)
 * - Cotton fabric + "Cotton fiber" → 0.8 (light penalty, similar state)
 * - Cotton fabric + "Viscose rayon fabric" → 0.5 (medium penalty, different material)
 */
export async function calculateStateMatchPenalty(
  productState: ProductContext,
  hsCodeDescription: string
): Promise<number> {
  logger.debug(`Calculating state match for: ${productState.state} vs "${hsCodeDescription}"`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at determining if HS code descriptions match product states.

Return ONLY a number between 0 and 1 representing how well the HS code matches the product state:
- 1.0 = Perfect state match (no penalty)
- 0.8 = Good state match (light penalty)
- 0.5 = Moderate state match (medium penalty)
- 0.3 = Poor state match (heavy penalty)
- 0.0 = Complete mismatch (reject completely)

Consider:
- State compatibility (fresh vs processed vs raw material, etc.)
- Material consistency
- Product form compatibility`
        },
        {
          role: 'user',
          content: `Product state: ${productState.state}
Product characteristics: ${productState.characteristics.join(', ')}
HS code description: "${hsCodeDescription}"

Return only a number between 0 and 1.`
        }
      ],
      temperature: 0.2,
      max_tokens: 10
    });

    const content = response.choices[0]?.message?.content?.trim() || '1.0';
    const penalty = Math.min(1.0, Math.max(0.0, parseFloat(content) || 1.0));

    logger.debug(`State match penalty: ${penalty}`);
    return penalty;

  } catch (error) {
    logger.error('Error calculating state match penalty');
    logger.error(error instanceof Error ? error.message : String(error));
    return 1.0; // Default to no penalty on error
  }
}

/**
 * Detect if product description indicates processed vs fresh state
 * (Simplified heuristic-based check for quick filtering)
 *
 * @param productDescription - Product description text
 * @returns true if processed/packaged, false if fresh
 */
export function isProcessedProduct(productDescription: string): boolean {
  const processedKeywords = [
    'sliced', 'diced', 'cut', 'dried', 'freeze-dried', 'frozen', 'canned', 'bottled',
    'packaged', 'processed', 'prepared', 'cooked', 'baked', 'roasted', 'fried',
    'pressed', 'ground', 'powder', 'flour', 'juice', 'extract', 'concentrate',
    'dehydrated', 'pasteurized', 'sterilized', 'sealed', 'vacuum-packed', 'preserved'
  ];

  const freshKeywords = [
    'fresh', 'raw', 'unprocessed', 'natural', 'ripe', 'uncooked', 'whole',
    'organic', 'seasonal', 'garden-fresh', 'farm-fresh', 'live', 'ungutted',
    'unprepared', 'untreated', 'unpeeled'
  ];

  const lowerDesc = productDescription.toLowerCase();

  const processedCount = processedKeywords.filter(kw => lowerDesc.includes(kw)).length;
  const freshCount = freshKeywords.filter(kw => lowerDesc.includes(kw)).length;

  return processedCount > freshCount;
}

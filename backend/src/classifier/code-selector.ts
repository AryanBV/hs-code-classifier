// backend/src/classifier/code-selector.ts

import OpenAI from 'openai';
import { ExtractedAttributes, CodeSelectionResult } from './types';
import { searchWithinChapter, getCodesUnderHeading } from '../database/hs-codes';
import { generateEmbedding, createSearchQuery } from './attribute-extractor';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Select the final 8-digit code within the determined heading
 */
export async function selectCode(
  attrs: ExtractedAttributes,
  heading: string
): Promise<CodeSelectionResult> {

  console.log(`Selecting tariff-line code within heading ${heading}`);

  // Get all 8-digit codes under this heading
  const allCodes = await getCodesUnderHeading(heading);

  console.log(`Found ${allCodes.length} codes under heading ${heading}`);

  // If only one 8-digit code exists, return it
  if (allCodes.length === 1) {
    return {
      code: allCodes[0].code,
      description: allCodes[0].description,
      confidence: 95,
      reasoning: `Only one tariff line exists under heading ${heading}.`
    };
  }

  // If no 8-digit codes, return the heading with .00
  if (allCodes.length === 0) {
    return {
      code: heading + '.00.00',
      description: 'Heading level classification',
      confidence: 70,
      reasoning: `No specific 8-digit codes found under ${heading}.`
    };
  }

  // If few codes (<=5), let LLM decide directly
  if (allCodes.length <= 5) {
    return await llmSelectCode(attrs, allCodes);
  }

  // Many codes - use semantic search to narrow, then LLM
  const searchQuery = createSearchQuery(attrs);
  const embedding = await generateEmbedding(searchQuery);

  const candidates = await searchWithinChapter(embedding, heading, 10, 5);

  if (candidates.length === 0) {
    return await llmSelectCode(attrs, allCodes.slice(0, 5));
  }

  return await llmSelectCode(attrs, candidates);
}

/**
 * LLM-based final code selection
 */
async function llmSelectCode(
  attrs: ExtractedAttributes,
  candidates: any[]
): Promise<CodeSelectionResult> {

  // Build candidate list
  const candidateText = candidates.map(c => {
    let text = `${c.code}: ${c.description}`;
    return text;
  }).join('\n');

  const prompt = `Select the most appropriate 8-digit HS Code for this product.

PRODUCT: "${attrs.raw_query}"

ATTRIBUTES:
- Material: ${attrs.material || 'not specified'}
- Form: ${attrs.form || 'not specified'}
- Function: ${attrs.function || 'not specified'}
- Intended use: ${attrs.intended_use || 'not specified'}

CANDIDATE CODES:
${candidateText}

RULES:
1. Select the MOST SPECIFIC code matching the product
2. Consider material, form, and function
3. If uncertain between codes, prefer the more general one

Respond ONLY with JSON:
{
  "code": "XXXX.XX.XX",
  "confidence": 85,
  "reasoning": "Brief explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const choice = response.choices[0];
    if (!choice || !choice.message.content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(choice.message.content);
    const selected = candidates.find(c => c.code === parsed.code);

    return {
      code: parsed.code,
      description: selected?.description || 'Description not found',
      confidence: parsed.confidence,
      reasoning: parsed.reasoning
    };
  } catch (error) {
    console.error('LLM code selection failed:', error);
    // Fallback to first candidate
    return {
      code: candidates[0].code,
      description: candidates[0].description,
      confidence: 60,
      reasoning: 'Fallback to top semantic match'
    };
  }
}

// backend/src/classifier/attribute-extractor.ts

import OpenAI from 'openai';
import { ExtractedAttributes } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * LLM-based attribute extraction
 */
export async function extractAttributes(query: string): Promise<ExtractedAttributes> {
  const prompt = `Extract product attributes from this description for HS Code classification.

PRODUCT: "${query}"

Extract these attributes (use null if not clearly stated):
1. material: Primary material (e.g., "ceramic", "steel", "cotton", "coffee")
2. form: Physical form (e.g., "powder", "tablet", "fabric", "brake pads", "beans")
3. function: Primary function (e.g., "braking", "filtering", "cutting")
4. intended_use: Equipment/industry (e.g., "motor vehicles", "medical", "construction")
5. processing_state: Processing level (e.g., "raw", "processed", "instant", "roasted")
6. composition: If mentioned (e.g., ">50% cotton", "pure arabica")

RULES:
- Extract what is STATED or CLEARLY IMPLIED
- For "brake pads for trucks" → intended_use: "motor vehicles/trucks"
- For "instant coffee" → processing_state: "instant"
- Do NOT guess if not mentioned

Respond ONLY with JSON:
{
  "material": string | null,
  "form": string | null,
  "function": string | null,
  "intended_use": string | null,
  "processing_state": string | null,
  "composition": string | null
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error('Empty LLM response');
    }
    const content = choice.message.content;

    const parsed = JSON.parse(content);

    return {
      material: parsed.material || undefined,
      form: parsed.form || undefined,
      function: parsed.function || undefined,
      intended_use: parsed.intended_use || undefined,
      processing_state: parsed.processing_state || undefined,
      composition: parsed.composition || undefined,
      raw_query: query
    };
  } catch (error) {
    console.error('Attribute extraction failed:', error);
    // Return basic extraction on failure
    return { raw_query: query };
  }
}

/**
 * Generate embedding for semantic search
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  const data = response.data[0];
  if (!data) {
    throw new Error('No embedding data returned');
  }
  return data.embedding;
}

/**
 * Create optimized search query from attributes
 */
export function createSearchQuery(attrs: ExtractedAttributes): string {
  const parts = [
    attrs.material,
    attrs.form,
    attrs.function,
    attrs.intended_use,
    attrs.processing_state
  ].filter(Boolean);

  // Add important words from raw query
  const rawWords = attrs.raw_query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  for (const word of rawWords) {
    if (!parts.some(p => p?.toLowerCase().includes(word))) {
      parts.push(word);
    }
  }

  return parts.slice(0, 10).join(' ');
}

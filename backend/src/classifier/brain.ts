// backend/src/classifier/brain.ts
//
// Brain module (M3: ARY-27).
// Single LLM call that replaces Stage 0 (specificity analyzer) + Stage 1 (attribute extractor).
// Returns routing decision + extracted attributes.

import OpenAI from 'openai';
import { BrainOutput, QAPair } from './types';
import { buildSystemPrompt, buildUserPrompt, BRAIN_RESPONSE_SCHEMA } from './brain-prompt';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyze a product query using the Brain LLM.
 * Returns routing decision (classify/ask/disambiguate/reject) + extracted attributes.
 */
export async function analyzeBrain(
  query: string,
  previousAnswers?: QAPair[]
): Promise<BrainOutput> {
  const model = process.env.BRAIN_MODEL || 'gpt-4o-mini';
  const temperature = parseFloat(process.env.BRAIN_TEMPERATURE || '0.1');
  const maxTokens = parseInt(process.env.BRAIN_MAX_TOKENS || '1000', 10);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, previousAnswers);

  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'brain_output',
          strict: true,
          schema: BRAIN_RESPONSE_SCHEMA,
        },
      },
    });

    const elapsed = Date.now() - startTime;
    const choice = response.choices[0];

    if (!choice || !choice.message.content) {
      throw new Error('Empty LLM response from Brain');
    }

    const parsed: BrainOutput = JSON.parse(choice.message.content);
    const tokens = response.usage?.total_tokens || 0;

    console.log(
      `[Brain] ${model} | ${parsed.decision} | ${parsed.confidence} | ${elapsed}ms | ~${tokens} tokens`
    );

    return parsed;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Brain] FAILED after ${elapsed}ms:`, error);

    return buildFallbackOutput();
  }
}

/**
 * Safe fallback when the Brain LLM call fails.
 * Defaults to "classify" so the existing pipeline can attempt classification.
 */
function buildFallbackOutput(): BrainOutput {
  return {
    attributes: {
      material: '',
      form: '',
      function: '',
      intended_use: '',
      processing_state: '',
      composition: '',
      industry: '',
      origin: '',
    },
    readiness: {
      score: 0,
      missing_critical: [],
      has_ambiguity: false,
    },
    decision: 'classify',
    confidence: 0.3,
    reasoning: 'Brain LLM call failed, falling back to pipeline classification',
    question: {
      text: '',
      options: [],
      attribute_needed: '',
      context: '',
    },
    suggested_chapters: [],
  };
}

// backend/src/classifier/heading-reranker.ts
//
// LLM re-ranking of pgvector heading candidates.
// Uses Brain attributes, chapter notes, and GIR rules to distinguish
// between semantically similar headings within the same chapter.

import OpenAI from 'openai';
import {
  ExtractedAttributes,
  HeadingSearchResult,
  HeadingCandidate,
  ChapterRoutingResult,
  HeadingRerankerResult,
} from './types';
import { BrainContext } from './code-selector';
import { getFormattedChapterNotes } from './notes-helper';
import { formatGIRsForPrompt } from '../data/gir-rules';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MIN_CANDIDATES_FOR_RERANK = 2;
const MAX_CANDIDATES_TO_RERANK = 5;

const HEADING_RERANKER_SCHEMA = {
  type: 'object' as const,
  properties: {
    selected_heading: { type: 'string' as const },
    confidence: { type: 'number' as const },
    reasoning: { type: 'string' as const },
    ranking: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          code: { type: 'string' as const },
          score: { type: 'number' as const },
        },
        required: ['code', 'score'] as const,
        additionalProperties: false,
      },
    },
  },
  required: ['selected_heading', 'confidence', 'reasoning', 'ranking'] as const,
  additionalProperties: false,
};

async function llmRerankHeadings(
  attrs: ExtractedAttributes,
  candidates: HeadingCandidate[],
  chapter: string,
  chapterNotes: string | null,
  brainContext?: BrainContext
): Promise<HeadingRerankerResult> {
  const candidateText = candidates
    .map((c, i) => `${i + 1}. ${c.code}: ${c.description}`)
    .join('\n');

  const notesSection = chapterNotes
    ? `\nOFFICIAL CLASSIFICATION RULES (Chapter ${chapter}):\n${chapterNotes}\n`
    : '';

  const girSection = formatGIRsForPrompt(['1', '2a', '3a']);

  const prompt = `Select the most appropriate 4-digit HS heading for this product.

PRODUCT: "${attrs.raw_query}"

ATTRIBUTES:
- Material: ${attrs.material || 'not specified'}
- Form: ${attrs.form || 'not specified'}
- Function: ${attrs.function || 'not specified'}
- Intended use: ${attrs.intended_use || 'not specified'}
- Processing state: ${attrs.processing_state || 'not specified'}
- Industry: ${attrs.industry || brainContext?.industry || 'not specified'}
${brainContext?.reasoning ? `\nUPSTREAM ANALYSIS: ${brainContext.reasoning}` : ''}

CANDIDATE HEADINGS (Chapter ${chapter}):
${candidateText}
${notesSection}
CLASSIFICATION PRINCIPLES:
${girSection}

KEY RULES:
1. Read each heading's description literally — select the one whose TERMS most precisely describe this product.
2. Specific beats general (GIR 3a): a heading naming the exact product type beats a broader category.
3. Parts for specific machines classify WITH those machines (GIR 2a), not by material.
4. Match the product's FORM and FUNCTION against each heading — not just material or general category.

Select the single best heading.`;

  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'heading_reranker_result',
        strict: true,
        schema: HEADING_RERANKER_SCHEMA,
      },
    },
  });
  const elapsed = Date.now() - startTime;

  const choice = response.choices[0];
  if (!choice || !choice.message.content) {
    throw new Error('Empty LLM response from heading re-ranker');
  }

  const parsed: HeadingRerankerResult = JSON.parse(choice.message.content);
  console.log(`  [Heading Re-Ranker] ${elapsed}ms | selected: ${parsed.selected_heading} (${parsed.confidence}%) | ${parsed.reasoning}`);

  return parsed;
}

/**
 * Re-rank pgvector heading candidates using LLM reasoning.
 * Graceful fallback: returns original headingResult unchanged on any error.
 */
export async function rerankHeadings(
  attrs: ExtractedAttributes,
  headingResult: HeadingSearchResult,
  chapterResult: ChapterRoutingResult,
  brainContext?: BrainContext
): Promise<HeadingSearchResult> {
  // Skip if too few candidates to re-rank
  if (headingResult.candidates.length < MIN_CANDIDATES_FOR_RERANK) {
    return headingResult;
  }

  try {
    const candidates = headingResult.candidates.slice(0, MAX_CANDIDATES_TO_RERANK);
    const chapter = chapterResult.chapter;

    // Fetch chapter notes (likely already cached from heading-searcher)
    const chapterNotes = await getFormattedChapterNotes(chapter);

    const result = await llmRerankHeadings(
      attrs,
      candidates,
      chapter,
      chapterNotes,
      brainContext
    );

    // Validate: selected_heading must be one of the candidates
    const selected = candidates.find(c => c.code === result.selected_heading);
    if (!selected) {
      console.warn(`  [Heading Re-Ranker] LLM selected ${result.selected_heading} which is not in candidates. Keeping pgvector order.`);
      return headingResult;
    }

    // Build re-ranked HeadingSearchResult
    return {
      heading: selected.code,
      description: selected.description,
      similarity: result.confidence / 100,
      candidates: headingResult.candidates,
    };
  } catch (error) {
    console.error('  [Heading Re-Ranker] Failed, keeping pgvector order:', error);
    return headingResult;
  }
}

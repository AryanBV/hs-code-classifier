// backend/src/classifier/chapter-router.ts

import OpenAI from 'openai';
import { ExtractedAttributes, ChapterRoutingResult } from './types';
import { applyChapterRules } from '../rules/chapter-rules';
import { detectConfusingPair, ConfusingPair } from '../data/confusing-chapter-pairs';
import { globalSemanticSearch } from '../database/hs-codes';
import {
  getNotesForClassification,
  NotesForClassification
} from '../database/chapter-notes-accessor';
import { generateEmbedding, createSearchQuery } from './attribute-extractor';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Route to correct chapter using rules + LLM
 *
 * Strategy:
 * 1. Try hard-coded rules first (fast, deterministic)
 * 2. If no rule matches, use semantic search + LLM
 */
export async function routeToChapter(
  attrs: ExtractedAttributes
): Promise<ChapterRoutingResult> {

  // STEP 1: Try hard-coded rules (fast path)
  const matchedRule = applyChapterRules(attrs);

  if (matchedRule) {
    console.log(`Rule matched: ${matchedRule.id} → Chapter ${matchedRule.chapter}`);
    return {
      chapter: matchedRule.chapter,
      confidence: 95,
      reasoning: matchedRule.legal_basis,
      rule_applied: matchedRule.id
    };
  }

  // STEP 2: No rule matched - use semantic search + LLM
  console.log('No rule matched, using semantic search + LLM');

  const searchQuery = createSearchQuery(attrs);
  const embedding = await generateEmbedding(searchQuery);

  // Get top candidates across all chapters
  const candidates = await globalSemanticSearch(embedding, 30);

  // Group by chapter and find top 3 chapters
  const chapterScores = new Map<string, number>();
  for (const candidate of candidates) {
    const chapter = candidate.code.substring(0, 2);
    const current = chapterScores.get(chapter) || 0;
    chapterScores.set(chapter, current + candidate.similarity);
  }

  const topChapters = Array.from(chapterScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([chapter]) => chapter);

  // Check for confusing chapter pairs among top candidates
  const confusingPair = detectConfusingPair(attrs.raw_query, topChapters);
  if (confusingPair) {
    console.log(`  Confusing pair detected: Ch.${confusingPair.chapters[0]} vs Ch.${confusingPair.chapters[1]}`);
  }

  // Get chapter notes AND GIR rules for LLM decision
  // Include GIRs: 1 (chapter notes), 2a (parts/function), 3a (specific heading), 3b (essential character)
  const notesData = await getNotesForClassification(topChapters, ['1', '2a', '3a', '3b']);

  console.log(`  Notes context length: ${notesData.formattedForPrompt.length} chars`);
  console.log(`  GIRs included: ${notesData.relevantGIRs.map(g => g.number).join(', ')}`);

  // LLM decides based on chapter notes + GIRs
  return await llmChapterDecision(attrs, topChapters, notesData, confusingPair);
}

/**
 * LLM-based chapter decision using chapter notes + GIR rules
 */
async function llmChapterDecision(
  attrs: ExtractedAttributes,
  candidateChapters: string[],
  notesData: NotesForClassification,
  confusingPair: ConfusingPair | null = null
): Promise<ChapterRoutingResult> {

  // A/B TEST TOGGLE: Set DISABLE_CHAPTER_NOTES=true to test LLM without notes
  const disableNotes = process.env.DISABLE_CHAPTER_NOTES === 'true';

  // Use pre-formatted context from accessor (includes chapter notes + GIRs)
  // Or provide minimal context if notes are disabled for A/B testing
  const notesContext = disableNotes
    ? `Candidate chapters: ${candidateChapters.join(', ')}. No chapter notes provided - classify based on product attributes and general HS classification principles.`
    : notesData.formattedForPrompt;

  // Token budget check (rough estimate: 4 chars = 1 token)
  const estimatedTokens = Math.ceil(notesContext.length / 4);
  if (estimatedTokens > 2000) {
    console.warn(`  ⚠️ Notes context may be large: ~${estimatedTokens} tokens`);
  }

  // Build disambiguation warning if confusing pair detected
  let disambiguationContext = '';
  if (confusingPair) {
    disambiguationContext = `
=== DISAMBIGUATION WARNING ===
Chapters ${confusingPair.chapters[0]} and ${confusingPair.chapters[1]} are commonly confused for this product type.
Key distinction: ${confusingPair.question}
- Chapter ${confusingPair.options[0]!.chapter}: ${confusingPair.options[0]!.description} (e.g., ${confusingPair.options[0]!.examples})
- Chapter ${confusingPair.options[1]!.chapter}: ${confusingPair.options[1]!.description} (e.g., ${confusingPair.options[1]!.examples})
=== END DISAMBIGUATION ===
`;
  }

  const prompt = `You are an HS Code classification expert for Indian Customs (ITC-HS). Determine the correct CHAPTER (2-digit) for this product.

PRODUCT: "${attrs.raw_query}"

EXTRACTED ATTRIBUTES:
- Material: ${attrs.material || 'not specified'}
- Form: ${attrs.form || 'not specified'}
- Function: ${attrs.function || 'not specified'}
- Intended use: ${attrs.intended_use || 'not specified'}
- Processing state: ${attrs.processing_state || 'not specified'}

=== LEGAL CLASSIFICATION CONTEXT ===
${notesContext}
=== END CONTEXT ===
${disambiguationContext}
CRITICAL CLASSIFICATION PRINCIPLES (apply in order):

1. GIR 1 - FIRST: Classification by terms of headings AND chapter/section notes
   - If chapter notes EXCLUDE the product, it cannot go in that chapter
   - Check if there is a MORE SPECIFIC chapter for the product

2. GIR 2(a) - PARTS RULE: Parts designed for specific machines/vehicles:
   - Classify WITH that machine/vehicle, NOT by material
   - EXAMPLES:
     * Rubber seals for engines → Ch.87 (vehicles), NOT Ch.40 (rubber)
     * Ceramic brake pads → Ch.87 (vehicles), NOT Ch.69 (ceramics)
     * Plastic dashboards → Ch.87 (vehicles), NOT Ch.39 (plastics)
   - EXCEPTIONS (products with their OWN specific heading):
     * Tyres → Ch.40 (heading 4011 is specific for tyres)
     * Batteries → Ch.85 (heading 8507 is specific for batteries)
     * Filters → Ch.84 (heading 8421 is specific for filtering machinery)

3. GIR 3(a) - SPECIFICITY: Specific heading wins over general heading
   - A product-specific chapter beats a material-based chapter

4. GIR 3(b) - ESSENTIAL CHARACTER: For composites/mixtures, which component gives identity?

5. PHARMACEUTICAL DISTINCTION:
   - Dosage forms for retail (tablets, capsules, syrups) → Ch.30
   - Bulk APIs/raw materials (powders, crystals) → Ch.29
   - Food supplements/vitamins → Ch.21

6. TEXTILE DISTINCTION:
   - Knitted/crocheted garments → Ch.61
   - Woven garments → Ch.62
   - Furskin articles → Ch.43 (not textiles)
   - Leather articles → Ch.42 (not textiles)

Apply these rules IN ORDER. Cite which rule determined your decision.

Respond ONLY with JSON:
{
  "chapter": "XX",
  "confidence": 85,
  "reasoning": "Brief explanation citing which GIR or rule determined the decision"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'chapter_routing_decision',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              chapter: { type: 'string' },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
            },
            required: ['chapter', 'confidence', 'reasoning'],
            additionalProperties: false,
          },
        },
      }
    });

    const choice = response.choices[0];
    if (!choice || !choice.message.content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(choice.message.content);

    return {
      chapter: parsed.chapter,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      notes_used: candidateChapters,
      girs_applied: notesData.relevantGIRs.map(g => g.number)
    };
  } catch (error) {
    console.error('LLM chapter decision failed:', error);
    // Fallback to top semantic match
    const fallbackChapter = candidateChapters[0] || '00';
    return {
      chapter: fallbackChapter,
      confidence: 60,
      reasoning: 'Fallback to semantic similarity',
      notes_used: candidateChapters,
      girs_applied: []
    };
  }
}

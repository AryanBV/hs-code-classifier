// backend/src/classifier/index.ts

import { ClassificationResult, ExtractedAttributes, BrainOutput, ChapterRoutingResult } from './types';
import { analyzeSpecificity } from './specificity-analyzer';
import { extractAttributes } from './attribute-extractor';
import { routeToChapter } from './chapter-router';
import { findHeading } from './heading-searcher';
import { selectCode } from './code-selector';
import { analyzeBrain } from './brain';
import { route } from './router';

export interface ClassifyOptions {
  skipSpecificityCheck?: boolean;
  previousAnswers?: Record<string, string>;
}

const USE_BRAIN = process.env.USE_BRAIN === 'true';

/**
 * Main classification function
 * Orchestrates all stages of the pipeline
 */
export async function classify(
  query: string,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {

  console.log('\n========================================');
  console.log(`Classifying: "${query}"`);
  console.log(`Mode: ${USE_BRAIN ? 'Brain' : 'Legacy'}`);
  console.log('========================================\n');

  // =========================================================
  // BRAIN PATH (USE_BRAIN=true)
  // =========================================================
  if (USE_BRAIN) {
    let retainedBrainOutput: BrainOutput | null = null;
    try {
      // Convert previousAnswers Record to QAPair[] for Brain
      const qaPairs = options.previousAnswers
        ? Object.entries(options.previousAnswers).map(([key, value]) => ({
            question: key,
            answer: value,
          }))
        : undefined;

      // Brain replaces Stage 0 + Stage 1
      console.log('Brain: Analyzing query...');
      const brainOutput = await analyzeBrain(query, qaPairs);
      retainedBrainOutput = brainOutput;
      const decision = route(brainOutput, query);

      console.log(`  Decision: ${decision.action}`);
      console.log(`  Brain confidence: ${brainOutput.confidence}`);
      console.log(`  Reasoning: ${brainOutput.reasoning}`);

      // --- REJECT ---
      if (decision.action === 'reject') {
        return {
          responseType: 'question',
          question: decision.message || 'This does not appear to be a product description.',
          options: [],
          context: 'rejection',
          brain_used: true,
        };
      }

      // --- ASK ---
      if (decision.action === 'ask' && decision.question) {
        return {
          responseType: 'question',
          question: decision.question.question,
          options: decision.question.options,
          context: decision.question.context,
          brain_used: true,
        };
      }

      // --- CLASSIFY: proceed to Stages 2-5 ---
      const attributes = decision.attributes!;
      console.log('  Brain attributes:', JSON.stringify(attributes, null, 2));

      // Stage 2: Chapter Routing — Trust Brain's chapters (ARY-48 Fix 1)
      console.log('\nStage 2: Chapter Routing');
      let chapterResult: ChapterRoutingResult;

      if (decision.suggestedChapters && decision.suggestedChapters.length > 0) {
        const brainChapter = decision.suggestedChapters[0]!;
        const brainConf = Math.round(
          brainOutput.confidence > 1 ? brainOutput.confidence : brainOutput.confidence * 100
        );
        chapterResult = {
          chapter: brainChapter,
          confidence: Math.min(brainConf, 95),
          reasoning: `Brain suggested chapter ${brainChapter} (from [${decision.suggestedChapters.join(', ')}]). ${brainOutput.reasoning}`,
          rule_applied: 'brain_suggested_chapters',
        };
        console.log(`  Chapter: ${chapterResult.chapter} (Brain-trusted)`);
        console.log(`  Confidence: ${chapterResult.confidence}%`);
        console.log(`  Brain chapters: [${decision.suggestedChapters.join(', ')}]`);
      } else {
        chapterResult = await routeToChapter(attributes);
        console.log(`  Chapter: ${chapterResult.chapter} (router fallback)`);
        console.log(`  Confidence: ${chapterResult.confidence}%`);
        console.log(`  Rule: ${chapterResult.rule_applied || 'LLM decision'}`);
      }
      console.log(`  Reasoning: ${chapterResult.reasoning}`);

      // Stage 3: Heading Search
      console.log('\nStage 3: Heading Search');
      const headingResult = await findHeading(attributes, chapterResult.chapter);
      console.log(`  Heading: ${headingResult.heading}`);
      console.log(`  Description: ${headingResult.description}`);
      console.log(`  Similarity: ${headingResult.similarity.toFixed(3)}`);

      // Stage 4-5: Code Selection
      console.log('\nStage 4-5: Code Selection');
      const codeResult = await selectCode(attributes, headingResult.heading,
        retainedBrainOutput ? {
          industry: retainedBrainOutput.attributes.industry || undefined,
          origin: retainedBrainOutput.attributes.origin || undefined,
          reasoning: retainedBrainOutput.reasoning,
          suggestedChapters: retainedBrainOutput.suggested_chapters,
        } : undefined
      );
      console.log(`  Code: ${codeResult.code}`);
      console.log(`  Confidence: ${codeResult.confidence}%`);

      // Build Final Response
      const confidence = Math.round(
        (chapterResult.confidence * 0.4 +
         headingResult.similarity * 100 * 0.3 +
         codeResult.confidence * 0.3)
      );

      const reasoning = [
        `Chapter ${chapterResult.chapter}: ${chapterResult.reasoning}`,
        `Heading ${headingResult.heading}: ${headingResult.description}`,
        `Code ${codeResult.code}: ${codeResult.reasoning}`
      ].join('\n');

      console.log('\n========================================');
      console.log('RESULT');
      console.log('========================================');
      console.log(`HS Code: ${codeResult.code}`);
      console.log(`Confidence: ${confidence}%`);
      console.log(`Description: ${codeResult.description}`);
      console.log('========================================\n');

      return {
        responseType: 'classification',
        hsCode: codeResult.code,
        description: codeResult.description,
        confidence,
        reasoning,
        brain_used: true,
      };

    } catch (err) {
      console.error('[Brain] Error, falling back to old pipeline:', err);
      // Fall through to legacy path
    }
  }

  // =========================================================
  // LEGACY PATH (USE_BRAIN=false, default) — UNCHANGED
  // =========================================================
  try {
    // Stage 0: Specificity Analysis
    if (!options.skipSpecificityCheck) {
      console.log('Stage 0: Specificity Analysis');
      const specificity = analyzeSpecificity(query);
      console.log(`  Score: ${specificity.score}/100`);
      console.log(`  Known: ${Object.keys(specificity.known_attributes).filter(k =>
        specificity.known_attributes[k as keyof ExtractedAttributes]).join(', ')}`);

      if (specificity.should_ask_question && specificity.suggested_question) {
        console.log('  → Asking question\n');
        return {
          responseType: 'question',
          question: specificity.suggested_question.question,
          options: specificity.suggested_question.options,
          context: specificity.suggested_question.context,
          brain_used: false,
        };
      }
      console.log('  → Proceeding to classification\n');
    }

    // Stage 1: Attribute Extraction
    console.log('Stage 1: Attribute Extraction (LLM)');
    const attributes = await extractAttributes(query);
    console.log('  Extracted:', JSON.stringify(attributes, null, 2));

    // Merge previous answers if any
    if (options.previousAnswers) {
      Object.assign(attributes, options.previousAnswers);
    }

    // Stage 2: Chapter Routing
    console.log('\nStage 2: Chapter Routing');
    const chapterResult = await routeToChapter(attributes);
    console.log(`  Chapter: ${chapterResult.chapter}`);
    console.log(`  Confidence: ${chapterResult.confidence}%`);
    console.log(`  Rule: ${chapterResult.rule_applied || 'LLM decision'}`);
    console.log(`  Reasoning: ${chapterResult.reasoning}`);

    // Stage 3: Heading Search
    console.log('\nStage 3: Heading Search');
    const headingResult = await findHeading(attributes, chapterResult.chapter);
    console.log(`  Heading: ${headingResult.heading}`);
    console.log(`  Description: ${headingResult.description}`);
    console.log(`  Similarity: ${headingResult.similarity.toFixed(3)}`);

    // Stage 4-5: Code Selection
    console.log('\nStage 4-5: Code Selection');
    const codeResult = await selectCode(attributes, headingResult.heading);
    console.log(`  Code: ${codeResult.code}`);
    console.log(`  Confidence: ${codeResult.confidence}%`);

    // Build Final Response
    const confidence = Math.round(
      (chapterResult.confidence * 0.4 +
       headingResult.similarity * 100 * 0.3 +
       codeResult.confidence * 0.3)
    );

    const reasoning = [
      `Chapter ${chapterResult.chapter}: ${chapterResult.reasoning}`,
      `Heading ${headingResult.heading}: ${headingResult.description}`,
      `Code ${codeResult.code}: ${codeResult.reasoning}`
    ].join('\n');

    console.log('\n========================================');
    console.log('RESULT');
    console.log('========================================');
    console.log(`HS Code: ${codeResult.code}`);
    console.log(`Confidence: ${confidence}%`);
    console.log(`Description: ${codeResult.description}`);
    console.log('========================================\n');

    return {
      responseType: 'classification',
      hsCode: codeResult.code,
      description: codeResult.description,
      confidence,
      reasoning,
      brain_used: false,
    };

  } catch (error) {
    console.error('Classification error:', error);
    throw error;
  }
}

/**
 * Continue classification after user answers a question
 */
export async function continueWithAnswer(
  originalQuery: string,
  answerId: string,
  answerLabel: string
): Promise<ClassificationResult> {
  const enhancedQuery = `${originalQuery} (${answerLabel})`;

  if (USE_BRAIN) {
    return classify(enhancedQuery, {
      skipSpecificityCheck: true,
      previousAnswers: { [answerId]: answerLabel }
    });
  }

  // Legacy path: unchanged
  return classify(enhancedQuery, {
    skipSpecificityCheck: true,
    previousAnswers: { intended_use: answerLabel }
  });
}

// Export for testing
export { analyzeSpecificity } from './specificity-analyzer';
export { extractAttributes } from './attribute-extractor';
export { routeToChapter } from './chapter-router';
export { findHeading } from './heading-searcher';
export { selectCode } from './code-selector';

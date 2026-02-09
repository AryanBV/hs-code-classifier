// backend/src/classifier/index.ts

import { ClassificationResult, ExtractedAttributes } from './types';
import { analyzeSpecificity } from './specificity-analyzer';
import { extractAttributes } from './attribute-extractor';
import { routeToChapter } from './chapter-router';
import { findHeading } from './heading-searcher';
import { selectCode } from './code-selector';

export interface ClassifyOptions {
  skipSpecificityCheck?: boolean;
  previousAnswers?: Record<string, string>;
}

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
  console.log('========================================\n');

  try {
    // =====================
    // STAGE 0: Specificity Analysis
    // =====================
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
          context: specificity.suggested_question.context
        };
      }
      console.log('  → Proceeding to classification\n');
    }

    // =====================
    // STAGE 1: Attribute Extraction
    // =====================
    console.log('Stage 1: Attribute Extraction (LLM)');
    const attributes = await extractAttributes(query);
    console.log('  Extracted:', JSON.stringify(attributes, null, 2));

    // Merge previous answers if any
    if (options.previousAnswers) {
      Object.assign(attributes, options.previousAnswers);
    }

    // =====================
    // STAGE 2: Chapter Routing
    // =====================
    console.log('\nStage 2: Chapter Routing');
    const chapterResult = await routeToChapter(attributes);
    console.log(`  Chapter: ${chapterResult.chapter}`);
    console.log(`  Confidence: ${chapterResult.confidence}%`);
    console.log(`  Rule: ${chapterResult.rule_applied || 'LLM decision'}`);
    console.log(`  Reasoning: ${chapterResult.reasoning}`);

    // =====================
    // STAGE 3: Heading Search
    // =====================
    console.log('\nStage 3: Heading Search');
    const headingResult = await findHeading(attributes, chapterResult.chapter);
    console.log(`  Heading: ${headingResult.heading}`);
    console.log(`  Description: ${headingResult.description}`);
    console.log(`  Similarity: ${headingResult.similarity.toFixed(3)}`);

    // =====================
    // STAGE 4-5: Code Selection
    // =====================
    console.log('\nStage 4-5: Code Selection');
    const codeResult = await selectCode(attributes, headingResult.heading);
    console.log(`  Code: ${codeResult.code}`);
    console.log(`  Confidence: ${codeResult.confidence}%`);

    // =====================
    // Build Final Response
    // =====================
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
      reasoning
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

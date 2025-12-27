/**
 * Dynamic Question Generation Service
 *
 * Converts code differentials into user-friendly questions.
 * Uses LLM for humanization when needed, with fallback to templates.
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';
import {
  CodeDifferential,
  DifferentialType,
  DifferentialOption
} from './code-differential.service';
import { ClarifyingQuestion } from '../types/conversation.types';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ========================================
// Types
// ========================================

export interface DynamicQuestion extends ClarifyingQuestion {
  differential: CodeDifferential;
  impactExplanation: string;
  eliminatesCount: number;
}

export interface QuestionGenerationResult {
  questions: DynamicQuestion[];
  totalDifferentials: number;
  skippedDifferentials: number;
}

// ========================================
// Question Templates by Type
// ========================================

const QUESTION_TEMPLATES: Record<DifferentialType, {
  prefix: string;
  suffix?: string;
  examples?: string[];
}> = {
  term: {
    prefix: 'What type is this product?',
    suffix: 'Please select the most accurate description.'
  },
  price: {
    prefix: 'What is the retail price per unit?',
    suffix: 'This helps determine the correct tariff rate.'
  },
  specification: {
    prefix: 'What is the specification?',
    suffix: 'Please provide the technical details.'
  },
  material: {
    prefix: 'What material is the product made of?',
    suffix: 'Select the primary material.'
  },
  use: {
    prefix: 'What is the intended use or purpose?',
    suffix: 'This affects the classification.'
  },
  form: {
    prefix: 'What is the form or state of the product?',
    suffix: 'Select how the product is presented.'
  },
  processing: {
    prefix: 'What is the processing level?',
    suffix: 'Select the degree of processing.'
  },
  size: {
    prefix: 'What is the size category?',
    suffix: 'Select the appropriate size range.'
  },
  packaging: {
    prefix: 'How is the product packaged?',
    suffix: 'Select the packaging type.'
  },
  grade: {
    prefix: 'What is the quality grade?',
    suffix: 'Select the grade or quality level.'
  },
  gender: {
    prefix: 'Who is the target user?',
    suffix: 'Select the intended user group.'
  },
  species: {
    prefix: 'What is the species or variety?',
    suffix: 'Select the specific type.'
  }
};

// ========================================
// Main Question Generation
// ========================================

/**
 * Generate user-friendly questions from code differentials
 */
export async function generateQuestionsFromDifferentials(
  differentials: CodeDifferential[],
  maxQuestions: number,
  productDescription: string,
  useLLM: boolean = true
): Promise<QuestionGenerationResult> {
  if (differentials.length === 0) {
    return {
      questions: [],
      totalDifferentials: 0,
      skippedDifferentials: 0
    };
  }

  // Sort by importance (most distinguishing first)
  const sorted = [...differentials].sort((a, b) => b.importance - a.importance);

  // Take top differentials
  const toProcess = sorted.slice(0, maxQuestions);
  const questions: DynamicQuestion[] = [];

  for (const differential of toProcess) {
    try {
      let question: DynamicQuestion;

      if (useLLM && shouldUseLLM(differential)) {
        // Use LLM for complex differentials
        question = await generateQuestionWithLLM(differential, productDescription);
      } else {
        // Use template-based generation
        question = generateQuestionFromTemplate(differential, productDescription);
      }

      questions.push(question);
    } catch (error) {
      logger.warn(`Failed to generate question for differential ${differential.id}: ${error}`);
      // Fallback to template
      const fallback = generateQuestionFromTemplate(differential, productDescription);
      questions.push(fallback);
    }
  }

  return {
    questions,
    totalDifferentials: differentials.length,
    skippedDifferentials: differentials.length - toProcess.length
  };
}

/**
 * Determine if LLM should be used for this differential
 */
function shouldUseLLM(differential: CodeDifferential): boolean {
  // Use LLM for:
  // - Complex term differentials with many options
  // - When options are technical/jargon-heavy
  // - When question hint is generic

  if (differential.type === 'term' && differential.options.length > 3) {
    return true;
  }

  // Check if options contain technical terms
  const technicalPatterns = [/\d{4}\.\d{2}/, /[A-Z]{2,}/, /\bcc\b/, /\bkw\b/i];
  const hasTechnicalTerms = differential.options.some(opt =>
    technicalPatterns.some(p => p.test(opt.value))
  );

  return hasTechnicalTerms;
}

// ========================================
// Template-Based Question Generation
// ========================================

/**
 * Generate a question using templates (fast, no API call)
 */
function generateQuestionFromTemplate(
  differential: CodeDifferential,
  productDescription: string
): DynamicQuestion {
  const template = QUESTION_TEMPLATES[differential.type] || QUESTION_TEMPLATES.term;

  // Build question text
  let questionText = differential.questionHint || template.prefix;

  // Make it more specific based on product
  const productTerms = extractProductTerms(productDescription);
  if (productTerms.length > 0) {
    const mainTerm = productTerms[0];
    questionText = questionText.replace('product', mainTerm || 'product');
    questionText = questionText.replace('this', `this ${mainTerm || 'product'}`);
  }

  // Build options - include HS code prefix for single-code options
  // Format: "CODE::DisplayText" so frontend can distinguish real HS code "Other" from generic "Other"
  const options = differential.options.map(opt => {
    if (opt.matchingCodes.length === 1) {
      return `${opt.matchingCodes[0]}::${opt.displayText}`;
    }
    return opt.displayText;
  });

  // Calculate impact
  const totalCodes = differential.affectedCodes.length;
  const avgCodesPerOption = totalCodes / differential.options.length;
  const eliminatesCount = Math.round(totalCodes - avgCodesPerOption);

  return {
    id: `diff_${differential.id}`,
    text: questionText,
    options,
    allowOther: true,
    priority: differential.importance > 5 ? 'required' : 'optional',
    differential,
    impactExplanation: `This helps distinguish between ${totalCodes} possible codes`,
    eliminatesCount
  };
}

/**
 * Extract main product terms from description
 */
function extractProductTerms(description: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
  ]);

  const words = description.toLowerCase().split(/[\s,;:\-()]+/);
  return words
    .filter(w => w.length >= 3 && !stopwords.has(w))
    .slice(0, 3);
}

// ========================================
// LLM-Based Question Generation
// ========================================

/**
 * Generate a human-friendly question using LLM
 */
async function generateQuestionWithLLM(
  differential: CodeDifferential,
  productDescription: string
): Promise<DynamicQuestion> {
  const prompt = `You are helping classify products for customs/export purposes.

Convert this technical distinction into a clear, simple question for the user:

Product being classified: "${productDescription}"

Technical distinction found:
- Feature: "${differential.feature}"
- Type: ${differential.type}
- Options found in HS code descriptions:
${differential.options.map((o, i) => `  ${i + 1}. "${o.value}" (found in ${o.matchingCodes.length} codes)`).join('\n')}

Sample HS code descriptions:
${differential.extractedFrom.slice(0, 3).map((d, i) => `  ${i + 1}. ${d}`).join('\n')}

Requirements:
1. Use simple, non-technical language that anyone can understand
2. Make options clear and unambiguous
3. Keep the question under 100 characters
4. Options should be user-friendly versions of the technical terms
5. Include 3-5 options maximum

Return ONLY valid JSON in this exact format:
{
  "question": "Your clear question here?",
  "options": ["Option 1", "Option 2", "Option 3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that converts technical customs classification distinctions into simple user questions. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 300
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(content) as { question: string; options: string[] };

    // Calculate impact
    const totalCodes = differential.affectedCodes.length;
    const avgCodesPerOption = totalCodes / differential.options.length;
    const eliminatesCount = Math.round(totalCodes - avgCodesPerOption);

    return {
      id: `diff_${differential.id}`,
      text: parsed.question,
      options: parsed.options.slice(0, 5),
      allowOther: true,
      priority: differential.importance > 5 ? 'required' : 'optional',
      differential,
      impactExplanation: `This helps distinguish between ${totalCodes} possible codes`,
      eliminatesCount
    };

  } catch (error) {
    logger.warn(`LLM question generation failed, using template: ${error}`);
    return generateQuestionFromTemplate(differential, productDescription);
  }
}

// ========================================
// Question Prioritization
// ========================================

/**
 * Prioritize and select the best questions to ask
 */
export function prioritizeQuestions(
  questions: DynamicQuestion[],
  maxToAsk: number
): DynamicQuestion[] {
  // Sort by multiple factors
  const scored = questions.map(q => {
    let score = 0;

    // Factor 1: How many codes does it distinguish?
    score += q.eliminatesCount * 2;

    // Factor 2: Priority (required > helpful)
    score += q.priority === 'required' ? 10 : 0;

    // Factor 3: Type importance (some types are more critical)
    const typeImportance: Record<DifferentialType, number> = {
      material: 8,
      form: 7,
      species: 7,
      processing: 6,
      use: 6,
      price: 5,
      grade: 5,
      gender: 4,
      packaging: 4,
      specification: 3,
      size: 3,
      term: 2
    };
    score += typeImportance[q.differential.type] || 0;

    // Factor 4: Number of options (fewer is better - clearer choice)
    score -= q.options.length * 0.5;

    return { question: q, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxToAsk).map(s => s.question);
}

// ========================================
// Question Deduplication
// ========================================

/**
 * Remove duplicate or overlapping questions
 * ENHANCED: Also detects semantically similar questions (e.g., variety vs sibling differentials)
 */
export function deduplicateQuestions(questions: DynamicQuestion[]): DynamicQuestion[] {
  const seen = new Set<string>();
  const seenOptionSets = new Map<string, DynamicQuestion>(); // Track option sets to detect similar questions
  const result: DynamicQuestion[] = [];

  for (const q of questions) {
    // Create a signature based on the differential type and affected codes
    const signature = `${q.differential.type}_${q.differential.affectedCodes.sort().join(',')}`;

    if (seen.has(signature)) {
      continue;
    }

    // Check for semantically similar questions (same type = species, or similar options)
    // This prevents both "variety" and "sibling" differentials from creating duplicate questions
    const optionsKey = q.options.slice(0, 5).sort().join('|').toLowerCase();

    if (seenOptionSets.has(optionsKey)) {
      // Similar options found - keep the one with more options or more affected codes
      const existing = seenOptionSets.get(optionsKey)!;
      if (q.options.length > existing.options.length ||
          q.differential.affectedCodes.length > existing.differential.affectedCodes.length) {
        // Replace existing with better question
        const idx = result.indexOf(existing);
        if (idx !== -1) {
          result[idx] = q;
          seenOptionSets.set(optionsKey, q);
        }
      }
      continue;
    }

    // Check if this is a variety/species question that overlaps with another
    if (q.differential.type === 'species') {
      const overlapping = result.find(r =>
        r.differential.type === 'species' &&
        hasSignificantOverlap(q.options, r.options)
      );
      if (overlapping) {
        // Keep the question with more specific options (more options = more specific)
        if (q.options.length > overlapping.options.length) {
          const idx = result.indexOf(overlapping);
          if (idx !== -1) {
            result[idx] = q;
          }
        }
        continue;
      }
    }

    seen.add(signature);
    seenOptionSets.set(optionsKey, q);
    result.push(q);
  }

  return result;
}

/**
 * Check if two option arrays have significant overlap (>50% shared options)
 */
function hasSignificantOverlap(options1: string[], options2: string[]): boolean {
  const set1 = new Set(options1.map(o => o.toLowerCase()));
  const set2 = new Set(options2.map(o => o.toLowerCase()));

  let overlap = 0;
  for (const opt of set1) {
    if (set2.has(opt)) overlap++;
  }

  const minSize = Math.min(set1.size, set2.size);
  return minSize > 0 && overlap / minSize > 0.5;
}

// ========================================
// Convert to Standard Format
// ========================================

/**
 * Convert DynamicQuestions to standard ClarifyingQuestion format
 * for compatibility with existing frontend
 */
export function toStandardQuestions(questions: DynamicQuestion[]): ClarifyingQuestion[] {
  return questions.map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    allowOther: q.allowOther,
    priority: q.priority
  }));
}

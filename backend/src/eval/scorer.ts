// backend/src/eval/scorer.ts

import { EvalTestCase, EvalDetail, EvalReport } from './types';

/**
 * Strip dots and whitespace from HS code for comparison.
 * "8708.30.00" -> "87083000"
 */
export function normalizeHSCode(code: string): string {
  return code.replace(/\./g, '').replace(/\s/g, '');
}

/**
 * Map ClassificationResult.responseType to routing label.
 * Errors (null result) map to 'reject'.
 */
export function determineActualRouting(
  result: { responseType: 'classification' | 'question' } | null
): 'classify' | 'ask' | 'reject' {
  if (!result) return 'reject';
  if (result.responseType === 'classification') return 'classify';
  if (result.responseType === 'question') return 'ask';
  return 'reject';
}

/**
 * Score a classification result against ground truth.
 * Chapter: 40 pts, Heading: 30 pts, Full code: 30 pts.
 * Alternative chapters get 30/40 partial credit.
 */
export function scoreClassification(
  testCase: EvalTestCase,
  actualCode: string | undefined
): { score: number; chapterCorrect: boolean; headingCorrect: boolean; codeCorrect: boolean } {
  if (!actualCode) {
    return { score: 0, chapterCorrect: false, headingCorrect: false, codeCorrect: false };
  }

  const actual = normalizeHSCode(actualCode);
  let score = 0;

  // Chapter match (first 2 digits): 40 points
  const actualChapter = actual.substring(0, 2);
  const chapterCorrect = testCase.expected_chapter
    ? actualChapter === testCase.expected_chapter
    : false;

  if (chapterCorrect) {
    score += 40;
  } else if (testCase.alternative_chapters?.includes(actualChapter)) {
    score += 30; // partial credit for alternative chapter
  }

  // Heading match (first 4 digits): 30 points
  const actualHeading = actual.substring(0, 4);
  const headingCorrect = testCase.expected_heading
    ? actualHeading === testCase.expected_heading
    : false;
  if (headingCorrect) score += 30;

  // Full code match: 30 points
  const expectedNorm = testCase.expected_code
    ? normalizeHSCode(testCase.expected_code)
    : undefined;
  const codeCorrect = expectedNorm ? actual === expectedNorm : false;
  if (codeCorrect) score += 30;

  return { score, chapterCorrect, headingCorrect, codeCorrect };
}

/**
 * Score question quality heuristically (0-2).
 * +1 if targeted (contains product terms, not generic)
 * +1 if relevant (has options or classification-relevant terms)
 */
export function scoreQuestionQuality(
  query: string,
  questionAsked: string,
  options?: Array<{ label: string }>
): number {
  let score = 0;
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const questionLower = questionAsked.toLowerCase();

  // Targeted: mentions specific product terms, not generic
  const genericPhrases = [
    'what is this',
    'what are you looking',
    'tell me more',
    'can you provide',
  ];
  const isGeneric = genericPhrases.some(p => questionLower.includes(p));
  const hasProductTerms = queryWords.some(w => questionLower.includes(w));
  if (hasProductTerms && !isGeneric) score += 1;

  // Relevant: has multiple options or uses classification-relevant terms
  if (options && options.length >= 2) {
    score += 1;
  } else {
    const relevantTerms = [
      'material', 'use', 'purpose', 'type', 'form', 'grade',
      'application', 'industrial', 'medical', 'food', 'construction', 'vehicle',
    ];
    if (relevantTerms.some(t => questionLower.includes(t))) score += 1;
  }

  return score;
}

/**
 * Build 3x3 routing confusion matrix from eval details.
 */
export function buildConfusionMatrix(
  details: EvalDetail[]
): EvalReport['routing']['confusion_matrix'] {
  const matrix = {
    classify_as_classify: 0,
    classify_as_ask: 0,
    classify_as_reject: 0,
    ask_as_classify: 0,
    ask_as_ask: 0,
    ask_as_reject: 0,
    reject_as_classify: 0,
    reject_as_ask: 0,
    reject_as_reject: 0,
  };

  for (const d of details) {
    const key = `${d.expected_routing}_as_${d.actual_routing}` as keyof typeof matrix;
    if (key in matrix) {
      matrix[key]++;
    }
  }

  return matrix;
}

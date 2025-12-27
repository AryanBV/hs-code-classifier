/**
 * Candidate Filter Service
 *
 * Filters HS code candidates based on user answers to questions.
 * Uses the differential information to determine which codes to keep or eliminate.
 */

import { logger } from '../utils/logger';
import { Candidate } from './multi-candidate-search.service';
import { DynamicQuestion } from './dynamic-question.service';
import { CodeDifferential } from './code-differential.service';

// ========================================
// Types
// ========================================

export interface FilterResult {
  remaining: Candidate[];
  eliminated: Candidate[];
  eliminationReasons: Map<string, string>;  // code -> reason
  newConfidence: number;
  canClassify: boolean;
  classificationReason: string;
}

export interface AnswerMapping {
  questionId: string;
  answer: string;
  matchedOption: string | null;
  matchingCodes: string[];
  isOtherAnswer: boolean;
}

// ========================================
// Main Filter Function
// ========================================

/**
 * Filter candidates based on user answers
 */
export function filterCandidatesByAnswers(
  candidates: Candidate[],
  questions: DynamicQuestion[],
  answers: Record<string, string>
): FilterResult {
  let remaining = [...candidates];
  const eliminated: Candidate[] = [];
  const eliminationReasons = new Map<string, string>();

  // Process each answer
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.find(q => q.id === questionId);
    if (!question) {
      logger.warn(`Question not found for answer: ${questionId}`);
      continue;
    }

    const { differential } = question;
    const mapping = mapAnswerToOption(answer, question);

    if (mapping.isOtherAnswer) {
      // User selected "Other" - don't eliminate any codes, but boost those that don't match known options
      logger.debug(`Answer "${answer}" is "Other" - keeping all candidates`);
      continue;
    }

    if (mapping.matchedOption && mapping.matchingCodes.length > 0) {
      // Filter to only codes that match the selected option
      const matchingSet = new Set(mapping.matchingCodes);

      const beforeCount = remaining.length;
      const filtered = remaining.filter(c => {
        if (matchingSet.has(c.code)) {
          return true;
        }

        // Check if code is NOT in any option (might be unaffected by this differential)
        const isAffected = differential.affectedCodes.includes(c.code);
        if (!isAffected) {
          // Code wasn't in any option - keep it (might be a different category)
          return true;
        }

        // Code was affected but doesn't match - eliminate
        eliminated.push(c);
        eliminationReasons.set(
          c.code,
          `Doesn't match "${mapping.matchedOption}" for ${differential.feature}`
        );
        return false;
      });

      remaining = filtered;
      logger.debug(
        `Filter by "${differential.feature}": ${beforeCount} -> ${remaining.length} candidates`
      );
    }
  }

  // Calculate confidence and determine if we can classify
  const { confidence, canClassify, reason } = calculateConfidenceAndDecision(remaining, candidates.length);

  return {
    remaining,
    eliminated,
    eliminationReasons,
    newConfidence: confidence,
    canClassify,
    classificationReason: reason
  };
}

// ========================================
// Answer Mapping
// ========================================

/**
 * Map user's answer to a differential option
 */
function mapAnswerToOption(
  answer: string,
  question: DynamicQuestion
): AnswerMapping {
  const { differential } = question;

  // Check for "other" answer format
  if (answer.toLowerCase().startsWith('other:') || answer.toLowerCase() === 'other') {
    return {
      questionId: question.id,
      answer,
      matchedOption: null,
      matchingCodes: [],
      isOtherAnswer: true
    };
  }

  // Try exact match first
  const exactMatch = differential.options.find(
    opt => opt.displayText.toLowerCase() === answer.toLowerCase() ||
           opt.value.toLowerCase() === answer.toLowerCase()
  );

  if (exactMatch) {
    return {
      questionId: question.id,
      answer,
      matchedOption: exactMatch.displayText,
      matchingCodes: exactMatch.matchingCodes,
      isOtherAnswer: false
    };
  }

  // Try partial match
  const answerLower = answer.toLowerCase();
  const partialMatch = differential.options.find(opt => {
    const displayLower = opt.displayText.toLowerCase();
    const valueLower = opt.value.toLowerCase();
    return displayLower.includes(answerLower) ||
           valueLower.includes(answerLower) ||
           answerLower.includes(displayLower) ||
           answerLower.includes(valueLower);
  });

  if (partialMatch) {
    return {
      questionId: question.id,
      answer,
      matchedOption: partialMatch.displayText,
      matchingCodes: partialMatch.matchingCodes,
      isOtherAnswer: false
    };
  }

  // Check for index-based answer (e.g., "1", "2", "3")
  const answerIndex = parseInt(answer, 10);
  if (!isNaN(answerIndex) && answerIndex >= 1 && answerIndex <= question.options.length) {
    const optionByIndex = differential.options[answerIndex - 1];
    if (optionByIndex) {
      return {
        questionId: question.id,
        answer,
        matchedOption: optionByIndex.displayText,
        matchingCodes: optionByIndex.matchingCodes,
        isOtherAnswer: false
      };
    }
  }

  // No match found - treat as "other"
  logger.warn(`Could not match answer "${answer}" to any option in question ${question.id}`);
  return {
    questionId: question.id,
    answer,
    matchedOption: null,
    matchingCodes: [],
    isOtherAnswer: true
  };
}

// ========================================
// Confidence Calculation
// ========================================

/**
 * Calculate confidence and determine if classification is possible
 */
function calculateConfidenceAndDecision(
  remaining: Candidate[],
  originalCount: number
): { confidence: number; canClassify: boolean; reason: string } {
  if (remaining.length === 0) {
    return {
      confidence: 0,
      canClassify: false,
      reason: 'No candidates remain after filtering'
    };
  }

  if (remaining.length === 1) {
    return {
      confidence: 95,
      canClassify: true,
      reason: 'Single candidate remaining - high confidence'
    };
  }

  // Calculate based on top candidate's score vs others
  const sortedByScore = [...remaining].sort((a, b) => b.score - a.score);
  const topScore = sortedByScore[0]!.score;
  const secondScore = sortedByScore[1]?.score || 0;

  // Calculate spread
  const spread = topScore - secondScore;
  const relativeSpread = topScore > 0 ? spread / topScore : 0;

  // Calculate reduction ratio
  const reductionRatio = 1 - (remaining.length / originalCount);

  let confidence: number;
  let canClassify: boolean;
  let reason: string;

  if (remaining.length <= 2 && relativeSpread > 0.2) {
    // Only 2 candidates with clear leader
    confidence = 85 + (relativeSpread * 10);
    canClassify = true;
    reason = `Clear leader among ${remaining.length} candidates (${(relativeSpread * 100).toFixed(0)}% score gap)`;
  } else if (relativeSpread > 0.5) {
    // Very clear winner
    confidence = 90;
    canClassify = true;
    reason = `Strong leader with ${(relativeSpread * 100).toFixed(0)}% score advantage`;
  } else if (relativeSpread > 0.3) {
    // Likely winner
    confidence = 80;
    canClassify = remaining.length <= 3;
    reason = `Probable leader with ${(relativeSpread * 100).toFixed(0)}% score advantage`;
  } else if (relativeSpread > 0.1) {
    // Possible winner
    confidence = 70;
    canClassify = remaining.length <= 2;
    reason = `Possible leader but ${remaining.length} close candidates`;
  } else {
    // Uncertain
    confidence = 50 + (reductionRatio * 20);
    canClassify = remaining.length <= 2;
    reason = `Uncertain - ${remaining.length} candidates with similar scores`;
  }

  // Cap confidence
  confidence = Math.min(95, Math.max(30, confidence));

  return { confidence, canClassify, reason };
}

// ========================================
// Score Boosting
// ========================================

/**
 * Boost scores of candidates based on answers
 * This is used when "Other" is selected or for partial matches
 */
export function boostCandidateScores(
  candidates: Candidate[],
  questions: DynamicQuestion[],
  answers: Record<string, string>
): Candidate[] {
  const boosted = [...candidates];

  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.find(q => q.id === questionId);
    if (!question) continue;

    const mapping = mapAnswerToOption(answer, question);

    if (!mapping.isOtherAnswer && mapping.matchingCodes.length > 0) {
      // Boost codes that match the answer
      for (const candidate of boosted) {
        if (mapping.matchingCodes.includes(candidate.code)) {
          candidate.score *= 1.2; // 20% boost
        }
      }
    }
  }

  // Re-sort by score
  boosted.sort((a, b) => b.score - a.score);

  return boosted;
}

// ========================================
// Utility Functions
// ========================================

/**
 * Get explanation of why a code was eliminated
 */
export function getEliminationExplanation(
  eliminationReasons: Map<string, string>,
  code: string
): string {
  return eliminationReasons.get(code) || 'Unknown reason';
}

/**
 * Summarize filter results for logging
 */
export function summarizeFilterResults(result: FilterResult): string {
  const eliminated = result.eliminated.length;
  const remaining = result.remaining.length;
  const confidence = result.newConfidence.toFixed(0);

  return `Filtered: ${eliminated} eliminated, ${remaining} remaining, ${confidence}% confidence. ${result.classificationReason}`;
}

/**
 * Check if all mandatory differentials have been answered
 */
export function checkMandatoryDifferentialsCovered(
  questions: DynamicQuestion[],
  answers: Record<string, string>
): { allCovered: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const question of questions) {
    if (question.priority === 'required' && !answers[question.id]) {
      missing.push(question.text);
    }
  }

  return {
    allCovered: missing.length === 0,
    missing
  };
}

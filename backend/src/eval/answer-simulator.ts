// backend/src/eval/answer-simulator.ts
//
// OPT-IN answer simulation for the v2 eval harness (--simulate-answers).
//
// PURPOSE — make the ASK clarifying-question path MEASURABLE end-to-end.
//
// The baseline eval scores routing (classify/ask/reject vs GT) + classification
// on correctly-routed classify cases. When the system ASKs a clarifying question
// on a case that HAS a gold code, that ASK is invisible: the value of
// "ask → user answers → correct code" is never measured.
//
// This module simulates the user's answer: for an ASK output it derives the
// answer from the GOLD code's TRUE `tariff_line_attributes` value for the asked
// discriminating attribute, then calls `continueWithAnswer` and scores the final
// code end-to-end. The simulated answer is ALWAYS the gold-true value (or its
// matching option) — this is an HONEST measurement of "if the user answers the
// clarifying question correctly, do we reach the right code?", NOT gaming.
//
// The derivation is PURELY gold-attribute-driven and general — no per-case hacks.
// All I/O (DB lookup + continueWithAnswer) is injected so this is unit-testable
// without a live DB or classifier.

import type { AttributeKey, ClarifyingQuestion, ClassifyResult } from '../classifier-v2/types';
import { getGoldAttributeValues } from './gold-attributes-lookup';
import { continueWithAnswers } from '../classifier-v2';
import { normalizeHSCode } from './scorer';

/** Defensive multi-round cap — the orchestrator enforces a 3-round Q-budget. */
export const DEFAULT_MAX_ROUNDS = 3;

/**
 * Minimum option-label length eligible for substring matching. 1-char labels
 * ("a", "b") would spuriously match almost any gold value via substring, so a
 * label must be ≥2 chars to participate in the looser substring test. (Exact
 * equality is always allowed regardless of length.)
 */
const MIN_SUBSTRING_LABEL_LEN = 2;

/**
 * Fetch the gold-true attribute values (array) for a tariff-line code + attribute.
 * Returns null when the attribute is unset/empty for that code. Injected so the
 * loop is testable without a live DB.
 */
export type GoldAttributeLookup = (
  code: string,
  attribute: AttributeKey,
) => Promise<string[] | null>;

/**
 * The orchestrator's batch continuation (`continueWithAnswers`), or a test double
 * matching its shape. Accepts a MAP of {questionId → answerId} answered in ONE
 * round (a QGS batch is folded together in a single conceptual round). `rounds`
 * carries the number of clarifying rounds already completed before this call so
 * the orchestrator's round-based Q-budget cap counts re-entries, not answer keys.
 */
export type ContinueWithAnswersFn = (
  originalQuery: string,
  batchAnswers: Record<string, string>,
  opts?: { previousAnswers?: Record<string, string>; rounds?: number },
) => Promise<ClassifyResult>;

/** Per-round derivation+decision trace (mirrors EvalDetail.ask_recovery_attempt.answer_matches). */
export interface AnswerMatch {
  round: number;
  question_id: string;
  discriminating_attribute: AttributeKey;
  /** Gold attribute values for this code (joined for display); null when unset. */
  gold_attribute_value: string | null;
  /** The option.id fed to continueWithAnswer; null when unanswerable. */
  derived_answer_id: string | null;
  /** True iff a gold value matched an option. */
  answer_found: boolean;
  /** Decision returned AFTER feeding this answer; 'UNANSWERABLE' when no call was made. */
  system_decision_after: 'CLASSIFY' | 'ASK' | 'REFUSE' | 'UNANSWERABLE';
}

/** Outcome of one case's answer-simulation recovery attempt. */
export interface AnswerRecoveryResult {
  initial_question_id: string;
  rounds_attempted: number;
  /** Terminal state: a model decision, or 'UNANSWERABLE' (no matching option). */
  final_decision: 'CLASSIFY' | 'ASK' | 'REFUSE' | 'UNANSWERABLE';
  final_code_if_classify?: string;
  code_correct_after_recovery: boolean;
  answer_matches: AnswerMatch[];
  /** Raw terminal ClassifyResult (when a continueWithAnswer call was made). */
  final_result?: ClassifyResult;
}

/** Result of mapping a gold value array onto a question's options. */
export interface DerivedAnswer {
  derived_answer_id: string | null;
  answer_found: boolean;
}

/**
 * Map gold-true attribute values onto a clarifying question's options.
 *
 * A gold value array (e.g. `['roasted','ground']`) matches an option when the
 * option's label and a gold value are equal, or one contains the other
 * (case-insensitive). Substring matches require the label to be ≥2 chars to
 * avoid 1-char options spuriously matching arbitrary gold values. Options are
 * scanned in order; the FIRST matching option wins (deterministic).
 *
 * Returns `{ answer_found: false, derived_answer_id: null }` when the gold value
 * is null/empty OR no option matches — the caller treats that as "unanswerable"
 * and stops (does NOT fabricate an answer).
 */
export function deriveAnswerId(
  question: { options: { id: string; label: string }[] },
  goldValues: string[] | null,
): DerivedAnswer {
  if (goldValues === null || goldValues.length === 0) {
    return { derived_answer_id: null, answer_found: false };
  }
  const golds = goldValues.map((g) => g.toLowerCase().trim()).filter((g) => g.length > 0);
  if (golds.length === 0) return { derived_answer_id: null, answer_found: false };

  for (const opt of question.options) {
    const label = opt.label.toLowerCase().trim();
    if (label.length === 0) continue;
    for (const g of golds) {
      if (label === g) return { derived_answer_id: opt.id, answer_found: true };
      if (label.length >= MIN_SUBSTRING_LABEL_LEN) {
        if ((g.length >= MIN_SUBSTRING_LABEL_LEN && label.includes(g)) || g.includes(label)) {
          return { derived_answer_id: opt.id, answer_found: true };
        }
      }
    }
  }
  return { derived_answer_id: null, answer_found: false };
}

export interface SimulateAnswerRecoveryArgs {
  originalQuery: string;
  /** The ClassifyResult whose decision is 'ASK' (the first clarifying question/batch). */
  initialAsk: ClassifyResult;
  /** The case's gold tariff-line code (the answer source AND the scoring target). */
  goldCode: string;
  lookup: GoldAttributeLookup;
  /** Batch continuation (`continueWithAnswers`) — folds a whole round's answers in one call. */
  continueWithAnswers: ContinueWithAnswersFn;
  /** Defensive cap on rounds; defaults to {@link DEFAULT_MAX_ROUNDS}. */
  maxRounds?: number;
}

/**
 * Extract the round's questions from an ASK result. Prefers the candidate-aware
 * QGS `questions` batch; falls back to the single `question` (L1 fallback).
 */
function questionsOf(result: ClassifyResult): ClarifyingQuestion[] {
  if (result.questions && result.questions.questions.length > 0) {
    return result.questions.questions;
  }
  if (result.question) return [result.question];
  return [];
}

/**
 * Drive the multi-turn answer-simulation loop for a single ASK case.
 *
 * Per ROUND: read the round's question BATCH (QGS may surface several questions
 * in one turn). For EACH question, fetch the gold value for `goldCode` and derive
 * the matching option id. Fold every ANSWERABLE question's answer into
 * `previousAnswers` and make ONE batch `continueWithAnswers` call (a QGS batch is
 * a single conceptual round). The loop continues while the system keeps ASKing
 * (up to `maxRounds`); it stops on CLASSIFY, REFUSE, a fully-unanswerable round,
 * or the cap.
 *
 * No-leakage / silent-discriminator preserved: a question whose gold value
 * matches no offered option is NOT answered (no fabrication). A round is
 * UNANSWERABLE only when NONE of its questions can be answered — if at least one
 * is answerable, the answerable subset is fed (the honest "user answers what they
 * can" outcome).
 *
 * On a terminal CLASSIFY, `code_correct_after_recovery` is the normalized 8-digit
 * equality of the final code vs `goldCode`.
 */
export async function simulateAnswerRecovery(
  args: SimulateAnswerRecoveryArgs,
): Promise<AnswerRecoveryResult> {
  const { originalQuery, initialAsk, goldCode, lookup, continueWithAnswers: cont } = args;
  const maxRounds = args.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const initialQuestions = questionsOf(initialAsk);
  if (initialAsk.decision !== 'ASK' || initialQuestions.length === 0) {
    // Caller must only invoke this for an ASK result; guard defensively.
    throw new Error('simulateAnswerRecovery: initialAsk.decision must be ASK with a question');
  }

  const initialQuestionId = initialQuestions[0]!.question_id;
  const answerMatches: AnswerMatch[] = [];
  const previousAnswers: Record<string, string> = {};

  let current: ClassifyResult = initialAsk;
  let rounds = 0;

  while (current.decision === 'ASK' && rounds < maxRounds) {
    const roundQuestions = questionsOf(current);
    if (roundQuestions.length === 0) break;

    const roundNumber = rounds + 1;
    const batchAnswers: Record<string, string> = {};
    // Per-question derivation results (recorded after the batch call resolves so
    // each AnswerMatch carries the post-round decision).
    const derivations: Array<{
      question: ClarifyingQuestion;
      goldValues: string[] | null;
      derivedId: string | null;
      answerFound: boolean;
    }> = [];

    for (const q of roundQuestions) {
      const goldValues = await lookup(goldCode, q.discriminating_attribute);
      const derived = deriveAnswerId(q, goldValues);
      derivations.push({
        question: q,
        goldValues,
        derivedId: derived.derived_answer_id,
        answerFound: derived.answer_found,
      });
      if (derived.answer_found && derived.derived_answer_id !== null) {
        batchAnswers[q.question_id] = derived.derived_answer_id;
        previousAnswers[q.question_id] = derived.derived_answer_id;
      }
    }

    // A round is UNANSWERABLE only when NONE of its questions could be answered.
    if (Object.keys(batchAnswers).length === 0) {
      for (const d of derivations) {
        answerMatches.push({
          round: roundNumber,
          question_id: d.question.question_id,
          discriminating_attribute: d.question.discriminating_attribute,
          gold_attribute_value:
            d.goldValues && d.goldValues.length > 0 ? d.goldValues.join(', ') : null,
          derived_answer_id: null,
          answer_found: false,
          system_decision_after: 'UNANSWERABLE',
        });
      }
      return {
        initial_question_id: initialQuestionId,
        rounds_attempted: rounds,
        final_decision: 'UNANSWERABLE',
        code_correct_after_recovery: false,
        answer_matches: answerMatches,
      };
    }

    const next = await cont(originalQuery, batchAnswers, {
      previousAnswers: { ...previousAnswers },
      // Rounds completed BEFORE this call — the orchestrator's round-based cap
      // treats this whole batch as exactly ONE round (not one per answer key).
      rounds,
    });
    rounds++;

    for (const d of derivations) {
      answerMatches.push({
        round: roundNumber,
        question_id: d.question.question_id,
        discriminating_attribute: d.question.discriminating_attribute,
        gold_attribute_value:
          d.goldValues && d.goldValues.length > 0 ? d.goldValues.join(', ') : null,
        derived_answer_id: d.answerFound ? d.derivedId : null,
        answer_found: d.answerFound,
        // Per-question decision reflects the single batch continuation outcome.
        system_decision_after: next.decision,
      });
    }

    current = next;
  }

  // Terminal classification of the loop's final state.
  if (current.decision === 'CLASSIFY' && current.classification) {
    const finalCode = current.classification.code;
    const correct = normalizeHSCode(finalCode) === normalizeHSCode(goldCode);
    return {
      initial_question_id: initialQuestionId,
      rounds_attempted: rounds,
      final_decision: 'CLASSIFY',
      final_code_if_classify: finalCode,
      code_correct_after_recovery: correct,
      answer_matches: answerMatches,
      final_result: current,
    };
  }

  // REFUSE, or still ASK at the cap (final_decision reflects the terminal state).
  return {
    initial_question_id: initialQuestionId,
    rounds_attempted: rounds,
    final_decision: current.decision === 'REFUSE' ? 'REFUSE' : 'ASK',
    code_correct_after_recovery: false,
    answer_matches: answerMatches,
    final_result: current === initialAsk ? undefined : current,
  };
}

/**
 * Production wiring: the real gold lookup + real orchestrator continueWithAnswer.
 * The runner calls THIS when `--simulate-answers` is on; tests call
 * `simulateAnswerRecovery` directly with injected doubles.
 */
export function runAnswerSimulation(
  originalQuery: string,
  initialAsk: ClassifyResult,
  goldCode: string,
): Promise<AnswerRecoveryResult> {
  return simulateAnswerRecovery({
    originalQuery,
    initialAsk,
    goldCode,
    lookup: getGoldAttributeValues,
    continueWithAnswers,
  });
}

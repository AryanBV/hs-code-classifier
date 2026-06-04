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
 * Length-ratio floor for the substring rule (FIX-1): the shorter canonical string
 * must cover ≥ this fraction of the longer for a substring containment to count.
 *
 * This is the ROOT-CAUSE guard against fabricated recoveries where a short option
 * label is merely a minor TOKEN of a longer multi-word gold value:
 *   gold "alloy steel" (11) ⊃ option "steel" (5) → ratio 5/11 ≈ 0.45 → REJECTED.
 * It still bridges genuine morphological variants:
 *   gold "roasted" (7) ⊃ option "roast" (5) → ratio 5/7 ≈ 0.71 → ACCEPTED.
 *
 * Chosen at 0.6: strictly between the must-reject 0.4545 (steel⊂alloy-steel) and
 * the must-pass 0.714 (roast⊂roasted). A whole-word-boundary check would NOT fix
 * the steel case ("steel" is a whole word in "alloy steel"); only a coverage
 * ratio distinguishes "minor token" from "morphological variant".
 */
const SUBSTRING_LENGTH_RATIO_FLOOR = 0.6;

/**
 * Negation tokens whose presence/absence flips meaning. A substring containment
 * across a polarity boundary is NEVER a real match (FIX-1):
 *   gold "non alloy steel" ⊃ option "alloy steel" → polarity inversion → REJECTED,
 * even though the length ratio (11/15 ≈ 0.73) clears the floor. We reject when one
 * side carries a leading negation token the other lacks.
 */
const NEGATION_TOKENS = new Set(['non', 'not', 'un', 'no', 'without', 'free']);

/** True when `value` (canonical, space-separated) begins with a negation token. */
function hasLeadingNegation(value: string): boolean {
  const first = value.split(' ', 1)[0] ?? '';
  return NEGATION_TOKENS.has(first);
}

/**
 * Substring-containment match between two CANONICAL strings, guarded against
 * fabrication. Returns true only when one contains the other AND the shorter
 * covers ≥ {@link SUBSTRING_LENGTH_RATIO_FLOOR} of the longer AND the two agree on
 * leading-negation polarity. Both must be ≥ {@link MIN_SUBSTRING_LABEL_LEN}.
 */
function substringMatch(a: string, b: string): boolean {
  if (a.length < MIN_SUBSTRING_LABEL_LEN || b.length < MIN_SUBSTRING_LABEL_LEN) return false;
  const contains = a.includes(b) || b.includes(a);
  if (!contains) return false;
  // Polarity guard: a negation on exactly one side means opposite meaning.
  if (hasLeadingNegation(a) !== hasLeadingNegation(b)) return false;
  // Coverage guard: the shorter must be a large fraction of the longer.
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  return shorter / longer >= SUBSTRING_LENGTH_RATIO_FLOOR;
}

/**
 * Escape / non-substantive option ids+labels that must NEVER count as a gold
 * answer. A gold value can sometimes be the literal token "other" (when the
 * underlying corpus stored an "Other"-by-elimination leaf), which would
 * EXACT-match an "Other" option after normalization and fabricate a recovery.
 * The simulator's honesty invariant: a recovery exists only when a gold value
 * maps to a REAL discriminating option.
 */
const ESCAPE_OPTION_TOKENS = new Set([
  'other',
  'none',
  'none of the above',
  'not sure',
  'unknown',
  'not applicable',
  'na',
]);

/**
 * Canonical comparison form: lowercase, collapse every run of hyphen/underscore/
 * whitespace to a single space, trim. Bridges the raw gold DB strings
 * ("alloy-steel", "passenger-car", "barnyard_millet") and the title-cased option
 * labels ("Alloy Steel", "Passenger Car", "Barnyard Millet") so casing/separator
 * skew no longer produces a FALSE NEGATIVE. This is the LEGIT P0-A item-8 fix —
 * it tightens matching to true equivalence, it does NOT loosen it.
 */
export function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

/** Slug form (canonical with spaces → single hyphen) for option.id comparison. */
function slugify(value: string): string {
  return canonicalize(value).replace(/ /g, '-');
}

/** True when an option is a non-substantive escape choice (must never count). */
function isEscapeOption(opt: { id: string; label: string }): boolean {
  return ESCAPE_OPTION_TOKENS.has(canonicalize(opt.id)) || ESCAPE_OPTION_TOKENS.has(canonicalize(opt.label));
}

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
 * DIVERGENCE-AWARE derivation (runs BEFORE text-matching).
 *
 * A DIVERGENCE-ask's options are LEAF-GROUNDED: each carries `target_codes` — the
 * real 8-digit leaf code(s) that answering with that option would select. For such
 * a question the gold answer is DETERMINISTIC: pick the option whose `target_codes`
 * includes the gold code (compared via {@link normalizeHSCode}). This bypasses the
 * value-mismatch false-negative where an LLM-phrased option label ("Whole carcass /
 * whole animal", id "whole") does not text-match the gold code's stored
 * tariff_line_attributes value ("carcass, whole-bird") — yet a real user picking
 * that option provably reaches the gold leaf.
 *
 * HONESTY INVARIANT (must hold): we ONLY return an option whose target leaf is
 * EXACTLY the gold code. If NO option's `target_codes` contains the gold (or no
 * option carries `target_codes` at all — i.e. a triage/sibling/QGS ask), we return
 * `answer_found: false` so the caller FALLS THROUGH to the existing text-matching
 * path. The escape ('other') option never carries `target_codes`, so it can never
 * be picked here. A null/empty gold code is non-derivable.
 *
 * Returns `{ answer_found: false, derived_answer_id: null }` when no leaf-grounded
 * option maps EXACTLY to the gold — never a fabricated/approximate recovery.
 */
export function deriveDivergenceAnswerId(
  question: { options: { id: string; label: string; target_codes?: string[] }[] },
  goldCode: string,
): DerivedAnswer {
  const goldNorm = normalizeHSCode(goldCode);
  if (goldNorm.length === 0) return { derived_answer_id: null, answer_found: false };

  for (const opt of question.options) {
    // Escape / non-leaf-grounded options carry no target_codes — never derivable here.
    if (opt.target_codes === undefined || opt.target_codes.length === 0) continue;
    for (const code of opt.target_codes) {
      if (normalizeHSCode(code) === goldNorm) {
        return { derived_answer_id: opt.id, answer_found: true };
      }
    }
  }
  return { derived_answer_id: null, answer_found: false };
}

/**
 * Map gold-true attribute values onto a clarifying question's options.
 *
 * Matching is done on a CANONICAL form ({@link canonicalize}: lowercase, collapse
 * `[-_\s]+` to one space, trim) so the raw gold DB strings ("alloy-steel",
 * "barnyard_millet") align with title-cased option labels ("Alloy Steel",
 * "Barnyard Millet") — the P0-A item-8 fix for the dominant value-mismatch false
 * negative. A gold value matches an option when, in canonical form, it (1) equals
 * the option's label, OR equals its slugified/canonical id; OR (2) passes the
 * GUARDED substring test ({@link substringMatch}: length-ratio floor + negation
 * polarity), which bridges only morphological variants — never minor token
 * overlap. Options are scanned in order; the FIRST matching option wins.
 *
 * HONESTY INVARIANTS (must not regress):
 *  - Escape/non-substantive options ("other", "none", …) NEVER count, even on a
 *    canonical-exact match — that would fabricate a recovery.
 *  - The substring rule will NOT bridge a short option label that is a minor token
 *    of a longer multi-word gold (e.g. "steel" ⊄match "alloy steel"), nor a
 *    polarity inversion ("alloy steel" ⊄match "non alloy steel"). See FIX-1.
 *
 * Returns `{ answer_found: false, derived_answer_id: null }` when the gold value
 * is null/empty OR no real option matches — the caller treats that as
 * "unanswerable" and stops (does NOT fabricate an answer).
 */
export function deriveAnswerId(
  question: { options: { id: string; label: string }[] },
  goldValues: string[] | null,
): DerivedAnswer {
  if (goldValues === null || goldValues.length === 0) {
    return { derived_answer_id: null, answer_found: false };
  }
  const golds = goldValues
    .map((g) => ({ canon: canonicalize(g), slug: slugify(g) }))
    .filter((g) => g.canon.length > 0);
  if (golds.length === 0) return { derived_answer_id: null, answer_found: false };

  for (const opt of question.options) {
    // Escape options can never count — guards against fabricated recoveries.
    if (isEscapeOption(opt)) continue;
    const labelCanon = canonicalize(opt.label);
    const idCanon = canonicalize(opt.id);
    if (labelCanon.length === 0 && idCanon.length === 0) continue;

    for (const g of golds) {
      // 1) canonical-exact on label OR slugified-id (the legit fix).
      if (g.canon === labelCanon || g.slug === idCanon || g.canon === idCanon) {
        return { derived_answer_id: opt.id, answer_found: true };
      }
      // 2) GUARDED substring on the label (length-ratio + negation polarity) — the
      //    FIX-1 root-cause guard against minor-token fabrication.
      if (substringMatch(labelCanon, g.canon)) {
        return { derived_answer_id: opt.id, answer_found: true };
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
      // DIVERGENCE-AWARE first: if this question's options are leaf-grounded
      // (carry target_codes), derive deterministically by gold-code equality.
      // This is a no-op for triage/sibling/QGS asks (no target_codes) → those
      // FALL THROUGH to the existing gold-attribute text-match, BYTE-IDENTICAL.
      const divergence = deriveDivergenceAnswerId(q, goldCode);
      const derived = divergence.answer_found ? divergence : deriveAnswerId(q, goldValues);
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

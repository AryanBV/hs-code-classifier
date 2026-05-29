import { describe, it, expect, vi } from 'vitest';
import {
  deriveAnswerId,
  simulateAnswerRecovery,
  type GoldAttributeLookup,
  type ContinueWithAnswersFn,
} from './answer-simulator';
import type { ClassifyResult, ClarifyingQuestion, ClarifyingQuestionBatch } from '../classifier-v2/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const diag = (path: string[] = ['L0', 'L1']): ClassifyResult['diagnostics'] => ({
  escalation_path: path,
  latency_ms: 10,
  llm_calls: 1,
});

const askQuestion = (over: Partial<ClarifyingQuestion> = {}): ClarifyingQuestion => ({
  question_id: 'ask_processing_state',
  question_text: 'Is the coffee roasted or not roasted?',
  discriminating_attribute: 'processing_state',
  options: [
    { id: 'roasted', label: 'Roasted' },
    { id: 'not_roasted', label: 'Not roasted' },
  ],
  ...over,
});

const askResult = (question: ClarifyingQuestion, path: string[] = ['L0', 'L1']): ClassifyResult => ({
  decision: 'ASK',
  question,
  diagnostics: diag(path),
});

/** Build a QGS-batch ASK result (multiple questions surfaced in one turn). */
const askBatchResult = (
  questions: ClarifyingQuestion[],
  path: string[] = ['L0', 'L1', 'L2', 'L3', 'QGS'],
): ClassifyResult => {
  const batch: ClarifyingQuestionBatch = {
    questions,
    total_ig_potential: questions.reduce((s, q) => s + (q.info_gain_score ?? 0), 0),
  };
  return {
    decision: 'ASK',
    question: questions[0],
    questions: batch,
    diagnostics: diag(path),
  };
};

const classifyResult = (code: string, path: string[] = ['L0', 'L1', 'L2', 'L4', 'L5']): ClassifyResult => ({
  decision: 'CLASSIFY',
  classification: {
    code,
    is_six_digit: false,
    export_policy: 'Free',
    policy_condition: null,
    india_specific: false,
    citation: { primary: { type: 'leaf_description', source_ref: 'x', verbatim_text: 't', note_or_exclusion_id: null }, gir_applied: 'GIR-1' },
    reasoning_chain: ['r'],
    self_confidence: 'HIGH',
    alternatives_considered: [],
    components: null,
    escalated_to_deep_think: false,
  },
  diagnostics: diag(path),
});

const refuseResult = (path: string[] = ['L0', 'L1']): ClassifyResult => ({
  decision: 'REFUSE',
  refusal: { reason: 'Q-budget exhausted', out_of_scope_class: 'function_only_no_substance', verifier_failures: [] },
  diagnostics: diag(path),
});

// ---------------------------------------------------------------------------
// deriveAnswerId (pure)
// ---------------------------------------------------------------------------

describe('deriveAnswerId (pure gold→option mapping)', () => {
  it('matches an option whose label contains a gold-array value (case-insensitive)', () => {
    const q = askQuestion();
    const d = deriveAnswerId(q, ['roasted', 'ground']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('roasted');
  });

  it('matches when the gold value contains the option label (reverse substring)', () => {
    const q = askQuestion({
      options: [
        { id: 'roast', label: 'roast' },
        { id: 'green', label: 'green' },
      ],
    });
    const d = deriveAnswerId(q, ['roasted']); // gold 'roasted' contains option label 'roast'
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('roast');
  });

  it('returns answer_found=false (unanswerable) when no gold value matches any option', () => {
    const q = askQuestion(); // options: roasted / not_roasted
    const d = deriveAnswerId(q, ['frozen', 'liquid']);
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });

  it('returns answer_found=false when the gold attribute is null/empty', () => {
    const q = askQuestion();
    expect(deriveAnswerId(q, null).answer_found).toBe(false);
    expect(deriveAnswerId(q, []).answer_found).toBe(false);
    expect(deriveAnswerId(q, null).derived_answer_id).toBeNull();
  });

  it('does not match on trivially-short tokens (avoids spurious substring hits)', () => {
    const q = askQuestion({
      options: [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
      ],
    });
    // 'a' is a 1-char label; a gold value like 'steel' must NOT match it.
    const d = deriveAnswerId(q, ['steel']);
    expect(d.answer_found).toBe(false);
  });

  it('does not let a 1-char GOLD value substring-match a long option label', () => {
    const q = askQuestion({
      options: [
        { id: 'arabica', label: 'Arabica' },
        { id: 'robusta', label: 'Robusta' },
      ],
    });
    // Gold value 'a' (1 char): exact match fails; the 1-char gold is excluded
    // from label.includes(g) ('arabica'.includes('a') would otherwise be true);
    // and 'a'.includes('arabica') is false. So no fabricated match.
    const d = deriveAnswerId(q, ['a']);
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// simulateAnswerRecovery (multi-round loop, deps injected)
// ---------------------------------------------------------------------------

describe('simulateAnswerRecovery', () => {
  it('single round: derives gold answer, reaches the correct code', async () => {
    const lookup: GoldAttributeLookup = vi.fn(async (_code, attr) => {
      expect(attr).toBe('processing_state');
      return ['roasted'];
    });
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, batch) => {
      expect(batch).toEqual({ ask_processing_state: 'roasted' });
      return classifyResult('0901.21.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(askQuestion()),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.final_code_if_classify).toBe('0901.21.00');
    expect(out.code_correct_after_recovery).toBe(true);
    expect(out.rounds_attempted).toBe(1);
    expect(out.answer_matches).toHaveLength(1);
    expect(out.answer_matches[0]!.answer_found).toBe(true);
    expect(out.answer_matches[0]!.system_decision_after).toBe('CLASSIFY');
    expect(cont).toHaveBeenCalledTimes(1);
  });

  it('multi-round: a second ASK is answered before reaching the code', async () => {
    const q1 = askQuestion();
    const q2 = askQuestion({
      question_id: 'ask_material',
      discriminating_attribute: 'material',
      options: [
        { id: 'arabica', label: 'Arabica' },
        { id: 'robusta', label: 'Robusta' },
      ],
    });
    const lookup: GoldAttributeLookup = vi.fn(async (_code, attr) => {
      if (attr === 'processing_state') return ['roasted'];
      if (attr === 'material') return ['robusta'];
      return null;
    });
    let call = 0;
    const accumulatedSeen: Record<string, string>[] = [];
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, _batch, opts) => {
      accumulatedSeen.push({ ...(opts?.previousAnswers ?? {}) });
      call++;
      if (call === 1) return askResult(q2);
      return classifyResult('0901.22.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(q1),
      goldCode: '0901.22.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.rounds_attempted).toBe(2);
    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.code_correct_after_recovery).toBe(true);
    expect(out.answer_matches.map((m) => m.question_id)).toEqual(['ask_processing_state', 'ask_material']);
    // previousAnswers must accumulate across rounds.
    expect(accumulatedSeen[1]).toEqual({ ask_processing_state: 'roasted', ask_material: 'robusta' });
  });

  it('unanswerable: stops when no option matches the gold value (no continueWithAnswers call)', async () => {
    const lookup: GoldAttributeLookup = vi.fn(async () => ['frozen']); // not in options
    const cont: ContinueWithAnswersFn = vi.fn(async () => classifyResult('0901.21.00'));

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(askQuestion()),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('UNANSWERABLE');
    expect(out.code_correct_after_recovery).toBe(false);
    expect(out.rounds_attempted).toBe(0);
    expect(out.answer_matches).toHaveLength(1);
    expect(out.answer_matches[0]!.answer_found).toBe(false);
    expect(cont).not.toHaveBeenCalled();
  });

  it('wrong code after recovery: final CLASSIFY does not match gold', async () => {
    const lookup: GoldAttributeLookup = vi.fn(async () => ['roasted']);
    const cont: ContinueWithAnswersFn = vi.fn(async () => classifyResult('0901.21.00'));

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(askQuestion()),
      goldCode: '0901.90.00', // different from what the system returns
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.final_code_if_classify).toBe('0901.21.00');
    expect(out.code_correct_after_recovery).toBe(false);
  });

  it('REFUSE after answering: stops and records the refusal', async () => {
    const lookup: GoldAttributeLookup = vi.fn(async () => ['roasted']);
    const cont: ContinueWithAnswersFn = vi.fn(async () => refuseResult());

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(askQuestion()),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('REFUSE');
    expect(out.code_correct_after_recovery).toBe(false);
    expect(out.rounds_attempted).toBe(1);
  });

  it('defensive cap: stops after Q-budget (3) rounds even if the system keeps asking', async () => {
    // System always asks a NEW question; gold always answerable. Loop must cap.
    const lookup: GoldAttributeLookup = vi.fn(async () => ['roasted']);
    let n = 0;
    const cont: ContinueWithAnswersFn = vi.fn(async () => {
      n++;
      return askResult(
        askQuestion({ question_id: `ask_q${n}`, discriminating_attribute: 'processing_state' }),
      );
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askResult(askQuestion({ question_id: 'ask_q0' })),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
      maxRounds: 3,
    });

    expect(out.rounds_attempted).toBe(3);
    expect(out.final_decision).toBe('ASK'); // still asking when the cap hit
    expect(out.code_correct_after_recovery).toBe(false);
    expect(cont).toHaveBeenCalledTimes(3);
  });

  it('QGS batch: derives an answer per question and folds them into ONE round', async () => {
    const q1 = askQuestion({
      question_id: 'ask_processing_state',
      discriminating_attribute: 'processing_state',
      options: [{ id: 'roasted', label: 'Roasted' }, { id: 'green', label: 'Green' }],
      info_gain_score: 1.0,
      qgs_used: true,
    });
    const q2 = askQuestion({
      question_id: 'ask_material',
      discriminating_attribute: 'material',
      options: [{ id: 'arabica', label: 'Arabica' }, { id: 'robusta', label: 'Robusta' }],
      info_gain_score: 0.8,
      qgs_used: true,
    });
    const lookup: GoldAttributeLookup = vi.fn(async (_code, attr) => {
      if (attr === 'processing_state') return ['roasted'];
      if (attr === 'material') return ['robusta'];
      return null;
    });
    let seenBatch: Record<string, string> | null = null;
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, batch) => {
      seenBatch = batch;
      return classifyResult('0901.22.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askBatchResult([q1, q2]),
      goldCode: '0901.22.00',
      lookup,
      continueWithAnswers: cont,
    });

    // ONE batch call folding BOTH answers — a QGS batch is a single round.
    expect(cont).toHaveBeenCalledTimes(1);
    expect(out.rounds_attempted).toBe(1);
    expect(seenBatch).toEqual({ ask_processing_state: 'roasted', ask_material: 'robusta' });
    // One AnswerMatch per question, both tagged round 1.
    expect(out.answer_matches).toHaveLength(2);
    expect(out.answer_matches.every((m) => m.round === 1)).toBe(true);
    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.code_correct_after_recovery).toBe(true);
  });

  it('QGS batch: feeds only the answerable subset; round is not unanswerable if ≥1 answers', async () => {
    const q1 = askQuestion({
      question_id: 'ask_processing_state',
      discriminating_attribute: 'processing_state',
      options: [{ id: 'roasted', label: 'Roasted' }, { id: 'green', label: 'Green' }],
    });
    const q2 = askQuestion({
      question_id: 'ask_material',
      discriminating_attribute: 'material',
      options: [{ id: 'arabica', label: 'Arabica' }, { id: 'robusta', label: 'Robusta' }],
    });
    const lookup: GoldAttributeLookup = vi.fn(async (_code, attr) => {
      if (attr === 'processing_state') return ['roasted'];
      return ['unlisted_material']; // q2 unanswerable
    });
    let seenBatch: Record<string, string> | null = null;
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, batch) => {
      seenBatch = batch;
      return classifyResult('0901.21.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askBatchResult([q1, q2]),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(cont).toHaveBeenCalledTimes(1);
    // Only the answerable question's answer is folded (no fabrication for q2).
    expect(seenBatch).toEqual({ ask_processing_state: 'roasted' });
    const q2Match = out.answer_matches.find((m) => m.question_id === 'ask_material');
    expect(q2Match?.answer_found).toBe(false);
    expect(q2Match?.derived_answer_id).toBeNull();
    expect(out.final_decision).toBe('CLASSIFY');
  });

  it('QGS batch: a fully-unanswerable round is UNANSWERABLE (no continuation call)', async () => {
    const q1 = askQuestion({ question_id: 'ask_form', discriminating_attribute: 'form' });
    const q2 = askQuestion({ question_id: 'ask_material', discriminating_attribute: 'material' });
    const lookup: GoldAttributeLookup = vi.fn(async () => ['nothing_matches']);
    const cont: ContinueWithAnswersFn = vi.fn(async () => classifyResult('0901.21.00'));

    const out = await simulateAnswerRecovery({
      originalQuery: 'coffee',
      initialAsk: askBatchResult([q1, q2]),
      goldCode: '0901.21.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(cont).not.toHaveBeenCalled();
    expect(out.final_decision).toBe('UNANSWERABLE');
    expect(out.answer_matches).toHaveLength(2);
    expect(out.answer_matches.every((m) => m.answer_found === false)).toBe(true);
  });
});

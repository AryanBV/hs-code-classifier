import { describe, it, expect, vi } from 'vitest';
import {
  deriveAnswerId,
  deriveDivergenceAnswerId,
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

  // -------------------------------------------------------------------------
  // Canonical-normalization fix (P0-A item 8): hyphen/space/underscore/case skew
  // between raw gold DB strings and title-cased option labels caused FALSE
  // NEGATIVES. Normalize BOTH sides (lowercase, collapse [-_\s]+ → single space,
  // trim) before exact comparison; also match slugified-gold to option.id.
  // -------------------------------------------------------------------------

  it('matches hyphenated gold to title-cased space label: alloy-steel ↔ Alloy Steel', () => {
    const q = askQuestion({
      options: [
        { id: 'alloy_steel', label: 'Alloy Steel' },
        { id: 'carbon_steel', label: 'Carbon Steel' },
      ],
    });
    const d = deriveAnswerId(q, ['alloy-steel']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('alloy_steel');
  });

  it('matches hyphenated gold to title-cased space label: passenger-car ↔ Passenger Car', () => {
    const q = askQuestion({
      options: [
        { id: 'passenger_car', label: 'Passenger Car' },
        { id: 'commercial', label: 'Commercial Vehicle' },
      ],
    });
    const d = deriveAnswerId(q, ['passenger-car']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('passenger_car');
  });

  it('matches underscored gold to title-cased space label: barnyard_millet ↔ Barnyard Millet', () => {
    const q = askQuestion({
      options: [
        { id: 'barnyard_millet', label: 'Barnyard Millet' },
        { id: 'finger_millet', label: 'Finger Millet' },
      ],
    });
    const d = deriveAnswerId(q, ['barnyard_millet']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('barnyard_millet');
  });

  it('matches slugified gold against option.id when labels do not align', () => {
    // Label is a human phrase but the id is the slug; canonical-slug equality
    // on the id still resolves the answer.
    const q = askQuestion({
      options: [
        { id: 'alloy-steel', label: 'Steel containing alloying elements' },
        { id: 'carbon-steel', label: 'Plain carbon steel' },
      ],
    });
    const d = deriveAnswerId(q, ['alloy_steel']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('alloy-steel');
  });

  it('escape options (other / none) NEVER match a real gold value, even after normalization', () => {
    const q = askQuestion({
      options: [
        { id: 'other', label: 'Other' },
        { id: 'none', label: 'None of the above' },
      ],
    });
    // Gold value 'other' would EXACT-match the 'Other' option after normalization,
    // but escape options must never count — this prevents fabricated recoveries.
    expect(deriveAnswerId(q, ['other']).answer_found).toBe(false);
    expect(deriveAnswerId(q, ['none']).answer_found).toBe(false);
    expect(deriveAnswerId(q, ['alloy-steel']).answer_found).toBe(false);
  });

  it('normalization does not manufacture a match the exact rule would not produce', () => {
    // 'frozen' canonical-normalizes to 'frozen'; no option canonical-equals it,
    // and the (kept, label≥2) substring rule must not bridge unrelated tokens.
    const q = askQuestion({
      options: [
        { id: 'roasted', label: 'Roasted' },
        { id: 'green', label: 'Green' },
      ],
    });
    expect(deriveAnswerId(q, ['frozen']).answer_found).toBe(false);
  });

  // -------------------------------------------------------------------------
  // FIX-1: the substring rule must NOT fabricate a recovery by matching a short
  // option label that is a MINOR TOKEN of a longer multi-word gold value, nor a
  // polarity inversion. Root-cause guard = length-ratio floor (0.6) + negation
  // polarity check (a whole-word check does NOT fix this — "steel" IS a whole
  // word in "alloy steel").
  // -------------------------------------------------------------------------

  it('does NOT match a short label that is a minor token of a longer gold: alloy-steel ⊅ Steel', () => {
    const q = askQuestion({
      options: [
        { id: 'steel', label: 'Steel' },
        { id: 'aluminium', label: 'Aluminium' },
      ],
    });
    // gold "alloy steel" (11) ⊃ "steel" (5) → ratio 0.45 < 0.6 → fabrication blocked.
    const d = deriveAnswerId(q, ['alloy-steel']);
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });

  it('does NOT match across a negation polarity boundary: non-alloy-steel ⊅ Alloy Steel', () => {
    const q = askQuestion({
      options: [
        { id: 'alloy_steel', label: 'Alloy Steel' },
        { id: 'carbon_steel', label: 'Carbon Steel' },
      ],
    });
    // gold "non alloy steel" (15) ⊃ "alloy steel" (11) → ratio 0.73 ≥ 0.6 BUT the
    // gold carries a leading negation the option lacks → opposite meaning → blocked.
    const d = deriveAnswerId(q, ['non-alloy-steel']);
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });

  it('STILL matches a genuine morphological variant: roasted ↔ Roast (ratio 5/7 ≥ 0.6)', () => {
    const q = askQuestion({
      options: [
        { id: 'roast', label: 'Roast' },
        { id: 'green', label: 'Green' },
      ],
    });
    const d = deriveAnswerId(q, ['roasted']);
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('roast');
  });

  it('regression: the r7 DB098 case (non-alloy-steel gold) is no longer mis-derived to alloy_steel', () => {
    const q = askQuestion({
      question_id: 'ask_material',
      discriminating_attribute: 'material',
      options: [
        { id: 'alloy_steel', label: 'Alloy Steel' },
        { id: 'stainless_steel', label: 'Stainless Steel' },
        { id: 'other', label: 'Other' },
      ],
    });
    const d = deriveAnswerId(q, ['non-alloy-steel']);
    expect(d.answer_found).toBe(false); // was incorrectly 'alloy_steel' before FIX-1
  });
});

// ---------------------------------------------------------------------------
// deriveDivergenceAnswerId (pure) — leaf-grounded divergence-ask derivation.
// A divergence option carries `target_codes` (the real 8-digit leaves it selects);
// the gold answer is the FIRST option whose target leaf == gold (normalizeHSCode
// equality). Escape options carry no target_codes and must NEVER be picked.
// ---------------------------------------------------------------------------

describe('deriveDivergenceAnswerId (pure leaf-grounded mapping)', () => {
  /** Frozen-chicken divergence ASK, shaped exactly like toClarifyingQuestion output:
   *  real options carry target_codes; the appended generic escape does NOT. */
  const frozenChickenQuestion = {
    options: [
      { id: 'whole', label: 'Whole bird (not cut in pieces)', target_codes: ['0207.12.00'] },
      { id: 'cut', label: 'Cuts and offal', target_codes: ['0207.14.00'] },
      { id: 'other', label: 'Other / not listed (please describe)' }, // escape: no target_codes
    ],
  };

  it('frozen-chicken: gold 0207.12.00 derives the "whole" option (not the LLM label)', () => {
    const d = deriveDivergenceAnswerId(frozenChickenQuestion, '0207.12.00');
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('whole');
  });

  it('frozen-chicken: gold 0207.14.00 derives the "cut" option', () => {
    const d = deriveDivergenceAnswerId(frozenChickenQuestion, '0207.14.00');
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('cut');
  });

  it('normalizes both sides: dotless gold 02071200 still matches 0207.12.00 target', () => {
    const d = deriveDivergenceAnswerId(frozenChickenQuestion, '02071200');
    expect(d.answer_found).toBe(true);
    expect(d.derived_answer_id).toBe('whole');
  });

  it('NEVER picks the escape option even when gold is absent from every real option', () => {
    // Gold not in any real option's target_codes; the escape has no target_codes →
    // must remain unanswerable (escape can never be selected). Honesty invariant.
    const d = deriveDivergenceAnswerId(frozenChickenQuestion, '0207.99.00');
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });

  it('multi-leaf option (cross-sub class): gold matching ANY leaf in the option wins', () => {
    const q = {
      options: [
        { id: 'green', label: 'Not roasted', target_codes: ['0901.11.11', '0901.12.10'] },
        { id: 'roasted', label: 'Roasted', target_codes: ['0901.21.10', '0901.22.10'] },
        { id: 'other', label: 'Other / not listed (please describe)' },
      ],
    };
    expect(deriveDivergenceAnswerId(q, '0901.22.10').derived_answer_id).toBe('roasted');
    expect(deriveDivergenceAnswerId(q, '0901.12.10').derived_answer_id).toBe('green');
  });

  it('returns the FIRST matching option when (degenerate) multiple options carry gold', () => {
    const q = {
      options: [
        { id: 'a', label: 'A', target_codes: ['0207.12.00'] },
        { id: 'b', label: 'B', target_codes: ['0207.12.00'] },
      ],
    };
    expect(deriveDivergenceAnswerId(q, '0207.12.00').derived_answer_id).toBe('a');
  });

  it('a text-match (triage/sibling/QGS) question with NO target_codes is non-derivable here', () => {
    // This is the no-op that makes the existing text-match path byte-identical: a
    // question whose options lack target_codes returns answer_found=false, so the
    // caller falls through to deriveAnswerId unchanged.
    const q = { options: [{ id: 'roasted', label: 'Roasted' }, { id: 'green', label: 'Green' }] };
    const d = deriveDivergenceAnswerId(q, '0901.21.00');
    expect(d.answer_found).toBe(false);
    expect(d.derived_answer_id).toBeNull();
  });

  it('empty target_codes array is skipped (treated like an escape)', () => {
    const q = {
      options: [
        { id: 'whole', label: 'Whole', target_codes: [] },
        { id: 'cut', label: 'Cuts', target_codes: ['0207.14.00'] },
      ],
    };
    expect(deriveDivergenceAnswerId(q, '0207.12.00').answer_found).toBe(false); // empty array skipped
    expect(deriveDivergenceAnswerId(q, '0207.14.00').derived_answer_id).toBe('cut');
  });

  it('a null/empty gold code is non-derivable', () => {
    expect(deriveDivergenceAnswerId(frozenChickenQuestion, '').answer_found).toBe(false);
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

  // -------------------------------------------------------------------------
  // DIVERGENCE-ask integration: the loop runs deriveDivergenceAnswerId FIRST. A
  // leaf-grounded option (target_codes) is selected by gold-code equality even
  // when its LLM-phrased label would NOT text-match the gold attribute value —
  // the exact false-negative this fix removes.
  // -------------------------------------------------------------------------

  /** Frozen-chicken divergence ASK as it actually reaches the simulator (toClarifyingQuestion shape). */
  const divergenceChickenQuestion = (): ClarifyingQuestion => ({
    question_id: 'div_cross_0207_presentation',
    question_text: 'Is this a whole bird (not cut in pieces), or cuts/offal?',
    discriminating_attribute: 'form',
    options: [
      { id: 'whole', label: 'Whole bird (not cut in pieces)', target_codes: ['0207.12.00'] },
      { id: 'cut', label: 'Cuts and offal', target_codes: ['0207.14.00'] },
      { id: 'other', label: 'Other / not listed (please describe)' },
    ],
    qgs_used: false,
    trigger: 'divergence',
  });

  it('divergence: derives the gold-leaf option even when the gold ATTRIBUTE value would not text-match the label', async () => {
    // The stored attribute value ("carcass, whole-bird") does NOT text-match the
    // LLM label "Whole bird (not cut in pieces)" — under the old path this was a
    // false negative. The divergence branch keys off target_codes == gold instead.
    const lookup: GoldAttributeLookup = vi.fn(async () => ['carcass, whole-bird']);
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, batch) => {
      expect(batch).toEqual({ div_cross_0207_presentation: 'whole' });
      return classifyResult('0207.12.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'frozen chicken',
      initialAsk: askResult(divergenceChickenQuestion(), ['L0', 'L1', 'L2', 'L3', 'DIVERGENCE-ASK']),
      goldCode: '0207.12.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.final_code_if_classify).toBe('0207.12.00');
    expect(out.code_correct_after_recovery).toBe(true);
    expect(out.answer_matches[0]!.answer_found).toBe(true);
    expect(out.answer_matches[0]!.derived_answer_id).toBe('whole');
    expect(cont).toHaveBeenCalledTimes(1);
  });

  it('divergence: never selects the escape; gold absent from all real options → falls through to UNANSWERABLE', async () => {
    // Gold not in any option's target_codes; the gold attribute value also matches
    // no real option label (and 'other' is an escape) → no fabrication, unanswerable.
    const lookup: GoldAttributeLookup = vi.fn(async () => ['some unlisted variety']);
    const cont: ContinueWithAnswersFn = vi.fn(async () => classifyResult('0207.12.00'));

    const out = await simulateAnswerRecovery({
      originalQuery: 'frozen chicken',
      initialAsk: askResult(divergenceChickenQuestion(), ['L0', 'L1', 'L2', 'L3', 'DIVERGENCE-ASK']),
      goldCode: '0207.99.00', // not a target of any option
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('UNANSWERABLE');
    expect(out.code_correct_after_recovery).toBe(false);
    expect(cont).not.toHaveBeenCalled();
  });

  it('divergence falls through to text-match when options carry NO target_codes (mixed safety)', async () => {
    // A divergence-flavored question that (defensively) lost its target_codes still
    // recovers via the existing gold-attribute text-match path — proving the
    // fall-through is intact and the two paths compose.
    const q: ClarifyingQuestion = {
      question_id: 'div_cross_0207_presentation',
      question_text: 'Whole or cuts?',
      discriminating_attribute: 'form',
      options: [
        { id: 'whole', label: 'Whole' },
        { id: 'cut', label: 'Cuts' },
      ],
      qgs_used: false,
      trigger: 'divergence',
    };
    const lookup: GoldAttributeLookup = vi.fn(async () => ['whole']); // text-match resolves it
    const cont: ContinueWithAnswersFn = vi.fn(async (_q, batch) => {
      expect(batch).toEqual({ div_cross_0207_presentation: 'whole' });
      return classifyResult('0207.12.00');
    });

    const out = await simulateAnswerRecovery({
      originalQuery: 'frozen chicken',
      initialAsk: askResult(q, ['L0', 'L1', 'L2', 'L3', 'DIVERGENCE-ASK']),
      goldCode: '0207.12.00',
      lookup,
      continueWithAnswers: cont,
    });

    expect(out.final_decision).toBe('CLASSIFY');
    expect(out.answer_matches[0]!.derived_answer_id).toBe('whole');
    expect(cont).toHaveBeenCalledTimes(1);
  });
});

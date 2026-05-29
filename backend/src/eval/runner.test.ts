import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClassifyResult } from '../classifier-v2/types';
import type { EvalClassifyResult } from './v2-adapter';
import type { EvalTestCase } from './types';
import type { AnswerRecoveryResult } from './answer-simulator';

// Mock the adapter so runTestCase exercises our diagnostics/error policy in
// isolation, with NO live classifier call. isSystemError is re-implemented
// faithfully (checks raw.system_error) so the runner's C1 gate is exercised.
const classifyForEval = vi.fn<[string], Promise<EvalClassifyResult>>();
vi.mock('./v2-adapter', () => ({
  classifyForEval: (q: string) => classifyForEval(q),
  isSystemError: (r: ClassifyResult) => r.system_error !== undefined,
}));

// Mock the answer-simulator so the runner's --simulate-answers branch is tested
// in isolation, with NO live DB / continueWithAnswer call.
const runAnswerSimulation = vi.fn<[string, ClassifyResult, string], Promise<AnswerRecoveryResult>>();
vi.mock('./answer-simulator', () => ({
  runAnswerSimulation: (q: string, ask: ClassifyResult, code: string) =>
    runAnswerSimulation(q, ask, code),
}));

// Imported AFTER vi.mock so the mock is wired. require.main !== module under
// vitest, so importing runner does NOT kick off a live eval.
import { runTestCase, extractDiagnostics, buildReportForTest } from './runner';

const diag = (over: Partial<ClassifyResult['diagnostics']> = {}): ClassifyResult['diagnostics'] => ({
  escalation_path: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'],
  latency_ms: 100,
  llm_calls: 2,
  ...over,
});

const classifyResult = (over: Partial<ClassifyResult>): ClassifyResult =>
  ({ decision: 'CLASSIFY', diagnostics: diag(), ...over }) as ClassifyResult;

const tc = (over: Partial<EvalTestCase> = {}): EvalTestCase => ({
  id: 'T1',
  query: 'stainless steel hex bolts M10',
  source: 'unit',
  category: 'metal',
  expected_routing: 'classify',
  expected_chapter: '73',
  expected_heading: '7318',
  expected_code: '7318.15.00',
  difficulty: 'medium',
  ...over,
});

beforeEach(() => {
  classifyForEval.mockReset();
  runAnswerSimulation.mockReset();
});

describe('extractDiagnostics (pure)', () => {
  it('maps escalation_path, llm_calls, and an APPROXIMATE est_cost_usd', () => {
    const raw = classifyResult({ diagnostics: diag({ llm_calls: 3 }) });
    const d = extractDiagnostics(raw, true);
    expect(d.escalation_path).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
    expect(d.llm_calls).toBe(3);
    // est_cost_usd = llm_calls × representative-per-call cost (>0, scales linearly).
    expect(d.est_cost_usd).toBeGreaterThan(0);
    const d1 = extractDiagnostics(classifyResult({ diagnostics: diag({ llm_calls: 1 }) }), true);
    expect(d.est_cost_usd!).toBeCloseTo(d1.est_cost_usd! * 3, 10);
  });

  it('verifier_rejected_but_correct=true when a repair appears AND code is correct', () => {
    const raw = classifyResult({ diagnostics: diag({ escalation_path: ['L4', 'L5', 'L5:repair0', 'L4', 'L5'] }) });
    expect(extractDiagnostics(raw, true).verifier_rejected_but_correct).toBe(true);
  });

  it('verifier_rejected_but_correct=false when a repair appears but code is WRONG', () => {
    const raw = classifyResult({ diagnostics: diag({ escalation_path: ['L4', 'L5', 'L5:repair0'] }) });
    expect(extractDiagnostics(raw, false).verifier_rejected_but_correct).toBe(false);
  });

  it('verifier_rejected_but_correct=false on a clean path even when correct', () => {
    const raw = classifyResult({ diagnostics: diag({ escalation_path: ['L0', 'L1', 'L4', 'L5'] }) });
    expect(extractDiagnostics(raw, true).verifier_rejected_but_correct).toBe(false);
  });

  it('treats L6:would_escalate as a verifier rejection signal', () => {
    const raw = classifyResult({ diagnostics: diag({ escalation_path: ['L4', 'L5', 'L6:would_escalate'] }) });
    expect(extractDiagnostics(raw, true).verifier_rejected_but_correct).toBe(true);
  });
});

describe('runTestCase — happy path captures diagnostics', () => {
  it('scores a correct classification and attaches diagnostics', async () => {
    const raw = classifyResult({
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00', is_six_digit: false, export_policy: 'Free', policy_condition: null,
        india_specific: false,
        citation: { primary: { type: 'leaf_description', source_ref: 'x', verbatim_text: 'bolts', note_or_exclusion_id: null }, gir_applied: 'GIR-1' },
        reasoning_chain: ['r'], self_confidence: 'HIGH', alternatives_considered: [],
        components: null, escalated_to_deep_think: false,
      },
      diagnostics: diag({ llm_calls: 2 }),
    });
    classifyForEval.mockResolvedValue({ legacy: { responseType: 'classification', hsCode: '7318.15.00' } as any, raw });

    const d = await runTestCase(tc());
    expect(d.is_error).toBeUndefined();
    expect(d.actual_routing).toBe('classify');
    expect(d.code_correct).toBe(true);
    expect(d.chapter_correct).toBe(true);
    expect(d.escalation_path).toEqual(raw.diagnostics.escalation_path);
    expect(d.llm_calls).toBe(2);
    expect(d.est_cost_usd).toBeGreaterThan(0);
  });
});

describe('runTestCase — C1: system_error → per-case ERROR (NOT a reject)', () => {
  it('records a system_error result as an error, never scored as reject', async () => {
    const raw = classifyResult({
      decision: 'REFUSE',
      refusal: { reason: 'System error', out_of_scope_class: null, verifier_failures: [] },
      system_error: { stage: 'L1', message: '[vertex-client] After 3 retry attempts: 503', retryable: true },
    });
    // mapV2ToLegacy would produce null here; runner must gate on system_error first.
    classifyForEval.mockResolvedValue({ legacy: null, raw });

    const d = await runTestCase(tc({ expected_routing: 'reject' })); // even if gold expects reject…
    expect(d.is_error).toBe(true);                 // …it's an ERROR, not a scored reject
    expect(d.actual_routing).toBe('error');
    expect(d.routing_correct).toBe(false);
    expect(d.error).toContain('system_error[L1]');
    // diagnostics still attached from the raw result
    expect(d.llm_calls).toBe(raw.diagnostics.llm_calls);
  });
});

describe('runTestCase — I1: thrown error → per-case ERROR (NOT a reject, no abort)', () => {
  it('records a thrown transport error as an error', async () => {
    classifyForEval.mockRejectedValue(new Error('Cohere rerank failed: ECONNRESET'));
    const d = await runTestCase(tc({ expected_routing: 'reject' }));
    expect(d.is_error).toBe(true);
    expect(d.actual_routing).toBe('error');
    expect(d.routing_correct).toBe(false);
    expect(d.error).toContain('ECONNRESET');
    // no diagnostics — a thrown error carries no raw result
    expect(d.llm_calls).toBeUndefined();
  });
});

describe('runTestCase — genuine model REFUSE is a scored reject (not an error)', () => {
  it('a model REFUSE (no system_error) maps to routing reject and is scored', async () => {
    const raw = classifyResult({
      decision: 'REFUSE',
      refusal: { reason: 'out of scope', out_of_scope_class: 'services_not_goods', verifier_failures: [] },
    });
    classifyForEval.mockResolvedValue({ legacy: null, raw });

    const d = await runTestCase(tc({ expected_routing: 'reject' }));
    expect(d.is_error).toBeUndefined();      // scored, NOT an error
    expect(d.actual_routing).toBe('reject');
    expect(d.routing_correct).toBe(true);    // gold expected reject → correct
  });
});

// ---------------------------------------------------------------------------
// --simulate-answers: OFF = byte-for-byte unchanged; ON = ASK recovery attached
// ---------------------------------------------------------------------------

const askRaw = (): ClassifyResult =>
  classifyResult({
    decision: 'ASK',
    question: {
      question_id: 'ask_form',
      question_text: 'What form is the steel in?',
      discriminating_attribute: 'form',
      options: [{ id: 'bolt', label: 'Bolt' }, { id: 'sheet', label: 'Sheet' }],
    },
  });

describe('runTestCase — simulateAnswers OFF (default): existing behavior preserved', () => {
  it('an ASK on a gold-classify case stays a routing miss with NO recovery field', async () => {
    classifyForEval.mockResolvedValue({
      legacy: { responseType: 'question', question: 'What form is the steel in?', options: [{ id: 'bolt', label: 'Bolt' }, { id: 'sheet', label: 'Sheet' }] } as any,
      raw: askRaw(),
    });

    const d = await runTestCase(tc()); // expected_routing 'classify'
    expect(d.actual_routing).toBe('ask');
    expect(d.routing_correct).toBe(false);    // GT classify, system asked → miss
    expect(d.score).toBe(0);                   // wrong routing → 0
    expect(d.ask_recovery_attempt).toBeUndefined();
    expect(runAnswerSimulation).not.toHaveBeenCalled();
    // The ASK detail now carries the gold labels (frozen-population requirement)
    // so a gold case the system ASKed becomes a miss in primary_accuracy.
    expect(d.expected_code).toBe('7318.15.00');
    expect(d.expected_chapter).toBe('73');
    expect(d.code_correct).toBeUndefined(); // no code delivered → frozen-denom miss
  });
});

describe('runTestCase — simulateAnswers ON: gold-answer recovery on ASK', () => {
  it('attaches ask_recovery_attempt and recovers to the correct code', async () => {
    const raw = askRaw();
    classifyForEval.mockResolvedValue({
      legacy: { responseType: 'question', question: 'q', options: [{ id: 'bolt', label: 'Bolt' }] } as any,
      raw,
    });
    runAnswerSimulation.mockResolvedValue({
      initial_question_id: 'ask_form',
      rounds_attempted: 1,
      final_decision: 'CLASSIFY',
      final_code_if_classify: '7318.15.00',
      code_correct_after_recovery: true,
      answer_matches: [{
        round: 1, question_id: 'ask_form', discriminating_attribute: 'form',
        gold_attribute_value: 'bolt', derived_answer_id: 'bolt', answer_found: true,
        system_decision_after: 'CLASSIFY',
      }],
    });

    const d = await runTestCase(tc(), true);
    // Routing/score base metrics are UNCHANGED — the ASK is still a routing miss.
    expect(d.actual_routing).toBe('ask');
    expect(d.routing_correct).toBe(false);
    expect(d.score).toBe(0);
    // …but the recovery attempt is now recorded for end-to-end measurement.
    expect(runAnswerSimulation).toHaveBeenCalledWith('stainless steel hex bolts M10', raw, '7318.15.00');
    expect(d.ask_recovery_attempt).toBeDefined();
    expect(d.ask_recovery_attempt!.code_correct_after_recovery).toBe(true);
    expect(d.ask_recovery_attempt!.chapter_correct_after_recovery).toBe(true);
    expect(d.ask_recovery_attempt!.heading_correct_after_recovery).toBe(true);
  });

  it('does NOT run recovery when the case has no gold code', async () => {
    classifyForEval.mockResolvedValue({
      legacy: { responseType: 'question', question: 'q', options: [] } as any,
      raw: askRaw(),
    });
    const d = await runTestCase(tc({ expected_code: undefined, expected_routing: 'ask' }), true);
    expect(runAnswerSimulation).not.toHaveBeenCalled();
    expect(d.ask_recovery_attempt).toBeUndefined();
  });

  it('records a wrong-code recovery (chapter/heading derived from final code)', async () => {
    classifyForEval.mockResolvedValue({
      legacy: { responseType: 'question', question: 'q', options: [] } as any,
      raw: askRaw(),
    });
    runAnswerSimulation.mockResolvedValue({
      initial_question_id: 'ask_form',
      rounds_attempted: 1,
      final_decision: 'CLASSIFY',
      final_code_if_classify: '7326.90.99', // ch 73 ok, heading 7326 wrong, code wrong
      code_correct_after_recovery: false,
      answer_matches: [],
    });
    const d = await runTestCase(tc(), true); // gold 7318.15.00
    expect(d.ask_recovery_attempt!.code_correct_after_recovery).toBe(false);
    expect(d.ask_recovery_attempt!.chapter_correct_after_recovery).toBe(true);  // 73 == 73
    expect(d.ask_recovery_attempt!.heading_correct_after_recovery).toBe(false); // 7326 != 7318
  });
});

// ---------------------------------------------------------------------------
// P0-A frozen metric contract: primary (frozen-denom) accuracy, precision_when_
// classifying, confident-wrong, calibration, latency, cost, population closure.
// ---------------------------------------------------------------------------

describe('buildReportForTest — frozen scoring population (primary_accuracy)', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('counts a gold case routed to ASK as a MISS (frozen denominator, not dropped)', () => {
    const details: import('./types').EvalDetail[] = [
      // direct classify, code correct
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', expected_chapter: '73', expected_heading: '7318',
        actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
      // gold case the system ASKed — NOT correctly routed; primary counts it a miss.
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '0901.21.00', expected_chapter: '09', expected_heading: '0901' }),
    ];
    const r = buildReportForTest(details);
    // Frozen denom = 2 gold cases. Only C1 correct → 1/2.
    expect(r.primary_accuracy.gold_code_cases).toBe(2);
    expect(r.primary_accuracy.code.k).toBe(1);
    expect(r.primary_accuracy.code.n).toBe(2);
    expect(r.primary_accuracy.code.rate).toBeCloseTo(0.5, 10);
    expect(r.primary_accuracy.chapter.k).toBe(1);
    expect(r.primary_accuracy.chapter.n).toBe(2);
    // CI present and bounded.
    expect(r.primary_accuracy.code.lower).toBeGreaterThanOrEqual(0);
    expect(r.primary_accuracy.code.upper).toBeLessThanOrEqual(1);
  });

  it('precision_when_classifying uses the SHRINKING conditional denominator', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', expected_chapter: '73', expected_heading: '7318',
        actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '0901.21.00', expected_chapter: '09', expected_heading: '0901' }),
    ];
    const r = buildReportForTest(details);
    // Conditional denom = only correctly-routed classify cases = 1 (C1).
    expect(r.precision_when_classifying.n).toBe(1);
    expect(r.precision_when_classifying.code.rate).toBeCloseTo(1, 10);
    // …and it differs from the (lower) frozen primary number — the dilution gap.
    expect(r.primary_accuracy.code.rate).toBeLessThan(r.precision_when_classifying.code.rate);
  });

  it('excludes error cases from the frozen population', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', expected_chapter: '73', expected_heading: '7318',
        actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
      detail({ test_case_id: 'E1', is_error: true, actual_routing: 'error', routing_correct: false, score: 0,
        expected_code: '8501.10.00', error: 'timeout' }),
    ];
    const r = buildReportForTest(details);
    expect(r.primary_accuracy.gold_code_cases).toBe(1); // E1 excluded
  });
});

describe('buildReportForTest — confident-wrong', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('counts a delivered-classification-with-wrong-code and lists the caseId', () => {
    const details: import('./types').EvalDetail[] = [
      // classified, correct → not confident-wrong
      detail({ test_case_id: 'OK1', expected_code: '7318.15.00', actual_code: '7318.15.00', code_correct: true, confidence: 0.9 }),
      // classified, WRONG → confident-wrong
      detail({ test_case_id: 'CW1', expected_code: '0901.21.00', actual_code: '7326.90.99', code_correct: false, confidence: 0.9 }),
      // ASKed (not a classification delivery) → NOT in answered set
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, expected_code: '5208.11.00' }),
    ];
    const r = buildReportForTest(details);
    expect(r.confident_wrong.answered_count).toBe(2); // OK1 + CW1 (delivered classifications)
    expect(r.confident_wrong.count).toBe(1);
    expect(r.confident_wrong.case_ids).toEqual(['CW1']);
    expect(r.confident_wrong.rate.rate).toBeCloseTo(0.5, 10);
  });

  it('graded τ=0.7 variant filters by confidence ≥ 0.7', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'CW_hi', actual_code: '7326.90.99', expected_code: '0901.21.00', code_correct: false, confidence: 0.9 }),
      detail({ test_case_id: 'CW_lo', actual_code: '7326.90.99', expected_code: '0901.21.00', code_correct: false, confidence: 0.3 }),
    ];
    const r = buildReportForTest(details);
    expect(r.confident_wrong.count).toBe(2); // both are confident-wrong (ungraded)
    expect(r.confident_wrong.graded_tau_0_7).toBeDefined();
    expect(r.confident_wrong.graded_tau_0_7!.threshold).toBe(0.7);
    expect(r.confident_wrong.graded_tau_0_7!.count).toBe(1); // only the conf=0.9 one
    expect(r.confident_wrong.graded_tau_0_7!.case_ids).toEqual(['CW_hi']);
  });
});

describe('buildReportForTest — calibration, latency, cost', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('computes Brier + ECE over classify cases carrying a confidence', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'A', actual_code: '7318.15.00', code_correct: true, confidence: 1 }),
      detail({ test_case_id: 'B', actual_code: '7318.15.00', code_correct: true, confidence: 1 }),
    ];
    const r = buildReportForTest(details);
    expect(r.calibration).toBeDefined();
    expect(r.calibration!.sample_count).toBe(2);
    expect(r.calibration!.brier_score).toBe(0); // perfect confident-correct
  });

  it('omits calibration when no classify case carries a confidence', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'A', actual_code: '7318.15.00', code_correct: true }), // no confidence
    ];
    const r = buildReportForTest(details);
    expect(r.calibration).toBeUndefined();
  });

  it('computes p95/median latency and an order-of-magnitude cost roll-up', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'A', response_time_ms: 100, est_cost_usd: 0.001 }),
      detail({ test_case_id: 'B', response_time_ms: 200, est_cost_usd: 0.002 }),
      detail({ test_case_id: 'C', response_time_ms: 300, est_cost_usd: 0.003 }),
    ];
    const r = buildReportForTest(details);
    expect(r.latency.sample_count).toBe(3);
    expect(r.latency.p95_ms).toBe(300); // nearest-rank p95 over [100,200,300]
    expect(r.latency.median_ms).toBe(200);
    expect(r.cost.est_total_usd).toBeCloseTo(0.006, 10);
    expect(r.cost.is_order_of_magnitude).toBe(true);
  });
});

describe('buildReportForTest — population closure assertion', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('partitions gold cases by routing and reports closed=true', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00', code_correct: true }),
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, expected_code: '0901.21.00',
        ask_recovery_attempt: { initial_question_id: 'q', rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '0901.21.00', code_correct_after_recovery: true,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [] } }),
      detail({ test_case_id: 'R1', actual_routing: 'reject', routing_correct: false, expected_code: '5208.11.00' }),
    ];
    const r = buildReportForTest(details);
    expect(r.population_closure.scored_with_gold).toBe(3);
    expect(r.population_closure.direct_classify).toBe(1);
    expect(r.population_closure.ask_cases).toBe(1);
    expect(r.population_closure.refused_with_gold).toBe(1);
    expect(r.population_closure.asked_not_simulated).toBe(0);
    expect(r.population_closure.closed).toBe(true);
  });

  it('counts a gold ASK case with NO simulation attempt as asked_not_simulated (still closed)', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, expected_code: '0901.21.00' }),
    ];
    const r = buildReportForTest(details);
    expect(r.population_closure.scored_with_gold).toBe(1);
    expect(r.population_closure.asked_not_simulated).toBe(1);
    expect(r.population_closure.closed).toBe(true);
  });

  it('FIX-2: a gold case matching NONE of the four positive predicates → closure THROWS', () => {
    // A non-error gold case with an actual_routing value outside {classify, ask,
    // reject}. With the OLD complement-remainder it would be silently absorbed
    // into asked_not_simulated; with the positive-predicate counts it matches no
    // bucket → sum < goldN → the closure assertion must fire.
    const details: import('./types').EvalDetail[] = [
      detail({
        test_case_id: 'BAD',
        actual_routing: 'somethingelse', // not classify/ask/reject; is_error stays false
        routing_correct: false,
        expected_code: '7318.15.00',
      }),
    ];
    expect(() => buildReportForTest(details)).toThrow(/population closure FAILED/);
  });
});

describe('buildReportForTest — effective accuracy (constant denominator, REFUSE leak closed)', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('effective denominator = ALL gold cases (a REFUSE gold case stays a miss)', () => {
    const details: import('./types').EvalDetail[] = [
      // direct classify correct
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', expected_chapter: '73', expected_heading: '7318',
        actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
      // ASK recovered correct
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, expected_code: '0901.21.00',
        expected_chapter: '09', expected_heading: '0901',
        ask_recovery_attempt: { initial_question_id: 'q', rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '0901.21.00', code_correct_after_recovery: true,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [] } }),
      // REFUSE gold case — must remain in the EFFECTIVE denominator as a miss.
      detail({ test_case_id: 'R1', actual_routing: 'reject', routing_correct: false, expected_code: '5208.11.00',
        expected_chapter: '52', expected_heading: '5208' }),
    ];
    const r = buildReportForTest(details);
    const e = r.end_to_end_metrics!;
    // EFFECTIVE 8-digit: (C1 + A1) correct over ALL 3 gold cases = 2/3.
    expect(e.effective_code.n).toBe(3);
    expect(e.effective_code.k).toBe(2);
    expect(e.effective_code.rate).toBeCloseTo(2 / 3, 10);
    expect(e.refused_after_ask).toBe(0); // R1 was a direct REFUSE, not post-ASK
  });
});

describe('buildReportForTest — end_to_end_metrics', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('is OMITTED entirely when no detail carries a recovery attempt (baseline unchanged)', () => {
    const r = buildReportForTest([
      detail({ expected_code: '7318.15.00', actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
    ]);
    expect(r.end_to_end_metrics).toBeUndefined();
  });

  it('combines classify-direct-correct + ask-recovered-correct over gold cases', () => {
    const details: import('./types').EvalDetail[] = [
      // direct classify, fully correct
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', expected_chapter: '73', expected_heading: '7318', actual_code: '7318.15.00', chapter_correct: true, heading_correct: true, code_correct: true }),
      // ASK on a gold case, recovered correct
      detail({
        test_case_id: 'A1', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '0901.21.00', expected_chapter: '09', expected_heading: '0901',
        ask_recovery_attempt: {
          initial_question_id: 'ask_processing_state', rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '0901.21.00', code_correct_after_recovery: true,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
      // ASK on a gold case, unanswerable (not recovered)
      detail({
        test_case_id: 'A2', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '7318.16.00', expected_chapter: '73', expected_heading: '7318',
        ask_recovery_attempt: {
          initial_question_id: 'ask_form', rounds_attempted: 0, final_decision: 'UNANSWERABLE',
          code_correct_after_recovery: false, chapter_correct_after_recovery: false,
          heading_correct_after_recovery: false, answer_matches: [],
        },
      }),
    ];
    const r = buildReportForTest(details);
    const e = r.end_to_end_metrics!;
    expect(e.ask_case_count).toBe(2);
    expect(e.ask_recovered_correct).toBe(1);
    expect(e.ask_recoverability_rate).toBeCloseTo(50, 5);
    expect(e.ask_unanswerable).toBe(1);
    expect(e.classify_direct_correct).toBe(1);
    expect(e.scored_with_gold).toBe(3); // C1 + A1 + A2 all carry a gold code
    // 8-digit: direct C1 + recovered A1 = 2 of 3
    expect(e.end_to_end_code_accuracy).toBeCloseTo((2 / 3) * 100, 5);
    // chapter: C1 + A1 = 2 of 3 (A2 chapter not recovered)
    expect(e.end_to_end_chapter_accuracy).toBeCloseTo((2 / 3) * 100, 5);
  });
});

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

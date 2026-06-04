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
import { runTestCase, extractDiagnostics, buildReportForTest, filterByIds, buildCandidateCodes } from './runner';

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

describe('filterByIds (--ids targeted subset)', () => {
  const cases: EvalTestCase[] = [
    tc({ id: 'TC001' }),
    tc({ id: 'TC009' }),
    tc({ id: 'TC306' }),
  ];

  it('keeps only the requested ids, in SUITE order (not requested order)', () => {
    const { filtered } = filterByIds(cases, ['TC306', 'TC001']);
    expect(filtered.map((c) => c.id)).toEqual(['TC001', 'TC306']); // suite order
  });

  it('reports requested ids that are absent from the input as unknownIds', () => {
    const { filtered, unknownIds } = filterByIds(cases, ['TC009', 'NOPE']);
    expect(filtered.map((c) => c.id)).toEqual(['TC009']);
    expect(unknownIds).toEqual(['NOPE']);
  });

  it('returns an empty filtered set + all ids unknown when none match', () => {
    const { filtered, unknownIds } = filterByIds(cases, ['X', 'Y']);
    expect(filtered).toEqual([]);
    expect(unknownIds).toEqual(['X', 'Y']);
  });
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

  it('A3: token_usage present → REAL per-token cost (cost_is_real=true) summed over byModel', () => {
    const tokenUsage = {
      promptTokens: 3000,
      outputTokens: 600,
      thoughtsTokens: 150,
      totalTokens: 3750,
      cachedTokens: 0,
      llmCalls: 2,
      byModel: {
        'gemini-3.5-flash': {
          calls: 2,
          promptTokens: 3000,
          outputTokens: 600,
          thoughtsTokens: 150,
          totalTokens: 3750,
          cachedTokens: 0,
        },
      },
    };
    const raw = classifyResult({ diagnostics: diag({ llm_calls: 2, token_usage: tokenUsage }) });
    const d = extractDiagnostics(raw, true);
    expect(d.cost_is_real).toBe(true);
    expect(d.token_usage).toEqual(tokenUsage);
    // gemini-3.5-flash: in $1.50/1M, out $9.00/1M (thoughts billed as output).
    // 3000/1e6*1.5 + (600+150)/1e6*9 = 0.0045 + 0.00675 = 0.01125
    expect(d.est_cost_usd).toBeCloseTo(0.01125, 10);
  });

  it('A3: embedding model in byModel is priced at 0 (not thrown)', () => {
    const tokenUsage = {
      promptTokens: 1000,
      outputTokens: 200,
      thoughtsTokens: 0,
      totalTokens: 1200,
      cachedTokens: 0,
      llmCalls: 2,
      byModel: {
        'gemini-3.5-flash': {
          calls: 1, promptTokens: 1000, outputTokens: 200, thoughtsTokens: 0, totalTokens: 1200, cachedTokens: 0,
        },
        // Unknown-to-PRICE model: must contribute 0, never throw.
        'gemini-embedding-001': {
          calls: 1, promptTokens: 999, outputTokens: 0, thoughtsTokens: 0, totalTokens: 999, cachedTokens: 0,
        },
      },
    };
    const raw = classifyResult({ diagnostics: diag({ llm_calls: 2, token_usage: tokenUsage }) });
    const d = extractDiagnostics(raw, true);
    // 1000/1e6*1.5 + 200/1e6*9 = 0.0015 + 0.0018 = 0.0033 ; embedding adds 0.
    expect(d.est_cost_usd).toBeCloseTo(0.0033, 10);
  });

  it('A3: token_usage ABSENT → flat fallback (cost_is_real=false, no token_usage)', () => {
    const raw = classifyResult({ diagnostics: diag({ llm_calls: 3 }) }); // no token_usage
    const d = extractDiagnostics(raw, true);
    expect(d.cost_is_real).toBe(false);
    expect(d.token_usage).toBeUndefined();
    // Flat fallback = llm_calls × representative-per-call (>0, linear).
    expect(d.est_cost_usd).toBeGreaterThan(0);
    const d1 = extractDiagnostics(classifyResult({ diagnostics: diag({ llm_calls: 1 }) }), true);
    expect(d.est_cost_usd!).toBeCloseTo(d1.est_cost_usd! * 3, 10);
  });
});

describe('buildCandidateCodes (pure, EVAL-ONLY proxy)', () => {
  const classifying = (over: Partial<NonNullable<ClassifyResult['classification']>>): ClassifyResult =>
    classifyResult({
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00', is_six_digit: false, export_policy: null, policy_condition: null,
        india_specific: false,
        citation: { primary: { type: 'leaf_description', source_ref: 'x', verbatim_text: 't', note_or_exclusion_id: null }, gir_applied: 'GIR-1' },
        reasoning_chain: ['r'], self_confidence: 'HIGH', alternatives_considered: [],
        components: null, escalated_to_deep_think: false,
        ...over,
      },
    });

  it('puts the selected code FIRST, then alternatives in model order', () => {
    const raw = classifying({ code: '7318.15.00', alternatives_considered: ['7318.16.00', '7318.19.00'] });
    expect(buildCandidateCodes(raw)).toEqual(['7318.15.00', '7318.16.00', '7318.19.00']);
  });

  it('de-dups the selected code if the model also echoed it in alternatives (rank preserved)', () => {
    const raw = classifying({ code: '7318.15.00', alternatives_considered: ['7318.15.00', '7318.16.00'] });
    expect(buildCandidateCodes(raw)).toEqual(['7318.15.00', '7318.16.00']);
  });

  it('returns just the selected code when there are no alternatives', () => {
    const raw = classifying({ code: '2709.00.10', alternatives_considered: [] });
    expect(buildCandidateCodes(raw)).toEqual(['2709.00.10']);
  });

  it('returns undefined for a non-classification (ASK / REFUSE) result', () => {
    expect(buildCandidateCodes(classifyResult({ decision: 'ASK', classification: undefined }))).toBeUndefined();
    expect(buildCandidateCodes(classifyResult({ decision: 'REFUSE', classification: undefined }))).toBeUndefined();
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
        reasoning_chain: ['r'], self_confidence: 'HIGH', alternatives_considered: ['7318.16.00'],
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
    // EVAL-ONLY: candidate_codes = selected first, then alternatives_considered.
    expect(d.candidate_codes).toEqual(['7318.15.00', '7318.16.00']);
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
    expect(d.candidate_codes).toBeUndefined(); // EVAL-ONLY: no classification → no candidates
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

describe('buildReportForTest — top_k_code_accuracy (EVAL-ONLY, frozen denom)', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('top-1 equals primary code accuracy; top-3 catches a gold ranked #2', () => {
    const details: import('./types').EvalDetail[] = [
      // selected = gold → top-1 hit.
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00',
        chapter_correct: true, heading_correct: true, code_correct: true,
        candidate_codes: ['7318.15.00', '7318.16.00'] }),
      // selected WRONG but gold is candidate #2 → top-1 miss, top-3 hit.
      detail({ test_case_id: 'C2', expected_code: '0901.21.00', actual_code: '0901.22.00',
        chapter_correct: true, heading_correct: true, code_correct: false,
        candidate_codes: ['0901.22.00', '0901.21.00'] }),
    ];
    const r = buildReportForTest(details);
    expect(r.top_k_code_accuracy).toBeDefined();
    expect(r.top_k_code_accuracy!.gold_code_cases).toBe(2);
    // top-1 mirrors primary_accuracy.code (1/2).
    expect(r.top_k_code_accuracy!.top_1.k).toBe(1);
    expect(r.top_k_code_accuracy!.top_1.rate).toBeCloseTo(r.primary_accuracy.code.rate, 10);
    // top-3 recovers C2 → 2/2.
    expect(r.top_k_code_accuracy!.top_3.k).toBe(2);
    expect(r.top_k_code_accuracy!.top_3.n).toBe(2);
    expect(r.top_k_code_accuracy!.top_3.rate).toBeCloseTo(1, 10);
  });

  it('a gold case routed to ASK (no candidate_codes) stays a top-k miss in the denom', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00',
        code_correct: true, candidate_codes: ['7318.15.00'] }),
      detail({ test_case_id: 'A1', actual_routing: 'ask', routing_correct: false,
        expected_code: '0901.21.00' }), // no candidate_codes → miss
    ];
    const r = buildReportForTest(details);
    expect(r.top_k_code_accuracy!.top_3.k).toBe(1);
    expect(r.top_k_code_accuracy!.top_3.n).toBe(2); // denominator kept
  });

  it('is OMITTED when there are no gold-code cases (report shape unchanged)', () => {
    const details: import('./types').EvalDetail[] = [
      detail({ test_case_id: 'NG', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true,
        question_asked: 'q', question_score: 2 }), // no expected_code
    ];
    const r = buildReportForTest(details);
    expect(r.top_k_code_accuracy).toBeUndefined();
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

  it('A3: all cases carry real token_usage → REAL cost roll-up + token_totals, is_order_of_magnitude=false', () => {
    const tu = (calls: number, prompt: number, output: number, cached: number) => ({
      promptTokens: prompt,
      outputTokens: output,
      thoughtsTokens: 0,
      totalTokens: prompt + output,
      cachedTokens: cached,
      llmCalls: calls,
      byModel: {
        'gemini-3.5-flash': {
          calls, promptTokens: prompt, outputTokens: output, thoughtsTokens: 0, totalTokens: prompt + output, cachedTokens: cached,
        },
      },
    });
    const details: import('./types').EvalDetail[] = [
      detail({
        test_case_id: 'A', response_time_ms: 100,
        est_cost_usd: 0.003, cost_is_real: true, token_usage: tu(2, 1000, 200, 50),
      }),
      detail({
        test_case_id: 'B', response_time_ms: 200,
        est_cost_usd: 0.006, cost_is_real: true, token_usage: tu(3, 2000, 400, 100),
      }),
    ];
    const r = buildReportForTest(details);
    expect(r.cost.est_total_usd).toBeCloseTo(0.009, 10);
    expect(r.cost.is_order_of_magnitude).toBe(false); // every case real → not order-of-magnitude
    expect(r.cost.token_totals).toBeDefined();
    expect(r.cost.token_totals!.prompt_tokens).toBe(3000);
    expect(r.cost.token_totals!.output_tokens).toBe(600);
    expect(r.cost.token_totals!.cached_tokens).toBe(150);
    expect(r.cost.token_totals!.total_tokens).toBe(3600);
    expect(r.cost.token_totals!.llm_calls).toBe(5);
    expect(r.cost.token_totals!.cases_with_token_usage).toBe(2);
  });

  it('A3: a mix of real + fallback cases → is_order_of_magnitude=true, token_totals only over real cases', () => {
    const details: import('./types').EvalDetail[] = [
      detail({
        test_case_id: 'real', response_time_ms: 100, est_cost_usd: 0.003, cost_is_real: true,
        token_usage: {
          promptTokens: 1000, outputTokens: 200, thoughtsTokens: 0, totalTokens: 1200, cachedTokens: 0, llmCalls: 2,
          byModel: { 'gemini-3.5-flash': { calls: 2, promptTokens: 1000, outputTokens: 200, thoughtsTokens: 0, totalTokens: 1200, cachedTokens: 0 } },
        },
      }),
      // Legacy/fallback case: no token_usage, no cost_is_real.
      detail({ test_case_id: 'flat', response_time_ms: 200, est_cost_usd: 0.002 }),
    ];
    const r = buildReportForTest(details);
    expect(r.cost.is_order_of_magnitude).toBe(true); // a flat case is mixed in
    expect(r.cost.est_total_usd).toBeCloseTo(0.005, 10);
    expect(r.cost.token_totals).toBeDefined();
    expect(r.cost.token_totals!.cases_with_token_usage).toBe(1); // only the real case
    expect(r.cost.token_totals!.prompt_tokens).toBe(1000);
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
    // No case carries ask_trigger='sibling' → sibling sub-metrics inert (0).
    expect(e.sibling_ask_count).toBe(0);
    expect(e.sibling_ask_recovered_correct).toBe(0);
    expect(e.sibling_ask_recoverability_rate).toBe(0);
  });

  it('splits sibling-ASK sub-metrics from triage-ASK by ask_trigger', () => {
    const details: import('./types').EvalDetail[] = [
      // triage-ASK, recovered correct — must NOT count toward sibling metrics.
      detail({
        test_case_id: 'T1', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '0901.21.00', expected_chapter: '09', expected_heading: '0901',
        ask_recovery_attempt: {
          initial_question_id: 'ask_processing_state', ask_trigger: 'triage',
          rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '0901.21.00', code_correct_after_recovery: true,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
      // sibling-ASK, recovered correct.
      detail({
        test_case_id: 'S1', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '4011.10.10', expected_chapter: '40', expected_heading: '4011',
        ask_recovery_attempt: {
          initial_question_id: 'ask_intended_use', ask_trigger: 'sibling',
          rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '4011.10.10', code_correct_after_recovery: true,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
      // sibling-ASK, NOT recovered (wrong code after answer).
      detail({
        test_case_id: 'S2', actual_routing: 'ask', routing_correct: false, score: 0,
        expected_code: '4011.20.10', expected_chapter: '40', expected_heading: '4011',
        ask_recovery_attempt: {
          initial_question_id: 'ask_intended_use', ask_trigger: 'sibling',
          rounds_attempted: 1, final_decision: 'CLASSIFY',
          final_code_if_classify: '4011.10.10', code_correct_after_recovery: false,
          chapter_correct_after_recovery: true, heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
    ];
    const r = buildReportForTest(details);
    const e = r.end_to_end_metrics!;
    expect(e.ask_case_count).toBe(3);            // all three are recovery cases
    expect(e.sibling_ask_count).toBe(2);          // S1 + S2 only
    expect(e.sibling_ask_recovered_correct).toBe(1); // S1
    expect(e.sibling_ask_recoverability_rate).toBeCloseTo(50, 5); // 1/2
  });
});

// ---------------------------------------------------------------------------
// routing_split_metrics (over-ask / under-ask) folded through buildReport.
// Proves the runner wiring (EvalDetail → RoutingSplitCase) + the option_-
// answerability counting. The pure metric is unit-tested in metrics.test.ts.
// ---------------------------------------------------------------------------

describe('buildReportForTest — routing_split_metrics (over-ask / under-ask)', () => {
  const detail = (over: Partial<import('./types').EvalDetail>): import('./types').EvalDetail => ({
    test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
    routing_correct: true, response_time_ms: 1, score: 100, ...over,
  });

  it('always present and no-op-safe on a GT-classify-only frozen-style run', () => {
    const r = buildReportForTest([
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00', code_correct: true }),
      detail({ test_case_id: 'C2', expected_code: '0901.21.90', actual_code: '0901.21.90', code_correct: true }),
    ]);
    const rs = r.routing_split_metrics;
    expect(rs).toBeDefined();
    // No false asks → over-ask 0/2; no GT-ask cases → under-ask 0/0; no sims.
    expect(rs.over_ask_rate.k).toBe(0);
    expect(rs.over_ask_rate.n).toBe(2);
    expect(rs.under_ask_rate.n).toBe(0);
    expect(rs.ask_recoverability.n).toBe(0);
    expect(rs.by_trigger).toEqual([]);
    // No human-judged answerability label → all unjudged.
    expect(rs.option_answerability_counts).toEqual({ answerable: 0, hard: 0, unanswerable: 0, unjudged: 2 });
  });

  it('counts an over-ask (GT classify, system ASKed) and slices by the fired trigger', () => {
    const details: import('./types').EvalDetail[] = [
      // GT classify, system classified — fine.
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00', code_correct: true,
        option_answerability: 'answerable' }),
      // GT classify, system ASKed via cross_subheading → OVER-ASK.
      detail({ test_case_id: 'O1', expected_routing: 'classify', actual_routing: 'ask', routing_correct: false,
        expected_code: '0207.12.00', ask_trigger: 'cross_subheading', option_answerability: 'answerable' }),
    ];
    const r = buildReportForTest(details);
    const rs = r.routing_split_metrics;
    expect(rs.over_ask_rate.k).toBe(1);
    expect(rs.over_ask_rate.n).toBe(2);
    expect(rs.over_ask_rate.rate).toBeCloseTo(0.5, 10);
    const xsub = rs.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    expect(xsub).toBeDefined();
    expect(xsub.over_ask.k).toBe(1);
    expect(xsub.over_ask.n).toBe(2);
    // both cases carry the human-judged label.
    expect(rs.option_answerability_counts.answerable).toBe(2);
    expect(rs.option_answerability_counts.unjudged).toBe(0);
  });

  it('counts an under-ask (GT ask, system CLASSIFIED) over the GT-ask denominator', () => {
    const details: import('./types').EvalDetail[] = [
      // GT ask, system asked correctly.
      detail({ test_case_id: 'A1', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true,
        expected_code: '0207.12.00', ask_trigger: 'triage' }),
      // GT ask, system CLASSIFIED instead → UNDER-ASK (missed ask).
      detail({ test_case_id: 'U1', expected_routing: 'ask', actual_routing: 'classify', routing_correct: false,
        expected_code: '0207.14.00', actual_code: '0207.12.00', code_correct: false }),
    ];
    const r = buildReportForTest(details);
    const rs = r.routing_split_metrics;
    expect(rs.expected_ask_count).toBe(2);
    expect(rs.under_ask_rate.k).toBe(1);
    expect(rs.under_ask_rate.n).toBe(2);
    expect(rs.under_ask_rate.rate).toBeCloseTo(0.5, 10);
    // over-ask population is empty here.
    expect(rs.over_ask_rate.n).toBe(0);
  });

  it('ask_recoverability folds from ask_recovery_attempt.code_correct_after_recovery', () => {
    const details: import('./types').EvalDetail[] = [
      detail({
        test_case_id: 'A1', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true,
        expected_code: '0207.12.00', ask_trigger: 'cross_subheading',
        ask_recovery_attempt: {
          initial_question_id: 'q', ask_trigger: 'cross_subheading', rounds_attempted: 1,
          final_decision: 'CLASSIFY', final_code_if_classify: '0207.12.00',
          code_correct_after_recovery: true, chapter_correct_after_recovery: true,
          heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
      detail({
        test_case_id: 'A2', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true,
        expected_code: '0207.14.00', ask_trigger: 'cross_subheading',
        ask_recovery_attempt: {
          initial_question_id: 'q', ask_trigger: 'cross_subheading', rounds_attempted: 1,
          final_decision: 'CLASSIFY', final_code_if_classify: '0207.12.00',
          code_correct_after_recovery: false, chapter_correct_after_recovery: true,
          heading_correct_after_recovery: true, answer_matches: [],
        },
      }),
    ];
    const r = buildReportForTest(details);
    const rs = r.routing_split_metrics;
    expect(rs.ask_recoverability.k).toBe(1);
    expect(rs.ask_recoverability.n).toBe(2);
    expect(rs.ask_recoverability.rate).toBeCloseTo(0.5, 10);
    const xsub = rs.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    expect(xsub.ask_recoverability.k).toBe(1);
    expect(xsub.ask_recoverability.n).toBe(2);
  });

  it('ask_rate_metrics folds through buildReport (over-ask directly visible per slice)', () => {
    const details: import('./types').EvalDetail[] = [
      // GT classify, classified — fine.
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', actual_code: '7318.15.00', code_correct: true }),
      // GT classify, system ASKed via cross_subheading → an OVER-ASK in should_not_ask.
      detail({ test_case_id: 'O1', expected_routing: 'classify', actual_routing: 'ask', routing_correct: false,
        expected_code: '0207.12.00', ask_trigger: 'cross_subheading' }),
      // GT ask, asked correctly → should_ask.ask_rate numerator.
      detail({ test_case_id: 'A1', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true,
        expected_code: '0207.12.00', ask_trigger: 'triage' }),
    ];
    const r = buildReportForTest(details);
    const ar = r.routing_split_metrics.ask_rate_metrics;
    expect(ar).toBeDefined();
    // should_not_ask (GT classify): 2 cases, 1 over-asked → ask_rate 1/2 == over_ask.
    expect(ar.should_not_ask.ask_rate.k).toBe(1);
    expect(ar.should_not_ask.ask_rate.n).toBe(2);
    expect(ar.should_not_ask.ask_rate.rate).toBeCloseTo(0.5, 10);
    expect(ar.should_not_ask.ask_rate.rate).toBeCloseTo(r.routing_split_metrics.over_ask_rate.rate, 10);
    // over-ask sliced by the firing lever.
    const xsub = ar.should_not_ask.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    expect(xsub.ask_rate.k).toBe(1);
    expect(xsub.ask_rate.n).toBe(2);
    // should_ask (GT ask): 1 case, asked → ask_rate 1/1.
    expect(ar.should_ask.ask_rate.k).toBe(1);
    expect(ar.should_ask.ask_rate.n).toBe(1);
    // overall: 2 asks of 3 cases.
    expect(ar.overall.ask_rate.k).toBe(2);
    expect(ar.overall.ask_rate.n).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClassifyResult } from '../classifier-v2/types';
import type { EvalClassifyResult } from './v2-adapter';
import type { EvalTestCase } from './types';

// Mock the adapter so runTestCase exercises our diagnostics/error policy in
// isolation, with NO live classifier call. isSystemError is re-implemented
// faithfully (checks raw.system_error) so the runner's C1 gate is exercised.
const classifyForEval = vi.fn<[string], Promise<EvalClassifyResult>>();
vi.mock('./v2-adapter', () => ({
  classifyForEval: (q: string) => classifyForEval(q),
  isSystemError: (r: ClassifyResult) => r.system_error !== undefined,
}));

// Imported AFTER vi.mock so the mock is wired. require.main !== module under
// vitest, so importing runner does NOT kick off a live eval.
import { runTestCase, extractDiagnostics } from './runner';

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

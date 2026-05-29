import { describe, it, expect } from 'vitest';
import {
  perCaseCorrectVector,
  compareRuns,
  type PerCaseCorrect,
} from './compare';
import type { EvalReport, EvalDetail } from './types';

// Minimal report builder for vector/flip tests (only `details` is read).
const detail = (over: Partial<EvalDetail>): EvalDetail => ({
  test_case_id: 'x', query: 'q', expected_routing: 'classify', actual_routing: 'classify',
  routing_correct: true, response_time_ms: 1, score: 0, ...over,
});

const report = (details: EvalDetail[]): EvalReport =>
  ({ details } as unknown as EvalReport);

describe('perCaseCorrectVector — code-correctness pass/fail per case', () => {
  it('maps gold-code cases to code_correct, and uses routing for non-gold cases', () => {
    const r = report([
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', code_correct: true }),
      detail({ test_case_id: 'C2', expected_code: '0901.21.00', code_correct: false }),
      // non-gold ask case → graded by routing_correct
      detail({ test_case_id: 'A1', expected_routing: 'ask', actual_routing: 'ask', routing_correct: true, expected_code: undefined }),
    ]);
    const v = perCaseCorrectVector(r);
    expect(v.get('C1')).toBe(true);
    expect(v.get('C2')).toBe(false);
    expect(v.get('A1')).toBe(true);
  });

  it('excludes error cases (infra failures are not model decisions)', () => {
    const r = report([
      detail({ test_case_id: 'C1', expected_code: '7318.15.00', code_correct: true }),
      detail({ test_case_id: 'E1', is_error: true, actual_routing: 'error', routing_correct: false }),
    ]);
    const v = perCaseCorrectVector(r);
    expect(v.has('E1')).toBe(false);
    expect(v.size).toBe(1);
  });
});

describe('compareRuns — regression guard (flips + McNemar)', () => {
  it('detects correct→wrong (regression) and wrong→correct (improvement) flips', () => {
    const before = report([
      detail({ test_case_id: 'A', expected_code: '1', code_correct: true }),   // stays correct
      detail({ test_case_id: 'B', expected_code: '2', code_correct: true }),   // → wrong (REGRESSION)
      detail({ test_case_id: 'C', expected_code: '3', code_correct: false }),  // → correct (improvement)
      detail({ test_case_id: 'D', expected_code: '4', code_correct: false }),  // stays wrong
    ]);
    const after = report([
      detail({ test_case_id: 'A', expected_code: '1', code_correct: true }),
      detail({ test_case_id: 'B', expected_code: '2', code_correct: false }),
      detail({ test_case_id: 'C', expected_code: '3', code_correct: true }),
      detail({ test_case_id: 'D', expected_code: '4', code_correct: false }),
    ]);
    const cmp = compareRuns(before, after);
    expect(cmp.regressed_case_ids).toEqual(['B']);
    expect(cmp.improved_case_ids).toEqual(['C']);
    expect(cmp.hasUnexplainedRegression).toBe(true); // B regressed, no sign-off
    expect(cmp.shared_population).toBe(4);
    // McNemar discordant: b=1 (regression), c=1 (improvement)
    expect(cmp.mcnemar.b).toBe(1);
    expect(cmp.mcnemar.c).toBe(1);
  });

  it('no regression → hasUnexplainedRegression false', () => {
    const before = report([detail({ test_case_id: 'A', expected_code: '1', code_correct: false })]);
    const after = report([detail({ test_case_id: 'A', expected_code: '1', code_correct: true })]);
    const cmp = compareRuns(before, after);
    expect(cmp.regressed_case_ids).toEqual([]);
    expect(cmp.improved_case_ids).toEqual(['A']);
    expect(cmp.hasUnexplainedRegression).toBe(false);
  });

  it('signed-off regressions are NOT unexplained', () => {
    const before = report([detail({ test_case_id: 'B', expected_code: '2', code_correct: true })]);
    const after = report([detail({ test_case_id: 'B', expected_code: '2', code_correct: false })]);
    const cmp = compareRuns(before, after, { signedOffRegressions: ['B'] });
    expect(cmp.regressed_case_ids).toEqual(['B']);
    expect(cmp.hasUnexplainedRegression).toBe(false); // B is signed off
  });

  it('only compares the SHARED population (cases present in both runs)', () => {
    const before = report([
      detail({ test_case_id: 'A', expected_code: '1', code_correct: true }),
      detail({ test_case_id: 'ONLY_BEFORE', expected_code: '9', code_correct: true }),
    ]);
    const after = report([
      detail({ test_case_id: 'A', expected_code: '1', code_correct: false }),
      detail({ test_case_id: 'ONLY_AFTER', expected_code: '8', code_correct: true }),
    ]);
    const cmp = compareRuns(before, after);
    expect(cmp.shared_population).toBe(1); // only 'A' is in both
    expect(cmp.regressed_case_ids).toEqual(['A']);
  });
});

// Type export sanity (compile-time): PerCaseCorrect is a Map<string, boolean>.
describe('PerCaseCorrect type', () => {
  it('is a string→boolean map', () => {
    const m: PerCaseCorrect = new Map<string, boolean>([['x', true]]);
    expect(m.get('x')).toBe(true);
  });
});

/**
 * Unit tests for the three-valued predicate evaluator.
 *
 * Spec: sub-spec 01 §"Rules 7/8/9 — Predicate DSL" + db/predicate-dsl.ts canonical type.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/predicate-evaluator.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  evalPredicate,
  type PredicateCandidateContext,
  type PredicateEvalContext,
} from './predicate-evaluator';
import type { Predicate, PredicateRef } from '../db/predicate-dsl';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function ctx(
  attrs: Record<string, unknown> | null,
  candidateOverrides: Partial<PredicateCandidateContext> = {},
): PredicateEvalContext {
  return {
    attrs,
    candidate: {
      chapter:    '72',
      heading:    '7218',
      subheading: '7218.10',
      code:       '7218.10.00',
      section:    'XV',
      ...candidateOverrides,
    },
  };
}

const empty: PredicateRef[] = [];

/* ===========================================================================
 * Operator: ==
 * =========================================================================== */

describe('predicate-evaluator — ==', () => {
  it('PASS on scalar equality', () => {
    const pred: Predicate = { op: '==', var: 'predominant_element', value: 'iron' };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('PASS');
  });

  it('FAIL on scalar inequality', () => {
    const pred: Predicate = { op: '==', var: 'predominant_element', value: 'iron' };
    expect(evalPredicate(pred, ctx({ predominant_element: 'carbon' }), [], 1)).toBe('FAIL');
  });

  it('PASS when array contains the value (IN semantics)', () => {
    const pred: Predicate = { op: '==', var: 'material', value: 'steel' };
    expect(evalPredicate(pred, ctx({ material: ['steel', 'iron'] }), [], 1)).toBe('PASS');
  });

  it('FAIL when array does not contain the value', () => {
    const pred: Predicate = { op: '==', var: 'material', value: 'aluminum' };
    expect(evalPredicate(pred, ctx({ material: ['steel', 'iron'] }), [], 1)).toBe('FAIL');
  });

  it('SKIP when key absent — records PredicateRef', () => {
    const pred: Predicate = { op: '==', var: 'material', value: 'steel' };
    const skipped: PredicateRef[] = [];
    expect(evalPredicate(pred, ctx({}), skipped, 99)).toBe('SKIP');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ notes_claim_id: 99, var: 'material', op: '==' });
  });

  it('SKIP when attrs is null entirely', () => {
    const pred: Predicate = { op: '==', var: 'material', value: 'steel' };
    expect(evalPredicate(pred, ctx(null), [], 1)).toBe('SKIP');
  });
});

/* ===========================================================================
 * Operator: !=
 * =========================================================================== */

describe('predicate-evaluator — !=', () => {
  it('PASS on scalar inequality', () => {
    const pred: Predicate = { op: '!=', var: 'predominant_element', value: 'carbon' };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('PASS');
  });

  it('FAIL when array contains the value', () => {
    const pred: Predicate = { op: '!=', var: 'material', value: 'steel' };
    expect(evalPredicate(pred, ctx({ material: ['steel'] }), [], 1)).toBe('FAIL');
  });

  it('PASS when array does NOT contain the value', () => {
    const pred: Predicate = { op: '!=', var: 'material', value: 'aluminum' };
    expect(evalPredicate(pred, ctx({ material: ['steel'] }), [], 1)).toBe('PASS');
  });
});

/* ===========================================================================
 * Operators: >, <, >=, <=
 * =========================================================================== */

describe('predicate-evaluator — numeric comparisons', () => {
  it('> PASS', () => {
    const pred: Predicate = { op: '>', var: 'carbon_pct', value: 0.5 };
    expect(evalPredicate(pred, ctx({ carbon_pct: 1.2 }), [], 1)).toBe('PASS');
  });
  it('> FAIL', () => {
    const pred: Predicate = { op: '>', var: 'carbon_pct', value: 0.5 };
    expect(evalPredicate(pred, ctx({ carbon_pct: 0.3 }), [], 1)).toBe('FAIL');
  });
  it('>= boundary PASS', () => {
    const pred: Predicate = { op: '>=', var: 'chromium_pct', value: 10.5 };
    expect(evalPredicate(pred, ctx({ chromium_pct: 10.5 }), [], 1)).toBe('PASS');
  });
  it('< PASS', () => {
    const pred: Predicate = { op: '<', var: 'carbon_pct', value: 2.0 };
    expect(evalPredicate(pred, ctx({ carbon_pct: 1.0 }), [], 1)).toBe('PASS');
  });
  it('<= boundary PASS', () => {
    const pred: Predicate = { op: '<=', var: 'carbon_pct', value: 1.0 };
    expect(evalPredicate(pred, ctx({ carbon_pct: 1.0 }), [], 1)).toBe('PASS');
  });
  it('SKIP when key absent', () => {
    const pred: Predicate = { op: '>', var: 'carbon_pct', value: 0.5 };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('SKIP');
  });
  it('SKIP on non-numeric value (graceful for O2-ramping)', () => {
    const pred: Predicate = { op: '>', var: 'carbon_pct', value: 0.5 };
    expect(evalPredicate(pred, ctx({ carbon_pct: 'high' }), [], 1)).toBe('SKIP');
  });
});

/* ===========================================================================
 * Operator: EXISTS — absence = FAIL (ONLY op with this semantics)
 * =========================================================================== */

describe('predicate-evaluator — EXISTS', () => {
  it('PASS when key present + non-null + non-empty array', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx({ material: ['steel'] }), [], 1)).toBe('PASS');
  });
  it('FAIL when key absent', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('FAIL');
  });
  it('FAIL when key present but null', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx({ material: null }), [], 1)).toBe('FAIL');
  });
  it('FAIL when key present but empty array', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx({ material: [] }), [], 1)).toBe('FAIL');
  });
  it('FAIL when attrs is null entirely', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx(null), [], 1)).toBe('FAIL');
  });
  it('PASS on scalar string', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'predominant_element' };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('PASS');
  });

  // ---- __SKIP_* sentinel vars (NOT machine-checkable claims) ----
  // notes_claims rows whose predicate is EXISTS(__SKIP_*) are sentinels meaning
  // "this claim is unverifiable → SKIP". They must NEVER FAIL (a FAIL on a
  // normal-polarity claim becomes a false violation on every product).
  it('SKIP (not FAIL) on __SKIP_PURPOSIVE__ sentinel var even when absent', () => {
    const pred: Predicate = { op: 'EXISTS', var: '__SKIP_PURPOSIVE__' };
    const skipped: PredicateRef[] = [];
    expect(evalPredicate(pred, ctx({}), skipped, 43)).toBe('SKIP');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ notes_claim_id: 43, var: '__SKIP_PURPOSIVE__', op: 'EXISTS' });
  });
  it('SKIP on __SKIP_DEFINITION__ sentinel var', () => {
    const pred: Predicate = { op: 'EXISTS', var: '__SKIP_DEFINITION__' };
    expect(evalPredicate(pred, ctx(null), [], 88)).toBe('SKIP');
  });
  it('SKIP on __SKIP_PRIORITY_RULE__ sentinel var', () => {
    const pred: Predicate = { op: 'EXISTS', var: '__SKIP_PRIORITY_RULE__' };
    expect(evalPredicate(pred, ctx({}), [], 121)).toBe('SKIP');
  });
  it('REGRESSION: real EXISTS still FAILs on a genuinely absent attribute', () => {
    const pred: Predicate = { op: 'EXISTS', var: 'material' };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('FAIL');
  });
});

/* ===========================================================================
 * Operators: IN, NOT_IN
 * =========================================================================== */

describe('predicate-evaluator — IN / NOT_IN', () => {
  it('IN scalar PASS', () => {
    const pred: Predicate = { op: 'IN', var: 'predominant_element', values: ['iron', 'steel'] };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('PASS');
  });
  it('IN scalar FAIL', () => {
    const pred: Predicate = { op: 'IN', var: 'predominant_element', values: ['iron', 'steel'] };
    expect(evalPredicate(pred, ctx({ predominant_element: 'aluminum' }), [], 1)).toBe('FAIL');
  });
  it('IN array-var: PASS when any element overlaps', () => {
    const pred: Predicate = { op: 'IN', var: 'material', values: ['titanium', 'iron'] };
    expect(evalPredicate(pred, ctx({ material: ['steel', 'iron'] }), [], 1)).toBe('PASS');
  });
  it('NOT_IN scalar PASS', () => {
    const pred: Predicate = { op: 'NOT_IN', var: 'predominant_element', values: ['carbon'] };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('PASS');
  });
  it('NOT_IN scalar FAIL', () => {
    const pred: Predicate = { op: 'NOT_IN', var: 'predominant_element', values: ['iron'] };
    expect(evalPredicate(pred, ctx({ predominant_element: 'iron' }), [], 1)).toBe('FAIL');
  });
  it('SKIP when key absent', () => {
    const pred: Predicate = { op: 'IN', var: 'material', values: ['steel'] };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('SKIP');
  });
});

/* ===========================================================================
 * Operators: ARRAY_CONTAINS, ARRAY_OVERLAPS
 * =========================================================================== */

describe('predicate-evaluator — ARRAY_CONTAINS / ARRAY_OVERLAPS', () => {
  it('ARRAY_CONTAINS PASS', () => {
    const pred: Predicate = { op: 'ARRAY_CONTAINS', var: 'material', value: 'steel' };
    expect(evalPredicate(pred, ctx({ material: ['iron', 'steel'] }), [], 1)).toBe('PASS');
  });
  it('ARRAY_CONTAINS FAIL', () => {
    const pred: Predicate = { op: 'ARRAY_CONTAINS', var: 'material', value: 'aluminum' };
    expect(evalPredicate(pred, ctx({ material: ['iron', 'steel'] }), [], 1)).toBe('FAIL');
  });
  it('ARRAY_CONTAINS SKIP when key absent', () => {
    const pred: Predicate = { op: 'ARRAY_CONTAINS', var: 'material', value: 'steel' };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('SKIP');
  });
  it('ARRAY_OVERLAPS PASS', () => {
    const pred: Predicate = { op: 'ARRAY_OVERLAPS', var: 'material', values: ['steel', 'iron'] };
    expect(evalPredicate(pred, ctx({ material: ['stainless', 'iron'] }), [], 1)).toBe('PASS');
  });
  it('ARRAY_OVERLAPS FAIL', () => {
    const pred: Predicate = { op: 'ARRAY_OVERLAPS', var: 'material', values: ['titanium'] };
    expect(evalPredicate(pred, ctx({ material: ['iron', 'steel'] }), [], 1)).toBe('FAIL');
  });
});

/* ===========================================================================
 * Three-valued logic: AND
 * =========================================================================== */

describe('predicate-evaluator — AND truth table', () => {
  const eq = (v: string, val: string): Predicate => ({ op: '==', var: v, value: val });
  it('all PASS → PASS', () => {
    const pred: Predicate = { op: 'AND', clauses: [eq('material', 'steel'), eq('form', 'sheet')] };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'sheet' }), [], 1)).toBe('PASS');
  });
  it('any FAIL → FAIL', () => {
    const pred: Predicate = { op: 'AND', clauses: [eq('material', 'steel'), eq('form', 'bar')] };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'sheet' }), [], 1)).toBe('FAIL');
  });
  it('some SKIP, no FAIL → SKIP', () => {
    const pred: Predicate = { op: 'AND', clauses: [eq('material', 'steel'), eq('form', 'sheet')] };
    expect(evalPredicate(pred, ctx({ material: 'steel' }), [], 1)).toBe('SKIP');
  });
  it('any FAIL short-circuits over SKIP', () => {
    const pred: Predicate = { op: 'AND', clauses: [eq('material', 'aluminum'), eq('form', 'sheet')] };
    expect(evalPredicate(pred, ctx({ material: 'steel' }), [], 1)).toBe('FAIL');
  });
});

/* ===========================================================================
 * Three-valued logic: OR
 * =========================================================================== */

describe('predicate-evaluator — OR truth table', () => {
  const eq = (v: string, val: string): Predicate => ({ op: '==', var: v, value: val });
  it('any PASS → PASS', () => {
    const pred: Predicate = { op: 'OR', clauses: [eq('material', 'aluminum'), eq('form', 'sheet')] };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'sheet' }), [], 1)).toBe('PASS');
  });
  it('all FAIL → FAIL', () => {
    const pred: Predicate = { op: 'OR', clauses: [eq('material', 'aluminum'), eq('form', 'bar')] };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'sheet' }), [], 1)).toBe('FAIL');
  });
  it('some SKIP, no PASS → SKIP', () => {
    const pred: Predicate = { op: 'OR', clauses: [eq('material', 'aluminum'), eq('form', 'sheet')] };
    expect(evalPredicate(pred, ctx({ material: 'steel' }), [], 1)).toBe('SKIP');
  });
});

/* ===========================================================================
 * NOT and IMPLIES
 * =========================================================================== */

describe('predicate-evaluator — NOT / IMPLIES', () => {
  const eq = (v: string, val: string): Predicate => ({ op: '==', var: v, value: val });

  it('NOT(PASS) = FAIL', () => {
    const pred: Predicate = { op: 'NOT', clause: eq('material', 'steel') };
    expect(evalPredicate(pred, ctx({ material: 'steel' }), [], 1)).toBe('FAIL');
  });
  it('NOT(FAIL) = PASS', () => {
    const pred: Predicate = { op: 'NOT', clause: eq('material', 'aluminum') };
    expect(evalPredicate(pred, ctx({ material: 'steel' }), [], 1)).toBe('PASS');
  });
  it('NOT(SKIP) = SKIP', () => {
    const pred: Predicate = { op: 'NOT', clause: eq('material', 'steel') };
    expect(evalPredicate(pred, ctx({}), [], 1)).toBe('SKIP');
  });
  it('IMPLIES — FAIL antecedent → vacuously PASS', () => {
    const pred: Predicate = {
      op:         'IMPLIES',
      antecedent: eq('material', 'aluminum'),
      consequent: eq('form', 'sheet'),
    };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'bar' }), [], 1)).toBe('PASS');
  });
  it('IMPLIES — PASS antecedent + PASS consequent → PASS', () => {
    const pred: Predicate = {
      op:         'IMPLIES',
      antecedent: eq('material', 'steel'),
      consequent: eq('form', 'sheet'),
    };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'sheet' }), [], 1)).toBe('PASS');
  });
  it('IMPLIES — PASS antecedent + FAIL consequent → FAIL', () => {
    const pred: Predicate = {
      op:         'IMPLIES',
      antecedent: eq('material', 'steel'),
      consequent: eq('form', 'sheet'),
    };
    expect(evalPredicate(pred, ctx({ material: 'steel', form: 'bar' }), [], 1)).toBe('FAIL');
  });
  it('IMPLIES — SKIP antecedent, PASS consequent → PASS', () => {
    const pred: Predicate = {
      op:         'IMPLIES',
      antecedent: eq('material', 'steel'),
      consequent: eq('form', 'sheet'),
    };
    expect(evalPredicate(pred, ctx({ form: 'sheet' }), [], 1)).toBe('PASS');
  });
  it('IMPLIES — SKIP antecedent, FAIL consequent → SKIP', () => {
    const pred: Predicate = {
      op:         'IMPLIES',
      antecedent: eq('material', 'steel'),
      consequent: eq('form', 'sheet'),
    };
    expect(evalPredicate(pred, ctx({ form: 'bar' }), [], 1)).toBe('SKIP');
  });
});

/* ===========================================================================
 * candidate.* context vars
 * =========================================================================== */

describe('predicate-evaluator — candidate.* context vars', () => {
  it('candidate.chapter resolves from ctx.candidate not ctx.attrs', () => {
    const pred: Predicate = { op: '==', var: 'candidate.chapter', value: '72' };
    expect(evalPredicate(pred, ctx({}, { chapter: '72' }), [], 1)).toBe('PASS');
  });
  it('candidate.code FAIL when mismatched', () => {
    const pred: Predicate = { op: '==', var: 'candidate.code', value: '7218.10.00' };
    expect(evalPredicate(pred, ctx({}, { code: '8407.31.00' }), [], 1)).toBe('FAIL');
  });
  it('candidate.heading PASS', () => {
    const pred: Predicate = { op: '==', var: 'candidate.heading', value: '7218' };
    expect(evalPredicate(pred, ctx({}, { heading: '7218' }), [], 1)).toBe('PASS');
  });
});

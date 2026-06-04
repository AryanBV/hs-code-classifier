/**
 * Deterministic unit tests for the one-directional outcome-equivalence suppressor.
 * Pure, no I/O, no Gemini, no DB.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/outcome-equivalence.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  leavesShareOutcome,
  evaluateOutcomeEquivalence,
  type LeafOutcomeMap,
} from './outcome-equivalence';

const SAME_FREE: LeafOutcomeMap = {
  'X.10': { export_policy: 'Free', policy_condition: null },
  'X.20': { export_policy: 'Free', policy_condition: null },
};

const SAME_RESTRICTED_WITH_COND: LeafOutcomeMap = {
  'X.10': { export_policy: 'Restricted', policy_condition: 'subject to DGFT licence' },
  'X.20': { export_policy: 'Restricted', policy_condition: 'subject to DGFT licence' },
};

const DIVERGENT_POLICY: LeafOutcomeMap = {
  'X.10': { export_policy: 'Free', policy_condition: null },
  'X.20': { export_policy: 'Restricted', policy_condition: null },
};

const ONE_NULL_POLICY: LeafOutcomeMap = {
  'X.10': { export_policy: 'Free', policy_condition: null },
  'X.20': { export_policy: null, policy_condition: null },
};

describe('leavesShareOutcome', () => {
  it('identical non-null policy + null condition on both → true', () => {
    expect(leavesShareOutcome(['X.10', 'X.20'], SAME_FREE)).toBe(true);
  });

  it('identical policy + identical non-null condition → true', () => {
    expect(leavesShareOutcome(['X.10', 'X.20'], SAME_RESTRICTED_WITH_COND)).toBe(true);
  });

  it('divergent policy → false (differs)', () => {
    expect(leavesShareOutcome(['X.10', 'X.20'], DIVERGENT_POLICY)).toBe(false);
  });

  it('a null policy on ANY leaf → false (never anchor equivalence on missing data)', () => {
    expect(leavesShareOutcome(['X.10', 'X.20'], ONE_NULL_POLICY)).toBe(false);
  });

  it('a code missing from the map → false (treated as null → differs)', () => {
    expect(leavesShareOutcome(['X.10', 'X.99'], SAME_FREE)).toBe(false);
  });

  it('present-vs-absent condition differs → false', () => {
    const m: LeafOutcomeMap = {
      'X.10': { export_policy: 'Free', policy_condition: 'with cond' },
      'X.20': { export_policy: 'Free', policy_condition: null },
    };
    expect(leavesShareOutcome(['X.10', 'X.20'], m)).toBe(false);
  });

  it('fewer than 2 distinct codes → false (nothing to compare)', () => {
    expect(leavesShareOutcome(['X.10'], SAME_FREE)).toBe(false);
    expect(leavesShareOutcome(['X.10', 'X.10'], SAME_FREE)).toBe(false);
  });

  it('normalizes case + whitespace before comparison', () => {
    const m: LeafOutcomeMap = {
      'X.10': { export_policy: ' Free ', policy_condition: null },
      'X.20': { export_policy: 'free', policy_condition: null },
    };
    expect(leavesShareOutcome(['X.10', 'X.20'], m)).toBe(true);
  });
});

describe('evaluateOutcomeEquivalence — default OFF + directionality', () => {
  it('disabled → never suppress (no-op, default)', () => {
    const d = evaluateOutcomeEquivalence({
      separatedLeafCodes: ['X.10', 'X.20'],
      isPrimary: false,
      outcomes: SAME_FREE,
      enabled: false,
    });
    expect(d.suppress).toBe(false);
    expect(d.reason).toBe('disabled');
  });

  it('enabled + INCIDENTAL + same policy → suppress', () => {
    const d = evaluateOutcomeEquivalence({
      separatedLeafCodes: ['X.10', 'X.20'],
      isPrimary: false,
      outcomes: SAME_FREE,
      enabled: true,
    });
    expect(d.suppress).toBe(true);
    expect(d.reason).toBe('suppressed');
  });

  it('enabled + PRIMARY + same policy → does NOT suppress (PRIMARY is exempt)', () => {
    const d = evaluateOutcomeEquivalence({
      separatedLeafCodes: ['X.10', 'X.20'],
      isPrimary: true,
      outcomes: SAME_FREE,
      enabled: true,
    });
    expect(d.suppress).toBe(false);
    expect(d.reason).toBe('primary_axis_exempt');
  });

  it('enabled + INCIDENTAL + divergent policy → does NOT suppress (fail toward asking)', () => {
    const d = evaluateOutcomeEquivalence({
      separatedLeafCodes: ['X.10', 'X.20'],
      isPrimary: false,
      outcomes: DIVERGENT_POLICY,
      enabled: true,
    });
    expect(d.suppress).toBe(false);
    expect(d.reason).toBe('outcomes_differ');
  });

  it('enabled + INCIDENTAL + a null policy → does NOT suppress (null == differs)', () => {
    const d = evaluateOutcomeEquivalence({
      separatedLeafCodes: ['X.10', 'X.20'],
      isPrimary: false,
      outcomes: ONE_NULL_POLICY,
      enabled: true,
    });
    expect(d.suppress).toBe(false);
    expect(d.reason).toBe('outcomes_differ');
  });
});

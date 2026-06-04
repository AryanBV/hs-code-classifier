/**
 * Deterministic unit tests for the normalized gain-ratio information-gain core.
 * Pure math, no I/O, no Gemini, no DB.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/information-gain.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  computeGainRatio,
  normalizedGainRatio,
  partitionClassSizes,
  type LeafPartition,
} from './information-gain';

function part(obj: Record<string, string[]>): LeafPartition {
  return new Map(Object.entries(obj));
}

describe('partitionClassSizes', () => {
  it('counts distinct leaves per class in iteration order', () => {
    const p = part({ a: ['x', 'y'], b: ['z'], c: ['p', 'q', 'r'] });
    expect(partitionClassSizes(p)).toEqual([2, 1, 3]);
  });

  it('de-duplicates codes within a class', () => {
    const p = part({ a: ['x', 'x', 'y'], b: ['z', 'z'] });
    expect(partitionClassSizes(p)).toEqual([2, 1]);
  });

  it('empty partition → empty sizes', () => {
    expect(partitionClassSizes(new Map())).toEqual([]);
  });
});

describe('computeGainRatio — degenerate cases', () => {
  it('empty partition → gainRatio 0', () => {
    const r = computeGainRatio(new Map());
    expect(r.gainRatio).toBe(0);
    expect(r.total).toBe(0);
    expect(r.classCount).toBe(0);
  });

  it('single class → gainRatio 0 (no discrimination)', () => {
    const r = computeGainRatio(part({ only: ['a', 'b', 'c'] }));
    expect(r.gainRatio).toBe(0);
    expect(r.informationGain).toBe(0);
    expect(r.splitInfo).toBe(0);
  });

  it('single leaf total → gainRatio 0', () => {
    const r = computeGainRatio(part({ a: ['x'] }));
    expect(r.gainRatio).toBe(0);
  });
});

describe('computeGainRatio — clean splits', () => {
  it('a perfect 2-way 1-vs-1 split has gainRatio 1.0', () => {
    // 2 leaves, each its own class → knowing the class fully identifies the leaf.
    // IG = log2(2) - 0 = 1; splitInfo = H(1/2,1/2) = 1; ratio = 1.
    const r = computeGainRatio(part({ a: ['x'], b: ['y'] }));
    expect(r.informationGain).toBeCloseTo(1, 10);
    expect(r.splitInfo).toBeCloseTo(1, 10);
    expect(r.gainRatio).toBeCloseTo(1, 10);
  });

  it('a perfect 4-way 1-each split also has gainRatio 1.0 (cardinality-stable)', () => {
    // IG = log2(4) - 0 = 2; splitInfo = H(uniform 4) = 2; ratio = 1.
    const r = computeGainRatio(part({ a: ['1'], b: ['2'], c: ['3'], d: ['4'] }));
    expect(r.informationGain).toBeCloseTo(2, 10);
    expect(r.splitInfo).toBeCloseTo(2, 10);
    expect(r.gainRatio).toBeCloseTo(1, 10);
  });
});

describe('computeGainRatio — partial splits (normalized by prior entropy)', () => {
  it('an even 2-class split that leaves within-class residual scores 0.5', () => {
    // classes of size 2 and 2 over 4 leaves:
    // prior = log2(4) = 2; residual = 0.5*log2(2)+0.5*log2(2) = 1; IG = 1.
    // ratio = IG / prior = 1/2 = 0.5 (removes half the leaf-uncertainty).
    const r = computeGainRatio(part({ a: ['1', '2'], b: ['3', '4'] }));
    expect(r.informationGain).toBeCloseTo(1, 10);
    expect(r.priorEntropy).toBeCloseTo(2, 10);
    expect(r.gainRatio).toBeCloseTo(0.5, 10);
  });

  it('an uneven 3-vs-1 split scores its IG fraction of the prior', () => {
    // 3-vs-1 over 4 leaves: prior = 2; residual = 0.75*log2(3)+0.25*log2(1)
    //   = 0.75*1.585 = 1.189; IG = 0.811; ratio = 0.811/2 = 0.4056.
    const r = computeGainRatio(part({ a: ['1', '2', '3'], b: ['4'] }));
    expect(r.informationGain).toBeCloseTo(0.8113, 3);
    expect(r.gainRatio).toBeCloseTo(0.4056, 3);
    expect(r.gainRatio).toBeGreaterThan(0);
    expect(r.gainRatio).toBeLessThan(1);
  });

  it('a clean carve of 8 leaves into 4-vs-4 removes only 1 of 3 bits → ~0.33', () => {
    // prior = log2(8) = 3; residual = log2(4) = 2; IG = 1; ratio = 1/3.
    const r = computeGainRatio(part({ a: ['1', '2', '3', '4'], b: ['5', '6', '7', '8'] }));
    expect(r.gainRatio).toBeCloseTo(1 / 3, 6);
  });
});

describe('normalized gain-ratio — cardinality stability (the load-bearing property)', () => {
  it('does NOT mechanically prefer a many-branch split over a clean 2-way split', () => {
    // A clean 2-way split (whole vs cuts): each branch is a singleton → ratio 1.
    const clean2way = normalizedGainRatio(part({ whole: ['0207.12.00'], cut: ['0207.14.00'] }));

    // A 7-way grade split where branches are NOT all singletons (some grades share
    // multiple leaves) → residual entropy remains → ratio < 1.
    const grade7way = normalizedGainRatio(
      part({
        a: ['1', '2'],
        b: ['3', '4'],
        c: ['5', '6'],
        d: ['7'],
        e: ['8'],
        f: ['9'],
        g: ['10'],
      }),
    );

    // Raw IG would rank the 7-way higher (more bits); the NORMALIZED ratio must NOT
    // let pure branch count dominate — the clean split is at least as preferred.
    expect(clean2way).toBeGreaterThanOrEqual(grade7way);
    expect(clean2way).toBeCloseTo(1, 10);
    expect(grade7way).toBeLessThan(1);
  });

  it('two FULLY-separating splits of different cardinality both score 1.0 (cardinality-stable)', () => {
    // A split that uniquely identifies every leaf removes ALL uncertainty → ratio 1
    // regardless of how many branches it took to do it.
    const r2 = normalizedGainRatio(part({ a: ['1'], b: ['2'] }));
    const r4 = normalizedGainRatio(part({ a: ['1'], b: ['2'], c: ['3'], d: ['4'] }));
    expect(r2).toBeCloseTo(r4, 10);
    expect(r2).toBeCloseTo(1, 10);
  });

  it('ratio is always in [0,1]', () => {
    const cases: LeafPartition[] = [
      part({ a: ['1', '2', '3', '4', '5'], b: ['6'] }),
      part({ a: ['1'], b: ['2', '3', '4', '5', '6', '7'] }),
      part({ a: ['1', '2'], b: ['3', '4'], c: ['5', '6'] }),
    ];
    for (const c of cases) {
      const g = normalizedGainRatio(c);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});

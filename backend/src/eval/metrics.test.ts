import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  mcnemar,
  brierScore,
  eceEqualMass,
  percentile,
  mean,
  type CalibrationSample,
} from './metrics';

// ---------------------------------------------------------------------------
// wilsonInterval — hand-computed known values
// ---------------------------------------------------------------------------

describe('wilsonInterval', () => {
  it('n=0 returns rate 0 and the full [0,1] interval (no information)', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.rate).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(1);
    expect(ci.k).toBe(0);
    expect(ci.n).toBe(0);
  });

  it('perfect 10/10 — point estimate 1, lower bound below 1, upper bound 1', () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.rate).toBe(1);
    expect(ci.upper).toBeCloseTo(1, 10);
    // Known Wilson lower for 10/10 @95% ≈ 0.7225
    expect(ci.lower).toBeCloseTo(0.7225, 3);
  });

  it('5/10 centers near 0.5 with the classic symmetric Wilson band ~[0.2366,0.7634]', () => {
    const ci = wilsonInterval(5, 10);
    expect(ci.rate).toBeCloseTo(0.5, 10);
    // Textbook Wilson 95% interval for 5/10.
    expect(ci.lower).toBeCloseTo(0.2366, 3);
    expect(ci.upper).toBeCloseTo(0.7634, 3);
  });

  it('half-width near ±4.6pp at n=386, p=0.5 (matches the spec §2.6 figure)', () => {
    const ci = wilsonInterval(193, 386); // p = 0.5
    const halfWidth = (ci.upper - ci.lower) / 2;
    expect(halfWidth).toBeCloseTo(0.0495, 3); // ≈ ±4.95pp Wilson (≈ ±4.6–5pp)
  });

  it('clamps to [0,1] and never produces a bound outside the valid range', () => {
    const ci = wilsonInterval(1, 1);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// mcnemar — paired correct/wrong vectors
// ---------------------------------------------------------------------------

describe('mcnemar', () => {
  it('counts discordant pairs b (before-correct→after-wrong) and c (before-wrong→after-correct)', () => {
    // before:  [T, T, F, F, T]
    // after:   [T, F, T, F, T]
    // pair 0: T,T concordant; 1: T,F → b; 2: F,T → c; 3: F,F concordant; 4: T,T concordant
    const r = mcnemar([true, true, false, false, true], [true, false, true, false, true]);
    expect(r.b).toBe(1); // correct→wrong
    expect(r.c).toBe(1); // wrong→correct
    expect(r.n).toBe(5);
  });

  it('no discordant pairs → statistic 0, p-value 1', () => {
    const r = mcnemar([true, false, true], [true, false, true]);
    expect(r.b).toBe(0);
    expect(r.c).toBe(0);
    expect(r.statistic).toBe(0);
    expect(r.pValue).toBe(1);
  });

  it('strongly discordant (all improvements) → small p-value', () => {
    // 10 cases wrong→correct, 0 the other way.
    const before = Array(10).fill(false);
    const after = Array(10).fill(true);
    const r = mcnemar(before, after);
    expect(r.b).toBe(0);
    expect(r.c).toBe(10);
    expect(r.pValue).toBeLessThan(0.01);
  });

  it('throws on mismatched vector lengths (must be paired over the SAME population)', () => {
    expect(() => mcnemar([true], [true, false])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// brierScore — mean squared error of probability forecasts
// ---------------------------------------------------------------------------

describe('brierScore', () => {
  it('perfect confident-correct forecast → 0', () => {
    const samples: CalibrationSample[] = [
      { confidence: 1, correct: true },
      { confidence: 1, correct: true },
    ];
    expect(brierScore(samples)).toBe(0);
  });

  it('confidently wrong (p=1, correct=false) → 1', () => {
    expect(brierScore([{ confidence: 1, correct: false }])).toBe(1);
  });

  it('p=0.5 always → 0.25 regardless of outcome', () => {
    const samples: CalibrationSample[] = [
      { confidence: 0.5, correct: true },
      { confidence: 0.5, correct: false },
    ];
    expect(brierScore(samples)).toBeCloseTo(0.25, 10);
  });

  it('mixed: 0.9 correct + 0.3 wrong → mean of (0.01, 0.09) = 0.05', () => {
    const samples: CalibrationSample[] = [
      { confidence: 0.9, correct: true }, // (0.9-1)^2 = 0.01
      { confidence: 0.3, correct: false }, // (0.3-0)^2 = 0.09
    ];
    expect(brierScore(samples)).toBeCloseTo(0.05, 10);
  });

  it('empty input → NaN-safe 0', () => {
    expect(brierScore([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// eceEqualMass — equal-mass binning ECE
// ---------------------------------------------------------------------------

describe('eceEqualMass', () => {
  it('perfectly calibrated single bin → ECE 0', () => {
    // 10 samples all at confidence 0.5, exactly half correct → bin acc 0.5 == conf 0.5.
    const samples: CalibrationSample[] = [
      ...Array(5).fill({ confidence: 0.5, correct: true }),
      ...Array(5).fill({ confidence: 0.5, correct: false }),
    ];
    const out = eceEqualMass(samples, 1);
    expect(out.ece).toBeCloseTo(0, 10);
    expect(out.bins).toHaveLength(1);
    expect(out.bins[0]!.count).toBe(10);
  });

  it('maximally miscalibrated (all conf=1 but all wrong) → ECE 1', () => {
    const samples: CalibrationSample[] = Array(8).fill({ confidence: 1, correct: false });
    const out = eceEqualMass(samples, 5);
    expect(out.ece).toBeCloseTo(1, 10);
  });

  it('splits into ≤ requested bins by equal mass and weights gaps by bin size', () => {
    // 4 samples: confidences 0.2,0.4 (bin1) acc=0; 0.6,0.8 (bin2) acc=1.
    const samples: CalibrationSample[] = [
      { confidence: 0.2, correct: false },
      { confidence: 0.4, correct: false },
      { confidence: 0.6, correct: true },
      { confidence: 0.8, correct: true },
    ];
    const out = eceEqualMass(samples, 2);
    expect(out.bins).toHaveLength(2);
    // bin1: mean conf 0.3, acc 0 → gap 0.3; bin2: mean conf 0.7, acc 1 → gap 0.3.
    // ECE = (2/4)*0.3 + (2/4)*0.3 = 0.3
    expect(out.ece).toBeCloseTo(0.3, 10);
  });

  it('empty input → ECE 0 with no bins', () => {
    const out = eceEqualMass([], 5);
    expect(out.ece).toBe(0);
    expect(out.bins).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// percentile / mean — latency helpers
// ---------------------------------------------------------------------------

describe('percentile', () => {
  it('p95 / p50 over a known small set (nearest-rank)', () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // nearest-rank p50: ceil(0.5*10)=5 → 5th value = 50
    expect(percentile(xs, 50)).toBe(50);
    // nearest-rank p95: ceil(0.95*10)=10 → 10th value = 100
    expect(percentile(xs, 95)).toBe(100);
  });

  it('single element → that element for any percentile', () => {
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
  });

  it('empty → 0', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('is order-independent (sorts internally)', () => {
    expect(percentile([100, 10, 50, 30, 90, 20, 80, 40, 70, 60], 95)).toBe(100);
  });
});

describe('mean', () => {
  it('arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it('empty → 0', () => {
    expect(mean([])).toBe(0);
  });
});

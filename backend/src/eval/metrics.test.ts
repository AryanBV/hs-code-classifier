import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  mcnemar,
  brierScore,
  eceEqualMass,
  percentile,
  mean,
  topKCodeAccuracy,
  routingSplitMetrics,
  askRateMetrics,
  type CalibrationSample,
  type TopKCase,
  type RoutingSplitCase,
  type AskRateCase,
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

// ---------------------------------------------------------------------------
// topKCodeAccuracy — synthetic cases (EVAL-ONLY top-k instrumentation)
// ---------------------------------------------------------------------------

describe('topKCodeAccuracy', () => {
  it('empty population → 0/0 with the full [0,1] interval', () => {
    const ci = topKCodeAccuracy([], 3);
    expect(ci.k).toBe(0);
    expect(ci.n).toBe(0);
    expect(ci.rate).toBe(0);
  });

  it('top-1 counts only gold-as-selected (first candidate)', () => {
    const cases: TopKCase[] = [
      { goldCode: '7318.15.00', candidateCodes: ['7318.15.00', '7318.16.00'] }, // selected = gold ✓
      { goldCode: '0901.21.00', candidateCodes: ['0901.22.00', '0901.21.00'] }, // gold is alt #1, NOT selected ✗ at k=1
    ];
    const ci = topKCodeAccuracy(cases, 1);
    expect(ci.k).toBe(1);
    expect(ci.n).toBe(2);
    expect(ci.rate).toBeCloseTo(0.5, 10);
  });

  it('top-3 finds the gold code among the first 3 candidates', () => {
    const cases: TopKCase[] = [
      // gold is the 3rd candidate → hit at k=3 (miss at k=1).
      { goldCode: '7318.15.00', candidateCodes: ['7326.90.99', '7318.16.00', '7318.15.00', '7318.19.00'] },
      // gold beyond position 3 → miss even at k=3.
      { goldCode: '0901.21.00', candidateCodes: ['0902.10.00', '0902.20.00', '0902.30.00', '0901.21.00'] },
    ];
    expect(topKCodeAccuracy(cases, 1).rate).toBeCloseTo(0, 10);
    expect(topKCodeAccuracy(cases, 3).rate).toBeCloseTo(0.5, 10); // first case only
  });

  it('a gold case with NO candidates (ASK/REFUSE) is a miss but stays in the denominator', () => {
    const cases: TopKCase[] = [
      { goldCode: '7318.15.00', candidateCodes: ['7318.15.00'] }, // hit
      { goldCode: '0901.21.00', candidateCodes: [] },             // ASK/REFUSE → miss, denom kept
    ];
    const ci = topKCodeAccuracy(cases, 3);
    expect(ci.k).toBe(1);
    expect(ci.n).toBe(2); // denominator NOT shrunk by the empty case
    expect(ci.rate).toBeCloseTo(0.5, 10);
  });

  it('comparison is dot-insensitive (normalizes both sides)', () => {
    const cases: TopKCase[] = [
      { goldCode: '7318.15.00', candidateCodes: ['73181500'] }, // dotted gold vs un-dotted candidate
    ];
    expect(topKCodeAccuracy(cases, 1).rate).toBe(1);
  });

  it('top-k is monotone non-decreasing in k (top-1 ≤ top-3)', () => {
    const cases: TopKCase[] = [
      { goldCode: '7318.15.00', candidateCodes: ['7318.16.00', '7318.15.00'] }, // gold at pos 2
      { goldCode: '0901.21.00', candidateCodes: ['0901.21.00'] },               // gold at pos 1
    ];
    const t1 = topKCodeAccuracy(cases, 1).rate; // 1/2 (second case only)
    const t3 = topKCodeAccuracy(cases, 3).rate; // 2/2 (both)
    expect(t1).toBeCloseTo(0.5, 10);
    expect(t3).toBeCloseTo(1, 10);
    expect(t3).toBeGreaterThanOrEqual(t1);
  });

  it('k<=0 yields 0 hits (defensive)', () => {
    const cases: TopKCase[] = [{ goldCode: '7318.15.00', candidateCodes: ['7318.15.00'] }];
    expect(topKCodeAccuracy(cases, 0).k).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// routingSplitMetrics — OVER-ASK / UNDER-ASK / recoverability (CALIBRATED-ASK §2)
// ---------------------------------------------------------------------------

describe('routingSplitMetrics', () => {
  const c = (over: Partial<RoutingSplitCase> = {}): RoutingSplitCase => ({
    expectedRouting: 'classify',
    actualRouting: 'classify',
    ...over,
  });

  it('empty population → all rates 0/0 with [0,1] interval, no slices, no crash', () => {
    const r = routingSplitMetrics([]);
    expect(r.over_ask_rate.n).toBe(0);
    expect(r.over_ask_rate.rate).toBe(0);
    expect(r.over_ask_rate.lower).toBe(0);
    expect(r.over_ask_rate.upper).toBe(1);
    expect(r.under_ask_rate.n).toBe(0);
    expect(r.ask_recoverability.n).toBe(0);
    expect(r.expected_classify_count).toBe(0);
    expect(r.expected_ask_count).toBe(0);
    expect(r.by_trigger).toEqual([]);
  });

  it('OVER-ASK: of GT-classify cases, the fraction the system ASKed', () => {
    // 4 GT-classify cases; 1 of them was (wrongly) asked → over-ask 1/4.
    const cases: RoutingSplitCase[] = [
      c({ actualRouting: 'classify' }),
      c({ actualRouting: 'classify' }),
      c({ actualRouting: 'ask', askTrigger: 'cross_subheading' }), // false ASK
      c({ actualRouting: 'classify' }),
    ];
    const r = routingSplitMetrics(cases);
    expect(r.expected_classify_count).toBe(4);
    expect(r.over_ask_rate.k).toBe(1);
    expect(r.over_ask_rate.n).toBe(4);
    expect(r.over_ask_rate.rate).toBeCloseTo(0.25, 10);
    // under-ask has no GT-ask case → 0/0.
    expect(r.under_ask_rate.n).toBe(0);
  });

  it('UNDER-ASK: of GT-ask cases, the fraction the system CLASSIFIED (missed ask)', () => {
    // 3 GT-ask cases; 2 were classified directly (missed ask) → under-ask 2/3.
    const cases: RoutingSplitCase[] = [
      c({ expectedRouting: 'ask', actualRouting: 'classify' }), // missed
      c({ expectedRouting: 'ask', actualRouting: 'classify' }), // missed
      c({ expectedRouting: 'ask', actualRouting: 'ask', askTrigger: 'triage' }), // correctly asked
    ];
    const r = routingSplitMetrics(cases);
    expect(r.expected_ask_count).toBe(3);
    expect(r.under_ask_rate.k).toBe(2);
    expect(r.under_ask_rate.n).toBe(3);
    expect(r.under_ask_rate.rate).toBeCloseTo(2 / 3, 10);
    // over-ask has no GT-classify case → 0/0.
    expect(r.over_ask_rate.n).toBe(0);
  });

  it('ASK-RECOVERABILITY: of simulated asks, the fraction recovered to gold', () => {
    // 3 cases carry a recovery attempt; 2 recovered correct → 2/3.
    const cases: RoutingSplitCase[] = [
      c({ expectedRouting: 'ask', actualRouting: 'ask', hasRecoveryAttempt: true, recoveredCorrect: true }),
      c({ expectedRouting: 'ask', actualRouting: 'ask', hasRecoveryAttempt: true, recoveredCorrect: true }),
      c({ expectedRouting: 'ask', actualRouting: 'ask', hasRecoveryAttempt: true, recoveredCorrect: false }),
      // a case with NO recovery attempt must NOT enter the recoverability denom.
      c({ expectedRouting: 'ask', actualRouting: 'ask' }),
    ];
    const r = routingSplitMetrics(cases);
    expect(r.ask_recoverability.k).toBe(2);
    expect(r.ask_recoverability.n).toBe(3); // the no-attempt case excluded
    expect(r.ask_recoverability.rate).toBeCloseTo(2 / 3, 10);
  });

  it('by_trigger slices over-ask by the FIRED lever (isolates cross_subheading)', () => {
    // 5 GT-classify cases; 2 over-asked by cross_subheading, 1 by sibling.
    const cases: RoutingSplitCase[] = [
      c({ actualRouting: 'ask', askTrigger: 'cross_subheading' }),
      c({ actualRouting: 'ask', askTrigger: 'cross_subheading' }),
      c({ actualRouting: 'ask', askTrigger: 'sibling' }),
      c({ actualRouting: 'classify' }),
      c({ actualRouting: 'classify' }),
    ];
    const r = routingSplitMetrics(cases);
    expect(r.over_ask_rate.k).toBe(3); // 3 total false asks of 5 classify
    expect(r.over_ask_rate.n).toBe(5);
    // Slice order is deterministic: triage, sibling, cross_subheading.
    const sibling = r.by_trigger.find((t) => t.trigger === 'sibling')!;
    const xsub = r.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    expect(sibling.over_ask.k).toBe(1);
    expect(sibling.over_ask.n).toBe(5); // shared classify denominator
    expect(xsub.over_ask.k).toBe(2);
    expect(xsub.over_ask.n).toBe(5);
    // No triage over-ask → triage slice absent.
    expect(r.by_trigger.find((t) => t.trigger === 'triage')).toBeUndefined();
  });

  it('an ASK without an explicit trigger is bucketed under "triage" by convention', () => {
    const cases: RoutingSplitCase[] = [
      c({ actualRouting: 'ask' }), // no askTrigger → triage bucket
      c({ actualRouting: 'classify' }),
    ];
    const r = routingSplitMetrics(cases);
    const triage = r.by_trigger.find((t) => t.trigger === 'triage')!;
    expect(triage).toBeDefined();
    expect(triage.over_ask.k).toBe(1);
    expect(triage.over_ask.n).toBe(2);
  });

  it('under-ask slice uses the gold expectedTrigger (missed asks have no fired lever)', () => {
    const cases: RoutingSplitCase[] = [
      // missed ask whose GT axis maps to cross_subheading.
      c({ expectedRouting: 'ask', actualRouting: 'classify', expectedTrigger: 'cross_subheading' }),
      // correctly-asked GT-cross_subheading case (in the slice denom, not numerator).
      c({ expectedRouting: 'ask', actualRouting: 'ask', askTrigger: 'cross_subheading', expectedTrigger: 'cross_subheading' }),
    ];
    const r = routingSplitMetrics(cases);
    const xsub = r.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    expect(xsub.under_ask.k).toBe(1); // one missed ask
    expect(xsub.under_ask.n).toBe(2); // both GT-ask cases mapping to this lever
    expect(xsub.under_ask.rate).toBeCloseTo(0.5, 10);
  });

  it('reject GT cases never contribute to over-ask or under-ask', () => {
    const cases: RoutingSplitCase[] = [
      c({ expectedRouting: 'reject', actualRouting: 'ask' }),     // not a classify → not over-ask
      c({ expectedRouting: 'reject', actualRouting: 'classify' }), // not an ask → not under-ask
    ];
    const r = routingSplitMetrics(cases);
    expect(r.expected_classify_count).toBe(0);
    expect(r.expected_ask_count).toBe(0);
    expect(r.over_ask_rate.n).toBe(0);
    expect(r.under_ask_rate.n).toBe(0);
  });

  it('mirrors the frozen-suite no-op: GT-classify-only population, no triggers → over-ask 0, empty slices', () => {
    const cases: RoutingSplitCase[] = [
      c({ actualRouting: 'classify' }),
      c({ actualRouting: 'classify' }),
      c({ actualRouting: 'classify' }),
    ];
    const r = routingSplitMetrics(cases);
    expect(r.over_ask_rate.k).toBe(0);
    expect(r.over_ask_rate.n).toBe(3);
    expect(r.under_ask_rate.n).toBe(0);
    expect(r.ask_recoverability.n).toBe(0);
    expect(r.by_trigger).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// askRateMetrics — ASK-RATE-PER-SLICE (Stage 3b: make OVER-asking visible)
// ---------------------------------------------------------------------------

describe('askRateMetrics', () => {
  const a = (over: Partial<AskRateCase> = {}): AskRateCase => ({
    expectedRouting: 'classify',
    actualRouting: 'classify',
    ...over,
  });

  it('empty population → every slice 0/0 with the full [0,1] interval, no crash', () => {
    const r = askRateMetrics([]);
    for (const slice of [r.should_not_ask, r.should_ask, r.should_reject, r.overall]) {
      expect(slice.ask_rate.n).toBe(0);
      expect(slice.ask_rate.rate).toBe(0);
      expect(slice.ask_rate.lower).toBe(0);
      expect(slice.ask_rate.upper).toBe(1);
      expect(slice.by_trigger).toEqual([]);
    }
  });

  it('OVER-ASK is directly visible: should_not_ask.ask_rate == over_ask_rate', () => {
    // 4 GT-classify cases; 1 over-asked → should_not_ask.ask_rate = 1/4.
    const cases: AskRateCase[] = [
      a({ actualRouting: 'classify' }),
      a({ actualRouting: 'classify' }),
      a({ actualRouting: 'ask', askTrigger: 'cross_subheading' }), // FALSE ask
      a({ actualRouting: 'classify' }),
    ];
    const ar = askRateMetrics(cases);
    expect(ar.should_not_ask.ask_rate.k).toBe(1);
    expect(ar.should_not_ask.ask_rate.n).toBe(4);
    expect(ar.should_not_ask.ask_rate.rate).toBeCloseTo(0.25, 10);
    // Cross-check the equivalence the whole metric exists to prove.
    const split = routingSplitMetrics(cases as RoutingSplitCase[]);
    expect(ar.should_not_ask.ask_rate.rate).toBeCloseTo(split.over_ask_rate.rate, 10);
    expect(ar.should_not_ask.ask_rate.k).toBe(split.over_ask_rate.k);
  });

  it('should_ask.ask_rate == 1 − under_ask_rate (the asker recall view)', () => {
    // 3 GT-ask cases; 2 correctly asked, 1 missed (classified) → ask_rate 2/3,
    // under-ask 1/3, and 2/3 == 1 − 1/3.
    const cases: AskRateCase[] = [
      a({ expectedRouting: 'ask', actualRouting: 'ask', askTrigger: 'triage' }),
      a({ expectedRouting: 'ask', actualRouting: 'ask', askTrigger: 'triage' }),
      a({ expectedRouting: 'ask', actualRouting: 'classify' }), // missed ask
    ];
    const ar = askRateMetrics(cases);
    expect(ar.should_ask.ask_rate.k).toBe(2);
    expect(ar.should_ask.ask_rate.n).toBe(3);
    expect(ar.should_ask.ask_rate.rate).toBeCloseTo(2 / 3, 10);
    const split = routingSplitMetrics(cases as RoutingSplitCase[]);
    expect(ar.should_ask.ask_rate.rate).toBeCloseTo(1 - split.under_ask_rate.rate, 10);
  });

  it('slices over-ask by the FIRED lever (isolates cross_subheading vs sibling)', () => {
    // 5 GT-classify; 2 over-asked by cross_subheading, 1 by sibling.
    const cases: AskRateCase[] = [
      a({ actualRouting: 'ask', askTrigger: 'cross_subheading' }),
      a({ actualRouting: 'ask', askTrigger: 'cross_subheading' }),
      a({ actualRouting: 'ask', askTrigger: 'sibling' }),
      a({ actualRouting: 'classify' }),
      a({ actualRouting: 'classify' }),
    ];
    const ar = askRateMetrics(cases);
    expect(ar.should_not_ask.ask_rate.k).toBe(3);
    expect(ar.should_not_ask.ask_rate.n).toBe(5);
    const xsub = ar.should_not_ask.by_trigger.find((t) => t.trigger === 'cross_subheading')!;
    const sibling = ar.should_not_ask.by_trigger.find((t) => t.trigger === 'sibling')!;
    expect(xsub.ask_rate.k).toBe(2);
    expect(xsub.ask_rate.n).toBe(5); // shared slice denominator
    expect(sibling.ask_rate.k).toBe(1);
    expect(sibling.ask_rate.n).toBe(5);
    // triage never fired in this slice → absent.
    expect(ar.should_not_ask.by_trigger.find((t) => t.trigger === 'triage')).toBeUndefined();
    // Deterministic slice order: triage(absent), sibling, cross_subheading.
    expect(ar.should_not_ask.by_trigger.map((t) => t.trigger)).toEqual([
      'sibling',
      'cross_subheading',
    ]);
  });

  it('an ASK with no explicit trigger is bucketed under "triage" by convention', () => {
    const cases: AskRateCase[] = [
      a({ actualRouting: 'ask' }), // no trigger → triage
      a({ actualRouting: 'classify' }),
    ];
    const ar = askRateMetrics(cases);
    const triage = ar.should_not_ask.by_trigger.find((t) => t.trigger === 'triage')!;
    expect(triage).toBeDefined();
    expect(triage.ask_rate.k).toBe(1);
    expect(triage.ask_rate.n).toBe(2);
  });

  it('overall slice is the raw unconditional ask volume across all GT classes', () => {
    const cases: AskRateCase[] = [
      a({ expectedRouting: 'classify', actualRouting: 'ask', askTrigger: 'triage' }),
      a({ expectedRouting: 'ask', actualRouting: 'ask', askTrigger: 'triage' }),
      a({ expectedRouting: 'classify', actualRouting: 'classify' }),
      a({ expectedRouting: 'reject', actualRouting: 'reject' }),
    ];
    const ar = askRateMetrics(cases);
    expect(ar.overall.ask_rate.k).toBe(2); // two asks total
    expect(ar.overall.ask_rate.n).toBe(4);
    expect(ar.overall.ask_rate.rate).toBeCloseTo(0.5, 10);
  });

  it('reject GT cases populate should_reject (reject→ask confusion is visible)', () => {
    const cases: AskRateCase[] = [
      a({ expectedRouting: 'reject', actualRouting: 'ask', askTrigger: 'triage' }),
      a({ expectedRouting: 'reject', actualRouting: 'reject' }),
    ];
    const ar = askRateMetrics(cases);
    expect(ar.should_reject.ask_rate.k).toBe(1);
    expect(ar.should_reject.ask_rate.n).toBe(2);
    expect(ar.should_reject.ask_rate.rate).toBeCloseTo(0.5, 10);
    // No GT-ask case here.
    expect(ar.should_ask.ask_rate.n).toBe(0);
  });

  it('no-op-safe frozen mirror: GT-classify-only, zero asks → should_not_ask 0/n, others 0/0', () => {
    const cases: AskRateCase[] = [
      a({ actualRouting: 'classify' }),
      a({ actualRouting: 'classify' }),
      a({ actualRouting: 'classify' }),
    ];
    const ar = askRateMetrics(cases);
    expect(ar.should_not_ask.ask_rate.k).toBe(0);
    expect(ar.should_not_ask.ask_rate.n).toBe(3); // real GT-classify denom
    expect(ar.should_not_ask.ask_rate.rate).toBe(0);
    expect(ar.should_not_ask.by_trigger).toEqual([]);
    expect(ar.should_ask.ask_rate.n).toBe(0); // 0/0 [0,1]
    expect(ar.should_ask.ask_rate.upper).toBe(1);
    expect(ar.should_reject.ask_rate.n).toBe(0);
    expect(ar.overall.ask_rate.k).toBe(0);
    expect(ar.overall.ask_rate.n).toBe(3);
  });
});

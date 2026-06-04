// backend/src/eval/metrics.ts
//
// Statistical primitives for the eval trust-spine (Phase-0). Pure, deterministic,
// dependency-free so each is unit-testable with hand-computed known values.
//
// FROZEN metric contract — see backend/docs/EVAL_DESIGN.md. Do NOT change a
// formula here without updating EVAL_DESIGN.md and the metric unit tests in the
// same commit; downstream gates depend on these numbers being stable.

/** 95% normal-approximation z-score (two-sided). */
export const Z_95 = 1.959963984540054;

/** A binomial rate with its sample counts and a two-sided confidence interval. */
export interface RateCI {
  /** Successes. */
  k: number;
  /** Trials. */
  n: number;
  /** Point estimate k/n (0 when n=0). */
  rate: number;
  /** Lower CI bound in [0,1]. */
  lower: number;
  /** Upper CI bound in [0,1]. */
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion (95% by default).
 *
 * Preferred over the normal (Wald) interval at small n and at p near 0/1 because
 * it never escapes [0,1] and has better coverage. `rate` is the raw k/n point
 * estimate; the [lower,upper] band is the Wilson interval (centered on the
 * shrinkage-adjusted estimate, NOT on rate).
 *
 * n=0 → rate 0 with the maximally-uninformative [0,1] interval.
 */
export function wilsonInterval(k: number, n: number, z: number = Z_95): RateCI {
  if (n <= 0) {
    return { k, n, rate: 0, lower: 0, upper: 1 };
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const lower = Math.max(0, center - margin);
  const upper = Math.min(1, center + margin);
  return { k, n, rate: p, lower, upper };
}

/** Result of a McNemar paired test over two per-case correct/wrong vectors. */
export interface McNemarResult {
  /** Paired population size. */
  n: number;
  /** Discordant pairs that went correct→wrong (regressions). */
  b: number;
  /** Discordant pairs that went wrong→correct (improvements). */
  c: number;
  /** Continuity-corrected chi-square statistic with 1 df. */
  statistic: number;
  /** Two-sided p-value. */
  pValue: number;
}

/**
 * McNemar paired test on two per-case correct/wrong vectors over the SAME
 * population (e.g. before-run vs after-run). Uses the exact binomial p-value on
 * the discordant pairs (robust at the small discordant counts typical here) and
 * the continuity-corrected chi-square statistic for reporting.
 *
 * Throws when the vectors differ in length — a paired test is only valid over an
 * aligned shared population.
 */
export function mcnemar(before: boolean[], after: boolean[]): McNemarResult {
  if (before.length !== after.length) {
    throw new Error(
      `mcnemar: vectors must be the same length (paired population); got ${before.length} vs ${after.length}`,
    );
  }
  const n = before.length;
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (before[i] && !after[i]) b++;
    else if (!before[i] && after[i]) c++;
  }

  const discordant = b + c;
  // Continuity-corrected chi-square (reported); df=1.
  const statistic = discordant === 0 ? 0 : Math.pow(Math.abs(b - c) - 1, 2) / discordant;

  // Exact two-sided binomial p-value on discordant pairs under H0: p=0.5.
  // P = 2 * sum_{i=0}^{min(b,c)} C(discordant, i) * 0.5^discordant, clamped at 1.
  let pValue: number;
  if (discordant === 0) {
    pValue = 1;
  } else {
    const lo = Math.min(b, c);
    let tail = 0;
    for (let i = 0; i <= lo; i++) {
      tail += binomialCoefficient(discordant, i);
    }
    pValue = Math.min(1, 2 * tail * Math.pow(0.5, discordant));
  }

  return { n, b, c, statistic, pValue };
}

/** Exact binomial coefficient C(n,k) via the multiplicative formula (no overflow at our scale). */
function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** A single (confidence, outcome) pair feeding calibration metrics. */
export interface CalibrationSample {
  /** Forecast probability in [0,1] that the prediction is correct. */
  confidence: number;
  /** Whether the prediction was actually correct. */
  correct: boolean;
}

/**
 * Brier score = mean squared error of the probability forecasts:
 *   (1/N) Σ (confidence_i − outcome_i)²,  outcome ∈ {0,1}.
 * Lower is better; 0 = perfect, 1 = maximally wrong. Empty → 0.
 */
export function brierScore(samples: CalibrationSample[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) {
    const outcome = s.correct ? 1 : 0;
    const diff = s.confidence - outcome;
    sum += diff * diff;
  }
  return sum / samples.length;
}

/** One equal-mass reliability bin. */
export interface ReliabilityBin {
  /** Samples in this bin. */
  count: number;
  /** Mean forecast confidence across the bin. */
  mean_confidence: number;
  /** Observed accuracy (fraction correct) across the bin. */
  accuracy: number;
  /** Lowest confidence in the bin (bin edge, inclusive). */
  conf_min: number;
  /** Highest confidence in the bin (bin edge, inclusive). */
  conf_max: number;
}

/** ECE result: the scalar plus its reliability bins (a directional diagnostic). */
export interface ECEResult {
  ece: number;
  bins: ReliabilityBin[];
}

/**
 * Expected Calibration Error with EQUAL-MASS bins (spec §2.4): sort by
 * confidence, split into ≤`maxBins` contiguous bins of ~equal sample count, and
 * weight each bin's |accuracy − mean_confidence| gap by its sample fraction.
 *
 * Equal-mass (not equal-width) binning avoids near-empty bins inflating ECE at
 * the small n / clustered-confidence regime this harness lives in. Empty input
 * → ECE 0, no bins.
 */
export function eceEqualMass(samples: CalibrationSample[], maxBins = 5): ECEResult {
  const n = samples.length;
  if (n === 0) return { ece: 0, bins: [] };

  const sorted = [...samples].sort((a, b) => a.confidence - b.confidence);
  const nBins = Math.max(1, Math.min(maxBins, n));
  const bins: ReliabilityBin[] = [];

  // Contiguous equal-mass partition: bin i covers indices [start, end).
  let ece = 0;
  for (let i = 0; i < nBins; i++) {
    const start = Math.floor((i * n) / nBins);
    const end = Math.floor(((i + 1) * n) / nBins);
    if (end <= start) continue;
    const slice = sorted.slice(start, end);
    const count = slice.length;
    const meanConf = slice.reduce((s, x) => s + x.confidence, 0) / count;
    const acc = slice.filter((x) => x.correct).length / count;
    bins.push({
      count,
      mean_confidence: meanConf,
      accuracy: acc,
      conf_min: slice[0]!.confidence,
      conf_max: slice[count - 1]!.confidence,
    });
    ece += (count / n) * Math.abs(acc - meanConf);
  }

  return { ece, bins };
}

/**
 * Bootstrap confidence interval for ECE (spec §2.4): resample the calibration
 * samples WITH replacement `resamples` times, recompute ECE each time, and take
 * the [2.5, 97.5] percentile band. The RNG is SEEDED so a given input yields a
 * deterministic interval across runs (gate reproducibility).
 */
export interface BootstrapCI {
  /** Point ECE on the full sample. */
  point: number;
  lower: number;
  upper: number;
  resamples: number;
}

export function bootstrapECE(
  samples: CalibrationSample[],
  maxBins = 5,
  resamples = 1000,
  seed = 0xc0ffee,
): BootstrapCI {
  const point = eceEqualMass(samples, maxBins).ece;
  const n = samples.length;
  if (n === 0) return { point: 0, lower: 0, upper: 0, resamples };

  const rng = mulberry32(seed);
  const estimates: number[] = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    const draw: CalibrationSample[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      draw[i] = samples[idx]!;
    }
    estimates[r] = eceEqualMass(draw, maxBins).ece;
  }
  estimates.sort((a, b) => a - b);
  return {
    point,
    lower: percentileSorted(estimates, 2.5),
    upper: percentileSorted(estimates, 97.5),
    resamples,
  };
}

/** Deterministic seeded PRNG (mulberry32) — same seed → same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nearest-rank percentile (p in [0,100]) over an UNSORTED array. Sorts a copy
 * internally. Empty → 0.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return percentileSorted(sorted, p);
}

/** Nearest-rank percentile over an already-sorted ascending array. */
function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

/** Arithmetic mean; empty → 0. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

/**
 * One gold case's top-k input: the gold 8-digit code and the ranked list of
 * candidate codes the classifier considered (selected first). Both sides are
 * passed in their RAW dotted form; this scorer normalizes internally so callers
 * need not pre-strip dots.
 */
export interface TopKCase {
  /** Gold 8-digit code (dotted, e.g. "8708.30.00"). */
  goldCode: string;
  /**
   * Ranked candidate codes the classifier surfaced (selected first, then
   * alternatives in the model's ranking order). Empty when the system did not
   * deliver a classification (ASK/REFUSE/error) — that case is a top-k miss.
   */
  candidateCodes: string[];
}

/** Strip dots/whitespace so "8708.30.00" and "87083000" compare equal. */
function stripCode(code: string): string {
  return code.replace(/\./g, '').replace(/\s/g, '');
}

/* ============================================================================
 * OVER-ASK / UNDER-ASK split metrics (CALIBRATED-ASK-EVAL-PLAN.md §2)
 *
 * Pure + deterministic, like every other primitive here so it is unit-testable
 * with hand-computed values. The runner folds per-case EvalDetail rows into the
 * `RoutingSplitCase` shape below and calls `routingSplitMetrics`; the report just
 * carries the result. NO behavior change to the classifier — these read the
 * already-recorded ground-truth routing + the system's actual routing.
 * ============================================================================ */

/** Lever vocabulary for the trigger slice (mirrors ClarifyingQuestion.trigger). */
export type AskTrigger = 'triage' | 'sibling' | 'cross_subheading';

/** Default trigger bucket for an ASK with no explicit lever (the live L1 ask). */
export const DEFAULT_ASK_TRIGGER: AskTrigger = 'triage';

/** Minimal per-case input the split metrics need (folded from an EvalDetail). */
export interface RoutingSplitCase {
  /** Ground-truth routing label for the case (from EvalTestCase.expected_routing). */
  expectedRouting: 'classify' | 'ask' | 'reject';
  /** What the system actually did ('classify' | 'ask' | 'reject' | 'error' | …). */
  actualRouting: string;
  /**
   * Which lever raised the question when the system ASKed (from the v2
   * `question.trigger`). Undefined on a non-ASK case, OR on an ASK whose question
   * carried no trigger — the latter is bucketed under {@link DEFAULT_ASK_TRIGGER}.
   */
  askTrigger?: AskTrigger;
  /**
   * GT axis→lever mapping for an UNDER-ASK case (a missed ask has no fired
   * trigger, so it cannot be sliced by `askTrigger`). When the gold case declares
   * which lever SHOULD have fired, pass it here so the under-ask slice is
   * attributable; else the case is aggregated under {@link DEFAULT_ASK_TRIGGER}.
   */
  expectedTrigger?: AskTrigger;
  /**
   * Whether this case carries a simulated ASK-recovery attempt (only set when
   * `--simulate-answers` ran AND the system ASKed AND a gold answer existed).
   * Undefined/false → the case does not enter the recoverability denominator.
   */
  hasRecoveryAttempt?: boolean;
  /** When `hasRecoveryAttempt`, did the recovery reach the correct gold code? */
  recoveredCorrect?: boolean;
}

/** The over-ask / under-ask / recoverability result over a population + slices. */
export interface RoutingSplitResult {
  over_ask_rate: RateCI;
  under_ask_rate: RateCI;
  ask_recoverability: RateCI;
  expected_classify_count: number;
  expected_ask_count: number;
  by_trigger: Array<{
    trigger: AskTrigger;
    over_ask: RateCI;
    under_ask: RateCI;
    ask_recoverability: RateCI;
  }>;
}

/** True iff the system delivered a question (a false/real ASK). */
function isActualAsk(actualRouting: string): boolean {
  return actualRouting === 'ask';
}

/** True iff the system delivered a classification. */
function isActualClassify(actualRouting: string): boolean {
  return actualRouting === 'classify';
}

/**
 * OVER-ASK / UNDER-ASK / ASK-RECOVERABILITY split metrics
 * (CALIBRATED-ASK-EVAL-PLAN.md §2). Pure + deterministic.
 *
 *  - over_ask_rate  = |expected=classify ∧ actual=ask|  / |expected=classify|.
 *      A FALSE ask (the system asked when it should have classified). The metric
 *      that catches a repeat of the prior 33% over-fire.
 *  - under_ask_rate = |expected=ask ∧ actual=classify| / |expected=ask|.
 *      A MISSED ask (the system guessed a code when it should have asked) — the
 *      bug class the RDC-X / cross-subheading lever exists to drive toward 0.
 *  - ask_recoverability = |recoveryAttempt ∧ recoveredCorrect| / |recoveryAttempt|.
 *      Of the asks we DID make (and simulated), the fraction reaching the gold
 *      code after the gold answer — "the questions we ask must be answerable".
 *
 * Each is a {@link RateCI} (Wilson 95% CI). NO-OP SAFETY: an empty population, or
 * a population with no labeled classify/ask cases, yields rate 0 over n=0 with the
 * full [0,1] interval — never a throw, never a NaN — so the existing 385-case run
 * (which carries no `ask`-routing gold cases for under-ask, etc.) is unaffected.
 *
 * SLICING: `by_trigger` partitions each rate by lever. The OVER-ASK slice uses the
 * FIRED `askTrigger` (which lever actually over-asked); the UNDER-ASK slice uses
 * the gold `expectedTrigger` (a missed ask has no fired trigger). Triggers with no
 * contributing case are omitted, so a frozen run yields `by_trigger: []`.
 */
export function routingSplitMetrics(cases: RoutingSplitCase[]): RoutingSplitResult {
  const expectedClassify = cases.filter((c) => c.expectedRouting === 'classify');
  const expectedAsk = cases.filter((c) => c.expectedRouting === 'ask');

  // OVER-ASK: of GT-classify cases, the system ASKed.
  const overAskHits = expectedClassify.filter((c) => isActualAsk(c.actualRouting));
  // UNDER-ASK: of GT-ask cases, the system CLASSIFIED.
  const underAskHits = expectedAsk.filter((c) => isActualClassify(c.actualRouting));

  // RECOVERABILITY: of cases carrying a simulated recovery attempt, recovered ok.
  const recoveryCases = cases.filter((c) => c.hasRecoveryAttempt === true);
  const recoveredCorrect = recoveryCases.filter((c) => c.recoveredCorrect === true);

  // Per-trigger slices. Collect every trigger that appears in either an over-ask
  // (fired askTrigger), an under-ask (gold expectedTrigger), or a recovery case.
  const triggers = new Set<AskTrigger>();
  for (const c of overAskHits) triggers.add(c.askTrigger ?? DEFAULT_ASK_TRIGGER);
  for (const c of underAskHits) triggers.add(c.expectedTrigger ?? DEFAULT_ASK_TRIGGER);
  for (const c of recoveryCases) triggers.add(c.askTrigger ?? DEFAULT_ASK_TRIGGER);

  // Deterministic slice order.
  const TRIGGER_ORDER: AskTrigger[] = ['triage', 'sibling', 'cross_subheading'];
  const by_trigger = TRIGGER_ORDER.filter((t) => triggers.has(t)).map((t) => {
    // OVER-ASK slice: over-asked cases whose FIRED lever is t, over GT-classify
    // cases (same denominator — the over-ask population is shared, the numerator
    // is restricted to this lever's false asks).
    const overK = overAskHits.filter((c) => (c.askTrigger ?? DEFAULT_ASK_TRIGGER) === t).length;
    // UNDER-ASK slice: missed asks whose GT axis maps to lever t, over GT-ask
    // cases whose GT axis maps to t (so the slice rate is meaningful per lever).
    const underDenomCases = expectedAsk.filter(
      (c) => (c.expectedTrigger ?? DEFAULT_ASK_TRIGGER) === t,
    );
    const underK = underDenomCases.filter((c) => isActualClassify(c.actualRouting)).length;
    // RECOVERABILITY slice: this lever's fired+simulated asks.
    const recCases = recoveryCases.filter((c) => (c.askTrigger ?? DEFAULT_ASK_TRIGGER) === t);
    const recK = recCases.filter((c) => c.recoveredCorrect === true).length;
    return {
      trigger: t,
      over_ask: wilsonInterval(overK, expectedClassify.length),
      under_ask: wilsonInterval(underK, underDenomCases.length),
      ask_recoverability: wilsonInterval(recK, recCases.length),
    };
  });

  return {
    over_ask_rate: wilsonInterval(overAskHits.length, expectedClassify.length),
    under_ask_rate: wilsonInterval(underAskHits.length, expectedAsk.length),
    ask_recoverability: wilsonInterval(recoveredCorrect.length, recoveryCases.length),
    expected_classify_count: expectedClassify.length,
    expected_ask_count: expectedAsk.length,
    by_trigger,
  };
}

/**
 * top-k code accuracy over a frozen population: the fraction of cases whose gold
 * code appears among the FIRST `k` candidate codes (selected + alternatives).
 *
 * The denominator is `cases.length` (the caller passes the FROZEN gold-code
 * population — every non-error gold case, including ASK/REFUSE cases which carry
 * an empty `candidateCodes` and so are misses). Returns a {@link RateCI} so the
 * report carries a Wilson 95% CI exactly like the other accuracy numbers.
 *
 * Pure + deterministic: comparison is dot-insensitive (normalized internally),
 * the first `k` candidates only are inspected, and `k<=0` yields 0 hits.
 */
export function topKCodeAccuracy(cases: TopKCase[], k: number): RateCI {
  const n = cases.length;
  if (n === 0) return wilsonInterval(0, 0);
  let hits = 0;
  if (k > 0) {
    for (const c of cases) {
      const goldNorm = stripCode(c.goldCode);
      const found = c.candidateCodes
        .slice(0, k)
        .some((code) => stripCode(code) === goldNorm);
      if (found) hits++;
    }
  }
  return wilsonInterval(hits, n);
}

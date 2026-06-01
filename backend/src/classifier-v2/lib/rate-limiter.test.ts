/**
 * Unit tests for the proactive Gemini token-bucket rate limiter.
 *
 * Fully deterministic: a manual clock + a sleep stub that ADVANCES that clock are
 * injected, so nothing actually waits and timings are asserted exactly. No network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  parseRpmEnv,
  GEMINI_RPM_ENV,
  type SleepFn,
} from './rate-limiter';

/**
 * A deterministic clock whose `sleep` advances time instantly (no real wait) and
 * records every requested wait. This mirrors the bucket's continuous refill: when
 * the limiter sleeps `waitMs`, the clock jumps `waitMs` and the bucket refills.
 */
function makeFakeClock(start = 0): {
  now: () => number;
  sleep: SleepFn;
  waits: number[];
  advance: (ms: number) => void;
} {
  let t = start;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    waits,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('parseRpmEnv', () => {
  it('returns the positive number for a valid value', () => {
    expect(parseRpmEnv('5')).toBe(5);
    expect(parseRpmEnv(' 5 ')).toBe(5);
    expect(parseRpmEnv('2.5')).toBe(2.5);
  });

  it('returns null for unset / blank / non-numeric / <=0 / non-finite', () => {
    expect(parseRpmEnv(undefined)).toBeNull();
    expect(parseRpmEnv('')).toBeNull();
    expect(parseRpmEnv('   ')).toBeNull();
    expect(parseRpmEnv('abc')).toBeNull();
    expect(parseRpmEnv('0')).toBeNull();
    expect(parseRpmEnv('-3')).toBeNull();
    expect(parseRpmEnv('Infinity')).toBeNull();
    expect(parseRpmEnv('NaN')).toBeNull();
  });
});

describe('RateLimiter — unlimited (no-op)', () => {
  it('N rapid acquires all resolve immediately with zero delay (rpm null)', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: null, now: clock.now, sleep: clock.sleep });
    expect(limiter.isNoop).toBe(true);
    expect(limiter.effectiveRpm).toBeNull();

    for (let i = 0; i < 50; i++) {
      await limiter.acquire();
    }
    // No sleeps at all — byte-identical to today.
    expect(clock.waits).toEqual([]);
    expect(clock.now()).toBe(0);
  });

  it('treats rpm <= 0 as no-op', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 0, now: clock.now, sleep: clock.sleep });
    expect(limiter.isNoop).toBe(true);
    await limiter.acquire();
    expect(clock.waits).toEqual([]);
  });
});

describe('RateLimiter — GEMINI_RPM=5', () => {
  it('first 5 acquires are immediate; the 6th waits 60000/5 = 12000ms', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 5, now: clock.now, sleep: clock.sleep });
    expect(limiter.isNoop).toBe(false);
    expect(limiter.effectiveRpm).toBe(5);

    // Start full → 5 tokens available as a burst (a single 4-call classification
    // runs at full speed; the 5th still fits the idle-window burst).
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    expect(clock.waits).toEqual([]);

    // 6th: bucket empty, no time elapsed → must wait one refill interval = 12000ms.
    await limiter.acquire();
    expect(clock.waits).toEqual([12000]);
    expect(clock.now()).toBe(12000);
  });

  it('continuous refill: advancing the clock frees tokens (no wait when enough elapsed)', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 5, now: clock.now, sleep: clock.sleep });

    // Drain the initial 5.
    for (let i = 0; i < 5; i++) await limiter.acquire();
    expect(clock.waits).toEqual([]);

    // Advance 24000ms = 2 refill intervals (12000ms each) → 2 tokens regenerated.
    clock.advance(24000);
    await limiter.acquire();
    await limiter.acquire();
    // Both consumed from refilled tokens → no sleep.
    expect(clock.waits).toEqual([]);

    // 3rd now: bucket empty again → waits exactly one interval.
    await limiter.acquire();
    expect(clock.waits).toEqual([12000]);
  });

  it('sustained load settles to one call per 12000ms after the initial burst', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 5, now: clock.now, sleep: clock.sleep });

    // 5 burst (immediate) then 3 paced.
    for (let i = 0; i < 5; i++) await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.waits).toEqual([12000, 12000, 12000]);
  });
});

describe('RateLimiter — concurrency safety (RPM=5)', () => {
  it('10 simultaneous acquires: 5 immediate, the rest spaced by the refill interval, none double-spend', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 5, now: clock.now, sleep: clock.sleep });

    // The deterministic, race-free signal of pacing + no-double-spend is the
    // sequence of sleeps the limiter performs while it serializes the 10 callers.
    // The 5 initial burst tokens consume with NO sleep; the remaining 5 each wait
    // exactly one refill interval (60000/5 = 12000ms). (We do NOT assert on
    // wall-clock-at-`.then()` because the fake clock is advanced synchronously by
    // a later iteration's sleep before an earlier `.then` microtask reads it —
    // that would measure scheduling order, not the limiter's behavior.)
    const acquires = Array.from({ length: 10 }, () => limiter.acquire());
    await Promise.all(acquires);

    // Exactly 5 paced waits (the 6th..10th callers), each one interval —
    // proving the 5 burst tokens were each spent exactly once (no double-spend:
    // 6 immediate resolves would mean a token was double-counted).
    expect(clock.waits).toEqual([12000, 12000, 12000, 12000, 12000]);
    // Total elapsed = 5 intervals.
    expect(clock.now()).toBe(60000);
  });

  it('the FIRST 5 of 10 overlapping acquires incur no wait; pacing starts at the 6th', async () => {
    const clock = makeFakeClock();
    // Wrap sleep to record the clock time AT each wait. The Nth recorded wait time
    // is the clock value when the (5+N)th caller began pacing — deterministic and
    // free of `.then()` microtask-ordering hazards.
    const waitAtTimes: number[] = [];
    const recordingSleep: SleepFn = async (ms: number) => {
      waitAtTimes.push(clock.now());
      await clock.sleep(ms);
    };
    const limiter = new RateLimiter({ rpm: 5, now: clock.now, sleep: recordingSleep });

    const acquires = Array.from({ length: 10 }, () => limiter.acquire());
    await Promise.all(acquires);

    // 5 waits total (callers 6..10) → 5 burst tokens were each spent exactly once.
    expect(waitAtTimes).toHaveLength(5);
    // Caller 6 begins pacing at t=0 (bucket drained, no time elapsed yet); each
    // subsequent paced caller begins one interval later as the clock advances.
    expect(waitAtTimes).toEqual([0, 12000, 24000, 36000, 48000]);
  });

  it('serializes overlapping acquires in arrival order', async () => {
    const clock = makeFakeClock();
    const limiter = new RateLimiter({ rpm: 1, now: clock.now, sleep: clock.sleep });

    const order: number[] = [];
    const a = limiter.acquire().then(() => order.push(1)); // burst token (t=0)
    const b = limiter.acquire().then(() => order.push(2)); // waits 60000ms
    const c = limiter.acquire().then(() => order.push(3)); // waits another 60000ms
    await Promise.all([a, b, c]);

    expect(order).toEqual([1, 2, 3]);
    // rpm=1 → interval is 60000ms; two paced waits.
    expect(clock.waits).toEqual([60000, 60000]);
  });
});

describe('getRateLimiter / resetRateLimiter singleton', () => {
  const original = process.env[GEMINI_RPM_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[GEMINI_RPM_ENV];
    else process.env[GEMINI_RPM_ENV] = original;
    resetRateLimiter();
  });

  it('reads GEMINI_RPM once and returns a no-op limiter when unset', () => {
    delete process.env[GEMINI_RPM_ENV];
    resetRateLimiter();
    const l = getRateLimiter();
    expect(l.isNoop).toBe(true);
    // Same instance on subsequent calls (shared bucket).
    expect(getRateLimiter()).toBe(l);
  });

  it('engages pacing when GEMINI_RPM is set', () => {
    process.env[GEMINI_RPM_ENV] = '5';
    resetRateLimiter();
    const l = getRateLimiter();
    expect(l.isNoop).toBe(false);
    expect(l.effectiveRpm).toBe(5);
  });

  it('resetRateLimiter(override) installs a specific instance', () => {
    const clock = makeFakeClock();
    const injected = new RateLimiter({ rpm: 5, now: clock.now, sleep: clock.sleep });
    resetRateLimiter(injected);
    expect(getRateLimiter()).toBe(injected);
  });

  it('reset() with no arg forces a re-read of the env on next get', () => {
    process.env[GEMINI_RPM_ENV] = '5';
    resetRateLimiter();
    expect(getRateLimiter().effectiveRpm).toBe(5);

    delete process.env[GEMINI_RPM_ENV];
    resetRateLimiter();
    expect(getRateLimiter().isNoop).toBe(true);
  });
});

// Sanity: the default sleep really exists and resolves (we never call it in the
// timing tests, but assert the seam is wired so the production path is sound).
describe('RateLimiter — default sleep is wired', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a real timer-backed sleep when none is injected', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ rpm: 1 });
    // Drain the single burst token.
    await limiter.acquire();
    // Next acquire must wait 60000ms via the default (timer-backed) sleep.
    const p = limiter.acquire();
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(59999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(resolved).toBe(true);
  });
});

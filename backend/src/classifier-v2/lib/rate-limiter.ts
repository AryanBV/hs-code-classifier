/**
 * Proactive token-bucket rate limiter for the single Gemini `generateContent`
 * facade (Phase B core; also unblocks free-tier evals).
 *
 * WHY THIS EXISTS — beat the free-tier RPM cap PROACTIVELY.
 * The free-tier `gemini-3.5-flash` quota is 5 `generateContent` requests per
 * minute (a per-project-per-model rolling window). One classification fires ~4
 * Flash `generateContent` calls (L1 triage + L2 reranker + L4 select + optional
 * repair), so a SINGLE classification (4 < 5) must run at full speed, while
 * back-to-back load (eval, concurrent requests) must be PACED to RPM/min so the
 * API's cap is never exceeded. Reactive retry alone (see `retry-backoff.ts`)
 * cannot beat the cap under load — retries are themselves requests and compound
 * the overage. The reactive retry STAYS as the safety net; this is the proactive
 * gate in front of it.
 *
 * EMBEDDINGS ARE NOT PACED HERE. `gemini-embedding-001` is a SEPARATE quota; this
 * limiter is wired ONLY into the `generateContent` facade, never the embedding
 * path.
 *
 * SEMANTICS — continuous-refill token bucket:
 *   - capacity = RPM tokens (a full minute's worth available as a burst);
 *   - refill   = RPM / 60000 tokens per millisecond, applied continuously;
 *   - acquire(): consume a token immediately if one is available; otherwise WAIT
 *     (await sleep) exactly long enough for the bucket to refill to one token,
 *     then consume it. This models a rolling-window cap: the first `capacity`
 *     calls in an idle window go through instantly, and sustained load settles to
 *     one call per (60000 / RPM) ms.
 *
 * CONCURRENCY-SAFE. Overlapping callers (the pipeline + eval fire interleaved
 * `generateContent` calls) are SERIALIZED through an internal promise chain so two
 * callers can never double-spend the same token. Each `acquire()` links onto the
 * tail of the chain, does its (possibly waiting) bucket accounting, then releases
 * the next waiter. The token math itself runs strictly one-at-a-time.
 *
 * NO-OP WHEN UNLIMITED. `GEMINI_RPM` must be a positive finite number to engage
 * pacing. Unset / <=0 / non-numeric → the limiter is a NO-OP: `acquire()` resolves
 * immediately with zero delay, so paid/unlimited runs and unit tests stay fast and
 * behavior is byte-identical to today.
 *
 * INJECTABLE CLOCK + SLEEP. Mirrors `retry-backoff.ts`: `now()` and `sleep` are
 * injectable so tests are fully deterministic with NO real waiting.
 */

/** Env var that sets the requests-per-minute cap. Unset/invalid/<=0 → no-op. */
export const GEMINI_RPM_ENV = 'GEMINI_RPM';

/** Injectable clock: current time in ms. Defaults to `Date.now`. */
export type NowFn = () => number;

/** Injectable sleep: resolve after `ms` ms. Defaults to a real `setTimeout`. */
export type SleepFn = (ms: number) => Promise<void>;

/** Real sleep used by default; tests inject a fake so nothing actually waits. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse `GEMINI_RPM` into a positive finite RPM, or `null` (→ no-op limiter).
 * Accepts fractional values (e.g. "2.5"); rejects unset/blank/NaN/Infinity/<=0.
 */
export function parseRpmEnv(raw: string | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export interface RateLimiterOptions {
  /** Requests per minute. `null`/`undefined` (or <=0) → NO-OP limiter. */
  rpm: number | null;
  /** Injectable clock (ms). Defaults to `Date.now`. */
  now?: NowFn;
  /** Injectable sleep. Defaults to `defaultSleep`. */
  sleep?: SleepFn;
}

/**
 * Continuous-refill token bucket. Concurrency-safe via an internal promise chain.
 *
 * When `rpm` is `null`/<=0 the limiter is a no-op: `acquire()` resolves immediately
 * and never sleeps (no chaining, zero overhead).
 */
export class RateLimiter {
  private readonly rpm: number | null;
  private readonly capacity: number;
  /** Tokens added per millisecond (rpm / 60000). 0 when no-op. */
  private readonly refillPerMs: number;
  private readonly now: NowFn;
  private readonly sleep: SleepFn;

  /** Current token count (0..capacity). Mutated only inside the serialized chain. */
  private tokens: number;
  /** Timestamp (ms) the bucket was last refilled. */
  private lastRefill: number;
  /** Tail of the serialization chain; each acquire awaits the previous one. */
  private tail: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    const rpm = opts.rpm !== null && opts.rpm !== undefined && opts.rpm > 0 ? opts.rpm : null;
    this.rpm = rpm;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;

    if (rpm === null) {
      // No-op configuration.
      this.capacity = 0;
      this.refillPerMs = 0;
      this.tokens = 0;
      this.lastRefill = 0;
    } else {
      this.capacity = rpm;
      this.refillPerMs = rpm / 60000;
      // Start full: an idle window allows a `capacity`-sized burst.
      this.tokens = rpm;
      this.lastRefill = this.now();
    }
  }

  /** True when no pacing is applied (GEMINI_RPM unset/invalid/<=0). */
  get isNoop(): boolean {
    return this.rpm === null;
  }

  /** Effective requests-per-minute, or `null` when no-op. */
  get effectiveRpm(): number | null {
    return this.rpm;
  }

  /**
   * Acquire one token. Resolves immediately if a token is available; otherwise
   * waits (await sleep) until the bucket refills to one token, then consumes it.
   *
   * Concurrency-safe: serialized through the internal promise chain so two callers
   * never double-spend. No-op path short-circuits (resolves immediately, no chain).
   */
  async acquire(): Promise<void> {
    if (this.rpm === null) {
      // Byte-identical to today: no token math, no chaining, no delay.
      return;
    }

    // Link onto the chain tail so token accounting is strictly one-at-a-time.
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await prior;
      await this.consumeOne();
    } finally {
      // Hand off to the next waiter regardless of outcome.
      release();
    }
  }

  /**
   * Refill based on elapsed time, then consume exactly one token — sleeping first
   * if the bucket is short. Runs only inside the serialized chain (single-flight),
   * so the read-modify-write of `tokens` is race-free.
   */
  private async consumeOne(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      // Wait precisely long enough for the bucket to reach one token.
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil(deficit / this.refillPerMs);
      await this.sleep(waitMs);
      this.refill();
      // Clamp: after waiting we have at least one token; floating-point slack only.
      if (this.tokens < 1) this.tokens = 1;
    }
    this.tokens -= 1;
  }

  /** Add tokens for elapsed wall-clock time, capped at capacity. */
  private refill(): void {
    const nowMs = this.now();
    const elapsed = nowMs - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
      this.lastRefill = nowMs;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Module singleton — single source of truth for the active limiter.
 * --------------------------------------------------------------------------- */

let singleton: RateLimiter | null = null;

/**
 * Resolve the process-wide rate limiter, reading `GEMINI_RPM` ONCE on first use.
 * Subsequent calls return the same instance (so the token bucket is shared across
 * every `generateContent` call site, which is what makes the per-minute cap hold).
 *
 * Use `resetRateLimiter()` (test seam) to drop the singleton, or pass `override`
 * to inject a deterministic limiter (clock/sleep) for tests.
 */
export function getRateLimiter(): RateLimiter {
  if (singleton === null) {
    singleton = new RateLimiter({ rpm: parseRpmEnv(process.env[GEMINI_RPM_ENV]) });
  }
  return singleton;
}

/**
 * Test seam: drop the cached singleton (and optionally install a specific
 * instance, e.g. one with an injected clock/sleep). Pass nothing to force the next
 * `getRateLimiter()` to re-read `GEMINI_RPM` from the env.
 */
export function resetRateLimiter(override?: RateLimiter): void {
  singleton = override ?? null;
}

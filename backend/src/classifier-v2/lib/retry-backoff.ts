/**
 * Shared retry-backoff helpers for the Gemini Developer API clients
 * (`gemini-developer-client.ts` + `gemini-developer-embed.ts`).
 *
 * WHY THIS EXISTS — rate-limit-aware backoff.
 * The free-tier `gemini-3.5-flash` quota is 5 requests/minute. When it is
 * exceeded the API returns HTTP 429 RESOURCE_EXHAUSTED with a SERVER-REQUESTED
 * retry delay of ~8-18s, carried two ways inside the thrown `ApiError`:
 *   - structured: `error.details[]` has an entry whose `@type` contains
 *     `RetryInfo`, with a `retryDelay` Duration string like `"8s"` /
 *     `"8.846031711s"`;
 *   - prose: the `error.message` text says `"... Please retry in 8.846031711s ..."`.
 * The `@google/genai` SDK throws `ApiError` whose `message` is
 * `JSON.stringify(errorBody)` (verified in the installed SDK's
 * `throwErrorIfNotOK`), so BOTH the structured details and the prose live inside
 * `err.message`. We parse defensively from both and take the MAX.
 *
 * The previous exponential backoff (≈≤2s over 3 attempts) re-hit the quota well
 * inside the 8s window, so every retry failed. Honoring the server delay lets a
 * throttled call actually clear.
 *
 * Non-429 transients (503 UNAVAILABLE, network ECONNRESET/…): KEEP the fast
 * exponential backoff — those are not rate-limits and should retry quickly.
 *
 * `sleep` is exported as a module-level binding so tests can `vi.spyOn` it (and
 * read the requested wait) without actually waiting; the clients call it via the
 * module namespace import so the spy is observed.
 */

/** Max single rate-limit wait (ms). Env-overridable via GEMINI_MAX_RETRY_WAIT_MS. */
export const DEFAULT_GEMINI_MAX_RETRY_WAIT_MS = 30000;

/** Total wait budget across all 429 sleeps (ms). Env-overridable via GEMINI_MAX_TOTAL_RETRY_WAIT_MS. */
export const DEFAULT_GEMINI_MAX_TOTAL_RETRY_WAIT_MS = 60000;

/** Attempt budget for a 429 (rate-limit) — higher so a throttled call can clear. */
export const GEMINI_RATE_LIMIT_MAX_ATTEMPTS = 5;

/** Attempt budget for other transients (503 / network) — keep the original ~3. */
export const GEMINI_TRANSIENT_MAX_ATTEMPTS = 3;

/** Small additive jitter (ms) on top of a server-requested rate-limit wait. */
export const GEMINI_RETRY_JITTER_MS = 250;

/** Read a positive-integer ms env override, falling back to `fallback`. */
function readMsEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** Resolved single-wait cap (ms), honoring GEMINI_MAX_RETRY_WAIT_MS at call time. */
export function maxRetryWaitMs(): number {
  return readMsEnv('GEMINI_MAX_RETRY_WAIT_MS', DEFAULT_GEMINI_MAX_RETRY_WAIT_MS);
}

/** Resolved total-budget cap (ms), honoring GEMINI_MAX_TOTAL_RETRY_WAIT_MS at call time. */
export function maxTotalRetryWaitMs(): number {
  return readMsEnv('GEMINI_MAX_TOTAL_RETRY_WAIT_MS', DEFAULT_GEMINI_MAX_TOTAL_RETRY_WAIT_MS);
}

/** Parse a `RetryInfo.retryDelay` Duration string ("8s" / "8.846031711s") → ms, or null. */
function parseDurationSecondsToMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = /^([0-9]*\.?[0-9]+)s$/.exec(trimmed);
  if (match === null) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

/** Walk an arbitrary `details[]` array for a RetryInfo entry's `retryDelay` → ms. */
function parseRetryDelayFromDetails(details: unknown): number | null {
  if (!Array.isArray(details)) return null;
  let best: number | null = null;
  for (const entry of details) {
    if (entry === null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const type = rec['@type'];
    if (typeof type !== 'string' || !type.includes('RetryInfo')) continue;
    const ms = parseDurationSecondsToMs(rec['retryDelay']);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best;
}

/**
 * Extract the server-requested retry delay (ms) from a thrown error, DEFENSIVELY,
 * from BOTH the structured `error.details[]` RetryInfo AND a regex on the message
 * prose, returning the MAX found. Returns null when nothing is parseable (caller
 * then falls back to exponential backoff).
 *
 * The error's `message` is the JSON-stringified error body (per the @google/genai
 * SDK), so we parse it as JSON for the structured path; if that fails we still run
 * the regex over the raw text.
 */
export function parseRetryDelayMs(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const message = (err as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';

  const candidates: number[] = [];

  // (1) Structured details[]. The body may sit at the top level or under `error`.
  if (text.length > 0) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === 'object') {
        const root = parsed as Record<string, unknown>;
        const errObj = root['error'];
        const detailsCandidates: unknown[] = [
          root['details'],
          errObj !== null && typeof errObj === 'object'
            ? (errObj as Record<string, unknown>)['details']
            : undefined,
        ];
        for (const details of detailsCandidates) {
          const ms = parseRetryDelayFromDetails(details);
          if (ms !== null) candidates.push(ms);
        }
      }
    } catch {
      // message wasn't JSON — fine, the regex path below still applies.
    }
  }

  // (2) Regex fallback on the prose: "... Please retry in 8.846031711s ...".
  const m = /retry in ([0-9]*\.?[0-9]+)s/i.exec(text);
  if (m !== null) {
    const seconds = Number(m[1]);
    if (Number.isFinite(seconds) && seconds >= 0) candidates.push(Math.round(seconds * 1000));
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/** Fast exponential backoff (ms) for non-rate-limit transients (503 / network). */
export function exponentialBackoffMs(attempt: number): number {
  return 2 ** attempt * 500 + Math.floor(Math.random() * 200);
}

/**
 * Module-level sleep, referenced via `import * as backoff` so tests can
 * `vi.spyOn(backoff, 'sleep')` and read/short-circuit the requested wait.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Is this error a rate-limit (HTTP 429 RESOURCE_EXHAUSTED)? */
export function isRateLimitError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as { status?: unknown; response?: { status?: unknown } };
  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof e.response?.status === 'number'
        ? e.response.status
        : undefined;
  return status === 429;
}

/**
 * Stateful per-call retry controller shared by both Gemini Developer clients.
 *
 * It gives a 429 (rate-limit) a higher attempt budget and a server-requested
 * wait (capped per-wait and by a total budget), while 503/network transients
 * keep the original fast exponential backoff and the original ~3-attempt budget.
 * The two error classes have independent attempt counters so a mixed sequence
 * (e.g. one 503 then sustained 429) is bounded sensibly.
 *
 * Usage in the client loop:
 *   const ctl = new RetryController();
 *   while (true) {
 *     try { return await call(); }
 *     catch (e) {
 *       if (<hard error>) throw e;
 *       const waitMs = await ctl.nextWait(e);   // sleeps internally
 *       if (waitMs === null) throw <wrap/rethrow>;  // budget exhausted
 *       // else: loop and retry
 *     }
 *   }
 */
export class RetryController {
  private rateLimitAttempts = 0;
  private transientAttempts = 0;
  private totalWaitMs = 0;

  /**
   * Decide whether to retry `err` and, if so, sleep the appropriate backoff and
   * resolve. Returns the waited ms on retry, or `null` when the budget for that
   * error class (attempts or total wait) is exhausted — caller should give up.
   *
   * `sleepFn` defaults to the module `sleep` (spied in tests). The caller MUST
   * have already confirmed `err` is retryable; a non-retryable error should be
   * thrown by the caller before reaching here.
   */
  async nextWait(err: unknown, sleepFn: (ms: number) => Promise<void> = sleep): Promise<number | null> {
    if (isRateLimitError(err)) {
      this.rateLimitAttempts += 1;
      if (this.rateLimitAttempts >= GEMINI_RATE_LIMIT_MAX_ATTEMPTS) return null;

      const serverMs = parseRetryDelayMs(err);
      const baseMs =
        serverMs !== null
          ? Math.min(serverMs + GEMINI_RETRY_JITTER_MS, maxRetryWaitMs())
          : // No parseable server delay → fall back to exponential for this attempt.
            exponentialBackoffMs(this.rateLimitAttempts - 1);

      const remainingBudget = maxTotalRetryWaitMs() - this.totalWaitMs;
      if (remainingBudget <= 0) return null;
      const waitMs = Math.min(baseMs, remainingBudget);

      this.totalWaitMs += waitMs;
      await sleepFn(waitMs);
      return waitMs;
    }

    // Non-rate-limit transient (503 / network): fast exponential backoff.
    this.transientAttempts += 1;
    if (this.transientAttempts >= GEMINI_TRANSIENT_MAX_ATTEMPTS) return null;
    const waitMs = exponentialBackoffMs(this.transientAttempts - 1);
    await sleepFn(waitMs);
    return waitMs;
  }
}

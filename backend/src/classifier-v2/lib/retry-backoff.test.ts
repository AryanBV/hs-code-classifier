/**
 * Unit tests for the shared rate-limit-aware retry helpers (parseRetryDelayMs +
 * RetryController). Pure-function + injectable-sleep, no network, no real waits.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseRetryDelayMs,
  RetryController,
  isRateLimitError,
  GEMINI_RATE_LIMIT_MAX_ATTEMPTS,
  GEMINI_TRANSIENT_MAX_ATTEMPTS,
} from './retry-backoff';

function err(message: string, status?: number): Error & { status?: number } {
  const e = new Error(message) as Error & { status?: number };
  if (status !== undefined) e.status = status;
  return e;
}

describe('parseRetryDelayMs', () => {
  it('parses the verbatim eval-log 429 body (structured RetryInfo + prose) → MAX', () => {
    // Verbatim shape from the eval log in the task description.
    const body = {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: '... Please retry in 8.846031711s ...',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '8s' },
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{}] },
        ],
      },
    };
    // max(structured 8000, prose round(8.846031711*1000)=8846) = 8846.
    expect(parseRetryDelayMs(err(JSON.stringify(body)))).toBe(8846);
  });

  it('parses a fractional RetryInfo.retryDelay', () => {
    const body = {
      error: {
        details: [{ '@type': '.../RetryInfo', retryDelay: '8.846031711s' }],
      },
    };
    expect(parseRetryDelayMs(err(JSON.stringify(body)))).toBe(8846);
  });

  it('parses the delay from prose-only ("Please retry in 12.5s")', () => {
    expect(parseRetryDelayMs(err('quota; Please retry in 12.5s; done'))).toBe(12500);
  });

  it('parses details at the top level (no `error` wrapper)', () => {
    const body = { details: [{ '@type': 'x/RetryInfo', retryDelay: '3s' }] };
    expect(parseRetryDelayMs(err(JSON.stringify(body)))).toBe(3000);
  });

  it('returns null when nothing is parseable', () => {
    expect(parseRetryDelayMs(err('plain non-json message with no delay'))).toBeNull();
    expect(parseRetryDelayMs(null)).toBeNull();
    expect(parseRetryDelayMs(undefined)).toBeNull();
    expect(parseRetryDelayMs(42)).toBeNull();
  });

  it('ignores a malformed retryDelay (not an Ns duration)', () => {
    const body = { error: { details: [{ '@type': 'x/RetryInfo', retryDelay: 'soon' }] } };
    expect(parseRetryDelayMs(err(JSON.stringify(body)))).toBeNull();
  });
});

describe('isRateLimitError', () => {
  it('is true only for status 429', () => {
    expect(isRateLimitError(err('x', 429))).toBe(true);
    expect(isRateLimitError(err('x', 503))).toBe(false);
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(isRateLimitError(err('x'))).toBe(false);
  });
});

describe('RetryController', () => {
  it('429 → sleeps the server delay (+jitter) and reports the waited ms', async () => {
    const ctl = new RetryController();
    const slept: number[] = [];
    const fakeSleep = vi.fn(async (ms: number) => {
      slept.push(ms);
    });
    const body = { error: { details: [{ '@type': 'x/RetryInfo', retryDelay: '8s' }] } };
    const waited = await ctl.nextWait(err(JSON.stringify(body), 429), fakeSleep);
    expect(waited).toBe(8250);
    expect(slept).toEqual([8250]);
  });

  it('429 caps the per-wait at GEMINI_MAX_RETRY_WAIT_MS', async () => {
    process.env.GEMINI_MAX_RETRY_WAIT_MS = '4000';
    try {
      const ctl = new RetryController();
      const body = { error: { details: [{ '@type': 'x/RetryInfo', retryDelay: '40s' }] } };
      const waited = await ctl.nextWait(err(JSON.stringify(body), 429), async () => {});
      expect(waited).toBe(4000);
    } finally {
      delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    }
  });

  it('429 with no parseable delay falls back to exponential backoff', async () => {
    const ctl = new RetryController();
    const waited = await ctl.nextWait(err('no delay here', 429), async () => {});
    // First exponential step: 2^0*500 + jitter(<200) → [500, 700).
    expect(waited).toBeGreaterThanOrEqual(500);
    expect(waited as number).toBeLessThan(700);
  });

  it('sustained 429 → returns null on the bounded attempt (no infinite loop)', async () => {
    const ctl = new RetryController();
    const body = { error: { details: [{ '@type': 'x/RetryInfo', retryDelay: '1s' }] } };
    const e = err(JSON.stringify(body), 429);
    let nullAt = -1;
    for (let i = 1; i <= 10; i++) {
      const waited = await ctl.nextWait(e, async () => {});
      if (waited === null) {
        nullAt = i;
        break;
      }
    }
    // Gives up exactly at the configured 429 attempt budget.
    expect(nullAt).toBe(GEMINI_RATE_LIMIT_MAX_ATTEMPTS);
  });

  it('429 stops once the TOTAL wait budget is exhausted', async () => {
    process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS = '10000';
    try {
      const ctl = new RetryController();
      const body = { error: { details: [{ '@type': 'x/RetryInfo', retryDelay: '8s' }] } };
      const e = err(JSON.stringify(body), 429);
      const w1 = await ctl.nextWait(e, async () => {}); // 8250, total 8250
      expect(w1).toBe(8250);
      const w2 = await ctl.nextWait(e, async () => {}); // capped to remaining 1750
      expect(w2).toBe(1750);
      const w3 = await ctl.nextWait(e, async () => {}); // budget gone → null
      expect(w3).toBeNull();
    } finally {
      delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    }
  });

  it('503 uses fast exponential backoff and the smaller transient attempt budget', async () => {
    const ctl = new RetryController();
    const e = err('unavailable', 503);
    const waits: Array<number | null> = [];
    for (let i = 0; i < GEMINI_TRANSIENT_MAX_ATTEMPTS + 1; i++) {
      waits.push(await ctl.nextWait(e, async () => {}));
    }
    // First two are fast exponential, third returns null (gives up at the 3rd attempt).
    expect(waits[0]).toBeGreaterThanOrEqual(500);
    expect(waits[0] as number).toBeLessThan(700);
    expect(waits[1]).toBeGreaterThanOrEqual(1000);
    expect(waits[1] as number).toBeLessThan(1200);
    expect(waits[GEMINI_TRANSIENT_MAX_ATTEMPTS - 1]).toBeNull();
  });
});

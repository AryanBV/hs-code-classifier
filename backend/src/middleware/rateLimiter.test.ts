import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { classifyRateLimiter, _resetRateLimitStoreForTesting } from './rateLimiter';

/* ---------------------------------------------------------------------------
 * Tiny real HTTP harness. The limiter keys per-IP off req.ip; over loopback all
 * requests share one IP, so the per-IP counter accumulates within a test.
 *
 * NOTE: the limiter store is module-level and shared across tests (no reset
 * hook), and the global counter uses a fixed 60s window. Each test therefore
 * sets generous-enough limits on the gate it is NOT exercising so prior-test
 * accumulation cannot cause a false trip.
 * --------------------------------------------------------------------------- */

let app: Express;
let server: Server;
let baseUrl: string;

async function start(): Promise<void> {
  app = express();
  app.use(express.json());
  app.post('/c', classifyRateLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stop(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function hit(): Promise<{ status: number; json: { error?: string; retryable?: boolean } }> {
  const res = await fetch(`${baseUrl}/c`, { method: 'POST' });
  return { status: res.status, json: await res.json() };
}

beforeEach(async () => {
  delete process.env.CLASSIFY_RATE_MAX;
  delete process.env.CLASSIFY_RATE_WINDOW_MS;
  delete process.env.CLASSIFY_GLOBAL_RPM;
  _resetRateLimitStoreForTesting();
  await start();
});

afterEach(async () => {
  delete process.env.CLASSIFY_RATE_MAX;
  delete process.env.CLASSIFY_RATE_WINDOW_MS;
  delete process.env.CLASSIFY_GLOBAL_RPM;
  await stop();
});

describe('classifyRateLimiter — per-IP 429', () => {
  it('429s once the per-IP cap is exceeded (global set high so it cannot interfere)', async () => {
    process.env.CLASSIFY_RATE_MAX = '3';
    process.env.CLASSIFY_GLOBAL_RPM = '100000';

    // First 3 pass.
    for (let i = 0; i < 3; i++) {
      expect((await hit()).status).toBe(200);
    }
    // 4th exceeds the per-IP cap → 429.
    const over = await hit();
    expect(over.status).toBe(429);
    expect(over.json.error).toBe('Too Many Requests');
  });
});

describe('classifyRateLimiter — global RPM 503', () => {
  it('503s once the global all-IPs RPM is exceeded (per-IP set high so it cannot interfere)', async () => {
    process.env.CLASSIFY_RATE_MAX = '100000';
    process.env.CLASSIFY_GLOBAL_RPM = '3';

    // First 3 pass the global gate.
    for (let i = 0; i < 3; i++) {
      expect((await hit()).status).toBe(200);
    }
    // 4th exceeds the global RPM → 503 retryable.
    const over = await hit();
    expect(over.status).toBe(503);
    expect(over.json.error).toBe('The classifier is busy right now. Please try again shortly.');
    expect(over.json.retryable).toBe(true);
  });
});

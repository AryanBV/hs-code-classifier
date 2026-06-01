import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CostMonitor, recordInputFromTokenUsage } from './cost-monitor';
import type { RecordInput } from './cost-monitor';
import type { TokenUsageTotals } from '../classifier-v2/lib/token-meter';

/** A mutable clock for deterministic rollover/ceiling tests. */
function clockAt(startIso: string): { now: () => number; set: (iso: string) => void } {
  let ms = Date.parse(startIso);
  return {
    now: () => ms,
    set: (iso: string) => {
      ms = Date.parse(iso);
    },
  };
}

function input(over: Partial<RecordInput> = {}): RecordInput {
  return {
    llmCalls: 3,
    totalTokens: 1200,
    byModel: { 'gemini-3.5-flash': { calls: 3, promptTokens: 1000, outputTokens: 200, thoughtsTokens: 0, totalTokens: 1200, cachedTokens: 0 } },
    decision: 'CLASSIFY',
    ...over,
  };
}

beforeEach(() => {
  delete process.env.MAX_CLASSIFICATIONS_PER_DAY;
});

afterEach(() => {
  delete process.env.MAX_CLASSIFICATIONS_PER_DAY;
});

describe('CostMonitor — record + getDailyStats', () => {
  it('accumulates requests, llmCalls, tokens, byModel and byDecision for the current UTC day', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    m.recordClassification(input({ decision: 'CLASSIFY' }));
    m.recordClassification(input({ llmCalls: 2, totalTokens: 800, decision: 'ASK' }));

    const stats = m.getDailyStats();
    expect(stats.utcDay).toBe('2026-06-01');
    expect(stats.requests).toBe(2);
    // Top-level totalTokens sums the per-call inputs (1200 + 800).
    expect(stats.llmCalls).toBe(5);
    expect(stats.totalTokens).toBe(2000);
    expect(stats.byDecision).toEqual({ CLASSIFY: 1, ASK: 1 });
    // byModel sums the byModel breakdown of each call (the helper's default
    // bucket carries totalTokens=1200 regardless of the top-level override), so
    // both calls contribute 1200 → 2400 here.
    expect(stats.byModel['gemini-3.5-flash']).toEqual({ calls: 6, totalTokens: 2400 });
    expect(stats.maxPerDay).toBeNull();
    expect(stats.overLimit).toBe(false);
  });

  it('starts empty', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const stats = new CostMonitor(clock.now).getDailyStats();
    expect(stats.requests).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.byModel).toEqual({});
    expect(stats.byDecision).toEqual({});
  });
});

describe('CostMonitor — UTC-day rollover', () => {
  it('resets counters when the clock crosses into a new UTC day', () => {
    const clock = clockAt('2026-06-01T23:59:00.000Z');
    const m = new CostMonitor(clock.now);

    m.recordClassification(input());
    m.recordClassification(input());
    expect(m.getDailyStats().requests).toBe(2);
    expect(m.getDailyStats().utcDay).toBe('2026-06-01');

    // Cross midnight UTC.
    clock.set('2026-06-02T00:01:00.000Z');
    const next = m.getDailyStats();
    expect(next.utcDay).toBe('2026-06-02');
    expect(next.requests).toBe(0);
    expect(next.totalTokens).toBe(0);

    // New-day records accumulate from zero.
    m.recordClassification(input());
    expect(m.getDailyStats().requests).toBe(1);
  });

  it('rolls over on recordClassification too (not only on getDailyStats)', () => {
    const clock = clockAt('2026-06-01T23:59:00.000Z');
    const m = new CostMonitor(clock.now);
    m.recordClassification(input());
    expect(m.getDailyStats().requests).toBe(1);

    clock.set('2026-06-02T00:05:00.000Z');
    m.recordClassification(input()); // rollover happens here
    const stats = m.getDailyStats();
    expect(stats.utcDay).toBe('2026-06-02');
    expect(stats.requests).toBe(1);
  });
});

describe('CostMonitor — hard daily ceiling (MAX_CLASSIFICATIONS_PER_DAY)', () => {
  it('no ceiling when env is unset (default — dev/tests unaffected)', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);
    for (let i = 0; i < 100; i++) m.recordClassification(input());
    expect(m.isOverDailyLimit()).toBe(false);
    expect(m.getDailyStats().overLimit).toBe(false);
  });

  it('isOverDailyLimit flips true once requests reach the configured ceiling', () => {
    process.env.MAX_CLASSIFICATIONS_PER_DAY = '3';
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    expect(m.isOverDailyLimit()).toBe(false);
    m.recordClassification(input());
    m.recordClassification(input());
    expect(m.isOverDailyLimit()).toBe(false); // 2 < 3
    m.recordClassification(input());
    expect(m.isOverDailyLimit()).toBe(true); // 3 >= 3
    expect(m.getDailyStats().overLimit).toBe(true);
    expect(m.getDailyStats().maxPerDay).toBe(3);
  });

  it('the ceiling resets after a UTC-day rollover', () => {
    process.env.MAX_CLASSIFICATIONS_PER_DAY = '2';
    const clock = clockAt('2026-06-01T23:00:00.000Z');
    const m = new CostMonitor(clock.now);
    m.recordClassification(input());
    m.recordClassification(input());
    expect(m.isOverDailyLimit()).toBe(true);

    clock.set('2026-06-02T00:01:00.000Z');
    expect(m.isOverDailyLimit()).toBe(false); // fresh day
  });

  it('treats invalid/<=0 env as no ceiling', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    process.env.MAX_CLASSIFICATIONS_PER_DAY = '0';
    m.recordClassification(input());
    expect(m.isOverDailyLimit()).toBe(false);

    process.env.MAX_CLASSIFICATIONS_PER_DAY = 'not-a-number';
    expect(m.isOverDailyLimit()).toBe(false);
  });
});

describe('recordInputFromTokenUsage', () => {
  it('extracts the recordable shape from a token_usage total', () => {
    const usage: TokenUsageTotals = {
      promptTokens: 900,
      outputTokens: 100,
      thoughtsTokens: 0,
      totalTokens: 1000,
      cachedTokens: 0,
      llmCalls: 4,
      byModel: { 'gemini-3.5-flash': { calls: 4, promptTokens: 900, outputTokens: 100, thoughtsTokens: 0, totalTokens: 1000, cachedTokens: 0 } },
    };
    const r = recordInputFromTokenUsage(usage, 'CLASSIFY');
    expect(r.llmCalls).toBe(4);
    expect(r.totalTokens).toBe(1000);
    expect(r.decision).toBe('CLASSIFY');
    expect(r.byModel['gemini-3.5-flash']!.calls).toBe(4);
  });

  it('defaults to zeros when token_usage is undefined (un-metered short-circuit path)', () => {
    const r = recordInputFromTokenUsage(undefined, 'REFUSE');
    expect(r.llmCalls).toBe(0);
    expect(r.totalTokens).toBe(0);
    expect(r.byModel).toEqual({});
    expect(r.decision).toBe('REFUSE');
  });
});

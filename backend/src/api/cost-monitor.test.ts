import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CostMonitor, recordInputFromTokenUsage, DEFAULT_MAX_PER_DAY } from './cost-monitor';
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

describe('CostMonitor — reserveSlot + recordUsage + getDailyStats', () => {
  it('reserveSlot counts requests; recordUsage accumulates token usage WITHOUT touching requests', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    // The live shape: reserve a slot at entry, then record usage on completion.
    expect(m.reserveSlot()).toBe(true);
    m.recordUsage(input({ decision: 'CLASSIFY' }));
    expect(m.reserveSlot()).toBe(true);
    m.recordUsage(input({ llmCalls: 2, totalTokens: 800, decision: 'ASK' }));

    const stats = m.getDailyStats();
    expect(stats.utcDay).toBe('2026-06-01');
    expect(stats.requests).toBe(2); // counted by reserveSlot, exactly once each
    expect(stats.llmCalls).toBe(5);
    expect(stats.totalTokens).toBe(2000);
    expect(stats.byDecision).toEqual({ CLASSIFY: 1, ASK: 1 });
    expect(stats.byModel['gemini-3.5-flash']).toEqual({ calls: 6, totalTokens: 2400 });
  });

  it('recordUsage alone does NOT increment requests (count-on-entry property)', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    m.recordUsage(input());
    m.recordUsage(input());
    expect(m.getDailyStats().requests).toBe(0); // never reserved
    expect(m.getDailyStats().totalTokens).toBe(2400); // usage still recorded
  });

  it('recordClassification is a back-compat shim for recordUsage (no request increment)', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    m.recordClassification(input());
    expect(m.getDailyStats().requests).toBe(0);
    expect(m.getDailyStats().totalTokens).toBe(1200);
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

    m.reserveSlot();
    m.recordUsage(input());
    m.reserveSlot();
    m.recordUsage(input());
    expect(m.getDailyStats().requests).toBe(2);
    expect(m.getDailyStats().utcDay).toBe('2026-06-01');

    // Cross midnight UTC.
    clock.set('2026-06-02T00:01:00.000Z');
    const next = m.getDailyStats();
    expect(next.utcDay).toBe('2026-06-02');
    expect(next.requests).toBe(0);
    expect(next.totalTokens).toBe(0);

    // New-day records accumulate from zero.
    m.reserveSlot();
    expect(m.getDailyStats().requests).toBe(1);
  });

  it('rolls over on reserveSlot too (not only on getDailyStats)', () => {
    const clock = clockAt('2026-06-01T23:59:00.000Z');
    const m = new CostMonitor(clock.now);
    m.reserveSlot();
    expect(m.getDailyStats().requests).toBe(1);

    clock.set('2026-06-02T00:05:00.000Z');
    expect(m.reserveSlot()).toBe(true); // rollover happens here
    const stats = m.getDailyStats();
    expect(stats.utcDay).toBe('2026-06-02');
    expect(stats.requests).toBe(1);
  });

  it('rolls over on recordUsage too', () => {
    const clock = clockAt('2026-06-01T23:59:00.000Z');
    const m = new CostMonitor(clock.now);
    m.reserveSlot();
    m.recordUsage(input());
    expect(m.getDailyStats().totalTokens).toBe(1200);

    clock.set('2026-06-02T00:05:00.000Z');
    m.recordUsage(input()); // rollover happens here
    const stats = m.getDailyStats();
    expect(stats.utcDay).toBe('2026-06-02');
    expect(stats.requests).toBe(0); // rolled over, no new reservation
    expect(stats.totalTokens).toBe(1200);
  });
});

describe('CostMonitor — fail-safe default ceiling', () => {
  it('falls back to DEFAULT_MAX_PER_DAY (200) when env is unset', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);
    expect(DEFAULT_MAX_PER_DAY).toBe(200);
    expect(m.getDailyStats().maxPerDay).toBe(200);
    // The ceiling is real: reserveSlot eventually denies at 200.
    for (let i = 0; i < 200; i++) expect(m.reserveSlot()).toBe(true);
    expect(m.reserveSlot()).toBe(false); // 201st denied
    expect(m.isOverDailyLimit()).toBe(true);
  });

  it('falls back to 200 when env is invalid/<=0', () => {
    const clock = clockAt('2026-06-01T08:00:00.000Z');

    process.env.MAX_CLASSIFICATIONS_PER_DAY = '0';
    expect(new CostMonitor(clock.now).getDailyStats().maxPerDay).toBe(200);

    process.env.MAX_CLASSIFICATIONS_PER_DAY = 'not-a-number';
    expect(new CostMonitor(clock.now).getDailyStats().maxPerDay).toBe(200);
  });
});

describe('CostMonitor — hard daily ceiling (MAX_CLASSIFICATIONS_PER_DAY)', () => {
  it('reserveSlot denies once the configured ceiling is reached, WITHOUT incrementing', () => {
    process.env.MAX_CLASSIFICATIONS_PER_DAY = '3';
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    expect(m.reserveSlot()).toBe(true); // 1
    expect(m.reserveSlot()).toBe(true); // 2
    expect(m.reserveSlot()).toBe(true); // 3
    expect(m.isOverDailyLimit()).toBe(true);
    // 4th is DENIED and must NOT increment past the ceiling.
    expect(m.reserveSlot()).toBe(false);
    expect(m.getDailyStats().requests).toBe(3);
    expect(m.getDailyStats().overLimit).toBe(true);
    expect(m.getDailyStats().maxPerDay).toBe(3);
  });

  it('isOverDailyLimit flips true once requests reach the configured ceiling', () => {
    process.env.MAX_CLASSIFICATIONS_PER_DAY = '2';
    const clock = clockAt('2026-06-01T08:00:00.000Z');
    const m = new CostMonitor(clock.now);

    expect(m.isOverDailyLimit()).toBe(false);
    m.reserveSlot();
    expect(m.isOverDailyLimit()).toBe(false); // 1 < 2
    m.reserveSlot();
    expect(m.isOverDailyLimit()).toBe(true); // 2 >= 2
  });

  it('the ceiling resets after a UTC-day rollover', () => {
    process.env.MAX_CLASSIFICATIONS_PER_DAY = '2';
    const clock = clockAt('2026-06-01T23:00:00.000Z');
    const m = new CostMonitor(clock.now);
    m.reserveSlot();
    m.reserveSlot();
    expect(m.reserveSlot()).toBe(false); // ceiling hit
    expect(m.isOverDailyLimit()).toBe(true);

    clock.set('2026-06-02T00:01:00.000Z');
    expect(m.isOverDailyLimit()).toBe(false); // fresh day
    expect(m.reserveSlot()).toBe(true); // can reserve again
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

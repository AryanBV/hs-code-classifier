import { describe, it, expect } from 'vitest';
import {
  TokenMeter,
  runWithMeter,
  recordUsage,
  type RecordableUsage,
} from './token-meter';

const usage = (over: Partial<RecordableUsage> = {}): RecordableUsage => ({
  promptTokens: 100,
  outputTokens: 20,
  thoughtsTokens: 5,
  totalTokens: 125,
  ...over,
});

describe('TokenMeter.add / snapshot', () => {
  it('aggregates totals and per-model buckets across multiple calls', () => {
    const m = new TokenMeter();
    m.add('gemini-3.5-flash', usage({ promptTokens: 100, outputTokens: 20, thoughtsTokens: 5, totalTokens: 125 }));
    m.add('gemini-3.5-flash', usage({ promptTokens: 200, outputTokens: 40, thoughtsTokens: 10, totalTokens: 250 }));
    m.add('gemini-3.1-pro-preview', usage({ promptTokens: 50, outputTokens: 10, thoughtsTokens: 3, totalTokens: 63 }));

    const s = m.snapshot();
    expect(s.llmCalls).toBe(3);
    expect(s.promptTokens).toBe(350);
    expect(s.outputTokens).toBe(70);
    expect(s.thoughtsTokens).toBe(18);
    expect(s.totalTokens).toBe(438);

    expect(s.byModel['gemini-3.5-flash']).toEqual({
      calls: 2,
      promptTokens: 300,
      outputTokens: 60,
      thoughtsTokens: 15,
      totalTokens: 375,
      cachedTokens: 0,
    });
    expect(s.byModel['gemini-3.1-pro-preview']).toEqual({
      calls: 1,
      promptTokens: 50,
      outputTokens: 10,
      thoughtsTokens: 3,
      totalTokens: 63,
      cachedTokens: 0,
    });
  });

  it('sums cachedTokens and treats undefined cachedTokens as 0', () => {
    const m = new TokenMeter();
    m.add('gemini-3.5-flash', usage({ cachedTokens: 40 }));
    m.add('gemini-3.5-flash', usage()); // cachedTokens undefined → 0
    const s = m.snapshot();
    expect(s.cachedTokens).toBe(40);
    expect(s.byModel['gemini-3.5-flash'].cachedTokens).toBe(40);
  });

  it('snapshot is a detached deep copy — later add() does not mutate it', () => {
    const m = new TokenMeter();
    m.add('gemini-3.5-flash', usage({ promptTokens: 100, totalTokens: 100 }));
    const first = m.snapshot();
    m.add('gemini-3.5-flash', usage({ promptTokens: 100, totalTokens: 100 }));
    // The earlier snapshot is frozen-in-time.
    expect(first.promptTokens).toBe(100);
    expect(first.llmCalls).toBe(1);
    expect(first.byModel['gemini-3.5-flash'].calls).toBe(1);
    // The meter itself advanced.
    expect(m.snapshot().llmCalls).toBe(2);
  });
});

describe('recordUsage outside a meter scope', () => {
  it('is a no-op (does not throw) when no meter is active', () => {
    expect(() => recordUsage('gemini-3.5-flash', usage())).not.toThrow();
  });
});

describe('runWithMeter', () => {
  it('returns the fn result alongside accumulated totals', async () => {
    const { result, totals } = await runWithMeter(async () => {
      recordUsage('gemini-3.5-flash', usage({ promptTokens: 10, outputTokens: 2, thoughtsTokens: 1, totalTokens: 13 }));
      recordUsage('gemini-3.5-flash', usage({ promptTokens: 20, outputTokens: 4, thoughtsTokens: 2, totalTokens: 26 }));
      return 'done';
    });
    expect(result).toBe('done');
    expect(totals.llmCalls).toBe(2);
    expect(totals.promptTokens).toBe(30);
    expect(totals.outputTokens).toBe(6);
    expect(totals.totalTokens).toBe(39);
  });

  it('isolates two CONCURRENT meters — no cross-contamination', async () => {
    // Two overlapping scopes whose recordUsage calls interleave via awaits.
    const gate = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const scopeA = runWithMeter(async () => {
      recordUsage('gemini-3.5-flash', usage({ promptTokens: 1, totalTokens: 1 }));
      await gate(15);
      recordUsage('gemini-3.5-flash', usage({ promptTokens: 1, totalTokens: 1 }));
      await gate(15);
      recordUsage('gemini-3.5-flash', usage({ promptTokens: 1, totalTokens: 1 }));
      return 'A';
    });

    const scopeB = runWithMeter(async () => {
      await gate(5);
      recordUsage('gemini-3.1-pro-preview', usage({ promptTokens: 100, totalTokens: 100 }));
      await gate(5);
      recordUsage('gemini-3.1-pro-preview', usage({ promptTokens: 100, totalTokens: 100 }));
      return 'B';
    });

    const [a, b] = await Promise.all([scopeA, scopeB]);

    // Scope A saw ONLY its 3 flash calls; scope B saw ONLY its 2 pro calls.
    expect(a.result).toBe('A');
    expect(a.totals.llmCalls).toBe(3);
    expect(a.totals.promptTokens).toBe(3);
    expect(Object.keys(a.totals.byModel)).toEqual(['gemini-3.5-flash']);

    expect(b.result).toBe('B');
    expect(b.totals.llmCalls).toBe(2);
    expect(b.totals.promptTokens).toBe(200);
    expect(Object.keys(b.totals.byModel)).toEqual(['gemini-3.1-pro-preview']);
  });

  it('returns all-zero totals when fn makes no metered calls', async () => {
    const { result, totals } = await runWithMeter(async () => 42);
    expect(result).toBe(42);
    expect(totals.llmCalls).toBe(0);
    expect(totals.promptTokens).toBe(0);
    expect(totals.byModel).toEqual({});
  });
});

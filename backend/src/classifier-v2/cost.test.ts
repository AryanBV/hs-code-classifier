import { describe, it, expect, vi, afterEach } from 'vitest';
import { estimateCostUsd, estimateCostUsdByModel } from './cost';

describe('estimateCostUsd', () => {
  it('computes gemini-3.5-flash cost from usage', () => {
    const c = estimateCostUsd('gemini-3.5-flash', {
      promptTokens: 1000,
      outputTokens: 500,
      thoughtsTokens: 0,
      totalTokens: 1500,
    });
    // in: $1.50/1M, out: $9.00/1M
    expect(c).toBeCloseTo((1000 / 1e6) * 1.50 + (500 / 1e6) * 9.00, 6);
  });

  it('computes gemini-3.1-pro-preview cost from usage', () => {
    const c = estimateCostUsd('gemini-3.1-pro-preview', {
      promptTokens: 2000,
      outputTokens: 800,
      thoughtsTokens: 0,
      totalTokens: 2800,
    });
    // in: $2.00/1M, out: $12.00/1M
    expect(c).toBeCloseTo((2000 / 1e6) * 2.00 + (800 / 1e6) * 12.00, 6);
  });

  it('includes thoughtsTokens billed as output', () => {
    const c = estimateCostUsd('gemini-3.5-flash', {
      promptTokens: 1000,
      outputTokens: 200,
      thoughtsTokens: 300,
      totalTokens: 1500,
    });
    // thoughtsTokens + outputTokens both billed at output rate
    expect(c).toBeCloseTo((1000 / 1e6) * 1.50 + ((200 + 300) / 1e6) * 9.00, 6);
  });

  it('computes gemini-2.5-pro cost from usage', () => {
    const c = estimateCostUsd('gemini-2.5-pro', {
      promptTokens: 5000,
      outputTokens: 1000,
      thoughtsTokens: 0,
      totalTokens: 6000,
    });
    // in: $1.25/1M, out: $10.00/1M
    expect(c).toBeCloseTo((5000 / 1e6) * 1.25 + (1000 / 1e6) * 10.00, 6);
  });
});

describe('estimateCostUsdByModel — cost-integrity guard (FIX 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const usage = { promptTokens: 1000, outputTokens: 500, thoughtsTokens: 0, totalTokens: 1500 };

  it('prices a known chat model via estimateCostUsd (no warning)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = estimateCostUsdByModel('gemini-3.5-flash', usage);
    expect(c).toBeCloseTo(estimateCostUsd('gemini-3.5-flash', usage), 6);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns $0 for a known embedding id WITHOUT warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(estimateCostUsdByModel('gemini-embedding-001', usage)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns $0 AND warns once (deduped) for a drifted/unpriced non-embedding model id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Use a unique id so module-level dedupe state from other tests cannot mask it.
    const drifted = `gemini-3.5-flash-drift-${Math.random().toString(36).slice(2)}`;
    expect(estimateCostUsdByModel(drifted, usage)).toBe(0);
    expect(estimateCostUsdByModel(drifted, usage)).toBe(0); // second call: still $0
    // Warned exactly once for this id (deduped), naming the model id.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(drifted);
  });
});

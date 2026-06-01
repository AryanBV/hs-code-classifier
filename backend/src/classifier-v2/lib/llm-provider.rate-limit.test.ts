/**
 * Facade × rate-limiter wiring tests (Phase B).
 *
 * Asserts that the `generateContent` facade calls `getRateLimiter().acquire()`
 * EXACTLY ONCE per call, BEFORE delegating to the provider, and still records
 * usage afterwards — and that with GEMINI_RPM unset the limiter is a no-op so
 * behavior/return are byte-identical to today.
 *
 * The provider impls and the rate-limiter are mocked so this never touches
 * @google/genai or the network. Kept in its own file (separate from
 * llm-provider.test.ts) so the existing facade tests run with the REAL no-op
 * limiter and are not weakened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDevGenerateContent = vi.fn();
const mockAcquire = vi.fn<[], Promise<void>>();
let acquireCallOrder: string[] = [];

vi.mock('./vertex-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vertex-client')>();
  return {
    ...actual,
    generateContent: vi.fn(),
  };
});

vi.mock('./gemini-developer-client', () => ({
  GeminiDeveloperLlmProvider: class {
    generateContent(...args: unknown[]): unknown {
      acquireCallOrder.push('generate');
      return mockDevGenerateContent(...args);
    }
  },
}));

vi.mock('./rate-limiter', () => ({
  getRateLimiter: () => ({
    acquire: () => {
      acquireCallOrder.push('acquire');
      return mockAcquire();
    },
  }),
}));

import { generateContent } from './llm-provider';
import type { GenerateContentOptions, GenerateContentResult } from './llm-provider';
import { runWithMeter } from './token-meter';

const OPTS: GenerateContentOptions = {
  model: 'gemini-3.5-flash',
  prompt: 'classify: stainless steel hex bolts',
  thinkingLevel: 'low',
};

const RESULT: GenerateContentResult = {
  text: '{"ok":true}',
  usage: { promptTokens: 1, outputTokens: 2, thoughtsTokens: 0, totalTokens: 3 },
  finishReason: 'STOP',
  latencyMs: 1,
  model: 'gemini-3.5-flash',
};

describe('generateContent facade — rate-limiter wiring', () => {
  const original = process.env.LLM_PROVIDER;

  beforeEach(() => {
    mockDevGenerateContent.mockReset();
    mockAcquire.mockReset();
    mockAcquire.mockResolvedValue(undefined);
    acquireCallOrder = [];
    delete process.env.LLM_PROVIDER;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = original;
  });

  it('acquires exactly once per call, BEFORE delegating, and still returns the result', async () => {
    mockDevGenerateContent.mockResolvedValue(RESULT);
    const res = await generateContent(OPTS);

    expect(res).toBe(RESULT);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockDevGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockDevGenerateContent).toHaveBeenCalledWith(OPTS);
    // acquire must run BEFORE the provider generate.
    expect(acquireCallOrder).toEqual(['acquire', 'generate']);
  });

  it('records usage AFTER the call (token meter unchanged), still exactly one acquire', async () => {
    mockDevGenerateContent.mockResolvedValue(RESULT);
    const { result, totals } = await runWithMeter(async () => generateContent(OPTS));

    expect(result).toBe(RESULT);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(totals.llmCalls).toBe(1);
    expect(totals.totalTokens).toBe(3);
    expect(totals.byModel['gemini-3.5-flash'].calls).toBe(1);
  });

  it('three sequential calls → three acquires (one per generateContent)', async () => {
    mockDevGenerateContent.mockResolvedValue(RESULT);
    await generateContent(OPTS);
    await generateContent(OPTS);
    await generateContent(OPTS);
    expect(mockAcquire).toHaveBeenCalledTimes(3);
    expect(mockDevGenerateContent).toHaveBeenCalledTimes(3);
  });
});

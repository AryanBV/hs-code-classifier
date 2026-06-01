/**
 * Unit tests for the Gemini Developer API generateContent client (Phase A2).
 *
 * `@google/genai` is mocked so the adapter's mapping is asserted in isolation,
 * with NO network calls:
 *  (a) maps usageMetadata → GenerateContentUsage incl. cachedTokens
 *      (cachedContentTokenCount), and reads resp.text + finishReason;
 *  (b) throws MaxTokensError on finishReason === 'MAX_TOKENS';
 *  (c) builds the camelCase thinkingConfig (thinkingLevel for gemini-3.x);
 *  (d) passes the sanitized responseSchema + responseMimeType when a schema is given;
 *  (e) retries on a transient 503 then succeeds;
 *  (f) requires GEMINI_API_KEY (clear error when missing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockCtor = vi.fn();

// `vi.mock` factories are hoisted above the module body, so anything they
// reference must also be hoisted. Declare the SDK ThinkingLevel string-enum
// stand-in inside `vi.hoisted` so it exists when the factory runs (avoids the
// TDZ "Cannot read properties of undefined" error).
const { MockThinkingLevel } = vi.hoisted(() => ({
  MockThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    public models: { generateContent: (...a: unknown[]) => unknown };
    constructor(opts: unknown) {
      mockCtor(opts);
      this.models = { generateContent: (...a: unknown[]) => mockGenerateContent(...a) };
    }
  },
  ThinkingLevel: MockThinkingLevel,
}));

import { GeminiDeveloperLlmProvider } from './gemini-developer-client';
import * as backoff from './retry-backoff';
import { MaxTokensError, type GenerateContentOptions } from './vertex-client';

function apiError(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

/**
 * A 429 ApiError whose `message` is the JSON-stringified error body (matching the
 * @google/genai SDK's `throwErrorIfNotOK`), optionally carrying a structured
 * RetryInfo.retryDelay and/or a "Please retry in Ns" prose message.
 */
function rateLimitError(opts: {
  retryDelay?: string;
  proseSeconds?: number;
}): Error & { status: number } {
  const details: Array<Record<string, unknown>> = [];
  if (opts.retryDelay !== undefined) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.RetryInfo',
      retryDelay: opts.retryDelay,
    });
  }
  details.push({
    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
    violations: [{ quotaMetric: 'generate_content_free_tier_requests' }],
  });
  const prose =
    opts.proseSeconds !== undefined
      ? `Resource has been exhausted. Please retry in ${opts.proseSeconds}s. Quota exceeded.`
      : 'Resource has been exhausted (e.g. check quota).';
  const body = {
    error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: prose, details },
  };
  const e = new Error(JSON.stringify(body)) as Error & { status: number };
  e.status = 429;
  return e;
}

const BASE_OPTS: GenerateContentOptions = {
  model: 'gemini-3.5-flash',
  prompt: 'classify: stainless steel hex bolts M10',
  thinkingLevel: 'low',
};

describe('GeminiDeveloperLlmProvider', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  let sleepSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockCtor.mockReset();
    process.env.GEMINI_API_KEY = 'test-free-tier-key';
    delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    // Fake the backoff sleep so tests record the requested wait without waiting.
    sleepSpy = vi.spyOn(backoff, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sleepSpy.mockRestore();
    delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('maps usageMetadata → GenerateContentUsage including cachedTokens', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"chapter":"73"}',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 1200,
        candidatesTokenCount: 80,
        thoughtsTokenCount: 40,
        totalTokenCount: 1320,
        cachedContentTokenCount: 900,
      },
    });

    const p = new GeminiDeveloperLlmProvider();
    const res = await p.generateContent(BASE_OPTS);

    expect(res.text).toBe('{"chapter":"73"}');
    expect(res.finishReason).toBe('STOP');
    expect(res.model).toBe('gemini-3.5-flash');
    expect(res.usage.promptTokens).toBe(1200);
    expect(res.usage.outputTokens).toBe(80);
    expect(res.usage.thoughtsTokens).toBe(40);
    expect(res.usage.totalTokens).toBe(1320);
    // cachedTokens is the additive A3 field (cachedContentTokenCount).
    expect((res.usage as { cachedTokens: number }).cachedTokens).toBe(900);
  });

  it('defaults usage fields + cachedTokens to 0 when usageMetadata is absent', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'ok',
      candidates: [{ finishReason: 'STOP' }],
    });
    const p = new GeminiDeveloperLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.usage.promptTokens).toBe(0);
    expect((res.usage as { cachedTokens: number }).cachedTokens).toBe(0);
  });

  it('throws MaxTokensError on finishReason MAX_TOKENS (with partial text + usage + model)', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"partial":',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 10, thoughtsTokenCount: 2030, totalTokenCount: 2040 },
    });
    const p = new GeminiDeveloperLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toBeInstanceOf(MaxTokensError);
    try {
      await p.generateContent(BASE_OPTS);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MaxTokensError);
      const mte = e as MaxTokensError;
      expect(mte.partialText).toBe('{"partial":');
      expect(mte.model).toBe('gemini-3.5-flash');
      expect(mte.usage.thoughtsTokens).toBe(2030);
    }
  });

  it('builds a camelCase thinkingLevel config for gemini-3.x and forwards model/contents', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });
    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent({ ...BASE_OPTS, thinkingLevel: 'high' });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const params = mockGenerateContent.mock.calls[0][0] as {
      model: string;
      contents: string;
      config: { thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number }; temperature?: number };
    };
    expect(params.model).toBe('gemini-3.5-flash');
    expect(params.contents).toBe(BASE_OPTS.prompt);
    // gemini-3.x → thinkingLevel (mapped to the SDK enum), NOT thinkingBudget.
    expect(params.config.thinkingConfig?.thinkingLevel).toBe(MockThinkingLevel.HIGH);
    expect(params.config.thinkingConfig?.thinkingBudget).toBeUndefined();
    expect(params.config.temperature).toBe(0);
  });

  it('uses thinkingBudget for gemini-2.5-* models', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });
    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent({ ...BASE_OPTS, model: 'gemini-2.5-pro', thinkingLevel: 'medium' });
    const params = mockGenerateContent.mock.calls[0][0] as {
      config: { thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number } };
    };
    expect(params.config.thinkingConfig?.thinkingBudget).toBe(1024);
    expect(params.config.thinkingConfig?.thinkingLevel).toBeUndefined();
  });

  it('passes the sanitized responseSchema + responseMimeType when a schema is given', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{}', candidates: [{ finishReason: 'STOP' }] });
    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent({
      ...BASE_OPTS,
      // A draft-07 construct the sanitizer must strip ($schema) + a nullable type-array.
      responseSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { code: { type: ['string', 'null'] } },
      } as unknown as GenerateContentOptions['responseSchema'],
    });
    const params = mockGenerateContent.mock.calls[0][0] as {
      config: { responseSchema?: Record<string, unknown>; responseMimeType?: string };
    };
    expect(params.config.responseMimeType).toBe('application/json');
    const schema = params.config.responseSchema as Record<string, unknown>;
    expect('$schema' in schema).toBe(false); // sanitizer applied
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.code.type).toBe('string');
    expect(props.code.nullable).toBe(true);
  });

  it('forwards systemInstruction when provided', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });
    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent({ ...BASE_OPTS, systemInstruction: 'You are a tariff classifier.' });
    const params = mockGenerateContent.mock.calls[0][0] as {
      config: { systemInstruction?: string };
    };
    expect(params.config.systemInstruction).toBe('You are a tariff classifier.');
  });

  it('retries on a transient 503 then succeeds', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ text: 'recovered', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.text).toBe('recovered');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry a hard 400 and rethrows', async () => {
    mockGenerateContent.mockRejectedValue(apiError(400));
    const p = new GeminiDeveloperLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/HTTP 400/);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when GEMINI_API_KEY is missing (no SDK call)', async () => {
    delete process.env.GEMINI_API_KEY;
    const p = new GeminiDeveloperLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/GEMINI_API_KEY is not set/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('429 with structured RetryInfo.retryDelay="8s" → waits ~8s then succeeds', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '8s' }))
      .mockResolvedValueOnce({ text: 'cleared', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    const res = await p.generateContent(BASE_OPTS);

    expect(res.text).toBe('cleared');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    const waited = sleepSpy.mock.calls[0][0] as number;
    // 8000ms + 250ms jitter, well under the 30s cap.
    expect(waited).toBe(8250);
  });

  it('429 with fractional RetryInfo.retryDelay="8.846031711s" → waits the rounded server delay', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '8.846031711s' }))
      .mockResolvedValueOnce({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent(BASE_OPTS);
    const waited = sleepSpy.mock.calls[0][0] as number;
    // round(8.846031711 * 1000) = 8846, + 250 jitter.
    expect(waited).toBe(9096);
  });

  it('429 with the delay ONLY in the prose message ("retry in 12.5s") → parses 12.5s', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError({ proseSeconds: 12.5 }))
      .mockResolvedValueOnce({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent(BASE_OPTS);
    const waited = sleepSpy.mock.calls[0][0] as number;
    expect(waited).toBe(12500 + 250);
  });

  it('429 with both details + prose → takes the MAX of the two', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '8s', proseSeconds: 15 }))
      .mockResolvedValueOnce({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent(BASE_OPTS);
    const waited = sleepSpy.mock.calls[0][0] as number;
    // max(8000, 15000) + 250.
    expect(waited).toBe(15000 + 250);
  });

  it('429 requested delay ABOVE the cap → waits only GEMINI_MAX_RETRY_WAIT_MS', async () => {
    process.env.GEMINI_MAX_RETRY_WAIT_MS = '5000';
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError({ retryDelay: '40s' }))
      .mockResolvedValueOnce({ text: 'ok', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    await p.generateContent(BASE_OPTS);
    const waited = sleepSpy.mock.calls[0][0] as number;
    expect(waited).toBe(5000);
  });

  it('sustained 429 (always throttled) → gives up after the bounded attempts and throws', async () => {
    // Always throttled; small server delay so the total-wait budget is not the binding limit.
    mockGenerateContent.mockRejectedValue(rateLimitError({ retryDelay: '1s' }));

    const p = new GeminiDeveloperLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/After \d+ retry attempts/);
    // 5 attempts total for a 429 (4 sleeps then give up on the 5th).
    expect(mockGenerateContent).toHaveBeenCalledTimes(5);
    expect(sleepSpy).toHaveBeenCalledTimes(4);
  });

  it('503 → uses FAST exponential backoff, not the long rate-limit wait', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ text: 'recovered', candidates: [{ finishReason: 'STOP' }] });

    const p = new GeminiDeveloperLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.text).toBe('recovered');
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    const waited = sleepSpy.mock.calls[0][0] as number;
    // First exponential step is 2^0*500 + jitter(<200) → [500, 700), nowhere near 8s.
    expect(waited).toBeGreaterThanOrEqual(500);
    expect(waited).toBeLessThan(700);
  });
});

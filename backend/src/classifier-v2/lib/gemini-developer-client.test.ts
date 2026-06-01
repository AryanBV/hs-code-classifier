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
import { MaxTokensError, type GenerateContentOptions } from './vertex-client';

function apiError(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

const BASE_OPTS: GenerateContentOptions = {
  model: 'gemini-3.5-flash',
  prompt: 'classify: stainless steel hex bolts M10',
  thinkingLevel: 'low',
};

describe('GeminiDeveloperLlmProvider', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockCtor.mockReset();
    process.env.GEMINI_API_KEY = 'test-free-tier-key';
  });

  afterEach(() => {
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
});

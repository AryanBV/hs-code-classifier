/**
 * Unit tests for the OpenRouter generateContent client (EVAL-ONLY, Phase A/B).
 *
 * The `openai` SDK is mocked so the adapter's mapping is asserted in isolation,
 * with NO network calls:
 *  (a) requires OPENROUTER_API_KEY + OPENROUTER_MODEL (clear errors);
 *  (b) builds an OpenAI-compatible chat request: baseURL, attribution headers,
 *      the candidate model from OPENROUTER_MODEL, system+user messages,
 *      response_format: json_schema (strict), reasoning effort from thinkingLevel;
 *  (c) maps the chat completion → GenerateContentResult (usage incl. reasoning
 *      tokens; finish_reason='length' → MaxTokensError; model echoes the candidate id);
 *  (d) falls back to json_object on a json_schema provider rejection (schema 4xx);
 *  (e) falls back to json_object when json_schema returns non-JSON text;
 *  (f) OPENROUTER_FORCE_JSON_OBJECT forces the plain JSON-mode path;
 *  (g) retries a transient 503 then succeeds; surfaces a hard 4xx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreate = vi.fn();
const mockCtor = vi.fn();

vi.mock('openai', () => ({
  default: class {
    public chat: { completions: { create: (...a: unknown[]) => unknown } };
    constructor(opts: unknown) {
      mockCtor(opts);
      this.chat = { completions: { create: (...a: unknown[]) => mockCreate(...a) } };
    }
  },
}));

import { OpenRouterLlmProvider } from './openrouter-client';
import * as backoff from './retry-backoff';
import { MaxTokensError, type GenerateContentOptions } from './vertex-client';

function apiError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

function completion(opts: {
  content?: string;
  finishReason?: string;
  prompt?: number;
  completion?: number;
  reasoning?: number;
  total?: number;
}): unknown {
  const usage: Record<string, unknown> = {
    prompt_tokens: opts.prompt ?? 0,
    completion_tokens: opts.completion ?? 0,
    total_tokens: opts.total ?? (opts.prompt ?? 0) + (opts.completion ?? 0),
  };
  if (opts.reasoning !== undefined) {
    usage.completion_tokens_details = { reasoning_tokens: opts.reasoning };
  }
  return {
    choices: [{ message: { content: opts.content ?? '{}' }, finish_reason: opts.finishReason ?? 'stop' }],
    usage,
  };
}

const BASE_OPTS: GenerateContentOptions = {
  model: 'gemini-3.5-flash',
  prompt: 'classify: stainless steel hex bolts M10',
  thinkingLevel: 'low',
  responseSchema: {
    type: 'object',
    properties: { code: { type: 'string' }, material: { type: ['string', 'null'] } },
    required: ['code'],
  },
  responseMimeType: 'application/json',
};

describe('OpenRouterLlmProvider', () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  const originalForce = process.env.OPENROUTER_FORCE_JSON_OBJECT;
  let sleepSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCreate.mockReset();
    mockCtor.mockReset();
    process.env.OPENROUTER_API_KEY = 'test-or-key';
    process.env.OPENROUTER_MODEL = 'qwen/qwen3.7-max';
    delete process.env.OPENROUTER_FORCE_JSON_OBJECT;
    delete process.env.GEMINI_MAX_RETRY_WAIT_MS;
    delete process.env.GEMINI_MAX_TOTAL_RETRY_WAIT_MS;
    sleepSpy = vi.spyOn(backoff, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sleepSpy.mockRestore();
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
    if (originalForce === undefined) delete process.env.OPENROUTER_FORCE_JSON_OBJECT;
    else process.env.OPENROUTER_FORCE_JSON_OBJECT = originalForce;
  });

  it('throws a clear error when OPENROUTER_API_KEY is missing (no SDK call)', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const p = new OpenRouterLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws a clear error when OPENROUTER_MODEL is missing', async () => {
    delete process.env.OPENROUTER_MODEL;
    const p = new OpenRouterLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/OPENROUTER_MODEL is not set/);
  });

  it('constructs the OpenAI client with the OpenRouter baseURL + attribution headers', async () => {
    mockCreate.mockResolvedValue(completion({ content: '{"code":"7318.15.00"}' }));
    const p = new OpenRouterLlmProvider();
    await p.generateContent(BASE_OPTS);
    expect(mockCtor).toHaveBeenCalledTimes(1);
    const ctorArg = mockCtor.mock.calls[0][0] as {
      apiKey: string;
      baseURL: string;
      defaultHeaders: Record<string, string>;
    };
    expect(ctorArg.baseURL).toBe('https://openrouter.ai/api/v1');
    expect(ctorArg.apiKey).toBe('test-or-key');
    expect(ctorArg.defaultHeaders['HTTP-Referer']).toBeTruthy();
    expect(ctorArg.defaultHeaders['X-Title']).toBeTruthy();
  });

  it('uses the candidate model from OPENROUTER_MODEL, NOT the opts.model literal', async () => {
    mockCreate.mockResolvedValue(completion({ content: '{"code":"x"}' }));
    const p = new OpenRouterLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    const params = mockCreate.mock.calls[0][0] as { model: string };
    expect(params.model).toBe('qwen/qwen3.7-max'); // not 'gemini-3.5-flash'
    expect(res.model).toBe('qwen/qwen3.7-max'); // echoed for the token meter
  });

  it('sends system+user messages, json_schema response_format, and reasoning effort', async () => {
    mockCreate.mockResolvedValue(completion({ content: '{"code":"x"}' }));
    const p = new OpenRouterLlmProvider();
    await p.generateContent({ ...BASE_OPTS, systemInstruction: 'You are a tariff classifier.', thinkingLevel: 'high' });
    const params = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string; json_schema?: { name: string; strict: boolean; schema: Record<string, unknown> } };
      reasoning: { effort: string };
      temperature: number;
      max_tokens: number;
    };
    expect(params.messages[0]).toEqual({ role: 'system', content: 'You are a tariff classifier.' });
    expect(params.messages[1]).toEqual({ role: 'user', content: BASE_OPTS.prompt });
    expect(params.response_format.type).toBe('json_schema');
    expect(params.response_format.json_schema?.strict).toBe(true);
    // The sanitized/adapted schema: nullable type-array preserved.
    const schema = params.response_format.json_schema?.schema as Record<string, Record<string, Record<string, unknown>>>;
    expect(schema.properties.material.type).toEqual(['string', 'null']);
    expect(params.reasoning.effort).toBe('high');
    expect(params.temperature).toBe(0);
  });

  it('maps usage incl. reasoning tokens (no double-count) and reads finish_reason', async () => {
    mockCreate.mockResolvedValue(
      completion({ content: '{"code":"x"}', finishReason: 'stop', prompt: 1200, completion: 120, reasoning: 40, total: 1320 }),
    );
    const p = new OpenRouterLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.finishReason).toBe('stop');
    expect(res.usage.promptTokens).toBe(1200);
    // completion_tokens(120) includes reasoning(40); visible output = 80.
    expect(res.usage.outputTokens).toBe(80);
    expect(res.usage.thoughtsTokens).toBe(40);
    expect(res.usage.totalTokens).toBe(1320);
  });

  it("throws MaxTokensError on finish_reason 'length'", async () => {
    mockCreate.mockResolvedValue(completion({ content: '{"partial":', finishReason: 'length', prompt: 10, completion: 2000 }));
    const p = new OpenRouterLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toBeInstanceOf(MaxTokensError);
  });

  it('falls back to json_object when json_schema is rejected by the provider (schema 4xx)', async () => {
    mockCreate
      .mockRejectedValueOnce(apiError(400, 'json_schema response_format not supported by provider'))
      .mockResolvedValueOnce(completion({ content: '{"code":"7318.15.00"}' }));
    const p = new OpenRouterLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.text).toBe('{"code":"7318.15.00"}');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // 1st call used json_schema, 2nd used json_object.
    const first = mockCreate.mock.calls[0][0] as { response_format: { type: string } };
    const second = mockCreate.mock.calls[1][0] as { response_format: { type: string } };
    expect(first.response_format.type).toBe('json_schema');
    expect(second.response_format.type).toBe('json_object');
  });

  it('falls back to json_object when json_schema returns non-JSON text', async () => {
    mockCreate
      .mockResolvedValueOnce(completion({ content: 'I cannot output JSON here.' }))
      .mockResolvedValueOnce(completion({ content: '{"code":"7318.15.00"}' }));
    const p = new OpenRouterLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.text).toBe('{"code":"7318.15.00"}');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const second = mockCreate.mock.calls[1][0] as { response_format: { type: string } };
    expect(second.response_format.type).toBe('json_object');
  });

  it('does NOT fall back when json_schema returns valid JSON on the first try', async () => {
    mockCreate.mockResolvedValue(completion({ content: '{"code":"7318.15.00"}' }));
    const p = new OpenRouterLlmProvider();
    await p.generateContent(BASE_OPTS);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('OPENROUTER_FORCE_JSON_OBJECT=true uses plain JSON-mode from the start', async () => {
    process.env.OPENROUTER_FORCE_JSON_OBJECT = 'true';
    mockCreate.mockResolvedValue(completion({ content: '{"code":"x"}' }));
    const p = new OpenRouterLlmProvider();
    await p.generateContent(BASE_OPTS);
    const params = mockCreate.mock.calls[0][0] as { response_format: { type: string } };
    expect(params.response_format.type).toBe('json_object');
  });

  it('retries a transient 503 then succeeds', async () => {
    mockCreate
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(completion({ content: '{"code":"x"}' }));
    const p = new OpenRouterLlmProvider();
    const res = await p.generateContent(BASE_OPTS);
    expect(res.text).toBe('{"code":"x"}');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('surfaces a hard 4xx that is not a schema rejection (no fallback, no retry)', async () => {
    mockCreate.mockRejectedValue(apiError(401, 'invalid api key'));
    const p = new OpenRouterLlmProvider();
    await expect(p.generateContent(BASE_OPTS)).rejects.toThrow(/invalid api key/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

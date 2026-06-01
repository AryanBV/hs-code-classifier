/**
 * Unit tests for the hybrid LLM-provider seam (Phase A2) — mocked, no network.
 *
 * Asserts the factory wiring in isolation:
 *  (a) LLM_PROVIDER unset / 'developer' → the Gemini Developer impl;
 *  (b) LLM_PROVIDER='vertex' → the Vertex adapter, which delegates to
 *      vertex-client.generateContent (the preserved rollback path);
 *  (c) an unknown LLM_PROVIDER throws a clear error;
 *  (d) the facade `generateContent` delegates to the active provider.
 *
 * Both concrete clients are mocked so this file never touches @google/genai or
 * the network — it tests the seam, not the providers (those have their own files).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVertexGenerateContent = vi.fn();
const mockDevGenerateContent = vi.fn();

vi.mock('./vertex-client', async (importOriginal) => {
  // Keep the real types/MaxTokensError/sanitizeResponseSchema; stub only the call.
  const actual = await importOriginal<typeof import('./vertex-client')>();
  return {
    ...actual,
    generateContent: (...args: unknown[]) => mockVertexGenerateContent(...args),
  };
});

vi.mock('./gemini-developer-client', () => ({
  GeminiDeveloperLlmProvider: class {
    generateContent(...args: unknown[]): unknown {
      return mockDevGenerateContent(...args);
    }
  },
}));

import { getLlmProvider, generateContent } from './llm-provider';
import type { GenerateContentOptions, GenerateContentResult } from './llm-provider';

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

describe('getLlmProvider', () => {
  const original = process.env.LLM_PROVIDER;

  beforeEach(() => {
    mockVertexGenerateContent.mockReset();
    mockDevGenerateContent.mockReset();
    // The factory caches per resolved choice; flipping env between tests proves
    // re-resolution, but reset env each time for isolation.
    delete process.env.LLM_PROVIDER;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = original;
  });

  it('returns the Gemini Developer provider by default (env unset)', async () => {
    mockDevGenerateContent.mockResolvedValue(RESULT);
    const p = getLlmProvider();
    const res = await p.generateContent(OPTS);
    expect(res).toBe(RESULT);
    expect(mockDevGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockVertexGenerateContent).not.toHaveBeenCalled();
  });

  it("returns the Gemini Developer provider for LLM_PROVIDER='developer'", async () => {
    process.env.LLM_PROVIDER = 'developer';
    mockDevGenerateContent.mockResolvedValue(RESULT);
    await getLlmProvider().generateContent(OPTS);
    expect(mockDevGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("returns the Vertex adapter for LLM_PROVIDER='vertex' and delegates to vertex-client", async () => {
    process.env.LLM_PROVIDER = 'vertex';
    mockVertexGenerateContent.mockResolvedValue(RESULT);
    const res = await getLlmProvider().generateContent(OPTS);
    expect(res).toBe(RESULT);
    expect(mockVertexGenerateContent).toHaveBeenCalledTimes(1);
    // The adapter forwards the exact opts object to the preserved Vertex path.
    expect(mockVertexGenerateContent).toHaveBeenCalledWith(OPTS);
    expect(mockDevGenerateContent).not.toHaveBeenCalled();
  });

  it('throws a clear error for an unknown LLM_PROVIDER', () => {
    process.env.LLM_PROVIDER = 'openai';
    expect(() => getLlmProvider()).toThrow(/Unknown LLM_PROVIDER='openai'/);
  });

  it('re-resolves when the env flips between calls (no import-frozen singleton)', async () => {
    process.env.LLM_PROVIDER = 'vertex';
    mockVertexGenerateContent.mockResolvedValue(RESULT);
    await getLlmProvider().generateContent(OPTS);
    expect(mockVertexGenerateContent).toHaveBeenCalledTimes(1);

    process.env.LLM_PROVIDER = 'developer';
    mockDevGenerateContent.mockResolvedValue(RESULT);
    await getLlmProvider().generateContent(OPTS);
    expect(mockDevGenerateContent).toHaveBeenCalledTimes(1);
  });
});

describe('generateContent facade', () => {
  const original = process.env.LLM_PROVIDER;
  beforeEach(() => {
    mockVertexGenerateContent.mockReset();
    mockDevGenerateContent.mockReset();
    delete process.env.LLM_PROVIDER;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = original;
  });

  it('delegates to the active provider (developer by default)', async () => {
    mockDevGenerateContent.mockResolvedValue(RESULT);
    const res = await generateContent(OPTS);
    expect(res).toBe(RESULT);
    expect(mockDevGenerateContent).toHaveBeenCalledWith(OPTS);
  });
});

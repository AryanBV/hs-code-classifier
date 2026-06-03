/**
 * OpenRouter generateContent client (EVAL-ONLY, Phase A/B measurement lever).
 *
 * ⚠️ EVAL-ONLY — NEVER SET `LLM_PROVIDER=openrouter` IN RAILWAY / PRODUCTION. ⚠️
 *
 * This is a measurement sibling of `gemini-developer-client.ts` / `vertex-client.ts`.
 * It serves the SAME v2 generateContent calls (L1 Triage, L4 Select, the
 * Gemini-Flash reranker) but routes them through OpenRouter so we can A/B
 * CANDIDATE models (Qwen3.7-Max, Kimi K2.6, MiMo-V2.5-Pro, …) against the frozen
 * gemini-3.5-flash baseline on the gold eval suite, WITHOUT touching any layer
 * logic. It exists purely so the eval runner can answer "would model X beat
 * Flash on our 343-gold-code suite?" before any production model swap.
 *
 * Contract REUSE (nothing reimplemented): the options type, the result type,
 * `MaxTokensError`, `sanitizeResponseSchema`, and the `GenerateContentUsage`
 * shape all come from `vertex-client.ts`. This file only adapts our options →
 * an OpenAI-compatible chat completion and the response → our result.
 *
 * WHY OpenAI SDK: OpenRouter is OpenAI-API-compatible, so we reuse the existing
 * `openai` dependency with `baseURL = https://openrouter.ai/api/v1` and
 * `OPENROUTER_API_KEY` — no new dependency.
 *
 * MODEL KNOB (generic): the v2 call sites all pass `model: 'gemini-3.5-flash'`.
 * Under OpenRouter we IGNORE that literal and substitute the candidate model id
 * from env `OPENROUTER_MODEL` (e.g. `qwen/qwen3.7-max`). One env var swaps the
 * model under test across L1 + L4 + reranker — exactly what an A/B run needs.
 * The returned `result.model` echoes the OpenRouter id so token-meter buckets +
 * eval diagnostics attribute cost to the real model.
 *
 * STRUCTURED OUTPUT (the crucial part): L1/L4/reranker require STRICT JSON. We
 * map our sanitized OpenAPI-3.0-subset schema → OpenAI-style
 * `response_format: { type: 'json_schema', json_schema: { name, strict, schema } }`
 * (see `lib/openrouter-schema-adapter.ts`). For a model whose provider rejects
 * `json_schema` (or returns malformed output under it) we FALL BACK to plain
 * JSON-mode (`response_format: { type: 'json_object' }`) plus a tolerant
 * brace-extraction parse and ONE repair retry. The fallback is faithful: a
 * sloppy adapter would make a model look worse than it is (false negative).
 *
 * EMBEDDINGS are NOT routed here — only the LLM generate calls. Retrieval stays
 * on `gemini-embedding-001` via the embedding-provider seam (unchanged).
 */
import OpenAI from 'openai';
import {
  MaxTokensError,
  type GenerateContentOptions,
  type GenerateContentResult,
  type GenerateContentUsage,
} from './vertex-client';
import type { ThinkingLevel } from './thinking-config';
import type { LlmProvider } from './llm-provider';
import { toOpenAiJsonSchema, looksLikeValidJsonObject } from './openrouter-schema-adapter';
import * as backoff from './retry-backoff';
import { TransportError } from './transport-error';

/** OpenRouter's OpenAI-compatible base URL. */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Default OpenRouter app-attribution headers (recommended by OpenRouter so usage
 * is identifiable). Overridable via env so an eval run can label itself.
 */
const DEFAULT_REFERER = 'https://hscode.prevyl.com';
const DEFAULT_TITLE = 'HS Code Classifier (eval)';

/**
 * Map our `thinkingLevel` → OpenRouter's `reasoning.effort`. Reasoning-capable
 * candidates (all three target models list `reasoning` in supported_parameters)
 * honor it; models that don't support it ignore the field. This keeps the A/B
 * faithful to the baseline's thinking budget (Flash runs thinking_level=low for
 * triage/rerank and the L4 default).
 */
const REASONING_EFFORT: Record<ThinkingLevel, 'low' | 'medium' | 'high'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

interface HttpErrorLike {
  status?: number;
  code?: string;
  response?: { status?: number };
}

/**
 * Transient-error classifier mirroring the Gemini Developer client. The OpenAI
 * SDK throws `APIError` with a top-level numeric `status`; retry 429 / 5xx and
 * transient network codes, surface everything else immediately.
 */
function isRetryable(err: unknown): boolean {
  const e = err as HttpErrorLike;
  const status = typeof e?.status === 'number' ? e.status : e?.response?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
  }
  const code = e?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN' || code === 'ECONNABORTED') {
    return true;
  }
  return false;
}

/** Resolve the candidate model id from env. EVAL knob — required when active. */
function resolveModel(): string {
  const m = process.env.OPENROUTER_MODEL?.trim();
  if (typeof m !== 'string' || m.length === 0) {
    throw new Error(
      'openrouter-client: OPENROUTER_MODEL is not set. LLM_PROVIDER=openrouter is EVAL-ONLY and ' +
        'requires a candidate model id (e.g. OPENROUTER_MODEL=qwen/qwen3.7-max).',
    );
  }
  return m;
}

/**
 * Should the structured-output adapter use strict `json_schema` for this model?
 * Default ON (all three target candidates support it). Set
 * `OPENROUTER_FORCE_JSON_OBJECT=true` to force the plain JSON-mode fallback for a
 * model whose provider rejects `json_schema`.
 */
function useJsonObjectFallbackForced(): boolean {
  return (process.env.OPENROUTER_FORCE_JSON_OBJECT ?? '').trim().toLowerCase() === 'true';
}

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ResponseFormat = ChatParams['response_format'];

/**
 * LlmProvider impl on OpenRouter (OpenAI-compatible chat completions).
 *
 * The `OpenAI` client is constructed lazily so module import (and tests that mock
 * the SDK) don't require `OPENROUTER_API_KEY`, and so a clear error is thrown at
 * call time if the key is missing.
 */
export class OpenRouterLlmProvider implements LlmProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client !== null) return this.client;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error(
        'openrouter-client: OPENROUTER_API_KEY is not set. The OpenRouter EVAL provider requires an ' +
          'OpenRouter API key in the environment.',
      );
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_REFERER?.trim() || DEFAULT_REFERER,
        'X-Title': process.env.OPENROUTER_TITLE?.trim() || DEFAULT_TITLE,
      },
    });
    return this.client;
  }

  async generateContent(opts: GenerateContentOptions): Promise<GenerateContentResult> {
    const model = resolveModel();
    const temperature = opts.temperature ?? 0.0;
    const maxOutputTokens = opts.maxOutputTokens ?? 2048;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (opts.systemInstruction) {
      messages.push({ role: 'system', content: opts.systemInstruction });
    }
    messages.push({ role: 'user', content: opts.prompt });

    // Structured-output strategy: strict json_schema first (unless forced to
    // fallback). On a json_schema 4xx (provider rejects the schema) OR a parse
    // failure under json_schema, retry ONCE with the plain json_object fallback.
    const wantJson = opts.responseSchema !== undefined || opts.responseMimeType === 'application/json';
    const forceFallback = useJsonObjectFallbackForced();

    const strictFormat: ResponseFormat | undefined =
      wantJson && opts.responseSchema !== undefined && !forceFallback
        ? {
            type: 'json_schema',
            json_schema: {
              name: 'classifier_output',
              strict: true,
              schema: toOpenAiJsonSchema(opts.responseSchema),
            },
          }
        : undefined;

    const fallbackFormat: ResponseFormat | undefined = wantJson
      ? { type: 'json_object' }
      : undefined;

    const reasoningEffort = REASONING_EFFORT[opts.thinkingLevel];

    // First attempt: strict json_schema when available, else the fallback format.
    const firstFormat = strictFormat ?? fallbackFormat;
    const t0 = Date.now();

    let firstErr: unknown = null;
    let res: GenerateContentResult | null = null;
    try {
      res = await this.callOnce(model, messages, temperature, maxOutputTokens, firstFormat, reasoningEffort, t0);
    } catch (e: unknown) {
      firstErr = e;
    }

    // FALLBACK trigger 1 — json_schema produced parse-able-but-empty / non-JSON
    // text. callOnce returns a result with the raw text; if we asked for JSON via
    // json_schema and the text isn't a JSON object, fall back to json_object.
    const strictParseFailed =
      res !== null && strictFormat !== undefined && wantJson && !looksLikeValidJsonObject(res.text);

    // FALLBACK trigger 2 — json_schema HARD-rejected by the provider (a 4xx that
    // is NOT a transient). Some OpenRouter providers 400 on json_schema even when
    // the model lists structured_outputs; the faithful move is to retry the SAME
    // request in plain JSON-mode rather than score the model as a failure.
    const strictRejected =
      res === null &&
      strictFormat !== undefined &&
      firstErr !== null &&
      !isRetryable(firstErr) &&
      isLikelySchemaRejection(firstErr);

    if ((strictParseFailed || strictRejected) && fallbackFormat !== undefined) {
      // eslint-disable-next-line no-console
      console.log(
        `[openrouter] ${model}: json_schema ${strictRejected ? 'rejected by provider' : 'parse failed'}; ` +
          'retrying once with json_object fallback.',
      );
      return this.callOnce(model, messages, temperature, maxOutputTokens, fallbackFormat, reasoningEffort, t0);
    }

    if (res !== null) return res;
    // No fallback applicable — rethrow the original (transient-wrapped) error.
    throw firstErr;
  }

  /**
   * One OpenRouter chat completion with retry/backoff, mapping the response to
   * our `GenerateContentResult`. `finish_reason === 'length'` → MaxTokensError
   * (mirrors the Gemini MAX_TOKENS contract). Retries 429 (server-delay-aware) /
   * 5xx / network via the shared RetryController; non-transient errors surface.
   */
  private async callOnce(
    model: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: number,
    maxOutputTokens: number,
    responseFormat: ResponseFormat | undefined,
    reasoningEffort: 'low' | 'medium' | 'high',
    t0: number,
  ): Promise<GenerateContentResult> {
    const client = this.getClient();
    const retry = new backoff.RetryController();
    let attempts = 0;

    const params: ChatParams & { reasoning?: { effort: 'low' | 'medium' | 'high' } } = {
      model,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
      // OpenRouter passes `reasoning` to reasoning-capable models; others ignore it.
      reasoning: { effort: reasoningEffort },
    };
    if (responseFormat !== undefined) {
      params.response_format = responseFormat;
    }

    for (;;) {
      attempts += 1;
      try {
        const resp = await client.chat.completions.create(params);
        const latencyMs = Date.now() - t0;

        const choice = resp.choices?.[0];
        const text = choice?.message?.content ?? '';
        const finishReason = choice?.finish_reason ?? 'unknown';

        const u = resp.usage;
        const promptTokens = u?.prompt_tokens ?? 0;
        const outputTokens = u?.completion_tokens ?? 0;
        // OpenAI/OpenRouter surface reasoning tokens under
        // completion_tokens_details.reasoning_tokens when present. They are a
        // SUBSET of completion_tokens, so we report them in `thoughtsTokens` for
        // visibility but DON'T double-count: outputTokens already includes them,
        // and our cost model bills output+thoughts — so we subtract reasoning out
        // of `outputTokens` to keep total = prompt+output+thoughts consistent.
        const reasoningTokens =
          (u?.completion_tokens_details as { reasoning_tokens?: number } | undefined)?.reasoning_tokens ?? 0;
        const visibleOutput = Math.max(0, outputTokens - reasoningTokens);
        const totalTokens = u?.total_tokens ?? promptTokens + outputTokens;

        const usage: GenerateContentUsage = {
          promptTokens,
          outputTokens: visibleOutput,
          thoughtsTokens: reasoningTokens,
          totalTokens,
        };

        if (finishReason === 'length') {
          throw new MaxTokensError(text, usage, model);
        }

        return {
          text,
          usage,
          finishReason: String(finishReason),
          latencyMs,
          // Echo the OpenRouter candidate id so meter/cost attribute correctly.
          // (Typed as GeminiModel on the contract; the eval consumes it as a
          // string — the contract's `model` is only used for logging/metering.)
          model: model as GenerateContentResult['model'],
        };
      } catch (e: unknown) {
        if (e instanceof MaxTokensError) throw e;
        if (!isRetryable(e)) throw e;
        const waited = await retry.nextWait(e, backoff.sleep);
        if (waited === null) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new TransportError(
            `[openrouter-client] After ${attempts} retry attempts: ${msg}`,
            { cause: e },
          );
        }
      }
    }
  }
}

/**
 * Heuristic: is this a provider rejection of the `json_schema` response_format
 * (vs an unrelated 4xx)? OpenRouter/upstream errors that reject structured
 * outputs mention `response_format`, `json_schema`, `schema`, or
 * `structured output`. Conservative — only triggers the fallback for a clear
 * schema-related 4xx so unrelated 400s (bad model id, etc.) still surface.
 */
function isLikelySchemaRejection(err: unknown): boolean {
  const e = err as HttpErrorLike;
  const status = typeof e?.status === 'number' ? e.status : e?.response?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('json_schema') ||
    msg.includes('response_format') ||
    msg.includes('structured output') ||
    msg.includes('structured_outputs') ||
    msg.includes('schema')
  );
}

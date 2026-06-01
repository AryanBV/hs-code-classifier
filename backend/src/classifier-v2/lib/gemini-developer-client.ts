/**
 * Gemini Developer API generateContent client (Phase A2).
 *
 * Behavior-preserving sibling of `lib/vertex-client.ts`: it serves the SAME v2
 * generateContent calls (L1 Triage, L4 Select, Gemini-Flash reranker) but via
 * the Gemini Developer API free-tier key (`GEMINI_API_KEY`) through the official
 * `@google/genai` SDK, instead of raw-HTTPS Vertex AI. Vertex billing was
 * disabled 2026-06-01; the free-tier Developer API runs the SAME models for free.
 *
 * Contract REUSE (nothing reimplemented): the options type, the result type,
 * `MaxTokensError`, `sanitizeResponseSchema`, and the `GenerateContentUsage`
 * shape all come from `vertex-client.ts`. This file only adapts our options →
 * the SDK request and the SDK response → our result.
 *
 * Differences from the Vertex path, all on the request/transport side only:
 *   - Auth: `new GoogleGenAI({ apiKey: GEMINI_API_KEY })` (x-goog-api-key) vs SA.
 *   - thinkingConfig is built HERE in camelCase for the SDK:
 *       gemini-3.x  → { thinkingLevel: 'low'|'medium'|'high' }
 *       gemini-2.5-* → { thinkingBudget: <int> }
 *     (We do NOT call the snake_case `thinking-config` helper — that emits the
 *      raw Vertex wire shape; the SDK wants camelCase and serializes it itself.)
 *   - responseSchema is the SAME sanitized OpenAPI-3.0 subset `sanitizeResponseSchema`
 *     already produces — passed through unchanged.
 *
 * Token meter (for Phase A3): `usageMetadata.promptTokenCount` INCLUDES cached
 * tokens; `cachedContentTokenCount` is the cached portion. We surface the latter
 * as `usage.cachedTokens` (additive field on the returned usage object) so A3 can
 * reconnect the meter that the old path captured-then-discarded.
 */
import {
  GoogleGenAI,
  ThinkingLevel as SdkThinkingLevel,
  type GenerateContentParameters,
  type ThinkingConfig as SdkThinkingConfig,
} from '@google/genai';
import {
  MaxTokensError,
  sanitizeResponseSchema,
  type GenerateContentOptions,
  type GenerateContentResult,
  type GenerateContentUsage,
} from './vertex-client';
import type { ThinkingLevel } from './thinking-config';
import type { LlmProvider } from './llm-provider';
import * as backoff from './retry-backoff';

/**
 * Usage augmented with the cached-token portion for A3. `cachedTokens` is the
 * `cachedContentTokenCount` (already INCLUDED inside `promptTokens`). It is a
 * structural superset of `GenerateContentUsage`, so it assigns cleanly into the
 * `usage` field of `GenerateContentResult`.
 */
export interface GenerateContentUsageWithCache extends GenerateContentUsage {
  cachedTokens: number;
}

/** thinkingBudget mapping for gemini-2.5-* (mirrors thinking-config's BUDGET_MAP). */
const BUDGET_MAP: Record<ThinkingLevel, number> = {
  low: 128,
  medium: 1024,
  high: 8192,
};

/** Map our lowercase level → the SDK's ThinkingLevel enum (the SDK serializes it). */
const SDK_LEVEL_MAP: Record<ThinkingLevel, SdkThinkingLevel> = {
  low: SdkThinkingLevel.LOW,
  medium: SdkThinkingLevel.MEDIUM,
  high: SdkThinkingLevel.HIGH,
};

/**
 * Build the SDK camelCase `thinkingConfig` for the model + level.
 *   - gemini-3.* → { thinkingLevel: <SDK enum> }
 *   - gemini-2.5-* → { thinkingBudget: <int> }
 *   - anything else → throws (matches thinking-config's contract)
 */
function buildThinkingConfig(model: string, level: ThinkingLevel): SdkThinkingConfig {
  if (model.startsWith('gemini-3.')) {
    return { thinkingLevel: SDK_LEVEL_MAP[level] };
  }
  if (model.startsWith('gemini-2.5-')) {
    return { thinkingBudget: BUDGET_MAP[level] };
  }
  throw new Error(`gemini-developer-client: unsupported model "${model}"`);
}

interface HttpErrorLike {
  status?: number;
  code?: string;
  response?: { status?: number };
}

/**
 * Transient-error classifier mirroring `vertex-client.isRetryable`, extended for
 * the @google/genai `ApiError` shape which carries a top-level numeric `status`
 * (vs google-auth-library's nested `response.status`). Retries 429 / 5xx and
 * transient network codes.
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


/**
 * LlmProvider impl on the Gemini Developer API (`@google/genai`).
 *
 * The `GoogleGenAI` client is constructed lazily on first use so module import
 * (and tests that mock the SDK) don't require `GEMINI_API_KEY` to be set, and so
 * a clear error is thrown at call time if the key is missing.
 */
export class GeminiDeveloperLlmProvider implements LlmProvider {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (this.client !== null) return this.client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error(
        'gemini-developer-client: GEMINI_API_KEY is not set. The Gemini Developer API provider requires a free-tier AI Studio key in the environment.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  async generateContent(opts: GenerateContentOptions): Promise<GenerateContentResult> {
    const temperature = opts.temperature ?? 0.0;
    const maxOutputTokens = opts.maxOutputTokens ?? 2048;

    const config: NonNullable<GenerateContentParameters['config']> = {
      temperature,
      maxOutputTokens,
      thinkingConfig: buildThinkingConfig(opts.model, opts.thinkingLevel),
    };

    if (opts.systemInstruction) {
      config.systemInstruction = opts.systemInstruction;
    }

    if (opts.responseSchema) {
      // SAME OpenAPI-3.0 subset the Vertex path uses — passed through unchanged.
      config.responseSchema = sanitizeResponseSchema(opts.responseSchema);
      config.responseMimeType = opts.responseMimeType ?? 'application/json';
    } else if (opts.responseMimeType) {
      config.responseMimeType = opts.responseMimeType;
    }

    const params: GenerateContentParameters = {
      model: opts.model,
      contents: opts.prompt,
      config,
    };

    const client = this.getClient();

    const t0 = Date.now();
    const retry = new backoff.RetryController();
    let attempts = 0;

    for (;;) {
      attempts += 1;
      try {
        const resp = await client.models.generateContent(params);
        const latencyMs = Date.now() - t0;

        const text = resp.text ?? '';
        const candidate = resp.candidates?.[0];
        const finishReason = candidate?.finishReason ?? 'UNKNOWN';

        const meta = resp.usageMetadata;
        const usage: GenerateContentUsageWithCache = {
          promptTokens: meta?.promptTokenCount ?? 0,
          outputTokens: meta?.candidatesTokenCount ?? 0,
          thoughtsTokens: meta?.thoughtsTokenCount ?? 0,
          totalTokens: meta?.totalTokenCount ?? 0,
          // promptTokens INCLUDES cached tokens; this is the cached portion (A3).
          cachedTokens: meta?.cachedContentTokenCount ?? 0,
        };

        if (finishReason === 'MAX_TOKENS') {
          throw new MaxTokensError(text, usage, opts.model);
        }

        return {
          text,
          usage,
          // finishReason is a string-valued enum; coerce to string for our contract.
          finishReason: String(finishReason),
          latencyMs,
          model: opts.model,
        };
      } catch (e: unknown) {
        // MaxTokensError is a budget-config problem, not transient — surface now.
        if (e instanceof MaxTokensError) {
          throw e;
        }
        // Non-transient (other 4xx, etc.) → surface immediately, unchanged.
        if (!isRetryable(e)) {
          throw e;
        }
        // Rate-limit-aware backoff: 429 honors the server delay (capped) with a
        // higher attempt budget; 503/network keep the fast exponential backoff.
        const waited = await retry.nextWait(e, backoff.sleep);
        if (waited === null) {
          const msg = e instanceof Error ? e.message : String(e);
          const wrapped = new Error(`[gemini-developer-client] After ${attempts} retry attempts: ${msg}`);
          (wrapped as Error & { cause?: unknown }).cause = e;
          throw wrapped;
        }
      }
    }
  }
}

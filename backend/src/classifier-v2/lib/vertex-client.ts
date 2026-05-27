/**
 * Raw-HTTPS Vertex AI generateContent client for the Phase 4 v2 pipeline.
 *
 * Supports the three models used across the v2 pipeline:
 *   - `gemini-3.5-flash`         — Triage + Select (`thinking_level: 'low'`)
 *   - `gemini-3.1-pro-preview`   — Tiebreak + Deep-Think (`thinking_level: 'high'`)
 *   - `gemini-2.5-pro`           — fallback for Pro tier (uses `thinkingBudget`)
 *
 * Auth path: `lib/auth.ts` (GoogleAuth with cloud-platform scope, SA JSON via
 * GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Wire format: `thinking_level` is snake_case on the wire. `thinkingConfig` is
 * built model-conditionally by `lib/thinking-config.ts` so 3.x and 2.5 use the
 * correct API (mixing returns HTTP 400).
 *
 * Endpoint: region `global` uses host `aiplatform.googleapis.com`
 * (no region prefix); other regions use `<region>-aiplatform.googleapis.com`.
 *
 * Reference probe: `backend/scripts/verify-vertex-sa.ts`.
 * Sub-specs: 03 (thinking_level), 05 (model IDs).
 */
import type { AuthClient } from 'google-auth-library';
import { getAuthClient, getProjectId } from './auth';
import { thinkingConfig, type ThinkingLevel } from './thinking-config';

export type GeminiModel = 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-2.5-pro';

export type Region = 'global' | 'us-central1';

export { ThinkingLevel };

/**
 * Minimal OpenAPI-subset schema type accepted by Vertex `responseSchema`.
 * The shape models the common fields we use; the index signature allows
 * extension fields Vertex accepts but we don't explicitly model (e.g.,
 * `minimum`, `maximum`, `format`, `nullable`).
 *
 * `type` is optional at this layer because callers building schemas
 * programmatically (e.g., L1 Triage) may pass `Record<string, unknown>`
 * shapes that haven't been narrowed yet — Vertex itself validates at the
 * API boundary. Prefer setting `type` in new code for IDE assistance.
 */
export interface VertexResponseSchema {
  type?:                 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?:           Record<string, VertexResponseSchema | { type: string; [key: string]: unknown }>;
  items?:                VertexResponseSchema | { type: string; [key: string]: unknown };
  required?:             string[];
  enum?:                 (string | number)[];
  allOf?:                VertexResponseSchema[];
  oneOf?:                VertexResponseSchema[];
  additionalProperties?: boolean;
  description?:          string;
  // Allow extension for properties used in the OpenAPI subset Vertex accepts
  [key: string]: unknown;
}

export interface GenerateContentOptions {
  model:               GeminiModel;
  prompt:              string;
  systemInstruction?:  string;
  thinkingLevel:       ThinkingLevel;
  responseSchema?:     VertexResponseSchema;
  responseMimeType?:   'application/json' | 'text/plain';
  temperature?:        number;
  maxOutputTokens?:    number;
  region?:             Region;
}

export interface GenerateContentUsage {
  promptTokens:   number;
  outputTokens:   number;
  thoughtsTokens: number;
  totalTokens:    number;
}

export interface GenerateContentResult {
  text:         string;
  usage:        GenerateContentUsage;
  finishReason: string;
  latencyMs:    number;
  model:        GeminiModel;
}

/**
 * Thrown when Vertex returns `finishReason === 'MAX_TOKENS'`. Surfaces the
 * (truncated) text, usage breakdown, and model so callers can decide whether
 * to retry with a larger `maxOutputTokens` or fall back. Common when thinking
 * tokens consume most of the budget before generation begins.
 */
export class MaxTokensError extends Error {
  constructor(
    public readonly partialText: string,
    public readonly usage: { promptTokens: number; outputTokens: number; thoughtsTokens: number; totalTokens: number },
    public readonly model: string,
  ) {
    super(`Vertex generateContent for ${model} hit MAX_TOKENS; ${usage.thoughtsTokens} thinking tokens consumed before generation. Caller should increase maxOutputTokens.`);
    this.name = 'MaxTokensError';
  }
}

interface VertexUsageMetadata {
  promptTokenCount?:     number;
  candidatesTokenCount?: number;
  totalTokenCount?:      number;
  thoughtsTokenCount?:   number;
}

interface VertexCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface VertexResponse {
  candidates?: VertexCandidate[];
  usageMetadata?: VertexUsageMetadata;
}

function endpoint(region: Region, projectId: string, model: GeminiModel): string {
  const host =
    region === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${region}-aiplatform.googleapis.com`;
  // Vertex global publisher path: /v1/projects/{project}/locations/global/publishers/google/models/{model}
  // 'global' is the correct location string (NOT 'us-central1' etc.) — verified by backend/scripts/verify-vertex-sa.ts
  return `${host}/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;
}

interface GenerationConfig {
  temperature:        number;
  maxOutputTokens:    number;
  thinkingConfig:     ReturnType<typeof thinkingConfig>;
  responseSchema?:    VertexResponseSchema;
  responseMimeType?:  'application/json' | 'text/plain';
}

interface RequestBody {
  contents:            Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?:  { parts: Array<{ text: string }> };
  generationConfig:    GenerationConfig;
}

interface HttpErrorLike {
  code?: string;
  response?: { status?: number };
}

function isRetryable(err: unknown): boolean {
  const e = err as HttpErrorLike;
  const status = e?.response?.status;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single-call generateContent against Vertex AI. Returns extracted text,
 * usage metrics, finish reason, and end-to-end latency.
 *
 * Retries 5xx / 429 / transient network errors (ECONNRESET, ETIMEDOUT) up to
 * 3 attempts with exponential backoff: `(2 ** attempt) * 500ms + 0-200ms
 * jitter`. After all retries exhausted, rethrows the original error with a
 * `[vertex-client] After 3 retry attempts:` prefix.
 *
 * Throws `MaxTokensError` if `finishReason === 'MAX_TOKENS'` so callers don't
 * silently `JSON.parse` truncated output. Other HTTP errors throw directly.
 */
export async function generateContent(opts: GenerateContentOptions): Promise<GenerateContentResult> {
  const region: Region = opts.region ?? 'global';
  const temperature = opts.temperature ?? 0.0;
  const maxOutputTokens = opts.maxOutputTokens ?? 2048;

  const generationConfig: GenerationConfig = {
    temperature,
    maxOutputTokens,
    thinkingConfig: thinkingConfig(opts.model, opts.thinkingLevel),
  };

  if (opts.responseSchema) {
    generationConfig.responseSchema = opts.responseSchema;
    generationConfig.responseMimeType = opts.responseMimeType ?? 'application/json';
  } else if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  const body: RequestBody = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig,
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const [client, projectId]: [AuthClient, string] = await Promise.all([
    getAuthClient(),
    getProjectId(),
  ]);
  const url = endpoint(region, projectId, opts.model);

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown = null;
  const t0 = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.request<VertexResponse>({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      const latencyMs = Date.now() - t0;

      const candidate = res.data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text ?? '';
      const finishReason = candidate?.finishReason ?? 'UNKNOWN';

      const usageMeta = res.data.usageMetadata ?? {};
      const usage: GenerateContentUsage = {
        promptTokens:   usageMeta.promptTokenCount ?? 0,
        outputTokens:   usageMeta.candidatesTokenCount ?? 0,
        thoughtsTokens: usageMeta.thoughtsTokenCount ?? 0,
        totalTokens:    usageMeta.totalTokenCount ?? 0,
      };

      if (finishReason === 'MAX_TOKENS') {
        throw new MaxTokensError(text, usage, opts.model);
      }

      return {
        text,
        usage,
        finishReason,
        latencyMs,
        model: opts.model,
      };
    } catch (e: unknown) {
      // MaxTokensError is not retryable — it indicates a budget config problem,
      // not a transient failure. Surface immediately.
      if (e instanceof MaxTokensError) {
        throw e;
      }
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1 && isRetryable(e)) {
        const backoff = (2 ** attempt) * 500 + Math.floor(Math.random() * 200);
        await sleep(backoff);
        continue;
      }
      // Not retryable, or final attempt exhausted.
      if (attempt === MAX_ATTEMPTS - 1 && isRetryable(e)) {
        const msg = e instanceof Error ? e.message : String(e);
        const wrapped = new Error(`[vertex-client] After ${MAX_ATTEMPTS} retry attempts: ${msg}`);
        // Preserve original for callers that want the underlying status/code
        (wrapped as Error & { cause?: unknown }).cause = e;
        throw wrapped;
      }
      throw e;
    }
  }

  // Unreachable — loop either returns or throws. Guard for the type checker.
  throw lastErr ?? new Error('[vertex-client] retry loop exited unexpectedly');
}

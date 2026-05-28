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

/* ---------------------------------------------------------------------------
 * responseSchema sanitizer — JSON-Schema-draft → Vertex OpenAPI-3.0 subset
 *
 * Vertex's `generationConfig.responseSchema` is a restricted OpenAPI-3.0-subset
 * proto, NOT full JSON-Schema-draft. The v2 prompt schemas (triage-v2.md,
 * select-v2.md) are authored in draft-07 and contain constructs Vertex's proto
 * REJECTS with HTTP 400 "Invalid JSON payload received":
 *   - `$schema`                       — unknown proto field.
 *   - `type: ["string", "null"]`      — proto `type` is a scalar enum, not a
 *                                       list ("Proto field is not repeating").
 *   - top-level `allOf`/`if`/`then`/`else` conditional composition — unknown
 *                                       proto fields.
 *   - `additionalProperties` / `const`— not in the OpenAPI subset.
 *
 * This sanitizer normalizes ANY incoming schema into the accepted subset so both
 * L1 Triage and L4 Select (which load draft-07 schemas verbatim from markdown)
 * work against the live API. The DROPPED conditional invariants (allOf/if/then)
 * are NOT lost functionally: each layer re-enforces those exact cross-field rules
 * AFTER parsing via its hand-rolled guard (isTriageOutput / isSelectOutput) and
 * its Zod schema. The wire schema's job is shape + enum + nullability, which the
 * subset fully expresses.
 *
 * Allowlist approach: only keywords known to be in the Vertex OpenAPI subset are
 * retained; everything else is dropped. `type: [...,"null"]` is rewritten to a
 * scalar type plus `nullable: true`; a bare `"null"` member of an `enum` array
 * is stripped (it is implied by `nullable`).
 * --------------------------------------------------------------------------- */

/** Keywords retained on a schema node (Vertex OpenAPI-3.0 subset). */
const VERTEX_SCHEMA_KEYWORDS = new Set<string>([
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'properties',
  'items',
  'required',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'pattern',
  'propertyOrdering',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Recursively convert a JSON-Schema(-draft) node into the Vertex OpenAPI subset.
 * Returns a NEW object — never mutates the input (the prompt cache must stay
 * pristine across calls/tests).
 */
export function sanitizeResponseSchema(schema: unknown): VertexResponseSchema {
  if (!isPlainObject(schema)) {
    // Defensive: non-object node (shouldn't occur for our schemas). Return as-is
    // wrapped so the type checker is satisfied; Vertex would reject anyway.
    return {} as VertexResponseSchema;
  }

  const out: Record<string, unknown> = {};

  // --- type + nullability ------------------------------------------------
  // draft uses `type: ["string","null"]` for nullable; Vertex needs a scalar
  // type + `nullable: true`.
  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((t) => t !== 'null');
    if (rawType.includes('null')) out.nullable = true;
    // Vertex accepts a single scalar type. If somehow >1 non-null type remains
    // (none of our schemas do this), take the first — the post-parse guards are
    // the real enforcement.
    if (nonNull.length > 0) out.type = nonNull[0];
  } else if (typeof rawType === 'string') {
    out.type = rawType;
  }

  // --- enum: strip a bare null member (implied by nullable) --------------
  if (Array.isArray(schema.enum)) {
    const filtered = schema.enum.filter((e) => e !== null);
    if (schema.enum.length !== filtered.length) out.nullable = true;
    out.enum = filtered;
  }

  // --- recurse into properties ------------------------------------------
  if (isPlainObject(schema.properties)) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = sanitizeResponseSchema(v);
    }
    out.properties = props;
  }

  // --- recurse into items -----------------------------------------------
  if (schema.items !== undefined) {
    out.items = sanitizeResponseSchema(schema.items);
  }

  // --- copy through remaining allowlisted scalar/array keywords ----------
  for (const key of VERTEX_SCHEMA_KEYWORDS) {
    if (key in out) continue; // already handled (type/enum/properties/items)
    if (key === 'properties' || key === 'items') continue;
    if (key in schema) out[key] = schema[key];
  }

  // Preserve an existing `nullable: true` if the source set it explicitly and
  // the type wasn't an array (the allowlist copy above handles it, but guard the
  // case where nullable was already set by the type-array branch).
  if (schema.nullable === true) out.nullable = true;

  return out as VertexResponseSchema;
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
    // Normalize JSON-Schema-draft → Vertex OpenAPI subset (drops $schema /
    // allOf / if-then, rewrites nullable type-arrays). Required: the v2 prompt
    // schemas are draft-07 and Vertex rejects them verbatim with HTTP 400.
    generationConfig.responseSchema = sanitizeResponseSchema(opts.responseSchema);
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

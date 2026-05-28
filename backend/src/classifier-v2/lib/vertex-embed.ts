/**
 * Minimal Vertex AI embedding client for `gemini-embedding-001` (1536-dim).
 *
 * Purpose: de-risk the migration off Cohere (trial key exhausted → 429s). This
 * is the keystone of the retrieval foundation — it must produce L2-normalized
 * vectors compatible with the existing 1536-dim pgvector column (cosine via
 * pgvector `<=>`, which assumes corpus vectors are L2-normalized).
 *
 * Auth: REUSES `lib/auth.ts` (`getAuthClient()` → AuthClient whose `.request()`
 * auto-attaches the SA Bearer token; `getProjectId()` resolves the GCP project).
 * Does NOT reimplement auth. Same SA JSON as the Gemini generateContent path.
 *
 * Wire contract (Vertex `aiplatform.googleapis.com`, `:predict`) — verified
 * against Google Cloud docs (2026):
 *   POST /v1/projects/{proj}/locations/us-central1/publishers/google/models/gemini-embedding-001:predict
 *   body: { instances: [{ content, task_type }], parameters: { outputDimensionality } }
 *   resp: { predictions: [{ embeddings: { values: number[] } }] }
 *
 * Field casing on Vertex `:predict` for this model is snake_case for instance
 * fields (`task_type`) and camelCase for the parameters block
 * (`outputDimensionality`). The vector lives at predictions[0].embeddings.values.
 *
 * Dimensionality: gemini-embedding-001 supports Matryoshka truncation via
 * `outputDimensionality`. Per Google docs, only the native 3072-dim output is
 * pre-normalized; any truncated dim (e.g. 1536) is NOT unit-norm and MUST be
 * manually L2-normalized before storage/comparison. We ALWAYS normalize here.
 *
 * Region: gemini-embedding-001 is served from regional endpoints (default
 * `us-central1`), NOT the `global` endpoint. Token limit ~2048 tokens/input.
 *
 * Reference auth probe: `backend/scripts/verify-vertex-sa.ts`.
 * Sibling client (generateContent): `lib/vertex-client.ts`.
 */
import type { AuthClient } from 'google-auth-library';
import { getAuthClient, getProjectId } from './auth';

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Region that serves gemini-embedding-001 via `:predict`. Not served on `global`. */
export type EmbedRegion = 'us-central1';

export interface EmbedVertexOptions {
  /**
   * Output dimensionality (Matryoshka truncation). Default 1536 (pgvector col).
   * The returned vector length is validated to equal this before returning.
   */
  outputDim?: number;
  /** Vertex region serving the model. Default 'us-central1'. */
  region?: EmbedRegion;
  /**
   * Opt-in character cap. When set, the input is truncated to this many chars
   * BEFORE sending. Default: undefined (NO truncation — non-lossy).
   *
   * The corpus `embed_input` is hierarchy-concatenated and can exceed the
   * model's ~2048-token window; an over-cap input otherwise returns an
   * HTTP 400 from Vertex. The M3 re-embed job sets this to a safe budget; the
   * runtime query path leaves it unset (queries are short).
   */
  truncateChars?: number;
}

export interface EmbedVertexResult {
  /** L2-normalized embedding vector (length === dim). */
  embedding: number[];
  /** Reported dimensionality (=== embedding.length === requested outputDim). */
  dim: number;
  /** The task_type actually sent (echoed so callers/jobs can assert it). */
  taskType: EmbedTaskType;
  /** End-to-end wall-clock latency in ms. */
  latencyMs: number;
}

const MODEL = 'gemini-embedding-001';
const DEFAULT_DIM = 1536;
const DEFAULT_REGION: EmbedRegion = 'us-central1';
const MAX_ATTEMPTS = 3;

interface PredictInstance {
  content: string;
  task_type: EmbedTaskType;
}

interface PredictRequestBody {
  instances: PredictInstance[];
  parameters: { outputDimensionality: number };
}

interface PredictResponse {
  predictions?: Array<{
    embeddings?: { values?: number[] };
  }>;
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

function endpoint(region: EmbedRegion, projectId: string): string {
  // gemini-embedding-001 is NOT served on the `global` endpoint; use the
  // regional host. Path mirrors the generateContent client but with `:predict`.
  return (
    `https://${region}-aiplatform.googleapis.com` +
    `/v1/projects/${projectId}/locations/${region}` +
    `/publishers/google/models/${MODEL}:predict`
  );
}

/**
 * L2-normalize a vector. Returns a NEW array of unit length (norm === 1).
 *
 * THROWS on a degenerate input — a zero norm (all-zero vector) or a non-finite
 * norm (a NaN/Inf component). A divide-by-zero here would emit a NaN-filled
 * vector that PASSES a naive length check yet silently poisons every cosine
 * comparison it touches, so we fail loud instead of propagating garbage.
 */
export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    throw new Error(
      `[vertex-embed] cannot L2-normalize: norm is ${norm === 0 ? 'zero (degenerate vector)' : 'non-finite (NaN/Inf component)'}`,
    );
  }
  return vec.map((x) => x / norm);
}

/**
 * Embed a single text via Vertex `gemini-embedding-001` and return an
 * L2-normalized vector at the requested dimensionality.
 *
 * `taskType` is a REQUIRED positional argument (no default) — a bulk-embed
 * primitive must never guess between corpus ('RETRIEVAL_DOCUMENT') and query
 * ('RETRIEVAL_QUERY') intent. The corpus re-embed passes 'RETRIEVAL_DOCUMENT';
 * the runtime query path passes 'RETRIEVAL_QUERY'. It is echoed on the result.
 *
 * Retries 429 / 5xx / transient network errors up to 3 attempts with
 * exponential backoff (`(2 ** attempt) * 500ms + 0-200ms jitter`). After all
 * retries exhausted, rethrows with a `[vertex-embed]` prefix. Non-retryable
 * errors (4xx other than 429, malformed/short response, dim mismatch, zero
 * norm) throw immediately with a clear message — never retried.
 */
export async function embedVertex(
  text: string,
  taskType: EmbedTaskType,
  opts?: EmbedVertexOptions,
): Promise<EmbedVertexResult> {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('[vertex-embed] text must be a non-empty string');
  }
  if (taskType !== 'RETRIEVAL_DOCUMENT' && taskType !== 'RETRIEVAL_QUERY') {
    throw new Error(
      `[vertex-embed] taskType is required and must be 'RETRIEVAL_DOCUMENT' or 'RETRIEVAL_QUERY' (got ${String(taskType)})`,
    );
  }
  const outputDim = opts?.outputDim ?? DEFAULT_DIM;
  const region = opts?.region ?? DEFAULT_REGION;

  // Opt-in truncation only. Default is non-lossy: an over-cap input that
  // exceeds the model's ~2048-token window returns an HTTP 400 from Vertex
  // rather than being silently shortened. The M3 job sets a safe char budget.
  const content =
    typeof opts?.truncateChars === 'number' && text.length > opts.truncateChars
      ? text.slice(0, opts.truncateChars)
      : text;

  const body: PredictRequestBody = {
    instances: [{ content, task_type: taskType }],
    parameters: { outputDimensionality: outputDim },
  };

  const [client, projectId]: [AuthClient, string] = await Promise.all([
    getAuthClient(),
    getProjectId(),
  ]);
  const url = endpoint(region, projectId);

  let lastErr: unknown = null;
  const t0 = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.request<PredictResponse>({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      const latencyMs = Date.now() - t0;

      const values = res.data.predictions?.[0]?.embeddings?.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `[vertex-embed] malformed response: predictions[0].embeddings.values missing or empty ` +
            `(model=${MODEL}, region=${region})`,
        );
      }

      // Dim guard: a truncation param silently ignored by the API would store
      // a wrong-width vector into the 1536-dim pgvector column (insert error or,
      // worse, silent mismatch). Fail loud here.
      if (values.length !== outputDim) {
        throw new Error(
          `[vertex-embed] dimensionality mismatch: expected dim ${outputDim}, got ${values.length} ` +
            `(model=${MODEL}; check outputDimensionality support)`,
        );
      }

      const embedding = l2Normalize(values);
      return { embedding, dim: embedding.length, taskType, latencyMs };
    } catch (e: unknown) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1 && isRetryable(e)) {
        const backoff = (2 ** attempt) * 500 + Math.floor(Math.random() * 200);
        await sleep(backoff);
        continue;
      }
      if (attempt === MAX_ATTEMPTS - 1 && isRetryable(e)) {
        const msg = e instanceof Error ? e.message : String(e);
        const wrapped = new Error(`[vertex-embed] After ${MAX_ATTEMPTS} retry attempts: ${msg}`);
        (wrapped as Error & { cause?: unknown }).cause = e;
        throw wrapped;
      }
      throw e;
    }
  }

  throw lastErr ?? new Error('[vertex-embed] retry loop exited unexpectedly');
}

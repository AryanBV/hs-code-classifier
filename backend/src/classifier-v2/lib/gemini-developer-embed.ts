/**
 * Gemini Developer API embedding client (Phase A2).
 *
 * Behavior-preserving sibling of `lib/vertex-embed.ts` + its
 * `VertexEmbeddingProvider`: produces the SAME L2-normalized 1536-dim
 * `gemini-embedding-001` vectors the corpus + query path already use, but via the
 * Gemini Developer API free-tier key (`GEMINI_API_KEY`) through `@google/genai`'s
 * `ai.models.embedContent`, instead of raw-HTTPS Vertex `:predict`.
 *
 * Compatibility is load-bearing: the runtime query vector MUST live in the SAME
 * cosine space as the corpus vectors stored in the 1536-dim pgvector column
 * (`embedding_v2`). Matryoshka truncation to 1536 is NOT pre-normalized, so we
 * apply the SAME `l2Normalize` (imported from vertex-embed — importing does not
 * modify it) + the SAME post-truncation dimension guard the Vertex path uses.
 *
 * taskType is validated to {RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY} at the boundary
 * (a wrong string would silently mis-embed). Surfaces a provider-neutral
 * `RetrievalProviderError` so L2's degrade-path stays vendor-agnostic.
 */
import { GoogleGenAI, type EmbedContentParameters } from '@google/genai';
import { l2Normalize, type EmbedTaskType } from './vertex-embed';
import {
  RetrievalProviderError,
  isTransientError,
} from './retrieval-errors';
import * as backoff from './retry-backoff';
import type {
  EmbeddingProvider,
  EmbeddingTaskType,
  EmbedProviderResult,
} from './embedding-provider';

const MODEL = 'gemini-embedding-001';
const DEFAULT_DIM = 1536;
const PROVIDER_NAME = 'developer/gemini-embedding-001';

const VALID_TASK_TYPES: ReadonlySet<string> = new Set<EmbeddingTaskType>([
  'RETRIEVAL_DOCUMENT',
  'RETRIEVAL_QUERY',
]);

interface HttpErrorLike {
  status?: number;
  code?: string;
  response?: { status?: number };
}

/** Mirrors vertex-embed's retry classifier, extended for the SDK ApiError `status`. */
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
 * EmbeddingProvider impl on the Gemini Developer API. Selectable via
 * `EMBEDDING_PROVIDER=developer`. The `GoogleGenAI` client is constructed lazily
 * so module import / mocked tests don't require `GEMINI_API_KEY`, and a clear
 * error is thrown at call time if the key is missing.
 */
export class GeminiDeveloperEmbeddingProvider implements EmbeddingProvider {
  public readonly name = PROVIDER_NAME;
  public readonly dim = DEFAULT_DIM;

  private client: GoogleGenAI | null = null;

  /**
   * @param truncateChars Optional input char cap, mirroring VertexEmbeddingProvider
   *   (corpus rows can exceed the model's token window). Unset on the runtime
   *   query path (queries are short).
   */
  constructor(private readonly truncateChars?: number) {}

  private getClient(): GoogleGenAI {
    if (this.client !== null) return this.client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new RetrievalProviderError(
        'GEMINI_API_KEY is not set. The Gemini Developer embedding provider requires a free-tier AI Studio key in the environment.',
        { provider: 'unknown', retryable: false },
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  async embed(
    text: string,
    opts: { taskType: EmbeddingTaskType },
  ): Promise<EmbedProviderResult> {
    if (typeof text !== 'string' || text.length === 0) {
      throw new RetrievalProviderError('embed(): text must be a non-empty string', {
        provider: 'unknown',
        retryable: false,
      });
    }

    // Validate taskType at the boundary BEFORE the network call (a wrong string
    // would silently mis-embed). Hard error → not retryable.
    const taskType = opts?.taskType as unknown;
    if (typeof taskType !== 'string' || !VALID_TASK_TYPES.has(taskType)) {
      throw new RetrievalProviderError(
        `Invalid taskType '${String(taskType)}': must be exactly 'RETRIEVAL_DOCUMENT' or 'RETRIEVAL_QUERY'`,
        { provider: 'unknown', retryable: false },
      );
    }

    // Opt-in truncation only (mirrors vertex-embed: default is non-lossy).
    const content =
      typeof this.truncateChars === 'number' && text.length > this.truncateChars
        ? text.slice(0, this.truncateChars)
        : text;

    const params: EmbedContentParameters = {
      model: MODEL,
      contents: content,
      config: {
        taskType: taskType as EmbedTaskType,
        outputDimensionality: this.dim,
      },
    };

    const client = this.getClient();

    const t0 = Date.now();
    const retry = new backoff.RetryController();

    for (;;) {
      try {
        const resp = await client.models.embedContent(params);
        const latencyMs = Date.now() - t0;

        const values = resp.embeddings?.[0]?.values;
        if (!Array.isArray(values) || values.length === 0) {
          // Malformed response — not transient, fail loud (non-retryable).
          throw new RetrievalProviderError(
            `Gemini Developer embed: malformed response — embeddings[0].values missing or empty (model=${MODEL})`,
            { provider: 'unknown', retryable: false },
          );
        }

        // Same dim guard as vertex-embed: a silently-ignored truncation param
        // would store a wrong-width vector into the 1536-dim column.
        if (values.length !== this.dim) {
          throw new RetrievalProviderError(
            `Gemini Developer embed: dimensionality mismatch — expected ${this.dim}, got ${values.length} (model=${MODEL})`,
            { provider: 'unknown', retryable: false },
          );
        }

        // Same L2 normalization the Vertex path applies (1536 is NOT pre-normalized).
        const embedding = l2Normalize(values);
        return { embedding, dim: embedding.length, latencyMs };
      } catch (e: unknown) {
        // A boundary RetrievalProviderError we already threw (malformed/dim) is
        // hard — surface immediately, do not retry/re-wrap.
        if (e instanceof RetrievalProviderError) {
          throw e;
        }
        // Non-transient (hard 4xx, etc.): wrap into the neutral error, no retry.
        if (!isRetryable(e)) {
          throw new RetrievalProviderError(
            `Gemini Developer embed failed: ${e instanceof Error ? e.message : String(e)}`,
            { provider: 'unknown', retryable: isTransientError(e), cause: e },
          );
        }
        // Rate-limit-aware backoff: 429 honors the server delay (capped) with a
        // higher attempt budget; 503/network keep the fast exponential backoff.
        const waited = await retry.nextWait(e, backoff.sleep);
        if (waited === null) {
          // Budget exhausted — wrap into the neutral error (transient, was retried).
          throw new RetrievalProviderError(
            `Gemini Developer embed failed: ${e instanceof Error ? e.message : String(e)}`,
            { provider: 'unknown', retryable: isTransientError(e), cause: e },
          );
        }
      }
    }
  }
}

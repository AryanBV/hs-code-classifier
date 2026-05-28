/**
 * Swappable embedding-provider abstraction for Phase 4 v2 Layer 2 retrieval.
 *
 * The corpus + query embeddings must come from ONE provider chosen in ONE place
 * so the runtime can drop Cohere (trial key exhausted) and move to Vertex
 * `gemini-embedding-001` (1536-dim, credit-covered) without L2 caring which
 * vendor produced the vector. `getEmbeddingProvider()` is that single source of
 * truth — it also owns the canonical `dim`, which the pgvector column and the
 * corpus re-embed job must agree on.
 *
 * Providers surface a provider-neutral `RetrievalProviderError` (NOT a vendor
 * error) so L2's degrade-path stays vendor-agnostic.
 *
 * NOTE: not wired into L2 here — that is the next task.
 */
import { embedVertex, type EmbedTaskType } from './vertex-embed';
import { RetrievalProviderError, isTransientError } from './retrieval-errors';

/* ---------------------------------------------------------------------------
 * Public contract
 * --------------------------------------------------------------------------- */

export type EmbeddingTaskType = EmbedTaskType; // 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

/**
 * The ONLY two task types Vertex `gemini-embedding-001` may be driven with in
 * this pipeline. Validated at the provider boundary (see VertexEmbeddingProvider
 * .embed) so a wrong runtime string can never reach the wire and silently
 * mis-embed the corpus/query. Kept as a runtime-checkable set (the compile-time
 * `EmbedTaskType` union does not survive `as`-casts at the call site).
 */
const VALID_TASK_TYPES: ReadonlySet<string> = new Set<EmbeddingTaskType>([
  'RETRIEVAL_DOCUMENT',
  'RETRIEVAL_QUERY',
]);

export interface EmbedProviderResult {
  /** L2-normalized embedding vector (length === dim). */
  embedding: number[];
  /** Dimensionality (=== embedding.length === provider.dim). */
  dim: number;
  /** End-to-end wall-clock latency in ms. */
  latencyMs: number;
}

export interface EmbeddingProvider {
  /** Stable identifier, e.g. 'vertex/gemini-embedding-001'. */
  readonly name: string;
  /** Canonical output dimensionality (must match the pgvector column). */
  readonly dim: number;
  embed(
    text: string,
    opts: { taskType: EmbeddingTaskType },
  ): Promise<EmbedProviderResult>;
}

/* ---------------------------------------------------------------------------
 * Vertex implementation (DEFAULT, and the only one implemented now)
 * --------------------------------------------------------------------------- */

const VERTEX_PROVIDER_NAME = 'vertex/gemini-embedding-001';
const VERTEX_DIM = 1536;

export class VertexEmbeddingProvider implements EmbeddingProvider {
  public readonly name = VERTEX_PROVIDER_NAME;
  public readonly dim = VERTEX_DIM;

  /**
   * @param truncateChars Optional input char cap, forwarded to `embedVertex` for
   *   the corpus re-embed job (hierarchy-concatenated rows can exceed the model's
   *   token window). Leave unset for the runtime query path (queries are short).
   */
  constructor(private readonly truncateChars?: number) {}

  async embed(
    text: string,
    opts: { taskType: EmbeddingTaskType },
  ): Promise<EmbedProviderResult> {
    // I2: validate taskType at the boundary. A wrong runtime string (e.g.
    // 'query', 'RETRIEVAL_DOC') would silently mis-embed — embedVertex forwards
    // it verbatim as the wire `task_type`. Reject BEFORE the network call, as a
    // provider-neutral RetrievalProviderError (NOT a vendor error), so L2's
    // degrade-path doesn't have to special-case it. Hard error → not retryable.
    const taskType = opts?.taskType as unknown;
    if (typeof taskType !== 'string' || !VALID_TASK_TYPES.has(taskType)) {
      throw new RetrievalProviderError(
        `Invalid taskType '${String(taskType)}': must be exactly 'RETRIEVAL_DOCUMENT' or 'RETRIEVAL_QUERY'`,
        { provider: 'vertex', retryable: false },
      );
    }

    try {
      const res = await embedVertex(text, taskType, {
        outputDim: this.dim,
        ...(this.truncateChars !== undefined ? { truncateChars: this.truncateChars } : {}),
      });
      return { embedding: res.embedding, dim: res.dim, latencyMs: res.latencyMs };
    } catch (e: unknown) {
      throw new RetrievalProviderError(
        `Vertex embed failed: ${e instanceof Error ? e.message : String(e)}`,
        { provider: 'vertex', retryable: isTransientError(e), cause: e },
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * Factory — single source of truth for the active embedding provider + its dim
 * --------------------------------------------------------------------------- */

export type EmbeddingProviderName = 'vertex';

/**
 * Resolve the active embedding provider from env `EMBEDDING_PROVIDER`
 * (default 'vertex'). Only 'vertex' is implemented today; any other value throws
 * a clear error (Cohere embed is being retired; a future provider would add a
 * case here + its own client + dim).
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const choice = (process.env.EMBEDDING_PROVIDER ?? 'vertex').trim().toLowerCase();
  switch (choice) {
    case '':
    case 'vertex':
      return new VertexEmbeddingProvider();
    default:
      throw new RetrievalProviderError(
        `Unknown EMBEDDING_PROVIDER='${choice}'. Only 'vertex' (gemini-embedding-001, 1536-dim) is implemented.`,
        { provider: 'unknown', retryable: false },
      );
  }
}

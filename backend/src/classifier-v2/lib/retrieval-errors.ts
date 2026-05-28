/**
 * Provider-neutral retrieval error for the Phase 4 v2 Layer 2 stack.
 *
 * The retrieval providers (embeddings + reranking) are swappable — Vertex,
 * Cohere, Voyage, … — and each underlying client throws its own concrete error
 * type (`CohereError`, the `[vertex-embed]`-prefixed `Error`, etc.). L2's
 * degrade-path must not have to `instanceof`-check every vendor's error class to
 * decide whether to fall back to cosine-only retrieval.
 *
 * `RetrievalProviderError` is that single neutral surface: the providers in this
 * package catch their vendor error and re-throw (wrapping via `cause`) a
 * `RetrievalProviderError` carrying:
 *   - `provider`  — which provider raised it (`'vertex'`, `'cohere'`, …), for logs.
 *   - `retryable` — whether the failure looked transient (429 / 5xx / network)
 *                   vs. a hard contract/config error (4xx, malformed response).
 *
 * L2 (wired in the NEXT task) can then `catch (e) { if (e instanceof
 * RetrievalProviderError) <degrade> }` without importing any vendor SDK.
 */

/** Identifier for the provider family that raised a retrieval error. */
export type RetrievalProviderName = 'vertex' | 'cohere' | 'voyage' | 'unknown';

export interface RetrievalProviderErrorOptions {
  /** Which provider raised the error (for structured logging / metrics). */
  provider?: RetrievalProviderName;
  /**
   * True when the failure looked transient (HTTP 429 / 5xx / network) and a
   * retry or fallback is sensible; false for hard errors (4xx config, malformed
   * response, dimensionality mismatch) where retrying is pointless.
   */
  retryable?: boolean;
  /** The original vendor error, preserved for diagnostics. */
  cause?: unknown;
}

export class RetrievalProviderError extends Error {
  public readonly provider: RetrievalProviderName;
  public readonly retryable: boolean;

  constructor(message: string, opts: RetrievalProviderErrorOptions = {}) {
    super(message);
    this.name = 'RetrievalProviderError';
    this.provider = opts.provider ?? 'unknown';
    this.retryable = opts.retryable ?? false;
    // Preserve the original error for callers that want the underlying
    // status/code, without coupling them to the vendor's error type.
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
    // Maintain a clean prototype chain across the TS `extends Error` downlevel.
    Object.setPrototypeOf(this, RetrievalProviderError.prototype);
  }
}

interface HttpErrorLike {
  status?: number | null;
  code?: string;
  response?: { status?: number };
}

/**
 * Best-effort classification of an arbitrary thrown value as transient.
 *
 * Recognizes the shapes the v2 clients surface: a numeric `status` (CohereError),
 * a nested `response.status` (google-auth-library), a transient network `code`
 * (ECONNRESET / ETIMEDOUT / EAI_AGAIN / ECONNABORTED), and the `[vertex-embed]`
 * / `[vertex-client]` "After N retry attempts" prefix the Vertex clients add to
 * an exhausted-retry rethrow (which is by definition a retryable failure that
 * has already been retried). Defaults to false (treat unknown errors as hard).
 */
export function isTransientError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as HttpErrorLike;

  const status = typeof e.status === 'number' ? e.status : e.response?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false; // explicit hard 4xx
  }

  const code = e.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN' || code === 'ECONNABORTED') {
    return true;
  }

  if (err instanceof Error && /After \d+ retry attempts/.test(err.message)) {
    return true;
  }

  return false;
}

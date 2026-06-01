// backend/src/classifier-v2/lib/transport-error.ts
//
// Shared, instanceof-able sentinel for a PERSISTENT transport/infra failure that
// survived a provider client's own retry/backoff. BOTH LLM clients
// (gemini-developer-client + vertex-client) throw this on backoff-exhaustion so
// the orchestrator's `isVertexTransportError` predicate can key off the TYPE
// (`err instanceof TransportError`) instead of a fragile message-prefix match.
//
// WHY (B0 root-cause fix): the predicate previously matched ONLY the
// '[vertex-client] After ' string prefix, while the live runtime client
// (GeminiDeveloperLlmProvider) throws '[gemini-developer-client] After '. A
// persistent live transport failure therefore escaped §7 conversion and surfaced
// as a generic 500 instead of the intended 503-retryable. A typed sentinel makes
// the next provider rename unable to silently re-break the 503 contract.
//
// The existing human-readable message text (incl. the per-client
// '[gemini-developer-client] After '/'[vertex-client] After ' prefix) is
// PRESERVED on the thrown TransportError so logs and any defensive prefix
// matching stay back-compatible.

/**
 * A persistent transport/infra failure raised by an LLM client after its own
 * retry budget is exhausted. Carries the composed log message and (optionally)
 * the underlying error on `.cause`.
 */
export class TransportError extends Error {
  /** Original error that triggered backoff exhaustion (network/HTTP error). */
  public readonly cause?: unknown;
  /** Optional HTTP status of the final failed attempt, when known. */
  public readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message);
    this.name = 'TransportError';
    if (options?.cause !== undefined) this.cause = options.cause;
    if (options?.status !== undefined) this.status = options.status;
    // Restore the prototype chain so `instanceof TransportError` holds even when
    // compiled to ES5-target transpilation (defensive; project targets ES2020+).
    Object.setPrototypeOf(this, TransportError.prototype);
  }
}

/**
 * Cohere client for Phase 4 v2 Layer 2 Retrieval.
 *
 * Two operations used at runtime:
 *   - embed-v4.0 (search_query input_type) — produces a 1536-dim query embedding
 *   - rerank-v4.0-pro (Cohere Rerank 4 Pro) — relevance-ranks candidate documents
 *
 * Raw HTTPS via `fetch` (Node 18+ global). The `cohere-ai` SDK is NOT installed
 * in backend/package.json as of 2026-05-26; raw fetch keeps the dependency
 * footprint minimal and matches the same pattern used in vertex-client.ts.
 *
 * Auth: `COHERE_API_KEY` env var (Cohere's own billing — NOT routed via Vertex
 * and NOT covered by GDP Premium GenAI Credit per ARCHITECTURE.md §5).
 *
 * Retry policy: 3 attempts with exponential backoff (`(2^n)*500ms + 0-200ms
 * jitter`) on HTTP 429 / 5xx. Mirrors `vertex-client.ts` semantics.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 Layer 2 (Hybrid Retrieval)
 *   - backend/docs/ARCHITECTURE.md §5 (D1 model stack — Cohere row)
 *   - backend/docs/ARCHITECTURE.md §7 (Cohere unavailable → cosine-only fallback)
 */
import 'dotenv/config';

/* ---------------------------------------------------------------------------
 * Configurable model identifiers + endpoints
 * --------------------------------------------------------------------------- */

/** Cohere v2 embed endpoint. */
const COHERE_EMBED_URL  = 'https://api.cohere.com/v2/embed';
/** Cohere v2 rerank endpoint. */
const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank';

/** Default embed model — embed-v4.0 (1536-dim). */
export const COHERE_EMBED_MODEL  = 'embed-v4.0';
/** Default rerank model — Rerank 4 Pro (best-in-class quality per §5). */
export const COHERE_RERANK_MODEL = 'rerank-v4.0-pro';

/** Expected embedding dimensionality for embed-v4.0. */
export const EMBED_DIM = 1536;

/* ---------------------------------------------------------------------------
 * Error class
 * --------------------------------------------------------------------------- */

/**
 * Thrown after all Cohere retries are exhausted, or on non-retryable 4xx.
 * `status` is set when the failure is an HTTP error; absent for network errors.
 */
export class CohereError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: string | null,
  ) {
    super(message);
    this.name = 'CohereError';
  }
}

/* ---------------------------------------------------------------------------
 * Internal helpers
 * --------------------------------------------------------------------------- */

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return (2 ** attempt) * 500 + Math.floor(Math.random() * 200);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

interface CohereRequestInit {
  apiKey:  string;
  url:     string;
  body:    Record<string, unknown>;
}

interface CohereCallResult {
  data: unknown;
  latencyMs: number;
}

/**
 * Execute a POST to Cohere with retry on 429/5xx. Throws CohereError on
 * non-retryable status or exhausted retries. Network errors retried as well.
 */
async function callCohere(init: CohereRequestInit): Promise<CohereCallResult> {
  const t0 = Date.now();
  let lastErr: CohereError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(init.url, {
        method: 'POST',
        headers: {
          Authorization:   `Bearer ${init.apiKey}`,
          'Content-Type':  'application/json',
          Accept:          'application/json',
        },
        body: JSON.stringify(init.body),
      });
    } catch (err: unknown) {
      // Network failure (DNS, socket, abort). Retry if attempts remain.
      lastErr = new CohereError(
        `Cohere network error: ${(err as Error).message}`,
        null,
        null,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastErr;
    }

    if (response.ok) {
      const json: unknown = await response.json();
      return { data: json, latencyMs: Date.now() - t0 };
    }

    const bodyText = await response.text().catch(() => '');
    const err = new CohereError(
      `Cohere HTTP ${response.status} from ${init.url}: ${bodyText.slice(0, 500)}`,
      response.status,
      bodyText,
    );

    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
      throw err;
    }
    lastErr = err;
    await sleep(backoffMs(attempt));
  }

  // Unreachable in practice (loop always returns or throws), but keep the
  // type checker honest.
  throw lastErr ?? new CohereError('Cohere retry loop exited unexpectedly', null, null);
}

/* ---------------------------------------------------------------------------
 * Embed
 * --------------------------------------------------------------------------- */

export interface EmbedOptions {
  /** Defaults to `embed-v4.0`. */
  model?:     string;
  /** Defaults to `search_query`. Use `search_document` for indexing flow. */
  inputType?: 'search_query' | 'search_document' | 'classification' | 'clustering';
}

export interface EmbedResult {
  /** 1536-element float array. */
  embedding: number[];
  /** End-to-end wall-clock latency for this Cohere call. */
  latencyMs: number;
}

interface CohereEmbedV2Response {
  embeddings?: {
    float?: number[][];
  };
  id?: string;
}

/**
 * Embed a single text query via Cohere embed-v4.0. Returns the 1536-dim float
 * vector and end-to-end latency. Retries 429/5xx up to 3 attempts.
 *
 * @throws CohereError if COHERE_API_KEY missing, retries exhausted, or response
 *   shape is malformed / dimensionality mismatch.
 */
export async function embed(
  text: string,
  opts: EmbedOptions = {},
): Promise<EmbedResult> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new CohereError(
      'COHERE_API_KEY is not set in env; cannot call Cohere embed-v4',
      null,
      null,
    );
  }
  if (typeof text !== 'string' || text.length === 0) {
    throw new CohereError('embed(): text must be a non-empty string', null, null);
  }

  const body = {
    model:            opts.model ?? COHERE_EMBED_MODEL,
    input_type:       opts.inputType ?? 'search_query',
    embedding_types:  ['float'],
    texts:            [text],
  };

  const { data, latencyMs } = await callCohere({
    apiKey,
    url:  COHERE_EMBED_URL,
    body,
  });

  const resp = data as CohereEmbedV2Response;
  const floats = resp.embeddings?.float;
  if (!Array.isArray(floats) || floats.length === 0 || !Array.isArray(floats[0])) {
    throw new CohereError(
      `Cohere embed response malformed: missing embeddings.float[0] (got ${JSON.stringify(resp).slice(0, 200)})`,
      null,
      null,
    );
  }

  const embedding = floats[0];
  if (embedding.length !== EMBED_DIM) {
    throw new CohereError(
      `Cohere embed dimensionality mismatch: expected ${EMBED_DIM}, got ${embedding.length}`,
      null,
      null,
    );
  }
  if (!embedding.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new CohereError(
      'Cohere embed response contains non-finite values',
      null,
      null,
    );
  }

  return { embedding, latencyMs };
}

/* ---------------------------------------------------------------------------
 * Rerank
 * --------------------------------------------------------------------------- */

export interface RerankDocument {
  /** Stable id (HS code) returned in rerank result for downstream mapping. */
  id:   string;
  /** Document text (typically tariff_line.description + parent chain). */
  text: string;
}

export interface RerankResultItem {
  id:             string;
  relevance_score: number;
}

export interface RerankResult {
  ranked:    RerankResultItem[];
  latencyMs: number;
}

export interface RerankOptions {
  /** Defaults to `COHERE_RERANK_MODEL` (`rerank-v4.0-pro`). */
  model?:    string;
  /** Defaults to `documents.length` (i.e., return all reranked). */
  topN?:     number;
}

interface CohereRerankV2Response {
  results?: Array<{
    index?:           number;
    relevance_score?: number;
  }>;
  id?: string;
}

/**
 * Rerank `documents` against `query` via Cohere Rerank Pro.
 *
 * Returns one entry per document (sorted by relevance desc), each containing
 * the original `id` (passed in via `documents[].id`) and `relevance_score`.
 * Limit with `opts.topN` if you only want the head.
 *
 * @throws CohereError if COHERE_API_KEY missing, retries exhausted, or
 *   response shape is malformed.
 */
export async function rerank(
  query: string,
  documents: RerankDocument[],
  opts: RerankOptions = {},
): Promise<RerankResult> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new CohereError(
      'COHERE_API_KEY is not set in env; cannot call Cohere rerank',
      null,
      null,
    );
  }
  if (typeof query !== 'string' || query.length === 0) {
    throw new CohereError('rerank(): query must be a non-empty string', null, null);
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new CohereError('rerank(): documents[] must be non-empty', null, null);
  }
  for (const d of documents) {
    if (typeof d.id !== 'string' || typeof d.text !== 'string') {
      throw new CohereError(
        'rerank(): every document must have {id: string, text: string}',
        null,
        null,
      );
    }
  }

  const body = {
    model:     opts.model ?? COHERE_RERANK_MODEL,
    query,
    documents: documents.map((d) => d.text),
    top_n:     opts.topN ?? documents.length,
  };

  const { data, latencyMs } = await callCohere({
    apiKey,
    url:  COHERE_RERANK_URL,
    body,
  });

  const resp = data as CohereRerankV2Response;
  const results = resp.results;
  if (!Array.isArray(results)) {
    throw new CohereError(
      `Cohere rerank response malformed: missing results[] (got ${JSON.stringify(resp).slice(0, 200)})`,
      null,
      null,
    );
  }

  const ranked: RerankResultItem[] = [];
  for (const r of results) {
    if (typeof r.index !== 'number' || typeof r.relevance_score !== 'number') {
      throw new CohereError(
        `Cohere rerank item malformed: ${JSON.stringify(r)}`,
        null,
        null,
      );
    }
    if (r.index < 0 || r.index >= documents.length) {
      throw new CohereError(
        `Cohere rerank index ${r.index} out of bounds (documents.length=${documents.length})`,
        null,
        null,
      );
    }
    const doc = documents[r.index];
    if (doc === undefined) {
      // Defensive: bound-check above should make this unreachable, but TS
      // narrowing across array indexing requires the explicit guard.
      throw new CohereError(
        `Cohere rerank: documents[${r.index}] is undefined`,
        null,
        null,
      );
    }
    ranked.push({
      id:              doc.id,
      relevance_score: r.relevance_score,
    });
  }

  return { ranked, latencyMs };
}

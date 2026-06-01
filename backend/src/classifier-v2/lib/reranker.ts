/**
 * Swappable reranker abstraction for Phase 4 v2 Layer 2 retrieval.
 *
 * Reranking re-scores a small candidate set (≤40 tariff-line descriptions) for
 * relevance to the query, after the hybrid (cosine + FTS) recall funnel. The
 * default impl is an LLM reranker (Gemini 3.5 Flash) so the runtime can drop
 * Cohere (trial key exhausted; Rerank 4 Pro is cash, not credit-covered). A thin
 * Cohere wrapper is retained for A/B + fallback. Voyage is a documented future
 * extension point.
 *
 * Single source of truth for the active reranker: `getReranker()` (env RERANKER).
 * Providers surface a provider-neutral `RetrievalProviderError` (NOT CohereError)
 * so L2's degrade-path can stay vendor-agnostic.
 *
 * NOTE: not wired into L2 here — that is the next task.
 */
import { generateContent, type VertexResponseSchema } from './llm-provider';
import { rerank as cohereRerank, CohereError } from './cohere-client';
import { RetrievalProviderError, isTransientError } from './retrieval-errors';

/* ---------------------------------------------------------------------------
 * Public contract
 * --------------------------------------------------------------------------- */

export interface RerankDocument {
  /** Stable id (HS code) echoed back in the ranked result for downstream mapping. */
  id: string;
  /** Document text (tariff_line.description, typically + parent-chain context). */
  text: string;
}

export interface RerankedItem {
  id: string;
  relevance_score: number;
}

export interface RerankResult {
  /** One entry per INPUT document, sorted by relevance desc. Never drops a candidate. */
  ranked: RerankedItem[];
  /** End-to-end wall-clock latency in ms. */
  latencyMs: number;
}

export interface RerankOptions {
  /** Cap the returned head. Default: all documents (no cap). */
  topN?: number;
}

export interface Reranker {
  /** Stable identifier, e.g. 'gemini-flash/gemini-3.5-flash' or 'cohere/rerank-v4.0-pro'. */
  readonly name: string;
  rerank(query: string, documents: RerankDocument[], opts?: RerankOptions): Promise<RerankResult>;
}

/* ---------------------------------------------------------------------------
 * Shared input validation
 * --------------------------------------------------------------------------- */

function validateRerankInputs(query: string, documents: RerankDocument[]): void {
  if (typeof query !== 'string' || query.length === 0) {
    throw new RetrievalProviderError('rerank(): query must be a non-empty string', {
      provider: 'unknown',
      retryable: false,
    });
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new RetrievalProviderError('rerank(): documents[] must be non-empty', {
      provider: 'unknown',
      retryable: false,
    });
  }
  for (const d of documents) {
    if (d === null || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.text !== 'string') {
      throw new RetrievalProviderError(
        'rerank(): every document must be { id: string, text: string }',
        { provider: 'unknown', retryable: false },
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * GeminiFlashReranker (DEFAULT) — LLM relevance scoring via structured output
 * --------------------------------------------------------------------------- */

const GEMINI_RERANK_MODEL = 'gemini-3.5-flash' as const;

/**
 * I3a: per-candidate text cap (chars) used when building the rerank prompt.
 * At ~40 candidates, an un-capped tariff-line description (description + full
 * parent chain) can run long; 40 of them blow the prompt token budget and risk
 * truncating the JSON response. ~500 chars retains the discriminating head of a
 * description while keeping the prompt bounded. The candidate's FULL text still
 * lives in the input set — only the prompt copy is trimmed.
 */
const MAX_CANDIDATE_PROMPT_CHARS = 500;

/**
 * Vertex responseSchema for the rerank call: a single `rankings` array of
 * { id, score } objects. `score` is a 0.0-1.0 relevance. Authored in the Vertex
 * OpenAPI subset directly (no draft-07 constructs) so the sanitizer is a no-op.
 */
const RERANK_RESPONSE_SCHEMA: VertexResponseSchema = {
  type: 'object',
  properties: {
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The candidate id, copied verbatim from the input list.' },
          score: {
            type: 'number',
            description: 'Relevance of this candidate to the query, 0.0 (irrelevant) to 1.0 (exact match).',
          },
        },
        required: ['id', 'score'],
      },
    },
  },
  required: ['rankings'],
};

interface ModelRanking {
  id: string;
  score: number;
}

/** Collapse whitespace and cap a candidate's text for the prompt (I3a). */
function capCandidateText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_CANDIDATE_PROMPT_CHARS
    ? collapsed.slice(0, MAX_CANDIDATE_PROMPT_CHARS)
    : collapsed;
}

function buildRerankPrompt(query: string, documents: RerankDocument[]): string {
  const lines = documents
    .map((d, i) => `${i + 1}. [id: ${d.id}] ${capCandidateText(d.text)}`)
    .join('\n');
  return [
    'You are a relevance-ranking engine for HS (Harmonized System) tariff classification.',
    'Given a product QUERY and a numbered list of candidate tariff-line descriptions,',
    'score how well EACH candidate matches the query, from 0.0 (irrelevant) to 1.0 (exact match).',
    '',
    'Rules:',
    '- Score EVERY candidate. Do not omit any id.',
    '- Use the exact "id" value shown in brackets for each candidate; do not invent ids.',
    '- Judge semantic + material/function fit, not just keyword overlap.',
    '- Scores are independent (it is fine for several candidates to score high or low).',
    '',
    `QUERY: ${query}`,
    '',
    'CANDIDATES:',
    lines,
  ].join('\n');
}

/**
 * Parse the model's `text` into a `{ id -> score }` map, defensively.
 * Returns an empty map on any structural failure (caller degrades gracefully).
 */
function parseModelRankings(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (parsed === null || typeof parsed !== 'object') return out;
  const rankings = (parsed as { rankings?: unknown }).rankings;
  if (!Array.isArray(rankings)) return out;
  for (const r of rankings as ModelRanking[]) {
    if (r === null || typeof r !== 'object') continue;
    const id = r.id;
    const score = r.score;
    if (typeof id !== 'string') continue;
    if (typeof score !== 'number') continue;
    // M4: coerce a NaN / ±Infinity score to 0 BEFORE clamp/sort. `Math.min/max`
    // of NaN stays NaN, which then sorts unpredictably and can poison the ranked
    // order. A non-finite score carries no usable signal → treat it as 0 (worst),
    // but still RECORD the id so the candidate stays in the `scored` group rather
    // than silently dropping to the omitted tail. Keep the FIRST score for a
    // duplicated id in the model output (ignore later dups).
    const finite = Number.isFinite(score) ? score : 0;
    if (!out.has(id)) out.set(id, Math.min(1, Math.max(0, finite)));
  }
  return out;
}

/**
 * Merge model scores back onto the INPUT document set — the recall-safety core.
 *
 * For every input document (by id), in input order:
 *   - if the model scored it, use that score (`scored` group);
 *   - if the model OMITTED it, assign 0 and put it in the `omitted` group.
 * A hallucinated id (returned by the model but not in the input set) is IGNORED.
 *
 * Result = scored docs sorted by score desc, THEN the omitted docs (score 0) in
 * their original input order appended after. This guarantees: (1) exactly one
 * entry per input document — never drops a candidate; (2) omitted candidates are
 * preserved at the tail rather than lost (recall safety); (3) hallucinated ids
 * can never enter the result. `topN` then caps the head.
 *
 * Duplicate input ids: each input position yields one output entry. The id→score
 * lookup is shared, so duplicate ids get the same score (still no drops).
 */
function mergeRankingsRecallSafe(
  documents: RerankDocument[],
  scores: Map<string, number>,
  topN?: number,
): RerankedItem[] {
  const scored: Array<RerankedItem & { order: number }> = [];
  const omitted: RerankedItem[] = [];

  documents.forEach((d, order) => {
    const s = scores.get(d.id);
    if (s === undefined) {
      omitted.push({ id: d.id, relevance_score: 0 });
    } else {
      scored.push({ id: d.id, relevance_score: s, order });
    }
  });

  // Stable sort: score desc, ties broken by original input order.
  scored.sort((a, b) => (b.relevance_score - a.relevance_score) || (a.order - b.order));

  const merged: RerankedItem[] = [
    ...scored.map(({ id, relevance_score }) => ({ id, relevance_score })),
    ...omitted,
  ];

  // C1 guardrail: the merge MUST be a permutation of the input — one output row
  // per input row, including rows that share a DUPLICATE id (L3 multi-destination
  // collapse can emit those). If this ever fails, a candidate was silently lost
  // (e.g. a regression that re-keyed by id). Fail loud rather than degrade recall.
  if (merged.length !== documents.length) {
    throw new RetrievalProviderError(
      `rerank merge dropped candidates: expected ${documents.length} ranked rows, got ${merged.length} ` +
        '(output must be a permutation of the input — check for id-keyed dedup)',
      { provider: 'unknown', retryable: false },
    );
  }

  if (typeof topN === 'number' && topN >= 0 && topN < merged.length) {
    return merged.slice(0, topN);
  }
  return merged;
}

export class GeminiFlashReranker implements Reranker {
  public readonly name = `gemini-flash/${GEMINI_RERANK_MODEL}`;

  async rerank(
    query: string,
    documents: RerankDocument[],
    opts: RerankOptions = {},
  ): Promise<RerankResult> {
    validateRerankInputs(query, documents);

    const t0 = Date.now();
    let text: string;
    try {
      const res = await generateContent({
        model: GEMINI_RERANK_MODEL,
        prompt: buildRerankPrompt(query, documents),
        thinkingLevel: 'low',
        responseSchema: RERANK_RESPONSE_SCHEMA,
        responseMimeType: 'application/json',
        temperature: 0,
        // Budget for up to ~40 short {id,score} objects + thinking headroom.
        maxOutputTokens: 4096,
      });
      text = res.text;
    } catch (e: unknown) {
      throw new RetrievalProviderError(
        `Gemini-Flash rerank failed: ${e instanceof Error ? e.message : String(e)}`,
        { provider: 'vertex', retryable: isTransientError(e), cause: e },
      );
    }

    // Parse + merge are recall-safe: malformed/empty output yields an empty
    // score map, so every candidate falls into the `omitted` group (score 0) in
    // input order — we degrade to "preserve input order" rather than throwing.
    const scores = parseModelRankings(text);

    // I3b: detect a truncated / empty / partial rankings response and warn so M5
    // (and ops) can SEE when the reranker silently degraded to near-cosine order.
    // We do NOT throw or drop — recall safety is preserved by the merge below.
    // `distinctInputIds` is the achievable ceiling (duplicate ids collapse to one
    // score), so a healthy full response scores exactly that many distinct ids.
    const distinctInputIds = new Set(documents.map((d) => d.id)).size;
    if (scores.size < distinctInputIds) {
      const reason = scores.size === 0 ? 'empty/unparseable' : 'partial';
      console.warn(
        `[reranker] ${this.name}: ${reason} rankings response — scored ${scores.size} of ` +
          `${distinctInputIds} distinct candidate ids; degraded to near-cosine input order ` +
          `for the ${distinctInputIds - scores.size} unscored. (finishReason check: increase ` +
          'maxOutputTokens if this recurs.)',
      );
    }

    const ranked = mergeRankingsRecallSafe(documents, scores, opts.topN);
    return { ranked, latencyMs: Date.now() - t0 };
  }
}

/* ---------------------------------------------------------------------------
 * CohereReranker — thin wrapper (A/B + fallback; NOT default)
 * --------------------------------------------------------------------------- */

/**
 * Classify a Cohere failure as transient (retryable) vs hard.
 *
 * cohere-client surfaces:
 *   - HTTP errors as `CohereError` with a numeric `status` (429/5xx transient);
 *   - TRANSPORT errors (DNS/socket/abort) as `CohereError` with `status === null`
 *     and a "Cohere network error:" message — those ARE transient (M6).
 * Falls back to the generic `isTransientError` (status / code / retry-prefix) for
 * any non-CohereError throw, so a raw network Error is still classified.
 */
function isCohereRetryable(e: unknown): boolean {
  if (e instanceof CohereError) {
    if (typeof e.status === 'number') return isTransientError({ status: e.status });
    // status === null → transport/network failure → transient.
    return true;
  }
  return isTransientError(e);
}

export class CohereReranker implements Reranker {
  public readonly name = 'cohere/rerank-v4.0-pro';

  async rerank(
    query: string,
    documents: RerankDocument[],
    opts: RerankOptions = {},
  ): Promise<RerankResult> {
    validateRerankInputs(query, documents);
    try {
      const res = await cohereRerank(query, documents, { topN: opts.topN });
      // cohere-client already returns { ranked: {id, relevance_score}[], latencyMs }
      // sorted by relevance desc — the exact target shape. Pass through.
      return { ranked: res.ranked, latencyMs: res.latencyMs };
    } catch (e: unknown) {
      // M6: ALL Cohere failures — HTTP and TRANSPORT (DNS/socket/abort) — must be
      // wrapped in the neutral RetrievalProviderError (never leak CohereError), so
      // the neutral-error contract holds for every provider.
      throw new RetrievalProviderError(
        `Cohere rerank failed: ${e instanceof Error ? e.message : String(e)}`,
        {
          provider: 'cohere',
          retryable: isCohereRetryable(e),
          cause: e,
        },
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * Factory — single source of truth for the active reranker
 * --------------------------------------------------------------------------- */

export type RerankerName = 'gemini-flash' | 'cohere' | 'voyage';

/**
 * Resolve the active reranker from env `RERANKER` (default 'gemini-flash').
 *   - 'gemini-flash' → GeminiFlashReranker (DEFAULT)
 *   - 'cohere'       → CohereReranker
 *   - 'voyage'       → throws (documented extension point — not yet implemented)
 *   - anything else  → throws a clear error
 */
export function getReranker(): Reranker {
  const choice = (process.env.RERANKER ?? 'gemini-flash').trim().toLowerCase();
  switch (choice) {
    case '':
    case 'gemini-flash':
      return new GeminiFlashReranker();
    case 'cohere':
      return new CohereReranker();
    case 'voyage':
      throw new RetrievalProviderError(
        "RERANKER='voyage' is not implemented — add a VoyageReranker impl + VOYAGE_API_KEY env var.",
        { provider: 'voyage', retryable: false },
      );
    default:
      throw new RetrievalProviderError(
        `Unknown RERANKER='${choice}'. Supported: 'gemini-flash' (default), 'cohere'. ('voyage' is a documented future extension point.)`,
        { provider: 'unknown', retryable: false },
      );
  }
}

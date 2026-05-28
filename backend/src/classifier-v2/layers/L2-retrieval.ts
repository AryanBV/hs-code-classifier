/**
 * Layer 2 — Hybrid Retrieval (Phase 4 v2)
 *
 * Deterministic, NO LLM. Combines four signals:
 *   1. Cohere embed-v4 query embedding (1536-dim).
 *   2. Multi-level HNSW cosine search through chapters → headings → subheadings →
 *      tariff_lines via pgvector `<=>`.
 *   3. PostgreSQL GIN-FTS on `tariff_lines.fts_search_text` from
 *      `head_nouns_for_fts | raw_tokens` (OR-joined per ARCHITECTURE.md §4.7).
 *   4. Cohere Rerank Pro on the union of cosine + FTS candidates.
 *
 * SHORTCUT (~60% of queries per recon): when all top subheadings have exactly
 * one tariff_line child, skip the rerank and emit direct-leaf codes — flag the
 * strategy as `direct_leaf_lookup`.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 2 box) + §3 (I/O row)
 *   - backend/docs/ARCHITECTURE.md §4.5 (Multi-signal synthesis)
 *   - backend/docs/ARCHITECTURE.md §4.7 (head_nouns | raw_tokens tsquery)
 *   - backend/docs/ARCHITECTURE.md §7 (Cohere unavailable fallback)
 */
import {
  embed,
  rerank,
  CohereError,
  type RerankDocument,
} from '../lib/cohere-client';
import {
  cosineSearchChapters,
  cosineSearchHeadings,
  cosineSearchSubheadings,
  cosineSearchTariffLines,
  ftsSearchTariffLines,
  ftsSearchExclusions,
  getTariffLineParentChains,
  getSubheadingChildCounts,
  getTariffLinesForSubheadings,
  type FtsHit,
  type ExclusionFtsHit,
  type ParentChainRow,
} from '../lib/supabase-client';
import type {
  ChapterCode,
  HeadingCode,
  SubheadingCode,
  TariffLineCode,
  RetrievalCandidate,
  ExclusionPreFilterHit,
  RetrievalOutput,
  RetrievalScoreEntry,
  FtsMatch,
  L2TraceEntry,
  RetrievalStrategy,
} from '../types';

/* ---------------------------------------------------------------------------
 * Public input/output (extends types.ts) — internal to L2 for now since the
 * upstream orchestrator hasn't wired Triage→Retrieval yet. When L2.5 lands
 * the orchestrator will pass exactly this shape.
 * --------------------------------------------------------------------------- */

export interface L2Input {
  /** L0: alias-substituted, lowercased query. */
  normalized_query:        string;
  /** L0: tokenized form of normalized_query. */
  raw_tokens:              string[];
  /** L0: composite-product signal (drives Select's GIR 3(b) path). */
  composite_flag:          boolean;
  /** L1: candidate chapters Triage chose (2-3 per spec). */
  candidate_chapters:      ChapterCode[];
  /** L1: lemmatized head nouns for the FTS query. */
  head_nouns_for_fts:      string[];
}

/**
 * L2Output is the canonical L2 retrieval emission, aliased to `RetrievalOutput`
 * in `../types` so the orchestrator and types.ts stay in sync. Kept as a local
 * alias for backwards compat with existing test imports.
 */
export type L2Output = RetrievalOutput;

/* ---------------------------------------------------------------------------
 * Tunables
 * --------------------------------------------------------------------------- */

const TOP_K_CHAPTERS    = 3;
const TOP_K_HEADINGS    = 5;
const TOP_K_SUBHEADINGS = 5;
const TOP_K_TARIFF      = 10;
const FTS_LIMIT         = 20;
const EXCL_FTS_LIMIT    = 30;
const FINAL_TOP_K       = 5;

/* ---------------------------------------------------------------------------
 * tsquery escaping
 * --------------------------------------------------------------------------- */

/**
 * Convert a raw token into a tsquery-safe FRAGMENT (not a single lexeme).
 *
 * Postgres `to_tsquery` only accepts: words, optional weight markers, and the
 * operators `& | ! < >`. Quotes, ampersands, parens, colons, commas etc. will
 * raise `tsquery: syntax error`. We strip everything that isn't [a-z0-9_] and
 * split on whitespace.
 *
 *   - Single-word token (after strip)      → bare word, e.g. `hex`
 *   - Multi-word token                     → AND-joined inside parens, e.g.
 *                                            `(stainless & steel)`
 *   - Empty after strip / non-string input → empty string
 *
 * Postgres parses `-` as the NOT operator, so we MUST split (never join with
 * hyphens). The caller (`buildTsQuery`) OR-joins fragments with ` | ` at the
 * top level; multi-word fragments are already paren-wrapped here, so the final
 * tsquery is unambiguous.
 */
export function escapeTsQueryToken(token: string): string {
  if (typeof token !== 'string' || token.length === 0) return '';
  const stripped = token
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')                        // strip everything except [a-z0-9_]
    .trim();
  if (stripped.length === 0) return '';
  const words = stripped.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0] ?? '';
  return `(${words.join(' & ')})`;                       // multi-word → AND-joined inside parens
}

/**
 * Build an OR-joined tsquery from head_nouns + raw_tokens per ARCHITECTURE.md
 * §4.7: `head_a | head_b | raw_a | raw_b`. Returns empty string if all tokens
 * are unusable after escaping.
 */
export function buildTsQuery(
  headNouns:   string[],
  rawTokens:   string[],
): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  const allRaw = [...headNouns, ...rawTokens];
  for (const t of allRaw) {
    const safe = escapeTsQueryToken(t);
    if (safe.length === 0) continue;
    if (seen.has(safe)) continue;
    seen.add(safe);
    terms.push(safe);
  }
  return terms.join(' | ');
}

/* ---------------------------------------------------------------------------
 * Small utilities
 * --------------------------------------------------------------------------- */

function now(): number { return Date.now(); }

function topNCosine(
  rows: { code: string; cosine_score: number }[],
  n: number,
): { code: string; cosine_score: number }[] {
  return [...rows]
    .sort((a, b) => b.cosine_score - a.cosine_score)
    .slice(0, n);
}

function parentChainFromRow(row: ParentChainRow): RetrievalCandidate['parent_chain'] {
  return {
    chapter:     (row.chapter ?? null) as ChapterCode | null,
    heading:     (row.heading ?? null) as HeadingCode | null,
    subheading:  (row.subheading ?? null) as SubheadingCode | null,
    tariff_line: (row.code ?? null) as TariffLineCode | null,
  };
}

/* ---------------------------------------------------------------------------
 * Main entry point
 * --------------------------------------------------------------------------- */

/**
 * Run Layer 2 hybrid retrieval.
 *
 * @throws CohereError if embed fails after all retries (no embedding ⇒ no
 *   cosine search ⇒ no retrieval; we surface the failure rather than silently
 *   degrade further than the rerank-skip fallback).
 */
export async function retrieve(input: L2Input): Promise<L2Output> {
  const trace: L2TraceEntry[] = [];
  const t0 = now();

  /* ---------- Step 1: Cohere query embed -------------------------------- */
  const tEmbedStart = now();
  const embedRes = await embed(input.normalized_query, { inputType: 'search_query' });
  trace.push({
    step:      'cohere_embed',
    latencyMs: now() - tEmbedStart,
    count:     embedRes.embedding.length,
  });

  /* ---------- Step 2: Multi-level HNSW cosine cascade ------------------- */
  // Chapters
  const tChStart = now();
  const chapterHits = await cosineSearchChapters(
    embedRes.embedding,
    input.candidate_chapters,
    TOP_K_CHAPTERS,
  );
  trace.push({ step: 'cosine_chapters', latencyMs: now() - tChStart, count: chapterHits.length });

  // Headings
  const tHStart = now();
  const topChapterCodes = chapterHits.map((c) => c.code);
  const headingHits = await cosineSearchHeadings(
    embedRes.embedding,
    topChapterCodes,
    TOP_K_HEADINGS,
  );
  trace.push({ step: 'cosine_headings', latencyMs: now() - tHStart, count: headingHits.length });

  // Subheadings
  const tShStart = now();
  const topHeadingCodes = headingHits.map((h) => h.code);
  const subheadingHits = await cosineSearchSubheadings(
    embedRes.embedding,
    topHeadingCodes,
    TOP_K_SUBHEADINGS,
  );
  trace.push({
    step:      'cosine_subheadings',
    latencyMs: now() - tShStart,
    count:     subheadingHits.length,
  });

  // Tariff lines
  const tTlStart = now();
  const topSubheadingCodes = subheadingHits.map((sh) => sh.code);
  const tariffHits = await cosineSearchTariffLines(
    embedRes.embedding,
    topSubheadingCodes,
    TOP_K_TARIFF,
  );
  trace.push({
    step:      'cosine_tariff_lines',
    latencyMs: now() - tTlStart,
    count:     tariffHits.length,
  });

  /* ---------- Step 3: GIN-FTS on tariff_lines + chapter_exclusions ------ */
  const tsquery = buildTsQuery(input.head_nouns_for_fts, input.raw_tokens);

  const tFtsStart = now();
  let ftsTariff: FtsHit[] = [];
  let ftsExcl:   ExclusionFtsHit[] = [];
  if (tsquery.length > 0) {
    // Run in parallel — independent queries.
    [ftsTariff, ftsExcl] = await Promise.all([
      ftsSearchTariffLines(tsquery, input.candidate_chapters, FTS_LIMIT),
      ftsSearchExclusions(tsquery, input.candidate_chapters, EXCL_FTS_LIMIT),
    ]);
  }
  trace.push({
    step:      'fts_tariff_lines',
    latencyMs: now() - tFtsStart,
    count:     ftsTariff.length,
  });
  trace.push({
    step:      'fts_exclusions',
    latencyMs: 0,                                                // included above
    count:     ftsExcl.length,
  });

  const exclusion_pre_filter: ExclusionPreFilterHit[] = ftsExcl.map((e) => ({
    exclusion_id:           e.id,
    source_chapter:         e.source_chapter as ChapterCode,
    excluded_product_text:  e.excluded_product_text,
    redirects_to_chapter:   e.redirects_to_chapter as ChapterCode[],
  }));

  const fts_matches: FtsMatch[] = ftsTariff.map((f) => ({
    code:         f.code,
    matched_text: f.matched_text,
    rank:         f.rank,
  }));

  /* ---------- Step 4: SHORTCUT — direct-leaf lookup --------------------- */
  // If every top subheading has exactly 1 tariff_line child, we can skip rerank.
  let retrieval_strategy: RetrievalStrategy = 'cascade_full';
  let directLeafRows: ParentChainRow[] = [];
  if (subheadingHits.length > 0) {
    const tCntStart = now();
    const counts = await getSubheadingChildCounts(topSubheadingCodes);
    trace.push({
      step:      'subheading_child_counts',
      latencyMs: now() - tCntStart,
      count:     counts.length,
    });

    const allSingleton =
      counts.length === topSubheadingCodes.length
        && counts.every((c) => c.child_count === 1);

    if (allSingleton) {
      retrieval_strategy = 'direct_leaf_lookup';
      const tDlStart = now();
      directLeafRows = await getTariffLinesForSubheadings(topSubheadingCodes);
      trace.push({
        step:      'direct_leaf_fetch',
        latencyMs: now() - tDlStart,
        count:     directLeafRows.length,
      });
    }
  }

  /* ---------- Step 5: Build candidate union for rerank or direct emit --- */
  // Per-code score map (cosine + fts_rank). Rerank scores attached later.
  const scoreMap = new Map<string, RetrievalScoreEntry>();

  // Seed with tariff cosine hits (best cosine score retained per code).
  for (const t of tariffHits) {
    const prev = scoreMap.get(t.code);
    const cosine = Number(t.cosine_score);
    if (!prev || cosine > prev.cosine_score) {
      scoreMap.set(t.code, { cosine_score: cosine, fts_rank: null, rerank_score: null });
    }
  }
  // Merge FTS rank (keep cosine if present; otherwise default to 0).
  for (const f of ftsTariff) {
    const existing = scoreMap.get(f.code);
    if (existing) {
      existing.fts_rank = existing.fts_rank === null ? f.rank : Math.max(existing.fts_rank, f.rank);
    } else {
      scoreMap.set(f.code, { cosine_score: 0, fts_rank: f.rank, rerank_score: null });
    }
  }

  // For direct-leaf strategy, override with direct rows (each cosine=highest
  // possible match available; if missing, default to 0.5 — placeholder until
  // we re-score against the cosine table). We DON'T rerank in this branch.
  if (retrieval_strategy === 'direct_leaf_lookup') {
    for (const r of directLeafRows) {
      if (!scoreMap.has(r.code)) {
        scoreMap.set(r.code, { cosine_score: 0, fts_rank: null, rerank_score: null });
      }
    }
  }

  /* ---------- Step 6: Cohere Rerank (cascade_full only) ----------------- */
  let finalCodes: string[];
  if (retrieval_strategy === 'direct_leaf_lookup') {
    finalCodes = directLeafRows.map((r) => r.code);
  } else {
    // Union of cosine + FTS, dedup. Rerank if any candidates exist AND Cohere
    // key is present; otherwise fall back to cosine-only ordering.
    const unionCodes = Array.from(scoreMap.keys());

    if (unionCodes.length === 0) {
      // 0 cosine + 0 FTS — nothing to rerank. Empty candidates.
      trace.push({ step: 'rerank_skipped_empty', latencyMs: 0, count: 0 });
      finalCodes = [];
    } else {
      // Fetch parent chains so we can build rerank documents with context.
      const tPcStart = now();
      const chainRows = await getTariffLineParentChains(unionCodes);
      trace.push({
        step:      'parent_chains_for_rerank',
        latencyMs: now() - tPcStart,
        count:     chainRows.length,
      });
      const chainByCode = new Map<string, ParentChainRow>();
      for (const r of chainRows) chainByCode.set(r.code, r);

      const rerankDocs: RerankDocument[] = [];
      for (const code of unionCodes) {
        const row = chainByCode.get(code);
        if (!row) continue;                                      // skip codes the DB didn't return
        const text = [
          `Chapter ${row.chapter}`,
          `Heading ${row.heading}`,
          `Subheading ${row.subheading}`,
          row.description,
        ].join(' | ');
        rerankDocs.push({ id: code, text });
      }

      if (rerankDocs.length === 0) {
        trace.push({ step: 'rerank_skipped_no_docs', latencyMs: 0, count: 0 });
        finalCodes = [];
      } else {
        try {
          const tRrStart = now();
          const rerankRes = await rerank(input.normalized_query, rerankDocs, {
            topN: FINAL_TOP_K,
          });
          trace.push({
            step:      'cohere_rerank',
            latencyMs: now() - tRrStart,
            count:     rerankRes.ranked.length,
          });
          for (const r of rerankRes.ranked) {
            const entry = scoreMap.get(r.id);
            if (entry) entry.rerank_score = r.relevance_score;
          }
          finalCodes = rerankRes.ranked.map((r) => r.id);
        } catch (err: unknown) {
          // Cohere unavailable → fallback to cosine-only ranking per
          // ARCHITECTURE.md §7.
          if (err instanceof CohereError) {
            trace.push({
              step:      'cohere_rerank_fallback_cosine',
              latencyMs: 0,
              count:     0,
            });
            finalCodes = [...unionCodes]
              .sort((a, b) => {
                const ea = scoreMap.get(a) ?? { cosine_score: 0, fts_rank: null, rerank_score: null };
                const eb = scoreMap.get(b) ?? { cosine_score: 0, fts_rank: null, rerank_score: null };
                return eb.cosine_score - ea.cosine_score;
              })
              .slice(0, FINAL_TOP_K);
          } else {
            throw err;
          }
        }
      }
    }
  }

  /* ---------- Step 7: Build final RetrievalCandidate[] ----------------- */
  // Fetch parent chains for the FINAL codes (those we'll emit). For
  // direct-leaf this is the directLeafRows we already have; for cascade we
  // may have a subset already fetched. Re-fetch only missing codes.
  const tFinalChainStart = now();
  const haveChainsFor = new Set<string>();
  const chainByCode = new Map<string, ParentChainRow>();
  if (retrieval_strategy === 'direct_leaf_lookup') {
    for (const r of directLeafRows) {
      chainByCode.set(r.code, r);
      haveChainsFor.add(r.code);
    }
  }
  const missingChainCodes = finalCodes.filter((c) => !haveChainsFor.has(c));
  if (missingChainCodes.length > 0) {
    const rows = await getTariffLineParentChains(missingChainCodes);
    for (const r of rows) chainByCode.set(r.code, r);
  }
  trace.push({
    step:      'final_parent_chain_lookup',
    latencyMs: now() - tFinalChainStart,
    count:     finalCodes.length,
  });

  const candidates: RetrievalCandidate[] = [];
  for (const code of finalCodes.slice(0, FINAL_TOP_K)) {
    const chain = chainByCode.get(code);
    const score = scoreMap.get(code);
    if (!chain) continue;                                        // DB lookup miss; skip
    candidates.push({
      code,
      level:         'tariff_line',
      cosine_score:  score?.cosine_score  ?? 0,
      fts_rank:      score?.fts_rank      ?? null,
      rerank_score:  score?.rerank_score  ?? null,
      parent_chain:  parentChainFromRow(chain),
    });
  }

  /* ---------- Step 8: Emit L2Output ------------------------------------ */
  const retrieval_scores: Record<string, RetrievalScoreEntry> = {};
  for (const [code, entry] of scoreMap.entries()) {
    retrieval_scores[code] = { ...entry };
  }

  trace.push({ step: 'l2_total', latencyMs: now() - t0, count: candidates.length });

  return {
    candidates,
    retrieval_scores,
    fts_matches,
    exclusion_pre_filter,
    retrieval_strategy,
    // The query embedding is computed once at Step 1 and runs for BOTH
    // strategies (direct_leaf_lookup is decided later, in Step 4). Surface it so
    // L5 Rule-4 cosine floor reuses this vector instead of re-embedding.
    query_embedding: embedRes.embedding,
    trace,
  };
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  buildTsQuery,
  escapeTsQueryToken,
  TOP_K_CHAPTERS,
  TOP_K_HEADINGS,
  TOP_K_SUBHEADINGS,
  TOP_K_TARIFF,
  FTS_LIMIT,
  EXCL_FTS_LIMIT,
  FINAL_TOP_K,
  topNCosine,
};

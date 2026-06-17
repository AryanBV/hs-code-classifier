/**
 * Layer 2 — Hybrid Retrieval (Phase 4 v2)
 *
 * Deterministic, NO LLM (the rerank stage is the one Gemini-Flash call). Combines
 * four signals:
 *   1. Default-embedder query embedding (gemini-embedding-001, 1536-dim).
 *   2. Multi-level HNSW cosine search through chapters → headings → subheadings →
 *      tariff_lines via pgvector `<=>`.
 *   3. PostgreSQL GIN-FTS on `tariff_lines.fts_search_text` from
 *      `head_nouns_for_fts | raw_tokens` (OR-joined per ARCHITECTURE.md §4.7).
 *   4. Default reranker (Gemini-Flash) on the union of cosine + FTS candidates
 *      (Cohere is an off-path A/B fallback).
 *
 * SHORTCUT (~60% of queries per recon): when all top subheadings have exactly
 * one tariff_line child, skip the rerank and emit direct-leaf codes — flag the
 * strategy as `direct_leaf_lookup`.
 *
 * Provider abstraction (M2): the query embedding comes from the pluggable
 * `EmbeddingProvider` (default `gemini-embedding-001`, 1536-dim, via the Gemini
 * Developer API @google/genai; Vertex AI is the rollback) and the rerank from the
 * pluggable `Reranker` (default Gemini-Flash; Cohere off-path). L2 no longer
 * imports the Cohere client directly; the degrade-path catches the neutral
 * `RetrievalProviderError` instead of `CohereError`.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 2 box) + §3 (I/O row)
 *   - backend/docs/ARCHITECTURE.md §4.5 (Multi-signal synthesis)
 *   - backend/docs/ARCHITECTURE.md §4.7 (head_nouns | raw_tokens tsquery)
 *   - backend/docs/ARCHITECTURE.md §7 (provider unavailable → cosine-only fallback)
 */
import {
  getEmbeddingProvider,
  type EmbeddingProvider,
} from '../lib/embedding-provider';
import {
  getReranker,
  type Reranker,
  type RerankDocument,
} from '../lib/reranker';
import { RetrievalProviderError } from '../lib/retrieval-errors';
import {
  cosineSearchChapters,
  cosineSearchHeadings,
  cosineSearchSubheadings,
  cosineSearchTariffLines,
  ftsSearchTariffLines,
  ftsSearchExclusions,
  getTariffLineParentChains,
  getSubheadingChildCounts,
  getSubheadingsForHeadings,
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
// FIX-A (2026-05-28, recall): widen the L2 funnel. Diagnosis found correct
// codes landing at FTS rank #6–#15 and being dropped by a DOUBLE top-5 funnel
// (Cohere rerank topN=5 AND L3 collapse=5). Widen each stage so rank #6–#8
// survives to L4 (whose prompt handles a few more candidates fine).
const FTS_LIMIT         = 40;   // was 20 — fetch deeper so #20–#40 reach the union
const EXCL_FTS_LIMIT    = 30;
const RERANK_TOP_N      = 15;   // was 5 — reranker returns more candidates
const L2_EMIT_CAP       = 8;    // was 5 — emit up to 8 so rank #6–#8 reaches L3/L4

// RESIDUAL-LEAF-FLOOR (2026-05-30, recall): for pharma/supplement queries the
// trace showed L4 EXPLICITLY reasoning toward a subheading's residual "Other"
// leaf (e.g. 3004.90.99, 2106.90.99) and then ABSTAINING because that leaf was
// never a candidate (the rerank surfaced sibling .NN leaves but not the .99
// catch-all). This deterministic floor GUARANTEES the residual leaf of the
// DOMINANT surfaced subheading(s) is present so L4 can pick it.
//
// Bounding (gate-2 lesson — keep the final count near L2_EMIT_CAP=8):
//   - Only the subheadings of the TOP-N reranked candidates are eligible
//     (RESIDUAL_FLOOR_TOP_SUBHEADINGS), never every subheading in the DB.
//   - At most MAX_RESIDUAL_FLOOR_ADDS residual leaves are force-included, and
//     they are appended AFTER the L2_EMIT_CAP slice — so the emit is bounded by
//     L2_EMIT_CAP + MAX_RESIDUAL_FLOOR_ADDS and the reranked top-8 are never
//     displaced by a forced residual.
const RESIDUAL_FLOOR_TOP_SUBHEADINGS = 2; // dominant subheadings eligible for a floor
const MAX_RESIDUAL_FLOOR_ADDS        = 2; // hard cap on extra forced residual slots

/* ---------------------------------------------------------------------------
 * Provider injection seam
 *
 * Mirrors `supabase-client._setQueryRunnerForTesting` / `L5-verifier`'s
 * runner-injection convention: a module-level slot defaulting to `null`, a lazy
 * getter that falls back to the env factory, and a test-only setter. Tests
 * inject mock providers instead of mocking the underlying clients.
 * --------------------------------------------------------------------------- */

let _embeddingProvider: EmbeddingProvider | null = null;
let _reranker:          Reranker | null = null;

function getActiveEmbeddingProvider(): EmbeddingProvider {
  return _embeddingProvider ?? getEmbeddingProvider();
}

function getActiveReranker(): Reranker {
  return _reranker ?? getReranker();
}

/**
 * Test-only hook: inject mock providers. Pass `null` for either field (or omit
 * it) to leave that slot at its current value; pass `null` explicitly to restore
 * the env factory for that provider.
 */
export function _setProvidersForTesting(overrides: {
  embeddingProvider?: EmbeddingProvider | null;
  reranker?:          Reranker | null;
}): void {
  if ('embeddingProvider' in overrides) _embeddingProvider = overrides.embeddingProvider ?? null;
  if ('reranker' in overrides)          _reranker          = overrides.reranker ?? null;
}

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
 * Generic modifier stopwords that dilute FTS ranking.
 *
 * FIX-B (2026-05-28, recall): the OLD buildTsQuery flat-OR-joined head_nouns AND
 * raw_tokens with equal weight, so generic modifiers ("bulk","powder","ladies",
 * "luxury","other", etc.) that co-occur in HS descriptions inflated `ts_rank_cd`
 * and pushed the discriminating noun's row down (empirically confirmed: dropping
 * "other","article" reordered Ch.73 screw results around the noun).
 *
 * We drop these ONLY from raw_tokens — head_nouns (the discriminating signal
 * chosen by L0/L1) are NEVER dropped, even if a head noun happens to be in this
 * list (e.g. a product literally named "powder").
 *
 * NOTE on the rejected alternative: Postgres query-side weight labels (`:A`/`:C`)
 * were tested empirically and FILTER OUT every hit — a weighted query lexeme only
 * matches a tsvector lexeme of that weight class, and the document tsvector is
 * built unweighted (default weight 'D'). Using weights would require `setweight()`
 * on the document side (re-deriving per-column weights), which is out of scope and
 * risky. Modifier-drop is the clean, safe lever.
 */
// Conservative generic-filler list; NEEDS empirical tuning (Phase 4.x) —
// terms like 'powder'/'bulk'/'API' can be
// discriminating (e.g. "powder" distinguishes milk powder from liquid milk;
// "bulk"/"api" distinguish bulk active ingredient from formulation) and were
// intentionally NOT dropped here. Only clearly-non-discriminating filler stays.
const GENERIC_FTS_MODIFIERS: ReadonlySet<string> = new Set([
  'for', 'export', 'made', 'india', 'quality', 'high', 'other', 'article',
  'articles', 'piece', 'set', 'kg', 'new', 'used', 'type', 'kind',
]);

/**
 * Build an OR-joined tsquery from head_nouns + raw_tokens per ARCHITECTURE.md
 * §4.7: `head_a | head_b | raw_a | raw_b`.
 *
 * FIX-B: head_nouns are kept verbatim (discriminating signal); raw_tokens that
 * are generic modifiers (see GENERIC_FTS_MODIFIERS) are dropped so the noun
 * dominates `ts_rank_cd`. Robustness: if head_nouns is empty AND every raw_token
 * was a modifier, we fall back to the raw_tokens UNFILTERED so we never emit an
 * empty query when usable input exists. Returns '' only when no usable tokens.
 */
export function buildTsQuery(
  headNouns:   string[],
  rawTokens:   string[],
): string {
  const seen = new Set<string>();
  const terms: string[] = [];

  // Head nouns first — always kept (the discriminating term).
  for (const t of headNouns) {
    const safe = escapeTsQueryToken(t);
    if (safe.length === 0 || seen.has(safe)) continue;
    seen.add(safe);
    terms.push(safe);
  }

  // Raw tokens — drop generic modifiers so the noun dominates ts_rank_cd.
  for (const t of rawTokens) {
    const lower = typeof t === 'string' ? t.toLowerCase().trim() : '';
    if (GENERIC_FTS_MODIFIERS.has(lower)) continue;
    const safe = escapeTsQueryToken(t);
    if (safe.length === 0 || seen.has(safe)) continue;
    seen.add(safe);
    terms.push(safe);
  }

  if (terms.length > 0) return terms.join(' | ');

  // Robustness fallback: head_nouns empty AND every raw token was a modifier.
  // Use raw_tokens unfiltered so we don't lose retrieval entirely.
  const seenFb = new Set<string>();
  const fallback: string[] = [];
  for (const t of rawTokens) {
    const safe = escapeTsQueryToken(t);
    if (safe.length === 0 || seenFb.has(safe)) continue;
    seenFb.add(safe);
    fallback.push(safe);
  }
  return fallback.join(' | ');
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

/**
 * Match a STANDALONE "other" token in a tariff-line description.
 *
 * We deliberately require a word-boundary match (not a naive substring) so we
 * do NOT treat "Anti-other..." style mid-word noise as a residual signal, and
 * so the residual floor stays a no-op for subheadings whose highest leaf is a
 * specific named product (e.g. 0307.42.20 "Squid", 0102.21.20 "Cows") rather
 * than a catch-all "Other" line. Empirically (DB corpus, 2026-05-30) this gates
 * out the ~10% of multi-leaf subheadings where the max code is NOT a residual.
 */
function descHasStandaloneOther(desc: string | null | undefined): boolean {
  if (typeof desc !== 'string' || desc.length === 0) return false;
  return /(^|[^a-z])other([^a-z]|$)/i.test(desc);
}

/**
 * Pick the residual ("Other") leaf for a subheading from its tariff_line rows.
 *
 * Rule (deterministic; per spec "pick the residual by description Other or the
 * highest leaf number"):
 *   1. Consider only leaves whose description contains a standalone "other"
 *      token (the catch-all residual marker).
 *   2. Among those, pick the HIGHEST code (lexicographic max). Per DB corpus
 *      this resolves to the canonical `.99` residual when present, else the
 *      highest `.90`/`.NN` "Other" sub-line.
 *   3. If NO leaf is a standalone-"other" residual, return null → the floor is a
 *      no-op for this subheading (never force-includes a specific named leaf).
 */
function selectResidualLeaf(rows: ParentChainRow[]): ParentChainRow | null {
  let best: ParentChainRow | null = null;
  for (const r of rows) {
    if (!descHasStandaloneOther(r.description)) continue;
    if (best === null || r.code > best.code) best = r;
  }
  return best;
}

/* ---------------------------------------------------------------------------
 * Main entry point
 * --------------------------------------------------------------------------- */

/**
 * Run Layer 2 hybrid retrieval.
 *
 * @throws RetrievalProviderError if the query embed fails after all retries (no
 *   embedding ⇒ no cosine search ⇒ no retrieval; we surface the failure rather
 *   than silently degrade further than the rerank-skip fallback).
 */
export async function retrieve(input: L2Input): Promise<L2Output> {
  const trace: L2TraceEntry[] = [];
  const t0 = now();

  /* ---------- Step 1: provider query embed ----------------------------- */
  // Sourced from the pluggable EmbeddingProvider (default gemini-embedding-001 via
  // the Gemini Developer API; Vertex AI is the rollback). taskType RETRIEVAL_QUERY
  // (vs RETRIEVAL_DOCUMENT for the corpus). The resulting vector is L2-normalized
  // and reused by L5.
  const tEmbedStart = now();
  const embedRes = await getActiveEmbeddingProvider().embed(input.normalized_query, {
    taskType: 'RETRIEVAL_QUERY',
  });
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
      // RECALL fix (part 2): expand the leaf set to ALL subheadings of the
      // SURFACED HEADINGS (topHeadingCodes) — not just the cosine top-5
      // subheadings — so missing sibling subheadings AND the residual
      // `.90/.99/Other` leaf of each candidate subheading enter the rerank pool
      // (e.g. plastic chair 9401.80). Fall back to the cosine top-5 subheadings
      // if the heading expansion returns nothing (defensive; keeps prior behavior).
      const expandedSubheadings = await getSubheadingsForHeadings(topHeadingCodes);
      const leafSubheadings =
        expandedSubheadings.length > 0 ? expandedSubheadings : topSubheadingCodes;
      directLeafRows = await getTariffLinesForSubheadings(leafSubheadings);
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

  // RECALL fix (part 1): for the direct-leaf strategy, UNION the direct-leaf
  // codes into scoreMap WITHOUT discarding the FTS/cosine union already seeded
  // above. Previously this branch emitted ONLY the direct-leaf rows and skipped
  // rerank, dropping FTS-surfaced golds (e.g. ferro-tungsten 7202.80). Now the
  // union (cosine ∪ FTS ∪ expanded-direct-leaf) flows through the SAME rerank
  // cascade as cascade_full, then is sliced to L2_EMIT_CAP.
  if (retrieval_strategy === 'direct_leaf_lookup') {
    for (const r of directLeafRows) {
      if (!scoreMap.has(r.code)) {
        scoreMap.set(r.code, { cosine_score: 0, fts_rank: null, rerank_score: null });
      }
    }
  }

  /* ---------- Step 6: Rerank the candidate union ----------------------- */
  // Both strategies (cascade_full AND direct_leaf_lookup) now rerank the union
  // of cosine + FTS (+ expanded direct-leaf) candidates. The retrieval_strategy
  // label is preserved for tracing; only the candidate sourcing differs.
  let finalCodes: string[];
  {
    // Union of cosine + FTS (+ direct-leaf), dedup. Rerank if any candidates
    // exist; on a provider failure we fall back to cosine-only ordering.
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
          const rerankRes = await getActiveReranker().rerank(input.normalized_query, rerankDocs, {
            topN: RERANK_TOP_N,
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
          // Rerank provider unavailable → fallback to cosine-only ranking per
          // ARCHITECTURE.md §7. Catches the neutral provider error so L2 stays
          // vendor-agnostic.
          if (err instanceof RetrievalProviderError) {
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
              .slice(0, L2_EMIT_CAP);
          } else {
            throw err;
          }
        }
      }
    }
  }

  /* ---------- Step 6.5: RESIDUAL-LEAF-FLOOR ---------------------------- */
  // Guarantee the residual ("Other") leaf of the DOMINANT surfaced subheading(s)
  // is in the emitted set, so L4 can pick a residual it explicitly reasons
  // toward (e.g. pharma 3004.90.99) instead of abstaining because the leaf was
  // never a candidate. Bounded: only the subheadings of the TOP-N reranked
  // candidates are eligible, at most MAX_RESIDUAL_FLOOR_ADDS residuals are added,
  // and they are appended AFTER the L2_EMIT_CAP slice (never displacing the
  // reranked top-8). chainByCode/scoreMap are pre-seeded here for the forced
  // codes so Step 7 emits them without a second lookup.
  const chainByCode = new Map<string, ParentChainRow>();
  const emitCodes: string[] = finalCodes.slice(0, L2_EMIT_CAP);
  const residualFloorAdded: string[] = [];
  {
    // Dominant subheadings = the distinct subheadings of the top reranked
    // candidates, in rank order. `code.slice(0,7)` is the "NNNN.NN" subheading
    // (the DB-enforced format). Skip if there is nothing reranked.
    const dominantSubheadings: string[] = [];
    const seenSh = new Set<string>();
    for (const code of finalCodes) {
      const sh = code.slice(0, 7);
      if (sh.length !== 7 || seenSh.has(sh)) continue;
      seenSh.add(sh);
      dominantSubheadings.push(sh);
      if (dominantSubheadings.length >= RESIDUAL_FLOOR_TOP_SUBHEADINGS) break;
    }

    if (dominantSubheadings.length > 0) {
      const tFloorStart = now();
      const floorRows = await getTariffLinesForSubheadings(dominantSubheadings);
      // Group fetched leaves by subheading so selectResidualLeaf sees the full
      // sibling set (it needs ALL leaves to pick the standalone-"Other" line).
      const rowsBySh = new Map<string, ParentChainRow[]>();
      for (const r of floorRows) {
        const list = rowsBySh.get(r.subheading);
        if (list) list.push(r);
        else rowsBySh.set(r.subheading, [r]);
      }

      const alreadyEmitted = new Set<string>(emitCodes);
      for (const sh of dominantSubheadings) {
        if (residualFloorAdded.length >= MAX_RESIDUAL_FLOOR_ADDS) break;
        const rows = rowsBySh.get(sh);
        if (!rows || rows.length < 2) continue;                  // singleton/empty → no residual
        const residual = selectResidualLeaf(rows);
        if (!residual) continue;                                  // no standalone-"Other" leaf → no-op
        if (alreadyEmitted.has(residual.code)) continue;          // already a candidate → no dup
        // Force-include: seed chain + score, append to the emit list.
        chainByCode.set(residual.code, residual);
        if (!scoreMap.has(residual.code)) {
          scoreMap.set(residual.code, { cosine_score: 0, fts_rank: null, rerank_score: null });
        }
        emitCodes.push(residual.code);
        alreadyEmitted.add(residual.code);
        residualFloorAdded.push(residual.code);
      }
      trace.push({
        step:      'residual_floor_added',
        latencyMs: now() - tFloorStart,
        count:     residualFloorAdded.length,
      });
    }
  }

  /* ---------- Step 7: Build final RetrievalCandidate[] ----------------- */
  // Fetch parent chains for the FINAL codes (those we'll emit). For
  // direct-leaf this is the directLeafRows we already have; for cascade we
  // may have a subset already fetched. Re-fetch only missing codes. Forced
  // residuals (Step 6.5) already have their chains pre-seeded above.
  const tFinalChainStart = now();
  const haveChainsFor = new Set<string>(chainByCode.keys());
  if (retrieval_strategy === 'direct_leaf_lookup') {
    for (const r of directLeafRows) {
      chainByCode.set(r.code, r);
      haveChainsFor.add(r.code);
    }
  }
  const missingChainCodes = emitCodes.filter((c) => !haveChainsFor.has(c));
  if (missingChainCodes.length > 0) {
    const rows = await getTariffLineParentChains(missingChainCodes);
    for (const r of rows) chainByCode.set(r.code, r);
  }
  trace.push({
    step:      'final_parent_chain_lookup',
    latencyMs: now() - tFinalChainStart,
    count:     emitCodes.length,
  });

  const candidates: RetrievalCandidate[] = [];
  for (const code of emitCodes) {
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

  // ENV-GATED debug field: only populated when RECALL_FORENSIC_DEBUG=1.
  // Exposes the set of cosine-cascade subheadings surfaced before rerank, so the
  // recall-forensic script can partition loss (bucket A = not-surfaced vs B/C).
  const debugSurfacedSubheadings: string[] | undefined =
    process.env.RECALL_FORENSIC_DEBUG === '1' ? [...topSubheadingCodes] : undefined;

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
    ...(debugSurfacedSubheadings !== undefined
      ? { debug_surfaced_subheadings: debugSurfacedSubheadings }
      : {}),
    // Observability: surface the residual leaves the floor force-included (only
    // when non-empty; absent on a no-op).
    ...(residualFloorAdded.length > 0
      ? { residual_floor_added: residualFloorAdded as TariffLineCode[] }
      : {}),
  };
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  buildTsQuery,
  escapeTsQueryToken,
  GENERIC_FTS_MODIFIERS,
  TOP_K_CHAPTERS,
  TOP_K_HEADINGS,
  TOP_K_SUBHEADINGS,
  TOP_K_TARIFF,
  FTS_LIMIT,
  EXCL_FTS_LIMIT,
  RERANK_TOP_N,
  L2_EMIT_CAP,
  RESIDUAL_FLOOR_TOP_SUBHEADINGS,
  MAX_RESIDUAL_FLOOR_ADDS,
  topNCosine,
  selectResidualLeaf,
  descHasStandaloneOther,
};

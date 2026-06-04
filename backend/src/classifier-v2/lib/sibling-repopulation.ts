/**
 * SIBLING REPOPULATION — Stage S1 of the RDC-X classifier upgrade.
 *
 * THE RECALL HOLE THIS FIXES
 *   L2 emits at most `L2_EMIT_CAP` (=8) reranked candidates. When a surviving
 *   6-digit subheading owns MORE than its share of that cap (e.g. a heading whose
 *   leaves split across two subheadings, each with 6+ leaves), the reranker's
 *   top-8 slice silently TRUNCATES the leaf population: some 8-digit siblings of a
 *   surviving subheading never reach L3/L4. The later divergence / ASK math (S4)
 *   then reasons over a TRUNCATED leaf set and can miscount the real fan-out (e.g.
 *   conclude a subheading is "decided" when in fact 5 unseen siblings remain).
 *
 * WHAT THIS HELPER DOES
 *   Given the surviving candidate set, it re-reads the COMPLETE 8-digit leaf
 *   population of each distinct surviving subheading ("NNNN.NN") in ONE batched
 *   query, then merges those leaves back into the emit set — so S4 sees the TRUE
 *   full sibling family, not the rerank-truncated top-8.
 *
 * SCOPE (Stage S1) — PURE, ADDITIVE, FAIL-SAFE, DARK
 *   - PURE-ish: a single batched read; no writes, no Date, no global mutation.
 *   - ADDITIVE: only widens the candidate set; never drops or reorders the emit set.
 *   - FAIL-SAFE: ANY fetch error → return the ORIGINAL emit set unchanged, never throw.
 *   - DARK: NOT wired into the live classification path. S4 will call it. Current
 *     production behavior is byte-identical.
 *
 * SHAPE COMPATIBILITY
 *   Returns `RetrievalCandidate[]` — the exact shape L3/L4/S4 already consume.
 *   Newly-fetched siblings are minted with the same `parent_chain` construction
 *   L2 uses (`parentChainFromRow`), `level: 'tariff_line'`, and SENTINEL scores
 *   (`cosine_score: 0`, `fts_rank: null`, `rerank_score: null`) — they carry no
 *   retrieval signal because they were NOT retrieved; they are population fill.
 *   Emit-set members keep their original rerank/cosine/fts scores verbatim.
 */
import type {
  ChapterCode,
  HeadingCode,
  RetrievalCandidate,
  SubheadingCode,
  TariffLineCode,
} from '../types';
import { subheadingOfCandidate } from './cross-subheading-ask';
import {
  getTariffLinesForSubheadings,
  type ParentChainRow,
} from './supabase-client';

/* ---------------------------------------------------------------------------
 * Candidate minting (mirrors L2-retrieval.ts `parentChainFromRow` exactly)
 * --------------------------------------------------------------------------- */

/** Build a candidate's parent_chain from a fetched tariff_line row (L2 parity). */
function parentChainFromRow(row: ParentChainRow): RetrievalCandidate['parent_chain'] {
  return {
    chapter:     (row.chapter ?? null) as ChapterCode | null,
    heading:     (row.heading ?? null) as HeadingCode | null,
    subheading:  (row.subheading ?? null) as SubheadingCode | null,
    tariff_line: (row.code ?? null) as TariffLineCode | null,
  };
}

/**
 * Mint a population-fill `RetrievalCandidate` from a fetched leaf row.
 *
 * SENTINEL scores: these leaves were never retrieved or reranked, so they carry
 * no retrieval signal. `cosine_score: 0` (a non-null sentinel — matches L2's
 * own treatment of un-cosine'd direct-leaf rows), `fts_rank: null`,
 * `rerank_score: null`. The `rerank_score: null` is load-bearing: S4's
 * decisiveness math already treats a null rerank as "no signal" and the existing
 * cross-subheading margin code (`computeCrossSubheadingMargin`) SKIPS null-rerank
 * candidates, so injected siblings widen the POPULATION without polluting the
 * margin computation.
 */
function siblingCandidateFromRow(row: ParentChainRow): RetrievalCandidate {
  return {
    code:         row.code,
    level:        'tariff_line',
    cosine_score: 0,
    fts_rank:     null,
    rerank_score: null,
    parent_chain: parentChainFromRow(row),
  };
}

/* ---------------------------------------------------------------------------
 * Subheading-key extraction
 * --------------------------------------------------------------------------- */

/**
 * The DISTINCT, well-formed 6-digit subheading keys ("NNNN.NN") occupied by a
 * candidate set, in stable sorted order. Reuses `subheadingOfCandidate` (the
 * shared parent-chain-first derivation used by cross-subheading-ask / sibling-ask)
 * so the key space is identical to the rest of the post-L3 family. Candidates
 * whose subheading is unresolvable (empty string) are skipped.
 */
export function distinctSubheadingKeys(candidates: RetrievalCandidate[]): SubheadingCode[] {
  const keys = new Set<string>();
  for (const c of candidates) {
    const sub = subheadingOfCandidate(c);
    if (/^\d{4}\.\d{2}$/.test(sub)) keys.add(sub);
  }
  return [...keys].sort();
}

/* ---------------------------------------------------------------------------
 * Family fetch (one batched query) + merge/dedupe
 * --------------------------------------------------------------------------- */

/**
 * Fetch the FULL 8-digit `tariff_lines` family for a set of 6-digit subheadings
 * in ONE batched query, returned as population-fill `RetrievalCandidate[]`.
 *
 * Delegates to the existing `getTariffLinesForSubheadings` helper, which runs the
 * batched `WHERE tl.subheading = ANY($1)` query (joined up to heading/chapter for
 * the parent chain) through the shared retry-wrapped pool. Empty input → `[]` with
 * no DB round-trip.
 *
 * FAIL-SAFE: never throws. On ANY fetch error this returns `[]` (the caller —
 * `repopulateSiblings` — then leaves the emit set untouched). Pure read; no writes.
 */
export async function fetchFullSiblingFamily(
  subheadings: SubheadingCode[],
): Promise<RetrievalCandidate[]> {
  const keys = subheadings.filter((s) => /^\d{4}\.\d{2}$/.test(s));
  if (keys.length === 0) return [];
  try {
    const rows = await getTariffLinesForSubheadings([...new Set(keys)]);
    return rows.map(siblingCandidateFromRow);
  } catch {
    // FAIL-SAFE: any DB/transport error degrades to "no repopulation".
    return [];
  }
}

/**
 * Repopulate the surviving emit set with the FULL leaf family of every distinct
 * surviving subheading, so downstream divergence/ASK math (S4) reasons over the
 * TRUE sibling population rather than the rerank-truncated top-8.
 *
 * MERGE + DEDUPE (by `code`):
 *   - The original emit set is kept VERBATIM and FIRST — its order, its rerank /
 *     cosine / fts scores, everything. The emit set is authoritative for any code
 *     it already contains.
 *   - Fetched family leaves whose code is ALREADY in the emit set are DROPPED
 *     (the emit-set entry, with its real rerank score, wins). This is the
 *     score-preservation guarantee: a sibling that survived rerank keeps its score.
 *   - Only family leaves whose code is NOT in the emit set are APPENDED, in the
 *     DB's stable code order, each with sentinel scores (no retrieval signal).
 *
 * FAIL-SAFE: never throws and has no side effects. On ANY fetch error (or when
 * there is nothing to add) the ORIGINAL emit set is returned UNCHANGED — same
 * array contents, same order. A caller can treat the result as a pure widening:
 * `result ⊇ emitSet`, with `result === emitSet` (content-wise) in the failure case.
 *
 * @param candidates The L3 survivors / emit set to widen. Returned unchanged on any error.
 * @returns A NEW array (emit set first, then de-duplicated new siblings), or the
 *          original emit set's contents on failure.
 */
export async function repopulateSiblings(
  candidates: RetrievalCandidate[],
): Promise<RetrievalCandidate[]> {
  try {
    if (candidates.length === 0) return candidates;

    const subheadingKeys = distinctSubheadingKeys(candidates);
    if (subheadingKeys.length === 0) return candidates;

    const family = await fetchFullSiblingFamily(subheadingKeys);
    if (family.length === 0) return candidates;

    // Emit set kept verbatim & first; only genuinely-new codes are appended.
    const seen = new Set<string>(candidates.map((c) => c.code));
    const additions: RetrievalCandidate[] = [];
    for (const sib of family) {
      if (seen.has(sib.code)) continue; // emit-set entry (real score) wins
      seen.add(sib.code);               // also dedupes duplicate family rows
      additions.push(sib);
    }
    if (additions.length === 0) return candidates;

    return [...candidates, ...additions];
  } catch {
    // FAIL-SAFE: never throw; on any unexpected error keep the emit set as-is.
    return candidates;
  }
}

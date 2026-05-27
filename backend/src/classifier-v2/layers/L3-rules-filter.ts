/**
 * Layer 3 — Rules Filter + Multi-Destination Collapse + Backtrack Gate (Phase 4 v2)
 *
 * Pure deterministic. NO LLM.
 *
 * Responsibilities (per ARCHITECTURE.md §2 Layer 3 + §4.4 + sub-spec 02 §B.2):
 *   1. EXCLUSION FILTER — for each L2 candidate, drop it if any
 *      `chapter_exclusions` row (a) targets the candidate's chapter AND
 *      (b) matched the query via GIN-FTS on `excluded_product_text`.
 *      Pre-filter rows come from L2 (`exclusion_pre_filter[]`); if empty we
 *      fall back to a direct secondary query as a safety net.
 *   2. MULTI-DESTINATION COLLAPSE — if more than 5 survivors remain, sort by
 *      rerank_score desc (cosine_score fallback when rerank is null) and keep
 *      the top-5; log the rest in `dropped_log[]`.
 *   3. BACKTRACK GATE — if fewer than 2 candidates survive AND the pipeline
 *      has NOT yet attempted backtrack, set `backtrack_signal = true` and
 *      build a `ConstraintHint` per sub-spec 02 §B.2 so Triage can re-enter
 *      with explicit exclude/prefer chapter lists. Single-shot enforcement is
 *      the orchestrator's responsibility (we just honour the input flag).
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 3 box), §3 (I/O row), §4.4
 *   - backend/docs/sub-specs/02-qgs-and-backtrack.md §B
 */
import { ftsSearchExclusions, type ExclusionFtsHit } from '../lib/supabase-client';
import { buildTsQuery } from './L2-retrieval';
import type {
  ChapterCode,
  ConstraintHint,
  DroppedCandidate,
  ExclusionMatch,
  ExclusionPreFilterHit,
  L3TraceEntry,
  RetrievalCandidate,
  RulesFilterInput,
  RulesFilterOutput,
} from '../types';

/* ---------------------------------------------------------------------------
 * Tunables
 * --------------------------------------------------------------------------- */

const FINAL_TOP_K        = 5;
const MIN_SURVIVORS      = 2;
const SECONDARY_FTS_LIMIT = 50;

/* ---------------------------------------------------------------------------
 * Small utilities
 * --------------------------------------------------------------------------- */

function now(): number { return Date.now(); }

/**
 * Sort key for collapse: prefer higher rerank_score; if null on both sides,
 * fall back to cosine_score. We never compare a null against a numeric
 * rerank — anything with a rerank score wins over anything without one
 * (matches the L2 contract where rerank is the strongest signal when present).
 */
function compareForCollapse(
  a: RetrievalCandidate,
  b: RetrievalCandidate,
): number {
  const aR = a.rerank_score;
  const bR = b.rerank_score;
  if (aR !== null && bR !== null) return bR - aR;
  if (aR !== null && bR === null) return -1;                   // a wins
  if (aR === null && bR !== null) return 1;                    // b wins
  return b.cosine_score - a.cosine_score;                       // both null → cosine
}

/** Format the exclusion text into the constraint-hint reason string (≤80ch). */
function truncateForReason(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/* ---------------------------------------------------------------------------
 * Main entry point
 * --------------------------------------------------------------------------- */

/**
 * Apply chapter_exclusions filter, multi-destination collapse, and the
 * single-shot backtrack gate to the L2 retrieval output.
 *
 * @param input  L2 retrieval output plus the pipeline state slice needed for
 *               the backtrack gate (`backtrack_attempted`).
 * @returns      Filtered candidates (≤5), matched-exclusion audit trail,
 *               dropped-candidate log, the single-shot backtrack signal, and
 *               an associated `ConstraintHint` (or null), plus a per-step
 *               trace.
 */
export async function rulesFilter(input: RulesFilterInput): Promise<RulesFilterOutput> {
  const trace: L3TraceEntry[] = [];

  const candidates = input.l2_output.candidates;

  /* ------------------------------------------------------------------------
   * Step 1: Acquire the exclusion set (use L2 pre-filter; secondary fallback).
   * ------------------------------------------------------------------------ */
  let exclusions: ExclusionPreFilterHit[] = input.l2_output.exclusion_pre_filter;
  if (exclusions.length === 0 && candidates.length > 0) {
    // Safety net — L2 should normally provide the pre-filter, but if it's
    // empty (e.g., L2 ran with an empty tsquery) we re-issue the query here
    // scoped to the surviving candidate chapters.
    const candidateChapters = Array.from(
      new Set(
        candidates
          .map((c) => c.parent_chain.chapter)
          .filter((ch): ch is ChapterCode => typeof ch === 'string'),
      ),
    );
    const tsquery = buildTsQuery(input.head_nouns_for_fts, input.raw_tokens);
    if (candidateChapters.length > 0 && tsquery.length > 0) {
      const tFb = now();
      const hits: ExclusionFtsHit[] = await ftsSearchExclusions(
        tsquery,
        candidateChapters,
        SECONDARY_FTS_LIMIT,
      );
      exclusions = hits.map((h) => ({
        exclusion_id:          h.id,
        source_chapter:        h.source_chapter as ChapterCode,
        excluded_product_text: h.excluded_product_text,
        redirects_to_chapter:  h.redirects_to_chapter,
      }));
      trace.push({
        step:      'secondary_exclusion_fetch',
        latencyMs: now() - tFb,
        count:     exclusions.length,
      });
    } else {
      trace.push({ step: 'secondary_exclusion_skipped', latencyMs: 0, count: 0 });
    }
  }

  /* ------------------------------------------------------------------------
   * Step 2: Exclusion filter per candidate.
   *
   * For each candidate, find the FIRST exclusion whose source_chapter ==
   * candidate.parent_chain.chapter. That's a fire. Candidate is dropped on
   * first hit (we don't keep evaluating once a candidate is already out).
   * Multiple candidates may share an exclusion → record all affected codes.
   * ------------------------------------------------------------------------ */
  const tFilter = now();
  // Group exclusions by source_chapter for O(1) lookup.
  const exclusionsByChapter = new Map<ChapterCode, ExclusionPreFilterHit[]>();
  for (const e of exclusions) {
    const bucket = exclusionsByChapter.get(e.source_chapter) ?? [];
    bucket.push(e);
    exclusionsByChapter.set(e.source_chapter, bucket);
  }

  const survivors: RetrievalCandidate[] = [];
  const exclusionMatchById = new Map<number, ExclusionMatch>();
  const droppedByExclusion: DroppedCandidate[] = [];

  for (const cand of candidates) {
    const chapter = cand.parent_chain.chapter;
    if (chapter === null) {
      // No chapter context — can't match an exclusion against it; let it
      // through (Layer 4/5 will catch any structural issue).
      survivors.push(cand);
      continue;
    }
    const ruleSet = exclusionsByChapter.get(chapter);
    if (!ruleSet || ruleSet.length === 0) {
      survivors.push(cand);
      continue;
    }
    // First hit wins — candidate is dropped on first fired exclusion.
    const firedRule = ruleSet[0];
    if (firedRule === undefined) {
      survivors.push(cand);
      continue;
    }
    droppedByExclusion.push({
      code:                  cand.code,
      chapter,
      reason:                'excluded',
      matched_exclusion_id:  firedRule.exclusion_id,
      rerank_score:          cand.rerank_score,
    });

    const existing = exclusionMatchById.get(firedRule.exclusion_id);
    if (existing) {
      existing.affected_codes.push(cand.code);
    } else {
      exclusionMatchById.set(firedRule.exclusion_id, {
        exclusion_id:          firedRule.exclusion_id,
        source_chapter:        firedRule.source_chapter,
        excluded_product_text: firedRule.excluded_product_text,
        redirects_to_chapter:  firedRule.redirects_to_chapter,
        affected_codes:        [cand.code],
      });
    }
  }
  trace.push({
    step:      'exclusion_filter',
    latencyMs: now() - tFilter,
    count:     survivors.length,
  });

  /* ------------------------------------------------------------------------
   * Step 3: Multi-destination collapse — top-5 by rerank score.
   * ------------------------------------------------------------------------ */
  const tCollapse = now();
  const droppedByCollapse: DroppedCandidate[] = [];
  let collapsed: RetrievalCandidate[];
  if (survivors.length > FINAL_TOP_K) {
    const sorted = [...survivors].sort(compareForCollapse);
    collapsed = sorted.slice(0, FINAL_TOP_K);
    for (const c of sorted.slice(FINAL_TOP_K)) {
      droppedByCollapse.push({
        code:         c.code,
        chapter:      (c.parent_chain.chapter ?? '') as ChapterCode,
        reason:       'collapsed_below_top5',
        rerank_score: c.rerank_score,
      });
    }
  } else {
    collapsed = survivors;
  }
  trace.push({
    step:      'multi_dest_collapse',
    latencyMs: now() - tCollapse,
    count:     collapsed.length,
  });

  const matched_exclusions: ExclusionMatch[] = Array.from(exclusionMatchById.values());
  const dropped_log: DroppedCandidate[] = [...droppedByExclusion, ...droppedByCollapse];

  /* ------------------------------------------------------------------------
   * Step 4: Backtrack gate — single-shot.
   *
   * Trigger condition: <2 surviving candidates. If backtrack has already been
   * attempted (single-shot enforcement per sub-spec 02 §B.5), do NOT re-fire
   * — the orchestrator will escalate to L7 Deep-Think instead.
   * ------------------------------------------------------------------------ */
  const tGate = now();
  let backtrack_signal = false;
  let constraint_hint: ConstraintHint | null = null;

  if (collapsed.length < MIN_SURVIVORS && !input.backtrack_attempted) {
    backtrack_signal = true;
    constraint_hint = buildConstraintHint(matched_exclusions, droppedByExclusion);
  }
  trace.push({
    step:      'backtrack_gate',
    latencyMs: now() - tGate,
    count:     backtrack_signal ? 1 : 0,
  });

  return {
    filtered_candidates: collapsed,
    matched_exclusions,
    dropped_log,
    backtrack_signal,
    constraint_hint,
    trace,
  };
}

/* ---------------------------------------------------------------------------
 * Constraint-hint construction (sub-spec 02 §B.2)
 * --------------------------------------------------------------------------- */

/**
 * Build the ConstraintHint emitted alongside backtrack_signal=true.
 *
 * - `exclude_chapters` = distinct chapters of every candidate that was
 *   dropped by exclusion (NOT collapsed). We do not exclude chapters where
 *   a candidate merely lost the rerank bake-off — only the chapters proven
 *   structurally wrong by a legal exclusion rule.
 * - `prefer_chapters` = the flattened `redirects_to_chapter[]` of every
 *   matched exclusion, deduped. (102 of 1,505 exclusions are multi-dest,
 *   so an exclusion can contribute 2-3+ destinations.)
 * - `source_exclusion_id` = the exclusion that dropped the most candidates,
 *   with lowest id as tiebreak (deterministic).
 *
 * Spec note (sub-spec 02 §B.2 step 4): "highest-confidence exclusion (or
 * lowest id as tiebreaker)". The sub-spec doesn't define "highest-confidence"
 * for a row in chapter_exclusions (there is no confidence column). We
 * interpret it as "the exclusion with the largest impact on the alive set"
 * (i.e., the one that dropped the most candidates); ties broken by lowest id.
 * If no exclusions fired but backtrack still triggered (e.g., 0 candidates
 * from L2), we return a no-op-ish hint with `source_exclusion_id = 0`.
 */
function buildConstraintHint(
  matched_exclusions: ExclusionMatch[],
  dropped: DroppedCandidate[],
): ConstraintHint {
  // exclude_chapters from dropped (by exclusion only) candidates' chapters.
  const excludeChapters = Array.from(
    new Set(dropped.map((d) => d.chapter).filter((c) => c.length > 0)),
  ).sort();

  // prefer_chapters: flatten redirects, dedup, sort for stability.
  const preferSet = new Set<ChapterCode>();
  for (const m of matched_exclusions) {
    for (const ch of m.redirects_to_chapter) {
      preferSet.add(ch);
    }
  }
  // Remove any chapter that's also in exclude_chapters (no contradiction).
  for (const ec of excludeChapters) preferSet.delete(ec);
  const preferChapters = Array.from(preferSet).sort();

  // Pick the highest-impact exclusion (most affected_codes); tiebreak by
  // lowest id.
  let chosen: ExclusionMatch | null = null;
  for (const m of matched_exclusions) {
    if (chosen === null) { chosen = m; continue; }
    if (m.affected_codes.length > chosen.affected_codes.length) {
      chosen = m;
    } else if (
      m.affected_codes.length === chosen.affected_codes.length &&
      m.exclusion_id < chosen.exclusion_id
    ) {
      chosen = m;
    }
  }

  if (chosen === null) {
    // No exclusions actually fired (backtrack triggered by retrieval famine,
    // not by rule filtering). Emit a minimal hint so Triage still sees the
    // signal; orchestrator may opt to skip backtrack in this case.
    return {
      exclude_chapters:    excludeChapters,
      prefer_chapters:     preferChapters,
      reason:              'No surviving candidate after L2 retrieval + L3 exclusion filter.',
      source_exclusion_id: 0,
    };
  }

  const reason =
    `Ch.${chosen.source_chapter} excluded per rule ${chosen.exclusion_id} ` +
    `(${truncateForReason(chosen.excluded_product_text)})` +
    (preferChapters.length > 0
      ? `; try ${preferChapters.join(', ')}.`
      : '.');

  return {
    exclude_chapters:    excludeChapters,
    prefer_chapters:     preferChapters,
    reason,
    source_exclusion_id: chosen.exclusion_id,
  };
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  buildConstraintHint,
  compareForCollapse,
  truncateForReason,
  FINAL_TOP_K,
  MIN_SURVIVORS,
};

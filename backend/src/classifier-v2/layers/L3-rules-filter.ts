/**
 * Layer 3 — Rules Surfacer + Multi-Destination Collapse + Backtrack Gate (Phase 4 v2)
 *
 * Pure deterministic. NO LLM.
 *
 * Responsibilities (per ARCHITECTURE.md §2 Layer 3 + §4.4 + sub-spec 02 §B.2):
 *   1. EXCLUSION SURFACING — for each L2 candidate, find any
 *      `chapter_exclusions` row that (a) targets the candidate's chapter AND
 *      (b) matched the query via GIN-FTS on `excluded_product_text`. We RECORD
 *      these in `matched_exclusions[]` (with the candidate codes they touch) so
 *      Layer 4 can ADJUDICATE whether the exclusion actually applies to this
 *      product. We do NOT delete candidates here.
 *
 *      WHY (over-exclusion fix, 2026-05): the upstream GIN-FTS query OR-joins
 *      every query token, so an exclusion fires on a single shared lexeme with
 *      no check that the product is actually within the exclusion's scope (e.g.
 *      "PVC pipe" trips a "smoking pipes" exclusion → would wrongly delete all
 *      of Ch.39). Deleting on a keyword collision destroyed the correct chapter
 *      and forced spurious REFUSEs. L3 is a SURFACER, not a JUDGE; L4 (which
 *      receives matched_exclusions via the orchestrator) adjudicates with the
 *      full product context.
 *      Pre-filter rows come from L2 (`exclusion_pre_filter[]`); if empty we
 *      fall back to a direct secondary query as a safety net.
 *   2. MULTI-DESTINATION COLLAPSE — if more than CANDIDATE_CAP (8) candidates
 *      remain, sort by rerank_score desc (cosine_score fallback when rerank is
 *      null) and keep the top-CANDIDATE_CAP; log the rest in `dropped_log[]`
 *      (reason 'collapsed_below_cap'). Capacity-trimming is the only legitimate
 *      L3 drop. (FIX-A 2026-05-28: cap raised 5→8 to recover rank #6–#8 codes.)
 *   3. BACKTRACK GATE — if fewer than 2 candidates survive AND the pipeline
 *      has NOT yet attempted backtrack, set `backtrack_signal = true` and
 *      build a `ConstraintHint` per sub-spec 02 §B.2 so Triage can re-enter.
 *      Since exclusions no longer delete candidates, this now fires ONLY on a
 *      genuine retrieval famine (L2 returned <2 real candidates) — a real
 *      safety net, not a side effect of keyword collisions. Single-shot
 *      enforcement is the orchestrator's responsibility (we honour the input
 *      flag).
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

// FIX-A (2026-05-28, recall): decouple the L3 collapse cap from the old top-5
// funnel. Correct codes were landing at retrieval rank #6–#8 and getting dropped
// by a DOUBLE top-5 funnel (Cohere rerank topN=5 AND this collapse=5). L2 now
// emits up to 8; L3 keeps up to 8 so those candidates reach L4 (whose prompt
// handles a few more candidates fine). Capacity-trim is still the ONLY L3 drop.
const CANDIDATE_CAP      = 8;   // was 5 (FINAL_TOP_K)
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
   * Step 2: Exclusion SURFACING per candidate (over-exclusion fix).
   *
   * For each candidate, find the FIRST exclusion whose source_chapter ==
   * candidate.parent_chain.chapter. That is a keyword MATCH (not a verdict):
   * we RECORD it in `matched_exclusions[]` so Layer 4 can adjudicate whether
   * the exclusion truly applies to the product. We do NOT drop the candidate.
   * Multiple candidates may share an exclusion → record all affected codes.
   *
   * Every candidate becomes a survivor here; the only candidates removed later
   * are by the CANDIDATE_CAP (8) capacity collapse (Step 3), never by exclusion.
   * ------------------------------------------------------------------------ */
  const tSurface = now();
  // Group exclusions by source_chapter for O(1) lookup.
  const exclusionsByChapter = new Map<ChapterCode, ExclusionPreFilterHit[]>();
  for (const e of exclusions) {
    const bucket = exclusionsByChapter.get(e.source_chapter) ?? [];
    bucket.push(e);
    exclusionsByChapter.set(e.source_chapter, bucket);
  }

  // All candidates survive exclusion surfacing — exclusions are surfaced for
  // L4 adjudication, not used to delete here.
  const survivors: RetrievalCandidate[] = [...candidates];
  const exclusionMatchById = new Map<number, ExclusionMatch>();

  for (const cand of candidates) {
    const chapter = cand.parent_chain.chapter;
    if (chapter === null) {
      // No chapter context — nothing to surface against it.
      continue;
    }
    const ruleSet = exclusionsByChapter.get(chapter);
    if (!ruleSet || ruleSet.length === 0) {
      continue;
    }
    // First matching exclusion wins for surfacing (one row per chapter is
    // enough for L4 to reason about; the affected codes still aggregate).
    const firedRule = ruleSet[0];
    if (firedRule === undefined) {
      continue;
    }

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
    step:      'exclusion_surface',
    latencyMs: now() - tSurface,
    count:     exclusionMatchById.size,
  });

  /* ------------------------------------------------------------------------
   * Step 3: Multi-destination collapse — top-CANDIDATE_CAP (8) by rerank score.
   * ------------------------------------------------------------------------ */
  const tCollapse = now();
  const droppedByCollapse: DroppedCandidate[] = [];
  let collapsed: RetrievalCandidate[];
  if (survivors.length > CANDIDATE_CAP) {
    const sorted = [...survivors].sort(compareForCollapse);
    collapsed = sorted.slice(0, CANDIDATE_CAP);
    for (const c of sorted.slice(CANDIDATE_CAP)) {
      droppedByCollapse.push({
        code:         c.code,
        chapter:      (c.parent_chain.chapter ?? '') as ChapterCode,
        reason:       'collapsed_below_cap',
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
  // Exclusions never drop candidates anymore, so the only drops are capacity
  // (CANDIDATE_CAP) trims.
  const dropped_log: DroppedCandidate[] = [...droppedByCollapse];

  /* ------------------------------------------------------------------------
   * Step 4: Backtrack gate — single-shot.
   *
   * Trigger condition: <2 surviving candidates. Because exclusions no longer
   * delete candidates, this now fires ONLY on a genuine retrieval famine
   * (L2 returned <2 real candidates) — not because a keyword collision removed
   * the correct chapter. If backtrack has already been attempted (single-shot
   * enforcement per sub-spec 02 §B.5), do NOT re-fire — the orchestrator will
   * escalate to L7 Deep-Think instead.
   * ------------------------------------------------------------------------ */
  const tGate = now();
  let backtrack_signal = false;
  let constraint_hint: ConstraintHint | null = null;

  if (collapsed.length < MIN_SURVIVORS && !input.backtrack_attempted) {
    backtrack_signal = true;
    constraint_hint = buildConstraintHint(matched_exclusions);
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
 * Backtrack now fires ONLY on a genuine retrieval famine (<2 real candidates
 * from L2), never because an exclusion deleted a candidate (it no longer does).
 * So there are no "structurally proven wrong" chapters to exclude here — L3
 * does not judge exclusions anymore. We therefore emit an EMPTY
 * `exclude_chapters`: the correct chapter must never be forbidden from
 * re-triage just because a keyword collided with an exclusion.
 *
 * - `exclude_chapters` = [] (L3 no longer proves any chapter wrong).
 * - `prefer_chapters` = the flattened `redirects_to_chapter[]` of every
 *   surfaced exclusion, deduped. These are still useful soft hints for the
 *   re-triage even though we don't forbid anything. (102 of 1,505 exclusions
 *   are multi-dest, so an exclusion can contribute 2-3+ destinations.)
 * - `source_exclusion_id` = the surfaced exclusion touching the most
 *   candidates, with lowest id as tiebreak (deterministic). 0 when none.
 */
function buildConstraintHint(
  matched_exclusions: ExclusionMatch[],
): ConstraintHint {
  // L3 no longer proves any chapter structurally wrong → never forbid a chapter.
  const excludeChapters: ChapterCode[] = [];

  // prefer_chapters: flatten redirects, dedup, sort for stability.
  const preferSet = new Set<ChapterCode>();
  for (const m of matched_exclusions) {
    for (const ch of m.redirects_to_chapter) {
      preferSet.add(ch);
    }
  }
  const preferChapters = Array.from(preferSet).sort();

  // Pick the highest-impact surfaced exclusion (most affected_codes); tiebreak
  // by lowest id.
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
    // No exclusions surfaced — backtrack triggered purely by retrieval famine.
    return {
      exclude_chapters:    excludeChapters,
      prefer_chapters:     preferChapters,
      reason:              'Fewer than 2 candidates returned by L2 retrieval.',
      source_exclusion_id: 0,
    };
  }

  const reason =
    `Possible exclusion on Ch.${chosen.source_chapter} per rule ${chosen.exclusion_id} ` +
    `(${truncateForReason(chosen.excluded_product_text)})` +
    (preferChapters.length > 0
      ? `; consider ${preferChapters.join(', ')}.`
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
  CANDIDATE_CAP,
  MIN_SURVIVORS,
};

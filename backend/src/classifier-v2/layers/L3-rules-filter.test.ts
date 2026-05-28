/**
 * Unit tests for Layer 3 Rules Surfacer + Multi-Destination Collapse + Backtrack Gate.
 *
 * Framework: vitest. Mocks `../lib/supabase-client` so no real DB calls
 * happen. The secondary direct-query fallback path is exercised via the
 * `ftsSearchExclusions` mock.
 *
 * CONTRACT (over-exclusion fix, 2026-05): L3 SURFACES exclusions for L4 to
 * adjudicate; it NEVER deletes a candidate because an exclusion keyword-matched
 * its chapter. The only legitimate L3 drop is the top-5 capacity collapse.
 * Backtrack fires ONLY on genuine retrieval famine (<2 real candidates from L2),
 * never as a side effect of an exclusion keyword collision.
 *
 * Validates:
 *   1. Happy path: 5 candidates, 0 exclusions → all 5 survive
 *   2. Single exclusion SURFACES but does NOT drop the candidate
 *   3. Exclusion touching 3 candidates → all 3 survive, affected_codes records all 3
 *   4. REGRESSION (PVC-pipe / smoking-pipes): keyword collision surfaces the
 *      exclusion but the candidate SURVIVES and backtrack stays false
 *   5. Genuine famine (<2 real candidates from L2) → backtrack triggered (single-shot)
 *   6. Famine + backtrack already attempted → no double-back
 *   7. Multi-destination exclusion flattens redirects into prefer_chapters
 *   8. Multiple exclusions on same candidate → first surfaced wins, candidate survives
 *   9. Multi-dest collapse: 7 → top-5 by rerank
 *  10. Collapse with null rerank scores → cosine fallback
 *  11. Empty exclusion_pre_filter → secondary direct query path (surfaces, no drop)
 *  12. No exclusions at all (secondary returns 0) → all survive
 *  13. source_chapter mismatch → exclusion does not surface
 *  14. Exactly 2 survivors does NOT trigger backtrack
 *  15. Trace entries populated (exclusion_surface step)
 *  16. constraint_hint impact-tiebreak picks highest-impact surfaced exclusion
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/layers/L3-rules-filter.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExclusionFtsHit } from '../lib/supabase-client';
import type {
  ChapterCode,
  ExclusionPreFilterHit,
  RetrievalCandidate,
  RetrievalOutput,
  RulesFilterInput,
} from '../types';

/* ---------------------------------------------------------------------------
 * Mocks (registered BEFORE importing the SUT)
 * --------------------------------------------------------------------------- */

const ftsExclMock = vi.fn();

vi.mock('../lib/supabase-client', () => ({
  ftsSearchExclusions: (...args: unknown[]) => ftsExclMock(...args),
  _setQueryRunnerForTesting: () => undefined,
}));

// Import SUT after mocks are in place.
import { rulesFilter, _internal } from './L3-rules-filter';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function candidate(
  code: string,
  chapter: ChapterCode,
  opts: {
    rerank_score?: number | null;
    cosine_score?: number;
    fts_rank?:     number | null;
  } = {},
): RetrievalCandidate {
  return {
    code,
    level:         'tariff_line',
    cosine_score:  opts.cosine_score ?? 0.8,
    fts_rank:      'fts_rank' in opts ? (opts.fts_rank ?? null) : null,
    // Treat explicit `null` as a deliberate "no rerank" signal; only fall back
    // to 0.9 when the key was omitted entirely.
    rerank_score:  'rerank_score' in opts ? (opts.rerank_score ?? null) : 0.9,
    parent_chain: {
      chapter,
      heading:     code.slice(0, 4),
      subheading:  code.slice(0, 7),
      tariff_line: code,
    },
  };
}

function exclusion(
  id: number,
  source_chapter: ChapterCode,
  text: string,
  redirects: ChapterCode[] = [],
): ExclusionPreFilterHit {
  return {
    exclusion_id:           id,
    source_chapter,
    excluded_product_text:  text,
    redirects_to_chapter:   redirects,
  };
}

function l2(
  candidates: RetrievalCandidate[],
  exclusion_pre_filter: ExclusionPreFilterHit[] = [],
): RetrievalOutput {
  return {
    candidates,
    retrieval_scores: Object.fromEntries(
      candidates.map((c) => [c.code, {
        cosine_score: c.cosine_score,
        fts_rank:     c.fts_rank,
        rerank_score: c.rerank_score,
      }]),
    ),
    fts_matches: [],
    exclusion_pre_filter,
    retrieval_strategy: 'cascade_full',
    trace: [],
  };
}

function input(
  candidates: RetrievalCandidate[],
  exclusionPreFilter: ExclusionPreFilterHit[] = [],
  overrides: Partial<RulesFilterInput> = {},
): RulesFilterInput {
  return {
    l2_output:           l2(candidates, exclusionPreFilter),
    normalized_query:    'cotton t-shirt knitted ladies',
    raw_tokens:          ['cotton', 't-shirt', 'knitted', 'ladies'],
    head_nouns_for_fts:  ['t-shirt', 'cotton'],
    candidate_chapters:  ['61'],
    backtrack_attempted: false,
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * Reset state between tests
 * --------------------------------------------------------------------------- */

beforeEach(() => {
  ftsExclMock.mockReset();
  ftsExclMock.mockResolvedValue([]);                            // default: empty
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ===========================================================================
 * 1. Happy path: 5 candidates, 0 exclusions
 * =========================================================================== */

describe('rulesFilter — happy path (no exclusions, ≤5 candidates)', () => {
  it('passes through all 5 candidates with no backtrack', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.90.10', '61', { rerank_score: 0.92 }),
      candidate('6110.10.00', '61', { rerank_score: 0.81 }),
      candidate('6110.20.00', '61', { rerank_score: 0.75 }),
      candidate('6110.30.00', '61', { rerank_score: 0.70 }),
    ];
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.filtered_candidates.map((c) => c.code)).toEqual(cands.map((c) => c.code));
    expect(out.matched_exclusions).toEqual([]);
    expect(out.dropped_log).toEqual([]);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });
});

/* ===========================================================================
 * 2. Single exclusion SURFACES but does NOT drop the candidate.
 *
 * (Previously this test asserted the candidate was DELETED — that assertion
 * encoded the over-exclusion BUG. The new contract: surface, don't delete.)
 * =========================================================================== */

describe('rulesFilter — single exclusion surfaces (does not drop)', () => {
  it('keeps all candidates and records the surfaced exclusion', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3902.10.00', '39', { rerank_score: 0.71 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3905.10.00', '39', { rerank_score: 0.60 }),
    ];
    // Exclusion keyword-matches Ch.39 — should SURFACE (not delete) the Ch.39
    // candidates; L4 adjudicates whether it actually applies.
    const excls = [exclusion(842, '39', 'artificial waxes of heading 3404', ['34'])];

    const out = await rulesFilter(input(cands, excls));
    // All 5 survive — exclusions no longer delete candidates.
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.filtered_candidates.map((c) => c.code)).toEqual(cands.map((c) => c.code));
    // The exclusion is surfaced for L4 with every Ch.39 candidate it touches.
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);
    expect(out.matched_exclusions[0].affected_codes.sort()).toEqual(
      ['3901.10.00', '3902.10.00', '3905.10.00'].sort(),
    );
    // No drops, no backtrack.
    expect(out.dropped_log).toEqual([]);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });

  it('surfaces an exclusion touching a single chapter without dropping it', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),    // surfaced, not dropped
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3402.10.00', '34', { rerank_score: 0.60 }),
      candidate('3405.10.00', '34', { rerank_score: 0.55 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.dropped_log).toEqual([]);
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].affected_codes).toEqual(['3901.10.00']);
    expect(out.backtrack_signal).toBe(false);
  });
});

/* ===========================================================================
 * 3. Exclusion touches 3 candidates → all 3 survive; affected_codes records all
 * =========================================================================== */

describe('rulesFilter — exclusion touches 3 of 5 candidates (none dropped)', () => {
  it('aggregates affected_codes while keeping every candidate', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3902.10.00', '39', { rerank_score: 0.71 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3905.10.00', '39', { rerank_score: 0.60 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.matched_exclusions[0].affected_codes.length).toBe(3);
    expect(out.dropped_log).toEqual([]);
  });
});

/* ===========================================================================
 * 4. REGRESSION — the real over-exclusion bug.
 *
 * "PVC pipe" trips an exclusion about "smoking pipes" via the single shared
 * lexeme "pipe". Pre-fix, this DELETED all of Ch.39 and forced a REFUSE.
 * Post-fix: the candidate SURVIVES, the exclusion is surfaced for L4, and
 * backtrack stays false (candidates survived).
 * =========================================================================== */

describe('rulesFilter — REGRESSION: keyword collision surfaces but does not delete', () => {
  it('PVC pipe trips a "smoking pipes" exclusion → candidate survives, exclusion surfaced, no backtrack', async () => {
    const cands = [
      candidate('3917.23.00', '39', { rerank_score: 0.94 }),    // PVC pipe — CORRECT, must survive
      candidate('3917.29.00', '39', { rerank_score: 0.71 }),
    ];
    // Ch.39 exclusion text is about smoking pipes (Ch.96), sharing only the
    // lexeme "pipe" with the query — NOT actually about plastic tubing.
    const excls = [
      exclusion(1830, '39', 'articles of heading 9614 (smoking pipes and pipe bowls)', ['96']),
    ];

    const out = await rulesFilter(input(cands, excls, {
      normalized_query:   'pvc pipe',
      raw_tokens:         ['pvc', 'pipe'],
      head_nouns_for_fts: ['pipe'],
      candidate_chapters: ['39'],
    }));

    // The correct candidate SURVIVES — not deleted on the keyword collision.
    expect(out.filtered_candidates.map((c) => c.code)).toEqual(['3917.23.00', '3917.29.00']);
    // The exclusion is still SURFACED so L4 can adjudicate (and reject) it.
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(1830);
    expect(out.matched_exclusions[0].affected_codes.sort()).toEqual(
      ['3917.23.00', '3917.29.00'].sort(),
    );
    // Candidates survived → NO backtrack, NO constraint_hint, NO drops.
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
    expect(out.dropped_log).toEqual([]);
  });
});

/* ===========================================================================
 * 5 & 6. Backtrack gate — genuine retrieval famine only.
 *
 * (Previously these tests forced backtrack by "all candidates excluded". That
 * mechanism is gone — exclusions don't delete. Backtrack now requires a real
 * famine: L2 returned <2 candidates.)
 * =========================================================================== */

describe('rulesFilter — backtrack gate (genuine famine, single-shot)', () => {
  it('triggers backtrack_signal=true when L2 returned <2 candidates (first attempt)', async () => {
    // Only ONE real candidate came back from retrieval → genuine famine.
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    // An exclusion may still surface; it does NOT delete the candidate. The
    // famine (1 < MIN_SURVIVORS) is what triggers backtrack.
    const excls = [exclusion(842, '39', 'artificial waxes of heading 3404', ['29', '34'])];
    const out = await rulesFilter(input(cands, excls));

    // The single candidate still survives — exclusions don't delete it.
    expect(out.filtered_candidates.length).toBe(1);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint).not.toBeNull();
    // L3 no longer proves any chapter wrong → exclude_chapters is empty so the
    // correct chapter is never forbidden from re-triage.
    expect(out.constraint_hint?.exclude_chapters).toEqual([]);
    // Surfaced redirects still flow through as soft prefer hints.
    expect(out.constraint_hint?.prefer_chapters.sort()).toEqual(['29', '34']);
    expect(out.constraint_hint?.source_exclusion_id).toBe(842);
  });

  it('triggers backtrack on famine with no exclusions surfaced', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.length).toBe(1);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint?.exclude_chapters).toEqual([]);
    expect(out.constraint_hint?.prefer_chapters).toEqual([]);
    expect(out.constraint_hint?.source_exclusion_id).toBe(0);
  });

  it('triggers backtrack when L2 returned ZERO candidates', async () => {
    const out = await rulesFilter(input([], []));
    expect(out.filtered_candidates.length).toBe(0);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint).not.toBeNull();
  });

  it('does NOT re-trigger backtrack when backtrack_attempted=true', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls, { backtrack_attempted: true }));
    expect(out.filtered_candidates.length).toBe(1);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });

  it('does NOT trigger backtrack when exactly 2 candidates survive', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
    ];
    // Exclusion surfaces on Ch.39 but does not delete → 2 survivors → no backtrack.
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });
});

/* ===========================================================================
 * 7. Multi-destination exclusion redirects → prefer_chapters
 * =========================================================================== */

describe('rulesFilter — multi-destination exclusion redirects', () => {
  it('flattens redirects_to_chapter[] into prefer_chapters (deduped, sorted)', async () => {
    // Single candidate (famine) so backtrack fires and the hint is built.
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['29', '34', '40'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.constraint_hint?.prefer_chapters.sort()).toEqual(['29', '34', '40']);
    // exclude_chapters is always empty now (L3 never proves a chapter wrong).
    expect(out.constraint_hint?.exclude_chapters).toEqual([]);
  });
});

/* ===========================================================================
 * 8. Multiple exclusions on same candidate → first surfaced wins, survives
 * =========================================================================== */

describe('rulesFilter — multiple exclusions on same candidate', () => {
  it('candidate surfaces the first matching exclusion only and still survives', async () => {
    // Famine (1 candidate) so we can inspect the hint, but the point is the
    // candidate is NOT deleted and only the first exclusion is recorded.
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    const excls = [
      exclusion(842, '39', 'artificial waxes', ['34']),
      exclusion(901, '39', 'plastics in primary forms', ['39', '40']),
    ];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(1);             // survives
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);   // first in input order
    expect(out.dropped_log).toEqual([]);                        // no exclusion drops
  });
});

/* ===========================================================================
 * 9 & 10. Multi-destination collapse (top-5 capacity trim — the only real drop)
 * =========================================================================== */

describe('rulesFilter — multi-destination collapse (top-5)', () => {
  it('collapses 7 candidates → top 5 by rerank_score; logs the 2 dropped', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
      candidate('6109.30.00', '61', { rerank_score: 0.85 }),
      candidate('6109.40.00', '61', { rerank_score: 0.78 }),
      candidate('6109.50.00', '61', { rerank_score: 0.70 }),
      candidate('6109.60.00', '61', { rerank_score: 0.61 }),    // dropped
      candidate('6109.70.00', '61', { rerank_score: 0.55 }),    // dropped
    ];
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.filtered_candidates.map((c) => c.code)).toEqual([
      '6109.10.00', '6109.20.00', '6109.30.00', '6109.40.00', '6109.50.00',
    ]);
    expect(out.dropped_log.length).toBe(2);
    expect(out.dropped_log.every((d) => d.reason === 'collapsed_below_top5')).toBe(true);
    const droppedCodes = out.dropped_log.map((d) => d.code).sort();
    expect(droppedCodes).toEqual(['6109.60.00', '6109.70.00']);
  });

  it('falls back to cosine_score when rerank_score is null on all candidates', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: null, cosine_score: 0.50 }),
      candidate('6109.20.00', '61', { rerank_score: null, cosine_score: 0.90 }),
      candidate('6109.30.00', '61', { rerank_score: null, cosine_score: 0.80 }),
      candidate('6109.40.00', '61', { rerank_score: null, cosine_score: 0.70 }),
      candidate('6109.50.00', '61', { rerank_score: null, cosine_score: 0.60 }),
      candidate('6109.60.00', '61', { rerank_score: null, cosine_score: 0.40 }),
    ];
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.length).toBe(5);
    expect(out.filtered_candidates[0].code).toBe('6109.20.00'); // highest cosine
    expect(out.filtered_candidates.map((c) => c.code)).toEqual([
      '6109.20.00', '6109.30.00', '6109.40.00', '6109.50.00', '6109.10.00',
    ]);
    expect(out.dropped_log[0].code).toBe('6109.60.00');
  });

  it('prefers candidates with rerank_score over null even when cosine is higher', async () => {
    const cands = [
      candidate('A', '61', { rerank_score: null, cosine_score: 0.99 }),  // dropped (no rerank)
      candidate('B', '61', { rerank_score: 0.50, cosine_score: 0.10 }),
      candidate('C', '61', { rerank_score: 0.60, cosine_score: 0.10 }),
      candidate('D', '61', { rerank_score: 0.70, cosine_score: 0.10 }),
      candidate('E', '61', { rerank_score: 0.80, cosine_score: 0.10 }),
      candidate('F', '61', { rerank_score: 0.90, cosine_score: 0.10 }),
    ];
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.map((c) => c.code)).toEqual(['F', 'E', 'D', 'C', 'B']);
    expect(out.dropped_log[0].code).toBe('A');
  });
});

/* ===========================================================================
 * 11 & 12. Secondary direct-query fallback path
 * =========================================================================== */

describe('rulesFilter — secondary exclusion FTS fallback', () => {
  it('falls back to direct ftsSearchExclusions call when exclusion_pre_filter is empty (surfaces, no drop)', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
    ];
    const dbHit: ExclusionFtsHit = {
      id:                    842,
      source_chapter:        '39',
      excluded_product_text: 'artificial waxes',
      redirects_to_chapter:  ['34'],
    };
    ftsExclMock.mockResolvedValueOnce([dbHit]);

    const out = await rulesFilter(input(cands, []));            // empty pre-filter
    expect(ftsExclMock).toHaveBeenCalledOnce();
    // Verify it was scoped to the candidate chapters set.
    expect(ftsExclMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['39']),
      expect.any(Number),
    );
    // Candidate is SURFACED, not deleted.
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);
    expect(out.matched_exclusions[0].affected_codes).toEqual(['3901.10.00']);
    expect(out.dropped_log).toEqual([]);
    expect(out.trace.some((t) => t.step === 'secondary_exclusion_fetch')).toBe(true);
  });

  it('all candidates survive when secondary fallback returns 0 exclusions', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
    ];
    ftsExclMock.mockResolvedValueOnce([]);
    const out = await rulesFilter(input(cands, []));
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.matched_exclusions).toEqual([]);
    expect(out.dropped_log).toEqual([]);
    expect(out.backtrack_signal).toBe(false);
  });
});

/* ===========================================================================
 * 13. source_chapter mismatch
 * =========================================================================== */

describe('rulesFilter — source_chapter mismatch (exclusion does not surface)', () => {
  it('exclusion with non-matching source_chapter is ignored', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
    ];
    // Exclusion targets Ch.62, not Ch.61 — should not surface against Ch.61.
    const excls = [exclusion(700, '62', 'woven garments', ['61'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.matched_exclusions).toEqual([]);
    expect(out.dropped_log).toEqual([]);
    expect(out.backtrack_signal).toBe(false);
  });
});

/* ===========================================================================
 * 15. Trace entries populated
 * =========================================================================== */

describe('rulesFilter — trace instrumentation', () => {
  it('emits exclusion_surface, multi_dest_collapse, backtrack_gate steps', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
    ];
    const out = await rulesFilter(input(cands, []));
    const steps = out.trace.map((t) => t.step);
    expect(steps).toContain('exclusion_surface');
    expect(steps).toContain('multi_dest_collapse');
    expect(steps).toContain('backtrack_gate');
    for (const t of out.trace) {
      expect(t.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ===========================================================================
 * 16. Highest-impact surfaced exclusion picks source_exclusion_id
 *
 * Backtrack only fires on famine, so we drive these via a single-candidate
 * famine while surfacing multiple exclusions on the (one) candidate's chapter
 * plus a phantom chapter exclusion. To exercise the impact tiebreak we surface
 * exclusions whose affected_codes differ, which requires candidates in
 * different chapters — but only when famine. We therefore test the helper
 * directly via _internal.buildConstraintHint for the multi-exclusion cases.
 * =========================================================================== */

describe('rulesFilter — buildConstraintHint source_exclusion_id selection', () => {
  it('picks the surfaced exclusion that touched the most candidates', () => {
    const hint = _internal.buildConstraintHint([
      {
        exclusion_id: 842, source_chapter: '39',
        excluded_product_text: 'artificial waxes', redirects_to_chapter: ['34'],
        affected_codes: ['3901.10.00', '3902.10.00', '3903.10.00'],
      },
      {
        exclusion_id: 300, source_chapter: '50',
        excluded_product_text: 'silk worm cocoons', redirects_to_chapter: ['51'],
        affected_codes: ['5010.00.00'],
      },
    ]);
    expect(hint.source_exclusion_id).toBe(842);
    // exclude_chapters is always empty (L3 no longer proves any chapter wrong).
    expect(hint.exclude_chapters).toEqual([]);
    expect(hint.prefer_chapters.sort()).toEqual(['34', '51']);
  });

  it('breaks ties on impact by lowest exclusion id', () => {
    const hint = _internal.buildConstraintHint([
      {
        exclusion_id: 842, source_chapter: '39',
        excluded_product_text: 'artificial waxes', redirects_to_chapter: ['34'],
        affected_codes: ['3901.10.00'],
      },
      {
        exclusion_id: 300, source_chapter: '50',
        excluded_product_text: 'silk worm cocoons', redirects_to_chapter: ['51'],
        affected_codes: ['5010.00.00'],
      },
    ]);
    // Both touch exactly 1 → tie → lowest id wins.
    expect(hint.source_exclusion_id).toBe(300);
  });

  it('returns a famine hint (id 0, empty chapters) when no exclusions surfaced', () => {
    const hint = _internal.buildConstraintHint([]);
    expect(hint.source_exclusion_id).toBe(0);
    expect(hint.exclude_chapters).toEqual([]);
    expect(hint.prefer_chapters).toEqual([]);
  });
});

/* ===========================================================================
 * 17. Internal helpers (sanity)
 * =========================================================================== */

describe('rulesFilter — internal helpers', () => {
  it('truncateForReason caps long text and appends ellipsis', () => {
    const long = 'x'.repeat(120);
    const out = _internal.truncateForReason(long, 80);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('…')).toBe(true);
  });

  it('compareForCollapse: rerank beats no-rerank', () => {
    const a = candidate('A', '61', { rerank_score: 0.50, cosine_score: 0.10 });
    const b = candidate('B', '61', { rerank_score: null, cosine_score: 0.99 });
    expect(_internal.compareForCollapse(a, b)).toBeLessThan(0); // a wins
  });

  it('compareForCollapse: both null → cosine ordering', () => {
    const a = candidate('A', '61', { rerank_score: null, cosine_score: 0.90 });
    const b = candidate('B', '61', { rerank_score: null, cosine_score: 0.10 });
    expect(_internal.compareForCollapse(a, b)).toBeLessThan(0); // a wins
  });
});

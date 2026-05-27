/**
 * Unit tests for Layer 3 Rules Filter + Multi-Destination Collapse + Backtrack Gate.
 *
 * Framework: vitest. Mocks `../lib/supabase-client` so no real DB calls
 * happen. The secondary direct-query fallback path is exercised via the
 * `ftsSearchExclusions` mock.
 *
 * Validates (per spec test list ≥14 cases):
 *   1. Happy path: 5 candidates, 0 exclusions → all 5 survive
 *   2. Single exclusion drops one candidate
 *   3. Exclusion drops multiple candidates
 *   4. All excluded → backtrack triggered (single-shot)
 *   5. All excluded + backtrack already attempted → no double-back
 *   6. Multi-destination exclusion flattens redirects into prefer_chapters
 *   7. Multiple exclusions on same candidate → first hit wins
 *   8. Multi-dest collapse: 7 → top-5 by rerank
 *   9. Collapse with null rerank scores → cosine fallback
 *  10. Empty exclusion_pre_filter → secondary direct query path
 *  11. No exclusions at all (secondary returns 0) → all survive
 *  12. source_chapter mismatch → exclusion does not fire
 *  13. <2 survivors triggers backtrack
 *  14. Exactly 2 survivors does NOT trigger backtrack
 *  15. Trace entries populated
 *  16. constraint_hint impact-tiebreak picks highest-impact exclusion
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
 * 2. Single exclusion drops one candidate
 * =========================================================================== */

describe('rulesFilter — single exclusion drops one candidate', () => {
  it('removes the matched candidate and records the audit row', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3902.10.00', '39', { rerank_score: 0.71 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3905.10.00', '39', { rerank_score: 0.60 }),
    ];
    // Exclusion fires on Ch.39 only — should drop the FIRST Ch.39 candidate
    // it encounters in candidate order.
    const excls = [exclusion(842, '39', 'artificial waxes of heading 3404', ['34'])];

    const out = await rulesFilter(input(cands, excls));
    // First Ch.39 candidate (3901.10.00) is dropped by first-hit-wins. We
    // expect (5 candidates - 1 drop) = 4 survivors. But the spec says first
    // hit drops the candidate; subsequent Ch.39 candidates ALSO get dropped
    // by the same rule (they share the same source_chapter). Verify:
    expect(out.filtered_candidates.length).toBe(2);             // only Ch.34 survives
    const survChapters = out.filtered_candidates.map((c) => c.parent_chain.chapter);
    expect(survChapters.every((c) => c === '34')).toBe(true);
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);
    expect(out.matched_exclusions[0].affected_codes.sort()).toEqual(
      ['3901.10.00', '3902.10.00', '3905.10.00'].sort(),
    );
    expect(out.backtrack_signal).toBe(false);                   // 2 survivors
  });

  it('drops exactly one candidate when only one matches the excluded chapter', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),    // dropped
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3402.10.00', '34', { rerank_score: 0.60 }),
      candidate('3405.10.00', '34', { rerank_score: 0.55 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(4);
    expect(out.dropped_log.length).toBe(1);
    expect(out.dropped_log[0].code).toBe('3901.10.00');
    expect(out.dropped_log[0].reason).toBe('excluded');
    expect(out.dropped_log[0].matched_exclusion_id).toBe(842);
  });
});

/* ===========================================================================
 * 3. Exclusion drops multiple candidates
 * =========================================================================== */

describe('rulesFilter — exclusion drops 3 of 5 candidates', () => {
  it('aggregates affected_codes correctly', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),
      candidate('3902.10.00', '39', { rerank_score: 0.71 }),
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),
      candidate('3905.10.00', '39', { rerank_score: 0.60 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.matched_exclusions[0].affected_codes.length).toBe(3);
  });
});

/* ===========================================================================
 * 4 & 5. Backtrack gate
 * =========================================================================== */

describe('rulesFilter — backtrack gate (single-shot)', () => {
  it('triggers backtrack_signal=true when all candidates excluded (first attempt)', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3902.10.00', '39', { rerank_score: 0.81 }),
      candidate('3905.10.00', '39', { rerank_score: 0.71 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes of heading 3404', ['29', '34'])];
    const out = await rulesFilter(input(cands, excls));

    expect(out.filtered_candidates.length).toBe(0);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint).not.toBeNull();
    expect(out.constraint_hint?.exclude_chapters).toEqual(['39']);
    // prefer_chapters from redirects_to_chapter[] = ['29','34']
    expect(out.constraint_hint?.prefer_chapters.sort()).toEqual(['29', '34']);
    expect(out.constraint_hint?.source_exclusion_id).toBe(842);
    expect(out.constraint_hint?.reason).toMatch(/Ch\.39 excluded per rule 842/);
    expect(out.constraint_hint?.reason).toMatch(/try 29, 34/);
  });

  it('does NOT re-trigger backtrack when backtrack_attempted=true', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls, { backtrack_attempted: true }));
    expect(out.filtered_candidates.length).toBe(0);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });

  it('triggers backtrack when survivor count = 1 (below MIN_SURVIVORS)', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),    // dropped
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),    // survives
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['29', '34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(1);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint?.exclude_chapters).toEqual(['39']);
  });

  it('does NOT trigger backtrack when exactly 2 survivors remain', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),    // dropped
      candidate('3404.90.00', '34', { rerank_score: 0.82 }),    // survives
      candidate('3403.10.00', '34', { rerank_score: 0.65 }),    // survives
    ];
    const excls = [exclusion(842, '39', 'artificial waxes', ['34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(2);
    expect(out.backtrack_signal).toBe(false);
    expect(out.constraint_hint).toBeNull();
  });
});

/* ===========================================================================
 * 6. Multi-destination exclusion
 * =========================================================================== */

describe('rulesFilter — multi-destination exclusion redirects', () => {
  it('flattens redirects_to_chapter[] into prefer_chapters (deduped, sorted)', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    // Two exclusions on Ch.39 with overlapping redirects: ['29','34'] and ['34','40'].
    // Effective prefer_chapters after dedup = ['29','34','40'].
    // (Only the FIRST exclusion fires per first-hit-wins; second won't be in matched_exclusions.)
    // To exercise multi-dest aggregation, give the FIRST exclusion all destinations.
    const excls = [exclusion(842, '39', 'artificial waxes', ['29', '34', '40'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.constraint_hint?.prefer_chapters.sort()).toEqual(['29', '34', '40']);
  });

  it('removes excluded chapter from prefer set when it accidentally appears in both', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    // Redirect list includes '39' (chapter being excluded) — must be filtered out.
    const excls = [exclusion(842, '39', 'artificial waxes', ['29', '39', '34'])];
    const out = await rulesFilter(input(cands, excls));
    expect(out.constraint_hint?.prefer_chapters).toEqual(['29', '34']);
    expect(out.constraint_hint?.exclude_chapters).toEqual(['39']);
  });
});

/* ===========================================================================
 * 7. Multiple exclusions on same candidate
 * =========================================================================== */

describe('rulesFilter — multiple exclusions on same candidate', () => {
  it('candidate dropped on first matching exclusion (only first recorded)', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
    ];
    // Two exclusions both targeting Ch.39 — first-hit-wins (lower id is first in input order).
    const excls = [
      exclusion(842, '39', 'artificial waxes', ['34']),
      exclusion(901, '39', 'plastics in primary forms', ['39', '40']),
    ];
    const out = await rulesFilter(input(cands, excls));
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);   // first in input order
    expect(out.dropped_log.length).toBe(1);
    expect(out.dropped_log[0].matched_exclusion_id).toBe(842);
  });
});

/* ===========================================================================
 * 8 & 9. Multi-destination collapse
 * =========================================================================== */

describe('rulesFilter — multi-destination collapse (top-5)', () => {
  it('collapses 7 survivors → top 5 by rerank_score; logs the 2 dropped', async () => {
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

  it('falls back to cosine_score when rerank_score is null on all survivors', async () => {
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
    // Sort all 6 cands by cosine desc, take top 5:
    //   0.90 → 6109.20.00
    //   0.80 → 6109.30.00
    //   0.70 → 6109.40.00
    //   0.60 → 6109.50.00
    //   0.50 → 6109.10.00
    // Dropped (rank 6+): 0.40 → 6109.60.00
    expect(out.filtered_candidates[0].code).toBe('6109.20.00'); // highest cosine
    expect(out.filtered_candidates.map((c) => c.code)).toEqual([
      '6109.20.00', '6109.30.00', '6109.40.00', '6109.50.00', '6109.10.00',
    ]);
    expect(out.dropped_log[0].code).toBe('6109.60.00');
  });

  it('prefers candidates with rerank_score over null even when cosine is higher', async () => {
    const cands = [
      // 6 survivors → must collapse to 5
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
 * 10 & 11. Secondary direct-query fallback path
 * =========================================================================== */

describe('rulesFilter — secondary exclusion FTS fallback', () => {
  it('falls back to direct ftsSearchExclusions call when exclusion_pre_filter is empty', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
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
      ['39'],
      expect.any(Number),
    );
    expect(out.filtered_candidates.length).toBe(0);
    expect(out.matched_exclusions.length).toBe(1);
    expect(out.matched_exclusions[0].exclusion_id).toBe(842);
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
 * 12. source_chapter mismatch
 * =========================================================================== */

describe('rulesFilter — source_chapter mismatch (exclusion does not fire)', () => {
  it('exclusion with non-matching source_chapter is ignored', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
    ];
    // Exclusion targets Ch.62, not Ch.61 — should not fire.
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
  it('emits exclusion_filter, multi_dest_collapse, backtrack_gate steps', async () => {
    const cands = [
      candidate('6109.10.00', '61', { rerank_score: 0.99 }),
      candidate('6109.20.00', '61', { rerank_score: 0.92 }),
    ];
    const out = await rulesFilter(input(cands, []));
    const steps = out.trace.map((t) => t.step);
    expect(steps).toContain('exclusion_filter');
    expect(steps).toContain('multi_dest_collapse');
    expect(steps).toContain('backtrack_gate');
    for (const t of out.trace) {
      expect(t.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ===========================================================================
 * 16. Highest-impact exclusion picks source_exclusion_id
 * =========================================================================== */

describe('rulesFilter — source_exclusion_id selection (highest impact, lowest id tiebreak)', () => {
  it('picks the exclusion that dropped the most candidates', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),
      candidate('3902.10.00', '39', { rerank_score: 0.81 }),
      candidate('3903.10.00', '39', { rerank_score: 0.71 }),
      candidate('5010.00.00', '50', { rerank_score: 0.61 }),
    ];
    // Two distinct exclusions: id=842 fires on Ch.39 (drops 3 candidates),
    // id=300 fires on Ch.50 (drops 1 candidate). Highest impact = 842.
    const excls = [
      exclusion(842, '39', 'artificial waxes', ['34']),
      exclusion(300, '50', 'silk worm cocoons', ['51']),
    ];
    const out = await rulesFilter(input(cands, excls));
    expect(out.filtered_candidates.length).toBe(0);
    expect(out.backtrack_signal).toBe(true);
    expect(out.constraint_hint?.source_exclusion_id).toBe(842);
    expect(out.constraint_hint?.exclude_chapters.sort()).toEqual(['39', '50']);
  });

  it('breaks ties on impact by lowest exclusion id', async () => {
    const cands = [
      candidate('3901.10.00', '39', { rerank_score: 0.91 }),    // dropped by id=842
      candidate('5010.00.00', '50', { rerank_score: 0.61 }),    // dropped by id=300
    ];
    const excls = [
      exclusion(842, '39', 'artificial waxes', ['34']),
      exclusion(300, '50', 'silk worm cocoons', ['51']),
    ];
    const out = await rulesFilter(input(cands, excls));
    // Both drop exactly 1 → tie → lowest id wins.
    expect(out.constraint_hint?.source_exclusion_id).toBe(300);
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

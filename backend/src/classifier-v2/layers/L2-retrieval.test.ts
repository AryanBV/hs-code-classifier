/**
 * Unit tests for Layer 2 Hybrid Retrieval.
 *
 * Framework: vitest. Mocks BOTH the Cohere client (`../lib/cohere-client`) and
 * the Supabase/pg wrapper (`../lib/supabase-client`) so no network or DB calls
 * happen. Validates:
 *   - Cohere embed/rerank call wiring
 *   - Multi-level cosine cascade ordering
 *   - direct_leaf_lookup shortcut detection
 *   - tsquery escaping for special characters
 *   - Cohere unavailable / 5xx fallback (cosine-only ordering)
 *   - Exclusion pre-filter population
 *   - Trace array completeness
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/layers/L2-retrieval.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CosineCandidate,
  FtsHit,
  ExclusionFtsHit,
  ParentChainRow,
  SubheadingChildCount,
} from '../lib/supabase-client';

/* ---------------------------------------------------------------------------
 * Mocks (registered BEFORE importing the SUT)
 * --------------------------------------------------------------------------- */

const embedMock  = vi.fn();
const rerankMock = vi.fn();

vi.mock('../lib/cohere-client', async () => {
  const actual = await vi.importActual<typeof import('../lib/cohere-client')>('../lib/cohere-client');
  return {
    ...actual,
    embed:  (...args: unknown[]) => embedMock(...args),
    rerank: (...args: unknown[]) => rerankMock(...args),
  };
});

const cosineChMock  = vi.fn();
const cosineHMock   = vi.fn();
const cosineShMock  = vi.fn();
const cosineTlMock  = vi.fn();
const ftsTlMock     = vi.fn();
const ftsExclMock   = vi.fn();
const parentChainMock = vi.fn();
const childCountsMock = vi.fn();
const tlForShMock   = vi.fn();

vi.mock('../lib/supabase-client', () => ({
  cosineSearchChapters:        (...args: unknown[]) => cosineChMock(...args),
  cosineSearchHeadings:        (...args: unknown[]) => cosineHMock(...args),
  cosineSearchSubheadings:     (...args: unknown[]) => cosineShMock(...args),
  cosineSearchTariffLines:     (...args: unknown[]) => cosineTlMock(...args),
  ftsSearchTariffLines:        (...args: unknown[]) => ftsTlMock(...args),
  ftsSearchExclusions:         (...args: unknown[]) => ftsExclMock(...args),
  getTariffLineParentChains:   (...args: unknown[]) => parentChainMock(...args),
  getSubheadingChildCounts:    (...args: unknown[]) => childCountsMock(...args),
  getTariffLinesForSubheadings: (...args: unknown[]) => tlForShMock(...args),
  _setQueryRunnerForTesting:   () => undefined,
}));

// Import SUT after mocks are in place.
import { CohereError } from '../lib/cohere-client';
import {
  retrieve,
  buildTsQuery,
  escapeTsQueryToken,
  _internal,
  type L2Input,
  type L2Output,
} from './L2-retrieval';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function fixedEmbedding(): number[] {
  // 1536-dim. Filling with a non-uniform pattern so it's distinguishable in
  // trace inspection if needed.
  return Array.from({ length: 1536 }, (_, i) => (i % 7) / 7);
}

function cosineRow(code: string, score: number): CosineCandidate {
  return { code, cosine_score: score };
}

function ftsHit(code: string, rank: number, description = 'foo'): FtsHit {
  return {
    code,
    description,
    subheading:   code.slice(0, 7),
    rank,
    matched_text: `match for ${code}`,
  };
}

function exclHit(id: number, srcChapter: string, text: string, redirects: string[] = []): ExclusionFtsHit {
  return {
    id,
    source_chapter:        srcChapter,
    excluded_product_text: text,
    redirects_to_chapter:  redirects,
  };
}

function chainRow(code: string): ParentChainRow {
  return {
    code,
    description: `Description for ${code}`,
    subheading:  code.slice(0, 7),
    heading:     code.slice(0, 4),
    chapter:     code.slice(0, 2),
  };
}

function baseInput(overrides: Partial<L2Input> = {}): L2Input {
  return {
    normalized_query:    'cotton t-shirt knitted ladies',
    raw_tokens:          ['cotton', 't-shirt', 'knitted', 'ladies'],
    composite_flag:      false,
    candidate_chapters:  ['61'],
    head_nouns_for_fts:  ['t-shirt', 'cotton'],
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * Reset state between tests
 * --------------------------------------------------------------------------- */

beforeEach(() => {
  // Default happy-path mock returns. Individual tests override as needed.
  embedMock.mockReset();
  rerankMock.mockReset();
  cosineChMock.mockReset();
  cosineHMock.mockReset();
  cosineShMock.mockReset();
  cosineTlMock.mockReset();
  ftsTlMock.mockReset();
  ftsExclMock.mockReset();
  parentChainMock.mockReset();
  childCountsMock.mockReset();
  tlForShMock.mockReset();

  embedMock.mockResolvedValue({ embedding: fixedEmbedding(), latencyMs: 10 });
  cosineChMock.mockResolvedValue([cosineRow('61', 0.91)]);
  cosineHMock.mockResolvedValue([cosineRow('6109', 0.88), cosineRow('6110', 0.74)]);
  cosineShMock.mockResolvedValue([
    cosineRow('6109.10', 0.86),
    cosineRow('6109.90', 0.71),
  ]);
  cosineTlMock.mockResolvedValue([
    cosineRow('6109.10.00', 0.85),
    cosineRow('6109.90.10', 0.72),
  ]);
  ftsTlMock.mockResolvedValue([ftsHit('6109.10.00', 0.42)]);
  ftsExclMock.mockResolvedValue([]);
  parentChainMock.mockImplementation((codes: string[]) =>
    Promise.resolve(codes.map(chainRow)),
  );
  childCountsMock.mockResolvedValue([
    { subheading: '6109.10', child_count: 1 },
    { subheading: '6109.90', child_count: 2 },
  ] satisfies SubheadingChildCount[]);
  tlForShMock.mockResolvedValue([]);
  rerankMock.mockResolvedValue({
    ranked: [
      { id: '6109.10.00', relevance_score: 0.99 },
      { id: '6109.90.10', relevance_score: 0.62 },
    ],
    latencyMs: 50,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ===========================================================================
 * tsquery escaping tests
 * =========================================================================== */

describe('escapeTsQueryToken / buildTsQuery', () => {
  it('strips quotes, ampersands, and parentheses; AND-joins multi-word fragments', () => {
    // "foo & bar" → words [foo, bar] → "(foo & bar)"
    expect(escapeTsQueryToken('"foo & bar"')).toBe('(foo & bar)');
    // "o'reilly (limited)" → [o, reilly, limited] (apostrophe and parens stripped)
    expect(escapeTsQueryToken("o'reilly (limited)")).toBe('(o & reilly & limited)');
  });

  it('lowercases input', () => {
    expect(escapeTsQueryToken('CoTton')).toBe('cotton');
  });

  it('returns empty for non-string / empty input', () => {
    expect(escapeTsQueryToken('')).toBe('');
    expect(escapeTsQueryToken('   ')).toBe('');
    expect(escapeTsQueryToken('!!@#$%^')).toBe('');
  });

  it('preserves underscores but splits on hyphens (hyphen is the NOT operator in tsquery)', () => {
    // "t-shirt_v2" → words [t, shirt_v2] → AND-joined fragment
    expect(escapeTsQueryToken('t-shirt_v2')).toBe('(t & shirt_v2)');
  });

  it('AND-joins multi-word tokens with parens (e.g. "stainless steel")', () => {
    expect(escapeTsQueryToken('stainless steel')).toBe('(stainless & steel)');
  });

  it('returns bare word for single-word tokens (e.g. "hex")', () => {
    expect(escapeTsQueryToken('hex')).toBe('hex');
  });

  it('OR-joins head_nouns with raw_tokens, dedup', () => {
    expect(buildTsQuery(['cotton'], ['cotton', 'shirt', "'"])).toBe('cotton | shirt');
  });

  it('handles special characters safely (multi-word → paren-wrapped AND)', () => {
    const q = buildTsQuery(['"foo & bar"', "o'reilly"], ['baz%^*']);
    expect(q).toBe('(foo & bar) | (o & reilly) | baz');
  });

  it('produces a valid OR-of-fragments tsquery for mixed single+multi tokens', () => {
    const q = buildTsQuery(['stainless steel'], ['hex', 'bolt', 'carbon steel']);
    expect(q).toBe('(stainless & steel) | hex | bolt | (carbon & steel)');
  });

  it('returns empty string when no usable tokens', () => {
    expect(buildTsQuery([], [])).toBe('');
    expect(buildTsQuery(['!!!', '   '], [''])).toBe('');
  });

  /* ----- FIX-B: drop generic modifier noise from raw_tokens ----- */

  it('drops generic filler stopwords from raw_tokens so the noun dominates', () => {
    // "quality","high" are clearly-non-discriminating filler → dropped;
    // "paracetamol" survives. (Conservative list: "powder"/"bulk" are NOT
    // dropped — they can be discriminating; see GENERIC_FTS_MODIFIERS comment.)
    expect(buildTsQuery(['paracetamol'], ['paracetamol', 'quality', 'high']))
      .toBe('paracetamol');
  });

  it('NEVER drops head_nouns even if they are in the filler list', () => {
    // "quality" appears as a head noun here → kept; only its raw_token duplicate
    // (which would otherwise be filler) is suppressed.
    expect(buildTsQuery(['quality'], ['quality', 'high', 'cocoa']))
      .toBe('quality | cocoa');
  });

  it('does NOT drop potentially-discriminating tokens (powder/bulk/ladies/luxury/full/length)', () => {
    // Conservative list (FIX 7): these were previously dropped without empirical
    // validation; they can discriminate (milk powder vs liquid, bulk API vs
    // formulation, ladies vs mens garments) so they now SURVIVE.
    expect(buildTsQuery(['coat', 'fur'], ['mink', 'fur', 'coat', 'full', 'length', 'ladies', 'luxury']))
      .toBe('coat | fur | mink | full | length | ladies | luxury');
  });

  it('falls back to raw_tokens (unfiltered) when head_nouns empty AND every raw token is filler', () => {
    // Robustness: must never emit an empty query when usable input exists.
    expect(buildTsQuery([], ['quality', 'high'])).toBe('quality | high');
  });

  it('keeps non-filler raw_tokens when head_nouns empty', () => {
    expect(buildTsQuery([], ['ibuprofen', 'quality', 'high'])).toBe('ibuprofen');
  });

  it('still OR-joins head_nouns with surviving (non-filler) raw_tokens, deduped', () => {
    // "ladies" is no longer filler (conservative list) so it now survives.
    expect(buildTsQuery(['t-shirt', 'cotton'], ['cotton', 't-shirt', 'knitted', 'ladies']))
      .toBe('(t & shirt) | cotton | knitted | ladies');
  });
});

/* ===========================================================================
 * Main retrieve() behavior
 * =========================================================================== */

describe('retrieve() — direct_leaf_lookup shortcut', () => {
  it('skips rerank when ALL top subheadings have exactly 1 child', async () => {
    // Override: every subheading is a singleton.
    cosineShMock.mockResolvedValue([
      cosineRow('6109.10', 0.86),
      cosineRow('6109.90', 0.71),
    ]);
    childCountsMock.mockResolvedValue([
      { subheading: '6109.10', child_count: 1 },
      { subheading: '6109.90', child_count: 1 },
    ]);
    tlForShMock.mockResolvedValue([
      chainRow('6109.10.00'),
      chainRow('6109.90.00'),
    ]);

    const out: L2Output = await retrieve(baseInput());

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    expect(rerankMock).not.toHaveBeenCalled();
    expect(out.candidates.map((c) => c.code)).toEqual(['6109.10.00', '6109.90.00']);
    expect(out.candidates.every((c) => c.rerank_score === null)).toBe(true);
    expect(out.trace.some((t) => t.step === 'direct_leaf_fetch')).toBe(true);
    // The query embedding MUST be surfaced even on the direct-leaf path so L5
    // Rule-4 cosine floor never silently SKIPs (it embeds once, at Step 1).
    expect(out.query_embedding).toEqual(fixedEmbedding());
    expect(out.query_embedding.length).toBeGreaterThan(0);
  });
});

describe('retrieve() — cascade_full strategy', () => {
  it('invokes rerank when subheadings have multiple children', async () => {
    // childCountsMock default has 6109.90 with count=2 → not all-singleton.
    const out = await retrieve(baseInput());
    expect(out.retrieval_strategy).toBe('cascade_full');
    expect(rerankMock).toHaveBeenCalledOnce();
    // Top candidate should be the one rerank put first.
    expect(out.candidates[0].code).toBe('6109.10.00');
    expect(out.candidates[0].rerank_score).toBe(0.99);
    // The cosine-cascade query embedding is surfaced on the output (reused by L5).
    expect(out.query_embedding).toEqual(fixedEmbedding());
    expect(out.query_embedding.length).toBeGreaterThan(0);
  });

  it('still runs full cascade when composite_flag set', async () => {
    const out = await retrieve(baseInput({ composite_flag: true }));
    expect(out.retrieval_strategy).toBe('cascade_full');
    expect(rerankMock).toHaveBeenCalledOnce();
  });

  it('supports 1, 2, and 3 candidate_chapters equivalently', async () => {
    for (const chapters of [['61'], ['61', '62'], ['61', '62', '60']]) {
      cosineChMock.mockClear();
      const out = await retrieve(baseInput({ candidate_chapters: chapters }));
      expect(out.candidates.length).toBeGreaterThan(0);
      // chapters list is passed through to the cosine search
      expect(cosineChMock).toHaveBeenCalledWith(
        expect.any(Array),
        chapters,
        expect.any(Number),
      );
    }
  });
});

describe('retrieve() — empty / degraded cases', () => {
  it('returns empty candidates when 0 cosine + 0 FTS hits', async () => {
    cosineChMock.mockResolvedValue([]);
    cosineHMock.mockResolvedValue([]);
    cosineShMock.mockResolvedValue([]);
    cosineTlMock.mockResolvedValue([]);
    ftsTlMock.mockResolvedValue([]);
    ftsExclMock.mockResolvedValue([]);

    const out = await retrieve(baseInput());
    expect(out.candidates).toEqual([]);
    expect(out.retrieval_strategy).toBe('cascade_full');
    expect(rerankMock).not.toHaveBeenCalled();
  });

  it('falls back to cosine-only when FTS returns 0 hits', async () => {
    ftsTlMock.mockResolvedValue([]);
    const out = await retrieve(baseInput());
    expect(out.fts_matches).toEqual([]);
    expect(out.candidates.length).toBeGreaterThan(0);
    // Cosine-only path: rerank still runs because cosine candidates exist.
    expect(rerankMock).toHaveBeenCalledOnce();
  });

  it('handles empty head_nouns + empty raw_tokens (no FTS query built)', async () => {
    const out = await retrieve(
      baseInput({ head_nouns_for_fts: [], raw_tokens: [] }),
    );
    // FTS calls skipped → ftsTlMock not invoked.
    expect(ftsTlMock).not.toHaveBeenCalled();
    expect(ftsExclMock).not.toHaveBeenCalled();
    expect(out.fts_matches).toEqual([]);
    expect(out.exclusion_pre_filter).toEqual([]);
  });
});

describe('retrieve() — Cohere failure paths', () => {
  it('propagates CohereError from embed (retries already exhausted internally)', async () => {
    embedMock.mockRejectedValue(new CohereError('500 Internal', 500, '...'));
    await expect(retrieve(baseInput())).rejects.toBeInstanceOf(CohereError);
  });

  it('falls back to cosine-only ranking when rerank throws CohereError', async () => {
    rerankMock.mockRejectedValue(new CohereError('503 Unavailable', 503, '...'));

    const out = await retrieve(baseInput());
    expect(out.retrieval_strategy).toBe('cascade_full');
    // Candidates are emitted ordered by cosine_score desc (fallback path).
    expect(out.candidates[0].code).toBe('6109.10.00'); // cosine 0.85 > 0.72
    // rerank_score should be null since rerank failed.
    expect(out.candidates.every((c) => c.rerank_score === null)).toBe(true);
    // Trace flag present.
    expect(
      out.trace.some((t) => t.step === 'cohere_rerank_fallback_cosine'),
    ).toBe(true);
  });
});

describe('retrieve() — exclusion pre-filter', () => {
  it('populates exclusion_pre_filter when GIN-FTS hits chapter_exclusions', async () => {
    ftsExclMock.mockResolvedValue([
      exclHit(842, '61', 'lace and embroidery articles', ['58']),
      exclHit(843, '61', 'industrial gloves', ['39', '40']),
    ]);
    const out = await retrieve(baseInput());
    expect(out.exclusion_pre_filter).toHaveLength(2);
    expect(out.exclusion_pre_filter[0]).toMatchObject({
      exclusion_id: 842,
      source_chapter: '61',
      redirects_to_chapter: ['58'],
    });
    expect(out.exclusion_pre_filter[1].redirects_to_chapter).toEqual(['39', '40']);
  });

  it('emits empty exclusion_pre_filter when no rules fire', async () => {
    ftsExclMock.mockResolvedValue([]);
    const out = await retrieve(baseInput());
    expect(out.exclusion_pre_filter).toEqual([]);
  });
});

describe('retrieve() — tsquery escape integration', () => {
  it('escapes quotes/ampersands before sending to FTS layer', async () => {
    await retrieve(
      baseInput({
        head_nouns_for_fts: ['"steel"'],
        raw_tokens:         ['hex & bolts', "M10"],
      }),
    );
    expect(ftsTlMock).toHaveBeenCalledOnce();
    const [tsquery] = ftsTlMock.mock.calls[0];
    // "steel" → single-word bare lexeme
    expect(tsquery).toContain('steel');
    // "hex & bolts" (raw token, ampersand stripped) → words [hex, bolts] →
    // multi-word AND-fragment.
    expect(tsquery).toContain('(hex & bolts)');
    // "M10" → "m10"
    expect(tsquery).toContain('m10');
    // No raw quotes leak through.
    expect(tsquery).not.toContain('"');
    // No hyphen-joined multi-word tokens (hyphen would be tsquery NOT operator).
    expect(tsquery).not.toContain('hex-bolts');
  });
});

describe('retrieve() — trace + scores', () => {
  it('populates trace with all major steps and non-zero latencies', async () => {
    const out = await retrieve(baseInput());
    const steps = out.trace.map((t) => t.step);
    expect(steps).toContain('cohere_embed');
    expect(steps).toContain('cosine_chapters');
    expect(steps).toContain('cosine_headings');
    expect(steps).toContain('cosine_subheadings');
    expect(steps).toContain('cosine_tariff_lines');
    expect(steps).toContain('fts_tariff_lines');
    expect(steps).toContain('cohere_rerank');
    expect(steps).toContain('l2_total');
    // Total latency present and >=0
    const total = out.trace.find((t) => t.step === 'l2_total');
    expect(total).toBeDefined();
    expect(total!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('populates retrieval_scores for every emitted candidate code', async () => {
    const out = await retrieve(baseInput());
    for (const c of out.candidates) {
      const score = out.retrieval_scores[c.code];
      expect(score).toBeDefined();
      expect(typeof score.cosine_score).toBe('number');
    }
  });
});

describe('retrieve() — caps and limits (FIX-A: widened funnel)', () => {
  it('exposes the widened tunables (FIX-A): FTS_LIMIT=40, RERANK_TOP_N=15, L2_EMIT_CAP=8', () => {
    expect(_internal.FTS_LIMIT).toBe(40);
    expect(_internal.RERANK_TOP_N).toBe(15);
    expect(_internal.L2_EMIT_CAP).toBe(8);
  });

  it('requests topN=RERANK_TOP_N (15) candidates from Cohere rerank', async () => {
    await retrieve(baseInput());
    expect(rerankMock).toHaveBeenCalledOnce();
    const [, , opts] = rerankMock.mock.calls[0];
    expect(opts).toMatchObject({ topN: _internal.RERANK_TOP_N });
  });

  it('passes FTS_LIMIT (40) to the tariff-line FTS query', async () => {
    await retrieve(baseInput());
    expect(ftsTlMock).toHaveBeenCalledOnce();
    const [, , limit] = ftsTlMock.mock.calls[0];
    expect(limit).toBe(_internal.FTS_LIMIT);
  });

  it('emits up to L2_EMIT_CAP (8) candidates so rank #6-8 reach L4', async () => {
    // Stretch the candidate set well above 5 — rerank returns up to 15, L2
    // emits up to 8 (decoupled from the old top-5 funnel).
    cosineTlMock.mockResolvedValue([
      cosineRow('6109.10.00', 0.95),
      cosineRow('6109.10.10', 0.93),
      cosineRow('6109.10.20', 0.91),
      cosineRow('6109.90.10', 0.85),
      cosineRow('6109.90.20', 0.83),
      cosineRow('6109.90.30', 0.80),
      cosineRow('6109.90.40', 0.78),
      cosineRow('6109.90.50', 0.76),
      cosineRow('6109.90.60', 0.74),
      cosineRow('6109.90.70', 0.72),
    ]);
    ftsTlMock.mockResolvedValue([ftsHit('6109.10.30', 0.5)]);
    rerankMock.mockResolvedValue({
      ranked: [
        { id: '6109.10.00', relevance_score: 0.99 },
        { id: '6109.10.10', relevance_score: 0.95 },
        { id: '6109.10.20', relevance_score: 0.91 },
        { id: '6109.90.10', relevance_score: 0.85 },
        { id: '6109.90.20', relevance_score: 0.80 },
        { id: '6109.90.30', relevance_score: 0.78 },
        { id: '6109.90.40', relevance_score: 0.76 },
        { id: '6109.90.50', relevance_score: 0.74 },
        { id: '6109.90.60', relevance_score: 0.72 },
      ],
      latencyMs: 80,
    });
    const out = await retrieve(baseInput());
    expect(out.candidates.length).toBe(_internal.L2_EMIT_CAP);
    expect(out.candidates.length).toBeLessThanOrEqual(_internal.L2_EMIT_CAP);
  });

  it('cosine-fallback path also emits up to L2_EMIT_CAP candidates', async () => {
    cosineTlMock.mockResolvedValue([
      cosineRow('6109.10.00', 0.95),
      cosineRow('6109.10.10', 0.93),
      cosineRow('6109.10.20', 0.91),
      cosineRow('6109.90.10', 0.85),
      cosineRow('6109.90.20', 0.83),
      cosineRow('6109.90.30', 0.80),
      cosineRow('6109.90.40', 0.78),
      cosineRow('6109.90.50', 0.76),
      cosineRow('6109.90.60', 0.74),
    ]);
    ftsTlMock.mockResolvedValue([]);
    rerankMock.mockRejectedValue(new CohereError('503 Unavailable', 503, '...'));
    const out = await retrieve(baseInput());
    expect(out.candidates.length).toBe(_internal.L2_EMIT_CAP);
    expect(out.candidates.every((c) => c.rerank_score === null)).toBe(true);
  });
});

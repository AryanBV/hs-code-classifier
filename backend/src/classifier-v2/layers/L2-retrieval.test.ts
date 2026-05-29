/**
 * Unit tests for Layer 2 Hybrid Retrieval.
 *
 * Framework: vitest. Injects MOCK providers (EmbeddingProvider + Reranker) via
 * the `_setProvidersForTesting` seam and mocks the Supabase/pg wrapper
 * (`../lib/supabase-client`) so no network or DB calls happen. Validates:
 *   - Vertex query-embed wiring (via injected EmbeddingProvider)
 *   - Multi-level cosine cascade ordering
 *   - direct_leaf_lookup shortcut detection
 *   - tsquery escaping for special characters
 *   - Provider unavailable / 5xx fallback (cosine-only ordering) — now triggered
 *     by a RetrievalProviderError thrown from the injected reranker
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
import type {
  EmbeddingProvider,
  EmbedProviderResult,
  EmbeddingTaskType,
} from '../lib/embedding-provider';
import type {
  Reranker,
  RerankDocument,
  RerankResult,
  RerankOptions,
} from '../lib/reranker';
import { RetrievalProviderError } from '../lib/retrieval-errors';

/* ---------------------------------------------------------------------------
 * Provider mocks (injected via _setProvidersForTesting, NOT module mocks)
 * --------------------------------------------------------------------------- */

const embedMock  = vi.fn<[string, { taskType: EmbeddingTaskType }], Promise<EmbedProviderResult>>();
const rerankMock = vi.fn<[string, RerankDocument[], RerankOptions | undefined], Promise<RerankResult>>();

const mockEmbeddingProvider: EmbeddingProvider = {
  name: 'mock/embedding',
  dim:  1536,
  embed: (text, opts) => embedMock(text, opts),
};

const mockReranker: Reranker = {
  name:   'mock/reranker',
  rerank: (query, documents, opts) => rerankMock(query, documents, opts),
};

/* ---------------------------------------------------------------------------
 * Supabase mock (registered BEFORE importing the SUT)
 * --------------------------------------------------------------------------- */

const cosineChMock  = vi.fn();
const cosineHMock   = vi.fn();
const cosineShMock  = vi.fn();
const cosineTlMock  = vi.fn();
const ftsTlMock     = vi.fn();
const ftsExclMock   = vi.fn();
const parentChainMock = vi.fn();
const childCountsMock = vi.fn();
const shForHeadingsMock = vi.fn();
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
  getSubheadingsForHeadings:   (...args: unknown[]) => shForHeadingsMock(...args),
  getTariffLinesForSubheadings: (...args: unknown[]) => tlForShMock(...args),
  _setQueryRunnerForTesting:   () => undefined,
}));

// Import SUT after mocks are in place.
import {
  retrieve,
  buildTsQuery,
  escapeTsQueryToken,
  _internal,
  _setProvidersForTesting,
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
  // Inject the mock providers in place of the env factories.
  _setProvidersForTesting({ embeddingProvider: mockEmbeddingProvider, reranker: mockReranker });

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
  shForHeadingsMock.mockReset();
  tlForShMock.mockReset();

  embedMock.mockResolvedValue({ embedding: fixedEmbedding(), dim: 1536, latencyMs: 10 });
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
  // Default: heading-expansion returns the surfaced headings' subheadings. The
  // happy-path baseInput surfaces headings 6109/6110 (cosineHMock); default to
  // the two cosine-surfaced subheadings so expansion is a no-op unless a test
  // overrides it to add sibling subheadings.
  shForHeadingsMock.mockResolvedValue(['6109.10', '6109.90']);
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
  // Restore the env factories so no injected mock leaks into other test files.
  _setProvidersForTesting({ embeddingProvider: null, reranker: null });
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
 * Provider wiring — embed task type + rerank inputs
 * =========================================================================== */

describe('retrieve() — provider wiring', () => {
  it('embeds the query via the EmbeddingProvider with taskType RETRIEVAL_QUERY', async () => {
    await retrieve(baseInput());
    expect(embedMock).toHaveBeenCalledOnce();
    const [text, opts] = embedMock.mock.calls[0];
    expect(text).toBe('cotton t-shirt knitted ladies');
    expect(opts).toEqual({ taskType: 'RETRIEVAL_QUERY' });
  });

  it('passes the normalized_query and {id,text} docs to the Reranker', async () => {
    await retrieve(baseInput());
    expect(rerankMock).toHaveBeenCalledOnce();
    const [query, docs] = rerankMock.mock.calls[0];
    expect(query).toBe('cotton t-shirt knitted ladies');
    expect(Array.isArray(docs)).toBe(true);
    for (const d of docs) {
      expect(typeof d.id).toBe('string');
      expect(typeof d.text).toBe('string');
    }
  });
});

/* ===========================================================================
 * Main retrieve() behavior
 * =========================================================================== */

describe('retrieve() — direct_leaf_lookup shortcut', () => {
  it('detects direct_leaf_lookup when ALL top subheadings have exactly 1 child', async () => {
    // Override: every surfaced subheading is a singleton.
    cosineShMock.mockResolvedValue([
      cosineRow('6109.10', 0.86),
      cosineRow('6109.90', 0.71),
    ]);
    childCountsMock.mockResolvedValue([
      { subheading: '6109.10', child_count: 1 },
      { subheading: '6109.90', child_count: 1 },
    ]);
    shForHeadingsMock.mockResolvedValue(['6109.10', '6109.90']);
    tlForShMock.mockResolvedValue([
      chainRow('6109.10.00'),
      chainRow('6109.90.00'),
    ]);
    rerankMock.mockResolvedValue({
      ranked: [
        { id: '6109.10.00', relevance_score: 0.99 },
        { id: '6109.90.00', relevance_score: 0.62 },
      ],
      latencyMs: 50,
    });

    const out: L2Output = await retrieve(baseInput());

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    expect(out.trace.some((t) => t.step === 'direct_leaf_fetch')).toBe(true);
    // The query embedding MUST be surfaced even on the direct-leaf path so L5
    // Rule-4 cosine floor never silently SKIPs (it embeds once, at Step 1).
    expect(out.query_embedding).toEqual(fixedEmbedding());
    expect(out.query_embedding.length).toBeGreaterThan(0);
  });

  /* ----- RECALL fix part 1: direct branch reranks the FTS union ----- */

  it('reranks the union (does NOT skip rerank) on the direct-leaf path', async () => {
    cosineShMock.mockResolvedValue([
      cosineRow('6109.10', 0.86),
      cosineRow('6109.90', 0.71),
    ]);
    childCountsMock.mockResolvedValue([
      { subheading: '6109.10', child_count: 1 },
      { subheading: '6109.90', child_count: 1 },
    ]);
    shForHeadingsMock.mockResolvedValue(['6109.10', '6109.90']);
    tlForShMock.mockResolvedValue([
      chainRow('6109.10.00'),
      chainRow('6109.90.00'),
    ]);
    rerankMock.mockResolvedValue({
      ranked: [
        { id: '6109.10.00', relevance_score: 0.99 },
        { id: '6109.90.00', relevance_score: 0.62 },
      ],
      latencyMs: 50,
    });

    const out = await retrieve(baseInput());

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    // Rerank IS now invoked on the direct branch (was previously skipped).
    expect(rerankMock).toHaveBeenCalledOnce();
    expect(out.trace.some((t) => t.step === 'cohere_rerank')).toBe(true);
    // The reranked candidate carries a non-null rerank_score.
    const top = out.candidates.find((c) => c.code === '6109.10.00');
    expect(top).toBeDefined();
    expect(top!.rerank_score).toBe(0.99);
  });

  it('INCLUDES an FTS-surfaced gold leaf that is NOT among the direct-leaf rows (e.g. ferro-tungsten 7202.80)', async () => {
    // Cosine cascade surfaces only 6109.* singletons → direct_leaf_lookup.
    cosineShMock.mockResolvedValue([
      cosineRow('6109.10', 0.86),
      cosineRow('6109.90', 0.71),
    ]);
    childCountsMock.mockResolvedValue([
      { subheading: '6109.10', child_count: 1 },
      { subheading: '6109.90', child_count: 1 },
    ]);
    shForHeadingsMock.mockResolvedValue(['6109.10', '6109.90']);
    tlForShMock.mockResolvedValue([
      chainRow('6109.10.00'),
      chainRow('6109.90.00'),
    ]);
    // FTS surfaces the gold leaf the cosine cascade missed entirely.
    cosineTlMock.mockResolvedValue([]);
    ftsTlMock.mockResolvedValue([ftsHit('7202.80.00', 0.6)]);
    rerankMock.mockResolvedValue({
      ranked: [
        // Reranker puts the FTS-surfaced gold on top.
        { id: '7202.80.00', relevance_score: 0.97 },
        { id: '6109.10.00', relevance_score: 0.40 },
        { id: '6109.90.00', relevance_score: 0.30 },
      ],
      latencyMs: 60,
    });

    const out = await retrieve(baseInput());

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    const codes = out.candidates.map((c) => c.code);
    // The FTS-surfaced gold leaf survives to the emitted candidate set — the old
    // direct branch discarded the FTS union and would have dropped it.
    expect(codes).toContain('7202.80.00');
    // FTS doc was passed to the reranker (union, not direct-only).
    const [, docs] = rerankMock.mock.calls[0];
    expect(docs.map((d) => d.id)).toContain('7202.80.00');
  });

  /* ----- RECALL fix part 2: expand leaf set to ALL subheadings of headings ----- */

  it('INCLUDES sibling/residual subheading leaves from the surfaced HEADINGS, not just the cosine top-5 subheadings (e.g. plastic chair 9401.80)', async () => {
    // Cosine surfaces only 9401.30 (singleton) → direct_leaf_lookup, but the
    // gold leaf lives under sibling subheading 9401.80 which cosine never ranked.
    cosineHMock.mockResolvedValue([cosineRow('9401', 0.9)]);
    cosineShMock.mockResolvedValue([cosineRow('9401.30', 0.8)]);
    childCountsMock.mockResolvedValue([
      { subheading: '9401.30', child_count: 1 },
    ]);
    // Heading-expansion returns ALL subheadings of heading 9401 — including the
    // sibling 9401.80 the cosine cascade did not surface.
    shForHeadingsMock.mockResolvedValue(['9401.30', '9401.80']);
    tlForShMock.mockResolvedValue([
      chainRow('9401.30.00'),
      chainRow('9401.80.00'), // the residual/sibling gold leaf
    ]);
    cosineTlMock.mockResolvedValue([cosineRow('9401.30.00', 0.78)]);
    ftsTlMock.mockResolvedValue([]);
    rerankMock.mockResolvedValue({
      ranked: [
        { id: '9401.80.00', relevance_score: 0.96 },
        { id: '9401.30.00', relevance_score: 0.50 },
      ],
      latencyMs: 55,
    });

    const out = await retrieve(
      baseInput({ candidate_chapters: ['94'], head_nouns_for_fts: ['chair'], raw_tokens: ['plastic', 'chair'] }),
    );

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    // Heading-expansion was queried with the surfaced heading.
    expect(shForHeadingsMock).toHaveBeenCalledWith(['9401']);
    // The leaf-fetch used the EXPANDED subheading set (includes sibling 9401.80).
    expect(tlForShMock).toHaveBeenCalledWith(['9401.30', '9401.80']);
    const codes = out.candidates.map((c) => c.code);
    expect(codes).toContain('9401.80.00');
  });

  it('keeps the final emitted count <= L2_EMIT_CAP on the direct-leaf union path', async () => {
    cosineShMock.mockResolvedValue([cosineRow('6109.10', 0.86)]);
    childCountsMock.mockResolvedValue([
      { subheading: '6109.10', child_count: 1 },
    ]);
    // Heading-expansion + leaf-fetch yield MANY leaves (well above the cap).
    shForHeadingsMock.mockResolvedValue([
      '6109.10', '6109.90', '6110.10', '6110.20', '6110.30',
    ]);
    const manyLeaves = [
      '6109.10.00', '6109.90.00', '6110.10.00', '6110.20.00',
      '6110.30.00', '6110.30.10', '6110.30.20', '6110.30.30',
      '6110.30.40', '6110.30.50', '6110.30.60', '6110.30.70',
    ];
    tlForShMock.mockResolvedValue(manyLeaves.map(chainRow));
    cosineTlMock.mockResolvedValue([]);
    ftsTlMock.mockResolvedValue([]);
    rerankMock.mockResolvedValue({
      ranked: manyLeaves
        .slice(0, _internal.RERANK_TOP_N)
        .map((id, i) => ({ id, relevance_score: 0.9 - i * 0.01 })),
      latencyMs: 70,
    });

    const out = await retrieve(baseInput());

    expect(out.retrieval_strategy).toBe('direct_leaf_lookup');
    // HARD CONSTRAINT: emitted candidate count stays at L2_EMIT_CAP (8), even
    // though the rerank POOL was widened well above it.
    expect(out.candidates.length).toBeLessThanOrEqual(_internal.L2_EMIT_CAP);
    expect(out.candidates.length).toBe(_internal.L2_EMIT_CAP);
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

describe('retrieve() — provider failure paths', () => {
  it('propagates RetrievalProviderError from embed (retries already exhausted internally)', async () => {
    embedMock.mockRejectedValue(
      new RetrievalProviderError('Vertex embed failed: 500 Internal', {
        provider: 'vertex',
        retryable: true,
      }),
    );
    await expect(retrieve(baseInput())).rejects.toBeInstanceOf(RetrievalProviderError);
  });

  it('falls back to cosine-only ranking when rerank throws RetrievalProviderError', async () => {
    rerankMock.mockRejectedValue(
      new RetrievalProviderError('Gemini-Flash rerank failed: 503 Unavailable', {
        provider: 'vertex',
        retryable: true,
      }),
    );

    const out = await retrieve(baseInput());
    expect(out.retrieval_strategy).toBe('cascade_full');
    // Candidates are emitted ordered by cosine_score desc (fallback path).
    expect(out.candidates[0].code).toBe('6109.10.00'); // cosine 0.85 > 0.72
    // rerank_score should be null since rerank failed.
    expect(out.candidates.every((c) => c.rerank_score === null)).toBe(true);
    // Trace flag present (degrade branch name preserved).
    expect(
      out.trace.some((t) => t.step === 'cohere_rerank_fallback_cosine'),
    ).toBe(true);
  });

  it('does NOT swallow a non-RetrievalProviderError thrown by rerank — it rethrows', async () => {
    rerankMock.mockRejectedValue(new Error('unexpected non-provider error'));
    await expect(retrieve(baseInput())).rejects.toThrow('unexpected non-provider error');
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

  it('requests topN=RERANK_TOP_N (15) candidates from the reranker', async () => {
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
    rerankMock.mockRejectedValue(
      new RetrievalProviderError('Gemini-Flash rerank failed: 503 Unavailable', {
        provider: 'vertex',
        retryable: true,
      }),
    );
    const out = await retrieve(baseInput());
    expect(out.candidates.length).toBe(_internal.L2_EMIT_CAP);
    expect(out.candidates.every((c) => c.rerank_score === null)).toBe(true);
  });
});

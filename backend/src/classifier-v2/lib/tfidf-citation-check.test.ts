/**
 * Unit tests for the MV-03 citation-fidelity metric (token-set containment).
 *
 * The metric was rewritten 2026-05-28 (the old ts_rank_cd ratio was
 * mathematically broken — see tfidf-citation-check.ts header). These tests
 * encode the CORRECT contract: a faithful (verbatim-copy / near-verbatim slice)
 * citation passes; a fabricated or loosely-paraphrased one fails.
 *
 * Spec: backend/docs/sub-specs/01-verifier-rules.md §"Rule 3".
 * Run: cd backend && npx vitest run src/classifier-v2/lib/tfidf-citation-check.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  citationFuzzyMatch,
  tokenize,
  tokenSetContainment,
  type CitationMatchResult,
} from './tfidf-citation-check';
import type { QueryRunner } from './supabase-client';
import { CITATION_TFIDF_THRESHOLD } from './verifier-constants';

// The metric is pure JS; the runner is never used. Provide an inert stub that
// throws if (unexpectedly) called, to prove no DB round-trip happens.
const inertRunner: QueryRunner = {
  query: (() => {
    throw new Error('citationFuzzyMatch must NOT touch the DB (pure JS metric)');
  }) as unknown as QueryRunner['query'],
};

async function score(verbatim: string, source: string): Promise<CitationMatchResult> {
  return citationFuzzyMatch(verbatim, source, inertRunner);
}

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops <2-char tokens', () => {
    expect(tokenize('Iron OR Steel — screws, bolts.')).toEqual([
      'iron', 'or', 'steel', 'screws', 'bolts',
    ]);
  });
  it('returns empty for punctuation-only / blank text', () => {
    expect(tokenize('  — , . ')).toEqual([]);
  });
});

describe('tokenSetContainment', () => {
  it('returns 1.0 for an exact copy', () => {
    const t = tokenize('articles of iron or steel screws bolts');
    expect(tokenSetContainment(t, t)).toBe(1.0);
  });
  it('returns 1.0 when every verbatim token is a subset of the source', () => {
    const v = tokenize('screws and bolts');
    const s = tokenize('articles of iron or steel such as screws and bolts and nuts');
    expect(tokenSetContainment(v, s)).toBe(1.0);
  });
  it('returns a fraction for a partial overlap', () => {
    const v = tokenize('screws bolts plastic'); // 3 distinct; 2 present
    const s = tokenize('articles of iron or steel screws and bolts');
    expect(tokenSetContainment(v, s)).toBeCloseTo(2 / 3, 5);
  });
  it('returns 0 for unrelated text', () => {
    const v = tokenize('fresh tropical fruit packed in cartons');
    const s = tokenize('articles of iron or steel screws and bolts');
    expect(tokenSetContainment(v, s)).toBe(0);
  });
  it('returns null when there are no verbatim tokens', () => {
    expect(tokenSetContainment([], tokenize('any source text here'))).toBeNull();
  });
  it('uses SET semantics (repeated verbatim words do not distort the ratio)', () => {
    const v = tokenize('bolts bolts bolts plastic'); // distinct {bolts, plastic}; 1 present
    const s = tokenize('iron and steel bolts');
    expect(tokenSetContainment(v, s)).toBeCloseTo(1 / 2, 5);
  });
});

describe('citationFuzzyMatch (MV-03 contract)', () => {
  it('PASSes a faithful exact copy', async () => {
    const text = 'Articles of iron or steel, screws, bolts and similar fasteners.';
    const r = await score(text, text);
    expect(r.normalized_score).toBe(1.0);
    expect(r.passed).toBe(true);
    expect(r.threshold).toBe(CITATION_TFIDF_THRESHOLD);
  });

  it('PASSes a faithful near-verbatim slice of a long source', async () => {
    const source =
      'This Chapter covers articles of iron or steel such as screws, bolts, nuts, washers and similar threaded fasteners of base metal.';
    const r = await score('screws, bolts, nuts, washers and similar threaded fasteners', source);
    expect(r.normalized_score).toBe(1.0);
    expect(r.passed).toBe(true);
  });

  it('FAILs a fabricated (unrelated) citation', async () => {
    const r = await score(
      'Fresh tropical fruit packed in cartons for retail sale.',
      'Articles of iron or steel, screws, bolts and similar fasteners.',
    );
    expect(r.normalized_score).not.toBeNull();
    expect(r.normalized_score as number).toBeLessThan(CITATION_TFIDF_THRESHOLD);
    expect(r.passed).toBe(false);
  });

  it('FAILs a loose paraphrase (most content words swapped)', async () => {
    const r = await score(
      'Metal hardware components manufactured primarily from ferrous alloys.',
      'Articles of iron or steel such as screws, bolts and similar threaded fasteners.',
    );
    expect(r.passed).toBe(false);
  });

  it('honours a threshold override', async () => {
    // A 2/3-containment citation passes at a 0.5 threshold but fails at default.
    const verbatim = 'screws bolts plastic';
    const source = 'articles of iron or steel screws and bolts';
    const lenient = await citationFuzzyMatch(verbatim, source, inertRunner, 0.5);
    expect(lenient.threshold).toBe(0.5);
    expect(lenient.passed).toBe(true);
    const strict = await score(verbatim, source);
    expect(strict.passed).toBe(false);
  });

  it('SKIP-signals (source_too_short) when source < 5 tokens', async () => {
    const r = await score('iron steel bolts', 'iron steel'); // source has 2 tokens
    expect(r.source_too_short).toBe(true);
    expect(r.normalized_score).toBeNull();
    expect(r.passed).toBe(false);
  });

  it('null score when verbatim < 2 tokens', async () => {
    const r = await score('iron', 'articles of iron or steel screws and bolts');
    expect(r.normalized_score).toBeNull();
    expect(r.source_too_short).toBe(false);
    expect(r.passed).toBe(false);
  });
});

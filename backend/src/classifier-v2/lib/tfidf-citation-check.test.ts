/**
 * Unit tests for TF-IDF citation fuzzy-match (Rule 3 scoring).
 *
 * Spec: sub-spec 01 §"Rule 3" SQL pattern + score normalization.
 * Run: cd backend && npx vitest run src/classifier-v2/lib/tfidf-citation-check.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { citationFuzzyMatch, buildSelfTsQuery } from './tfidf-citation-check';
import type { QueryRunner } from './supabase-client';

/* ---------------------------------------------------------------------------
 * Mock runner factory
 * --------------------------------------------------------------------------- */

function makeRunner(scoreRow: { raw_score: number; self_score: number } | null): QueryRunner {
  return {
    query: vi.fn(async () => {
      if (scoreRow === null) {
        return { rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<QueryRunner['query']>>;
      }
      return { rows: [scoreRow], rowCount: 1 } as unknown as Awaited<ReturnType<QueryRunner['query']>>;
    }) as unknown as QueryRunner['query'],
  };
}

/* ===========================================================================
 * Self-tsquery construction
 * =========================================================================== */

describe('tfidf-citation-check — buildSelfTsQuery', () => {
  it('emits OR-joined unique tokens (lowercased)', () => {
    const q = buildSelfTsQuery('Iron and steel are base metals and steel is used widely.');
    expect(q.split(' | ')).toEqual(['iron', 'and', 'steel', 'are', 'base', 'metals', 'is', 'used', 'widely']);
  });
  it('drops short single-char tokens', () => {
    const q = buildSelfTsQuery('a be is at on');
    expect(q.split(' | ')).toEqual(['be', 'is', 'at', 'on']);
  });
  it('caps at 10 tokens', () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `token${i}`).join(' ');
    const q = buildSelfTsQuery(tokens);
    expect(q.split(' | ')).toHaveLength(10);
  });
  it('returns empty string when no usable tokens', () => {
    expect(buildSelfTsQuery('a b c d')).toBe('');
  });
});

/* ===========================================================================
 * citationFuzzyMatch — main path
 * =========================================================================== */

describe('citationFuzzyMatch — main path', () => {
  const longSource = 'Stainless steel means alloy steels containing by weight 1.2% or less of carbon and 10.5% or more of chromium with or without other elements.';

  it('PASS when normalized_score >= 0.6', async () => {
    const runner = makeRunner({ raw_score: 0.5, self_score: 0.6 });
    const r = await citationFuzzyMatch('Stainless steel alloy chromium 10.5%', longSource, runner);
    expect(r.passed).toBe(true);
    expect(r.normalized_score).toBeCloseTo(0.5 / 0.6, 5);
  });

  it('FAIL when normalized_score < 0.6', async () => {
    const runner = makeRunner({ raw_score: 0.1, self_score: 0.5 });
    const r = await citationFuzzyMatch('Wholly unrelated text about plastics', longSource, runner);
    expect(r.passed).toBe(false);
    expect(r.normalized_score).toBeCloseTo(0.2, 5);
  });

  it('passes threshold-override correctly', async () => {
    const runner = makeRunner({ raw_score: 0.25, self_score: 0.5 });
    const r = await citationFuzzyMatch('paraphrased text', longSource, runner, 0.4);
    expect(r.threshold).toBe(0.4);
    expect(r.passed).toBe(true);
  });

  it('SKIP-like: source < 5 tokens → null score, source_too_short=true', async () => {
    const runner = makeRunner({ raw_score: 1.0, self_score: 1.0 });
    const r = await citationFuzzyMatch('verbatim text matching', 'short note', runner);
    expect(r.normalized_score).toBeNull();
    expect(r.source_too_short).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('SKIP-like: verbatim < 2 tokens → null score', async () => {
    const runner = makeRunner({ raw_score: 1.0, self_score: 1.0 });
    const r = await citationFuzzyMatch('a', longSource, runner);
    expect(r.normalized_score).toBeNull();
  });

  it('Returns null score when self_score === 0 (degenerate)', async () => {
    const runner = makeRunner({ raw_score: 0.5, self_score: 0 });
    const r = await citationFuzzyMatch('valid verbatim text', longSource, runner);
    expect(r.normalized_score).toBeNull();
    expect(r.passed).toBe(false);
  });

  it('Boundary score exactly at threshold (0.6) → PASS', async () => {
    const runner = makeRunner({ raw_score: 0.6, self_score: 1.0 });
    const r = await citationFuzzyMatch('boundary verbatim text', longSource, runner);
    expect(r.normalized_score).toBe(0.6);
    expect(r.passed).toBe(true);
  });

  it('No rows returned → null score', async () => {
    const runner = makeRunner(null);
    const r = await citationFuzzyMatch('boundary verbatim text', longSource, runner);
    expect(r.normalized_score).toBeNull();
  });
});

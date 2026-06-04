/**
 * Unit tests for sibling-repopulation (Stage S1).
 *
 * Uses the `_setQueryRunnerForTesting` injection hook (same pattern as
 * supabase-client.test.ts) so no live Postgres is needed — the helper's only DB
 * dependency, `getTariffLinesForSubheadings`, runs through the injected fake.
 *
 * Proves:
 *   (a) returns the FULL leaf family for a surviving subheading,
 *   (b) merges + dedupes with the emit set (no dup codes; emit rerank scores preserved),
 *   (c) falls back to the emit set UNCHANGED on a fetch error.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/sibling-repopulation.test.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { _setQueryRunnerForTesting, type QueryRunner } from './supabase-client';
import type { RetrievalCandidate } from '../types';
import {
  distinctSubheadingKeys,
  fetchFullSiblingFamily,
  repopulateSiblings,
} from './sibling-repopulation';

/* ---------------------------------------------------------------------------
 * Fakes / fixtures
 * --------------------------------------------------------------------------- */

/** Fake QueryRunner returning a fixed row set (ignores SQL/params). */
function fakeRunner(rows: unknown[]): QueryRunner {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
      return { rows: rows as T[], rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    },
  };
}

/** Fake QueryRunner whose query rejects — exercises the fail-safe path. */
function throwingRunner(): QueryRunner {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
      throw new Error('simulated DB transport failure');
    },
  };
}

/** A ParentChainRow as `getTariffLinesForSubheadings` returns it. */
function chainRow(code: string, subheading: string): {
  code: string;
  description: string;
  subheading: string;
  heading: string;
  chapter: string;
} {
  return {
    code,
    description: `desc ${code}`,
    subheading,
    heading: subheading.slice(0, 4),
    chapter: code.slice(0, 2),
  };
}

/** An emit-set candidate with a chosen rerank score. */
function emitCandidate(
  code: string,
  subheading: string,
  rerank_score: number | null,
): RetrievalCandidate {
  return {
    code,
    level: 'tariff_line',
    cosine_score: 0.5,
    fts_rank: null,
    rerank_score,
    parent_chain: {
      chapter: code.slice(0, 2),
      heading: subheading.slice(0, 4),
      subheading,
      tariff_line: code,
    },
  };
}

afterEach(() => {
  _setQueryRunnerForTesting(null);
});

/* ---------------------------------------------------------------------------
 * distinctSubheadingKeys (pure helper)
 * --------------------------------------------------------------------------- */

describe('distinctSubheadingKeys', () => {
  it('returns distinct, sorted, well-formed subheading keys; skips unresolvable', () => {
    const cands: RetrievalCandidate[] = [
      emitCandidate('0207.14.10', '0207.14', 0.9),
      emitCandidate('0207.12.10', '0207.12', 0.8),
      emitCandidate('0207.14.20', '0207.14', 0.7), // duplicate subheading
      // unresolvable: no parent subheading and a non-conforming code
      {
        code: 'junk',
        level: 'tariff_line',
        cosine_score: 0,
        fts_rank: null,
        rerank_score: null,
        parent_chain: { chapter: null, heading: null, subheading: null, tariff_line: null },
      },
    ];
    expect(distinctSubheadingKeys(cands)).toEqual(['0207.12', '0207.14']);
  });
});

/* ---------------------------------------------------------------------------
 * (a) fetchFullSiblingFamily — returns the full family in candidate shape
 * --------------------------------------------------------------------------- */

describe('fetchFullSiblingFamily', () => {
  it('returns the FULL leaf family of a subheading as sentinel-scored candidates', async () => {
    _setQueryRunnerForTesting(fakeRunner([
      chainRow('0207.14.10', '0207.14'),
      chainRow('0207.14.20', '0207.14'),
      chainRow('0207.14.90', '0207.14'),
    ]));

    const fam = await fetchFullSiblingFamily(['0207.14']);

    expect(fam.map((c) => c.code)).toEqual(['0207.14.10', '0207.14.20', '0207.14.90']);
    // Drop-in shape: level + parent_chain populated, sentinel scores.
    for (const c of fam) {
      expect(c.level).toBe('tariff_line');
      expect(c.cosine_score).toBe(0);
      expect(c.fts_rank).toBeNull();
      expect(c.rerank_score).toBeNull();
      expect(c.parent_chain.subheading).toBe('0207.14');
      expect(c.parent_chain.tariff_line).toBe(c.code);
      expect(c.parent_chain.heading).toBe('0207');
      expect(c.parent_chain.chapter).toBe('02');
    }
  });

  it('returns [] without touching the runner for empty / malformed input', async () => {
    // No runner injected → a query attempt would throw on missing DATABASE_URL.
    expect(await fetchFullSiblingFamily([])).toEqual([]);
    expect(await fetchFullSiblingFamily(['nope', '0207'])).toEqual([]);
  });

  it('FAIL-SAFE: returns [] when the fetch throws', async () => {
    _setQueryRunnerForTesting(throwingRunner());
    expect(await fetchFullSiblingFamily(['0207.14'])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * (b) repopulateSiblings — merge + dedupe, scores preserved
 * --------------------------------------------------------------------------- */

describe('repopulateSiblings — merge + dedupe', () => {
  it('appends only NEW siblings, dedupes by code, and PRESERVES emit-set rerank scores', async () => {
    // Emit set: rerank-surviving top-2 leaves across two subheadings.
    const emit: RetrievalCandidate[] = [
      emitCandidate('0207.14.10', '0207.14', 0.95),
      emitCandidate('0207.12.10', '0207.12', 0.81),
    ];

    // Full DB family: 0207.14 has 3 leaves, 0207.12 has 2 — including the two
    // already in the emit set (must be deduped, emit scores kept).
    _setQueryRunnerForTesting(fakeRunner([
      chainRow('0207.14.10', '0207.14'), // dup of emit (score must survive)
      chainRow('0207.14.20', '0207.14'), // NEW sibling
      chainRow('0207.14.90', '0207.14'), // NEW sibling (residual)
      chainRow('0207.12.10', '0207.12'), // dup of emit
      chainRow('0207.12.90', '0207.12'), // NEW sibling (residual)
    ]));

    const out = await repopulateSiblings(emit);

    // No duplicate codes.
    const codes = out.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);

    // Emit set preserved first + verbatim, then the 3 genuinely-new siblings.
    expect(codes).toEqual([
      '0207.14.10', // emit
      '0207.12.10', // emit
      '0207.14.20', // new
      '0207.14.90', // new
      '0207.12.90', // new
    ]);

    // Emit-set rerank scores preserved (the dup family rows did NOT overwrite).
    const byCode = new Map(out.map((c) => [c.code, c]));
    expect(byCode.get('0207.14.10')?.rerank_score).toBe(0.95);
    expect(byCode.get('0207.12.10')?.rerank_score).toBe(0.81);
    expect(byCode.get('0207.14.10')?.cosine_score).toBe(0.5); // emit cosine kept

    // New siblings carry sentinel scores (no retrieval signal).
    const fresh = byCode.get('0207.14.20');
    expect(fresh?.rerank_score).toBeNull();
    expect(fresh?.cosine_score).toBe(0);
    expect(fresh?.fts_rank).toBeNull();
    expect(fresh?.parent_chain.subheading).toBe('0207.14');
  });

  it('returns the emit set UNCHANGED when the family adds nothing new', async () => {
    const emit: RetrievalCandidate[] = [emitCandidate('0207.14.10', '0207.14', 0.9)];
    // DB family is a strict subset of the emit set → no additions.
    _setQueryRunnerForTesting(fakeRunner([chainRow('0207.14.10', '0207.14')]));

    const out = await repopulateSiblings(emit);
    expect(out).toBe(emit); // same reference — additive no-op
  });

  it('returns the emit set unchanged for an empty input (no DB round-trip)', async () => {
    const empty: RetrievalCandidate[] = [];
    const out = await repopulateSiblings(empty);
    expect(out).toBe(empty);
  });
});

/* ---------------------------------------------------------------------------
 * (c) repopulateSiblings — fail-safe
 * --------------------------------------------------------------------------- */

describe('repopulateSiblings — fail-safe', () => {
  it('returns the emit set UNCHANGED (same reference) when the fetch throws', async () => {
    const emit: RetrievalCandidate[] = [
      emitCandidate('0207.14.10', '0207.14', 0.95),
      emitCandidate('0207.12.10', '0207.12', 0.81),
    ];
    _setQueryRunnerForTesting(throwingRunner());

    const out = await repopulateSiblings(emit);
    // Same reference + unchanged contents: a pure, fail-safe no-op.
    expect(out).toBe(emit);
    expect(out.map((c) => c.code)).toEqual(['0207.14.10', '0207.12.10']);
    expect(out[0].rerank_score).toBe(0.95);
  });
});

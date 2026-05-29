/**
 * Unit tests for the SIBLING-ASK pin-check `isAttributePinnedByQuery`.
 *
 * Spec: backend/docs/plans/2026-05-29-sibling-ask-lever-blueprint.md (Phase A).
 * Run: cd backend && npx vitest run src/classifier-v2/lib/sibling-ask-trigger.test.ts
 */
import { describe, it, expect } from 'vitest';
import { isAttributePinnedByQuery, computeSiblingRerankMargin } from './sibling-ask-trigger';
import type { RetrievalCandidate, TriageExtractedAttributes } from '../types';

/* ---------------------------------------------------------------------------
 * Fixture builder — a fully-null attribute bundle with overrides.
 * --------------------------------------------------------------------------- */

function mkAttrs(over: Partial<TriageExtractedAttributes> = {}): TriageExtractedAttributes {
  return {
    material:                    null,
    material_confidence:         null,
    form:                        null,
    form_confidence:             null,
    function:                    null,
    function_confidence:         null,
    intended_use:                null,
    intended_use_confidence:     null,
    processing_state:            null,
    processing_state_confidence: null,
    composition:                 null,
    composition_confidence:      null,
    head_nouns_for_fts:          ['seal'],
    raw_tokens:                  [],
    ...over,
  };
}

describe('isAttributePinnedByQuery — rule (1) null/empty → NOT pinned', () => {
  it('null extracted value is not pinned', () => {
    expect(isAttributePinnedByQuery('material', mkAttrs({ material: null }), ['steel'])).toBe(false);
  });

  it('empty-string extracted value is not pinned', () => {
    expect(isAttributePinnedByQuery('material', mkAttrs({ material: '' }), ['steel'])).toBe(false);
  });

  it('whitespace-only extracted value is not pinned', () => {
    expect(isAttributePinnedByQuery('form', mkAttrs({ form: '   ' }), ['form'])).toBe(false);
  });
});

describe('isAttributePinnedByQuery — rule (2) bare generic → NOT pinned', () => {
  it('a bare generic material ("metal") is not pinned even if the user said "metal"', () => {
    expect(isAttributePinnedByQuery('material', mkAttrs({ material: 'metal' }), ['metal', 'part'])).toBe(false);
  });

  it('a bare generic material ("plastic") is not pinned', () => {
    expect(isAttributePinnedByQuery('material', mkAttrs({ material: 'plastic' }), ['plastic', 'thing'])).toBe(false);
  });

  it('a bare generic material ("rubber") is not pinned', () => {
    expect(isAttributePinnedByQuery('material', mkAttrs({ material: 'rubber' }), ['rubber', 'seal'])).toBe(false);
  });
});

describe('isAttributePinnedByQuery — rule (3) specific-but-inferred (no token overlap) → NOT pinned', () => {
  it('a specific value the user did NOT type (inferred from context) is not pinned', () => {
    // User typed "oil seal for engine"; L1 inferred material="nitrile rubber"
    // (NBR) from world knowledge — none of those words appear in the query.
    const attrs = mkAttrs({ material: 'nitrile rubber' });
    expect(isAttributePinnedByQuery('material', attrs, ['oil', 'seal', 'for', 'engine'])).toBe(false);
  });

  it('a specific intended_use the user did not type is not pinned', () => {
    const attrs = mkAttrs({ intended_use: 'passenger-car' });
    expect(isAttributePinnedByQuery('intended_use', attrs, ['tyre', 'rubber'])).toBe(false);
  });

  it('overlap ONLY on a bare-generic word does not count as pinned', () => {
    // value "metal bracket" overlaps the query only via "metal" (bare generic);
    // "bracket" is the head-noun, not the discriminating attribute word.
    const attrs = mkAttrs({ material: 'galvanized steel' });
    // raw token "metal" is bare-generic → ignored; no real overlap with the value.
    expect(isAttributePinnedByQuery('material', attrs, ['metal', 'bracket'])).toBe(false);
  });

  it('empty rawTokens → never pinned (no evidence of what the user said)', () => {
    const attrs = mkAttrs({ material: 'stainless steel' });
    expect(isAttributePinnedByQuery('material', attrs, [])).toBe(false);
  });
});

describe('isAttributePinnedByQuery — rule (4) specific + token overlap → pinned', () => {
  it('a specific single-word material the user typed is pinned', () => {
    const attrs = mkAttrs({ material: 'steel' });
    expect(isAttributePinnedByQuery('material', attrs, ['steel', 'bolt'])).toBe(true);
  });

  it('a multi-word material with a shared significant word is pinned', () => {
    const attrs = mkAttrs({ material: 'stainless steel' });
    // overlap on "stainless" (and "steel") — both significant.
    expect(isAttributePinnedByQuery('material', attrs, ['stainless', 'hex', 'bolt'])).toBe(true);
  });

  it('overlap is case-insensitive and punctuation-insensitive', () => {
    const attrs = mkAttrs({ material: 'Stainless-Steel' });
    expect(isAttributePinnedByQuery('material', attrs, ['STAINLESS', 'steel'])).toBe(true);
  });

  it('a specific form the user typed is pinned', () => {
    const attrs = mkAttrs({ form: 'hex bolt' });
    expect(isAttributePinnedByQuery('form', attrs, ['hex', 'bolts', 'm10'])).toBe(true);
  });

  it('intended_use pinned when the host word appears in the query', () => {
    const attrs = mkAttrs({ intended_use: 'truck' });
    expect(isAttributePinnedByQuery('intended_use', attrs, ['tyre', 'for', 'truck'])).toBe(true);
  });
});

describe('isAttributePinnedByQuery — edge / escape cases (never throws)', () => {
  it('tolerates a non-array rawTokens (defensive) → not pinned', () => {
    const attrs = mkAttrs({ material: 'steel' });
    // @ts-expect-error — exercising the defensive runtime guard.
    expect(isAttributePinnedByQuery('material', attrs, null)).toBe(false);
  });

  it('checks the correct field per attributeKey (composition)', () => {
    const attrs = mkAttrs({ composition: '70% cotton 30% polyester', material: 'cotton' });
    // The composition value overlaps on "cotton"/"polyester" → pinned for composition.
    expect(isAttributePinnedByQuery('composition', attrs, ['cotton', 'polyester', 'blend'])).toBe(true);
  });

  it('a pinned material does not bleed into an unset (null) attribute', () => {
    const attrs = mkAttrs({ material: 'steel' });
    expect(isAttributePinnedByQuery('form', attrs, ['steel', 'bolt'])).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * computeSiblingRerankMargin — the reranker-margin uncertainty signal.
 *
 * A small top-2 margin between SAME-SUBHEADING siblings of the selected leaf
 * means the reranker could not separate them ⇒ genuinely confusable ⇒
 * ask-eligible. Only siblings whose 6-digit subheading equals the selected
 * subheading AND that carry a non-null rerank_score participate.
 * --------------------------------------------------------------------------- */

/**
 * Build a `RetrievalCandidate`. `subheading` is overridable so a candidate can
 * be placed in (or out of) the selected sibling group independently of its code
 * prefix; when omitted it falls back to `code.slice(0,7)` (the real parent
 * chain). `rerank` may be null to model a candidate that was never reranked.
 */
function mkRC(
  code: string,
  rerank: number | null,
  subheading: string | null = code.slice(0, 7),
): RetrievalCandidate {
  return {
    code,
    level: 'tariff_line',
    cosine_score: 0.8,
    fts_rank: 0.5,
    rerank_score: rerank,
    parent_chain: {
      chapter: code.slice(0, 2),
      heading: code.slice(0, 4),
      subheading,
      tariff_line: code,
    },
  } as RetrievalCandidate;
}

describe('computeSiblingRerankMargin', () => {
  it('returns the top-2 margin and codes for ≥2 same-subheading siblings', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.15.10', 0.62),
    ];
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, '7318.15');
    expect(margin).toBeCloseTo(0.28, 10);
    expect(topCodes).toEqual(['7318.15.00', '7318.15.10']);
  });

  it('orders by rerank_score DESC regardless of input order', () => {
    const candidates = [
      mkRC('7318.15.10', 0.40),
      mkRC('7318.15.00', 0.95),
      mkRC('7318.15.90', 0.80),
    ];
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, '7318.15');
    // top1=0.95 (…00), top2=0.80 (…90); margin = 0.15.
    expect(margin).toBeCloseTo(0.15, 10);
    expect(topCodes).toEqual(['7318.15.00', '7318.15.90']);
  });

  it('returns margin 0 for an exact tie (the most confusable case)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.77),
      mkRC('7318.15.10', 0.77),
    ];
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, '7318.15');
    expect(margin).toBe(0);
    expect(topCodes).toEqual(['7318.15.00', '7318.15.10']);
  });

  it('returns {null,null} when only ONE sibling remains in the group', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.16.00', 0.62), // different subheading → filtered out
    ];
    expect(computeSiblingRerankMargin(candidates, '7318.15')).toEqual({
      margin: null,
      topCodes: null,
    });
  });

  it('excludes candidates whose rerank_score is null (FTS-only hits)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.15.10', null), // never reranked → excluded → <2 remain
    ];
    expect(computeSiblingRerankMargin(candidates, '7318.15')).toEqual({
      margin: null,
      topCodes: null,
    });
  });

  it('counts only same-subheading siblings; off-subheading candidates do not contribute', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.15.10', 0.85),
      mkRC('7318.16.00', 0.10), // different subheading: must NOT become top2
      mkRC('7320.10.00', 0.05),
    ];
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, '7318.15');
    // Only the two 7318.15.* survive → margin 0.05 between them.
    expect(margin).toBeCloseTo(0.05, 10);
    expect(topCodes).toEqual(['7318.15.00', '7318.15.10']);
  });

  it('falls back to code.slice(0,7) when parent_chain.subheading is empty', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90, null), // no parent subheading → derive from code
      mkRC('7318.15.10', 0.70, ''),   // empty string → derive from code
    ];
    const { margin, topCodes } = computeSiblingRerankMargin(candidates, '7318.15');
    expect(margin).toBeCloseTo(0.20, 10);
    expect(topCodes).toEqual(['7318.15.00', '7318.15.10']);
  });

  it('returns {null,null} for an empty candidate list', () => {
    expect(computeSiblingRerankMargin([], '7318.15')).toEqual({
      margin: null,
      topCodes: null,
    });
  });
});

/**
 * Unit tests for the SIBLING-ASK pin-check `isAttributePinnedByQuery`.
 *
 * Spec: backend/docs/plans/2026-05-29-sibling-ask-lever-blueprint.md (Phase A).
 * Run: cd backend && npx vitest run src/classifier-v2/lib/sibling-ask-trigger.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  isAttributePinnedByQuery,
  computeSiblingRerankMargin,
  evaluateCalibratedClassify,
} from './sibling-ask-trigger';
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

/* ---------------------------------------------------------------------------
 * evaluateCalibratedClassify — the MIRROR of the sibling-ASK lever.
 *
 * Fires (gate A ∧ gate B) when the L3 survivors concentrate into ONE subheading
 * AND the top-2 rerank margin within it is dominant (≥ opts.margin). The OPPOSITE
 * polarity of computeSiblingRerankMargin's small-margin ask signal.
 * --------------------------------------------------------------------------- */

const CC_OPTS = { margin: 0.15, strongMargin: 0.3 };

describe('evaluateCalibratedClassify — gate A (concentration)', () => {
  it('fires when 1 subheading + a dominant margin (≥0.15)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.95),
      mkRC('7318.15.10', 0.70),
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(true);
    expect(d.subheading).toBe('7318.15');
    expect(d.topCode).toBe('7318.15.00');
    expect(d.marginVal).toBeCloseTo(0.25, 10);
  });

  it('does NOT fire when ≥2 distinct subheadings survive (concentration fails)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.95),
      mkRC('7318.16.00', 0.30), // different subheading
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(false);
    expect(d.reason).toContain('concentration_fail');
  });

  it('uses parent_chain.subheading for concentration (not just code prefix)', () => {
    // Both candidates carry the SAME explicit parent subheading even though their
    // code prefixes differ — gate A must group by parent_chain.subheading first.
    const candidates = [
      mkRC('7318.15.00', 0.95, '7318.15'),
      mkRC('7318.15.10', 0.70, '7318.15'),
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(true);
    expect(d.subheading).toBe('7318.15');
  });
});

describe('evaluateCalibratedClassify — gate B (dominant margin)', () => {
  it('does NOT fire when the margin is below opts.margin (0.10 < 0.15)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.15.10', 0.80), // margin 0.10 < 0.15
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(false);
    expect(d.reason).toContain('dominant_margin_fail');
  });

  it('fires at the inclusive threshold (margin === opts.margin, m >= margin)', () => {
    // Use a tie to get an EXACT margin of 0 (no float error), then set the
    // threshold to 0 so the boundary `m >= margin` is exercised cleanly inclusive.
    const candidates = [
      mkRC('7318.15.00', 0.80),
      mkRC('7318.15.10', 0.80), // exact tie → margin 0
    ];
    const d = evaluateCalibratedClassify(candidates, { margin: 0, strongMargin: 0.3 });
    expect(d.fire).toBe(true);
    expect(d.marginVal).toBe(0);
  });

  it('flags strong=true when the margin ≥ opts.strongMargin (0.40 ≥ 0.30)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.95),
      mkRC('7318.15.10', 0.55), // margin 0.40 ≥ 0.30
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(true);
    expect(d.strong).toBe(true);
    expect(d.reason).toContain('strong_margin');
  });

  it('strong=false for a dominant-but-not-strong margin (0.15 ≤ m < 0.30)', () => {
    const candidates = [
      mkRC('7318.15.00', 0.95),
      mkRC('7318.15.10', 0.75), // margin 0.20 — dominant, not strong
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(true);
    expect(d.strong).toBe(false);
    expect(d.reason).toContain('dominant_margin');
  });
});

describe('evaluateCalibratedClassify — single-survivor null-margin path', () => {
  it('fires trivially when exactly ONE candidate (null margin), strong=false', () => {
    const candidates = [mkRC('7318.15.00', null)];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(true);
    expect(d.subheading).toBe('7318.15');
    expect(d.topCode).toBe('7318.15.00');
    expect(d.marginVal).toBeNull();
    // Not measurably dominant → must go through the orchestrator's verbatim half.
    expect(d.strong).toBe(false);
    expect(d.reason).toBe('single_survivor_null_margin');
  });

  it('fires for a single candidate even with a non-null rerank_score', () => {
    const candidates = [mkRC('7318.15.00', 0.91)];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    // computeSiblingRerankMargin needs ≥2 siblings → null → single-survivor path.
    expect(d.fire).toBe(true);
    expect(d.marginVal).toBeNull();
    expect(d.strong).toBe(false);
  });

  it('does NOT fire when the margin is null but >1 candidate (e.g. one rerank null)', () => {
    // Two same-subheading candidates but only one carries a rerank_score → margin
    // null AND length>1 → cannot assert dominance → no fire.
    const candidates = [
      mkRC('7318.15.00', 0.90),
      mkRC('7318.15.10', null),
    ];
    const d = evaluateCalibratedClassify(candidates, CC_OPTS);
    expect(d.fire).toBe(false);
    expect(d.reason).toContain('null_margin_multi');
  });
});

describe('evaluateCalibratedClassify — edge cases (never throws)', () => {
  it('does NOT fire on an empty candidate list', () => {
    expect(evaluateCalibratedClassify([], CC_OPTS).fire).toBe(false);
  });

  it('tolerates a non-array candidates input (defensive)', () => {
    // @ts-expect-error — exercising the runtime guard.
    expect(evaluateCalibratedClassify(null, CC_OPTS).fire).toBe(false);
  });

  it('does NOT fire when the only subheading is unresolvable', () => {
    // A candidate with no parent subheading and a too-short code → '' bucket.
    const broken: RetrievalCandidate = {
      ...mkRC('7318.15.00', 0.9, null),
      code: '73',
    } as RetrievalCandidate;
    const d = evaluateCalibratedClassify([broken], CC_OPTS);
    expect(d.fire).toBe(false);
  });
});

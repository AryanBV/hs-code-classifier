/**
 * Unit tests for the SIBLING-ASK pin-check `isAttributePinnedByQuery`.
 *
 * Spec: backend/docs/plans/2026-05-29-sibling-ask-lever-blueprint.md (Phase A).
 * Run: cd backend && npx vitest run src/classifier-v2/lib/sibling-ask-trigger.test.ts
 */
import { describe, it, expect } from 'vitest';
import { isAttributePinnedByQuery } from './sibling-ask-trigger';
import type { TriageExtractedAttributes } from '../types';

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

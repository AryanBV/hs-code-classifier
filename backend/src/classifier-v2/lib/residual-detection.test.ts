/**
 * Tests for the shared residual / catch-all detector (Stage 3c).
 *
 * The whole point of this util is the word-boundary FIX: the original O7 detector
 * used an unanchored `n\.?e\.?s` that collapsed to the bare substring "nes" and
 * false-matched it inside ordinary words ("sardiNES", "magNESium", "marine
 * engiNES"), wrongly flagging real named products as residual. These tests pin the
 * genuine-residual positives AND the substring false-positive negatives, so the bug
 * can never silently regress.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/residual-detection.test.ts
 */
import { describe, it, expect } from 'vitest';
import { isResidualDescription, RESIDUAL_RE } from './residual-detection';

describe('isResidualDescription — genuine residuals (positive)', () => {
  const positives = [
    'Other',
    'Others',
    'other', // case-insensitive
    ': Other',
    ':  Other', // ":" + whitespace
    '-- Other',
    '--- Other',
    '----  Other', // dash-run + whitespace
    'foo n.e.s.', // dotted abbreviation as a whole token
    'parts n.e.s', // no trailing dot
    'preparations n.e.i.', // not-elsewhere-INCLUDED (O7 original silently missed this)
    'articles not elsewhere specified',
    'goods not elsewhere included',
    'machinery not specified',
    '   Other   ', // surrounding whitespace is trimmed
  ];
  for (const d of positives) {
    it(`flags residual: ${JSON.stringify(d)}`, () => {
      expect(isResidualDescription(d)).toBe(true);
    });
  }
});

describe('isResidualDescription — substring false-positives the bug produced (negative)', () => {
  // These are the exact families that the unanchored "nes" substring wrongly flagged
  // as residual in the buggy O7 run (1604.13 / 2816.10 / 8408.10 / 8807.30 / 7217.x).
  const negatives = [
    'Sardines, sardinella and brisling or sprats', // 1604.13 — "sardiNES"
    'Sardines',
    'Magnesium hydroxide', // 2816.10 — "magNESium"
    'Magnesium oxide',
    'Marine propulsion engines', // 8408.10 — "engiNES" + "mariNE"
    'Internal combustion piston engines',
    'Parts of aeroplanes or helicopters', // 8807.30 family
    'Wire of stainless steel', // 7217.x — "wire"... ensure no spurious match
    'Lines and cordage', // "liNES"
    'Wines of fresh grapes', // "wiNES"
    'Brotherhood textile association goods', // "brOTHERhood" must not match "other"
    'Mother-of-pearl, worked', // "mOTHER" must not match "other"
    'Leather of other bovine animals, tanned', // "other" mid-sentence, not a trailing catch-all
    'Other than fresh', // "other than X" — a qualified phrase, not a bare catch-all
    'Other than of cotton',
    'Footwear with outer soles of rubber', // "outer" contains "ote"... sanity
    '', // empty
    '   ', // whitespace only
  ];
  for (const d of negatives) {
    it(`does NOT flag: ${JSON.stringify(d)}`, () => {
      expect(isResidualDescription(d)).toBe(false);
    });
  }
});

describe('isResidualDescription — null/garbage safety', () => {
  it('never throws on null / undefined', () => {
    expect(isResidualDescription(null)).toBe(false);
    expect(isResidualDescription(undefined)).toBe(false);
  });
});

describe('RESIDUAL_RE — shape', () => {
  it('is a case-insensitive RegExp', () => {
    expect(RESIDUAL_RE).toBeInstanceOf(RegExp);
    expect(RESIDUAL_RE.flags).toContain('i');
  });
});

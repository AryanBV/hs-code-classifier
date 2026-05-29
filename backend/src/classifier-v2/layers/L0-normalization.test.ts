/**
 * Unit tests for Layer 0 Input Normalization.
 *
 * Framework: vitest (per backend/package.json "test": "vitest run").
 *
 * Run:
 *   cd backend && npx vitest run --dir .
 * (the project vitest.config.ts auto-discovers src/classifier-v2/**\/*.test.ts)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the entire `fs` module BEFORE any other import that may transitively
// resolve it. We provide stubs for `existsSync` and `readFileSync` only — the
// L0 module only consumes those two. Other usages of `fs` in tests fall back
// to vi.importActual.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn((p: import('fs').PathLike) => actual.existsSync(p)),
    readFileSync: vi.fn((p: import('fs').PathOrFileDescriptor, opts?: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (actual.readFileSync as any)(p, opts),
    ),
  };
});

import * as fs from 'fs';
import {
  _clearAliasCacheForTesting,
  _getAliasMapPathForTesting,
  _sanitizeNoiseForTesting,
  normalize,
} from './L0-normalization';

/**
 * Configure the mocked fs to respond to alias map reads with the given content.
 * Pass `null` to simulate file-absent; a `Record<string,string>` to simulate
 * a valid JSON alias map; a `string` to simulate raw (possibly malformed) JSON.
 */
function mockAliasMap(content: Record<string, string> | string | null): void {
  const aliasPath = _getAliasMapPathForTesting();
  const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
  const readFileSyncMock = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

  existsSyncMock.mockImplementation((p: import('fs').PathLike) => {
    if (p === aliasPath) return content !== null;
    return false;
  });

  if (content !== null) {
    const payload = typeof content === 'string' ? content : JSON.stringify(content);
    readFileSyncMock.mockImplementation((p: import('fs').PathOrFileDescriptor) => {
      if (p === aliasPath) return payload;
      throw new Error(`Unexpected readFileSync in test: ${String(p)}`);
    });
  }
}

beforeEach(() => {
  _clearAliasCacheForTesting();
});

afterEach(() => {
  vi.clearAllMocks();
  _clearAliasCacheForTesting();
});

describe('L0 normalize — empty / edge inputs', () => {
  it('returns empty result for empty string', async () => {
    mockAliasMap(null);
    const out = await normalize('');
    expect(out.normalized_query).toBe('');
    expect(out.raw_tokens).toEqual([]);
    expect(out.composite_flag).toBe(false);
    expect(out.aliases_applied).toEqual([]);
  });

  it('returns empty result for whitespace-only string', async () => {
    mockAliasMap(null);
    const out = await normalize('   \t\n  ');
    expect(out.normalized_query).toBe('');
    expect(out.raw_tokens).toEqual([]);
    expect(out.composite_flag).toBe(false);
    expect(out.aliases_applied).toEqual([]);
  });

  it('handles single-token query', async () => {
    mockAliasMap(null);
    const out = await normalize('bolts');
    expect(out.normalized_query).toBe('bolts');
    expect(out.raw_tokens).toEqual(['bolts']);
    expect(out.composite_flag).toBe(false);
  });

  it('returns empty tokens when query is all stopwords', async () => {
    mockAliasMap(null);
    const out = await normalize('a of the');
    expect(out.raw_tokens).toEqual([]);
    expect(out.composite_flag).toBe(false);
  });

  it('filters tokens shorter than 2 chars', async () => {
    mockAliasMap(null);
    const out = await normalize('a b cd ef g');
    expect(out.raw_tokens).toEqual(['cd', 'ef']);
  });
});

describe('L0 normalize — multi-token + stopword filtering', () => {
  it('tokenizes multi-word query and lowercases tokens', async () => {
    mockAliasMap(null);
    const out = await normalize('Stainless Steel Hex Bolts');
    expect(out.raw_tokens).toEqual(['stainless', 'steel', 'hex', 'bolts']);
  });

  it('filters stopwords (a, an, the, of, for) but keeps composite signals', async () => {
    mockAliasMap(null);
    const out = await normalize('a bolt and a nut for the car');
    expect(out.raw_tokens).toEqual(['bolt', 'and', 'nut', 'car']);
  });

  it('splits on punctuation', async () => {
    mockAliasMap(null);
    const out = await normalize('bolts, nuts; washers!');
    expect(out.raw_tokens).toEqual(['bolts', 'nuts', 'washers']);
  });
});

describe('L0 normalize — composite_flag positive cases', () => {
  const cases: Array<[string, string]> = [
    ['and',          'bolts and nuts'],
    ['with',         'pen with cap'],
    ['set',          'screwdriver set'],
    ['kit',          'first aid kit'],
    ['combo',        'shampoo combo pack'],
    ['plus',         'phone plus charger'],
    ['including',   'kit including manual'],
    ['&',            'pen & pencil'],
    ['+',            'phone+charger'],
    ['inclusive of','manual inclusive of warranty card'],
    ['along with',  'phone along with case'],
  ];
  for (const [signal, query] of cases) {
    it(`flags composite when query contains '${signal}'`, async () => {
      mockAliasMap(null);
      const out = await normalize(query);
      expect(out.composite_flag).toBe(true);
    });
  }
});

describe('L0 normalize — composite_flag negative case', () => {
  it('does not flag composite for a simple single-product query', async () => {
    mockAliasMap(null);
    const out = await normalize('stainless steel hex bolt M10');
    expect(out.composite_flag).toBe(false);
  });
});

describe('L0 normalize — alias substitution', () => {
  it('substitutes a simple alias (file present)', async () => {
    mockAliasMap({ 'channa dal': 'chickpea split' });
    const out = await normalize('channa dal 1kg pack');
    expect(out.normalized_query).toContain('chickpea split');
    expect(out.aliases_applied).toEqual([
      { alias: 'channa dal', replaced_with: 'chickpea split' },
    ]);
  });

  it('no-op when alias map file is absent', async () => {
    mockAliasMap(null);
    const out = await normalize('channa dal 1kg pack');
    expect(out.normalized_query).toBe('channa dal 1kg pack');
    expect(out.aliases_applied).toEqual([]);
  });

  it('handles alias with regex metacharacters (M.S.)', async () => {
    mockAliasMap({ 'M.S.': 'mild steel' });
    const out = await normalize('M.S. plate 5mm');
    expect(out.normalized_query).toContain('mild steel');
    expect(out.normalized_query).not.toContain('M.S.');
    expect(out.aliases_applied).toEqual([
      { alias: 'M.S.', replaced_with: 'mild steel' },
    ]);
  });

  it('does NOT match partial-word occurrences of an alias', async () => {
    mockAliasMap({ 'dal': 'lentil' });
    // 'dale' should not be substituted.
    const out = await normalize('dale carnegie book');
    expect(out.normalized_query).toBe('dale carnegie book');
    expect(out.aliases_applied).toEqual([]);
  });

  it('preserves casing — Title-Case alias yields Title-Case replacement', async () => {
    mockAliasMap({ 'm.s.': 'mild steel' });
    // alias is lowercase in the map; match it as Title-Case in input.
    const out = await normalize('M.s. plate');
    expect(out.normalized_query).toMatch(/^Mild steel/);
  });

  it('preserves casing — ALL-CAPS alias match yields ALL-CAPS replacement', async () => {
    mockAliasMap({ 'mild steel': 'low carbon steel' });
    const out = await normalize('MILD STEEL bar 12mm');
    expect(out.normalized_query).toContain('LOW CARBON STEEL');
  });

  it('treats malformed JSON as empty map (no throw)', async () => {
    mockAliasMap('{ this is not valid json');
    // Silence the warn that our loader emits.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await normalize('channa dal 1kg');
    expect(out.normalized_query).toBe('channa dal 1kg');
    expect(out.aliases_applied).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('case-insensitive alias matching', async () => {
    mockAliasMap({ 'channa dal': 'chickpea split' });
    const out = await normalize('CHANNA DAL bulk 50kg');
    expect(out.normalized_query.toLowerCase()).toContain('chickpea split');
    expect(out.aliases_applied.length).toBe(1);
  });

  it('longer alias wins over shorter sub-alias', async () => {
    mockAliasMap({
      'dal': 'lentil',
      'channa dal': 'chickpea split',
    });
    const out = await normalize('channa dal 1kg');
    // 'channa dal' (longer) must match first; 'dal' must NOT then re-substitute.
    expect(out.normalized_query).toContain('chickpea split');
    expect(out.normalized_query).not.toContain('lentil');
    // 'dal' as a standalone token does not occur in the post-substitution text
    // (since 'channa dal' was consumed), so only one alias should be applied.
    expect(out.aliases_applied.map((a) => a.alias)).toEqual(['channa dal']);
  });
});

describe('L0 normalize — noise sanitization (Round 1 routing calibration)', () => {
  // --- Leading intent phrases ---------------------------------------------
  const leadingIntentCases: Array<[string, string]> = [
    ['I need to export ',        'I need to export stainless steel hex bolts'],
    ['I want to export ',        'I want to export woven dress shirts'],
    ['Looking to export ',       'Looking to export galvanized steel sheet coils'],
    ['Please classify ',         'Please classify rubber oil seals for engines'],
    ['What is the hs code for ', 'What is the hs code for muslin of carded yarn'],
    ['What is the HS code for ', 'What is the HS code for furnishing fabrics'],
    ['Can you classify ',        'Can you classify cotton knitted t-shirts'],
  ];
  for (const [phrase, query] of leadingIntentCases) {
    it(`strips leading intent phrase "${phrase.trim()}"`, async () => {
      mockAliasMap(null);
      const out = await normalize(query);
      // The intent verb should be gone; the product head-noun must survive.
      expect(out.normalized_query.toLowerCase()).not.toContain('export');
      expect(out.normalized_query.toLowerCase()).not.toContain('classify');
      expect(out.normalized_query.toLowerCase()).not.toContain('hs code');
    });
  }

  it('preserves the product description after stripping a leading intent phrase', async () => {
    mockAliasMap(null);
    const out = await normalize('I need to export stainless steel hex bolts');
    expect(out.normalized_query).toBe('stainless steel hex bolts');
    expect(out.raw_tokens).toEqual(['stainless', 'steel', 'hex', 'bolts']);
  });

  // --- Trailing provenance -------------------------------------------------
  it('strips trailing "for export"', async () => {
    mockAliasMap(null);
    const out = await normalize('galvanized steel sheet coils for export');
    expect(out.normalized_query).toBe('galvanized steel sheet coils');
    expect(out.raw_tokens).not.toContain('export');
  });

  it('strips trailing "made in India"', async () => {
    mockAliasMap(null);
    const out = await normalize('woven dress shirt formal men made in India');
    expect(out.normalized_query).toBe('woven dress shirt formal men');
    expect(out.raw_tokens).not.toContain('india');
    expect(out.raw_tokens).not.toContain('made');
  });

  it('strips trailing "made in <country>" for an arbitrary country', async () => {
    mockAliasMap(null);
    const out = await normalize('cotton bed sheets made in Bangladesh');
    expect(out.normalized_query).toBe('cotton bed sheets');
    expect(out.raw_tokens).not.toContain('bangladesh');
  });

  it('strips trailing "origin <country>" provenance', async () => {
    mockAliasMap(null);
    const out = await normalize('stainless steel fasteners origin India');
    expect(out.normalized_query).toBe('stainless steel fasteners');
    expect(out.raw_tokens).not.toContain('origin');
    expect(out.raw_tokens).not.toContain('india');
  });

  it('strips trailing "country of origin: <country>" provenance', async () => {
    mockAliasMap(null);
    const out = await normalize('cotton bed sheets country of origin: Bangladesh');
    expect(out.normalized_query).toBe('cotton bed sheets');
    expect(out.raw_tokens).not.toContain('origin');
    expect(out.raw_tokens).not.toContain('bangladesh');
  });

  it('does NOT strip "original" as if it were "origin" (word-boundary safety, FIX 2)', async () => {
    mockAliasMap(null);
    // 'original equipment manufacturer' must survive — 'origin' must only match
    // as a whole word, never the prefix of 'original'.
    const out = await normalize('rubber seals for original equipment manufacturer');
    expect(out.normalized_query).toBe('rubber seals for original equipment manufacturer');
    expect(out.raw_tokens).toContain('original');
    expect(out.raw_tokens).toContain('equipment');
    expect(out.raw_tokens).toContain('manufacturer');
  });

  it('does NOT strip a meaningful "for <use>" that is not provenance', async () => {
    mockAliasMap(null);
    // "for automobile engines" is intended-use, not provenance — must survive.
    const out = await normalize('rubber oil seals for automobile engines');
    expect(out.normalized_query).toBe('rubber oil seals for automobile engines');
    expect(out.raw_tokens).toContain('automobile');
    expect(out.raw_tokens).toContain('engines');
  });

  // --- Pasted-tariff structural markers ------------------------------------
  it('strips a leading standalone dash bullet', async () => {
    mockAliasMap(null);
    const out = await normalize('- woven dress shirt formal men');
    expect(out.normalized_query).toBe('woven dress shirt formal men');
  });

  it('strips a leading ":" bullet', async () => {
    mockAliasMap(null);
    const out = await normalize(': furnishing fabrics');
    expect(out.normalized_query).toBe('furnishing fabrics');
  });

  it('strips a leading pasted-tariff "---" structural marker', async () => {
    mockAliasMap(null);
    const out = await normalize('--- muslin of carded yarn');
    expect(out.normalized_query).toBe('muslin of carded yarn');
  });

  it('strips a leading ":--" pasted-tariff marker', async () => {
    mockAliasMap(null);
    const out = await normalize(':-- galvanized steel sheet coils');
    expect(out.normalized_query).toBe('galvanized steel sheet coils');
  });

  it('collapses repeated dashes embedded in the query', async () => {
    mockAliasMap(null);
    const out = await normalize('woven dress shirt ---- formal men');
    // Repeated structural dashes collapse; product words survive.
    expect(out.normalized_query).not.toContain('----');
    expect(out.raw_tokens).toEqual(['woven', 'dress', 'shirt', 'formal', 'men']);
  });

  it('does NOT strip a hyphen inside a compound product word', async () => {
    mockAliasMap(null);
    // 'leaf-spring' must NOT be broken or stripped by dash-collapse.
    const out = await normalize('PU leaf-spring bushings');
    expect(out.normalized_query).toContain('leaf-spring');
  });

  // --- Combined noise ------------------------------------------------------
  it('strips leading intent AND trailing provenance together', async () => {
    mockAliasMap(null);
    const out = await normalize('I want to export galvanized steel sheet coils for export');
    expect(out.normalized_query).toBe('galvanized steel sheet coils');
  });

  it('strips intent + bullet markers + provenance together, preserving product', async () => {
    mockAliasMap(null);
    const out = await normalize('Please classify - rubber oil seals for export, made in India');
    expect(out.normalized_query.toLowerCase()).toContain('rubber oil seals');
    expect(out.normalized_query.toLowerCase()).not.toContain('classify');
    expect(out.normalized_query.toLowerCase()).not.toContain('made in india');
  });

  // --- Safety: do not over-strip ------------------------------------------
  it('leaves a clean product query untouched', async () => {
    mockAliasMap(null);
    const out = await normalize('stainless steel hex bolt M10');
    expect(out.normalized_query).toBe('stainless steel hex bolt M10');
  });

  it('does not strip "export" when it is part of the product itself', async () => {
    mockAliasMap(null);
    // 'export quality basmati rice' — 'export' here is an adjective, not a
    // leading-intent verb or trailing-provenance phrase; product survives.
    const out = await normalize('export quality basmati rice');
    expect(out.raw_tokens).toContain('basmati');
    expect(out.raw_tokens).toContain('rice');
  });

  it('returns empty when the query is ONLY noise markers', async () => {
    mockAliasMap(null);
    const out = await normalize('--- :-- ----');
    expect(out.normalized_query).toBe('');
    expect(out.raw_tokens).toEqual([]);
  });

  it('does not drop a product when intent phrase is the whole leading clause', async () => {
    mockAliasMap(null);
    const out = await normalize('looking to export furnishing fabrics');
    expect(out.normalized_query).toBe('furnishing fabrics');
  });

  // --- Colon separators (pasted-tariff column residue, Round 2) ------------
  // Dangling colons act as COLUMN SEPARATORS after provenance stripping and
  // depress completeness scoring. Strip colons ADJACENT to whitespace (or a
  // string edge); PRESERVE intra-token colons flanked by non-space on both
  // sides ('ISO:3234', '1:2', '2:1 ratio', 'URL:http').
  it('strips a colon separator with space on BOTH sides ("wheat : Seed")', async () => {
    mockAliasMap(null);
    const out = await normalize('Durum wheat : Seed');
    expect(out.normalized_query).toBe('Durum wheat Seed');
    expect(_sanitizeNoiseForTesting('Durum wheat : Seed')).toBe('Durum wheat Seed');
  });

  it('strips a colon separator with no space BEFORE but space after ("briefs: Of cotton")', async () => {
    mockAliasMap(null);
    const out = await normalize('Underpants and briefs: Of cotton');
    expect(out.normalized_query).toBe('Underpants and briefs Of cotton');
    expect(_sanitizeNoiseForTesting('Underpants and briefs: Of cotton')).toBe(
      'Underpants and briefs Of cotton',
    );
  });

  it('strips a colon separator with space on both sides ("Wafers : Communion")', async () => {
    mockAliasMap(null);
    const out = await normalize('Wafers : Communion');
    expect(out.normalized_query).toBe('Wafers Communion');
    expect(_sanitizeNoiseForTesting('Wafers : Communion')).toBe('Wafers Communion');
  });

  it('strips a trailing colon at end-of-string', async () => {
    mockAliasMap(null);
    expect(_sanitizeNoiseForTesting('furnishing fabrics :')).toBe('furnishing fabrics');
    expect(_sanitizeNoiseForTesting('woven cotton shirts:')).toBe('woven cotton shirts');
  });

  it('PRESERVES intra-token colon "ISO:3234" (no surrounding whitespace)', async () => {
    mockAliasMap(null);
    expect(_sanitizeNoiseForTesting('steel bolts ISO:3234 grade')).toBe(
      'steel bolts ISO:3234 grade',
    );
  });

  it('PRESERVES ratio colon "1:2" (no surrounding whitespace)', async () => {
    mockAliasMap(null);
    expect(_sanitizeNoiseForTesting('cement sand mix 1:2 mortar')).toBe(
      'cement sand mix 1:2 mortar',
    );
  });

  it('PRESERVES "2:1 ratio" colon (non-space on both sides of the colon)', async () => {
    mockAliasMap(null);
    expect(_sanitizeNoiseForTesting('epoxy resin 2:1 ratio kit')).toBe(
      'epoxy resin 2:1 ratio kit',
    );
  });

  it('PRESERVES "URL:http" colon (no surrounding whitespace)', async () => {
    mockAliasMap(null);
    expect(_sanitizeNoiseForTesting('product page URL:http reference')).toBe(
      'product page URL:http reference',
    );
  });
});

describe('L0 normalize — sanitization preserves alias substitution', () => {
  it('applies aliases AFTER stripping leading intent', async () => {
    mockAliasMap({ 'M.S.': 'mild steel' });
    const out = await normalize('I need to export M.S. plate 5mm');
    expect(out.normalized_query).toContain('mild steel');
    expect(out.normalized_query.toLowerCase()).not.toContain('export');
    expect(out.aliases_applied).toEqual([
      { alias: 'M.S.', replaced_with: 'mild steel' },
    ]);
  });
});

describe('L0 normalize — full audit-trail integration', () => {
  it('alias + composite + tokenize together', async () => {
    mockAliasMap({ 'M.S.': 'mild steel' });
    const out = await normalize('M.S. hex bolts and nuts');
    expect(out.normalized_query).toContain('mild steel');
    expect(out.composite_flag).toBe(true);
    expect(out.raw_tokens).toContain('and');
    expect(out.raw_tokens).toContain('bolts');
    expect(out.raw_tokens).toContain('nuts');
    expect(out.aliases_applied.length).toBeGreaterThan(0);
  });

  it('accepts previousAnswers without affecting L0 output (currently unused)', async () => {
    mockAliasMap(null);
    const out = await normalize('hex bolts', { q1: 'steel' });
    expect(out.raw_tokens).toEqual(['hex', 'bolts']);
  });
});

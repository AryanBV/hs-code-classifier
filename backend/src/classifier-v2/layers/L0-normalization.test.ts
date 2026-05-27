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

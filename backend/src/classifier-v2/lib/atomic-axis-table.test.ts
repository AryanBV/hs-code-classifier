/**
 * Tests for the O7 atomic-axis-table runtime loader (Stage S2; DARK).
 *
 * Covers: load + lookup HIT on the real committed artifact, MISS (unknown
 * subheading), and FAIL-SAFE parsing (corrupt / malformed JSON -> empty table,
 * never throws). Also asserts the hand-verified coffee 0901.11 family un-fuses its
 * single processing_state array into SEPARATE concept-axes.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/atomic-axis-table.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAtomicAxisTable,
  getAtomicAxisEntry,
  _parseAtomicAxisTableForTesting,
  _clearAtomicAxisCacheForTesting,
} from './atomic-axis-table';

describe('atomic-axis-table loader (committed atomic-axes.json)', () => {
  beforeEach(() => _clearAtomicAxisCacheForTesting());

  it('loads the table and caches across calls (same object identity)', () => {
    const a = loadAtomicAxisTable();
    const b = loadAtomicAxisTable();
    expect(a).toBe(b);
    expect(a.bySubheading.size).toBeGreaterThan(1000); // 2241 multi-leaf subs
  });

  it('HIT: coffee 0901.11 un-fuses one processing_state array into separate axes', () => {
    const e = getAtomicAxisEntry('0901.11');
    expect(e).not.toBeNull();
    // It carries a residual default (.90 "Other") so the engine must NOT ask.
    expect(e!.classification).toBe('residual_default');
    expect(e!.has_residual).toBe(true);
    expect(e!.residual_leaf_code).toBe('0901.11.90');
    // The single fused processing_state array becomes MULTIPLE named axes — NOT one
    // jumbled question. coffee_form / process_method / grade must be present.
    const axisIds = e!.axes.map((a) => a.axis);
    expect(axisIds).toContain('coffee_form');
    expect(axisIds).toContain('grade');
    // coffee_form values are the un-fused variety/form tokens, not a soup.
    const cf = e!.axes.find((a) => a.axis === 'coffee_form')!;
    expect(cf.values_present.sort()).toEqual(['cherry', 'parchment', 'plantation']);
    // Each value maps to real leaf codes.
    expect(cf.value_to_codes['plantation']).toContain('0901.11.11');
  });

  it('HIT: a residual_default sub exposes has_residual + residual_leaf_code', () => {
    const e = getAtomicAxisEntry('5208.52'); // cotton printed, has .90 Other
    expect(e).not.toBeNull();
    expect(e!.classification).toBe('residual_default');
    expect(e!.residual_leaf_code).toBe('5208.52.90');
  });

  it('MISS: an unknown / single-leaf subheading returns null (fail-safe)', () => {
    expect(getAtomicAxisEntry('9999.99')).toBeNull();
    expect(getAtomicAxisEntry('not-a-code')).toBeNull();
  });

  it('every entry has a valid classification + sane shape', () => {
    const table = loadAtomicAxisTable();
    const valid = new Set([
      'residual_default',
      'askable_no_residual',
      'single_axis_resolved',
      'untypable',
    ]);
    for (const e of table.bySubheading.values()) {
      expect(valid.has(e.classification)).toBe(true);
      expect(/^\d{4}\.\d{2}$/.test(e.subheading)).toBe(true);
      for (const ax of e.axes) {
        // A discriminating axis must offer >=2 distinct values.
        expect(ax.values_present.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('atomic-axis-table parsing (fail-safe)', () => {
  it('corrupt JSON -> empty table (never throws)', () => {
    const t = _parseAtomicAxisTableForTesting('{ not json');
    expect(t.bySubheading.size).toBe(0);
  });

  it('non-object / missing subheadings -> empty table', () => {
    expect(_parseAtomicAxisTableForTesting('[]').bySubheading.size).toBe(0);
    expect(_parseAtomicAxisTableForTesting('null').bySubheading.size).toBe(0);
    expect(_parseAtomicAxisTableForTesting('{"foo":1}').bySubheading.size).toBe(0);
  });

  it('skips malformed entries but keeps valid ones', () => {
    const json = JSON.stringify({
      subheadings: [
        { subheading: 'bad', classification: 'untypable' }, // bad code -> skipped
        { subheading: '0101.21', classification: 'not_a_class' }, // bad class -> skipped
        {
          subheading: '0101.21',
          classification: 'askable_no_residual',
          has_residual: false,
          residual_leaf_code: null,
          axes: [
            {
              axis: 'thermal',
              label: 'Fresh vs frozen',
              values_present: ['fresh_or_chilled', 'frozen'],
              value_to_codes: { fresh_or_chilled: ['0101.21.10'], frozen: ['0101.21.20'] },
            },
            { axis: 'broken' }, // malformed axis -> skipped, entry still kept
          ],
          unclassified_varying: [],
        },
      ],
    });
    const t = _parseAtomicAxisTableForTesting(json);
    expect(t.bySubheading.size).toBe(1);
    const e = t.bySubheading.get('0101.21')!;
    expect(e.classification).toBe('askable_no_residual');
    expect(e.axes).toHaveLength(1);
    expect(e.axes[0]!.axis).toBe('thermal');
  });
});

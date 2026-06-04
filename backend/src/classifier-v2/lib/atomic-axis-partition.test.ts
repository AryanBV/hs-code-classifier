/**
 * Tests for the atomic-aware partition helper (Stage S2; DARK — NOT on any live
 * path). Verifies that:
 *   - a FUSED single-array case (coffee: one processing_state array) yields
 *     SEPARATE concept-axes (variety/form, grade …), NOT one jumbled question;
 *   - a RESIDUAL sub surfaces has_residual + residual_leaf_code so the engine can
 *     decline to ask (unmarked-default-wins);
 *   - each emitted axis is MECE over the SURVIVING leaves (pruned leaves drop out,
 *     an axis that no longer splits the survivors is dropped);
 *   - unknown / single-leaf candidate sets fail safe (null entry, no axes).
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/atomic-axis-partition.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  partitionByAtomicAxis,
  dominantSubheading,
  subheadingOfCode,
} from './atomic-axis-partition';
import {
  loadAtomicAxisTable,
  _parseAtomicAxisTableForTesting,
  type AtomicAxisTable,
} from './atomic-axis-table';

/* --------------------------------------------------------------------------
 * Hand-built fixtures (no DB, no artifact dependency).
 * -------------------------------------------------------------------------- */

/** A FUSED coffee subheading: one processing_state array un-fused into 2 axes. */
function coffeeTable(): AtomicAxisTable {
  return _parseAtomicAxisTableForTesting(JSON.stringify({
    subheadings: [
      {
        subheading: '0901.11',
        heading: '0901',
        chapter: '09',
        leaf_count: 6,
        classification: 'residual_default',
        has_residual: true,
        residual_leaf_code: '0901.11.90',
        axes: [
          {
            axis: 'coffee_form',
            label: 'Coffee form (plantation / cherry / parchment)',
            values_present: ['cherry', 'parchment', 'plantation'],
            value_to_codes: {
              plantation: ['0901.11.11', '0901.11.12'],
              cherry: ['0901.11.21', '0901.11.22'],
              parchment: ['0901.11.31'],
            },
          },
          {
            axis: 'grade',
            label: 'Grade',
            values_present: ['grade_a', 'grade_ab', 'grade_b'],
            value_to_codes: {
              grade_a: ['0901.11.11'],
              grade_b: ['0901.11.12'],
              grade_ab: ['0901.11.21', '0901.11.31'],
            },
          },
        ],
        unclassified_varying: [],
      },
    ],
  }));
}

/** An ASKABLE-no-residual sub: thermal axis, no catch-all. */
function thermalTable(): AtomicAxisTable {
  return _parseAtomicAxisTableForTesting(JSON.stringify({
    subheadings: [
      {
        subheading: '0201.99',
        heading: '0201',
        chapter: '02',
        leaf_count: 2,
        classification: 'askable_no_residual',
        has_residual: false,
        residual_leaf_code: null,
        axes: [
          {
            axis: 'thermal',
            label: 'Fresh/chilled vs frozen',
            values_present: ['fresh_or_chilled', 'frozen'],
            value_to_codes: {
              fresh_or_chilled: ['0201.99.10'],
              frozen: ['0201.99.20'],
            },
          },
        ],
        unclassified_varying: [],
      },
    ],
  }));
}

describe('subheadingOfCode / dominantSubheading', () => {
  it('extracts the 6-digit subheading from an 8-digit code', () => {
    expect(subheadingOfCode('0901.11.21')).toBe('0901.11');
    expect(subheadingOfCode('0901.11')).toBe('0901.11');
    expect(subheadingOfCode('garbage')).toBe('');
  });

  it('picks the subheading carrying the most candidates (deterministic tiebreak)', () => {
    expect(dominantSubheading(['0901.11.11', '0901.11.21', '0202.10.00'])).toBe('0901.11');
    // tie -> lexically smallest subheading
    expect(dominantSubheading(['0202.10.00', '0901.11.11'])).toBe('0202.10');
    expect(dominantSubheading([])).toBe('');
  });
});

describe('partitionByAtomicAxis — fused-array un-fusing', () => {
  it('coffee: ONE processing_state array yields SEPARATE variety + grade axes', () => {
    const table = coffeeTable();
    const survivors = ['0901.11.11', '0901.11.12', '0901.11.21', '0901.11.22', '0901.11.31'];
    const res = partitionByAtomicAxis(survivors, table);

    expect(res.subheading).toBe('0901.11');
    expect(res.entry).not.toBeNull();
    // The fused array is NOT one jumbled question — there are TWO distinct axes.
    const axisIds = res.axes.map((a) => a.axis);
    expect(axisIds).toEqual(['coffee_form', 'grade']); // O7 priority order preserved
    expect(axisIds).toHaveLength(2);

    // coffee_form is MECE over the survivors, with a clean option set.
    const cf = res.axes.find((a) => a.axis === 'coffee_form')!;
    expect(cf.values_present).toEqual(['cherry', 'parchment', 'plantation']);
    // options = one per surviving value (3) + a single `other` escape hatch (4 total).
    expect(cf.options).toHaveLength(4);
    expect(cf.options.map((o) => o.id).filter((id) => id !== 'other').sort())
      .toEqual(['cherry', 'parchment', 'plantation']);
    expect(cf.options[cf.options.length - 1]!.id).toBe('other');
  });

  it('surfaces the residual so the engine can decline to ask (unmarked-default-wins)', () => {
    const res = partitionByAtomicAxis(['0901.11.11', '0901.11.21'], coffeeTable());
    expect(res.has_residual).toBe(true);
    expect(res.residual_leaf_code).toBe('0901.11.90');
  });
});

describe('partitionByAtomicAxis — survivor scoping (MECE over live set)', () => {
  it('drops an axis that no longer splits the SURVIVING leaves', () => {
    // Survivors all share coffee_form=plantation, but differ on grade -> only grade
    // should survive as a discriminating axis.
    const survivors = ['0901.11.11', '0901.11.12']; // both plantation; A vs B grade
    const res = partitionByAtomicAxis(survivors, coffeeTable());
    const axisIds = res.axes.map((a) => a.axis);
    expect(axisIds).toContain('grade');
    expect(axisIds).not.toContain('coffee_form'); // collapsed to a single value
    const grade = res.axes.find((a) => a.axis === 'grade')!;
    expect(grade.values_present.sort()).toEqual(['grade_a', 'grade_b']);
  });

  it('restricts each value bucket to surviving codes only', () => {
    const res = partitionByAtomicAxis(['0901.11.11', '0901.11.21'], coffeeTable());
    const cf = res.axes.find((a) => a.axis === 'coffee_form')!;
    // plantation bucket originally had .11 and .12; only .11 survives.
    expect(cf.partition.get('plantation')).toEqual(['0901.11.11']);
    expect(cf.partition.get('cherry')).toEqual(['0901.11.21']);
  });
});

describe('partitionByAtomicAxis — askable thermal axis', () => {
  it('emits the thermal axis with no residual', () => {
    const res = partitionByAtomicAxis(['0201.99.10', '0201.99.20'], thermalTable());
    expect(res.has_residual).toBe(false);
    expect(res.residual_leaf_code).toBeNull();
    expect(res.axes).toHaveLength(1);
    expect(res.axes[0]!.axis).toBe('thermal');
    expect(res.axes[0]!.options.map((o) => o.id).sort()).toEqual(['fresh_or_chilled', 'frozen', 'other'].sort());
  });
});

describe('partitionByAtomicAxis — fail-safe', () => {
  it('unknown subheading -> null entry, no axes', () => {
    const res = partitionByAtomicAxis(['9999.99.99', '9999.99.98'], coffeeTable());
    expect(res.entry).toBeNull();
    expect(res.axes).toHaveLength(0);
  });

  it('empty candidate set -> empty result', () => {
    const res = partitionByAtomicAxis([], coffeeTable());
    expect(res.subheading).toBe('');
    expect(res.entry).toBeNull();
    expect(res.axes).toHaveLength(0);
  });

  it('curated option labels override the default title-case', () => {
    const res = partitionByAtomicAxis(['0201.99.10', '0201.99.20'], thermalTable(), {
      thermal: { fresh_or_chilled: 'Fresh or chilled', frozen: 'Frozen' },
    });
    const opt = res.axes[0]!.options.find((o) => o.id === 'fresh_or_chilled')!;
    expect(opt.label).toBe('Fresh or chilled');
  });
});

describe('partitionByAtomicAxis — integration with the committed artifact', () => {
  it('coffee 0901.11 from the REAL table un-fuses into >=2 axes incl. grade', () => {
    const table = loadAtomicAxisTable();
    // All 0901.11 plantation+cherry+parchment leaves as survivors.
    const survivors = [
      '0901.11.11', '0901.11.12', '0901.11.13',
      '0901.11.21', '0901.11.22', '0901.11.31',
    ];
    const res = partitionByAtomicAxis(survivors, table);
    expect(res.subheading).toBe('0901.11');
    expect(res.has_residual).toBe(true);
    expect(res.axes.length).toBeGreaterThanOrEqual(2);
    expect(res.axes.map((a) => a.axis)).toContain('grade');
  });
});

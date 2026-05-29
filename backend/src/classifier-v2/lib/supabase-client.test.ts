/**
 * Unit tests for supabase-client `getTariffLineAttributesForCodes` widening.
 *
 * Uses the `_setQueryRunnerForTesting` injection hook so no live Postgres is
 * needed — we feed raw DB-shaped rows and assert the TS-side mapping:
 *   - 7 core fields always present (defaulted)
 *   - NON-NULL metadata discriminator columns attached (keyed by DB name)
 *   - NULL metadata columns OMITTED (lean record)
 *   - NUMERIC columns (arrive as pg `string`) coerced to number
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/supabase-client.test.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  _setQueryRunnerForTesting,
  getTariffLineAttributesForCodes,
  type QueryRunner,
} from './supabase-client';

/** Build a fake QueryRunner that returns a fixed row set, ignoring SQL/params. */
function fakeRunner(rows: unknown[]): QueryRunner {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
      return {
        rows:     rows as T[],
        rowCount: rows.length,
        command:  'SELECT',
        oid:      0,
        fields:   [],
      };
    },
  };
}

afterEach(() => {
  _setQueryRunnerForTesting(null);
});

describe('getTariffLineAttributesForCodes — widened metadata fetch', () => {
  it('returns {} without touching the runner for an empty code list', async () => {
    // No runner injected → if it tried to query it would throw on missing DATABASE_URL.
    const out = await getTariffLineAttributesForCodes([]);
    expect(out).toEqual({});
  });

  it('always emits the 7 core fields, defaulting null arrays to [] and components to null', async () => {
    _setQueryRunnerForTesting(fakeRunner([
      {
        code: '7318.15.00',
        material: ['steel'],
        form: null,
        function_: ['fastener'],
        intended_use: null,
        processing_state: null,
        composition: null,
        composite_components: null,
        // all metadata columns null
        fabric_construction: null, chemical_class: null, predominant_element: null,
        in_solution: null, carbon_pct: null, chromium_pct: null, nickel_pct: null,
        iron_pct: null, aluminum_pct: null, made_up: null, intended_role: null,
      },
    ]));
    const out = await getTariffLineAttributesForCodes(['7318.15.00']);
    expect(out['7318.15.00']).toEqual({
      material:             ['steel'],
      form:                 [],
      function:             ['fastener'], // legacy `function` key preserved (no underscore)
      intended_use:         [],
      processing_state:     [],
      composition:          [],
      composite_components: null,
    });
  });

  it('attaches ONLY non-null metadata columns (lean record) and coerces NUMERIC strings', async () => {
    _setQueryRunnerForTesting(fakeRunner([
      {
        code: '7208.10.10',
        material: ['steel'], form: ['coil'], function_: [], intended_use: [],
        processing_state: [], composition: [], composite_components: null,
        fabric_construction: null,           // omitted
        chemical_class: null,                // omitted
        predominant_element: 'iron',         // kept (string)
        in_solution: null,                   // omitted
        carbon_pct: '0.250',                 // pg NUMERIC arrives as string → coerced
        chromium_pct: null,                  // omitted
        nickel_pct: null,
        iron_pct: '98.5',                    // coerced
        aluminum_pct: null,
        made_up: null,
        intended_role: null,
      },
    ]));
    const out = await getTariffLineAttributesForCodes(['7208.10.10']);
    const rec = out['7208.10.10'] as Record<string, unknown>;
    // core present
    expect(rec.material).toEqual(['steel']);
    // non-null metadata kept, keyed by DB column name (for L5 predicate resolveVar)
    expect(rec.predominant_element).toBe('iron');
    expect(rec.carbon_pct).toBe(0.25);          // number, not '0.250'
    expect(rec.iron_pct).toBe(98.5);
    // null metadata omitted entirely
    expect('fabric_construction' in rec).toBe(false);
    expect('chemical_class' in rec).toBe(false);
    expect('chromium_pct' in rec).toBe(false);
    expect('made_up' in rec).toBe(false);
  });

  it('keeps boolean + enum metadata when non-null (fabric_construction / made_up / in_solution / intended_role)', async () => {
    _setQueryRunnerForTesting(fakeRunner([
      {
        code: '6109.10.00',
        material: ['cotton'], form: ['shirt'], function_: [], intended_use: [],
        processing_state: [], composition: [], composite_components: null,
        fabric_construction: 'knitted',
        chemical_class: null, predominant_element: null,
        in_solution: false,
        carbon_pct: null, chromium_pct: null, nickel_pct: null, iron_pct: null, aluminum_pct: null,
        made_up: true,
        intended_role: 'support',
      },
    ]));
    const out = await getTariffLineAttributesForCodes(['6109.10.00']);
    const rec = out['6109.10.00'] as Record<string, unknown>;
    expect(rec.fabric_construction).toBe('knitted');
    expect(rec.in_solution).toBe(false);  // false is non-null → kept
    expect(rec.made_up).toBe(true);
    expect(rec.intended_role).toBe('support');
    expect('chemical_class' in rec).toBe(false); // null → omitted
  });

  it('drops codes absent from the result set (no fabricated rows)', async () => {
    _setQueryRunnerForTesting(fakeRunner([])); // O2 not yet extracted for these codes
    const out = await getTariffLineAttributesForCodes(['9999.99.99']);
    expect(out).toEqual({});
  });
});

/**
 * Tests for the S3 askable-surface runtime loader (Stage S3; DARK).
 *
 * Covers the prompt's required cases against the REAL committed artifact:
 *   - coffee 0901.11 ASKS despite carrying a .90 residual (the refined-rule
 *     PRIMARY-residual override);
 *   - a generic-bolt-style residual_default sub (7318.15) is NOT enriched — the
 *     engine defaults to the residual and does not ask (unmarked-default-wins);
 *   - options are MECE (no leaf code appears in two options of one axis) and map to
 *     real leaves; the residual escape is honest (never a blank "Other/None");
 *   - FAIL-SAFE: a corrupt / malformed file yields an empty table (never throws),
 *     and an unknown subheading returns null.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/askable-surface-table.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAskableSurfaceTable,
  getAskableSurfaceEntry,
  _parseAskableSurfaceTableForTesting,
  _clearAskableSurfaceCacheForTesting,
} from './askable-surface-table';

describe('askable-surface-table loader (committed askable-surface.json)', () => {
  beforeEach(() => _clearAskableSurfaceCacheForTesting());

  it('loads the table and caches across calls (same object identity)', () => {
    const a = loadAskableSurfaceTable();
    const b = loadAskableSurfaceTable();
    expect(a).toBe(b);
    // The bounded enriched set (no-residual askable + PRIMARY-residual overrides),
    // after dropping axes that cannot form a leaf-disjoint (MECE) choice.
    expect(a.bySubheading.size).toBeGreaterThanOrEqual(70);
  });

  it('REFINED RULE: coffee 0901.11 ASKS despite a residual (.90) leaf', () => {
    const e = getAskableSurfaceEntry('0901.11');
    expect(e).not.toBeNull();
    expect(e!.enrichment_kind).toBe('primary_residual_override');
    // It HAS a residual, yet is recommended to ASK (this is the whole point).
    expect(e!.has_residual).toBe(true);
    expect(e!.residual_leaf_code).toBe('0901.11.90');
    expect(e!.ask_recommendation).toBe('ask');
    // The PRIMARY coffee axes are present in plain trade language.
    const axisIds = e!.axes.map((a) => a.axis);
    expect(axisIds).toContain('coffee_form');
    expect(axisIds).toContain('grade');
    expect(axisIds).toContain('process_method');
    // Every enriched axis on the override is PRIMARY (incidental axes default to
    // the residual and are NOT asked).
    expect(e!.axes.every((a) => a.is_primary)).toBe(true);
    // The form question is plain trade language (no HS jargon / no code).
    const cf = e!.axes.find((a) => a.axis === 'coffee_form')!;
    expect(cf.question.toLowerCase()).toContain('coffee bean');
    expect(cf.question).not.toMatch(/\d{4}\.\d{2}/);
    // First branch is the coarse variety axis.
    expect(cf.branch_order).toBe(1);
  });

  it('coffee options are MECE and map to REAL leaves; residual escape is honest', () => {
    const e = getAskableSurfaceEntry('0901.11')!;
    for (const ax of e.axes) {
      // MECE: no leaf code appears in two options of the same axis.
      const seen = new Set<string>();
      for (const opt of ax.options) {
        expect(opt.codes.length).toBeGreaterThanOrEqual(1);
        for (const c of opt.codes) {
          expect(/^\d{4}\.\d{2}\.\d{2}$/.test(c)).toBe(true);
          expect(seen.has(c)).toBe(false); // mutually exclusive
          seen.add(c);
        }
      }
      // Honest residual escape: present, carries the REAL leaf code, never blank.
      expect(ax.residual_escape).not.toBeNull();
      expect(ax.residual_escape!.code).toBe('0901.11.90');
      expect(ax.residual_escape!.label.trim().length).toBeGreaterThan(0);
      expect(ax.residual_escape!.label.toLowerCase()).not.toBe('other');
      expect(ax.residual_escape!.label.toLowerCase()).not.toBe('none');
    }
    // coffee_form options are the exporter-language variety labels mapping to real
    // plantation/cherry/parchment leaves.
    const cf = e.axes.find((a) => a.axis === 'coffee_form')!;
    const plantation = cf.options.find((o) => o.id === 'plantation')!;
    expect(plantation.codes).toContain('0901.11.11');
  });

  it('a generic-bolt-style residual_default sub (7318.15) does NOT ask', () => {
    // 7318.15 (the generic hex-bolt subheading -> 7318.15.00) is a residual_default
    // with only INCIDENTAL unresolved axes: it is NOT enriched, so a silent query
    // defaults to the residual and the engine never asks.
    expect(getAskableSurfaceEntry('7318.15')).toBeNull();
  });

  it('a no-residual askable sub asks and carries no residual escape', () => {
    const e = getAskableSurfaceEntry('6101.30'); // fibre split, no residual
    expect(e).not.toBeNull();
    expect(e!.enrichment_kind).toBe('no_residual');
    expect(e!.has_residual).toBe(false);
    expect(e!.ask_recommendation).toBe('ask'); // PRIMARY fiber_type axis present
    const fiber = e!.axes.find((a) => a.axis === 'fiber_type')!;
    expect(fiber.is_primary).toBe(true);
    expect(fiber.residual_escape).toBeNull();
    expect(fiber.options.length).toBeGreaterThanOrEqual(2);
  });

  it('an incidental-only no-residual sub is fallback_only with answerability flags', () => {
    const e = getAskableSurfaceEntry('8410.12'); // power-rating band only (hard)
    expect(e).not.toBeNull();
    expect(e!.enrichment_kind).toBe('no_residual');
    expect(e!.ask_recommendation).toBe('fallback_only');
    const pw = e!.axes.find((a) => a.axis === 'power_rating')!;
    expect(pw.is_primary).toBe(false);
    expect(pw.option_answerability).toBe('hard');
    expect(pw.answerability_flag).toBe(true);
  });

  it('MISS: an unknown / non-enriched subheading returns null (fail-safe)', () => {
    expect(getAskableSurfaceEntry('9999.99')).toBeNull();
    expect(getAskableSurfaceEntry('not-a-code')).toBeNull();
  });

  it('every entry has a valid kind/recommendation and >=1 usable axis', () => {
    const table = loadAskableSurfaceTable();
    for (const e of table.bySubheading.values()) {
      expect(['no_residual', 'primary_residual_override']).toContain(e.enrichment_kind);
      expect(['ask', 'fallback_only']).toContain(e.ask_recommendation);
      expect(/^\d{4}\.\d{2}$/.test(e.subheading)).toBe(true);
      expect(e.axes.length).toBeGreaterThanOrEqual(1);
      // A primary_residual_override only ever enriches PRIMARY axes.
      if (e.enrichment_kind === 'primary_residual_override') {
        expect(e.axes.every((a) => a.is_primary)).toBe(true);
        expect(e.has_residual).toBe(true);
        expect(e.ask_recommendation).toBe('ask');
      }
      for (const ax of e.axes) {
        expect(ax.options.length).toBeGreaterThanOrEqual(2); // a real choice
        // Strictly MECE: no leaf code appears in two options of the same axis, and
        // every option code belongs to this subheading.
        const seen = new Set<string>();
        for (const opt of ax.options) {
          for (const c of opt.codes) {
            expect(c.slice(0, 7)).toBe(e.subheading);
            expect(seen.has(c)).toBe(false);
            seen.add(c);
          }
        }
      }
    }
  });
});

describe('askable-surface-table parsing (fail-safe)', () => {
  it('corrupt JSON -> empty table (never throws)', () => {
    const t = _parseAskableSurfaceTableForTesting('{ not json');
    expect(t.bySubheading.size).toBe(0);
  });

  it('non-object / missing subheadings -> empty table', () => {
    expect(_parseAskableSurfaceTableForTesting('[]').bySubheading.size).toBe(0);
    expect(_parseAskableSurfaceTableForTesting('null').bySubheading.size).toBe(0);
    expect(_parseAskableSurfaceTableForTesting('{"foo":1}').bySubheading.size).toBe(0);
  });

  it('skips malformed entries / axes / options but keeps valid ones', () => {
    const json = JSON.stringify({
      subheadings: [
        { subheading: 'bad', enrichment_kind: 'no_residual', ask_recommendation: 'ask' }, // bad code
        { subheading: '0901.11', enrichment_kind: 'nope', ask_recommendation: 'ask', axes: [] }, // bad kind
        {
          subheading: '0901.11',
          enrichment_kind: 'primary_residual_override',
          ask_recommendation: 'ask',
          has_residual: true,
          residual_leaf_code: '0901.11.90',
          axes: [
            {
              axis: 'coffee_form',
              is_primary: true,
              question: 'What kind of coffee bean is it?',
              option_answerability: 'easy',
              options: [
                { id: 'plantation', label: 'Arabica Plantation', codes: ['0901.11.11'] },
                { id: 'cherry', label: 'Cherry', codes: ['0901.11.21'] },
              ],
              residual_escape: { code: '0901.11.90', label: 'Other (none of the above) [0901.11.90]' },
              branch_order: 1,
            },
            // malformed axis: only 1 option -> dropped, entry still kept.
            {
              axis: 'broken',
              question: 'x',
              options: [{ id: 'only', label: 'only', codes: ['0901.11.11'] }],
            },
            { axis: 'garbage' }, // no question/options -> dropped
          ],
        },
      ],
    });
    const t = _parseAskableSurfaceTableForTesting(json);
    expect(t.bySubheading.size).toBe(1);
    const e = t.bySubheading.get('0901.11')!;
    expect(e.enrichment_kind).toBe('primary_residual_override');
    expect(e.axes).toHaveLength(1);
    expect(e.axes[0]!.axis).toBe('coffee_form');
    expect(e.axes[0]!.options).toHaveLength(2);
  });

  it('drops an entry whose every axis is malformed (nothing to ask)', () => {
    const json = JSON.stringify({
      subheadings: [
        {
          subheading: '0901.11',
          enrichment_kind: 'no_residual',
          ask_recommendation: 'ask',
          axes: [{ axis: 'x', question: 'q', options: [{ id: 'a', label: 'A', codes: ['0901.11.11'] }] }],
        },
      ],
    });
    // single-option axis -> dropped -> entry has 0 axes -> entry dropped.
    expect(_parseAskableSurfaceTableForTesting(json).bySubheading.size).toBe(0);
  });
});

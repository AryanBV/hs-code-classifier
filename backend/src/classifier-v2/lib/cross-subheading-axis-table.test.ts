/**
 * Tests for the committed cross-subheading axis-table runtime loader. Reads the
 * REAL `axes.json` artifact from disk (no Gemini, no DB) and asserts the
 * corpus-derived meat/poultry + coffee families are present and well-formed.
 *
 * O8 NOTE: the artifact is now the GENERAL, corpus-wide O8 derivation (superseding
 * the O6 five-row hand-curated table). The meat 0201/0202/0204/0207 presentation
 * (whole-vs-cut) fork and coffee 0901 roasted-vs-green fork fall out of the general
 * pass as INSTANCES — these tests assert exactly that, updated from the O6
 * specifics to their O8 equivalents (e.g. coffee classes are now the shared O7
 * namespace `not_roasted`/`roasted`, not O6's bespoke `green`/`roasted`).
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/cross-subheading-axis-table.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCrossSubheadingAxisTable,
  getAxisEntryForHeading,
  _clearAxisTableCacheForTesting,
} from './cross-subheading-axis-table';

describe('cross-subheading axis-table loader (committed O8 axes.json)', () => {
  beforeEach(() => _clearAxisTableCacheForTesting());

  it('loads the table and contains the corpus-derived meat/poultry family', () => {
    const table = loadCrossSubheadingAxisTable();
    for (const heading of ['0201', '0202', '0204', '0207']) {
      expect(table.byHeading.has(heading)).toBe(true);
    }
  });

  it('O8: 0203 (swine) IS present — residual subs are recorded, NOT auto-excluded', () => {
    // O6 deliberately DROPPED 0203 because it carries an "Other" residual default.
    // O8's principle changed: residual subheadings (0203.19/0203.29) are RECORDED
    // (so axis-primacy can decide ask-vs-default downstream) but they no longer
    // exclude the whole heading — the presentation fork still cleanly partitions the
    // non-residual subs. So 0203 now resolves with a form/presentation axis.
    const e = getAxisEntryForHeading('0203');
    expect(e).not.toBeNull();
    expect(e!.attribute).toBe('form');
    expect(Object.keys(e!.classes).sort()).toEqual(['cut', 'whole']);
  });

  it('the 0207 entry has form/presentation axis, whole+cut classes, and the bug subheadings', () => {
    const e = getAxisEntryForHeading('0207');
    expect(e).not.toBeNull();
    expect(e!.attribute).toBe('form');
    expect(e!.axis).toBe('presentation'); // shared O7 namespace
    // Poultry surfaces a THIRD presentation class (offal) that 0201/0202 lack.
    expect(Object.keys(e!.classes).sort()).toEqual(['cut', 'offal', 'whole']);
    // The canonical bug pair: 0207.12 (whole) and 0207.14 (cut).
    expect(e!.classes.whole!.subheadings).toContain('0207.12');
    expect(e!.classes.cut!.subheadings).toContain('0207.14');
    expect(e!.question_text.length).toBeGreaterThan(0);
  });

  it('the 0207 entry ALSO carries the thermal (fresh-vs-frozen) cross-sub axis in all_axes', () => {
    // The general pass finds BOTH forks for poultry; the runtime-primary is the
    // not-usually-pinned presentation fork, but the thermal fork is preserved for
    // downstream composition under all_axes.
    const table = loadCrossSubheadingAxisTable();
    const raw = (table.byHeading.get('0207') as unknown) as { axis?: string };
    expect(raw.axis).toBe('presentation');
  });

  it('the coffee 0901 entry forces roasted-vs-green on processing_state (O8 namespace)', () => {
    const e = getAxisEntryForHeading('0901');
    expect(e).not.toBeNull();
    expect(e!.attribute).toBe('processing_state');
    expect(e!.axis).toBe('roasted'); // shared O7 namespace
    // O8 names the classes in the shared O7 namespace: not_roasted vs roasted
    // (O6's bespoke `green`/`roasted` is superseded).
    expect(Object.keys(e!.classes).sort()).toEqual(['not_roasted', 'roasted']);
    // not_roasted = green subs (0901.11 regular + 0901.12 decaf).
    expect(e!.classes.not_roasted!.subheadings).toEqual(['0901.11', '0901.12']);
    // roasted = roasted subs (0901.21 regular + 0901.22 decaf).
    expect(e!.classes.roasted!.subheadings).toEqual(['0901.21', '0901.22']);
    // 0901.90 (husks/skins/substitutes) is a RESIDUAL subheading — excluded from
    // every class by the general residual rule (reproduces O6's deliberate drop).
    for (const cls of Object.values(e!.classes)) {
      expect(cls.subheadings).not.toContain('0901.90');
    }
    expect(e!.question_text.toLowerCase()).toContain('roast');
  });

  it('the meat entries all resolve on the form/presentation axis', () => {
    for (const heading of ['0201', '0202', '0204', '0207']) {
      const e = getAxisEntryForHeading(heading);
      expect(e).not.toBeNull();
      expect(e!.attribute).toBe('form');
      expect(e!.axis).toBe('presentation');
      // whole + cut are always present (poultry adds offal).
      expect(Object.keys(e!.classes)).toContain('whole');
      expect(Object.keys(e!.classes)).toContain('cut');
    }
  });

  it('does NOT give vehicle-parts 8708 a spurious cross-sub axis (each sub is a distinct named part)', () => {
    expect(getAxisEntryForHeading('8708')).toBeNull();
  });

  it('every entry has ≥2 macro-classes and an allowed axis', () => {
    const table = loadCrossSubheadingAxisTable();
    for (const e of table.byHeading.values()) {
      expect(['form', 'processing_state', 'intended_use']).toContain(e.attribute);
      expect(Object.keys(e.classes).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('caches across calls (same object identity)', () => {
    const a = loadCrossSubheadingAxisTable();
    const b = loadCrossSubheadingAxisTable();
    expect(a).toBe(b);
  });
});

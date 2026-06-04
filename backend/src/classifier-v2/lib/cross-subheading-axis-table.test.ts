/**
 * Tests for the committed O6 axis-table runtime loader. Reads the REAL
 * `axes.json` artifact from disk (no Gemini, no DB) and asserts the corpus-derived
 * meat/poultry family is present and well-formed.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/cross-subheading-axis-table.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCrossSubheadingAxisTable,
  getAxisEntryForHeading,
  _clearAxisTableCacheForTesting,
} from './cross-subheading-axis-table';

describe('cross-subheading axis-table loader (committed axes.json)', () => {
  beforeEach(() => _clearAxisTableCacheForTesting());

  it('loads the table and contains the corpus-derived meat/poultry family', () => {
    const table = loadCrossSubheadingAxisTable();
    for (const heading of ['0201', '0202', '0204', '0207']) {
      expect(table.byHeading.has(heading)).toBe(true);
    }
  });

  it('does NOT contain 0203 (swine has a residual "Other" default — excluded by derivation)', () => {
    expect(getAxisEntryForHeading('0203')).toBeNull();
  });

  it('the 0207 entry has form axis, whole+cut classes, and the bug subheadings', () => {
    const e = getAxisEntryForHeading('0207');
    expect(e).not.toBeNull();
    expect(e!.attribute).toBe('form');
    expect(Object.keys(e!.classes).sort()).toEqual(['cut', 'whole']);
    // The canonical bug pair: 0207.12 (whole) and 0207.14 (cut).
    expect(e!.classes.whole!.subheadings).toContain('0207.12');
    expect(e!.classes.cut!.subheadings).toContain('0207.14');
    expect(e!.question_text.length).toBeGreaterThan(0);
  });

  it('S3: the coffee 0901 entry forces roasted-vs-green on processing_state', () => {
    const e = getAxisEntryForHeading('0901');
    expect(e).not.toBeNull();
    expect(e!.attribute).toBe('processing_state');
    expect(Object.keys(e!.classes).sort()).toEqual(['green', 'roasted']);
    // Green = not-roasted subs (0901.11 regular + 0901.12 decaf).
    expect(e!.classes.green!.subheadings).toEqual(['0901.11', '0901.12']);
    // Roasted = roasted subs (0901.21 regular + 0901.22 decaf).
    expect(e!.classes.roasted!.subheadings).toEqual(['0901.21', '0901.22']);
    // 0901.90 (husks/skins/substitutes) is DELIBERATELY excluded from both classes.
    for (const cls of Object.values(e!.classes)) {
      expect(cls.subheadings).not.toContain('0901.90');
    }
    expect(e!.question_text.toLowerCase()).toContain('roast');
  });

  it('S3: the meat entries are untouched by the coffee addition', () => {
    // Coffee was added ADDITIVELY; meat headings keep their form axis + classes.
    for (const heading of ['0201', '0202', '0204', '0207']) {
      const e = getAxisEntryForHeading(heading);
      expect(e).not.toBeNull();
      expect(e!.attribute).toBe('form');
      expect(Object.keys(e!.classes).sort()).toEqual(['cut', 'whole']);
    }
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

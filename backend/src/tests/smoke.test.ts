import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('Smoke Tests — Vitest Infrastructure', () => {
  it('vitest is configured and running', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('Smoke Tests — Test Data Files Exist', () => {
  const testsDir = resolve(__dirname);

  it('tests directory exists', () => {
    expect(existsSync(testsDir)).toBe(true);
  });

  it('comprehensive-test-set.json exists', () => {
    expect(existsSync(resolve(testsDir, 'test-data/comprehensive-test-set.json'))).toBe(true);
  });

  it('tier1-manual test data files exist', () => {
    const tier1Dir = resolve(testsDir, 'test-data/tier1-manual');
    for (const file of ['vehicle-parts.json', 'coffee-tea-spices.json', 'pharmaceuticals.json', 'garments.json', 'edge-cases.json']) {
      expect(existsSync(resolve(tier1Dir, file))).toBe(true);
    }
  });
});

describe('Smoke Tests — Safe Data Module Imports', () => {
  it('can import chapter-rules without side effects', async () => {
    const mod = await import('../rules/chapter-rules');
    expect(mod.CHAPTER_RULES).toBeDefined();
    expect(Array.isArray(mod.CHAPTER_RULES)).toBe(true);
    expect(mod.CHAPTER_RULES.length).toBeGreaterThan(0);
    expect(typeof mod.applyChapterRules).toBe('function');
    expect(typeof mod.getPotentialChapters).toBe('function');
  });

  it('can import confusing-chapter-pairs without side effects', async () => {
    const mod = await import('../data/confusing-chapter-pairs');
    expect(mod.CONFUSING_PAIRS).toBeDefined();
    expect(Array.isArray(mod.CONFUSING_PAIRS)).toBe(true);
    expect(mod.CONFUSING_PAIRS.length).toBeGreaterThan(0);
    expect(typeof mod.detectConfusingPair).toBe('function');
    expect(typeof mod.isConfusingPair).toBe('function');
  });

  it('can import gir-rules without side effects', async () => {
    const mod = await import('../data/gir-rules');
    expect(mod.GIR_RULES).toBeDefined();
    expect(Array.isArray(mod.GIR_RULES)).toBe(true);
    expect(mod.GIR_RULES.length).toBeGreaterThan(0);
    expect(typeof mod.getGIRRule).toBe('function');
    expect(typeof mod.getAllGIRRules).toBe('function');
    expect(typeof mod.formatGIRsForPrompt).toBe('function');
    expect(typeof mod.getGIRSummary).toBe('function');
  });
});

describe('Smoke Tests — Chapter Rules Logic', () => {
  it('vehicle parts rule routes to Ch.87', async () => {
    const { applyChapterRules } = await import('../rules/chapter-rules');
    const result = applyChapterRules({
      raw_query: 'ceramic brake pads for heavy trucks',
      material: 'ceramic',
      form: 'brake pads',
      function: 'braking',
      intended_use: 'motor vehicles',
    });
    expect(result).not.toBeNull();
    expect(result?.chapter).toBe('87');
  });

  it('instant coffee routes to Ch.21', async () => {
    const { applyChapterRules } = await import('../rules/chapter-rules');
    const result = applyChapterRules({
      raw_query: 'instant coffee powder',
      material: 'coffee',
      form: 'powder',
      processing_state: 'instant',
    });
    expect(result).not.toBeNull();
    expect(result?.chapter).toBe('21');
  });
});

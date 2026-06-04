import { describe, it, expect } from 'vitest';
import {
  divergenceStagingGroupA,
  divergenceStagingGroupB,
  divergenceStagingGroupC,
  divergenceStagingSuite,
} from './divergence-staging';
import { masterSuite } from '../test-suites/master-suite';

// ---------------------------------------------------------------------------
// STAGED gold sanity. These do NOT run the classifier or touch the DB; they only
// assert the staged corpus is well-formed AND — critically — that it is NOT
// merged into the frozen master suite (gold/eval-data changes are user-gated).
// ---------------------------------------------------------------------------

const HS8 = /^\d{4}\.\d{2}\.\d{2}$/;

describe('divergence-staging (STAGED gold — over-ask / under-ask)', () => {
  it('every case has a unique XSUB id and an 8-digit gold code', () => {
    const ids = new Set<string>();
    for (const tc of divergenceStagingSuite) {
      expect(tc.id).toMatch(/^XSUB-[ABC]\d{2}$/);
      expect(ids.has(tc.id)).toBe(false);
      ids.add(tc.id);
      expect(tc.expected_code).toBeDefined();
      expect(tc.expected_code!).toMatch(HS8);
      // The 8-digit gold must nest under its declared chapter/heading.
      if (tc.expected_chapter) expect(tc.expected_code!.slice(0, 2)).toBe(tc.expected_chapter);
      if (tc.expected_heading) expect(tc.expected_code!.replace('.', '').slice(0, 4)).toBe(tc.expected_heading);
    }
  });

  it('Group A is should-ASK silent-discriminators (with the A02 axis-pinned control)', () => {
    // ~10-12 cases, each carrying the silent axis. A02 is the in-family
    // axis-PINNED control scored as should-NOT-ask.
    expect(divergenceStagingGroupA.length).toBeGreaterThanOrEqual(10);
    for (const tc of divergenceStagingGroupA) {
      expect(tc.expected_axis).toBeDefined();
      if (tc.id === 'XSUB-A02') expect(tc.expected_routing).toBe('classify');
      else expect(tc.expected_routing).toBe('ask');
    }
  });

  it('Group B is should-NOT-ask residual/default negatives (incl. the Stage-3b over-ask traps)', () => {
    // Stage 3b expanded Group B with ~10 incidental-axis over-ask traps.
    expect(divergenceStagingGroupB.length).toBeGreaterThanOrEqual(18);
    for (const tc of divergenceStagingGroupB) {
      expect(tc.expected_routing).toBe('classify');
    }
  });

  it('Group B Stage-3b over-ask traps cover the review-named incidental axes', () => {
    const byId = new Map(divergenceStagingGroupB.map((t) => [t.id, t]));
    // Unflagged-handloom -> mill/Other default (the review-named trap), two chapters.
    expect(byId.get('XSUB-B11')!.expected_code).toBe('6204.62.90'); // women's cotton trousers
    expect(byId.get('XSUB-B12')!.expected_code).toBe('6302.21.90'); // printed cotton bed linen
    // Embellishment / special-variant (ballistic) -> residual.
    expect(byId.get('XSUB-B13')!.expected_code).toBe('6914.90.90');
    // NUMERIC-BAND case with answerability 'hard'.
    expect(byId.get('XSUB-B14')!.option_answerability).toBe('hard');
    // unmarked-default-wins across different chapters (gold codes, residual leaves).
    expect(byId.get('XSUB-B16')!.expected_code).toBe('5208.21.90');
    expect(byId.get('XSUB-B17')!.expected_code).toBe('7113.19.19');
  });

  it('Group C is a stratified cross-chapter sample with honest human-judged routing', () => {
    // ~20-30 cases drawn broadly across chapters (NOT the special-cased families).
    expect(divergenceStagingGroupC.length).toBeGreaterThanOrEqual(20);
    const chapters = new Set(divergenceStagingGroupC.map((t) => t.expected_chapter));
    // Broad chapter spread — at least ~15 distinct chapters.
    expect(chapters.size).toBeGreaterThanOrEqual(15);
    for (const tc of divergenceStagingGroupC) {
      // Every Group C case is honestly labeled classify OR ask (never reject here).
      expect(['classify', 'ask']).toContain(tc.expected_routing);
      // Conservative ruler: ask cases must document why (ambiguity) + answerability.
      if (tc.expected_routing === 'ask') {
        expect(tc.expected_ambiguity).toBeDefined();
        expect(tc.option_answerability).toBeDefined();
      }
    }
    // The sample IS mixed (not all one label) — it must carry both should-ask and
    // should-NOT-ask cases to measure over- AND under-ask corpus-wide.
    const askN = divergenceStagingGroupC.filter((t) => t.expected_routing === 'ask').length;
    const classifyN = divergenceStagingGroupC.filter((t) => t.expected_routing === 'classify').length;
    expect(askN).toBeGreaterThanOrEqual(1);
    expect(classifyN).toBeGreaterThanOrEqual(1);
  });

  it('includes the REQUIRED Group A discriminator cases', () => {
    const byId = new Map(divergenceStagingGroupA.map((t) => [t.id, t]));
    // frozen chicken whole vs cuts.
    expect(byId.get('XSUB-A01')!.query).toBe('frozen chicken');
    expect(byId.get('XSUB-A01')!.expected_code).toBe('0207.12.00');
    // green coffee beans variety/form split under 0901.11.
    const coffee = divergenceStagingGroupA.find((t) => t.query.includes('green coffee beans'))!;
    expect(coffee.expected_heading).toBe('0901');
    expect(coffee.expected_code!.replace('.', '').slice(0, 6)).toBe('090111');
    // printed cotton fabric needing weave/weight (heading 5208).
    const fabric = divergenceStagingGroupA.find((t) => t.expected_heading === '5208')!;
    expect(fabric.query).toContain('printed cotton');
    // plastic packing bag PE (3923.21.00) vs other (3923.29.x).
    const bag = divergenceStagingGroupA.find((t) => t.expected_heading === '3923')!;
    expect(bag.expected_code).toBe('3923.21.00');
  });

  it('includes the REQUIRED Group B residual-default negatives', () => {
    const byId = new Map(divergenceStagingGroupB.map((t) => [t.id, t]));
    // generic stainless steel hex bolt → 7318.15.00.
    expect(byId.get('XSUB-B06')!.expected_code).toBe('7318.15.00');
    // roasted coffee, no packing → residual under 0901.21 (0901.21.90).
    const roasted = divergenceStagingGroupB.find((t) => t.query === 'roasted coffee beans')!;
    expect(roasted.expected_code).toBe('0901.21.90');
    // generic single-axis vehicle part (heading 8708).
    const vehicle = divergenceStagingGroupB.find((t) => t.expected_heading === '8708')!;
    expect(vehicle.expected_routing).toBe('classify');
  });

  it('option_answerability is one of the human-judged labels (never auto-derived)', () => {
    for (const tc of divergenceStagingSuite) {
      if (tc.option_answerability !== undefined && tc.option_answerability !== null) {
        expect(['answerable', 'hard', 'unanswerable']).toContain(tc.option_answerability);
      }
    }
  });

  it('is NOT merged into the frozen master suite (user-gated)', () => {
    const masterIds = new Set(masterSuite.map((t) => t.id));
    for (const tc of divergenceStagingSuite) {
      expect(masterIds.has(tc.id)).toBe(false);
    }
  });
});

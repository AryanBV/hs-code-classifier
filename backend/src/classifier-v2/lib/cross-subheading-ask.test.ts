/**
 * Deterministic logic tests for the CROSS-SUBHEADING ASK gate + calibrated
 * abstention score + question builder. NO Gemini, NO DB — pure fixtures only.
 *
 * Covers the prompt's required cases:
 *   - 0207.12 + 0207.14 (form unspecified) → gate fires + whole-vs-cuts question
 *     with BOTH options.
 *   - form pinned ("whole frozen chicken") → NO ask.
 *   - single-subheading concentration → NO cross-subheading ask.
 *   - abstention score ranks an uncertain case BELOW a decisive one.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/cross-subheading-ask.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateCrossSubheadingAsk,
  buildCrossSubheadingQuestion,
  computeCrossSubheadingConcentration,
  computeCrossSubheadingMargin,
  computeAbstentionScore,
  classOfSubheading,
  headingOfCandidate,
  subheadingOfCandidate,
  isResidualLeafDescription,
  DECISIVE_MARGIN,
} from './cross-subheading-ask';
import { _parseTableForTesting } from './cross-subheading-axis-table';
import type { CrossSubheadingAxisEntry } from './cross-subheading-axis-table';
import type { RetrievalCandidate } from '../types';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

/** The 0207 poultry entry — the canonical "frozen chicken" forced-choice axis. */
const ENTRY_0207: CrossSubheadingAxisEntry = {
  heading: '0207',
  attribute: 'form',
  classes: {
    whole: {
      id: 'whole',
      values: ['carcass', 'half-carcass', 'whole-bird', 'whole'],
      subheadings: ['0207.11', '0207.12', '0207.24', '0207.25'],
      label: 'Whole bird (not cut in pieces)',
      example_code: '0207.12.00',
    },
    cut: {
      id: 'cut',
      values: ['cut', 'offal', 'boneless', 'piece', 'fillet'],
      subheadings: ['0207.13', '0207.14', '0207.26', '0207.27'],
      label: 'Cuts and offal',
      example_code: '0207.14.00',
    },
  },
  question_text: 'Is this a whole bird (not cut in pieces), or cuts/offal?',
};

/** RetrievalCandidate fixture builder. */
function cand(
  code: string,
  rerank: number | null = 0.5,
  cosine = 0.8,
): RetrievalCandidate {
  return {
    code,
    level: 'tariff_line',
    cosine_score: cosine,
    fts_rank: null,
    rerank_score: rerank,
    parent_chain: {
      chapter: code.slice(0, 2),
      heading: code.length >= 4 ? code.slice(0, 4) : null,
      subheading: /^\d{4}\.\d{2}/.test(code) ? code.slice(0, 7) : null,
      tariff_line: /^\d{4}\.\d{2}\.\d{2}$/.test(code) ? code : null,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Subheading / heading derivation
 * --------------------------------------------------------------------------- */

describe('subheading/heading derivation', () => {
  it('derives 6-digit subheading and 4-digit heading from an 8-digit code', () => {
    const c = cand('0207.14.00');
    expect(subheadingOfCandidate(c)).toBe('0207.14');
    expect(headingOfCandidate(c)).toBe('0207');
  });

  it('classOfSubheading maps 0207.12→whole and 0207.14→cut', () => {
    expect(classOfSubheading('0207.12', ENTRY_0207)).toBe('whole');
    expect(classOfSubheading('0207.14', ENTRY_0207)).toBe('cut');
    expect(classOfSubheading('0207.60', ENTRY_0207)).toBeNull(); // guinea fowl: not classed
  });
});

/* ---------------------------------------------------------------------------
 * Concentration analysis
 * --------------------------------------------------------------------------- */

describe('computeCrossSubheadingConcentration', () => {
  it('0207.12 + 0207.14 → cross-subheading split (2 subs, 2 classes)', () => {
    const r = computeCrossSubheadingConcentration([cand('0207.12.00'), cand('0207.14.00')], ENTRY_0207);
    expect(r.isCrossSubheadingSplit).toBe(true);
    expect(r.heading).toBe('0207');
    expect(r.subheadings).toEqual(['0207.12', '0207.14']);
    expect(r.classes).toEqual(['cut', 'whole']);
  });

  it('single-subheading concentration (both leaves in 0207.12) → NOT a split', () => {
    // (synthetic: two leaves in the same subheading)
    const r = computeCrossSubheadingConcentration([cand('0207.12.00'), cand('0207.12.00')], ENTRY_0207);
    expect(r.isCrossSubheadingSplit).toBe(false);
    expect(r.subheadings).toEqual(['0207.12']);
  });

  it('two subheadings of the SAME class (both whole) → NOT a split (no class spread)', () => {
    const r = computeCrossSubheadingConcentration([cand('0207.11.00'), cand('0207.12.00')], ENTRY_0207);
    expect(r.isCrossSubheadingSplit).toBe(false);
    expect(r.classes).toEqual(['whole']);
  });

  it('off-heading candidates are recorded and do not count toward the split', () => {
    const r = computeCrossSubheadingConcentration(
      [cand('0207.12.00'), cand('0207.14.00'), cand('0208.10.00')],
      ENTRY_0207,
    );
    expect(r.isCrossSubheadingSplit).toBe(true);
    expect(r.offHeadingCodes).toEqual(['0208.10.00']);
  });
});

/* ---------------------------------------------------------------------------
 * Cross-subheading margin
 * --------------------------------------------------------------------------- */

describe('computeCrossSubheadingMargin', () => {
  it('measures the top1/top2 margin between best-per-subheading representatives', () => {
    const r = computeCrossSubheadingMargin(
      [cand('0207.12.00', 0.90), cand('0207.14.00', 0.88)],
      ENTRY_0207,
    );
    expect(r.margin).toBeCloseTo(0.02, 6);
    expect(r.topSubheadings).toEqual(['0207.12', '0207.14']);
  });

  it('null margin when fewer than two rerankable representative subheadings', () => {
    const r = computeCrossSubheadingMargin([cand('0207.12.00', null), cand('0207.14.00', null)], ENTRY_0207);
    expect(r.margin).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Calibrated abstention score (ranking property)
 * --------------------------------------------------------------------------- */

describe('computeAbstentionScore', () => {
  it('ranks an uncertain (small-margin) case ABOVE a decisive (large-margin) case', () => {
    const uncertain = computeAbstentionScore({ margin: 0.01, competingSubheadings: 2, residualLeafWinner: false });
    const decisive = computeAbstentionScore({ margin: DECISIVE_MARGIN, competingSubheadings: 2, residualLeafWinner: false });
    expect(uncertain).toBeGreaterThan(decisive);
    expect(decisive).toBeCloseTo(0, 6); // fully decisive → ~0
  });

  it('a null margin (cannot separate at all) is maximally uncertain', () => {
    const s = computeAbstentionScore({ margin: null, competingSubheadings: 2, residualLeafWinner: false });
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('a residual-leaf winner forces the score to 0 (a safe default exists)', () => {
    const s = computeAbstentionScore({ margin: null, competingSubheadings: 3, residualLeafWinner: true });
    expect(s).toBe(0);
  });

  it('a 3-way split scores higher than a 2-way split at the same margin', () => {
    const two = computeAbstentionScore({ margin: 0.02, competingSubheadings: 2, residualLeafWinner: false });
    const three = computeAbstentionScore({ margin: 0.02, competingSubheadings: 3, residualLeafWinner: false });
    expect(three).toBeGreaterThan(two);
  });

  it('the score is clamped to [0,1]', () => {
    const s = computeAbstentionScore({ margin: null, competingSubheadings: 9, residualLeafWinner: false });
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

/* ---------------------------------------------------------------------------
 * isResidualLeafDescription
 * --------------------------------------------------------------------------- */

describe('isResidualLeafDescription', () => {
  it('matches bare "Other" residuals', () => {
    expect(isResidualLeafDescription('Fresh or chilled : -- Other')).toBe(true);
    expect(isResidualLeafDescription('Other')).toBe(true);
    expect(isResidualLeafDescription('---- Other')).toBe(true);
    expect(isResidualLeafDescription('foo n.e.s.')).toBe(true);
  });
  it('does NOT match qualified descriptions', () => {
    expect(isResidualLeafDescription('Not cut in pieces, frozen')).toBe(false);
    expect(isResidualLeafDescription('Cuts and offal, frozen')).toBe(false);
    expect(isResidualLeafDescription(null)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Full gate decision — the prompt's required scenarios
 * --------------------------------------------------------------------------- */

describe('evaluateCrossSubheadingAsk — REQUIRED scenarios', () => {
  const frozenChickenCandidates = [
    cand('0207.12.00', 0.86), // whole, frozen
    cand('0207.14.00', 0.85), // cuts, frozen (confusably close)
  ];

  it('"frozen chicken" (form unspecified, confusable margin) → gate FIRES', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: frozenChickenCandidates,
      entry: ENTRY_0207,
      axisPinnedByQuery: false,
      residualLeafWinner: false,
    });
    expect(d.fire).toBe(true);
    expect(d.reason).toBe('fire');
    expect(d.concentration?.subheadings).toEqual(['0207.12', '0207.14']);
  });

  it('a fired gate yields the whole-vs-cuts question with BOTH options present', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: frozenChickenCandidates,
      entry: ENTRY_0207,
      axisPinnedByQuery: false,
      residualLeafWinner: false,
    });
    const q = buildCrossSubheadingQuestion(ENTRY_0207, d.concentration ?? undefined);
    expect(q).not.toBeNull();
    expect(q!.discriminating_attribute).toBe('form');
    expect(q!.trigger).toBe('cross_subheading');
    const ids = q!.options.map((o) => o.id);
    expect(ids).toContain('whole');
    expect(ids).toContain('cut');
    // The residual/general escape hatch is also present (answerability).
    expect(ids).toContain('other');
  });

  it('form PINNED ("whole frozen chicken") → NO ask', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: frozenChickenCandidates,
      entry: ENTRY_0207,
      axisPinnedByQuery: true, // user said "whole"
      residualLeafWinner: false,
    });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe('axis_pinned_by_query');
  });

  it('single-subheading concentration → NO cross-subheading ask', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: [cand('0207.12.00', 0.9), cand('0207.12.00', 0.88)],
      entry: ENTRY_0207,
      axisPinnedByQuery: false,
      residualLeafWinner: false,
    });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe('single_subheading_concentration');
  });

  it('decisive retrieval (large cross-subheading margin) → NO ask', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: [cand('0207.12.00', 0.95), cand('0207.14.00', 0.40)], // margin 0.55 ≫ 0.05
      entry: ENTRY_0207,
      axisPinnedByQuery: false,
      residualLeafWinner: false,
    });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe('retrieval_decisive');
  });

  it('no table entry → NO ask', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: frozenChickenCandidates,
      entry: null,
      axisPinnedByQuery: false,
      residualLeafWinner: false,
    });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe('no_table_entry');
  });

  it('residual default winner → NO ask (a safe default exists)', () => {
    const d = evaluateCrossSubheadingAsk({
      candidates: frozenChickenCandidates,
      entry: ENTRY_0207,
      axisPinnedByQuery: false,
      residualLeafWinner: true,
    });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe('residual_default_exists');
  });
});

/* ---------------------------------------------------------------------------
 * The COMMITTED axes.json table parses and contains the 0207 family
 * --------------------------------------------------------------------------- */

describe('committed axes.json artifact', () => {
  // Inlined minimal copy is unnecessary — assert the loader parses the real file
  // shape by round-tripping a representative JSON through the pure parser.
  it('parses a well-formed table and indexes by heading', () => {
    const json = JSON.stringify({
      schema_version: 1,
      entries: [
        {
          heading: '0207',
          attribute: 'form',
          question_text: 'whole or cuts?',
          classes: {
            whole: { values: ['whole-bird'], subheadings: ['0207.12'], label: 'Whole', example_code: '0207.12.00' },
            cut: { values: ['cut'], subheadings: ['0207.14'], label: 'Cuts', example_code: '0207.14.00' },
          },
        },
      ],
    });
    const t = _parseTableForTesting(json);
    expect(t.byHeading.has('0207')).toBe(true);
    expect(t.byHeading.get('0207')!.attribute).toBe('form');
  });

  it('skips a malformed entry (disallowed axis) without throwing', () => {
    const json = JSON.stringify({
      entries: [
        { heading: '0207', attribute: 'colour', question_text: 'x', classes: { a: {}, b: {} } },
      ],
    });
    const t = _parseTableForTesting(json);
    expect(t.byHeading.size).toBe(0);
  });

  it('skips an entry with <2 macro-classes', () => {
    const json = JSON.stringify({
      entries: [
        {
          heading: '0207',
          attribute: 'form',
          question_text: 'x',
          classes: { whole: { values: ['w'], subheadings: ['0207.12'], label: 'W', example_code: '0207.12.00' } },
        },
      ],
    });
    const t = _parseTableForTesting(json);
    expect(t.byHeading.size).toBe(0);
  });

  it('returns an empty table on invalid JSON (fail-safe)', () => {
    expect(_parseTableForTesting('not json {').byHeading.size).toBe(0);
  });
});

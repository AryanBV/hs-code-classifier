import { describe, it, expect, vi } from 'vitest';
import {
  computeInformationGain,
  selectQuestionsGreedy,
  buildOptions,
  pickTemplate,
  slugifyValue,
  selectQGSBatch,
  QGSIndistinguishableError,
  QGS_HARD_CAP,
  type CandidateAttributes,
} from './QGS-generator';
import type { RetrievalCandidate } from '../types';
import type { QuestionTemplateRow } from '../lib/supabase-client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const attrs = (rec: Partial<Record<string, string[]>>): CandidateAttributes => rec;

function attrMap(entries: Record<string, CandidateAttributes>): Map<string, CandidateAttributes> {
  return new Map(Object.entries(entries));
}

const candidate = (code: string, chapter?: string): RetrievalCandidate => ({
  code,
  level: 'tariff_line',
  cosine_score: 0.8,
  fts_rank: null,
  rerank_score: 0.5,
  parent_chain: {
    chapter: chapter ?? code.slice(0, 2),
    heading: code.length >= 4 ? code.slice(0, 4) : null,
    subheading: /^\d{4}\.\d{2}/.test(code) ? code.slice(0, 7) : null,
    tariff_line: /^\d{4}\.\d{2}\.\d{2}$/.test(code) ? code : null,
  },
});

// ---------------------------------------------------------------------------
// computeInformationGain (pure Shannon math, sub-spec 02 §A)
// ---------------------------------------------------------------------------

describe('computeInformationGain', () => {
  it('throws on <2 candidates (caller contract violation)', () => {
    expect(() => computeInformationGain(['0901.21.00'], attrMap({}))).toThrow(
      /contract violation/i,
    );
  });

  it('a perfect 2-way split yields IG = 1 bit (full entropy reduction)', () => {
    const a = attrMap({
      A: attrs({ processing_state: ['roasted'] }),
      B: attrs({ processing_state: ['green'] }),
    });
    const r = computeInformationGain(['A', 'B'], a);
    expect(r.selectedAttribute).toBe('processing_state');
    expect(r.igScore).toBeCloseTo(1, 6);
    expect(r.partition.get('roasted')).toEqual(['A']);
    expect(r.partition.get('green')).toEqual(['B']);
  });

  it('an attribute identical across candidates yields no IG (skipped)', () => {
    const a = attrMap({
      A: attrs({ material: ['steel'], form: ['bar'] }),
      B: attrs({ material: ['steel'], form: ['sheet'] }),
    });
    const r = computeInformationGain(['A', 'B'], a);
    // material is identical (no split); form discriminates.
    expect(r.selectedAttribute).toBe('form');
    expect(r.igScore).toBeCloseTo(1, 6);
  });

  it('throws QGSIndistinguishableError when no attribute discriminates', () => {
    const a = attrMap({
      A: attrs({ material: ['steel'] }),
      B: attrs({ material: ['steel'] }),
    });
    expect(() => computeInformationGain(['A', 'B'], a)).toThrow(QGSIndistinguishableError);
  });

  it('prefers the higher-IG attribute over a weaker one', () => {
    // 4 candidates. `form` splits 2|2 (IG = 2 - 1 = 1). `material` splits 3|1
    // (IG = 2 - (3/4·log2 3) ≈ 2 - 1.189 ≈ 0.811). form should win.
    const a = attrMap({
      A: attrs({ form: ['bar'], material: ['steel'] }),
      B: attrs({ form: ['bar'], material: ['steel'] }),
      C: attrs({ form: ['sheet'], material: ['steel'] }),
      D: attrs({ form: ['sheet'], material: ['copper'] }),
    });
    const r = computeInformationGain(['A', 'B', 'C', 'D'], a);
    expect(r.selectedAttribute).toBe('form');
    expect(r.igScore).toBeCloseTo(1, 6);
  });

  it('uses lexical-order tiebreak when two attributes have equal IG', () => {
    // Both `form` and `material` split perfectly 1|1 (IG=1). Lexically, 'form'
    // comes before 'material' → form wins.
    const a = attrMap({
      A: attrs({ form: ['x'], material: ['p'] }),
      B: attrs({ form: ['y'], material: ['q'] }),
    });
    const r = computeInformationGain(['A', 'B'], a);
    expect(r.selectedAttribute).toBe('form');
  });

  it('skips a candidate with no value for an attribute (covered<2 → not asked)', () => {
    const a = attrMap({
      A: attrs({ processing_state: ['roasted'] }),
      B: attrs({ material: ['steel'] }), // no processing_state
    });
    // processing_state is present in only 1 candidate → covered<2, skipped.
    // No other attribute is shared → indistinguishable.
    expect(() => computeInformationGain(['A', 'B'], a)).toThrow(QGSIndistinguishableError);
  });
});

// ---------------------------------------------------------------------------
// selectQuestionsGreedy (RIGHT NUMBER + STOP + CAP + FLOOR)
// ---------------------------------------------------------------------------

describe('selectQuestionsGreedy', () => {
  it('FLOOR: emits exactly one question when one split resolves the set', () => {
    const a = attrMap({
      A: attrs({ form: ['bar'] }),
      B: attrs({ form: ['sheet'] }),
    });
    const steps = selectQuestionsGreedy(['A', 'B'], a);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.dbKey).toBe('form');
  });

  it('asks a SECOND question when one split leaves >1 candidate in the worst case', () => {
    // form: A,B = bar ; C = sheet. Worst-case answer "bar" leaves {A,B}.
    // Within {A,B}, material discriminates (steel vs copper) → second question.
    const a = attrMap({
      A: attrs({ form: ['bar'], material: ['steel'] }),
      B: attrs({ form: ['bar'], material: ['copper'] }),
      C: attrs({ form: ['sheet'], material: ['steel'] }),
    });
    const steps = selectQuestionsGreedy(['A', 'B', 'C'], a);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.map((s) => s.dbKey)).toContain('form');
    expect(steps.map((s) => s.dbKey)).toContain('material');
  });

  it('STOPS at the hard cap even when more attributes could split', () => {
    // 8 candidates, each differing on 4+ attributes; cap caps the count.
    const a = attrMap({
      C1: attrs({ form: ['a'], material: ['m1'], composition: ['x'], intended_use: ['u1'] }),
      C2: attrs({ form: ['a'], material: ['m1'], composition: ['x'], intended_use: ['u2'] }),
      C3: attrs({ form: ['a'], material: ['m1'], composition: ['y'], intended_use: ['u1'] }),
      C4: attrs({ form: ['a'], material: ['m2'], composition: ['x'], intended_use: ['u1'] }),
      C5: attrs({ form: ['b'], material: ['m1'], composition: ['x'], intended_use: ['u1'] }),
      C6: attrs({ form: ['b'], material: ['m2'], composition: ['y'], intended_use: ['u2'] }),
      C7: attrs({ form: ['b'], material: ['m2'], composition: ['y'], intended_use: ['u2'] }),
      C8: attrs({ form: ['b'], material: ['m2'], composition: ['y'], intended_use: ['u2'] }),
    });
    const steps = selectQuestionsGreedy(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'], a);
    expect(steps.length).toBeLessThanOrEqual(QGS_HARD_CAP);
  });

  it('does not ask the same attribute twice', () => {
    const a = attrMap({
      A: attrs({ form: ['bar'], material: ['steel'] }),
      B: attrs({ form: ['bar'], material: ['copper'] }),
      C: attrs({ form: ['sheet'], material: ['steel'] }),
    });
    const steps = selectQuestionsGreedy(['A', 'B', 'C'], a, { hardCap: 5 });
    const keys = steps.map((s) => s.dbKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects a low marginal floor: a tiny second-gain question is dropped', () => {
    // After the first split there is a residual with a weak (<floor) second split.
    const a = attrMap({
      A: attrs({ form: ['bar'], material: ['steel'] }),
      B: attrs({ form: ['bar'], material: ['steel'] }),
      C: attrs({ form: ['sheet'] }),
    });
    // Worst-case residual {A,B} is indistinguishable (both steel) → only 1 Q.
    const steps = selectQuestionsGreedy(['A', 'B', 'C'], a, { marginalFloor: 0.5 });
    expect(steps).toHaveLength(1);
  });

  it('returns empty for a fully indistinguishable set', () => {
    const a = attrMap({
      A: attrs({ material: ['steel'] }),
      B: attrs({ material: ['steel'] }),
    });
    expect(selectQuestionsGreedy(['A', 'B'], a)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildOptions (options from real values + curated labels + escape hatches)
// ---------------------------------------------------------------------------

describe('buildOptions', () => {
  it('builds one option per distinct value plus other/none', () => {
    const partition = new Map<string, string[]>([
      ['roasted', ['A', 'B']],
      ['green', ['C']],
    ]);
    const opts = buildOptions(partition, {});
    const ids = opts.map((o) => o.id);
    expect(ids).toContain('roasted');
    expect(ids).toContain('green');
    expect(ids).toContain('other');
    expect(ids).toContain('none');
    // Most-common value first.
    expect(ids[0]).toBe('roasted');
  });

  it('uses curated value_labels when present', () => {
    const partition = new Map<string, string[]>([
      ['leather', ['A']],
      ['furskin', ['B']],
    ]);
    const labels = { leather: 'Leather only — hair removed', furskin: 'Furskin — hair attached' };
    const opts = buildOptions(partition, labels);
    expect(opts.find((o) => o.id === 'leather')?.label).toBe('Leather only — hair removed');
    expect(opts.find((o) => o.id === 'furskin')?.label).toBe('Furskin — hair attached');
  });

  it('collapses the long tail into other beyond the option cap', () => {
    const partition = new Map<string, string[]>([
      ['v1', ['A']], ['v2', ['B']], ['v3', ['C']], ['v4', ['D']], ['v5', ['E']], ['v6', ['F']],
    ]);
    const opts = buildOptions(partition, {});
    // 4 value options + other + none = 6.
    expect(opts).toHaveLength(6);
    expect(opts[opts.length - 2]!.id).toBe('other');
    expect(opts[opts.length - 1]!.id).toBe('none');
  });

  it('drops universal (all-covering) values, keeping only real discriminators', () => {
    // "raw" is on ALL 3 candidates (universal → useless); "graded_a/b/c" split.
    const partition = new Map<string, string[]>([
      ['raw', ['A', 'B', 'C']],
      ['graded_a', ['A']],
      ['graded_b', ['B']],
      ['graded_c', ['C']],
    ]);
    const opts = buildOptions(partition, {}, 3);
    const ids = opts.map((o) => o.id);
    expect(ids).not.toContain('raw'); // universal dropped
    expect(ids).toContain('graded_a');
    expect(ids).toContain('graded_b');
    expect(ids).toContain('graded_c');
  });

  it('keeps universal values only when <2 splitting values exist (degenerate fallback)', () => {
    const partition = new Map<string, string[]>([
      ['raw', ['A', 'B']], // universal
      ['ground', ['A']],   // only 1 splitting value
    ]);
    const opts = buildOptions(partition, {}, 2);
    // Fewer than 2 splitting values → all values retained as a fallback.
    expect(opts.map((o) => o.id)).toContain('raw');
    expect(opts.map((o) => o.id)).toContain('ground');
  });

  it('emits valid snake_case ids (^[a-z][a-z0-9_]*$)', () => {
    const partition = new Map<string, string[]>([
      ['Passenger Car', ['A']],
      ['heavy-truck (HGV)', ['B']],
    ]);
    const opts = buildOptions(partition, {});
    for (const o of opts) {
      expect(o.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('de-dups colliding slugs deterministically', () => {
    const partition = new Map<string, string[]>([
      ['heavy truck', ['A']],
      ['heavy-truck', ['B']],
    ]);
    const opts = buildOptions(partition, {});
    const ids = opts.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('slugifyValue', () => {
  it('produces a leading-letter snake_case slug', () => {
    expect(slugifyValue('Passenger Car')).toBe('passenger_car');
    expect(slugifyValue('99-bottles')).toBe('v_99_bottles');
    expect(slugifyValue('   ')).toBe('opt');
  });
});

// ---------------------------------------------------------------------------
// pickTemplate (chapter-scoped > general > lowest-id)
// ---------------------------------------------------------------------------

describe('pickTemplate', () => {
  const tpl = (over: Partial<QuestionTemplateRow>): QuestionTemplateRow => ({
    id: 1,
    discriminating_attribute: 'material',
    chapter_scope: null,
    question_text: 'q',
    value_labels: {},
    ...over,
  });

  it('returns null for no rows', () => {
    expect(pickTemplate([], new Set())).toBeNull();
  });

  it('prefers a chapter-scoped template that overlaps the candidate chapters', () => {
    const rows = [
      tpl({ id: 1, chapter_scope: null }),
      tpl({ id: 2, chapter_scope: ['42', '43'] }),
    ];
    expect(pickTemplate(rows, new Set(['43']))?.id).toBe(2);
  });

  it('falls back to a general template when no scope overlaps', () => {
    const rows = [
      tpl({ id: 1, chapter_scope: ['72'] }),
      tpl({ id: 2, chapter_scope: null }),
    ];
    expect(pickTemplate(rows, new Set(['90']))?.id).toBe(2);
  });

  it('falls back to lowest-id when no general and no overlap', () => {
    const rows = [
      tpl({ id: 5, chapter_scope: ['72'] }),
      tpl({ id: 3, chapter_scope: ['73'] }),
    ];
    expect(pickTemplate(rows, new Set(['90']))?.id).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// selectQGSBatch (async wrapper, deps injected — no live DB)
// ---------------------------------------------------------------------------

describe('selectQGSBatch', () => {
  it('returns null for <2 candidates', async () => {
    const out = await selectQGSBatch({
      candidates: [candidate('0901.21.00')],
      deps: { fetchTLA: async () => ({}), fetchTemplates: async () => [] },
    });
    expect(out).toBeNull();
  });

  it('returns null when <2 candidates have a TLA row (silent-discriminator guard)', async () => {
    const out = await selectQGSBatch({
      candidates: [candidate('0901.21.00'), candidate('0901.22.00')],
      deps: {
        fetchTLA: async () => ({ '0901.21.00': { processing_state: ['roasted'] } }), // only 1 row
        fetchTemplates: async () => [],
      },
    });
    expect(out).toBeNull();
  });

  it('returns null for a genuinely indistinguishable set (no guessing)', async () => {
    const out = await selectQGSBatch({
      candidates: [candidate('7208.10.00'), candidate('7208.20.00')],
      deps: {
        fetchTLA: async () => ({
          '7208.10.00': { material: ['steel'] },
          '7208.20.00': { material: ['steel'] },
        }),
        fetchTemplates: async () => [],
      },
    });
    expect(out).toBeNull();
  });

  it('builds a batch with real options + IG scores from the candidate set', async () => {
    const fetchTLA = vi.fn(async () => ({
      '0901.21.00': { processing_state: ['roasted'] },
      '0901.22.00': { processing_state: ['green'] },
    }));
    const fetchTemplates = vi.fn(async (attr: string) => {
      expect(attr).toBe('processing_state');
      return [
        {
          id: 9,
          discriminating_attribute: 'processing_state',
          chapter_scope: ['09'],
          question_text: 'Is the coffee roasted or not?',
          value_labels: { roasted: 'Roasted', green: 'Not roasted (green)' },
        } as QuestionTemplateRow,
      ];
    });

    const out = await selectQGSBatch({
      candidates: [candidate('0901.21.00', '09'), candidate('0901.22.00', '09')],
      deps: { fetchTLA, fetchTemplates },
    });

    expect(out).not.toBeNull();
    expect(out!.questions).toHaveLength(1);
    const q = out!.questions[0]!;
    expect(q.discriminating_attribute).toBe('processing_state');
    expect(q.question_text).toBe('Is the coffee roasted or not?');
    expect(q.qgs_used).toBe(true);
    expect(q.info_gain_score).toBeCloseTo(1, 6);
    // Options carry the curated labels + escape hatches.
    expect(q.options.find((o) => o.id === 'roasted')?.label).toBe('Roasted');
    expect(q.options.map((o) => o.id)).toContain('other');
    expect(q.options.map((o) => o.id)).toContain('none');
    expect(out!.total_ig_potential).toBeCloseTo(1, 6);
  });

  it('maps the function_ DB key to the public AttributeKey "function"', async () => {
    const out = await selectQGSBatch({
      candidates: [candidate('8501.10.00', '85'), candidate('8501.20.00', '85')],
      deps: {
        fetchTLA: async () => ({
          '8501.10.00': { function_: ['motor'] },
          '8501.20.00': { function_: ['generator'] },
        }),
        fetchTemplates: async () => [],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.questions[0]!.discriminating_attribute).toBe('function');
    expect(out!.questions[0]!.question_id).toBe('ask_function_');
  });

  it('produces a synthesized question_text when no template exists', async () => {
    const out = await selectQGSBatch({
      candidates: [candidate('1234.10.00', '12'), candidate('1234.20.00', '12')],
      deps: {
        fetchTLA: async () => ({
          '1234.10.00': { intended_use: ['food'] },
          '1234.20.00': { intended_use: ['industrial'] },
        }),
        fetchTemplates: async () => [], // no template
      },
    });
    expect(out).not.toBeNull();
    expect(out!.questions[0]!.question_text.length).toBeGreaterThan(0);
    expect(out!.questions[0]!.discriminating_attribute).toBe('intended_use');
  });
});

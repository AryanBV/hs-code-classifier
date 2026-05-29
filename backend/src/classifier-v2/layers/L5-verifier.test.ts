/**
 * Unit tests for Layer 5 Mechanical Verifier (10 rules).
 *
 * Mocks: `../lib/supabase-client` (getNotesClaimsForChapters, getTariffLineAttributesForCodes,
 *        ftsSearchExclusions) + an injected QueryRunner for ad-hoc rules (1, 3, 4, 6, 10).
 *
 * Spec: ARCHITECTURE.md §6, sub-spec 01.
 *
 * Run: cd backend && npx vitest run src/classifier-v2/layers/L5-verifier.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExclusionMatch,
  L5Input,
  RetrievalCandidate,
  SelectOutput,
  GIRIdentifier,
} from '../types';
import type { QueryRunner } from '../lib/supabase-client';
import type { Predicate } from '../db/predicate-dsl';

/* ---------------------------------------------------------------------------
 * Mocks — registered BEFORE importing SUT
 * --------------------------------------------------------------------------- */

const notesClaimsMock        = vi.fn();
const tlaMock                = vi.fn();
const ftsExclMock            = vi.fn();

vi.mock('../lib/supabase-client', () => ({
  getNotesClaimsForChapters:       (...a: unknown[]) => notesClaimsMock(...a),
  getTariffLineAttributesForCodes: (...a: unknown[]) => tlaMock(...a),
  ftsSearchExclusions:             (...a: unknown[]) => ftsExclMock(...a),
  _setQueryRunnerForTesting:       () => undefined,
}));

import {
  _internal,
  _setVerifierQueryRunnerForTesting,
  verify,
} from './L5-verifier';
import { EMBEDDING_COSINE_FLOOR } from '../lib/verifier-constants';

/* ---------------------------------------------------------------------------
 * Injected QueryRunner — interceptor with per-test SQL routing
 * --------------------------------------------------------------------------- */

interface SqlExpectation {
  /** Substring match on SQL text. First match wins. */
  match:    string;
  rows:     unknown[];
}

let sqlExpectations: SqlExpectation[] = [];

function injectQR(): void {
  const runner: QueryRunner = {
    query: vi.fn(async (text: string, _params?: unknown[]) => {
      for (const exp of sqlExpectations) {
        if (text.includes(exp.match)) {
          return {
            rows:     exp.rows,
            rowCount: exp.rows.length,
            command:  '',
            oid:      0,
            fields:   [],
          } as unknown as Awaited<ReturnType<QueryRunner['query']>>;
        }
      }
      return {
        rows:     [],
        rowCount: 0,
        command:  '',
        oid:      0,
        fields:   [],
      } as unknown as Awaited<ReturnType<QueryRunner['query']>>;
    }) as unknown as QueryRunner['query'],
  };
  _setVerifierQueryRunnerForTesting(runner);
}

function setSqlRoutes(routes: SqlExpectation[]): void {
  sqlExpectations = routes;
}

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function candidate(code: string, chapter: string): RetrievalCandidate {
  return {
    code,
    level:        'tariff_line',
    cosine_score: 0.8,
    fts_rank:     null,
    rerank_score: 0.85,
    parent_chain: {
      chapter,
      heading:     code.slice(0, 4),
      subheading:  code.slice(0, 7),
      tariff_line: code,
    },
  };
}

function validSelect(overrides: Partial<SelectOutput> = {}): SelectOutput {
  return {
    selected_code:              '7318.15.00',
    selected_code_is_six_digit: false,
    export_policy:              'Free',
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'Per GIR 1, heading 7318 covers screws and bolts of iron or steel.',
      'Material matches chapter 73 scope; classification under 7318.15.00 confirmed.',
    ],
    citation: {
      primary: {
        type:                 'note',
        source_ref:           'chapters.notes:chapter=73:notes[0].text',
        verbatim_text:        'Articles of iron or steel — screws bolts and similar fasteners.',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-1',
    },
    exclusions_checked:      [],
    self_confidence:         'HIGH',
    alternatives_considered: ['7318.16.00'],
    components:              null,
    refusal:                 null,
    ...overrides,
  };
}

function l5Input(overrides: Partial<L5Input> = {}): L5Input {
  const base: L5Input = {
    select_output:       validSelect(),
    candidate_code:      '7318.15.00',
    candidate_chapter:   '73',
    query_embedding:     [0.1, 0.2, 0.3, 0.4, 0.5],
    filtered_candidates: [candidate('7318.15.00', '73'), candidate('7318.16.00', '73')],
    matched_exclusions:  [],
    composite_flag:      false,
    raw_tokens:          ['stainless', 'steel', 'bolt'],
    head_nouns_for_fts:  ['bolt', 'screw'],
  };
  return { ...base, ...overrides };
}

/** Happy-path SQL routes (Rules 1, 3, 4, 6, 10) — all PASS. */
function setHappySql(): void {
  setSqlRoutes([
    // Rule 1 — code exists
    { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
    { match: 'FROM subheadings WHERE subheading = $1 LIMIT 1', rows: [{ one: 1 }] },
    // Rule 3 — source-ref resolves; verbatim_text (from validSelect) is a
    // faithful copy of this note text → token-set containment = 1.0 → PASS.
    { match: 'SELECT notes FROM chapters',
      rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners under chapter 73.' }] }] },
    { match: 'SELECT notes FROM sections',
      rows: [{ notes: [{ number: '1', text: 'Section XV base metals notes.' }] }] },
    // Rule 4 — cosine
    { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
    // Rule 6 — india_specific
    { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
    // Rule 10 — policy
    { match: 'tl.export_policy', rows: [{
      export_policy: 'Free',
      policy_condition: null,
      export_licensing_notes: [],
    }] },
  ]);
}

/* ---------------------------------------------------------------------------
 * Lifecycle
 * --------------------------------------------------------------------------- */

beforeEach(() => {
  notesClaimsMock.mockReset();
  tlaMock.mockReset();
  ftsExclMock.mockReset();
  notesClaimsMock.mockResolvedValue([]);
  tlaMock.mockResolvedValue({});
  ftsExclMock.mockResolvedValue([]);
  injectQR();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  _setVerifierQueryRunnerForTesting(null);
  sqlExpectations = [];
  vi.restoreAllMocks();
});

/* ===========================================================================
 * All 10 rules PASS — happy path
 * =========================================================================== */

describe('L5 verifier — happy path (all 10 rules PASS)', () => {
  it('emits passed=true, trace has 10 entries, no failures', async () => {
    setHappySql();
    const out = await verify(l5Input());
    expect(out.passed).toBe(true);
    expect(out.failed_rules).toEqual([]);
    expect(out.skipped_predicates).toEqual([]);
    expect(out.trace).toHaveLength(10);
    const ids = out.trace.map((t) => t.rule_id);
    expect(ids).toEqual(['MV-01', 'MV-02', 'MV-03', 'MV-04', 'MV-05', 'MV-06', 'MV-07', 'MV-08', 'MV-09', 'MV-10']);
  });

  it('REFUSE output short-circuits (no rules run)', async () => {
    setHappySql();
    const refuseSelect: SelectOutput = {
      ...validSelect(),
      selected_code:              null,
      export_policy:              null,
      policy_condition:           null,
      india_specific_flag:        false,
      self_confidence:            'LOW',
      refusal: { reason: 'No candidate is faithful.' },
    };
    const out = await verify(l5Input({ select_output: refuseSelect }));
    expect(out.passed).toBe(true);
    expect(out.trace).toHaveLength(0);
  });
});

/* ===========================================================================
 * Rule 1 — code existence
 * =========================================================================== */

describe('L5 verifier — Rule 1 (code existence)', () => {
  it('FAILs HALLUCINATED_CODE on bad code format', async () => {
    setHappySql();
    const out = await verify(l5Input({
      candidate_code: 'XX.XX.XX',
      select_output:  validSelect({ selected_code: 'XX.XX.XX' }),
    }));
    const r1Failures = out.failed_rules.filter((f) => f.rule_id === 'MV-01');
    expect(r1Failures.length).toBeGreaterThanOrEqual(1);
    expect(r1Failures[0]?.failure_code).toBe('HALLUCINATED_CODE');
  });

  it('FAILs HALLUCINATED_CODE when tariff_lines row absent', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [] },
      { match: 'SELECT notes FROM chapters', rows: [{ notes: [] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input());
    const r1 = out.failed_rules.find((f) => f.rule_id === 'MV-01');
    expect(r1?.failure_code).toBe('HALLUCINATED_CODE');
  });

  it('PASSes 6-digit fallback code via subheadings table', async () => {
    setSqlRoutes([
      { match: 'FROM subheadings WHERE subheading = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters', rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [] },
    ]);
    const out = await verify(l5Input({
      candidate_code: '3301.22',
      select_output:  validSelect({ selected_code: '3301.22', selected_code_is_six_digit: true }),
    }));
    const r1 = out.failed_rules.find((f) => f.rule_id === 'MV-01');
    expect(r1).toBeUndefined();
  });
});

/* ===========================================================================
 * Rule 2 — exclusions completeness
 * =========================================================================== */

describe('L5 verifier — Rule 2 (exclusions completeness)', () => {
  it('PASS when no exclusions fire (zero hits)', async () => {
    setHappySql();
    ftsExclMock.mockResolvedValueOnce([]);
    const out = await verify(l5Input());
    const r2 = out.failed_rules.find((f) => f.rule_id === 'MV-02');
    expect(r2).toBeUndefined();
  });

  it('PASS when every fired exclusion is in exclusions_checked[]', async () => {
    setHappySql();
    ftsExclMock.mockResolvedValueOnce([
      { id: 100, source_chapter: '73', excluded_product_text: 'plastic articles', redirects_to_chapter: ['39'] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({ exclusions_checked: [100] }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-02')).toBeUndefined();
  });

  it('FAILs EXCLUSION_NOT_CHECKED when an exclusion is missed', async () => {
    setHappySql();
    ftsExclMock.mockResolvedValueOnce([
      { id: 100, source_chapter: '73', excluded_product_text: 'plastic articles', redirects_to_chapter: ['39'] },
      { id: 101, source_chapter: '73', excluded_product_text: 'rubber items', redirects_to_chapter: ['40'] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({ exclusions_checked: [100] }),
    }));
    const r2 = out.failed_rules.find((f) => f.rule_id === 'MV-02');
    expect(r2?.failure_code).toBe('EXCLUSION_NOT_CHECKED');
    expect(r2?.failure_detail).toContain('101');
  });
});

/* ===========================================================================
 * Rule 3 — verbatim citation TF-IDF
 * =========================================================================== */

describe('L5 verifier — Rule 3 (verbatim citation fidelity / token-set containment)', () => {
  it('PASS when verbatim_text is a faithful copy of the resolved source', async () => {
    // validSelect.verbatim_text is contained in the happy-path chapter note →
    // containment = 1.0 ≥ 0.8 threshold → PASS.
    setHappySql();
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-03')).toBeUndefined();
  });

  it('PASS when verbatim_text is a contiguous near-verbatim SLICE of the source', async () => {
    // A real citation often copies only the relevant clause of a long note.
    // Every word of the slice is in the source → containment = 1.0 → PASS.
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'This Chapter covers articles of iron or steel such as screws, bolts, nuts, washers and similar threaded fasteners of base metal.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: {
            type:                 'note',
            source_ref:           'chapters.notes:chapter=73:notes[0].text',
            verbatim_text:        'screws, bolts, nuts, washers and similar threaded fasteners',
            note_or_exclusion_id: null,
          },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-03')).toBeUndefined();
  });

  it('FAILs CITATION_FUZZY_MATCH_FAIL when verbatim_text is fabricated (not in the source)', async () => {
    // The cited note is about iron/steel fasteners but the verbatim_text is an
    // unrelated sentence → containment ≈ 0 → FAIL.
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: {
            type:                 'note',
            source_ref:           'chapters.notes:chapter=73:notes[0].text',
            verbatim_text:        'Fresh tropical fruit packed in cartons for retail sale.',
            note_or_exclusion_id: null,
          },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    const r3 = out.failed_rules.find((f) => f.rule_id === 'MV-03');
    expect(r3?.failure_code).toBe('CITATION_FUZZY_MATCH_FAIL');
    // normalized_score reported in the detail is well below the 0.80 threshold.
    expect(r3?.failure_detail).toContain('< 0.80');
  });

  it('FAILs CITATION_FUZZY_MATCH_FAIL when verbatim_text is a loose paraphrase', async () => {
    // Paraphrase swaps most content words → low containment → FAIL (catches
    // "paraphrased-too-loose" citations the old metric was supposed to catch).
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel such as screws, bolts and similar threaded fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: {
            type:                 'note',
            source_ref:           'chapters.notes:chapter=73:notes[0].text',
            verbatim_text:        'Metal hardware components manufactured primarily from ferrous alloys.',
            note_or_exclusion_id: null,
          },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    const r3 = out.failed_rules.find((f) => f.rule_id === 'MV-03');
    expect(r3?.failure_code).toBe('CITATION_FUZZY_MATCH_FAIL');
  });

  it('FAILs MALFORMED_SOURCE_REF on grammar mismatch', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: {
            type:                 'note',
            source_ref:           'NOT_VALID_REF',
            verbatim_text:        'some text',
            note_or_exclusion_id: null,
          },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    const r3 = out.failed_rules.find((f) => f.rule_id === 'MV-03');
    expect(r3?.failure_code).toBe('MALFORMED_SOURCE_REF');
  });

  it('FAILs CITATION_SOURCE_NOT_FOUND when DB row missing', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters', rows: [] }, // not found
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input());
    const r3 = out.failed_rules.find((f) => f.rule_id === 'MV-03');
    expect(r3?.failure_code).toBe('CITATION_SOURCE_NOT_FOUND');
  });
});

/* ===========================================================================
 * Rule 4 — embedding cosine floor
 * =========================================================================== */

describe('L5 verifier — Rule 4 (embedding cosine floor)', () => {
  it('PASS when cosine is comfortably above the floor', async () => {
    // setHappySql() returns cosine 0.85, well above EMBEDDING_COSINE_FLOOR.
    expect(0.85).toBeGreaterThanOrEqual(EMBEDDING_COSINE_FLOOR);
    setHappySql();
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-04')).toBeUndefined();
  });

  it('FAILs LOW_COSINE_SIMILARITY just below the floor', async () => {
    // Use a cosine strictly below the (empirically-calibrated) floor so this
    // test tracks the constant rather than a stale literal.
    const belowFloor = Math.max(0, EMBEDDING_COSINE_FLOOR - 0.05);
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: belowFloor }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input());
    const r4 = out.failed_rules.find((f) => f.rule_id === 'MV-04');
    expect(r4?.failure_code).toBe('LOW_COSINE_SIMILARITY');
  });

  it('FAILs EMBEDDING_MISSING when row is absent', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input());
    const r4 = out.failed_rules.find((f) => f.rule_id === 'MV-04');
    expect(r4?.failure_code).toBe('EMBEDDING_MISSING');
  });
});

/* ===========================================================================
 * Rule 5 — per-GIR validator (each of the 10 GIR enum values)
 * =========================================================================== */

describe('L5 verifier — Rule 5 (per-GIR validator)', () => {
  it('GIR-1 PASS — citation references chapter note', async () => {
    setHappySql();
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-1 FAIL — citation references leaf_description, not a note', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: {
            type:                 'leaf_description',
            source_ref:           'tariff_lines:code=7318.15.00:description',
            verbatim_text:        'Articles of iron or steel — screws bolts and similar fasteners.',
            note_or_exclusion_id: null,
          },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-2(a) PASS when reasoning mentions "incomplete"', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        reasoning_chain: [
          'The product is unfinished and presented disassembled per GIR 2(a).',
          'Essential character matches finished 7318.15.00 (per GIR 1+2a).',
        ],
        citation: { ...validSelect().citation, gir_applied: 'GIR-2(a)' },
      }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-2(a) FAIL — no incomplete signal in attrs or reasoning', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: { ...validSelect().citation, gir_applied: 'GIR-2(a)' },
      }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-2(b) PASS when composite_flag=true', async () => {
    setHappySql();
    const out = await verify(l5Input({
      composite_flag: true,
      select_output:  validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-2(b)' } }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-2(b) FAIL when composite_flag=false', async () => {
    setHappySql();
    const out = await verify(l5Input({
      composite_flag: false,
      select_output:  validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-2(b)' } }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-3(a) PASS when ≥2 distinct headings in candidates', async () => {
    setHappySql();
    const out = await verify(l5Input({
      filtered_candidates: [candidate('7318.15.00', '73'), candidate('7320.10.00', '73')],
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-3(a)' } }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-3(a) FAIL when only one heading in candidates', async () => {
    setHappySql();
    const out = await verify(l5Input({
      filtered_candidates: [candidate('7318.15.00', '73')],
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-3(a)' } }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-3(b) PASS with composite_flag + ≥2 components', async () => {
    setHappySql();
    const out = await verify(l5Input({
      composite_flag: true,
      select_output: validSelect({
        citation: { ...validSelect().citation, gir_applied: 'GIR-3(b)' },
        components: [
          { name: 'body',   material: 'steel', role: 'primary' },
          { name: 'handle', material: 'wood',  role: 'secondary' },
        ],
      }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-3(b) FAIL when components is null', async () => {
    setHappySql();
    const out = await verify(l5Input({
      composite_flag: true,
      select_output: validSelect({
        citation: { ...validSelect().citation, gir_applied: 'GIR-3(b)' },
        components: null,
      }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_3B_COMPONENTS_MISSING');
  });

  it('GIR-3(c) PASS when reasoning mentions both 3(a) and 3(b)', async () => {
    setHappySql();
    const out = await verify(l5Input({
      filtered_candidates: [candidate('7318.15.00', '73'), candidate('7320.10.00', '73')],
      select_output: validSelect({
        reasoning_chain: [
          'GIR 3(a) failed because both headings are equally specific.',
          'GIR 3(b) does not apply since there is no composite character.',
          'Applying GIR 3(c) — choose the highest-numbered heading.',
        ],
        citation: { ...validSelect().citation, gir_applied: 'GIR-3(c)' },
      }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-3(c) FAIL when reasoning omits enumeration', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-3(c)' } }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-4 PASS when reasoning mentions GIR-1..3', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        reasoning_chain: [
          'GIR 1 doesn\'t cover this product; GIR 2 and GIR 3 also fail.',
          'Apply GIR 4 — most akin to.',
        ],
        citation: { ...validSelect().citation, gir_applied: 'GIR-4' },
      }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-4 FAIL when reasoning omits GIR-1..3 enumeration', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        reasoning_chain: ['Product is most-akin-to fasteners.', 'Use 7318.15.00.'],
        citation: { ...validSelect().citation, gir_applied: 'GIR-4' },
      }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-5(a) PASS when tla.intended_role=packaging', async () => {
    setHappySql();
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [], intended_role: 'packaging' },
    });
    const out = await verify(l5Input({
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-5(a)' } }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-5(a) FAIL when tla.intended_role!=packaging', async () => {
    setHappySql();
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [], intended_role: 'fastener' },
    });
    const out = await verify(l5Input({
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-5(a)' } }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });

  it('GIR-5(b) PASS path mirrors 5(a)', async () => {
    setHappySql();
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: [], form: [], function: [], intended_use: [], processing_state: [], composition: [], intended_role: 'packaging' },
    });
    const out = await verify(l5Input({
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-5(b)' } }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-6 PASS when ≥2 subheadings share a heading', async () => {
    setHappySql();
    const out = await verify(l5Input({
      filtered_candidates: [candidate('7318.15.00', '73'), candidate('7318.16.00', '73')],
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-6' } }),
    }));
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-05')).toBeUndefined();
  });

  it('GIR-6 FAIL when only 1 subheading under a heading', async () => {
    setHappySql();
    const out = await verify(l5Input({
      filtered_candidates: [candidate('7318.15.00', '73'), candidate('7320.10.00', '73')],
      select_output: validSelect({ citation: { ...validSelect().citation, gir_applied: 'GIR-6' } }),
    }));
    const r5 = out.failed_rules.find((f) => f.rule_id === 'MV-05');
    expect(r5?.failure_code).toBe('GIR_VALIDATOR_FAIL');
  });
});

/* ===========================================================================
 * Rule 6 — india_specific consistency
 * =========================================================================== */

describe('L5 verifier — Rule 6 (india_specific consistency)', () => {
  it('PASS when emitted flag matches DB', async () => {
    setHappySql();
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-06')).toBeUndefined();
  });

  it('FAILs INDIA_SPECIFIC_MISMATCH on mismatch', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: true }] }, // DB true
      { match: 'tl.export_policy', rows: [{ export_policy: 'Free', policy_condition: null, export_licensing_notes: [] }] },
    ]);
    const out = await verify(l5Input()); // emits india_specific_flag=false
    const r6 = out.failed_rules.find((f) => f.rule_id === 'MV-06');
    expect(r6?.failure_code).toBe('INDIA_SPECIFIC_MISMATCH');
  });
});

/* ===========================================================================
 * Rule 7 — notes-conformance (chapter notes)
 * =========================================================================== */

describe('L5 verifier — Rule 7 (chapter notes-conformance)', () => {
  it('PASS when predicate evaluates PASS', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          501,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'definition',
      claim_text:  'Articles of iron or steel.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'steel' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
  });

  it('FAILs CHAPTER_NOTE_VIOLATED when predicate FAILs', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          502,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'inclusion',
      claim_text:  'Must be made of pure iron.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'pure_iron' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    const r7 = out.failed_rules.find((f) => f.rule_id === 'MV-07');
    expect(r7?.failure_code).toBe('CHAPTER_NOTE_VIOLATED');
  });

  it('SKIPs (records skipped_predicates) when attrs missing', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          503,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'definition',
      claim_text:  'Carbon content rule.',
      predicate:   JSON.stringify({ op: '>', var: 'carbon_pct', value: 1.0 } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({});  // empty — O2 not run
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
    expect(out.skipped_predicates.length).toBeGreaterThan(0);
    expect(out.skipped_predicates[0]).toMatchObject({ notes_claim_id: 503, var: 'carbon_pct' });
  });

  it('PASS trivially when notes_claims rows is empty', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([]);
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
  });
});

/* ===========================================================================
 * Rule 7 — claim_type POLARITY (MV-07 inversion fix)
 *
 * For an 'exclusion' (or 'redirect'/'scope') claim, predicate PASS means "the
 * product IS the excluded/redirected thing" → VIOLATION. Predicate FAIL/SKIP
 * means "the product is NOT the excluded thing" → fine. For inclusion/
 * definition/condition, FAIL is the violation (normal polarity).
 * =========================================================================== */

describe('L5 verifier — Rule 7 claim_type polarity (MV-07)', () => {
  it('exclusion claim whose predicate FAILs (product is NOT excluded) → NO violation', async () => {
    // This is exactly the case the old code wrongly rejected: a bolt (material
    // = steel) is NOT cotton_linters, so the exclusion predicate FAILs, which
    // (under correct polarity) means the product is NOT excluded → PASS.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          810,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'exclusion',
      claim_text:  'This chapter does not cover cotton linters of Chapter 14.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'cotton_linters' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
  });

  it('exclusion claim whose predicate PASSes (product IS excluded) → VIOLATION', async () => {
    // A product made of cotton_linters DOES match the exclusion → it is barred
    // from chapter 73 → CHAPTER_NOTE_VIOLATED.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          811,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'exclusion',
      claim_text:  'This chapter does not cover cotton linters of Chapter 14.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'cotton_linters' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['cotton_linters'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    const r7 = out.failed_rules.find((f) => f.rule_id === 'MV-07');
    expect(r7?.failure_code).toBe('CHAPTER_NOTE_VIOLATED');
    expect(r7?.failure_detail).toContain('exclusion');
  });

  it('exclusion claim with missing attrs (predicate SKIP) → NO violation', async () => {
    // O2 not yet extracted for this code: the exclusion predicate SKIPs. SKIP
    // is never a violation, regardless of polarity.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          812,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'exclusion',
      claim_text:  'This chapter does not cover cotton linters of Chapter 14.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'cotton_linters' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({}); // no attrs → SKIP
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
    expect(out.skipped_predicates.some((s) => s.notes_claim_id === 812)).toBe(true);
  });

  it('redirect claim whose predicate PASSes (product belongs elsewhere) → VIOLATION', async () => {
    // "printed pictorial paper ⇒ Chapter 49" unless heading ∈ {3918,3919}. A
    // printed_pictorial product on heading 7318 matches → should have been
    // redirected → VIOLATION.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          813,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'redirect',
      claim_text:  'Printed pictorial articles fall in Chapter 49.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'processing_state', value: 'printed_pictorial' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: ['printed_pictorial'], composition: [] },
    });
    const out = await verify(l5Input());
    const r7 = out.failed_rules.find((f) => f.rule_id === 'MV-07');
    expect(r7?.failure_code).toBe('CHAPTER_NOTE_VIOLATED');
  });

  it('redirect claim with __SKIP_PRIORITY_RULE__ sentinel → SKIP → NO violation', async () => {
    // Priority-rule placeholder rows use a __SKIP_* sentinel var. The sentinel
    // resolves to SKIP (never PASS/FAIL), so it is never a violation regardless
    // of polarity, AND it is recorded in skipped_predicates for audit.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          814,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'redirect',
      claim_text:  'Goods classifiable in two headings go to the last in numerical order.',
      predicate:   JSON.stringify({ op: 'EXISTS', var: '__SKIP_PRIORITY_RULE__' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
    expect(out.skipped_predicates.some((s) => s.notes_claim_id === 814)).toBe(true);
  });

  // ---- THE BUG: NORMAL-polarity claims with a __SKIP_* sentinel ----
  // condition/definition/inclusion claims violate on predicate FAIL. Before the
  // fix, EXISTS(__SKIP_*) → FAIL → violation on EVERY product (12 chapters: 04,
  // 25, 29, 37, 39, 60). The sentinel must SKIP so it is never a violation.
  it('condition claim with __SKIP_PURPOSIVE__ sentinel → SKIP → NO violation (the bug)', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          43,
      source_ref:  'chapters.notes:chapter=39:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'condition',
      claim_text:  'Goods of this chapter must be of plastics as defined in note 1.',
      predicate:   JSON.stringify({ op: 'EXISTS', var: '__SKIP_PURPOSIVE__' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
    expect(out.skipped_predicates.some((s) => s.notes_claim_id === 43)).toBe(true);
  });

  it('definition claim with __SKIP_DEFINITION__ sentinel → SKIP → NO violation', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          88,
      source_ref:  'chapters.notes:chapter=29:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'definition',
      claim_text:  'For the purposes of this chapter "separate chemically defined compound" means ...',
      predicate:   JSON.stringify({ op: 'EXISTS', var: '__SKIP_DEFINITION__' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
    expect(out.skipped_predicates.some((s) => s.notes_claim_id === 88)).toBe(true);
  });

  it('REGRESSION: condition claim with a REAL EXISTS predicate still FAILs when attr absent', async () => {
    // Guard: only __SKIP_* sentinels get SKIP treatment. A genuine existence
    // check on a missing attribute must still FAIL → violation (normal polarity).
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          900,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'condition',
      claim_text:  'Goods of this chapter must have a stated material.',
      predicate:   JSON.stringify({ op: 'EXISTS', var: 'material' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({}); // material absent → real EXISTS FAILs
    const out = await verify(l5Input());
    const r7 = out.failed_rules.find((f) => f.rule_id === 'MV-07');
    expect(r7?.failure_code).toBe('CHAPTER_NOTE_VIOLATED');
  });

  it('inclusion claim keeps NORMAL polarity: FAIL → violation', async () => {
    // Sanity: a non-inverted claim_type still violates on FAIL.
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          815,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'inclusion',
      claim_text:  'Heading must contain pure iron.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'pure_iron' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    const r7 = out.failed_rules.find((f) => f.rule_id === 'MV-07');
    expect(r7?.failure_code).toBe('CHAPTER_NOTE_VIOLATED');
  });

  it('inclusion claim keeps NORMAL polarity: PASS → no violation', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          816,
      source_ref:  'chapters.notes:chapter=73:notes[0].text',
      source_kind: 'chapter_note',
      claim_type:  'inclusion',
      claim_text:  'Heading covers steel articles.',
      predicate:   JSON.stringify({ op: 'ARRAY_CONTAINS', var: 'material', value: 'steel' } as Predicate),
      applies_to:  ['73'],
    }]);
    tlaMock.mockResolvedValueOnce({
      '7318.15.00': { material: ['steel'], form: [], function: [], intended_use: [], processing_state: [], composition: [] },
    });
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-07')).toBeUndefined();
  });

  it('INVERTING_CLAIM_TYPES contains exclusion, redirect, scope (and NOT the normal types)', () => {
    expect(_internal.INVERTING_CLAIM_TYPES.has('exclusion')).toBe(true);
    expect(_internal.INVERTING_CLAIM_TYPES.has('redirect')).toBe(true);
    expect(_internal.INVERTING_CLAIM_TYPES.has('scope')).toBe(true);
    expect(_internal.INVERTING_CLAIM_TYPES.has('inclusion')).toBe(false);
    expect(_internal.INVERTING_CLAIM_TYPES.has('definition')).toBe(false);
    expect(_internal.INVERTING_CLAIM_TYPES.has('condition')).toBe(false);
  });
});

/* ===========================================================================
 * Rule 8 — section notes cross-chapter
 * =========================================================================== */

describe('L5 verifier — Rule 8 (section notes cross-chapter)', () => {
  it('PASS when Section XVI note predicate PASSes', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          601,
      source_ref:  'sections.notes:section=XVI:notes[1].text',
      source_kind: 'section_note',
      claim_type:  'condition',
      claim_text:  'Parts and accessories rule.',
      predicate:   JSON.stringify({ op: 'EXISTS', var: 'candidate.chapter' } as Predicate),
      applies_to:  ['73', '84', '85'],
    }]);
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-08')).toBeUndefined();
  });

  it('FAILs SECTION_NOTE_VIOLATED on Section XVI Note 2 violation', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          602,
      source_ref:  'sections.notes:section=XVI:notes[1].text',
      source_kind: 'section_note',
      claim_type:  'condition',
      claim_text:  'Parts intended for chapter 84 only.',
      predicate:   JSON.stringify({ op: '==', var: 'candidate.chapter', value: '84' } as Predicate),
      applies_to:  ['73'],
    }]);
    const out = await verify(l5Input());
    const r8 = out.failed_rules.find((f) => f.rule_id === 'MV-08');
    expect(r8?.failure_code).toBe('SECTION_NOTE_VIOLATED');
  });
});

/* ===========================================================================
 * Rule 9 — subheading notes
 * =========================================================================== */

describe('L5 verifier — Rule 9 (subheading notes)', () => {
  it('PASS on subheading-note predicate PASS', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          701,
      source_ref:  'subheadings:subheading=7318.15:description',
      source_kind: 'subheading_note',
      claim_type:  'definition',
      claim_text:  'Subheading 7318.15 rule.',
      predicate:   JSON.stringify({ op: '==', var: 'candidate.subheading', value: '7318.15' } as Predicate),
      applies_to:  ['7318.15', '73'],
    }]);
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-09')).toBeUndefined();
  });

  it('FAILs SUBHEADING_NOTE_VIOLATED on FAIL', async () => {
    setHappySql();
    notesClaimsMock.mockResolvedValueOnce([{
      id:          702,
      source_ref:  'subheadings:subheading=7318.15:description',
      source_kind: 'subheading_note',
      claim_type:  'inclusion',
      claim_text:  'Wrong subheading.',
      predicate:   JSON.stringify({ op: '==', var: 'candidate.subheading', value: '7318.99' } as Predicate),
      applies_to:  ['7318.15', '73'],
    }]);
    const out = await verify(l5Input());
    const r9 = out.failed_rules.find((f) => f.rule_id === 'MV-09');
    expect(r9?.failure_code).toBe('SUBHEADING_NOTE_VIOLATED');
  });
});

/* ===========================================================================
 * Rule 10 — policy consistency
 * =========================================================================== */

describe('L5 verifier — Rule 10 (policy consistency)', () => {
  it('PASS when export_policy matches DB verbatim', async () => {
    setHappySql();
    const out = await verify(l5Input());
    expect(out.failed_rules.find((f) => f.rule_id === 'MV-10')).toBeUndefined();
  });

  it('FAILs POLICY_INCONSISTENCY on export_policy mismatch', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{
        export_policy: 'Prohibited',  // DB says prohibited
        policy_condition: null,
        export_licensing_notes: [],
      }] },
    ]);
    const out = await verify(l5Input()); // emits "Free"
    const r10 = out.failed_rules.find((f) => f.rule_id === 'MV-10');
    expect(r10?.failure_code).toBe('POLICY_INCONSISTENCY');
  });

  it('FAILs POLICY_INCONSISTENCY when policy_condition contradicts chapter licensing notes (prohibited vs free)', async () => {
    setSqlRoutes([
      { match: 'FROM tariff_lines WHERE code = $1 LIMIT 1', rows: [{ one: 1 }] },
      { match: 'SELECT notes FROM chapters',
        rows: [{ notes: [{ number: '1', text: 'Articles of iron or steel — screws bolts and similar fasteners.' }] }] },
      { match: 'SELECT notes FROM sections', rows: [{ notes: [] }] },
      { match: '1 - (embedding_v2 <=> $1::vector)', rows: [{ cosine: 0.85 }] },
      { match: 'COALESCE(india_specific, FALSE)', rows: [{ india_specific: false }] },
      { match: 'tl.export_policy', rows: [{
        export_policy: 'Free',
        policy_condition: null,
        export_licensing_notes: [{ text: 'Exports are prohibited under DGFT notification 12/2024.' }],
      }] },
    ]);
    const out = await verify(l5Input({
      select_output: validSelect({ policy_condition: 'Free — no license required.' }),
    }));
    const r10 = out.failed_rules.find((f) => f.rule_id === 'MV-10');
    expect(r10?.failure_code).toBe('POLICY_INCONSISTENCY');
  });
});

/* ===========================================================================
 * Repair feedback formatting + trace
 * =========================================================================== */

describe('L5 verifier — repair_feedback formatting', () => {
  it('formats failures with [rule_id failure_code] prefix + suggested_fix', async () => {
    setHappySql();
    const out = await verify(l5Input({
      select_output: validSelect({
        citation: {
          primary: { type: 'note', source_ref: 'NOT_VALID_REF', verbatim_text: 'x', note_or_exclusion_id: null },
          gir_applied: 'GIR-1',
        },
      }),
    }));
    expect(out.repair_feedback).toContain('[MV-03 MALFORMED_SOURCE_REF]');
    expect(out.repair_feedback).toContain('Suggested fix:');
  });

  it('produces empty repair_feedback when no failures', async () => {
    setHappySql();
    const out = await verify(l5Input());
    expect(out.repair_feedback).toBe('');
  });
});

/* ===========================================================================
 * _internal helpers
 * =========================================================================== */

describe('L5 verifier — _internal helpers', () => {
  it('reasoningMentionsGIR detects dash and space variants', () => {
    expect(_internal.reasoningMentionsGIR(['Applying GIR-3(a) here'], ['gir-3(a)'])).toBe(true);
    expect(_internal.reasoningMentionsGIR(['Applying GIR 3(a) here'], ['gir-3(a)'])).toBe(true);
    expect(_internal.reasoningMentionsGIR(['No mention'], ['gir-3(a)'])).toBe(false);
  });

  it('parsePredicate handles JSON-stringified and raw object', () => {
    const raw = { op: '==' as const, var: 'material', value: 'steel' };
    expect(_internal.parsePredicate(JSON.stringify(raw))).toEqual(raw);
    expect(_internal.parsePredicate(raw)).toEqual(raw);
    expect(_internal.parsePredicate('not-json')).toBeNull();
  });

  it('formatRepairFeedback produces newline-joined entries', () => {
    const fb = _internal.formatRepairFeedback([
      { rule_id: 'MV-01', rule_name: 'code_existence', failure_code: 'HALLUCINATED_CODE', failure_detail: 'no such code' },
      { rule_id: 'MV-03', rule_name: 'verbatim_citation_containment', failure_code: 'CITATION_FUZZY_MATCH_FAIL', failure_detail: 'low score' },
    ]);
    expect(fb.split('\n')).toHaveLength(2);
  });
});

// Unused import suppression — GIRIdentifier is part of type signatures only.
void ({} as GIRIdentifier);
void ({} as ExclusionMatch);

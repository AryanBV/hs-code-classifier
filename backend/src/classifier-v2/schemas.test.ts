/**
 * Unit tests for classifier-v2 Zod schemas.
 *
 * Tests:
 *   - TriageOutputZ: valid parse, missing required field, wrong enum
 *   - SelectOutputZ: valid parse, missing required field, wrong enum
 *   - parseOrThrow: returns data on success, throws LlmOutputValidationError on failure
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/schemas.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  LlmOutputValidationError,
  SelectOutputZ,
  TriageOutputZ,
  parseOrThrow,
} from './schemas';
import type { SelectOutput, TriageOutput } from './types';

/* ---------------------------------------------------------------------------
 * Fixtures — valid minimal objects (matching test mocks from L1/L4 tests)
 * --------------------------------------------------------------------------- */

function validTriageClassify(): TriageOutput {
  return {
    decision:            'CLASSIFY',
    extracted_attributes: {
      material:                    'steel',
      material_confidence:         0.9,
      form:                        'bolt',
      form_confidence:             0.9,
      function:                    'fastener',
      function_confidence:         0.85,
      intended_use:                'industrial',
      intended_use_confidence:     0.8,
      processing_state:            'finished',
      processing_state_confidence: 0.9,
      composition:                 null,
      composition_confidence:      null,
      head_nouns_for_fts:          ['bolt'],
      raw_tokens:                  ['hex', 'm10'],
    },
    candidate_chapters:  ['73'],
    completeness_signal: 0.9,
    clarifying_question: null,
    refusal_reason:      null,
    out_of_scope_class:  null,
  };
}

function validTriageAsk(): TriageOutput {
  return {
    decision:            'ASK',
    extracted_attributes: {
      material:                    null,
      material_confidence:         null,
      form:                        null,
      form_confidence:             null,
      function:                    null,
      function_confidence:         null,
      intended_use:                null,
      intended_use_confidence:     null,
      processing_state:            null,
      processing_state_confidence: null,
      composition:                 null,
      composition_confidence:      null,
      head_nouns_for_fts:          ['unknown'],
      raw_tokens:                  [],
    },
    candidate_chapters:  ['40', '87'],
    completeness_signal: 0.5,
    clarifying_question: {
      discriminating_attribute: 'composition',
      fallback_question_text:   'Is it solid rubber or metal-sleeved?',
      fallback_options: [
        { id: 'solid_rubber', label: 'Solid rubber' },
        { id: 'metal_sleeve', label: 'Includes metal sleeve' },
      ],
    },
    refusal_reason:     null,
    out_of_scope_class: null,
  };
}

function validTriageRefuse(): TriageOutput {
  return {
    decision:            'REFUSE',
    extracted_attributes: {
      material:                    null,
      material_confidence:         null,
      form:                        null,
      form_confidence:             null,
      function:                    null,
      function_confidence:         null,
      intended_use:                null,
      intended_use_confidence:     null,
      processing_state:            null,
      processing_state_confidence: null,
      composition:                 null,
      composition_confidence:      null,
      head_nouns_for_fts:          ['unknown'],
      raw_tokens:                  [],
    },
    candidate_chapters:  [],
    completeness_signal: 0.1,
    clarifying_question: null,
    refusal_reason:      'Out of scope.',
    out_of_scope_class:  'services_not_goods',
  };
}

function validSelectClassify(): SelectOutput {
  return {
    selected_code:              '7318.15.00',
    selected_code_is_six_digit: false,
    export_policy:              'Free',
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'GIR 1 applies — heading 7318 covers bolts of iron or steel.',
      'Tariff line attributes confirm stainless steel hex bolt.',
    ],
    citation: {
      primary: {
        type:                 'note',
        source_ref:           'chapters.notes:chapter=73:notes[0].text',
        verbatim_text:        'Heading 7318 covers screws, bolts, nuts and similar fasteners.',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-1',
    },
    exclusions_checked:      [],
    self_confidence:         'HIGH',
    alternatives_considered: ['7318.16.00'],
    components:              null,
    refusal:                 null,
  };
}

function validSelectRefuse(): SelectOutput {
  return {
    selected_code:              null,
    selected_code_is_six_digit: false,
    export_policy:              null,
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'No candidate satisfies strict reading of chapter notes.',
      'Refusing rather than picking least-bad option.',
    ],
    citation: {
      primary: {
        type:                 'leaf_description',
        source_ref:           'system:layer=l4_synthetic_refuse',
        verbatim_text:        'No faithful candidate found.',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-1',
    },
    exclusions_checked:      [],
    self_confidence:         'LOW',
    alternatives_considered: [],
    components:              null,
    refusal:                 { reason: 'No faithful candidate found.' },
  };
}

/* ---------------------------------------------------------------------------
 * TriageOutputZ tests
 * --------------------------------------------------------------------------- */

describe('TriageOutputZ', () => {
  describe('valid objects parse correctly', () => {
    it('accepts a valid CLASSIFY output', () => {
      const result = TriageOutputZ.safeParse(validTriageClassify());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision).toBe('CLASSIFY');
        expect(result.data.candidate_chapters).toEqual(['73']);
      }
    });

    it('accepts a valid ASK output with clarifying_question', () => {
      const result = TriageOutputZ.safeParse(validTriageAsk());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision).toBe('ASK');
        expect(result.data.clarifying_question).not.toBeNull();
        expect(result.data.clarifying_question!.discriminating_attribute).toBe('composition');
      }
    });

    it('accepts a valid REFUSE output', () => {
      const result = TriageOutputZ.safeParse(validTriageRefuse());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision).toBe('REFUSE');
        expect(result.data.out_of_scope_class).toBe('services_not_goods');
      }
    });

    it('accepts all valid out_of_scope_class enum values', () => {
      const classes = [
        'extraterrestrial',
        'fictional',
        'services_not_goods',
        'contraband',
        'weapons_restricted_class',
        'function_only_no_substance',
        'incoherent_query',
        'genuinely_indistinguishable',
        'backtrack_no_fit',
      ] as const;
      for (const klass of classes) {
        const obj = { ...validTriageRefuse(), out_of_scope_class: klass };
        const result = TriageOutputZ.safeParse(obj);
        expect(result.success, `expected ${klass} to be valid`).toBe(true);
      }
    });

    it('accepts all valid AttributeKey values for discriminating_attribute', () => {
      const keys = [
        'material', 'form', 'function', 'intended_use', 'processing_state', 'composition',
      ] as const;
      for (const key of keys) {
        const obj = {
          ...validTriageAsk(),
          clarifying_question: {
            ...validTriageAsk().clarifying_question!,
            discriminating_attribute: key,
          },
        };
        const result = TriageOutputZ.safeParse(obj);
        expect(result.success, `expected ${key} to be valid`).toBe(true);
      }
    });
  });

  describe('missing required fields throw', () => {
    it('rejects when decision field is missing', () => {
      const bad = validTriageClassify() as Partial<TriageOutput>;
      delete bad.decision;
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when extracted_attributes field is missing', () => {
      const bad = validTriageClassify() as Partial<TriageOutput>;
      delete bad.extracted_attributes;
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when completeness_signal field is missing', () => {
      const bad = validTriageClassify() as Partial<TriageOutput>;
      delete bad.completeness_signal;
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when extracted_attributes.head_nouns_for_fts is missing', () => {
      const bad = {
        ...validTriageClassify(),
        extracted_attributes: {
          ...validTriageClassify().extracted_attributes,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (bad.extracted_attributes as any).head_nouns_for_fts;
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('wrong enum values throw', () => {
    it('rejects decision value outside CLASSIFY|ASK|REFUSE', () => {
      const bad = { ...validTriageClassify(), decision: 'MAYBE' as 'CLASSIFY' };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects out_of_scope_class value outside the enum', () => {
      const bad = {
        ...validTriageRefuse(),
        out_of_scope_class: 'unknown_class' as 'incoherent_query',
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects clarifying_question.discriminating_attribute outside the enum', () => {
      const bad = {
        ...validTriageAsk(),
        clarifying_question: {
          ...validTriageAsk().clarifying_question!,
          discriminating_attribute: 'color' as 'material',
        },
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('array constraints', () => {
    it('rejects head_nouns_for_fts with 0 elements (minItems 1)', () => {
      const bad = {
        ...validTriageClassify(),
        extracted_attributes: {
          ...validTriageClassify().extracted_attributes,
          head_nouns_for_fts: [],
        },
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects head_nouns_for_fts with 6 elements (maxItems 5)', () => {
      const bad = {
        ...validTriageClassify(),
        extracted_attributes: {
          ...validTriageClassify().extracted_attributes,
          head_nouns_for_fts: ['a', 'b', 'c', 'd', 'e', 'f'],
        },
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects candidate_chapters with 4 entries (maxItems 3)', () => {
      const bad = {
        ...validTriageClassify(),
        candidate_chapters: ['73', '84', '85', '87'],
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects fallback_options with 1 entry (minItems 2)', () => {
      const bad = {
        ...validTriageAsk(),
        clarifying_question: {
          ...validTriageAsk().clarifying_question!,
          fallback_options: [{ id: 'only_one', label: 'Only one option' }],
        },
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects fallback_options with 5 entries (maxItems 4)', () => {
      const bad = {
        ...validTriageAsk(),
        clarifying_question: {
          ...validTriageAsk().clarifying_question!,
          fallback_options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
            { id: 'd', label: 'D' },
            { id: 'e', label: 'E' },
          ],
        },
      };
      const result = TriageOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });
});

/* ---------------------------------------------------------------------------
 * SelectOutputZ tests
 * --------------------------------------------------------------------------- */

describe('SelectOutputZ', () => {
  describe('valid objects parse correctly', () => {
    it('accepts a valid CLASSIFY output', () => {
      const result = SelectOutputZ.safeParse(validSelectClassify());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.selected_code).toBe('7318.15.00');
        expect(result.data.citation.gir_applied).toBe('GIR-1');
      }
    });

    it('accepts a valid REFUSE output', () => {
      const result = SelectOutputZ.safeParse(validSelectRefuse());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.selected_code).toBeNull();
        expect(result.data.refusal).not.toBeNull();
        expect(result.data.refusal!.reason).toBe('No faithful candidate found.');
      }
    });

    it('accepts all valid GIRIdentifier values', () => {
      const girs = [
        'GIR-1', 'GIR-2(a)', 'GIR-2(b)', 'GIR-3(a)', 'GIR-3(b)',
        'GIR-3(c)', 'GIR-4', 'GIR-5(a)', 'GIR-5(b)', 'GIR-6',
      ] as const;
      for (const gir of girs) {
        const obj = {
          ...validSelectClassify(),
          citation: { ...validSelectClassify().citation, gir_applied: gir },
        };
        const result = SelectOutputZ.safeParse(obj);
        expect(result.success, `expected ${gir} to be valid`).toBe(true);
      }
    });

    it('accepts a 6-digit code', () => {
      const obj: SelectOutput = {
        ...validSelectClassify(),
        selected_code:              '3301.22',
        selected_code_is_six_digit: true,
      };
      const result = SelectOutputZ.safeParse(obj);
      expect(result.success).toBe(true);
    });

    it('accepts components array when present', () => {
      const obj: SelectOutput = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          gir_applied: 'GIR-3(b)',
        },
        components: [
          { name: 'body',   material: 'steel', role: 'primary'   },
          { name: 'handle', material: 'wood',  role: 'secondary' },
        ],
      };
      const result = SelectOutputZ.safeParse(obj);
      expect(result.success).toBe(true);
    });

    it('defaults missing components to null via transform', () => {
      // components is optional in the prompt schema; Zod should coerce missing → null
      const obj = { ...validSelectClassify() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (obj as any).components;
      const result = SelectOutputZ.safeParse(obj);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.components).toBeNull();
      }
    });

    it('accepts all valid self_confidence values', () => {
      for (const level of ['HIGH', 'MEDIUM', 'LOW'] as const) {
        const obj = { ...validSelectClassify(), self_confidence: level };
        const result = SelectOutputZ.safeParse(obj);
        expect(result.success, `expected ${level} to be valid`).toBe(true);
      }
    });

    it('accepts all valid citation.primary.type values', () => {
      for (const type of ['note', 'exclusion', 'leaf_description'] as const) {
        const obj = {
          ...validSelectClassify(),
          citation: {
            ...validSelectClassify().citation,
            primary: { ...validSelectClassify().citation.primary, type },
          },
        };
        const result = SelectOutputZ.safeParse(obj);
        expect(result.success, `expected ${type} to be valid`).toBe(true);
      }
    });

    it('accepts all valid component role values', () => {
      for (const role of ['primary', 'secondary', 'auxiliary'] as const) {
        const obj: SelectOutput = {
          ...validSelectClassify(),
          citation: {
            ...validSelectClassify().citation,
            gir_applied: 'GIR-3(b)',
          },
          components: [
            { name: 'part1', material: 'steel', role },
            { name: 'part2', material: 'wood',  role: 'secondary' },
          ],
        };
        const result = SelectOutputZ.safeParse(obj);
        expect(result.success, `expected component role ${role} to be valid`).toBe(true);
      }
    });
  });

  describe('missing required fields throw', () => {
    it('rejects when selected_code field is missing', () => {
      const bad = validSelectClassify() as Partial<SelectOutput>;
      delete bad.selected_code;
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when citation field is missing', () => {
      const bad = validSelectClassify() as Partial<SelectOutput>;
      delete bad.citation;
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when reasoning_chain field is missing', () => {
      const bad = validSelectClassify() as Partial<SelectOutput>;
      delete bad.reasoning_chain;
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when refusal field is missing', () => {
      // refusal is in the prompt schema required[] even though it can be null
      const bad = validSelectClassify() as Partial<SelectOutput>;
      delete bad.refusal;
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects when citation.primary.source_ref is missing', () => {
      const bad = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          primary: {
            type:                 'note' as const,
            verbatim_text:        'Some text',
            note_or_exclusion_id: null,
            // source_ref intentionally omitted
          } as SelectOutput['citation']['primary'],
        },
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('wrong enum values throw', () => {
    it('rejects gir_applied value outside the GIR enum', () => {
      const bad = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          gir_applied: 'GIR-99' as 'GIR-1',
        },
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects self_confidence value outside HIGH|MEDIUM|LOW', () => {
      const bad = { ...validSelectClassify(), self_confidence: 'GREAT' as 'HIGH' };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects citation.primary.type value outside the enum', () => {
      const bad = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          primary: {
            ...validSelectClassify().citation.primary,
            type: 'unknown_type' as 'note',
          },
        },
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects component role value outside primary|secondary|auxiliary', () => {
      const bad: SelectOutput = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          gir_applied: 'GIR-3(b)',
        },
        components: [
          { name: 'part1', material: 'steel', role: 'tertiary' as 'primary' },
          { name: 'part2', material: 'wood',  role: 'secondary' },
        ],
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('array and format constraints', () => {
    it('rejects reasoning_chain with 1 entry (minItems 2)', () => {
      const bad = { ...validSelectClassify(), reasoning_chain: ['only one'] };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects reasoning_chain with 6 entries (maxItems 5)', () => {
      const bad = { ...validSelectClassify(), reasoning_chain: ['a', 'b', 'c', 'd', 'e', 'f'] };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects alternatives_considered with more than 4 entries (maxItems 4)', () => {
      const bad = {
        ...validSelectClassify(),
        alternatives_considered: [
          '7318.16.00', '7318.17.00', '7318.18.00', '7318.19.00', '7318.21.00',
        ],
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects alternatives_considered with non-code strings', () => {
      const bad = { ...validSelectClassify(), alternatives_considered: ['NOTACODE'] };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects selected_code that does not match the code regex', () => {
      const bad = { ...validSelectClassify(), selected_code: 'NOTACODE' };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects source_ref that is empty string (min length 1)', () => {
      const bad = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          primary: {
            ...validSelectClassify().citation.primary,
            source_ref: '',
          },
        },
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects verbatim_text that is empty string (min length 1)', () => {
      const bad = {
        ...validSelectClassify(),
        citation: {
          ...validSelectClassify().citation,
          primary: {
            ...validSelectClassify().citation.primary,
            verbatim_text: '',
          },
        },
      };
      const result = SelectOutputZ.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });
});

/* ---------------------------------------------------------------------------
 * parseOrThrow tests
 * --------------------------------------------------------------------------- */

describe('parseOrThrow', () => {
  it('returns the typed value when schema validates successfully', () => {
    const input = validTriageClassify();
    const result = parseOrThrow(TriageOutputZ, input, 'L1-triage');
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toEqual(['73']);
  });

  it('throws LlmOutputValidationError when a required field is missing', () => {
    const bad = { ...validTriageClassify() } as Partial<TriageOutput>;
    delete bad.decision;

    expect(() => parseOrThrow(TriageOutputZ, bad, 'L1-triage')).toThrow(LlmOutputValidationError);
  });

  it('throws LlmOutputValidationError when an enum value is wrong', () => {
    const bad = { ...validTriageClassify(), decision: 'INVALID' as 'CLASSIFY' };

    expect(() => parseOrThrow(TriageOutputZ, bad, 'L1-triage')).toThrow(LlmOutputValidationError);
  });

  it('error.ctx contains the passed context string', () => {
    const bad = { ...validTriageClassify(), decision: 'INVALID' as 'CLASSIFY' };

    let caught: LlmOutputValidationError | null = null;
    try {
      parseOrThrow(TriageOutputZ, bad, 'L1-triage');
    } catch (e) {
      caught = e as LlmOutputValidationError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.ctx).toBe('L1-triage');
  });

  it('error.issues is a non-empty array of ZodIssue objects', () => {
    const bad = { ...validTriageClassify(), decision: 'INVALID' as 'CLASSIFY' };

    let caught: LlmOutputValidationError | null = null;
    try {
      parseOrThrow(TriageOutputZ, bad, 'L1-triage');
    } catch (e) {
      caught = e as LlmOutputValidationError;
    }
    expect(caught!.issues.length).toBeGreaterThan(0);
    expect(caught!.issues[0]).toHaveProperty('message');
    expect(caught!.issues[0]).toHaveProperty('path');
  });

  it('error is distinguishable from plain Error by name', () => {
    const bad = { ...validTriageClassify(), decision: 'INVALID' as 'CLASSIFY' };

    let caught: Error | null = null;
    try {
      parseOrThrow(TriageOutputZ, bad, 'L1-triage');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught!.name).toBe('LlmOutputValidationError');
    expect(caught instanceof LlmOutputValidationError).toBe(true);
  });

  it('error.message includes the ctx string', () => {
    const bad = { ...validTriageClassify(), decision: 'INVALID' as 'CLASSIFY' };

    expect(() => parseOrThrow(TriageOutputZ, bad, 'my-custom-ctx'))
      .toThrow(/my-custom-ctx/);
  });

  it('works with SelectOutputZ on a valid select output', () => {
    const input = validSelectClassify();
    const result = parseOrThrow(SelectOutputZ, input, 'L4-select');
    expect(result.selected_code).toBe('7318.15.00');
    expect(result.self_confidence).toBe('HIGH');
  });

  it('throws LlmOutputValidationError for SelectOutputZ on missing citation', () => {
    const bad = { ...validSelectClassify() } as Partial<SelectOutput>;
    delete bad.citation;

    expect(() => parseOrThrow(SelectOutputZ, bad, 'L4-select')).toThrow(LlmOutputValidationError);
  });

  it('handles non-object input (null) gracefully', () => {
    expect(() => parseOrThrow(TriageOutputZ, null, 'L1-triage')).toThrow(LlmOutputValidationError);
  });

  it('handles non-object input (string) gracefully', () => {
    expect(() => parseOrThrow(TriageOutputZ, 'not an object', 'L1-triage'))
      .toThrow(LlmOutputValidationError);
  });
});

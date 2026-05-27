/**
 * Unit tests for Layer 4 Select.
 *
 * Framework: vitest. Mocks both `generateContent` (vertex-client) and the
 * Supabase fetchers (`getSelectCandidateRows`, `getChapterNotesBundles`,
 * `getNotesClaimsForChapters`, `getTariffLineAttributesForCodes`).
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/layers/L4-select.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExclusionMatch,
  L4Input,
  RetrievalCandidate,
  SelectOutput,
  TriageExtractedAttributes,
  VerifierRuleFailure,
} from '../types';

/* ---------------------------------------------------------------------------
 * Mocks — register BEFORE importing the SUT
 * --------------------------------------------------------------------------- */

const generateContentMock = vi.fn();

vi.mock('../lib/vertex-client', () => {
  // Re-export MaxTokensError from the real module so SUT instanceof checks work.
  // We use a stub class with the same name.
  class MaxTokensError extends Error {
    constructor(public readonly partialText: string, public readonly usage: unknown, public readonly model: string) {
      super(`Mock MaxTokensError for ${model}`);
      this.name = 'MaxTokensError';
    }
  }
  return {
    generateContent: (...args: unknown[]) => generateContentMock(...args),
    MaxTokensError,
  };
});

const getSelectCandidateRowsMock         = vi.fn();
const getChapterNotesBundlesMock         = vi.fn();
const getNotesClaimsForChaptersMock      = vi.fn();
const getTariffLineAttributesForCodesMock = vi.fn();

vi.mock('../lib/supabase-client', () => ({
  getSelectCandidateRows:           (...a: unknown[]) => getSelectCandidateRowsMock(...a),
  getChapterNotesBundles:           (...a: unknown[]) => getChapterNotesBundlesMock(...a),
  getNotesClaimsForChapters:        (...a: unknown[]) => getNotesClaimsForChaptersMock(...a),
  getTariffLineAttributesForCodes:  (...a: unknown[]) => getTariffLineAttributesForCodesMock(...a),
}));

// Import SUT after mocks are registered.
import {
  _clearPromptCacheForTesting,
  _getPromptPathForTesting,
  _internal,
  gatherSelectContext,
  isSelectOutput,
  select,
} from './L4-select';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function fullAttrs(): TriageExtractedAttributes {
  return {
    material:                    'stainless-steel',
    material_confidence:         0.95,
    form:                        'hex-bolt',
    form_confidence:             0.95,
    function:                    'fastener',
    function_confidence:         0.9,
    intended_use:                'industrial',
    intended_use_confidence:     0.85,
    processing_state:            'finished',
    processing_state_confidence: 0.9,
    composition:                 null,
    composition_confidence:      null,
    head_nouns_for_fts:          ['bolt', 'hex', 'stainless'],
    raw_tokens:                  ['m10', 'industrial'],
  };
}

function candidate(code: string, chapter: string): RetrievalCandidate {
  const heading    = code.slice(0, 4);
  const subheading = code.length >= 7 ? code.slice(0, 7) : null;
  return {
    code,
    level:        code.length === 10 ? 'tariff_line' : 'subheading',
    cosine_score: 0.8,
    fts_rank:     null,
    rerank_score: 0.85,
    parent_chain: {
      chapter:     chapter,
      heading:     heading,
      subheading:  subheading,
      tariff_line: code.length === 10 ? code : null,
    },
  };
}

function dbRow(code: string, chapter: string, opts: Partial<{
  export_policy: string | null;
  policy_condition: string | null;
  india_specific: boolean;
  description: string;
  is_six_digit_only: boolean;
}> = {}) {
  const heading    = code.slice(0, 4);
  const subheading = code.length >= 7 ? code.slice(0, 7) : code;
  return {
    code,
    is_six_digit_only:   opts.is_six_digit_only ?? false,
    description:         opts.description ?? `Mock leaf description for ${code}`,
    chapter,
    heading,
    subheading,
    subheading_title:    `Sub-heading title for ${subheading}`,
    heading_title:       `Heading title for ${heading}`,
    chapter_title:       `Chapter title for ${chapter}`,
    export_policy:       opts.export_policy ?? 'Free',
    policy_condition:    opts.policy_condition ?? null,
    india_specific:      opts.india_specific ?? false,
    india_specific_note: null,
  };
}

function input(overrides: Partial<L4Input> = {}): L4Input {
  return {
    normalized_query:     'stainless steel hex bolts m10',
    raw_tokens:           ['stainless', 'steel', 'hex', 'bolts', 'm10'],
    composite_flag:       false,
    extracted_attributes: fullAttrs(),
    candidate_chapters:   ['73'],
    filtered_candidates:  [
      candidate('7318.15.00', '73'),
      candidate('7318.16.00', '73'),
    ],
    matched_exclusions:   [],
    verifier_failures:    null,
    repair_iteration:     0,
    current_year:         2026,
    ...overrides,
  };
}

function validClassifyOutput(overrides: Partial<SelectOutput> = {}): SelectOutput {
  return {
    selected_code:              '7318.15.00',
    selected_code_is_six_digit: false,
    export_policy:              'Free',
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'Per GIR 1, heading 7318 covers screws, bolts and similar articles of iron or steel.',
      'Tariff_line_attributes align with extracted_attributes on material+form.',
    ],
    citation: {
      primary: {
        type:                 'note',
        source_ref:           'chapters.notes:chapter=73:notes[0].text',
        verbatim_text:        'Stainless steel means alloy steels containing chromium ≥ 10.5%',
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

function validRefuseOutput(reason = 'No candidate is faithful under strict reading.'): SelectOutput {
  return {
    selected_code:              null,
    selected_code_is_six_digit: false,
    export_policy:              null,
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'Read all chapter notes — no candidate satisfies the relevant scope.',
      'Refusing under Step 6 (faithful refusal preferred over least-bad pick).',
    ],
    citation: {
      primary: {
        type:                 'note',
        source_ref:           'chapters.notes:chapter=73:notes[0].text',
        verbatim_text:        'Section XV scope clause.',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-1',
    },
    exclusions_checked:      [],
    self_confidence:         'LOW',
    alternatives_considered: [],
    components:              null,
    refusal:                 { reason },
  };
}

function gir3bOutput(): SelectOutput {
  return {
    selected_code:              '7318.15.00',
    selected_code_is_six_digit: false,
    export_policy:              'Free',
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'Composite product — applying GIR 3(b) for essential character.',
      'Steel body dominates by mass and function; classified per the steel component.',
    ],
    citation: {
      primary: {
        type:                 'note',
        source_ref:           'chapters.notes:chapter=73:notes[1].text',
        verbatim_text:        'Articles of iron or steel — essential-character determination',
        note_or_exclusion_id: null,
      },
      gir_applied: 'GIR-3(b)',
    },
    exclusions_checked:      [],
    self_confidence:         'MEDIUM',
    alternatives_considered: ['7318.16.00'],
    components: [
      { name: 'body',   material: 'stainless-steel', role: 'primary'   },
      { name: 'handle', material: 'wood',            role: 'secondary' },
      { name: 'pin',    material: 'brass',           role: 'auxiliary' },
    ],
    refusal: null,
  };
}

function queueModelResponses(...texts: string[]): void {
  for (const t of texts) {
    generateContentMock.mockResolvedValueOnce({
      text:         t,
      usage:        { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 },
      finishReason: 'STOP',
      latencyMs:    1,
      model:        'gemini-3.5-flash',
    });
  }
}

function setSupabaseHappyPath(): void {
  getSelectCandidateRowsMock.mockResolvedValue([
    dbRow('7318.15.00', '73'),
    dbRow('7318.16.00', '73'),
  ]);
  getChapterNotesBundlesMock.mockResolvedValue([
    {
      chapter: '73',
      notes: [{ number: '1', text: 'Articles of iron or steel.' }],
      chapter_subheading_notes: [],
      supplementary_notes: [],
      export_licensing_notes: [],
      section_notes: [{ number: 'XV.1', text: 'Section XV — base metals.' }],
    },
  ]);
  getNotesClaimsForChaptersMock.mockResolvedValue([
    {
      id:          101,
      source_ref:  'chapters.notes:chapter=72:notes[5].text',
      source_kind: 'chapter_note',
      claim_type:  'definition',
      claim_text:  'Stainless steel definition.',
      predicate:   { op: 'ARRAY_CONTAINS', var: 'material', value: 'stainless-steel' },
      applies_to:  ['72', '73'],
    },
  ]);
  getTariffLineAttributesForCodesMock.mockResolvedValue({
    '7318.15.00': {
      material: ['steel-alloy'],
      form: ['bolt', 'hex-head'],
      function: ['fastener'],
      intended_use: ['industrial'],
      processing_state: ['finished'],
      composition: [],
      composite_components: null,
    },
  });
}

/* ---------------------------------------------------------------------------
 * Lifecycle
 * --------------------------------------------------------------------------- */

beforeEach(() => {
  _clearPromptCacheForTesting();
  generateContentMock.mockReset();
  getSelectCandidateRowsMock.mockReset();
  getChapterNotesBundlesMock.mockReset();
  getNotesClaimsForChaptersMock.mockReset();
  getTariffLineAttributesForCodesMock.mockReset();
  // Silence console.log during tests.
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  _clearPromptCacheForTesting();
});

/* ---------------------------------------------------------------------------
 * Prompt parsing
 * --------------------------------------------------------------------------- */

describe('L4 select — prompt parsing', () => {
  it('resolves a path to backend/prompts/select-v2.md', () => {
    const p = _getPromptPathForTesting();
    expect(p).toMatch(/select-v2\.md$/);
  });

  it('parsePrompt extracts the three sections from select-v2.md', () => {
    const fs = require('fs') as typeof import('fs');
    const raw = fs.readFileSync(_getPromptPathForTesting(), 'utf8');
    const parsed = _internal.parsePrompt(raw);
    expect(parsed.systemInstruction.length).toBeGreaterThan(100);
    expect(parsed.systemInstruction).toContain('## SYSTEM PROMPT');
    expect(parsed.systemInstruction).not.toContain('## USER PROMPT TEMPLATE');
    expect(parsed.userTemplate).toContain('QUERY:');
    expect(parsed.userTemplate).toContain('CANDIDATES');
    expect(parsed.userTemplate).toContain('NOTES_CLAIMS');
    expect(parsed.responseSchema.type).toBe('object');
    expect(parsed.responseSchema.required).toBeDefined();
  });
});

/* ---------------------------------------------------------------------------
 * Multi-signal context gathering
 * --------------------------------------------------------------------------- */

describe('L4 select — gatherSelectContext (parallel Supabase fetch)', () => {
  it('runs all 4 Supabase queries in parallel and assembles SelectContext', async () => {
    setSupabaseHappyPath();
    const ctx = await gatherSelectContext(input());

    expect(getSelectCandidateRowsMock).toHaveBeenCalledTimes(1);
    expect(getChapterNotesBundlesMock).toHaveBeenCalledTimes(1);
    expect(getNotesClaimsForChaptersMock).toHaveBeenCalledTimes(1);
    expect(getTariffLineAttributesForCodesMock).toHaveBeenCalledTimes(1);

    // candidate codes flow into the codes query
    expect(getSelectCandidateRowsMock).toHaveBeenCalledWith(['7318.15.00', '7318.16.00']);
    // chapters distilled to ['73'] (deduped, sorted)
    expect(getChapterNotesBundlesMock).toHaveBeenCalledWith(['73']);
    expect(getNotesClaimsForChaptersMock).toHaveBeenCalledWith(['73']);
    expect(getTariffLineAttributesForCodesMock).toHaveBeenCalledWith(['7318.15.00', '7318.16.00']);

    // Assembled context preserves L3 candidate ordering
    expect(ctx.candidates.length).toBe(2);
    expect(ctx.candidates[0].code).toBe('7318.15.00');
    expect(ctx.candidates[1].code).toBe('7318.16.00');
    expect(ctx.chapter_notes_by_chapter['73']).toBeDefined();
    expect(ctx.chapter_notes_by_chapter['73'].section_notes.length).toBe(1);
    expect(ctx.notes_claims.length).toBe(1);
    expect(ctx.applicable_GIRs).toContain('GIR 1');
    expect(ctx.applicable_GIRs).toContain('GIR 6');
    expect(ctx.current_year).toBe(2026);
  });

  it('gracefully renders empty TLA when O2 has not yet extracted attributes', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([dbRow('7318.15.00', '73')]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({}); // EMPTY — O2 not yet done

    const ctx = await gatherSelectContext(input({
      filtered_candidates: [candidate('7318.15.00', '73')],
    }));
    expect(ctx.tariff_line_attributes).toEqual({});
    expect(ctx.notes_claims).toEqual([]);
    expect(ctx.candidates.length).toBe(1);
  });

  it('handles missing DB candidate row with stub (Verifier Rule 1 catches downstream)', async () => {
    // Only 7318.15.00 is in DB; 7318.16.00 is missing.
    getSelectCandidateRowsMock.mockResolvedValue([dbRow('7318.15.00', '73')]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({});

    const ctx = await gatherSelectContext(input());
    expect(ctx.candidates.length).toBe(2);
    expect(ctx.candidates[0].description).toBe('Mock leaf description for 7318.15.00');
    expect(ctx.candidates[1].description).toBe(''); // stub
  });
});

/* ---------------------------------------------------------------------------
 * Prompt rendering — repair-loop branch + composite_flag + snapshot
 * --------------------------------------------------------------------------- */

describe('L4 select — prompt rendering', () => {
  it('does NOT include the REPAIR ITERATION block on first invocation', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    await select(input());
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).not.toContain('REPAIR ITERATION');
    expect(call.prompt).not.toContain('VERIFIER_FAILURES:');
  });

  it('renders the REPAIR ITERATION block when verifier_failures is non-null', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    const failures: VerifierRuleFailure[] = [
      {
        rule_id:        'MV-04',
        rule_name:      'citation.verbatim_text_fuzzy_match',
        failure_detail: 'TF-IDF 0.41 < 0.6 against chapters.notes[2] for chapter 87',
        field_path:     'citation.primary.verbatim_text',
        suggested_fix:  'Re-copy exact text from chapter_notes_by_chapter[87].notes[1].text',
      },
    ];
    await select(input({ verifier_failures: failures, repair_iteration: 1 }));
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('REPAIR ITERATION');
    expect(call.prompt).toContain('VERIFIER_FAILURES:');
    expect(call.prompt).toContain('MV-04');
    expect(call.prompt).toContain('citation.verbatim_text_fuzzy_match');
  });

  it('substitutes all key signals + composite_product_flag into the user template', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    await select(input({ composite_flag: true }));
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('QUERY: stainless steel hex bolts m10');
    expect(call.prompt).toContain('COMPOSITE_PRODUCT_FLAG: true');
    expect(call.prompt).toContain('CANDIDATES');
    expect(call.prompt).toContain('7318.15.00');
    expect(call.prompt).toContain('TARIFF_LINE_ATTRIBUTES');
    expect(call.prompt).toContain('NOTES_CLAIMS');
    expect(call.prompt).toContain('CHAPTER_NOTES');
    expect(call.prompt).toContain('MATCHED_EXCLUSION_RULES');
    expect(call.prompt).toContain('APPLICABLE_GIRs');
    expect(call.prompt).toContain('CURRENT_YEAR: 2026');
  });

  it('snapshot — system + user prompt structure matches select-v2.md sections', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    await select(input());
    const call = generateContentMock.mock.calls[0][0];

    // System should pull in legally-controlling text the schema relies on.
    expect(call.systemInstruction).toContain('Select stage');
    expect(call.systemInstruction).toContain('Indian ITC-HS');
    expect(call.systemInstruction.toUpperCase()).toContain('REFUS');
    // Schema enforced via responseSchema parameter.
    expect(call.responseSchema).toBeDefined();
    expect((call.responseSchema as { type: string }).type).toBe('object');
  });
});

/* ---------------------------------------------------------------------------
 * Vertex call configuration
 * --------------------------------------------------------------------------- */

describe('L4 select — vertex call configuration', () => {
  it('passes the correct model+thinking_level+temperature+maxOutputTokens', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    await select(input());
    const call = generateContentMock.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.5-flash');
    expect(call.thinkingLevel).toBe('low');
    expect(call.responseMimeType).toBe('application/json');
    expect(call.temperature).toBe(0.0);
    expect(call.maxOutputTokens).toBe(4096);
  });
});

/* ---------------------------------------------------------------------------
 * Happy path CLASSIFY (GIR-1)
 * --------------------------------------------------------------------------- */

describe('L4 select — CLASSIFY happy path', () => {
  it('returns parsed CLASSIFY output on first call', async () => {
    setSupabaseHappyPath();
    const out = validClassifyOutput();
    queueModelResponses(JSON.stringify(out));

    const result = await select(input());
    expect(result).toEqual(out);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------------
 * GIR-3(b) composite handling
 * --------------------------------------------------------------------------- */

describe('L4 select — GIR-3(b) composite handling', () => {
  it('returns CLASSIFY with components array (length ≥2) for GIR-3(b)', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(gir3bOutput()));

    const result = await select(input({ composite_flag: true }));
    expect(result.citation.gir_applied).toBe('GIR-3(b)');
    expect(result.components).not.toBeNull();
    expect(result.components!.length).toBe(3);
    expect(result.components![0].role).toBe('primary');
  });

  it('rejects GIR-3(b) output with null components → retries → accepts populated', async () => {
    setSupabaseHappyPath();
    const bad: SelectOutput = { ...gir3bOutput(), components: null };
    const good = gir3bOutput();
    queueModelResponses(JSON.stringify(bad), JSON.stringify(good));

    const result = await select(input({ composite_flag: true }));
    expect(result.components).not.toBeNull();
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('rejects GIR-3(b) output with components.length=1 (< minimum)', async () => {
    setSupabaseHappyPath();
    const bad: SelectOutput = {
      ...gir3bOutput(),
      components: [{ name: 'only-one', material: 'steel', role: 'primary' }],
    };
    queueModelResponses(JSON.stringify(bad), JSON.stringify(bad));

    const result = await select(input({ composite_flag: true }));
    // Both attempts rejected -> synthetic REFUSE
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * 6-digit fallback CLASSIFY
 * --------------------------------------------------------------------------- */

describe('L4 select — 6-digit fallback', () => {
  it('accepts a 6-digit code when selected_code_is_six_digit=true', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([
      dbRow('3301.22', '33', {
        is_six_digit_only: true,
        description:       'Of jasmin',
        export_policy:     null,
        policy_condition:  null,
      }),
    ]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({});

    const sixDigitCandidate: RetrievalCandidate = {
      code: '3301.22',
      level: 'subheading',
      cosine_score: 0.9,
      fts_rank: null,
      rerank_score: 0.95,
      parent_chain: {
        chapter:     '33',
        heading:     '3301',
        subheading:  '3301.22',
        tariff_line: null,
      },
    };
    const out: SelectOutput = {
      selected_code:              '3301.22',
      selected_code_is_six_digit: true,
      export_policy:              null,
      policy_condition:           null,
      india_specific_flag:        false,
      reasoning_chain: [
        'Per GIR 6, subheading 3301.22 ("Of jasmin") is the most specific subheading.',
        'Subheading 3301.22 has no 8-digit children — 6-digit return authorized.',
      ],
      citation: {
        primary: {
          type:                 'leaf_description',
          source_ref:           'subheadings:subheading=3301.22:description',
          verbatim_text:        'Of jasmin',
          note_or_exclusion_id: null,
        },
        gir_applied: 'GIR-6',
      },
      exclusions_checked:      [],
      self_confidence:         'HIGH',
      alternatives_considered: [],
      components:              null,
      refusal:                 null,
    };
    queueModelResponses(JSON.stringify(out));

    const result = await select(input({
      normalized_query:    'jasmine essential oil',
      candidate_chapters:  ['33'],
      filtered_candidates: [sixDigitCandidate],
      extracted_attributes: { ...fullAttrs(), composition: 'jasmine' },
    }));
    expect(result.selected_code).toBe('3301.22');
    expect(result.selected_code_is_six_digit).toBe(true);
    expect(result.export_policy).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * REFUSE
 * --------------------------------------------------------------------------- */

describe('L4 select — REFUSE', () => {
  it('accepts a valid REFUSE emission (null selected_code + populated refusal)', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validRefuseOutput('No faithful candidate.')));

    const result = await select(input());
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
    expect(result.refusal!.reason).toBe('No faithful candidate.');
    expect(result.export_policy).toBeNull();
    expect(result.policy_condition).toBeNull();
    expect(result.india_specific_flag).toBe(false);
    expect(result.self_confidence).toBe('LOW');
  });
});

/* ---------------------------------------------------------------------------
 * Hallucinated-code retry semantics
 * --------------------------------------------------------------------------- */

describe('L4 select — hallucinated-code retry', () => {
  it('retries once when selected_code is NOT in filtered_candidates; succeeds on retry', async () => {
    setSupabaseHappyPath();
    const hallucinated: SelectOutput = { ...validClassifyOutput(), selected_code: '9999.99.99' };
    const good = validClassifyOutput();
    queueModelResponses(JSON.stringify(hallucinated), JSON.stringify(good));

    const result = await select(input());
    expect(result.selected_code).toBe('7318.15.00');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns synthetic REFUSE when hallucination persists on both attempts', async () => {
    setSupabaseHappyPath();
    const hallucinated1: SelectOutput = { ...validClassifyOutput(), selected_code: '9999.99.99' };
    const hallucinated2: SelectOutput = { ...validClassifyOutput(), selected_code: '8888.88.88' };
    queueModelResponses(JSON.stringify(hallucinated1), JSON.stringify(hallucinated2));

    const result = await select(input());
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
    expect(result.refusal!.reason).toMatch(/hallucinated/i);
  });

  it('returns synthetic REFUSE when first attempt hallucinates and retry yields invalid JSON', async () => {
    // Edge path covering the short-circuit at line 698:
    // `retryParsed === null || isHallucinatedCode(retryParsed, ...)`
    // First attempt: valid JSON but hallucinated code (triggers retry).
    // Second attempt: invalid JSON (parse-fail) → retryParsed === null.
    // Must NOT throw TypeError; must return synthetic REFUSE with reason citing hallucination.
    setSupabaseHappyPath();
    const hallucinated: SelectOutput = { ...validClassifyOutput(), selected_code: '9999.99.99' };
    queueModelResponses(JSON.stringify(hallucinated), 'not valid json at all !!!');

    const result = await select(input());
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
    expect(result.refusal!.reason).toMatch(/hallucinated/i);
    expect(result.export_policy).toBeNull();
    expect(result.policy_condition).toBeNull();
    expect(result.india_specific_flag).toBe(false);
    expect(result.self_confidence).toBe('LOW');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});

/* ---------------------------------------------------------------------------
 * Invalid-JSON retry semantics
 * --------------------------------------------------------------------------- */

describe('L4 select — invalid JSON retry', () => {
  it('retries on invalid JSON then returns parsed on second call', async () => {
    setSupabaseHappyPath();
    queueModelResponses('not valid json !!!', JSON.stringify(validClassifyOutput()));

    const result = await select(input());
    expect(result.selected_code).toBe('7318.15.00');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns synthetic REFUSE when both calls fail to parse', async () => {
    setSupabaseHappyPath();
    queueModelResponses('garbage one', 'garbage two');

    const result = await select(input());
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
    expect(result.refusal!.reason).toMatch(/invalid JSON/i);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns synthetic REFUSE when model output is valid JSON but fails schema validation', async () => {
    setSupabaseHappyPath();
    const bad = JSON.stringify({ selected_code: '7318.15.00', missing_other_fields: true });
    queueModelResponses(bad, bad);

    const result = await select(input());
    expect(result.selected_code).toBeNull();
    expect(result.refusal).not.toBeNull();
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});

/* ---------------------------------------------------------------------------
 * Vertex error propagation
 * --------------------------------------------------------------------------- */

describe('L4 select — vertex error propagation', () => {
  it('MaxTokensError thrown by vertex-client propagates to caller', async () => {
    setSupabaseHappyPath();
    const { MaxTokensError } = await import('../lib/vertex-client');
    generateContentMock.mockRejectedValueOnce(
      new MaxTokensError('partial', { promptTokens: 1, outputTokens: 0, thoughtsTokens: 4000, totalTokens: 4001 }, 'gemini-3.5-flash'),
    );

    await expect(select(input())).rejects.toThrow(/MaxTokensError|gemini-3\.5-flash/);
  });

  it('does NOT re-implement retry/backoff — single attempt per Vertex call', async () => {
    // vertex-client already retries 5xx/429 internally. L4's only "retry" is for
    // JSON/schema/hallucination — and that's a fresh call, not a retry of the
    // same call. So a single non-retryable error should propagate immediately.
    setSupabaseHappyPath();
    generateContentMock.mockRejectedValueOnce(new Error('Vertex 403: permission denied'));

    await expect(select(input())).rejects.toThrow(/permission denied/);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------------
 * GIR enum coverage
 * --------------------------------------------------------------------------- */

describe('L4 select — GIR enum coverage', () => {
  const girs: Array<SelectOutput['citation']['gir_applied']> = [
    'GIR-1', 'GIR-2(a)', 'GIR-2(b)', 'GIR-3(a)', 'GIR-3(c)',
    'GIR-4', 'GIR-5(a)', 'GIR-5(b)', 'GIR-6',
  ];
  for (const gir of girs) {
    it(`accepts CLASSIFY with gir_applied=${gir}`, async () => {
      setSupabaseHappyPath();
      const out = validClassifyOutput({
        citation: { primary: validClassifyOutput().citation.primary, gir_applied: gir },
      });
      queueModelResponses(JSON.stringify(out));

      const result = await select(input());
      expect(result.citation.gir_applied).toBe(gir);
    });
  }
});

/* ---------------------------------------------------------------------------
 * isSelectOutput — direct unit tests on the validator
 * --------------------------------------------------------------------------- */

describe('L4 select — isSelectOutput validator', () => {
  it('accepts a fully-formed CLASSIFY output', () => {
    expect(isSelectOutput(validClassifyOutput())).toBe(true);
  });

  it('accepts a fully-formed REFUSE output', () => {
    expect(isSelectOutput(validRefuseOutput())).toBe(true);
  });

  it('rejects reasoning_chain shorter than 2', () => {
    const bad = validClassifyOutput({ reasoning_chain: ['only one'] });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects reasoning_chain longer than 5', () => {
    const bad = validClassifyOutput({
      reasoning_chain: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects gir_applied outside the GIR enum', () => {
    const bad = validClassifyOutput({
      citation: {
        primary: validClassifyOutput().citation.primary,
        gir_applied: 'GIR-99' as unknown as 'GIR-1',
      },
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects selected_code that does not match the code regex', () => {
    const bad = validClassifyOutput({ selected_code: 'NOTACODE' });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects 6-digit code when selected_code_is_six_digit=false', () => {
    const bad = validClassifyOutput({
      selected_code: '3301.22',
      selected_code_is_six_digit: false,
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects 8-digit code when selected_code_is_six_digit=true', () => {
    const bad = validClassifyOutput({
      selected_code: '7318.15.00',
      selected_code_is_six_digit: true,
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects REFUSE with non-null export_policy', () => {
    const bad: SelectOutput = { ...validRefuseOutput(), export_policy: 'Free' };
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects CLASSIFY with non-null refusal', () => {
    const bad: SelectOutput = { ...validClassifyOutput(), refusal: { reason: 'no' } };
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects GIR-3(b) without components array', () => {
    const bad: SelectOutput = { ...gir3bOutput(), components: null };
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects component with invalid role', () => {
    const bad = gir3bOutput();
    (bad.components![0] as unknown as { role: string }).role = 'tertiary';
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects alternatives_considered with non-code strings', () => {
    const bad = validClassifyOutput({ alternatives_considered: ['nope'] });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects alternatives_considered with > 4 entries', () => {
    const bad = validClassifyOutput({
      alternatives_considered: [
        '7318.16.00', '7318.17.00', '7318.18.00', '7318.19.00', '7318.21.00',
      ],
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects citation.primary with empty verbatim_text', () => {
    const bad = validClassifyOutput({
      citation: {
        primary: {
          ...validClassifyOutput().citation.primary,
          verbatim_text: '',
        },
        gir_applied: 'GIR-1',
      },
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects citation.primary with empty source_ref', () => {
    const bad = validClassifyOutput({
      citation: {
        primary: {
          ...validClassifyOutput().citation.primary,
          source_ref: '',
        },
        gir_applied: 'GIR-1',
      },
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects citation.primary.type outside enum', () => {
    const bad = validClassifyOutput({
      citation: {
        primary: {
          ...validClassifyOutput().citation.primary,
          type: 'unknown_type' as unknown as 'note',
        },
        gir_applied: 'GIR-1',
      },
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects exclusions_checked with non-integer entries', () => {
    const bad: unknown = {
      ...validClassifyOutput(),
      exclusions_checked: ['not_a_number'] as unknown as number[],
    };
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects self_confidence outside HIGH|MEDIUM|LOW', () => {
    const bad = validClassifyOutput({
      self_confidence: 'GREAT' as unknown as 'HIGH',
    });
    expect(isSelectOutput(bad)).toBe(false);
  });

  it('rejects REFUSE with self_confidence=HIGH', () => {
    const bad: SelectOutput = { ...validRefuseOutput(), self_confidence: 'HIGH' };
    expect(isSelectOutput(bad)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Misc edge cases — exclusions_checked + matched_exclusions passthrough
 * --------------------------------------------------------------------------- */

describe('L4 select — matched_exclusions passthrough', () => {
  it('renders matched_exclusions from input into the user prompt block', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput({
      exclusions_checked: [842],
    })));

    const ex: ExclusionMatch = {
      exclusion_id:          842,
      source_chapter:        '87',
      excluded_product_text: 'joints, washers ... vulcanised rubber',
      redirects_to_chapter:  ['40'],
      affected_codes:        ['4016.99.90'],
    };
    await select(input({ matched_exclusions: [ex] }));
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('842');
    expect(call.prompt).toContain('joints, washers');
  });
});

/* ---------------------------------------------------------------------------
 * Internal helpers — chaptersFromCandidates / hydrateCandidateRow
 * --------------------------------------------------------------------------- */

describe('L4 select — internal helpers', () => {
  it('chaptersFromCandidates dedups + sorts chapter codes', () => {
    const cands: RetrievalCandidate[] = [
      candidate('7318.15.00', '73'),
      candidate('4016.99.90', '40'),
      candidate('7318.16.00', '73'),
    ];
    const out = _internal.chaptersFromCandidates(cands);
    expect(out).toEqual(['40', '73']);
  });

  it('hydrateCandidateRow falls back to stub when DB row is missing', () => {
    const cand = candidate('7318.15.00', '73');
    const row = _internal.hydrateCandidateRow(cand, undefined);
    expect(row.code).toBe('7318.15.00');
    expect(row.description).toBe('');
    expect(row.chapter).toBe('73');
  });

  it('syntheticRefuse produces a structure that passes isSelectOutput', () => {
    const r = _internal.syntheticRefuse('test reason');
    expect(isSelectOutput(r)).toBe(true);
    expect(r.selected_code).toBeNull();
    expect(r.refusal).not.toBeNull();
  });

  it('renderRepairBlock returns empty string when failures is null/empty', () => {
    expect(_internal.renderRepairBlock(null)).toBe('');
    expect(_internal.renderRepairBlock(undefined)).toBe('');
    expect(_internal.renderRepairBlock([])).toBe('');
  });
});

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
 * Prompt content — GIR 2(a) parts rule + Note-2 bounding + Ch.95 Note 1(c)
 *
 * The parts-classification logic lives in the select-v2.md system prompt (L4 is
 * prompt-driven; no TS branch decides chapter). These assertions guard that the
 * HS-grounded reasoning rules and their legal bounds remain present, so a future
 * prompt edit cannot silently delete them. See backend/prompts/select-v2.md
 * Step 2a (parts rule) and Step 2b (heading-scope / Ch.95 Note 1(c)).
 * --------------------------------------------------------------------------- */

describe('L4 select — prompt encodes the GIR 2(a) parts rule (HS-grounded, bounded)', () => {
  const fs = require('fs') as typeof import('fs');
  const sys = (): string =>
    _internal.parsePrompt(fs.readFileSync(_getPromptPathForTesting(), 'utf8'))
      .systemInstruction;

  it('states the parts principle: solely/principally-for-host classifies with the host, not by material', () => {
    const s = sys();
    expect(s).toMatch(/solely or principally/i);
    // The principle must explicitly reject material-based routing for parts.
    expect(s).toMatch(/NOT by (?:the )?(?:its )?(?:constituent )?material/i);
    // Anchored to the controlling section notes for machine/vehicle parts.
    expect(s).toContain('Section XVI Note 2');
    expect(s).toContain('Section XVII Note 3');
    // The canonical vehicle-parts heading.
    expect(s).toContain('8708');
  });

  it('BOUNDS the parts rule with the Section XVI/XVII Note-2 exclusions (no over-routing)', () => {
    const s = sys();
    // Pumps / machines of 8401-8479 stay in Chapter 84 (the fuel-injection-pump guard).
    expect(s).toContain('8401');
    expect(s).toContain('8479');
    expect(s).toMatch(/Note 2\(e\)/);
    expect(s).toMatch(/8413/); // fuel-injection pump heading
    // Electrical machinery -> Ch.85.
    expect(s).toMatch(/Chapter 85|Ch\.85/);
    // Parts of general use (base-metal bolts/springs) -> own headings (Section XV Note 2).
    expect(s).toMatch(/parts of general use/i);
    expect(s).toContain('Section XV Note 2');
    // Generic rubber 4016 / plastics Ch.39 may stay material-chapter when not solely a part.
    expect(s).toContain('4016');
    // Explicit anti-over-correction guard.
    expect(s).toMatch(/do NOT force-route|not force-route|Over-routing/i);
  });

  it('keeps genuinely dual-use parts as best-fit + MEDIUM confidence (not a forced rule)', () => {
    const s = sys();
    expect(s).toMatch(/ambiguous/i);
    expect(s).toMatch(/MEDIUM/);
  });

  it('encodes Chapter 95 Note 1(c): fishing monofilament not made up -> Section XI (5404), not Ch.95', () => {
    const s = sys();
    expect(s).toMatch(/Chapter 95 Note 1\(c\)|Ch\.95 Note 1\(c\)|95 Note 1\(c\)/);
    expect(s).toContain('5404');
    expect(s).toMatch(/made[- ]up/i);
    expect(s).toMatch(/Section XI/);
  });

  it('the closing user-template reminders restate the parts rule and its bound', () => {
    const tmpl = _internal.parsePrompt(
      fs.readFileSync(_getPromptPathForTesting(), 'utf8'),
    ).userTemplate;
    expect(tmpl).toMatch(/PARTS RULE/);
    expect(tmpl).toContain('8708');
    expect(tmpl).toContain('Ch.84');
    expect(tmpl).toMatch(/HEADING-SCOPE/);
    expect(tmpl).toContain('5404');
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
    // 8192 (was 4096): the model max_output_tokens ceiling — reserves ample room
    // for a full CLASSIFY response beyond the low-thinking budget (no MAX_TOKENS).
    expect(call.maxOutputTokens).toBe(8192);
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

/* ---------------------------------------------------------------------------
 * Sibling-discrimination surface — computeSiblingDiscriminators
 *
 * The highest-leverage leaf-precision fix: when ≥2 candidates share a 6-digit
 * subheading, surface ONLY the attribute fields that DIFFER between them so L4
 * has an explicit comparison surface. General (any chapter), no per-case logic.
 * --------------------------------------------------------------------------- */

describe('L4 select — computeSiblingDiscriminators (differing-attribute diff)', () => {
  const compute = _internal.computeSiblingDiscriminators;

  it('surfaces ONLY the field that differs between two siblings (tyre car vs truck pattern)', () => {
    // Two 8-digit leaves under the SAME subheading 4011.10 differing only on intended_use.
    const cands: RetrievalCandidate[] = [
      candidate('4011.10.10', '40'),
      candidate('4011.10.90', '40'),
    ];
    const tla: Record<string, unknown> = {
      '4011.10.10': {
        material: ['rubber'], form: ['new-pneumatic'], function: ['tyre'],
        intended_use: ['passenger-motor-car'], processing_state: ['finished'],
        composition: [], composite_components: null,
      },
      '4011.10.90': {
        material: ['rubber'], form: ['new-pneumatic'], function: ['tyre'],
        intended_use: ['other'], processing_state: ['finished'],
        composition: [], composite_components: null,
      },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    const g = groups[0];
    expect(g.subheading).toBe('4011.10');
    expect(g.codes).toEqual(['4011.10.10', '4011.10.90']);
    // Only intended_use differs; identical fields (material/form/function/...) omitted.
    expect(g.differing_fields).toEqual(['intended_use']);
    expect(g.values_by_field.intended_use['4011.10.10']).toEqual(['passenger-motor-car']);
    expect(g.values_by_field.intended_use['4011.10.90']).toEqual(['other']);
    // Identical fields must NOT appear in the diff surface.
    expect(g.differing_fields).not.toContain('material');
    expect(g.values_by_field.material).toBeUndefined();
  });

  it('omits a sibling group entirely when ALL fields are identical (no discriminator)', () => {
    const cands: RetrievalCandidate[] = [
      candidate('5208.11.10', '52'),
      candidate('5208.11.20', '52'),
    ];
    const identical = {
      material: ['cotton'], form: ['woven'], function: [], intended_use: [],
      processing_state: ['unbleached'], composition: [], composite_components: null,
    };
    const groups = compute(cands, { '5208.11.10': identical, '5208.11.20': identical });
    // All-identical siblings have no discriminator → the group is OMITTED entirely
    // (an empty-diff group is not actionable and only pollutes the prompt).
    expect(groups).toEqual([]);
  });

  it('produces NO group when candidates do not share a subheading (non-siblings)', () => {
    const cands: RetrievalCandidate[] = [
      candidate('4011.10.10', '40'),
      candidate('4011.20.10', '40'), // different subheading 4011.20
      candidate('7318.15.00', '73'), // different chapter entirely
    ];
    const tla: Record<string, unknown> = {
      '4011.10.10': { intended_use: ['car'] },
      '4011.20.10': { intended_use: ['truck'] },
      '7318.15.00': { intended_use: ['industrial'] },
    };
    const groups = compute(cands, tla);
    expect(groups).toEqual([]);
  });

  it('forms multiple independent groups and diffs each by its own subheading', () => {
    const cands: RetrievalCandidate[] = [
      candidate('4011.10.10', '40'),
      candidate('4011.10.90', '40'),
      candidate('4011.20.10', '40'),
      candidate('4011.20.90', '40'),
    ];
    const tla: Record<string, unknown> = {
      '4011.10.10': { intended_use: ['car'], form: ['radial'] },
      '4011.10.90': { intended_use: ['other'], form: ['radial'] },
      '4011.20.10': { intended_use: ['bus'], form: ['radial'] },
      '4011.20.90': { intended_use: ['other'], form: ['radial'] },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(2);
    const bySub = Object.fromEntries(groups.map((g) => [g.subheading, g]));
    expect(bySub['4011.10'].differing_fields).toEqual(['intended_use']);
    expect(bySub['4011.20'].differing_fields).toEqual(['intended_use']);
    // form is identical within each group → omitted.
    expect(bySub['4011.10'].differing_fields).not.toContain('form');
  });

  it('treats a present-vs-absent attribute record as a difference (missing TLA → null)', () => {
    const cands: RetrievalCandidate[] = [
      candidate('4011.10.10', '40'),
      candidate('4011.10.90', '40'),
    ];
    // Only the first code has a TLA record; the second is missing entirely.
    const tla: Record<string, unknown> = {
      '4011.10.10': { intended_use: ['car'] },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    expect(groups[0].differing_fields).toEqual(['intended_use']);
    expect(groups[0].values_by_field.intended_use['4011.10.10']).toEqual(['car']);
    expect(groups[0].values_by_field.intended_use['4011.10.90']).toBeNull();
  });

  it('array comparison is order-insensitive (same set in different order ⇒ NOT differing)', () => {
    const cands: RetrievalCandidate[] = [
      candidate('7208.10.10', '72'),
      candidate('7208.10.20', '72'),
    ];
    const tla: Record<string, unknown> = {
      '7208.10.10': { material: ['iron', 'steel'], form: ['coil'] },
      '7208.10.20': { material: ['steel', 'iron'], form: ['sheet'] },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    // material is the same SET (order-insensitive) → not differing; only form differs.
    expect(groups[0].differing_fields).toEqual(['form']);
  });

  it('derives the subheading from an 8-digit code when parent_chain.subheading is null', () => {
    const c1 = candidate('4011.10.10', '40');
    const c2 = candidate('4011.10.90', '40');
    c1.parent_chain.subheading = null;
    c2.parent_chain.subheading = null;
    const groups = compute([c1, c2], {
      '4011.10.10': { intended_use: ['car'] },
      '4011.10.90': { intended_use: ['other'] },
    });
    expect(groups.length).toBe(1);
    expect(groups[0].subheading).toBe('4011.10');
  });

  it('subheadingOf resolves NNNN.NN from parent_chain, 8-digit code, or 6-digit code', () => {
    expect(_internal.subheadingOf(candidate('4011.10.10', '40'))).toBe('4011.10');
    const sixDigit: RetrievalCandidate = {
      code: '3301.22', level: 'subheading', cosine_score: 0.9, fts_rank: null,
      rerank_score: 0.9,
      parent_chain: { chapter: '33', heading: '3301', subheading: '3301.22', tariff_line: null },
    };
    expect(_internal.subheadingOf(sixDigit)).toBe('3301.22');
  });

  it('returns [] for an empty candidate set', () => {
    expect(compute([], {})).toEqual([]);
  });

  /* -- METADATA-only sibling splits (the over-defer fix) -------------------- */

  it('surfaces a METADATA-only discriminator (fabric_construction: knitted vs woven, Ch.61/62)', () => {
    // Two leaves under the SAME subheading whose CORE fields are identical and
    // differ ONLY on the metadata column fabric_construction. Pre-fix these
    // looked identical (core-only diff) → no discriminator → over-defer.
    const cands: RetrievalCandidate[] = [
      candidate('6109.10.10', '61'),
      candidate('6109.10.20', '61'),
    ];
    const tla: Record<string, unknown> = {
      '6109.10.10': {
        material: ['cotton'], form: ['shirt'], function: [], intended_use: [],
        processing_state: ['finished'], composition: [], composite_components: null,
        fabric_construction: 'knitted',
      },
      '6109.10.20': {
        material: ['cotton'], form: ['shirt'], function: [], intended_use: [],
        processing_state: ['finished'], composition: [], composite_components: null,
        fabric_construction: 'woven',
      },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    expect(groups[0].differing_fields).toEqual(['fabric_construction']);
    expect(groups[0].values_by_field.fabric_construction['6109.10.10']).toBe('knitted');
    expect(groups[0].values_by_field.fabric_construction['6109.10.20']).toBe('woven');
    // core fields are identical → must NOT appear in the diff
    expect(groups[0].differing_fields).not.toContain('material');
  });

  it('surfaces a NUMERIC metadata discriminator (carbon_pct, Ch.72 steel grade)', () => {
    const cands: RetrievalCandidate[] = [
      candidate('7213.91.10', '72'),
      candidate('7213.91.20', '72'),
    ];
    const tla: Record<string, unknown> = {
      '7213.91.10': { material: ['steel'], form: ['bar'], carbon_pct: 0.1 },
      '7213.91.20': { material: ['steel'], form: ['bar'], carbon_pct: 0.8 },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    expect(groups[0].differing_fields).toEqual(['carbon_pct']);
    expect(groups[0].values_by_field.carbon_pct['7213.91.10']).toBe(0.1);
    expect(groups[0].values_by_field.carbon_pct['7213.91.20']).toBe(0.8);
  });

  it('surfaces a chemical_class metadata discriminator (Ch.27/29 compound vs isomer mix)', () => {
    // Same subheading 2902.20 → genuine siblings differing only on chemical_class.
    const cands: RetrievalCandidate[] = [
      candidate('2902.20.10', '29'),
      candidate('2902.20.20', '29'),
    ];
    const tla: Record<string, unknown> = {
      '2902.20.10': { material: ['benzene'], chemical_class: 'separate_organic_compound' },
      '2902.20.20': { material: ['benzene'], chemical_class: 'isomer_mixture' },
    };
    const groups = compute(cands, tla);
    expect(groups.length).toBe(1);
    expect(groups[0].differing_fields).toEqual(['chemical_class']);
  });
});

/* ---------------------------------------------------------------------------
 * projectCoreAttributes — token discipline: per-candidate block stays lean
 * --------------------------------------------------------------------------- */

describe('L4 select — projectCoreAttributes (lean per-candidate block)', () => {
  const project = _internal.projectCoreAttributes;

  it('keeps ONLY the 7 core keys, dropping every metadata column', () => {
    const wide: Record<string, unknown> = {
      '6109.10.10': {
        material: ['cotton'], form: ['shirt'], function: [], intended_use: [],
        processing_state: ['finished'], composition: [], composite_components: null,
        // metadata that MUST be stripped from the per-candidate injected block
        fabric_construction: 'knitted', chemical_class: 'other', predominant_element: 'iron',
        carbon_pct: 0.25, iron_pct: 98.5, made_up: true, intended_role: 'support',
        in_solution: false,
      },
    };
    const lean = project(wide)['6109.10.10'] as Record<string, unknown>;
    expect(Object.keys(lean).sort()).toEqual([
      'composite_components', 'composition', 'form', 'function',
      'intended_use', 'material', 'processing_state',
    ]);
    expect('fabric_construction' in lean).toBe(false);
    expect('carbon_pct' in lean).toBe(false);
    expect('predominant_element' in lean).toBe(false);
    expect('made_up' in lean).toBe(false);
    // core values preserved verbatim
    expect(lean.material).toEqual(['cotton']);
  });

  it('passes through non-object / missing records unchanged (O2 gap tolerance)', () => {
    const wide: Record<string, unknown> = {
      'A': null,
      'B': 'unexpected-scalar',
      'C': [1, 2, 3],
    };
    expect(project(wide)).toEqual({ A: null, B: 'unexpected-scalar', C: [1, 2, 3] });
  });

  it('only copies core keys that are actually present (no fabricated keys)', () => {
    const wide: Record<string, unknown> = {
      'X': { material: ['steel'], carbon_pct: 0.5 }, // partial record
    };
    const lean = project(wide)['X'] as Record<string, unknown>;
    expect(lean).toEqual({ material: ['steel'] });
  });
});

/* ---------------------------------------------------------------------------
 * gatherSelectContext — wide diff vs lean injected block
 * --------------------------------------------------------------------------- */

describe('L4 select — wide sibling-diff but lean per-candidate injection', () => {
  it('diffs on a metadata column yet injects ONLY core fields per candidate', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([
      dbRow('6109.10.10', '61'),
      dbRow('6109.10.20', '61'),
    ]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    // Wide record: identical core, differ only on fabric_construction (metadata).
    getTariffLineAttributesForCodesMock.mockResolvedValue({
      '6109.10.10': {
        material: ['cotton'], form: ['shirt'], function: [], intended_use: [],
        processing_state: ['finished'], composition: [], composite_components: null,
        fabric_construction: 'knitted',
      },
      '6109.10.20': {
        material: ['cotton'], form: ['shirt'], function: [], intended_use: [],
        processing_state: ['finished'], composition: [], composite_components: null,
        fabric_construction: 'woven',
      },
    });

    const ctx = await gatherSelectContext(input({
      candidate_chapters:  ['61'],
      filtered_candidates: [candidate('6109.10.10', '61'), candidate('6109.10.20', '61')],
    }));

    // (1) Sibling diff DID surface the metadata-only discriminator.
    expect(ctx.sibling_discriminators.length).toBe(1);
    expect(ctx.sibling_discriminators[0].differing_fields).toEqual(['fabric_construction']);

    // (2) The per-candidate injected block is LEAN — metadata stripped.
    const inj = ctx.tariff_line_attributes['6109.10.10'] as Record<string, unknown>;
    expect('fabric_construction' in inj).toBe(false);
    expect(inj.material).toEqual(['cotton']);
  });

  it('renders the metadata discriminator into SIBLING_DISCRIMINATORS but NOT into the per-candidate block', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([
      dbRow('6109.10.10', '61'),
      dbRow('6109.10.20', '61'),
    ]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({
      '6109.10.10': { material: ['cotton'], form: ['shirt'], fabric_construction: 'knitted' },
      '6109.10.20': { material: ['cotton'], form: ['shirt'], fabric_construction: 'woven' },
    });
    queueModelResponses(JSON.stringify(validClassifyOutput({
      selected_code: '6109.10.10',
      alternatives_considered: ['6109.10.20'],
    })));

    await select(input({
      candidate_chapters:  ['61'],
      filtered_candidates: [candidate('6109.10.10', '61'), candidate('6109.10.20', '61')],
    }));
    const call = generateContentMock.mock.calls[0][0];
    const prompt = call.prompt as string;

    // The discriminator name appears in the prompt (via the sibling-diff block).
    expect(prompt).toContain('fabric_construction');

    // Token discipline: it must NOT leak into the TARIFF_LINE_ATTRIBUTES block.
    // Isolate that block and assert fabric_construction is absent from it.
    const tlaStart = prompt.indexOf('TARIFF_LINE_ATTRIBUTES');
    const sibStart = prompt.indexOf('SIBLING_DISCRIMINATORS');
    expect(tlaStart).toBeGreaterThanOrEqual(0);
    expect(sibStart).toBeGreaterThan(tlaStart);
    const tlaBlock = prompt.slice(tlaStart, sibStart);
    expect(tlaBlock).not.toContain('fabric_construction');
  });
});

/* ---------------------------------------------------------------------------
 * Sibling-discrimination — wiring into gatherSelectContext + prompt directive
 * --------------------------------------------------------------------------- */

describe('L4 select — sibling_discriminators wired into context + prompt', () => {
  it('gatherSelectContext computes sibling_discriminators from candidates + TLA', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([
      dbRow('4011.10.10', '40'),
      dbRow('4011.10.90', '40'),
    ]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({
      '4011.10.10': { intended_use: ['passenger-motor-car'], material: ['rubber'] },
      '4011.10.90': { intended_use: ['other'],               material: ['rubber'] },
    });

    const ctx = await gatherSelectContext(input({
      candidate_chapters:  ['40'],
      filtered_candidates: [candidate('4011.10.10', '40'), candidate('4011.10.90', '40')],
    }));
    expect(ctx.sibling_discriminators.length).toBe(1);
    expect(ctx.sibling_discriminators[0].subheading).toBe('4011.10');
    expect(ctx.sibling_discriminators[0].differing_fields).toEqual(['intended_use']);
  });

  it('renders SIBLING_DISCRIMINATORS block into the user prompt with the differing field', async () => {
    getSelectCandidateRowsMock.mockResolvedValue([
      dbRow('4011.10.10', '40'),
      dbRow('4011.10.90', '40'),
    ]);
    getChapterNotesBundlesMock.mockResolvedValue([]);
    getNotesClaimsForChaptersMock.mockResolvedValue([]);
    getTariffLineAttributesForCodesMock.mockResolvedValue({
      '4011.10.10': { intended_use: ['passenger-motor-car'] },
      '4011.10.90': { intended_use: ['other'] },
    });
    queueModelResponses(JSON.stringify(validClassifyOutput({
      selected_code: '4011.10.10',
      alternatives_considered: ['4011.10.90'],
    })));

    await select(input({
      candidate_chapters:  ['40'],
      filtered_candidates: [candidate('4011.10.10', '40'), candidate('4011.10.90', '40')],
    }));
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('SIBLING_DISCRIMINATORS');
    expect(call.prompt).toContain('4011.10');
    expect(call.prompt).toContain('differing_fields');
    expect(call.prompt).toContain('intended_use');
  });

  it('renders an empty SIBLING_DISCRIMINATORS array when no candidates are siblings', async () => {
    setSupabaseHappyPath();
    queueModelResponses(JSON.stringify(validClassifyOutput()));

    // Default input has 7318.15.00 + 7318.16.00 — different subheadings (7318.15 vs 7318.16).
    await select(input());
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('SIBLING_DISCRIMINATORS');
    // The substituted value is an empty JSON array.
    expect(call.prompt).toMatch(/SIBLING_DISCRIMINATORS[^\n]*\n\[\]/);
  });
});

/* ---------------------------------------------------------------------------
 * Prompt content — SIBLING DISCRIMINATION directive must be present
 * --------------------------------------------------------------------------- */

describe('L4 select — prompt encodes the SIBLING DISCRIMINATION directive', () => {
  const fs = require('fs') as typeof import('fs');
  const parsed = () =>
    _internal.parsePrompt(fs.readFileSync(_getPromptPathForTesting(), 'utf8'));

  it('system prompt documents the {sibling_discriminators} input + Step 3a directive', () => {
    const s = parsed().systemInstruction;
    expect(s).toContain('{sibling_discriminators}');
    expect(s).toMatch(/SIBLING DISCRIMINATION/);
    // Directive must instruct selecting the leaf whose differing-field values match the query.
    expect(s).toContain('differing_fields');
    // And the safety rule: silent-on-discriminator ⇒ prefer general/residual, do not guess.
    expect(s).toMatch(/silent/i);
    expect(s).toMatch(/general|residual|Other/);
    expect(s).toMatch(/do NOT guess|not guess/i);
    // General across chapters, not a per-case hack.
    expect(s).toMatch(/any.*chapter|GENERAL/i);
  });

  it('user template includes the SIBLING_DISCRIMINATORS block + closing reminder', () => {
    const tmpl = parsed().userTemplate;
    expect(tmpl).toContain('SIBLING_DISCRIMINATORS');
    expect(tmpl).toContain('{sibling_discriminators}');
    expect(tmpl).toMatch(/SIBLING DISCRIMINATION/);
  });

  it('Step 3a names METADATA discriminators with equal weight to core ones', () => {
    const s = parsed().systemInstruction;
    // The diff can split on a metadata column — these must be named so the model
    // treats them as decisive, not ignorable.
    expect(s).toContain('fabric_construction');
    expect(s).toContain('chemical_class');
    expect(s).toContain('predominant_element');
    expect(s).toMatch(/carbon_pct/);
    // Equal-weight instruction (metadata is just as legally decisive at the leaf).
    expect(s).toMatch(/same weight|equal weight|just as legally decisive/i);
  });

  it('Step 3a TIGHTENS the defer rule: resolve from query text, defer ONLY when genuinely silent', () => {
    const s = parsed().systemInstruction;
    // Must resolve from the query text, not only the named extracted_attributes keys.
    expect(s).toMatch(/\{query\} text|query text/i);
    // The over-defer guard: if the query resolves the splitter, pick that leaf.
    expect(s).toMatch(/do NOT defer .* when the evidence is present|MUST pick that specific leaf/i);
    // Defer ONLY when genuinely silent (not merely because the splitter is metadata).
    expect(s).toMatch(/genuinely SILENT|genuinely silent/i);
  });
});

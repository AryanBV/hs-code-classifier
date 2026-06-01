/**
 * Unit tests for Layer 1 Triage.
 *
 * Framework: vitest. Mocks `generateContent` from `../lib/vertex-client` so
 * no real Vertex calls happen. Asserts the prompt-rendering, retry logic,
 * Q-budget enforcement, and constraint-hint enforcement contracts.
 *
 * Run:
 *   cd backend && npx vitest run src/classifier-v2/layers/L1-triage.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConstraintHint,
  TriageExtractedAttributes,
  TriageInput,
  TriageOutput,
} from '../types';

// ---- Mock the LLM provider seam BEFORE importing the SUT --------------------
// L1 now imports `generateContent` from the A2 provider seam (`../lib/llm-provider`),
// so the mock targets that module (not `../lib/vertex-client`).
const generateContentMock = vi.fn();

vi.mock('../lib/llm-provider', () => ({
  generateContent: (...args: unknown[]) => generateContentMock(...args),
}));

// Now import the SUT (after the mock is registered).
import {
  _clearPromptCacheForTesting,
  _getPromptPathForTesting,
  _internal,
  triage,
} from './L1-triage';

/* ---------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------- */

function fullAttrs(): TriageExtractedAttributes {
  return {
    material:                    'cotton',
    material_confidence:         0.95,
    form:                        't-shirt',
    form_confidence:             0.95,
    function:                    'apparel',
    function_confidence:         0.85,
    intended_use:                'retail',
    intended_use_confidence:     0.9,
    processing_state:            'knitted, made up',
    processing_state_confidence: 0.95,
    composition:                 null,
    composition_confidence:      null,
    head_nouns_for_fts:          ['t-shirt', 'cotton', 'knitted'],
    raw_tokens:                  ['ladies', 'retail'],
  };
}

function emptyAttrs(): TriageExtractedAttributes {
  return {
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
  };
}

function classifyOutput(): TriageOutput {
  return {
    decision:             'CLASSIFY',
    extracted_attributes: fullAttrs(),
    candidate_chapters:   ['61'],
    completeness_signal:  0.9,
    clarifying_question:  null,
    refusal_reason:       null,
    out_of_scope_class:   null,
  };
}

function askOutput(candidateChapters: string[] = ['40', '87']): TriageOutput {
  return {
    decision:             'ASK',
    extracted_attributes: fullAttrs(),
    candidate_chapters:   candidateChapters,
    completeness_signal:  0.55,
    clarifying_question:  {
      discriminating_attribute: 'composition',
      fallback_question_text:   'Is the bushing solid rubber, or does it include a metal sleeve?',
      fallback_options: [
        { id: 'solid_rubber',  label: 'Solid rubber, no metal' },
        { id: 'metal_sleeve',  label: 'Includes a metal sleeve' },
        { id: 'unsure',        label: "I'm not sure" },
      ],
    },
    refusal_reason:       null,
    out_of_scope_class:   null,
  };
}

function refuseOutput(klass: TriageOutput['out_of_scope_class']): TriageOutput {
  return {
    decision:             'REFUSE',
    extracted_attributes: emptyAttrs(),
    candidate_chapters:   [],
    completeness_signal:  0.1,
    clarifying_question:  null,
    refusal_reason:       'Refusing per test fixture.',
    out_of_scope_class:   klass,
  };
}

function input(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    normalized_query:   'stainless steel hex bolts',
    previousAnswers:    {},
    q_budget_remaining: 3,
    constraint_hint:    null,
    ...overrides,
  };
}

/** Helper: queue mock responses (text). */
function queueResponses(...texts: string[]): void {
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

/* ---------------------------------------------------------------------------
 * Lifecycle
 * --------------------------------------------------------------------------- */

beforeEach(() => {
  _clearPromptCacheForTesting();
  generateContentMock.mockReset();
  // Silence console.log during tests.
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  _clearPromptCacheForTesting();
});

/* ---------------------------------------------------------------------------
 * Prompt parsing + rendering
 * --------------------------------------------------------------------------- */

describe('L1 triage — prompt parsing', () => {
  it('resolves a path to backend/prompts/triage-v2.md', () => {
    const p = _getPromptPathForTesting();
    expect(p).toMatch(/triage-v2\.md$/);
  });

  it('parsePrompt extracts the three sections from triage-v2.md', () => {
    const fs = require('fs') as typeof import('fs');
    const raw = fs.readFileSync(_getPromptPathForTesting(), 'utf8');
    const parsed = _internal.parsePrompt(raw);
    expect(parsed.systemInstruction.length).toBeGreaterThan(100);
    expect(parsed.systemInstruction).toContain('## SYSTEM PROMPT');
    // System block should NOT spill into the user template region.
    expect(parsed.systemInstruction).not.toContain('## USER PROMPT TEMPLATE');
    expect(parsed.userTemplate).toContain('QUERY:');
    expect(parsed.userTemplate).toContain('PREVIOUS_ANSWERS');
    expect(parsed.userTemplate).toContain('Q_BUDGET_REMAINING');
    expect(parsed.responseSchema.type).toBe('object');
    expect(parsed.responseSchema.required).toBeDefined();
  });
});

describe('L1 triage — template rendering', () => {
  it('substitutes {query}, {previousAnswers}, {q_budget_remaining}', () => {
    const tmpl = 'QUERY: {query}\nPREVIOUS_ANSWERS: {previousAnswers}\nQ: {q_budget_remaining}';
    const out = _internal.renderTemplate(tmpl, {
      query:              'cotton t-shirt',
      previousAnswers:    JSON.stringify({ q1: 'a' }),
      q_budget_remaining: 2,
      constraint_hint:    null,
    });
    expect(out).toContain('QUERY: cotton t-shirt');
    expect(out).toContain('PREVIOUS_ANSWERS: {"q1":"a"}');
    expect(out).toContain('Q: 2');
  });

  it('omits the {{#if constraint_hint}} block when constraint_hint is null', () => {
    const tmpl = 'before {{#if constraint_hint}}HINT: {{constraint_hint.reason}}{{/if}} after';
    const out = _internal.renderTemplate(tmpl, {
      query:              'q',
      previousAnswers:    '{}',
      q_budget_remaining: 3,
      constraint_hint:    null,
    });
    expect(out).toBe('before  after');
    expect(out).not.toContain('HINT');
  });

  it('renders the {{#if constraint_hint}} block when constraint_hint is set', () => {
    const tmpl =
      'before {{#if constraint_hint}}EXCL={{constraint_hint.exclude_chapters}} ' +
      'PREF={{constraint_hint.prefer_chapters}} R={{constraint_hint.reason}}{{/if}} after';
    const hint: ConstraintHint = {
      exclude_chapters:    ['39'],
      prefer_chapters:     ['29', '34'],
      reason:              'Ch.39 excluded',
      source_exclusion_id: 42,
    };
    const out = _internal.renderTemplate(tmpl, {
      query:              'q',
      previousAnswers:    '{}',
      q_budget_remaining: 3,
      constraint_hint:    hint,
    });
    expect(out).toContain('EXCL=["39"]');
    expect(out).toContain('PREF=["29","34"]');
    expect(out).toContain('R=Ch.39 excluded');
  });
});

/* ---------------------------------------------------------------------------
 * Happy-path parsing
 * --------------------------------------------------------------------------- */

describe('L1 triage — CLASSIFY parse', () => {
  it('returns parsed CLASSIFY output on first call', async () => {
    const out = classifyOutput();
    queueResponses(JSON.stringify(out));
    const result = await triage(input());
    expect(result).toEqual(out);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('passes correct model+thinkingLevel+responseMimeType to vertex-client', async () => {
    queueResponses(JSON.stringify(classifyOutput()));
    await triage(input());
    const call = generateContentMock.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.5-flash');
    expect(call.thinkingLevel).toBe('low');
    expect(call.responseMimeType).toBe('application/json');
    expect(call.temperature).toBe(0.0);
    expect(call.maxOutputTokens).toBe(2048);
    expect(call.systemInstruction).toContain('Triage stage');
    expect(call.prompt).toContain('QUERY: stainless steel hex bolts');
    expect(call.prompt).toContain('Q_BUDGET_REMAINING: 3');
    expect(call.responseSchema).toBeDefined();
    // No constraint-hint block on default invocation.
    expect(call.prompt).not.toContain('BACKTRACK CONSTRAINT');
  });
});

describe('L1 triage — ASK parse', () => {
  it('returns parsed ASK output with valid question shape', async () => {
    const out = askOutput();
    queueResponses(JSON.stringify(out));
    const result = await triage(input({ q_budget_remaining: 3 }));
    expect(result.decision).toBe('ASK');
    expect(result.clarifying_question).not.toBeNull();
    expect(result.clarifying_question!.discriminating_attribute).toBe('composition');
    expect(result.clarifying_question!.fallback_options.length).toBeGreaterThanOrEqual(2);
    expect(result.clarifying_question!.fallback_options.length).toBeLessThanOrEqual(4);
  });
});

describe('L1 triage — REFUSE parse (all out_of_scope_class values)', () => {
  const klasses = [
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
  for (const k of klasses) {
    it(`accepts REFUSE with out_of_scope_class=${k}`, async () => {
      queueResponses(JSON.stringify(refuseOutput(k)));
      const result = await triage(input());
      expect(result.decision).toBe('REFUSE');
      expect(result.out_of_scope_class).toBe(k);
    });
  }
});

/* ---------------------------------------------------------------------------
 * Retry-on-invalid-JSON
 * --------------------------------------------------------------------------- */

describe('L1 triage — JSON parse retry', () => {
  it('retries on invalid JSON then returns parsed on second call', async () => {
    queueResponses('not valid json !!!', JSON.stringify(classifyOutput()));
    const result = await triage(input());
    expect(result.decision).toBe('CLASSIFY');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns synthetic incoherent_query REFUSE when both calls fail to parse', async () => {
    queueResponses('garbage one', 'garbage two');
    const result = await triage(input());
    expect(result.decision).toBe('REFUSE');
    expect(result.out_of_scope_class).toBe('incoherent_query');
    expect(result.refusal_reason).toMatch(/invalid JSON/i);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns synthetic REFUSE when model output is valid JSON but fails schema validation', async () => {
    // valid JSON but missing required fields → not a TriageOutput
    const badOutput = JSON.stringify({ decision: 'CLASSIFY', something_else: true });
    queueResponses(badOutput, badOutput);
    const result = await triage(input());
    expect(result.decision).toBe('REFUSE');
    expect(result.out_of_scope_class).toBe('incoherent_query');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});

/* ---------------------------------------------------------------------------
 * Q-budget enforcement
 * --------------------------------------------------------------------------- */

describe('L1 triage — Q-budget enforcement', () => {
  it('overrides ASK → REFUSE function_only_no_substance when q_budget_remaining=0', async () => {
    queueResponses(JSON.stringify(askOutput()));
    const result = await triage(input({ q_budget_remaining: 0 }));
    expect(result.decision).toBe('REFUSE');
    expect(result.out_of_scope_class).toBe('function_only_no_substance');
    expect(result.clarifying_question).toBeNull();
  });

  it('does NOT override when q_budget_remaining > 0 and decision is ASK', async () => {
    queueResponses(JSON.stringify(askOutput()));
    const result = await triage(input({ q_budget_remaining: 2 }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT override when q_budget_remaining=0 and decision is CLASSIFY', async () => {
    queueResponses(JSON.stringify(classifyOutput()));
    const result = await triage(input({ q_budget_remaining: 0 }));
    expect(result.decision).toBe('CLASSIFY');
  });
});

/* ---------------------------------------------------------------------------
 * constraint_hint enforcement
 * --------------------------------------------------------------------------- */

describe('L1 triage — constraint_hint enforcement', () => {
  const hint: ConstraintHint = {
    exclude_chapters:    ['40'],
    prefer_chapters:     ['87'],
    reason:              'Ch.40 excluded by rule 123',
    source_exclusion_id: 123,
  };

  it('passes the BACKTRACK block into the prompt when constraint_hint is set', async () => {
    queueResponses(JSON.stringify({
      ...classifyOutput(),
      candidate_chapters: ['87'],
    }));
    await triage(input({ constraint_hint: hint }));
    const call = generateContentMock.mock.calls[0][0];
    expect(call.prompt).toContain('BACKTRACK CONSTRAINT');
    expect(call.prompt).toContain('EXCLUDED CHAPTERS');
    expect(call.prompt).toContain('["40"]');
    expect(call.prompt).toContain('["87"]');
    expect(call.prompt).toContain('Ch.40 excluded by rule 123');
  });

  it('returns parsed output when model respects the constraint', async () => {
    queueResponses(JSON.stringify({
      ...classifyOutput(),
      candidate_chapters: ['87'],
    }));
    const result = await triage(input({ constraint_hint: hint }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toEqual(['87']);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('retries once when model violates constraint_hint; succeeds on retry', async () => {
    queueResponses(
      JSON.stringify({ ...classifyOutput(), candidate_chapters: ['40'] }),   // violates
      JSON.stringify({ ...classifyOutput(), candidate_chapters: ['87'] }),   // OK
    );
    const result = await triage(input({ constraint_hint: hint }));
    expect(result.candidate_chapters).toEqual(['87']);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('returns REFUSE backtrack_no_fit when both attempts violate constraint', async () => {
    queueResponses(
      JSON.stringify({ ...classifyOutput(), candidate_chapters: ['40'] }),
      JSON.stringify({ ...classifyOutput(), candidate_chapters: ['40'] }),
    );
    const result = await triage(input({ constraint_hint: hint }));
    expect(result.decision).toBe('REFUSE');
    expect(result.out_of_scope_class).toBe('backtrack_no_fit');
    expect(result.refusal_reason).toContain('Ch.40 excluded by rule 123');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('does not check exclusions when constraint_hint is null', async () => {
    // candidate_chapters=['40'] would normally violate, but no hint = no check.
    queueResponses(JSON.stringify({
      ...classifyOutput(),
      candidate_chapters: ['40'],
    }));
    const result = await triage(input({ constraint_hint: null }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toEqual(['40']);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------------
 * Completeness recalibration — terse-but-specific should CLASSIFY (Round 1)
 * --------------------------------------------------------------------------- */

/**
 * Build an ASK output whose attributes carry a clear head-noun + the named
 * discriminators, routed to a SINGLE candidate chapter (no genuine competition).
 * This is the over-ask shape the recalibration must upgrade to CLASSIFY.
 */
function terseSpecificAsk(opts: {
  head_nouns: string[];
  material?: string | null;
  form?: string | null;
  intended_use?: string | null;
  candidate_chapters?: string[];
  completeness?: number;
}): TriageOutput {
  const attrs: TriageExtractedAttributes = {
    ...emptyAttrs(),
    material:             opts.material ?? null,
    material_confidence:  opts.material != null ? 0.9 : null,
    form:                 opts.form ?? null,
    form_confidence:      opts.form != null ? 0.9 : null,
    intended_use:         opts.intended_use ?? null,
    intended_use_confidence: opts.intended_use != null ? 0.9 : null,
    head_nouns_for_fts:   opts.head_nouns,
    raw_tokens:           [],
  };
  return {
    decision:             'ASK',
    extracted_attributes: attrs,
    candidate_chapters:   opts.candidate_chapters ?? ['40'],
    completeness_signal:  opts.completeness ?? 0.55,
    clarifying_question:  {
      discriminating_attribute: 'composition',
      fallback_question_text:   'Any further detail on the construction?',
      fallback_options: [
        { id: 'opt_a',  label: 'Option A' },
        { id: 'opt_b',  label: 'Option B' },
        { id: 'unsure', label: "I'm not sure" },
      ],
    },
    refusal_reason:       null,
    out_of_scope_class:   null,
  };
}

describe('L1 triage — terse-specific completeness recalibration (ASK→CLASSIFY)', () => {
  it('upgrades ASK→CLASSIFY for "rubber oil seals for automobile engines" (head-noun + material + use, single chapter)', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns:   ['seal', 'rubber', 'oil'],
      material:     'rubber',
      intended_use: 'automobile engines',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({ normalized_query: 'rubber oil seals for automobile engines' }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.clarifying_question).toBeNull();
    // Recalibration keeps the material chapter (40); host-chapter surfacing then
    // adds the GIR-2(a) vehicle host (87) because this is a part-of-vehicle query
    // ("oil seals" + "automobile engines"). Both must reach L2 so L4 can choose.
    expect(result.candidate_chapters).toContain('40');
    expect(result.candidate_chapters).toContain('87');
  });

  it('STILL upgrades "rubber oil seals" with a multi-word head-noun + bare material + use (positive guard for FIX 1)', async () => {
    // Adversarial-review FIX 1 positive guard: even though material='rubber' is
    // now a bare generic material, a real product FORM/head-noun ("oil seals")
    // plus a specific intended_use must STILL upgrade. The bare material being
    // demoted must NOT break legitimately-specific terse queries.
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns:   ['oil seals', 'seals'],
      material:     'rubber',
      intended_use: 'automobile engines',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({ normalized_query: 'rubber oil seals for automobile engines' }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.clarifying_question).toBeNull();
    // As above: recalibration upgrades to CLASSIFY, then host surfacing adds 87.
    expect(result.candidate_chapters).toContain('40');
    expect(result.candidate_chapters).toContain('87');
  });

  it('upgrades ASK→CLASSIFY for "woven dress shirt formal men" (head-noun + form, single chapter)', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['shirt', 'dress'],
      form:       'woven shirt',
      candidate_chapters: ['62'],
    })));
    const result = await triage(input({ normalized_query: 'woven dress shirt formal men' }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toEqual(['62']);
  });

  it('upgrades ASK→CLASSIFY for "galvanized steel sheet coils" (head-noun + material + form)', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['coil', 'sheet', 'steel'],
      material:   'galvanized steel',
      form:       'sheet coil',
      candidate_chapters: ['72'],
    })));
    const result = await triage(input({ normalized_query: 'galvanized steel sheet coils' }));
    expect(result.decision).toBe('CLASSIFY');
  });

  it('upgrades ASK→CLASSIFY for "muslin of carded yarn" (head-noun + processing-state form discriminator)', async () => {
    const out = terseSpecificAsk({
      head_nouns: ['muslin', 'fabric'],
      form:       'woven fabric',
      candidate_chapters: ['52'],
    });
    queueResponses(JSON.stringify(out));
    const result = await triage(input({ normalized_query: 'muslin of carded yarn' }));
    expect(result.decision).toBe('CLASSIFY');
  });

  it('does NOT upgrade when the ASK names ≥2 competing candidate chapters (genuine ambiguity)', async () => {
    // rubber bushing 40 vs 87 — head-noun + material present, but TWO chapter
    // families compete and composition is the missing discriminator. Keep ASK.
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['bushing', 'rubber'],
      material:   'rubber',
      candidate_chapters: ['40', '87'],
    })));
    const result = await triage(input({ normalized_query: 'rubber suspension bushings for trucks' }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT upgrade a genuinely-vague query ("metal part" — head-noun but no discriminator)', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['part'],
      material:   'metal',          // material is generic; treated as discriminator-absent below
      candidate_chapters: ['73'],
      completeness: 0.3,
    })));
    // For "metal part"/"plastic thing" the model is expected to keep ASK; our
    // guard must not force these through. We assert ASK is preserved when the
    // ONLY signal is a generic material with no form/use and a generic head-noun.
    const result = await triage(input({ normalized_query: 'metal part' }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT upgrade "metal part" even when the bare material appears in head_nouns', async () => {
    // Adversarial-review FIX 1: the model emits head_nouns=['metal','part'] and
    // material='metal' with a single candidate chapter. Neither the bare-material
    // head-noun nor the bare-material attribute may enable the upgrade — wrong-code
    // risk on a genuinely vague input.
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['metal', 'part'],
      material:   'metal',
      candidate_chapters: ['73'],
      completeness: 0.3,
    })));
    const result = await triage(input({ normalized_query: 'metal part' }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT upgrade "plastic component" (bare material head-noun + bare material attribute, single chapter)', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['plastic', 'component'],
      material:   'plastic',
      candidate_chapters: ['39'],
      completeness: 0.3,
    })));
    const result = await triage(input({ normalized_query: 'plastic component' }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT upgrade when head_nouns is the synthetic ["unknown"] placeholder', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['unknown'],
      material:   'steel',
      candidate_chapters: ['73'],
    })));
    const result = await triage(input({ normalized_query: 'thing' }));
    expect(result.decision).toBe('ASK');
  });

  it('does NOT upgrade when the ASK has zero candidate chapters', async () => {
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['widget'],
      form:       'gadget',
      candidate_chapters: [],
    })));
    const result = await triage(input({ normalized_query: 'a widget gadget' }));
    expect(result.decision).toBe('ASK');
  });

  it('leaves a genuine REFUSE (junk) untouched', async () => {
    queueResponses(JSON.stringify(refuseOutput('incoherent_query')));
    const result = await triage(input({ normalized_query: 'asdfghjkl' }));
    expect(result.decision).toBe('REFUSE');
    expect(result.out_of_scope_class).toBe('incoherent_query');
  });

  it('leaves a clean CLASSIFY untouched (no spurious mutation)', async () => {
    const out = classifyOutput();
    queueResponses(JSON.stringify(out));
    const result = await triage(input());
    expect(result.decision).toBe('CLASSIFY');
    expect(result).toEqual(out);
  });

  it('does not fire the ASK→CLASSIFY upgrade when q_budget_remaining=0 (already overridden to REFUSE)', async () => {
    // q_budget=0 with ASK becomes REFUSE BEFORE any upgrade — guard must not
    // resurrect it into a CLASSIFY.
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns: ['seal', 'rubber'],
      material:   'rubber',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({ q_budget_remaining: 0 }));
    expect(result.decision).toBe('REFUSE');
  });
});

/* ---------------------------------------------------------------------------
 * Host-chapter surfacing — parts-of-vehicle / parts-of-machine (GIR-2(a))
 * --------------------------------------------------------------------------- */

/**
 * Build a CLASSIFY output with the given part head-nouns / intended_use /
 * candidate chapters — the shape the host-surfacing pass operates on.
 */
function partClassify(opts: {
  head_nouns: string[];
  material?: string | null;
  intended_use?: string | null;
  candidate_chapters: string[];
}): TriageOutput {
  return {
    decision:             'CLASSIFY',
    extracted_attributes: {
      ...emptyAttrs(),
      material:                 opts.material ?? null,
      material_confidence:      opts.material != null ? 0.9 : null,
      intended_use:             opts.intended_use ?? null,
      intended_use_confidence:  opts.intended_use != null ? 0.9 : null,
      head_nouns_for_fts:       opts.head_nouns,
      raw_tokens:               [],
    },
    candidate_chapters:   opts.candidate_chapters,
    completeness_signal:  0.8,
    clarifying_question:  null,
    refusal_reason:       null,
    out_of_scope_class:   null,
  };
}

describe('L1 triage — host-chapter surfacing (parts-of-vehicle / machine)', () => {
  it('injects Ch.87 for "ceramic brake pads for heavy trucks" (part + vehicle host)', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['brake pad', 'pad'],
      material:           'ceramic',
      intended_use:       'heavy trucks',
      candidate_chapters: ['69'],
    })));
    const result = await triage(input({ normalized_query: 'ceramic brake pads for heavy trucks' }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toContain('69');
    expect(result.candidate_chapters).toContain('87');
  });

  it('injects Ch.87 for "rubber oil seals for automobile engines" (part + vehicle host; engine alone would be 84 but automobile wins)', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['oil seal', 'seal'],
      material:           'rubber',
      intended_use:       'automobile engines',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({ normalized_query: 'rubber oil seals for automobile engines' }));
    expect(result.candidate_chapters).toContain('40');
    expect(result.candidate_chapters).toContain('87');
  });

  it('injects Ch.84 for "rubber oil seals for engines" (part + machinery host only)', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['oil seal', 'seal'],
      material:           'rubber',
      intended_use:       'engines',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({ normalized_query: 'rubber oil seals for engines' }));
    expect(result.candidate_chapters).toContain('40');
    expect(result.candidate_chapters).toContain('84');
    expect(result.candidate_chapters).not.toContain('87');
  });

  it('injects Ch.86 for railway parts and Ch.88 for aircraft parts', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['bearing'],
      candidate_chapters: ['84'],
      intended_use:       'locomotive',
    })));
    const railway = await triage(input({ normalized_query: 'bearing for locomotive' }));
    expect(railway.candidate_chapters).toContain('86');

    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['bracket'],
      candidate_chapters: ['76'],
      intended_use:       'aircraft fuselage',
    })));
    const aircraft = await triage(input({ normalized_query: 'aluminium bracket for aircraft' }));
    expect(aircraft.candidate_chapters).toContain('88');
  });

  it('does NOT inject when there is no host signal ("ceramic brake pads")', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['brake pad', 'pad'],
      material:           'ceramic',
      candidate_chapters: ['69'],
    })));
    const result = await triage(input({ normalized_query: 'ceramic brake pads' }));
    expect(result.candidate_chapters).toEqual(['69']);
  });

  it('does NOT inject for a non-part material query that names a host ("ceramic tiles for cars")', async () => {
    // "tile" is not a PART head-noun; the host token must not flood ceramic
    // tiles into Ch.87.
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['tile'],
      material:           'ceramic',
      intended_use:       'cars',
      candidate_chapters: ['69'],
    })));
    const result = await triage(input({ normalized_query: 'ceramic tiles for cars' }));
    expect(result.candidate_chapters).toEqual(['69']);
  });

  it('does NOT duplicate when the host chapter is already a candidate', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['brake pad'],
      intended_use:       'trucks',
      candidate_chapters: ['68', '87'],
    })));
    const result = await triage(input({ normalized_query: 'brake pads for trucks' }));
    expect(result.candidate_chapters).toEqual(['68', '87']);
  });

  it('caps at 3 by dropping the lowest-priority candidate to make room for the host', async () => {
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['gasket'],
      intended_use:       'trucks',
      candidate_chapters: ['40', '68', '84'],
    })));
    const result = await triage(input({ normalized_query: 'gasket for trucks' }));
    expect(result.candidate_chapters).toHaveLength(3);
    expect(result.candidate_chapters).toContain('87');
    // Last (lowest-priority) original chapter dropped; first two kept.
    expect(result.candidate_chapters).toEqual(['40', '68', '87']);
  });

  it('does NOT re-introduce a backtrack-excluded host chapter', async () => {
    const hint: ConstraintHint = {
      exclude_chapters:    ['87'],
      prefer_chapters:     ['40'],
      reason:              'Ch.87 excluded by backtrack',
      source_exclusion_id: 99,
    };
    queueResponses(JSON.stringify(partClassify({
      head_nouns:         ['seal'],
      intended_use:       'trucks',
      candidate_chapters: ['40'],
    })));
    const result = await triage(input({
      normalized_query: 'seal for trucks',
      constraint_hint:  hint,
    }));
    expect(result.candidate_chapters).toEqual(['40']);
    expect(result.candidate_chapters).not.toContain('87');
  });

  it('does NOT touch an ASK or REFUSE decision', async () => {
    queueResponses(JSON.stringify(askOutput(['40', '87'])));
    const ask = await triage(input({ normalized_query: 'rubber bushing for trucks' }));
    expect(ask.decision).toBe('ASK');
    expect(ask.candidate_chapters).toEqual(['40', '87']);

    queueResponses(JSON.stringify(refuseOutput('incoherent_query')));
    const refuse = await triage(input({ normalized_query: 'asdf for trucks' }));
    expect(refuse.decision).toBe('REFUSE');
    expect(refuse.candidate_chapters).toEqual([]);
  });

  it('surfaces the host chapter even for a recalibrated ASK→CLASSIFY (part + host, single chapter)', async () => {
    // terseSpecificAsk → ASK upgraded to CLASSIFY by recalibration, THEN host
    // surfacing must still run on the resulting CLASSIFY.
    queueResponses(JSON.stringify(terseSpecificAsk({
      head_nouns:   ['gasket'],
      material:     'graphite',
      intended_use: 'trucks',
      candidate_chapters: ['68'],
    })));
    const result = await triage(input({ normalized_query: 'graphite gasket for trucks' }));
    expect(result.decision).toBe('CLASSIFY');
    expect(result.candidate_chapters).toContain('68');
    expect(result.candidate_chapters).toContain('87');
  });
});

describe('L1 triage — host-chapter detection (unit)', () => {
  it('detectHostChapter maps vehicle / railway / aircraft / vessel / machinery tokens', () => {
    expect(_internal.detectHostChapter('brake pads for trucks', null)).toBe('87');
    expect(_internal.detectHostChapter('parts', 'motor vehicle')).toBe('87');
    expect(_internal.detectHostChapter('coupling for locomotive', null)).toBe('86');
    expect(_internal.detectHostChapter('bracket for aircraft', null)).toBe('88');
    expect(_internal.detectHostChapter('seal for ship', null)).toBe('89');
    expect(_internal.detectHostChapter('seal for pump', null)).toBe('84');
    expect(_internal.detectHostChapter('engine seal', null)).toBe('84');
  });

  it('detectHostChapter prefers a vehicle host over a bare machinery host', () => {
    // "automobile engines": both 'automobile' (87) and 'engine' (84) appear;
    // the vehicle host is checked first and wins.
    expect(_internal.detectHostChapter('seals for automobile engines', null)).toBe('87');
  });

  it('detectHostChapter returns null when no host token present', () => {
    expect(_internal.detectHostChapter('ceramic tiles', null)).toBeNull();
    expect(_internal.detectHostChapter('cotton t-shirt', 'retail')).toBeNull();
  });

  it('hasPartHeadNoun matches single- and multi-word part nouns + plurals, rejects non-parts', () => {
    expect(_internal.hasPartHeadNoun(['seal'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['oil seal'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['brake pad', 'pad'])).toBe(true);
    // Plurals must match (head-nouns arrive in either number).
    expect(_internal.hasPartHeadNoun(['seals'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['oil seals'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['gaskets'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['bushes'])).toBe(true);
    expect(_internal.hasPartHeadNoun(['tile'])).toBe(false);
    expect(_internal.hasPartHeadNoun(['tiles'])).toBe(false);
    expect(_internal.hasPartHeadNoun(['t-shirt'])).toBe(false);
    expect(_internal.hasPartHeadNoun(['unknown'])).toBe(false);
  });

  it('surfaceHostChapter is a no-op on a clean non-part CLASSIFY', () => {
    const out = classifyOutput();
    expect(_internal.surfaceHostChapter(out, 'cotton t-shirt', null)).toEqual(out);
  });
});

describe('L1 triage — completenessSufficient guard (unit)', () => {
  it('returns true for head-noun + specific material', () => {
    // FIX 1: a bare generic material ('rubber') no longer counts as a
    // discriminator on its own; a SPECIFIC material ('steel') still does.
    const out = terseSpecificAsk({ head_nouns: ['seal'], material: 'steel', candidate_chapters: ['73'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(true);
  });
  it('returns true for head-noun + form', () => {
    const out = terseSpecificAsk({ head_nouns: ['shirt'], form: 'woven shirt', candidate_chapters: ['62'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(true);
  });
  it('returns true for head-noun + intended_use', () => {
    const out = terseSpecificAsk({ head_nouns: ['filter'], intended_use: 'for trucks', candidate_chapters: ['84'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(true);
  });
  it('returns false when ≥2 candidate chapters compete', () => {
    const out = terseSpecificAsk({ head_nouns: ['bushing'], material: 'rubber', candidate_chapters: ['40', '87'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns false when no discriminator present', () => {
    const out = terseSpecificAsk({ head_nouns: ['part'], candidate_chapters: ['73'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns false for head_nouns ["metal","part"] + material "metal" + single chapter (FIX 1)', () => {
    const out = terseSpecificAsk({ head_nouns: ['metal', 'part'], material: 'metal', candidate_chapters: ['73'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns false for head_nouns ["plastic","component"] + material "plastic" + single chapter (FIX 1)', () => {
    const out = terseSpecificAsk({ head_nouns: ['plastic', 'component'], material: 'plastic', candidate_chapters: ['39'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns true for a multi-word head-noun + bare material + intended_use (FIX 1 positive guard)', () => {
    const out = terseSpecificAsk({
      head_nouns:   ['oil seals', 'seals'],
      material:     'rubber',
      intended_use: 'automobile engines',
      candidate_chapters: ['40'],
    });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(true);
  });
  it('returns false when material is a bare generic material ("rubber") and head-noun is bare too', () => {
    const out = terseSpecificAsk({ head_nouns: ['rubber'], material: 'rubber', candidate_chapters: ['40'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns true for a specific single-word material ("steel") with a real head-noun', () => {
    // 'steel' is SPECIFIC (not in GENERIC_BARE_MATERIALS), so it still discriminates.
    const out = terseSpecificAsk({ head_nouns: ['bolt'], material: 'steel', candidate_chapters: ['73'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(true);
  });
  it('returns false for the synthetic ["unknown"] head-noun', () => {
    const out = terseSpecificAsk({ head_nouns: ['unknown'], material: 'steel', candidate_chapters: ['73'] });
    expect(_internal.shouldUpgradeAskToClassify(out)).toBe(false);
  });
  it('returns false for a CLASSIFY input (only applies to ASK)', () => {
    expect(_internal.shouldUpgradeAskToClassify(classifyOutput())).toBe(false);
  });
});

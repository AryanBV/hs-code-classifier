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

// ---- Mock the Vertex client BEFORE importing the SUT ------------------------
const generateContentMock = vi.fn();

vi.mock('../lib/vertex-client', () => ({
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

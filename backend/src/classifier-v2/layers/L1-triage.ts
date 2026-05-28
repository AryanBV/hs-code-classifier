/**
 * Layer 1 — Triage (Phase 4 v2)
 *
 * Calls `gemini-3.5-flash` via the raw-HTTPS Vertex client, decides
 * CLASSIFY / ASK / REFUSE, extracts attributes + FTS tokens, and respects the
 * Q-budget and (single-shot) constraint_hint from L3 backtrack.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 1 box)
 *   - backend/docs/ARCHITECTURE.md §3 (Layer 1 I/O row)
 *   - backend/docs/ARCHITECTURE.md §7 (Triage failure modes)
 *   - backend/prompts/triage-v2.md (THE prompt — system + user template + schema)
 *   - backend/docs/sub-specs/02-qgs-and-backtrack.md §B (constraint_hint)
 *   - backend/src/classifier-v2/types.ts (TriageInput / TriageOutput / ConstraintHint)
 *
 * The prompt template + response schema live in `backend/prompts/triage-v2.md`
 * and are parsed at module load — code changes are not required when the
 * prompt is iterated (§10 of ARCHITECTURE.md).
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateContent } from '../lib/vertex-client';
import { LlmOutputValidationError, TriageOutputZ, parseOrThrow } from '../schemas';
import type {
  AttributeKey,
  ConstraintHint,
  OutOfScopeClass,
  TriageClarifyingQuestion,
  TriageExtractedAttributes,
  TriageFallbackOption,
  TriageInput,
  TriageOutput,
} from '../types';

/* ---------------------------------------------------------------------------
 * Prompt loading (cached)
 * --------------------------------------------------------------------------- */

/** Path to the v2 Triage prompt markdown (resolved relative to this file). */
const PROMPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'prompts',
  'triage-v2.md',
);

interface ParsedPrompt {
  systemInstruction: string;
  userTemplate:      string;
  responseSchema:    Record<string, unknown>;
}

let _cachedPrompt: ParsedPrompt | null = null;

/**
 * Read triage-v2.md and extract:
 *   - SYSTEM PROMPT … (until next H2)
 *   - RESPONSE JSON SCHEMA → first fenced ```json block
 *   - USER PROMPT TEMPLATE → first fenced ``` block (any lang) after the header
 *
 * Throws if any section cannot be located — invariant violation.
 */
function parsePrompt(raw: string): ParsedPrompt {
  // --- System prompt -----------------------------------------------------
  // Grab content between "## SYSTEM PROMPT" and the next "## " H2.
  const sysHeaderRe = /^##\s+SYSTEM\s+PROMPT\s*$/im;
  const sysMatch = sysHeaderRe.exec(raw);
  if (!sysMatch) {
    throw new Error('triage-v2.md: SYSTEM PROMPT header not found');
  }
  const afterSys = raw.slice(sysMatch.index + sysMatch[0].length);
  // Find next H2 (## ) at column 0
  const nextH2 = afterSys.search(/\r?\n##\s+/);
  const systemBody = nextH2 < 0 ? afterSys : afterSys.slice(0, nextH2);

  // The system body includes the DECISION RULES + ATTRIBUTE EXTRACTION +
  // previousAnswers + constraint_hint sections in the spec, but per the file
  // they live under separate H2s. We want the SYSTEM PROMPT through the end
  // of the file MINUS the USER PROMPT TEMPLATE + WORKED TEST QUERIES + Notes
  // sections. Easiest reliable approach: assemble system instruction from
  // the spec sections we explicitly need — namely everything up to "## USER
  // PROMPT TEMPLATE".
  const userHeaderRe = /^##\s+USER\s+PROMPT\s+TEMPLATE\s*$/im;
  const userMatch = userHeaderRe.exec(raw);
  if (!userMatch) {
    throw new Error('triage-v2.md: USER PROMPT TEMPLATE header not found');
  }
  // System instruction = everything from start of "## SYSTEM PROMPT" up to
  // "## USER PROMPT TEMPLATE" (exclusive).
  const systemInstruction = raw
    .slice(sysMatch.index, userMatch.index)
    .trim();

  // --- User template -----------------------------------------------------
  // First fenced block after "## USER PROMPT TEMPLATE".
  const afterUserHeader = raw.slice(userMatch.index + userMatch[0].length);
  const userFenceRe = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/m;
  const userFenceMatch = userFenceRe.exec(afterUserHeader);
  if (!userFenceMatch || userFenceMatch[1] === undefined) {
    throw new Error('triage-v2.md: USER PROMPT TEMPLATE fenced block not found');
  }
  const userTemplate = userFenceMatch[1].trim();

  // --- Response schema ---------------------------------------------------
  // First ```json fenced block after "## RESPONSE JSON SCHEMA".
  const schemaHeaderRe = /^##\s+RESPONSE\s+JSON\s+SCHEMA\s*$/im;
  const schemaMatch = schemaHeaderRe.exec(raw);
  if (!schemaMatch) {
    throw new Error('triage-v2.md: RESPONSE JSON SCHEMA header not found');
  }
  const afterSchemaHeader = raw.slice(schemaMatch.index + schemaMatch[0].length);
  const jsonFenceRe = /```json\s*\n([\s\S]*?)\n```/m;
  const jsonFenceMatch = jsonFenceRe.exec(afterSchemaHeader);
  if (!jsonFenceMatch || jsonFenceMatch[1] === undefined) {
    throw new Error('triage-v2.md: ```json fenced block under RESPONSE JSON SCHEMA not found');
  }
  const schemaJson = jsonFenceMatch[1];
  let responseSchema: Record<string, unknown>;
  try {
    const parsed = JSON.parse(schemaJson);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('schema is not a JSON object');
    }
    responseSchema = parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `triage-v2.md: RESPONSE JSON SCHEMA is not valid JSON: ${(err as Error).message}`,
    );
  }

  return { systemInstruction, userTemplate, responseSchema };
}

/** Lazily load + parse the prompt file. Throws on filesystem / parse errors. */
function loadPrompt(): ParsedPrompt {
  if (_cachedPrompt !== null) return _cachedPrompt;
  const raw = fs.readFileSync(PROMPT_PATH, 'utf8');
  _cachedPrompt = parsePrompt(raw);
  return _cachedPrompt;
}

/** Test-only hook: clear cached parsed prompt. */
export function _clearPromptCacheForTesting(): void {
  _cachedPrompt = null;
}

/** Test-only hook: return the resolved prompt path. */
export function _getPromptPathForTesting(): string {
  return PROMPT_PATH;
}

/* ---------------------------------------------------------------------------
 * Template rendering (minimal Handlebars-like)
 * --------------------------------------------------------------------------- */

/**
 * Render `{{#if constraint_hint}} ... {{/if}}` blocks, then substitute
 * `{name}` / `{{constraint_hint.field}}` placeholders.
 *
 * Only the constructs actually used by triage-v2.md are supported:
 *   - {{#if constraint_hint}} BLOCK {{/if}}
 *   - {query}
 *   - {previousAnswers}
 *   - {q_budget_remaining}
 *   - {{constraint_hint.exclude_chapters}}
 *   - {{constraint_hint.prefer_chapters}}
 *   - {{constraint_hint.reason}}
 */
function renderTemplate(
  template: string,
  vars: {
    query:              string;
    previousAnswers:    string;
    q_budget_remaining: number;
    constraint_hint:    ConstraintHint | null;
  },
): string {
  // 1) Strip or expand the {{#if constraint_hint}} block.
  const ifRe = /\{\{#if\s+constraint_hint\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let rendered = template.replace(ifRe, (_full, inner: string) => {
    if (vars.constraint_hint === null) return '';
    return inner;
  });

  // 2) Substitute constraint_hint sub-fields (only matters when block kept).
  if (vars.constraint_hint !== null) {
    rendered = rendered
      .replace(
        /\{\{constraint_hint\.exclude_chapters\}\}/g,
        JSON.stringify(vars.constraint_hint.exclude_chapters),
      )
      .replace(
        /\{\{constraint_hint\.prefer_chapters\}\}/g,
        JSON.stringify(vars.constraint_hint.prefer_chapters),
      )
      .replace(
        /\{\{constraint_hint\.reason\}\}/g,
        vars.constraint_hint.reason,
      );
  }

  // 3) Substitute the scalar single-brace placeholders.
  rendered = rendered
    .replace(/\{query\}/g, vars.query)
    .replace(/\{previousAnswers\}/g, vars.previousAnswers)
    .replace(/\{q_budget_remaining\}/g, String(vars.q_budget_remaining));

  return rendered;
}

/* ---------------------------------------------------------------------------
 * Runtime type guards for TriageOutput (no Zod in dependencies)
 * --------------------------------------------------------------------------- */

const OUT_OF_SCOPE_CLASSES: ReadonlySet<OutOfScopeClass> = new Set<OutOfScopeClass>([
  'extraterrestrial',
  'fictional',
  'services_not_goods',
  'contraband',
  'weapons_restricted_class',
  'function_only_no_substance',
  'incoherent_query',
  'genuinely_indistinguishable',
  'backtrack_no_fit',
]);

const ATTRIBUTE_KEYS: ReadonlySet<AttributeKey> = new Set<AttributeKey>([
  'material',
  'form',
  'function',
  'intended_use',
  'processing_state',
  'composition',
]);

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isFallbackOption(v: unknown): v is TriageFallbackOption {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.label === 'string';
}

function isClarifyingQuestion(v: unknown): v is TriageClarifyingQuestion {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.discriminating_attribute !== 'string') return false;
  if (!ATTRIBUTE_KEYS.has(o.discriminating_attribute as AttributeKey)) return false;
  if (typeof o.fallback_question_text !== 'string') return false;
  if (!Array.isArray(o.fallback_options)) return false;
  if (o.fallback_options.length < 2 || o.fallback_options.length > 4) return false;
  return o.fallback_options.every(isFallbackOption);
}

function isExtractedAttributes(v: unknown): v is TriageExtractedAttributes {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    isStringOrNull(o.material) &&
    isNumberOrNull(o.material_confidence) &&
    isStringOrNull(o.form) &&
    isNumberOrNull(o.form_confidence) &&
    isStringOrNull(o.function) &&
    isNumberOrNull(o.function_confidence) &&
    isStringOrNull(o.intended_use) &&
    isNumberOrNull(o.intended_use_confidence) &&
    isStringOrNull(o.processing_state) &&
    isNumberOrNull(o.processing_state_confidence) &&
    isStringOrNull(o.composition) &&
    isNumberOrNull(o.composition_confidence) &&
    isStringArray(o.head_nouns_for_fts) &&
    o.head_nouns_for_fts.length >= 1 &&
    o.head_nouns_for_fts.length <= 5 &&
    isStringArray(o.raw_tokens) &&
    o.raw_tokens.length <= 8
  );
}

function isTriageOutput(v: unknown): v is TriageOutput {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;

  if (o.decision !== 'CLASSIFY' && o.decision !== 'ASK' && o.decision !== 'REFUSE') {
    return false;
  }
  if (!isExtractedAttributes(o.extracted_attributes)) return false;
  if (!isStringArray(o.candidate_chapters)) return false;
  if (o.candidate_chapters.length > 3) return false;
  if (!o.candidate_chapters.every((c) => /^\d{2}$/.test(c))) return false;
  if (typeof o.completeness_signal !== 'number') return false;
  if (o.completeness_signal < 0 || o.completeness_signal > 1) return false;

  // clarifying_question
  if (o.clarifying_question !== null && !isClarifyingQuestion(o.clarifying_question)) {
    return false;
  }

  // refusal_reason
  if (o.refusal_reason !== null && typeof o.refusal_reason !== 'string') return false;

  // out_of_scope_class
  if (o.out_of_scope_class !== null) {
    if (typeof o.out_of_scope_class !== 'string') return false;
    if (!OUT_OF_SCOPE_CLASSES.has(o.out_of_scope_class as OutOfScopeClass)) return false;
  }

  // decision-conditional invariants
  if (o.decision === 'CLASSIFY') {
    if (o.candidate_chapters.length < 1) return false;
    if (o.clarifying_question !== null) return false;
    if (o.refusal_reason !== null) return false;
    if (o.out_of_scope_class !== null) return false;
  } else if (o.decision === 'ASK') {
    if (o.clarifying_question === null) return false;
    if (o.refusal_reason !== null) return false;
    if (o.out_of_scope_class !== null) return false;
  } else {
    // REFUSE
    if (typeof o.refusal_reason !== 'string' || o.refusal_reason.length === 0) return false;
    if (typeof o.out_of_scope_class !== 'string') return false;
    if (o.clarifying_question !== null) return false;
  }

  return true;
}

/* ---------------------------------------------------------------------------
 * JSON parsing helper
 * --------------------------------------------------------------------------- */

/**
 * Parse Triage JSON. Tries strict JSON.parse first; falls back to extracting
 * the first balanced `{...}` block (handles cases where the model wraps the
 * JSON in stray prose, even though `responseSchema` should prevent that).
 *
 * After JSON decoding, validates the parsed value against `TriageOutputZ` via
 * `parseOrThrow`. On `LlmOutputValidationError` (schema mismatch) or JSON
 * parse failure, returns null — triggering the caller's retry-then-REFUSE path.
 * The `LlmOutputValidationError` type lets the caller (or a later error-handling
 * task §7) distinguish validation failures from network/transport errors.
 */
function tryParseTriageJSON(text: string): TriageOutput | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: find first '{' and last '}' and parse the slice.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      parsed = JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }

  // Zod validation at the parse site — replaces the bare isTriageOutput check.
  // Returns null on schema mismatch so the caller's retry-then-REFUSE path fires.
  try {
    return parseOrThrow(TriageOutputZ, parsed, 'L1-triage');
  } catch (err) {
    if (err instanceof LlmOutputValidationError) {
      // eslint-disable-next-line no-console
      console.log(`[L1] Zod validation failed: ${err.message}`);
      return null;
    }
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * Synthetic REFUSE builders
 * --------------------------------------------------------------------------- */

function emptyAttributes(): TriageExtractedAttributes {
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

function syntheticRefuse(
  out_of_scope_class: OutOfScopeClass,
  refusal_reason: string,
): TriageOutput {
  return {
    decision:             'REFUSE',
    extracted_attributes: emptyAttributes(),
    candidate_chapters:   [],
    completeness_signal:  0,
    clarifying_question:  null,
    refusal_reason,
    out_of_scope_class,
  };
}

/* ---------------------------------------------------------------------------
 * Constraint-hint violation check
 * --------------------------------------------------------------------------- */

function violatesConstraint(
  output: TriageOutput,
  hint: ConstraintHint | null,
): boolean {
  if (hint === null) return false;
  const excluded = new Set(hint.exclude_chapters);
  return output.candidate_chapters.some((c) => excluded.has(c));
}

/* ---------------------------------------------------------------------------
 * Single Vertex call wrapper (extracts text only)
 * --------------------------------------------------------------------------- */

interface CallResult {
  parsed: TriageOutput | null;
  rawText: string;
}

async function callTriage(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: Record<string, unknown>,
): Promise<CallResult> {
  const res = await generateContent({
    model:             'gemini-3.5-flash',
    prompt:            userPrompt,
    systemInstruction,
    thinkingLevel:     'low',
    responseSchema,
    responseMimeType:  'application/json',
    temperature:       0.0,
    maxOutputTokens:   2048,
  });
  return { parsed: tryParseTriageJSON(res.text), rawText: res.text };
}

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Run Triage (Layer 1) against the configured Vertex Gemini 3.5 Flash model.
 *
 * Behavior:
 *   1. Load + cache the v2 Triage prompt (system + user template + schema).
 *   2. Render the user template against `input` (constraint_hint expanded conditionally).
 *   3. Call Vertex once at temperature=0.0, parse + validate JSON against TriageOutput.
 *   4. On invalid JSON: retry ONCE at temperature=0.0. On second failure →
 *      synthetic REFUSE with `out_of_scope_class: "incoherent_query"`.
 *   5. Enforce Q-budget: if `q_budget_remaining === 0` AND the model wanted to
 *      ASK, override to REFUSE with `out_of_scope_class: "function_only_no_substance"`
 *      (per ARCHITECTURE.md §7).
 *   6. Enforce hard `constraint_hint`: if any chapter in `exclude_chapters`
 *      appears in `candidate_chapters[]`, retry ONCE; if still violated →
 *      REFUSE with `out_of_scope_class: "backtrack_no_fit"`.
 *
 * @param input - Triage input per ARCHITECTURE.md §3 + sub-spec 02 §B.1.
 * @returns Validated TriageOutput conforming to triage-v2.md schema.
 * @throws  Network / Vertex 5xx errors propagate (caller handles retry/escalation).
 *          Only invalid JSON triggers the local retry → synthetic-REFUSE path.
 */
export async function triage(input: TriageInput): Promise<TriageOutput> {
  const { systemInstruction, userTemplate, responseSchema } = loadPrompt();

  const userPrompt = renderTemplate(userTemplate, {
    query:              input.normalized_query,
    previousAnswers:    JSON.stringify(input.previousAnswers),
    q_budget_remaining: input.q_budget_remaining,
    constraint_hint:    input.constraint_hint,
  });

  // ----- Attempt 1 -----
  const r1 = await callTriage(systemInstruction, userPrompt, responseSchema);
  let parsed = r1.parsed;
  let attempts = 1;

  // ----- JSON-parse retry -----
  if (parsed === null) {
    // eslint-disable-next-line no-console
    console.log('[L1] Triage attempt 1 invalid JSON; retrying once.');
    const r2 = await callTriage(systemInstruction, userPrompt, responseSchema);
    parsed = r2.parsed;
    attempts = 2;
    if (parsed === null) {
      // eslint-disable-next-line no-console
      console.log('[L1] Triage attempt 2 invalid JSON; returning synthetic REFUSE.');
      return syntheticRefuse(
        'incoherent_query',
        'Triage produced invalid JSON twice; refusing to guess.',
      );
    }
  }

  // ----- Q-budget override -----
  if (input.q_budget_remaining === 0 && parsed.decision === 'ASK') {
    // eslint-disable-next-line no-console
    console.log('[L1] Q-budget exhausted; overriding ASK → REFUSE.');
    return syntheticRefuse(
      'function_only_no_substance',
      'Could not narrow this query to a single chapter family after three clarifying rounds. Please consult a customs broker.',
    );
  }

  // ----- Constraint-hint enforcement -----
  if (violatesConstraint(parsed, input.constraint_hint)) {
    // eslint-disable-next-line no-console
    console.log('[L1] Constraint violation on attempt 1; retrying once.');
    const r3 = await callTriage(systemInstruction, userPrompt, responseSchema);
    attempts += 1;
    const retryParsed = r3.parsed;
    if (retryParsed === null || violatesConstraint(retryParsed, input.constraint_hint)) {
      // eslint-disable-next-line no-console
      console.log('[L1] Constraint still violated after retry; REFUSE backtrack_no_fit.');
      const reason = input.constraint_hint
        ? `Backtrack failed: ${input.constraint_hint.reason}`
        : 'Backtrack constraint violation.';
      return syntheticRefuse('backtrack_no_fit', reason);
    }
    parsed = retryParsed;
    // Re-check Q-budget after retry replacement.
    if (input.q_budget_remaining === 0 && parsed.decision === 'ASK') {
      // eslint-disable-next-line no-console
      console.log('[L1] Q-budget exhausted post-retry; overriding ASK → REFUSE.');
      return syntheticRefuse(
        'function_only_no_substance',
        'Could not narrow this query to a single chapter family after three clarifying rounds. Please consult a customs broker.',
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[L1] Triage decision=${parsed.decision} attempts=${attempts}`);
  return parsed;
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  parsePrompt,
  renderTemplate,
  tryParseTriageJSON,
  isTriageOutput,
};

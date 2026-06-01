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
import { generateContent } from '../lib/llm-provider';
import { LlmOutputValidationError, TriageOutputZ, parseOrThrow } from '../schemas';
import type {
  AttributeKey,
  ChapterCode,
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
 * `parseOrThrow` (structural shape), THEN the hand-rolled `isTriageOutput`
 * guard (decision-conditional cross-field invariants). On
 * `LlmOutputValidationError` (schema mismatch), failed cross-field guard, or
 * JSON parse failure, returns null — triggering the caller's retry-then-REFUSE
 * path. The `LlmOutputValidationError` type lets the caller (or a later
 * error-handling task §7) distinguish validation failures from network/transport
 * errors. This Zod → isTriageOutput chaining mirrors L4's
 * Zod → isSelectOutput parse site exactly.
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

  // Zod validation at the parse site — structural shape check.
  // Returns null on schema mismatch so the caller's retry-then-REFUSE path fires.
  let zodParsed: unknown;
  try {
    zodParsed = parseOrThrow(TriageOutputZ, parsed, 'L1-triage');
  } catch (err) {
    if (err instanceof LlmOutputValidationError) {
      // eslint-disable-next-line no-console
      console.log(`[L1] Zod validation failed: ${err.message}`);
      return null;
    }
    throw err;
  }

  // Cross-field invariants (decision-conditional rules from triage-v2.md allOf)
  // enforced by the hand-rolled isTriageOutput guard. Zod handles structural
  // shape only; isTriageOutput rejects e.g. CLASSIFY with empty candidate_chapters
  // or ASK with null clarifying_question. Returning null here triggers the
  // caller's retry-then-REFUSE path. Mirrors L4's Zod → isSelectOutput chaining.
  return isTriageOutput(zodParsed) ? zodParsed : null;
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
 * Completeness recalibration — terse-but-specific should CLASSIFY (Round 1)
 *
 * The 2026-05-29 baseline showed Triage OVER-ASKING on terse but unambiguous
 * queries (e.g., "rubber oil seals for automobile engines", "galvanized steel
 * sheet coils"). A query with a clear product head-noun PLUS ≥1 discriminator
 * (material / form / intended_use) that the model itself routes to a SINGLE
 * candidate chapter is sufficient to CLASSIFY — the ASK adds no information and
 * cannot change the code.
 *
 * This guard is PRINCIPLED + GENERAL: it inspects the structured attribute
 * bundle, never the query string, and never per-case strings. It is deliberately
 * conservative — it upgrades ASK→CLASSIFY ONLY when there is no genuine
 * chapter-level ambiguity (exactly one candidate chapter). A genuine
 * competing-interpretation ASK (≥2 candidate chapters, e.g. rubber bushing
 * Ch.40 vs Ch.87) is preserved. Junk/vague queries are preserved because they
 * lack a real head-noun and/or a real discriminator.
 * --------------------------------------------------------------------------- */

/**
 * Generic placeholder nouns that carry no classification signal on their own.
 * A head-noun list consisting ONLY of these does not constitute a "real"
 * product head-noun. Closed, product-agnostic set — not per-case strings.
 */
const GENERIC_PLACEHOLDER_NOUNS: ReadonlySet<string> = new Set<string>([
  'unknown',
  'part',
  'parts',
  'thing',
  'things',
  'item',
  'items',
  'product',
  'products',
  'good',
  'goods',
  'article',
  'articles',
  'material',
  'materials',
  'stuff',
  'component',
  'components',
  'equipment',
  'device',
  'devices',
  'object',
  'unit',
  'piece',
]);

/**
 * Bare GENERIC material words. A material attribute (or head-noun) that is ONLY
 * one of these carries no chapter-discriminating signal on its own: "metal part",
 * "plastic component" can land in dozens of chapters. These must NOT by themselves
 * enable the ASK→CLASSIFY upgrade.
 *
 * This is deliberately restricted to GENERIC material classes. SPECIFIC materials
 * — 'stainless steel', 'aluminium', 'polyester', 'silicone', and even bare 'steel'
 * — ARE discriminating and are intentionally absent so they continue to count as
 * specific. Multi-word values (e.g. 'galvanized steel') are never matched here
 * because the check is applied per single-word value only.
 */
const GENERIC_BARE_MATERIALS: ReadonlySet<string> = new Set<string>([
  'metal',
  'metallic',
  'plastic',
  'rubber',
  'wood',
  'glass',
  'ceramic',
  'fabric',
  'paper',
  'textile',
  'synthetic',
  'liquid',
  'solid',
  'powder',
]);

/**
 * True when a single-word value is a bare generic placeholder noun OR a bare
 * generic material. Either way it is NOT a specific discriminator / real
 * head-noun on its own.
 *
 * Exported (additive) for reuse by the SIBLING-ASK pin-check
 * (`lib/sibling-ask-trigger.ts`), which needs the same notion of a bare generic
 * word to decide whether a query token genuinely pins an attribute.
 */
export function isBareNonSpecificWord(word: string): boolean {
  return GENERIC_PLACEHOLDER_NOUNS.has(word) || GENERIC_BARE_MATERIALS.has(word);
}

/**
 * True when `v` is a non-empty string that is not a bare generic placeholder.
 *
 * Exported (additive) for reuse by the SIBLING-ASK pin-check
 * (`lib/sibling-ask-trigger.ts`): a bare generic value ("metal", "plastic") does
 * not pin an attribute well enough to suppress an ASK.
 */
export function isSpecificValue(v: string | null): boolean {
  if (v === null) return false;
  const trimmed = v.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  // A single-word value that is itself a generic placeholder OR a bare generic
  // material is not specific ("metal", "plastic", "rubber" ALONE are weak; but
  // multi-word values like "stainless steel" / "galvanized steel" — and specific
  // single-word materials like "steel", "aluminium", "polyester" — ARE specific).
  const words = trimmed.split(/\s+/);
  if (words.length === 1 && words[0] !== undefined && isBareNonSpecificWord(words[0])) {
    return false;
  }
  return true;
}

/** True when at least one head-noun is a real (non-placeholder) product noun. */
function hasRealHeadNoun(headNouns: string[]): boolean {
  return headNouns.some((n) => {
    const t = n.trim().toLowerCase();
    // A multi-word head-noun ("oil seals") is always real; a single-word
    // head-noun must be neither a generic placeholder nor a bare generic
    // material ("metal" / "plastic" alone is not a real product head-noun).
    if (t.length === 0) return false;
    if (/\s/.test(t)) return true;
    return !isBareNonSpecificWord(t);
  });
}

/**
 * Decide whether a model-emitted ASK is over-cautious and should be upgraded to
 * CLASSIFY. Returns true ONLY when:
 *   - decision === 'ASK',
 *   - exactly ONE candidate chapter (no genuine competing interpretation),
 *   - the head-noun list contains a real product noun, AND
 *   - at least one discriminator among {material, form, intended_use} is present
 *     and specific (not a bare generic placeholder).
 *
 * Note: a bare generic material such as "metal" / "plastic" / "rubber" does NOT
 * count as a discriminator on its own (those drive genuine ASKs like "metal
 * part"), nor as a real head-noun on its own. See GENERIC_BARE_MATERIALS.
 */
function shouldUpgradeAskToClassify(output: TriageOutput): boolean {
  if (output.decision !== 'ASK') return false;
  if (output.candidate_chapters.length !== 1) return false;

  const a = output.extracted_attributes;
  if (!hasRealHeadNoun(a.head_nouns_for_fts)) return false;

  const hasDiscriminator =
    isSpecificValue(a.material) ||
    isSpecificValue(a.form) ||
    isSpecificValue(a.intended_use);

  return hasDiscriminator;
}

/**
 * Apply the terse-specific recalibration in place: when {@link shouldUpgradeAskToClassify}
 * holds, return a CLASSIFY-shaped clone (clearing the ASK-only fields so the
 * cross-field CLASSIFY invariants in isTriageOutput hold). Otherwise return the
 * output unchanged.
 */
function recalibrateDecision(output: TriageOutput): TriageOutput {
  if (!shouldUpgradeAskToClassify(output)) return output;
  return {
    ...output,
    decision:            'CLASSIFY',
    clarifying_question: null,
    refusal_reason:      null,
    out_of_scope_class:  null,
    // Bump the completeness signal to satisfy the CLASSIFY ≥0.6 contract; the
    // structural sufficiency check above is the real gate.
    completeness_signal: Math.max(output.completeness_signal, 0.6),
  };
}

/* ---------------------------------------------------------------------------
 * Host-chapter surfacing for parts-of-vehicle / parts-of-machine queries
 *
 * GIR-2(a) + Section XVII / XVI Notes: a part that is solely or principally for
 * a vehicle / aircraft / vessel / railway / machine is classified in the HOST
 * chapter (e.g. "brake pads for trucks" → Ch.87, not the ceramic Ch.69), bounded
 * by the Section's part-exclusion notes (which L3/L4 enforce per-leaf).
 *
 * The model frequently routes such queries to the MATERIAL chapter only (Ch.40
 * rubber, Ch.68/69 ceramic, …). When the host chapter is absent from
 * candidate_chapters, L2 hard-filters it out (cosine + FTS are scoped to
 * candidate_chapters) so L4 never even sees the host-chapter leaves and cannot
 * apply GIR-2(a). This pass restores the host chapter as a CANDIDATE — it does
 * not decide classification; it only ensures L4 gets the choice. L3 exclusions +
 * L4's Note-2 reasoning still decide whether the host chapter actually wins.
 *
 * Boundedness (no per-case / no flooding):
 *   - Fires ONLY when BOTH a generic PART head-noun AND a HOST signal are
 *     detected from the structured attribute bundle + normalized query.
 *   - Material-only queries (no host token) are untouched.
 *   - The host chapter is injected only if not already present, and the total is
 *     capped at the schema max (3): if full, the lowest-priority existing
 *     candidate is dropped to make room for the discriminating host chapter.
 *   - Never injects a chapter in constraint_hint.exclude_chapters (respects the
 *     single-shot backtrack contract).
 * --------------------------------------------------------------------------- */

/** Schema cap on candidate_chapters (triage-v2.md RESPONSE JSON SCHEMA maxItems). */
const MAX_CANDIDATE_CHAPTERS = 3;

/**
 * Generic part / accessory nouns that, on their own, classify by their HOST
 * (GIR-2(a)) rather than their material. Closed, product-agnostic set — these
 * are the part-type words, NOT the host words. Specific articles with their own
 * heading (e.g. "tyre", "battery", "filter", "pump") are intentionally absent —
 * those are decided by L4 against their dedicated headings, and the function-over
 * -material rules in chapter-rules.ts already carve them out at the legacy layer.
 */
const PART_HEAD_NOUNS: ReadonlySet<string> = new Set<string>([
  'seal',
  'gasket',
  'bushing',
  'bush',
  'bearing',
  'pad',
  'lining',
  'liner',
  'gear',
  'sprocket',
  'hose',
  'clip',
  'clamp',
  'bracket',
  'mount',
  'mounting',
  'shield',
  'cover',
  'casing',
  'housing',
  'bumper',
  'fender',
  'mudguard',
  'panel',
  'muffler',
  'silencer',
  'manifold',
  'piston',
  'ring',
  'rod',
  'shaft',
  'axle',
  'pin',
  'spring',
  'damper',
  'shock',
  'absorber',
  'coupling',
  'joint',
  'bellow',
  'diaphragm',
  'grommet',
]);

/**
 * Host-keyword → host-chapter map. A host keyword in the normalized query or
 * intended_use upgrades the part to its host chapter (Section XVII / XVI hosts):
 *   - 87 motor vehicles (cars, trucks, buses, motorcycles, tractors)
 *   - 86 railway / tramway rolling stock
 *   - 88 aircraft / spacecraft
 *   - 89 ships / boats / vessels
 *   - 84 machinery (engines, pumps, compressors, machines) — Section XVI
 * Listed longest-first so multi-word hosts ("motor vehicle") match before bare
 * tokens. Each entry is a word-boundary regex source fragment.
 */
const HOST_KEYWORD_TO_CHAPTER: ReadonlyArray<readonly [RegExp, ChapterCode]> = [
  // Railway / tramway → 86
  [/\b(railway|railroad|tramway|locomotive|train|wagon)s?\b/, '86'],
  // Aircraft / spacecraft → 88
  [/\b(aircraft|airplane|aeroplane|helicopter|drone|spacecraft|aviation)s?\b/, '88'],
  // Ships / vessels → 89
  [/\b(ship|boat|vessel|yacht|tanker|barge)s?\b/, '89'],
  // Motor vehicles → 87
  [/\b(motor[\s-]?vehicle|automobile|automotive|car|cars|truck|lorry|lorries|bus|buses|van|motorcycle|motorbike|scooter|tractor|trailer)s?\b/, '87'],
  // General machinery (Section XVI) → 84. "engine" lives here: an engine is a
  // Ch.84 machine and its parts go to 84 unless a vehicle host also appears
  // (the vehicle regex above is checked first and wins via first-match).
  [/\b(machine|machinery|engine|motor|pump|compressor|turbine|generator|gearbox)s?\b/, '84'],
];

/**
 * Detect the host chapter for a parts-of-X query, or null when no host signal.
 * Scans intended_use first (most explicit), then the normalized query. Returns
 * the FIRST matching host chapter (priority order in HOST_KEYWORD_TO_CHAPTER:
 * specific transport hosts before general machinery).
 */
function detectHostChapter(
  normalizedQuery: string,
  intendedUse: string | null,
): ChapterCode | null {
  const haystack = `${intendedUse ?? ''} ${normalizedQuery}`.toLowerCase();
  for (const [re, chapter] of HOST_KEYWORD_TO_CHAPTER) {
    if (re.test(haystack)) return chapter;
  }
  return null;
}

/**
 * True when a single word is a generic PART noun, matching simple plurals too
 * ("seals" → "seal", "bushes"/"boxes" → strip "es", "lorries" → "lorry").
 * Part nouns are stored singular; head-nouns arrive in either number.
 */
function isPartWord(word: string): boolean {
  if (PART_HEAD_NOUNS.has(word)) return true;
  // -ies → -y (unlikely for parts but cheap + safe)
  if (word.endsWith('ies') && PART_HEAD_NOUNS.has(`${word.slice(0, -3)}y`)) return true;
  // -es → strip ("boxes"→"box", "bushes"→"bush")
  if (word.endsWith('es') && PART_HEAD_NOUNS.has(word.slice(0, -2))) return true;
  // -s → strip ("seals"→"seal", "pads"→"pad")
  if (word.endsWith('s') && PART_HEAD_NOUNS.has(word.slice(0, -1))) return true;
  return false;
}

/** True when at least one head-noun is a generic PART head-noun. */
function hasPartHeadNoun(headNouns: string[]): boolean {
  return headNouns.some((n) => {
    const t = n.trim().toLowerCase();
    if (t.length === 0) return false;
    // Match any whitespace-separated word against the part-noun set so a
    // multi-word head-noun like "oil seal" or "brake pads" still triggers.
    return t.split(/\s+/).some((w) => isPartWord(w));
  });
}

/**
 * When a CLASSIFY output describes a part of a host (PART head-noun + HOST
 * signal) whose host chapter is not yet a candidate, inject the host chapter so
 * L2 surfaces its leaves and L4 can weigh GIR-2(a). Bounded + cap-respecting;
 * see the section header. No-op for any non-CLASSIFY decision, any query with no
 * part-noun, and any query with no host signal.
 */
function surfaceHostChapter(
  output: TriageOutput,
  normalizedQuery: string,
  hint: ConstraintHint | null,
): TriageOutput {
  if (output.decision !== 'CLASSIFY') return output;

  const attrs = output.extracted_attributes;
  if (!hasPartHeadNoun(attrs.head_nouns_for_fts)) return output;

  const host = detectHostChapter(normalizedQuery, attrs.intended_use);
  if (host === null) return output;

  // Already present → nothing to do.
  if (output.candidate_chapters.includes(host)) return output;

  // Never re-introduce a backtrack-excluded chapter (single-shot contract).
  if (hint !== null && hint.exclude_chapters.includes(host)) return output;

  // Inject the host chapter, capped at the schema max. When the list is already
  // full, drop the LAST (lowest-priority) existing candidate to make room — the
  // host chapter is the discriminating signal L4 needs, and L1 emits
  // candidate_chapters most-likely-first.
  const next =
    output.candidate_chapters.length < MAX_CANDIDATE_CHAPTERS
      ? [...output.candidate_chapters, host]
      : [...output.candidate_chapters.slice(0, MAX_CANDIDATE_CHAPTERS - 1), host];

  return { ...output, candidate_chapters: next };
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

  // ----- Terse-specific recalibration (Round 1) -----
  // Upgrade an over-cautious ASK → CLASSIFY when the query is terse but
  // unambiguous (real head-noun + ≥1 discriminator, single candidate chapter).
  // Runs AFTER the Q-budget override (so a q_budget=0 ASK stays REFUSE) and
  // AFTER constraint-hint enforcement (so backtrack constraints are honored).
  const recalibrated = recalibrateDecision(parsed);
  if (recalibrated.decision !== parsed.decision) {
    // eslint-disable-next-line no-console
    console.log('[L1] Terse-specific recalibration: ASK → CLASSIFY.');
  }
  parsed = recalibrated;

  // ----- Host-chapter surfacing (parts-of-vehicle / parts-of-machine) -----
  // Runs LAST so it sees the final CLASSIFY candidate set (post Q-budget,
  // constraint-hint, and recalibration). Injects the GIR-2(a) host chapter
  // (87/86/88/89/84) when a part head-noun + host signal co-occur, so L2 can
  // surface host-chapter leaves and L4 can weigh GIR-2(a). Respects the
  // candidate cap and never re-introduces a backtrack-excluded chapter.
  const beforeHost: TriageOutput = parsed;
  const withHost = surfaceHostChapter(beforeHost, input.normalized_query, input.constraint_hint);
  if (withHost !== beforeHost) {
    // surfaceHostChapter only returns a NEW object when it injected a host chapter.
    // eslint-disable-next-line no-console
    console.log(`[L1] Host-chapter surfacing: candidate_chapters → ${JSON.stringify(withHost.candidate_chapters)}`);
  }
  parsed = withHost;

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
  shouldUpgradeAskToClassify,
  recalibrateDecision,
  detectHostChapter,
  hasPartHeadNoun,
  surfaceHostChapter,
};

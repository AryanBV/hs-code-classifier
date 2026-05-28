/**
 * Layer 4 — Select (Phase 4 v2)
 *
 * The final classifier LLM call. Takes L3's ≤5 filtered candidates plus the
 * full legal context (notes, scoped notes_claims, exclusions, tariff_line
 * attributes, GIRs) and asks `gemini-3.5-flash` (`thinking_level=low`) to
 * pick ONE code or return a structured refusal.
 *
 * Single-shot — the repair LOOP (re-invocation with verifier_failures) is the
 * orchestrator's job. L4 only knows how to render the repair block when input
 * carries `verifier_failures !== null` on a given call.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 4 box), §3 (L4 I/O row),
 *                                  §4 (multi-signal synthesis), §7 (failure modes)
 *   - backend/prompts/select-v2.md (THE prompt — system + user template + schema)
 *   - backend/docs/sub-specs/01-verifier-rules.md (what the verifier checks downstream)
 *   - backend/src/data/gir-rules.ts (legacy GIRs 1-6 — read-only reference)
 *
 * Prompt parsing + cache pattern intentionally mirrors `L1-triage.ts` — same
 * regex section extraction + module-level cache + test-only hooks.
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateContent } from '../lib/vertex-client';
import {
  getSelectCandidateRows,
  getChapterNotesBundles,
  getNotesClaimsForChapters,
  getTariffLineAttributesForCodes,
} from '../lib/supabase-client';
import { LlmOutputValidationError, SelectOutputZ, parseOrThrow } from '../schemas';
import { getAllGIRRules } from '../../data/gir-rules';
import type {
  ChapterCode,
  ExclusionMatch,
  GIRIdentifier,
  L4Input,
  RetrievalCandidate,
  SelectCandidateRow,
  SelectChapterNotesBundle,
  SelectCitation,
  SelectCitationPrimary,
  SelectCitationType,
  SelectComponent,
  SelectContext,
  SelectNotesClaim,
  SelectOutput,
  SelectRefusal,
  SelfConfidence,
  VerifierRuleFailure,
} from '../types';

/* ---------------------------------------------------------------------------
 * Prompt loading (cached, mirrors L1-triage.ts)
 * --------------------------------------------------------------------------- */

const PROMPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'prompts',
  'select-v2.md',
);

interface ParsedPrompt {
  systemInstruction: string;
  userTemplate:      string;
  responseSchema:    Record<string, unknown>;
}

let _cachedPrompt: ParsedPrompt | null = null;

/**
 * Read select-v2.md and extract:
 *   - SYSTEM PROMPT (through end of file minus USER PROMPT TEMPLATE onwards)
 *   - USER PROMPT TEMPLATE (first fenced block under the H2)
 *   - RESPONSE JSON SCHEMA (first ```json fenced block under the H2)
 */
function parsePrompt(raw: string): ParsedPrompt {
  const sysHeaderRe = /^##\s+SYSTEM\s+PROMPT\s*$/im;
  const sysMatch = sysHeaderRe.exec(raw);
  if (!sysMatch) {
    throw new Error('select-v2.md: SYSTEM PROMPT header not found');
  }
  const userHeaderRe = /^##\s+USER\s+PROMPT\s+TEMPLATE\s*$/im;
  const userMatch = userHeaderRe.exec(raw);
  if (!userMatch) {
    throw new Error('select-v2.md: USER PROMPT TEMPLATE header not found');
  }
  // System instruction = everything from "## SYSTEM PROMPT" up to "## USER PROMPT TEMPLATE".
  const systemInstruction = raw.slice(sysMatch.index, userMatch.index).trim();

  // User template = first fenced block after USER PROMPT TEMPLATE header.
  const afterUserHeader = raw.slice(userMatch.index + userMatch[0].length);
  const userFenceRe = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/m;
  const userFenceMatch = userFenceRe.exec(afterUserHeader);
  if (!userFenceMatch || userFenceMatch[1] === undefined) {
    throw new Error('select-v2.md: USER PROMPT TEMPLATE fenced block not found');
  }
  const userTemplate = userFenceMatch[1].trim();

  // Response schema = first ```json block under "## RESPONSE JSON SCHEMA".
  const schemaHeaderRe = /^##\s+RESPONSE\s+JSON\s+SCHEMA\s*$/im;
  const schemaMatch = schemaHeaderRe.exec(raw);
  if (!schemaMatch) {
    throw new Error('select-v2.md: RESPONSE JSON SCHEMA header not found');
  }
  const afterSchemaHeader = raw.slice(schemaMatch.index + schemaMatch[0].length);
  const jsonFenceRe = /```json\s*\n([\s\S]*?)\n```/m;
  const jsonFenceMatch = jsonFenceRe.exec(afterSchemaHeader);
  if (!jsonFenceMatch || jsonFenceMatch[1] === undefined) {
    throw new Error('select-v2.md: ```json fenced block under RESPONSE JSON SCHEMA not found');
  }
  let responseSchema: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonFenceMatch[1]);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('schema is not a JSON object');
    }
    responseSchema = parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `select-v2.md: RESPONSE JSON SCHEMA is not valid JSON: ${(err as Error).message}`,
    );
  }

  return { systemInstruction, userTemplate, responseSchema };
}

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
 * Multi-signal context gathering (parallel Supabase fetches)
 * --------------------------------------------------------------------------- */

/** Pretty-print a JSON-ish value into a readable prompt block. */
function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

/** Distinct, deduplicated chapter set drawn from L3 filtered_candidates. */
function chaptersFromCandidates(
  candidates: RetrievalCandidate[],
): ChapterCode[] {
  const seen = new Set<string>();
  for (const c of candidates) {
    const chapter = c.parent_chain.chapter ?? c.code.slice(0, 2);
    if (chapter !== null && /^\d{2}$/.test(chapter)) {
      seen.add(chapter);
    }
  }
  return Array.from(seen).sort();
}

/** Hydrate a candidate row from filtered_candidates + DB rows. */
function hydrateCandidateRow(
  candidate: RetrievalCandidate,
  dbRow: Awaited<ReturnType<typeof getSelectCandidateRows>>[number] | undefined,
): SelectCandidateRow {
  if (dbRow === undefined) {
    // Missing DB row — surface a minimal stub. Verifier Rule 1 will catch the
    // membership failure if the model picks this code anyway.
    const chap = candidate.parent_chain.chapter ?? candidate.code.slice(0, 2);
    const head = candidate.parent_chain.heading ?? candidate.code.slice(0, 4);
    const sub  = candidate.parent_chain.subheading ?? candidate.code.slice(0, 7);
    return {
      code:                candidate.code,
      is_six_digit_only:   candidate.level === 'subheading',
      description:         '',
      chapter:             chap,
      heading:             head,
      subheading:          sub,
      subheading_title:    null,
      heading_title:       null,
      chapter_title:       null,
      export_policy:       null,
      policy_condition:    null,
      india_specific:      false,
      india_specific_note: null,
      retrieval_score:     candidate.rerank_score ?? candidate.cosine_score ?? null,
    };
  }
  return {
    code:                dbRow.code,
    is_six_digit_only:   dbRow.is_six_digit_only,
    description:         dbRow.description,
    chapter:             dbRow.chapter,
    heading:             dbRow.heading,
    subheading:          dbRow.subheading,
    subheading_title:    dbRow.subheading_title,
    heading_title:       dbRow.heading_title,
    chapter_title:       dbRow.chapter_title,
    export_policy:       dbRow.export_policy,
    policy_condition:    dbRow.policy_condition,
    india_specific:      dbRow.india_specific,
    india_specific_note: dbRow.india_specific_note,
    retrieval_score:     candidate.rerank_score ?? candidate.cosine_score ?? null,
  };
}

/**
 * Fetch all multi-signal context required by Select in parallel.
 *
 * Five independent queries:
 *   1. candidate rows (hydrated from tariff_lines + subheadings)
 *   2. chapter notes bundles (chapters + parent sections)
 *   3. notes_claims rows scoped to candidate chapters
 *   4. tariff_line_attributes rows (may be empty during O2 ramp)
 *   5. GIRs (in-process — no DB round trip; fast path)
 *
 * Returns a fully-rendered SelectContext that renderSelectPrompt can substitute.
 */
export async function gatherSelectContext(input: L4Input): Promise<SelectContext> {
  const codes = input.filtered_candidates.map((c) => c.code);
  const chapters = chaptersFromCandidates(input.filtered_candidates);

  const [
    candidateRows,
    chapterNoteRows,
    notesClaimRows,
    tariffLineAttrs,
  ] = await Promise.all([
    getSelectCandidateRows(codes),
    getChapterNotesBundles(chapters),
    getNotesClaimsForChapters(chapters),
    getTariffLineAttributesForCodes(codes),
  ]);

  // Re-key candidate rows by code for fast lookup; preserve L3 order in output.
  const rowsByCode = new Map<string, Awaited<ReturnType<typeof getSelectCandidateRows>>[number]>();
  for (const r of candidateRows) {
    rowsByCode.set(r.code, r);
  }
  const candidates: SelectCandidateRow[] = input.filtered_candidates.map((c) =>
    hydrateCandidateRow(c, rowsByCode.get(c.code)),
  );

  // Re-key chapter notes by chapter.
  const chapter_notes_by_chapter: Record<string, SelectChapterNotesBundle> = {};
  for (const row of chapterNoteRows) {
    chapter_notes_by_chapter[row.chapter] = {
      notes:                    Array.isArray(row.notes)                    ? row.notes                    : [],
      chapter_subheading_notes: Array.isArray(row.chapter_subheading_notes) ? row.chapter_subheading_notes : [],
      supplementary_notes:      Array.isArray(row.supplementary_notes)      ? row.supplementary_notes      : [],
      export_licensing_notes:   Array.isArray(row.export_licensing_notes)   ? row.export_licensing_notes   : [],
      section_notes:            Array.isArray(row.section_notes)            ? row.section_notes            : [],
    };
  }

  // Notes claims — slim shape for the prompt.
  const notes_claims: SelectNotesClaim[] = notesClaimRows.map((r) => ({
    id:         r.id,
    // source_kind in DB is one of the NotesClaimSourceKind enum members.
    source:     (r.source_kind === 'chapter_note' || r.source_kind === 'section_note'
                 || r.source_kind === 'subheading_note' || r.source_kind === 'heading_note')
                ? r.source_kind
                : 'chapter_note',
    source_ref: r.source_ref,
    claim_type: r.claim_type,
    claim_text: r.claim_text,
    predicate:  typeof r.predicate === 'string' ? r.predicate : JSON.stringify(r.predicate),
    applies_to: r.applies_to,
  }));

  // GIRs — hardcoded full set (all 6 GIRs).
  const girRules = getAllGIRRules();
  const applicable_GIRs = girRules
    .map((r) => `GIR ${r.number} — ${r.title}: ${r.application}`)
    .join('\n');

  return {
    candidates,
    tariff_line_attributes:  tariffLineAttrs,
    notes_claims,
    chapter_notes_by_chapter,
    matched_exclusion_rules: input.matched_exclusions,
    applicable_GIRs,
    current_year: input.current_year ?? new Date().getUTCFullYear(),
  };
}

/* ---------------------------------------------------------------------------
 * User-prompt template rendering (mirrors L1-triage minimal Handlebars-like)
 * --------------------------------------------------------------------------- */

/** Format verifier_failures as a multi-line repair block, or empty string. */
function renderRepairBlock(failures: VerifierRuleFailure[] | null | undefined): string {
  if (!failures || failures.length === 0) return '';
  const lines: string[] = [
    '',
    'REPAIR ITERATION — the previous emission failed the Mechanical Verifier.',
    'You MUST address every entry below. Change ONLY the flagged fields; preserve everything else.',
    '',
    'VERIFIER_FAILURES:',
    pretty(failures.map((f) => ({
      rule_id:       f.rule_id,
      rule_name:     f.rule_name,
      failure_code:  f.failure_code ?? null,
      failure_detail: f.failure_detail,
      field_path:    f.field_path ?? null,
      suggested_fix: f.suggested_fix ?? null,
    }))),
    '',
  ];
  return lines.join('\n');
}

/**
 * Render the Select user template against `input` + fetched `context`. Mirrors
 * L1-triage.ts: simple `{name}` substitutions plus a single repair-block sentinel.
 */
function renderSelectPrompt(
  template: string,
  input: L4Input,
  context: SelectContext,
): string {
  const repairBlock = renderRepairBlock(input.verifier_failures ?? null);

  return template
    .replace(/\{query\}/g, input.normalized_query)
    .replace(/\{extracted_attributes\}/g, pretty(input.extracted_attributes))
    .replace(/\{composite_product_flag\}/g, String(input.composite_flag))
    .replace(/\{candidates\}/g, pretty(context.candidates))
    .replace(/\{tariff_line_attributes\}/g, pretty(context.tariff_line_attributes))
    .replace(/\{notes_claims\}/g, pretty(context.notes_claims))
    .replace(/\{chapter_notes_by_chapter\}/g, pretty(context.chapter_notes_by_chapter))
    .replace(/\{matched_exclusion_rules\}/g, pretty(context.matched_exclusion_rules))
    .replace(/\{applicable_GIRs\}/g, context.applicable_GIRs)
    .replace(/\{current_year\}/g, String(context.current_year))
    .replace(/\{verifier_failures_block_if_repair_iteration\}/g, repairBlock);
}

/* ---------------------------------------------------------------------------
 * Runtime type guards (hand-rolled — no Zod in deps; mirrors L1 pattern)
 * --------------------------------------------------------------------------- */

const GIR_IDS: ReadonlySet<GIRIdentifier> = new Set<GIRIdentifier>([
  'GIR-1',
  'GIR-2(a)',
  'GIR-2(b)',
  'GIR-3(a)',
  'GIR-3(b)',
  'GIR-3(c)',
  'GIR-4',
  'GIR-5(a)',
  'GIR-5(b)',
  'GIR-6',
]);

const CITATION_TYPES: ReadonlySet<SelectCitationType> = new Set<SelectCitationType>([
  'note',
  'exclusion',
  'leaf_description',
]);

const COMPONENT_ROLES: ReadonlySet<'primary' | 'secondary' | 'auxiliary'> = new Set([
  'primary',
  'secondary',
  'auxiliary',
]);

const SELF_CONFIDENCES: ReadonlySet<SelfConfidence> = new Set<SelfConfidence>([
  'HIGH',
  'MEDIUM',
  'LOW',
]);

/**
 * Source-ref grammar from sub-spec 01: `<table>:<key_col>=<key_val>[:<json_path>]`.
 *
 * NOTE: L4 does NOT enforce this regex at parse time — select-v2.md's worked
 * examples use a looser shorthand (`chapters.notes[2]`, `chapter_exclusions.id=842`)
 * that pre-dates the sub-spec 01 grammar lock. Strict enforcement here would
 * over-reject legitimate emissions; the Mechanical Verifier (MV-04) is the
 * authoritative source_ref validator and emits `MALFORMED_SOURCE_REF` failures
 * the orchestrator routes back through the repair loop. We accept any non-empty
 * string here.
 */
// (The authoritative source_ref grammar/regex lives in
// lib/source-ref-resolver.ts, where MV-03 enforces it; L4 accepts any
// non-empty string, so no regex is needed here.)

/** Code regex — 8-digit OR 6-digit. */
const CODE_RE = /^\d{4}\.\d{2}(\.\d{2})?$/;
const SIX_DIGIT_RE = /^\d{4}\.\d{2}$/;
const EIGHT_DIGIT_RE = /^\d{4}\.\d{2}\.\d{2}$/;

function isCitationPrimary(v: unknown): v is SelectCitationPrimary {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.type !== 'string' || !CITATION_TYPES.has(o.type as SelectCitationType)) return false;
  // source_ref: any non-empty string (MV-04 is the authoritative grammar checker).
  if (typeof o.source_ref !== 'string' || o.source_ref.length < 1) return false;
  if (typeof o.verbatim_text !== 'string' || o.verbatim_text.length < 1) return false;
  if (o.note_or_exclusion_id !== null && typeof o.note_or_exclusion_id !== 'number') return false;
  return true;
}

function isCitation(v: unknown): v is SelectCitation {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!isCitationPrimary(o.primary)) return false;
  if (typeof o.gir_applied !== 'string') return false;
  if (!GIR_IDS.has(o.gir_applied as GIRIdentifier)) return false;
  return true;
}

function isComponent(v: unknown): v is SelectComponent {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === 'string' && o.name.length >= 1 &&
    typeof o.material === 'string' && o.material.length >= 1 &&
    typeof o.role === 'string' &&
    COMPONENT_ROLES.has(o.role as 'primary' | 'secondary' | 'auxiliary')
  );
}

function isRefusal(v: unknown): v is SelectRefusal {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.reason === 'string';
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isCodeArray(v: unknown): v is string[] {
  return isStringArray(v) && v.every((c) => CODE_RE.test(c));
}

function isIntegerArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/**
 * Full structural validation of a SelectOutput per select-v2.md schema.
 *
 * Validates:
 *   - All REQUIRED top-level fields present
 *   - selected_code is null OR matches code regex
 *   - selected_code_is_six_digit consistent with code shape
 *   - citation passes deep checks (source_ref grammar, gir_applied enum)
 *   - reasoning_chain length 2..5
 *   - alternatives_considered ≤4 valid codes
 *   - GIR-3(b) ⇒ components non-null array of ≥2
 *   - REFUSE invariants (null selected_code ⇔ refusal populated, policy nulled,
 *     india_specific_flag=false, self_confidence=LOW)
 */
export function isSelectOutput(v: unknown): v is SelectOutput {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;

  // selected_code
  if (o.selected_code !== null && typeof o.selected_code !== 'string') return false;
  if (typeof o.selected_code === 'string' && !CODE_RE.test(o.selected_code)) return false;

  // selected_code_is_six_digit + code-shape consistency
  if (typeof o.selected_code_is_six_digit !== 'boolean') return false;
  if (typeof o.selected_code === 'string') {
    if (o.selected_code_is_six_digit && !SIX_DIGIT_RE.test(o.selected_code)) return false;
    if (!o.selected_code_is_six_digit && !EIGHT_DIGIT_RE.test(o.selected_code)) return false;
  }

  // export_policy / policy_condition
  if (o.export_policy !== null && typeof o.export_policy !== 'string') return false;
  if (o.policy_condition !== null && typeof o.policy_condition !== 'string') return false;

  // india_specific_flag
  if (typeof o.india_specific_flag !== 'boolean') return false;

  // reasoning_chain — 2..5 strings
  if (!isStringArray(o.reasoning_chain)) return false;
  if (o.reasoning_chain.length < 2 || o.reasoning_chain.length > 5) return false;

  // citation
  if (!isCitation(o.citation)) return false;

  // exclusions_checked — array of integers
  if (!isIntegerArray(o.exclusions_checked)) return false;

  // self_confidence
  if (typeof o.self_confidence !== 'string' || !SELF_CONFIDENCES.has(o.self_confidence as SelfConfidence)) {
    return false;
  }

  // alternatives_considered — array of code-shaped strings (≤4)
  if (!isCodeArray(o.alternatives_considered)) return false;
  if (o.alternatives_considered.length > 4) return false;

  // components — required non-null array (≥2) when gir_applied=GIR-3(b); else array-or-null
  // Per select-v2.md allOf conditional: minItems:2 applies ONLY in the then-branch
  // (gir_applied === 'GIR-3(b)'). In the else-branch any array length is permitted.
  const girApplied = (o.citation as SelectCitation).gir_applied;
  if (girApplied === 'GIR-3(b)') {
    if (!Array.isArray(o.components) || o.components.length < 2 || o.components.length > 8) return false;
    if (!o.components.every(isComponent)) return false;
  } else {
    if (o.components !== null) {
      if (!Array.isArray(o.components)) return false;
      if (o.components.length > 8) return false;
      if (!o.components.every(isComponent)) return false;
    }
  }

  // refusal — conditional
  if (o.selected_code === null) {
    if (!isRefusal(o.refusal)) return false;
    // REFUSE invariants per select-v2.md allOf #1
    if (o.export_policy !== null) return false;
    if (o.policy_condition !== null) return false;
    if (o.india_specific_flag !== false) return false;
    if (o.self_confidence !== 'LOW') return false;
  } else {
    if (o.refusal !== null) return false;
  }

  return true;
}

/* ---------------------------------------------------------------------------
 * JSON parsing helper (mirrors L1)
 * --------------------------------------------------------------------------- */

/**
 * Parse Select JSON. Tries strict JSON.parse first; falls back to extracting
 * the first balanced `{...}` block.
 *
 * After JSON decoding, validates the parsed value against `SelectOutputZ` via
 * `parseOrThrow`. On `LlmOutputValidationError` (schema mismatch) or JSON
 * parse failure, returns null — triggering the caller's retry-then-REFUSE path.
 */
function tryParseSelectJSON(text: string): SelectOutput | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      parsed = JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }

  // Zod validation at the parse site — replaces the bare isSelectOutput check.
  // Returns null on schema mismatch so the caller's retry-then-REFUSE path fires.
  let zodParsed: unknown;
  try {
    zodParsed = parseOrThrow(SelectOutputZ, parsed, 'L4-select');
  } catch (err) {
    if (err instanceof LlmOutputValidationError) {
      // eslint-disable-next-line no-console
      console.log(`[L4] Zod validation failed: ${err.message}`);
      return null;
    }
    throw err;
  }

  // Cross-field invariants (allOf conditional rules from select-v2.md) enforced
  // by the hand-rolled isSelectOutput guard. Zod handles structural shape only.
  return isSelectOutput(zodParsed) ? zodParsed : null;
}

/* ---------------------------------------------------------------------------
 * Synthetic REFUSE builder (incoherent_query path)
 * --------------------------------------------------------------------------- */

/**
 * Build a synthetic REFUSE SelectOutput. Used when we cannot get a valid response
 * from Vertex even after retry, or when the model hallucinates persistently.
 *
 * Per the select-v2.md allOf invariants: null code → refusal populated, policy
 * fields null, india_specific_flag=false, self_confidence=LOW. The citation
 * is set to a sentinel "system" reference so the schema validator accepts it.
 */
function syntheticRefuse(reason: string): SelectOutput {
  return {
    selected_code:              null,
    selected_code_is_six_digit: false,
    export_policy:              null,
    policy_condition:           null,
    india_specific_flag:        false,
    reasoning_chain: [
      'L4 was unable to produce a faithful classification under strict reading.',
      reason,
    ],
    citation: {
      primary: {
        type:                 'leaf_description',
        source_ref:           'system:layer=l4_synthetic_refuse',
        verbatim_text:        reason,
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

/* ---------------------------------------------------------------------------
 * Hard-constraint checks (post-parse)
 * --------------------------------------------------------------------------- */

/** True iff `selected_code` is not in `filtered_candidates.map(c => c.code)`. */
function isHallucinatedCode(
  output: SelectOutput,
  candidates: RetrievalCandidate[],
): boolean {
  if (output.selected_code === null) return false; // refusal is fine
  const ok = new Set(candidates.map((c) => c.code));
  return !ok.has(output.selected_code);
}

/* ---------------------------------------------------------------------------
 * Single Vertex call wrapper
 * --------------------------------------------------------------------------- */

interface CallResult {
  parsed:  SelectOutput | null;
  rawText: string;
}

async function callSelect(
  systemInstruction: string,
  userPrompt:        string,
  responseSchema:    Record<string, unknown>,
): Promise<CallResult> {
  const res = await generateContent({
    model:            'gemini-3.5-flash',
    prompt:           userPrompt,
    systemInstruction,
    thinkingLevel:    'low',
    responseSchema,
    responseMimeType: 'application/json',
    temperature:      0.0,
    maxOutputTokens:  4096,
  });
  return { parsed: tryParseSelectJSON(res.text), rawText: res.text };
}

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Run Select (Layer 4) against `gemini-3.5-flash` with thinking_level=low.
 *
 * Behavior summary:
 *   1. Gather multi-signal context via 4 parallel Supabase queries.
 *   2. Render the v2 user template (substituting all signals + repair block).
 *   3. Call Vertex with the parsed responseSchema enforced.
 *   4. Validate the JSON against `isSelectOutput`. On invalid JSON or schema
 *      failure → retry ONCE at temp=0.0. On second failure → synthetic REFUSE
 *      with reason `incoherent_query` (parse/validation failed twice).
 *   5. Hard constraint: `selected_code ∈ filtered_candidates.map(c => c.code)`.
 *      If hallucinated → retry ONCE. If still hallucinated → synthetic REFUSE.
 *   6. NO repair LOOP inside L4. The orchestrator re-invokes L4 with
 *      `verifier_failures` populated when the Mechanical Verifier rejects.
 *      L4 honors that input by rendering the repair block in the user prompt.
 *
 * MaxTokensError (raised by vertex-client when `finishReason === 'MAX_TOKENS'`)
 * propagates to the caller — the orchestrator handles deep-think escalation.
 *
 * L4/Verifier division of responsibility:
 * L4 enforces (a) structural schema conformance, (b) candidate-set membership of selected_code,
 * (c) REFUSE invariants, and (d) GIR-3(b) components presence.
 * Verifier (L5) enforces DB-truth checks: source_ref grammar (MV-04), verbatim citation match
 * (MV-03 / Rule 3), export_policy verbatim (MV-10 / Rule 10), and india_specific_flag accuracy
 * (MV-06 / Rule 6). L4 accepts the model's emission for these fields and lets MV catch drift.
 */
export async function select(input: L4Input): Promise<SelectOutput> {
  const { systemInstruction, userTemplate, responseSchema } = loadPrompt();

  // 1) Gather context.
  const context = await gatherSelectContext(input);

  // 2) Render user prompt.
  const userPrompt = renderSelectPrompt(userTemplate, input, context);

  // 3) Call Vertex (attempt 1).
  const r1 = await callSelect(systemInstruction, userPrompt, responseSchema);
  let parsed = r1.parsed;
  let attempts = 1;

  // 4) Retry on invalid JSON / schema-fail.
  if (parsed === null) {
    // eslint-disable-next-line no-console
    console.log('[L4] Select attempt 1 invalid JSON; retrying once.');
    const r2 = await callSelect(systemInstruction, userPrompt, responseSchema);
    parsed = r2.parsed;
    attempts = 2;
    if (parsed === null) {
      // eslint-disable-next-line no-console
      console.log('[L4] Select attempt 2 invalid JSON; returning synthetic REFUSE.');
      return syntheticRefuse('Select produced invalid JSON twice; refusing to guess.');
    }
  }

  // 5) Candidate-set membership enforcement.
  if (isHallucinatedCode(parsed, input.filtered_candidates)) {
    // eslint-disable-next-line no-console
    console.log('[L4] Select attempt 1 hallucinated code; retrying once.');
    const r3 = await callSelect(systemInstruction, userPrompt, responseSchema);
    attempts += 1;
    const retryParsed = r3.parsed;
    if (retryParsed === null || isHallucinatedCode(retryParsed, input.filtered_candidates)) {
      // eslint-disable-next-line no-console
      console.log('[L4] Select hallucinated code on retry; returning synthetic REFUSE.');
      return syntheticRefuse(
        `Select hallucinated selected_code "${parsed.selected_code}" not in candidate set; refusing.`,
      );
    }
    parsed = retryParsed;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[L4] Select decision=${parsed.selected_code === null ? 'REFUSE' : 'CLASSIFY'} ` +
    `code=${parsed.selected_code ?? 'null'} ` +
    `gir=${parsed.citation.gir_applied} ` +
    `confidence=${parsed.self_confidence} ` +
    `attempts=${attempts}`,
  );
  return parsed;
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  parsePrompt,
  renderSelectPrompt,
  renderRepairBlock,
  tryParseSelectJSON,
  isSelectOutput,
  isHallucinatedCode,
  chaptersFromCandidates,
  hydrateCandidateRow,
  syntheticRefuse,
};

/* ---------------------------------------------------------------------------
 * Re-exports for orchestrator wiring (when L5/L7 land)
 * --------------------------------------------------------------------------- */

export type { ExclusionMatch };

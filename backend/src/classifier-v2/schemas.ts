/**
 * Zod runtime schemas for Layer 1 (Triage) and Layer 4 (Select) LLM outputs.
 *
 * These schemas mirror the RESPONSE JSON SCHEMA sections in:
 *   - backend/prompts/triage-v2.md
 *   - backend/prompts/select-v2.md
 *
 * and the TypeScript interfaces in backend/src/classifier-v2/types.ts.
 *
 * Design notes:
 * - `parseOrThrow` accepts an already-parsed `unknown` value (NOT a raw JSON
 *   string) because the L1/L4 parse helpers already perform `JSON.parse` with
 *   fallback-brace extraction before reaching the validation step.
 * - On Zod failure we throw `LlmOutputValidationError` — a DISTINGUISHABLE
 *   error class that lets a later task (§7 error handling) catch validation
 *   failures specifically (retry-then-REFUSE) vs transport/network errors.
 * - The conditional allOf invariants from the prompt schemas (Triage: CLASSIFY
 *   must have candidate_chapters ≥1 + null clarifying_question/refusal; ASK must
 *   have non-null clarifying_question; REFUSE must have refusal_reason +
 *   out_of_scope_class. Select: null selected_code → refusal populated, GIR-3(b)
 *   → components non-null) are intentionally NOT encoded in Zod here. Both parse
 *   sites enforce them AFTER Zod via their hand-rolled guards — L1-triage.ts
 *   chains `parseOrThrow(TriageOutputZ)` → `isTriageOutput`, and L4-select.ts
 *   chains `parseOrThrow(SelectOutputZ)` → `isSelectOutput`. The Mechanical
 *   Verifier (L5) is the authoritative DB-truth enforcer downstream. Zod handles
 *   structural shape only — field presence, types, enum values, array bounds —
 *   to keep the schema minimal and readable.
 */
import { z } from 'zod';

/* ---------------------------------------------------------------------------
 * Custom error class — distinguishable from network/transport errors
 * --------------------------------------------------------------------------- */

export class LlmOutputValidationError extends Error {
  public readonly ctx: string;
  public readonly issues: z.ZodIssue[];

  constructor(ctx: string, issues: z.ZodIssue[]) {
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    super(`LLM output validation failed [${ctx}]: ${summary}`);
    this.name = 'LlmOutputValidationError';
    this.ctx = ctx;
    this.issues = issues;
  }
}

/* ---------------------------------------------------------------------------
 * Shared sub-schemas
 * --------------------------------------------------------------------------- */

const AttributeKeyZ = z.enum([
  'material',
  'form',
  'function',
  'intended_use',
  'processing_state',
  'composition',
]);

const OutOfScopeClassZ = z.enum([
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

/* ---------------------------------------------------------------------------
 * TriageOutput schema
 * --------------------------------------------------------------------------- */

const TriageFallbackOptionZ = z.object({
  id:    z.string(),
  label: z.string(),
});

const TriageClarifyingQuestionZ = z.object({
  discriminating_attribute: AttributeKeyZ,
  fallback_question_text:   z.string(),
  fallback_options:         z.array(TriageFallbackOptionZ).min(2).max(4),
});

const TriageExtractedAttributesZ = z.object({
  material:                    z.string().nullable(),
  material_confidence:         z.number().nullable(),
  form:                        z.string().nullable(),
  form_confidence:             z.number().nullable(),
  function:                    z.string().nullable(),
  function_confidence:         z.number().nullable(),
  intended_use:                z.string().nullable(),
  intended_use_confidence:     z.number().nullable(),
  processing_state:            z.string().nullable(),
  processing_state_confidence: z.number().nullable(),
  composition:                 z.string().nullable(),
  composition_confidence:      z.number().nullable(),
  head_nouns_for_fts:          z.array(z.string()).min(1).max(5),
  raw_tokens:                  z.array(z.string()).max(8),
});

/**
 * Zod schema for TriageOutput.
 *
 * The allOf conditional invariants (e.g., CLASSIFY → clarifying_question must
 * be null; REFUSE → refusal_reason + out_of_scope_class required) are enforced
 * by the hand-rolled `isTriageOutput` guard in L1-triage.ts, NOT here. Zod
 * handles the structural shape only.
 */
export const TriageOutputZ = z.object({
  decision:             z.enum(['CLASSIFY', 'ASK', 'REFUSE']),
  extracted_attributes: TriageExtractedAttributesZ,
  candidate_chapters:   z.array(z.string()).max(3),
  completeness_signal:  z.number().min(0).max(1),
  clarifying_question:  TriageClarifyingQuestionZ.nullable(),
  refusal_reason:       z.string().nullable(),
  out_of_scope_class:   OutOfScopeClassZ.nullable(),
});

/* ---------------------------------------------------------------------------
 * SelectOutput schema
 * --------------------------------------------------------------------------- */

const GIRIdentifierZ = z.enum([
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

const SelectCitationPrimaryZ = z.object({
  type:                 z.enum(['note', 'exclusion', 'leaf_description']),
  source_ref:           z.string().min(1),
  verbatim_text:        z.string().min(1),
  note_or_exclusion_id: z.number().int().nullable(),
});

const SelectCitationZ = z.object({
  primary:     SelectCitationPrimaryZ,
  gir_applied: GIRIdentifierZ,
});

const SelectComponentZ = z.object({
  name:     z.string().min(1),
  material: z.string().min(1),
  role:     z.enum(['primary', 'secondary', 'auxiliary']),
});

const SelectRefusalZ = z.object({
  reason: z.string(),
});

/** Code regex pattern: 8-digit OR 6-digit ITC-HS code. */
const CODE_PATTERN = /^\d{4}\.\d{2}(\.\d{2})?$/;

/**
 * Zod schema for SelectOutput.
 *
 * `components` is nullable (null when GIR ≠ 3(b); array ≥2 when GIR = 3(b)).
 * The GIR-3(b) conditional is enforced by `isSelectOutput` in L4-select.ts.
 *
 * `refusal` is nullable (null when selected_code is non-null; populated when
 * selected_code is null). The allOf REFUSE invariants (export_policy=null,
 * india_specific_flag=false, self_confidence=LOW) are enforced by `isSelectOutput`.
 *
 * `components` is NOT in the prompt schema's `required` array (it is
 * conditionally required via allOf), so we make it optional here — but the
 * TypeScript interface has it as `SelectComponent[] | null`. We accept both
 * `undefined` (missing) and `null` via `.optional().nullable()`, then default
 * missing to `null` via `.transform(v => v ?? null)`.
 */
export const SelectOutputZ = z.object({
  selected_code:              z.string().regex(CODE_PATTERN).nullable(),
  selected_code_is_six_digit: z.boolean(),
  export_policy:              z.string().nullable(),
  policy_condition:           z.string().nullable(),
  india_specific_flag:        z.boolean(),
  reasoning_chain:            z.array(z.string()).min(2).max(5),
  citation:                   SelectCitationZ,
  exclusions_checked:         z.array(z.number().int()),
  self_confidence:            z.enum(['HIGH', 'MEDIUM', 'LOW']),
  alternatives_considered:    z.array(z.string().regex(CODE_PATTERN)).max(4),
  components:                 z.union([
                                z.array(SelectComponentZ).max(8),
                                z.null(),
                              ]).default(null),
  refusal:                    SelectRefusalZ.nullable(),
});

/* ---------------------------------------------------------------------------
 * parseOrThrow — the wiring function used at the L1 / L4 parse sites
 * --------------------------------------------------------------------------- */

/**
 * Validate `parsed` (an already-decoded JSON value) against `schema`.
 *
 * @param schema - The Zod schema to validate against.
 * @param parsed - The already-parsed JSON value (`unknown`). NOT a raw string.
 *                 The caller is responsible for `JSON.parse` and fallback
 *                 brace-extraction BEFORE calling this function.
 * @param ctx    - Short label for the call site (e.g., "L1-triage", "L4-select").
 *                 Included in the error message and the `LlmOutputValidationError.ctx`
 *                 field so callers can distinguish which layer failed.
 * @returns The validated and typed output (`T`).
 * @throws  `LlmOutputValidationError` when Zod validation fails.
 *          All other errors (e.g., JSON parse errors) must be handled by the caller.
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  parsed: unknown,
  ctx:    string,
): T {
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmOutputValidationError(ctx, result.error.issues);
  }
  return result.data;
}

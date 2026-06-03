/**
 * Structured-output adapter: v2 response schema → OpenAI-style JSON Schema
 * (EVAL-ONLY, used by `openrouter-client.ts`).
 *
 * The v2 prompt schemas (triage-v2.md / select-v2.md) are authored in JSON-Schema
 * draft-07 and loaded verbatim. The Gemini path normalizes them to the Vertex
 * OpenAPI-3.0 subset via `sanitizeResponseSchema` (scalar `type` + `nullable`).
 * OpenAI-compatible `response_format: { type: 'json_schema', json_schema: { schema } }`
 * wants standard JSON Schema, NOT the Vertex proto subset, so this adapter
 * produces a CLEAN JSON Schema that OpenRouter (and the upstream provider)
 * accepts:
 *
 *   - `nullable: true` (Vertex/OpenAPI) → `type: ["<t>", "null"]` (JSON Schema).
 *     We accept BOTH the raw draft-07 input (which already uses type-arrays) and a
 *     pre-sanitized Vertex-subset input (nullable), so the adapter is correct
 *     whether it sees the prompt schema raw or post-sanitize.
 *   - `propertyOrdering` (a Vertex-only hint) is dropped.
 *   - draft-07 conditional composition (`allOf`/`if`/`then`/`else`/`$schema`/
 *     `const`/`additionalProperties` at the wrong level) is dropped — the same
 *     cross-field invariants are re-enforced AFTER parsing by each layer's Zod +
 *     hand-rolled guard (isTriageOutput / isSelectOutput), exactly as on the
 *     Gemini path. The wire schema's job is shape + enum + nullability.
 *
 * FAITHFULNESS NOTE: we deliberately do NOT inject strict-mode's
 * `additionalProperties:false` + "every key required" rewrite. Our schemas use
 * optional/nullable fields legitimately; forcing full-required strictness would
 * make a capable model emit refusals/empties and look WORSE than it is (a false
 * negative). The post-parse Zod + guard chain is the real correctness gate. The
 * `strict:true` flag is still passed at the OpenRouter layer (it asks the
 * provider to adhere to the schema we give); we just keep the schema honest.
 */

/** Keywords retained on a JSON-Schema node for the OpenAI/OpenRouter wire. */
const JSON_SCHEMA_KEYWORDS = new Set<string>([
  'type',
  'description',
  'enum',
  'properties',
  'items',
  'required',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'pattern',
  'format',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Recursively convert any incoming schema node (draft-07 OR Vertex-subset) into a
 * clean JSON-Schema node for OpenAI-compatible structured output. Returns a NEW
 * object — never mutates the input (the prompt cache must stay pristine).
 */
export function toOpenAiJsonSchema(schema: unknown): Record<string, unknown> {
  if (!isPlainObject(schema)) {
    return {};
  }

  const out: Record<string, unknown> = {};

  // --- type + nullability -------------------------------------------------
  // Three input shapes are possible:
  //   (a) draft-07 nullable:   type: ["string","null"]   → keep as-is.
  //   (b) Vertex subset:       type: "string", nullable: true → rewrite to (a).
  //   (c) plain scalar:        type: "string"             → keep.
  const rawType = schema.type;
  const nullable = schema.nullable === true;
  if (Array.isArray(rawType)) {
    // Already a JSON-Schema type-array. Normalize: ensure "null" present iff
    // either the array had it or nullable:true was also set.
    const set = new Set(rawType.filter((t): t is string => typeof t === 'string'));
    if (nullable) set.add('null');
    const arr = Array.from(set);
    out.type = arr.length === 1 ? arr[0] : arr;
  } else if (typeof rawType === 'string') {
    out.type = nullable ? [rawType, 'null'] : rawType;
  }

  // --- enum: re-add a null member when the node is nullable ---------------
  if (Array.isArray(schema.enum)) {
    const filtered = schema.enum.filter((e) => e !== null);
    // If the node is nullable (or a null was present), keep null in the enum so a
    // null value validates against the enum constraint.
    const hadNull = schema.enum.some((e) => e === null);
    out.enum = nullable || hadNull ? [...filtered, null] : filtered;
  }

  // --- recurse into properties -------------------------------------------
  if (isPlainObject(schema.properties)) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = toOpenAiJsonSchema(v);
    }
    out.properties = props;
  }

  // --- recurse into items -------------------------------------------------
  if (schema.items !== undefined) {
    out.items = toOpenAiJsonSchema(schema.items);
  }

  // --- copy through remaining allowlisted scalar/array keywords -----------
  for (const key of JSON_SCHEMA_KEYWORDS) {
    if (key in out) continue; // already handled (type/enum/properties/items)
    if (key === 'properties' || key === 'items') continue;
    if (key in schema) out[key] = schema[key];
  }

  return out;
}

/**
 * Tolerant check: does `text` decode to a JSON OBJECT (the shape every v2 layer
 * expects)? Used by the OpenRouter client to decide whether a `json_schema`
 * attempt actually produced usable structured output before falling back to
 * plain JSON-mode. Mirrors the layers' own tolerant parse: try strict parse,
 * else extract the first balanced `{...}` slice.
 */
export function looksLikeValidJsonObject(text: string): boolean {
  if (typeof text !== 'string' || text.trim().length === 0) return false;
  const tryParse = (s: string): boolean => {
    try {
      const v: unknown = JSON.parse(s);
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    } catch {
      return false;
    }
  };
  if (tryParse(text)) return true;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return false;
  return tryParse(text.slice(first, last + 1));
}

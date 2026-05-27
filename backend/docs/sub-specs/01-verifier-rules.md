# SUB-SPEC: Mechanical Verifier Rules 3, 5, and 7/8/9 (Predicate DSL)

**Target:** ARCHITECTURE.md §6 — replaces the existing DSL block and augments underspecified rule stubs.
**Status:** Ready for merge. Implement during Phase 4.2.

## Rule 3 — Verbatim Citation Fuzzy Match (TF-IDF >= 0.6)

**Implementation:** Use Postgres `ts_rank_cd` on `tsvector('english', source_text)` against `plainto_tsquery('english', verbatim_text)`. No new npm dependency. The `tariff_lines.fts_search_text` GIN index already exists. For other citation sources, construct ad-hoc tsvector inline.

`pg_trgm similarity()` would require `CREATE EXTENSION pg_trgm` (not installed) and is a substring-overlap metric that degrades on multi-sentence note text. `ts_rank_cd` weights terms by IDF — better models "is this drawn from this paragraph."

**Score normalization:**
```sql
WITH source_vec AS (SELECT to_tsvector('english', :source_text) AS vec),
     self_score AS (SELECT ts_rank_cd(vec, to_tsquery('english', :self_query)) AS max_score FROM source_vec)
SELECT ts_rank_cd(vec, plainto_tsquery('english', :verbatim_text)) / NULLIF(max_score, 0) AS normalized_score
FROM source_vec, self_score;
```
`:self_query` = 10-word random sample from source text, OR-joined tsquery. `normalized_score >= 0.6` → PASS. NULL → SKIP.

**`source_ref` grammar:** `<table>:<key_column>=<key_value>[:<json_path>]`

| Example | Lookup |
|---|---|
| `chapters.notes:chapter=72:notes[0].text` | `SELECT notes->0->>'text' FROM chapters WHERE chapter='72'` |
| `sections.notes:section=XVI:notes[1].text` | `SELECT notes->1->>'text' FROM sections WHERE section='XVI'` |
| `chapter_exclusions:id=842:source_note_text` | `SELECT source_note_text FROM chapter_exclusions WHERE id=842` |
| `tariff_lines:code=7318.15.00:description` | `SELECT description FROM tariff_lines WHERE code='7318.15.00'` |

Regex: `^[a-z_.]+:[a-z_]+=[\w.]+(:[\w\[\].]+)?$`. Malformed → fail with `failure_code: 'MALFORMED_SOURCE_REF'`.

(Updated 2026-05-26: original regex `^[a-z_]+:...` rejected the spec's own example `chapters.notes:chapter=72:notes[0].text`. Table segment can include `.` for clarity (e.g., `chapters.notes`); the segment AFTER the first `:` is the column key, which remains alphanumeric+underscore only.)

**Calibration plan (Phase 4.4):** Log every `normalized_score` with label `{known_good | suspected_hallucinated}` over 168-case run. Plot distributions. Set operational threshold at the gap. If overlap > 0.1 Bhattacharyya, lower to 0.45 + add `verbatim_text.length >= 20` check. Lock in `backend/src/classifier-v2/verifier/constants.ts` as `CITATION_TFIDF_THRESHOLD`.

## Rule 5 — GIR-3(b) "≥2 Components Enumerated"

**Decision: Option A — structured `components` field in Select output schema.**

Counting array elements is deterministic and ungameable. `reasoning_chain.length >= 2` is a proxy with false positives/negatives. Tiebreak's `composite_flag=true` path already enumerates components — structured field makes it machine-verifiable.

**JSON Schema diff for select-v2.md:**
```json
"components": {
  "type": ["array", "null"],
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["name", "material", "role"],
    "properties": {
      "name":     { "type": "string", "minLength": 1 },
      "material": { "type": "string", "minLength": 1 },
      "role":     { "type": "string", "enum": ["primary", "secondary", "auxiliary"] }
    }
  },
  "minItems": 2,
  "maxItems": 8,
  "description": "REQUIRED when GIR-3(b) applied. Null otherwise."
}
```

Add to `allOf`:
```json
{
  "if": { "properties": { "citation": { "properties": { "gir_applied": { "const": "GIR-3(b)" } } } } },
  "then": { "required": ["components"], "properties": { "components": { "type": "array", "minItems": 2 } } },
  "else": { "properties": { "components": { "type": ["array", "null"] } } }
}
```

**Verifier check:**
```typescript
if (output.citation.gir_applied === 'GIR-3(b)') {
  if (!output.components || output.components.length < 2)
    return fail('GIR_3B_COMPONENTS_MISSING', 'GIR-3(b) claimed but components[] absent or <2');
  if (!input.composite_product_flag)
    return fail('GIR_3B_WITHOUT_COMPOSITE_FLAG', 'GIR-3(b) without composite_flag=true');
}
```

## Rules 7/8/9 — Predicate DSL Three-Valued Semantics

**Operator semantics:**
- `==` against array: `IN` semantics. `{op:'==', var:'material', value:'steel'}` PASS iff `'steel' ∈ attrs.material[]`.
- `!=` against array: PASS iff value NOT in array.
- `EXISTS`: PASS iff key present AND value non-null AND (if array) non-empty.
- Scalar `>`, `<`, `>=`, `<=`: standard.

**Missing-key policy:** When `var` absent from `tariff_line_attributes[code]`, predicate returns `SKIP` (third value). Verifier accumulates skipped predicates in `skipped_predicates: PredicateRef[]` for audit — no false failures from incomplete O2 extraction.

**Three-valued logic:**
- `AND`: any FAIL → FAIL. All PASS → PASS. Some SKIP, none FAIL → SKIP.
- `OR`: any PASS → PASS. All FAIL → FAIL. Some SKIP, none PASS → SKIP.
- `NOT(SKIP) = SKIP`.
- `IMPLIES(ant, con) = OR(NOT(ant), con)`. Ant=FAIL → PASS vacuously.

**Evaluator pseudocode (~50 LOC TS):**
```typescript
type Eval = 'PASS' | 'FAIL' | 'SKIP';

function evalPredicate(pred: Predicate, attrs: TariffLineAttrs, skipped: PredicateRef[], claimId: number): Eval {
  switch (pred.op) {
    case '==': {
      const val = attrs[pred.var];
      if (val == null) { skipped.push({notes_claim_id: claimId, var: pred.var, op: pred.op}); return 'SKIP'; }
      if (Array.isArray(val)) return val.includes(pred.value) ? 'PASS' : 'FAIL';
      return val === pred.value ? 'PASS' : 'FAIL';
    }
    case 'EXISTS': {
      const val = attrs[pred.var];
      if (val == null) return 'FAIL';
      if (Array.isArray(val)) return val.length > 0 ? 'PASS' : 'FAIL';
      return 'PASS';
    }
    case 'AND': {
      let hasSkip = false;
      for (const c of pred.clauses) {
        const r = evalPredicate(c, attrs, skipped, claimId);
        if (r === 'FAIL') return 'FAIL';
        if (r === 'SKIP') hasSkip = true;
      }
      return hasSkip ? 'SKIP' : 'PASS';
    }
    case 'OR': {
      let hasSkip = false;
      for (const c of pred.clauses) {
        const r = evalPredicate(c, attrs, skipped, claimId);
        if (r === 'PASS') return 'PASS';
        if (r === 'SKIP') hasSkip = true;
      }
      return hasSkip ? 'SKIP' : 'FAIL';
    }
    case 'NOT': {
      const r = evalPredicate(pred.clause, attrs, skipped, claimId);
      return r === 'SKIP' ? 'SKIP' : r === 'PASS' ? 'FAIL' : 'PASS';
    }
    case 'IMPLIES': {
      const ant = evalPredicate(pred.antecedent, attrs, skipped, claimId);
      if (ant === 'FAIL') return 'PASS';
      if (ant === 'SKIP') {
        const con = evalPredicate(pred.consequent, attrs, skipped, claimId);
        return con === 'PASS' ? 'PASS' : 'SKIP';
      }
      return evalPredicate(pred.consequent, attrs, skipped, claimId);
    }
    // IN, NOT_IN, !=, scalar comparisons: similar pattern
  }
}
```

## `tariff_line_attributes` schema proposal (O2 output):

```sql
CREATE TABLE tariff_line_attributes (
  code              TEXT PRIMARY KEY REFERENCES tariff_lines(code) ON DELETE CASCADE,
  material          TEXT[]   DEFAULT '{}',
  form              TEXT[]   DEFAULT '{}',
  function_         TEXT[]   DEFAULT '{}',
  intended_use      TEXT[]   DEFAULT '{}',
  processing_state  TEXT[]   DEFAULT '{}',
  composition       TEXT[]   DEFAULT '{}',
  composite_components JSONB DEFAULT NULL,
  -- See sub-spec 04 for numeric composition fields (carbon_pct, chromium_pct, etc.)
  extracted_at      TIMESTAMPTZ,
  extraction_model  TEXT DEFAULT 'claude-opus-4-7',
  extraction_notes  TEXT
);
CREATE INDEX idx_tla_material ON tariff_line_attributes USING GIN(material);
CREATE INDEX idx_tla_form     ON tariff_line_attributes USING GIN(form);
CREATE INDEX idx_tla_func     ON tariff_line_attributes USING GIN(function_);
CREATE INDEX idx_tla_use      ON tariff_line_attributes USING GIN(intended_use);
```

GIN indexes accelerate `WHERE :value = ANY(material)`. Default empty arrays distinguish "no O2 run" (row absent) from "O2 ran, attribute empty" (row present).

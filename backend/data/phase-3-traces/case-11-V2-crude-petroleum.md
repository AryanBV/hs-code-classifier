# Case 11 — V2 — crude petroleum oil

- **Query:** "crude petroleum oil"
- **Expected:** tariff_line `2709.00.10` (India splits 2709.00 into `2709.00.10` PETROLEUM CRUDE + `2709.00.90` OTHER). Both carry `export_policy = 'Restricted'` and `policy_condition = 'Export is allowed through Indian Oil Corporation Limited (IOCL) only.'`
- **Failure class under test:** STE / Restricted-policy surfacing — does the tariff_line policy data propagate from the DB row through Select to the final result?
- **Variant:** V2 (independent-retrieval Verify)

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

The query is short but extremely unambiguous — it pairs a processing-state ("crude") with a specific mineral commodity ("petroleum oil"). All three load-bearing tokens point at a single 4-digit heading.

Expected Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "petroleum",
    "form": "oil (liquid)",
    "function": "feedstock / fuel feedstock",
    "intended_use": "refining / energy",
    "processing_state": "crude (unrefined)",
    "composition": "hydrocarbon mixture, bituminous-mineral origin"
  },
  "candidate_chapters": ["27"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- `processing_state = "crude"` is the discriminator that distinguishes heading 2709 (crude) from 2710 (non-crude petroleum oils). Triage MUST preserve it — losing it collapses the case onto Ch.27's other 15 headings.
- "petroleum" + "oil" with "crude" is one of the very narrowest queries in the entire ITC-HS schedule: chapter 27 heading 2709 is the only place these three tokens collide.
- Completeness ≈ 0.90. No clarifying question needed; `decision = CLASSIFY` with one candidate chapter.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 Chapter retrieval (cosine, top-10)
Trace assumption: chapter 27 (`MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION; BITUMINOUS SUBSTANCES; MINERAL WAXES`) ranks 1. Likely close neighbours by embedding overlap on "oil": chapter 15 (animal/vegetable oils), chapter 29 (organic chemicals), chapter 38 (misc. chemical products), chapter 34 (lubricating preparations). Confirmed those chapters exist via:

```sql
SELECT chapter, title FROM chapters WHERE chapter IN ('27','28','29','15','38');
-- 15: ANIMAL OR VEGETABLE FATS AND OILS ...
-- 27: MINERAL FUELS, MINERAL OILS ...
-- 28: INORGANIC CHEMICALS ...
-- 29: ORGANIC CHEMICALS
-- 38: MISCELLANEOUS CHEMICAL PRODUCTS
```

Cosine top-10 union with Triage's `candidate_chapters=["27"]` produces the working set: **{27, 15, 29, 38, …}**.

### 2.2 Heading retrieval (cosine + FTS, filtered to candidate chapters)
Cosine within chapter 27 will surface 2709 and 2710 at the top because their titles contain the exact tokens. FTS confirms it deterministically:

```sql
SELECT heading, title FROM headings
WHERE to_tsvector('english', title) @@ websearch_to_tsquery('english', 'crude petroleum');
-- 2709 | PETROLEUM OILS AND OILS OBTAINED FROM BITUMINOUS MINERALS, CRUDE
-- 2710 | Petroleum oils and oils obtained from bituminous minerals, other than crude; ...
```

The title of 2709 literally ends in "CRUDE" and the title of 2710 literally says "other than crude" — the discriminator is in the source data, no LLM reasoning needed.

### 2.3 Subheading retrieval (filtered to top-15 headings)
2709 has exactly one subheading (it is a single-subheading heading):

```sql
SELECT subheading, title, india_specific, wco_2022_match
FROM subheadings WHERE heading = '2709';
-- 2709.00 | PETROLEUM OILS AND OILS OBTAINED FROM BITUMINOUS MINERALS, CRUDE | false | false
```

So the cascade collapses to subheading **2709.00**. Note `wco_2022_match = false` because the WCO 6-digit reference data omits empty-title sub-subheadings, but that does not affect retrieval here.

### 2.4 Tariff-line retrieval (union of subheading-membership and heading-membership filters)
Heading 2709 has only two tariff lines:

```sql
SELECT code, description, unit, export_policy, policy_condition
FROM tariff_lines WHERE subheading = '2709.00';
-- 2709.00.10 | PETROLEUM CRUDE | NULL | Restricted | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
-- 2709.00.90 | OTHER           | NULL | Restricted | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
```

### 2.f Parallel Postgres FTS leg on tariff_lines.description
```sql
SELECT code, description, export_policy, policy_condition
FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'crude petroleum oil');
-- 2709.00.10 | PETROLEUM CRUDE | Restricted | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
-- 2709.00.90 | OTHER           | Restricted | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
```

(Note: the query "crude petroleum oil" matches `2709.00.10` description "PETROLEUM CRUDE" via lemmatized FTS; "OTHER" matches via the broader query that included "crude petroleum".)

### Final retrieval candidate set fed into Rerank-4 Fast
Union top-30 cosine + top-30 FTS dedup:

```
2709.00.10  PETROLEUM CRUDE                        (Restricted, IOCL-only)
2709.00.90  OTHER                                  (Restricted, IOCL-only)
2710.xx.xx  ...petroleum oils, other than crude... (several, Free policy)
```

Rerank should put `2709.00.10` at rank 1 because its description is the literal noun phrase "PETROLEUM CRUDE" matching all three load-bearing tokens of the query.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Chapter 27 exclusion rules in DB:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions WHERE source_chapter = '27';
-- 27 | separate chemically defined organic compounds other than pure methane and propane | NULL
-- 27 | medicaments of heading 3003 or 3004                                                | 30
-- 27 | mixed unsaturated hydrocarbons of heading 3301, 3302 or 3805                       | NULL
-- 27 | liquid synthetic polyolefins of which less than 60% by volume distils at 300C ...  | 39
```

FTS test against "crude petroleum oil":

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions WHERE source_chapter = '27'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'crude petroleum oil');
-- (0 rows)
```

No exclusion fires. Also checked Ch.15/29/38 against "crude petroleum" — 0 rows. The candidate `2709.00.10` survives untouched.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o is given the candidate set {2709.00.10, 2709.00.90, 2710.xx.xx} plus the chapter 27 / heading 2709 / subheading 2709.00 notes:

- **Ch.27 Note 1:** "This Chapter does not cover: (a) separate chemically defined organic compounds other than pure methane and propane … (b) medicaments … (c) mixed unsaturated hydrocarbons of heading 3301, 3302 or 3805." → not triggered; crude petroleum is a mixture, not a chemically-defined compound.
- **Ch.27 Note 2:** Scopes heading 2710 to "petroleum oils … other than crude" (verbatim from heading 2710 title). Reinforces 2709 vs 2710 split.
- **GIR 1:** Classification is determined by the terms of the headings and any relative Section/Chapter notes. Heading 2709's title is literally "PETROLEUM OILS …, CRUDE". GIR 1 alone resolves this case — no need to descend to GIR 3.

Expected GPT-4o JSON:

```json
{
  "selected_code": "2709.00.10",
  "reasoning_chain": [
    "GIR 1: heading 2709 title ends in 'CRUDE' — exact lexical and semantic match for the query.",
    "Ch.27 Note 1 does not exclude petroleum mixtures (only separate chemically-defined compounds), and Note 2 confirms 2710 is reserved for non-crude petroleum oils.",
    "Within 2709.00, the India-specific 8-digit split has 2709.00.10 = PETROLEUM CRUDE (the named product) and 2709.00.90 = OTHER. GIR 6 + most-specific-description picks 2709.00.10.",
    "Policy data attached at the tariff_line row: export_policy='Restricted', policy_condition='Export is allowed through Indian Oil Corporation Limited (IOCL) only.' — this is an Indian STE (State Trading Enterprise) channelization that MUST surface on the result."
  ],
  "cited_notes": ["Ch.27 Note 1", "Ch.27 Note 2", "GIR 1", "GIR 6"],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "2709.00.90 OTHER — rejected: 'crude petroleum oil' is the named product; OTHER is residual.",
    "2710.* — rejected by heading 2710's own title ('other than crude')."
  ]
}
```

### STE-policy surfacing check (the actual failure class under test)
The pipeline must propagate three fields from the tariff_lines row into the final `ClassificationResult`:
1. `export_policy = "Restricted"`
2. `policy_condition = "Export is allowed through Indian Oil Corporation Limited (IOCL) only."`
3. (Optional) the chapter-level `export_licensing_notes` — but `chapters.export_licensing_notes = []` for Ch.27 (empty array), and the `policy_conditions` sidecar table is empty. So the ONLY surfacing path is the two columns on `tariff_lines`.

Verdict: Stage-4's output schema must include both columns verbatim. As long as `selectCode()` (or its Phase-4 successor) reads the picked row's full record (not just `code` + `description`), surfacing works. The data IS present in the row — no data gap.

---

## Stage 5 — VERIFY (V2 = independent retrieval)

V2 re-runs Stages 2-4 with Gemini-Select as an independent agent (different model, different temperature seed, same data).

Independent retrieval steps:
- Cosine top-1 chapter = 27 (same).
- Heading FTS hits 2709 + 2710 (same — this is deterministic on the DB).
- Tariff-line FTS on "crude petroleum oil" hits 2709.00.10 + 2709.00.90 (same).
- Rerank ranks 2709.00.10 first (same — its description is the literal phrase).
- Gemini-Select reads Ch.27 Note 1+2 and applies GIR 1 → picks **2709.00.10**.

V2 output:

```json
{
  "independent_pick": "2709.00.10",
  "agrees_with_select": true,
  "difference_reason": null
}
```

Both Select and Verify converge on `2709.00.10`. No disagreement. Critically, both extract the same `export_policy` / `policy_condition` because that data lives on the row that both retrieve.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agrees, Q-budget untouched, no refusal.

---

## Policy-surfacing audit summary

| Surface | Status |
|---|---|
| tariff_lines.export_policy ('Restricted') | Present on both 2709.00.10 and 2709.00.90 — propagates if Select reads the full row |
| tariff_lines.policy_condition (IOCL-only) | Present on both — propagates if Select reads the full row |
| chapters.export_licensing_notes for Ch.27 | `[]` (empty array). Not blocker — not needed because tariff_line columns carry the data |
| policy_conditions sidecar table | 0 rows — confirmed irrelevant for now |
| chapter_exclusions for Ch.27 | 4 rules, none fires on this query — chapter survives |

**Conclusion on failure class:** there is NO data gap and NO architectural gap, AS LONG AS the Phase-4 Select stage selects `tariff_lines.*` columns (not just `code, description`). This is purely a Phase-4 implementation-discipline requirement: the SELECT prompt's `cited_notes` schema and the final `ClassificationResult` shape must include `export_policy` + `policy_condition` (and ideally a structured `restrictions` block). Recommend explicit Phase-3 architecture decision: **"every tariff_line read MUST be a SELECT * — never a column-subset projection — until the final API shape is frozen."**

---

```yaml
case_id: case-11
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "2709.00.10"
  expected: "tariff_line 2709.00.10 (India splits 2709.00 into 2709.00.10 PETROLEUM CRUDE + 2709.00.90 OTHER); both carry export_policy='Restricted' and policy_condition mentioning IOCL"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: >
  No retrieval, rules, or select gap for the code itself. The only design concern
  is a soft architecture-discipline rule: Phase-4 Select MUST propagate
  tariff_lines.export_policy and tariff_lines.policy_condition into the final
  ClassificationResult shape. The data is present on the row; the risk is purely
  a column-projection mistake at the Select stage. Recommend codifying
  "tariff_lines reads = full row, never column subset" in the Phase-3 architecture doc.
data_dependency: NONE
```

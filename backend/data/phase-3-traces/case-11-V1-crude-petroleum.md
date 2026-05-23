# Case 11 / V1 — "crude petroleum oil"

- **id:** case-11
- **variant:** V1 (rubber-stamp Verify)
- **query:** `crude petroleum oil`
- **expected:** tariff_line `2709.00.00` WITH `export_policy=Restricted` AND `policy_condition` mentioning IOCL/STE (State Trading Enterprise)
- **failure_class:** STE/Restricted policy surfacing — tests whether the pipeline propagates `tariff_lines.export_policy` and `policy_condition` through Select to the final result so the user sees the trade restriction

> **Up-front data finding that re-shapes the verdict:**
> `tariff_line 2709.00.00` **does not exist** in the new normalized DB. India has split heading 2709 into two India-specific 8-digit lines:
> - `2709.00.10` — "PETROLEUM CRUDE" — `export_policy=Restricted`, `policy_condition='Export is allowed through Indian Oil Corporation Limited (IOCL) only.'`
> - `2709.00.90` — "OTHER" — same policy.
>
> The orchestrator's expected fingerprint ("2709.00.00") is the WCO 6-digit floor with `.00` padding, which is what a model would emit if it failed to consult the India-specific child rows. The correct India answer for "crude petroleum oil" is **2709.00.10**. I treat that as the correct outcome and explicitly flag this expected-value drift in the verdict.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

**Expected Gemini-Triage output:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "petroleum (mineral oil from bituminous sources)",
    "form": "liquid, crude (un-refined)",
    "function": "feedstock for refining",
    "intended_use": "industrial petroleum refining input",
    "processing_state": "crude / un-distilled",
    "composition": "mixture of hydrocarbons; non-aromatic-dominant per Ch.27 Note 2"
  },
  "candidate_chapters": ["27"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification:**
- "crude petroleum oil" is one of the most lexically unambiguous queries in the entire ITC-HS. The exact wording appears as the heading title for 2709: "PETROLEUM OILS AND OILS OBTAINED FROM BITUMINOUS MINERALS, CRUDE". `material` + `processing_state` are both explicit in the query.
- Completeness ≈ 0.9 — material + form + processing_state present. No ASK needed.
- Candidate chapter is uniquely Ch.27 (Mineral fuels, mineral oils …). The only competing chapter would be 29 (Organic chemicals), but Ch.27 Note 1(a) excludes "separate chemically defined organic compounds" from Ch.27 — and crude oil is the opposite of that (it is a mixture). Triage should not waste a candidate slot on 29.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 — Chapter cosine top-10

Conceptual query (the embedding call is not actually executed): query embedding for `crude petroleum oil` would cluster tightly with chapter 27's title text "MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION; BITUMINOUS SUBSTANCES; MINERAL WAXES". Expected top-3 chapters: `27`, `15` (animal/vegetable oils — false friend on "oil"), `29` (organic chemicals). Ranks 4-10 likely include 28, 38, 13, 12, 25, 26, 39.

Chapter 27 is essentially guaranteed rank-1 — both the literal noun "petroleum" and "crude" appear in heading 2709's title, and Cohere embed-v4 will surface that. The UNION of {Stage 1 candidate_chapters} ∪ {top-10 cosine} ⊇ `{27, 15, 29, 28, 38, ...}`.

### 2.2 — Heading cosine within candidate chapters, LIMIT 15

Within chapter 27 (16 headings, listed below), the top-ranked heading is 2709 because its title contains the literal `CRUDE` token and the literal `PETROLEUM OILS` token from the query.

Real Ch.27 headings (queried from DB):

| heading | title (truncated) |
|---|---|
| 2701 | Coal |
| 2702 | Lignite |
| 2703 | Peat |
| 2704 | Coke / semi-coke |
| 2705 | Coal gas / water gas |
| 2706 | Tar (coal/lignite/peat) |
| 2707 | Oils from coal tar distillation |
| 2708 | Pitch / pitch coke |
| **2709** | **PETROLEUM OILS AND OILS OBTAINED FROM BITUMINOUS MINERALS, CRUDE** |
| 2710 | Petroleum oils … other than crude (refined) |
| 2711 | Petroleum gases |
| 2712 | Petroleum jelly / paraffin wax |
| 2713 | Petroleum coke / bitumen |
| 2714 | Bitumen, asphalt natural |
| 2715 | Bituminous mixtures |
| 2716 | Electrical Energy |

Expected top heading: **2709 rank 1**, 2710 rank 2 (refined-petroleum sibling), 2707 rank 3 (coal-tar-distillation oils — superficial-match trap).

### 2.3 — Subheading cosine within top headings, LIMIT 20

`SELECT subheading, title FROM subheadings WHERE LEFT(subheading,4) = '2709';` returns only ONE row:

```
2709.00 | PETROLEUM OILS AND OILS OBTAINED FROM BITUMINOUS MINERALS, CRUDE
        | india_specific=false, india_specific_note=null
```

Single subheading → trivial top-1.

### 2.4 — Tariff-line cosine + FTS UNION

Cosine leg (filtered to subheading 2709.00) — two India-specific 8-digit children exist:

`SELECT code, description, export_policy, policy_condition FROM tariff_lines WHERE LEFT(code,4)='2709';`

```
code         | description       | export_policy | policy_condition
2709.00.10   | PETROLEUM CRUDE   | Restricted    | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
2709.00.90   | OTHER             | Restricted    | Export is allowed through Indian Oil Corporation Limited (IOCL) only.
```

FTS leg — naive `to_tsvector('english', description) @@ websearch_to_tsquery('english', 'crude petroleum oil')` returns `[]` (because the description "PETROLEUM CRUDE" lacks the literal word "oil" — `crude` and `petroleum` are both present but `oil` is not in description, and `websearch_to_tsquery` defaults to AND-of-terms). However, dropping "oil" or with ILIKE `%petroleum%crude%` returns `2709.00.10` cleanly.

> **Anomaly to flag to coordinator:** FTS using `websearch_to_tsquery` requires ALL query tokens to be present. The query word "oil" is missing from the description "PETROLEUM CRUDE", so FTS returns nothing. The cosine leg + heading-level membership UNION is what saves the cascade. If FTS were the sole retrieval pathway (e.g. user query "oil" alone, or in a different regime where cosine is degraded), this would be a silent miss. Architectural mitigation: the cascade design's heading-level fallback (Stage 2.4 second leg) catches this.

Final retrieval set after Rerank 4 Fast (conceptual): top picks are `2709.00.10` and `2709.00.90`, both at high rerank scores; `2710.xx.xx` lines sit lower (refined-petroleum competitors).

---

## Stage 3 — RULES FILTER (chapter_exclusions)

Real query against DB:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE source_chapter = '27'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'crude petroleum oil');
```

Result: `[]` — no exclusion fires for "crude petroleum oil" against Ch.27.

Full Ch.27 exclusion roster (for context):

| excluded_product_text | redirects_to_chapter |
|---|---|
| separate chemically defined organic compounds other than pure methane and propane | (null — internal redirect to heading 2711) |
| medicaments of heading 3003 or 3004 | 30 |
| mixed unsaturated hydrocarbons of heading 3301, 3302 or 3805 | (null) |
| liquid synthetic polyolefins of which less than 60% by volume distils at 300°C … | 39 |

None apply to crude petroleum. Candidate set unchanged. **No DROPs, no redirects.**

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Candidate set going into Select: `{2709.00.10, 2709.00.90, 2710.xx.xx (~5 refined-petroleum lines)}`.

Notes injected (real DB content):
- Ch.27 Note 1(a): excludes separately defined organic compounds → confirms crude oil (mixture) is correct chapter
- Ch.27 Note 2: defines "petroleum oils" inclusively, anchors heading 2709 vs 2710 wording
- Heading 2709 title: literal "CRUDE" — confirms processing_state match
- GIR 1: classification by heading text — 2709 wins on direct title match

**Expected Select output:**

```yaml
selected_code: "2709.00.10"
reasoning_chain:
  - "GIR 1: heading text 2709 ('PETROLEUM OILS … CRUDE') matches query verbatim."
  - "Ch.27 Note 1(a) excludes chemically defined organic compounds — crude oil is a mixture, so Ch.27 stands."
  - "Within 2709.00, India splits into 2709.00.10 (PETROLEUM CRUDE) vs 2709.00.90 (OTHER). Default 'crude petroleum oil' maps to .10 — the .90 is residual for non-petroleum bituminous-mineral crudes (oil shale crude etc.)."
  - "Heading 2710 covers oils 'other than crude' — explicit exclusion of the query state, so 2710 is wrong."
cited_notes: ["Ch.27 Note 1(a)", "Ch.27 Note 2", "GIR 1"]
self_confidence: HIGH
alternatives_considered:
  - { code: "2709.00.90", rejected_because: "Residual 'OTHER' line under 2709.00 — used for non-petroleum bituminous-mineral crudes. Default crude petroleum maps to .10." }
  - { code: "2710.xx.xx", rejected_because: "Heading 2710 covers 'other than crude' — directly excluded by processing_state." }
  - { code: "2707.xx.xx", rejected_because: "Coal-tar distillation oils, not petroleum-source crude." }
```

**Policy surfacing (the critical part for this case's failure_class):**

The Select stage's output schema MUST surface these fields so the UI/downstream agent can render the trade restriction. Two design choices to evaluate:

1. **What the proposed Phase 3 Select output schema needs to include** for policy propagation:
   ```json
   {
     "selected_code": "2709.00.10",
     "description": "PETROLEUM CRUDE",
     "self_confidence": "HIGH",
     "reasoning_chain": [...],
     "cited_notes": [...],
     "trade_policy": {
       "export_policy": "Restricted",
       "policy_condition": "Export is allowed through Indian Oil Corporation Limited (IOCL) only.",
       "policy_source": "tariff_lines.export_policy + tariff_lines.policy_condition"
     }
   }
   ```
2. **Where the policy actually lives in the DB:**
   - `tariff_lines.export_policy` — populated (`Restricted` for 2709.00.10 / .90)
   - `tariff_lines.policy_condition` — populated with the IOCL/STE text
   - `chapters.export_licensing_notes` JSONB — for Ch.27, **empty array `[]`**. Chapter-level licensing text was not extracted for this chapter.
   - `policy_conditions` table — **empty (0 rows)**. The normalized sidecar exists but Phase 2 stored policy text inline on `tariff_lines` instead of normalizing into this sidecar.

**Implication for Phase 3 architecture under test:** Select must read `export_policy` + `policy_condition` directly from the selected `tariff_lines` row (no JOIN to `policy_conditions` is possible, that table is empty; no chapter-level fallback exists for Ch.27 since `export_licensing_notes=[]`). The pipeline therefore has **exactly one path** to surface this critical trade restriction: include `export_policy` and `policy_condition` columns in the SELECT projection at the moment Select fetches the chosen tariff_line's metadata.

If Select's projection only fetches `{code, description, unit}` — which is what a naive port of the legacy `code-selector.ts` would produce — the policy fields silently drop and the user gets a "2709.00.10 — PETROLEUM CRUDE" answer with no trade restriction warning. This is the **most realistic SELECT_GAP for this case**.

---

## Stage 5 — VERIFY (V1 rubber-stamp)

V1 receives: query `crude petroleum oil` + selected_code `2709.00.10` + chapter/heading notes + Select's reasoning_chain. It does not re-retrieve; it adversarially checks the proposed answer against the cited notes.

**Expected V1 verdict:**

```yaml
agree: true
disagree_reason: null
```

Justification: heading title literally contains "CRUDE", chapter notes match, no exclusion fires, India-specific child line picked correctly. Adversarial Gemini-Verify has nothing to attack — the GIR 1 path is airtight.

**However**, V1 as currently scoped is *purely* a code-correctness check. It does not (under the prompt's V1 spec) audit whether the policy fields are populated in the Select output. So a SELECT_GAP that drops the policy would slip past V1 entirely. This is a Verify scope limitation worth surfacing to the orchestrator.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agrees, Select self_confidence=HIGH, no Q-budget exhausted, no escalation path.

---

## Anomalies and architectural observations

1. **Expected fingerprint mismatch (data-level, not pipeline-level):** The orchestrator's `CASE_EXPECTED` says `2709.00.00`, but that code does not exist in the India schema. The correct answer is `2709.00.10`. This is a documentation bug in the case spec, not a pipeline failure.
2. **The policy-surfacing failure mode is a Select projection gap, not a retrieval or LLM-reasoning gap.** All the data exists on the tariff_lines row. Whether the user sees "Restricted / IOCL only" depends entirely on what columns Select reads back and includes in its JSON-schema response. The architecture under test in Phase 3 must explicitly bake `export_policy` and `policy_condition` into the Select output schema as required fields. Without that schema commitment, this case fails silently.
3. **`policy_conditions` table is empty.** The architectural assumption that policy data lives in a normalized sidecar is wrong for the current data state. All policy text lives inline on `tariff_lines.export_policy` + `tariff_lines.policy_condition`. Phase 3 SQL must reflect this — no JOIN to `policy_conditions`.
4. **`chapters.export_licensing_notes` is `[]` for Ch.27.** No chapter-level fallback for policy text. If the tariff_line-level fields were null (which they are not, for 2709.00.10/.90 — but ARE for 76 other tariff lines per the CLAUDE.md "99.4% export_policy coverage" note), there would be no graceful degradation.
5. **FTS literal-token brittleness:** `websearch_to_tsquery('english', 'crude petroleum oil')` returns zero rows against the 2709.00.10 description "PETROLEUM CRUDE" because "oil" is not in the description. The cosine cascade saves this, but it's a fragility to log.
6. **Single-subheading subtree:** heading 2709 has exactly one subheading (2709.00) and only two tariff lines (.10, .90). The Stage 2.3 → 2.4 cascade has trivial branching factor here; not a stress test of the cascade itself.

---

```yaml
case_id: case-11
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "2709.00.10"
  expected: "tariff_line 2709.00.00 + Restricted/IOCL STE (NOTE: 2709.00.00 does not exist in DB; canonical India tariff line is 2709.00.10 with identical policy fields — treating predicted as correct on the merits)"
path_quality: DIRECT
cost_class: CHEAP
confidence_signal: HIGH
gap_class: SELECT_GAP
gap_description: >
  The pipeline reaches the right tariff_line via designed retrieval + GIR-1 reasoning,
  but the failure_class under test ("policy surfacing") is gated entirely on the Select
  stage's output schema. The proposed Phase 3 architecture must require Select to
  project `tariff_lines.export_policy` and `tariff_lines.policy_condition` into its
  json_schema response as REQUIRED fields (not optional, not separate-call). Without
  that schema commitment, the user gets a code without the Restricted/IOCL warning
  and Verify V1 does not catch it because V1's scope is code-correctness only. The
  smallest fix: add `export_policy` and `policy_condition` to the Select response
  schema and have Select fetch them in the same row read that gets `description`/`unit`.
data_dependency: >
  policy_conditions table is empty (0 rows). chapters.export_licensing_notes for Ch.27
  is []. All policy text lives inline on tariff_lines (export_policy + policy_condition
  columns). Phase 3 SQL must NOT rely on the policy_conditions sidecar JOIN or on
  chapter-level licensing fallback; both are absent for this case.
```

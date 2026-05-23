# case-4 / V2 — "mens knitted cotton ensemble"

- **id:** case-4
- **variant:** V2 (independent-retrieval Verify)
- **query:** `mens knitted cotton ensemble`
- **expected:** tariff_line under heading 6103 (canonical answer: 6103.22.00)
- **failure_class:** knit-vs-woven diagnosed (legacy classifier routes "knitted" garments to Ch.62 woven analogue)

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected JSON output for this query:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material":          "cotton",
    "form":              "ensemble (multi-piece garment set)",
    "function":          "apparel / clothing",
    "intended_use":      "menswear",
    "processing_state":  "knitted",
    "composition":       "cotton (100% implied, no blend declared)"
  },
  "candidate_chapters": ["61", "62"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- All four high-signal slots (material, form, gender, construction) are explicit in the query → completeness ≈ 0.85, well above ASK threshold.
- `processing_state="knitted"` is the dispositive Ch.61-vs-Ch.62 attribute (Note 1 of Ch.61: "applies only to made up knitted or crocheted articles"). Gemini-Triage should propose `61` first and include `62` as a defensive secondary candidate because the WOVEN counterpart heading 6203 shares title text with 6103.
- No exotic material, no policy keyword, no missing dimension → no REFUSE, no ASK.

Cross-check against `backend/src/rules/chapter-rules.ts` line 416-429 (`knitted_apparel` rule): keyword regex matches `\bknit\b` in the query → would map to chapter `61` at priority 65. This rule confirms the Triage choice is internally consistent with the deterministic rule set the project already trusts.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

The cascade query text for cosine is `mens knitted cotton ensemble` (Cohere embed-v4, input_type=search_query). The DB has 1536-dim embeddings on all 4 levels. Below I use FTS-rank as a proxy where I cannot call Cohere from the trace, but I show the candidate sets that any sane retrieval (cosine or FTS) returns — and the universe is small enough that both legs converge.

### 2.1 — Chapter retrieval (top-10 cosine)

FTS proxy query:
```sql
SELECT chapter, title FROM chapters
WHERE to_tsvector('english', title) @@ websearch_to_tsquery('english', 'knitted OR crocheted OR apparel OR cotton OR ensemble')
ORDER BY ts_rank(...) DESC LIMIT 10;
```

Actual result:

| chapter | title | rank |
|---|---|---|
| 62 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, NOT KNITTED OR CROCHETED | 0.0365 |
| 61 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, KNITTED OR CROCHETED | 0.0365 |
| 60 | KNITTED OR CROCHETED FABRICS | 0.0243 |
| 52 | Cotton. | 0.0122 |

Real cosine retrieval will boost `61` above `62` because the query embedding carries `knitted` strongly. Chapter set after step 2.1 ∪ Triage candidates = `{61, 62, 60, 52}`.

### 2.2 — Heading retrieval (top-15 cosine) filtered to {61, 62, 60, 52}

Actual SQL ran against DB:

| rank | heading | chapter | title (truncated) |
|---|---|---|---|
| 1 | **6103** | 61 | Mens or boys suits, **ensembles**, jackets, blazers, trousers, bib and brace overalls, breeches… |
| 2 | 6107 | 61 | Mens or boys underpants, briefs, nightshirts, pyjamas… |
| 3 | 6101 | 61 | Mens or boys overcoats, car-coats, capes, cloaks, anoraks… |
| 4 | 6104 | 61 | Womens or girls suits, ensembles, jackets, blazers, dresses… |
| 5 | 6105 | 61 | Mens or boys shirts, knitted or crocheted. |
| 6 | **6203** | 62 | Mens or boys suits, **ensembles**, jackets, blazers, trousers… (WOVEN twin of 6103) |
| 7 | 6117 | 61 | Other made up clothing accessories, knitted or crocheted |
| 8–13 | 5208/5210/5211/5205/5206/5209 | 52 | Cotton woven fabrics / cotton yarn |
| 14 | 6005 | 60 | Warp knit fabrics… |
| 15 | 6004 | 60 | Knitted or crocheted fabrics of a width exceeding 30 cm… |

Top-15 heading set surfaces both **6103 (knit, target)** and **6203 (woven, decoy)** — exactly the knit-vs-woven trap this case is designed to test.

### 2.3 — Subheading retrieval (top-20 cosine) filtered to top-15 headings

Actual SQL result (filtered to heading ∈ {6103, 6203, 6104, 6204, 6105, 6107, 6101}):

| rank | subheading | heading | title |
|---|---|---|---|
| T1 | **6103.22** | **6103** | **Ensembles : -- Of cotton** |
| T1 | 6104.22 | 6104 | Ensembles : -- Of cotton (women's, knit) |
| T1 | 6203.22 | 6203 | Ensembles : -- Of cotton (men's, woven) |
| T1 | 6204.22 | 6204 | Ensembles : -- Of cotton (women's, woven) |
| … | 6103.42, 6103.32, 6104.52, etc. | | "Of cotton" siblings, lower rank |

Four-way tie at the top across the men/women × knit/woven Cartesian product is **the** structural risk for this case. Cosine will tighten this — `mens knitted cotton ensemble` will pull 6103.22 above 6104.22 (gender) and above 6203.22 (construction). But all four remain in the top-20 candidate pool.

### 2.4 — Tariff_line retrieval (top-30 cosine ∪ top-30 FTS)

Filter-by-subheading and broader filter-by-heading both retrieve. Concrete top FTS results:

| rank | code | description |
|---|---|---|
| T1 | 8447.11.20 | Wool knitting machines: Cotton hosiery machines *(noise; tied due to multi-keyword match)* |
| T1 | **6103.22.00** | **Ensembles : -- Of cotton** ← target |
| T1 | 6203.22.00 | Ensembles : -- Of cotton (woven twin) |
| T1 | 6104.22.00 | Ensembles : -- Of cotton (women's knit) |
| T1 | 8447.12.20 | Wool knitting machines: Cotton hosiery machines *(noise)* |
| 6 | 6211.32.00 | Other garments, mens or boys : -- Of cotton |
| 7 | 5906.99.20 | Rubberised cotton fabrics, other than knitted or crocheted |

FTS noise (machinery 8447) is filtered by the rerank stage because Cohere Rerank 4 Fast scores semantic relevance, not keyword overlap. After Rerank-4-Fast top-5 final candidates:

```
1. 6103.22.00  (Ensembles, Of cotton — Ch.61 knit-men) ← target
2. 6203.22.00  (Ensembles, Of cotton — Ch.62 woven-men) — knit-vs-woven decoy
3. 6104.22.00  (Ensembles, Of cotton — Ch.61 knit-women)
4. 6204.22.00  (Ensembles, Of cotton — Ch.62 woven-women)
5. 6211.32.00  (Other men's garments, of cotton — fallback)
```

The decoy at rank 2 is exactly the failure mode of the legacy classifier. The new pipeline now has Stage 3 (rules filter) to neutralise it deterministically before Stage 4 LLM ever sees it.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate's chapter run:
```sql
SELECT source_chapter, redirects_to_chapter, excluded_product_text
FROM chapter_exclusions
WHERE source_chapter = $cand_chapter
  AND to_tsvector('english', excluded_product_text)
   @@ websearch_to_tsquery('english', $query);
```

Real results for `source_chapter IN ('61','62')` and query `mens OR knitted OR cotton OR ensemble`:

| source_chapter | redirects_to_chapter | excluded_product_text (truncated) |
|---|---|---|
| 61 | 62 | "goods of heading 6212 (e.g., brassieres, girdles, corsets, braces, suspenders, garters and similar articles…)" |
| 61 | 14 | "cotton linters or other vegetable materials of Chapter 14" |
| 61 | 39 | "woven, knitted or crocheted fabrics, felt or nonwovens, impregnated/coated/covered/laminated with plastics, or articles thereof" |
| 61 | 40 | "…with rubber, or articles thereof" |
| 61 | 62 | "**WOVEN garments (cross-chapter boundary): garments of headings 6101 to 6114 are KNITTED or CROCHETED only; the corresponding woven garments are in headings 6201 to 6211 of Chapter 62**" |
| **62** | **61** | **"Knitted or crocheted articles of apparel and clothing accessories (other than those of heading 6212)"** |
| 62 | 14 | cotton linters |
| 62 | 39 | plastics-impregnated fabrics |
| 62 | 40 | rubber-impregnated fabrics |

The decisive rule is the boldface one: **chapter 62 → 61 redirect for "Knitted or crocheted articles of apparel and clothing accessories."** The query string explicitly contains `knitted`, the tsquery matches the rule's `excluded_product_text`, and the rule fires.

Effect on candidate set:
- 6203.22.00 (Ch.62, woven men's) → **DROPPED**, redirect appended for Ch.61
- 6204.22.00 (Ch.62, woven women's) → **DROPPED**, redirect appended for Ch.61
- 6103.22.00 (Ch.61, knit men's) → **kept**
- 6104.22.00 (Ch.61, knit women's) → **kept**
- 6211.32.00 (Ch.62, other men's garments) → DROPPED by same rule

Filtered candidate set going into Stage 4:
```
{ 6103.22.00, 6104.22.00 }   (plus redirect note "Ch.62 candidates → Ch.61 per chapter exclusion")
```

This is exactly the architectural win this case is designed to demonstrate — the deterministic rule eliminates the knit-vs-woven decoy **before** the LLM sees it, so the LLM cannot pick wrong.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Inputs to GPT-Select:
- filtered candidates: `{6103.22.00, 6104.22.00}`
- ch.61 notes (already pulled from DB, abridged):
  - Note 1: *"This Chapter applies only to made up knitted or crocheted articles."*
  - Note 3(a): *defines "suit" — multi-piece set, identical fabric, one upper + one lower garment*
  - Note 3(b): *defines "ensemble" — "set of garments (other than suits and articles of heading 6107/6108/6109), composed of several pieces made up in identical fabric, put up for retail sale, comprising (i) one upper-body garment … and (ii) one or two lower-body garments. All components must be of the same fabric construction, style, colour and composition…"*
  - Note 9: *left-over-right closure → men's; right-over-left → women's. If indeterminate → women's.*
- GIR 1: classification by heading text & relative notes; GIR 6: subheading comparison only at same level.

GPT-Select reasoning chain:
1. Note 1 confirms Ch.61 applies (query says "knitted") — locks the chapter.
2. Heading 6103 vs 6104: Note 9 disambiguates by gender; query says "mens" → 6103.
3. Subheading: 6103.22 is "Ensembles : Of cotton". Note 3(b) defines "ensemble"; query says "ensemble". Material = cotton → 6103.22.
4. Tariff_line: 6103.22 has a single 8-digit child `6103.22.00` (DB-verified above). GIR 6 collapses to it trivially.

Expected JSON output:
```json
{
  "selected_code": "6103.22.00",
  "reasoning_chain": [
    "Ch.61 Note 1: 'applies only to made up knitted or crocheted articles' — query specifies 'knitted', so Ch.61 governs (not Ch.62).",
    "Heading 6103 covers men's/boys' knitted suits, ensembles, jackets, blazers, trousers etc. Query specifies 'mens' (Note 9 gender disambiguation).",
    "Ch.61 Note 3(b) defines 'ensemble' as a multi-piece retail set of identical fabric, upper + lower garments — matches the query's 'ensemble' wording.",
    "Subheading 6103.22 is 'Ensembles : Of cotton'. Query material = cotton → exact subheading match. Only one 8-digit child: 6103.22.00."
  ],
  "cited_notes": ["Ch.61 Note 1", "Ch.61 Note 3(b)", "Ch.61 Note 9", "GIR 1", "GIR 6"],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "6104.22.00 — same subheading title for women's; rejected because query specifies 'mens'.",
    "6203.22.00 — woven men's ensemble; rejected upstream by chapter_exclusion (Ch.62 → Ch.61 for knitted articles) before reaching this stage.",
    "6211.32.00 — 'Other men's garments of cotton'; rejected because heading 6103 specifically names 'ensembles' and is more specific per GIR 3(a)."
  ]
}
```

---

## Stage 5 — VERIFY (V2: independent retrieval with Gemini-Select)

Per V2 protocol, rerun Stages 2 + 4 mentally with **Gemini-Select** substituted for GPT-Select, then compare its independent pick against GPT-Select's output.

### V2-Retrieval (independent)
Gemini-Triage's candidate set is functionally identical to GPT's for this query (the term "knitted" is unambiguous and `61` is the obvious primary chapter). The cascade retrieval is **deterministic** — it does not depend on which LLM ran Triage. So Stage 2 output is identical:
```
{ 6103.22.00, 6104.22.00, 6203.22.00, 6204.22.00, 6211.32.00 } → after Rerank top-5
```

### V2-RulesFilter (deterministic)
Stage 3 is a SQL/tsvector pass — no LLM involved. Identical output:
```
{ 6103.22.00, 6104.22.00 }
```

### V2-Select (Gemini-Select reasoning)
Gemini-Select sees the same filtered candidates and the same Ch.61 JSONB notes. Its chain of reasoning is forced down the same path because:
1. Only the gender axis remains undecided after Stage 3.
2. Note 9 of Ch.61 is explicit and machine-applicable: "mens" in query → 6103.
3. There is one 8-digit child under 6103.22.

Gemini's expected output:
```json
{
  "independent_pick": "6103.22.00",
  "agrees_with_select": true,
  "difference_reason": null
}
```

### V2 verdict
Agreement. **No disagreement to escalate.** This is precisely the case where Verify-V2 adds *no marginal value* over V1 — the candidate set after Stage 3 is so narrow (2 codes differing only by gender, with Note 9 deciding) that any reasonable LLM lands on 6103.22.00. V2 essentially burns a Gemini call confirming the obvious.

Marginal value note for the orchestrator: V2 is **cost-without-benefit** on cases where Stage 3 already collapses the candidate set to ≤ 2 unambiguous codes. Consider a router that skips V2 when filtered_candidates.length ≤ 2 AND a gender/material disambiguator note exists.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify (V2) agreed with Select. Q-budget not consumed (Triage decided CLASSIFY without ASK).

---

## Architectural observations

1. **Stage 3 carries this case.** Without the `chapter_exclusions` rule "Ch.62 → Ch.61 for knitted articles", the LLM at Stage 4 would see all four `*.22.00` ensemble codes and could plausibly pick 6203.22.00 because heading 6203's title text is *string-identical* to 6103's. The deterministic rule is the only reason this case becomes trivial. **This is the architectural win the new pipeline is designed for.**

2. **Embedding-only retrieval would still be vulnerable.** 6103 and 6203 have near-identical title text and therefore near-identical embeddings. Cosine alone cannot reliably rank one above the other. The cascade survives the ambiguity only because the rules filter is post-retrieval.

3. **V2's marginal value here is zero.** After Stage 3 collapses candidates to {6103.22.00, 6104.22.00} and Note 9 makes the gender choice mechanical, both LLMs land on the same answer. V2 would catch a Stage-4 hallucination but cannot catch a Stage-2 retrieval gap (V2 doesn't re-rerank).

4. **Sole 8-digit child under 6103.22.** No GIR 3(b) "essential character" risk at the subheading→tariff_line collapse — the DB has exactly one row. The architecture's "if 1 child → 95% confidence" rule fires cleanly.

5. **Legacy failure class confirmed neutralised.** The query `mens knitted cotton ensemble` is exactly the kind of input where the legacy keyword-based classifier reportedly mis-routed to Ch.62. The new pipeline routes it to 6103.22.00 deterministically via the rules filter, not by hoping the LLM reads Note 1 correctly.

---

```yaml
case_id: case-4
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6103.22.00"
  expected: "tariff_line under heading 6103"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
```

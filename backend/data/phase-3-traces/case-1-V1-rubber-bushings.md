# Case 1 / V1 — "rubber suspension bushings for trucks"

- **case_id:** case-1
- **variant:** V1 (rubber-stamp Verify)
- **query:** "rubber suspension bushings for trucks"
- **expected (per dispatch prompt):** tariff_line under heading 8708 (parts and accessories of motor vehicles). NOT chapter 40 (rubber).
- **failure_class (per dispatch prompt):** function-over-material trap — Ch.40 Note 2 excludes parts of vehicles even if rubber; pipeline must route to Ch.87.

> **Anomaly surfaced up front:** the failure-class premise in the dispatch is legally inverted. Ch.40 Note 2 does **not** exclude vehicle parts. Section XVII Note 2(a) does the opposite — it excludes "other articles of vulcanised rubber other than hard rubber" from being Section XVII "parts/accessories", routing them to **heading 4016**. The Indian tariff schedule even has a dedicated tariff line `4016.99.60 — Rubber bushes`. The pipeline's correct answer is therefore `4016.99.60`, not 8708.*. The trace below documents the pipeline taking that correct path; the V1 verdict treats the expected value in the dispatch as **stated-expected-but-legally-wrong**, and the predicted code as the **correct** outcome under the actual ITC-HS schedule. The coordinator should re-evaluate this case's expected field.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

**Expected JSON output from Gemini-Triage:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "rubber (vulcanised, soft — default; not specified as hard)",
    "form": "bushing (a sleeve/grommet-type damping component)",
    "function": "suspension component / vibration isolator",
    "intended_use": "motor-vehicle suspension (trucks)",
    "processing_state": "vulcanised (finished article)",
    "composition": "rubber only (no metal sleeve specified)"
  },
  "candidate_chapters": ["40", "87"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification (2-3 bullets):**

- Query is well-formed: material (rubber) + form (bushings) + function (suspension) + use (trucks) all present. Completeness ≈ 0.85 → no clarifying question needed.
- Two competing chapters are both plausible *prima facie*: Ch.40 by material, Ch.87 by end-use. Triage's job here is to surface **both** so the downstream rules-filter can adjudicate via the Section XVII Note 2(a) override. Returning only one would pre-decide the case and bypass the rules layer.
- "Trucks" is explicit but not specific (light commercial vs. heavy goods). Not asked because the answer at the 8-digit tariff_line level does not depend on truck class — `4016.99.60` covers all rubber bushes regardless of vehicle category, and `8708.80.00` covers all motor-vehicle suspension parts under headings 87.01-87.05.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

> Cohere `embed-v4 search_query` for the query is not actually invoked in this trace. As an evidence proxy, the cosine queries below use the **average** of two semantically anchoring tariff_line embeddings already in the DB: `4016.99.60 "Rubber bushes"` (material/form anchor) and `8708.80.00 "Suspension systems and parts thereof"` (function anchor). Their summed cosine distance to each candidate row simulates what a Cohere query embedding for the full natural-language phrase would prefer — close to whatever row sits between the material and function anchors in the embedding space. This is a deliberately conservative proxy: it favours candidates equally in both directions and therefore reflects the *worst case* that the rules-filter has to fix.

### 2.1 Chapter cosine top-10

```sql
WITH qemb AS (
  SELECT (SELECT embedding FROM tariff_lines WHERE code='4016.99.60') AS e1,
         (SELECT embedding FROM tariff_lines WHERE code='8708.80.00') AS e2
)
SELECT c.chapter, c.title,
       ((c.embedding <=> qemb.e1) + (c.embedding <=> qemb.e2)) AS sumdist
FROM chapters c, qemb
ORDER BY sumdist ASC
LIMIT 10;
```

| Rank | Chapter | Title | sum-dist |
|---|---|---|---|
| 1 | **87** | Vehicles other than railway… and parts & accessories thereof | 0.976 |
| 2 | **40** | Rubber and articles thereof | 1.023 |
| 3 | 39 | Plastics and articles thereof | 1.123 |
| 4 | 48 | Paper and paperboard | 1.153 |
| 5 | 63 | Other made-up textile articles | 1.157 |
| 6 | 86 | Railway / tramway locomotives | 1.160 |
| 7 | 44 | Wood and articles of wood | 1.171 |
| 8 | 81 | Other base metals | 1.178 |
| 9 | 93 | Arms and ammunition | 1.179 |
| 10 | 64 | Footwear | 1.180 |

Ch.87 edges Ch.40 here because the function anchor is strongly aligned with it. The dispatch prompt notes that *pure-vector retrieval put chapter 40 ahead (top-5 was 4012, 4011, 4003)* — that earlier observation came from a single-vector query embedding without the suspension-function anchor; the cascade behaviour you actually get in production depends on the exact Cohere embedding. The architecture survives either ordering because Stage 1's `candidate_chapters` already pins **{40, 87}**, and the cascade `UNION`s top-10 from 2.1 with `candidate_chapters` from Triage. So the heading stage will always see both 4016 and 8708.

### 2.2 Heading cosine within candidate_chapters ∪ top-10 chapters (limit 15)

```sql
WITH qemb AS (
  SELECT (SELECT embedding FROM tariff_lines WHERE code='4016.99.60') AS e1,
         (SELECT embedding FROM tariff_lines WHERE code='8708.80.00') AS e2
)
SELECT h.heading, h.chapter, h.title,
       ((h.embedding <=> qemb.e1) + (h.embedding <=> qemb.e2)) AS sumdist
FROM headings h, qemb
WHERE h.chapter IN ('40','87')
ORDER BY sumdist ASC
LIMIT 15;
```

Top results (Ch.40 ∪ Ch.87 only; rounded):

| Rank | Heading | Title (truncated) | sum-dist |
|---|---|---|---|
| 1 | **4016** | Other articles of vulcanised rubber other than hard rubber | 0.744 |
| 2 | **8708** | Parts and accessories of the motor vehicles of 87.01-87.05 | 0.822 |
| 3 | 4008 | Plates, sheets, strip, rods… of vulcanised rubber | 0.852 |
| 4 | 8707 | Bodies (incl. cabs) for motor vehicles 87.01-87.05 | 0.874 |
| 5 | 4009 | Tubes, pipes and hoses of vulcanised rubber | 0.885 |
| 6 | 4007 | Vulcanised rubber thread and cord | 0.890 |
| 7 | 4015 | Articles of apparel of vulcanised rubber | 0.890 |
| 8 | 8714 | Parts and accessories of vehicles of 87.11-87.13 | 0.893 |
| 9 | 8706 | Chassis fitted with engines | 0.909 |
| 10 | 4010 | Conveyor / transmission belts of vulcanised rubber | 0.911 |
| 11 | 8703 | Motor cars | 0.913 |
| 12 | 8716 | Trailers and semi-trailers | 0.933 |
| 13 | 8701 | Tractors | 0.934 |
| 14 | 4011 | New pneumatic tyres of rubber | 0.937 |
| 15 | 4006 | Other rubber forms and articles | 0.939 |

**4016 and 8708 are the top-2 headings.** Both go forward to the subheading stage.

### 2.3 Subheading cosine within top-15 headings (limit 20)

```sql
WITH qemb AS (
  SELECT (SELECT embedding FROM tariff_lines WHERE code='4016.99.60') AS e1,
         (SELECT embedding FROM tariff_lines WHERE code='8708.80.00') AS e2
)
SELECT s.subheading, s.heading, s.title,
       ((s.embedding <=> qemb.e1) + (s.embedding <=> qemb.e2)) AS sumdist
FROM subheadings s, qemb
WHERE s.heading IN ('4016','8708')
ORDER BY sumdist ASC
LIMIT 20;
```

Top results (rounded):

| Rank | Subheading | Title | sum-dist |
|---|---|---|---|
| 1 | **8708.80** | Suspension systems and parts thereof (including shock-absorbers) | 0.713 |
| 2 | **4016.99** | Other : -- Other | 0.732 |
| 3 | 4016.95 | Other : -- Other inflatable articles | 0.750 |
| 4 | 4016.91 | Floor coverings and mats | 0.773 |
| 5 | 4016.92 | Erasers | 0.780 |
| 6 | 8708.99 | Other parts and accessories : -- Other | 0.784 |
| 7 | 8708.29 | Other parts of bodies (cabs) | 0.807 |
| 8 | 4016.93 | Gaskets, washers and other seals | 0.808 |
| 9 | 8708.70 | Road wheels and parts thereof | 0.811 |
| 10 | 8708.10 | Bumpers and parts thereof | 0.813 |

The two leading subheadings are exactly the right "competing" pair: `8708.80` (function framing) and `4016.99` (material/form framing, where `4016.99.60 — Rubber bushes` lives).

### 2.4 Tariff_line cosine within top-20 subheadings ∪ heading-fallback (limit 40 union)

```sql
WITH qemb AS (
  SELECT (SELECT embedding FROM tariff_lines WHERE code='4016.99.60') AS e1,
         (SELECT embedding FROM tariff_lines WHERE code='8708.80.00') AS e2
)
SELECT t.code, t.description,
       ((t.embedding <=> qemb.e1) + (t.embedding <=> qemb.e2)) AS sumdist
FROM tariff_lines t, qemb
WHERE LEFT(t.code,4) IN ('4016','8708')
ORDER BY sumdist ASC
LIMIT 20;
```

| Rank | Code | Description | sum-dist |
|---|---|---|---|
| 1 | **4016.99.60** | **Rubber bushes** | 0.669 |
| 2 | **8708.80.00** | **Suspension systems and parts thereof (including shock-absorbers)** | 0.669 |
| 3 | 4016.99.50 | Rubber cushions | 0.722 |
| 4 | 4016.99.90 | Other | 0.726 |
| 5 | 4016.99.30 | Rubber threads | 0.754 |
| 6 | 4016.95.90 | Other | 0.755 |
| 7 | 8708.99.00 | Other parts and accessories : -- Other | 0.758 |
| 8 | 8708.10.90 | Other | 0.759 |
| 9 | 4016.99.20 | Rubber bands | 0.766 |
| 10 | 4016.99.80 | Stoppers | 0.768 |

`4016.99.60 — Rubber bushes` and `8708.80.00 — Suspension systems and parts thereof` are tied at top by sum-distance and both have one anchor at distance 0. This is the *correct* shape of the retrieval result for an inherently dual-character query.

### 2.f Parallel FTS leg

```sql
SELECT code, description
FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ to_tsquery('english','rubber | bushing | bush | suspension')
ORDER BY ts_rank(to_tsvector('english', description),
                 to_tsquery('english','bushing | bush | suspension | rubber')) DESC
LIMIT 30;
```

Top-5 FTS:

1. **4016.99.60** — Rubber bushes
2. 4002.31.00 — Isobutene-isoprene (butyl) rubber (IIR)…
3. 4002.39.00 — Other IIR/CIIR/BIIR
4. 4008.29.40 — Tread rubber and tread packing strip…
5. 4002.11.00 — Styrene-butadiene rubber (SBR): Latex

`8708.80.00` appears at rank 15. FTS strongly favours the literal-keyword match on "Rubber bushes" — exactly the lexical token in the query.

### 2.g Final retrieval candidate set → Rerank top-5

Union of the cosine cascade and FTS, fed to Cohere Rerank-4 Fast. Expected top-5 after rerank (the reranker has access to the natural-language query, so it scores **both** material match and function match):

1. `4016.99.60` — Rubber bushes
2. `8708.80.00` — Suspension systems and parts thereof
3. `4016.99.90` — Other (Ch.40 ‘other’)
4. `4016.99.50` — Rubber cushions
5. `8708.99.00` — Other parts and accessories : -- Other

**Filtered candidate set going into Stage 3:** `{4016.99.60, 8708.80.00, 4016.99.90, 4016.99.50, 8708.99.00}`.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate's chapter, query `chapter_exclusions` with the natural-language query expanded into a tsquery.

```sql
SELECT source_chapter, excluded_product_text,
       redirects_to_chapter, redirects_to_heading,
       source_note_number, source_note_text
FROM chapter_exclusions
WHERE source_chapter IN ('40','87')
  AND (
    to_tsvector('english', excluded_product_text) @@
      to_tsquery('english',
        'rubber & bushing | rubber & bush | suspension & rubber | vulcanised & rubber')
    OR excluded_product_text ILIKE '%rubber bushing%'
    OR excluded_product_text ILIKE '%vulcanised rubber%'
  );
```

Returned rules (only one is on-point):

> **source_chapter: 87**
> **excluded_product_text:** "Other articles of vulcanised rubber other than hard rubber (e.g., rubber hoses, rubber engine mounts, **rubber bushings of soft/unhardened rubber**)"
> **redirects_to_chapter:** 40
> **redirects_to_heading:** 4016
> **source_note_number:** Section Note 2(a)
> **source_note_text:** *"The expressions 'parts' and 'parts and accessories' do not apply to the following articles, whether or not they are identifiable as for the goods of this Section: (a) joints, washers or the like of any material (classified according to their constituent material or in heading 8484) or other articles of vulcanised rubber other than hard rubber (heading 4016), …"*

**Effect on candidate set:**

- `8708.80.00` → **DROPPED** by Ch.87 exclusion rule (Section XVII Note 2(a)). Redirects to heading 4016.
- `8708.99.00` → **DROPPED** by same rule (any soft-rubber vehicle "part" is excluded from 8708).
- `4016.99.60`, `4016.99.90`, `4016.99.50` → retained. No Ch.40 exclusion fires (Ch.40 Note 2 does not list vehicles).
- Redirect target `heading 4016` ∈ already-retained candidates → no additional re-retrieval needed.

**Filtered candidate set going into Stage 4:** `{4016.99.60, 4016.99.90, 4016.99.50}`.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

**Inputs to GPT-4o-Select:**

- Query: "rubber suspension bushings for trucks"
- Filtered candidate set: `{4016.99.60, 4016.99.90, 4016.99.50}`
- Injected notes:
  - **Section XVII Note 2(a)** (the rule that dropped 8708) — for awareness of why 8708 is unavailable.
  - **Chapter 40 Note 2** (full text of Ch.40 exclusions — to confirm none apply).
  - **GIR 1** (classification by heading text and section/chapter notes) and **GIR 3(a)** (most specific description prevails over more general) — both relevant here.
  - Heading 4016 title: "Other articles of vulcanised rubber other than hard rubber."
  - Subheading 4016.99 title: "Other : -- Other."
  - Tariff_line 4016.99.60 title: "Rubber bushes."

**Expected GPT-4o output:**

```json
{
  "selected_code": "4016.99.60",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "Section XVII Note 2(a) excludes 'other articles of vulcanised rubber other than hard rubber' from being 'parts and accessories' of Section XVII (Chapters 86-89). The query specifies soft rubber bushings (no 'hard rubber' qualifier), so the suspension framing under 8708 is closed off by the legal note.",
    "Within heading 4016 (the explicit redirect target), 4016.99 is the residual 'Other' subheading. Tariff line 4016.99.60 'Rubber bushes' is the most specific description matching the query (GIR 1; GIR 3(a) most-specific-description rule confirms it beats 4016.99.90 'Other' and 4016.99.50 'Rubber cushions').",
    "The 8-digit code 4016.99.60 is the unique Indian tariff line for rubber bushes; no further sub-disambiguation needed."
  ],
  "cited_notes": ["Section XVII Note 2(a)", "Chapter 40 Note 2 (confirmed non-applicable)", "GIR 1", "GIR 3(a)"],
  "alternatives_considered": [
    {"code": "4016.99.50 (Rubber cushions)", "reason_rejected": "A bushing is a sleeve/grommet bearing component, distinct from a cushion. Less specific match."},
    {"code": "4016.99.90 (Other)", "reason_rejected": "Residual; 4016.99.60 is the named tariff line for bushes — GIR 3(a) most-specific-description prevails over residual 'Other'."},
    {"code": "8708.80.00 (Suspension systems and parts thereof)", "reason_rejected": "Legally excluded by Section XVII Note 2(a) since the article is vulcanised soft rubber. Note: would only apply if the bushing were of hard rubber or were a composite part with a metal sleeve as essential character — neither is in the query."}
  ]
}
```

---

## Stage 5 — VERIFY (V1: rubber-stamp)

**Inputs:** query + `selected_code = 4016.99.60` + heading 4016 title + Section XVII Note 2(a) + Chapter 40 notes.

**Expected Gemini-Verify output:**

```json
{
  "agree": true,
  "disagree_reason": null,
  "comments": [
    "Section XVII Note 2(a) is unambiguous and is precisely on-point — it names 'heading 4016' as the destination for vulcanised rubber articles falsely framed as vehicle parts.",
    "4016.99.60 is the literal Indian tariff_line title 'Rubber bushes' — directly matches the form attribute of the query.",
    "If the user had specified 'hard rubber' or 'composite metal-rubber bushing where metal is essential', the verdict would shift. Query has neither qualifier; default (soft vulcanised) is correct."
  ]
}
```

Rubber-stamp agrees. No disagreement; no escalation triggered.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agreed; Q-budget not exhausted.

---

## Anomaly notes for the coordinator

1. **The dispatch's expected value (8708) is legally incorrect** under the actual ITC-HS schedule and the chapter_exclusions table in the project's own database. Section XVII Note 2(a) explicitly routes "other articles of vulcanised rubber other than hard rubber" to heading 4016, and the project's `chapter_exclusions` row id-for-this-rule (source_chapter=87 → redirects_to_heading=4016) is materially correct. The Indian schedule even has `4016.99.60 — Rubber bushes` as a named line. The "function-over-material trap" framing in the failure-class field is inverted — for *this specific commodity* (soft rubber bushings), the trap is the **other** way: a naive function-only LLM would wrongly pick 8708 and the rules-filter has to drag it back to 4016.
2. The pipeline as designed handles this case **correctly** — but the trace's "correctness" axis depends on which expected value the orchestrator uses. Under the dispatch's stated expected (8708), the pipeline produces `WRONG_CODE` (predicting 4016.99.60). Under the legally correct expected (4016.99.60), the pipeline produces `CORRECT_CODE`. I've recorded the verdict under the latter, with the caveat below in `data_dependency`.
3. If the orchestrator wants this case to specifically test the function-over-material trap as originally framed, a better query would be one that genuinely *is* a Section XVII vehicle part regardless of material composition — e.g., "rubber-and-steel composite engine mount with metal sleeve for truck" (where the metal sleeve gives essential character and Note 2(a)'s "other articles of vulcanised rubber" carve-out does not apply, so 8708.99 holds). The current query is the inverse trap.

---

```yaml
case_id: case-1
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "4016.99.60"
  expected: "tariff_line under heading 8708 (per dispatch) — but legally the correct expected is 4016.99.60 per Section XVII Note 2(a); see anomaly notes"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: "Dispatch case-1 expected value is legally incorrect for this query. Section XVII Note 2(a) (already captured in chapter_exclusions for source_chapter=87) routes soft-rubber bushings to heading 4016. Tariff_line 4016.99.60 'Rubber bushes' exists and is the unambiguous correct answer. The architecture handles this case directly via the rules-filter (Stage 3); no pipeline gap exists. Recommend the coordinator update case-1 expected to 4016.99.60 OR substitute a different query that genuinely tests the function-over-material trap (e.g., a composite metal-rubber engine mount where metal sleeve gives essential character)."
```

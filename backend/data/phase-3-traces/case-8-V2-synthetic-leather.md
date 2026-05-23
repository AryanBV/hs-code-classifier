# Case 8 — V2 — "synthetic leather imitation polyurethane sheet"

- **Case ID:** case-8
- **Variant:** V2 (Verify = independent retrieval)
- **Query:** `synthetic leather imitation polyurethane sheet`
- **Expected:** tariff_line in chapter 39 (NOT Ch.42)
- **Failure class:** chapter_exclusion explicit redirect

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

**Expected Triage JSON:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "polyurethane (PU plastic)",
    "form": "sheet",
    "function": "imitation/synthetic leather (substitute for natural leather)",
    "intended_use": "upholstery / apparel / footwear backing / general industrial use",
    "processing_state": "finished sheet form",
    "composition": "100% polyurethane polymer (no animal hide content implied; no textile backing specified)"
  },
  "candidate_chapters": ["39", "42", "59"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification:**

- The word "polyurethane" is a chemical identity term — it is a thermoplastic polymer, definitionally a "plastic" per Ch.39 Note 1 ("materials of headings 3901 to 3914 which are or have been capable… of being formed under external influence … by moulding, casting, extruding, rolling or other process into shapes which are retained on the removal of the external influence"). PU polymer is heading 3909 in primary form; PU **sheet** is heading 3920 (non-cellular) or 3921 (cellular).
- The marketing phrase "synthetic leather / imitation leather" is a functional descriptor — it tells you what the buyer USES the sheet AS, not what it IS materially. Ch.42 Note 1 defines "leather" narrowly: `chamois (including combination chamois) leather, patent leather, patent laminated leather and metallised leather` — all derivatives of real animal hide. Imitation/PU "leather" is NOT leather under this definition; it is plastic sheeting.
- Candidate set must include 42 (because the query string literally says "leather", an adversarial retrieval anchor that will pull Ch.42) and 59 (textile-backed imitation leather is Ch.5903 if backing is textile and the plastic doesn't fully embed/cover both sides — see Ch.59 Note 2). Ch.39 is the correct anchor because the query says **polyurethane sheet** without textile backing.
- No question is needed: the query is materially specific (PU sheet). Completeness ≈ 0.75. A more rigorous Triage might ask "is the sheet textile-backed?" to disambiguate Ch.39 vs Ch.5903 — see VERIFY-stage discussion.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

(Cosine embedding queries are simulated; real cosine output not run because the task brief says "assume the embedding exists for trace purposes". FTS, exclusion-FTS, and structural queries below WERE executed against the live DB.)

### 2.1 Chapter retrieval (simulated cosine top-10)

For a query mentioning "polyurethane" + "sheet" + "leather", chapter cosine returns would be approximately:

| rank | chapter | reasoning |
|---|---|---|
| 1 | 39 | "polyurethane" + "sheet" — direct corpus match for plates/sheets of plastic |
| 2 | 42 | "leather" — direct corpus match (false-positive anchor) |
| 3 | 59 | "impregnated, coated, covered or laminated textile fabrics with plastics" — semantically close |
| 4 | 41 | "leather" hide chapter — second false-positive anchor |
| 5 | 64 | "footwear" — synthetic-leather is footwear input material |
| 6 | 56 | "nonwovens, felt" — textile substitute material |
| 7 | 40 | "rubber" — alternative elastomer sheeting |
| 8 | 32 | "tanning extracts" — adjacent |
| 9 | 43 | "furskin" — adjacent leather/fur |
| 10 | 54 | "man-made filaments" — adjacent |

### 2.2 Heading retrieval (cascade, within candidate_chapters ∪ top-10)

`SELECT heading, title FROM headings WHERE chapter IN ('39','42','59','41') ORDER BY embedding <=> $q LIMIT 15` — simulated rank:

1. **3921** — "Other plates, sheets, film, foil and strip, of plastics." ← direct
2. **3920** — "Other plates, sheets, film, foil and strip, of plastics, non-cellular and not reinforced…"
3. **5903** — "Textile fabrics impregnated, coated, covered or laminated with plastics…"
4. **4115** — "Composition leather with a basis of leather or leather fibre, in slabs, sheets or strip…"
5. **4107** — "Leather further prepared after tanning or crusting…"
6. **3909** — "Amino-resins, phenolic resins and **polyurethanes**, in primary forms." (false-positive: primary forms, not sheet)
7. **3926** — "Other articles of plastics and articles of other materials of headings 39.01 to 39.14."
8. **4205** — "Other articles of leather or of composition leather."
9. **4202** — luggage/bags (false anchor: 4202 articles often MADE from synthetic leather)
10. **4114** — "Chamois … patent leather; patent laminated leather; metallised leather" (the Ch.42 leather-definition heading)
11. **5907** — "Textile fabrics otherwise impregnated, coated or covered…"
12. **6406** — footwear parts incl. uppers of synthetic materials
13. **3924** — household plastics
14. **3919** — self-adhesive plastic sheets
15. **3917** — plastic tubes

### 2.3 Subheading retrieval (cascade, within top-15 headings)

Actual structural data fetched from the DB:

```sql
SELECT subheading, title FROM subheadings
WHERE heading IN ('3920','3921')
  AND (title ILIKE '%polyurethane%' OR title ILIKE '%urethane%' OR title ILIKE '%cellular%' OR title ILIKE '%other%')
ORDER BY subheading;
```

Key rows (full result has 18 subheadings, condensed here):

| subheading | title |
|---|---|
| 3920.99 | Of other plastics : -- Of other plastics |
| **3921.13** | **Cellular : -- Of polyurethanes** ← named PU subheading |
| 3921.19 | Cellular : -- Of other plastics |
| 3921.90 | Other |
| 4115.10 (not run, but exists) | Composition leather (leather-basis) |
| 5903.10 / .20 / .90 (PVC / PU / Other) | Textile-fabric-laminated with plastics |

Simulated subheading cosine top-20 would surface **3921.13** at rank 1 (literal "polyurethane" + "cellular" matches "imitation leather" foam-backed product) followed by **3920.99** (non-cellular other), **5903.20** (textile fabric with PU coating), **3921.90**, **3921.19**.

### 2.4 Tariff-line retrieval (cascade UNION)

```sql
SELECT code, description FROM tariff_lines WHERE subheading IN ('3921.13', '3921.90', '3920.99') ORDER BY code;
```

Returned 43 rows. Top candidates for synthetic-leather PU sheet:

| code | description |
|---|---|
| **3921.13.10** | **Flexible** ← cellular PU sheet, flexible (most likely synthetic-leather form) |
| 3921.13.90 | Other (cellular PU, non-flexible) |
| 3920.99.91 | Other: ---- Rigid, plain (non-cellular other plastics) |
| 3920.99.92 | Other: ---- Flexible, plain |
| 3920.99.99 | Other: ---- Other |
| 3921.90.99 | Other: ---- Other |

### 2.5 Postgres FTS leg (parallel, non-cascading) — ACTUALLY EXECUTED

Query 1 (exact phrase):
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'synthetic leather imitation polyurethane sheet')
LIMIT 30;
```
→ **empty result** (no tariff_line description contains all those tokens).

Query 2 ("polyurethane sheet"):
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'polyurethane sheet')
LIMIT 20;
```
→ 3 rows, ALL under 3926 (NOT under 3920/3921):
| code | description |
|---|---|
| 3926.40.51 | Decorative sheets: ---- Of polyurethane foam |
| 3926.90.31 | Lasts, with or without steel hinges; EVA and grape sheets for soles and heels; welts: ---- Of polyurethane foam |
| 3926.90.51 | Retroreflective sheeting of other than of heading 3920: ---- Of polyurethane foam |

Query 3 ("synthetic leather"):
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'synthetic leather')
LIMIT 20;
```
→ 2 rows, both footwear:
| code | description |
|---|---|
| 6403.91.20 | Leather footwear with plastic and synthetic sole |
| 6403.99.20 | Leather sandals with plastic or synthetic sole |

**Critical FTS anomaly:** The literal phrase "polyurethane sheet" only surfaces 3926 (articles of plastic) tariff lines, NOT 3921.13 (cellular PU plates/sheets/strip). That is because subheading 3921.13's tariff_lines `3921.13.10` and `.90` have descriptions "Flexible" / "Other" — pure subheading-relative descriptors with no PU keyword in the tariff_line description itself. The PU keyword lives in the SUBHEADING title, not the tariff_line description. This is the **454 empty-title problem** the architecture spec calls out — FTS at tariff_line level alone fails here; cascade-by-subheading-membership saves it.

### 2.6 Final candidate set → Rerank top-5

Union of cosine cascade + FTS:
1. **3921.13.10** — Flexible cellular PU (from cascade)
2. 3921.13.90 — Other cellular PU
3. 3920.99.92 — Flexible non-cellular other plastics
4. 5903.20.xx — Textile fabrics impregnated/coated with PU (from cosine)
5. 3926.40.51 — Decorative sheets, PU foam (from FTS)

Plus likely cross-contaminants from Ch.42 (4115.10 composition leather, 4202.x, 4205) that the LLM Select must reject in Stage 4.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Executed against live DB:

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '42'
  AND to_tsvector('english', excluded_product_text) @@ websearch_to_tsquery('english', 'synthetic leather imitation polyurethane sheet');
```
→ **empty result**. No exclusion rule for Ch.42 matches this query's FTS.

Broader probe:
```sql
SELECT * FROM chapter_exclusions
WHERE excluded_product_text ILIKE '%imitation leather%'
   OR excluded_product_text ILIKE '%synthetic leather%'
   OR excluded_product_text ILIKE '%composition leather%'
   OR excluded_product_text ILIKE '%artificial leather%'
ORDER BY source_chapter;
```
→ 2 rows, BOTH going TO Ch.42 (from Ch.84 and Ch.90 — "articles of leather or of composition leather"). **None going FROM Ch.42 → Ch.39.**

Probe for all Ch.42 exclusions:
```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text
FROM chapter_exclusions WHERE source_chapter = '42' ORDER BY id;
```
→ 15 rows. They cover catgut → 3006, fur → 4303, netting → 5608, footwear → 64, headgear → 65, riding whips → 6602, imitation jewellery → 7117, harness fittings → XV, musical strings → 9209, furniture → 94, toys → 95, buttons → 9606, plastic bags → 3923, plaiting → 4602, precious-metal-essential → 71, watch straps → 9113.

**The exclusion rule "imitation/synthetic/artificial leather of plastic → Ch.39 (3920/3921)" DOES NOT EXIST in the `chapter_exclusions` table.** This is a structural data gap.

What DOES exist that supports the redirect (but lives in different storage):
- **Ch.42 Note 1 (in `chapters.notes` JSONB):** "the term 'leather' includes chamois (including combination chamois) leather, patent leather, patent laminated leather and metallised leather." → a positive definition that implicitly excludes imitation/PU leather, but is **not** parsed as an FTS-indexed exclusion row.
- **Ch.39 Note 10 (in `chapters.notes` JSONB):** "In headings 3920 and 3921, the expression 'plates, sheets, film foil and strip' applies only to plates, sheets, film, foil and strip (other than those of Chapter 54) and to blocks of regular geometric shape…" → confirms PU sheet → 3920/3921.
- **Ch.59 Note 2(a)(3):** "products in which the textile fabric is either completely embedded in plastics or entirely coated or covered on both sides with such material → Chapter 39" → resolves the Ch.39-vs-Ch.5903 boundary in favour of Ch.39 when there's no textile backing or when the plastic dominates.

**Programmatic rules filter outcome:** Candidate set UNCHANGED. Ch.42 candidates (4115, 4202, 4205) are NOT dropped by the programmatic rules layer. They would only be dropped by the LLM Select reading Ch.42 Note 1 prose.

**This case exposes a gap-class = RULES_GAP.** The failure_class is "chapter_exclusion explicit redirect" — but the explicit redirect row does not exist. The chapter-notes-extraction pass that built `chapter_exclusions` from JSONB notes captured the "Ch.42 does NOT cover X (→ Y)" entries from Note 2's enumerated list, but missed the **definition-by-restriction** in Note 1 (defining what "leather" includes implies what it excludes, but is not written as a "does not cover" sentence).

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

**Input to GPT-4o:**
- Filtered candidates (unchanged from Stage 2.6): {3921.13.10, 3921.13.90, 3920.99.92, 3920.99.99, 5903.20.xx, 3926.40.51, plus Ch.42 contaminants 4115.x, 4202.x, 4205.x}.
- Chapter notes JSONB for Ch.39, Ch.42, Ch.59, Ch.41 (injected as `cited_notes`).
- GIR 1 (heading texts and relative section/chapter notes are determinative) and GIR 3(b) (essential character for composite goods).

**Predicted GPT-4o output:**

```json
{
  "selected_code": "3921.13.10",
  "reasoning_chain": [
    "Per Ch.42 Note 1, the term 'leather' includes only chamois, patent, patent-laminated, and metallised leather — all real-hide derivatives. 'Imitation/synthetic leather' of polyurethane has no animal-hide content and is NOT 'leather' for Schedule purposes. Ch.42 candidates (4115/4202/4205) are rejected.",
    "Per Ch.39 Note 1, polyurethane is a plastic (heading 3909 in primary form; 3920/3921 in sheet form per Note 10).",
    "Per Ch.39 Note 10, 'plates, sheets, film, foil and strip' of heading 3920 and 3921 applies to flat product of plastics, of regular geometric shape — directly matches 'PU sheet'.",
    "Synthetic-leather PU sheets are characteristically cellular/foamed (microporous structure giving the soft hand-feel). GIR 3(a) — most specific heading — favours 3921 (cellular) subheading 3921.13 'Of polyurethanes' over 3920.99 'Of other plastics' (non-cellular catch-all). Tariff-line 3921.13.10 'Flexible' fits 'sheet' for imitation leather applications.",
    "Ch.59 Note 2(a)(3) is invoked defensively: even if a textile backing exists, if the plastic completely covers both sides (typical for PU synthetic leather) → Ch.39 not Ch.59."
  ],
  "cited_notes": [
    "Ch.42 Note 1 (positive definition of 'leather')",
    "Ch.39 Note 1 (definition of 'plastics')",
    "Ch.39 Note 10 (definition of 'plates, sheets … of headings 3920/3921')",
    "Ch.59 Note 2(a)(3) (textile-plastic boundary, defaulting to Ch.39)",
    "GIR 1 + GIR 3(a)"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [
    "4115.10 (composition leather, sheet) — REJECTED: Ch.41 Note 1 / heading 4115 requires 'basis of leather or leather fibre'; pure PU has none.",
    "3920.99.92 (non-cellular other plastics, flexible) — REJECTED in favour of 3921.13 because synthetic leather is typically cellular/foam-structured, and 3921.13 is more specific (named PU subheading) per GIR 3(a). Would be ACCEPTED if the sheet were explicitly non-cellular solid PU.",
    "5903.20 (textile fabric coated/laminated with PU) — REJECTED: query specifies 'polyurethane sheet', no textile backing mentioned; defaults to Ch.39 per Ch.59 Note 2(a)(3).",
    "3926.40.51 (decorative sheets of PU foam) — REJECTED: 3926 is 'other articles' catch-all and 3921.13 is more specific per GIR 3(a). 3926.40.51 would apply to finished decorative-use cut articles, not piece-goods sheet."
  ]
}
```

**Confidence is MEDIUM (not HIGH) because:**
- The programmatic rules layer offered ZERO support — no exclusion row dropped Ch.42 candidates. The LLM had to do the entire Ch.42-rejection inference from prose Note 1 alone.
- Cellular vs non-cellular (3921 vs 3920) is not stated in the query — the LLM is inferring "synthetic leather is typically cellular" from world knowledge, not from query text.
- The tariff-line distinction 3921.13.10 ("Flexible") vs 3921.13.90 ("Other") rests on an inferred "flexible" attribute not present in the query.

---

## Stage 5 — VERIFY (V2: independent retrieval, Gemini-Select rerun)

Gemini-Select rerun (independent retrieval + reasoning) on the same query.

**Independent retrieval trace (Gemini-Select):**
- Stage 1 — extracts {material:"polyurethane plastic", form:"sheet", function:"leather substitute"}, candidate_chapters=["39","42","59"]
- Stage 2 — cosine + FTS surface same candidate set; Gemini reranker likely puts 3921.13.10 at rank 1 by lexical alignment with "polyurethane".
- Stage 3 — same empty result from rules filter.
- Stage 4 — Gemini-Select reads Ch.42 Note 1 prose; with reasonable LLM prose-comprehension it correctly rejects "leather" interpretation and picks Ch.39 sheet.

**Independent pick (Gemini-Select):**

```json
{
  "independent_pick": "3921.13.10",
  "agrees_with_select": true,
  "difference_reason": null
}
```

**Possible divergence (residual risk):** A weaker reranker could surface 3920.99.92 (non-cellular flexible other-plastics) instead of 3921.13.10, because the query does not say "cellular" or "foam". Both are in Ch.39, so the **chapter-level outcome is robust** even if subheading-level diverges. V2 still agrees with V1 at chapter and heading granularity (39/3921); the only contestable axis is cellular-vs-non-cellular subheading.

**Verify result:** AGREE (at chapter+heading), MEDIUM_AGREE (at subheading/tariff_line).

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agrees with Select at the chapter+heading level. Q-budget is not exhausted (no clarifying question asked). Pipeline exits NORMAL.

A reasonable architecture-level improvement: if Select self_confidence is MEDIUM AND the chosen subheading is one of two plausible siblings (3921.13 vs 3920.99 both in same chapter), the Triage agent could have raised a one-shot clarifying question "Is the PU sheet cellular/foam-structured or solid/non-cellular?" pre-emptively. This would lift subheading confidence to HIGH at the cost of one extra round-trip.

---

## Summary of architecture findings exposed by this case

1. **RULES_GAP — the chapter_exclusions table is missing the "imitation/synthetic leather → Ch.39" redirect.** The extraction logic that populated `chapter_exclusions` from JSONB notes captured "does not cover X" enumerated lists (Note 2) but NOT positive definitions that imply exclusions (Note 1 "leather includes only X, Y, Z"). Other chapters with similar positive-definition patterns (e.g. Ch.39 Note 1 defining "plastics" — which implies anything not polymerisable is excluded) may have the same gap.
2. **454 empty-title subheading risk realised.** Tariff lines under 3921.13 are described as "Flexible" / "Other" only. FTS on tariff_lines for "polyurethane sheet" returns ZERO matches in 3921.13. The cascade-by-subheading-membership retrieval is what saves this case; without that cascade the FTS leg alone would route to 3926.x (where PU appears in the tariff_line description itself) — a less-specific catch-all.
3. **The pipeline still gets the right answer (Ch.39 / 3921.13.10) via LLM Select reading Ch.42 Note 1 prose.** Confidence is MEDIUM rather than HIGH because the programmatic rules layer did not corroborate. This is the architectural difference between "LUCKY" and "DIRECT": the answer is right and the reasoning is sound, but a redundancy that should have fired did not, leaving the pipeline reliant on a single LLM-reasoning bottleneck.

---

```yaml
case_id: case-8
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "3921.13.10"
  expected: "tariff_line in chapter 39 (not Ch.42)"
path_quality: NEAR_MISS
  # Right chapter (39) and right heading (3921), but the subheading 3921.13 (cellular)
  # vs 3920.99 (non-cellular) hinges on an INFERRED "synthetic leather is cellular"
  # attribute not present in the query. Tariff-line 3921.13.10 ("Flexible") rests on a
  # second inferred attribute. Chapter-level outcome is robust; subheading-level is fragile.
cost_class: NORMAL
  # Full pipeline once; Verify agrees; no escalation. No multi-Q (though arguably ONE
  # clarifying question on cellular-vs-solid would have been worthwhile).
confidence_signal: MEDIUM
  # Select MEDIUM (rules layer gave no corroboration; Ch.42 rejection rests on LLM
  # reading Note 1 prose alone). Verify AGREES at chapter+heading, only weakly agrees
  # at subheading. Architecture does NOT cleanly know it's right at the 8-digit level.
gap_class: RULES_GAP
gap_description: >
  The chapter_exclusions table lacks the "Ch.42 does not cover imitation/synthetic/
  artificial leather of plastic (→ Ch.39, headings 3920/3921)" redirect. Ch.42 Note 1
  defines 'leather' positively ('includes chamois, patent, patent-laminated, metallised
  leather') which implies exclusion of plastic-based 'leather', but the extraction pass
  that populated chapter_exclusions only captured Note 2's enumerated 'does not cover'
  list, not Note 1's positive-definition implications. Smallest fix: add a second
  extraction pass that converts positive 'this chapter/heading covers ONLY X' or
  'the term Y includes A, B, C' notes into chapter_exclusion rows for materials NOT
  in the inclusion set (e.g. PU/PVC/textile/paper-based 'leather' → redirect to 3920/3921
  for plastic, 5903 for textile-backed, 4811 for paper-backed). At minimum, hand-author
  ~6 high-value redirect rows for the well-known false-anchor traps (Ch.42 leather,
  Ch.71 jewellery, Ch.85 electronics, Ch.90 instruments) where the LLM rejection of
  the false anchor is the entire confidence bottleneck.
data_dependency: >
  Tariff-line descriptions under 3921.13 are reduced to "Flexible" / "Other" — pure
  subheading-relative descriptors with no "polyurethane" keyword. FTS at tariff_line
  level alone returns zero hits for "polyurethane sheet" in 3921.13 (instead routes to
  3926.x where "polyurethane foam" is in the description text). Cascade-by-subheading-
  membership retrieval is REQUIRED for this case; the architectural choice to UNION
  filter-by-subheading-membership with filter-by-heading-membership is what makes 3921.13
  reachable at all. Without the cascade, the pipeline would silently route to 3926.40.51
  ("Decorative sheets of polyurethane foam") — still Ch.39, but a less-specific heading.
```

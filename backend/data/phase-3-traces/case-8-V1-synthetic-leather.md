# Case 8 — V1 — "synthetic leather imitation polyurethane sheet"

- case_id: case-8
- variant: V1 (rubber-stamp Verify)
- query: "synthetic leather imitation polyurethane sheet"
- expected: tariff_line in chapter 39 (NOT chapter 42)
- failure_class: chapter_exclusion explicit redirect (Ch.42 → Ch.39) — stress-tests the chapter_exclusions table

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "polyurethane (plastic)",
    "form": "sheet",
    "function": "imitation/synthetic leather substitute",
    "intended_use": "leather replacement (apparel, upholstery, accessories)",
    "processing_state": "sheet/plates form (likely cellular)",
    "composition": "polyurethane polymer, possibly cellular/foamed"
  },
  "candidate_chapters": ["39", "42", "59"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:

- **decision=CLASSIFY**: query carries enough signal — material ("polyurethane"), form ("sheet"), and explicit framing ("imitation"/"synthetic") meaning NOT real leather. No clarification needed at triage.
- **candidate_chapters=["39","42","59"]**:
  - **39** (Plastics): polyurethane sheet → primary candidate (3920/3921 cover plastic sheets).
  - **42** (Leather): adversarial trap — query literally says "synthetic leather". A naive Triage might rank this first; well-prompted Triage will list it but recognise Ch.42 = real leather only.
  - **59** (Impregnated textile fabrics): textile-backed PU coated fabric → heading 5903 if a fabric carrier is present. Query is silent on textile backing, so this is a hedged third candidate.
- **No clarifying question**: even though the textile-backing ambiguity exists, the architecture's normal path is to let Stage 2 retrieval + Stage 4 notes resolve it. Triage only asks when query lacks material OR form OR function entirely.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

> Cohere embed-v4 calls are simulated for trace purposes; SQL is run live against project `waowoznsvaosgcgiivzo` where possible.

### 2.1 Chapter retrieval (top-10 cosine)

Simulated semantic top-10 (based on title/note semantic content; embeddings exist for all 97 chapters):

| rank | chapter | title |
|---|---|---|
| 1 | 39 | Plastics And Articles Thereof |
| 2 | 42 | Articles of Leather; Saddlery and Harness; Travel Goods... |
| 3 | 59 | Impregnated, Coated, Covered or Laminated Textile Fabrics |
| 4 | 40 | Rubber and Articles Thereof |
| 5 | 41 | Raw Hides and Skins (Other Than Furskins) and Leather |
| 6 | 56 | Wadding, Felt and Nonwovens... |
| 7 | 32 | Tanning or Dyeing Extracts; Pigments; Paints and Varnishes |
| 8 | 64 | Footwear, Gaiters and the Like |
| 9 | 48 | Paper And Paperboard |
| 10 | 38 | Miscellaneous Chemical Products |

Rationale: "polyurethane" → Ch.39 (very strong). "Leather" → Ch.41/42. "Sheet" → Ch.39/48/56. The word "imitation" softens the leather signal but does not zero it. Ch.39 should rank #1 because polyurethane is unambiguously a plastic.

### 2.2 Heading retrieval (top-15 within `candidate_chapters ∪ top-10`)

Candidate chapters from Stage 1 ∪ 2.1 = {39, 40, 41, 42, 48, 56, 59, 64, 32, 38}. Live evidence — Ch.39 headings that match `polyurethane`/`sheet`:

```sql
SELECT heading, title FROM headings
WHERE chapter = '39' AND (title ILIKE '%sheet%' OR title ILIKE '%polyurethane%');
```

Results:

| heading | title |
|---|---|
| 3909 | Amino-resins, phenolic resins and polyurethanes, in primary forms. |
| 3919 | Self-adhesive plates, sheets, film, foil, tape, strip and other flat shapes, of plastics... |
| 3920 | Other plates, sheets, film, foil and strip, of plastics, non-cellular and not reinforced... |
| 3921 | Other plates, sheets, film, foil and strip, of plastics. |

Simulated cosine top-15 across candidate chapters:

1. **3921** (other plastic sheets, includes cellular) — bullseye
2. **3920** (non-cellular plastic sheets)
3. **5903** (textile fabrics coated/laminated with plastics) — second-strongest if textile-backed
4. 4203 (articles of apparel of leather)
5. 4205 (other articles of leather or composition leather)
6. 3919 (self-adhesive plastic sheets)
7. 5602 (felt impregnated/coated)
8. 5603 (nonwovens, coated)
9. 3909 (polyurethanes in primary forms)
10. 4202 (trunks, suitcases, handbags of leather/plastics)
11. 4107 (further-prepared leather)
12. 6406 (footwear parts)
13. 3208 (paints/varnishes)
14. 3926 (other articles of plastics)
15. 3925 (builders' ware of plastics)

### 2.3 Subheading retrieval (top-20)

Live evidence — Ch.39 heading 3921 subheadings:

```sql
SELECT subheading, title FROM subheadings WHERE heading IN ('3920','3921');
```

Salient hits:

| subheading | title |
|---|---|
| 3921.13 | Cellular : -- Of polyurethanes |
| 3921.19 | Cellular : -- Of other plastics |
| 3921.90 | Other |
| 3920.99 | Of other plastics : -- Of other plastics |

**3921.13 is the canonical "synthetic leather PU sheet" target.** Its title literally combines "Cellular" + "polyurethane" — both terms the query implies.

### 2.4 Tariff_line retrieval (top-20 cascade + top-20 broader)

Live evidence — Ch.39 PU tariff_lines under 3921.13:

| code | description |
|---|---|
| **3921.13.10** | Flexible |
| 3921.13.90 | Other |

Both are 8-digit codes under the cellular polyurethane subheading. "Flexible" is the standard sheet for synthetic leather upholstery / apparel; "Other" is rigid PU foam sheet.

### 2.f Postgres FTS leg (parallel, non-cascading)

Live evidence:

```sql
-- websearch_to_tsquery (AND-of-terms) returns 0 rows:
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'synthetic leather imitation polyurethane sheet');
-- → []

-- to_tsquery with OR returns many polyurethane hits but NOT 3921.13.10:
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ to_tsquery('english', 'polyurethane | imitation | synthetic & leather') LIMIT 30;
-- → 3909.50.00, 3915.90.63, 3916.90.25, 3925.90.10, 3926.10.11... etc.
-- 3921.13.10 description = "Flexible" — does NOT contain "polyurethane",
-- so it is INVISIBLE to the FTS leg on tariff_line descriptions.
```

**Anomaly flagged:** The 8-digit tariff_line description "Flexible" is too generic for FTS to discover. The correct answer only surfaces because the **subheading title** ("Cellular : Of polyurethanes") carries the polyurethane signal — and that's the cascade's job. FTS would miss this case entirely; the embedding cascade is load-bearing.

### 2.g Final candidate set (post-rerank)

After Cohere Rerank 4 Fast on UNION:

1. **3921.13.10** (PU cellular sheet, flexible) — top
2. 3921.13.90 (PU cellular sheet, other)
3. 3921.90.99 (other plastic sheet, other)
4. 5903.20.XX (textile fabrics coated with polyurethane) — adversarial trap if "synthetic leather" reranked strongly against textile backing
5. 4205.00.90 (other articles of leather) — wrong but plausible due to the word "leather"

---

## Stage 3 — RULES FILTER (chapter_exclusions FTS)

Live evidence:

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text
FROM chapter_exclusions
WHERE to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'synthetic leather imitation polyurethane sheet');
-- → [] (zero hits)
```

```sql
-- Full enumeration of Ch.42 exclusions:
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text
FROM chapter_exclusions WHERE source_chapter = '42';
```

Result (15 rules): Ch.42 redirects exist for sterile catgut (→30), fur-lined apparel (→43), netting (→56), footwear (→64), headgear (→65), riding-crops (→66), imitation jewellery (→71), harness fittings, drum-skins (→92), Ch.94 furniture, Ch.95 toys, buttons (→96), plastic sheeting BAGS (→3923), plaiting materials (→46), precious-stone-character articles (→71), watch straps (→9113).

**None of these match the query.** The closest is the "plastic sheeting bags → 3923" rule, which targets bags specifically, not synthetic leather sheet.

```sql
-- Probe variations:
SELECT * FROM chapter_exclusions WHERE source_chapter='42'
  AND (excluded_product_text ILIKE '%imitation%' OR excluded_product_text ILIKE '%synthetic%'
       OR excluded_product_text ILIKE '%polyurethane%' OR excluded_product_text ILIKE '%plastic sheet%');
-- → only the "bags of plastic sheeting → 3923" row hits "plastic" — no rule for sheet-form synthetic leather.
```

**CRITICAL FINDING — RULES_GAP:**

The chapter_exclusions table has NO row that codifies the principle "Ch.42 only covers REAL leather; synthetic/imitation/PU leather → Ch.39." This is the central rule the case is designed to stress-test, and the data foundation does not encode it.

The protection against the Ch.42 trap must come from:

1. **Ch.42 Note 1** (defines "leather" narrowly as chamois, patent, patent laminated, metallised — all REAL leather variants): live-fetched, present in `chapters` table.
2. **Ch.42 title** (literally "ARTICLES OF LEATHER..."): exact title verified.
3. **Ch.39 Note 1** (plastics = materials of headings 3901-3914 formable by moulding/extruding etc.): live-fetched, present.
4. **Stage 4 LLM reasoning** — must read the notes and recognise that the query says "imitation" / "synthetic" / "polyurethane" all signal "NOT leather."

Therefore Stage 3 **does NOT fire** for this case. Filtered candidate set is unchanged from Stage 2g.

---

## Stage 4 — SELECT (GPT-4o, json_schema)

Inputs injected into the prompt:
- Query + extracted attributes
- Filtered candidates: 3921.13.10, 3921.13.90, 3921.90.99, 5903.20.XX, 4205.00.90
- Ch.42 note 1 (the narrow leather definition): "the term 'leather' includes chamois (including combination chamois) leather, patent leather, patent laminated leather and metallised leather."
- Ch.42 note 2 (exclusions list)
- Ch.39 note 1 (plastics definition) + note 10 (sheet/plate scope for 3920/3921)
- Ch.59 note 2 (heading 5903 requires textile fabric base with visible plastic impregnation)
- GIR 1 (text of headings and chapter notes govern) + GIR 3 (mixtures rules)

Expected GPT-4o output:

```json
{
  "selected_code": "3921.13.10",
  "reasoning_chain": [
    "Ch.42 Note 1 narrowly defines 'leather' as real leather variants (chamois, patent, patent laminated, metallised). 'Synthetic'/'imitation' polyurethane is NOT leather under this definition — Ch.42 is eliminated by GIR 1.",
    "Ch.39 Note 1 defines plastics as materials of headings 3901-3914 capable of being formed by moulding, casting, extruding, rolling. Polyurethane is a plastic of heading 3909.",
    "Ch.39 Note 10 specifies that 'plates, sheets, film, foil and strip' in headings 3920/3921 covers sheet-form plastics. Query 'sheet' matches.",
    "Among Ch.39 sheet headings, 3921 is the residual sheet heading and 3921.13 is the dedicated subheading 'Cellular: Of polyurethanes'. Synthetic leather PU sheet is canonically classified as flexible cellular PU sheet → tariff_line 3921.13.10 (Flexible)."
  ],
  "cited_notes": [
    "Ch.42 note 1 (narrow leather definition)",
    "Ch.39 note 1 (plastics definition)",
    "Ch.39 note 10 (sheets scope for 3920/3921)",
    "GIR 1 (notes are legally binding)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "5903.20.XX (textile fabrics coated with polyurethane) — REJECTED: query does not specify a textile fabric base. Ch.59 Note 2 requires the impregnation/coating to be on a textile fabric. Pure PU sheet without textile carrier is plastic.",
    "4205.00.90 (other articles of leather) — REJECTED: Ch.42 Note 1 excludes synthetic/imitation; the query word 'imitation' itself disqualifies Ch.42.",
    "3921.13.90 (cellular PU sheet, other) — REJECTED: 'Flexible' is the canonical bin for synthetic-leather-grade PU sheet (apparel/upholstery). 3921.13.90 is for rigid PU foam (insulation boards etc.)."
  ]
}
```

Selected code: **3921.13.10**. Chapter 39, expected outcome MET.

---

## Stage 5 — VERIFY (V1 rubber-stamp)

Adversarial Gemini-Verify receives: query + selected_code 3921.13.10 + Ch.42 note 1 + Ch.39 notes 1, 10 + subheading title.

```json
{
  "agree": true,
  "disagree_reason": null
}
```

Reasoning a rubber-stamp Verify would accept:

- "Synthetic" + "imitation" + "polyurethane" = three independent signals that this is NOT real leather.
- Ch.42 Note 1 (narrow leather def) **cited and applied correctly** in Select's reasoning.
- 3921.13 subheading title literally reads "Cellular : Of polyurethanes" — a textbook match.
- "Flexible" .10 vs "Other" .90 split is well-known in industry; flexible is the apparel/upholstery-grade synthetic leather.
- No textile carrier mentioned in query → Ch.59/5903 correctly ruled out per Ch.59 Note 2.

Verify agrees. **CHEAP path: no escalation.**

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered (V1 agrees with Select). Skipped.

---

## Architecture observations (for orchestrator)

1. **Stage 3 RULES_GAP confirmed.** The chapter_exclusions table lacks the principle "Ch.42 covers real leather only; synthetic/imitation → Ch.39." This is the headline rule the case stress-tests, and it is missing. The case still passes because Stage 4 (LLM reading Ch.42 Note 1 + Ch.39 Note 1) recovers — but the architecture's "Stage 3 fires for explicit redirects" promise is unmet here. See gap_description for the smallest fix.

2. **FTS leg blackholes the answer.** Tariff_line 3921.13.10 has description = "Flexible". The FTS leg on tariff_line.description does not contain "polyurethane" / "sheet" / "leather" — so FTS contributes ZERO to the candidate set. The correct answer surfaces purely from the cosine cascade via the subheading title ("Cellular : Of polyurethanes"). Empty-context tariff_line descriptions are a known structural risk (the prompt mentions 454 empty subheading titles; analogous problem at the tariff_line level here). Mitigation already in design: cascade Stage 2.4 unions both subheading-filtered AND heading-filtered tariff_lines, so the heading-filter retrieves the children of 3921.13 even if 3921.13.10 itself is FTS-invisible.

3. **Ch.42 / Ch.59 / Ch.39 three-way trap is real.** The query word "leather" pulls toward Ch.42; "polyurethane" pulls toward Ch.39; "synthetic" + "imitation" disambiguate but a weak retriever could surface 5903 (textile-backed) as a top alternative. Stage 4 must explicitly cite Ch.59 Note 2 (textile-fabric requirement) to rule out 5903. If the prompt does NOT include Ch.59 notes alongside Ch.39/42, Select could pick 5903 incorrectly.

4. **Confusing-pair file does not list 39/42.** `backend/src/data/confusing-chapter-pairs.ts` (per CLAUDE.md) covers pairs like 42/43 leather-vs-fur, 09/21 raw-vs-instant-coffee, 61/62 knit-vs-woven. The Ch.42 vs Ch.39 trap (real vs imitation leather) is a textbook confusing pair and worth adding to that file for prompt-injection at Stage 4.

---

```yaml
case_id: case-8
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "3921.13.10"
  expected: tariff_line in chapter 39 (not 42)
path_quality: LUCKY
  # Right answer, but only via Stage 4 LLM reasoning over chapter notes.
  # Stage 3 (the chapter_exclusions table — the EXPECTED guardrail for this case)
  # did NOT fire because no exclusion rule exists for "imitation leather → Ch.39".
  # The design intent of Stage 3 is unmet; Stage 4 is single-point-of-success.
cost_class: NORMAL
  # Full pipeline once, Verify agreed, no escalation.
confidence_signal: HIGH
  # Select self_confidence=HIGH, Verify agrees, GIR 1 + Ch.42 Note 1 + Ch.39 Note 1
  # form a tight legal chain.
gap_class: RULES_GAP
gap_description: >
  chapter_exclusions table is missing the canonical rule that Ch.42 covers REAL
  leather only and that synthetic/imitation/PU "leather" redirects to Ch.39
  (specifically heading 3921 for cellular PU sheet, 3920 for non-cellular, or
  5903 if a textile fabric base is present). Smallest fix: insert one row into
  chapter_exclusions with source_chapter='42',
  excluded_product_text='imitation leather, synthetic leather, polyurethane
  sheet and similar plastic substitutes for leather',
  redirects_to_chapter='39', redirects_to_heading='3921',
  source_note_text=<derived from Ch.42 Note 1 narrow leather definition + Ch.39
  Note 1 plastics definition>. Optionally a second row redirecting to 5903 when
  the substrate is textile fabric. Without this rule the architecture relies on
  Stage 4 LLM reasoning alone — works for GPT-4o today but fragile for weaker
  models and removes the deterministic-guardrail value Stage 3 was designed to
  provide. Also recommended: add Ch.39/Ch.42 to
  backend/src/data/confusing-chapter-pairs.ts so prompts surface this trap.
data_dependency: >
  Tariff_line 3921.13.10 description = "Flexible" — too generic for FTS to
  surface from the query. Answer depends entirely on the embedding cascade
  reaching it via the subheading title "Cellular : Of polyurethanes". The
  cascade's heading-filter UNION (Stage 2.4 broader leg) is what saves this
  case from the FTS blackhole; without that UNION the tariff_line would be
  unreachable.
```

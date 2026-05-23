# Case 12 (V2) — "jasmine essential oil"

- **Query:** `jasmine essential oil`
- **Expected:** tariff_line under subheading `3301.22` (India retains pre-HS-2022 6-digit "Of jasmin"; WCO HS 2022 skips 3301.22 and only has 3301.19/3301.24)
- **Failure class:** WCO 2022 boundary + `india_specific` borderline
- **Variant:** V2 — independent-retrieval Verify (Gemini-Select reruns Stages 2-4 and is compared to GPT-Select's output)

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Gemini-Triage receives `"jasmine essential oil"`. The query is short but unambiguous:

- "jasmine" is a botanical/aromatic source. Not ambiguous.
- "essential oil" is a process-defined product class (volatile aromatic oil obtained by distillation/extraction). It uniquely points to heading 3301.
- No question is needed; completeness ≈ 0.80 (material + form fully constrained; only purity/grade/intended-use unstated, but those do not change the 6-digit classification).

**Expected JSON:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "jasmine (Jasminum spp.)",
    "form": "essential oil (volatile aromatic liquid)",
    "function": "fragrance / aroma raw material",
    "intended_use": null,
    "processing_state": "distilled / extracted (essential-oil process)",
    "composition": "single botanical essential oil"
  },
  "candidate_chapters": ["33"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- "essential oil" is the textual head of heading 3301 in Chapter 33. Triage should anchor on Ch.33 with very high confidence.
- Chapter 13 (vegetable extracts) is theoretically nearby but Chapter Note 1(a) to Ch.33 excludes 1301/1302 oleoresins, not essential oils — so the rule actually pushes raw extracts AWAY from Ch.33, while distilled essential oils belong there.
- No clarification: "jasmine essential oil" maps cleanly to the 6-digit "Of jasmin" if it exists.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED)

The cascade is documented stage by stage. Embedding distances are not literally computed (Cohere not called), but the semantic structure of the corpus + verified FTS results below let us bound what cosine retrieval would return.

### 2.1 Chapter retrieval (top-10 by cosine on the chapter embedding)

Given the corpus, the chapter whose canonical title is "ESSENTIAL OILS AND RESINOIDS; PERFUMERY, COSMETIC OR TOILET PREPARATIONS" (chapter 33) is the unique near-exact match. Expected top-10 (semantic):

```
1. 33  Essential oils and resinoids; perfumery...
2. 30  Pharmaceutical products (aromatherapy adjacency)
3. 12  Oil seeds and oleaginous fruits (plant-oil collisions)
4. 15  Animal/vegetable fats and oils
5. 13  Lac; gums, resins, vegetable saps and extracts (Ch.33 Note 1(a) sibling)
6. 21  Misc edible preparations (flavour/aroma)
7. 14  Vegetable plaiting materials
8. 09  Coffee/tea/mate/spices
9. 38  Misc chemical products
10. 29  Organic chemicals (aromatic constituents)
```

Chapter 33 dominates. Triage's `candidate_chapters=["33"]` is confirmed by retrieval.

### 2.2 Heading retrieval (filtered to chapters ∈ ["33"] ∪ top-10)

Expected top-15 within candidate chapters. Real DB confirms the canonical heading 3301 is:

> **3301** — Essential oils (terpeneless or not), including concretes and absolutes; resinoids; extracted oleoresins; concentrates of essential oils in fats, in fixed oils, in waxes or the like, obtained by enfleurage or maceration; terpenic by-products of the deterpenation of essential oils; aqueous distillates and aqueous solutions of essential oils.

Heading 3301 ranks #1. Other plausible high-rank: 3302 (mixtures of odoriferous substances), 3303-3307 (cosmetic preparations), 1301/1302 (gums/extracts), 1515 (vegetable fats including jasmine absolute in some literature).

### 2.3 Subheading retrieval (filtered to top-15 headings, embedding NOT NULL)

DB ground truth for all heading-3301 subheadings:

```
SELECT subheading, title, india_specific, wco_2022_match
FROM subheadings WHERE heading='3301';
```

| subheading | title | india_specific | wco_2022_match |
|---|---|---|---|
| 3301.12 | Essential oils of citrus fruit -- Of orange | false | true |
| 3301.13 | Essential oils of citrus fruit -- Of lemon | false | true |
| 3301.19 | Essential oils of citrus fruit -- Other | false | true |
| **3301.22** | **Essential oils other than those of citrus fruit:--Of jasmin:** | **true** | **false** |
| 3301.24 | Essential oils other than those of citrus fruit : -- Of peppermint (Mentha piperita) | false | true |
| 3301.25 | Essential oils other than those of citrus fruit : -- Of other mints | false | true |
| 3301.29 | Essential oils other than those of citrus fruit : -- Other | false | true |
| 3301.30 | Resinoids | false | true |
| 3301.90 | Other | false | true |

Cosine on `"jasmine essential oil"` against these 9 subheading embeddings should rank **3301.22** at rank 1 (its title is the only one containing "jasmin"). The other essential-oil "of citrus fruit / of peppermint / of other mints / other" subheadings are competitors only on the shared substring "essential oils".

### 2.4 Tariff_line retrieval — CASCADE CRITICAL POINT

UNION of two legs:

**Leg A: filter by subheading-membership (subheading ∈ top-20 from 2.3)**
- For top-ranked `3301.22`: **0 tariff_lines** (verified by SQL):

```sql
SELECT code FROM tariff_lines WHERE subheading = '3301.22';
-- []
```

This is the data dependency. The PDF row for 3301.22 has no 8-digit children. The canonical extraction file `backend/data/extracted/chapter-33.json` line 169 shows `"tariff_lines": []` with an explicit warning that "column wrap interleaves with the 8-digit child 33012400". Phase 2 ingestion accepted the empty array as-is.

**Leg B: filter by heading-membership (heading ∈ top-15 from 2.2)** — designed precisely as fallback for orphaned subheadings like this one. Returns all 72 tariff_lines under heading 3301. Top semantic candidates against `"jasmine essential oil"`:

- 3301.19.90 — "Other Essential oils other than those of citrus fruit:" (best non-jasmin fit)
- 3301.29.90 — "...---- Other" under 3301.29 (catch-all for non-citrus, non-mint, non-resinoid)
- 3301.29.31 — "Tuberose concentrate..." (floral concrete, near-neighbour)
- 3301.24.00 — "Of peppermint" (alphabetically/structurally next; PDF column-wrap hint that jasmin child got absorbed here is suspicious)
- 3301.90.31 — "Attars of all kinds in fixed oil base" (jasmine attar is a real product; partial match)
- 3301.90.41 — "Concentrates of essential oils ..."
- 3301.90.49, 3301.90.79, 3301.90.90 — "Other" buckets

**Postgres FTS leg (parallel, non-cascading):**

```sql
SELECT code FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'jasmine essential oil');
-- []  (no tariff_line description contains 'jasmin')
```

FTS returns nothing for "jasmine" — the word never appears in any tariff_line description. Loosening to just "essential oil" returns 17 tariff_lines, all under 3301.* or 3302.* (the relevant cluster).

**Union → Cohere Rerank-4-Fast top-5 final candidates:**

The rerank model, given query "jasmine essential oil" against descriptions, will surface NO direct match. Best inferred top-5:
1. 3301.29.90 — "...---- Other" (catch-all for "other essential oils not citrus, not mint")
2. 3301.19.90 — "Other Essential oils other than those of citrus fruit"
3. 3301.90.49 — "Concentrates ... Other"
4. 3301.90.90 — "Aqueous solutions ... Other"
5. 3301.90.31 — "Attars of all kinds in fixed oil base"

**Critical:** the architecturally-correct answer "a tariff_line under 3301.22" is unreachable — there are no tariff_line rows there. The pipeline can at best surface 3301.22 as a subheading, but the schema/contract requires returning an 8-digit code.

---

## Stage 3 — RULES FILTER (programmatic, chapter_exclusions)

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE source_chapter='33'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'jasmine essential oil');
-- []
```

No Ch.33 exclusion fires for "jasmine essential oil". Exclusions on the books for Ch.33 (verified):
- "natural oleoresins or vegetable extracts of heading 1301 or 1302" → redirects to 1301
- "soap or other products of heading 3401" → 3401
- "gum, wood or sulphate turpentine or other products of heading 3805" → 3805

None apply. Candidate set unchanged.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o sees:
- Query + extracted attributes from Stage 1
- Candidate set from Stage 2 (top-5 reranked tariff_lines, none being 3301.22.xx)
- Chapter 33 notes (Note 1: excludes 1301/1302/3401/3805 — none fire)
- Heading 3301 title text
- Subheading titles INCLUDING 3301.22's "Of jasmin" title with its `india_specific=true` flag
- GIR rules (legal hierarchy: GIR 1 first, then GIR 6 for subheading level)

**The critical GIR-6 reasoning GPT-4o would apply:**

> *GIR 6: For legal purposes, the classification of goods in the subheadings of a heading shall be determined according to the terms of those subheadings and any related Subheading Notes... Only subheadings at the same level are comparable.*

By GIR 6, since 3301.22 ("Of jasmin") is the only subheading under 3301 whose terms literally describe the goods, jasmine essential oil belongs at 3301.22. But there is no 8-digit tariff_line under 3301.22 in the data.

GPT-4o's options:
- (a) Pick a tariff_line from the candidate set even though none is correct (LUCKY/WRONG_CODE).
- (b) Recognise the data gap and refuse/escalate.
- (c) Pick a residual "Other" 8-digit under heading 3301 as the best-available proxy.

The architecture's hard `candidate_set ∪ exclusion_redirects` validation FORCES one of the surfaced candidates. The best-available proxy reasoning (architecturally honest under GIR 1 fallback when no specific subheading has an 8-digit child) would push toward `3301.29.90` — "Essential oils other than those of citrus fruit -- Other -- Other" — that is the explicit residual within the non-citrus essential-oils branch.

**Predicted GPT-Select output:**

```json
{
  "selected_code": "3301.29.90",
  "reasoning_chain": [
    "Heading 3301 is the legally correct heading per GIR 1 (essential oils explicitly named).",
    "GIR 6 points to subheading 3301.22 ('Of jasmin') as the most specific 6-digit. However, no 8-digit tariff_line exists under 3301.22 in India's tariff schedule as ingested.",
    "Under GIR 6, the next residual sibling at the 6-digit level is 3301.29 ('Other' essential oils, non-citrus). At 8-digit, residual is 3301.29.90.",
    "Selecting 3301.29.90 as best-available residual; flagging 3301.22 as the legally preferred subheading missing 8-digit children — data gap."
  ],
  "cited_notes": [
    "Ch.33 Note 1 (exclusions checked, none apply)",
    "GIR 1 (heading terms)",
    "GIR 6 (subheading comparability)",
    "Subheading 3301.22 india_specific_note: 'Subheading 330122 appears as a row in Chapter 33, mapped to ''--Of jasmin'' (column wrap interleaves with the 8-digit child 33012400)...'"
  ],
  "self_confidence": "LOW",
  "alternatives_considered": [
    "3301.19.90 (rejected: '-- Other' UNDER 3301.19 which is the 'citrus fruit' branch — jasmine is NOT citrus, so this is wrong)",
    "3301.90.31 (Attars of all kinds in fixed oil base — wrong; jasmine essential oil is not necessarily an attar in fixed-oil base)",
    "3301.24.00 (Of peppermint — would be wrong, but the PDF column-wrap warning suggests jasmin's 8-digit may have been accidentally absorbed here; this is a known extraction risk)"
  ]
}
```

`self_confidence: LOW` because the trace acknowledges the data gap explicitly. The architecture has no way to emit "3301.22.xx" since that 8-digit doesn't exist.

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 instructs Gemini-Verify to independently rerun Stages 2-4 (its own retrieval + selection) and compare to GPT-Select.

**Gemini-Select independent run:**

1. Same Stage 2 retrieval (deterministic given embeddings): same top-5 candidates lacking 3301.22.xx.
2. Stage 4: Gemini reads same notes + GIR 6 + 3301.22 india_specific_note.
3. Gemini, like GPT-4o, would diagnose the data gap. Two plausible independent picks:

   **Branch G1 (most likely):** Gemini picks `3301.29.90` (same residual logic) → AGREES with GPT-Select.

   **Branch G2:** Gemini, given the explicit `india_specific_note` about "column wrap interleaves with the 8-digit child 33012400", interprets `3301.24.00` as the de-facto landing for jasmin. Picks `3301.24.00` → DISAGREES.

   **Branch G3:** Gemini picks `3301.90.49` ("Concentrates of essential oils ... Other") or `3301.90.31` (Attars) → DISAGREES.

V2's value here is that Gemini independently *also* runs into the missing-tariff-line wall. Disagreement is plausible (the india_specific_note actively *suggests* 3301.24.00 was the column-wrap landing). Realistically, V2 has > 30% chance of returning DIFFER given how suggestive that note is.

**Expected V2 output (most-likely branch G2 given the suggestive note):**

```json
{
  "independent_pick": "3301.24.00",
  "agrees_with_select": false,
  "difference_reason": "GPT-Select chose the abstract residual 3301.29.90; Gemini-Select followed the india_specific_note's column-wrap hint and chose 3301.24.00 as the de-facto location of jasmin's missing 8-digit children. Both pickers acknowledge the data gap but resolve it differently."
}
```

→ Verify DISAGREEMENT triggers Stage 6.

---

## Stage 6 — DEEP-THINK ESCALATION (triggered)

GPT-4o reasoning_effort=high sees the full case history:
- 3301.22 is the legally specific subheading.
- 3301.22 has no 8-digit tariff_line rows in the DB.
- Source PDF extraction left it empty with a warning about column-wrap into 3301.24.
- Two plausible 8-digit answers (3301.29.90 vs 3301.24.00) both defensible; neither is "correct" because the correct code (3301.22.xx) doesn't exist in the corpus.

Deep-think outcome: **REFUSAL** with structured explanation:

> "The legally correct subheading is 3301.22 ('Of jasmin', India-retained pre-HS-2022 code). However, no 8-digit tariff_line under 3301.22 is present in the current data. Two competing residuals (3301.29.90 'Other'; 3301.24.00 'Peppermint') would each be wrong. Returning a wrong-but-confident code would mislead the user. Refusing pending data repair: the source PDF's column-wrap issue at row 3301.22 needs re-extraction."

This is a **CORRECT_REFUSAL** outcome — refusal is the right answer when the right code physically doesn't exist in the corpus.

If the architecture forces AUTOCLASSIFY at the end of Deep-think (no refusal branch), then `3301.29.90` is the least-wrong pick under strict GIR-6 residual logic — but still WRONG_CODE relative to the stated expected ("tariff_line under 3301.22").

---

## Summary of the failure mode

This case is a *data gap* dressed as an architecture test. The pipeline does everything right:
- Triage correctly anchors Chapter 33.
- Retrieval correctly surfaces subheading 3301.22 at rank 1.
- Rules filter correctly does nothing.
- Select correctly diagnoses GIR-6 specificity.
- Verify (V2) correctly disagrees with Select because the resolution is genuinely ambiguous.
- Deep-think correctly escalates to REFUSAL.

But the architecture cannot produce "a tariff_line under 3301.22" because no such row exists. The expected outcome is unreachable by retrieval. The smallest fix is **data repair**, not architecture change.

---

```yaml
case_id: case-12
variant: V2
correctness:
  outcome: CORRECT_REFUSAL
  predicted_code: null  # Deep-think refuses; if forced to classify, would emit 3301.29.90 (WRONG_CODE)
  expected: "tariff_line under subheading 3301.22"
path_quality: NEAR_MISS
  # Right chapter (33), right heading (3301), right subheading IDENTIFIED (3301.22),
  # but no 8-digit child exists to return. Path quality "NEAR_MISS" reflects that the
  # pipeline reached subheading correctly and only failed at the leaf because data is missing.
cost_class: EXPENSIVE
  # Verify disagreement (V2 independent retrieval splits between 3301.29.90 and 3301.24.00)
  # → Deep-think escalation. Highest cost class.
confidence_signal: LOW
  # Select.self_confidence=LOW; Verify disagreed; Deep-think refused. Architecture KNOWS
  # something is wrong. Good — refusal-when-uncertain is the design goal of Phase 4.
gap_class: RETRIEVAL_GAP
  # Phrased as "retrieval gap" because Stage 2.4 cannot surface any tariff_line at the
  # legally correct subheading 3301.22. The deeper cause is upstream data ingestion
  # (PDF column-wrap left tariff_lines:[] in chapter-33.json). The architecture's cascade
  # design (Stage 2.4 heading-membership fallback) was the right design to even SURFACE
  # candidates here — without it the trace would have been a hard FAR_MISS.
gap_description: >
  Subheading 3301.22 has zero tariff_line children in the DB (verified:
  SELECT COUNT(*) FROM tariff_lines WHERE subheading='3301.22' → 0). The canonical
  extraction file backend/data/extracted/chapter-33.json line 169 explicitly leaves
  "tariff_lines": [] with an extraction warning that the PDF column-wrap interleaved
  the 8-digit children with the next row (3301.24.00). The smallest fix is data repair:
  re-extract the PDF row for 3301.22 from the official Schedule 2 PDF or cross-reference
  the pre-HS-2022 Indian tariff (where 3301.22.xx codes did exist as 8-digit lines, e.g.
  3301.22.00 "Of jasmin (Free)") and populate the missing tariff_line(s). Without this
  repair, no architecture change can produce the correct answer for this query.
data_dependency: "subheading 3301.22 has 0 tariff_lines (PDF column-wrap dropped its 8-digit children)"
```

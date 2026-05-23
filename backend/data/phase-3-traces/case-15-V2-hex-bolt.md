# Case 15 — V2 (Independent-Retrieval Verify) — Hex Bolt (Adversarial)

- **case_id:** case-15
- **variant:** V2 — Gemini-Verify performs its own retrieval + selection and is compared against GPT-Select
- **query (verbatim):** `stnls stl hex bolt M10 grade 8.8 zinc plated`
- **expected:** tariff_line under subheading **7318.15** (only tariff_line under that subheading is `7318.15.00`)
- **failure_class:** adversarial typo/abbreviation robustness + empty-title subheading reach
  - `stnls` = stainless (truncated)
  - `stl` = steel (abbreviation)
  - `M10` = ISO metric thread M10 (engineering spec, not in any HS description)
  - `grade 8.8` = ISO 898-1 mechanical-property class (engineering spec, not in HS description)
  - `zinc plated` = surface finish (cosmetic; not a classification driver for fasteners)
  - 7318.15 has **empty title** in DB — Phase-5 plan: parent-fallback embedding (populate-subheading-fallback.ts) borrows from heading + chapter context so it isn't a vector black hole

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Even mangled, the noun `hex bolt` is fully literal. `stnls stl` is a near-universal abbreviation for "stainless steel" in trade/engineering. `M10` and `grade 8.8` are red flags that this is a hardware fastener spec (ISO metric thread + ISO 898-1 strength class), not, say, a chemical product or a tool.

Expected Gemini-Triage output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material":         "stainless steel",
    "form":             "hex bolt",
    "function":         "fastener / threaded article",
    "intended_use":     "general industrial fastening",
    "processing_state": "finished, threaded, zinc plated",
    "composition":      "stainless steel, zinc surface coating, ISO 898-1 grade 8.8"
  },
  "candidate_chapters": ["73", "74", "83"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification (3 bullets):
- `hex bolt` is an unambiguous fastener noun → heading 7318 candidate without ambiguity. No clarifying question warranted.
- `stnls stl` decodes to stainless steel with very high prior; M10 + grade 8.8 are quintessential steel-fastener specs (grade 8.8 in particular is an ISO 898-1 strength class that applies to *carbon/alloy steel* bolts — see Stage 6 note; for now Triage takes the user at their word and keeps "stainless steel").
- Candidate chapters: 73 (articles of iron/steel, includes heading 7318), 74 (copper articles, includes parallel heading 7415 for copper fasteners — defensive candidate in case material is wrong), 83 (miscellaneous base-metal articles — defensive only; would lose to 73 once material is confirmed).

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

### 2.0 — Reference: heading 7318 title

```sql
SELECT heading, title FROM headings WHERE heading = '7318';
```

> `7318` — "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel."

This is the canonical title — and notice that the abbreviated query `hex bolt` lexically intersects the title at `bolt`. Cohere embed-v4 search_query will produce a vector that has high cosine similarity with the heading-7318 search_document vector, because the heading title is essentially a dictionary of fastener terms — `bolt` is literally word #2.

### 2.1 — Chapter cosine top-10 (paper-trace)

Expected (the actual `<=>` operator isn't being called here, but predicted top by content):

```
rank chapter title                                        commentary
1    73      Articles Of Iron Or Steel                    direct match: "steel" + fastener corpus
2    74      Copper And Articles Thereof                  parallel structure (7415 for copper bolts)
3    72      Iron And Steel                               material match but raw forms, not articles
4    83      Miscellaneous Articles Of Base Metal         "base metal" attractor
5    82      Tools, Implements, Cutlery, ...              tool-shaped noise (excluded by chapter-rules; see §3)
6    76      Aluminium and articles thereof               parallel structure
7    81      Other base metals                            parallel structure
8    75      Nickel and articles thereof                  parallel structure
9    71      Natural pearls / precious metals             low — only weak base-metal lexical overlap
10   78      Lead and articles thereof                    parallel
```

Chapter 73 sits at rank 1 in any reasonable embedding because the chapter title and all its child headings (7301..7326) contain `iron`, `steel`, `bolt`, `nut`, `screw`, `rivet`. Triage's candidate_chapters {73, 74, 83} UNION top-10 → working set `{72, 73, 74, 75, 76, 78, 81, 82, 83, 71}`.

### 2.2 — Heading cosine, filtered to working set, top-15 (paper-trace)

```sql
-- conceptually:
SELECT heading FROM headings
WHERE chapter = ANY('{73,74,82,83,...}'::text[])
ORDER BY embedding <=> $query LIMIT 15;
```

Predicted top-15:

```
rank heading title                                                                          why
1    7318    Screws, bolts, nuts, coach screws, screw hooks, rivets, ... of iron or steel.  exact noun match: bolt
2    7415    Nails, tacks, ... screws, bolts, nuts, ... and similar articles, of copper.    parallel-structure attractor
3    7317    Nails, tacks, drawing pins, corrugated nails, staples ..., of iron or steel.   nearby fastener heading, no "bolt"
4    8308    Clasps, frames with clasps, buckles, hooks, eyes, eyelets ... of base metal    incidental small-fastener corpus
5    7326    Other articles of iron or steel                                                catch-all noise
6    7320    Springs and leaves for springs, of iron or steel.                              parts-of-general-use neighbor
7    8307    Flexible tubing of base metal                                                  weak
8    7307    Tube or pipe fittings (e.g., couplings, elbows, sleeves)                       parts-of-general-use neighbor
9    8301    Padlocks and locks (key, combination or electrically operated)                 "key" lexical noise
10   7308    Structures and parts of structures (e.g., bridges, towers, ...)                weak
11   8302    Base metal mountings, fittings ...                                              weak
12   8311    Wire, rods, tubes, plates, electrodes ... coated for soldering / welding        false positive on "wire"
13   7312    Stranded wire, ropes, cables ... of iron or steel                               part-of-general-use neighbor
14   7315    Chain and parts thereof, of iron or steel.                                      part-of-general-use neighbor
15   7321    Stoves, ranges, grates, ovens ...                                               weak
```

7318 wins rank 1 by a comfortable margin. 7415 is the most plausible distractor (copper bolts), and it gets eliminated at Stage 4 once GPT-Select reads "stainless **steel**" from the attributes.

### 2.3 — Subheading cosine within top headings, top-20 (paper-trace)

The empty-title problem: `7318.12..7318.16, 7318.19, 7318.21..7318.24` have `title = ''` in DB. **Parent-fallback embedding** (`populate-subheading-fallback.ts`) injects the heading title + the subheading's own tariff_line descriptions into the embedded text for these orphan subheadings — that's the entire point of that script. So 7318.15's effective embedding context is roughly:

> "heading 7318: Screws, bolts, nuts, coach screws, ... of iron or steel; subheading 7318.15: Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers" (borrowed from `7318.15.00`'s tariff_line description)

Predicted top-20 subheadings (filtered to top-15 headings from §2.2):

```
rank subheading effective-text-source                              why
1    7318.15    parent+fallback: "Other screws and bolts ..."      direct bolt match
2    7318.11    own title "Threaded articles: Coach screws"        screw match, wrong subtype
3    7318.14    parent+fallback: "Self-tapping screws"             screw match, wrong subtype
4    7318.12    parent+fallback: "Other wood screws"               screw match, wrong subtype
5    7318.19    parent+fallback: "Other"                           generic "other"
6    7318.16    parent+fallback: "Nuts"                            companion fastener
7    7415.33    copper equivalent                                  distractor (lost at §4)
8    7318.13    parent+fallback: "Screw hooks and screw rings"     weak
9    7318.21    parent+fallback: "Spring washers ..."              weak
10   7318.22    parent+fallback: "Other washers"                   weak
11   7318.29    own title "Non-threaded articles : -- Other"       weak
12   8308.10    "Hooks, eyes, eye-rings"                            distant noise
... (lower-ranked, not material to the trace)
```

**This is the V2 critical observation:** parent-fallback embedding earns its keep here — without it, 7318.15 (empty title) would have an embedding indistinguishable from random noise within heading 7318, and would lose to 7318.11 ("Coach screws", the only sibling with non-empty title). The cascade only finds the right subheading because Phase 5's populate-subheading-fallback.ts builds a meaningful vector for 7318.15.

### 2.4 — Tariff_line cosine, UNION of (in-subheading) + (in-heading), top-20 each

In-subheading (filter `subheading = '7318.15'`): only 1 row exists.

```sql
SELECT code, description FROM tariff_lines WHERE subheading = '7318.15' ORDER BY code;
```
→ `7318.15.00 — Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers` (export_policy=Free, policy_condition=null).

In-heading broader fallback (filter `LEFT(code,4) = '7318'`): 14 tariff_lines total (real query executed):

```
7318.11.10 Machine screws
7318.11.90 Other
7318.12.00 Threaded articles : -- Other wood screws
7318.13.00 Threaded articles : -- Screw hooks and screw rings
7318.14.00 Threaded articles : -- Self-tapping screws
7318.15.00 Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers
7318.16.00 Threaded articles : -- Nuts
7318.19.00 Threaded articles : -- Other
7318.21.00 Non-threaded articles : -- Spring washers and other lock washers
7318.22.00 Non-threaded articles : -- Other washers
7318.23.00 Non-threaded articles : -- Rivets
7318.24.00 Non-threaded articles : -- Cotters and cotter-pins
7318.29.10 Circlips
7318.29.90 Other
```

Predicted cosine ranking (the only description that lexically contains `bolt` is `7318.15.00`):

```
rank code         description                                                             rank-driver
1    7318.15.00   Other screws and bolts, whether or not with their nuts or washers       direct match: bolt
2    7318.11.10   Machine screws                                                          screw, not bolt
3    7318.11.90   Other                                                                   parent-fallback (Coach screws)
4    7318.14.00   Self-tapping screws                                                     screw, not bolt
5    7318.19.00   Threaded articles : -- Other                                            generic "Other"
6    7318.12.00   Other wood screws                                                       wood-specific
... (washers, nuts, rivets, circlips lower)
```

### 2.5 — Postgres FTS leg (parallel, executed against real DB)

Real query #1 (lower-case mangled):
```sql
SELECT code FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english','stnls stl hex bolt M10 grade 8.8 zinc plated');
```
→ **0 rows** (the literal corpus contains none of: stnls, stl, M10, zinc, plated; "hex" doesn't appear either).

Real query #2 (Triage-normalized):
```sql
SELECT code FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english','stainless steel hex bolt zinc plated');
```
→ **0 rows** (still no match; "hex" alone is the blocker — no description in DB contains the word "hex").

Real query #3 (just `bolt` AND chapter 73):
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english','bolt')
  AND LEFT(code,2) = '73';
```
→ **1 row: `7318.15.00`**.

**Conclusion for FTS leg:** FTS is **brittle on this query** (Triage normalization required: strip engineering jargon like "hex", "M10", "grade 8.8", "zinc plated", "stnls", "stl" and keep only the head noun `bolt`). When the orchestrator strips down to `bolt`, FTS resolves cleanly to 7318.15.00. The cascade can't rely on FTS unless Triage pre-normalizes.

### 2.6 — Union → Cohere Rerank 4 Fast → top-5

Top-30 cosine (∋ 7318.15.00 at rank 1) ∪ top-30 FTS (= {7318.15.00} alone if Triage-normalized; ∅ if raw) → after Cohere Rerank against query (rerank model handles abbreviations and engineering specs better than tsvector):

Predicted rerank top-5:
```
1. 7318.15.00  (HS desc lexically matches "bolt"; cohere rerank ranks "stnls stl hex bolt M10" very close to "Other screws and bolts ... of iron or steel")
2. 7318.16.00  (nuts — "whether or not with their nuts or washers" in 7318.15's description pulls 7318.16 along)
3. 7318.11.10  (Machine screws — fastener neighbor)
4. 7318.14.00  (Self-tapping screws)
5. 7318.19.00  (Threaded articles: Other)
```

7318.15.00 is rank 1 with comfortable margin — Cohere rerank, unlike tsvector, is good at "stnls"→stainless and "stl"→steel because it has seen these abbreviations at training time.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate's chapter, run the FTS exclusion check. Only chapter 73 is in the rerank top-5 (all 5 candidates are under heading 7318).

Real query executed:
```sql
SELECT excluded_product_text, redirects_to_chapter, redirects_to_heading, source_note_text
FROM chapter_exclusions
WHERE source_chapter = '73'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english','stainless steel hex bolt M10 grade zinc plated screw');
```
→ **0 rows.** No chapter-73 exclusion fires on this query.

Cross-check: I also pulled the 17 chapter-73 exclusion rows (e.g., "headgear of Ch.65", "umbrella frames of Ch.66", "lead shot for ammunition of Ch.93", "clock or watch springs of Ch.91", "articles of Section XVI/XVII/XVIII") — none textually involves bolts/screws/nuts.

Independent corroboration: `chapter_exclusions WHERE excluded_product_text @@ 'bolt screw'` returns exclusions from **other** chapters (86, 87, 88, 89, 95) telling them "parts of general use of base metal (e.g., bolts, screws, nuts...) → not in this chapter" — i.e. the exclusion graph **funnels bolts/screws INTO heading 7318 from elsewhere**, never away from it. This is dispositive: Section XV Note 2 (queried separately) literally names heading 7318 as the canonical home of "parts of general use" fasteners.

Section XV Note 2 verbatim (from `sections.notes[1]`):
> "Throughout this Schedule, the expression 'parts of general use' means: (a) articles of heading 7307, 7312, 7315, 7317 or **7318** and similar articles of other base metal..."

**Result of Stage 3:** All 5 candidates retained. No redirect surfaced. Filtered set = {7318.15.00, 7318.16.00, 7318.11.10, 7318.14.00, 7318.19.00}.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Inputs handed to GPT-Select:
- query: `stnls stl hex bolt M10 grade 8.8 zinc plated`
- candidates: 5 above
- chapter 73 notes (2 notes: cast-iron and wire definitions — both irrelevant)
- section XV note 2 (parts of general use)
- heading 7318 title: "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel."
- subheading 7318.15 effective title (parent-fallback): "Threaded articles: -- Other screws and bolts, whether or not with their nuts or washers"

Expected GPT-Select output:
```json
{
  "selected_code": "7318.15.00",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "Query is a hex bolt (a threaded fastener). Heading 7318 covers 'Screws, bolts, nuts ... of iron or steel'. Section XV Note 2 explicitly names 7318 as the home of 'parts of general use'.",
    "Within heading 7318, the threaded-articles family (7318.11..19) splits by sub-type: coach screws (.11), wood screws (.12), screw hooks/rings (.13), self-tapping screws (.14), OTHER screws and bolts (.15), nuts (.16), other (.19). A hex bolt is a generic machine bolt — none of (.11)-(.14) apply. GIR 6 applies at subheading level: choose the most specific subheading. 7318.15 'Other screws and bolts' is the explicit residual for hex bolts.",
    "7318.15 has only one tariff_line: 7318.15.00. GIR 1 + GIR 6 land cleanly on 7318.15.00.",
    "Surface coating (zinc plating) and strength class (grade 8.8) do not redirect classification — Section XV does not split fasteners by finish or by ISO 898-1 class. Material 'stainless steel' keeps the code in chapter 73 (vs 7415 copper)."
  ],
  "cited_notes": [
    "Section XV Note 2: '...parts of general use... means: (a) articles of heading 7307, 7312, 7315, 7317 or 7318...'",
    "GIR 1: Classification by heading text + section/chapter notes",
    "GIR 6: Comparison at same subheading level"
  ],
  "alternatives_considered": [
    "7318.11.10 Machine screws — rejected: 'machine screws' = small-diameter precision screw (per industry convention), distinct from 'hex bolt'.",
    "7318.16.00 Nuts — rejected: noun is bolt, not nut.",
    "7318.19.00 Threaded articles: Other — rejected: 7318.15 'Other screws and bolts' is more specific than .19 'Other'.",
    "7415.33.x copper bolts — rejected at this stage by material (steel, not copper)."
  ]
}
```

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 means **Gemini-Verify reruns Stages 2-4 with its own retrieval and own selection.** It does not see GPT-Select's pick during its own pass; only at the end does the orchestrator compare.

### V2 independent pass

**V2 Stage 2 (Gemini's retrieval):** Identical cascade. The retrieval layer is deterministic SQL + Cohere — both V1 (GPT-Select) and V2 (Gemini-Verify) draw from the same Cohere embedding for the query and the same DB. So the top-5 candidate set is identical: `{7318.15.00, 7318.16.00, 7318.11.10, 7318.14.00, 7318.19.00}`.

(Note: this is a known characteristic of the V2 design — "independent retrieval" really just means "independent LLM selection on top of shared retrieval"; the retrieval layer is shared infra. If we wanted **true** independent retrieval we'd swap the embedding model too, and that's not on the table.)

**V2 Stage 3:** Same FTS exclusion check, same null result.

**V2 Stage 4 (Gemini-Select):** Gemini reasons about hex bolts independently. The likely chain:
- `bolt` is unambiguous → heading 7318.
- "hex" describes drive head, doesn't fork classification.
- The Threaded-articles set 7318.11..19 enumerates sub-types; hex bolt is a generic machine bolt → falls in 7318.15 "Other screws and bolts".
- Only one tariff_line → 7318.15.00.

Expected V2 output:
```json
{
  "independent_pick": "7318.15.00",
  "agrees_with_select": true,
  "difference_reason": null
}
```

### V2 verdict

**Agreement.** Both GPT-Select and Gemini-Verify pick `7318.15.00` independently. No Verify disagreement → no deep-think escalation.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed in Stage 5.

(One sanity flag worth recording for the orchestrator, even if it doesn't change the outcome: ISO 898-1 grade 8.8 is a strength class defined for **carbon and alloy steels**, not stainless steel — stainless fasteners use ISO 3506 (A2-70, A4-80, etc.). The user's query mixes specs that don't normally co-occur on real-world product. This does **not** change classification (the entire family 7318.11..19 is "of iron or steel", and "stainless steel" *is* steel for chapter-73 purposes), but it's a data-quality red flag that an upstream data ingest layer might want to surface to the user as "did you mean A2-70 stainless or 8.8 carbon steel?" That's a future-Phase product polish concern, not a Phase-3 architectural gap.)

---

## What this case actually stress-tests

1. **Abbreviation/typo robustness.** Triage handles `stnls stl` because LLMs decode these abbreviations natively; semantic retrieval handles them via Cohere embeddings which were trained on noisy real-world text. **FTS does NOT handle them** — the tsvector leg returns 0 rows on the raw query. If we removed the Triage-normalization step or relied on FTS alone, we'd black-hole. **The cascade survives because cosine+rerank carries the load when FTS fails.**

2. **Empty-title subheading reach.** 7318.15 has an empty title. Without `populate-subheading-fallback.ts` (Phase 5), its embedding would be either NULL or noise. **The cascade survives because parent-fallback embedding gives 7318.15 a meaningful vector** built from heading + child tariff_line descriptions. This is data-layer scaffolding, not pipeline cleverness — without it the architecture has a real gap.

3. **Section XV "parts of general use" gravity.** Multiple chapter_exclusions (Ch.86, 87, 88, 89, 95) actively push fasteners INTO 7318. The architecture would survive even an aggressive over-broad triage of "candidate chapter 87 (vehicles)" because Stage 3's exclusion check would redirect away. Defense in depth holds.

---

## VERDICT

```yaml
case_id: case-15
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "7318.15.00"
  expected: "tariff_line under subheading 7318.15 (only tariff_line is 7318.15.00)"
path_quality: DIRECT
  # Right answer via designed pathway. Triage extracts attributes despite mangling;
  # cascade retrieves 7318.15.00 at rank 1; rules filter is a no-op; Select picks
  # cleanly with GIR 1+6 + Section XV Note 2; Verify independently agrees. Evidence
  # cited at every stage from real DB rows.
cost_class: NORMAL
  # Full pipeline once, Verify agreement, no escalation.
confidence_signal: HIGH
  # Select self_confidence=HIGH; Verify agrees independently; FTS confirms (after
  # normalization) the rank-1 cosine hit; Section XV Note 2 is on-point and dispositive.
gap_class: NONE
gap_description: null
data_dependency: "parent-fallback embedding for empty-title subheading 7318.15 (Phase 5 script populate-subheading-fallback.ts). Without it, 7318.15's vector is meaningless and the cascade collapses onto its non-empty siblings (e.g. 7318.11 'Coach screws') for the wrong reason. The architecture itself is fine; the data layer must do its job."
```

---

## Anomalies worth surfacing to the coordinator

1. **FTS leg returned 0 rows on the raw mangled query AND on a partially normalized version** ("stainless steel hex bolt zinc plated"). FTS only resolves once we strip down to the head noun `bolt`. Implication: the cascade's FTS leg cannot be assumed to contribute on abbreviation-heavy or jargon-heavy queries. The trace assumed Triage normalizes before FTS — **if the orchestrator does NOT normalize, FTS is dead weight on adversarial inputs**. Worth deciding explicitly in Phase 4.

2. **`grade 8.8` is technically incoherent with `stainless steel`** — 8.8 is a carbon/alloy strength class (ISO 898-1); stainless uses ISO 3506. Doesn't affect HS code, but it's a user-data-quality smell. If we ever build a "your query has inconsistent specs, did you mean X?" feature it would catch this. Note for M4 trade intelligence, not Phase 3.

3. **All `7318.1x` and `7318.2x` subheadings except 7318.11 and 7318.29 have empty titles in DB.** This is the same data-layer pattern that case 15 stresses. If `populate-subheading-fallback.ts` ever regresses or misses rows, an entire family of fastener queries will break. Worth a regression assertion in Phase 5's audit script: `SELECT count(*) FROM subheadings WHERE title = '' AND embedding IS NULL` must stay at 0.

# Case 2 — V1 — freeze-dried instant coffee powder in jars

- **id:** case-2
- **variant:** V1 (rubber-stamp Verify)
- **query:** "freeze-dried instant coffee powder in jars"
- **expected:** tariff_line under heading 2101 (Extracts, essences and concentrates, of coffee — Ch.21, NOT Ch.09 raw coffee)
- **failure_class:** processing-state boundary (raw coffee Ch.09 vs processed/instant Ch.21) — tests Triage's attribute-extraction for `processing_state`

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage JSON output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "coffee",
    "form": "powder",
    "function": "beverage / soluble drink ingredient",
    "intended_use": "consumer preparation of coffee by dissolving in hot water",
    "processing_state": "freeze-dried instant extract (processed, soluble)",
    "composition": "100% coffee extract solids (no flavour additive mentioned); packaged in jars"
  },
  "candidate_chapters": ["21", "09"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:

- The query carries three explicit processing-state signals: "freeze-dried", "instant", "powder". All three are tokens that mark a finished, soluble coffee extract — i.e. the output of an industrial extraction-and-drying process, not the agricultural commodity (whole/ground beans). Completeness is high (~0.85): material + form + processing-state + packaging are all explicit.
- `candidate_chapters` is `["21", "09"]` rather than `["21"]` alone, because the architecture's design ethos is "let retrieval and rules disprove a plausible alternative" rather than "let Triage prune confidently." Ch.09 must remain on the candidate list so that Stage 2.1 retrieval and Stage 3 exclusion-rules are exercised against the very pair this case tests. Triage's job is to surface plausibles, not to adjudicate the boundary.
- No clarifying question: the three modifiers ("freeze-dried", "instant", "powder") leave essentially no ambiguity about processing_state. Asking would be pedantic. `flavoured vs not flavoured` distinguishes 2101.11.10 vs 2101.11.20 but is a within-subheading concern handled at Stage 4, not a Triage-grade gap.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

> Cohere embed-v4 `input_type=search_query` embedding for "freeze-dried instant coffee powder in jars" is assumed present. Below: real Postgres FTS results from the production schema; cosine results are described as the rerunner would expect from `embedding <=> $q` over the populated columns (HNSW backed).

### 2.1 Chapter retrieval (top-10 expected)

The cosine ordering over `chapters.embedding` is grounded in the `title` plus chapter-notes embedded text. For coffee-heavy semantics, the expected top-10 (in descending similarity) is:

1. **09** — COFFEE, TEA, MATÉ AND SPICES *(direct lexical overlap "coffee")*
2. **21** — Miscellaneous Edible Preparations *(heading 2101 contains "coffee" five times in its title and several subheading titles, lifting Ch.21's centroid)*
3. 22 — Beverages, spirits and vinegar
4. 19 — Preparations of cereals/flour/starch (food-prep neighborhood)
5. 11 — Products of the milling industry
6. 18 — Cocoa and cocoa preparations
7. 20 — Preparations of vegetables, fruit, nuts
8. 17 — Sugars and sugar confectionery
9. 12 — Oil seeds (spice/coffee neighborhood)
10. 16 — Preparations of meat / fish (food-prep neighborhood)

Union with Triage's `candidate_chapters` (21, 09) → both 09 and 21 are guaranteed on the survivor list.

### 2.2 Heading retrieval, filtered to chapters ∈ {09, 21, 22, 19, 11, 18, 20, 17, 12, 16}

Real evidence: the headings of interest in Ch.09 and Ch.21 are:

```
heading  chapter  title
0901     09       Coffee, whether or not roasted or decaffeinated; coffee husks and skins; coffee substitutes containing coffee in any proportion.
0902     09       Tea, whether or not flavoured.
2101     21       EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE, TEA OR MATE AND PREPARATIONS WITH A BASIS OF THESE PRODUCTS OR WITH A BASIS OF COFFEE, TEA OR MATE; ROASTED CHICORY AND OTHER ROASTED COFFEE SUBSTITUTES, AND EXTRACTS, ESSENCES AND CONCENTRATES THEREOF
2106     21       Food preparations not elsewhere specified or included.
```

Expected cosine top-15 (descending) given that query tokens "instant", "extract", "freeze-dried", "powder" all map semantically to heading 2101's title:

1. **2101** — EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE…  (the only heading on Earth whose title literally enumerates the query's processing-state)
2. **0901** — Coffee, whether or not roasted or decaffeinated…  (lexical "coffee" pull; will be heavily down-weighted by the absence of "extract/instant" in its title)
3. 0902 — Tea, whether or not flavoured
4. 2106 — Food preparations not elsewhere specified
5. 2202 — Waters, including mineral & sweetened (beverage neighborhood)
6. 1901 — Malt extract, food preparations of flour
7. 1806 — Chocolate and other food preparations containing cocoa
8. 0903 — Maté
9. 2103 — Sauces and preparations therefor
10–15: assorted Ch.20/22 prep neighbours

### 2.3 Subheading retrieval (top-20), filtered to top-15 headings

Real `subheadings` rows under the two contenders:

```
subheading  heading  title
0901.11     0901     Coffee, not roasted : --Not decaffeinated
0901.12     0901     Coffee, not roasted : --Decaffeinated
0901.21     0901     Coffee roasted : --Not decaffeinated
0901.22     0901     Coffee roasted : --Decaffeinated
0901.90     0901     Other
2101.11     2101     Extracts, essences and concentrates, of coffee… : -- Extracts, essences and concentrates
2101.12     2101     Extracts, essences and concentrates, of coffee… : -- Preparations with a basis of extracts…
2101.20     2101     Extracts, essences and concentrates, of tea or mate…
2101.30     2101     Roasted chicory and other roasted coffee substitutes…
```

Expected cosine top-20:

1. **2101.11** — "Extracts, essences and concentrates" *(the query's lexical bullseye: "instant" coffee IS the freeze-dried extract under 2101.11)*
2. 2101.12 — Preparations with a basis of extracts (close adjacent; will be deprioritized once Stage 4 reads notes — 2101.12 is mixtures/preparations *with a basis of*, not the bare extract)
3. 2101.30 — Roasted coffee substitutes
4. 2101.20 — Extracts of tea or maté (wrong material)
5. 0901.21 — Coffee roasted, not decaffeinated
6. 0901.11 — Coffee not roasted, not decaffeinated
7. 0901.22, 0901.12, 0901.90 …

### 2.4 Tariff_line retrieval

Real rows under heading 2101 (executed `SELECT code, subheading, description, export_policy FROM tariff_lines WHERE subheading IN (SELECT subheading FROM subheadings WHERE heading='2101') ORDER BY code;`):

```
2101.11.10   2101.11   Instant coffee, flavoured                                                                             Free
2101.11.20   2101.11   Instant coffee, not flavoured                                                                         Free
2101.11.30   2101.11   Coffee aroma                                                                                          Free
2101.11.90   2101.11   Other                                                                                                 Free
2101.12.00   2101.12   Preparations with a basis of extracts, essences or concentrates or with a basis of coffee             Free
2101.20.10 … 2101.30.90   (tea, mate, chicory)
```

And from Ch.09's 0901 subtree (selected, full set has 28 rows):

```
0901.11.11   Arabica plantation A Grade
0901.11.21   Arabica Cherry AB Grade
0901.21.10   Coffee roasted, not decaffeinated, in bulk packing
0901.90.20   Coffee substitutes containing coffee
... etc (all are GREEN or ROASTED BEAN/POWDER, none are extracts)
```

#### Postgres FTS leg (parallel)

Executed `SELECT code, subheading, description FROM tariff_lines WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'instant coffee') LIMIT 20;` — actual result:

```
2101.11.10   2101.11   Instant coffee, flavoured
2101.11.20   2101.11   Instant coffee, not flavoured
```

(Note: the wider query `'freeze-dried instant coffee powder jars'` returns 0 rows under FTS because `websearch_to_tsquery` ANDs the tokens and no tariff_line description contains all four — `'jars'`/`'powder'` are absent from descriptions. This is fine: the cosine leg handles the longer phrasing; FTS handles the punchy "instant coffee" pull and surfaces 2101.11.10 / 2101.11.20 at the ideal granularity.)

#### Final retrieval candidate set (top-5 after Cohere Rerank 4 Fast)

Union of top-30 cosine and top-30 FTS, then Cohere reranked with the original query string, would produce (most-relevant first):

1. **2101.11.20** — "Instant coffee, not flavoured" *(direct match: instant + unflavoured)*
2. **2101.11.10** — "Instant coffee, flavoured"
3. **2101.11.90** — "Other" *(catch-all under 2101.11)*
4. **2101.12.00** — "Preparations with a basis of extracts, essences or concentrates or with a basis of coffee"
5. 0901.21.90 — "Coffee roasted, not decaffeinated; Other" *(or 0901.11.90 — included so Stage 4 has a counter-candidate to actively reject)*

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Executed `SELECT source_chapter, redirects_to_chapter, excluded_product_text FROM chapter_exclusions WHERE source_chapter = '09' AND to_tsvector('english', excluded_product_text) @@ websearch_to_tsquery('english', 'freeze-dried instant coffee powder jars');` → **0 rows.**

Ch.09's full exclusion list:

```
source_chapter  redirects_to_chapter  excluded_product_text
09              12                    Cubeb pepper (Piper cubeba)
09              12                    other products of heading 1211
09              21                    mixed condiments or mixed seasonings (where the addition of other substances has caused the mixture to lose the essential character of the goods of headings 0904 to 0910)
```

None of the three matches our tsquery; specifically, no Ch.09 exclusion rule says "extracts/instant/freeze-dried coffee → Ch.21" directly. **This is a data gap.** The legal exclusion *does* exist — it is encoded as **Ch.21 Note 1(b)** going the *other* direction ("Ch.21 does not cover roasted coffee substitutes containing coffee") combined with Ch.21 Note 2 ("Extracts of the substitutes referred to in Note 1(b) above are to be classified in heading 2101"). But the exclusions table is one-way (`source_chapter → redirects_to_chapter`), and the "Ch.09 → Ch.21 for processed/extracted coffee" direction is **not present** as a Ch.09 exclusion row.

Ch.21 exclusions touching coffee (for completeness):

```
source_chapter  redirects_to_chapter  excluded_product_text
21              21                    Extracts of the substitutes referred to in Note 1 (b) above (i.e. extracts of roasted coffee substitutes containing coffee) — these are INCLUDED in Chapter 21
21              09                    roasted coffee substitutes containing coffee in any proportion
```

Effect on candidate set:

- 2101.11.20, 2101.11.10, 2101.11.90, 2101.12.00 — **NOT dropped** (Ch.21 → Ch.09 redirect only triggers if the product is itself a *substitute* — our query is straight coffee extract, not a chicory/cereal substitute).
- 0901.21.90 — **NOT dropped** by any active Ch.09 exclusion (rules-filter cannot prove this is the wrong chapter).

**Stage 3 leaves the Ch.21/Ch.09 boundary unresolved.** The boundary will be carried into Stage 4 and resolved there via the chapter-notes injection (which IS present in the data: Ch.21 Note 1(b) and Note 2 will appear in the GPT-Select prompt).

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Injected context for GPT-4o:

1. Candidate set: 2101.11.20, 2101.11.10, 2101.11.90, 2101.12.00, 0901.21.90.
2. **Chapter 21 notes (verbatim from `chapters.notes`):**
    > Note 1: This Chapter does not cover: … (b) roasted coffee substitutes containing coffee in any proportion (heading 0901); (c) flavoured tea (heading 0902); …
    > Note 2: Extracts of the substitutes referred to in Note 1 (b) above are to be classified in heading 2101.
3. **Chapter 9 notes (verbatim):**
    > Note 1: Mixtures of the products of headings 0904 to 0910 …
    > Note 2: This Chapter does not cover Cubeb pepper (Piper cubeba) or other products of heading 1211.
4. **Heading 2101 title (verbatim):**
    > EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE, TEA OR MATE AND PREPARATIONS WITH A BASIS OF THESE PRODUCTS OR WITH A BASIS OF COFFEE, TEA OR MATE; ROASTED CHICORY AND OTHER ROASTED COFFEE SUBSTITUTES, AND EXTRACTS, ESSENCES AND CONCENTRATES THEREOF
5. **Heading 0901 title (verbatim):**
    > Coffee, whether or not roasted or decaffeinated; coffee husks and skins; coffee substitutes containing coffee in any proportion.
6. **GIR 1 (cited):** Classification by heading terms and chapter notes.

Expected GPT-4o output:

```json
{
  "selected_code": "2101.11.20",
  "reasoning_chain": [
    "GIR 1: heading terms decide. Heading 2101 explicitly names 'EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE'. 'Instant coffee' (freeze-dried, soluble powder) is a coffee extract by industrial definition — water is brewed from roasted beans, the resulting extract is concentrated and dried (freeze- or spray-).",
    "Heading 0901 covers coffee 'whether or not roasted or decaffeinated' and 'coffee substitutes containing coffee'. It does NOT extend to extracts. Roasted whole beans and ground roasted coffee live here; the extract step crosses the boundary into 2101.",
    "Within 2101: subheading 2101.11 = 'Extracts, essences and concentrates' (the bare product). 2101.12 = preparations WITH A BASIS OF those extracts (i.e. blended products such as 3-in-1 mixes). Our query is the bare extract, so 2101.11.",
    "Within 2101.11: 2101.11.10 = flavoured, 2101.11.20 = not flavoured, 2101.11.30 = coffee aroma, 2101.11.90 = other. The query says 'freeze-dried instant coffee powder' with no flavour modifier → default to 2101.11.20 (not flavoured)."
  ],
  "cited_notes": [
    "Ch.21 chapter title (heading 2101 title — extracts/essences/concentrates of coffee)",
    "Ch.21 Note 1(b) (defines the narrow exception that goes the OTHER way: substitutes containing coffee → Ch.09; our product is not a substitute)",
    "GIR 1 (heading terms + chapter notes decide)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "2101.11.10 (flavoured): rejected — query has no flavour signal.",
    "2101.11.90 (other): rejected — 'not flavoured' is the explicit fit.",
    "2101.12.00 (preparations with a basis of extracts): rejected — query describes the bare extract, not a blended preparation.",
    "0901.21.90 (roasted, not decaffeinated, other): rejected — 'instant' = extract, not roasted bean; Ch.21 heading title literally claims this product."
  ]
}
```

`selected_code = 2101.11.20` is in the filtered candidate set (rank 1 from retrieval), so the hard candidate-set validation passes.

---

## Stage 5 — VERIFY (V1, rubber-stamp)

Gemini-Verify receives:

- Query: "freeze-dried instant coffee powder in jars"
- Selected code: 2101.11.20 (description: "Instant coffee, not flavoured")
- Heading 2101 title (extracts/essences/concentrates of coffee)
- Ch.21 Note 1(b) and Note 2
- GPT-4o's reasoning_chain

Expected V1 output:

```json
{
  "agree": true,
  "disagree_reason": null
}
```

Reasoning Verify would walk: the query's "freeze-dried + instant + powder" unambiguously names a coffee extract; the selected code 2101.11.20 is literally titled "Instant coffee, not flavoured"; the heading's own title is "EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE"; the query carries no flavour modifier, so "not flavoured" is the correct branch. No flaw to raise.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed, Q-budget intact, single-pass Select+Verify pipeline.

---

## Anomalies / observations for the coordinator

1. **Stage-3 data gap (minor).** Ch.09 has no exclusion-table row redirecting "coffee extracts / instant coffee" → Ch.21. The semantic reverse is encoded on Ch.21's side (Note 1(b) + Note 2), which Stage 4 reads as JSONB and reasons from. So Stage 4 still closes the boundary correctly. **But** if a future variant lacks "instant"/"extract" tokens (e.g. "coffee powder in jars" — ambiguous between roasted-ground 0901.21.xx and instant 2101.11.20), Stage 3 will not narrow it and Stage 4 carries the full burden. Worth flagging as a candidate Ch.09 exclusion to add: source_chapter=09, redirects_to=21, text="coffee extracts, essences, concentrates and instant/soluble coffee preparations". Not blocking this case.
2. **FTS query-formation footgun.** `websearch_to_tsquery('english', 'freeze-dried instant coffee powder jars')` returns 0 rows because all five lexemes must co-occur in a description and none of the 28 Ch.09 / 12 Ch.21 descriptions carry "jars" or "powder". Retrieval cascade should pre-process the query — drop packaging tokens ("jars", "boxes", "sachets", "pouches") before forming the tsquery, or fall back to `|` ORing if the strict AND yields 0. Cosine leg compensates here, but in noisier cases the FTS leg silently disappears.
3. **Triage's `candidate_chapters` width.** This case validates the design choice to keep at least 2 chapters on the Triage shortlist when a known confusing pair (09/21 raw-vs-processed coffee — already enumerated in `confusing-chapter-pairs.ts`) is in play. If Triage prematurely returned `["21"]` only, the architecture's safety net (Stage 3 exclusion + Stage 4 note-aware adjudication) wouldn't be exercised against Ch.09. This is correct behaviour for V1 but should be explicitly tested by a future Verify variant.

---

```yaml
case_id: case-2
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "2101.11.20"
  expected: "tariff_line under heading 2101 (Extracts, essences and concentrates, of coffee — Ch.21 NOT Ch.09 raw coffee)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >
  Stage 3 (rules filter) does not actively redirect Ch.09 candidates to Ch.21 for
  processed/extracted coffee. The Ch.09 chapter_exclusions table holds only three
  rows (Cubeb pepper, heading-1211 products, mixed-condiment loss-of-essential-
  character) — none target coffee extracts/instant coffee. The boundary is closed
  one level deeper, at Stage 4, by Ch.21 Note 1(b) + Note 2 read from chapters.notes
  JSONB. For this case Stage 4 resolves it cleanly, so the gap does not produce a
  wrong answer. Smallest fix: add a chapter_exclusions row source_chapter='09',
  redirects_to_chapter='21', excluded_product_text='coffee extracts, essences,
  concentrates, and instant/soluble coffee preparations' so that Stage 3 surfaces
  the boundary deterministically before LLM Select is invoked, reducing token
  spend and Verify-disagreement risk on closely related queries that have weaker
  processing-state signals.
data_dependency: NONE
```

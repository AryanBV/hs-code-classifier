# Case 3 V1 — "fibre cement boards for construction"

- **case_id:** case-3
- **variant:** V1 (rubber-stamp Verify)
- **query:** `"fibre cement boards for construction"`
- **expected:** tariff_line under heading **6811** ("Articles of asbestos-cement, of cellulose fibre-cement or the like")
- **failure_class:** raw-vs-article boundary (Ch.25 raw cement -> Ch.68 articles of cement)
- **legal hinge:** Ch.25 Note 1 — Ch.25 covers only products "in the crude state ... but not products that have been ... obtained by mixing or subjected to processing beyond that mentioned in each heading". Fibre cement boards are MIXED (cement + cellulose fibre) and FORMED (sheets/panels) -> excluded from Ch.25 -> articles of cement go to Ch.68, and the *most specific* heading for cellulose-fibre-cement is **6811**, not the more generic 6810 ("Articles of cement, of concrete or of artificial stone") nor 6808 (which covers boards of *wood/vegetable fibre* agglomerated with cement, i.e. organic-fibre boards, not Hardie-style cellulose-fibre-cement).

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected JSON from the Triage call:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "fibre cement (cellulose fibre + Portland cement composite)",
    "form": "boards / sheets / panels",
    "function": "construction wall / ceiling cladding / siding",
    "intended_use": "building construction",
    "processing_state": "manufactured article (mixed binder + reinforcing fibre, formed and cured)",
    "composition": "Portland cement + cellulose fibres + silica + water (industry standard: ~5-10% cellulose fibre as reinforcement in a Portland-cement matrix; modern boards are asbestos-free)"
  },
  "candidate_chapters": ["68", "25", "44"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:

- **Why CLASSIFY (not ASK):** the query is short but **legally unambiguous in form**. "Boards" is a discrete article, not a raw material — the raw-vs-article axis is resolved. The only residual ambiguity is *which Ch.68 heading* (6808 vs 6810 vs 6811), and that is a Stage 4 Select problem, not a Stage 1 user-clarification problem. Asking the SME exporter "what is your fibre cement board's binder composition?" buys nothing the data can't answer — most "fibre cement board" in commerce is the cellulose-fibre + Portland-cement composite (Hardie/Eternit type). Triage should not pay a Q-budget round on Stage-4 disambiguation.
- **Why candidate chapters [68, 25, 44]:** Ch.68 is the primary target (articles of cement). Ch.25 is included as the *false-positive trap* this case is designed to probe — the word "cement" lexically hits 2523, and the cascade must demonstrate it gets correctly suppressed by Ch.25 Note 1. Ch.44 is included as a weaker third candidate because "boards" + "construction" lexically overlaps with wood-based building boards (Ch.44 particleboard / fibreboard headings 4410-4411) — and 6808 sits at the cement-bound *wood/vegetable*-fibre boundary, so Ch.44 nearness should be on the radar.
- **Why no clarifying question:** product is a known commercial article with a dedicated heading (6811). The Phase 3 design treats single-heading-target queries as CLASSIFY even when terse, *provided* the Notes-aware Select stage can pick between sibling headings. This is the test case for that capability.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

The cascade is run with $query = "fibre cement boards for construction" embedded via Cohere embed-v4 `input_type=search_query`. The vector itself isn't executed here (no live Cohere call from the trace harness), but the deterministic legs — title FTS over headings/tariff_lines — are executed against the real DB and shown below. These set the floor for what semantic retrieval *must* surface to be correct; Cohere on top of that floor is gravy.

### Stage 2.1 — chapter retrieval (top-N expected)

Expected semantic top-10 chapters for "fibre cement boards for construction":

| rank | chapter | title | rationale |
|---:|:--:|---|---|
| 1 | 68 | Articles of stone, plaster, cement, asbestos, mica or similar materials | Direct title match: "cement" + "articles" |
| 2 | 25 | Salt; Sulphur; Earths and stone; Plastering materials, lime and cement | "cement" lexical match — the trap |
| 3 | 44 | Wood and articles of wood | "boards" + "construction" strong embedding signal |
| 4 | 69 | Ceramic products | "construction" + "boards" -> tiles |
| 5 | 70 | Glass and glassware | construction-material adjacency |
| 6 | 38 | Miscellaneous chemical products | mineral binder adjacency |
| 7 | 39 | Plastics | construction-board adjacency |
| 8 | 73 | Articles of iron or steel | construction-material adjacency |
| 9 | 48 | Paper / paperboard | "boards" hit |
| 10 | 28 | Inorganic chemicals | binder adjacency |

Union with Stage-1 candidate_chapters ["68","25","44"] -> cascade Stage 2.2 operates on this set.

### Stage 2.2 — heading retrieval, filtered to candidate chapters

Real FTS evidence (executed against headings.title with `to_tsquery('english', 'fibre & cement')`):

```sql
SELECT heading, title FROM headings
WHERE to_tsvector('english', title) @@ to_tsquery('english', 'fibre & cement')
ORDER BY heading;
```

| heading | title |
|---|---|
| 6808 | Panels, boards, tiles, blocks and similar articles of vegetable fibre, of straw or of shavings, chips, particles, sawdust or other waste, of wood, agglomerated with cement, plaster or other mineral binders. |
| 6811 | Articles of asbestos-cement, of cellulose fibre-cement or the like. |

**Both legitimate hits.** A semantic cascade would additionally surface 6810 ("Articles of cement, of concrete or of artificial stone") on the embedding leg even though it doesn't FTS-match `fibre & cement`, and 2523 ("Portland cement ...") on the lexical `cement` leg. So expected top-15 within candidate chapters {68, 25, 44}:

| rank | heading | chapter | gist |
|---:|:--:|:--:|---|
| 1 | 6811 | 68 | cellulose fibre-cement articles -> **target** |
| 2 | 6808 | 68 | wood/vegetable fibre agglomerated with cement -> trap A |
| 3 | 6810 | 68 | articles of cement / concrete / artificial stone -> trap B (less specific than 6811) |
| 4 | 2523 | 25 | Portland cement raw -> trap C (raw vs article) |
| 5 | 4410 | 44 | Particle board, oriented strand board, similar -> trap D (wood boards) |
| 6 | 4411 | 44 | Fibreboard of wood (MDF/HDF) -> trap E ("fibreboard" lexical) |
| 7 | 6809 | 68 | Articles of plaster |
| 8 | 6806 | 68 | Slag/rock wool / mineral insulating materials |
| 9 | 4412 | 44 | Plywood, veneered panels |
| 10 | 6815 | 68 | Articles of stone or other mineral substances NES |
| 11 | 6807 | 68 | Articles of asphalt |
| 12 | 4413 | 44 | Densified wood |
| 13 | 6804 | 68 | Millstones, grindstones |
| 14 | 6801 | 68 | Setts, curbstones, flagstones |
| 15 | 2517 | 25 | Pebbles, gravel, broken or crushed stone |

### Stage 2.3 — subheading retrieval, filtered to top-15 headings

Real query against 6811 subheadings:

```sql
SELECT subheading, heading, title, india_specific, wco_2022_match
FROM subheadings WHERE heading = '6811' ORDER BY subheading;
```

| subheading | title | india_specific |
|---|---|:---:|
| 6811.40 | Containing asbestos | false |
| 6811.81 | Not containing asbestos : -- Corrugated sheets | false |
| 6811.82 | Not containing asbestos : -- Other sheets, panels, tiles and similar articles | false |
| 6811.89 | Not containing asbestos : -- Other articles | false |

Plus from sibling headings: 6808 has no subheadings of its own beyond 6808.00 (single 6-digit), 6810 has 6810.11/19/91/99, 4411 has 4411.12/14 etc. Expected top-20 subheading set thus includes:

- **6811.82** (primary target — "other sheets, panels, tiles")
- 6811.81 (corrugated sheets — also fits if board is corrugated; user didn't specify)
- 6811.89 (other articles fallback)
- 6811.40 (asbestos variant — should be ranked down by modern-product prior; asbestos boards are import-banned in India and most jurisdictions)
- 6810.11, 6810.19, 6810.91, 6810.99 (concrete articles — generic cement, less specific)
- 4411.13, 4411.14, 4411.92 (wood fibreboard — different material)
- 4410.11 / 4410.12 (particle board)
- 2523.29 (portland cement — raw, NOT an article)

### Stage 2.4 — tariff_line retrieval (cosine UNION heading-fallback)

Real FTS evidence over tariff_lines:

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ to_tsquery('english', 'fibre | cement | board')
ORDER BY ts_rank(...) DESC LIMIT 30;
```

Top FTS hits (executed live):

| rank | code | description |
|---:|---|---|
| 1 | **6808.00.00** | Panels, boards, tiles, blocks and similar articles of vegetable fibre, of straw or of shavings, chips, particles, sawdust or other waste, of wood, agglomerated with cement, plaster or other mineral binders. |
| 2 | 8479.30.00 | Presses for the manufacture of particle board or fibre building board ... |
| 3 | 4419.90.10 | Bread boards, chopping boards and similar boards |
| 4 | 6815.11.00 | Carbon fibres; articles of carbon fibres for non-electrical uses ... |
| 5 | 6815.13.00 | Other articles of carbon fibres |
| 6 | 4419.11.00 | Of bamboo: Bread boards, chopping boards |
| ... | ... | ... |
| 11 | 2523.21.00 | Portland cement: White cement |
| 14 | 3006.40.00 | Dental cements |
| 17 | 4410.11.20 | Insulation board and hard board |

**Critical observation:** **the lexical FTS leg surfaces 6808.00.00 at rank 1 but does NOT surface 6811.82.00 at all in the top-30.** Reason: 6811.82.00's stored description is `"Not containing asbestos : -- Other sheets, panels, tiles and similar articles"` — it contains neither "fibre" nor "cement" because the description text is subheading-inherited, not heading-inherited. The words "cellulose fibre-cement" live ONLY at the heading title level (6811.title).

This is a **retrieval-asymmetry hazard**: a pure-FTS pipeline would never find 6811.82.00 from this query. The Phase 3 cascade design saves itself because:

1. **Cascade Stage 2.2 retrieves the heading 6811 by title-FTS / title-embedding** (heading.title contains "cellulose fibre-cement").
2. **Cascade Stage 2.3 then retrieves 6811's subheadings filtered-by-heading-membership**, surfacing 6811.82 by structural FK traversal, not by description match.
3. **Cascade Stage 2.4 then retrieves tariff_lines under 6811.82 / 6811.81 / 6811.89 by FK traversal** (the "heading-membership fallback" leg the prompt spec calls out for empty/short subheading titles — same pattern as the 454 empty-title-subheadings edge case).

Without the FK-traversal fallback, the cascade would blackhole 6811.82.00 entirely. With it, expected retrieval candidate set (post-cascade UNION FTS, pre-rerank, top-30 or so):

| source | code | gist |
|---|---|---|
| cascade-FK | 6811.82.00 | target |
| cascade-FK | 6811.81.00 | corrugated sheets (asbestos-free) |
| cascade-FK | 6811.89.10 | tubes/pipes/fittings (asbestos-free) |
| cascade-FK | 6811.89.90 | other (asbestos-free) |
| cascade-FK | 6811.40.10 | asbestos sheets |
| cascade-FK | 6811.40.20 | asbestos tiles |
| cascade-FK | 6811.40.90 | asbestos other |
| cascade-FK + FTS | 6808.00.00 | vegetable-fibre cement-bound board — trap A |
| cascade-FK | 6810.91.00 | prefabricated structural components of concrete |
| cascade-FK | 6810.99.90 | other articles of concrete |
| cascade-FK | 4411.12.00 | MDF wood fibreboard <5mm — trap E |
| cascade-FK | 4410.11.20 | particle board insulation/hardboard — trap D |
| FTS | 2523.29.10 | ordinary portland cement dry — trap C (raw) |
| FTS | 2523.21.00 | white portland cement — trap C |

After **Cohere Rerank 4 Fast** on this set with cross-encoder query = "fibre cement boards for construction", expected top-5:

| rank | code | rerank rationale |
|---:|---|---|
| 1 | **6811.82.00** | exact match: cellulose-fibre cement + sheets/panels + non-asbestos |
| 2 | 6808.00.00 | strong but materially wrong (vegetable fibre, not cellulose-fibre-cement composite) |
| 3 | 6811.81.00 | corrugated sheets variant — user didn't specify corrugated |
| 4 | 6810.99.90 | "other articles of concrete" — generic Ch.68 fallback |
| 5 | 4411.12.00 | wood MDF fibreboard — material mismatch |

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Executed against the real DB:

```sql
SELECT id, source_chapter, excluded_product_text, redirects_to_chapter,
       redirects_to_heading, source_note_number
FROM chapter_exclusions
WHERE source_chapter IN ('25', '68')
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'fibre cement boards for construction');
```

Result: **0 rows.** The FTS-over-`excluded_product_text` leg does not fire because Ch.25's exclusion rules cover specific items (setts, curbstones, slates, mosaic cubes) not the generic "articles of cement". Ch.25's gatekeeper for fibre cement boards is **Note 1** (the "crude state / no mixing" rule), which is structurally a chapter-note text, not a chapter_exclusion row.

For completeness, broader scan of Ch.25 exclusions redirecting to Ch.68:

```sql
SELECT id, excluded_product_text, redirects_to_heading, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '25' AND redirects_to_chapter = '68';
```

| id | excluded_product_text | -> heading | source |
|---:|---|---|---|
| 1656 | setts, curbstones and flagstones | 6801 | Note 2(f) |
| 1657 | mosaic cubes or the like | 6802 | Note 2(f) |
| 1658 | roofing, facing or damp course slates | 6803 | Note 2(f) |
| 1666 | expanded clays of heading 6806 ... | 6806 | Heading 2508 exclusion |

None target "boards" or "fibre cement". **This is a data-coverage gap:** Ch.25 Note 1's "no mixing / no processing beyond ..." principle isn't translated into a chapter_exclusion row, so the FTS rules-filter is no help for this case. The Select stage has to do the legal reasoning from the Note 1 *text* injected as context.

**Rules-filter output:** candidate set unchanged. No drops, no redirects.

`gap_class` candidate: **RULES_GAP** — a chapter_exclusion row with `excluded_product_text = "articles obtained by mixing cement with fibres or other materials"`, `redirects_to_chapter = '68'`, `source_note_number = 'Note 1'`, derived from Ch.25 Note 1, would let the FTS leg catch this case deterministically. Not currently present.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o receives the filtered candidate set (Rerank top-5 from Stage 2 + any exclusion redirects from Stage 3, none here), plus injected JSONB notes:

**Notes injected:**

- Ch.25 Note 1 (the critical legal gatekeeper, verified live from `chapters` table):
  > "Except where their context or Note 4 to this Chapter otherwise requires, the headings of this Chapter cover only products which are in the crude state or which have been washed ... crushed, ground, powdered ... but **not products that have been roasted, calcined, obtained by mixing or subjected to processing beyond that mentioned in each heading**."
- Ch.68 Note 1(a): "This Chapter does not cover: (a) goods of Chapter 25 ..." (reciprocal exclusion — confirms the symmetry: 25 is for raw, 68 for articles).
- Heading titles for 6808 / 6810 / 6811 (only inter-sibling discriminator at this level).
- GIR 1 (classification by heading text + section/chapter notes) and GIR 3(a) (most specific description preferred over more general).

**Expected GPT-4o output:**

```json
{
  "selected_code": "6811.82.00",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "Query 'fibre cement boards' is an article (a formed sheet product), not a raw mineral. Ch.25 Note 1 explicitly excludes 'products that have been ... obtained by mixing or subjected to processing beyond that mentioned in each heading' — fibre cement boards are mixed (cement + cellulose fibre) and formed (sheets), so 2523 is excluded.",
    "Ch.68 Note 1(a) confirms reciprocally that Ch.68 covers manufactured articles of these mineral substances. Of Ch.68 headings, three are candidates: 6808 (vegetable/wood-fibre boards agglomerated with cement), 6810 (articles of cement/concrete/artificial stone, no fibre reinforcement specified), 6811 (articles of asbestos-cement OR cellulose-fibre-cement or the like).",
    "By GIR 3(a) — most specific description — 'fibre cement boards' (industry term for cellulose-fibre + Portland-cement composite, Hardie/Eternit/Everest type) matches 6811's heading text ('cellulose fibre-cement or the like') more specifically than 6810 (generic cement articles, no fibre reference) or 6808 (which is specifically wood/vegetable fibre, not cellulose-fibre-cement composites). 6811 wins on specificity.",
    "Within 6811, since modern fibre cement boards are asbestos-free (asbestos boards are import-banned in India and most jurisdictions since the 2010s), the asbestos-free branch 6811.81/82/89 applies. 6811.81 is 'corrugated sheets' (user didn't say corrugated). 6811.89 is 'other articles' (catch-all). 6811.82 'Other sheets, panels, tiles and similar articles' is the most specific match for 'boards' = flat panels."
  ],
  "cited_notes": [
    "Chapter 25 Note 1 (exclusion of mixed/processed mineral products)",
    "Chapter 68 Note 1(a) (reciprocal exclusion of Ch.25 goods)",
    "GIR 1 (heading text controls)",
    "GIR 3(a) (most specific description)"
  ],
  "alternatives_considered": [
    {"code": "6808.00.00", "rejected_because": "6808 is specifically for boards of *vegetable* fibre / wood / straw agglomerated with cement; cellulose fibre cement boards are not a vegetable-fibre-dominant article — the cellulose component is reinforcement (~5-10%), the bulk material is Portland cement, putting the article squarely in 6811's 'cellulose fibre-cement' phrasing."},
    {"code": "6810.99.90", "rejected_because": "6810 covers articles of cement/concrete/artificial stone without fibre reinforcement specification; 6811 is more specific by GIR 3(a) because it explicitly addresses cellulose-fibre-cement composites."},
    {"code": "6811.81.00", "rejected_because": "limited to corrugated sheets; query 'boards' implies flat panels not corrugated."},
    {"code": "2523.29.10", "rejected_because": "2523 is raw Portland cement powder, explicitly excluded by Ch.25 Note 1 once the cement has been mixed with fibre and formed into an article."},
    {"code": "4411.12.00", "rejected_because": "Ch.44 fibreboard is wood-based MDF/HDF, not cement-based; material composition mismatch."}
  ]
}
```

---

## Stage 5 — VERIFY (V1 — rubber-stamp Gemini)

V1 protocol: Gemini sees `{query, selected_code=6811.82.00, heading_title=6811, chapter_25_note_1, chapter_68_note_1a}` and is asked "do you agree?"

Expected output:

```json
{
  "agree": true,
  "disagree_reason": null,
  "supporting_observations": [
    "Heading 6811 title 'cellulose fibre-cement' is a near-verbatim match for 'fibre cement'.",
    "Ch.25 Note 1 excludes mixed/processed products, ruling out 2523.",
    "Subheading 6811.82 'Other sheets, panels, tiles and similar articles' (non-asbestos) is the right sibling under 6811 for board-form non-corrugated articles."
  ]
}
```

V1 has **known rubber-stamp risk:** Gemini in V1 mode only sees the *winning* candidate + supporting notes, so it never gets to evaluate 6808 as the true competitor. If GPT-4o had wrongly picked 6808.00.00, V1 would also wave through with the same agreement pattern ("'panels, boards ... agglomerated with cement' matches 'fibre cement boards'"). V1 catches *blatant* contradictions (e.g. GPT-4o picks 2523 despite Note 1) but doesn't catch *plausible-but-wrong-sibling* errors. The case-3-V2 dispatch will probe whether independent retrieval catches the 6808-vs-6811 sibling trap.

For *this* trace, GPT-4o picked correctly (6811.82.00) so V1 agrees and there's no real Verify stress applied.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed, no Q-budget exhaustion, no flagged ambiguity. Skip.

---

## Anomaly notes for the coordinator

1. **Retrieval asymmetry (RETRIEVAL_GAP-adjacent):** the target tariff_line 6811.82.00 has description text `"Not containing asbestos : -- Other sheets, panels, tiles and similar articles"` — neither the word "fibre" nor "cement" appears. The discriminating vocabulary lives ONLY in the heading title (6811: "Articles of asbestos-cement, of cellulose fibre-cement or the like"). A flat tariff_line FTS or flat tariff_line cosine retrieval would NEVER surface 6811.82.00 from this query. The Phase 3 cascade survives only because Stage 2.3/2.4 do FK-membership traversal from heading -> subheading -> tariff_line. **If the rerank training data weighted subheading/tariff_line description heavily, 6808.00.00 would beat 6811.82.00 on text-match.** Mitigation: at indexing time, concatenate `heading.title || subheading.title || tariff_line.description` into the tariff_line embedding payload so the heading-level vocabulary (cellulose fibre-cement, asbestos-cement) propagates down. The current 1536-dim Cohere embeddings on tariff_lines may already do this — should be verified by the orchestrator before Phase 4 build.

2. **Rules-filter gap (RULES_GAP):** Ch.25 Note 1's "no mixing / no processing beyond ..." principle is the single most important legal lever for this whole class of "raw vs article" cases (and adjacent ones: raw plaster -> articles of plaster Ch.6809, raw asphalt -> articles of asphalt Ch.6807, raw mica -> mica articles, etc.). It is not currently encoded as a chapter_exclusion row. Adding it (with `redirects_to_chapter` = '68' for cement, '68' for plaster, etc., or a generic "see Chapter 68" when the article is of mineral substance) would let the FTS rules-filter catch raw-vs-article boundary cases deterministically without needing the LLM to do the legal reasoning. This is a high-value, low-effort data fix for Phase 2g.

3. **Trap discrimination strength:** the case relies on GPT-4o reading "of vegetable fibre, of straw or of shavings ..." in 6808 vs "of cellulose fibre-cement or the like" in 6811 and correctly resolving that cellulose-fibre-cement boards are *cement-matrix with fibre reinforcement* (-> 6811) not *vegetable-fibre-matrix bound with cement* (-> 6808). This is a real and subtle distinction that an under-prompted LLM could miss. Phase 4 build should include this specific contrast in the Select stage's few-shot prompt.

---

```yaml
case_id: case-3
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6811.82.00"
  expected: tariff_line under heading 6811
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >
  Ch.25 Note 1's "no mixing / no processing beyond what's mentioned in each heading"
  is the legal hinge for raw-vs-article boundary cases (cement, plaster, asphalt,
  mica, etc.) but is not currently encoded as a chapter_exclusion row. The FTS
  rules-filter therefore can't deterministically drop Ch.25 candidates when the
  query describes a manufactured article of a mineral substance — the LLM Select
  stage has to do all the legal reasoning. Fix: derive chapter_exclusion rows from
  Ch.25 Note 1 (one per article-type pattern: "articles obtained by mixing cement
  ... -> Ch.68"; "articles obtained by mixing plaster ... -> Ch.68"; etc.) so the
  programmatic filter handles this class. Low-effort, high-value Phase 2g patch.
  Secondary observation (not the primary gap): retrieval asymmetry — 6811.82.00's
  description text doesn't contain "fibre" or "cement", so the cascade depends on
  FK-traversal from heading rather than tariff_line text match. The current
  architecture handles this correctly via Stage 2.4's heading-membership fallback;
  no fix needed but worth verifying in Phase 4.
data_dependency: >
  Tariff_line 6811.82.00 description text inherits only from its subheading title
  ("Not containing asbestos: Other sheets, panels, tiles and similar articles")
  and does not include the discriminating vocabulary ("cellulose fibre-cement")
  which lives at heading 6811.title level. Retrieval correctness depends on the
  embedding payload including heading.title concatenation, or on the cascade
  using FK-traversal from heading to surface this tariff_line. Confirmed safe
  under the proposed Phase 3 cascade design.
```

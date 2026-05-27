# O5 — Extraction Log

**Date:** 2026-05-26
**Curator:** Claude Opus 4.7 (build-time, via Claude Max subscription)
**Inputs consulted:**
- `backend/src/data/confusing-chapter-pairs.ts` (legacy — 11 pairs encoded; prompt scoped to 8)
- `backend/docs/sub-specs/01-verifier-rules.md` (DSL semantics + `tariff_line_attributes` schema)
- `backend/docs/sub-specs/02-qgs-and-backtrack.md` §A.7 (question_templates contract — `discriminating_attribute` must be a key from `tariff_line_attributes`)
- `backend/docs/sub-specs/04-dsl-audit.md` (O2 schema expansion — numeric composition, fabric_construction, made_up, chemical_class, intended_role, predominant_element)
- `backend/docs/ARCHITECTURE.md` §6 (Verifier — how discriminators feed mechanical predicate evaluation)
- Supabase MCP: live read of `chapters.notes` for chapters 09, 21, 29, 30, 39, 40, 42, 43, 52, 54, 55, 61, 62, 72, 80, 84, 85, 87
- Supabase MCP: live read of `sections.notes` for sections XVI, XVII
- Supabase MCP: live read of `chapter_exclusions` rows matching the 8 pair combinations

---

## Pairs documented
All 8 prompt-specified pairs:
1. Ch.42 vs Ch.43 (leather vs fur) — strongest: `material` (HIGH)
2. Ch.09 vs Ch.21 (raw vs instant coffee) — strongest: `processing_state` (HIGH)
3. Ch.61 vs Ch.62 (knitted vs woven) — strongest: `fabric_construction` (HIGH)
4. Ch.72 vs Ch.80 (steel vs tin) — strongest: `predominant_element` (HIGH)
5. Ch.42 vs Ch.62 (leather vs textile apparel) — strongest: `material` (HIGH) + `composite_components` for mixed
6. Ch.54 vs Ch.55 (filament vs staple) — strongest: `form` (HIGH)
7. Ch.84 vs Ch.87 (machinery vs vehicles) — strongest: `intended_use` (HIGH)
8. Ch.29 vs Ch.30 (API vs pharma formulation) — strongest: `processing_state` (HIGH)

**Total worked examples produced:** 42 (Pair 1: 5; Pair 2: 5; Pair 3: 6; Pair 4: 5; Pair 5: 6; Pair 6: 6; Pair 7: 6; Pair 8: 6 — wait, recount: 5+5+6+5+6+6+6+6 = 45). Actual: 45.

**No structural gap in attribute schema** — every pair has at least one HIGH-confidence discriminator using existing keys.

---

## Pairs where discrimination was harder than expected

### Ch.84 vs Ch.87 (machinery vs vehicles)
**Difficulty:** Highest in the set. Not a substance/composition discriminator — uses `intended_use` (functional/contextual). The 'solely or principally with vehicles' test in Section XVII Note 3 is inherently interpretive. Many sub-cases revert from Ch.87 back to Ch.84 via specific carve-outs:
- Vehicle engines → Ch.84 (Section XVII Note 2(e))
- Bearings, valves, transmission shafts (8482, 8481, 8483) → Ch.84 even when vehicle-destined
- BUT vehicle radiators → Ch.87 (8708.91), reversing the usual machinery routing

**Recommendation for O3:** Two-step question_template for `intended_use`:
1. First filter on "is this article SPECIFICALLY designed for / commonly described as for use with motor vehicles?"
2. If yes, a second drill-down by part type ("body/chassis/suspension/braking" → Ch.87; "engine/transmission shaft/bearing/valve" → Ch.84; "radiator" → Ch.87 exception).

This pair will benefit from a curated **per-part-type list** rather than a single open question.

### Ch.29 vs Ch.30 (bulk API vs formulation)
**Difficulty:** Medium-high. The `processing_state` discriminator works for canonical cases (powder vs tablet), but Ch.29 Note 1's seven sub-cases (1(a) through 1(h)) admit several edge forms into Ch.29 (e.g. compounds in water, with stabilisers, with anti-dust/colour, diluted azo intermediates). The `solution_purpose` attribute (per O2 — `safety_transport | specific_use | none`) is critical to disambiguate solutions: same liquid product can be Ch.29 (safety_transport) or Ch.30 (specific_use).

**Recommendation for O3:**
- `processing_state` question_template needs option labels that explicitly call out "in water for transport ONLY" vs "in water as a finished medicament solution".
- A separate dedicated `solution_purpose` template should exist for query strings mentioning "solution", "in water", "dissolved".

### Ch.42 vs Ch.62 (leather vs textile apparel)
**Difficulty:** Medium. Easy when material is unambiguous. Hard when product is composite (leather + textile in same garment). The discriminator needs to evaluate `composite_components` JSONB and compute essential character — this is GIR-3(b) territory, not a simple lookup.

**Recommendation for O3:**
- Material question_template should include a "primarily leather" / "primarily textile" / "mixed materials" three-option layout.
- The "mixed" option should ROUTE TO TIEBREAK (Layer 6) rather than CLASSIFY, because GIR-3(b) needs Pro-tier reasoning.

### Ch.54 vs Ch.55 (filament vs staple)
**Difficulty:** Medium. `form` is the canonical discriminator BUT SME query language often uses "fibre" colloquially for both. The 2m tow-length threshold (Ch.55 Note 1) is a numeric boundary that won't be in the query string in most cases — Triage needs to ASK.

**Recommendation for O3:**
- form question_template specifically: "Is this a CONTINUOUS strand (e.g. yarn that runs unbroken on a bobbin) or a CUT/SHORT fibre (e.g. cut to 38mm for spinning into staple yarn)?"
- For tow products specifically, add a sub-question about tow length (>2m vs ≤2m) — this is one of the rare numeric thresholds explicit in chapter notes.

---

## Pairs where discrimination was cleaner than expected

### Ch.61 vs Ch.62 (knit vs woven)
The exemplar binary discriminator. `fabric_construction` enum (`knitted | crocheted | woven | wadding | other`) cleanly resolves the pair except for the heading 6212 carve-out — and that carve-out is encoded as a single `chapter_exclusion` row (id 2059). The mechanical verifier can check the carve-out deterministically.

### Ch.72 vs Ch.80 (steel vs tin)
`predominant_element` cleanly splits the pair (Fe vs Sn). The only confusion is trade-name confusion ('tinplate' = Ch.72, not Ch.80) which is a Layer 0 input normalisation concern, not a discriminator gap.

### Ch.42 vs Ch.43 (leather vs fur)
`material` cleanly splits. The only complexity is composite fur-lined leather garments, which Ch.42 Note 2(b) already encodes deterministically via `chapter_exclusions` 1849/2995. Mechanical verifier handles it.

---

## Recommendations for O3 (question_templates curation)

Priority ranking — which attributes need question_templates MOST URGENTLY:

### TIER 1 (must-have at launch — high-frequency confusable)
1. **`fabric_construction`** — discriminates Ch.61 vs Ch.62 (high query volume in apparel). Single binary enum question. Easy.
2. **`material`** — discriminates Ch.42 vs Ch.43, Ch.42 vs Ch.62, and indirectly partitions ~30 other chapter routings. Needs CURATED option list per chapter scope (leather vs fur, cotton vs polyester, etc.).
3. **`processing_state`** — discriminates Ch.09 vs Ch.21, Ch.29 vs Ch.30 (and likely 25 vs others for minerals). Needs per-product-family option lists.
4. **`form`** — discriminates Ch.54 vs Ch.55 (and many metal pairs). Granular enum: filament/staple/bulk/sheet/foil/granule/etc.

### TIER 2 (needed within first 50 cases)
5. **`intended_use`** — critical for Ch.84 vs Ch.87 (vehicle parts). Curated per Section XVII scope (vehicle-specific list).
6. **`predominant_element`** — Ch.72 vs Ch.80 + likely Ch.73-Ch.81 metal pairs. Numeric or enum on metal symbol.
7. **`composite_components`** — Ch.42 vs Ch.62 mixed, Ch.61 vs Ch.62 wadded. Routes to TIEBREAK rather than direct ASK.

### TIER 3 (Phase 4.4 calibration)
8. **`solution_purpose`** — Ch.29 vs Ch.30 solution sub-case (Note 1(e) carve-out). Rare but blocking when it appears.
9. **`chemical_class`** — Ch.29 vs Ch.30 (confirms separate-compound eligibility).
10. **`fabric_construction = 'wadding'`** — narrow Ch.61/62 wadding exception.

---

## Schema attributes USED in this analysis (all already exist in `tariff_line_attributes`)

From sub-spec 01 base schema:
- `material` (text[])
- `form` (text[])
- `function_` (text[])
- `intended_use` (text[])
- `processing_state` (text[])
- `composition` (text[])
- `composite_components` (jsonb)

From sub-spec 04 expansions (already migrated per `list_tables` 2026-05-26):
- `fabric_construction` (enum: knitted | crocheted | woven | wadding | other)
- `made_up` (boolean)
- `predominant_element` (text)
- `chemical_class` (enum: separate_organic_compound | isomer_mixture | sugar_derivative | diazonium_salt | other)
- `in_solution` (boolean)
- `solution_purpose` (enum: safety_transport | specific_use | none)
- `intended_role` (enum: packaging | support | technical_use | implant | optical_element | other)

**No new attribute keys were invented.** Every discriminating_attribute referenced in `confusing-pairs.json` maps to an existing column or array-element domain in `tariff_line_attributes`.

---

## Notes for the implementer

1. **Pair 5 (Ch.42 vs Ch.62) and Pair 1 (Ch.42 vs Ch.43) are coupled** — a leather + fur garment routes Ch.43 (Pair 1 carve-out) regardless of how Pair 5's logic would otherwise classify it. Tiebreak must check pairs in priority order: Ch.43 carve-out FIRST, then Ch.42 vs Ch.62.

2. **Pair 7 (Ch.84 vs Ch.87) has the highest carve-out density** — at least 5 `chapter_exclusions` rows (2424-2428) encode sub-rules that revert vehicle-destined parts back to Ch.84 or Ch.85. The mechanical verifier should evaluate ALL matching exclusions before accepting an 87xx code.

3. **Pair 8 (Ch.29 vs Ch.30)** — Ch.29 Note 1's seven admission carve-outs are the trickiest legal text in HS. Strongly recommend a dedicated unit test set that exercises each Note 1 sub-clause (a) through (h).

4. **Cohere rerank may NOT preserve the discrimination** — at the retrieval layer, "polyester staple fiber" and "polyester filament yarn" embed close together. The QGS question_template + Verifier are what enforce Pair 6 (Ch.54 vs Ch.55) correctness, NOT rerank. Don't expect retrieval-only ablation tests to expose this confusion.

5. **The legacy `confusing-chapter-pairs.ts` had 11 pairs** (the prompt scoped to 8). The 3 additional legacy pairs (84/85 mech vs electrical, 39/40 plastic vs rubber, 52/55 cotton vs man-made staple) are NOT documented here but are reasonable Tier-2 candidates for a follow-up round of O5 — schema attributes already exist to support them. Recommend a Phase 4.4 expansion to cover them once eval data shows them as live failure modes.

### Approach

Extraction proceeds chapter-by-chapter (01..98) plus 9 section notes plus 3 subheading + 2 heading non-trivial notes. Each note is decomposed into one or more predicate-DSL claims.

### Vocabulary used (drawn from `tariff_line_attributes` per sub-spec 04)

- `material[]` — text array. Includes specific materials (e.g., 'fish', 'cocoa', 'mammals', 'silk', 'horsehair', 'asbestos').
- `form[]` — physical form ('powder', 'granule', 'sheet', 'flake', 'pellet', 'wire', 'tube', 'rod', 'bar').
- `function_[]` — primary function ('seed_for_sowing', 'medicament', 'fertilizer', 'paint', 'jewellery').
- `intended_use[]` — purpose ('ornamental', 'pharmaceutical', 'cosmetic', 'human_consumption', 'animal_feed', 'sowing', 'broom_brush_making').
- `processing_state[]` — ('live', 'dried', 'roasted', 'milled', 'hulled', 'fresh', 'chilled', 'frozen', 'ground', 'prepared', 'preserved').
- `composition[]` — secondary material flags ('with_added_sugar', 'with_chocolate', 'with_fruit').

Numeric/typed columns:
- `carbon_pct`, `chromium_pct`, … `iron_pct`, `predominant_element` (Ch.71-83 metals)
- `sieve_pass_pct_1mm`, `sieve_pass_pct_5mm` (Ch.72)
- `made_up`, `fabric_construction` (textiles)
- `electrically_warmed`, `wearable`, `electrically_heated` (Ch.85)
- `chemical_class`, `in_solution`, `solution_purpose` (Ch.27/29)
- `intended_role` (Ch.90)

Reserved candidate-context vars (sub-spec 04 extension):
- `candidate.chapter`, `candidate.heading`, `candidate.subheading`, `candidate.section`

### Patterns observed

1. **"This chapter does not cover X (heading YYYY)"** → emit one EXCLUSION claim per lettered sub-clause, with `redirects_to.heading=['YYYY']`. Predicate: `{op:'EXISTS', var:'<material/form/etc.>'}`. Three-valued evaluator means if `material` field absent for a tariff_line, predicate SKIPs — Verifier handles gracefully. We emit the strongest single-variable EXISTS predicate based on the excluded-product-text.
2. **"In this Chapter the expression X means …"** → DEFINITION claim. Predicate generally describes the precondition for being called X.
3. **"Heading XYZA applies to …"** or **"covers …"** → INCLUSION claim, but typically already implied by the heading title. We extract these where there's an actionable constraint (e.g., minimum/maximum composition, specific subclasses).
4. **Numeric thresholds (Ch.04 butter, Ch.11 starch %, Ch.72 chromium, Ch.78 lead)** → use `>=`/`<=` predicates against typed columns.
5. **Carve-out "other than those of heading YYYY"** → use `candidate.heading` in an OR clause per sub-spec 04 extension.
6. **Purposive/intent clauses** ("intended for", "suitable for use") that resist mechanical attributization → emit SKIP-marker predicate `{op:'EXISTS', var:'__SKIP_PURPOSIVE__'}` with `extraction_confidence='LOW'` and note in extraction_notes.

### DSL gaps surfaced (beyond sub-spec 04)

- **"Mixtures classified as if consisting wholly of predominant element"** (e.g., Section XI Note 2, Section XV Note 5): handled by pushing `predominant_element` to O2 (per sub-spec 04), no new operator. Predicates check `predominant_element == 'X'`.
- **"Goods classifiable in HEADING X by reason of … are classified in HEADING X and no other heading"** (e.g., Section VI Note 1 priority rules): emitted as REDIRECT claim with `applies_to` covering the source chapters. The verifier evaluates redirect post-classification.
- **Compositional/numeric exclusions where O2 data may not yet be extracted** (e.g., lead 99.9% purity, starch content): we emit the predicate; verifier SKIPs if column NULL.
- **"Provided that the resulting product retains the essential character of X"** — pure purposive. Emit `__SKIP_PURPOSIVE__`.
- **"Subject to … paragraphs above"** scoping conditions: we encode the substantive part; the "subject to" qualifier is captured in claim_text for human auditing, not the predicate.

### Source ref format

- Chapter notes: `chapters.notes:chapter=NN:notes[I].text` (I = 0-based index)
- Section notes: `sections.notes:section=ROMAN:notes[I].text`
- Heading notes: `headings.notes:heading=NNNN:notes[I].text`
- Subheading notes: `subheadings.notes:subheading=NNNN.NN:notes[I].text`

### Chapter coverage decisions

- 8 chapters have zero notes in DB: **02, 41, 50, 52, 75, 78, 80, 81** (verified via SQL). These contribute zero claims.
- 89 chapters with notes processed.
- 9 sections with non-empty notes processed (Sections I, II, IV, VI, VII, XI, XV, XVI, XVII).
- 5 leaf notes (2 headings: 2204, 6212; 3 subheadings: 5209.42, 5211.42, 7801.10).

### Hard chapters (high-density rule-laden)

- **Ch.27** (mineral fuels) — many chemical-class definitions, several purposive
- **Ch.29** (organic chemicals) — separate chemically defined compound carve-outs; many SKIP-purposive
- **Ch.30, Ch.38** (chemicals/pharma) — composition thresholds
- **Ch.39** (plastics) — primary form definitions
- **Ch.61, 62** (apparel) — knitted/woven separation; Ch.62 carve-out for 6212 (uses candidate.heading)
- **Ch.71** (precious metals) — alloy classification rules
- **Ch.72-73** (iron/steel) — heavy numeric composition tables
- **Ch.84, 85** (machinery) — parts-of-machines rules, function-based classification
- **Ch.87** (vehicles) — parts of vehicles vs parts of general use
- **Ch.90** (instruments) — extremely purposive; many SKIP markers
- **Ch.94** (furniture) — composite classification rules

### Conservative-extraction principle

When the DSL cannot cleanly express a clause (e.g., "the principal function determines the heading" — that's a rule, not a per-tariff-line predicate), we emit a `__SKIP_*__` marker predicate so the verifier safely SKIPs and we preserve `claim_text` for human review. We do NOT invent new DSL operators.

### Spec inconsistency discovered

The `source_ref` regex in `01-verifier-rules.md` (`^[a-z_]+:[a-z_]+=[\w.]+(:[\w\[\].]+)?$`) DOES NOT match the example shown in the same spec table: `chapters.notes:chapter=72:notes[0].text`. The regex's first capture group `[a-z_]+` rejects the `.` in `chapters.notes`. All 253 emitted claims follow the example format (`<table.column>:<key>=<val>:<json_path>`), not the regex. The ingest step or the regex needs to be reconciled — I recommend updating the regex to `^[a-z_.]+:[a-z_]+=[\w.]+(:[\w\[\].]+)?$` to match the example. Filed as a sub-spec finding; not a claim-quality issue.

### DSL gaps surfaced beyond sub-spec 04

Numeric fields used in extraction that are NOT in current O2 schema (DSL-gap-deferred-to-O2). Verifier SKIPs harmlessly until O2 ships them:
- `milkfat_pct`, `meat_seafood_pct` (Ch.04, 16, 18, 19)
- `cocoa_pct_defatted`, `dry_weight_pct`, `alcoholic_strength_pct`, `acid_concentration_pct` (Ch.19, 20, 22)
- `starch_pct`, `ash_pct`, `reducing_sugar_pct` (Ch.11, 35)
- `cross_section_mm`, `thickness_mm`, `width_mm`, `weight_kg`, `weight_gsm` (Ch.40, 48, 73, 85, 91)
- `wood_fibre_pct`, `chemical_pulp_pct`, `insoluble_fraction_pct` (Ch.47, 48)
- `precious_metal_pct`, `zinc_pct` (Ch.71, 79)
- `firing_temperature_c`, `co2_pressure_bar`, `max_side_cm`, `tow_length_m` (Ch.69, 22, 62, 55)

Recommendation: when O2 ships, evaluate whether these specific Ch.04/11/19/20/22/47/48/71/79/91 numeric fields warrant inclusion. Many are highly specific (e.g., `firing_temperature_c` for Ch.69 alone). For now, the verifier SKIP policy means no false failures.

`chemical_class` enum should include `'separate_inorganic_compound'` (used in Ch.28 Note 1) — currently only `separate_organic_compound`, `isomer_mixture`, `sugar_derivative`, `diazonium_salt`, `other`. Add `separate_inorganic_compound` to the enum in `db/types.ts`.

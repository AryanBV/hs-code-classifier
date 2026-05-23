# Case 14 — V1 — multi-turn "filter" → Q1 "engine" → Q2 "diesel truck"

- **Case ID:** case-14
- **Variant:** V1 (rubber-stamp Verify)
- **Query (multi-turn):**
  - Turn 1 user input: `filter`
  - Q1 (Triage ASK): "For what application?" → user answers **"engine"**
  - Q2 (Triage still ASK): "What kind of engine?" → user answers **"diesel truck"**
  - Turn 3 user input (Triage now CLASSIFY): `filter — engine — diesel truck` (Triage carries `previousAnswers`)
- **Expected:** tariff_line under heading **8421** (Centrifuges; filtering or purifying machinery and apparatus, for liquids or gases) — specifically the diesel/oil filter line. Most likely terminal: **8421.23.00** ("Oil or petrol-filters for internal combustion engines") with **8421.31.00** ("Intake air filters for internal combustion engines") a co-equal contender pending one more disambiguator that the Q-budget cannot afford.
- **Failure class:** multi-Q-budget cycle with `previousAnswers` — full Triage→ASK→ASK→CLASSIFY pathway

This trace exercises the **Q-budget=2** state machine. The architectural test is not which exact tariff_line is picked at the end (a single product can map to up to four 8421 lines: 8421.23 oil, 8421.31 intake air, 8421.32 exhaust particulate, 8421.39.90 "other") — it is whether the multi-turn loop carries `previousAnswers` correctly, refines `candidate_chapters` across turns, exhausts the Q-budget without going around forever, and lands inside the correct heading (8421) rather than the legacy-bug trap of routing "diesel truck part" to Ch.87/8708.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

The Triage stage runs three times in this case: turn-1 with no `previousAnswers`, turn-2 with `previousAnswers = {q1: "engine"}`, turn-3 with `previousAnswers = {q1: "engine", q2: "diesel truck"}`. Each invocation re-runs attribute extraction and re-decides decision/candidate_chapters/clarifying_question against the **augmented** query.

### Turn 1 — query = `filter`, previousAnswers = {} → ASK Q1

**Attribute extraction:**
- `material` — UNKNOWN (paper? sintered metal? activated carbon? ceramic? cloth?)
- `form` — "filter" (article form, but the word covers everything from a cigarette tip to a 40-litre water-filter jar)
- `function` — "filtering / separating" (the only reliable signal in this query)
- `intended_use` — UNKNOWN (water? air? oil? engine? cigarette? camera lens? optical?)
- `processing_state` — N/A
- `composition` — UNKNOWN

**Completeness score: ~0.18** (only `function` and a generic `form` are present). Far below the 0.50 threshold.

**Why CLASSIFY is impossible at turn 1:** the FTS evidence below (Stage 2 turn-1) shows "filter" hits in **at least 9 distinct chapters**: 24 (filter cigarettes), 48 (filter paper), 59 (filter cloth), 63 (face masks), 69 (ceramic filter candle, water filter), 84 (filtering machinery — many sub-codes), 90 (optical filters 9002.20, breathing filters 9020), and several others. No GIR can short-circuit this — GIR 1 requires the headings to "describe" the goods, and "filter" alone is described by too many headings.

**Why ASK and not REFUSE:** "filter" is a real noun for real goods; the problem is breadth, not phantom. REFUSE is reserved for queries with no plausible HS landing (e.g., moon rocks case-13).

**Triage's first task: ask the highest-information-gain question.** The biggest disambiguating axis is `intended_use` (which slices the candidate_chapters most aggressively). `material` is second-best but multiple chapters serve the same materials (paper filter goes to either Ch.48 or Ch.84 depending on use). So Q1 = "For what application?" is correct.

**Expected Triage JSON (turn 1):**

```json
{
  "decision": "ASK",
  "extracted_attributes": {
    "material": null,
    "form": "filter",
    "function": "filtering / separating",
    "intended_use": null,
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84", "48", "69", "59", "90"],
  "clarifying_question": {
    "text": "What is this filter used for? (the application determines the HS chapter)",
    "options": [
      { "id": "engine",       "label": "For an engine (motor vehicle, generator, industrial engine, etc.)" },
      { "id": "water",        "label": "For water purification (household, industrial, drinking)" },
      { "id": "air_room",     "label": "For air purification (room air purifier, HVAC, dust collector)" },
      { "id": "industrial",   "label": "For industrial liquid/gas processing (chemical, refining, beverage)" },
      { "id": "optical",      "label": "Optical filter (camera, lens, scientific instrument)" },
      { "id": "other",        "label": "Other / not sure" }
    ]
  },
  "refusal_reason": null,
  "q_budget_remaining": 1
}
```

### Turn 2 — query = `filter`, previousAnswers = {q1: "engine"} → STILL ASK (Q2)

The augmented query Triage sees on turn 2 is essentially `filter for an engine`. Attribute extraction now updates:

- `intended_use` = "engine"
- everything else still UNKNOWN

This collapses candidate_chapters dramatically. "Engine filter" is still ambiguous between at least four 8421 tariff_lines (oil 8421.23, intake air 8421.31, exhaust particulate 8421.32, "other" 8421.39) and is also a legacy-bug magnet for Ch.87 (motor-vehicle parts) or Ch.84/8409 (engine parts proper). The pipeline must:

1. Recognise that Section XVI Note 2(a) (cited in Stage 4) sends any *filter* article — even one identifiable as a part of a diesel motor — to heading **8421** because **filters are themselves goods of heading 8421**. So Ch.87/8708 and Ch.84/8409 are eliminated *as chapters* even though "engine for diesel truck" sounds like Ch.87. This is the critical decision Triage must encode in `candidate_chapters` for turn 2.
2. Still need to pick *which* 8421 subheading. The 4 candidates inside 8421 split on the filtered medium: oil/petrol (8421.23) vs intake-air (8421.31) vs exhaust (8421.32) vs other (8421.39). A single Q1 answer "engine" cannot resolve which.

So Q2 must ask the medium/position axis. The most natural framing in domain language is "what kind of engine filter is it?" — but a user who typed only "filter" almost certainly cannot answer that with confidence. A more user-friendly Q2 phrasing surfaces the disambiguator obliquely via the engine type ("diesel truck" implies the most-frequent on-engine filter set is fuel/oil + intake-air; gasoline car has cabin-air filters too).

Note that the **prompt-supplied Q2 text** is "what kind of engine?" with the user answering "diesel truck". We trace that branch exactly:

**Expected Triage JSON (turn 2):**

```json
{
  "decision": "ASK",
  "extracted_attributes": {
    "material": null,
    "form": "filter",
    "function": "filtering / separating",
    "intended_use": "engine (unspecified type)",
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84"],
  "clarifying_question": {
    "text": "What kind of engine? (different engine types use different filter sub-codes)",
    "options": [
      { "id": "diesel_truck",     "label": "Diesel — heavy vehicle (truck, bus, construction equipment)" },
      { "id": "diesel_other",     "label": "Diesel — other (generator, marine, stationary)" },
      { "id": "petrol_car",       "label": "Petrol / gasoline — passenger car or motorcycle" },
      { "id": "aircraft",         "label": "Aircraft engine" },
      { "id": "industrial_other", "label": "Industrial / other engine (gas turbine, etc.)" }
    ]
  },
  "refusal_reason": null,
  "q_budget_remaining": 0
}
```

Two key observations on turn 2:

1. **`candidate_chapters` collapses from 5 chapters to 1 (Ch.84)** between turn 1 and turn 2. This is exactly the `previousAnswers`-driven refinement the architecture promises. Each ASK answer should monotonically shrink the candidate space.
2. **`q_budget_remaining` decrements 1 → 0.** After turn 2 the pipeline MUST commit (CLASSIFY) or REFUSE on turn 3 regardless of remaining ambiguity. No third question allowed.

### Turn 3 — query = `filter`, previousAnswers = {q1: "engine", q2: "diesel truck"} → CLASSIFY

The augmented query is now effectively `diesel truck engine filter`. Attribute extraction at turn 3:

- `material` — still UNKNOWN (paper element, sintered, etc.)
- `form` — "filter"
- `function` — "filtering"
- `intended_use` — "diesel truck engine" (heavy commercial vehicle internal combustion engine)
- `processing_state` — N/A
- `composition` — UNKNOWN

**Completeness score: ~0.55**. Above the CLASSIFY threshold (legacy was 0.50; Phase 3 Triage uses LLM judgment but the heuristic is similar).

**Why CLASSIFY now and not a third ASK:** the Q-budget is exhausted. The pipeline either commits or refuses. With three independent confirmations all pointing to 8421 (Triage's `candidate_chapters = ["84"]`, retrieval cascade's top tariff_lines all in 8421.2x/8421.3x, and the FTS top hits being exactly 8421.23.00 and 8421.31.00 — see Stage 2), commitment is correct. The residual ambiguity is *within* the heading (oil-filter vs intake-air-filter vs particulate-filter), which Select-LLM resolves on heading-internal evidence.

**Why not REFUSE:** Triage has high confidence in the chapter and heading even though the exact tariff_line is uncertain. REFUSE on heading-internal ambiguity would be over-refusal — the architecture explicitly delegates 6-digit-to-8-digit selection to Select-LLM under GIR 6.

**Expected Triage JSON (turn 3):**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "filter",
    "function": "filtering / separating",
    "intended_use": "diesel truck engine (heavy commercial vehicle ICE)",
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84"],
  "clarifying_question": null,
  "refusal_reason": null,
  "q_budget_remaining": 0,
  "previousAnswers_carried": { "q1": "engine", "q2": "diesel truck" }
}
```

`candidate_chapters` of length 1 (["84"]) is what Stage 2 will hand to its UNION with the cosine top-10 chapters.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

Retrieval runs only on turn 3 (when Triage decides CLASSIFY). Turns 1 and 2 short-circuit at Triage-ASK. The retrieval query text is the augmented form `filter — engine — diesel truck` (or equivalent natural-language concatenation; the exact templating is a Phase 4 implementation choice but the embeddable text is what matters for cosine).

### 2.1 — Chapter retrieval (cosine top-10, real cascade target)

Per the spec, the retrieval cascade *also* runs a chapter-level cosine sort `SELECT chapter FROM chapters ORDER BY embedding <=> $query LIMIT 10`. We cannot literally execute Cohere search-query embedding for the trace, but we can confirm via FTS / description-text evidence which chapters genuinely surface "engine filter" content. The FTS proxy is the strictest evidence available:

```sql
SELECT code, description
FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'engine filter')
LIMIT 20;
```

Real result:

| code | description |
|---|---|
| 8421.23.00 | Filtering or purifying machinery and apparatus for liquids : -- Oil or petrol-filters for internal combustion engines |
| 8421.31.00 | Filtering or purifying machinery and apparatus for gases : -- Intake air filters for internal combustion engines |

Only **two** tariff_lines in the entire ITC-HS schedule literally describe an "engine filter", and both are in heading **8421**, subheadings 8421.23 (liquid filter — oil/petrol) and 8421.31 (gas filter — intake air). The cosine top-10 chapter list, conditioned on the augmented query, will dependably contain "84" near the top — possibly with adjacent chapters 87 (motor-vehicle parts), 38 (chemical scavengers / treatments), 39 (plastic filter housings), 73 (steel filter housings) as noise.

**For trace purposes assume cosine top-10 chapters (turn 3):** `["84", "87", "39", "48", "73", "59", "69", "90", "70", "63"]`.

UNION with `candidate_chapters = ["84"]` from Stage 1 → effective chapter set for Stage 2.2 = `{84, 87, 39, 48, 73, 59, 69, 90, 70, 63}`.

### 2.2 — Heading retrieval (cosine top-15, filtered to chapter set)

```sql
SELECT heading, title FROM headings
WHERE chapter = ANY(ARRAY['84','87','39','48','73','59','69','90','70','63'])
ORDER BY embedding <=> $query LIMIT 15;
```

Not executed (no Cohere query embedding). Expected top hits (by description fit to "engine filter") with real titles fetched from the DB:

| heading | title |
|---|---|
| 8421 | Centrifuges, including centrifugal dryers; filtering or purifying machinery and apparatus, for liquids or gases. |
| 8409 | Parts suitable for use solely or principally with the engines of [headings 8407 or 8408 — i.e., spark-ignition and compression-ignition internal-combustion piston engines] |
| 8708 | Parts and accessories of the motor vehicles of headings 87.01 to 87.05. |
| 8431 | Parts suitable for use solely or principally with the machinery of headings 84.25 to 84.30. |

The cosine score order will almost certainly rank 8421 first (because it explicitly names "filter" and "internal combustion engines"), with 8409, 8708, 8431 as plausible-but-wrong neighbours. The trap to suppress: 8409 ("parts of internal combustion engines") and 8708 ("parts and accessories of motor vehicles") *seem* to fit "diesel truck engine filter" semantically — but Section XVI Note 2(a) (cited in Stage 4) forces the article to its named heading, 8421, *before* either of these parts-headings can apply.

### 2.3 — Subheading retrieval (cosine top-20)

```sql
SELECT subheading, title FROM subheadings WHERE LEFT(subheading,4) = '8421' ORDER BY subheading;
```

Real result (executed):

| subheading | title |
|---|---|
| 8421.11 | (empty — split via tariff_lines: cream separators) |
| 8421.12 | (empty — clothes-dryers) |
| 8421.19 | Centrifuges, including centrifugal dryers : -- Other |
| 8421.21 | Filtering or purifying machinery and apparatus for liquids : -- For filtering or purifying water |
| 8421.22 | (empty — beverage filters) |
| **8421.23** | (empty — oil/petrol filters for ICE) |
| 8421.29 | (empty — other liquid filters) |
| **8421.31** | (empty — intake air filters for ICE) |
| 8421.32 | (empty — catalytic converters / particulate exhaust filters) |
| 8421.39 | Filtering or purifying machinery and apparatus for gases : -- Other |
| 8421.91 | (empty — parts of centrifuges) |
| 8421.99 | (empty — parts other) |

Note the **empty-subheading-title phenomenon** here. 8421.23 and 8421.31 — the two we care about — both have empty `title` fields in the `subheadings` table because the WCO convention is that the heading text "covers" them. This is exactly the case the Phase 3 spec calls out: "454 empty-title subheadings exist; cascade 2.4 unions tariff_line cosine on subheading-membership AND heading-membership so empty-title subheadings don't blackhole their tariff_lines." Without that UNION, 8421.23.00 and 8421.31.00 could be filtered out of the candidate set when the subheading-level cosine sees an empty-title row scoring near zero. **This is a structural retrieval gap that Stage 2.4's heading-membership UNION fallback is designed to close.**

### 2.4 — Tariff_line retrieval (UNION of subheading-filter + heading-filter)

Subheading-filter leg (top-20 cosine, filtered to subheadings retrieved in 2.3):

```sql
SELECT code, description FROM tariff_lines
WHERE LEFT(code,4) = '8421'
ORDER BY embedding <=> $query LIMIT 20;
```

All 23 tariff_lines under heading 8421 (real result, executed):

| code | description | export_policy |
|---|---|---|
| 8421.11.00 | Centrifuges, including centrifugal dryers : -- Cream separators | Free |
| 8421.12.00 | Centrifuges, including centrifugal dryers : -- Clothes-dryers | Free |
| 8421.19.10 | Bowl centrifuges | Free |
| 8421.19.20 | Basket centrifuges | Free |
| 8421.19.30 | Continuous automatic centrifuges | Free |
| 8421.19.40 | Self cleaning centrifuges | Free |
| 8421.19.50 | Decanter centrifuges horizontal bowl | Free |
| 8421.19.60 | Screw conveyor centrifuges | Free |
| 8421.19.91 | other ----For chemical industries | Free |
| 8421.19.99 | other ----Other | Free |
| 8421.21.10 | Ion exchanger plant or apparatus | Free |
| 8421.21.20 | Household type filters | Free |
| 8421.21.90 | Other | Free |
| 8421.22.00 | Filtering or purifying machinery and apparatus for liquids : -- For filtering or purifying beverages other than water | Free |
| **8421.23.00** | Filtering or purifying machinery and apparatus for liquids : -- Oil or petrol-filters for internal combustion engines | Free |
| 8421.29.00 | Filtering or purifying machinery and apparatus for liquids : -- Other | Free |
| **8421.31.00** | Filtering or purifying machinery and apparatus for gases : -- Intake air filters for internal combustion engines | Free |
| 8421.32.00 | Catalytic converters or particulate filters, whether or not combined, for purifying or filtering exhaust gases from internal | Free |
| 8421.39.10 | Air separators to be employed in the processing, smelting or refining of minerals, ores or metals; air strippers | Free |
| 8421.39.20 | Air purifiers or cleaners | Free |
| 8421.39.90 | Other | Free |
| 8421.91.00 | Parts : -- Of centrifuges, including centrifugal dryers | Free |
| 8421.99.00 | Parts : -- Other | Free |

Heading-filter leg (top-20 cosine, broader fallback to recover empty-title-subheading tariff_lines):

Same query without the LEFT(code,4)='8421' restriction — would surface 8421.23.00 and 8421.31.00 even more reliably because the heading-level embedding of 8421 should rank highest for the augmented query.

### 2.f — Postgres FTS leg (parallel, non-cascading)

```sql
SELECT code FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'engine filter')
LIMIT 30;
```

Real result (executed): `[8421.23.00, 8421.31.00]` — exactly two hits, both in heading 8421.

A weaker FTS query on the bare turn-1 word `filter` returns 20+ hits across 9 chapters (executed and shown in turn-1 Stage-2 footprint below) — proving the disambiguation work the Q1/Q2 cycle did.

### 2.g — Rerank (Cohere Rerank 4 Fast)

The UNION of cosine top-30 ∪ FTS top-30 candidates is fed to Rerank 4 Fast with the augmented query `filter — engine — diesel truck`. The expected top-5 reranked set:

| rank | code | why |
|---|---|---|
| 1 | 8421.23.00 | "Oil or petrol-filters for internal combustion engines" — direct verbal match to query intent (fuel/oil filter is the most-replaced consumable on a diesel truck) |
| 2 | 8421.31.00 | "Intake air filters for internal combustion engines" — equally direct match; diesel trucks also use heavy-duty intake-air filters |
| 3 | 8421.32.00 | "Catalytic converters or particulate filters … for purifying exhaust gases from internal combustion engines" — applies if "filter" means DPF (diesel particulate filter); plausible but less likely from bare "diesel truck filter" |
| 4 | 8421.39.90 | "Other" gas filter — sink |
| 5 | 8421.29.00 | "Other" liquid filter — sink |

### Stage-2 turn-1 footprint (for completeness, to show the breadth ASK is solving)

The bare `filter` FTS returns:

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'filter')
LIMIT 30;
```

Real result (executed) — 20 rows spanning 9 chapters: 2402 (cigarettes), 4805/4812/4823 (filter paper, 4 codes), 5911 (filter cloth), 6307 (face masks), 6909/6911 (ceramic/water filters), 8421 (6 codes), 9002/9020 (optical/breathing). This is empirical proof that bare `filter` cannot be classified — exactly why turn-1 ASK is correct.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Run on turn 3's candidate set against `chapter_exclusions`:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE to_tsvector('english', excluded_product_text) @@ websearch_to_tsquery('english', 'filter');
```

Real result (executed):

| source_chapter | excluded_product_text | redirects_to_chapter | redirects_to_heading |
|---|---|---|---|
| 48 | filter paper or paperboard (including tea-bag paper) or felt paper or paperboard (heading 4802 does not cover these) | (null) | (null) |
| 67 | filtering or straining cloth of human hair | 59 | (null) |
| 95 | Filtering or purifying machinery and apparatus for liquids or gases | **84** | (null) |

The **Ch.95 → Ch.84** redirect is the relevant exclusion rule for this case. It textually mirrors heading 8421's description and directs filtering apparatus *into* Ch.84. No Ch.84 exclusion expels filters. Net effect on the candidate set: no drops, and the rule confirms 8421 as the legal landing for filtering machinery.

Adjacent Ch.87 exclusions worth citing (real result, executed):

| source_chapter | excluded_product_text | redirects_to_chapter | redirects_to_heading |
|---|---|---|---|
| 87 | Machines and apparatus of headings 8401 to 8479, or parts thereof — other than radiators for the articles of this Section | **84** | (null) |
| 87 | Articles of heading 8483 (transmission shafts, cranks, bearing housings, gears, etc.) — when they constitute integral parts of engines and motors | 84 | 8483 |

**The first Ch.87 exclusion is dispositive.** It excludes "machines and apparatus of headings 8401 to 8479" from Ch.87 and redirects to Ch.84. Heading 8421 is in the 8401-8479 range. So even if an LLM at turn-3 hallucinated Ch.87 as a candidate (the "diesel truck part" trap), this rule legally evicts it. The Rules Filter does the work that GIR 1 + Section XVI Note 2 do in the legal text.

**Stage 3 verdict:** filtered_candidates = {8421.23.00, 8421.31.00, 8421.32.00, 8421.39.90, 8421.29.00} (all five from rerank, no drops; Ch.87 not in the set so no eviction needed but the rule is what *would* evict it if the LLM had hallucinated it).

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Input to GPT-4o:
- query: `filter — engine — diesel truck`
- previousAnswers: `{q1: "engine", q2: "diesel truck"}`
- filtered_candidates: `[8421.23.00, 8421.31.00, 8421.32.00, 8421.39.90, 8421.29.00]`
- chapter 84 notes (chapter-level + headings 8421's text)
- Section XVI Note 2 (the parts-classification rule) — load-bearing for this case
- GIR 1 (start with heading terms + chapter notes), GIR 6 (sub-heading selection by analogous principles)

**Cited legal evidence (real DB rows):**

Heading 8421 title (real result): "Centrifuges, including centrifugal dryers; filtering or purifying machinery and apparatus, for liquids or gases."

**Section XVI Note 2(a)** (real DB row, sections.notes for section XVI):
"…parts of machines (not being parts of the articles of heading 8484, 8544, 8545, 8546 or 8547) are to be classified according to the following rules: (a) parts which are goods included in any of the headings of Chapter 84 or 85 (other than headings 8409, 8431, 8448, 8466, 8473, 8487, 8503, 8522, 8529, 8538 and 8548) are in all cases to be classified in their respective headings…"

This is the dispositive rule. A "diesel truck engine filter" is *part of* a diesel engine of heading 8408, which is part of a motor vehicle of headings 8701-8705. By naïve reasoning it could go to 8409 (parts of engines) or 8708 (parts of motor vehicles). Section XVI Note 2(a) **excepts 8409 from "their respective headings" treatment** because 8409 is explicitly listed in the exception clause. The rule says: if the part *is itself goods of any other heading of Ch.84/85*, it goes to that heading. Filters are goods of heading 8421. Therefore filters go to 8421, not 8409 and not 8708. **GIR 1 + Section XVI Note 2(a) deterministically resolve the chapter.**

**Sub-heading selection (GIR 6):** within 8421, the engine-filter subheadings are:
- 8421.23 — oil or petrol-filters for ICE (a *liquid*-filtering subhead, but the medium being filtered is liquid fuel/oil)
- 8421.31 — intake air filters for ICE (a *gas*-filtering subhead, medium = air)
- 8421.32 — catalytic converters / particulate exhaust filters (gas, exhaust position)
- 8421.39 — other gas filters

The bare answer "diesel truck" does not distinguish oil filter from intake-air filter. A diesel truck has *both*. Without Q3 (forbidden by Q-budget), Select-LLM must commit. The most-likely interpretation: when a layperson says "filter for diesel truck engine" they most often mean the **fuel/oil filter** (the most-replaced consumable), not the air filter (replaced less often, less commonly the part referenced by the bare word "filter" in maintenance contexts). Select-LLM's best single pick is **8421.23.00** ("Oil or petrol-filters for internal combustion engines") with HIGH confidence in the heading and MEDIUM confidence in the subheading/tariff_line.

(An alternative defensible pick is 8421.31.00 if Select-LLM interprets "diesel truck filter" as the more iconic chunky air-filter cartridge under the cab. Both picks are tested as CORRECT_CODE because the expected value is "tariff_line under heading 8421" — heading-level correctness is the criterion.)

**Expected GPT-4o output:**

```json
{
  "selected_code": "8421.23.00",
  "reasoning_chain": [
    "Section XVI Note 2(a): parts that are themselves goods of any heading in Ch.84 or 85 (except a listed set including 8409) are classified in their respective heading. Filters are goods of heading 8421. So 8409 and 8708 are excluded as chapters/headings even though the article serves a diesel truck engine.",
    "GIR 1: heading 8421 explicitly covers 'filtering or purifying machinery and apparatus, for liquids or gases'. An engine filter is filtering apparatus for either a liquid (oil/fuel) or a gas (intake air, exhaust).",
    "GIR 6: within 8421, subheading 8421.23 is the named subheading for 'Oil or petrol-filters for internal combustion engines'. The phrase 'diesel truck filter' in layperson maintenance contexts most commonly refers to the fuel/oil filter — the most frequently-replaced filter consumable on a diesel truck.",
    "Subheading 8421.31 (intake air filter) is a co-equal contender. The Q-budget=2 was exhausted before we could ask 'oil/fuel filter or air filter?', so we commit to the more common interpretation."
  ],
  "cited_notes": [
    "Section XVI Note 2(a)",
    "Heading 8421 title",
    "GIR 1",
    "GIR 6",
    "Ch.87 exclusion: 'Machines and apparatus of headings 8401 to 8479, or parts thereof — other than radiators for the articles of this Section' → redirects to 84"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [
    "8421.31.00 (intake air filter for ICE) — equally legal under the same reasoning, lost only on the layperson-interpretation tiebreak. Documented as alternative.",
    "8421.32.00 (catalytic converter / DPF — diesel particulate filter) — applies if 'filter' means DPF specifically; less likely from bare 'filter' but a real diesel-truck product. Documented as alternative.",
    "8409.99.41 (Other parts of diesel engine — for motor vehicles) — REJECTED by Section XVI Note 2(a): 8409 is in the exception list, so parts that are goods of another Ch.84 heading (here: 8421) take that heading.",
    "8708.99 (other parts and accessories of motor vehicles) — REJECTED by Ch.87 exclusion of 'machines and apparatus of headings 8401-8479'."
  ]
}
```

The HIGH-on-heading / MEDIUM-on-tariff_line confidence split is honest: the architecture *knows* the heading is right (multiple independent legal sources confirm 8421) and *knows* the exact tariff_line is a coin-flip between 8421.23 and 8421.31. This is the right calibration — it should propagate to the user as a "we are confident in 8421.23.00 but please confirm whether this is a fuel/oil filter (8421.23) or an air filter (8421.31)" disclaimer.

---

## Stage 5 — VERIFY (V1, rubber-stamp)

V1 = adversarial Gemini-Verify sees:
- query: `filter — engine — diesel truck`
- selected_code: 8421.23.00
- heading 8421 title + Section XVI Note 2(a) text
- Q-budget consumed: 2/2

Question to Verify: "would you agree 8421.23.00 (or a sibling 8421.2x/8421.3x) is the correct landing for a diesel truck engine filter, and that 8409 / 8708 are correctly excluded?"

**Expected V1 output:**

```json
{
  "agree": true,
  "disagree_reason": null
}
```

Rationale: V1 is a low-bar rubber-stamp. The heading-level evidence (8421 explicitly names filters; Section XVI Note 2(a) explicitly evicts 8409 from "their respective heading" status; Ch.87 exclusion expels 8401-8479 machinery from Ch.87) is overwhelming. Verify cannot find a sixth plausible landing for an engine filter. The within-heading ambiguity (oil vs air) is **not** a Verify-stage objection because the Q-budget was the rate-limiter, not a Select-stage failure. Verify agrees.

The one subtle thing V1 *might* flag is the missing material/composition (paper element vs sintered metal vs cellulose) — but material doesn't change the 8421 subheading split, so it's not classification-relevant. V1 lets it through.

**V1 verdict: AGREES. No escalation.**

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed. Pipeline returns 8421.23.00 with MEDIUM-on-tariff_line confidence and the cited alternative (8421.31.00) to the user.

In an alternative reality where Verify *had* disagreed (e.g., Verify insisted on 8421.31.00 instead of 8421.23.00), Deep-Think would NOT be triggered either — the disagreement would be heading-internal and within the architecturally-acknowledged Q-budget-exhaustion ambiguity zone. The escalation policy should be: only trigger Deep-Think when Verify disagrees on **heading or chapter**, not within-heading subheading splits.

---

## Anomalies observed

1. **Empty-subheading-title coverage.** Heading 8421 has 9 of 12 subheadings with empty `title` fields in the `subheadings` table (8421.11, .12, .22, .23, .29, .31, .32, .91, .99). The tariff_line descriptions carry the discriminating text (e.g., 8421.23.00 description = "Filtering … : -- Oil or petrol-filters for internal combustion engines"). Cascade Stage 2.3 cosine on subheading embeddings would score these near-zero on "engine filter" because the embedding text is empty. Stage 2.4's heading-membership-UNION fallback is **load-bearing** for this case — without it, the architecture loses 8421.23.00 between subheading retrieval and tariff_line retrieval. This is the 454-empty-subheading data dependency the Phase 3 spec calls out, materialised concretely.

2. **Q-budget=2 is tight for this case.** Two questions are exactly enough to land in the right heading (Q1: application → engine; Q2: engine type → diesel truck → narrows to Ch.84 → 8421). But two questions are **not** enough to discriminate between 8421.23 (oil/fuel filter) and 8421.31 (intake air filter), both of which are equally common diesel-truck consumables. The architecture must accept residual within-heading ambiguity at exit. Two options: (a) accept and surface to user with a "please confirm" disclaimer (current implicit policy); (b) reserve a *third* "narrow-scope" question for within-heading disambiguation that doesn't count against the cross-chapter Q-budget. Option (b) is a future design consideration. For v1, option (a) is acceptable.

3. **The Q1 "what's the application?" question phrasing is the single highest-information-gain question for ANY broad noun.** Words like "filter", "valve", "pump", "filter cartridge", "bushing", "bearing" all have multiple chapter-level homes and the application is the master switch. Triage prompt design should encode this as a standing pattern: "if the query is a single broad mechanical noun, Q1 = 'what is it used for?'". Worth lifting into a Triage few-shot example or system-prompt section.

4. **Section XVI Note 2(a) is the load-bearing legal rule for this entire family of cases.** Any "part of an engine" or "part of a vehicle" that is also "itself goods of a Ch.84/85 heading" (filters → 8421, pumps → 8413, valves → 8481, bearings → 8482, etc.) falls under this rule. The Select prompt must reliably inject Section XVI Note 2 text whenever the candidate set spans (a part-heading 8409/8431/8448/8466/8473/8503/8522/8529/8538/8548) AND (a named-article heading inside 8401-8424 or 8425-8480). This is the most-cited Section Note in Phase-3-Brain failure analyses; treating it as a first-class injection signal will prevent a large chunk of the legacy bugs.

5. **No `previousAnswers` schema is defined yet in the Phase 3 spec.** The current architecture trace assumes Triage receives `{q1_id: answer_id, q1_label: answer_label}` etc. on subsequent turns. Phase 4 must define this contract precisely — including how Triage augments the query string (concatenation? structured replay in a system message? both?) — because the LLM's behaviour on turn 2 depends entirely on how the prior answer is framed in context. This is a Phase 4 implementation specification gap, not a data gap.

---

## Verdict (YAML)

```yaml
case_id: case-14
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8421.23.00"
  expected: "tariff_line under heading 8421 (most likely 8421.23.00 oil/fuel filter or 8421.31.00 intake air filter)"
path_quality: DIRECT
cost_class: EXPENSIVE
confidence_signal: MEDIUM
gap_class: NONE
gap_description: null
data_dependency: "Heading 8421 has 9 of 12 subheadings with empty title fields. Cascade Stage 2.3 cosine on subheading embeddings would score these near-zero, dropping 8421.23.00 and 8421.31.00 from the subheading-filtered tariff_line retrieval. Stage 2.4's heading-membership-UNION fallback is required to recover them. Without that UNION, this case is a FAR_MISS."
```

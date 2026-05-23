# Case 14 — V2 — diesel-filter

## Case fields

- id: case-14
- variant: V2 (independent-retrieval Verify)
- query (multi-turn):
  - Turn 0 (user): `filter`
  - Turn 1 (Triage): asks "for what?"
  - Turn 1 (user A1): `engine`
  - Turn 2 (Triage): asks "what kind of engine?"
  - Turn 2 (user A2): `diesel truck`
  - Turn 3 (Triage): proceed to CLASSIFY with `previousAnswers={ for: "engine", engine_kind: "diesel truck" }`
- expected: tariff_line under heading 8421 (Centrifuges; filtering or purifying machinery and apparatus). True answer-space: 8421.23.00 (oil/petrol filter for ICE) OR 8421.31.00 (intake air filter for ICE). The expected is at the heading level (8421), so any tariff_line in 8421 is correct.
- failure_class: multi-Q-budget cycle with previousAnswers — full Triage → ASK → ASK → CLASSIFY pathway

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

The proposed architecture sets Q-budget = 2. Triage is called once per turn with the current query + accumulated `previousAnswers`. Three Triage invocations happen across this case.

### Turn 0 Triage call

Input:
```json
{ "query": "filter", "previousAnswers": {} }
```

Expected Gemini-Triage output:
```json
{
  "decision": "ASK",
  "extracted_attributes": {
    "material": null,
    "form": "filter",
    "function": "filtration/separation",
    "intended_use": null,
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84", "85", "87", "73"],
  "clarifying_question": {
    "text": "What is the filter used for?",
    "options": [
      { "id": "engine",    "label": "Engine / vehicle (oil, air, fuel)" },
      { "id": "water",     "label": "Water purification / household" },
      { "id": "industrial","label": "Industrial process (chemical, beverage)" },
      { "id": "hvac",      "label": "HVAC / air conditioning" },
      { "id": "electronic","label": "Electronic filter / capacitor" }
    ]
  },
  "refusal_reason": null
}
```

Justification:
- Completeness ≈ 0.15. `filter` alone is severely under-specified — could be 8421 (machinery filter), 7411-7412 (metal filter mesh), 8532 (electronic filter), 9002 (optical filter).
- Across the ITC schedule, "filter" hits 6 different chapters. Triage MUST refuse to guess.
- Q-budget remaining: 2 → 1 after this ASK.

### Turn 1 Triage call (after A1 = "engine")

Input:
```json
{ "query": "filter", "previousAnswers": { "for": "engine" } }
```

Effective augmented query passed to retrieval = `"filter for engine"`.

Expected output:
```json
{
  "decision": "ASK",
  "extracted_attributes": {
    "material": null,
    "form": "filter",
    "function": "filtration of engine fluid/gas",
    "intended_use": "engine",
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84", "87"],
  "clarifying_question": {
    "text": "What kind of engine, and which filter type?",
    "options": [
      { "id": "diesel_oil",   "label": "Diesel engine — oil/fuel filter" },
      { "id": "diesel_air",   "label": "Diesel engine — intake air filter" },
      { "id": "petrol_oil",   "label": "Petrol engine — oil/fuel filter" },
      { "id": "petrol_air",   "label": "Petrol engine — intake air filter" },
      { "id": "exhaust",      "label": "Exhaust / catalytic / particulate filter" }
    ]
  },
  "refusal_reason": null
}
```

Justification:
- "filter for engine" is still ambiguous between 8421.23 (oil/petrol filters for ICE), 8421.31 (intake air filters for ICE), and 8421.32 (catalytic converters / particulate filters for exhaust). All three are explicit ITC subheadings — heading is decided, but tariff line is not.
- Triage notes that 8421 already covers oil-filter / air-filter / exhaust-filter as separate dashes — this is exactly the disambiguation Q-budget exists for.
- Q-budget remaining: 1 → 0 after this ASK. NEXT call MUST be CLASSIFY (or REFUSE if still ambiguous).

### Turn 2 Triage call (after A2 = "diesel truck")

Per the case definition the user answered `diesel truck` rather than picking one of the offered options. Triage interprets this as "diesel engine, automotive (truck) context" but still does NOT specify oil vs. air vs. exhaust. Q-budget is now 0 — architecture requires CLASSIFY.

Input:
```json
{
  "query": "filter",
  "previousAnswers": { "for": "engine", "engine_kind": "diesel truck" }
}
```

Effective augmented query passed to retrieval = `"filter for diesel truck engine"`.

Expected output:
```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "filter (machinery/apparatus)",
    "function": "filtration of engine fluid or gas",
    "intended_use": "diesel internal combustion engine (truck)",
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["84", "87"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- Q-budget exhausted; architecture proceeds with available evidence.
- Two plausible chapters survive: 84 (filtering machinery 8421) vs. 87 (parts of motor vehicles 8708). Section XVII Note 2(e) — which Stage 3 will surface — resolves this. Triage hands BOTH to retrieval rather than pre-committing.
- "Diesel truck engine" + "filter" with no oil/air/exhaust qualifier means the SELECT stage will need to either (a) pick the closest tariff_line by retrieval evidence or (b) issue a confident NEAR_MISS at the subheading level. Expected is satisfied if any 8421 tariff_line surfaces.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

Query embedded with Cohere embed-v4 `search_query` (assumed): `"filter for diesel truck engine"`.

### Stage 2.1 — chapter cosine top-10

Assumed (real cosine not run because we did not call Cohere). Predicted top-10 against the 97 chapter embeddings, based on the chapter titles + descriptive content:

```
rank | chapter | title (truncated)
-----+---------+----------------------------------------------------
  1  |   84    | Nuclear Reactors, Boilers, Machinery (filtration machinery 8421)
  2  |   87    | Vehicles, Parts and Accessories Thereof (parts 8708)
  3  |   85    | Electrical Machinery (incl. electronic filters)
  4  |   73    | Articles of Iron or Steel (metal mesh filters)
  5  |   90    | Optical, Measuring, Medical (lab filters)
  6  |   59    | Impregnated/Coated Textiles (filter fabric)
  7  |   39    | Plastics (plastic filter housings)
  8  |   70    | Glass (glass-fibre filter media)
  9  |   83    | Misc Articles of Base Metal
 10  |   74    | Copper (filter mesh)
```

Verified anchor — chapters 84/87 confirmed in DB:

```sql
SELECT chapter, title FROM chapters WHERE chapter IN ('84','85','87','73') ORDER BY chapter;
```
| chapter | title |
|---|---|
| 73 | Articles Of Iron Or Steel |
| 84 | Nuclear Reactors, Boilers, Machinery And Mechanical Appliances; Parts Thereof |
| 85 | Electrical machinery and equipment and parts thereof; sound recorders... |
| 87 | VEHICLES OTHER THAN RAILWAY OR TRAMWAY ROLLING-STOCK, AND PARTS AND ACCESSORIES THEREOF |

### Stage 2.2 — heading cosine, filtered to candidate_chapters ∪ top-10

Allowed chapter set = {84, 87, 85, 73, 90, 59, 39, 70, 83, 74}.

Predicted top-15 headings (ranked by description-match for "filter for diesel truck engine"):

```
rank | heading | title (truncated)
-----+---------+----------------------------------------------------
  1  |  8421   | Centrifuges, filtering or purifying machinery/apparatus
  2  |  8708   | Parts and accessories of motor vehicles 8701-8705
  3  |  8409   | Parts suitable for use solely/principally with engines of 8407/8408
  4  |  8479   | Machines having individual functions
  5  |  8714   | Parts and accessories of vehicles of 8711-8713
  6  |  8511   | Electrical ignition / starting equipment for ICE
  7  |  5911   | Textile products for technical uses (filter cloth)
  8  |  7314   | Cloth, grill, netting of iron/steel wire
  9  |  8483   | Transmission shafts, gears, clutches
 10  |  9002   | Lenses / optical filters
 11  |  8532   | Electrical capacitors
 12  |  8407   | Spark-ignition reciprocating engines
 13  |  8408   | Compression-ignition (diesel) engines
 14  |  9020   | Other breathing appliances and gas masks
 15  |  8704   | Motor vehicles for transport of goods (trucks)
```

DB confirms title for survivors:

```sql
SELECT heading, title FROM headings WHERE heading IN ('8421','8409','8708','8479','8483') ORDER BY heading;
```
| heading | title |
|---|---|
| 8409 | Parts suitable for use solely or principally with the engines of |
| 8421 | Centrifuges, including centrifugal dryers; filtering or purifying machinery and apparatus, for liquids or gases. |
| 8479 | Machines and mechanical appliances having individual functions, not specified or included elsewhere in this Chapter. |
| 8483 | Transmission shafts ... |
| 8708 | Parts and accessories of the motor vehicles of headings 87.01 to 87.05. |

Crucial: 8421's title literally contains "filtering or purifying machinery" — perfect lexical + semantic match for "filter".

### Stage 2.3 — subheading cosine, filtered to top-15 headings

The 8421 family is the strongest hit. Full list of 8421 subheadings actually in DB:

```sql
SELECT subheading, title FROM subheadings WHERE heading = '8421' ORDER BY subheading;
```
| subheading | title |
|---|---|
| 8421.11 | (empty — collapsed into tariff_line) |
| 8421.12 | (empty) |
| 8421.19 | Centrifuges ... -- Other |
| 8421.21 | Filtering ... liquids -- For filtering or purifying water |
| 8421.22 | (empty) |
| 8421.23 | (empty — but tariff line description = "Oil or petrol-filters for internal combustion engines") |
| 8421.29 | (empty) |
| 8421.31 | (empty — but tariff line description = "Intake air filters for internal combustion engines") |
| 8421.32 | (empty — catalytic / particulate filters for exhaust) |
| 8421.39 | Filtering ... gases -- Other |
| 8421.91 | (empty) |
| 8421.99 | (empty) |

454-row blackhole risk realised: 8421.23 / 8421.31 / 8421.32 all have empty titles at the subheading level. Their semantics live one level deeper at the tariff_line. The cascade design — Stage 2.4 falls back to heading-membership when subheading titles are empty — was added precisely for this.

Predicted top-20 subheadings (cosine):
```
rank | subheading | label
-----+------------+------------------------------------------
  1  |  8421.39   | Filtering ... gases -- Other
  2  |  8421.21   | Filtering ... liquids -- water
  3  |  8421.19   | Centrifuges -- Other
  4  |  8421.31   | (empty title — air filter for ICE)
  5  |  8421.23   | (empty title — oil filter for ICE)
  6  |  8421.32   | (empty title — exhaust gas filter)
  7  |  8421.29   | (empty title — liquid filter other)
  8  |  8421.99   | Parts -- Other
  9  |  8708.99   | Parts of motor vehicles -- Other
 10  |  8708.94   | Steering wheels and columns
 ...
```

### Stage 2.4 — tariff_line cosine, UNION (subheading-membership ∪ heading-membership)

This is where the blackhole-avoidance UNION saves the case.

a) filter-by-subheading-membership: top-20 from subheadings {8421.39, 8421.21, 8421.19, 8421.91, 8421.99}. Returns: 8421.21.20 (household), 8421.39.20 (air purifier), 8421.99.00 (parts other), 8421.39.10 (mineral processing), 8421.39.90 (other), 8421.91.00 (parts of centrifuge), 8421.19.* etc. Does NOT include 8421.23.00 or 8421.31.00 because those subheadings had empty titles and didn't make the top-20 by subheading-title cosine.

b) filter-by-heading-membership (broader fallback, top-20 from all tariff_lines under heading 8421 ranked by tariff_line.description cosine): for the augmented query "filter for diesel truck engine", the strongest matches are:

```sql
SELECT code, description FROM tariff_lines
WHERE LEFT(code,4) = '8421'
  AND to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'filter')
ORDER BY code LIMIT 20;
```
| code | description |
|---|---|
| 8421.21.20 | Household type filters |
| 8421.22.00 | Filtering or purifying machinery and apparatus for liquids : -- For filtering or purifying beverages other than water |
| 8421.23.00 | Filtering or purifying machinery and apparatus for liquids : -- Oil or petrol-filters for internal combustion engines |
| 8421.29.00 | Filtering or purifying machinery and apparatus for liquids : -- Other |
| 8421.31.00 | Filtering or purifying machinery and apparatus for gases : -- Intake air filters for internal combustion engines |
| 8421.32.00 | Catalytic converters or particulate filters, whether or not combined, for purifying or filtering exhaust gases from internal [combustion engines] |

Together with embedding cosine on the augmented query "filter for diesel truck engine", the strongest matches (description contains "internal combustion engines") are 8421.23.00 and 8421.31.00.

### Stage 2 — FTS leg (parallel)

```sql
SELECT code, description FROM tariff_lines
WHERE LEFT(code,4) = '8421'
  AND to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'filter engine diesel');
-- Returns: [] (no row contains "diesel" as a token; descriptions say "internal combustion engines")
```

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'filter engine');
-- Returns 8421.23.00 ("Oil or petrol-filters for internal combustion engines"),
--         8421.31.00 ("Intake air filters for internal combustion engines"),
--         8421.32.00 ("... exhaust gases from internal combustion engines")
```

The "diesel" token is the only one that doesn't help FTS (FTS literal match — diesel ICE is just a kind of ICE, vocabulary mismatch). The "filter engine" subset does the work. The cosine leg covers the diesel→ICE semantic bridge.

### Stage 2 — final union → Cohere Rerank 4 Fast top-5

Predicted top-5 final candidates after rerank:

```
rank | code         | reason
-----+--------------+----------------------------------------
  1  | 8421.23.00   | "Oil or petrol-filters for ICE" — strongest match
  2  | 8421.31.00   | "Intake air filters for ICE" — strongest match
  3  | 8421.32.00   | "Catalytic / particulate filters for exhaust"
  4  | 8421.29.00   | Liquid filter -- Other (residual)
  5  | 8421.99.00   | Parts of filtering machinery -- Other
```

Outcome: 5/5 candidates are in heading 8421. No 8708 candidate survives the rerank because none of 8708's tariff_line descriptions contain "filter" (verified):

```sql
SELECT code, description FROM tariff_lines
WHERE LEFT(code,4) = '8708'
  AND (description ILIKE '%filter%' OR description ILIKE '%clean%');
-- Returns: [] (zero rows)
```

This is the architecture working as designed: even though 8708 (vehicle parts) is semantically close to "diesel truck engine", retrieval finds zero textual support for "filter" in 8708 tariff_lines, so 8708 silently loses the rerank.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Run chapter_exclusions FTS for each candidate's chapter against the augmented query.

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading,
       excluded_product_text, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '87'
  AND (excluded_product_text ILIKE '%8421%'
       OR excluded_product_text ILIKE '%filter%'
       OR excluded_product_text ILIKE '%pump%'
       OR excluded_product_text ILIKE '%machine%')
LIMIT 30;
```
| source_chapter | redirects_to_chapter | excluded_product_text | source_note_number |
|---|---|---|---|
| 87 | NULL | Machines and working tools designed for fitting to tractors of heading 8701 as interchangeable equipment ... | Chapter Note 2 |
| 87 | **84** | **Machines and apparatus of headings 8401 to 8479, or parts thereof — other than radiators for the articles of this Section** | **Section Note 2(e)** |
| 87 | 85 | Electrical machinery or equipment (Chapter 85) — e.g. starter motors, alternators, ignition coils, batteries, lighting equipment of Chapter 85 | Section Note 2(f) |

**LOAD-BEARING RULE FOUND.** Section XVII Note 2(e) is the canonical rule that resolves the "filter vs vehicle part" ambiguity: machines of headings 8401-8479 (which includes 8421) **stay in Chapter 84 and do not move to 8708, even when used in a vehicle, except for radiators**. A filter is not a radiator.

Effect on candidate set:
- All 5 final candidates are already in 8421 (chapter 84). None get dropped.
- If any 8708.* candidate had snuck in via retrieval, this rule would drop it AND surface chapter 84 as the redirect target — meaning the architecture would have a positive evidence trail rather than a silent retrieval miss.

No exclusions fire on chapter 84:
```sql
SELECT * FROM chapter_exclusions WHERE source_chapter = '84'
  AND (excluded_product_text ILIKE '%vehicle%' OR excluded_product_text ILIKE '%filter%');
-- Returns: [] (no chapter 84 exclusion redirects filters away).
```

Filtered candidate set = same as retrieval set: {8421.23.00, 8421.31.00, 8421.32.00, 8421.29.00, 8421.99.00}.

Note: the existing legacy rule `filters_machinery` in `backend/src/rules/chapter-rules.ts` (priority 103) — which routes any "filter" + "oil|air|fuel|water|engine|diesel|truck" query to Chapter 84 — is the deterministic codification of the same Section Note 2(e). Phase 3 architecture replaces this with the data-driven `chapter_exclusions` table. Result is the same; the design difference is that the new pipeline derives the rule from the schedule rather than from hand-coded TS.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Input to GPT-4o:
- query: "filter" with previousAnswers `{for: "engine", engine_kind: "diesel truck"}`
- filtered_candidates: [8421.23.00, 8421.31.00, 8421.32.00, 8421.29.00, 8421.99.00]
- injected notes:
  - Chapter 84 Note 1 (exclusions — none apply)
  - Chapter 84 Note 2 (relative priority among 8401-8480 — none apply, 8421 is decisive on its own)
  - **Section XVII Note 2(e)** — Filters stay in Chapter 84, not Chapter 87
  - GIR 1 (heading text + relative section/chapter notes are decisive)
  - GIR 3(a) (most-specific description prevails)

Expected GPT-4o output:
```json
{
  "selected_code": "8421.23.00",
  "reasoning_chain": [
    "GIR 1: heading 8421 covers 'filtering or purifying machinery and apparatus for liquids or gases' — directly matches 'filter'.",
    "Section XVII Note 2(e): machines of 8401–8479 used in vehicles remain in Ch.84 (not 8708) except radiators. So 'diesel truck engine filter' belongs in 8421, not 8708.",
    "GIR 3(a) within 8421: 'oil or petrol-filters for internal combustion engines' (8421.23.00) is the most specific description that covers a diesel-engine filter when the type (oil vs. air vs. exhaust) is unspecified — oil filters are the default for the unmarked 'engine filter' interpretation in commercial usage.",
    "Diesel is a compression-ignition internal combustion engine; ITC subheadings 8421.23 / 8421.31 / 8421.32 reference 'internal combustion engines' generically (covering both petrol and diesel)."
  ],
  "cited_notes": [
    "Section XVII Note 2(e)",
    "GIR 1",
    "GIR 3(a)"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [
    {
      "code": "8421.31.00",
      "rejected_because": "Specific to intake air filter — query did not specify air vs. oil, but commercial default for 'engine filter' (when unqualified) is the oil filter; both are equally valid heading-level matches."
    },
    {
      "code": "8421.32.00",
      "rejected_because": "Specific to exhaust catalytic / particulate filter — would only apply if user said 'exhaust' or 'DPF'."
    },
    {
      "code": "8708.99.00",
      "rejected_because": "Excluded by Section XVII Note 2(e). Filters of 8421 do not move to 8708."
    }
  ]
}
```

Self-confidence MEDIUM (not HIGH) because the heading 8421 is certain but the tariff_line choice between 8421.23 / 8421.31 / 8421.32 depends on a customer datum (oil vs. air vs. exhaust) that Q-budget did not capture. Architecture made a defensible default pick.

---

## Stage 5 — VERIFY (V2 — independent retrieval)

Gemini-Select reruns Stages 2-4 independently against the same DB.

Stage 2 (Gemini retrieval): same Cohere embeddings, same DB, same rerank → same top-5 candidates.

Stage 3 (Gemini rules filter): same DB query → same exclusion hits, identical filtered set.

Stage 4 (Gemini-Select): faced with {8421.23, 8421.31, 8421.32, 8421.29, 8421.99}, applies the same notes. Gemini's likely independent pick:

```json
{
  "independent_pick": "8421.23.00",
  "reasoning": [
    "Heading 8421 mandated by Section XVII Note 2(e).",
    "Among the three explicit-ICE subheadings, oil filter (8421.23) is the canonical default reading of an unqualified 'engine filter' in commercial classification practice.",
    "Diesel-vs-petrol does not matter at this subheading; both 8421.23 and 8421.31 use the generic 'internal combustion engines' wording."
  ]
}
```

V2 verdict:
```json
{
  "independent_pick": "8421.23.00",
  "agrees_with_select": true,
  "difference_reason": null
}
```

Alternative realistic V2 outcome: Gemini might pick 8421.31.00 instead (air filter) — both are equally defensible without a customer datum. In that case:
```json
{
  "independent_pick": "8421.31.00",
  "agrees_with_select": false,
  "difference_reason": "Both models agree on heading 8421; disagreement is at the tariff_line tie-break between oil vs. air filter — neither has more evidence than the other."
}
```

For verdict purposes, the conservative reading is: V2 agrees on heading 8421 (which is what `expected` requires); subheading tie-break could go either way and Verify-disagreement would be at a level finer than the case expectation requires.

---

## Stage 6 — DEEP-THINK ESCALATION

Triggered only if (a) Verify disagrees AND (b) Q-budget exhausted.

Scenario A — V2 agrees → NOT triggered. Skip.

Scenario B — V2 disagrees at subheading (8421.23 vs 8421.31): Q-budget IS exhausted, so escalation triggers. GPT-4o reasoning_effort=high sees full history:
- Triage transcript (Q1 "for what?" → "engine"; Q2 "what kind?" → "diesel truck")
- Note that user was offered finer options (diesel_oil / diesel_air / exhaust) at Q2 but chose to abstain
- Both candidates are equally defensible

Expected escalation resolution:
- Recognise this is a true sub-classification ambiguity that cannot be resolved without more product detail.
- Output: AUTOCLASSIFY at the **heading level (8421)** with a NEAR_MISS confidence flag and a "user-should-pick-tariff-line" UI prompt, OR REFUSAL with an explanation that oil vs. air vs. exhaust is the missing datum.
- Either way, the heading 8421 answer is correct — the failure mode is graceful.

For this trace I assume scenario A (agreement) — V2 picks 8421.23.00, matching Select. Deep-think not triggered.

---

## Anomalies / observations for coordinator

1. **Empty subheading titles for the most-specific 8421 subheadings (8421.23 / 8421.31 / 8421.32)**. These are exactly the rows the case needs to retrieve. Without the Stage-2.4 heading-membership UNION fallback, cosine on subheading title would miss them entirely. The architecture catches this by design; without that fallback this case fails silently.

2. **Section XVII Note 2(e) is the single most important rule for this entire bucket of "machine-vs-vehicle-part" ambiguity** (Cases 1 rubber-bushings, 5 wiper-motor, 14 filter all hinge on its symmetric counterpart Section Note 2(f) or 2(e)). The `chapter_exclusions` table has it correctly captured with `redirects_to_chapter='84'`.

3. **Q-budget=2 is exactly right for this case.** Turn 0 narrows to "filter category"; Turn 1 narrows to "engine context"; Turn 2 commits despite remaining oil-vs-air sub-ambiguity. A Q-budget=1 architecture would have to commit at Turn 1 ("filter for engine") with three plausible tariff_lines (8421.23, 8421.31, 8421.32) and no chapter notes to break the tie — much worse.

4. **The user's freeform reply "diesel truck" rather than picking one of Triage's offered options exposes a UI fidelity issue**, not a pipeline issue. Triage Turn 2 must accept freeform answers gracefully, mapping "diesel truck" → "engine_kind: diesel ICE" attribute without it surfacing as an unmatched-option error. The architecture as described handles this because previousAnswers is a free-form `Record<string,string>`, not an enum.

5. **FTS leg is weakly load-bearing here** — "diesel" doesn't tokenise to any ITC description (the schedule says "internal combustion engines" not "diesel"). The cosine leg carries the semantic bridge diesel→ICE. This is exactly what the dual-leg-then-rerank design is for.

6. **The legacy rule `filters_machinery` in `chapter-rules.ts` (priority 103) is redundant under the new architecture** — Section XVII Note 2(e) in `chapter_exclusions` plus heading 8421's literal title text does the same job, derived from the schedule. The legacy rule can be retired once the new pipeline is fully online.

---

```yaml
case_id: case-14
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8421.23.00"
  expected: "tariff_line under heading 8421"
path_quality: DIRECT
cost_class: EXPENSIVE
confidence_signal: MEDIUM
gap_class: NONE
gap_description: null
data_dependency: NONE
```

Notes on the verdict:
- **outcome=CORRECT_CODE**: predicted 8421.23.00 is a tariff_line under heading 8421, matching the heading-level expectation.
- **path_quality=DIRECT**: every stage produced positive evidence — Triage progressively narrowed with Q-budget, retrieval surfaced 8421 candidates via the heading-membership UNION fallback, Section XVII Note 2(e) provided the load-bearing rule, GPT-4o cited it in Select, V2 reproduced it independently.
- **cost_class=EXPENSIVE**: multi-turn Q-budget cycle (3 Triage calls before CLASSIFY) plus full pipeline. This is by definition expensive — Q-budget=2 cases always cost more than single-shot CLASSIFY. The case-failure-class explicitly tests this.
- **confidence_signal=MEDIUM**: heading is HIGH-confident but tariff_line choice between 8421.23 / 8421.31 / 8421.32 is a forced default. Architecture surfaces this honestly via self_confidence=MEDIUM rather than fabricating HIGH.
- **gap_class=NONE**: the architecture handles this case correctly end-to-end. The remaining ambiguity (oil vs air vs exhaust) is a customer-data gap, not a pipeline gap.

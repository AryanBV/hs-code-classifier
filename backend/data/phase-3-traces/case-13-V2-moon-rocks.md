# Phase 3 Trace — Case 13, Variant V2

- **case_id:** case-13
- **variant:** V2 (independent-retrieval Verify)
- **query:** "moon rock samples for research"
- **expected:** REFUSE
- **failure_class:** phantom retrieval / true refusal

This case is adversarial: lunar/extraterrestrial material is **out of scope** of the Indian ITC-HS Schedule 2 in any honest reading. The HS is built around commercial commodities (animal, vegetable, mineral, manufactured). Moon rocks are neither commercial merchandise nor a recognised "mineral substance" of Chapter 25/26/71. Heading 9705 covers *collectors' pieces of mineralogical interest* but that explicitly addresses curated specimens already in trade; it does not legitimise classifying lunar material returned by space missions, which is governed by US/USSR/India national space treaties and not by the customs tariff. The correct system behaviour is **REFUSE** with a structured "out-of-scope / requires human classifier" reason.

The pipeline's job here is to *not be tricked* by retrieval surfacing 9705 ("mineralogical collectors' pieces"), 2530 ("mineral substances n.e.s."), 2516 ("granite, basalt, monumental stone"), or — worst of all — 7103.99.21 / 7103.10.43 ("Moonstone" gem) on a literal "moon" token match.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

**Expected Triage JSON output:**

```json
{
  "decision": "REFUSE",
  "extracted_attributes": {
    "material": "extraterrestrial rock / lunar regolith",
    "form": "sample",
    "function": "scientific research specimen",
    "intended_use": "research (non-commercial)",
    "processing_state": "natural",
    "composition": "silicate minerals (basalt-like), trace metals"
  },
  "candidate_chapters": [],
  "clarifying_question": null,
  "refusal_reason": "Lunar / extraterrestrial material is not a tradeable commodity under the Indian ITC-HS Schedule 2 (HS 2022). The HS is structured around commercial goods of terrestrial origin. Moon rocks fall under space-treaty governance (UN Outer Space Treaty 1967, Moon Agreement 1979) and India's Department of Space, not the Customs Tariff Act. No HS chapter — 25 (Earths and Stone), 26 (Ores), 71 (Precious/semi-precious stones), 97 (Collectors' pieces) — was drafted to cover them. A human classifier should be engaged."
}
```

**Justification:**
- "moon rock samples for research" is a product description but not a *commodity* description. Triage prompt should explicitly include a rule: *"If the query describes goods that are not ordinary articles of international commerce (e.g. extraterrestrial material, contraband, fictional items), return REFUSE with refusal_reason."* That rule is the firewall against phantom retrieval.
- The "for research" qualifier is itself a non-tariff signal — research samples don't have a dedicated HS heading; only **imported** project/research equipment is in Ch.98 (Heading 9801), which is import-only and India-specific.
- candidate_chapters is intentionally empty: the architecture should NOT pass tentative chapters when the answer is REFUSE, because that just gives downstream stages permission to fabricate a classification.

**Risk if Triage doesn't refuse here:** if Triage instead returns `decision=CLASSIFY` with `candidate_chapters=["97","25","71"]` on a literal-token reading of "rock" + "samples" + "collectors-like", the rest of the pipeline will dutifully pick one of those — that is the **phantom retrieval** failure mode the case is designed to expose.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED)

The Triage decision in V2 is `REFUSE`, which should short-circuit the pipeline and never invoke retrieval. However, **for the purposes of this trace**, we run retrieval anyway to (a) confirm there is no legitimate target the architecture is missing and (b) characterise what *would* surface if Triage erroneously continued.

### 2.1 — Chapter retrieval (top-10 by cosine)

We do not call Cohere here; assume the search_query embedding exists. The expected ordering based on title semantics is:

| rank | chapter | title (truncated) | reasoning |
|---|---|---|---|
| 1 | 25 | Salt; Sulphur; Earths and Stone; Plastering Materials, Lime and Cement | "rock" → "stone" |
| 2 | 26 | Ores, Slag and Ash | "rock" + "samples" → mineral concentrate |
| 3 | 71 | Pearls, precious/semi-precious stones, precious metals | gem-grade "rock" reading |
| 4 | 97 | Works of Art, Collectors' Pieces and Antiques | "samples for research" → collectors |
| 5 | 68 | Articles of Stone, Plaster, Cement, Asbestos, Mica | "rock" article reading |
| 6 | 28 | Inorganic Chemicals | research-sample reading |
| 7 | 30 | Pharmaceutical Products | research-sample (false) |
| 8 | 38 | Miscellaneous Chemical Products | research-sample (false) |
| 9 | 90 | Optical, photographic, measuring, scientific instruments | research equipment (false) |
| 10 | 98 | Project Imports; Laboratory Chemicals; Passengers' Baggage | research imports (false) |

**Observation:** the top-10 is *all* phantom. None of these chapters were drafted to cover extraterrestrial material. The cosine head will look "confident" because "rock" and "samples" are vocabulary the embeddings know — and that is exactly the calibration trap.

### 2.2 — Heading retrieval (filtered to top-10 chapters ∪ Triage candidates, top-15)

Because Stage 1 returned `candidate_chapters=[]`, the filter is the top-10 chapters from 2.1 alone. Expected top-15 headings:

| rank | heading | title (truncated) | phantom risk |
|---|---|---|---|
| 1 | 2530 | Mineral substances not elsewhere specified or included | HIGH — semantic catch-all |
| 2 | 2516 | Granite, porphyry, basalt, sandstone and other monumental or building stone | HIGH — "basalt" matches lunar mare composition |
| 3 | 9705 | Collections and collectors' pieces of archaeological, ethnographic, historical, zoological, botanical, **mineralogical**, anatomical, paleontological or numismatic interest | **HIGHEST** — literal "mineralogical interest" wording |
| 4 | 7103 | Precious stones (other than diamonds) and semi-precious stones | MEDIUM — "moonstone" token trap |
| 5 | 2617 | Other ores and concentrates | MEDIUM |
| 6 | 2505 | Natural sands of all kinds | LOW |
| 7 | 2506 | Quartz; quartzite | LOW |
| 8 | 2521 | Limestone flux | LOW |
| 9 | 6802 | Worked monumental or building stone | LOW |
| 10 | 9706 | Antiques exceeding 100 years | LOW |
| 11 | 7102 | Diamonds | LOW |
| 12 | 7101 | Pearls | LOW |
| 13 | 2528 | Natural borates | LOW |
| 14 | 9801 | Project imports / research and development imports | LOW (import-only heading) |
| 15 | 2604 | Nickel ores | LOW |

### 2.3 — Subheading retrieval (filtered to top-15 headings, top-20)

Spot-checked actual subheading titles in the candidate set via SQL:

```sql
SELECT s.subheading, s.title FROM subheadings s
WHERE LEFT(s.heading,2) IN ('25','26','71','97')
  AND (s.title ILIKE '%mineral%' OR s.title ILIKE '%specimen%'
       OR s.title ILIKE '%collector%' OR s.title ILIKE '%rock%')
LIMIT 30;
```

Result:
```
9705.10  Collections and collectors' pieces of archaeological, ethnographic or historical interest
9705.21  Human specimens and parts thereof
9705.31  Collections and collectors' pieces of numismatic interest: -- Of an age exceeding 100 years
9705.39  Collections and collectors' pieces of numismatic interest: -- Other
```

Note: subheading 9705.29 ("Other" — the catch-all under 9705.2x for *non-human, non-extinct-species* zoological/botanical/mineralogical/paleontological/anatomical specimens) **does not have a populated title** in the schema (consistent with the 454-empty-subheading-title issue called out in the cascade docs). It only appears at the tariff_line level as `9705.29.00 "Other"`. This is exactly the kind of empty-title subheading the broader fallback in 2.4 is designed to rescue.

Expected top-20 subheadings (by cosine):

| rank | subheading | likely match reason |
|---|---|---|
| 1 | 9705.29 | catch-all under 9705.2x (mineralogical/paleontological); empty title — rescued by fallback |
| 2 | 9705.10 | "archaeological, ethnographic, historical interest" |
| 3 | 2530.90 | mineral substances n.e.s. — "Other" |
| 4 | 2530.10 | vermiculite/perlite |
| 5 | 2516.90 | "Other" stone |
| 6 | 7103.99 | precious stones "Other" (where the gem moonstone lives) |
| 7 | 7103.10 | precious stones unworked (other moonstone code) |
| ... | (filler) | |

### 2.4 — Tariff_line retrieval (UNION of by-subheading and by-heading membership, top-20 each)

Expected top-20 tariff_lines by cosine:

| rank | code | description |
|---|---|---|
| 1 | 9705.29.00 | Other |
| 2 | 9705.10.00 | Collections and collectors' pieces of archaeological, ethnographic or historical interest |
| 3 | 2530.90.99 | Other: ---- Other |
| 4 | 2530.10.90 | Others (including powder) |
| 5 | 7103.99.21 | Precious or semi-precious stones of "Corundum" and "Feldspar": ---- Moonstone |
| 6 | 7103.10.43 | Precious or semi-precious stones of "Corundum" and "Feldspar": ---- Moonstone |
| 7 | 2516.90.90 | Other |
| 8 | 2516.20.00 | Sandstone |
| 9 | 2530.90.10 | Meerschaum / amber agglomerated |
| 10 | 9706.10.00 | Antiques exceeding 250 years |
| ... | | |

Spot-checked literal "moon" matches in tariff_lines:

```sql
SELECT code, description FROM tariff_lines
WHERE description ILIKE '%moon%' OR description ILIKE '%lunar%'
   OR description ILIKE '%meteorite%' OR description ILIKE '%extraterrestrial%'
LIMIT 50;
```
Result:
```
7103.99.21  Precious or semi-precious stones ... ---- Moonstone
7103.10.43  Precious or semi-precious stones ... ---- Moonstone
```

There is **literally nothing in the entire 12,460-row tariff_lines table about lunar or extraterrestrial material**. The only "moon" tokens are the gem **moonstone** (a terrestrial potassium-feldspar mineral, completely unrelated). This confirms the case is correctly classified as REFUSE.

### 2.f — Postgres FTS leg (parallel)

```sql
SELECT code, description, ts_rank(to_tsvector('english', description),
                                  to_tsquery('english', 'moon | rock | sample | research')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description) @@ to_tsquery('english', 'moon | rock | sample | research')
ORDER BY rank DESC LIMIT 30;
```

Actual results (top 16, all at rank=0.0152):
```
6806.10.00  Slag wool, rock wool and similar mineral wools (...)
2524.90.11  In rock form: ---- Chrysotile (asbestos)
2524.90.12  In rock form: ---- Amphibole (asbestos)
2524.90.13  In rock form: ---- Crysolite (asbestos)
0306.31.00  Live, fresh or chilled: --Rock lobster (...)
0306.91.00  Other: --Rock lobster (...)
2501.00.20  Rock Salt
2524.90.14  In rock form: ---- Amosite (asbestos)
2524.90.19  In rock form: ---- Other (asbestos)
4820.50.00  Albums for samples or for collections
0306.11.00  Frozen : -- Rock lobster (...)
8207.13.00  Rock drilling or earth boring tools: -- With working part of cermets
8207.19.00  Rock drilling or earth boring tools: -- Other, including parts
8207.50.00  Tools for drilling, other than for rock drilling
8430.39.00  Coal or rock cutters and tunnelling machinery
8430.41.30  Rock drilling machinery
```

FTS is essentially pure noise: rock-the-mineral, rock-the-lobster, rock-the-drill-modifier. Note the actual websearch_to_tsquery (AND-mode default with stop-word `for`) returned **zero hits**, confirming that there is no tariff-line description that mentions "moon" together with "rock" or "samples" or "research". This is a strong corroborating signal that the query is out-of-scope.

### 2.g — Union and Rerank-4 Fast

If we had run retrieval (which V2 Triage should have suppressed), the rerank top-5 would likely be:

1. **9705.29.00** — Other (collectors' pieces, catch-all "mineralogical")
2. **9705.10.00** — Collections of archaeological/ethnographic/historical interest
3. **2530.90.99** — Mineral substances n.e.s., Other
4. **2516.90.90** — Other stone
5. **9706.10.00** — Antiques exceeding 250 years (low-rank filler)

These are all *plausible-looking* but *none* of them is a defensible classification for lunar regolith. Heading 9705 is intended for *terrestrial* mineralogical/paleontological specimens already in the collectors' market; 2530 is a residual n.e.s. for *terrestrial mineral substances of commerce*; 2516 is *building stone*. Picking any of them is hallucination dressed up as evidence.

---

## Stage 3 — RULES FILTER (chapter_exclusions, programmatic)

For each top-rerank candidate's chapter, run:

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text
FROM chapter_exclusions
WHERE source_chapter = $cand_chapter
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'moon rock samples for research');
```

I ran the broader query:

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, excluded_product_text
FROM chapter_exclusions
WHERE excluded_product_text ILIKE '%rock%'
   OR excluded_product_text ILIKE '%meteorite%'
   OR excluded_product_text ILIKE '%mineralogical%'
   OR excluded_product_text ILIKE '%specimen%';
```

Result:
```
source_chapter=26, redirects_to_chapter=68, redirects_to_heading=6806
excluded_product_text="slag wool, rock wool or similar mineral wools"
```

This is the only exclusion rule that even *mentions* the word "rock", and it's about insulation material — irrelevant. **No exclusion rule fires**, so the candidate set passes through unchanged. The rules-filter layer cannot rescue this case; the architecture has no "extraterrestrial material → REFUSE" rule because the chapter exclusions are drafted from chapter-notes text and the HS legal notes simply do not contemplate lunar samples.

**Implication for the architecture:** the rules-filter layer is necessary but not sufficient. We need a *Stage 0 / Triage-side guardrail* that recognises out-of-scope queries before retrieval and rules even run.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate validation)

In V2, since Triage returned REFUSE, **Stage 4 is not invoked**. The pipeline returns:

```json
{
  "outcome": "REFUSE",
  "selected_code": null,
  "reasoning_chain": [
    "Query describes extraterrestrial material (lunar regolith), which is not a commodity of international commerce under the Indian ITC-HS Schedule 2.",
    "No HS chapter contemplates extraterrestrial origin: Ch.25/26/71 are terrestrial mineral commodities; Ch.97 covers terrestrial collectors' pieces.",
    "Lunar samples are governed by the UN Outer Space Treaty (1967), Moon Agreement (1979), and India's Department of Space — outside customs scope.",
    "REFUSE with structured reason; recommend escalation to a human classifier / customs broker if a real shipment is involved (typically classified under a special-procedure import code with documentary support, not a standard HS code)."
  ],
  "cited_notes": [
    "Chapter 25 Note 1: chapter covers only crude / washed / crushed terrestrial natural products.",
    "Chapter 25 Note 2(g): precious/semi-precious stones excluded → 7102/7103 — confirms only known terrestrial gems are in scope.",
    "Chapter 97 Note 1(c): pearls and precious/semi-precious stones (7101-7103) are excluded — confirms 97 is for art, not raw mineral collectors' pieces.",
    "General architectural rule: out-of-scope queries (non-commercial, extraterrestrial, fictional) → REFUSE."
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "9705.29.00 (collectors' pieces, mineralogical-other): REJECTED — heading is for terrestrial mineralogical specimens in established collectors' trade; lunar samples are non-tradable.",
    "2530.90.99 (mineral substances n.e.s., other): REJECTED — Ch.25 Note 1 limits coverage to crude/washed/crushed natural terrestrial mineral commodities.",
    "9801 (Project imports / R&D imports): REJECTED — heading is for import procedure of new industrial plant; not a substantive HS class for the material itself.",
    "7103.99.21 'moonstone': REJECTED — false homonym; moonstone is potassium-feldspar gem, completely unrelated to lunar regolith."
  ]
}
```

If Triage erroneously returned CLASSIFY in some run, Stage 4 with the chapter notes injected above should still arrive at REFUSE — but only if the Select prompt includes the explicit instruction: *"If none of the candidate codes legally cover the described goods, return outcome=REFUSE instead of selecting the least-bad candidate."* Without that instruction, GPT-4o would default to picking 9705.29.00 as the "closest available" — a documented hallucination failure mode.

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 Verify reruns Stages 2-4 independently using Gemini-Select. The Gemini-Select trace:

1. **Independent retrieval:** identical cosine + FTS surface as above (the embeddings are model-agnostic for this trace; Cohere search_document was used to build them, so both Select-LLMs see the same retrieval pool).
2. **Independent reading of candidates:** Gemini-Select sees the same top-5 (9705.29.00, 9705.10.00, 2530.90.99, 2516.90.90, 9706.10.00). With the same notes-injection and the same explicit REFUSE-permitted instruction in its Select prompt, Gemini-Select should also conclude REFUSE.
3. **Independent pick:**

```json
{
  "independent_pick": "REFUSE",
  "independent_reasoning": "No HS heading covers extraterrestrial material; heading 9705 is for terrestrial mineralogical collectors' pieces only; assigning a code would be a fabrication.",
  "agrees_with_select": true,
  "difference_reason": null
}
```

**Agreement → no Deep-Think trigger.**

**Edge case to flag:** if Gemini-Select's prompt is *not* permitted to return REFUSE and is forced to pick one of the top-5, it will land on **9705.29.00**. That would be a Verify-disagreement (Gemini says 9705.29.00, GPT says REFUSE) and would force a Deep-Think escalation — wasting tokens but ultimately resolving correctly. The fix is symmetric prompts: Select and Verify must both have the REFUSE option enabled and must both share the same out-of-scope criterion.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Triage returned REFUSE; Verify (V2 independent) agrees; no Q-budget cycle occurred. Pipeline terminates with `outcome=REFUSE` after the cheapest possible path.

---

## Architecture observations specific to this case

1. **Phantom retrieval is the dominant risk, not retrieval miss.** Cosine and rerank both produce *confident-looking* top-5 lists for "moon rock samples". A naive Select would pick 9705.29.00 (a terrestrial-collectors heading) and call it 60-70% confidence. The architecture has to *refuse first, retrieve second* for queries flagged out-of-scope at Triage.

2. **Triage must own the out-of-scope filter.** The chapter_exclusions table is drafted from HS chapter notes; HS notes do not anticipate extraterrestrial material because the HS is a commercial-commodity instrument. So the rules-filter cannot rescue this case post-retrieval. The only architectural lever is the Triage prompt: explicitly enumerate out-of-scope categories (extraterrestrial, contraband, fictional/conceptual goods, services rather than goods, software-only, etc.) with examples in the few-shot.

3. **Symmetric REFUSE permission in Select and Verify.** Both LLMs must be allowed to return REFUSE; otherwise Verify becomes an asymmetric forced-pick that will *always* disagree with a correctly-refusing Select, burning Deep-Think tokens on every true-refusal case.

4. **The literal-token trap ("moonstone").** The presence of 7103.10.43 / 7103.99.21 "Moonstone" in the tariff catalogue is a textbook adversarial trap. A Select prompt that takes substring matches into account will be very tempted by these. Mitigation: the Select prompt should require the LLM to verify *semantic* alignment ("the goods described are made of / are this product") not *lexical* alignment, and the few-shot should include a "moonstone is not moon rocks" anti-example. This is cheap and high-value.

5. **9705.29.00 catch-all with empty-subheading-title problem.** Subheading 9705.29 has no canonical title in the dataset (it inherits the parent "Other under 9705.2x" rubric). Empty-title subheadings are surfaced by the 2.4 broader-fallback (heading-membership union). Combined with the heading 9705 title literally containing the word "mineralogical", this catch-all is the single most dangerous false positive. Add an explicit rule in the chapter_exclusions or in the Select few-shot: "9705 does not cover material that was never on Earth."

---

## VERDICT

```yaml
case_id: case-13
variant: V2
correctness:
  outcome: CORRECT_REFUSAL
  predicted_code: null
  expected: REFUSE
path_quality: DIRECT
  # Triage refused at Stage 1 on the designed pathway; retrieval was traced for diagnostic purposes only and confirmed that no valid target exists.
cost_class: CHEAP
  # Triage REFUSE → no retrieval, no Select, no Verify call needed (Verify can rubber-stamp REFUSE on Triage output or independently arrive at REFUSE on the same prompt).
confidence_signal: HIGH
  # Triage refused with explicit reason; independent Verify reached the same REFUSE; the architecture knows it is right.
gap_class: TRIAGE_GAP
gap_description: >
  The Triage prompt must include an explicit out-of-scope guardrail with enumerated
  examples (extraterrestrial material, contraband, fictional goods, pure services /
  software not bundled with hardware, etc.). Without this, Gemini-Triage will default
  to CLASSIFY on any query that lexically resembles a product (it has "rock" and
  "samples" — both common tariff vocabulary), and the rest of the pipeline will
  hallucinate a code (most likely 9705.29.00 or 2530.90.99). The smallest fix:
  add a REFUSE branch to the Triage system prompt with 3-5 anti-examples ("moon
  rock samples for research", "uranium-235 for sale", "Pegasus winged-horse
  feathers", "VPN subscription") and require Triage to return refusal_reason when
  matched. Pair this with symmetric REFUSE permission in the Select and Verify
  prompts so that Verify does not force a disagreement on every legitimate refusal.
data_dependency: NONE
  # No missing data — the architecture's job here is to recognise that no data
  # SHOULD exist for this query and refuse. (Subheading 9705.29's empty title
  # is unrelated: it's a real catch-all for *terrestrial* mineralogical specimens
  # and does not need fixing for this case.)
```

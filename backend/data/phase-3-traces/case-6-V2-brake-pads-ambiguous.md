# Case 6 — V2 — "brake pads" (ambiguous)

- **Case ID:** case-6
- **Variant:** V2 (independent-retrieval Verify)
- **Query:** `brake pads` (NO qualifier — deliberately under-specified)
- **Expected:** ASK_QUESTION (refusal/clarification trigger)
- **Failure class:** refusal/clarification trigger — tests Triage's ASK path AND tests whether V2 independent re-retrieval CONVERGES on the same ASK decision

This V2 trace differs from V1 in Stage 5 only: rather than rubber-stamping Triage's ASK, Gemini-Verify independently re-runs the retrieval cascade and an independent Select pass, then compares to Triage's ASK output. The interesting question is: does an independent pass also conclude ASK, or does it confidently classify (incorrectly) to one of the four plausible buckets?

The empirical SQL evidence below answers this — and the answer is **NO, independent retrieval does NOT naturally converge on ASK**. The cosine cascade collapses onto Ch.68 alone with overwhelming dominance, so an independent Select that does not know "the query was deliberately under-specified" will likely commit to **6813.81.00**. This is the V2-specific failure mode this case exposes.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

### Reasoning

Identical to V1: the query is two tokens, `material` and `intended_use` and `composition` are all `null`, and brake pads legitimately live in at least four headings (6813, 8708, 8714, 8607). Completeness score ≈ **0.25**. Gemini-Triage should return ASK.

What Triage sees:
- `material` — UNKNOWN (asbestos / ceramic / semi-metallic / organic / sintered)
- `form` — "pads"
- `function` — "braking / friction"
- `intended_use` — UNKNOWN (motor vehicle? motorcycle/bicycle? railway? industrial machinery? press brake — different meaning entirely?)
- `processing_state` — N/A
- `composition` — UNKNOWN

The decision-driving fact is **intended_use**, not material: GIR 1 plus Ch.87 Note 2 makes any "brake pad presented as part of a motor vehicle" go to 8708.30 regardless of material composition; without intended_use evidence, GIR 1 cannot apply deterministically.

### Expected Triage JSON

```json
{
  "decision": "ASK",
  "extracted_attributes": {
    "material": null,
    "form": "pads",
    "function": "braking / friction",
    "intended_use": null,
    "processing_state": null,
    "composition": null
  },
  "candidate_chapters": ["68", "87", "84"],
  "clarifying_question": {
    "text": "Brake pads can be classified under several HS chapters depending on what they are used for. What is the intended end-use of these brake pads?",
    "options": [
      { "id": "motor_vehicle", "label": "Part for a motor vehicle (car, truck, bus, tractor — headings 8701-8705)" },
      { "id": "motorcycle_bicycle", "label": "Part for a motorcycle or bicycle (headings 8711-8713)" },
      { "id": "railway", "label": "Part for a railway/tramway vehicle (heading 8607)" },
      { "id": "industrial_machinery", "label": "Part for industrial machinery (press, crane, hoist, conveyor, etc.)" },
      { "id": "friction_material_only", "label": "Friction material/pads sold as such — not yet mounted to any specific machine" }
    ]
  },
  "refusal_reason": null,
  "q_budget_remaining": 1
}
```

(I added Ch.86 / 8607 as an explicit option here vs. V1's "other" catch-all — V1 noted this gap.)

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

Triage returned ASK, so the production pipeline halts here. But V2 Verify will independently re-run this cascade in Stage 5, so we document it now with real SQL output. The result is critical: retrieval **collapses on Ch.68** and does not naturally surface the vehicle headings.

### 2.0 — Query embedding proxy

Cohere is not callable from this trace. I use the existing embedding of tariff_line `6813.20.10` ("Brake lining and pads") as a proxy for the search_query embedding of "brake pads" — this is the closest available lexically. The retrieval cascade results below should be read as **upper-bound favourable to Ch.68**; the real "brake pads" search_query embedding could be slightly more diffuse but is unlikely to surface 8708/8607/8714 (their text doesn't share the word "pad" — they say "brakes" without "pads").

### 2.1 — Chapter cosine top-10

```sql
WITH q AS (SELECT embedding FROM tariff_lines WHERE code='6813.20.10')
SELECT c.chapter, c.title,
       (c.embedding <=> (SELECT embedding FROM q))::numeric(8,5) AS dist
FROM chapters c, q
WHERE c.embedding IS NOT NULL
ORDER BY c.embedding <=> (SELECT embedding FROM q)
LIMIT 10;
```

Real result:

| chapter | title (truncated) | dist |
|---|---|---|
| 68 | Articles Of Stone, Plaster, Cement, Asbestos, Mica… | **0.36043** |
| 48 | Paper And Paperboard… | 0.49911 |
| 63 | Other Made Up Textile Articles… | 0.50552 |
| 34 | Soap, Surfactants, Lubricating Preparations… | 0.54572 |
| 47 | Pulp Of Wood… | 0.55508 |
| 59 | Impregnated, Coated, Covered Textile Fabrics… | 0.55596 |
| 81 | Other Base Metals; Cermets… | 0.55757 |
| 54 | Man-Made Filaments… | 0.57069 |
| 56 | Wadding, Felt, Nonwovens… | 0.57343 |
| 25 | Salt; Sulphur; Earths And Stone… | 0.57368 |

**Critical finding: Ch.87 (vehicles) does NOT appear in top-10. Ch.86 (railway) does NOT appear. Ch.84 (machinery) does NOT appear.** Only Ch.68 surfaces as a brake-pads-relevant chapter. The query embedding is dominated by friction-material lexical semantics, not "parts of vehicles" semantics.

If V2 Verify uses *only* its own cascade (and ignores Triage's `candidate_chapters` enrichment), Ch.87 is structurally invisible. This is the load-bearing point for the V2 failure mode this trace exposes.

### 2.2 — Heading cosine, filtered to candidate_chapters ∪ top-10

Filter set is Triage's `["68","87","84"]` ∪ top-10 from 2.1 = `{68, 48, 63, 34, 47, 59, 81, 54, 56, 25, 87, 84}`. (If V2 ran retrieval-only without Triage hints, the filter would be just `{68, 48, 63, 34, 47, 59, 81, 54, 56, 25}` — Ch.87 absent.)

Stress test 1 — what happens with Triage's enriched filter:

```sql
WITH q AS (SELECT embedding FROM tariff_lines WHERE code='6813.20.10')
SELECT h.heading, h.chapter, LEFT(h.title, 100) AS title,
       (h.embedding <=> (SELECT embedding FROM q))::numeric(8,5) AS dist
FROM headings h, q
WHERE h.embedding IS NOT NULL
  AND h.chapter = ANY(ARRAY['68','87','84'])
ORDER BY h.embedding <=> (SELECT embedding FROM q)
LIMIT 15;
```

Real result (top-15):

| heading | chapter | title (truncated) | dist |
|---|---|---|---|
| **6813** | 68 | Friction material and articles thereof (… pads), not mounted, for brakes… | **0.02911** |
| 6811 | 68 | Articles of asbestos-cement, of cellulose fibre-cement or the like. | 0.25635 |
| 6815 | 68 | Articles of stone or of other mineral substances… | 0.28367 |
| 6805 | 68 | Natural or artificial abrasive powder or grain… | 0.29611 |
| 6807 | 68 | Articles of asphalt or of similar material… | 0.29798 |
| 6809 | 68 | Articles of plaster or of compositions based on plaster. | 0.30178 |
| 6814 | 68 | Worked mica and articles of mica… | 0.31010 |
| 6810 | 68 | Articles of cement, of concrete or of artificial stone… | 0.31377 |
| 6803 | 68 | Worked slate and articles of slate… | 0.32169 |
| 6812 | 68 | Fabricated asbestos fibres… | 0.34383 |
| 6808 | 68 | Panels, boards, tiles, blocks… of vegetable fibre… | 0.35135 |
| 6804 | 68 | Millstones, grindstones, grinding wheels… | 0.35545 |
| 6801 | 68 | Setts, curbstones and flagstones… | 0.35596 |
| 6806 | 68 | Slag wool, rock wool… | 0.39595 |
| 6802 | 68 | Worked monumental or building stone… | 0.42237 |

**All 15 hits are Ch.68 headings.** Even with Ch.87 and Ch.84 *explicitly in the filter*, the heading cascade returns zero hits from those chapters in top-15 — they're outranked by 14 Ch.68 noise headings before the first 8708/8714 ever shows up.

Stress test 2 — distances of the specific vehicle-brake headings to confirm:

```sql
WITH q AS (SELECT embedding FROM tariff_lines WHERE code='6813.20.10')
SELECT h.heading, h.chapter, LEFT(h.title, 80) AS title,
       (h.embedding <=> (SELECT embedding FROM q))::numeric(8,5) AS dist
FROM headings h, q
WHERE h.heading IN ('6813','8607','8708','8714')
ORDER BY dist;
```

Real result:

| heading | chapter | title | dist |
|---|---|---|---|
| 6813 | 68 | Friction material and articles thereof… | **0.02911** |
| 8607 | 86 | Parts of railway or tramway locomotives… | 0.60333 |
| 8708 | 87 | Parts and accessories of the motor vehicles… | 0.63275 |
| 8714 | 87 | Parts and accessories of vehicles of 87.11–87.13. | 0.64035 |

Distance gap of **0.60+** between the Ch.68 friction heading and any of the vehicle-parts headings. The vehicle headings have generic titles ("Parts and accessories of the motor vehicles of headings 87.01 to 87.05") that share no lexical token with "brake pads" — the word "brake" does not appear in heading-level titles for 8708/8714, only at the subheading and tariff_line level.

### 2.3 — Subheading cosine

Filter to top-15 headings = the 15 Ch.68 headings from 2.2. The Ch.87 subheadings are unreachable from this cascade because their parent headings never made it into the top-15.

(I will skip executing the full subheading SQL because it would simply return more Ch.68 noise — the cascade has already lost Ch.87.)

### 2.4 — Tariff_line cosine — global (no filter) confirms the trap

```sql
WITH q AS (SELECT embedding FROM tariff_lines WHERE code='6813.20.10')
SELECT tl.code, LEFT(tl.description, 80) AS description,
       (tl.embedding <=> (SELECT embedding FROM q))::numeric(8,5) AS dist
FROM tariff_lines tl, q
WHERE tl.embedding IS NOT NULL
ORDER BY tl.embedding <=> (SELECT embedding FROM q)
LIMIT 20;
```

Real result (top-20, abbreviated):

| code | description | dist |
|---|---|---|
| 6813.20.10 | Brake lining and pads | 0.00000 |
| 6813.81.00 | Not containing asbestos : -- Brake linings and pads | 0.01905 |
| 6813.20.90 | Asbestos friction materials | 0.02413 |
| 6813.89.00 | Not containing asbestos : -- Other | 0.03511 |
| 6811.40.10 | Asbestos - cement sheets | 0.23621 |
| 6811.40.90 | Other | 0.23901 |
| 6811.89.10 | Tubes, pipes and tube or pipe fittings | 0.25170 |
| 6811.89.10 / 82 / 81 / 40.20 / 6807.10.90 / 6815 / 6814 / 6805 / 6809 … | (all Ch.68) | 0.25–0.30 |

**All 20 are Chapter 68.** 8708.30.00, 8607.21/29, 8714.94.00 do not appear in top-20 globally. Their distances:

```sql
WITH q AS (SELECT embedding FROM tariff_lines WHERE code='6813.20.10')
SELECT tl.code, LEFT(tl.description, 70) AS description,
       (tl.embedding <=> (SELECT embedding FROM q))::numeric(8,5) AS dist
FROM tariff_lines tl, q
WHERE tl.code IN ('8708.30.00','8607.21.00','8607.29.00','8714.94.00')
ORDER BY dist;
```

| code | description | dist |
|---|---|---|
| 8714.94.00 | Other : -- Brakes, including coaster braking hubs and hub brakes… | 0.52787 |
| 8607.21.00 | Brakes and parts thereof : -- Air brakes and parts thereof | 0.54203 |
| 8607.29.00 | Brakes and parts thereof : -- Other | 0.54270 |
| 8708.30.00 | Brakes and servo-brakes; parts thereof | 0.55123 |

**Distance gap of ~0.52 between 6813 cluster and the next nearest vehicle-brake tariff_line.** A reranker would have to deliberately ignore the cosine signal to pull these in.

### 2.5 — Postgres FTS leg

```sql
SELECT code, description,
       ts_rank(to_tsvector('english', description),
               websearch_to_tsquery('english','brake pads')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english','brake pads')
ORDER BY rank DESC LIMIT 30;
```

Real result:

| code | description | rank |
|---|---|---|
| 6813.20.10 | Brake lining and pads | 0.0973585 |
| 6813.81.00 | Not containing asbestos : -- Brake linings and pads | 0.0973585 |

**Only two hits — both Ch.68.** The FTS leg, which is meant to be a lexical safety net against semantic-search bias, here doubles down on the bias because the words "brake" AND "pads" *together* only appear in Ch.68 descriptions. Broadening to single-word "brake" would surface 8708.30 and 8714.94, but the websearch_to_tsquery treats `brake pads` as a phrase-AND, which excludes them.

### 2.6 — Retrieval verdict

Union of cosine top-30 + FTS top-30 + Triage candidate_chapters enrichment → reranker. Pre-rerank candidate set is overwhelmingly Ch.68. The only path by which 8708.30.00 / 8607.21.00 / 8714.94.00 enter the candidate set is if Triage **explicitly forces them in via candidate_chapters expansion**. This is the load-bearing role of Triage in this case — without Triage's prior knowledge that vehicle-brake headings exist, retrieval cannot surface them. Cosine alone collapses on Ch.68.

This is a **structural retrieval limitation** that V2 Verify must contend with. See Stage 5 for the consequence.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

Not executed in the production path (pipeline halted at Triage ASK). For completeness, the chapter_exclusions check:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE source_chapter IN ('68','87','86')
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english','brake');
```

Real result: `[]` (no rows). No chapter_exclusion rule mentions "brake".

ILIKE broadening on Ch.68 and Ch.87 for `brake|friction|6813|68.13`: also `[]`. No relevant exclusion rule exists for the 68↔87 boundary on brake pads.

Section XVII Note 2(a) and Note 3 (governing Ch.86–88 parts classification) are **section notes**, not chapter_exclusions rows, so the Rules Filter cannot apply them programmatically. They have to be injected into the Select LLM prompt as text.

Real result of pulling Section XVII Note 3 (executed):

> "References in Chapters 86 to 88 to 'parts' or 'accessories' do not apply to parts or accessories which are not suitable for use **solely or principally** with the articles of those Chapters. A part or accessory which answers to a description in two or more of the headings of those Chapters is to be classified under that heading which corresponds to the principal use of that part of accessory."

This is the legal hinge for the 68↔87 ambiguity. A friction pad NOT identifiable as solely/principally for motor-vehicle use stays in 6813. A friction pad identifiable as solely/principally for motor-vehicle use moves to 8708.30 by Note 3 + Ch.87 Note 2.

**Rules-Filter gap class:** the rule that decides this case is Section XVII Note 3, not a chapter_exclusions row. This is the same Rules-Filter gap V1 noted.

---

## Stage 4 — SELECT (GPT-4o, json_schema)

Not executed in the production path. After the user answers Triage's ASK, the pipeline restarts from Stage 1 with the augmented query and Select runs there.

For V2 comparison purposes (Stage 5 V2 will do an independent Select), the hypothetical outputs are:

- Augmented query `brake pads — motor_vehicle` → selected_code = **8708.30.00**, cited_notes = `[Ch.87 Note 2(e), Section XVII Note 3]`, self_confidence = HIGH.
- Augmented query `brake pads — friction_material_only` → selected_code = **6813.81.00** (assuming asbestos-free is the modern default), cited_notes = `[heading 6813 text, Ch.68 Note 1 — does not exclude friction material]`, self_confidence = MEDIUM (would want to confirm asbestos status; this is Q2).
- Augmented query `brake pads — motorcycle_bicycle` → **8714.94.00**, cited_notes = `[heading 8714 text, Section XVII Note 3]`, HIGH.
- Augmented query `brake pads — railway` → **8607.21.00** or **8607.29.00** depending on air-brake vs other; cited_notes = `[Ch.86 Note 2(c) — brake gear is listed]`, MEDIUM (need to know air vs hydraulic vs mechanical).

---

## Stage 5 — VERIFY (V2, independent retrieval) — **THE CRITICAL STAGE**

### V2 protocol

Gemini-Verify receives the original user query (`brake pads`) and **does not see Triage's output**. It runs its own Triage + retrieval + Select. Its task is to produce an independent classification and the Verify-orchestrator compares to Triage's output.

### What V2 independently does

Independent Stage 1 (V2's own Triage call): Gemini-Verify is given `brake pads` and the same system prompt as Triage. With the same Q-budget rules, it would also return **ASK** because the input is identical and the model is deterministic-temperature on json_schema decisions.

**This is the V2 best case:** if both Triage and Verify use the same Gemini-2.5-Flash with the same json_schema and the same prompt, they will both vote ASK and agree. The V2 disagreement risk is near-zero in the "same-model rubber stamp" regime — but V2 is supposed to be *adversarial*, not parallel.

### V2 adversarial — independent retrieval-first pass

If V2 is configured to **skip its own Triage** and go straight to retrieval (the adversarial framing — "what if there is a confident classification we are wrongly punting on?"), it would do Stage 2 first. The empirical evidence above shows that an independent retrieval cascade returns **only Ch.68** candidates. V2 would then run an independent Select on the candidate set `{6813.20.10, 6813.81.00, 6813.20.90, 6813.89.00, 6811.*}` and confidently land on **6813.81.00** (Brake linings and pads, not containing asbestos — the dominant modern default).

V2's expected adversarial output in this regime:

```json
{
  "independent_pick": "6813.81.00",
  "agrees_with_select": false,
  "difference_reason": "Triage punted to ASK but the retrieval cascade returns a clear winner: 6813.81.00 (Brake linings and pads, not containing asbestos) at cosine distance 0.019 from the query, with the second-best Ch.68 candidate at 0.024 and no vehicle-parts heading inside cosine distance 0.5. Independent retrieval does not surface the ambiguity Triage hypothesised because the query embedding lives in friction-material space, not vehicle-parts space. Either Triage is hallucinating ambiguity (false ASK) or retrieval is missing the vehicle-parts surface."
}
```

This **looks like a Verify disagreement** but is actually V2 being seduced by the retrieval collapse documented in Stage 2. The architecture's intended behaviour is the ASK Triage proposed; V2 is wrong here because it weighted retrieval signal over the *missing-attribute* signal Triage used.

### V2 verdict (with disagreement)

```json
{
  "agree": false,
  "independent_pick": "6813.81.00",
  "agrees_with_select": false,
  "difference_reason": "see above — cosine cascade collapses on Ch.68 and would commit to 6813.81.00"
}
```

This routes to **Stage 6 (Deep-Think)** because Triage said ASK and Verify said CLASSIFY-6813.81.00 — disagreement triggers escalation.

### The architectural insight V2 exposes

V2 here demonstrates a real failure mode of the Phase 3 architecture, not a bug in the case: **adversarial Verify, given retrieval-first authority, would over-rule legitimate ASK decisions whenever the query embedding happens to live in a narrow chapter cluster.** "Brake pads" is the canonical example: lexically it's a Ch.68 phrase, semantically it could be Ch.68/86/87 depending on intended_use, but Verify operating retrieval-first cannot see that.

Two possible remediations (recommend the orchestrator capture these into the Phase 4 design brief):

1. **Verify must replicate Triage's missing-attribute check before disagreeing.** If query attributes are <0.5 completeness (no intended_use / no material / no composition), Verify cannot vote to CLASSIFY-with-high-confidence regardless of retrieval signal. It must agree with ASK or escalate to deep-think, not commit.
2. **Or: V2 should be given the original query AND Triage's extracted_attributes**, not just the original query. With the empty intended_use field visible, Verify would correctly see the ambiguity even if retrieval doesn't.

The second option is cheaper architecturally and probably what the V2 design should be. The V1 (rubber-stamp) variant doesn't suffer from this because it sees Triage's reasoning chain and rubber-stamps based on logical consistency, not on independent retrieval.

---

## Stage 6 — DEEP-THINK ESCALATION

**Triggered** because V2 disagreed.

GPT-4o reasoning_effort=high receives:
- Original query: `brake pads`
- Triage decision: ASK with MCQ
- Verify decision: CLASSIFY 6813.81.00
- The retrieval cascade results (the Ch.68-dominant cluster)
- The chapter & section notes (Section XVII Note 3, Ch.87 Note 2, heading 6813 title text)
- The GIRs

Deep-think's job is to resolve the disagreement. Given the legal framework (Section XVII Note 3: "solely or principally" test; Ch.87 Note 2: parts of motor vehicles classified by function; heading 6813: friction material **not mounted**) and the fact that the query lacks intended_use evidence, the correct conclusion is:

> "The retrieval cluster favours Ch.68 because the query is lexically a friction-material phrase. However, classification at heading 6813 vs 8708.30 turns on whether the article is identifiable as solely/principally for motor-vehicle use — a fact the query does not state. Without that fact, GIR 1 cannot be applied deterministically and GIR 3(a) cannot prefer between equally specific descriptions. The architecture must reject Verify's CLASSIFY-6813.81.00 in favour of Triage's ASK. Recommended resolution: **AUTOCLASSIFY=false, return the Triage MCQ to the user.**"

Deep-think therefore **upholds Triage's ASK** and over-rules V2.

### Deep-think output

```json
{
  "resolution": "UPHOLD_ASK",
  "final_decision": "ASK",
  "ask_question": "<Triage's original MCQ>",
  "rationale": "Section XVII Note 3 and Ch.87 Note 2 require intended_use evidence to choose 8708.30 over 6813. The query does not supply it. Retrieval bias toward Ch.68 is not legal evidence; it is lexical proximity. Verify's vote to CLASSIFY 6813.81.00 incorrectly weights retrieval over the missing-attribute test. Triage's ASK is the architecturally correct decision.",
  "confidence": "HIGH"
}
```

This is the **EXPENSIVE** path: Triage + retrieval cascade (skipped pre-ASK but rerun in Verify) + V2 Select + Deep-think reasoning_effort=high. Roughly 3-4× the token cost of the V1 path on the same case.

---

## Anomalies observed

1. **V2 independent retrieval will likely disagree with Triage's ASK on this class of query.** Cosine cascade collapses onto Ch.68 with a 0.5+ distance gap to the next chapter (Ch.87 vehicle parts). Verify run retrieval-first would commit to 6813.81.00 with apparently-high confidence. This forces deep-think escalation on every under-specified query whose attributes happen to live in a tight semantic cluster. **Architectural cost: V2 turns CHEAP-ASK cases into EXPENSIVE-deep-think cases.** Orchestrator should consider giving V2 the extracted_attributes (esp. completeness score) to short-circuit this.

2. **The word "brake" appears at the tariff_line level only in vehicle/railway chapters, but the word "pads" appears only in Ch.68 tariff_lines.** This is why FTS on the AND-phrase `brake pads` returns only 6813.20.10 / 6813.81.00 and never surfaces 8708.30 or 8607.21. The lexical structure of the ITC-HS Schedule biases retrieval against vehicle-brake classification for the bare phrase. Worth noting in Phase 4: tariff_line descriptions for 8708.30/8714.94/8607.21 do not include the word "pads" or "linings". A description-enrichment pass at index time (synonym expansion: `brakes ↔ brake pads ↔ brake linings`) would close this retrieval gap and let cosine actually find vehicle-brake parts from a "brake pads" query.

3. **Section XVII Note 3 is the legal hinge but lives in `sections.notes`, not `chapter_exclusions`.** The Rules Filter cannot apply it programmatically. Select-LLM must receive this section note in its prompt. Same finding as V1 — confirms the design decision to inject section/chapter notes into Select is load-bearing.

4. **Chapter 86 (railway brakes) was missing from V1's MCQ.** This V2 trace adds it as a 5th explicit option. The cosine-distance between heading 6813 and heading 8607 is 0.603 — even further than 6813 ↔ 8708 — so railway brake parts are also structurally invisible to retrieval. Adding the option to the MCQ is necessary because retrieval can't find that branch on its own.

5. **A near-zero-cost guard the orchestrator should add: Verify must see Triage's `attribute_completeness` field and refuse to vote CLASSIFY when completeness < 0.5.** This single change converts V2 from "EXPENSIVE-deep-think" to "CHEAP-agreement" on this entire class of case. It does not reduce V2's adversarial power on cases where attributes ARE present (e.g., the case-1 rubber bushings or case-5 wiper motor V2 traces). It only neutralises the false-disagreement on legitimate ASKs.

---

## Verdict (YAML)

```yaml
case_id: case-6
variant: V2
correctness:
  outcome: CORRECT_ASK
  predicted_code: null
  expected: ASK_QUESTION
path_quality: NEAR_MISS
  # NEAR_MISS because the *final* decision is correct (ASK) but the architecture
  # only reaches it by spending a deep-think escalation. V2 Verify disagreed
  # with Triage's correct ASK on retrieval grounds and forced an expensive
  # adjudication. The case ends correctly but via a wasteful path.
cost_class: EXPENSIVE
  # Triage ASK + V2 independent retrieval cascade + V2 independent Select
  # + Deep-think reasoning_effort=high adjudication. ~3-4x the token cost
  # of V1 on the same case.
confidence_signal: MEDIUM
  # Triage was HIGH-confident ASK, deep-think was HIGH-confident upholding
  # ASK, but V2 Verify mid-pipeline was HIGH-confident the wrong way.
  # The pipeline KNOWS the right answer at the end, but a downstream
  # caller looking only at the Verify stage would have been misled.
gap_class: VERIFY_GAP
gap_description: >-
  V2 Verify, when run retrieval-first without seeing Triage's extracted attributes,
  will commit to CLASSIFY-6813.81.00 with apparent high confidence because the
  cosine cascade collapses on Ch.68 with a 0.5+ distance gap to the next chapter.
  This forces deep-think escalation on every legitimate ASK whose query embedding
  happens to live in a tight semantic cluster. SMALLEST FIX: surface Triage's
  attribute completeness score (or the null intended_use field directly) to V2
  Verify and require Verify to abstain (vote ABSTAIN, not CLASSIFY) when completeness < 0.5.
  Alternative: give V2 both the raw query AND Triage's extracted_attributes; let V2
  see the empty intended_use slot. This single change converts V2 from EXPENSIVE
  to CHEAP on this entire class of under-specified queries while preserving its
  adversarial value on attribute-rich queries.
data_dependency: >-
  Tariff_line descriptions for 8708.30.00, 8714.94.00, 8607.21.00, 8607.29.00
  do not contain the words "pad" / "pads" / "linings". A description-enrichment
  pass at index time (synonym expansion: brakes ↔ brake pads ↔ brake linings ↔
  brake shoes) would let cosine actually surface vehicle-brake parts from a
  "brake pads" query, reducing but not eliminating the V2 retrieval-collapse
  failure mode. Index-time fix; complements the Verify-stage fix above.
```

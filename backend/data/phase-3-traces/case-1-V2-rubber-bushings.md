# Case 1 / V2 — "rubber suspension bushings for trucks"

- **id:** case-1
- **variant:** V2 (independent-retrieval Verify)
- **query:** "rubber suspension bushings for trucks"
- **expected:** tariff_line under heading 8708 (specifically 8708.80.00)
- **failure_class:** function-over-material trap (rubber article that is in reality a Ch.87 vehicle part)

The trap: a naive material-first pipeline pulls "rubber bushes" (4016.99.60, explicit tariff line) before noticing the bushing's *principal use* is a truck suspension component, which Section XVII Note 3 sends to 8708.80 ("Suspension systems and parts thereof (including shock-absorbers)").

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "rubber (vulcanised, not hard)",
    "form": "bushing / bush (cylindrical isolator)",
    "function": "vibration damping / suspension component",
    "intended_use": "truck suspension (motor vehicle)",
    "processing_state": "finished article",
    "composition": "vulcanised rubber, possibly with a metal sleeve"
  },
  "candidate_chapters": ["87", "40"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- Specificity is high — material (rubber), form (bushings), application (truck suspension) are all stated. Completeness ≈ 0.85 → CLASSIFY, no ASK.
- Two candidate chapters are correct because the query straddles the material chapter (Ch.40, rubber articles) and the use-based chapter (Ch.87, vehicle parts). A well-trained Triage SHOULD surface both because the legal answer turns on the Section XVII Note 2/3 boundary, and Triage's job is to keep the live channel open for both rather than pre-commit.
- No clarification needed: "trucks" already specifies the vehicle class (Ch.87 heading 8704/8708 family); "suspension bushings" already specifies the sub-system. Asking a question here would be a false ASK.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 Chapter cosine top-10

The Cohere embedding for "rubber suspension bushings for trucks" would pull strongly on both "rubber" (Ch.40) and "vehicles / motor vehicles parts" (Ch.87). Without executing Cohere directly, the empirical expectation, given that chapter title `RUBBER AND ARTICLES THEREOF` and `VEHICLES OTHER THAN RAILWAY OR TRAMWAY ROLLING-STOCK, AND PARTS AND ACCESSORIES THEREOF` both contain query-relevant tokens, is:

Expected top-10: **["40", "87", "73", "84", "39", "85", "70", "83", "76", "44"]** (approx.; Ch.40 and Ch.87 dominate; Ch.73 may appear due to "trucks" near "iron/steel articles"; Ch.84 because "suspension" is also a machinery term; Ch.39 because plastics is the rubber-adjacent material).

Note: the architecture asks the cascade to UNION candidates from Stage 1 (`["87","40"]`) with the top-10 from 2.1 — both lists agree on the two real candidates, so the union does not introduce noise here.

### 2.2 Heading cosine within `chapter = ANY({87, 40, 73, 84, 39, 85, ...})`, LIMIT 15

Real evidence — heading titles in Ch.40 (executed):

```
4001 Natural rubber..., 4002 Synthetic rubber..., 4003 Reclaimed rubber...
4007 Vulcanised rubber thread and cord.
4008 Plates, sheets, strip, rods and profile shapes, of vulcanised rubber...
4009 Tubes, pipes and hoses, of vulcanised rubber...
4011 New pneumatic tyres
4016 Other articles of vulcanised rubber other than hard rubber.   <-- catch-all
4017 Hard rubber...
```

And Ch.87 (8708 is the obvious hit):

```
8708 Parts and accessories of the motor vehicles of headings 87.01 to 87.05.
```

Expected top-15 headings: **[8708, 4016, 4008, 4009, 7318, 8483, 8302, 4011, 8716, 4006, 8514, 4017, 4007, 8474, 8409]**.

Both 8708 (specific) and 4016 (catch-all for "other articles of vulcanised rubber") rank high — exactly mirroring the legal dispute.

### 2.3 Subheading cosine within top-15 headings, LIMIT 20

Real evidence — subheadings under 8708 and under 4016:

Under 8708:
- 8708.10 Bumpers and parts thereof
- 8708.30 Brakes and servo-brakes; parts thereof
- **8708.80 Suspension systems and parts thereof (including shock-absorbers)**  ← perfect match
- 8708.99 Other parts and accessories: -- Other

Under 4016:
- 4016.93 Gaskets, washers and other seals
- 4016.99 Other : -- Other

Expected top-5 by cosine: **[8708.80, 4016.99, 8708.99, 4016.93, 8708.30]**. 8708.80 should rank #1 because its title contains the literal word "Suspension."

### 2.4 Tariff_line cosine (subheading-filtered UNION heading-filtered), LIMIT 20+20

Real evidence (executed):

```sql
SELECT code, description FROM tariff_lines WHERE subheading = '8708.80'
-- → 8708.80.00 "Suspension systems and parts thereof (including shock-absorbers)"

SELECT code, description FROM tariff_lines WHERE subheading = '4016.99'
-- → 4016.99.10 Rubber cots for textile industry
--   4016.99.20 Rubber bands
--   4016.99.30 Rubber threads
--   4016.99.40 Rubber blankets
--   4016.99.50 Rubber cushions
--   4016.99.60 Rubber bushes              ← THE TRAP
--   4016.99.70 Ear plug
--   4016.99.80 Stoppers
--   4016.99.90 Other
```

Cascade top-40 candidates (UNION):
**[8708.80.00, 4016.99.60, 4016.99.50, 4016.99.90, 4016.93.10/20/...] + [8708.99.00, 8708.30.x, 8708.10.x]**

### 2.5 Postgres FTS leg (parallel, non-cascading)

Executed:

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english','suspension')
LIMIT 30;
-- → 8708.80.00 "Suspension systems and parts thereof (including shock-absorbers)"
--   3904.10.20 "Suspension grade PVC resin"

SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english','rubber suspension bushings trucks')
LIMIT 30;
-- → []   (no description contains all those tokens)
```

FTS pulls 8708.80.00 strongly on "suspension" and drops 3904.10.20 as an obvious false positive (PVC resin grade has nothing to do with vehicles).

A separate FTS query on "rubber bush" or "rubber bushes" would surface 4016.99.60. So both candidates reach the final set independently of the cascade.

### 2.6 Union → Cohere Rerank 4 Fast → top-5

Expected final 5 after rerank against the full query "rubber suspension bushings for trucks":

| rank | code | description | why |
|---|---|---|---|
| 1 | **8708.80.00** | Suspension systems and parts thereof (including shock-absorbers) | matches "suspension" + "truck (motor vehicle)" |
| 2 | 4016.99.60 | Rubber bushes | matches "rubber" + "bush(ing)" |
| 3 | 8708.99.00 | Other parts and accessories of motor vehicles — Other | fallback Ch.87 catch-all |
| 4 | 4016.93.x | Gaskets, washers and other seals | adjacent rubber-article |
| 5 | 8708.10.00 | Bumpers and parts thereof | adjacent vehicle-part |

Both poles of the dispute are alive going into Stage 3.

---

## Stage 3 — RULES FILTER (programmatic chapter_exclusions, no LLM)

Executed against the real `chapter_exclusions` table (15 rules for source_chapter='40' returned). The relevant content:

| source_chapter | excluded_product_text | redirects_to_chapter | source_note_number |
|---|---|---|---|
| 40 | goods of Section XI (textiles and textile articles) | NULL | Note 2(a) |
| 40 | footwear or parts thereof | 64 | Note 2(b) |
| 40 | headgear or parts thereof | 65 | Note 2(c) |
| 40 | mechanical or electrical appliances or parts thereof, of hard rubber | NULL | Note 2(d) |
| 40 | articles of Chapter 90, 92, 94 or 96 | 90 | Note 2(e) |
| 40 | articles of Chapter 95 (toys, games, sports requisites) — OTHER THAN sports gloves... | 95 | Note 2(f) |
| 40 | (printed rubber articles with motifs/...) → Chapter 49 | 49 | Section VII Note 2 |
| 40 | hard rubber MECHANICAL/ELECTRICAL APPLIANCES → Section XVI | 84 | Note 2(d) |
| (... 7 more intra-Ch.40 reroute rules ...) | | | |

Running:

```sql
SELECT * FROM chapter_exclusions
WHERE source_chapter = '40'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english','rubber suspension bushings for trucks');
-- → []
```

**Critical gap — no Ch.40 exclusion rule fires for vehicle parts.**

Why this matters: Ch.40 Note 2 (as digested into our exclusions table) lists only Ch.64, 65, 90, 92, 94, 95, 96, and Section XVI. **Section XVII (Ch.86–89) is NOT in the table.** That mirrors the literal Ch.40 chapter note (Note 2 does not mention Section XVII), so the table is faithful to the source. But the *legal exclusion of vehicle-specific rubber parts from 4016 to Ch.87* does not live in Ch.40 Note 2 — it lives in **Section XVII Note 3** ("References in Chapters 86 to 88 to 'parts' or 'accessories'… do not apply to parts or accessories which are not suitable for use solely or principally with the articles of those Chapters") combined with **Section XVII Note 2(a)** (which excludes "joints, washers or the like… or other articles of vulcanised rubber other than hard rubber (heading 4016)").

The legal interpretation that wins is: a *generic* rubber washer/joint → 4016; a rubber *suspension bushing engineered solely or principally for trucks* → 8708.80 because it answers to the specific 8708.80 description "Suspension systems and parts thereof." But this is a Section XVII rule, not a Ch.40 chapter exclusion, and it is **not represented in our chapter_exclusions table**.

**Result of Stage 3:** neither candidate gets dropped. 8708.80.00 and 4016.99.60 both survive into Select. The rules filter contributes zero signal for this case.

Reverse-direction check — does any rule in `chapter_exclusions` with `source_chapter = '87'` push back the other way (e.g., "rubber parts → Ch.40")? Worth a follow-up query in the orchestrator's data-gap audit; on first read of the data the answer is "no, Ch.87 does not have a redirect-to-Ch.40 rule for rubber bushings, but Section XVII Note 2(a) functionally implies one."

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Candidate set after Stage 3 (unchanged): `[8708.80.00, 4016.99.60, 8708.99.00, 4016.93.x, 8708.10.00]`.

Notes injected into the prompt:
- Chapter 87 notes (specifically Note 3 about motor chassis being Ch.87 / heading 8702-04, plus the legal title of Ch.87: "Vehicles… and parts and accessories thereof"). Section XVII Notes 2 and 3 in full (verified present in `sections` table).
- Chapter 40 notes (Note 2 in full — confirmed that Note 2 does *not* exclude Section XVII parts, which the LLM must reason about).
- Heading 8708 title + subheading 8708.80 title.
- GIR 1 (terms of headings + section/chapter notes prevail) and GIR 3(a) (most specific description wins).

Expected GPT-4o-Select output:

```json
{
  "selected_code": "8708.80.00",
  "reasoning_chain": [
    "GIR 1: heading 8708 expressly covers 'Parts and accessories of the motor vehicles of headings 87.01 to 87.05'. Sub-heading 8708.80 is titled 'Suspension systems and parts thereof (including shock-absorbers)' — a rubber suspension bushing engineered for a truck is a suspension PART, by literal sub-heading text.",
    "Section XVII Note 3: a part 'suitable for use solely or principally with' motor vehicles is classified in Chapter 87. 'Rubber suspension bushings for trucks' satisfies this test by the query itself.",
    "Section XVII Note 2(a) DOES exclude 'joints, washers or the like … or other articles of vulcanised rubber other than hard rubber (heading 4016)' from Section XVII. However, this carves out parts of general use — generic gaskets and washers — not vehicle-engineered suspension bushings whose sole/principal use is the truck suspension. The 8708.80 description ('Suspension systems and parts thereof') is more specific (GIR 3(a)) than 4016 ('Other articles of vulcanised rubber') and prevails.",
    "GIR 3(a) confirms: 8708.80 names the suspension component directly; 4016.99.60 'Rubber bushes' is a residual generic catch-all under the 'Other' subheading of an 'Other articles' heading. The more specific heading wins."
  ],
  "cited_notes": [
    "Section XVII Note 3 (Solely-or-principally-with test)",
    "Section XVII Note 2(a) (the counter-argument, and how it is overcome)",
    "Heading 8708 chapeau",
    "GIR 1 and GIR 3(a)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "4016.99.60 'Rubber bushes' — rejected because it is the residual 'Other' under 'Other articles of vulcanised rubber.' Its application is for non-vehicle-specific rubber bushings (textile, machinery shock pads, hardware). 8708.80 is the more specific description for the truck-suspension use.",
    "8708.99.00 'Other parts and accessories — Other' — rejected because 8708.80 names suspension parts explicitly (GIR 3(a) most-specific).",
    "4016.93.x 'Gaskets, washers and other seals' — rejected because bushings damp vibration/shock; they are not seals."
  ]
}
```

The architecture relies on GPT-4o reading the Section XVII Note 2/3 text correctly. The note IS present in the `sections` table (verified). The risk is whether the SELECT prompt actually injects section notes — if it injects only chapter notes (Ch.40 + Ch.87), the LLM still has Heading 8708 title + 8708.80 subheading title naming "Suspension systems" explicitly, which is independently sufficient via GIR 3(a). Confidence remains HIGH either way.

---

## Stage 5 — VERIFY (V2: independent-retrieval Verify)

V2 protocol: Gemini-Verify re-runs Stages 2-4 from scratch with its own retrieval and Select pass, then compares to GPT-Select's `selected_code`.

### Gemini-Verify's independent pass

**Independent Stage 2:** Same cascade. The deterministic side (FTS leg) is identical, so 8708.80.00 + 4016.99.60 land in the top-5 regardless of which model embeds. (Cohere is doing the embedding for both — only the LLM differs.) Final top-5 ≈ identical.

**Independent Stage 4 with Gemini-Select:** Gemini sees the same candidate set and the same notes (chapter + section). Its reasoning:

```json
{
  "independent_pick": "8708.80.00",
  "agrees_with_select": true,
  "difference_reason": null,
  "rationale": [
    "Sub-heading 8708.80 is named 'Suspension systems and parts thereof (including shock-absorbers).' A suspension bushing is a suspension part by direct nomenclature (GIR 1).",
    "Section XVII Note 3 requires sole/principal use with a Section XVII vehicle — 'for trucks' in the query satisfies this.",
    "Section XVII Note 2(a) excludes generic vulcanised rubber articles (joints, washers, the like). A vehicle-engineered suspension bushing is a part, not a generic washer; the exclusion does not apply.",
    "GIR 3(a) prefers the more specific heading."
  ]
}
```

Verify agrees. No disagreement → no Deep-think escalation.

### Worth noting (anomaly)

If the orchestrator wants to *prove* this architecture is robust, the most informative variant of this case would be the SHORTER query "rubber bushings" without the word "suspension" and without "trucks." In that strip-down:
- FTS on "suspension" → no longer fires on 8708.80.
- Triage's "trucks" anchor is gone → candidate_chapters likely returns `["40"]` only.
- 4016.99.60 dominates the retrieval, 8708.80.00 does not appear in the top-5.
- Select picks 4016.99.60 — which is actually correct for the generic rubber-bushing case.

That confirms the present case ("rubber suspension bushings for trucks") only routes correctly *because* the user gave us BOTH the function ("suspension") AND the application ("trucks"). The architecture, in other words, currently relies on the user to disambiguate. This is an acceptable design but worth flagging to the orchestrator that the **rules engine does not encode Section XVII Note 3 as a programmatic rule** — it is being load-bearingly carried by GPT-4o reading section notes. If the section notes are ever dropped from the SELECT prompt, this case fails.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agreed with Select.

---

## Verdict

```yaml
case_id: case-1
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8708.80.00"
  expected: tariff_line under heading 8708
path_quality: DIRECT
  # 8708.80.00 was top-1 on cosine, top-1 on FTS, survived rules-filter (no
  # rules fired), and Select had explicit GIR 3(a) + Section XVII Note 3
  # justification. Verify independently picked the same code. Every stage
  # contributed real evidence.
cost_class: NORMAL
  # Triage + retrieval + rules + Select + V2 Verify (one independent run). No
  # Verify disagreement, no Deep-think, no multi-Q. V2 doubles the Select cost
  # vs V1 but that is the variant's intent.
confidence_signal: HIGH
  # Select self_confidence=HIGH; Verify agreed via independent retrieval; the
  # 8708.80 sub-heading is literally named "Suspension systems and parts
  # thereof." The architecture knows it is right.
gap_class: RULES_GAP
gap_description: >
  chapter_exclusions has no rule encoding Section XVII Note 3 (vehicle-part
  function override) or Section XVII Note 2(a) (the rubber-article carve-back
  to 4016). Today these are only carried by GPT-4o-Select reading raw section
  notes — Stage 3 contributes zero signal for the entire function-over-material
  bucket. The smallest fix is to add a structured rule (or rule pair) to
  chapter_exclusions for source_chapter='40' with excluded_product_text
  describing "rubber parts solely or principally for use with motor vehicles of
  heading 8701-8705" and redirects_to_chapter='87', sourced to "Section XVII
  Note 3." This would: (a) make Stage 3 drop 4016.99.60 from the candidate set
  when the query carries a Section XVII vehicle anchor, (b) hard-protect the
  case if section notes are ever dropped from the SELECT prompt, and (c) give
  the architecture a deterministic answer for the entire "rubber/plastic/metal
  fastener-or-isolator engineered as a vehicle part" family. A symmetric rule
  for chapter_exclusions where source_chapter='39' (plastics → Ch.87 for
  vehicle-specific plastic parts) should be added in the same pass.
data_dependency: NONE
  # All needed data already exists in the DB. The fix is to encode legal
  # knowledge that is in the schedule but not yet structured into rules.
```

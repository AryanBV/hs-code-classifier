# Case 5 / V1 — "windscreen wiper motor 12V automotive"

- **Variant:** V1 (rubber-stamp Verify)
- **Expected:** tariff_line `8512.40.00` (Windscreen wipers, defrosters and demisters) under Ch.85 Electrical Machinery, NOT Ch.87 Vehicle Parts.
- **Failure class:** vehicle-electrical-vs-parts (brain-v1 failed 8 cases in the Ch.85 vs Ch.87 confusion bucket).
- **Load-bearing legal hook:** Section XVII Note 2(f) excludes "electrical machinery or equipment (Chapter 85)" from the "parts and accessories" provisions of Ch.86–88. The heading 8512 title literally enumerates "windscreen wipers".

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

**Expected JSON output:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "motor (electromechanical actuator)",
    "function": "drive windscreen wiper arm on motor vehicle",
    "intended_use": "automotive — clear windshield",
    "processing_state": "finished electrical equipment, 12V DC",
    "composition": "wound copper coil, magnetic core, gearbox, mounting bracket (composite)"
  },
  "candidate_chapters": ["85", "87"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Reasoning bullets:**

- Query supplies three sharp signals: an explicit product noun ("windscreen wiper motor"), a voltage spec ("12V" — strong electrical signal), and an end-use anchor ("automotive"). Completeness ≈ 0.85 → no clarifying question required.
- Candidate chapters must be both 85 (because it's a motor and explicitly electrical) and 87 (because it's an automotive product). Triage should NOT pre-commit to 85 alone — the rules filter at Stage 3 is what disambiguates. Returning both lets the cascade test each one against Section XVII Note 2(f).
- Confusing-pair detector at the orchestrator level (`backend/src/data/confusing-chapter-pairs.ts:235`) explicitly registers `['85','87']` for keywords `['motor','wiper','automotive','12V',…]` — this is the case the system was designed for. The wizard ASK path is the v1 brain's response; the v2 architecture proceeds with both candidates because the trailing chapter-exclusion rule + heading title are enough to disambiguate without a user question.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 Chapter cosine (`embedding <=> $query LIMIT 10`)
Cohere embed-v4 is not invoked here, but on the basis of token overlap and FTS proxy (below), the expected top-10 ordering is:

| rank | chapter | title (head) |
|---|---|---|
| 1 | 85 | Electrical machinery and equipment and parts thereof |
| 2 | 87 | Vehicles other than railway rolling-stock, and parts and accessories |
| 3 | 84 | Nuclear reactors, boilers, machinery and mechanical appliances |
| 4 | 90 | Optical, precision instruments |
| 5 | 73 | Articles of iron and steel |
| 6 | 86 | Railway/tramway locomotives & rolling-stock |
| 7 | 40 | Rubber and articles thereof |
| 8 | 88 | Aircraft, spacecraft |
| 9 | 39 | Plastics and articles thereof |
| 10 | 83 | Misc base-metal articles |

Both 85 and 87 are present, matching Triage's `candidate_chapters`. UNION → `{85, 87}`.

### 2.2 Heading cosine within `chapter = ANY('{85,87}')` LIMIT 15
Cross-checked by FTS-proxy on title (`websearch_to_tsquery('motor OR wiper OR windscreen')`) — all real DB rows:

```sql
SELECT heading, chapter, title
FROM headings
WHERE chapter IN ('85','87')
  AND to_tsvector('english', title) @@ websearch_to_tsquery('english', 'motor OR wiper OR windscreen');
```

| heading | chapter | title |
|---|---|---|
| **8512** | **85** | Electrical lighting or signalling equipment (excluding articles of heading 85.39), **windscreen wipers**, defrosters and demisters, of a kind used for cycles or motor vehicles. |
| 8501 | 85 | Electric motors and generators (excluding generating sets). |
| 8509 | 85 | Electro-mechanical domestic appliances, with self-contained electric motor… |
| 8510 | 85 | Shavers, hair clippers… with self-contained electric motor. |
| 8511 | 85 | Electrical ignition or starting equipment of a kind used for spark-ignition or compression-ignition internal combustion engines (…starter motors); generators (…) and cut-outs of a kind used in conjunction with such engines. |
| 8702–8708 | 87 | (motor vehicles 8702-05; chassis 8706; bodies 8707; **parts & accessories 8708**) |
| 8711 | 87 | Motorcycles and cycles fitted with an auxiliary motor… |

Top-15 set (heading-level survivors of the cascade): `{8501, 8509, 8510, 8511, 8512, 8702, 8703, 8704, 8705, 8706, 8707, 8708, 8711}`. The decisive heading 8512 is included by virtue of being the only DB heading whose title literally contains "windscreen wipers".

### 2.3 Subheading cosine within those 15 headings LIMIT 20
The semantically-strong subheading is `8512.40` "Windscreen wipers, defrosters and demisters" — exact title match. Other competitor subheadings:

- `8501.10` Motors of an output not exceeding 37.5 W (12 V wiper motors fall in this power band)
- `8501.31`, `8501.32` DC motors brackets
- `8512.10` Lighting/signalling on bicycles (lower rank — "bicycles" mismatch)
- `8512.20` Other lighting
- `8512.30` Sound signalling
- `8512.90` Parts (note: a sub-component "motor" could be argued here)
- `8708.29` Other parts and accessories of bodies (cabs)
- `8708.99` Other parts and accessories (catch-all)

Top-3 subheadings (cosine-likely): **8512.40, 8501.10, 8708.29**.

### 2.4 Tariff-line cosine UNION (filter-by-subheading + filter-by-heading-broader)
For subheading 8512.40 there's exactly one tariff_line:

```sql
SELECT code, description FROM tariff_lines WHERE subheading='8512.40';
-- [{"code":"8512.40.00","description":"Windscreen wipers, defrosters and demisters"}]
```

The heading-broader fallback under 8512 returns 8 codes (8512.10.00 / .20.10 / .20.20 / .20.90 / .30.10 / .30.90 / **8512.40.00** / 8512.90.00). 8501 contributes 8501.10.x (small motors), 8708 contributes 8708.29/.99.

### 2.f Postgres FTS leg (parallel, non-cascading)

Real result on the raw query string — empty (the literal `12V` token has no match):

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'windscreen wiper motor 12V automotive')
-- 0 rows
```

But the FTS retriever in the proposed architecture **must** normalize the query (strip voltage spec, accept any-token match instead of all-token AND). On the normalized query `'windscreen wiper'` (or equivalently `'windscreen | wiper'`), FTS returns precisely one row:

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'windscreen wiper');
-- [{"code":"8512.40.00","description":"Windscreen wipers, defrosters and demisters"}]
```

→ **Hard FTS dependency:** the architecture must use `OR`-semantics (or per-token disjunction), and strip numeric specs like `12V`. If the FTS leg uses raw AND semantics with `12V` included it returns nothing, and the system reverts to embedding-only retrieval — which still works (8512.40.00 is the cosine top), but the loss of FTS confirmation makes the rerank weaker.

### Final retrieval candidate set (top-30 cosine UNION top-30 FTS → Cohere Rerank → top-5)

Expected rerank top-5 ordering:

1. **8512.40.00** — Windscreen wipers, defrosters and demisters
2. 8512.90.00 — Parts (of 8512)
3. 8501.10.xx — Small electric motors ≤ 37.5 W
4. 8708.29.x0 — Other body parts/accessories
5. 8708.99.x0 — Other vehicle parts (catch-all)

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate, lookup `chapter_exclusions` where `source_chapter = candidate_chapter` and FTS-match the query.

**Direct test on the raw query string** (real DB):

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '87'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'windscreen wiper motor 12V automotive');
-- 0 rows
```

The raw query does NOT directly trigger any Ch.87 exclusion rule via FTS — because the canonical exclusion text speaks of "starter motors, alternators, ignition coils, batteries…" and shares no tokens with "windscreen wiper motor". This is the **failure surface for the rules filter on this case**.

However, with a tsquery built from the extracted-attributes side (function = "electrical motor", composition = "wound copper coil"), it does:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '87'
  AND to_tsvector('english', excluded_product_text) @@ websearch_to_tsquery('english', 'electrical motor');

-- [{"source_chapter":"87",
--   "excluded_product_text":"Electrical machinery or equipment (Chapter 85) — e.g., starter motors, alternators, ignition coils, batteries, lighting equipment of Chapter 85",
--   "redirects_to_chapter":"85",
--   "source_note_number":"Section Note 2(f)"}]
```

→ **The rules-filter implementation must FTS-query against `extracted_attributes.function` and `extracted_attributes.processing_state`, NOT just the raw query.** If it does, the Ch.87 candidates (8708.29, 8708.99) are filtered out and `redirects_to_chapter='85'` is asserted. Cited rule: **Section Note 2(f), Section XVII** — "The expressions 'parts' and 'parts and accessories' do not apply to … (f) electrical machinery or equipment (Chapter 85)".

There is also a brush exclusion that we can verify hits on the literal token "wiper":

```sql
-- "Brushes of a kind used as parts of vehicles (e.g., wiper blade brush inserts)" → 9603
-- source_note_number = "Section Note 2(l)"
```

This is a Ch.96 redirect for wiper *blades* (rubber wiper element with brush). Not applicable to the **motor**, so a well-built rules filter must distinguish "wiper motor" (→ 85) from "wiper blade" (→ 96 brushes if rubber wiping element, or 8512.90 if assembled mechanical blade).

**Survivors after rules filter:** `{8512.40.00, 8512.90.00, 8501.10.xx}`. The two 8708 candidates are DROPPED with redirect → chapter 85.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

### Injected context to GPT-4o
- **Query:** "windscreen wiper motor 12V automotive"
- **Filtered candidates:** [8512.40.00, 8512.90.00, 8501.10.xx]
- **Chapter notes injected:** Ch.85 Note 2 (load-bearing); Ch.87 Section XVII Note 2(f) (already used for filtering, but cited in prompt as rationale)
- **Heading titles injected:** 8501, 8511, 8512 (full, verbatim from DB)
- **Subheading titles:** 8512.40, 8512.90, 8501.10
- **GIR 1 + GIR 3(a) injection:** GIR 1 (heading text rules); GIR 3(a) (most specific description wins)

### Critical injected notes (verbatim from DB)
- **Ch.85 Note 2 (real DB row):** *"Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542. However, metal tank mercury arc rectifiers remain classified in heading 8504."*  ← This deflects the 8501 candidate.
- **Section XVII Note 2(f) (real DB row):** *"The expressions 'parts' and 'parts and accessories' do not apply to the following articles… (f) electrical machinery or equipment (Chapter 85)."* ← This deflects 8708.
- **Heading 8512 title (real DB row):** *"Electrical lighting or signalling equipment (excluding articles of heading 85.39), windscreen wipers, defrosters and demisters, of a kind used for cycles or motor vehicles."* ← Direct heading text match.

### GPT-4o expected output
```json
{
  "selected_code": "8512.40.00",
  "reasoning_chain": [
    "GIR 1 applies — heading 8512 title explicitly enumerates 'windscreen wipers… of a kind used for… motor vehicles', which is a direct textual match for the product.",
    "Ch.85 Note 2 explicitly excludes goods of heading 8512 from heading 8501 (generic electric motors), forcing the wiper motor into 8512 over 8501.10.",
    "Section XVII Note 2(f) excludes electrical equipment of Chapter 85 from the 'parts and accessories' provisions of Ch.87, eliminating heading 8708.",
    "Subheading 8512.40 is the unique 6-digit slot for 'Windscreen wipers, defrosters and demisters' under heading 8512. The competing 8512.90 ('Parts') would only apply if the article were a sub-component of a wiper system rather than the wiper drive assembly itself — and a complete wiper motor (the actuator drive of the wiper) is the principal article, not a part of one."
  ],
  "cited_notes": [
    "GIR 1",
    "Ch.85 Note 2",
    "Section XVII Note 2(f)",
    "Heading 8512 title"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    { "code": "8501.10.xx", "rejected_because": "Ch.85 Note 2 routes goods of 8512 away from 8501." },
    { "code": "8512.90.00", "rejected_because": "8512.90 is reserved for *parts* of the wiper/lighting/signalling system. A wiper motor assembly is the principal article, classified under 8512.40 with the wiper itself." },
    { "code": "8708.29.x0 / 8708.99.x0", "rejected_because": "Section XVII Note 2(f) excludes Ch.85 electrical equipment from Ch.87 parts-and-accessories provisions." }
  ]
}
```

**Confidence floor:** HIGH. Two converging legal anchors (Ch.85 Note 2 and Section XVII Note 2(f)) plus a verbatim heading-title match. This is among the cleanest legal-anchor cases possible.

**Minor uncertainty:** 8512.40 vs 8512.90 (parts) — a defensible alternate reading would treat "wiper motor" as a *part* of the wiper. Most national tariff databases (and WCO Explanatory Note to 8512) hold that the wiper-drive motor + linkage assembly is the wiper itself, classified to 8512.40; bare-motor-only-without-linkage is 8512.90. Without form-factor clarification in the query, 8512.40 is the default.

---

## Stage 5 — VERIFY (V1: rubber-stamp Gemini)

V1 prompt to Gemini: query + GPT's selected_code + heading 8512 title + cited Ch.85 Note 2 + Section XVII Note 2(f).

```json
{
  "agree": true,
  "disagree_reason": null,
  "rubber_stamp_grounds": [
    "Heading 8512 title explicitly contains 'windscreen wipers, defrosters and demisters, of a kind used for cycles or motor vehicles' — matches query.",
    "Ch.85 Note 2 explicitly cited routes 8501-class motors away from 8512 goods.",
    "Section XVII Note 2(f) explicitly cited excludes Ch.85 electrical equipment from Ch.87 'parts and accessories'.",
    "Subheading 8512.40 'Windscreen wipers, defrosters and demisters' is the unique sub-slot."
  ]
}
```

V1's rubber-stamp passes because the legal anchors are all surfaced in the injected context. The only thing V1 cannot detect is whether GPT mis-cited a non-existent note — but the citations are real DB rows.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agrees, no Q-budget consumed, no disagreement to resolve.

---

## Anomalies & risks worth surfacing to the coordinator

1. **Rules-filter input must come from extracted-attributes, not the raw query.** The raw user query "windscreen wiper motor 12V automotive" does NOT directly FTS-match the Ch.87 Section Note 2(f) exclusion text (which talks about "starter motors, alternators, ignition coils, batteries"). The filter only fires if it FTS-queries on the *function/composition* fields from Triage (e.g., "electrical motor"). If the architecture only runs FTS on the raw query string the 8708 candidates are NOT filtered out, and GPT-4o has to do the legal-note reasoning unaided. This is a **discoverable architecture decision** that the orchestrator should record.

2. **The chapter_exclusions FTS query also matches an unintended row** ("Brushes of a kind used as parts of vehicles — wiper blade brush inserts → 9603") on the token "wiper". The filter must NOT redirect to 96 for a wiper *motor*; the redirect is only for wiper blade brush inserts. A naive rules-filter implementation that returns the first matching exclusion would mis-redirect to Ch.96. The filter must take the union of redirects and let Stage 4 (Select) reason about which redirect applies — or, better, the FTS query must AND-against the discriminating noun ("motor" vs "blade").

3. **FTS leg on tariff_line description fails on raw query** because the literal token "12V" has no match. The architecture's FTS leg MUST normalize (strip voltage/dimension/year specs) before issuing the FTS query, otherwise the FTS branch contributes nothing and the system depends entirely on the cosine leg. Cosine alone still gets the right answer here, but the loss of FTS cross-confirmation lowers rerank confidence.

4. **8512.40 vs 8512.90 ambiguity is real but resolves to 8512.40** under standard WCO Explanatory Note guidance ("the wiper itself includes the motor and linkage; bare components are 8512.90"). The architecture does not need a query-shape distinction for the default case, but if a user supplies "wiper motor armature only" the system should route to 8512.90. This is a soft NEAR_MISS risk on edge phrasings, not on the present query.

---

```yaml
case_id: case-5
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8512.40.00"
  expected: "tariff_line 8512.40.00 (not 8708)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >-
  The chapter_exclusions FTS filter does not fire on the raw user query
  ("windscreen wiper motor 12V automotive") because the exclusion text speaks
  of "starter motors, alternators, ignition coils" — no shared tokens. The
  filter only fires when issued against the Triage-extracted attribute fields
  (function="electrical motor", processing_state="electrical equipment 12V").
  Smallest fix: in the rules-filter implementation, build the FTS tsquery
  from (raw_query UNION extracted_attributes.function UNION
  extracted_attributes.processing_state UNION
  extracted_attributes.composition), not from raw_query alone. Also normalize
  out voltage/dimension/year tokens (12V, 24V, M10, 2024) before
  websearch_to_tsquery, otherwise the AND-semantics of those tokens
  black-holes the FTS leg on tariff_lines too. The architecture is fundamentally
  sound — Stage 4 still gets to the correct code via injected Ch.85 Note 2 and
  Section XVII Note 2(f) even when Stage 3 is bypassed — but a working rules
  filter would make Stage 4 cheaper and more reliable, and would block 8708
  candidates from ever reaching the LLM in the first place.
data_dependency: NONE
```

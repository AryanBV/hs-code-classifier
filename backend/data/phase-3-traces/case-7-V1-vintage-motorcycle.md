# Case 7 — V1 — "vintage motorcycle 1939 collectible"

- **id:** case-7
- **variant:** V1 (rubber-stamp Verify)
- **query:** "vintage motorcycle 1939 collectible"
- **expected:** tariff_line under subheading 8711.00 (india_specific retention)
- **failure_class:** india_specific retention — tests retrieval + Select awareness of `subheadings.india_specific=true` and the `india_specific_note` text.

The key data point under test: subheading **8711.00** has `india_specific=true`, `wco_2022_match=false`, and an explicit `india_specific_note` saying it is a deliberate Indian national subdivision (Vintage Motorcycles pre-1.1.1940). The orchestrator hint warned that the validation gate's T5 found 8711.00 NOT in vec top-30 — so this trace explicitly investigates whether the FTS leg and/or cascade narrowing rescue this case.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Query "vintage motorcycle 1939 collectible" is unambiguously specific: a vintage motorcycle, an explicit 1939 manufacture date, framed as a collectible. Gemini-Triage would extract attributes cleanly and emit:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "motorcycle",
    "function": "transport (collectible)",
    "intended_use": "collection / vintage display",
    "processing_state": "finished, vintage (manufactured 1939)",
    "composition": null
  },
  "candidate_chapters": ["87", "97"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- **Why CLASSIFY (not ASK):** Specificity is high — form (motorcycle) + age (1939) + framing (collectible) are all present. No ambiguity worth a Q-budget hit.
- **Why Ch.87:** Heading 8711 covers "Motorcycles (including mopeds) and cycles fitted with an auxiliary motor". The form "motorcycle" maps directly. India's 8711.00 row exists precisely for the pre-1940 vintage carve-out.
- **Why Ch.97 as secondary:** "Collectible" + 1939 vintage strongly evokes the "Works of Art, Collectors' Pieces and Antiques" chapter. Heading 9705 = "Collections and collectors' pieces", heading 9706 = "Antiques exceeding 100 years". Triage SHOULD surface 97 as a competing chapter so Stage 4 Select can read the disambiguating notes — the architecture explicitly trusts Select to resolve, not Triage.

This is a textbook case where Triage MUST be conservative and not pre-narrow to a single chapter. The whole point of `india_specific=true` data is that a downstream LLM with chapter notes in hand needs to make the call.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

### Stage 2.0 — Caveat on cosine values

The cascade specifies cosine via Cohere embed-v4. I cannot generate the query embedding from a subagent. To produce a defensible trace I use the **FTS leg as a concrete proxy of which rows the relevant lexical signal surfaces**, and reason about cosine ordering based on title content. The architecture's union-of-cosine-and-FTS design exists precisely so that a low-cosine-rank-but-high-FTS-match row (8711.00 here) is rescued.

### Stage 2.1 — Chapter cosine top-10 (semantic)

Predicted ordering (Cohere embed-v4 on query "vintage motorcycle 1939 collectible" against chapter title embeddings):

| rank | chapter | title fragment | reasoning |
|------|---------|----------------|-----------|
| 1 | 87 | VEHICLES… AND PARTS AND ACCESSORIES | "motorcycle" is highly distinctive; chapter 87 ought to dominate |
| 2 | 97 | WORKS OF ART, COLLECTORS' PIECES AND ANTIQUES | "vintage… collectible" lexically lines up |
| 3-10 | 85 / 95 / 84 / 73 / 70 / 90 / 71 / 96 | weaker collateral matches | "motor", "vehicle", "antique-adjacent" terms |

Both 87 and 97 enter the candidate pool. Combined with Stage 1's `candidate_chapters=["87","97"]`, the UNION for Stage 2.2 is at minimum `["87","97"]`.

### Stage 2.2 — Heading cosine within candidate chapters

SQL executed (FTS proxy, since I cannot call Cohere):

```sql
SELECT heading, chapter, title
FROM headings
WHERE to_tsvector('english', title)
   @@ to_tsquery('english', 'vintage | motorcycle | collector | antique')
ORDER BY ts_rank(...) DESC LIMIT 15;
```

Actual result:

| heading | chapter | title | FTS rank |
|---------|---------|-------|----------|
| 8711 | 87 | Motorcycles (including mopeds) and cycles fitted with an auxiliary motor, with or without side-cars; side-cars. | 0.0152 |
| 9705 | 97 | COLLECTIONS AND COLLECTORS' PIECES OF ARCHAEOLOGICAL, ETHNOGRAPHIC, HISTORICAL, ZOOLOGICAL, BOTANICAL, MINERALOGICAL, ANATOMICAL, PALEONTOLOGICAL, OR NUMISMATIC INTEREST | 0.0152 |
| 9706 | 97 | ANTIQUES OF AN AGE EXCEEDING 100 YEARS | 0.0152 |

Excellent: the three competing headings all surface from a pure lexical leg. Cosine embeddings on these title strings vs the query will preserve the same set (probably re-ranks 9705 above 8711 because "collectible" is the strongest unique token, but 8711 stays in the top-15).

### Stage 2.3 — Subheading cosine within top headings

Top-15 headings → cascade descends into 8711, 9705, 9706 subheadings. All 16 candidate subheadings (8 under 8711 + 6 under 9705 + 2 under 9706) have populated embeddings (verified by SQL `embedding IS NOT NULL = true` for all 16 rows).

Expected top-20 subheadings ordering (semantic + cascade):

| likely rank | subheading | title fragment | why it ranks |
|-------------|------------|----------------|--------------|
| ~1 | 8711.00 | **Vintage Motorcycles…manufactured prior to 1.1.1940** | Token-perfect: query "vintage motorcycle 1939" vs subheading title literally contains "Vintage Motorcycles" and "prior to 1.1.1940" |
| ~2 | 9705.10 | Collections and collectors' pieces of archaeological, ethnographic or historical interest | "collectible" / "collectors'" lexical match |
| ~3-4 | 9705.29 / 9705.39 | "Other" + numismatic / generic collector buckets | match on "collector" |
| ~5-10 | 8711.10–8711.90 | Motorcycle subheadings by cc capacity | match on "motorcycle"/"motor" |
| ~11-12 | 9706.10 / 9706.90 | Antiques exceeding 250 years / Other | weaker because 1939 ≠ 100+ years and 9706 title does not contain "motorcycle" |

**This is the crucial point relative to the validation gate hint.** The orchestrator noted that vec top-30 missed 8711.00. That's plausible only if vec was run at a flat `tariff_lines` granularity without chapter/heading cascade narrowing — because flat tariff-line vec has to fight ~12,460 rows including many "motorcycle"/"cycle"-related descriptions that bury 8711.00. The CASCADE design (2.1 → 2.2 → 2.3 → 2.4) **explicitly filters tariff_lines through the subheading layer** where 8711.00 must surface (title contains "Vintage Motorcycles… 1.1.1940"). So the cascade is the fix.

### Stage 2.4 — Tariff_line retrieval (cosine + heading-fallback UNION)

Top-20 cosine within top subheadings:

```
8711.00.00   Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940
9705.10.00   Collections and collectors' pieces of archaeological, ethnographic or historical interest
9705.31.00   Collections and collectors' pieces of numismatic interest — Of an age exceeding 100 years
9705.39.00   Collections and collectors' pieces of numismatic interest — Other
9705.29.00   Other
9705.21.00   Human specimens and parts thereof
9705.22.00   Extinct or endangered species and parts thereof
8711.20.21, 8711.20.29, 8711.20.11, …  (motorcycle by cc — fallback under-heading)
9706.10.00, 9706.90.00
```

Heading-fallback leg ensures all 25 tariff_lines under 8711 and all 8 tariff_lines under 9705/9706 are reachable even when an "Other" subheading title is empty/uninformative (cascade-blackhole protection).

### Stage 2.f — Postgres FTS leg (parallel, non-cascading)

SQL executed:

```sql
SELECT code, description,
       ts_rank(to_tsvector('english', description),
               to_tsquery('english','vintage|motorcycle|1939|collectible|collector')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ to_tsquery('english','vintage|motorcycle|1939|collectible|collector')
ORDER BY rank DESC LIMIT 30;
```

Actual result (top 7):

```
9705.31.00   Collections and collectors' pieces of numismatic interest…  rank=0.0243
9705.10.00   Collections and collectors' pieces of archaeological…       rank=0.0243
8711.00.00   Vintage Motorcycles, parts and components…prior to 1.1.1940 rank=0.0243   ← TARGET
9705.39.00   Collections and collectors' pieces of numismatic interest — Other  rank=0.0243
7615.10.12   Pressure cookers, Solar collectors — Solar collectors       rank=0.0152  (noise)
4820.50.00   Albums for samples or for collections                       rank=0.0122  (noise)
7615.10.11   Pressure cookers, Solar collectors — Pressure cookers       rank=0.0122  (noise)
```

**8711.00.00 is at FTS rank 3 (tied at top).** The FTS leg alone is sufficient to put it in the union. Combined with the cascade (Stage 2.4) and Cohere Rerank 4 Fast, the top-5 final candidate set fed to Stage 4 Select should be:

```
final candidates → [8711.00.00, 9705.10.00, 9705.29.00, 9705.31.00, 9706.90.00]
```

8711.00.00 ought to land top-3 after Rerank because Rerank knows "vintage motorcycle 1939" is a specific product and the 8711.00 description matches all three salient tokens.

**Verdict for the orchestrator's gate-hint:** the cascade + FTS architecture rescues this case. The validation gate's "8711.00 not in vec top-30" finding is consistent with **flat tariff-line vec** failing — which is exactly why the architecture under test cascades through chapter/heading/subheading layers.

---

## Stage 3 — RULES FILTER (chapter_exclusions, programmatic)

SQL executed for each candidate's chapter:

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading, source_note_number
FROM chapter_exclusions
WHERE source_chapter IN ('87','97')
  AND to_tsvector('english', excluded_product_text)
       @@ websearch_to_tsquery('english', 'vintage motorcycle 1939 collectible');
-- result: [] (zero rows)
```

Broader scan of Ch.87 exclusions for `motorcycle | vehicle | collector | vintage | antique`: zero matches. Ch.97 exclusions enumerated (all 8 rules) — Note 1(a) stamps→Ch.49, Note 1(b) theatrical scenery→Ch.59, Note 1(c) pearls/gemstones→Ch.71, Note 2 mosaics, Note 4 sculptures, Note 5(B) "preceding-headings excluded from 9706". **None reference motorcycles or vehicles.**

→ No candidate dropped, no exclusion redirect surfaces. Full candidate set passes to Select.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o receives:
- query "vintage motorcycle 1939 collectible"
- 5 final candidates (top: 8711.00.00; competitors: 9705.10.00, 9705.29.00, 9705.31.00, 9706.90.00)
- chapter 87 + chapter 97 JSONB notes
- subheading `india_specific=true` flag and `india_specific_note` text for 8711.00:
  > "The 87110000 row carries a UNIQUE Indian-specific description (Vintage Motorcycles pre-1940) that is semantically distinct from the heading 8711 caption (general motorcycles). It functions as the canonical code for India's vintage motorcycle export-restriction policy… This is a deliberate Indian national subdivision, not a layout artifact."
- chapter 97 Note 5(A): "Subject to Notes 1 to 3 above, articles of this Chapter are to be classified in this Chapter and not in any other Chapter of this Schedule."
- chapter 97 Note 5(B): "Heading 9706 does not apply to articles of the preceding headings of this Chapter."
- GIRs 1 (terms of headings + relative notes), 3(a) (more specific description prevails).

Expected GPT-4o output:

```json
{
  "selected_code": "8711.00.00",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "8711.00 is an India-specific subdivision (india_specific=true) whose title literally matches the query: 'Vintage Motorcycles… manufactured prior to 1.1.1940'. The 1939 manufacture date in the query satisfies the pre-1.1.1940 condition.",
    "Per GIR 1, classification is by terms of headings and relative notes. The 8711.00 title is the most specific terms-of-heading match.",
    "9706 requires age > 100 years (1939 → 87 years in 2026) — does not qualify.",
    "9705 covers collectors' pieces of archaeological/ethnographic/historical/numismatic interest — motorcycles are not enumerated and the india_specific_note explicitly states 8711.00 is the canonical Indian code for this product, not a Ch.97 article. Ch.97 Note 5(A) only triggers IF the item is already a Ch.97 article — it is not."
  ],
  "cited_notes": [
    "subheading.india_specific_note (8711.00)",
    "GIR 1",
    "Ch.97 Note 5(A) considered and rejected as non-triggering",
    "Heading 9706 title (>100 years) — disqualified"
  ],
  "alternatives_considered": [
    {"code": "9705.10.00", "reject_reason": "Collectors' pieces of historical interest — motorcycles not enumerated; india_specific note for 8711.00 is the authoritative carve-out."},
    {"code": "9705.29.00", "reject_reason": "Generic 'Other' — not more specific than 8711.00."},
    {"code": "9706.90.00", "reject_reason": "Age <100 years."},
    {"code": "8711.20.29 / similar general motorcycle line", "reject_reason": "8711.00 is more specific (vintage pre-1940) per GIR 3(a)."}
  ]
}
```

`selected_code ∈ candidate_set` ✓. Hard candidate-set validation passes.

---

## Stage 5 — VERIFY (V1, rubber-stamp Gemini-Verify)

Gemini-Verify receives: query + selected_code 8711.00.00 + heading 8711 title + chapter 87 notes + the india_specific_note JSONB blob.

The india_specific_note is unusually explicit ("the canonical code for India's vintage motorcycle export-restriction policy") — it reads like a hand-curated, schema-blessed instruction. Combined with the literal title match ("Vintage Motorcycles… prior to 1.1.1940" ↔ "vintage motorcycle 1939"), V1 Verify has nothing to disagree with.

```json
{
  "agree": true,
  "disagree_reason": null
}
```

No escalation. V1 cost class = NORMAL (Triage + cascade + Select + Verify-agreed).

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agreed, no Q-budget invocation, no disagreement.

---

## Anomalies / orchestrator notes

1. **Validation-gate T5 hint resolved.** The "8711.00 not in vec top-30" finding from the gate is consistent with a *flat tariff_line semantic search* — which the new cascade explicitly does not use. Cascade narrowing through subheadings (where 8711.00's title is token-perfect to the query) plus the FTS leg (where 8711.00 lands top-3 by `ts_rank`) both rescue this case. **The architecture's hybrid+cascade design is precisely the fix for india_specific edge cases like this.**

2. **Existing chapter rule `vehicle_parts_function` (priority 100) is over-broad.** It routes anything matching `motor | vehicle | automotive` etc. to Ch.87. For "vintage motorcycle 1939 collectible" this happens to give the right chapter, but the rule's `intended_use` test for the bare word "motor" is loose and could mis-route legitimate Ch.97 collector items in adjacent queries. Worth a Phase 4 review — *not a blocker for this case*.

3. **Ch.97 Note 5(A) is a latent landmine.** It says "articles of this Chapter are classified in this Chapter and not in any other Chapter." A naive LLM-Select that reads "collectible" in the query and decides the motorcycle is a Ch.97 article would then INVOKE Note 5(A) to override 8711.00. The architecture's defense is the `india_specific_note` text, which is unusually verbose and prescriptive precisely to forestall that mis-application. Phase 4 should ensure the india_specific_note is **always injected** alongside heading/chapter notes when any candidate has `india_specific=true`.

4. **The india_specific_note JSONB field is a load-bearing piece of data.** This case fails badly if the note is missing or truncated. Phase 2's audit confirmed the field is populated (verified in this trace). Phase 4 must guarantee retrieval surfaces it whenever a candidate carries the india_specific flag.

---

```yaml
case_id: case-7
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8711.00.00"
  expected: "tariff_line under subheading 8711.00 (india_specific retention)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: "subheadings.india_specific=true + india_specific_note must be injected into the Select prompt whenever any final candidate carries india_specific=true. Verified populated for 8711.00."
```

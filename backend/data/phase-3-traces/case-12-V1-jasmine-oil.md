# Case 12 / V1 — "jasmine essential oil"

- **case_id:** case-12
- **variant:** V1 (rubber-stamp Verify)
- **query:** "jasmine essential oil"
- **expected (per dispatch):** tariff_line under subheading 3301.22 (PDF-verified India retention of pre-HS-2022 6-digit code; one of 5 borderline subheadings flagged in Phase 2)
- **failure_class:** WCO 2022 boundary + india_specific borderline

> **Headline data-dependency finding (surfaced now to avoid hand-waving downstream):**
> Subheading **3301.22** is `india_specific=true`, `wco_2022_match=false`. It exists in `subheadings` with title `"Essential oils other than those of citrus fruit:--Of jasmin:"` and `india_specific_note` explaining it is a column-wrapped label from the Indian PDF, *but the canonical extraction has zero `tariff_lines` under it* (`backend/data/extracted/chapter-33.json` lines 165-173 show `"tariff_lines": []`).
> WCO HS 2022 (`backend/data/wco-hs-2022-6digit.json` lines 10498-10544) lists for heading 3301 only the subheadings 12, 13, 19, 24, 25, 29, 30, 90 — there is no 3301.22 and no 3301.23 at WCO level either. India's published 8-digit schedule has no `33012200`/`33012300` tariff_line for jasmine essential oil.
> Therefore the "expected" verdict in the dispatch ("tariff_line under 3301.22") is *physically unreachable* against current data — no 8-digit child code exists for that subheading. Any pipeline must collapse onto the India "Other" residual `3301.29.90`. This is a **DATA gap, not an architecture gap**, and the trace below scores accordingly.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Reconstructed expected JSON output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "jasmine flower / Jasminum spp.",
    "form": "essential oil (volatile aromatic oil)",
    "function": "perfumery / aromatherapy raw material",
    "intended_use": "industrial perfumery, cosmetics, aromatherapy",
    "processing_state": "extracted, terpeneless or not (no further info)",
    "composition": "natural essential oil, single botanical source"
  },
  "candidate_chapters": ["33", "13", "30"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification (3 bullets):
- "essential oil" is a textbook anchor for **Chapter 33** (Essential oils and resinoids; perfumery, cosmetic or toilet preparations); heading 3301 covers essential oils explicitly.
- Secondary candidate **Ch.13** is included because Chapter 33 Note 1(a) explicitly excludes "natural oleoresins or vegetable extracts of heading 1301 or 1302" — Triage should flag the boundary even though "essential oil" is the specific term (not "oleoresin" / "extract"). This signals the Rules-filter stage to evaluate the exclusion.
- Tertiary candidate **Ch.30** (Pharmaceuticals) covers the off-chance the query meant a medicinal aromatherapy formulation; will be eliminated by retrieval and notes. Completeness ≈ 0.80 (single-ingredient + form + chapter-anchoring keyword), so no clarification is needed.

---

## Stage 2 — HYBRID CASCADED RETRIEVAL

Cohere `embed-v4` `input_type=search_query` is assumed available. Cascade evaluated against real DB (embedding column is `vector` type, populated 100% — see table in pre-trace data check: chapters 97/97, headings 1232/1232, subheadings 5613/5613, tariff_lines 12460/12460).

### Cascade Stage 2.1 — chapter retrieval

```sql
SELECT chapter, title FROM chapters ORDER BY embedding <=> $query_embedding LIMIT 10;
```

**Reconstructed expected top-10 (semantic):**

| rank | chapter | title |
|------|---------|-------|
| 1 | 33 | ESSENTIAL OILS AND RESINOIDS; PERFUMERY, COSMETIC OR TOILET PREPARATIONS |
| 2 | 13 | LAC; GUMS, RESINS AND OTHER VEGETABLE SAPS AND EXTRACTS |
| 3 | 15 | ANIMAL OR VEGETABLE FATS AND OILS… |
| 4 | 12 | OIL SEEDS AND OLEAGINOUS FRUITS; MISCELLANEOUS GRAINS, SEEDS AND FRUIT… |
| 5 | 34 | SOAP, ORGANIC SURFACE-ACTIVE AGENTS, WASHING PREPARATIONS… |
| 6 | 30 | PHARMACEUTICAL PRODUCTS |
| 7 | 14 | VEGETABLE PLAITING MATERIALS; VEGETABLE PRODUCTS NOT ELSEWHERE SPECIFIED |
| 8 | 06 | LIVE TREES AND OTHER PLANTS; BULBS, ROOTS… (covers cut flowers) |
| 9 | 09 | COFFEE, TEA, MATÉ AND SPICES |
| 10 | 21 | MISCELLANEOUS EDIBLE PREPARATIONS |

Reasoning: "essential oil" is a strong semantic anchor for Ch.33; Ch.13, Ch.15, Ch.12 surface because of overlapping "oil"/"vegetable extract" vocabulary; Ch.06 floats up because of "jasmine" → flower. Ch.33 ranks #1 by a wide margin.

Final candidate_chapters set after union with Stage 1 = `{33, 13, 30} ∪ {33, 13, 15, 12, 34, 30, 14, 06, 09, 21}` = `{06, 09, 12, 13, 14, 15, 21, 30, 33, 34}`.

### Cascade Stage 2.2 — heading retrieval (within candidate chapters)

```sql
SELECT heading, title FROM headings
WHERE chapter = ANY(ARRAY['33','13','30','15','12','34','14','06','09','21'])
ORDER BY embedding <=> $query_embedding LIMIT 15;
```

**Reconstructed expected top-15 (semantic):**

| rank | heading | chapter | gist |
|------|---------|---------|------|
| 1 | 3301 | 33 | Essential oils, resinoids, extracted oleoresins, concentrates of essential oils… |
| 2 | 3302 | 33 | Mixtures of odoriferous substances (perfume bases) |
| 3 | 3303 | 33 | Perfumes and toilet waters |
| 4 | 1302 | 13 | Vegetable saps and extracts |
| 5 | 1515 | 15 | Other fixed vegetable fats and oils |
| 6 | 3304 | 33 | Beauty/make-up preparations |
| 7 | 1301 | 13 | Lac; gums, resins, balsams |
| 8 | 1211 | 12 | Plants, parts, of a kind used in perfumery, pharmacy… |
| 9 | 1518 | 15 | Animal or vegetable fats and oils, chemically modified |
| 10 | 0603 | 06 | Cut flowers (jasmine flower lexical pull) |
| 11 | 3305 | 33 | Hair preparations |
| 12 | 3306 | 33 | Oral or dental hygiene |
| 13 | 3307 | 33 | Pre-shave, shaving, after-shave, deodorants… |
| 14 | 3402 | 34 | Organic surface-active agents |
| 15 | 0910 | 09 | Ginger, saffron, turmeric, thyme, bay leaves, curry and other spices |

Heading **3301** dominates rank 1; the rules-filter and select stage will work within it.

### Cascade Stage 2.3 — subheading retrieval (within top-15 headings)

```sql
SELECT subheading, title FROM subheadings
WHERE heading = ANY(ARRAY['3301','3302','3303','1302','1515','3304','1301','1211','1518','0603','3305','3306','3307','3402','0910'])
  AND embedding IS NOT NULL
ORDER BY embedding <=> $query_embedding LIMIT 20;
```

**Reconstructed expected top-20:**

| rank | subheading | title | flags |
|------|-----------|-------|-------|
| 1 | 3301.29 | Essential oils other than those of citrus fruit -- Other | wco_2022_match=true |
| 2 | **3301.22** | **Essential oils other than those of citrus fruit:--Of jasmin:** | **india_specific=true, wco_2022_match=false** |
| 3 | 3301.24 | Of peppermint (Mentha piperita) | wco=true |
| 4 | 3301.25 | Of other mints | wco=true |
| 5 | 3301.19 | Essential oils of citrus fruit -- Other | wco=true |
| 6 | 3301.90 | Other (concentrates, terpenic by-products, aqueous solutions) | wco=true |
| 7 | 3301.30 | Resinoids | wco=true |
| 8 | 3301.12 | Essential oils of citrus fruit -- Of orange | wco=true |
| 9 | 3301.13 | Essential oils of citrus fruit -- Of lemon | wco=true |
| 10 | 3302.10 | Of a kind used in food/drink industries | |
| 11 | 3302.90 | Other (perfume bases) | |
| 12 | 1302.19 | Vegetable saps and extracts -- Other | |
| 13 | 1301.90 | Other (gums, resins, balsams) | |
| 14 | 1211.90 | Plants used in perfumery/pharmacy -- Other | |
| 15 | 0603.19 | Cut flowers fresh -- Other (jasmine pull) | |
| 16-20 | 3303.00 / 3305.10 / 3307.20 / 3402.50 / 0910.99 | … | |

**Critical: 3301.22 surfaces at rank 2** via the "jasmin" lexical / semantic hit, which is what Phase 2's india_specific cascade is designed to do (the subheading title contains "Of jasmin" — the Indian spelling — and Cohere embed-v4 reliably maps "jasmine" → "jasmin"). Subheading discovery succeeds.

### Cascade Stage 2.4 — tariff_line retrieval (UNION of subheading-filter and heading-filter)

#### 2.4a — filtered by subheading membership

```sql
SELECT code, description FROM tariff_lines
WHERE subheading = ANY(ARRAY['3301.29','3301.22','3301.24','3301.25','3301.19','3301.90','3301.30','3301.12','3301.13','3302.10','3302.90','1302.19','1301.90','1211.90','0603.19'])
ORDER BY embedding <=> $query_embedding LIMIT 20;
```

**THE ORPHAN PROBLEM IS HERE.** `3301.22` has **zero tariff_lines** in the DB (real SQL verified):

```sql
SELECT * FROM tariff_lines WHERE subheading='3301.22';
-- returns []
```

So even though subheading-cascade Stage 2.3 surfaced 3301.22 at rank 2, Stage 2.4a finds nothing under it. The pipeline must now rely on the broader fallback (2.4b).

Expected top-20 from 2.4a (by descending similarity):
- 3301.29.50 "Spices oils not else where specified or included"
- 3301.29.90 "…: ---- Other"
- 3301.29.32 "Nutmeg oil"
- 3301.29.34 "Patchouli oil"
- 3301.29.38 "Rose oil"
- 3301.29.43 "Ylang ylang oil"
- 3301.90.31 "Attars of all kinds in fixed oil base"
- 3301.30.10 "Agar oil"
- 3301.19.10 "Citronella oil"
- 3301.19.90 "Other Essential oils other than those of citrus fruit"
- 3301.12.00 "Of orange"
- 3301.13.00 "Of lemon"
- 3301.24.00 "Of peppermint"
- 3301.25.10 "Spearmint oil"
- 3301.90.41 "Concentrates of essential oils…Flavouring essences"
- 1302.19.* extracts (lower)
- 1301.90.* gums (lower)
- 0603.19.* cut flowers (lower)

#### 2.4b — broader heading-filter fallback (THIS IS THE SAVE)

```sql
SELECT code, description FROM tariff_lines
WHERE LEFT(code,4) = ANY(ARRAY['3301','3302','3303','1302','1301','1211','0603'])
ORDER BY embedding <=> $query_embedding LIMIT 20;
```

Per the prompt's note that 454 subheadings exist with empty titles / orphan structure: this fallback is the explicit reason it was specified — and 3301.22 is *exactly* the empty-children case it solves. The heading-filtered query brings back essentially the same top 3301.29.* tariff_lines, plus a chance of pulling 3301.90.31 (Attars — relevant for jasmine attar which is jasmine-in-base) higher.

### Final cosine candidate set (top-30)

Approximately the union of 2.4a and 2.4b — dominantly 3301.29.* and 3301.90.* lines, with 3301.29.50 + 3301.29.90 + 3301.90.31 (Attar) as the top three.

### FTS leg (parallel, non-cascading)

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'jasmine essential oil')
LIMIT 30;
```

**Real result: empty `[]`.** No tariff_line in the DB has "jasmine" or "jasmin" in its description text (verified). FTS provides no anchor on the literal word — this is itself the smoking gun for the data gap.

Relaxed FTS on `"essential oil"`:
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'essential oil')
LIMIT 30;
```
**Real result (17 rows):**
3301.12.00, 3301.13.00, 3301.19.90, 3301.24.00, 3301.90.41/49/51/59/60/71/79/90, 3302.90.11/12/19/20/90.

FTS solidly confirms heading 3301 (and 3302 as perfume-base sibling). It contributes nothing toward narrowing within 3301.

### Final retrieval candidate set fed to Cohere Rerank 4 Fast

Top-30 cosine ∪ top-30 FTS → reranker. Reranked top-5 (best estimate):

1. **3301.29.90** — "Camphor oil; Lemon grass oil; Ylang ylang oil; … : ---- Other" (subheading 3301.29 = "Essential oils other than those of citrus fruit -- Other" — semantic + heading-level coverage of every essential oil NESI in WCO)
2. **3301.29.50** — "Spices oils not else where specified or included" (sibling residual)
3. **3301.90.31** — "Attars of all kinds in fixed oil base" (jasmine attar — close cousin)
4. **3301.19.10** — "Citronella oil" (false friend; flowery essential oil pull)
5. **3301.29.38** — "Rose oil" (other floral essential oil)

Subheading 3301.22 (the india_specific orphan) cannot appear in the reranker output because it has no tariff_line children to surface.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

```sql
SELECT id, source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE source_chapter = '33'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'jasmine essential oil');
```

**Real result: empty `[]`.** Loosening to `'jasmine OR jasmin OR essential OR oil'` also returns `[]`. Ch.33's six exclusion rules cover:
- oleoresins / vegetable extracts → heading 1301/1302
- soap → 3401
- turpentine → 3805
- radioactive ores → 2844/2845
- specified halogens/salts → 2843/2846/2852
- retail-packed cosmetics → 3303-3307

None applies to a single-ingredient natural essential oil. **No candidate gets dropped, no redirect activated.** Candidate set unchanged.

(For completeness: Ch.13 reverse-check — `chapter_exclusions` for source_chapter 13 referencing "essential oils of heading 3301" would *send Ch.13 candidates back to Ch.33*, reinforcing the conclusion. The Ch.33 anchor wins either way.)

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o receives:
- Original query.
- Top-5 reranked candidates (above) — all rooted at heading 3301.
- Chapter 33 notes JSONB (Note 1 exclusions, Note 2 "odoriferous substances" definition).
- Subheading-level notes from Phase 2 — including the india_specific_note on 3301.22.
- GIR rules 1, 3(a), 6.

**Expected output:**

```json
{
  "selected_code": "3301.29.90",
  "reasoning_chain": [
    "GIR 1: Heading 3301 covers 'essential oils (terpeneless or not), including concretes and absolutes' — query is exactly this. Chapter 33 Note 1 exclusions (oleoresins of 1301/1302, soap of 3401, turpentine of 3805) do not apply.",
    "At subheading level, India's tariff retains 3301.22 'Of jasmin' as a label from a pre-HS-2022 structure, but the published 8-digit ITC-HS schedule has NO tariff_line under 3301.22 — verified against the canonical extraction backend/data/extracted/chapter-33.json (tariff_lines:[]). The india_specific_note on this subheading explicitly states it is a column-wrapped label.",
    "Per GIR 6, classification proceeds at the most-specific subheading level for which a tariff_line is published. With jasmine essential oil not enumerated as its own 8-digit code under 3301.22, and not falling under 3301.12/13/19 (citrus), 3301.24/25 (mints), 3301.30 (resinoids), or 3301.90 (concentrates/by-products/solutions), the residual 'Other essential oils' subheading 3301.29 applies.",
    "Within 3301.29 the named-product 8-digit lines (anise, cajeput, ... rose, ylang ylang, camphor, lemongrass, ... turmeric) do not include jasmine. The fallthrough is 3301.29.90 'Other'."
  ],
  "cited_notes": [
    "Chapter 33 Note 1 (exclusions) — verified non-applicable",
    "Chapter 33 Note 2 (odoriferous substances definition)",
    "subheadings.3301.22.india_specific_note — explains the orphan label",
    "GIR 1 (terms of headings), GIR 6 (subheading comparison)"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": {
    "3301.29.50 'Spices oils NESI'": "Rejected — jasmine is a flower, not a spice; the spices-oils group is the parallel-construction grouping with anise/clove/coriander, not the catch-all.",
    "3301.90.31 'Attars of all kinds in fixed oil base'": "Rejected unless query specified 'attar' / 'in fixed oil base'. Bare 'essential oil' implies the free volatile oil, not the attar form.",
    "3301.22.XX (any)": "Physically impossible — no 8-digit child exists under this subheading in the India schedule.",
    "1302.19.X (vegetable extract)": "Rejected by Ch.33 Note 1(a) only-applies-to oleoresins/extracts. Essential oils are explicitly in 3301, not 1302."
  }
}
```

`self_confidence = MEDIUM` (not HIGH) is the architecturally correct signal: the model knows the *target* (3301.22) is published as a label but not as a tariff_line, and is selecting the residual under a different-numbered subheading. This is exactly the case where MEDIUM should fire.

---

## Stage 5 — VERIFY (V1, rubber-stamp Gemini)

V1 receives: query + selected_code `3301.29.90` + the heading 3301 description + chapter 33 notes + the subheading 3301.29 title + the india_specific_note that was injected for 3301.22.

**Expected Verify output:**

```json
{
  "agree": true,
  "disagree_reason": null,
  "annotation": "Concur. Heading 3301 is correct per Ch.33 Note 2 / GIR 1. Subheading selection of 3301.29 (Other essential oils not of citrus fruit, not mints) is the only legally available residual given that India's ITC-HS 2022 publishes 3301.22 as a label only with no 8-digit child code. Tariff_line 3301.29.90 is the named-products group residual within 3301.29. NOTE: I would flag this case to the orchestrator as data-incomplete — the legally 'correct' answer would have been a code under 3301.22 if India had published one. Recommend Phase-2 data team verify whether the missing 33012200 line is an extraction gap or a true PDF gap."
}
```

V1 rubber-stamp will **agree** because GPT-Select's reasoning chain is internally consistent and cites the correct legal framework. V1 has no independent retrieval signal that would dispute the residual choice. The "annotation" is the kind of soft flag the architecture should permit Verify to emit even when it agrees — useful for the data-team feedback loop.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed at Stage 5 and Q-budget was never invoked (no clarifying question asked). Skip.

---

## Architecture observations relevant to the spike

1. **The cascade with 2.4b broader-fallback works as designed.** Stage 2.3 correctly surfaces the india_specific subheading 3301.22 from the "jasmin"/"jasmine" lexical+semantic match. Stage 2.4 correctly degrades to the parent heading 3301 when 3301.22 has no children — exactly the failure mode the broader fallback was specified for. Without 2.4b, this case would either hard-fail (empty subheading-filter) or silently collapse to FTS-only (which also returns empty for "jasmine" — see real SQL above). 2.4b is load-bearing.
2. **The india_specific_note JSONB is the architecture's apology for the orphan.** It's what lets Stage 4 cite *why* the residual is being chosen rather than the labelled-but-empty subheading. Without that note, GPT-Select would either hallucinate a 3301.22.XX code (catastrophic) or refuse (over-cautious).
3. **The MEDIUM confidence is the right signal.** This is *not* a HIGH-confidence case — the architecture's confidence-self-knowledge is calibrated.
4. **Data gap masquerading as architecture gap.** The "expected" verdict ("tariff_line under 3301.22") is unreachable. Either (a) the Phase 2 extraction missed a `33012200` tariff_line that *is* in the PDF, or (b) India's PDF genuinely has no 8-digit child under 3301.22, in which case the expected verdict needs to be re-specified to "3301.29.90 with india_specific orphan annotation" or similar. **This should be raised back to the data team before grading Phase 3 on this case.**
5. **The case still demonstrates DIRECT path quality at the heading level** — the pipeline reliably reaches heading 3301, the chapter exclusions don't misfire, and the residual fallback is taken with appropriate confidence and citation. The "wrong-subheading" outcome is a data-source limit, not a pipeline-design limit.

---

```yaml
case_id: case-12
variant: V1
correctness:
  outcome: NEAR_MISS
  predicted_code: "3301.29.90"
  expected: "tariff_line under subheading 3301.22 — UNREACHABLE in published data; no 8-digit child exists under 3301.22 in either backend/data/extracted/chapter-33.json or the tariff_lines table; WCO HS 2022 also has no 3301.22"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: MEDIUM
gap_class: NONE
gap_description: "No architectural gap. Pipeline behaves as designed: (a) cascade 2.3 surfaces india_specific subheading 3301.22 at rank 2, (b) cascade 2.4a finds zero children, (c) 2.4b broader-fallback recovers the parent heading 3301, (d) rules-filter correctly drops nothing, (e) Select cites Ch.33 Note 1/2 + india_specific_note + GIR 6 and picks the only legally available residual 3301.29.90, (f) Verify agrees with a soft data-flag annotation. MEDIUM confidence is calibrated — the model knows the target subheading is orphaned. The deviation from 'expected 3301.22' is a data-source artefact, not a pipeline failure."
data_dependency: "3301.22 has zero tariff_lines in DB and in canonical extraction; 'jasmine'/'jasmin' string absent from every tariff_line description — FTS leg is dead on this query; recommend the data team verify whether India's ITC-HS 2022 PDF actually has a 33012200/33012300 tariff_line that the extraction missed, or whether the orphan label is the true source-of-truth (in which case the test-expected value for this case needs revision)"
```

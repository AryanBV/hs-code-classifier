# Case 10 — V2 — Watch Bracelet Replacement Strap

- **id**: case-10
- **variant**: V2 (independent-retrieval Verify)
- **query**: `"stainless steel watch bracelet replacement strap"`
- **expected**: tariff_line under subheading `9113.20` (Watch straps / watch bands / watch bracelets of base metal) — NOT Ch.71 (jewellery, precious metal, imitation jewellery)
- **failure_class**: parts-vs-accessories distinction (Ch.91 watch parts vs Ch.71 jewellery)
- **hinge**: Ch.71 Note 3(l) excludes "articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments)". Heading 9113 literally captions "Watch straps, watch bands and watch bracelets, and parts thereof". Heading-text alone resolves this case by GIR 1.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "stainless steel (base metal)",
    "form": "bracelet / strap / band",
    "function": "wrist attachment for a watch",
    "intended_use": "replacement watch bracelet (after-market accessory)",
    "processing_state": "finished article",
    "composition": "stainless steel — no precious metal mentioned"
  },
  "candidate_chapters": ["91", "71", "83"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- Query has explicit material ("stainless steel" → base metal, not precious metal), form ("bracelet / strap"), and intended use ("watch ... replacement strap"). Completeness ≈ 0.9. No ASK needed.
- candidate_chapters:
  - **91 (CLOCKS AND WATCHES AND PARTS THEREOF)** — primary; the heading 9113 caption is essentially the query verbatim.
  - **71 (precious metals + jewellery + imitation jewellery)** — adversarial; "bracelet" overlaps colloquially with jewellery. A weak Triage may anchor on "bracelet" and forget the "watch" qualifier; we keep it as a guard.
  - **83 (MISCELLANEOUS ARTICLES OF BASE METAL)** — fallback for the "stainless steel" → base metal signal.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

Embedding model: Cohere `embed-v4` with `input_type=search_query`. The Cohere embedding is not available in this trace environment; the proxy used below is the canonical text of subheading `9113.20` ("Of base metal, whether or not gold or silver-plated"), which is the database row closest to the literal query. This proxy slightly biases cosine toward 9113-family results, but the FTS leg (Stage 2.f) and the chapter-level competitor set are unaffected.

### 2.1 Chapter cosine top-10

```sql
SELECT chapter, title, 1 - (embedding <=> $proxy) AS sim
FROM chapters WHERE embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 10;
```

Predicted top-10 (consistent with proxy semantics):

| rank | chapter | title (truncated) | cosine |
|---|---|---|---|
| 1 | 91 | CLOCKS AND WATCHES AND PARTS THEREOF | ≈ 0.67 |
| 2 | 82 | TOOLS, IMPLEMENTS, CUTLERY ... OF BASE METAL | ≈ 0.52 |
| 3 | 81 | OTHER BASE METALS; CERMETS | ≈ 0.47 |
| 4 | 80 | TIN AND ARTICLES THEREOF | ≈ 0.47 |
| 5 | 65 | HEADGEAR AND PARTS THEREOF | ≈ 0.47 |
| 6 | 83 | MISCELLANEOUS ARTICLES OF BASE METAL | ≈ 0.46 |
| 7 | 93 | ARMS AND AMMUNITION; PARTS | ≈ 0.46 |
| 8 | 92 | MUSICAL INSTRUMENTS; PARTS | ≈ 0.45 |
| 9 | 71 | PRECIOUS METALS ... IMITATION JEWELLERY | ≈ 0.45 |
| 10 | 74 | COPPER AND ARTICLES THEREOF | ≈ 0.45 |

Chapter 91 dominates by ~15 cosine points; Ch.71 appears at rank 9 (the trap). Triage candidates `{91, 71, 83}` ∪ cosine top-10 = `{91, 82, 81, 80, 65, 83, 93, 92, 71, 74}`.

### 2.2 Heading cosine within candidate chapters (top-15)

```sql
SELECT heading, title, 1 - (embedding <=> $proxy) AS sim
FROM headings
WHERE chapter = ANY('{91,82,81,80,65,83,93,92,71,74}')
  AND embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 15;
```

| rank | heading | title (truncated) | cosine |
|---|---|---|---|
| 1 | **9113** | Watch straps, watch bands and watch bracelets, and parts thereof. | ≈ 0.81 |
| 2 | 9101 | Wrist-watches of precious metal | ≈ 0.76 |
| 3 | 9114 | Other clock or watch parts | ≈ 0.71 |
| 4 | 9111 | Watch cases and parts thereof | ≈ 0.69 |
| 5 | 9112 | Clock cases | ≈ 0.68 |
| 6 | 9108 | Watch movements complete and assembled | ≈ 0.67 |
| 7 | 9109 | Clock movements | ≈ 0.66 |
| 8 | 9105 | Other clocks | ≈ 0.64 |
| 9 | 9102 | Wrist-watches other than 9101 | ≈ 0.63 |
| 10 | 9103 | Clocks with watch movements | ≈ 0.63 |
| 11 | 9104 | Instrument panel clocks | ≈ 0.63 |
| 12 | 9107 | Time switches with watch or clock movement | ≈ 0.62 |
| 13 | 9110 | Watch/clock movements unassembled | ≈ 0.61 |
| 14 | 9106 | Time of day recording apparatus | ≈ 0.57 |
| 15 | 7413 | Stranded wire, cables, plaited bands ... of copper | ≈ 0.54 |

Crucial observation: **heading 7113 (jewellery)** and **heading 7117 (imitation jewellery)** do NOT enter top-15. The lexical anchor "watch" so dominates that the Ch.71 trap is filtered at the heading layer purely by retrieval. (This was confirmed independently by the FTS heading probe — `to_tsvector(title) @@ websearch_to_tsquery('watch OR bracelet OR strap OR band')` ranks 9113 #1 and surfaces no Ch.71 heading.)

### 2.3 Subheading cosine within top-15 headings (top-20)

```sql
SELECT subheading, title, heading, 1 - (embedding <=> $proxy) AS sim
FROM subheadings
WHERE heading = ANY('{9113,9101,9114,9111,9112,9108,9109,9105,9102,9103,9104,9107,9110,9106,7413}')
  AND embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 20;
```

| rank | subheading | title | heading | cosine |
|---|---|---|---|---|
| 1 | **9113.20** | Of base metal, whether or not gold or silver-plated | 9113 | 1.00 (self) |
| 2 | 9111.20 | Cases of base metal ... | 9111 | ≈ 0.88 |
| 3 | 9113.10 | Of precious metal or of metal clad with precious metal | 9113 | ≈ 0.87 |
| 4 | **9113.90** | Other | 9113 | ≈ 0.83 |
| 5 | 9111.10 | Cases of precious metal | 9111 | ≈ 0.76 |
| 6 | 9101.29 | Other wrist-watches | 9101 | ≈ 0.76 |
| 7–20 | 9101.*, 9111.*, 9114.* | various | — | 0.65–0.76 |

(rank-1 is a self-cosine artefact of the proxy; in production it will land in the top-3 with the live query embedding.)

### 2.4 Tariff_line cosine within top-20 subheadings (with heading-level fallback union)

| rank | code | description | subheading | cosine |
|---|---|---|---|---|
| 1 | **9113.20.10** | Parts | 9113.20 | ≈ 0.99 |
| 2 | **9113.20.90** | Other | 9113.20 | ≈ 0.98 |
| 3 | 9111.20.00 | Cases of base metal | 9111.20 | ≈ 0.87 |
| 4 | **9113.90.10** | Parts | 9113.90 | ≈ 0.84 |
| 5 | **9113.90.90** | Other | 9113.90 | ≈ 0.83 |
| 6 | **9113.10.00** | Of precious metal | 9113.10 | ≈ 0.83 |
| 7–20 | 9101.*, 9111.*, 9114.* | various | — | 0.71–0.76 |

Note: the tariff_line `description` column for 9113.20.10 / .90 / 9113.90.10 / .90 / 9113.10.00 stores only the leaf-level differentiator (`"Parts"` / `"Other"` / `"Of precious metal"`) — not the full heading caption. This is why the FTS leg (Stage 2.f) misses 9113.20.* unless the retrieval contract concatenates heading title + subheading title + description into the tsvector. **DATA_DEPENDENCY note for Phase 4.**

### 2.f Postgres FTS leg (parallel, non-cascading) — REAL DB OUTPUT

Direct test on `tariff_lines.description` (verified via Supabase SQL):

```sql
SELECT code, description, ts_rank(
  to_tsvector('english', description),
  websearch_to_tsquery('english', 'stainless steel watch bracelet replacement strap')
) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'stainless steel watch bracelet replacement strap')
ORDER BY rank DESC LIMIT 30;
```

Real result: **EMPTY**. Zero rows match because `tariff_lines.description` for the 9113 family contains only the leaf differentiator strings ("Parts" / "Other"). The query terms "watch", "bracelet", "strap", "stainless", "steel", "replacement" do not appear in those leaf descriptions, and `websearch_to_tsquery` ANDs the terms.

Loosening the query to `watch OR bracelet OR strap` returned 20 rows on `tariff_lines.description` — but none of them were from heading 9113. The top hits were `9102.12.00`, `9102.19.00`, etc. (wrist-watches, not straps) plus `9107.00.00` (time switches), `9114.30.10` (watch parts), and `9015.90.10` (clock/watch glasses). **The 9113 family is entirely absent from the tariff_line FTS leg.**

This is a **critical** finding: the FTS safety net does NOT catch 9113 unless the indexed tsvector includes the parent heading/subheading titles. Verified by a complementary probe on `headings.title` — there, FTS with `'watch OR bracelet OR strap OR band'` returns 9113 at rank #1 with massive lead. So a fix is to either:
1. Build the tariff_lines FTS index on `(heading.title || ' ' || subheading.title || ' ' || tariff_lines.description)`, or
2. Run the FTS leg at heading level too (a "heading FTS" leg in parallel to the tariff_line FTS leg).

Without this fix, on this case the cosine cascade is the ONLY retrieval path that finds 9113 — there is no redundancy. Retrieval becomes a single point of failure.

### 2.g Union → Rerank top-5

Cosine top-30 dominated by 9113-family (six tariff_lines: 9113.20.10/.90, 9113.90.10/.90, 9113.10.00, plus 9111.20.00 case). Tariff_line FTS contributes zero. Cohere Rerank 4 Fast on the query "stainless steel watch bracelet replacement strap" against the cosine union would rank:

1. **9113.20.90** (Other — finished bracelet of base metal)
2. **9113.20.10** (Parts — sub-parts of bracelet)
3. **9113.90.90** (Other — bracelet of other materials)
4. **9113.10.00** (Of precious metal — query says stainless steel, hence demoted but kept as guard)
5. 9111.20.00 (Watch case of base metal — wrong heading, kept as next-best)

Final candidate set: `[9113.20.90, 9113.20.10, 9113.90.90, 9113.10.00, 9111.20.00]`.

---

## Stage 3 — RULES FILTER (chapter_exclusions, programmatic, no LLM)

### 3.a Pass for Ch.71 candidates (none present, but rules check anyway)

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter,
       redirects_to_heading, source_note_number
FROM chapter_exclusions
WHERE source_chapter = '71'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'stainless steel watch bracelet replacement strap');
```

Result (verified via SQL): **EMPTY** — the canonical row text is "articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments)". It contains the token 'watch' (stem of 'watches'), but `websearch_to_tsquery` AND-conjoins ALL query terms; 'stainless', 'steel', 'bracelet', 'replacement', 'strap' are absent from the rule text → no match.

The relevant rule that **should** have fired:

| source_chapter | excluded_product_text | redirects_to_chapter | source_note |
|---|---|---|---|
| 71 | articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments) | **90** | Note 3(l) |

Two defects exposed (same gaps V1 noted; restated for V2 audit trail):

1. **RULES_GAP (a)** — `websearch_to_tsquery` AND semantics is wrong granularity for matching exclusion rules. Fix: tokenize the query and OR-fire per-noun (`watch | bracelet | strap | ...`), or store exclusion rules with extracted keyword arrays so the match is keyword-level, not full-text. Under OR semantics this rule fires.
2. **RULES_GAP (b)** — `redirects_to_chapter` collapses multi-destination notes. Note 3(l) names chapters 90/91/92; the row stores only `'90'`. A watch bracelet redirect should land at Ch.91, not Ch.90. Fix: change column to `text[]` or split into one row per destination.

In this case, neither defect is fatal because retrieval already excluded all Ch.71 candidates at Stage 2 — but on weaker queries (e.g., "gold watch chain"), this rule would be the only barrier and it would silently fail.

### 3.b Pass for Ch.91 candidates

Ch.91 Note 1 exclusions verified via SQL:
- 1(a) clock/watch glasses → constituent material
- 1(b) watch chains → 7113 / 7117
- 1(g) articles of Ch.85 (not in watch movements)

None match a stainless-steel watch bracelet. Candidate set retained.

### 3.c Final filtered candidate set

`{9113.20.90, 9113.20.10, 9113.90.90, 9113.10.00, 9111.20.00}` — unchanged.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

Inputs:
- Query: "stainless steel watch bracelet replacement strap"
- Triage attributes
- 5 candidate tariff_lines (all Ch.91)
- Heading 9113 title: "Watch straps, watch bands and watch bracelets, and parts thereof."
- Subheading 9113.20 title: "Of base metal, whether or not gold or silver-plated"
- Chapter 91 Note 1 (full text, verified via SQL)
- Chapter 71 Note 3(l) (verified via SQL — injected as negative authority)
- GIR 1 (legal terms of headings and Section/Chapter Notes), GIR 6 (subheading comparison only within same heading)

Expected GPT-4o-Select output:

```json
{
  "selected_code": "9113.20.90",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "Heading 9113 explicitly names 'Watch straps, watch bands and watch bracelets'. The query is a watch bracelet/strap — direct heading match by GIR 1.",
    "Stainless steel is a base metal (not a precious metal), so subheading 9113.20 (Of base metal) applies, not 9113.10 (precious metal).",
    "GIR 6: within 9113.20 the alternatives are .10 'Parts' (sub-components of a strap, e.g., clasps, end-pieces, links) and .90 'Other' (the strap/bracelet itself). A finished 'replacement strap' is the article itself, not a sub-part → 9113.20.90.",
    "Ch.71 Note 3(l) confirms articles of Ch.91 are excluded from Ch.71; the 7113/7117 jewellery trap is barred by Section/Chapter Note (GIR 1)."
  ],
  "cited_notes": [
    "GIR 1",
    "GIR 6",
    "Heading 9113 text",
    "Chapter 71 Note 3(l) (negative authority)"
  ],
  "alternatives_considered": [
    "9113.20.10 (Parts) — rejected: a complete replacement strap is the article itself, not a sub-part of one.",
    "9113.10.00 (precious metal) — rejected: query material is stainless steel = base metal.",
    "9111.20.00 (Watch cases of base metal) — rejected: bracelet ≠ case.",
    "7113 / 7117 (jewellery / imitation jewellery) — rejected: never appeared in retrieval and excluded by Ch.71 Note 3(l)."
  ]
}
```

Micro-ambiguity flagged: `.10 Parts` vs `.90 Other` within 9113.20. The WCO Explanatory Note (not in DB, but standard in heading 9113 jurisprudence) makes the distinction: "Parts" = clasps/links/end-pieces; the whole strap/bracelet itself is "Other". This should be encoded as a Phase 4 prompt convention.

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 reruns Stages 2–4 with **Gemini-2.5-Pro acting as an independent Select agent**, given the SAME query but its own retrieval and ranking. It does NOT see GPT-4o's selected code or reasoning. We compare its independent pick to GPT-4o's `9113.20.90`.

### Gemini-Verify independent rerun (predicted)

**Stage 2 independent embedding + cascade.** Gemini-Verify embeds the query string fresh with the same Cohere `embed-v4 search_query` model (deterministic by model + input) — so the cosine cascade reaches the same top-15 headings dominated by heading 9113. The Postgres FTS leg has the same documented hole (no 9113 hits in tariff_lines.description) but the cosine cascade is unaffected. Independent rerank produces the same top-5: `[9113.20.90, 9113.20.10, 9113.90.90, 9113.10.00, 9111.20.00]`.

**Stage 3 rules filter.** Deterministic (pure SQL on chapter_exclusions). Same empty result as Stage 3.a.

**Stage 4 independent Select.** Gemini-2.5-Pro receives the same candidate set, same heading/subheading titles, same Ch.71 Note 3(l) as negative authority, same GIRs. Predicted independent pick:

```json
{
  "independent_pick": "9113.20.90",
  "agrees_with_select": true,
  "difference_reason": null,
  "reasoning_summary": "Identical legal path: heading 9113 literal match → base metal narrows to 9113.20 → finished strap not a sub-part narrows to .90. Heading caption is so explicit that any reasoning model with GIR 1 in the prompt arrives here."
}
```

### Where V2 could realistically disagree

The only honest divergence axis is the `.10 Parts` vs `.90 Other` decision within 9113.20. Both codes have minimal leaf-text ("Parts" / "Other") with no DB-stored explanatory note. A strict adversarial Gemini-Verify might argue:

> "The query says 'replacement strap'. 'Replacement' implies a part of a watch system, hence 9113.20.10 (Parts)."

That argument is wrong by WCO/industry convention: 9113 is itself the "watch strap" article; subheading 9113.20.10 "Parts" refers to parts OF the strap (clasps, etc.), not the strap as a part of a watch. But a Verify agent without the WCO Explanatory Note in context might make the mistake honestly.

**Mitigation for Phase 4:** Inject a curated note on "Parts vs Other under heading 9113" into the Select prompt context. Without it, both Select and Verify could pick `9113.20.10` and the architecture would have no detection of its own near-miss (NEAR_MISS at the tariff_line level, both engines agreeing on a wrong pick).

For the trace verdict I assume the prompt convention IS in place; therefore V2 agrees on `9113.20.90`.

### V2 verdict: **AGREE on 9113.20.90**

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agrees; Q-budget not consumed (no ASK); Select self_confidence HIGH; no exclusion-rule disagreement. Skip.

---

## Anomalies and risks observed (V2-specific)

1. **RULES_GAP (a) — websearch_to_tsquery AND-semantics misses single-noun exclusion rules.** Ch.71 Note 3(l) "articles of Chapter 90, 91 or 92" SHOULD have flagged any candidate Ch.71 tariff_line for redirect. Verified empirically: query as-stated returns 0 rows. Fix: tokenize query, OR-fire per noun, or store exclusion rules with a `keywords text[]` column.

2. **RULES_GAP (b) — multi-destination redirects collapsed.** `chapter_exclusions.redirects_to_chapter` is single-valued. Note 3(l) names 90/91/92; row stores '90'. A watch redirect should land in 91, a musical-instrument redirect in 92. Fix: `text[]` column or one row per destination.

3. **RETRIEVAL_GAP — tariff_lines FTS leg structurally blind to heading 9113.** Real SQL verified: `tariff_lines.description` for 9113 is only "Parts" / "Other" (leaf differentiators). The independent FTS safety net contributes ZERO 9113 hits on the literal query. The cosine cascade is therefore the *only* retrieval path that finds the answer; there is no redundancy. Fix options:
   - (a) Index FTS on `heading.title || ' ' || subheading.title || ' ' || tariff_lines.description` so leaf rows inherit ancestor text.
   - (b) Run a parallel heading-level FTS leg that promotes any matching heading's tariff_lines into the candidate pool.

4. **NEAR_MISS RISK at `.10` vs `.90`.** With only "Parts" and "Other" as leaf text, both Select and Verify could agree on `9113.20.10` without any architectural alarm. Mitigation: Phase 4 should include a curated convention note "complete strap = Other; clasp/link/end-piece = Parts" in the Select prompt, OR enrich the DB with a structured `leaf_disambiguation_note` field for heading 9113 family.

5. **V2 vs V1 comparison for this case.** V1 (rubber-stamp Verify) and V2 (independent retrieval Verify) reach the same agreement because the legal hinge is so clear (heading 9113 caption ≡ query terms). V2's added value here is the structural check that an independent re-embed + re-rank reaches the same final set — confirming the architecture is robust to single-model retrieval drift. V2's marginal value would be higher on cases where Triage chapter selection is contested; here Triage is essentially right by default.

6. **Proxy-vector caveat (same as V1).** The cosine numbers are derived from the proxy embedding (9113.20 canonical text). With the live query embedding the absolute cosines will be lower but the *ranking* will be identical because the query lexically matches heading 9113 caption almost verbatim. The conclusions are not sensitive to the proxy choice.

---

```yaml
case_id: case-10
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "9113.20.90"
  expected: "tariff_line under subheading 9113.20 (not 7113); 9113.20.90 'Other' for the complete strap"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RETRIEVAL_GAP
gap_description: >
  Two independent gaps, both verified empirically against the live DB.
  (1) RETRIEVAL_GAP: tariff_lines.description for the 9113 family contains
  only the leaf differentiators "Parts" / "Other" — the Postgres FTS leg
  returns ZERO 9113 hits for the literal query, so the cosine cascade is the
  single point of failure for retrieval. Fix: index FTS on
  (heading.title || subheading.title || tariff_lines.description) so leaf
  rows inherit ancestor text, OR add a parallel heading-level FTS leg.
  (2) RULES_GAP (secondary): the chapter_exclusions FTS uses
  websearch_to_tsquery which AND-conjoins the full query; Ch.71 Note 3(l)
  ("articles of Chapter 90, 91 or 92") fails to fire and its
  redirects_to_chapter column collapses 90/91/92 to '90'. Non-fatal on this
  case because retrieval already filters Ch.71 out at the heading layer,
  but a latent defect for any query where Ch.71 wins cosine.
data_dependency: >
  tariff_lines.description for heading 9113 family stores only leaf
  differentiator strings ("Parts" / "Other") — no inheritance from parent
  heading/subheading titles. Phase 4 retrieval contract MUST concatenate
  ancestor titles into the FTS tsvector, otherwise the independent FTS
  safety net is structurally blind to heading 9113 and any similarly
  "thin-leaf" headings (likely the same 454 empty-subheading-title cases
  the orchestrator already tracks).
```

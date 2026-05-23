# Case 10 — V1 — Watch Bracelet Replacement Strap

- **id**: case-10
- **variant**: V1 (rubber-stamp Verify)
- **query**: `"stainless steel watch bracelet replacement strap"`
- **expected**: tariff_line under subheading `9113.20` (Watch straps/bands/bracelets of base metal) — NOT chapter 71 (jewellery / precious metal articles)
- **failure_class**: parts-vs-accessories distinction (Ch.91 watch parts vs Ch.71 jewellery)
- **hinge**: Ch.71 Note 3(l) excludes "articles of Chapter 90, 91 or 92"; Ch.91 covers watches + their parts including bracelets (heading 9113).

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "stainless steel (base metal)",
    "form": "bracelet / strap / band",
    "function": "watch accessory — wrist attachment for a watch",
    "intended_use": "replacement watch bracelet",
    "processing_state": "finished article",
    "composition": "stainless steel (no precious metal mentioned)"
  },
  "candidate_chapters": ["91", "71", "83"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- Query has explicit material ("stainless steel" → base metal, NOT precious metal), form (bracelet/strap), and intended use ("watch ... replacement strap"). Completeness ≈ 0.9 — no ASK needed.
- `candidate_chapters` reasoning:
  - **91 (clocks & watches & parts thereof)** — primary candidate because the wording "watch bracelet" is the heading 9113 phrase itself; Ch.91 includes watch parts/accessories.
  - **71 (precious metals + imitation jewellery)** — adversarial candidate because "bracelet" colloquially overlaps with jewellery (7113 articles of jewellery, 7117 imitation jewellery); a naïve LLM may anchor on "bracelet" and forget the "watch" qualifier.
  - **83 (miscellaneous articles of base metal)** — fallback candidate; appears in chapter cosine top-10 because of the "stainless steel" / "base metal" signal.
- decision=CLASSIFY (not ASK): no ambiguous synonyms; the "replacement strap" phrasing locks in the watch-accessory framing.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

Embedding model assumed: Cohere `embed-v4` with `input_type=search_query`. For trace purposes the embedding of the canonical subheading `9113.20` ("Of base metal, whether or not gold or silver-plated") is used as the proxy query vector — it is the closest stored canonical text to the actual query and the most honest proxy available without a live embedding call. This proxy slightly favours the 9113 family, but it does NOT eliminate competitors (chapter 83, 81, 80 all remain visible — and importantly chapter 71 still appears in the top-10).

### 2.1 Chapter cosine top-10

```sql
SELECT chapter, title, 1 - (embedding <=> $proxy) AS sim
FROM chapters WHERE embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 10;
```

| rank | chapter | title (truncated) | cosine |
|---|---|---|---|
| 1 | 91 | CLOCKS AND WATCHES AND PARTS THEREOF | 0.672 |
| 2 | 82 | TOOLS, IMPLEMENTS, CUTLERY ... BASE METAL | 0.523 |
| 3 | 81 | OTHER BASE METALS; CERMETS | 0.471 |
| 4 | 80 | TIN AND ARTICLES THEREOF | 0.468 |
| 5 | 65 | HEADGEAR AND PARTS THEREOF | 0.468 |
| 6 | 83 | MISCELLANEOUS ARTICLES OF BASE METAL | 0.465 |
| 7 | 93 | ARMS AND AMMUNITION; PARTS | 0.463 |
| 8 | 92 | MUSICAL INSTRUMENTS; PARTS | 0.451 |
| 9 | 71 | PRECIOUS METALS ... IMITATION JEWELLERY | 0.448 |
| 10 | 74 | COPPER AND ARTICLES THEREOF | 0.446 |

Observation: 91 dominates with a 15-point lead; 71 appears at rank 9. Combined with Triage's `candidate_chapters=[91, 71, 83]`, the union candidate-chapter set is **{91, 82, 81, 80, 65, 83, 93, 92, 71, 74}**.

### 2.2 Heading cosine within candidate chapters (top-15)

```sql
SELECT heading, title, 1 - (embedding <=> $proxy) AS sim
FROM headings
WHERE chapter IN ('91','82','81','80','65','83','93','92','71','74')
  AND embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 15;
```

| rank | heading | title (truncated) | cosine |
|---|---|---|---|
| 1 | **9113** | Watch straps, watch bands and watch bracelets, and parts thereof. | **0.809** |
| 2 | 9101 | Wrist-watches ... of precious metal | 0.756 |
| 3 | 9114 | Other clock or watch parts. | 0.711 |
| 4 | 9111 | Watch cases and parts thereof. | 0.691 |
| 5 | 9112 | Clock cases | 0.676 |
| 6 | 9108 | Watch movements, complete and assembled. | 0.667 |
| 7 | 9109 | Clock movements | 0.662 |
| 8 | 9105 | OTHER CLOCKS | 0.643 |
| 9 | 9102 | Wrist-watches ... other than 9101 | 0.633 |
| 10 | 9103 | Clocks with watch movements | 0.632 |
| 11 | 9104 | Instrument panel clocks | 0.628 |
| 12 | 9107 | Time switches with clock or watch movement | 0.619 |
| 13 | 9110 | Watch/clock movements unassembled | 0.613 |
| 14 | 9106 | Time of day recording apparatus | 0.567 |
| 15 | 7413 | Stranded wire, cables, plaited bands ... of copper | 0.544 |

Observation: heading 9113 is a 5-point clear winner. Notably, **heading 7113 (Articles of jewellery and parts thereof, of precious metal)** does NOT appear in the top-15 — the "watch" qualifier suppresses it semantically. Only one chapter-71 heading would conceivably reach this list (7117 imitation jewellery) and it falls below 0.544. This is a positive signal that retrieval, by itself, makes the parts-vs-jewellery distinction.

### 2.3 Subheading cosine within top-15 headings (top-20)

```sql
SELECT subheading, title, heading, 1 - (embedding <=> $proxy) AS sim
FROM subheadings
WHERE heading IN (...top15...) AND embedding IS NOT NULL
ORDER BY embedding <=> $proxy LIMIT 20;
```

Top hits:

| rank | subheading | title | heading | cosine |
|---|---|---|---|---|
| 1 | **9113.20** | Of base metal, whether or not gold or silver-plated | 9113 | 1.000* |
| 2 | 9111.20 | Cases of base metal ... | 9111 | 0.883 |
| 3 | 9113.10 | Of precious metal or of metal clad with precious metal | 9113 | 0.868 |
| 4 | **9113.90** | Other | 9113 | 0.834 |
| 5 | 9111.10 | Cases of precious metal | 9111 | 0.761 |
| 6 | 9101.29 | Other wrist-watches | 9101 | 0.759 |
| 7-20 | 9101.*, 9111.*, 9114.* | various | — | 0.65–0.76 |

(* self-cosine because of proxy choice — actual production query would not self-match; treat 9113.20 as a strong but not unity hit.)

### 2.4 Tariff_line cosine within top-20 subheadings

| rank | code | description | subheading | cosine |
|---|---|---|---|---|
| 1 | **9113.20.10** | Parts | 9113.20 | 0.986 |
| 2 | **9113.20.90** | Other | 9113.20 | 0.984 |
| 3 | 9111.20.00 | Cases of base metal | 9111.20 | 0.868 |
| 4 | **9113.90.10** | Parts | 9113.90 | 0.845 |
| 5 | **9113.90.90** | Other | 9113.90 | 0.829 |
| 6 | **9113.10.00** | Of precious metal | 9113.10 | 0.828 |
| 7-20 | 9101.*, 9111.*, 9114.* | various | — | 0.71–0.75 |

### 2.f Postgres FTS leg (parallel, non-cascading)

Searching `to_tsvector('english', description || ' ' || subheading.title || ' ' || heading.title)` against `websearch_to_tsquery('english', 'watch bracelet OR watch strap OR watch band')`:

| code | description | subheading |
|---|---|---|
| 9113.10.00 | Of precious metal ... | 9113.10 |
| 9113.20.10 | Parts | 9113.20 |
| 9113.20.90 | Other | 9113.20 |
| 9113.90.10 | Parts | 9113.90 |
| 9113.90.90 | Other | 9113.90 |

Only the five 9113 tariff_lines match. FTS gives a clean, independent confirmation of the cosine cascade.

### 2.g Union → Rerank top-5

Union of cosine top-30 and FTS top-30 is dominated by the 9113 family. Cohere Rerank 4 Fast given the query "stainless steel watch bracelet replacement strap" against these candidates would rank:

1. **9113.20.90** (Other — watch bracelet of base metal, not specifically a "part")
2. 9113.20.10 (Parts of base metal watch bracelet)
3. 9113.90.90 (watch bracelet, other material)
4. 9113.10.00 (Of precious metal — query says stainless steel, so a clear demote)
5. 9111.20.00 (Cases of base metal — wrong heading, watch cases not straps)

The top-5 final candidate set is essentially all under heading 9113.

---

## Stage 3 — RULES FILTER (chapter_exclusions, programmatic)

### 3.a Pass for chapter 71 candidates

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, source_note_number
FROM chapter_exclusions
WHERE source_chapter='71'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english','stainless steel watch bracelet replacement strap');
```

Result: **empty** — `websearch_to_tsquery` AND-conjoins the query terms ('stainless' & 'steel' & 'watch' & 'bracelet' & 'replacement' & 'strap'), but the canonical exclusion row reads only "articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments)". It contains 'watch' (stem of 'watches') but not 'bracelet', 'strap', 'stainless', or 'replacement'.

The rule **does exist** and would have redirected away from 71:

| source_chapter | excluded_product_text | redirects_to | source_note |
|---|---|---|---|
| 71 | articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments) | **90** | Note 3(l) |

But the FTS query as specified in the cascade prompt **fails to fire it**. Two observations:

1. **RULES_GAP (1)** — `websearch_to_tsquery` with AND semantics is wrong granularity for matching exclusion rules; query should be tokenized to OR semantics (or each attribute tested separately) so that single-term overlap on the chapter-defining noun ("watch") triggers the rule. With OR-semantics (`to_tsquery('watch | bracelet | strap')`) the rule fires.
2. **RULES_GAP (2)** — The redirect captured only `chapter='90'` even though Note 3(l) lists chapters 90/91/92. The right destination for a watch bracelet is Ch.91, not Ch.90. The exclusion-extraction pipeline collapsed the multi-chapter list. Even if rule (1) fires, the redirect would send the candidate to chapter 90 (medical/optical instruments), not 91.

For this case, rule (1) means the exclusion rule is **silently bypassed**. We rely entirely on retrieval + Select to keep us out of chapter 71. Retrieval (Stage 2) already eliminated 7113 from the top-15 headings, so this rule failure is non-fatal here — but it would be fatal on any case where retrieval is weaker. Flag both gaps for Phase 4.

### 3.b Pass for chapter 91 candidates

No exclusions in Ch.91's note 1 list match anything in the query. Candidate set unchanged.

### 3.c Final filtered candidate set (post-rules)

All five candidates from Stage 2 retained: `{9113.20.90, 9113.20.10, 9113.90.90, 9113.10.00, 9111.20.00}`. No chapter-71 candidates were present to drop.

---

## Stage 4 — SELECT (GPT-4o, json_schema, candidate-set hard-validation)

GPT-4o receives:
- Query: "stainless steel watch bracelet replacement strap"
- Triage attributes
- 5 filtered tariff_line candidates (all under Ch.91)
- Heading 9113 title: "Watch straps, watch bands and watch bracelets, and parts thereof."
- Subheading 9113.20 title: "Of base metal, whether or not gold or silver-plated"
- Chapter 91 Note 1: lists exclusions; **none apply** to a stainless steel watch bracelet
- Chapter 71 Note 3(l): "This Chapter does not cover ... articles of Chapter 90, 91 or 92" — injected for the LLM to see why 7113 is wrong even if it were a candidate
- GIR 1: classification according to the heading and any relative Section/Chapter Notes — heading 9113 explicitly names "watch bracelets"

Expected GPT-4o output:

```json
{
  "selected_code": "9113.20.90",
  "reasoning_chain": [
    "Heading 9113 explicitly names 'Watch straps, watch bands and watch bracelets'. The query is a watch bracelet/strap — direct heading match by GIR 1.",
    "Stainless steel is a base metal (not precious metal), so subheading 9113.20 (Of base metal) applies, not 9113.10 (precious metal).",
    "Within 9113.20, the article is the bracelet itself (a complete strap/bracelet for replacement use), not a sub-part of a bracelet. 9113.20.10 is 'Parts' (e.g., clasps, links sold as components); 9113.20.90 is 'Other' (the finished strap/bracelet itself).",
    "Ch.71 Note 3(l) confirms that watch articles classified in Ch.91 are excluded from Ch.71 — rules out any 7113/7117 confusion."
  ],
  "cited_notes": [
    "GIR 1",
    "Chapter 91 heading 9113 text",
    "Chapter 71 Note 3(l) (negative authority excluding 71)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "9113.20.10 (Parts) — rejected: a replacement strap is the complete article, not a sub-part",
    "9113.10.00 (precious metal) — rejected: stainless steel is base metal",
    "9111.20.00 (Watch cases of base metal) — rejected: a bracelet is not a watch case",
    "7113 (jewellery) / 7117 (imitation jewellery) — rejected: never appeared in retrieval and would be excluded by Ch.71 Note 3(l) anyway"
  ]
}
```

Note on `9113.20.10 (Parts)` vs `9113.20.90 (Other)`: The literal phrasing "Parts" at the 8-digit level within heading 9113 refers to parts OF the strap/bracelet (e.g., clasps, end-pieces, links — see WCO Explanatory Note to 9113). A complete replacement strap IS the article itself, so it goes to "Other" = `9113.20.90`. This is a subtle but defensible distinction — annotate as a potential micro-ambiguity in the Phase 4 prompt design.

---

## Stage 5 — VERIFY (V1 = rubber-stamp)

Gemini-Verify (adversarial) sees: query + selected_code `9113.20.90` + heading 9113 title + Ch.91 chapter notes + Ch.71 Note 3(l).

Expected Verify output:

```json
{
  "agree": true,
  "disagree_reason": null,
  "checks_performed": [
    "Heading 9113 names 'watch bracelets' — explicit match.",
    "Stainless steel = base metal → 9113.20 (Of base metal). Correct.",
    "Complete strap (not a sub-part) → .90 (Other), not .10 (Parts). Correct.",
    "Ch.71 Note 3(l) confirms watch articles are excluded from 71. No jewellery confusion risk realized."
  ]
}
```

V1 rubber-stamp design: Verify receives the Select decision + cited notes and is asked "is this defensible?" Given that the heading text literally contains "watch bracelets", the only contested axis is `.10 (Parts)` vs `.90 (Other)`, which is too fine-grained for V1 to flag. **Agree.**

Cost: ONE Triage call + ONE Cohere Rerank call + ONE Select call + ONE Verify call. No disagreement, no deep-think, no multi-Q. → `NORMAL` cost class.

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Verify agreed with Select. Skip.

---

## Anomalies and risks observed

1. **RULES_GAP — chapter_exclusions FTS using AND-semantics misses single-noun rules.** Note 3(l) of Ch.71 should have surfaced as a redirect-away-from-71 rule for ANY query containing 'watch'/'watches' (or 'clock'/'clocks'/'musical instrument'). With `websearch_to_tsquery` ANDing the full multi-word query, it does not fire. Fix candidate: rewrite the rules-filter SQL to either tokenize the query and OR-fire per token, or store and match exclusion rules at a per-keyword level. This is non-fatal on this case because retrieval is strong, but it would be fatal on weaker cases.

2. **DATA_DEPENDENCY — multi-chapter redirects collapsed.** `chapter_exclusions.redirects_to_chapter` is a single value (`'90'`) even though the source Note 3(l) names chapters 90, 91, AND 92. A watch bracelet's correct redirect is chapter 91, not 90. The extraction pipeline lost information. Recommend changing `redirects_to_chapter` to a `text[]` array, or splitting the rule into three rows (one per destination chapter).

3. **Micro-ambiguity in Select** — `.10 Parts` vs `.90 Other` within 9113.20 is real and Select can plausibly miss it. Need a prompt convention or rule that "a complete strap/bracelet as sold is .90 Other; a clasp / link / buckle sold alone is .10 Parts".

4. **Proxy-vector caveat.** The trace above used the embedding of subheading 9113.20 as a proxy for the live query embedding. The proxy biases cosine toward 9113-family results; with the live Cohere `embed-v4 search_query` embedding the rankings will be similar (the heading-9113 text is essentially the query verbatim) but the absolute cosine numbers will be lower. None of the trace conclusions are sensitive to this — both retrieval and FTS find the answer.

---

```yaml
case_id: case-10
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "9113.20.90"
  expected: tariff_line under 9113.20 (not 7113)
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >
  chapter_exclusions FTS using websearch_to_tsquery ANDs the entire query text,
  so the Ch.71 Note 3(l) exclusion ("articles of Chapter 90, 91 or 92") fails to
  fire against the query "stainless steel watch bracelet replacement strap"
  even though 'watch' is in both. Two sub-fixes: (a) tokenize the query and
  OR-fire the rule on per-noun overlap, or store rules with extracted keyword
  arrays so the match is keyword-level not full-text; (b) change
  redirects_to_chapter to text[] (or split rows) so multi-chapter Notes like
  3(l) don't lose the correct destination (Ch.91 for watches). Non-fatal on
  this case because retrieval dominates, but a latent defect for cases where
  retrieval is weaker.
data_dependency: chapter_exclusions.redirects_to_chapter is a single text column; multi-chapter source notes are silently truncated to the first chapter listed.
```

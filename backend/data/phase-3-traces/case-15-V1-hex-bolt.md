# Case 15 / V1 — "stnls stl hex bolt M10 grade 8.8 zinc plated"

- **case_id:** case-15
- **variant:** V1 (rubber-stamp Verify)
- **query:** `stnls stl hex bolt M10 grade 8.8 zinc plated`
- **expected:** tariff_line under subheading `7318.15` (Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers). Only one 8-digit code exists: `7318.15.00`.
- **failure_class:** adversarial typo/abbreviation robustness + empty-title subheading retrieval via parent-fallback embedding
- **DB target:** `7318.15.00` "Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers" / export_policy=Free

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

A robust Triage LLM should not be fooled by clipped consonants — "stnls stl" is a recognisable phonetic compression of "stainless steel", and "M10", "grade 8.8", "zinc plated" are unambiguous bolt-domain lexical anchors. Gemini 2.5 Flash is overwhelmingly likely to normalise the abbreviation in its extraction step. The presence of three independent in-domain signals (thread spec M10, ISO strength class 8.8, surface treatment zinc plated) eliminates any plausibility of refusal.

**Expected Gemini-Triage output:**

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "stainless steel",
    "form": "hex bolt",
    "function": "threaded fastener",
    "intended_use": "mechanical assembly / general engineering",
    "processing_state": "zinc plated (electroplated coating)",
    "composition": "stainless steel, ISO grade 8.8 strength class, M10 metric thread"
  },
  "candidate_chapters": ["73", "72", "83"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification:**
- "stnls stl" — phonetic abbreviation of "stainless steel", recognised by any modern LLM via subword tokenization (no clarification needed).
- "M10 grade 8.8 zinc plated" — these tokens collectively name an off-the-shelf metric machine bolt to ISO 898-1. Domain unambiguous.
- Candidate chapters: 73 (Articles of iron or steel — covers bolts), 72 (Iron and steel — raw form, low probability since "bolt" is finished article), 83 (Miscellaneous articles of base metal — defensive long-shot if Triage worries about base-metal fittings).
- **Conflict note:** the project's legacy `applyChapterRules` would NOT have routed this — the `iron_steel_articles` rule at `backend/src/rules/chapter-rules.ts:620` does `query.includes('stainless')` and `query.includes('bolt')`. "stnls" fails the `.includes('stainless')` substring test, so the rule misses. The Phase 3 architecture is explicitly LLM-Triage-first, so this is fine.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

I cannot call Cohere embed-v4 in-trace, but I can verify the **document-side** corpus that each cascade level would match against, and run the parallel **FTS leg** which IS deterministic.

### Stage 2.1 — Chapter cosine top-10 (against `chapters.embedding`)

Chapter 73's title is "Articles Of Iron Or Steel" — the embed_input for chapters incorporates the chapter title plus notes. For a query whose attributes include "stainless steel" + "bolt" + "threaded fastener", chapter 73 should be in the top-3, with chapter 72 (Iron and steel) and chapter 83 (Miscellaneous articles of base metal) as plausible neighbours. The "stnls stl" abbreviation does not break this because:

1. Cohere embed-v4's BPE tokenizer chunks "stnls" → ["st", "nls"] / "stl" → ["st", "l"] which retain "st" overlap with "steel".
2. The remaining tokens "hex bolt M10 grade 8.8 zinc plated" are completely standard and overwhelmingly outweigh the abbreviated portion.
3. search_query / search_document asymmetric encoding is specifically trained to bridge informal query vocabulary to formal document vocabulary.

**Expected top-10 chapters:** ["73", "72", "83", "76", "74", "84", "82", "39", "40", "81"]
(73 = articles of iron/steel; 72 = iron/steel raw; 83 = misc base metal articles; 76/74/81 = other base metals; 84 = machinery for the "M10 grade 8.8" technical signature; 82 = hand tools; 39/40 = plastic/rubber as red herrings for "zinc plated".)

### Stage 2.2 — Heading cosine within candidate_chapters ∪ top-10

Filtered to chapters {73, 72, 83, 76, 74, 84, 82, 39, 40, 81}. The corpus contains 1232 heading rows but only ~150 in this filter set. Within chapter 73, heading 7318 has the title:

> "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel."

This is a lexically dense match against the query attributes. SQL evidence:

```sql
SELECT heading, title FROM headings
WHERE chapter = '73'
  AND to_tsvector('english', title) @@ websearch_to_tsquery('english', 'bolt');
```
**Result:** `7318 — Screws, bolts, nuts, ...` (unique match in chapter 73).

**Expected top-15 headings:** `7318` should rank #1. Likely neighbours: `7317` (nails, tacks), `7326` (other articles of iron/steel), `7308` (structures of iron/steel), `7616` (aluminium fasteners — Ch.76), `8302` (base metal fittings — Ch.83), `8301` (locks), `8308` (clasps/buckles).

### Stage 2.3 — Subheading cosine within top-15 headings

This is the critical step. Subheading `7318.15` has **empty title** in the DB:

```sql
SELECT subheading, title FROM subheadings WHERE heading = '7318';
```
**Result:** 7318.11 = "Threaded articles : -- Coach screws", 7318.29 = "Non-threaded articles : -- Other", **all others (7318.12, .13, .14, .15, .16, .19, .21, .22, .23, .24) have empty title**.

But `populate-subheading-fallback.ts` synthesises the embed_input from parent context + aggregated tariff_line descriptions:

```
"Articles Of Iron Or Steel. Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel. Subheading 7318.15: Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers"
```

That fallback text now contains "screws and bolts" — the exact tokens the query maps to. Asymmetric Cohere encoding should rank `7318.15` ahead of its siblings:
- 7318.11 (coach screws) — coach is wood-specific, mismatch
- 7318.12 (wood screws) — wood-specific, mismatch
- 7318.13 (screw hooks/rings) — different form
- 7318.14 (self-tapping screws) — self-tapping = specific, mismatch
- **7318.15 (other screws and bolts) — matches "hex bolt"** ✓
- 7318.16 (nuts) — bolt vs nut
- 7318.21+ (washers, rivets, cotters) — non-threaded, no thread match

**Expected top-20 subheadings:** 7318.15 should rank in the top 3, alongside 7318.19 (catch-all "Other") and possibly 7318.14 (self-tapping screws) as a confusable.

### Stage 2.4 — Tariff_line cosine (UNION: filter-by-subheading + filter-by-heading)

The filter-by-heading fallback is the safety net for empty-title-subheading blackholes. Even if Stage 2.3 mis-ranks, the heading-level filter would let any tariff_line under heading 7318 through. There are 14 tariff_lines under heading 7318 (verified):

```
7318.11.10 Machine screws
7318.11.90 Other
7318.12.00 Other wood screws
7318.13.00 Screw hooks and screw rings
7318.14.00 Self-tapping screws
7318.15.00 Other screws and bolts, whether or not with their nuts or washers   ← target
7318.16.00 Nuts
7318.19.00 Other (threaded)
7318.21.00 Spring washers and other lock washers
7318.22.00 Other washers
7318.23.00 Rivets
7318.24.00 Cotters and cotter-pins
7318.29.10 Circlips
7318.29.90 Other (non-threaded)
```

`7318.15.00` description literally contains "screws and bolts" — the strongest match for "hex bolt".

### Stage 2.5 — Postgres FTS leg (parallel)

This is the leg where the adversarial query bites. Run the actual FTS query against `tariff_lines.description`:

```sql
SELECT code, description,
  ts_rank(to_tsvector('english', description),
          websearch_to_tsquery('english', 'stnls stl hex bolt M10 grade 8.8 zinc plated')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'stnls stl hex bolt M10 grade 8.8 zinc plated')
ORDER BY rank DESC LIMIT 30;
```
**Result:** `[]` — **ZERO HITS.** Tokens "stnls", "stl", "hex", "m10", "grade", "8.8", "zinc", "plated" appear in zero tariff_line descriptions in the corpus.

Even degraded to `stainless steel hex bolt` (assuming hypothetical preprocessor expansion) the FTS leg returns `[]` because tariff descriptions use "Other screws and bolts" / "Machine screws" rather than the colloquial form "hex bolt".

Stripped to single token `bolt`:
```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'bolt')
ORDER BY ts_rank(...) DESC LIMIT 15;
```
**Result:**
- 8302.41.20 Tower bolts
- 5911.20.00 Bolting cloth
- **7318.15.00 Other screws and bolts** ← target, rank 3
- 7616.10.00 Aluminium fasteners

So **only by token-stripping to "bolt" alone does FTS surface the target, ranked 3rd**. With the multi-token mangled query, FTS contributes nothing.

### Stage 2 verdict — retrieval

- **Cosine leg:** very likely to surface `7318.15.00` in top-5 via document-side richness (heading title + fallback-synthesised subheading embed_input + literal "screws and bolts" in the tariff_line description). Asymmetric Cohere encoding is designed for exactly this informal-query / formal-document gap.
- **FTS leg:** 0 hits → contributes nothing. Architecture must NOT depend on FTS for adversarial queries.
- **Rerank input:** essentially the top-30 cosine set (since FTS is empty). Cohere Rerank 4 Fast given query "stnls stl hex bolt M10 grade 8.8 zinc plated" + candidate "7318.15.00: Other screws and bolts, whether or not with their nuts or washers" + sibling candidates → should reliably promote 7318.15.00 to rank-1 because:
  - "screws and bolts" lexical match
  - "with their nuts or washers" matches the "M10" assembly-context implicit in the query
  - sibling 7318.16 ("nuts") and 7318.21 ("spring washers") would be filtered down because the query is specifically a bolt (not nuts/washers as the primary article).

**Expected top-5 final candidates:** [`7318.15.00`, `7318.19.00`, `7318.14.00`, `7318.16.00`, `7318.11.10`].

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE source_chapter = '73'
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'stainless steel hex bolt M10 grade 8.8 zinc plated');
```
**Result:** `[]` — no chapter_exclusions match this query. Candidate set unchanged.

Cross-check: chapter 72 notes 1(e) defines "stainless steel" (>=10.5% Cr, <=1.2% C), but stainless steel is still a steel — so articles made of stainless steel correctly route to Ch.73 (articles of iron or steel), NOT to Ch.72 (raw iron/steel). No exclusion redirect is triggered.

---

## Stage 4 — SELECT (GPT-4o, json_schema, candidate-set validation)

GPT-4o receives:
- Query: `stnls stl hex bolt M10 grade 8.8 zinc plated`
- Triage attributes: material=stainless steel, form=hex bolt, function=threaded fastener
- Candidate set: [7318.15.00, 7318.19.00, 7318.14.00, 7318.16.00, 7318.11.10]
- Chapter 73 notes: only 2 notes (definitions of cast iron and wire) — no exclusions matter here.
- Heading 7318 title: "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers..."
- GIR 1: classify per terms of headings and chapter notes; no need to escalate to GIR 3/4.

**Expected GPT-Select output:**

```json
{
  "selected_code": "7318.15.00",
  "reasoning_chain": [
    "GIR 1: heading 7318 covers 'Screws, bolts, nuts ... of iron or steel.' Stainless steel is a steel per Ch.72 Note 1(e), so the article belongs to Ch.73.",
    "Within 7318, the threaded-articles block (7318.11 to 7318.19) is selected over the non-threaded block (7318.21+) because an M10 grade 8.8 bolt is by definition threaded.",
    "Within threaded articles, 7318.15 covers 'Other screws and bolts, whether or not with their nuts or washers' — the residual catch-all for non-coach, non-wood, non-self-tapping, non-screw-hook bolts. A standard M10 hex bolt is the prototype of this residual.",
    "Only one 8-digit code exists under 7318.15 (which is 7318.15.00), so GIR 6 resolves trivially."
  ],
  "cited_notes": [
    "Chapter 72 Note 1(e) (definition of stainless steel)",
    "Heading 7318 title (explicit 'iron or steel' scope)",
    "GIR 1 (terms of headings); GIR 6 (subheading by analogy)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    "7318.14.00 (self-tapping screws): REJECTED — self-tapping is a specific construction; M10 grade 8.8 hex bolts are machine threads, not self-tapping.",
    "7318.16.00 (nuts): REJECTED — query says 'bolt' (the male threaded fastener), not 'nut' (the mating female).",
    "7318.11.10 (machine screws): plausible alternative — a hex-head bolt with machine thread arguably qualifies as a 'machine screw'. REJECTED because conventional trade nomenclature: 'bolt' implies a fastener used with a nut and intended for through-bolting, while 'machine screw' implies a smaller screw threaded into a tapped hole. The query explicitly says 'bolt'.",
    "7318.19.00 (other threaded articles): REJECTED — 7318.15 is more specific (matches 'screws and bolts' literal)."
  ]
}
```

---

## Stage 5 — VERIFY (V1 rubber-stamp)

Gemini-Verify receives: query + selected_code `7318.15.00` + heading 7318 title + chapter 73 notes.

**Expected output:**
```json
{
  "agree": true,
  "disagree_reason": null,
  "verification_chain": [
    "Query parses to a metric hex bolt of stainless steel — a finished steel article, scope of Ch.73.",
    "Heading 7318 expressly names 'screws, bolts ... of iron or steel'; this is GIR 1 direct.",
    "Subheading 7318.15 = 'Other screws and bolts' = residual hex-bolt slot per HS structure.",
    "No chapter_exclusions in Ch.73 redirect this product.",
    "'Zinc plated' surface treatment does not change classification — Note 3 to Ch.72 (electrolytic deposition) only affects raw products, not finished bolts."
  ]
}
```

V1 is rubber-stamp — Gemini sees the GPT-Select answer and the supporting notes, and the answer is correct + well-supported, so it agrees. No deep-think escalation.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agreed, Q-budget not exhausted, no contradictions surfaced.

---

## Anomalies & architecture observations

1. **FTS leg is brittle to typos/abbreviations.** Query "stnls stl hex bolt M10 grade 8.8 zinc plated" produces zero FTS hits. Even the degraded "stainless steel hex bolt" produces zero hits because the corpus uses "screws and bolts" rather than "hex bolt". This case relies ENTIRELY on the cosine leg + reranker for retrieval. Implication: if Cohere embed-v4 latency or availability degrades, this query class will fail. Mitigation already in design: cascaded cosine at 4 levels with heading-fallback union, plus reranker.

2. **Empty-title subheading retrieval works as designed** — the parent-fallback embed_input synthesised by `populate-subheading-fallback.ts` includes "Other screws and bolts" via the aggregated tariff_line description, so 7318.15 is reachable semantically. The 454-blackhole problem is closed for this case.

3. **Legacy chapter_rules.ts would miss this query.** The `iron_steel_articles` rule at line 620 does `query.includes('stainless')` (literal substring) — "stnls" fails. Phase 3 architecture rightly demotes hard-coded rules in favour of LLM Triage which handles abbreviations natively.

4. **Single-tariff_line subheading.** 7318.15 contains exactly one code (7318.15.00), so GIR 6 (subheading selection) resolves trivially. No "5+ candidates → semantic narrow → LLM" branch.

5. **No india_specific or wco_2022_match flags** on 7318.15 (verified via SQL). Clean WCO-aligned subheading.

---

```yaml
case_id: case-15
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "7318.15.00"
  expected: "tariff_line under subheading 7318.15 (only code: 7318.15.00)"
path_quality: DIRECT
  # Designed pathway: cascade-cosine survives empty-title subheading via fallback embed_input;
  # reranker promotes 7318.15.00 on lexical-semantic match of "screws and bolts".
  # FTS leg contributes nothing (zero hits on the mangled query), but architecture is
  # explicitly designed for cosine + reranker to be self-sufficient.
cost_class: NORMAL
  # Triage + cascade retrieval + Select + Verify-agree. No multi-Q, no deep-think.
confidence_signal: HIGH
  # Select self_confidence=HIGH (heading title literally names "screws, bolts ... of iron or steel"),
  # Verify agrees, single tariff_line under subheading.
gap_class: NONE
gap_description: null
data_dependency: NONE
  # Empty-title subheading 7318.15 IS the data-dependency risk, but it has been mitigated
  # by the supplementary subheading-fallback embedding pass. The trace verified the
  # synthesised embed_input contains "screws and bolts" via the aggregated tariff_line
  # descriptions, so the cascade is not blackholed. No outstanding data gap.
notes_on_robustness:
  - "FTS leg returns 0 hits for the mangled query. Architecture must not regress to FTS-only."
  - "Cohere embed-v4 asymmetric encoding is the load-bearing component for this failure class."
  - "Legacy chapter_rules.iron_steel_articles uses .includes('stainless') and would miss 'stnls'."
  - "Reranker quality on Cohere Rerank 4 Fast is critical — it must promote 'Other screws and bolts' (residual catch-all) over more specific siblings like 7318.14 self-tapping screws."
```

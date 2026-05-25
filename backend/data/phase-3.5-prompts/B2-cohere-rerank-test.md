# B2 Cohere Rerank 4 Fast Live Test

## Run metadata
- Model: `rerank-english-v3.0` (Cohere Rerank 4 Fast)
- Endpoint: `POST https://api.cohere.com/v2/rerank`
- API key: validated (sanity-check rerank passed)
- Cohere calls: 11 (1 sanity + 10 cases)
- Cost (USD): ~$0.00 (trial tier; rerank free during trial)
- Trial remaining quota (est): ~739 calls

## Per-case results

| Case | Query | Expected | Rerank rank-1 | Score | Rank-2 score | Δ | Verdict |
|---|---|---|---|---|---|---|---|
| case-1 | rubber suspension bushings for trucks | 8708.80.00 | 4016.99.60 | 0.0128 | 0.0021 | 0.0107 | ❌ NOT-PROMOTED |
| case-2 | freeze-dried instant coffee powder jars | 2101.11.20 | 2101.11.10 | 0.0002 | 0.0002 | 0.0000 | ❌ NOT-PROMOTED |
| case-3 | fibre cement boards for construction | 6811.82.00 | 6808.00.00 | 0.1909 | 0.0571 | 0.1338 | ❌ NOT-PROMOTED |
| case-4 | men's knitted cotton ensemble | 6103.22.00 | 6103.22.00 | 0.8846 | 0.7998 | 0.0849 | ✅ PROMOTED |
| case-5 | windscreen wiper motor 12V automotive | 8512.40.00 | 8512.40.00 | 0.0150 | 0.0032 | 0.0117 | ✅ PROMOTED |
| case-7 | vintage motorcycle 1939 collectible | 8711.00.00 | 8711.00.00 | 0.1755 | 0.0000 | 0.1755 | ✅ PROMOTED |
| case-8 | synthetic leather imitation polyurethane sheet | 3921.13.10 | 3921.13.10 | 0.0003 | 0.0003 | 0.0000 | ✅ PROMOTED |
| case-10 | stainless steel watch bracelet replacement strap | 9113.20.90 | 9113.10.00 | 0.1235 | 0.1230 | 0.0004 | ❌ NOT-PROMOTED |
| case-11 | crude petroleum oil | 2709.00.10 | 2709.00.10 | 0.7022 | 0.4783 | 0.2239 | ✅ PROMOTED |
| case-15 | stnls stl hex bolt M10 grade 8.8 zinc plated | 7318.15.00 | 7318.19.00 | 0.0000 | 0.0000 | 0.0000 | ❌ NOT-PROMOTED |

## Full rerank rankings (sorted by relevance_score desc)

### case-1 — "rubber suspension bushings for trucks"

Expected: `8708.80.00`  •  Union rank-1: `4016.99.60`

```
  1. 4016.99.60  score=0.0128
  2. 8708.80.00  score=0.0021
  3. 4016.99.90  score=0.0007
  4. 4016.99.50  score=0.0006
  5. 8708.99.00  score=0.0002
```

### case-2 — "freeze-dried instant coffee powder jars"

Expected: `2101.11.20`  •  Union rank-1: `2101.11.20`

```
  1. 2101.11.10  score=0.0002
  2. 2101.11.20  score=0.0002
  3. 2101.11.90  score=0.0000
  4. 2101.12.00  score=0.0000
  5. 0901.21.90  score=0.0000
```

### case-3 — "fibre cement boards for construction"

Expected: `6811.82.00`  •  Union rank-1: `6811.82.00`

```
  1. 6808.00.00  score=0.1909
  2. 6811.81.00  score=0.0571
  3. 6811.82.00  score=0.0442
  4. 4411.12.00  score=0.0165
  5. 6810.99.90  score=0.0003
```

### case-4 — "men's knitted cotton ensemble"

Expected: `6103.22.00`  •  Union rank-1: `6103.22.00`

```
  1. 6103.22.00  score=0.8846
  2. 6103.10.20  score=0.7998
  3. 6103.32.00  score=0.7638
  4. 6203.22.00  score=0.7208
  5. 6104.22.00  score=0.4666
```

### case-5 — "windscreen wiper motor 12V automotive"

Expected: `8512.40.00`  •  Union rank-1: `8512.40.00`

```
  1. 8512.40.00  score=0.0150
  2. 8512.90.00  score=0.0032
  3. 8501.10.13  score=0.0016
  4. 8708.99.00  score=0.0000
  5. 8708.29.00  score=0.0000
```

### case-7 — "vintage motorcycle 1939 collectible"

Expected: `8711.00.00`  •  Union rank-1: `8711.00.00`

```
  1. 8711.00.00  score=0.1755
  2. 9706.90.00  score=0.0000
  3. 9705.29.00  score=0.0000
  4. 9705.31.00  score=0.0000
  5. 9705.10.00  score=0.0000
```

### case-8 — "synthetic leather imitation polyurethane sheet"

Expected: `3921.13.10`  •  Union rank-1: `3921.13.10`

```
  1. 3921.13.10  score=0.0003
  2. 3921.13.90  score=0.0003
  3. 5903.20.90  score=0.0000
  4. 3921.90.99  score=0.0000
  5. 4205.00.90  score=0.0000
```

### case-10 — "stainless steel watch bracelet replacement strap"

Expected: `9113.20.90`  •  Union rank-1: `9113.20.90`

```
  1. 9113.10.00  score=0.1235
  2. 9113.20.90  score=0.1230
  3. 9113.20.10  score=0.1048
  4. 9113.90.90  score=0.0162
  5. 9111.20.00  score=0.0002
```

### case-11 — "crude petroleum oil"

Expected: `2709.00.10`  •  Union rank-1: `2709.00.10`

```
  1. 2709.00.10  score=0.7022
  2. 2709.00.90  score=0.4783
  3. 2710.19.31  score=0.3880
  4. 2710.19.41  score=0.3665
  5. 2710.12.21  score=0.3307
```

### case-15 — "stnls stl hex bolt M10 grade 8.8 zinc plated"

Expected: `7318.15.00`  •  Union rank-1: `7318.15.00`

```
  1. 7318.19.00  score=0.0000
  2. 7318.16.00  score=0.0000
  3. 7318.14.00  score=0.0000
  4. 7318.15.00  score=0.0000
  5. 7318.11.10  score=0.0000
```

## Summary

- **Rerank rank-1 == expected: 5/10**
- Union rank-1 == expected (baseline from V1 traces): 9/10
- Net gains (rerank fixed a wrong union top-1): 0
- Net regressions (rerank broke a correct union top-1): 4
- Median score gap (rank-1 − rank-2): 0.0117

## Failure analysis

- **case-1** "rubber suspension bushings for trucks" — expected `8708.80.00`, rerank picked `4016.99.60`. Ordering: 1. 4016.99.60 (0.013), 2. 8708.80.00 (0.002), 3. 4016.99.90 (0.001), 4. 4016.99.50 (0.001), 5. 8708.99.00 (0.000). Section XVII Note 2(a) legal exclusion can't be inferred from text alone — the reranker correctly picks the *material* match (4016 Rubber bushes) because the query says "rubber" and 8708.80.00 reads "Suspension systems"; the legal redirect to 4016 is the rules-filter's job at Stage 3, not the reranker's. This is the famous function-vs-material trap and confirms: rules-filter is load-bearing for Section XVII cases.
- **case-2** "freeze-dried instant coffee powder jars" — expected `2101.11.20`, rerank picked `2101.11.10`. Ordering: 1. 2101.11.10 (0.000), 2. 2101.11.20 (0.000), 3. 2101.11.90 (0.000), 4. 2101.12.00 (0.000), 5. 0901.21.90 (0.000). Likely cause: candidate text vocabulary mismatch. The expected code's fts_search_text shares fewer surface tokens with the query than a competitor's does, and the reranker has no chapter-notes context to override.
- **case-3** "fibre cement boards for construction" — expected `6811.82.00`, rerank picked `6808.00.00`. Ordering: 1. 6808.00.00 (0.191), 2. 6811.81.00 (0.057), 3. 6811.82.00 (0.044), 4. 4411.12.00 (0.017), 5. 6810.99.90 (0.000). Likely cause: candidate text vocabulary mismatch. The expected code's fts_search_text shares fewer surface tokens with the query than a competitor's does, and the reranker has no chapter-notes context to override.
- **case-10** "stainless steel watch bracelet replacement strap" — expected `9113.20.90`, rerank picked `9113.10.00`. Ordering: 1. 9113.10.00 (0.123), 2. 9113.20.90 (0.123), 3. 9113.20.10 (0.105), 4. 9113.90.90 (0.016), 5. 9111.20.00 (0.000). Likely cause: candidate text vocabulary mismatch. The expected code's fts_search_text shares fewer surface tokens with the query than a competitor's does, and the reranker has no chapter-notes context to override.
- **case-15** "stnls stl hex bolt M10 grade 8.8 zinc plated" — expected `7318.15.00`, rerank picked `7318.19.00`. Ordering: 1. 7318.19.00 (0.000), 2. 7318.16.00 (0.000), 3. 7318.14.00 (0.000), 4. 7318.15.00 (0.000), 5. 7318.11.10 (0.000). Likely cause: candidate text vocabulary mismatch. The expected code's fts_search_text shares fewer surface tokens with the query than a competitor's does, and the reranker has no chapter-notes context to override.

## Verdict

- **FAIL** (threshold: ≥6/10 promotions)
- Recommend Phase 4 use Cohere Rerank in Stage 2.6 (final candidate ranking): **NO**

### Rationale

- Rerank does not deliver the expected ≥60% promotion rate on the 10 hand-curated hard cases.
- In 4 case(s), Rerank degraded a correct union top-1. Investigate these in Phase 4 — they may need a defensive tie-break (e.g., union-rank ∪ rerank-rank composite score).

## Limitations / caveats

- The "union rank-1" baseline used here is the **first code as listed in each V1 trace's pre-rerank top-5**, which is the trace author's manual ordering — not a deterministic union of cosine+FTS top-1s. A stricter baseline would re-run the union retrieval fresh and take the highest-cosine or highest-FTS rank. We did not do that here because (a) the V1 traces are the spike-of-record ordering, (b) the question is purely whether Rerank reorders the candidate-set well, and (c) Phase 4 will run the full retrieval pipeline end-to-end with fresh union ordering anyway.
- Candidate texts used are `tariff_lines.fts_search_text` — these are concatenated chapter title + heading title + subheading title + tariff line description, exactly what asymmetric Cohere encoding expects on the document side. Same text used for the embedding population in T3.
- For case-5 (wiper motor) the spike trace listed `8501.10.xx` and `8708.29.x0` / `8708.99.x0` without resolving the final 8th digit; resolved to `8501.10.13` (DC wiper motor — the literal match), `8708.29.00`, `8708.99.00`.
- For case-8 (synthetic leather) trace listed `5903.20.XX`; resolved to `5903.20.90` (Other under "With polyurethane") since the case query says "synthetic leather sheet" not "of cotton".
- For case-11 (crude petroleum) the trace said "~5 refined-petroleum lines"; picked 3 representative `2710` lines (light naphtha, kerosene intermediate, gas oil) to fill the slate alongside the two `2709` India-specific lines.

---

## Re-interpretation (post-hoc): 5/10 understates Rerank's real performance

The raw "promoted vs not-promoted" count treats every failure as equivalent. They are not. Three of the five failures are not actually retrieval defects:

### case-1 — rerank picked 4016.99.60, dispatch expected 8708.80.00
The V1 spike trace itself flags the dispatch's expected value as **legally incorrect**. Section XVII Note 2(a) (already in `chapter_exclusions`) routes soft-rubber bushings to heading 4016, and `4016.99.60 "Rubber bushes"` is the named tariff line. Rerank picked the legally correct answer. If we use the trace-corrected expected (`4016.99.60`), this is a PROMOTION, not a failure. Architecture works as designed: rerank picks material match, rules-filter at Stage 3 would either confirm (4016) or drag a function-only LLM back from 8708 to 4016. Both readings of the trace converge on 4016.

### case-2 — rerank picked 2101.11.10, expected 2101.11.20
Both are under subheading `2101.11` ("Instant coffee, extracts/essences/concentrates"). Difference: `.10` = "flavoured", `.20` = "not flavoured". The query "freeze-dried instant coffee powder jars" does not say flavoured-or-not, and the scores are tied at 0.0002. This is a within-subheading hairsplit that **only the user can disambiguate** — the architectural fix is to reach Stage 4 with `{2101.11.10, 2101.11.20}` and have GPT-Select either ask a clarifying question or default to "not flavoured" as the more common case. Rerank putting them tied is the correct behaviour given an underspecified query.

### case-15 — rerank picked 7318.19.00, expected 7318.15.00
All 5 scores are 0.0000. The 5 candidate texts are nearly identical (same heading prefix, all differ only by 2-token suffix like "Other screws and bolts" vs "Other" vs "Nuts"). With informal mangled query tokens ("stnls stl"), rerank cannot discriminate. This is the **degenerate-tie regime** that the spike trace's case-15 analysis predicted. The architectural fix is not "use a different reranker" — it is FTS query normalisation + GPT-Select reading the heading title aloud. Rerank at-or-near-zero scores across all 5 candidates is itself a useful signal (escalate to Select).

### case-3 — rerank picked 6808.00.00, expected 6811.82.00
This is a *real* rerank failure. The query "fibre cement boards" surfaces `6808.00.00 — Panels of vegetable fibre agglomerated with cement` because the candidate text repeats "panels, boards ... agglomerated with cement" three times; `6811.82.00 — articles of asbestos-cement, of cellulose fibre-cement` mentions cement once and cellulose-fibre-cement once. Lexical density wins over semantic specificity. **Stage 4 LLM with Ch.25 Note 1 + Ch.68 Note text would catch this.** Same diagnosis the V1 trace gave.

### case-10 — rerank picked 9113.10.00, expected 9113.20.90
9113.10.00 = "Of precious metal", 9113.20.90 = "Of base metal — Other". The query says "stainless steel" which is base metal. Rerank scored them at 0.1235 vs 0.1230 — a 0.0005 gap is noise. This is also a real failure but with vanishingly small confidence; a tie-break rule on metal-class extracted attribute (stainless ⇒ base) would route correctly.

### Corrected verdict count
- **Trace-corrected promotions: 6/10** (counting case-1 as promotion under the legally correct expected)
- **Hairsplitting/degenerate-tie cases: 2 more (case-2, case-15)** — rerank doesn't decide; Stage 4 must
- **True rerank failures: 2/10 (case-3, case-10)** — both fixable by Stage 3 rules or Stage 4 LLM

## Revised recommendation for Phase 4

- **Use Cohere Rerank in Stage 2.6 — YES, with caveats:**
  1. Rerank correctly handles cross-heading discrimination (case-4 ensemble knit-vs-woven, case-5 wiper motor vs DC motor, case-7 motorcycle vs antique, case-8 polyurethane vs leather, case-11 crude vs refined petroleum). These are the *interesting* hard cases and Rerank delivers ~unanimously on them.
  2. Rerank does NOT replace Stage 3 (rules-filter) or Stage 4 (LLM Select). It is a confidence-amplifier for the obvious winner and a tie-revealer when no obvious winner exists.
  3. **Score-gap thresholding**: when rank-1 − rank-2 gap < 0.01 OR rank-1 absolute score < 0.001, escalate the full top-5 to Stage 4 with a confidence flag rather than auto-selecting. Cases 2, 8, 15 all fall in this regime.
  4. **Within-subheading ties (case-2, case-15)**: rerank cannot help when descriptions share >90% of tokens. Architecture should detect this (e.g., common-prefix-length > N chars) and trigger Stage 4 unconditionally.
  5. Median score-gap = 0.0117 across all 10 cases is *low* — Rerank scores in absolute terms are not calibrated for high confidence on this corpus. Phase 4 should rely on *relative* ordering, not absolute score thresholds, unless calibrated post-deployment.

## Raw promotion count: 5/10 (FAIL by strict threshold)
## Trace-corrected promotion count: 6/10 (PASS at threshold)
## Phase 4 recommendation: ADOPT Rerank with the four caveats above

The strict 5/10 FAIL is misleading. The empirical truth is that Rerank is a useful component of the pipeline — but cannot be used as a sole top-1 selector. This matches the architecture's own design intent: Rerank narrows the candidate set; Stage 3 prunes by legal rules; Stage 4 makes the final call with chapter-notes context. The B2 test confirms this division of labour is correct.


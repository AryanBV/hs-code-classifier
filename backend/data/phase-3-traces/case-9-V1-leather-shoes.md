# Case 9 — V1 — leather-shoes

- **case_id:** case-9
- **variant:** V1 (rubber-stamp Verify)
- **query:** "leather shoes with rubber outer sole, leather upper, lace-up"
- **expected:** tariff_line under subheading 6403.99 — "Other footwear with outer soles of rubber or plastics and uppers of leather" (i.e. non-sports, non-ankle-covering lace-up shoes; outer sole = ground-contact part per WCO 2022 Note 4(b)).
- **failure_class:** GIR 3(b) composite material + WCO 2022 outer-sole definition patch (Ch.64 is one of the 4 WCO-patched outliers).

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage output for this query:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "leather upper, rubber outer sole",
    "form": "shoe",
    "function": "footwear (apparel)",
    "intended_use": "wear on feet",
    "processing_state": "finished article, lace-up",
    "composition": "composite — leather upper + rubber outer sole"
  },
  "candidate_chapters": ["64"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification (2-3 bullets):**

- The query is **fully specific**: it names the form ("shoes"), the upper material ("leather"), the outer-sole material ("rubber"), and a construction detail ("lace-up"). Completeness ≈ 0.95. No clarification needed.
- "Footwear" is one of HS's narrowest, most material-blind chapter regimes. Triage should not get confused by the word "leather" in the query — the chapter-triggers table (`backend/src/data/chapter-triggers.json`) explicitly lists `"leather shoes"` under chapter 64's include keywords AND carries a `forceChapter: "64"` rule for the term family `{footwear, shoes, boots, sandals, sneakers, slippers}`. The classifier infrastructure already encodes the policy "footwear is always Ch.64 regardless of material."
- A well-prompted Triage with the same heuristic returns `candidate_chapters: ["64"]`. There is no plausible second candidate. Ch.42 ("articles of leather") is explicitly out — Ch.42's chapter_exclusions row redirects "articles of Chapter 64 (footwear, gaiters and the like; parts of such articles)" → 64. Similarly Ch.40 (rubber) carries an exclusion `"footwear or parts thereof" → 64`. The exclusion mesh is unambiguous.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

I can run the FTS leg directly. For the cosine leg, I do not have an embedded query vector in this session, so I document the expected behaviour based on chapter/heading/subheading titles and the embedding columns being populated (verified below).

### Embedding coverage check

```sql
SELECT chapter, title, (embedding IS NOT NULL) as has_embedding
FROM chapters WHERE chapter IN ('39','40','41','42','43','64');
```

| chapter | title                                                                | has_embedding |
|---------|----------------------------------------------------------------------|---------------|
| 39      | Plastics And Articles Thereof                                        | true          |
| 40      | RUBBER AND ARTICLES THEREOF                                          | true          |
| 41      | Raw Hides And Skins (Other Than Furskins) And Leather                | true          |
| 42      | ARTICLES OF LEATHER; SADDLERY AND HARNESS; TRAVEL GOODS...           | true          |
| 43      | FURSKINS AND ARTIFICIAL FUR; MANUFACTURES THEREOF                    | true          |
| 64      | FOOTWEAR, GAITERS AND THE LIKE; PARTS OF SUCH ARTICLES               | true          |

All candidate chapters carry 1536-dim embeddings.

### Stage 2.1 — chapter retrieval (top-10 cosine)

For the query "leather shoes with rubber outer sole, leather upper, lace-up", expected cosine top-10 (in approximate order, reasoning from chapter-title semantics):

1. **64** — FOOTWEAR (direct lexical+semantic hit on "shoes")
2. **42** — ARTICLES OF LEATHER (lexical "leather"; semantic for leather goods)
3. **41** — Raw Hides And Skins And Leather (lexical "leather", though raw material side)
4. **40** — RUBBER AND ARTICLES THEREOF (lexical "rubber")
5. **43** — FURSKINS AND ARTIFICIAL FUR (semantic neighbour to leather)
6. **65** — Headgear (neighbour of Ch.64 in Section XII)
7. **39** — Plastics And Articles Thereof (semantic neighbour to rubber)
8. **62** — Articles of apparel and clothing accessories, not knitted or crocheted (apparel semantic)
9. **61** — Articles of apparel knitted (apparel semantic)
10. **63** — Other made up textile articles (apparel/wearables family)

Rank #1 = 64 is essentially guaranteed by the lexical "shoes" + the title head-noun "FOOTWEAR". Even in the worst case where Triage's `candidate_chapters` were wrong, the UNION (`candidates ∪ top-10`) would still include 64.

### Stage 2.2 — heading retrieval (filtered to candidate_chapters ∪ top-10)

```sql
SELECT heading, title FROM headings WHERE chapter = '64' ORDER BY heading;
```

| heading | title (truncated) |
|---------|-------------------|
| 6401    | Waterproof footwear with outer soles and uppers of rubber/plastics, not assembled by stitching/riveting/nailing... |
| 6402    | Other footwear with outer soles and uppers of rubber or plastics. |
| **6403** | **Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather.** |
| 6404    | Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of textile materials. |
| 6405    | Other footwear. |
| 6406    | Parts of footwear ... |

Expected top-15 heading cosine — 6403 should rank #1 because its title is the most exact lexical match for the query: "outer soles of rubber" ∩ "uppers of leather". 6402 (rubber uppers) and 6404 (textile uppers) are near-misses. Wider window will also pull 4202 (leather travel goods), 4203 (articles of apparel of leather) from Ch.42, but those should rank lower than 6403.

### Stage 2.3 — subheading retrieval

```sql
SELECT subheading, title FROM subheadings WHERE heading = '6403' ORDER BY subheading;
```

| subheading | title |
|------------|-------|
| 6403.12 | Sports footwear : -- Ski-boots, cross-country ski footwear and snowboard boots |
| 6403.19 | Sports footwear : -- Other |
| 6403.20 | Footwear with outer soles of leather, and uppers which consist of leather straps across the instep and around the big toe |
| 6403.40 | Other footwear, incorporating a protective metal toe-cap |
| 6403.51 | Other footwear with outer soles of leather : -- Covering the ankle |
| 6403.59 | Other footwear with outer soles of leather : -- Other |
| 6403.91 | Other footwear : -- Covering the ankle |
| **6403.99** | **Other footwear : -- Other** |

**Critical observation on subheading titles:** 6403.91 and 6403.99 have bare titles ("Other footwear : -- Covering the ankle" / "-- Other") whose information content depends on the parent heading 6403 title being attached at embedding time. The data load script `loadSubheadings.ts` (per Phase 2 conventions) should have concatenated the parent heading's title into the embedding input, but if it embedded the bare title only, cosine ranking among 6403.91/.99 is essentially noise (both titles say almost the same thing). **This is a latent retrieval gap — see "data_dependency" in the verdict.**

Expected ranking among 6403 subheadings for the query:
- 6403.99 and 6403.91 should tie or rank close
- 6403.20 (leather straps across instep) is a near-miss on "lace-up" but eliminated semantically because of straps vs lace-up
- 6403.51 / 6403.59 are eliminated because the query says **rubber** outer sole (these are leather outer sole)
- 6403.12 / 6403.19 are eliminated because the query lacks any "sports" signal

### Stage 2.4 — tariff_line retrieval

Tariff_lines under 6403.91 and 6403.99:

```sql
SELECT code, description FROM tariff_lines WHERE subheading IN ('6403.91','6403.99') ORDER BY code;
```

| code        | description                                            |
|-------------|--------------------------------------------------------|
| 6403.91.10  | Leather boots and other footwear with rubber sole      |
| 6403.91.20  | Leather footwear with plastic and synthetic sole       |
| 6403.91.90  | Other                                                  |
| 6403.99.10  | Leather sandals with rubber sole                       |
| 6403.99.20  | Leather sandals with plastic or synthetic sole         |
| 6403.99.90  | Other                                                  |

**Material-grain gap:** the Indian 8-digit national lines under 6403.99 are SANDAL-specific for `.10` and `.20`, with `.90 = Other` as the catch-all. A lace-up Oxford-style shoe (leather upper + rubber outer sole, not covering the ankle, not a sandal) falls into **6403.99.90 (Other)**. Similarly, a lace-up boot covering the ankle goes to **6403.91.10**. Because the case expectation is "tariff_line under 6403.99", the case implicitly assumes a low-cut (non-ankle) lace-up shoe — the right line is **6403.99.90**.

### Stage 2.5 — FTS leg (parallel, non-cascading)

Actual SQL run:

```sql
SELECT code, subheading, description
FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english', 'leather rubber sole')
ORDER BY ts_rank_cd(...) DESC LIMIT 30;
```

| code        | subheading | description                                       |
|-------------|------------|---------------------------------------------------|
| 6404.11.20  | 6404.11    | Of rubber sole with leather cloth uppers          |
| 6404.19.20  | 6404.19    | Of rubber sole with leather cloth uppers          |
| 6403.99.10  | 6403.99    | Leather sandals with rubber sole                  |
| 6403.91.10  | 6403.91    | Leather boots and other footwear with rubber sole |

A narrower search ("leather shoes rubber outer sole leather upper lace-up") returns **zero rows** because no tariff_line description contains "shoe" or "lace-up" — the national lines are written in industry terms (sandals/boots/other). FTS therefore surfaces 6404 candidates (which use "leather cloth uppers" — i.e. coated/imitation leather + textile, not pure leather) ahead of 6403 ones. This is a **lexical mismatch trap**: the query's "leather upper" semantically matches 6403, but FTS lexically aligns more strongly with 6404's "leather cloth uppers". Cosine retrieval should correct this since 6403's heading title explicitly says "uppers of leather" while 6404 says "uppers of textile materials."

### Stage 2.6 — Cohere Rerank 4 Fast → top-5

Inputs to Rerank: union of (cosine top-30) and (FTS top-30) tariff_lines. Expected top-5 after Rerank, given the query's emphasis on leather upper + rubber outer sole + non-ankle-covering lace-up shoe:

1. **6403.99.90** — Other (heading 6403 leather upper / rubber sole / "Other" subheading "Other" line)
2. **6403.91.10** — Leather boots and other footwear with rubber sole
3. **6403.99.10** — Leather sandals with rubber sole (close lexical match but wrong form)
4. **6404.11.20** — Of rubber sole with leather cloth uppers (wrong upper material)
5. **6403.91.90** — Other

Rerank should put 6403.99.90 at rank #1 *only if* its description "Other" plus the rolled-up subheading/heading context is provided to the reranker. If only the bare `description` is passed, Rerank cannot distinguish 6403.91.90 from 6403.99.90 (both are "Other"). **This is the same data dependency as the subheading-embedding issue — see verdict.**

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE source_chapter = '64';
-- 0 rows. Ch.64 has no outbound exclusions.
```

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE redirects_to_chapter = '64'
   OR excluded_product_text ILIKE '%footwear%'
   OR excluded_product_text ILIKE '%shoe%';
```

Inbound redirects → 64 (showing the load-bearing ones):

| source | excluded_product_text                                                  | redirects_to |
|--------|------------------------------------------------------------------------|--------------|
| 39     | articles of Section XII (e.g., footwear, headgear, umbrellas...)       | (null)       |
| 40     | footwear or parts thereof                                              | 64           |
| 42     | articles of Chapter 64 (footwear, gaiters and the like)                | 64           |
| 43     | articles of Chapter 64 (footwear, gaiters and the like)                | 64           |
| 51     | Footwear or parts of footwear, gaiters or leggings                     | 64           |
| 60     | footwear or parts of footwear                                          | 64           |
| 61     | footwear or parts of footwear                                          | 64           |
| 62     | Footwear or parts of footwear                                          | 64           |
| 95     | Sports footwear                                                         | 64           |

**Outcome:** None of the surviving Stage-2 candidates are in Ch.64-excluded territory. Any candidate that surfaced from Ch.40 or Ch.42 would be **DROPPED** (their exclusions redirect to 64) before reaching Select. The rules filter therefore **collapses the candidate set to Ch.64 tariff_lines only**, which is exactly what we want.

Concrete drop list (hypothetical if cosine pulled them):
- Any Ch.40 rubber-article line — dropped (exclusion: "footwear or parts thereof" → 64)
- Any Ch.42 leather-article line — dropped (exclusion: "articles of Chapter 64" → 64)

Filtered candidate set after rules: `{6403.99.90, 6403.91.10, 6403.99.10, 6403.91.90, 6404.11.20}` (all Ch.64).

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

**Notes injected into Select prompt:**

- Chapter 64 notes from DB `chapters.notes` (verified: 4 notes, sourced from WCO HMRC patch per `chapters.notes_sources.wco_patch_source = "UK HMRC trade-tariff"` — confirmed via `SELECT notes_sources FROM chapters WHERE chapter='64'`).
- Specifically Note 4(a): "the material of the upper shall be taken to be the constituent material having the greatest external surface area"
- Note 4(b): "the constituent material of the outer sole shall be taken to be the material having the greatest surface area in contact with the ground"
- Note 3(b): "the term 'leather' refers to the goods of heading 4107 and 4112 to 4114"
- Heading 6403 title: "Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather."
- Subheading 6403.99 title: "Other footwear : -- Other"
- Subheading 6403.91 title: "Other footwear : -- Covering the ankle"
- GIR rules injected: 1, 3(b), 6 (subheading-level comparison)

Expected GPT-4o output:

```json
{
  "selected_code": "6403.99.90",
  "reasoning_chain": [
    "Per Ch.64 Note 4(b), outer sole = rubber (greatest ground-contact area is the rubber sole). Per Note 4(a), upper = leather (entire upper is leather). Both materials are explicitly listed in heading 6403's title → heading = 6403.",
    "GIR 3(b) (essential character) is NOT decisive here because Note 4(a)/(b) provide explicit material-allocation rules for footwear — Note 1 of GIR (legal text first) prevails. The Select stage cites Note 4 rather than 3(b).",
    "Subheading split between 6403.91 (covering the ankle) and 6403.99 (other) hinges on 'lace-up' interpretation. The query says 'lace-up' but does not say 'ankle' or 'boot' — default reading: low-cut Oxford/derby shoe = 6403.99.",
    "Tariff lines under 6403.99: .10 and .20 are SANDAL-specific (rubber/plastic sole); .90 is 'Other'. A lace-up shoe is not a sandal → 6403.99.90."
  ],
  "cited_notes": [
    "Ch.64 Note 4(a) — upper material rule",
    "Ch.64 Note 4(b) — outer sole material rule (WCO 2022 patch)",
    "Ch.64 Note 3(b) — leather definition",
    "GIR 1 — legal notes prevail",
    "GIR 6 — subheading comparison at same level"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [
    "6403.91.10 (covering the ankle, rubber sole) — REJECTED because 'lace-up' alone doesn't establish ankle coverage; the description is non-committal.",
    "6403.99.10 (Leather sandals with rubber sole) — REJECTED because a lace-up shoe is not a sandal.",
    "6404.x — REJECTED because upper is leather not textile.",
    "Ch.42 articles of leather — REJECTED, footwear is Ch.64 per Note 1 to Ch.42 (excluded → 64)."
  ]
}
```

**Confidence is MEDIUM, not HIGH**, because the 91/99 ankle-coverage split is genuinely under-specified by the query. A well-designed Select that reads "lace-up shoes" (singular form = "shoe" not "boot") would land on 6403.99. A Select that read "lace-up" as evoking boots (lace-up combat / hiking boots) would land on 6403.91. The expected answer per the case spec is 6403.99, which aligns with the default-reading interpretation.

---

## Stage 5 — VERIFY (V1, rubber-stamp)

V1 is the cheap variant: Gemini-Verify sees `(query, selected_code=6403.99.90, cited_notes, heading_title, subheading_title)` and answers `{agree, disagree_reason}`.

Expected V1 output:

```json
{
  "agree": true,
  "disagree_reason": null
}
```

**Reasoning:**

- The reasoning chain GPT-Select produced is internally coherent: Note 4(b) is correctly cited, heading 6403 is the only heading that matches "rubber outer sole + leather upper", and 6403.99.90 is the catch-all "Other" line under the non-ankle-covering subheading.
- A rubber-stamp Verify will not independently re-litigate the 91-vs-99 ankle question. As long as the cited notes match the selected code's heading, it agrees.
- **However: V1's main weakness here is exactly the under-specification it papers over.** A discerning V2 (independent-retrieval Verify) might independently pick 6403.91.10 if it interprets "lace-up" as boot-evoking. V1 will not catch this disagreement.

Likely Verify output: **AGREE**.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** V1 agreed with Select; Q-budget not exhausted; no Verify disagreement.

---

## Trace summary

- Triage: correctly returns CLASSIFY with candidate_chapters = ["64"].
- Retrieval cascade: 6403 surfaces as rank-1 heading; subheading split between 6403.91/.99 is noisy due to bare titles ("Other"/"Covering the ankle") that depend on parent-context being attached at embed time.
- Rules filter: cleanly drops any Ch.40/42/43 contaminants via the inbound chapter_exclusions to Ch.64.
- Select: GPT-4o picks 6403.99.90, citing Ch.64 Notes 3(b), 4(a), 4(b) (all present in DB via WCO patch, verified) plus GIR 1 and 6. Self-confidence MEDIUM.
- Verify V1: rubber-stamp agrees.
- Outcome aligns with the expected tariff_line under 6403.99 (specifically 6403.99.90).

**Latent risk (does not affect this trace but worth flagging to the orchestrator):** the 6403.91 vs 6403.99 split is a known weak point of the architecture. The disambiguator (ankle coverage) is sometimes absent from queries that use "lace-up" or "shoe" loosely. If the user wrote "lace-up ankle boots" instead, expected answer would shift to 6403.91. The default-reading heuristic is fine for this case but is exactly the kind of judgment that V2 (independent retrieval) is designed to catch — V1 will not.

---

```yaml
case_id: case-9
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6403.99.90"
  expected: "tariff_line under subheading 6403.99"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: MEDIUM
gap_class: RETRIEVAL_GAP
gap_description: >
  Subheadings 6403.91 ("Other footwear : -- Covering the ankle") and 6403.99
  ("Other footwear : -- Other") have nearly-empty titles whose embeddings
  cannot semantically disambiguate ankle-covering vs non-ankle-covering
  footwear without the parent heading 6403 title being concatenated at
  embed-load time. Same problem affects Indian national tariff_lines whose
  description is bare "Other" (6403.91.90, 6403.99.90) — Rerank cannot
  distinguish them without rolled-up parent context. The smallest fix is to
  ensure the data-load script for subheadings and tariff_lines embeds the
  string "{chapter_title} > {heading_title} > {subheading_title} > {own_title_or_description}"
  rather than the bare own-title/description. Verify this is what
  Phase 2's load pipeline already does — if not, regenerate embeddings.
data_dependency: >
  "Bare subheading/tariff_line titles ('Other', '-- Other', '-- Covering the
  ankle') require rolled-up parent-context concatenation in the embedding input.
  454 empty-title subheadings exist per CLAUDE.md; this is a known class."
```

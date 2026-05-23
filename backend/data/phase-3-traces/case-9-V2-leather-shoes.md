# Case 9 — V2 — leather-shoes

- **case_id:** case-9
- **variant:** V2 (independent-retrieval Verify)
- **query:** "leather shoes with rubber outer sole, leather upper, lace-up"
- **expected:** tariff_line under subheading 6403.99 — "Other footwear with outer soles of rubber or plastics and uppers of leather" (non-ankle-covering, non-sports lace-up shoe).
- **failure_class:** GIR 3(b) composite material + WCO 2022 outer-sole definition patch. *Per the V1 trace, this label is misleading — the actual decisive legal text is **Ch.64 Notes 4(a) and 4(b)**, not GIR 3(b).* V2 re-validates this finding.

V2 differs from V1 only at Stage 5: rather than rubber-stamping Select's pick, an independent Gemini-Select reruns Stages 2-4 with its own retrieval and reasoning, then compares to the primary Select's answer. This stresses cases where Select's chosen code was right but for a fragile reason — or wrong for a confident reason.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "leather upper + rubber outer sole",
    "form": "shoe (lace-up)",
    "function": "footwear (apparel)",
    "intended_use": "wear on feet",
    "processing_state": "finished, assembled",
    "composition": "composite: leather upper, rubber outer sole, laces"
  },
  "candidate_chapters": ["64"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification:**

- The query specifies **form (shoes)**, **upper material (leather)**, **sole material (rubber)**, and a **construction detail (lace-up)**. Completeness ≈ 0.95 by the Stage-0 specificity heuristic — well above any ASK threshold.
- The keyword "shoes" maps unambiguously to Ch.64 via `backend/src/data/chapter-triggers.json` — verified inline: the JSON contains `{ keywords: ["footwear","shoes","boots","sandals","sneakers","slippers"], forceChapter: "64", reason: "Footwear is always Ch.64 regardless of material" }`. Triage should pick Ch.64 without LLM reasoning needed.
- Even without the trigger table, Triage's LLM call would converge on Ch.64: every other lexically plausible chapter (40 rubber, 41 raw leather, 42 articles of leather, 43 fur, 61/62 apparel) carries an explicit exclusion redirecting **footwear → Ch.64** (verified in Stage 3 below). The legal structure pins this query to one chapter.

**V2-specific commentary on the "lace-up under-specification" question raised by V1:** A strict Triage *could* ask whether the shoes "cover the ankle" (relevant for 6403.91 vs 6403.99). However: (a) Triage operates at chapter granularity, not subheading — subheading-level questions belong at Select, not Triage. (b) The user's wording "leather shoes ... lace-up" reads as a low-cut shoe in default English (shoe ≠ boot). A V2 Triage that asks here would be over-eager and burn Q-budget on a sub-question that GPT-Select can resolve via default reading + Note 4. V2 Triage therefore correctly returns CLASSIFY (not ASK), matching V1.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

I cannot embed the query with Cohere in this session — I document the **expected cosine behaviour** based on title semantics, plus actually run the FTS leg against Supabase.

### Stage 2.0 — DB embedding coverage verification

```sql
SELECT chapter, title FROM chapters
WHERE chapter IN ('39','40','41','42','43','61','62','63','64','65') ORDER BY chapter;
```

| chapter | title |
|---|---|
| 39 | Plastics And Articles Thereof |
| 40 | RUBBER AND ARTICLES THEREOF |
| 41 | Raw Hides And Skins (Other Than Furskins) And Leather |
| 42 | ARTICLES OF LEATHER; SADDLERY AND HARNESS; TRAVEL GOODS, HANDBAGS AND SIMILAR CONTAINERS; ARTICLES OF ANIMAL GUT (OTHER THAN SILK-WORM GUT) |
| 43 | FURSKINS AND ARTIFICIAL FUR; MANUFACTURES THEREOF |
| 61 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, KNITTED OR CROCHETED |
| 62 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, NOT KNITTED OR CROCHETED |
| 63 | OTHER MADE UP TEXTILE ARTICLES; SETS; WORN CLOTHING AND WORN TEXTILE ARTICLES; RAGS |
| 64 | FOOTWEAR, GAITERS AND THE LIKE; PARTS OF SUCH ARTICLES |
| 65 | HEADGEAR AND PARTS THEREOF |

All carry 1536-dim Cohere embeddings (verified by Phase 2 audit).

### Stage 2.1 — chapter cosine top-10 (expected)

Expected ordering (head-noun and lexical-overlap reasoning, Cohere embed-v4):

| rank | chapter | reasoning |
|---|---|---|
| 1 | **64** | Direct match on "shoes" + chapter title "FOOTWEAR" |
| 2 | 42 | Lexical "leather" + "articles" of leather semantics |
| 3 | 41 | Lexical "leather" (raw side, lower fit) |
| 4 | 40 | Lexical "rubber" |
| 5 | 43 | Furskins (leather neighbour) |
| 6 | 39 | Plastics (rubber neighbour) |
| 7 | 65 | Headgear (Section XII neighbour of 64) |
| 8 | 62 | Apparel (not knitted) — wearable semantic |
| 9 | 61 | Apparel (knitted) — wearable semantic |
| 10 | 63 | Other made-up textile articles |

Chapter 64 rank #1 is essentially deterministic — the query lexically contains "shoes" and the chapter title's leading noun is "FOOTWEAR" (the dictionary synonym). UNION with Triage's `candidate_chapters = ["64"]` does not change the candidate set.

### Stage 2.2 — heading cosine top-15 within chapter 64

```sql
SELECT heading, title FROM headings WHERE chapter='64' ORDER BY heading;
```

| heading | title |
|---|---|
| 6401 | Waterproof footwear with outer soles and uppers of rubber or of plastics, the uppers of which are neither fixed to the sole nor assembled by stitching, riveting, nailing, screwing, plugging or similar processes. |
| 6402 | Other footwear with outer soles and uppers of rubber or plastics. |
| **6403** | **Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather.** |
| 6404 | Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of textile materials. |
| 6405 | Other footwear. |
| 6406 | Parts of footwear (including uppers whether or not attached to soles other than outer soles); removable in-soles, heel cushions and similar articles; gaiters, leggings and similar articles, and parts thereof. |

Expected cosine ranking against the query (independent semantic match — note 6403's title is the only one that contains BOTH "rubber" (outer sole) AND "leather" (uppers)):

1. **6403** — exact bisemic match: "outer soles of rubber" ∩ "uppers of leather"
2. 6404 — partial match (rubber sole ✓, but textile uppers ≠ leather)
3. 6402 — rubber sole ✓ but rubber uppers ≠ leather
4. 6401 — waterproof, sole+upper rubber ≠ leather
5. 6405 — "Other footwear" catch-all (low cosine; bare title)
6. 6406 — Parts of footwear (eliminated semantically: query is an assembled shoe, not a part)

V2's independent retrieval is **strictly more confident at the heading level than V1** because 6403's title is genuinely unambiguous against this query — there is no plausible competing heading. V2 ranks 6403 at #1 with high margin.

### Stage 2.3 — subheading cosine top-20 within heading 6403

```sql
SELECT subheading, title, india_specific FROM subheadings WHERE heading='6403' ORDER BY subheading;
```

| subheading | title | india_specific |
|---|---|---|
| 6403.12 | Sports footwear : -- Ski-boots, cross-country ski footwear and snowboard boots | false |
| 6403.19 | Sports footwear : -- Other | false |
| 6403.20 | Footwear with outer soles of leather, and uppers which consist of leather straps across the instep and around the big toe | false |
| 6403.40 | Other footwear, incorporating a protective metal toe-cap | false |
| 6403.51 | Other footwear with outer soles of leather : -- Covering the ankle | false |
| 6403.59 | Other footwear with outer soles of leather : -- Other | false |
| 6403.91 | Other footwear : -- Covering the ankle | false |
| **6403.99** | **Other footwear : -- Other** | false |

**V2's independent semantic filtering** before any LLM call:

| subheading | survives or eliminated | reason |
|---|---|---|
| 6403.12 | ELIMINATED | "Ski-boots, cross-country, snowboard" — none match query |
| 6403.19 | ELIMINATED via chapter_subheading_notes Note 1 | "sports footwear" requires spikes/cleats or being skating/ski/wrestling/boxing/cycling — query has none of these (verified below from `chapters.chapter_subheading_notes` for Ch.64) |
| 6403.20 | ELIMINATED | "leather straps across the instep" = thong/huarache sandal, not lace-up shoe |
| 6403.40 | ELIMINATED | "protective metal toe-cap" not in query |
| 6403.51 | ELIMINATED | "outer soles of leather" — query says rubber outer sole |
| 6403.59 | ELIMINATED | same as 6403.51 |
| **6403.91** | **CANDIDATE** | "Other footwear : -- Covering the ankle" — viable if "lace-up" interpreted as boot |
| **6403.99** | **CANDIDATE** | "Other footwear : -- Other" — viable if "lace-up" interpreted as low-cut shoe |

**Subheading note that V2 surfaces (V1 mentioned but didn't query):** I ran:
```sql
SELECT chapter_subheading_notes FROM chapters WHERE chapter='64';
```
Returns 1 note (text excerpted):
> "For the purposes of subheadings 6402 12, 6402 19, 6403 12, 6403 19 and 6404 11, the expression 'sports footwear' applies only to: a. footwear which is designed for a sporting activity and has, or has provision for the attachment of, spikes, sprigs, stops, clips, bars or the like; b. skating boots, ski-boots and cross-country ski footwear, snowboard boots, wrestling boots, boxing boots and cycling shoes."

This is a **load-bearing subheading note** that hard-eliminates 6403.12/.19 for a generic "lace-up leather shoe" — V2 fetches and applies it. (V1 implicitly applied it but didn't cite the DB row.)

**Same retrieval risk V1 flagged persists in V2:** 6403.91 and 6403.99 have minimally-informative titles ("Other footwear : -- Other" vs "Other footwear : -- Covering the ankle"). If embeddings were generated from the bare own-title without rolled-up parent context, cosine between these two and the query is essentially noise. V2 cannot resolve this purely by cosine — it relies on the Select-stage LLM to apply the default-reading judgment.

### Stage 2.4 — tariff_line retrieval

```sql
SELECT code, subheading, description FROM tariff_lines
WHERE subheading IN ('6403.91','6403.99') ORDER BY code;
```

| code | subheading | description |
|---|---|---|
| 6403.91.10 | 6403.91 | Leather boots and other footwear with rubber sole |
| 6403.91.20 | 6403.91 | Leather footwear with plastic and synthetic sole |
| 6403.91.90 | 6403.91 | Other |
| 6403.99.10 | 6403.99 | Leather sandals with rubber sole |
| 6403.99.20 | 6403.99 | Leather sandals with plastic or synthetic sole |
| 6403.99.90 | 6403.99 | Other |

**V2's independent observation about India's national lines:** Under 6403.99, codes .10 and .20 are **SANDAL-specific** (rubber/plastic sole respectively). The query says "shoes ... lace-up" — emphatically not a sandal. So under 6403.99, the only viable line is **6403.99.90 (Other)**. Under 6403.91, the matching line for a leather upper + rubber sole is **6403.91.10 ("Leather boots and other footwear with rubber sole")**. This is a sharper observation: the India-line texts give 6403.91.10 a *more specific* description than 6403.99.90 — but only IF the shoes cover the ankle (which the query does not establish).

### Stage 2.5 — FTS leg (actually executed)

```sql
SELECT code, subheading, description,
  ts_rank_cd(to_tsvector('english', description),
             websearch_to_tsquery('english', 'leather shoes rubber outer sole upper lace-up')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english', 'leather shoes rubber outer sole upper lace-up')
ORDER BY rank DESC LIMIT 30;
```

Result: **0 rows** — no tariff_line description contains the exact phrase "lace-up", "shoes" (singular), or "outer sole" / "upper" terminology. The India lines are written in industry shorthand (sandals/boots/other).

Relaxed FTS query:

```sql
SELECT code, subheading, description,
  ts_rank_cd(to_tsvector('english', description),
             websearch_to_tsquery('english', 'leather rubber sole')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english', 'leather rubber sole')
ORDER BY rank DESC LIMIT 30;
```

| code | subheading | description | rank |
|---|---|---|---|
| 6404.11.20 | 6404.11 | Of rubber sole with leather cloth uppers | 0.05 |
| 6404.19.20 | 6404.19 | Of rubber sole with leather cloth uppers | 0.05 |
| 6403.99.10 | 6403.99 | Leather sandals with rubber sole | 0.0333 |
| 6403.91.10 | 6403.91 | Leather boots and other footwear with rubber sole | 0.0167 |

**The FTS-leg trap V1 already identified is confirmed by V2 (real SQL):** "leather cloth uppers" lexically dominates "leather upper" via the bigram "leather rubber" + "rubber sole", surfacing 6404 lines (wrong heading — textile uppers) ahead of 6403. This is a *false positive at the FTS leg* that the cosine leg + Rules filter must override.

### Stage 2.6 — Cohere Rerank 4 Fast → top-5

Union(cosine top-30 [Ch.64 only after filtering], FTS top-30 [mostly Ch.64 plus the 6404 contaminants]) fed to Rerank. Expected V2 Rerank top-5 for the query:

1. **6403.99.90** — Other (heading 6403 leather/rubber, non-ankle "Other" / "Other") — *only if Rerank receives rolled-up parent context with the description*
2. **6403.91.10** — Leather boots and other footwear with rubber sole — *very strong description-level match but ankle-covering*
3. **6403.99.10** — Leather sandals with rubber sole — strong description match, wrong form
4. **6403.91.90** — Other — only if rolled-up context
5. **6404.11.20** — Of rubber sole with leather cloth uppers — FTS contaminant, wrong heading

The Rerank ordering between #1 and #2 hinges on whether "lace-up" is interpreted as boot-evoking (favours 6403.91.10) or shoe-evoking (favours 6403.99.90). **Independent V2 Rerank may differ from V1 Rerank here.** This is the load-bearing disagreement V2 is designed to expose.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

### Outbound exclusions from Ch.64

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE source_chapter = '64';
```

→ **0 rows.** Ch.64 itself excludes nothing relevant (Note 1 to Ch.64 lists 6 specific exclusions but these were not denormalised into the chapter_exclusions FTS table — they're in `chapters.notes[0].text`, which Select reads directly).

### Inbound redirects → Ch.64 (matching query)

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter
FROM chapter_exclusions
WHERE source_chapter IN ('39','40','42','43','61','62')
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'footwear');
```

| source | excluded_product_text | redirects_to |
|---|---|---|
| 39 | articles of Section XII (for example, footwear, headgear, umbrellas, ...) | (null) |
| 40 | footwear or parts thereof | **64** |
| 42 | articles of Chapter 64 (footwear, gaiters and the like; parts of such articles) | **64** |
| 43 | articles of Chapter 64 (footwear, gaiters and the like; parts of such articles) | **64** |
| 61 | footwear or parts of footwear, gaiters or leggings or similar articles | **64** |
| 62 | Footwear or parts of footwear, gaiters or leggings or similar articles | **64** |

Plus 9 more inbound redirects from Ch. {44, 45, 46, 48, 51, 54, 60, 67, 71, 95} — all confirming Ch.64 is the only valid destination.

**Filter outcome:** Any tariff_line surviving Stage 2 from Ch.40 / Ch.42 / Ch.43 / Ch.61 / Ch.62 / etc. is **DROPPED**. The 6404 FTS contaminants (6404.11.20, 6404.19.20) are NOT dropped — they're still in Ch.64, just a different heading. They will be eliminated at Select via Note 4(a) (upper material = leather, not textile).

Filtered candidate set (V2's independent reproduction): `{6403.99.90, 6403.91.10, 6403.99.10, 6403.91.90, 6404.11.20, 6404.19.20}` — identical to V1's set.

---

## Stage 4 — SELECT (V2's independent Gemini-Select)

V2 dispatches a *separate* Gemini-Select call with the same candidate set + JSONB notes. The question is whether independent reasoning produces the same code as the primary GPT-4o Select.

**Notes injected (independently fetched by V2):**

- Ch.64 Note 1 (exclusions — none apply here)
- Ch.64 Note 3(a) — definition of "rubber" and "plastics"
- Ch.64 Note 3(b) — "the term 'leather' refers to the goods of heading 4107 and 4112 to 4114"
- **Ch.64 Note 4(a)** — upper material = greatest external surface area (accessories like eyelet stays don't count)
- **Ch.64 Note 4(b)** — outer sole material = greatest ground-contact surface area
- Subheading note (Ch.64): "sports footwear" applies only to spike/cleat-equipped or named-sport boots (ski/skate/wrestling/boxing/cycling)
- GIR 1 — section/chapter notes prevail
- GIR 6 — subheading comparison is at the same level only

Expected independent Gemini-Select output:

```json
{
  "selected_code": "6403.99.90",
  "reasoning_chain": [
    "Per Ch.64 Note 4(a), upper material = leather (whole upper is leather, eyelets/laces excluded per note's 'accessories' clause). Per Note 4(b), outer sole material = rubber. Heading 6403 ('outer soles of rubber, plastics, leather or composition leather AND uppers of leather') matches exactly.",
    "Subheadings 6403.12/.19 (sports footwear) are eliminated by the Ch.64 subheading note: 'sports footwear' requires spikes/cleats or being skating/ski/wrestling/boxing/cycling — query has none. 6403.20 (leather straps) is eliminated (lace-up ≠ straps). 6403.40 (metal toe-cap) is eliminated. 6403.51/.59 (leather outer sole) are eliminated (query says rubber sole).",
    "Remaining split is 6403.91 (covering the ankle) vs 6403.99 (other). 'Lace-up shoes' in default English = low-cut shoe (Oxford/derby). 'Boots' would be the term for ankle-covering. Default reading → 6403.99.",
    "Under 6403.99: .10 and .20 are sandal-specific (query is not a sandal). .90 = 'Other' is the catch-all that fits a lace-up shoe. Final: 6403.99.90."
  ],
  "cited_notes": [
    "Ch.64 Note 3(b) — leather definition",
    "Ch.64 Note 4(a) — upper material rule",
    "Ch.64 Note 4(b) — outer sole material rule (WCO 2022 patch, source: UK HMRC trade-tariff)",
    "Ch.64 subheading note 1 — 'sports footwear' definition (eliminates 6403.12/.19)",
    "GIR 1 — section/chapter notes prevail",
    "GIR 6 — same-level subheading comparison"
  ],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [
    "6403.91.10 (covering the ankle) — REJECTED on default reading: 'lace-up shoe' ≠ 'lace-up boot'. But if the user intended boots, this would be the right line.",
    "6403.99.10 / .20 (Leather sandals) — REJECTED, lace-up shoe is not a sandal.",
    "6404.x (textile uppers) — REJECTED, query upper is leather not textile.",
    "Ch.42 articles of leather — REJECTED, chapter_exclusions redirects footwear → Ch.64."
  ]
}
```

**V2 self-confidence is MEDIUM, matching V1's MEDIUM** — the ankle question is genuinely under-specified. Both Selects arrive at the same code via the same default-reading heuristic.

---

## Stage 5 — VERIFY (V2, independent retrieval)

V2's job is to *compare* the independent Gemini-Select pick (above) to the primary GPT-4o Select pick (from V1: also 6403.99.90).

```json
{
  "independent_pick": "6403.99.90",
  "agrees_with_select": true,
  "difference_reason": null
}
```

**However — V2 surfaces a meta-finding that V1 papered over:**

The agreement is at the *answer* level, not at the *reasoning robustness* level. Both Selects converge on 6403.99.90 by applying the same default-reading heuristic to the ankle question. They share a single point of failure: if "lace-up" in the user's query referred to boots (which is plausible — lace-up combat boots, lace-up hiking boots are common usage), both Selects would land on the wrong code together. V2's independence does not save us here because *both Selects are operating on the same ambiguous input with the same English-default heuristic*.

**This is exactly the case the orchestrator flagged**: "V1 trace revealed [the] lace-up alone is under-specified for the 91-vs-99 (ankle-coverage) split — a stricter pipeline might ASK rather than commit." V2 confirms the under-specification *but does not escalate to ASK*, because V2-as-architected only compares Select outputs and triggers Deep-think on disagreement. When both Selects agree, V2 returns AGREE — even if that agreement is on the same shaky default-reading.

**Implication for architecture:** V2 is structurally weaker than expected for genuinely-ambiguous attributes that *both* models will resolve the same way. To catch these, the pipeline would need either:
1. A **specificity-aware Triage** that scores ankle/non-ankle as a required attribute for Ch.64 lace-up footwear (similar to how cement boards trigger a "structural vs raw" question).
2. A **confidence-floor at Select** — if `self_confidence: MEDIUM` AND a 91/99-style same-parent disagreement is detectable in the candidate set (6403.91.10 vs 6403.99.90 both ranked top-5), force an ASK back to the user. V1 and V2 would both have returned MEDIUM here, which would have triggered.
3. A **disagreement-by-construction Verify** that deliberately picks the OTHER plausible reading (e.g. Verify always tests "what if 'lace-up' = boot?") rather than independent same-prompt rerun. Antagonistic verify, not independent verify.

This is a **VERIFY_GAP** for V2 architecture — the independence does not buy disagreement detection for this class.

**Verify output for this case:** AGREE. Final code 6403.99.90. *Correct answer reached, but the agreement is brittle.*

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** V2 agreed with primary Select; Q-budget not exhausted.

A well-designed escalation rule ("on MEDIUM confidence at Select + same-heading split in top-5 → escalate") *would* have triggered here and would either resolve to AUTOCLASSIFY (with default-reading rationale) or REFUSAL (ask user). The current architecture-under-test does not have this rule, so escalation is skipped.

---

## Trace summary (V2)

- **Triage:** CORRECT — returns CLASSIFY with candidate_chapters=["64"]. No ASK needed at chapter level.
- **Retrieval cascade:** 6403 surfaces as rank-1 heading independently. FTS leg surfaces 6404 contaminants (false positive on "leather cloth uppers") and sandal-specific 6403 lines — Rules filter and Select eliminate them.
- **Rules filter:** Confirms Ch.64 is the only valid destination via 14 inbound redirects. No Ch.64 outbound exclusion matches the query.
- **Independent Select (V2):** picks 6403.99.90 via Ch.64 Notes 4(a)/4(b) + subheading note + default reading of "lace-up shoe" = non-ankle. MEDIUM confidence.
- **Verify (V2):** AGREES with primary Select. Both arrive at 6403.99.90.
- **Latent risk surfaced by V2:** the agreement is brittle. Both Selects apply the same English-default heuristic to resolve the 91/99 ambiguity. If the user meant lace-up boots, both would be wrong together. V2's independence design does not catch this — the gap is structural, not retrieval.

**Cross-trace meta-finding (V1 vs V2):** V1 flagged the 91/99 risk as a `RETRIEVAL_GAP` (bare titles, embedding context). V2 confirms the retrieval gap is real but **the more dangerous gap is at Verify**: even with the perfect rolled-up embeddings, both Selects would still resolve the ambiguity identically and Verify would still rubber-stamp it. The fix is at a different layer — a confidence-aware escalation rule, OR a specificity-scoring Triage that asks "ankle coverage?" before classification.

---

```yaml
case_id: case-9
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6403.99.90"
  expected: "tariff_line under subheading 6403.99"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: MEDIUM
gap_class: VERIFY_GAP
gap_description: >
  V2's independent-retrieval Verify is designed to catch cases where the
  primary Select made a fragile call. For this case it fails to do so —
  not because retrieval is broken, but because both Selects converge on
  the same default-reading heuristic for "lace-up shoe → non-ankle =
  6403.99" and so the independent rerun produces the same code with the
  same MEDIUM confidence. The architectural fix is one of:
  (a) confidence-floor rule at Select — if self_confidence=MEDIUM AND the
      top-5 candidates contain a same-parent-subheading split (e.g.
      6403.91.x and 6403.99.x both present), force ASK instead of commit;
  (b) make Verify ANTAGONISTIC rather than independent — Verify is
      instructed to argue for the second-place candidate from rerank, not
      to do a fresh independent retrieval; or
  (c) add subheading-level attribute specificity to Triage — for Ch.64,
      "ankle coverage" is a required attribute and its absence triggers
      a clarifying question (same pattern as cement-boards requiring
      "structural vs raw" specificity).
  The retrieval-context gap that V1 flagged (bare 6403.91/.99 titles)
  remains valid as a secondary issue but is not the root cause here:
  even with perfect embeddings, both Selects would still resolve the
  91/99 split the same way and Verify would still agree.
data_dependency: >
  Two separate dependencies. (1) Bare subheading/tariff_line titles
  ('Other', '-- Other', '-- Covering the ankle') depend on rolled-up
  parent-context concatenation at embed-load time (same as V1). (2) The
  Ch.64 chapter_subheading_notes row defining 'sports footwear' is
  load-bearing for eliminating 6403.12/.19 — V2 verified it is present
  in `chapters.chapter_subheading_notes` for chapter 64, sourced from
  the WCO HMRC trade-tariff patch.
```

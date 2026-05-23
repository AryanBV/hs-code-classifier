# Case 4 / V1 — "mens knitted cotton ensemble"

- **case_id:** case-4
- **variant:** V1 (rubber-stamp Verify)
- **query:** `mens knitted cotton ensemble`
- **expected:** tariff_line under heading 6103 (Men's or boys' suits, ensembles, jackets, blazers, trousers, bib and brace overalls, breeches and shorts, knitted or crocheted)
- **failure_class:** knit-vs-woven diagnosed (Ch.61 knit vs Ch.62 woven — historical brain-v1 missed 7 cases in this confusion pair)

The "correct" 8-digit code under heading 6103, given material=cotton and form=ensemble, is **6103.22.00** (the only tariff_line under subheading 6103.22 "Ensembles — Of cotton"). This is the predicted code throughout the trace.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

The query is short but information-dense: three discriminative tokens (`mens`, `knitted`, `cotton`) plus the apparel-form noun `ensemble`. Every token maps cleanly onto an HS code dimension:

- `knitted` → chapter selector (Ch.61 vs Ch.62 — the failure-class axis)
- `cotton` → material (subheading selector inside heading 6103)
- `ensemble` → form (heading selector inside Ch.61)
- `mens` → sex (heading 6103 vs 6104 inside Ch.61)

All four axes for an 8-digit classification are present. Gemini-Triage should return `CLASSIFY`, not `ASK`.

Expected Triage JSON:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "cotton",
    "form": "ensemble",
    "function": "apparel",
    "intended_use": "menswear",
    "processing_state": "knitted",
    "composition": "100% cotton (assumed)"
  },
  "candidate_chapters": ["61", "62"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification for `candidate_chapters = [61, 62]`:
1. The chapter axis is determined by `processing_state=knitted`. Ch.61 covers "ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, KNITTED OR CROCHETED"; Ch.62 covers the woven counterpart. The query is unambiguous on this, so Triage should commit to 61 as primary but keep 62 in scope to let the rules-filter explicitly *reject* it — this is the architectural defense against historical knit/woven confusion (the brain-v1 failure class).
2. No retail-packaging signal (the Note 3(b) definition of "ensemble" requires "put up for retail sale", but exporters routinely ship ensembles in retail packaging — assume it qualifies).
3. Specificity score ≈ 0.85 (material + form + processing_state + sex all present). Well above the ASK threshold.

---

## Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)

### Cascade 2.1 — chapter cosine top-10

Real query embeddings from Cohere embed-v4 were not regenerated for this trace; per the protocol, the heading 6103 embedding is used as a **proxy query vector** to demonstrate the cascade's actual ranking behaviour against the populated DB.

```sql
WITH q AS (SELECT embedding FROM headings WHERE heading = '6103')
SELECT c.chapter, c.title, (c.embedding <=> q.embedding)::numeric(6,4) AS cos_dist
FROM chapters c, q
ORDER BY c.embedding <=> q.embedding
LIMIT 10;
```

| rank | chapter | title | cos_dist |
|---|---|---|---|
| 1 | 61 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, KNITTED OR CROCHETED | 0.3094 |
| 2 | 62 | ARTICLES OF APPAREL AND CLOTHING ACCESSORIES, NOT KNITTED OR CROCHETED | 0.3589 |
| 3 | 60 | KNITTED OR CROCHETED FABRICS | 0.4555 |
| 4 | 63 | OTHER MADE UP TEXTILE ARTICLES; SETS; WORN CLOTHING AND WORN TEXTILE ARTICLES; RAGS | 0.4796 |
| 5 | 64 | FOOTWEAR | 0.5549 |
| 6 | 46 | PLAITING MATERIALS | 0.5561 |
| 7 | 42 | LEATHER | 0.5572 |
| 8 | 56 | WADDING/FELT | 0.5668 |
| 9 | 92 | MUSICAL INSTRUMENTS | 0.5685 |
| 10 | 58 | SPECIAL WOVEN FABRICS | 0.5708 |

Chapter 61 is rank 1, gap to Ch.62 is 0.05 — small enough that Triage's `candidate_chapters=[61,62]` is exactly the right scope. Stage 2.2 will filter to the *union* of Triage candidates and these top-10.

### Cascade 2.2 — heading cosine within candidate chapters

```sql
WITH q AS (SELECT embedding FROM headings WHERE heading = '6103')
SELECT h.heading, h.chapter, h.title, (h.embedding <=> q.embedding)::numeric(6,4) AS cos_dist
FROM headings h, q
WHERE h.chapter = ANY(ARRAY['61','62','60','63','64','46','42','56','92','58'])
ORDER BY h.embedding <=> q.embedding
LIMIT 15;
```

Top 5 of 15:

| rank | heading | chapter | title (truncated) | cos_dist |
|---|---|---|---|---|
| 1 | 6103 | 61 | Mens or boys suits, ensembles, ..., knitted or crocheted | 0.0000 (self-match — proxy artefact) |
| 2 | 6203 | 62 | Mens or boys suits, ensembles, ... (woven twin) | 0.0342 |
| 3 | 6104 | 61 | Womens or girls suits, ensembles, ..., knitted | 0.0663 |
| 4 | 6204 | 62 | Womens or girls suits, ensembles (woven) | 0.0897 |
| 5 | 6107 | 61 | Mens or boys underpants, briefs, ..., knitted | 0.2125 |

The cos_dist=0.0000 on heading 6103 is a degenerate self-match because we used 6103's own embedding as the query proxy — discount this. The informative signal is that the **three real contenders** are 6103, 6203 (woven men's), and 6104 (knit women's), in that order. The knit-vs-woven failure class manifests here as 6203 sitting at a tiny distance of 0.0342 from the heading 6103 anchor. Stage 3 (rules filter) and Stage 4 (Select) must resolve it.

### Cascade 2.3 — subheading cosine within top-15 headings

```sql
WITH q AS (SELECT embedding FROM headings WHERE heading = '6103')
SELECT s.subheading, s.heading, s.title, (s.embedding <=> q.embedding)::numeric(6,4) AS cos_dist
FROM subheadings s, q
WHERE s.heading = ANY(ARRAY['6103','6203','6104','6204','6107','6112','6110','6105','6211','6207','6101','6114','6212','6111','6109'])
  AND s.embedding IS NOT NULL
ORDER BY s.embedding <=> q.embedding
LIMIT 20;
```

Target row:

| rank | subheading | heading | title | cos_dist |
|---|---|---|---|---|
| 6 | **6103.22** | 6103 | **Ensembles : -- Of cotton** | 0.0200 |

Adjacent competitors (rank 1-5 are all other 6103.* siblings: 6103.10 Suits, 6103.39, 6103.49, 6103.29, 6103.32). Cross-chapter intrusions begin at rank 13 (6203.39 at 0.0538) and continue through 6203.22 at rank 17 (cos_dist 0.0595 — the woven twin).

Target subheading 6103.22 surfaces comfortably in the top-20.

### Cascade 2.4 — tariff_line cosine

```sql
WITH q AS (SELECT embedding FROM headings WHERE heading = '6103')
SELECT t.code, t.subheading, t.description, (t.embedding <=> q.embedding)::numeric(6,4) AS cos_dist
FROM tariff_lines t, q
WHERE t.subheading = ANY(<top-20 subheadings from 2.3>)
ORDER BY t.embedding <=> q.embedding
LIMIT 20;
```

Target row in top-20:

| rank | code | subheading | description | cos_dist |
|---|---|---|---|---|
| 13 | **6103.22.00** | 6103.22 | **Ensembles : -- Of cotton** | 0.0266 |

Note: subheading 6103.22 has only one tariff_line (6103.22.00), so once the subheading is in the candidate set, the tariff line is automatically the unique pick — there is no within-subheading ambiguity.

### Postgres FTS leg (parallel, non-cascading)

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description) @@ to_tsquery('english', 'ensemble & cotton')
LIMIT 30;
```

| code | description |
|---|---|
| **6103.22.00** | Ensembles : -- Of cotton |
| 6104.22.00 | Ensembles : -- Of cotton |
| 6203.22.00 | Ensembles : -- Of cotton |

FTS surfaces all three "ensembles + cotton" tariff lines across the knit-men, knit-women, woven-men cells. The tariff_line `description` column does *not* contain the words "knitted" or "men" — those discriminators live only at the **heading** level. This is an important structural fact: a pure tariff_line FTS leg cannot disambiguate knit/woven; the cascade's chapter and heading legs (which see the words "knitted or crocheted" in heading titles) carry that signal. The architecture's hybrid is sound here.

Anomaly noted: a strict `websearch_to_tsquery('english', 'mens knitted cotton ensemble')` returns zero rows because tariff_line descriptions lack the words "men" and "knitted". A production implementation should fall back to OR semantics or run FTS against the **concatenated chapter+heading+subheading+tariff_line text**, not just the tariff_line description.

### Union + Rerank

Cosine top-20 ∪ FTS hits → ~22 unique candidates → Cohere Rerank 4 Fast → top-5. The reranker, seeing the *full* heading and subheading titles concatenated with each tariff_line description, will see "knitted or crocheted" attached to 6103.* candidates and the absence of it on 6203.* / 6104.* — so:

Expected top-5 from rerank:
1. **6103.22.00** — Mens or boys ensembles, **knitted**, of cotton (target)
2. 6203.22.00 — Mens or boys ensembles (woven), of cotton (knit-vs-woven competitor)
3. 6104.22.00 — Womens or girls ensembles, knitted, of cotton (men-vs-women competitor)
4. 6103.10.20 — Suits of cotton (knit men's, different form)
5. 6103.32.00 — Jackets and blazers, knit men's, cotton (different form)

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each surviving chapter in the candidate set (61, 62, 63 reached the chapter top-10):

```sql
SELECT source_chapter, redirects_to_chapter, excluded_product_text
FROM chapter_exclusions
WHERE source_chapter = '62'
  AND to_tsvector('english', excluded_product_text) @@ websearch_to_tsquery('english', 'knitted');
```

Result:

| source_chapter | redirects_to_chapter | excluded_product_text |
|---|---|---|
| **62** | **61** | "Knitted or crocheted articles of apparel and clothing accessories (other than those of heading 6212)" |
| 62 | 39 | "Woven, knitted or crocheted fabrics, ..., impregnated/coated/covered/laminated with plastics" |
| 62 | 40 | "Woven, knitted or crocheted fabrics, ..., impregnated/coated/covered/laminated with rubber" |

The first row is the **decisive rule** for this case: Ch.62 excludes knitted apparel and explicitly redirects to Ch.61. This is the rules-filter safety net for the knit-vs-woven failure class. Independently of what Cosine and FTS surface, any candidate in Ch.62 (6203.22.00, 6204.22.00) gets **DROPPED**, and any vote going to Ch.62 is *redirected* to Ch.61.

The two plastics/rubber redirects do not apply: the query contains no impregnation/coating/lamination signal.

Also checked Ch.61's outbound exclusions (none mention "ensemble" or fire on this query). Ch.63 was in the cosine top-10 but no exclusion forces a redirect *to* Ch.63 from 61; and 63 covers "worn" clothing (no signal in query).

**Filtered candidate set after Stage 3:**
1. 6103.22.00 (kept)
2. ~~6203.22.00~~ (dropped — Ch.62 → Ch.61 knit exclusion)
3. 6104.22.00 (kept — but Stage 4 will reject on `mens` signal via heading 6104 = women's)
4. 6103.10.20 (kept)
5. 6103.32.00 (kept)

The rules-filter cuts the knit-vs-woven contender deterministically — exactly the behaviour the Phase 3 architecture is designed to deliver for this failure class.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o sees the 4 surviving candidates plus injected notes:

- **Chapter 61 Note 1**: "This Chapter applies only to made up knitted or crocheted articles." (from `chapters.notes[0]`, retrieved via SQL.)
- **Chapter 61 Note 3(b)**: defines "ensemble" as "a set of garments (other than suits and articles of heading 6107, 6108 or 6109), composed of several pieces made up in identical fabric, put up for retails sale, and comprising: (i) one garment designed to cover the upper part of the body... and (ii) one or two different garments, designed to cover the lower part of the body..." (from `chapters.notes[2]`.)
- **Chapter 61 Note 9** (sex disambiguation): garments designed for left-over-right closure are men's/boys'; unidentifiable ones default to women's.
- **GIR 1**: "classification shall be determined according to the terms of the headings and any relative Section or Chapter notes" (from `gir-rules.ts`).
- **GIR 6**: subheading classification follows the same principles applied at heading level.

Expected GPT-4o output:

```json
{
  "selected_code": "6103.22.00",
  "reasoning_chain": [
    "GIR 1: heading 6103 explicitly covers 'men's or boys' suits, ensembles, ..., knitted or crocheted' — every term in the query maps directly: mens, ensemble, knitted.",
    "Chapter 61 Note 1 confirms Ch.61 is restricted to knitted/crocheted articles, matching processing_state=knitted.",
    "Chapter 61 Note 3(b) confirms 'ensemble' is a defined term in heading 6103 with a precise legal meaning, so no GIR 3 composite analysis is needed.",
    "GIR 6 at subheading level: 'ensemble — of cotton' is subheading 6103.22 directly (material=cotton). Only one tariff_line (6103.22.00) exists under this subheading, so the 8-digit pick is uniquely determined.",
    "Alternatives rejected: 6203.22.00 dropped by chapter_exclusions rule (Ch.62→Ch.61 knit redirect); 6104.22.00 fails sex check (heading 6104 = women's); 6103.10.20 and 6103.32.00 fail form check (suits/jackets, not ensembles)."
  ],
  "cited_notes": [
    "Ch.61 Note 1 (knitted-only restriction)",
    "Ch.61 Note 3(b) (definition of ensemble)",
    "GIR 1 (terms of headings)",
    "GIR 6 (subheading principles)"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    {"code": "6203.22.00", "rejected_reason": "Ch.62 is woven — chapter_exclusions redirect forces Ch.61"},
    {"code": "6104.22.00", "rejected_reason": "heading 6104 is women's — fails sex axis"},
    {"code": "6103.10.20", "rejected_reason": "heading 6103.10 is suits — fails form axis (ensemble != suit per Note 3(b))"},
    {"code": "6103.32.00", "rejected_reason": "subheading 6103.32 is jackets/blazers — fails form axis"}
  ]
}
```

Hard candidate-set validation passes: `6103.22.00 ∈ filtered_candidates`.

---

## Stage 5 — VERIFY (V1: rubber-stamp)

Gemini-Verify receives:
- query: "mens knitted cotton ensemble"
- selected_code: 6103.22.00
- chapter 61 notes (full JSONB, all 10 notes)
- heading 6103 title

The verifier's job in V1 is rubber-stamp: does anything in the notes contradict the pick?

- Note 1 says "knitted or crocheted only" → query says knitted ✓
- Note 3(b) defines ensemble → query says ensemble ✓
- Heading title says "mens or boys ... ensembles ... knitted or crocheted" → query says mens, ensemble, knitted ✓
- Subheading title "Ensembles : -- Of cotton" → query says cotton ✓
- No exclusion fires against 6103

Expected V1 output:

```json
{
  "agree": true,
  "disagree_reason": null
}
```

No disagreement. Cost stays normal (no escalation).

---

## Stage 6 — DEEP-THINK ESCALATION

Not triggered. Stage 5 V1 agrees, Q-budget unused, no contradicting notes. Skip.

---

## Notes / Anomalies for the coordinator

1. **FTS query semantics anomaly**: `websearch_to_tsquery('english', 'mens knitted cotton ensemble')` returns zero rows against `tariff_lines.description` because tariff_line descriptions in this DB do not contain the words "mens" or "knitted" — those discriminators live at the **heading** level. A production FTS leg should query against a denormalized `chapter.title || heading.title || subheading.title || tariff_lines.description` text, OR use OR semantics. With the descriptions-only column, only `ensemble & cotton` returns the right candidate set. This is a real architecture concern, not a trace artefact — flagging for the Phase 4 builder.

2. **Cascade 2.1/2.2 used heading 6103's own embedding as a proxy** because the protocol forbids actually calling Cohere. The cos_dist=0.0000 self-match on heading 6103 is therefore a degenerate artefact, not real evidence of similarity. The order of *other* candidates (6203 next, then 6104) is the informative part.

3. **The Ch.62→Ch.61 knit redirect exclusion is the killer rule** for this entire failure class. It fires deterministically on the word "knitted" via tsquery. Phase 4's rules-filter should treat this as a high-priority check whenever any Ch.62.* candidate appears alongside any knit signal in the query.

4. **Note 3(b) definition match is strong** — the query word "ensemble" maps to a *legally defined term* in Ch.61 Note 3(b). Confidence is HIGH not because of vector similarity but because the heading title literally enumerates the query tokens.

---

```yaml
case_id: case-4
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6103.22.00"
  expected: tariff_line under heading 6103
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
```

# Case 2 (V2) — freeze-dried instant coffee powder in jars

- **case_id:** case-2
- **variant:** V2 (independent-retrieval Verify)
- **query:** `freeze-dried instant coffee powder in jars`
- **expected:** tariff_line under heading **2101** (NOT Ch.09)
- **failure_class:** processing-state boundary

The crux: raw / roasted / ground coffee belongs to **Ch.09 (heading 0901)**. The moment coffee
has been processed into an *extract / essence / concentrate* (which is exactly what soluble /
instant / freeze-dried coffee is), the WCO redirects it to **Ch.21 heading 2101**. This is one
of the 8 "confusing chapter pairs" baked into the legacy classifier. The trace below shows the
proposed Phase 3 architecture handling this boundary entirely through its designed pathways
(Triage attribute extraction + Rules-aware exclusions + Notes-cited Select) without leaning on
the 35 legacy hard-coded chapter rules.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Gemini-Triage reads the query and produces structured attributes.

Expected JSON output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": "coffee",
    "form": "powder",
    "function": "beverage ingredient (soluble coffee)",
    "intended_use": "retail consumer beverage",
    "processing_state": "freeze-dried / instant / soluble (an extract/concentrate of coffee)",
    "composition": "100% coffee solids, dehydrated"
  },
  "candidate_chapters": ["21", "09"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification (2-3 bullets):

- **Completeness is high (≈0.85).** Material ("coffee"), form ("powder"), and processing_state
  ("freeze-dried instant") are all explicit in the query. Packaging ("in jars") reinforces
  retail-consumer form. No ambiguity worth a clarifying question.
- **Two candidate chapters are correct to surface, not one.** Triage shouldn't pre-pick the
  winner — that's Select's job. But it must surface *both* sides of the boundary so retrieval
  doesn't blackhole. The "coffee" head-noun naturally pulls Ch.09; the "freeze-dried /
  instant" qualifier pulls Ch.21. Triage hands both to retrieval and lets Rules + Select
  arbitrate.
- **No REFUSE, no ASK.** This is a textbook GIR 1 case once you have the processing_state
  attribute — every term needed to disambiguate is in the query.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 — Chapter retrieval (top-10 cosine)

I cannot call Cohere embed-v4 live in this trace, but the expected behaviour given the
chapter-level embeddings (built from chapter title + notes) is:

```sql
-- conceptual; query embedding from Cohere search_query
SELECT chapter, title
FROM chapters
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

Expected top-10 (semantic intuition from chapter titles, since "coffee" is the dominant
content word):

| rank | chapter | title |
|---|---|---|
| 1 | 09 | COFFEE, TEA, MATÉ AND SPICES |
| 2 | 21 | Miscellaneous Edible Preparations |
| 3 | 22 | Beverages, spirits and vinegar |
| 4 | 20 | Preparations of vegetables, fruit, nuts |
| 5 | 19 | Preparations of cereals, flour, starch |
| 6 | 17 | Sugars and sugar confectionery |
| 7 | 18 | Cocoa and cocoa preparations |
| ... | | |

Ch.09 ranks rank-1 (lexical pull of "coffee"), Ch.21 rank-2 (extracts/essences/preparations
of coffee live there). Both are in Triage's candidate set, so they cascade forward.

### 2.2 — Heading retrieval, filtered to candidate chapters ∪ top-10

```sql
SELECT heading, chapter, title
FROM headings
WHERE chapter = ANY(ARRAY['09','21','22','20','19','17','18'])
ORDER BY embedding <=> $query_embedding
LIMIT 15;
```

Real heading rows pulled directly from DB for the two relevant chapters:

| heading | chapter | title |
|---|---|---|
| 0901 | 09 | Coffee, whether or not roasted or decaffeinated; coffee husks and skins; coffee substitutes containing coffee in any proportion. |
| 0902 | 09 | Tea, whether or not flavoured. |
| 2101 | 21 | EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE, TEA OR MATE AND PREPARATIONS WITH A BASIS OF THESE PRODUCTS OR WITH A BASIS OF COFFEE, TEA OR MATE; ROASTED CHICORY AND OTHER ROASTED COFFEE SUBSTITUTES, AND EXTRACTS, ESSENCES AND CONCENTRATES THEREOF |
| 2106 | 21 | Food preparations not elsewhere specified or included. |

Expected cosine ranking: **2101 > 0901 > 2106 > 0902**. 2101's title literally contains
"EXTRACTS, ESSENCES AND CONCENTRATES … OF COFFEE" — exact lexical match for the processing
state. 0901's title qualifies coffee as "whether or not roasted or decaffeinated" — it does
NOT mention extracts / instant / freeze-dried, so the cosine distance is larger.

### 2.3 — Subheading retrieval

```sql
SELECT subheading, heading, title
FROM subheadings
WHERE heading = ANY(ARRAY['2101','0901','2106','0902'])
  AND embedding IS NOT NULL
ORDER BY embedding <=> $query_embedding
LIMIT 20;
```

Real subheading rows from DB:

| subheading | heading | title |
|---|---|---|
| 2101.11 | 2101 | Extracts, essences and concentrates, of coffee, and preparations with a basis of these extracts, essences or concentrates or with a basis of coffee : -- Extracts, essences and concentrates |
| 2101.12 | 2101 | Extracts, essences and concentrates… : -- Preparations with a basis of extracts, essences or concentrates or with a basis of coffee |
| 0901.11 | 0901 | Coffee, not roasted : --Not decaffeinated |
| 0901.12 | 0901 | Coffee, not roasted : --Decaffeinated |
| 0901.21 | 0901 | Coffee roasted : --Not decaffeinated |
| 0901.22 | 0901 | Coffee roasted : --Decaffeinated |
| 0901.90 | 0901 | Other |

Expected cosine ranking: **2101.11 rank-1** ("Extracts, essences and concentrates" matches
"freeze-dried instant" semantically). 2101.12 rank-2 (preparations with a basis of those
extracts — instant coffee in jars walks the boundary between 2101.11 and 2101.12). 0901.21
rank-3+ (roasted but not extracted).

### 2.4 — Tariff_line retrieval (UNION of subheading-filtered and heading-filtered legs)

```sql
SELECT code, subheading, description, export_policy
FROM tariff_lines
WHERE subheading IN ('2101.11','2101.12','0901.21','0901.90')
ORDER BY code;
```

Real DB output (the entire candidate set for both sides of the boundary):

| code | subheading | description | export_policy |
|---|---|---|---|
| 0901.21.10 | 0901.21 | In bulk packing | Free |
| 0901.21.90 | 0901.21 | Other | Free |
| 0901.90.10 | 0901.90 | Coffee husks and skins | Free |
| 0901.90.20 | 0901.90 | Coffee substitutes containing coffee | Free |
| 0901.90.90 | 0901.90 | Other | Free |
| **2101.11.10** | **2101.11** | **Instant coffee, flavoured** | **Free** |
| **2101.11.20** | **2101.11** | **Instant coffee, not flavoured** | **Free** |
| 2101.11.30 | 2101.11 | Coffee aroma | Free |
| 2101.11.90 | 2101.11 | Other | Free |
| 2101.12.00 | 2101.12 | Preparations with a basis of extracts, essences or concentrates or with a basis of coffee | Free |

### 2.f — Postgres FTS leg (parallel, non-cascading)

```sql
SELECT code, subheading, description
FROM tariff_lines
WHERE to_tsvector('english', description)
      @@ websearch_to_tsquery('english', 'instant coffee')
LIMIT 30;
```

Real DB output:

| code | subheading | description |
|---|---|---|
| **2101.11.10** | 2101.11 | Instant coffee, flavoured |
| **2101.11.20** | 2101.11 | Instant coffee, not flavoured |

Exactly two hits, both in 2101.11 — and 2101.11.20 is the expected answer. The FTS leg
*alone* nails the answer because the query's literal "instant coffee" phrase matches the
tariff_line description. Note FTS on the longer phrase `freeze-dried instant coffee powder`
returns zero hits (no tariff_line description contains "freeze-dried"), confirming that the
broader two-token form is the right websearch_to_tsquery to use — the system should query
both `$query` and `$query` reduced to the dominant noun phrase. Worth noting as a small
**RETRIEVAL hardening item**: Phase 3 dispatch builder should generate a degraded-FTS variant
(strip qualifiers like "freeze-dried", "jars") to maximise FTS recall.

### 2.g — Rerank candidate set

UNION of cosine top-30 (predominantly 2101.11.10 / .20 / 2101.11.30 / 2101.12.00 / 0901.21.x)
and FTS top-30 (just 2101.11.10 / .20). Cohere Rerank 4 Fast will rank the 2101.11.20
description "Instant coffee, not flavoured" highest because:

- The query's "freeze-dried instant coffee powder" maps to processing-state = instant; product
  = coffee; no flavour qualifier present → "not flavoured".
- "in jars" is a packaging cue, neutral between .10 and .20 (neither tariff_line title says
  anything about jars; that's where Ch.21 differs from Ch.09 which DOES have
  `0901.21.10 = "In bulk packing"`).

**Top-5 reranked candidates handed to Stage 4:**
1. `2101.11.20` Instant coffee, not flavoured ← expected
2. `2101.11.10` Instant coffee, flavoured
3. `2101.12.00` Preparations with a basis of extracts / coffee
4. `2101.11.30` Coffee aroma
5. `0901.21.90` Coffee roasted, not decaffeinated — Other

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate's chapter, look up exclusions whose `excluded_product_text` matches the
query tsquery.

```sql
SELECT source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE source_chapter IN ('09','21')
  AND (excluded_product_text ILIKE '%coffee%'
       OR excluded_product_text ILIKE '%extract%'
       OR excluded_product_text ILIKE '%instant%');
```

Real DB output:

| source_chapter | excluded_product_text | redirects_to_chapter | redirects_to_heading |
|---|---|---|---|
| 21 | "Extracts of the substitutes referred to in Note 1 (b) above (i.e. extracts of roasted coffee substitutes containing coffee) — these are INCLUDED in Chapter 21" | 21 | 2101 |
| 21 | "roasted coffee substitutes containing coffee in any proportion" | 09 | 0901 |

Interpretation:

- **No exclusion FIRES against any of the surviving candidates.** Both Ch.21 exclusion rows
  apply only to a narrow edge case ("roasted coffee substitutes containing coffee" — i.e.
  chicory + coffee blends, NOT pure freeze-dried coffee). The query is *pure coffee*, not a
  coffee-substitute, so the redirect to 0901 does not apply.
- **The websearch_to_tsquery('instant coffee powder') FTS query returns 0 exclusion rows**
  (verified live) — confirming no exclusion fires.
- Crucially, there is **no Ch.09 exclusion** redirecting "instant coffee / extracts" to Ch.21.
  The boundary is enforced from the *other* direction: **Ch.21 Note 1(b)** ("does not cover
  roasted coffee substitutes containing coffee in any proportion (heading 0901)"). For *pure*
  instant coffee, the heading text of 2101 ("EXTRACTS, ESSENCES AND CONCENTRATES, OF
  COFFEE…") is what affirmatively pulls it in, and Ch.09 Note 1 doesn't claim it. **This is a
  small RULES_GAP candidate worth flagging** — see verdict.

**Candidate set after Rules filter (unchanged):**
1. `2101.11.20` ← still top
2. `2101.11.10`
3. `2101.12.00`
4. `2101.11.30`
5. `0901.21.90`

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o is given:

- Filtered candidate set (5 codes above).
- Chapter 09 notes (Note 1 = mixture-classification rule for headings 0904-0910; Note 2 =
  cubeb pepper exclusion — neither affects coffee processing state).
- Chapter 21 notes — **Note 1(b) explicitly excludes "roasted coffee substitutes containing
  coffee in any proportion (heading 0901)"**, and **Note 2 says "Extracts of the substitutes
  referred to in Note 1(b) above are to be classified in heading 2101."**
- Heading text of 2101: "EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE, TEA OR MATE AND
  PREPARATIONS WITH A BASIS OF THESE PRODUCTS…"
- Heading text of 0901: "Coffee, whether or not roasted or decaffeinated; coffee husks and
  skins; coffee substitutes containing coffee in any proportion."
- GIR 1 (heading terms + chapter notes are decisive).

Expected SELECT output:

```json
{
  "selected_code": "2101.11.20",
  "reasoning_chain": [
    "GIR 1: heading text controls. Heading 2101 covers 'EXTRACTS, ESSENCES AND CONCENTRATES OF COFFEE' — freeze-dried instant coffee powder is dehydrated coffee extract, which is the textbook 2101 product.",
    "Heading 0901 covers coffee 'whether or not roasted or decaffeinated' — i.e. coffee at most processed up to roasting. Freeze-drying is a downstream operation (extraction + dehydration), placing the product outside 0901's scope.",
    "Subheading 2101.11 is 'Extracts, essences and concentrates' (vs 2101.12 'Preparations with a basis of…'). Pure freeze-dried instant coffee with no other ingredients is the extract itself, not a preparation with a basis of one. → 2101.11.",
    "Within 2101.11 the query has no flavour qualifier ('jars' is packaging, not flavour), so 2101.11.20 'Instant coffee, not flavoured' is the correct 8-digit line — not .10 (flavoured), .30 (aroma), or .90 (other)."
  ],
  "cited_notes": [
    "Heading 2101 heading-text",
    "Heading 0901 heading-text",
    "GIR 1"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": {
    "2101.11.10": "Rejected — 'flavoured' qualifier; query is unflavoured.",
    "2101.12.00": "Rejected — this is for preparations with a basis of extracts (e.g. coffee mixes with sugar/creamer). The product is the extract itself.",
    "2101.11.30": "Rejected — 'coffee aroma' refers to flavour concentrates, not soluble coffee.",
    "0901.21.90": "Rejected — 0901 stops at 'whether or not roasted/decaffeinated'. Freeze-drying is further processing."
  }
}
```

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 reruns Stages 2-4 mentally with Gemini-Select playing Select.

**Gemini-Verify independent walk:**

1. Triage attributes are the same (deterministic-ish — material/form/processing_state from
   the query are unambiguous).
2. Retrieval cascade is the same — same DB, same embeddings, same FTS index. The 5
   reranked candidates are identical.
3. Rules filter — same DB query, same zero exclusions firing.
4. Select — Gemini independently applies GIR 1 to the same heading texts and Ch.21 Note 2.

Gemini-Select's expected independent pick:

```json
{
  "independent_pick": "2101.11.20",
  "agrees_with_select": true,
  "difference_reason": null
}
```

**Why agreement is robust here:** The boundary is encoded in the *heading text itself*
("EXTRACTS, ESSENCES AND CONCENTRATES OF COFFEE"). Both models read the same notes, both
apply GIR 1. The only failure mode would be if Gemini-Select pre-anchored on Ch.09 from the
"coffee" head-noun and never read Ch.21's heading text — but the candidate set hands it
2101.11.20 at rank-1 and 0901.21.90 at rank-5, so the model has to actively reject the
top-ranked candidate to disagree. Extremely unlikely.

A second-order consideration worth noting: V2 catches the case where Gemini-Select
hallucinates a code outside the candidate set. The hard validator on candidate-set
membership would block this and re-prompt; this case doesn't trigger it.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agrees with Select. Q-budget not exhausted (no clarifying
questions asked).

---

## Notes on architecture stress

- **The processing-state boundary case is the easy half of Bucket A.** Heading 2101's title
  literally contains the disambiguating phrase "EXTRACTS, ESSENCES AND CONCENTRATES OF
  COFFEE", so notes-aware Select handles it via GIR 1 alone without any rule firing. The
  rules-filter exclusion table doesn't need a Ch.09 → Ch.21 redirect because the heading text
  is self-sufficient.
- **However, the inverse direction is one of the diagnosed legacy bugs.** A query like
  "coffee extract powder" with no "instant" keyword might lose the FTS leg
  (`websearch_to_tsquery('coffee extract')` would also need to surface the 2101.11.x rows —
  none of whose descriptions contain "extract" as a literal token). The candidate set would
  then depend entirely on the cosine cascade landing in 2101 not 0901. **Suggested minor
  hardening (post-MVP):** add a Ch.09 → Ch.21 exclusion row (Ch.09 implicitly: "extracts /
  essences / concentrates / instant / soluble / freeze-dried / lyophilised coffee — see
  heading 2101"). This makes the rules layer affirmatively own the boundary instead of
  relying purely on heading-text reading. Flagging as RULES_GAP, low impact for this query
  but real for adjacent ones.
- **Confusing-pair detection (legacy `detectConfusingPair` for '09'/'21' coffee).** The
  legacy module flagged this exact pair. The Phase 3 architecture replaces that with (1)
  Triage's two-candidate-chapters output and (2) Rules-filter exclusions. For *this* case both
  layers behave correctly, but the Ch.09 → Ch.21 rule missing in the exclusions table means
  Phase 3 has slightly less defence-in-depth than legacy did on the symmetric inverse query.

---

```yaml
case_id: case-2
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "2101.11.20"
  expected: "tariff_line under heading 2101 (NOT Ch.09)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >
  Minor defence-in-depth gap. The chapter_exclusions table has Ch.21 → Ch.09 redirects
  (for "roasted coffee substitutes containing coffee") but no symmetric Ch.09 → Ch.21
  redirect for coffee extracts/instant/soluble/freeze-dried. For this query the heading
  text of 2101 ("EXTRACTS, ESSENCES AND CONCENTRATES OF COFFEE") is self-sufficient and
  Select picks correctly. But adjacent queries like "coffee extract powder" (no "instant"
  keyword) would lose the FTS leg and depend entirely on cosine retrieval landing in 2101
  — risky. Smallest fix: add one chapter_exclusion row with source_chapter='09',
  excluded_product_text='coffee extracts, essences, concentrates, instant / soluble /
  freeze-dried / lyophilised coffee', redirects_to_chapter='21', redirects_to_heading='2101'.
  Also add a degraded-FTS variant in retrieval that strips processing qualifiers
  (freeze-dried, lyophilised, in jars) and retries — protects FTS recall on long queries.
data_dependency: NONE
```

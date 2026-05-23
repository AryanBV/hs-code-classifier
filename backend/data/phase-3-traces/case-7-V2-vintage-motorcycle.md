# Phase 3 Paper Trace — Case 7 (V2): "vintage motorcycle 1939 collectible"

- **case_id:** case-7
- **variant:** V2 (independent-retrieval Verify)
- **query:** `vintage motorcycle 1939 collectible`
- **expected:** tariff_line under subheading **8711.00** (india_specific retention, with india_specific_note describing the vintage-motorcycle retention)
- **failure_class:** india_specific retention
- **expected exact code:** `8711.00.00` ("Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940")

A 1939 motorcycle is the *paradigm* case the Indian schedule retained 8711.00 to capture. The strict question of whether the pipeline can deliver that requires it to (a) NOT escape into chapter 97 (antiques/collectors' pieces) just because the query mentions "collectible", and (b) recognise that 1939 is **pre-1940**, so the india_specific subheading title literally matches.

A secondary, decisive fact: heading **9706** is "ANTIQUES OF AN AGE EXCEEDING 100 YEARS". 2026 − 1939 = **87 years**. So 9706 does NOT apply at all — only 8711.00 does. The architecture must internalise this.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage JSON output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "motorcycle",
    "function": "two-wheeled motor vehicle (collectible)",
    "intended_use": "collectible / vintage retention",
    "processing_state": "manufactured 1939 (vintage, pre-1940)",
    "composition": null
  },
  "candidate_chapters": ["87", "97"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

**Justification (3 bullets):**
- Specificity is high: form ("motorcycle") + year ("1939") + intent ("collectible") together produce a completeness ≈ 0.80. Sufficient to CLASSIFY without ASK; the year is unambiguous and the form is a recognised HS commodity.
- Two chapter candidates surface naturally because "motorcycle" anchors Ch.87 (heading 8711) and "vintage / collectible" anchors Ch.97 (works of art / collectors' pieces / antiques). The Triage prompt must include BOTH so the rules-filter and Select stages can resolve the competition with evidence, rather than the Triage LLM pre-committing.
- No clarifying question because the year (1939) eliminates the ambiguity that would otherwise be present in just "vintage motorcycle" — we know it is pre-1940 AND under 100 years old, which deterministically routes to the india_specific subheading.

**Architectural risk noted:** if Triage emits only `["97"]` (because "vintage collectible" trips a Ch.97 keyword bias) the india_specific 8711.00 row becomes unreachable from heading-level cascade. The Triage prompt must be explicitly instructed: *for any commodity term that names a Section II–XX good, always include the commodity's primary chapter even when antique/collector terms appear.* This is a guardrail the Phase 4 implementation has to encode.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

### 2.1 — Chapter cosine top-10 (semantic)

Embedding-based cosine ranking against `chapters.embedding` for the query is not directly invocable without a Cohere call. Reasoning from chapter titles + the FTS leg (Stage 2.f) + the fact that "motorcycle" is a strong, low-ambiguity term:

Predicted top-10: **`['87', '97', '95', '86', '88', '84', '85', '40', '73', '90']`**

- Ch.87 ranks #1 because heading 8711 explicitly says "Motorcycles".
- Ch.97 ranks #2 because Section XXI title is literally "Works of Art, Collectors' Pieces and Antiques".
- Ch.95 (toys / sports incl. some recreational vehicles), Ch.86 (rail), Ch.88 (aircraft) follow as related transport / collectible-adjacent.

### 2.2 — Heading cosine, filtered to candidate_chapters ∪ top-10 from 2.1

Candidate chapters from Triage: `['87','97']`. Union with 2.1 top-10 is essentially the same set (both already present). Filter:

```sql
SELECT heading FROM headings
WHERE chapter = ANY('{87,97,95,86,88,84,85,40,73,90}')
ORDER BY embedding <=> $query_embedding
LIMIT 15;
```

Predicted top-15 headings (high confidence based on title semantics):

| rank | heading | title fragment |
|------|---------|---------------|
| 1 | **8711** | Motorcycles (including mopeds)... |
| 2 | **9706** | ANTIQUES OF AN AGE EXCEEDING 100 YEARS |
| 3 | **9705** | COLLECTIONS AND COLLECTORS' PIECES... |
| 4 | 8712 | Bicycles and other cycles |
| 5 | 8714 | Parts and accessories of vehicles of heading 8711–8713 |
| 6 | 8703 | Motor cars |
| 7 | 9701–9704 | Paintings / sculptures / etc. |
| 8–15 | 9503, 8601, etc. | toys, rail, etc. |

### 2.3 — Subheading cosine within top-15 headings

```sql
SELECT subheading FROM subheadings
WHERE heading = ANY('{8711,9706,9705,8712,8714,8703,9701,9702,9703,9704,9503,8601}')
  AND embedding IS NOT NULL
ORDER BY embedding <=> $query_embedding
LIMIT 20;
```

Real subheadings present (verified via SQL):

```
8711.00  "Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940"
         india_specific=true, wco_2022_match=false
8711.10  "...not exceeding 50 cc"
8711.20  "...exceeding 50 cc but not exceeding 250 cc"
8711.30  "...exceeding 250 cc but not exceeding 500 cc"
8711.40  "...exceeding 500 cc but not exceeding 800 cc"
8711.50  "...exceeding 800 cc"
8711.60  "With electric motor for propulsion"
8711.90  "Other"
9706.10  "Of an age exceeding 250 years"
9706.90  "Other"
9705.10  "Collections... archaeological, ethnographic or historical interest"
9705.21/22/29/31/39  Human/extinct/numismatic specimens
```

Predicted cosine top-5 subheadings: **`['8711.00', '9706.90', '9705.10', '9706.10', '8711.50']`**.

- 8711.00 wins on the cosine leg because its **subheading title literally contains "Vintage Motorcycles ... manufactured prior to 1.1.1940"** — every salient word of the query appears in the title.
- 9706.90 ranks because "vintage + collectible" matches "antiques... Other" semantically.
- 9706.10 ranks because of "antique" semantics but is downweighted by "exceeding 250 years" (1939 is 87 years old).

### 2.4 — Tariff_line cosine, UNION (filter-by-subheading) and (filter-by-heading broader)

```sql
-- Branch A: filter by top-20 subheadings
SELECT code FROM tariff_lines
WHERE subheading = ANY('{8711.00,9706.90,9705.10,9706.10,8711.50,...}')
ORDER BY embedding <=> $query_embedding
LIMIT 20;

-- Branch B: filter by top-15 headings (broader; catches empty-title subheading orphans)
SELECT code FROM tariff_lines
WHERE LEFT(code,4) = ANY('{8711,9706,9705,...}')
ORDER BY embedding <=> $query_embedding
LIMIT 20;
```

Real candidate tariff_lines under heading 8711 (verified via SQL — 25 rows):

```
8711.00.00  "Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940"   ← target
8711.10.10  "Mopeds"
8711.10.20  "Motorised cycles"
8711.20.21  "Motor cycles: ----Of cylinder capacity not exceeding 75 cc"
8711.20.29  "Motor cycles: ----Other"
8711.30.20  "Motor-cycles"
8711.40.10  "Motor-cycles"
8711.50.00  (engine capacity > 800cc)
8711.60.10  "Motor cycles" (electric)
8711.90.10  "Side-cars"
...
```

Real candidate tariff_lines under heading 9706 (verified via SQL):

```
9706.10.00  "Of an age exceeding 250 years"                  export_policy=Free, policy_condition=DM certificate
9706.90.00  "Other"                                          export_policy=Free, policy_condition=DM certificate
```

### 2.f — Postgres FTS leg (parallel)

```sql
SELECT code, description FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english', 'vintage motorcycle')
LIMIT 30;
```

**Real result (run against DB):**

```
8711.00.00 | "Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940"
```

Single, unambiguous, exact-match FTS hit. The FTS leg of the hybrid retrieval **drops the answer onto the table by itself.** This is the single most important signal in the entire trace.

### 2.g — Union + Cohere Rerank 4 Fast → top-5 final

The cosine-top-30 union FTS-top-30 candidate set is fed to Rerank with the original query. Predicted top-5 after rerank:

1. **8711.00.00** — Vintage Motorcycles, manufactured prior to 1.1.1940 (lexical exact match + cosine match + FTS hit; reranker should put this at #1 with high margin)
2. 9706.90.00 — Antiques, Other (cosine match on "vintage / collectible / antique")
3. 9706.10.00 — Antiques over 250 years (weaker; year mismatch)
4. 9705.10.00 — Collectors' pieces of historical interest
5. 8711.50.00 — > 800cc motorcycle (form match, year mismatch)

Rerank-4-Fast is well-suited to weighting the exact lexical phrase "Vintage Motorcycles ... prior to 1.1.1940" overwhelmingly. Predicted rank-1 margin is large.

---

## Stage 3 — RULES FILTER (chapter_exclusions, programmatic)

Run against the 5 candidate chapters in the final set (`87`, `97`):

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading,
       source_note_number, excluded_product_text
FROM chapter_exclusions
WHERE source_chapter IN ('87','97')
  AND to_tsvector('english', excluded_product_text)
      @@ websearch_to_tsquery('english', 'vintage motorcycle 1939 collectible');
```

**Real result: empty set (0 rows).**

Broader probe — does ANY chapter exclusion redirect *to* chapter 97 with text matching the query? Verified via SQL: 15 chapters do exclude "antiques / collectors' pieces" and redirect to Ch.97, but **chapter 87 is NOT among them.** Chapter 87 has no "antiques over 100 years go to Ch.97" exclusion rule. The opposite direction (97 → 87) is also absent: Chapter 97 Note 5(A) says "*articles of this Chapter are to be classified in this Chapter and not in any other Chapter*" — but it is "Subject to Notes 1 to 3 above", and Note 1 is the explicit-exclusions list which does NOT mention motorcycles.

**Key finding:** The exclusions table has NO rule that fires for this query. Candidate set passes through Stage 3 **unchanged**.

This is the *correct* behaviour: India deliberately retained 8711.00 as a national subdivision so that vintage motorcycles route to Ch.87 (not Ch.97), and the absence of a 97→87 or 87→97 exclusion encodes exactly that policy.

---

## Stage 4 — SELECT (GPT-4o, json_schema, candidate-set validation)

Inputs to GPT-4o-Select:
- Query: "vintage motorcycle 1939 collectible"
- Candidate set (top-5 from Rerank): `[8711.00.00, 9706.90.00, 9706.10.00, 9705.10.00, 8711.50.00]`
- Chapter 87 JSONB notes (6 notes — verified via SQL; includes the e-bicycle Supplementary Note 1)
- Chapter 97 JSONB notes (6 notes — Note 5(A) "subject to Notes 1 to 3, articles of this Chapter are to be classified in this Chapter and not in any other Chapter"; Note 5(B) "Heading 9706 does not apply to articles of the preceding headings of this Chapter")
- Section XVII notes (no antique exclusions)
- Section XXI notes (none recorded)
- Subheading 8711.00 india_specific_note (verified): *"The 87110000 row carries a UNIQUE Indian-specific description (Vintage Motorcycles pre-1940) that is semantically distinct from the heading 8711 caption (general motorcycles). It functions as the canonical code for India's vintage motorcycle export-restriction policy ... This is a deliberate Indian national subdivision, not a layout artifact."*
- GIR 1, GIR 3, GIR 6 in the prompt (heading + subheading terms = legal-text-governed selection)

Expected GPT-4o-Select output:

```json
{
  "selected_code": "8711.00.00",
  "self_confidence": "HIGH",
  "reasoning_chain": [
    "Subheading 8711.00 has an India-specific title 'Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940' that exactly matches all three salient query terms (vintage + motorcycle + pre-1940 ≡ 1939).",
    "Heading 9706 is excluded by its own scope text — 'AGE EXCEEDING 100 YEARS' — and 1939 is 87 years old as of 2026, so it does not meet the 9706 threshold.",
    "Chapter 97 Note 5(A) does not capture this article either: 9706 cannot apply, and headings 9701–9705 cover paintings / sculptures / collections of historical or numismatic interest, none of which describe a transport vehicle that India retained a dedicated tariff line for.",
    "The india_specific_note on subheading 8711.00 documents the explicit Indian policy intent: a national subdivision deliberately preserved across HS-2022 specifically for vintage motorcycle export-restriction enforcement. GIR 1 (legal terms of headings govern) plus GIR 6 (subheading classification only against other subheadings of the same heading) make 8711.00 binding."
  ],
  "cited_notes": [
    "Chapter 97 Note 5 (containment + 9706 limitation)",
    "Heading 9706 title text ('AGE EXCEEDING 100 YEARS')",
    "Subheading 8711.00 india_specific_note",
    "GIR 1 + GIR 6"
  ],
  "alternatives_considered": [
    "9706.90.00 — rejected: heading 9706 caps at >100 years; 1939 article is 87 years old.",
    "9706.10.00 — rejected: requires >250 years.",
    "9705.10.00 — rejected: 9705 covers archaeological/ethnographic/historical collections, not transport articles; collectible status alone is not enough.",
    "8711.50.00 — rejected: cylinder capacity not specified in query, and 8711.00 is more specific (vintage + pre-1940 fully matches)."
  ]
}
```

This is a STRAIGHTFORWARD HIGH-confidence pick once 8711.00's india_specific_note is injected into context. The note is the single piece of information that disambiguates *this* tariff line from the others under heading 8711, and the architecture must surface it.

---

## Stage 5 — VERIFY (V2: independent retrieval)

V2 reruns Stages 2–4 with **Gemini-Select** as an independent solver, then compares to GPT-4o-Select's output.

### Gemini-Verify independent rerun (predicted)

1. **Stage 2 independent embedding** — Gemini-Verify is given the same query string. It produces a candidate set independently via Cohere Rerank. Because the FTS leg + cosine leg both point overwhelmingly to 8711.00.00, the independent candidate set is **identical** to Stage 4's input (or near-identical — same top-3).
2. **Stage 3 rules filter** — deterministic; same empty result.
3. **Stage 4 independent select** — Gemini-2.5-Flash (acting as Verify-Select) sees the same notes + GIRs. Predicted independent pick:

```json
{
  "independent_pick": "8711.00.00",
  "agrees_with_select": true,
  "difference_reason": null
}
```

**Why I'm confident V2 agrees:**
- The lexical match on the subheading title is so strong ("Vintage Motorcycles ... prior to 1.1.1940" vs query "vintage motorcycle 1939 collectible") that any retrieval system with FTS will surface 8711.00.00 at rank 1.
- The age arithmetic (2026 − 1939 = 87 years < 100) is a deterministic check that disqualifies 9706 cleanly. Any reasoning model with the heading 9706 text in context will reach the same conclusion.
- The india_specific_note is dispositive evidence; an adversarial Verify cannot honestly argue against it.

**Potential weak spot:** if the Triage stage upstream emitted only `["97"]` as candidate_chapters (the failure mode flagged in Stage 1), Gemini-Verify's independent retrieval would also be biased toward Ch.97 — *but* the FTS leg is independent of Triage's chapter filter (it scans all tariff_lines), so 8711.00.00 still surfaces. This is a design strength of the hybrid (cosine ∩ filtered-by-triage) ∪ (FTS, unfiltered) architecture: the FTS leg acts as an escape valve when Triage over-constrains.

### V2 verdict: **AGREE on 8711.00.00**

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agrees, Q-budget is not exhausted (no clarifying question was asked), and Select's self_confidence is HIGH. Skip.

---

## Anomaly notes for the coordinator

1. **Triage upstream risk.** The biggest pipeline risk for this case is at Stage 1 (Triage), not at retrieval: if the Triage prompt is allowed to "decide" the chapter and emits only `["97"]` on the strength of "vintage / collectible", the cosine cascade gets choked off. Mitigation: keep Stage 1 *broad* (1–3 chapters), and let Stages 2–4 narrow with evidence. The FTS leg of Stage 2 is also a fundamental safety net here.

2. **Age arithmetic is implicit reasoning.** The pipeline never sees the literal text "87 years old" — it has to reason from "1939" + the current year + "AGE EXCEEDING 100 YEARS". For a robust Select, the prompt should include either (a) the current calendar year as a system fact, or (b) explicit chain-of-thought instruction to compute age for any year-mentioned query. Otherwise a model could be tempted to over-classify "vintage 1939" as 9706 because it doesn't compute the cutoff.

3. **Strong india_specific_note as the disambiguator.** This case is a *poster child* for the india_specific subheading mechanism added in Phase 2f. Without that note being injected into Select's context, 8711.00 is just one of 25 tariff_lines under heading 8711 with no obvious priority — the model might prefer 8711.50.00 (>800cc) or 8711.90.10 (side-cars) based on generic "vintage motorcycle" semantics. The note is **load-bearing**. Phase 4 retrieval MUST surface india_specific_note text on every subheading-level candidate, not just the title.

4. **FTS exact-phrase dominance.** This case essentially "self-classifies" because the subheading title contains the exact query words. Other india_specific cases (e.g., Case 12 — jasmine oil) won't be this lucky. The cost-class CHEAP / NORMAL here may not generalise to other india_specific failure-class cases.

5. **Empty-subheading-title is NOT an issue here.** Subheading 8711.00 has a populated, distinctive title. The 454-empty-title gotcha doesn't bite this case. (It might bite cases 4, 5, 9 — flagging for the coordinator's overall view.)

---

```yaml
case_id: case-7
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8711.00.00"
  expected: "tariff_line under subheading 8711.00 (india_specific retention, pre-1940 vintage motorcycle)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: "Subheading 8711.00 india_specific_note MUST be injected into Select context; otherwise Select sees 25 indistinguishable heading-8711 tariff_lines and the dispositive evidence is lost. Phase 4 retrieval contract: every subheading-level candidate carries its india_specific_note text into the Select prompt (not just the title)."
```

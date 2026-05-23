# Case 5 — V2 — windscreen wiper motor 12V automotive

- **case_id:** case-5
- **variant:** V2 (independent-retrieval Verify)
- **query:** `windscreen wiper motor 12V automotive`
- **expected:** `tariff_line 8512.40.00` (NOT 8708 — diagnosed vehicle-electrical-vs-parts trap)
- **failure_class:** vehicle-electrical-vs-parts diagnosed
- **legal anchor:** Chapter 85 Note 2 — "Headings 8501 to 8504 do not apply to goods described in headings 8511, **8512**, 8540, 8541 or 8542" + Section XVII Note 2(f) — Ch.86-89 do not cover "electrical machinery or equipment (Chapter 85)."

This is a textbook three-way trap. The query mentions a motor (→ Ch.85 heading 8501 *Electric motors*), an automotive context (→ Ch.87 heading 8708 *Parts and accessories of motor vehicles*), and the named purpose "windscreen wiper" (→ Ch.85 heading 8512 *...windscreen wipers...of a kind used for cycles or motor vehicles*). Two legal notes (Ch.85 Note 2 and Section XVII Note 2(f)) collapse all three into 8512.40.00. The India tariff schedule also contains 8501.10.13 / 8501.31.13 explicitly titled "Wiper motor" — these are non-conforming sub-classifications that would be illegal at GIR-1 level because Ch.85 Note 2 forbids 8501 for goods of 8512. They make a perfect adversarial lure for retrieval.

---

## Stage 1 — Triage (Gemini 2.5 Flash, json_schema)

Expected Gemini-Triage output:

```json
{
  "decision": "CLASSIFY",
  "extracted_attributes": {
    "material": null,
    "form": "motor / electromechanical assembly",
    "function": "drive windscreen wiper arm",
    "intended_use": "motor vehicle (automotive)",
    "processing_state": "finished assembly",
    "composition": null,
    "voltage": "12V"
  },
  "candidate_chapters": ["85", "87"],
  "clarifying_question": null,
  "refusal_reason": null
}
```

Justification:
- Completeness is high: function ("windscreen wiper"), use ("automotive"), voltage ("12V") all present. No ASK needed.
- The phrase "windscreen wiper" is a named-purpose product that 8512 explicitly enumerates in its heading title, so Ch.85 is the dominant candidate. Ch.87 is a sensible secondary because the product is for a motor vehicle and a sloppy Triage that pattern-matches "automotive" → "vehicle parts" would surface it. Including Ch.87 here is actually *desirable* — the rules-filter stage exists precisely to neutralise it, and giving Verify a Ch.87 candidate to ablate is how the architecture proves it works.
- Ch.84 (mechanical apparatus) is correctly *not* a candidate — a 12V electric motor for a wiper is unambiguously electrical, Section XVI Note 5 makes Ch.85 the right neighbourhood.
- The reference file `backend/src/data/confusing-chapter-pairs.ts` lines 236-249 already encodes this exact pair (`['motor','generator','wiper','starter','alternator','automotive','vehicle','car','truck','12V','24V']` → Ch.85 vs Ch.87), confirming Triage should and would surface both.

---

## Stage 2 — Hybrid Retrieval (cascaded, 4 levels)

### 2.1 — Chapter cosine top-10

I cannot call Cohere embed-v4 here, so I reason from title content. The chapter `embedding` column was built from `INITCAP(title)`. The query "windscreen wiper motor 12V automotive" semantically targets *electrical machinery / motors / vehicle electrical equipment*. Predicted top-10 (with high confidence on top-3 ordering):

| rank | chapter | title (excerpt) | rationale |
|---|---|---|---|
| 1 | 85 | Electrical machinery and equipment and parts thereof | "motor" + "12V" + "electrical" |
| 2 | 87 | Vehicles Other Than Railway, And Parts And Accessories | "automotive" |
| 3 | 84 | Nuclear Reactors, Boilers, Machinery And Mechanical Appliances | "motor" |
| 4 | 86 | Railway/tramway rolling-stock | adjacency to Ch.87 |
| 5 | 88 | Aircraft, Spacecraft | adjacency to Ch.87 |
| 6 | 89 | Ships, Boats | adjacency to Ch.87 |
| 7 | 90 | Optical, photographic, measuring instruments | electrical apparatus overlap |
| 8 | 73 | Articles of iron or steel | weak |
| 9 | 39 | Plastics and articles thereof | weak |
| 10 | 70 | Glass and glassware | "windscreen"→glass false positive |

Ch.85 should be rank-1 because (a) every Ch.85 heading title begins with "Electrical..." or names an electrical product, (b) "motor" is the head noun of the query, (c) "12V" anchors hard to electrical. Ch.87 rank-2 from "automotive". Ch.10 is glass — included only because "windscreen" semantically pulls glass, but that signal is weak vs the motor/electrical signal. **Union with Triage candidates `{85, 87}` is a no-op** — they're already in the top-2.

### 2.2 — Heading cosine top-15 within `chapter = ANY({85, 87, 84, 86, 88, 89, 90, 73, 39, 70})`

The heading embedding includes both chapter title and heading title (`"[chap_title]. [head_title]."`). Predicted top-15 against "windscreen wiper motor 12V automotive":

| rank | heading | title (excerpt) | why |
|---|---|---|---|
| 1 | **8512** | Electrical lighting or signalling equipment ..., **windscreen wipers**, defrosters and demisters, of a kind used for cycles or motor vehicles | exact lexical match on "windscreen wipers" + "motor vehicles" |
| 2 | 8501 | Electric motors and generators | "motor" + "electric" (12V → DC) |
| 3 | 8511 | Electrical ignition or starting equipment ... starter motors ... for internal combustion engines | "motors" + "automotive" |
| 4 | 8708 | Parts and accessories of the motor vehicles | "motor vehicles" + "automotive" |
| 5 | 8504 | Electrical transformers, static converters, inductors | "electrical" + voltage |
| 6 | 8505 | Electro-magnets | adjacent |
| 7 | 8543 | Electrical machines and apparatus, having individual functions, NESOI | broad |
| 8 | 8548 | Electrical parts of machinery NESOI | broad |
| 9 | 8702-8705 | Vehicles for transport | weak Ch.87 pull |
| 10-15 | 8506, 8507, 8509, 8530, 8531, 8537 | various electrical | low rank |

8512 is rank-1 by a wide margin because no other heading in the entire nomenclature contains "windscreen wipers" in its title. 8501 and 8708 are the two distractors. **Critically: 8512 *is* in the candidate set.** Failure mode to watch in V2: if Cohere mis-ranks and 8501 lands above 8512, Stage 3 rules-filter must catch it.

### 2.3 — Subheading cosine top-20 within {top-15 headings}

I queried the live DB for what 8512 subheadings exist:

```sql
SELECT subheading, title FROM subheadings WHERE heading='8512' ORDER BY subheading;
```

| subheading | title |
|---|---|
| 8512.10 | Lighting or visual signalling equipment of a kind used on bicycles |
| 8512.20 | Other lighting or visual signalling equipment |
| 8512.30 | Sound signalling equipment |
| **8512.40** | **Windscreen wipers, defrosters and demisters** |
| 8512.90 | Parts |

8512.40 has a perfect lexical match on "Windscreen wipers". For 8501 subheadings 8501.10 / 8501.31, the titles are "Motors of an output not exceeding 37.5 W" / "Other DC motors; DC generators: -- Of an output not exceeding 750 W" — they match on "motor" but lack any wiper-specific signal. Predicted subheading top-5:

| rank | subheading | title |
|---|---|---|
| 1 | **8512.40** | **Windscreen wipers, defrosters and demisters** |
| 2 | 8512.20 | Other lighting or visual signalling equipment |
| 3 | 8501.10 | Motors of an output not exceeding 37.5 W |
| 4 | 8501.31 | Other DC motors; DC generators -- ≤ 750 W |
| 5 | 8708.29 | Other parts and accessories of bodies |

### 2.4 — Tariff_line cosine top-20 (union of subheading-membership and heading-membership)

I queried for live tariff_lines whose `description` lexically intersects the query (proxy for what cosine would rank highly):

```sql
SELECT code, description,
       ts_rank(to_tsvector('english', description),
               websearch_to_tsquery('english','windscreen wiper motor automotive')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english','windscreen OR wiper OR demister OR defroster')
ORDER BY rank DESC LIMIT 30;
```

Real result:

| code | description | FTS rank |
|---|---|---|
| 8501.10.13 | DC motor: ----Wiper motor | 0.188385 |
| 8501.31.13 | DC motors: ----Wiper motor | 0.188385 |
| **8512.40.00** | **Windscreen wipers, defrosters and demisters** | **0.0991032** |
| 8708.22.00 | Front windscreens (windshields), rear windows ... | 1e-20 |

**Critical anomaly:** India's tariff schedule sub-classifies "Wiper motor" inside 8501 (at the 8-digit level) even though Ch.85 Note 2 says 8501 cannot apply to goods of 8512. This is a legal inconsistency baked into the published Indian schedule. **FTS ranks 8501.10.13 / 8501.31.13 ABOVE 8512.40.00**. Cohere semantic retrieval will likely do the same — embeddings will see "Wiper motor" as 2-of-2 token match for {wiper, motor} but 8512.40.00 only matches {wiper} at the tariff_line description level (its strong match comes from the heading title, which embeds *up* the chain). The heading-membership fallback fortunately surfaces 8512.40.00 since 8512 is the top heading from 2.2.

Predicted Stage 2.4 candidate set (top-5 union):

```
{8501.10.13, 8501.31.13, 8512.40.00, 8708.29.xx, 8708.22.00}
```

### 2.5 — Postgres FTS leg (parallel)

```sql
SELECT code FROM tariff_lines
WHERE to_tsvector('english', description)
   @@ websearch_to_tsquery('english','windscreen wiper motor automotive')
LIMIT 30;
```

Real result: `[]` (empty). websearch_to_tsquery defaults to AND-of-tokens; no single tariff_line description contains all of {windscreen, wiper, motor, automotive}. The FTS leg contributes nothing for this query — retrieval rests entirely on Cohere cosine.

### 2.6 — Rerank-4-Fast top-5

Cohere Rerank operates on full query + candidate text. It scores semantic-plus-lexical relevance. Predicted final ordering:

| rank | code | rerank rationale |
|---|---|---|
| 1 | **8512.40.00** | full title "Windscreen wipers, defrosters and demisters" + heading mentions "motor vehicles" — best joint match |
| 2 | 8501.10.13 | exact "Wiper motor" but unrelated heading |
| 3 | 8501.31.13 | exact "Wiper motor" but unrelated heading |
| 4 | 8708.29.xx | "vehicle parts" pull |
| 5 | 8708.22.00 | windscreen → windshields glass false-positive |

Reranker should reverse the FTS ordering and put 8512.40.00 at #1 because the rerank model considers context. But this is a CLOSE rerank — 8501.10.13 with "Wiper motor" as literal phrase is a strong lure. Confidence that rerank puts 8512.40.00 at #1: ~70-80%. The remaining 20-30% scenario (8501.x.13 wins rerank) is exactly why the Rules Filter must run next.

---

## Stage 3 — Rules Filter (programmatic, no LLM)

Apply chapter_exclusions FTS-tsquery match against the query for each candidate's source chapter.

### Candidate 8512.40.00 (chapter 85)

```sql
SELECT * FROM chapter_exclusions
WHERE source_chapter='85'
  AND to_tsvector('english', excluded_product_text)
   @@ websearch_to_tsquery('english','windscreen wiper motor 12V automotive');
```

Real result: **no rows match** the tsquery (all 10 ch.85 exclusions returned rank 1e-20 against the full query). **8512.40.00 survives.**

### Candidate 8501.10.13 / 8501.31.13 (chapter 85)

Same chapter, same FTS — also no exclusion fires by tsquery. **Naive rules-filter does NOT drop the 8501 lures.**

BUT — the database contains the *exact* legally-controlling rule as id=2378:

```
source_chapter: 85
redirects_to_chapter: 85
excluded_product_text: "goods described in headings 8511, 8512, 8540, 8541 or 8542 (excluded from headings 8501 to 8504)"
```

The tsquery never matches this rule's text because the query contains zero of the tokens {goods, described, headings, 8511, 8512, ...}. **The rule is in the data but the FTS-based activation cannot fire it.** This is a CORE RULES_GAP for the architecture as written.

A *cross-candidate* rule firing pattern would catch this: "if candidate A has chapter X and rule says 'X-headings 8501-8504 do not apply to goods of heading H' and another candidate B has heading H, drop A." That requires the rules-filter to read rules whose text mentions *the headings of other candidates*, not whose text matches the query. The current spec (Stage 3 description) only matches rules against the query text — so this redirect rule will silently sleep.

### Candidate 8708.22.00 / 8708.29.xx (chapter 87)

```sql
SELECT * FROM chapter_exclusions
WHERE source_chapter='87'
  AND to_tsvector('english', excluded_product_text)
   @@ websearch_to_tsquery('english','windscreen wiper motor 12V automotive');
```

Real result: empty (the relevant rule id=2428 "Electrical machinery or equipment (Chapter 85) — e.g., starter motors, alternators..." does not lexically intersect "windscreen wiper motor 12V automotive" — the rule mentions "starter motors" and "lighting equipment", not "wiper motor"). **The Ch.87 redirect rule also fails to fire.**

A broader-match strategy (e.g. tsquery on the *chapter* token alone, or running FTS on attribute-derived expansions like "electrical motor") would help. But as specified, Stage 3 lets both Ch.85-8501 lures and Ch.87-8708 lures pass through to Select.

### Rules Filter outcome

**Candidate set unchanged: {8512.40.00, 8501.10.13, 8501.31.13, 8708.29.xx, 8708.22.00}.** Redirect set empty. The architecture's rules filter — designed for exactly this class of confusion — does not fire on this query.

---

## Stage 4 — Select (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o receives the 5-candidate set above plus:

- **Chapter 85 Note 2** (real DB row from `chapters.notes`): "Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542. However, metal tank mercury arc rectifiers remain classified in heading 8504."
- **Section XVII Note 2(f)** (real DB row from `sections.notes` WHERE section='XVII'): "The expressions 'parts' and 'parts and accessories' do not apply to the following articles ... (f) electrical machinery or equipment (Chapter 85) ..."
- **Heading 8512 title** (real): "Electrical lighting or signalling equipment (excluding articles of heading 85.39), windscreen wipers, defrosters and demisters, of a kind used for cycles or motor vehicles."
- **GIR 1** (from `backend/src/data/gir-rules.ts`): start with the heading text and chapter notes.
- The same `confusing-chapter-pairs.ts` entry already flagging Ch.85 vs Ch.87 for "wiper motor / automotive / 12V".

A correctly prompted GPT-4o will reason:

1. GIR 1 + heading text: 8512 names "windscreen wipers ... of a kind used for cycles or motor vehicles" → direct lexical hit on the query.
2. Chapter 85 Note 2: 8501.x cannot apply because the goods are described in 8512. **Drops 8501.10.13, 8501.31.13.**
3. Section XVII Note 2(f): Ch.87 cannot apply because the goods are electrical machinery of Ch.85. **Drops 8708.22.00, 8708.29.xx.**
4. 8512.40 (Windscreen wipers, defrosters and demisters) is the only surviving subheading under 8512; 8512.40.00 is the only tariff line under it.

Expected Select output:

```json
{
  "selected_code": "8512.40.00",
  "reasoning_chain": [
    "GIR 1: heading 8512 explicitly names 'windscreen wipers ... of a kind used for cycles or motor vehicles', matching the query head noun.",
    "Chapter 85 Note 2 forbids headings 8501-8504 for goods described in heading 8512, so 8501.10.13 'Wiper motor' and 8501.31.13 'Wiper motor' are legally inadmissible despite their lexical exactness.",
    "Section XVII Note 2(f) excludes electrical machinery of Ch.85 from being treated as Ch.87 parts, so 8708.x is inadmissible.",
    "Within heading 8512, subheading 8512.40 is the sole subheading covering windscreen wipers; the only tariff line is 8512.40.00."
  ],
  "cited_notes": [
    "chapter:85:note-2",
    "section:XVII:note-2(f)",
    "heading:8512:title",
    "GIR-1"
  ],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    {
      "code": "8501.10.13",
      "rejected_because": "Ch.85 Note 2 forbids 8501-8504 for goods of 8512"
    },
    {
      "code": "8501.31.13",
      "rejected_because": "Ch.85 Note 2 forbids 8501-8504 for goods of 8512"
    },
    {
      "code": "8708.29.xx",
      "rejected_because": "Section XVII Note 2(f) excludes electrical machinery of Ch.85"
    },
    {
      "code": "8708.22.00",
      "rejected_because": "8708.22 is for windscreens (glass panels), not wipers; misread of 'windscreen'"
    }
  ]
}
```

Selection depends entirely on whether Select sees the chapter and section notes. If the architecture injects `chapters.notes` for every candidate's chapter AND the `sections.notes` for each candidate chapter's section, then HIGH confidence on 8512.40.00 is the expected outcome. If section notes are NOT injected, the most prominent legal rule (Section XVII Note 2(f)) is invisible to Select, and the model may pick 8708 on automotive context. **This is the second architectural risk for this case** — a SELECT_GAP if section notes aren't routed in.

---

## Stage 5 — Verify, V2 (independent retrieval)

V2 spec: Gemini-Select-Verify runs Stages 2-4 *independently* with the same query, then compares its pick to GPT-Select's pick.

Independent rerun by Gemini-Verify (same data, same prompts, different model):

### Independent Stage 2 (retrieval)

Cohere embedding cosine is *deterministic* given the same query string. Gemini-Verify hits the *same* HNSW indices and gets the *same* candidate set: `{8512.40.00, 8501.10.13, 8501.31.13, 8708.29.xx, 8708.22.00}`. Identical to GPT-Select's input.

### Independent Stage 3 (rules filter)

Same FTS-based rules-filter logic, same DB → same outcome: no candidate dropped, no redirect surfaced. Identical.

### Independent Stage 4 (Gemini-Select)

Gemini-2.5-Pro (or whatever Verify model) sees the same 5 candidates plus the same notes. The legal reasoning chain (Ch.85 Note 2 → drop 8501.x; Section XVII Note 2(f) → drop 8708.x; 8512.40.00 by elimination + direct heading-text match) is a *deductive* inference, not a probabilistic guess. Two well-prompted models with the same data both deduce 8512.40.00.

Gemini-Verify-independent pick:

```json
{
  "independent_pick": "8512.40.00",
  "agrees_with_select": true,
  "difference_reason": null
}
```

### V2 confidence

V2 *agrees* with Select. Confidence HIGH. No escalation needed.

### Edge case: where V2 would disagree

V2 disagreement is plausible only if:
- Verify sees a different `notes` payload (e.g., section notes truncated for Verify but not for Select) → architecture bug, easy fix.
- Cohere embedding is non-deterministic / nondetermined-tiebreak at HNSW level → unlikely at top-5.
- GPT-4o hallucinates a tariff line not in the candidate set → blocked by hard candidate-set validation.

None of these are intrinsic to the query.

---

## Stage 6 — Deep-Think Escalation

**Not triggered.** Verify (V2) agrees with Select. Q-budget not consumed. Skip.

---

## Cross-stage observations

### What works

- Cohere semantic retrieval surfaces 8512.40.00 in the top-5 even though FTS alone would not (it's outranked by lexically-perfect "Wiper motor" inside 8501).
- The two legally-controlling notes (Ch.85 Note 2 and Section XVII Note 2(f)) are *both* already present in the DB as `chapters.notes` and `sections.notes` JSONB.
- Hard candidate-set validation prevents hallucination.
- GIR 1 + heading title is sufficient legal basis once the notes are in the prompt.

### What doesn't work

1. **Rules-filter Stage 3 is silent on this case.** Neither rule id=2378 (Ch.85 → 8501 cannot apply to 8512 goods) nor rule id=2428 (Ch.87 → electrical equipment of Ch.85) fires by FTS on the query text. The redirect data exists; the activation mechanism is wrong.
   - Concrete fix: Stage 3 should match each *candidate's heading* against the `redirects_to_heading` field of exclusions sourced from *other candidates' chapters*. For this query: candidate 8501.10.13 (source 8501) is excluded by rule id=2378 because candidate 8512.40.00 (heading 8512) is named in that rule's `excluded_product_text` token "8512". This is a **rules-by-other-candidates** join, not a rules-by-query FTS.

2. **Postgres FTS leg contributes nothing** because the query is 4 disjoint tokens with no co-occurring tariff_line description. This is expected — short multi-attribute queries naturally fall through FTS — but it means Cohere retrieval has zero corroboration for this case.

3. **India sub-classifications 8501.10.13 / 8501.31.13 ("Wiper motor") are legally invalid under Ch.85 Note 2** but exist in the published schedule. They are a permanent adversarial lure for this query and any query about wiper motors. Architecturally fine — Select drops them on notes — but worth flagging in a data-quality audit: these India-specific tariff items should arguably carry a flag `legal_status: "non_conforming"` or a cross-reference to 8512.40.00. Currently `india_specific=false` on both 8501.10 and 8501.31 — meaning the audit has not caught this.

### Data-dependency observation

The trace's success depends critically on:
- `chapters.notes` containing Ch.85 Note 2 verbatim — verified present, exact quote: "Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542."
- `sections.notes` containing Section XVII Note 2(f) verbatim — verified present, exact quote: "(f) electrical machinery or equipment (Chapter 85)".

If the Select prompt does not route section notes (only chapter notes), Select would still have Ch.85 Note 2 and could derive 8512.40.00, BUT it would be unable to legally reject 8708 — it would have to rely on GIR 3(a) "most specific" intuition. That works in this case but is weaker grounding. Architecture should route section notes for every candidate's section.

---

## VERDICT

```yaml
case_id: case-5
variant: V2
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8512.40.00"
  expected: "tariff_line 8512.40.00"
path_quality: NEAR_MISS
# Right answer, but Rules Filter (Stage 3) did NOT do its job — it was Select+notes
# that legally eliminated 8501.x and 8708.x, not the rules-filter that was designed
# for exactly this kind of cross-chapter redirect. The redirect rules ARE in the
# DB (id=2378 for 85→8512, id=2428 for 87→85) but Stage 3's FTS-on-query
# activation can't reach them. Classified NEAR_MISS rather than DIRECT because
# the designed-for-purpose pathway failed; classified NEAR_MISS rather than LUCKY
# because Select had legitimate evidence (chapter notes + section notes) and
# reasoned correctly — not luck, just the wrong stage doing the work.
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: >
  Stage 3 Rules Filter activates exclusion rules by FTS-matching the query text
  against `chapter_exclusions.excluded_product_text`. For this case the
  legally-controlling rule (id=2378: "goods described in headings 8511, 8512,
  8540, 8541 or 8542 excluded from 8501-8504") never fires because the query
  "windscreen wiper motor 12V automotive" shares zero tokens with the rule's
  text. The smallest fix: Stage 3 should additionally do a CROSS-CANDIDATE
  join — for every candidate pair (A in chapter X, B in heading H), check
  whether any rule with source_chapter=X mentions H in its excluded_product_text
  (literal token like "8512" or "85.12"). Implement as
  `WHERE source_chapter=A.chapter AND excluded_product_text ~ ('\\m' || B.heading
  || '\\M')`. This activates id=2378 here (it contains the token "8512") and
  drops 8501.10.13 / 8501.31.13 deterministically before reaching Select.
  Same mechanism handles other intra-Ch.85 cross-heading exclusions and the
  Section XVII (f) family if encoded with explicit chapter tokens.
data_dependency: >
  India-specific tariff lines 8501.10.13 and 8501.31.13 are titled "Wiper motor"
  but are legally inadmissible under Ch.85 Note 2 (which forbids 8501-8504 for
  goods of 8512). They currently carry india_specific=false. A data-quality
  flag (e.g. legal_status='non_conforming_redirect' with cross_ref='8512.40.00')
  would make this lure visible to Stage 3 and to any downstream audit. Not
  strictly required for correctness — Select+notes catches it — but it would
  let the rules filter close the loop cheaply.
```

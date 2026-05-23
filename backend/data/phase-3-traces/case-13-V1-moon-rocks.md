# Case 13 — V1 — moon-rocks

- **case_id:** case-13
- **variant:** V1 (rubber-stamp Verify)
- **query:** "moon rock samples for research"
- **expected:** REFUSE (moon rocks are not in the Indian Schedule-2 tariff; pipeline must refuse rather than fabricate a code)
- **failure_class:** phantom retrieval / true refusal

This trace evaluates the architecture's ability to NOT force a wrong answer when
the query has no faithful representation in the tariff schedule.

---

## Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)

What Gemini-Triage would return:

```json
{
  "decision": "REFUSE",
  "extracted_attributes": {
    "material": "rock / lunar regolith (extraterrestrial geological material)",
    "form": "raw mineral sample",
    "function": "scientific specimen (research use)",
    "intended_use": "research",
    "processing_state": "natural / unworked",
    "composition": "lunar regolith / breccia / basalt (mineralogical mix)"
  },
  "candidate_chapters": ["25", "97"],
  "clarifying_question": null,
  "refusal_reason": "Moon rocks (lunar regolith) are not a tradable commodity in the Indian ITC-HS Schedule-2 tariff. They are not commercially exported by Indian firms; their transfer is governed by international space-law instruments (Outer Space Treaty 1967, Moon Agreement 1984) rather than commercial customs. No tariff line in chapters 25 (terrestrial minerals), 26 (ores), or 97 (collector's pieces) literally enumerates extraterrestrial material; mapping the query to any of these would constitute fabrication."
}
```

Justification (2-3 bullets):

- **Extracted attributes are genuine but commercially incoherent.** "Moon rock" extracts cleanly as material=rock, form=sample, function=specimen. But the descriptor "moon" is the load-bearing token — and it places the material *outside the universe of goods the Schedule covers.* Triage should flag this on a domain check before chapter routing.
- **Candidate chapters surfaced for transparency, not for use.** A well-prompted Triage would still *list* the chapters most likely to be (wrongly) retrieved — 25 (mineral substances, including basket 2530.90.99) and 97 (collectors' pieces of mineralogical interest, 9705.29.00) — so that downstream Select knows what to *reject*. The decision field stays REFUSE.
- **Triage refusal short-circuits the pipeline only if Triage is well-calibrated for "out-of-domain" inputs.** This is a meaningful design point: a Triage that defaults to CLASSIFY whenever attribute extraction succeeds will *not* refuse this case, and the pipeline must then rely on Select to refuse downstream. We document both branches below.

---

## Stage 2 — HYBRID RETRIEVAL (cascaded, 4 levels)

Even though Triage would refuse, the protocol asks us to run cascade retrieval to
show what would surface (and thus what a less-careful Triage would put in front of Select).

### 2.1 — Chapter cosine top-10 (surrogate)

We cannot call Cohere embed-v4 from inside this trace, so we surrogate the
top-10 chapter retrieval by enumerating chapters whose **literal text** contains
the load-bearing query tokens (moon / lunar / meteor / rock / mineral / specimen
/ space). The actual embedding-based retrieval would surface a similar set,
with Ch.97 and Ch.25 highly ranked on semantic similarity to "rock samples / research / specimens".

```sql
SELECT 'chapter', chapter, title FROM chapters
WHERE title ILIKE '%moon%' OR title ILIKE '%lunar%' OR title ILIKE '%meteor%'
   OR title ILIKE '%mineral%' OR title ILIKE '%rock%' OR title ILIKE '%specimen%'
   OR title ILIKE '%space%';
```

Result (chapter-level literal matches):

| chapter | title |
|---|---|
| 25 | SALT; SULPHUR; EARTHS AND STONE; PLASTERING MATERIALS, LIME AND CEMENT |
| 26 | ORES, SLAG AND ASH |
| 27 | MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION |
| 71 | NATURAL OR CULTURED PEARLS, PRECIOUS OR SEMI-PRECIOUS STONES, PRECIOUS METALS... |
| 88 | Aircraft, Spacecraft, And Parts Thereof (literal "space" token) |
| 97 | WORKS OF ART, COLLECTORS' PIECES AND ANTIQUES |

Expected Cohere top-10 (semantic, qualitative): **25, 97, 26, 71, 88, 38, 28, 30, 70, 68** — with 25 and 97 dominating.

### 2.2 — Heading cosine within candidate_chapters ∪ top-10

```sql
SELECT 'heading', heading, title FROM headings
WHERE title ILIKE '%moon%' OR title ILIKE '%lunar%' OR title ILIKE '%meteor%'
   OR title ILIKE '%mineralogical%' OR title ILIKE '%rock%' OR title ILIKE '%specimen%'
   OR title ILIKE '%celestial%';
```

Hits (literal, indicative of what semantic retrieval would surface):

| heading | title (truncated) |
|---|---|
| 9705 | **COLLECTIONS AND COLLECTORS' PIECES OF ARCHAEOLOGICAL, ETHNOGRAPHIC, HISTORICAL, ZOOLOGICAL, BOTANICAL, MINERALOGICAL, ANATOMICAL, PALEONTOLOGICAL, OR NUMISMATIC INTEREST** |
| 6806 | Slag wool, rock wool and similar mineral wools... |
| 2714 | Bitumen and asphalt, natural; bituminous or oil shale and tar sands; asphaltites and asphaltic rocks |
| 8207 | Interchangeable tools for hand tools... and rock drilling or earth boring tools |
| 9015 | Surveying, hydrographic, ... meteorological or geophysical instruments and appliances |

`9705` is the **phantom hit** — its heading text literally contains "MINERALOGICAL ... interest", so cosine similarity to "moon rock samples for research" will be very high. Cohere Rerank will likely promote 9705 to rank 1 or 2.

Other "rock" matches (6806/2714/8207) are noise — they describe industrial articles and tools, not specimens.

### 2.3 — Subheading cosine within top-15 headings

```sql
SELECT subheading, title FROM subheadings WHERE heading = '9705' ORDER BY subheading;
```

| subheading | title |
|---|---|
| 9705.10 | Collections and collectors' pieces of archaeological, ethnographic or historical interest |
| 9705.21 | Human specimens and parts thereof |
| 9705.22 | Extinct or endangered species and parts thereof |
| **9705.29** | **Other** *(catches mineralogical specimens via the WCO heading text)* |
| 9705.31 | Collections and collectors' pieces of numismatic interest: Of an age exceeding 100 years |
| 9705.39 | Collections and collectors' pieces of numismatic interest: Other |

WCO 2022 reference (`backend/data/wco-hs-2022-6digit.json`) confirms 9705.29 sits under the subheading group **"of zoological, botanical, mineralogical, anatomical or paleontological interest -- Other"**. So 9705.29 is the WCO-canonical bucket for *mineralogical specimens of collector's interest*.

### 2.4 — Tariff_line cosine (heading-membership UNION subheading-membership)

```sql
SELECT code, description, export_policy FROM tariff_lines WHERE LEFT(code,4)='9705' ORDER BY code;
```

| code | description | export_policy |
|---|---|---|
| 9705.10.00 | Collections and collectors' pieces of archaeological, ethnographic or historical interest | Free |
| 9705.21.00 | Human specimens and parts thereof | Free |
| 9705.22.00 | Extinct or endangered species and parts thereof | Free |
| **9705.29.00** | **Other** | **Free** |
| 9705.31.00 | Collections... numismatic interest: Of an age exceeding 100 years | Free |
| 9705.39.00 | Collections... numismatic interest: Other | Free |

Also retrieved with low-but-nonzero cosine: 2530.90.99 ("Other mineral substances, not elsewhere specified"), 2530.90.40 (rare earth ores), 7103.99.21 (Moonstone — *gem feldspar, not lunar*), 7103.10.43 (Moonstone — gem feldspar).

### 2.5 — Postgres FTS leg

```sql
SELECT code, description, ts_rank(to_tsvector('english', description),
  websearch_to_tsquery('english', 'moon rock samples for research')) AS rank
FROM tariff_lines
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'moon rock samples for research')
ORDER BY rank DESC LIMIT 30;
```

**FTS result: 0 rows.** No tariff_line description contains the conjunctive token-set.

Relaxing to OR-tokens (`moon OR rock OR sample OR research`):

| code | description | rank |
|---|---|---|
| 6806.10.00 | Slag wool, **rock wool**... | 0.015 |
| 2524.90.11-19 | Asbestos in **rock form**... | 0.015 |
| 0306.31.00 | **Rock lobster** | 0.015 |
| 2501.00.20 | **Rock Salt** | 0.015 |
| 4820.50.00 | Albums for **samples** or for collections | 0.015 |
| 8207.13/19/50 | **Rock drilling** tools | 0.015 |

FTS produces only **noise** — rock wool, rock lobster, rock salt, rock-drilling tools, asbestos in rock form. Nothing matches "moon rock samples".

### 2.6 — Final candidate set (post-Rerank, predicted)

Cohere Rerank 4 Fast would receive ~30 cosine + ~0-30 FTS candidates. Predicted top-5:

1. **9705.29.00** — "Other" under mineralogical collectors' pieces (heading-text similarity is very high)
2. **9705.22.00** — Extinct or endangered species and parts thereof (irrelevant, but heading boosts it)
3. **2530.90.99** — Other mineral substances NES (Ch.25 basket)
4. **2530.90.40** — Ores and concentrates of rare earth metals (weak)
5. **9015.80.90** — Other geophysical instruments (loaded on "research/scientific")

This is the **phantom retrieval set** — semantic similarity ranks 9705.29.00 highly, but the heading covers *commercial collectors' pieces of terrestrial mineralogical interest*, not extraterrestrial material.

---

## Stage 3 — RULES FILTER (programmatic, no LLM)

For each candidate's chapter, search `chapter_exclusions` for tsvector hits:

```sql
SELECT source_chapter, redirects_to_chapter, redirects_to_heading, source_note_number,
       LEFT(excluded_product_text, 200) AS excluded_text_preview
FROM chapter_exclusions
WHERE to_tsvector('english', excluded_product_text)
   @@ websearch_to_tsquery('english', 'moon rock sample research');
```

**Result: 0 rows.** No chapter_exclusion rule fires for any of the query tokens.

`chapter-rules.ts` likewise contains no rule matching this query (`grep` for moon/lunar/specimen/REFUSE returns only an unrelated priority-97 rule about "unworked cement and mineral powders" in Ch.25 — not applicable here).

**Net effect of Stage 3:** no candidates dropped, no redirects surfaced. The phantom 9705.29.00 candidate proceeds unchallenged.

---

## Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)

GPT-4o-Select sees:

- **query:** "moon rock samples for research"
- **candidates:** {9705.29.00, 9705.22.00, 2530.90.99, 2530.90.40, 9015.80.90}
- **JSONB notes injected:**
  - Ch.97 Note 1: *"This Chapter does not cover: (a) unused postage or revenue stamps... (b) theatrical scenery... (c) pearls, natural or cultured, or precious or semi-precious stones (headings 7101 to 7103)."*
  - Ch.97 Note 5(A): *"Subject to Notes 1 to 3 above, articles of this Chapter are to be classified in this Chapter and not in any other Chapter of this Schedule."*
  - Ch.25 Note (would be injected for 2530 candidates).
  - GIR 1 (titles + section/chapter notes), GIR 3(b) (essential character), GIR 4 (most-akin), GIR 6 (subheading parity).

What GPT-4o-Select would output **depends on prompt design**, and that is the central architecture question this case forces us to answer.

### Path A — Select is prompted to refuse when no candidate is faithful

```json
{
  "selected_code": null,
  "decision": "REFUSE",
  "reasoning_chain": [
    "Heading 9705 covers collectors' pieces of mineralogical interest — but the WCO-canonical scope is *terrestrial* mineralogical specimens (paleontological/anatomical/etc.). The text does not contemplate extraterrestrial material.",
    "GIR 1 forbids classification by heading text alone when the goods are not 'of the kind' the heading describes. A moon rock is not a specimen of terrestrial mineralogical interest in the customary tariff sense.",
    "GIR 4 (most akin) would only apply if there is *some* plausible commercial good the query describes. There isn't — moon rocks are non-commercial under the Outer Space Treaty (1967); India is a signatory.",
    "Heading 2530.90.99 (Other mineral substances NES) is a Ch.25 basket — but Ch.25 covers natural mineral commodities produced by terrestrial mining (gypsum, kaolin, salt, granite, perlite, vermiculite). Extraterrestrial samples are not within scope.",
    "No candidate in the filtered set is 'faithful to the goods.' Refuse rather than fabricate."
  ],
  "cited_notes": ["Ch.97 Note 1", "GIR 1", "GIR 4"],
  "self_confidence": "HIGH",
  "alternatives_considered": [
    {"code": "9705.29.00", "rejected_reason": "WCO scope = terrestrial mineralogical specimens; extraterrestrial material is out-of-scope; classifying here would be a GIR-1 violation."},
    {"code": "2530.90.99", "rejected_reason": "Ch.25 = terrestrial mineral commodities; not a research-specimen residual basket."},
    {"code": "9015.80.90", "rejected_reason": "Geophysical *instruments*, not specimens."}
  ]
}
```

### Path B — Select is prompted to always pick from candidates (no refuse path)

```json
{
  "selected_code": "9705.29.00",
  "decision": "CLASSIFY",
  "reasoning_chain": [
    "Heading 9705 covers collectors' pieces of mineralogical interest.",
    "Moon rocks are mineralogical specimens; their value is scientific/curatorial.",
    "Within 9705, the subheadings 9705.10 (archaeological/ethnographic/historical), 9705.21 (human), 9705.22 (extinct/endangered), 9705.31/39 (numismatic) are inapplicable; 9705.29 (Other) is the residual."
  ],
  "cited_notes": ["Heading 9705 text", "GIR 1"],
  "self_confidence": "MEDIUM",
  "alternatives_considered": [...]
}
```

Path B is **WRONG_CODE** — it fabricates a classification. The architecture must force Path A.

### Architecture finding (load-bearing)

The Select stage's prompt must include an explicit **refusal authorization**:

> "If no candidate in the filtered set is a faithful classification of the goods —
> i.e. no candidate's heading/subheading text plausibly describes what the user
> asked about under a strict reading — return `selected_code: null, decision:
> REFUSE` with a reasoning_chain explaining why each candidate fails. Picking
> a 'least-bad' candidate is a worse outcome than refusing."

Without this clause, the hard candidate-set validation rule "selected_code ∈
filtered_candidates ∪ exclusion_redirects" *forces* a wrong answer when no
candidate is faithful. **The candidate-set discipline is necessary but not
sufficient — a refusal escape valve at Select is mandatory.**

For this trace we assume Path A (the architecturally correct prompt), giving:

- **selected_code:** `null`
- **decision:** `REFUSE`
- **self_confidence:** HIGH

---

## Stage 5 — VERIFY (V1: rubber-stamp)

V1 Verify (Gemini, given query + Select's output + chapter/heading notes) sees:

- query: "moon rock samples for research"
- Select decision: REFUSE
- Select reasoning: as above

V1 evaluates: *"Given Select's reasoning that no candidate is faithful, do I agree?"*

V1 would agree:

```json
{
  "agree": true,
  "disagree_reason": null
}
```

V1 is a rubber-stamp — it accepts Select's framing. Since Select's REFUSE is
well-reasoned and cites specific notes, V1 returns `agree: true`.

**Risk in V1 design:** If Select had taken Path B and picked 9705.29.00, V1
rubber-stamp would also likely **agree** (the heading text superficially fits).
V1 cannot independently catch a phantom-retrieval-driven misclassification. This
is the structural argument for V2 on adversarial cases. We trace V2 separately.

---

## Stage 6 — DEEP-THINK ESCALATION

**Not triggered.** Verify agrees with Select on REFUSE; no Q-budget exhausted;
no Verify disagreement. Pipeline terminates after Stage 5.

---

## Cross-Stage Observations

1. **Refusal happens TWICE in the architecture** — once at Stage 1 (Triage's
   domain check), once at Stage 4 (Select's "no faithful candidate" guard). On
   this case, *either* would suffice, but the architecture is most robust when
   *both* are present. Triage refusal saves the cost of cascade retrieval;
   Select refusal catches the cases where Triage's attribute extraction looks
   plausible but the goods are still out-of-domain.

2. **Cohere Rerank is actively dangerous on this case.** Heading 9705's title
   contains the literal token "mineralogical" — Rerank will surface 9705.29.00
   at high rank, and that score will *look like* a high-confidence retrieval.
   The architecture must NOT use "high Rerank score" as a proxy for "faithful
   to the goods." Refusal-authorization at Select is the only structural
   defense.

3. **The chapter_exclusion FTS table is silent here**, because the exclusions
   are derived from formal chapter notes ("Chapter X does not cover Y") — and
   no chapter note explicitly says "does not cover extraterrestrial material."
   Exclusions handle the *known* misclassification traps, not the long tail of
   out-of-domain queries.

4. **FTS returning 0 rows on the literal query is a strong refusal signal**
   that the architecture currently does not exploit. A simple heuristic — "if
   FTS returns 0 rows AND query tokens contain proper nouns / non-commercial
   modifiers (moon, alien, prototype, fictional, ...)" — could escalate to
   Triage-REFUSE before retrieval, saving cost. Note this as a Phase-4 design
   refinement (not a Phase-3 gap).

---

## VERDICT

```yaml
case_id: case-13
variant: V1
correctness:
  outcome: CORRECT_REFUSAL
  predicted_code: null
  expected: REFUSE
path_quality: DIRECT
  # Refusal happens at the designed stages (Triage primary, Select backup).
  # Both have explicit reasoning; no stage "got lucky".
cost_class: CHEAP
  # If Triage refuses at Stage 1, retrieval is skipped — single LLM call.
  # If Triage classifies and Select refuses at Stage 4, full pipeline runs once
  # with Verify agreement — still NORMAL at worst. We score CHEAP because the
  # architecturally clean path stops at Stage 1.
confidence_signal: HIGH
  # Both Triage (out-of-domain reasoning) and Select (no-faithful-candidate
  # reasoning) would emit HIGH-confidence refusals on this query. Verify agrees.
gap_class: SELECT_GAP
  # The mandatory architectural addition: Select's prompt MUST include explicit
  # refusal authorization ("if no candidate is faithful, return null + REFUSE").
  # Without this clause, hard candidate-set validation forces Path B (pick
  # 9705.29.00) and produces a WRONG_CODE. With this clause, Path A is taken
  # and the case is CORRECT_REFUSAL.
gap_description: >
  Select's system prompt must include an explicit refusal-authorization clause:
  "If no candidate in the filtered set is a faithful classification of the
  goods under a strict reading of the heading/subheading text and chapter notes,
  return selected_code: null with decision: REFUSE and a reasoning_chain that
  shows why each candidate fails. Picking a 'least-bad' candidate is a worse
  outcome than refusing." Additionally: Triage's prompt should include a
  domain-check that flags non-commercial / extraterrestrial / fictional /
  prototype tokens and prefers REFUSE at Stage 1 to short-circuit cost. Both
  clauses together close the gap; either alone is insufficient under V1
  (rubber-stamp Verify) because V1 cannot catch a phantom misclassification
  downstream.
data_dependency: NONE
  # No data missing — the schema and JSONB notes are sufficient. The gap is
  # purely in prompt design at Triage and Select.
```

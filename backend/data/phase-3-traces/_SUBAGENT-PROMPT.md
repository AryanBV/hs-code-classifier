# Phase 3 Subagent Dispatch — Prompt Template

Infra. Used by orchestrator to construct each of the 30 (15 cases × 2 Verify variants) subagent prompts. Each dispatch substitutes the `{{CASE_*}}` fields. Everything else is constant — this is the architecture under test.

---

## Prompt (verbatim, with case fields substituted)

```
ROLE
====
You are tracing ONE classification case through the proposed Phase 3 architecture
for the HS code classifier rebuild. You write NO classifier code. You produce a
paper-trace of the pipeline's behaviour and a structured verdict.

CASE
====
- id:            case-{{CASE_N}}
- variant:       {{VARIANT}}                 (V1 = rubber-stamp Verify; V2 = independent-retrieval Verify)
- query:         "{{CASE_QUERY}}"
- expected:      {{CASE_EXPECTED}}            (e.g. "tariff_line 8708.30.00" / "ASK_QUESTION" / "REFUSE")
- failure_class: {{CASE_FAILURE_CLASS}}

DATA YOU CAN INSPECT (READ-ONLY)
================================
- Supabase MCP execute_sql for project waowoznsvaosgcgiivzo:
    chapters, headings, subheadings, tariff_lines (all 4 levels have populated
    1536-dim embedding columns from Cohere embed-v4 search_document, plus
    HNSW indexes on each).
    chapter_exclusions (1153 rules with tsvector FTS on excluded_product_text).
    policy_conditions.
- Filesystem:
    backend/data/extracted/chapter-NN.json (canonical extraction per chapter)
    backend/data/wco-hs-2022-6digit.json
    backend/data/wco-notes-patches/chapter-{50,53,64,81}-notes.json
- Reference code (read only, don't run):
    backend/src/data/gir-rules.ts          (GIRs 1-6 with examples and legal basis)
    backend/src/data/confusing-chapter-pairs.ts
    backend/src/rules/chapter-rules.ts     (35 hard-coded chapter rules)

TRACE PROTOCOL — DOCUMENT EACH STAGE
====================================
For every stage below, write your reasoning AND show the concrete evidence (SQL
output, JSONB note text, GIR rule cited). NO HAND-WAVING.

  Stage 1 — TRIAGE (Gemini 2.5 Flash, json_schema)
    What would Gemini-Triage return for this query? Construct the expected JSON:
      decision: CLASSIFY | ASK | REFUSE
      extracted_attributes: { material, form, function, intended_use, processing_state, composition }
      candidate_chapters: [1-3 two-digit codes]
      clarifying_question: { text, options } | null
      refusal_reason: string | null
    Justify decision/attributes/candidate_chapters with 2-3 bullets.

  Stage 2 — HYBRID RETRIEVAL (CASCADED, 4 levels)
    The retrieval cascade is:
      a. Embed query with Cohere embed-v4 input_type=search_query (you don't
         actually call Cohere; assume the embedding exists for trace purposes).
      b. CASCADE Stage 2.1 — chapter retrieval:
           SELECT chapter FROM chapters ORDER BY embedding <=> $query LIMIT 10
         Execute this against the real DB to show actual top-10 chapters.
      c. CASCADE Stage 2.2 — heading retrieval, filtered to candidate_chapters
         from Stage 1 UNION top-10 from 2.1:
           SELECT heading FROM headings
           WHERE chapter = ANY($candidate_chapters)
           ORDER BY embedding <=> $query LIMIT 15
      d. CASCADE Stage 2.3 — subheading retrieval, filtered to top-15 headings:
           SELECT subheading FROM subheadings
           WHERE heading = ANY($top_headings)
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $query LIMIT 20
      e. CASCADE Stage 2.4 — tariff_line retrieval, UNION of:
           - top-20 from filter-by-subheading-membership
           - top-20 from filter-by-heading-membership (broader fallback so empty-title
             subheadings don't blackhole their tariff_lines; 454 such cases exist)
      f. Postgres FTS leg (parallel, non-cascading):
           SELECT code FROM tariff_lines
           WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', $query)
           LIMIT 30
      g. Final retrieval candidate set = top-30 cosine UNION top-30 FTS
         → fed to Cohere Rerank 4 Fast → top-5 final candidates.

    Document: chapters returned, headings returned, subheadings returned,
    tariff_lines returned at each cascade stage. Show real SQL output.

  Stage 3 — RULES FILTER (programmatic, no LLM)
    For each candidate's chapter:
      SELECT * FROM chapter_exclusions
      WHERE source_chapter = $candidate_chapter
        AND to_tsvector('english', excluded_product_text)
            @@ websearch_to_tsquery('english', $query_text)
    Show which candidates get DROPPED and which redirect_to_chapter values surface.
    Cite the actual exclusion rule TEXT.

  Stage 4 — SELECT (GPT-4o, json_schema, hard candidate-set validation)
    Given the filtered candidate set + chapter/heading/subheading JSONB notes,
    what would GPT-4o pick? Show:
      selected_code (must be ∈ filtered_candidates ∪ exclusion_redirects)
      reasoning_chain (2-4 bullets citing the specific notes)
      cited_notes (which chapter/section/GIR you'd inject)
      self_confidence: HIGH | MEDIUM | LOW
      alternatives_considered (other candidates evaluated and rejected)

  Stage 5 — VERIFY ({{VARIANT}})
    V1 (rubber-stamp): given query + selected_code + heading/chapter notes,
      would adversarial Gemini-Verify agree? Output { agree, disagree_reason }.
    V2 (independent retrieval): rerun Stages 2-4 mentally with Gemini-Select
      and compare to GPT-Select's output. Show what V2 would independently pick.
      Output { independent_pick, agrees_with_select, difference_reason }.

  Stage 6 — DEEP-THINK ESCALATION (only if triggered)
    If Verify disagrees AND Q-budget exhausted: GPT-4o reasoning_effort=high
    sees the full case history. What does it resolve to? AUTOCLASSIFY or REFUSAL?
    If not triggered: state so and skip.

VERDICT (multi-axis YAML at end of trace file)
==============================================
case_id: case-{{CASE_N}}
variant: {{VARIANT}}
correctness:
  outcome: CORRECT_CODE | WRONG_CODE | CORRECT_REFUSAL | WRONG_REFUSAL | CORRECT_ASK | WRONG_ASK
  predicted_code: <string or null>
  expected: {{CASE_EXPECTED}}
path_quality: DIRECT | LUCKY | NEAR_MISS | FAR_MISS
  # DIRECT     = right answer via designed pathway, evidence at every stage
  # LUCKY      = right answer despite a stage failing (Triage hallucinated chapter,
  #              retrieval missed, etc.)
  # NEAR_MISS  = right heading wrong subheading or tariff_line
  # FAR_MISS   = wrong heading or wrong chapter
cost_class: CHEAP | NORMAL | EXPENSIVE
  # CHEAP      = Triage + Select only (no Verify disagreement, no escalation)
  # NORMAL     = full pipeline once including Verify agreement
  # EXPENSIVE  = Verify disagreement OR Deep-think escalation OR multi-Q
confidence_signal: HIGH | MEDIUM | LOW
  # Does the architecture KNOW it's right? HIGH=Select+Verify both confident.
gap_class: NONE | TRIAGE_GAP | RETRIEVAL_GAP | RULES_GAP | SELECT_GAP | VERIFY_GAP | DEEPTHINK_GAP
gap_description: <one-paragraph description of the smallest fix that closes the
                  gap, OR null if gap_class=NONE>
data_dependency: NONE | <string describing missing data, e.g. "empty subheading title">

OUTPUT
======
1. Write the full trace as a markdown file at:
   backend/data/phase-3-traces/case-{{CASE_N}}-{{VARIANT}}-{{CASE_SLUG}}.md
   - One H2 heading per stage.
   - Include the real SQL queries you ran with their actual results.
   - Append the YAML verdict block at the bottom inside a ```yaml ... ``` fence.

2. Return to the coordinator (in your final message text):
   - case_id
   - variant
   - one-line verdict summary (e.g. "CORRECT_CODE 8708.30.00 / DIRECT / NORMAL / HIGH / NONE")
   - the absolute path to your trace file
   - a brief note on any anomaly you observed that the coordinator should know about

CALIBRATION EXAMPLE — fully traced reference case (NOT one of the 15)
=====================================================================
Query: "knitted cotton t-shirt" (Bucket A reference; expected heading 6109)

  Stage 1 (TRIAGE): Gemini-Triage receives "knitted cotton t-shirt". Extracts
    {material:"cotton", form:"t-shirt", function:"apparel", processing_state:"knitted"}.
    Completeness ≈ 0.85 (specific material + form + construction).
    decision=CLASSIFY, candidate_chapters=["61"], no clarifying question.

  Stage 2 (CASCADE RETRIEVAL):
    2.1 chapter cosine top-10: ["61", "62", "63", "11", ...] → chapter 61 rank 1.
    2.2 heading cosine within chapter 61: top hits 6109, 6105, 6110, 6114.
    2.3 subheading cosine within those headings: top 6109.10 (Of cotton).
    2.4 tariff_line cosine within 6109.10: 6109.10.00 (T-shirts of cotton).
    FTS independently hits 6109.10.00 on "knitted cotton t-shirt".
    Union → Rerank surfaces 6109.10.00 at rank 1.

  Stage 3 (RULES FILTER): chapter_exclusions for chapter 61 → no rule matches
    the query tsquery. Candidate set unchanged.

  Stage 4 (SELECT): GPT-4o sees 6109.10.00 + chapter notes (Note 1: Ch.61
    covers only knitted/crocheted articles — confirms processing_state).
    selected_code=6109.10.00, self_confidence=HIGH,
    reasoning_chain=["Ch.61 limited to knitted articles per Note 1",
                     "T-shirts explicit in 6109", "Cotton sub-classification gives 6109.10"].

  Stage 5 V1 (rubber-stamp): Gemini sees query + 6109.10.00 + notes. Agrees.
  Stage 5 V2 (independent retrieval): Gemini-Select run independently arrives
    at same 6109.10.00. Agrees.

  Stage 6 (DEEP-THINK): not triggered.

VERDICT:
  case_id: case-0  # CALIBRATION
  variant: V1
  correctness: { outcome: CORRECT_CODE, predicted_code: 6109.10.00, expected: heading 6109 }
  path_quality: DIRECT
  cost_class: CHEAP
  confidence_signal: HIGH
  gap_class: NONE
  gap_description: null
  data_dependency: NONE
=====================================================================

The calibration example anchors what "good rigor" looks like — every stage
names the data it touched and the reasoning step. Traces that do not match
this level of evidence will be rejected by the orchestrator on read.
```

---

## Substitution table for all 30 dispatches

| dispatch | case_n | variant | case_query | case_expected | case_failure_class | case_slug |
|---|---|---|---|---|---|---|
| 1 | 1 | V1 | rubber suspension bushings for trucks | tariff_line under heading 8708 | function-over-material trap | rubber-bushings |
| 2 | 1 | V2 | rubber suspension bushings for trucks | tariff_line under heading 8708 | function-over-material trap | rubber-bushings |
| 3 | 2 | V1 | freeze-dried instant coffee powder in jars | tariff_line under heading 2101 | processing-state boundary | freeze-dried-coffee |
| 4 | 2 | V2 | freeze-dried instant coffee powder in jars | tariff_line under heading 2101 | processing-state boundary | freeze-dried-coffee |
| 5 | 3 | V1 | fibre cement boards for construction | tariff_line under heading 6811 | raw-vs-article boundary | fibre-cement |
| 6 | 3 | V2 | fibre cement boards for construction | tariff_line under heading 6811 | raw-vs-article boundary | fibre-cement |
| 7 | 4 | V1 | mens knitted cotton ensemble | tariff_line under heading 6103 | knit-vs-woven diagnosed | knit-ensemble |
| 8 | 4 | V2 | mens knitted cotton ensemble | tariff_line under heading 6103 | knit-vs-woven diagnosed | knit-ensemble |
| 9 | 5 | V1 | windscreen wiper motor 12V automotive | tariff_line 8512.40.00 (not 8708) | vehicle-electrical-vs-parts diagnosed | wiper-motor |
| 10 | 5 | V2 | windscreen wiper motor 12V automotive | tariff_line 8512.40.00 (not 8708) | vehicle-electrical-vs-parts diagnosed | wiper-motor |
| 11 | 6 | V1 | brake pads | ASK_QUESTION | refusal/clarification trigger | brake-pads-ambiguous |
| 12 | 6 | V2 | brake pads | ASK_QUESTION | refusal/clarification trigger | brake-pads-ambiguous |
| 13 | 7 | V1 | vintage motorcycle 1939 collectible | tariff_line under subheading 8711.00 | india_specific retention | vintage-motorcycle |
| 14 | 7 | V2 | vintage motorcycle 1939 collectible | tariff_line under subheading 8711.00 | india_specific retention | vintage-motorcycle |
| 15 | 8 | V1 | synthetic leather imitation polyurethane sheet | tariff_line in chapter 39 (not 42) | chapter_exclusion redirect | synthetic-leather |
| 16 | 8 | V2 | synthetic leather imitation polyurethane sheet | tariff_line in chapter 39 (not 42) | chapter_exclusion redirect | synthetic-leather |
| 17 | 9 | V1 | leather shoes with rubber outer sole, leather upper, lace-up | tariff_line under 6403.99 | GIR 3(b) composite + WCO patch | leather-shoes |
| 18 | 9 | V2 | leather shoes with rubber outer sole, leather upper, lace-up | tariff_line under 6403.99 | GIR 3(b) composite + WCO patch | leather-shoes |
| 19 | 10 | V1 | stainless steel watch bracelet replacement strap | tariff_line under 9113.20 (not 7113) | parts-vs-accessories Ch.91/71 | watch-bracelet |
| 20 | 10 | V2 | stainless steel watch bracelet replacement strap | tariff_line under 9113.20 (not 7113) | parts-vs-accessories Ch.91/71 | watch-bracelet |
| 21 | 11 | V1 | crude petroleum oil | tariff_line 2709.00.00 + Restricted/IOCL STE | STE/Restricted policy surfacing | crude-petroleum |
| 22 | 11 | V2 | crude petroleum oil | tariff_line 2709.00.00 + Restricted/IOCL STE | STE/Restricted policy surfacing | crude-petroleum |
| 23 | 12 | V1 | jasmine essential oil | tariff_line under 3301.22 | WCO 2022 boundary + india_specific | jasmine-oil |
| 24 | 12 | V2 | jasmine essential oil | tariff_line under 3301.22 | WCO 2022 boundary + india_specific | jasmine-oil |
| 25 | 13 | V1 | moon rock samples for research | REFUSE | phantom retrieval / true refusal | moon-rocks |
| 26 | 13 | V2 | moon rock samples for research | REFUSE | phantom retrieval / true refusal | moon-rocks |
| 27 | 14 | V1 | filter -> Q1 "engine" -> Q2 "diesel truck" -> CLASSIFY | tariff_line under heading 8421 | multi-Q-budget cycle | diesel-filter |
| 28 | 14 | V2 | filter -> Q1 "engine" -> Q2 "diesel truck" -> CLASSIFY | tariff_line under heading 8421 | multi-Q-budget cycle | diesel-filter |
| 29 | 15 | V1 | stnls stl hex bolt M10 grade 8.8 zinc plated | tariff_line under 7318.15 | adversarial typo/abbreviation | hex-bolt |
| 30 | 15 | V2 | stnls stl hex bolt M10 grade 8.8 zinc plated | tariff_line under 7318.15 | adversarial typo/abbreviation | hex-bolt |

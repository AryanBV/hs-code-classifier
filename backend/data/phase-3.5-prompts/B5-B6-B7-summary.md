_Summary written pre-D1 lock; prompts have since been updated to all-Gemini stack._

# B5/B6/B7 — Phase 4 Runtime Prompts Summary

**Date:** 2026-05-25
**Branch:** `feat/phase-3-arch-spike`
**Workstream:** Phase 3.5 — T10
**Status:** v1 seed prompts drafted; spec + quality review pending.

---

## Artifacts produced

| ID | Path | Purpose | Lines |
|---|---|---|---|
| B5 | `backend/prompts/triage-v1.md` | Triage prompt (Gemini 2.5 Flash) — Stage 1 of pipeline | ~480 |
| B6 | `backend/prompts/select-v1.md` | Select prompt (GPT-4.1 mini) — Stage 4 of pipeline | ~430 |
| B7 | `backend/prompts/verify-router-v1.ts` | Verify routing decision tree + V1/V2 prompt templates (commented) | ~250 |

---

## Architectural carry-forwards reflected

Every locked Phase 3.5 decision is embedded explicitly in at least one prompt. Cross-reference:

### 1. Select output schema MUST include `export_policy` + `policy_condition` as REQUIRED fields
- **B6 select-v1.md** — `responseJSONschema.required` lists `export_policy` and `policy_condition`. The "Hard rules" section makes both fields explicitly mandatory with a "copy verbatim from candidate's tariff_lines row" instruction. Worked test 1 (crude petroleum 2709.00.10) validates the field surface.

### 2. Select MUST accept 6-digit subheading return when no 8-digit child exists (jasmine arch fix)
- **B6 select-v1.md** — `selected_code` schema pattern is `^\d{4}\.\d{2}(\.\d{2})?$` (8-digit OR 6-digit). `selected_code_is_six_digit` boolean flag is REQUIRED. Worked test 2 (jasmine 3301.22) demonstrates the path explicitly. The Step 1-6 decision framework cites the 6-digit fallback as a legitimate outcome, not a refusal.

### 3. Stage 3 tsquery MUST be constructed from Triage-extracted head nouns (OR-joined)
- **B5 triage-v1.md** — adds `head_nouns_for_fts: string[]` to `extracted_attributes` schema (1-5 tokens, required). Dedicated "head_nouns_for_fts — critical for Stage 3 retrieval" section explains the AND-semantics blackhole and gives 5 worked extraction examples. Lemmatized, singular, strip packaging/voltage/size tokens. The Phase 4 retrieval implementation will read this array and OR-join into `to_tsquery`.

### 4. Out-of-scope guardrail in Triage with anti-examples
- **B5 triage-v1.md** — Rule 1 (REFUSE) is the first decision rule, listing 7 out-of-scope classes with example queries that should trigger each: `extraterrestrial`, `fictional`, `services_not_goods`, `contraband`, `weapons_restricted_class`, `function_only_no_substance`, `incoherent_query`. `out_of_scope_class` is a REQUIRED enum field in the response. Worked test 2 (moon rocks) validates the REFUSE path with `out_of_scope_class: "extraterrestrial"`.

### 5. Competing-chapter-interpretation detector in Triage
- **B5 triage-v1.md** — Rule 2(B) is the competing-interpretation detector with 3 worked examples (rubber bushing Ch.40↔87, leather strap Ch.42↔91↔64, white powder Ch.17↔25↔28↔11) and 3 anti-examples where a disambiguator IS present and ASK MUST NOT fire (freeze-dried coffee, knitted t-shirt, hex bolt). Worked test 1 (rubber bushing) validates the ASK path with a structured `clarifying_question`.

### Additional Phase 3 spike P0 items also reflected:

- **Mandatory notes injection (B6 P0 from spike):** Select prompt's input-context section lists `{chapter_notes_by_chapter}` covering `notes`, `chapter_subheading_notes`, `supplementary_notes`, `export_licensing_notes`, `section_notes`, plus `{matched_exclusion_rules.source_note_text}` and `{subheading.india_specific_note}`. The "Notes for Phase 4 implementers" section makes injection non-skippable.
- **Refusal authorization clause (B6 P0):** Select prompt has the verbatim authorization clause in the "Hard rules" block: "Picking the least-bad candidate is WORSE than refusing — wrong codes cause real legal and financial penalties for Indian SME exporters."
- **Current-year fact (B6 P2):** `{current_year}` is a required injection with explicit usage for Ch.97 antiques, Ch.87 vintage motorcycles (pre-1940), and Ch.87 vintage motor cars (pre-1950).
- **previousAnswers schema (B5 P2):** explicitly defined as `Record<questionId, answerId>` with a worked "replay" example. Q-budget exhaustion (>=2 prior rounds) triggers REFUSE with `out_of_scope_class: "function_only_no_substance"`.
- **Verify routing layer (B7 P1):** the entire routeVerify() function implements the Phase 3 spike's recommended conditional table verbatim. Smoke-test traces (cases 6, 11, 1, 12) included as commented validation.

---

## Test queries per prompt

3 worked test queries per file, each with a fully-resolved expected output for eyeball-eval:

**B5 (Triage):**
1. "rubber suspension bushings for trucks" → ASK with competing-interpretation flag (Ch.40 vs Ch.87)
2. "moon rock samples for university research" → REFUSE with `out_of_scope_class: "extraterrestrial"`
3. "ladies cotton knitted t-shirt, made up, for retail sale" → CLASSIFY with `candidate_chapters: ["61"]` and `head_nouns_for_fts: ["t-shirt", "cotton", "knitted", "apparel"]`

**B6 (Select):**
1. Crude petroleum → 2709.00.10 with `export_policy: "Restricted"`, `policy_condition: "...STE by IOCL..."` (validates required policy field surfacing)
2. Jasmine essential oil → 3301.22 with `selected_code_is_six_digit: true` (validates 6-digit fallback)
3. Stainless steel hex bolt M10 → 7318.15.00 with HIGH self_confidence (validates clean-classify rubber-stamp path)

**B7 (Verify router):**
4 routing smoke tests embedded as commented blocks mapping back to Phase 3 spike cases 6, 11, 1, 12 — covering SKIP/V1/V2/ESCALATE branches.

---

## JSON schema discipline

All three artifacts use strict JSON schemas:
- B5/B6 use OpenAI/Gemini `response_format: { type: "json_schema", strict: true }` (NOT `json_object`) per the project's "Critical Gotcha #3."
- Conditional branches enforced via `allOf` + `if`/`then`/`else` — e.g., B5's CLASSIFY/ASK/REFUSE payloads cannot be partially populated, and B6's refusal branch nulls out `export_policy`/`policy_condition` automatically.
- Field-level patterns: `candidate_chapters` regex `^\d{2}$`; `selected_code` regex `^\d{4}\.\d{2}(\.\d{2})?$`; `option.id` snake_case regex.
- Bounded arrays: `reasoning_chain` 2-5 bullets; `head_nouns_for_fts` 1-5 tokens; `candidate_chapters` 0-3 entries (0 only when REFUSE); `clarifying_question.options` 2-4 entries.

---

## Notes for the next reviewer (coordinator)

### Judgment calls made

1. **Out-of-scope class taxonomy was 6 in the original brief; I added a 7th (`incoherent_query`) for gibberish/empty queries.** The brief said "6+ classes," so this is within the brief's stated minimum. Empty/gibberish queries are common in production and need a distinct refusal class so the runtime can short-circuit before any further processing.

2. **Verify router treats "no alternatives_considered" as MEDIUM-confidence fallback → V1.** The brief's pseudocode didn't explicitly handle this edge case; I added Rule 6 as `V1_RUBBER_STAMP`. Rationale: MEDIUM confidence with no articulated runner-up means Select hesitated but couldn't name a competitor — V1 cheap check is the safe minimum and matches the spike's "default" recommendation.

3. **B6 Select prompt instructs LLM to surface a notice when `export_policy/policy_condition` are null on a 6-digit selection.** The Phase 3 brief doesn't specify policy-data handling at 6-digit level (since policy data is recorded at 8-digit only in Indian Schedule-2). Adding a runtime-implementer note rather than failing classification — the user still needs the 6-digit answer.

4. **Notes injection budget warning included as Phase 4 implementer note.** Ch.87 alone has ~3K tokens of notes; injecting all notes for all candidate chapters could exceed 30-50K tokens for multi-chapter candidate sets. The note recommends truncating notes for chapters NOT in the candidate set, full notes for chapters IN the set. Phase 4 runtime will need to implement this budget logic.

### Open questions / not-yet-decided

1. **V1 model choice — Gemini 2.5 Flash vs GPT-4.1 mini.** Brief says Gemini for V1, GPT-4.1 mini for V2. I followed this. Phase 4 may want to re-eval whether V1 actually needs Gemini (vs a cheaper GPT-4.1 nano), but that's a B2 cost-model question, not a prompt-design question.

2. **`has_disambiguator_note` signal source.** The Verify router input has this boolean field, but the runtime needs to compute it. Two possible sources: (a) Stage 3 rules-filter sets a flag when a `chapter_exclusions` rule fired, OR (b) Select's `cited_notes` field has a non-null entry. I documented this in the router but left the actual computation to Phase 4 runtime wiring.

3. **`q_budget_remaining` in the Verify router input.** Currently unused in routing logic — it's a defensive parameter for future "do not recurse into ASK at q=0" guards if Verify ever gains an ASK escalation path. Left in place but unused.

4. **Antagonistic V2 temperature.** Brief said "higher temperature for adversarial reasoning." I documented 0.5-0.7 as a starting band. Phase 4 will need to A/B test — too high produces noise; too low collapses to V1.

### What Phase 4 will need to add (not in scope for these v1 seeds)

- Actual Gemini/OpenAI API call wrappers reading these prompt templates as files.
- Runtime validation that `selected_code ∈ candidates[].code` (hallucination rejection).
- `policy_conditions` table dereferencing for pointer-style policy text ("Subject to Policy Condition N of the Chapter").
- Budget logic for chapter-notes injection.
- A/B harness comparing V1 vs V2 routing decisions on eval set.
- Multi-turn `previousAnswers` integration with frontend Q/A wizard.

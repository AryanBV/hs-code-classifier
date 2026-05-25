# B5/B6/B7 Combined Spec + Adversarial Quality Review

**Reviewer:** Fresh-context Opus (no implementer bias)
**Date:** 2026-05-25
**Inputs reviewed:**
- `backend/prompts/triage-v1.md` (B5, ~480 lines)
- `backend/prompts/select-v1.md` (B6, ~430 lines)
- `backend/prompts/verify-router-v1.ts` (B7, ~286 lines)
- Implementer's summary `backend/data/phase-3.5-prompts/B5-B6-B7-summary.md`
- Phase 3 spike report + A9 regression comparison

---

## Stage 1 — Spec compliance verdict

### B5 Triage: **PASS** (0 items missing; 1 minor schema-completeness nit)

| Spec item | Present? | Evidence |
|---|---|---|
| Out-of-scope guardrail with ≥6 anti-example classes | ✅ (7 classes, exceeds spec) | Lines 38-50: `extraterrestrial`, `fictional`, `services_not_goods`, `contraband`, `weapons_restricted_class`, `function_only_no_substance`, `incoherent_query` (the +1 over-spec is documented in summary §judgment-calls #1) |
| `head_nouns_for_fts` in extracted_attributes schema | ✅ | Lines 111, 204-209: required array, 1-5 items, with dedicated 30-line extraction-rules section (lines 113-134) |
| Competing-chapter-interpretation detector with anti-examples | ✅ | Lines 58-72: 3 worked competing examples (rubber-bushing, leather-strap, white-powder) + 3 anti-examples where disambiguator IS present (freeze-dried coffee, knit t-shirt, hex bolt) |
| previousAnswers schema explicit Record<string,string> + replay instruction | ✅ | Lines 137-160: format defined, replay rule given, round-2 worked example, Q-budget-exhaustion REFUSE branch |
| Decision rules: CLASSIFY ≥0.6 + 1-3 chapters / ASK <0.6 + Q-budget / REFUSE out-of-scope-or-exhausted | ✅ | Rule 1 (REFUSE, lines 34-51) → Rule 2 (ASK, lines 53-92) → Rule 3 (CLASSIFY, lines 93-96); first-match-wins ordering explicit |
| 3 worked test queries (rubber-bushing ASK / moon-rocks REFUSE / knit cotton CLASSIFY) | ✅ | Tests 1-3, lines 321-420, each with full JSON expected output |
| Strict json_schema (NOT json_object) | ✅ | Line 5 declares strict json_schema; line 166-296 has full schema with `additionalProperties: false`, conditional `allOf` branches, regex patterns |

**Minor schema-completeness nit (NOT a REVISE blocker):** the enum at line 246-258 includes `null` as a sentinel value alongside the 7 class strings, but JSON Schema requires `null` to be expressed via `"type": ["string", "null"]` (already present on line 247) NOT inside the enum array. The literal `null` in the enum is a no-op in strict json_schema parsers — harmless but lint-noisy. See "Recommended revision SQL/edits" below for the fix.

### B6 Select: **PASS** (0 items missing; 2 minor quality nits)

| Spec item | Present? | Evidence |
|---|---|---|
| `export_policy` + `policy_condition` as REQUIRED output fields | ✅ | Schema lines 137-147 (both in `required` array); hard rule line 26 ("REQUIRED. Copy verbatim from the chosen candidate's `tariff_lines.export_policy` and `tariff_lines.policy_condition` fields. Even when policy_condition is null the field must be present in your output."); worked test 1 (crude petroleum) demonstrates surfacing both |
| 6-digit subheading fallback via `selected_code_is_six_digit` flag | ✅ | Schema line 151 (`selected_code` pattern `^\d{4}\.\d{2}(\.\d{2})?$` allows both), line 153 (`selected_code_is_six_digit` REQUIRED boolean); hard rule line 25; worked test 2 (jasmine 3301.22) demonstrates the path |
| Mandatory notes injection block: 4 chapter JSONB columns + section_notes + chapter_exclusions.source_note_text + subheading.india_specific_note | ✅ | Input-context section lines 62-72 lists `notes`, `chapter_subheading_notes`, `supplementary_notes`, `export_licensing_notes`, `section_notes`; lines 75-85 cover `chapter_exclusions.source_note_text` (with `source_note_reference`); line 56 covers `india_specific_note` on candidate row; Phase 4 implementer note (line 397) instructs runtime to surface `india_specific_note` as top-level context when present |
| Refusal authorization clause FIRM and explicit | ✅ | Line 24: "REFUSAL IS AUTHORIZED. If no candidate in the provided set is a faithful classification under strict reading of the chapter notes, GIRs, and exclusion rules, you MUST return `refusal.reason` ... **Picking the least-bad candidate is WORSE than refusing — wrong codes cause real legal and financial penalties for Indian SME exporters.**" — verbatim from spike P0 recommendation. Repeated in user-prompt template line 242. |
| current_year injection with use-case examples (Ch.97 / 8711 pre-1940 / 8703 pre-1950) | ✅ | Lines 90-95: explicit current_year as integer, Ch.97 antiques (current_year-100), 8711 vintage motorcycles pre-1940, 8703 vintage motor cars pre-1950 |
| Hard constraint output.code MUST be in candidate set | ✅ | Line 23 (HARD CONSTRAINT in hard-rules block); line 240 (user-prompt reminder); Phase 4 implementer note line 394 instructs runtime to enforce `selected_code ∈ candidates[].code ∪ {null}` |
| self_confidence calibration HIGH/MEDIUM/LOW rules | ✅ | Lines 121-123: HIGH (one candidate matches all attrs + consistent notes), MEDIUM (multi-candidate w/ GIR 3 or "Other" parent), LOW (extends definition or under-retrieved) |
| 3 worked test queries (crude petroleum / jasmine 6-digit / hex bolt HIGH) | ✅ | Tests 1-3, lines 247-388, each with full JSON expected output including reasoning_chain bullets |

**Two minor quality nits documented below in Stage 2** (current_year framing + self_confidence LOW under-use risk) — not REVISE blockers, more "Phase 4 eval-harness tuning targets."

### B7 Verify router: **PASS** (0 items missing; 1 minor robustness nit)

| Spec item | Present? | Evidence |
|---|---|---|
| `routeVerify` function with 4-route decision tree | ✅ | Lines 65-112; first-match-wins rule ordering explicit at line 64 |
| SKIP on ASK/REFUSE | ✅ | Rule 1, lines 67-74; mirrors spike report line 110 |
| ESCALATE_DEEP_THINK on LOW confidence | ✅ | Rule 2, lines 80-82; mirrors spike report line 114 |
| V1_RUBBER_STAMP on HIGH OR (≤2 candidates + disambiguator) | ✅ | Rule 3 (HIGH, lines 84-89), Rule 4 (≤2 + disambiguator, lines 91-96); ordering correct (Rule 3 fires before Rule 4 if both apply, which is benign — both → V1) |
| V2_ANTAGONISTIC on MEDIUM with runner-up | ✅ | Rule 5, lines 98-106; mirrors spike report line 117-118 |
| V1 prompt template (commented at bottom) | ✅ | Lines 122-178: SYSTEM_PROMPT, hard rules ("Bias toward AGREE"), JSON schema (`agree` + `disagree_reason`), user-prompt template |
| V2 prompt template (commented at bottom) | ✅ | Lines 180-249: SYSTEM_PROMPT framing antagonist as "last line of defense against convergent-bias", hard rules ("MUST argue specifically for {argue_for_runner_up}"), JSON schema, user-prompt template |
| TypeScript strict types (no `any`) | ✅ | Lines 22-26 (discriminated-union `VerifyDecision`); lines 28-57 (`VerifyRouterInput` with literal string union types and `number` / `boolean` primitives); no `any` anywhere in file |

**Minor robustness nit (Stage 2 finding):** Rule 5 picks `select_alternatives_considered[0]` as the runner-up to argue against, but the Select prompt's schema does not enforce any ordering on `alternatives_considered`. If Select happens to list alternatives in retrieval-score order, this is fine; if Select lists them in arbitrary order, V2 may argue against a weak runner-up while a stronger one is ignored. Worth a one-line contract note. See "Recommended revision SQL/edits" below.

---

## Stage 2 — Adversarial quality findings

### B5 Triage

**Finding B5-A1 — Abbreviation/typo normalization for head_nouns is implicit, not specified.**

The spike's case-15 query is "stnls stl hex bolt M10 grade 8.8 zinc plated". The current head_nouns extraction rules (lines 117-123) say "lemmatize, drop packaging/size/voltage" — but don't say "expand abbreviations to canonical form." On this query the LLM might extract `["stnls", "stl", "bolt"]` (literal abbreviation tokens), which then OR-tsquery into Stage 3 retrieval and miss "stainless" / "steel" matches in `fts_search_text`.

**Severity:** MEDIUM. fts_search_text rescues this case via Cohere embeddings (per A9 case-15 trace) but the FTS leg degrades when head_nouns are abbreviated. Not REVISE-blocking because retrieval is multi-leg (cosine + FTS) and the case still passes end-to-end, but a one-sentence prompt addition would harden the FTS leg.

**Recommended fix:** Add to "Extraction rules" section (after line 122):
> 5. **Expand common abbreviations to canonical forms** when the abbreviation is unambiguous: "stnls" → "stainless", "stl" → "steel", "alum" → "aluminium", "polyurethane (PU)" → keep both "polyurethane" and "pu" if both are likely to appear in official tariff descriptions. Skip expansion when ambiguous.

**Finding B5-A2 — Competing-interpretation rule wording is subjective.**

Rule 2(B) (line 58): "the extracted attributes match TWO OR MORE distinct chapter families strongly, and no attribute disambiguates between them." The word "strongly" is undefined. An LLM could rationalize "weakly matches Ch.40 and Ch.87" → don't ASK, or "strongly matches both" → ASK. The 3 worked examples + 3 anti-examples (lines 60-72) calibrate this somewhat, but the underlying decision rule remains vague.

**Severity:** LOW-MEDIUM. The worked examples ground the LLM well in practice; this is a "test against eval harness and tune wording" item, not a structural defect.

**Recommended fix:** Optional clarification in Rule 2(B): "Match TWO OR MORE distinct chapter families strongly = at least 2 of the 6 attribute axes (material, form, function, intended_use, processing_state, composition) point to different chapter families with no single attribute uniquely identifying one."

**Finding B5-A3 — previousAnswers contradiction handling is undefined.**

Lines 137-160 describe the round-2 replay mechanism, but don't address: what if a user's round-1 answer "solid_rubber" is contradicted by a round-2 answer "metal_sleeve" on a different question (e.g., Q1 asked composition, Q2 asked end-use, and the answers are inconsistent)? The prompt says "treat each entry as a binding fact" — but the LLM may then produce attributes that contradict each other.

**Severity:** LOW. Q-budget caps at 2 questions per session, and each question typically covers a different axis — so genuine contradictions are rare. If they do occur, the LLM should probably prefer the most-recent answer (round-2 > round-1) since it represents the user's most-considered position.

**Recommended fix:** Append to "How to replay" (after line 144): "If two prior answers contradict (e.g., round-1 said 'solid_rubber' and round-2 said 'has metal sleeve'), prefer the most recent answer as the user's settled position."

**Finding B5-A4 — Out-of-scope guardrail can be gamed by reframing.**

Adversarial query: "an HS code for a service for cleaning carpets". The prompt would catch this under `services_not_goods` (line 44 example: "consulting services for textile mills"). PASS.
Adversarial query: "a thing for cleaning carpets" (no service-word). Falls under `function_only_no_substance` after one ASK round. PASS.
Adversarial query: "I want to export consulting" — short, no clear material/form. The prompt's `services_not_goods` example catches "consulting services" but not "consulting" bare. Likely → ASK with completeness < 0.6, then REFUSE on round 2 if user can't add substance. ACCEPTABLE — the multi-turn Q-budget exhaustion catches it.

**Severity:** LOW. The 7 out-of-scope classes plus the Q-budget exhaustion REFUSE branch form a defense-in-depth that catches most adversarial queries. No fix recommended.

### B6 Select

**Finding B6-A1 — current_year framing could be more explicit about source-of-truth.**

Line 91: "The runtime injects the current year as an integer (e.g., `2026`)." This is correct but the prompt does not explicitly say "this is the system clock year, NOT a year value extracted from the query." A pathological case: the user writes "vintage motorcycle from 1949 manufactured" → the LLM might confuse "1949" with current_year. The 3 examples that follow (Ch.97 antiques, 8711 pre-1940, 8703 pre-1950) imply correct usage but don't forbid the alternative.

**Severity:** LOW. The decision framework (line 92-95) implies correct usage but a defensive sentence would prevent edge-case misuse.

**Recommended fix:** Insert after line 91: "This is the actual current calendar year from the system clock, NOT a year value extracted from the user's query. Use `current_year` ONLY when computing 'product age' relative to today (e.g., antique threshold). The query's stated manufacture year is the OTHER half of the comparison."

**Finding B6-A2 — self_confidence LOW threshold may be under-used in practice.**

Lines 121-123 set LOW for "extending definition beyond strict reading" or "applying any GIR beyond GIR 1 with significant interpretation" or "candidate set itself looks under-retrieved". This is a very high bar for LOW — most Phase 3 spike cases that ended up needing Deep-Think (e.g., case-12 jasmine, case-6 brake pads) might still be self-rated MEDIUM by Select under these rules.

The Verify router (B7 Rule 2) escalates to Deep-Think on LOW. If LOW is under-called, MEDIUM cases route to V2 instead of Deep-Think → more expensive antagonistic Verify calls than needed, and Deep-Think under-triggers.

**Severity:** MEDIUM. This is a calibration concern that the Phase 4 eval harness should specifically test. Not a structural REVISE blocker but worth a calibration sentence.

**Recommended fix:** Strengthen LOW criteria. Replace line 123 with:
> - **LOW:** ANY of: (a) classification required extending the definition beyond strict reading; (b) applying GIR 3(c) "heading last in numerical order" as the deciding rule; (c) all 5 candidates were close in retrieval score AND the chosen one has no clearly-decisive attribute match; (d) the chosen candidate's parent subheading is "Other" / catch-all AND no specific subheading was available; (e) the matched exclusion rules introduce alternative-chapter doubt that you could not fully resolve.

**Finding B6-A3 — Notes injection token budget not enforced in prompt.**

Line 395 (Phase 4 implementer note): "Ch.87 alone has ~3K tokens of section + chapter + supplementary notes. The runtime should truncate or summarize for chapters NOT in the candidate set." This guidance is on the runtime side. But the prompt itself has no instruction to the LLM along the lines of "if notes are truncated [TRUNCATED] markers, do not classify with low confidence — request a fresh injection."

**Severity:** LOW. The runtime is responsible for budget; the prompt's contract is "I receive notes; I use them." A defensive sentence would help if budgets force truncation.

**Recommended fix:** Optional. Add to Phase 4 implementer notes section: "If the runtime truncates notes due to budget, mark truncated sections with `[TRUNCATED — full text omitted]` rather than silently dropping them. The LLM should reduce self_confidence one notch when notes for the chosen chapter are truncated."

**Finding B6-A4 — Schema's null sentinel inside enum (cosmetic).**

Lines 246-258 of B5 (same pattern not present in B6 — checked): the `out_of_scope_class` enum includes `null` as a literal value. Strict JSON Schema convention is to express nullable enums via `"type": ["string", "null"]` (already present) — the literal `null` in the enum array is redundant/non-canonical. Same minor issue as B5-Finding. Note: B6 does NOT have this pattern (only B5).

**Severity:** Cosmetic. No effect on behavior in any modern json_schema parser; will lint-warn in stricter validators.

### B7 Verify router

**Finding B7-A1 — Runner-up selection from alternatives_considered[0] is order-dependent.**

Line 104: `argue_for_runner_up: input.select_alternatives_considered[0]`. The Select prompt's schema (B6 line 177-180) defines `alternatives_considered` as `array of code-pattern strings, maxItems: 4` — no ordering contract. If Select lists alternatives in arbitrary order, V2 may argue against the weakest runner-up instead of the strongest, weakening the antagonistic challenge.

**Severity:** MEDIUM. Order matters for V2 effectiveness.

**Recommended fix:** Two-part:
1. Update Select prompt B6 to add an ordering contract: "`alternatives_considered` MUST list candidates in descending order of strength — the alternative most likely to be defensible if you are wrong goes first."
2. Update B7 router doc-comment on `select_alternatives_considered` (lines 47-49) to state: "Ordered by Select in descending strength (first = strongest runner-up). Verify-V2 picks the first as the antagonist."

**Finding B7-A2 — `has_disambiguator_note` computation is left to "Phase 4 wiring" without spec.**

Lines 35-40 describe the signal's semantics ("a note/exclusion that explicitly distinguishes the surviving candidates") but the implementer's summary openly acknowledges (line 94) that the computation source is undecided. Two candidate sources are mentioned: (a) Stage 3 rules-filter sets a flag when a chapter_exclusions rule fired; (b) Select's cited_notes has a non-null entry. These are NOT equivalent — (a) is a rules-filter signal, (b) is a Select signal that fires for any cited note, not just disambiguators.

**Severity:** MEDIUM. If Phase 4 picks the wrong source, Rule 4 (V1 cheap on ≤2 + disambiguator) misfires. The B7 file is pseudocode-grade per line 7, so deferring to Phase 4 is structurally OK, but the spec should be tight enough that Phase 4 doesn't reinvent it.

**Recommended fix:** Add to B7 (after line 40):
> Recommended computation (Phase 4 to implement): `has_disambiguator_note = true` iff Stage 3 rules-filter logged at least one `chapter_exclusions` rule that fired AND the rule's `excluded_product_text` differs from the chosen candidate's tariff_line description on a discriminator token (material, form, processing_state). Falls back to `false` if rules-filter ran zero rules or only ran rules with `source_chapter` ≠ chosen candidate's chapter.

**Finding B7-A3 — Empty alternatives_considered fallback should escalate, not V1.**

Rule 6 (lines 108-111): when MEDIUM confidence + empty alternatives_considered, fall through to V1_RUBBER_STAMP. The implementer's summary defends this as "MEDIUM confidence with no articulated runner-up means Select hesitated but couldn't name a competitor — V1 is the safe minimum."

But there's a stronger reading: MEDIUM-confidence + zero alternatives means Select is uncertain but couldn't articulate why. A V1 rubber-stamp adds little signal here (the same Select-LLM-class reasoning). The safer default would be ESCALATE_DEEP_THINK — let the higher-reasoning model resolve the unstated ambiguity.

**Severity:** LOW-MEDIUM. This is a defensible judgment call either way. Worth flagging for eval-harness A/B testing in Phase 4 (run both V1-fallback and Deep-Think-fallback and measure correctness/cost).

**Recommended fix:** Optional. Either (a) keep as V1 (current) and add an A/B-test note for Phase 4, OR (b) switch default to ESCALATE_DEEP_THINK. My recommendation: keep as V1 (it's the conservative cost choice; only escalate when LOW is explicitly signaled) but add a code-comment that this is a calibrated default tunable in Phase 4.

**Finding B7-A4 — Cost analysis missing for steady-state mix.**

The router prevents V1 on ASK/REFUSE (cheaper than spike) and prevents V2 on LOW (cheaper than spike). But MEDIUM-with-alternatives now routes to V2 — and the Phase 3 spike empirically had ~5-6 of 15 cases in MEDIUM range. If steady-state production hits 30-40% MEDIUM-confidence rate, V2 cost dominates.

**Severity:** LOW. Cost question for Phase 4 eval, not a structural issue. No code change recommended; flag for Phase 6 cost-model evaluation.

---

## Stage 3 — Carryforward verification

| Carryforward (from A9 Phase 3.5 audit) | Reflected? | Where |
|---|---|---|
| Stage 3 OR-token tsquery (raw query → head-noun OR-joined) | ✅ | B5 lines 111, 113-134, 204-209 — `head_nouns_for_fts` REQUIRED 1-5 array; dedicated section explaining AND-semantics blackhole + OR-token design; 5 worked extraction examples |
| Select 6-digit return when 8-digit child missing | ✅ | B6 schema line 151 (`pattern: ^\d{4}\.\d{2}(\.\d{2})?$`); line 153 (`selected_code_is_six_digit: boolean` REQUIRED); hard rule line 25; jasmine worked test (lines 296-342) demonstrates explicitly |
| Select policy fields (`export_policy` + `policy_condition`) REQUIRED | ✅ | B6 schema lines 154-155 (both REQUIRED, type `[string, null]`); hard rule line 26 ("Even when policy_condition is null the field must be present"); crude petroleum worked test (lines 249-292) demonstrates surfacing |

**Carryforwards: 3/3 reflected.**

---

## Overall verdict per artifact

- **B5 Triage: APPROVE** with 4 optional minor improvements (Findings B5-A1 thru B5-A4). All 7 spec items present; structural design sound; worked examples calibrate the LLM well. The 4 findings are eval-harness tuning targets, not prompt rewrites.

- **B6 Select: APPROVE** with 4 optional minor improvements (Findings B6-A1 thru B6-A4). All 8 spec items present; refusal authorization is firm; 6-digit fallback path is explicit; policy fields are non-skippable. Calibration of LOW threshold (B6-A2) is the most actionable — recommend incorporating before Phase 4 eval-harness runs.

- **B7 Verify router: APPROVE** with 4 optional minor improvements (Findings B7-A1 thru B7-A4). All 7 spec items present; routing tree mirrors spike's recommendation verbatim; V1/V2 prompt templates are well-framed (V2's "last line of defense against convergent-bias" framing is strong). The `has_disambiguator_note` underspec (B7-A2) is the most actionable — recommend tightening before Phase 4 wiring.

**All 3 artifacts: APPROVED for Phase 4 reference**, with 12 minor revision suggestions noted below. None of the findings are REVISE_REQUIRED — they are quality polishes that can be applied opportunistically as Phase 4 build encounters the eval cases.

---

## Recommended revision SQL/edits

These are the specific text-level edits an implementer could apply. None are blockers; ordered by impact.

### Highest-impact (3) — recommend applying before Phase 4 build

**Edit B7-A2 — Tighten `has_disambiguator_note` computation spec.**

File: `backend/prompts/verify-router-v1.ts`
After line 40, insert into the doc-comment block:
```
   * Recommended computation (Phase 4 to implement): has_disambiguator_note = true
   * iff Stage 3 rules-filter logged at least one chapter_exclusions rule that fired
   * AND the rule's excluded_product_text differs from the chosen candidate's
   * tariff_line description on a discriminator token (material/form/processing_state).
   * Falls back to false if rules-filter ran zero rules or only ran rules with
   * source_chapter ≠ chosen candidate's chapter.
```

**Edit B7-A1 — Add ordering contract on `select_alternatives_considered`.**

File 1: `backend/prompts/select-v1.md` — strengthen line 179-180 to:
```json
"alternatives_considered": {
  "type": "array",
  "items": {"type": "string", "pattern": "^\\d{4}\\.\\d{2}(\\.\\d{2})?$"},
  "maxItems": 4,
  "description": "Ordered descending by strength: the first entry MUST be the alternative you considered most carefully and is most likely defensible if your pick were wrong."
}
```
Also add to hard rules (B6 line 23-29) a new bullet:
> - **alternatives_considered MUST be ordered.** First entry = strongest runner-up (the alternative you actually had to reason hardest against). Verify-V2 will pick this first entry to argue antagonistically.

File 2: `backend/prompts/verify-router-v1.ts` — update lines 47-49 doc-comment:
```
   * The codes Select considered but did not pick, ORDERED BY STRENGTH (first = strongest
   * runner-up per Select prompt's contract). V2 picks index [0] as the antagonist.
```

**Edit B6-A2 — Strengthen LOW self_confidence criteria.**

File: `backend/prompts/select-v1.md` — replace line 123 with:
```
- **LOW:** ANY of the following: (a) classification required extending the definition beyond strict reading; (b) applying GIR 3(c) "heading last in numerical order" as the deciding rule; (c) all 5 candidates were close in retrieval score AND the chosen one has no clearly-decisive attribute match; (d) the chosen candidate's parent subheading is "Other" / catch-all AND no specific sibling subheading was available; (e) the matched exclusion rules introduced alternative-chapter doubt that you could not fully resolve.
```

### Medium-impact (5) — recommend applying as eval-harness shakedown drives need

**Edit B5-A1 — Abbreviation expansion for head_nouns.**

File: `backend/prompts/triage-v1.md` — insert new rule between lines 122 and 123:
```
5. **Expand common abbreviations to canonical forms** when unambiguous: "stnls" → "stainless", "stl" → "steel", "alum" → "aluminium", "polyurethane (PU)" → keep both "polyurethane" and "pu". Skip expansion when ambiguous.
```
Renumber subsequent rules.

**Edit B5-A2 — Define "strongly matches" in competing-interpretation rule.**

File: `backend/prompts/triage-v1.md` — line 58, append:
```
(For this purpose, "matches a chapter family strongly" = at least 2 of the 6 attribute axes — material, form, function, intended_use, processing_state, composition — point to that chapter family with no single attribute uniquely identifying it.)
```

**Edit B5-A3 — previousAnswers contradiction handling.**

File: `backend/prompts/triage-v1.md` — append to "How to replay" paragraph (after line 144):
```
If two prior answers contradict each other (e.g., round-1 said "solid_rubber" and round-2 said "has metal sleeve"), prefer the most recent answer as the user's settled position.
```

**Edit B6-A1 — current_year explicit source-of-truth.**

File: `backend/prompts/select-v1.md` — insert after line 91:
```
This is the actual current calendar year from the system clock — NOT a year value extracted from the user's query. Use `current_year` ONLY when computing "product age" relative to today (e.g., antique threshold). The query's stated manufacture year is the OTHER half of the comparison.
```

**Edit B7-A3 — Code-comment annotation on Rule 6 fallback.**

File: `backend/prompts/verify-router-v1.ts` — replace lines 108-111 with:
```typescript
  // Rule 6 — Default fallback: V1 rubber-stamp. This case is uncommon — MEDIUM
  //   confidence with no alternatives_considered means Select converged on one candidate
  //   but flagged ambiguity it could not articulate as a runner-up. V1 is the safe
  //   minimum cost. TUNABLE IN PHASE 4: A/B test V1 vs ESCALATE_DEEP_THINK here; if
  //   eval shows MEDIUM-no-alts cases need stronger review, switch to ESCALATE.
  return { route: 'V1_RUBBER_STAMP' };
```

### Low-impact (4) — cosmetic / optional

**Edit B5 cosmetic — Remove redundant `null` from enum.**

File: `backend/prompts/triage-v1.md` — line 256-257: drop the trailing `null` from the enum array. The `"type": ["string", "null"]` on line 247 already conveys nullability. Pure lint cleanup.

**Edit B6-A3 — Notes-truncation guidance.**

File: `backend/prompts/select-v1.md` — append to "Notes for Phase 4 implementers" section:
```
- **Notes truncation contract:** if the runtime truncates injected notes due to budget pressure, mark truncated sections with `[TRUNCATED — full text omitted]` rather than silently dropping. The LLM should reduce self_confidence one notch (e.g., HIGH→MEDIUM) when notes for the chosen chapter are truncated.
```

**Edit B7-A4 — Cost-model note for steady-state V2 rate.**

File: `backend/prompts/verify-router-v1.ts` — append to the top doc-block (after line 19):
```
 * Cost calibration (Phase 6 to validate): steady-state production V2 rate ≈ % of
 * queries hitting MEDIUM confidence WITH non-empty alternatives_considered.
 * Phase 3 spike had ~5/15 = 33%; if production rate exceeds 40%, consider tightening
 * the MEDIUM threshold in Select prompt to push borderline cases to either HIGH
 * (→V1) or LOW (→Deep-Think).
```

**Edit minor — Update Q-budget hard cap clarification.**

File: `backend/prompts/triage-v1.md` — line 312 user-prompt comment is fine, but consider making it more explicit:
```
Q_BUDGET_REMAINING: {q_budget_remaining}    // 2 on round 1, 1 on round 2, 0 on round 3+. ASK is only legal when q_budget_remaining ≥ 1.
```

---

## Final action

- **APPROVED items: ready for Phase 4 reference** — all three artifacts (B5, B6, B7) are spec-complete and architecturally sound. No artifact requires redesign or re-implementation. The 12 revision suggestions are quality polishes that can be applied in priority order (highest 3 → medium 5 → low 4) as Phase 4 build proceeds.

- **REVISE items:** none. (All findings are eval-harness tuning targets or defensive edge-case guards, not spec-violation rewrites.)

- **REJECT items:** none.

- **Carryforwards: 3/3 reflected** — all three architectural carryforwards from Phase 3.5 (Stage 3 OR-token tsquery, Select 6-digit return, Select policy fields REQUIRED) are present and demonstrated by worked test queries.

- **Critical issues: 0.** No blocker found.

- **Implementer's judgment calls (per summary §judgment-calls):** all 4 are defensible and worth keeping:
  1. Adding `incoherent_query` as a 7th out-of-scope class — REASONABLE (catches empty/gibberish early).
  2. Verify router Rule 6 V1-fallback for MEDIUM-no-alts — REASONABLE (cost-conservative; flag for Phase 4 A/B).
  3. Notice-on-null-policy at 6-digit — REASONABLE (UX preserves the answer + signals confirmation needed).
  4. Notes injection budget warning to implementer — REASONABLE (correctly punts a runtime concern to runtime).

---

## Coordinator return payload

```yaml
b5_verdict: APPROVE
b6_verdict: APPROVE
b7_verdict: APPROVE
carryforwards_reflected: 3/3
critical_issues_count: 0
recommended_revisions_count: 12
  highest_impact: 3   # B7-A2 has_disambiguator_note spec; B7-A1+B6 alternatives ordering; B6-A2 LOW criteria
  medium_impact: 5    # B5-A1 abbreviations; B5-A2 strongly-matches; B5-A3 contradiction; B6-A1 current_year; B7-A3 Rule6 comment
  low_impact: 4       # B5 cosmetic null; B6-A3 truncation; B7-A4 cost note; Q-budget clarify
output_path: backend/data/phase-3.5-prompts/B5-B6-B7-review-verdict.md
final_action: ready_for_phase_4_with_optional_polishes
```

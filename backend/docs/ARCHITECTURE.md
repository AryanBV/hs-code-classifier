# ARCHITECTURE.md — Phase 4 Pipeline Spec (LOCKED)

**Status:** LOCKED 2026-05-25 (Phase 3.5 exit).
**Branch:** `feat/phase-3-arch-spike` → cut `feat/phase-4-pipeline-build` from this.
**Source-of-record for design rationale:** `backend/data/phase-3-spike-report.md` (this doc does NOT duplicate).
**Source-of-record for empirical proof:** `backend/data/phase-3.5-audits/A9-regression-comparison.md`.

This is the contract Phase 4 implementers build against. Every locked decision below traces to spike traces, A9 empirical re-run, or B2 live measurement — no design is invented here.

---

## 1. Intent

Classify Indian-exporter product descriptions into 8-digit ITC-HS codes (6-digit fallback when DB-orphan), with `export_policy` + `policy_condition` surfaced on every CLASSIFY outcome. Refuse rather than mis-classify under uncertainty. The pipeline is a 6-stage cascade: an LLM-light Triage gates a deterministic retrieval cascade, a programmatic rules-filter prunes legally-excluded candidates, an LLM Select makes the final pick, an LLM Verify cross-checks, and a Deep-Think escalation handles the residual uncertainty.

---

## 2. Pipeline overview (6 stages)

Design rationale per stage → see spike report §"Architecture under test — final spec" (lines 218-262). Phase 3.5 deltas are catalogued in §4 below; everything else inherits unchanged.

```
Stage 1 — TRIAGE          (LLM, Gemini 3.5 Flash @ Vertex global, responseSchema, thinkingBudget=0)
   → attributes + head_nouns_for_fts + decision {CLASSIFY|ASK|REFUSE} + 1-3 candidate_chapters

Stage 2 — HYBRID RETRIEVAL (no LLM, deterministic)
   2.1 Chapter cosine top-10  (Cohere embed-v4 hierarchical)
   2.2 Heading cosine top-15 filtered to top-10 chapters
   2.3 Subheading cosine top-20 filtered to top-15 headings
   2.4 Tariff cosine top-30 UNION (subheading-filter, heading-membership fallback)   ← LOAD-BEARING
   2.5 Parallel FTS leg on `tariff_lines.fts_search_text` GIN index, tsquery built from
       head_nouns_for_fts OR-joined                                                   ← Phase 3.5 Δ
   2.6 Cohere Rerank 4 Fast on the union top-N → top-5 (with caveats per B2; see §5)

Stage 3 — RULES FILTER     (programmatic SQL, no LLM)
   - For each surviving candidate, check `chapter_exclusions` rows where source_chapter
     matches the candidate's chapter; tsquery is constructed from Triage head_nouns_for_fts
     (OR-joined), NOT from the raw user query.                                         ← Phase 3.5 Δ
   - When a rule fires, drop the candidate and consider rule's redirects_to_chapter[]
     entries as side-channel suggestions to Stage 4.

Stage 4 — SELECT           (LLM, Gemini 3.5 Flash @ Vertex global, responseSchema, thinkingBudget=0)
   → exactly one candidate code OR refusal. Required fields: export_policy, policy_condition.
   → 6-digit subheading return permitted when subheading has no 8-digit children.        ← Phase 3.5 Δ
   → All chapter + section notes + matched exclusions + GIRs + current_year injected.

Stage 5 — VERIFY           (router, then V1 OR V2 OR skip; per `backend/prompts/verify-router-v1.ts`)
   - Routing tree: ASK/REFUSE → SKIP; LOW → escalate; HIGH → V1; tight+disambiguated → V1;
     MEDIUM → V2 ANTAGONISTIC arguing the runner-up.
   - V1 + V2 both use Gemini 3.5 Flash @ Vertex global (responseSchema, thinkingBudget=0).
     Same-family correlation is a carryforward risk — see §5 note and §12 carryforward #8.

Stage 6 — DEEP-THINK       (LLM, Gemini 3.5 Flash @ Vertex global, thinking_level=high)
   Triggered by Verify disagreement (Q-budget exhausted) OR Select LOW confidence.
   Returns AUTOCLASSIFY OR structured REFUSAL. One shot, no recursion into ASK.
```

---

## 3. Per-stage I/O schemas

Full prompt + schema text is canonical in the prompt files; this section enumerates the contract only.

| Stage | Input | Output schema source | Output highlights |
|---|---|---|---|
| 1 Triage | `{query, previousAnswers, q_budget_remaining}` | `backend/prompts/triage-v1.md` §RESPONSE JSON SCHEMA | `decision`, `extracted_attributes` (incl. `head_nouns_for_fts: string[1..5]`), `candidate_chapters: string[0..3]`, `completeness_signal: 0..1`, `clarifying_question`, `refusal_reason`, `out_of_scope_class` |
| 2 Retrieval | Stage 1 output | (no LLM — internal types) | Array of ≤5 candidate codes with full row (`code`, `description`, `chapter/heading/subheading`, `export_policy`, `policy_condition`, `india_specific_note`, `retrieval_score`) |
| 3 Rules Filter | Stage 2 candidates + Triage attrs | (no LLM — internal types) | Filtered candidates + `matched_exclusion_rules[]` (source_chapter, redirects_to_chapter[], excluded_product_text, source_note_reference, source_note_text) |
| 4 Select | Filtered candidates + chapter_notes + section_notes + matched_exclusion_rules + applicable_GIRs + `current_year` | `backend/prompts/select-v1.md` §RESPONSE JSON SCHEMA | `selected_code` (string\|null, regex `^\d{4}\.\d{2}(\.\d{2})?$`), `selected_code_is_six_digit: boolean`, `export_policy`, `policy_condition` (REQUIRED — verbatim from chosen row), `reasoning_chain[2..5]`, `cited_notes`, `self_confidence` HIGH\|MEDIUM\|LOW, `alternatives_considered[]`, `refusal` |
| 5 Verify-router | Triage + Select signals | `backend/prompts/verify-router-v1.ts` `VerifyDecision` | `{route: SKIP\|V1_RUBBER_STAMP\|V2_ANTAGONISTIC\|ESCALATE_DEEP_THINK}` |
| 5a V1 | Select output + key notes | inline in `verify-router-v1.ts` | `{agree: boolean, disagree_reason: string\|null}` |
| 5b V2 | Select output + full notes both candidates + `argue_for_runner_up` | inline in `verify-router-v1.ts` | `{agree_with_select: boolean, why_runner_up_might_be_better, deciding_consideration}` |
| 6 Deep-Think | Full trace from Stages 1-5 | (to be specified in Phase 4 prompt iteration) | AUTOCLASSIFY (with full Select schema) OR REFUSAL |

---

## 4. Phase 3.5 deltas vs spike report

These overlay the spike-report architecture. Each is sourced from a Phase 3.5 audit; A9 (`backend/data/phase-3.5-audits/A9-regression-comparison.md`) is the empirical proof.

### 4.1 `tariff_lines.fts_search_text` denormalized column + GIN index (A4) (✓ LOCKED 2026-05-25)

Generated-always column on `tariff_lines`: `chapter.title || ' ' || heading.title || ' ' || COALESCE(subheading.title, '') || ' ' || description`. GIN index `tariff_lines_fts_search_text_gin USING gin (to_tsvector('english', fts_search_text))` confirmed live. Stage 2.5 FTS leg queries against this — NOT bare `description`. A9 proved this single change closed retrieval gaps on cases 5, 7, 8, 10, 14, 15. Empty-subheading-title rows (454, mostly Ch.72-73) are absorbed by COALESCE; no separate fallback path needed.

### 4.2 `chapter_exclusions.redirects_to_chapter` → `text[]` (A5) (✓ LOCKED 2026-05-25)

Schema confirmed: `redirects_to_chapter` is `ARRAY` (Postgres `text[]`). Multi-destination rules supported (e.g., Ch.71 Note 3(l) → ['90','91','92']; Ch.42 Note 1 → ['39','59']). 1,505 rules total; 102 multi-destination; 1,288 single-destination. Stage 3 reads the full array and surfaces all destinations as side-channel suggestions to Stage 4 — not as hard redirects (correctness depends on chapter notes, not the redirect array alone).

### 4.3 `sections.notes` JSONB (A7) (✓ LOCKED 2026-05-25)

Column added on `sections` table, populated for all 21 sections. Stage 4 Select prompt injects `section_notes` for every section that owns a chapter in the candidate set. Critical for Section XVII (Ch.86-89 vehicles) and Section XV (Ch.72-83 base metals) cross-chapter routing.

### 4.4 `chapter_exclusions` enrichment (A1) (✓ LOCKED 2026-05-25)

+352 rules added across A1a (section-level → chapter exclusions), A1b (asymmetric reciprocal), A1c (positive-definition-by-restriction), A1d (cross-candidate heading-code references). Total now 1,505. Spot-check spike traces 5, 8 cleared from RULES_GAP → NONE after enrichment.

### 4.5 Stage 3 tsquery construction (✓ LOCKED 2026-05-25)

**Stage 3 MUST build tsquery from Triage-extracted `head_nouns_for_fts` OR-joined,** NOT from `websearch_to_tsquery(raw_query)`. A9 proved AND-semantics on raw query blackholes rule firing on cases 5, 8, 10 (e.g., rule 2428 doesn't fire on "windscreen wiper motor 12V automotive" because "windscreen" / "12V" tokens aren't in the rule text). Triage already emits 1-5 head nouns; Stage 3 joins them: `to_tsquery('english', head_nouns_for_fts.join(' | '))`.

### 4.6 6-digit subheading return permitted (✓ LOCKED 2026-05-25)

When the correct subheading has zero 8-digit children in `tariff_lines` (Indian Schedule-2 structural gap; documented case: 3301.22 jasmine essential oil), Select returns the 6-digit code with `selected_code_is_six_digit = true`. Not a refusal. `selected_code` regex permits both `^\d{4}\.\d{2}$` and `^\d{4}\.\d{2}\.\d{2}$`. See `backend/prompts/select-v1.md` Test 2 for the worked example.

### 4.7 Select schema requires `export_policy` + `policy_condition` (✓ LOCKED 2026-05-25)

Closes spike case 11 SELECT_GAP. Both fields REQUIRED in Select's JSON output; copied verbatim from the chosen candidate's `tariff_lines` row. `null` is permitted when the DB row is null; fabrication is not. See `backend/prompts/select-v1.md` §HARD RULES.

---

## 5. Model stack (D1) (✓ LOCKED 2026-05-25)

All LLM stages run on **Vertex AI Gemini 3.5 Flash** at region `global` (Gemini 3.x is served from the global endpoint, NOT us-central1). Auth: service-account JSON at `backend/.gcp/vertex-sa.json` via `GOOGLE_APPLICATION_CREDENTIALS` env var. Structured outputs use `generationConfig.responseSchema` + `generationConfig.responseMimeType = 'application/json'` (Vertex Gemini's equivalent of OpenAI `response_format: json_schema strict`).

Endpoint shape:
`https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0962892937/locations/global/publishers/google/models/gemini-3.5-flash:generateContent`

| Stage | Model | Region | Temp | Mode | thinkingBudget | Per-call cost | Credit? | Locked? |
|---|---|---|---|---|---|---|---|---|
| 1 Triage | `gemini-3.5-flash` | global | 0.1 | responseSchema | 0 (disabled) | ~$0.00045 | ✅ GenAI Builder | ✓ LOCKED 2026-05-25 |
| 2 Retrieval (embed) | `cohere embed-v4` (asymmetric: `search_query` / `search_document`) | n/a | n/a | — | n/a | n/a | n/a | ✓ LOCKED (validated in Phase 3 + A9) |
| 2.6 Rerank | `cohere rerank-english-v3.0` (Rerank 4 Fast) | n/a | n/a | — | n/a | n/a | n/a | ◐ ADOPT WITH CAVEATS (B2: 5/10 raw, 6/10 trace-corrected; useful as confidence-amplifier + tie-revealer, NOT sole top-1 selector — see B2 §"Revised recommendation") |
| 3 Rules filter | (programmatic, no LLM) | — | — | — | — | $0 | — | ✓ LOCKED |
| 4 Select | `gemini-3.5-flash` | global | 0.1 | responseSchema | 0 (disabled) | ~$0.0066 | ✅ | ✓ LOCKED 2026-05-25 |
| 5a Verify V1 (rubber-stamp) | `gemini-3.5-flash` | global | 0.0-0.1 | responseSchema | 0 (disabled) | ~$0.00165 | ✅ | ✓ LOCKED 2026-05-25 |
| 5b Verify V2 (antagonistic) | `gemini-3.5-flash` | global | 0.5-0.7 | responseSchema | 0 (disabled) | ~$0.0057 | ✅ | ✓ LOCKED 2026-05-25 (same-family carryforward — see note + §12 #8) |
| 6 Deep-Think | `gemini-3.5-flash` with `thinking_level=high` | global | 0.1 | responseSchema | high (generous) | ~$0.015 | ✅ | ✓ LOCKED 2026-05-25 |

**CRITICAL — thinking model behavior:** Gemini 3.x is a "thinking model" — by default it spends internal reasoning tokens before producing output, which adds latency + cost. For non-Deep-Think stages, set `generationConfig.thinkingConfig.thinkingBudget = 0` to disable internal reasoning. For Deep-Think, set `thinking_level=high` (or equivalent generous `thinkingBudget`) to invoke the heavy reasoning path.

**Verify V2 same-family note:** V1 and V2 both run Gemini 3.5 Flash — same model family. The spike report's V2 design rationale assumed cross-family independence (Gemini Triage + GPT Select + Gemini V1 + GPT V2). Under D1 LOCKED, V2's "adversarial independence" is reduced to **prompt-level adversariality only** (different temperature, antagonistic instructions, forced runner-up argument). If Phase 4 eval shows V2 systematically rubber-stamping Select instead of catching genuine errors, the swap-out is a 1-line config change — either enable Claude quota on Vertex (deferred per T17) or route V2 to GPT-5.4 mini. Tracked as carryforward #8 (§12).

**Credit-coverage finding (T17, 2026-05-25):** Three Gemini models confirmed accessible under the GenAI Builder credit window (~$960/mo at 100K queries fully covered). Claude on Vertex requires a quota request (HTTP 429 on first call) — deferred per user direction. Llama / Mistral are not on Vertex Garden for this project. Post-credit-expiry plan: OSS hybrid documented in `D1-opensource-research.md` is the 2027 cutover path.

**D1 lock criterion (originally D1.5):** SUPERSEDED by 2026-05-25 lock. The 5-trace B3 measurement was not required because the credit window covers worst-case cost (~$960/mo at 100K queries on the all-Gemini stack), and provider plurality has been deliberately traded for credit coverage during the runway window.

---

## 6. Cost model (✓ LOCKED 2026-05-25 — all-Gemini stack)

| Stage | Calls | Tokens/call (est.) | Cash cost (Gemini 3.5 Flash @ Vertex global) |
|---|---|---|---|
| 1 Triage | 1 (CLASSIFY/ASK/REFUSE) | ~1.5K in + 500 out, thinking=0 | ~$0.00045 |
| 2 Retrieval | 4-5 cosine queries + 1 FTS + 1 Rerank | n/a + 1 Rerank call | ~$0.0001 + Rerank ($0 on Cohere trial) |
| 3 Rules filter | 0 LLM | — | $0 |
| 4 Select | 1 (HIGH/MEDIUM/LOW path) | ~6K in + 1K out (notes-heavy), thinking=0 | ~$0.0066 |
| 5a Verify V1 | 0-1 (router) | ~3K in + 300 out, thinking=0 | ~$0.00165 |
| 5b Verify V2 | 0-1 (router) | ~6K in + 1K out, thinking=0 | ~$0.0057 |
| 6 Deep-Think | 0-1 (rare) | ~8K in + 2K out reasoning, thinking_level=high | ~$0.015 |
| **Total per query (baseline CLASSIFY HIGH path: Triage+Select+V1)** | | | **~$0.0087** |
| Per query EXPENSIVE path (Triage+Select+V2+Deep-Think) | | | ~$0.027 |

**Aggregate at 100K queries/month (mixed path distribution, ~80% HIGH / 15% MEDIUM / 5% LOW-escalation):**
- Estimated monthly spend: **~$960/mo** at full retail Gemini 3.5 Flash rates
- **Fully credit-covered** during the GenAI Builder credit window
- Post-credit cutover plan: OSS hybrid per `D1-opensource-research.md` (2027 horizon)
- Revisit cost model if Phase 4 eval reveals systematic Deep-Think escalation > 10% (would push monthly spend ~2×)

**B3 empirical measurement table — DEFERRED:**

The original D1.5 lock criterion required ≥4/5 B3 cost-model traces with CORRECT outcomes. Superseded by 2026-05-25 lock: credit coverage makes per-call cost a non-blocking concern within the window, and Phase 4's 168-case eval will produce the authoritative cost+correctness measurement on real traffic shape.

---

## 7. Failure modes + escalation contracts

| Failure | Trigger | Handling |
|---|---|---|
| Triage REFUSE | `decision: "REFUSE"` from Stage 1 | Return refusal payload to user. No retrieval, no escalation. |
| Triage ASK | `decision: "ASK"` from Stage 1, Q-budget > 0 | Surface `clarifying_question` to user. On user reply, runtime calls Triage again with `previousAnswers` populated and `q_budget_remaining--`. Q-budget=2 max. |
| Triage ASK + Q-budget = 0 | Triage wants to ASK but no budget | Triage MUST itself REFUSE with `out_of_scope_class: "function_only_no_substance"` (spec'd in `triage-v1.md` §"Q-budget exhaustion"). |
| Triage invalid JSON | Gemini returns malformed JSON despite json_schema (rare) | Runtime retries once at temp=0.0; if still invalid → fall back to REFUSE with `out_of_scope_class: "incoherent_query"`. |
| Retrieval returns 0 candidates | All cosine + FTS legs empty after rules-filter | Runtime escalates directly to Deep-Think with empty candidate set. Deep-Think likely REFUSES. |
| Select hallucinates code not in candidate set | `selected_code ∉ candidates[].code ∪ {null}` | Runtime rejects, retries Select once with explicit "your previous response had a hallucinated code" instruction. On second failure → REFUSE. |
| Select returns `selected_code: null` (refusal) | Genuine refusal path per `select-v1.md` Step 6 | Return refusal to user. No Verify. No Deep-Think unless caller explicitly opts in. |
| Verify V1 disagrees | `agree: false` from V1 | If Q-budget remaining > 0 → restart pipeline at Triage with `previousAnswers` updated to seed an ASK route. Else → Deep-Think. |
| Verify V2 disagrees | `agree_with_select: false` from V2 | Same as V1 disagree. |
| Deep-Think AUTOCLASSIFY | Returns full Select-shaped output | Surface to user as the final classification (mark `escalated_to_deep_think: true`). |
| Deep-Think REFUSE | Returns refusal | Return refusal to user; no further escalation. |

---

## 8. `previousAnswers` schema (✓ LOCKED 2026-05-25)

`previousAnswers: Record<questionId: string, answerId: string>`.

- `questionId`: stable token assigned by Triage on the round that emitted the question (e.g., `"q_rubber_composition"`). Snake_case, matches `^[a-z][a-z0-9_]*$`.
- `answerId`: the `id` of the option the user selected (e.g., `"metal_sleeve"`). Matches `^[a-z][a-z0-9_]*$`.
- Empty `{}` on round 1; max 2 entries (Q-budget = 2).
- Triage replay rule (per `triage-v1.md` §`previousAnswers`): on rounds 2+, fold each entry as a binding fact into `extracted_attributes`; do not re-ask the same question; treat as definitive.
- Runtime is responsible for the Q-budget counter; Triage reads `q_budget_remaining` (integer) as an input each round.

---

## 9. Refusal contract (✓ LOCKED 2026-05-25)

The system MUST refuse (rather than guess) under any of:

1. **Triage out-of-scope** — `out_of_scope_class ∈ {extraterrestrial, fictional, services_not_goods, contraband, weapons_restricted_class, function_only_no_substance, incoherent_query}` (per `triage-v1.md` Rule 1).
2. **Triage Q-budget exhausted** — completeness still insufficient after 2 ASK rounds → REFUSE with `out_of_scope_class: "function_only_no_substance"`.
3. **Select unfaithful candidates** — no Stage 4 candidate is a faithful classification under strict reading of notes + GIRs + exclusions → Select returns `selected_code: null` + `refusal.reason` (per `select-v1.md` Step 6).
4. **Deep-Think refusal** — final escalation determines no defensible answer exists.

Refusal payload returned to user contains (minimum):
- `decision: "REFUSE"`
- `refusal_reason: string` — one-sentence diagnostic the user can read
- `out_of_scope_class: string | null` — when known
- `escalation_path: string[]` — which stages were traversed before refusing (for audit)
- HTTP semantics: 200 OK with refusal in body (NOT 4xx); the classifier successfully evaluated and concluded "refuse".

---

## 10. Phase 4 prompt iteration cycle

B5/B6/B7 (`triage-v1.md`, `select-v1.md`, `verify-router-v1.ts`) are **seed drafts**, not final. Phase 4 iterates against the 168-case eval harness (B1). The loop:

1. Run `backend/eval/run-eval.ts` over all 168 cases with the current prompt version.
2. Diff predictions vs `expected_code` per case. Group failures by stage and failure mode (Triage routing wrong, Select picked wrong sibling, Verify over-disagreed, etc.).
3. Update one prompt at a time. Tag the new version `triage-v2.md` / `select-v2.md` etc.; do not overwrite v1.
4. Re-run eval. Accept the new version when ≥80% of the targeted failure class resolves AND no regression > 2 cases across non-targeted classes.
5. Lock prompts at Phase 4 exit (≥85% overall correctness target on the 168-case eval).

Prompts and eval cases are the contract; the runtime (the classifier code in `backend/src/classifier/`) is the iterable artifact.

---

## 11. Eval infrastructure (B1)

Eval runner: `backend/eval/run-eval.ts`. Reads `feat/phase-1-eval-harness:backend/src/eval/cases.json` (168 cases). Calls a stub `classifyStub()` returning null today; Phase 4 swaps in the real classifier function from `backend/src/classifier/`. Output: per-case prediction JSON + summary stats (correctness, refusal rate, mean cost, mean latency). Phase 1 expected-code field is the ground truth.

Baseline run (stub) writes to `backend/eval/baseline-stub.json`. See `backend/data/phase-3.5-prompts/B1-eval-skeleton-summary.md` for the skeleton's current shape.

---

## 12. Open carryforwards (track post-Phase-4)

| # | Item | Source | Severity | Resolves in |
|---|---|---|---|---|
| 1 | 5 borderline multi-destination chapter_exclusions rows pending review | `backend/data/phase-3.5-prompts/A1-multidest-sweep.md` | Low | Phase 4 prompt iteration OR Phase 5 |
| 2 | 6 pre-existing OCR data quirks | A8 Audit A finding | Low | Phase 5 data cleanup |
| 3 | 454 empty-subheading-title rows (cosmetic double-space in fts_search_text concat) | A8 finding | Cosmetic (zero FTS impact) | Phase 5 |
| 4 | vertex-baseline-eval defect (0 output tokens) | D4 | Deferred | Phase 4/M3 |
| 5 | `policy_conditions` sidecar table empty | CLAUDE.md known issue | UX | Phase 8 (frontend) |
| 6 | `tariff_lines.unit` column NULL on all rows | CLAUDE.md known issue | M3 blocker | M3 trade-intelligence |
| 7 | Legacy `backend/src/rules/chapter-rules.ts` legal_basis comments | Spike §Phase 2 fixes | Replaced by Phase 4 rebuild | Phase 4 |
| 8 | **Verify V2 same-family correlation** — V1 and V2 both run Gemini 3.5 Flash under D1 LOCKED. Adversarial independence is reduced to prompt-level only. Revisit if Phase 4 eval shows V2 rubber-stamping Select instead of catching genuine errors. | T20 D1 lock | Medium | Phase 4 eval — 1-line config swap to Claude (pending quota) or GPT-5.4 mini |
| 9 | Claude on Vertex requires quota request (HTTP 429 on first call) — deferred per T17 | T17 credit-coverage test | Low | Phase 4 if V2 swap needed |
| 10 | Post-credit-expiry OSS hybrid cutover plan | `D1-opensource-research.md` | Long-horizon | 2027 |

---

## 13. References (single-click navigation)

- Phase 3 spike report (design rationale, traces): `backend/data/phase-3-spike-report.md`
- Phase 3.5 plan (operative session plan): `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md`
- A9 empirical proof: `backend/data/phase-3.5-audits/A9-regression-comparison.md`
- B2 Cohere Rerank live-test: `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md`
- T17 credit-coverage test: `backend/data/phase-3.5-prompts/T17-credit-coverage-test.md`
- D1 open-source post-credit plan: `backend/data/phase-3.5-prompts/D1-opensource-research.md`
- Triage prompt: `backend/prompts/triage-v1.md`
- Select prompt: `backend/prompts/select-v1.md`
- Verify router: `backend/prompts/verify-router-v1.ts`
- Eval skeleton: `backend/eval/run-eval.ts` (per B1)
- Project context: `CLAUDE.md` (root)

---

## 14. Phase 4 next steps (handoff to implementer)

The Phase 3.5 exit gate is GREEN; D1 model stack is LOCKED 2026-05-25. Next-session implementer picks up here:

1. **Cut branch:** `git checkout -b feat/phase-4-pipeline-build` off `feat/phase-3-arch-spike`.
2. **First build task:** write `backend/src/classifier-v2/index.ts` that calls Vertex Gemini 3.5 Flash via the service-account JSON at `backend/.gcp/vertex-sa.json`. Use `GOOGLE_APPLICATION_CREDENTIALS` env var; endpoint region `global`; structured output via `generationConfig.responseSchema` + `responseMimeType: 'application/json'`; thinkingBudget=0 for all stages except Deep-Think.
3. **Eval wiring:** `backend/eval/run-eval.ts` is ready as a stub — swap `classifyStub` for the real classifier function from `backend/src/classifier-v2/`.
4. **First eval gate:** ≥80% chapter-match correctness on the 168-case Phase 1 harness. Heading-match and code-match thresholds tighter (target ≥70% heading, ≥60% code on initial Phase 4 build; iterate prompts toward ≥85% / ≥75% / ≥70% at Phase 4 exit).
5. **If Verify V2 same-family proves problematic** (V2 systematically agreeing with Select instead of catching genuine errors — track via eval-harness disagreement-rate metric): enable Claude quota on Vertex (1-line config) OR switch V2 to GPT-5.4 mini (1-line config). Both are reversible if eval regresses.
6. **Cost monitoring:** add per-call cost logging from day 1 in `classifier-v2/`; eval runner aggregates mean/p95 cost. Trigger AskUserQuestion if mean exceeds $0.012/query (≈40% over the ~$0.0087 estimate).

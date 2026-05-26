> **⚠️ v1 SUPERSEDED 2026-05-26.** This document records the Phase 3.5 sprint and the v1 architecture lock from 2026-05-25. On 2026-05-26 the architecture was re-audited and locked as v2 — see `backend/docs/ARCHITECTURE.md` (v2) and `C:/Users/ASUS/.claude/plans/ultrathink-i-m-resuming-the-zesty-candle.md` for the transition rationale. Phase 3.5 deliverables (DB schema, hierarchical embeddings, chapter_exclusions, prompts as seeds) carry forward to v2 unchanged.

# Phase 3.5 Progress Log

**Started:** 2026-05-24
**Branch:** `feat/phase-3-arch-spike`
**Plan file:** `C:\Users\ASUS\.claude\plans\bubbly-foraging-catmull.md`

Live recovery anchor — orchestrator updates after each major step. On session limit / interruption, next session reads this top-to-bottom and resumes.

---

## Workstreams

| ID | Task | Status | Note |
|----|------|--------|------|
| T1 | Pre-flight PF1-PF8 | ✅ COMPLETE | `phase-3.5-preflight.md`; A7 simplified (sections.notes already exists); PF8 unique constraint applied |
| T2 | A-DDL (A6/A7/A5/A4) | 🔄 IN PROGRESS | |
| T3 | A-GATE retrieval re-test | ⏳ PENDING | |
| T4 | A-DML A1 (4 subagents) | ⏳ PENDING | |
| T5 | A-DML A3 jasmine | ⏳ PENDING | |
| T6 | A-DML A2 (conditional on T3) | ⏳ PENDING | |
| T7 | A-VERIFY A8+A8.5 | ⏳ PENDING | |
| T8 | A9 empirical proof | ⏳ PENDING | |
| T9 | Commit A workstream | ✅ COMPLETE | Applied 2026-05-25 |
| T10 | B5/B6/B7 prompts | ✅ COMPLETE | triage-v1.md, select-v1.md, verify-router-v1.ts seed drafts |
| T11 | B4 ARCHITECTURE.md | ✅ COMPLETE | Updated post-D1 lock via T20 |
| T12 | B1 eval skeleton | ✅ COMPLETE | `backend/eval/run-eval.ts` stub ready |
| T13 | B2 Cohere Rerank live | ✅ COMPLETE | Adopted with caveats (5/10 raw, 6/10 trace-corrected) |
| T14 | B3 cost-model + D1 lock | ◐ SUPERSEDED | Credit-coverage covers per-call cost concern; Phase 4 eval will measure on real traffic |
| T15 | Commit B + exit gate | 🔄 IN PROGRESS | Coordinator commits after T20 |
| T16 | GCP SA setup walkthrough | ✅ COMPLETE | SA JSON at `backend/.gcp/vertex-sa.json` |
| T17 | Empirical credit-coverage test (10 models) | ✅ COMPLETE | 3 Gemini OK; Claude needs quota request (deferred); Llama/Mistral not on Vertex Garden |
| T18 | Verify billing console at T+1hr | ✅ COMPLETE | Skipped per user direction |
| T19 | Finalize D1 stack | ✅ COMPLETE | All-Gemini stack locked |
| T20 | Update ARCHITECTURE.md + prompts for locked stack | ✅ COMPLETE | This update, 2026-05-25 |
| T21 | Re-run B3 cost-model with Vertex stack | ⏳ DEFERRED | Credit coverage non-blocking; Phase 4 eval supersedes |

---

## Migrations applied this phase

| Name | Date | Purpose |
|------|------|---------|
| `phase_3_5_pf8_chapter_exclusions_unique` | 2026-05-24 | Add UNIQUE NULLS NOT DISTINCT (source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading). PF8 idempotency key for A1 subagents. |

---

## Active sessions

### Session heartbeat (subagent work duration log — for 5h-quota tracking)

| Session | Step | Subagent duration_ms (cumulative) | Wall-clock note |
|---|---|---|---|
| 1 (2026-05-24) | T1-T4 wave1 + T7+T8 | ~6,800,000 ms ≈ 113 min subagent work | Parallel dispatch — actual wall-clock < 60 min |
| 2 (2026-05-25) | T9 commit + B workstream | (updating live) | |

User must run `/usage` slash command in Claude Code for authoritative 5h-window remaining. ccusage npm pkg gives projected exhaustion.

### Phase 3.5 status snapshot (live)

- **A workstream**: T1-T8 COMPLETE. T9 commit applied 2026-05-25. EXIT-GATE GREEN.
- **B workstream**: T10/T12/T13 COMPLETE; T11 ARCHITECTURE.md updated post-D1 lock via T20.
- **D workstream (model stack)**: T16 SA setup COMPLETE; T17 credit-coverage test COMPLETE (3 Gemini models confirmed accessible, Claude requires quota request — deferred); T18 billing-wait SKIPPED per user; T19 stack finalized; T20 ARCHITECTURE.md + prompt v1 references updated (THIS UPDATE, 2026-05-25); T21 B3 re-measurement DEFERRED (credit coverage makes per-call cost a non-blocking concern within window).
- **DB**: chapter_exclusions 1505 rows; tariff_lines.fts_search_text + GIN index live; sections.notes populated; A5 text[] schema in production with trigger validation.
- **Carry-forwards to Phase 4 (captured in T11 ARCHITECTURE.md §12):**
  - Stage 3 rules-filter MUST construct tsquery with OR-token semantics from Triage-extracted head nouns
  - Select schema MUST accept 6-digit subheading return (jasmine architectural fix)
  - Select output MUST require export_policy + policy_condition (closes case 11)
  - 5 borderline multi-destination chapter_exclusions cases need human review (out of 3.5 scope)
  - **Verify V2 same-family correlation** — V1+V2 both run Gemini 3.5 Flash; revisit if Phase 4 eval shows V2 rubber-stamping Select (1-line config swap to Claude or GPT-5.4 mini)
  - Claude on Vertex quota request deferred (HTTP 429 on first call per T17)

---

## D1 LOCKED 2026-05-25

**Decision:** All 5 LLM pipeline stages run on Vertex AI Gemini 3.5 Flash @ region `global`.

| Stage | Model | Region | thinkingBudget | Per-call cost | Credit? |
|---|---|---|---|---|---|
| 1 Triage | gemini-3.5-flash | global | 0 (disabled) | ~$0.00045 | ✅ GenAI Builder |
| 4 Select | gemini-3.5-flash | global | 0 (disabled) | ~$0.0066 | ✅ |
| 5a Verify V1 (rubber-stamp) | gemini-3.5-flash | global | 0 (disabled) | ~$0.00165 | ✅ |
| 5b Verify V2 (antagonistic) | gemini-3.5-flash | global | 0 (disabled) | ~$0.0057 | ✅ (same-family carryforward) |
| 6 Deep-Think | gemini-3.5-flash w/ thinking_level=high | global | high | ~$0.015 | ✅ |

**Endpoint:** `https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0962892937/locations/global/publishers/google/models/gemini-3.5-flash:generateContent`

**Auth:** SA JSON at `backend/.gcp/vertex-sa.json` via `GOOGLE_APPLICATION_CREDENTIALS`. Setup complete per T16.

**Rationale:**
1. **Credit coverage decisive** (T17 finding): three Gemini models confirmed accessible under GenAI Builder credit window; ~$960/mo @ 100K queries fully covered. Claude requires quota request (HTTP 429) — deferred per user direction. Llama/Mistral not on Vertex Garden for this project.
2. **Region `global` mandatory** for Gemini 3.x — NOT `us-central1` (3.x is served only from the global endpoint).
3. **Thinking model behavior**: Gemini 3.x is a thinking model by default. For non-Deep-Think stages, set `generationConfig.thinkingConfig.thinkingBudget = 0` to disable internal reasoning. Deep-Think uses `thinking_level=high`.
4. **Structured outputs**: Vertex Gemini supports `generationConfig.responseSchema` + `responseMimeType: 'application/json'` (the strict-mode equivalent of OpenAI `response_format: json_schema`). Use this for all 5 stages.
5. **Same-family Verify V2 risk accepted as carryforward #8** — Phase 4 eval will measure V2 agreement rate; 1-line swap available if V2 rubber-stamps Select.
6. **B3 5-trace cost-model SUPERSEDED** — credit coverage makes per-call cost a non-blocking concern within window; Phase 4's 168-case eval will produce authoritative cost+correctness measurement on real traffic shape.

**Post-credit-expiry plan:** OSS hybrid documented in `D1-opensource-research.md` is the 2027 cutover.

---

## Session 2 heartbeat reset (2026-05-25)

State at this point:
- Phase 3.5 A workstream EXIT-GATE GREEN (committed)
- Phase 3.5 B workstream COMPLETE (T10-T15 + D1 lock)
- Phase 3.5 D workstream COMPLETE (T16-T20; T21 deferred)
- ARCHITECTURE.md + prompts (triage-v1.md, select-v1.md, verify-router-v1.ts) updated to LOCKED Gemini 3.5 Flash @ Vertex global stack
- progress.md (this file) updated with D1 LOCKED section

Next: coordinator commits Phase 3.5 deliverables on `feat/phase-3-arch-spike`, cuts `feat/phase-4-pipeline-build` off that branch. First Phase 4 task per ARCHITECTURE.md §14: write `backend/src/classifier-v2/index.ts` calling Vertex Gemini 3.5 Flash via SA JSON.

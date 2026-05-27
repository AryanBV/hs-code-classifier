# Phase 4 Continuation Prompt — Session N (2026-05-27 handoff)

Paste this entire block into a NEW Claude Code session at `C:\Export Business\hs-code-classifier` to resume Phase 4 work.

---

I'm resuming the HS Code Classifier Phase 4 rebuild from a prior session that hit ~50% context. State has been documented; please bootstrap from these files in order:

## Step 1 — Read these to load context (in order):
1. `CLAUDE.md` (project root) — refreshed 2026-05-27 with current Phase 4 status section
2. `backend/docs/ARCHITECTURE.md` — locked v2 spec + §14 "Implementation status as of 2026-05-27"
3. `backend/docs/sub-specs/01-verifier-rules.md` through `05-vertex-model-id.md` — 5 sub-specs covering verifier DSL, QGS formula, thinking_level naming, predicate audit, model IDs
4. `C:\Users\ASUS\.claude\projects\C--Export-Business-hs-code-classifier\memory\MEMORY.md` — standing rules including new `feedback_claude_5_hour_limit.md` (shared bucket model)

## Step 2 — Verify state via TaskList
Run `TaskList` to see current task tracker. Expect:
- ~26 tasks total, most completed
- Task #28: O2 RUNNING — `in_progress`, 35-agent rolling-cadence dispatch plan in description
- Task #19: P4.2 — `in_progress`, QGS remains (L3/L4/L5 already complete via tasks #29/#31/#32)
- Tasks #20, #21: P4.3, P4.4 — pending

## Step 3 — Verify DB state
Via Supabase MCP project `waowoznsvaosgcgiivzo`:
- `notes_claims`: 253 rows (50 validated)
- `tariff_line_attributes`: 0 rows (JSON has Ch.01 partial only; not yet ingested — full extraction is Task #28's job)
- `question_templates`: 51 rows

## Step 4 — Confirm vitest baseline
`cd backend && npx vitest run src/classifier-v2/` — expect **302/302 PASS** across L0-L5 (9 test files: L0-normalization, L1-triage, L2-retrieval, L3-rules-filter, L4-select, L5-verifier, predicate-evaluator, source-ref-resolver, tfidf-citation-check).

## Step 5 — Resume work

**Most critical next item:** O2 continuation (Task #28). When user signals limit-reset, dispatch the 35-agent rolling-cadence plan saved on the task. First wave = 6 background agents covering largest chapters first. Hard cap 6 concurrent.

**Then Phase 4.2 QGS** (sub-spec `02-qgs-and-backtrack.md` §A.6 formula) — info-gain computation + template lookup for L1 ASK path.

**Then Phase 4.3:**
- L6 Tiebreak (`gemini-3.1-pro-preview`, `thinking_level=high`)
- L7 Deep-Think (`gemini-3.1-pro-preview` with extended thinking)
- L8 Active Learning (`case_law` write-back; table not yet created — needs migration)
- Rewire `backend/src/api/classify.ts` from legacy classifier to classifier-v2
- Swap `backend/eval/run-eval.ts` from stub to real classifier import

**Then Phase 4.4:** 168-case eval gate (≥85% chapter / ≥75% heading / ≥70% code), prompt iteration, calibration of `CITATION_TFIDF_THRESHOLD` (0.6) and `EMBEDDING_COSINE_FLOOR` (0.55).

## Standing rules (already in memory, but for new-session orientation):
- **ORCHESTRATOR pattern:** dispatch subagents for bulk work; orchestrator decides, never fills own context with reads/edits/inline work
- **MAX 6 concurrent subagents** (hard cap), rolling-cadence dispatch (not strict waves)
- **STOP-AND-SURFACE** on any defect/gap — never paper over or silently shortcut
- Implementer → spec-reviewer → quality-reviewer cycle per task
- **Claude 5-hour limit = SHARED rolling bucket** across orchestrator + all subagents (NOT per-agent); user manages window boundaries
- Build-time = Opus 4.7 via Max sub (free, generous reasoning); Runtime = `gemini-3.5-flash` + `gemini-3.1-pro-preview` via Vertex SA (credit) + Cohere via own `COHERE_API_KEY` (cash, ~$300/mo)
- **NEVER use Anthropic at runtime** (subscription not deployable)
- OpenAI in env but ASK USER FIRST before any runtime use

## Branch & uncommitted state
Currently on `feat/phase-4-pipeline-build` off `feat/phase-3-arch-spike`. Significant uncommitted work:
- Entire `backend/src/classifier-v2/` tree untracked (29 files: 6 layers + 6 layer tests + lib/ + db/ + types.ts + index.ts)
- 5 untracked Prisma migrations under `backend/prisma/migrations/2026052612*`
- 5 untracked sub-specs under `backend/docs/sub-specs/`
- Untracked `backend/data/build-time/` (O1-O5 outputs)
- Untracked `backend/scripts/smoke-classifier-v2.ts`
- Modified: `CLAUDE.md`, `backend/docs/ARCHITECTURE.md`, `backend/docs/SETUP-vertex-service-account.md`, `backend/package.json`, `backend/prompts/{deep-think,select,triage,verify-tiebreak}-v2.md`, `backend/scripts/verify-vertex-sa.ts`, `backend/vitest.config.ts`

No commits made — per user's standing rule "no commit unless explicitly asked". User can choose to commit before resuming OR continue accumulating.

## Quick sanity-check questions to ask user on resume:
1. "Limit reset? Ready to dispatch O2 35-agent plan?"
2. "Want to commit the Phase 4.1 + scaffolding work to a checkpoint commit before O2 dispatches (so any failures during O2 don't muddy the diff)?"
3. "Any change in priorities since handoff, or stay the course on O2 → QGS → P4.3 → P4.4?"

---
End of continuation prompt.

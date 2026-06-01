> ⛔ SUPERSEDED (2026-06-01) — describes PRE-Phase-B state. Current continuation prompt: `C:\Users\ASUS\.claude\plans\CONTINUATION-PROMPT-2026-06-01.md`. Phase A DONE + Phase B Steps 0-2 committed (HEAD `d373e6b`) + 12 frontend decisions LOCKED; next = START THE FRONTEND BUILD.
> SUPERSEDED 2026-06-01 — earlier-phase document, kept for history. CURRENT STATE / authoritative resume: see plans/ROADMAP-2026-06-01.md (then backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md and CLAUDE.md Current Status). v2 brain ~77% OUTRIGHT / ~86% top-3, Cohere decommissioned.
> RUNTIME CORRECTION (2026-06-01): Vertex AI is DISABLED (billing crisis resolved, ~75% waived, ₹17,742.63 remaining, case #71826606). Runtime is now the **Gemini Developer API free tier** (free-tier `GEMINI_API_KEY` in `backend/.env`, key-tested VALID 2026-06-01 — SAME models gemini-3.5-flash / gemini-3.1-pro-preview / gemini-embedding-001, for free). The old "Vertex-only / runtime stays Vertex / ship-arc latency-first / credit-covered / do NOT conserve" framing below is SUPERSEDED. Sequencing is now Phase A cost-efficiency FIRST (Gemini Dev API client → reconnect token meter → caching → free-tier validation), THEN Phase B ship, THEN Phase C frontend. CORRECTNESS > SPEED: never trade accuracy for latency; NO paid API calls without explicit cost-aware user OK.

# Phase 4.2a — Fresh-Session Continuation Prompt

Paste into a NEW Claude Code session at `C:\Export Business\hs-code-classifier`. This starts the IMPLEMENTATION of the v2 classifier spine + eval baseline. All planning is done.

---

I'm implementing **Phase 4.2a — Spine + Instrument + Baseline** of the v2 HS-code classifier. Planning is complete; execute the plan task-by-task with TDD.

## Bootstrap reads (in order)
1. `backend/docs/plans/2026-05-28-phase-4.2a-spine-baseline.md` — **THE plan** (bite-sized TDD tasks 1–15). This is what you execute.
2. `backend/docs/PHASE-4.2-4.4-BUILD-DESIGN.md` — the design + rationale (why measurement-driven, the escalation seam, library choices).
3. `backend/docs/ARCHITECTURE.md` §2 (pipeline), §3 (per-layer I/O), §7 (failure modes), §11 (eval — CORRECTED to `src/eval/`).
4. `backend/src/classifier-v2/types.ts` — the full pipeline contract (`PipelineRunState`, `ClassifyResult`, every layer I/O). The orchestrator wires these.
5. The six layer files `backend/src/classifier-v2/layers/L0..L5*.ts` — exact entry signatures + how to construct each layer's input (esp. **L2's input type**, which is not in types.ts).
6. `backend/src/eval/runner.ts` + `scorer.ts` + `types.ts`; `backend/src/classifier/types.ts` (`ClassificationResult`).
7. Memory `MEMORY.md` — esp. **quality-first-best-in-class**, **root-cause-fix-not-patch**, **orchestrator-not-worker**, **stop-and-surface**, **claude-code-capabilities-2026**.

## State (verified 2026-05-28)
- **L0–L5 built + tested (302/302 vitest).** Orchestrator `classifier-v2/index.ts` is a STUB that throws — this is the keystone you build first.
- **O2 DONE & INGESTED:** `tariff_line_attributes` has **12,406 rows** (MCP-verified). L4/L5 can consume them now.
- **Eval canonical = `backend/src/eval/`** (~386-case master suite, real-classifier-wired, with scorer/compare/analyze-failures/measure-brain-chapters/gt-fix). **`backend/eval/` (168, stub) is DEPRECATED** (`backend/eval/DEPRECATED.md`) — do NOT use it.
- L6/L7/L8/QGS = not built; built in LATER plans, prioritized by THIS plan's baseline failure map.

## Build approach (do not deviate)
- **Measurement-driven, observable-incremental.** Build the real orchestrator (permanent, with `BaselineEscalation` + ASK-via-L1 as the minimal seam fills) + wire the eval + instrument FIRST, then read the baseline failure map, THEN build L6/L7/QGS/L8 in the order the data dictates. Nothing is throwaway.
- **Do NOT tune prompts in 4.2a.** Prompt iteration is Phase 4.3, driven by this baseline.

## Execution method (get the best out of Opus 4.7 + Claude Code)
- Use **superpowers:subagent-driven-development** (recommended) — fresh subagent per task + two-stage review — or **executing-plans** for batch.
- **TDD**: failing test first, then minimal impl, then green, then commit (the plan's steps are already in this shape).
- **4.2a is MOSTLY SEQUENTIAL** — the spine builds in dependency order (orchestrator Task 6→7→8…). Do NOT over-parallelize dependent tasks. Heavy parallelism (parallel Opus subagents in git worktrees, concurrency up to ~10) applies to the LATER plans (L6/L7/QGS are independent once the seams exist) — not here.
- **Adversarial review before locking** each layer/prompt (independent subagent; self-reports not trusted).
- **Verify each layer's REAL interface** by reading the layer file before wiring it — `types.ts` is the contract, but the plan has explicit read-then-implement lookups (L2's input type; the L1/L4 parse site for Zod; the system-error result shape). Confirm, don't assume.
- **Root-cause fixes only** — never a per-case patch to make the eval green (false pass). Use **systematic-debugging** on non-obvious failures; the `classify:trace` CLI (plan Task 14) is your debugging tool.
- Act as **orchestrator** — delegate bulk impl to subagents; keep your own context lean.

## Critical gotchas (from the planning session)
- v2 `ClassifyResult.classification`: `self_confidence` is an ENUM (`HIGH/MEDIUM/LOW`), `citation` is an OBJECT, `reasoning_chain`/`alternatives_considered` are ARRAYS. The eval adapter maps these (plan Task 2).
- The DB connection for scripts uses **`DATABASE_URL`** (pooled Supavisor, 6543) — `DIRECT_URL` (5432) fails auth on this project.
- node-postgres serializes JS arrays as Postgres arrays — jsonb columns need `JSON.stringify` (already handled in the O2 ingest script; relevant if you touch DB writes).

## First actions
1. Read the bootstrap docs above. **Ignore the older `backend/data/phase-3.5-prompts/PHASE-4-RESUME-PROMPT.md`** — it predates implementation (says "cut the branch", "max 6 concurrent"); we are ALREADY on `feat/phase-4-pipeline-build` and the concurrency cap is ~10. THIS prompt + the plan are current.
2. `git status` — the tree was clean as of the planning session's last commit (`4190f91`). No new branch needed.
3. **Sanity-check the eval gold BEFORE trusting the baseline as a gate:** the 386-case master suite's gold answers were not personally audited in planning. Spot-check ~15-20 cases (do the expected codes exist in `tariff_lines`? are the "correct" answers defensible?). If gold is shaky on hard cases, fix it (extend `gt-fix/`) before treating the % as truth — a wrong gold makes a correct classifier look wrong.
4. Begin plan Task 1. Run the **full-pipeline smoke (Task 13)** early once the orchestrator exists — it surfaces real-API reality the mocked tests can't.
5. End state of 4.2a: a runnable `classify()`, the eval wired to it, and `backend/docs/PHASE-4.2a-BASELINE.md` with the first real accuracy numbers + a prioritized failure map.

## Uncommitted work from the planning session (commit first if not done)
The prior session left (in the working tree, branch `feat/phase-4-pipeline-build`): the O2 finale (8 `BIG→SC` renames, ingest-script fixes, F5 data normalizations, `FINAL-AUDIT-REPORT.md`, audit scripts), and the Phase 4.2-4.4 docs (this continuation prompt, the design spec, the plan, ARCHITECTURE/CLAUDE.md/eval-deprecation edits). Verify with `git status`; commit as a clean checkpoint before implementing.

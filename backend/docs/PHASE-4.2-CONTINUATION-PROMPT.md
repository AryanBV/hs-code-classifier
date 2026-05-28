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
- Independent layers later (L6/L7/QGS) → **parallel Opus subagents in git worktrees** + **adversarial review before locking** each.
- **Root-cause fixes only** — never a per-case patch to make the eval green (false pass). Use **systematic-debugging** on non-obvious failures; the `classify:trace` CLI (plan Task 14) is your debugging tool.
- Act as **orchestrator** — delegate bulk impl to subagents; keep your own context lean.

## Critical gotchas (from the planning session)
- v2 `ClassifyResult.classification`: `self_confidence` is an ENUM (`HIGH/MEDIUM/LOW`), `citation` is an OBJECT, `reasoning_chain`/`alternatives_considered` are ARRAYS. The eval adapter maps these (plan Task 2).
- The DB connection for scripts uses **`DATABASE_URL`** (pooled Supavisor, 6543) — `DIRECT_URL` (5432) fails auth on this project.
- node-postgres serializes JS arrays as Postgres arrays — jsonb columns need `JSON.stringify` (already handled in the O2 ingest script; relevant if you touch DB writes).

## First actions
1. Read the bootstrap docs above.
2. Confirm git state / commit any pending planning work if not already committed (see below).
3. Begin plan Task 1. Run the **full-pipeline smoke (Task 13)** early-ish once the orchestrator exists — it surfaces real-API reality the mocked tests can't.
4. End state of 4.2a: a runnable `classify()`, the eval wired to it, and `backend/docs/PHASE-4.2a-BASELINE.md` with the first real accuracy numbers + failure map.

## Uncommitted work from the planning session (commit first if not done)
The prior session left (in the working tree, branch `feat/phase-4-pipeline-build`): the O2 finale (8 `BIG→SC` renames, ingest-script fixes, F5 data normalizations, `FINAL-AUDIT-REPORT.md`, audit scripts), and the Phase 4.2-4.4 docs (this continuation prompt, the design spec, the plan, ARCHITECTURE/CLAUDE.md/eval-deprecation edits). Verify with `git status`; commit as a clean checkpoint before implementing.

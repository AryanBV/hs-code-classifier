# ⚠️ DEPRECATED — Phase-1 stub eval (frozen 2026-05-28)

This directory (`backend/eval/`) is a **frozen Phase-1 artifact**. Do NOT use it for Phase 4+ evaluation.

- `run-eval.ts` — a skeleton runner that calls `classify-stub.ts` (returns `null` for every query). It exists only to prove the harness shape in Phase 1.
- `cases.json` — a static **168-case** snapshot.
- `baseline-stub.json` — the stub baseline output.

## Use instead: `backend/src/eval/`

The **canonical, active** eval system is `backend/src/eval/` (see `ARCHITECTURE.md` §11):
- `runner.ts` (`npm run eval` / `eval:quick`) → `test-suites/master-suite.ts` (~386 cases) wired to the **real** classifier.
- `scorer.ts`, `compare.ts`, `analyze-failures.ts`, `measure-brain-chapters.ts`, `gt-fix/`.

## Why this is kept (not deleted)

The 168 `cases.json` entries may contain queries not present in the 386-case master suite. They are retained **only** as a candidate source to mine/merge during eval-hardening (a deferred, post-baseline task). Once merged (or confirmed redundant), this directory can be removed.

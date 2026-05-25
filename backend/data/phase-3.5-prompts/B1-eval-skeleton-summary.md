# B1 — Phase 1 Eval Skeleton Runner — Summary

**Task:** T12 / B1. Build a stub-mode eval runner that walks all 168 Phase 1
cases, calls a `classifyStub()` that returns `null`, and writes a
`baseline-stub.json` report. Phase 4 will swap the stub for the real
classifier without touching the runner.

**Status:** Complete and verified. All cross-checks pass.

## Deliverables

| File | Purpose |
|---|---|
| `backend/eval/cases.json` | 168 Phase 1 eval cases, copied from `feat/phase-1-eval-harness:backend/src/eval/cases.json` (UTF-8, no BOM, 2746 lines incl. trailing newline) |
| `backend/eval/classify-stub.ts` | `classifyStub()` returns null; exports the `EvalResult` interface that Phase 4 must match |
| `backend/eval/run-eval.ts` | Runner — both a CLI (`npx tsx eval/run-eval.ts`) and a programmatic API (`import { runEval } from './eval/run-eval'`) |
| `backend/eval/baseline-stub.json` | Verified output of the canonical stub run (4 ms total, 168 cases, 0 errors, 100% predicted-null) |

## Cross-checks — all green

- **168 cases verified** in `cases.json` (matches `meta.total_cases`).
- **Strict TypeScript** — `npx tsc --noEmit --strict --noUncheckedIndexedAccess` passes; no `any`.
- **Performance budget** — full 168-case run finishes in ~4 ms (budget <500 ms).
- **Importable** — `import { runEval } from './eval/run-eval'` works (CLI runs only when `require.main === module`).
- **Re-runnable / idempotent** — output file is overwritten atomically; no DB or external state.
- **No new dependencies** — uses only `fs`, `path` from Node stdlib.
- **Error handling** — per-case `try/catch` increments an `errors` counter but never aborts the run; fatal I/O errors throw and exit 1.

## Output shape (verified)

```json
{
  "meta": { "runner_version": "1.0", "ran_at": "<ISO>", "stub_mode": true, "total_cases": 168 },
  "metrics": {
    "chapter_match": "0/168",
    "heading_match": "0/168",
    "subheading_match": "0/168",
    "code_match": "0/168",
    "predicted_null_pct": "100%"
  },
  "per_case": [
    { "case_id": "case-001", "query": "...", "expected": { "chapter": "03", "heading": "0304", "code": "0306.17.50" }, "predicted": null, "elapsed_ms": 0, "error": null },
    ...
  ]
}
```

## Notes for the Phase 4 hand-off

1. **Drop-in swap point** — only `classifyStub` needs replacing. The runner is
   already coded against the `EvalResult` shape, so as long as the real
   classifier's return type is assignable to `EvalResult | null`, no runner
   changes are needed.
2. **Match expected-field semantics** — `selected_code` is what gets graded.
   The runner does graceful prefix-match scoring at chapter / heading /
   subheading / 8-digit granularities, so a 6-digit refusal result that sets
   `selected_code = "8708.30"` still scores chapter + heading + subheading
   matches (the canonical 8-digit comparison fails on it, which is the intended
   behaviour — six-digit is not a code match).
3. **`expected_refusal` / `expected_routing` are not yet scored** — Phase 4
   metrics should add ask-vs-classify routing accuracy. Hooks are ready (every
   case carries the expected fields verbatim in `per_case[].expected`'s sibling
   case object — see `EvalCase` in the runner) — extend `BaselineOutput.metrics`
   when the real classifier exposes its routing decision.
4. **TODO comment** in `classify-stub.ts` points at the planned Phase 4 entry
   `backend/src/classifier-v2/index.ts` per the B5/B6/B7 prompts.

## How to run

```bash
cd backend && npx tsx eval/run-eval.ts
# → writes backend/eval/baseline-stub.json, exits 0
```

Programmatic:
```ts
import { runEval } from './eval/run-eval';
const { output, totalRuntimeMs, errors } = await runEval({ silent: true });
```

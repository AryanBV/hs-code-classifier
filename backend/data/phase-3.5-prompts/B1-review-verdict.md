# B1 Eval Skeleton Review

**Reviewer:** fresh-context review session (Opus 4.7, 1M ctx)
**Date:** 2026-05-25
**Inputs:** `backend/eval/{run-eval.ts, classify-stub.ts, cases.json, baseline-stub.json}` and `backend/data/phase-3.5-prompts/B1-eval-skeleton-summary.md`

## Spec compliance

- [PASS] **168 cases in `cases.json`** — verified via `node -e "require('./eval/cases.json').cases.length"` → `168`; matches `meta.total_cases: 168`.
- [PASS] **Iterates all 168 + per-case error handling** — `for (let i = 0; i < cases.length; i++)` loop with `try/catch` around `classifyStub(c.query)`. Errors increment `errorCount`, store `error: errorMsg` on the per-case record, never abort the run. Verified: 0 errors on the canonical run.
- [PASS] **Computes all required metrics** — chapter_match, heading_match, subheading_match, code_match (8-digit), and predicted_null_pct are all in the output. Chapter / heading / subheading / 8-digit are computed via independent prefix-extraction helpers (`chapterOf`, `headingOf`, `subheadingOf`, `canonical8`), each correctly handling NULL/short/long inputs.
- [PASS] **`baseline-stub.json` structure matches spec** — `meta` (runner_version, ran_at, stub_mode, total_cases) + `metrics` (5 keys) + `per_case` (168 entries with case_id, query, expected{chapter,heading,code}, predicted, elapsed_ms, error). Verified on disk.
- [PASS] **Progress indicator on stdout** — `processed N/168` printed every 10 cases via `process.stdout.write`. Confirmed in re-run.
- [PASS] **Exit codes** — `main()` calls `process.exit(0)` on success and `process.exit(1)` after `console.error('FATAL:', ...)` in the catch. Verified: missing cases.json throws `Error('cases.json not found at ...')` cleanly.
- [PASS] **CLI + programmatic API both exported** — `export async function runEval(options)` for import; `if (require.main === module) void main()` guard ensures CLI side effects only fire when invoked directly. Verified the `runEval()` import path works (negative-path test imported it cleanly).
- [PASS] **Strict TypeScript, no `any`** — `npx tsc --noEmit --strict --noUncheckedIndexedAccess eval/run-eval.ts eval/classify-stub.ts` passes silently. Grep confirms zero `: any` occurrences; the lone `[k: string]: unknown` in `CasesFile.meta` is the correct strict-mode escape hatch for forward-compatibility.
- [PASS] **No new dependencies** — only `fs` and `path` from Node stdlib are imported. `package.json` untouched.
- [PASS] **Idempotent** — `fs.writeFileSync(outputPath, ...)` overwrites cleanly; re-running produces a fresh `ran_at` timestamp and otherwise identical content. Verified by re-running the runner during this review.

## Quality

- [PASS] **Re-run works** — `cd backend && npx tsx eval/run-eval.ts` completed in 4 ms, all 168 cases processed, 0 errors, 100% predicted_null. Output JSON written and well-formed.
- [PASS] **`baseline-stub.json` shape verified** against the summary spec — keys, types, and array length all match.
- [PASS] **`classify-stub.ts` is a clean stub** — returns `null` unconditionally, has a clear `TODO(Phase 4):` comment pointing to `backend/src/classifier-v2/index.ts` and referencing the B5/B6/B7 prompts. Async signature matches a future real classifier. Optional `_previousAnswers` parameter is in place for the ask/answer flow.
- [PASS] **Style matches existing `backend/scripts/*.ts`** — block-comment header with task ID, `Run:` line, exit-code legend; `dotenv` not imported (correct, stub needs no env); helper extraction matches the codebase pattern.
- [PASS] **Missing-cases.json handling** — fail-fast `if (!fs.existsSync(casesPath)) throw new Error('cases.json not found at ...')` before the JSON parse. Caught by `main()`, logged to stderr, exits 1. Verified live.
- [PASS] **Type safety** — `EvalCase`, `CasesFile`, `PerCaseResult`, `BaselineOutput` are all explicit interfaces. `EvalResult` lives in `classify-stub.ts` so it ships with the stub for Phase 4 to extend. `if (!c) continue;` defensive guard is correct given `noUncheckedIndexedAccess`.
- [PASS] **Future-proof metric computation** — `headingOf` / `subheadingOf` / `chapterOf` derive directly from the predicted `selected_code` string, not from any auxiliary field. They prefix-match correctly against the expected fields, which means:
  - 8-digit prediction `"8708.30.00"` → matches chapter `"87"` + heading `"8708"` + subheading `"8708.30"` + code `"8708.30.00"` against an 8-digit expected. Correct.
  - 6-digit prediction `"8708.30"` → matches chapter + heading + subheading; fails code_match (since `canonical8("8708.30")` returns `null` for <8 digits). This is the **intended** behaviour per the B1 summary's note 2.
  - `null` prediction → bypasses all match counters, increments `predicted_null_pct`. Correct.

## Phase 4 hand-off

- **6-digit subheading return: handled?** — **YES.** `EvalResult.selected_code` is `string | null` and the runner's `subheadingOf` accepts both `"NNNN.NN.NN"` (slices to 7 chars) and `"NNNN.NN"` (pass-through). The `selected_code_is_six_digit?: boolean` flag is also pre-declared in the `EvalResult` interface, so Phase 4 doesn't need to renegotiate the contract.
- **Refusal: handled?** — **YES.** `classifyStub` returning `null` already exercises the refusal code path in the runner — `if (predicted === null) predictedNullCount += 1` skips all match-counting. Phase 4's `selectCode → null` flows through identically.
- **`export_policy` + `policy_condition` hooks present?** — **YES.** Both are optional fields on `EvalResult` (`export_policy?: string | null; policy_condition?: string | null;`), pre-declared in `classify-stub.ts`. The runner currently doesn't read them (correctly — they're not scored), but they will be carried verbatim through `per_case[].predicted` to the output JSON when Phase 4 starts populating them, ready for downstream analysis.
- **`expected_refusal` / `expected_routing` scoring: defer or extend now?** — **DEFER.** The fields are read into `EvalCase` and present in `cases.json`. The B1 implementer flagged them as a Phase 4 hook. Three reasons defer is correct here:
  1. Real scoring requires the classifier to emit a `routing` decision (`classify` vs `ask`); without that, there is nothing to compare against. Phase 4 will add it.
  2. Adding the scoring now would require either a fake routing field on the stub or a stub-mode bypass — both add code that must be ripped out later.
  3. The current per-case JSON already records what's expected; nothing is lost.
  Recommended Phase 4 follow-up: add `routing_match: "N/168"` and `refusal_match: "N/168"` to `metrics` once the real classifier returns routing info. The change is a ~10-line extension, not a refactor.

## Critical issues

**None.** Spec is fully satisfied; the runner is correct, fast, idempotent, type-safe, and Phase-4-ready.

Minor non-blocking observations (do not gate approval):
- `RUNNER_VERSION = '1.0'` is hardcoded — fine for now. Bump to `'1.1'` when Phase 4 adds routing/refusal scoring so old baselines remain identifiable.
- `predicted_null_pct` is stored as a stringified percentage (`"100%"`) rather than a number — consistent with other `metrics.*` ratio-strings, so this is a style choice, not a defect. Phase 4 may want to add a numeric mirror for downstream diff scripts.
- `expected_routing` and `expected_refusal` are not surfaced in `per_case[].expected` (which only carries chapter/heading/code). When Phase 4 wires them in, also include them in the per-case expected block for easier debugging without round-tripping through `cases.json`.

## Verdict

- **B1 implementation: APPROVE**
- **Recommended next step:** Mark T12 complete. Move on to T13 (B2 Cohere Rerank live test) and T14 (B3 cost model). When Phase 4 lands, the only changes needed in this file are: (a) swap the stub import for the real classifier, (b) extend `BaselineOutput.metrics` with `routing_match` and `refusal_match`, (c) bump `RUNNER_VERSION` to `1.1`.

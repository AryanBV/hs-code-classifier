# P2 Gate #1 — L4 "Other-by-Elimination" Reasoning Mode (resolved blueprint)

**Status:** Ready to implement (after GT-freeze + clean r9 baseline). Confirmed #1 lever: 50% of leaf errors (30 cases), 60.6% of confident-wrong are leaf-sibling.
**Discipline:** runtime change → must pass the three-sided gate (McNemar target↑ AND confident-wrong flat/down + zero unsigned regressions AND latency/cost in budget) on the clean GT baseline before commit.

## Resolved design decisions
- **ODD-1:** `eliminated_siblings` stays a nullable field in the response schema (Option A). MV-11 + the existing L4 repair loop enforce completeness. No per-call dynamic schema (keeps prompt cache).
- **ODD-2:** MV-11 re-derives sibling groups inside `verify()` using the SAME pure `computeSiblingDiscriminators(filtered_candidates, tlaRaw, descMap)` + a ≤5-row `SELECT code, description FROM tariff_lines WHERE code = ANY($1)`. Deterministic (same fn + inputs ⇒ no drift), self-contained, no orchestrator change this gate.
- **ODD-3:** EC013 (polyester yarn "textured") is NOT a gate-1 target — likely retrieval/ambiguity/GT. Do not overfit.

## Measurement protocol (no runtime flag — git-based A/B)
1. GT-freeze committed first (user-signed-off corrections) → run **r9** = current HEAD code on corrected GT (clean baseline).
2. Implement gate-1 (this blueprint) in an **isolated worktree** so it can run in parallel with r9 without disturbing the live source r9 reads.
3. Merge → tsc + full tests → run **r10** = gate-1 code on corrected GT.
4. **Gate:** McNemar(r9, r10) on the Other-split subset shows target↑; confident-wrong count flat/down; per-case regression-guard shows no unsigned correct→wrong flips; latency/cost within budget. Commit on pass; revert on fail.

## Detection — `isOtherLeaf(description)` (new pure fn in L4-select.ts, exported via `_internal`)
Residual "Other" iff trimmed-lowercased description is exactly `other`, or starts with `other,` or `other ` — EXCEPT `other than …` (that's a specific positive description, NOT residual: check the word after "other " is not "than"). Unit-test the full truth table incl. "Other than cotton"→false, "Other yarn"→true.

## Types (types.ts)
- Extend `SiblingDiscriminatorGroup` with `has_other_leaf: boolean`, `other_leaf_code: string | null`, `enumerated_codes: string[]`.
- New `EliminatedSibling { code: string; elimination_reason: string }`.
- Add `eliminated_siblings: EliminatedSibling[] | null` to `SelectOutput`. Also: `SelectOutputZ` (schemas.ts), `isSelectOutput()` structural check, and `syntheticRefuse()` must set it null.

## computeSiblingDiscriminators (L4-select.ts)
Add optional 3rd param `candidateDescriptions: Record<string,string> = {}` (default ⇒ `has_other_leaf:false`, backward-compatible). Per group: detect the Other leaf via `isOtherLeaf`, set the three new fields. Wire `descriptionsByCode` from the hydrated candidate rows in `gatherSelectContext`.

## Reasoning rule (select-v2.md) — Other-by-elimination procedure (replaces Step 3a item 3)
When the sibling group has `has_other_leaf:true`: (a) test EACH enumerated sibling's specific criterion against query+attributes; (b) pick the enumerated sibling if its criteria are met (`eliminated_siblings=null`); (c) pick "Other" ONLY when EVERY enumerated sibling is positively eliminated, and then populate `eliminated_siblings[]` one-per-enumerated-code with a specific reason citing the sibling's code; (d) never default to "Other" on ambiguity — lower `self_confidence` and pick the best-supported sibling instead. Add a matching reminder bullet to the USER TEMPLATE. Bump prompt-cache key.

## MV-11 — `other_by_elimination_completeness` (L5-verifier.ts; two-sided)
- SKIP when no candidate sibling group has `has_other_leaf` (⇒ non-Other cases untouched).
- **Side A** selected == other_leaf_code: FAIL `OTHER_WITHOUT_ELIMINATION` if `eliminated_siblings` null or missing any enumerated code; FAIL `ELIMINATION_MISSING_CODE_REF` if a reason doesn't reference its sibling code; else PASS.
- **Side B** selected ∈ enumerated_codes: PASS if `eliminated_siblings===null`; FAIL `ELIMINATION_FIELD_SPURIOUS` otherwise.
- Register in `RULE_META` + the `runRule` sequence; failures route to the existing L4 repair loop.

## Scoping / no-regression
Change is gated by `has_other_leaf` ⇒ non-Other candidate sets are byte-identical (MV-11 skips, prompt block inert because the SIBLING_DISCRIMINATORS JSON carries no Other group). Prompt delta ≈ +360 system tokens; per-Other-case output +≤240 tokens. Vertex `responseSchema` must add the nullable `eliminated_siblings` (type `["array","null"]`).

## Tests
- `isOtherLeaf` truth table; `computeSiblingDiscriminators` Other-detection (5 cases incl. backward-compat).
- MV-11: 7 cases (SKIP; PASS Other-complete; FAIL null; FAIL missing-sibling; FAIL missing-code-ref; PASS enumerated+null; FAIL spurious).
- L4 scenario tests for TC015 / EC020 / TC116 (specific now chosen over Other).
- Keep all existing v2 + eval tests green; tsc clean.

## Target / at-risk caseIds for the gate
- **Should fix (Tier-1, "Other" wrongly chosen over a matching specific):** TC015, EC020, TC116, + the rest of the 30-case Other cluster from r8 forensics.
- **At-risk (gold IS "Other" with a specific sibling present):** any frozen-386 case where the correct answer is the residual — must still produce valid `eliminated_siblings[]` (repair loop is the backstop). Watch these in the regression-guard.

Full reasoning: workflow design agent output (run a69f0620). P1 corpus + r8 forensics in `2026-05-29-ultimate-brain-program-v2.md` §0.5.

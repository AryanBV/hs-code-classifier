# Sibling-ASK Elicitation Lever — Build Blueprint (2026-05-29)

**Why:** ~50% of leaf-sibling selection errors are genuine query-underspecification — the deciding attribute exists in `tariff_line_attributes` but NOT in the exporter's query, so neither a stronger model (Pro tied with Flash) nor more candidates can guess it. The right behavior: ask ONE targeted question (options from the candidate siblings' TLA values), the exporter answers, resolve to the right leaf. Reuses QGS + computeSiblingDiscriminators. Runtime = Vertex (NO Cohere — ignore any Cohere references).

## Resolved open decisions
- Scope: **subheading-only** siblings (same 6-digit) first; extend to heading later if measured-needed.
- Pin-check: **token-overlap** only (defer the confidence-gated variant).
- Env gate: `SIBLING_ASK_ENABLED` default **false** (opt-in for measurement; flip after the gate passes).
- India-specific: **backend label suffix** for now (frontend badge later).
- Duplicate TLA fetch: **accept** for now (small indexed lookup; DB fast).

## Trigger (after L3, before L4) — fire ASK iff ALL hold:
- **S1** sibling group present: `computeSiblingDiscriminators(filtered_candidates, tla)` has a group with ≥2 codes + ≥1 differing field.
- **S2** attribute NOT pinned by query: the top-IG discriminating attribute is not determinable from the query (see `isAttributePinnedByQuery`).
- **S3** L4 not already decisive: `selectQGSBatch(...)` returns non-null (it already returns null on indistinguishable/<2-option sets — the built-in over-ask guard).
Also: skip if `qBudgetRemaining===0` (shared Q-budget with triage-ASK) or `candidates<2`. The trigger NEVER throws — any internal error returns null → L4 runs (graceful degrade).

## `isAttributePinnedByQuery(attributeKey, extractedAttributes, rawTokens)` (new pure fn, `lib/sibling-ask-trigger.ts`)
First-match-wins: (1) extracted value null/empty → NOT pinned; (2) value fails `isSpecificValue()` (bare generic) → NOT pinned; (3) value has NO token overlap with `rawTokens` (i.e. L1 *inferred* it, the user didn't say it) → NOT pinned; (4) else → pinned (don't ask). The token-overlap check is the crux: L1 infers attributes from context, so a specific-but-inferred value must still trigger ASK. Export `isSpecificValue`/`isBareNonSpecificWord` from `L1-triage.ts` for reuse.

## Reuse (no new LLM): `computeSiblingDiscriminators` (promote from `_internal` to public export) + `selectQGSBatch` (QGS-generator) + `ClarifyingQuestion`/`Batch` types + `continueWithAnswers` + the answer-simulator + the EFFECTIVE/ask-recovery metrics (all already key on `actual_routing==='ask'`, so they pick up sibling-ASK automatically).

## India-specific opt-in (audit: these leaves GENERATE errors when defaulted)
- In the question options: suffix any india_specific-only option label with "(India-specific designation)". Don't suppress it.
- The substantive rule lives in `select-v2.md` (L4 prompt): never SELECT an `india_specific:true` leaf unless the answer/`india_specific_note` affirmatively confirms it; default to the common/residual leaf otherwise. (Handloom/hand-crocheted/ballistic/seed-quality.)

## Over-ask guardrails
G1 QGS null-on-indistinguishable (built). G2 the pin-check. G3 ask-rate ceiling ≤15-20% (monitor `routing.confusion_matrix.classify_as_ask`; tune `QGS_MARGINAL_IG_FLOOR` 0.3→0.5 if breached). G4 Q-budget gate (built).

## Build sequence (TDD; keep all tests green; env-gated so default behavior is byte-identical)
- **Phase A** (no behavior change): export `isSpecificValue`/`isBareNonSpecificWord` from L1-triage; promote `computeSiblingDiscriminators` to a public export from L4-select; create `lib/sibling-ask-trigger.ts` (`isAttributePinnedByQuery`) + unit tests (null/empty/generic→not-pinned; specific+token-overlap→pinned; specific-but-inferred-no-overlap→not-pinned).
- **Phase B** (types/trace): add `'SIBLING-ASK'` to `PipelineTraceEvent['layer']`; add optional `trigger?:'triage'|'sibling'` to `ClarifyingQuestion`; add optional `ask_trigger?` to `EvalDetail.ask_recovery_attempt`.
- **Phase C** (orchestrator, env-gated): `checkSiblingAskTrigger(...)` in `index.ts`, inserted between the zero-candidate guard and the L4 call; returns `ClassifyResult|null`; gated by `SIBLING_ASK_ENABLED` (default false → returns null → no behavior change). Set `question.trigger='sibling'`, record `SIBLING-ASK` trace step. Unit-test the control-flow (mock trigger → ASK vs null).
- **Phase D** (eval wiring + prompt): populate `ask_trigger` in runner from `raw.question?.trigger`; add `sibling_ask_count` + `sibling_ask_recoverability_rate` to `buildEndToEndMetrics`; add the india-specific opt-in instruction to `select-v2.md`.

## Measurement (after GT cleanup gives a clean baseline)
A/B via the env gate: run `--simulate-answers` full-386 with `SIBLING_ASK_ENABLED` off vs on; compare via `compare.ts`. Three-sided milestone gate: `effective_code` up materially AND `classify_as_ask ≤ 0.20` AND `sibling_ask_recoverability_rate ≥ 0.75` (the questions we ask must be answerable from gold TLA). Honest framing: OUTRIGHT may dip (cases move classify→ask), EFFECTIVE must rise — net must be positive. Targeted subset = the ~30 info-gap caseIds (via `--ids`).

## Files
New: `lib/sibling-ask-trigger.ts` (+ test). Modify: `L1-triage.ts` (exports), `L4-select.ts` (export computeSiblingDiscriminators + a TLA-fetch accessor), `index.ts` (trigger + env gate), `types.ts` (trace layer + trigger field), `eval/types.ts` (ask_trigger), `eval/runner.ts` (populate + metrics), `prompts/select-v2.md` (india opt-in). 

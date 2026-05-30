## ▶ START HERE — NEXT SESSION (2026-05-30)

**This block is the definitive, self-contained entry point. Read it top-to-bottom, then proceed. Everything below it is supporting detail.**

**ONE-LINE STATE:** v2 brain ~77% OUTRIGHT 8-digit / ~86% top-3 / chapter ~89% / heading ~86% / confident-wrong ~64; runtime Vertex-only; branch `feat/phase-4-pipeline-build`; tree clean; 855 tests pass.

**CHOSEN PATH (user-confirmed 2026-05-30): SHIP, LATENCY-FIRST.** IMMEDIATE FIRST ACTION next session:

#### LATENCY PROFILE — DONE (2026-05-30) — do NOT re-profile; act on it
- **DOMINANT cost = the L4 Select REPAIR LOOP.** 0-repair cases median **19.9s** vs 3-repair median **49.3s**; each repair = another ~13–18s L4 call (full prompt re-sent + a growing `VERIFIER_FAILURES` block). Fixed ~**12s L2 tax on EVERY request** (Vertex embed + Gemini-Flash rerank). L1 triage ~2–4s; L5 verify cheap (1–5s).
- **WASTE: 43% of classify cases (141/326) exhaust all 3 repairs, and 140/141 STILL fail the verifier** (escalation_path ends `L6:would_escalate` → they classify the best Select anyway). So repairs **#2 and #3 add the largest latency (+15–18s each) for ZERO recovery.** The 3 r19 "timeout errors" (S5-AUTO-011/016/021) are repair-loop cases exceeding the 90s eval cap.

**REVISED FIRST ACTION (ship latency-first):**
1. **BUILD an ADAPTIVE repair loop.** Default-cap repairs at **1**, AND short-circuit/bail to escalation the moment a repair makes **no progress** (same failing `selected_code` OR same failed-rule signature as the prior iteration). First **confirm the recovery distribution** from `eval-results/vertex-m0-r19-top3-sim.json` `details[].escalation_path` (count cases whose final verifier-PASS occurred at repair0 vs repair1 vs repair2/3) to choose **cap=1 vs 2**. Repair-loop control lives in `backend/src/classifier-v2/index.ts` (the `for i<3` loop ~`index.ts:840` + `onVerifierExhausted`). **THREE-SIDED GATE:** p95 latency DOWN **AND** OUTRIGHT 8-digit + confident-wrong NOT regressed (run **r20 vs r19/r18**; the ORCHESTRATOR runs the eval itself).
2. **STREAM the HTTP response** (perceived-UX, zero accuracy risk) in `backend/src/api/classify.ts` + frontend.
3. **Cutover** — turn `USE_V2_CLASSIFIER` on, staged.
4. **Frontend rebuild** — `frontend/src/lib/hooks/use-wizard.ts`: read `alternatives`/top-3; handle `responseType:refused`; multi-turn `/answer` with `{questionId, answerId}`; address the ~39-62s latency UX.
5. **Publish + trade-intelligence.**

**Secondary latency lever (medium risk, A/B only):** trim the ~17K-token `select-v2.md` base prompt / lower `maxOutputTokens` (`L4-select.ts:847-893`, `thinking_level=low`) — risks hurting hard sibling cases; do **NOT** do blindly.

**TASK ROADMAP** (the in-session TaskList does NOT carry to a fresh session — captured here):
- **DONE:** gold-R4 · MV-03 · bad-gold-R5 · calibrated-classify (off) · L2 `direct_leaf` recall · residual-leaf-floor · v2 API adapter + flag · top-3 instrumentation.
- **ACTIVE:** ship arc (latency-first).
- **DEFERRED brain (real-usage-driven):**
  - synonym / heading recall — TC012 hose → 8708 vs 4009; EC008 galvanized → 7210 vs 7208/9.
  - DB053 notes_claims definition-note fix — id 20/21 EXISTS-on-definition → SKIP; BROAD textile blast radius, gate carefully.
  - confidence calibration — needs a new signal (rerank-margin / entropy).
  - fine-tuned domain reranker — the real ceiling-raiser.
- **USER-GATED gold-review queue (NOT applied):** DB061 (Ensembles unwinnable) · S5-AMB-005 (car-seat-cover .20 vs .90) · DB200 (malformed query + L0 truncation).

**KEY COMMANDS:**
- eval = `npx tsx --require dotenv/config src/eval/runner.ts --suite master --simulate-answers --run-id X` (subset: add `--ids c1,c2`)
- compare = `npx tsx src/eval/compare.ts before.json after.json`
- tests = `npx vitest run src/classifier-v2 src/eval`
- tsc = `npx tsc --noEmit`
- New eval metric: `top_k_code_accuracy`; per-case `candidate_codes` field.

**KEY COMMITS (`feat/phase-4-pipeline-build`):** gold-R4 `6d9afd9` · MV-03 `881ef2e` · bad-gold-R5 `168ac64` · calibrated-classify `8a189ef` · L2 recall `d4cfb44` · API adapter+flag `cd7a5a3` · residual-leaf-floor `7629a2b` · top-3 instrumentation `ec34ee6`. Read `CLAUDE.md` (Current Status) + `git log` for full detail.

**OPERATING RULES (unchanged):** pure orchestrator; the ORCHESTRATOR runs long evals (subagents background-and-die); one change per **three-sided gate** (target↑ McNemar AND confident-wrong flat/down AND latency/cost ok); never weaken L4/L5; gold/eval changes are USER-GATED; commit at kept gates; Vertex-only.

---

## 2026-05-30 AUTONOMOUS SESSION — CURRENT STATE (supersedes everything below)

ITC-HS v2 8-digit classifier. Branch `feat/phase-4-pipeline-build`. Backend root `backend/`. Runtime = **Vertex** (gemini-embedding-001@1536 + Gemini-Flash rerank + Gemini-Flash L1/L4). **NO Cohere** — ignore any "429-blocked / needs Cohere" text below; it is stale.

> On context compaction: RE-BRAINSTORM before acting — re-read this section + `MEMORY.md` + `git log` + the TaskList. Then continue.

### TL;DR — where we are
- **HEAD = latest commit on the branch** (run `git --no-pager log --oneline -1`; do NOT trust a hardcoded hash — the tip moves with each commit).
- **SESSION STATUS: autonomous session reached a strong milestone and is HOLDING for user direction.** Brain 68.0 → **~77% OUTRIGHT (+9pp)** + **top-3 ~86%** + ship foundation committed (`cd7a5a3`) & live-validated, all paired-gated root-cause fixes, confident-wrong down (69→~63-65), zero quality regressions.
- **Baseline progression (clean gold, frozen routing-independent denom):** r12 68.0% → gold-R4 70.1% → r15 (MV-03 + bad-gold-R5) 74.3% → r17 (L2 direct_leaf_lookup recall) 76.4% → r18 (residual-leaf-floor) 77.3% OUTRIGHT 8-digit (265/343), chapter 89.2%, heading 85.4%, confident-wrong 63 → **r19 (eval-only candidate_codes + top_k_code_accuracy, commit `ec34ee6`) PRIMARY OUTRIGHT 76.5% (261/341) / chapter 88.9% / heading 86.2% / confident-wrong 65** — consistent with r18's 77.3% within the ±2-3pp LLM-noise floor (r19 had 3 infra Vertex timeouts: S5-AUTO-011/016/021 at 90s, excluded → denom 341 vs r18's 343). **CURRENT brain ~77% OUTRIGHT / ~86% top-3**, at the top of the realistic non-fine-tuned band.
- **TOP-3 NOW MEASURED (new metric, commit `ec34ee6`):** r19 (vertex-m0-r19-top3-sim) **top_3_code_accuracy = 85.9% (293/341)**, top_1 = 76.5% (261/341). NOTE this top-3 is a **LOWER BOUND** — the proxy counts only the product's *displayed* candidates (selected + model `alternatives_considered`, ≤5), not the full L4 candidate set; true top-3 retrieval recall is **≥86%**. Product story: top-1 ~77%, top-3 ~86%+.
- **SHIP ARC STARTED (`cd7a5a3`):** `backend/src/api/v2-api-adapter.ts` (`mapV2Result`: CLASSIFY/ASK/REFUSE → flat DTO, confidence 0–100, leaf-desc + top-3 alternatives hydration, system_error/80s-timeout → 503) + `USE_V2_CLASSIFIER` feature flag in `src/api/classify.ts`, **DEFAULT OFF** (legacy byte-identical, instant rollback). Cutover (flag ON) + frontend rebuild = **DEFERRED to user review** (outward-facing change).
- **SHIP FOUNDATION LIVE-VALIDATED (HTTP smoke, flag `USE_V2_CLASSIFIER=true`, port 3007):** "stainless steel hex bolts M10" → **7318.15.00 correct**, DB-hydrated description, confidence 90, 3 alternatives, GIR citation, exportPolicy Free (39s); "steel" → **ASK with 6 options** (23s). DTO flat + correct. Server killed clean.
- **SHIP-CUTOVER BLOCKER (address before flipping the flag): LATENCY** — classify p95 ~62s, occasional 90s Vertex timeouts; sync HTTP UX risk. Mitigations: the committed **80s server-side timeout→503**; for cutover consider streaming/async or tightening the repair loop. Plus a **cosmetic em-dash mojibake** in one ASK option label (question-template source string).
- Suite = **385 cases** (post bad-gold R5: 22 query rewrites + drop DB030); scoring denom = **343** gold-code cases (341 in r19 after 3 infra-timeout exclusions).
- **REMAINING BRAIN HEADROOM** (all harder / research-grade, measurement-gated):
  - **(1) WRONG-HEADING SYNONYM-RECALL** — TC012 silicone hose (Ch.40 vs 8708, function-over-material), EC008 galvanized (7210 coated vs 7208/9) → L2 recall/synonym + sibling-diversity.
  - **(2) LEAF-PRECISION** (information-limited) — the wider pools added a few correct→wrong-leaf flips (e.g. DB108 wrong-residual, EC005/DB138/S5-AUTO-012) → needs a **FINE-TUNED RERANKER** (the real ceiling-raiser).
  - **(3) CONFIDENCE-CALIBRATION** — confident-wrong is ~72% HIGH-confidence overconfidence (ECE ~0.10) → a discrete-confidence sub-0.9 abstain gives ~+4pt safety but near-zero needs a **NEW signal** (rerank-margin / entropy) = research lever.
  - **(4) DB053 notes_claims definition-note fix** (id 20/21 EXISTS-on-definition → SKIP; broad textile blast radius, gate carefully).
- **GOLD-REVIEW QUEUE (user-gated, NOT applied — user away):** #13 = DB061 (Ensembles unwinnable), S5-AMB-005 (car seat cover sofa-vs-other), DB200 (malformed query + L0 truncation). See TaskList #13.
- **NEXT (user-directed):**
  - **(a) SHIP** — go/no-go on cutover (`USE_V2_CLASSIFIER` on) + frontend rebuild (`use-wizard.ts`: read `alternatives`, handle `responseType:refused`, multi-turn `/answer` with `{questionId, answerId}`) + address latency.
  - **(b) GOLD-REVIEW** queue #13 (DB061, S5-AMB-005, DB200).
  - **(c) HARDER/RESEARCH BRAIN LEVERS** — synonym/heading recall (TC012/EC008), DB053 notes_claims definition-note fix (broad textile blast radius), confidence-calibration (needs a new signal), fine-tuned domain reranker (the real ceiling-raiser).

### OVER-RESTRICTION ROOT CAUSE (the key reframe — via systematic-debugging)
The r14 "**51 mis-routed valid products**" are **NOT** L4/L5 over-strictness. They decompose into 3 buckets:

| Bucket | ~Count | What it actually is | Correct fix | Do NOT |
|---|---|---|---|---|
| 1. BAD EVAL GOLD | ~16 | Contentless ITC-HS schedule fragments (no product noun) where REFUSE/ASK is the *correct* behavior | bad-gold **Round 5** (22 rewrites + drop DB030, USER-APPROVED, APPLIED) | — |
| 2. L2 RETRIEVAL RECALL | ~16 | L1 routes the right chapter, L4/L5 reason correctly, but L2 never surfaces the gold leaf → L4 faithfully abstains. Causes: `direct_leaf_lookup` collapse + `cascade_full` adjacent-excluded-family | **L2 ONLY** (see L2-recall lever) | relax L4/L5 (→ confident WRONG codes) |
| 3. ASK/CLASSIFY CALIBRATION | ~20 | Gold IS retrieved but L1 over-asks | calibrated-classify lever | weaken MV-07/MV-08 (L4/L5 verified CORRECT here) |

### COMMITS TODAY
| Hash | What |
|---|---|
| `f13a446` | forensic recall diagnostic + env-gated surfaced-subheadings debug |
| `7112767` | sibling-ASK uncertainty gate → rerank-margin signal (env-gated OFF) |
| `6d9afd9` | gold-freeze Round 4 (8 user-approved bucket-C corrections) |
| `82dd3d4` | ASK-generalization plan doc |
| `881ef2e` | **MV-03 source_ref grammar fix** — taught L4 the locked `table:key=value` citation grammar; eliminates MV-03 false-reject → reclaims a repair round every classify |
| `8a189ef` | **calibrated-classify lever** (env-gated OFF) — converts L1-ASK→CLASSIFY when retrieval concentrated; mirror of sibling-ASK; extracted `runSelectVerifyRepair`, main path byte-identical; **never emits REFUSE** |
| `168ac64` | **gold-freeze Round 5** — 22 contentless-fragment query rewrites + drop DB030 (user-approved) |
| `d4cfb44` | **L2 direct_leaf_lookup recall fix** — widen rerank POOL to cosine∪FTS∪all-subheadings-of-surfaced-headings; r17 = **76.4% OUTRIGHT**, gold-code rejects 15→7, McNemar p=0.049 |
| `cd7a5a3` | **v2 API-rewire adapter** — `src/api/v2-api-adapter.ts` (`mapV2Result`: CLASSIFY/ASK/REFUSE → flat DTO, confidence 0–100, leaf-desc + top-3 hydration, system_error/timeout → 503) + `USE_V2_CLASSIFIER` flag in `classify.ts`, **DEFAULT OFF** (legacy byte-identical, instant rollback) |
| `7629a2b` | **residual-leaf-floor** — force-include surfaced-subheading residual "Other" leaf (recovers pharma/supplement residual rejects); r18 = **77.3% OUTRIGHT** (265/343), confident-wrong 69→63 |
| `ec34ee6` | **eval-only candidate_codes + top_k_code_accuracy** — instruments top-3 measurement; r19 = **top_3 85.9% (293/341)**, top_1/OUTRIGHT 76.5% (261/341), chapter 88.9%, heading 86.2%, confident-wrong 65 (consistent with r18 within ±2-3pp noise; 3 infra Vertex timeouts excluded). **CURRENT BASELINE.** |

### ENV FLAGS & EVAL COMMANDS
- `CALIBRATED_CLASSIFY_ENABLED` (default **off**), `CALIBRATED_CLASSIFY_MARGIN`=0.15, `CALIBRATED_CLASSIFY_STRONG_MARGIN`=0.30
- `SIBLING_ASK_ENABLED` (**off** — r13 calibration failed; needs a usable uncertainty signal)
- Run eval: `npx tsx --require dotenv/config src/eval/runner.ts --suite master --simulate-answers --run-id <id>` (add `--ids <a,b,c>` for subsets)
- Paired three-sided gate: `npx tsx src/eval/compare.ts <before> <after>`

### LEVER STATE / NEXT
| Lever | State |
|---|---|
| MV-03 grammar fix | **DONE** (committed) |
| calibrated-classify | **BUILT + COMMITTED**, gating now (r16) |
| bad-gold R5 | **APPLIED** (suite 385, denom 343) |
| **L2-RECALL (direct_leaf_lookup)** | **DONE + COMMITTED (`d4cfb44`, r17 76.4%).** `direct_leaf_lookup` now unions cosine∪FTS∪all-subheadings-of-surfaced-headings through the rerank cascade, emit capped at `L2_EMIT_CAP`=8 (POOL widened, not L4 cap — gate-2 lesson upheld). |
| **residual-leaf-floor** | **DONE + COMMITTED (`7629a2b`, r18 77.3% — CURRENT BASELINE).** Force-include the surfaced-subheading residual "Other" leaf so pharma/supplement residual rejects are recoverable; confident-wrong 69→63. |
| **v2 API-rewire adapter** | **DONE + COMMITTED (`cd7a5a3`), flag DEFAULT OFF.** `mapV2Result` adapter + `USE_V2_CLASSIFIER`. Cutover (flag ON) + frontend rebuild **DEFERRED to user review.** |
| wrong-heading synonym-recall | **NEXT (brain headroom 1)** — TC012 silicone hose, EC008 galvanized → L2 recall/synonym + sibling-diversity. |
| leaf-precision (fine-tuned reranker) | **DEFERRED** — DB108/EC005/DB138/S5-AUTO-012; the real ceiling-raiser. |
| confidence-calibration | **RESEARCH** — needs a new signal (rerank-margin/entropy); ~+4pt safety from a sub-0.9 abstain. |
| sibling-ASK generalization | **DEFERRED** |

### END GOAL (unchanged)
Best brain (~75–80% OUTRIGHT + calibrated ASK + top-3 + near-zero confident-wrong + GIR/notes/citation) → **API rewire** (`backend/src/api/classify.ts` legacy→v2 — **foundation DONE**, `cd7a5a3`, flag default OFF; cutover deferred to user review) → **frontend rebuild** → **publish** + trade-intelligence. **MCP = use MCP tools to build, NOT a standalone MCP-server deliverable** (user-confirmed).

### OPERATING RULES (autonomous session, user away ~hours) — unchanged
- **Pure orchestrator** — delegate everything to subagents, consume structured returns, keep context lean.
- **Maximal parallel workflows**, no agent-count limit.
- **Root-cause, not patches.** Never weaken L4/L5 (→ confident WRONG codes).
- **ONE change per measured THREE-SIDED gate:** target metric ↑ (McNemar) **AND** confident-wrong flat/down **AND** latency/cost ok.
- Iterate on `--ids` subsets; full-386 only at milestones.
- **GOLD/EVAL-DATA changes are USER-GATED** → while user away, **LOG** newly-found gold issues for approval; do **NOT** apply (no unilateral gold changes).
- **Commit at every kept gate.** Vertex runtime always (never Cohere).
- **EVAL-ORCHESTRATION FAILURE MODE (recurring — heed):** when a ~30-min eval is delegated to a SUBAGENT, the subagent BACKGROUNDS it and returns prematurely — its child process dies with it, so the run never completes. **The ORCHESTRATOR must run long evals as its OWN background Bash** (it gets re-invoked on completion); only delegate the no-eval compare+commit step to a subagent.

---

# Autonomous Continuation Brief — HS Code Classifier (2026-05-29 PM, REWRITTEN)

ITC-HS v2 8-digit classifier for Indian SME exporters. Branch `feat/phase-4-pipeline-build`. Backend root `backend/`.
**This doc is the lossless resume point. It supersedes all earlier state in this file.** Read it + `MEMORY.md` keys (`project_ultimate_brain_program_v2`, `feedback_root_cause_fix_not_patch`, `feedback_calibrated_routing_not_restriction`, `feedback_quality_first_best_in_class`) before acting.

---

## 0. TL;DR — where we are RIGHT NOW

- **HEAD = latest commit on `feat/phase-4-pipeline-build`** (run `git log --oneline -1`; was `2933796` at wrap-up — don't trust a hardcoded hash, the tip moves with each doc commit). **Working tree CLEAN.** `tsc` clean; **796 v2/eval tests pass**.
- **Honest brain accuracy (r12, clean gold, ASK off): 8-digit OUTRIGHT = 68.0%** / chapter 81.1% / heading 78.2% (frozen routing-independent denominator, n=344 gold-code cases) / confident-wrong = 69 / EFFECTIVE 8-digit 71.5%. This is the TRUE number (see §3).
- **ASK-lever calibration DONE (2026-05-29 PM):** the post-L4 uncertainty-gated sibling-ASK lever fired **~0×** (0 at τ=0.45, 1 at τ=0.65) → gate NOT cleared. Root cause: **L4's `self_confidence` is a coarse 3-level enum AND overconfident/uncalibrated** (ECE ~18%), so it doesn't flag the genuinely-uncertain sibling picks → the uncertainty-gate under-fires. (v1 pre-L4 trigger had the opposite failure — over-fired at 33%.) **You cannot gate ASK on L4 self_confidence.** The lever code is sound + committed (env-gated OFF, no harm); it is BLOCKED on the SIGNAL. The r13 OUTRIGHT (66%) vs r12 (68%) is ~run-to-run LLM noise (the lever fired ~0× → r13 ≈ a r12 re-run). **First action next session = §6.1 (unblock the ASK signal) and/or §6.2 (retrieval, independent).**
- Runtime = **Vertex** (gemini-embedding-001@1536 + Gemini-Flash rerank + Gemini-Flash L1/L4). **Cohere is OFF and decommissioned — ignore any doc that says a run "needs Cohere" or is "429-blocked"; that is stale.**

---

## 1. END GOAL (the finish line)

**Build the best ITC-HS classifier brain, then API-rewire it, then rebuild the frontend, then publish.** "Best brain" = realistic, not hypothetical:
- 8-digit OUTRIGHT ~75–80% (on ANSWERED cases) + **calibrated ASK** that converts genuinely-underspecified queries into the right code via one question + **top-3 alternatives** + **near-zero confident-wrong** + legally-defensible (GIR + notes + citation) answers.
- Honest ceiling: published non-fine-tuned frontier+RAG systems top out ~64–75% top-1 / ~78–91% top-3 at 8-digit. Our 68% is squarely in-band. **80% outright without fine-tuning is the optimistic edge** — the realistic "ultimate" is ~75-80% outright + ASK/top-3 for the irreducibly-ambiguous, with a fine-tuned domain reranker as the later true ceiling-raiser.
- Then: API rewire legacy→v2 (`backend/src/api/classify.ts`) → frontend rebuild → publish.

---

## 2. WHAT WE DID THIS SESSION (chronological, with commits)

1. **Adversarial re-audit** of the inherited plan (4 diverse-lens agents) → 13 critical + 19 major flaws → rebuilt the plan (`docs/plans/2026-05-29-ultimate-brain-program-v2.md`).
2. **Phase-0 Trust-Spine** (`899c999`): made the eval ruler honest — frozen routing-independent denominator (killed the dilution trap), EFFECTIVE scorer + population-closure assertion, confident-wrong rate, calibration (Brier + equal-mass ECE + bootstrap CI), Wilson CIs, McNemar, automated regression-guard (`compare.ts`), **oracle decontamination** (frozen gold-attributes snapshot so ASK-recovery can't self-grade off enrichment), and a `deriveAnswerId` fabrication fix. Contract: `docs/EVAL_DESIGN.md`.
3. **P1 corpus discriminator-gap analysis** (`eb981da`): across 2,241 multi-leaf subheadings — residual-"Other" = 74.7% (a REASONING pattern, not a data gap); genuine data-separable axes each only 1–3%.
4. **r8-sim honest baseline:** OUTRIGHT 8-digit 59.9% (vs the inflated routing-conditional "68%"); confident-wrong 32.6%; ASK-recovery 40.7% (r7's "25%" was the harness artifact, now fixed).
5. **Gold-freeze Round 1** (`082d918`): 11 user-approved, blind-law-verified GT corrections → r9 baseline OUTRIGHT 62.2%.
6. **Gate-1 (L4 "Other-by-elimination" prompt):** NEUTRAL (8-digit +0.3pp, McNemar p=1.0) → **REVERTED**. Diagnosis: reasoning-gated; the elimination prompt mis-reasoned (eliminated the correct sibling). `docs/plans/2026-05-29-gate1-other-elimination-blueprint.md` (REVERTED — kept for the isOtherLeaf logic).
7. **Strategic re-plan** (`docs/plans/2026-05-29-roadmap-to-80.md`): error decomposition (SELECTION 75% / RETRIEVAL 25% / rerank-drop 0%) + SOTA research + codebase leverage map.
8. **Gate-2 (sibling expansion + rerank-attributes + cap 8→12):** REGRESSED −2pp → **REVERTED** (wider candidate set confused Flash more).
9. **Pro-vs-Flash experiment (DECISIVE):** Gemini-Pro fixed only ~6% of Flash's sibling errors; in 42/51 cases Pro chose the SAME wrong sibling. → **The selection bottleneck is INFORMATION, not the model and not complexity.** Both ruled out empirically.
10. **GT audit + blind verification:** ~50% of the "selection errors" are GT-errors (the brain was already right, gold was wrong); ~50% are genuine query-underspecification (the deciding fact is absent from the query → the ASK lever's job).
11. **Gold-freeze Round 3** (`e48fdb7`): 21 user-approved, blind-law-verified GT corrections → **r12 baseline OUTRIGHT 68.0%** (+5.8pp vs r9, McNemar p=0.0008 — the real win). Log: `src/eval/GOLD-REMEDIATION-LOG.md`.
12. **Sibling-ASK lever v1** (`a8b3630`, env-gated off) + eval tooling (`--ids` filter, `SELECT_MODEL_OVERRIDE`, `CASE_TIMEOUT_MS`). v1 (PRE-L4 trigger) over-fired (33% ask-rate, −18.8pp) → FAILED.
13. **Sibling-ASK redesign** (`e340990`, env-gated off): POST-L4 **uncertainty-gated** trigger — asks only when L4 returns CLASSIFY with `self_confidence` below `SIBLING_ASK_CONF_THRESHOLD`, the leaf is in a same-subheading sibling group, the discriminator is unpinned by the query, and a QGS question on that exact discriminator is buildable. **Calibration in flight (r13).**

---

## 3. WHY 68% IS THE TRUE NUMBER (don't be confused by the history)
- Session start showed a flattering "**68%**" — inflated by a routing-conditional denominator (dilution).
- Phase-0 exposed the honest floor at **59.9%** (frozen denominator, but on *wrong* gold).
- 32 gold corrections (Rounds 1+3, all blind-law-verified + user-approved) fixed a systematically-buggy answer key. On *correct* gold the honest number is **68.0%** — i.e. the brain was always ~68% and we were under-crediting it. The brain is strong and in the SOTA band; the remaining gap is the underspecified-query problem (→ ASK) + the retrieval-25% bucket.

---

## 4. KEY LEARNINGS (the session's intellectual capital — do not relearn the hard way)
1. **Measure honestly first.** Self-grading loops (routing-conditional denominator; oracle reading the same table enrichment rewrites) silently mislead. Trust-spine before optimization.
2. **The eval gold had systematic errors.** When two independent strong models confidently agree on a non-gold code, the gold is wrong ~half the time. Blind-law-verify (given only query+gold) + user-approve before changing gold; never launder toward the model.
3. **8-digit gap = SELECTION 75% / RETRIEVAL 25% / rerank-drop 0%.**
4. **The selection bottleneck is INFORMATION, not model/complexity.** PROVEN: gate-1 (more prompt) neutral; gate-2 (more candidates/attrs) negative; Pro=Flash. **Do NOT try to fix sibling selection by adding context, candidates, or a bigger model — it does not help and often hurts.**
5. **Half the selection errors need ASK** (the deciding fact isn't in the query; the exporter knows it). The other half were gold errors.
6. **ASK must be uncertainty-gated** (ask only when L4 is genuinely stuck), never pre-emptive (over-fires catastrophically).
7. **Unmarked-default-wins principle:** when a query doesn't flag the *special* variant (flavoured / filled / handloom / hand-crocheted / ballistic / seed-quality), the correct code is the *common/residual* leaf, not the special one. (Now in the select-v2 prompt as the india-specific opt-in rule + applied in gold corrections.)
8. **Non-fine-tuned ceiling ~64-75% top-1.** Report top-1 AND top-3; lean on calibrated ASK for the irreducible remainder.

---

## 5. METRICS, FILES, COMMANDS
- **Eval runner:** `cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite master --run-id <id> --simulate-answers` (~30 min, Vertex). Add `--ids <c1,c2,...>` for a targeted subset (~minutes). Quick suite: `--suite quick`.
- **ASK lever envs:** `SIBLING_ASK_ENABLED=true` to turn it on; `SIBLING_ASK_CONF_THRESHOLD=<float>` (default 0.65; 0.45=ask on LOW-only, 0.65=ask on LOW+MEDIUM).
- **Compare two runs:** `npx tsx src/eval/compare.ts <before.json> <after.json>` → metric diffs + McNemar + improved/regressed caseIds + three-sided gate verdict.
- **Tests:** `npx vitest run src/classifier-v2 src/eval`. **Typecheck:** `npx tsc --noEmit`.
- Eval results: `backend/eval-results/vertex-m0-*.json` (gitignored; key ones: `r9-sim`, `r12-sim` (=68% baseline, ASK off), `r13-ask045-sim`/`r13-ask065-sim` (calibration), `pro-select-probe.json`).
- Plans: `docs/plans/2026-05-29-{ultimate-brain-program-v2, roadmap-to-80, gate1-other-elimination-blueprint, sibling-ask-lever-blueprint}.md`. Metric contract: `docs/EVAL_DESIGN.md`. Gold log: `src/eval/GOLD-REMEDIATION-LOG.md`.

---

## 6. HOW TO PROCEED (priority order)

### 6.1 ASK-lever: DONE/BLOCKED — needs a real uncertainty signal (resume here)
The r13 calibration is COMPLETE and BOTH thresholds FAILED — the lever barely fires (`sibling_ask_count` = 0 at τ=0.45, 1 at τ=0.65). Root cause: L4's `self_confidence` (3-level enum HIGH/MED/LOW) is OVERCONFIDENT/uncalibrated (ECE ~18%) — it does not flag the genuinely-uncertain sibling picks, so the uncertainty-gate under-fires. (v1 pre-L4 trigger over-fired at 33%; opposite failure.) **Net: you cannot gate ASK on L4 self_confidence.** The lever code is sound + committed (`e340990`, env-gated OFF); it is blocked on the SIGNAL, not the logic. Two unblock paths (this is the next real work on ASK):
- **(a) RERANK-MARGIN signal — try FIRST (cheaper):** gate ASK on the score MARGIN between the top-2 same-subheading sibling candidates (reranker/cosine scores), not on L4's enum confidence. Small margin = genuinely confusable = ask. Likely works without full calibration. (Check whether the reranker exposes per-candidate scores the orchestrator can read post-L2.)
- **(b) CALIBRATE confidence — deeper, also does §6.3:** make L4 emit a calibrated probability (temperature scaling / a small learned head fit on the eval cases), then re-gate ASK on it; this also unlocks the "never-confidently-wrong" bar.
Until a usable signal exists, the ASK lever stays OFF; pursue §6.2 (retrieval-25%, independent) in parallel. **Discipline reminder:** the pipeline has a ~±2-3pp run-to-run LLM noise floor (r13 vs r12 proved it) — always compare paired (McNemar via `compare.ts`), never raw single-run deltas.

### 6.2 Retrieval-25% bucket
Triage chapter-mis-routing (TC009 fuel-injection-pump→Ch.84 [GT-suspect: Sec XVII Note 2(e) — may already be handled], TC306 silk saree→62 not 50) + genuine L2 leaf-recall gaps. Levers (from `roadmap-to-80.md` Tier-2): per-subheading leaf floor, RRF fusion (dense+FTS), a chapter-recall safety net / loosened backtrack. One change per three-sided gate, iterate on `--ids` subset.

### 6.3 Calibration of confidence
ECE ~18% (poorly calibrated). For trustworthy confidence + a sharper ASK gate, calibrate L4 self_confidence (or derive a margin signal). Enables the "never confidently wrong" bar.

### 6.4 Ship arc (after the brain is maxed)
API rewire legacy→v2 (`src/api/classify.ts`) — freeze the external DTO, thin HTTP smoke first → frontend rebuild → publish + trade-intelligence (duty rates).

### 6.5 Deferred / ceiling-raisers (need infra/data)
Fine-tuned domain reranker with hard-negative mining (siblings = hard negatives); corpus re-embed with discriminating attributes; RAG over Indian ITC-HS advance rulings. Start mining sibling hard-negatives now (free; the code trie defines them).

---

## 7. OPERATING RULES (user-set)
1. Quality-first and INCREASING; never reduce it. Right thing at the right time; not rushed. Best-in-class over hand-rolled.
2. Root-cause fixes, not patches; no eval-overfit. A green eval via hacks = false pass.
3. **One principled change per measured THREE-SIDED gate** (target metric up via McNemar AND confident-wrong flat/down + regression-guard AND latency/cost in budget). Iterate on the `--ids` fast subset; full-386 only at milestones. **Do NOT get stuck in an eval loop** — eval at the right time, focus on making the classifier better.
4. **Gold changes are USER-GATED** — blind-law-verify (only query+gold) + present for approval; never launder toward the model.
5. Orchestrate with dynamic workflows + many parallel agents (ultracode). Pure orchestrator: delegate bulk reading/analysis/implementation; read only structured returns; verify delegated work yourself (re-run tsc/tests, spot-check, independent review).
6. Commit at every kept gate (authorized standing policy this run). Runtime stays Vertex; never reintroduce Cohere.
7. Diverse-lens adversarial review before locking a plan; verify state before lock.
8. Ask the user only for genuine forks (esp. gold changes, scope/strategy at milestones); otherwise proceed on your best recommendation.

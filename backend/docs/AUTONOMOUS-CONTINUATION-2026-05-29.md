# Autonomous Continuation Brief — HS Code Classifier (2026-05-29 PM, REWRITTEN)

ITC-HS v2 8-digit classifier for Indian SME exporters. Branch `feat/phase-4-pipeline-build`. Backend root `backend/`.
**This doc is the lossless resume point. It supersedes all earlier state in this file.** Read it + `MEMORY.md` keys (`project_ultimate_brain_program_v2`, `feedback_root_cause_fix_not_patch`, `feedback_calibrated_routing_not_restriction`, `feedback_quality_first_best_in_class`) before acting.

---

## 0. TL;DR — where we are RIGHT NOW

- **HEAD = `e340990`** on `feat/phase-4-pipeline-build`. **Working tree CLEAN.** `tsc` clean; **796 v2/eval tests pass**.
- **Honest brain accuracy (r12, clean gold, ASK off): 8-digit OUTRIGHT = 68.0%** / chapter 81.1% / heading 78.2% (frozen routing-independent denominator, n=344 gold-code cases) / confident-wrong = 69 / EFFECTIVE 8-digit 71.5%. This is the TRUE number (see §3).
- **IN FLIGHT (Vertex eval, may be done by next session):** two calibration runs of the new uncertainty-gated sibling-ASK lever — `vertex-m0-r13-ask045-sim` (τ=0.45) and `vertex-m0-r13-ask065-sim` (τ=0.65). **First action next session = read those + decide (see §6.1).**
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

### 6.1 IMMEDIATE — finish the ASK-lever calibration (resume here)
Read `eval-results/vertex-m0-r13-ask045-sim.json` and `vertex-m0-r13-ask065-sim.json` (if missing, re-run them — §5 commands with the two thresholds). For each, `compare.ts` vs `vertex-m0-r12-sim.json` and check the three-sided gate: **OUTRIGHT preserved (not tanked) AND classify_as_ask ≤ ~15% AND sibling_ask_recoverability_rate ≥ 75% AND EFFECTIVE 8-digit up.** Pick the threshold that clears it. If one clears → flip the default to enabled (set the env or change the default) + commit ("keep gate"). If neither clears → the uncertainty signal (3-level enum) is too coarse; options to try: (a) ask only on LOW (τ=0.45) + improve question option-coverage for recoverability, (b) require a margin signal not just confidence, (c) accept ASK as a smaller win and move to 6.2. Do NOT force it.

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

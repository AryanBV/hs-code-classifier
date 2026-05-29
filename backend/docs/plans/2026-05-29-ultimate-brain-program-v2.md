# Ultimate Brain Program — v2 (post-adversarial-audit, 2026-05-29)

**Status:** ACTIVE plan-of-record (design philosophy + phased program). Supersedes the priority order in `AUTONOMOUS-CONTINUATION-2026-05-29.md` where they disagree (this is more correct after audit). **For the live capability-climb state + "next" ordering, the canonical source is `AUTONOMOUS-CONTINUATION-2026-05-29.md` §0/§6 — this doc is the strategy/contract; it must not contradict that brief.**
**Branch:** `feat/phase-4-pipeline-build`. **Runtime:** Vertex only (Cohere DECOMMISSIONED — do not reintroduce; any "needs Cohere"/"429-blocked" line anywhere is STALE).
**Authority:** Adversarial re-audit (4 diverse lenses) ran 2026-05-29; 13 critical + 19 major flaws. This doc folds in every critical + major fix. Raw findings: workflow `wf_17e58c7b-5ef`.

---

## SESSION-END STATE (2026-05-29 PM — current reality, READ FIRST)

- **HEAD `e340990`**, working tree on plan-docs only; `tsc` clean; **796 v2/eval tests pass**.
- **Honest 8-digit OUTRIGHT = 68.0% (r12)** on clean gold (32 corrections over 2 freeze rounds), frozen routing-independent denominator (n=344 gold-code cases) / chapter 81.1% / heading 78.2% / confident-wrong 69 / EFFECTIVE 71.5%. **This is the TRUE number — the brain was always ~68%; we were under-crediting it on buggy gold.**
- **DONE this session:** Phase-0 trust-spine (honest ruler) ✅; P1 corpus diagnosis ✅; Gold-freeze Rounds 1+3 (32 GT corrections) ✅; **gate-1 (L4 elimination prompt) = NEUTRAL → REVERTED** ✅; **gate-2 (sibling expansion + rerank-attrs + cap 8→12) = REGRESSED −2pp → REVERTED** ✅; **Pro-vs-Flash experiment = DECISIVE** ✅; **sibling-ASK lever redesigned to POST-L4 uncertainty-gated (env-gated OFF, calibration r13 in flight)** ✅.
- **PROVEN this session (do not relearn):** the selection bottleneck is **INFORMATION, not the model and not complexity** — gate-1 (more prompt) neutral, gate-2 (more candidates/attrs) negative, **Gemini-Pro ≈ Flash** (Pro fixed only ~6% of Flash's sibling errors; chose the SAME wrong sibling in 42/51). Adding context / candidates / a bigger model does NOT fix sibling selection. Half the residual selection "errors" were gold errors (now fixed); the other half need ASK (deciding fact absent from the query).
- **Pro-vs-Flash caveat:** the Pro and Flash select tiers are effectively the same model surface for this task ("Pro=Flash"), so the lever is selection-quality (INFORMATION), NOT model/complexity.
- **NEXT order (canonical):** (1) ASK-lever calibration (r13 τ-sweep, three-sided gate) → (2) retrieval-25% bucket → (3) confidence calibration (ECE ~18%) → (4) ship (API rewire → frontend → publish). This replaces the §5 "P2/P3/P4" ordering as the live work order.

---

## 0. Why v2 exists (what the audit changed)

The v1 plan's *shape* was endorsed by all four lenses (instrument-first, measured gates, corpus-wide diagnosis, evidence-gated L6/L7, build/runtime separation). But the audit found the **measurement spine was not trustworthy enough to gate on**, and corrected three things that would have produced false progress:

1. **Self-grading loops.** (a) The accuracy denominator is routing-conditional (`runner.ts:330-342`) → rerouting hard cases to ASK *inflates* accuracy by shrinking n. (b) The answer-simulator's gold oracle reads the *same* `tariff_line_attributes` table that P3 enrichment rewrites → ASK-recovery would rise mechanically because enrichment fed the oracle the answer. (c) No held-out set → dozens of gates on one 386-suite = garden-of-forking-paths overfit.
2. **Undefined headline metrics.** `confident-wrong-rate`, `EFFECTIVE-8digit`, and `calibration` were asserted as bars but have **no scorer** and **no statistically valid definition at n=386**. The brief's Priority-#1 "harness fix" (widen gold-lookup + substring fallback) is **largely a no-op** (both already exist, `answer-simulator.ts:124-126`, `gold-attributes-lookup.ts:61-64`) and the fallback part would have *fabricated* recoveries.
3. **Wrong customs framing + mis-identified data lever.** "8-digit EFFECTIVE incl. ASK" is not a valid customs success metric (the exporter files ONE code). And the four named enrichment axes (sizing/vehicle/surface/fur) are **low-frequency**; the real high-frequency ITC(HS) 8-digit separators are value/price thresholds, %-composition-by-weight, end-use, retail-vs-bulk packing, and the residual "Other"-by-elimination leaf.

**One reviewer claim REJECTED (verified against authoritative state):** the HS-domain lens asserted "r6/r7 were a Cohere-era / partially-429'd run; recompute baselines." This is **wrong** — `vertex-m0-*` runs are already on the Vertex stack (Cohere OFF; the 429 blocker was *resolved by* the migration). No baseline recompute is needed on that ground. (The underlying advice — state every denominator explicitly — is kept.)

---

## 0.5 Empirical update — 2026-05-29 (r8 baseline + P1 corpus diagnosis)

> **SUPERSEDED by SESSION-END STATE above.** r8 (59.9%) was on *wrong* gold; after 32 blind-verified GT corrections the honest baseline is **r12 OUTRIGHT 8-digit 68.0%** (clean gold, frozen denom). The P1 corpus diagnosis below still holds. The revised-P2 lever ordering below was a *hypothesis* — it has since been empirically tested and largely overturned: the "L4 Other-by-elimination reasoning mode" was built as **gate-1 and proved NEUTRAL (reverted)**; "more candidates/attributes" was **gate-2 and REGRESSED (reverted)**; Gemini-**Pro ≈ Flash**. Net learning: the selection bottleneck is **INFORMATION, not model/complexity** — see SESSION-END STATE + `2026-05-29-roadmap-to-80.md`. The live lever order is now ASK-calibration → retrieval-25% → confidence-calibration → ship.

**r8-sim trust-baseline (frozen denominator = 342 gold cases; first un-gameable numbers):**
- OUTRIGHT: chapter 81.3% / heading 77.5% / **8-digit 59.9%** (CI 54.7–65.0). The old routing-conditional ruler read 68.1% — the ~8pp gap was dilution, not the brain (`precision_when_classifying` reproduces r6 exactly → zero regression).
- **confident-wrong = 32.6%** (99/304 answered) — THE trust problem, now measured.
- ASK-recovery = **40.7%** (honest; up from r7's contaminated 25% — QGS was never broken; the drop was the harness artifact).
- EFFECTIVE 8-digit 63.2%. Calibration ECE 19.8% (poor — confidence not yet meaningful). `population_closure: OK`.
- ⚠️ latency p95 66s / median 30s under EVAL conditions (sim rounds, concurrency 8, order-of-magnitude cost) — flag for P4.5 production-path measurement, not a P0 blocker.

**P1 corpus discriminator-gap (all 2,241 multi-leaf subheadings) — the "data-enrichment-is-the-biggest-lever" assumption is FALSE:**
- **residual-"Other" = 74.7%** of multi-leaf subheadings → a REASONING gap (L4 elimination mode), NOT data enrichment.
- Genuine data-separable uncovered axes are each only 1–3%: value/dimension-threshold (2.3%, ~half are dimension not price), pct/ingredient-presence (3.3%), end-use (2.6%, partial), packing (0.8%). species/material already covered.

**Revised P2 priority (SUPERSEDES the §5 P2 ordering), evidence-based, by leverage:**
1. **L4 "Other"-by-elimination reasoning mode** — 74.7% of multi-leaf subheadings; biggest single leaf lever.
2. **L4 subheading→leaf two-step + MV-11 sibling-discriminator gate** — structural GIR-6 same-level enforcement.
3. **Cross-encoder reranker fine-tuned on hard HS sibling pairs** — cheapest high-value leaf-precision lever (architecture review).
4. **Cut confident-wrong (32.6%→)** via calibration + routing more uncertain cases to ASK instead of guessing.
5. Verifier hardening: MV-05 GIR-ladder; MV-03 contiguous-span citation + polarity; exclusion redirect-OBEDIENCE (today MV-02 only checks acknowledgement).
6. **Targeted data enrichment** — resized to a ~10% SECONDARY lever (value/dimension/packing/ingredient-presence/non-metal-%); needs NEW column types (P2.5). NOT a big O2-scale batch.

**Architecture note (answers the notes/hierarchy question):** v2 is retrieve-then-verify with hierarchy-folded leaf embeddings (parent text concatenated at build time); notes used in 3 modes — L4 prompt-injection, L5 predicate-DSL evaluation (`notes_claims`), MV-03 citation-fidelity. Under-use to fix in P2: exclusions are soft-only (no redirect-obedience check), MV-10 policy is a substring scan, GIR order not structurally enforced. A GNN is NOT worth it (tree too shallow; parent context already in the embeddings).

---

## 1. North star & realistic ultimate bars (corrected metric philosophy)

**North star:** a calibrated, explainable, self-improving classifier that matches the best human customs expert, **never confidently emits a wrong code**, justifies every answer with a citable legal locus, and wraps the code in trade intelligence — fast and cheap enough for an Indian SME. Then API-rewire; frontend rebuild + publish = a later epoch.

**PRIMARY metric (the one we gate the product on):**
- **OUTRIGHT 8-digit accuracy on ANSWERED cases** = single defensible filed code. This is what clears customs.
- **confident-wrong** = system CLASSIFIED (not ASK/REFUSE) AND code wrong. Gated on **absolute count + mandatory manual review of every instance** ("would a competent CHA call this indefensible?"), NOT a 3% threshold (unmeasurable at n=386).

**SECONDARY / UX metrics (reported, not the headline bar):**
- **EFFECTIVE 8-digit** = (outright-correct + ASK-recovered-correct within ≤2 rounds) / (all gold-classify cases, constant denominator). A UX ceiling, not the customs bar.
- **ask-rate** with a hard ceiling (≤15–20%): the model may not buy accuracy by asking on everything.
- **post-answer outright** = after an ASK is answered, it must converge to a single code.

**Realistic, achievable targets (evidence-based, on the HELD-OUT set, with CIs):**

| Metric | Now (r12, honest: OUTRIGHT / frozen denom / clean gold) | Realistic ultimate | Notes |
|---|---|---|---|
| Chapter (frozen denom) | 81.1% | 95–96% | textile + confusing-pairs + notes + GIR-ladder |
| Heading | 78.2% | 90–92% | |
| **8-digit OUTRIGHT (answered)** | **68.0%** | **78–83%** | bounded by tariff ambiguity + query info; SELECTION lever is INFORMATION (ASK), not model/candidates |
| 8-digit EFFECTIVE (secondary) | 71.5% | 85–90% | UX ceiling, reported with [realistic, oracle] range; rises with the ASK lever |
| confident-wrong (count) | 69 | → 0 indefensible | manual-reviewed every instance |
| Calibration (ECE) | ~18% (poor) | directional + Brier ↓ | ECE w/ bootstrap CI; never claim "<5%" |
| p95 latency / $ per query | p95 ~66s under eval (sim/concurrency) | ≤8s / ≤$0.012 | measure on the production path, not eval; 3-sided gate sidecar |

> Note: the prior version of this table showed "r6 routing-conditional" estimates (~92 chapter / ~88 heading / ~68 8-digit). Those were the inflated/diluted ruler. The honest r12 clean-gold numbers above are lower on chapter/heading (frozen denominator) and the 68.0% 8-digit is OUTRIGHT — a numerical coincidence with the old diluted 68, NOT the same measurement.

100% outright is impossible (irreducible tariff ambiguity + underspecified one-line queries); "ultimate" converts the irreducible remainder into a **calibrated ASK that converges to one code**, never a confident guess.

---

## 2. Frozen metric contract (pre-registered — write to `backend/docs/EVAL_DESIGN.md`, never edit mid-optimization)

All implemented in `buildReport` (`runner.ts:311-401`) + `scorer.ts` + `types.ts`, under TDD.

1. **Frozen scoring population.** For ALL accuracy: denominator = every non-error case carrying a gold code, **independent of routing**. OUTRIGHT chapter/heading/code = correct / |gold-code cases|. Keep the old routing-conditional numbers ONLY as labeled `precision_when_classifying` diagnostics. Never gate on the conditional number.
2. **EFFECTIVE scorer** = (outright-correct + ASK-recovered-correct ≤2 rounds) / |gold-classify cases| (constant). Wrong-after-ASK = miss; if delivered as CLASSIFY also counts as confident-wrong. **Close the REFUSE leak**: assert `directClassify + askCases + refusedWithGold + askedNotSimulated === scoredWithGold` and fail the run otherwise (`buildEndToEndMetrics` `runner.ts:415-462`).
3. **confident-wrong** = responseType==='classification' AND code wrong. Emit count + the caseId list. (Optional graded variant at τ=0.7, computed but not gated.)
4. **Calibration**: ECE with **equal-mass bins (≤5)** + **Brier score** (headline scalar) + **bootstrap CI (1000 resamples)**. Reliability curve = directional diagnostic only.
5. **Per-metric CIs**: print Wilson 95% CI next to every rate. ASK-recovery reported as k/n with Wilson CI; **never gated at n<30**.
6. **Run-vs-run comparison**: **McNemar paired test** on the per-case correct/wrong vectors over the shared population — NOT raw delta vs a flat ±1-2pp band (the real binomial half-width is ±4.6pp@386, ±12pp@60, ±18pp@28).
7. **Automated regression-guard** (`compare.ts`, extend or create): persist per-case pass/fail vector each kept gate; emit the set of cases that flipped correct→wrong; **BLOCK auto-acceptance on any regression** — forces explicit sign-off per flip.
8. **Three-sided gate** to KEEP a change: (target metric UP via McNemar) AND (confident-wrong count flat/down + zero unsigned-off regressions) AND (p95 latency + $/query within budget). Instrument **real per-call token cost** (replace the flat `est_cost_usd`).
9. **Needless-ask guardrail**: for each ASK case with a gold code, also run the direct-classify path and record whether it would have been correct; `needless_ask_rate` must not rise.
10. **Metric layer is production code under TDD**: unit tests (known input → known headline number) for every new metric; full existing suite (~700) is a P0 exit criterion; reconcile any test asserting old ASK/contract behavior.

---

## 3. Suite governance

- **Partition the 386 master suite**: DEV (~256, per-case iteration + attribution) / **HELD-OUT LOCK (~130, never inspected per-case, run ≤3 times total, each touch logged)**. Report all "ultimate" numbers (esp. confident-wrong + calibration) on HELD-OUT with CIs. DEV-vs-HELDOUT gap = the overfit estimate.
- **REALITY suite (~40–60)**: deliberately messy real-exporter inputs (Hinglish, abbreviations `SS/MS/API/banyan`, typos, 3-word queries, mixed-product), same gold codes. Reported separately; the 386-vs-REALITY gap is the true distance-to-ultimate. *(Authoring needs care + likely a sample of real query phrasings — flagged to user.)*
- **Adversarial confident-wrong probe (~100)**: hand-picked confusable cases (8 confusing pairs, Section XVII exclusions, GIR-3 composites) so the rare confident-wrong event is over-sampled and measurable.
- **Gold freeze**: batch ALL GT corrections into ONE separately-reviewed checkpoint AFTER P1, BEFORE P2; each correction requires a **cited legal basis** (Section/Chapter Note, GIR, CBIC ruling) cross-checked against loaded notes/exclusions; GT immutable during P2/P3; report accuracy-under-old-GT vs new-GT so any gain from relabeling is explicit. Never co-mingle a GT fix with a model change in one gate. Track correction-direction stats (guard against confirmation bias toward the model's current output). TC009 (pump → Ch.84 via Sec XVII Note 2(e)) goes through this protocol.

---

## 4. Oracle decontamination (the deepest fix)

The answer-simulator must answer from **what the exporter knows at P0**, not from the corpus the model later enriches.
- Snapshot the 6 core attribute columns + code of `tariff_line_attributes` as-of-P0 into an **immutable, version-controlled JSON fixture** `backend/src/eval/fixtures/gold-attributes-frozen.json` (and/or a `gold_attributes_frozen` table). Point `getGoldAttributeValues` at the frozen fixture by default; keep the live-DB read behind a `--regen` flag only.
- Per ASK case, log whether the answer came from an attribute ENRICHED after P0; if recoveries concentrate on enriched attrs, flag for manual spot-check before counting the gate.
- Consequence: when ASK-recovery moves in P3, it reflects QGS+L4 genuinely using new *runtime* data to recover — not the oracle being handed the answer.

---

## 5. The phased program (revised)

### P0 — Trust Spine (HARDENED). ✅ DONE (commit `899c999`). Gate for everything; completed BEFORE P1 fan-out.
- **P0-A (measurement core, TDD):** §2 items 1-10 + §4 oracle snapshot + the **legit answer-sim normalization fix** in `deriveAnswerId` (slug/hyphen/space/case skew; do NOT loosen into fabricating matches). Re-classify the 21 unrecovered after the fix → true recoverable count. *Eval-harness only → structurally cannot regress classify behavior.*
- **P0-B:** suite partition (DEV/HELD-OUT) + `EVAL_DESIGN.md` + external-DTO **contract snapshot test**. Freeze ONLY the external API DTO (request + `ClassifyResult` union) with additive optional fields for confidence/calibration/escalation; internal orchestrator signatures stay free.
- **P0-C (deferred within P0):** REALITY suite + adversarial probe authoring (needs care).
- **Exit:** re-baseline r8 (flag-off ∥ flag-on) on trustworthy metrics; metric unit tests pass; full ~700 suite green; 0 classify regression. Commit.

### P1 — Corpus-wide diagnosis (read-only fan-out), re-scoped. ✅ DONE (commit `eb981da`; result: residual-"Other" = 74.7% across 2,241 multi-leaf subheadings → a REASONING pattern, genuine data-separable axes each only 1–3%).
- **Separator-type taxonomy** across ALL multi-leaf subheadings, parsed from sibling `tariff_lines.description`: value-threshold | pct-composition | end-use | packing(retail/bulk) | species/material | residual-Other | enumerated.
- **Leverage rank = corpus prevalence × current leaf-error rate × askability-via-QGS** (NOT eval-failure count). Require ≥~20 corpus subheadings sharing an axis before enriching it. Hold out a non-eval validation slice to prove generalization.
- Cheap **discriminating-power probe** per axis (does it disambiguate when the value is present-in-query vs absent → present-only axes need QGS not corpus data).
- Plus: textile 61/62/63, routing/chapter residual, suspected-GT (with legal citations), **verifier over-rejection forensics** (true lost-correct form).
- Output: ranked leverage-per-effort table with named case IDs + the per-axis core-vs-metadata recommendation.

### P2 — Runtime capability fixes (foreground, ONE three-sided gate at a time, ordered by P1 leverage).

> **P2 EMPIRICAL STATUS (2026-05-29):** Two P2-class gates were run and BOTH reverted. **gate-1** = the "Other"-residual-by-elimination L4 reasoning mode (below) → **NEUTRAL** (+0.3pp, McNemar p=1.0; the elimination prompt mis-reasoned). **gate-2** = sibling expansion + discriminator-attributes-into-rerank + candidate-cap 8→12 (the `roadmap-to-80.md` Tier-1 structural fix) → **REGRESSED −2pp** (wider/attributed candidate set confused Flash more). Plus the **Pro-vs-Flash** probe: Gemini-Pro ≈ Flash. **Conclusion: the P2 thesis "fix sibling selection by adding context/candidates/reasoning/model" is empirically refuted for this task. The selection bottleneck is INFORMATION the query lacks → the live plan pivots to the calibrated ASK lever (post-L4 uncertainty-gated) + the retrieval-25% bucket.** The verifier-hardening items below (MV-03/05/11, GIR-ladder) remain valid confident-wrong reducers and are NOT refuted — they were simply not the gates run this session.
- **Verifier hardening (reduces confident-wrong — serves the thesis directly):**
  - **MV-11 sibling-discriminator gate** (NEW) BEFORE softening MV-04: for the selected leaf, fetch enumerated siblings, identify separator axis, require L4 either cited the discriminating attribute OR selected "Other" by stated elimination. Only then convert MV-04 to a soft escalate-signal *within-chapter* (keep it a hard reject cross-chapter/hallucinated).
  - **MV-05 → GIR-ladder validator**: enforce GIR-1 exhausted before 2/3/4; 3(a)→3(b)→3(c) order; GIR-6 cited at the 6→8 leaf step.
  - **MV-03 → contiguous-span citation**: require normalized verbatim_text to be a contiguous substring (≥0.95 LCS) of the resolved source, preserve negations (`not/other/except/than`), resolve to a specific legal locus, flag polarity inversion. Rename the `TFIDF` constant.
- **"Other"-residual-by-elimination** L4 reasoning mode (a distinct selection path). — ⚠️ BUILT as gate-1, **NEUTRAL → REVERTED** (`2026-05-29-gate1-other-elimination-blueprint.md`); kept `isOtherLeaf` logic only.
- **QGS axis-selection quality** (the ~10 wrong-axis cases) + needless-ask reduction + ASK→single-code convergence. — **NOW THE LEAD LEVER (sibling-ASK).** Redesigned this session to a **POST-L4 uncertainty-gated** trigger (commit `e340990`, env-gated OFF): fires only when L4 returns CLASSIFY with `self_confidence` below `SIBLING_ASK_CONF_THRESHOLD`, the leaf is in a same-subheading sibling group, the discriminator is unpinned by the query, and a QGS question on that exact discriminator is buildable. v1 (PRE-L4 trigger, `a8b3630`) over-fired (33% ask-rate, −18.8pp) → FAILED. **Calibration in flight (r13 τ-sweep 0.45/0.65 vs r12); three-sided gate: OUTRIGHT preserved AND ask-rate ≤~15% AND recoverability ≥75% AND EFFECTIVE up.** Blueprint: `2026-05-29-sibling-ask-lever-blueprint.md`.
- **India-specific**: add scored axes for national-line (7th-8th digit) correctness and export-policy correctness; cover the 7 india_specific subheadings + WCO-2022-divergent lines; gate no-regression.
- Textile/confusing-pairs hardening, chapter notes, routing calibration.

### P2.5 — Enrichment schema & plumbing (gated, BEFORE bulk extraction).
- Per axis decide **CORE** (added to `QGS_DB_ATTRIBUTE_KEYS` + `gold-attributes-lookup` + QGS info-gain set → ASK-recoverable) vs **METADATA** (L4 sibling-diff only → outright-only). State the tradeoff per axis.
- ONE migration + `db/types.ts` + `getTariffLineAttributesForCodes` SELECT + L4 key lists + (if core) QGS/gold-lookup, writing into a **STAGING table / behind a column-set feature flag**. Gate the plumbing change flag-on with **ZERO rows** (proves no regression from schema alone).

### P3 — Aimed enrichment (background EXTRACTION, gated LANDING).
- **P2||P3 is NOT state-free** (L4 `computeSiblingDiscriminators` `L4-select.ts:324-383` is field-agnostic → new columns auto-enter the L4 prompt). So: EXTRACTION overlaps freely; **LANDING is a discrete flag-gated event with its own full-386 + held-out gate, never interleaved with an in-flight P2 gate.** Serialize at the gate boundary.
- O2 playbook: deterministic chunk manifest + content-addressed outputs (idempotent reruns); idempotent UPSERT keyed on code into staging; pre-ingest enum/type hardening vs `pg_constraint`; independent F4 audit every N chunks BEFORE promotion; corpus completeness (0 missing/dup) gates promotion. **Promotion to live = the gate; extraction is not.**
- **5-hour bucket rule**: do NOT co-run heavy extraction with a P2 gate eval in the same window — reserve bucket headroom for the gate + per-case attribution. Overlap at the *phase* level (across the week), not literally co-running inside one 5-h window.
- Validate ROI on HELD-OUT + adversarial probe, not the 19 visible cases. Pre-register: an axis is kept only if it moves held-out leaf accuracy.

### P4 — L6 Tiebreak / L7 Deep-Think — evidence-gated on the (now properly measured) verifier-over-rejection rate.

### P4.5 — Thin HTTP integration slice (moved earlier): `/api/classify/v2` behind a flag; run the 60-case smoke THROUGH the real Express path (not just in-process runner) + p95/cost check. De-risks P5 to a cutover.

### P5 — API rewire legacy→v2: flip the default route. Mechanical wrt the frozen transport DTO.

*(Later epoch: frontend rebuild → publish.)*

---

## 6. Operating discipline
- One principled change per **three-sided** measured gate; McNemar + per-case attribution (name target + at-risk caseIds) before trusting any delta; automated regression-guard blocks silent swaps.
- 60-case subset = **smoke/triage ONLY, never a gate**; full 386 (DEV) for any kept gate; confident-wrong + calibration on HELD-OUT only.
- Commit at every kept gate. Runtime stays Vertex. Build-time (Opus) $ is uncapped but the **5-hour bucket is the real constraint** — reserve headroom for gates.

## 7. Open items surfaced to user (proceeding on recommendation; flag if you disagree)
1. **Metric philosophy change**: OUTRIGHT-on-answered is now PRIMARY; "EFFECTIVE incl. ASK" demoted to a secondary UX metric + ask-rate cap ≤15-20%. (Customs files one code.)
2. **Held-out lock** reduces the iteration suite to ~256; ~130 cases run ≤3× total.
3. **REALITY suite** authoring would benefit from a handful of real exporter query samples (how your users actually phrase things) — otherwise hand-authored from domain knowledge.

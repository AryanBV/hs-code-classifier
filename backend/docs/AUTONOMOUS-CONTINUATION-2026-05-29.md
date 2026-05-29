## Autonomous Continuation Brief — HS Code Classifier (2026-05-29, CORRECTED)

ITC-HS v2 classifier. Branch: `feat/phase-4-pipeline-build`. Backend root: `backend/`.

---

### Post-compaction recovery protocol (do this FIRST)

1. Read this ENTIRE brief + `MEMORY.md` (keys: `project_vertex_m0_migration`, `feedback_calibrated_routing_not_restriction`, `feedback_root_cause_fix_not_patch`, `feedback_quality_first_best_in_class`).
2. `git log --oneline -3` — confirm HEAD is `059cf76` (checkpoint commit). `git status` — confirm clean working tree.
3. List `backend/eval-results/vertex-m0-*.json` — highest round is `vertex-m0-r7-sim`. Read its summary metrics (already reproduced below).
4. Reconcile: latest measured numbers + next gated action (per Priority Order). Only once you can state both with certainty, proceed.

---

### Committed state (HEAD 059cf76, 2026-05-29)

- **Branch:** `feat/phase-4-pipeline-build`
- **Working tree:** CLEAN (no uncommitted changes)
- **tsc:** clean (`npx tsc --noEmit` from `backend/` — zero errors)
- **Tests:** 702 tests pass (`npx vitest run src/classifier-v2 src/eval`)
- **eval-results/ directory:** gitignored per policy; JSON files present locally

---

### Architecture — v2 layers (all committed)

`backend/src/classifier-v2/`

- **L0** `layers/L0-normalization.ts` — alias map + composite flag
- **L1** `layers/L1-triage.ts` — Gemini 3.5 Flash, thinking_level=low
- **L2** `layers/L2-retrieval.ts` — **Vertex gemini-embedding-001 (1536-dim, HNSW cosine) + Gemini-Flash reranker + Postgres GIN-FTS dual**. Cohere is OFF the v2 runtime path (RERANKER env defaults to `gemini-flash`; EMBEDDING_PROVIDER defaults to `vertex`). `lib/embedding-provider.ts` and `lib/reranker.ts` are the factory sources of truth.
- **L3** `layers/L3-rules-filter.ts` — exclusions, multi-dest collapse, single-shot backtrack gate
- **L4** `layers/L4-select.ts` — Gemini 3.5 Flash with sibling-comparison-view (widened to 18 metadata discriminator cols), multi-signal context
- **L5** `layers/L5-verifier.ts` — 10 rules + predicate DSL + TF-IDF citation
- **QGS** `layers/QGS-generator.ts` — candidate-aware info-gain question generation (greedy, cap-3, floor-1, 6 core axes)
- **Orchestrator** `index.ts` — L0→L5 + repair loop + backtrack + ASK/QGS/REFUSE + continueWithAnswer/continueWithAnswers (Q-budget round-based cap)
- **Eval harness** `src/eval/runner.ts` (--simulate-answers opt-in), `src/eval/answer-simulator.ts`, `src/eval/gold-attributes-lookup.ts`

Key prompts: `backend/prompts/triage-v2.md`, `backend/prompts/select-v2.md`

---

### Eval round history (all on 386-case master suite, n_classify varies)

| Run | Routing | Chapter | Heading | 8-digit | Weighted | Notes |
|---|---|---|---|---|---|---|
| vertex-m0-baseline | 78.8% | 93.7% | 90.0% | 72.7% | 86.3% | Pre-R1; n=271 classify |
| vertex-m0-r1 | ~79% | — | — | — | 85.0% | Routing calibration; regression exposed |
| vertex-m0-r2 | 87.8% | — | — | 68.5% | 83.1% | +9pp routing; dilution introduces ~23 harder cases |
| vertex-m0-r3 | 84.9% | 93.5% | 89.5% | 69.4% | 85.1% | GIR-2(a) parts fix |
| vertex-m0-r4 | 86.2% | — | — | 68.7% | 83.5% | Host-candidate retrieval fix |
| vertex-m0-r5 | 87.0% | — | — | 67.0% | — | Sibling-view (7-core-field only; noisy) |
| **vertex-m0-r6** | **86.5%** | **92.4%** | **88.4%** | **68.0%** | **83.9%** | Widened sibling-view (+11 metadata cols); data ceiling confirmed |
| vertex-m0-r6-sim | 86.5% | 92.1%* | 87.5%* | 67.3%* | — | answer-sim ON (pre-QGS baseline); ask_recoverability 41.4% (12/29); *end-to-end metrics: ch 89.2/hd 85.5/8d 66.7 |
| **vertex-m0-r7-sim** | **86.4%** | **92.3%** | **88.0%** | **68.6%** | **83.9%** | QGS implemented; NO classify regression vs r6; ask_recoverability 25% (7/28) — MEASUREMENT GAP |

r7-sim end-to-end metrics (--simulate-answers): ask_cases=28, recovered=7, recoverability=25.0%, unanswerable=16, end-to-end 8d=66.5%. **Root cause of recoverability drop = HARNESS GAP** (gold-attributes-lookup.ts has no stored attribute matching 16/28 QGS-generated candidate-aware questions). QGS itself has 0 classify regression → KEEP QGS, fix harness first.

r6-sim classify-only metrics (separate from end-to-end): chapter 92.1, heading 87.5, 8-digit 67.3 (same pool, slightly different routing noise vs r6).

**Dilution note (established at r2-r6):** on the 266 shared-classify subset, 8-digit HELD 72.2% vs baseline 72.7% — headline drop is dilution (harder cases recovered into classify), NOT regression.

---

### Strategic orientation (locked after r4)

Routing recovery (R1-R4) hit diminishing returns. 8-digit has plateaued at ~68% across r4-r6 (noise band). Root cause breakdown of 56 heading-right/leaf-wrong cases:
- 37 (66%) have discriminating attr in tariff_line_attributes but L4 couldn't leverage them → FIXED by sibling-comparison-view (r5-r6); per-case wins verified (TC013 truck tyre now correct)
- 19 (34%) need NEW offline data (garment sizing, vehicle specs, surface treatment, fur species) → DATA ENRICHMENT required (O2-style batch)
- 0 retrieval misses

**~68% = DATA CEILING for current attributes.** Next lever = QGS (move borderline cases to ASK-then-correct) + data enrichment (19 gap cases, ~+5-6pp headroom).

---

### Priority order (next session)

1. **Fix answer-sim harness coverage** → run r8-sim → real QGS measurement gate. `gold-attributes-lookup.ts` covers only 6 discriminating-attribute columns; QGS now generates candidate-aware questions (may ask metadata cols like `fabric_construction`, `chemical_class`, etc.). Fix: widen the gold lookup to cover the QGS attribute set; also add fallback matching (option-label substring) when exact attribute value is absent. Confirm r8-sim shows ask_recoverability improvement vs r6-sim 41.4% baseline.

2. **DATA ENRICHMENT** (19 gap cases) — highest single lever for 8-digit headroom (~+5-6pp on shared-266 subset). Offline O2-style attribute batch for garment sizing attributes, vehicle weight/load specs, surface treatment codes, fur species fields. Measure on targeted per-case set, not just whole-suite delta.

3. **GT cleanup** — TC009 "fuel injection pump for car": Section XVII Note 2(e) excludes pumps → Ch.84 is legally correct; our output is right, GT is likely wrong. Audit and correct after user review. Log all suspected GT errors; never silently rewrite to inflate eval.

4. **Textile cluster** Ch.61/62/63 — silk saree→62 not 50, woven vs knitted discrimination.

5. **L6 Tiebreak / L7 Deep-Think** — build ONLY if verifier_rejected_but_correct rate proves need on the master suite.

6. **API rewire** legacy→v2 (`backend/src/api/classify.ts`) + frontend wizard + ship.

---

### Operating rules (user-set, must follow)

1. Quality-first, never reduce it. "Right thing at the right time." Best-in-class over hand-rolled.
2. Root-cause fixes, not patches. No eval-overfitting — changes must be general/principled. A green eval via hacks = false pass.
3. Measured gates, one change at a time. Apply ONE principled change → full master eval → compare → keep ONLY if the two-sided gate holds: target metric up AND wrong-code rate flat/down. Never stack unmeasured changes.
4. Orchestrate with dynamic workflows + as many agents as needed. After a delegated audit claims completeness, VERIFY yourself (grep) — agents miss sites.
5. Calibrated routing (not restriction). Classify when confident; ASK a relevant number of valid questions with real options; abstain only for genuine junk. Minimize wrong-codes AND needless asks/refuses together.
6. Runtime = Vertex (credit-covered) — never reintroduce a Cohere dependency. Cohere is OFF the v2 path entirely.
7. Unattended limits: no git commit/push, no deploy, no external data send.
8. Lean orchestrator — delegate bulk reading/analysis to agents; read only structured returns.
9. No questions until user returns; no time pressure. Quality must INCREASE at every step.

---

### Process lessons (from r1-r7)

- **Fast eval subset (~60 cases, ~5 min)** for iteration; full 386-case eval (~27 min) only at milestones.
- **Per-case attribution**: name the specific case IDs a fix targets AND cases at risk before trusting whole-suite deltas — noise band is ±1-2pp.
- **Run flag-off + flag-on evals in PARALLEL** to halve wall-clock measurement time.
- **Commit at every kept gate** — don't let N rounds of uncommitted changes accumulate.
- **Dilution-vs-regression**: always compare on the shared-classify subset, not raw headline (denominator drifts when routing changes).

---

### Parked for user review (do NOT auto-fix)

- **TC009 "fuel injection pump for car"**: GT expects Ch.87; Section XVII Note 2(e) legally excludes pumps → Ch.84 correct. Our output is right. Recommend GT correction after user review.
- **3 reranker regressions**: DB058/077/192 — adjacent-chapter false positives from sibling-view. Logged for later; no runtime fix yet.
- **Ambiguous cases** (silicone radiator hose, some rubber seals): defensible either way; candidates for confusing-pairs / ASK path.

---

### Commands

```
# Full master eval (~27 min, concurrency 8):
cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite master --run-id <id>

# With answer simulation:
cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite master --run-id <id> --simulate-answers

# Quick suite (~5 min):
cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite quick --run-id <id>

# Tests:
cd backend && npx vitest run src/classifier-v2 src/eval

# Typecheck:
cd backend && npx tsc --noEmit

# DB read-only probes (Supabase MCP preferred; these also work):
cd backend && npx tsx --require dotenv/config scripts/_check_progress.ts
```

---

### Ultimate bars

chapter ≥95% / heading ≥88% / **8-digit ≥75-82%** / routing ≥90% / weighted ≥87% / mean cost ≤$0.012/query / p95 latency ≤8s / verifier over-rejection ≤8% / ASK quality ≥95% targeted + ≥98% relevant / calibrated confidence / customs-officer-acceptable citations.

---

### Honest constraints

- 5-hour rolling usage limit shared across orchestrator + all subagents; resets 5hr from first prompt. This brief = lossless resume after reset.
- "Ultimate" is multi-session. Target strong MEASURED progress per gate, not completion-in-5h.
- Cohere Trial key is exhausted (1000/mo, exhausted 2026-05-28). Cohere is OFF the v2 path — this is a non-issue.

# EVAL_DESIGN.md — Frozen Metric Contract (Phase-0 Trust Spine)

**Status:** PRE-REGISTERED. Do NOT edit a definition here mid-optimization. Every
downstream gate depends on these numbers being computed exactly as written. A
metric change requires: (1) update this doc, (2) update the metric unit test, (3)
note the change in the commit. Implemented under TDD in `src/eval/`.

**Implementing files**
- `src/eval/metrics.ts` — pure statistical primitives (Wilson CI, McNemar, Brier, ECE, bootstrap, percentile). Unit tests: `metrics.test.ts`.
- `src/eval/runner.ts` `buildReport` — folds per-case `EvalDetail[]` into the report. Unit tests: `runner.test.ts`.
- `src/eval/scorer.ts` — per-case chapter/heading/code correctness (chapter=first2, heading=first4, code=full8 after `normalizeHSCode`).
- `src/eval/answer-simulator.ts` — ASK-recovery simulation + `deriveAnswerId` (gold→option matching). Unit tests: `answer-simulator.test.ts`.
- `src/eval/gold-attributes-lookup.ts` — gold oracle, reads the FROZEN fixture by default.
- `src/eval/compare.ts` — automated regression-guard. Unit tests: `compare.test.ts`.
- `src/eval/types.ts` — `EvalReport` / `EvalDetail` shapes (owned by the harness).

**Philosophy.** Compute BOTH OUTRIGHT and EFFECTIVE accuracy. **OUTRIGHT 8-digit on
the frozen population is the PRIMARY, gateable number** (customs files one code).
EFFECTIVE (incl. ASK recovery) is a SECONDARY UX ceiling. Never gate on the
routing-conditional number — it is dilutable.

---

## 1. Frozen scoring population (PRIMARY accuracy)

**Denominator (constant, routing-independent):** every NON-ERROR case carrying a
gold code (`expected_code !== undefined`). Call it `gold_code_cases` (= N).

- A gold case the system routed to ASK / REFUSE / anything-but-classify counts as
  a **MISS**, it is NOT dropped. (The runner now serializes `expected_*` on the
  ASK and REFUSE branches so these cases enter the population.)
- ERROR cases (infra failures: thrown exceptions + v2 `system_error`) are
  EXCLUDED from every accuracy/routing metric.

```
OUTRIGHT_chapter = |gold cases with chapter_correct| / N
OUTRIGHT_heading = |gold cases with heading_correct| / N
OUTRIGHT_code    = |gold cases with code_correct|    / N
```

Each is emitted as a `RateCI` (k, n, rate, Wilson 95% lower/upper) under
`report.primary_accuracy.{chapter,heading,code}`. **THIS is the gate metric.**

**Secondary diagnostic — `precision_when_classifying`** (the OLD routing-
conditional numbers): correct / |correctly-routed classify cases|. Emitted with
CIs under `report.precision_when_classifying`. NEVER gate on it; it shrinks its
own denominator when hard cases reroute to ASK (the dilution trap).

`report.classification.*` is retained as a LEGACY view (same conditional numbers,
no CI) for backward comparison only.

---

## 2. EFFECTIVE accuracy + population closure

**EFFECTIVE** = (outright-correct + ASK-recovered-correct within ≤2 rounds) over a
**CONSTANT denominator = the same `gold_code_cases` (N)** as §1. Wrong-after-ASK =
miss. A gold case that REFUSEd or was never simulated stays in the denominator as
a miss (this closes the REFUSE leak).

```
EFFECTIVE_x = (direct-classify-correct_x + ask-recovered-correct_x) / N   (x ∈ {chapter,heading,code})
```

Emitted as `RateCI` under `report.end_to_end_metrics.{effective_chapter,
effective_heading,effective_code}` (present only when `--simulate-answers` ran).
ASK-recovery is also emitted as k/n with a Wilson CI (`ask_recovery_ci`); **never
gate ASK-recovery at n < 30.** The legacy `end_to_end_*_accuracy` fields keep the
old recovered-only denominator and are deprecated in favour of `effective_*`.

**Population-closure assertion (`report.population_closure`).** The frozen gold
population is partitioned by routing, each bucket counted INDEPENDENTLY:
```
direct_classify     = gold cases with actual_routing 'classify'
ask_cases           = gold cases with actual_routing 'ask' AND an ask_recovery_attempt
refused_with_gold   = gold cases with actual_routing 'reject'
asked_not_simulated = gold cases with actual_routing 'ask' AND NO ask_recovery_attempt
```
Each bucket is a POSITIVE membership predicate (FIX-2) — NOT a catch-all
remainder. `buildReport` **THROWS** (fails the run) unless
`direct_classify + ask_cases + refused_with_gold + asked_not_simulated === scored_with_gold`.
A gold case whose `actual_routing` matches none of the four predicates makes the
sum `< scored_with_gold` and FIRES the assertion (a complement/remainder bucket
would have silently absorbed it). This guarantees the EFFECTIVE denominator can
never silently leak a case.

---

## 3. confident-wrong (headline harm metric)

**Definition:** the system delivered a CLASSIFICATION (`actual_routing ===
'classify'`) AND the 8-digit code was wrong (`code_correct === false`).

- **Answered set** = cases the system classified.
- `report.confident_wrong.count` = # confident-wrong; `rate` = count / answered,
  with Wilson CI; `case_ids` = the full list (for MANDATORY manual review — "would
  a competent CHA call this indefensible?").
- **Gate:** absolute count + manual review of every instance. NOT a threshold
  (unmeasurable at n=386).
- **Optional graded variant (`graded_tau_0_7`):** confident-wrong restricted to
  answered cases with `confidence ≥ 0.7`. COMPUTED for visibility, NOT a gate.
  Present only when ≥1 answered case carries a confidence. Confidence is derived
  from the v2 `self_confidence` enum (HIGH=0.9, MEDIUM=0.6, LOW=0.3 via the
  v2-adapter).

---

## 4. Calibration

Over classify cases carrying a confidence AND a binary correctness
(`report.calibration`, present only when ≥1 such case exists):

- **`brier_score`** (headline scalar) = mean of `(confidence − outcome)²`,
  outcome ∈ {0,1}. Lower better; 0 perfect, 1 maximally wrong.
- **`ece`** = Expected Calibration Error with **EQUAL-MASS bins (≤5)**: sort by
  confidence, split into ≤5 contiguous ~equal-count bins, weight each bin's
  `|accuracy − mean_confidence|` by its sample fraction. Equal-mass (not
  equal-width) avoids near-empty bins inflating ECE at small/clustered n.
- **`ece_ci`** = bootstrap CI for ECE: **1000 resamples WITH replacement, seeded
  deterministically** (mulberry32, fixed seed) → [2.5, 97.5] percentile band.
  Same input ⇒ same interval (gate reproducibility).
- **`reliability_bins`** = per-bin {count, mean_confidence, accuracy, conf_min,
  conf_max}: a DIRECTIONAL diagnostic only.
- **Never emit a "within 5%" claim — emit the CI.**

---

## 5. Per-metric CIs + paired comparison

- **`wilsonInterval(k, n, z=1.96)`** → `{k,n,rate,lower,upper}`. Attached to every
  emitted rate (primary, precision-when-classifying, confident-wrong, effective,
  ask-recovery). n=0 → rate 0, interval [0,1]. Bounds clamped to [0,1].
- **`mcnemar(before[], after[])`** on per-case correct/wrong vectors over the
  SAME population: returns `{n, b (correct→wrong), c (wrong→correct), statistic
  (continuity-corrected χ², df=1), pValue (exact two-sided binomial on discordant
  pairs)}`. Throws on length mismatch (a paired test needs an aligned population).
  Used by `compare.ts` for run-vs-run. The real binomial half-width is ±~4.6pp @
  386, ±~12pp @ 60, ±~18pp @ 28 — do NOT trust a raw ±1–2pp delta.

---

## 6. Automated regression-guard (`compare.ts`)

`perCaseCorrectVector(report)` → `Map<caseId, boolean>` where correctness =
`code_correct` for gold cases, else `routing_correct`; ERROR cases excluded.

`compareRuns(before, after, { signedOffRegressions? })` → `{ shared_population,
regressed_case_ids (correct→wrong), improved_case_ids (wrong→correct), mcnemar,
hasUnexplainedRegression }`, comparing ONLY the shared (present-in-both)
population. `hasUnexplainedRegression` is true iff ≥1 regression lacks explicit
sign-off — **this BLOCKS auto-acceptance of a gate.** The CLI exits 1 when blocked;
`--signoff id1,id2` marks reviewed regressions as accepted.

---

## 7. Latency + cost

- **`report.latency`** = `{median_ms (p50), p95_ms, sample_count}` via nearest-rank
  `percentile` over per-case `response_time_ms` (scored cases). Wall-clock under
  the eval's concurrency — a budget signal, NOT a production SLA.
- **`report.cost`** = `{est_total_usd, is_order_of_magnitude: true}` = Σ per-case
  `est_cost_usd` (each = `llm_calls × representative-per-call`, derived from the
  real price table). **ORDER-OF-MAGNITUDE ONLY** — real per-token instrumentation
  is deferred and requires a runtime change (NOT done here). The flag forbids
  treating it as billing.

---

## 8. Answer-sim `deriveAnswerId` matching (the one legit harness fix)

A gold attribute value matches a clarifying-question option when, in a CANONICAL
form (lowercase → collapse `[-_\s]+` to a single space → trim), the gold value:
1. equals the option's label, OR equals its slugified/canonical `id`; OR
2. passes the **GUARDED substring test** (`substringMatch`): one canonical form
   contains the other AND **both** of these hold —
   - **length-ratio floor:** `min(len)/max(len) ≥ 0.6` (so a short label that is a
     minor TOKEN of a longer multi-word gold is rejected: `steel`⊂`alloy steel` →
     0.45 → REJECT; while a morphological variant passes: `roast`⊂`roasted` →
     0.71 → ACCEPT). A whole-word check does NOT fix this (`steel` is a whole word
     in `alloy steel`); only the coverage ratio distinguishes the two.
   - **negation polarity:** the two must agree on a leading negation token
     (`non/not/un/no/without/free`) — a polarity inversion is never a match
     (`alloy steel`⊂`non alloy steel` → 0.73 clears the ratio but opposite meaning
     → REJECT). Both sides must be ≥2 chars.

**Honesty invariants (must never regress):**
- Escape / non-substantive options (`other`, `none`, `none of the above`, `not
  sure`, `unknown`, `not applicable`, `na`) NEVER count as a found answer, even on
  a canonical-exact match — that would fabricate a recovery.
- The substring rule never bridges a minor-token overlap or a negation polarity
  inversion (FIX-1) — it only bridges genuine morphological variants.
- A gold value with no matching real option → `answer_found:false` (unanswerable);
  the simulator stops and does NOT fabricate an answer.

This fixes the dominant false negative (hyphen/space/underscore/case skew between
raw gold DB strings like `alloy-steel` and title-cased labels like `Alloy Steel`)
WITHOUT loosening matching into manufactured recoveries.

---

## 9. Oracle decontamination (gold source)

`getGoldAttributeValues(code, attribute)` reads the **immutable P0 snapshot
fixture** `src/eval/fixtures/gold-attributes-frozen.json` by DEFAULT (object keyed
by code → the 6 core columns material/form/function_/intended_use/
processing_state/composition). The live `tariff_line_attributes` read is behind
`GOLD_ATTR_SOURCE=live` (regeneration/debug only). Regenerate with:
`npx tsx --require dotenv/config scripts/snapshot-gold-attributes.ts`.

Rationale: P3 enrichment will rewrite the live table; reading it live would let
ASK-recovery self-grade (the oracle handed the model the answer it later learned).
With the frozen fixture, an ASK-recovery move in P3 reflects QGS+L4 genuinely
using new RUNTIME data — not a contaminated oracle. Signature + null-when-absent
semantics are unchanged by the source switch.

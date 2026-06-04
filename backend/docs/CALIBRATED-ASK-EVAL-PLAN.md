# Calibrated Cross-Subheading ASK — Eval Plan (write-only; do NOT run)

**Status:** plan only. The lever is BUILT behind `CROSS_SUBHEADING_ASK_ENABLED`
(default OFF). Running this eval requires (a) USER-GATED gold additions and (b) a
capped paid Tier-1 Gemini key (the free tier is too small to eval — see
`free-tier-5rpm-limit`). **Do not enable the flag in prod until this gate passes.**

This plan is the prod-flip gate for the cross-subheading ASK lever (the "frozen
chicken" → ASK whole(0207.12) vs cuts(0207.14) fix). The build, the O6 axis table,
the pure gate/abstention logic, and the deterministic logic tests are already
committed; this document specifies what must be MEASURED before the flag flips on.

---

## 0. What the lever changes (recap, for the reviewer of the eval)

- It is a POST-L3 gate (before L4) gated by `CROSS_SUBHEADING_ASK_ENABLED='true'`.
- It fires ONLY when ALL of: (a) L3 survivors concentrate into 2+ different
  subheadings of an O6 forced-choice-axis heading spanning 2+ macro-classes, (b)
  the query is SILENT on that axis (`isAttributePinnedByQuery` false), (c)
  retrieval is NOT decisive (small cross-subheading rerank margin), and (d) the
  calibrated abstention score ≥ floor. The abstention score REPLACES the raw
  `self_confidence` enum for this decision.
- The axis table is small and corpus-derived (form axis: 0201, 0202, 0204, 0207).
- On fire it emits an ASK with `trigger:'cross_subheading'`, options drawn from the
  table macro-classes (so the gold leaf's class is always selectable).

The eval must prove the lever **recovers the bug class without over-asking** and
holds outright/top-3/confident-wrong flat-or-better.

---

## 1. Extended gold cases (USER-GATED — do not add without approval)

All new cases enter the master suite (`backend/src/eval/test-suites/master-suite.ts`)
and the frozen denominator only after the user approves the gold codes (gold/eval
changes are user-gated). Group A = should-ASK; Group B = paired should-NOT-ask
(terse-complete) negatives that guard against over-fire.

### Group A — should-ASK cross-subheading silent-discriminator cases (~10-12)

Each is a query that pins every axis EXCEPT the forced-choice axis, so the correct
behaviour is ONE answerable question, then the gold 8-digit code after the gold
answer is fed back (`--simulate-answers`). `expected_routing: 'ask'`;
`expected_code` = the leaf reached after the gold-true answer.

| id | query | heading | silent axis | gold-after-answer | family |
|---|---|---|---|---|---|
| XSUB-A01 | `frozen chicken` | 0207 | form (whole/cut) | 0207.12.00 (whole) | food/poultry — THE bug |
| XSUB-A02 | `frozen chicken cuts` | 0207 | (form pinned → control: still answerable) | 0207.14.00 | food/poultry |
| XSUB-A03 | `fresh chicken` | 0207 | form | 0207.11.00 (whole) | food/poultry |
| XSUB-A04 | `frozen beef` | 0202 | form (carcass/cuts) | 0202.10.00 | food/bovine |
| XSUB-A05 | `fresh beef` | 0201 | form | 0201.10.00 | food/bovine |
| XSUB-A06 | `frozen mutton` | 0204 | form | 0204.30.00 | food/sheep |
| XSUB-A07 | `frozen turkey` | 0207 | form | 0207.25.00 | food/poultry |
| XSUB-A08 | `frozen duck` | 0207 | form | 0207.42.00 | food/poultry |
| XSUB-A09..A12 | 3-4 analogues sourced as the axis table is EXTENDED to processing_state / intended_use (textile knit-vs-woven, metal wrought-vs-cast, etc.) — added with the table extension, NOT before. | — | — | — | textile/metal |

NOTE on A02: the gold value for `form` IS pinned ("cuts"), so the lever must NOT
fire and the case must still classify correctly outright. It belongs in Group A
only as the in-family "axis pinned" control; score it as should-NOT-ask.

The textile/metal analogues (A09-A12) are placeholders: the committed table covers
only the form axis (meat/poultry). They are added in the SAME user-gated change that
extends the table (with their own corpus derivation), so the eval spans
food + textile + metal as the prompt requires. Until then the runnable Group A is
the meat/poultry set (A01, A03-A08) + the A02 control.

### Group B — paired should-NOT-ask terse-complete negatives (~8-10)

Queries that ARE complete (pin the forced-choice axis) or land in a heading WITH a
residual default — the lever must classify directly, NO ask. These are the
over-ask guard.

| id | query | why no-ask | gold |
|---|---|---|---|
| XSUB-B01 | `whole frozen chicken` | form pinned (whole) | 0207.12.00 |
| XSUB-B02 | `boneless frozen chicken` | form pinned (cuts) | 0207.14.00 |
| XSUB-B03 | `frozen beef carcass` | form pinned | 0202.10.00 |
| XSUB-B04 | `raw coffee beans` | 0901 has residual "Other" → unmarked-default-wins | (existing gold) |
| XSUB-B05 | `frozen pork` | 0203 has a residual "Other" cut (excluded from table) | (existing gold) |
| XSUB-B06 | `stainless steel hex bolts M10` | not a table heading | 7318.15.00 |
| XSUB-B07..B10 | existing terse-complete master-suite cases re-tagged as over-ask negatives (no new gold). | — | — |

Group B should mostly REUSE existing master-suite cases (re-tagged), minimizing new
gold. B04/B05 specifically assert the residual-default and table-exclusion paths.

---

## 2. New report metrics — over-ask / under-ask

Add to `EvalReport` (and `generate-report.ts`) two rates over the frozen gold-code
population, computed from `routing.confusion_matrix` + per-case `ask_trigger`:

- **`classify_as_ask` rate (OVER-ASK):** of gold cases whose `expected_routing` is
  `classify` (terse-complete), the fraction the system routed to ASK. Already
  present as a confusion-matrix cell; surface it as a Wilson-CI RATE and split by
  `ask_trigger` so the cross-subheading lever's contribution is isolated
  (`cross_subheading_over_ask`). THIS is the metric that catches a repeat of the
  prior 33% over-fire.
- **`ask_as_classify` rate (UNDER-ASK):** of gold cases whose `expected_routing` is
  `ask` (Group A silent-discriminator cases), the fraction the system answered
  directly (guessed) instead of asking. The bug today is 100% under-ask on
  XSUB-A01; the lever should drive this toward 0 WITHOUT inflating over-ask.

Both are additive (present only when the suite carries `expected_routing:'ask'`
cases). Add a `cross_subheading_ask` sub-block mirroring the existing
`sibling_ask_*` end-to-end metrics:
- `cross_subheading_ask_count`, `cross_subheading_ask_recovered_correct`,
  `cross_subheading_ask_recoverability_rate` (of the cross-subheading ASKs, the
  fraction that reach the correct 8-digit code after the gold answer — the
  "questions we ask must be answerable" signal; target ≥ 90% by construction since
  options come from the table macro-classes).

Add unit tests in `metrics.test.ts` for the two new rates (hand-computed values),
matching the existing trust-spine discipline (no formula changes without a test).

---

## 3. Free-key iteration subset (curated, 35-50 cases)

For threshold sweeps on the FREE key (or local), use a curated subset that exercises
the lever heavily without burning the daily cap:

- ALL of Group A (~8-12 runnable) + ALL of Group B (~8-10) — the lever's direct
  signal.
- ~15-20 in-family neighbours from the existing suite (other meat/poultry/coffee
  cases) to catch collateral over-ask within the same chapters.
- ~5 unrelated terse-complete controls (fasteners, electronics) to prove the lever
  is inert off-table.

Total ~35-50. Run with `--simulate-answers` and `--ids <subset>`. Iterate the two
env knobs (`CROSS_SUBHEADING_ASK_MARGIN`, `CROSS_SUBHEADING_ASK_ABSTENTION`) on this
subset until: under-ask on Group A → near 0, over-ask on Group B → 0, recoverability
→ ~100%. Lock the chosen thresholds (defaults: margin 0.05, abstention 0.50).

```
cd backend && npx tsx --require dotenv/config src/eval/runner.ts \
  --suite master --simulate-answers --ids XSUB-A01,XSUB-A03,...,XSUB-B10 \
  --run-id xsub-iter-<n>
# then sweep:
CROSS_SUBHEADING_ASK_ENABLED=true CROSS_SUBHEADING_ASK_ABSTENTION=0.6 npx tsx ... 
```

---

## 4. Full paid-key flip gate (three-sided + over/under-ask + confident-wrong)

Run the FULL master suite (385 cases / 343 gold-code frozen denom) TWICE on a capped
paid Tier-1 key: a BEFORE run with the flag OFF (the frozen reference) and an AFTER
run with `CROSS_SUBHEADING_ASK_ENABLED='true'` + the locked thresholds. Compare with
`src/eval/compare.ts`. The flag flips ON in Railway ONLY if ALL hold:

1. **Three-sided accuracy gate (unchanged bars):**
   - OUTRIGHT 8-digit: not WORSE than the frozen ~77% beyond LLM noise (McNemar
     p not significant for a regression; a small dip is acceptable IF top-3 and
     recoverability rise — the lever converts some outright-correct-by-luck guesses
     into asks, which is the intended trade).
   - TOP-3 8-digit: held or improved (~86%+).
   - chapter ≥ ~89% and heading ≥ ~86% held.
2. **Over-ask gate:** `classify_as_ask` (cross_subheading slice) over Group B and
   the full terse-complete population is ~0 (hard ceiling: the lever must not add
   over-ask beyond the existing baseline rate — explicitly NOT the prior 33%).
3. **Under-ask gate:** `ask_as_classify` on Group A drops materially vs the frozen
   run (the bug class is recovered); recoverability of the cross-subheading ASKs
   ≥ 90%.
4. **Confident-wrong gate:** confident-wrong count FLAT or DOWN vs frozen (the
   lever should REDUCE confident-wrong by converting confident-wrong guesses on
   silent-discriminator cases into asks — never increase it).
5. **Cost/latency:** the lever ADDS at most one PK description lookup per fired case
   and SAVES the L4/L5/repair cost on a fired case (it asks before L4), so p95 and
   cost must be flat-or-better. Confirm no per-case cost regression.

Gate verdict is emitted by `compare.ts` (extend its three-sided verdict to also
print the over/under-ask deltas). One principled change, one measured gate.

---

## 5. Rollback

`CROSS_SUBHEADING_ASK_ENABLED` unset/anything-but-`'true'` → the lever returns null
with zero work, byte-identical to the committed default (proven by the GATE-OFF
orchestrator test). Instant rollback = unset the env var in Railway. No code change,
no redeploy of logic.

---

## 6. Open items before the flip

- [ ] USER approves Group A + Group B gold additions (§1).
- [ ] Extend the O6 axis table to processing_state / intended_use with a corpus
      derivation (unlocks the textile/metal analogues A09-A12) — separate
      user-gated change.
- [ ] Implement the two new report metrics + their `metrics.test.ts` unit tests (§2).
- [ ] Capped paid Tier-1 key enabled with a cost ceiling + the cost log live.
- [ ] Run §4; if green, flip the flag in Railway and commit the kept gate.

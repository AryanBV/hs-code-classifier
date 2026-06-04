# O7 — Atomic-Axis Typing + Residual-Default Detection (derivation record)

**Build-time job (Stage S2). No Gemini. Corpus-only (`tariff_lines` +
`tariff_line_attributes`). DARK — not wired to any live path until S4/S5.**

## What this produces and why

The Stage S4 divergence engine needs, for every MULTI-leaf subheading (a 6-digit
`NNNN.NN` carrying ≥2 eight-digit `tariff_lines`), a structural answer to two
questions:

1. **Atomic-axis typing.** The tokens fused inside the TLA attribute arrays (and
   leaf descriptions) actually encode SEVERAL independent concept-axes at once.
   Coffee is the canonical case: a single `processing_state` array
   `raw | not-roasted | not-decaffeinated | cherry | dry-processed | graded-AB`
   carries the *roasted*, *decaffeinated*, *coffee-form*, *processing-method* and
   *grade* axes simultaneously. This job **un-fuses** them into NAMED axes so the
   engine can ask ONE clean question per axis instead of one jumbled question over
   a soup of tokens.
2. **Residual-default detection.** Does the subheading carry an `Other` / `n.e.s.`
   catch-all leaf, and which code? When a residual exists, the project's
   **unmarked-default-wins** rule means a query silent on the axis defaults there
   and the engine must **not** ask.

Output `atomic-axes.json` is the committed runtime artifact; the loader
(`backend/src/classifier-v2/lib/atomic-axis-table.ts`) reads ONLY that JSON.

## The core transform: an "axis" is a token-group that VARIES across the leaves

The TLA arrays largely REPEAT the subheading-defining tokens on every leaf (every
`5208.52` leaf is `printed | plain-weave | weight-100-to-200gsm`). Those shared
tokens DEFINE the 6-digit subheading; they do **not** discriminate its leaves. The
discriminating signal is exactly the tokens that VARY across the leaves. So the
derivation:

1. Maps every leaf token through a **concept-axis dictionary** (`token -> named
   axis`), built from the corpus's actual top within-subheading varying tokens; the
   groupings are HS-sensible. The dictionary has two layers:
   - **exact-token axes** (e.g. `thermal {fresh-or-chilled, frozen}`,
     `presentation {whole, cut, offal}`, `coffee_form {plantation, cherry,
     parchment}`, `grade {A,B,C,AB,PB,bbb,bulk}`, `roasted`, `decaffeinated`,
     `polymer {PE, PP, PVC…}`, `fiber_type {cotton, silk, wool, synthetic…}`,
     `textile_finish`, `weave`, `fabric_weight`, `end_use`, `machine_part`,
     `vehicle_type` …), and
   - **pattern-rule axes** for systematic numeric bands the corpus encodes as token
     families — `power_rating` (`power-1000kw-to-5000kw`), `capacity_rating`
     (`…kva…`), `diameter_band` (`outer-diameter-…`), `container_size`,
     `seat_capacity`. The token itself is the band value-id.
2. Builds, per axis, a `value-id -> {leaf codes}` partition over the sub's leaves.
3. KEEPS an axis as discriminating iff its values VARY (≥2 distinct value-ids
   present). A uniform axis (same value on every leaf) is subheading-defining and is
   dropped.
4. Records tokens that map to NO axis but DO vary across leaves as
   `unclassified_varying`, so coverage is honest and measurable.

## Classification of each multi-leaf sub (mutually exclusive)

| class | meaning | engine behaviour |
|---|---|---|
| `residual_default` | has a bare `Other`/`n.e.s.` catch-all leaf | do NOT ask — a silent query defaults to the residual (unmarked-default-wins) |
| `askable_no_residual` | ≥1 discriminating axis typed AND no residual | ask one clean per-axis question |
| `single_axis_resolved` | exactly one axis, every value -> exactly one leaf, no residual | one question fully resolves the sub (shortcut subset of askable) |
| `untypable` | leaves differ but on NO typed axis | FAIL-SAFE — let the brain classify (never ask a jumbled question) |

Residual detection is description-primary: `BARE_RESIDUAL_RE =
/(^|:\s*|-+\s*)(other|others)\s*$|n\.?e\.?s|not elsewhere (specified|included)|not specified/i`,
with the `.90`/`.99` code tail as a SECONDARY corroborating signal (some `.90`
lines are real named products, e.g. `0901.90.20 Coffee substitutes`, and some
residuals are not `.90`, e.g. `.19`/`.29 Other`).

## Result (2026-06-04)

Over **2,241 multi-leaf subheadings**:

| classification | count |
|---|---|
| `residual_default` | 1,991 |
| `askable_no_residual` | 50 |
| `single_axis_resolved` | 54 |
| `untypable` | 146 |

- **askable (no residual) = 104** (`askable_no_residual` 50 + `single_axis_resolved`
  54). The synthesis pre-estimate was ~191; the actual corpus-grounded number is
  **104** — see "Why not ~191" below.
- **Residual-detection coverage = 88.8%** (1,991 / 2,241 subs carry a residual;
  independently SQL-verified: exactly **250** multi-leaf subs have NO residual, so
  askable ≤ 250 by construction).
- **Fully-typed (≥1 axis, zero varying unclassified tokens) = 5.3%** (118 subs).
  Most subs are `residual_default` and so are never asked regardless of typing
  completeness; `fully_typed_pct` is a strict honesty metric, not the operational
  one.
- 36 concept-axes are in use; top axes by sub-count: `end_use` (300),
  `physical_form` (291), `textile_finish` (79), `fiber_type` (51),
  `machine_part` (28), `chem_structure` (28), `embellishment` (28).

### Hand-verified high-value families

- **Meat 0207 / 0201 / 0202 / 0204 — ZERO multi-leaf subheadings.** Every meat
  subheading is single-leaf; the thermal × presentation split for meat is
  **cross-subheading** (0207.12 whole vs 0207.14 cuts) and is owned by the O6 table,
  NOT by within-subheading S2 typing. S2 correctly emits nothing for them. (This is
  the most important honesty finding: the meat axes the prompt names live one level
  up.)
- **Coffee 0901.11** — the canonical fused-array case. The single `processing_state`
  array un-fuses into THREE axes: `coffee_form {cherry, parchment, plantation}`,
  `process_method {dry, wet}`, `grade {A,B,C,AB,PB,bbb,bulk}`. Has a `.90` residual
  → `residual_default` (engine must not ask; unmarked-default-wins). 0901.21 / .22 /
  .90 also residual_default.
- **Cotton 5208** — all 19 multi-leaf subs are `residual_default` (each has a `.90`
  Other). Typed axes include `end_use {apparel, household}`, `weave`,
  `weaving_method {handloom, mill}`. The named-fabric discriminators (Dhoti / Saree /
  Cambric / Mull / Voile …) live in `form` as one-off product names and remain
  `unclassified_varying` — but since every 5208 sub has a residual, classification is
  correct regardless.
- **Plastics 3923** — all multi-leaf subs (`.10/.29/.30/.50/.90`) are
  `residual_default` (each has a `.90` Other). Correct: a plastic-article query silent
  on the article kind defaults to the residual.

### Why not ~191

The synthesis expected ~191 `askable_no_residual` subs. The corpus-grounded ceiling
is **250** (the count of multi-leaf subs with no residual leaf — SQL-verified). Of
those 250, **104** are cleanly typable into named MECE concept-axes; the other 146
are `untypable` because their discriminator is an **idiosyncratic per-chapter
description name** (fish species `0302.91`; tools `spanner`/`wrench`; print products
`journal`/`newspaper`; `mitt`/`mitten`; `bull`/`cow`/`calf`; etc.) that does NOT form
a clean, recurring concept-axis. **29 of the 146 have no varying array token at all**
(leaves are array-identical, discriminated purely by free-text species/product names).

Forcing those into a catch-all `article_kind` axis was rejected: it would produce
exactly the jumbled, low-precision question S2 exists to prevent, and would repeat the
prior PRE-L4 sibling trigger's ~33% over-ask. Following the O6 precedent
(**precision over recall**) and the project's anti-over-ask rule (ASK must be
uncertainty-gated), the table reports the honest 104 and marks the rest `untypable`
(fail-safe → the brain classifies). The 146 untypable + 48 partial-coverage subs are
the candidate list for later per-family adjudication if recall ever needs raising.

## Re-running

```
cd backend && npx tsx --require dotenv/config \
  data/build-time/O7-atomic-axis-typing/derive-atomic-axes.ts
```

Requires `DATABASE_URL` (read-only). Deterministic: re-running reproduces
`atomic-axes.json` + `stats.json` byte-identically from the same corpus. To improve
recall, extend the `AXIS_DEFS` exact dictionary or the `PATTERN_AXES` rules in the
script (each addition is a corpus-verifiable, HS-sensible concept-axis) and re-run.
```

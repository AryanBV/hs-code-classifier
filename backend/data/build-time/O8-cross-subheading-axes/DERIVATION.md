# O8 — GENERAL Cross-Subheading Axis derivation (record)

**Build-time job. No Gemini. Corpus-only (`tariff_lines` + `tariff_line_attributes`
+ `subheadings.title`).** Supersedes **O6** (`../O6-cross-subheading-axes/`).

## What this is, and what it replaces

O6 hand-curated ONE `FORM_AXIS` vocabulary (whole vs cut) and emitted a five-row
table (meat `0201`/`0202`/`0204`/`0207` + coffee `0901`). It was precise but NOT
general — it only knew the two forks a human wrote.

O8 derives, for **EVERY** 4-digit heading with ≥2 child subheadings, the axis (or
axes) on which its child subheadings split — **data-driven, across the whole
corpus**, using signals present everywhere:

- **FK code-nesting** (`tariff_line` → 6-digit subheading → 4-digit heading), and
- the **O2 typed attributes** (`tariff_line_attributes`), un-fused into the
  **shared O7 concept-axis namespace** via the SAME dictionary O7 uses
  (`../O7-atomic-axis-typing/derive-atomic-axes.lookupToken`).

Because both levels name axes in the identical O7 namespace (`presentation`,
`thermal`, `roasted`, `metal_working`, …), the cross-sub fork and the within-sub
fork **compose**: O7 runs `partitionByAtomicAxis` *within* one subheading; O8 runs
the SAME partition logic ONE LEVEL UP — *across* the sibling subheadings.

## Why NOT subheading dash-text mining

The `:` / `--` dash delimiters that would let us read a subheading's level are
**absent on ~50% of subheadings** (verified). So text mining is unreliable as a
DETECTOR. O8 detects **structurally** (attribute partition over the FK tree) and
uses the subheading title text ONLY as a **labelling overlay** where present
(~45%) — never as the detector.

## The structural detector + confidence

For each heading with ≥2 child subheadings:

1. **Aggregate** each child subheading's leaves' typed attributes UP to ONE
   *dominant* value per O7 axis — the value carried by a clean majority of the
   sub's leaves (`O8_SUBHEADING_DOMINANCE_MIN`, default **0.75**, deduped per leaf
   per axis). A single dissenting/noisy leaf (O2 enum noise ≈ 4.5%) cannot flip a
   subheading's class; a sub with no clean majority is `mixed`.
2. **Residual exclusion.** A child subheading that is itself a bare
   `Other` / `n.e.s.` residual (e.g. `0901.90`, `0203.19`/`0203.29`) is the
   heading's catch-all. Exactly as O7 excludes a residual LEAF from a sub's
   value-classes, O8 excludes a residual SUBHEADING from a heading's value-classes:
   it is **recorded** in `residual_subheadings`, never anchors a class, and is NOT
   in the confidence denominator. (This is the GENERAL rule that reproduces O6's
   deliberate `0901.90` drop.) We do **not** auto-exclude the heading — axis
   PRIMACY decides ask-vs-default downstream; O8 only reports the signal.
3. **Detect** the dividing axis: for each O7 axis the (non-residual) sub→dominant
   map IS the partition. An axis DIVIDES the heading iff ≥2 distinct dominant
   values appear across ≥2 subheadings, AND the partition is clean above the
   **structural-confidence floor** (`O8_STRUCTURAL_CONFIDENCE_MIN`, default
   **0.60**) — the share of *non-residual* child subheadings that received a single
   clean dominant value on the axis. A heading whose subs are mostly `mixed` /
   untyped on every axis (the 8708 "every sub is a distinct named part" shape)
   scores below the floor on all axes → **no spurious axis**.
4. **Honest backlog.** When NO axis clears the floor (the dividing axis is outside
   the O7/TLA schema — fish *species* in 0303, idiosyncratic free-text headings),
   the heading is emitted to `unclassified_varying` (in `stats.json`) with the
   `axis::value` signals that varied. We **never fabricate** an axis (fail-safe →
   the engine just classifies).

A leaf token maps to its axis-value via the O7 column-scoped dictionary
(`lookupToken(col, token)`), so a `solid` physical-form token in `form` never
collides with a chemistry token. Residual detection uses an **O8-local**
word-boundary regex, NOT O7's `isResidualDescription` (whose unanchored `n.?e.?s`
alternation mis-matches the substring "nes" inside long species-list fish titles
like "sardiNES"; O7 only ever ran it on short leaf descriptions where that never
bit). The O8 regex still matches every genuine residual the examples expect.

## Emitted artifact (`axes.json`)

Shape-compatible with the O6 loader's `entries[]`. Each entry:

| field | meaning |
|---|---|
| `heading` | 4-digit heading |
| `axis` | **O7 concept-axis name** (shared namespace) — additive vs O6 |
| `attribute` | QGS `AttributeKey` the axis maps to (runtime back-compat: `form` / `processing_state` / `intended_use`) |
| `classes` | value-id → `{ values, subheadings, example_code, label }` (≥2 classes) |
| `question_text` | plain-trade-language question (from the O7 language overlay) |
| `notes` | derivation provenance (confidence, classed/total subs, residual subs) |
| `all_axes` | **full multi-axis detail** for the heading (dark-only; ignored by the loader) |
| `residual_subheadings` | recorded residual subs (not load-bearing) |

The runtime entry surfaces ONE **runtime-primary** axis per heading (the loader's
`byHeading` is one-entry-per-heading; the dark lever's consumer is unchanged). The
primary = the highest-PRIMACY runtime-loadable axis, with a documented penalty that
pushes the commonly-pinned `thermal` BELOW an equally-primary not-usually-pinned
axis — so we surface the **silent fork** worth asking (the "frozen chicken" query
pins thermal, so the fork to ask is presentation). This reproduces O6's choices
(`0207` → presentation/form, `0901` → roasted) as a general heuristic, not a
per-heading hack. The full unpenalised set stays in `all_axes`.

`composition`-primary axes (polymer, fibre) are derived and reported but marked
`runtime_loadable:false` (the runtime `ALLOWED_AXES` is `form`/`processing_state`/
`intended_use` only), so they never leak a new ask attribute onto the live path —
they live in `all_axes` for downstream/dark composition.

## Coverage (2026-06-04, floor 0.60 / dominance 0.75)

| metric | value |
|---|---|
| headings with ≥2 child subheadings | **957** |
| headings with a clean cross-sub axis | **252 (26.3%)** |
| `unclassified_varying` backlog | **705** |
| runtime-loadable entries (`axes.json`) | **228** |
| dark-only (composition-primary) | **24** |
| multi-axis headings | **44** |

Top axes: `machine_part` 91, `physical_form` 64, `end_use` 55, `fiber_type` 22,
`textile_finish` 12, `thermal` 8, `presentation` 7, `chem_structure` 7,
`metal_working` 7, `worked_state` 5, `weave` 4, `roasted` 2, `decaffeinated` 1, …

The ~74% that land in `unclassified_varying` is the **honest** number: their
dividing axis is genuinely outside the typed schema (species, free-text grades,
g/m² where untyped, idiosyncratic single-product headings) OR every sub is a
distinct named thing with no MECE two-classing. This is a founder-gated backlog
(extend the O7 dictionary, or accept the engine classifies), NOT a gap to paper
over with a fabricated axis.

## Hand-verified instances (all fall out of the GENERAL pass)

| heading | product | derived cross-sub axes | notes |
|---|---|---|---|
| `0207` | poultry | **presentation** {whole, cut, offal} **+ thermal** {fresh/chilled, frozen} | the canonical "frozen chicken" bug: thermal is query-pinned, presentation is the silent fork → runtime-primary = presentation. Bug pair `0207.12`∈whole, `0207.14`∈cut. conf 1.0 |
| `0901` | coffee | **roasted** {not_roasted, roasted} **+ decaffeinated** | runtime-primary = roasted (`0901.11/.12` not-roasted vs `0901.21/.22` roasted). `0901.90` husks = residual sub, excluded from both classes (reproduces O6). conf 1.0 |
| `0201`/`0202` | bovine | **presentation** {whole, cut} | `0201.10` whole vs `0201.20/.30` cut. conf 1.0 |
| `0204` | sheep/goat | **presentation** {whole, cut} **+ thermal** {fresh, frozen} | conf 1.0 |
| `0303` | frozen fish | — (`unclassified_varying`) | the dividing axis is fish SPECIES, which is description-text-only and outside the typed schema → honest backlog (correctly no fabricated axis) |
| `7304`/`7306` | steel pipe | — (`unclassified_varying`) | seamless-vs-welded splits ACROSS headings (7304 seamless / 7306 welded), not WITHIN a heading, so it is correctly NOT surfaced as a cross-sub axis |
| `5208` | cotton fabric | **textile_finish** {unbleached, bleached, dyed, yarn_dyed, printed} **+ weave + fabric_weight** | a 5-way finish fork — stronger than expected (O7 types the finish from `processing_state`) |
| `2902` | cyclic hydrocarbons | **chem_structure** {saturated, aromatic} | a chemical-heading instance; chem_structure is INCIDENTAL primacy |
| `8708` | vehicle parts | — (`unclassified_varying`) | **negative control**: each sub is a distinct named part; no axis two-classes them → no spurious axis ✓ |

## Re-running

```
cd backend && npx tsx --require dotenv/config \
  data/build-time/O8-cross-subheading-axes/derive-cross-sub.ts
```

Requires `DATABASE_URL` (build-time only; no Gemini, no paid API). Tunable env
knobs: `O8_STRUCTURAL_CONFIDENCE_MIN` (0.60), `O8_SUBHEADING_DOMINANCE_MIN` (0.75).
Re-running reproduces `axes.json` + `stats.json` deterministically from the corpus.

## How O6 is superseded + the loader repoint

`backend/src/classifier-v2/lib/cross-subheading-axis-table.ts` now reads
`O8-cross-subheading-axes/axes.json` (was O6). The artifact is shape-compatible
(`entries[]` with the same per-entry fields), so the dark lever's pure consumer
(`lib/cross-subheading-ask.ts`, gated default-OFF) is **byte-identical**. The
loader additionally parses the optional `axis` (O7 namespace) field for downstream
composition; it ignores `all_axes` / `residual_subheadings`. O6 is left in place as
the historical record. Live-path files (QGS-generator, `index.ts`, `classify.ts`,
`v2-api-adapter.ts`) are untouched.

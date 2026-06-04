# O6 — Cross-Subheading Forced-Choice Axis Table (derivation record)

**Build-time job. No Gemini. Corpus-only (tariff_lines + tariff_line_attributes).**

## The bug this targets

An adversarial re-audit found that `"frozen chicken"` returns a HIGH-confidence
`0207.12` (whole bird, frozen) when it should ASK **whole bird (0207.12) vs cuts
(0207.14)**. The query pins `processing_state = frozen` but is **silent on `form`**
(whole vs cuts). Both `0207.12` (whole) and `0207.14` (cuts) survive — and they are
in **different 6-digit subheadings**.

The existing sibling-ASK apparatus (`maybeSiblingAskPostL4`,
`computeSiblingRerankMargin`, `selectedSubheading = code.slice(0,7)`) is
**same-subheading only**, so it structurally cannot fire here. The surfaced
confidence is also a raw, uncalibrated `self_confidence` enum (documented ECE ~18%),
so HIGH on an ambiguous case is expected — gating on raw self_confidence would not
help either.

## What makes a heading a forced-choice-axis heading

A heading qualifies when **one QGS-answerable axis** (`form`, `processing_state`,
or `intended_use`) splits the heading **across 2+ subheadings** AND there is **no
residual catch-all leaf** ("Other"/"n.e.s.") to absorb a product silent on that
axis. When a residual leaf exists, the project's **unmarked-default-wins** rule
applies (a query that does not flag the special variant resolves to the
common/residual leaf), so NO ask is warranted. The discriminating corpus signal is
therefore the **absence of a bare residual** on the splitting axis.

## Derivation procedure

`derive-axes.ts` runs entirely against the corpus:

1. Pull every `(code, description, heading, subheading, form, processing_state,
   intended_use)` from `tariff_lines ⋈ tariff_line_attributes`.
2. For each axis vocabulary (currently `form`: `whole` = {carcass, half-carcass,
   whole-bird, whole} vs `cut` = {cut, offal, boneless, piece, fillet}), map each
   leaf's TLA array into **exactly one** macro-class (leaves that match both classes
   — e.g. goat `0204.50.00` carrying both whole and cut — are unclassed and do not
   anchor a split).
3. Group by heading. Keep a heading iff:
   - ≥2 distinct macro-classes appear,
   - they land in ≥2 **distinct subheadings** (cross-subheading), and
   - **no** leaf in the heading is a bare residual (`/(^|: |-+ *)other\s*$|n\.e\.s/i`).
4. Emit `axes.machine.json` (machine candidates).

`axes.json` (the committed runtime artifact) is the **adjudicated** output: the
machine candidates plus curated `question_text`, macro-class `label`s, and `notes`.

## Result (form axis, 2026-06-04)

The derivation query yields exactly four headings with **no residual default**:

| Heading | Product | whole subs | cut subs | bare residual? | In table |
|---|---|---|---|---|---|
| 0201 | Bovine, fresh/chilled | 1 | 2 | no | YES |
| 0202 | Bovine, frozen | 1 | 2 | no | YES |
| 0203 | Swine | 2 | 4 | **YES** (0203.19/0203.29 "Other") | **no — has residual default** |
| 0204 | Sheep/goat | 4 | 4 | no | YES |
| 0207 | Poultry | 8 | 10 | no | YES |

`0203` is correctly **excluded**: its `…19`/`…29` "Other" cuts leaves are residual
defaults, so a swine-meat query silent on form lands there by unmarked-default-wins
and must not be asked. This exclusion is the precision check that distinguishes this
table from a blunt "any form variety" net (which would have caught hundreds of
headings and reproduced the prior ~33% over-ask).

## Precision over recall (deliberate)

The table is intentionally **small and high-precision**. The prior PRE-L4 sibling
trigger over-fired (~33% ask-rate) by asking on every sibling group. This table is a
**necessary-not-sufficient pre-filter**: at runtime the gate additionally requires
(a) L3 survivors concentrating into 2+ subheadings of a table heading that span both
macro-classes, (b) the query SILENT on the axis (`isAttributePinnedByQuery` false),
and (c) retrieval/rerank NOT decisive (small top1/top2 margin). Only when all three
hold on top of a table membership does it ask. Extending the table to other axes
(`processing_state` fresh/frozen/preserved, `intended_use`) is future work, gated on
the same eval the prod-flip is gated on (`backend/docs/CALIBRATED-ASK-EVAL-PLAN.md`).

## S3 addition (2026-06-04) — coffee `0901` roasted-vs-green

Stage S3 added one ADDITIVE entry (the four meat entries are untouched): heading
`0901`, axis `processing_state`, classes `green` (not-roasted subs `0901.11`
regular + `0901.12` decaf) vs `roasted` (`0901.21` regular + `0901.22` decaf),
question "Is the coffee roasted, or still green (not roasted)?". `0901.90`
(husks/skins/substitutes) is deliberately excluded from both classes — it is a
distinct named product, not a coffee-bean "Other", so a silent coffee-bean query
has no bare-residual coffee-bean leaf at the heading level and the split is forced.
This is the FIRST question for a bare "coffee beans" query; the within-subheading
variety/grade/process surface (`0901.11`) is owned by the S3 askable-surface
(`O7-askable-surface/`), and decaffeinated-vs-regular is a nested second axis under
each roast branch (see that entry's `notes`). Rationale + the expansion backlog of
other candidate cross-sub forks are in `O7-askable-surface/README.md`.

## Re-running

```
cd backend && npx tsx --require dotenv/config \
  data/build-time/O6-cross-subheading-axes/derive-axes.ts
```

Requires `DATABASE_URL`. Re-running reproduces the machine candidates; curated
fields in `axes.json` are maintained by hand (re-derive only refreshes the
`axes.machine.json` candidates for review).

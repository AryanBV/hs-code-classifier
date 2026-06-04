# O7 Askable-Surface (Stage S3) — derivation + calibration record

**Build-time job (Stage S3). No Gemini. Corpus-only (`tariff_lines` for leaf
descriptions) + the S2 structural data + the axis-primacy calibration. DARK — not
wired to any live path until S4 wires the consumer.**

## What this produces and why

S2 (`O7-atomic-axis-typing/`) un-fused the TLA arrays into 36 named concept-axes
and tagged every multi-leaf subheading as `residual_default` / `askable_no_residual`
/ `single_axis_resolved` / `untypable`. S3 turns that STRUCTURE into a **bounded,
human-facing askable surface** the S4 divergence engine uses to ask the RIGHT
question in plain trade language — while NOT over-asking.

The crux is the **refined ASK rule** (which replaces the blunt "residual exists ->
never ask"):

- Each atomic axis is tagged **PRIMARY** (a core product characteristic an exporter
  reliably knows and that genuinely splits the tariff line — variety, species,
  material, grade, form, presentation, processing/thermal, polymer, fibre, weave …)
  vs **INCIDENTAL / special-variant** (handloom, flavoured, embellishment,
  retail-packing, niche numeric bands, special-feature flags).
- **ASK** on an unpinned PRIMARY axis that splits the survivors **even if the
  subheading has a residual leaf** — this is why coffee `0901.11` (which has a `.90`
  residual) MUST still ask variety/form/grade.
- **DEFAULT to the residual** (do NOT ask) when only INCIDENTAL / special-variant
  axes are unresolved (generic bolt -> `7318.15.00`; unflagged handloom -> mill
  default).
- **CONSERVATIVE:** when unsure whether an axis is primary, it is marked INCIDENTAL.
  Over-asking is the catastrophic failure.

## Artifacts

| File | What |
|---|---|
| `axis-primacy.json` | The central calibration: all 36 atomic axes tagged PRIMARY/INCIDENTAL with a one-line justification each. |
| `axis-language.ts` | Plain-trade language layer (build-time only): per-axis exporter-facing question + MECE value labels + answerability. Consumed only by the generator. |
| `generate-askable-surface.ts` | The deterministic generator (reads S2 + axis-primacy + corpus descriptions; emits the artifact). |
| `askable-surface.json` | The committed runtime artifact (loaded read-only by `lib/askable-surface-table.ts`). |

## axis-primacy.json (the 36-axis calibration)

**PRIMARY (20):** thermal, presentation, roasted, decaffeinated, coffee_form,
process_method, grade, textile_finish, weave, fiber_type, polymer, physical_form,
metal_working, metal_coating, pipe_construction, machine_part, electric_machine,
vehicle_type, worked_state, origin_nature.

**INCIDENTAL (16):** coil_state, cellularity, chem_structure, fabric_weight,
weaving_method, embellishment, retail_packing, gem_quality, air_conditioning,
body_construction, seat_capacity, power_rating, capacity_rating, diameter_band,
container_size, end_use.

Rationale themes for the INCIDENTAL set: India-specific special-variants that
default when unflagged (weaving_method handloom, embellishment, retail_packing);
chemist-/engineer-level detail a general exporter cannot self-assess
(chem_structure, body_construction, gem_quality); numeric threshold bands prone to
mis-mapping to tariff cut-offs (power_rating, capacity_rating, diameter_band,
fabric_weight, seat_capacity, container_size); and interpretive / dual-use end_use,
which is also the single most common residual-default axis. Full per-axis
justifications are in `axis-primacy.json`.

## askable-surface.json (the enrichment)

**80 subheadings enriched** (run 2026-06-04):

| kind | count | meaning | ask_recommendation |
|---|---|---|---|
| `no_residual` | 77 | the S2 askable-no-residual subs; a silent query cannot default, so ask beats a blind guess | `ask` if any PRIMARY axis (52), else `fallback_only` (25) |
| `primary_residual_override` | 3 | the REFINED-RULE overrides — ask a PRIMARY axis EVEN OVER a residual leaf | always `ask` |

The S2 candidate set is 104 no-residual subs + the 3 overrides = 107. **27 are
dropped** because none of their axes can form a leaf-disjoint (MECE) choice (see
"MECE purification" below) — leaving **80**.

- **25 `fallback_only`** no-residual subs have ONLY INCIDENTAL axes (numeric
  power/kVA/diameter bands, gem-quality, dual-use end-use). They still have no
  residual to default into, so S4 may ask them — but only as a LAST resort when
  retrieval is genuinely undecided, because their answerability is doubtful.
- **16 hard-answerability axis flags** raised (`answerability_flag: true`) so S4 can
  be cautious or skip: every `power_rating` / `capacity_rating` / `diameter_band` /
  `gem_quality` axis that survived purification.

Each enriched axis carries: `is_primary`, a plain-trade `question` (no HS jargon, no
codes), MECE `options` (exporter-language label + the real leaf `codes` each maps
to), an honest `residual_escape` (the REAL residual leaf description — never a blank
"Other/None"), a `branch_order` (PRIMARY + easier-to-answer axes first), and an
`option_answerability` self-assessment.

### MECE purification (why 27 candidates are dropped)

S2 arrays can tag a SINGLE leaf with MULTIPLE values of one axis (a fish leaf
"Live, fresh or chilled" carries both `live` and `fresh_or_chilled`; a chemical leaf
tagged both `powder` and `liquid` in its form array). A forced-choice question over
such options is ambiguous — two different answers point to the same leaf. The
generator therefore PURIFIES every axis to a strictly leaf-disjoint (MECE) choice:
(1) merge options with IDENTICAL leaf-sets into one combined option (e.g. 0308.30:
"Fresh or chilled or Live" -> `…30.10` vs "Frozen" -> `…30.20`); (2) drop any leaf
code still shared across 2+ distinct options (it falls through to the residual /
brain); (3) keep the axis only if >=2 options retain a non-empty disjoint leaf set,
else the axis is NOT asked. A sub all of whose axes fail this (22 fully-degenerate +
5 partially-degenerate chemical `physical_form`/`end_use` cases) is dropped from the
surface — the brain classifies it (fail-safe). This is the conservative choice:
better no question than an ambiguous one. Result: **0 MECE violations** in the
committed artifact (asserted in the loader test).

### Worked examples

**Coffee `0901.11`** (`primary_residual_override`; HAS `.90` residual; still ASKS):

- *coffee_form* (branch 1): "What kind of coffee bean is it?" ->
  Arabica Plantation (`…11.11-19`) / Cherry (`…11.21-29, 41-49`) /
  Robusta Parchment (`…11.31-39`); escape `0901.11.90`.
- *grade* (branch 2): "What is the sale grade of the coffee?" -> A / B / C / AB /
  PB (Peaberry) / B/B/B / Bulk, each mapping to the real graded leaves.
- *process_method* (branch 3): "How was the coffee processed?" ->
  Dry/natural (cherry leaves) / Wet/washed (parchment leaves).

**Textile fibre `6101.30`** (`no_residual`; `ask`): *fiber_type* — "What is the main
fibre / material?" -> Synthetic fibre (`6101.30.10`) / Artificial fibre
(`6101.30.20`). No residual escape (none exists).

**Cotton-yarn finish `5205.28`** (`no_residual`; `ask`): *textile_finish* — "What is
the fabric finish?" -> Dyed (`5205.28.10`) / Bleached (`5205.28.20`).

**Turbine power `8410.12`** (`no_residual`; `fallback_only`; answerability=hard):
*power_rating* — "What is the power / output rating (kW)?" -> 1000 kW to 5000 kW
(`8410.12.10`) / 5000 kW to 10000 kW (`8410.12.20`). Flagged hard because an
exporter may not map their rating to the tariff band; S4 should prefer not to ask
unless retrieval is undecided.

## Cross-subheading flagship extension (coffee added to O6)

The S2 finding is that within-subheading 0901.11 has a residual — but the FIRST
fork for a bare "coffee beans" query is one level up, at the **heading**: roasted vs
green. That is a CROSS-subheading split and belongs in the O6 table
(`O6-cross-subheading-axes/axes.json`), exactly like the meat whole-vs-cut split.

**Added (additive; meat entries untouched):** heading `0901`, axis
`processing_state`, classes:

- `green` = not-roasted subs `0901.11` (regular) + `0901.12` (decaf), label
  "Not roasted (green / raw beans)".
- `roasted` = roasted subs `0901.21` (regular) + `0901.22` (decaf), label
  "Roasted".

Question: "Is the coffee roasted, or still green (not roasted)?"

`0901.90` (husks/skins/substitutes containing coffee) is **deliberately excluded**
from both classes: it is a distinct named product, not a coffee-bean "Other", so a
silent coffee-bean query has NO bare-residual coffee-bean leaf to default into — the
split is genuinely forced. **Decaffeinated vs regular** is a SECOND axis nested
under each roast branch (`0901.11` vs `0901.12`; `0901.21` vs `0901.22`) and is
asked after roast if still unresolved; it is documented in the entry `notes` and is
a future single-axis addition to the within-subheading surface if needed.

## Expansion backlog (candidate cross-sub forks found, NOT enriched)

These are genuine cross-subheading forks the S2 / O6 derivation surfaces but that
were NOT enriched in S3 (precision over recall — derive per-family with corpus
verification before adding, mirroring the O6 method):

- **Spices in-shell vs shelled** (e.g. nutmeg `0908.11`/`0908.12` style; cardamom):
  a clean, exporter-known split, but spread across several headings — needs a
  per-heading residual check before adding.
- **Cereals seed-for-sowing vs other** (`1001.x`, `1008.10`): the seed-quality flag
  is a special-variant; usually defaults, so likely INCIDENTAL — verify.
- **Nut kernel vs in-shell / nut vs kernel** (`1207.10`): exporter-known, but check
  for a residual default first.
- **Cheese / dairy thermal & infant-nutrition** (`0402.29`): mixed primary +
  special-variant; needs per-leaf adjudication.
- **Stone/ore crude vs powdered vs calcined** (`2506.10`, `2508.10`, `2606.00`):
  `physical_form` / `worked_state` splits, many with residuals; PRIMARY but
  residual-bearing — candidate per-family overrides if eval shows mis-routing.
- **Mineral water aerated vs natural** (`2201.10`): a clean two-way split; low
  volume, verify residual.
- **Plywood marine/aircraft/decorative grade** (`4412.92`): an `end_use` split
  (INCIDENTAL) — likely default, do not add.

The 146 S2 `untypable` subs (idiosyncratic per-chapter description names — fish
species, tool names, print-product names) remain the longer-tail backlog and are
NOT cross-sub forkable into clean concept-axes; they stay fail-safe (the brain
classifies).

## Re-running

```
cd backend && npx tsx --require dotenv/config \
  data/build-time/O7-askable-surface/generate-askable-surface.ts
```

Requires `DATABASE_URL` (read-only; only for leaf-description hydration).
Deterministic: re-running reproduces `askable-surface.json` byte-identically from
the same corpus + inputs. To recalibrate, edit `axis-primacy.json` (PRIMARY vs
INCIDENTAL), the `PRIMARY_RESIDUAL_OVERRIDES` allow-list in the generator, or the
plain-trade strings in `axis-language.ts`, then re-run.
```

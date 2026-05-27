# SUB-SPEC: Predicate DSL Expressiveness Audit + O2 Schema Additions

**VERDICT:** DSL adequate with 1 trivial extension (candidate-context vars). Significant O2 schema expansion required.

## Audit summary (10 chapter notes sampled)
| Verdict | Count | Chapters |
|---|---|---|
| PASS | 4 | Ch.39, Ch.61, Ch.84, Ch.85 |
| NEEDS-EXTENSION | 3 | Ch.27, Ch.62, Ch.73 |
| SKIP-RECOMMENDED | 2 | Ch.29, Ch.90 (decompose; extract PASS sub-claims) |
| NUMERIC-FIELD-GAP | 1 | Ch.72 (DSL already supports >=/<=; O2 must materialize composition %s) |

## Required DSL extension: candidate-context vars
Reserve as resolvable vars (no new operator, ~10 LOC evaluator change):
- `candidate.chapter` (e.g., '72')
- `candidate.heading` (e.g., '7318')
- `candidate.subheading` (e.g., '7318.15')
- `candidate.section` (e.g., 'XV')

Fixes Ch.62 carve-out pattern: `(NOT knitted AND NOT crocheted) OR candidate.heading == '6212'`.

## Redirect metadata (NOT a DSL op)
Don't add `REDIRECT_TO_HEADING` operator. Attach `redirects_to: {chapter?: string, heading?: string[]}` as `notes_claims` row metadata. Used by repair_feedback, not predicate evaluation.

## Compositional predominance (Ch.73 cast iron)
Push to O2 extraction. Materialize `predominant_element: string` field. Don't add `PREDOMINATES_BY_WEIGHT` op to DSL.

## O2 schema additions REQUIRED (expand scope from ~6 fields to ~30)

**Numeric composition (Ch.71-83 metals):**
- `carbon_pct, chromium_pct, manganese_pct, nickel_pct, silicon_pct, phosphorus_pct, aluminum_pct, boron_pct, cobalt_pct, copper_pct, lead_pct, molybdenum_pct, niobium_pct, titanium_pct, tungsten_pct, vanadium_pct, zirconium_pct, iron_pct`
- `predominant_element: string`

**Granule sieve (Ch.72 Note 1(h)):**
- `sieve_pass_pct_1mm, sieve_pass_pct_5mm`

**Textile (Ch.61/62):**
- `made_up: boolean`
- `fabric_construction: enum('knitted','crocheted','woven','wadding','other')`

**Electrical (Ch.85):**
- `electrically_warmed: boolean, wearable: boolean, electrically_heated: boolean`

**Chemical (Ch.27/29):**
- `chemical_class: enum('separate_organic_compound','isomer_mixture','sugar_derivative','diazonium_salt','other')`
- `in_solution: boolean`
- `solution_purpose: enum('safety_transport','specific_use','none')` — SKIP-prone purposive

**Role/intent (Ch.90 — lower priority, high SKIP risk):**
- `intended_role: enum('packaging','support','technical_use','implant','optical_element','other')`

## Effort revision
O2 estimate: 1-2 days → **2-3 days** (broader extraction scope per chapter; needs few-shot examples per chapter for accurate numeric pct extraction; manual validation set of 50 codes spanning Ch.39, Ch.72, Ch.85).

## Dependency ordering surfaced
O2 must complete (especially numeric composition fields for Ch.71-83) BEFORE O1 claims for those chapters can be evaluated. The verifier's missing-key=SKIP policy prevents catastrophic failure if O2 lags, but predicates for steel/stainless-steel/alloy classifications won't enforce until O2 ships those fields.

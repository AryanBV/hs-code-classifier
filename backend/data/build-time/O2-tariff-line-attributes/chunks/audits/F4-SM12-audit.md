# F4 Calibration Audit — SM-12 (13-chapter packed chunk)

**Auditor:** Independent calibration reviewer (F4 final audit)
**Date:** 2026-05-28
**Chunk:** SM-12 — Ch.49/31/88/89/50/75/97/06/36/43/47/79/93 (339 records; 246 recovered + 93 newly authored)
**Files:** `chunks/output/SM-12.json` (339) vs `chunks/input/SM-12.json` (339)

## VERDICT: CONDITIONAL_PASS

One DB-blocking enum violation (`intended_role="part"` × 11) must be fixed before ingest. All other dimensions PASS. After the single fix below, this chunk is clean.

---

## 1. Integrity — PASS

| Check | Result |
|---|---|
| Output count === input count | 339 === 339 ✔ |
| Duplicate codes | 0 ✔ |
| Missing (input not in output) | 0 ✔ |
| Extra (output not in input) | 0 ✔ |
| Field count per record | 43 / 43 on all 339 ✔ |
| Field names + order identical | all 339 ✔ |
| JSON valid | YES ✔ |
| Array-typed fields hold arrays | 0 non-array values ✔ |

All 13 expected chapters present: 06,31,36,43,47,49,50,75,79,88,89,93,97.
Metadata uniform: `extraction_model=claude-opus-4-7` (339), `validation_status=pending` (339), `extracted_at=2026-05-28T00:00:00Z`, `extraction_confidence` HIGH=294 / MEDIUM=45 (no LOW — healthy).

## 2. Templating / Diversity — PASS

- **Semantic signature diversity: 93.8%** (318 unique / 339 over material|form|function_|intended_use|processing_state|composition).
- **extraction_notes: 100% unique** (339/339), 0 duplicate-note groups, 0 empty notes.
- 14 duplicate-signature groups are all legitimate near-identical sibling lines (drone weight classes 8806.2x/9x, waste-and-scrap pairs 7503/7902, NP-fertilizer pairs 3105.5x, fur-apparel 4303.x, silk-yarn retail pairs 5006.x). No lazy/copy-paste templating.

## 3. Cross-Chapter Vocab Bleed — PASS (0 leaks)

Grouped by 2-digit prefix; scanned material/function_/intended_use for foreign-chapter vocab:
silk→non-50: 0; fertilizer→non-31: 0; aircraft→non-88: 0; ship→non-89: 0; nickel→non-75: 0; zinc→non-79: 0; fur→non-43: 0; pulp→non-47: 0; art→non-97: 0; arms→non-93: 0. **No bleed across any of the 13 chapters.**

## 4. Recovery Boundary — PASS

- 8806.10.00 sits at 1-based record 246 — exactly the stated recovered/authored seam.
- Records 244–248 contiguous (8805.21.00 → 8805.29.00 → 8806.10.00 → 8806.21.00 → 8806.22.00 → 8806.23.00).
- Already proven above: 0 dup, 0 gap, 0 missing across the whole file → seam is clean. No metadata discontinuity (model/status/timestamp uniform across the boundary).

## 5. Controlled-Goods Framing (Ch.36 + Ch.93) — PASS (0 prohibited hits)

43 controlled records (22 Ch.36 + 21 Ch.93) scanned against 13 prohibited-content patterns (how-to make/build/assemble/load/detonate, formulation, synthesis, mixing proportions, recipes, gram quantities, step-by-step, assembly instructions).
**Prohibited hits: 0.**
All notes are factual tariff/customs descriptions of material/form/function plus regulatory mentions only (Explosives-Act, PESO, Arms-Act, "factual customs context"). Examples: `9306.90.00` "Bombs, grenades, torpedoes, mines, missiles and similar munitions and parts (9306.90). Arms Act / Explosives context." — descriptive classification only, no operational content. Framing is clean.

## 6. Enum Compliance (vs live DB CHECK constraints, project waowoznsvaosgcgiivzo)

DB enums verified: `chemical_class` {separate_organic_compound, separate_inorganic_compound, isomer_mixture, sugar_derivative, diazonium_salt, other | NULL}; `fabric_construction` {knitted, crocheted, woven, wadding, other | NULL}; `intended_role` {packaging, support, technical_use, implant, optical_element, other | NULL}; `validation_status` {pending, validated, flagged}; `predominant_element` — free text (no CHECK).

| Field | Status |
|---|---|
| `chemical_class` — Ch.31 mixed-fertilizer = `other` (15: NPK/NP/PK/NK + ammonium-nitrate-based blends), straight salts NULL | PASS |
| `chemical_class` — Ch.36 explosive/pyro mixtures = `other` (10: powders, prepared explosives, fireworks, combustible preps), single-substance articles (fuses, caps, matches, ferro-cerium, DNPT) NULL | PASS |
| `chemical_class` — all other 11 chapters NULL | PASS |
| `fabric_construction` — Ch.50 5007 silk fabric = `woven` (all 5 records), rest of Ch.50 (yarn/waste) NULL | PASS |
| `predominant_element` — Ch.75/79 all NULL | PASS — matches established convention (Ch.74 copper, Ch.76 aluminium also all-NULL; field reserved for alloy-steel Ch.72/73) |
| `intended_role` — Ch.93 arms | **FAIL** — see violation below |
| `validation_status` = pending (339) | PASS |

---

## VIOLATIONS

### V1 (CRITICAL — DB-blocking): `intended_role="part"` × 11 — NOT a valid enum value

The live DB CHECK constraint on `tariff_line_attributes.intended_role` permits only `{packaging, support, technical_use, implant, optical_element, other}` or NULL. `"part"` is absent → these 11 rows would be **rejected on insert**. Also contradicts the F4 spec ("arms (93) intended_role NULL").

Affected codes:
- Ch.88 aircraft parts: `8807.10.00`, `8807.20.00`, `8807.30.10`, `8807.30.20`, `8807.90.00`
- Ch.93 arms parts: `9305.10.00`, `9305.20.10`, `9305.20.90`, `9305.91.00`, `9305.99.10`, `9305.99.90`

**Fix:** Set `intended_role = null` on all 11. (`intended_role` denotes a material/article's role inside a composite product — packaging/support/etc. — not "is itself a part"; the part-nature is already captured in `form`=["part","component"] / `function_`. NULL is correct.)

---

## EXACT FIX

In `chunks/output/SM-12.json`, for the 11 codes listed in V1, change `"intended_role": "part"` → `"intended_role": null`. No other edits required. Re-run integrity (339/43/JSON) after the patch.

## SUMMARY

- Integrity, templating, cross-chapter bleed, recovery-boundary, controlled-goods framing, and 5/6 enum dimensions all PASS.
- Single blocking defect: 11× `intended_role="part"` (invalid enum). Trivial mechanical fix → null.
- **Verdict: CONDITIONAL_PASS** (PASS upon applying the V1 fix).

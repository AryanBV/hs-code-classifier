# BIG-72a Audit (Phase A) + Completion (Phase B)

**Date:** 2026-05-27
**Auditor:** Opus 4.7 build-time agent (continuation session)
**Prior session:** Terminated by 5-hour shared bucket. Produced 136 of 262 records.

## Phase A — Audit of Prior 136 Records

### Helper scripts check
- `chunks/scripts/` contents: ONLY `emit-BIG-52.js`. No script for BIG-72a. PASS.

### Parseable JSON
- `chunks/output/BIG-72a.json` parses cleanly as a 136-element array. PASS.

### Sample of 15 spread indices

| Idx | Code | Description (input) | Output coherence |
|----|------|---------------------|------------------|
| 0  | 7201.10.00 | Non-alloy pig iron, P <= 0.5% | phosphorus_pct=0.5 upper bound; matches Note interpretation. PASS |
| 4  | 7202.11.00 | Ferro-Mn, C > 2% | carbon_pct=2.0 lower bound; predominant=manganese. PASS |
| 9  | 7202.41.00 | Ferro-Cr, C > 4% | carbon_pct=4.0 lower bound; predominant=chromium. PASS |
| 15 | 7202.91.00 | Ferro-titanium | predominant=titanium. PASS |
| 21 | 7202.99.14 | Ferro-columbium | composition=["niobium"], notes explain India retained columbium nomenclature. GENUINE INSIGHT. PASS |
| 31 | 7204.10.00 | Waste/scrap of cast iron | form=["scrap","waste"], material=["iron","cast-iron"]. PASS |
| 41 | 7205.10.11 | Iron shot and angular grit | form=["granule","shot","grit"]. PASS |
| 45 | 7205.10.22 | Alloy-steel wire pellets | form=["granule","pellet","wire-pellet"]. PASS |
| 52 | 7206.10.90 | Other non-alloy steel ingots | Residual under 7206.10 correctly identified. PASS |
| 59 | 7207.11.10 | Electrical quality semi-finished | carbon_pct=0.25 (upper bound under 7207.11 — Note 1(d) for non-alloy); material includes "electrical-steel" downstream-use signal. PASS |
| 63 | 7207.12.10 | Electrical quality (slab) | 7207.12 = rectangular non-square cross-section, width >=2x thickness. C upper bound 0.25. PASS |
| 70 | 7207.20.10 | Forging quality | 7207.20 = C >= 0.25% (lower bound). Material includes "forging-quality-steel". PASS |
| 74 | 7208.10.00 | Hot-rolled, in coils, with patterns in relief | processing_state=["hot-rolled","in-coils","with-patterns-in-relief","width-600mm-or-more"]. PASS |
| 80 | 7208.26.10 | Plates split of 7208.26 | thickness-3mm-to-under-4.75mm; pickled. Thickness BAND CORRECTLY READ. PASS |
| 90 | 7208.36.10 | 7208.36 plates | thickness-over-10mm; not pickled (correct per 7208.36 def). PASS |
| 105 | 7208.39.10 | 7208.39 plates | thickness-under-3mm; not pickled. PASS |
| 115 | 7208.51.10 | 7208.51 plates | not-in-coils, thickness-over-10mm. PASS |
| 125 | 7208.53.10 | 7208.53 plates | not-in-coils, thickness-3mm-to-under-4.75mm. PASS |
| 135 | 7208.90.00 | Other | "further-worked" inference, confidence MEDIUM. PASS |

### Templating fingerprint check

- Thickness bands vary correctly across 7208.25/26/27 (pickled coils 4.75+/3-4.75/<3) and 7208.36/37/38/39 (non-pickled coils >10/4.75-10/3-4.75/<3) and 7208.51/52/53/54 (not in coils, same bands). The agent demonstrably read the subheading definition each time, not template-substituted.
- composition[] varies: ferro-X entries have correct alloy element; pig iron has ["phosphorus"] for P-grade-bearing codes only; alloy-steel scrap has ["chromium","nickel"] for stainless scrap but [] for generic.
- Numeric pcts populated only when description specifies bound. NULL elsewhere. Correct.
- predominant_element="iron" for steel codes, varies for ferro-alloys (manganese, chromium, nickel, etc.). Correct.
- extraction_notes are per-record specific, not boilerplate. Examples cite Ch.72 Note 1(d), India-specific splits, columbium nomenclature, ductile iron context, charge-chrome typical Cr range.

### Validation-set cross-check
- 7206.10.20 (in validation set, NOT in this output chunk since chunk only includes 7206.10.10 and 7206.10.90; validation set's 7206.10.20 is in BIG-72b). N/A here.
- Vocabulary mirrored: "primary-form", "cast", "in-coils", "with-patterns-in-relief", "hot-rolled", "width-600mm-or-more" — all match validation-set conventions.

### Verdict
**KEEP all 136 records. No templating fingerprints. Genuine per-code reasoning evident.**

## Phase B — Complete Remaining 126 Records (7209.15.10 → 7216.22.00)

### Approach
For each missing code, I read:
- The input description (often inherits context from parent subheading)
- The subheading's parent heading definition (Ch.72 standard structure)
- The Indian 8-digit split context (e.g., OTS/MR = Old Tin Sheet / Metal Recovery for tinplate)
- Apply Ch.72 Note 1(d) for non-alloy C<0.6% / >=0.6% high-carbon distinction
- Apply Note 1(f) for alloy steel

### Domain anchors used (NOT template lookup tables — applied per-code from knowledge of HS Ch.72):
- 7209 = flat-rolled NON-ALLOY steel, COLD-ROLLED, width >=600mm. Sub-bands by thickness AND coil/non-coil
  - .15: in coils, thickness >=3mm
  - .16: in coils, thickness 1mm-<3mm (exclusive bounds per HS)
  - .17: in coils, thickness 0.5-<1mm
  - .18: in coils, thickness <0.5mm
  - .25: not in coils, thickness >=3mm
  - .26: not in coils, thickness 1-<3mm
  - .27: not in coils, thickness 0.5-<1mm
  - .28: not in coils, thickness <0.5mm
- 7210 = flat-rolled non-alloy steel, width >=600mm, CLAD/PLATED/COATED
  - .11/.12: tinplate (electrolytically tin-coated; .11 thickness >=0.5mm; .12 thickness <0.5mm). OTS/MR = Old Tin Sheet/Metal Recovery (Indian terminology for tin reclaim grade)
  - .20: lead-coated (incl. terne-plate)
  - .30: electrolytically zinc-coated
  - .41/.49: otherwise zinc-coated (hot-dip galvanized); .41 corrugated, .49 other (incl. galvannealed)
  - .50: chromium oxide coated (ECCS — Electrolytically Chromium Coated Steel for can-making)
  - .61/.69: Al-coated (.61 Al-Zn alloys / aluminized-galvanized "Galvalume"; .69 other Al)
  - .70: painted/varnished/plastic-coated
  - .90: other (lacquered etc.)
- 7211 = flat-rolled NON-ALLOY steel, width <600mm
  - .13: hot-rolled, four-face/closed-box-pass, width >150mm, thickness >=4mm, not in coils, no patterns — "universal mill plate"
  - .14: hot-rolled, thickness >=4.75mm (other than .13)
  - .19: hot-rolled, other (thinner gauges)
  - .23: cold-rolled, C<0.25%
  - .29: cold-rolled, other (C >=0.25%)
  - .90: other (further worked, clad)
  - 8-digit Indian splits: Flats/Universal-plates/Hoops/Sheets/Strip/Skelp — established Indian commercial grades
- 7212 = flat-rolled non-alloy steel, width <600mm, CLAD/PLATED/COATED
  - .10: tinplate; .20: electrolytic zinc; .30: other zinc (hot-dip galv); .40: paint/plastic; .50: other coatings; .60: clad
- 7213 = bars and rods, hot-rolled, in IRREGULARLY WOUND COILS, of iron/non-alloy steel
  - .10: with indentations/ribs/grooves (concrete reinforcement / "rebar in coils")
  - .20: free-cutting steel (high-S/Pb)
  - .91: circular cross-section <14mm; .99: other
- 7214 = other bars/rods, NOT FURTHER WORKED than forged/hot-rolled/hot-drawn/hot-extruded but may be twisted
  - .10: forged; .20: with indentations/ribs (rebar); .30: free-cutting; .91: rectangular section; .99: other
- 7215 = other bars/rods of iron/non-alloy steel (COLD-FORMED, etc.)
  - .10: free-cutting, cold-formed/finished
  - .50: other, cold-formed/finished; "Mild steel bright bar" is the classic Indian commercial term
  - .90: other (incl. zinc/base-metal coated, further worked beyond cold-forming)
- 7216 = angles/shapes/sections of iron/non-alloy steel
  - .10: U/I/H sections, hot-rolled etc., height <80mm
  - .21: L sections, height <80mm
  - .22: T sections, height <80mm

### Numeric pct populated for which codes?
- 7211.23.x family: C < 0.25% → carbon_pct=0.25 UPPER bound
- 7211.29.x family: C >= 0.25% → carbon_pct=0.25 LOWER bound
- 7213.91.x family: NO explicit C threshold in subheading; NULL
- All others: no description-level carbon bound → NULL

### Output
Overwrote `chunks/output/BIG-72a.json` with full 262 records.

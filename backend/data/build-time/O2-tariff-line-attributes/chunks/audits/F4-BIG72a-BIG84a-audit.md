# F4 Calibration Audit — BIG-72a & BIG-84a

**Auditor role:** Independent calibration reviewer (phase F4), default-suspicion on early-Wave-1 chunks.
**Date:** 2026-05-28
**Method:** Programmatic integrity/enum/templating scan (`audits/_f4_72_84.js`) + 12-record manual reasoning spread per chunk + per-chunk specialized checks + vocab fidelity vs `validation-set-50.json`.

| Chunk | Chapter / headings | Records | Verdict |
|---|---|---|---|
| **BIG-72a** | Ch.72 iron & steel, 7201–7216 | 262 | **CONDITIONAL_PASS** |
| **BIG-84a** | Ch.84 machinery, 8401–8414 (+8418/8419/8421–8429 present in slice) | 362 | **CONDITIONAL_PASS** |

---

## 1. Integrity (BOTH PASS)

| Check | BIG-72a | BIG-84a |
|---|---|---|
| output records == input code_count | 262 == 262 ✅ | 362 == 362 ✅ |
| Every input code present exactly once | ✅ (0 missing) | ✅ (0 missing) |
| Extra codes (not in input) | NONE ✅ | NONE ✅ |
| Duplicates | NONE ✅ | NONE ✅ |
| All 43 fields per record | 262/262 ✅ | 362/362 ✅ |
| JSON valid | ✅ | ✅ |
| Metadata (extraction_model / extracted_at) | 0 missing; all `claude-opus-4-7` ✅ | 0 missing; all `claude-opus-4-7` ✅ |
| validation_status | 262 `pending` ✅ | 362 `pending` ✅ |
| confidence dist | HIGH 203 / MED 59 | HIGH 290 / MED 67 / LOW 5 |

Integrity is clean on both chunks. No early-chunk integrity rot.

---

## 2. Templating forensics (BOTH PASS — no fingerprints)

| Metric | BIG-72a | BIG-84a |
|---|---|---|
| FULL signature diversity (material/form/function_/intended_use/processing_state) | **245/262 = 93.5%** | **358/362 = 98.9%** |
| extraction_notes uniqueness | **262/262 = 100%** | **362/362 = 100%** |
| Verbatim-duplicate notes groups | **0** | **0** |
| Narrow-signature collisions across distinct subheadings | 14 | 2 |

**No templating fingerprint.** Zero verbatim-duplicate notes in either chunk. The 14 narrow-signature collisions in 72a are all **legitimate** sibling pairs that genuinely share attributes (e.g. 7201.10/7201.20 differ only by phosphorus threshold; 7202.11/7202.19 ferro-manganese carbon split; 7211.23/7211.29 cold-rolled flats differing only by carbon-bound direction). The narrow signature deliberately omits the pct fields that distinguish them — these are NOT lazy copies (notes are unique per code and carbon bounds differ). The 2 collisions in 84a (8422.11/8422.19 dishwashers; 8426.99/8428.10 lifting) are also genuine functional siblings.

---

## 3. Per-code reasoning sample (12 spread records each)

**BIG-72a** (indices 0,24,48,72,96,120,144,168,192,216,240,261): Notes are strongly code-specific. Examples: 7207.20.30 "Seamless tube quality semi-finished, C >=0.25%"; 7209.17.10 cites "cold-rolled coils, thickness 0.5-1mm (HS subheading definition)"; 7211.14.60 "Skelp (narrow HR strip rolled specifically for welded-tube production)"; 7211.90.13 "shipbuilding quality (IS:2002 Grade A/B/D/E or LR-approved)". Arrays are product-specific, predominant_element correctly assigned. **Quality HIGH.**

**BIG-84a** (indices 0,32,65,98,131,164,197,230,263,296,329,361): function_ arrays are machine-specific throughout — `nuclear-reactor/fission-power-generation`, `internal-combustion-engine/spark-ignition`, `centrifugal-pump`, `biological-containment`, `heat-exchange`, `centrifuging/spin-drying`, `weighing/mechanical-balance`, `vehicle-mounted-craneage`, `excavating/shovelling`. Notes cite heat-transfer-surface-area thresholds and India-specific sub-line markers. **Quality HIGH.**

### BIG-72a numeric-pct discipline (specialized)
- 37 records carry >=1 pct value; **all 37 pct values trace to an explicit %-by-weight bound in the source hierarchy.** 0 descriptions with a `%` mention were missed.
- **Bound semantics CORRECT:** `>=X` → lower bound, `<X` → upper bound, with notes stating direction. Verified: 7207.11/7211.23 store carbon_pct=0.25 as UPPER bound (subheading text "<0.25% carbon"); their "Other" siblings 7211.29 store 0.25 as LOWER bound (notes say "C>=0.25%"). The 0.25 figure derives from the **WCO 6-digit subheading definition**, not invention — defensible even though the 8-digit leaf text is truncated to "Flats"/"Forging quality".
- Ferro-alloy "Other" bounds correctly inverted: 7202.19 carbon_pct=2 (≤2%), 7202.49 carbon_pct=4 (≤4%), 7202.29 silicon_pct=55 (≤55%).
- **Disciplined abstention confirmed:** 7202.30/.50/.70/.92/.99.21/.99.22/.99.31 describe typical compositions *in the notes* but correctly leave pct fields NULL. 7202.99.90 ("Other" residual) correctly has predominant_element=null.
- predominant_element correct: 237 iron + named ferro-alloy elements (manganese, silicon, chromium, etc.). 1 null (7202.99.90) — correct abstention.

### BIG-84a specialized
- **function_ machine-specificity:** 0 records with only-generic (`machinery`/`machine`) function_; 0 empty function_. ✅
- **Parts inheritance:** 68 parts-ish codes; spot-check confirms full parent-context inheritance (8401.40 Parts of reactors→`nuclear-reactor`; 8402.90.10→`firetube-boiler`; 8406.90→`steam-turbine`; 8409.91.12 Pistons→`internal-combustion-engine/piston`). Notes explicitly state "inherits parent". ✅

---

## 4. Enum compliance (BOTH PASS)

Full scan of all records in both chunks:

| Enum | BIG-72a | BIG-84a |
|---|---|---|
| chemical_class | all NULL ✅ | all NULL ✅ |
| fabric_construction | all NULL ✅ | all NULL ✅ |
| intended_role | NULL 246 / packaging 7 / support 8 / technical_use 1 — all in-enum ✅ | all NULL (in-enum) ✅ |
| solution_purpose | no violations ✅ | no violations ✅ |

**Zero enum violations.** chemical_class and fabric_construction NULL throughout both chunks, as required.

---

## 5. Vocab fidelity vs validation-set-50

Note: the three Ch.72 gold codes (7206.10.20, 7216.31.00, 7226.91.90) and two of three Ch.84 gold codes (8445.20.14, 8472.90.91) fall **outside this chunk's input slice** (chunk boundary, not omission — input contains 7206.10.10/.90 and 7216.10/.21/.22 only; 8413.11.99 sibling .10/.91 present but not .99). Compared against in-chunk analogues:
- 72a 7206.10.10 ("ingots, of iron") → form `["ingot","primary-form"]`, predominant `iron` — **matches gold vocab** for 7206.10.20 (form `["ingot","primary-form"]`, predominant `iron`); gold adds carbon_pct=0.6 only because its leaf text specifies high-carbon, which 7206.10.10 does not.
- 72a 7216.21/.22 (L/T sections) → form `["long-product","section","l-section"/"t-section","shape"]`, function `["structural","construction-material"]` — **matches gold 7216.31** vocab (`["u-section","shape","section"]`, `["structural","construction-material"]`).
- 84a pump siblings under 8413.11 use `pump`/machine-specific function vocab consistent with gold 8413.11.99 (`["pump","fuel-dispenser"]`).

Vocabulary is consistent with the gold style (kebab-case, material-then-form-then-function layering). **PASS.**

---

## Findings requiring rework

### BIG-84a — `electrically_heated=true` on 14 REFRIGERATION codes (DEFECT)
`electrically_heated` is set TRUE on cooling appliances under heading 8418 (refrigerators, freezers, ice-makers, water coolers, refrigerated display cases). Refrigeration is the inverse of heating; this violates the field's intent ("genuine electric-heating equipment, 8419.xx only"). The extractor conflated "electric appliance" with "electrically heated" (note text: "Electric appliance").

**14 codes to fix → set `electrically_heated` to false/null:**
`8418.10.10, 8418.10.90, 8418.21.00, 8418.29.00, 8418.30.10, 8418.40.10, 8418.50.00, 8418.61.00, 8418.69.10, 8418.69.20, 8418.69.30, 8418.69.40, 8418.69.50, 8418.69.90`

The 5 heading-8419 TRUE values (8419.19.10/.20 electric water heaters, 8419.20.10/.90 sterilizers/autoclaves, 8419.33.00 freeze-dryers/spray-dryers) are defensible as genuine heat-applying equipment. NB: application across 8419 is *partial* (only 5 of 44 8419 codes flagged) — the field is not exhaustively/reliably populated, but the 5 flagged are not wrong; this is a coverage gap, not an error.

### BIG-72a — `7202.99.32 chromium_pct=52` (INVENTED VALUE, DEFECT)
Charge-chrome leaf description ("Ferro-boron, Charge-chrome: ---- Charge-chrome") gives **no explicit %-by-weight bound**. The note openly admits the value is from domain knowledge ("typically 52-55% Cr ... midpoint ... 52"). This violates the discipline rule "NO numeric pct invented where description is silent." It is the lone numeric-invention breach in the chunk (its residual sibling 7202.99.90 correctly abstained).

**1 code to fix → set `chromium_pct` to null** (predominant_element=chromium may remain — the named ferro-alloy element is legitimately inferable from "Charge-chrome"; only the fabricated number must go).

---

## Verdicts

- **BIG-72a → CONDITIONAL_PASS.** Integrity perfect, 93.5% diversity, 100% unique notes, exemplary numeric-pct discipline with correct bound semantics. **1 rework: 7202.99.32 invented chromium_pct.** Otherwise HIGH quality; no early-chunk looseness.
- **BIG-84a → CONDITIONAL_PASS.** Integrity perfect, 98.9% diversity, 100% unique notes, machine-specific function_ throughout, exemplary Parts inheritance. **14 rework: 8418.xx refrigeration codes wrongly flagged electrically_heated=true.**

Both chunks are foundationally sound. Neither warrants FAIL — defects are bounded, enumerable, and mechanically fixable (15 field edits total) without re-extraction.

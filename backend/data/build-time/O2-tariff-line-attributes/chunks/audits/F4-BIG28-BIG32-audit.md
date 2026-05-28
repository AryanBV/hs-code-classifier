# F4 Independent Calibration Audit — BIG-28 & BIG-32

**Auditor role:** Independent calibration reviewer (phase F4), default-suspicion stance.
**Date:** 2026-05-28
**Chunks:** BIG-28 (Ch.28 inorganic chemicals, 331 records) · BIG-32 (Ch.32 tanning extracts / dyes / pigments / paints, 338 records)
**Rolling baseline:** confidence HIGH ~78% · notes-uniqueness ~100% · enum-violations 0 · sig-diversity 88–100%

---

## BIG-28 — VERDICT: **PASS**

### 1. Integrity
- Output records: **331** === input `code_count` 331 === codes array len 331.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **43 fields** (uniform; field-count distribution `{43: 331}`). JSON valid.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).
- `extraction_confidence`: HIGH **262** (79.2%), MEDIUM 69 — at/above baseline.

### 2. Templating forensics
- **Attribute-signature diversity: 331/331 = 100.0%** (vs baseline 88–100%).
- **Verbatim-duplicate extraction_notes groups: 0.** Notes-uniqueness 331/331 = **100.0%**.
- Identical {material, form, function_, processing_state} signatures: **0 duplicate groups**, 0 cross-subheading. No templating fingerprints.

### 3. Per-code reasoning (14-record even spread) + Ch.28-specific checks
Every sampled record cites a code-specific, chemically-accurate distinguishing feature (formula + use), not boilerplate. Examples:
- `2801.10.00` — Cl2 halogen element; Ch.28 Note 1 separate-element reasoning cited.
- `2813.90.10` — As2S2 *synthetic* realgar, explicitly distinguishes natural realgar = Ch.25.
- `2820.10.00` — MnO2 EMD cathode-grade nuance.
- `2845.30.00` — Li-6 enriched isotope with correct fusion-blanket breeding reaction.
- `2843.10.90` — colloidal PGMs, proc `colloidal`.

**chemical_class = separate_inorganic_compound dominant: CONFIRMED — 331/331 (100%).** Correct for Ch.28 Note 1 (separate chemically-defined inorganic compounds + elements). 0 anomalies.

**in_solution / solution_purpose:** Only 6 records flagged `in_solution=true`, all genuine aqueous/transport solutions with correct `solution_purpose`: ammonia (2814.20.00, safety_transport), caustic soda (2815.12.00, safety_transport), ammonium hydroxide (2825.90.50, specific_use), sodium/potassium hypochlorite (2828.90.19/.20, specific_use), lime-sulphur (2813.90.30, specific_use). **Correct.**

**predominant_element NULL: CONFIRMED — 0 non-null records.** Central element of compounds NOT mis-mapped into `predominant_element` (that field is reserved for alloy/metal-content semantics). Clean.

### 4. Enum compliance (ALL 331 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations.**

### 5. Vocab fidelity vs validation-set
Gold Ch.28 codes (2807.00.10, 2829.90.20, 2843.90.12) are **deliberately held out** of the BIG-28 input (sibling codes present: 2807.00.20, 2829.90.10/.30, 2843.90.11/.19/.20). Output covers exactly the input — not a coverage gap. The output's held-in siblings match gold conventions exactly: `separate_inorganic_compound` + `chemically-defined` proc tags, identical kebab-case chemical-name material vocab (e.g. 2807.00.20 oleum/fuming-sulphuric-acid; 2829.90.10 perchlorate; 2843.90.11 sodium-aurous-thiosulphate). **Consistent.**

---

## BIG-32 — VERDICT: **PASS**

### 1. Integrity
- Output records: **338** === input `code_count` 338 === codes array len 338.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records **43 fields** (`{43: 338}`). JSON valid.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).
- `extraction_confidence`: HIGH **246** (72.8%), MEDIUM 92 — slightly below ~78% baseline, expected for Ch.32 (many residual dye/paint basket subheadings legitimately MEDIUM).

### 2. Templating forensics
- **Attribute-signature diversity: 335/338 = 99.1%** (within baseline band).
- **Verbatim-duplicate extraction_notes groups: 0.** Notes-uniqueness 338/338 = **100.0%**.
- **Cross-subheading identical signatures: 0.**
- One **single-subheading** sig-dup group (benign, NOT templating): `3204.19.85/.86/.88/.89` — synthetic food colours (orange/violet/brown/other) split only by shade, sharing material/form/function/proc but each carrying a **distinct code-specific note** (food orange vs violet vs brown vs FSSAI catch-all). Genuine attribute overlap of same product class; notes 100% unique. No fingerprint.

### 3. Per-code reasoning (14-record even spread) + Ch.32-specific checks
Specific and correct throughout, with precise CI numbers and chemistry:
- `3204.11.41` — CI Disperse Violet 1 (1,4-diaminoanthraquinone).
- `3204.13.43` — CI Basic Violet 14 (Magenta/Fuchsine, triphenylmethane).
- `3204.15.57` — CI Vat Blue 43 (carbazole vat dye).
- `3206.41.00` — Ultramarine (CI Pigment Blue 29) inorganic pigment.
- `3212.10.00` — hot-stamping foil multilayer construction.

**chemical_class usage — CONFIRMED CORRECT across all three expected patterns:**
- `other`: 311 — dye/pigment/paint mixtures and preparations (3204 dyes, 3206 pigment preps, 3208–3215 paints/inks). Correct: not single chemically-defined compounds.
- `diazonium_salt`: **16 — ALL within 3204.19.3x/4x azoic *diazo* component range** (Fast Red/Blue/Scarlet/Garnet bases etc.). Correctly distinguished from azoic *coupling* components (e.g. 3204.19.11 Naphthol AS = `other`, NOT diazonium). Precise.
- `null`: 11 — natural tanning extracts & natural colouring matter (3201.* quebracho/wattle/gambier/myrobalan; 3203.* cutch/lac-dye/natural-indigo/henna). Correct: natural extracts are not separate chemically-defined inorganic/organic compounds, so chemical_class is null. (Pure inorganic pigments here, e.g. ultramarine 3206.41, are mixtures/complexes → `other`, consistent with task note.)

**intended_role = technical_use for industrial coatings: CONFIRMED.** 5 records, all genuine industrial/technical coatings: 3208.90.41 insulating/electrical varnish, 3208.90.50 slip-agent additive, 3210.00.40 PTFE/silicone non-stick coating, 3211.00.00 prepared driers (metal-soap catalysts), 3214.90.20 chemical-resistant resin cement. Remaining 333 `null` — appropriate (general dyes/pigments/paints carry no specialised role). 0 packaging/implant/optical misfires.

### 4. Enum compliance (ALL 338 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations.**

### 5. Vocab fidelity vs validation-set
No Ch.32 gold codes in the validation set (gold gold codes are Ch.28). Cross-chapter convention consistency holds: kebab-case material vocab, CI-number-in-proc convention (`specified-CI-number`), synthetic-organic proc tags, `chemically-defined`/`extract` proc usage all match the project-wide conventions seen in gold Ch.28 and prior audited chunks. **Consistent.**

---

## Overall assessment vs baseline

| Metric | Baseline | BIG-28 | BIG-32 |
|---|---|---|---|
| Sig-diversity | 88–100% | **100.0%** | **99.1%** |
| Notes-uniqueness | ~100% | **100.0%** | **100.0%** |
| Enum violations | 0 | **0** | **0** |
| HIGH confidence | ~78% | 79.2% (262/331) | 72.8% (246/338) |
| Integrity (count/dupe/coverage) | clean | **clean** | **clean** |
| Field count | 43 | **43 (uniform)** | **43 (uniform)** |

Both chunks **meet or exceed baseline** on every measured axis. The default-suspicion hypothesis is **not supported** — these chunks are at/above rolling-baseline quality. BIG-32's HIGH-confidence share (72.8%) sits just below the ~78% baseline; this is expected and appropriate given Ch.32's many residual dye/paint/ink basket subheadings correctly extracted at MEDIUM with sound reasoning. Not a quality concern.

**Chapter-specific spec checks all PASS:**
- BIG-28: `separate_inorganic_compound` dominant (100%); aqueous-solution `in_solution`+`solution_purpose` correct (6 genuine cases); `predominant_element` NULL throughout (no central-element confusion).
- BIG-32: `chemical_class` tri-pattern correct (`other` mixtures / `diazonium_salt` 3204.19 azoic diazo / `null` natural extracts); `intended_role=technical_use` correctly limited to industrial coatings.

**No records require rework. No enum violations. No templating detected.**

### Final verdicts
- **BIG-28: PASS**
- **BIG-32: PASS**

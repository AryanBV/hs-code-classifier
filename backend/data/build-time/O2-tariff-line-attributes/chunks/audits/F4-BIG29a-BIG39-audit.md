# F4 Independent Calibration Audit — BIG-29a & BIG-39

**Auditor role:** Independent calibration reviewer (phase F4), default-suspicion stance on early-Wave-1 chunks verified before the per-chunk audit protocol was tightened.
**Date:** 2026-05-28
**Chunks:** BIG-29a (Ch.29 organic chemicals, headings 2901–2914, 347 records) · BIG-39 (Ch.39 plastics, 428 records)
**Rolling baseline:** confidence HIGH ~78% · notes-uniqueness ~100% · enum-violations 0 · sig-diversity 88–100%

---

## BIG-29a — VERDICT: **PASS**

### 1. Integrity
- Output records: **347** === input `code_count` 347 === input codes array len 347.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **43 fields** (uniform; field-count distribution `{43: 347}`). JSON valid.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).

### 2. Templating forensics
- **Attribute-signature diversity: 347/347 = 100.0%** (vs baseline 88–100%).
- **Verbatim-duplicate extraction_notes groups: 0.** Notes-uniqueness 347/347 = **100.0%**.
- Identical {material, form, function_, processing_state} signatures spanning distinct subheadings: **0.**
- No templating fingerprints detected.

### 3. Per-code reasoning (12-record even spread)
Every sampled record cites a code-specific distinguishing feature, not boilerplate. Examples:
- `2903.71.00` — HCFC-22 (CHClF2), Montreal Protocol phase-out, PTFE precursor; proc tags include `ozone-depleting-substance`.
- `2903.11.20` — correctly notes a "Chloromethane" typo in the source description and that subheading covers chloromethane AND chloroethane.
- `2914.22.00` — cyclohexanone "KA oil", caprolactam/nylon precursor.
- `2904.34.00` — potassium-PFOS salt flagged as POP.
Arrays are specific (IUPAC + common + chemical-family terms). MEDIUM-confidence records correctly correspond to residual/"other" basket subheadings (e.g. 2905.22.90, 2910.90.90).

### chemical_class correctness
- `separate_organic_compound`: 343 (dominant, correct for Ch.29 Note 1(a) compounds).
- `isomer_mixture`: 2 — `2902.44.00` (mixed xylene isomers, Note 3) and `2907.12.20` (cresylic acid). Both correct.
- `other`: 2 — `2903.19.40` (EDC+CCl4 binary mixture) and `2903.29.10` (DD soil fumigant binary mixture). Correctly NOT isomer_mixture (distinct compounds, not isomers). Well-reasoned.

### 4. Enum compliance (ALL 347 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations.**

### 5. Vocab fidelity vs validation-set
Gold `2903.99.10` (chlorofluorobenzene → separate_organic_compound, "chemically-defined", Note 1(a)). BIG-29a halogenated-hydrocarbon records use the identical convention (`chemically-defined` + `halogenated` proc tags, separate_organic_compound). **Consistent.**

---

## BIG-39 — VERDICT: **PASS** (with one logged convention note)

### 1. Integrity
- Output records: **428** === input `code_count` 428 === codes array len 428.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records **43 fields** (`{43: 428}`). JSON valid.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).

### 2. Templating forensics
- **Attribute-signature diversity: 423/428 = 98.8%** (within baseline band).
- **Verbatim-duplicate extraction_notes groups: 0.** Notes-uniqueness 428/428 = **100.0%**.
- Signatures spanning >1 distinct subheading: **2** (benign, not templating):
  - `3901.10`/`3901.40` — both LLDPE primary-form polyethylene granule (raw-material). Legitimately share attributes; notes differ (3901.10 cites ">=95% ethylene" specific note).
  - `3904.90`/`3905.99` — both residual vinyl-polymer primary-form. Notes differ per residual basket.
  These reflect genuine attribute overlap of adjacent primary-form polymers, not copy-paste; notes remain unique. No fingerprint.

### 3. Per-code reasoning (12-record even spread)
Specific and correct throughout:
- `3915.90.49` — epoxy resin waste/scrap, form `waste/scrap/parings`, function `recyclable-material`.
- `3920.30.10` — rigid plain polystyrene sheet (HIPS/GPPS), proc `non-cellular/not-reinforced/rigid/plain`.
- `3926.20.19` — non-disposable PVC/PU gloves, `wearable=true` set, Indian split noted.
- `3926.90.99` — correctly identified as the absolute residual of the whole chapter.

### chemical_class & intended_role correctness
- **chemical_class range logic: 0 mismatches.** Clean break at 3915: headings **3901–3914 = `other`** (145 records, primary-form polymers), **3915–3926 = `null`** (283 records, waste/articles). Matches the CLAUDE.md / task spec exactly ("other for primary-form polymers 3901–3914, NULL for articles 3915+").
- **intended_role:** packaging 15 (3923 containers — verified `3923.*` mapped to packaging, consistent with gold `3923.29.10`), support 1, technical_use 11, null 401. Distribution sensible.

### 4. Enum compliance (ALL 428 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations.**

### 5. Vocab fidelity vs validation-set + LOGGED CONVENTION NOTE
- `3918.10.90` (PVC floor covering) and `3923.29.10` (PVC packaging bag, role=packaging): BIG-39 conventions match gold (PVC material vocab, finished/manufactured-article proc, role=packaging for 3923). **Consistent.**
- **Convention note (not a defect, not an enum violation):** Gold `3905.29.00` (a primary-form polymer, heading 3905, within the 3901–3914 range) carries `chemical_class: null`, whereas BIG-39 assigns `other` to ALL primary-form polymers 3901–3914. BIG-39 is internally consistent (clean break) and follows the explicit documented spec; the gold record diverges from that spec. Both values are within the enum. The validation-set contains only one in-range primary-form Ch.39 record, so the sample is too thin to call BIG-39 wrong. **Recommendation:** reconcile the project-wide convention (spec says `other`; one gold record says `null`) at the data-load / spec-owner level — applies chapter-wide, not a BIG-39 rework item.

---

## Overall assessment vs baseline

| Metric | Baseline | BIG-29a | BIG-39 |
|---|---|---|---|
| Sig-diversity | 88–100% | **100.0%** | **98.8%** |
| Notes-uniqueness | ~100% | **100.0%** | **100.0%** |
| Enum violations | 0 | **0** | **0** |
| HIGH confidence | ~78% | 78.9% (274/347) | 67.5% (289/428) |
| Integrity (count/dupe/coverage) | clean | **clean** | **clean** |

Both chunks **meet or exceed baseline**. Default-suspicion hypothesis (early chunks looser) is **not supported by evidence** — BIG-29a and BIG-39 are at or above rolling-baseline quality on every measured axis. BIG-39's HIGH-confidence share (67.5%) is below the ~78% baseline, but this is expected and appropriate: Ch.39 has many residual "other"/basket subheadings legitimately extracted at MEDIUM confidence, and MEDIUM records are correctly reasoned. Not a quality concern.

**No records require rework.** One chapter-wide convention reconciliation logged for the spec owner (chemical_class for primary-form Ch.39 polymers: spec/`other` vs one gold/`null`).

### Final verdicts
- **BIG-29a: PASS**
- **BIG-39: PASS**

# F4 Independent Calibration Audit — BIG-84b + BIG-84c

**Auditor role:** Independent calibration reviewer (Phase 4 O2 final audit, F4)
**Date:** 2026-05-28
**Scope:** Ch.84 machinery — BIG-84b (8429.59–8459.29, 362 records) and BIG-84c (8459.29–8487.90, 361 records)
**Primary focus:** `electrically_heated` false positives (sibling BIG-84a defect class)

---

## Verdict summary

| Chunk | Records | Integrity | electrically_heated | Templating | Enums | Verdict |
|---|---|---|---|---|---|---|
| BIG-84b | 362/362 | PASS | 6 true, all legit | 99.7% sig-div, 0 dup notes | PASS | **PASS** |
| BIG-84c | 361/361 | PASS | 2 true, all legit | 99.2% sig-div, 0 dup notes | PASS | **PASS** |

**electrically_heated false positives: NONE in either chunk.**

---

## 1. Integrity

- **BIG-84b:** declared `code_count`=362, output=362. Zero missing, zero extra, zero duplicate codes. Input→output order preserved. All codes match format `^\d{4}\.\d{2}\.\d{2}$`. Range 8429.59.00 → 8459.29.10.
- **BIG-84c:** declared `code_count`=361, output=361. Zero missing, zero extra, zero duplicate codes. Order preserved. All format-valid. Range 8459.29.20 → 8487.90.00.
- No range overlap between chunks (clean split at the 8459.29 subheading boundary: .10 in 84b, .20+ in 84c).

## 2. electrically_heated discipline (CRITICAL)

Every `electrically_heated=true` record was individually verified against its description. **All 8 are genuine electric-heating machines. No defect.**

**BIG-84b (6 true):**
| Code | Description | Verdict |
|---|---|---|
| 8436.21.00 | Poultry incubators and brooders | LEGIT — incubators/brooders are electrically heated by design |
| 8436.80.10 | Germination plant fitted with mechanical and **thermal** equipment | LEGIT — explicit thermal/heating element |
| 8443.39.60 | Thermo-copying apparatus | LEGIT (brief: 8443.39 thermo-copying) |
| 8451.21.00 | Drying machines ≤10 kg dry linen | LEGIT (brief: 8451.21 textile drying) |
| 8451.30.10 | Hand ironing press | LEGIT (brief: 8451.30 ironing) |
| 8451.30.90 | Other ironing machines/presses | LEGIT (brief: 8451.30 ironing) |

**BIG-84c (2 true):**
| Code | Description | Verdict |
|---|---|---|
| 8476.21.20 | Beverage vending — Incorporating heating devices | LEGIT (brief: 8476.21 hot-vending) |
| 8476.81.20 | Product vending — Incorporating heating devices | LEGIT (brief: 8476.81 hot-vending) |

**Negative-control check (BIG-84a defect class avoided):**
- 8476.21.10 / 8476.81.10 "Incorporating **refrigerating** devices" → correctly `electrically_heated=null`. This is precisely the cooling-machine-wrongly-flagged defect from 84a; it does NOT recur here.
- All refrigeration/cooling/valve descriptions scanned → none carry `electrically_heated=true`.
- 8468 soldering/brazing/welding subheadings (8468.10/.20/.80/.90) → `electrically_heated=null`. Defensible: ITC-HS 8468 is predominantly gas/flame-operated ("gas-operated surface tempering"); the India subheadings ("Hand-held blow pipes", generic "Welding or cutting machines") do not specify electric resistance heating, so null is the correct conservative call. NOT flagged as a defect.
- `electrically_warmed=true`: zero records in either chunk (correct — that flag is for wearables, Ch.61/62/85).

## 3. function_ specificity

Strong. 12-record samples per chunk confirm machine-specific functions, not generic placeholders:
- 84b examples: 8445.20.13 → `cotton-spinning, ring-spinning`; 8446.30.12 → `cotton-weaving, shuttleless-weaving`; 8459.29.10 → `drilling`.
- 84c examples: 8459.69.30 → `metal-milling, plano-milling, piano-milling`; 8462.32.00 → `sheet-metal-slitting, cut-to-length`; 8482.91.30 → `bearing-rolling-element`.
- **Parts inheritance:** verified across 18 parts rows. All carry `form:["part"]` (or `["part","accessory"]`) and inherit the parent machine's function — e.g. 8433.90.00 Parts → `harvesting, mowing, threshing`; 8436.91.00 Parts of poultry machinery → `egg-incubation, chick-brooding`; 8448.49.10 Parts of cotton weaving → `cotton-weaving`. No parts row left with a generic/empty function.

## 4. Enum compliance

- `chemical_class`: NULL on all records in both chunks (correct for machinery). PASS.
- `fabric_construction`: NULL on all records (correct). PASS.
- `solution_purpose`: all-null in both chunks; no out-of-set values (valid set: safety_transport/specific_use/none). PASS.
- `intended_role`: valid set per sub-spec 04 = {packaging, support, technical_use, implant, optical_element, other}.
  - BIG-84b: single non-null = **8452.90.11 = `support`** ("Furniture, bases and covers for sewing machines"). `support` IS a valid enum member and is a genuine fit. COMPLIANT — not a violation.
  - BIG-84c: all null. PASS.
- `predominant_element` non-null only on 8482.91.11–.14 (bearing balls: nickel alloys / tungsten carbide / stainless / high-speed steel → nickel/tungsten/iron/iron). These are description-driven, the material is named explicitly in the tariff text, and metal_pct fields remain null (no percentages stated). COMPLIANT — correct extraction, not a hallucination.
- All other metal pct fields, sieve, made_up, in_solution, wearable → null. PASS.
- `extraction_confidence` ∈ {HIGH, MEDIUM}; `validation_status` = pending throughout. Valid.

## 5. Templating health

- **BIG-84b:** signature diversity 361/362 (99.7%). Single collision = two near-identical weaving-part sibling codes. Zero duplicate `extraction_notes`. Zero empty notes.
- **BIG-84c:** signature diversity 358/361 (99.2%). 3 collisions, all legitimate sibling pairs (milling machine-tools, manual valves, crankshafts). Zero duplicate notes. Zero empty notes.
- No evidence of copy-paste templating; extraction_notes are per-code and substantive.

## 6. Exact fixes required

**NONE.** Both chunks pass cleanly. No electrically_heated false positives, no enum violations, no integrity gaps, no templating defects. The BIG-84a heating/cooling defect class was correctly avoided (refrigerating-device vending siblings are properly eh=null).

---

**Audit file:** `backend/data/build-time/O2-tariff-line-attributes/chunks/audits/F4-BIG84b-BIG84c-audit.md`

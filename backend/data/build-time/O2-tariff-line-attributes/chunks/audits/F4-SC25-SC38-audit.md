# F4 Calibration Audit — SC-25 (Ch.25 salt/sulphur/earths/stone/lime/cement) & SC-38 (Ch.38 misc chemical products)

**Auditor:** Independent calibration reviewer (phase F4)
**Date:** 2026-05-28
**Method:** Programmatic full-scan (integrity + enum + templating forensics) over 100% of records, plus targeted per-code sampling (sieve/restricted-commodity discipline for Ch.25; chemical_class distribution + special-case codes for Ch.38) and gold-sibling vocab comparison.
**Authoritative enum sets** (from migrations `20260526120100` + `20260526120400`):
- chemical_class ∈ {separate_organic_compound, separate_inorganic_compound, isomer_mixture, sugar_derivative, diazonium_salt, other, NULL}
- intended_role ∈ {packaging, support, technical_use, implant, optical_element, other, NULL}
- solution_purpose ∈ {safety_transport, specific_use, none, NULL}
- fabric_construction ∈ {knitted, crocheted, woven, wadding, other, NULL}

---

## SC-25 — Ch.25 salt/earths/stone/lime/cement — VERDICT: **PASS**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 173 === 173 PASS |
| Every code once / 0 dupes | 173 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE (byte-identical code order) PASS |
| 43-field schema | 0 field issues across all 173 PASS |
| Array-field / notes / confidence types | 0 type/content issues; no empty material[] PASS |
| JSON valid | VALID PASS |
| Extraction model consistency | `claude-opus-4-7` (single) PASS |
| Confidence distribution | HIGH 126 / MEDIUM 47 (no LOW) PASS |
| validation_status | `pending` ×173 (expected pre-load) PASS |

### 2. Mineral-material discipline
Mineral products correctly carry the mineral name in `material[]` (e.g. 2501 → `sodium-chloride/common-salt`; 2503 → `sulphur`; 2517.41 → `marble/calcium-carbonate`; 2504 → `graphite/natural-graphite`). `chemical_class` NULL chapter-wide (173/173) — correct: Ch.25 is mineral products, not Ch.28 chemicals. PASS

### 3. Sieve discipline (the core Ch.25 risk)
`sieve_pass_pct_1mm` and `sieve_pass_pct_5mm` are **NULL on all 173 records**. No input description carries an explicit passing-percentage granulometry. The one near-miss — **2525.20.10 "Mica flakes, 2.20 mesh"** — was correctly NOT mapped (a mesh-grade designation is not a sieve-passing %); the note explicitly records "Sieve fields NULL," and the granule/chipping/micronised lines (2517.41/.49, 2525.20.30, 2504.90.10) likewise leave sieve NULL with an explicit rationale. **Sieve discipline: clean — populated only when explicit granulometry, which never occurs here.** PASS

### 4. Restricted-commodity flagging
All 18 asbestos lines (2524.10/2524.90.*) carry `asbestos` + specific species (`crocidolite/chrysotile/amosite/amphibole`) in `material[]` and an explicit **"RESTRICTED COMMODITY"** note citing carcinogenicity, Rotterdam/Basel Conventions, and DGFT controls. Monazite/radioactive ores correctly **absent** (those sit in Ch.26, not this chunk). PASS

### 5. intended_role = technical_use discipline (32 records)
`technical_use` is applied to — and only to — genuine refractory/abrasive/electrode/dielectric minerals: graphite 2504 (electrodes/lubricant); fireclay 2508.30, andalusite/kyanite/sillimanite/mullite/chamotte 2508.5x–70, calcined dolomite 2518.20, dead-burnt magnesia 2519.9, high-alumina refractory cement 2523.90.20 (refractories); emery/corundum/garnet/pumice 2513 (abrasives); mica blocks/splittings/condensor-films 2525.10 (dielectric). Construction binders — quicklime/slaked/hydraulic lime (2522), portland/slag/pozzolana cement (2523.1x–.29) — correctly NULL. No over-application. PASS

### 6. Templating forensics
- Signature diversity = **98.3%** (170 unique / 173). Unique extraction_notes = 173/173 (zero verbatim-duplicate notes).
- Only 3 repeated attribute signatures, **0 cross-subheading** — all within-subheading residual siblings. No cross-subheading identical signatures that should differ. PASS

### 7. Enum compliance (full scan)
chemical_class 0 violations (all NULL) · fabric_construction 0 (all NULL) · intended_role 0 (NULL/technical_use only) · solution_purpose 0 (all NULL) · metal-pct fields 0 non-null · textile/electrical flags 0 non-null. PASS

---

## SC-38 — Ch.38 miscellaneous chemical products — VERDICT: **PASS**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 213 === 213 PASS |
| Every code once / 0 dupes | 213 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE PASS |
| 43-field schema | 0 field issues across all 213 PASS |
| Array-field / notes / confidence types | 0 type/content issues; no empty material[] PASS |
| JSON valid | VALID PASS |
| Model / confidence | `claude-opus-4-7`; HIGH 150 / MEDIUM 63 (no LOW) PASS |
| validation_status | `pending` ×213 PASS |

### 2. chemical_class distribution (the core Ch.38 risk) — full scan
| Value | Count | Correctness |
|---|---|---|
| other | 204 | Correct — Ch.38 is overwhelmingly preparations/mixtures (pesticides 3808, prepared binders/rosin 3801–3807, additives 3811, anti-freeze 3820, reagents 3822, etc.). `other` is the right bucket. |
| separate_inorganic_compound | 4 | **Exactly the 4 × 3818** doped silicon wafers / SiC & GaN epitaxial films (chemical elements/compounds doped for electronics). Correct. |
| isomer_mixture | 3 | **Exactly 3817.00.11/.19/.20** — mixed alkylbenzenes / alkylnaphthalenes. Correct. |
| sugar_derivative | 2 | **3824.60.10/.90** — sorbitol other than 2905.44 (aqueous / crystalline). Parent-inherited "sorbitol" from the 3824.60 subheading even though leaf descriptions read only "In aqueous solution"/"Other". Correct. |

No `separate_organic_compound`/`diazonium_salt` mis-application; the three specific enums are reserved precisely for the codes that warrant them. **Distribution is correct.** PASS

### 3. intended_role / in_solution discipline
- `intended_role = technical_use` ×19 — catalysts 3815.11/.12/.19 (named active substance: nickel, Pt/Pd-on-activated-carbon), the 4 × 3818 semiconductor wafers/films, plus other technical reagents/refractory preparations. Correct; remainder NULL.
- `in_solution = true` (1) + `solution_purpose = specific_use` (1) — both on **3824.60.10 "In aqueous solution"** (sorbitol). Correct.
- `predominant_element = Si` on 3818.00.10 (silicon wafer) — sole metal/element field used, contextually correct.

### 4. Pesticides named (3808)
Active ingredients named in `material[]` with OCR misspellings normalised: DDT/clofenotane (3808.52), dichlorvos/DDVP (3808.91.13), malathion ("Melathion"→3808.91.24), endosulfan ("Endosulphan"→3808.91.31), methyl-bromide/bromomethane (3808.91.22), quinalphos ("Quinal phos"→3808.91.32), aluminium-phosphide/phostoxin (3808.91.11), calcium-cyanide (3808.91.12). PASS

### 5. Templating forensics
- Signature diversity = **97.7%** (208 unique / 213). Unique notes = 213/213 (zero verbatim-duplicate notes).
- 4 repeated attribute signatures; **3 are cross-subheading**, all within heading **3827** (HFC/HCFC refrigerant blends): `[3827.31/.32/.39]`, `[3827.62/.63]`, `[3827.68/.69]`. These residual "Other... containing HFC/HCFC" lines genuinely share material/form/role and differ only by an exact HFC-125 **mass-percentage threshold** (55% vs 40%) — a numeric distinction not representable in the controlled-vocabulary attribute fields. The model **correctly differentiates each in the notes** (cites its specific threshold + subheading + Kigali/ozone controls). Legitimate parent-inheritance, not templating laziness. PASS

### 6. Enum compliance (full scan)
chemical_class 0 violations · fabric_construction 0 (all NULL) · intended_role 0 · solution_purpose 0. PASS

---

## Gold-sibling note
`validation-set-50.json` contains **no Ch.25 or Ch.38 codes** (verified). No direct gold comparison possible; sibling-vocab discipline assessed within-chunk against canonical mineral/chemical vocabulary (clean). No gold-fidelity defect.

---

## Summary

| Chunk | Verdict | Sig diversity | Integrity | Enum | Notes |
|---|---|---|---|---|---|
| SC-25 | **PASS** | 98.3% | 173/173, in-order, 0 dup/gap | clean (0 viol) | sieve NULL chapter-wide (no explicit granulometry; "2.20 mesh" correctly not mapped); 18 asbestos lines all RESTRICTED-flagged; technical_use ×32 = refractory/abrasive/electrode/dielectric only; cement & lime NULL |
| SC-38 | **PASS** | 97.7% | 213/213, in-order, 0 dup | clean (0 viol) | chemical_class: other 204 / inorganic 4 (3818) / isomer 3 (3817) / sugar 2 (3824.60) — correct; pesticides named w/ OCR normalisation; 3 cross-sub identical-sig groups all legit 3827 HFC blends differing only by mass-% threshold (differentiated in notes) |

**Records needing rework: NONE** in either chunk. **No enum violations, no templating defects, no integrity/field-schema defects, no sieve/restricted-commodity discipline failures.**

**Exact fixes needed:** none.

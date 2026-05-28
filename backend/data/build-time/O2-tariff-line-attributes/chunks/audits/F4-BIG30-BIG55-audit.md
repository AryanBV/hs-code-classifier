# F4 Calibration Audit — BIG-30 (Ch.30 pharmaceuticals) & BIG-55 (Ch.55 man-made staple)

**Auditor:** Independent calibration reviewer (phase F4)
**Date:** 2026-05-28
**Method:** Programmatic full-scan (integrity + enum + templating forensics + cross-domain field discipline) over 100% of records, plus BIG-30 provenance/clinical-framing forensics, segment-boundary vocab continuity, per-code sampling (12 each), and gold-sibling vocab comparison. Enum sets derived from the full O2 corpus value-distribution (DB CHECK sets) since sub-spec files are absent from the tree.

---

## BIG-30 — Ch.30 pharmaceuticals — VERDICT: **PASS**

Provenance: rebuilt from 148 recovered + 79 authored records (227) after a two-agent race/recovery.

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 227 === 227 PASS |
| Every code once / 0 dupes | 227 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE (byte-identical order) PASS |
| Strictly monotonic | TRUE PASS |
| Deny-list codes in output | 0 (SC-30 deny-list empty) PASS |
| 43-field schema / key-set | 43 fields, 0 key-set inconsistencies across 227 PASS |
| JSON valid | VALID PASS |
| Model / extracted_at | `claude-opus-4-7` ×227; single `2026-05-28T00:00:00Z` PASS |
| Confidence | HIGH 190 / MEDIUM 37 (no LOW) PASS |
| validation_status | `pending` ×227 PASS |

### 2. Provenance — 148/79 boundary + framing cleanliness
- **Boundary seam** at the 148/79 split: codes [145–151] `3004.90.26 → .27 → .29 → .31 → .32 → .33 → .34` — no gap, no duplicate, strictly monotonic across the recovered/authored seam. seg1 (0–147) = `3001.20.10..3004.90.29`; seg2 (148–226) = `3004.90.31..3006.93.00`. PASS
- **Vocab continuity:** kebab-case throughout, 0 underscore/style drift in `material`. seg2-only `form` vocab (`gauze, bandage, dressing, suture, cement, paste, kit, poultice, lint, adhesive-tape, medicated-plaster`) is **structurally correct, not drift** — seg2 covers headings 3005 (wadding/gauze/dressings) and 3006 (pharma goods: sutures, dental cements, first-aid kits), which legitimately introduce wound-care/surgical vocab absent from seg1's 3001–3004 medicaments. PASS
- **Clinical-pharmacology / dosing framing scan (CRITICAL):** 0 violations. 12 controlled-substance records (ketamine ×2, codeine/morphine/ephedrine/pseudoephedrine/norephedrine alkaloid group) are framed **purely as tariff lines** with regulatory/customs context only — e.g. "Ketamine under 3003.90 as bulk substance … controlled chemical compound under NDPS Act"; "precursor-control alkaloid (parallel bulk 3003.41)". NO dosing, NO administration instructions, NO pharmacokinetics, NO abuse/recreational framing. 4 regex pre-flags (`measured doses`, `fixed-dose combination`, `IV infusion solution`, `patient-administered`) are confirmed **false positives** — all are HS subheading terminology (3002.15 literally reads "…put up in measured doses…"). PASS

### 3. Field discipline (spec sample)
- `form`: tablet (121), injection (103), capsule (36), syrup (20), suspension (19), vaccine (16), powder (15) — correctly populated to descriptions. PASS
- `chemical_class`: **`other` for ALL medicaments** (3003: 23/23, 3004: 141/141); **NULL for biologicals** (3001 glands/extracts 7/7, 3002 blood/antisera/vaccines 34/34) and dressings (3005 11/11); 3006 mixed (4 NULL + 7 `other`). Matches spec exactly. PASS
- `intended_role`: **3006.50.00 (first-aid kits) → `packaging`** (form=`kit`); 3006.93 (clinical-trial kit) → `packaging`; all other 3006 + chapter → NULL. PASS
- `in_solution`=true (12), each paired with `solution_purpose=specific_use`; rest NULL. Consistent. PASS
- Cross-domain NULLs: metal-pct (0 non-null), sieve (0), `predominant_element` (0), `wearable`/`electrically_*` (0), `composite_components` (0), `fabric_construction` (0). PASS

### 4. Templating forensics
- Signature diversity **92.1%** (209 unique sigs / 227); **extraction_notes 227/227 unique (0 duplicate-note groups)**. Repeated signatures are legitimate parent-inherited medicament-form siblings (e.g., tablet/capsule/injection antibiotic groups). PASS

### 5. Per-code sample (12)
3001.20.10 liver-extract liquid; 3002.13.00 immunological raw/bulk; 3003.20.00 antibiotic chem=other; 3004.10.10 penicillin tablet/capsule/injection; 3004.90.96 ketamine injection chem=other; 3005.90.20 kaolin poultice; 3006.10.10 catgut suture; 3006.50.00 first-aid kit role=packaging; 3006.60.20 contraceptive/hormone. All correct.

### 6. Enum compliance (full scan)
chemical_class 0 · fabric_construction 0 · intended_role 0 · solution_purpose 0 · predominant_element 0. PASS

---

## BIG-55 — Ch.55 man-made staple — VERDICT: **PASS**

Build: 142 + 71 (=213).

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 213 === 213 PASS |
| Every code once / 0 dupes | 213 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE PASS |
| Strictly monotonic | TRUE PASS |
| Deny-list codes in output | 0 (gold held out) PASS |
| 43-field schema / key-set | 43 fields, 0 key-set inconsistencies PASS |
| JSON valid | VALID PASS |
| Model / extracted_at | `claude-opus-4-7` ×213; single `2026-05-28T00:00:00Z` PASS |
| Confidence | HIGH 135 / MEDIUM 78 (no LOW) PASS |
| validation_status | `pending` ×213 PASS |

### 2. Boundary integrity (142/71 split)
- Seam at idx 142: codes [139–145] `5514.42.00 → .43.00 → .49.00 → 5515.11.10 → .20 → .30 → .40` — no gap, no duplicate, strictly monotonic. Split is heading-aligned (seg1 5501–5514, seg2 5515–5516). PASS

### 3. fabric_construction / made_up discipline (the core Ch.55 risk) — full scan by heading
| Headings | Type | fabric_construction | made_up |
|---|---|---|---|
| 5501–5511 (95 recs) | tow / staple fibre / waste / carded-combed / sewing thread / yarn | `null` ×95 | `null` ×95 |
| 5512 (14) | synthetic woven ≥85% | `woven` ×14 | `false` ×14 |
| 5513 (15) | synthetic woven <85% mixed w/ cotton | `woven` ×15 | `false` ×15 |
| 5514 (18) | synthetic woven <85% mixed, >170 g/m² | `woven` ×18 | `false` ×18 |
| 5515 (45) | other synthetic woven mixtures | `woven` ×45 | `false` ×45 |
| 5516 (26) | artificial-staple woven | `woven` ×26 | `false` ×26 |

**Perfect discipline:** `woven` set on (and only on) the 118 woven-fabric records of 5512–5516; `made_up=false` for all 118 (piece goods, not made-up); both NULL for all 95 fibre/tow/yarn records. No leakage either direction. PASS

### 4. Per-code sample (12) — polymer in material[], blends in composition[]
5501.11.00 nylon/aramid filament-tow; 5503.20.00 polyester-100pct staple; 5506.10.00 nylon staple; 5508.10.00 synthetic-staple sewing thread; 5509.21.00 polyester-85pct-or-more yarn; 5511.10.00 synthetic-staple-85pct yarn; 5513.21.00 polyester/cotton <85% woven; 5516.94.00 artificial-staple printed woven. All correct; fc/mu discipline holds per record. PASS

### 5. Gold fidelity (5503.40.00, 5512.99.10, 5515.91.90)
All 3 gold codes correctly **held out** — absent from both SC-55 input and BIG-55 output (in deny-list). Gold vocabulary faithfully reproduced by present siblings:
- 5503.40.00 (polypropylene staple) ↔ 5503.20/.30/.90 → `<polymer>,synthetic-staple` + `<polymer>-100pct`. MATCH
- 5512.99.10 ↔ 5512.99.20/.90 → `synthetic-staple` + `woven` + `made_up=false` + `other-synthetic-staple-85pct-or-more`. MATCH
- 5515.91.90 ↔ 5515.91.10–.40 → `["synthetic-staple","man-made-filament"]` + `woven` + `other-synthetic-staple-mixed-mainly-with-man-made-filaments`. MATCH

### 6. Templating forensics
Signature diversity **100%** (213/213 unique sigs); extraction_notes 213/213 unique; 0 duplicate-note groups. PASS

### 7. Enum / cross-domain compliance (full scan)
chemical_class 0 · fabric_construction 0 · intended_role 0 · solution_purpose 0 · predominant_element 0. All Ch.30/Ch.55-irrelevant numeric/boolean fields (metal-pct, sieve, wearable, electrically_*, composite_components) NULL chapter-wide. PASS

---

## Summary

| Chunk | Verdict | Sig diversity | Integrity | Enum | Notes |
|---|---|---|---|---|---|
| BIG-30 | **PASS** | 92.1% | 227/227, in-order, 0 dup/gap incl. 148/79 seam | clean | clinical framing CLEAN; controlled substances = tariff lines only; chem=other medicaments / NULL biologicals; 3006.50 role=packaging |
| BIG-55 | **PASS** | 100% | 213/213, in-order, 0 dup/gap incl. 142/71 seam | clean | woven+made_up=false on 118 fabrics (5512–5516), NULL on 95 fibre/yarn (5501–5511); gold-sibling vocab MATCH |

**Records needing rework: NONE** in either chunk. No enum violations, no templating defects, no boundary/seam defects, no field-schema defects, no clinical-framing leakage.

**Exact fixes required: NONE.**

**Note for the O2 register:** The 3 Ch.55 gold codes (5503.40.00, 5512.99.10, 5515.91.90) are absent from the Indian ITC-HS 2022 input schedule (held in deny-list). Gold fidelity assessed against existing sibling tariff lines, which reproduce the gold vocabulary exactly — not a build defect. (A separate `Si` `predominant_element` value found in the corpus-wide scan belongs to a metals chunk, NOT BIG-30/BIG-55; flag for that chunk's auditor, should be `silicon`.)

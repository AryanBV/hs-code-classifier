# F4 Calibration Audit — SM-8 (multi-chapter: Ch.02 meat / 05 animal-products / 22 beverages / 23 residues-fodder / 64 footwear) & SM-9 (multi-chapter: Ch.42 leather / 53 veg-fibres / 69 ceramics / 83 base-metal-articles / 91 clocks-watches / 95 toys)

**Auditor:** Independent calibration reviewer (phase F4)
**Date:** 2026-05-28
**Method:** Programmatic full-scan (100% of records) for integrity + enum + templating forensics; dedicated cross-chapter vocab-bleed scan (group by 2-digit prefix, word-boundary material-level foreign-vocab detection); per-chapter enum focus per brief; gold-fidelity reconciliation against `validation-set-50.json`.
**Authoritative enum sets** (migrations `20260526120100` + `20260526120400`):
- chemical_class ∈ {separate_organic_compound, separate_inorganic_compound, isomer_mixture, sugar_derivative, diazonium_salt, other, NULL}
- intended_role ∈ {packaging, support, technical_use, implant, optical_element, other, NULL}
- solution_purpose ∈ {safety_transport, specific_use, none, NULL}
- fabric_construction ∈ {knitted, crocheted, woven, wadding, other, NULL}

---

## SM-8 — Ch.02/05/22/23/64 — VERDICT: **PASS**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input code_count | 338 === 338 PASS |
| Every code once / 0 dupes | 338 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE (byte-identical code order) PASS |
| 43-field schema | 0 field issues across all 338 PASS |
| Array-field / notes / confidence types | 0 type issues; no empty material[] PASS |
| JSON valid | VALID PASS |
| Extraction model | `claude-opus-4-7` (single) PASS |
| Confidence distribution | HIGH 246 / MEDIUM 92 (no LOW) PASS |
| validation_status | `pending` ×338 (expected pre-load) PASS |

### 2. Per-chapter record split
Ch.02 = 69 · Ch.05 = 69 · Ch.22 = 65 · Ch.23 = 66 · Ch.64 = 69. Balanced, all 5 chapters present.

### 3. Enum focus (per brief)
- **chemical_class NULL except 2207 denatured alcohol = other:** EXACTLY 1 non-null record — `2207.20.00 = other` (denatured ethyl alcohol / methylated spirit). The three undenatured `2207.10.11/.19/.90` lines correctly carry chemical_class=NULL (undenatured ethanol is not bucketed). PASS — precise.
- **wearable true for 6401–6405 footwear:** 57/57 footwear lines wearable=true. PASS.
- **wearable false for 6406 parts:** 12/12 parts wearable=false. PASS — clean wearable/parts discrimination.

### 4. Material discipline (chapter-appropriate vocab)
Ch.02 meat → swine/bovine/pork/offal/carcass; Ch.05 animal products → feather/down/peacock-feather/pig-bristle/swine-hair; Ch.22 → brandy/spirit/grape-distillate/rectified-spirit; Ch.23 → wine-lees/argol/tartar/residue; Ch.64 → leather/sole/upper. All chapter-canonical.

### 5. Templating forensics
- Signature diversity = **99.4%** (336/338 unique).
- Repeated-sig groups: 2, **0 cross-subheading** — `[6403.20.29, 6403.20.90]` and `[6403.51.19, 6403.51.90]`, both within-subheading residual footwear siblings (differ only by Indian sub-tariff numeric split, not representable in controlled vocab).
- Duplicate notes: **1**, on `[6403.51.19, 6403.51.90]` ("Other leather footwear with leather soles, covering the ankle"). **This is exactly the single known-benign dup flagged in the brief, and the ONLY one.** PASS.

### 6. Cross-chapter vocab-bleed
**CLEAN — zero genuine bleed.** Word-boundary material-level scan across all 5 chapters returns no foreign-chapter vocabulary. (A naive substring pre-pass flagged "wine"⊂"s**wine**", "bran"⊂"**bran**dy", "wine"⊂"**wine**-lees@2307" — all false positives; "wine-lees" is genuine Ch.23 wine residue. No meat term in beverages, no footwear term in meat, etc.) PASS.

### 7. Enum compliance (full scan)
chemical_class 0 viol (1× other on 2207.20, rest NULL) · fabric_construction 0 (all NULL) · intended_role 0 · solution_purpose 0 · metal-pct/textile/electrical flags 0 non-null where inappropriate. PASS.

---

## SM-9 — Ch.42/53/69/83/91/95 — VERDICT: **PASS**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input code_count | 375 === 375 PASS |
| Every code once / 0 dupes | 375 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE PASS |
| 43-field schema | 0 field issues across all 375 PASS |
| Array-field / notes / confidence types | 0 type issues; no empty material[] PASS |
| JSON valid | VALID PASS |
| Model / confidence | `claude-opus-4-7`; HIGH 283 / MEDIUM 92 (no LOW) PASS |
| validation_status | `pending` ×375 PASS |

### 2. Per-chapter record split
Ch.42 = 59 · Ch.53 = 64 · Ch.69 = 63 · Ch.83 = 62 · Ch.91 = 64 · Ch.95 = 63. Balanced, all 6 chapters present.

### 3. Enum focus (per brief)
- **Ch.42 wearable for 4203 apparel:** 10/10 `4203` (apparel/gloves of leather) wearable=true. PASS. (4202 containers correctly NOT wearable: 0 true.)
- **Ch.53 fabric_construction = woven for 5309–5311:** 36/36 woven. PASS.
- **Ch.69 intended_role support(refractory bricks)/technical_use(lab ware):** support ×23 = `6901` (siliceous/kieselguhr bricks) + `6902` (refractory bricks/blocks) + `6904` (building bricks) — structural/refractory support. technical_use ×14 = `6903` (other refractory ceramic goods: retorts/crucibles/muffles/nozzles) + `6909` (laboratory/chemical/technical ceramic ware) + `6914.90.10`. Semantically exact: load-bearing bricks→support, lab/process ware→technical_use. Remaining 26 (tableware 6911/6912, sanitary 6910, ornamental 6913, etc.) NULL. PASS.
- **Ch.83 packaging for 8309 closures:** 5/5 `8309` (stoppers/caps/lids/capsules/bung covers/seals) intended_role=packaging. PASS.
- **Ch.91 wearable for wrist-watches:** 9/9 genuine wrist-watch lines (`9101.11–.29`, `9102.11–.29`) wearable=true. The 12 `.91/.99` "Other" lines are **pocket-watches and stop-watches** (NOT wrist-worn) and correctly carry wearable=NULL. Discriminating, not blanket. PASS — model distinguishes wrist vs pocket/stop watches.

### 4. Templating forensics
- Signature diversity = **97.9%** (367/375 unique).
- Duplicate notes: **0** (375/375 unique notes).
- Repeated-sig groups: 7. Within-sub: `[4202.29.10/.90]`, `[5310.90.10/.91]`. Cross-sub: `[5310.10.93/.10.99/.90.99]` (jute woven residuals), `[9113.20.10/.90.10]` (base-metal vs other watch straps), `[9506.32.00/.69.30]` (golf balls — primary + Indian residual line), `[9508.21.00/.22.00]` & `[9508.23.00/.29.00]` (amusement-park rides). All are legitimate residual/sibling lines differing only by fine Indian sub-tariff distinctions NOT representable in controlled vocabulary, and **every one is uniquely differentiated in its extraction_notes** (0 dup notes). Correct parent-inheritance, not templating laziness. PASS.

### 5. Cross-chapter vocab-bleed
**CLEAN — zero genuine bleed.** Word-boundary material-level scan across all 6 chapters returns no misplaced article-of-chapter vocabulary. False positives correctly dismissed: (a) `4202.22.30` "jute" — a genuine jute shopping bag, correctly an article of Ch.42 (jute is a legitimate cross-cutting material); (b) Ch.83 `8308` "leather" appears ONLY in notes ("clasps…for clothing/**leather goods**" = actual HS heading text), material[]=base-metal — correct; (c) Ch.95 footballs / Ch.91 watch straps carry "leather" as a real material attribute (leather footballs, leather watch bands) — correct. No leather→ceramics, no watch→toys, no ceramic→leather bleed. PASS.

### 6. Enum compliance (full scan)
chemical_class 0 viol (all NULL — none of these 6 chapters are chemical) · fabric_construction 0 (woven on Ch.53 veg-fibre fabrics; NULL elsewhere) · intended_role 0 · solution_purpose 0. PASS.

### 7. Gold fidelity (3 Ch.42 codes)
Gold codes `4202.11.60`, `4202.22.40`, `4203.30.00` are **HELD OUT** — absent from both the SM-9 INPUT and output (verified: input gaps `4202.11.50→.70` skips `.60`; `4202.22.30→.90` skips `.40`; no `4203.30` line). This is correct gold-isolation discipline: validation-set codes are excluded from build-time extraction to preserve a clean held-out test set. `code_count`=375 already reflects the exclusion, so integrity remains 375/375 with 0 missing. **No leakage of gold into training data. No fidelity defect.** PASS.

---

## Summary

| Chunk | Verdict | Sig diversity | Integrity | Enum | Cross-chap bleed | Notes |
|---|---|---|---|---|---|---|
| SM-8 | **PASS** | 99.4% | 338/338, in-order, 0 dup/gap | clean (0 viol) | NONE | chemical_class=other only on 2207.20 denatured alcohol; wearable true ×57 (6401–6405) / false ×12 (6406 parts); 1 benign dup note @ 6403.51.19/.90 (the known one, and only one) |
| SM-9 | **PASS** | 97.9% | 375/375, in-order, 0 dup/gap | clean (0 viol) | NONE | 4203 apparel wearable=true ×10; Ch.53 5309–5311 woven ×36; Ch.69 support(bricks 6901/02/04) vs technical_use(refractory/lab 6903/6909); 8309 packaging ×5; Ch.91 wrist-watch wearable=true ×9 / pocket+stop-watch NULL; 0 dup notes; 7 legit residual-sibling sig groups; 3 gold Ch.42 codes correctly held-out |

**Records needing rework: NONE** in either chunk.
**Enum violations: 0. Templating defects: 0. Integrity/field-schema defects: 0. Cross-chapter vocab-bleed: 0 (genuine). Gold leakage: 0.**

**Exact fixes needed: none.**

# F4 Independent Calibration Audit — SM-2 & SM-3 (Packed Multi-Chapter)

**Auditor role:** Independent calibration reviewer (phase F4), default-suspicion stance.
**Date:** 2026-05-28
**Chunks:**
- **SM-2** — Ch.15 oils/fats + Ch.27 mineral fuels + Ch.33 essential oils/cosmetics (364 records; chapter split 15:126 / 27:114 / 33:124)
- **SM-3** — Ch.08 edible fruit/nuts + Ch.12 oil seeds/medicinal plants + Ch.63 made-up textiles (346 records; chapter split 08:114 / 12:117 / 63:115)

**SPECIAL FOCUS:** cross-chapter vocabulary bleed (the #1 risk in packed multi-chapter chunks).
**Rolling baseline:** confidence HIGH ~78% · notes-uniqueness ~100% · enum-violations 0 · sig-diversity 88–100%.

---

## SM-2 — VERDICT: **PASS**

### 1. Integrity
- Output records **364** === input `code_count` 364 === codes array len 364.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **exactly 43 fields** (exact field-set match, no missing/extra keys). JSON valid (parsed clean).
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%), `extracted_at` uniform `2026-05-28T00:00:00Z`.
- `extraction_confidence`: HIGH **293** (80.5%), MEDIUM 71, LOW 0 — at/above baseline.
- 0 records with empty `material` or `function_`.

### 2. Templating forensics
- **Attribute-signature diversity: 353/364 = 97.0%** (within baseline band).
- **extraction_notes uniqueness: 364/364 = 100.0%**; 0 verbatim-duplicate-note groups; 0 empty notes.
- Top repeated signatures are all small, legitimate clusters (x4 petroleum-solvent, x3 motor-spirit gasoline blends, x3 fuel-oil) — i.e. genuinely near-identical fuel grades, not templating fingerprints.

### 3. CROSS-CHAPTER VOCAB BLEED — **CLEAN**
Grouped all 364 records by chapter prefix and scanned every list field for foreign-chapter tokens:
- **Ch.15 (oils/fats):** material vocab = vegetable-oil/olive/fish/colza/castor/palm/wool-grease etc. NO fuel tokens (no petroleum/gasoline/diesel/bitumen) in any Ch.15 record.
- **Ch.27 (fuels):** material vocab = petroleum/coal/coke/bitumen/naphtha/diesel etc. NO cosmetic/fruit tokens.
- **Ch.33 (cosmetics):** material vocab = essential-oil/cosmetic-base/oleoresin/perfume/resinoid. NO fuel tokens.
- **6 regex pre-flags investigated → ALL legitimate, NOT bleed:**
  - `1505.00.10/.20/.90` (wool alcohol, wool grease, lanolin), `1516.20.31` (hydrogenated castor opal wax), `1521.90.10` (beeswax): `cosmetic-base` appears in `function_`/`intended_use`, which is the correct cross-use semantic for these Ch.15 fats. Material is chapter-appropriate. Not bleed.
  - `2710.19.87`: token `jute-batching-oil` is the product's own official ITC description ("jute batching oil conforming to IS 1758"); material is `petroleum`. The "jute" token is the petroleum product's name, not Ch.63 textile bleed. Correct.

### 4. Per-code reasoning (sampled 3–4 per chapter)
- `1501.10.00` Lard → mat [pig,lard], fn [food-fat,edible-fat]. `2701.11.00` Coal → mat [coal,anthracite], fn [fuel]. `3301.12.00` Orange essential oil → mat [essential-oil,orange], fn [essential-oil]. All code-specific, accurate.

### 5. Enum compliance (ALL 364 records) — **0 violations**
chemical_class / fabric_construction / intended_role / solution_purpose / confidence all within DB enum sets.

### 6. Task-specific business rules
- **chemical_class = `other` ONLY on Ch.33 prepared cosmetics: CONFIRMED.** 52 records, all Ch.33 (0 outside). All are prepared/mixed products (synthetic flavouring essences 3302.10.x, perfume-base mixtures 3302.90.x, eau-de-cologne 3303.x). Single essential oils correctly NULL: all 53 Ch.33 essential-oil-function records have `chemical_class=NULL` (0 mis-tagged `other`). NOT applied to any Ch.15 oil or Ch.27 fuel. Correct.
- **fabric_construction NULL all: CONFIRMED — 364/364 NULL.**
- **in_solution=true for aqueous cosmetic distillates: CONFIRMED.** 9 records, all Ch.33, all genuine solutions (aqueous solutions of essential oils 3301.90.71/.79, rose water, keora water, eau-de-cologne, spirituous toilet prep, sterile contact-lens solution). 0 false positives.
- **All metal-pct / sieve / electrical / composite fields NULL: CONFIRMED (0 non-null).**

### 7. Minor (non-blocking)
- `solution_purpose` is NULL on all 9 `in_solution=true` records. Enum permits NULL, but `specific_use` would be defensible for the named distillates (rose water, keora water, contact-lens solution). Cosmetic-only; does not affect verdict.

---

## SM-3 — VERDICT: **PASS**

### 1. Integrity
- Output records **346** === input `code_count` 346 === codes array len 346.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **exactly 43 fields** (exact field-set match). JSON valid.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%), `extracted_at` uniform `2026-05-28T00:00:00Z`.
- `extraction_confidence`: HIGH **279** (80.6%), MEDIUM 67, LOW 0.
- 0 records with empty `material` or `function_`.

### 2. Templating forensics
- **Attribute-signature diversity: 331/346 = 95.7%** (within baseline band).
- **extraction_notes uniqueness: 346/346 = 100.0%**; 0 duplicate-note groups; 0 empty notes.
- Largest repeat = x8 mango signature — legitimate (multiple mango tariff lines all sharing fresh-table-fruit semantics). Not templating.

### 3. CROSS-CHAPTER VOCAB BLEED — **CLEAN (zero foreign tokens)**
Grouped all 346 records by chapter prefix; scanned every list field:
- **Ch.08 (fruit/nuts):** material = mango/berry/coconut/citrus/cashew/areca-nut/date; function_ = food (114), masticatory (areca/betel). NO textile, NO seed-sowing, NO fuel tokens.
- **Ch.12 (seeds/plants):** material = groundnut/medicinal-plant/seaweed/soybean/oil-seeds; function_ = medicinal-plant/sowing-seed/oil-seed/fodder. NO textile, NO fruit, NO fuel tokens.
- **Ch.63 (textiles):** material = cotton/textile/synthetic/jute/man-made-fibre/silk/wool; function_ = household-textile/furnishing/packaging/protective. NO fruit, NO seed, NO fuel tokens.
- Automated foreign-token scan returned **CLEAN** with 0 hits on all three chapters.

### 4. Per-code reasoning (sampled 3–4 per chapter)
- `0801.11.00` Desiccated coconut → [coconut], food. `1201.10.00` Soybean seed → [soybean], sowing-seed vs `1201.90.00` → oil-seed (correct seed/oil distinction). `6301.20.00` wool blanket → [wool,fine-animal-hair], fab=woven. All accurate.

### 5. Enum compliance (ALL 346 records) — **0 violations**
- chemical_class dist: NULL 346.
- fabric_construction dist: NULL 256 / woven 76 / knitted 14 — all valid.
- intended_role dist: NULL 332 / packaging 14 — all valid.

### 6. Task-specific business rules
- **fabric_construction set ONLY on Ch.63: CONFIRMED.** 90 non-NULL records, 100% Ch.63, 0 outside. 25 Ch.63 records correctly NULL (electric blankets, coir/venetian/austrian blinds, awnings — articles where weave/knit doesn't apply).
- **made_up=true on all Ch.63: CONFIRMED.** 115/115 Ch.63 records = true; 0 made_up=true outside Ch.63.
- **intended_role=packaging for 6305 sacks: CONFIRMED.** All 14 `6305.x` records (jute hessian/sacking bags, cotton sacks, FIBC) tagged `packaging`; 0 packaging-role records outside 6305.
- **chemical_class NULL all: CONFIRMED — 346/346 NULL.**

### 7. Field semantics — strong positive signal (NOT errors)
Non-NULL electrical/wearable/composite values were all individually verified correct:
- `6301.10.00` Electric blankets → `electrically_warmed=true, electrically_heated=true` ✓; `6301.20.00` "Blankets (other than electric)" → `electrically_warmed=false` ✓ (explicit negative distinction).
- `6307.20.x` life jackets/belts, `6307.90.91` textile face masks, `6309.00.00` worn clothing → `wearable=true` ✓.
- `6308.00.00` retail sets of woven fabric + yarn → `composite_components=["woven-fabric","yarn"]` ✓ (correct GIR-3(b) set tagging, matches description verbatim).
These demonstrate genuine per-code reasoning rather than blanket NULLing.

### 8. Minor (non-blocking)
None material.

---

## Summary

| Check | SM-2 | SM-3 |
|---|---|---|
| Count === input | 364 === 364 ✓ | 346 === 346 ✓ |
| Duplicates | 0 | 0 |
| 43 fields exact | ✓ | ✓ |
| JSON valid | ✓ | ✓ |
| Sig-diversity | 97.0% | 95.7% |
| Notes uniqueness | 100% | 100% |
| Cross-chapter vocab bleed | CLEAN | CLEAN |
| Enum violations | 0 | 0 |
| Confidence HIGH | 80.5% | 80.6% |
| Business-rule compliance | full | full |
| **Verdict** | **PASS** | **PASS** |

**Both chunks PASS.** No cross-chapter vocabulary bleed in either packed chunk. All packed-chunk-specific enum and field rules satisfied. No fixes required (one cosmetic `solution_purpose` observation on SM-2 noted for optional polish, non-blocking).

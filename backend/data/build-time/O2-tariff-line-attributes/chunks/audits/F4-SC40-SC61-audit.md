# F4 Calibration Audit — SC-40 (Ch.40 Rubber) & SC-61 (Ch.61 Knitted Apparel)

Independent reviewer (F4). Date 2026-05-28. Auditor model: Opus 4.7.
Method: programmatic integrity + enum + templating scan (`chunks/audits/_f4_sc40_sc61.js`) plus
per-code 12-sample manual inspection against input descriptions and gold reference.

---

## SC-40 — Ch.40 rubber and articles — VERDICT: **PASS**

### Integrity
- count: input code_count=169, input codes.length=169, output=169 — **MATCH**
- missing=0, extra=0, dupes=0
- All 169 records carry the full 43-field set (no missing/extra fields; `_context` not present in these records)
- JSON valid (parsed clean)
- Metadata: extraction_model=`claude-opus-4-7` (0 bad), extracted_at populated (0 bad)
- validation_status: all `pending`; confidence HIGH=139 / MEDIUM=30
- Heading coverage 4001–4017 (all 17 Ch.40 headings present)

### Enum compliance (DB sets) — ALL CLEAN
- fabric_construction: 169/169 NULL (correct — not apparel) — 0 out-of-enum
- chemical_class: **169/169 NULL** (correct — Ch.40 is not Ch.28/29 chemistry) — 0 out-of-enum
- intended_role: NULL=131, technical_use=38 — 0 out-of-enum
- solution_purpose: specific_use=9, NULL=160 — 0 out-of-enum
- in_solution: true=9, NULL=160

### Rubber discipline (spot-checks)
- **NR vs SR material**: 4001.* correctly tagged `natural-rubber` (incl. hevea, crepe, balata/gutta-percha sub-variants); 4002.* correctly tagged `synthetic-rubber` with sub-type chemistry (SBR/BR/IIR/CR/NBR). processing_state carries `natural` vs `synthetic` discriminator consistently. CLEAN.
- **Tyres radial-vs-bias** (4011/4012/4013): 4011.10/.20 split `radial` (`.10` "Radials") vs `bias-ply` (`.90` "Other") — correct. Retreaded (4012.1x) → `retreaded`; used (4012.20) → `used`; solid (4012.90) → `solid`. Discipline correct.
- **Latex in_solution**: all 5 latex/aqueous-dispersion grades (4002.11/.41/.51/.80.10/.91) → `in_solution=true, solution_purpose=specific_use`. Correctly NOT applied to solid latex-foam articles (4008.19.10 block, 4008.29.30 foam sponge → null). CLEAN.
- **Belts technical_use** (4010 conveyor/transmission belts): all 4010.* → `intended_role=technical_use`. 4016 technical articles (e.g. 4016.99.10 textile-industry rubber cots) also technical_use. CLEAN.
- **Gloves/apparel wearable** (4015): gloves/mitts/apron/diving-suit/industrial-gloves → `wearable=true` (6 records); 4015.90.20 "Labels" correctly `wearable=null` (not worn). CLEAN.

### Templating
- full-signature diversity: 156/169 = **92.3%**
- unique extraction_notes: 169/169 = 100% (no duplicate notes)
- cross-subheading sig collisions: 4 — **ALL LEGITIMATE**. They are belt sub-families within heading 4010 (V-belts/timing-belts of differing dimensions + their "Other" tail-codes) that genuinely share material/form/function/use/processing_state; the only discriminator is the quantitative rubber-compound-content threshold (<25% band), which is not an attribute axis. Not lazy templating.
- No numeric pct field populated (correct — Ch.40 has no metal composition).

---

## SC-61 — Ch.61 knitted apparel — VERDICT: **PASS**

### Integrity
- count: input code_count=187, input codes.length=187, output=187 — **MATCH** (built 127+60 split)
- missing=0, extra=0, dupes=0
- All 187 records carry the full 43-field set
- JSON valid
- Metadata: extraction_model=`claude-opus-4-7` (0 bad), extracted_at populated (0 bad)
- validation_status: all `pending`; confidence HIGH=152 / MEDIUM=35

### Boundary integrity (127/128 split)
- Headings present 6101–6117 (contiguous, all of Ch.61 in-scope headings)
- code[126]=6110.90.00, code[127]=6111.20.00 — clean seam, **no duplicate and no gap** across the split point
- Set-level check confirms 0 dupes / 0 missing → the two sub-builds merged cleanly.

### KNITTED axis (Ch.61 defining attribute) — **CONFIRMED 100%**
- fabric_construction=`knitted`: **187/187 (ALL-KNITTED=true)**, 0 out-of-enum, 0 crocheted, 0 woven, 0 null
- The known **6105.10.10** crochet case is handled correctly: description is "Shirts, hand crocheted" but fabric_construction=`knitted` with a note explaining crochet is treated as knitted (Ch.61 covers both; both valid). Consistent with chapter axis.

### Other defining attributes
- made_up=`true`: **187/187** (0 exceptions) — correct for finished garments
- intended_role: **187/187 NULL** (correct — apparel uses no role enum)
- chemical_class: 187/187 NULL; in_solution/solution_purpose 187/187 NULL — correct
- wearable: true=186, false=1. The single `false` is **6117.90.00** ("parts" of knitted garments — collars/cuffs/plackets) — correctly flagged not-standalone-wearable. Defensible and arguably the most correct call in the chunk.

### Gold fidelity (3 Ch.61 codes: 6103.29.90, 6108.19.10, 6115.21.00)
- These 3 codes are the **held-out validation seeds** in `validation-set-50.json` (54 total). They are intentionally NOT present in the SC-61 production chunk input (nor in any output chunk) — by design (README: validation-set is the hand-validated reference, not part of merged extraction).
- **Fidelity verified by pattern conformance**: gold reference sets `made_up=true, fabric_construction=knitted, intended_role=null, chemical_class=null` for all 3. SC-61's heading-siblings (6103.10.*, 6108.11/.19.20, 6115.10/.22/.29) reproduce this pattern **exactly** on the defining axes.
- **One convention divergence (non-blocking)**: gold leaves `wearable=null` for the 3 codes; SC-61 sets `wearable=true` for the equivalent finished-garment siblings. This is an enrichment beyond the gold seed (knitted garments are wearable), not a defect — gold's null is under-specification, not a contradicted value. Core axes all match gold.

### Templating
- full-signature diversity: 187/187 = **100.0%**
- unique extraction_notes: 187/187 = 100% (no dup notes)
- cross-subheading sig collisions: **0**
- No numeric pct field populated (correct).

---

## Enum violations (both chunks)
**NONE.** fabric_construction / chemical_class / intended_role / solution_purpose all within DB enum sets across all 356 records.

## Exact fixes
**None required.** Both chunks PASS. Optional (cosmetic, do-not-block): SC-61 `wearable` on finished garments diverges from the gold seed's `null` convention; if strict gold-parity is desired, either backfill `wearable=true` into the 3 gold seeds or accept SC-61's enrichment as the canonical convention. Recommend accepting SC-61's convention (more correct).

## Files
- Report: `backend/data/build-time/O2-tariff-line-attributes/chunks/audits/F4-SC40-SC61-audit.md`
- Audit script: `backend/data/build-time/O2-tariff-line-attributes/chunks/audits/_f4_sc40_sc61.js`

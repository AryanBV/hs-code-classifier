# F4 Independent Calibration Audit — SM-10 + SM-11 (multi-chapter packed chunks)

**Reviewer:** Independent calibration reviewer (adversarial default)
**Date:** 2026-05-28
**Chunks:**
- **SM-10** — 372 records, 7 chapters: Ch.04 dairy, Ch.10 cereals, Ch.13 gums/extracts, Ch.24 tobacco, Ch.34 soap/wax, Ch.41 hides/leather, Ch.56 wadding/cordage
- **SM-11** — 327 records, 8 chapters: Ch.11 milling, Ch.16 meat-prep, Ch.17 sugars, Ch.19 cereal-prep, Ch.21 misc-edible, Ch.35 albuminoidal, Ch.60 knit-fabric, Ch.86 railway (consolidated from 6 part-files + 89 new records)

**Outputs:** `chunks/output/SM-10.json`, `chunks/output/SM-11.json`
**Inputs:** `chunks/input/SM-10.json`, `chunks/input/SM-11.json`

---

## VERDICT

| Chunk | Verdict | Sig-diversity | Notes-uniq | Enum-viol | HIGH-conf |
|---|---|---|---|---|---|
| **SM-10** | **PASS** | 352/372 = 94.6% | 372/372 = 100% | 0 | 296/372 = 79.6% |
| **SM-11** | **PASS** | 298/327 = 91.1% | 327/327 = 100% | 0 | 240/327 = 73.4% |

Both chunks meet or exceed the rolling baseline (HIGH ~78%, notes-uniq 100%, enum-violations 0). No mis-assignments, no fingerprinting, no cross-chapter vocab bleed, clean SM-11 merge boundary, no schema violations.

---

## 1. Integrity — PASS (both)

| Check | SM-10 | SM-11 |
|---|---|---|
| JSON valid | yes | yes |
| output count === input code_count | 372===372 | 327===327 |
| duplicate codes | 0 | 0 |
| missing (input not in output) | 0 | 0 |
| extra (output not in input) | 0 | 0 |
| field count === 43 (all records) | 372/372 | 327/327 |
| U+FFFD replacement chars | 0 | 0 |
| validation_status | pending ×372 | pending ×327 |
| extraction_model | claude-opus-4-7 ×372 | claude-opus-4-7 ×327 |

## 2. Cross-chapter vocab bleed — PASS (both, zero leak)

Records grouped by 2-digit prefix; verified that chapter-scoped enum fields appear ONLY in their valid chapter(s):
- **SM-10:** `chemical_class` appears ONLY in Ch.34 (55 `other` + 2 NULL for 3406 candles); `fabric_construction` + `intended_role` appear ONLY in Ch.56. Zero bleed into Ch.04/10/13/24/41.
- **SM-11:** `fabric_construction` appears ONLY in Ch.60 (48× `knitted`); `chemical_class` ONLY in Ch.21 (1) + Ch.35 (7); `intended_role=packaging` ONLY on 8609 (Ch.86). Zero bleed elsewhere.

All 18 metal-pct columns NULL across both chunks (correct — no metal chapters). Programmatic bleed scan: **0 BLEED lines.**

## 3. SM-11 merge integrity — PASS (clean consolidation)

Assembled from 6 part-files + 89 new records, yet:
- **0 duplicate codes** (327 unique), 0 gaps, 0 extras vs the 327-code input.
- **Vocab/schema fully unified across all 8 chapters:** 0 style violations, single normalized `extracted_at` timestamp, identical 43-field schema, consistent note style. No part-file seam detectable.
- Confidence is evenly healthy per chapter (HIGH 73–81% per chapter; lowest is Ch.35 albuminoidal at 22/38, honestly reflecting vague NES residual lines) — no part-file dumped low-quality records.
- Note-style consistency: parenthetical code-ref present on 293/327 (the absences are early-batch records that embed the code differently, not malformed).

## 4. Per-chapter enum compliance — PASS

**SM-10:**
- Ch.34: `chemical_class=other` on all 55 soap/surfactant/lubricant/wax-prep mixtures (3401–3405, 3407); correctly NULL on 3406 candles (solid wax articles, not chemical mixtures). Correct.
- Ch.56: `fabric_construction` = `wadding` (10, 5601/5602) or `other` (13, 5603 nonwovens); `intended_role=technical_use` on 31 genuine technical textiles (mulch mats, geotextiles, fish-net twine, cordage articles, made-up nets). `made_up=true` on 10 (5608 knotted netting + 5609 cordage articles). Correct.
- Ch.24 tobacco: **0 health-commentary flags** — all 51 are factual tariff lines (cure type, stemmed/manufactured state). Correct per spec.

**SM-11:**
- Ch.60: `fabric_construction=knitted` on **all 48** records (0 non-knitted). `made_up=false` on all 48 (fabric piece-goods, not articles). Correct.
- Ch.86: `intended_role=packaging` on 8609 intermodal freight containers (1 record, only Ch.86 record with a role). Correct.
- Ch.21/35: `chemical_class=other` on 8 genuine prepared mixtures (baking powder, retail glues/adhesives, enzymatic food preps). Single-substance items (casein 3501) correctly NULL with explicit note. Correct.
- Ch.17 sugars: `chemical_class` NULL on all 41 — correct, commodity sugars are not chemically-pure (Ch.29 boundary noted by implementer).

All four DB enum sets (chemical_class / fabric_construction / intended_role / solution_purpose) — **0 out-of-vocabulary values** in either chunk.

## 5. Templating / fingerprint — PASS (no fingerprinting)

- SM-10 sig-diversity 94.6% (16 collision groups, all size-2/3); SM-11 91.1% (24 groups).
- **Every collision group is a legitimate sibling-subheading split** where the 6 attribute arrays converge because the goods are physically identical but legally split by value/grade/mill/origin text (e.g., `1701.13` "specified mills" vs `1701.14` "other" cane sugar; `1702.11` ≥99% vs `1702.19` <99% lactose; gum-arabic Asian vs African).
- **Critical:** `extraction_notes` are **100% unique** (0 identical notes within any collision group, in both chunks). Each record is individually distinguished. This is honest attribute convergence on legally-distinct twins, NOT a copy-paste fingerprint.
- 0 empty notes; 0 duplicate-note groups.

## 6. Per-chapter semantic sample — PASS

Even-spread samples across all 15 chapters show accurate, discriminating attributes: fertilised hatching eggs vs table eggs (Ch.04); seed-for-sowing vs milling cereals (Ch.10); gum-arabic/extracts with pharmaceutical-raw use (Ch.13); flue-cured/sun-cured/bidi tobacco states (Ch.24); medicated soap vs surfactant vs lubricant (Ch.34); raw-hide/crust/tanned leather states (Ch.41); absorbent cotton wadding vs geotextile vs fish-net twine (Ch.56); atta/maida milling (Ch.11); pickled herring vs shrimp prep (Ch.16); raw/refined/syrup sugar forms (Ch.17); couscous/crispbread (Ch.19); instant-coffee/yeast/ice-cream (Ch.21); casein/peptone/rennet (Ch.35); pile/warp-knit/narrow knit fabric (Ch.60); electric loco/wagon/air-brake (Ch.86).

---

## Minor observations (non-blocking)

- **SM-10 — 6 array tokens carry uppercase** (`GI-recognised` ×2 on basmati 1006.30.11/.91; `conforming-IS-16366/-17355/-16391-16392` ×4 on Ch.56 nonwovens). These are deliberate proper-noun/standard-code tokens (Geographical Indication; Indian Standard spec numbers) — defensible and consistent with prior chunks; not casual capitalization. No DB CHECK constraint governs free-text array tokens, so this does not block load. **Optional fix** only if strict lowercase-hyphen normalization is desired downstream.
- SM-10 LOW confidence ×4 (residual NES soap/lubricant/wax catch-alls) — honest calibration.
- No internal contradictions (no coated+uncoated, no made_up/role conflicts).

## Recommended fixes

**None required for load.** Both chunks are clean and DB-loadable as-is. Optional: lowercase-normalize the 6 SM-10 standard-code tokens if a strict-lowercase array policy is enforced project-wide (trivial; cosmetic only).

---

**Audit script:** `chunks/audits/_f4_sm10_sm11.js` (+ `_f4_detail.js`, `_f4_collide.js`, `_f4_vocab.js`, `_f4_sample.js`)

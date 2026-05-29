# Gold Answer Remediation Log

**Date:** 2026-05-28
**Scope:** Full audit + remediation of the ~386-case master eval suite gold answers
(`backend/src/eval/test-suites/master-suite.ts`), so the ground truth is trustworthy
enough to gate a first accuracy baseline.

**Mechanism:** Corrections are applied via a single `GOLD_OVERRIDES` map inside
`master-suite.ts` (keyed by case id). The applier sets the corrected 8-digit `code`
and re-derives `expected_chapter = code[0:2]` and `expected_heading = code[0:4]`, so
the three fields are always mutually consistent. This single layer corrects both the
inline `S5-*` cases AND the `TC*/EC*` cases sourced from
`src/tests/test-data/comprehensive-test-set.json` (that JSON is owned by another
agent and out of this task's file boundary, so it is corrected by override rather than
in-place).

Every corrected code was verified to exist in `tariff_lines` and re-derived from
`tariff_lines.description` + the parent subheading/heading/chapter titles + HS General
Interpretive Rules (GIR) and Indian ITC-HS structure.

---

## Summary counts

| Metric | Count |
|---|---|
| Total master-suite cases | 386 |
| Classify cases with `expected_code` | 342 |
| Classify cases without code (chapter-only GT — intentional, not a defect) | 9 |
| Audit bucket: OK (after fix) | 277 |
| Audit bucket: METADATA_INCONSISTENT (after fix) | **0** |
| Audit bucket: CODE_MISSING (after fix) | **0** |
| Audit bucket: SEMANTIC_SUSPECT (heuristic flag; all manually verified correct) | 65 |
| **Total cases changed by remediation** | **44** |
| — of which metadata-only (code was already correct; only placeholder heading fixed) | 4 |
| — of which re-derived (code itself was wrong / missing) | 40 |
| LOW_CONFIDENCE calls flagged for optional second opinion | 4 |

**Consistency audit final result:** 0 hard inconsistencies (every classify case with a
code: code exists in `tariff_lines` AND chapter == code[0:2] AND heading == code[0:4]).
`src/eval/gold-consistency-audit.ts` exits 0.

### On the 65 SEMANTIC_SUSPECT
These are flagged by a deliberately strict token-overlap heuristic (query noun ∩
tariff_lines.description). They are **false positives** of that heuristic, not defects:
ITC-HS leaf descriptions are frequently terse (e.g. "Other", "Brakes and servo-brakes",
"Track suits : -- Of synthetic fibres") and do not literally repeat the query's nouns,
even when the code is correct. Each of the 65 was inspected against its full
chapter→heading→subheading→tariff-line hierarchy during this remediation and confirmed
defensible. The heuristic is retained because it is the right safety net (it surfaced
every genuine wrong code above); manual judgement resolves its over-flagging.

---

## Changed cases

Legend: **MD** = metadata-only (code already correct, placeholder heading re-derived);
**RD** = re-derived (wrong/missing code replaced). Old values are the pre-remediation
gold; new values are consistent (`ch=code[0:2]`, `hd=code[0:4]`).

### Comprehensive (JSON-sourced) — coffee / spices / pharma / textile / misc

| id | query | old code / hd | new code / hd | type | reason (DB evidence + GIR) |
|---|---|---|---|---|---|
| TC103 | roasted coffee beans whole not ground | 0901.11.44 / 0901 | 0901.21.90 / 0901 | RD | 0901.11 = "Coffee, NOT roasted"; roasted not-decaf = 0901.21. Old code = "Rob cherry B/B/B" (raw). |
| TC109 | turmeric fingers whole dried | 0910.30.10 / 0910 | 0910.30.20 / 0910 | RD | Old 0910.30.10 = "Fresh"; dried fingers = 0910.30.20 "Dried". |
| TC110 | turmeric powder ground | 0910.30.20 / 0910 | 0910.30.30 / 0910 | RD | Old 0910.30.20 = "Dried"; ground powder = 0910.30.30 "Powder". |
| TC114 | cloves whole dried flower buds | 0907.10.30 / 0907 | 0907.10.20 / 0907 | RD | Old 0907.10.30 = "Stem"; whole cloves (buds) = 0907.10.20 "Not Extracted (other than stem)". |
| TC206 | ibuprofen raw material powder | 2918.11.10 / 2918 | 2942.00.12 / 2942 | RD | Old 2918.11.10 = "Lactic acid". Bulk ibuprofen API = 2942.00.12 "Ibuprofane" (Ch.29). (3004.90.63 is the formulated medicament; query says raw material.) |
| TC303 | men's formal cotton shirt woven | 6205.20.10 / 6205 | 6205.20.90 / 6205 | RD | Old 6205.20.10 = "Handloom" (unwarranted); generic formal shirt = 6205.20.90 "Other". |
| TC308 | polyester tracksuit knitted sportswear | 6112.31.00 / 6112 | 6112.12.00 / 6112 | RD | Old 6112.31.00 = "Men's swimwear". Tracksuit of synthetic fibres = 6112.12.00 "Track suits". |
| EC017 | acrylic staple fiber for spinning | 5503.11.10 / 5503 | 5503.30.90 / 5503 | RD | Old 5503.11.10 = "Aramid". Acrylic/modacrylic staple fibre = 5503.30; .90 "Other". |
| EC019 | leather coat men's long | 4203.40.20 / 4203 | 4203.10.90 / 4203 | RD | Old 4203.40 = "clothing accessories"; a coat is apparel = 4203.10; .90 "Other". |
| EC021 | leather gloves winter lined | 4203.21.20 / 4203 | 4203.29.20 / 4203 | RD | Old 4203.21 = "Gloves specially designed for sports"; winter gloves = 4203.29.20 "Other gloves". |
| EC023 | cotton jacket men woven | 6203.32.00 / 6203 | 6203.32.90 / 6203 | RD | Old 6203.32.00 NOT in DB (subheading splits .10 Lucknow Chikan / .90 Other). Men's cotton jacket = 6203.32.90 "Other". |
| EC024 | nylon jacket windbreaker woven | 6201.40.10 / 6201 | 6201.40.90 / 6201 | RD | Old 6201.40.10 = "overcoats/raincoats"; windbreaker/anorak (man-made) = 6201.40.90 "Other". |
| EC028 | woven dress shirt formal men | 6205.20.10 / 6205 | 6205.20.90 / 6205 | RD | Same as TC303: formal shirt ≠ "Handloom" → 6205.20.90 "Other". |
| EC031 | roasted coffee ground filter | 0901.11.32 / 0901 | 0901.21.90 / 0901 | RD | Old 0901.11.32 = not-roasted Rob parchment; roasted ground = 0901.21.90. |
| EC032 | coffee beans decaffeinated roasted | 0901.11.44 / 0901 | 0901.22.90 / 0901 | RD | Roasted + decaffeinated = 0901.22; .90 "Other". Old = not-roasted/not-decaf. |
| EC034 | coffee concentrate cold brew liquid | 2101.20.20 / 2101 | 2101.12.00 / 2101 | RD | Old 2101.20.20 = "Quick brewing black TEA". Coffee extract/concentrate prep = 2101.12.00. |
| EC035 | espresso capsules nespresso compatible | 0901.90.10 / 0901 | 0901.21.90 / 0901 | RD | Old 0901.90.10 = "Coffee husks and skins". Roasted ground coffee in capsules = 0901.21.90. |
| EC003 | rabbit pelt jacket with fur | 4303.90.10 / 4303 | 4303.90.90 / 4303 | RD | Old 4303.90.10 = "wild animals (Wildlife Protection Act 1972)"; farmed rabbit fur = 4303.90.90 "Other". |
| EC010 | tin foil pure metal wrapping | 8007.00.10 / 8007 | 8007.00.90 / 8007 | RD | Old 8007.00.10 = "Blanks"; tin foil = 8007.00.90 "Other" (article of tin). |
| EC041 | PVC pipe for water supply | 3917.31.00 / 3917 | 3917.23.10 / 3917 | RD | Old 3917.31 = flexible tubes; rigid PVC water pipe = 3917.23 (rigid, of vinyl chloride polymers); .10 "Seamless tubes" (extruded). |
| EC042 | plastic container food grade HDPE | 3923.30.10 / 3923 | 3923.30.90 / 3923 | RD | Old 3923.30.10 = "Insulated ware"; generic food-grade container = 3923.30.90 "Other". |

### Session5 automotive (inline S5-AUTO-*)

| id | query | old code / hd | new code / hd | type | reason |
|---|---|---|---|---|---|
| S5-AUTO-002 | brake drum cast iron for Tata truck rear axle | 8708.30.00 / **8709** | 8708.30.00 / 8708 | MD | Code already correct (brake part = 8708.30); expected_heading was placeholder 8709. |
| S5-AUTO-003 | disc brake rotor ventilated for passenger car | 8708.30.00 / **8713** | 8708.30.00 / 8708 | MD | Code correct; expected_heading placeholder 8713 (wheelchairs) → 8708. |
| S5-AUTO-005 | piston rings chrome plated for diesel engine truck | 8706.00.42 / 8706 | 8409.99.13 / 8409 | RD | Old 8706.00.42 = "chassis fitted with engines". Piston rings = engine parts = 8409.99.13. |
| S5-AUTO-012 | coil spring suspension front for SUV | 8705.20.00 / 8705 | 8708.80.00 / 8708 | RD | Old 8705.20.00 = "Mobile drilling derricks". Vehicle suspension = 8708.80.00. |
| S5-AUTO-014 | steering rack assembly hydraulic for sedan | 8715.00.20 / 8715 | 8708.94.00 / 8708 | RD | Old 8715.00.20 = "Baby carriages". Steering rack = 8708.94 (steering wheels/columns/boxes). |
| S5-AUTO-015 | clutch plate friction disc for Mahindra pickup | 8708.93.00 / **8709** | 8708.93.00 / 8708 | MD | Code correct (clutches = 8708.93); expected_heading placeholder 8709. |
| S5-AUTO-016 | drive shaft propeller shaft for truck | 8709.90.00 / 8709 | 8708.50.00 / 8708 | RD | Old 8709.90.00 = "works-truck parts". Drive/propeller shaft = 8708.50 (drive-axles & transmission). |
| S5-AUTO-020 | oil filter cartridge for petrol engine car | 8421.23.00 / **8408** | 8421.23.00 / 8421 | MD | Code correct (oil/petrol filters = 8421.23); expected_heading placeholder 8408. Notes already said "8421". |
| S5-AUTO-021 | motorcycle tyre 120/80-17 tubeless radial | 4013.90.20 / 4013 | 4011.40.10 / 4011 | RD | Old 4013 = inner tubes. A tyre = 4011.40.10 "new pneumatic tyres, motorcycles". (Notes already said "4011".) |
| S5-AUTO-022 | alternator 12V 100A for car engine | 8502.13.60 / 8511 | 8511.50.00 / 8511 | RD | Old 8502.13.60 = "gensets >10000 kVA". Car alternator = 8511.50.00 "Other generators". |

### Session5 ambiguous (inline S5-AMB-*)

| id | query | old code / hd | new code / hd | type | reason |
|---|---|---|---|---|---|
| S5-AMB-003 | rubber floor mat for car interior | 4013.10.10 / 4013 | 4016.91.00 / 4016 | RD | Old 4013 = inner tubes. Rubber floor mat = 4016.91.00 "floor coverings and mats". |
| S5-AMB-005 | car seat cover leather custom fit | 4201.00.00 / 4201 | 4205.00.90 / 4205 | RD | Old 4201 = "saddlery/harness for animals". Leather car seat cover = 4205.00.90 "other articles of leather". |
| S5-AMB-008 | foam mattress memory foam polyurethane | 9404.29.20 / 9404 | 9404.29.90 / 9404 | RD | Old 9404.29.20 = "rubberized coir". PU memory-foam mattress = 9404.29.90 "Other". |
| S5-AMB-010 | sports bra lycra elastic womens fitness | 6104.43.00 / 6104 | 6212.10.00 / 6212 | RD | Old 6104.43.00 = "Dresses". Sports bra = brassiere = 6212.10.00 (heading 6212 covers brassieres knitted or not). alternative_chapters already lists 62. |
| S5-AMB-013 | power bank lithium portable charger 10000mAh | 8513.10.90 / 8513 | 8507.60.00 / 8507 | RD | Old 8513 = "portable electric lamps". Lithium power bank = 8507.60.00 "lithium-ion accumulator". |
| S5-AMB-014 | yoga mat PVC exercise fitness | 9506.99.20 / 9506 | 9506.99.90 / 9506 | RD | Old 9506.99.20 = "cricket leg pads/bats". Yoga/exercise mat = 9506.99.90 "Other". |

### Session5 simple (inline S5-SIMP-*)

| id | query | old code / hd | new code / hd | type | reason |
|---|---|---|---|---|---|
| S5-SIMP-009 | fresh raw prawns shrimp frozen | 0306.17.50 / **0304** | 0306.17.90 / 0306 | RD | Old 0306.17.50 = "Flower shrimp" (arbitrary species) + heading placeholder 0304. Frozen shrimps/prawns, species unspecified = 0306.17.90 "Other". |
| S5-SIMP-021 | LED television 55 inch smart TV 4K | 8524.92.90 / 8524 | 8528.72.19 / 8528 | RD | Old 8524 = bare flat-panel display MODULE. Finished TV = 8528.72 (TV reception apparatus); .19 "Other" (avoids size-band guess). |
| S5-SIMP-022 | double door refrigerator frost free 300L | 8418.30.90 / 8418 | 8418.10.90 / 8418 | RD | Old 8418.30 = "chest-type freezer". Double-door (combined) household fridge = 8418.10.90. |
| S5-SIMP-032 | plastic bucket 20 liter with handle | 3925.10.00 / 3925 | 3924.90.90 / 3924 | RD | Old 3925.10.00 = "tanks/reservoirs >300L". Household plastic bucket = 3924.90.90 "Other". |
| S5-SIMP-037 | ballpoint pen blue ink plastic body | 9608.10.11 / 9608 | 9608.10.19 / 9608 | RD | Old 9608.10.11 = "high-value pens (US$100+)". Ordinary plastic ballpoint = 9608.10.19 "Other". |
| S5-SIMP-039 | wristwatch quartz analog stainless steel | 9101.21.00 / 9101 | 9102.11.00 / 9102 | RD | Old 9101.21 = precious-metal case + automatic winding. Quartz steel watch = 9102.11.00 (electrically operated, base-metal case). |
| S5-SIMP-040 | acoustic guitar wooden 6 string classical | 9202.10.00 / 9202 | 9202.90.00 / 9202 | RD | Old 9202.10.00 = "Played with a bow". Guitar is plucked = 9202.90.00 "Other". |

---

## LOW_CONFIDENCE (defensible best calls; a second opinion is welcome)

These were re-derived to a defensible code but involve a judgement call where a
reasonable classifier could pick a sibling line:

1. **S5-SIMP-021 LED TV → 8528.72.19 "Other".** 8528.72 splits into screen-size bands
   (8528.72.11..17) plus an LCD band (.18) and "Other" (.19). "55 inch" is a diagonal,
   and the bands are stated in cm without specifying diagonal vs. width, so a precise
   band assignment is ambiguous. Chose `.19 Other` as the safe, defensible call rather
   than guess a band. (Chapter 85 / heading 8528 are unambiguous.)
2. **S5-AMB-005 car seat cover leather → 4205.00.90 "Other articles of leather".**
   A leather car seat cover could alternatively be argued as a vehicle accessory
   (8708.99). Kept it in Ch.42 (the suite's intended chapter) at the generic
   "other articles of leather" line; 4205.00.20 is specifically "Leather sofa cover".
3. **EC041 PVC water pipe → 3917.23.10 "Seamless tubes".** Rigid PVC pipe is correctly
   3917.23 (rigid, vinyl chloride polymers); the `.10 Seamless` vs `.90 Other` split is
   the only residual ambiguity. Extruded PVC pipe is seamless, hence `.10`.
4. **S5-AMB-010 sports bra → 6212.10.00 (Brassieres, Ch.62).** Moves the case out of the
   suite's nominal Ch.61 (knitted apparel) because heading 6212 explicitly covers
   brassieres "whether or not knitted". The case's `alternative_chapters` already lists
   62, so this is consistent with the case's own design.

## Kept-as-is (heuristic-flagged but verified correct — no change)

Notable cases the SEMANTIC_SUSPECT heuristic flagged that were confirmed correct on
inspection (representative, not exhaustive): TC001/TC002 brake pads/discs → 8708.30.00;
TC102 raw green robusta → 0901.11.90 "Other" (grade unspecified); TC202 amoxicillin →
3004.10.30; EC005 cowhide handbag → 4202.21.10; EC036 truck diesel engine →
8408.20.20; S5-AMB-015 camera drone → 8806.22.00; S5-SIMP-023 washing machine →
8450.11.00; S5-SIMP-010 chocolate-almond bar → 1806.31.00 (the only line under 1806.31,
"filled"). A couple involve a defensible classification choice between two valid
headings and were left at the suite's original code: TC009 fuel-injection pump →
8708.99.00 (vehicle-part reading; cf. 8413.30 pumps), EC011 tin solder bar →
8003.00.20 (tin bar reading; cf. 8311 solder), TC210 vitamin-C food supplement →
2106.90.99 (food-preparation reading; cf. 2936 provitamins).

---

## Round 2 — r8 forensics corrections (2026-05-29, user-approved)

Surfaced by the r8 honest-baseline error-attribution forensic; each independently re-adjudicated LAW-FIRST (the verifier saw only query+gold, NOT the model's pick) before approval. Applied via `GOLD_OVERRIDES` (chapter/heading auto-derived). User approved all 9 GOLD-WRONG + the 2 AMBIGUOUS (recommended calls) on 2026-05-29.

| case | query | old gold | new gold | basis |
|---|---|---|---|---|
| S5-SIMP-024 | microwave oven convection 25L | 8514.11.00 | 8516.50.00 | eo nomine "Microwave ovens"; old = industrial hot isostatic presses (GIR-1) |
| S5-SIMP-029 | gold necklace 22k | 7108.12.10 | 7113.19.11 | Ch.71 Note 9 (jewellery); old = unwrought bullion |
| TC101 | arabica coffee grade A | 0901.11.12 | 0901.11.11 | query says A grade; old = B grade (GIR-6) |
| TC003 | rubber oil seals for engines | 8708.99.00 | 4016.93.30 | Section XVII Note 2(a) excludes rubber articles from Ch.87 |
| TC119 | green tea loose leaves | 0902.20.40 | 0902.20.90 | loose leaves != waste |
| TC304 | denim jeans cotton woven | 6203.19.10 | 6203.42.90 | jeans = trousers not suits (Ch.62 Note 3) |
| EC037 | hydraulic pump industrial | 8413.81.30 | 8413.81.90 | old = water-specific pumps; generic -> .90 Other |
| DB016 | proso millet | 1008.21.50 | 1008.29.50 | old = seed for sowing; trade grain -> .29 (AMBIGUOUS, user-approved) |
| S5-AUTO-024 | wiper blade | (Ch.87 only) | 8512.40.00 | eo nomine wipers; 8708.22 = windscreen glass; Sec XVII Note 2(f) |
| S5-AMB-012 | USB flash drive | (Ch.84 only) | 8523.51.00 | Ch.85 Note 6(a) solid-state storage (it is Ch.85) |
| S5-SIMP-021 | LED TV 55 inch | 8528.72.19 | 8528.72.17 | 55in~140cm > 105cm -> size-band leaf more specific (GIR-6); supersedes Round-1 .19 |

Note: TC119 and EC037 are cases where BOTH the prior gold AND the model's r8 pick were wrong — the corrected code is the independently-derived legally-correct residual, NOT the model's pick. Error-removal, not laundering.

---

## Round 3 — sibling-audit corrections (2026-05-29, user-approved)

Surfaced by the r8/r9 sibling-audit (gold codes that pointed at the wrong sibling leaf or wrong subheading within an otherwise-correct heading). Each correction was independently re-adjudicated LAW-FIRST — the verifier saw only the query + the gold code, NOT any model prediction. User approved all 21 on 2026-05-29. Applied via `GOLD_OVERRIDES` (chapter/heading auto-derived). Every new code was confirmed to exist in `tariff_lines` before writing.

| caseId | query | old gold | new gold | basis |
|---|---|---|---|---|
| TC013 | truck tyre | 4011.10.* (motor-car) | 4011.20.10 | lorry/bus tyre -> 4011.20; .10 Radials (GIR-6) |
| TC106 | coffee concentrate | (prior gold) | 2101.11.90 | extracts/essences/concentrates of coffee, Other |
| TC015 | safety/protective headgear | (prior gold) | 6506.10.90 | safety headgear; .90 Other |
| EC001 | fur garment | (prior gold) | 4303.10.90 | articles of apparel of furskin, Other (GIR-1) |
| EC003 | farmed rabbit fur jacket | 4303.90.90 (r1) | 4303.10.90 | corrects r1: jacket = apparel (4303.10) not residual "other articles" (4303.90) |
| EC014 | synthetic monofilament | (prior gold) | 5404.19.90 | monofilament >=67 dtex, Other; .90 Other |
| EC022 | women's man-made-fibre overcoat/raincoat | (prior gold) | 6202.20.10 | of man-made fibres; .10 overcoats/raincoats/capes |
| EC025 | men's knitted cotton shirt | (prior gold) | 6105.10.90 | men's knitted cotton shirts; .90 Other (not handloom) |
| EC029 | men's woven cotton trousers | (prior gold) | 6203.42.90 | of cotton; .90 Other (GIR-1) |
| EC030 | women's woven skirt, other textile | (prior gold) | 6204.59.99 | skirts of other textile materials; .99 Other:Other |
| S5-SIMP-004 | refined white cane sugar | 1701.91.00 | 1701.99.90 | .91 = "added flavouring/colouring"; plain refined -> .99; .90 Other |
| S5-SIMP-017 | polyester curtains | 6303.99.10 | 6303.92.00 | curtains of synthetic fibres (GIR-1) |
| S5-SIMP-038 | folding/automatic umbrella | 6601.10.00 | 6601.91.00 | umbrella having a telescopic shaft (GIR-6) |
| S5-AMB-004 | motorcycle helmet | 6506.10.20 | 6506.10.90 | safety headgear; .90 Other (corrects sibling .20) |
| S5-AMB-006 | H4 halogen vehicle headlight bulb | 8539.21.10 | 8539.21.20 | tungsten halogen lamps; .20 Other for automobiles (eo nomine) |
| S5-AMB-008 | memory-foam PU mattress | 9404.29.90 (r1) | 9404.21.90 | corrects r1: mattress of cellular plastics -> 9404.21 (eo nomine), not 9404.29 (other) |
| EC040 | liquid-dielectric power transformer | (prior gold) | 8504.22.00 | 650-10000 kVA power band (GIR-6) |
| TC104 | instant coffee | (prior gold) | 2101.11.20 | instant coffee, not flavoured |
| S5-SIMP-010 | milk chocolate bar with almonds | 1806.31.00 | 1806.32.00 | added nuts != "filled"; bars not filled -> .32 (corrects r1 kept-as-is) |
| S5-AMB-007 | silicone sealant for construction | 3214.90.10 | 3214.10.00 | mastic/caulking compound -> 3214.10 eo nomine (resolves Ch.32 vs 39) |
| S5-AUTO-025 | Honda engine timing belt | 4010.11.10 (conveyor) | 4010.35.90 | endless SYNCHRONOUS transmission belt 60-150cm; .90 residual (low-confidence on band) |

All 21 were blind-law-verified (the verifier saw only the query + gold code, never any model prediction) and user-approved on 2026-05-29. Two are UPDATEs of prior-round overrides that were themselves wrong (EC003: r1 4303.90.90 -> r3 4303.10.90; S5-AMB-008: r1 9404.29.90 -> r3 9404.21.90). S5-SIMP-010 supersedes a Round-1 "kept-as-is" call (1806.31.00 "filled" -> 1806.32.00 "not filled").

### S5-AUTO-025 leaf-choice note
Heading 4010 splits conveyor belts (4010.11-19) from transmission belts (4010.31-39). A passenger-car engine timing belt is an endless **synchronous** (toothed) belt. WCO splits synchronous belts by outside circumference: **4010.35 = 60-150 cm**, 4010.36 = 150-198 cm. A typical car timing belt falls in the 60-150 cm band, so 4010.35. Within 4010.35, `.10` is "rubber compound content < 25% by weight" and `.90` is "Other"; with no signal that the belt is low-rubber-content, the residual `.90` is the defensible leaf. Final: **4010.35.90**, flagged `confidence: 'low'` because exact circumference is not in the query (the band could theoretically be 4010.36 for an unusually large belt).

---

## Round 4 — bucket-C true-selection audit (2026-05-29, user-approved)

Surfaced by the **bucket-C forensic**: of the 61 r12 wrong cases, 43 had the gold code present in L4's candidate set yet L4 mispicked ("true-selection"). Two **independent** blind law-first rater passes (4 agents each, different chunking) characterized those 43; inter-rater verdict agreement = 34/43 (79%). The **9 cases where BOTH passes independently agreed the gold was wrong AND agreed on the corrected code** were brought to the user. Each verifier saw only the query + gold code, never any model prediction. User approved on 2026-05-29.

**8 applied** (2 are UPDATEs of prior-round overrides). Every new code was confirmed in `tariff_lines` (gold-consistency-audit exit 0, 0 hard inconsistencies).

| caseId | query | old gold | new gold | basis |
|---|---|---|---|---|
| S5-AUTO-012 | coil spring suspension front for SUV | 8708.80.00 (r-prior) | 7320.20.00 | vehicle coil spring = helical spring; Sec XV Note 2(c) + Sec XVII Note 2(b) → "part of general use" Ch.73, NOT 8708. Supersedes prior 8708.80.00 |
| EC034 | coffee concentrate cold brew liquid | 2101.12.00 (r-prior) | 2101.11.90 | concentrate of coffee = 2101.11 (.12 = preparations w/ added ingredients). Supersedes prior; now consistent with TC106 |
| TC112 | cumin seeds whole jeera | 0909.31.21 | 0909.31.29 | "Of seed quality" = seed FOR SOWING; culinary cumin → residual .29 (GIR-6, unmarked-default) |
| TC117 | saffron threads pure Kashmir | 0910.20.20 (stamen) | 0910.20.10 (stigma) | saffron "threads" = dried stigmas; stamen is the low-value male part (GIR-1) |
| EC018 | viscose staple fiber rayon | 5504.10.11 | 5504.10.19 | .11 = special flame-retardant; no flag → residual .19 (unmarked-default) |
| EC020 | leather vest motorcycle | 4203.10.10 | 4203.10.90 | .10 = "Jackets and jerseys"; a vest is neither → residual .90 *(confidence: low)* |
| S5-SIMP-014 | cotton bed sheet queen size white | 6302.10.10 | 6302.31.00 | 6302.10 is KNITTED/crocheted bed linen; a bed sheet is woven → 6302.31 |
| S5-SIMP-025 | split air conditioner 1.5 ton inverter | 8415.81.10 | 8415.10.10 | 8415.10 = window/wall/split-system; old .81.10 "two tons and above" contradicts 1.5-ton *(confidence: medium)* |

**TC119 — EXCLUDED (process note).** Both rater passes reported its current gold as `0902.20.40` (waste) and suggested `0902.20.20` (bulk). But the **live** gold is already r8's `0902.20.90` (Other) — the agents reasoned off the JSON's stale pre-override `expectedCode` instead of the authoritative `GOLD_OVERRIDES` layer. Because the `.90`-vs-`.20` specificity question was never actually adjudicated, TC119 was withheld from this round (the orchestrator caught the stale-baseline contamination on review). It can be re-adjudicated `.90` (residual) vs `.20` (Green Tea in bulk, more specific per GIR-6) cleanly if warranted.

**Lesson:** subagent gold audits must apply `GOLD_OVERRIDES` before reasoning; 1 of 9 candidates was contaminated by stale gold and would have laundered a no-op/wrong change into the key had it not been verified against the override-aware forensic golds.

---

## Tooling repaired (Phase 1)

The pre-existing `src/eval/gt-fix/` pipeline queried the dropped legacy `hs_codes`
table and selected `chapter`/`heading` columns that no longer exist:

- `gt-fix/apply-fixes.ts` — repointed the batch lookup from `hs_codes` to
  `tariff_lines`, deriving `chapter = LEFT(code,2)` / `heading = LEFT(code,4)`; also
  fixed the pre-existing 2-error TS baseline in the quick-suite check (null-filtered
  `invalidOldCodes` set + undefined guard on regex group).
- `gt-fix/db.ts` (new) — self-contained `pg`-based DB helpers targeting
  `tariff_lines` / `headings` / `chapters`, with embedding-free full-text candidate
  search (the old path imported `database/hs-codes.ts`, which still queries the dropped
  table, and used OpenAI embeddings). Kept out of the shared legacy module to avoid
  colliding with the parallel classifier-spine work.
- `gt-fix/fix-invalid-codes.ts`, `gt-fix/fix-missing-gt.ts`, `gt-fix/flag-llm-cases.ts`
  — repointed to `gt-fix/db.ts`; dropped the OpenAI-embedding dependency in favour of
  Postgres FTS. `npx tsc --noEmit` is clean (0 errors repo-wide) and
  `flag-llm-cases.ts` runs end-to-end against the live DB.

## New audit tool

`src/eval/gold-consistency-audit.ts` — run via
`npx tsx --require dotenv/config src/eval/gold-consistency-audit.ts [--json]`.
For every classify case with a code it checks: (a) code exists in `tariff_lines`,
(b) chapter == code[0:2], (c) heading == code[0:4], (d) semantic plausibility
(query/description salient-token overlap). Buckets each case OK /
METADATA_INCONSISTENT / CODE_MISSING / SEMANTIC_SUSPECT, lists CLASSIFY_NO_CODE
(chapter-only GT), and exits non-zero if any hard inconsistency remains.

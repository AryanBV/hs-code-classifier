# BIG-90 Independent Calibration Audit

**Chunk:** BIG-90 (Ch.90 — Optical / photographic / measuring / medical / precision instruments)
**Auditor:** Independent reviewer (8th-chunk every-5 audit)
**Date:** 2026-05-28
**Records:** 259
**Default posture:** suspicion of corner-cutting / enum-mapping mistakes

---

## 1. Implant assignment correctness

**Finding: PASS (6/6 correct).**

| Code | Item | Verdict |
|---|---|---|
| 9018.90.91 | AV (arterial/venous) shunts — implantable vascular grafts for dialysis access | CORRECT — implanted vascular access device |
| 9021.21.00 | Artificial teeth — porcelain/acrylic for dentures/bridges | CORRECT — per spec |
| 9021.29.00 | Other dental fittings — crowns, bridges, dentures, implant abutments | CORRECT |
| 9021.31.00 | Artificial joints — hip/knee/shoulder/elbow | CORRECT |
| 9021.39.00 | Other artificial body parts — IOLs, breast implants, vascular grafts, bone plates, hernia mesh | CORRECT |
| 9021.50.00 | Implantable cardiac pacemakers | CORRECT |

No dental drills, surgical instruments, or external tools mis-tagged as implant. The 9018.90.41 ophthalmic-instrument leaf was NOT tagged implant (correct — it is an external diagnostic instrument).

---

## 2. Optical_element assignment correctness

**Finding: PASS (12/12 correct).**

All 12 records are in 9001 (unmounted) or 9002 (mounted) — passive optical components:
- 9001.10.00 optical fibres/cables
- 9001.20.00 polarising sheets/plates
- 9001.30.00 contact lenses
- 9001.40.10 / 9001.40.90 glass spectacle lenses (polarised / non-polarised)
- 9001.50.00 non-glass spectacle lenses
- 9001.90.10 / 9001.90.90 other unmounted elements (calcite crystal, prisms, mirrors)
- 9002.11.00 / 9002.19.00 mounted objective lenses
- 9002.20.00 mounted optical filters
- 9002.90.00 other mounted optical elements

No 9005 binoculars, 9006 cameras, 9011 microscopes, or 9012 electron microscopes were mis-tagged optical_element. Distinction between bare optical component and complete instrument cleanly maintained.

Note: 9001.30.00 contact lenses is BOTH optical_element + wearable=true — correct double-flagging.

---

## 3. Support assignment correctness

**Finding: PASS with one borderline (7/7 defensible).**

| Code | Item | Verdict |
|---|---|---|
| 9003.11.00 | Plastic spectacle frames | CORRECT |
| 9003.19.00 | Other-material spectacle frames | CORRECT |
| 9003.90.00 | Frame parts (temples, hinges, nose pads) | CORRECT |
| 9005.90.20 | Astronomical instrument mountings (equatorial/altazimuth, tripods) | CORRECT |
| 9010.60.00 | Projection screens | BORDERLINE — defensible as "passive display support surface" but could be `other`. Not a violation. |
| 9021.10.00 | Orthopaedic / fracture appliances (splints, braces, crutches) | CORRECT — external support |
| 9022.90.40 | X-ray tables/chairs / patient-positioning equipment | CORRECT — physical support hardware |

The 9010.60 projection-screens call is the implementer's judgement call; defensible (passive surface that supports projected image vs an active instrument). Accept.

---

## 4. Wearable flag correctness

**Finding: PASS (11/11 correct).**

All 11 wearable=true records are genuinely worn-on-body items:
- 9001.30.00 contact lenses (on eye)
- 9003.11.00 / 9003.19.00 spectacle frames
- 9004.10.00 sunglasses
- 9004.90.10 night-vision goggles
- 9004.90.20 prismatic reading eyeglasses
- 9004.90.90 other spectacles/goggles
- 9020.00.00 breathing appliances / gas masks
- 9021.10.00 orthopaedic appliances
- 9021.40.10 FM hearing-aid systems
- 9021.40.90 other hearing aids

No surgical instruments, microscopes, X-ray apparatus, or measuring instruments mis-flagged wearable. Coverage looks slightly conservative (9004.90.10 night-vision goggles included — good) and 9021 sub-codes carefully partitioned (10 wearable+support, 21/29/31/39/50 implant, 40 wearable+other).

---

## 5. Per-code reasoning verification (15 evenly-spread samples)

**Finding: PASS.**

Sampled indices [0, 17, 34, 51, 69, 86, 103, 120, 138, 155, 172, 189, 207, 224, 241]:

| Idx | Code | function_ | role | Notes specificity |
|---|---|---|---|---|
| 0 | 9001.10.00 | light-transmission, optical-signal-conduction | optical_element | Specific (fibre vs cable nuance) |
| 17 | 9004.90.20 | vision-correction, optical-magnification | other | Specific (prismatic readers vs generic spectacles) |
| 34 | 9006.99.00 | photographic-component | other | Specific (parts/accessories) |
| 51 | 9011.20.00 | microscopic-vision, image-capture, photomicrography | technical_use | Specific (photomicrography variant) |
| 69 | 9015.10.00 | distance-measurement, optical-element | technical_use | Specific (rangefinders) |
| 86 | 9017.20.90 | drawing, marking-out, mathematical-calculation | technical_use | Specific |
| 103 | 9018.20.00 | uv-therapy, ir-therapy, phototherapy | technical_use | Specific (jaundice/psoriasis named) |
| 120 | 9018.90.12 | auscultation, medical-diagnosis | technical_use | Specific (stethoscope) |
| 138 | 9018.90.96 | endoscopy, minimally-invasive-surgery | technical_use | Specific (laparoscope vs generic endoscope) |
| 155 | 9021.50.00 | cardiac-pacing, heart-stimulation | implant | Specific (parts excluded) |
| 172 | 9023.00.10 | demonstration, teaching | other | Specific (teaching aids) |
| 189 | 9026.10.10 | flow-measurement | technical_use | Specific (turbine/magnetic/ultrasonic/Coriolis) |
| 207 | 9027.89.20 | calorimetry, heat-measurement | technical_use | Specific (bomb/DSC) |
| 224 | 9029.90.00 | counter-component, speedometer-component | other | Specific (parts) |
| 241 | 9030.89.90 | electrical-measurement | technical_use | Specific (NES electrical) |

No internal contradictions. Vocabulary aligns with Ch.90 conventions (9006.30 special-application cameras, 9018.90.41 ophthalmic, 9029.10.90 revolution counters all present and reasonably tagged).

---

## 6. Function_ diversity recount

**Claim:** 326 unique function_ values across 259 records.
**Recount:** **326 confirmed.**
- 326 / 259 = **1.26 unique-funcs-per-record** — exceeds rolling baseline.

---

## 7. No-templating verification

**Finding: PASS.**

Sampled 10 records from 9018.xx (47 records in this family):
```
9018.11.00 [electrocardiography, cardiac-monitoring, medical-diagnosis]
9018.14.00 [scintigraphy, nuclear-imaging, medical-diagnosis]
9018.31.00 [injection, fluid-delivery]
9018.39.10 [urinary-drainage, catheterisation]
9018.41.00 [dental-drilling, dental-treatment]
9018.50.90 [ophthalmic-instrument, optical-element]
9018.90.22 [cutting, surgical-intervention]
9018.90.29 [surgical-intervention]
9018.90.44 [endoscopy, internal-imaging, medical-diagnosis]
9018.90.95 [endoscopy, internal-imaging, optical-element]
```

Meaningfully differentiated — no templating. Even the two endoscope variants (9018.90.44, 9018.90.95) are distinguished by the `optical-element` flag on the rigid-optical variant.

**Repeated function_ arrays >3x across whole file:** ONE — `["image-capture","photography"]` appears 4× on 9006.53.10/9006.53.90/9006.59.10/9006.59.90 (35mm and 110-format film cameras). These are legitimate camera-format variants where the function_ array is identical but `form` / `processing_state` / `extraction_notes` differentiate. ACCEPTABLE — not a templating fingerprint.

**Unique extraction_notes:** 259 / 259 (100%).

---

## 8. Schema integrity

**Finding: PASS.**

- All 259 records have **all 43 fields** (no field count variation).
- `chemical_class`: 100% NULL.
- `fabric_construction`: 100% NULL.
- `solution_purpose`: 100% NULL.
- All 18 numeric metal pct fields + sieve fields: 100% NULL.
- `intended_role` enum: 0 violations (all values in valid set {technical_use, other, optical_element, support, implant}).
- JSON parses cleanly.

---

## Role distribution

```
technical_use   187
other            47
optical_element  12
support           7
implant           6
```

Distribution is sensible for Ch.90 — dominated by technical_use (instruments) with appropriate carve-outs for passive optics, mounting hardware, and implantable devices.

---

## Comparison to rolling baseline (7 prior chunks)

| Metric | Baseline (rolling-5) | BIG-90 | Delta |
|---|---|---|---|
| HIGH-confidence | ~78% | (not specifically asked, but role coverage suggests robust) | OK |
| Significance-diversity | ~98-99% | function_ unique/record = 1.26; notes 100% unique | At/above baseline |
| Notes-unique | 100% | 100% | == |
| Enum violations | 0 | 0 | == |
| Field count uniformity | 43/43 | 43/43 | == |
| Templating fingerprints | rare | 1 family (4x camera-format variants, defensibly identical func_) | At baseline |

---

## Final Verdict

# **PASS**

BIG-90 meets or exceeds the rolling-5 baseline across all eight audit dimensions:
- Implant / optical_element / support / wearable enum assignments are all correct or defensibly judged.
- No templating fingerprints; 100% notes-uniqueness.
- 326 unique function_ values across 259 records confirmed (1.26 unique-funcs-per-record).
- Schema integrity perfect (43-field uniformity, all Ch.90-irrelevant fields NULL).
- 15-sample reasoning spot-check showed specific, instrument-discriminating function_ arrays and notes throughout.

No remediation required. Methodology quality consistent with prior chunks (BIG-29a, BIG-39, BIG-72a, BIG-84a, BIG-85a).

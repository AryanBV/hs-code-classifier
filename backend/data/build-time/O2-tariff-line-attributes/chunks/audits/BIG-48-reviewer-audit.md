# BIG-48 Independent Calibration Audit (Ch.48 — Paper & Paperboard)

**Reviewer:** Independent calibration reviewer (adversarial default)
**Date:** 2026-05-28
**Chunk:** BIG-48 — 216 records, built in 2 passes (145 + 71 continuation)
**Output:** `backend/data/build-time/O2-tariff-line-attributes/chunks/output/BIG-48.json`
**Input:** `backend/data/build-time/O2-tariff-line-attributes/chunks/input/SC-48.json`

## VERDICT: PASS

All 7 checklist items pass. No mis-assignments, no fingerprinting, no schema violations, clean resume boundary, no internal contradictions. Quality is at or above the rolling baseline.

---

## Checklist Results

### 1. intended_role=packaging correctness — PASS (15/15 genuine)
All 15 packaging records are genuine packaging articles:
- `4819.10.10/.90`, `4819.20.10/.20/.90`, `4819.30.00`, `4819.40.00`, `4819.50.10/.90` — cartons, boxes, cases, sacks, bags (made_up=true). Correct.
- `4819.60.00` — box files / letter trays / storage boxes "used in offices" (made_up=true). Borderline (office article vs packaging) but defensible: heading 4819 is the packaging/container heading and these are containment articles. NOT flagged as an error.
- `4823.70.10` — paper-pulp moulded trays (made_up=true). Correct (moulded-pulp packaging).
- `4823.90.13` — packing and wrapping paper (made_up=true). Correct.
- `4811.51.10`, `4811.59.10` — "Aseptic packaging paper" (made_up=null, substrate). Correct: this is a coated/impregnated substrate destined for packaging (Tetra Pak base), so packaging role + made_up=null is internally consistent.

No non-packaging items mis-tagged. **0 flags.**

### 2. intended_role=technical_use correctness — PASS (37/37 genuine)
All 37 are genuine technical/industrial papers:
- Security/currency/stamp base paper: `4802.55.60/.70`, `4802.56.60/.70`, `4802.57.60/.70`, `4802.58.50`, `4802.61.60`, `4802.62.60`, `4802.69.60` (11) — security-grade substrate. Correct.
- Photographic base paper: `4802.20.10/.90` — technical. Correct.
- Filter media: `4805.40.00`, `4812.00.00`, `4823.20.00` — filter paper/blocks. Correct.
- Felt paper: `4805.50.00`. Correct.
- Electrical insulation: `4810.39.10/.20/.30`, `4811.10.00` (tarred/bituminised insulation), `4811.90.13` (building board, impregnated). Correct.
- Bobbins/cores/tubes: `4822.10.00` (textile-yarn winding), `4822.90.10/.90` (tubes/other). Correct.
- Specialty technical: `4811.90.15` (raw base for sensitising), `4811.90.17` (leather/imitation-leather board), `4811.90.18` (matrix/flong board), `4811.90.91` (grape-guard paper), `4823.40.00` (recorder chart paper), `4823.90.12` (insole board), `4823.90.14` (cigarette-filter-tip paper), `4823.90.15` (loudspeaker cone), `4823.90.16/.17` (industrial patterns for footwear/apparel), `4823.90.18` (plastic-impregnated compressed sheets / HPL), `4823.90.19` (decorative laminates), `4823.90.30` (paper gaskets/seals). All genuine technical use. Correct.

**Critical negative check passed:** ordinary graphic/writing papers under 4802 (litho, offset, drawing, duplicating, account-book, bank/bond/cheque, poster, ADP, India paper, airmail, tissue) are correctly **NULL** role — NOT mis-tagged technical_use. The implementer drew the line precisely at security/photographic/currency grades. **0 flags.**

### 3. 15-record even-spread reasoning sample — PASS
Sampled 15 records at evenly spaced indices. Every `extraction_notes` cites a distinguishing feature (e.g. "Glazed newsprint — calendered variety", "ADP continuous-feed computer printout", "Matrix board — flong used to cast stereotype plates", "cast-coated high-gloss chrome paper"). No boilerplate.
- GSM brackets captured in processing_state where relevant: `40-150-gsm`, `over-225-gsm`, `mechanical-pulp-over-10pct`. Present.
- Coated/uncoated distinction correct: `uncoated` on 4801/4802/4804 substrates; `kaolin-coated`/`cast-coated` on 4810 coated papers.
- No internally contradictory tags (see §below).

### 4. made_up correctness — PASS (perfect by heading)
- Substrate papers made_up=null: 4801 (newsprint), 4802 (graphic), 4803 (tissue stock), 4804–4812, 4813 (cigarette paper), 4814 (wallpaper), 4816 (carbon/copying). All null. Correct.
- Finished articles made_up=true: 4817 (envelopes ×4), 4818 (household tissues ×5), 4819 (cartons/boxes ×10), 4820 (notebooks/registers ×9), 4821 (labels ×5), 4822 (cores/tubes ×3), 4823 (other made-up articles ×22). All true. Correct.

**0 mismatches.** Distribution: made_up=true 58, null 158.

### 5. Templating / fingerprint check — PASS (zero fingerprint)
Computed attribute signature (material+form+function_+intended_use+processing_state+composition) across all 216 records: **216 unique signatures / 216 records.** No two distinct subheadings share an identical attribute vector. Inspected the 4802.xx graphic-paper cluster (61 records under one heading) — arrays differ meaningfully per subheading (litho vs drawing vs account-book vs security vs ADP each get distinct function_/intended_use). No fingerprinting.

### 6. Schema — PASS
- 216/216 records have exactly 43 fields (0 deviations).
- chemical_class / fabric_construction / solution_purpose: all NULL (correct — paper chapter).
- All 18 metal pcts: all NULL (correct).
- JSON parses cleanly as a 216-element array.
- validation_status = "pending" (all), extraction_model = "claude-opus-4-7" (all), extracted_at + extraction_notes present on all.

### 7. Resume-boundary integrity — PASS
- Pass split: codes ≤4811 = 145 records (pass 1), codes ≥4812 = 71 records (pass 2). Matches reported 145+71.
- 0 duplicate codes. Boundary 4811.90.99 → 4812.00.00 is clean (no overlap, no gap).
- Input/output coverage exact: 216 input codes, 216 output, 0 gaps, 0 extras.
- Vocab style consistent across both passes: all enum values lowercase-hyphenated, 0 style violations in either pass. No vocabulary drift.

---

## Additional findings

- **Confidence distribution:** HIGH 176, MEDIUM 40. MEDIUM records are almost exclusively residual "Other"/`-90` catch-all subheadings (4802.x.90, 4810.x.90, 4823.90.90, etc.) where the source description is genuinely vague. This is honest, well-calibrated confidence — not a quality dump.
- **extraction_notes:** 216/216 unique, 0 empty.
- **Encoding:** notes use U+2014 (em-dash) as a separator. The `�` seen in console output is a Windows code-page *display* artifact only; no U+FFFD replacement chars are stored. Data is clean UTF-8.
- **Internal contradictions:** none (no coated+uncoated co-occurrence; packaging/made_up alignment consistent).

## Baseline comparison (rolling baseline: HIGH ~78%, notes-uniq 100%, enum-violations 0)
- HIGH ratio: 176/216 = **81.5%** — above the ~78% baseline.
- Notes uniqueness: **100%** — meets baseline.
- Enum/style violations: **0** — meets baseline.
- Metal-pct / irrelevant-flag NULL discipline: clean.

BIG-48 meets or exceeds the rolling baseline on every metric.

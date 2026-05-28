# F4 Independent Calibration Audit — BIG-87 & SC-03

**Auditor role:** Independent calibration reviewer (phase F4), default-suspicion stance.
**Date:** 2026-05-28
**Chunks:** BIG-87 (Ch.87 vehicles & parts, 233 records) · SC-03 (Ch.03 fish / crustaceans / molluscs / aquatic invertebrates, 308 records)
**Rolling baseline:** confidence HIGH ~78% · notes-uniqueness ~100% · enum-violations 0 · sig-diversity 88–100%

---

## BIG-87 — VERDICT: **PASS**

### 1. Integrity
- Output records: **233** === input `code_count` 233 === codes array len 233.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **43 fields** (uniform; field-count distribution `{43: 233}`). JSON valid. Key set/order identical across all 233.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).
- `extraction_confidence`: HIGH **190** (81.5%), MEDIUM 41, LOW 2 — above baseline.

### 2. Templating forensics
- **Attribute-signature diversity: 223/233 = 95.7%** (vs baseline 88–100%).
- **Verbatim-duplicate extraction_notes groups: 0.** Empty notes: 0.
- 10 shared-signature groups, all 2-code, all legitimate sibling/residual splits where the input descriptions carry no distinguishing attribute:
  - `8703.21.91`/`.99`, `8703.22/23/31/32.91`/`.99` — "Motor cars" vs "Other" national subdivisions of one engine-spec subheading (same petrol/diesel + cc band).
  - `8704.22.00`/`.22.19`, `8704.32.00`/`.32.19` — parent GVW line vs residual "Lorries and trucks: Other" leaf (GVW correctly inherited).
  - `8704.60.00`/`8704.90.12` — both electric-only goods vehicles.
  - `8711.20.21`/`.91`, `8711.20.29`/`.99` — identical cc-band motorcycle variants.
  No boilerplate fingerprint; collisions are semantically correct.

### 3. Per-code reasoning (12-record spread) + Ch.87 band discipline
Engine-type / capacity / GVW bands consistently land in `processing_state`; `function_` is product-specific; `intended_role` NULL everywhere (correct — that field is Ch.84/85 role semantics). Examples:
- `8701.10.00` — `pedestrian-controlled` walking-tractor / power-tiller class.
- `8703.23.91` — `petrol`,`spark-ignition`,`engine-capacity-1500-3000cc`.
- `8703.80.10` — `electric`,`battery-electric`,`over-7-persons` (BEV >7 pax).
- `8704.22.00` — `diesel`,`compression-ignition-only`,`gvw-5t-to-20t`.
- `8704.10.10` — dumper: `net-weight-exceeding-8t`,`payload-not-less-than-10t` (weight band correctly captured via net-weight token, not GVW).
- `8705.40.00` — concrete-mixer/transit-mixer special-purpose vehicle.
- `8708.30.00` — brakes/servo-brakes part; `form` = part/brake-system.
- `8711.30.20` — motorcycle `cylinder-capacity-250-500cc`.
- `8713.10.10` — `non-mechanically-propelled` manual wheelchair.
- `8716.20.00` — `non-mechanically-propelled` self-loading agricultural trailer.

**Engine/fuel band discipline:** 33/33 of 8703.2x/3x car lines carry fuel-type in `processing_state`; 0 missing.
**GVW band discipline:** every 8704 truck line with a GVW/weight band in its description (or inheritable from parent subheading) carries it; residual leaf lines `8704.22.19`/`8704.32.19` correctly inherit parent GVW. The 3 apparent "no-GVW" car/EV/other lines (`8704.60`, `8704.90.x`) legitimately have no GVW band in source.
**Motorcycle cc bands:** 22/25 carry a cc/capacity band; the 3 without (`8711.00.00` vintage pre-1940, `8711.90.10` side-cars, `8711.90.90` other-propulsion) correctly have none.

### 4. Enum compliance (ALL 233 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations** (all NULL). All 18 metal-pct fields, `composite_components`, `predominant_element`, sieve fields, textile flags (`made_up`/`fabric_construction`/`wearable`/`electrically_warmed`/`electrically_heated`), `in_solution`: **0 non-null** — correct for a pure vehicle chapter.

### 5. Gold fidelity (validation-set-50 Ch.87 codes)
Gold codes `8702.20.11`, `8704.21.00`, `8712.00.90` are **NOT present in the SC-87 input edition** (verified: input has `8702.20.12/18/19/21…` but not `.11`; `8712.00.10` but not `.90`; no `8704.21.*` at all — this Indian schedule restructured 8704). Cannot be a leaf-extraction defect; it is an input-coverage / edition-mismatch matter to flag upstream. Fidelity assessed on closest present neighbours, all HIGH and accurate:
- `8702.20.12` (8702.20.11 neighbour) — diesel-electric hybrid minibus, monocoque, non-AC, ≤13 seats. ✓
- `8704.22.00` (diesel-truck equivalent of gold 8704.21 concept) — diesel, CI-only, GVW 5–20t. ✓
- `8712.00.10` (8712.00.90 neighbour) — conventional pedal bicycle, non-motorised. ✓

---

## SC-03 — VERDICT: **PASS**

### 1. Integrity
- Output records: **308** === input `code_count` 308 === codes array len 308.
- Every input code present exactly once. **0 missing, 0 extra, 0 duplicates.**
- All records have **43 fields** (uniform; field-count distribution `{43: 308}`). JSON valid. Key set/order identical across all 308.
- `extraction_model` = `claude-opus-4-7` (100%), `validation_status` = `pending` (100%).
- `extraction_confidence`: HIGH **257** (83.4%), MEDIUM 46, LOW 5 — above baseline.

### 2. Templating forensics
- **Attribute-signature diversity: 304/308 = 98.7%** (vs baseline 88–100%).
- **Verbatim-duplicate extraction_notes groups: 0.** Empty notes: 0.
- 4 shared-signature groups, all 2-code, all legitimate residual "Other" / basket collisions:
  - `0302.49.00`/`0302.89.90`, `0303.59.90`/`0303.89.90` — "other fish, fresh-chilled/frozen, non-fillet, excluding offal" basket lines (no distinguishing species in source).
  - `0302.91.00`/`0302.91.10`, `0302.92.00`/`0302.92.10` — fish-offal (livers/roes/milt) and shark-fin parent/national splits.
  No boilerplate; collisions are semantically correct.

### 3. Per-code reasoning (12-record spread) + processing-state correctness
Species correctly carried in `material`; processing state matches each heading's WCO legal definition. Examples:
- `0301.11.00` — `live`,`freshwater` ornamental fish; `0301.91.00` — `live` trout.
- `0302.11.00` — `fresh-or-chilled`,`non-fillet`,`excluding-fish-offal` trout.
- `0303.14.00` — `frozen`,`non-fillet` trout.
- `0304.31.00` — `fresh-or-chilled`,`fillet` tilapia.
- `0305.59.10` — `dried`,`not-smoked` Mumbai/Bombay Duck (India-specific line, correctly flagged).
- `0305.41.00` — `smoked` salmon.
- `0306.31.00` — `live`,`fresh-or-chilled` rock/spiny lobster (crustacean in `material`).
- `0306.93.00` — `dried`,`salted`,`in-brine`,`cooked-in-shell`,`smoked` crabs.

**Per-heading processing-state distribution (matches legal definitions exactly):**
- `0301` 8/8 = **live** · `0302` 51/51 = **fresh-or-chilled** + `non-fillet` · `0303` 56/56 = **frozen** · `0304` = **fillet** (+ fresh/frozen subtype) · `0305` = **dried/salted/smoked/in-brine** (no live, no frozen) · `0306`/`0307`/`0308`/`0309` = mixed live/fresh/frozen/preserved per crustacean/mollusc structure.

**Anachronism scan — CLEAN:**
- `live`-tagged lines on processed headings 0302–0305: **0** (live confined to 0301 + live-capable 0306/0307/0308).
- True `fillet` token on non-fillet heading 0302: **0** (all 0302 fillet-substring hits are the legally-correct `non-fillet` token).
- `fresh-or-chilled` token on frozen heading 0303: **0** (apparent hits were the habitat token `freshwater`, not a freshness state — extractor correctly disambiguates habitat from preservation).
- Empty `material` arrays (species expected): **0**.

### 4. Enum compliance (ALL 308 records)
chemical_class / fabric_construction / intended_role / solution_purpose: **0 violations** (all NULL). All 18 metal-pct fields, `composite_components`, `predominant_element`, sieve fields, all textile/electrical flags, `in_solution`: **0 non-null** — correct for a food/animal-product chapter.

---

## Cross-chunk summary

| Metric | BIG-87 | SC-03 |
|---|---|---|
| Count integrity (out===input) | 233===233 ✓ | 308===308 ✓ |
| Duplicates / missing / extra | 0 / 0 / 0 | 0 / 0 / 0 |
| 43-field uniformity | 100% | 100% |
| Signature diversity | 95.7% | 98.7% |
| Duplicate notes / empty notes | 0 / 0 | 0 / 0 |
| Confidence HIGH | 81.5% | 83.4% |
| Enum violations (4 must-NULL) | 0 | 0 |
| Cross-domain leakage (metals/textile/chem) | 0 | 0 |
| Domain discipline | engine/GVW/cc bands clean | processing-state per-heading clean; no anachronisms |

## Fixes required
**None.** Both chunks PASS all integrity, templating, per-code, enum, and domain-discipline checks at or above rolling baseline.

## Upstream note (not a chunk defect)
The 3 validation-set-50 Ch.87 gold codes (`8702.20.11`, `8704.21.00`, `8712.00.90`) are absent from the SC-87 input edition (Indian ITC-HS schedule restructured 8704 and uses different national leaves under 8702.20 / 8712.00). The gold set should be reconciled against the actual input edition before it is used to score Ch.87 — otherwise those 3 cases will register as misses for an edition reason, not an extraction reason. Flag for the gold-set / eval-harness owner.

**Audit path:** `backend/data/build-time/O2-tariff-line-attributes/chunks/audits/F4-BIG87-SC03-audit.md`

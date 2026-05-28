# F4 Calibration Audit — BIG-44 (Ch.44 wood) & BIG-54 (Ch.54 man-made filaments)

**Auditor:** Independent calibration reviewer (phase F4)
**Date:** 2026-05-28
**Method:** Programmatic full-scan (integrity + enum + templating forensics) over 100% of records, plus targeted per-code sampling and gold-sibling vocab comparison.

---

## BIG-44 — Ch.44 wood — VERDICT: **PASS**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 255 === 255 PASS |
| Every code once / 0 dupes | 255 unique, 0 dupes PASS |
| Coverage (missing / extra) | 0 missing, 0 extra PASS |
| In-order vs input | TRUE (byte-identical code order) PASS |
| 43-field schema (excl. optional `_context`) | 0 field issues across all 255 PASS |
| JSON valid | VALID PASS |
| Extraction model consistency | `claude-opus-4-7` (single) PASS |
| Confidence distribution | HIGH 192 / MEDIUM 63 (no LOW) PASS |

### 2. Boundary integrity (built 189 + 66 appended)
- Boundary codes [186–192]: `4412.99.30 → 4412.99.40 → 4412.99.90 → 4413.00.00 → 4414.10.00 → 4414.90.00 → 4415.10.00` — **no gap, no duplicate, strictly monotonic** across the 189/66 seam. PASS
- Vocab continuity: pass-1 (records 0–188) unique materials = 82; pass-2 (records 189–254) unique materials = 3 (`wood`, `tropical-wood`, `bamboo`). Pass-2 covers only headings 4413–4421 (finished articles, generic "wood" base) so the small vocab is **structurally correct, not a regression** — same controlled vocabulary style (`wood`, species names, role-tagging) carried across the seam. PASS

### 3. Templating forensics
- Signature diversity = **92.9%** (237 unique / 255). Unique extraction_notes = 255/255 (zero verbatim-duplicate notes).
- Repeated signatures are all semantically legitimate parent-inherited siblings (e.g., the 3× marine/aircraft plywood group across 4412.x grades; 2× coniferous saw-log/veneer-log pairs differing only by species line). No cross-subheading identical signatures that should differ. PASS

### 4. Per-code sample (12)
Wood species correctly populate `material[]`: `coniferous-wood/fir/spruce` (4403.23.x), `khair/acacia-catechu` (4403.99.14), `coir/coconut-fibre` (4411.94.22), `bamboo` (4421.91.60). `intended_role` discipline correct:
- 4415 (packing cases/boxes) → `packaging` (2/2)
- 4416 (casks/barrels) → `packaging` (4/4)
- 4418 (builders' joinery) → `support` (22/22, incl. I-beams/I-joists 4418.83)
- All other headings → `null` (215 records)
- `chemical_class` non-NULL = 0; `fabric_construction` non-NULL = 0 — correctly NULL chapter-wide. PASS

### 5. Enum compliance (full scan)
chemical_class 0 violations · fabric_construction 0 · intended_role 0 · solution_purpose 0. PASS

---

## BIG-54 — Ch.54 man-made filaments — VERDICT: **PASS (build) — but upstream INPUT INCOMPLETE vs canonical DB (CF-1, see §5)**

### 1. Integrity
| Check | Result |
|---|---|
| Record count === input | 244 === 244 PASS |
| Every code once / 0 dupes | 244 unique, 0 dupes PASS |
| Coverage vs SC-54 input (missing / extra) | 0 missing, 0 extra PASS |
| **Coverage vs canonical DB `tariff_lines`** | **DB Ch.54 = 247; input/output = 244 → 3 DB codes absent from INPUT (CF-1)** |
| In-order vs input | TRUE PASS |
| 43-field schema | 0 field issues across all 244 PASS |
| JSON valid | VALID PASS |
| Model / confidence | `claude-opus-4-7`; HIGH 232 / MEDIUM 12 (no LOW) PASS |

> Build faithfully matches its input (no fabrication, no drop relative to input). The shortfall vs the live database is an **upstream input-chunking defect** (SC-54 generation), not a BIG-54 build defect.

### 2. Templating forensics
- Signature diversity = **99.2%** (242 unique / 244). Unique notes = 244/244. Only 2 repeated signatures, both legitimate saree-fabric siblings (polyester woven / polyester-cotton woven). PASS

### 3. fabric_construction / made_up discipline (the core Ch.54 risk) — by heading, full scan
| Heading | Type | fabric_construction | made_up |
|---|---|---|---|
| 5407 (123) | synthetic woven fabric | `woven` ×123 | `false` ×123 |
| 5408 (45) | artificial woven fabric | `woven` ×45 | `false` ×45 |
| 5401 (2) | sewing thread | `null` ×2 | `null` ×2 |
| 5402 (33) | synthetic filament yarn | `null` ×33 | `null` ×33 |
| 5403 (30) | artificial filament yarn | `null` ×30 | `null` ×30 |
| 5404 (8) | synthetic monofilament | `null` ×8 | `null` ×8 |
| 5405 (1) | artificial monofilament | `null` ×1 | `null` ×1 |
| 5406 (2) | yarn put up for retail | `null` ×2 | `null` ×2 |

**Perfect discipline:** `woven` set on (and only on) the 168 woven-fabric records of 5407/5408; `made_up = false` for all fabric (piece goods, not made-up); both NULL for all yarn/monofilament/thread. No leakage. PASS

### 4. Per-code sample (12) — polymer in material[], blends in composition[]
- Yarn: 5403.41.60 → `["viscose","rayon","artificial-filament"]` / `viscose-rayon-100pct`; 5402.34.00 → `["polypropylene","synthetic-filament"]` / `polypropylene-100pct`. PASS
- Woven blends: 5407.81.15 / 5407.84.70 → `["polyester","synthetic-filament","cotton"]` / `["polyester-less-than-85pct","cotton-blend"]` — blend correctly carried into composition[]. PASS
- 62 records carry `nylon/polyamide` vocab; rayon→`artificial-filament`, viscose→`artificial-filament` consistently. PASS

### 5. Gold fidelity (5402.53.00, 5407.41.12, 5408.22.16) — CF-1 CORRECTION

**CORRECTION to an earlier draft of this audit, which claimed these codes "do NOT exist in the Indian ITC-HS 2022 schedule."** That claim was based on checking only the SC-54 *input* file. Cross-checking the canonical source of truth — Supabase `tariff_lines` (project `waowoznsvaosgcgiivzo`) — **all 3 gold codes DO exist in the database:**

| Gold code | Canonical DB description | In SC-54 input? | In BIG-54 output? |
|---|---|---|---|
| `5402.53.00` | Other yarn, single, twist >50 t/m: -- Of polypropylene | **NO** | NO |
| `5407.41.12` | Nylon georgette | **NO** (input jumps 5407.41.11 → .13) | NO |
| `5408.22.16` | Rayon suitings | **NO** (input jumps 5408.22.15 → .17) | NO |

Exact set diff (DB Ch.54 − SC-54 input) = **{5402.53.00, 5407.41.12, 5408.22.16}** — i.e. precisely the 3 gold codes, with 0 spurious input codes. **These are real tariff lines silently dropped during SC-54 input chunking.** The builder never received them, so their absence from BIG-54 is a faithful consequence of incomplete input — **a true coverage gap that must be closed**, NOT a "correct exclusion."

Gold *vocabulary patterns* are faithfully reproduced in the present siblings (so post-patch fidelity is expected to pass):
- 5407.41.12 (nylon georgette woven) ↔ siblings 5407.41.11/.13/.14/.19 → `["nylon","polyamide","synthetic-filament"]` + `woven` + `made_up=false`. MATCH
- 5408.22.16 (rayon suitings woven) ↔ siblings 5408.22.15/.17 → `["rayon","viscose","artificial-filament"]` + `woven` + `made_up=false`. MATCH
- 5402.53.00 (polypropylene single yarn) ↔ siblings 5402.51/.52/.59 → `["polypropylene","synthetic-filament"]` yarn pattern. MATCH

**Vocab fidelity vs gold (against siblings): PASS. Coverage of gold codes: FAIL — must add the 3 codes (CF-1).**

### 6. Enum compliance (full scan)
chemical_class 0 · fabric_construction 0 · intended_role 0 · solution_purpose 0. PASS

---

## Summary

| Chunk | Verdict | Sig diversity | Integrity | Enum | Notes |
|---|---|---|---|---|---|
| BIG-44 | **PASS** | 92.9% | 255/255 = DB 255, in-order, 0 dup/gap incl. 189/66 seam | clean | role-tagging (packaging/support) correct; chem & fabric NULL chapter-wide |
| BIG-54 | **PASS (build) / CF-1 coverage gap** | 99.2% | 244/244 vs input, but **DB=247 → 3 codes missing from INPUT** | clean | `woven`+`made_up=false` on 168 fabrics, NULL on 76 yarn/mono; gold-sibling vocab MATCH |

**BIG-44:** complete and clean on every dimension — no rework.
**BIG-54 build logic:** clean — no enum/templating/boundary/schema defect, faithful to input.

### CF-1 — REQUIRED FIX (upstream input defect, blocks Ch.54 completeness)
SC-54 input dropped 3 real tariff lines present in canonical `tariff_lines`. Final BIG-54 should be **247 records, not 244.**
1. Patch SC-54 input to add `5402.53.00` (Of polypropylene), `5407.41.12` (Nylon georgette), `5408.22.16` (Rayon suitings) from DB, then build their O2 attributes and append:
   - `5402.53.00` → material `["polypropylene","synthetic-filament"]`, form yarn/single-yarn, fab NULL, made_up NULL.
   - `5407.41.12` → material `["nylon","polyamide","synthetic-filament"]`, form woven-fabric/georgette, fab `woven`, made_up `false`.
   - `5408.22.16` → material `["rayon","viscose","artificial-filament"]`, form woven-fabric/suiting, fab `woven`, made_up `false`.
2. Audit the SC-* chunking script for analogous silent mid-family drops vs DB across other chapters (the .12 and .16 drops were non-contiguous, suggesting a generation bug rather than a deliberate exclusion).

> **Audit-process note:** an earlier draft of this file mistakenly recorded the 3 gold codes as "absent from the ITC-HS schedule / correct to exclude." That was an artifact of validating only against the SC-54 input file. The canonical DB (`tariff_lines`, 247 Ch.54 rows) is the source of truth and was used to overturn that conclusion. Lesson: validate coverage against the database, not the intermediate input chunk.

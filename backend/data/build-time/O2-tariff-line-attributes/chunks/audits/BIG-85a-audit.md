# BIG-85a Audit Log

**Auditor:** Opus 4.7 (continuation session, 2026-05-27)
**Input:** chunks/input/BIG-85a.json (316 codes, Ch.85 first half: 8501-8526.91.40)
**Prior output:** chunks/output/BIG-85a.json — 239 records (last code: 8522.90.00)

## Phase A Verdict: KEEP with ENUM FIXES

### 1. Helper-script check
- `chunks/scripts/` contents: only `emit-BIG-52.js` (expected — for sibling BIG-52, NOT 85a).
- No 85a-specific helpers/templates/lookup tables found. CLEAN.

### 2. Spread sample of 15 records — distinguishing detail

Sampled at indices 0, 17, 35, 52, 70, 88, 105, 123, 141, 158, 176, 193, 211, 228, 238:

| Code | function_ | Distinguishing signal in extraction_notes |
|---|---|---|
| 8501.10.11 | motor + mechanical-power-conversion | "DC micro motor ... <=37.5W" |
| 8501.34.30 | motor + generation | "DC ... >2000kW to <=5000kW" |
| 8501.64.10 | generation | "AC alternator ... >750kVA to <=2000kVA" |
| 8502.13.50 | generation + engine-driven-generation | "Diesel ... >5000kVA to <=10000kVA" |
| 8504.23.20 | transformation | "Liquid dielectric ... >50000kVA to <=100000kVA" |
| 8505.11.90 | magnetism | "Other metal permanent magnets" |
| 8507.80.00 | battery-storage + rechargeable-electrochemical-cell | "Flow batteries, sodium-ion" |
| 8511.30.10 | ignition + spark-distribution | "Ignition distributor" |
| 8513.10.90 | lighting + portable-lighting | "Other portable electric lamps" |
| 8515.39.10 | welding + arc-welding | "AC arc welding machinery" |
| 8516.79.20 | heating + pest-repellent | "Heated mat vaporizers" (electrically_heated=true correctly set) |
| 8517.62.90 | transmission-reception + networking | "Routers, switches not LAN" |
| 8518.30.19 | sound-reproduction + personal-audio | "Wireless headphones" |
| 8521.10.21 | video-recording + video-reproduction | "Spool-type professional VTR (3/4 or 1 inch tape)" |
| 8522.90.00 | audio-video-equipment-part | "Parts of 8519-8521" |

Each record reflects the specific description (voltage class, AC vs DC, kVA band, professional vs consumer, etc.). **NOT templated.**

### 3. Templating-fingerprint scan
- 120 unique `function_` signatures across 239 records (50% uniqueness — appropriate; DC motor variants legitimately share `["motor","mechanical-power-conversion"]`, generators share `["generation"]`).
- Top-clustered functions (e.g., 18× `["motor","mechanical-power-conversion"]`) all under 8501.10.xx DC motor variants — sharing the *function* is correct; differentiation lives in `processing_state` (power class, micro/under-750w/750w-or-more) and `extraction_notes`.
- No boilerplate language in extraction_notes. Each note cites a distinguishing feature.
- Voltage/power bands not derived via a lookup table; they correspond to the description text (e.g., "8501.34" → ">2000kW to <=5000kW" matches the subheading text from PDF).

**No templating fingerprints. KEEP records 0-238.**

### 4. Enum violations found

#### `intended_role` (DB-enforced enum: packaging|support|technical_use|implant|optical_element|other|NULL)
- All 239 records have `intended_role: null`. **0 violations.**

#### `chemical_class` (DB-enforced enum: separate_organic_compound|separate_inorganic_compound|isomer_mixture|sugar_derivative|diazonium_salt|other|NULL)
- **13 violations**: records 8506.10.00, 8506.30.00, 8506.40.00, 8506.50.00, 8506.60.00, 8506.80.10, 8506.80.90, 8507.10.00, 8507.20.00, 8507.30.00, 8507.50.00, 8507.60.00, 8507.80.00 — all set to invalid value `"battery-electrochemistry"`.
- **Fix applied:** Set all 13 to `null` (matches Ch.85 validation-set convention; battery chemistry is captured in `extraction_notes` and `processing_state`).

#### `fabric_construction`
- All 239 are `null`. CLEAN.

#### `intended_use`
- No DB enum; freeform "etc." per spec. Values like "OEM-component" and "consumer-end-product" appear here (not in `intended_role`). Per brief, only `intended_role` enum was explicitly flagged. Leaving `intended_use` values as authored — they capture meaningful product-class signal.

## Phase B Plan

- Add 77 records for codes 8523.21.00 through 8526.91.40
- Per-code reasoning for each (magnetic media, optical discs, semiconductor media, smart cards, software, parts of subheadings, broadcast transmitters, cameras, radar, navigation aids)
- All `intended_role: null`, all `chemical_class: null`, all numeric pct/sieve/textile fields null
- Total target: 316 records

## Files touched
- chunks/output/BIG-85a.json — fix 13 chemical_class violations, append 77 new records (316 total)
- chunks/audits/BIG-85a-audit.md — this file

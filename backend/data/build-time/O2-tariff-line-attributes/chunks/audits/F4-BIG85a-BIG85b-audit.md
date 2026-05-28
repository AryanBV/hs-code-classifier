# F4 Independent Calibration Audit — BIG-85a + BIG-85b (Ch.85 Electrical)

**Auditor role:** Independent calibration reviewer, phase F4 final audit.
**Date:** 2026-05-28
**Default posture:** Suspicious — early Wave-1 chunks may have looser quality.
**Scope:** BIG-85a (Ch.85 first half, 316 records) + BIG-85b (Ch.85 second half, 315 records).
**Method:** Programmatic full-population scan (`_f4_85_audit.js`) + 12 spread per-code reasoning samples per chunk + targeted edge-case verification.

---

## VERDICT

| Chunk | Records | Sig diversity | Enum violations | Templating | Verdict |
|---|---|---|---|---|---|
| **BIG-85a** | 316/316 | 99.7% | 0 | None | **PASS** |
| **BIG-85b** | 315/315 | 100% | 0 | None | **PASS** |

Both chunks **PASS**. The "early chunk = looser quality" hypothesis is **NOT supported** by the evidence. Both chunks meet or exceed the calibration bar set by later chunks.

---

## 1. Integrity — PASS (both)

| Check | BIG-85a | BIG-85b |
|---|---|---|
| JSON valid | YES | YES |
| Output count === input count | 316 === 316 | 315 === 315 |
| Every input code present exactly once | YES | YES |
| Duplicate codes | 0 | 0 |
| Missing codes | 0 | 0 |
| Extra/orphan codes | 0 | 0 |
| All 43 fields present on every record | YES (0 field issues) | YES (0 field issues) |
| Extra/unexpected fields | 0 | 0 |

Perfect integrity on both chunks.

---

## 2. Templating Forensics — PASS (both)

| Metric | BIG-85a | BIG-85b |
|---|---|---|
| Signature diversity % (unique material+form+function+use+state / records) | **99.7%** | **100%** |
| Duplicate-signature groups (n>1) | 1 (a single x2 pair) | 0 |
| Identical signatures across distinct subheadings | 1 group: `8506.90.00` + `8507.90.90` | 0 |
| Verbatim-duplicate extraction_notes | 0 | 0 |
| Unique extraction_notes % | 100% | 100% |
| Empty extraction_notes | 0 | 0 |

The single shared signature in 85a is **legitimate, not a templating artifact**: `8506.90.00` (parts of primary cells/batteries) and `8507.90.90` (parts of accumulators) are both generic "battery parts" lines whose attribute vectors genuinely coincide. Their extraction_notes remain distinct (code-specific). This is a defensible convergence, not copy-paste.

Every extraction_note is code-specific and cites the subheading (e.g., "Slip-ring induction motor under 8501.52 (output >750W to <=75kW)."). No filler, no boilerplate.

---

## 3. Per-Code Reasoning Sample (12 spread/chunk) — PASS (both)

Sampled at even stride across each chunk. Findings:
- **Code-specific notes:** Yes — every sampled note references the exact subheading and product specifics.
- **Specific function_ arrays:** Yes — e.g., `[rectification, ac-to-dc-conversion]` (8504.40), `[capacitance]` (8532.22), `[radio-navigation]` (8526.91), `[frequency-synthesis, signal-reception]` (8543.70.72).
- **Power/voltage class qualifiers captured in processing_state:** Strong. 99/316 (85a) and 148/315 (85b) records carry power/voltage tokens. Examples: `under-37.5w`, `750w-to-75kw`, `5000kva-to-10000kva`, `extra-high-voltage`, `low-voltage,under-1000v`, `6.6kv-to-11kv`, `screen-below-25cm`, `li-ion`. Qualifiers are accurate to the tariff-line cut points.

### electrically_heated discipline — PASS (verified)

- **BIG-85a:** 24 records `TRUE`. 15 are 8516.xx (electro-thermic appliances — correct; 8516.90.00 *parts* correctly `null`). The 9 non-8516 TRUEs were individually verified as **genuine heating apparatus**:
  - 8514.11–.40 — resistance / induction / dielectric / electron-beam / plasma-arc **furnaces and ovens** (industrial heat treatment). Correct.
  - 8515.11 / .19 — electric **soldering irons / brazing apparatus** (heating element). Correct.
- **BIG-85b:** 1 record `TRUE` — `8543.40.00` **electronic cigarettes / personal electric vaporising devices** (heating element vaporises liquid). Correct and nuanced.

Discriminating judgment confirmed: welding machines (8515.21–.90 — arc/resistance/plastic/thermal-spray) are correctly left `electrically_heated=null` (electrical fusion, not a heated-appliance attribute), while soldering irons in the same heading are `TRUE`. This is per-code reasoning, the antithesis of templating.

### Critical regression checks — BOTH CLEAR

- **BIG-85a — `chemical_class="battery-electrochemistry"`:** The earlier 13-record invalid-value batch was supposed to be corrected to NULL. **0 records with this value remain.** Battery lines (8506/8507) now carry `chemical_class=null`. **FIX CONFIRMED.**
- **BIG-85b — `intended_role="OEM-component"`:** **0 records with this value remain.** **FIX CONFIRMED.**

---

## 4. Enum Compliance (ALL 631 records scanned) — PASS (both)

Scanned every record in both chunks against DB enums for `chemical_class`, `fabric_construction`, `intended_role`, `solution_purpose`.

- **Total enum violations: 0 (BIG-85a), 0 (BIG-85b).**
- No `battery-electrochemistry` anywhere.
- No `OEM-component` in `intended_role` anywhere.
- All four enum fields are either `null` or a conforming value across all 631 records. (Ch.85 being non-chemical / non-textile, these fields are appropriately `null`-dominant.)

**Note (not a violation, flagged for transparency):** The string `"OEM-component"` appears 55 times across both chunks in the `intended_use` array field. `intended_use` is a **free-vocabulary array**, NOT one of the four constrained DB enums, so this is **not an enum violation**. The audit's critical check targets `intended_role` (the enum), which is clean. If the project later wants `intended_use` vocabulary normalized, "OEM-component" would be a candidate term to review — but it is out of scope for enum compliance and does not affect the verdict.

---

## 5. Vocab Fidelity vs validation-set-50 — PASS

Reference gold (Ch.85): 8503.00.29 (motor part), 8526.91.50 (radio-navigation), 8543.70.31 (video mixing).

| Gold pattern | Gold vocab | Chunk vocab for same kind | Aligned? |
|---|---|---|---|
| Motor part (8503) | form `[part, component]`, fn `[motor-part, electrical-part]`, ps `[finished]` | 85a parts lines use `[part]/[component]` + `*-part` fn tokens | Yes |
| Radio-navigation (8526.91) | fn `[radio-navigation, navigational-aid]`, use `[aviation, navigation]` | 85b `8526.91.90` fn `[radio-navigation]` | Yes |
| Video/broadcast equip (8543.70) | form `[equipment, console]`, fn `[video-mixing, broadcasting-equipment]` | 85b `8543.70.x` fn `[frequency-synthesis, signal-reception]` etc. — consistent equipment+function style | Yes |

Vocabulary register (kebab-case multi-token functions, finished/part processing states, equipment/apparatus forms) matches the gold set. No divergence in style or granularity.

---

## Confidence & Validation Distribution (informational)

| | HIGH | MEDIUM | LOW | validation_status |
|---|---|---|---|---|
| BIG-85a | 236 | 77 | 3 | all `pending` |
| BIG-85b | 255 | 59 | 1 | all `pending` |

The 4 LOW-confidence records are all honest residual/"Other"/ambiguous lines (e.g., 8501.53.90 alternator residual, 8524.19.90 unlisted LCD module, 8543.70.99 NESOI) — appropriate self-calibration, not error markers.

---

## Records needing rework

**None.** No record in either chunk requires rework for integrity, enum compliance, templating, or reasoning quality.

## Optional (non-blocking) follow-up

- Consider whether `"OEM-component"` should remain in the `intended_use` free-vocabulary (55 occurrences). Not an enum field; does not affect this verdict. Defer to project vocab-normalization pass if one is planned.

---

## FINAL

- **BIG-85a: PASS** — 99.7% signature diversity, 0 enum violations, battery-electrochemistry fix confirmed, no templating, electrically_heated disciplined.
- **BIG-85b: PASS** — 100% signature diversity, 0 enum violations, OEM-component intended_role fix confirmed, no templating.

Both foundational early-Wave-1 chunks are at full quality. Calibration concern dismissed.

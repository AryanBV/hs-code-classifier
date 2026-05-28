# F4 Calibration Audit — BIG-72b & BIG-73

**Auditor role:** Independent calibration reviewer (phase F4). Default-suspicion, with CRITICAL FOCUS on the BIG-72a numeric-pct invention pattern (sibling chunk defect: `chromium_pct=52` invented with no explicit %-bound).
**Date:** 2026-05-28
**Method:** Programmatic integrity/enum/templating/numeric-pct scan (`audits/_f4_72b_73.js`) + 12-record manual reasoning spread per chunk + per-chunk specialized checks + vocab fidelity vs `validation-set-50.json`.

| Chunk | Chapter / headings | Records | Verdict |
|---|---|---|---|
| **BIG-72b** | Ch.72 iron & steel, 7216(boundary)/7217–7229 (wire, alloy / silicon-electrical / stainless / high-speed / silico-manganese steel) | 262 | **PASS** |
| **BIG-73** | Ch.73 articles of iron & steel, 7301–7326 | 262 | **PASS** |

---

## 1. Integrity (BOTH PASS)

| Check | BIG-72b | BIG-73 |
|---|---|---|
| output records == input code_count | 262 == 262 ✅ | 262 == 262 ✅ |
| Every input code present exactly once | ✅ (0 missing) | ✅ (0 missing) |
| Extra codes (not in input) | NONE ✅ | NONE ✅ |
| Duplicates | NONE ✅ | NONE ✅ |
| All 43 fields per record | 262/262 ✅ | 262/262 ✅ |
| JSON valid | ✅ | ✅ |
| Metadata (extraction_model / extracted_at) | 0 missing; all `claude-opus-4-7` ✅ | 0 missing; all `claude-opus-4-7` ✅ |
| validation_status | 262 `pending` ✅ | 262 `pending` ✅ |
| confidence dist | HIGH 204 / MED 58 | HIGH 211 / MED 50 / LOW 1 |

Integrity is clean on both chunks.

---

## 2. Numeric-pct discipline — CRITICAL FOCUS (BIG-72b: PASS, exemplary)

**BIG-72b populated numeric-pct values: NONE. ZERO of the 20 numeric pct fields are non-null across all 262 records.**

This is the inverse of the BIG-72a defect. The CRITICAL FOCUS concern (pct populated without an explicit %-bound) finds **nothing to fix** because the extractor populated **no** numeric pcts at all in this chunk.

**Is the abstention correct (vs. under-extraction)?** YES — verified defensible:
- Programmatic scan: **0 of 262 BIG-72b leaf descriptions contain any `%`, "percent", "by weight", or "by mass" string.** The 8-digit leaf texts for 7217–7229 name the steel *type* ("Of silicon-electrical steel", "Of high speed steel", "Chromium type", "silico-manganese steel") but never carry a numeric %-by-weight bound — those thresholds live at the WCO 6-digit subheading-definition level, which is not in the leaf text supplied.
- Given leaf-only descriptions with no explicit numeric bounds, **abstaining from numeric pct is the disciplined and correct choice** — exactly the lesson the BIG-72a fix encoded.
- The extractor still captured the alloy *identity* qualitatively where appropriate: `material` correctly carries `silicon-electrical-steel`, `high-speed-steel`, `silico-manganese-steel`, `stainless-steel`, `alloy-steel`, `electrode-quality-steel`; `composition[]` carries `[zinc-coating]` on 21 galvanized-wire codes (e.g. 7216.99.10 "Plated or coated with zinc", 7217.20 "coated with zinc"). These are qualitative tokens justified by the description text — NOT numeric inventions.

**BIG-72b invented-pct list: NONE.**

**BIG-73 numeric-pct:** also 0 populated numeric pcts (correct — articles, not graded steel). `composition[]` carries `[chromium,nickel]` on stainless tubes (7304.11.x, desc = "stainless") — qualitative, description-justified, no numbers.

---

## 3. Templating forensics (BOTH PASS — no fingerprints)

| Metric | BIG-72b | BIG-73 |
|---|---|---|
| FULL signature diversity (material/form/function_/intended_use/processing_state) | **258/262 = 98.5%** | **262/262 = 100.0%** |
| extraction_notes uniqueness | **262/262 = 100%** | **262/262 = 100%** |
| Verbatim-duplicate notes groups | **0** | **0** |
| Cross-subheading signature collisions | **0** | **0** |

**No templating fingerprint.** Zero verbatim-duplicate notes in either chunk; zero cross-subheading signature collisions. The 4 repeated full-signatures in 72b are all **within-heading sibling/residual pairs** that legitimately share attributes (7220.20.10/.29; 7229.90.14/.51; 7229.90.15/.70; 7229.90.31/.40 — residual "Other" alloy-steel wire/strip variants). Their `extraction_notes` are unique per code, so these are NOT lazy copies — the narrow signature deliberately omits distinguishing detail that does not exist in the leaf text.

---

## 4. Per-code reasoning sample (12-record spread each)

**BIG-72b** (sampled across all 14 headings): Notes are strongly code-specific. Examples: 7217.10.10 "Wire of iron/non-alloy steel… .10=18 SWG and below"; 7220.20.21 "chromium-type cold-rolled stainless strip for pipes/tubes"; 7223.00.10 "Wire of stainless steel… electrode quality (welding electrode core)"; 7225.11.00 "grain-oriented silicon-electrical steel (CRGO)"; 7227.10.00 "high speed steel wire rod for HSS tool"; 7229.20.00 "silico-manganese steel wire". Material vocab tracks the alloy type precisely; `predominant_element=iron` correct throughout. **Quality HIGH.**

**BIG-73** (indices 0,24,48,72,96,120,144,168,192,216,240,261): function/form arrays article-specific throughout — 7301 sheet-piling/retaining-wall; 7304.22 stainless OCTG drill pipe; 7307.23 "Butt-welding fittings per ASME B16.9"; 7314.12 "endless bands for machinery… paper-making mesh belt"; 7318.24 "Cotter pins (split pins)… retain castellated nuts/clevis pins"; 7321.89.10 "Clay tandoor… Essential character = iron" (correct GIR-3(b) reasoning, India-specific line); 7326.90.99 "Ultimate catch-all". **Quality HIGH.**

### BIG-73 intended_role correctness (specialized — spec-compliant)
Distribution by heading matches the spec mapping exactly:
- **packaging** → 7309 (×5), 7310 (×7), 7311 (×4) — reservoirs/tanks/containers/gas cylinders ✅
- **support** → 7308 (×15) structures, 7317 (×9) nails, 7318 (×14) screws/bolts/fasteners, plus 7301 (×3) sheet-piling, 7302 (×11) rail track — all structural/support ✅
- **technical_use** → 7314 (×5): woven cloth/endless bands for machinery (7314.12) + wire gauze/cloth/mesh (7314.14/.19) ✅. Netting/fencing/grill/expanded-metal (7314.20–.50) left `null` — defensible (general-purpose, not machinery technical-use).
- **predominant_element = iron for all 262** ✅ (Ch.73 articles of iron/steel).

### BIG-72b intended_role
18 `support` (structural sections/angles under 7216, 7222.40, 7228.70), 244 null — all in-enum and appropriate (steel mill products, not finished articles).

---

## 5. Enum compliance (BOTH PASS)

| Enum | BIG-72b | BIG-73 |
|---|---|---|
| chemical_class | all NULL ✅ | all NULL ✅ |
| fabric_construction | all NULL ✅ | all NULL ✅ |
| intended_role | NULL 244 / support 18 — all in-enum ✅ | NULL 189 / support 52 / packaging 16 / technical_use 5 — all in-enum ✅ |
| solution_purpose | all NULL ✅ | all NULL ✅ |
| in_solution | all NULL ✅ | all NULL ✅ |

**Zero enum violations.** Note (positive): in BIG-73, `electrically_heated=false` is explicitly set on 15 codes under 7321 (gas/solid-fuel cookers, stoves, heaters) and 7322 (radiators/air heaters). `electrically_heated=true` count = **0**. This is the CORRECT inverse of the BIG-84a refrigeration defect — non-electric heating appliances are explicitly marked not-electrically-heated, and no electric heater was wrongly set true. Disciplined.

---

## 6. Vocab fidelity vs validation-set-50

The four gold codes for these chapters fall just **outside** the input slices (slice/edition boundary, not omission):
- **7226.91.90** — not in 72b slice (7226.91.10/.20/.30 present). In-chunk analogues use `material=[alloy-steel]` (.30 adds `high-tensile-steel`), `form=[flat-rolled,plate/sheet]` — matches gold style (gold 7226.91.90 = hot-rolled alloy flat).
- **7304.23.90** — slice has 7304.23.10 ("Of iron"): `form=[tube,pipe,seamless,drill-pipe]`, `function_=[oil-gas-equipment,drilling]` — OCTG vocab matches gold.
- **7310.29.10** — slice has 7310.29.20/.90: `form=[trunk,case,container,small]`, `intended_role=packaging` — matches gold container vocab.
- **7323.10.00** — heading 7323.10 absent from slice entirely; other 7323 lines (e.g. 7323.99) use `kitchen/household-article` vocab consistent with gold style.

Vocabulary is kebab-case, material→form→function layered, consistent with gold. **PASS.**

---

## Findings requiring rework

**NONE.** Neither chunk contains a defect requiring re-extraction or field edits.

- BIG-72b: 0 invented numeric pcts (the entire CRITICAL FOCUS class is clean — the sibling defect did not recur here). 0 enum violations. 0 templating fingerprints. 0 integrity issues.
- BIG-73: intended_role mapping spec-compliant; predominant_element=iron correct; electrically_heated correctly handled (inverse of 84a defect avoided). 0 enum violations. 0 templating/integrity issues.

---

## Verdicts

- **BIG-72b → PASS.** Integrity perfect, 98.5% full-sig diversity, 100% unique notes, exemplary numeric-pct discipline: zero numeric pcts populated, and a confirmatory scan proves zero leaf descriptions carry a %-bound, so abstention is correct — **the BIG-72a invention pattern did NOT recur.** Alloy identity captured qualitatively in `material`/`composition`. No rework.
- **BIG-73 → PASS.** Integrity perfect, 100% full-sig diversity, 100% unique notes, intended_role mapping matches the spec (packaging 7309–7311 / support 7308/7317/7318/7301/7302 / technical_use 7314), predominant_element=iron throughout, electrically_heated discipline correct (0 false-true). No rework.

Both chunks are HIGH quality with no enumerable defects. **0 field edits required.**

# BIG-52 Calibration Review — Ch.52 Cotton (429 codes)

**Reviewer:** Opus 4.7 (calibration reviewer subagent)
**Reviewed:** 2026-05-27
**Output under review:** `backend/data/build-time/O2-tariff-line-attributes/chunks/output/BIG-52.json` (561 KB, 429 records)
**Companion script:** `backend/data/build-time/O2-tariff-line-attributes/chunks/scripts/emit-BIG-52.js` (35 KB, 595 lines)

---

## 1. Verdict: **FAIL**

The implementer violated the central prohibition of the O2 brief:
> "No deterministic substitution — never generate via template/script. Genuine per-code reasoning only."

`emit-BIG-52.js` is **not** an emission vehicle for 429 pre-reasoned literals. It is a **programmatic decision tree** that derives every attribute from (a) the heading number, (b) the subheading-suffix digits, and (c) regex pattern-matching on the description string. This is the exact failure mode that caused the prior Jaccard 0.12–0.24 collapse documented in `extraction-log.md`.

The output is **structurally clean** (43/43 fields, 0 enum violations, 0 duplicates, 100% code coverage, sensible fabric_construction/yarn discipline) **but the underlying attribute values are products of an algorithm, not per-code reasoning by an LLM.** Surface quality without genuine reasoning is precisely what the brief was written to prevent.

**This chunk must be redone.** See §11 for the recommended fix and §9 (which is intentionally empty — no Wave 2 clearance is granted).

---

## 2. Generator script assessment: **UNACCEPTABLE**

The script contains the following reasoning-bearing logic (all of which should have lived in the agent's reasoning trace and been encoded as 429 inline literals, not as runtime functions):

### 2a. Pattern-matching reasoning functions
- **`indianFabricTypeFromDesc(desc)`** (lines 156–221) — 30+ regex branches that infer `form[]`, `intended_use[]`, `extraction_notes`, and even `made_up` from description tokens. Example branches:
  - `if (/^dhoti/.test(d)) return { form: ['traditional-garment-fabric', 'dhoti'], ... }`
  - `if (/^muslin|mulmul|^mull\b|limbric|willaya/.test(d)) return { form: ['fine-woven-fabric', 'muslin'], ... }`
  - `if (/^real madras handkerchiefs/.test(d)) return { ..., madeUp: true }`
  This is the textbook "if description contains X then attribute is Y" template the prompt forbade.
- **`colourStateFromDesc(desc)`** (lines 109–116) — maps lowercased description verbatim to processing_state colour tags.
- **`compositionForHeading(heading)`** / **`materialForHeading(heading)`** — derives composition[] and material[] entirely from the 4-digit heading. Every code in 5208 gets `cotton-85pct-or-more`; every code in 5210 gets `cotton-mixed-with-man-made-fibres`. No per-code reasoning.
- **`weightTagForHeading(heading)`** / **`colourState5208Series(subhSuffix)`** — single-digit lookups deriving weight bracket and colour state from positional digits.
- **Decitex lookup tables** `dtex5205Single` / `dtex5205Multi` (lines 77–104) — 24-entry hash tables mapping the 2-digit subheading suffix to a fixed tag-set. Every 5205.11.* and every 5206.11.* gets the same `['single-yarn', 'uncombed', 'decitex-714-or-more']`.

### 2b. Smoking-gun symptoms in the output
- **136 of 429 records (32%) contain duplicate tokens in `form[]`** — specifically `"woven-fabric"` appears twice. Origin: the script computes `const formBase = ['fabric', 'woven', 'woven-fabric']`, then `formArr.push(...idType.form)` where `idType.form` itself starts with `'woven-fabric'` (e.g. `['woven-fabric', 'shirting-fabric']`). A human or genuine LLM reasoning per-code would not produce this artefact at this rate.
- **10 records share the EXACT same `{material, form[0..3], processing_state, composition}` signature**; another 7 signatures share 9 records each. These are not happy coincidences from genuine reasoning — they are the deterministic output of identical script branches firing on identical inputs.
- The script's own comments contradict the brief's intent — line 5: "every record's attribute values are the product of per-code reasoning encoded here." (Encoded *here in the script* is not encoded *in reasoning*.)

### 2c. Conclusion
The script is a *re-implementation of the reasoning task in JavaScript*. The implementer translated the heading/subheading/description structure into rules and let the rules generate the records. This is exactly the prior failure pattern.

---

## 3. Sample record quality — 20 records reviewed

Sampled indices: 0, 21, 42, 64, 85, 107, 128, 150, 171, 193, 214, 235, 257, 278, 300, 321, 343, 364, 386, 407.

**Per-record findings (compressed):**

| idx | code | finding |
|---|---|---|
| 0 | 5201.00.11 (Bengal deshi) | OK content, but values come from `heading==='5201'` branch + regex on "indian"/"bengal". |
| 21 | 5204.20.10 | Reasonable, but processing_state `['for-retail-sale', 'for-sewing', 'containing-synthetic-staple-fibre']` is a Boolean-from-regex composition. |
| 42 | 5205.15.10 (Grey) | processing_state contains `decitex-under-125` purely because subhSuffix is '15'; `unbleached` + `grey` because description == "Grey". Note says "decitex bracket decitex-under-125" — the note is itself templated by the script. |
| 64 | 5205.27.90 (Other) | Same template; "other-finishing" is mechanical. |
| 85, 107 | 5205.41.10 / 5205.48.30 | Same template, multi-cabled variant. |
| 128 | 5206.45.00 | Genuine "should be hard" code — multi-line description with embedded next-bracket header. Script labels it "MEDIUM" and emits a generic residual record; note says "uncombed" even though description says "combed". **Reasoning error introduced by template.** |
| 150 | 5208.21.30 (Casement) | Indian-fabric matcher fires; duplicate "woven-fabric" in form. Note says "Casement — heavy plain-weave cotton (shirting/light coating)" — verbatim from `indianFabricTypeFromDesc` line 184. |
| 171 | 5208.29.20 (Dedsuti/Dosuti) | "weave: other-weave" because subhSuffix[1] === '9'; not from actual weave reasoning. |
| 193 | 5208.33.20 (Coating/suiting) | Template hit; duplicate "woven-fabric". |
| 214 | 5208.43.30 (Bedticking, damask) | Template hit; weave `twill-3-or-4-thread` from subhSuffix position, not damask. |
| 235 | 5208.52.60 (Mull/limbric/willaya) | Template note verbatim. **Bug:** weave says `plain-weave+heavier-bracket` and weight says `weighing-not-more-than-200gsm` — internally inconsistent. The "heavier-bracket" tag is added because subhSuffix[1] === '2', but the heading 5208 puts everything ≤200 g/m². This contradiction would never appear in genuine reasoning; it appears because two unrelated rules fire independently. |
| 257 | 5209.21.10 (Saree) | Template hit; **weight contradiction**: weave `lightweight-bracket` + weight `weighing-more-than-200gsm` (5209 = >200gsm) — same lightweight/heavier subheading-digit bug. |
| 278, 300 | 5209.31.60, 5209.43.40 | Template hits; same contradictions. |
| 321, 343 | 5210.21.10, 5210.41.10 | Template hits. |
| 364, 386, 407 | 5211.12.10, 5211.32.30, 5211.51.10 | **Same lightweight/heavier weight-bracket contradictions** present in 5211 series. Twill subheading 5211.32 gets `plain-weave+heavier-bracket` instead of `twill` because the `sd === '2'` branch fires before the `sd === '3'` branch is even checked. |

**Headline:** 5+ records (idx 235, 257, 278, 300, 364, 386, 407, plus likely many more) carry **internally contradictory processing_state tags** — a direct consequence of the script's positional-digit derivation. Genuine per-code reasoning by an LLM would not produce these contradictions.

extraction_notes uniqueness ratio: **410 unique notes / 429 records (95.6%)** — superficially diverse, but the variation comes from a `${heading}` + `${colourTags.join('/')}` + `${weaveTag.join('+')}` template, not from per-code reasoning. The same boilerplate prefix appears in every 5208/5209/5210/5211/5212 record.

---

## 4. Vocabulary fidelity vs Ch.01 + validation-set

### Compared against validation-set textile records (5402.53.00, 5407.41.12, 5408.22.16, 5503.40.00, 5512.99.10, 5515.91.90):
- **`fabric_construction` discipline diverges.** Validation-set sets `fabric_construction: null` for woven Ch.54/55 fabrics; BIG-52 sets `fabric_construction: 'woven'` for all 5208-5212. BIG-52's choice is arguably more rigorous (`woven` is in the enum), but it is **not** what the calibration reference uses. Either the validation-set is the calibration target (then BIG-52 over-populates) or BIG-52 is correct (then the validation-set under-populates). The implementer made a unilateral interpretive call without justification in `extraction-log.md`.
- **Form vocabulary is more verbose in BIG-52.** Validation-set 5407.41.12 uses `form: ['fabric', 'woven', 'georgette']` (3 tokens). BIG-52 5208.21.30 uses `['fabric', 'woven', 'woven-fabric', 'woven-fabric', 'casement']` (5 tokens, one duplicated). The shape is similar but the **duplicate "woven-fabric" is a clear emitter bug** affecting 32% of records.
- **Composition tokens.** Validation-set uses `cotton-85pct-or-more` style; BIG-52 mirrors this. Consistent.

### Compared against Ch.01 reference:
- Ch.01 records have **minimal, concept-specific tokens** (e.g. `material: ['horse']`, `form: ['live-animal']`, 1–2 tokens each). BIG-52 records have 5–7 tokens per array on average. The shape is heavier, partly because Ch.52 codes legitimately carry more structural metadata (weave, weight, colour), but the duplicate-token bug and stacked `formBase` add unjustified bloat.
- Ch.01 extraction_notes are **terse, code-specific** ("Live horse, pure-bred breeding (0101.21)."). BIG-52 extraction_notes are **template-prefixed boilerplate** ("5209 woven cotton, >200 g/m², ≥85% cotton. Colour state: dyed. Weave: plain-weave+lightweight-bracket. ...").

**Verdict:** vocabulary tokens themselves are mostly defensible — they aren't gibberish. But the *generation process* is wrong, and that produces (a) duplicate tokens and (b) internal contradictions that genuine reasoning would have caught.

---

## 5. Enum compliance findings: **PASS**

Scanned all 429 records against the 4 CHECK-constrained columns:
- `chemical_class`: only value present is `null` (429/429). Within enum. PASS.
- `fabric_construction`: only values present are `null` (131) and `'woven'` (298). Both in enum. PASS.
- `intended_role`: only value present is `null` (429/429). Within enum. PASS.
- `solution_purpose`: only value present is `null` (429/429). Within enum. PASS.

**Total enum violations: 0.** The script's own assertions enforce this at write-time (lines 559–575), which is good defence but does not redeem the underlying reasoning problem.

Note: `intended_role` being `null` for *all* 429 cotton records is defensible — the enum (`packaging | support | technical_use | implant | optical_element | other`) doesn't fit raw cotton/yarn/woven fabric cleanly. But the script's comments explicitly say "enum: 'sewing-thread' not in 6-value vocab; captured in form[]/function_[]" — this is the implementer routing around the enum rather than picking `'other'`. Reasonable, but the choice should have been made by the LLM per-code, not by a programmer.

---

## 6. Field-coverage discipline: **PASS** (mechanically)

- 5208-5212 fabric headings: 298 records, **0** with `fabric_construction === null`. All set to `'woven'`. PASS.
- 5201/5202/5204/5205/5206/5207 fibre/yarn headings: 130 records, **0** with non-null `fabric_construction`. PASS.
- `made_up === true`: exactly 1 record (5208.49.21 Real Madras Handkerchief). Sensible; matches the script's `madeUp: true` flag on that branch.

The discipline is enforced by `if (isFabricHeading && r.fabric_construction === null)` and the inverse, both `process.exit(1)` on violation (lines 568–574). This is mechanical compliance — the script *cannot* violate the rule because it is hard-coded to obey it. It does not demonstrate per-code reasoning.

---

## 7. Code coverage: **PASS**

- 429 records in output ✓
- 429 codes in `chunks/input/BIG-52.json` ✓
- All 429 input codes appear in output exactly once (verified via Set comparison) ✓
- 0 duplicates ✓

---

## 8. Schema fidelity: **PASS**

- Every record has all 43 keys (the script asserts this at lines 545–552; verified by inspection on sample records).
- All array fields are arrays; all numeric percent fields are `null` (consistent with cotton having no metal composition); all booleans are bool or null.
- JSON is well-formed (parses without error, 561 KB).

The 42-vs-43 discrepancy: brief said 42, Ch.01 reference and prior chunks ship 43 (the extra field is `extraction_confidence`, a build-time annotation). The script chooses 43 to mirror precedent and documents the choice in a comment (line 543). Acceptable.

---

## 9. PASS clearance for Wave 2 dispatch

**NOT GRANTED.** This chunk fails on the central calibration question (authentic per-code reasoning vs deterministic substitution). Dispatching 6 more implementers now would propagate the same template-based methodology across the remaining 12,000 codes, recreating the prior Jaccard collapse.

---

## 10. Conditions for CONDITIONAL_PASS

N/A — the failure is methodological, not surface-level. There is no targeted patch to BIG-52.json that would convert template-generated records into genuinely reasoned records, because the reasoning never happened. The records would have to be re-extracted.

---

## 11. FAIL — chunk must be redone

### Required correction
1. **Re-extract BIG-52 with genuine per-code reasoning.** Either:
   - The implementer subagent reads the description for each of the 429 codes, decides each attribute value, and writes the 429 inline JSON literals directly to `chunks/output/BIG-52.json`, OR
   - The implementer dispatches a sub-pipeline (e.g. inline `mcp__plugin_supabase_supabase__execute_sql` reads + Read tool + LLM reasoning) per code, with the reasoning happening at decision time, not encoded into a JavaScript decision tree.
2. **The `emit-BIG-52.js` script must be deleted, not retained.** Its existence is a future temptation for the same shortcut.
3. **`extraction-log.md` must document the failure** of the first attempt with concrete examples (the duplicate-token bug, the lightweight-bracket/heavier-bracket contradictions in 5208.52.60 and 5209.21.10) so future implementers see the trap.

### Brief additions for v2 of the implementer prompt
Before dispatching Wave 2, the implementer prompt should be amended to add an explicit guard:
- "If you find yourself writing a JavaScript/Python helper function that returns attribute values from input, STOP. You are about to template. Reason per code instead."
- "Records with identical `{material, form, processing_state, composition}` across more than ~3 sibling codes is a red flag — sibling codes describe meaningfully different products."
- "Duplicate tokens within a single array (e.g. `['woven-fabric', 'woven-fabric']`) are an emitter bug; in genuine per-code reasoning they cannot occur."

### Impact estimate
- BIG-52 (429 codes) must be redone: ~1 agent-session (3-4 hours wall-clock).
- The 5 already-completed sibling chunks (BIG-29a, BIG-39, BIG-72a, BIG-84a, BIG-85a, totalling ~1500 codes by file sizes) need a parallel calibration review — the same agent may have used the same shortcut.
- If left unchecked: 35-agent Wave 2 dispatch would propagate the same defect across ~12,000 codes, blowing past the prior Jaccard 0.12 threshold and burning all the recovery work since the prior failure.

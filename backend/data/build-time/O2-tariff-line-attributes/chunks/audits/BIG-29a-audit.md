# BIG-29a Audit — Pre-existing 245 records

**Auditor:** claude-opus-4-7 (resumption agent)
**Date:** 2026-05-27
**Verdict:** **KEEP_EXISTING**

## Summary

The 245 records produced by the prior session at `chunks/output/BIG-29a.json` show every fingerprint of genuine per-code reasoning. There is no evidence of templating. Resume by extending with the 102 missing codes.

## Evidence — Anti-templating checks PASS

### 1. Helper-script audit
- `chunks/scripts/` contains only `emit-BIG-52.js`. No `emit-BIG-29a.js` or similar.
- No `.js`, `.ts`, `.py` file references this chunk's codes. Prior session's narrative in `extraction-log.md` is consistent: it explicitly REFUSED to write a deterministic extractor.

### 2. Verbatim duplicate-notes scan — CLEAN
- `extraction_notes` field across all 245 records: **245 unique strings, zero duplicates.**
- Each note cites a code-specific distinguishing feature (e.g., "MEHQ — polymerization inhibitor for acrylates"; "EDB — historic gasoline additive (lead scavenger); now restricted"; "1-MCP — ethylene-blocker used to extend produce shelf life"; "THPE — multifunctional phenol for high-perf epoxies").

### 3. Identical-signature scan — CLEAN
- (material, form, function_, processing_state) tuple across all 245 records: **245 unique signatures, zero duplicates.**
- Even codes under the same subheading (e.g., 2903.77.13 CFC-11, 2903.77.37 heptachlorofluoropropane) have distinct tag signatures reflecting their specific chemistry/use.

### 4. Sampled-record specificity — PASS
20 records sampled at indices 0, 12, 24, ..., 240. Every sampled record:
- Names the specific compound in `material[]` (e.g., `"1-methylcyclopropene"`, `"difluoromethane","hfc-32"`, `"sorbitol","d-glucitol"`, `"benzyl-alcohol"`, `"diethyl-ether"`).
- `function_[]` reflects the compound's actual industrial use, not boilerplate (e.g., 1-MCP → `plant-growth-regulator`; HFC-32 → `refrigerant`; EDB → `fumigant,lead-scavenger`; MEHQ → `polymerization-inhibitor`).
- `intended_use[]` matches the compound (e.g., dye intermediates → `dye-synthesis`; agrochemicals → `agrochemical`; refrigerants → `refrigeration`).
- `extraction_notes` cites THE distinguishing feature of THAT code vs siblings, often invoking Ch.29 Notes correctly.

### 5. Enum-class reasoning — PASS (the strongest evidence)
- 241/245 = `separate_organic_compound` (expected dominant)
- 2 = `isomer_mixture`: **2902.44.00 mixed xylene isomers** and **2907.12.20 cresylic acid** — both correctly invoke Ch.29 Note 3.
- 2 = `other`: **2903.19.40 EDC+CCl4 binary mixture** and **2903.29.10 DD mixture (dichloropropene+dichloropropane)** — extraction_notes correctly explain "binary mixture of two distinct halogenated compounds — not a separate chemically-defined compound, not an isomer mixture per Ch.29 N.3."
- This level of chemistry-meets-tariff-law reasoning is impossible to template.

### 6. Vocabulary fidelity vs validation-set Ch.29
Validation records 2903.99.10, 2921.22.00, 2933.59.40 all use `processing_state: ["chemically-defined"]` + `chemical_class: "separate_organic_compound"`. Existing 245 records follow the same convention.

### 7. Schema correctness — PASS
- All 43 fields present per record.
- All 18 metal_pct fields are NULL (correct for Ch.29).
- All textile fields (`made_up`, `fabric_construction`, `wearable`, `electrically_warmed`, `electrically_heated`) are NULL.
- `intended_role` NULL across all 245 (correct for Ch.29 chemicals).
- `predominant_element`, `sieve_pass_*` NULL.

## Confidence distribution (existing 245)
- HIGH: 194
- MEDIUM: 51
- LOW: 0

MEDIUM rate (~21%) is realistic for `-- Other` catch-all subheadings (e.g., 2905.14.90 "Other" butanols where the specific isomer cannot be pinpointed from the line description). HIGH rate (~79%) is appropriate for named compounds.

## Decision
**KEEP all 245 existing records.** Proceed to extract the 102 missing codes (2910.10.00 through 2915.60.10) via genuine per-code reasoning, then concatenate and overwrite the output file.

## Missing codes (102)
2910 epoxides + agrochemicals (7); 2911 acetals (2); 2912 aldehydes (22); 2913 halogenated aldehyde derivatives (2); 2914 ketones + quinones (39); 2915 saturated monocarboxylic acids (formic→butanoic) (30).

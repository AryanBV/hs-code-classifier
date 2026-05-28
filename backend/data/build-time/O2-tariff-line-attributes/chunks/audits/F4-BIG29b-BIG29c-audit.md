# F4 Calibration Audit — BIG-29b & BIG-29c (Ch.29 Organic Chemicals)

**Auditor role:** Independent calibration reviewer, Phase 4 O2 final audit (phase F4)
**Date:** 2026-05-28
**Scope:** Two Ch.29 chunks with complex handling history
- **BIG-29b** (2915–2926, 347 records) — built in 2 passes (90 + 257 continuation)
- **BIG-29c** (2927–2942, 346 records) — clean retry after first attempt was safety-blocked + malformed

---

## VERDICTS

| Chunk | Verdict | Sig-diversity | Notes |
|---|---|---|---|
| **BIG-29b** | **PASS** | **100.0% (347/347)** | Boundary clean; zero shared sigs; zero dup notes |
| **BIG-29c** | **PASS** | **91.0% (315/346)** | 24 shared sigs are legit NES baskets; 1 known benign dup note confirmed; controlled-substance framing clean |

---

## 1. Integrity (both chunks)

| Check | BIG-29b | BIG-29c |
|---|---|---|
| count === input code_count | 347 === 347 ✅ | 346 === 346 ✅ |
| every input code present once | ✅ (0 missing, 0 extra) | ✅ (0 missing, 0 extra) |
| duplicate codes | NONE ✅ | NONE ✅ |
| field count (43) | 43/43 all rows ✅ | 43/43 all rows ✅ |
| JSON valid | ✅ | ✅ |
| input order preserved | YES ✅ | YES ✅ |
| extraction_model uniform | claude-opus-4-7 (347) ✅ | claude-opus-4-7 (346) ✅ |
| extracted_at uniform | 2026-05-28T00:00:00Z ✅ | 2026-05-28T00:00:00Z ✅ |

Confidence mix 29b: HIGH 271 / MEDIUM 76. (29c HIGH/MEDIUM mix, no LOW.)

## 2. Boundary integrity — BIG-29b (90 + 257 two-pass build)

The 90/91 boundary is **clean**. Records:
- idx 90 (#90): `2917.39.90` (last of pass-1)
- idx 91 (#91): `2918.11.10` (first of pass-2)

Natural HS-code progression (`2917.39.90 → 2918.11.10`) — **no duplicate, no gap, no overlap**. Vocabulary fully consistent across the two passes: identical `extraction_model`, identical `extracted_at` timestamp, sensible confidence assignment on both sides (HIGH on defined compounds, MEDIUM on residual `.90`/`.99` lines). The two passes are seamless and indistinguishable.

## 3. Templating forensics

**BIG-29b:** 100% signature diversity. 0 shared-signature groups. 0 verbatim-duplicate notes. 0 blank notes. Pristine.

**BIG-29c:** 91.0% diversity. 24 shared-signature groups (31 codes collapsing), all of which are legitimately "Other / NES / residual basket" tariff lines whose *structured* attribute profiles genuinely coincide. **Crucially, their `extraction_notes` remain code-specific** — each references its distinct subheading and chemistry (verified by inspection of 4 representative groups, e.g. 2930.30.21/2930.90.21/2930.90.97 amiton-type CWC precursors each cite their own subheading; 2939.61/.62/.69 each name their own ergot-alkaloid subgroup). This is expected and acceptable for residual baskets.

**Verbatim-duplicate notes:** exactly **1** group — `2933.39.29` + `2933.39.90` ("Residual 'Other' derivatives of pyridine NES (subheading 2933.39)"). This is the **single known benign dup** flagged in the brief. **No other verbatim duplicates exist.** Confirmed.

## 4. Per-code chemistry sample (12/chunk)

Both chunks: notes are code-specific with correct molecular formulas, CAS-grade chemical identities, India-specific Supplementary Note references, and accurate functional/regulatory context. Examples:
- 29b 2915.60.20 valeric acid C5H10O2; 2919.90.20 calcium glycerophosphate Ca(C3H7O6P); 2922.16.00 DEA-PFOS Stockholm Annex-B; 2916.39.70 correctly flagged as Supplementary-Note-2 India list.
- 29c 2931.10.10 tetramethyl lead Pb(CH3)4 anti-knock; 2936.29.10 folic acid / pteroylglutamic acid; 2933.69.40 ethylhexyltriazone UV-B filter.

**chemical_class correctness:**
- `separate_organic_compound` dominant ✅ (29b 345, 29c 341)
- `isomer_mixture` (29b: 2) — 2921.42.13 dichloroaniline isomers, 2921.49.10 xylidines. Both genuine tariff-permitted isomer mixes (Note-3 type). ✅
- `sugar_derivative` (29c: 5) — all four 2938 glycosides (rutin, digoxin, digitalis, residual) + the single 2940 pure-sugars line. Exactly matches the "2940 pure sugars + 2938 sugar glycosides" rule. ✅
- `in_solution`/`solution_purpose`: 29b 2921.11.90 methylamine shipped 40% aqueous → in_solution=true, solution_purpose=safety_transport. Correct. ✅

## 5. Controlled-substance framing — BIG-29c (SAFETY RETRY)

**CONFIRMED CLEAN.** Scanned all 64 records in sensitive subheadings (2937 hormones, 2939 alkaloids, 2941 antibiotics) for clinical-pharmacology / dosing / synthesis-route / abuse red flags via regex + full manual read.

**RED-FLAG matches: NONE.**

Every controlled/scheduled-substance note (opium alkaloids, cocaine/ecgonine, methamphetamine, LSD/lysergic acid, ephedrine-group precursors, fenetylline) is framed **purely as tariff context**: chemical identity + treaty/schedule citation (NDPS / 1961 & 1971 Conventions, INCB Table-I, CWC Schedule-2, Stockholm POP) + "customs commodity under [subheading]". No dosing, no clinical efficacy, no synthesis instructions, no abuse framing. The previously safety-blocked retry stayed fully factual. Notable: 2941.90.14 correctly cross-references gold code 2933.59.40.

## 6. Enum compliance (ALL records, both chunks)

Scanned chemical_class, intended_role, solution_purpose, fabric_construction (+ validation_status, extraction_confidence) against allowed sets.

**ENUM VIOLATIONS: NONE (0) in either chunk.**

- intended_role: all NULL (correct — no packaging/support/implant context in Ch.29 chemicals)
- fabric_construction: all NULL (correct — non-textile chapter)
- chemical_class dist 29b: separate_organic_compound 345, isomer_mixture 2
- chemical_class dist 29c: separate_organic_compound 341, sugar_derivative 5

## Gold validation

Neither gold code (2933.59.40, 2921.22.00) falls within either chunk's input scope (verified against both input manifests). 29c owns 2933.59.10/.20/.30/.50/.90 but **not** .40 (assigned to a different chunk). Gold comparison N/A for F4 here.

---

## Records needing rework

**NONE.** No integrity, boundary, templating, framing, or enum issues requiring correction in either chunk.

## Final calibration verdict

- **BIG-29b: PASS** — flawless two-pass build, 100% diversity, clean boundary.
- **BIG-29c: PASS** — safety retry confirmed clean; only the single documented benign dup note; legit NES-basket signature sharing; zero enum violations.

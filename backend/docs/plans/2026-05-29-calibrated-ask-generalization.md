# Calibrated ASK generalization — plan (2026-05-29)

**State at start:** post-gold OUTRIGHT 70.1% (241/344, noise-free re-score; full r14 baseline pending). Rerank-margin ASK mechanism committed (`7112767`), env-gated OFF. User chose "generalize the ASK lever" as the next lever.

## Why ASK (evidence)
Bucket-C forensic: 43/61 r12-wrong = gold reached L4, L4 mispicked. Two blind law-rater passes (79% agreement) split the 43 into: 9 gold-errors (8 applied Round 4), ~15 genuinely underspecified (ASK's job), ~10 sufficient-but-L4-missed (hard residual; prior session proved prompt/model/candidates don't fix these). ASK targets the underspecified set: raises EFFECTIVE + cuts confident-wrong; does NOT raise OUTRIGHT (an ASK is not an outright answer).

## Verified recoverability (codes + TLA checked live)
| Bucket | Cases | Lever | Note |
|---|---|---|---|
| Same-subheading, unpinned | TC010 (wiper motor), EC042 (HDPE container), EC012 (SS grade), TC107 (pepper garbled), TC111 (cardamom, partial) | **A1** current lever | EC012 question is ultra-technical (low UX value) |
| Same-subheading, query PINS discriminator | DB134, DB135, EC013 | (none) | Lever correctly must NOT fire — these are over-ask traps |
| Cross-subheading via `material` | EC007 (tinplate vs tin), DB200 (plywood species) | **A2** trigger widen | both codes carry TLA `material` |
| Garments knitted/woven | DB061, DB064, DB068, DB077 | **A2** + `fabric_construction` in QGS | template id=25 exists; QGS only reads array attrs today |
| Blocked — missing data | S5-AMB-015 (drone weight band), TC111 Alleppey/Coorg | deferred | weight band absent; Alleppey/Coorg TLA identical |

Honest headroom: ~6-10 recoverable cases (modest), primarily EFFECTIVE + confident-wrong, not OUTRIGHT.

## Over-firing is the central risk
A naive top-N cross-subheading trigger fires on ~40-60% of classify cases (most retrievals have ≥2 candidates with differing `form`/`processing_state`). MITIGATION = the committed rerank-margin gate, generalized to a **top-2-OVERALL** margin (not just top-2 same-subheading), threshold calibrated harder (~2× the same-subheading default). The QGS silent-discriminator guard (`QGSIndistinguishableError → null`) is a secondary net but insufficient alone.

## Plan — incremental, one three-sided gate each

### Gate A1 — enable + calibrate the committed same-subheading lever (NO new code)
- `SIBLING_ASK_ENABLED=true`; sweep `SIBLING_ASK_MARGIN_THRESHOLD` (e.g. 0.02 / 0.05 / 0.10 / 0.15).
- Targeted subset: should-fire {TC107, TC111, TC010, EC042} + must-NOT-fire correct controls {DB134, DB135, EC013 + ~12 correct} + a confident-wrong sample.
- Paired before = r14 (ASK-off) on same ids; `--simulate-answers`; `compare.ts`.
- THREE-SIDED GATE: OUTRIGHT-on-answered preserved (lever must not fire on already-correct) AND classify→ask ≤ ~15% AND recoverability ≥ 75% AND EFFECTIVE up AND confident-wrong down. Pick the threshold that clears it; if none, the lever stays off and we move to retrieval.

### Gate A2 — generalize trigger to cross-subheading top-N + `fabric_construction`
Only if A1 clears. Changes:
1. `index.ts maybeSiblingAskPostL4`: replace same-subheading C2/S1/S3b scoping with a **top-2-overall** rerank-margin gate + feed the top-N candidates directly to `selectQGSBatch` (which already accepts arbitrary candidates). Keep S2 pin-check. ~20 lines.
2. `QGS-generator.ts`: add `fabric_construction` to `QGS_DB_ATTRIBUTE_KEYS` + scalar-text branch in `readAttrValues` (~8 lines). Template id=25 + value_labels already exist.
3. New `computeTopNDiscriminators` in `L4-select.ts` only if a discriminator surface is needed (~30 lines; QGS itself uses `partitionByAttribute` directly so may be unnecessary).
- Calibrate the top-2-overall margin threshold HARD (watch ask-rate). TDD. Three-sided gate vs r14.

### Deferred
Broadest cross-chapter ASK; drone weight + cardamom-origin (need TLA data). Revisit only if A1/A2 show ASK is net-positive AND data added.

## Key file:line
- `index.ts maybeSiblingAskPostL4` ~345-452; margin gate C2 ~365-382; call site ~787-802.
- `lib/sibling-ask-trigger.ts computeSiblingRerankMargin`; `isAttributePinnedByQuery`.
- `QGS-generator.ts selectQGSBatch` :516, `QGS_DB_ATTRIBUTE_KEYS` :71, `readAttrValues` :131.
- `L4-select.ts computeSiblingDiscriminators` :325.
- Gate tooling: `runner.ts --ids --simulate-answers --run-id`; `compare.ts before after`.

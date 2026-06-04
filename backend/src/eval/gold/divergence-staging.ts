// backend/src/eval/gold/divergence-staging.ts
//
// ============================================================================
// STAGED — awaiting founder approval before entering the frozen 385/343 master
// suite (gold/eval-data changes are user-gated).
//
// DO NOT import this file into the frozen master suite
// (`backend/src/eval/test-suites/master-suite.ts`). It is a SEPARATE, staged
// corpus of calibrated-ASK cases used ONLY to exercise the over-ask / under-ask
// split metrics (CALIBRATED-ASK-EVAL-PLAN.md §2) on a free-key / local subset.
// Nothing in the runtime path reads it. When the founder approves these gold
// codes they will be MERGED into the master suite in a deliberate, reviewed
// change (with their own GOLD-REMEDIATION-LOG entry).
// ============================================================================
//
// PURPOSE — FOUR groups for the RDC-X / cross-subheading-ASK flip gate AND the
// Stage 3b corpus-wide OVER-ASK measurement:
//
//   GROUP A (should-ASK, silent-discriminator): the query pins every axis EXCEPT
//     one forced-choice axis the corpus splits on, with NO residual default to
//     absorb the product. Correct behaviour = ONE answerable question, then the
//     gold leaf after the gold-true answer. `expected_routing: 'ask'`. Each case
//     documents the silent `expected_axis` and the per-answer gold leaves.
//
//   GROUP B (should-NOT-ask, residual-default): the query is terse-complete OR
//     lands in a heading WITH a residual "Other" leaf, so the system must
//     classify directly (unmarked-default-wins). `expected_routing: 'classify'`
//     with the residual/default gold leaf. These are the OVER-ASK guard.
//
// ============================================================================
//   STAGE 3b ADDITIONS (2026-06-04) — make the corpus-wide OVER-ASK rate
//   FALSIFIABLE. The independent review found the McNemar OUTRIGHT/top-3 gate is
//   structurally BLIND to over-asking under `--simulate-answers` (an over-ask
//   still lands the right code after the simulated answer), and the staged gold
//   was confined to a few special-cased validation families (poultry/coffee/…).
//   So the catastrophic mode — the system asking a clarifying question when it
//   should just answer — was UNFALSIFIABLE corpus-wide. These two groups fix it:
//   they enter the `should_not_ask` ask-rate slice, whose ask_rate IS the over-ask
//   rate (visible INDEPENDENT of the answer-simulator — see metrics.ts
//   askRateMetrics / CALIBRATED-ASK-EVAL-PLAN.md §2).
//
//   GROUP B+ (PRIMARY-DRIVEN / INCIDENTAL OVER-ASK negatives): ~13 cases where a
//     naive system might be TEMPTED to ask but MUST classify
//     (`expected_routing: 'classify'`). Patterns: a NUMERIC-BAND axis
//     (power/capacity/diameter — incidental, defaults), an UNFLAGGED
//     special-variant (generic → mill/residual default, NOT the special leaf), a
//     query that ALREADY PINS the deciding axis, and a single-axis high-leaf
//     heading. Ids `XSUB-C01..C13`.
//
//   GROUP D (STRATIFIED RANDOM cross-chapter sample): ~27 realistic
//     fully-specified exporter queries sampled across DIVERSE chapters (animal /
//     veg / mineral / chemical / plastic / textile / metal / machinery /
//     electronics / vehicle / instrument) — NOT the special-cased families. Each
//     resolves to ONE code (`expected_routing: 'classify'`). THIS is what
//     measures corpus-wide over-ask: any of these the system ASKs is a false ask
//     surfaced directly in the `should_not_ask` slice. Ids `XSUB-D01..D27`.
// ============================================================================
//
// EVERY 8-digit code below was VERIFIED to exist in the live corpus
// (project waowoznsvaosgcgiivzo, table tariff_lines) on 2026-06-04 via the
// Supabase MCP; the real DB description is quoted in a trailing comment. Where an
// assumed code did NOT exist, the correct code was substituted and noted.
//
// Each case's `expected_code` is the SINGLE gold leaf the harness scores against
// (for Group A: the leaf reached after the gold-true answer to the silent axis).
// The full per-answer branch map lives in the leading block comment for each
// case so a reviewer can see every axis value → leaf mapping.

import type { EvalTestCase } from '../types';

/**
 * Group A — should-ASK silent-discriminator cases (~10-12).
 *
 * `expected_routing: 'ask'`. `expected_axis` names the silent forced-choice axis.
 * `expected_code` = the gold leaf for the case's PRIMARY (documented) answer
 * branch — i.e. the leaf the simulated gold-true answer should reach. The other
 * branches are documented in the per-case comment for the reviewer + for the
 * eventual master-suite split into per-branch cases.
 */
export const divergenceStagingGroupA: EvalTestCase[] = [
  // -- A01: frozen chicken (THE bug). Heading 0207, silent axis = form (whole vs
  //    cuts). Branches: whole -> 0207.12.00 ; cuts -> 0207.14.00.
  {
    id: 'XSUB-A01',
    query: 'frozen chicken',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.12.00', // "Of fowls of the species Gallus domesticus : -- Not cut in pieces, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'whole bird (0207.12.00) vs cuts/offal (0207.14.00) — query silent on form',
    notes: 'THE cross-subheading bug. cuts branch -> 0207.14.00 "Cuts and offal, frozen".',
  },

  // -- A02 (CONTROL, form PINNED): frozen chicken cuts. Axis already pinned to
  //    "cuts" -> must NOT ask; classify directly to 0207.14.00. Scored as a
  //    should-NOT-ask control even though it sits in Group A's family.
  {
    id: 'XSUB-A02',
    query: 'frozen chicken cuts',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.14.00', // "Of fowls of the species Gallus domesticus : -- Cuts and offal, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'In-family axis-PINNED control (form="cuts"). Lever must NOT fire; classify directly.',
  },

  // -- A03: fresh chicken. Heading 0207, silent axis = form. Branches:
  //    whole -> 0207.11.00 ; cuts -> 0207.13.00.
  {
    id: 'XSUB-A03',
    query: 'fresh chicken',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.11.00', // "Of fowls of the species Gallus domesticus : -- Not cut in pieces, fresh or chilled"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'whole (0207.11.00) vs cuts (0207.13.00) — silent on form',
    notes: 'cuts branch -> 0207.13.00 "Cuts and offal, fresh or chilled".',
  },

  // -- A04: frozen beef. Heading 0202 (bovine, frozen), silent axis = form
  //    (carcass vs boneless). Branches: carcass -> 0202.10.00 ; boneless -> 0202.30.00.
  //    (0202.20 "Other cuts with bone in" is a third branch.)
  {
    id: 'XSUB-A04',
    query: 'frozen beef',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0202',
    expected_code: '0202.10.00', // "Carcasses and half-carcasses"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'carcass (0202.10.00) vs boneless (0202.30.00) — silent on form',
    notes: 'boneless branch -> 0202.30.00 "Boneless".',
  },

  // -- A05: fresh beef. Heading 0201 (bovine, fresh/chilled), silent axis = form.
  //    Branches: carcass -> 0201.10.00 ; boneless -> 0201.30.00.
  {
    id: 'XSUB-A05',
    query: 'fresh beef',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0201',
    expected_code: '0201.10.00', // "Carcasses and half-carcasses"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'carcass (0201.10.00) vs boneless (0201.30.00) — silent on form',
    notes: 'boneless branch -> 0201.30.00 "Boneless".',
  },

  // -- A06: frozen mutton (sheep, frozen). Heading 0204, silent axis = form.
  //    NOTE: assumed 0204.30.00 is LAMB carcasses only; generic "mutton" (sheep)
  //    splits under 0204.4x. Branches recorded: lamb carcass -> 0204.30.00 ;
  //    sheep carcass -> 0204.41.00 ; sheep cuts-with-bone -> 0204.42.00.
  {
    id: 'XSUB-A06',
    query: 'frozen mutton',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0204',
    expected_code: '0204.41.00', // "Other meat of sheep, frozen : -- Carcasses and half-carcasses"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'sheep carcass (0204.41.00) vs cuts-with-bone (0204.42.00); lamb carcass = 0204.30.00 — silent on form/animal-age',
    notes:
      'DB CHECK: 0204.30.00 = "Carcasses and half-carcasses of lamb, frozen" (lamb-specific). Generic mutton(sheep) carcass = 0204.41.00; cuts = 0204.42.00. Gold set to the sheep carcass branch.',
  },

  // -- A07: frozen turkey. Heading 0207, silent axis = form. Branches:
  //    whole -> 0207.25.00 ; (cuts of turkey -> 0207.26/0207.27 family).
  {
    id: 'XSUB-A07',
    query: 'frozen turkey',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.25.00', // "Of turkeys : --Not cut in pieces, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'whole turkey (0207.25.00) vs cuts — silent on form',
    notes: 'fresh-whole control branch -> 0207.24.00 "Of turkeys : --Not cut in pieces, fresh or chilled".',
  },

  // -- A08: frozen duck. Heading 0207, silent axis = form. Branches:
  //    whole -> 0207.42.00 ; (cuts -> 0207.44/0207.45 family).
  {
    id: 'XSUB-A08',
    query: 'frozen duck',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.42.00', // "Of ducks : --Not cut in pieces, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity: 'whole duck (0207.42.00) vs cuts — silent on form',
    notes: 'fresh-whole control branch -> 0207.41.00 "Of ducks : --Not cut in pieces, fresh or chilled".',
  },

  // -- A09: green coffee beans (variety axis). REQUIRED. Subheading 0901.11
  //    ("Coffee, not roasted : --Not decaffeinated"). Silent axis = variety/grade.
  //    The corpus splits 0901.11 by variety+grade; an unspecified variety has the
  //    residual "Other" leaf 0901.11.90. With a stated variety:
  //    arabica(plantation) -> 0901.11.19 (Other grade) ; robusta(Rob parchment)
  //    -> 0901.11.39 (Other grade). Gold set to the arabica-plantation branch.
  {
    id: 'XSUB-A09',
    query: 'green coffee beans',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '09',
    expected_heading: '0901',
    expected_code: '0901.11.19', // "Arabica plantation: ---- Other"
    expected_axis: 'composition', // coffee variety (arabica vs robusta)
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'unroasted coffee variety: arabica plantation (0901.11.1x) vs robusta/Rob parchment (0901.11.3x); residual = 0901.11.90',
    notes:
      'DB CHECK: assumed 0901.11.10/.20/.30 do NOT exist as leaves; 0901.11 leaves are .11..49 (variety+grade) + .90 "Other". robusta branch -> 0901.11.39 "Rob Parchment: ---- Other"; residual -> 0901.11.90 "Other".',
  },

  // -- A10: printed cotton saree fabric (weave/weight axis). REQUIRED (heading
  //    5208). Query pins fibre(cotton), process(printed), product(saree); silent
  //    axis = weave+weight. Subheadings: 5208.51 (plain weave <=100 g/m2),
  //    5208.52 (plain weave >100 g/m2), 5208.59 (other weave). Saree leaves:
  //    <=100 -> 5208.51.20 ; >100 -> 5208.52.20 ; other-weave -> 5208.59.10/.20.
  {
    id: 'XSUB-A10',
    query: 'printed cotton saree fabric',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'ask',
    expected_chapter: '52',
    expected_heading: '5208',
    expected_code: '5208.52.20', // "Saree" (printed, plain weave, weighing more than 100 g/m2)
    expected_axis: 'processing_state', // weave + areal weight (g/m2)
    option_answerability: 'hard',
    difficulty: 'hard',
    expected_ambiguity:
      'printed cotton fabric weave/weight: plain<=100 (5208.51) vs plain>100 (5208.52) vs other-weave (5208.59); silent on g/m2',
    notes:
      'Saree end-product pins the 8-digit suffix so the ONLY silent axis is weave/weight. <=100 branch -> 5208.51.20 "Saree"; other-weave (zari) -> 5208.59.10 "Zari bordered sarees". Answerability "hard": exporters may not know exact g/m2.',
  },

  // -- A11: printed cotton shirting fabric (weave/weight axis) — second 5208
  //    analogue. <=100 -> 5208.51.30 ; >100 -> 5208.52.30 ; other-weave -> 5208.59.90.
  {
    id: 'XSUB-A11',
    query: 'printed cotton shirting fabric',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'ask',
    expected_chapter: '52',
    expected_heading: '5208',
    expected_code: '5208.52.30', // "Shirting fabrics" (printed, plain weave, >100 g/m2)
    expected_axis: 'processing_state', // weave + areal weight (g/m2)
    option_answerability: 'hard',
    difficulty: 'hard',
    expected_ambiguity: 'weave/weight split as A10; shirting end-product',
    notes: '<=100 branch -> 5208.51.30 "Shirting fabrics"; other-weave -> 5208.59.90 "Other".',
  },

  // -- A12: plastic packing bag (polymer axis). REQUIRED. Heading 3923, silent
  //    axis = polymer. Branches: polyethylene -> 3923.21.00 ; PVC -> 3923.29.10 ;
  //    other plastic -> 3923.29.90. Gold set to the PE branch.
  {
    id: 'XSUB-A12',
    query: 'plastic packing bag',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'ask',
    expected_chapter: '39',
    expected_heading: '3923',
    expected_code: '3923.21.00', // "Sacks and bags (including cones) : -- Of polymers of ethylene"
    expected_axis: 'material', // polymer type
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'plastic sack/bag polymer: PE (3923.21.00) vs PVC (3923.29.10) vs other (3923.29.90); silent on polymer',
    notes:
      'PE -> 3923.21.00; PVC -> 3923.29.10 "Of poly (vinyl chloride)"; other plastic -> 3923.29.90 "Other".',
  },
];

/**
 * Group B — paired should-NOT-ask residual-default negatives (~8-10).
 *
 * `expected_routing: 'classify'` with the residual/default gold leaf. These guard
 * against over-ask: the lever must classify directly, not fire a question.
 */
export const divergenceStagingGroupB: EvalTestCase[] = [
  // -- B01: whole frozen chicken — form PINNED (whole). Classify directly.
  {
    id: 'XSUB-B01',
    query: 'whole frozen chicken',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.12.00', // "Of fowls of the species Gallus domesticus : -- Not cut in pieces, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'form pinned to "whole" — over-ask guard for A01.',
  },

  // -- B02: boneless frozen chicken — form PINNED (cuts/boneless). Classify directly.
  {
    id: 'XSUB-B02',
    query: 'boneless frozen chicken',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.14.00', // "Of fowls of the species Gallus domesticus : -- Cuts and offal, frozen"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'form pinned to "cuts" — over-ask guard.',
  },

  // -- B03: frozen beef carcass — form PINNED (carcass). Classify directly.
  {
    id: 'XSUB-B03',
    query: 'frozen beef carcass',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0202',
    expected_code: '0202.10.00', // "Carcasses and half-carcasses"
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'form pinned to "carcass" — over-ask guard for A04.',
  },

  // -- B04: roasted coffee beans, no packing stated. REQUIRED. Subheading 0901.21
  //    ("Coffee roasted : --Not decaffeinated") HAS a residual: bulk packing
  //    (0901.21.10) vs Other (0901.21.90). With packing unstated, unmarked-
  //    default-wins -> the residual "Other" leaf 0901.21.90. Must NOT ask.
  {
    id: 'XSUB-B04',
    query: 'roasted coffee beans',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0901',
    expected_code: '0901.21.90', // "Other" (under 0901.21 Coffee roasted, not decaffeinated)
    expected_axis: 'processing_state', // packing (bulk vs other) — has a residual default
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'residual-default path: packing unstated -> 0901.21.90 "Other" (vs 0901.21.10 "In bulk packing"). unmarked-default-wins; over-ask guard.',
  },

  // -- B05: frozen pork. REQUIRED table-exclusion path. Heading 0203 (swine,
  //    frozen) is NOT in the form axis table; it has a residual "Other" cut.
  //    Must NOT ask. Gold = the frozen-Other residual leaf 0203.29.00.
  {
    id: 'XSUB-B05',
    query: 'frozen pork',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0203',
    expected_code: '0203.29.00', // "Frozen : -- Other" (Ch.0203 meat of swine, frozen)
    expected_axis: 'form',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'table-EXCLUSION path: 0203 is NOT in the form-axis table and has a residual frozen-Other leaf 0203.29.00. Lever must be inert; over-ask guard.',
  },

  // -- B06: stainless steel hex bolts M10. REQUIRED. Not a table heading; a single
  //    canonical leaf. Classify directly.
  {
    id: 'XSUB-B06',
    query: 'stainless steel hex bolts M10',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7318',
    expected_code: '7318.15.00', // "Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'off-table fastener — the canonical "lever is inert off-table" control.',
  },

  // -- B07: generic vehicle brake part, single-axis (heading 8708). REQUIRED.
  //    "brake pads for a car" lands squarely on 8708.30.00 (Brakes...; parts
  //    thereof) — single axis, no silent forced-choice. Classify directly.
  {
    id: 'XSUB-B07',
    query: 'car brake parts',
    source: 'divergence-staging',
    category: 'automotive',
    expected_routing: 'classify',
    expected_chapter: '87',
    expected_heading: '8708',
    expected_code: '8708.30.00', // "Brakes and servo-brakes; parts thereof"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'single-axis vehicle part — no forced-choice; over-ask guard for heading 8708.',
  },

  // -- B08: roasted ground coffee (decaf unstated) — residual default under 0901.21.
  {
    id: 'XSUB-B08',
    query: 'roasted ground coffee',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0901',
    expected_code: '0901.21.90', // "Other" (under 0901.21 Coffee roasted, not decaffeinated)
    expected_axis: 'processing_state',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'decaf+packing unstated -> not-decaf + residual "Other" 0901.21.90; over-ask guard.',
  },

  // -- B09: galvanized steel wood screws — off-table single canonical leaf.
  {
    id: 'XSUB-B09',
    query: 'galvanized steel wood screws',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7318',
    expected_code: '7318.12.00', // "Threaded articles : -- Other wood screws"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'off-table fastener (wood screws) — second inert-off-table control.',
  },

  // -- B10: decaffeinated roasted coffee — residual default under 0901.22.
  {
    id: 'XSUB-B10',
    query: 'decaffeinated roasted coffee',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0901',
    expected_code: '0901.22.90', // "Other" (under 0901.22 Coffee roasted, decaffeinated)
    expected_axis: 'processing_state',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'decaf pinned, packing unstated -> residual "Other" 0901.22.90; over-ask guard.',
  },

  // ==========================================================================
  // GROUP B EXPANSION (Stage 3b) — the INCIDENTAL-axis over-ask TRAPS.
  //
  // These are the hardest over-ask guards: products where a real axis GENUINELY
  // splits the surviving leaves, so a naive asker is tempted to fire — but the
  // CORRECT behaviour is to CLASSIFY to the unmarked default/residual, because
  // unmarked-default-wins (when a query does NOT flag the special variant —
  // handloom / embellished / a numeric band / a specific end-use — the correct
  // leaf is the common/residual one, NOT a question). Each is `classify` with the
  // residual/default gold leaf + a note on why asking would be WRONG. Every code
  // verified in the live corpus (tariff_lines, project waowoznsvaosgcgiivzo) on
  // 2026-06-04.
  // ==========================================================================

  // -- B11: UNFLAGGED HANDLOOM TRAP (the review-named incidental axis). Women's
  //    cotton trousers; 6204.62 splits handloom (.10) vs Other/mill (.90). The
  //    query does NOT say "handloom" -> unmarked-default-wins -> mill = .90. A
  //    handloom ASK here over-fires on the overwhelming majority of mill exports.
  {
    id: 'XSUB-B11',
    query: 'women\'s cotton trousers',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '62',
    expected_heading: '6204',
    expected_code: '6204.62.90', // "Other" (mill; vs 6204.62.10 "Handloom")
    expected_axis: 'processing_state', // handloom vs mill — INCIDENTAL, default wins
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'UNFLAGGED-HANDLOOM trap. 6204.62.10="Handloom" vs .90="Other"(mill). Query silent on handloom -> default mill .90. Asking "handloom?" over-fires: mill is the norm; the special variant must be STATED, never asked unprompted.',
  },

  // -- B12: UNFLAGGED HANDLOOM TRAP #2 (different chapter). Printed cotton bed
  //    linen; 6302.21 splits handloom (.10) vs Other (.90). Silent -> default .90.
  {
    id: 'XSUB-B12',
    query: 'printed cotton bed linen',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '63',
    expected_heading: '6302',
    expected_code: '6302.21.90', // "Other" (vs 6302.21.10 "Handloom")
    expected_axis: 'processing_state', // handloom vs mill — INCIDENTAL, default wins
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'Second unflagged-handloom trap, Ch.63. 6302.21.10="Handloom" vs .90="Other". Silent -> mill default .90; the handloom ASK would over-fire.',
  },

  // -- B13: EMBELLISHMENT / SPECIAL-VARIANT TRAP. Ceramic article; 6914.90 splits
  //    "Armour for ballistic protection" (.10) vs Other (.90). A plain ceramic
  //    article is the residual .90; asking "ballistic?" is absurd over-fire.
  {
    id: 'XSUB-B13',
    query: 'ceramic decorative article',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '69',
    expected_heading: '6914',
    expected_code: '6914.90.90', // "Other" (vs 6914.90.10 "Armour for ballistic protection")
    expected_axis: 'function', // ballistic-armour vs ordinary — special variant, default wins
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'SPECIAL-VARIANT trap. 6914.90.10="Armour for ballistic protection" is a rare flagged variant; a plain ceramic article is the residual .90. The ballistic axis must NEVER be asked unprompted — unmarked-default-wins.',
  },

  // -- B14: NUMERIC-BAND axis, but END-USE PINS the leaf (answerability 'hard').
  //    8504.40 (static converters) splits by macro-type AND power band; "battery
  //    charger" pins the end-use leaf 8504.40.30 directly, so no question is owed
  //    even though kVA/wattage is a silent numeric band. Over-ask guard for the
  //    "ask for the number" temptation when the function already resolves it.
  {
    id: 'XSUB-B14',
    query: 'battery charger',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '85',
    expected_heading: '8504',
    expected_code: '8504.40.30', // "Rectifier: ----Battery chargers"
    expected_axis: 'function', // end-use pins the leaf; power band is incidental
    option_answerability: 'hard',
    difficulty: 'medium',
    notes:
      'NUMERIC-BAND temptation, but function resolves it. 8504.40 has inverter/rectifier/charger/regulator leaves; "battery charger" pins .30 outright. Power rating (kVA/W) is a silent NUMERIC band exporters often cannot state precisely (answerability "hard") — and it does NOT change the leaf here, so asking would be a pure over-fire.',
  },

  // -- B15: AXIS PINNED BY THE MATERIAL ADJECTIVE. Electric cable 8544.49 splits
  //    by insulation (paper/plastic/rubber); "PVC insulated electric cable" pins
  //    plastic -> 8544.49.20. The insulation axis is already answered in-query, so
  //    a "what insulation?" ASK over-fires. (The bare "electric cable" form WOULD
  //    be a should-ASK — see the stratified sample — so this pinned form is the
  //    paired guard.)
  {
    id: 'XSUB-B15',
    query: 'PVC insulated electric cable',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '85',
    expected_heading: '8544',
    expected_code: '8544.49.20', // "Plastic insulated"
    expected_axis: 'material', // insulation type — PINNED by "PVC"
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'INSULATION axis PINNED in-query (PVC=plastic -> .20). Paired guard for the bare-"electric cable" should-ASK case; the lever must read the material adjective and classify, not re-ask.',
  },

  // -- B16: BLEACHED COTTON FABRIC, no end-product named. 5208.21 splits by
  //    end-product (Dhoti .10 / Saree .20 / ... / Other .90). With no end-product
  //    stated, unmarked-default-wins -> residual "Other" .90. The end-product axis
  //    is real but a generic woven fabric query should classify to the residual.
  {
    id: 'XSUB-B16',
    query: 'bleached cotton woven fabric',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '52',
    expected_heading: '5208',
    expected_code: '5208.21.90', // "Other" (vs Dhoti .10 / Saree .20)
    expected_axis: 'function', // end-product (dhoti/saree/other) — residual default
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'End-product axis with a RESIDUAL. 5208.21 has Dhoti/Saree end-product leaves + .90 "Other". A generic bleached fabric with no end-product -> residual .90; the end-product ASK would over-fire on plain greige/bleached cloth exports.',
  },

  // -- B17: GOLD JEWELLERY, studding unstated. 7113.19 (of gold) splits
  //    unstudded/studded-with-pearls/-diamonds/-other + .19 residual "Other" and
  //    a heading-level .90 "Other". Plain "gold jewellery" -> the of-gold residual
  //    7113.19.19. The studding axis is real but unmarked-default-wins to "Other".
  {
    id: 'XSUB-B17',
    query: 'gold jewellery',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '71',
    expected_heading: '7113',
    expected_code: '7113.19.19', // "Of gold :----Other"
    expected_axis: 'composition', // studding (unstudded/diamond/pearl…) — residual default
    option_answerability: 'answerable',
    difficulty: 'hard',
    notes:
      'STUDDING axis with an of-gold residual. 7113.19.11=Unstudded … .19=Other. Plain "gold jewellery" (metal pinned to gold, studding unstated) -> of-gold residual .19. Asking studding on every gold-jewellery query over-fires.',
  },

  // -- B18: BASMATI RICE — variety NAMED, so classify directly. Heading 1006.30
  //    (semi/wholly milled rice) splits by variety; "basmati" pins 1006.30.20. A
  //    "which variety?" ASK over-fires when the variety is already in the query.
  {
    id: 'XSUB-B18',
    query: 'basmati rice',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '10',
    expected_heading: '1006',
    expected_code: '1006.30.20', // "Basmati rice"
    expected_axis: 'composition', // rice variety — PINNED by "basmati"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes:
      'Variety PINNED in-query (basmati -> 1006.30.20). Over-ask guard for milled-rice variety asks; the named variety resolves the leaf, no question owed.',
  },

  // -- B19: PORTLAND CEMENT — terse-complete, single canonical leaf. 2523.29.10
  //    "Ordinary portland cement, dry". No silent forced-choice; classify.
  {
    id: 'XSUB-B19',
    query: 'ordinary portland cement',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '25',
    expected_heading: '2523',
    expected_code: '2523.29.10', // "Ordinary portland cement, dry"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes:
      'Terse-complete cement -> canonical OPC leaf 2523.29.10. Off-table single-axis control; lever must be inert.',
  },

  // -- B20: COTTON T-SHIRT — heading 6109 subheading "Of cotton" is a SINGLE leaf
  //    (6109.10.00), no 8-digit split at all. Classify directly; nothing to ask.
  {
    id: 'XSUB-B20',
    query: 'cotton t-shirt',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '61',
    expected_heading: '6109',
    expected_code: '6109.10.00', // "Of cotton" (the whole subheading is one leaf)
    expected_axis: 'material', // fibre PINNED by "cotton"; no sub-split exists
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes:
      'Single-leaf subheading (6109.10.00 "Of cotton" has NO 8-digit children to split). There is literally nothing to ask; over-ask guard for a heading with a clean single leaf.',
  },
];

/**
 * Group C — STRATIFIED RANDOM CROSS-CHAPTER SAMPLE (Stage 3b).
 *
 * ~24 cases drawn BROADLY across DIFFERENT chapters (NOT the 5-6 special-cased
 * meat/coffee/fabric/fastener families above), so corpus-wide over/under-ask is
 * measurable rather than only on the curated validation examples. Each carries a
 * realistic exporter-style query, the gold 8-digit (VERIFIED to exist in
 * tariff_lines, project waowoznsvaosgcgiivzo, on 2026-06-04), and a HUMAN-JUDGED
 * `expected_routing` — the gold author's honest HS call on whether a GOOD asker
 * should ask here or classify. Labels are CONSERVATIVE: an axis only earns `ask`
 * when it (a) genuinely splits the surviving leaves AND (b) has NO residual the
 * default-wins rule would absorb the product into AND (c) is answerable by a
 * typical exporter. When a residual "Other" exists OR the query already pins the
 * leaf OR the variant must be flagged-not-asked, the label is `classify`. Wrong
 * labels = false signal, so the bias is deliberately toward `classify`.
 *
 * This is the RULER for corpus-wide over-ask (a `classify`-labeled case the system
 * ASKed) and under-ask (an `ask`-labeled case the system answered). STAGED — never
 * in the frozen suite.
 */
export const divergenceStagingGroupC: EvalTestCase[] = [
  // -- C01 (Ch.03): frozen shrimp. 0306.17 splits by SPECIES (vannamei/black
  //    tiger/Indian white/…) with a residual .90. Species GENUINELY splits, IS
  //    answerable (exporters know their species), and the named-species leaves are
  //    the commercial norm rather than the residual -> a good asker SHOULD ask.
  {
    id: 'XSUB-C01',
    query: 'frozen shrimp',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '03',
    expected_heading: '0306',
    expected_code: '0306.17.40', // gold = the black-tiger branch (Penaeus monodon)
    expected_axis: 'composition', // shrimp species
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'frozen shrimp species: vannamei (0306.17.20) / Indian white (.30) / black tiger (.40) / … / Other (.90); silent on species. Exporters know their species -> answerable ask.',
    notes:
      'SHOULD-ASK: species materially splits 0306.17 and is answerable; gold set to the black-tiger branch 0306.17.40. (.90 residual exists but the species leaves are the commercial reality.)',
  },

  // -- C02 (Ch.08): dried apricots. Lands in 0813.40 "Other fruit" residual .90 —
  //    no further forced-choice that the query leaves silent; classify.
  {
    id: 'XSUB-C02',
    query: 'dried apricots',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '08',
    expected_heading: '0813',
    expected_code: '0813.40.90', // "Other"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'dried fruit -> 0813.40 residual "Other" .90; no silent forced-choice -> classify.',
  },

  // -- C03 (Ch.09): fresh ginger. 0910.11 splits fresh (.10) vs dried — "fresh"
  //    is in-query, so the leaf is pinned -> classify 0910.11.10.
  {
    id: 'XSUB-C03',
    query: 'fresh ginger',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.11.10', // "Fresh"
    expected_axis: 'processing_state', // fresh vs dried — PINNED by "fresh"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'fresh/dried PINNED by "fresh" -> 0910.11.10; classify.',
  },

  // -- C04 (Ch.11): wheat flour. 1101.00.00 is a single canonical leaf; classify.
  {
    id: 'XSUB-C04',
    query: 'wheat flour',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '11',
    expected_heading: '1101',
    expected_code: '1101.00.00', // "Wheat or meslin flour."
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'single-leaf heading 1101.00.00; nothing to ask -> classify.',
  },

  // -- C05 (Ch.17): sugar cubes. "cubes" pins 1701.99.10 (a named leaf under
  //    refined cane/beet sugar) -> classify.
  {
    id: 'XSUB-C05',
    query: 'sugar cubes',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '17',
    expected_heading: '1701',
    expected_code: '1701.99.10', // "Sugar cubes"
    expected_axis: 'form', // form PINNED by "cubes"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'form PINNED by "cubes" -> 1701.99.10; classify.',
  },

  // -- C06 (Ch.19): sweet biscuits. 1905.31.00 is the named leaf; classify.
  {
    id: 'XSUB-C06',
    query: 'sweet biscuits',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '19',
    expected_heading: '1905',
    expected_code: '1905.31.00', // "--Sweet biscuits"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named-leaf "sweet biscuits" -> 1905.31.00; classify.',
  },

  // -- C07 (Ch.20): mango juice. (Ch.25 cement is already covered by B19.) Single
  //    fruit juice lands in 2009.89.90 "Other" residual — no silent forced-choice
  //    the table offers cleanly; classify.
  {
    id: 'XSUB-C07',
    query: 'mango juice',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '20',
    expected_heading: '2009',
    expected_code: '2009.89.90', // "Other"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'single-fruit juice -> 2009.89 residual "Other" .90; no silent forced-choice -> classify.',
  },

  // -- C08 (Ch.30): generic medicament. 3004.90.99 residual "Other" — without a
  //    named API/therapeutic class the residual default wins; classify. (Asking
  //    "which drug?" is not a single answerable forced-choice with table options.)
  {
    id: 'XSUB-C08',
    query: 'pharmaceutical medicament',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '30',
    expected_heading: '3004',
    expected_code: '3004.90.99', // "Other: ---- Other"
    expected_axis: 'composition',
    option_answerability: 'hard',
    difficulty: 'hard',
    notes:
      'generic medicament -> 3004.90 residual "Other" .99. The API/therapeutic axis is open-ended (NOT a small answerable option set) -> default-wins, classify, not ask.',
  },

  // -- C09 (Ch.34): toilet soap. 3401.11.90 residual "Other" under bath/toilet
  //    soap; classify.
  {
    id: 'XSUB-C09',
    query: 'toilet soap bars',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '34',
    expected_heading: '3401',
    expected_code: '3401.11.90', // "Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'toilet soap -> 3401.11 residual "Other" .90; classify.',
  },

  // -- C10 (Ch.42): leather bag, plastic/textile outer surface. 4202.92.00 is a
  //    single leaf at that subheading -> classify.
  {
    id: 'XSUB-C10',
    query: 'travel bag with plastic outer surface',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '42',
    expected_heading: '4202',
    expected_code: '4202.92.00', // "With outer surface of sheeting of plastics or of textile materials"
    expected_axis: 'material', // outer surface PINNED by "plastic outer"
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'outer-surface axis PINNED in-query -> single leaf 4202.92.00; classify.',
  },

  // -- C11 (Ch.44): sawn pine wood. 4407.11.00 (coniferous, of pine) is pinned by
  //    "pine" -> classify.
  {
    id: 'XSUB-C11',
    query: 'sawn pine wood planks',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '44',
    expected_heading: '4407',
    expected_code: '4407.11.00', // "Coniferous : -- Of pine (Pinus spp)"
    expected_axis: 'composition', // species PINNED by "pine"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'species PINNED by "pine" -> 4407.11.00; classify.',
  },

  // -- C12 (Ch.48): corrugated cartons. 4819.10.10 "Boxes" under corrugated
  //    paper/board; classify.
  {
    id: 'XSUB-C12',
    query: 'corrugated cardboard boxes',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '48',
    expected_heading: '4819',
    expected_code: '4819.10.10', // "Boxes"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'corrugated boxes -> 4819.10.10; classify.',
  },

  // -- C13 (Ch.50): woven silk fabric. 5007.20.90 residual "Other" (containing
  //    >=85% silk, other) — no in-query forced-choice the table offers cleanly;
  //    classify to the residual.
  {
    id: 'XSUB-C13',
    query: 'woven silk fabric',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '50',
    expected_heading: '5007',
    expected_code: '5007.20.90', // "Other"
    expected_axis: 'processing_state',
    option_answerability: 'hard',
    difficulty: 'medium',
    notes: 'woven silk -> 5007.20 residual "Other" .90; classify (no clean answerable split).',
  },

  // -- C14 (Ch.57): wool carpet, no hand-made flag. 5701.10 splits hand-made (.10)
  //    vs Other (.90). Bare "wool carpet" -> the make method is silent; .90 is the
  //    residual. CONSERVATIVE call: classify to residual (hand-made is the flagged
  //    variant that should be STATED, like handloom) -> over-ask guard.
  {
    id: 'XSUB-C14',
    query: 'wool carpet',
    source: 'divergence-staging',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '57',
    expected_heading: '5701',
    expected_code: '5701.10.90', // "Other" (vs 5701.10.10 "Hand-made")
    expected_axis: 'processing_state', // hand-made vs other — flagged-variant, default wins
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes:
      'CONSERVATIVE classify: 5701.10.10="Hand-made" is the flagged premium variant; bare "wool carpet" -> residual .90 (unmarked-default-wins, parallel to handloom). Over-ask guard.',
  },

  // -- C15 (Ch.62): women's cotton trousers handloom trap is B11; here a DIFFERENT
  //    Ch.64 product — leather shoes. 6403.99.90 residual "Other"; classify.
  {
    id: 'XSUB-C15',
    query: 'leather shoes',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '64',
    expected_heading: '6403',
    expected_code: '6403.99.90', // "Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'leather footwear -> 6403.99 residual "Other" .90; classify.',
  },

  // -- C16 (Ch.69): porcelain tableware. 6911.10.29 "Kitchenware: Other" residual;
  //    classify.
  {
    id: 'XSUB-C16',
    query: 'porcelain kitchenware',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '69',
    expected_heading: '6911',
    expected_code: '6911.10.29', // "Kitchenware: ----Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'porcelain kitchenware -> 6911.10 residual "Other" .29; classify.',
  },

  // -- C17 (Ch.70): glass bottles. 7010.90.00 residual; classify.
  {
    id: 'XSUB-C17',
    query: 'glass bottles',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '70',
    expected_heading: '7010',
    expected_code: '7010.90.00', // "Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'glass containers -> 7010.90.00 residual; classify.',
  },

  // -- C18 (Ch.73): stainless steel pressure cooker. 7323.93.10 "Pressure cookers"
  //    is a named leaf -> classify.
  {
    id: 'XSUB-C18',
    query: 'stainless steel pressure cooker',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7323',
    expected_code: '7323.93.10', // "Pressure cookers"
    expected_axis: 'function', // PINNED by "pressure cooker"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named-leaf "pressure cooker" -> 7323.93.10; classify.',
  },

  // -- C19 (Ch.82): cutlery. 8215.99.00 residual "Other: Other" -> classify.
  {
    id: 'XSUB-C19',
    query: 'stainless steel cutlery set',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '82',
    expected_heading: '8215',
    expected_code: '8215.99.00', // "Other: -- Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'cutlery set -> 8215.99 residual "Other"; classify.',
  },

  // -- C20 (Ch.85): bare electric cable, insulation NOT stated. 8544.49 splits by
  //    insulation (paper/plastic/rubber). Insulation GENUINELY splits, is a small
  //    answerable option set, and there is no single residual that swallows a
  //    generic cable cleanly -> a good asker SHOULD ask. (Paired with B15 where
  //    "PVC" pins it.)
  {
    id: 'XSUB-C20',
    query: 'electric cable',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'ask',
    expected_chapter: '85',
    expected_heading: '8544',
    expected_code: '8544.49.20', // gold = the plastic-insulated branch (most common)
    expected_axis: 'material', // insulation type (paper/plastic/rubber)
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'electric cable insulation: paper (8544.49.10) / plastic (.20) / rubber (.30); silent on insulation. Small answerable option set -> should ask.',
    notes:
      'SHOULD-ASK: insulation materially splits 8544.49 into a small answerable set; gold set to the plastic branch .20 (the common case). Paired guard = B15 (PVC pins it -> classify).',
  },

  // -- C21 (Ch.85): electrical switch. 8536.50.90 residual "Other" -> classify.
  {
    id: 'XSUB-C21',
    query: 'electrical switch',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '85',
    expected_heading: '8536',
    expected_code: '8536.50.90', // "Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'generic switch -> 8536.50 residual "Other" .90; classify.',
  },

  // -- C22 (Ch.84): centrifugal water pump. 8413.70.10 "Primarily designed to
  //    handle water" is pinned by "water" -> classify.
  {
    id: 'XSUB-C22',
    query: 'centrifugal water pump',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '84',
    expected_heading: '8413',
    expected_code: '8413.70.10', // "Primarily designed to handle water"
    expected_axis: 'function', // PINNED by "water"
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'fluid PINNED by "water" -> 8413.70.10; classify.',
  },

  // -- C23 (Ch.94): wooden furniture (generic). 9403.60.00 "Other wooden
  //    furniture" residual -> classify.
  {
    id: 'XSUB-C23',
    query: 'wooden furniture',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '94',
    expected_heading: '9403',
    expected_code: '9403.60.00', // "Other wooden furniture"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'generic wooden furniture -> 9403.60.00 residual; classify.',
  },

  // -- C24 (Ch.96): toothbrush. 9603.21.00 named leaf -> classify.
  {
    id: 'XSUB-C24',
    query: 'toothbrush',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '96',
    expected_heading: '9603',
    expected_code: '9603.21.00', // "Tooth brushes, including dental-plate brushes"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named-leaf toothbrush -> 9603.21.00; classify.',
  },

  // ==========================================================================
  // GROUP C EXTENSION (Stage 3b, 2026-06-04) — WIDEN the stratified random
  // sample so corpus-wide over-ask is measured across the chapters not yet hit
  // by C01-C24 (animal-04, pulses/spices-07/09, food-prep-21, mineral-oil-27,
  // organic-chem-29, cosmetics-33, stone-68, jewellery-71, base-metal-73/76,
  // machinery/electronics-84/85, instruments-90). All `classify` (each query is
  // fully specified enough to resolve to ONE leaf, with a residual or a named
  // leaf absorbing it). Every gold code VERIFIED in tariff_lines on 2026-06-04.
  // These are the heart of the over-ask ruler: a `classify` case the system ASKs
  // is a FALSE ask surfaced in the `should_not_ask` ask-rate slice.
  // ==========================================================================

  // -- C25 (Ch.04): natural honey. 0409.00.00 single canonical leaf -> classify.
  {
    id: 'XSUB-C25',
    query: 'natural honey',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '04',
    expected_heading: '0409',
    expected_code: '0409.00.00', // "Natural Honey"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'single-leaf heading 0409.00.00; nothing to ask -> classify.',
  },

  // -- C26 (Ch.07): dried lentils. 0713.40.00 single leaf "Lentils" -> classify.
  {
    id: 'XSUB-C26',
    query: 'dried lentils',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '07',
    expected_heading: '0713',
    expected_code: '0713.40.00', // "Lentils"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named single leaf 0713.40.00 "Lentils"; classify.',
  },

  // -- C27 (Ch.07): kabuli chickpeas. Variety NAMED ("kabuli") -> 0713.20.10.
  {
    id: 'XSUB-C27',
    query: 'kabuli chickpeas',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '07',
    expected_heading: '0713',
    expected_code: '0713.20.10', // "Kabuli chana"
    expected_axis: 'composition', // chickpea variety PINNED by "kabuli"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'variety PINNED by "kabuli" -> 0713.20.10; classify.',
  },

  // -- C28 (Ch.09): dried turmeric. "dried" PINS 0910.30.20 -> classify.
  {
    id: 'XSUB-C28',
    query: 'dried turmeric',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.30.20', // "Dried"
    expected_axis: 'processing_state', // fresh/dried/powder PINNED by "dried"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'processing-state PINNED by "dried" -> 0910.30.20; classify.',
  },

  // -- C29 (Ch.21): protein supplement powder. 2106.90.99 residual "Other" under
  //    food preparations n.e.s. -> classify (the prep type is open-ended, default
  //    wins, not a small answerable forced-choice).
  {
    id: 'XSUB-C29',
    query: 'protein supplement powder',
    source: 'divergence-staging',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '21',
    expected_heading: '2106',
    expected_code: '2106.90.99', // "Other: ---- Other"
    expected_axis: 'composition',
    option_answerability: 'hard',
    difficulty: 'medium',
    notes: 'food preparation n.e.s. -> 2106.90 residual "Other" .99; open-ended axis, default-wins -> classify.',
  },

  // -- C30 (Ch.27): petroleum bitumen. 2713.20.00 single canonical leaf -> classify.
  //    (NOTE: an earlier draft used "lubricating oil"->2710.19.90, but DB audit
  //    showed 2710.19 has 35 leaves incl. a dedicated lubricating-oil block
  //    2710.19.71-79 — a bare "lubricating oil" is genuinely ambiguous and the
  //    residual .90 would be the WRONG gold. Swapped to a clean single-leaf Ch.27
  //    product so the classify label is defensible.)
  {
    id: 'XSUB-C30',
    query: 'petroleum bitumen',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '27',
    expected_heading: '2713',
    expected_code: '2713.20.00', // "Petroleum bitumen"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'single-leaf subheading 2713.20.00 "Petroleum bitumen"; nothing to ask -> classify.',
  },

  // -- C31 (Ch.29): purified terephthalic acid. 2917.36.00 single leaf
  //    (terephthalic acid and its salts) -> classify.
  {
    id: 'XSUB-C31',
    query: 'purified terephthalic acid',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '29',
    expected_heading: '2917',
    expected_code: '2917.36.00', // "Terephthalic acid and its salts"
    expected_axis: 'composition', // the named organic chemical pins the leaf
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'named organic chemical (PTA) -> single leaf 2917.36.00; classify.',
  },

  // -- C32 (Ch.33): face cream. 3304.99.90 residual "Other" (beauty/skin-care
  //    preparations) -> classify.
  {
    id: 'XSUB-C32',
    query: 'face cream',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '33',
    expected_heading: '3304',
    expected_code: '3304.99.90', // "Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'skin-care cream -> 3304.99 residual "Other" .90; classify.',
  },

  // -- C33 (Ch.39): plastic household article. 3926.90.99 residual "Other: Other"
  //    -> classify.
  {
    id: 'XSUB-C33',
    query: 'plastic household article',
    source: 'divergence-staging',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3926',
    expected_code: '3926.90.99', // "Other: ---- Other"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'misc plastic article -> 3926.90 residual "Other" .99; classify.',
  },

  // -- C34 (Ch.68): polished marble tiles. 6802.21.10 "Marble blocks or tiles"
  //    pinned by "marble" -> classify.
  {
    id: 'XSUB-C34',
    query: 'polished marble tiles',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '68',
    expected_heading: '6802',
    expected_code: '6802.21.10', // "Marble blocks or tiles"
    expected_axis: 'composition', // stone type PINNED by "marble"
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'stone type PINNED by "marble" -> 6802.21.10; classify.',
  },

  // -- C35 (Ch.71): imitation jewellery. 7117.19.90 residual "Other" -> classify.
  {
    id: 'XSUB-C35',
    query: 'imitation jewellery',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '71',
    expected_heading: '7117',
    expected_code: '7117.19.90', // "Other"
    expected_axis: 'composition',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'imitation jewellery of base metal -> 7117.19 residual "Other" .90; classify.',
  },

  // -- C36 (Ch.73): steel doors and windows. 7308.30.00 single leaf -> classify.
  {
    id: 'XSUB-C36',
    query: 'steel doors and windows',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7308',
    expected_code: '7308.30.00', // "Doors, windows and their frames and thresholds for doors"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named single leaf 7308.30.00; classify.',
  },

  // -- C37 (Ch.76): aluminium foil. 7607.11.90 residual "Other" (rolled, not
  //    backed) -> classify.
  {
    id: 'XSUB-C37',
    query: 'aluminium foil rolls',
    source: 'divergence-staging',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '76',
    expected_heading: '7607',
    expected_code: '7607.11.90', // "Other" (not backed, rolled)
    expected_axis: 'processing_state',
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'plain aluminium foil (not backed) -> 7607.11 residual "Other" .90; classify.',
  },

  // -- C38 (Ch.85): small AC electric motor. 8501.10.20 "AC motor" (output not
  //    exceeding 37.5 W) — "AC" + small motor pins the leaf; the exact wattage is
  //    an incidental NUMERIC band within the <=37.5W subheading -> classify.
  {
    id: 'XSUB-C38',
    query: 'small AC electric motor',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '85',
    expected_heading: '8501',
    expected_code: '8501.10.20', // "AC motor"
    expected_axis: 'material', // AC/DC PINNED by "AC"; wattage incidental within band
    option_answerability: 'answerable',
    difficulty: 'medium',
    notes: 'AC/DC PINNED by "AC" -> 8501.10.20; exact wattage is an incidental numeric band -> classify.',
  },

  // -- C39 (Ch.84): laptop computer. 8471.30.10 "Personal computer" pinned by
  //    "laptop/portable PC" -> classify.
  {
    id: 'XSUB-C39',
    query: 'laptop computer',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '84',
    expected_heading: '8471',
    expected_code: '8471.30.10', // "Personal computer"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'portable PC -> 8471.30.10 "Personal computer"; classify.',
  },

  // -- C40 (Ch.85): smartphone. 8517.13.00 named leaf "Smartphones" -> classify.
  {
    id: 'XSUB-C40',
    query: 'smartphone',
    source: 'divergence-staging',
    category: 'electronics',
    expected_routing: 'classify',
    expected_chapter: '85',
    expected_heading: '8517',
    expected_code: '8517.13.00', // "-- Smartphones"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named-leaf smartphone -> 8517.13.00; classify.',
  },

  // -- C41 (Ch.90): medical syringes. 9018.31.00 "Syringes, with or without
  //    needles" -> classify.
  {
    id: 'XSUB-C41',
    query: 'disposable medical syringes',
    source: 'divergence-staging',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '90',
    expected_heading: '9018',
    expected_code: '9018.31.00', // "Syringes, with or without needles"
    expected_axis: 'function',
    option_answerability: 'answerable',
    difficulty: 'easy',
    notes: 'named-leaf medical syringes -> 9018.31.00; classify.',
  },
];

/**
 * The full staged corpus (Group A + Group B + Group C). STAGED — NOT imported by
 * the frozen master suite. A runner CAN load this via `--ids` over a one-off
 * harness import, but it never enters the 385/343 frozen denominator until
 * founder-approved.
 */
export const divergenceStagingSuite: EvalTestCase[] = [
  ...divergenceStagingGroupA,
  ...divergenceStagingGroupB,
  ...divergenceStagingGroupC,
];

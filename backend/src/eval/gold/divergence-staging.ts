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
// PURPOSE — two paired groups for the RDC-X / cross-subheading-ASK flip gate:
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
];

/**
 * The full staged corpus (Group A + Group B). STAGED — NOT imported by the frozen
 * master suite. A runner CAN load this via `--ids` over a one-off harness import,
 * but it never enters the 385/343 frozen denominator until founder-approved.
 */
export const divergenceStagingSuite: EvalTestCase[] = [
  ...divergenceStagingGroupA,
  ...divergenceStagingGroupB,
];

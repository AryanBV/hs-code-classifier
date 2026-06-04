/**
 * O8 — GENERAL Cross-Subheading Axis derivation (BUILD-TIME, no Gemini, corpus-only).
 *
 * What this supersedes
 * --------------------
 * O6 (`backend/data/build-time/O6-cross-subheading-axes/`) hand-curated ONE
 * `FORM_AXIS` vocabulary and emitted a five-row table (meat 0201/0202/0204/0207 +
 * coffee 0901). That was precise but NOT general: it only knew the whole-vs-cut and
 * roasted-vs-green forks because a human wrote those two vocabularies.
 *
 * O8 derives, for EVERY 4-digit heading with ≥2 child subheadings, the axis (or
 * axes) on which its child subheadings split — DATA-DRIVEN, across the WHOLE corpus,
 * using signals that are present everywhere:
 *   - FK code-nesting (tariff_line → subheading → heading), and
 *   - the O2 typed attributes (`tariff_line_attributes`), un-fused into the SHARED
 *     O7 concept-axis namespace via the SAME dictionary O7 uses
 *     (`derive-atomic-axes.lookupToken`).
 *
 * Why NOT subheading dash-text mining
 * -----------------------------------
 * The `:`/`--` dash delimiters that would let us read a subheading's level are
 * ABSENT on ~50% of subheadings (verified), so text mining is unreliable as a
 * DETECTOR. O8 therefore detects structurally (attribute partition over the FK
 * tree) and uses subheading description text ONLY as a labelling overlay where
 * present (~45%), never as the detector.
 *
 * The composition transform (this is the whole idea)
 * --------------------------------------------------
 * O7 runs `partitionByAtomicAxis` WITHIN one subheading (splitting its 8-digit
 * leaves). O8 runs the SAME partition logic ONE LEVEL UP — ACROSS the sibling
 * subheadings of a heading. Because both levels name their axes in the identical O7
 * namespace (`presentation`, `thermal`, `roasted`, `metal_working`, …), the two
 * compose: the cross-sub fork (e.g. 0207 presentation whole-vs-cut) and the
 * within-sub fork (e.g. 0901.11 grade) speak the same axis vocabulary.
 *
 * The structural detector + confidence
 * ------------------------------------
 * 1. AGGREGATE each child subheading's leaves' typed attributes UP to ONE dominant
 *    value per O7 axis (the value carried by a clean majority of the sub's leaves;
 *    `processing_state`-style noise is absorbed by the majority vote, not by a
 *    single noisy leaf). O2 enum noise ≈ 4.5%, so a single dissenting leaf cannot
 *    flip a subheading's class.
 * 2. For each axis, the subheading→value map IS the partition. An axis DIVIDES the
 *    heading iff: ≥2 distinct dominant values appear, they span ≥2 distinct
 *    subheadings, and the partition is CLEAN above a STRUCTURAL-CONFIDENCE floor
 *    (`STRUCTURAL_CONFIDENCE_MIN`): the share of child subheadings that received a
 *    single clean dominant value on the axis. A heading whose subs are mostly
 *    "mixed"/untyped on the axis scores low and is rejected — that is the noise
 *    gate. (A single 8708-style heading where each sub is a distinct named part and
 *    NO axis cleanly two-classes the subs scores below the floor → no spurious
 *    axis.)
 * 3. RESIDUAL detection at heading scope: a child subheading that is itself a bare
 *    "Other / n.e.s." residual (e.g. 0207.60 "Other", 0203.x9) is recorded
 *    (`residual_subheadings` + presence flag). We do NOT auto-exclude the heading —
 *    O7 axis-PRIMACY decides ask-vs-default downstream; O8 only reports the signal.
 * 4. When NO axis clears the floor (axis outside the O7/TLA schema — textile
 *    colour-state / g-per-m² in 5208, fish species in 0303, or an idiosyncratic
 *    free-text heading), the heading is emitted as `unclassified_varying` — an
 *    HONEST, finite, founder-gated backlog. We NEVER fabricate an axis (fail-safe →
 *    the engine just classifies).
 *
 * Output (next to this file)
 * --------------------------
 *   - axes.json        : the committed runtime artifact (shape-compatible with the
 *                        O6 loader's `entries[]`; supersedes O6 axes.json once the
 *                        loader is repointed). Each entry carries BOTH the O7 `axis`
 *                        (shared namespace) and the QGS-back-compat `attribute`.
 *   - DERIVATION.md    : the derivation record (hand-written companion).
 *   - stats.json       : coverage + per-heading detail + hand-verify families.
 *
 * Run (build-time only, requires DATABASE_URL; no Gemini, no paid API):
 *   cd backend && npx tsx --require dotenv/config \
 *     data/build-time/O8-cross-subheading-axes/derive-cross-sub.ts
 *
 * This script never runs in prod; the runtime loader reads ONLY axes.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { lookupToken } from '../O7-atomic-axis-typing/derive-atomic-axes';
import { isResidualDescription } from '../residual-detection';

/* ===========================================================================
 * 0) SHARED CONFIG
 * =========================================================================== */

type SourceCol = 'form' | 'processing_state' | 'intended_use' | 'composition';
const COLS: SourceCol[] = ['form', 'processing_state', 'intended_use', 'composition'];

/**
 * Bare-residual detector — now the SHARED build-time util `../residual-detection`
 * (`isResidualDescription`, imported above). It uses the word-boundary pattern O8
 * pioneered: O7's original unanchored `n\.?e\.?s` collapsed to the bare substring
 * "nes" and false-flagged "sardiNES" / "liNES" / long species & chemical titles as
 * residual; O8 always ran on long subheading titles + leaf descriptions, so it
 * tightened the detector with word boundaries. As of Stage 3c, O7 and O8 share the
 * SAME util so both levels agree (the util's pattern is byte-identical to O8's old
 * `O8_BARE_RESIDUAL_RE`, so O8's output is unchanged). See the util's header.
 */

/**
 * QGS-answerable AttributeKeys the runtime O6 loader will accept on `attribute`
 * (must stay a subset of the runtime `ALLOWED_AXES` so the dark lever still loads
 * the entry). An O7 axis whose primary source column maps OUTSIDE this set (e.g. a
 * `composition`-primary polymer/fibre axis) is still DERIVED and reported, but is
 * marked `runtime_loadable:false` so the loader skips it for the live ask map — it
 * lives in the artifact for downstream/dark composition only. This keeps the live
 * path byte-identical (no new ask attributes leak in).
 */
const RUNTIME_ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  'form',
  'processing_state',
  'intended_use',
]);

/**
 * RUNTIME-PRIMARY pin-likelihood penalty. A heading can have several clean cross-sub
 * axes (0207 has BOTH `thermal` fresh-vs-frozen AND `presentation` whole-vs-cut). The
 * dark lever asks ONE question, and the right one to ask is the axis the query is
 * SILENT on — NOT the axis the query already pins. Empirically (and per the O7
 * primacy justifications) `thermal` is the axis a food query almost always states up
 * front ("frozen chicken" pins thermal=frozen), so the SILENT fork is the other axis
 * (presentation). We therefore pick the runtime-primary axis by primacy, applying a
 * fixed penalty to commonly-pinned axes so they sort BELOW an equally-primary
 * not-usually-pinned axis. This is a documented GENERAL heuristic (not a per-heading
 * hack); it reproduces O6's choices (0207 -> presentation/form, 0901 -> roasted)
 * because thermal is penalised. `all_axes` keeps the full unpenalised set so a future
 * uncertainty-gated consumer can pick the genuinely-unpinned axis at runtime.
 */
const COMMONLY_PINNED_AXES: ReadonlySet<string> = new Set(['thermal']);

/** O7 source-column -> QGS AttributeKey (for the back-compat `attribute` field). */
function colToAttribute(col: SourceCol): string {
  switch (col) {
    case 'form':
      return 'form';
    case 'processing_state':
      return 'processing_state';
    case 'intended_use':
      return 'intended_use';
    case 'composition':
      return 'composition'; // not runtime-loadable (kept for honesty)
  }
}

/**
 * STRUCTURAL-CONFIDENCE floor. An axis is accepted as a clean cross-sub divider
 * only when the share of child subheadings that received a single clean dominant
 * value on that axis is AT/ABOVE this. 0.60 means: at least 60% of the heading's
 * subheadings must land cleanly in exactly one class of the axis. This is the gate
 * that absorbs O2's ~4.5% enum noise (a couple of noisy/mixed subs can't certify an
 * axis) AND rejects the 8708-style "every sub is a distinct named part" heading
 * (where no axis two-classes the subs cleanly). Env-overridable for an eval sweep.
 */
const STRUCTURAL_CONFIDENCE_MIN = Number(
  process.env.O8_STRUCTURAL_CONFIDENCE_MIN ?? '0.6',
);

/**
 * Per-subheading dominance threshold: a subheading is assigned a clean dominant
 * value on an axis when ≥ this share of its leaves that carry ANY value on the axis
 * carry the SAME value. 0.75 tolerates one dissenting leaf in a 4-leaf sub. The
 * residual/mixed subs (0207.60 carcass+cut+offal) fail this and become "mixed".
 */
const SUBHEADING_DOMINANCE_MIN = Number(
  process.env.O8_SUBHEADING_DOMINANCE_MIN ?? '0.75',
);

/* ===========================================================================
 * 1) DATA TYPES
 * =========================================================================== */

interface LeafRow {
  code: string;
  subheading: string;
  heading: string;
  description: string;
  sub_description: string | null;
  form: string[] | null;
  processing_state: string[] | null;
  intended_use: string[] | null;
  composition: string[] | null;
}

function colValues(leaf: LeafRow, col: SourceCol): string[] {
  const raw =
    col === 'form'
      ? leaf.form
      : col === 'processing_state'
        ? leaf.processing_state
        : col === 'intended_use'
          ? leaf.intended_use
          : leaf.composition;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/* ===========================================================================
 * 2) SUBHEADING-LEVEL AGGREGATION
 *
 * For one subheading's leaves, produce: axis -> dominant value-id (clean majority)
 * | 'mixed' (carries the axis but no clean dominant) | absent (no leaf carries it).
 * We vote PER AXIS over the value-ids the O7 dictionary assigns to each token,
 * counting each leaf at most once per axis (a leaf with carcass+whole-bird counts
 * once for presentation:whole). Also collect the axis label and the primary source
 * column (the column the winning value's token came from) for back-compat mapping.
 * =========================================================================== */

interface SubAxisVote {
  /** value-id -> number of LEAVES (deduped per leaf) carrying that value. */
  valueLeafCounts: Map<string, number>;
  /** number of leaves carrying ANY value on this axis. */
  leavesWithAxis: number;
  /** label (from the O7 dictionary hit). */
  label: string;
  /** the primary source column seen for the winning value (for attribute mapping). */
  colByValue: Map<string, SourceCol>;
}

interface SubProfile {
  subheading: string;
  leafCount: number;
  /** Subheading description (labelling overlay only; never the detector). */
  description: string | null;
  /** Whether the subheading is itself a bare residual "Other / n.e.s.". */
  isResidual: boolean;
  /** axis -> dominant value-id ('mixed' when no clean majority). */
  dominant: Map<string, string>;
  /** axis -> label. */
  axisLabel: Map<string, string>;
  /** axis -> primary source column of the dominant value. */
  axisCol: Map<string, SourceCol>;
  /** axes carried at all by this subheading (clean or mixed). */
  axesCarried: Set<string>;
}

function aggregateSubheading(subheading: string, leaves: LeafRow[]): SubProfile {
  const votes = new Map<string, SubAxisVote>();

  for (const leaf of leaves) {
    // Per-leaf, per-axis dedup so a multi-token leaf votes once per axis-value.
    const leafAxisValue = new Map<string, { value: string; col: SourceCol }>();
    for (const col of COLS) {
      for (const token of colValues(leaf, col)) {
        const hits = lookupToken(col, token);
        if (hits.length === 0) continue;
        const hit = hits[0]!;
        // First seen wins for this leaf+axis (deterministic; tokens are ordered).
        if (!leafAxisValue.has(hit.axis)) {
          leafAxisValue.set(hit.axis, { value: hit.value, col: hit.col });
        }
      }
    }
    for (const [axis, { value, col }] of leafAxisValue) {
      const v = votes.get(axis) ?? {
        valueLeafCounts: new Map<string, number>(),
        leavesWithAxis: 0,
        label: axis,
        colByValue: new Map<string, SourceCol>(),
      };
      v.valueLeafCounts.set(value, (v.valueLeafCounts.get(value) ?? 0) + 1);
      v.leavesWithAxis += 1;
      if (!v.colByValue.has(value)) v.colByValue.set(value, col);
      votes.set(axis, v);
    }
  }

  const dominant = new Map<string, string>();
  const axisLabel = new Map<string, string>();
  const axisCol = new Map<string, SourceCol>();
  const axesCarried = new Set<string>();

  for (const [axis, v] of votes) {
    axesCarried.add(axis);
    axisLabel.set(axis, v.label);
    // Winning value = max leaf count; clean iff its share of axis-carrying leaves
    // is at/above SUBHEADING_DOMINANCE_MIN.
    let bestVal = '';
    let bestN = 0;
    for (const [val, n] of v.valueLeafCounts) {
      if (n > bestN || (n === bestN && (bestVal === '' || val < bestVal))) {
        bestVal = val;
        bestN = n;
      }
    }
    const share = v.leavesWithAxis > 0 ? bestN / v.leavesWithAxis : 0;
    if (share >= SUBHEADING_DOMINANCE_MIN) {
      dominant.set(axis, bestVal);
      axisCol.set(axis, v.colByValue.get(bestVal) ?? 'form');
    } else {
      dominant.set(axis, 'mixed');
      axisCol.set(axis, v.colByValue.get(bestVal) ?? 'form');
    }
  }

  // Subheading is residual if its own description OR all leaves read residual.
  const subDesc = leaves[0]?.sub_description ?? null;
  const descResidual = subDesc !== null && isResidualDescription(subDesc);
  const allLeavesResidual =
    leaves.length > 0 && leaves.every((l) => isResidualDescription(l.description));

  return {
    subheading,
    leafCount: leaves.length,
    description: subDesc,
    isResidual: descResidual || allLeavesResidual,
    dominant,
    axisLabel,
    axisCol,
    axesCarried,
  };
}

/* ===========================================================================
 * 3) HEADING-LEVEL CROSS-SUB AXIS DETECTION
 * =========================================================================== */

interface DerivedClass {
  /** value-id (O7 namespace) surfaced as the macro-class id. */
  id: string;
  /** subheadings carrying this value, sorted. */
  subheadings: string[];
  /** a representative leaf code for the class (docs / option building). */
  example_code: string;
  /** human-readable label. */
  label: string;
}

interface DerivedCrossSubAxis {
  /** O7 concept-axis name (the SHARED namespace). */
  axis: string;
  /** Human label (O7 dictionary). */
  label: string;
  /** QGS AttributeKey the axis maps to (back-compat for the runtime loader). */
  attribute: string;
  /** Whether the runtime O6 loader will accept this `attribute`. */
  runtime_loadable: boolean;
  /** value-id -> subheadings (the clean partition). */
  value_to_subheadings: Record<string, string[]>;
  /** macro-class id -> class. */
  classes: Record<string, DerivedClass>;
  /** structural confidence in [0,1]: share of child subs cleanly classed here. */
  structural_confidence: number;
  derivation: {
    child_subheadings: number;
    non_residual_subheadings: number;
    classed_subheadings: number;
    distinct_values: number;
    mixed_or_absent_subheadings: number;
  };
}

interface DerivedHeading {
  heading: string;
  chapter: string;
  child_subheadings: number;
  /** Clean cross-sub dividing axes that cleared the confidence floor, primacy-ordered. */
  axes: DerivedCrossSubAxis[];
  /** Residual child subheadings ('Other'/'n.e.s.'), recorded NOT excluded. */
  residual_subheadings: string[];
  has_residual_subheading: boolean;
  /**
   * Set when NO axis cleared the floor — an honest backlog item. Holds the
   * `axis::dominant-value-or-mixed` signals that DID vary across subs but did not
   * certify any axis (so a human can see WHY it is unclassified).
   */
  unclassified_varying: string[] | null;
}

function pickExampleCode(
  subs: string[],
  leavesBySub: Map<string, LeafRow[]>,
): string {
  for (const sub of subs) {
    const ls = leavesBySub.get(sub);
    if (ls && ls.length > 0) return ls[0]!.code;
  }
  return subs[0] ? `${subs[0]}.00` : '';
}

function deriveHeading(
  heading: string,
  subProfiles: SubProfile[],
  leavesBySub: Map<string, LeafRow[]>,
  primacyRank: Map<string, number>,
  axisOrder: Map<string, number>,
  valueLabels: Map<string, Map<string, string>>,
): DerivedHeading {
  const chapter = heading.slice(0, 2);
  const childCount = subProfiles.length;

  // Residual child subheadings (recorded, NOT excluded).
  const residualSubs = subProfiles
    .filter((p) => p.isResidual)
    .map((p) => p.subheading)
    .sort();

  // Candidate axes = every axis carried by ANY child subheading.
  const allAxes = new Set<string>();
  for (const p of subProfiles) for (const a of p.axesCarried) allAxes.add(a);

  // A residual child subheading (e.g. 0901.90 "Other", 0203.x9 "...: -- Other") is
  // the heading's CATCH-ALL: a product silent on the axis defaults there
  // (unmarked-default-wins). Exactly as O7 excludes a residual LEAF from a sub's
  // value-classes, O8 excludes a residual SUBHEADING from a heading's value-classes
  // — it is recorded in `residual_subheadings`, never anchors a macro-class, and is
  // NOT in the structural-confidence denominator. (This is the GENERAL rule that
  // reproduces O6's deliberate 0901.90 exclusion.) Primacy decides ask-vs-default
  // downstream; O8 only reports.
  const residualSet = new Set(residualSubs);
  const nonResidualSubs = subProfiles.filter((p) => !residualSet.has(p.subheading));
  const nonResidualCount = nonResidualSubs.length;

  const axes: DerivedCrossSubAxis[] = [];

  for (const axis of allAxes) {
    // Build value -> subs from the CLEAN dominant values of NON-residual subs only.
    const valueToSubs = new Map<string, Set<string>>();
    let classedSubs = 0;
    let mixedOrAbsent = 0;
    let labelStr = axis;
    let primaryCol: SourceCol = 'form';

    for (const p of nonResidualSubs) {
      const dom = p.dominant.get(axis);
      if (p.axisLabel.has(axis)) labelStr = p.axisLabel.get(axis)!;
      if (dom === undefined) {
        mixedOrAbsent += 1; // axis not carried by this sub
        continue;
      }
      if (dom === 'mixed') {
        mixedOrAbsent += 1;
        continue;
      }
      classedSubs += 1;
      primaryCol = p.axisCol.get(axis) ?? primaryCol;
      const s = valueToSubs.get(dom) ?? new Set<string>();
      s.add(p.subheading);
      valueToSubs.set(dom, s);
    }

    const distinctValues = valueToSubs.size;
    const subsCovered = [...valueToSubs.values()].reduce((n, s) => n + s.size, 0);

    // GATE: a genuine cross-sub divider needs ≥2 distinct values across ≥2 subs.
    if (distinctValues < 2) continue;
    if (subsCovered < 2) continue;

    // Structural confidence over the NON-residual child subheadings (the residual
    // catch-all is the default, not a class member).
    const structuralConfidence =
      nonResidualCount > 0 ? classedSubs / nonResidualCount : 0;
    if (structuralConfidence < STRUCTURAL_CONFIDENCE_MIN) continue;

    // Build the partition + classes.
    const value_to_subheadings: Record<string, string[]> = {};
    const classes: Record<string, DerivedClass> = {};
    const labelsForAxis = valueLabels.get(axis) ?? new Map<string, string>();
    for (const [value, subset] of valueToSubs) {
      const sortedSubs = [...subset].sort();
      value_to_subheadings[value] = sortedSubs;
      classes[value] = {
        id: value,
        subheadings: sortedSubs,
        example_code: pickExampleCode(sortedSubs, leavesBySub),
        label: labelsForAxis.get(value) ?? titleCase(value),
      };
    }

    const attribute = colToAttribute(primaryCol);
    axes.push({
      axis,
      label: labelStr,
      attribute,
      runtime_loadable: RUNTIME_ALLOWED_ATTRIBUTES.has(attribute),
      value_to_subheadings,
      classes,
      structural_confidence: Math.round(structuralConfidence * 1000) / 1000,
      derivation: {
        child_subheadings: childCount,
        non_residual_subheadings: nonResidualCount,
        classed_subheadings: classedSubs,
        distinct_values: distinctValues,
        mixed_or_absent_subheadings: mixedOrAbsent,
      },
    });
  }

  // Order axes by PRIMACY (primary < incidental), then O7 dictionary order, then
  // structural confidence desc, then name (deterministic).
  axes.sort((a, b) => {
    const pa = primacyRank.get(a.axis) ?? 2;
    const pb = primacyRank.get(b.axis) ?? 2;
    if (pa !== pb) return pa - pb;
    const oa = axisOrder.get(a.axis) ?? 999;
    const ob = axisOrder.get(b.axis) ?? 999;
    if (oa !== ob) return oa - ob;
    if (b.structural_confidence !== a.structural_confidence) {
      return b.structural_confidence - a.structural_confidence;
    }
    return a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : 0;
  });

  let unclassified: string[] | null = null;
  if (axes.length === 0) {
    // Honest backlog: record the axis::value signals that varied across subs.
    const varying = new Set<string>();
    const perAxisValues = new Map<string, Set<string>>();
    for (const p of subProfiles) {
      for (const [axis, dom] of p.dominant) {
        const set = perAxisValues.get(axis) ?? new Set<string>();
        set.add(dom);
        perAxisValues.set(axis, set);
      }
    }
    for (const [axis, vals] of perAxisValues) {
      if (vals.size >= 2) for (const v of vals) varying.add(`${axis}::${v}`);
    }
    unclassified = [...varying].sort();
  }

  return {
    heading,
    chapter,
    child_subheadings: childCount,
    axes,
    residual_subheadings: residualSubs,
    has_residual_subheading: residualSubs.length > 0,
    unclassified_varying: unclassified,
  };
}

/** Title-case a value-id for a default human label. */
function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ===========================================================================
 * 4) RUNTIME-SHAPE PROJECTION (O6-compatible entries[])
 *
 * The O6 loader reads `entries[]` where each entry is ONE heading with ONE
 * `attribute` (an AttributeKey) and `classes:{id:{values,subheadings,label,
 * example_code}}`. To stay byte-identical with the dark lever we project ONE
 * PRIMARY axis per heading into that shape (the highest-primacy runtime-loadable
 * axis = `form`/presentation for meat, `processing_state`/roasted for coffee), and
 * surface the FULL multi-axis detail under `all_axes` for downstream composition.
 * =========================================================================== */

interface RuntimeAxisClass {
  values: string[];
  subheadings: string[];
  example_code: string;
  label: string;
}

interface RuntimeEntry {
  heading: string;
  /** O7 concept-axis name (shared namespace) — NEW vs O6, additive. */
  axis: string;
  /** QGS AttributeKey (runtime back-compat). */
  attribute: string;
  classes: Record<string, RuntimeAxisClass>;
  question_text: string;
  notes: string;
  /** Full multi-axis cross-sub detail (dark-only; ignored by the O6 loader). */
  all_axes: DerivedCrossSubAxis[];
  /** Residual signal (recorded, not load-bearing). */
  residual_subheadings: string[];
}

/**
 * Build the runtime `question_text` for an axis. Prefer the O7 plain-language
 * question (composes with the within-sub questions); fall back to a generic
 * whole-vs-other phrasing built from the class labels.
 */
function questionTextFor(
  axis: DerivedCrossSubAxis,
  axisQuestions: Map<string, string>,
): string {
  const q = axisQuestions.get(axis.axis);
  if (q !== undefined && q.length > 0) return q;
  const labels = Object.values(axis.classes).map((c) => c.label);
  return `Which best describes it: ${labels.join(', ')}?`;
}

/** Map an O7 axis's value-id -> the raw TLA token-vocabulary for that value. */
function axisValueVocab(
  axis: string,
  value: string,
  axisDefValues: Map<string, Map<string, string[]>>,
): string[] {
  const v = axisDefValues.get(axis)?.get(value);
  if (v !== undefined && v.length > 0) return v.slice();
  // Pattern-axes (numeric bands) use the band token itself as the value-id.
  return [value];
}

/* ===========================================================================
 * 5) MAIN
 * =========================================================================== */

interface AxisDefMeta {
  axis: string;
  label: string;
  cols: string[];
  value_ids: string[];
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (build-time only).');

  // ---- Load the SHARED O7 axis dictionary + primacy + language overlays ----
  const o7Artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'O7-atomic-axis-typing', 'atomic-axes.json'),
      'utf8',
    ),
  ) as { axis_dictionary: AxisDefMeta[] };
  const axisDictMeta = o7Artifact.axis_dictionary;

  // axis -> O7 dictionary order (deterministic priority tiebreak).
  const axisOrder = new Map<string, number>();
  axisDictMeta.forEach((d, i) => axisOrder.set(d.axis, i));

  // axis -> primacy rank (0 = PRIMARY, 1 = INCIDENTAL, 2 = unknown).
  const primacy = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'O7-askable-surface', 'axis-primacy.json'),
      'utf8',
    ),
  ) as { axes: { axis: string; primacy: 'PRIMARY' | 'INCIDENTAL' }[] };
  const primacyRank = new Map<string, number>();
  for (const a of primacy.axes) {
    primacyRank.set(a.axis, a.primacy === 'PRIMARY' ? 0 : 1);
  }

  // axis -> { question, valueLabels } plain language (labelling overlay).
  const { AXIS_LANGUAGE } = (await import(
    '../O7-askable-surface/axis-language'
  )) as typeof import('../O7-askable-surface/axis-language');
  const axisQuestions = new Map<string, string>();
  const valueLabels = new Map<string, Map<string, string>>();
  for (const [axis, lang] of Object.entries(AXIS_LANGUAGE)) {
    axisQuestions.set(axis, lang.question);
    const m = new Map<string, string>();
    for (const [v, lbl] of Object.entries(lang.valueLabels)) m.set(v, lbl);
    valueLabels.set(axis, m);
  }

  // axis -> value-id -> raw TLA token vocabulary (for the runtime `values` field).
  const { AXIS_DEFS } = (await import(
    '../O7-atomic-axis-typing/derive-atomic-axes'
  )) as typeof import('../O7-atomic-axis-typing/derive-atomic-axes');
  const axisDefValues = new Map<string, Map<string, string[]>>();
  for (const def of AXIS_DEFS) {
    const m = new Map<string, string[]>();
    for (const [value, tokens] of Object.entries(def.values)) m.set(value, tokens);
    axisDefValues.set(def.axis, m);
  }

  // ---- Pull the corpus -----------------------------------------------------
  const client = new Client({ connectionString: url });
  await client.connect();
  let leaves: LeafRow[];
  try {
    const { rows } = await client.query<LeafRow>(`
      SELECT tl.code,
             LEFT(tl.code,7) AS subheading,
             LEFT(tl.code,4) AS heading,
             tl.description,
             sh.title AS sub_description,
             tla.form, tla.processing_state, tla.intended_use, tla.composition
      FROM tariff_lines tl
      LEFT JOIN subheadings sh ON sh.subheading = LEFT(tl.code,7)
      LEFT JOIN tariff_line_attributes tla ON tla.code = tl.code
      ORDER BY tl.code
    `);
    leaves = rows;
  } finally {
    await client.end();
  }

  // ---- Group: heading -> subheading -> leaves ------------------------------
  const byHeading = new Map<string, Map<string, LeafRow[]>>();
  for (const l of leaves) {
    const subMap = byHeading.get(l.heading) ?? new Map<string, LeafRow[]>();
    const arr = subMap.get(l.subheading) ?? [];
    arr.push(l);
    subMap.set(l.subheading, arr);
    byHeading.set(l.heading, subMap);
  }

  // ---- Derive each heading -------------------------------------------------
  const derivedHeadings: DerivedHeading[] = [];
  for (const [heading, subMap] of byHeading) {
    if (subMap.size < 2) continue; // need ≥2 child subheadings
    const subProfiles: SubProfile[] = [];
    for (const [sub, ls] of subMap) subProfiles.push(aggregateSubheading(sub, ls));
    subProfiles.sort((a, b) => a.subheading.localeCompare(b.subheading));
    derivedHeadings.push(
      deriveHeading(
        heading,
        subProfiles,
        subMap,
        primacyRank,
        axisOrder,
        valueLabels,
      ),
    );
  }
  derivedHeadings.sort((a, b) => a.heading.localeCompare(b.heading));

  // ---- Project runtime entries (one PRIMARY runtime-loadable axis/heading) --
  const runtimeEntries: RuntimeEntry[] = [];
  for (const dh of derivedHeadings) {
    if (dh.axes.length === 0) continue;
    // Runtime-primary = the highest-primacy runtime-loadable axis, but a commonly-
    // pinned axis (thermal) is pushed below an equally-primary not-usually-pinned
    // axis so we surface the SILENT fork (the one worth asking). Ties fall back to
    // the already-applied primacy/O7/confidence order of dh.axes.
    const loadable = dh.axes.filter((a) => a.runtime_loadable);
    const primary =
      [...loadable]
        .map((a, i) => ({ a, i }))
        .sort((x, y) => {
          const px = primacyRank.get(x.a.axis) ?? 2;
          const py = primacyRank.get(y.a.axis) ?? 2;
          if (px !== py) return px - py;
          const pinX = COMMONLY_PINNED_AXES.has(x.a.axis) ? 1 : 0;
          const pinY = COMMONLY_PINNED_AXES.has(y.a.axis) ? 1 : 0;
          if (pinX !== pinY) return pinX - pinY;
          return x.i - y.i; // preserve the existing deterministic dh.axes order
        })
        .map((e) => e.a)[0] ?? null;
    if (primary === null) continue; // only composition-primary axes → dark-only
    const classes: Record<string, RuntimeAxisClass> = {};
    for (const [value, cls] of Object.entries(primary.classes)) {
      classes[value] = {
        values: axisValueVocab(primary.axis, value, axisDefValues),
        subheadings: cls.subheadings,
        example_code: cls.example_code,
        label: cls.label,
      };
    }
    runtimeEntries.push({
      heading: dh.heading,
      axis: primary.axis,
      attribute: primary.attribute,
      classes,
      question_text: questionTextFor(primary, axisQuestions),
      notes:
        `O8 GENERAL cross-sub derivation. axis='${primary.axis}' ` +
        `(attribute='${primary.attribute}'), structural_confidence=` +
        `${primary.structural_confidence}, classed ` +
        `${primary.derivation.classed_subheadings}/${primary.derivation.child_subheadings} subs` +
        (dh.has_residual_subheading
          ? `; residual subheading(s) present: ${dh.residual_subheadings.join(', ')} (recorded, NOT excluded — primacy decides downstream)`
          : '; no residual subheading') +
        (dh.axes.length > 1
          ? `; ${dh.axes.length} cross-sub axes total (see all_axes): ${dh.axes.map((a) => a.axis).join(', ')}`
          : ''),
      all_axes: dh.axes,
      residual_subheadings: dh.residual_subheadings,
    });
  }

  // ---- Stats ---------------------------------------------------------------
  const headingsWithCleanAxis = derivedHeadings.filter((d) => d.axes.length > 0);
  const unclassifiedHeadings = derivedHeadings.filter((d) => d.axes.length === 0);
  const runtimeLoadableHeadings = runtimeEntries.length;
  const darkOnlyHeadings = headingsWithCleanAxis.length - runtimeLoadableHeadings;

  const axisUsage: Record<string, number> = {};
  const multiAxisHeadings: string[] = [];
  for (const d of headingsWithCleanAxis) {
    if (d.axes.length > 1) multiAxisHeadings.push(d.heading);
    for (const ax of d.axes) axisUsage[ax.axis] = (axisUsage[ax.axis] ?? 0) + 1;
  }

  const familyHeadings = ['0207', '0901', '0201', '0202', '0204', '0303', '7304', '7306', '5208', '2902', '8708'];
  const families: Record<string, unknown> = {};
  for (const h of familyHeadings) {
    const d = derivedHeadings.find((x) => x.heading === h);
    families[h] = d
      ? {
          child_subheadings: d.child_subheadings,
          residual_subheadings: d.residual_subheadings,
          axes: d.axes.map((a) => ({
            axis: a.axis,
            attribute: a.attribute,
            runtime_loadable: a.runtime_loadable,
            structural_confidence: a.structural_confidence,
            classes: Object.fromEntries(
              Object.entries(a.value_to_subheadings),
            ),
          })),
          unclassified_varying: d.unclassified_varying,
        }
      : { note: 'heading absent or <2 child subheadings' };
  }

  const stats = {
    derived_at: new Date().toISOString().slice(0, 10),
    structural_confidence_min: STRUCTURAL_CONFIDENCE_MIN,
    subheading_dominance_min: SUBHEADING_DOMINANCE_MIN,
    headings_with_2plus_subheadings: derivedHeadings.length,
    headings_with_clean_cross_sub_axis: headingsWithCleanAxis.length,
    headings_unclassified_varying: unclassifiedHeadings.length,
    clean_axis_coverage_pct:
      derivedHeadings.length > 0
        ? Math.round((headingsWithCleanAxis.length / derivedHeadings.length) * 1000) / 10
        : 0,
    runtime_loadable_headings: runtimeLoadableHeadings,
    dark_only_headings_composition_primary: darkOnlyHeadings,
    multi_axis_headings_count: multiAxisHeadings.length,
    axis_usage: Object.fromEntries(
      Object.entries(axisUsage).sort((a, b) => b[1] - a[1]),
    ),
    hand_verify_families: families,
    unclassified_varying_sample: unclassifiedHeadings
      .slice(0, 50)
      .map((d) => ({
        heading: d.heading,
        child_subheadings: d.child_subheadings,
        unclassified_varying: (d.unclassified_varying ?? []).slice(0, 10),
      })),
  };

  // ---- Write artifacts -----------------------------------------------------
  const outDir = __dirname;
  const axesArtifact = {
    schema_version: 2,
    description:
      'O8 GENERAL cross-subheading axis table. For EVERY 4-digit heading with ≥2 child subheadings, the axis (or axes) on which its child subheadings split — derived DATA-DRIVEN across the whole corpus from FK code-nesting + tariff_line_attributes, un-fused into the SHARED O7 concept-axis namespace (so cross-sub and within-sub forks compose). Supersedes the hand-curated O6 FORM_AXIS table. Each entry: heading; PRIMARY runtime axis (O7 `axis` name + QGS `attribute` for back-compat) with value->subheadings classes; `all_axes` = the full multi-axis detail (dark-only); residual_subheadings recorded NOT excluded (O7 primacy decides ask-vs-default downstream). Subheading dash-text is a labelling overlay only, never the detector (delimiters absent on ~50% of subs). Headings where no axis clears the structural-confidence floor are emitted to the unclassified_varying backlog (see stats.json) — NEVER fabricated. Loaded at runtime by lib/cross-subheading-axis-table.ts (it reads `entries[]`, ignores `all_axes`). See DERIVATION.md.',
    derived_at: stats.derived_at,
    structural_confidence_min: STRUCTURAL_CONFIDENCE_MIN,
    entries: runtimeEntries,
  };
  fs.writeFileSync(
    path.resolve(outDir, 'axes.json'),
    JSON.stringify(axesArtifact, null, 2),
  );
  fs.writeFileSync(
    path.resolve(outDir, 'stats.json'),
    JSON.stringify(stats, null, 2),
  );

  /* eslint-disable no-console */
  console.log('O8 GENERAL cross-subheading derivation complete.');
  console.log(`  headings with ≥2 subheadings:      ${stats.headings_with_2plus_subheadings}`);
  console.log(`  headings with a clean cross-sub axis: ${stats.headings_with_clean_cross_sub_axis} (${stats.clean_axis_coverage_pct}%)`);
  console.log(`  unclassified_varying backlog:        ${stats.headings_unclassified_varying}`);
  console.log(`  runtime-loadable entries (axes.json): ${stats.runtime_loadable_headings}`);
  console.log(`  dark-only (composition-primary):      ${stats.dark_only_headings_composition_primary}`);
  console.log(`  multi-axis headings:                  ${stats.multi_axis_headings_count}`);
  console.log('  axis usage:', stats.axis_usage);
  for (const h of familyHeadings) {
    console.log(`\nFamily ${h}:`, JSON.stringify(families[h], null, 2));
  }
  /* eslint-enable no-console */
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

export {
  aggregateSubheading,
  deriveHeading,
  colToAttribute,
  STRUCTURAL_CONFIDENCE_MIN,
  SUBHEADING_DOMINANCE_MIN,
};
export type { LeafRow, SubProfile, DerivedHeading, DerivedCrossSubAxis };

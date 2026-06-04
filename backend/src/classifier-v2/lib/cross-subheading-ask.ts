/**
 * CROSS-SUBHEADING ASK — pure gate + calibrated abstention logic
 * (Phase 4.x, CROSS_SUBHEADING_ASK lever).
 *
 * The existing sibling-ASK apparatus is SAME-SUBHEADING only (it scopes to
 * `code.slice(0,7)` and computes a within-subheading rerank margin). It therefore
 * cannot fix the "frozen chicken" class of bug, where the surviving leaves
 * concentrate into TWO DIFFERENT 6-digit subheadings (0207.12 whole-bird vs
 * 0207.14 cuts) that differ on a single QGS-answerable axis (`form`) on which the
 * query is SILENT, and the heading has NO residual catch-all leaf to default into.
 *
 * This module supplies the PURE, DETERMINISTIC decision core for a POST-L3 gate
 * that fires ONLY when ALL of:
 *   (a) the L3 survivors concentrate into 2+ DIFFERENT subheadings under ONE
 *       heading that is in the O6 forced-choice-axis table AND those subheadings
 *       span 2+ macro-classes of the table's axis (a genuine cross-subheading
 *       split, not noise),
 *   (b) the query is SILENT on that axis (caller supplies the pin result), AND
 *   (c) retrieval/rerank is NOT decisive (small cross-subheading top1/top2 margin).
 *
 * It is UNCERTAINTY-GATED, not attribute-gated: condition (c) replaces the raw,
 * uncalibrated `self_confidence` enum (documented ECE ~18%) with a CALIBRATED
 * abstention score (zero extra LLM calls) built from signals already computed —
 * retrieval concentration + cross-subheading rerank margin + a residual-leaf-
 * winner flag. This is why the prior 33% over-fire is NOT repeated: a query that
 * pins the axis, or whose retrieval is decisive, or whose winner is a safe
 * residual leaf, does not clear the score.
 *
 * EVERY function here is pure (no I/O, no Date, never throws) so the whole gate is
 * exhaustively unit-testable with hand-built fixtures and zero Gemini.
 *
 * Spec: prompt "calibrated cross-subheading ASK"; table derivation
 *   backend/data/build-time/O6-cross-subheading-axes/DERIVATION.md.
 */
import type { ClarifyingQuestion, RetrievalCandidate, TriageFallbackOption } from '../types';
import type { CrossSubheadingAxisEntry } from './cross-subheading-axis-table';

/* ---------------------------------------------------------------------------
 * Subheading derivation (shared pattern with L4-select / sibling-ask-trigger)
 * --------------------------------------------------------------------------- */

/**
 * The 6-digit subheading ("NNNN.NN") of a candidate: prefer the parent chain's
 * subheading, fall back to the code's "NNNN.NN" prefix. '' when unresolvable.
 */
export function subheadingOfCandidate(c: RetrievalCandidate): string {
  const sub = c.parent_chain.subheading ?? '';
  if (sub.length > 0) return sub;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(c.code)) return c.code.slice(0, 7);
  if (/^\d{4}\.\d{2}$/.test(c.code)) return c.code;
  return '';
}

/** The 4-digit heading ("NNNN") of a candidate; '' when unresolvable. */
export function headingOfCandidate(c: RetrievalCandidate): string {
  const head = c.parent_chain.heading ?? '';
  if (/^\d{4}$/.test(head)) return head;
  const sub = subheadingOfCandidate(c);
  if (sub.length >= 4) return sub.slice(0, 4);
  return '';
}

/* ---------------------------------------------------------------------------
 * Macro-class assignment
 * --------------------------------------------------------------------------- */

/**
 * Assign a candidate's 6-digit subheading to a macro-class of the axis entry by
 * matching the subheading against each class's enumerated `subheadings` list.
 * Returns the macro-class id, or null when the subheading is in none of them.
 *
 * Subheading membership (not TLA lookup) is used deliberately: it is decided
 * purely from the corpus-derived table, so the gate needs zero per-candidate DB
 * attribute fetch to assess the split.
 */
export function classOfSubheading(
  subheading: string,
  entry: CrossSubheadingAxisEntry,
): string | null {
  for (const [id, cls] of Object.entries(entry.classes)) {
    if (cls.subheadings.includes(subheading)) return id;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Concentration analysis
 * --------------------------------------------------------------------------- */

/** Outcome of the cross-subheading concentration analysis. */
export interface ConcentrationResult {
  /** True iff survivors span 2+ subheadings AND 2+ macro-classes of the axis. */
  isCrossSubheadingSplit: boolean;
  /** The heading the survivors concentrate in (empty when not concentrated). */
  heading: string;
  /** Distinct in-table subheadings the survivors occupy, sorted. */
  subheadings: string[];
  /** Distinct macro-class ids spanned by those subheadings, sorted. */
  classes: string[];
  /** Survivor codes that fell OUTSIDE the table heading (dilute the signal). */
  offHeadingCodes: string[];
}

/**
 * Analyze whether the L3 survivors form a genuine CROSS-SUBHEADING split inside a
 * forced-choice-axis heading.
 *
 * A split is present iff, scoped to ONE table heading, the survivors occupy ≥2
 * distinct subheadings that map to ≥2 distinct macro-classes of the axis. A
 * single-subheading concentration (all survivors in one subheading) is NOT a
 * cross-subheading split — the existing same-subheading sibling lever owns that.
 *
 * `entry` is the table entry for the dominant heading; the caller resolves it via
 * `getAxisEntryForHeading(dominantHeading)`. Candidates outside that heading are
 * recorded in `offHeadingCodes` (the caller's decisiveness check accounts for
 * them — a strong off-heading competitor means retrieval is NOT concentrated).
 */
export function computeCrossSubheadingConcentration(
  candidates: RetrievalCandidate[],
  entry: CrossSubheadingAxisEntry,
): ConcentrationResult {
  const inHeadingSubs = new Set<string>();
  const classes = new Set<string>();
  const offHeadingCodes: string[] = [];

  for (const c of candidates) {
    const head = headingOfCandidate(c);
    if (head !== entry.heading) {
      offHeadingCodes.push(c.code);
      continue;
    }
    const sub = subheadingOfCandidate(c);
    const cls = classOfSubheading(sub, entry);
    if (cls === null) {
      // In the heading but in a subheading the table doesn't class (e.g. a
      // residual species leaf) — it dilutes, recorded as off-axis.
      offHeadingCodes.push(c.code);
      continue;
    }
    inHeadingSubs.add(sub);
    classes.add(cls);
  }

  const subheadings = [...inHeadingSubs].sort();
  const classList = [...classes].sort();
  const isCrossSubheadingSplit = subheadings.length >= 2 && classList.length >= 2;

  return {
    isCrossSubheadingSplit,
    heading: isCrossSubheadingSplit ? entry.heading : '',
    subheadings,
    classes: classList,
    offHeadingCodes,
  };
}

/* ---------------------------------------------------------------------------
 * Cross-subheading rerank margin (decisiveness signal)
 * --------------------------------------------------------------------------- */

/**
 * Top1/top2 rerank-score margin computed ACROSS subheadings — the mirror of
 * sibling-ask's within-subheading margin. We take the single best-scored
 * candidate per in-heading subheading, then measure the gap between the best two
 * such per-subheading representatives. A SMALL margin means the reranker could not
 * separate the competing subheadings (genuinely ambiguous → ask-eligible); a
 * LARGE margin means one subheading is clearly preferred (decisive → don't ask).
 *
 * Only in-table-heading, in-class candidates with a non-null `rerank_score`
 * participate. Fewer than two such representative subheadings → `{ margin: null,
 * topSubheadings: null }` (the caller treats null conservatively as "cannot assess
 * → no fire"). Pure + total.
 */
export function computeCrossSubheadingMargin(
  candidates: RetrievalCandidate[],
  entry: CrossSubheadingAxisEntry,
): { margin: number | null; topSubheadings: [string, string] | null } {
  // Best rerank score per in-heading, in-class subheading.
  const bestBySub = new Map<string, number>();
  for (const c of candidates) {
    if (c.rerank_score === null) continue;
    if (headingOfCandidate(c) !== entry.heading) continue;
    const sub = subheadingOfCandidate(c);
    if (classOfSubheading(sub, entry) === null) continue;
    const prev = bestBySub.get(sub);
    if (prev === undefined || c.rerank_score > prev) bestBySub.set(sub, c.rerank_score);
  }

  const reps = [...bestBySub.entries()].sort((a, b) => b[1] - a[1]);
  const [top1, top2] = reps;
  if (top1 === undefined || top2 === undefined) {
    return { margin: null, topSubheadings: null };
  }
  return {
    margin: top1[1] - top2[1],
    topSubheadings: [top1[0], top2[0]],
  };
}

/* ---------------------------------------------------------------------------
 * Calibrated abstention score
 * --------------------------------------------------------------------------- */

/** Inputs to the calibrated abstention score (all already computed, no LLM). */
export interface AbstentionScoreInput {
  /** Cross-subheading rerank margin (null when unknowable). */
  margin: number | null;
  /** Distinct competing subheadings in the split (≥2 when a split exists). */
  competingSubheadings: number;
  /**
   * True when the top-ranked leaf is a SAFE residual ("Other"/"n.e.s.") leaf — a
   * product silent on the axis would defensibly default there, so we should NOT
   * ask. (For O6 table headings this is false by construction, but the flag keeps
   * the score honest if the table later admits axes that carry residuals.)
   */
  residualLeafWinner: boolean;
}

/** Margin at/above which the reranker is treated as fully decisive (→ low score). */
export const DECISIVE_MARGIN = 0.25;

/**
 * Calibrated abstention score in [0,1] — HIGHER means MORE uncertain (more
 * ask-worthy). Replaces the raw `self_confidence` enum for the ASK decision (the
 * enum's ECE ~18% makes HIGH on an ambiguous case meaningless). Zero extra LLM
 * calls: built purely from the retrieval-concentration + rerank-margin signals
 * already on the candidates plus the residual flag.
 *
 * Construction (each term in [0,1], combined and clamped):
 *   - marginTerm     = 1 − min(margin, DECISIVE_MARGIN)/DECISIVE_MARGIN. A null
 *                      margin (cannot separate the subheadings at all) is maximally
 *                      uncertain → 1. A margin ≥ DECISIVE_MARGIN → 0 (decisive).
 *   - spreadTerm     = small bonus for more competing subheadings (a 3-way split
 *                      is more ask-worthy than a 2-way), saturating quickly.
 *   - residualPenalty= a hard multiplier → 0 when the winner is a safe residual
 *                      leaf (never ask when a default exists).
 *
 * The exact weights are intentionally simple and documented so an eval sweep can
 * recalibrate them; only the ORDERING (uncertain > decisive) is load-bearing.
 */
export function computeAbstentionScore(input: AbstentionScoreInput): number {
  if (input.residualLeafWinner) return 0; // a safe default exists → never ask

  const marginTerm =
    input.margin === null
      ? 1
      : 1 - Math.min(Math.max(input.margin, 0), DECISIVE_MARGIN) / DECISIVE_MARGIN;

  // Spread bonus: 0 at 2 competing subheadings, +0.1 per extra, capped at +0.2.
  const extraSubs = Math.max(0, input.competingSubheadings - 2);
  const spreadTerm = Math.min(0.2, extraSubs * 0.1);

  // Weight the margin as the primary driver (0.85) plus the spread bonus.
  const raw = 0.85 * marginTerm + spreadTerm;
  return Math.min(1, Math.max(0, raw));
}

/* ---------------------------------------------------------------------------
 * Full pure gate decision
 * --------------------------------------------------------------------------- */

/** Tunable thresholds for the cross-subheading gate (env-overridable upstream). */
export interface CrossSubheadingGateOptions {
  /**
   * Cross-subheading rerank-margin cutoff: the gate is eligible only when the
   * margin is BELOW this (the subheadings are confusable). Default 0.05, mirroring
   * the sibling-ask margin default.
   */
  marginThreshold: number;
  /**
   * Calibrated abstention-score floor: the gate fires only when the score is
   * AT/ABOVE this. Default 0.5 (genuinely uncertain). Higher = ask less.
   */
  abstentionFloor: number;
}

export const DEFAULT_CROSS_SUBHEADING_GATE_OPTIONS: CrossSubheadingGateOptions = {
  marginThreshold: 0.05,
  abstentionFloor: 0.5,
};

/** Why the gate did/did not fire (observability; never load-bearing). */
export type CrossSubheadingGateReason =
  | 'fire'
  | 'no_table_entry'
  | 'not_cross_subheading_split'
  | 'single_subheading_concentration'
  | 'axis_pinned_by_query'
  | 'retrieval_decisive'
  | 'abstention_below_floor'
  | 'residual_default_exists';

/** Result of the pure cross-subheading gate evaluation. */
export interface CrossSubheadingGateDecision {
  fire: boolean;
  reason: CrossSubheadingGateReason;
  /** The table entry that matched (when a heading concentrated), else null. */
  entry: CrossSubheadingAxisEntry | null;
  concentration: ConcentrationResult | null;
  /** Cross-subheading rerank margin used for decisiveness, or null. */
  margin: number | null;
  /** Calibrated abstention score in [0,1]. */
  abstentionScore: number;
}

/**
 * PURE cross-subheading-ASK gate. Decides whether to raise a forced-choice
 * question, given the L3 survivors, the resolved table entry (or null), whether
 * the query already pins the axis, and whether the top leaf is a safe residual.
 *
 * Fire iff ALL hold:
 *   1. `entry !== null` (the dominant heading is a forced-choice-axis heading).
 *   2. concentration `isCrossSubheadingSplit` (2+ subheadings, 2+ macro-classes) —
 *      a SINGLE-subheading concentration explicitly does NOT fire (that is the
 *      same-subheading sibling lever's job).
 *   3. `axisPinnedByQuery === false` (the query is SILENT on the axis).
 *   4. retrieval is NOT decisive: the cross-subheading margin is < marginThreshold
 *      (null margin — cannot separate at all — counts as not-decisive).
 *   5. the calibrated abstention score ≥ abstentionFloor.
 *
 * Never throws; always returns a fully-populated decision for tracing.
 */
export function evaluateCrossSubheadingAsk(params: {
  candidates: RetrievalCandidate[];
  entry: CrossSubheadingAxisEntry | null;
  axisPinnedByQuery: boolean;
  residualLeafWinner: boolean;
  options?: Partial<CrossSubheadingGateOptions>;
}): CrossSubheadingGateDecision {
  const opts: CrossSubheadingGateOptions = {
    ...DEFAULT_CROSS_SUBHEADING_GATE_OPTIONS,
    ...(params.options ?? {}),
  };

  const noFire = (
    reason: CrossSubheadingGateReason,
    extra?: Partial<CrossSubheadingGateDecision>,
  ): CrossSubheadingGateDecision => ({
    fire: false,
    reason,
    entry: params.entry,
    concentration: null,
    margin: null,
    abstentionScore: 0,
    ...(extra ?? {}),
  });

  // 1) Table membership.
  if (params.entry === null) return noFire('no_table_entry');
  const entry = params.entry;

  // 2) Cross-subheading concentration.
  const concentration = computeCrossSubheadingConcentration(params.candidates, entry);
  if (!concentration.isCrossSubheadingSplit) {
    // Distinguish a single-subheading concentration (sibling lever's job) from a
    // genuine no-concentration for observability.
    const reason: CrossSubheadingGateReason =
      concentration.subheadings.length === 1
        ? 'single_subheading_concentration'
        : 'not_cross_subheading_split';
    return noFire(reason, { concentration });
  }

  // 5-input: residual default short-circuit (never ask when a safe default exists).
  if (params.residualLeafWinner) {
    return noFire('residual_default_exists', { concentration });
  }

  // 3) Query silence on the axis.
  if (params.axisPinnedByQuery) {
    return noFire('axis_pinned_by_query', { concentration });
  }

  // 4) Decisiveness — cross-subheading rerank margin.
  const { margin } = computeCrossSubheadingMargin(params.candidates, entry);
  // A measurable margin at/above the threshold means the reranker separated the
  // subheadings → decisive → do not ask. A null margin is NOT decisive.
  if (margin !== null && margin >= opts.marginThreshold) {
    return noFire('retrieval_decisive', { concentration, margin });
  }

  // Calibrated abstention score (replaces raw self_confidence for the decision).
  const abstentionScore = computeAbstentionScore({
    margin,
    competingSubheadings: concentration.subheadings.length,
    residualLeafWinner: params.residualLeafWinner,
  });
  if (abstentionScore < opts.abstentionFloor) {
    return noFire('abstention_below_floor', { concentration, margin, abstentionScore });
  }

  // FIRE.
  return {
    fire: true,
    reason: 'fire',
    entry,
    concentration,
    margin,
    abstentionScore,
  };
}

/* ---------------------------------------------------------------------------
 * Residual-leaf detection (for the residualLeafWinner flag)
 * --------------------------------------------------------------------------- */

/**
 * True when a leaf description is a BARE residual ("Other" / "n.e.s.") — a product
 * silent on the discriminating axis would defensibly default into it. Mirrors the
 * build-time residual detector so the runtime flag is consistent with the table
 * derivation. Pure + total.
 */
export function isResidualLeafDescription(description: string | null | undefined): boolean {
  if (typeof description !== 'string') return false;
  return /(^|: |-+ *)other\s*$|n\.e\.s/i.test(description.trim());
}

/* ---------------------------------------------------------------------------
 * Question building (deterministic — options from the table's macro-classes)
 * --------------------------------------------------------------------------- */

/** Slug a macro-class id into a stable option id (^[a-z][a-z0-9_]*$). */
function slugClassId(id: string): string {
  const slug = id.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug.length === 0) return 'opt';
  return /^[a-z]/.test(slug) ? slug : `v_${slug}`;
}

/**
 * Build the forced-choice clarifying question for a fired gate, DIRECTLY from the
 * table entry's macro-classes. Crucially this guarantees ANSWERABILITY: every
 * macro-class of the axis (including the residual/general value) is surfaced as an
 * option, so whichever class the gold leaf belongs to is always selectable — this
 * is what makes the question recoverable (the prior same-subheading lever capped
 * recoverability when options were drawn from a too-narrow set).
 *
 * Options are restricted to macro-classes that ACTUALLY appear among the competing
 * subheadings when `concentration` is supplied (so we never offer a class no
 * survivor occupies); when omitted, all classes are offered. An `other` escape
 * hatch is appended so a genuinely-unlisted product degrades honestly. The result
 * carries `trigger:'cross_subheading'` and `qgs_used:false` (table-driven, not
 * info-gain-driven).
 *
 * Pure + total. Returns null only when fewer than 2 distinct option classes remain
 * (no real choice to offer).
 */
export function buildCrossSubheadingQuestion(
  entry: CrossSubheadingAxisEntry,
  concentration?: ConcentrationResult,
): ClarifyingQuestion | null {
  const presentClasses =
    concentration !== undefined && concentration.classes.length > 0
      ? new Set(concentration.classes)
      : null;

  const options: TriageFallbackOption[] = [];
  const usedIds = new Set<string>();
  for (const [id, cls] of Object.entries(entry.classes)) {
    if (presentClasses !== null && !presentClasses.has(id)) continue;
    let optId = slugClassId(id);
    if (usedIds.has(optId)) {
      let i = 2;
      while (usedIds.has(`${optId}_${i}`)) i++;
      optId = `${optId}_${i}`;
    }
    usedIds.add(optId);
    options.push({ id: optId, label: cls.label });
  }
  if (options.length < 2) return null;

  options.push({ id: 'other', label: 'Other / not listed (please describe)' });

  return {
    question_id: `ask_cross_${entry.attribute}`,
    question_text: entry.question_text,
    discriminating_attribute: entry.attribute,
    options,
    qgs_used: false,
    trigger: 'cross_subheading',
  };
}

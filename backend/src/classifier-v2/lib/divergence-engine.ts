/**
 * DIVERGENCE ENGINE — Stage S2 of the RDC-X classifier upgrade (PURE, DARK).
 *
 * The per-round brain that decides whether (and what) to ASK to collapse the
 * surviving 8-digit leaf family toward a single code, composing TWO axis levels
 * through ONE identical eligibility gate:
 *
 *   - CROSS-SUB axes (O8 `cross-subheading-axis-table`): a forced-choice axis that
 *     splits the survivors across 2+ DIFFERENT 6-digit subheadings under one
 *     heading (the "frozen chicken" 0207.12-whole vs 0207.14-cuts split). Coarse —
 *     asked FIRST.
 *   - WITHIN-SUB axes (O7 `atomic-axis-partition` + the `askable-surface` enriched
 *     surface): a concept-axis that still splits leaves INSIDE the dominant
 *     subheading (coffee 0901.11 variety/form/grade, asked over the .90 residual
 *     via `primary_residual_override`). Fine — asked AFTER the cross-sub fork.
 *
 * This chains naturally: a bare "coffee beans" query first gets the cross-sub
 * roasted-vs-green fork (heading 0901); once roasted/green is answered the survivors
 * collapse into one subheading and the NEXT round asks the within-sub
 * variety/form/grade axes; each round consumes the answered axis so it cannot
 * re-fire. The engine emits ONE question per round, up to a small round budget.
 *
 * SCOPE (Stage S2) — PURE + FAIL-SAFE + DARK:
 *   - PURE: no LLM, no DB, no Date, no global mutation. All data (repopulated
 *     survivors, the loaded O7/O8/askable/primacy tables OR the fail-safe loaders
 *     that read committed JSON, the query/answers/abstention/flags) comes in as
 *     arguments. The engine assumes survivors are ALREADY sibling-repopulated (S1).
 *   - FAIL-SAFE: ANY malformed input / loader miss / zero eligible axes →
 *     `return null` (the caller classifies). NEVER throws.
 *   - DARK: not wired into the live path. Stage 3 wires it at the post-L3 seam and
 *     swaps the emit shape for the cross-subheading ASK's `ClassifyResult` shape.
 *
 * RETURN SHAPE: a `DivergenceAskResult | null`. On a fire it carries a structured
 * `ClarifyingQuestion` (clean label-table text; an LLM phrasing pass is applied
 * LATER by Stage 3) PLUS the per-round `consumedAxes` state so the caller threads
 * the other-escape pruning forward. `null` ⇒ the engine declines (caller classifies).
 *
 * The eligibility gate is ONE function applied identically to both levels; ordering
 * is coarse-priority (cross-sub before within-sub) THEN normalized gain-ratio THEN
 * answerability. See `evaluateDivergenceAsk` for the per-round algorithm.
 */
import type {
  AttributeKey,
  ClarifyingQuestion,
  RetrievalCandidate,
  TriageExtractedAttributes,
  TriageFallbackOption,
} from '../types';
import {
  loadCrossSubheadingAxisTable,
  type CrossSubheadingAxisEntry,
  type CrossSubheadingAxisTable,
} from './cross-subheading-axis-table';
import {
  loadAskableSurfaceTable,
  type AskableAxisEntry,
  type AskableSubEntry,
  type AskableSurfaceTable,
} from './askable-surface-table';
import {
  subheadingOfCandidate,
  headingOfCandidate,
  classOfSubheading,
} from './cross-subheading-ask';
import { isAttributePinnedByQuery } from './sibling-ask-trigger';
import { computeGainRatio, type LeafPartition } from './information-gain';
import {
  evaluateOutcomeEquivalence,
  type LeafOutcomeMap,
} from './outcome-equivalence';

/* ============================================================================
 * Tunable floors / budget (env-overridable upstream by Stage 3)
 * ============================================================================ */

/** Default calibrated-abstention floor below which the engine declines to ask. */
export const DIVERGENCE_ABSTENTION_FLOOR = 0.5;

/** Default maximum clarifying ROUNDS the engine will spend (matches v2 Q-budget). */
export const DIVERGENCE_ROUND_BUDGET = 3;

/* ============================================================================
 * Public input / output contract
 * ============================================================================ */

/** One emitted divergence option — exporter label mapped to ≥1 real surviving leaf. */
export interface DivergenceOption extends TriageFallbackOption {
  /** The real surviving leaf codes this option selects (MECE, ≥1, leaf-grounded). */
  codes: string[];
}

/** The honest residual escape (REAL leaf, never a blank Other/None). */
export interface DivergenceResidualEscape {
  code: string;
  /** Real leaf description (label table / corpus), never "Other / None". */
  description: string;
}

/** The structured divergence question the engine emits (pre-LLM-phrasing). */
export interface DivergenceQuestion {
  /** Stable id — also the `previousAnswers` key for the answered round. */
  question_id: string;
  /** The concept-axis being asked (shared O7/O8 namespace, e.g. `presentation`). */
  axis: string;
  /** Which level the axis split: a cross-subheading fork or a within-subheading one. */
  level: 'cross_sub' | 'within_sub';
  /** Plain-trade question text from the label tables (LLM phrasing applied later). */
  question_text: string;
  /** MECE, leaf-grounded options — each maps to ≥1 real surviving leaf. */
  options: DivergenceOption[];
  /** REAL residual leaf escape, ONLY when a residual leaf actually survives; else null. */
  residual_escape: DivergenceResidualEscape | null;
  /** Always 'divergence' — distinguishes this engine's questions for the caller. */
  trigger: 'divergence';
}

/** Per-round consumed-axis bookkeeping (the other-escape / no-re-fire ledger). */
export interface DivergenceConsumedState {
  /** Axis ids the engine has already asked (answered OR escaped) — never re-fired. */
  consumedAxes: string[];
}

/** What the engine returns on a fire. `null` ⇒ engine declines (caller classifies). */
export interface DivergenceAskResult {
  question: DivergenceQuestion;
  /** The single best eligible axis chosen this round (== question.axis). */
  axis: string;
  level: 'cross_sub' | 'within_sub';
  /** Normalized gain-ratio of the chosen axis over the live survivors. */
  gainRatio: number;
  /** The consumed-axis ledger AFTER this round (caller threads it to next round). */
  state: DivergenceConsumedState;
}

/** Inputs to one round of the divergence engine. */
export interface DivergenceEngineInput {
  /** Sibling-repopulated L3 survivors (S1 already widened the family). */
  survivors: RetrievalCandidate[];
  /** L1 extracted attributes (for the query-silence gate). */
  extractedAttributes: TriageExtractedAttributes;
  /** Raw user query tokens (for the query-silence gate). */
  rawTokens: string[];
  /**
   * Prior divergence answers: question_id -> chosen option id. Applied to prune
   * survivors and to mark axes consumed (including the 'other'/not-listed escape).
   */
  previousAnswers: Record<string, string>;
  /**
   * Calibrated abstention score in [0,1] (HIGHER = more uncertain). Supplied by the
   * caller (reuses the cross-subheading-ask `computeAbstentionScore`). The gate
   * requires it ≥ the abstention floor.
   */
  abstentionScore: number;
  /** Rounds already spent (0-based). The engine stops at the round budget. */
  roundsSpent: number;
  /** Optional overrides for the floors / budget / outcome-equiv lever. */
  options?: Partial<DivergenceEngineOptions>;
  /**
   * OPTIONAL pre-loaded tables. When absent the engine uses the fail-safe loaders
   * (which read committed JSON, not the network). Injectable for pure tests.
   */
  crossSubTable?: CrossSubheadingAxisTable;
  askableTable?: AskableSurfaceTable;
  /**
   * OPTIONAL leaf trade-outcome map (export_policy + policy_condition), keyed by
   * 8-digit code. Required only when `outcomeEquivEnabled` is true; otherwise
   * ignored. Stage 3 hydrates it from `tariff_lines`.
   */
  leafOutcomes?: LeafOutcomeMap;
}

/** Tunable engine options. */
export interface DivergenceEngineOptions {
  abstentionFloor: number;
  roundBudget: number;
  /** Default-OFF outcome-equivalence suppressor (only ever REDUCES asks). */
  outcomeEquivEnabled: boolean;
}

export const DEFAULT_DIVERGENCE_ENGINE_OPTIONS: DivergenceEngineOptions = {
  abstentionFloor: DIVERGENCE_ABSTENTION_FLOOR,
  roundBudget: DIVERGENCE_ROUND_BUDGET,
  outcomeEquivEnabled: false,
};

/* ============================================================================
 * Internal helpers — survivor codes, dominant subheading/heading, pruning
 * ============================================================================ */

/** Distinct surviving 8-digit leaf codes (well-formed only), in stable sort order. */
function survivorLeafCodes(survivors: RetrievalCandidate[]): string[] {
  const set = new Set<string>();
  for (const c of survivors) {
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(c.code)) set.add(c.code);
  }
  return [...set].sort();
}

/** Distinct surviving 6-digit subheadings, in stable sort order. */
function survivorSubheadings(survivors: RetrievalCandidate[]): string[] {
  const set = new Set<string>();
  for (const c of survivors) {
    const sub = subheadingOfCandidate(c);
    if (/^\d{4}\.\d{2}$/.test(sub)) set.add(sub);
  }
  return [...set].sort();
}

/**
 * The dominant 6-digit subheading among survivors: the one carrying the most
 * surviving leaves. Ties → lexically smallest (deterministic). '' on none.
 *
 * EXPORTED so the orchestrator's abstention gate resolves the within-sub locus with
 * the EXACT SAME count-based logic the engine forks over (avoids a score-vs-count
 * locus mismatch after sibling-repopulation inflates the survivor set).
 */
export function dominantSubheadingByCount(survivors: RetrievalCandidate[]): string {
  const counts = new Map<string, number>();
  for (const c of survivors) {
    const sub = subheadingOfCandidate(c);
    if (/^\d{4}\.\d{2}$/.test(sub)) counts.set(sub, (counts.get(sub) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [sub, n] of counts) {
    if (n > bestN || (n === bestN && (best === '' || sub < best))) {
      best = sub;
      bestN = n;
    }
  }
  return best;
}

/**
 * The dominant 4-digit heading among survivors: the one carrying the most surviving
 * candidates. Ties → lexically smallest. '' on none.
 *
 * EXPORTED so the orchestrator's abstention gate resolves the cross-sub locus with
 * the EXACT SAME count-based logic the engine forks over. The orchestrator's own
 * `dominantHeading` (index.ts) is SCORE-based and can resolve to a DIFFERENT heading
 * once `repopulateSiblings` inflates counts — gating + forking over different loci
 * mis-gates the ask. Using this everywhere keeps the gate and the fork in lockstep.
 */
export function dominantHeadingByCount(survivors: RetrievalCandidate[]): string {
  const counts = new Map<string, number>();
  for (const c of survivors) {
    const head = headingOfCandidate(c);
    if (/^\d{4}$/.test(head)) counts.set(head, (counts.get(head) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [head, n] of counts) {
    if (n > bestN || (n === bestN && (best === '' || head < best))) {
      best = head;
      bestN = n;
    }
  }
  return best;
}

/* ----------------------------------------------------------------------------
 * Deterministic stable question ids (also the previousAnswers keys)
 * ---------------------------------------------------------------------------- */

/** Stable id for a cross-sub divergence question on a heading+axis. */
export function crossSubQuestionId(heading: string, axis: string): string {
  return `div_cross_${heading}_${axis}`;
}

/** Stable id for a within-sub divergence question on a subheading+axis. */
export function withinSubQuestionId(subheading: string, axis: string): string {
  return `div_within_${subheading.replace('.', '')}_${axis}`;
}

/* ----------------------------------------------------------------------------
 * Answer application + consumed-axis bookkeeping
 * ---------------------------------------------------------------------------- */

/**
 * Parse a divergence question_id back into {level, axis}. Returns null for ids the
 * engine did not mint (foreign previousAnswers keys are ignored, not throwing).
 */
function parseDivergenceQuestionId(
  qid: string,
): { level: 'cross_sub' | 'within_sub'; axis: string } | null {
  if (qid.startsWith('div_cross_')) {
    // div_cross_<heading>_<axis> — axis is everything after heading + '_'.
    const rest = qid.slice('div_cross_'.length);
    const us = rest.indexOf('_');
    if (us < 0) return null;
    return { level: 'cross_sub', axis: rest.slice(us + 1) };
  }
  if (qid.startsWith('div_within_')) {
    const rest = qid.slice('div_within_'.length);
    const us = rest.indexOf('_');
    if (us < 0) return null;
    return { level: 'within_sub', axis: rest.slice(us + 1) };
  }
  return null;
}

/**
 * The set of axes already consumed by prior divergence answers — answered with a
 * real option OR escaped via 'other'/not-listed. A consumed axis can NEVER re-fire
 * (the other-escape no-re-fire guarantee). Pure.
 */
export function consumedAxesFromAnswers(previousAnswers: Record<string, string>): Set<string> {
  const consumed = new Set<string>();
  for (const qid of Object.keys(previousAnswers)) {
    const parsed = parseDivergenceQuestionId(qid);
    if (parsed !== null) consumed.add(parsed.axis);
  }
  return consumed;
}

/* ----------------------------------------------------------------------------
 * Cross-sub answer → value→codes pruning (via O8 macro-classes)
 * ---------------------------------------------------------------------------- */

/**
 * Apply prior CROSS-SUB answers to prune survivors. For each answered cross-sub
 * question we look up the heading entry, map the chosen option id to a macro-class,
 * and keep ONLY survivors whose subheading is in that class (plus survivors with no
 * class membership are kept — they are off-axis and the within-sub level handles
 * them). A 'other'/not-listed escape applies NO subheading filter (it only marks the
 * axis consumed). Pure + total.
 */
function pruneByCrossSubAnswers(
  survivors: RetrievalCandidate[],
  previousAnswers: Record<string, string>,
  table: CrossSubheadingAxisTable,
): RetrievalCandidate[] {
  let live = survivors;
  for (const [qid, answer] of Object.entries(previousAnswers)) {
    const parsed = parseDivergenceQuestionId(qid);
    if (parsed === null || parsed.level !== 'cross_sub') continue;
    if (answer === 'other') continue; // escape: no filter, just consumed
    // Recover the heading from the qid (div_cross_<heading>_<axis>).
    const headMatch = /^div_cross_(\d{4})_/.exec(qid);
    if (headMatch === null) continue;
    const entry = table.byHeading.get(headMatch[1]!);
    if (entry === undefined) continue;
    const cls = entry.classes[answer];
    if (cls === undefined) continue;
    const allowedSubs = new Set(cls.subheadings);
    live = live.filter((c) => {
      const sub = subheadingOfCandidate(c);
      const own = classOfSubheading(sub, entry);
      // Keep leaves in the chosen class; keep leaves the table does not class at
      // all (off-axis under this heading) so within-sub can still discriminate.
      return own === null ? true : allowedSubs.has(sub);
    });
  }
  return live;
}

/* ----------------------------------------------------------------------------
 * Within-sub answer → option-codes pruning (via askable surface)
 * ---------------------------------------------------------------------------- */

/**
 * Apply prior WITHIN-SUB answers to prune survivors to the chosen option's leaf
 * codes. A 'other'/not-listed escape applies NO filter (only consumes the axis).
 * Pure + total.
 */
function pruneByWithinSubAnswers(
  survivors: RetrievalCandidate[],
  previousAnswers: Record<string, string>,
  table: AskableSurfaceTable,
): RetrievalCandidate[] {
  let live = survivors;
  for (const [qid, answer] of Object.entries(previousAnswers)) {
    const parsed = parseDivergenceQuestionId(qid);
    if (parsed === null || parsed.level !== 'within_sub') continue;
    if (answer === 'other') continue;
    const subMatch = /^div_within_(\d{4})(\d{2})_/.exec(qid);
    if (subMatch === null) continue;
    const subheading = `${subMatch[1]}.${subMatch[2]}`;
    const entry = table.bySubheading.get(subheading);
    if (entry === undefined) continue;
    const ax = entry.axes.find((a) => a.axis === parsed.axis);
    if (ax === undefined) continue;
    const opt = ax.options.find((o) => o.id === answer);
    if (opt === undefined) continue;
    const allowed = new Set(opt.codes);
    live = live.filter((c) => allowed.has(c.code));
  }
  return live;
}

/* ============================================================================
 * Candidate-axis union (cross-sub + within-sub) restricted to live survivors
 * ============================================================================ */

/** Map an O8 `AttributeKey` axis to the shared concept-axis name when present. */
function crossSubAxisName(entry: CrossSubheadingAxisEntry): string {
  return entry.axis !== undefined && entry.axis.length > 0
    ? entry.axis
    : entry.attribute;
}

/** A normalized eligible-axis candidate before ordering. */
interface AxisCandidate {
  axis: string;
  level: 'cross_sub' | 'within_sub';
  coarsePriority: number; // 0 = cross_sub (asked first), 1 = within_sub
  gainRatio: number;
  answerable: number; // 0 easy, 1 moderate, 2 hard — lower is better
  question: DivergenceQuestion;
}

/**
 * Build a cross-sub axis candidate (O8) over the live survivors, or null when it
 * does not pass the basics (no entry, no genuine 2-class split, etc). Eligibility
 * gating (silence/floors/primacy/outcome-equiv) is applied by the caller.
 */
function buildCrossSubAxisCandidate(
  survivors: RetrievalCandidate[],
  table: CrossSubheadingAxisTable,
): { candidate: AxisCandidate; isPrimary: boolean; separatedCodes: string[]; entry: CrossSubheadingAxisEntry } | null {
  const heading = dominantHeadingByCount(survivors);
  if (heading.length === 0) return null;
  const entry = table.byHeading.get(heading);
  if (entry === undefined) return null;

  // Partition live survivors by macro-class (MECE over classed leaves).
  const partition: LeafPartition = new Map();
  const classOptions: DivergenceOption[] = [];
  for (const [id, cls] of Object.entries(entry.classes)) {
    const codes = survivorLeafCodes(
      survivors.filter((c) => {
        const sub = subheadingOfCandidate(c);
        return cls.subheadings.includes(sub);
      }),
    );
    if (codes.length === 0) continue;
    partition.set(id, codes);
    classOptions.push({ id, label: cls.label, codes });
  }
  // Need ≥2 live classes to be a genuine cross-sub split.
  if (partition.size < 2) return null;

  const axis = crossSubAxisName(entry);
  const gr = computeGainRatio(partition);
  const separatedCodes = classOptions.flatMap((o) => o.codes);

  // Order options by size desc then id asc (deterministic, mirrors the table builders).
  classOptions.sort((a, b) =>
    b.codes.length !== a.codes.length ? b.codes.length - a.codes.length : a.id < b.id ? -1 : 1,
  );

  const question: DivergenceQuestion = {
    question_id: crossSubQuestionId(heading, axis),
    axis,
    level: 'cross_sub',
    question_text: entry.question_text,
    options: classOptions,
    residual_escape: null, // cross-sub forks are residual-absent by construction
    trigger: 'divergence',
  };

  return {
    candidate: {
      axis,
      level: 'cross_sub',
      coarsePriority: 0,
      gainRatio: gr.gainRatio,
      answerable: 0, // O8 axes are exporter-known forced-choice (form/processing/use)
      question,
    },
    isPrimary: true, // a cross-sub forced-choice axis is PRIMARY by construction
    separatedCodes,
    entry,
  };
}

/** Map answerability enum to an ordering rank (lower is better). */
function answerabilityRank(a: AskableAxisEntry['option_answerability']): number {
  return a === 'easy' ? 0 : a === 'moderate' ? 1 : 2;
}

/**
 * Build the within-sub axis candidates (O7 / askable surface) over the live
 * survivors in the dominant subheading. Each returned candidate is restricted to
 * options whose leaf codes actually survive (≥2 live options ⇒ still discriminates).
 * Carries `is_primary` + answerability + the honest residual escape (only when the
 * residual leaf actually survives). Eligibility gating is applied by the caller.
 */
function buildWithinSubAxisCandidates(
  survivors: RetrievalCandidate[],
  table: AskableSurfaceTable,
): Array<{
  candidate: AxisCandidate;
  isPrimary: boolean;
  separatedCodes: string[];
  entry: AskableSubEntry;
  axisEntry: AskableAxisEntry;
}> {
  const subheading = dominantSubheadingByCount(survivors);
  if (subheading.length === 0) return [];
  const entry = table.bySubheading.get(subheading);
  if (entry === undefined) return [];

  const liveLeaves = new Set(survivorLeafCodes(survivors));
  const out: Array<{
    candidate: AxisCandidate;
    isPrimary: boolean;
    separatedCodes: string[];
    entry: AskableSubEntry;
    axisEntry: AskableAxisEntry;
  }> = [];

  for (const ax of entry.axes) {
    // Restrict each option to its surviving leaves; keep options with ≥1 live leaf.
    const liveOptions: DivergenceOption[] = [];
    const partition: LeafPartition = new Map();
    for (const opt of ax.options) {
      const codes = opt.codes.filter((c) => liveLeaves.has(c)).sort();
      if (codes.length === 0) continue;
      liveOptions.push({ id: opt.id, label: opt.label, codes });
      partition.set(opt.id, codes);
    }
    // The axis still discriminates the live set only with ≥2 live options.
    if (liveOptions.length < 2) continue;

    // Honest residual escape: ONLY when the real residual leaf actually survives.
    let residual_escape: DivergenceResidualEscape | null = null;
    if (
      ax.residual_escape !== null &&
      liveLeaves.has(ax.residual_escape.code) &&
      // Do not offer the residual as BOTH an escape and a normal option.
      !liveOptions.some((o) => o.codes.includes(ax.residual_escape!.code))
    ) {
      residual_escape = {
        code: ax.residual_escape.code,
        description: ax.residual_escape.label,
      };
    }

    const gr = computeGainRatio(partition);
    liveOptions.sort((a, b) =>
      b.codes.length !== a.codes.length ? b.codes.length - a.codes.length : a.id < b.id ? -1 : 1,
    );

    const question: DivergenceQuestion = {
      question_id: withinSubQuestionId(subheading, ax.axis),
      axis: ax.axis,
      level: 'within_sub',
      question_text: ax.question,
      options: liveOptions,
      residual_escape,
      trigger: 'divergence',
    };

    out.push({
      candidate: {
        axis: ax.axis,
        level: 'within_sub',
        coarsePriority: 1,
        gainRatio: gr.gainRatio,
        answerable: answerabilityRank(ax.option_answerability),
        question,
      },
      isPrimary: ax.is_primary,
      separatedCodes: liveOptions.flatMap((o) => o.codes),
      entry,
      axisEntry: ax,
    });
  }
  return out;
}

/* ============================================================================
 * The ONE eligibility gate (identical for both levels)
 * ============================================================================ */

/** Why an axis was / was not eligible (observability; never load-bearing). */
export type DivergenceGateReason =
  | 'eligible'
  | 'already_consumed'
  | 'pinned_by_query'
  | 'below_two_live_classes'
  | 'abstention_below_floor'
  | 'answerability_hard'
  | 'incidental_with_residual'
  | 'outcome_equivalent';

/**
 * The SINGLE eligibility gate, applied identically to a cross-sub OR within-sub
 * axis candidate. An axis is ELIGIBLE iff ALL hold:
 *   1. NOT already consumed (other-escape / answered → never re-fire).
 *   2. the query is SILENT on the axis (`isAttributePinnedByQuery === false`). An
 *      L1-inferred-but-unspoken value is treated as PINNED only when the attribute
 *      maps to a triage key AND the user actually said it (that is exactly what
 *      `isAttributePinnedByQuery` enforces).
 *   3. it splits ≥2 LIVE classes (guaranteed by the builders; re-checked here).
 *   4. abstention ≥ floor (genuinely uncertain).
 *   5. answerable: option_answerability !== 'hard' UNLESS it is the only option
 *      (caller's fallback) — within-sub only; cross-sub axes are 'easy'.
 *   6. primacy: PRIMARY axes pass; an INCIDENTAL axis passes ONLY as a no-residual
 *      fallback (i.e. there is NO surviving residual leaf to default into).
 *   7. NOT outcome-equivalence-suppressed (when the lever is enabled; PRIMARY-exempt).
 *
 * Pure + total.
 */
function gateAxis(params: {
  candidate: AxisCandidate;
  isPrimary: boolean;
  separatedCodes: string[];
  /** True when a residual leaf SURVIVES for this axis's sub (within-sub only). */
  hasSurvivingResidual: boolean;
  /** True when this axis is the ONLY candidate (hard-answerability fallback). */
  isOnlyCandidate: boolean;
  consumed: Set<string>;
  extractedAttributes: TriageExtractedAttributes;
  rawTokens: string[];
  abstentionScore: number;
  opts: DivergenceEngineOptions;
  leafOutcomes: LeafOutcomeMap;
}): DivergenceGateReason {
  const { candidate } = params;

  // (1) consumed → never re-fire.
  if (params.consumed.has(candidate.axis)) return 'already_consumed';

  // (3) live-split guard (builders enforce ≥2 live options; re-assert defensively).
  if (candidate.question.options.length < 2) return 'below_two_live_classes';

  // (2) query silence — only meaningful when the axis maps to a triage AttributeKey.
  const triageKey = axisToAttributeKey(candidate.axis);
  if (
    triageKey !== null &&
    isAttributePinnedByQuery(triageKey, params.extractedAttributes, params.rawTokens)
  ) {
    return 'pinned_by_query';
  }

  // (4) abstention floor.
  if (params.abstentionScore < params.opts.abstentionFloor) return 'abstention_below_floor';

  // (6) primacy: INCIDENTAL passes ONLY when no surviving residual default exists.
  if (!params.isPrimary && params.hasSurvivingResidual) return 'incidental_with_residual';

  // (5) answerability: 'hard' (rank 2) blocked unless it is the only option.
  if (candidate.answerable >= 2 && !params.isOnlyCandidate) return 'answerability_hard';

  // (7) outcome-equivalence suppressor (default OFF; PRIMARY-exempt).
  const oe = evaluateOutcomeEquivalence({
    separatedLeafCodes: params.separatedCodes,
    isPrimary: params.isPrimary,
    outcomes: params.leafOutcomes,
    enabled: params.opts.outcomeEquivEnabled,
  });
  if (oe.suppress) return 'outcome_equivalent';

  return 'eligible';
}

/**
 * Map a concept-axis name to the triage `AttributeKey` it pins against, or null
 * when the axis has no triage analogue (then the query-silence gate is a no-op for
 * it — silence cannot be assessed, so the axis is treated as un-pinned/askable).
 *
 * Conservative + minimal: only the axes that clearly correspond to a triage axis
 * are mapped. An unmapped axis falls through to the divergence engine's other gates
 * (consumed / floor / primacy / outcome-equiv), which already protect against
 * over-asking.
 */
export function axisToAttributeKey(axis: string): AttributeKey | null {
  switch (axis) {
    // form-like axes
    case 'presentation':
    case 'physical_form':
    case 'coffee_form':
      return 'form';
    // processing / state axes
    case 'roasted':
    case 'process_method':
    case 'thermal':
    case 'metal_working':
    case 'worked_state':
    case 'textile_finish':
      return 'processing_state';
    // material / composition axes
    case 'fiber_type':
    case 'polymer':
    case 'origin_nature':
      return 'material';
    // end-use axis
    case 'end_use':
      return 'intended_use';
    default:
      return null;
  }
}

/* ============================================================================
 * The per-round engine
 * ============================================================================ */

/**
 * Evaluate ONE round of the divergence engine. Returns a `DivergenceAskResult` when
 * a question should be asked, or `null` when the engine declines (the caller then
 * classifies). NEVER throws — any malformed input / loader miss / zero eligible
 * axes → null.
 *
 * Algorithm (per round):
 *   a. Load tables (injected or fail-safe loaders) + compute consumed axes.
 *   b. Apply previousAnswers to PRUNE survivors (cross-sub class filter +
 *      within-sub option filter; 'other' escapes only consume).
 *   c. STOP → null if survivors collapsed to ONE leaf (or all share one code) OR
 *      the round budget is exhausted.
 *   d. Build the CANDIDATE-AXIS UNION: cross-sub axes (O8) + within-sub axes (O7).
 *   e. Apply the ONE eligibility gate to every candidate.
 *   f. ORDER eligible axes by coarse_priority (cross-sub first) THEN gain-ratio desc
 *      THEN answerability asc THEN axis name asc; pick the ONE winner.
 *   g. EMIT its structured question + the updated consumed-axis state (the winner
 *      axis is marked consumed so it cannot re-fire next round).
 */
export function evaluateDivergenceAsk(
  input: DivergenceEngineInput,
): DivergenceAskResult | null {
  try {
    const opts: DivergenceEngineOptions = {
      ...DEFAULT_DIVERGENCE_ENGINE_OPTIONS,
      ...(input.options ?? {}),
    };

    if (!Array.isArray(input.survivors) || input.survivors.length === 0) return null;

    const previousAnswers =
      input.previousAnswers !== null && typeof input.previousAnswers === 'object'
        ? input.previousAnswers
        : {};

    const crossSubTable = input.crossSubTable ?? loadCrossSubheadingAxisTable();
    const askableTable = input.askableTable ?? loadAskableSurfaceTable();
    const leafOutcomes: LeafOutcomeMap = input.leafOutcomes ?? {};

    // (a) consumed axes from prior answers (answered OR escaped).
    const consumed = consumedAxesFromAnswers(previousAnswers);

    // (b) prune survivors by prior answers (cross-sub, then within-sub).
    let live = pruneByCrossSubAnswers(input.survivors, previousAnswers, crossSubTable);
    live = pruneByWithinSubAnswers(live, previousAnswers, askableTable);

    // (c) stop conditions.
    if (input.roundsSpent >= opts.roundBudget) return null;
    const liveCodes = survivorLeafCodes(live);
    const liveSubs = survivorSubheadings(live);
    // Collapsed to one leaf (or all survivors share one code) → classify.
    if (liveCodes.length <= 1) return null;
    // Defensive: nothing meaningful left to split.
    if (liveCodes.length === 0 && liveSubs.length <= 1) return null;

    // (d) candidate-axis union.
    const crossBuilt = buildCrossSubAxisCandidate(live, crossSubTable);
    const withinBuilt = buildWithinSubAxisCandidates(live, askableTable);

    // Does a residual leaf survive in the dominant subheading? (within-sub primacy)
    const liveLeafSet = new Set(liveCodes);
    const withinHasSurvivingResidual = withinBuilt.some(
      (w) => w.entry.residual_leaf_code !== null && liveLeafSet.has(w.entry.residual_leaf_code),
    );

    const totalCandidates =
      (crossBuilt !== null ? 1 : 0) + withinBuilt.length;

    // (e) gate every candidate identically.
    const eligible: AxisCandidate[] = [];

    if (crossBuilt !== null) {
      const reason = gateAxis({
        candidate: crossBuilt.candidate,
        isPrimary: crossBuilt.isPrimary,
        separatedCodes: crossBuilt.separatedCodes,
        hasSurvivingResidual: false, // cross-sub forks have no residual by construction
        isOnlyCandidate: totalCandidates === 1,
        consumed,
        extractedAttributes: input.extractedAttributes,
        rawTokens: input.rawTokens,
        abstentionScore: input.abstentionScore,
        opts,
        leafOutcomes,
      });
      if (reason === 'eligible') eligible.push(crossBuilt.candidate);
    }

    for (const w of withinBuilt) {
      const residualForThisAxis =
        w.entry.residual_leaf_code !== null && liveLeafSet.has(w.entry.residual_leaf_code);
      const reason = gateAxis({
        candidate: w.candidate,
        isPrimary: w.isPrimary,
        separatedCodes: w.separatedCodes,
        // Primacy gate: an INCIDENTAL axis is blocked if a residual default survives.
        // PRIMARY axes ignore the residual (primary_residual_override) — pass false
        // for them so the gate's incidental-only branch never blocks a PRIMARY axis.
        hasSurvivingResidual: w.isPrimary ? false : residualForThisAxis || withinHasSurvivingResidual,
        isOnlyCandidate: totalCandidates === 1,
        consumed,
        extractedAttributes: input.extractedAttributes,
        rawTokens: input.rawTokens,
        abstentionScore: input.abstentionScore,
        opts,
        leafOutcomes,
      });
      if (reason === 'eligible') eligible.push(w.candidate);
    }

    if (eligible.length === 0) return null;

    // (f) order: coarse priority (cross-sub first) → gain-ratio desc →
    //            answerability asc → axis name asc (stable, deterministic).
    eligible.sort((a, b) => {
      if (a.coarsePriority !== b.coarsePriority) return a.coarsePriority - b.coarsePriority;
      if (b.gainRatio !== a.gainRatio) return b.gainRatio - a.gainRatio;
      if (a.answerable !== b.answerable) return a.answerable - b.answerable;
      return a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : 0;
    });

    const winner = eligible[0]!;

    // (g) emit + mark the winner consumed (no re-fire next round).
    const nextConsumed = new Set(consumed);
    nextConsumed.add(winner.axis);

    return {
      question: winner.question,
      axis: winner.axis,
      level: winner.level,
      gainRatio: winner.gainRatio,
      state: { consumedAxes: [...nextConsumed].sort() },
    };
  } catch {
    // FAIL-SAFE: never throw — any unexpected error declines (caller classifies).
    return null;
  }
}

/* ============================================================================
 * Caller adapter — map a DivergenceQuestion into the wizard `ClarifyingQuestion`
 * shape Stage 3 surfaces (matches the cross-subheading ASK emit shape).
 * ============================================================================ */

/**
 * Convert the engine's structured `DivergenceQuestion` into the wizard-facing
 * `ClarifyingQuestion` shape (the same shape `buildCrossSubheadingQuestion`
 * returns), so Stage 3 can drop a divergence ASK into a `ClassifyResult` exactly
 * like the cross-subheading lever. EVERY divergence question carries an honest
 * escape as the LAST option so the user can always recover if their true class was
 * not retrieved:
 *   - WITHIN-SUB: the REAL residual leaf (when one survives) — a concrete leaf
 *     description, never a blank Other/None.
 *   - CROSS-SUB: a residual-absent fork by construction (no real residual leaf to
 *     offer), so we append the legacy generic escape `Other / not listed (please
 *     describe)`. It carries NO codes (no filter); the engine's
 *     `pruneByCrossSubAnswers` treats an `'other'` answer as "apply no filter,
 *     consume the axis" so the escape is reachable AND cannot re-fire the axis.
 * This restores parity with the legacy `buildCrossSubheadingQuestion`, which always
 * appended that generic escape to a cross-subheading fork. Pure + total.
 *
 * NOTE: `ClarifyingQuestion.options` is `TriageFallbackOption[]` (id+label only);
 * the leaf `codes` per option are carried separately on the engine's
 * `DivergenceQuestion` so Stage 3 can prune the next round. The
 * `discriminating_attribute` is mapped from the axis (falling back to `'form'` when
 * the axis has no triage analogue — it is non-load-bearing metadata for the wizard;
 * the divergence flow keys off `question_id`).
 */
export function toClarifyingQuestion(q: DivergenceQuestion): ClarifyingQuestion {
  // Each divergence option is leaf-grounded — carry its surviving 8-digit leaf
  // code(s) as `target_codes` so the eval answer-simulator can derive the gold
  // answer DETERMINISTICALLY (option whose target leaf == gold) instead of fuzzy
  // text-matching the (LLM-phrasable) label. The escape ('other') appended below
  // is NOT leaf-grounded (it applies no filter) and therefore carries no
  // target_codes — preserving the simulator's never-pick-an-escape honesty.
  const options: TriageFallbackOption[] = q.options.map((o) => ({
    id: o.id,
    label: o.label,
    target_codes: [...o.codes],
  }));
  if (q.residual_escape !== null) {
    // WITHIN-SUB: honest real-leaf residual escape.
    options.push({
      id: 'other',
      label: q.residual_escape.description,
    });
  } else if (q.level === 'cross_sub') {
    // CROSS-SUB: residual-absent fork → honest generic escape (no codes; the engine
    // consumes the axis and applies no filter on an 'other' answer). Restores the
    // legacy cross-subheading escape so the user can always recover.
    options.push({
      id: 'other',
      label: 'Other / not listed (please describe)',
    });
  }
  return {
    question_id: q.question_id,
    question_text: q.question_text,
    discriminating_attribute: axisToAttributeKey(q.axis) ?? 'form',
    options,
    qgs_used: false,
    // Stage 3 widened the wizard-facing trigger enum to include 'divergence'; the
    // engine now surfaces its own trigger directly so the adapter + wizard can
    // distinguish a divergence ASK from the legacy cross-subheading / sibling ones.
    trigger: 'divergence',
  };
}

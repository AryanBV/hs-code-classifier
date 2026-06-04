/**
 * OUTCOME-EQUIVALENCE SUPPRESSOR — Stage S2 divergence engine, pure core.
 *
 * A ONE-DIRECTIONAL ask suppressor. The divergence engine asks a question to
 * separate the surviving leaves on an axis. But if EVERY leaf the question would
 * separate carries the IDENTICAL trade OUTCOME (same export policy + same policy
 * condition), then forcing the exporter to disambiguate buys NOTHING they care
 * about — the 8-digit code differs but the actionable trade fact is the same — so
 * the question can be SUPPRESSED and the engine can let the brain classify (or
 * present a leaf) without asking.
 *
 * STRICT DIRECTIONALITY + SAFETY (this can only ever REDUCE asks, never add one):
 *   - It returns `true` (suppress) ONLY when ALL of:
 *       (a) the axis is NOT primary — PRIMARY axes are EXEMPT and are NEVER
 *           suppressed (a primary characteristic is worth asking even if the two
 *           branches happen to share today's policy), AND
 *       (b) every leaf that the question would separate shares an IDENTICAL,
 *           NON-NULL export_policy AND an identical policy_condition.
 *   - NULL / missing / divergent policy on ANY separated leaf == "differs" — it
 *     FAILS TOWARD ASKING (returns false). We never suppress on absent data.
 *   - DEFAULT-OFF at the engine: the engine passes an `outcomeEquivEnabled` flag
 *     (default false), so this lever is dark until explicitly turned on. This file
 *     is the pure decision; the engine owns the flag.
 *
 * PURE: the policy data is passed IN as a code→{export_policy, policy_condition}
 * map (the engine / Stage 3 hydrates it from `tariff_lines`; this module performs
 * ZERO I/O and never throws).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXTENSION HOOK — broader outcome dimensions (duty / RoDTEP / RoSCTL / export
 * duty / UQC).  Those tables EXIST in the DB now (Trade-Intelligence build), but
 * v1 INTENTIONALLY reads ONLY export_policy + policy_condition, which live directly
 * on `tariff_lines` (the one outcome dimension we can hydrate with zero extra
 * joins and that is the most exporter-actionable). To extend: widen `LeafOutcome`
 * with the new dimensions, hydrate them in the engine/Stage 3, and add them to the
 * equality check in `leavesShareOutcome`. The directionality + PRIMARY-exempt +
 * fail-toward-asking-on-null contract MUST be preserved for every new dimension —
 * a missing duty value, like a missing policy, counts as "differs".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Reference: prompt "outcome-equivalence (one-directional suppressor, default-OFF,
 * PRIMARY-exempt, null==differs)".
 */

/**
 * The trade-outcome fields read for outcome equivalence (v1 = the two that live on
 * `tariff_lines`). Both default to null when the leaf row is absent / unhydrated.
 */
export interface LeafOutcome {
  export_policy: string | null;
  policy_condition: string | null;
}

/** A code → trade-outcome map (hydrated upstream from `tariff_lines`). */
export type LeafOutcomeMap = Readonly<Record<string, LeafOutcome>>;

/** Normalize an outcome string for comparison: trimmed, lowercased; '' → null. */
function normOutcome(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return t.length === 0 ? null : t;
}

/**
 * True iff EVERY code in `leafCodes` shares an identical, NON-NULL export_policy
 * AND an identical policy_condition.
 *
 * SAFETY (fail toward asking):
 *   - Fewer than 2 distinct codes → false (nothing to compare; never suppress).
 *   - Any code missing from the map → its outcome is null → "differs" → false.
 *   - A null/empty export_policy on ANY code → "differs" → false (we never treat
 *     "no policy data" as equivalence). policy_condition is allowed to be null AS
 *     LONG AS it is null on ALL of them (a uniformly-absent condition is still
 *     identical), but a present-vs-absent or differing condition → false.
 *
 * Pure + total + never throws.
 */
export function leavesShareOutcome(
  leafCodes: readonly string[],
  outcomes: LeafOutcomeMap,
): boolean {
  const distinct = [...new Set(leafCodes)];
  if (distinct.length < 2) return false;

  let policyRef: string | null | undefined;
  let conditionRef: string | null = null;
  let first = true;

  for (const code of distinct) {
    const o = outcomes[code];
    const policy = normOutcome(o?.export_policy);
    // A null/absent export_policy can never anchor an equivalence — fail to ask.
    if (policy === null) return false;
    const condition = normOutcome(o?.policy_condition);

    if (first) {
      policyRef = policy;
      conditionRef = condition;
      first = false;
      continue;
    }
    if (policy !== policyRef) return false;
    if (condition !== conditionRef) return false;
  }

  return true;
}

/** Inputs to the outcome-equivalence suppression decision. */
export interface OutcomeEquivalenceInput {
  /**
   * The leaf codes the question would SEPARATE (the union of the axis options'
   * leaf codes that survive). These are what must share an outcome to suppress.
   */
  separatedLeafCodes: readonly string[];
  /** Whether the axis is a PRIMARY characteristic — PRIMARY is EXEMPT (never suppressed). */
  isPrimary: boolean;
  /** code → trade-outcome map (export_policy + policy_condition). */
  outcomes: LeafOutcomeMap;
  /** Master flag — when false (default), the suppressor is a no-op (returns false). */
  enabled: boolean;
}

/** Why the suppressor did / did not suppress (observability; never load-bearing). */
export type OutcomeEquivalenceReason =
  | 'disabled'
  | 'primary_axis_exempt'
  | 'outcomes_differ'
  | 'suppressed';

/** Result of the outcome-equivalence evaluation. */
export interface OutcomeEquivalenceDecision {
  /** True ⇒ suppress this question (the engine drops the axis). */
  suppress: boolean;
  reason: OutcomeEquivalenceReason;
}

/**
 * The one-directional outcome-equivalence decision.
 *
 * Suppress (return `{suppress:true}`) ONLY when enabled AND the axis is NOT primary
 * AND every separated leaf shares an identical non-null outcome. In every other
 * case return `{suppress:false}` — including when disabled, when the axis is
 * primary (EXEMPT), and whenever outcome data is null/absent/divergent
 * (fail toward asking). Pure + total + never throws.
 */
export function evaluateOutcomeEquivalence(
  input: OutcomeEquivalenceInput,
): OutcomeEquivalenceDecision {
  if (!input.enabled) return { suppress: false, reason: 'disabled' };
  // PRIMARY axes are EXEMPT — never suppressed, regardless of shared policy.
  if (input.isPrimary) return { suppress: false, reason: 'primary_axis_exempt' };

  if (leavesShareOutcome(input.separatedLeafCodes, input.outcomes)) {
    return { suppress: true, reason: 'suppressed' };
  }
  return { suppress: false, reason: 'outcomes_differ' };
}

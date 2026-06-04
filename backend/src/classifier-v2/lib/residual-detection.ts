/**
 * Shared residual / catch-all detection (Stage 3c — the single source of truth).
 *
 * A tariff leaf (or a subheading title) is a RESIDUAL / catch-all when its text is
 * an unqualified "Other" / "n.e.s." / "not elsewhere specified|included" /
 * "not specified" AT THE RELEVANT NESTING LEVEL. Under the project's
 * UNMARKED-DEFAULT-WINS rule, when a residual exists a query that is SILENT on the
 * discriminating axis DEFAULTS into it, and the divergence engine must NOT ask. So a
 * FALSE residual makes the engine wrongly stay quiet — a safe-but-wrong UNDER-ask.
 *
 * Why this util exists (the Stage 3c bug fix)
 * -------------------------------------------
 * The original O7 build-time detector (`derive-atomic-axes.ts`) used an UNANCHORED
 * pattern `n\.?e\.?s` whose optional dots collapse to the bare substring "nes", so
 * it matched "nes" ANYWHERE inside a word — "sardiNES", "magNESium", "wiNES",
 * "marine engiNES" — and falsely flagged long species/chemical/part titles as
 * residual. (Live example: 1604.13 "sardines", 2816.10 "magnesium hydroxide",
 * 8408.10 "marine propulsion engines" were all wrongly `has_residual=true`.)
 * O8 (`derive-cross-sub.ts`) had already routed around this with a word-boundary
 * variant. This util CENTRALISES the CORRECT detector so BOTH O7 and O8 — and any
 * runtime consumer — agree on one definition.
 *
 * The corrected pattern matches ONLY whole tokens:
 *   - a TRAILING bare "Other"/"Others" after start / ":" / a dash-run, e.g.
 *     "Other", "Others", ": Other", "--- Other";
 *   - the dotted abbreviation "n.e.s" / "n.e.i" (WCO: not-elsewhere-specified /
 *     -included), boundary-guarded so it never matches inside another word;
 *   - the phrases "not elsewhere specified|included" / "not specified".
 *
 * It is a STRICTER, superset-safe variant of the O7 original: it still matches
 * EVERY genuine residual the O6/O7/O8 examples expect (verified), while dropping the
 * substring false-positives. It additionally recognises "n.e.i." (which the buggy
 * O7 pattern silently missed) — corpus-verified to introduce ZERO new residual
 * flips beyond the intended ones (HEAD->regen: 23 true->false, 0 false->true).
 *
 * This module is PURE (no I/O, no env) and safe to import from any layer.
 */

/**
 * Word-boundary residual detector. See file header for the rationale.
 *
 * Breakdown:
 *   (^|:\s*|-+\s*)(other|others)\s*$   bare trailing "Other"/"Others"
 *   (^|[^a-z])n\.e\.[si]\.?(?![a-z])   dotted n.e.s / n.e.i as a whole token
 *   not elsewhere (specified|included) the spelled-out phrase
 *   not specified                      the spelled-out phrase
 */
export const RESIDUAL_RE: RegExp =
  /(^|:\s*|-+\s*)(other|others)\s*$|(^|[^a-z])n\.e\.[si]\.?(?![a-z])|not elsewhere (specified|included)|not specified/i;

/**
 * True when `description` is an unqualified residual / catch-all at its level.
 * Trims surrounding whitespace; never throws on empty/null/garbage input.
 */
export function isResidualDescription(description: string | null | undefined): boolean {
  return RESIDUAL_RE.test((description ?? '').trim());
}

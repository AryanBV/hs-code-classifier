/**
 * SIBLING-ASK pin-check (Phase 4.x — sibling-ask elicitation lever).
 *
 * A pure, deterministic predicate that answers ONE question: did the EXPORTER's
 * own query pin down a given discriminating attribute, or did Layer-1 Triage
 * merely INFER it from context? The sibling-ASK trigger uses this to decide
 * whether asking the user about that attribute would add information:
 *   - pinned   ⇒ the user already told us; asking is redundant (don't ask).
 *   - unpinned ⇒ the deciding attribute is missing from the query; ask one
 *               targeted question (the proven genuine-accuracy lever).
 *
 * This is the crux of the lever (blueprint §"isAttributePinnedByQuery"):
 * L1 routinely infers specific attribute values from world knowledge even when
 * the user never said them (e.g. it may infer material="rubber" from "oil seal").
 * A specific-but-INFERRED value must STILL trigger the ASK — otherwise we'd guess
 * the deciding attribute the user never specified. Hence rule (3): a value with
 * NO token overlap with the raw user tokens is treated as not-pinned.
 *
 * Spec reference: backend/docs/plans/2026-05-29-sibling-ask-lever-blueprint.md
 * (Phase A — pure fn + first-match-wins rule list).
 */
import { isSpecificValue, isBareNonSpecificWord } from '../layers/L1-triage';
import type { AttributeKey, RetrievalCandidate, TriageExtractedAttributes } from '../types';

/**
 * Map an `AttributeKey` to the `extracted_attributes` value field. `function`
 * is a JS reserved-ish key but valid as an object property; the TLA/DB layer
 * uses `function_`, but `TriageExtractedAttributes` exposes the public `function`
 * key directly, so a straight index is correct here.
 */
function extractedValueFor(
  attributeKey: AttributeKey,
  attrs: TriageExtractedAttributes,
): string | null {
  switch (attributeKey) {
    case 'material':         return attrs.material;
    case 'form':             return attrs.form;
    case 'function':         return attrs.function;
    case 'intended_use':     return attrs.intended_use;
    case 'processing_state': return attrs.processing_state;
    case 'composition':      return attrs.composition;
    default:                 return null;
  }
}

/**
 * Normalize a free-text token/value into comparable lowercase word tokens.
 * Splits on any non-alphanumeric run so "stainless-steel" → ["stainless","steel"]
 * and a multi-word value like "galvanized steel" → ["galvanized","steel"].
 * Empty / whitespace-only inputs yield no tokens.
 */
function wordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * True when the extracted attribute `value` shares at least one SIGNIFICANT word
 * with the raw user tokens. "Significant" excludes bare generic words
 * (`isBareNonSpecificWord`) so an overlap on "metal"/"plastic" alone does NOT
 * count as the user having pinned a specific attribute — those are exactly the
 * weak tokens the lever wants to ask about.
 */
function hasSignificantTokenOverlap(value: string, rawTokens: string[]): boolean {
  const rawSet = new Set<string>();
  for (const tok of rawTokens) {
    for (const w of wordTokens(tok)) rawSet.add(w);
  }
  if (rawSet.size === 0) return false;
  for (const w of wordTokens(value)) {
    if (isBareNonSpecificWord(w)) continue;
    if (rawSet.has(w)) return true;
  }
  return false;
}

/**
 * Decide whether the exporter's query PINS a discriminating attribute (so asking
 * about it would be redundant). First-match-wins per the blueprint:
 *
 *   1. extracted value null / empty            → NOT pinned (nothing to go on).
 *   2. value fails `isSpecificValue` (generic)  → NOT pinned (too weak to pin).
 *   3. value has NO significant token overlap   → NOT pinned (L1 INFERRED it; the
 *      with `rawTokens`                            user never said it — ask anyway).
 *   4. otherwise                                → pinned (the user said it).
 *
 * Pure + side-effect free + total (never throws): defensively handles a null/
 * non-array `rawTokens` as "no tokens" → not pinned.
 *
 * @param attributeKey       The discriminating attribute under consideration.
 * @param extractedAttributes Triage's structured attribute bundle.
 * @param rawTokens          The user's raw query tokens (Layer-0 / Triage
 *                           `raw_tokens`) — the evidence of what the user
 *                           actually said.
 * @returns true iff the attribute is pinned by the query (⇒ do NOT ask).
 */
export function isAttributePinnedByQuery(
  attributeKey: AttributeKey,
  extractedAttributes: TriageExtractedAttributes,
  rawTokens: string[],
): boolean {
  const value = extractedValueFor(attributeKey, extractedAttributes);

  // (1) Null / empty extracted value — nothing pinned.
  if (value === null) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // (2) Bare generic value ("metal", "plastic") — too weak to pin.
  if (!isSpecificValue(trimmed)) return false;

  // (3) No significant overlap with the raw user tokens ⇒ L1 INFERRED it; the
  //     user did not say it → not pinned (ask).
  const tokens = Array.isArray(rawTokens) ? rawTokens : [];
  if (!hasSignificantTokenOverlap(trimmed, tokens)) return false;

  // (4) Specific value the user actually said → pinned (do not ask).
  return true;
}

/**
 * Reranker-margin uncertainty signal for the SIBLING-ASK lever.
 *
 * Looks at the SELECTED leaf's same-subheading siblings (the codes that compete
 * directly under the chosen 6-digit subheading) and measures how far the
 * reranker separated the top two. A SMALL margin means the reranker could not
 * tell the siblings apart ⇒ genuinely confusable ⇒ ask-eligible; a LARGE margin
 * means the winner is clearly preferred ⇒ confident ⇒ don't ask.
 *
 * Only candidates that (a) belong to `selectedSubheading` — via
 * `parent_chain.subheading`, falling back to `code.slice(0,7)` when that is
 * empty — and (b) carry a non-null `rerank_score` participate. With fewer than
 * two such siblings the margin is unknowable ⇒ `{ margin: null, topCodes: null }`
 * (the caller treats null conservatively as "cannot assess → do not ask").
 *
 * Pure + side-effect free + total (never throws).
 *
 * @returns `margin` = top1.rerank_score − top2.rerank_score (≥0; 0 on an exact
 *          tie) and `topCodes` = [top1.code, top2.code]; both null when <2
 *          rerankable same-subheading siblings exist.
 */
export function computeSiblingRerankMargin(
  candidates: RetrievalCandidate[],
  selectedSubheading: string,
): { margin: number | null; topCodes: [string, string] | null } {
  // Keep only same-subheading siblings that carry a rerank score, capturing the
  // (now non-null) score alongside the code so the sort/return are strongly typed.
  const siblings: Array<{ code: string; score: number }> = [];
  for (const c of candidates) {
    if (c.rerank_score === null) continue;
    const sub = c.parent_chain.subheading ?? '';
    const effective = sub.length > 0 ? sub : c.code.slice(0, 7);
    if (effective === selectedSubheading) {
      siblings.push({ code: c.code, score: c.rerank_score });
    }
  }

  siblings.sort((a, b) => b.score - a.score);
  const [top1, top2] = siblings;
  if (top1 === undefined || top2 === undefined) {
    return { margin: null, topCodes: null }; // <2 rerankable same-subheading siblings
  }
  return {
    margin: top1.score - top2.score,
    topCodes: [top1.code, top2.code],
  };
}

/* ---------------------------------------------------------------------------
 * CALIBRATED-CLASSIFY decision — the MIRROR of the sibling-ASK lever.
 *
 * Sibling-ASK fires on a SMALL margin (genuinely confusable siblings → ask).
 * CALIBRATED-CLASSIFY fires on the OPPOSITE polarity: a LARGE margin over a
 * SINGLE residual subheading means L2/L3 already pinned the dominant leaf, so an
 * L1 ASK can be safely UPGRADED to a CLASSIFY instead of asking. It can only ever
 * turn an ASK into a CLASSIFY — never downgrade to REFUSE.
 *
 * This pure fn handles two of the three gates; gate C (verbatim-pin) requires a
 * DB description fetch and is completed by the orchestrator.
 *
 *   - Gate A (CONCENTRATION): all surviving candidates share ONE subheading.
 *   - Gate B (DOMINANT-MARGIN): the top-2 rerank margin within that subheading is
 *     ≥ `opts.margin` (a clearly dominant leaf). A null margin (rerank_score null
 *     on a direct_leaf_lookup / degrade) with exactly ONE candidate under the
 *     subheading is treated as TRIVIALLY dominant (B passes).
 *   - Gate C-half (STRONG): when the margin is ≥ `opts.strongMargin`, `strong` is
 *     set so the orchestrator can skip the verbatim-pin DB fetch entirely.
 *
 * Reuses `computeSiblingRerankMargin` + the same subheading-derivation pattern as
 * `subheadingOf` (parent_chain.subheading ?? code.slice(0,7)) — no duplication.
 * --------------------------------------------------------------------------- */

/** Result of the pure CALIBRATED-CLASSIFY gate evaluation. */
export interface CalibratedClassifyDecision {
  /** True iff gate A AND gate B hold (orchestrator then additionally requires C). */
  fire:       boolean;
  /** The single residual subheading when gate A holds; else null. */
  subheading: string | null;
  /** The dominant (top-rerank, or single-survivor) leaf code; else null. */
  topCode:    string | null;
  /** The top-2 rerank margin used for gate B; null on the single-survivor path. */
  marginVal:  number | null;
  /** True when the margin is ≥ strongMargin (gate-C STRONG half satisfied). */
  strong:     boolean;
  /** Human-readable cause for trace/debug (never load-bearing). */
  reason:     string;
}

/**
 * Derive a candidate's 6-digit subheading using the EXACT pattern shared by
 * `computeSiblingRerankMargin` and L4-select's `subheadingOf`: prefer the parent
 * chain's subheading, falling back to the code's "NNNN.NN" prefix when absent.
 * Returns '' when neither is resolvable (pushed into a distinct bucket so an
 * unresolvable candidate never silently joins a real group).
 */
function effectiveSubheading(c: RetrievalCandidate): string {
  const sub = c.parent_chain.subheading ?? '';
  if (sub.length > 0) return sub;
  if (c.code.length >= 7) return c.code.slice(0, 7);
  return '';
}

/**
 * Pure CALIBRATED-CLASSIFY gate (A + B + the STRONG half of C). Total + side-
 * effect free + never throws. See the section comment above for the gate model.
 *
 * @param candidates The L3 survivors (`rulesOut.filtered_candidates`).
 * @param opts.margin       gate-B cutoff (dominant margin); orchestrator default 0.15.
 * @param opts.strongMargin gate-C STRONG cutoff; orchestrator default 0.30.
 */
export function evaluateCalibratedClassify(
  candidates: RetrievalCandidate[],
  opts: { margin: number; strongMargin: number },
): CalibratedClassifyDecision {
  const noFire = (reason: string): CalibratedClassifyDecision => ({
    fire: false, subheading: null, topCode: null, marginVal: null, strong: false, reason,
  });

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return noFire('no_candidates');
  }

  // Gate A — CONCENTRATION: exactly ONE distinct subheading across all survivors.
  const subheadings = new Set<string>();
  for (const c of candidates) subheadings.add(effectiveSubheading(c));
  if (subheadings.size !== 1) {
    return noFire(`concentration_fail:${subheadings.size}_subheadings`);
  }
  const theSubheading = [...subheadings][0]!;
  if (theSubheading.length === 0) {
    return noFire('concentration_fail:unresolvable_subheading');
  }

  // Gate B — DOMINANT-MARGIN. The rerank margin between the top-2 same-subheading
  // siblings must be ≥ opts.margin. A null margin (single rerankable survivor, or
  // rerank_score null on a direct_leaf_lookup) is trivially dominant iff exactly
  // ONE candidate sits under the subheading.
  const { margin, topCodes } = computeSiblingRerankMargin(candidates, theSubheading);

  if (margin === null) {
    if (candidates.length === 1) {
      const only = candidates[0]!;
      return {
        fire: true,
        subheading: theSubheading,
        topCode: only.code,
        marginVal: null,
        // No measurable margin: the single survivor needs the verbatim-pin half of
        // gate C (orchestrator), so it is NOT flagged strong here.
        strong: false,
        reason: 'single_survivor_null_margin',
      };
    }
    return noFire('dominant_margin_fail:null_margin_multi');
  }

  if (margin < opts.margin) {
    return noFire(`dominant_margin_fail:${margin}_below_${opts.margin}`);
  }

  const top1 = topCodes !== null ? topCodes[0] : null;
  const strong = margin >= opts.strongMargin;
  return {
    fire: true,
    subheading: theSubheading,
    topCode: top1,
    marginVal: margin,
    strong,
    reason: strong ? `strong_margin:${margin}` : `dominant_margin:${margin}`,
  };
}

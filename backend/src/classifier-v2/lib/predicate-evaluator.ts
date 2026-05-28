/**
 * Three-valued predicate evaluator for L5 Verifier Rules 7, 8, 9.
 *
 * Evaluates a `Predicate` (canonical type in `../db/predicate-dsl.ts`) against
 * a `tariff_line_attributes[code]` row using PASS / FAIL / SKIP semantics.
 *
 * Spec references:
 *   - backend/docs/sub-specs/01-verifier-rules.md §"Rules 7/8/9 — Predicate DSL"
 *   - backend/docs/sub-specs/04-dsl-audit.md (O2 schema expansion + reserved
 *     `candidate.*` context vars)
 *   - backend/src/classifier-v2/db/predicate-dsl.ts (the discriminated union)
 *
 * Three-valued logic (per sub-spec 01 truth tables):
 *   AND:     any FAIL → FAIL. All PASS → PASS. Some SKIP, none FAIL → SKIP.
 *   OR:      any PASS → PASS. All FAIL → FAIL. Some SKIP, none PASS → SKIP.
 *   NOT:     SKIP → SKIP. PASS → FAIL. FAIL → PASS.
 *   IMPLIES: OR(NOT(ant), con) — antecedent FAIL ⇒ PASS vacuously.
 *
 * Missing-key policy:
 *   - For SCALAR comparisons (==, !=, >, <, >=, <=, IN, NOT_IN) and ARRAY ops
 *     (ARRAY_CONTAINS, ARRAY_OVERLAPS): missing key → SKIP. SKIP is recorded
 *     in `skipped` so the verifier can audit O2 coverage gaps.
 *   - EXISTS is the ONE operator where absence => FAIL (it tests presence).
 *
 * Sentinel variables (`__SKIP_*`):
 *   A small set of notes_claims rows are NOT machine-checkable (purposive,
 *   definitional, or priority-rule text). The build-time extractor encodes these
 *   with a sentinel predicate `EXISTS(__SKIP_<reason>)` — e.g. `__SKIP_PURPOSIVE__`,
 *   `__SKIP_DEFINITION__`, `__SKIP_PRIORITY_RULE__`. A `__SKIP_*` variable is never
 *   an attribute and never present, so under the normal EXISTS rule it would FAIL
 *   on every product — and a FAIL on a normal-polarity claim (condition/definition/
 *   inclusion) becomes a false violation on EVERY product. Any reference to a
 *   `__SKIP_*` var therefore resolves to SKIP (three-valued: never PASS, never
 *   FAIL), so it propagates harmlessly through AND/OR/NOT/IMPLIES and is recorded
 *   in the skip audit trail. SKIP is never a violation for any claim_type.
 *
 * Special variable resolution:
 *   Variable names starting with `candidate.` resolve from `ctx.candidate`
 *   rather than `ctx.attrs`. The reserved vars are:
 *     candidate.chapter      (2-digit)
 *     candidate.heading      (4-digit)
 *     candidate.subheading   (6-digit, e.g., "7318.15")
 *     candidate.code         (8-digit, e.g., "7318.15.00"; or 6-digit fallback)
 *     candidate.section      (Roman numeral, e.g., "XV")
 */
import type {
  Predicate,
  PredicateRef,
  PredicateEvalResult,
} from '../db/predicate-dsl';

/* ---------------------------------------------------------------------------
 * Context types
 * --------------------------------------------------------------------------- */

/** Candidate-context vars used by `candidate.*` references in predicates. */
export interface PredicateCandidateContext {
  chapter:    string;
  heading:    string;
  subheading: string;
  code:       string;
  section:    string;
}

/** Evaluation context — attrs may be null when no O2 row exists for the code. */
export interface PredicateEvalContext {
  attrs:     Record<string, unknown> | null;
  candidate: PredicateCandidateContext;
}

export type Eval = PredicateEvalResult;

/* ---------------------------------------------------------------------------
 * Sentinel variables
 * --------------------------------------------------------------------------- */

/**
 * Prefix marking a NON-machine-checkable claim. notes_claims rows that encode
 * purposive / definitional / priority-rule text use a predicate of the form
 * `EXISTS(__SKIP_<reason>)`. Any var with this prefix resolves to SKIP so the
 * claim never produces a violation (see module header).
 */
const SKIP_SENTINEL_PREFIX = '__SKIP';

/** True iff `varName` is a `__SKIP_*` sentinel (e.g. `__SKIP_PURPOSIVE__`). */
function isSkipSentinelVar(varName: string): boolean {
  return varName.startsWith(SKIP_SENTINEL_PREFIX);
}

/* ---------------------------------------------------------------------------
 * Variable resolution
 * --------------------------------------------------------------------------- */

/**
 * Resolve a variable reference to a value.
 *
 * Returns `{found: false}` when the variable is absent from the resolution
 * source (attrs row missing the key, or attrs itself null for non-candidate
 * vars). Returns `{found: true, value: ...}` when present — value may still
 * be null/empty-array (callers handle that per-op).
 */
interface VarResolution {
  found: boolean;
  value: unknown;
}

function resolveVar(varName: string, ctx: PredicateEvalContext): VarResolution {
  if (varName.startsWith('candidate.')) {
    const key = varName.slice('candidate.'.length) as keyof PredicateCandidateContext;
    const value = ctx.candidate[key];
    if (value === undefined) return { found: false, value: null };
    return { found: true, value };
  }
  if (ctx.attrs === null || ctx.attrs === undefined) {
    return { found: false, value: null };
  }
  if (!(varName in ctx.attrs)) {
    return { found: false, value: null };
  }
  return { found: true, value: ctx.attrs[varName] };
}

/* ---------------------------------------------------------------------------
 * Scalar helpers (typed comparisons)
 * --------------------------------------------------------------------------- */

function isNumberLike(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function arrayContains(arr: unknown[], target: unknown): boolean {
  return arr.some((x) => x === target);
}

function arrayOverlap(arr: unknown[], targets: unknown[]): boolean {
  for (const t of targets) {
    if (arr.some((x) => x === t)) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Leaf-op evaluation
 *
 * For scalar comparisons:
 *   - "==" / "!=" against an array value resolves to IN / NOT-IN semantics
 *     (`'steel' ∈ attrs.material[]`) per sub-spec 01.
 *   - Missing key (var absent in attrs) → SKIP for all scalar/array ops.
 *   - EXISTS is the only op where absence = FAIL.
 * --------------------------------------------------------------------------- */

function recordSkip(
  pred: { op: string; var: string },
  skipped: PredicateRef[],
  claimId: number,
): void {
  skipped.push({
    notes_claim_id: claimId,
    var:            pred.var,
    // Cast — leaf-op set is the only path that records skips; the runtime
    // never reaches this for compound ops.
    op:             pred.op as PredicateRef['op'],
  });
}

function evalLeaf(
  pred: Extract<Predicate, { var: string }>,
  ctx: PredicateEvalContext,
  skipped: PredicateRef[],
  claimId: number,
): Eval {
  // Sentinel short-circuit: a `__SKIP_*` var marks a non-machine-checkable
  // claim. It resolves to SKIP for EVERY op (never PASS, never FAIL) so it can
  // never become a violation under any claim_type/polarity. We record the skip
  // for the audit trail (O2 coverage / unverifiable-claim visibility).
  if (isSkipSentinelVar(pred.var)) {
    recordSkip(pred, skipped, claimId);
    return 'SKIP';
  }

  const resolution = resolveVar(pred.var, ctx);

  switch (pred.op) {
    case 'EXISTS': {
      if (!resolution.found) return 'FAIL';
      const v = resolution.value;
      if (v === null || v === undefined) return 'FAIL';
      if (Array.isArray(v)) return v.length > 0 ? 'PASS' : 'FAIL';
      if (typeof v === 'string') return v.length > 0 ? 'PASS' : 'FAIL';
      return 'PASS';
    }

    case '==': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (Array.isArray(v)) return arrayContains(v, pred.value) ? 'PASS' : 'FAIL';
      return v === pred.value ? 'PASS' : 'FAIL';
    }

    case '!=': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (Array.isArray(v)) return arrayContains(v, pred.value) ? 'FAIL' : 'PASS';
      return v !== pred.value ? 'PASS' : 'FAIL';
    }

    case '>':
    case '<':
    case '>=':
    case '<=': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (!isNumberLike(v)) {
        // Non-numeric on a numeric op → SKIP (don't fail on type mismatch;
        // O2 may not yet have extracted the numeric form).
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      if (!isNumberLike(pred.value)) return 'FAIL';
      if (pred.op === '>')  return v >  pred.value ? 'PASS' : 'FAIL';
      if (pred.op === '<')  return v <  pred.value ? 'PASS' : 'FAIL';
      if (pred.op === '>=') return v >= pred.value ? 'PASS' : 'FAIL';
      return v <= pred.value ? 'PASS' : 'FAIL';
    }

    case 'IN': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      // IN semantics: scalar var in [v1,v2,...]. If var is array, treat as
      // overlap test (any element of the array matches any value).
      if (Array.isArray(v)) {
        return arrayOverlap(v, pred.values) ? 'PASS' : 'FAIL';
      }
      return pred.values.some((x) => x === v) ? 'PASS' : 'FAIL';
    }

    case 'NOT_IN': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (Array.isArray(v)) {
        return arrayOverlap(v, pred.values) ? 'FAIL' : 'PASS';
      }
      return pred.values.some((x) => x === v) ? 'FAIL' : 'PASS';
    }

    case 'ARRAY_CONTAINS': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (!Array.isArray(v)) {
        // Treat scalar-on-array-op as a scalar equality (graceful for vars
        // that O2 sometimes extracts as a single string).
        return v === pred.value ? 'PASS' : 'FAIL';
      }
      return arrayContains(v, pred.value) ? 'PASS' : 'FAIL';
    }

    case 'ARRAY_OVERLAPS': {
      if (!resolution.found || resolution.value === null || resolution.value === undefined) {
        recordSkip(pred, skipped, claimId);
        return 'SKIP';
      }
      const v = resolution.value;
      if (!Array.isArray(v)) {
        return pred.values.some((x) => x === v) ? 'PASS' : 'FAIL';
      }
      return arrayOverlap(v, pred.values) ? 'PASS' : 'FAIL';
    }
  }

  // Exhaustiveness — unreachable.
  /* istanbul ignore next */
  return 'SKIP';
}

/* ---------------------------------------------------------------------------
 * Compound-op evaluation
 * --------------------------------------------------------------------------- */

/**
 * Three-valued predicate evaluator. Returns 'PASS' | 'FAIL' | 'SKIP'.
 *
 * @param pred     Predicate node from the notes_claims.predicate JSONB column.
 * @param ctx      Evaluation context: attrs row + candidate-context vars.
 * @param skipped  Audit trail — every leaf SKIP appends a PredicateRef so the
 *                 verifier can flag O2 coverage gaps.
 * @param claimId  notes_claims.id — flows into PredicateRef for traceability.
 */
export function evalPredicate(
  pred: Predicate,
  ctx: PredicateEvalContext,
  skipped: PredicateRef[],
  claimId: number,
): Eval {
  switch (pred.op) {
    case '==':
    case '!=':
    case '>':
    case '<':
    case '>=':
    case '<=':
    case 'EXISTS':
    case 'IN':
    case 'NOT_IN':
    case 'ARRAY_CONTAINS':
    case 'ARRAY_OVERLAPS':
      return evalLeaf(pred, ctx, skipped, claimId);

    case 'AND': {
      let hasSkip = false;
      for (const c of pred.clauses) {
        const r = evalPredicate(c, ctx, skipped, claimId);
        if (r === 'FAIL') return 'FAIL';
        if (r === 'SKIP') hasSkip = true;
      }
      return hasSkip ? 'SKIP' : 'PASS';
    }

    case 'OR': {
      let hasSkip = false;
      for (const c of pred.clauses) {
        const r = evalPredicate(c, ctx, skipped, claimId);
        if (r === 'PASS') return 'PASS';
        if (r === 'SKIP') hasSkip = true;
      }
      return hasSkip ? 'SKIP' : 'FAIL';
    }

    case 'NOT': {
      const r = evalPredicate(pred.clause, ctx, skipped, claimId);
      if (r === 'SKIP') return 'SKIP';
      return r === 'PASS' ? 'FAIL' : 'PASS';
    }

    case 'IMPLIES': {
      const ant = evalPredicate(pred.antecedent, ctx, skipped, claimId);
      if (ant === 'FAIL') return 'PASS';   // vacuously true
      const con = evalPredicate(pred.consequent, ctx, skipped, claimId);
      if (ant === 'SKIP') {
        // SKIP antecedent: if consequent PASSes outright, the whole implication
        // is PASS; otherwise SKIP (we don't know whether the antecedent fires).
        return con === 'PASS' ? 'PASS' : 'SKIP';
      }
      // ant === 'PASS' → result tracks consequent.
      return con;
    }
  }

  /* istanbul ignore next */
  return 'SKIP';
}

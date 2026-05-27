// backend/src/classifier-v2/db/predicate-dsl.ts
//
// Predicate DSL discriminated union — encodes notes_claims.predicate JSONB.
// Spec: backend/docs/sub-specs/01-verifier-rules.md §"Rules 7/8/9 — Predicate DSL".
//
// Three-valued semantics (PASS / FAIL / SKIP) implemented by the verifier
// evaluator (`backend/src/classifier-v2/verifier/predicate-eval.ts`, TBD).
//
// All `var` references resolve against `tariff_line_attributes[code]` plus the
// reserved candidate-context vars added by sub-spec 04:
//   candidate.chapter, candidate.heading, candidate.subheading, candidate.section.

export type PredicateScalar = string | number | boolean | null;

// ---- Leaf predicates ----

export interface PredicateEq {
  op: '==';
  var: string;
  value: PredicateScalar;
}

export interface PredicateNeq {
  op: '!=';
  var: string;
  value: PredicateScalar;
}

export interface PredicateGt {
  op: '>';
  var: string;
  value: number;
}

export interface PredicateGte {
  op: '>=';
  var: string;
  value: number;
}

export interface PredicateLt {
  op: '<';
  var: string;
  value: number;
}

export interface PredicateLte {
  op: '<=';
  var: string;
  value: number;
}

export interface PredicateExists {
  op: 'EXISTS';
  var: string;
}

export interface PredicateIn {
  op: 'IN';
  var: string;
  values: PredicateScalar[];
}

export interface PredicateNotIn {
  op: 'NOT_IN';
  var: string;
  values: PredicateScalar[];
}

// ARRAY_CONTAINS — semantically explicit array-membership check.
// PASS iff `value ∈ tariff_line_attributes[code][var]` (the array attribute
// contains the scalar value). Distinct from `IN` (which tests whether a scalar
// var is one of several scalar candidates). Use this for array-typed columns:
// material, form, function_, intended_use, processing_state, composition.
// Missing-key policy: SKIP (same as all leaf ops).
export interface PredicateArrayContains {
  op: 'ARRAY_CONTAINS';
  var: string;
  value: PredicateScalar;
}

// ARRAY_OVERLAPS — set-intersection check on array attributes.
// PASS iff `tariff_line_attributes[code][var]` shares at least one element
// with `values[]`. Postgres-equivalent: `arr && ARRAY[v1, v2, ...]`.
// Missing-key policy: SKIP.
export interface PredicateArrayOverlaps {
  op: 'ARRAY_OVERLAPS';
  var: string;
  values: PredicateScalar[];
}

// ---- Compound predicates ----

export interface PredicateAnd {
  op: 'AND';
  clauses: Predicate[];
}

export interface PredicateOr {
  op: 'OR';
  clauses: Predicate[];
}

export interface PredicateNot {
  op: 'NOT';
  clause: Predicate;
}

export interface PredicateImplies {
  op: 'IMPLIES';
  antecedent: Predicate;
  consequent: Predicate;
}

// ---- Union ----

export type Predicate =
  | PredicateEq
  | PredicateNeq
  | PredicateGt
  | PredicateGte
  | PredicateLt
  | PredicateLte
  | PredicateExists
  | PredicateIn
  | PredicateNotIn
  | PredicateArrayContains
  | PredicateArrayOverlaps
  | PredicateAnd
  | PredicateOr
  | PredicateNot
  | PredicateImplies;

// ---- Audit-trail types ----

export type PredicateEvalResult = 'PASS' | 'FAIL' | 'SKIP';

// Leaf-only op set — excludes compound combinators (AND/OR/NOT/IMPLIES) which
// do not have a `var` field and therefore cannot be referenced from a
// PredicateRef audit-trail entry.
export type PredicateLeafOp = Exclude<
  Predicate,
  PredicateAnd | PredicateOr | PredicateNot | PredicateImplies
>['op'];

export interface PredicateRef {
  notes_claim_id: number;
  var: string;
  op: PredicateLeafOp;
}

// backend/src/classifier-v2/db/types.ts
//
// TypeScript interfaces for the Phase 4 build-time database tables.
// Field names match the DB columns (snake_case) so query-result rows can be
// assigned directly without remapping.
//
// Tables: notes_claims, tariff_line_attributes, question_templates.
// Applied 2026-05-26 via Supabase MCP migrations (Phase 4.0 prep).

import type { Predicate } from './predicate-dsl';

// ============================================================
// notes_claims
// ============================================================

export type NotesClaimSourceKind =
  | 'chapter_note'
  | 'section_note'
  | 'subheading_note'
  | 'heading_note';

export type NotesClaimType =
  | 'inclusion'
  | 'exclusion'
  | 'definition'
  | 'condition'
  | 'redirect';

export interface NotesClaimRedirect {
  chapter?: string;
  heading?: string[];
}

export interface NotesClaim {
  id: number;
  source_ref: string;
  source_kind: NotesClaimSourceKind;
  applies_to: string[];
  claim_type: NotesClaimType;
  claim_text: string;
  predicate: Predicate;
  redirects_to: NotesClaimRedirect | null;
  extraction_model: string | null;
  extraction_notes: string | null;
  validated: boolean;
  created_at: string;
}

// ============================================================
// tariff_line_attributes
// ============================================================
//
// NOTE: `function_` carries a trailing underscore at both the DB layer
// (Postgres reserved-word adjacency) and the TS layer (to match exactly).
// Consumers that need `function` as the public-facing key should map at
// the read boundary.

export type FabricConstruction =
  | 'knitted'
  | 'crocheted'
  | 'woven'
  | 'wadding'
  | 'other';

export type ChemicalClass =
  | 'separate_organic_compound'
  | 'separate_inorganic_compound'
  | 'isomer_mixture'
  | 'sugar_derivative'
  | 'diazonium_salt'
  | 'other';

export type SolutionPurpose = 'safety_transport' | 'specific_use' | 'none';

export type IntendedRole =
  | 'packaging'
  | 'support'
  | 'technical_use'
  | 'implant'
  | 'optical_element'
  | 'other';

export type ValidationStatus = 'pending' | 'validated' | 'flagged';

export interface CompositeComponent {
  name: string;
  material: string;
  role: 'primary' | 'secondary' | 'auxiliary';
}

// PK is `code` (FK → tariff_lines.code); no surrogate id — 1:1 sidecar table.
export interface TariffLineAttributes {
  code: string;

  // Core string-array attributes
  material: string[];
  form: string[];
  function_: string[];
  intended_use: string[];
  processing_state: string[];
  composition: string[];

  // Composite components (GIR-3(b))
  composite_components: CompositeComponent[] | null;

  // Numeric composition (Ch.71-83 metals)
  carbon_pct: number | null;
  chromium_pct: number | null;
  manganese_pct: number | null;
  nickel_pct: number | null;
  silicon_pct: number | null;
  phosphorus_pct: number | null;
  aluminum_pct: number | null;
  boron_pct: number | null;
  cobalt_pct: number | null;
  copper_pct: number | null;
  lead_pct: number | null;
  molybdenum_pct: number | null;
  niobium_pct: number | null;
  titanium_pct: number | null;
  tungsten_pct: number | null;
  vanadium_pct: number | null;
  zirconium_pct: number | null;
  iron_pct: number | null;
  predominant_element: string | null;

  // Granule sieve (Ch.72 Note 1(h))
  sieve_pass_pct_1mm: number | null;
  sieve_pass_pct_5mm: number | null;

  // Textile (Ch.61/62)
  made_up: boolean | null;
  fabric_construction: FabricConstruction | null;

  // Electrical (Ch.85)
  electrically_warmed: boolean | null;
  wearable: boolean | null;
  electrically_heated: boolean | null;

  // Chemical (Ch.27/29)
  chemical_class: ChemicalClass | null;
  in_solution: boolean | null;
  solution_purpose: SolutionPurpose | null;

  // Role/intent (Ch.90 — high SKIP risk)
  intended_role: IntendedRole | null;

  // Metadata
  extracted_at: string | null;
  extraction_model: string | null;
  extraction_notes: string | null;
  validation_status: ValidationStatus;
}

// Discriminating-attribute keys used by the QGS info-gain formula.
// (sub-spec 02 §A — uniform prior, ATTRIBUTE_KEYS.)
export const QGS_ATTRIBUTE_KEYS = [
  'material',
  'form',
  'function_',
  'intended_use',
  'processing_state',
  'composition',
] as const;
export type QGSAttributeKey = (typeof QGS_ATTRIBUTE_KEYS)[number];

// ============================================================
// question_templates
// ============================================================

export interface QuestionTemplate {
  id: number;
  discriminating_attribute: string;
  chapter_scope: string[] | null;
  question_text: string;
  value_labels: Record<string, string>;
  notes: string | null;
  curator: string | null;
  validated: boolean;
  created_at: string;
}

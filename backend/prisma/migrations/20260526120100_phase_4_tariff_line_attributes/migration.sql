-- Phase 4.0: tariff_line_attributes table
-- Per sub-spec 01 base + sub-spec 04 expanded numeric fields (~30 fields).
-- Stores structured product attributes for all 12,460 tariff_lines, extracted offline by Opus 4.7 (O2 job).
--
-- Applied to live DB via Supabase MCP apply_migration on 2026-05-26
-- (migration name: create_tariff_line_attributes_table).

CREATE TABLE tariff_line_attributes (
  code              TEXT PRIMARY KEY REFERENCES tariff_lines(code) ON DELETE CASCADE,

  -- Core string-array attributes
  material          TEXT[]   DEFAULT '{}',
  form              TEXT[]   DEFAULT '{}',
  -- function_ has trailing underscore: 'function' is a Postgres reserved word; underscore
  -- is propagated to the TS field name via db/types.ts for snake_case mirroring.
  function_         TEXT[]   DEFAULT '{}',
  intended_use      TEXT[]   DEFAULT '{}',
  processing_state  TEXT[]   DEFAULT '{}',
  composition       TEXT[]   DEFAULT '{}',

  -- Composite components (GIR-3(b))
  composite_components JSONB DEFAULT NULL,

  -- Numeric composition (Ch.71-83 metals)
  carbon_pct        NUMERIC,
  chromium_pct      NUMERIC,
  manganese_pct     NUMERIC,
  nickel_pct        NUMERIC,
  silicon_pct       NUMERIC,
  phosphorus_pct    NUMERIC,
  aluminum_pct      NUMERIC,
  boron_pct         NUMERIC,
  cobalt_pct        NUMERIC,
  copper_pct        NUMERIC,
  lead_pct          NUMERIC,
  molybdenum_pct    NUMERIC,
  niobium_pct       NUMERIC,
  titanium_pct      NUMERIC,
  tungsten_pct      NUMERIC,
  vanadium_pct      NUMERIC,
  zirconium_pct     NUMERIC,
  iron_pct          NUMERIC,
  predominant_element TEXT,

  -- Granule sieve (Ch.72 Note 1(h))
  sieve_pass_pct_1mm  NUMERIC,
  sieve_pass_pct_5mm  NUMERIC,

  -- Textile (Ch.61/62)
  made_up           BOOLEAN,
  fabric_construction TEXT CHECK (fabric_construction IS NULL OR fabric_construction IN ('knitted','crocheted','woven','wadding','other')),

  -- Electrical (Ch.85)
  electrically_warmed BOOLEAN,
  wearable          BOOLEAN,
  electrically_heated BOOLEAN,

  -- Chemical (Ch.27/29)
  chemical_class    TEXT CHECK (chemical_class IS NULL OR chemical_class IN ('separate_organic_compound','isomer_mixture','sugar_derivative','diazonium_salt','other')),
  in_solution       BOOLEAN,
  solution_purpose  TEXT CHECK (solution_purpose IS NULL OR solution_purpose IN ('safety_transport','specific_use','none')),

  -- Role/intent (Ch.90, lower priority — high SKIP risk)
  intended_role     TEXT CHECK (intended_role IS NULL OR intended_role IN ('packaging','support','technical_use','implant','optical_element','other')),

  -- Metadata
  extracted_at      TIMESTAMPTZ,
  extraction_model  TEXT DEFAULT 'claude-opus-4-7',
  extraction_notes  TEXT,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','validated','flagged'))
);

CREATE INDEX idx_tla_material  ON tariff_line_attributes USING GIN(material);
CREATE INDEX idx_tla_form      ON tariff_line_attributes USING GIN(form);
CREATE INDEX idx_tla_func      ON tariff_line_attributes USING GIN(function_);
CREATE INDEX idx_tla_use       ON tariff_line_attributes USING GIN(intended_use);
CREATE INDEX idx_tla_predominant ON tariff_line_attributes(predominant_element);

-- RLS: public-read, matches project convention. service_role bypasses for backend writes.
ALTER TABLE tariff_line_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tariff_line_attributes_public_read"
  ON tariff_line_attributes FOR SELECT
  TO anon, authenticated
  USING (true);

-- NOTE: `function_` is named with a trailing underscore because `function` is a Postgres reserved word.
-- TypeScript layer can expose this as `function` via mapping.

-- Rollback:
--   DROP POLICY IF EXISTS "tariff_line_attributes_public_read" ON tariff_line_attributes;
--   DROP TABLE IF EXISTS tariff_line_attributes;

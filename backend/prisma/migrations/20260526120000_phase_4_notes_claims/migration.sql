-- Phase 4.0: notes_claims table
-- Stores predicate-DSL-encoded claims extracted from chapter/section/subheading notes.
-- Used by Verifier Rules 7/8/9 (notes-conformance) per sub-spec 01.
--
-- Applied to live DB via Supabase MCP apply_migration on 2026-05-26
-- (migration name: create_notes_claims_table).

CREATE TABLE notes_claims (
  id              BIGSERIAL PRIMARY KEY,
  source_ref      TEXT NOT NULL,
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('chapter_note','section_note','subheading_note','heading_note')),
  applies_to      TEXT[] NOT NULL,
  claim_type      TEXT NOT NULL CHECK (claim_type IN ('inclusion','exclusion','definition','condition','redirect')),
  claim_text      TEXT NOT NULL,
  predicate       JSONB NOT NULL,
  redirects_to    JSONB,
  extraction_model TEXT DEFAULT 'claude-opus-4-7',
  extraction_notes TEXT,
  validated       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_claims_applies_to ON notes_claims USING GIN(applies_to);
CREATE INDEX idx_notes_claims_source_kind ON notes_claims(source_kind);
CREATE INDEX idx_notes_claims_claim_type ON notes_claims(claim_type);

-- RLS: public-read, matches project convention. service_role bypasses for backend writes.
ALTER TABLE notes_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_claims_public_read"
  ON notes_claims FOR SELECT
  TO anon, authenticated
  USING (true);

-- Rollback:
--   DROP POLICY IF EXISTS "notes_claims_public_read" ON notes_claims;
--   DROP TABLE IF EXISTS notes_claims;

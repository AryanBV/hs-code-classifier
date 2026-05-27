-- Phase 4.0: question_templates table
-- Stores curated QGS templates (Phase 4.0 O3 job output). Per sub-spec 02 §A.7.
--
-- Applied to live DB via Supabase MCP apply_migration on 2026-05-26
-- (migration name: create_question_templates_table).

CREATE TABLE question_templates (
  id                       BIGSERIAL PRIMARY KEY,
  discriminating_attribute TEXT NOT NULL,
  chapter_scope            TEXT[],
  question_text            TEXT NOT NULL,
  value_labels             JSONB NOT NULL,
  notes                    TEXT,
  curator                  TEXT DEFAULT 'claude-opus-4-7',
  validated                BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_qt_attr ON question_templates(discriminating_attribute);
CREATE INDEX idx_qt_chapter_scope ON question_templates USING GIN(chapter_scope);

-- RLS: public-read, matches project convention. service_role bypasses for backend writes.
ALTER TABLE question_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "question_templates_public_read"
  ON question_templates FOR SELECT
  TO anon, authenticated
  USING (true);

-- Rollback:
--   DROP POLICY IF EXISTS "question_templates_public_read" ON question_templates;
--   DROP TABLE IF EXISTS question_templates;

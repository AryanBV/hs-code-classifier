-- Phase 2f: Normalized HS schema (full normalized hierarchy + rules-aware extras)
--
-- Creates the full hierarchy alongside the legacy hs_codes table.
--
-- Hierarchy (FK-enforced):
--   sections (Roman numeral, e.g. "II")
--     -> chapters (2-digit, e.g. "09")
--         -> headings (4-digit, e.g. "0901")
--             -> subheadings (6-digit with dot, e.g. "0901.21")
--                 -> tariff_lines (8-digit with dots, e.g. "0901.21.00")
--
-- Plus rules-aware sidecars:
--   chapter_exclusions (structured "Chapter X does not cover Y" clauses, with FK redirect)
--   policy_conditions (chapter-scoped or code-scoped export policy/licensing clauses)
--
-- Legacy `hs_codes` table is not touched by this migration. A follow-up
-- step (after row-count validation) drops legacy tables: hs_codes,
-- hs_code_hierarchy, product_synonyms, differentiators.

-- ============================================================
-- pgvector extension (for tariff_lines.embedding semantic search)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- sections
-- ============================================================
CREATE TABLE "sections" (
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "sections_pkey" PRIMARY KEY ("section")
);

-- ============================================================
-- chapters — with rules-aware notes categories
-- ============================================================
CREATE TABLE "chapters" (
    "chapter" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "chapter_subheading_notes" JSONB NOT NULL DEFAULT '[]',  -- chapter-wide subheading interpretation rules (Ch.29, 64, 88, 97)
    "supplementary_notes" JSONB NOT NULL DEFAULT '[]',        -- India-specific tariff-item clarifications (Ch.29)
    "export_licensing_notes" JSONB NOT NULL DEFAULT '[]',     -- chapter-specific export policy clarifications
    "definitions" JSONB NOT NULL DEFAULT '[]',                -- legally-decisive Ch.64 outer sole / upper / rubber / leather
    "extraction_warnings" JSONB NOT NULL DEFAULT '[]',
    "notes_sources" JSONB NOT NULL DEFAULT '{}',              -- e.g. { wco_patch_source, wco_patch_fetched_at }
    "source_pdf" TEXT,
    "extracted_at" TIMESTAMPTZ,
    "verified_against_wco_at" TIMESTAMPTZ,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("chapter")
);

CREATE INDEX "idx_chapters_section" ON "chapters"("section");

ALTER TABLE "chapters"
    ADD CONSTRAINT "chapters_section_fkey"
    FOREIGN KEY ("section") REFERENCES "sections"("section")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- headings
-- ============================================================
CREATE TABLE "headings" (
    "heading" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "headings_pkey" PRIMARY KEY ("heading")
);

CREATE INDEX "idx_headings_chapter" ON "headings"("chapter");

ALTER TABLE "headings"
    ADD CONSTRAINT "headings_chapter_fkey"
    FOREIGN KEY ("chapter") REFERENCES "chapters"("chapter")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- subheadings — with WCO compliance flags
-- ============================================================
CREATE TABLE "subheadings" (
    "subheading" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "india_specific" BOOLEAN NOT NULL DEFAULT FALSE,         -- TRUE if this is an India national subdivision not in WCO HS 2022
    "wco_2022_match" BOOLEAN NOT NULL DEFAULT TRUE,           -- FALSE if 6-digit code doesn't appear in WCO HS 2022 global list
    "india_specific_note" TEXT,                               -- explanation when india_specific=TRUE

    CONSTRAINT "subheadings_pkey" PRIMARY KEY ("subheading")
);

CREATE INDEX "idx_subheadings_heading" ON "subheadings"("heading");

ALTER TABLE "subheadings"
    ADD CONSTRAINT "subheadings_heading_fkey"
    FOREIGN KEY ("heading") REFERENCES "headings"("heading")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- chapter_exclusions — structured exclusion clauses
-- ============================================================
CREATE TABLE "chapter_exclusions" (
    "id" SERIAL NOT NULL,
    "source_chapter" TEXT NOT NULL,
    "excluded_product_text" TEXT NOT NULL,
    "redirects_to_chapter" TEXT,
    "redirects_to_heading" TEXT,
    "source_note_number" TEXT,
    "source_note_text" TEXT,

    CONSTRAINT "chapter_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_excl_source_chapter" ON "chapter_exclusions"("source_chapter");
CREATE INDEX "idx_excl_redirect_chapter" ON "chapter_exclusions"("redirects_to_chapter");
CREATE INDEX "idx_excl_text_fts" ON "chapter_exclusions"
    USING GIN (to_tsvector('english', "excluded_product_text"));

ALTER TABLE "chapter_exclusions"
    ADD CONSTRAINT "chapter_exclusions_source_fkey"
    FOREIGN KEY ("source_chapter") REFERENCES "chapters"("chapter")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chapter_exclusions"
    ADD CONSTRAINT "chapter_exclusions_redirect_ch_fkey"
    FOREIGN KEY ("redirects_to_chapter") REFERENCES "chapters"("chapter")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chapter_exclusions"
    ADD CONSTRAINT "chapter_exclusions_redirect_hd_fkey"
    FOREIGN KEY ("redirects_to_heading") REFERENCES "headings"("heading")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- policy_conditions — attachable to a chapter or specific code
-- ============================================================
CREATE TABLE "policy_conditions" (
    "id" SERIAL NOT NULL,
    "chapter" TEXT,
    "code" TEXT,
    "condition_number" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "policy_conditions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pc_chapter_or_code_chk" CHECK (("chapter" IS NOT NULL) <> ("code" IS NOT NULL))
);

CREATE INDEX "idx_pc_chapter" ON "policy_conditions"("chapter");
CREATE INDEX "idx_pc_code" ON "policy_conditions"("code");

ALTER TABLE "policy_conditions"
    ADD CONSTRAINT "pc_chapter_fkey"
    FOREIGN KEY ("chapter") REFERENCES "chapters"("chapter")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- tariff_lines — the 8-digit leaf level (replaces legacy hs_codes)
-- ============================================================
CREATE TABLE "tariff_lines" (
    "code" TEXT NOT NULL,                                     -- "NNNN.NN.NN" with dots
    "subheading" TEXT NOT NULL,                               -- FK to subheadings
    "description" TEXT NOT NULL,
    "unit" TEXT,                                              -- "kg" | "u" | "l" | null
    "export_policy" TEXT,                                     -- "Free" | "Restricted" | "Prohibited" | null
    "policy_condition" TEXT,                                  -- free-form India export-policy condition text
    "embedding" vector(1536),                                 -- pgvector for semantic search (populated later)

    CONSTRAINT "tariff_lines_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "idx_tl_subheading" ON "tariff_lines"("subheading");
CREATE INDEX "idx_tl_export_policy" ON "tariff_lines"("export_policy");
CREATE INDEX "idx_tl_description_fts" ON "tariff_lines"
    USING GIN (to_tsvector('english', "description"));

ALTER TABLE "tariff_lines"
    ADD CONSTRAINT "tariff_lines_subheading_fkey"
    FOREIGN KEY ("subheading") REFERENCES "subheadings"("subheading")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- pgvector HNSW index will be created post-load (requires data to be present)
-- See backend/scripts/create-hnsw-index.ts after the load step.

-- ============================================================
-- code prefix consistency constraints (defence-in-depth)
-- ============================================================
ALTER TABLE "headings"
    ADD CONSTRAINT "headings_prefix_chk" CHECK (LEFT("heading", 2) = "chapter");

ALTER TABLE "subheadings"
    ADD CONSTRAINT "subheadings_prefix_chk" CHECK (LEFT("subheading", 4) = "heading");

ALTER TABLE "tariff_lines"
    ADD CONSTRAINT "tariff_lines_prefix_chk" CHECK (LEFT("code", 7) = "subheading");

-- ============================================================
-- Format-validation constraints (length + dot positions)
-- ============================================================
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_format_chk" CHECK ("chapter" ~ '^\d{2}$');
ALTER TABLE "headings" ADD CONSTRAINT "headings_format_chk" CHECK ("heading" ~ '^\d{4}$');
ALTER TABLE "subheadings" ADD CONSTRAINT "subheadings_format_chk" CHECK ("subheading" ~ '^\d{4}\.\d{2}$');
ALTER TABLE "tariff_lines" ADD CONSTRAINT "tariff_lines_format_chk" CHECK ("code" ~ '^\d{4}\.\d{2}\.\d{2}$');

-- Phase 2f: Normalized HS schema (additive migration)
--
-- Creates new tables alongside the existing hs_codes table.
-- The legacy hs_codes table is NOT modified or dropped by this migration —
-- that happens in a follow-up Phase 2g migration after the new tables are
-- populated and validated.
--
-- Hierarchy:
--   sections (Roman numeral, e.g. "II")
--     -> chapters (2-digit, e.g. "09")
--         -> headings (4-digit, e.g. "0901")
--             -> subheadings (6-digit with dot, e.g. "0901.21")
--
-- Tariff lines (10-digit) continue to live in hs_codes for now. Phase 2g
-- will add a subheading FK to hs_codes and drop the denormalized notes JSONB.

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
-- chapters
-- ============================================================
CREATE TABLE "chapters" (
    "chapter" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "source_pdf" TEXT,
    "extracted_at" TIMESTAMPTZ,
    "verified_against_cbic_at" TIMESTAMPTZ,

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
-- subheadings
-- ============================================================
CREATE TABLE "subheadings" (
    "subheading" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" JSONB NOT NULL DEFAULT '[]',

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

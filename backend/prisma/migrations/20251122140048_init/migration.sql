-- CreateTable
CREATE TABLE "hs_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "chapter" VARCHAR(2) NOT NULL,
    "heading" VARCHAR(4) NOT NULL,
    "subheading" VARCHAR(6) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "description" TEXT NOT NULL,
    "keywords" TEXT[],
    "common_products" TEXT[],
    "parent_code" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hs_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_trees" (
    "id" SERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "decision_flow" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_trees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_classifications" (
    "id" SERIAL NOT NULL,
    "session_id" VARCHAR(100),
    "product_description" TEXT NOT NULL,
    "category_detected" VARCHAR(100),
    "questionnaire_answers" JSONB,
    "suggested_hs_code" VARCHAR(20),
    "confidence_score" INTEGER,
    "country_code" VARCHAR(2),
    "user_feedback" VARCHAR(20),
    "corrected_code" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_mappings" (
    "id" SERIAL NOT NULL,
    "india_code" VARCHAR(20) NOT NULL,
    "country" VARCHAR(50) NOT NULL,
    "local_code" VARCHAR(20) NOT NULL,
    "import_duty_rate" VARCHAR(50),
    "special_requirements" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_code" ON "hs_codes"("code");

-- CreateIndex
CREATE INDEX "idx_country_code" ON "hs_codes"("country_code");

-- CreateIndex
CREATE INDEX "idx_chapter" ON "hs_codes"("chapter");

-- CreateIndex
CREATE INDEX "idx_heading" ON "hs_codes"("heading");

-- CreateIndex
CREATE UNIQUE INDEX "decision_trees_category_name_key" ON "decision_trees"("category_name");

-- CreateIndex
CREATE INDEX "idx_session" ON "user_classifications"("session_id");

-- CreateIndex
CREATE INDEX "idx_suggested_code" ON "user_classifications"("suggested_hs_code");

-- CreateIndex
CREATE INDEX "idx_category" ON "user_classifications"("category_detected");

-- CreateIndex
CREATE INDEX "idx_created_at" ON "user_classifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_india_code" ON "country_mappings"("india_code");

-- CreateIndex
CREATE INDEX "idx_country" ON "country_mappings"("country");

-- CreateIndex
CREATE UNIQUE INDEX "country_mappings_india_code_country_key" ON "country_mappings"("india_code", "country");

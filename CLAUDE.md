# CLAUDE.md — Project Context

## What This Is

ITC-HS code classification platform for Indian SME exporters. Takes a product description (e.g., "stainless steel hex bolts M10"), returns the correct 8-digit ITC-HS code with trade intelligence.

**Stage:** Pre-revenue MVP. Solo founder. Bootstrapped.

## Architecture

### Backend: `backend/` — Express.js + TypeScript

Entry point: `backend/src/index.ts` — Express app on port 3000 (configurable via `PORT` env var).
API router: `backend/src/api/classify.ts` — 3 endpoints:
- `POST /api/classify` — Main classification. Body: `{ query: string, previousAnswers?: Record<string, string> }`. Returns `ClassificationResult` with `responseType: 'classification' | 'question'`.
- `POST /api/classify/answer` — Continue after clarifying question. Body: `{ originalQuery, answerId, answerLabel }`.
- `GET /api/classify/health` — Health check.

### Classification Pipeline

**Note (2026-05-26):** This describes the LEGACY classifier in `backend/src/classifier/`. The new Phase 4 v2 architecture (in `backend/src/classifier-v2/`, not yet implemented) is documented at `backend/docs/ARCHITECTURE.md`.

5-stage pipeline orchestrated by `backend/src/classifier/index.ts` (exports `classify()`, `continueWithAnswer()`):

**Stage 0 — Specificity Analysis** (`backend/src/classifier/specificity-analyzer.ts`)
`analyzeSpecificity(query)` does keyword-based attribute extraction via `quickExtractAttributes()`. Scores completeness 0-100 via `calculateCompletenessScore()`. If score < 50, returns a clarifying question. No LLM call.

**Stage 1 — Attribute Extraction** (`backend/src/classifier/attribute-extractor.ts`)
`extractAttributes(query)` calls GPT-4o-mini to extract: material, form, function, intended_use, processing_state, composition. Also exports `generateEmbedding(text)` (text-embedding-3-small, 384-dim) and `createSearchQuery(attrs)`.

**Stage 2 — Chapter Routing** (`backend/src/classifier/chapter-router.ts`)
`routeToChapter(attrs)` tries 35 hard-coded rules first via `applyChapterRules()` from `backend/src/rules/chapter-rules.ts` (95% confidence). If no rule matches: semantic search top 30 → group by chapter → fetch chapter notes + GIRs → LLM picks chapter. Fallback: top semantic match at 60%.

**Stage 3 — Heading Search** (`backend/src/classifier/heading-searcher.ts`)
`findHeading(attrs, chapter)` tries rule-based heading selection for known patterns (vehicle parts, coffee, spices, textiles). Falls back to pgvector semantic search within chapter at heading level (LENGTH=4). Returns top match + up to 5 alternatives.

**Stage 4-5 — Code Selection** (`backend/src/classifier/code-selector.ts`)
`selectCode(attrs, heading)` gets all 8-digit codes under the heading. If 1 code → 95% confidence. If 0 → heading+".00.00" at 70%. If 2-5 → LLM picks. If 5+ → semantic search narrows to 5, then LLM.

**Confidence formula:** `(40% × chapter_confidence) + (30% × heading_similarity × 100) + (30% × code_confidence)`

Types: `backend/src/classifier/types.ts` — all interfaces (ExtractedAttributes, ClassificationResult, ChapterRoutingResult, HeadingSearchResult, CodeSelectionResult, ChapterRule, QuestionResponse).

### Frontend: `frontend/` — Next.js 14 + TypeScript + Tailwind

Pages (App Router):
- `/` (`frontend/src/app/page.tsx`) — Landing with hero, stats, value props
- `/classify` (`frontend/src/app/classify/page.tsx`) — Wizard-based classification
- `/history` (`frontend/src/app/history/page.tsx`) — Past classifications

Wizard flow (`frontend/src/components/wizard/`): `wizard-container.tsx` orchestrates via `use-wizard.ts` hook.
Screens: `input-screen` → `loading-screen` → `question-screen` (if needed) → `result-screen` | `error-screen`.
API client: `frontend/src/lib/api-client.ts` — Axios client pointing to `NEXT_PUBLIC_API_URL`.

### Database: Supabase (PostgreSQL + pgvector)
**Project:** `waowoznsvaosgcgiivzo` (region ap-northeast-1, Postgres 17)
**Schema (Phase 2f normalized — applied May 2026):** 7 FK-enforced tables with strict CHECK constraints

| Table | Rows | Purpose |
|---|---|---|
| `sections` | 21 | Roman numeral groupings (I..XXI) |
| `chapters` | 97 | 2-digit, FK→sections, with 7 JSONB note columns (notes, chapter_subheading_notes, supplementary_notes, export_licensing_notes, definitions, extraction_warnings, notes_sources) |
| `headings` | 1,232 | 4-digit, FK→chapters |
| `subheadings` | 5,613 | 6-digit "NNNN.NN", FK→headings, flags: india_specific, wco_2022_match, india_specific_note |
| `tariff_lines` | 12,460 | 8-digit "NNNN.NN.NN", FK→subheadings, columns: description, unit (NULL for now), export_policy, policy_condition, embedding (vector 1536, 19,402 hierarchical embeddings populated per 2026-05-26 DB inspection) |
| `chapter_exclusions` | 1,505 | Structured "Ch.X does not cover Y → redirects to Z" rules (Phase 3.5 +352 net after cleanup). `redirects_to_chapter` is text[] (Phase 3.5 A5); trigger-validated against chapters table. |
| `policy_conditions` | 0 | Sidecar; current Indian policy data lives at tariff_line level via `policy_condition` field |

**Code formats (DB-enforced via CHECK constraints):**
- Chapter: regex `^\d{2}$`
- Heading: regex `^\d{4}$` AND `LEFT(heading, 2) = chapter`
- Subheading: regex `^\d{4}\.\d{2}$` AND `LEFT(subheading, 4) = heading`
- Tariff line: regex `^\d{4}\.\d{2}\.\d{2}$` AND `LEFT(code, 7) = subheading`

**RLS:** Enabled on all 7 tables with public-read policy. service_role bypasses RLS for backend writes.

**Legacy `hs_codes` table dropped.** Backup at `backend/backups/legacy-tables-2026-05-22T20-01-56.json` (156 MB, gitignored).

### External APIs
- **Vertex AI (Gemini)** — Phase 4 v2 runtime LLM + embedding stack. Auth via service-account JSON at `backend/.gcp/vertex-sa.json` (`GOOGLE_APPLICATION_CREDENTIALS`). Models: `gemini-3.5-flash` (Triage+Select) and `gemini-3.1-pro-preview` (Tiebreak+Deep-Think). **Embeddings = `gemini-embedding-001` @1536-dim** (M1 migration 2026-05-29, replacing Cohere). Reranking = Gemini-Flash. GDP Premium GenAI Credit-covered through 2027-05-08 — runtime Gemini/embeddings are credit-covered, do NOT conserve.
- **Cohere** — ⚠️ **DECOMMISSIONED from the v2 runtime/eval path as of M1 (2026-05-29).** Retrieval migrated OFF Cohere onto Vertex `gemini-embedding-001` + Gemini-Flash rerank; the Trial-key 429 blocker is RESOLVED by removal. Do NOT re-introduce a Cohere-key dependency. (`backend/src/classifier-v2/lib/cohere-client.ts` may still exist but is off the path.)
- **OpenAI** — `OPENAI_API_KEY` available in env. Used by LEGACY classifier (GPT-4o-mini + text-embedding-3-small). For v2 runtime use: ASK USER FIRST before invoking — default v2 plan does NOT use OpenAI at runtime.
- **Anthropic (Claude)** — via user's Claude Max subscription, NOT via API key (no Anthropic API key in env). Build-time only (offline data engineering jobs O1-O5 using Opus 4.7). Not deployable as a runtime service.
- **Supabase** — PostgreSQL database + pgvector for semantic search.

## Key Data Files

- `backend/src/rules/chapter-rules.ts` — 35 deterministic chapter routing rules with priority ordering (103 to 49). Exports `applyChapterRules(attrs)`, `getPotentialChapters(attrs)`.
- `backend/src/data/gir-rules.ts` — General Interpretive Rules 1-6 with examples and legal basis. Exports `getGIRRule()`, `getAllGIRRules()`, `formatGIRsForPrompt()`, `getGIRSummary()`.
- `backend/src/data/confusing-chapter-pairs.ts` — 8 confusing chapter pairs (e.g., 42/43 leather vs fur, 61/62 knitted vs woven, 09/21 raw vs instant coffee). Exports `detectConfusingPair()`, `isConfusingPair()`.
- `backend/src/data/chapter-triggers.json` — Keyword triggers mapping product terms to HS chapters.
- `backend/src/data/elimination-rules.json` — Product variety exclusion rules (coffee types, tea varieties, rice grades, etc.).

## NPM Scripts

### Backend (`cd backend`)
- `npm run dev` — Dev server with hot reload (ts-node-dev, port 3000)
- `npm run build` — Compile TypeScript (`tsc`)
- `npm start` — Production (`node dist/index.js`)
- `npm run prisma:generate` / `prisma:push` / `prisma:migrate` / `prisma:studio` / `prisma:seed` — Database management
- `npm run test:integration` — 28 integration test cases
- `npm run test:comprehensive` — Full test runner
- `npm run test:integration:notes` — Pipeline + notes integration (3-layer)
- `npm run test:baseline:before` / `test:baseline:after` / `test:baseline:compare` — Before/after comparison

### Frontend (`cd frontend`)
- `npm run dev` — Next.js dev server (port 3000)
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm run type-check` — TypeScript validation (`tsc --noEmit`)

## Environment Variables

### Backend (`backend/.env`)
- `DATABASE_URL` — Supabase PostgreSQL connection (pooled, port 6543)
- `DIRECT_URL` — Direct PostgreSQL connection (for Prisma migrations, port 5432)
- `OPENAI_API_KEY` — OpenAI API authentication
- `PORT` — Server port (default: 3000)
- `NODE_ENV` — development | production
- `FRONTEND_URL` — CORS allowed origins (comma-separated)
- `RATE_LIMIT_WINDOW_MS` — Rate limit window in ms (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS` — Max requests per window (default: 100)
- `DISABLE_CHAPTER_NOTES` — Set "true" to disable chapter notes in LLM prompts (A/B testing)

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_API_URL` — Backend API base URL (default: http://localhost:3001)

## ⚠️ Critical Gotchas

### 1. Code format constraints (DB-enforced)
The new schema uses regex CHECK constraints — bad codes physically cannot be inserted. Query by exact format: chapter="01", heading="0101", subheading="0101.21", tariff_line.code="0101.21.00". No more LENGTH bug (that was the legacy schema).

### 2. Chapter Notes JSONB Structure
The `hs_codes.notes` JSONB field contains: chapterNotes (array), sectionNotes (array), policyConditions (string|null), exportLicensingNotes (string|null).
Data quality status (post-Phase-2):
- All 97 chapters have verified notes (4 outlier chapters Ch.50/53/64/81 patched from WCO HS 2022 / UK HMRC trade-tariff)
- 99.4% export_policy coverage at tariff_line level (76 PDF-blank NULLs verified legitimate)
- 1,505 chapter_exclusion rules with array-redirects + trigger validation (Phase 3.5 enriched +352 net; rules-aware foundation for Phase 6)
- 7 india_specific subheadings flagged where India retained pre-HS-2022 codes

### 3. OpenAI Response Format
Use `json_schema` (strict structured outputs) NOT `json_object`. The json_object mode doesn't guarantee schema compliance.

## What NOT to Do
- DO NOT change classifier/ files without running tests afterward
- DO NOT change data/ files without understanding the classification rules they encode
- DO NOT hardcode API keys — always use process.env
- DO NOT commit .env files
- DO NOT bypass the DB-level CHECK constraints by raw SQL with malformed codes — they're defense-in-depth, not a nuisance

## Test Structure

Tests in `backend/src/tests/` (24 .ts files):
- `integration-test.ts` — 28 cases across 7 categories (Vehicle Parts, Coffee, Cement, Textiles, Spices, Pharma, Electronics)
- `runners/comprehensive-test-runner.ts` — Full test suite
- `integration/pipeline-notes-integration.test.ts` — 3-layer pipeline test (Proof: 5, Regression: 5, Diversity: 6)
- `baseline/` — Before/after comparison (run-baseline.ts, compare-results.ts)
- `audit/` — Specialized tests (semantic search, chapter notes, LLM-only bypass)

Test case format:
```ts
{ query: 'ceramic brake pads for heavy trucks', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' }
```

## Current Status (2026-05-29)

**Branch:** `feat/phase-4-pipeline-build` — work **COMMITTED at `059cf76`** (checkpoint) plus a follow-up docs-correction commit; **working tree clean**. (~9 measured rounds of M1+M2 changes + QGS/answer-sim files are now in history; do NOT push unattended.)

**Authoritative resume brief:** `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md` (per-round narrative, gates, ultimate bars, commands). Pair with memory note `project_vertex_m0_migration`. Eval reports: `backend/eval-results/vertex-m0-*.json` (highest round = latest).

### Phase 4.0 build-time data (DB-backed unless noted)
- Done O1 Notes Claims: 253 rows in `notes_claims` table (50 marked `validated=true`)
- DONE (2026-05-28) O2 Tariff Line Attributes: ALL 12,406 records extracted across 41 chunks + Ch.01 base (12,362 + 44), corpus-verified (0 missing/dup). 100% independently F4-audited PASS (3 defects found & fixed: BIG-72a chromium, BIG-84a refrigeration, SM-12 part-enum). F2 forensics 94.9% sig-diversity. F3 gold-accuracy 95.5% enum / 0.62 array-Jaccard (vs templating-failure 0.12-0.24). Output files in `backend/data/build-time/O2-tariff-line-attributes/chunks/output/` (41 canonical; intermediates in `chunks/_archive/`). INGESTED 2026-05-28: **12,406 rows** in `tariff_line_attributes` (MCP-verified: 0 orphan-FK; composite_components stored as proper jsonb). F5 normalization applied (kept chemical_class='other' 977 recs; dropped 55 OEM-component tokens; Si→silicon). F6 report: `backend/data/build-time/O2-tariff-line-attributes/FINAL-AUDIT-REPORT.md`. 5 ingest-path defects found & fixed (fabric_construction bool→text; 8 BIG→SC filename renames; composite_components jsonb stringify; DATABASE_URL pooled connection; pre-ingest enum hardening).
- Done O3 Question Templates: 51 rows in `question_templates` table (all 8 confusing pairs covered)
- Done O4 India Alias Map: 299 entries at `backend/data/build-time/O4-india-alias-map/aliases.json`
- Done O5 Confusing Pairs: 8 pairs documented at `backend/data/build-time/O5-confusing-pairs/`

### Phase 4.0 schema additions (via Supabase migrations)
- `notes_claims` table (predicate-DSL claims with three-valued evaluator support)
- `tariff_line_attributes` table (41 columns: 6 string-arrays + 18 numeric metal pcts + textile/electrical/chemical/role flags + metadata)
- `question_templates` table (QGS template library)
- Additional GIN indexes on tariff_line_attributes.processing_state + composition
- chemical_class CHECK enum extended with 'separate_inorganic_compound'

### Phase 4.1 runtime layers (491 v2/eval tests passing as of 2026-05-28; was 302)
- Done L0 Input Normalization (`layers/L0-normalization.ts`) — alias map + composite-flag
- Done L1 Triage (`layers/L1-triage.ts`) — Gemini 3.5 Flash, thinking_level=low, constraint_hint-aware
- Done L2 Hybrid Retrieval (`layers/L2-retrieval.ts`) — Vertex `gemini-embedding-001` @1536 (HNSW cosine) + Gemini-Flash reranker + Postgres GIN-FTS (M1 migration 2026-05-29 — superseded Cohere; Cohere OFF the v2 path); direct-leaf-lookup shortcut
- Done L3 Rules Filter (`layers/L3-rules-filter.ts`) — exclusions, multi-dest collapse, single-shot backtrack gate
- Done L4 Select (`layers/L4-select.ts`) — Gemini 3.5 Flash with multi-signal context (chapter_notes + section_notes + notes_claims + tariff_line_attributes + GIRs), components[] for GIR-3(b)
- Done L5 Mechanical Verifier (`layers/L5-verifier.ts`) — all 10 rules + predicate DSL evaluator (three-valued PASS/FAIL/SKIP) + source-ref resolver + ts_rank_cd TF-IDF citation check
- Shared libs: `lib/vertex-client.ts` (raw HTTPS + retry + MaxTokensError), `lib/cohere-client.ts`, `lib/supabase-client.ts` (with withRetry wrapper), `lib/thinking-config.ts` (model-conditional helper for 2.5-pro vs 3.x)

### M1 — Vertex embedding migration — DONE & verified (2026-05-29)
- Corpus 100% re-embedded into `embedding_v2` (`gemini-embedding-001` @1536-dim, all 4 hierarchy levels + HNSW index); `supabase-client` + L5 MV-04 query `embedding_v2`; **Cohere off the runtime/eval path** (Trial-key 429 blocker resolved by removal). Re-embed script: `backend/scripts/reembed-corpus-vertex.ts`.
- **Clean Cohere-free baseline** (`eval-results/vertex-m0-baseline.json`, master suite n=386): routing **78.8%**; on n≈271 completed-classify cases → chapter **93.7%** / heading **90.0%** / 8-digit **72.7%** / weighted **86.3%**. No regression vs Cohere era.

### M2 — routing + leaf precision rounds (r1–r6, all measured & KEPT; eval-gated, uncommitted)
- **Routing recovery (r1–r4):** L0 noise/colon sanitization + L1 ASK→CLASSIFY recalibration + L4 REFUSE recalibration + GIR-2(a)/Section-XVII parts-of-vehicle fix + retrieval host-candidate injection (parts → host chapter). Routing **78.8 → 86.5%**; over-ASK 51→28 and over-REJECT 29→15 (both below baseline). Recovering ~37 borderline cases **diluted** classify accuracy (8-digit 72.7→~68%, weighted 86.3→~84%) — confirmed DILUTION not regression (on 266 shared cases 8-digit HELD 72.2%).
- **Leaf precision (r5–r6):** sibling-comparison-view (diff discriminating `tariff_line_attributes` across same-subheading siblings → surface to L4) + widened metadata-discriminator fetcher (+11 cols: fabric_construction, chemical_class, predominant_element, metal %s, made_up, intended_role…). Per-case wins verified (e.g. TC013 truck-tyre → 4011.20.10). **r6** (`vertex-m0-r6.json`): chapter 92.4 / heading 88.4 / 8-digit **68.0** / weighted 83.9, routing 86.5. **8-digit PLATEAUED ~68% across r4–r6 (noise band) — leaf thread at DATA CEILING** (remaining gap = 19 data-gap leaf cases + dilution; 0 retrieval misses).

### M2 — QGS + answer-simulation eval — BUILT, currently MEASURING (r7-sim, in flight)
- **Answer-simulation eval** (`backend/src/eval/answer-simulator.ts`, `gold-attributes-lookup.ts`, `runner.ts --simulate-answers`, default-off): for ASK outputs, derives the answer from the GOLD code's true attribute value → `continueWithAnswer` (≤Q-budget) → scores end-to-end. Honest (no gold-code leakage). **r6-sim baseline** (`vertex-m0-r6-sim.json`): ASK recoverability **41.4%** (12/29), end-to-end chapter 89.2 / heading 85.5 / 8-digit 67.3 (n=324).
- **QGS multi-question** (`backend/src/classifier-v2/layers/QGS-generator.ts`): info-gain greedy, cap-3/floor-1, candidate-aware after L3 (+ L1 fallback); batched `continueWithAnswers` (1 batch = 1 round); answer-sim batch-aware. 702 v2/eval tests passing, tsc clean.
- **✅ DONE:** `vertex-m0-r7-sim` — routing **86.4** / chapter **92.3** / heading **88.0** / 8-digit **68.6** / weighted **83.9**; QGS introduced **no classify regression** vs r6. `ask_recoverability` **25%** is an answer-sim HARNESS GAP (gold-attributes-lookup coverage), NOT a QGS failure — the simulator can't supply gold answers for cases outside its attribute-lookup table, so recoverable ASKs score as misses.

### Levers left toward "ultimate" (eval-gated, priority order)
- **Data enrichment** for the 19 heading-right/leaf-wrong cases needing NEW attributes (garment sizing, vehicle specs, surface treatment, fur species) — offline O2-style round; only path past the ~68% 8-digit ceiling besides QGS.
- **Ground-truth cleanup** of suspected eval-GT errors (see PARKED list in the continuation brief, e.g. TC009 fuel-pump).
- **L6 Tiebreak / L7 Deep-Think / L8 Active-Learning** — build ONLY if baseline proves need (verifier_rejected_but_correct rate, etc.).
- **Verifier recalibration for Vertex space** (MV-04 cosine floor 0.22 is Cohere-era; MV-03 citation threshold), **latency/perf** (~20–44s/case vs p95≤8s; intermittent MaxTokensError on composite cases), then **ship (M4/M5):** API rewire legacy→v2 (`backend/src/api/classify.ts`), trade intelligence, PDF reports, CI.

**Authoritative resume brief:** `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md` (per-round narrative, gates, ultimate bars, commands).
**Ultimate bars:** chapter ≥92–95%, heading ≥82–88%, 8-digit ≥75–82%, weighted ≥87%, routing ≥90%, p95 ≤8s, verifier over-rejection ≤8%.
**Prior design specs (historical):** `backend/docs/PHASE-4.2-4.4-BUILD-DESIGN.md`, `backend/docs/PHASE-4.2a-BASELINE.md`. Eval canonical = `backend/src/eval/` ~386-case master suite (`backend/eval/` 168-stub DEPRECATED).

## Roadmap
- DONE Phase 1: Eval harness (168 cases, on `feat/phase-1-eval-harness`)
- DONE Phase 2: Data foundation (normalized schema + canonical data + 7-audit verified)
- DONE Phase 3: Architecture spike — 30 paper-traces, 29/30 CORRECT, verdict PROCEED_TO_PHASE_4
- DONE Phase 3.5 (May 2026): Data completion + architecture lock-in — chapter_exclusions +352 rules, fts_search_text + text[] + sections.notes, A9 empirical proof 10/10 CORRECT, D1 model stack LOCKED. 8 carryforwards in ARCHITECTURE.md §12.
- IN PROGRESS Phase 4: Brain rebuild — v2 (8-layer). Phase 4.0 DONE (O1-O5; O2 12,406 ingested). Phase 4.2a DONE (orchestrator L0-L5 + repair/backtrack + ASK/REFUSE + continueWithAnswer; eval wired to v2). **M1 Vertex embedding migration DONE & verified (2026-05-29):** Cohere off the runtime/eval path (Trial-key 429 blocker resolved by removal), corpus on `gemini-embedding-001`@1536; clean baseline routing 78.8 / chapter 93.7 / heading 90.0 / 8-digit 72.7 / weighted 86.3. **M2 routing+precision rounds r1–r6 (all eval-gated & KEPT, uncommitted):** routing 78.8→86.5%; 8-digit plateaued ~68% (DILUTION from recovering borderline cases + a data ceiling — 0 retrieval misses, 19 cases need new attribute data). **Now:** answer-sim eval + QGS multi-question BUILT (702 tests pass); r6-sim end-to-end baseline (ASK recoverability 41.4%) recorded; `vertex-m0-r7-sim` IN FLIGHT to gate QGS. Levers left: data enrichment (19 gap cases) + GT cleanup + L6/L7 + verifier recalibration + API rewire — all measurement-gated. Authoritative brief: `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md`. Eval canonical = `backend/src/eval/` ~386-case master suite (168-stub DEPRECATED).
- M4: Trade intelligence — duty rates, export policy on every result
- M5: Ship — PDF reports, CI, feedback, investor demo

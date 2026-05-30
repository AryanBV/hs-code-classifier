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

**Note:** This describes the LEGACY classifier in `backend/src/classifier/`, which is still the one wired into the API (`backend/src/api/classify.ts`) pending rewire. The Phase 4 **v2 8-layer architecture** (`backend/src/classifier-v2/`) is BUILT and active in eval; design at `backend/docs/ARCHITECTURE.md`. See "Current Status" for v2 state.

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

## Current Status (2026-05-30)

**Branch:** `feat/phase-4-pipeline-build`. Phase 4 v2 8-layer classifier is BUILT and is the **active brain (eval-wired)**. `tsc` clean; **855 tests pass**. Do NOT push unattended.

**Authoritative resume brief:** `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md` — READ FIRST.

### Brain accuracy — honest numbers (frozen denom, Vertex runtime, levers OFF)
- **~77% OUTRIGHT 8-digit** (r18 77.3% / r19 76.5%, within ±2-3pp LLM noise) — **TOP-3 ~86%** (lower bound), chapter ~89%, heading ~86%, confident-wrong ~64 (down).
- In the realistic non-fine-tuned ceiling band. Eval suite = `backend/src/eval` master suite, **385 cases, 343 gold-code frozen denominator** (DB030 dropped Round 5).
- New metric: `top_k_code_accuracy` + per-case `candidate_codes`.

### Runtime = Vertex ONLY (Cohere fully decommissioned)
- `gemini-embedding-001`@1536 embeddings + Gemini-Flash rerank + Gemini-Flash L1 triage / L4 select. **No Cohere key needed** — any Cohere-429-blocker note in older docs is OBSOLETE.

### Ship arc — STARTED (decision: SHIP, latency-first)
- `backend/src/api/v2-api-adapter.ts` — `mapV2Result`: flat DTO, confidence 0-100, leaf-description + top-3 alternatives hydration, REFUSE→`responseType:refused`, system_error/80s-timeout→503.
- `USE_V2_CLASSIFIER` feature flag in `backend/src/api/classify.ts` — **DEFAULT OFF = legacy byte-identical; instant rollback.** Committed `cd7a5a3` + LIVE HTTP-smoke validated.
- **BLOCKER before cutover: latency.** classify p95 ~62s + occasional 90s timeouts. Prime suspect = **L5 repair loop** (each repair = another ~15s L4 call). Fix latency → cutover (flag ON) → frontend rebuild → publish.
- **Frontend rebuild (`frontend/src/lib/hooks/use-wizard.ts`):** read `alternatives`, handle `responseType:refused`, multi-turn `/answer` with `{questionId, answerId}`.

### Key commits this session (`feat/phase-4-pipeline-build`)
- gold-freeze R4 `6d9afd9`; MV-03 source_ref grammar `881ef2e`; bad-gold R5 `168ac64`; calibrated-classify lever (env-off) `8a189ef`; L2 `direct_leaf_lookup` recall `d4cfb44`; v2 API adapter + flag `cd7a5a3`; residual-leaf-floor `7629a2b`; top-3 instrumentation `ec34ee6`.

### Env flags (all OFF by default)
- `USE_V2_CLASSIFIER` (off — legacy path), `CALIBRATED_CLASSIFY_ENABLED` (off), `SIBLING_ASK_ENABLED` (off).

### Eval commands
- Full run: `cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite master --simulate-answers --run-id <id>` (~30 min, Vertex). Targeted subset: add `--ids <c1,c2,...>`.
- Compare: `npx tsx src/eval/compare.ts <before.json> <after.json>` → metric diffs + McNemar + three-sided gate verdict.
- Tests: `npx vitest run src/classifier-v2 src/eval`. Typecheck: `npx tsc --noEmit`.

### Key findings (do not relearn the hard way)
- **The selection bottleneck is INFORMATION, not model and not complexity.** PROVEN: richer prompt NEUTRAL→reverted; more candidates/attrs (cap 8→12) REGRESSED→reverted; Pro≈Flash (Gemini-Pro chose the SAME wrong sibling in 42/51). Do NOT try to fix sibling selection with more context/candidates/bigger model.
- **Unmarked-default-wins:** when a query doesn't flag the special variant (flavoured/filled/handloom/ballistic/seed-quality), the correct leaf is the common/residual one.
- ASK must be **uncertainty-gated**; pre-emptive ASK over-fires catastrophically.
- MV-04 cosine floor + MV-03 citation threshold were Cohere-era — recalibrate for Vertex space if the verifier over/under-fires.

### Trust-spine (the honest eval ruler)
- Frozen routing-independent denominator (kills dilution), EFFECTIVE scorer + population-closure assertion, confident-wrong rate, calibration (Brier + ECE + bootstrap CI), Wilson CIs, McNemar, automated regression-guard (`src/eval/compare.ts`), oracle decontamination. Contract: `backend/docs/EVAL_DESIGN.md`. Gold log: `backend/src/eval/GOLD-REMEDIATION-LOG.md`.

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
- Shared libs: `lib/vertex-client.ts` (raw HTTPS + retry + MaxTokensError), `lib/embedding-provider.ts` + `lib/reranker.ts` (Vertex `gemini-embedding-001` embed + Gemini-Flash rerank), `lib/supabase-client.ts` (with withRetry wrapper), `lib/thinking-config.ts` (model-conditional helper for 2.5-pro vs 3.x). (`lib/cohere-client.ts` may still exist but is OFF the runtime/eval path — Cohere decommissioned.)

### M1 — Vertex embedding migration — DONE & verified (2026-05-29)
- Corpus 100% re-embedded into `embedding_v2` (`gemini-embedding-001` @1536-dim, all 4 hierarchy levels + HNSW index); `supabase-client` + L5 MV-04 query `embedding_v2`; **Cohere decommissioned off the runtime/eval path** (Trial-key 429 blocker resolved by removal). Re-embed script: `backend/scripts/reembed-corpus-vertex.ts`. Runtime is now 100% Vertex (embed + rerank + L1/L4). Note: MV-04 cosine floor (0.22) and MV-03 citation threshold are Cohere-era values — recalibrate for Vertex space if the verifier over/under-fires.

### NEXT STEPS (priority order — full detail in the continuation brief)
1. **Latency fix (ship blocker — resume here):** classify p95 ~62s + 90s timeouts. Prime suspect = L5 repair loop (each repair = ~15s L4 call). Profile + cap/parallelize → bring p95 into budget.
2. **Cutover:** flip `USE_V2_CLASSIFIER` ON once latency is fixed; v2 becomes the live API.
3. **Frontend rebuild (`frontend/src/lib/hooks/use-wizard.ts`):** read `alternatives`, handle `responseType:refused`, multi-turn `/answer` with `{questionId, answerId}` → publish.
4. **Brain ceiling-raisers (measurement-gated):** retrieval bucket (per-subheading leaf floor, RRF fusion, chapter-recall safety net); confidence calibration (ECE) → sharper ASK gate; deferred: fine-tuned domain reranker w/ sibling hard-negative mining, corpus re-embed with discriminating attributes, RAG over Indian ITC-HS advance rulings.

**Operating rules (user-set):** quality-first and INCREASING; root-cause not patch (a green eval via hacks = false pass); **one principled change per measured THREE-SIDED gate** (target metric up via McNemar AND confident-wrong flat/down + regression-guard AND latency/cost in budget); **gold changes are USER-GATED** (blind-law-verify on query+gold, then approve); don't get stuck in an eval loop; commit at every kept gate; **runtime stays Vertex (never reintroduce Cohere).**

**Ultimate bars:** 8-digit OUTRIGHT ~77%+ (in-band) + calibrated ASK + top-3 ~86% + near-zero confident-wrong; chapter ≥92–95%, heading ≥82–88%, routing ≥90%, p95 ≤8s, verifier over-rejection ≤8%.
**Prior design specs (historical):** `backend/docs/PHASE-4.2-4.4-BUILD-DESIGN.md`, `backend/docs/PHASE-4.2a-BASELINE.md`. Eval canonical = `backend/src/eval/` master suite, 385 cases / 343 gold-code frozen denom (`backend/eval/` 168-stub DEPRECATED).

## Roadmap
- DONE Phase 1: Eval harness (168 cases, on `feat/phase-1-eval-harness`)
- DONE Phase 2: Data foundation (normalized schema + canonical data + 7-audit verified)
- DONE Phase 3: Architecture spike — 30 paper-traces, 29/30 CORRECT, verdict PROCEED_TO_PHASE_4
- DONE Phase 3.5 (May 2026): Data completion + architecture lock-in — chapter_exclusions +352 rules, fts_search_text + text[] + sections.notes, A9 empirical proof 10/10 CORRECT, D1 model stack LOCKED. 8 carryforwards in ARCHITECTURE.md §12.
- IN PROGRESS Phase 4: Brain rebuild — v2 (8-layer) BUILT and the **active brain (eval-wired)**. Phase 4.0 DONE (O1-O5; O2 12,406 ingested). Phase 4.2a DONE (orchestrator L0-L5 + repair/backtrack + ASK/REFUSE + continueWithAnswer; eval wired to v2). **Runtime is Vertex-ONLY** (`gemini-embedding-001`@1536 embed + Gemini-Flash rerank + Gemini-Flash L1/L4; Cohere fully decommissioned). Trust-spine + gold-freeze rounds DONE (honest eval ruler: frozen routing-independent denom, EFFECTIVE scorer, confident-wrong, calibration, regression-guard, oracle decontamination). **Brain ~77% OUTRIGHT 8-digit / TOP-3 ~86% / chapter ~89% / heading ~86%** (frozen denom, levers off) — in the realistic non-fine-tuned ceiling band. **Ship arc STARTED:** v2 API adapter (`backend/src/api/v2-api-adapter.ts`) + `USE_V2_CLASSIFIER` flag (default OFF = legacy byte-identical) committed `cd7a5a3` + LIVE HTTP-smoke validated; decision = SHIP, latency-first. **Next: fix classify latency (p95 ~62s, suspect L5 repair loop) → cutover (flag ON) → frontend rebuild → publish.** Authoritative brief: `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md`. Eval canonical = `backend/src/eval/` master suite, 385 cases (168-stub DEPRECATED).
- M4: Trade intelligence — duty rates, export policy on every result
- M5: Ship — API rewire (legacy→v2) → frontend rebuild → publish; PDF reports, CI, feedback, investor demo

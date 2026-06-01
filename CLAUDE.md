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

**Note:** This describes the LEGACY classifier in `backend/src/classifier/`, which is the API default while `USE_V2_CLASSIFIER` is OFF (the v2 adapter is wired in `backend/src/api/classify.ts` behind that flag, pending the paid validation checkpoint before cutover). The Phase 4 **v2 8-layer architecture** (`backend/src/classifier-v2/`) is BUILT, FROZEN, and the active brain in eval; design at `backend/docs/ARCHITECTURE.md`. See "Current Status" for v2 state.

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
- **Gemini Developer API (free-tier `GEMINI_API_KEY` in `backend/.env`)** — Phase 4 v2 runtime LLM + embedding stack. Models in use: `gemini-3.5-flash` (L1 triage + L4 select + reranker) and `gemini-embedding-001` @1536-dim embeddings. `gemini-3.1-pro-preview` is referenced but has **0 free-tier quota AND is an unused stub** — L6/L7 tiebreak/deep-think were never built (`escalated_to_deep_think` is always false), and Pro was proven ≈ Flash, so nothing is lost. Provider seam: `LLM_PROVIDER` / `EMBEDDING_PROVIDER` default `'developer'`; `'vertex'` preserved for byte-identical rollback. Embedding parity verified — Developer-API `gemini-embedding-001` matches the Vertex-built corpus (cosine ~1.0, NO re-embed needed). **FREE-TIER HARD LIMITS (discovered):** `gemini-3.5-flash` = **5 requests/MIN and 20 requests/DAY**; one classification ≈ 4-7 Flash calls, so the free tier yields ~3-4 classifications/day — it is **BUILD-ONLY, NOT eval-able**. Live validation needs a PAID Tier-1 key. The proactive in-process rate-limiter (`GEMINI_RPM`, no-op default) fixes RPM, NOT the daily cap.
- **Vertex AI — DISABLED 2026-06-01 (billing disabled on gen-lang-client); do NOT reintroduce.** Background: the "GenAI App Builder" trial credit was SKU-scoped to Agent Builder / Vertex AI Search and did NOT cover Gemini `generateContent` or embedding SKUs, so real charges accrued (May 2026 ~₹73,683 net). The bill was REAL — ~75% waived via support (₹17,742.63 remaining; case #71826606). Runtime migrated OFF Vertex onto the free-tier Gemini Developer API (no-billing project = free by construction). **HARD RULE: NO paid API calls without explicit cost-aware user go-ahead; build/analyze on the Claude subscription, test only on the free-tier Gemini key or a user-approved capped paid key.**
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
- `GEMINI_API_KEY` — Gemini Developer API key (free-tier; v2 runtime LLM + embeddings)
- `LLM_PROVIDER` / `EMBEDDING_PROVIDER` — `'developer'` (default) or `'vertex'` (rollback seam)
- `GEMINI_RPM` — proactive rate-limiter requests/min cap (no-op by default)
- `EVAL_CONCURRENCY` — eval-runner concurrency knob (free-tier 429 backpressure)
- `USE_V2_CLASSIFIER` — flip v2 brain ON at the API route (default OFF = legacy)
- `CLASSIFY_ASYNC` — async job-queue/SSE path (default OFF; ships DORMANT)
- `OPENAI_API_KEY` — OpenAI API authentication (LEGACY classifier only)
- `PORT` — Server port (default: 3000)
- `NODE_ENV` — development | production
- `FRONTEND_URL` — CORS allowed origins (comma-separated; fail-loud if unset in production)
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

## Current Status (2026-06-01)

> **AUTHORITATIVE DIRECTION:** product is FREE (Prevyl bundle later); value = TOP-3 + cited rationale record; confidence = calibrated bands. **CORRECTNESS > SPEED — do NOT pursue latency at the cost of accuracy; the repair loop + L5 verifier STAY.** Phase A cost-efficiency hardening is effectively DONE; Phase B ship-arc Steps 0-2 are committed with a **BIG PIVOT: launch on the INLINE-SYNC path (`USE_V2_CLASSIFIER` on) and DEFER the async job-queue + SSE entirely** (ships DORMANT behind `CLASSIFY_ASYNC=off`). The **main remaining work is the FRONTEND clean-rebuild** (all 12 decisions LOCKED). Plans: `backend/docs/PHASE-B-PLAN.md` (hardened backend) + `backend/docs/FRONTEND-DECISIONS-LOCKED.md` / `FRONTEND-DEBATE.md` / `FRONTEND-FINAL-SWEEP.md` (frontend). Roadmap `C:\Users\ASUS\.claude\plans\ROADMAP-2026-06-01.md` is now partly done (Phase A) and evolved (inline-sync launch; frontend decisions locked).

**Branch:** `feat/phase-4-pipeline-build`, HEAD `d373e6b`. Phase 4 v2 8-layer classifier is BUILT, FROZEN (no classification-logic changes this session; L0-L5 layer files byte-identical), and is the **active brain (eval-wired)**. `tsc` clean; **1054 tests pass** (10 skipped). Do NOT push unattended.

### Brain accuracy — honest numbers (frozen denom, Gemini runtime, levers OFF)
- **~77% OUTRIGHT 8-digit** (r18 77.3% / r19 76.5%, within ±2-3pp LLM noise) — **TOP-3 ~86%** (lower bound), chapter ~89%, heading ~86%, confident-wrong ~64 (down).
- In the realistic non-fine-tuned ceiling band. Eval suite = `backend/src/eval` master suite, **385 cases, 343 gold-code frozen denominator** (DB030 dropped Round 5).
- New metric: `top_k_code_accuracy` + per-case `candidate_codes`.

### Runtime = free-tier Gemini Developer API (Vertex DISABLED, Cohere decommissioned)
- Models — `gemini-embedding-001`@1536 embeddings + Gemini-Flash rerank + Gemini-Flash L1 triage / L4 select — via the free-tier `GEMINI_API_KEY`. `gemini-3.1-pro-preview` is an unused stub (no capability lost). Embedding parity with the Vertex-built corpus verified (cosine ~1.0, NO re-embed). **No Cohere key needed.** Free-tier hard limits = 5 RPM / 20 RPD on Flash (~3-4 classifications/day) → BUILD-ONLY, not eval-able; live validation needs a paid Tier-1 key.

### Phase A — cost-efficiency hardening: effectively DONE
- **A1** free-tier key [DONE]. **A2** Gemini Developer API client via hybrid `LlmProvider` seam (`4be037a`). **A3** token meter — AsyncLocalStorage `usageMetadata` → `diagnostics.token_usage` → eval (`9315713`). **Resilience** — 429 RetryInfo-respect + `EVAL_CONCURRENCY` knob (`2dfea2a`). **Rate-limiter** — proactive token bucket at the `generateContent` facade, `GEMINI_RPM`, no-op default (`3c43fd7`).
- **A4 caching DEFERRED** — doesn't help RPM; revisit only at paid tier. **A5 validation DEFERRED** to a paid key (free 20/day too low to eval). Accuracy-held is strongly supported (embedding parity + identical models/prompts + one correct live classification of `7318.15.00`). User criterion: token VOLUME is a non-issue; only hitting LIMITS matters.

### Phase B — ship arc (INLINE-SYNC launch pivot)
Design + senior 4-lens re-audit DONE. All lenses agreed: launch INLINE-SYNC, defer async/SSE.
- `backend/src/api/v2-api-adapter.ts` — `mapV2Result`: flat DTO, confidence 0-100, leaf-description + top-3 alternatives hydration, REFUSE→`responseType:refused`, system_error/80s-timeout→503.
- `USE_V2_CLASSIFIER` flag in `backend/src/api/classify.ts` — **DEFAULT OFF = legacy byte-identical; instant rollback.**
- **Steps 0-2 DONE (commit `d373e6b`):** B0 typed `TransportError` + `isVertexTransportError` both-prefix fix; B1 trust-proxy + fail-loud `FRONTEND_URL` + cost-monitor + per-classification token log + `/health` daily counter + hard daily ceiling + alternatives cap-to-3; B5 DTO freeze (`confidenceBand`/`confidenceP`/optional `processingTimeMs` + contract test); dormant job-queue de-landmined (`classification_jobs.status` DEFAULT `'queued'`, `createJob` ON CONFLICT). Async path ships DORMANT behind `CLASSIFY_ASYNC=off`, spec-hardened for later revival (reaper/lease/graceful-drain/constraint-aware-test).
- **REMAINING backend = Step 3: ONE PAID validation checkpoint** (DEFERRED to a future session when the user enables a small CAPPED Tier-1 Gemini key; cost log + daily counter must be live first). 20-40 case smoke through the real HTTP route + 15-25 real-exporter-query eyeball; three-sided gate (OUTRIGHT ~77% / top-3 ~86% via McNemar vs frozen run + confident-wrong flat/down + latency/cost in budget) → flip `USE_V2_CLASSIFIER` ON in Railway.
- **Latency fix (earlier, commit `0ae224a`):** adaptive repair loop = cap repairs at 2 + code-only no-progress bail. p95 62.5s → 38.8s (-38%); OUTRIGHT 76.5% → 76.4% (McNemar p=1.0000, identical). Env knobs: `REPAIR_MAX_ITERATIONS` (2), `REPAIR_NOPROGRESS_BAIL` (on), `REPAIR_BAIL_ON_SIGNATURE` (off/opt-in), `REPAIR_BAIL_MIN_ITERATION` (0). r20 (sig+code bail) and r22 (cap=3) tested+REJECTED.

### Frontend — the main remaining work (clean rebuild; all 12 decisions LOCKED)
Current `frontend/` is a THROWAWAY prototype (wrong brand, oracle framing, %+green emblem, liar-bar, broken `/answer` contract) → CLEAN REBUILD. Theme = Living-Certificate / Customs-Ledger; fonts Fraunces (display) + Hanken Grotesk (body) + Commit Mono (codes); light default + warm-dark. Stack = fresh **Next 16 + Tailwind v4 + React 19 + latest shadcn** (`motion` not framer-motion; verify-and-lock at build-zero).
- **12 LOCKED decisions** in `backend/docs/FRONTEND-DECISIONS-LOCKED.md` (debates in `FRONTEND-DEBATE.md`, ready-to-build verdict in `FRONTEND-FINAL-SWEEP.md`): D2 adaptive dual-layout (desktop two-pane + mobile thumb-tool, two-pane at `lg`); D3 calm entrance-only motion (no certainty implied, reduced-motion=instant); D4 ~5-bucket refuse taxonomy on the reason ENUM (never render model free-text) + one recovery action; D5 branch on `isSixDigit` (8-digit headline when confident; 6-digit + 8-digit candidates when not); D6 FULL rationale record FREE on-screen (gate ONLY the PDF + permalink); D7 honest staged stepper (real L0-L5 labels, no %/countdown; same component becomes the SSE loader later); D8 English-only + next-intl scaffold; D9 opt-in public no-PII permalink + OG image; cost-protection = shared-store global daily ceiling + invisible Cloudflare Turnstile + soft per-cookie friction. Plus 15 auto-handled senior defaults (WCAG-AA, CWV budgets, self-hosted fonts, error boundaries, cookieless analytics + Sentry, DPDP-minimal, brand TradeCode→Prevyl, band-only-by-type so the confidence number is never rendered).
- **Build-zero provisioning (user-gated DB change):** live Supabase has ONLY the 11 corpus tables. Provision via `apply_migration`: `classifications` (owner-RLS; frozen DTO; guest=localStorage migrate-on-login), `classification_jobs` (makes async flag-flippable), `feedback`, `shared_records` (public-read RLS, PII-scrubbed, takedown). Plus auth UX block (`@supabase/ssr` + `/auth/callback` + return-to-intent).

### Infra decisions
- **Backend host = Railway** (single long-lived Node replica; the in-process token bucket is a SINGLE-INSTANCE invariant → pin replicas=1, no autoscale; Hobby $5/mo only when deploying). **Frontend = Vercel.**
- **DB = Supabase Tokyo (ap-northeast-1) NOW; migrate to Mumbai (ap-south-1) AT LAUNCH** (region not changeable in place → new project + corpus migration; free tier = 2 active projects/account, user already at 2 → pause one or go paid at migration). Latency win from Mumbai is marginal now (Gemini dominates ~40s).

### Immediate next = START THE FRONTEND BUILD
Design the HERO (result/rationale screen) VISUALLY (desktop two-pane + mobile) for user sign-off, then loading/ASK/refuse/input/landing → write spec → implementation plan → build on the fresh Next 16/Tailwind v4 stack. Items needing user sign-off during design: the 5 refuse copy blocks (D4), the 6-vs-8 plain-language explainer (D5), the on-screen layered + PDF certificate layouts (D6), the global daily number (cost). Backend Step 3 (paid validation) + build-zero DB provisioning happen when the user enables a capped key / is ready.

### Key commits this session (`feat/phase-4-pipeline-build`)
- A2 Gemini Developer API client (hybrid `LlmProvider` seam, free-tier) `4be037a`; A3 token meter `9315713`; free-tier resilience (429 RetryInfo + `EVAL_CONCURRENCY`) `2dfea2a`; proactive rate-limiter (token bucket facade, `GEMINI_RPM`) `3c43fd7`; Phase B backend Steps 0-2 (B0 TransportError fix + B1 launch-config/cost-guardrail/cap + B5 DTO freeze + dormant job-queue de-landmine) `d373e6b`. (Prior session: adaptive repair-loop latency fix `0ae224a`; v2 API adapter + flag `cd7a5a3`.)

### Env flags (defaults preserve legacy/safe behavior)
- `USE_V2_CLASSIFIER` (off — legacy path), `CLASSIFY_ASYNC` (off — async/SSE dormant), `LLM_PROVIDER`/`EMBEDDING_PROVIDER` (`developer`), `GEMINI_RPM` (no-op), `CALIBRATED_CLASSIFY_ENABLED` (off), `SIBLING_ASK_ENABLED` (off).

### Eval commands
- Full run: `cd backend && npx tsx --require dotenv/config src/eval/runner.ts --suite master --simulate-answers --run-id <id>` (~30 min; free-tier Gemini key — full 385 only for final gates, use 20-40 case smoke subset for iteration). Targeted subset: add `--ids <c1,c2,...>`.
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

### Phase 4.1 runtime layers (975 v2/eval tests passing; 1054 total backend tests pass, 10 skipped)
- Done L0 Input Normalization (`layers/L0-normalization.ts`) — alias map + composite-flag
- Done L1 Triage (`layers/L1-triage.ts`) — Gemini 3.5 Flash, thinking_level=low, constraint_hint-aware
- Done L2 Hybrid Retrieval (`layers/L2-retrieval.ts`) — Vertex `gemini-embedding-001` @1536 (HNSW cosine) + Gemini-Flash reranker + Postgres GIN-FTS (M1 migration 2026-05-29 — superseded Cohere; Cohere OFF the v2 path); direct-leaf-lookup shortcut
- Done L3 Rules Filter (`layers/L3-rules-filter.ts`) — exclusions, multi-dest collapse, single-shot backtrack gate
- Done L4 Select (`layers/L4-select.ts`) — Gemini 3.5 Flash with multi-signal context (chapter_notes + section_notes + notes_claims + tariff_line_attributes + GIRs), components[] for GIR-3(b)
- Done L5 Mechanical Verifier (`layers/L5-verifier.ts`) — all 10 rules + predicate DSL evaluator (three-valued PASS/FAIL/SKIP) + source-ref resolver + ts_rank_cd TF-IDF citation check
- Shared libs: `lib/vertex-client.ts` (raw HTTPS + retry + MaxTokensError), `lib/embedding-provider.ts` + `lib/reranker.ts` (Vertex `gemini-embedding-001` embed + Gemini-Flash rerank), `lib/supabase-client.ts` (with withRetry wrapper), `lib/thinking-config.ts` (model-conditional helper for 2.5-pro vs 3.x). (`lib/cohere-client.ts` may still exist but is OFF the runtime/eval path — Cohere decommissioned.)

### M1 — Vertex embedding migration — DONE & verified (2026-05-29)
- Corpus 100% re-embedded into `embedding_v2` (`gemini-embedding-001` @1536-dim, all 4 hierarchy levels + HNSW index); `supabase-client` + L5 MV-04 query `embedding_v2`; **Cohere decommissioned off the runtime/eval path** (Trial-key 429 blocker resolved by removal). Re-embed script: `backend/scripts/reembed-corpus-vertex.ts`. Runtime is 100% Gemini (embed + rerank + L1/L4) — was Vertex; now via the free-tier Gemini Developer API key after Vertex was disabled 2026-06-01. Note: MV-04 cosine floor (0.22) and MV-03 citation threshold are Cohere-era values — recalibrate for Vertex space if the verifier over/under-fires.

### NEXT STEPS (priority order)
1. **Frontend clean-rebuild (MAIN remaining work):** start with the HERO (result/rationale) screen VISUALLY for user sign-off (desktop two-pane + mobile), then loading/ASK/refuse/input/landing → spec → plan → build on the fresh Next 16 / Tailwind v4 / React 19 / latest-shadcn stack. All 12 decisions LOCKED (`backend/docs/FRONTEND-DECISIONS-LOCKED.md`). Sign-off items during design: 5 refuse copy blocks (D4), 6-vs-8 explainer (D5), on-screen + PDF layouts (D6), global daily number (cost).
2. **Backend Step 3 — PAID live validation (deferred to a capped-key session):** smoke through the real HTTP route + real-exporter eyeball; three-sided gate vs the frozen run → flip `USE_V2_CLASSIFIER` ON in Railway.
3. **Build-zero DB provisioning (user-gated):** `apply_migration` for `classifications` / `classification_jobs` / `feedback` / `shared_records` + auth UX block.
4. **Publish + M4 trade intelligence** (duty rates, export policy) → migrate Supabase to Mumbai at launch.
5. **Brain ceiling-raisers (measurement-gated, deferred):** retrieval bucket (per-subheading leaf floor, RRF fusion, chapter-recall safety net); confidence calibration (ECE) → sharper ASK gate; calibrated escalation to ASK on low-confidence emits (recovers the confident-wrong delta); fine-tuned domain reranker w/ sibling hard-negative mining; corpus re-embed with discriminating attributes; RAG over Indian ITC-HS advance rulings.

**Stale docs (superseded — do not follow for next steps):** `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md`, `NEXT-SESSION-PROMPT.md`, `PHASE-4.2-*` (pre-Phase-B state). `PHASE-B-PLAN-DRAFT.md` (superseded by `PHASE-B-PLAN.md`) and `FRONTEND-QUESTIONS.json` (intermediate) are deletable. The 3-free-gate / SSE-first-loader notes anywhere are SUPERSEDED by gate-artifacts-not-access + inline-sync honest stepper.

**Operating rules (user-set):** PURE ORCHESTRATOR (decide + dispatch subagents/Workflows, keep own context lean, verify delegated work, independent/adversarial review on delegated pieces); quality-first and INCREASING (never reduce capability/quantity); root-cause not patch (a green eval via hacks = false pass); **one principled change per measured THREE-SIDED gate**; **DEBATE 3-4 genuinely-distinct options with real pros/cons BEFORE recommending** (never a 2-option binary; debate first even inside AskUserQuestion); CORRECTNESS > SPEED always; STOP-AND-SURFACE on a wrong path or clearly better way; **gold/eval-data changes USER-GATED**; commit at every kept gate, do NOT push unattended; plain-language milestone updates; human-sounding external drafts (no AI tells); use the full capability of Opus 4.8 + Claude Code (Supabase/Vercel/Railway/Context7/Chrome MCPs as needed); **runtime = free-tier Gemini Developer API (Vertex disabled; never reintroduce Cohere); NO paid API calls without explicit cost-aware user go-ahead** (build/mock-test on the Claude subscription; live-test only on the free key or a user-approved capped paid key).

**Ultimate bars:** 8-digit OUTRIGHT ~77%+ (in-band) + calibrated ASK + top-3 ~86% + near-zero confident-wrong; chapter ≥92–95%, heading ≥82–88%, routing ≥90%, p95 fast-enough (perceived-latency via the honest staged stepper; cut only free/architectural latency — never accuracy), verifier over-rejection ≤8%.
**Prior design specs (historical):** `backend/docs/PHASE-4.2-4.4-BUILD-DESIGN.md`, `backend/docs/PHASE-4.2a-BASELINE.md`. Eval canonical = `backend/src/eval/` master suite, 385 cases / 343 gold-code frozen denom (`backend/eval/` 168-stub DEPRECATED).

## Roadmap
- DONE Phase 1: Eval harness (168 cases, on `feat/phase-1-eval-harness`)
- DONE Phase 2: Data foundation (normalized schema + canonical data + 7-audit verified)
- DONE Phase 3: Architecture spike — 30 paper-traces, 29/30 CORRECT, verdict PROCEED_TO_PHASE_4
- DONE Phase 3.5 (May 2026): Data completion + architecture lock-in — chapter_exclusions +352 rules, fts_search_text + text[] + sections.notes, A9 empirical proof 10/10 CORRECT, D1 model stack LOCKED. 8 carryforwards in ARCHITECTURE.md §12.
- IN PROGRESS Phase 4: Brain rebuild — v2 (8-layer) BUILT, FROZEN, and the **active brain (eval-wired)**. Phase 4.0 DONE (O1-O5; O2 12,406 ingested). Phase 4.2a DONE (orchestrator L0-L5 + repair/backtrack + ASK/REFUSE + continueWithAnswer; eval wired to v2). **Runtime = free-tier Gemini Developer API** (`gemini-embedding-001`@1536 embed + Gemini-Flash rerank + Gemini-Flash L1/L4; Vertex disabled 2026-06-01; Cohere decommissioned). Trust-spine + gold-freeze rounds DONE. **Brain ~77% OUTRIGHT 8-digit / TOP-3 ~86% / chapter ~89% / heading ~86%** (frozen denom, levers off). **Phase A (cost-efficiency) effectively DONE** — Gemini Developer API client + token meter + 429-resilience + proactive rate-limiter committed (`4be037a`/`9315713`/`2dfea2a`/`3c43fd7`); A4 caching + A5 validation deferred to a paid tier. **Phase B ship-arc Steps 0-2 committed (`d373e6b`) with the INLINE-SYNC launch pivot** — v2 cutover via `USE_V2_CLASSIFIER`, async job-queue/SSE deferred (ships DORMANT behind `CLASSIFY_ASYNC=off`); remaining backend = Step 3 paid live-validation checkpoint then flip the flag ON in Railway. Eval canonical = `backend/src/eval/` master suite, 385 cases (168-stub DEPRECATED).
- IN PROGRESS Frontend rebuild (MAIN remaining work): throwaway prototype → CLEAN REBUILD on Next 16 / Tailwind v4 / React 19 / latest shadcn; all 12 decisions LOCKED (`backend/docs/FRONTEND-DECISIONS-LOCKED.md`); theme = Living-Certificate / Customs-Ledger. Start: design hero VISUALLY for user sign-off → spec → build.
- M4: Trade intelligence — duty rates, export policy on every result
- M5: Ship `hscode.prevyl.com` — a FREE web product (top-3 ITC-HS codes + cited rationale record + calibrated confidence band); monetize later via a Prevyl bundle. Hosts: backend Railway + frontend Vercel + Supabase Mumbai (migrate at launch). PDF reports, opt-in permalinks, CI, feedback, investor demo

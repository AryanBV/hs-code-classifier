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

**Note:** This describes the LEGACY classifier in `backend/src/classifier/`, retained behind the `USE_V2_CLASSIFIER` flag as instant rollback. The Phase 4 **v2 8-layer architecture** (`backend/src/classifier-v2/`) is BUILT, validated, and **LIVE in production** (`USE_V2_CLASSIFIER` ON in Railway); design at `backend/docs/ARCHITECTURE.md`. See "Current Status" for v2 state.

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
- **Gemini — v2 runtime LLM + embedding stack (provider-seam: Vertex in PROD, Developer-key fallback).** Models in use: `gemini-3.5-flash` (L1 triage + L4 select + reranker) and `gemini-embedding-001` @1536-dim embeddings. `gemini-3.1-pro-preview` is referenced but is an **unused stub** — L6/L7 tiebreak/deep-think were never built (`escalated_to_deep_think` is always false), and Pro was proven ≈ Flash, so nothing is lost. Provider seam: `LLM_PROVIDER` / `EMBEDDING_PROVIDER`.
  - **PROD = Vertex** (`'vertex'`), GCP project **`prevyl`**, billed against the **$300 free-trial credit** (ends ~2026-09-04); auth via the SA key in `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Revert prod off the credit before it runs dry.
  - **FALLBACK = free-tier `GEMINI_API_KEY`** (`'developer'`, in `backend/.env` / Railway). Free-tier limits ~5 RPM and a daily cap (the old "20/day" figure is superseded — Flash is ~250 RPD ≈ ~50 classifications/day; verify live). Embedding parity verified — Developer-API `gemini-embedding-001` matches the Vertex-built corpus (cosine ~1.0, NO re-embed). The in-process rate-limiter (`GEMINI_RPM`, no-op default) caps RPM only.
  - **HARD RULE: NO paid API calls beyond the approved trial-credit usage without explicit cost-aware go-ahead;** build/analyze on the Claude subscription.
- **Vertex billing crisis (historical) — DISTINCT project `gen-lang-client`, DISABLED 2026-06-01; do NOT reintroduce that project.** The "GenAI App Builder" trial credit there was SKU-scoped to Agent Builder / Vertex AI Search and did NOT cover Gemini `generateContent`/embedding SKUs, so real charges accrued (May 2026 ~₹73,683 net; ~75% waived via support, ₹17,742.63 remaining, case #71826606). This is a SEPARATE GCP project from the current `prevyl` prod project (whose $300 trial credit DOES cover Gemini via the Vertex path).
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

## Current Status (2026-06-05) — LIVE IN PRODUCTION

> **PRODUCT IS LIVE: https://hscode.prevyl.com** — a FREE Indian ITC-HS classifier. Vercel frontend + Railway backend (`hs-code-classifier`, replicas=1) + Supabase Tokyo (ap-northeast-1, ref `waowoznsvaosgcgiivzo`). `USE_V2_CLASSIFIER` is ON in production. Value = TOP-3 + cited rationale record + calibrated confidence band. **CORRECTNESS > SPEED — the repair loop + L5 verifier STAY.** Branch `feat/frontend-rebuild` == `origin/main`; current HEAD `origin/main` = `977ec36` (all work pushed + deployed).

> **AUTHORITATIVE DIRECTION:** product is FREE (Prevyl bundle later). The launch arc (Phase A cost-efficiency, Phase B inline-sync ship, frontend rebuild + experience, paid live-validation, public flip) is DONE. Remaining work is post-launch polish: rotate a leaked SA key, recalibrate the divergence asker, spot-check the real-world gold, and improve brand-name handling + confidence calibration.

### Runtime — PROD on Vertex/prevyl ($300 free-trial credit); free key is the instant fallback
- v2 8-layer classifier (L0-L5) is the live brain. Models: `gemini-embedding-001`@1536 embeddings + Gemini-Flash rerank + Gemini-Flash L1 triage / L4 select. `gemini-3.1-pro-preview` remains an unused stub (no capability lost).
- **PROD provider = Vertex** (`LLM_PROVIDER=vertex`, `EMBEDDING_PROVIDER=vertex`), GCP project **`prevyl`** (id `prevyl`, num 49530374899) under org `prevyl.com`, billed against the **$300 free-trial credit** (~$250 left after eval; trial ends ~2026-09-04). Auth via a service-account key supplied as `GOOGLE_APPLICATION_CREDENTIALS_JSON` (inline JSON; the SA has `roles/aiplatform.user`). Card is SAFE while on the trial — do NOT "Activate full account".
- **INSTANT FALLBACK = the free-tier personal `GEMINI_API_KEY`** (kept in Railway): flip `LLM_PROVIDER`/`EMBEDDING_PROVIDER` back to `developer`. Free-tier hard limits ~5 RPM (daily cap higher than the old 20/day note — ~250 RPD Flash → ~50 classifications/day; verify live). Per-day app guard `MAX_CLASSIFICATIONS_PER_DAY` + per-IP rate-limit are live.
- **HARD RULE still applies: revert prod to the free key (or a small capped key) BEFORE the trial credit runs dry (~Sept 4).** NO paid API calls without explicit cost-aware go-ahead; build/analyze on the Claude subscription.
- Org policy note: `iam.disableServiceAccountKeyCreation` was LIFTED for the `prevyl` project to allow the SA key (org-admin granted `roles/orgpolicy.policyAdmin`).

### Brain accuracy — validated on Vertex/prevyl (paid local eval, 2026-06-05)
Frozen denominator, divergence OFF, `--simulate-answers`. Eval canonical = `backend/src/eval` master suite (385 cases / 343 gold-code frozen denom) + NEW `backend/src/eval/gold/real-world-staging.ts` (60 staged messy-input cases, gold PROVISIONAL / user-gated).
- **CLEAN 385:** OUTRIGHT 8-digit **75.2%** (255/339; 4 infra-errored excluded) / **EFFECTIVE 77.9%** (with ask-recovery) / **top-3 84.4%** / chapter 87.3% / heading 84.1% / routing 93.4% / confident-wrong 21.8% (71) / Brier 0.159 / ECE 0.104 / cost $39.42. **McNemar vs r19 (76.5%): p=0.4807 → STATISTICALLY UNCHANGED** (the ~1-2pp dip is run-to-run noise; the model HELD) and FASTER (p95 62.5s → 41.8s).
- **REAL-WORLD 60 (new staged suite):** OUTRIGHT **67.8%** (40/59) / top-3 81.4% / chapter 89.8% / heading 88.1% / confident-wrong 28.6% / cost $5.85. Real-world drops ~7pp on the exact leaf (SMALL SAMPLE, wide CI [55-78] → DIRECTIONAL); chapter/heading are ROBUST. **Brand names are the worst failure mode (5/16 confident-wrongs).** Gold is STAGED/PROVISIONAL → misses need a spot-check before 68% is authoritative.
- Total session eval spend ~$89 of the credit. New-project Vertex quota is tight (429s at concurrency >3 → use `EVAL_CONCURRENCY` ≤ 3).

### Phase A — cost-efficiency hardening: DONE
- **A1** free-tier key. **A2** Gemini Developer API client via hybrid `LlmProvider` seam (`4be037a`). **A3** token meter — AsyncLocalStorage `usageMetadata` → `diagnostics.token_usage` → eval (`9315713`). **Resilience** — 429 RetryInfo-respect + `EVAL_CONCURRENCY` knob (`2dfea2a`). **Rate-limiter** — proactive token bucket at the `generateContent` facade, `GEMINI_RPM`, no-op default (`3c43fd7`).
- **A4 caching DEFERRED** (revisit at scale). **A5 validation DONE** (the paid Vertex/prevyl run above replaced the deferred free-key checkpoint).

### Phase B — ship arc (INLINE-SYNC launch): DONE + LIVE
- `backend/src/api/v2-api-adapter.ts` — `mapV2Result`: flat DTO, confidence 0-100, leaf-description + top-3 alternatives hydration, REFUSE→`responseType:refused`, system_error/80s-timeout→503.
- `USE_V2_CLASSIFIER` flag in `backend/src/api/classify.ts` — **ON in production.** Legacy path remains the instant rollback.
- Backend Steps 0-2 (commit `d373e6b`): B0 typed `TransportError` + both-prefix fix; B1 trust-proxy + fail-loud `FRONTEND_URL` + cost-monitor + per-classification token log + `/health` daily counter + hard daily ceiling + alternatives cap-to-3; B5 DTO freeze + contract test; dormant job-queue de-landmined. **Async path ships DORMANT** behind `CLASSIFY_ASYNC=off`.
- Step 3 PAID validation: DONE on Vertex/prevyl (see Brain accuracy above) → flag flipped ON, deployed, verified end-to-end (live `/r/` records produced; ask→answer→code pipeline live-probed e.g. frozen chicken → "whole" → `0207.12.00`).
- **Latency fix (commit `0ae224a`):** adaptive repair loop = cap repairs at 2 + code-only no-progress bail. Env knobs: `REPAIR_MAX_ITERATIONS` (2), `REPAIR_NOPROGRESS_BAIL` (on), `REPAIR_BAIL_ON_SIGNATURE` (off/opt-in), `REPAIR_BAIL_MIN_ITERATION` (0).

### Frontend — clean-rebuilt, elevated, and LIVE
- Theme = Living-Certificate / Customs-Ledger; fonts Fraunces (display) + Hanken Grotesk (body) + Commit Mono (codes). Stack = Next 16 + Tailwind v4 + React 19 + latest shadcn (`motion`). All 12 LOCKED decisions (`backend/docs/FRONTEND-DECISIONS-LOCKED.md`) realized; honesty constraints (band-only confidence, never render the numeric/model free-text) carry forward.
- Built + senior-audited to ~9/10, then the EXPERIENCE was rebuilt within the theme (first-run preview/intro, simplified hero, signature classify→loading→result). Authoritative briefs: `frontend/NEXT-UX-DIRECTION.md` + `frontend/HANDOFF.md`; audit record in `design-mocks/`.
- Auth (Google OAuth + Supabase magic-link), cloud history-sync, opt-in permalink + OG image — wired and live. DB provisioning (`classifications` / `classification_jobs` / `feedback` / `shared_records` + RLS) applied.
- **Loading-text fix LIVE (commit `d3109ef`):** the `@keyframes gloss-cycle` was authored for ~6-line decks but the real decks are 7 (glosses) / 8 (lessons) lines, so the visible window overran each per-line slot (lines overlapped; each readable only ~2.7-3s). Reshaped to eased-in → long HOLD → eased-out → empty REST capped at a 12% footprint (< the 12.5% 8-line slot) and `GLOSS_CYCLE_MS` 21000→56000 / `LESSON_CYCLE_MS` 24000→64000 (~8s/line). Pure-CSS, reduced-motion preserved.

### Beef / restricted-goods fix — LIVE (commit `a9fa747`)
Root cause: L1 triage `'contraband'` class conflated illegal-to-trade goods with export-restricted-but-classifiable goods, so "frozen beef" was REFUSED instead of classified. **General fix (not a beef-only patch):** triage now CLASSIFIES export-restricted-but-classifiable goods (beef→`0202.x`, sandalwood, restricted rice/onions, ozone-controlled chemicals); a STRUCTURED `legal_sensitivity` TradeFlag is attached on bovine lines (`0201`/`0202`/specific `0206` offal/`0210.20.00`) stating cow/ox/calf beef export PROHIBITED + boneless-buffalo PERMITTED under APEDA/FSSAI/DGFT conditions — indicative, not-liable.

### RDC-X divergence asker — BUILT + LIVE, but NET-NEGATIVE as calibrated
`DIVERGENCE_ASK_ENABLED=true` (founder-enabled in Railway). The divergence-ON 385 eval shows it FAILS the 3-sided gate: EFFECTIVE 8-digit FLAT (77.9→78.1%), over-ask 4.3%→8.0% (12 divergence over-asks on should-classify cases), divergence-ask recovery only 41.7% (vs triage 68.8%), McNemar p=0.146 (no accuracy change). Orchestrator RECOMMENDED turning it OFF; **founder chose to KEEP it ON for now (zero users, recalibrate later).** The ask→answer→code pipeline is PROVEN end-to-end live. **RECALIBRATION TODO:** raise the gate (fewer asks) + fix axis targeting (the 41.7% recovery).

### Eval harness upgrades (this session)
- Simulator auto-answers divergence-asks (`4870b60`; option `target_codes` → gold-leaf match, deterministic + honest). Runner `--suite realworld` (`40bcb13`). Probes `verify-vertex-adc.ts` + `test-ask-answer-pipeline.ts`. `lib/auth.ts` accepts ADC (`271742f`) AND inline SA JSON via `GOOGLE_APPLICATION_CREDENTIALS_JSON` (`977ec36`). Local eval setup uses gcloud ADC (aryan@prevyl.com, project `prevyl`).

### Infra
- **Backend = Railway** (`hs-code-classifier`, replicas=1 — the in-process token bucket is a SINGLE-INSTANCE invariant; do NOT autoscale). **Frontend = Vercel.** **DB = Supabase Tokyo (ap-northeast-1, ref `waowoznsvaosgcgiivzo`) — PERMANENT home (Mumbai migration CANCELLED).**

### ⚠️ Security TODO (do early)
The prod SA key file (`prevyl-8f5296770d3e.json`) leaked into a chat transcript (IDE selection) and sits in the founder's Downloads → **ROTATE the key** (delete in GCP → create fresh → update Railway `GOOGLE_APPLICATION_CREDENTIALS_JSON`) + DELETE the Downloads file. Low-but-real (worst case: someone spends the trial credit, not the card). **Never write the SA key value into any file.**

### Key commits this session (`origin/main` == `977ec36`)
`d3109ef` loading-text fix; `a9fa747` beef/restricted-goods fix; `3b3ad54` real-world eval suite; `271742f` auth-ADC; `40bcb13` runner `realworld` + probes; `4870b60` simulator divergence-answer fix; `977ec36` inline-SA-key auth. (Prior: `d373e6b` Phase B Steps 0-2; `0ae224a` repair-loop latency; `cd7a5a3` v2 adapter + flag; A-phase `4be037a`/`9315713`/`2dfea2a`/`3c43fd7`.)

### Env flags
- `USE_V2_CLASSIFIER` (ON in prod), `LLM_PROVIDER`/`EMBEDDING_PROVIDER` (`vertex` in prod; `developer` = free-key fallback), `DIVERGENCE_ASK_ENABLED` (on in prod — net-negative, recalibrate), `MAX_CLASSIFICATIONS_PER_DAY` (live cap), `CLASSIFY_ASYNC` (off — async/SSE dormant), `GEMINI_RPM` (no-op), `EVAL_CONCURRENCY` (≤3 on the new Vertex project), `CALIBRATED_CLASSIFY_ENABLED` (off), `SIBLING_ASK_ENABLED` (off).

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

### NEXT STEPS (priority order) — post-launch
1. **Verify prod is on Vertex** (founder): classify on the live site + confirm AI-Studio free-key usage stays flat / GCP billing shows the credit draw.
2. **Rotate the leaked prod SA key + delete the Downloads file** (see Security TODO).
3. **Recalibrate the divergence asker** (it over-asks / is net-negative) OR turn it off, BEFORE real traffic.
4. **Spot-check the real-world-60 gold** (user-gated) → make the 67.8% authoritative; the confident-wrong cases (esp. brands) may be gold disagreements vs real errors.
5. **Brand-name handling + confidence calibration** (the real-world weak spots).
6. **Watch the trial credit; revert prod to the free key or a small capped key before ~Sept 4 / exhaustion.**
7. **M4 trade intelligence** (duty rates, export policy on every result) — plan at `backend/docs/TRADE-INTELLIGENCE-PLAN.md` (awaiting founder approval of §7).
8. **(Backlog, low-pri)** eyeball the 11 r19-vs-now flipped cases (McNemar says noise); brain ceiling-raisers (retrieval bucket / RRF fusion / chapter-recall safety net; fine-tuned domain reranker w/ sibling hard-negative mining; corpus re-embed with discriminating attributes; RAG over Indian ITC-HS advance rulings).

**Stale docs (superseded — do not follow for next steps):** `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md`, `NEXT-SESSION-PROMPT.md`, `PHASE-4.2-*` (pre-Phase-B state). `PHASE-B-PLAN-DRAFT.md` (superseded by `PHASE-B-PLAN.md`) and `FRONTEND-QUESTIONS.json` (intermediate) are deletable. The 3-free-gate / SSE-first-loader notes anywhere are SUPERSEDED by gate-artifacts-not-access + inline-sync honest stepper.

**Operating rules (user-set):** PURE ORCHESTRATOR (decide + dispatch subagents/Workflows, keep own context lean, verify delegated work, independent/adversarial review on delegated pieces); quality-first and INCREASING (never reduce capability/quantity); root-cause not patch (a green eval via hacks = false pass); **one principled change per measured THREE-SIDED gate**; **DEBATE 3-4 genuinely-distinct options with real pros/cons BEFORE recommending** (never a 2-option binary; debate first even inside AskUserQuestion); CORRECTNESS > SPEED always; STOP-AND-SURFACE on a wrong path or clearly better way; **gold/eval-data changes USER-GATED**; commit at every kept gate, do NOT push unattended; plain-language milestone updates; human-sounding external drafts (no AI tells); use the full capability of Opus 4.8 + Claude Code (Supabase/Vercel/Railway/Context7/Chrome MCPs as needed); **PROD runtime = Vertex/prevyl on the $300 trial credit (free-tier Gemini Developer key is the instant fallback; never reintroduce Cohere); NO paid API calls beyond the approved trial-credit usage without explicit cost-aware go-ahead, and revert prod off the credit before it runs dry (~Sept 4)** (build/mock-test on the Claude subscription; eval on the approved credit or the free key).

**Ultimate bars:** 8-digit OUTRIGHT ~77%+ (in-band) + calibrated ASK + top-3 ~86% + near-zero confident-wrong; chapter ≥92–95%, heading ≥82–88%, routing ≥90%, p95 fast-enough (perceived-latency via the honest staged stepper; cut only free/architectural latency — never accuracy), verifier over-rejection ≤8%.
**Prior design specs (historical):** `backend/docs/PHASE-4.2-4.4-BUILD-DESIGN.md`, `backend/docs/PHASE-4.2a-BASELINE.md`. Eval canonical = `backend/src/eval/` master suite, 385 cases / 343 gold-code frozen denom (`backend/eval/` 168-stub DEPRECATED).

## Roadmap
- DONE Phase 1: Eval harness (168 cases, on `feat/phase-1-eval-harness`)
- DONE Phase 2: Data foundation (normalized schema + canonical data + 7-audit verified)
- DONE Phase 3: Architecture spike — 30 paper-traces, 29/30 CORRECT, verdict PROCEED_TO_PHASE_4
- DONE Phase 3.5 (May 2026): Data completion + architecture lock-in — chapter_exclusions +352 rules, fts_search_text + text[] + sections.notes, A9 empirical proof 10/10 CORRECT, D1 model stack LOCKED. 8 carryforwards in ARCHITECTURE.md §12.
- DONE Phase 4: Brain rebuild — v2 (8-layer) BUILT and LIVE. Phase 4.0 DONE (O1-O5; O2 12,406 ingested). Phase 4.2a DONE (orchestrator L0-L5 + repair/backtrack + ASK/REFUSE + continueWithAnswer). Trust-spine + gold-freeze rounds DONE. **Brain validated on Vertex/prevyl: OUTRIGHT 8-digit 75.2% / EFFECTIVE 77.9% / TOP-3 84.4% / chapter 87.3% / heading 84.1% / routing 93.4%** (McNemar p=0.4807 vs r19 → unchanged). Phase A (cost-efficiency) DONE; Phase B ship-arc DONE (INLINE-SYNC launch, `USE_V2_CLASSIFIER` ON; async job-queue/SSE ships DORMANT behind `CLASSIFY_ASYNC=off`); Step 3 paid live-validation DONE → flag flipped ON in Railway. Eval canonical = `backend/src/eval/` master suite, 385 cases + 60-case real-world staged suite (168-stub DEPRECATED).
- DONE Frontend rebuild: CLEAN REBUILD on Next 16 / Tailwind v4 / React 19 / latest shadcn; all 12 decisions realized; theme = Living-Certificate / Customs-Ledger; experience rebuilt within the theme; auth + cloud history + permalinks live.
- DONE M5: Shipped `hscode.prevyl.com` — a FREE web product (top-3 ITC-HS codes + cited rationale record + calibrated confidence band). Hosts: backend Railway + frontend Vercel + Supabase Tokyo (Mumbai migration cancelled — Tokyo is permanent). PDF reports, opt-in permalinks, feedback live. Monetize later via a Prevyl bundle.
- IN PROGRESS M4: Trade intelligence — duty rates, export policy on every result. Plan at `backend/docs/TRADE-INTELLIGENCE-PLAN.md` (awaiting founder approval of §7); the beef/restricted-goods `legal_sensitivity` TradeFlag is a first installment.
- NEXT (post-launch polish): rotate the leaked SA key; recalibrate/disable the divergence asker; spot-check the real-world-60 gold; improve brand-name handling + confidence calibration; revert prod off the trial credit before ~Sept 4.

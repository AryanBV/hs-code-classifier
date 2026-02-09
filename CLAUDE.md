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
- `hs_codes` table: 19,441 rows — columns: code (text), description (text), embedding (vector 1536), notes (JSONB), unit (text)
- Code format in DB uses CHARACTER LENGTH including dots:
  - Chapter: "01" → LENGTH = 2
  - Heading: "0101" → LENGTH = 4
  - Subheading: "0101.21" → LENGTH = 7 (includes 1 dot)
  - Tariff line: "0101.21.00" → LENGTH = 10 (includes 2 dots)

### External APIs
- OpenAI: GPT-4o-mini for classification LLM calls, text-embedding-3-small for vector embeddings
- Supabase: PostgreSQL database + pgvector for semantic search

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

### 1. Database LENGTH Bug
NEVER query with LENGTH(code) = 6 or LENGTH(code) = 8. HS codes include dots in the database.
Use: LENGTH(code) = 2 (chapter), 4 (heading), 7 (subheading), 10 (tariff line).
This was a critical bug that returned 0 rows for all 8-digit code lookups.

### 2. Chapter Notes JSONB Structure
The `hs_codes.notes` JSONB field contains: chapterNotes (array), sectionNotes (array), policyConditions (string|null), exportLicensingNotes (string|null).
Known data quality issues:
- ~20 chapters have corrupted chapterTitle in JSONB
- 10 chapters missing notes entirely: 50, 52, 53, 64, 75, 76, 78, 79, 80, 81
- Some chapterNotes arrays have metadata headers as first element — skip them

### 3. OpenAI Response Format
Use `json_schema` (strict structured outputs) NOT `json_object`. The json_object mode doesn't guarantee schema compliance.

## What NOT to Do
- DO NOT change classifier/ files without running tests afterward
- DO NOT change data/ files without understanding the classification rules they encode
- DO NOT hardcode API keys — always use process.env
- DO NOT commit .env files
- DO NOT use LENGTH = 6 or 8 for HS code queries (see gotcha #1)

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

## Current Status (Feb 2026)
- Chapter accuracy: 96.4% on 28 integration tests (WARNING: these are easy cases, real accuracy is likely 60-70%)
- 8-digit code accuracy: Not measured at scale
- Routing: Keyword-based specificity analyzer (to be replaced by LLM "Brain" in M3)
- Trade intelligence: Data partially in DB but not displayed to user
- Codebase: Cleaned up (ARY-45), foundation work in progress (M1)

## Roadmap
- M1: Foundation — NestJS, vitest, logging, data audit (current)
- M2: Eval harness (168 cases) → measure real accuracy → improve with data
- M3: Brain — LLM replaces keyword routing
- M4: Trade intelligence — duty rates, export policy on every result
- M5: Ship — PDF reports, CI, feedback, investor demo

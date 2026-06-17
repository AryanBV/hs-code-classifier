# Prevyl — Backend API

Express + TypeScript service that hosts the **v2 ITC-HS classification brain** — a six-stage (L0–L5) pipeline over a Supabase Postgres + pgvector catalogue, with Google Gemini 3.5 Flash for triage, selection, and reranking. Part of the [hs-code-classifier](../README.md) monorepo; deployed on **Railway**.

> The live classifier is `src/classifier-v2/` (enabled by `USE_V2_CLASSIFIER`). The older `src/classifier/` (an OpenAI keyword/decision-tree pipeline) is retained only as an instant rollback and is **not** the production path.

---

## Tech stack

- **Runtime:** Node.js 18+
- **Framework:** Express 4 + TypeScript (strict)
- **ORM:** Prisma 5
- **Database:** PostgreSQL on Supabase, with **pgvector** (1536-dim embeddings)
- **AI:** Google **Gemini 3.5 Flash** (`@google/genai`) for triage / select / rerank; **`gemini-embedding-001`** for embeddings — via the Gemini Developer API by default, or Google Vertex AI (`LLM_PROVIDER=vertex`) as a rollback seam

---

## The classification pipeline (`src/classifier-v2/`)

Orchestrated by `src/classifier-v2/index.ts`:

| Layer | File | Role |
|-------|------|------|
| L0 Normalization | `layers/L0-normalization.ts` | aliases, tokenization, composite-material flag |
| L1 Triage | `layers/L1-triage.ts` | classify / ask / refuse + attribute extraction (Gemini) |
| L2 Retrieval | `layers/L2-retrieval.ts` | pgvector HNSW + Postgres full-text + rerank |
| L3 Rules filter | `layers/L3-rules-filter.ts` | chapter-exclusion rules, candidate collapse, backtrack |
| L4 Select | `layers/L4-select.ts` | pick one code with citation + GIR (Gemini) |
| L5 Verifier | `layers/L5-verifier.ts` | 10 mechanical checks (no LLM), drives the repair loop |

Ambiguous inputs return a clarifying question instead of a guess; verifier failures trigger a bounded repair loop back into L4.

---

## API endpoints (`src/api/classify.ts`)

| Method & path | Body | Returns |
|---------------|------|---------|
| `POST /api/classify` | `{ query: string, previousAnswers?: Record<string,string> }` | `responseType: 'classification' \| 'question' \| 'refused'` |
| `POST /api/classify/answer` | `{ originalQuery, answerId, answerLabel }` | continues a clarifying-question round |
| `GET  /api/classify/health` | — | health check |

A classification response carries the 8-digit code, leaf description, up to 3 alternatives, a confidence **band**, the cited source (heading/note + GIR), and reasoning.

---

## Setup

### 1. Install

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Key variables (see `.env.example` for the full list — never commit real values):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Postgres connection (pooled) |
| `DIRECT_URL` | Direct Postgres connection (for Prisma migrations) |
| `GEMINI_API_KEY` | Gemini Developer API key (default runtime provider) |
| `LLM_PROVIDER` / `EMBEDDING_PROVIDER` | `developer` (default) or `vertex` (rollback) |
| `USE_V2_CLASSIFIER` | `true` to run the v2 brain (legacy path otherwise) |
| `PORT` / `NODE_ENV` / `FRONTEND_URL` | server + CORS config |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | per-IP rate limit |
| `MAX_CLASSIFICATIONS_PER_DAY` | daily cost ceiling |

### 3. Generate the Prisma client

```bash
npm run prisma:generate
```

### 4. Run

```bash
npm run dev      # ts-node-dev, hot reload
# or
npm run build && npm start
```

---

## Data model (`prisma/schema.prisma`)

The full Indian ITC-HS taxonomy, normalized with FK + regex CHECK constraints:

```
Section (21) → Chapter (97) → Heading (1,232) → Subheading (5,613) → TariffLine (12,460)
```

- `Chapter` carries 7 JSONB note columns (chapter notes, supplementary notes, export-licensing notes, definitions, …); notes also exist at section/heading/subheading level.
- `TariffLine.embedding` is a `vector(1536)` pgvector column for semantic retrieval.
- Supporting data: General Interpretive Rules, 35 deterministic chapter-routing rules, 1,505 chapter-exclusion rules, per-tariff-line attributes (a raw-SQL migration table).

Prisma commands: `prisma:generate`, `prisma:push`, `prisma:migrate`, `prisma:studio`, `prisma:seed`.

---

## Evaluation harness (`src/eval/`)

The brain is graded by an evaluation harness rather than spot checks:

- **385-case master suite** over a frozen gold denominator (N = 339) + a **60-case messy-real-world** suite.
- Metrics in `src/eval/metrics.ts`: outright vs effective (ask-recovered) accuracy, top-3, per-level routing, confident-wrong rate, calibration (Brier, ECE with bootstrap CIs), Wilson intervals, and **McNemar** significance gating.
- Design contract: `docs/EVAL_DESIGN.md`.

Latest validated run: **75.2% outright / 77.9% effective / 84.4% top-3 / 87.3% chapter / 84.1% heading / 93.4% routing**; median latency ~26 s.

```bash
# tests
npm run test:integration
# eval runner (see src/eval/ for suites + flags)
npx tsx --require dotenv/config src/eval/runner.ts --suite master
```

---

## Project structure

```
backend/
├── src/
│   ├── api/              # /api/classify routes + v2 adapter
│   ├── classifier-v2/    # the live 6-layer brain
│   │   ├── layers/       # L0 … L5 + QGS
│   │   └── lib/          # provider seam, retrieval, reranker, verifier
│   ├── classifier/       # legacy v1 (rollback only)
│   ├── data/             # GIRs, confusing-pairs, chapter triggers
│   ├── rules/            # deterministic chapter-routing rules
│   ├── middleware/       # rate limiter, error handler, CORS
│   ├── eval/             # evaluation harness
│   └── index.ts          # Express entry point
├── prisma/               # schema + migrations
├── docs/                 # ARCHITECTURE.md, EVAL_DESIGN.md
└── railway.json          # Railway (Nixpacks) deploy config
```

---

## Deployment

Deployed on **Railway** (Nixpacks; `railway.json`) as a single replica — the in-process rate-limiter/token-bucket assumes one instance, so do not autoscale. The frontend (Vercel) calls this service via `NEXT_PUBLIC_API_URL` / `BACKEND_API_URL`.

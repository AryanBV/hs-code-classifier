# Prevyl — Indian ITC-HS Code Classifier

> **The right export code, with its legal basis.**
> Describe a product and get its 8-digit Indian ITC-HS export code — with the chapter, heading, and tariff note it rests on cited, so you can verify the answer before you file.

**Live (free):** [hscode.prevyl.com](https://hscode.prevyl.com)

---

## The problem

Every Indian exporter must put an 8-digit ITC-HS code on every shipment. The taxonomy is unforgiving — 21 sections, 97 chapters, and **12,460 tariff lines** whose distinctions turn on legal notes and the General Interpretive Rules (GIRs) rather than common sense. Getting it wrong risks ₹50,000–5,00,000 in customs penalties, so small exporters either spend 30+ minutes per product hunting the catalogue or pay a consultant ₹2,000–10,000 per lookup.

A language model can guess a code in seconds — but a confidently wrong code is worse than none, and a black-box guess nobody can check is unfileable. **The hard problem isn't speed; it's producing a code an exporter can audit against the actual tariff text before staking a shipment on it.**

## The approach

Prevyl runs a **six-stage classification pipeline (L0–L5)** instead of a single prompt. Each stage has one job, and the last stage mechanically checks the model's work:

| Stage | What it does | LLM? |
|-------|--------------|------|
| **L0 — Normalization** | Alias substitution, tokenization, multi-material (composite) flagging that gates GIR-3(b). | Deterministic |
| **L1 — Triage** | Decides **classify / ask / refuse**, extracts attributes, picks candidate chapters. | Gemini 3.5 Flash |
| **L2 — Retrieval** | Hybrid recall over the whole catalogue: pgvector HNSW semantic search on 1536-dim embeddings + Postgres full-text search, then a reranker. | Embedding + reranker |
| **L3 — Rules filter** | Applies 1,505 deterministic chapter-exclusion rules, collapses to a handful of candidates, emits a backtrack signal when too few survive. | Deterministic |
| **L4 — Select** | Picks **one** code and must cite the heading/note and the GIR it relied on, with a reasoning chain. | Gemini 3.5 Flash |
| **L5 — Verifier** | Pure SQL + TypeScript, **no LLM**: ten mechanical checks (incl. verbatim-citation containment and an embedding cosine floor). Drives a repair loop. | Deterministic |

When a description is too thin to separate two sibling codes, the system **asks one targeted clarifying question** instead of guessing (multi-turn, with a 3-round budget). When L5 rejects a selection, it feeds structured failures back to L4 and repairs — up to two rounds.

## Accuracy — measured, not marketed

Accuracy is a **measured number from an evaluation harness**, not a marketing target. A 385-case master suite runs over a frozen gold denominator (N = 339), scored with real calibration (Brier, ECE with bootstrap CIs, Wilson intervals) and **McNemar significance gating**, so one principled change is judged per round and a regression can't ship hidden behind a cherry-picked example.

Latest validated run (classifier v2):

| Metric | Result |
|--------|--------|
| Outright 8-digit code | **75.2%** |
| Effective (with clarifying-question recovery) | **77.9%** |
| Top-3 code | **84.4%** |
| Chapter accuracy | **87.3%** |
| Heading accuracy | **84.1%** |
| Routing accuracy | **93.4%** |
| Median latency | ~26 s |

A separate 60-case "messy real-world input" suite (misspellings, Hinglish, brand names) holds the honest figure at **67.8%** outright.

## Tech stack

**Backend** (`backend/`) — Express 4 + TypeScript, deployed on **Railway**
- Google **Gemini 3.5 Flash** (`@google/genai`) for triage, selection, and reranking; **`gemini-embedding-001`** (1536-dim) for embeddings — served through Google Vertex AI in production with the Gemini Developer API as a drop-in fallback
- **Prisma 5** over **Supabase Postgres** (+ **pgvector**), region ap-northeast-1 (Tokyo)
- Custom in-process rate limiting and a daily cost ceiling

**Frontend** (`frontend/`) — **Next.js 16** (App Router) + React 19 + Tailwind v4, deployed on **Vercel**
- shadcn-style components on Radix primitives, `motion` for animation, TanStack Query
- Supabase Auth (Google OAuth + email magic-link), client-side PDF "Classification Record" export (`@react-pdf/renderer`)
- Theme: *Living Certificate / Customs Ledger* — Fraunces + Hanken Grotesk + Commit Mono

**Data** — the full Indian ITC-HS taxonomy as first-class, constrained data: 21 sections → 97 chapters → 1,232 headings → 5,613 subheadings → 12,460 tariff lines, with FK and regex CHECK constraints, chapter notes, GIRs, 35 deterministic chapter-routing rules, 1,505 exclusion rules, and per-tariff-line attributes.

## Repository structure

```
hs-code-classifier/
├── backend/          # Express + TypeScript API (the classifier)
│   ├── src/
│   │   ├── api/              # /api/classify routes + v2 adapter
│   │   ├── classifier-v2/    # the live 6-layer brain (L0–L5 + QGS)
│   │   │   ├── layers/       # L0-normalization … L5-verifier
│   │   │   └── lib/          # provider seam, retrieval, reranker, verifier libs
│   │   ├── data/             # GIRs, confusing-pairs, chapter triggers
│   │   ├── rules/            # deterministic chapter-routing rules
│   │   └── eval/             # evaluation harness (suites, metrics, runner)
│   ├── prisma/              # schema + migrations
│   └── docs/                # architecture & evaluation design
├── frontend/         # Next.js 16 product (wizard, result, history, PDF)
│   └── src/
│       ├── app/             # App Router pages + BFF API routes
│       ├── components/      # result/, auth/, ui/ (shadcn-style)
│       └── lib/             # api client, pdf, supabase, history
└── data/             # raw ITC-HS source data
```

## Local development

**Prerequisites:** Node.js 18+, a Supabase Postgres database with pgvector, and a Gemini API key.

```bash
# Backend
cd backend
npm install
cp .env.example .env          # fill in DATABASE_URL, GEMINI_API_KEY, etc.
npm run prisma:generate
npm run dev                   # http://localhost:3000

# Frontend
cd frontend
npm install
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL / BACKEND_API_URL
npm run dev
```

**Useful backend scripts:** `npm run build` (tsc), `npm start` (production), `npm run test:integration`, and the eval runner under `src/eval/`.
**Useful frontend scripts:** `npm run build`, `npm run lint`, `npm run type-check`.

Configuration is entirely via environment variables (model provider, rate limits, daily ceiling, feature flags) — see each service's `.env.example`. No secrets are committed.

## Design principles

- **Show the legal basis, not just the answer.** Every result carries a verbatim citation (chapter/heading/note text) and the GIR applied, kept visually distinct from the model's generated reasoning.
- **Honest confidence.** Confidence is shown as a **High / Medium / Low band** — the underlying number is stripped at the type, client, and server layers so the UI can never imply false precision.
- **Verify, don't trust.** The L5 mechanical verifier checks the model's cited source against the real database text before a code is returned.
- **Ask when unsure.** Ambiguous inputs get one targeted question instead of a confident guess.

## Status

Live, free MVP at [hscode.prevyl.com](https://hscode.prevyl.com). Solo-founder project. Post-launch work focuses on confidence calibration, brand-name handling, and trade-intelligence enrichment (duty rates and export policy on every result).

## License

MIT — see [LICENSE](LICENSE).

## Contact

**Aryan B V** · Bengaluru, Karnataka · [github.com/AryanBV](https://github.com/AryanBV)

---

*Indicative, AI-generated, and not official customs or legal advice. Always verify against the official ITC-HS schedule before filing.*

> SUPERSEDED 2026-06-01 — earlier-phase document, kept for history. CURRENT STATE: see plans/ROADMAP-2026-06-01.md (authoritative), backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md (START HERE block), and CLAUDE.md Current Status. v2 brain ~77% OUTRIGHT / ~86% top-3, Cohere decommissioned. NOTE: Vertex AI is now DISABLED (billing); runtime moved to the **Gemini Developer API free tier** (same gemini-3.5-flash / gemini-3.1-pro-preview / gemini-embedding-001 models, free). Sequencing is **Phase A cost-efficiency FIRST, then Phase B ship, then Phase C frontend** — and **correctness > speed** (latency is secondary; never trade accuracy for speed). The earlier "Vertex-only / ship arc latency-first" framing is SUPERSEDED.

# classifier-v2

Phase 4 v2 classifier scaffolding for the HS Code Classifier rebuild.

See `backend/docs/ARCHITECTURE.md` for the locked 8-layer pipeline spec
(VCMS — Verified Cascade with Multi-Signal Synthesis) and `backend/docs/sub-specs/`
for the targeted design notes (verifier rules, QGS info-gain, thinking_level,
predicate DSL, model IDs).

## Directory layout

```
classifier-v2/
  index.ts              entry point (stub — throws until layers land)
  types.ts              shared TypeScript interfaces for the pipeline
  lib/
    auth.ts             reusable GoogleAuth client (SA-based, lazy)
    thinking-config.ts  model-conditional thinking helper (sub-spec 03)
    vertex-client.ts    raw-HTTPS generateContent wrapper (Flash + Pro)
  layers/               L0..L8 implementations (TBD per Phase 4.1/4.2/4.3)
```

## Smoke test

```
cd backend
npx ts-node scripts/smoke-classifier-v2.ts
```

Hits both Gemini tiers (Flash + Pro preview) plus the 2.5-pro fallback path to
verify the model-conditional thinking-config helper handles both APIs.

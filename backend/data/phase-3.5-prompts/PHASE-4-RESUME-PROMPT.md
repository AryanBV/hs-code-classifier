> ⛔ SUPERSEDED (2026-06-01) — describes PRE-Phase-B state. Current continuation prompt: `C:\Users\ASUS\.claude\plans\CONTINUATION-PROMPT-2026-06-01.md`. Phase A DONE + Phase B Steps 0-2 committed (HEAD `d373e6b`) + 12 frontend decisions LOCKED; next = START THE FRONTEND BUILD.
> SUPERSEDED 2026-06-01 — earlier-phase document, kept for history. CURRENT STATE: see plans/ROADMAP-2026-06-01.md (authoritative), then backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md and CLAUDE.md Current Status. v2 brain ~77% OUTRIGHT / ~86% top-3. **Runtime is NO LONGER Vertex:** Vertex AI is DISABLED (billing crisis resolved, ~75% waived, case #71826606) and the runtime now uses the **Gemini Developer API free tier** (free-tier GEMINI_API_KEY in backend/.env — SAME models gemini-3.5-flash / gemini-3.1-pro-preview / gemini-embedding-001, for free); Cohere still decommissioned. Sequencing is **Phase A cost-efficiency FIRST** (Gemini Dev API client → token meter → caching → tiny validation), THEN Phase B ship (cutover → latency → streaming/jobs → calibration → DTO freeze), THEN Phase C frontend. **CORRECTNESS > SPEED** — latency is secondary; never trade accuracy for speed (repair loop + L5 verifier stay); no paid API calls without explicit cost-aware user OK. All "Vertex-only / runtime stays Vertex / ship-arc latency-first / credit-covered / do NOT conserve" framing below is OBSOLETE — see the ROADMAP.

# Phase 4 — Next-Session Resume Prompt (v2)

> **⚠️ Updated 2026-05-26:** This is the v2 resume prompt. v1 (locked 2026-05-25) is superseded by v2 architecture (locked 2026-05-26). Key change: all-Gemini cross-MODEL diversity (3.5 Flash + 3.1 Pro) replaces v1's same-family verify cascade; 8-layer pipeline with Mechanical Verifier + Active Learning + QGS replaces v1's 6-stage cascade. Build-time Opus 4.7 jobs precede runtime. See `backend/docs/ARCHITECTURE.md` for the canonical spec.

Paste this into a NEW Claude Code session to resume from where v2 architecture lock left off.

---

## Copy-paste resume prompt

```
I'm resuming the HS-code classifier rebuild at C:\Export Business\hs-code-classifier.
Phase 3 + 3.5 are COMPLETE (2026-05-25). Phase 4 v2 ARCHITECTURE is LOCKED (2026-05-26).
Implementation has not yet started. User authorization required before any code is written.

Step 1 — Read these in order to bootstrap context:
1. C:\Export Business\hs-code-classifier\backend\docs\ARCHITECTURE.md
   (Locked Phase 4 v2 spec: 8-layer pipeline with Mechanical Verifier + Active
    Learning + Question Generation Subsystem (QGS); all-Gemini runtime —
    Gemini 3.5 Flash for Triage+Select, Gemini 3.1 Pro for Tiebreak+Deep-Think;
    Cohere via own API key for embed + rerank; Opus 4.7 via Max subscription
    for build-time jobs only; 12 carryforwards in §12; Phase 4 next-steps in §14.)
2. C:\Users\ASUS\.claude\plans\ultrathink-i-m-resuming-the-zesty-candle.md
   (Architecture decision log + flowchart + per-problem-solved mapping +
    multi-signal synthesis table + v1→v2 transition rationale.)
3. C:\Export Business\hs-code-classifier\backend\data\phase-3.5-progress.md
   (Final state snapshot of Phase 3.5 — has v1 supersession banner at top.)
4. C:\Export Business\hs-code-classifier\backend\prompts\triage-v2.md +
   select-v2.md + verify-tiebreak-v2.md + deep-think-v2.md (seed prompts to
   be refined empirically in Phase 4 eval cycle).
5. C:\Users\ASUS\.claude\projects\C--Export-Business-hs-code-classifier\memory\
   MEMORY.md (carries forward orchestrator + stop-and-surface + practical-not-
   theoretical directives).

Step 2 — Get user authorization. v2 lock requires explicit go-ahead before any
implementation. Do NOT cut the branch or write classifier-v2 code until the
user confirms "go".

Step 3 — Cut the Phase 4 branch (first command of Phase 4):
   cd "C:\Export Business\hs-code-classifier"
   git checkout -b feat/phase-4-pipeline-build

Step 4 — Operate as ORCHESTRATOR throughout Phase 4. Dispatch subagents for
bulk implementation work, max 6 concurrent. Apply the orchestrator-quality-
cycle: implementer → spec reviewer → code quality reviewer per task. (Per
memory: feedback_orchestrator_quality_review_cycle.md +
feedback_strict_orchestrator_no_context_fill.md +
feedback_orchestrator_max_6_agents.md.)

Step 5 — Build Phase 4 v2 in this order:

   === Phase 4.0 — Build-time offline jobs (Opus 4.7 / Max sub) — ~5-7 days ===
   T4.0.1  O1 Notes Claims Extraction
           Run Opus 4.7 over all chapter notes (89/97 populated) + section
           notes (21/21) + sparse heading/subheading notes. Extract into
           notes_claims table with predicate DSL (see ARCHITECTURE.md §6).
           Manually validate 50 claims before bulk-running.
   T4.0.2  O2 Tariff Line Attribute Extraction
           For all 12,460 tariff_lines + parent chain + chapter notes context,
           extract structured attributes (material, form, function, etc.)
           into tariff_line_attributes table.
   T4.0.3  O3 Question Template Library
           Curate ~50 templates against confusing pairs + chapter structure.
           Each template: attribute → natural-language question + 2-4
           user-friendly options with value_labels.
   T4.0.4  O4 India Alias Map
           Curate ~200 entries (M.S.→mild steel, channa dal→chickpea split,
           atta→wheat flour, etc.).
   T4.0.5  O5 Confusing Pairs Documentation
           For each of 8 known pairs (42/43, 09/21, 61/62, 72/80, 42/62,
           54/55, 84/87, 29/30), extract discriminating attributes.

   === Phase 4.1 — Runtime skeleton — ~1 week ===
   T4.1.1  backend/src/classifier-v2/index.ts entry-point + @google/genai
           Vertex client setup (NOT legacy @google-cloud/vertexai).
           Use thinking_level enum (NOT integer thinkingBudget — mixing
           causes 400 errors). Auth via GOOGLE_APPLICATION_CREDENTIALS env
           pointing to backend/.gcp/vertex-sa.json.
   T4.1.2  Layer 0 — Input Normalization (deterministic, fast).
           Apply India alias map; composite-product keyword detector.
   T4.1.3  Layer 1 — Triage (Gemini 3.5 Flash, thinking_level=low) per
           backend/prompts/triage-v2.md. Multi-turn state machine.
           3-round ASK cap.
   T4.1.4  Layer 2 — Hybrid Retrieval (no LLM).
           Cohere embed-v4 query (via COHERE_API_KEY env, NOT Vertex).
           HNSW cosine at chapter/heading/subheading/leaf levels — all 4
           levels already populated (19,402 vectors).
           PostgreSQL GIN-FTS on tariff_lines.fts_search_text.
           NEW: GIN-FTS on chapter_exclusions.excluded_product_text as
           pre-filter for Stage 3 work.
           Cohere Rerank 4 Pro (NOT Fast — user authorized best quality).
           Use to_tsquery('english', head_nouns | raw_tokens) — OR-union,
           NOT websearch_to_tsquery (per ARCHITECTURE.md §4.5/§4.7).
           SHORTCUT: 60% of subheadings have 1 tariff_line child — skip
           rerank for the leaf step.

   === Phase 4.2 — Decision + verification — ~1 week ===
   T4.2.1  Layer 3 — Rules Filter + multi-destination collapse algorithm +
           backtrack gate (re-enter Layer 1 ONCE if zero candidates survive).
   T4.2.2  Layer 4 — Select (Gemini 3.5 Flash, thinking_level=low,
           level-by-level constrained enum) per backend/prompts/select-v2.md.
           REQUIRED: selected_code, citation.primary (note_id|exclusion_id +
           verbatim_text), citation.gir_applied (enum GIR-1..GIR-6),
           exclusions_checked[], export_policy, policy_condition,
           india_specific_flag, self_confidence.
   T4.2.3  Layer 5 — Mechanical Verifier (10 rules, pure SQL+code, no LLM)
           per ARCHITECTURE.md §6. Includes per-GIR validators (GIR-1..GIR-6)
           + notes_claims predicate evaluator + cross-chapter section notes
           + verbatim-citation TF-IDF check.
   T4.2.4  Question Generation Subsystem (QGS) wiring — template lookup +
           information-gain computation across alive candidates.

   === Phase 4.3 — Escalation + integration — ~1 week ===
   T4.3.1  Layer 6 — Tiebreak (Gemini 3.1 Pro, thinking_level=high) per
           backend/prompts/verify-tiebreak-v2.md. Different MODEL from
           Select (genuine cross-model diversity within Gemini family).
   T4.3.2  Layer 7 — Deep-Think (Gemini 3.1 Pro, thinking_level=high with
           extended thinking) per backend/prompts/deep-think-v2.md. Output
           AUTOCLASSIFY or REFUSAL.
   T4.3.3  Layer 8 — Active Learning write-back. Provisional case_law entry
           per emission; confirmation UI hook for wizard (Phase 5 to wire
           UI side); per-chapter coverage tracking.
   T4.3.4  Rewire backend/src/api/classify.ts to call classifier-v2.
           (Frontend speaks to /api/classify; legacy classifier transitively
           depends on backend/src/database/hs-codes.ts which references the
           dropped table and will break — must swap.)
   T4.3.5  Swap eval stub: backend/eval/classify-stub.ts → real classifier
           import in backend/eval/run-eval.ts.

   === Phase 4.4 — Eval + iteration — ~1-2 weeks ===
   T4.4.1  First eval gate: ≥80% chapter-match correctness on 168 cases.
           Segment failures by chapter + failure-mode class. Capture
           per-verifier-rule failure rates.
   T4.4.2  Iterate prompts on weak chapters (orchestrator-quality-cycle).
   T4.4.3  Target at Phase 4 exit: ≥85% chapter / ≥75% heading / ≥70% code;
           cost ≤$0.012/query mean; latency ≤8s p95.

   Total estimated Phase 4 effort: ~4-5 weeks. Build-time jobs (Phase 4.0)
   can run in parallel with runtime skeleton (Phase 4.1).

Standing rules carried forward:
- 🔴 STOP-AND-SURFACE on any defect/gap/better-approach — AskUserQuestion
- 🔴 ORCHESTRATOR NOT WORKER — delegate bulk work to subagents, max 6 concurrent
- Practical not theoretical — test empirically when docs are ambiguous
- Real fixes, not patches
- Better refuse than wrong code
- Multi-signal synthesis: notes + retrieval + rules + GIRs + attrs + policy
  — no single signal dominates; no signal neglected; hard timeouts; no loopholes

Watch-outs:
- v2 fixes v1's "same-family verify collapse" by using Gemini 3.1 Pro
  (different model from 3.5 Flash) at Tiebreak + Deep-Think. If eval shows
  Pro tiebreaker rubber-stamping Flash Select, escalate to user — could
  authorize OpenAI GPT-5.4 mini for genuine cross-family at Tiebreak
  (OPENAI_API_KEY available in env, but ASK FIRST before runtime use).
- Cohere is ~$200-300/mo cash (own billing, NOT credit-covered). At MVP scale
  acceptable; at higher volume, substitute Gemini-rerank chain is documented.
- Mechanical Verifier Rule 7 (notes-conformance) depends on quality of O1
  notes_claims extraction. If verifier rule 7 fails on >30% of cases, the
  problem is in the offline extraction (re-run with refined prompt), NOT in
  runtime Select.
- thinking_level=low on Triage gives real reasoning budget (fixes v1's
  thinkingBudget=0 paradox where Triage had 250+ lines of decision trees
  but couldn't think). DO NOT set thinkingBudget=0 anywhere.
- Vertex was renamed to "Gemini Enterprise Agent Platform" in 2026 — old
  aiplatform.googleapis.com endpoints still work; @google/genai SDK is the
  modern one (NOT @google-cloud/vertexai).

Build-time vs runtime model usage:
- Build-time (this conversation, O1-O5 jobs): Opus 4.7 via Claude Max
  subscription. Unrestricted. NO API key — uses subscription. Use freely
  for offline data engineering and orchestration.
- Runtime (deployed classifier): all-Gemini via Vertex SA (credit-covered)
  + Cohere via own API key (cash). NEVER use Anthropic at runtime —
  subscription is not deployable.
- Runtime escalation reserve: OpenAI via OPENAI_API_KEY (cash, ASK USER
  before triggering).

Phase 4 v2 EXIT GATE GREEN per architecture audit (2026-05-26):
- ARCHITECTURE.md v2 locked
- All 19,402 hierarchical embeddings populated (verified via Supabase MCP)
- chapter_exclusions: 1,505 rules, 102 multi-destination
- GIN-FTS indexes ready on tariff_lines.fts_search_text AND
  chapter_exclusions.excluded_product_text (underused signal)
- All Phase 3.5 deliverables carry forward unchanged
- 4 v2 seed prompts drafted (triage-v2, select-v2, verify-tiebreak-v2,
  deep-think-v2)
- Eval skeleton ready (168 cases)
- Secrets safe (vertex-sa.json gitignored)
- Auth wired (Vertex SA smoke test HTTP 200 confirmed; will be extended
  to test both 3.5 Flash AND 3.1 Pro per v2)

Phase 4 v2 budget:
- Runtime Gemini: ~$960/mo @ 100K queries — fully credit-covered through
  2027-05-08 (GenAI App Builder credit)
- Runtime Cohere: ~$200-300/mo @ 100K queries — cash on Cohere's own
  billing (user authorized "best models only" = Rerank 4 Pro)
- Total cash: ~$200-300/mo at projected scale. Free Trial credit
  ($326, expires 2026-06-10) absorbs much of June.
- Post-credit-expiry plan: OSS hybrid per D1-opensource-research.md
  (2027 horizon).
```

---

## What's already done (Phase 3 + 3.5 deliverables for reference)

### Database — verified via Supabase MCP 2026-05-26
- 8 tables (`sections`, `chapters`, `headings`, `subheadings`, `tariff_lines`, `chapter_exclusions`, `policy_conditions`, `_prisma_migrations`)
- All 19,402 hierarchical embeddings populated (1536-dim Cohere embed-v4, HNSW indexed at every level)
- 1,505 chapter_exclusions (115 NULL-redirect, 1,288 single-dest, 102 multi-dest up to 11 destinations)
- GIN-FTS on `tariff_lines.fts_search_text` (trigger-maintained — `refresh_fts_search_text()` for parent-title changes)
- **GIN-FTS on `chapter_exclusions.excluded_product_text`** (underused — v2 leverages for Stage 3 pre-filter)
- 60% of subheadings have exactly 1 tariff_line child (median=1, p95=6, max=70) — Direct-Leaf-Lookup viable for majority of queries
- `sections.notes` JSONB populated for all 21 sections
- A9 empirical re-run: 10/10 spike cases CORRECT

### Code + Config
- `backend/.gcp/vertex-sa.json` (SA JSON, gitignored)
- `GOOGLE_APPLICATION_CREDENTIALS` env var wired
- `COHERE_API_KEY` env var present (Cohere via own billing)
- `OPENAI_API_KEY` env var present (ASK FIRST before runtime use)
- Anthropic via Claude Max subscription (build-time only, no API key)
- Vertex smoke test passes (Gemini 3.5 Flash @ global, HTTP 200) — to be extended for 3.1 Pro
- `backend/scripts/verify-vertex-sa.ts` (smoke runner)
- `backend/eval/run-eval.ts` (168-case eval skeleton, stub mode — to be swapped to real classifier-v2)

### Documentation (v2)
- `backend/docs/ARCHITECTURE.md` (v2 locked spec, ~400 lines)
- `backend/docs/SETUP-vertex-service-account.md` (multi-model auth walkthrough)
- `backend/prompts/triage-v2.md`, `select-v2.md`, `verify-tiebreak-v2.md`, `deep-think-v2.md` (seed prompts)
- `backend/data/phase-3.5-progress.md` (final state snapshot with v1 supersession banner)
- `C:/Users/ASUS/.claude/plans/ultrathink-i-m-resuming-the-zesty-candle.md` (architecture decision log + flowchart)
- v1 files (triage-v1.md, select-v1.md, verify-router-v1.ts) retained for prompt-iteration history

### Branches
- `feat/phase-3-arch-spike` (Phase 3 + 3.5 committed)
- `feat/phase-4-pipeline-build` to be cut from this branch — NOT YET CUT

---

## Phase 4 first-day tasks (recommended dispatch order, AFTER user authorizes)

1. Cut branch `feat/phase-4-pipeline-build` off `feat/phase-3-arch-spike`
2. Verify Vertex auth for BOTH Gemini 3.5 Flash AND 3.1 Pro (update `verify-vertex-sa.ts`)
3. Phase 4.0 in parallel with 4.1: dispatch O1 + O2 build-time jobs (Opus 4.7) AND start runtime skeleton (classifier-v2/index.ts + Layer 0 + Layer 1)
4. Phase 4.0 O3 + O4 + O5 build-time jobs (parallel with 4.1 continuation)
5. Phase 4.1: Layers 0, 1, 2 (Normalization, Triage, Retrieval) — bulk reuses Phase 3.5 work
6. Phase 4.2: Layers 3, 4, 5 (Rules Filter, Select, Mechanical Verifier) — highest-stakes new code; predicate DSL evaluator (~150 LOC)
7. Phase 4.3: Layers 6, 7, 8 (Tiebreak, Deep-Think, Active Learning) — escalation + flywheel
8. Wire QGS subsystem (template lookup + info-gain selection); rewire `backend/src/api/classify.ts`; swap eval stub
9. Phase 4.4: Run eval gate; iterate on weak chapters; target Phase 4 exit thresholds

---

Good luck. Phase 3.5 + the v2 architecture audit cycle gave Phase 4 a strong foundation. The v2 architecture addresses every defect surfaced by adversarial review (same-family verify collapse, multi-destination cardinality, head-noun brittleness, thinking-budget paradox, undefined GIR precedence, free-form questions, prompt-only notes integration) by design, not by patch.

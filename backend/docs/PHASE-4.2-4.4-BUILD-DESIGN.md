> ⛔ SUPERSEDED (2026-06-01) — describes PRE-Phase-B state. Current continuation prompt: `C:\Users\ASUS\.claude\plans\CONTINUATION-PROMPT-2026-06-01.md`. Phase A DONE + Phase B Steps 0-2 committed (HEAD `d373e6b`) + 12 frontend decisions LOCKED; next = START THE FRONTEND BUILD.
> SUPERSEDED 2026-06-01 — earlier-phase document, kept for history. CURRENT STATE: see plans/ROADMAP-2026-06-01.md (authoritative). NOTE: the "Vertex-only / ship-arc latency-first / credit-covered" framing below is STALE. Vertex AI is now DISABLED (billing crisis resolved, ~75% waived, ₹17,742.63 remaining, case #71826606); runtime is the **Gemini Developer API free tier** (free-tier `GEMINI_API_KEY` in `backend/.env`, key-tested VALID 2026-06-01 — SAME models gemini-3.5-flash / gemini-3.1-pro-preview / gemini-embedding-001, for free; Cohere still decommissioned). Sequencing is now Phase A cost-efficiency FIRST → Phase B ship → Phase C frontend, and CORRECTNESS > SPEED (latency is SECONDARY — never trade accuracy for speed; repair loop + L5 verifier stay; NO paid API calls without explicit cost-aware user OK). v2 brain ~77% OUTRIGHT / ~86% top-3.

# Phase 4.2–4.4 Build Design — v2 Classifier Completion

**Date:** 2026-05-28 (rev 2 — senior re-audit integrated)
**Status:** DESIGN (user-approved direction; ready for implementation plan)
**Contract it builds against:** `backend/docs/ARCHITECTURE.md` (LOCKED v2). This designs *how we implement the remaining pieces* to the ultimate-quality bar; it does not redesign the architecture.
**Goal:** the ultimate ITC-HS classifier for Indian exporters — maximal correctness, defensible citations, correct refusals, good clarifying questions — measured continuously, improved until best-achievable.

---

## 1. Why this doc

L0–L5 are built and unit-tested (302/302). What remains (orchestrator, L6/L7/L8, QGS, API rewire, live eval) is Phase 4.2–4.4. We build **measurement-driven and incremental**: stand up the spine + the eval instrument first, then quality-build every remaining layer against *measured* failure data — never building blind, never stopping at a thin slice. This is the architecture's own intent (§10 prompts are seed drafts iterated against the eval; §11/§14.4 eval-segmented targets).

## 2. Current state (verified 2026-05-28)

| Piece | State |
|---|---|
| L0–L5 layers + libs; `types.ts` full contract (`PipelineRunState`, `ClassifyResult`, all layer I/O) | ✅ built, 302/302 vitest |
| Build-time data O1/**O2 (12,406 ingested)**/O3/O4/O5 | ✅ in DB |
| Orchestrator `classifier-v2/index.ts` | ❌ stub — **keystone gap** |
| L6 Tiebreak / L7 Deep-Think (prompts exist) | ❌ no code |
| QGS (info-gain + templates) | ❌ not built (L1 fallback question exists) |
| L8 Active-Learning + `case_law` table | ❌ not built |
| API `api/classify.ts` | ⚠️ legacy v1 |
| **Eval — canonical `backend/src/eval/`** (runner + scorer + compare + analyze-failures + measure-brain-chapters + gt-fix; ~386-case master suite) | ✅ active, wired to the **legacy** classifier; needs a thin v2 adapter |
| `backend/eval/run-eval.ts` + cases.json (168, stub) | 🗑️ DEPRECATED 2026-05-28 (banner + `DEPRECATED.md`); do not use |

**Reality not yet tested:** the 302 unit tests **mock** Vertex/Cohere/Supabase. No real Gemini call has ever flowed through the actual layers, and L2 has never hit the live DB. First integration will surface real-API truths (auth, response-shape drift, latency, rate limits). We de-risk this explicitly (§5 step 0).

## 3. Build philosophy — observable-incremental, zero throwaway

1. **Spine + instrument first** — the *real* orchestrator (permanent) wiring L0→L5 with verifier-repair + backtrack, plus the live eval harness + per-stage tracing + cost accounting.
2. **Baseline, then climb** — measure on the real eval; the number is a floor to improve from.
3. **Quality-build each remaining layer to a measured bar**, in failure-map order, re-evaluating after each, with the implementer→spec-reviewer→quality-reviewer cycle + root-cause-only fixes (§8.2).
4. **Don't stop at the minimum** — pass targets, push higher, harden, make the eval itself harder.

The ASK seam and L6/L7 escalation seams are **permanent** (§4.1); baseline fills them with minimal implementations that get *replaced*, never deleted-and-rewritten. No throwaway code.

## 4. Component designs

### 4.1 The Orchestrator — `classifier-v2/index.ts` (keystone)

```
classify(query, opts?): Promise<ClassifyResult>
continueWithAnswer(state, answerId, answerLabel): Promise<ClassifyResult>   // multi-turn ASK
```
Drives `PipelineRunState` (from `types.ts`) through the cascade (ARCHITECTURE §2/§7):

```
L0 normalize → L1 triage
   REFUSE → emit REFUSE
   ASK    → emit ASK (question: QGS if built, else L1 fallback) [3-round budget cap]
   CLASSIFY ↓
→ L2 retrieve → L3 rulesFilter
   backtrack_signal && !backtrack_attempted → re-enter L1 ONCE with constraint_hint
   still <1 candidate → escalate (L7 when built; baseline → REFUSE backtrack_no_fit)
→ L4 select ⇄ L5 verify   (repair loop: re-invoke L4 with verifier_failures, max 3)
   passed → emit CLASSIFY (+ L8 provisional write when built)
   failed×3 → EscalationPolicy ↓
→ L6 tiebreak → L5 verify → passed? emit : ↓
→ L7 deep-think → AUTOCLASSIFY | REFUSE
```

**Escalation = a pluggable `EscalationPolicy`** (`onVerifierExhausted`, `onZeroCandidates`), so the orchestrator we build now is the final one — only the policy implementation changes:
- **`BaselineEscalation` (step 1):** on verifier-exhaustion, **emit the best Select attempt AS the prediction** (not a refuse) and record the failed verifier rules + `would_escalate` in the trace. This makes the eval able to compute the **"verifier-rejected but actually correct"** rate — the single most valuable early signal: *high* → verifier/Select prompt is **over-rejecting** (root-fix the prompt/rule; don't build L6 to mask it); *low* → those cases genuinely need L6 Tiebreak. Zero-candidate → structured REFUSE. This is what lets us tell "Select wrong" vs "verifier over-rejecting" vs "needs escalation" **from data, not guesswork.**
- **`FullEscalation` (step 3):** real L6→L5→L7. Swapping the policy is the only change.

**ASK works day one:** L1 already returns `clarifying_question`; orchestrator maps it → `ClarifyingQuestion` and emits ASK. QGS (4.3) upgrades only the *question-selection* step; the seam is identical.

**Bounded:** repair ≤3, backtrack single-shot (`backtrack_attempted`), Q-budget 3.

**Error handling (§7):** Vertex 5xx → backoff ≤3 then surface system-error (NOT a misclassification); Triage invalid JSON → retry once temp=0 then REFUSE incoherent_query; Cohere down → fall back to raw retrieval scores, flag in trace.

### 4.2 Runtime validation — Zod (best-in-class boundary validation)

LLM output is an external boundary; Gemini `response_schema` constrains but does not *guarantee* shape. Add **Zod** schemas for `TriageOutput`/`SelectOutput`; parse every LLM response; route parse failures into the repair loop (Select) or invalid-JSON path (Triage). One source of truth for shape + precise repair messages. (Chosen over hand-rolled guards; directly serves correctness.)

### 4.3 Observability — the instrument (tracing + cost)

Aggregate per-layer `trace` + `PipelineTraceEvent` into one run trace answering, per case: final decision, `escalation_path`, emitting layer, per-verifier-rule PASS/FAIL/SKIP, latency, llm_calls, **and estimated cost** (per-call token counts × the §5 model price table) — captured from the **first** baseline so cost/latency are visible throughout, never a late surprise. Plus a **single-query trace CLI** (`npm run classify:trace -- "<query>"`) dumping every layer's I/O — the root-cause debugging tool (§8.2).

### 4.4 Eval wiring — `backend/src/eval/` (canonical) + a thin v2 adapter

The active eval is `src/eval/runner.ts` (~386-case master suite) calling the **legacy** classifier via `import { classify } from '../classifier'`, scored by `scorer.ts` against the legacy `ClassificationResult`. Wire v2 with a **minimal-diff adapter** so the entire scorer/compare/analyze stack is reused unchanged:

- **New `backend/src/eval/v2-adapter.ts`** exporting `classifyForEval(query): Promise<ClassificationResult | null>` = `mapV2ToLegacy(await classifyV2(query))`. Mapping (REAL `ClassifyResult` shapes from `classifier-v2/types.ts`):
  - `CLASSIFY` → `{ responseType:'classification', hsCode: code, description: citation.primary.verbatim_text, confidence: {HIGH:0.9,MEDIUM:0.6,LOW:0.3}[self_confidence], reasoning: reasoning_chain.join(' '), brain_used: escalated_to_deep_think, context: alternatives_considered.join('; ') }`
  - `ASK` → `{ responseType:'question', question: question.question_text, options: question.options.map(o=>({id:o.id,label:o.label})) }`
  - `REFUSE` → `null` (scorer's `determineActualRouting(null)` → `'reject'`)
  - Gotchas the scorer-contract revealed: v2 `self_confidence` is an **enum**, `citation` an **object**, `reasoning_chain`/`alternatives_considered` are **arrays** — map as above (do not assume number/string).
- **`runner.ts`** changes only its import: `../classifier` → `./v2-adapter`, `classify` → `classifyForEval`. Scorer, `compare.ts`, `analyze-failures.ts`, `measure-brain-chapters.ts`, `gt-fix/`, and `eval-results/{run_id}.json` output all work unchanged.
- **Build on (do NOT recreate):** routing 3×3 confusion matrix, weighted chapter/heading/code, per-chapter breakdown, failure taxonomy, before/after diff, ground-truth QA — already in `src/eval/`.
- **Add (small):** surface v2 `diagnostics` (escalation_path, llm_calls, estimated cost, per-verifier-rule PASS/FAIL/SKIP, **verifier-rejected-but-correct**) into the eval detail for a rich failure map; add **bounded concurrency** (5–10 parallel, rate-limit-aware) to the currently-serial runner for a ~2–3 min loop; add a **variance probe** (20-case ×3; temp=0 is already the vertex-client default) so the % is trusted.

### 4.5 L6 Tiebreak / 4.6 L7 Deep-Think (4.3)

Thin layers over `vertex-client`, `gemini-3.1-pro-preview`, thinking=high, prompts `verify-tiebreak-v2.md` / `deep-think-v2.md`. L6 → `SelectOutput` → re-verified. L7 → AUTOCLASSIFY (`SelectOutput`) or REFUSE. Prompts + result types already locked.

### 4.7 QGS (4.3) — ASK quality upgrade

Info-gain over alive candidates' discriminating attributes → look up `question_templates` (51 rows) → build options from distinct candidate values; no template → REFUSE with structured guidance. Spec: `sub-specs/02-qgs-and-backtrack.md`.

### 4.8 L8 Active Learning (4.3, last)

New `case_law` migration; provisional write on every emit; wizard confirmation → authoritative; per-chapter coverage. Accuracy-neutral short-term; built after L6/L7/QGS.

### 4.9 API rewire (4.4, AFTER eval gate)

Switch `api/classify.ts` to v2 and map `ClassifyResult` to the API response **only after** v2 clears the eval gate — never replace the running classifier with an unvalidated one. Retire legacy cleanly (no compat shim).

## 5. Build order (measurement-driven)

- **Step 0 (4.2a-pre) — Live smoke test.** Before trusting any build: one real query end-to-end through *actual* Gemini + Cohere + Supabase (un-mocked) to surface integration reality (auth, response drift, latency, rate limits) the mocked unit tests can't. **Extend** the existing `scripts/smoke-classifier-v2.ts` (currently Vertex-connectivity only — 4 PONG calls; `npm run smoke:v2`) into a full-pipeline smoke once the orchestrator exists.
- **Step 1 (4.2a) — Spine + instrument.** Orchestrator + Zod + tracing/cost + eval wiring via new `src/eval/v2-adapter.ts` (§4.4; + bounded concurrency + variance-probe + diagnostics capture) + ASK-via-L1 + `BaselineEscalation`. Orchestrator integration tests (mocked layers). → first runnable `classify()`.
- **Step 2 (4.2b) — Baseline.** Full eval (CLASSIFY + refuse + ASK). Produce the failure map: per-stage/per-chapter, verifier-rejected-but-correct rate, escalation-need rate, cost/latency.
- **Step 3 (4.3) — Quality-build, failure-map-ordered.** L6 → L7 → QGS → L8 (reorder by what the map shows hurts most), re-evaluating after each; prompt iteration one at a time; swap to `FullEscalation`. Each change is root-cause-driven (§8.2).
- **Step 4 (4.4) — Climb + harden.** Drive to targets then beyond; rewire API; improve the eval (§6); lock prompts at exit.

**Expectation-setting:** the first baseline may be *low* (prompts are seed drafts) — that is the intended starting point for iteration, not a failure.

## 6. Eval improvement plan (canonical = 386-case master suite; iterate-first)

Adopt `src/eval/` master suite (~386 cases) as canonical. **Defer hardening until after the first v2 baseline** — the baseline reveals which cases actually decide pass/fail, and only those are worth gold-plating. Then, **iterate-first then harden the decisive subset**: (a) **extend the existing `gt-fix/` tooling** for authoritative provenance (DGFT/CBIC/WCO) on the decisive hard + reject cases — build on it, don't rebuild; (b) **mine the frozen 168** `backend/eval/cases.json` for any unique queries worth merging into the master suite; (c) add **attribute-discrimination cases** exercising the ingested O2 data (steel grade by carbon_pct, knitted-vs-woven). Re-baseline (`compare.ts`) after each batch. The 168-case `backend/eval/` system is DEPRECATED.

## 7. Library / tooling choices

- **Zod** — runtime validation of LLM JSON (best-in-class; serves correctness). NEW dep.
- **vitest**, **`@google/genai`**, **`pg`**, **Cohere SDK** — keep (in use).
- **NOT XState / no FSM lib** — the cascade is bounded and mostly linear (two bounded loops); an explicit typed orchestrator is clearer and more debuggable. Best-in-class ≠ heaviest dependency.
- When a non-trivial choice is genuinely uncertain at build time, do a *targeted* web search for the current best (or Claude-in-Chrome), and record the choice + rationale.

## 8. Testing & execution

### 8.1 Testing strategy
Unit per layer (exists) + **orchestrator integration tests** (mock L0–L7 to assert control flow: ASK return, backtrack-once, repair ≤3, escalation routing, error paths) + the **live smoke test** (§5 step 0) + **eval as the acceptance gate**. New layers (L6/L7/QGS/L8) are **TDD** — failing test first, then implement.

### 8.2 Iteration discipline — root-cause, not patches
- Every eval failure is triaged to its **root layer** (the single-query trace CLI + per-rule trace make this concrete) and fixed there — prompt / retrieval / verifier rule / build-time data / orchestrator logic. **No per-case hacks**; a green eval bought with special-cases is a false pass.
- **Prompt versioning:** never overwrite a prompt; tag the new version (`triage-v3.md`) and record the eval delta. Reversible, auditable.
- **Per-layer Definition of Done:** unit tests pass + integrates into orchestrator + eval does not regress (diff report clean) + adversarial review pass.

### 8.3 Execution method — leveraging Opus 4.7 + Claude Code
To get the best out of Opus 4.7 + the tooling (and keep quality high):
- **Orchestrator-as-coordinator:** I stay lean; bulk implementation goes to Opus subagents (the proven O2 pattern). Per-agent **git worktrees** so independent layers (L6, L7, QGS are independent once the seams exist in step 1) are built **in parallel** without collision, then integrated.
- **Adversarial review before locking** each layer/prompt (dispatch a devil's-advocate Opus reviewer — caught real defects in O2 and Phase 3.5).
- **implementer → spec-reviewer → quality-reviewer** cycle on each layer/prompt change.
- **Opus 4.7 for the hard reasoning** — QGS info-gain design, verifier edge cases, prompt iteration, failure root-causing — where deep reasoning pays off. Runtime stays all-Gemini (cost). [SUPERSEDED 2026-06-01: runtime is now the Gemini Developer API **free tier**, not Vertex; same Gemini models, billed-Vertex DISABLED — see top banner / ROADMAP-2026-06-01.md.]
- **systematic-debugging** skill on every non-obvious failure before proposing a fix.

## 9. Targets / exit criteria (ARCHITECTURE §14.4)

First gate ≥80% chapter; Phase-4 exit ≥85% chapter / ≥75% heading / ≥70% code; mean cost ≤$0.012/query; p95 latency ≤8s. Then push higher. **STOP-AND-SURFACE triggers:** tiebreak >20% of queries (review Select prompt — root cause, not L6 band-aid); verifier Rule-7 fail >30% (review O1 notes_claims quality); identical rule failure across many cases (architectural review); cost >$0.015/q.

## 10. Decisions locked with user (2026-05-28)

1. **L8 timing** — build last in 4.3 (after L6/L7/QGS). ✓
2. **Eval-hardening** — iterate prompts first, then harden provenance on the decisive subset. ✓
3. **Cohere Rerank Pro cash** — **deferred**; revisit only at that query volume. Not a current concern. ✓

## 11. Out of scope (this phase)

M4 trade-intelligence (duty rates, `unit` backfill), M5 frontend/PDF/CI (TanStack-class stack is an M5 decision), Phase-5 data carryforwards (ARCHITECTURE §12).

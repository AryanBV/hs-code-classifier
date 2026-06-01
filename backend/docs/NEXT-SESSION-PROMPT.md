> ⛔ SUPERSEDED (2026-06-01) — DO NOT USE; describes PRE-Phase-B state. Current continuation prompt: `C:\Users\ASUS\.claude\plans\CONTINUATION-PROMPT-2026-06-01.md` (authoritative roadmap `ROADMAP-2026-06-01.md`). Now: Phase A DONE + Phase B Steps 0-2 committed (HEAD `d373e6b`, 1045 tests) + 12 frontend decisions LOCKED; next = START THE FRONTEND BUILD. Vertex DISABLED; runtime = free-tier Gemini Developer API; correctness > speed.

# NEXT-SESSION-PROMPT — ITC-HS v2 Classifier (copy-paste into a fresh session)

Paste everything below into a new Claude Code session at `C:\Export Business\hs-code-classifier`.

---

## A. READ-FIRST (do this before touching anything)

Read these, in order, and do NOT act until you have:

1. `backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md` — the **START HERE block** at the very top (definitive, self-contained entry point).
2. `CLAUDE.md` — the **Current Status** section.
3. `C:\Users\ASUS\.claude\projects\C--Export-Business-hs-code-classifier\memory\MEMORY.md` — the auto-memory index (read the linked feedback files for any rule you are about to rely on).
4. `git --no-pager log --oneline -15`
5. `git status`

Then, **before your first action, state out loud**: the current numbers (OUTRIGHT 8-digit, top-3, confident-wrong, chapter, heading), the branch/HEAD, and the single next action you are about to take. Do not start work until you have stated this.

---

## B. STATE (as of 2026-05-30)

- **v2 brain:** ~77% OUTRIGHT 8-digit (r18 77.3% / 265/343; r19 76.5% within LLM-noise floor) · **top-3 ~86%** (top_3_code_accuracy = 85.9% @ r19) · **confident-wrong ~64** · **chapter ~89%** · **heading ~86%**.
- **Runtime = free-tier Gemini Developer API** (Vertex disabled 2026-06-01; same models — gemini-embedding-001@1536 + Gemini-Flash rerank + Gemini-Flash L1/L4). **Cohere decommissioned — never reintroduce it.**
- **Branch:** `feat/phase-4-pipeline-build`. **855 tests pass**, `tsc --noEmit` clean, git tree clean.
- **Ship foundation committed + live-validated:** `backend/src/api/v2-api-adapter.ts` (`mapV2Result`: CLASSIFY/ASK/REFUSE → flat DTO, confidence 0–100, leaf-desc + top-3 alternatives hydration, system_error/timeout → 503) and the `USE_V2_CLASSIFIER` feature flag in `src/api/classify.ts` — **DEFAULT OFF** (legacy byte-identical, instant rollback). HTTP smoke passed (hex bolts → 7318.15.00 correct; "steel" → ASK with 6 options).
- Suite = **385 cases**; scoring denom = **343** gold-code cases (341 in r19 after 3 infra-timeout exclusions).

---

## C. CHOSEN PATH — SHIP, LATENCY-FIRST

> SUPERSEDED — cost-efficiency (Phase A) first; correctness > speed; see ROADMAP-2026-06-01.md.

1. **BUILD the adaptive repair-loop latency fix** — profile is **DONE** (do NOT re-profile; see resume doc 'LATENCY PROFILE — DONE'). Evidence: 43% of cases exhaust all 3 repairs and 140/141 still fail the verifier (wasted ~30-48s); 0-repair 19.9s vs 3-repair 49.3s; each repair ~13-18s L4 call. FIX: default-cap repairs at 1 + bail to escalation on no-progress (same failing code / same failed-rule signature); confirm repair0-vs-later recovery split from r19 escalation_path to pick cap=1 vs 2; loop control at backend/src/classifier-v2/index.ts (the for i<3 loop + onVerifierExhausted); THREE-SIDED GATE: p95 latency DOWN AND OUTRIGHT 8-digit + confident-wrong NOT regressed (orchestrator runs the eval).
2. **Stream the HTTP response** (perceived-UX, zero accuracy risk).
3. **Cutover** `USE_V2` on staged.
4. **Frontend rebuild.**
5. **Publish.**

**DEFERRED (real-usage-driven, do NOT pre-optimize):**
- synonym / heading recall (TC012 silicone hose → 8708 vs 4009; EC008 galvanized → 7210 vs 7208/9).
- DB053 notes_claims definition-note fix (id 20/21 EXISTS-on-definition → SKIP; **broad textile blast radius — gate carefully**).
- confidence calibration (needs a NEW signal — rerank-margin / entropy).
- fine-tuned domain reranker (the real ceiling-raiser).

**USER-GATED gold-review queue (NOT applied):** DB061 (Ensembles unwinnable) · S5-AMB-005 (car-seat-cover .20 vs .90) · DB200 (malformed query + L0 truncation).

---

## D. OPERATING RULES (verbatim — follow exactly)

- **PURE ORCHESTRATOR.** Decide + dispatch. Delegate ALL bulk reading / analysis / implementation / eval to subagents via dynamic Workflows. Consume only their structured returns. Keep your OWN context lean. Run as many parallel agents as the work warrants — **no artificial cap**.
- **QUALITY MUST INCREASE, not drop, when delegating.** Every implementation gets independent review. Verify delegated work yourself before locking: re-run `tsc` + tests, spot-check the diff, and run an adversarial review. Delegation must raise quality, not trade it for speed.
- **ROOT-CAUSE fixes ONLY.** Fix at the right layer (prompt / retrieval / verifier / data / orchestrator). No band-aids, no per-case hacks, no eval-overfit. A green eval via hacks = a false pass.
- **ONE change per measured THREE-SIDED gate:** target metric UP (via McNemar paired test) **AND** confident-wrong flat/down + regression-guard clean **AND** latency/cost ok. Iterate on a `--ids` subset; run the full suite only at milestones. Do NOT get stuck in eval loops.
- **The ORCHESTRATOR runs long (~30-min) evals as its OWN background Bash** (it gets re-invoked on completion). Subagents background-and-die, so delegate to them only **no-long-eval** work.
- **GOLD / EVAL changes are USER-GATED** (blind-law-verify + explicit approval). Never launder gold toward the model.
- **Never weaken the L4/L5 verifier rules.**
- **Commit at every kept gate.**
- **Runtime = free-tier Gemini Developer API** (Vertex disabled); never reintroduce Cohere; NO paid calls without explicit cost-aware user OK.
- **Use the full power of Claude Code + Opus 4.8** (1M context, parallel workflows, background tasks, MCPs) = ultracode. **Ultrathink before locking decisions.**
- **Ask the user only for genuine forks** (gold changes, ship cutover go/no-go, scope/strategy at milestones). Otherwise proceed on your best recommendation.

---

## E. END GOAL

Best brain (~77% top-1 + ~86% top-3 + calibrated ASK + near-zero confident-wrong + GIR/notes citations) → **API rewire** (foundation done) → **frontend rebuild** → **publish + trade-intelligence**.

---

## KEY COMMANDS

- eval: `npx tsx --require dotenv/config src/eval/runner.ts --suite master --simulate-answers --run-id X` (subset: add `--ids c1,c2`)
- compare: `npx tsx src/eval/compare.ts before.json after.json`
- tests: `npx vitest run src/classifier-v2 src/eval`
- tsc: `npx tsc --noEmit`

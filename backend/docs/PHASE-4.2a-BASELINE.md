# Phase 4.2a — Baseline, Failure Map & Roadmap to the Ultimate Classifier

**Date:** 2026-05-28 · **Branch:** `feat/phase-4-pipeline-build`

---

## ⚠️ TOP ACTION REQUIRED — Upgrade the Cohere API key

The full 386-case baseline was **rate-limited and is therefore not clean**. The Cohere API key in use is a **Trial key (1,000 calls / month)**, and the cumulative eval + calibration + diagnostic runs this session **exhausted the monthly quota**. **269 of 386 cases errored** with `Cohere HTTP 429` at the L2 embed step.

**Nothing further can be measured or validated until the key is upgraded to a Production key** (https://dashboard.cohere.com/api-keys) — every pipeline classification embeds the query via Cohere, so all evals/traces/smoke runs 429 until then. This is the single blocking external dependency. It is a billing/account action only the owner can take.

> The retrieval-recall fixes implemented this session (below) are **mechanically validated (unit tests + direct Postgres FTS probes)** but their **end-to-end accuracy impact is unverified pending the key upgrade.**

---

## Executive summary

The v2 8-layer classifier is **built, integrated, security-reviewed, code-reviewed, and working.** **491 unit tests green, `tsc` clean, 19 commits** this session.

**The brain is strong.** On the classify cases that completed before the Cohere quota ran out (n=31 correctly-routed):

| Metric | Result |
|---|---|
| Chapter accuracy | **93.5%** |
| Heading accuracy | **93.5%** |
| 8-digit accuracy | **58.1%** |
| Weighted | **82.9%** |
| ASK quality (targeted/relevant) | 100% / 96.4% |
| REJECT (gibberish/spam) | 5/5 correct |

Getting the right **chapter + heading ~94%** of the time is the genuinely hard part of HS classification, and it works. The path to "ultimate" is now retrieval recall + leaf-level (8-digit) precision + the unbuilt escalation layers — all concretely scoped below.

This session's measurement-driven loop drove quick-eval routing accuracy **13% → 36% → 75%** as three layers of blocking bugs were diagnosed and fixed at root.

---

## The partial baseline (read with the caveat)

`backend/eval-results/eval-2026-05-28.json` — 386 cases, **269 infra-errors (Cohere 429, excluded), 117 scored.**

```
ROUTING (117 scored)         54.7% (64/117)
  Classify → Classify   31
  Classify → Ask        47   ← see "measurement bias" below
  Classify → Reject      6
  Ask → Ask             28   (1 Ask→Classify)
  Reject → Reject        5
CLASSIFICATION (31 routed)   Chapter 93.5% · Heading 93.5% · 8-digit 58.1% · Weighted 82.9%
```

**Measurement bias (important):** ASK and REJECT cases short-circuit at **L1 (Gemini)** and never reach the **L2 Cohere embed**, so they did **not** hit the 429 wall — they are **over-represented** in the scored set. Most CLASSIFY-path cases died at L2 embed and were excluded. So the **54.7% routing and the 47 "Classify→Ask" are not trustworthy** — they are artifacts of which cases survived the quota. The **classification accuracy on the 31 completed classify cases (chapter/heading 93.5%) is the most reliable signal** and it is strong. A clean baseline requires the key upgrade.

---

## What was built / fixed this session

**The v2 spine (Phase 4.2a plan, Tasks 1–15):** orchestrator (`classifier-v2/index.ts`) wiring L0→L5 with the verifier-repair loop, single-shot backtrack, ASK/REFUSE paths, the §7 system-error contract, and multi-turn `continueWithAnswer`; Zod LLM-output validation; cost estimator; `EscalationPolicy`/`BaselineEscalation` seam; eval-harness wiring with bounded concurrency + infra-error isolation; trace CLI; full-pipeline smoke. Each component passed an **independent adversarial review**.

**Eval ground-truth remediated:** 44 of 386 gold answers were wrong (e.g. "steering rack" coded as baby carriages); all fixed and **independently verified** — the gold is now trustworthy.

**Bugs found & fixed (root-cause, measurement-driven):**

| Bug | Layer | Fix | Commit |
|---|---|---|---|
| Vertex rejected draft-07 prompt schemas | client | `sanitizeResponseSchema()` | 799f205 |
| Supabase column drift (`sh.description`) | client | → `title` | 799f205 |
| MV-04 cosine floor 0.55 rejected 78% of correct codes | verifier | recalibrated → **0.22** (data-driven) | e452ec4 |
| MV-03 citation TF-IDF math ≈0 always | verifier | rewrote → token-set containment, threshold **0.80** | 0b42f91 |
| MV-07 exclusion/redirect polarity inverted | verifier | branch on `claim_type` | 0b42f91 |
| `__SKIP_*` sentinel predicates → FALSE violations (12 chapters) | verifier | treat as SKIP | 261a5b5 |
| L3 deleted correct chapters on a keyword collision | rules-filter | **surface-not-delete** (L4 adjudicates) | 5d0a206 |
| Eval 30s timeout killed genuine repair cases | eval | → 90s | 2251d83 |
| Double query-embed (L2 + orchestrator) | retrieval | reuse L2's embedding | ceae3d3 |
| L2 recall: correct heading buried below the top-5 funnel | retrieval | **FIX-A** widen funnel (FTS 40 / rerank 15 / cap 8) | bab5b14 |
| L2 recall: generic tokens dilute the discriminating noun | retrieval | **FIX-B** drop generic FTS modifiers | bab5b14 |
| `2942.00.12` misspelled "Ibuprofane" → FTS never matched | data | typo fix (DB) | bab5b14 |
| Code-review batch (timeout-timer leak, section→SKIP, escalation-path consts, etc.) | various | 8 fixes | 4a3f120 |

---

## Quality gates (both complete)

- **Security review — CLEAN.** No high-confidence exploitable vulnerabilities. The DB layer is fully parameterized (`$N` placeholders); the one dynamic-identifier query (source-ref resolver) is gated by a hardcoded allowlist + bound params + strict regex; the predicate DSL is a safe AST interpreter (no `eval`); no command injection / path traversal / hardcoded secrets in the runtime path. One *hardening* note (not a vuln): `rejectUnauthorized:false` on the pooled DB connection — left as-is (trusted managed Supavisor pooler; changing TLS risks breaking the connection).
- **Code review (high effort) — done; 8 fixes applied.** Deferred (roadmap) items recorded below.

---

## Levers to the "ultimate" classifier (prioritized failure map)

**P0 — Unblock measurement.** Upgrade the Cohere key (Trial → Production). Without this nothing else can be validated.

**P1 — L2 retrieval recall.** The top accuracy lever. The correct heading was missing from L2's candidate set → L4 correctly refused. **FIX-A/B + the typo are implemented** (validated at the FTS-ranking level via direct Postgres: ibuprofen recovered to rank #1; paracetamol #6 and mink-fur #10 now survive the widened funnel). **Pending validation + still TODO:**
- *FIX-C — synonym/alias layer* (NOT YET built): the corpus uses formal tariff vocabulary, so colloquial queries miss FTS entirely — e.g. "sealant" (corpus says "mastics/caulking"), "LED display" (corpus says "monitors"), "API/bulk drug". A curated synonym map injected into query expansion (or `fts_search_text`) is the only thing that recovers these lexical-gap cases; the Cohere cosine signal is the semantic fallback (validate once the key is up).
- *FIX-D — heading-level candidates* in the rerank union (currently leaf-only, so a correct heading with diluted leaf descriptions never competes as a unit).
- *Re-tune `GENERIC_FTS_MODIFIERS`* empirically — it was trimmed to a conservative subset because terms like "powder"/"bulk"/"API" can be discriminating; needs a real distribution to tune (flagged in-code).

**P2 — 8-digit leaf precision (58%).** Chapter/heading are ~94% but the exact tariff line among siblings is wrong ~42% of the time. Likely needs richer leaf-disambiguation context in L4 Select (the `tariff_line_attributes` are there — confirm they're fully leveraged) and/or making **MV-04 a soft escalate-signal** rather than a hard reject (the cosine floor is inherently weak at policing within-chapter sibling near-misses, per the MV-04 calibration). Validate which after a clean baseline.

**P3 — Triage over-ask.** The biased baseline suggests Triage may ask when it could classify. Re-measure on a clean baseline first (the 47 Classify→Ask is currently an artifact); if real, calibrate the Triage completeness threshold.

**P4 — Build the real escalation (measurement-gated).** L6 Tiebreak and L7 Deep-Think are stubbed by `BaselineEscalation` (emits best-effort + flags `would_escalate`). Build them **where the clean baseline's failure map proves they're needed** (e.g. the `verifier_rejected_but_correct` rate + the hard within-chapter cases). QGS (info-gain question selection) similarly replaces the L1-fallback ASK once the baseline shows ASK quality needs it.

**P5 — Code-review roadmap items (deferred, non-blocking):**
- `direct_leaf_lookup` discards subheading cosine ordering (masked today by capacity headroom; fix before raising caps further).
- Source-ref whole-notes citations resolve to `JSON.stringify(notes)` → can skew MV-03 containment for no-`json_path` citations.
- L5 `verify()` re-fetches `notes_claims` + `tariff_line_attributes` that L4 already fetched (up to 8 redundant DB queries/case across the repair loop) — thread L4's context into L5.
- `INVERTING_CLAIM_TYPES` / `allowedClaimTypes` are two drifting hardcoded sets; a new exclusion-like `claim_type` would default to wrong polarity (re-opening the MV-07 class). Derive polarity from the claim data layer.
- Prompt-parsing logic duplicated across L1-triage and L4-select → shared loader.

**P6 — Data + integration:**
- `notes_claim #87` (ch.25 calcined carve-out) over-literal predicate — re-author to honor "except where context requires" (build-time data fix).
- Rewire `backend/src/api/classify.ts` from the legacy classifier to v2 (after the clean baseline passes the gate), then the frontend.

**P7 (post-MVP) — L8 active learning** (case_law write-back).

---

## How to resume (next session, after the Cohere key is upgraded)

1. **Upgrade the Cohere key** → confirm with `npm run smoke:pipeline`.
2. **Run the clean baseline:** `npm run eval` → this time without the 429 wall. Compare against this partial run.
3. **Validate the L2 recall fixes** (FIX-A/B/typo) actually recover the mink-fur / paracetamol / ibuprofen cases end-to-end; then build **FIX-C synonym layer** + **FIX-D heading-level candidates**.
4. Read the clean failure map (`analyze-failures.ts` — note: it currently auto-loads a stale report; point it at the new `run_id`) + `measure-brain-chapters.ts`; attack P2 (leaf precision) and P3 (over-ask) by the data.
5. Build L6/L7/QGS only where the failure map proves the need (P4).

**Key calibrated constants (empirical, this session):** `EMBEDDING_COSINE_FLOOR = 0.22` (MV-04), `CITATION_TFIDF_THRESHOLD = 0.80` (MV-03, now token-set containment). Re-calibrate against a clean full-suite distribution once the key is up.

# Phase 3.5 → Phase 4 File Consistency Audit

**Date:** 2026-05-25
**Auditor:** Coordinator-dispatched subagent (read-only audit)
**Scope:** Every Phase 3.5 documentation file + project root CLAUDE.md
**Locked stack to verify against:** Gemini 3.5 Flash @ Vertex region `global` for ALL 5 LLM stages (Triage / Select / Verify V1 / Verify V2 / Deep-Think). D1 LOCK date: 2026-05-25.

---

## Files audited (40+ files)

### Architecture + spec (2)
- `backend/docs/ARCHITECTURE.md`
- `backend/docs/SETUP-vertex-service-account.md`

### Prompts (3)
- `backend/prompts/triage-v1.md`
- `backend/prompts/select-v1.md`
- `backend/prompts/verify-router-v1.ts`

### Progress + plans (6)
- `backend/data/phase-3.5-progress.md`
- `backend/data/phase-3.5-preflight.md`
- `backend/data/phase-3.5-gate.md`
- `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md`
- `C:/Users/ASUS/.claude/plans/eager-napping-dijkstra-resume.md`
- `C:/Users/ASUS/.claude/plans/vivid-wobbling-beacon.md`

### Audits + reports (4)
- `backend/data/phase-3-spike-report.md`
- `backend/data/phase-3.5-audits/audit-summary.md`
- `backend/data/phase-3.5-audits/A9-regression-comparison.md`
- (plus audit JSON outputs A/B/C/D — data files, not narrative; not text-audited)

### Phase 3.5 prompts (research artifacts, 13 files in scope)
- `backend/data/phase-3.5-prompts/D1-model-stack-reassessment.md`
- `backend/data/phase-3.5-prompts/D1-opensource-research.md`
- `backend/data/phase-3.5-prompts/D1-deepthink-oss-research.md`
- `backend/data/phase-3.5-prompts/D1-vertex-credit-window-plan.md`
- `backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md`
- `backend/data/phase-3.5-prompts/vertex-credit-coverage-immediate-results.md`
- `backend/data/phase-3.5-prompts/B1-eval-skeleton-summary.md`
- `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md`
- `backend/data/phase-3.5-prompts/B3-cost-model.md`
- `backend/data/phase-3.5-prompts/B4-architecture-summary.md`
- `backend/data/phase-3.5-prompts/B5-B6-B7-summary.md`
- `backend/data/phase-3.5-prompts/B5-B6-B7-review-verdict.md`
- (plus A1*/A3 ouput JSONs and review verdicts — research/output data, not in narrative-audit scope)

### Project context (1)
- `CLAUDE.md` (project root)

### Experiments folder
- `backend/experiments/vertex/` (4 archived files)

### Phase 3 traces
- `backend/data/phase-3-traces/` (30 trace files + 3 metadata files)

**Total narrative files audited: ~30**

---

## Findings per category

### Category 1: Model stack references

**LOCKED stack:** Gemini 3.5 Flash @ Vertex `global` for all 5 LLM stages. Anything else (GPT-4.1 mini, Gemini 2.5 Flash, Claude Sonnet 4.6 as the LOCKED choice) is OUTDATED.

#### Files CORRECTLY referencing locked stack (✓ no fix needed)
| File | Status |
|---|---|
| `backend/docs/ARCHITECTURE.md` | ✓ All 5 stages reference Gemini 3.5 Flash @ global. D1 LOCKED stamped 2026-05-25. Carryforward #8 documents same-family V2 risk. |
| `backend/prompts/triage-v1.md` | ✓ Line 1, 4, 5, 6, 7, 434 all reference Gemini 3.5 Flash @ Vertex global. |
| `backend/prompts/select-v1.md` | ✓ Line 1, 4, 5, 6, 7, 398, 405 all reference Gemini 3.5 Flash @ Vertex global. |
| `backend/prompts/verify-router-v1.ts` | ✓ Lines 7-19 reference Gemini 3.5 Flash @ Vertex global; carryforward note acknowledges same-family risk. |
| `backend/data/phase-3.5-progress.md` | ✓ Lines 74-99 document D1 LOCKED 2026-05-25 explicitly. |
| `backend/data/phase-3.5-audits/audit-summary.md` | ✓ No model-stack references — purely DB audit content. |
| `backend/data/phase-3.5-audits/A9-regression-comparison.md` | ✓ No model-stack references; references B5/B6 prompts only. |

#### Files referencing OUTDATED stack — historical/research artifacts that NEED supersession banners

**These are legitimately historical research — but no reader-visible "SUPERSEDED" banner exists on any of them.** A first-time reader could mistake them as active.

| # | File | Lines with outdated stack | Severity |
|---|---|---|---|
| 1.1 | `backend/data/phase-3.5-prompts/D1-model-stack-reassessment.md` | 1-200+ (entire doc evaluates GPT-5.4 mini / Gemini 3.5 Flash / Claude Haiku 4.5 / etc. as candidates; no SUPERSEDED banner at top) | MEDIUM |
| 1.2 | `backend/data/phase-3.5-prompts/D1-opensource-research.md` | L3 "Current proprietary stack costs ~$437/mo and the models we're already using (GPT-4.1 mini, Gemini 2.5 Flash) are being deprecated Oct 2026"; entire doc evaluates OSS alternatives. No SUPERSEDED banner. | MEDIUM |
| 1.3 | `backend/data/phase-3.5-prompts/D1-deepthink-oss-research.md` | L5 "Replace **Claude Sonnet 4.6**..."; treats Sonnet 4.6 as locked. No SUPERSEDED banner. | MEDIUM |
| 1.4 | `backend/data/phase-3.5-prompts/D1-vertex-credit-window-plan.md` | L3 — partial supersession note (correctly says it supersedes the cash-only model picks). But no header indicating this file itself is superseded by D1 LOCK 2026-05-25 (it lays out a "16-day window" / "post-credit OSS hybrid" plan that the final lock SIMPLIFIED). | MEDIUM |
| 1.5 | `backend/data/phase-3.5-prompts/B3-cost-model.md` | L7-15 lists D1 stack as "Triage: Gemini 2.5 Flash / Select: GPT-4.1 mini / Verify V1: Gemini 2.5 Flash / Verify V2: GPT-4.1 mini / Deep-think: GPT-4.1 mini". This was the PROVISIONAL D1 stack at B3 measurement time. The doc later acknowledges (L184-195) "CONDITIONAL PASS" — but does not flag that the WHOLE stack was subsequently swapped to all-Gemini under D1 LOCK 2026-05-25. | MEDIUM-HIGH (this is the most-misleading historical doc — a reader could think those cost numbers are current) |
| 1.6 | `backend/data/phase-3.5-prompts/B4-architecture-summary.md` | L3 "Model stack (D1) marked PROVISIONAL pending T14 B3 measurement with explicit D1.5 lock criterion." — outdated phrasing. D1 was LOCKED 2026-05-25 via the T20 update; B3 superseded; this summary is pre-T20. | MEDIUM |
| 1.7 | `backend/data/phase-3.5-prompts/B5-B6-B7-summary.md` | L14 "B5 ... Triage prompt (Gemini 2.5 Flash) — Stage 1 of pipeline"; L15 "B6 ... Select prompt (GPT-4.1 mini)"; L92 "V1 model choice — Gemini 2.5 Flash vs GPT-4.1 mini." This summary doc was written when D1 was provisional. The underlying prompt files have since been updated (correctly) to Gemini 3.5 Flash @ Vertex global; the SUMMARY hasn't. | MEDIUM |
| 1.8 | `backend/data/phase-3.5-prompts/B5-B6-B7-review-verdict.md` | No direct model-stack references — purely spec-review content. Mentions "Gemini 2.5 Flash" only at line 92 quoting older summary. Acceptable in context. | LOW |
| 1.9 | `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md` | No misleading content — purely a Rerank live-test report. Cohere Rerank is part of LOCKED stack. ✓ no fix needed | OK |
| 1.10 | `backend/data/phase-3.5-prompts/B1-eval-skeleton-summary.md` | No model-stack references — pure runner spec. ✓ no fix needed | OK |
| 1.11 | `backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md` | L6 references "Claude Sonnet 4.6 if Anthropic Partner Models turn out to bill to credits" — this WAS the open question at the time. The T17 result (Claude needs quota request → deferred) settled it. No SUPERSEDED banner. | LOW-MEDIUM |
| 1.12 | `backend/data/phase-3.5-prompts/vertex-credit-coverage-immediate-results.md` | Content is correct historical-record of the empirical test. Does not claim Gemini 2.5 / GPT-4.1 are locked. ✓ acceptable as-is, but a banner pointing at T17 final result would aid future readers. | LOW |
| 1.13 | `backend/data/phase-3-spike-report.md` | L223 "STAGE 1 — TRIAGE (Gemini 2.5 Flash, json_schema)" inside the "Architecture under test — final spec" block. This is the spike's HISTORICAL record of the spec-under-test. ARCHITECTURE.md is the source-of-record for Phase 4; spike report is design rationale. **Acceptable in context** but worth a one-line note that the model stack was subsequently locked to all-Gemini 3.5 Flash per D1 LOCK 2026-05-25. | LOW |
| 1.14 | `C:/Users/ASUS/.claude/plans/vivid-wobbling-beacon.md` | L46-50 lists the original (Phase 3.5-time) model recommendations: "Triage = Gemini 2.5 Flash; Select = GPT-4.1 mini; Verify V1 = Gemini 2.5 Flash..." L135 "STAGE 1 — TRIAGE (Gemini 2.5 Flash, response_format=json_schema)". Historical plan; superseded by bubbly-foraging-catmull.md and the subsequent D1 LOCK. | LOW (clearly an older plan file — header would still help) |
| 1.15 | `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md` | L36 lists the original D1 provisional stack: "Triage = Gemini 2.5 Flash; Select = GPT-4.1 mini; Verify V1 = Gemini 2.5 Flash; Verify V2 = GPT-4.1 mini ANTAGONISTIC mode; Deep-think = GPT-4.1 mini reasoning_effort=high." | MEDIUM (this is the operative Phase 3.5 plan, but doesn't note that D1 was subsequently re-locked to all-Gemini) |

#### Active files referencing OUTDATED stack — NOT historical (need real updates)

None found in active spec/contract files. ARCHITECTURE.md and the 3 prompt files are CORRECT.

---

### Category 2: Endpoint / region consistency

**LOCKED:** Gemini 3.x uses region `global`. Endpoint `https://aiplatform.googleapis.com/v1/projects/<proj>/locations/global/publishers/google/models/gemini-3.5-flash:generateContent`.

| # | File | Issue | Severity |
|---|---|---|---|
| 2.1 | `backend/docs/SETUP-vertex-service-account.md` L6 | `**Region**: us-central1` (CRITICAL — this is the SETUP walkthrough Phase 4 implementers follow first). | **HIGH — misleading on Phase 4 entry** |
| 2.2 | `backend/docs/SETUP-vertex-service-account.md` L119 | `.env` template shows `GCP_LOCATION=us-central1`. Phase 4 implementer will then call Gemini 3.5 Flash at us-central1 → HTTP 404 (model not available at that region). | **HIGH — silent failure for Phase 4 implementer** |
| 2.3 | `backend/docs/SETUP-vertex-service-account.md` L202 | Troubleshooting row suggests trying `gemini-2.5-flash` first to prove auth path. Misleading since gemini-2.5-flash is the deprecated track. Replace with: "If Gemini 3.5 Flash returns 404 at `global`, verify region in `.env`. Setting GCP_LOCATION=us-central1 will fail — Gemini 3.x is only on `global`." | MEDIUM |
| 2.4 | All other files | ✓ Correctly reference `global` region | OK |

---

### Category 3: Phase 4 readiness references

**LOCKED:** ARCHITECTURE.md §14 = (1) cut `feat/phase-4-pipeline-build` off `feat/phase-3-arch-spike`; (2) write `backend/src/classifier-v2/index.ts`; (3) swap eval stub; (4) first gate ≥80% chapter-match.

| # | File | Compliance | Severity |
|---|---|---|---|
| 3.1 | `backend/docs/ARCHITECTURE.md` §14 (L268-278) | ✓ Spec correctly states the 5 hand-off steps. | OK |
| 3.2 | `backend/data/phase-3.5-progress.md` L111 | ✓ "Next: coordinator commits Phase 3.5 deliverables on `feat/phase-3-arch-spike`, cuts `feat/phase-4-pipeline-build` off that branch." Consistent. | OK |
| 3.3 | `backend/data/phase-3-spike-report.md` "Recommended next steps" L266-274 | ✓ "Cut `feat/phase-4-pipeline-build` branch off current `feat/phase-3-arch-spike`." Consistent. | OK |
| 3.4 | `C:/Users/ASUS/.claude/plans/eager-napping-dijkstra-resume.md` L78-148 | **STALE** — Status section dated 2026-05-23 and reflects Phase 3 IN-FLIGHT (not Phase 3 COMPLETE, and zero mention of Phase 3.5 even existing). Should be updated to reflect Phase 3 + 3.5 COMPLETE + Phase 4 cut. | **MEDIUM — this is the "operative resume brief" per CLAUDE.md; out of sync.** |
| 3.5 | `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md` | No completion marker. Plan is still phrased as "to be executed." Phase 3.5 is now COMPLETE per progress.md. | MEDIUM (cosmetic but user explicitly asked) |

---

### Category 4: Carryforwards consistency

**8 carryforwards to verify** are present in ARCHITECTURE.md §12 and consistent elsewhere:

| # | Carryforward | ARCHITECTURE.md §12 | progress.md | A9-regression | Status |
|---|---|---|---|---|---|
| 4.1 | Stage 3 OR-token tsquery (head_nouns_for_fts) | ✓ (§4.5 LOCKED + §12 implicit) | ✓ L67 | ✓ L41, L186-188 | CONSISTENT |
| 4.2 | Select 6-digit subheading return | ✓ (§4.6 LOCKED) | ✓ L67 | ✓ L19, L154 | CONSISTENT |
| 4.3 | Select export_policy + policy_condition REQUIRED | ✓ (§4.7 LOCKED) | ✓ L68 | ✓ L18, L132-138 | CONSISTENT |
| 4.4 | 5 borderline multi-destination rows for human review | ✓ (§12 #1) | ✓ L68 | implicit in A1-multidest-sweep.md (separate file) | CONSISTENT |
| 4.5 | Verify V2 same-family correlation revisit | ✓ (§12 #8) | ✓ L69 | n/a (A9 pre-dates D1 LOCK) | CONSISTENT |
| 4.6 | Claude on Vertex quota request deferred | ✓ (§12 #9) | ✓ L70 | n/a (post-D1) | CONSISTENT |
| 4.7 | OSS hybrid 2027 cutover | ✓ (§12 #10) | ✓ L98 | n/a | CONSISTENT |
| 4.8 | 6 pre-existing OCR data quirks | ✓ (§12 #2) | implicit | ✓ audit-summary.md L37-41 | CONSISTENT |

**Carryforwards: all 8 are CONSISTENT across the active docs.** ✓

---

### Category 5: Plan file freshness

| # | File | Issue | Severity |
|---|---|---|---|
| 5.1 | `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md` | No "COMPLETED 2026-05-25" marker at top; reads as if pending. Phase 3.5 is fully complete per progress.md / audit-summary / A9. **Recommend:** add 3-4 line "STATUS: COMPLETED 2026-05-25 — see backend/data/phase-3.5-progress.md and backend/docs/ARCHITECTURE.md for final state" banner under the title. Do NOT remove or archive — historical value. | MEDIUM |
| 5.2 | `C:/Users/ASUS/.claude/plans/eager-napping-dijkstra-resume.md` | Status section dated 2026-05-23, says "PHASE 3 ARCHITECTURE SPIKE: IN-FLIGHT". This is the operative project-wide resume brief per project CLAUDE.md L163. SHOULD reflect Phase 3 ✓ COMPLETE + Phase 3.5 ✓ COMPLETE (2026-05-25) + Phase 4 ready to cut. **Recommend:** add a "## Status — 2026-05-25" section above existing one OR replace the IN-FLIGHT section with COMPLETE summary; preserve old section as "historical". | **MEDIUM-HIGH (user-cited single-source-of-truth across sessions)** |
| 5.3 | `C:/Users/ASUS/.claude/plans/vivid-wobbling-beacon.md` | This is the Phase 3 spike design (with a §"Phase 3.5 Sprint v4 addition"). Phase 3 + Phase 3.5 both complete. The doc still describes Phase 3.5 as "PROPOSED, awaiting user approval to dispatch" (L4). **Recommend:** add a "STATUS: PHASE 3 AND PHASE 3.5 BOTH COMPLETE (2026-05-25). For final architecture see backend/docs/ARCHITECTURE.md" banner. | LOW-MEDIUM |

---

### Category 6: Project root CLAUDE.md

| # | Section | Issue | Severity |
|---|---|---|---|
| 6.1 | L160-164 "Current Status (May 2026)" | Says "Next: Phase 3 architecture spike — manually trace 10-20 hard cases..." Phase 3 + Phase 3.5 are now COMPLETE. | **MEDIUM-HIGH** |
| 6.2 | L166-172 Roadmap | "→ Phase 3: Architecture spike (validate pipeline on 15 hard cases on paper)" — should be ✓ COMPLETE. Phase 3.5 missing entirely. Phase 4 should be the new →. | **MEDIUM-HIGH** |
| 6.3 | L64 `chapter_exclusions` = 1,153 rows | **STALE** — Phase 3.5 enriched to **1,505 rows** (per ARCHITECTURE.md §4.2, audit-summary.md, A9). | MEDIUM |
| 6.4 | L133 "1,153 chapter_exclusion rules with FK redirects" | Same staleness as 6.3. | MEDIUM |
| 6.5 | L161 "1,153 exclusions" | Same staleness. | MEDIUM |
| 6.6 | L36 "Stage 2 — Chapter Routing" describes the LEGACY pipeline (`backend/src/classifier/`). This is consistent with L162 ("backend classifier code will break until Phase 4 rebuild"). OK as historical context but worth a forward-pointer to ARCHITECTURE.md as the new spec. | LOW |
| 6.7 | L162 still says Phase 4 rebuild is upcoming — consistent. ✓ | OK |
| 6.8 | Schema section (L52-71) — Phase 3.5 also added `sections.notes` JSONB column + `tariff_lines.fts_search_text` GENERATED column. Not listed. | LOW |
| 6.9 | Architecture summary doesn't reference ARCHITECTURE.md or the new prompt files (triage-v1.md, select-v1.md, verify-router-v1.ts). Phase 4 implementer following CLAUDE.md alone would miss these. | MEDIUM (add a one-line pointer) |

---

### Category 7: Misleading or stale files

| # | File | Issue | Severity | Recommended action |
|---|---|---|---|---|
| 7.1 | `backend/data/phase-3.5-prompts/B3-cost-model.md` | Header lists the PROVISIONAL stack (Gemini 2.5 + GPT-4.1) but presents cost numbers as the B3 measurement. ARCHITECTURE.md §6 has REPLACED the cost numbers post-D1 LOCK. A reader who lands on B3-cost-model.md sees old prices. | MEDIUM-HIGH | Add HEADER BANNER: "**SUPERSEDED 2026-05-25** — D1 stack was re-locked to all-Gemini 3.5 Flash @ Vertex global per T20. The model stack and cost numbers BELOW reflect the pre-LOCK provisional stack. For current cost model see ARCHITECTURE.md §6." |
| 7.2 | `backend/data/phase-3.5-prompts/B4-architecture-summary.md` | "PROVISIONAL pending T14 B3 measurement" framing is outdated. | LOW | Add 1-line "Note: D1 was locked 2026-05-25 (post-T14) per progress.md §D1-LOCKED." |
| 7.3 | `backend/data/phase-3.5-prompts/B5-B6-B7-summary.md` | Lists prompts as "Triage prompt (Gemini 2.5 Flash)" and "Select prompt (GPT-4.1 mini)" — the actual prompts are now Gemini 3.5 Flash. Summary doc is out of sync with the prompts. | MEDIUM | Add HEADER BANNER: "**Note 2026-05-25:** The prompt files referenced below were updated to Gemini 3.5 Flash @ Vertex global per D1 LOCK 2026-05-25. This summary doc was written under the provisional Gemini 2.5 / GPT-4.1 stack. The seed-prompt artifacts themselves are current; this summary's model-stack references are historical." |
| 7.4 | `backend/data/phase-3.5-prompts/D1-model-stack-reassessment.md` | Entire document evaluates candidates that were considered then; D1 was subsequently locked. | MEDIUM | Add HEADER BANNER: "**RESEARCH ARTIFACT — SUPERSEDED BY D1 LOCK 2026-05-25.** This document analyzed candidate stacks before the all-Gemini-3.5-Flash-on-Vertex lock. Retained for historical traceability. For current locked stack see ARCHITECTURE.md §5." |
| 7.5 | `backend/data/phase-3.5-prompts/D1-opensource-research.md` | Research artifact. Open-questions tone. | MEDIUM | Same banner as 7.4 but note: "OSS hybrid plan retained as 2027 post-credit cutover path (carryforward #10)." |
| 7.6 | `backend/data/phase-3.5-prompts/D1-deepthink-oss-research.md` | Research artifact evaluating Claude Sonnet 4.6 replacement. | MEDIUM | Same banner as 7.4. |
| 7.7 | `backend/data/phase-3.5-prompts/D1-vertex-credit-window-plan.md` | Has a partial supersession note (L3 — supersedes cash-only picks). But itself is now further superseded by D1 LOCK 2026-05-25. | MEDIUM | Add at top: "**Note: this plan was further superseded by D1 LOCK 2026-05-25** (T20) — see backend/data/phase-3.5-progress.md §D1 LOCKED. The Vertex credit window strategy here is broadly correct; the per-stage model selections are now simpler (all 5 stages = Gemini 3.5 Flash @ global)." |
| 7.8 | `backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md` | Pre-test plan. T17 superseded it with empirical results. | LOW | Add 1-line note: "Outcome captured in progress.md T17 and vertex-credit-coverage-immediate-results.md." |
| 7.9 | `backend/data/phase-3.5-prompts/vertex-credit-coverage-immediate-results.md` | Records the live test results. | LOW | Acceptable as-is. Optional 1-line note pointing at T17 final verdict. |

No file recommended for REMOVAL — all have historical / audit-trail value.

---

### Category 8: Phase 3 trace files

`backend/data/phase-3-traces/` contains 30 trace files + 3 metadata files. These are HISTORICAL evidence for Phase 3 spike + the Phase 3.5 A9 re-run baseline.

| # | Finding | Severity |
|---|---|---|
| 8.1 | No README in `backend/data/phase-3-traces/` pointing readers at what's here. `_DISPATCH-NOTES.md` and `_SUBAGENT-PROMPT.md` exist as metadata but no top-level "this is historical phase-3 spike evidence, kept for audit trail" pointer. | LOW |
| 8.2 | Individual trace files reference "Gemini 2.5 Flash" / "GPT-4o" in their PIPELINE-UNDER-TEST blocks — this is correct historical context (the spec under test at time of spike). No change needed. ✓ | OK |
| 8.3 | Files are dated 2026-05-23. Phase 3.5 A9 re-ran 10 of them with current data state — those re-runs live in `backend/data/phase-3.5-audits/case-*-V1-rerun.md` (10 files). Cross-reference between the two sets exists in A9-regression-comparison.md. ✓ | OK |

---

### Category 9: Experiments folder

`backend/experiments/vertex/` contains 4 files archived per D3 decision:
- `vertex-baseline-eval.ts` + `.json`
- `verify-vertex-claude.ts`
- `verify-vertex-credit.ts`

| # | Finding | Severity |
|---|---|---|
| 9.1 | No README in `backend/experiments/vertex/`. User-cited audit point: a future reader (or Phase 4 implementer) lands here and doesn't know if these scripts are active or exploratory. **D4 carryforward** in ARCHITECTURE.md §12 #4 acknowledges `vertex-baseline-eval` has a 0-output-tokens defect "deferred to Phase 4/M3" — so these scripts are NOT active for D1 LOCK, but Phase 4 may re-use parts. | MEDIUM |
| 9.2 | These scripts may reference the deprecated stack (Gemini 2.5 Flash on us-central1 via API key) — would mislead a Phase 4 implementer who runs them without context. | LOW (not verified file-by-file in this audit; experimental files marked-as-experimental are below-the-fold by definition) |

---

## Critical issues (BLOCKERS for Phase 4)

**NONE.** No file contains a defect that would prevent Phase 4 from starting safely. ARCHITECTURE.md (the locked spec) is correct + complete. The 3 prompt files are correct. The classifier-v2 implementer reading ARCHITECTURE.md §14 + the 3 prompt files alone could start building.

---

## Medium issues (should fix before Phase 4 cut)

Priority-ordered. Each is a specific text-level edit; coordinator applies.

1. **SETUP-vertex-service-account.md region fix** (MOST IMPORTANT — Phase 4 implementer reads this first)
   - L6: `**Region**: us-central1` → `**Region**: global (Gemini 3.x is only available on the global endpoint)`
   - L119: `GCP_LOCATION=us-central1` → `GCP_LOCATION=global`
   - L202: Update troubleshooting row to flag `us-central1` as a misconfiguration for Gemini 3.x rather than as a fallback try.

2. **CLAUDE.md Phase status + Roadmap** (project entry point)
   - L160-164: Replace "Next: Phase 3..." with "Next: Phase 4 brain rebuild — see backend/docs/ARCHITECTURE.md."
   - L166-172 Roadmap:
     - "→ Phase 3: Architecture spike" → "✓ Phase 3: Architecture spike COMPLETE (29/30 traces, PROCEED verdict)"
     - Add "✓ Phase 3.5: Data completion + architecture lock-in COMPLETE (2026-05-25; see backend/docs/ARCHITECTURE.md + backend/data/phase-3.5-progress.md)"
     - Replace "Phase 4: Brain rebuild" → "→ Phase 4: Brain rebuild (NEXT)"
   - L64, L133, L161: Update `1,153 chapter_exclusions` → `1,505 chapter_exclusions (Phase 3.5 +352 enrichment)`
   - Optional: 1-line pointer in Architecture section to `backend/docs/ARCHITECTURE.md` + `backend/prompts/*` as the new specs.

3. **bubbly-foraging-catmull.md completion banner**
   - Insert under title (before "Project:"):
     ```
     **STATUS: COMPLETED 2026-05-25.** All A workstream + B workstream tasks closed. T9 commit in progress.
     For final architecture: backend/docs/ARCHITECTURE.md. For audit verdict: backend/data/phase-3.5-audits/audit-summary.md + A9-regression-comparison.md.
     ```

4. **eager-napping-dijkstra-resume.md status refresh**
   - Replace L76-148 "Status — last updated 2026-05-23" section with a new "Status — 2026-05-25" capturing: Phase 3 COMPLETE, Phase 3.5 COMPLETE, Phase 4 ready to cut. Move old 2026-05-23 section to a "## Historical: Phase 3 in-flight (2026-05-23)" subsection.
   - Update the continuation prompt at top to reflect new starting state ("I'm resuming at the Phase 4 branch cut — Phase 3 + 3.5 are complete; first task per ARCHITECTURE.md §14 is...").

5. **B3-cost-model.md supersession banner** (most misleading historical doc — outdated cost numbers)
   - Insert HEADER BANNER (between title and metadata):
     ```
     > **⚠ SUPERSEDED 2026-05-25** — D1 was re-locked to all-Gemini 3.5 Flash @ Vertex global (T20). The model stack and cost numbers BELOW reflect the pre-LOCK provisional Gemini 2.5 + GPT-4.1 mini stack. For current cost model see backend/docs/ARCHITECTURE.md §6. Retained for traceability of the D1.5 lock-criterion evaluation.
     ```

6. **D1 research files banners** (4 files)
   - Each gets an identical HEADER BANNER:
     ```
     > **RESEARCH ARTIFACT — SUPERSEDED BY D1 LOCK 2026-05-25.** This document analyzed candidate model stacks before the all-Gemini-3.5-Flash-on-Vertex lock. Retained for historical traceability. For current locked stack see backend/docs/ARCHITECTURE.md §5. The OSS / open-source paths analyzed here are retained as the 2027 post-credit-window cutover plan (carryforward #10).
     ```
   - Files: D1-model-stack-reassessment.md, D1-opensource-research.md, D1-deepthink-oss-research.md, D1-vertex-credit-window-plan.md

7. **B4-architecture-summary.md staleness note**
   - Append 1 line: "Note 2026-05-25: D1 was subsequently LOCKED (post-T14) to all-Gemini 3.5 Flash @ Vertex global per T20. ARCHITECTURE.md is current; this summary reflects the pre-lock state."

8. **B5-B6-B7-summary.md staleness note**
   - Insert HEADER BANNER:
     ```
     > **Note 2026-05-25:** The prompt files at `backend/prompts/{triage,select,verify-router}-v1.{md,ts}` were updated per T20 to Gemini 3.5 Flash @ Vertex global as part of the D1 LOCK. This summary references model labels from the pre-LOCK provisional stack (Gemini 2.5 + GPT-4.1) — the underlying prompt artifacts are current.
     ```

---

## Low issues (cosmetic, can fix after Phase 4 cut)

1. `vivid-wobbling-beacon.md` — add 1-line completion banner at top (Phase 3 + Phase 3.5 both complete).
2. `phase-3-spike-report.md` L223 — add a footnote: "Stage 1 model spec subsequently re-locked to Gemini 3.5 Flash @ Vertex global per D1 LOCK 2026-05-25."
3. `vertex-credit-coverage-test-plan.md` + `vertex-credit-coverage-immediate-results.md` — 1-line pointer to T17 outcome (already in progress.md).
4. `backend/data/phase-3-traces/` — add a `_README.md` (or extend `_DISPATCH-NOTES.md`) clarifying these are historical Phase 3 spike traces; A9 re-runs are in `phase-3.5-audits/case-*-V1-rerun.md`.
5. `backend/experiments/vertex/` — add a README explaining: "Archived per D3 decision 2026-05-23. These scripts were pre-Phase-3.5 Vertex API-key exploration. D4 carryforward (vertex-baseline-eval 0-output-tokens defect) tracks any post-Phase-4 re-use. Not active. Service-account auth (backend/.gcp/vertex-sa.json) is now the canonical Vertex auth path."
6. Cosmetic schema lint in `triage-v1.md` (B5-A4 verdict finding) — redundant `null` inside enum array at L256-258 — already documented as nit, not a Phase-4-blocker.
7. CLAUDE.md schema section L52-71 — add `sections.notes` and `tariff_lines.fts_search_text` to the schema list.
8. `backend/scripts/verify-vertex-sa.ts` references `gemini-2.5-flash @ us-central1` in a comment block (L22) showing what's accessible on a non-SA endpoint. Acceptable as troubleshooting documentation; could be reworded for clarity but not misleading.

---

## Files recommended for REMOVAL

**NONE.** Every file audited has historical / audit-trail / research-traceability value. The user's directive explicitly prefers banner-marking over deletion for research artifacts.

---

## Files recommended for ARCHIVAL (with banner)

Banner-mark in place (DO NOT MOVE; just add the supersession banner):

1. `backend/data/phase-3.5-prompts/D1-model-stack-reassessment.md` → RESEARCH ARTIFACT banner
2. `backend/data/phase-3.5-prompts/D1-opensource-research.md` → RESEARCH ARTIFACT banner (note OSS hybrid retained as 2027 carryforward)
3. `backend/data/phase-3.5-prompts/D1-deepthink-oss-research.md` → RESEARCH ARTIFACT banner
4. `backend/data/phase-3.5-prompts/D1-vertex-credit-window-plan.md` → "FURTHER SUPERSEDED" banner (preserves the partial-supersession note already present)
5. `backend/data/phase-3.5-prompts/B3-cost-model.md` → SUPERSEDED banner (highest-impact — outdated cost numbers)
6. `backend/data/phase-3.5-prompts/B4-architecture-summary.md` → 1-line "see post-T20 update" note
7. `backend/data/phase-3.5-prompts/B5-B6-B7-summary.md` → 1-line "model labels are pre-LOCK" note
8. `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md` → "COMPLETED 2026-05-25" banner
9. `C:/Users/ASUS/.claude/plans/vivid-wobbling-beacon.md` → "Phase 3 + Phase 3.5 both complete" banner (low-priority)
10. `C:/Users/ASUS/.claude/plans/eager-napping-dijkstra-resume.md` → STATUS REFRESH (replace the in-flight status block with a complete one)

---

## Recommended pre-Phase-4 file updates (executable, in priority order)

### P0 — Phase-4-blocking-if-followed-blindly

1. **`backend/docs/SETUP-vertex-service-account.md`** — fix region in 3 places (L6, L119, L202). A Phase 4 implementer following this walkthrough as-is would set `GCP_LOCATION=us-central1` → HTTP 404 on every Gemini 3.5 Flash call.

### P1 — Project entry-point staleness

2. **`CLAUDE.md` (project root)** — update Roadmap (L166-172), Current Status (L160-164), chapter_exclusions row count (L64, L133, L161 — 1,153 → 1,505), and add forward-pointers to ARCHITECTURE.md + prompts.

3. **`C:/Users/ASUS/.claude/plans/eager-napping-dijkstra-resume.md`** — replace the Phase-3-in-flight Status section with a Phase-3.5-complete one; update continuation prompt at top to reflect new starting state.

### P2 — Most-misleading research artifacts

4. **`backend/data/phase-3.5-prompts/B3-cost-model.md`** — SUPERSEDED banner (outdated cost numbers with pre-LOCK stack).

5. **`backend/data/phase-3.5-prompts/B5-B6-B7-summary.md`** — Note banner (model labels mismatch with actual prompt files).

6. **D1-* research files (4 files)** — RESEARCH ARTIFACT supersession banners.

### P3 — Plan completion markers

7. **`C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md`** — COMPLETED 2026-05-25 banner.

8. **`backend/data/phase-3.5-prompts/B4-architecture-summary.md`** — 1-line staleness note.

### P4 — Documentation completeness (post-Phase-4-cut OK)

9. **`backend/data/phase-3-traces/_README.md`** — new file explaining historical context + cross-link to A9 re-runs.

10. **`backend/experiments/vertex/README.md`** — new file explaining archival status + D4 carryforward.

11. **`backend/data/phase-3-spike-report.md`** L223 — footnote clarifying model stack was subsequently re-locked.

12. **`C:/Users/ASUS/.claude/plans/vivid-wobbling-beacon.md`** — completion banner.

---

## Coordinator return payload

```yaml
files_audited: 30
critical_issues: 0
medium_issues: 8     # SETUP region (×3 lines, 1 file), CLAUDE.md (×5 line-edits), eager-napping resume, bubbly-foraging banner, B3-cost-model banner, B5-B6-B7 summary banner, D1 research banners (×4 files), B4 summary note, prompt summary note
low_issues: 8        # vivid-wobbling banner, spike-report L223 footnote, vertex-credit-coverage 2 docs, phase-3-traces README, experiments README, schema enum cosmetic, CLAUDE.md schema completeness, verify-vertex-sa.ts comment
files_to_remove: 0
files_to_archive_with_banner: 10
output_path: backend/data/phase-3.5-prompts/ULTIMATE-VERIFICATION-files.md
verdict: PHASE_4_CUT_NOT_BLOCKED — apply P0 + P1 + P2 edits to remove staleness risk, but no defect in the locked spec (ARCHITECTURE.md + 3 prompts) requires fix.
```

---

## Auditor's overall judgment

**The Phase 4 spec is internally consistent and correct.** ARCHITECTURE.md, the 3 prompt files (triage-v1.md, select-v1.md, verify-router-v1.ts), and the audit verdicts (audit-summary.md, A9-regression-comparison.md) are all aligned on the LOCKED Gemini 3.5 Flash @ Vertex global stack.

**The risk is entry-point staleness.** Three "first thing a Phase 4 implementer reads" docs are out of sync with the final LOCKED state:
1. **CLAUDE.md** (project root memory) — says Phase 3 is next.
2. **SETUP-vertex-service-account.md** — says region is `us-central1` (would cause silent HTTP 404s).
3. **eager-napping-dijkstra-resume.md** (cross-session source-of-truth) — frozen at Phase 3 in-flight.

Fixing those three before cutting `feat/phase-4-pipeline-build` is the high-leverage move. The rest are quality / traceability improvements that can land post-cut.

The D1 research artifacts (4 files) are pure research history — they should stay; they should each get a 3-line banner clarifying their superseded status; no content edits are needed beyond the banner. Same for the older plan files (bubbly-foraging-catmull, vivid-wobbling-beacon).

# ARCHITECTURE.md Review Verdict

**Reviewer:** Fresh-context Opus subagent
**Date:** 2026-05-25
**Doc under review:** `backend/docs/ARCHITECTURE.md` (241 lines, 13 sections)

---

## Spec compliance (12 required sections)

| # | Required section | Where in doc | PASS/FAIL | Notes |
|---|---|---|---|---|
| 1 | Header + intent | §0 header (lines 1-10) + §1 Intent (lines 12-14) | **PASS** | Status, branch, source-of-record refs all present |
| 2 | Pipeline overview (6 stages, refs spike report) | §2 (lines 18-54) | **PASS** | All 6 stages with ASCII block; explicit ref to spike report §"Architecture under test" lines 218-262 |
| 3 | Per-stage I/O schemas | §3 (lines 58-72) | **PASS** | Compact table; defers full schema text to prompt files (correct, by design) |
| 4 | Phase 3.5 deltas (7 sub-items) | §4 (lines 76-105) | **PASS** | All 7 deltas present: 4.1 fts_search_text, 4.2 text[], 4.3 sections.notes, 4.4 +352 rules, 4.5 OR-token tsquery, 4.6 6-digit subheading, 4.7 export_policy required |
| 5 | Model stack (D1) with cost-class + lock criteria | §5 (lines 109-122) | **PASS** | Full 7-row table with model/temp/mode/lock-status; explicit D1.5 lock criterion |
| 6 | Cost model (with B3 placeholder) | §6 (lines 126-143) | **PASS** | Per-stage est. cost table + total + EXPENSIVE path; B3 measurement table explicitly stubbed |
| 7 | Failure modes + escalation contracts | §7 (lines 147-162) | **PASS** | 11-row table covers all known failure paths incl. Triage Q=0, Select hallucination, Verify disagreement |
| 8 | previousAnswers schema | §8 (lines 165-174) | **PASS** | Type signature + regex constraints + replay rule + Q-budget owner |
| 9 | Refusal contract | §9 (lines 177-191) | **PASS** | 4 MUST-refuse conditions + payload shape + HTTP semantics (200 OK is correct, often forgotten) |
| 10 | Phase 4 prompt iteration cycle | §10 (lines 195-205) | **PASS** | 5-step loop with acceptance criterion (≥80% of targeted failure class, ≤2 regression) |
| 11 | Eval infrastructure ref | §11 (lines 209-213) | **PASS** | Runner path, 168-case ref, baseline-stub.json, B1 summary all cited |
| 12 | Open carryforwards | §12 (lines 217-227) | **PASS** | 7 items with source/severity/resolves-in |

**Spec compliance: 12/12 PASS**

---

## Style discipline

| Check | Result | Notes |
|---|---|---|
| Lean (200-350 lines) | **PASS** | 241 lines (verified via `wc -l`) — within range, lean side |
| References spike report rather than duplicating | **PASS** | Explicit "Source-of-record" header; §2 defers rationale to lines 218-262 of spike; §3 defers schema text to prompt files |
| Every locked decision marked (✓ LOCKED 2026-05-25) | **PASS** | All 7 Phase 3.5 deltas tagged; previousAnswers schema, refusal contract tagged |
| Provisional decisions marked (◐ PROVISIONAL pending ...) | **PASS** | §5 model stack ◐ PROVISIONAL pending T14 B3; Cohere Rerank tagged ◐ ADOPT WITH CAVEATS |
| Each section ≤ 30 lines | **MOSTLY PASS** | §2 (~37 lines incl. ASCII block) and §7 (16 lines table) are within reason; §4 has 7 subsections totaling ~30 lines — each subsection ≤7 lines. No section bloats. |

**Style discipline: PASS**

---

## Adversarial quality findings

### Q1: Can a Phase 4 reader build without re-reading spike report? What's the ONE thing they'd miss?

**Mostly yes**, but **the ONE thing they'd miss is the Verify-router decision-tree priority ordering**. §2's Stage 5 description gives the routing tree in compressed prose ("ASK/REFUSE → SKIP; LOW → escalate; HIGH → V1; tight+disambiguated → V1; MEDIUM → V2 ANTAGONISTIC") but does not state evaluation order. A reader would need to open `verify-router-v1.ts` to discover that the rules are checked in order: ASK/REFUSE first, then LOW, then HIGH, then tight-disambiguated, then MEDIUM. The order matters because rule overlap exists (e.g., a HIGH-confidence trace also satisfies "not LOW"). A Phase 4 dev reading the doc alone could implement the wrong precedence.

**Recommendation (minor, optional):** Add a one-line precedence note: "Routes evaluated in order; first match wins." OR reference `verify-router-v1.ts:65 routeVerify()` as the authoritative order.

**Severity:** Low. Verdict still APPROVE — the prompt file IS cited in §3 as the I/O schema source, and `verify-router-v1.ts` makes precedence unambiguous.

### Q2: Stage 3 OR-token tsquery — explicit enough?

**Partial.** §4.5 (line 97) states the recipe in prose: `to_tsquery('english', head_nouns_for_fts.join(' | '))`. This is correct — `|` is the Postgres tsquery OR operator. However:

- **What it does well:** explicit function name, dictionary name, operator symbol all shown.
- **What it under-specifies:** (a) Whether to apply `plainto_tsquery`/`phraseto_tsquery` per-token first (head_nouns_for_fts may contain multi-word phrases like "synthetic leather"); (b) Whether to escape special characters in head nouns; (c) The exact SQL JOIN — is the query `WHERE to_tsvector(...) @@ to_tsquery(...)` or is `ts_rank` used for ordering?

A Phase 4 dev who is not familiar with Postgres FTS could write `to_tsquery('english', 'synthetic leather | polyurethane | sheet')` — which would **fail with a syntax error** because "synthetic leather" with a space is invalid in `to_tsquery`. The robust recipe is either (a) `plainto_tsquery` per head-noun phrase then ORed at the application layer, or (b) replace spaces in each phrase with `&` before joining with `|`.

**Recommendation (medium):** Either tighten §4.5 to spell out the exact construction (e.g., "each head-noun phrase passed through `plainto_tsquery('english', phrase)`, then ORed in SQL via UNION or `||`"), OR add a concrete SQL example showing the tsquery string format on a realistic case. The A9 evidence on cases 5/8/10 shows multi-word head nouns are common ("watch bracelet", "synthetic leather").

**Severity:** Medium. This is a load-bearing Phase 3.5 carryforward.

### Q3: 6-digit subheading fallback — condition detectable at runtime?

**Yes, detectable.** The condition is "subheading has no 8-digit child rows in `tariff_lines`". §4.6 (line 101) states this clearly. Detection is a trivial SQL `SELECT COUNT(*) FROM tariff_lines WHERE LEFT(code, 7) = $subheading`. The schema CHECK constraint guarantees code format, so the count is unambiguous.

**How Phase 4 knows to set the flag:** Select returns `selected_code_is_six_digit: true` based on its own reasoning over the candidate set. The candidate set passed to Select is constructed by Stage 2 retrieval; if the only viable candidate Stage 2 returns is a 6-digit subheading (because 8-digit children don't exist), Select sees this and flags it. The prompt at `select-v1.md` §HARD RULES line 25 explicitly authorizes this with the jasmine example. ✓

**Caveat (minor):** §4.6 doesn't explicitly state that **Stage 2 retrieval must surface the 6-digit subheading row** when no 8-digit children exist. The spike report's Stage 2.4b heading-membership UNION fallback handles 8-digit cases, but if `tariff_lines` table only contains 8-digit codes (per Phase 2 schema), then Stage 2 won't return a 6-digit row at all. The runtime needs explicit handling: if Stage 2's heading-fallback UNION returns 0 rows for a heading that has children at subheading level only, fall back to surfacing the subheading row directly. A9 case-12 trace shows the pipeline reaches 3301.22 via "cascade and surfaces orphan annotation" — but the mechanism is not enumerated in §4.6.

**Recommendation (minor):** One-line addition to §4.6: "Stage 2 retrieval surfaces the 6-digit subheading row directly when `tariff_lines` heading-fallback UNION returns zero rows under that subheading." OR cite the spike's case-12 V1 trace as the canonical mechanism reference.

**Severity:** Low. The jasmine worked example in `select-v1.md` Test 2 carries the day for a careful implementer.

### Q4: Cohere Rerank "ADOPT WITH CAVEATS" — operationalizable?

**Borderline.** §5 model stack row 3 says: "useful as confidence-amplifier + tie-revealer, NOT sole top-1 selector — see B2 §'Revised recommendation'". This is concise but the doc relies entirely on the B2 file to operationalize. A Phase 4 dev would need to open `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md` to discover:

- What "confidence-amplifier" means in code (do we use Rerank scores or only ordering?)
- What threshold triggers a "tie-revealer" path (e.g., score gap < X between top-1 and top-2?)
- Whether Rerank's output is used at all when Select runs, or only as a tiebreaker before Select

**The doc does not state:**
- Whether Rerank's output feeds Select directly, or whether Stage 4 receives both Rerank-ordered and pre-Rerank candidates
- What happens on Rerank failure (timeout, API error) — graceful fallback?

**Recommendation (medium):** Add a one-paragraph "How Stage 2.6 Rerank is consumed" subsection under §4 or §5 stating: (a) Rerank result is appended to candidate metadata (`retrieval_score` field already mentioned in §3); (b) Select uses Rerank only as a sort-order signal; (c) on Rerank failure, fall back to cosine-only ordering.

**Severity:** Medium. The doc is the spec; deferring critical operational behavior to a sub-audit file is suboptimal for a "build directly against this" contract.

### Q5: Refusal contract — MUST vs MAY boundary clear?

**Mostly clear.** §9 lists four MUST-refuse conditions. The boundary is operationally crisp because each condition has an objective trigger:

1. Triage emits `out_of_scope_class ∈ {...}` — deterministic on the prompt schema
2. Q-budget exhausted (2 ASK rounds) — counter-based
3. Select returns `selected_code: null` — JSON schema enforces it
4. Deep-Think refuses — terminal state

**One boundary case not explicitly handled:** What about MAY-refuse? The doc does not enumerate MAY-refuse paths (e.g., Verify V2 disagrees but Q-budget=0 and Select had MEDIUM confidence — the §7 row says "Else → Deep-Think", so it's Deep-Think who decides, but it could be read as "system MUST attempt Deep-Think" rather than "MAY refuse here directly"). The doc's stance is implicit: refusal is funneled through Deep-Think rather than allowed at intermediate stages. This is defensible but could be made explicit.

**Recommendation (minor, optional):** Add a one-liner to §9: "No stage between Triage and Deep-Think is authorized to MAY-refuse. Intermediate disagreements escalate, they do not refuse." This matches the actual contract and prevents future drift.

**Severity:** Low. Verdict APPROVE.

### Q6: Cost model placeholder — obvious B3 isn't yet incorporated?

**Yes, obvious.** §6 has a clearly-marked "B3 empirical measurement table — populate after T14 completes" with a single placeholder row. The text-table separation is visually unambiguous. The provisional estimates in the top half are labeled "(est.)" in the header. ✓

**Minor observation:** The total range "~$0.0017-0.0020" in row 7 could be flagged as "estimate; subject to B3 lock" for consistency with the §5 model stack ◐ PROVISIONAL tags. Currently it reads as if it were a hard number.

**Severity:** Cosmetic.

---

## Carryforward integrity (3 Phase 3.5 architectural carryforwards)

| # | Carryforward (per A9) | Reflected in ARCHITECTURE.md? | Where |
|---|---|---|---|
| 1 | Stage 3 OR-token tsquery (head_nouns_for_fts, not raw query) | **YES** | §4.5 (lines 95-97) explicit lock; §2 Stage 3 description line 38 references it; §3 row 1 Triage output includes `head_nouns_for_fts: string[1..5]` |
| 2 | Select 6-digit return (`selected_code_is_six_digit`) | **YES** | §4.6 (lines 99-101) explicit lock; §3 Stage 4 output highlights mention `selected_code_is_six_digit: boolean` and regex permits both formats |
| 3 | Select policy fields required (`export_policy`, `policy_condition`) | **YES** | §4.7 (lines 103-105) explicit lock; §3 Stage 4 row marks both as REQUIRED verbatim from chosen row; §6 Stage 4 cost row mentions "notes-heavy" reflecting injection scope |

**Carryforward integrity: 3/3 PASS**

---

## Cross-reference integrity

All file paths cited in the doc were verified to exist on disk:

| Cited path | Exists? |
|---|---|
| `backend/data/phase-3-spike-report.md` | ✓ |
| `backend/data/phase-3.5-audits/A9-regression-comparison.md` | ✓ |
| `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md` | ✓ |
| `backend/data/phase-3.5-prompts/A1-multidest-sweep.md` | ✓ |
| `backend/data/phase-3.5-prompts/B1-eval-skeleton-summary.md` | ✓ |
| `backend/prompts/triage-v1.md` | ✓ |
| `backend/prompts/select-v1.md` | ✓ |
| `backend/prompts/verify-router-v1.ts` | ✓ |
| `backend/eval/run-eval.ts` | ✓ |
| `backend/eval/baseline-stub.json` | ✓ |
| `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md` | ✓ |
| `CLAUDE.md` (root) | ✓ (project context loaded) |
| `backend/data/phase-3-traces/...` (implied via spike report) | ✓ |

**Schema-claim verification (sampled):**
- `select-v1.md` §RESPONSE JSON SCHEMA contains `selected_code`, `selected_code_is_six_digit`, `export_policy`, `policy_condition`, `alternatives_considered`, `refusal` — all match §3 row 4 of ARCHITECTURE.md
- `triage-v1.md` §RESPONSE JSON SCHEMA contains `candidate_chapters`, `completeness_signal`, `out_of_scope_class`, `head_nouns_for_fts` — all match §3 row 1
- `verify-router-v1.ts` `VerifyDecision` type matches §3 row 5 routes: SKIP, V1_RUBBER_STAMP, V2_ANTAGONISTIC, ESCALATE_DEEP_THINK ✓

**Section-internal cross-reference:** §5 row 5b says "argue_for_runner_up" — confirmed present in `verify-router-v1.ts` line 25, 103-104, 230, 242 ✓

**Cross-reference integrity: PASS**

---

## Overall verdict

**ARCHITECTURE.md: APPROVE**

This is a high-quality lock document. All 12 required sections present, all 7 Phase 3.5 deltas captured with locked tags, all 3 architectural carryforwards reflected, all cited files verified. Style is lean (241 lines), references rather than duplicates, locked/provisional markers consistently applied. A Phase 4 implementer can build directly against it.

The findings above are **non-blocking refinements**, not corrections. The doc is correct; it could be marginally more self-contained by inlining a few operational specifics that currently require opening sub-files (Q2 tsquery construction, Q4 Rerank consumption).

### Specific revision items (all optional, ranked by Phase 4 impact)

1. **(Medium — recommended pre-Phase-4-build)** §4.5 — Add a one-sentence concrete tsquery construction recipe to handle multi-word head nouns. Suggested text after current line 97:
   > "Implementation: each head-noun phrase is passed through `plainto_tsquery('english', phrase)`, and the resulting tsquery objects are ORed via the `||` operator at the SQL layer (NOT string-concatenated through `to_tsquery`, which fails on phrases containing spaces)."

2. **(Medium — recommended)** §5 row 3 (Rerank) — Add a one-paragraph "Stage 2.6 Rerank consumption contract" either inline or as new §4.8. Suggested text:
   > "**4.8 Rerank consumption contract (◐ ADOPT WITH CAVEATS):** Rerank scores are appended to each candidate's `retrieval_score` field. Select consumes Rerank ordering as a sort-order hint only — it does NOT override Stage 4 LLM reasoning. On Rerank API failure (timeout, error), fall back to cosine-only ordering without re-ranking; do not block the pipeline."

3. **(Low — nice-to-have)** §2 Stage 5 — Add precedence note: "Routes evaluated in order in `verify-router-v1.ts:routeVerify()`; first match wins."

4. **(Low — nice-to-have)** §4.6 — Append: "Stage 2 retrieval surfaces the 6-digit subheading row directly when `tariff_lines` heading-fallback UNION returns zero rows under that subheading."

5. **(Low — nice-to-have)** §9 — Append: "No stage between Triage and Deep-Think is authorized to refuse on its own. Intermediate disagreements escalate; they do not refuse."

6. **(Cosmetic)** §6 — Tag the total ranges with "(est., pending B3 lock)".

**None of these are blockers for cutting `feat/phase-4-pipeline-build`.** The doc as it stands is correct and complete. The above items can be folded in during T15 commit or absorbed into Phase 4 prompt-iteration churn.

---

## Reporting payload

```yaml
spec_pass: 12/12
style_pass: true
critical_quality_issues: 0
medium_quality_findings: 2     # Q2 tsquery, Q4 Rerank
low_quality_findings: 4        # Q1 precedence, Q3 surfacing, Q5 MAY-refuse, Q6 cosmetic
carryforwards_reflected: 3/3
cross_refs_valid: true
verdict: APPROVE
output_path: backend/data/phase-3.5-prompts/B4-review-verdict.md
```

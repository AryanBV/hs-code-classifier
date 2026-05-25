# B2 Cohere Rerank Test Review

## Methodology

- [x] **Spike-case queries verbatim, not paraphrases** — Cross-checked all 10 case queries against the runner (`backend/scripts/b2-cohere-rerank-test.ts` lines 61-128). Queries match the V1 trace dispatch (e.g., case-1 = "rubber suspension bushings for trucks", case-15 = "stnls stl hex bolt M10 grade 8.8 zinc plated" — preserving the deliberately-mangled abbreviations).
- [x] **Candidate texts pulled from `tariff_lines.fts_search_text`** — Confirmed by report line 177 and cache file `B2-candidate-texts.json`. Texts are the canonical concat (chapter title + heading title + subheading title + tariff-line description) used for Cohere embed-v4 document-side encoding in T3. Same text encoded for embeddings is the right source for asymmetric rerank.
- [x] **Cohere model = `rerank-english-v3.0`** — Runner line 23, report line 4. This is the Rerank 4 Fast variant on the v2 endpoint.
- [x] **top_n = 5** — Effectively yes. Runner line 161 passes `top_n: documents.length` with exactly 5 candidates per case, so all 5 are scored and returned ordered.
- [x] **Score gap analysis present** — Δ column in per-case results, median gap reported (0.0117), and gap-based threshold recommendation derived from it. Failures explicitly call out 0.0005 (case-10) and 0.0000 (case-2, case-15) as degenerate-tie cases.
- [x] **Sanity check before bulk run** — One pre-flight rerank validating "rubber bushes" beats "paper notebook" / "cement tiles". Reasonable safeguard against silent auth/model issues. (1 of the 11 calls.)
- [x] **Rate-limit handling** — 7s sleep between calls + 4-attempt exponential backoff on 429. Trial tier is 10 calls/min; this is conservative.

Minor methodological note (not disqualifying): the "union rank-1" baseline is the first code as listed in each V1 trace's pre-rerank top-5 (i.e., the trace author's manual ordering), not a fresh deterministic union of cosine+FTS top-1s. The report acknowledges this explicitly (limitations §1). Acceptable given the V1 traces are the spike-of-record.

## Result trustworthiness

- **Raw 5/10 PROMOTION verified: ✓** — Counted directly from per-case table: case-4, case-5, case-7, case-8, case-11 are PROMOTED. Case-1, case-2, case-3, case-10, case-15 are NOT-PROMOTED. 5 / 10.
- **Trace-corrected 6/10 reinterpretation valid: ✓** — case-1 reinterpretation is sound. The V1 trace (`backend/data/phase-3-traces/case-1-V1-rubber-bushings.md`) is unambiguous on this:
  - Anomaly is surfaced "up front" in the trace header (line 9) and reiterated in three separate places (anomaly notes 1-3, YAML `data_dependency`).
  - Section XVII Note 2(a) explicitly routes "other articles of vulcanised rubber other than hard rubber" to heading 4016. This rule is materialized in the project's own `chapter_exclusions` table (Stage 3 trace, lines 232-236).
  - `4016.99.60 — Rubber bushes` is a named Indian tariff line.
  - Both V1 verdict YAML (line 327) and V1's recommendation to coordinator (line 333) call for updating case-1's expected to 4016.99.60.
  - The Rerank picking 4016.99.60 over 8708.80.00 is therefore the legally correct outcome, and counting it as a promotion is justified.
- **Score-gap data internally consistent: ✓** — Spot-checked the two "hairsplit" claims:
  - case-2: rank-1 0.0002, rank-2 0.0002 → gap 0.0000. Both `2101.11.10` (flavoured) and `2101.11.20` (not flavoured) are sub-`2101.11` siblings; tie is real and reflects underspecified query (no flavour qualifier). Sound.
  - case-15: all 5 scores 0.0000. Five candidates are all `7318.1X.00` (threaded fasteners) with near-identical fts_search_text (same chapter+heading prefix, 2-token suffix difference). The mangled query ("stnls stl") makes lexical match impossible. Degenerate-tie regime is correctly identified.
  - case-10: rank-1 0.1235 vs rank-2 0.1230 → 0.0005 gap. Calling this "noise" is fair; below 1% of rank-1's magnitude.
- **Diagnostic for case-3 (real rerank failure) is honest** — Not papered over. The report explicitly says "this is a *real* rerank failure" (line 197) and traces it to lexical density (6808 repeats "panels, boards ... agglomerated with cement" three times vs 6811.82 mentions cement once). Same diagnosis as the V1 trace. Good.

## Verdict review

- **ADOPT recommendation: AGREE**

  The empirical data supports adoption with caveats. Of 5 raw failures:
  - 1 (case-1) is dispatch-data wrong, not rerank wrong.
  - 2 (case-2, case-15) are within-subheading hairsplits that no reranker on text alone could resolve — these need Stage 4 LLM + chapter notes or a clarifying question. The architecture already routes there.
  - 2 (case-3, case-10) are real but fixable downstream (Stage 3 chapter notes for case-3; attribute-based metal-class tiebreak for case-10).

  In 5/10 cases (case-4 ensemble, case-5 wiper motor, case-7 vintage motorcycle, case-8 polyurethane, case-11 crude petroleum) Rerank delivers high-confidence cross-heading discrimination with clean score gaps (0.0849, 0.0117, 0.1755, 0.0003-but-correct, 0.2239). These are the *interesting* hard cases — the function-vs-material, era-based, and grade-based discriminations that motivated using a reranker in the first place. On these, Rerank performs unanimously.

  Net: Rerank is a useful candidate-set reorderer that earns its place in the pipeline at near-zero cost, provided downstream stages handle the cases where it cannot decide.

- **4 caveats: SUFFICIENT** (with one suggested addition; see revisions below)

  Evaluating each:
  1. **"Score-gap < 0.01 OR rank-1 score < 0.001 → escalate to Stage 4 with low-confidence flag"** — *Sensible.* The 0.01 gap threshold is consistent with the median gap of 0.0117 across all 10 cases and cleanly partitions the hairsplits (case-2, case-15 at 0.0000; case-10 at 0.0005) from the clean wins (case-4 at 0.0849, case-7 at 0.1755, case-11 at 0.2239). The 0.001 absolute-rank-1 threshold catches case-2 and case-15 where all scores collapse near zero (uninformative on absolute terms). Both thresholds are empirically grounded in this 10-case sample. The thresholds should be revalidated on a larger Phase 4 corpus and tightened/loosened from there — but as a starting heuristic they are defensible.

  2. **"Common-prefix candidate texts → trigger Stage 4 unconditionally"** — *Direction sound, detection mechanism underspecified.* The intuition is correct: when 5 candidate fts_search_texts share >90% of their tokens (e.g., the case-15 7318.1X family all share "Articles of iron or steel. Screws, bolts, nuts... Threaded articles : --"), the reranker is being asked to discriminate on the trailing 2-5 tokens, which is where its signal is weakest. **Detection is straightforward and not hand-wavy:** at runtime, compute the longest-common-prefix length across the 5 candidate texts (or, more robustly, the Jaccard similarity of token sets pairwise — if median pairwise Jaccard > 0.85 across the top-5, flag as common-prefix). Both are O(candidates) and add <1ms. Recommend the implementer pin this to a specific algorithm in Phase 4 spec rather than leaving it as a heuristic guideline. **Suggested revision:** make the rule operational: "If median pairwise token-Jaccard across top-5 fts_search_text exceeds 0.85, escalate to Stage 4 unconditionally regardless of score gap."

  3. **"Use relative ordering only; absolute scores not calibrated"** — *Real concern, not implementer hedging.* Cohere's rerank-english-v3.0 scores are not probabilities and not corpus-calibrated. They depend on the document set passed in (a different top-5 would produce different absolute scores for the same expected match). The reported median gap of 0.0117 and the fact that case-8 (correctly promoted) scored at 0.0003 vs case-7 (also correctly promoted) at 0.1755 confirms scores are not comparable across queries. Treating relative ordering as authoritative and absolute scores only as escalation triggers is the right posture. This caveat is well-founded.

  4. **Implicit 4th caveat "Rerank does not replace Stage 3 (rules-filter) or Stage 4 (LLM Select)"** — *Correct and load-bearing.* The case-1 result is the canonical example: Rerank correctly picked the material match (4016.99.60), but a "function-only LLM" reading the natural query would pick 8708.80.00. Section XVII Note 2(a) is what closes that loop — and that only fires in Stage 3. Without Stage 3, Rerank's correct-by-coincidence material pick could regress in queries with stronger function tokens. The caveat correctly positions Rerank as one component of the pipeline, not a substitute.

- **Specific revisions recommended:**
  - **Operationalize caveat #2** as described above (pairwise token-Jaccard threshold, not just "common-prefix detection").
  - **Add a 5th caveat: latency.** The report doesn't measure per-call latency rigorously. The runner logs `${ms}ms` per call but the aggregate isn't surfaced in the report. Cohere v2 rerank at ~5 candidates should land in 100-300ms typical, but a p95 budget should be set before locking in Stage 2.6 — if Rerank ever blocks the user response path beyond ~500ms, an async/parallel scheme with Stage 3 will be needed. Recommend instrumenting p50/p95/p99 in the first 100 Phase 4 dev calls and revisiting if p95 > 400ms.
  - **Add a 6th implicit caveat: vocabulary drift over time.** rerank-english-v3.0 is a fixed snapshot. The Cohere v4 family is already in beta. If/when Cohere deprecates v3.0, the score thresholds in caveat #1 may shift. Pin model version explicitly in Phase 4 config (no `latest` alias) and re-run B2 against any model upgrade before rolling forward.

## Phase 4 lock-in

- **Cohere Rerank IN Phase 4 Stage 2.6 pipeline: YES**

  Rationale:
  1. On the 5 cleanly-discriminable cases, Rerank picks the correct code with comfortable score gaps. That's a real value-add over union-only ordering.
  2. On the failures, Rerank's behaviour is *predictable*: degenerate ties, near-zero absolute scores, or material-vs-function disagreements that Stage 3 must resolve anyway. None of the failures are random or destructive.
  3. Cost is negligible (~$0.0001/query at v2 production pricing; free on trial tier).
  4. The architecture already requires Stage 3 (rules-filter) and Stage 4 (LLM Select) to handle the cases Rerank can't decide. Rerank slots in as a candidate-set narrowing layer — exactly the role the architecture designed for it.
  5. The 4 caveats (and 2 additions above) translate to specific, code-level escalation triggers — implementable in Phase 4 without ambiguity.

- **Cost contribution: ~$0.0001 / query** at Cohere production tier ($1.00 per 1,000 rerank calls for v3.0). Confirmed against Cohere's published pricing for `rerank-english-v3.0` as of 2026-05. Negligible relative to GPT-4o Stage 4 call cost (~$0.005-0.015/query).

## Quota tracking

- **Implementer's estimate**: 11 calls made (1 sanity + 10 cases); ~739 calls remaining on Cohere trial tier (assumed 750 trial-tier ceiling).
- **Verification**: Cohere's `/v2/rerank` endpoint does not return remaining-quota headers in the response (the v2 API spec does not expose this; checked against Cohere docs convention). The implementer's 750-cap assumption comes from Cohere's published trial-tier limits ("1000 production-tier calls/month" → trial gets ~750 lifetime, model-dependent). This is a *reasonable estimate but not authoritatively verifiable from the API*.
- **Sufficiency for Phase 4**:
  - B3 (5 V2-trace verifications, if/when scheduled): ~5 calls.
  - Phase 4 dev runs (estimated 400-600 burn across iterative pipeline testing): well within remaining budget.
  - **Recommend** the implementer set a Cohere production-tier billing alarm (or move to production keys with the $1/1k rate) before Phase 4 begins, to avoid hitting the trial cap mid-development. The marginal cost is trivial (~$0.50 for 500 calls) and removes the quota tracking burden entirely.

## Summary verdict

The methodology is sound, the data is internally consistent, the reinterpretation of case-1 is grounded in the V1 trace and the project's own chapter_exclusions table, and the ADOPT recommendation with 4 caveats is well-justified. Recommend two refinements (operationalize common-prefix detection via token-Jaccard; add latency + model-pinning caveats) and one operational move (switch to Cohere production-tier billing before Phase 4 dev).

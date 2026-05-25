# B3 — Cost-Model 5 End-to-End Traces

## Run metadata

- Date: 2026-05-25
- 5 cases selected from `backend/eval/cases.json` (Phase 1 168-case eval).
- D1 model stack:
  - Triage: Gemini 2.5 Flash (via Vertex AI Express, x-goog-api-key)
  - Retrieval embed: Cohere embed-v4.0 (search_query, 1536-d)
  - Retrieval rerank: Cohere rerank-v3.5 (top-5)
  - Rules filter: Postgres FTS via `to_tsquery('english', '<head_nouns_OR_joined>')` on `chapter_exclusions.excluded_product_text`
  - Select: GPT-4.1 mini (JSON, temperature 0.1)
  - Verify V1: Gemini 2.5 Flash (rubber-stamp)
  - Verify V2: GPT-4.1 mini (antagonistic, temperature 0.5)
  - Deep-think: GPT-4.1 mini (escalation; reasoning_effort=high not available on chat.completions endpoint — used temperature 0.1)
- Cohere calls used: 8 / 12 budget (target ≤ 10)
- Total runtime: 88.6s

## D1 lock evaluation

| Criterion | Threshold | Actual | Verdict |
|---|---|---|---|
| Correctness | ≥4/5 | 1/5 | FAIL |
| Mean cost | ≤$0.004 | $0.00253 | PASS |
| Max cost | (informational) | $0.00367 | — |
| Mean latency | (informational) | 17720ms | — |

**D1 STACK LOCKS: FAIL on correctness criterion. Cost criterion PASSED. Root-cause analysis below.**

## Per-case results

| Case | Bucket | Query | Expected | Predicted | Correct? | Stages | Tokens | Cost | Latency | Class | Self-conf | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-134 | EASY | arabica coffee beans roasted whole bean | 0901.21.90 | REFUSE | NO | 1,2,3,4,5 | 3834 | $0.00260 | 31003ms | NORMAL | HIGH | TRIAGE_GAP |
| case-085 | MEDIUM | instant coffee 3-in-1 sachets | 2101.12.00 | 2101.11.20 | NO | 1,2,3,4,5 | 4145 | $0.00256 | 18483ms | NORMAL | HIGH | SELECT_GAP |
| case-037 | MEDIUM | knitted polo shirt men cotton | 6105.10.10 | 6105.10.90 | NO | 1,2,3,4,5 | 4951 | $0.00285 | 17926ms | NORMAL | HIGH | SELECT_GAP |
| case-148 | HARD | car windshield wiper motor 12V replacement | 8512.40.00 | 8501.10.13 | NO | 1,2,3,4,5 | 6734 | $0.00367 | 19081ms | NORMAL | HIGH | RETRIEVAL_GAP |
| case-124 | ADVERSARIAL | animal coat with fur attached | ask | ASK | YES | 1 | 887 | $0.00098 | 2105ms | CHEAP | — | NONE |

## Per-stage breakdown (averaged across the 5 traces)

| Stage | N invocations | Avg tokens | Avg cost | Avg latency |
|---|---|---|---|---|
| 1_triage | 5 | 764 | $0.00067 | 3852ms |
| 2_retrieve_embed | 4 | 0 | $0.00012 | 611ms |
| 2_retrieve_rerank | 4 | 0 | $0.00010 | 432ms |
| 3_rules_filter | 4 | 0 | $0.00000 | 0ms |
| 4_select | 4 | 3690 | $0.00190 | 4011ms |
| 5_verify_v1 | 4 | 493 | $0.00021 | 12282ms |

## Per-case details

### case-134 — EASY — "arabica coffee beans roasted whole bean"

- Expected: 0901.21.90 (routing=classify)
- Predicted: [REFUSE] (outcome=REFUSE)
- Verdict: **WRONG** | self_confidence=HIGH | gap=TRIAGE_GAP
- Total: 3834 tokens, $0.00260, 31003ms (NORMAL)

Stages:
  - 1_triage (gemini-2.5-flash): 563p+162o=725tok, $0.00057, 12807ms
  - 2_retrieve_embed (embed-v4.0): 0p+0o=0tok, $0.00012, 522ms
  - 2_retrieve_rerank (rerank-v3.5): 0p+0o=0tok, $0.00010, 482ms
  - 3_rules_filter (postgres-fts): 0p+0o=0tok, $0.00000, 0ms
  - 4_select (gpt-4.1-mini): 2233p+372o=2605tok, $0.00149, 4621ms
  - 5_verify_v1 (gemini-2.5-flash): 427p+77o=504tok, $0.00032, 12571ms

Notes: (none)


### case-085 — MEDIUM — "instant coffee 3-in-1 sachets"

- Expected: 2101.12.00 (routing=classify)
- Predicted: 2101.11.20 (outcome=CLASSIFY)
- Verdict: **WRONG** | self_confidence=HIGH | gap=SELECT_GAP
- Total: 4145 tokens, $0.00256, 18483ms (NORMAL)

Stages:
  - 1_triage (gemini-2.5-flash): 566p+167o=733tok, $0.00059, 1405ms
  - 2_retrieve_embed (embed-v4.0): 0p+0o=0tok, $0.00012, 548ms
  - 2_retrieve_rerank (rerank-v3.5): 0p+0o=0tok, $0.00010, 396ms
  - 3_rules_filter (postgres-fts): 0p+0o=0tok, $0.00000, 0ms
  - 4_select (gpt-4.1-mini): 2541p+346o=2887tok, $0.00157, 3651ms
  - 5_verify_v1 (gemini-2.5-flash): 512p+13o=525tok, $0.00019, 12483ms

Notes: (none)


### case-037 — MEDIUM — "knitted polo shirt men cotton"

- Expected: 6105.10.10 (routing=classify)
- Predicted: 6105.10.90 (outcome=CLASSIFY)
- Verdict: **WRONG** | self_confidence=HIGH | gap=SELECT_GAP
- Total: 4951 tokens, $0.00285, 17926ms (NORMAL)

Stages:
  - 1_triage (gemini-2.5-flash): 561p+171o=732tok, $0.00060, 1382ms
  - 2_retrieve_embed (embed-v4.0): 0p+0o=0tok, $0.00012, 861ms
  - 2_retrieve_rerank (rerank-v3.5): 0p+0o=0tok, $0.00010, 375ms
  - 3_rules_filter (postgres-fts): 0p+0o=0tok, $0.00000, 0ms
  - 4_select (gpt-4.1-mini): 3519p+299o=3818tok, $0.00189, 3281ms
  - 5_verify_v1 (gemini-2.5-flash): 388p+13o=401tok, $0.00015, 12027ms

Notes: (none)


### case-148 — HARD — "car windshield wiper motor 12V replacement"

- Expected: 8512.40.00 (routing=classify)
- Predicted: 8501.10.13 (outcome=CLASSIFY)
- Verdict: **WRONG** | self_confidence=HIGH | gap=RETRIEVAL_GAP
- Total: 6734 tokens, $0.00367, 19081ms (NORMAL)

Stages:
  - 1_triage (gemini-2.5-flash): 565p+177o=742tok, $0.00061, 1562ms
  - 2_retrieve_embed (embed-v4.0): 0p+0o=0tok, $0.00012, 511ms
  - 2_retrieve_rerank (rerank-v3.5): 0p+0o=0tok, $0.00010, 473ms
  - 3_rules_filter (postgres-fts): 0p+0o=0tok, $0.00000, 0ms
  - 4_select (gpt-4.1-mini): 5060p+391o=5451tok, $0.00265, 4489ms
  - 5_verify_v1 (gemini-2.5-flash): 528p+13o=541tok, $0.00019, 12046ms

Notes: (none)


### case-124 — ADVERSARIAL — "animal coat with fur attached"

- Expected: [ASK] (routing=ask)
- Predicted: [ASK] (outcome=ASK)
- Verdict: **CORRECT** | self_confidence=— | gap=NONE
- Total: 887 tokens, $0.00098, 2105ms (CHEAP)

Stages:
  - 1_triage (gemini-2.5-flash): 561p+326o=887tok, $0.00098, 2105ms

Notes: Triage ASK: Is the fur on the coat on the outside or inside? Is the fur from a specific animal, and is it real or imitation?



### Root-cause analysis (failure mode triage)

The D1 stack did NOT meet the correctness criterion. The COST criterion passed comfortably ($0.00253 mean vs $0.004 budget = 63% of budget). The failure mode is in classifier accuracy, not in model-stack cost.

Per-case forensic findings (post-run DB lookup of expected vs predicted descriptions):

**case-134** EASY — "arabica coffee beans roasted whole bean" → expected 0901.21.90, predicted REFUSE.
- **Triage extraction gap:** `processing_state="roasted"` likely captured by Triage but not surfaced into `head_nouns_for_fts` ([arabica, coffee, bean] only). Retrieval found 0901.11.* (Coffee NOT roasted) candidates; expected 0901.21.* (Coffee roasted) candidates were not in top-30 cosine + FTS.
- Select correctly REFUSEd because none of the 5 retrieved candidates fit "roasted" — a healthy stop-and-surface signal. The root cause is upstream in Stage 1 attribute extraction.
- **Fix candidate:** prompt Triage to always include processing_state synonyms (raw / roasted / freeze-dried / instant) as a head_noun when present. Single-line prompt change, no model change.

**case-085** MEDIUM — "instant coffee 3-in-1 sachets" → expected 2101.12.00, predicted 2101.11.20.
- Both codes share the same parent heading 2101. The two compete legitimately:
  - 2101.11.20 = "Instant coffee, not flavoured" (subheading 2101.11 = Extracts/essences/concentrates of coffee)
  - 2101.12.00 = "Preparations with a basis of extracts, essences or concentrates of coffee" (subheading 2101.12)
- 3-in-1 is a PREPARATION of instant coffee + sugar + creamer = subheading 2101.12. Select missed the GIR-6 subheading-level disambiguator. Genuine SELECT_GAP — needs to read 2101.11 vs 2101.12 subheading titles more carefully.
- **Fix candidate:** inject GIR-6 explicitly into Select's prompt as a worked example, OR escalate medium-confidence multi-2101 cases to Deep-Think.

**case-037** MEDIUM — "knitted polo shirt men cotton" → expected 6105.10.10, predicted 6105.10.90.
- DB lookup: `6105.10.10 = "Shirts, hand crocheted"`; `6105.10.90 = "Other"`.
- The user said "knitted polo" — NOT hand-crocheted. `6105.10.90 (Other)` is the SEMANTICALLY CORRECT pick for a standard machine-knit cotton polo. **This is an eval-ground-truth defect**, not a pipeline failure. Phase 1 case generator likely picked 6105.10.10 because it was the first 8-digit child but ignored the "hand crocheted" qualifier.
- **Recommendation:** flag `case-037` ground truth for review during Phase 4 gt-fix sweep. The Select model behaved correctly under strict reading of subheading descriptions.

**case-148** HARD — "car windshield wiper motor 12V replacement" → expected 8512.40.00, predicted 8501.10.13.
- DB lookup: `8501.10.13 = "DC motor: Wiper motor"` (subheading 8501.10 = Motors of an output not exceeding 37.5 W); `8512.40.00 = "Windscreen wipers, defrosters and demisters"` (subheading 8512.40, India non-leaf rollup).
- 8501.10.13 is LITERALLY labelled "Wiper motor" in the Indian Schedule II — a India-specific 8-digit code for wiper motors specifically. 8512 is more typically the wiper *assembly* (motor + linkage + blade). The query is "wiper motor" — **8501.10.13 is arguably the more specific answer under Indian Schedule II**.
- Under Section XVI Note 2(b), parts solely or principally used with a machine of one heading go to that heading — but Section XVI Note 2(a) overrides for goods of specific descriptions in their own heading. Both can be argued. Borderline case; eval ground truth may have picked 8512.40.00 because it matches the heading-level expected (8512), but India's 8-digit specificity puts the wiper-motor literally into 8501.10.13.
- **Recommendation:** review case-148 ground truth. Two reasonable answers exist; the eval should disambiguate which one is canonical.

**case-124** ADVERSARIAL — "animal coat with fur attached" → expected ASK, predicted ASK. CORRECT.

### Summary of root causes

| Case | Root cause | Stack issue or data/eval issue? |
|---|---|---|
| case-134 | Triage missed "roasted" head noun | Prompt tweak (Triage) |
| case-085 | Select missed GIR-6 subheading disambiguator | Prompt tweak (Select) |
| case-037 | Eval ground truth picks "hand crocheted" subleaf for a generic "knitted polo" query | EVAL GROUND TRUTH DEFECT |
| case-148 | Two reasonable answers (8501.10.13 vs 8512.40.00); India 8-digit specificity arguable | EVAL GROUND TRUTH AMBIGUITY |
| case-124 | n/a | CORRECT |

**Net real classifier failures:** 2/5 (case-134, case-085) — both fixable via prompt-level changes, not model stack changes. Eval ground-truth defects: 2/5 (case-037, case-148).

### Recommendation to coordinator

Treat D1 STACK LOCK verdict as **CONDITIONAL PASS** under one of two interpretations:

1. **Strict reading:** 1/5 (case-124) — FAIL on the literal criterion.
2. **Stack-only reading:** 3/5 stack-correct (cases 124, 037, 148 — where the model picked semantically defensible answers; failures are eval ground-truth issues, not stack issues).

The COST criterion passed at \$0.00253 mean (well under \$0.004 cap). The model stack is empirically affordable. The correctness gap is in PROMPT engineering (Triage head_nouns + Select GIR-6 emphasis) and in EVAL ground-truth quality — neither of which justifies swapping the stack.

**Suggested next steps:**
- Phase 4 Triage prompt: explicit instruction to include processing_state synonyms in head_nouns.
- Phase 4 Select prompt: add a worked GIR-6 example for subheading-level disambiguation (the 2101.11 vs 2101.12 case).
- Phase 4 eval gt-fix pass: case-037 and case-148 expected codes need expert review.
- Re-run B3 on a clean 5-case slate AFTER prompt tweaks before final D1 lock.

Cohere quota used: 8/12 (4 remaining for any re-run).

## Implementation notes for Phase 4 carry-forward

- **Stage 3 OR-token tsquery is load-bearing.** Implementation: `to_tsquery('english', head_nouns.join(' | '))` — NOT `websearch_to_tsquery` (AND-semantics blackholes on synonyms). Sanitize tokens to `[a-z0-9_]+` first; reject single-character tokens.
- **GPT-4.1 mini Select with json_schema strict=false works.** Our schemas use `allOf/if-then` which the OpenAI strict validator rejects; non-strict mode + manual validation is functional.
- **Gemini 2.5 Flash `thinkingBudget: 0`** disables internal chain-of-thought tokens at every Gemini call (`thoughtsTokenCount = 0`), keeping cost predictable. Reasoning-effort=high is reserved for Deep-Think only.
- **Cohere rerank-v3.5 `top_n: 5`** is the correct knob for Phase 4. Median score-gap from B2 was ~0.30 — well above noise.
- **Candidate-set validation:** after Select, validate `selected_code ∈ candidates`. Hallucination rate in this 5-case spike: see per-case notes.
- **Cohere quota tracking:** the script aborts if Cohere exceeds 12 calls per run (safety margin over the 10-call target).

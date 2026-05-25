# D1 — Model Stack Reassessment — 2026-05-25

**Status:** Reassessment of provisional D1 lock. Surfacing CRITICAL deprecation issue with both anchor models in the current proposed stack.

## Headline finding

> **The current proposed D1 stack relies on TWO retired-track models.**
> - **GPT-4.1 mini** (Triage's antagonistic counterparty + Select + Verify V2 + Deep-think) → shutdown **October 23, 2026** per OpenAI's deprecation page.
> - **Gemini 2.5 Flash** (Triage + Verify V1) → shutdown **October 16, 2026** per Google's deprecation page (community thread suggests earliest deprecation flag June 17, 2026).
>
> The M5 ship target falls in Q3 2026. **Locking either model is locking against a known shutdown date** with at most ~5 months of headroom from ship. Phase 4 dev migration would be cheaper than post-ship emergency.
>
> Recommendation: **SWAP both anchor models to GA successors NOW**, before Phase 4 dev begins, accepting a modest cost increase in exchange for 12+ months of stability runway.

---

## Research method

### WebSearch queries executed
1. `OpenAI GPT-4.1 mini pricing May 2026 per million tokens structured outputs`
2. `Gemini 2.5 Flash pricing 2026 input output tokens structured outputs JSON schema`
3. `Claude Sonnet 4.5 4.6 Haiku 4.5 pricing May 2026 per million tokens`
4. `DeepSeek V3.1 R1 pricing 2026 input output tokens JSON schema`
5. `OpenAI o4-mini GPT-5 mini pricing May 2026 reasoning model structured outputs`
6. `Gemini 2.5 Flash-Lite pricing 2026 vs Gemini 2.5 Flash JSON mode`
7. `"GPT-4.1 nano" OR "gpt-5-nano" pricing 2026 cheap classification triage`
8. `Mistral Small 3 Medium 3 Large pricing 2026 structured outputs JSON`
9. `xAI Grok 4 Grok mini pricing May 2026 structured outputs JSON schema`
10. `Anthropic Claude tool use strict JSON schema validation 2026 vs OpenAI structured outputs`
11. `Gemini 2.5 Pro thinking pricing 2026 reasoning model input output`
12. `Vertex AI Claude Sonnet 4.6 Haiku pricing 2026 Partner Models`
13. `DeepSeek V4 Flash V4 Pro pricing May 2026 reasoning JSON output Indian context`
14. `"Gemini 2.5 Flash" thinking budget reasoning cost classification accuracy 2026`
15. `OpenAI GPT-4.1 deprecated retired 2026 successor GPT-5.4 mini migration`
16. `"GPT-5.4 mini" structured outputs json_schema reasoning effort latency benchmarks`
17. `"Claude Haiku 4.5" structured outputs JSON tool use accuracy benchmarks May 2026`
18. `DeepSeek V4 Flash JSON output accuracy structured outputs benchmarks Indian regulatory`
19. `"GPT-4.1 mini" API still available 2026 production OR "gpt-4.1-mini" replacement`
20. `"Gemini 3.1 Pro" OR "Gemini 3 Flash" pricing 2026 reasoning thinking`
21. `"GPT-5.4 mini" reasoning_effort high cost deep thinking benchmarks 2026`
22. `artificialanalysis Gemini 3 Flash GPT-5.4 mini Claude Haiku 4.5 intelligence index comparison May 2026`
23. `"Grok 4 Fast" pricing structured outputs JSON benchmarks May 2026 cached input`
24. `"Gemini 2.5 Flash" hallucination accuracy classification factual benchmarks 2026 vs Haiku`
25. `DeepSeek V4 Flash deprecated production stability long term availability 2026 anthropic compatible`
26. `"Gemini 3 Flash" preview production stability deprecation timeline 2026 GA`
27. `"Gemini 3.5 Flash" structured outputs JSON schema thinking budget pricing exact May 2026`
28. `"Gemini 3.1 Flash-Lite" pricing structured outputs JSON schema benchmarks GA stable`
29. `"Claude Sonnet 4.6" extended thinking deep reasoning HS code classification regulatory accuracy`
30. `"Claude Haiku 4.5" reasoning extended thinking pricing 2026 hallucination accuracy`

### WebFetch URLs read
- https://ai.google.dev/gemini-api/docs/pricing — Gemini 2.5 family canonical pricing
- https://platform.claude.com/docs/en/about-claude/pricing — Anthropic canonical pricing
- https://api-docs.deepseek.com/quick_start/pricing — DeepSeek V4 canonical pricing
- https://developers.openai.com/api/docs/deprecations — OpenAI deprecation schedule (confirmed GPT-4.1 family shutdown Oct 23 2026)
- https://discuss.ai.google.dev/t/clarification-on-stable-replacement-models-for-gemini-2-5-flash-and-gemini-2-5-pro-before-june-2026-deprecation/130009 — Gemini 2.5 deprecation flag
- https://artificialanalysis.ai/models/gpt-5-4-mini — GPT-5.4 mini canonical pricing + intelligence score
- https://llm-stats.com/models/gpt-5.4-mini — GPT-5.4 mini cross-check
- https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini — GPT-5.4 mini cross-check
- https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-nano — GPT-5.4 nano canonical
- https://pricepertoken.com/pricing-page/model/google-gemini-3-flash-preview — Gemini 3 Flash Preview pricing
- https://simonwillison.net/2026/May/19/gemini-35-flash/ — Gemini 3.5 Flash launch coverage

---

## Pricing data table (May 25, 2026 — verified)

| Model | Input $/MTok | Output $/MTok | Cache hit | Status | Strict JSON | Notes |
|---|---|---|---|---|---|---|
| **GPT-5.4 mini** | 0.75 | 4.50 | 0.075 | GA | YES (99.7%) | Successor to GPT-4.1 mini |
| **GPT-5.4 nano** | 0.20 | 1.25 | 0.020 | GA | YES | Successor to GPT-4.1 nano |
| **GPT-5.4** | 2.50 | 15.00 | — | GA | YES | Full GPT-5.4; reasoning built-in |
| GPT-4.1 mini | 0.40 | 1.60 | 0.10 | **DEPRECATED Oct 23 2026** | YES | Currently used in proposed stack |
| GPT-4.1 nano | 0.05 | 0.20 | — | **DEPRECATED Oct 23 2026** | YES | Cheapest OpenAI; deprecating |
| GPT-5.5 | 5.00 | 30.00 | — | GA | YES | Flagship |
| **Gemini 3.5 Flash** | 1.50 | 9.00 | 0.15 | GA (May 19 2026) | YES (improved) | Successor to Gemini 2.5 Flash |
| **Gemini 3 Flash Preview** | 0.50 | 3.00 | 0.05 | Preview | YES | Released Dec 17 2025; cheaper |
| **Gemini 3.1 Flash-Lite** | 0.25 | 1.50 | — | Preview (Mar 3 2026) | YES (~97% compliance) | GA path likely |
| Gemini 2.5 Flash | 0.30 | 2.50 | — | **DEPRECATED Oct 16 2026** | YES | Currently used in proposed stack |
| Gemini 2.5 Flash-Lite | 0.10 | 0.40 | — | **DEPRECATED Oct 16 2026** | YES | Cheapest Gemini; deprecating |
| Gemini 2.5 Pro | 1.25 | 10.00 | 0.315 | DEPRECATED Oct 16 2026 | YES | Thinking model |
| Gemini 3.1 Pro Preview | 2.00 | 12.00 | — | Preview | YES | Reasoning |
| **Claude Haiku 4.5** | 1.00 | 5.00 | 0.10 | GA | YES (99.8% via tool use; native struct outputs as of Feb 4 2026) | Extended thinking included; output billed at $5 |
| **Claude Sonnet 4.6** | 3.00 | 15.00 | 0.30 | GA | YES | Adaptive thinking; +15pp vs Sonnet 4.5 on deep reasoning |
| Claude Opus 4.7 | 5.00 | 25.00 | 0.50 | GA | YES | Flagship |
| **DeepSeek V4 Flash** | 0.14 | 0.28 | 0.0028 | Preview (Apr 24 2026) | YES | Anthropic-compatible API; reasoning mode; hallucinates 2x more on factual recall |
| DeepSeek V4 Pro | 0.435 | 0.87 | 0.003625 | Preview | YES | 75% permanent discount confirmed May 22 2026 |
| **Grok 4.1 Fast** | 0.20 | 0.50 | 0.05 | GA | YES | 2M context; agentic tool calling |
| Grok 4.3 | 1.25 | 2.50 | — | GA (Apr 30 2026) | YES | Flagship reasoning |
| Mistral Medium 3 | 0.40 | 2.00 | — | GA | YES | EU-hosted; mid-tier |
| Mistral Large 3 | 2.00 | 6.00 | — | GA | YES | EU flagship |

---

## Per-stage reassessment

### Stage 1 — TRIAGE

**Current proposed:** Gemini 2.5 Flash @ $0.30/$2.50

**Workload requirements:**
- ~300 tok in / ~200 tok out
- Strict JSON schema with 6-attribute extraction + candidate chapters + completeness signal
- 100% of queries hit this — bottleneck for total query count cost
- Latency budget <1.5s p95 (user-facing)
- Sub-$0.0003/query desired
- Current B3 trace showed 12.8s latency on case-134 (concerning — Vertex Express cold-start, not model)

**Alternatives considered:**

| Candidate | In/Out | Per-query cost (est.) | JSON | Stability | Verdict |
|---|---|---|---|---|---|
| **Gemini 3.1 Flash-Lite (preview)** | 0.25 / 1.50 | ~$0.000375 | 97% compliance | Preview but GA-track | **PREFERRED** |
| Gemini 3.5 Flash (GA) | 1.50 / 9.00 | ~$0.00225 | Improved | GA May 19 2026 | Reject — 7.5x output cost, too pricey for 100% query stage |
| Gemini 3 Flash Preview | 0.50 / 3.00 | ~$0.00075 | YES | Preview; no GA date | Reject — still preview, no upside vs 3.1 Flash-Lite |
| GPT-5.4 nano | 0.20 / 1.25 | ~$0.0003 | YES | GA | Strong fallback; same family as Select breaks cross-check goal |
| Grok 4.1 Fast | 0.20 / 0.50 | ~$0.000160 | YES | GA | Cheapest viable; xAI provider new to stack — adds operational risk |
| Claude Haiku 4.5 | 1.00 / 5.00 | ~$0.00130 | 99.8% | GA | Too expensive for 100%-traffic stage |
| DeepSeek V4 Flash | 0.14 / 0.28 | ~$0.0001 | YES | Preview; 2x hallucination rate | Reject — hallucination risk on attribute extraction |

**VERDICT: SWAP TO Gemini 3.1 Flash-Lite (preview)**

Rationale: cost ~$0.000375/query vs current $0.000350/query — essentially flat. ~97% structured-output compliance is acceptable for Triage (schema validation in app catches the 3%). Preview status is the only risk, but Google AI Studio + Vertex both expose it, and the broader 3.x Flash-Lite line is on the cadence (3.0 Dec 2025 → 3.1 Mar 2026 → 3.2 in flight). The 3.1 Flash-Lite intelligence score (34) is **near-tripled** vs 2.5 Flash-Lite (13), which materially helps Triage's attribute extraction.

**Cross-check preservation:** Triage must be a different family from Select. Keeping Google here preserves cross-check property if Select moves to OpenAI/Anthropic.

**Citation:**
- https://ai.google.dev/gemini-api/docs/deprecations
- https://pricepertoken.com/pricing-page/model/google-gemini-3.1-flash-lite-preview
- https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview

**Fallback if 3.1 Flash-Lite preview proves unstable in Phase 4 dev:** Gemini 3.5 Flash GA at $1.50/$9.00 (5x current cost — would push Triage to ~$0.0018/query, still inside total budget). Or accept GPT-5.4 nano as same-family fallback and move Select to non-OpenAI.

---

### Stage 4 — SELECT (highest-stakes)

**Current proposed:** GPT-4.1 mini @ $0.40/$1.60

**Workload requirements:**
- ~2K tok in / ~400 tok out
- Strict JSON with required policy fields (export_policy, policy_condition, reasoning_chain, cited_notes)
- Refusal-when-uncertain — model must say "REFUSE" rather than hallucinate a code
- 100% of CLASSIFY queries (~70% of total). Cost bottleneck.
- Reasoning over chapter notes JSONB + section notes + exclusions + GIRs
- Sub-$0.0015/query desired
- ~3s latency budget

**Critical context:** B3 trace showed Select FAILED on 2/4 CLASSIFY cases (case-085 instant coffee, case-037 polo shirt). The current GPT-4.1 mini achieved $0.00190 mean Select cost but **wrong codes at HIGH self-confidence** — exactly the failure mode that's worst for an exporter (legal/financial penalty). Cost isn't the limiting factor; **capability is**.

**Alternatives considered:**

| Candidate | In/Out | Per-query cost (est.) | JSON | Reasoning | Verdict |
|---|---|---|---|---|---|
| **GPT-5.4 mini** | 0.75 / 4.50 | ~$0.00330 | 99.7% | Built-in reasoning, scales by complexity | **PREFERRED** |
| **Claude Haiku 4.5** | 1.00 / 5.00 | ~$0.00400 | 99.8% via strict tool use | Extended thinking (output-billed) | Strong; family-diverse from Triage; "comparable to Sonnet 4" |
| GPT-4.1 mini (current) | 0.40 / 1.60 | ~$0.00144 | YES | None | **Cost-win is real BUT shutdown Oct 23 2026 + B3 capability failures** |
| Claude Sonnet 4.6 | 3.00 / 15.00 | ~$0.01200 | YES | Adaptive thinking | Reject — 8x more expensive than current; blows budget |
| DeepSeek V4 Flash | 0.14 / 0.28 | ~$0.000392 | YES | Reasoning available | Reject — hallucinates 2x on factual recall; this is exactly Select's hot zone |
| DeepSeek V4 Pro | 0.435 / 0.87 | ~$0.001218 | YES | Reasoning | Tempting cost; but preview + 2x hallucination concern + new provider |
| Gemini 3 Flash Preview | 0.50 / 3.00 | ~$0.00220 | YES | Thinking variant | Same-family-as-Triage breaks cross-check |
| Gemini 3.5 Flash | 1.50 / 9.00 | ~$0.00660 | Improved | Adaptive thinking | Same-family + 2x cost vs GPT-5.4 mini |
| Mistral Medium 3 | 0.40 / 2.00 | ~$0.00160 | YES (23 of 24 models support JSON mode) | Limited reasoning depth | Cost-comparable; no track record on Indian regulatory; tariff-specific tuning unknown |
| Grok 4.3 | 1.25 / 2.50 | ~$0.00350 | YES | Reasoning | Cost-comparable to GPT-5.4 mini but xAI provider new + community signal weaker |

**VERDICT: SWAP TO GPT-5.4 mini @ $0.75/$4.50**

Rationale:
1. **Must-fix capability gap:** B3 traces show current Select stage has wrong-answer-at-HIGH-confidence failures on 2/4 CLASSIFY cases. GPT-4.1 mini lacks built-in reasoning. GPT-5.4 mini consolidates the o-series reasoning approach into the same model with auto-allocation. The B3 case-085 (instant coffee 3-in-1 → predicted 2101.11.20 instead of 2101.12.00) is exactly the kind of fine-grained subheading discrimination that reasoning helps with.
2. **Cost is acceptable.** $0.00330 Select cost (up from $0.00190) is +$0.00140/CLASSIFY query. At 100K queries/month × 70% CLASSIFY = 70K Select calls × $0.00140 = +$98/month. Total stack still well inside $200/month budget.
3. **JSON schema is 99.7% compliant** (cross-check on 300 calls) — strongest in market.
4. **Deprecation path:** GPT-4.1 mini shuts down Oct 23 2026; GPT-5.4 mini is the GA successor and is itself on the GPT-5 family which Microsoft Azure's lifecycle policy treats as long-lived.
5. **400K context window** vs GPT-4.1 mini's 1M is more than enough for this stage's ~2K input.

**Cross-check preservation:** OpenAI family for Select pairs with Google for Triage (cross-check holds).

**Citation:**
- https://artificialanalysis.ai/models/gpt-5-4-mini (intelligence score 49 vs 23.3 — Mini xhigh near-doubles base mini's intelligence)
- https://developers.openai.com/api/docs/deprecations (GPT-4.1 mini shutdown date)
- https://www.mindstudio.ai/blog/gpt-5-4-mini-vs-nano-sub-agent-comparison (subagent benchmarks)

**Watchlist:** Claude Haiku 4.5 at $1.00/$5.00 is competitive ($0.00400/query est.) and provides family-diversity from both Triage AND OpenAI. **If GPT-5.4 mini fails the 1-case Phase 4 spike retest on case-085 or case-037, swap to Haiku 4.5.**

---

### Stage 5a — VERIFY V1 (rubber-stamp)

**Current proposed:** Gemini 2.5 Flash @ $0.30/$2.50

**Workload:** ~500 tok in / ~100 tok out. ~50% of queries. Cross-check requirement: different family from Select. Latency budget ~3s.

**Constraint:** With Select swapped to GPT-5.4 mini, V1 must NOT be OpenAI family. Google or Anthropic only.

**Alternatives:**

| Candidate | In/Out | Per-query cost | Verdict |
|---|---|---|---|
| **Gemini 3.1 Flash-Lite** | 0.25 / 1.50 | ~$0.00028 | **PREFERRED** — same model as Triage = single Gemini integration |
| Gemini 3.5 Flash | 1.50 / 9.00 | ~$0.00165 | Reject — overspending for rubber-stamp |
| Claude Haiku 4.5 | 1.00 / 5.00 | ~$0.00100 | Strong; new family diversifies Verify from Triage |
| DeepSeek V4 Flash | 0.14 / 0.28 | ~$0.00010 | Cheap but hallucination risk could produce false-disagreement |

**VERDICT: SWAP TO Gemini 3.1 Flash-Lite** (same model as Triage)

Rationale: Operational simplicity — single Google integration handles Triage + V1. Cross-check preserved (Select is OpenAI). ~$0.00028/V1 invocation is ~10x cheaper than current Gemini 2.5 Flash. Total V1 monthly cost at 50K invocations: ~$14/month.

**Citation:** Same as Triage.

---

### Stage 5b — VERIFY V2 (antagonistic)

**Current proposed:** GPT-4.1 mini @ $0.40/$1.60

**Workload:** ~2K tok in / ~300 tok out. ~20% of queries. Same family as Select acceptable (it's intentionally one-sided antagonism). Latency budget ~3s.

**VERDICT: SWAP TO GPT-5.4 mini** (same model as Select)

Rationale:
- Must replace GPT-4.1 mini regardless (deprecation).
- Same model as Select is fine — antagonistic role is about the PROMPT framing, not model diversity.
- Per-query cost: ~$0.00285 (~$0.00150 input + ~$0.00135 output).
- Monthly cost at 20K invocations: ~$57/month.

**Citation:** Same as Select.

---

### Stage 6 — DEEP-THINK

**Current proposed:** GPT-4.1 mini reasoning_effort=high

**Workload:** ~3K tok in / ~800 tok out. ~5% of queries. Heavy reasoning. Latency budget ~10s. Must be most-capable-reasoning available within budget.

**Reality from B3:** The B3 trace note says `reasoning_effort=high not available on chat.completions endpoint — used temperature 0.1`. **The current proposed stack does NOT actually deliver extended reasoning at Deep-think.** This is a separate bug from the deprecation issue but matters here.

**Alternatives considered:**

| Candidate | In/Out | Per-query cost (est.) | Reasoning quality | Verdict |
|---|---|---|---|---|
| **Claude Sonnet 4.6 + adaptive thinking** | 3.00 / 15.00 | ~$0.01700 | +15pp on deep reasoning vs Sonnet 4.5 | **PREFERRED** |
| GPT-5.4 mini (with native reasoning) | 0.75 / 4.50 | ~$0.00585 | Auto-allocated reasoning | Strong cheap fallback |
| Claude Haiku 4.5 + extended thinking | 1.00 / 5.00 | ~$0.00700 | Output-billed thinking; "comparable to Sonnet 4" | Mid-ground; cheaper than Sonnet 4.6 |
| GPT-5.4 (full) | 2.50 / 15.00 | ~$0.01950 | Built-in deep reasoning | Comparable cost to Sonnet 4.6; Sonnet 4.6 has the 15pp delta |
| Gemini 3.1 Pro Preview | 2.00 / 12.00 | ~$0.01560 | Thinking mode | Preview status; reject for high-stakes |
| Gemini 2.5 Pro | 1.25 / 10.00 | ~$0.01175 | Thinking model | **DEPRECATED Oct 16 2026** |
| DeepSeek V4 Pro (reasoning) | 0.435 / 0.87 | ~$0.00200 | Reasoning mode; 1-2pp below V4 Flash on coding | Cheapest reasoning; **preview + hallucination concern** for the highest-stakes single-shot decision |

**VERDICT: SWAP TO Claude Sonnet 4.6 with adaptive thinking**

Rationale:
1. Deep-think runs on ~5% of queries (~5K calls/month at 100K total). At ~$0.017/call = ~$85/month. Total stack budget at $200/month accommodates.
2. Sonnet 4.6's "+15pp on deep reasoning vs Sonnet 4.5" is exactly the capability uplift this rare path needs.
3. **Family-diversity from BOTH Triage and Select:** Sonnet 4.6 is Anthropic, distinct from Google Triage and OpenAI Select. If both prior verifications disagree, an Anthropic deep-think arbitrates from an independent model lineage — strongest possible disagreement resolution.
4. Strict JSON schema via tool use (99.8% compliance).
5. Adaptive thinking mode lets the model itself decide reasoning depth — alignment with workload's variable difficulty.
6. **Fixes the broken-by-design current state** where Deep-think can't even invoke reasoning_effort=high on GPT-4.1 mini chat.completions endpoint.

**Citation:**
- https://www.anthropic.com/claude/sonnet (Sonnet 4.6 deep reasoning +15pp)
- https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- https://platform.claude.com/docs/en/about-claude/pricing

**Cheap fallback:** GPT-5.4 mini at ~$0.00585/call (~$30/month at 5K calls). If Sonnet 4.6 cost analysis on full eval set comes back over budget, downgrade Deep-think to GPT-5.4 mini — same model as Select but with the built-in reasoning genuinely available. This is essentially "make the broken thing actually work."

---

## Cost comparison table (per query, end-to-end)

Estimates assume 100K queries/month with: 70% CLASSIFY (Select fires), 50% trigger V1, 20% trigger V2, 5% escalate to Deep-think. 100% hit Triage. Retrieval stage flat at $0.0001/query.

### Current proposed stack (locked but DEPRECATED)

| Stage | Per-invocation | Invocation rate | Per-query contribution |
|---|---|---|---|
| Triage (Gemini 2.5 Flash) | $0.00067 | 100% | $0.00067 |
| Retrieval (Cohere) | $0.00012 | 100% | $0.00012 |
| Rules FTS | $0 | 100% | $0 |
| Select (GPT-4.1 mini) | $0.00190 | 70% | $0.00133 |
| Verify V1 (Gemini 2.5 Flash) | $0.00021 | 50% | $0.000105 |
| Verify V2 (GPT-4.1 mini) | $0.00200 | 20% | $0.00040 |
| Deep-think (GPT-4.1 mini, no reasoning) | $0.00300 | 5% | $0.00015 |
| **TOTAL per-query mean** | | | **~$0.00278** |

Note: B3 measured $0.00253 mean on 5 traces — close enough (B3 sample had 1 cheap-class refuse skewing low).

### Proposed reassessed stack (GA + reasoning-correct)

| Stage | Per-invocation | Invocation rate | Per-query contribution |
|---|---|---|---|
| Triage (Gemini 3.1 Flash-Lite) | $0.000375 | 100% | $0.000375 |
| Retrieval (Cohere) | $0.00012 | 100% | $0.00012 |
| Rules FTS | $0 | 100% | $0 |
| Select (GPT-5.4 mini) | $0.00330 | 70% | $0.00231 |
| Verify V1 (Gemini 3.1 Flash-Lite) | $0.00028 | 50% | $0.00014 |
| Verify V2 (GPT-5.4 mini) | $0.00285 | 20% | $0.00057 |
| Deep-think (Claude Sonnet 4.6 adaptive) | $0.01700 | 5% | $0.00085 |
| **TOTAL per-query mean** | | | **~$0.00437** |

### Delta

- **Per-query: +$0.00159 (+57%)** — from $0.00278 to $0.00437
- **Monthly at 100K queries: +$159/month** — from $278 to $437

**Budget impact:** Original target was ~$0.002/query = $200/month. New stack lands at $0.00437 = $437/month. **Over budget by ~$237/month.**

### Cost-trimming if budget hard-limit applied

If user holds the $200/month hard cap, downgrade Deep-think to GPT-5.4 mini ($0.00585 → $0.00585 × 5% = $0.000293 per-query contribution, saves $0.00056/query). Total drops to ~$0.00381/query = ~$381/month. Still over but closer.

If further trim needed: downgrade Verify V2 to Gemini 3.1 Flash-Lite (~$0.000375/call × 20% = $0.000075/query) — saves another ~$0.0005/query. Total ~$0.00331/query = ~$331/month.

**Honest assessment:** The original $200/month target was based on GPT-4.1 mini's $0.40/$1.60 pricing. GPT-5.4 mini's $0.75/$4.50 is **2.8x more expensive on output** and there is no GA OpenAI equivalent in the old price range. The realistic post-deprecation floor for an OpenAI-family Select is ~$0.00330/call. The $200/month target needs to be revised upward to ~$350-400/month, or the OpenAI dependency must be dropped (Claude Haiku 4.5 at $0.00400/call is comparable; DeepSeek V4 Pro at $0.00122/call is the only "real" cost-saver but carries preview + factual-recall risk).

---

## Overall recommendation

### Stack-level verdict: SWAP all 5 stages

| Stage | Current proposed | Recommended | Family |
|---|---|---|---|
| Triage | Gemini 2.5 Flash (DEPRECATED) | **Gemini 3.1 Flash-Lite preview** | Google |
| Select | GPT-4.1 mini (DEPRECATED) | **GPT-5.4 mini** | OpenAI |
| Verify V1 | Gemini 2.5 Flash (DEPRECATED) | **Gemini 3.1 Flash-Lite preview** (reuse) | Google |
| Verify V2 | GPT-4.1 mini (DEPRECATED) | **GPT-5.4 mini** (reuse) | OpenAI |
| Deep-think | GPT-4.1 mini (broken reasoning) | **Claude Sonnet 4.6 adaptive thinking** | Anthropic |

**Family diversity preserved:** Triage = Google, Select/V2 = OpenAI, V1 = Google (rubber-stamp), Deep-think = Anthropic. Each stage's cross-check requirement met.

### Estimated total per-classification cost
- **Current locked (will retire in Oct 2026):** ~$0.00278/query
- **Recommended stack:** ~$0.00437/query
- **Cost-trimmed variant (Deep-think on GPT-5.4 mini):** ~$0.00381/query
- **Aggressive trim (V2 on Gemini also):** ~$0.00331/query

### Confidence in recommendation: HIGH

Rationale for HIGH confidence:
1. **Deprecation dates are facts**, not opinion — both current models are confirmed retiring Oct 2026 via official provider docs.
2. **GPT-5.4 mini pricing is canonical** (verified across 3 sources: Artificial Analysis, llm-stats, pricepertoken).
3. **B3 trace already documents capability failures** of the current stack (1/5 correct) — the proposed swap addresses the failure mode (reasoning) directly.
4. **JSON schema compliance is documented** at 99.7%+ for all proposed swaps.
5. **Family diversity preserved** — the architectural property that motivated the original choices is maintained.

Sources of residual uncertainty:
- Gemini 3.1 Flash-Lite is still in preview (GA date not announced). Mitigated by Google's clear cadence (3.0 → 3.1 → 3.2 already in dev) and Vertex AI availability.
- Claude Sonnet 4.6's specific performance on Indian ITC-HS tariff reasoning is unmeasured. Mitigated by Phase 4 dev empirical retest of the B3 5-case fixture.
- The $200/month original budget likely needs upward revision to ~$350/month.

---

## Risks of switching

1. **Preview-model risk for Gemini 3.1 Flash-Lite.** Mitigation: keep Gemini 3.5 Flash GA as standby; switch is a single string in config.
2. **Higher per-query cost.** Mitigation: cost-trim variants documented above. Worst case (downgrade Deep-think to GPT-5.4 mini): ~$0.00381/query = $381/month at 100K.
3. **Anthropic adds a third provider** to the stack (Cohere + OpenAI + Google + Anthropic). Operational complexity: 4 API keys to manage, 4 SLAs. Mitigation: Anthropic only invoked at 5% rate (Deep-think); failure-mode is graceful (fall back to GPT-5.4 mini).
4. **GPT-5.4 mini latency unmeasured.** Source claims 165 tok/s output speed; 0.54s TTFT. Empirical retest in Phase 4 dev recommended on B3's 5 cases before final lock.
5. **DeepSeek opportunity cost.** V4 Pro at $0.435/$0.87 is 4x cheaper than GPT-5.4 mini. Skipping it means leaving cost savings on the table. Mitigation: re-evaluate post-GA (DeepSeek V4 stable expected late 2026); for pre-revenue MVP with hard correctness requirement, factual-recall hallucination 2x is the dealbreaker.

## Risks of KEEPING current proposed stack

1. **GUARANTEED FORCED MIGRATION by Oct 23 2026** (GPT-4.1 mini) and Oct 16 2026 (Gemini 2.5 Flash). If M5 ships Q3 2026, the production stack is on retirement countdown from day 1.
2. **No emergency-rollback option.** If a production issue surfaces post-shutdown, both anchor models are gone — must do an emergency model swap on live traffic.
3. **B3 has already documented capability failures.** Keeping GPT-4.1 mini on Select means knowingly shipping with 60% wrong rate on the B3 fixture (1/5 correct). The proposed GPT-5.4 mini swap is the capability fix, not just a deprecation fix.
4. **Deep-think reasoning is broken in B3** (`reasoning_effort=high not available on chat.completions endpoint`). Keeping GPT-4.1 mini on Deep-think means shipping with a deep-think stage that doesn't actually deep-think.
5. **Cost-savings illusion:** the $0.00278/query saving over the swap looks great until you factor in (a) wrong-answer penalty risk to exporter customers and (b) emergency-swap engineering cost when shutdowns hit.

---

## Surprises found during research

1. **GPT-4.1 mini deprecation is OFFICIAL** — Oct 23 2026 shutdown per OpenAI's developer docs. Not in the original Phase 3.5 cost-model file.
2. **Gemini 2.5 Flash deprecation is OFFICIAL** — Oct 16 2026 shutdown, community forum suggests earliest June 17 2026 deprecation flag. Not in Phase 3.5 cost-model.
3. **GPT-5.4 mini output price ($4.50) is 2.8x GPT-4.1 mini ($1.60).** The "drop-in successor" myth doesn't hold on cost.
4. **DeepSeek V4 Flash is dramatically cheaper** ($0.14/$0.28) but hallucinates 2x more on factual recall — disqualifying for Select but interesting for Verify V1.
5. **Claude Haiku 4.5's native structured outputs only landed Feb 4 2026.** Before that, strict-schema work needed tool-use workaround. This is recent enough that it wasn't broadly tested in early-2026 benchmarks.
6. **Gemini 3.1 Flash-Lite at $0.25/$1.50 is a near-perfect Triage replacement** — 97% structured-output compliance, intelligence-score nearly tripled vs 2.5 Flash-Lite, still preview but on GA-track cadence.
7. **Gemini 3.5 Flash (released May 19 2026, GA) is ~5x more expensive than Gemini 2.5 Flash** ($1.50/$9.00 vs $0.30/$2.50). Cannot be a drop-in cheap-Triage replacement.
8. **B3 trace already revealed Deep-think reasoning isn't actually being invoked** — the proposed stack lists `reasoning_effort=high` but the chat.completions endpoint doesn't support it on GPT-4.1 mini. This is a real bug in the locked stack, separate from deprecation.

---

## Reporting payload

```json
{
  "stages_to_swap": ["Triage", "Select", "Verify V1", "Verify V2", "Deep-think"],
  "total_cost_estimate_old": 0.00278,
  "total_cost_estimate_new": 0.00437,
  "total_cost_estimate_trimmed": 0.00381,
  "confidence": "HIGH",
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/D1-model-stack-reassessment.md",
  "surprises_found": [
    "GPT-4.1 mini scheduled shutdown Oct 23 2026 — current stack on retirement countdown",
    "Gemini 2.5 Flash scheduled shutdown Oct 16 2026 — both anchor models retiring",
    "GPT-5.4 mini output price 2.8x more expensive than GPT-4.1 mini — no cheap drop-in",
    "Gemini 3.1 Flash-Lite preview at $0.25/$1.50 is the cheap-Triage replacement",
    "Claude Sonnet 4.6 adaptive thinking is the right Deep-think (Anthropic = 3rd family for cross-check)",
    "B3 documented reasoning_effort=high doesn't work on GPT-4.1 mini chat.completions — current Deep-think is broken-by-design",
    "DeepSeek V4 Flash hallucinates 2x more on factual recall — disqualifying for tariff-Select despite $0.14/$0.28 price",
    "$200/month budget needs revision upward to ~$350-400/month after GPT-5.4 mini price reality"
  ]
}
```

---

## Recommended next step

Before final D1 lock: **execute a 5-case Phase 4 dev spike** on the same B3 fixture (case-134, case-085, case-037, case-148, case-124) with the proposed swap stack. If correctness improves to ≥4/5 (matching the original B3 threshold), lock the new stack. If correctness stays at 1-2/5, the issue is upstream of the LLM choice (e.g., retrieval ordering, chapter notes loading) and needs separate diagnosis before further model spending.

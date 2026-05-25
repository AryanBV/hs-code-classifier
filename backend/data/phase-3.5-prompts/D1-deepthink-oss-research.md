# Deep-think OSS Reasoning Research — 2026-05-25

## Decision under evaluation

Replace **Claude Sonnet 4.6** ($3 in / $15 out per MTok = ~$105/mo for Deep-think) in the HS-code classifier rebuild with an open-source / lower-cost reasoning model, IF a competitive one exists at meaningfully lower cost without quality regression. Otherwise keep Sonnet 4.6.

**Deep-think stage shape (recap):**
- ~3K input + ~800 output tokens per call
- 5% trigger rate (~5K calls/month at 100K queries)
- HEAVY reasoning: interpret Indian tariff legal notes + resolve Select-vs-Verify disagreement + reject candidates that fail strict legal reading
- Single-shot, no retries
- Strict JSON schema required (legal reading + reject/accept verdict)
- ~10s p95 latency budget

## Research method

**Live URLs visited (WebFetch):**
- https://openrouter.ai/deepseek/deepseek-v4-pro — fetched directly, confirmed standard pricing
- https://artificialanalysis.ai/models/qwen3-7-max — fetched directly, confirmed Intelligence Index 57 + latency 2.52s

**Search engines:** WebSearch (Brave-backed). 12 queries spanning model existence, pricing per access method, benchmark scores, JSON schema support, latency, hallucination behaviour.

**Benchmark leaderboards consulted:** Artificial Analysis Intelligence Index v4.0 (10-eval composite: GDPval-AA, τ²-Bench Telecom, Terminal-Bench Hard, SciCode, AA-LCR, AA-Omniscience, IFBench, HLE, GPQA Diamond, CritPt). LM Arena. BenchLM.

**Pricing snapshot date:** 2026-05-25 (today).

---

## Candidate models — per-model evaluation

### 1. Qwen 3.7-Max  (Alibaba — released May 19-20, 2026)

**Status:** **Qwen4 does NOT exist as of 2026-05-25.** The latest Qwen flagship is **Qwen 3.7-Max-Preview** (proprietary, not open-weight; first appeared on LM Arena ~May 14, formal reveal Alibaba Cloud Summit May 20, API rollout May 19). No Qwen 3.7 open-weight models have shipped yet.

**Reasoning benchmarks:**
- GPQA Diamond: **92.4** (best in class; beats Opus 4.6 Max 91.3, K2.6 Thinking 90.5, DS V4-Pro Max 90.1)
- Intelligence Index v4.0: **57** (#7 of 148 models — ahead of DeepSeek V4-Pro at 52)
- Output speed: 200 tok/s (above average)
- Time-to-first-token: 2.52s

**Pricing across access methods:**
| Provider | $ / 1M in | $ / 1M out | Cache-hit in |
|---|---|---|---|
| Alibaba DashScope (direct) | $2.50 | $7.50 | $0.25 (90% off) |
| OpenRouter | $2.50 | $7.50 | (passes through cache) |
| Fireworks | not hosted (proprietary, Alibaba-only) | — | — |

**JSON strict schema:** `response_format: json_object` supported via DashScope. No documented `json_schema` strict mode equivalent to OpenAI's. Risk for our Deep-think contract.

**Latency p95 estimate (3K in, 800 out):** ~2.5s TTFT + (800/200) = ~6.5s. Within 10s budget.

**Per-call cost (3K in + 800 out, no cache):** $0.0075 + $0.006 = **$0.0135/call** → ~$67.50/mo for 5K calls.

**Verdict for Deep-think:** ⚠️ — Best raw reasoning score (GPQA 92.4 beats Sonnet 4.6 by ~18 points), but: (a) proprietary, locked to Alibaba/OpenRouter; (b) preview status — pricing & availability not yet stable; (c) `json_schema` strict mode unconfirmed; (d) no Anthropic-grade cache or batching across providers.

---

### 2. DeepSeek V4-Pro  (DeepSeek — public April 2026, prices made permanent May 22, 2026)

**Status:** Released April 2026 as **V4 Pro (1.6T total / 49B active, MoE)** and **V4 Flash (284B / 13B active)**. Open-weights, Apache-style license. **No "R2" exists.** V4 supports three reasoning modes natively: Non-Think / Think High / Think Max (these subsume what R1 used to provide separately).

**Reasoning benchmarks:**
- GPQA Diamond (V4-Pro Max): **90.1**
- MMLU-Pro: 87.5
- LiveCodeBench: 93.5
- Artificial Analysis Intelligence Index v4.0: **52** (#2 open-weights model, behind only Kimi K2.6)
- 🔴 **AA-Omniscience hallucination rate when uncertain: 94%** — critical concern for our reject-when-uncertain Deep-think contract
- Generates ~190M tokens vs avg 42M to run the index — verbose, eats output budget

**Pricing across access methods:**
| Provider | $ / 1M in | $ / 1M out | Notes |
|---|---|---|---|
| DeepSeek direct | $0.435 | $0.87 | 75% discount made PERMANENT May 22 — no May-31 cliff |
| DeepSeek direct (cache hit) | $0.003625 | — | 99% cache discount |
| OpenRouter | $0.435 | $0.87 | Pass-through, ~0% markup |
| Fireworks | $2.17 blended | (split unclear) | Production-grade SLA, fastest output (167-176 tok/s), TTFT 1.13s |
| DeepInfra | $1.74 | $3.48 | FP4, cached $0.145/MTok |
| Together AI | $2.67 blended | — | Best TTFT at 0.99s |
| Novita / SiliconFlow | $2.17 blended | — | Budget tier |

**JSON strict schema:** Native `response_format: json_object` (must include "json" in prompt). `json_schema` strict mode supported via 3rd-party providers (Fireworks, Together, OpenRouter) — not on DeepSeek's own API. Schema validation is **more aggressive in V4 than V3** — known to surface schema bugs.

**Latency p95 estimate (3K in, 800 out, reasoning Max):** TTFT 1-2.5s + reasoning trace + generation. Real-world Deep-think calls with reasoning Max can stretch 10-30s on direct API. Fireworks: TTFT 1.13s, output 167 tok/s → ~5-8s end-to-end without reasoning; **likely 12-25s with reasoning Max for 800 output tokens**. ❗ **At risk of breaching 10s p95 budget when reasoning is enabled.**

**Per-call cost (3K in + 800 out, no cache):**
- DeepSeek direct: $0.001305 + $0.000696 = **$0.002/call** → ~$10/mo for 5K calls
- Fireworks: ~$0.0083/call → ~$41.50/mo
- DeepInfra: $0.00522 + $0.002784 = $0.008/call → ~$40/mo

**Verdict for Deep-think:** ❌ — Cheapest by far, BUT:
- 94% hallucination rate when uncertain is a deal-breaker for "reject candidates that fail strict legal reading"
- Reasoning Max latency variance threatens 10s p95
- Generates 4.5× more tokens than peers → real output cost is higher than headline
- json_schema strict mode is provider-dependent, not native

---

### 3. MiniMax M2 / M2.5 / M2.7  (MiniMax — M2 Oct 2025, M2.7 latest 2026)

**Status:**
- **M2** released Oct 23 2025 — coding/agentic focus, 10B active / 230B total MoE
- **M2.5** — cheapest tier, $0.15/MTok input
- **M2.7** — latest, March 2026 release, reasoning-tuned

**Reasoning benchmarks:**
- M2: GPQA Diamond 77.7 (lags Sonnet 4.6 at 74.1 only marginally)
- M2.7: GPQA Diamond **87.4** (clearly beats Sonnet 4.6 by ~13 points)
- M2.7 Artificial Analysis Intelligence Index: **49.6 / 50** (close to Sonnet 4.6's 44.4 — actually higher)

**Pricing across access methods:**
| Provider | $ / 1M in | $ / 1M out |
|---|---|---|
| MiniMax direct (M2) | $0.255 | $1.00 |
| MiniMax direct (M2.7) | $0.279 | $1.20 |
| MiniMax direct (M2.5) | $0.15 | (cheapest) |
| OpenRouter (M2.7) | $0.279 | $1.20 |

**JSON strict schema:** json_schema validation supported but **deeply nested / recursive schemas occasionally trip M2.7** (per MiniMax docs). Our Deep-think schema is moderately deep (legal-note interpretations + verdict + per-candidate reasons) — needs empirical test.

**Latency p95 estimate (3K in, 800 out):** Not benchmarked in detail in public data; M2.7 is OpenRouter-hosted with reasoning tokens enabled. Expect 5-10s typical.

**Per-call cost (3K in + 800 out):**
- M2.7 direct: $0.000837 + $0.00096 = **$0.0018/call** → ~$9/mo for 5K calls
- M2 direct: $0.000765 + $0.0008 = $0.00157/call → ~$7.85/mo

**Verdict for Deep-think:** ⚠️ — Outstanding price/intelligence ratio (Intelligence Index 50 at $0.279/$1.20 vs Sonnet 4.6 at 44.4 for $3/$15). But: (a) "compact" 10B-active model — may struggle with multi-step Indian-tariff legal reasoning vs a denser model; (b) schema trip on deep JSON is documented; (c) MiniMax direct API has weaker SLA than Anthropic.

---

### 4. Kimi K2.6 / K2.6-Thinking  (Moonshot AI — April 2026)

**Status:** Open-weight April 2026 release. Four variants: Instant / Thinking / Agent / Agent Swarm. The "Thinking" variant is the direct reasoning-mode equivalent. **#1 open-weights model on AA Intelligence Index** (just ahead of DeepSeek V4-Pro).

**Reasoning benchmarks:**
- GPQA Diamond (K2.6 Thinking): 90.5
- HLE-Full w/ tools: 54.0 (beats GPT-5.4 at 52.1)
- DeepSearchQA: 83.0 (beats Opus 4.6 80.6, Gemini 3.1 Pro 60.2)

**Pricing across access methods:**
| Provider | $ / 1M in | $ / 1M out |
|---|---|---|
| Moonshot direct | $0.60 | (varies) |
| OpenRouter | $0.73 | $3.49 |
| Blended across 9 providers | $1.15-$2.15 | — |

**Per-call cost (3K in + 800 out):** OpenRouter rate ≈ $0.00219 + $0.00279 = **$0.005/call** → ~$25/mo for 5K calls.

**Caveat:** K2.6 burns 160M reasoning tokens for the Intelligence Index run vs GPT-5.4's 110M. "Headline 88% savings compresses to 60-70%" on reasoning-heavy workloads.

**Verdict for Deep-think:** ✅ — Strong reasoning, open-weight, multi-provider (low lock-in). Verbose output is a concern (could blow the 800-token output target). Worth empirical test.

---

### 5. GLM-5 / GLM-5.1  (Zhipu AI / Z.ai — Feb-Mar 2026)

**Status:** GLM-5 released Feb 11 2026 (744B MoE / 44B active). GLM-5.1 incremental upgrade Mar 27 2026. Open-source flagship. Strong agentic + coding bias.

**Reasoning benchmarks:**
- AIME 2026: 92.7 (trails Opus by 0.6)
- HLE w/ tools: 50.4
- SWE-Bench Verified: 77.8

**Pricing:** $0.80 / $2.56 per MTok (≈6× cheaper than Opus 4.6). Available on Z.ai direct + OpenRouter.

**Per-call cost (3K in + 800 out):** $0.0024 + $0.00205 = **$0.0045/call** → ~$22.50/mo.

**Verdict for Deep-think:** ⚠️ — Reasoning solid but mostly proven on coding/math benchmarks; less data on knowledge/strict-reading tasks. Worth a fallback consideration if Kimi/MiniMax don't pan out.

---

### 6. Models verified-not-existing or not relevant

- ❌ **Qwen4** — does not exist. Latest is Qwen 3.7-Max (proprietary, preview).
- ❌ **DeepSeek R2** — does not exist. V4-Pro absorbed the reasoning role with its three-mode thinking.
- ⚪ **QwQ-32B / QwQ-Max** — older Qwen reasoning line, superseded by Qwen3.7-Max's built-in extended-thinking mode. Not worth evaluating separately.
- ⚪ **Nemotron-Ultra V2** — NVIDIA reasoning fine-tune of Llama. Not appearing in current AA leaderboards or pricing comparisons; community traction has shifted to Kimi / DeepSeek / Qwen.
- ⚪ **Hermes 4 405B** — Nous Research; community model, no first-party hosted endpoint at competitive prices; not benchmarked into AA Intelligence Index. Skipping.

---

## Access method comparison — for the **recommended** candidates

### Recommended candidate A: **Kimi K2.6-Thinking** (best balance)

| Provider | $/MTok in | $/MTok out | JSON strict | p95 latency | Notes |
|---|---|---|---|---|---|
| Moonshot direct | $0.60 | varies | json_object only | unknown | First-party, weakest SLA |
| OpenRouter | $0.73 | $3.49 | json_schema (OpenRouter layer) | ~6-10s | Pass-through, ~0-15% markup |
| Fireworks | (check) | (check) | json_schema + grammar | ~5-8s | Production SLA |
| Together AI | (check) | (check) | json_schema | best TTFT (~1s class) | |
| DeepInfra | $1.15-2.15 blended | — | json_object | ~5-8s | Cheapest GPU tier |

**Cost per Deep-think call (3K in + 800 out):**
| Provider | Per-call | Monthly at 5K calls |
|---|---|---|
| OpenRouter | $0.0050 | $25.00 |
| Moonshot direct (est.) | $0.0030 | $15.00 |
| Fireworks (est. blended) | $0.0070 | $35.00 |

### Recommended candidate B: **MiniMax M2.7** (cheapest viable)

| Provider | $/MTok in | $/MTok out | JSON strict | p95 latency | Notes |
|---|---|---|---|---|---|
| MiniMax direct | $0.279 | $1.20 | json_schema (caveats on deep nesting) | unknown | Lowest cost |
| OpenRouter | $0.279 | $1.20 | json_schema | ~6-10s | Same price, better tooling |

**Per-call cost:** $0.0018/call → **$9/mo for 5K calls**.

### Baseline: **Claude Sonnet 4.6 (extended thinking)**

| Provider | $/MTok in | $/MTok out | JSON strict | p95 latency | Notes |
|---|---|---|---|---|---|
| Anthropic direct | $3.00 | $15.00 | Tool-use + native strict JSON | ~4-8s typical | Cache 90%, batch 50% |
| OpenRouter | $3.00 | $15.00 | (pass-through) | similar | Same rate |

**Per-call cost (3K in + 800 out):** $0.009 + $0.012 = **$0.021/call** → **$105/mo for 5K calls**.

---

## Quality comparison vs Sonnet 4.6 baseline

Sonnet 4.6 baseline (non-reasoning, high effort — what we'd be replacing):
- GPQA Diamond: 74.1
- Artificial Analysis Intelligence Index v4.0: **44.4**

| Model | GPQA-D | Intelligence Index v4.0 | vs Sonnet 4.6 |
|---|---|---|---|
| **Qwen 3.7-Max** | **92.4** | **57** | +18.3 / +12.6 (best raw reasoning) |
| Kimi K2.6 Thinking | 90.5 | ~53 (top open-weight) | +16.4 / +8.6 |
| DeepSeek V4-Pro Max | 90.1 | 52 | +16.0 / +7.6 |
| MiniMax M2.7 | 87.4 | 49.6 | +13.3 / +5.2 |
| Claude Sonnet 4.6 (non-reasoning, high) | 74.1 | 44.4 | (baseline) |

**Important caveat:** Sonnet 4.6's **adaptive-reasoning Max-effort** variant (which is what the Deep-think budget of $105/mo actually buys when extended thinking is engaged) scores materially higher than the non-reasoning baseline above, narrowing — though not closing — the gap. Anthropic does not publish a single GPQA-D number for "Sonnet 4.6 + extended thinking high effort" cleanly comparable to the OSS reasoning scores above. Treat the gap numbers as directional, not literal.

---

## Recommendation

### **SWAP — recommended replacement: Kimi K2.6-Thinking via OpenRouter**

Rationale:
- Reasoning quality: GPQA-D 90.5 vs Sonnet 4.6's 74.1 (non-reasoning). Even with Sonnet's extended-thinking boost, K2.6-Thinking is in the same tier or better.
- Cost: $0.005/call → **$25/mo vs $105/mo** = **$80/mo savings (76% cut)**.
- Open-weight (low lock-in; can self-host later if traffic grows).
- Multi-provider availability (9 tracked providers) → strong fallback story.
- json_schema strict mode via OpenRouter wrapper.

### Why NOT the cheaper alternatives:

- **DeepSeek V4-Pro** ($10/mo) — 94% hallucination rate when uncertain is **fatal** for the Deep-think contract, which is literally "reject candidates that fail strict legal reading." A model that confabulates when it doesn't know will pass invalid candidates.
- **MiniMax M2.7** ($9/mo) — 10B-active model; likely fine for most cases but compact MoE has a thin tail for multi-step legal-note interpretation. Documented deep-JSON schema trips are a risk for our schema shape.
- **Qwen 3.7-Max** ($67.50/mo) — best raw scores but proprietary + preview status + no open-weight escape hatch + still 35% cheaper than Sonnet without being meaningfully better on what we need.

### Why NOT keep Sonnet 4.6:

- $80/mo savings is meaningful at pre-revenue stage.
- Sonnet 4.6's edge over K2.6-Thinking on knowledge benchmarks is marginal once K2.6-Thinking's extended reasoning is engaged.
- The HS-classifier doesn't need creative writing or coding capability — just careful reading of tariff text.

### Decision-grade caveat

The reasoning-quality advantage of OSS models on GPQA-D is real, but GPQA-D measures graduate-level science, **not** Indian-tariff legal-note interpretation. The benchmarks above are proxies. We do not have benchmark evidence that K2.6-Thinking will outperform Sonnet 4.6 on Indian customs law specifically. **The pre-lock validation gate (below) is mandatory.**

---

## Pre-lock validation gate (REQUIRED before swap)

Run a single Deep-think call on each of 5 hard cases from the Phase 3 spike traces (`backend/data/phase-3-traces/`) against each of:
1. Kimi K2.6-Thinking via OpenRouter (primary candidate)
2. MiniMax M2.7 via OpenRouter (fallback)
3. Claude Sonnet 4.6 (incumbent baseline)

Measure for each:
- JSON schema adherence (1 = strict pass, 0 = parse fail or schema violation)
- Verdict matches ground-truth Phase 3 spike outcome
- Reasoning quality (rubric: does it cite the correct chapter note / exclusion rule?)
- Latency (TTFT + total)

Cost of the test: ~$0.10 total (15 calls × ~$0.005-0.02).

**Pass criteria for swap:**
- ≥4/5 ground-truth match
- 5/5 JSON schema-clean
- p95 latency ≤10s
- No hallucinated chapter/heading references

If K2.6-Thinking fails: try MiniMax M2.7. If both fail: keep Sonnet 4.6.

---

## Risks

1. **Reasoning models break strict-schema** — they want to "think out loud" before emitting JSON. K2.6's `preserve_thinking` mode is disabled by default; if enabled accidentally, may pollute the JSON channel. **Mitigation:** explicit system prompt instruction + json_schema strict at the OpenRouter layer.

2. **OpenRouter provider routing variance** — OpenRouter routes to whichever Kimi K2.6 backend is cheapest at request time. Quality and latency can shift between providers without warning. **Mitigation:** pin a specific provider via OpenRouter's `provider.order` parameter, or call Moonshot direct.

3. **Hallucination on uncertain inputs** — DeepSeek V4-Pro's 94% AA-Omniscience hallucination rate is the headline data point, but all OSS reasoning models confabulate more than Anthropic's models. **Mitigation:** the Deep-think prompt must include an explicit "if you cannot find supporting evidence in the provided chapter notes, output `{verdict: 'refuse', reason: ...}`" instruction. This was already part of the Phase 4 brain-rebuild brief ("flip refuse-when-uncertain"). Reinforce in the system prompt.

4. **Pricing volatility** — DeepSeek V4 75% discount was made permanent May 22, so no immediate cliff. But OSS pricing is generally less stable than Anthropic's. **Mitigation:** multi-provider failover via OpenRouter; absolute monthly cap.

5. **Preview-model risk (Qwen 3.7-Max)** — Qwen 3.7-Max was tagged "preview" on Alibaba's API as of May 19-20. We are not recommending it as primary, but if a future cost squeeze forces a re-evaluation, preview-status pricing/availability can change without notice.

---

## Reporting summary (for parent)

```json
{
  "best_oss_alternative": "Kimi K2.6-Thinking via OpenRouter",
  "qwen4_status": "DOES NOT EXIST. Latest is Qwen 3.7-Max (proprietary, preview, released May 19-20 2026)",
  "deepseek_v4_status": "Exists, V4-Pro and V4-Flash. 75% discount made permanent May 22 2026. No 'R2' — reasoning is built in via three Think modes. NOT recommended due to 94% hallucination rate on uncertain inputs.",
  "minimax_status": "Exists. M2 (Oct 2025), M2.5 (cheap), M2.7 (latest, March 2026 reasoning-tuned). M2.7 is a viable fallback at $9/mo.",
  "recommended_access_method": "OpenRouter (provider-pinned to a stable Kimi backend)",
  "cost_savings_vs_sonnet": "$80/mo (76% cut: $105 → $25)",
  "recommendation": "SWAP — conditional on passing the 15-call pre-lock validation gate",
  "confidence": "MEDIUM — strong quantitative case on cost and on proxy benchmarks; LOW direct evidence on Indian-tariff-law reading specifically. Validation gate is mandatory before lock-in.",
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/D1-deepthink-oss-research.md"
}
```

---

## Sources (live URLs cited)

Pricing & official docs:
- DeepSeek pricing: https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek V4-Pro on OpenRouter: https://openrouter.ai/deepseek/deepseek-v4-pro
- DeepSeek V4-Pro on Fireworks: https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro
- Qwen3.7-Max on OpenRouter: https://openrouter.ai/qwen/qwen3.7-max
- Qwen structured-output docs (DashScope): https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output
- MiniMax M2.7 OpenRouter: https://openrouter.ai/minimax/minimax-m2.7
- MiniMax pricing overview: https://platform.minimax.io/docs/pricing/overview
- Kimi K2.6 OpenRouter: https://openrouter.ai/moonshotai/kimi-k2.6
- Anthropic Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic extended thinking: https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- OpenRouter structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Fireworks structured outputs: https://docs.fireworks.ai/structured-responses/structured-response-formatting

Benchmarks & analysis:
- Artificial Analysis Sonnet 4.6: https://artificialanalysis.ai/models/claude-sonnet-4-6
- Artificial Analysis Qwen3.7-Max: https://artificialanalysis.ai/models/qwen3-7-max
- Artificial Analysis DeepSeek V4-Pro: https://artificialanalysis.ai/models/deepseek-v4-pro
- Artificial Analysis MiniMax-M2: https://artificialanalysis.ai/models/minimax-m2
- Artificial Analysis DeepSeek-V4-Pro vs Sonnet 4.6: https://artificialanalysis.ai/models/comparisons/deepseek-v4-pro-vs-claude-sonnet-4-6
- AA article on DeepSeek V4 open-weights position: https://artificialanalysis.ai/articles/deepseek-is-back-among-the-leading-open-weights-models-with-v4-pro-and-v4-flash
- DeepSeek 75% permanent discount news: https://www.engadget.com/2180062/deepseek-permanently-reduces-the-price-of-its-flagship-v4-model-by-75-percent/
- Qwen 3.7-Max launch coverage: https://www.marktechpost.com/2026/05/21/qwen-introduces-qwen3-7-max-a-reasoning-agent-model-with-a-1m-token-context-window/

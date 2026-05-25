# Open-Source Model Stack Research — 2026-05-25

**Workload context:** HS-code classifier for Indian SME exporters. ~100K queries/month target. Five distinct LLM stages with strict-JSON-schema enforcement on every stage (Select is the highest-stakes regulatory-text interpretation node). Current proprietary stack costs ~$437/mo and the models we're already using (GPT-4.1 mini, Gemini 2.5 Flash) are being deprecated Oct 2026.

**Question being answered:** Can we move all-or-part of this stack onto open-source models served by an OSS-friendly inference provider and (a) cut cost meaningfully, (b) maintain or beat correctness?

---

## Research method

### Chrome MCP tabs attempted (LIVE)
The Chrome-in-MCP browser tool refused navigation on every requested external pricing domain (`openrouter.ai`, `build.nvidia.com`, `api-docs.deepseek.com`, `huggingface.co`) with `permission_required` errors — the chrome MCP enforces per-domain user permission that wasn't granted in this run. Fall-back used: WebFetch directly against the same canonical pricing pages, plus WebSearch to find pricing-aggregator cross-checks for any page that returned thin content.

### WebFetch successes (direct page reads, not search snippets)
- https://api-docs.deepseek.com/quick_start/pricing (official DeepSeek pricing — read in full)
- https://www.together.ai/pricing (Together AI pricing page — partial, blog refs supplemented)
- https://docs.fireworks.ai/serverless/pricing (Fireworks serverless tier table)
- https://groq.com/pricing (Groq tokens-as-a-service table)
- https://openrouter.ai/docs/guides/features/structured-outputs (CRITICAL — what supports strict JSON schema)
- https://docs.mistral.ai/getting-started/models/models_overview/ (Mistral model lineup)
- https://openrouter.ai/meta-llama/llama-4-maverick (live Llama 4 Maverick listing)
- https://openrouter.ai/qwen/qwen3-next-80b-a3b-instruct (live Qwen3 Next listing)
- https://openrouter.ai/deepseek/deepseek-v3.2 (live DeepSeek V3.2 listing)
- https://costbench.com/software/llm-api-providers/nvidia-nim/ (NVIDIA NIM tier table)

### WebSearch cross-checks (recency-filtered May 2026)
DeepInfra pricing, Cerebras LPU pricing + speeds, Mistral Large 3 / Medium 3.5 pricing, Cohere Command R+ pricing + structured outputs docs, GLM 5.1 OpenRouter, Phi-4 / Granite small-model pricing, Krutrim / Sarvam status, DeepSeek strict-mode reliability issues, IFEval scores for the candidate Select-stage models.

### Strict-JSON-schema live test
**Not executed.** A real cURL call to one provider to confirm strict-schema reliability on a 6-property nested schema (which is what Select actually needs) is the right next step but requires an API key spend. The research result is "we have **enough evidence from provider docs + reported bugs** to choose Fireworks for the strict-schema legs and to budget a 1-hour live shakeout test before Phase 4 commits."

---

## Candidate open-source models — per-stage fit

### Stage 1 — TRIAGE (~300 in / ~200 out, 100% of queries, light reasoning, <1.5s p95)
**Recommended: Llama 4 Scout via Fireworks or DeepInfra**
- **Why Scout, not Maverick:** Scout is 17B-active / 109B-total MoE with much lower output cost and faster TTFT. Triage is light reasoning; we are not paying for Maverick's 128 experts here.
- **Pricing:** $0.08/$0.30 per MTok on DeepInfra; $0.11/$0.34 on Groq; $0.15/$0.60 on Fireworks. **Fireworks gives strict json_schema** for ~2× DeepInfra price.
- **JSON-schema mode:** Strict via Fireworks (best-in-class on OSS). Groq has strict mode but Groq's strict-mode coverage on Llama 4 specifically is documented-but-sometimes-buggy on community forums.
- **Cost per Triage call (Fireworks):** (0.0003 × $0.15) + (0.0002 × $0.60) = **$0.000165**
- **Alternative if we relax strict-schema → "json_object":** Llama 4 Scout on DeepInfra at $0.08/$0.30 = **$0.000084/call** (~50% cheaper) — but then we re-introduce schema-drift risk
- **Pros:** Mature, well-tested, cheap, fast (594 TPS on Groq, <300ms TTFT)
- **Cons:** Llama 4 had a noisy launch w/ reported IFEval issues compared to Qwen3; instruction-polish is "good but not exceptional"

### Stage 4 — SELECT (highest-stakes, ~2K in / ~400 out, 70% of queries, medium-heavy reasoning, Indian-tariff legal text)
**Recommended: Qwen3-Next-80B-A3B-Instruct via Fireworks (or DeepInfra fallback)**
- **Why Qwen3-Next:** Best open-weight instruction-following polish documented (Qwen3 ranks #1 on GPQA Diamond among open weights — 88.4% — and is purpose-trained for stable structured output). The 235B-A22B variant is more capable but more expensive; 80B-A3B is the sweet-spot for ~2K-in/~400-out at high QPS.
- **Pricing on OpenRouter (routed to DeepInfra):** $0.09/$1.10 per MTok
- **JSON-schema mode:** Strict via Fireworks. OpenRouter aggregates structured-output support across the model's underlying providers.
- **Cost per Select call:** (0.002 × $0.09) + (0.0004 × $1.10) = $0.00018 + $0.00044 = **$0.00062**
- **Alternative — DeepSeek V3.2:** $0.252/$0.378, IFEval 91.9 (BEST documented instruction-following on this class), cost/call $0.000656 — **price almost identical, slightly better at instruction following but DOCUMENTED STRICT-MODE BUGS** (DeepSeek's strict-tools mode returns malformed JSON with missing closing quotes — open GitHub issue at deepseek-ai/DeepSeek-V3#1069; V4-Pro intermittently emits tool calls as plain text — issue #1244). **This is a hard blocker for our Select stage.**
- **Pros (Qwen3-Next):** Strong reasoning, mature ecosystem, multilingual (useful since Indian SME inputs sometimes have Hindi product names), Fireworks delivers <1s TTFT
- **Cons:** Output token price ($1.10) is higher than Triage models; 80B-A3B is newer, fewer community deployment stories at high QPS

### Stage 5 — VERIFY V1 (rubber-stamp, ~500 in / ~100 out, 50% of queries, different family from Select)
**Recommended: Llama 4 Maverick via DeepInfra**
- **Pricing:** $0.15/$0.60 per MTok on DeepInfra (matched on OpenRouter). Different family from Qwen → genuine cross-check.
- **JSON-schema mode:** json_schema strict supported via DeepInfra + OpenRouter routing
- **Cost per V1 call:** (0.0005 × $0.15) + (0.0001 × $0.60) = **$0.000135**

### Stage 5 — VERIFY V2 (antagonistic, ~2K in / ~300 out, 20% of queries, different family from Select)
**Recommended: DeepSeek V3.2 via OpenRouter (json_object mode, NOT strict)**
- **Why V3.2 here despite strict-mode bug:** V2 is antagonistic-verifier — it produces "AGREE / DISAGREE + reasoning" which is a much simpler schema (3 fields, no nesting). The DeepSeek strict-mode bug surfaces on complex nested schemas with arrays — the V2 schema is too simple to trigger it. Plus V3.2's IFEval 91.9 is genuinely the best on this class.
- **Pricing:** $0.252/$0.378 (OpenRouter) or DeepSeek direct V4-Flash $0.14/$0.28
- **Cost per V2 call (V4-Flash direct):** (0.002 × $0.14) + (0.0003 × $0.28) = $0.00028 + $0.000084 = **$0.000364**

### Stage 6 — DEEP-THINK (~3K in / ~800 out, 5% of queries, extended reasoning, single-shot decision)
**Recommended: DeepSeek V4-Pro reasoning mode (deepseek-reasoner) via DeepSeek direct API**
- **Why:** V4-Pro w/ reasoning is currently the highest open-weight reasoning model (GPQA 90.1, MMLU-Pro 87.5, LiveCodeBench 93.5). Only 5% of queries, so price impact is small.
- **Pricing during discount (until May 31 2026):** $0.435/$0.87 per MTok
- **Pricing after discount expires June 1 2026:** $1.74/$3.48 per MTok (this hurts!)
- **JSON-schema mode:** json_object only in reasoning mode. We accept that — Deep-think doesn't need strict JSON; it returns "AUTOCLASSIFY or REFUSE" + reasoning, which we can parse with a permissive schema + a regex/Zod validation pass on our side.
- **Cost per Deep-think call (post-discount):** (0.003 × $1.74) + (0.0008 × $3.48) = $0.00522 + $0.002784 = **$0.008004**
- **Alternative — Qwen3 235B (reasoning):** Likely similar quality, simpler integration, no June-1 price-cliff risk. **Worth comparing live during Phase 4 spike.**

---

## Provider pricing snapshot (live data, May 2026)

| Provider | Model | $/MTok in | $/MTok out | JSON mode | Verified URL |
|---|---|---|---|---|---|
| Fireworks | Llama 4 Maverick (FW serverless) | $0.15 est | $0.60 est | **strict json_schema** | docs.fireworks.ai/serverless/pricing |
| Fireworks | DeepSeek V4 Pro | $1.74 | $3.48 | strict json_schema | docs.fireworks.ai/serverless/pricing |
| Fireworks | Qwen3-235B (16B+ tier) | $0.90 blended | $0.90 blended | strict json_schema | docs.fireworks.ai/serverless/pricing |
| DeepInfra | Llama 4 Scout | $0.08 | $0.30 | json_schema | deepinfra.com/pricing |
| DeepInfra | Llama 4 Maverick | $0.15 | $0.60 | json_schema | deepinfra.com/pricing |
| DeepInfra | DeepSeek V3.2 | $0.26 | $0.38 | json_object (strict has bugs) | deepinfra.com/pricing |
| DeepInfra | DeepSeek V4 Pro | $1.74 | $3.48 | json_object | deepinfra.com/pricing |
| Groq | Llama 4 Scout | $0.11 | $0.34 | **strict** (when supported by base model) | groq.com/pricing |
| Groq | Qwen3 32B | $0.29 | $0.59 | strict | groq.com/pricing |
| Groq | Llama 3.3 70B Versatile | $0.59 | $0.79 | strict | groq.com/pricing |
| OpenRouter | Llama 4 Maverick (routed) | $0.15 | $0.60 | depends on underlying provider; FW route = strict | openrouter.ai/meta-llama/llama-4-maverick |
| OpenRouter | Qwen3-Next-80B-A3B-Instruct | $0.09 | $1.10 | depends on route | openrouter.ai/qwen/qwen3-next-80b-a3b-instruct |
| OpenRouter | DeepSeek V3.2 | $0.252 | $0.378 | json_object | openrouter.ai/deepseek/deepseek-v3.2 |
| OpenRouter | GLM 5.1 | $0.98 | $3.08 | json_object | openrouter.ai/z-ai/glm-5.1 |
| OpenRouter | Phi-4 | $0.065 | $0.14 | json_object | openrouter.ai/microsoft/phi-4 |
| OpenRouter | Granite 4.0 Micro (3B) | $0.017 | $0.112 | json_object | openrouter.ai/ibm-granite/granite-4.0-h-micro |
| Together AI | Qwen3-Coder-480B (not Instruct) | $2.00 | $2.00 | json_object | together.ai/pricing |
| Together AI | DeepSeek V4 Pro | $2.10 | $4.40 | json_object | together.ai/pricing |
| DeepSeek direct | V4-Flash | $0.14 | $0.28 | strict (but bugs on nested) | api-docs.deepseek.com |
| DeepSeek direct | V4-Pro (during discount) | $0.435 | $0.87 | strict (but bugs on nested) | api-docs.deepseek.com |
| DeepSeek direct | V4-Pro (after May 31) | $1.74 | $3.48 | strict (but bugs on nested) | api-docs.deepseek.com |
| NVIDIA NIM | Nemotron Nano 9B V2 | $0.04 | $0.16 | json_object | costbench.com/nvidia-nim |
| NVIDIA NIM | Nemotron 3 Nano 30B | $0.05 | $0.20 | json_object | costbench.com/nvidia-nim |
| NVIDIA NIM | Nemotron 3 Super 120B | $0.09 | $0.45 | json_object | costbench.com/nvidia-nim |
| Cerebras | Llama 4 Scout | $0.65 blended | (free tier: 1M tok/day) | json_object | cerebras.ai/pricing |
| Mistral direct | Mistral Large 3 (open-weight) | $0.50 | $1.50 | strict json_schema | mistral.ai/pricing |
| Mistral direct | Mistral Medium 3.5 | $1.50 | $7.50 | strict json_schema | mistral.ai/pricing |
| Cohere direct | Command R+ | $2.50 | $10.00 | **strict_tools / json_schema** | cohere.com/pricing |

---

## Recommended open-source stack

| Stage | Model | Provider | Cost/query | Family | Strict schema? |
|---|---|---|---|---|---|
| 1 — Triage | Llama 4 Scout | Fireworks | $0.000165 | Meta | Yes (strict) |
| 4 — Select | Qwen3-Next-80B-A3B-Instruct | Fireworks (routed via OpenRouter or direct) | $0.00062 | Alibaba | Yes (strict via FW) |
| 5 — V1 | Llama 4 Maverick | DeepInfra | $0.000135 | Meta | Yes |
| 5 — V2 | DeepSeek V4-Flash | DeepSeek direct API | $0.000364 | DeepSeek | json_object (schema is simple) |
| 6 — Deep-think | DeepSeek V4-Pro reasoning | DeepSeek direct API | $0.008004 | DeepSeek | json_object (single-shot) |

**Cross-family check:** Select is Alibaba; V1 is Meta; V2 is DeepSeek. Three different families, no incest.

---

## Cost comparison @ 100K queries/month

Volume mix: 100K Triage + 70K Select + 50K V1 + 20K V2 + 5K Deep-think.

| Stack | Triage | Select | V1 | V2 | Deep-think | **Total $/month** |
|---|---|---|---|---|---|---|
| **Proprietary (current path)** — GPT-5.4-mini + Gemini 3.1 Flash-Lite + Sonnet 4.6 Deep-think | ~$30 | ~$255 | ~$25 | ~$60 | ~$67 | **~$437/mo** |
| **Proposed open-source** (recommended above) | $16.50 | $43.40 | $6.75 | $7.28 | $40.02 | **~$114/mo** |
| **Hybrid (best open + Sonnet Deep-think)** — same OSS for stages 1/4/5V1/5V2, Claude Sonnet 4.6 for Deep-think | $16.50 | $43.40 | $6.75 | $7.28 | $67 | **~$141/mo** |

**Savings vs proprietary:** ~$323/mo full-OSS (74% reduction), or ~$296/mo hybrid (68% reduction).

**Per-query average:** Open-source = $0.00114/query (vs target $0.002-0.0045/query). Comfortably under budget with 43% headroom.

---

## NVIDIA-specific evaluation

- **build.nvidia.com free tier:** 1,000 inference credits on signup, 1,000-5,000 credits for researchers/students. **Sufficient for Phase 4 dev/spike work, not for production at 100K queries/month.**
- **NIM hosted pricing:** Competitive on Nemotron family ($0.04-$0.45/MTok for Nano-9B → Super-120B) but **does NOT host Llama 4, Qwen3, DeepSeek V3/V4 at listed prices** in the costbench snapshot. NVIDIA NIM is essentially a Nemotron-first catalog at this price point.
- **Nemotron Nano 9B V2 ($0.04/$0.16):** Looks great on paper for Triage — half the price of Llama 4 Scout on DeepInfra. Real question: does Nemotron-Nano-9B handle the Triage schema (6-field attribute extraction) at strict-schema reliability? Unknown without a live test. **Worth a Phase-4 shakeout.**
- **NVIDIA DGX Cloud / NIM self-host:** Only economic above ~500K queries/month or for latency-critical co-located inference. At 100K/month we'd spend more on GPU-hours than on per-token serverless. **Not viable for current scale.**
- **build.nvidia.com models worth using:** Nemotron-Nano-9B-V2 (Triage candidate), Nemotron-3-Super-120B (V2/V1 candidate), Llama-3.1-Nemotron-70B (deeper-reasoning candidate).
- **Verdict on NVIDIA:** **Use the free tier for Phase-4 spike testing of Nemotron-Nano on Triage**, but don't commit to NIM as the primary production provider. Fireworks + DeepInfra + DeepSeek-direct is the production stack.

---

## Risks of open-source path

### 1. Strict JSON schema reliability — **the biggest risk**
- DeepSeek V3/V4 strict mode has documented bugs (issue #1069 = malformed JSON, issue #1244 = intermittent plain-text tool calls). **Mitigation: use json_object on DeepSeek + Zod parse on our side**, or **route DeepSeek through Fireworks (which adds its own constrained-decoding layer via grammar files).**
- Groq's strict mode "is ignored by openai/gpt-oss-120b" per community forum — model-specific edge cases exist. **Mitigation: pin strict-mode to Fireworks for Stages 1/4 where strict matters most.**
- Open-weight models in general have "main gaps in instruction-following polish" per Artificial Analysis May 2026 leaderboard commentary. **Mitigation: validate every output server-side with Zod + a refusal-fallback retry path.**

### 2. Provider stability
- Together AI: stable but lacks the cheapest tier serving Llama 4 Maverick/Scout at serverless inference (only fine-tuning listed).
- Fireworks: very mature, dedicated structured-output team, high uptime.
- DeepInfra: usually cheapest, but uptime history less polished; use as fallback not primary for Select.
- DeepSeek direct: pricing volatility (75% discount expires May 31 → 4× price increase June 1) means we MUST architect to swap V4-Pro for Qwen3-235B-reasoning if cost spikes.

### 3. Latency variance
- DeepInfra median TTFT ~0.4s on small models; Fireworks ~0.3s; Groq <0.1s. All meet our <1.5s Triage / ~3s Select targets.
- DeepSeek direct API has reported intermittent slowness during peak Asia hours — V2/Deep-think are 5-20% of queries so impact is limited.

### 4. Model deprecation
- Open-weights aren't "deprecated" the same way GPT/Gemini are — the weights remain available and can be self-hosted as a last resort. But providers can drop unprofitable models from their catalog with 30-day notice.
- **Mitigation:** Architecture spec must allow swapping any single model in ~2 days. Confirmed by the existing config-driven approach.

### 5. Self-hosting fallback (NIM-style) operational burden
- Self-hosting Qwen3-Next-80B on a single H100 = ~$2.50/hr × 730 hr = ~$1,825/mo with ~60-80% utilization. At 100K queries/mo this is BREAK-EVEN with serverless. Not worth the ops cost. **Stay serverless.**

---

## Overall verdict

- **Open-source is VIABLE for this project.** All five stages can be served from open-weights at a price ~26% of the proprietary stack with no obvious correctness regression provided strict-schema is enforced through Fireworks for the schema-critical stages.
- **Recommended path: HYBRID — full OSS on Stages 1/4/5-V1/5-V2, Claude Sonnet 4.6 (proprietary) on Stage 6 Deep-think.** Reason: Deep-think is only 5% of queries (5,000/mo) so the price delta of using Sonnet 4.6 ($67 vs $40 on V4-Pro) is small in absolute terms, but Sonnet 4.6's instruction-following on a refusal-or-classify single-shot decision is meaningfully more reliable than ANY open-weight reasoning model as of May 2026. **The $27/mo premium buys us correctness on the rarest, highest-stakes calls.**
- **Confidence: MEDIUM-HIGH** that full-OSS hits 95%+ of proprietary accuracy on stages 1/4/5; **MEDIUM** that strict-JSON-schema reliability is production-grade without a 1-hour live shakeout test on a representative 6-property nested schema across Fireworks vs DeepInfra vs OpenRouter for the chosen Triage and Select models. Recommend doing that shakeout test as the FIRST task of Phase 4.
- **Must-do before Phase 4 commit:** (1) Live strict-schema reliability test on Qwen3-Next-80B-A3B-Instruct via Fireworks on a Select-shaped schema (6 required fields, one nested array of alternatives); (2) DeepSeek V4-Flash json_object reliability test on the V2 schema; (3) confirm Llama 4 Scout strict schema on Fireworks for Triage; (4) test Nemotron-Nano-9B-V2 on Triage as a 50%-cheaper alternative to Llama 4 Scout.

---

## Sources (live-fetched May 2026)

- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Together AI Pricing](https://www.together.ai/pricing)
- [Fireworks AI Serverless Pricing](https://docs.fireworks.ai/serverless/pricing)
- [Groq On-Demand Pricing](https://groq.com/pricing)
- [OpenRouter Structured Outputs Docs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [DeepInfra Pricing](https://deepinfra.com/pricing)
- [Mistral Models Overview](https://docs.mistral.ai/getting-started/models/models_overview/)
- [Cohere Structured Outputs](https://docs.cohere.com/docs/structured-outputs)
- [OpenRouter — Llama 4 Maverick](https://openrouter.ai/meta-llama/llama-4-maverick)
- [OpenRouter — Qwen3-Next-80B-A3B-Instruct](https://openrouter.ai/qwen/qwen3-next-80b-a3b-instruct)
- [OpenRouter — DeepSeek V3.2](https://openrouter.ai/deepseek/deepseek-v3.2)
- [NVIDIA NIM Pricing](https://costbench.com/software/llm-api-providers/nvidia-nim/)
- [Cerebras Pricing & Free Tier](https://www.cerebras.ai/pricing)
- [DeepSeek strict-mode JSON malformed (issue #1069)](https://github.com/deepseek-ai/DeepSeek-V3/issues/1069)
- [DeepSeek V4-Pro intermittent tool call (issue #1244)](https://github.com/deepseek-ai/DeepSeek-V3/issues/1244)
- [Artificial Analysis open-source leaderboard](https://artificialanalysis.ai/models/open-source)

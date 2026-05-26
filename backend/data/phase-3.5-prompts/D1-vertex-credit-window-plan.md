> ⚠️ **PARTIALLY SUPERSEDED BY D1 LOCK 2026-05-25**
> Final D1 stack diverges from this plan: ALL 5 stages on Gemini 3.5 Flash @ Vertex `global` (not the multi-model split this doc proposed). Active spec: `backend/docs/ARCHITECTURE.md`. Credit observation remains accurate.

# Vertex Credit Window Plan — 2026-05-25 → 2026-06-10

**Decision-grade artifact.** This file supersedes the cash-only model picks in `D1-model-stack-reassessment.md` for the duration of the credit window. The post-window plan reverts to the OSS-hybrid in `D1-opensource-research.md` and `D1-deepthink-oss-research.md`.

---

## Credit verification (via Chrome MCP — verified live 2026-05-25)

**Source:** `https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/credits/all?project=gen-lang-client-0962892937`

Chrome MCP successfully read the billing console (no permission gate). Three credits found:

| Credit name | Remaining | Original | Status | Expiry | Coverage |
|---|---|---|---|---|---|
| **Free Trial** | **₹27,278.76 (~$326 USD)** | ₹27,287.26 | **Expiring in 16 days** | 2026-06-10 | "Certain usage" — see notes |
| Trial credit for GenAI App Builder | ₹94,550.01 (~$1,130 USD) | ₹94,550.01 | Available 100% | 2027-05-08 | **Vertex AI Gemini 2.0+ + GenMedia (Imagen/Veo)** |
| Trial for Recommendations AI | ₹56,730.01 (~$678 USD) | ₹56,730.01 | Available 100% | 2026-11-04 | Recommendations AI SKUs only (not Vertex Gemini) |

**Used so far on Vertex (prior session):** ~$0.008 (negligible from earlier baseline experiments). Free trial is still at 100% minus ₹8.50.

**The big finding the brief missed:**

The 17-day-expiry brief refers to the **Free Trial** (₹27,287 → expiring 2026-06-10, 16 days from today). But the **GenAI App Builder credit** (₹94,550 ≈ $1,130) is the larger, longer-lived pot and is **explicitly carved for Vertex AI Gemini 2.0+ models**. It does not expire until 2027-05-08 — **12 months runway, not 16 days.**

→ This dramatically changes the "use it or lose it" framing. We have ~$326 to burn in 16 days, then ~$1,130 to burn over the following 12 months.

**Important credit coverage caveats (verified via Google AI Developers Forum + GCP free-program docs):**
1. **Free Trial credit excludes** "generative AI partner model offered as a managed API" → this means **Claude on Vertex Partner Models is NOT covered by the Free Trial ₹27,278**.
2. **GenAI App Builder credit covers Vertex AI Gemini 2.0+** but the SKU list does **NOT include Anthropic Partner Models** (Claude). Only Google-native Gemini + GenMedia.
3. Both credits cover **Cohere/embedding-model SKUs on Vertex** only if those are billed as Vertex SKUs (not direct-to-Cohere).

**Practical: only Gemini stages will be free during the credit window. Claude Deep-think stays on cash (Anthropic direct) or moves to a Gemini-family deep-think alternative.**

### Available for Phase 4 dev + early production
- **16-day window (free trial + GenAI builder both active):** ~$1,456 of Vertex Gemini credit
- **Post-Jun-10 (Free Trial gone, GenAI Builder still alive 12mo):** ~$1,130 of Vertex Gemini credit

---

## Vertex model survey — LATEST as of 2026-05-25

### Authentication boundary (CRITICAL)

The current `GCP_VERTEX_API_KEY` is a **Vertex Express API key** (x-goog-api-key header).

| Endpoint | Express API key works? | Required for our stack? |
|---|---|---|
| Gemini 2.5 family (Pro, Flash, Flash-Lite) | YES | Available via Express |
| **Gemini 3.x family (3.5 Flash, 3.1 Pro, 3.1 Flash-Lite, 3 Flash)** | **NO (per discuss.ai.google.dev May 2026)** | **Requires service account JSON** |
| Claude Partner Models (Sonnet 4.6, Opus 4.7, Haiku 4.5) | NO (Anthropic uses rawPredict — service-account only) | Service account JSON required |
| Imagen, Veo (GenMedia) | NO (service-account only) | N/A |

> Source: https://discuss.ai.google.dev/t/gemini-enterprise-express-mode-api-key-authentication/143882
> Source: https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai (rawPredict requires service-account)

**Implication:** To use Gemini 3.x or Claude on Vertex, we need to **upgrade auth from Express API key to a service-account JSON**. Setup cost: ~30 minutes (create service account, grant `aiplatform.user` role, download JSON, set `GOOGLE_APPLICATION_CREDENTIALS` env var). One-time. Reversible.

### Gemini models available on Vertex (May 2026 — verified)

| Model | $/MTok in | $/MTok out | Cache hit | Context | JSON schema | Thinking | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Gemini 3.1 Pro (preview)** | $2.00 (≤200K), $4.00 (>200K) | $12.00 (≤200K), $18.00 (>200K) | — | Not stated, 1M assumed | YES | YES | Preview (Mar 2026) | **Latest Pro** — reasoning-first, agentic |
| **Gemini 3.5 Flash (GA May 19 2026)** | $1.50 | $9.00 | $0.15 | 1M | YES (improved) | YES (thinking_level) | **GA** | **Beats 3.1 Pro on coding/agentic at 25% lower cost** — preferred Pro-tier replacement |
| Gemini 3 Flash (preview) | $0.50 | $3.00 | $0.05 | 1M | YES | YES | Preview Dec 2025 | Superseded by 3.5 Flash for production |
| **Gemini 3.1 Flash-Lite (preview Mar 3 2026)** | $0.25 | $1.50 | — | 1M | YES (~97% compliance) | YES (minimal/low/medium/high levels) | Preview (GA-track) | **Cheapest 3.x** — preferred Triage/V1 |
| Gemini 2.5 Pro | $1.25 (≤200K), $2.50 (>200K) | $10.00 | $0.315 | 1M | YES | YES | **DEPRECATED 2026-10-16** | Skip — retiring during M5 ship window |
| Gemini 2.5 Flash | $0.30 | $2.50 | — | 1M | YES | optional | **DEPRECATED 2026-10-16** | Skip — retiring |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | — | 1M | YES | optional | **DEPRECATED 2026-10-16** | Skip — retiring |
| Gemini 2.0 Flash | $0.15 | $0.60 | — | 1M | YES | NO | **GenAI-credit-eligible** | Fallback if 3.x service-account setup blocks |

**Key fact:** All Gemini 3.x models support **adaptive thinking** with a `thinking_level` parameter (minimal/low/medium/high). This delivers what the OpenAI `reasoning_effort=high` feature did — except Gemini 3.x actually exposes it on the standard endpoint. **The Deep-think stage on Gemini 3.5 Flash (GA) would actually work**, unlike the broken GPT-4.1-mini Deep-think documented in B3.

### Claude on Vertex Partner Models

| Model | Vertex availability | $/MTok in | $/MTok out | Covered by credits? | Recommendation |
|---|---|---|---|---|---|
| **Claude Sonnet 4.6** (Vertex `claude-sonnet-4-6@20260217`) | YES — us-east5, europe-west1, us-east4 (regional pricing +10%) | $3.00 | $15.00 | **NO** (managed-API partner model, excluded from Free Trial credit + GenAI Builder credit) | Cash-only on Vertex. If we're paying cash anyway, **use Anthropic direct API** (cheaper, no Vertex 10% regional uplift). |
| Claude Opus 4.7 | YES | $5.00 | $25.00 | NO | Same as above |
| Claude Haiku 4.5 | YES | $1.00 | $5.00 | NO | Same as above |

**Verdict on Claude-on-Vertex for Deep-think during credit window:** Not actually a free option. Claude is excluded from the GCP credit SKU groups. The credit window does not move the Deep-think decision — we still pay Anthropic cash either way. **So the Vertex auth setup for Claude is NOT worth it** unless we plan to use Vertex's region-pinning / data-residency features (we don't).

### Reasoning capabilities side-by-side

| Model | Reasoning surface | Endpoint support |
|---|---|---|
| **Gemini 3.5 Flash** | `thinking_level: low/medium/high` — adaptive | Vertex AI + AI Studio, both expose it |
| Gemini 3.1 Pro | `thinking_level` — reasoning-first by default | Vertex AI + AI Studio |
| Gemini 3.1 Flash-Lite | `thinking_level` available (capped vs 3.5 Flash) | Vertex AI + AI Studio |
| GPT-5.4 mini | `reasoning_effort: low/medium/high` | Responses API (chat.completions does NOT support) |
| Claude Sonnet 4.6 | `thinking: { budget_tokens }` adaptive | All APIs (Anthropic direct, Vertex, Bedrock) |
| GPT-4.1 mini | None — pretrained baseline | N/A — Deep-think broken-by-design per B3 |

**Insight:** Gemini 3.5 Flash (GA, $1.50/$9.00) is **a credible Deep-think replacement during the credit window** because (a) it has working `thinking_level`, (b) it's covered by GenAI App Builder credit, (c) it's GA-stable not preview. The "+15pp deep reasoning" property of Claude Sonnet 4.6 is the only reason to pay cash — and only if Phase 4 empirical retest shows Gemini 3.5 Flash can't match it.

---

## During-window model stack (USE CREDITS, 2026-05-25 → 2026-06-10)

**Cost-axis:** All Gemini stages go to zero variable cost (paid out of credits). Only Verify-V2 antagonistic-stage (which the reassessment had on GPT-5.4 mini for family diversity) and the V3 deep-think (if Claude Sonnet) remain on cash.

| Stage | Model | Provider | Per-query cost | Covered by credits? | Notes |
|---|---|---|---|---|---|
| **Triage** | Gemini 3.1 Flash-Lite (preview) | Vertex (service-account auth) | $0.000375 | **YES — GenAI Builder credit** | 100% of queries — single biggest savings vector |
| **Retrieval** | Cohere embed-v4 direct | Cohere direct | $0.00012 | NO (not Vertex SKU) | Cash, unchanged |
| **Select** | **Gemini 3.5 Flash (GA)** | Vertex (service-account auth) | ~$0.00270 (est. 2K in + 400 out) | **YES — GenAI Builder credit** | **Cross-check warning:** Triage + Select both Google. Mitigation: Verify-V2 is OpenAI for cross-check property. |
| **Verify V1** | Gemini 3.1 Flash-Lite | Vertex (service-account auth) | $0.00028 | **YES** | Same model as Triage — single Vertex integration |
| **Verify V2** | **GPT-5.4 mini** | OpenAI direct | $0.00285 | **NO (cash)** | Held on OpenAI for family diversity — credit window doesn't override architectural cross-check |
| **Deep-think** | **Gemini 3.5 Flash with thinking_level=high** | Vertex (service-account auth) | ~$0.00540 (3K in + 800 out + thinking tokens) | **YES — GenAI Builder credit** | **Replaces Claude Sonnet 4.6 for credit window** — empirical retest required (see below) |

**Per-query mean (credit window):** `0.000375 + 0.00012 + 0.00270×0.70 + 0.00028×0.50 + 0.00285×0.20 + 0.00540×0.05 = ~$0.00302`. Of that, **~$0.00237/query is on Gemini → covered by credit → effectively free**.

**Cash per query during window: ~$0.00065** (Cohere retrieval + GPT-5.4 mini V2 only).

### Sixteen-day burn math
- Phase 4 dev work (B3-style retests, 168-case eval re-runs): est. 5K queries → ~$15 of Vertex credit consumed.
- If we run **early-production traffic** through (e.g., user-testing batch of 1K queries), another ~$3.
- Realistic 16-day burn: ~$20 of ~$326 Free Trial credit. **Most of the Free Trial will expire unused** regardless of stack, because we don't have production traffic yet.
- The strategic value of the credit window is NOT cost — it's **free A/B testing of Gemini 3.5 Flash as Deep-think alternative**.

---

## Post-credit-expiry plan (2026-06-10 onward)

The Free Trial credit expires; the GenAI App Builder credit (₹94,550 / ~$1,130) remains active until 2027-05-08 covering Gemini 2.0+ on Vertex. So **Gemini stays covered for another 11 months even after "expiry"**.

**Updated post-Jun-10 plan:** Keep the Vertex-Gemini stack on the GenAI Builder credit. Only the Verify V2 (OpenAI) and Cohere stages remain cash. This blows up the "OSS hybrid post-credit-expiry" plan that was assumed when the brief was written — the user actually has a year of free Gemini.

**OSS hybrid plan moves from "post-expiry default" to "post-GenAI-Builder-expiry plan (2027-05-08+)"**, OR "production-scale fallback if Vertex hits rate limits / capacity issues that the credit-tier doesn't cover".

Per `D1-opensource-research.md` and `D1-deepthink-oss-research.md`, the OSS hybrid stack at ~$133/mo @ 100K queries remains the long-term cost floor. Specifically:
- Triage → Llama 4 Scout via Fireworks
- Select → Qwen3-Next-80B-A3B-Instruct via Fireworks
- V1 → Llama 4 Maverick via DeepInfra
- V2 → DeepSeek V4 Flash direct
- Deep-think → Kimi K2.6-Thinking via OpenRouter (pending validation gate)

---

## Cutover plan

| Day | Action | Risk gate |
|---|---|---|
| **D0 (today, 2026-05-25)** | Set up service-account JSON for Vertex (one-time, ~30min). Set `GOOGLE_APPLICATION_CREDENTIALS` env var. Test Gemini 3.5 Flash + 3.1 Flash-Lite reachability via service-account auth. | No risk — additive. Express key remains for fallback. |
| **D0–D1** | Add `provider: 'vertex-gemini-3'` config to backend classifier. Wire stage-by-stage model env vars: `TRIAGE_MODEL`, `SELECT_MODEL`, `V1_MODEL`, `V2_MODEL`, `DEEPTHINK_MODEL`. | No risk — config-only. |
| **D2** | Run B3-fixture retest (5 cases: case-134, case-085, case-037, case-148, case-124) on Vertex Gemini 3.5 Flash for both Select and Deep-think. | **GATE 1: ≥4/5 correct on Select. If <4/5, fall back to GPT-5.4 mini on Select (cash) and document Gemini 3.5 Flash as Deep-think-only.** |
| **D3–D5** | Run full 168-case eval on the Vertex-Gemini stack vs. the cash-OpenAI stack. Compare correctness + cost. | **GATE 2: Vertex stack matches or beats cash stack on accuracy. If not, identify which stage is the regression.** |
| **D6–D14** | Phase 4 dev work — refuse-when-uncertain logic, 8 diagnosed legacy bugs, prompt engineering on chapter notes. | Iterate on Vertex-Gemini (credit-free) → cheap experimentation. |
| **D15 (2026-06-08, T-2 days from Free Trial expiry)** | If we're keeping cash-OpenAI V2 path, no shakeout needed — that piece is unchanged. Just confirm GenAI Builder credit still shows green on the billing console. | Reality-check before expiry. |
| **D16 (2026-06-09)** | Hard-snapshot the credit consumption baseline. Confirm GenAI Builder credit is being drawn down (not Free Trial overflow). | Required: tag PRs landing during credit window with cost-impact note. |
| **D17 (2026-06-10, Free Trial expires)** | No action needed — GenAI Builder credit absorbs Vertex-Gemini billing seamlessly. | **No downtime.** Both credits charge against same SKU group; Free Trial expiring just removes one of two sources. |
| **D~30 (mid-June)** | Empirical comparison report: Vertex-Gemini-3.5-Flash vs. cash OpenAI vs. (untested) Claude Sonnet on B3 fixture + 168-case eval. Decide if Claude-cash is worth the +$0.012/query for Deep-think. | Decision gate for production-launch stack. |
| **D~365 (2027-05-08, GenAI Builder credit expiry)** | Migrate to OSS hybrid per `D1-opensource-research.md`. Engineering cost: ~1-2 days. Already validated on shakeout tests by then. | Long-runway plan. |

---

## verify-vertex-claude.ts — revival decision

**Decision: DO NOT revive.**

Rationale:
1. The script at `backend/experiments/vertex/verify-vertex-claude.ts` tests whether the **Express API key** can reach Claude on Vertex. The answer (confirmed by Anthropic docs + community thread) is **NO** — Claude requires service-account auth, not Express keys.
2. Even with service-account auth set up for Gemini 3.x, **Claude on Vertex is NOT covered by either GCP credit** (Free Trial excludes managed-API partner models; GenAI App Builder credit SKU list is Google-native only).
3. If we want Claude Sonnet 4.6 Deep-think, paying Anthropic direct is **cheaper than Vertex** (Vertex regional endpoints add 10% uplift over global; global is functionally equivalent to Anthropic direct).

**What to do instead:** Write a small `verify-vertex-gemini-3.ts` script after service-account setup that calls `gemini-3-5-flash` and `gemini-3-1-flash-lite` via the Vertex AI Node SDK and confirms (a) thinking_level parameter works, (b) strict JSON schema returns, (c) latency profile. ~$0.005 cost.

This new script goes in `backend/scripts/verify-vertex-gemini-3.ts`. Pattern: copy structure from the archived verify-vertex-claude.ts but use the official `@google-cloud/vertexai` Node SDK with service-account JSON.

---

## Open questions for user / Phase 4 dev

1. **Service-account setup approval:** Setting up a service-account JSON (~30min) is the gate to using Gemini 3.x AND draining the GenAI Builder credit ($1,130). Without it, we're stuck on Express-key + Gemini 2.5 (deprecating Oct 2026). **Recommend: do this today.**
2. **Is 5-case B3 retest sufficient gate, or should we run the full 168-case eval before lock?** The empirical evidence accumulates faster with the bigger eval but burns more credit ($25 vs $3). Either way, well inside the 16-day window.
3. **Claude Sonnet 4.6 Deep-think on cash vs. Gemini 3.5 Flash thinking on credit:** if the retest shows Gemini 3.5 Flash can match Claude on the 5-case fixture, we save ~$85/mo at 100K queries by staying on Vertex. The "Claude must be Deep-think" claim from `D1-model-stack-reassessment.md` was made before Gemini 3.5 Flash GA'd (May 19, 2026, six days ago) — that picture has changed.

---

## Summary of changes vs. `D1-model-stack-reassessment.md`

| Stage | Reassessment recommendation | Credit-window recommendation | Reason for change |
|---|---|---|---|
| Triage | Gemini 3.1 Flash-Lite (preview) | **Same** | Already optimal — credit makes it free |
| Select | GPT-5.4 mini (OpenAI cash) | **Gemini 3.5 Flash (Vertex credit)** | Free during credit window; cross-check goes to V2 |
| Verify V1 | Gemini 3.1 Flash-Lite | **Same** | Already optimal — credit makes it free |
| Verify V2 | GPT-5.4 mini (OpenAI cash) | **Same** | Holds cross-check property — credits don't change architecture |
| Deep-think | Claude Sonnet 4.6 adaptive (cash) | **Gemini 3.5 Flash thinking_level=high (credit) — RETEST REQUIRED** | Free during credit window; Sonnet 4.6 falls back only if retest fails |

**Net cost change:**
- Reassessment cash stack: ~$0.00437/query → $437/mo @ 100K
- Credit-window stack: **$0.00065/query CASH + $0.00237/query CREDIT = $65/mo cash + ~$1,130/12mo credit drain**
- Post-GenAI-Builder-expiry (May 2027): the OSS hybrid plan at ~$133/mo per `D1-opensource-research.md`

---

## Reporting payload

```json
{
  "credits_balance_inr": 178558.78,
  "credits_balance_usd_estimated": 2134,
  "free_trial_remaining_inr": 27278.76,
  "free_trial_remaining_usd_estimated": 326,
  "free_trial_expiry": "2026-06-10",
  "genai_app_builder_credit_inr": 94550.01,
  "genai_app_builder_credit_usd_estimated": 1130,
  "genai_app_builder_expiry": "2027-05-08",
  "recommendations_ai_credit_irrelevant": true,
  "used_so_far_inr": 8.50,
  "latest_gemini_pro": "Gemini 3.1 Pro (preview, Mar 2026)",
  "latest_gemini_flash": "Gemini 3.5 Flash (GA May 19 2026)",
  "latest_gemini_flash_lite": "Gemini 3.1 Flash-Lite (preview Mar 3 2026)",
  "newer_than_3_5_flash_exists": false,
  "claude_on_vertex_available": true,
  "claude_on_vertex_covered_by_credit": false,
  "express_api_key_reaches_gemini_3x": false,
  "service_account_auth_required_for_phase_4": true,
  "chrome_mcp_worked": true,
  "recommended_during_window_stack": {
    "triage": "Gemini 3.1 Flash-Lite (Vertex credit)",
    "select": "Gemini 3.5 Flash (Vertex credit)",
    "v1": "Gemini 3.1 Flash-Lite (Vertex credit)",
    "v2": "GPT-5.4 mini (OpenAI cash)",
    "deepthink": "Gemini 3.5 Flash thinking_level=high (Vertex credit) — empirical retest gates Claude Sonnet 4.6 fallback"
  },
  "recommended_post_window_stack": {
    "phase_1_2026_06_10_to_2027_05_08": "Same as during-window (GenAI Builder credit covers Vertex Gemini for another 11 months)",
    "phase_2_2027_05_08_onward": "OSS hybrid per D1-opensource-research.md + D1-deepthink-oss-research.md"
  },
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/D1-vertex-credit-window-plan.md"
}
```

# Vertex Credit-Coverage Empirical Test Plan

**Date drafted:** 2026-05-25
**Status:** Ready to run after `SETUP-vertex-service-account.md` is complete
**Cost ceiling:** ~$0.01 USD total across all 10 calls
**Decision impact:** May change Deep-think model pick (currently Gemini 3.5 Flash with thinking_level=high; could become Claude Sonnet 4.6 if Anthropic Partner Models turn out to bill to credits)

---

## Why this test exists

The current D1 plan (`D1-vertex-credit-window-plan.md`) is built on the THEORETICAL claim — sourced from GCP docs and a Google AI Dev Forum thread — that:

1. The Free Trial credit excludes "generative AI partner models offered as a managed API"
2. The GenAI App Builder credit covers only Vertex AI Gemini 2.0+ (Anthropic Partner Models excluded)
3. Therefore Claude on Vertex bills to the credit card, NOT credits.

**The user wants this falsified empirically.** Documentation has been wrong before — especially on rapidly-evolving SKU coverage rules. The only way to know for certain which SKU bills to which credit pool is to actually call each model and watch what shows up in the billing console.

If the theoretical answer is wrong and Claude on Vertex DOES draw from the GenAI App Builder credit, that flips the Deep-think recommendation: Sonnet 4.6 becomes free-during-credit-window and the "+15pp deep reasoning over Gemini" advantage is recovered at zero cash cost.

---

## Models tested (10 total)

### Tier 1 — Vertex Anthropic Partner Models (the big claim to falsify)
| # | Model | Region | Endpoint verb | Hypothesis |
|---|---|---|---|---|
| T1a | `claude-haiku-4-5` | us-east5 | rawPredict | NOT credit-covered (per docs) |
| T1b | `claude-sonnet-4-6` | us-east5 | rawPredict | NOT credit-covered (per docs) |
| T1c | `claude-opus-4-7` | us-east5 | rawPredict | NOT credit-covered (per docs) |

### Tier 2 — Other Vertex Marketplace / Model-Garden offerings
| # | Model | Region | Endpoint verb | Hypothesis |
|---|---|---|---|---|
| T2a | `llama-4-scout-17b-16e-instruct-maas` | us-central1 | rawPredict | Unknown — could replace V1 (DeepInfra Llama, paid) if credit-covered |
| T2b | `llama-4-maverick-17b-128e-instruct-maas` | us-central1 | rawPredict | Unknown — could replace V1/Select if credit-covered |
| T2c | `mistral-large-2411` | us-central1 | rawPredict | NOT credit-covered (partner model, per docs) |
| T2d | `qwen3-max` | us-central1 | rawPredict | Likely 404 — Qwen probably not on Vertex publisher path |

### Tier 3 — Native Google Gemini (positive controls / calibration)
| # | Model | Region | Endpoint verb | Hypothesis |
|---|---|---|---|---|
| T3a | `gemini-3-5-flash` | us-central1 | generateContent | YES — GenAI Builder credit (confirmed) |
| T3b | `gemini-3-1-pro` | us-central1 | generateContent | YES — credit-covered, but may 404 if preview not enabled for SA |
| T3c | `gemini-3-1-flash-lite` | us-central1 | generateContent | YES — credit-covered |

T3 calls serve as positive controls: if T3a doesn't show up as credit-applied, the entire billing-account configuration is broken and the test is invalid.

---

## Test design discipline

- **Tiny calls:** ~10 tokens out, ~100 tokens in per call. The actual model response is irrelevant — we only need a billable API hit.
- **Sequential, 5-sec spacing:** keeps each call on its own timestamp so billing-line attribution is unambiguous.
- **Single test prompt:** `"Reply with exactly: OK"` across all models — minimises prompt-engineering variance.
- **Graceful error capture:** A 404 / 403 / 429 is not a script failure — it's a finding. The script captures HTTP status + error body and continues.
- **No retries:** a billing line should appear even for failed 4xx requests on some SKUs (or not — also a finding).

---

## Phase 1 — Run the test (immediate)

### Pre-flight

```powershell
cd "C:\Export Business\hs-code-classifier\backend"

# Confirm SA setup is complete (per SETUP-vertex-service-account.md)
Get-ChildItem .\.gcp\vertex-sa.json
# Should print the JSON key file (~2KB)

# Confirm env var is wired
node -e "require('dotenv').config(); console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS)"
# Should print: ./.gcp/vertex-sa.json

# Confirm google-auth-library is installed
npm list google-auth-library
# Should print a version (not "(empty)")

# Quick sanity: run the simpler smoke test first
npx tsx scripts/verify-vertex-sa.ts
# Should print SUCCESS with response_text "OK"
```

If the simple smoke test (`verify-vertex-sa.ts`) passes, the auth + billing path is good.

### Run the credit-coverage test

```powershell
cd "C:\Export Business\hs-code-classifier\backend"
npx tsx scripts/test-vertex-credit-coverage.ts
```

The script:
1. Walks the 10 cases sequentially (5-sec pauses between).
2. For each call: prints the start ISO timestamp, HTTP status, latency, token usage (when available).
3. Writes structured JSON results to `backend/data/phase-3.5-prompts/vertex-credit-coverage-test.json`.
4. Ends with a summary table + Phase-2 follow-up instructions printed.

**Expected runtime:** ~1 minute total (10 calls × ~2 sec each + 9 × 5 sec spacing = ~63 sec).

**Cost ceiling:** ~$0.01. Realistic actual cost ~$0.0005 across all 10 models combined.

### What the Phase 1 output tells you

| Phase 1 result | What it tells you | What it does NOT tell you |
|---|---|---|
| HTTP 200 + valid response text | The SA has access to that model and the publisher route works | Whether the call billed to credit or card |
| HTTP 403 PERMISSION_DENIED | SA needs additional role, or partner-model EULA not accepted | (model might still be usable after EULA accept) |
| HTTP 404 Publisher Model not found | Wrong model identifier, wrong region, OR model not actually in Vertex publisher path | — |
| HTTP 400 | Request body format wrong for that vendor (likely a body-shape bug) | — |
| HTTP 429 | Quota cap on that SKU for this project | — |

### Phase 1 success criteria

Phase 1 is "successful" if:
- T3a (`gemini-3-5-flash`) returns HTTP 200 — this proves the auth + billing path is healthy.
- Results JSON file is written with one entry per case (success OR error captured).
- No script-level crashes.

Phase 1 does NOT determine credit coverage — that's Phase 2.

---

## Phase 2 — Attribute each call to credit-or-card (after ~1 hour)

GCP billing has a ~30-60 min lag between when an API call is made and when it appears in the billing console. The script prints the precise "check after" ISO timestamp at the end of Phase 1.

### Step 1 — Open the billing reports console

```
https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports?project=gen-lang-client-0962892937
```

(Substituting `01735A-7C1CE5-E75B14` is the billing account ID for this project, confirmed in the D1 plan.)

### Step 2 — Filter and group

In the billing report:

1. **Date range:** set to today (the day the script ran). Adjust timezone if needed — the script's `wall_clock_start_iso` is UTC.
2. **Project filter:** `gen-lang-client-0962892937` (single-project; no need to filter further).
3. **Group by:** `SKU` (this is the line-item granularity we need — every model has its own SKU).
4. **Show:** "Subtotal", "Credit applied", "Total"

Then sort by Subtotal descending so the largest line items appear on top. There will be 10-or-fewer rows total because each call generates one SKU line.

### Step 3 — Map each SKU line to a tested model

For each tested model, find its SKU. Names are surprisingly consistent on Vertex AI:

| Test | Expected SKU name pattern |
|---|---|
| T3a Gemini 3.5 Flash | "Vertex AI Gemini 3.5 Flash" + input/output suffix |
| T3b Gemini 3.1 Pro | "Vertex AI Gemini 3.1 Pro" |
| T3c Gemini 3.1 Flash-Lite | "Vertex AI Gemini 3.1 Flash-Lite" |
| T1a Claude Haiku 4.5 | "Claude Haiku 4.5" or "Anthropic Claude" — usually shows the publisher (Anthropic) in the name |
| T1b Claude Sonnet 4.6 | "Claude Sonnet 4.6" or "Anthropic Claude" |
| T1c Claude Opus 4.7 | "Claude Opus 4.7" or "Anthropic Claude" |
| T2a/b Llama 4 | "Llama 4 Scout/Maverick MaaS" or similar |
| T2c Mistral Large | "Mistral Large" |
| T2d Qwen | Probably no SKU line (likely 404'd in Phase 1) |

If a tested call returned HTTP 200 but you can't find a matching SKU — the call WAS billed somewhere; expand the date range by ±1 day to be safe.

### Step 4 — Read the "Credit applied" column for each SKU

This is the decisive answer:

| Column reads | Means |
|---|---|
| "Credit applied" > 0 AND equals Subtotal | **100% credit-covered.** No cash hit. |
| "Credit applied" partial (less than Subtotal) | Credit covers some but not all; check which credit (Free Trial vs GenAI Builder vs Recommendations AI) by looking at the credit breakdown. |
| "Credit applied" = 0 (or column blank) | **NOT credit-covered.** This billed to the underlying credit card. |
| Nothing on the report at all | Either the call failed (check Phase 1 HTTP status) OR billing hasn't caught up — wait another 30min. |

### Step 5 — Check WHICH credit covered each line (when credit-applied > 0)

Open the credit-breakdown URL:

```
https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/credits/all?project=gen-lang-client-0962892937
```

For each credit pool (Free Trial, GenAI App Builder, Recommendations AI), the "Recent activity" or "Usage" section will show which SKUs drew from it.

### Step 6 — Update the results JSON

Re-open `backend/data/phase-3.5-prompts/vertex-credit-coverage-test.json` and for each `result` entry, append a `phase_2_billing_attribution` object:

```json
"phase_2_billing_attribution": {
  "billing_console_checked_at_iso": "2026-05-25T16:00:00Z",
  "sku_name_found": "Vertex AI Gemini 3.5 Flash (input tokens)",
  "subtotal_usd": 0.00012,
  "credit_applied_usd": 0.00012,
  "credit_source": "GenAI App Builder",
  "card_charged_usd": 0,
  "covered_by_credit": true,
  "covered_by_credit_pool": "GenAI App Builder",
  "notes": "Positive control — confirmed credit path healthy."
}
```

For 404/403 cases, the attribution might be:

```json
"phase_2_billing_attribution": {
  "billing_console_checked_at_iso": "2026-05-25T16:00:00Z",
  "sku_name_found": null,
  "subtotal_usd": 0,
  "credit_applied_usd": 0,
  "credit_source": null,
  "card_charged_usd": 0,
  "covered_by_credit": "N/A (call failed)",
  "notes": "Phase 1 returned HTTP 403 — EULA likely not accepted. Model not callable, billing question moot."
}
```

---

## Decision matrix (what each outcome means for Phase 4)

| Outcome | Action |
|---|---|
| **Claude Sonnet 4.6 (T1b) bills to credit** | **REVERSE D1 plan** — switch Deep-think to Claude Sonnet 4.6 on Vertex (free during credit window, retains the +15pp deep-reasoning advantage). Update `D1-vertex-credit-window-plan.md` "during-window stack" table. |
| Claude Sonnet 4.6 bills to card (original hypothesis) | **CONFIRMS docs research.** Stick with Gemini 3.5 Flash thinking_level=high for Deep-think during credit window. Falls back to Anthropic-direct (not Vertex) post-window. |
| Claude Sonnet 4.6 returns 403 (EULA / partner-model gate) | Accept Anthropic EULA at [Vertex Model Garden Claude card](https://console.cloud.google.com/vertex-ai/publishers/anthropic/model-garden), then re-run T1 cases. If still 403, the SA needs additional partner-model role. If we never get past 403, the empirical question stays unanswered — fall back to the docs-based answer. |
| **Llama 4 Scout/Maverick (T2a/b) bills to credit** | **HIGH VALUE.** Could replace V1 (currently DeepInfra Llama, paid) with credit-covered Vertex Llama. Saves ~$60/mo at 100K queries. Update D1 plan. |
| Llama 4 bills to card | Llama hosted via Vertex MaaS is still pay-as-you-go to the card — no advantage over DeepInfra. Stick with DeepInfra. |
| Mistral Large bills to credit | Same logic as Claude — could become a Deep-think alternative if pricing competitive. (Lower probability — Mistral is a clear partner model per docs.) |
| T3 native Gemini bills to credit | Expected. No change to plan. |
| T3 native Gemini bills to CARD | **CRITICAL BUG.** The billing-account-to-credit-pool wiring is broken. STOP all paid usage of Vertex. Surface to user. Open GCP support ticket. |
| Qwen 404 | Expected. Qwen stays on Alibaba DashScope or DeepInfra. |

---

## Pre-test gotchas / risks

1. **Anthropic EULA gate.** Even with proper SA + role, Claude on Vertex requires the Anthropic EULA to be accepted ONCE per project (one-time click-through in the Vertex Model Garden UI). If T1 cases all return 403, this is the most likely cause. Fix:
   - Open https://console.cloud.google.com/vertex-ai/model-garden?project=gen-lang-client-0962892937
   - Search for "Claude"
   - Click any Claude model → click "Enable" / accept EULA
   - Re-run the test script

2. **Llama MaaS access.** Llama on Vertex MaaS may require similar enablement. If T2a/b return 403, follow the same enable flow for Meta.

3. **Region-specific Claude availability.** Claude on Vertex is currently only available in `us-east5`, `europe-west1`, `us-east4`. The script uses `us-east5` per the D1 plan. If the region returns 404, try `us-east4` next. (Script does not auto-retry other regions — that's a manual edit.)

4. **Quota / rate-limit caps on tier-1 launch.** First-time SA use of preview models (Gemini 3.1 Pro especially) may hit RESOURCE_EXHAUSTED 429. Workaround: skip 3.1 Pro for first run; rely on T3a (3.5 Flash GA) as positive control.

5. **Billing console lag.** ~30-60 min typical. Up to 4 hours in rare cases. If Phase 2 shows nothing after 2 hours, wait until next morning before declaring the test a failure.

6. **Partner-model permission scope.** `roles/aiplatform.user` is documented to cover both native Google and partner models. If T1 Claude calls return 403 and T3a Gemini works, the issue is EULA — NOT role. Don't go add roles speculatively; that's a separate failure mode.

7. **Pricing-vs-billing-credit gap.** Even if a SKU is listed in the credit pool's coverage rules, the credit may not auto-apply if the SKU rolls up under a different billing category (rare but happens with newly-launched models). The Phase 2 console reading resolves this unambiguously.

---

## What success looks like

After Phase 2 is complete, the `vertex-credit-coverage-test.json` file has, for each of the 10 cases:
- Phase 1 fields (HTTP, latency, response, tokens)
- Phase 2 fields (SKU name, credit-applied amount, credit source, covered-by-credit bool)

That JSON becomes the authoritative empirical input to `D1-vertex-credit-window-plan.md`. If the empirical answer differs from the theoretical answer in even one of the T1 cases, the D1 plan gets updated to reflect reality.

---

## Files produced by this workflow

| File | Created in phase | Purpose |
|---|---|---|
| `backend/scripts/test-vertex-credit-coverage.ts` | Already created | Executable test |
| `backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md` | This file | Plan doc |
| `backend/data/phase-3.5-prompts/vertex-credit-coverage-test.json` | Written by script (Phase 1), augmented manually (Phase 2) | Empirical results |

---

## Reporting payload (after Phase 2)

```json
{
  "test_completed_at": "<ISO timestamp>",
  "tier_1_claude_credit_covered": {
    "haiku_4_5": true | false | "EULA_blocked",
    "sonnet_4_6": true | false | "EULA_blocked",
    "opus_4_7": true | false | "EULA_blocked"
  },
  "tier_2_other_credit_covered": {
    "llama_4_scout": true | false | "not_available",
    "llama_4_maverick": true | false | "not_available",
    "mistral_large_2411": true | false | "not_available",
    "qwen3_max": "not_available_on_vertex"
  },
  "tier_3_gemini_credit_covered_baseline": {
    "gemini_3_5_flash": true,
    "gemini_3_1_pro": true | "preview_not_enabled",
    "gemini_3_1_flash_lite": true
  },
  "decision_changes_for_phase_4": [
    "List any model swaps required in D1-vertex-credit-window-plan.md based on results"
  ]
}
```

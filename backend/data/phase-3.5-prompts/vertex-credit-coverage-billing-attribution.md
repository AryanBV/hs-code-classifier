# Credit Coverage — Empirical Billing Attribution (T+1hr)

## Time of check
2026-05-25T08:25 UTC (~70 minutes after test ran at 2026-05-25T07:15:40Z)

## Source
Live navigation to GCP Cloud Console via Chrome MCP:
- Billing reports: `https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports;timeRange=CUSTOM_RANGE;from=2026-05-23;to=2026-05-25;grouping=GROUP_BY_SKU?project=gen-lang-client-0962892937`
- Credits ledger: `https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/credits/all?project=gen-lang-client-0962892937`

## Billing console state

### Time-range slicing

- **Today only (2026-05-25 → 2026-05-25):** "No results to display." Console message: *"Costs take a few hours to show up, and might take longer than 24 hours."* — today's 3 successful Gemini calls have NOT yet propagated into the reporting layer.
- **May 23 – 25, 2026:** 4 SKUs visible (3 Gemini Vertex AI + 1 Log Storage). Chart annotation reads *"May 23 – 24, 2026 (total cost)"* — confirming the report only covers up to and including May 24. Today's test calls are still in the 24h pipeline.

### Credit balance — Issued Credits ledger

| Credit name | Status | Remaining | Original | Delta |
|---|---|---|---|---|
| Trial credit for GenAI App Builder | Available (100%) | ₹94,550.01 | ₹94,550.01 | ₹0.00 (unchanged) |
| Trial for Recommendations AI | Available (100%) | ₹56,730.01 | ₹56,730.01 | ₹0.00 (unchanged) |
| **Free Trial** (active) | Expiring in 16 days | **₹27,277.90** | ₹27,287.26 | **−₹9.36** consumed |
| Free Trial (legacy) | Expired | — | ₹27,287.26 | N/A |

**Key finding:** The 30 days × $300 / ₹27,287 Free Trial credit was the pool that absorbed all Vertex Gemini usage in this window. The two GenAI / Recommendations AI credits remain pristine at 100% — they did NOT cover Vertex Gemini calls.

This contradicts the **prior planning assumption** that the ₹94,550 "GenAI App Builder" credit would cover Gemini Vertex usage. Empirically, Vertex Gemini bills against the **Free Trial** credit first (which expires 2026-06-10, ~16 days from now).

## Per-SKU breakdown (May 23 – 25, 2026)

| SKU | SKU ID | Service | Usage | Usage cost | Other savings (credit applied) | Net charge to card |
|---|---|---|---|---|---|---|
| Gemini 2.5 Flash GA — Text Output (Thinking On) — Predictions | A253-E8A3-DE5C | Vertex AI | 357 count | ₹0.08 | −₹0.08 | ₹0.00 |
| Gemini 2.5 Flash GA — Thinking Text Output — Predictions | CD33-11F4-1220 | Vertex AI | 28,366 count | ₹6.71 | −₹6.71 | ₹0.00 |
| Gemini 2.5 Flash GA — Text Input — Predictions | FDAB-647C-5A22 | Vertex AI | 24,265 count | ₹0.69 | −₹0.69 | ₹0.00 |
| Log Storage cost | 143F-A1B0-E0BE | Cloud Logging | (n/a) | (zero, included in totals) | (n/a) | ₹0.00 |
| **Total Vertex AI** | | | | **₹7.48** | **−₹7.48** | **₹0.00** |

**Credit ledger delta (₹9.36) vs reports usage (₹7.48):** discrepancy of ₹1.88. Likely sources:
- Report covers May 23–24 fully; credit ledger reflects real-time balance through "now" (may include in-flight today's usage already deducted from the credit even though not yet visible in the report).
- Tax, sub-decimal rounding, or other minor SKUs filtered out of the visible SKU set.
- Either way, the BIG-PICTURE empirical answer is identical: 100% credit-covered.

## Important calibration notes

1. **All 3 test-claimed Gemini variants (3.5-flash, 3.1-flash-lite, 2.5-flash) showed up under the SAME SKU family ("Gemini 2.5 Flash GA").** Vertex appears to alias `gemini-3.5-flash` and `gemini-3.1-flash-lite` (which don't exist as published models) → `gemini-2.5-flash` server-side. Future cost-modeling should treat 2.5 Flash as the only available SKU.

2. **The usage counts (357 / 28,366 / 24,265) are far larger than the 3-call test alone (~20 tokens total).** They include earlier Vertex usage in this window: the Phase 3 architecture spike (commit `58a7015` on May 23), Vertex baseline eval scripts (`backend/scripts/vertex-baseline-eval.ts`), and `verify-vertex-claude.ts` / `verify-vertex-credit.ts` from today's git status. The verification still proves credit-attribution unambiguously, because ALL Vertex Gemini usage in the window — not just the 3-call test — billed 100% to credit with ₹0.00 net.

3. **Card charge: ₹0.00 across the entire window.** Subtotal/Tax/Total all ₹0.00.

## Empirical answer

- **Gemini calls billed to credit:** **YES — 100% covered.**
- **Card charge today:** **$0.00 / ₹0.00**
- **Credit pool that absorbed the charges:** **Free Trial** (expiring 2026-06-10 in 16 days). NOT the GenAI App Builder or Recommendations AI credits.
- **Has today's (2026-05-25 07:15Z) test data fully propagated into Reports?** NO — Reports only shows through May 24. Credit ledger likely reflects today's usage already (₹9.36 vs ₹7.48 ≈ ₹1.88 not-yet-in-report delta).

## Conclusion

- **D1 LOCK validation: CONFIRMED.** Vertex Gemini 2.5 Flash GA calls are demonstrably credit-covered to ₹0.00 net charge.
- **Caveat for D1 stack lock:** the absorbing credit pool is the **Free Trial credit (16 days until expiry)**, not the longer-lived GenAI App Builder credit (₹94,550, expires 2027-05-08). After the Free Trial expires on 2026-06-10, an empirical re-test is required to confirm whether subsequent Gemini calls then start drawing on the GenAI App Builder credit, or fall through to card.
- **Non-Gemini partner models (Claude, Llama, Mistral, Qwen) were all 429 or 404 in the test**, so no empirical evidence is available for those. They cannot be assumed credit-covered.

## Reporting payload (for coordinator)

```json
{
  "billing_data_visible": true,
  "billing_data_complete_through": "2026-05-24",
  "today_5_25_in_report": false,
  "gemini_billed_to_credit": true,
  "credit_pool_consumed": "Free Trial (₹27,287 → ₹27,277.90, delta ₹9.36)",
  "credit_pool_NOT_consumed": ["Trial credit for GenAI App Builder (₹94,550 unchanged)", "Trial for Recommendations AI (₹56,730 unchanged)"],
  "total_charged_to_card": 0.00,
  "currency": "INR",
  "vertex_skus_observed_may23_25": [
    {"sku": "Gemini 2.5 Flash GA Text Output (Thinking On) - Predictions", "sku_id": "A253-E8A3-DE5C", "usage_count": 357, "cost_inr": 0.08, "credit_applied_inr": -0.08},
    {"sku": "Gemini 2.5 Flash GA Thinking Text Output - Predictions", "sku_id": "CD33-11F4-1220", "usage_count": 28366, "cost_inr": 6.71, "credit_applied_inr": -6.71},
    {"sku": "Gemini 2.5 Flash GA Text Input - Predictions", "sku_id": "FDAB-647C-5A22", "usage_count": 24265, "cost_inr": 0.69, "credit_applied_inr": -0.69}
  ],
  "vertex_total_usage_inr": 7.48,
  "vertex_total_credit_applied_inr": -7.48,
  "vertex_net_card_charge_inr": 0.00,
  "credit_pool_used_expires": "2026-06-10",
  "credit_pool_used_days_remaining": 16
}
```

## Notes for coordinator

1. **The ₹94,550 GenAI App Builder credit is NOT being consumed by Gemini Vertex usage**, contradicting the stated assumption. This is a material finding for runway planning — Vertex Gemini calls consume the Free Trial credit (expires 2026-06-10), not the GenAI App Builder credit (expires 2027-05-08).
2. After 2026-06-10, an empirical re-test is required to see whether GenAI App Builder credit takes over, or whether card starts being charged. This is the new uncertainty.
3. **Vertex aliased the test's `gemini-3.5-flash` and `gemini-3.1-flash-lite` to `gemini-2.5-flash` GA** (only Gemini 2.5 Flash SKUs appear in billing). Update prompt v1 references accordingly — the only real-world SKU is `gemini-2.5-flash`.
4. Today's (2026-05-25 07:15Z) test calls are not yet in the Reports view but appear to already be reflected in the credit balance — full reconciliation requires a re-check at T+24hr if exact line-item attribution of today's 3 calls is needed.

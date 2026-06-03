/**
 * Per-call USD cost estimator for the v2 classifier's Gemini calls.
 *
 * Prices are from the Vertex AI generative AI pricing page (2026-05-28):
 *   https://cloud.google.com/vertex-ai/generative-ai/pricing
 *
 * gemini-3.5-flash:       in $1.50 / out $9.00  per 1M tokens (≤200K context)
 * gemini-3.1-pro-preview: in $2.00 / out $12.00 per 1M tokens (≤200K context)
 * gemini-2.5-pro:         in $1.25 / out $10.00 per 1M tokens (≤200K context)
 *
 * thoughtsTokens are billed at the output rate (Gemini billing spec).
 * This estimator is for cost tracking and eval diagnostics, not billing.
 */
import type { GeminiModel, GenerateContentUsage } from './lib/vertex-client';

const PRICE: Record<GeminiModel, { in: number; out: number }> = {
  'gemini-3.5-flash':       { in: 1.50, out:  9.00 },
  'gemini-3.1-pro-preview': { in: 2.00, out: 12.00 },
  'gemini-2.5-pro':         { in: 1.25, out: 10.00 },
};

/**
 * OpenRouter candidate-model prices (USD per 1M tokens), for the EVAL-ONLY
 * `LLM_PROVIDER=openrouter` A/B lever. Sourced from OpenRouter `/api/v1/models`
 * (2026-06-03). Keyed by the OpenRouter model id (the value of `OPENROUTER_MODEL`)
 * so the A3 token meter can price a candidate run with REAL per-token cost
 * instead of falling back to the $0 unpriced path. NOT part of the Gemini
 * `PRICE` table (those are `GeminiModel`-typed); these ids are arbitrary strings.
 *
 * NOTE: Qwen3.7-Max prompt/completion reflected an active 50%-off promo at
 * capture time ($1.25 in / $3.75 out); re-verify against OpenRouter before
 * trusting the cost roll-up if the promo has ended.
 */
const OPENROUTER_PRICE: Record<string, { in: number; out: number }> = {
  'qwen/qwen3.7-max':       { in: 1.25,  out: 3.75 },
  'moonshotai/kimi-k2.6':   { in: 0.684, out: 3.42 },
  'xiaomi/mimo-v2.5-pro':   { in: 0.435, out: 0.87 },
};

/** Estimated USD for one Gemini call. thoughtsTokens bill as output on Gemini. */
export function estimateCostUsd(model: GeminiModel, u: GenerateContentUsage): number {
  const p = PRICE[model];
  // TODO(A4): bills FULL promptTokens at input rate; once context caching lands,
  // discount cachedTokens (cached input bills cheaper / free on free tier) or this
  // overstates cost.
  return (u.promptTokens / 1e6) * p.in + ((u.outputTokens + u.thoughtsTokens) / 1e6) * p.out;
}

/** True iff `model` has a price entry (a chat model `estimateCostUsd` can price). */
export function isPricedGeminiModel(model: string): model is GeminiModel {
  return model in PRICE;
}

/**
 * Embedding model ids that legitimately have no generateContent token price and
 * are EXPECTED to estimate at $0 — so they must NOT trigger the unpriced-model
 * warning below. The embedding SKU is priced (if at all) on the retrieval side,
 * not via this chat-token estimator.
 */
const KNOWN_EMBEDDING_MODELS: ReadonlySet<string> = new Set(['gemini-embedding-001']);

/**
 * One-time dedupe of unpriced-model warnings: a model id is warned about at most
 * once per process so a full eval run does not spam the log.
 */
const warnedUnpricedModels = new Set<string>();

/**
 * Estimated USD for one call by an arbitrary model id (A3 real-token path).
 * Returns 0 for models without a chat price entry (e.g. `gemini-embedding-001`,
 * which has no generateContent token price and is not metered here) so an
 * unknown/embedding key can never throw. Reuses `estimateCostUsd` for priced models.
 *
 * Cost-integrity guard: if a metered model id is NOT a known embedding id AND not
 * in the PRICE table (e.g. a drifted chat id like 'gemini-3.5-flash-001'), it
 * would silently price at $0 while `cost_is_real` stays true. Emit a one-time
 * (deduped) warning naming the model so the drift is visible. Never throws.
 */
export function estimateCostUsdByModel(model: string, u: GenerateContentUsage): number {
  if (isPricedGeminiModel(model)) {
    return estimateCostUsd(model, u);
  }
  // EVAL-ONLY OpenRouter candidate models: price from the OpenRouter table so an
  // A/B run reports REAL per-token cost (thoughtsTokens bill at the output rate,
  // same convention as Gemini).
  const orPrice = OPENROUTER_PRICE[model];
  if (orPrice !== undefined) {
    return (u.promptTokens / 1e6) * orPrice.in + ((u.outputTokens + u.thoughtsTokens) / 1e6) * orPrice.out;
  }
  if (!KNOWN_EMBEDDING_MODELS.has(model) && !warnedUnpricedModels.has(model)) {
    warnedUnpricedModels.add(model);
    console.warn(
      `[cost] metered model '${model}' has no PRICE entry and is not a known embedding id — pricing it at $0. ` +
        `If this is a real chat model, add it to the PRICE table; cost estimates are understated until then.`,
    );
  }
  return 0;
}

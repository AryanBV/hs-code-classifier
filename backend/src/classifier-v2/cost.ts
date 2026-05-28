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

/** Estimated USD for one Gemini call. thoughtsTokens bill as output on Gemini. */
export function estimateCostUsd(model: GeminiModel, u: GenerateContentUsage): number {
  const p = PRICE[model];
  return (u.promptTokens / 1e6) * p.in + ((u.outputTokens + u.thoughtsTokens) / 1e6) * p.out;
}

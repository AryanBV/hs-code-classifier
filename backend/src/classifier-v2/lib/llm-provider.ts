/**
 * Hybrid LLM-provider seam for the Phase 4 v2 generateContent path (Phase A2).
 *
 * The v2 pipeline (L1 Triage, L4 Select, Gemini-Flash reranker) calls a single
 * `generateContent` primitive. Until A2 that primitive lived in
 * `lib/vertex-client.ts` (raw-HTTPS Vertex AI). A2 introduces a provider SEAM so
 * the SAME calls can be served by the Gemini Developer API free-tier key (Vertex
 * billing was disabled 2026-06-01) WITHOUT touching any layer logic.
 *
 * This is ADDITIVE and BEHAVIOR-PRESERVING:
 *   - The Vertex path is preserved byte-for-byte as the 'vertex' provider, an
 *     adapter that delegates straight to `vertex-client.generateContent`. It is
 *     the instant-rollback escape hatch (`LLM_PROVIDER=vertex`).
 *   - The new DEFAULT is the 'developer' provider (Gemini Developer API via
 *     @google/genai), which maps our exact options + return contract.
 *
 * Call sites import `generateContent` + the options/result/error types FROM HERE
 * (not from vertex-client) so the active provider is selected in ONE place. The
 * options type, result type, `MaxTokensError`, `sanitizeResponseSchema`, the
 * `VertexResponseSchema`/`GeminiModel` types, and the `GenerateContentUsage`
 * shape are all REUSED from `vertex-client.ts` — nothing is reimplemented.
 *
 * Provider is chosen by env `LLM_PROVIDER` (default 'developer'; 'vertex' for
 * rollback) and cached as a module singleton.
 */
import {
  generateContent as vertexGenerateContent,
  MaxTokensError,
  type GenerateContentOptions,
  type GenerateContentResult,
} from './vertex-client';
import { GeminiDeveloperLlmProvider } from './gemini-developer-client';
import { OpenRouterLlmProvider } from './openrouter-client';
import { recordUsage } from './token-meter';
import { getRateLimiter } from './rate-limiter';

/* Re-export the shared contract so call sites have a single import surface. */
export type {
  GenerateContentOptions,
  GenerateContentResult,
  GenerateContentUsage,
  GeminiModel,
  VertexResponseSchema,
} from './vertex-client';
export { MaxTokensError, sanitizeResponseSchema } from './vertex-client';

/**
 * The provider contract: a single `generateContent` that takes the exact same
 * options the Vertex client accepts and returns the exact same result shape.
 */
export interface LlmProvider {
  generateContent(opts: GenerateContentOptions): Promise<GenerateContentResult>;
}

/**
 * Adapter that preserves the existing Vertex path verbatim. Delegates straight
 * to `vertex-client.generateContent` — no behavior change, the rollback target.
 */
class VertexLlmProvider implements LlmProvider {
  generateContent(opts: GenerateContentOptions): Promise<GenerateContentResult> {
    return vertexGenerateContent(opts);
  }
}

export type LlmProviderName = 'developer' | 'vertex' | 'openrouter';

let cached: LlmProvider | null = null;
let cachedFor: string | null = null;

/**
 * Resolve the active LLM provider from env `LLM_PROVIDER`:
 *   - unset / 'developer' → GeminiDeveloperLlmProvider (DEFAULT, Gemini Dev API)
 *   - 'vertex'            → VertexLlmProvider (preserved Vertex path, rollback)
 *   - 'openrouter'        → OpenRouterLlmProvider (⚠️ EVAL-ONLY A/B lever —
 *                           routes L1/L4/reranker to an OpenRouter candidate model
 *                           via `OPENROUTER_MODEL`. NEVER set this in production.)
 *   - anything else       → throws a clear error
 *
 * Cached as a module singleton, keyed by the resolved choice so a test (or a
 * staged rollout) that flips the env between calls re-resolves rather than being
 * frozen to the first value seen.
 */
export function getLlmProvider(): LlmProvider {
  const choice = (process.env.LLM_PROVIDER ?? 'developer').trim().toLowerCase();
  if (cached !== null && cachedFor === choice) {
    return cached;
  }

  let provider: LlmProvider;
  switch (choice) {
    case '':
    case 'developer':
      provider = new GeminiDeveloperLlmProvider();
      break;
    case 'vertex':
      provider = new VertexLlmProvider();
      break;
    case 'openrouter':
      // EVAL-ONLY: A/B candidate models against the frozen Gemini baseline on the
      // gold suite. Inert unless explicitly selected; must never be set in Railway.
      provider = new OpenRouterLlmProvider();
      break;
    default:
      throw new Error(
        `Unknown LLM_PROVIDER='${choice}'. Supported: 'developer' (default, Gemini Developer API), ` +
          `'vertex' (rollback), or 'openrouter' (EVAL-ONLY A/B lever — set OPENROUTER_MODEL; never in production).`,
      );
  }

  cached = provider;
  cachedFor = choice;
  return provider;
}

/**
 * FACADE — the single `generateContent` every call site imports. Delegates to
 * the active provider. Same signature + return contract as the Vertex client.
 *
 * A3 token meter: this is the SINGLE capture point for BOTH providers. After the
 * impl returns (and before we return to the caller), the call's real token usage
 * is recorded into the request-scoped meter via `recordUsage`. `recordUsage` is a
 * no-op when no meter is active, so this is fully behavior-preserving — the
 * returned result is byte-identical. `result.usage` may carry the Developer-API
 * `cachedTokens` superset; the meter reads `cachedTokens ?? 0`, so the Vertex
 * path (undefined) stays correct.
 *
 * MAX_TOKENS path: both providers throw `MaxTokensError` (which carries the real
 * `usage` consumed before truncation) INSTEAD of returning a result, so the
 * success-path recordUsage above never runs for those calls. We record the
 * carried usage here in the catch and rethrow so the error still propagates
 * unchanged. Success and throw are mutually exclusive — exactly one recordUsage
 * fires per call, so there is no double-count.
 *
 * PROACTIVE RATE LIMIT: BEFORE delegating to the provider impl we `acquire()` one
 * token from the process-wide rate limiter (token bucket sized to `GEMINI_RPM`).
 * Exactly ONE acquire per `generateContent` call. When `GEMINI_RPM` is unset the
 * limiter is a no-op (acquire resolves immediately), so this is byte-identical to
 * today. The reactive 429 retry in the provider stays as the safety net. The
 * embedding path is NOT gated here — embeddings are a separate quota.
 */
export async function generateContent(
  opts: GenerateContentOptions,
): Promise<GenerateContentResult> {
  await getRateLimiter().acquire();
  try {
    const result = await getLlmProvider().generateContent(opts);
    // Key the meter on the model the provider actually used (result.model),
    // not the requested literal — under LLM_PROVIDER=openrouter opts.model is a
    // Gemini placeholder, so eval cost must attribute to the real candidate id.
    // On the Gemini path result.model === opts.model, so behavior is unchanged.
    recordUsage(result.model ?? opts.model, result.usage);
    return result;
  } catch (err) {
    if (err instanceof MaxTokensError) {
      recordUsage(err.model ?? opts.model, err.usage);
    }
    throw err;
  }
}

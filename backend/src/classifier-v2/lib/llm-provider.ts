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
  type GenerateContentOptions,
  type GenerateContentResult,
} from './vertex-client';
import { GeminiDeveloperLlmProvider } from './gemini-developer-client';

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

export type LlmProviderName = 'developer' | 'vertex';

let cached: LlmProvider | null = null;
let cachedFor: string | null = null;

/**
 * Resolve the active LLM provider from env `LLM_PROVIDER`:
 *   - unset / 'developer' → GeminiDeveloperLlmProvider (DEFAULT, Gemini Dev API)
 *   - 'vertex'            → VertexLlmProvider (preserved Vertex path, rollback)
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
    default:
      throw new Error(
        `Unknown LLM_PROVIDER='${choice}'. Supported: 'developer' (default, Gemini Developer API) or 'vertex' (rollback).`,
      );
  }

  cached = provider;
  cachedFor = choice;
  return provider;
}

/**
 * FACADE — the single `generateContent` every call site imports. Delegates to
 * the active provider. Same signature + return contract as the Vertex client.
 */
export async function generateContent(
  opts: GenerateContentOptions,
): Promise<GenerateContentResult> {
  return getLlmProvider().generateContent(opts);
}

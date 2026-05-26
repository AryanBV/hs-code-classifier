/**
 * Smoke test: Vertex AI service-account auth + Gemini 3.x calls (BOTH tiers).
 *
 * v2 ARCHITECTURE MODEL TIERS (locked 2026-05-26, see backend/docs/ARCHITECTURE.md):
 *   - gemini-3.5-flash  → Triage + Select stages (thinking_level: 'low')
 *   - gemini-3.1-pro    → Tiebreak + Deep-Think stages (thinking_level: 'high')
 * This script smoke-tests BOTH so we catch tier-availability regressions early.
 *
 * Prereqs:
 *   - Service account JSON at backend/.gcp/vertex-sa.json
 *   - SA has roles/aiplatform.user on project gen-lang-client-0962892937
 *   - GOOGLE_APPLICATION_CREDENTIALS set in backend/.env (relative path ./.gcp/vertex-sa.json)
 *
 * Run from backend/:
 *   npx tsx scripts/verify-vertex-sa.ts
 *
 * Expected: HTTP 200 from BOTH Flash and Pro calls, response containing "OK".
 *
 * SDK NOTE: This uses raw HTTP via `google-auth-library` because both tiers are
 * reachable that way today. The modern `@google/genai` SDK is the recommended
 * long-term path; the legacy `@google-cloud/vertexai` SDK is deprecated and
 * should NOT be added.
 *
 * REQUEST-SHAPE NOTE: Use the `thinking_level` enum ('low' | 'high') — do NOT
 * mix it with the integer `thinkingBudget` field (mixing them returns HTTP 400).
 *
 * EMPIRICAL FINDING (2026-05-25, verified via probe-vertex-gemini.ts):
 *   - gemini-3.5-flash is ONLY accessible via region "global" on this project
 *     (not us-central1, us-east5, europe-west1).
 *   - gemini-3.1-pro is also reachable at "global" on this project.
 *   - The "global" region uses host `aiplatform.googleapis.com` (no region prefix).
 *   - Gemini 3.x is a "thinking model" — set thinking_level='low' for fast Flash
 *     calls so most of maxOutputTokens lands on the visible answer, and
 *     thinking_level='high' for Pro deep-think calls where reasoning is required.
 *   - Verified accessible to this SA:
 *       gemini-3.5-flash       @ global       (HTTP 200)
 *       gemini-3.1-pro         @ global       (HTTP 200)
 *       gemini-3.1-flash-lite  @ global       (HTTP 200)
 *       gemini-2.5-flash       @ us-central1  (HTTP 200)
 *       gemini-2.5-pro         @ us-central1  (HTTP 200)
 *       gemini-2.5-flash-lite  @ us-central1  (HTTP 200)
 *   - Not accessible (HTTP 404 — model not GA in this project / not yet released):
 *       gemini-3.1-flash, gemini-3.0-flash
 *       gemini-2.0-*, gemini-1.5-*  (deprecated/removed)
 */
import 'dotenv/config';
import { GoogleAuth, AuthClient } from 'google-auth-library';

const PROJECT_ID = 'gen-lang-client-0962892937';
const LOCATION = 'global';

// v2 architecture model tiers (see header comment).
const MODEL_FLASH = 'gemini-3.5-flash';
const MODEL_PRO = 'gemini-3.1-pro';

type ThinkingLevel = 'low' | 'high';

interface GenerateContentResponse {
  candidates: Array<{
    content: { parts?: Array<{ text?: string; thoughtSignature?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
}

interface TierResult {
  model: string;
  thinking_level: ThinkingLevel;
  latency_ms: number;
  finish_reason: string | undefined;
  usage: Record<string, number | undefined>;
  response_text: string;
  modelVersion: string | undefined;
}

async function callGemini(
  client: AuthClient,
  model: string,
  thinkingLevel: ThinkingLevel,
  maxOutputTokens: number,
): Promise<TierResult> {
  // "global" region uses no region prefix in the host.
  const host =
    LOCATION === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${LOCATION}-aiplatform.googleapis.com`;
  const url = `${host}/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  console.log(`POST ${url}  (thinking_level=${thinkingLevel})`);

  const t0 = Date.now();
  const res = await client.request<GenerateContentResponse>({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: {
        maxOutputTokens,
        temperature: 0,
        // Use the thinking_level enum — DO NOT mix with integer thinkingBudget
        // (mixing them causes HTTP 400 INVALID_ARGUMENT).
        thinkingConfig: { thinking_level: thinkingLevel },
      },
    },
  });
  const elapsedMs = Date.now() - t0;

  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
  return {
    model,
    thinking_level: thinkingLevel,
    latency_ms: elapsedMs,
    finish_reason: res.data.candidates?.[0]?.finishReason,
    usage: res.data.usageMetadata ?? {},
    response_text: text,
    modelVersion: res.data.modelVersion,
  };
}

function logResult(label: string, r: TierResult): void {
  console.log(`SUCCESS — ${label}`);
  console.log('  model:          ', r.model);
  console.log('  thinking_level: ', r.thinking_level);
  console.log('  region:         ', LOCATION);
  console.log('  modelVersion:   ', r.modelVersion);
  console.log('  latency_ms:     ', r.latency_ms);
  console.log('  finish_reason:  ', r.finish_reason);
  console.log('  usage:          ', JSON.stringify(r.usage));
  console.log('  response_text:  ', JSON.stringify(r.response_text));
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS not set. Add to backend/.env: GOOGLE_APPLICATION_CREDENTIALS=./.gcp/vertex-sa.json',
    );
  }
  console.log('Using credentials:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();

  // Tier 1: Flash (Triage + Select) — fast, low thinking.
  const flashResult = await callGemini(client, MODEL_FLASH, 'low', 16);
  logResult('Flash tier (Triage/Select)', flashResult);

  console.log('');

  // Tier 2: Pro (Tiebreak + Deep-Think) — more budget, high thinking.
  const proResult = await callGemini(client, MODEL_PRO, 'high', 256);
  logResult('Pro tier (Tiebreak/Deep-Think)', proResult);

  console.log('\nBOTH TIERS REACHABLE — v2 architecture auth path is healthy.');
}

main().catch((e: unknown) => {
  const err = e as { message?: string; code?: number; response?: { data?: unknown } };
  console.error('FAILED:', err.message);
  if (err.code) console.error('  HTTP code:', err.code);
  if (err.response?.data) console.error('  body:', JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});

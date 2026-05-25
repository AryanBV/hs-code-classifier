/**
 * Smoke test: Vertex AI service-account auth + Gemini 3.5 Flash call.
 *
 * Prereqs:
 *   - Service account JSON at backend/.gcp/vertex-sa.json
 *   - SA has roles/aiplatform.user on project gen-lang-client-0962892937
 *   - GOOGLE_APPLICATION_CREDENTIALS set in backend/.env (relative path ./.gcp/vertex-sa.json)
 *
 * Run from backend/:
 *   npx tsx scripts/verify-vertex-sa.ts
 *
 * Expected: HTTP 200 + response containing "OK".
 *
 * EMPIRICAL FINDING (2026-05-25, verified via probe-vertex-gemini.ts):
 *   - gemini-3.5-flash is ONLY accessible via region "global" on this project (not us-central1, us-east5, europe-west1).
 *   - The "global" region uses host `aiplatform.googleapis.com` (no region prefix).
 *   - Gemini 3.x is a "thinking model" — must set thinkingConfig.thinkingBudget=0
 *     or allocate enough maxOutputTokens to cover both thoughts + final answer.
 *   - Verified accessible to this SA:
 *       gemini-3.5-flash       @ global       (HTTP 200)
 *       gemini-3.1-flash-lite  @ global       (HTTP 200)
 *       gemini-2.5-flash       @ us-central1  (HTTP 200)
 *       gemini-2.5-pro         @ us-central1  (HTTP 200)
 *       gemini-2.5-flash-lite  @ us-central1  (HTTP 200)
 *   - Not accessible (HTTP 404 — model not GA in this project / not yet released):
 *       gemini-3.1-flash, gemini-3.1-pro, gemini-3.0-flash
 *       gemini-2.0-*, gemini-1.5-*  (deprecated/removed)
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'gen-lang-client-0962892937';
const LOCATION = 'global';
const MODEL = 'gemini-3.5-flash';

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

  // "global" region uses no region prefix in the host.
  const host =
    LOCATION === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${LOCATION}-aiplatform.googleapis.com`;
  const url = `${host}/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  console.log('POST', url);

  const t0 = Date.now();
  const res = await client.request<GenerateContentResponse>({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: {
        maxOutputTokens: 16,
        temperature: 0,
        // Gemini 3.x is a thinking model; thinkingBudget=0 forces a non-thinking
        // response so maxOutputTokens applies fully to the visible answer.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  });
  const elapsedMs = Date.now() - t0;

  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
  console.log('SUCCESS');
  console.log('  model:        ', MODEL);
  console.log('  region:       ', LOCATION);
  console.log('  modelVersion: ', res.data.modelVersion);
  console.log('  latency_ms:   ', elapsedMs);
  console.log('  finish_reason:', res.data.candidates?.[0]?.finishReason);
  console.log('  usage:        ', JSON.stringify(res.data.usageMetadata ?? {}));
  console.log('  response_text:', JSON.stringify(text));
}

main().catch((e: unknown) => {
  const err = e as { message?: string; code?: number; response?: { data?: unknown } };
  console.error('FAILED:', err.message);
  if (err.code) console.error('  HTTP code:', err.code);
  if (err.response?.data) console.error('  body:', JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});

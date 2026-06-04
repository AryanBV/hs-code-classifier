/**
 * Pre-spend verification for the Vertex eval on the NEW Prevyl project via ADC.
 *
 * Confirms, with ONE tiny Flash call (~16 output tokens, negligible cost):
 *   1. credentials = user ADC (`gcloud auth application-default login`), NOT the
 *      old service-account key (we ABORT if GOOGLE_APPLICATION_CREDENTIALS is set);
 *   2. target project = GOOGLE_CLOUD_PROJECT from .env (must be the Prevyl project);
 *   3. Vertex AI is actually reachable + gemini-3.5-flash is available there.
 *
 * A successful call on the Prevyl project is itself proof the active credential
 * has access to Prevyl — the old SA (a different project) could not.
 *
 * Run from backend/:  npx tsx --require dotenv/config scripts/verify-vertex-adc.ts
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

const EXPECTED_PREVYL = 'prevyl'; // the REAL GCP project (num 49530374899) under aryan@prevyl.com; NOT the AI-Studio gen-lang-client-0933279785 (personal account)
const OLD_PROJECT = 'gen-lang-client-0962892937';
const LOCATION = 'global';
const MODEL_FLASH = 'gemini-3.5-flash';

async function main(): Promise<void> {
  console.log('=== Vertex ADC pre-spend verification ===');
  console.log('LLM_PROVIDER:           ', process.env.LLM_PROVIDER ?? '(unset)');
  console.log('EMBEDDING_PROVIDER:     ', process.env.EMBEDDING_PROVIDER ?? '(unset)');
  console.log('GOOGLE_CLOUD_PROJECT:   ', process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)');

  const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (sa && sa.trim() !== '') {
    console.error(
      `\nABORT: GOOGLE_APPLICATION_CREDENTIALS is still set ("${sa}").\n` +
        'That makes the eval authenticate as that key file (the OLD service\n' +
        'account), not your user login. Remove/comment that line in backend/.env\n' +
        'and re-run. Nothing was called.',
    );
    process.exit(2);
  }
  console.log('GOOGLE_APPLICATION_CREDENTIALS: (unset → using your gcloud user ADC) OK');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error('\nABORT: GOOGLE_CLOUD_PROJECT is not set in backend/.env. Add it and re-run.');
    process.exit(2);
  }
  if (projectId === OLD_PROJECT) {
    console.error(`\nABORT: GOOGLE_CLOUD_PROJECT is the OLD crisis project (${OLD_PROJECT}). Set it to the Prevyl project ${EXPECTED_PREVYL}.`);
    process.exit(2);
  }
  if (projectId !== EXPECTED_PREVYL) {
    console.log(`\nNOTE: GOOGLE_CLOUD_PROJECT is ${projectId}, not the expected Prevyl id ${EXPECTED_PREVYL}. Continuing, but confirm this is the project with the $300 credit.`);
  }

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  // Identity sniff (best-effort; ADC user creds may not expose an email).
  try {
    const creds = (await auth.getCredentials()) as { client_email?: string };
    if (creds.client_email) {
      console.log('Active credential client_email:', creds.client_email, '<-- if this is an @...iam.gserviceaccount.com, it is the WRONG (SA) identity');
    } else {
      console.log('Active credential: user ADC (no service-account email) OK');
    }
  } catch {
    console.log('Active credential: user ADC (identity introspection skipped)');
  }

  const client = await auth.getClient();
  const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${MODEL_FLASH}:generateContent`;
  console.log(`\nPOST ${url}`);

  const t0 = Date.now();
  const res = await client.request<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: Record<string, number>;
    modelVersion?: string;
  }>({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0, thinkingConfig: { thinking_level: 'low' } },
    },
  });
  const ms = Date.now() - t0;
  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';

  console.log('\n✅ SUCCESS — Vertex reachable on the target project.');
  console.log('  project:       ', projectId);
  console.log('  model:         ', res.data.modelVersion ?? MODEL_FLASH);
  console.log('  latency_ms:    ', ms);
  console.log('  response_text: ', JSON.stringify(text));
  console.log('  usage:         ', JSON.stringify(res.data.usageMetadata ?? {}));
  console.log('\nThis call billed to project', projectId, '— check Billing -> Reports to confirm it drew from the trial CREDIT, not your card.');
}

main().catch((e: unknown) => {
  const err = e as { message?: string; code?: number | string; response?: { data?: unknown } };
  console.error('\n❌ FAILED:', err.message);
  if (err.code) console.error('  HTTP code:', err.code);
  if (err.response?.data) console.error('  body:', JSON.stringify(err.response.data, null, 2));
  console.error('\n(No charge of concern — a failure here means auth/project/model is not set right yet; we fix it before the smoke.)');
  process.exit(1);
});

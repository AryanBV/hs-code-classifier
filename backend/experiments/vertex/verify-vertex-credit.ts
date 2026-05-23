/**
 * Verify Vertex AI Express API key works and a Gemini 2.5 Flash call succeeds.
 *
 * Two read-only API calls (Flash and 2.0 Flash as fallback). Confirms:
 *  - GCP_VERTEX_API_KEY in backend/.env is a valid Vertex AI Express key
 *  - The vertex-express service account has Gemini access
 *  - Project gen-lang-client-0962892937 routes the call to billing
 *
 * If the call succeeds, check billing report in ~24h:
 *   console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports
 *   Filter by service "Vertex AI". If the cost shows under a credit (NOT charged to card),
 *   the GCP credits are usable for runtime classifier calls.
 *
 * Cost: ~$0.00005 (one tiny prompt + tiny response, well under 1 paisa).
 *
 * Run: cd backend && npx tsx scripts/verify-vertex-credit.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.GCP_VERTEX_API_KEY;

interface VertexResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code: number; message: string; status: string };
}

async function callVertexExpress(model: string, prompt: string): Promise<{ status: number; statusText: string; elapsedMs: number; body: string }> {
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 16, temperature: 0 },
  };

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  return { status: res.status, statusText: res.statusText, elapsedMs, body: text };
}

function interpret(status: number, body: string): { verdict: 'PASS' | 'FAIL'; reason: string; hint: string } {
  if (status === 200) {
    return {
      verdict: 'PASS',
      reason: 'Call succeeded. API key is valid and Vertex AI is reachable.',
      hint: 'Check billing report tomorrow to confirm credit was consumed (not card).',
    };
  }
  if (status === 401 || status === 403) {
    return {
      verdict: 'FAIL',
      reason: 'Auth rejected. Key likely invalid, restricted, or service account lacks permission.',
      hint: 'Verify API key 1 was copied correctly. Check it has no API restrictions in credentials page.',
    };
  }
  if (status === 429) {
    return {
      verdict: 'FAIL',
      reason: 'Rate-limited. Quota issue, not credit issue.',
      hint: 'Wait a minute and retry. Probably project-level quota throttle.',
    };
  }
  if (status === 400 && body.includes('billing')) {
    return {
      verdict: 'FAIL',
      reason: 'Billing problem. Account verification may be actively blocking calls.',
      hint: 'Wait for Google verification review to complete (a few days), then retry.',
    };
  }
  if (status === 404) {
    return {
      verdict: 'FAIL',
      reason: 'Model not found at this endpoint. Express endpoint may not support this model name.',
      hint: 'Try a different model (e.g., gemini-2.0-flash or gemini-2.5-flash-lite).',
    };
  }
  return {
    verdict: 'FAIL',
    reason: `Unexpected HTTP ${status}.`,
    hint: 'Read the response body below for Google\'s error message.',
  };
}

async function main(): Promise<void> {
  console.log('='.repeat(64));
  console.log('Vertex AI Express smoke-test — GCP credit applicability check');
  console.log('='.repeat(64));

  if (!API_KEY || API_KEY === 'your-gcp-vertex-api-key') {
    console.error('\nFAIL: GCP_VERTEX_API_KEY not set in backend/.env (or still placeholder).');
    console.error('Add: GCP_VERTEX_API_KEY=<value from console.cloud.google.com/apis/credentials>');
    process.exit(1);
  }

  console.log(`\nKey loaded: length=${API_KEY.length}, prefix=${API_KEY.slice(0, 6)}..., suffix=...${API_KEY.slice(-4)}`);

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  const prompt = 'Reply with exactly one word: "ok"';

  let anyPass = false;
  for (const model of models) {
    console.log('\n' + '-'.repeat(64));
    console.log(`Trying model: ${model}`);
    console.log('-'.repeat(64));
    console.log(`POST https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`);

    const { status, statusText, elapsedMs, body } = await callVertexExpress(model, prompt);
    console.log(`\nHTTP ${status} ${statusText} (${elapsedMs}ms)`);

    const { verdict, reason, hint } = interpret(status, body);
    console.log(`\n${verdict}: ${reason}`);

    if (status === 200) {
      anyPass = true;
      try {
        const parsed = JSON.parse(body) as VertexResponse;
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
        const usage = parsed.usageMetadata ?? {};
        console.log(`\nResponse text: ${JSON.stringify(text)}`);
        console.log(`Tokens: prompt=${usage.promptTokenCount ?? '?'}, output=${usage.candidatesTokenCount ?? '?'}, total=${usage.totalTokenCount ?? '?'}`);
        // Cost estimate at gemini-2.5-flash pricing ($0.30/$2.50 per MTok)
        const inTok = usage.promptTokenCount ?? 0;
        const outTok = usage.candidatesTokenCount ?? 0;
        const estCost = (inTok / 1_000_000) * 0.30 + (outTok / 1_000_000) * 2.50;
        console.log(`Est cost: $${estCost.toFixed(8)}`);
      } catch {
        console.log('(Response body not JSON-parseable, but status was 200.)');
        console.log('Body:', body.slice(0, 400));
      }
      console.log(`\nNext: ${hint}`);
      break; // Stop on first success — no need to try more models
    } else {
      console.log(`\nBody: ${body.slice(0, 600)}`);
      console.log(`\nNext: ${hint}`);
    }
  }

  console.log('\n' + '='.repeat(64));
  if (anyPass) {
    console.log('OVERALL: Vertex AI Express is reachable from this project.');
    console.log('To confirm credit applied (not card), check this URL in 24h:');
    console.log('  https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports?project=gen-lang-client-0962892937');
    console.log('  Filter by service "Vertex AI" — line item should show credit covering the cost.');
    process.exit(0);
  } else {
    console.log('OVERALL: All model attempts failed. See errors above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

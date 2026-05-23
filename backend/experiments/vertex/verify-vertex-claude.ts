/**
 * Verify Vertex AI Express API key can reach non-Gemini partner models (Claude).
 *
 * Empirical answer to: "Can we use Claude on Vertex with the same API key?"
 *
 * Three test attempts in order:
 *  1. Anthropic-format endpoint on us-east5 (Claude's primary region)
 *  2. Anthropic-format endpoint on global
 *  3. Standard Vertex AI rawPredict endpoint with Anthropic body
 *
 * Cost: ~$0.001 (Claude Haiku 4.5 — cheapest Claude — ~50 tokens total).
 *
 * Run: cd backend && npx tsx scripts/verify-vertex-claude.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.GCP_VERTEX_API_KEY;
const PROJECT_ID = 'gen-lang-client-0962892937';

interface Attempt {
  label: string;
  url: string;
  body: object;
  headers: Record<string, string>;
}

async function tryCall(attempt: Attempt): Promise<{ status: number; statusText: string; elapsedMs: number; body: string }> {
  const t0 = Date.now();
  const res = await fetch(attempt.url, {
    method: 'POST',
    headers: attempt.headers,
    body: JSON.stringify(attempt.body),
  });
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  return { status: res.status, statusText: res.statusText, elapsedMs, body: text };
}

async function main(): Promise<void> {
  console.log('='.repeat(64));
  console.log('Vertex AI Express — partner model access check (Claude Haiku 4.5)');
  console.log('='.repeat(64));

  if (!API_KEY) {
    console.error('FAIL: GCP_VERTEX_API_KEY not set');
    process.exit(1);
  }

  console.log(`\nKey loaded: length=${API_KEY.length}, prefix=${API_KEY.slice(0, 6)}...`);

  // Common Anthropic-on-Vertex body
  const anthropicBody = {
    anthropic_version: 'vertex-2023-10-16',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with one word: ok' }],
  };

  const attempts: Attempt[] = [
    {
      label: '1. Anthropic SDK format on us-east5 with x-goog-api-key',
      url: `https://us-east5-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-east5/publishers/anthropic/models/claude-haiku-4-5:rawPredict`,
      body: anthropicBody,
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    },
    {
      label: '2. Global endpoint with x-goog-api-key',
      url: `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/anthropic/models/claude-haiku-4-5:rawPredict`,
      body: anthropicBody,
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    },
    {
      label: '3. Express endpoint pattern (no project in URL)',
      url: `https://aiplatform.googleapis.com/v1/publishers/anthropic/models/claude-haiku-4-5:rawPredict`,
      body: anthropicBody,
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    },
    {
      label: '4. Express endpoint with streamRawPredict (some routes only)',
      url: `https://aiplatform.googleapis.com/v1/publishers/anthropic/models/claude-haiku-4-5:streamRawPredict`,
      body: anthropicBody,
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    },
  ];

  let anyPass = false;
  for (const attempt of attempts) {
    console.log('\n' + '-'.repeat(64));
    console.log(attempt.label);
    console.log(`POST ${attempt.url}`);
    console.log('-'.repeat(64));

    try {
      const { status, statusText, elapsedMs, body } = await tryCall(attempt);
      console.log(`HTTP ${status} ${statusText} (${elapsedMs}ms)`);

      if (status === 200) {
        anyPass = true;
        try {
          const parsed = JSON.parse(body);
          const text = parsed.content?.[0]?.text ?? '<no text>';
          const usage = parsed.usage ?? {};
          console.log(`\nResponse: ${JSON.stringify(text)}`);
          console.log(`Usage: input_tokens=${usage.input_tokens}, output_tokens=${usage.output_tokens}`);
          console.log('\nSUCCESS: This endpoint/format combo works for Claude via Express key.');
        } catch {
          console.log('Body (raw):', body.slice(0, 400));
        }
        break;
      } else {
        // Print just enough of the body to diagnose
        console.log(`Body: ${body.slice(0, 400)}`);
        if (status === 401 || status === 403) {
          console.log('Hint: Express key may not have access to this endpoint OR partner model requires service-account auth.');
        } else if (status === 404) {
          console.log('Hint: This endpoint pattern is wrong — try the next one.');
        } else if (status === 400) {
          console.log('Hint: Request format off — body or version param.');
        }
      }
    } catch (err) {
      console.log(`Network error: ${(err as Error).message}`);
    }
  }

  console.log('\n' + '='.repeat(64));
  if (anyPass) {
    console.log('VERDICT: Vertex Express API key CAN access Claude (and presumably other partner models).');
    console.log('Means: Claude Sonnet 4.6 / Opus 4.7 / Haiku 4.5 all available with zero extra setup.');
    console.log('Phase 4 model menu = full Vertex Model Garden, not just Gemini.');
  } else {
    console.log('VERDICT: All 4 attempts failed. Express key likely scoped to Gemini only.');
    console.log('To use Claude on Vertex, would need service-account JSON auth (extra setup).');
    console.log('Phase 4 model menu (via this key) = Gemini family only.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

/**
 * Empirical credit-coverage test: which Vertex models actually bill to GCP credits?
 *
 * THEORETICAL claim (per D1-vertex-credit-window-plan.md, sourced from Google docs):
 *   - Free Trial credit excludes "generative AI partner models offered as a managed API"
 *   - GenAI App Builder credit covers Vertex AI Gemini 2.0+ only (Anthropic Partner Models excluded)
 *   - i.e. Claude on Vertex bills to the credit card, NOT credits.
 *
 * EMPIRICAL test: actually call each model with a tiny request, then check the billing
 * console ~1 hour later to see which SKU lines show "Credit applied" vs charged to card.
 *
 * Tiers tested:
 *   T1 (the big claim to falsify): Claude Sonnet 4.6, Opus 4.7, Haiku 4.5 via Vertex Partner Models
 *   T2 (other Vertex Marketplace models): Llama 4 Scout/Maverick, Mistral Large 3, Qwen
 *   T3 (native Google baseline / positive controls): Gemini 3.5 Flash, 3.1 Pro, 3.1 Flash-Lite
 *
 * Each call is intentionally tiny (~10 tokens out, ~100 tokens in). Total max cost ~$0.01.
 * Sequential with 5-sec spacing → unambiguous billing-line attribution.
 *
 * Errors (404, 403, 429) are FINDINGS not failures — they show what the SA can/can't reach.
 *
 * Prereqs (per backend/docs/SETUP-vertex-service-account.md):
 *   - backend/.gcp/vertex-sa.json exists, gitignored
 *   - GOOGLE_APPLICATION_CREDENTIALS=./.gcp/vertex-sa.json in backend/.env
 *   - SA role: roles/aiplatform.user on project gen-lang-client-0962892937
 *   - Vertex AI API enabled
 *
 * Run from backend/:
 *   npx tsx scripts/test-vertex-credit-coverage.ts
 *
 * Then ~1hr later: open the GCP billing console (URL printed at end of run) and
 * follow the procedure in backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md
 * to attribute each line item to credit-or-card billing.
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'gen-lang-client-0962892937';
const BILLING_ACCOUNT = '01735A-7C1CE5-E75B14';
const RESULTS_PATH = path.resolve(
  __dirname,
  '../data/phase-3.5-prompts/vertex-credit-coverage-test.json',
);
const INTER_CALL_DELAY_MS = 5000;

interface TestCase {
  tier: 1 | 2 | 3;
  vendor: 'Google' | 'Anthropic' | 'Meta' | 'Mistral' | 'Alibaba';
  publisher: string; // URL path segment: google | anthropic | meta | mistralai | qwen
  model_id: string;
  location: string;
  endpoint_verb: 'generateContent' | 'rawPredict' | 'streamRawPredict' | 'predict';
  request_body: Record<string, unknown>;
  test_label: string;
  expected_outcome: string; // human-readable hypothesis
}

interface TestResult {
  test_label: string;
  tier: 1 | 2 | 3;
  vendor: string;
  model_id: string;
  location: string;
  endpoint_verb: string;
  endpoint_url: string;
  wall_clock_start_iso: string;
  wall_clock_end_iso: string;
  latency_ms: number;
  http_status: number;
  api_success: boolean;
  response_text_snippet: string | null;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  };
  error_snippet: string | null;
  expected_outcome: string;
  billing_line_match_hint: string; // what to grep for in the billing console
}

function buildUrl(c: TestCase): string {
  // Vertex AI region "global" uses host aiplatform.googleapis.com (no region prefix).
  // Regional endpoints use ${region}-aiplatform.googleapis.com.
  const base =
    c.location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${c.location}-aiplatform.googleapis.com`;
  return `${base}/v1/projects/${PROJECT_ID}/locations/${c.location}/publishers/${c.publisher}/models/${c.model_id}:${c.endpoint_verb}`;
}

const cases: TestCase[] = [
  // ============================================================
  // T3 — Native Google positive controls (these MUST bill to credit)
  // Run FIRST so we have a known-good calibration point if anything else fails.
  // ============================================================
  // EMPIRICAL FIX (2026-05-25, verified via scripts/probe-vertex-gemini.ts on this SA+project):
  // - Gemini 3.x family is ONLY accessible via region "global" (not us-central1/us-east5/europe-west1).
  // - Gemini 3.5 Flash and 3.1 Flash-Lite are accessible @ global; 3.1 Pro and 3.1 Flash return 404 (not in quota).
  // - Gemini 2.5 family is accessible @ us-central1 (used as fallback positive control).
  // - Gemini 3.x is a "thinking model" — set thinkingConfig.thinkingBudget=0 or allocate
  //   enough maxOutputTokens for both thoughts + answer, else parts[].text comes back empty.
  // - Model IDs use dots and dashes per the publishers/google/models/* path.
  {
    tier: 3,
    vendor: 'Google',
    publisher: 'google',
    model_id: 'gemini-3.5-flash',
    location: 'global',
    endpoint_verb: 'generateContent',
    request_body: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: {
        maxOutputTokens: 16,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    test_label: 'T3a: Gemini 3.5 Flash (GA, global) — positive control, should bill to GenAI Builder credit',
    expected_outcome:
      'HTTP 200, billing line "Vertex AI Gemini 3.5 Flash" with credit-applied marker',
  },
  {
    tier: 3,
    vendor: 'Google',
    publisher: 'google',
    model_id: 'gemini-3.1-flash-lite',
    location: 'global',
    endpoint_verb: 'generateContent',
    request_body: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: {
        maxOutputTokens: 16,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    test_label: 'T3b: Gemini 3.1 Flash-Lite (preview, global) — cheapest 3.x available',
    expected_outcome: 'HTTP 200 expected; credit-eligible',
  },
  {
    tier: 3,
    vendor: 'Google',
    publisher: 'google',
    model_id: 'gemini-2.5-flash',
    location: 'us-central1',
    endpoint_verb: 'generateContent',
    request_body: {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    },
    test_label: 'T3c: Gemini 2.5 Flash (GA, us-central1) — known-stable Gemini baseline (deprecates Oct 2026)',
    expected_outcome:
      'HTTP 200, billing line "Vertex AI Gemini 2.5 Flash" with credit-applied marker',
  },

  // ============================================================
  // T1 — Anthropic Partner Models (the BIG claim to falsify)
  // Per D1 plan: theoretically NOT covered by either credit.
  // Per user direction: test anyway.
  // ============================================================
  // EMPIRICAL FIX (2026-05-25, verified via Chrome MCP on Claude Opus 4.7 Documentation tab):
  // 1. Region is "global" (not us-east5) — Anthropic-on-Vertex now uses a single global endpoint.
  //    Console docs show: AnthropicVertex(region="global", project_id=...)
  // 2. Endpoint verb is :streamRawPredict (not :rawPredict) per the curl sample shown.
  //    URL form: https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/anthropic/models/{model}:streamRawPredict
  // 3. anthropic_version remains "vertex-2023-10-16" (unchanged).
  // 4. Model IDs use dashes (claude-opus-4-7) — confirmed from "Model ID" panel on each model card.
  // 5. The streamRawPredict response is server-sent events (SSE); body parsing in extractText
  //    handles only the non-streaming JSON shape, so a streaming response will not extract `text`.
  //    For credit-coverage purposes we ONLY need HTTP 200 + non-empty response — extraction is best-effort.
  {
    tier: 1,
    vendor: 'Anthropic',
    publisher: 'anthropic',
    model_id: 'claude-haiku-4-5',
    location: 'global',
    endpoint_verb: 'streamRawPredict',
    request_body: {
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T1a: Claude Haiku 4.5 via Vertex Partner Models (cheapest Claude)',
    expected_outcome:
      'HTTP 200 if SA+EULA OK and partner model accessible; billing claim: NOT credit-covered',
  },
  {
    tier: 1,
    vendor: 'Anthropic',
    publisher: 'anthropic',
    model_id: 'claude-sonnet-4-6',
    location: 'global',
    endpoint_verb: 'streamRawPredict',
    request_body: {
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T1b: Claude Sonnet 4.6 via Vertex Partner Models — KEY test for Deep-think',
    expected_outcome: 'HTTP 200 OR 403/404 (EULA / partner-model gate); claim: NOT credit-covered',
  },
  {
    tier: 1,
    vendor: 'Anthropic',
    publisher: 'anthropic',
    model_id: 'claude-opus-4-7',
    location: 'global',
    endpoint_verb: 'streamRawPredict',
    request_body: {
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T1c: Claude Opus 4.7 via Vertex Partner Models — most expensive Claude',
    expected_outcome: 'HTTP 200 OR 403/404; claim: NOT credit-covered',
  },

  // ============================================================
  // T2 — Other Vertex Marketplace / Model-Garden models
  // Llama: Google hosts Llama natively on Vertex Model Garden as MaaS.
  // Mistral: Partner Model on Vertex since 2024 (rawPredict like Claude).
  // Qwen: only on AI Studio / GenAI API, not Vertex publisher path — included for completeness.
  // ============================================================
  {
    tier: 2,
    vendor: 'Meta',
    publisher: 'meta',
    model_id: 'llama-4-scout-17b-16e-instruct-maas',
    location: 'us-central1',
    endpoint_verb: 'rawPredict',
    request_body: {
      model: 'meta/llama-4-scout-17b-16e-instruct-maas',
      stream: false,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T2a: Llama 4 Scout via Vertex MaaS — could replace V1 (currently DeepInfra paid)',
    expected_outcome:
      'HTTP 200 if MaaS pay-as-you-go available; billing claim: unknown (test will reveal)',
  },
  {
    tier: 2,
    vendor: 'Meta',
    publisher: 'meta',
    model_id: 'llama-4-maverick-17b-128e-instruct-maas',
    location: 'us-central1',
    endpoint_verb: 'rawPredict',
    request_body: {
      model: 'meta/llama-4-maverick-17b-128e-instruct-maas',
      stream: false,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T2b: Llama 4 Maverick via Vertex MaaS — could replace V1/Select stages',
    expected_outcome: 'HTTP 200 if MaaS available; billing TBD',
  },
  {
    tier: 2,
    vendor: 'Mistral',
    publisher: 'mistralai',
    model_id: 'mistral-large-2411',
    location: 'us-central1',
    endpoint_verb: 'rawPredict',
    request_body: {
      model: 'mistral-large-2411',
      stream: false,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T2c: Mistral Large (latest 2411 SKU) — partner model since 2024',
    expected_outcome:
      'HTTP 200 OR 404 (Mistral Large 3 not on Vertex yet); claim: NOT credit-covered (partner)',
  },
  {
    tier: 2,
    vendor: 'Alibaba',
    publisher: 'qwen',
    model_id: 'qwen3-max',
    location: 'us-central1',
    endpoint_verb: 'rawPredict',
    request_body: {
      model: 'qwen/qwen3-max',
      stream: false,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    },
    test_label: 'T2d: Qwen3 via Vertex (speculative — Qwen may not be on Vertex publisher path)',
    expected_outcome: 'Likely 404 — Qwen typically only available via Alibaba DashScope or DeepInfra',
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractText(c: TestCase, parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  // Gemini shape
  if (c.vendor === 'Google') {
    const candidates = p['candidates'] as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    return candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }
  // Anthropic shape
  if (c.vendor === 'Anthropic') {
    const content = p['content'] as Array<{ text?: string }> | undefined;
    return content?.[0]?.text ?? null;
  }
  // OpenAI-compatible shape (Llama/Mistral/Qwen on Vertex MaaS use this)
  const choices = p['choices'] as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? null;
}

function extractUsage(
  c: TestCase,
  parsed: unknown,
): { input_tokens: number | null; output_tokens: number | null; total_tokens: number | null } {
  if (!parsed || typeof parsed !== 'object') return { input_tokens: null, output_tokens: null, total_tokens: null };
  const p = parsed as Record<string, unknown>;
  if (c.vendor === 'Google') {
    const u = p['usageMetadata'] as Record<string, number> | undefined;
    return {
      input_tokens: u?.promptTokenCount ?? null,
      output_tokens: u?.candidatesTokenCount ?? null,
      total_tokens: u?.totalTokenCount ?? null,
    };
  }
  if (c.vendor === 'Anthropic') {
    const u = p['usage'] as Record<string, number> | undefined;
    const inT = u?.input_tokens ?? null;
    const outT = u?.output_tokens ?? null;
    return {
      input_tokens: inT,
      output_tokens: outT,
      total_tokens: inT !== null && outT !== null ? inT + outT : null,
    };
  }
  const u = p['usage'] as Record<string, number> | undefined;
  return {
    input_tokens: u?.prompt_tokens ?? null,
    output_tokens: u?.completion_tokens ?? null,
    total_tokens: u?.total_tokens ?? null,
  };
}

async function runOne(
  c: TestCase,
  authClient: Awaited<ReturnType<GoogleAuth['getClient']>>,
): Promise<TestResult> {
  const url = buildUrl(c);
  const startIso = new Date().toISOString();
  const t0 = Date.now();

  let httpStatus = 0;
  let apiSuccess = false;
  let responseText: string | null = null;
  let errorSnippet: string | null = null;
  let usage = { input_tokens: null as number | null, output_tokens: null as number | null, total_tokens: null as number | null };

  try {
    // Note: type-arg generic dropped (`authClient.request({...})`) so this file
    // type-checks even before `npm install google-auth-library` runs (it falls
    // back to `any` then). After install, the GoogleAuth client request returns
    // GaxiosResponse<unknown> which is the same shape we destructure below.
    const res = await authClient.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: c.request_body,
      validateStatus: () => true, // capture non-2xx responses, don't throw
    });
    httpStatus = res.status;
    if (res.status >= 200 && res.status < 300) {
      apiSuccess = true;
      responseText = extractText(c, res.data);
      usage = extractUsage(c, res.data);
    } else {
      errorSnippet = JSON.stringify(res.data).slice(0, 500);
    }
  } catch (err) {
    const e = err as { message?: string; code?: number; response?: { data?: unknown; status?: number } };
    httpStatus = e.response?.status ?? e.code ?? 0;
    errorSnippet = e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : e.message ?? 'unknown error';
  }

  const endIso = new Date().toISOString();
  const latencyMs = Date.now() - t0;

  return {
    test_label: c.test_label,
    tier: c.tier,
    vendor: c.vendor,
    model_id: c.model_id,
    location: c.location,
    endpoint_verb: c.endpoint_verb,
    endpoint_url: url,
    wall_clock_start_iso: startIso,
    wall_clock_end_iso: endIso,
    latency_ms: latencyMs,
    http_status: httpStatus,
    api_success: apiSuccess,
    response_text_snippet: responseText ? responseText.slice(0, 200) : null,
    usage,
    error_snippet: errorSnippet,
    expected_outcome: c.expected_outcome,
    billing_line_match_hint: `Look for SKU containing "${c.model_id}" OR vendor "${c.vendor}" with timestamp near ${startIso}`,
  };
}

function printSummaryTable(results: TestResult[]): void {
  const rows: string[] = [
    '',
    '='.repeat(110),
    'PHASE 1 RESULTS — API reachability (Phase 2 billing attribution requires ~1hr wait + console check)',
    '='.repeat(110),
    pad('Tier', 5) + pad('Model', 42) + pad('HTTP', 6) + pad('API OK', 8) + pad('In tok', 8) + pad('Out tok', 8) + pad('Latency', 10),
    '-'.repeat(110),
  ];
  for (const r of results) {
    rows.push(
      pad(`T${r.tier}`, 5) +
        pad(r.model_id, 42) +
        pad(String(r.http_status), 6) +
        pad(r.api_success ? 'YES' : 'no', 8) +
        pad(r.usage.input_tokens?.toString() ?? '-', 8) +
        pad(r.usage.output_tokens?.toString() ?? '-', 8) +
        pad(`${r.latency_ms}ms`, 10),
    );
  }
  rows.push('='.repeat(110));
  console.log(rows.join('\n'));
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + ' ';
  return s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log('Vertex AI credit-coverage test — empirical billing verification');
  console.log('='.repeat(72));
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Billing account: ${BILLING_ACCOUNT}`);
  console.log(`Models to test: ${cases.length}`);
  console.log(`Inter-call delay: ${INTER_CALL_DELAY_MS}ms (helps billing-line attribution)`);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS not set. Complete SETUP-vertex-service-account.md first.',
    );
  }
  console.log(`Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  const overallStartIso = new Date().toISOString();
  console.log(`\nRun start: ${overallStartIso}\n`);

  const results: TestResult[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    console.log(`[${i + 1}/${cases.length}] ${c.test_label}`);
    console.log(`        POST ${buildUrl(c)}`);

    const result = await runOne(c, client);
    results.push(result);

    if (result.api_success) {
      console.log(
        `        OK  HTTP ${result.http_status}  in=${result.usage.input_tokens} out=${result.usage.output_tokens}  text=${JSON.stringify(result.response_text_snippet)}`,
      );
    } else {
      console.log(
        `        FAIL HTTP ${result.http_status}  err=${result.error_snippet?.slice(0, 200)}`,
      );
    }

    if (i < cases.length - 1) {
      await sleep(INTER_CALL_DELAY_MS);
    }
  }

  const overallEndIso = new Date().toISOString();

  // Write results
  const payload = {
    run_start_iso: overallStartIso,
    run_end_iso: overallEndIso,
    project_id: PROJECT_ID,
    billing_account: BILLING_ACCOUNT,
    sa_credentials_path: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    total_cases: cases.length,
    api_successful_count: results.filter((r) => r.api_success).length,
    results,
    phase_2_instructions: {
      check_at_iso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      billing_console_url: `https://console.cloud.google.com/billing/${BILLING_ACCOUNT}/reports?project=${PROJECT_ID}`,
      credit_breakdown_url: `https://console.cloud.google.com/billing/${BILLING_ACCOUNT}/credits/all?project=${PROJECT_ID}`,
      doc: 'See backend/data/phase-3.5-prompts/vertex-credit-coverage-test-plan.md section "Phase 2 — billing attribution"',
    },
  };
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2));

  printSummaryTable(results);

  console.log(`\nResults written: ${RESULTS_PATH}`);
  console.log('\nNEXT (Phase 2 — billing attribution):');
  console.log(`  1. Wait until ${payload.phase_2_instructions.check_at_iso} (~1 hour from now).`);
  console.log(`  2. Open: ${payload.phase_2_instructions.billing_console_url}`);
  console.log(`  3. Filter date range to ${overallStartIso.slice(0, 10)}.`);
  console.log(`  4. Group by SKU. For each model above, find its SKU line.`);
  console.log('  5. Check the "Credit applied" column — if > 0, model is credit-covered.');
  console.log(
    `  6. Update results JSON with phase_2_billing_attribution per model, per the test-plan doc.`,
  );
}

main().catch((err: unknown) => {
  const e = err as { message?: string; stack?: string };
  console.error('UNEXPECTED ERROR:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

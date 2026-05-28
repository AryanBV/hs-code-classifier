/**
 * Phase 4.1 smoke test — exercises the classifier-v2 Vertex client across
 * both Gemini tiers and the 2.5-pro fallback path.
 *
 * Coverage matrix:
 *   (a) gemini-3.5-flash + thinking_level=low   (Triage/Select cost-target path)
 *   (b) gemini-3.5-flash + thinking_level=high  (verifies level switch on Flash)
 *   (c) gemini-3.1-pro-preview + thinking_level=high  (Tiebreak/Deep-Think path)
 *   (d) gemini-2.5-pro + thinking_level=high
 *       (legacy thinkingBudget API — verifies thinkingConfig helper branches)
 *
 * Each call asks the model to reply with "PONG" and prints model + latency
 * + finish reason + response text. Any failure is reported but the script
 * keeps going so we surface ALL failures, not just the first.
 *
 * Token budgets are sized so thinking + generation both fit:
 *   - low-thinking cases: 128 tokens (enough headroom for "PONG" + small overhead)
 *   - high-thinking cases: 512 tokens (high thinking consumes significant budget
 *     before the model emits any generation tokens)
 * If vertex-client's MaxTokensError surfaces despite these budgets, we report
 * it as a soft pass with EXPECTED_MAX_TOKENS so the operator can see it.
 *
 * Run (from `backend/`):
 *   npx ts-node scripts/smoke-classifier-v2.ts            # connectivity (default)
 *   npm run smoke:pipeline                                # full L0→L5 pipeline
 *
 * --pipeline mode (Phase 4.2a Task 13):
 *   Runs the REAL orchestrator (`classify()`) end-to-end against live Gemini
 *   (Vertex) + Cohere + Supabase for one query and prints the full ClassifyResult
 *   plus diagnostics (escalation_path, llm_calls, latency_ms). This is the first
 *   integration check the mocked unit tests can't surface (auth, response-shape
 *   drift, latency, embedding flow). It is NOT an accuracy gate — a structurally
 *   valid CLASSIFY/ASK/REFUSE with no crash is a PASS.
 */
import 'dotenv/config';
import {
  generateContent,
  MaxTokensError,
  type GeminiModel,
  type ThinkingLevel,
} from '../src/classifier-v2/lib/vertex-client';
import { classify } from '../src/classifier-v2/index';

interface SmokeCase {
  label:          string;
  model:          GeminiModel;
  thinkingLevel:  ThinkingLevel;
}

const CASES: SmokeCase[] = [
  { label: '(a) Flash + low',  model: 'gemini-3.5-flash',       thinkingLevel: 'low' },
  { label: '(b) Flash + high', model: 'gemini-3.5-flash',       thinkingLevel: 'high' },
  { label: '(c) Pro   + high', model: 'gemini-3.1-pro-preview', thinkingLevel: 'high' },
  { label: '(d) 2.5-Pro + high (fallback)', model: 'gemini-2.5-pro', thinkingLevel: 'high' },
];

interface CaseResult {
  label:         string;
  model:         GeminiModel;
  thinkingLevel: ThinkingLevel;
  status:        'PASS' | 'FAIL' | 'EXPECTED_MAX_TOKENS';
  latencyMs?:    number;
  finishReason?: string;
  responseText?: string;
  usage?:        { promptTokens: number; outputTokens: number; thoughtsTokens: number; totalTokens: number };
  error?:        string;
}

function shortError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    try { return JSON.stringify(e); } catch { return String(e); }
  }
  return String(e);
}

async function runCase(c: SmokeCase): Promise<CaseResult> {
  // 2.5-pro is only GA on us-central1; Gemini 3.x is only on global.
  const region = c.model === 'gemini-2.5-pro' ? 'us-central1' : 'global';
  try {
    const result = await generateContent({
      model:           c.model,
      prompt:          'Reply with the single word PONG.',
      thinkingLevel:   c.thinkingLevel,
      temperature:     0.0,
      maxOutputTokens: c.thinkingLevel === 'high' ? 512 : 128,
      region,
    });
    return {
      label:         c.label,
      model:         c.model,
      thinkingLevel: c.thinkingLevel,
      status:        'PASS',
      latencyMs:     result.latencyMs,
      finishReason:  result.finishReason,
      responseText:  result.text,
      usage:         result.usage,
    };
  } catch (e: unknown) {
    if (e instanceof MaxTokensError) {
      return {
        label:         c.label,
        model:         c.model,
        thinkingLevel: c.thinkingLevel,
        status:        'EXPECTED_MAX_TOKENS',
        usage:         e.usage,
        responseText:  e.partialText,
        error:         e.message,
      };
    }
    return {
      label:         c.label,
      model:         c.model,
      thinkingLevel: c.thinkingLevel,
      status:        'FAIL',
      error:         shortError(e),
    };
  }
}

function logResult(r: CaseResult): void {
  console.log(`\n=== ${r.label} — ${r.status} ===`);
  console.log('  model:          ', r.model);
  console.log('  thinking_level: ', r.thinkingLevel);
  if (r.status === 'PASS') {
    console.log('  latency_ms:     ', r.latencyMs);
    console.log('  finish_reason:  ', r.finishReason);
    console.log('  usage:          ', JSON.stringify(r.usage));
    console.log('  response_text:  ', JSON.stringify(r.responseText));
  } else if (r.status === 'EXPECTED_MAX_TOKENS') {
    console.log('  note:           ', 'Vertex returned MAX_TOKENS — surfaced via MaxTokensError (expected at small budgets)');
    console.log('  usage:          ', JSON.stringify(r.usage));
    console.log('  partial_text:   ', JSON.stringify(r.responseText));
  } else {
    console.log('  error:          ', r.error);
  }
}

/* ---------------------------------------------------------------------------
 * --pipeline mode — full L0→L5 orchestrator against live APIs (Task 13)
 * --------------------------------------------------------------------------- */

const PIPELINE_QUERY = 'stainless steel hex bolts M10';

/** Fail fast with a clear message if a required cred is missing/misconfigured. */
function assertPipelineEnv(): void {
  const missing: string[] = [];
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push('GOOGLE_APPLICATION_CREDENTIALS');
  if (!process.env.COHERE_API_KEY) missing.push('COHERE_API_KEY');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length > 0) {
    throw new Error(
      `Pipeline smoke requires these env vars but they are unset: ${missing.join(', ')}. ` +
        'This is a CONFIG problem, not a code bug — set them in backend/.env before running.',
    );
  }
}

async function runPipeline(): Promise<void> {
  console.log('Phase 4.2a Task 13 — full-pipeline smoke (REAL Gemini + Cohere + Supabase)');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '<unset>');
  console.log('COHERE_API_KEY:               ', process.env.COHERE_API_KEY ? '<set>' : '<unset>');
  console.log('DATABASE_URL:                 ', process.env.DATABASE_URL ? '<set>' : '<unset>');
  assertPipelineEnv();

  console.log(`\nQuery: ${JSON.stringify(PIPELINE_QUERY)}`);
  console.log('Running classify() end-to-end…\n');

  const t0 = Date.now();
  const result = await classify(PIPELINE_QUERY);
  const wallMs = Date.now() - t0;

  console.log('=== ClassifyResult ===');
  console.log('decision:', result.decision);

  if (result.decision === 'CLASSIFY' && result.classification) {
    const c = result.classification;
    console.log('  code:                ', c.code);
    console.log('  is_six_digit:        ', c.is_six_digit);
    console.log('  export_policy:       ', c.export_policy);
    console.log('  policy_condition:    ', c.policy_condition);
    console.log('  india_specific:      ', c.india_specific);
    console.log('  self_confidence:     ', c.self_confidence);
    console.log('  citation:            ', JSON.stringify(c.citation));
    console.log('  reasoning_chain:     ', JSON.stringify(c.reasoning_chain));
    console.log('  alternatives:        ', JSON.stringify(c.alternatives_considered));
    console.log('  components:          ', JSON.stringify(c.components));
    console.log('  escalated_deep_think:', c.escalated_to_deep_think);
  } else if (result.decision === 'ASK' && result.question) {
    const q = result.question;
    console.log('  question_id:             ', q.question_id);
    console.log('  question_text:           ', q.question_text);
    console.log('  discriminating_attribute:', q.discriminating_attribute);
    console.log('  options:                 ', JSON.stringify(q.options));
  } else if (result.decision === 'REFUSE' && result.refusal) {
    const r = result.refusal;
    console.log('  reason:            ', r.reason);
    console.log('  out_of_scope_class:', r.out_of_scope_class);
    console.log('  verifier_failures: ', JSON.stringify(r.verifier_failures));
  }

  if (result.system_error) {
    console.log('\n  !! system_error:', JSON.stringify(result.system_error));
  }

  console.log('\n=== diagnostics ===');
  console.log('  escalation_path:', JSON.stringify(result.diagnostics.escalation_path));
  console.log('  llm_calls:      ', result.diagnostics.llm_calls);
  console.log('  latency_ms:     ', result.diagnostics.latency_ms, '(internal) /', wallMs, '(wall)');
  // Token usage is not surfaced through the layers (they swallow GenerateContentUsage),
  // so a per-run USD cost via estimateCostUsd() can't be computed here. Cost needs
  // usage-plumbing from each LLM layer up into PipelineRunState (future work).
  console.log('  cost_usd:        n/a — usage not plumbed through layers; printing llm_calls instead');

  console.log('\n========================================');
  const ok = result.decision === 'CLASSIFY' || result.decision === 'ASK' || result.decision === 'REFUSE';
  const sysErr = result.system_error !== undefined;
  if (ok && !sysErr) {
    console.log(`SMOKE PASS — structurally valid ${result.decision} result, no crash, no system_error.`);
  } else if (sysErr) {
    console.log(`SMOKE FAIL — system_error surfaced (stage=${result.system_error?.stage}). Investigate config/transport.`);
  } else {
    console.log('SMOKE FAIL — malformed result (no recognized decision branch).');
  }
  console.log('========================================');

  if (!ok || sysErr) process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes('--pipeline')) {
    await runPipeline();
    return;
  }

  console.log('Phase 4.1 smoke test — classifier-v2 Vertex client');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '<unset>');

  const results: CaseResult[] = [];
  // Sequential — keeps console output deterministic and isolates per-call latency.
  for (const c of CASES) {
    const r = await runCase(c);
    logResult(r);
    results.push(r);
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const expected = results.filter((r) => r.status === 'EXPECTED_MAX_TOKENS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log('\n========================================');
  console.log(`SUMMARY: ${passed}/${results.length} PASS, ${expected} EXPECTED_MAX_TOKENS, ${failed} FAIL`);
  console.log('========================================');

  if (failed > 0) {
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  FAIL: ${r.label} — ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error('smoke-classifier-v2 unexpected fatal:', shortError(e));
  process.exit(2);
});

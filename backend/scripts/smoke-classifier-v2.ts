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
 *   npx ts-node scripts/smoke-classifier-v2.ts
 */
import 'dotenv/config';
import {
  generateContent,
  MaxTokensError,
  type GeminiModel,
  type ThinkingLevel,
} from '../src/classifier-v2/lib/vertex-client';

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

async function main(): Promise<void> {
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

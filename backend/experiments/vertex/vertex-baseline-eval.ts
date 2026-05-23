/**
 * Vertex AI Gemini 2.5 Flash — baseline classification eval.
 *
 * Dual-purpose:
 *  1. Generates ~$0.10-0.30 of Vertex AI usage to verify GCP credit consumption
 *     visible in billing report tomorrow.
 *  2. Produces a real baseline: "how accurate is just-throw-it-at-Gemini-Flash
 *     with no retrieval, no rules, no Verify, just zero-shot classification?"
 *
 * Reads all tier1-manual test cases (~100), sends each query to Gemini 2.5 Flash
 * via Vertex AI Express, logs predicted vs expected codes.
 *
 * Cost: ~$0.10-0.30 (100 calls @ ~1.5K in / 200 out tokens at $0.30/$2.50 per MTok).
 *
 * Run: cd backend && npx tsx scripts/vertex-baseline-eval.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.GCP_VERTEX_API_KEY;
const MODEL = 'gemini-2.5-flash';

interface TestCase {
  id: string;
  query: string;
  expectedChapter?: string;
  expectedHeading?: string;
  expected8Digit?: string;
  category?: string;
}

interface TestSuite {
  category: string;
  testCases: TestCase[];
}

interface PredictionResult {
  case: TestCase;
  predicted_chapter?: string;
  predicted_heading?: string;
  predicted_8digit?: string;
  reasoning?: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  elapsedMs: number;
  http_status: number;
  error?: string;
}

const SYS_PROMPT = `You are an expert classifier for Indian ITC-HS export codes (8-digit format NNNN.NN.NN).

The ITC-HS hierarchy:
- 2-digit Chapter (01-97): broad category
- 4-digit Heading (NNNN): specific class within chapter
- 6-digit Subheading (NNNN.NN): subdivision
- 8-digit Tariff Line (NNNN.NN.NN): India-specific national-level code

Key principles:
- General Interpretive Rules (GIRs) 1-6 govern classification
- Section/Chapter notes are legally binding
- Function-over-material for vehicle parts (Ch.87 Note 2)
- Processing state matters (raw Ch.09 coffee vs processed Ch.21)

For the product description below, output ONLY a JSON object (no markdown fences) with:
  chapter: string (2 digits)
  heading: string (4 digits)
  code: string (8 digits NNNN.NN.NN)
  reasoning: string (1-2 sentences)`;

async function classify(query: string): Promise<{ status: number; elapsedMs: number; data: any }> {
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: `${SYS_PROMPT}\n\nProduct: ${query}` }] }],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0,
      responseMimeType: 'application/json',
    },
  };

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, elapsedMs, data };
}

function loadCases(): TestCase[] {
  const dir = path.resolve(__dirname, '../src/tests/test-data/tier1-manual');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const all: TestCase[] = [];
  for (const file of files) {
    const suite: TestSuite = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const tc of suite.testCases) {
      all.push({ ...tc, category: tc.category ?? suite.category });
    }
  }
  return all;
}

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log(`Vertex AI ${MODEL} — baseline eval on tier1-manual cases`);
  console.log('='.repeat(72));

  if (!API_KEY) { console.error('FAIL: GCP_VERTEX_API_KEY not set'); process.exit(1); }

  const cases = loadCases();
  console.log(`\nLoaded ${cases.length} cases from tier1-manual/*.json\n`);

  const results: PredictionResult[] = [];
  let cumPromptTok = 0, cumOutTok = 0, cumLatencyMs = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`[${i + 1}/${cases.length}] ${tc.id} "${tc.query.slice(0, 50)}..." `);
    try {
      const { status, elapsedMs, data } = await classify(tc.query);
      const promptTok = data?.usageMetadata?.promptTokenCount ?? 0;
      const outTok = data?.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTok = data?.usageMetadata?.totalTokenCount ?? 0;
      cumPromptTok += promptTok;
      cumOutTok += outTok;
      cumLatencyMs += elapsedMs;

      let parsed: any = {};
      if (status === 200) {
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
        try { parsed = JSON.parse(responseText); } catch { parsed = { _parse_error: responseText.slice(0, 100) }; }
      }
      results.push({
        case: tc,
        predicted_chapter: parsed.chapter,
        predicted_heading: parsed.heading,
        predicted_8digit: parsed.code,
        reasoning: parsed.reasoning?.slice(0, 100),
        promptTokens: promptTok,
        outputTokens: outTok,
        totalTokens: totalTok,
        elapsedMs,
        http_status: status,
        error: status !== 200 ? (data?.error?.message ?? data?.raw?.slice(0, 100)) : undefined,
      });

      const exp = tc.expected8Digit ?? tc.expectedHeading ?? tc.expectedChapter ?? '?';
      const pred = parsed.code ?? parsed.heading ?? parsed.chapter ?? 'ERR';
      const match = pred?.startsWith(tc.expectedChapter ?? '') ? '✓' : '✗';
      console.log(`→ ${pred} (exp ${exp}) ${match} ${elapsedMs}ms`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
      results.push({ case: tc, promptTokens: 0, outputTokens: 0, totalTokens: 0, elapsedMs: 0, http_status: 0, error: (err as Error).message });
    }
  }

  // Aggregate metrics
  const chapterMatch = results.filter(r => r.predicted_chapter && r.case.expectedChapter && r.predicted_chapter === r.case.expectedChapter).length;
  const headingMatch = results.filter(r => r.predicted_heading && r.case.expectedHeading && r.predicted_heading === r.case.expectedHeading).length;
  const codeMatch = results.filter(r => r.predicted_8digit && r.case.expected8Digit && r.predicted_8digit === r.case.expected8Digit).length;
  const errors = results.filter(r => r.http_status !== 200).length;
  const succeeded = results.length - errors;

  // Cost calculation (Gemini 2.5 Flash on Vertex: $0.30/MTok input, $2.50/MTok output)
  const costUsd = (cumPromptTok / 1_000_000) * 0.30 + (cumOutTok / 1_000_000) * 2.50;
  const costInr = costUsd * 83;

  console.log('\n' + '='.repeat(72));
  console.log('RESULTS');
  console.log('='.repeat(72));
  console.log(`Cases:           ${results.length}`);
  console.log(`HTTP success:    ${succeeded}/${results.length}`);
  console.log(`Errors:          ${errors}`);
  console.log(`Chapter match:   ${chapterMatch}/${succeeded} (${(100*chapterMatch/succeeded).toFixed(1)}%)`);
  console.log(`Heading match:   ${headingMatch}/${succeeded} (${(100*headingMatch/succeeded).toFixed(1)}%)`);
  console.log(`8-digit match:   ${codeMatch}/${succeeded} (${(100*codeMatch/succeeded).toFixed(1)}%)`);
  console.log('');
  console.log(`Total prompt tokens:  ${cumPromptTok.toLocaleString()}`);
  console.log(`Total output tokens:  ${cumOutTok.toLocaleString()}`);
  console.log(`Total tokens:         ${(cumPromptTok + cumOutTok).toLocaleString()}`);
  console.log(`Avg latency:          ${(cumLatencyMs / results.length).toFixed(0)}ms`);
  console.log('');
  console.log(`Est cost USD: $${costUsd.toFixed(4)}`);
  console.log(`Est cost INR: ₹${costInr.toFixed(2)}`);

  // Write detailed report to disk
  const reportPath = path.resolve(__dirname, '../data/vertex-baseline-eval.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: MODEL,
    totals: { cases: results.length, succeeded, errors, chapterMatch, headingMatch, codeMatch, cumPromptTok, cumOutTok, costUsd, costInr },
    results,
  }, null, 2));
  console.log(`\nDetailed report: ${reportPath}`);
  console.log('\nCheck billing in ~24h to confirm GCP credit consumption:');
  console.log('  https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports?project=gen-lang-client-0962892937');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });

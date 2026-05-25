/**
 * Empirical probe: try multiple (model_id, region) combos to find which Gemini
 * model+region pairing is actually accessible from this SA on this project.
 *
 * Run from backend/:
 *   npx tsx scripts/probe-vertex-gemini.ts
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'gen-lang-client-0962892937';

interface Probe {
  model: string;
  region: string;
  note?: string;
}

// Test in order — stop noting first 200 per model family
const probes: Probe[] = [
  // 2.5 family — known-stable
  { model: 'gemini-2.5-flash', region: 'us-central1', note: 'known-stable baseline' },
  { model: 'gemini-2.5-pro', region: 'us-central1' },
  { model: 'gemini-2.5-flash-lite', region: 'us-central1' },

  // 2.0 family — older stable
  { model: 'gemini-2.0-flash', region: 'us-central1' },
  { model: 'gemini-2.0-flash-001', region: 'us-central1', note: 'versioned' },
  { model: 'gemini-2.0-flash-lite', region: 'us-central1' },

  // 1.5 family — oldest fallback
  { model: 'gemini-1.5-flash', region: 'us-central1' },
  { model: 'gemini-1.5-flash-002', region: 'us-central1', note: 'versioned' },
  { model: 'gemini-1.5-pro', region: 'us-central1' },

  // 3.x family — desired (per smoke test target)
  { model: 'gemini-3.5-flash', region: 'us-central1' },
  { model: 'gemini-3.5-flash', region: 'us-east5' },
  { model: 'gemini-3.5-flash', region: 'europe-west1' },
  { model: 'gemini-3.5-flash', region: 'global', note: 'global endpoint' },
  { model: 'gemini-3.5-flash-001', region: 'us-central1', note: 'versioned variant' },
  { model: 'gemini-3.0-flash', region: 'us-central1' },
  { model: 'gemini-3-flash', region: 'us-central1', note: 'alt naming' },
  { model: 'gemini-3-pro-preview', region: 'us-central1', note: 'alt naming' },
  { model: 'gemini-3.1-flash', region: 'us-central1' },
  { model: 'gemini-3.1-flash-lite', region: 'us-central1' },
  { model: 'gemini-3.1-pro', region: 'us-central1' },
];

interface GResp {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { totalTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
}

function buildUrl(p: Probe): string {
  const base =
    p.region === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${p.region}-aiplatform.googleapis.com`;
  return `${base}/v1/projects/${PROJECT_ID}/locations/${p.region}/publishers/google/models/${p.model}:generateContent`;
}

interface Outcome {
  model: string;
  region: string;
  status: number;
  ok: boolean;
  text: string | null;
  err: string | null;
  ms: number;
  note?: string;
}

async function probe(p: Probe, client: Awaited<ReturnType<GoogleAuth['getClient']>>): Promise<Outcome> {
  const url = buildUrl(p);
  const t0 = Date.now();
  try {
    const res = await client.request<GResp>({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      },
      validateStatus: () => true,
    });
    const ms = Date.now() - t0;
    const status = res.status;
    if (status >= 200 && status < 300) {
      const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      return { model: p.model, region: p.region, status, ok: true, text, err: null, ms, note: p.note };
    }
    const errBody = JSON.stringify(res.data).slice(0, 250);
    return { model: p.model, region: p.region, status, ok: false, text: null, err: errBody, ms, note: p.note };
  } catch (e) {
    const err = e as { code?: number; message?: string; response?: { status?: number; data?: unknown } };
    const ms = Date.now() - t0;
    return {
      model: p.model,
      region: p.region,
      status: err.response?.status ?? err.code ?? 0,
      ok: false,
      text: null,
      err: err.response?.data ? JSON.stringify(err.response.data).slice(0, 250) : err.message ?? 'unknown',
      ms,
      note: p.note,
    };
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + ' ';
  return s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set in backend/.env');
  }
  console.log(`Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
  console.log(`Project:     ${PROJECT_ID}`);
  console.log(`Probes:      ${probes.length}\n`);

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  const outcomes: Outcome[] = [];
  for (let i = 0; i < probes.length; i++) {
    const p = probes[i];
    process.stdout.write(`[${i + 1}/${probes.length}] ${pad(p.model, 30)} ${pad(p.region, 16)} `);
    const o = await probe(p, client);
    outcomes.push(o);
    if (o.ok) {
      process.stdout.write(`OK 200 (${o.ms}ms) "${o.text?.trim().slice(0, 40)}"\n`);
    } else {
      const e = (o.err ?? '').replace(/\s+/g, ' ').slice(0, 130);
      process.stdout.write(`${o.status} (${o.ms}ms) ${e}\n`);
    }
    // small spacing
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY — accessible (model, region) pairs:');
  console.log('='.repeat(100));
  const ok = outcomes.filter((o) => o.ok);
  if (ok.length === 0) {
    console.log('NONE — no probes succeeded. Check SA permissions / API enablement.');
  } else {
    for (const o of ok) {
      console.log(`  ${pad(o.model, 30)} ${pad(o.region, 16)} (${o.ms}ms)`);
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('Status code distribution:');
  console.log('='.repeat(100));
  const byStatus = new Map<number, number>();
  for (const o of outcomes) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const entries = Array.from(byStatus.entries()).sort((a, b) => a[0] - b[0]);
  for (const [code, count] of entries) {
    console.log(`  HTTP ${code}: ${count}`);
  }
}

main().catch((e: unknown) => {
  const err = e as { message?: string };
  console.error('FAILED:', err.message);
  process.exit(1);
});

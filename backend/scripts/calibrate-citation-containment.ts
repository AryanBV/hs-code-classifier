/**
 * Calibration script for the MV-03 citation-fidelity threshold
 * (CITATION_TFIDF_THRESHOLD in src/classifier-v2/lib/verifier-constants.ts).
 *
 * Re-runnable. Measures the token-set-containment metric
 *   score = |verbatim_tokens ∩ source_tokens| / |verbatim_tokens|
 * (the new MV-03 metric, see tfidf-citation-check.ts) on:
 *
 *   FAITHFUL  citations — exact full text, and near-verbatim substrings
 *             (a contiguous slice) of real DB note / exclusion / leaf texts.
 *             A truthful "I copied this from the source" citation.
 *   FABRICATED citations — unrelated real text from a DIFFERENT row paired
 *             against a source row (simulates a model hallucinating / pointing
 *             a source_ref at text it did not actually copy).
 *
 * Prints percentile distributions for each cohort so a threshold can be chosen
 * in the gap. Run:
 *   cd backend
 *   npx tsx --require dotenv/config scripts/calibrate-citation-containment.ts
 */
import { Pool } from 'pg';
import { tokenize, tokenSetContainment } from '../src/classifier-v2/lib/tfidf-citation-check';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:              { rejectUnauthorized: false },
  max:              4,
});

function containment(verbatim: string, source: string): number | null {
  return tokenSetContainment(tokenize(verbatim), tokenize(source));
}

/** Contiguous near-verbatim substring (~60% of the source words). */
function nearVerbatimSlice(source: string): string {
  const words = source.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 6) return source;
  const take = Math.max(4, Math.floor(words.length * 0.6));
  const start = Math.floor((words.length - take) / 2);
  return words.slice(start, start + take).join(' ');
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx] as number;
}

function describe(label: string, scores: number[]): void {
  const valid = scores.filter((s) => Number.isFinite(s)).sort((a, b) => a - b);
  const mean = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  process.stdout.write(
    `${label.padEnd(28)} n=${String(valid.length).padStart(4)}  ` +
      `min=${pct(valid, 0).toFixed(3)} P5=${pct(valid, 5).toFixed(3)} ` +
      `P10=${pct(valid, 10).toFixed(3)} P25=${pct(valid, 25).toFixed(3)} ` +
      `median=${pct(valid, 50).toFixed(3)} mean=${mean.toFixed(3)} ` +
      `P90=${pct(valid, 90).toFixed(3)} max=${pct(valid, 100).toFixed(3)}\n`,
  );
}

async function collectSources(): Promise<string[]> {
  const sources: string[] = [];

  // Chapter notes (jsonb array of { number, text }).
  const ch = await pool.query<{ notes: unknown }>(
    "SELECT notes FROM chapters WHERE notes IS NOT NULL LIMIT 97",
  );
  for (const r of ch.rows) {
    if (Array.isArray(r.notes)) {
      for (const n of r.notes) {
        if (n && typeof n === 'object' && typeof (n as { text?: unknown }).text === 'string') {
          sources.push((n as { text: string }).text);
        }
      }
    }
  }

  // Chapter exclusion source-note text.
  const ex = await pool.query<{ source_note_text: string | null }>(
    "SELECT source_note_text FROM chapter_exclusions WHERE source_note_text IS NOT NULL LIMIT 400",
  );
  for (const r of ex.rows) if (r.source_note_text) sources.push(r.source_note_text);

  // Tariff line descriptions (leaf text).
  const tl = await pool.query<{ description: string | null }>(
    "SELECT description FROM tariff_lines WHERE description IS NOT NULL AND length(description) > 30 LIMIT 400",
  );
  for (const r of tl.rows) if (r.description) sources.push(r.description);

  // Keep only sufficiently long sources (>= 5 tokens, mirrors MV-03 gate).
  return sources.filter((s) => tokenize(s).length >= 5);
}

async function main(): Promise<void> {
  const sources = await collectSources();
  process.stdout.write(`Collected ${sources.length} scorable source texts.\n\n`);

  const faithfulExact: number[] = [];
  const faithfulSlice: number[] = [];
  const fabricated:    number[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i] as string;

    // FAITHFUL — exact full copy.
    const exact = containment(src, src);
    if (exact !== null) faithfulExact.push(exact);

    // FAITHFUL — near-verbatim contiguous slice.
    const slice = containment(nearVerbatimSlice(src), src);
    if (slice !== null) faithfulSlice.push(slice);

    // FABRICATED — verbatim text taken from a DIFFERENT, unrelated row.
    const other = sources[(i + Math.floor(sources.length / 2)) % sources.length] as string;
    if (other !== src) {
      const fab = containment(other, src);
      if (fab !== null) fabricated.push(fab);
    }
  }

  describe('FAITHFUL exact-copy', faithfulExact);
  describe('FAITHFUL near-verbatim-slice', faithfulSlice);
  describe('FABRICATED unrelated-text', fabricated);

  // Sweep candidate thresholds to show the faithful-pass / fabricated-reject
  // trade-off; pick the value that passes ~all faithful while rejecting most
  // fabricated.
  process.stdout.write('\nThreshold sweep (faithful-slice PASS-rate vs fabricated REJECT-rate):\n');
  for (const t of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) {
    const faithfulPass =
      faithfulSlice.filter((s) => s >= t).length / (faithfulSlice.length || 1);
    const fabReject =
      fabricated.filter((s) => s < t).length / (fabricated.length || 1);
    process.stdout.write(
      `  t=${t.toFixed(2)}  faithful-slice PASS=${(faithfulPass * 100).toFixed(1)}%  ` +
        `fabricated REJECT=${(fabReject * 100).toFixed(1)}%\n`,
    );
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    process.stderr.write('CALIBRATION ERROR: ' + (e instanceof Error ? e.stack : String(e)) + '\n');
    process.exit(1);
  });

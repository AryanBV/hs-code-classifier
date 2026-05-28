/**
 * ⚠️ DEPRECATED 2026-05-28 — FROZEN Phase-1 stub. Do NOT use for Phase 4+.
 * The canonical eval is `backend/src/eval/runner.ts` (real classifier, ~386-case
 * master suite). See `backend/eval/DEPRECATED.md` and ARCHITECTURE.md §11.
 *
 * Phase 1 eval runner skeleton — T12 / B1 deliverable.
 *
 * Walks all 168 cases in `backend/eval/cases.json`, calls `classifyStub()` for
 * each query, scores predictions at 2/4/6/8-digit granularity, and writes a
 * baseline JSON report.
 *
 * Phase 4 will swap the stub for the real v2 classifier at
 * `backend/src/classifier-v2/` (locked spec: `backend/docs/ARCHITECTURE.md`,
 * 2026-05-26) and this same runner will produce the first real baseline.
 *
 * v2 metrics to capture (added at Phase 4 wiring time — runner shape supports them):
 *   - Layer 5 Mechanical Verifier rule-failure rates: count per-case how often
 *     the verifier rejected/flagged the Select output (chapter_exclusions hit,
 *     section-note conflict, GIR mis-application). Surfaces classifier
 *     over-confidence at the rule layer without re-running the LLM.
 *   - Per-chapter accuracy segmentation: bucket case results by
 *     `chapterOf(expected_code)` so weak chapters (e.g. 84 machinery, 87
 *     vehicle parts) can be identified post-eval and addressed via targeted
 *     rule / notes-injection work rather than blanket prompt tweaks.
 *
 * Run: cd backend && npx tsx eval/run-eval.ts
 *
 * Exit codes:
 *   0 — run completed (per-case errors are tolerated and recorded)
 *   1 — fatal I/O failure (cases.json missing, output write failed)
 */

import * as fs from 'fs';
import * as path from 'path';

import { classifyStub, EvalResult } from './classify-stub';

// ===== Types =====

interface EvalCase {
  id: string;
  query: string;
  expected_chapter: string | null;
  expected_heading: string | null;
  expected_code: string | null;
  expected_routing: string;
  expected_refusal: boolean;
  category?: string;
  difficulty?: string;
}

interface CasesFile {
  meta: {
    total_cases: number;
    [k: string]: unknown;
  };
  cases: EvalCase[];
}

interface PerCaseResult {
  case_id: string;
  query: string;
  expected: {
    chapter: string | null;
    heading: string | null;
    code: string | null;
  };
  predicted: EvalResult | null;
  elapsed_ms: number;
  error: string | null;
}

interface BaselineOutput {
  meta: {
    runner_version: string;
    ran_at: string;
    stub_mode: boolean;
    total_cases: number;
  };
  metrics: {
    chapter_match: string;
    heading_match: string;
    subheading_match: string;
    code_match: string;
    predicted_null_pct: string;
  };
  per_case: PerCaseResult[];
}

export interface RunEvalOptions {
  casesPath?: string;
  outputPath?: string;
  silent?: boolean;
}

export interface RunEvalReturn {
  output: BaselineOutput;
  outputPath: string;
  totalRuntimeMs: number;
  errors: number;
}

// ===== Helpers =====

const RUNNER_VERSION = '1.0';
const DEFAULT_CASES_PATH = path.resolve(__dirname, 'cases.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, 'baseline-stub.json');

/**
 * Extract the 4-digit heading (e.g. "8708") from an 8-digit code like
 * "8708.30.00", or pass through a string that already looks like a heading.
 */
function headingOf(code: string | null): string | null {
  if (!code) return null;
  // "NNNN.NN.NN" → "NNNN"
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(code)) return code.slice(0, 4);
  // "NNNN" pass-through
  if (/^\d{4}$/.test(code)) return code;
  // Defensive: strip dots and take first 4 digits if at least 4 present
  const digits = code.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(0, 4) : null;
}

/**
 * Extract the 6-digit subheading prefix (e.g. "8708.30") from "8708.30.00" or
 * "870830". Returns the canonical dotted form for comparison.
 */
function subheadingOf(code: string | null): string | null {
  if (!code) return null;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(code)) return code.slice(0, 7); // "NNNN.NN"
  if (/^\d{4}\.\d{2}$/.test(code)) return code;
  const digits = code.replace(/\D/g, '');
  if (digits.length >= 6) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`;
  return null;
}

/**
 * Extract the 2-digit chapter (e.g. "87") from any code form.
 */
function chapterOf(code: string | null): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, '');
  return digits.length >= 2 ? digits.slice(0, 2) : null;
}

/**
 * Normalize an 8-digit code to canonical "NNNN.NN.NN" form for comparison.
 * Returns null if the input doesn't have ≥8 digits.
 */
function canonical8(code: string | null): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const d = digits.slice(0, 8);
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

// ===== Core runner =====

export async function runEval(options: RunEvalOptions = {}): Promise<RunEvalReturn> {
  const casesPath = options.casesPath ?? DEFAULT_CASES_PATH;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const silent = options.silent ?? false;

  const log = (msg: string): void => {
    if (!silent) process.stdout.write(msg);
  };

  const runStart = Date.now();

  // Load cases
  if (!fs.existsSync(casesPath)) {
    throw new Error(`cases.json not found at ${casesPath}`);
  }
  const raw = fs.readFileSync(casesPath, 'utf8');
  const casesFile = JSON.parse(raw) as CasesFile;
  if (!Array.isArray(casesFile.cases)) {
    throw new Error('cases.json is malformed — `cases` array missing');
  }
  const cases = casesFile.cases;

  log(`Loaded ${cases.length} cases from ${casesPath}\n`);

  // Walk cases
  const perCase: PerCaseResult[] = [];
  let chapterMatches = 0;
  let headingMatches = 0;
  let subheadingMatches = 0;
  let codeMatches = 0;
  let predictedNullCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!c) continue; // appease noUncheckedIndexedAccess

    const caseStart = Date.now();
    let predicted: EvalResult | null = null;
    let errorMsg: string | null = null;

    try {
      predicted = await classifyStub(c.query);
    } catch (err) {
      errorCount += 1;
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const elapsedMs = Date.now() - caseStart;

    if (predicted === null) {
      predictedNullCount += 1;
    } else {
      const predCode = predicted.selected_code;
      const expCanon = canonical8(c.expected_code);
      const predCanon = canonical8(predCode);

      const predChapter = chapterOf(predCode);
      const predHeading = headingOf(predCode);
      const predSubheading = subheadingOf(predCode);

      const expChapter = c.expected_chapter ?? chapterOf(c.expected_code);
      const expHeading = c.expected_heading ?? headingOf(c.expected_code);
      const expSubheading = subheadingOf(c.expected_code);

      if (expChapter && predChapter && expChapter === predChapter) chapterMatches += 1;
      if (expHeading && predHeading && expHeading === predHeading) headingMatches += 1;
      if (expSubheading && predSubheading && expSubheading === predSubheading) subheadingMatches += 1;
      if (expCanon && predCanon && expCanon === predCanon) codeMatches += 1;
    }

    perCase.push({
      case_id: c.id,
      query: c.query,
      expected: {
        chapter: c.expected_chapter,
        heading: c.expected_heading,
        code: c.expected_code,
      },
      predicted,
      elapsed_ms: elapsedMs,
      error: errorMsg,
    });

    // Progress indicator every 10 cases
    if ((i + 1) % 10 === 0) {
      log(`  processed ${i + 1}/${cases.length}\n`);
    }
  }

  const total = cases.length;
  const nullPct = total === 0 ? '0%' : `${Math.round((predictedNullCount / total) * 100)}%`;

  const output: BaselineOutput = {
    meta: {
      runner_version: RUNNER_VERSION,
      ran_at: new Date().toISOString(),
      stub_mode: true,
      total_cases: total,
    },
    metrics: {
      chapter_match: `${chapterMatches}/${total}`,
      heading_match: `${headingMatches}/${total}`,
      subheading_match: `${subheadingMatches}/${total}`,
      code_match: `${codeMatches}/${total}`,
      predicted_null_pct: nullPct,
    },
    per_case: perCase,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  log(`Wrote ${outputPath}\n`);

  const totalRuntimeMs = Date.now() - runStart;
  return { output, outputPath, totalRuntimeMs, errors: errorCount };
}

// ===== CLI entry =====

async function main(): Promise<void> {
  try {
    const { output, outputPath, totalRuntimeMs, errors } = await runEval();

    console.log('\n' + '='.repeat(60));
    console.log('Phase 1 eval — stub run complete');
    console.log('='.repeat(60));
    console.log(`Total cases:        ${output.meta.total_cases}`);
    console.log(`Chapter match:      ${output.metrics.chapter_match}`);
    console.log(`Heading match:      ${output.metrics.heading_match}`);
    console.log(`Subheading match:   ${output.metrics.subheading_match}`);
    console.log(`Code match:         ${output.metrics.code_match}`);
    console.log(`Predicted null:     ${output.metrics.predicted_null_pct}`);
    console.log(`Errors:             ${errors}`);
    console.log(`Runtime:            ${totalRuntimeMs} ms`);
    console.log(`Output:             ${outputPath}`);
    process.exit(0);
  } catch (err) {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Only invoke main when run directly via `tsx eval/run-eval.ts`. When imported
// as a module the CLI side-effects are skipped.
if (require.main === module) {
  void main();
}

// backend/src/eval/compare.ts
//
// Run-vs-run comparison + AUTOMATED REGRESSION-GUARD (EVAL_DESIGN.md §6).
//
// The regression-guard is the artifact that BLOCKS auto-acceptance of a gate: it
// derives the per-case correct/wrong vector from each report, returns the set of
// caseIds that flipped correct→wrong (regressions) and wrong→correct
// (improvements) over the SHARED population, runs a McNemar paired test, and
// sets `hasUnexplainedRegression` true when any regression lacks explicit
// sign-off. A kept gate must show zero unsigned-off regressions.

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport } from './types';
import { mcnemar, type McNemarResult } from './metrics';

/** Per-case pass/fail vector keyed by test_case_id (errors excluded). */
export type PerCaseCorrect = Map<string, boolean>;

/**
 * Derive the per-case correctness vector for a report.
 *
 * Correctness rule (matches the gate's notion of "right answer"):
 *  - A case carrying a gold code → `code_correct` (the 8-digit outcome).
 *  - A non-gold case (ASK/REJECT ground truth) → `routing_correct`.
 * ERROR cases (infra failures) are EXCLUDED — they are not model decisions.
 */
export function perCaseCorrectVector(report: EvalReport): PerCaseCorrect {
  const v: PerCaseCorrect = new Map();
  for (const d of report.details) {
    if (d.is_error) continue;
    const correct =
      d.expected_code !== undefined ? d.code_correct === true : d.routing_correct === true;
    v.set(d.test_case_id, correct);
  }
  return v;
}

/** Result of comparing two runs over their shared population. */
export interface RunComparison {
  /** Cases present (non-error) in BOTH runs. */
  shared_population: number;
  /** caseIds that went correct→wrong. */
  regressed_case_ids: string[];
  /** caseIds that went wrong→correct. */
  improved_case_ids: string[];
  /** McNemar paired test over the shared population's correct/wrong vectors. */
  mcnemar: McNemarResult;
  /**
   * True when ≥1 regression has NOT been explicitly signed off. This is the
   * BLOCKING signal: an automated gate must refuse acceptance while it is true.
   */
  hasUnexplainedRegression: boolean;
}

export interface CompareOptions {
  /** caseIds whose correct→wrong flip has been manually reviewed + accepted. */
  signedOffRegressions?: string[];
}

/**
 * Compare two reports' per-case vectors over their shared population. Pure +
 * deterministic (ids sorted) so a gate can assert on the output.
 */
export function compareRuns(
  before: EvalReport,
  after: EvalReport,
  opts: CompareOptions = {},
): RunComparison {
  const beforeVec = perCaseCorrectVector(before);
  const afterVec = perCaseCorrectVector(after);
  const signedOff = new Set(opts.signedOffRegressions ?? []);

  const sharedIds = [...afterVec.keys()].filter(id => beforeVec.has(id)).sort();
  const regressed: string[] = [];
  const improved: string[] = [];
  const beforeBools: boolean[] = [];
  const afterBools: boolean[] = [];

  for (const id of sharedIds) {
    const b = beforeVec.get(id)!;
    const a = afterVec.get(id)!;
    beforeBools.push(b);
    afterBools.push(a);
    if (b && !a) regressed.push(id);
    else if (!b && a) improved.push(id);
  }

  const unexplained = regressed.some(id => !signedOff.has(id));

  return {
    shared_population: sharedIds.length,
    regressed_case_ids: regressed,
    improved_case_ids: improved,
    mcnemar: mcnemar(beforeBools, afterBools),
    hasUnexplainedRegression: unexplained,
  };
}

// ---------------------------------------------------------------------------
// CLI (guarded — only runs when invoked directly, not on import for tests)
// ---------------------------------------------------------------------------

function loadReport(filePath: string): EvalReport {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as EvalReport;
}

function printDiff(label: string, before: number, after: number): void {
  const diff = after - before;
  const sign = diff > 0 ? '+' : '';
  const icon = diff > 0 ? 'UP' : diff < 0 ? 'DN' : '==';
  console.log(`  ${icon} ${label.padEnd(20)}: ${before.toFixed(1)}% -> ${after.toFixed(1)}% (${sign}${diff.toFixed(1)}%)`);
}

function main(): void {
  const args = process.argv.slice(2).filter(a => a !== '--');
  // Optional: --signoff id1,id2 marks regressions as reviewed/accepted.
  const signOffIdx = args.indexOf('--signoff');
  let signedOffRegressions: string[] = [];
  if (signOffIdx >= 0 && args[signOffIdx + 1]) {
    signedOffRegressions = args[signOffIdx + 1]!.split(',').map(s => s.trim()).filter(Boolean);
    args.splice(signOffIdx, 2);
  }

  let beforePath: string;
  let afterPath: string;

  if (args.length >= 2) {
    beforePath = args[0]!;
    afterPath = args[1]!;
  } else {
    // Auto-discover: find the two most recent reports
    const resultsDir = path.resolve(__dirname, '../../eval-results');
    if (!fs.existsSync(resultsDir)) {
      console.error('No eval-results directory found.');
      process.exit(1);
    }

    const files = fs.readdirSync(resultsDir)
      .filter(f => f.endsWith('.json') && f !== '.gitkeep')
      .sort();

    if (files.length < 2) {
      console.error(`Need at least 2 report files to compare. Found: ${files.length}`);
      process.exit(1);
    }

    beforePath = path.join(resultsDir, files[files.length - 2]!);
    afterPath = path.join(resultsDir, files[files.length - 1]!);
  }

  const before = loadReport(beforePath);
  const after = loadReport(afterPath);

  console.log(`\nCOMPARING EVAL REPORTS`);
  console.log(`Before: ${before.metadata.run_id} (${before.metadata.timestamp})`);
  console.log(`After:  ${after.metadata.run_id} (${after.metadata.timestamp})`);

  // Headline metrics diff — PRIMARY (frozen denom) first; legacy view second.
  console.log(`\nMETRICS COMPARISON`);
  if (before.primary_accuracy && after.primary_accuracy) {
    printDiff('Primary chapter', before.primary_accuracy.chapter.rate * 100, after.primary_accuracy.chapter.rate * 100);
    printDiff('Primary heading', before.primary_accuracy.heading.rate * 100, after.primary_accuracy.heading.rate * 100);
    printDiff('Primary 8-digit', before.primary_accuracy.code.rate * 100, after.primary_accuracy.code.rate * 100);
  }
  if (before.confident_wrong && after.confident_wrong) {
    console.log(`  confident-wrong count: ${before.confident_wrong.count} -> ${after.confident_wrong.count}`);
  }
  printDiff('Routing accuracy', before.routing.accuracy, after.routing.accuracy);
  printDiff('Legacy chapter', before.classification.chapter_accuracy, after.classification.chapter_accuracy);
  printDiff('Legacy heading', before.classification.heading_accuracy, after.classification.heading_accuracy);
  printDiff('Legacy 8-digit', before.classification.code_accuracy, after.classification.code_accuracy);

  // AUTOMATED regression-guard.
  const cmp = compareRuns(before, after, { signedOffRegressions });
  console.log(`\nREGRESSION-GUARD (shared population: ${cmp.shared_population})`);
  console.log(`  McNemar: b(regress)=${cmp.mcnemar.b} c(improve)=${cmp.mcnemar.c} χ²=${cmp.mcnemar.statistic.toFixed(3)} p=${cmp.mcnemar.pValue.toFixed(4)}`);

  console.log(`\nIMPROVEMENTS (${cmp.improved_case_ids.length}):`);
  console.log(cmp.improved_case_ids.length > 0 ? '  ' + cmp.improved_case_ids.join(', ') : '  (none)');

  console.log(`\nREGRESSIONS (${cmp.regressed_case_ids.length}):`);
  console.log(cmp.regressed_case_ids.length > 0 ? '  ' + cmp.regressed_case_ids.join(', ') : '  (none)');
  if (signedOffRegressions.length > 0) {
    console.log(`  Signed-off: ${signedOffRegressions.join(', ')}`);
  }

  if (cmp.hasUnexplainedRegression) {
    console.log(`\nVERDICT: BLOCKED — ${cmp.regressed_case_ids.filter(id => !signedOffRegressions.includes(id)).length} unsigned-off regression(s). Review each, then re-run with --signoff <ids>.`);
    process.exit(1);
  } else {
    console.log(`\nVERDICT: No unexplained regressions. ${cmp.improved_case_ids.length} improvements.`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

// backend/src/eval/compare.ts

import * as fs from 'fs';
import * as path from 'path';
import { EvalReport } from './types';

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
  const args = process.argv.slice(2);
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

  // Overall metrics diff
  console.log(`\nMETRICS COMPARISON`);
  printDiff('Routing accuracy', before.routing.accuracy, after.routing.accuracy);
  printDiff('Chapter accuracy', before.classification.chapter_accuracy, after.classification.chapter_accuracy);
  printDiff('Heading accuracy', before.classification.heading_accuracy, after.classification.heading_accuracy);
  printDiff('Code accuracy', before.classification.code_accuracy, after.classification.code_accuracy);
  printDiff('Weighted average', before.classification.weighted_average, after.classification.weighted_average);

  // Find regressions and improvements
  const beforeMap = new Map(before.details.map(d => [d.test_case_id, d]));
  const afterMap = new Map(after.details.map(d => [d.test_case_id, d]));

  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [id, afterDetail] of afterMap) {
    const beforeDetail = beforeMap.get(id);
    if (!beforeDetail) continue;

    const beforeCorrect = beforeDetail.chapter_correct ?? beforeDetail.routing_correct;
    const afterCorrect = afterDetail.chapter_correct ?? afterDetail.routing_correct;

    if (beforeCorrect && !afterCorrect) {
      regressions.push(
        `  ${id}: "${afterDetail.query.substring(0, 40)}" ` +
        `was ${beforeDetail.actual_chapter || beforeDetail.actual_routing} (correct), ` +
        `now ${afterDetail.actual_chapter || afterDetail.actual_routing} (wrong)`,
      );
    } else if (!beforeCorrect && afterCorrect) {
      improvements.push(
        `  ${id}: "${afterDetail.query.substring(0, 40)}" ` +
        `was ${beforeDetail.actual_chapter || beforeDetail.actual_routing} (wrong), ` +
        `now ${afterDetail.actual_chapter || afterDetail.actual_routing} (correct)`,
      );
    }
  }

  console.log(`\nIMPROVEMENTS (${improvements.length}):`);
  if (improvements.length > 0) {
    improvements.forEach(i => console.log(i));
  } else {
    console.log('  (none)');
  }

  console.log(`\nREGRESSIONS (${regressions.length}):`);
  if (regressions.length > 0) {
    regressions.forEach(r => console.log(r));
  } else {
    console.log('  (none)');
  }

  // Exit code
  if (regressions.length > 0) {
    console.log(`\nVERDICT: ${regressions.length} regressions detected. Exiting with code 1.`);
    process.exit(1);
  } else {
    console.log(`\nVERDICT: No regressions. ${improvements.length} improvements.`);
    process.exit(0);
  }
}

main();

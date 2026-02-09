/**
 * Baseline Comparison Script
 *
 * Compares before/after baseline results to measure improvement
 * from chapter notes + GIR integration.
 *
 * Usage: npm run test:baseline:compare
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  id: string;
  query: string;
  category: string;
  difficulty: string;
  keyDistinction: string;
  expectedChapter: string;
  actualChapter: string;
  chapterCorrect: boolean;
}

interface BaselineResult {
  timestamp: string;
  integrationState: 'before' | 'after';
  totalTests: number;
  chapterAccuracy: number;
  headingAccuracy: number;
  codeAccuracy: number;
  avgResponseTimeMs: number;
  questionRate: number;
  byCategory: Record<string, { total: number; chapterCorrect: number; accuracy: number }>;
  byDifficulty: Record<string, { total: number; chapterCorrect: number; accuracy: number }>;
  results: TestResult[];
}

function loadLatestResult(state: 'before' | 'after'): BaselineResult | null {
  const resultsDir = path.join(__dirname, '..', 'results');

  const latestPath = path.join(resultsDir, `baseline-${state}-latest.json`);
  if (fs.existsSync(latestPath)) {
    const content = fs.readFileSync(latestPath, 'utf-8');
    return JSON.parse(content);
  }

  // Fallback: find most recent timestamped file
  if (!fs.existsSync(resultsDir)) {
    return null;
  }

  const files = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith(`baseline-${state}-`) && f.endsWith('.json') && !f.includes('latest'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const firstFile = files[0];
  if (!firstFile) return null;

  const content = fs.readFileSync(path.join(resultsDir, firstFile), 'utf-8');
  return JSON.parse(content);
}

function formatDiff(diff: number, suffix: string = '%'): string {
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}${suffix}`;
}

function main(): void {
  console.log('\n' + '='.repeat(60));
  console.log('BASELINE COMPARISON');
  console.log('='.repeat(60));

  const before = loadLatestResult('before');
  const after = loadLatestResult('after');

  if (!before) {
    console.log('\n\u274C No BEFORE baseline found.');
    console.log('   Run: npm run test:baseline:before');
    console.log('='.repeat(60) + '\n');
    return;
  }

  console.log(`\n\u2705 BEFORE baseline found: ${before.timestamp}`);
  console.log(`   Chapter Accuracy: ${before.chapterAccuracy.toFixed(1)}%`);
  console.log(`   Heading Accuracy: ${before.headingAccuracy.toFixed(1)}%`);
  console.log(`   Avg Response Time: ${before.avgResponseTimeMs.toFixed(0)}ms`);

  if (!after) {
    console.log('\n\u274C No AFTER baseline found.');
    console.log('   Run: npm run test:baseline:after');
    console.log('='.repeat(60) + '\n');
    return;
  }

  console.log(`\n\u2705 AFTER baseline found: ${after.timestamp}`);
  console.log(`   Chapter Accuracy: ${after.chapterAccuracy.toFixed(1)}%`);
  console.log(`   Heading Accuracy: ${after.headingAccuracy.toFixed(1)}%`);
  console.log(`   Avg Response Time: ${after.avgResponseTimeMs.toFixed(0)}ms`);

  // Accuracy comparison
  console.log('\n' + '-'.repeat(60));
  console.log('ACCURACY COMPARISON');
  console.log('-'.repeat(60));

  const chapterDiff = after.chapterAccuracy - before.chapterAccuracy;
  const headingDiff = after.headingAccuracy - before.headingAccuracy;
  const codeDiff = after.codeAccuracy - before.codeAccuracy;
  const timeDiff = after.avgResponseTimeMs - before.avgResponseTimeMs;

  const chapterIcon = chapterDiff > 0 ? '\u2705' : chapterDiff < 0 ? '\u274C' : '\u2796';
  const headingIcon = headingDiff > 0 ? '\u2705' : headingDiff < 0 ? '\u274C' : '\u2796';

  console.log(`${chapterIcon} Chapter: ${before.chapterAccuracy.toFixed(1)}% \u2192 ${after.chapterAccuracy.toFixed(1)}% (${formatDiff(chapterDiff)})`);
  console.log(`${headingIcon} Heading: ${before.headingAccuracy.toFixed(1)}% \u2192 ${after.headingAccuracy.toFixed(1)}% (${formatDiff(headingDiff)})`);
  console.log(`   Code:    ${before.codeAccuracy.toFixed(1)}% \u2192 ${after.codeAccuracy.toFixed(1)}% (${formatDiff(codeDiff)})`);
  console.log(`   Time:    ${before.avgResponseTimeMs.toFixed(0)}ms \u2192 ${after.avgResponseTimeMs.toFixed(0)}ms (${formatDiff(timeDiff, 'ms')})`);

  // By difficulty comparison
  console.log('\n' + '-'.repeat(60));
  console.log('BY DIFFICULTY');
  console.log('-'.repeat(60));

  for (const diff of ['easy', 'medium', 'hard']) {
    const beforeStat = before.byDifficulty[diff];
    const afterStat = after.byDifficulty[diff];
    if (beforeStat && afterStat) {
      const change = afterStat.accuracy - beforeStat.accuracy;
      const icon = change > 0 ? '\u2705' : change < 0 ? '\u274C' : '\u2796';
      console.log(`${icon} ${diff.padEnd(8)}: ${beforeStat.accuracy.toFixed(0)}% \u2192 ${afterStat.accuracy.toFixed(0)}% (${formatDiff(change)})`);
    }
  }

  // By category comparison
  console.log('\n' + '-'.repeat(60));
  console.log('BY CATEGORY');
  console.log('-'.repeat(60));

  const allCategories = new Set([
    ...Object.keys(before.byCategory),
    ...Object.keys(after.byCategory)
  ]);

  for (const cat of allCategories) {
    const beforeStat = before.byCategory[cat];
    const afterStat = after.byCategory[cat];
    if (beforeStat && afterStat) {
      const change = afterStat.accuracy - beforeStat.accuracy;
      const icon = change > 0 ? '\u2705' : change < 0 ? '\u274C' : '\u2796';
      console.log(`${icon} ${cat.padEnd(16)}: ${beforeStat.accuracy.toFixed(0)}% \u2192 ${afterStat.accuracy.toFixed(0)}% (${formatDiff(change)})`);
    }
  }

  // Find specific improvements and regressions
  const improvements: string[] = [];
  const regressions: string[] = [];
  const unchanged: string[] = [];

  for (const afterResult of after.results) {
    const beforeResult = before.results.find(b => b.id === afterResult.id);
    if (!beforeResult) continue;

    if (!beforeResult.chapterCorrect && afterResult.chapterCorrect) {
      improvements.push(
        `\u2705 ${afterResult.id}: "${afterResult.query.substring(0, 35)}..."\n` +
        `      Ch.${beforeResult.actualChapter} \u2192 Ch.${afterResult.actualChapter} (expected: Ch.${afterResult.expectedChapter})\n` +
        `      Key: ${afterResult.keyDistinction}`
      );
    } else if (beforeResult.chapterCorrect && !afterResult.chapterCorrect) {
      regressions.push(
        `\u274C ${afterResult.id}: "${afterResult.query.substring(0, 35)}..."\n` +
        `      Ch.${beforeResult.actualChapter} \u2192 Ch.${afterResult.actualChapter} (expected: Ch.${afterResult.expectedChapter})\n` +
        `      Key: ${afterResult.keyDistinction}`
      );
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`IMPROVEMENTS (${improvements.length} cases)`);
  console.log('-'.repeat(60));
  if (improvements.length > 0) {
    improvements.forEach(i => console.log(i));
  } else {
    console.log('   (none)');
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`REGRESSIONS (${regressions.length} cases)`);
  console.log('-'.repeat(60));
  if (regressions.length > 0) {
    regressions.forEach(r => console.log(r));
  } else {
    console.log('   (none)');
  }

  // Verdict
  console.log('\n' + '='.repeat(60));
  console.log('VERDICT');
  console.log('='.repeat(60));

  const netChange = improvements.length - regressions.length;

  if (chapterDiff > 0 && regressions.length === 0) {
    console.log('\u2705 INTEGRATION SUCCESSFUL');
    console.log(`   +${improvements.length} improvements, 0 regressions`);
    console.log(`   Chapter accuracy improved by ${chapterDiff.toFixed(1)}%`);
    console.log('\n   Ready for Session 4: Large-scale validation (250+ products)');
  } else if (regressions.length > 0 && improvements.length > regressions.length) {
    console.log('\u26A0\uFE0F WARNING - MIXED RESULTS');
    console.log(`   +${improvements.length} improvements, -${regressions.length} regressions`);
    console.log(`   Net change: ${netChange > 0 ? '+' : ''}${netChange} cases`);
    console.log('\n   Review regressions before proceeding.');
    console.log('   Consider adjusting prompt to avoid breaking existing classifications.');
  } else if (regressions.length > 0) {
    console.log('\u274C REGRESSIONS OUTWEIGH IMPROVEMENTS');
    console.log(`   +${improvements.length} improvements, -${regressions.length} regressions`);
    console.log('\n   DO NOT proceed. Review implementation.');
  } else if (chapterDiff === 0) {
    console.log('\u2796 NO CHANGE DETECTED');
    console.log('   Integration may not be active or having effect.');
    console.log('\n   Verify that chapter-router.ts is using the new accessor.');
  } else {
    console.log('\u274C ACCURACY DECREASED');
    console.log(`   Chapter accuracy dropped by ${Math.abs(chapterDiff).toFixed(1)}%`);
    console.log('\n   Review implementation and revert if necessary.');
  }

  console.log('='.repeat(60) + '\n');
}

main();

/**
 * Session 5 Validation Runner
 *
 * Validates chapter classification accuracy on 100 verified products.
 * Tracks rule vs LLM path performance separately.
 *
 * Key features:
 * - Tracks which path (rule/LLM) was taken via rule_applied field
 * - Handles ambiguous products with alternative chapters
 * - Rate limits API calls (500ms delay)
 * - Generates detailed metrics by category, path, difficulty
 */

import dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });

import * as fs from 'fs';
import * as path from 'path';
import { classify } from '../../../classifier';
import { extractAttributes } from '../../../classifier/attribute-extractor';
import { routeToChapter } from '../../../classifier/chapter-router';
import {
  SESSION5_ALL_PRODUCTS,
  Session5TestProduct,
  Session5Result,
  Session5Metrics
} from '../test-data';

const RATE_LIMIT_MS = 500;
const RESULTS_DIR = path.resolve(__dirname, '../results');

async function runValidation(): Promise<{
  metrics: Session5Metrics;
  results: Session5Result[];
}> {
  console.log('\n========================================');
  console.log('SESSION 5: VALIDATION WITH VERIFIED DATA');
  console.log(`Total products: ${SESSION5_ALL_PRODUCTS.length}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('========================================\n');

  const results: Session5Result[] = [];

  for (const [index, product] of SESSION5_ALL_PRODUCTS.entries()) {
    const progress = `[${String(index + 1).padStart(3, '0')}/${SESSION5_ALL_PRODUCTS.length}]`;

    try {
      const result = await runSingleValidation(product);
      results.push(result);

      // Log result
      const pathIcon = result.pathTaken === 'rule' ? 'R' : 'L';
      const correctIcon = result.correctOrAlternative ? '\u2705' : '\u274C';
      const altIcon = !result.correct && result.correctOrAlternative ? '(alt)' : '';

      console.log(
        `${progress} ${correctIcon} [${pathIcon}] ${product.id}: ` +
        `Ch.${result.actualChapter} ${altIcon} (${result.responseTimeMs}ms)`
      );

      if (!result.correctOrAlternative) {
        const expected = product.alternativeChapters
          ? `${product.expectedChapter}/${product.alternativeChapters.join('/')}`
          : product.expectedChapter;
        console.log(
          `         Expected: ${expected}, Got: ${result.actualChapter}`
        );
      }
    } catch (error) {
      console.error(`${progress} \u274C ${product.id}: ERROR - ${error}`);
      results.push(createErrorResult(product, error));
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  const metrics = calculateMetrics(results);
  printSummary(metrics, results);
  saveResults(metrics, results);

  return { metrics, results };
}

async function runSingleValidation(
  product: Session5TestProduct
): Promise<Session5Result> {
  const startTime = Date.now();

  // Step 1: Extract attributes
  const attributes = await extractAttributes(product.query);

  // Step 2: Route to chapter (this tells us the path taken)
  const chapterResult = await routeToChapter(attributes);

  const duration = Date.now() - startTime;

  // Determine path taken
  const pathTaken: 'rule' | 'llm' = chapterResult.rule_applied ? 'rule' : 'llm';
  const actualChapter = chapterResult.chapter;

  // Check correctness
  const correct = actualChapter === product.expectedChapter;
  const correctOrAlternative =
    correct ||
    (product.alternativeChapters?.includes(actualChapter) ?? false);

  return {
    testId: product.id,
    query: product.query,
    category: product.category,
    expectedChapter: product.expectedChapter,
    actualChapter,
    alternativeChapters: product.alternativeChapters,
    correct,
    correctOrAlternative,
    pathTaken,
    ruleApplied: chapterResult.rule_applied,
    girsApplied: chapterResult.girs_applied,
    notesUsed: chapterResult.notes_used,
    confidence: chapterResult.confidence,
    responseTimeMs: duration,
    reasoning: chapterResult.reasoning
  };
}

function calculateMetrics(results: Session5Result[]): Session5Metrics {
  const total = results.length;

  // Overall accuracy
  const correctCount = results.filter(r => r.correct).length;
  const correctWithAlt = results.filter(r => r.correctOrAlternative).length;

  // By path
  const ruleResults = results.filter(r => r.pathTaken === 'rule');
  const llmResults = results.filter(r => r.pathTaken === 'llm');

  const ruleCorrect = ruleResults.filter(r => r.correctOrAlternative).length;
  const llmCorrect = llmResults.filter(r => r.correctOrAlternative).length;

  // By category
  const categories = ['automotive', 'simple', 'itc-official', 'ambiguous'];
  const byCategory: Session5Metrics['byCategory'] = {};

  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length > 0) {
      const catCorrect = catResults.filter(r => r.correctOrAlternative).length;
      byCategory[cat] = {
        total: catResults.length,
        correct: catCorrect,
        accuracy: (catCorrect / catResults.length) * 100,
        pathBreakdown: {
          rule: catResults.filter(r => r.pathTaken === 'rule').length,
          llm: catResults.filter(r => r.pathTaken === 'llm').length
        }
      };
    }
  }

  // By difficulty
  const byDifficulty: Session5Metrics['byDifficulty'] = {};
  for (const diff of ['easy', 'medium', 'hard']) {
    const diffProducts = SESSION5_ALL_PRODUCTS.filter(p => p.difficulty === diff);
    const diffResults = results.filter(r =>
      diffProducts.some(p => p.id === r.testId)
    );
    if (diffResults.length > 0) {
      const diffCorrect = diffResults.filter(r => r.correctOrAlternative).length;
      byDifficulty[diff] = {
        total: diffResults.length,
        correct: diffCorrect,
        accuracy: (diffCorrect / diffResults.length) * 100
      };
    }
  }

  const overallAccuracy = (correctWithAlt / total) * 100;
  const llmAccuracy = llmResults.length > 0
    ? (llmCorrect / llmResults.length) * 100
    : 0;

  return {
    totalTests: total,
    timestamp: new Date().toISOString(),
    overallChapterAccuracy: (correctCount / total) * 100,
    overallWithAlternatives: overallAccuracy,
    byPath: {
      rule: {
        total: ruleResults.length,
        correct: ruleCorrect,
        accuracy: ruleResults.length > 0
          ? (ruleCorrect / ruleResults.length) * 100
          : 0,
        avgConfidence: avg(ruleResults.map(r => r.confidence)),
        avgResponseTimeMs: avg(ruleResults.map(r => r.responseTimeMs))
      },
      llm: {
        total: llmResults.length,
        correct: llmCorrect,
        accuracy: llmAccuracy,
        avgConfidence: avg(llmResults.map(r => r.confidence)),
        avgResponseTimeMs: avg(llmResults.map(r => r.responseTimeMs))
      }
    },
    byCategory,
    byDifficulty,
    targets: {
      overallChapterAccuracy: {
        target: 80,
        actual: overallAccuracy,
        met: overallAccuracy >= 80
      },
      llmPathAccuracy: {
        target: 70,
        actual: llmAccuracy,
        met: llmAccuracy >= 70
      }
    }
  };
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function createErrorResult(
  product: Session5TestProduct,
  error: any
): Session5Result {
  return {
    testId: product.id,
    query: product.query,
    category: product.category,
    expectedChapter: product.expectedChapter,
    actualChapter: '',
    correct: false,
    correctOrAlternative: false,
    pathTaken: 'llm',
    confidence: 0,
    responseTimeMs: 0,
    reasoning: '',
    error: String(error)
  };
}

function printSummary(metrics: Session5Metrics, results: Session5Result[]): void {
  console.log('\n========================================');
  console.log('SESSION 5 RESULTS SUMMARY');
  console.log('========================================\n');

  // Overall
  console.log('=== OVERALL ACCURACY ===');
  console.log(`Total: ${metrics.totalTests} products`);
  console.log(`Chapter Accuracy (strict): ${metrics.overallChapterAccuracy.toFixed(1)}%`);
  console.log(`Chapter Accuracy (with alternatives): ${metrics.overallWithAlternatives.toFixed(1)}%`);

  // Targets
  console.log('\n=== TARGET CHECK ===');
  const t1 = metrics.targets.overallChapterAccuracy;
  const t2 = metrics.targets.llmPathAccuracy;
  console.log(`Overall >= 80%: ${t1.actual.toFixed(1)}% ${t1.met ? '\u2705' : '\u274C'}`);
  console.log(`LLM path >= 70%: ${t2.actual.toFixed(1)}% ${t2.met ? '\u2705' : '\u274C'}`);

  // By path
  console.log('\n=== BY PATH ===');
  const rule = metrics.byPath.rule;
  const llm = metrics.byPath.llm;
  console.log(`Rule path: ${rule.correct}/${rule.total} (${rule.accuracy.toFixed(1)}%) - avg ${Math.round(rule.avgResponseTimeMs)}ms`);
  console.log(`LLM path: ${llm.correct}/${llm.total} (${llm.accuracy.toFixed(1)}%) - avg ${Math.round(llm.avgResponseTimeMs)}ms`);

  // By category
  console.log('\n=== BY CATEGORY ===');
  for (const [cat, data] of Object.entries(metrics.byCategory)) {
    console.log(`${cat}: ${data.correct}/${data.total} (${data.accuracy.toFixed(0)}%) [R:${data.pathBreakdown.rule} L:${data.pathBreakdown.llm}]`);
  }

  // By difficulty
  console.log('\n=== BY DIFFICULTY ===');
  for (const [diff, data] of Object.entries(metrics.byDifficulty)) {
    console.log(`${diff}: ${data.correct}/${data.total} (${data.accuracy.toFixed(0)}%)`);
  }

  // Failures
  const failures = results.filter(r => !r.correctOrAlternative);
  console.log(`\n=== FAILURES (${failures.length}) ===`);
  failures.slice(0, 15).forEach(f => {
    const product = SESSION5_ALL_PRODUCTS.find(p => p.id === f.testId);
    const expected = product?.alternativeChapters
      ? `${f.expectedChapter}/${product.alternativeChapters.join('/')}`
      : f.expectedChapter;
    console.log(`${f.testId} [${f.pathTaken}]: Got ${f.actualChapter}, expected ${expected}`);
    console.log(`  Query: "${f.query.substring(0, 60)}..."`);
  });
  if (failures.length > 15) {
    console.log(`  ... and ${failures.length - 15} more failures`);
  }
}

function saveResults(metrics: Session5Metrics, results: Session5Result[]): void {
  // Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session5-validation-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  const output = {
    session: 'Session 5 Validation',
    timestamp: metrics.timestamp,
    model: 'gpt-4o-mini',
    summary: {
      totalTests: metrics.totalTests,
      overallChapterAccuracy: `${metrics.overallWithAlternatives.toFixed(1)}%`,
      rulePathAccuracy: `${metrics.byPath.rule.accuracy.toFixed(1)}%`,
      llmPathAccuracy: `${metrics.byPath.llm.accuracy.toFixed(1)}%`,
      targetsMet: metrics.targets.overallChapterAccuracy.met && metrics.targets.llmPathAccuracy.met
    },
    metrics,
    results
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`\n\u2705 Results saved to: ${filepath}`);
}

// Main execution
runValidation()
  .then(({ metrics }) => {
    const allTargetsMet = metrics.targets.overallChapterAccuracy.met && metrics.targets.llmPathAccuracy.met;
    console.log('\n========================================');
    console.log(allTargetsMet
      ? '\u2705 ALL TARGETS MET - Ready for A/B test'
      : '\u274C TARGETS NOT MET - Review failures before proceeding');
    console.log('========================================\n');
    process.exit(allTargetsMet ? 0 : 1);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });

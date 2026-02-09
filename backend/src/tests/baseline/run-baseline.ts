/**
 * Baseline Test Runner
 *
 * Runs 30 diverse products through the classifier and records accuracy.
 * Use this to establish baseline BEFORE integration and measure improvement AFTER.
 *
 * Usage:
 *   npm run test:baseline:before   # Run before notes integration
 *   npm run test:baseline:after    # Run after notes integration
 */

import dotenv from 'dotenv';
dotenv.config();

import { classify } from '../../classifier';
import { BASELINE_TEST_PRODUCTS, BaselineProduct, PRODUCTS_BY_CATEGORY, PRODUCTS_BY_DIFFICULTY } from './baseline-test-products';
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
  expectedHeading: string;
  actualHeading: string;
  expectedCode: string;
  actualCode: string;
  chapterCorrect: boolean;
  headingCorrect: boolean;
  codeCorrect: boolean;
  responseTimeMs: number;
  askedQuestion: boolean;
  error?: string;
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

function normalizeCode(code: string): string {
  return code.replace(/\./g, '').replace(/\s/g, '');
}

async function runSingleTest(product: BaselineProduct): Promise<TestResult> {
  const start = Date.now();

  try {
    const result = await classify(product.query, { skipSpecificityCheck: true });
    const duration = Date.now() - start;

    // Handle question response
    if (result.responseType === 'question') {
      return {
        id: product.id,
        query: product.query,
        category: product.category,
        difficulty: product.difficulty,
        keyDistinction: product.keyDistinction,
        expectedChapter: product.chapter,
        actualChapter: '',
        expectedHeading: product.heading,
        actualHeading: '',
        expectedCode: product.expected,
        actualCode: '',
        chapterCorrect: false,
        headingCorrect: false,
        codeCorrect: false,
        responseTimeMs: duration,
        askedQuestion: true
      };
    }

    const actualCode = normalizeCode(result.hsCode || '');
    const expectedCode = normalizeCode(product.expected);

    const actualChapter = actualCode.substring(0, 2);
    const actualHeading = actualCode.substring(0, 4);
    const expectedHeading = expectedCode.substring(0, 4);

    return {
      id: product.id,
      query: product.query,
      category: product.category,
      difficulty: product.difficulty,
      keyDistinction: product.keyDistinction,
      expectedChapter: product.chapter,
      actualChapter,
      expectedHeading: product.heading,
      actualHeading,
      expectedCode: product.expected,
      actualCode: result.hsCode || '',
      chapterCorrect: actualChapter === product.chapter,
      headingCorrect: actualHeading === expectedHeading,
      codeCorrect: actualCode === expectedCode,
      responseTimeMs: duration,
      askedQuestion: false
    };
  } catch (error) {
    return {
      id: product.id,
      query: product.query,
      category: product.category,
      difficulty: product.difficulty,
      keyDistinction: product.keyDistinction,
      expectedChapter: product.chapter,
      actualChapter: '',
      expectedHeading: product.heading,
      actualHeading: '',
      expectedCode: product.expected,
      actualCode: '',
      chapterCorrect: false,
      headingCorrect: false,
      codeCorrect: false,
      responseTimeMs: Date.now() - start,
      askedQuestion: false,
      error: String(error)
    };
  }
}

async function runBaseline(integrationState: 'before' | 'after'): Promise<BaselineResult> {
  console.log('\n========================================');
  console.log(`BASELINE TEST: ${integrationState.toUpperCase()} NOTES INTEGRATION`);
  console.log(`Total products: ${BASELINE_TEST_PRODUCTS.length}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('========================================\n');

  const results: TestResult[] = [];
  let chapterCorrect = 0;
  let headingCorrect = 0;
  let codeCorrect = 0;
  let totalTime = 0;
  let questionCount = 0;

  for (const [i, product] of BASELINE_TEST_PRODUCTS.entries()) {
    const progress = `[${String(i + 1).padStart(2, '0')}/${BASELINE_TEST_PRODUCTS.length}]`;

    const result = await runSingleTest(product);
    results.push(result);
    totalTime += result.responseTimeMs;

    if (result.askedQuestion) {
      questionCount++;
      console.log(`${progress} \u2753 ${result.id}: "${result.query.substring(0, 40)}..." ASKED QUESTION`);
    } else if (result.error) {
      console.log(`${progress} \u274C ${result.id}: "${result.query.substring(0, 40)}..." ERROR: ${result.error.substring(0, 50)}`);
    } else {
      if (result.chapterCorrect) chapterCorrect++;
      if (result.headingCorrect) headingCorrect++;
      if (result.codeCorrect) codeCorrect++;

      const chStatus = result.chapterCorrect ? '\u2705' : '\u274C';
      const headStatus = result.headingCorrect ? '\u2705' : '\u274C';
      const queryShort = result.query.length > 35 ? result.query.substring(0, 35) + '...' : result.query;

      console.log(`${progress} Ch:${chStatus} Hd:${headStatus} ${result.id}: "${queryShort}" -> ${result.actualCode} (${result.responseTimeMs}ms)`);

      if (!result.chapterCorrect) {
        console.log(`         Expected Ch.${result.expectedChapter}, Got Ch.${result.actualChapter} | ${result.keyDistinction}`);
      }
    }

    // Rate limiting to avoid API throttling
    await new Promise(r => setTimeout(r, 500));
  }

  const total = BASELINE_TEST_PRODUCTS.length;

  // Calculate by category
  const byCategory: Record<string, { total: number; chapterCorrect: number; accuracy: number }> = {};
  for (const [cat, products] of Object.entries(PRODUCTS_BY_CATEGORY)) {
    const catResults = results.filter(r => r.category === cat);
    const correct = catResults.filter(r => r.chapterCorrect).length;
    byCategory[cat] = {
      total: catResults.length,
      chapterCorrect: correct,
      accuracy: catResults.length > 0 ? (correct / catResults.length) * 100 : 0
    };
  }

  // Calculate by difficulty
  const byDifficulty: Record<string, { total: number; chapterCorrect: number; accuracy: number }> = {};
  for (const [diff, products] of Object.entries(PRODUCTS_BY_DIFFICULTY)) {
    const diffResults = results.filter(r => r.difficulty === diff);
    const correct = diffResults.filter(r => r.chapterCorrect).length;
    byDifficulty[diff] = {
      total: diffResults.length,
      chapterCorrect: correct,
      accuracy: diffResults.length > 0 ? (correct / diffResults.length) * 100 : 0
    };
  }

  return {
    timestamp: new Date().toISOString(),
    integrationState,
    totalTests: total,
    chapterAccuracy: (chapterCorrect / total) * 100,
    headingAccuracy: (headingCorrect / total) * 100,
    codeAccuracy: (codeCorrect / total) * 100,
    avgResponseTimeMs: totalTime / total,
    questionRate: (questionCount / total) * 100,
    byCategory,
    byDifficulty,
    results
  };
}

function printSummary(result: BaselineResult): void {
  console.log('\n========================================');
  console.log(`BASELINE RESULTS: ${result.integrationState.toUpperCase()}`);
  console.log('========================================');
  console.log(`Chapter Accuracy: ${result.chapterAccuracy.toFixed(1)}% (${Math.round(result.chapterAccuracy * result.totalTests / 100)}/${result.totalTests})`);
  console.log(`Heading Accuracy: ${result.headingAccuracy.toFixed(1)}% (${Math.round(result.headingAccuracy * result.totalTests / 100)}/${result.totalTests})`);
  console.log(`Code Accuracy:    ${result.codeAccuracy.toFixed(1)}% (${Math.round(result.codeAccuracy * result.totalTests / 100)}/${result.totalTests})`);
  console.log(`Avg Response:     ${result.avgResponseTimeMs.toFixed(0)}ms`);
  console.log(`Question Rate:    ${result.questionRate.toFixed(1)}%`);

  console.log('\n--- BY DIFFICULTY ---');
  for (const diff of ['easy', 'medium', 'hard']) {
    const stats = result.byDifficulty[diff];
    if (stats) {
      const icon = stats.accuracy === 100 ? '\u2705' : stats.accuracy >= 80 ? '\u26A0\uFE0F' : '\u274C';
      console.log(`  ${icon} ${diff.padEnd(8)}: ${stats.accuracy.toFixed(0)}% (${stats.chapterCorrect}/${stats.total})`);
    }
  }

  console.log('\n--- BY CATEGORY ---');
  const categories = Object.entries(result.byCategory).sort((a, b) => a[1].accuracy - b[1].accuracy);
  for (const [cat, stats] of categories) {
    const icon = stats.accuracy === 100 ? '\u2705' : stats.accuracy >= 80 ? '\u26A0\uFE0F' : '\u274C';
    console.log(`  ${icon} ${cat.padEnd(16)}: ${stats.accuracy.toFixed(0)}% (${stats.chapterCorrect}/${stats.total})`);
  }

  // Show failed cases
  const failures = result.results.filter(r => !r.chapterCorrect && !r.askedQuestion && !r.error);
  if (failures.length > 0) {
    console.log('\n--- CHAPTER FAILURES ---');
    for (const f of failures) {
      console.log(`  ${f.id}: Expected Ch.${f.expectedChapter}, Got Ch.${f.actualChapter}`);
      console.log(`        "${f.query.substring(0, 50)}..."`);
      console.log(`        Key: ${f.keyDistinction}`);
    }
  }

  console.log('========================================\n');
}

async function main(): Promise<void> {
  const integrationState = process.argv.includes('--after') ? 'after' : 'before';

  try {
    const result = await runBaseline(integrationState);
    printSummary(result);

    // Ensure results directory exists
    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Save results with timestamp
    const filename = `baseline-${integrationState}-${Date.now()}.json`;
    const filepath = path.join(resultsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    console.log(`Results saved to: ${filepath}`);

    // Also save as latest for easy comparison
    const latestPath = path.join(resultsDir, `baseline-${integrationState}-latest.json`);
    fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));
    console.log(`Latest saved to: ${latestPath}`);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();

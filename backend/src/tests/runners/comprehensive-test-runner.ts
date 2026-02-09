/**
 * Comprehensive Test Runner
 *
 * Runs all test cases against the classifier and reports detailed metrics.
 * Targets: 95% chapter accuracy, 85% heading accuracy, <3000ms response time.
 */

import dotenv from 'dotenv';
dotenv.config();

import { classify } from '../../classifier';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  expected8Digit: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tier: 1 | 2 | 3;
  expectQuestion?: boolean;
}

interface TestResult {
  testId: string;
  query: string;
  tier: number;
  category: string;
  difficulty: string;
  expected: {
    chapter: string;
    heading: string;
    code: string;
  };
  actual: {
    chapter: string;
    heading: string;
    code: string;
  };
  chapterCorrect: boolean;
  headingCorrect: boolean;
  codeCorrect: boolean;
  confidence: number;
  responseTimeMs: number;
  askedQuestion: boolean;
  questionExpected: boolean;
  error?: string;
}

interface TestMetrics {
  totalTests: number;
  chapterAccuracy: number;
  headingAccuracy: number;
  codeAccuracy: number;
  questionRate: number;
  avgResponseTimeMs: number;
  byTier: Record<number, {
    total: number;
    chapterAcc: number;
    headingAcc: number;
    codeAcc: number;
  }>;
  byCategory: Record<string, {
    total: number;
    chapterAcc: number;
    failures: string[];
  }>;
  byDifficulty: Record<string, {
    total: number;
    chapterAcc: number;
  }>;
  targetsMet: boolean;
}

// Load test set
function loadTestSet(testSetPath: string): TestCase[] {
  const content = fs.readFileSync(testSetPath, 'utf-8');
  const data = JSON.parse(content);
  return data.testCases as TestCase[];
}

// Run tests
async function runComprehensiveTests(testSetPath: string): Promise<{ metrics: TestMetrics; results: TestResult[] }> {
  const testCases = loadTestSet(testSetPath);

  console.log('\n========================================');
  console.log(`COMPREHENSIVE TEST SUITE`);
  console.log(`Total cases: ${testCases.length}`);
  console.log('========================================\n');

  const results: TestResult[] = [];
  let completed = 0;

  for (const tc of testCases) {
    completed++;
    const progress = `[${completed}/${testCases.length}]`;

    try {
      const startTime = Date.now();
      const result = await classify(tc.query);
      const duration = Date.now() - startTime;

      const isQuestion = result.responseType === 'question';
      const hsCode = result.hsCode || '';

      // Normalize HS code (remove dots for comparison)
      const normalizedActual = hsCode.replace(/\./g, '');
      const normalizedExpected = tc.expected8Digit.replace(/\./g, '');

      const testResult: TestResult = {
        testId: tc.id,
        query: tc.query,
        tier: tc.tier,
        category: tc.category,
        difficulty: tc.difficulty,
        expected: {
          chapter: tc.expectedChapter,
          heading: tc.expectedHeading,
          code: tc.expected8Digit
        },
        actual: {
          chapter: normalizedActual.substring(0, 2),
          heading: normalizedActual.substring(0, 4),
          code: hsCode
        },
        chapterCorrect: normalizedActual.substring(0, 2) === tc.expectedChapter,
        headingCorrect: normalizedActual.substring(0, 4) === tc.expectedHeading,
        codeCorrect: normalizedActual === normalizedExpected,
        confidence: result.confidence || 0,
        responseTimeMs: duration,
        askedQuestion: isQuestion,
        questionExpected: tc.expectQuestion || false
      };

      results.push(testResult);

      // Log result
      const status = testResult.chapterCorrect ? '✅' : '❌';
      const queryShort = tc.query.length > 40 ? tc.query.substring(0, 40) + '...' : tc.query;

      if (testResult.chapterCorrect) {
        console.log(`${progress} ${status} ${tc.id}: "${queryShort}" → ${hsCode || 'QUESTION'} (${duration}ms)`);
      } else {
        console.log(`${progress} ${status} ${tc.id}: "${queryShort}"`);
        console.log(`         Got Ch.${testResult.actual.chapter}, Expected Ch.${tc.expectedChapter}`);
      }

    } catch (error) {
      console.error(`${progress} ❌ ${tc.id}: ERROR - ${error}`);
      results.push({
        testId: tc.id,
        query: tc.query,
        tier: tc.tier,
        category: tc.category,
        difficulty: tc.difficulty,
        expected: {
          chapter: tc.expectedChapter,
          heading: tc.expectedHeading,
          code: tc.expected8Digit
        },
        actual: { chapter: '', heading: '', code: '' },
        chapterCorrect: false,
        headingCorrect: false,
        codeCorrect: false,
        confidence: 0,
        responseTimeMs: 0,
        askedQuestion: false,
        questionExpected: false,
        error: String(error)
      });
    }

    // Rate limiting - wait between requests
    await new Promise(r => setTimeout(r, 300));
  }

  const metrics = calculateMetrics(results);
  return { metrics, results };
}

// Calculate metrics
function calculateMetrics(results: TestResult[]): TestMetrics {
  const total = results.length;
  const chapterCorrect = results.filter(r => r.chapterCorrect).length;
  const headingCorrect = results.filter(r => r.headingCorrect).length;
  const codeCorrect = results.filter(r => r.codeCorrect).length;
  const questionsAsked = results.filter(r => r.askedQuestion).length;
  const avgTime = results.reduce((sum, r) => sum + r.responseTimeMs, 0) / total;

  // By tier
  const byTier: Record<number, { total: number; chapterAcc: number; headingAcc: number; codeAcc: number }> = {};
  for (const tier of [1, 2, 3]) {
    const tierResults = results.filter(r => r.tier === tier);
    if (tierResults.length > 0) {
      byTier[tier] = {
        total: tierResults.length,
        chapterAcc: tierResults.filter(r => r.chapterCorrect).length / tierResults.length * 100,
        headingAcc: tierResults.filter(r => r.headingCorrect).length / tierResults.length * 100,
        codeAcc: tierResults.filter(r => r.codeCorrect).length / tierResults.length * 100
      };
    }
  }

  // By category
  const byCategory: Record<string, { total: number; chapterAcc: number; failures: string[] }> = {};
  const categories = [...new Set(results.map(r => {
    const parts = r.category.split(' - ');
    return parts[0] || r.category;
  }))];
  for (const cat of categories) {
    if (!cat) continue;
    const catResults = results.filter(r => r.category.startsWith(cat));
    const failures = catResults
      .filter(r => !r.chapterCorrect)
      .map(r => `${r.testId}: Got Ch.${r.actual.chapter}, expected Ch.${r.expected.chapter} ("${r.query.substring(0, 30)}...")`);
    byCategory[cat] = {
      total: catResults.length,
      chapterAcc: catResults.filter(r => r.chapterCorrect).length / catResults.length * 100,
      failures
    };
  }

  // By difficulty
  const byDifficulty: Record<string, { total: number; chapterAcc: number }> = {};
  for (const diff of ['easy', 'medium', 'hard']) {
    const diffResults = results.filter(r => r.difficulty === diff);
    if (diffResults.length > 0) {
      byDifficulty[diff] = {
        total: diffResults.length,
        chapterAcc: diffResults.filter(r => r.chapterCorrect).length / diffResults.length * 100
      };
    }
  }

  const chapterAccuracy = (chapterCorrect / total) * 100;
  const headingAccuracy = (headingCorrect / total) * 100;

  return {
    totalTests: total,
    chapterAccuracy,
    headingAccuracy,
    codeAccuracy: (codeCorrect / total) * 100,
    questionRate: (questionsAsked / total) * 100,
    avgResponseTimeMs: avgTime,
    byTier,
    byCategory,
    byDifficulty,
    targetsMet: chapterAccuracy >= 95 && headingAccuracy >= 85 && avgTime < 3000
  };
}

// Print metrics
function printMetrics(metrics: TestMetrics): void {
  console.log('\n========================================');
  console.log('COMPREHENSIVE TEST RESULTS');
  console.log('========================================');
  console.log(`\nTotal Tests:       ${metrics.totalTests}`);
  console.log(`Chapter Accuracy:  ${metrics.chapterAccuracy.toFixed(1)}% ${metrics.chapterAccuracy >= 95 ? '✅' : '❌'} (Target: 95%)`);
  console.log(`Heading Accuracy:  ${metrics.headingAccuracy.toFixed(1)}% ${metrics.headingAccuracy >= 85 ? '✅' : '❌'} (Target: 85%)`);
  console.log(`8-Digit Accuracy:  ${metrics.codeAccuracy.toFixed(1)}%`);
  console.log(`Question Rate:     ${metrics.questionRate.toFixed(1)}%`);
  console.log(`Avg Response Time: ${metrics.avgResponseTimeMs.toFixed(0)}ms ${metrics.avgResponseTimeMs < 3000 ? '✅' : '❌'} (Target: <3000ms)`);

  console.log('\n--- BY TIER ---');
  for (const [tier, data] of Object.entries(metrics.byTier)) {
    const tierName = tier === '1' ? 'Manual (HIGH)' : tier === '2' ? 'Database (MED)' : 'LLM (LOW)';
    console.log(`  Tier ${tier} (${tierName}):`);
    console.log(`    Tests: ${data.total}, Chapter: ${data.chapterAcc.toFixed(1)}%, Heading: ${data.headingAcc.toFixed(1)}%`);
  }

  console.log('\n--- BY DIFFICULTY ---');
  for (const [diff, data] of Object.entries(metrics.byDifficulty)) {
    const icon = data.chapterAcc >= 90 ? '✅' : data.chapterAcc >= 80 ? '⚠️' : '❌';
    console.log(`  ${icon} ${diff.charAt(0).toUpperCase() + diff.slice(1)}: ${data.total} tests, ${data.chapterAcc.toFixed(1)}% chapter accuracy`);
  }

  console.log('\n--- FAILURES BY CATEGORY (Top 10) ---');
  const sortedCategories = Object.entries(metrics.byCategory)
    .filter(([, data]) => data.failures.length > 0)
    .sort(([, a], [, b]) => b.failures.length - a.failures.length)
    .slice(0, 10);

  for (const [cat, data] of sortedCategories) {
    console.log(`\n  ${cat} (${data.chapterAcc.toFixed(0)}% accuracy, ${data.failures.length} failures):`);
    for (const f of data.failures.slice(0, 3)) {
      console.log(`    - ${f}`);
    }
    if (data.failures.length > 3) {
      console.log(`    ... and ${data.failures.length - 3} more`);
    }
  }

  console.log('\n========================================');
  if (metrics.targetsMet) {
    console.log('✅ ALL TARGETS MET - Ultimate HS Code Classifier Ready!');
  } else {
    console.log('❌ TARGETS NOT MET');
    if (metrics.chapterAccuracy < 95) {
      console.log(`   Chapter accuracy ${metrics.chapterAccuracy.toFixed(1)}% < 95% target`);
    }
    if (metrics.headingAccuracy < 85) {
      console.log(`   Heading accuracy ${metrics.headingAccuracy.toFixed(1)}% < 85% target`);
    }
    if (metrics.avgResponseTimeMs >= 3000) {
      console.log(`   Response time ${metrics.avgResponseTimeMs.toFixed(0)}ms >= 3000ms target`);
    }
  }
  console.log('========================================\n');
}

// Save results
function saveResults(metrics: TestMetrics, results: TestResult[]): string {
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = path.join(resultsDir, `run-${timestamp}.json`);

  const output = {
    timestamp: new Date().toISOString(),
    metrics,
    results,
    summary: {
      totalTests: metrics.totalTests,
      chapterAccuracy: `${metrics.chapterAccuracy.toFixed(1)}%`,
      headingAccuracy: `${metrics.headingAccuracy.toFixed(1)}%`,
      targetsMet: metrics.targetsMet
    }
  };

  fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
  return resultsPath;
}

// Main execution
async function main(): Promise<void> {
  const testSetPath = process.argv[2] ||
    path.join(__dirname, '..', 'test-data', 'comprehensive-test-set.json');

  if (!fs.existsSync(testSetPath)) {
    console.error(`Test set not found: ${testSetPath}`);
    console.error('Run the merge-tiers.ts script first to create the comprehensive test set.');
    process.exit(1);
  }

  console.log(`Loading test set from: ${testSetPath}`);

  const { metrics, results } = await runComprehensiveTests(testSetPath);

  printMetrics(metrics);

  const resultsPath = saveResults(metrics, results);
  console.log(`Results saved to: ${resultsPath}`);

  // Exit with appropriate code
  process.exit(metrics.targetsMet ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

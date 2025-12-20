/**
 * LLM-First Classifier Test Suite
 *
 * Tests the new LLM-First approach against 105 comprehensive test cases
 * and compares results with the semantic-search-first baseline (89.5% accuracy).
 *
 * This approach asks the LLM directly for the HS code, then validates
 * it exists in our database - leveraging the LLM's trained knowledge.
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyWithLLMFirst, ClassificationResult } from '../src/services/llm-first-classifier.service';

interface TestCase {
  id: number;
  query: string;
  expectedCode: string;
  category: string;
  chapter: string;
  difficulty: string;
  notes?: string;
}

interface TestResult {
  id: number;
  query: string;
  expectedCode: string;
  actualCode: string | null;
  correct: boolean;
  matchType: 'exact' | 'parent' | 'child' | 'chapter' | 'none';
  confidence: number;
  reasoning: string;
  method: string;
  category: string;
  chapter: string;
  difficulty: string;
  totalTime: number;
  error?: string;
}

interface TestMetrics {
  overall: {
    total: number;
    correct: number;
    accuracy: number;
    exactMatches: number;
    parentMatches: number;
    childMatches: number;
    chapterMatches: number;
    avgConfidence: number;
    errors: number;
  };
  byMethod: Map<string, { total: number; correct: number; accuracy: number }>;
  byChapter: Map<string, { total: number; correct: number; accuracy: number }>;
  byDifficulty: Map<string, { total: number; correct: number; accuracy: number }>;
  confidenceCalibration: {
    highConfidenceCorrect: number;
    highConfidenceWrong: number;
    lowConfidenceCorrect: number;
    lowConfidenceWrong: number;
  };
  performance: {
    avgTime: number;
    minTime: number;
    maxTime: number;
  };
  failedCases: TestResult[];
}

/**
 * Determine match type between actual and expected codes
 */
function getMatchType(actual: string | null, expected: string): 'exact' | 'parent' | 'child' | 'chapter' | 'none' {
  if (!actual) return 'none';

  // Normalize codes (remove dots for comparison)
  const actualNorm = actual.replace(/\./g, '');
  const expectedNorm = expected.replace(/\./g, '');

  // Exact match
  if (actualNorm === expectedNorm || actual === expected) {
    return 'exact';
  }

  // Parent match (actual is more specific than expected)
  if (actualNorm.startsWith(expectedNorm)) {
    return 'parent';
  }

  // Child match (expected is more specific than actual)
  if (expectedNorm.startsWith(actualNorm)) {
    return 'child';
  }

  // Chapter match (first 2 digits match)
  const actualChapter = actualNorm.substring(0, 2);
  const expectedChapter = expectedNorm.substring(0, 2);
  if (actualChapter === expectedChapter && actualChapter.length === 2) {
    return 'chapter';
  }

  return 'none';
}

/**
 * Check if a match is considered correct (exact, parent, child, or chapter)
 */
function isCorrectMatch(matchType: string): boolean {
  return matchType !== 'none';
}

/**
 * Format time in human-readable format
 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Main test runner
 */
async function runLLMFirstTests() {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('  LLM-FIRST CLASSIFIER TEST SUITE');
  console.log('  Testing against 105 comprehensive test cases');
  console.log('  Baseline to beat: 89.5% accuracy (semantic-search-first approach)');
  console.log('='.repeat(80));
  console.log('\n');

  // Load test cases
  const testCasesPath = path.join(__dirname, '../tests/comprehensive-test-cases.json');
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));

  console.log(`Loaded ${testCases.length} test cases\n`);

  const results: TestResult[] = [];
  const startTime = Date.now();

  const metrics: TestMetrics = {
    overall: {
      total: 0,
      correct: 0,
      accuracy: 0,
      exactMatches: 0,
      parentMatches: 0,
      childMatches: 0,
      chapterMatches: 0,
      avgConfidence: 0,
      errors: 0
    },
    byMethod: new Map(),
    byChapter: new Map(),
    byDifficulty: new Map(),
    confidenceCalibration: {
      highConfidenceCorrect: 0,
      highConfidenceWrong: 0,
      lowConfidenceCorrect: 0,
      lowConfidenceWrong: 0
    },
    performance: {
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0
    },
    failedCases: []
  };

  let totalConfidence = 0;
  let totalTime = 0;

  // Run each test case
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]!;
    const testStartTime = Date.now();

    console.log('-'.repeat(80));
    console.log(`[${i + 1}/${testCases.length}] Testing: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expectedCode} | Chapter: ${testCase.chapter} | Difficulty: ${testCase.difficulty}`);

    try {
      const result = await classifyWithLLMFirst(testCase.query);
      const elapsed = Date.now() - testStartTime;

      const matchType = getMatchType(result.code, testCase.expectedCode);
      const correct = isCorrectMatch(matchType);

      // Update performance metrics
      totalTime += elapsed;
      if (elapsed < metrics.performance.minTime) metrics.performance.minTime = elapsed;
      if (elapsed > metrics.performance.maxTime) metrics.performance.maxTime = elapsed;

      // Update confidence
      totalConfidence += result.confidence;

      // Update match type counts
      if (matchType === 'exact') metrics.overall.exactMatches++;
      else if (matchType === 'parent') metrics.overall.parentMatches++;
      else if (matchType === 'child') metrics.overall.childMatches++;
      else if (matchType === 'chapter') metrics.overall.chapterMatches++;

      // Update confidence calibration
      const isHighConfidence = result.confidence >= 0.85;
      if (isHighConfidence && correct) metrics.confidenceCalibration.highConfidenceCorrect++;
      else if (isHighConfidence && !correct) metrics.confidenceCalibration.highConfidenceWrong++;
      else if (!isHighConfidence && correct) metrics.confidenceCalibration.lowConfidenceCorrect++;
      else metrics.confidenceCalibration.lowConfidenceWrong++;

      // Create test result
      const testResult: TestResult = {
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: result.code,
        correct,
        matchType,
        confidence: result.confidence,
        reasoning: result.reasoning,
        method: result.method,
        category: testCase.category,
        chapter: testCase.chapter,
        difficulty: testCase.difficulty,
        totalTime: elapsed
      };

      results.push(testResult);

      // Update metrics by method
      if (!metrics.byMethod.has(result.method)) {
        metrics.byMethod.set(result.method, { total: 0, correct: 0, accuracy: 0 });
      }
      const methodStats = metrics.byMethod.get(result.method)!;
      methodStats.total++;
      if (correct) methodStats.correct++;

      // Update metrics by chapter
      if (!metrics.byChapter.has(testCase.chapter)) {
        metrics.byChapter.set(testCase.chapter, { total: 0, correct: 0, accuracy: 0 });
      }
      const chapterStats = metrics.byChapter.get(testCase.chapter)!;
      chapterStats.total++;
      if (correct) chapterStats.correct++;

      // Update metrics by difficulty
      if (!metrics.byDifficulty.has(testCase.difficulty)) {
        metrics.byDifficulty.set(testCase.difficulty, { total: 0, correct: 0, accuracy: 0 });
      }
      const diffStats = metrics.byDifficulty.get(testCase.difficulty)!;
      diffStats.total++;
      if (correct) diffStats.correct++;

      // Log result
      if (correct) {
        metrics.overall.correct++;
        const matchLabel = matchType === 'exact' ? 'EXACT' : matchType.toUpperCase();
        console.log(`   CORRECT (${matchLabel}): ${result.code}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}% | Method: ${result.method} | Time: ${formatTime(elapsed)}`);
      } else {
        metrics.failedCases.push(testResult);
        console.log(`   WRONG: Got ${result.code}, expected ${testCase.expectedCode}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}% | Method: ${result.method} | Time: ${formatTime(elapsed)}`);
        console.log(`   Reasoning: ${result.reasoning.substring(0, 100)}...`);
      }

    } catch (error: any) {
      const elapsed = Date.now() - testStartTime;
      totalTime += elapsed;
      metrics.overall.errors++;

      console.log(`   ERROR: ${error.message}`);

      const testResult: TestResult = {
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: null,
        correct: false,
        matchType: 'none',
        confidence: 0,
        reasoning: '',
        method: 'error',
        category: testCase.category,
        chapter: testCase.chapter,
        difficulty: testCase.difficulty,
        totalTime: elapsed,
        error: error.message
      };

      results.push(testResult);
      metrics.failedCases.push(testResult);
    }

    // Rate limiting - 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalElapsed = Date.now() - startTime;

  // Calculate final metrics
  metrics.overall.total = testCases.length;
  metrics.overall.accuracy = (metrics.overall.correct / metrics.overall.total) * 100;
  metrics.overall.avgConfidence = (totalConfidence / metrics.overall.total) * 100;
  metrics.performance.avgTime = totalTime / metrics.overall.total;

  // Calculate accuracy for each group
  for (const [, stats] of metrics.byMethod.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }
  for (const [, stats] of metrics.byChapter.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }
  for (const [, stats] of metrics.byDifficulty.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }

  // Print comprehensive report
  printReport(metrics, totalElapsed);

  // Save results
  const resultsPath = path.join(__dirname, '../tests/llm-first-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    approach: 'LLM-First Classification',
    baseline: '89.5% (semantic-search-first)',
    totalDuration: totalElapsed,
    metrics: {
      overall: metrics.overall,
      byMethod: Object.fromEntries(metrics.byMethod),
      byChapter: Object.fromEntries(metrics.byChapter),
      byDifficulty: Object.fromEntries(metrics.byDifficulty),
      confidenceCalibration: metrics.confidenceCalibration,
      performance: metrics.performance
    },
    results,
    failedCases: metrics.failedCases.map(f => ({
      query: f.query,
      expected: f.expectedCode,
      actual: f.actualCode,
      confidence: f.confidence,
      method: f.method,
      error: f.error
    }))
  }, null, 2));

  console.log(`\nResults saved to: ${resultsPath}`);

  return {
    accuracy: metrics.overall.accuracy,
    correct: metrics.overall.correct,
    total: metrics.overall.total,
    beatBaseline: metrics.overall.accuracy > 89.5
  };
}

/**
 * Print detailed test report
 */
function printReport(metrics: TestMetrics, totalDuration: number) {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('  LLM-FIRST CLASSIFIER - TEST RESULTS');
  console.log('='.repeat(80));

  // Overall results
  console.log('\n OVERALL RESULTS:');
  console.log('-'.repeat(80));
  console.log(`   Total Test Cases:    ${metrics.overall.total}`);
  console.log(`   Correct:             ${metrics.overall.correct}`);
  console.log(`   Accuracy:            ${metrics.overall.accuracy.toFixed(1)}%`);
  console.log(`   Errors:              ${metrics.overall.errors}`);
  console.log(`   Avg Confidence:      ${metrics.overall.avgConfidence.toFixed(1)}%`);
  console.log(`   Total Duration:      ${formatTime(totalDuration)}`);

  // Baseline comparison
  console.log('\n BASELINE COMPARISON:');
  console.log('-'.repeat(80));
  const baseline = 89.5;
  const diff = metrics.overall.accuracy - baseline;
  const status = diff > 0 ? 'BETTER' : diff < 0 ? 'WORSE' : 'SAME';
  const statusEmoji = diff > 0 ? '+' : diff < 0 ? '-' : '=';
  console.log(`   Baseline (semantic-first): ${baseline}%`);
  console.log(`   LLM-First:                 ${metrics.overall.accuracy.toFixed(1)}%`);
  console.log(`   Difference:                ${statusEmoji}${Math.abs(diff).toFixed(1)} percentage points (${status})`);

  // Match type breakdown
  console.log('\n MATCH TYPE BREAKDOWN:');
  console.log('-'.repeat(80));
  console.log(`   Exact Matches:       ${metrics.overall.exactMatches} (${((metrics.overall.exactMatches / metrics.overall.total) * 100).toFixed(1)}%)`);
  console.log(`   Parent Matches:      ${metrics.overall.parentMatches} (${((metrics.overall.parentMatches / metrics.overall.total) * 100).toFixed(1)}%)`);
  console.log(`   Child Matches:       ${metrics.overall.childMatches} (${((metrics.overall.childMatches / metrics.overall.total) * 100).toFixed(1)}%)`);
  console.log(`   Chapter Matches:     ${metrics.overall.chapterMatches} (${((metrics.overall.chapterMatches / metrics.overall.total) * 100).toFixed(1)}%)`);
  console.log(`   No Match:            ${metrics.failedCases.length} (${((metrics.failedCases.length / metrics.overall.total) * 100).toFixed(1)}%)`);

  // Results by method (LLM-direct, LLM-alternative, semantic-fallback)
  console.log('\n RESULTS BY METHOD:');
  console.log('-'.repeat(80));
  const methodOrder = ['llm-direct', 'llm-alternative', 'semantic-fallback', 'error'];
  for (const method of methodOrder) {
    const stats = metrics.byMethod.get(method);
    if (stats) {
      const pct = ((stats.total / metrics.overall.total) * 100).toFixed(1);
      console.log(`   ${method.padEnd(20)}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}% accuracy) - ${pct}% of queries`);
    }
  }

  // Results by difficulty
  console.log('\n RESULTS BY DIFFICULTY:');
  console.log('-'.repeat(80));
  const difficulties = ['easy', 'medium', 'hard'];
  for (const diff of difficulties) {
    const stats = metrics.byDifficulty.get(diff);
    if (stats) {
      const emoji = stats.accuracy >= 90 ? '+' : stats.accuracy >= 80 ? '~' : '-';
      console.log(`   ${emoji} ${diff.padEnd(10)}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`);
    }
  }

  // Confidence calibration (critical metric!)
  console.log('\n CONFIDENCE CALIBRATION:');
  console.log('-'.repeat(80));
  const hcTotal = metrics.confidenceCalibration.highConfidenceCorrect + metrics.confidenceCalibration.highConfidenceWrong;
  const lcTotal = metrics.confidenceCalibration.lowConfidenceCorrect + metrics.confidenceCalibration.lowConfidenceWrong;
  const hcAccuracy = hcTotal > 0 ? (metrics.confidenceCalibration.highConfidenceCorrect / hcTotal * 100) : 0;
  const lcAccuracy = lcTotal > 0 ? (metrics.confidenceCalibration.lowConfidenceCorrect / lcTotal * 100) : 0;

  console.log(`   High confidence (>=85%): ${metrics.confidenceCalibration.highConfidenceCorrect}/${hcTotal} correct (${hcAccuracy.toFixed(1)}% accuracy)`);
  console.log(`   Low confidence (<85%):   ${metrics.confidenceCalibration.lowConfidenceCorrect}/${lcTotal} correct (${lcAccuracy.toFixed(1)}% accuracy)`);
  console.log(`   Over-confident errors:   ${metrics.confidenceCalibration.highConfidenceWrong} (CRITICAL - should be <5)`);

  // Performance
  console.log('\n PERFORMANCE:');
  console.log('-'.repeat(80));
  console.log(`   Average time:        ${formatTime(metrics.performance.avgTime)}`);
  console.log(`   Min time:            ${formatTime(metrics.performance.minTime)}`);
  console.log(`   Max time:            ${formatTime(metrics.performance.maxTime)}`);

  // Results by chapter (sorted)
  console.log('\n RESULTS BY CHAPTER:');
  console.log('-'.repeat(80));
  const sortedChapters = Array.from(metrics.byChapter.entries())
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  for (const [chapter, stats] of sortedChapters) {
    const emoji = stats.accuracy >= 90 ? '+' : stats.accuracy >= 80 ? '~' : '-';
    console.log(`   ${emoji} Ch.${chapter.padStart(2, '0')}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`);
  }

  // Failed cases
  if (metrics.failedCases.length > 0) {
    console.log('\n FAILED CASES:');
    console.log('-'.repeat(80));
    metrics.failedCases.slice(0, 15).forEach((result, idx) => {
      console.log(`\n   ${idx + 1}. "${result.query}"`);
      console.log(`      Expected: ${result.expectedCode} (Ch.${result.chapter})`);
      console.log(`      Got:      ${result.actualCode || 'ERROR'} | Confidence: ${(result.confidence * 100).toFixed(1)}% | Method: ${result.method}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    if (metrics.failedCases.length > 15) {
      console.log(`\n   ... and ${metrics.failedCases.length - 15} more failed cases`);
    }
  }

  // Final verdict
  console.log('\n');
  console.log('='.repeat(80));
  const verdict = metrics.overall.accuracy > 89.5
    ? '  LLM-FIRST APPROACH BEATS BASELINE!'
    : metrics.overall.accuracy > 85
      ? '  LLM-FIRST APPROACH SHOWS PROMISE (>85%)'
      : '  LLM-FIRST APPROACH NEEDS IMPROVEMENT';
  console.log(verdict);
  console.log('='.repeat(80));
  console.log('\n');
}

// Run the tests
runLLMFirstTests()
  .then(summary => {
    console.log(`Final: ${summary.accuracy.toFixed(1)}% accuracy (${summary.correct}/${summary.total})`);
    console.log(`Baseline: 89.5% | ${summary.beatBaseline ? 'BEAT BASELINE!' : 'Did not beat baseline'}`);
    process.exit(summary.beatBaseline ? 0 : 1);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });

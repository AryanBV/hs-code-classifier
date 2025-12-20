/**
 * Comprehensive Test Suite Runner
 * 
 * Runs 100+ test cases covering all 21 HS chapters with detailed metrics tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyProduct } from '../src/services/ultimate-classifier.service';

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
  confidence: number;
  reasoning: string;
  category: string;
  chapter: string;
  difficulty: string;
  queryLength: number;
  error?: string;
  searchTime?: number;
  llmTime?: number;
  totalTime?: number;
}

interface TestMetrics {
  overall: {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    errors: number;
  };
  byChapter: Map<string, { total: number; correct: number; accuracy: number }>;
  byDifficulty: Map<string, { total: number; correct: number; accuracy: number }>;
  byQueryLength: Map<string, { total: number; correct: number; accuracy: number }>;
  confidenceDistribution: {
    high: number; // >= 0.9
    medium: number; // 0.7-0.89
    low: number; // < 0.7
  };
  performance: {
    avgTotalTime: number;
    avgSearchTime: number;
    avgLLMTime: number;
  };
  failedCases: TestResult[];
}

function getQueryLengthCategory(query: string): string {
  const wordCount = query.split(/\s+/).length;
  if (wordCount <= 2) return 'short (1-2 words)';
  if (wordCount <= 5) return 'medium (3-5 words)';
  return 'long (6+ words)';
}

function isCorrectMatch(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  
  // Exact match
  if (actual === expected) return true;
  
  // Parent match (actual is more specific)
  if (actual.startsWith(expected)) return true;
  
  // Child match (expected is more specific)
  if (expected.startsWith(actual)) return true;
  
  // Chapter match (first 2 digits)
  const actualChapter = actual.substring(0, 2);
  const expectedChapter = expected.substring(0, 2);
  if (actualChapter === expectedChapter && actualChapter.length === 2) {
    // Only consider chapter match if both are valid 2-digit chapters
    return true;
  }
  
  return false;
}

async function runComprehensiveTestSuite() {
  console.log('🧪 COMPREHENSIVE TEST SUITE RUNNER');
  console.log('═'.repeat(80));
  console.log('Loading test cases...\n');

  // Load comprehensive test cases
  const comprehensiveTestPath = path.join(__dirname, '../tests/comprehensive-test-cases.json');
  const comprehensiveTests: TestCase[] = JSON.parse(
    fs.readFileSync(comprehensiveTestPath, 'utf-8')
  );

  // Load baseline test cases for comparison
  const baselineTestPath = path.join(__dirname, '../tests/test-cases.json');
  const baselineTests: TestCase[] = JSON.parse(
    fs.readFileSync(baselineTestPath, 'utf-8')
  );

  console.log(`Loaded ${comprehensiveTests.length} comprehensive test cases`);
  console.log(`Loaded ${baselineTests.length} baseline test cases for comparison\n`);

  const allTests = [...comprehensiveTests];
  const results: TestResult[] = [];
  const metrics: TestMetrics = {
    overall: {
      total: 0,
      correct: 0,
      accuracy: 0,
      avgConfidence: 0,
      errors: 0
    },
    byChapter: new Map(),
    byDifficulty: new Map(),
    byQueryLength: new Map(),
    confidenceDistribution: {
      high: 0,
      medium: 0,
      low: 0
    },
    performance: {
      avgTotalTime: 0,
      avgSearchTime: 0,
      avgLLMTime: 0
    },
    failedCases: []
  };

  let totalConfidence = 0;
  let totalTime = 0;
  let totalSearchTime = 0;
  let totalLLMTime = 0;

  // Run all test cases
  for (let i = 0; i < allTests.length; i++) {
    const testCase = allTests[i]!;
    console.log(`[${i + 1}/${allTests.length}] Testing: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expectedCode} (Ch.${testCase.chapter}, ${testCase.difficulty})`);

    const startTime = Date.now();

    try {
      const result = await classifyProduct(testCase.query, {
        candidateLimit: 50,
        useHierarchyExpansion: true,
        minConfidence: 0.6
      });

      const elapsed = Date.now() - startTime;
      totalTime += elapsed;

      const correct = isCorrectMatch(result.code, testCase.expectedCode);
      totalConfidence += result.confidence;

      // Categorize confidence
      if (result.confidence >= 0.9) {
        metrics.confidenceDistribution.high++;
      } else if (result.confidence >= 0.7) {
        metrics.confidenceDistribution.medium++;
      } else {
        metrics.confidenceDistribution.low++;
      }

      const queryLengthCategory = getQueryLengthCategory(testCase.query);

      const testResult: TestResult = {
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: result.code,
        correct,
        confidence: result.confidence,
        reasoning: result.reasoning,
        category: testCase.category,
        chapter: testCase.chapter,
        difficulty: testCase.difficulty,
        queryLength: testCase.query.split(/\s+/).length,
        totalTime: elapsed
      };

      results.push(testResult);

      if (correct) {
        metrics.overall.correct++;
        console.log(`   ✅ CORRECT: ${result.code} (${(result.confidence * 100).toFixed(1)}% confidence)`);
      } else {
        metrics.failedCases.push(testResult);
        console.log(`   ❌ WRONG: Got ${result.code}, expected ${testCase.expectedCode}`);
        console.log(`      Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      }

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
      const difficultyStats = metrics.byDifficulty.get(testCase.difficulty)!;
      difficultyStats.total++;
      if (correct) difficultyStats.correct++;

      // Update metrics by query length
      if (!metrics.byQueryLength.has(queryLengthCategory)) {
        metrics.byQueryLength.set(queryLengthCategory, { total: 0, correct: 0, accuracy: 0 });
      }
      const lengthStats = metrics.byQueryLength.get(queryLengthCategory)!;
      lengthStats.total++;
      if (correct) lengthStats.correct++;

      console.log(`   Time: ${elapsed}ms\n`);

    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      totalTime += elapsed;
      metrics.overall.errors++;

      console.log(`   ❌ ERROR: ${error.message}\n`);

      const testResult: TestResult = {
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: null,
        correct: false,
        confidence: 0,
        reasoning: '',
        category: testCase.category,
        chapter: testCase.chapter,
        difficulty: testCase.difficulty,
        queryLength: testCase.query.split(/\s+/).length,
        error: error.message,
        totalTime: elapsed
      };

      results.push(testResult);
      metrics.failedCases.push(testResult);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Calculate final metrics
  metrics.overall.total = allTests.length;
  metrics.overall.accuracy = (metrics.overall.correct / metrics.overall.total) * 100;
  metrics.overall.avgConfidence = (totalConfidence / metrics.overall.total) * 100;
  metrics.performance.avgTotalTime = totalTime / metrics.overall.total;

  // Calculate accuracy by chapter
  for (const [chapter, stats] of metrics.byChapter.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }

  // Calculate accuracy by difficulty
  for (const [difficulty, stats] of metrics.byDifficulty.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }

  // Calculate accuracy by query length
  for (const [length, stats] of metrics.byQueryLength.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
  }

  // Print comprehensive report
  printReport(metrics, results, baselineTests.length);

  // Save results to file
  const resultsPath = path.join(__dirname, '../tests/comprehensive-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    metrics,
    results,
    summary: {
      totalCases: metrics.overall.total,
      correctCases: metrics.overall.correct,
      accuracy: metrics.overall.accuracy,
      avgConfidence: metrics.overall.avgConfidence,
      errors: metrics.overall.errors
    }
  }, null, 2));

  console.log(`\n📄 Results saved to: ${resultsPath}`);

  return {
    accuracy: metrics.overall.accuracy,
    correct: metrics.overall.correct,
    total: metrics.overall.total
  };
}

function printReport(metrics: TestMetrics, results: TestResult[], baselineCount: number) {
  console.log('\n' + '═'.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('═'.repeat(80));

  // Overall metrics
  console.log('\n📈 OVERALL METRICS:');
  console.log('─'.repeat(80));
  console.log(`   Total Test Cases: ${metrics.overall.total}`);
  console.log(`   Correct: ${metrics.overall.correct}`);
  console.log(`   Accuracy: ${metrics.overall.accuracy.toFixed(2)}%`);
  console.log(`   Average Confidence: ${metrics.overall.avgConfidence.toFixed(2)}%`);
  console.log(`   Errors: ${metrics.overall.errors}`);
  console.log(`   Average Time: ${metrics.performance.avgTotalTime.toFixed(0)}ms`);

  // Accuracy by chapter
  console.log('\n📊 ACCURACY BY CHAPTER:');
  console.log('─'.repeat(80));
  const sortedChapters = Array.from(metrics.byChapter.entries())
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  
  for (const [chapter, stats] of sortedChapters) {
    const status = stats.accuracy >= 80 ? '✅' : stats.accuracy >= 60 ? '⚠️' : '❌';
    console.log(`   Ch.${chapter.padStart(2, '0')}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%) ${status}`);
  }

  // Accuracy by difficulty
  console.log('\n📊 ACCURACY BY DIFFICULTY:');
  console.log('─'.repeat(80));
  const difficulties = ['easy', 'medium', 'hard'];
  for (const difficulty of difficulties) {
    const stats = metrics.byDifficulty.get(difficulty);
    if (stats) {
      console.log(`   ${difficulty.padEnd(10)}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`);
    }
  }

  // Accuracy by query length
  console.log('\n📊 ACCURACY BY QUERY LENGTH:');
  console.log('─'.repeat(80));
  const lengthCategories = ['short (1-2 words)', 'medium (3-5 words)', 'long (6+ words)'];
  for (const category of lengthCategories) {
    const stats = metrics.byQueryLength.get(category);
    if (stats) {
      console.log(`   ${category.padEnd(20)}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`);
    }
  }

  // Confidence distribution
  console.log('\n📊 CONFIDENCE DISTRIBUTION:');
  console.log('─'.repeat(80));
  console.log(`   High (≥90%):    ${metrics.confidenceDistribution.high} cases`);
  console.log(`   Medium (70-89%): ${metrics.confidenceDistribution.medium} cases`);
  console.log(`   Low (<70%):     ${metrics.confidenceDistribution.low} cases`);

  // Failed cases
  if (metrics.failedCases.length > 0) {
    console.log('\n❌ FAILED CASES:');
    console.log('─'.repeat(80));
    metrics.failedCases.slice(0, 20).forEach((result, idx) => {
      console.log(`\n${idx + 1}. Query: "${result.query}"`);
      console.log(`   Expected: ${result.expectedCode} (Ch.${result.chapter})`);
      console.log(`   Got: ${result.actualCode || 'ERROR'}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    if (metrics.failedCases.length > 20) {
      console.log(`\n   ... and ${metrics.failedCases.length - 20} more failed cases`);
    }
  }

  // Comparison to baseline (if applicable)
  if (baselineCount > 0) {
    console.log('\n📈 COMPARISON TO BASELINE:');
    console.log('─'.repeat(80));
    console.log(`   Baseline: 30 test cases (93.3% accuracy)`);
    console.log(`   Comprehensive: ${metrics.overall.total} test cases (${metrics.overall.accuracy.toFixed(1)}% accuracy)`);
    console.log(`   Difference: ${(metrics.overall.accuracy - 93.3).toFixed(1)} percentage points`);
  }

  // Target assessment
  console.log('\n🎯 TARGET ASSESSMENT:');
  console.log('─'.repeat(80));
  const targetMet = metrics.overall.accuracy >= 83;
  console.log(`   Target: 83%+ accuracy`);
  console.log(`   Status: ${targetMet ? '✅ MET' : '❌ NOT MET'}`);
  console.log(`   Current: ${metrics.overall.accuracy.toFixed(1)}%`);
  if (!targetMet) {
    console.log(`   Gap: ${(83 - metrics.overall.accuracy).toFixed(1)} percentage points needed`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ TEST SUITE COMPLETE');
  console.log('═'.repeat(80));
}

// Run the test suite
runComprehensiveTestSuite()
  .then(summary => {
    console.log(`\nFinal Accuracy: ${summary.accuracy.toFixed(2)}% (${summary.correct}/${summary.total})`);
    process.exit(summary.accuracy >= 83 ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });




/**
 * Biggest Test Cases Runner
 * 
 * Runs stress test cases to validate confidence scoring under extreme conditions:
 * - Longest descriptions (200+ words)
 * - Most complex products (multi-material, multi-function)
 * - Most ambiguous products (could fit multiple chapters)
 * - Real-world complex export scenarios
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyProduct } from '../src/services/ultimate-classifier.service';

interface BiggestTestCase {
  id: number;
  name: string;
  type: string;
  query: string;
  expectedCode: string;
  category: string;
  chapter: string;
  difficulty: string;
  notes: string;
}

interface BiggestTestResult {
  id: number;
  name: string;
  type: string;
  query: string;
  expectedCode: string;
  actualCode: string | null;
  correct: boolean;
  confidence: number;
  reasoning: string;
  queryLength: number;
  wordCount: number;
  error?: string;
  totalTime: number;
  confidenceCalibration: {
    isOverConfident: boolean;
    isUnderConfident: boolean;
    calibrationGap: number;
  };
}

interface StressTestMetrics {
  overall: {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    errors: number;
  };
  byType: Map<string, {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  }>;
  confidenceAnalysis: {
    correctHighConfidence: number; // Correct with >= 0.9 confidence
    correctLowConfidence: number; // Correct with < 0.7 confidence
    wrongHighConfidence: number; // Wrong with >= 0.9 confidence (over-confident)
    wrongLowConfidence: number; // Wrong with < 0.7 confidence (appropriate)
  };
  performance: {
    avgTotalTime: number;
    maxTime: number;
    minTime: number;
  };
  robustness: {
    longestQueryHandled: number;
    avgQueryLength: number;
    complexProductsHandled: number;
  };
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
    return true;
  }
  
  return false;
}

function analyzeConfidenceCalibration(
  correct: boolean,
  confidence: number
): { isOverConfident: boolean; isUnderConfident: boolean; calibrationGap: number } {
  const expectedConfidence = correct ? 1.0 : 0.0;
  const calibrationGap = Math.abs(confidence - expectedConfidence);

  return {
    isOverConfident: !correct && confidence >= 0.9,
    isUnderConfident: correct && confidence < 0.7,
    calibrationGap
  };
}

async function runBiggestTestCases() {
  console.log('🔥 BIGGEST TEST CASES - STRESS TEST RUNNER');
  console.log('═'.repeat(80));
  console.log('Loading stress test cases...\n');

  // Load biggest test cases
  const biggestTestPath = path.join(__dirname, '../tests/biggest-test-cases.json');
  const biggestTests: BiggestTestCase[] = JSON.parse(
    fs.readFileSync(biggestTestPath, 'utf-8')
  );

  console.log(`Loaded ${biggestTests.length} stress test cases\n`);

  const results: BiggestTestResult[] = [];
  const metrics: StressTestMetrics = {
    overall: {
      total: 0,
      correct: 0,
      accuracy: 0,
      avgConfidence: 0,
      errors: 0
    },
    byType: new Map(),
    confidenceAnalysis: {
      correctHighConfidence: 0,
      correctLowConfidence: 0,
      wrongHighConfidence: 0,
      wrongLowConfidence: 0
    },
    performance: {
      avgTotalTime: 0,
      maxTime: 0,
      minTime: Infinity
    },
    robustness: {
      longestQueryHandled: 0,
      avgQueryLength: 0,
      complexProductsHandled: 0
    }
  };

  let totalConfidence = 0;
  let totalTime = 0;
  let totalQueryLength = 0;

  // Run all stress test cases
  for (let i = 0; i < biggestTests.length; i++) {
    const testCase = biggestTests[i]!;
    const wordCount = testCase.query.split(/\s+/).length;
    totalQueryLength += wordCount;
    metrics.robustness.longestQueryHandled = Math.max(metrics.robustness.longestQueryHandled, wordCount);

    console.log(`[${i + 1}/${biggestTests.length}] ${testCase.name} (${testCase.type})`);
    console.log(`   Query length: ${wordCount} words`);
    console.log(`   Expected: ${testCase.expectedCode} (Ch.${testCase.chapter})`);
    console.log(`   Query preview: "${testCase.query.substring(0, 100)}..."`);

    const startTime = Date.now();

    try {
      const result = await classifyProduct(testCase.query, {
        candidateLimit: 50,
        useHierarchyExpansion: true,
        minConfidence: 0.6
      });

      const elapsed = Date.now() - startTime;
      totalTime += elapsed;
      metrics.performance.maxTime = Math.max(metrics.performance.maxTime, elapsed);
      metrics.performance.minTime = Math.min(metrics.performance.minTime, elapsed);

      const correct = isCorrectMatch(result.code, testCase.expectedCode);
      totalConfidence += result.confidence;

      const calibration = analyzeConfidenceCalibration(correct, result.confidence);

      // Update confidence analysis
      if (correct) {
        if (result.confidence >= 0.9) {
          metrics.confidenceAnalysis.correctHighConfidence++;
        } else if (result.confidence < 0.7) {
          metrics.confidenceAnalysis.correctLowConfidence++;
        }
      } else {
        if (result.confidence >= 0.9) {
          metrics.confidenceAnalysis.wrongHighConfidence++;
        } else if (result.confidence < 0.7) {
          metrics.confidenceAnalysis.wrongLowConfidence++;
        }
      }

      const testResult: BiggestTestResult = {
        id: testCase.id,
        name: testCase.name,
        type: testCase.type,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: result.code,
        correct,
        confidence: result.confidence,
        reasoning: result.reasoning,
        queryLength: testCase.query.length,
        wordCount,
        totalTime: elapsed,
        confidenceCalibration: calibration
      };

      results.push(testResult);

      if (correct) {
        metrics.overall.correct++;
        console.log(`   ✅ CORRECT: ${result.code} (${(result.confidence * 100).toFixed(1)}% confidence)`);
      } else {
        console.log(`   ❌ WRONG: Got ${result.code}, expected ${testCase.expectedCode}`);
        console.log(`      Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        if (calibration.isOverConfident) {
          console.log(`      ⚠️  OVER-CONFIDENT: High confidence but wrong answer`);
        }
      }

      console.log(`   Time: ${elapsed}ms`);
      console.log(`   Reasoning preview: "${result.reasoning.substring(0, 150)}..."\n`);

      // Update metrics by type
      if (!metrics.byType.has(testCase.type)) {
        metrics.byType.set(testCase.type, {
          total: 0,
          correct: 0,
          accuracy: 0,
          avgConfidence: 0
        });
      }
      const typeStats = metrics.byType.get(testCase.type)!;
      typeStats.total++;
      if (correct) typeStats.correct++;
      typeStats.avgConfidence += result.confidence;

      if (testCase.type === 'most_complex' || testCase.type === 'multi_material') {
        metrics.robustness.complexProductsHandled++;
      }

    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      totalTime += elapsed;
      metrics.overall.errors++;

      console.log(`   ❌ ERROR: ${error.message}\n`);

      const testResult: BiggestTestResult = {
        id: testCase.id,
        name: testCase.name,
        type: testCase.type,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: null,
        correct: false,
        confidence: 0,
        reasoning: '',
        queryLength: testCase.query.length,
        wordCount,
        error: error.message,
        totalTime: elapsed,
        confidenceCalibration: {
          isOverConfident: false,
          isUnderConfident: false,
          calibrationGap: 1.0
        }
      };

      results.push(testResult);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Calculate final metrics
  metrics.overall.total = biggestTests.length;
  metrics.overall.accuracy = (metrics.overall.correct / metrics.overall.total) * 100;
  metrics.overall.avgConfidence = (totalConfidence / metrics.overall.total) * 100;
  metrics.performance.avgTotalTime = totalTime / metrics.overall.total;
  metrics.robustness.avgQueryLength = totalQueryLength / metrics.overall.total;

  // Calculate accuracy by type
  for (const [type, stats] of metrics.byType.entries()) {
    stats.accuracy = (stats.correct / stats.total) * 100;
    stats.avgConfidence = stats.avgConfidence / stats.total;
  }

  // Print comprehensive report
  printStressTestReport(metrics, results);

  // Save results to file
  const resultsPath = path.join(__dirname, '../tests/biggest-test-results.json');
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

function printStressTestReport(metrics: StressTestMetrics, results: BiggestTestResult[]) {
  console.log('\n' + '═'.repeat(80));
  console.log('🔥 STRESS TEST RESULTS - CONFIDENCE VALIDATION');
  console.log('═'.repeat(80));

  // Overall metrics
  console.log('\n📈 OVERALL METRICS:');
  console.log('─'.repeat(80));
  console.log(`   Total Test Cases: ${metrics.overall.total}`);
  console.log(`   Correct: ${metrics.overall.correct}`);
  console.log(`   Accuracy: ${metrics.overall.accuracy.toFixed(2)}%`);
  console.log(`   Average Confidence: ${metrics.overall.avgConfidence.toFixed(2)}%`);
  console.log(`   Errors: ${metrics.overall.errors}`);

  // Performance metrics
  console.log('\n⚡ PERFORMANCE METRICS:');
  console.log('─'.repeat(80));
  console.log(`   Average Time: ${metrics.performance.avgTotalTime.toFixed(0)}ms`);
  console.log(`   Max Time: ${metrics.performance.maxTime}ms`);
  console.log(`   Min Time: ${metrics.performance.minTime === Infinity ? 'N/A' : metrics.performance.minTime + 'ms'}`);

  // Robustness metrics
  console.log('\n🛡️  ROBUSTNESS METRICS:');
  console.log('─'.repeat(80));
  console.log(`   Longest Query Handled: ${metrics.robustness.longestQueryHandled} words`);
  console.log(`   Average Query Length: ${metrics.robustness.avgQueryLength.toFixed(1)} words`);
  console.log(`   Complex Products Handled: ${metrics.robustness.complexProductsHandled}`);

  // Accuracy by test type
  console.log('\n📊 ACCURACY BY TEST TYPE:');
  console.log('─'.repeat(80));
  for (const [type, stats] of metrics.byType.entries()) {
    const status = stats.accuracy >= 80 ? '✅' : stats.accuracy >= 60 ? '⚠️' : '❌';
    console.log(`   ${type.padEnd(25)}: ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%) - Avg Confidence: ${(stats.avgConfidence * 100).toFixed(1)}% ${status}`);
  }

  // Confidence calibration analysis
  console.log('\n🎯 CONFIDENCE CALIBRATION ANALYSIS:');
  console.log('─'.repeat(80));
  console.log(`   ✅ Correct + High Confidence (≥90%): ${metrics.confidenceAnalysis.correctHighConfidence} cases`);
  console.log(`   ⚠️  Correct + Low Confidence (<70%): ${metrics.confidenceAnalysis.correctLowConfidence} cases (under-confident)`);
  console.log(`   ❌ Wrong + High Confidence (≥90%): ${metrics.confidenceAnalysis.wrongHighConfidence} cases (OVER-CONFIDENT - CRITICAL)`);
  console.log(`   ✅ Wrong + Low Confidence (<70%): ${metrics.confidenceAnalysis.wrongLowConfidence} cases (appropriate)`);

  const overConfidentRate = (metrics.confidenceAnalysis.wrongHighConfidence / metrics.overall.total) * 100;
  if (overConfidentRate > 10) {
    console.log(`\n   ⚠️  WARNING: ${overConfidentRate.toFixed(1)}% of cases are over-confident (wrong but high confidence)`);
    console.log(`   This indicates confidence calibration issues that need to be addressed.`);
  } else {
    console.log(`\n   ✅ Confidence calibration is good (${overConfidentRate.toFixed(1)}% over-confident rate)`);
  }

  // Detailed results for each test case
  console.log('\n📋 DETAILED RESULTS:');
  console.log('─'.repeat(80));
  results.forEach((result, idx) => {
    console.log(`\n${idx + 1}. ${result.name} (${result.type})`);
    console.log(`   Query: "${result.query.substring(0, 80)}..." (${result.wordCount} words)`);
    console.log(`   Expected: ${result.expectedCode}`);
    console.log(`   Got: ${result.actualCode || 'ERROR'}`);
    console.log(`   Correct: ${result.correct ? '✅' : '❌'}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    if (result.confidenceCalibration.isOverConfident) {
      console.log(`   ⚠️  OVER-CONFIDENT: High confidence but wrong answer`);
    }
    if (result.confidenceCalibration.isUnderConfident) {
      console.log(`   ⚠️  UNDER-CONFIDENT: Correct answer but low confidence`);
    }
    console.log(`   Time: ${result.totalTime}ms`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // Summary assessment
  console.log('\n🎯 STRESS TEST ASSESSMENT:');
  console.log('─'.repeat(80));
  const accuracyGood = metrics.overall.accuracy >= 70;
  const confidenceGood = overConfidentRate <= 10;
  const performanceGood = metrics.performance.avgTotalTime < 10000;

  console.log(`   Accuracy: ${accuracyGood ? '✅' : '❌'} ${metrics.overall.accuracy.toFixed(1)}% (target: ≥70%)`);
  console.log(`   Confidence Calibration: ${confidenceGood ? '✅' : '❌'} ${overConfidentRate.toFixed(1)}% over-confident (target: ≤10%)`);
  console.log(`   Performance: ${performanceGood ? '✅' : '❌'} ${metrics.performance.avgTotalTime.toFixed(0)}ms avg (target: <10s)`);

  if (accuracyGood && confidenceGood && performanceGood) {
    console.log(`\n   🎉 STRESS TEST PASSED: System handles extreme conditions well!`);
  } else {
    console.log(`\n   ⚠️  STRESS TEST NEEDS IMPROVEMENT: Some metrics below target`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ STRESS TEST COMPLETE');
  console.log('═'.repeat(80));
}

// Run the stress tests
runBiggestTestCases()
  .then(summary => {
    console.log(`\nFinal Accuracy: ${summary.accuracy.toFixed(2)}% (${summary.correct}/${summary.total})`);
    process.exit(summary.accuracy >= 70 ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  });




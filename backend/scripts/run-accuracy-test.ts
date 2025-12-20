import { classifyWithLLM } from '../src/services/llm-validation.service';
import * as fs from 'fs';
import * as path from 'path';

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
  actualCode: string;
  correct: boolean;
  confidence: number;
  reasoning: string;
  category: string;
  difficulty: string;
  searchTime: number;
  llmTime: number;
}

async function runAccuracyTest() {
  console.log('🧪 RUNNING COMPREHENSIVE ACCURACY TEST');
  console.log('═'.repeat(70));

  // Load test cases
  const testCasesPath = path.join(__dirname, '../tests/test-cases.json');
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));

  console.log(`Loaded ${testCases.length} test cases\n`);

  const results: TestResult[] = [];
  let correctCount = 0;
  let totalTime = 0;

  // Run each test case
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]!;

    console.log(`[${i + 1}/${testCases.length}] Testing: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expectedCode} (${testCase.category})`);

    try {
      const startTime = Date.now();
      const result = await classifyWithLLM(testCase.query);
      const elapsed = Date.now() - startTime;
      totalTime += elapsed;

      // Check if correct (exact match or parent match)
      const isExactMatch = result.code === testCase.expectedCode;
      const isParentMatch = testCase.expectedCode.startsWith(result.code);
      const isChildMatch = result.code.startsWith(testCase.expectedCode);
      const correct = isExactMatch || isParentMatch || isChildMatch;

      if (correct) correctCount++;

      const status = correct ? '✅' : '❌';
      console.log(`   ${status} Got: ${result.code} (${result.confidence}% confidence)`);
      if (!correct) {
        console.log(`   ⚠️  MISMATCH: Expected ${testCase.expectedCode}`);
      }
      console.log(`   Time: ${elapsed}ms\n`);

      results.push({
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: result.code,
        correct,
        confidence: result.confidence,
        reasoning: result.reasoning,
        category: testCase.category,
        difficulty: testCase.difficulty,
        searchTime: result.searchTime,
        llmTime: result.llmTime
      });

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}\n`);

      results.push({
        id: testCase.id,
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        actualCode: 'ERROR',
        correct: false,
        confidence: 0,
        reasoning: error instanceof Error ? error.message : String(error),
        category: testCase.category,
        difficulty: testCase.difficulty,
        searchTime: 0,
        llmTime: 0
      });
    }
  }

  // Calculate statistics
  const accuracy = (correctCount / testCases.length) * 100;
  const avgTime = totalTime / testCases.length;
  const avgSearchTime = results.reduce((sum, r) => sum + r.searchTime, 0) / results.length;
  const avgLLMTime = results.reduce((sum, r) => sum + r.llmTime, 0) / results.length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  // Analyze by difficulty
  const byDifficulty = {
    easy: results.filter(r => r.difficulty === 'easy'),
    medium: results.filter(r => r.difficulty === 'medium'),
    hard: results.filter(r => r.difficulty === 'hard')
  };

  const easyAccuracy = (byDifficulty.easy.filter(r => r.correct).length / byDifficulty.easy.length) * 100;
  const mediumAccuracy = (byDifficulty.medium.filter(r => r.correct).length / byDifficulty.medium.length) * 100;
  const hardAccuracy = (byDifficulty.hard.filter(r => r.correct).length / byDifficulty.hard.length) * 100;

  // Print summary
  console.log('═'.repeat(70));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total Test Cases: ${testCases.length}`);
  console.log(`Correct: ${correctCount}`);
  console.log(`Incorrect: ${testCases.length - correctCount}`);
  console.log(`Overall Accuracy: ${accuracy.toFixed(1)}%`);
  console.log();

  console.log('Accuracy by Difficulty:');
  console.log(`  Easy (${byDifficulty.easy.length} cases): ${easyAccuracy.toFixed(1)}%`);
  console.log(`  Medium (${byDifficulty.medium.length} cases): ${mediumAccuracy.toFixed(1)}%`);
  console.log(`  Hard (${byDifficulty.hard.length} cases): ${hardAccuracy.toFixed(1)}%`);
  console.log();

  console.log('Performance:');
  console.log(`  Average Total Time: ${avgTime.toFixed(0)}ms`);
  console.log(`  Average Search Time: ${avgSearchTime.toFixed(0)}ms`);
  console.log(`  Average LLM Time: ${avgLLMTime.toFixed(0)}ms`);
  console.log(`  Average Confidence: ${avgConfidence.toFixed(1)}%`);
  console.log();

  // Show failed cases
  const failures = results.filter(r => !r.correct);
  if (failures.length > 0) {
    console.log('═'.repeat(70));
    console.log(`❌ FAILED CASES (${failures.length})`);
    console.log('═'.repeat(70));

    failures.forEach(f => {
      console.log(`\n${f.id}. "${f.query}" (${f.category})`);
      console.log(`   Expected: ${f.expectedCode}`);
      console.log(`   Got: ${f.actualCode} (${f.confidence}% confidence)`);
      console.log(`   Reasoning: ${f.reasoning.substring(0, 100)}...`);
    });
  }

  // Save detailed results to file
  const resultsPath = path.join(__dirname, '../tests/test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalCases: testCases.length,
    correctCases: correctCount,
    accuracy: accuracy,
    accuracyByDifficulty: {
      easy: easyAccuracy,
      medium: mediumAccuracy,
      hard: hardAccuracy
    },
    performance: {
      avgTotalTime: avgTime,
      avgSearchTime: avgSearchTime,
      avgLLMTime: avgLLMTime,
      avgConfidence: avgConfidence
    },
    results: results
  }, null, 2));

  console.log('\n═'.repeat(70));
  console.log(`📄 Detailed results saved to: ${resultsPath}`);
  console.log('═'.repeat(70));

  return {
    accuracy,
    correctCount,
    totalCases: testCases.length,
    results
  };
}

runAccuracyTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });

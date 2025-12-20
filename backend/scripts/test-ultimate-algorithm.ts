/**
 * Test Ultimate Classification Algorithm
 *
 * Tests the new algorithm on all 30 test cases to measure improvement
 */

import { classifyProduct } from '../src/services/ultimate-classifier.service';

interface TestCase {
  query: string;
  expectedCode: string;
  description: string;
  category: string;
}

const TEST_CASES: TestCase[] = [
  // Original 30 test cases from baseline (with corrected expected codes based on actual database)
  { query: "fresh apples", expectedCode: "0808.10", description: "Fresh apples", category: "Agriculture" },
  { query: "coffee beans unroasted", expectedCode: "0901.11", description: "Coffee beans (unroasted)", category: "Agriculture" },
  { query: "cotton t-shirt", expectedCode: "6109.10", description: "Cotton t-shirts", category: "Textiles" },
  { query: "steel nuts and bolts", expectedCode: "7318.1", description: "Bolts and nuts", category: "Metals" },
  { query: "leather shoes for men", expectedCode: "6403", description: "Leather footwear", category: "Footwear" },
  { query: "ceramic brake pads for motorcycles", expectedCode: "8708.30", description: "Brake pads", category: "Automotive" },
  { query: "diesel engine for trucks", expectedCode: "8408.20", description: "Diesel engines", category: "Machinery" },
  { query: "laptop computer", expectedCode: "8471.30", description: "Laptops", category: "Electronics" },
  { query: "smartphone", expectedCode: "8517.1", description: "Smartphones", category: "Electronics" },
  { query: "children's plastic toys", expectedCode: "9503", description: "Toys", category: "Toys" },
  { query: "wooden dining table", expectedCode: "9403.60", description: "Wooden furniture", category: "Furniture" },
  { query: "solar panels", expectedCode: "8541.4", description: "Photovoltaic cells", category: "Electronics" },
  { query: "apple juice in bottles", expectedCode: "2009.7", description: "Apple juice", category: "Food" },
  { query: "wrist watch mechanical", expectedCode: "9101", description: "Mechanical watches (precious)", category: "Watches" },
  { query: "rubber tires for passenger cars", expectedCode: "4011.10", description: "Tires", category: "Automotive" },
  { query: "cotton fabric woven", expectedCode: "5208", description: "Cotton fabrics woven", category: "Textiles" },
  { query: "aluminum cans", expectedCode: "7612", description: "Aluminum containers", category: "Metals" },
  { query: "plastic bottles", expectedCode: "3923.30", description: "Plastic containers", category: "Plastics" },
  { query: "frozen fish whole", expectedCode: "0303", description: "Frozen fish whole", category: "Food" },
  { query: "olive oil", expectedCode: "1509", description: "Olive oil", category: "Food" },
  { query: "electric motors", expectedCode: "8501", description: "Electric motors", category: "Machinery" },
  { query: "LED light bulbs", expectedCode: "8539.5", description: "LED lamps", category: "Electronics" },
  { query: "glass bottles", expectedCode: "7010", description: "Glass containers", category: "Glass" },
  { query: "paper notebooks exercise books", expectedCode: "4820.10", description: "Notebooks", category: "Paper" },
  { query: "ceramic tiles", expectedCode: "6907", description: "Ceramic tiles", category: "Ceramics" },
  { query: "bicycle", expectedCode: "8712.00", description: "Bicycles", category: "Vehicles" },
  { query: "gold jewelry", expectedCode: "7113", description: "Gold jewelry", category: "Jewelry" },
  { query: "wheat flour", expectedCode: "1101", description: "Wheat flour", category: "Food" },
  { query: "hand tools screwdrivers", expectedCode: "8205.40", description: "Screwdrivers", category: "Tools" },
  { query: "aircraft turbine engine parts", expectedCode: "8411.9", description: "Aircraft turbine parts", category: "Aviation" }
];

async function runComprehensiveTest() {
  console.log('🧪 TESTING ULTIMATE CLASSIFICATION ALGORITHM');
  console.log('═'.repeat(80));
  console.log(`\nTest Cases: ${TEST_CASES.length}`);
  console.log('Target: 83%+ accuracy (25+ correct)\n');

  const results: Array<{
    query: string;
    expected: string;
    actual: string | null;
    correct: boolean;
    confidence: number;
    reasoning: string;
    error?: string;
  }> = [];

  let correct = 0;
  let totalConfidence = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i]!;
    console.log(`\n[${ i+ 1}/${TEST_CASES.length}] Testing: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expectedCode} - ${testCase.description}`);

    try {
      const result = await classifyProduct(testCase.query, {
        candidateLimit: 50,
        useHierarchyExpansion: true,
        minConfidence: 0.6
      });

      const isCorrect =
        result.code === testCase.expectedCode ||
        result.code.startsWith(testCase.expectedCode) ||
        testCase.expectedCode.startsWith(result.code);

      if (isCorrect) {
        correct++;
        console.log(`✅ CORRECT: ${result.code}`);
      } else {
        console.log(`❌ WRONG: Got ${result.code}, expected ${testCase.expectedCode}`);
      }

      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Reasoning: ${result.reasoning.substring(0, 100)}...`);

      totalConfidence += result.confidence;

      results.push({
        query: testCase.query,
        expected: testCase.expectedCode,
        actual: result.code,
        correct: isCorrect,
        confidence: result.confidence,
        reasoning: result.reasoning
      });

    } catch (error: any) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({
        query: testCase.query,
        expected: testCase.expectedCode,
        actual: null,
        correct: false,
        confidence: 0,
        reasoning: '',
        error: error.message
      });
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(80));

  const accuracy = (correct / TEST_CASES.length) * 100;
  const avgConfidence = (totalConfidence / TEST_CASES.length) * 100;
  const errors = results.filter(r => r.error).length;

  console.log(`\nAccuracy: ${correct}/${TEST_CASES.length} (${accuracy.toFixed(1)}%)`);
  console.log(`Average Confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`Errors: ${errors}`);

  // Print failed cases
  const failed = results.filter(r => !r.correct);
  if (failed.length > 0) {
    console.log(`\n❌ FAILED CASES (${failed.length}):`);
    console.log('─'.repeat(80));

    failed.forEach((result, idx) => {
      console.log(`\n${idx + 1}. Query: "${result.query}"`);
      console.log(`   Expected: ${result.expected}`);
      console.log(`   Got: ${result.actual || 'ERROR'}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      } else {
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   Reasoning: ${result.reasoning.substring(0, 150)}...`);
      }
    });
  }

  // Print accuracy by category
  console.log('\n📊 ACCURACY BY CATEGORY:');
  console.log('─'.repeat(80));

  const categories = new Map<string, { total: number; correct: number }>();

  TEST_CASES.forEach((testCase, idx) => {
    const category = testCase.category;
    if (!categories.has(category)) {
      categories.set(category, { total: 0, correct: 0 });
    }

    const stats = categories.get(category)!;
    stats.total++;
    if (results[idx]?.correct) {
      stats.correct++;
    }
  });

  for (const [category, stats] of categories.entries()) {
    const catAccuracy = (stats.correct / stats.total) * 100;
    console.log(`   ${category.padEnd(15)}: ${stats.correct}/${stats.total} (${catAccuracy.toFixed(0)}%)`);
  }

  // Comparison to baseline
  console.log('\n📈 IMPROVEMENT OVER BASELINE:');
  console.log('─'.repeat(80));
  console.log(`   Baseline Accuracy: 56.7% (17/30)`);
  console.log(`   New Algorithm: ${accuracy.toFixed(1)}% (${correct}/30)`);
  console.log(`   Improvement: ${(accuracy - 56.7).toFixed(1)} percentage points`);

  const targetMet = accuracy >= 83;
  console.log(`\n${targetMet ? '🎉' : '⚠️ '} Target (83% accuracy): ${targetMet ? 'MET!' : 'NOT MET'}`);

  console.log('\n═'.repeat(80));
  console.log('✅ TEST COMPLETE');
  console.log('═'.repeat(80));

  return {
    accuracy,
    avgConfidence,
    correct,
    total: TEST_CASES.length,
    failed,
    results
  };
}

// Run the test
runComprehensiveTest()
  .then(summary => {
    console.log(`\nFinal Accuracy: ${summary.accuracy.toFixed(1)}%`);
    process.exit(summary.accuracy >= 83 ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

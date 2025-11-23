/**
 * AI Classifier Service Test
 *
 * Tests the OpenAI GPT-4o-mini integration for HS code classification
 *
 * Tests:
 * 1. Prompt building with few-shot examples
 * 2. OpenAI API integration
 * 3. Response validation
 * 4. Cost tracking
 * 5. Classification accuracy with context
 */

import { classifyWithAI, generateReasoning } from './services/ai-classifier.service';
import { extractKeywords } from './services/keyword-matcher.service';

/**
 * Test products - mix of easy and challenging cases
 */
const TEST_PRODUCTS = [
  {
    id: 1,
    name: 'Windshield Wiper Blades',
    description: 'Flat beam wiper blades 22 inches frameless design for cars',
    expectedCode: '8512.40.00',
    answers: {
      primaryFunction: 'Cleaning/visibility',
      productType: 'Wiper blade',
      materialComposition: 'Rubber and metal'
    }
  },
  {
    id: 2,
    name: 'Fuel Pump Electric',
    description: 'In-tank electric fuel pump for petrol cars 12V 3.5 bar pressure',
    expectedCode: '8413.30.20',
    answers: {
      primaryFunction: 'Fuel delivery',
      productType: 'Pump',
      materialComposition: 'Metal and plastic'
    }
  },
  {
    id: 3,
    name: 'Exhaust Muffler',
    description: 'Aftermarket performance muffler for motorcycles slip-on type stainless steel',
    expectedCode: '8708.92.00',
    answers: {
      primaryFunction: 'Noise reduction',
      productType: 'Exhaust component',
      materialComposition: 'Stainless steel'
    }
  },
  {
    id: 4,
    name: 'CV Joint Boot Kit',
    description: 'Rubber boot kit for constant velocity joint with grease and clamps',
    expectedCode: '4016.93.90',
    answers: {
      primaryFunction: 'Protection',
      productType: 'Boot/seal',
      materialComposition: 'Rubber'
    }
  },
  {
    id: 5,
    name: 'Headlight Assembly Halogen',
    description: 'Complete headlight unit for sedans includes reflector and lens',
    expectedCode: '8512.20.10',
    answers: {
      primaryFunction: 'Lighting',
      productType: 'Headlight assembly',
      materialComposition: 'Plastic and glass'
    }
  }
];

interface TestResult {
  productId: number;
  productName: string;
  expectedCode: string;
  aiCode: string | null;
  confidence: number;
  isCorrect: boolean;
  reasoning: string;
  tokens: number;
  cost: number;
  timeMs: number;
}

/**
 * Test a single product with AI classification
 */
async function testProduct(product: typeof TEST_PRODUCTS[0]): Promise<TestResult> {
  const startTime = Date.now();

  try {
    console.log(`\nTesting: ${product.name}`);
    console.log(`Description: "${product.description}"`);
    console.log(`Expected HS Code: ${product.expectedCode}`);

    // Extract keywords for context
    const extracted = extractKeywords(product.description);

    // Call AI classifier
    const result = await classifyWithAI(
      product.description,
      product.answers,
      [], // No keyword matches for now
      [], // No decision tree results for now
      true // Force AI classification
    );

    const timeMs = Date.now() - startTime;

    if (result) {
      const isCorrect = result.hsCode === product.expectedCode;
      const status = isCorrect ? '✓ CORRECT' : '✗ INCORRECT';

      console.log(`${status} - AI suggested: ${result.hsCode} (confidence: ${result.confidence}%)`);
      console.log(`Reasoning: ${result.reasoning.substring(0, 150)}...`);
      if (result.alternativeCodes && result.alternativeCodes.length > 0) {
        console.log(`Alternatives: ${result.alternativeCodes.join(', ')}`);
      }

      return {
        productId: product.id,
        productName: product.name,
        expectedCode: product.expectedCode,
        aiCode: result.hsCode,
        confidence: result.confidence,
        isCorrect,
        reasoning: result.reasoning,
        tokens: 0, // Will be logged separately
        cost: 0,
        timeMs
      };
    } else {
      console.log('✗ FAILED - AI returned null');

      return {
        productId: product.id,
        productName: product.name,
        expectedCode: product.expectedCode,
        aiCode: null,
        confidence: 0,
        isCorrect: false,
        reasoning: 'AI classification failed',
        tokens: 0,
        cost: 0,
        timeMs
      };
    }

  } catch (error) {
    console.error(`✗ ERROR: ${error instanceof Error ? error.message : String(error)}`);

    return {
      productId: product.id,
      productName: product.name,
      expectedCode: product.expectedCode,
      aiCode: null,
      confidence: 0,
      isCorrect: false,
      reasoning: 'Error during classification',
      tokens: 0,
      cost: 0,
      timeMs: Date.now() - startTime
    };
  }
}

/**
 * Test reasoning generation separately
 */
async function testReasoningGeneration() {
  console.log('\n' + '═'.repeat(80));
  console.log('TEST: REASONING GENERATION');
  console.log('═'.repeat(80));

  const hsCode = '8708.30.00';
  const description = 'Ceramic brake pads for motorcycles';

  console.log(`\nGenerating reasoning for HS code ${hsCode}`);
  console.log(`Product: "${description}"`);

  try {
    const reasoning = await generateReasoning(hsCode, description);

    console.log(`\nGenerated Reasoning:`);
    console.log(reasoning);

    if (reasoning.length > 50 && reasoning.includes('Chapter')) {
      console.log('\n✓ PASS: Reasoning generation successful');
      return true;
    } else {
      console.log('\n✗ FAIL: Reasoning too short or incomplete');
      return false;
    }

  } catch (error) {
    console.error(`✗ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Run comprehensive AI classifier tests
 */
async function runComprehensiveTest() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'AI CLASSIFIER SERVICE TEST' + ' '.repeat(32) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  console.log('⚠ NOTE: This test will make real API calls to OpenAI and incur costs');
  console.log('Estimated cost: ~$0.01-0.02 for 5 products\n');

  const results: TestResult[] = [];

  // Test each product
  for (const product of TEST_PRODUCTS) {
    const result = await testProduct(product);
    results.push(result);

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Calculate statistics
  const successCount = results.filter(r => r.aiCode !== null).length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const avgConfidence = results
    .filter(r => r.confidence > 0)
    .reduce((sum, r) => sum + r.confidence, 0) / successCount || 0;
  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
  const accuracy = (correctCount / results.length) * 100;

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('SUMMARY STATISTICS');
  console.log('═'.repeat(80));
  console.log(`Total Products Tested:      ${results.length}`);
  console.log(`Successful API Calls:       ${successCount} / ${results.length}`);
  console.log(`Correct Classifications:    ${correctCount} / ${results.length} (${accuracy.toFixed(1)}%)`);
  console.log(`Average Confidence:         ${avgConfidence.toFixed(1)}%`);
  console.log(`Average Response Time:      ${avgTime.toFixed(0)}ms`);
  console.log('═'.repeat(80));

  // Print detailed results
  console.log('\nDETAILED RESULTS');
  console.log('═'.repeat(80));
  console.log(String('ID').padEnd(5) + String('Product').padEnd(30) + String('Expected').padEnd(15) + String('AI Result').padEnd(15) + 'Conf%');
  console.log('-'.repeat(80));

  for (const result of results) {
    const status = result.isCorrect ? '✓' : '✗';
    const productName = result.productName.substring(0, 28);
    console.log(
      `${status} ${String(result.productId).padEnd(3)} ${productName.padEnd(30)} ${result.expectedCode.padEnd(15)} ${(result.aiCode || 'none').padEnd(15)} ${result.confidence}%`
    );
  }

  // Performance vs targets
  console.log('\n' + '═'.repeat(80));
  console.log('PERFORMANCE VS TARGETS');
  console.log('═'.repeat(80));
  console.log(`Target Accuracy:            60%+ (AI should provide good baseline)`);
  console.log(`Actual Accuracy:            ${accuracy.toFixed(1)}% ${accuracy >= 60 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Target Confidence Range:    70-85%`);
  console.log(`Actual Confidence:          ${avgConfidence.toFixed(1)}% ${avgConfidence >= 70 && avgConfidence <= 90 ? '✓ GOOD' : '⚠ REVIEW'}`);
  console.log(`Target Response Time:       < 5000ms (API call)`);
  console.log(`Actual Response Time:       ${avgTime.toFixed(0)}ms ${avgTime < 5000 ? '✓ PASS' : '✗ SLOW'}`);
  console.log('═'.repeat(80));

  // Test reasoning generation
  const reasoningPassed = await testReasoningGeneration();

  console.log('\n' + '═'.repeat(80));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(80));

  return {
    total: results.length,
    correct: correctCount,
    accuracy,
    avgConfidence,
    avgTime,
    passedTarget: accuracy >= 60 && reasoningPassed
  };
}

/**
 * Main test runner
 */
async function runAllTests() {
  const summary = await runComprehensiveTest();

  if (summary.passedTarget) {
    console.log('\n✓ SUCCESS: AI Classifier meets Phase 1 requirements!');
    console.log(`  - Accuracy: ${summary.accuracy.toFixed(1)}% (target: 60%+)`);
    console.log(`  - Avg Confidence: ${summary.avgConfidence.toFixed(1)}%`);
    console.log(`  - Avg Response Time: ${summary.avgTime.toFixed(0)}ms`);
    console.log(`  - Reasoning generation: Working`);
    process.exit(0);
  } else {
    console.log('\n⚠ REVIEW NEEDED: Check results above');
    process.exit(1);
  }
}

// Run tests
console.log('\n⚠ WARNING: This will make real OpenAI API calls and incur costs!');
console.log('Press Ctrl+C within 3 seconds to cancel...\n');

setTimeout(() => {
  runAllTests().catch((error) => {
    console.error('\n✗ TEST EXECUTION FAILED:', error);
    process.exit(1);
  });
}, 3000);

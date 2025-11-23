/**
 * Complete Decision Tree Classification Test
 *
 * Tests the full decision tree workflow:
 * 1. Category detection
 * 2. Rule evaluation
 * 3. Result generation with confidence scores
 * 4. Reasoning generation
 *
 * Tests against real products from 20-product dataset
 */

import { applyDecisionTree, detectCategory } from './services/decision-tree.service';
import { extractKeywords } from './services/keyword-matcher.service';

/**
 * Test products matching our decision tree structure
 */
const TEST_PRODUCTS = [
  {
    id: 1,
    name: 'Ceramic Brake Pads',
    description: 'Aftermarket brake pads compatible with Royal Enfield 350cc models finished product',
    expectedCode: '8708.30.00',
    answers: {
      q1: 'Braking system',
      q2_brake: 'Brake pads/shoes'
    } as Record<string, string>
  },
  {
    id: 2,
    name: 'Disc Brake Rotors',
    description: 'Front disc brake rotors for cars 280mm diameter ventilated design machined surface',
    expectedCode: '8708.30.00',
    answers: {
      q1: 'Braking system',
      q2_brake: 'Brake disc/rotor'
    } as Record<string, string>
  },
  {
    id: 3,
    name: 'Engine Oil Filter',
    description: 'Spin-on oil filter for diesel engines replaceable cartridge type',
    expectedCode: '8421.23.00',
    answers: {
      q1: 'Filtration system',
      q4_filter: 'Oil filter'
    } as Record<string, string>
  },
  {
    id: 4,
    name: 'LED Headlight Bulb',
    description: '12V LED replacement bulb for motorcycles 6000K white light 30W power',
    expectedCode: '8539.29.40',
    answers: {
      q1: 'Electrical/Lighting',
      q5_electrical: 'Light bulb'
    } as Record<string, string>
  },
  {
    id: 5,
    name: 'Hydraulic Shock Absorber',
    description: 'Rear shock absorber for passenger cars gas-charged adjustable',
    expectedCode: '8708.80.00',
    answers: {
      q1: 'Suspension system'
    } as Record<string, string>
  },
  {
    id: 6,
    name: 'Piston Rings Set',
    description: 'Compression and oil control rings for 4-cylinder petrol engine standard size',
    expectedCode: '8409.91.13',
    answers: {
      q1: 'Engine component',
      q3_engine: 'Piston/piston rings'
    } as Record<string, string>
  },
  {
    id: 7,
    name: 'Clutch Plate Assembly',
    description: 'Friction clutch disc for manual transmission cars 240mm diameter',
    expectedCode: '8708.93.00',
    answers: {
      q1: 'Transmission component'
    } as Record<string, string>
  },
  {
    id: 8,
    name: 'Radiator Coolant',
    description: 'Ready-to-use engine coolant antifreeze 50% concentrate 5 liters',
    expectedCode: '3820.00.00',
    answers: {
      q1: 'Cooling system'
    } as Record<string, string>
  },
  {
    id: 9,
    name: 'Air Filter',
    description: 'Engine air intake filter for SUVs pleated paper design',
    expectedCode: '8421.31.00',
    answers: {
      q1: 'Filtration system',
      q4_filter: 'Air filter'
    } as Record<string, string>
  },
  {
    id: 10,
    name: 'Spark Plug',
    description: 'Standard spark plug for petrol engines 14mm thread copper electrode',
    expectedCode: '8511.10.00',
    answers: {
      q1: 'Engine component',
      q3_engine: 'Spark plug'
    } as Record<string, string>
  }
];

interface TestResult {
  productId: number;
  productName: string;
  category: string;
  expectedCode: string;
  topMatch: string | null;
  confidence: number;
  isCorrect: boolean;
  reasoning: string;
  timeMs: number;
}

/**
 * Test a single product through complete decision tree workflow
 */
async function testProduct(product: typeof TEST_PRODUCTS[0]): Promise<TestResult> {
  const startTime = Date.now();

  try {
    // Step 1: Detect category
    const category = await detectCategory(product.description);

    // Step 2: Extract keywords
    const extracted = extractKeywords(product.description);

    // Step 3: Apply decision tree
    const results = await applyDecisionTree(category, product.answers, extracted.filtered);

    const timeMs = Date.now() - startTime;

    const topMatch = results.length > 0 && results[0] ? results[0].hsCode : null;
    const confidence = results.length > 0 && results[0] ? results[0].confidence : 0;
    const reasoning = results.length > 0 && results[0] ? results[0].reasoning : 'No match';

    const isCorrect = topMatch === product.expectedCode;

    return {
      productId: product.id,
      productName: product.name,
      category,
      expectedCode: product.expectedCode,
      topMatch,
      confidence,
      isCorrect,
      reasoning,
      timeMs
    };

  } catch (error) {
    console.error(`Error testing product ${product.id}:`, error);
    return {
      productId: product.id,
      productName: product.name,
      category: 'Error',
      expectedCode: product.expectedCode,
      topMatch: null,
      confidence: 0,
      isCorrect: false,
      reasoning: 'Error during classification',
      timeMs: Date.now() - startTime
    };
  }
}

/**
 * Run comprehensive test on all products
 */
async function runComprehensiveTest() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(12) + 'DECISION TREE - COMPLETE CLASSIFICATION TEST' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  const results: TestResult[] = [];

  console.log(`Testing ${TEST_PRODUCTS.length} products through complete decision tree workflow...\n`);

  // Test each product
  for (const product of TEST_PRODUCTS) {
    process.stdout.write(`Testing ${product.id}/${TEST_PRODUCTS.length}: ${product.name.substring(0, 35).padEnd(35)}... `);

    const result = await testProduct(product);
    results.push(result);

    if (result.isCorrect) {
      console.log(`✓ PASS (${result.confidence}% confidence, ${result.timeMs}ms)`);
    } else {
      console.log(`✗ FAIL (expected: ${result.expectedCode}, got: ${result.topMatch || 'none'})`);
    }
  }

  // Calculate statistics
  const correctCount = results.filter(r => r.isCorrect).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
  const accuracy = (correctCount / results.length) * 100;

  // Print detailed results
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('='.repeat(80));
  console.log(String('ID').padEnd(5) + String('Product').padEnd(35) + String('Expected').padEnd(15) + String('Got').padEnd(15) + 'Conf%');
  console.log('-'.repeat(80));

  for (const result of results) {
    const status = result.isCorrect ? '✓' : '✗';
    const productName = result.productName.substring(0, 33);
    console.log(
      `${status} ${String(result.productId).padEnd(3)} ${productName.padEnd(35)} ${result.expectedCode.padEnd(15)} ${(result.topMatch || 'none').padEnd(15)} ${result.confidence}%`
    );
  }

  // Print failed products analysis
  const failedProducts = results.filter(r => !r.isCorrect);
  if (failedProducts.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('FAILED PRODUCTS ANALYSIS');
    console.log('='.repeat(80));
    for (const failed of failedProducts) {
      console.log(`\n${failed.productId}. ${failed.productName}`);
      console.log(`   Expected:   ${failed.expectedCode}`);
      console.log(`   Got:        ${failed.topMatch || 'none'}`);
      console.log(`   Confidence: ${failed.confidence}%`);
      console.log(`   Category:   ${failed.category}`);
      console.log(`   Reasoning:  ${failed.reasoning.substring(0, 100)}...`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total Products Tested:      ${results.length}`);
  console.log(`Correct Classifications:    ${correctCount} / ${results.length} (${accuracy.toFixed(1)}%)`);
  console.log(`Average Confidence:         ${avgConfidence.toFixed(1)}%`);
  console.log(`Average Response Time:      ${avgTime.toFixed(0)}ms`);
  console.log('='.repeat(80));

  // Performance vs targets
  console.log('\nPERFORMANCE VS TARGETS');
  console.log('='.repeat(80));
  console.log(`Target Accuracy:            70%+`);
  console.log(`Actual Accuracy:            ${accuracy.toFixed(1)}% ${accuracy >= 70 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Target Weight:              40% (higher than keyword matching)`);
  console.log(`Expected Confidence Range:  70-90%`);
  console.log(`Actual Confidence:          ${avgConfidence.toFixed(1)}% ${avgConfidence >= 70 && avgConfidence <= 90 ? '✓ GOOD' : '⚠ REVIEW'}`);
  console.log(`Target Response Time:       < 1000ms`);
  console.log(`Actual Response Time:       ${avgTime.toFixed(0)}ms ${avgTime < 1000 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('='.repeat(80));

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));

  // Return summary
  return {
    total: results.length,
    correct: correctCount,
    accuracy,
    avgConfidence,
    avgTime,
    passedTarget: accuracy >= 70
  };
}

/**
 * Test category detection separately
 */
async function testCategoryDetection() {
  console.log('\n' + '='.repeat(80));
  console.log('CATEGORY DETECTION TEST');
  console.log('='.repeat(80));

  const testCases = [
    { desc: 'Ceramic brake pads for motorcycles', expected: 'Automotive Parts' },
    { desc: 'Engine oil filter paper element', expected: 'Automotive Parts' },
    { desc: 'LED headlight bulb for cars', expected: 'Automotive Parts' },
    { desc: 'Cotton t-shirt for men', expected: 'General' },
    { desc: 'Wooden furniture dining table', expected: 'General' }
  ];

  let correct = 0;

  for (const testCase of testCases) {
    const detected = await detectCategory(testCase.desc);
    const isCorrect = detected === testCase.expected;

    if (isCorrect) {
      correct++;
      console.log(`✓ "${testCase.desc.substring(0, 50)}" → ${detected}`);
    } else {
      console.log(`✗ "${testCase.desc.substring(0, 50)}" → ${detected} (expected: ${testCase.expected})`);
    }
  }

  console.log(`\nCategory Detection: ${correct}/${testCases.length} correct (${(correct / testCases.length * 100).toFixed(0)}%)`);
  console.log('='.repeat(80));
}

/**
 * Main test runner
 */
async function runAllTests() {
  // Test 1: Category detection
  await testCategoryDetection();

  // Test 2: Complete workflow
  const summary = await runComprehensiveTest();

  // Final verdict
  if (summary.passedTarget) {
    console.log('\n✓ SUCCESS: Decision tree meets Phase 1 Day 3-4 requirements!');
    console.log(`  - Accuracy: ${summary.accuracy.toFixed(1)}% (target: 70%+)`);
    console.log(`  - Avg Confidence: ${summary.avgConfidence.toFixed(1)}%`);
    console.log(`  - Avg Response Time: ${summary.avgTime.toFixed(0)}ms`);
    process.exit(0);
  } else {
    console.log('\n✗ FAILURE: Accuracy below 70% target. Review failed products above.');
    process.exit(1);
  }
}

// Run all tests
runAllTests()
  .catch((error) => {
    console.error('\n✗ TEST EXECUTION FAILED:', error);
    process.exit(1);
  });

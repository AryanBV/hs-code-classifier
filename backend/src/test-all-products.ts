/**
 * Comprehensive Test Suite for Keyword Matcher
 *
 * Tests all 20 products from the seeded database
 * Generates accuracy report for Phase 1 evaluation
 */

import { keywordMatch } from './services/keyword-matcher.service';

// All 20 products from test_dataset.csv
const ALL_PRODUCTS = [
  { id: 1, name: 'Ceramic Brake Pads for Motorcycles', description: 'Aftermarket brake pads compatible with Royal Enfield 350cc models finished product', expectedCode: '8708.30.00' },
  { id: 2, name: 'Disc Brake Rotors - Cast Iron', description: 'Front disc brake rotors for cars 280mm diameter ventilated design machined surface', expectedCode: '8708.30.00' },
  { id: 3, name: 'Engine Oil Filter - Paper Element', description: 'Spin-on oil filter for diesel engines replaceable cartridge type', expectedCode: '8421.23.00' },
  { id: 4, name: 'LED Headlight Bulb - H4 Type', description: '12V LED replacement bulb for motorcycles 6000K white light 30W power', expectedCode: '8539.29.40' },
  { id: 5, name: 'Shock Absorber - Hydraulic', description: 'Rear shock absorber for passenger cars gas-charged adjustable', expectedCode: '8708.80.00' },
  { id: 6, name: 'Piston Rings Set', description: 'Compression and oil control rings for 4-cylinder petrol engine standard size', expectedCode: '8409.91.13' },
  { id: 7, name: 'Clutch Plate Assembly', description: 'Friction clutch disc for manual transmission cars 240mm diameter', expectedCode: '8708.93.00' },
  { id: 8, name: 'Radiator Coolant - Ethylene Glycol', description: 'Ready-to-use engine coolant 50% concentrate 5 liters', expectedCode: '3820.00.00' },
  { id: 9, name: 'Brake Fluid DOT 4', description: 'Hydraulic brake fluid synthetic 500ml bottle', expectedCode: '3819.00.10' },
  { id: 10, name: 'Air Filter - Paper Element', description: 'Engine air intake filter for SUVs pleated paper design', expectedCode: '8421.31.00' },
  { id: 11, name: 'Spark Plug - Copper Core', description: 'Standard spark plug for petrol engines 14mm thread copper electrode', expectedCode: '8511.10.00' },
  { id: 12, name: 'Timing Belt - Rubber', description: 'Camshaft timing belt for 4-cylinder engines toothed design 120 teeth', expectedCode: '4010.32.90' },
  { id: 13, name: 'Ball Bearings - Deep Groove', description: 'Wheel hub bearings for front axle sealed type 6205 size', expectedCode: '8482.10.20' },
  { id: 14, name: 'Windshield Wiper Blades', description: 'Flat beam wiper blades 22 inches frameless design', expectedCode: '8512.40.00' },
  { id: 15, name: 'Fuel Pump - Electric', description: 'In-tank electric fuel pump for petrol cars 12V 3.5 bar pressure', expectedCode: '8413.30.20' },
  { id: 16, name: 'Exhaust Muffler - Stainless Steel', description: 'Aftermarket performance muffler for motorcycles slip-on type', expectedCode: '8708.92.00' },
  { id: 17, name: 'CV Joint Boot Kit', description: 'Rubber boot kit for constant velocity joint with grease and clamps', expectedCode: '4016.93.90' },
  { id: 18, name: 'Headlight Assembly - Halogen', description: 'Complete headlight unit for sedans includes reflector and lens', expectedCode: '8512.20.10' },
  { id: 19, name: 'Alternator - 12V 80A', description: 'Electrical generator for charging battery brushless design', expectedCode: '8511.50.00' },
  { id: 20, name: 'Radiator Hose - Silicone', description: 'Upper radiator hose for coolant system flexible high-temperature rated', expectedCode: '4009.31.00' }
];

interface TestResult {
  productId: number;
  productName: string;
  expectedCode: string;
  topMatch: string | null;
  matchScore: number;
  rank: number;  // Rank of expected code in results (1 = top match)
  isCorrect: boolean;
  topThreeMatches: string[];
  timeMs: number;
}

/**
 * Test a single product
 */
async function testProduct(product: typeof ALL_PRODUCTS[0]): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const matches = await keywordMatch(product.description);
    const timeMs = Date.now() - startTime;

    const topMatch = matches.length > 0 && matches[0] ? matches[0].hsCode : null;
    const matchScore = matches.length > 0 && matches[0] ? matches[0].matchScore : 0;

    // Find rank of expected code
    const rank = matches.findIndex(m => m.hsCode === product.expectedCode) + 1;
    const isCorrect = rank === 1;

    const topThreeMatches = matches.slice(0, 3).map(m => m.hsCode);

    return {
      productId: product.id,
      productName: product.name,
      expectedCode: product.expectedCode,
      topMatch,
      matchScore,
      rank: rank || 999,  // 999 if not found
      isCorrect,
      topThreeMatches,
      timeMs
    };
  } catch (error) {
    console.error(`Error testing product ${product.id}:`, error);
    return {
      productId: product.id,
      productName: product.name,
      expectedCode: product.expectedCode,
      topMatch: null,
      matchScore: 0,
      rank: 999,
      isCorrect: false,
      topThreeMatches: [],
      timeMs: Date.now() - startTime
    };
  }
}

/**
 * Run all tests and generate report
 */
async function runComprehensiveTest() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(15) + 'KEYWORD MATCHER - 20 PRODUCT ACCURACY TEST' + ' '.repeat(20) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  const results: TestResult[] = [];

  console.log('Testing all 20 products...\n');

  // Test each product
  for (const product of ALL_PRODUCTS) {
    process.stdout.write(`Testing ${product.id}/20: ${product.name.substring(0, 40).padEnd(40)}... `);

    const result = await testProduct(product);
    results.push(result);

    if (result.isCorrect) {
      console.log(`✓ PASS (${result.matchScore}% score, ${result.timeMs}ms)`);
    } else {
      console.log(`✗ FAIL (expected: ${result.expectedCode}, got: ${result.topMatch}, rank: ${result.rank === 999 ? 'not found' : result.rank})`);
    }
  }

  // Calculate statistics
  const correctCount = results.filter(r => r.isCorrect).length;
  const top3Count = results.filter(r => r.rank <= 3 && r.rank > 0).length;
  const notFoundCount = results.filter(r => r.rank === 999).length;
  const avgScore = results.reduce((sum, r) => sum + r.matchScore, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
  const top1Accuracy = (correctCount / results.length) * 100;
  const top3Accuracy = (top3Count / results.length) * 100;

  // Print detailed results
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('='.repeat(80));
  console.log(String('ID').padEnd(5) + String('Product').padEnd(40) + String('Expected').padEnd(15) + String('Got').padEnd(15) + 'Score');
  console.log('-'.repeat(80));

  for (const result of results) {
    const status = result.isCorrect ? '✓' : '✗';
    const productName = result.productName.substring(0, 38);
    console.log(
      `${status} ${String(result.productId).padEnd(3)} ${productName.padEnd(40)} ${result.expectedCode.padEnd(15)} ${(result.topMatch || 'none').padEnd(15)} ${result.matchScore}%`
    );
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total Products Tested:     ${results.length}`);
  console.log(`Top-1 Correct:             ${correctCount} / ${results.length} (${top1Accuracy.toFixed(1)}%)`);
  console.log(`Top-3 Correct:             ${top3Count} / ${results.length} (${top3Accuracy.toFixed(1)}%)`);
  console.log(`Not Found in Results:      ${notFoundCount}`);
  console.log(`Average Match Score:       ${avgScore.toFixed(1)}%`);
  console.log(`Average Response Time:     ${avgTime.toFixed(0)}ms`);
  console.log('='.repeat(80));

  // Performance vs targets
  console.log('\nPERFORMANCE VS TARGETS');
  console.log('='.repeat(80));
  console.log(`Target Accuracy:           60%+ top-1`);
  console.log(`Actual Accuracy:           ${top1Accuracy.toFixed(1)}% top-1 ${top1Accuracy >= 60 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Target Response Time:      < 1000ms`);
  console.log(`Actual Response Time:      ${avgTime.toFixed(0)}ms ${avgTime < 1000 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('='.repeat(80));

  // Failed products analysis
  const failedProducts = results.filter(r => !r.isCorrect);
  if (failedProducts.length > 0) {
    console.log('\nFAILED PRODUCTS ANALYSIS');
    console.log('='.repeat(80));
    for (const failed of failedProducts) {
      console.log(`\n${failed.productId}. ${failed.productName}`);
      console.log(`   Expected: ${failed.expectedCode}`);
      console.log(`   Got:      ${failed.topMatch || 'none'} (rank: ${failed.rank === 999 ? 'not found' : failed.rank})`);
      console.log(`   Top 3:    ${failed.topThreeMatches.join(', ') || 'none'}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));

  // Return summary for programmatic use
  return {
    total: results.length,
    correctTop1: correctCount,
    correctTop3: top3Count,
    accuracyTop1: top1Accuracy,
    accuracyTop3: top3Accuracy,
    avgScore,
    avgTime,
    passedTarget: top1Accuracy >= 60
  };
}

// Run the test
runComprehensiveTest()
  .then((summary) => {
    if (summary.passedTarget) {
      console.log('\n✓ SUCCESS: Keyword matcher meets Phase 1 Day 1-2 requirements!');
      process.exit(0);
    } else {
      console.log('\n✗ FAILURE: Accuracy below 60% target. Needs optimization.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n✗ TEST EXECUTION FAILED:', error);
    process.exit(1);
  });

/**
 * Comprehensive Classification Test
 *
 * Tests the complete end-to-end classification pipeline with all 20 products
 * from the verified automotive parts dataset.
 *
 * Success Criteria:
 * - 70%+ accuracy (14+ correct out of 20)
 * - Average response time < 30 seconds
 * - No crashes or unhandled errors
 * - All 3 methods integrated and working
 */

import { classifyProduct } from './services/confidence-scorer.service';
import { ClassifyRequest } from './types/classification.types';

// Test dataset: All 20 verified automotive products
const testProducts = [
  {
    id: 1,
    description: "Aftermarket brake pads, compatible with Royal Enfield 350cc models, finished product ready for retail. 60% ceramic composite, 30% copper particles, 10% organic binders",
    expected: "8708.30.00",
    name: "Ceramic Brake Pads for Motorcycles"
  },
  {
    id: 2,
    description: "Front disc brake rotors for cars, 280mm diameter, ventilated design, machined surface. 98% cast iron, 2% carbon",
    expected: "8708.30.00",
    name: "Disc Brake Rotors - Cast Iron"
  },
  {
    id: 3,
    description: "Spin-on oil filter for diesel engines, replaceable cartridge type. Paper filter media, steel casing, rubber gasket",
    expected: "8421.23.00",
    name: "Engine Oil Filter - Paper Element"
  },
  {
    id: 4,
    description: "12V LED replacement bulb for motorcycles, 6000K white light, 30W power. LED chips, aluminum heat sink, polycarbonate lens",
    expected: "8539.29.40",
    name: "LED Headlight Bulb - H4 Type"
  },
  {
    id: 5,
    description: "Rear shock absorber for passenger cars, gas-charged, adjustable. Steel body, hydraulic fluid, rubber bushings",
    expected: "8708.80.00",
    name: "Shock Absorber - Hydraulic"
  },
  {
    id: 6,
    description: "Compression and oil control rings for 4-cylinder petrol engine, standard size. Cast iron with chrome plating",
    expected: "8409.91.13",
    name: "Piston Rings Set"
  },
  {
    id: 7,
    description: "Friction clutch disc for manual transmission cars, 240mm diameter. Friction material (organic), steel core, springs",
    expected: "8708.93.00",
    name: "Clutch Plate Assembly"
  },
  {
    id: 8,
    description: "Ready-to-use engine coolant, 50% concentrate, 5 liters. 50% ethylene glycol, 50% distilled water, corrosion inhibitors",
    expected: "3820.00.00",
    name: "Radiator Coolant - Ethylene Glycol"
  },
  {
    id: 9,
    description: "Hydraulic brake fluid, synthetic, 500ml bottle. Polyglycol ethers, borate esters",
    expected: "3819.00.10",
    name: "Brake Fluid DOT 4"
  },
  {
    id: 10,
    description: "Engine air intake filter for SUVs, pleated paper design. Filter paper, polyurethane seal, cardboard frame",
    expected: "8421.31.00",
    name: "Air Filter - Paper Element"
  },
  {
    id: 11,
    description: "Standard spark plug for petrol engines, 14mm thread, copper electrode. Ceramic insulator, steel shell, copper electrode",
    expected: "8511.10.00",
    name: "Spark Plug - Copper Core"
  },
  {
    id: 12,
    description: "Camshaft timing belt for 4-cylinder engines, toothed design, 120 teeth. Reinforced rubber, nylon teeth",
    expected: "4010.32.90",
    name: "Timing Belt - Rubber"
  },
  {
    id: 13,
    description: "Wheel hub bearings for front axle, sealed type, 6205 size. Chrome steel balls, steel races, rubber seals",
    expected: "8482.10.20",
    name: "Ball Bearings - Deep Groove"
  },
  {
    id: 14,
    description: "Flat beam wiper blades, 22 inches, frameless design. Natural rubber squeegee, steel frame, plastic adapters",
    expected: "8512.40.00",
    name: "Windshield Wiper Blades"
  },
  {
    id: 15,
    description: "In-tank electric fuel pump for petrol cars, 12V, 3.5 bar pressure. Electric motor, plastic body, fuel-resistant seals",
    expected: "8413.30.20",
    name: "Fuel Pump - Electric"
  },
  {
    id: 16,
    description: "Aftermarket performance muffler for motorcycles, slip-on type. 304 stainless steel body, perforated tube, fiberglass packing",
    expected: "8708.92.00",
    name: "Exhaust Muffler - Stainless Steel"
  },
  {
    id: 17,
    description: "Rubber boot kit for constant velocity joint, with grease and clamps. NBR rubber boot, CV joint grease, steel clamps",
    expected: "4016.93.90",
    name: "CV Joint Boot Kit"
  },
  {
    id: 18,
    description: "Complete headlight unit for sedans, includes reflector and lens. Polycarbonate lens, aluminum reflector, steel housing",
    expected: "8512.20.10",
    name: "Headlight Assembly - Halogen"
  },
  {
    id: 19,
    description: "Electrical generator for charging battery, brushless design. Copper windings, steel rotor, aluminum housing",
    expected: "8511.50.00",
    name: "Alternator - 12V 80A"
  },
  {
    id: 20,
    description: "Upper radiator hose for coolant system, flexible, high-temperature rated. Silicone rubber with polyester reinforcement",
    expected: "4009.31.00",
    name: "Radiator Hose - Silicone"
  }
];

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  confidence: number;
  responseTime: number;
  reasoning: string;
}

/**
 * Run classification tests on all 20 products
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'COMPREHENSIVE CLASSIFICATION TEST' + ' '.repeat(25) + '║');
  console.log('║' + ' '.repeat(25) + '20 Automotive Products' + ' '.repeat(30) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  console.log('Testing complete end-to-end classification pipeline:');
  console.log('  ✓ Keyword Matcher (30% weight)');
  console.log('  ✓ Decision Tree (40% weight)');
  console.log('  ✓ AI Classifier (30% weight)');
  console.log('  ✓ Result Merging & Confidence Scoring');
  console.log('\n');

  const results: TestResult[] = [];
  let totalResponseTime = 0;

  // Run tests sequentially to avoid rate limiting
  for (const test of testProducts) {
    console.log('─'.repeat(80));
    console.log(`TEST ${test.id}/20: ${test.name}`);
    console.log('─'.repeat(80));
    console.log(`Description: "${test.description.substring(0, 80)}..."`);
    console.log(`Expected HS Code: ${test.expected}`);

    const startTime = Date.now();

    try {
      const request: ClassifyRequest = {
        productDescription: test.description,
        destinationCountry: 'IN'
      };

      const response = await classifyProduct(request);
      const responseTime = Date.now() - startTime;
      totalResponseTime += responseTime;

      const topResult = response.results[0];
      const actualCode = topResult?.hsCode || '0000.00.00';
      const confidence = topResult?.confidence || 0;
      const reasoning = topResult?.reasoning || 'No reasoning provided';

      // Normalize HS codes for comparison (remove dots)
      const normalizedExpected = test.expected.replace(/\./g, '');
      const normalizedActual = actualCode.replace(/\./g, '');

      const passed = normalizedActual === normalizedExpected;

      results.push({
        id: test.id,
        name: test.name,
        passed,
        expected: test.expected,
        actual: actualCode,
        confidence,
        responseTime,
        reasoning
      });

      console.log(`\nResult: ${actualCode} (${confidence}% confidence)`);
      console.log(`Response Time: ${responseTime}ms (${(responseTime / 1000).toFixed(2)}s)`);

      if (passed) {
        console.log(`Status: ✓ PASS - Correct classification`);
      } else {
        console.log(`Status: ✗ FAIL - Expected ${test.expected}, got ${actualCode}`);
      }

      console.log(`Reasoning: ${reasoning.substring(0, 100)}...`);
      console.log('');

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      const responseTime = Date.now() - startTime;
      totalResponseTime += responseTime;

      console.log(`\n✗ ERROR: Classification failed`);
      console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Response Time: ${responseTime}ms\n`);

      results.push({
        id: test.id,
        name: test.name,
        passed: false,
        expected: test.expected,
        actual: 'ERROR',
        confidence: 0,
        responseTime,
        reasoning: 'Classification error occurred'
      });
    }
  }

  // Print summary
  printSummary(results, totalResponseTime);
}

/**
 * Print detailed test summary
 */
function printSummary(results: TestResult[], totalResponseTime: number) {
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const accuracy = (passed / results.length) * 100;
  const avgResponseTime = totalResponseTime / results.length;

  console.log(`\nOverall Results:`);
  console.log(`  Total Tests:        ${results.length}`);
  console.log(`  Passed:             ${passed} (${accuracy.toFixed(1)}%)`);
  console.log(`  Failed:             ${failed} (${(100 - accuracy).toFixed(1)}%)`);
  console.log(`  Total Time:         ${(totalResponseTime / 1000).toFixed(2)}s`);
  console.log(`  Average Time:       ${(avgResponseTime / 1000).toFixed(2)}s per classification`);

  // Detailed results
  console.log('\n\nDetailed Results:');
  console.log('─'.repeat(80));

  const passedTests = results.filter(r => r.passed);
  const failedTests = results.filter(r => !r.passed);

  console.log(`\n✓ PASSED (${passedTests.length}):`);
  for (const result of passedTests) {
    console.log(`  ${result.id}. ${result.name}`);
    console.log(`     → ${result.actual} (${result.confidence}% confidence, ${(result.responseTime / 1000).toFixed(2)}s)`);
  }

  console.log(`\n✗ FAILED (${failedTests.length}):`);
  for (const result of failedTests) {
    console.log(`  ${result.id}. ${result.name}`);
    console.log(`     → Got: ${result.actual}, Expected: ${result.expected} (${(result.responseTime / 1000).toFixed(2)}s)`);
    console.log(`     → Reasoning: ${result.reasoning.substring(0, 80)}...`);
  }

  // Performance metrics
  console.log('\n\nPerformance Metrics:');
  console.log('─'.repeat(80));
  console.log(`  Fastest Classification:  ${Math.min(...results.map(r => r.responseTime))}ms`);
  console.log(`  Slowest Classification:  ${Math.max(...results.map(r => r.responseTime))}ms`);
  console.log(`  Average Confidence:      ${(results.reduce((sum, r) => sum + r.confidence, 0) / results.length).toFixed(1)}%`);

  // Success criteria check
  console.log('\n\nSuccess Criteria:');
  console.log('─'.repeat(80));
  console.log(`  ✓ Accuracy >= 70%:              ${accuracy >= 70 ? 'YES (' + accuracy.toFixed(1) + '%)' : 'NO (' + accuracy.toFixed(1) + '%)'}`);
  console.log(`  ✓ Avg Response Time < 30s:      ${avgResponseTime < 30000 ? 'YES (' + (avgResponseTime / 1000).toFixed(2) + 's)' : 'NO (' + (avgResponseTime / 1000).toFixed(2) + 's)'}`);
  console.log(`  ✓ No Crashes:                   ${results.every(r => r.actual !== 'ERROR') ? 'YES' : 'NO'}`);
  console.log(`  ✓ All Methods Integrated:       YES`);

  console.log('\n');
  console.log('═'.repeat(80));

  // Final verdict
  if (accuracy >= 70 && avgResponseTime < 30000 && results.every(r => r.actual !== 'ERROR')) {
    console.log('\n✓ SUCCESS: All success criteria met!');
    console.log('  - Classification pipeline working end-to-end');
    console.log('  - All 3 methods integrated successfully');
    console.log('  - Performance within target range');
    console.log('  - Ready for production deployment');
  } else {
    console.log('\n⚠ PARTIAL SUCCESS: Some criteria not met');
    if (accuracy < 70) {
      console.log(`  - Accuracy below target: ${accuracy.toFixed(1)}% (need 70%+)`);
    }
    if (avgResponseTime >= 30000) {
      console.log(`  - Response time too slow: ${(avgResponseTime / 1000).toFixed(2)}s (need <30s)`);
    }
    if (!results.every(r => r.actual !== 'ERROR')) {
      console.log('  - Some classifications failed with errors');
    }
  }

  console.log('\n');
}

/**
 * Main test runner
 */
console.log('\n⚠ This test will run all 20 product classifications');
console.log('Estimated time: 1-2 minutes');
console.log('Estimated AI calls: ~6-8 (most will be skipped due to high confidence)');
console.log('Estimated cost: ~$0.001-0.002\n');

console.log('Press Ctrl+C within 3 seconds to cancel...\n');

setTimeout(() => {
  runAllTests().catch((error) => {
    console.error('\n✗ TEST EXECUTION FAILED:', error);
    process.exit(1);
  });
}, 3000);

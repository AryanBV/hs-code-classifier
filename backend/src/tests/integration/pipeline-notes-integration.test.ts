/**
 * Pipeline Notes Integration Tests - Three Layer Approach
 *
 * Layer 1: Proof Session (5 cases) - GIR 2a MUST fix material vs function
 * Layer 2: Regression (5 cases) - MUST pass 100% (no regressions)
 * Layer 3: Diversity (6 cases) - Target 80%+ (generalization)
 *
 * Usage: npm run test:integration:notes
 */

import dotenv from 'dotenv';
dotenv.config();

import { classify } from '../../classifier';

interface TestCase {
  id: string;
  query: string;
  expectedChapter: string;
  name: string;
  keyDistinction: string;
}

// ============================================
// LAYER 1: Proof Session (5 cases)
// These MUST be fixed by GIR 2a integration
// Material-based products → Function-based classification
// ============================================
const PROOF_SESSION_CASES: TestCase[] = [
  {
    id: 'PS001',
    query: 'rubber oil seals for automobile engines',
    expectedChapter: '87',
    name: 'Rubber seals → Vehicle Part',
    keyDistinction: 'GIR 2a: Rubber material should NOT go to Ch.40'
  },
  {
    id: 'PS002',
    query: 'ceramic brake pads for heavy trucks',
    expectedChapter: '87',
    name: 'Ceramic brake pads → Vehicle Part',
    keyDistinction: 'GIR 2a: Ceramic material should NOT go to Ch.69'
  },
  {
    id: 'PS003',
    query: 'plastic dashboard panel for passenger cars',
    expectedChapter: '87',
    name: 'Plastic dashboard → Vehicle Part',
    keyDistinction: 'GIR 2a: Plastic material should NOT go to Ch.39'
  },
  {
    id: 'PS004',
    query: 'silicone radiator hose for bus coolant system',
    expectedChapter: '87',
    name: 'Silicone hose → Vehicle Part',
    keyDistinction: 'GIR 2a: Silicone material should NOT go to Ch.40'
  },
  {
    id: 'PS005',
    query: 'aluminium alloy wheel rims for passenger cars',
    expectedChapter: '87',
    name: 'Aluminium wheels → Vehicle Part',
    keyDistinction: 'GIR 2a: Aluminium material should NOT go to Ch.76'
  }
];

// ============================================
// LAYER 2: Regression (5 cases)
// MUST pass 100% - these are known-correct cases
// If any fail, integration has broken existing functionality
// ============================================
const REGRESSION_TESTS: TestCase[] = [
  {
    id: 'RT001',
    query: 'paracetamol tablets 500mg blister pack for retail sale',
    expectedChapter: '30',
    name: 'Dosage form → Pharmaceuticals',
    keyDistinction: 'Tablets for retail → Ch.30 (not Ch.29)'
  },
  {
    id: 'RT002',
    query: "men's cotton t-shirt knitted casual wear",
    expectedChapter: '61',
    name: 'Knitted garment → Ch.61',
    keyDistinction: 'Knitted clothing → Ch.61 (not Ch.62)'
  },
  {
    id: 'RT003',
    query: 'instant coffee powder spray dried soluble',
    expectedChapter: '21',
    name: 'Processed coffee → Ch.21',
    keyDistinction: 'Instant/soluble coffee → Ch.21 (not Ch.09)'
  },
  {
    id: 'RT004',
    query: 'electric motor AC induction 5HP industrial',
    expectedChapter: '85',
    name: 'Electric motor → Ch.85',
    keyDistinction: 'Electric motors → Ch.85'
  },
  {
    id: 'RT005',
    query: 'black pepper whole Malabar grade dried',
    expectedChapter: '09',
    name: 'Whole spice → Ch.09',
    keyDistinction: 'Whole dried spices → Ch.09'
  }
];

// ============================================
// LAYER 3: Diversity (6 cases)
// Target 80%+ (5/6) - tests generalization
// ============================================
const DIVERSITY_TESTS: TestCase[] = [
  {
    id: 'DT001',
    query: 'polyester filament yarn continuous single',
    expectedChapter: '54',
    name: 'Filament yarn → Ch.54',
    keyDistinction: 'Continuous filament → Ch.54 (not Ch.55 staple)'
  },
  {
    id: 'DT002',
    query: 'polyester staple fiber short cut for spinning',
    expectedChapter: '55',
    name: 'Staple fiber → Ch.55',
    keyDistinction: 'Short cut staple → Ch.55 (not Ch.54 filament)'
  },
  {
    id: 'DT003',
    query: 'mink fur coat full length ladies',
    expectedChapter: '43',
    name: 'Furskin article → Ch.43',
    keyDistinction: 'Furskin (not textile) → Ch.43'
  },
  {
    id: 'DT004',
    query: 'paracetamol powder bulk API pharmaceutical grade',
    expectedChapter: '29',
    name: 'Bulk API → Ch.29',
    keyDistinction: 'Bulk chemical (not dosed) → Ch.29'
  },
  {
    id: 'DT005',
    query: 'genuine leather jacket brown men',
    expectedChapter: '42',
    name: 'Leather article → Ch.42',
    keyDistinction: 'Leather (not textile) → Ch.42'
  },
  {
    id: 'DT006',
    query: 'truck tyre 315/80R22.5 radial new',
    expectedChapter: '40',
    name: 'Vehicle tyre → Ch.40',
    keyDistinction: 'Tyres have specific heading in Ch.40 (exception to GIR 2a)'
  }
];

interface TestResult extends TestCase {
  actualChapter: string;
  passed: boolean;
  hsCode?: string;
  reasoning?: string;
  error?: string;
  responseTimeMs: number;
}

async function runTest(test: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await classify(test.query, { skipSpecificityCheck: true });
    const duration = Date.now() - start;

    if (result.responseType === 'question') {
      return {
        ...test,
        actualChapter: '',
        passed: false,
        responseTimeMs: duration,
        error: 'Asked question instead of classifying'
      };
    }

    const actualChapter = (result.hsCode || '').replace(/\./g, '').substring(0, 2);
    const passed = actualChapter === test.expectedChapter;

    return {
      ...test,
      actualChapter,
      passed,
      hsCode: result.hsCode,
      reasoning: result.reasoning,
      responseTimeMs: duration
    };
  } catch (error) {
    return {
      ...test,
      actualChapter: '',
      passed: false,
      responseTimeMs: Date.now() - start,
      error: String(error)
    };
  }
}

interface LayerResult {
  name: string;
  passed: number;
  total: number;
  accuracy: number;
  targetPercent: number;
  targetMet: boolean;
  results: TestResult[];
}

async function runLayer(
  name: string,
  tests: TestCase[],
  targetPercent: number
): Promise<LayerResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${name}`);
  console.log(`Target: ${targetPercent}%`);
  console.log(`${'='.repeat(50)}\n`);

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);

    const status = result.passed ? '\u2705' : '\u274C';
    console.log(`${status} ${test.id}: ${test.name}`);
    console.log(`   Query: "${test.query.substring(0, 50)}..."`);
    console.log(`   Expected: Ch.${test.expectedChapter}, Got: Ch.${result.actualChapter || 'ERR'}`);

    if (!result.passed) {
      console.log(`   Key: ${test.keyDistinction}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    console.log(`   Time: ${result.responseTimeMs}ms`);
    console.log('');

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  const passed = results.filter(r => r.passed).length;
  const accuracy = (passed / tests.length) * 100;
  const targetMet = accuracy >= targetPercent;

  console.log(`${'─'.repeat(50)}`);
  console.log(`${name} RESULT: ${passed}/${tests.length} (${accuracy.toFixed(0)}%)`);
  console.log(`Target ${targetPercent}%: ${targetMet ? '\u2705 MET' : '\u274C NOT MET'}`);
  console.log(`${'─'.repeat(50)}`);

  return { name, passed, total: tests.length, accuracy, targetPercent, targetMet, results };
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE NOTES INTEGRATION TESTS');
  console.log('='.repeat(60));
  console.log('Testing that chapter notes + GIRs are');
  console.log('properly integrated into classification pipeline');
  console.log('='.repeat(60));
  console.log(`Start time: ${new Date().toISOString()}`);

  const layer1 = await runLayer('LAYER 1: Proof Session (GIR 2a)', PROOF_SESSION_CASES, 100);
  const layer2 = await runLayer('LAYER 2: Regression (Must Pass)', REGRESSION_TESTS, 100);
  const layer3 = await runLayer('LAYER 3: Diversity', DIVERSITY_TESTS, 80);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('INTEGRATION TEST SUMMARY');
  console.log('='.repeat(60));

  const l1Icon = layer1.targetMet ? '\u2705' : '\u274C';
  const l2Icon = layer2.targetMet ? '\u2705' : '\u274C';
  const l3Icon = layer3.targetMet ? '\u2705' : '\u274C';

  console.log(`Layer 1 (Proof Session): ${layer1.accuracy.toFixed(0)}% (${layer1.passed}/${layer1.total}) ${l1Icon}`);
  console.log(`Layer 2 (Regression):    ${layer2.accuracy.toFixed(0)}% (${layer2.passed}/${layer2.total}) ${l2Icon}`);
  console.log(`Layer 3 (Diversity):     ${layer3.accuracy.toFixed(0)}% (${layer3.passed}/${layer3.total}) ${l3Icon}`);

  const allMet = layer1.targetMet && layer2.targetMet && layer3.targetMet;
  const totalPassed = layer1.passed + layer2.passed + layer3.passed;
  const totalTests = layer1.total + layer2.total + layer3.total;

  console.log(`\nOVERALL: ${totalPassed}/${totalTests} (${((totalPassed/totalTests)*100).toFixed(0)}%)`);

  console.log('\n' + '─'.repeat(60));
  if (allMet) {
    console.log('\u2705 ALL TARGETS MET - Integration Successful!');
    console.log('Proceed to run baseline comparison test.');
  } else {
    console.log('\u274C TARGETS NOT MET - Review failures above');

    if (!layer2.targetMet) {
      console.log('\n\u26A0\uFE0F CRITICAL: Layer 2 (Regression) failures detected!');
      console.log('   These indicate the integration BROKE existing functionality.');
      console.log('   DO NOT proceed until Layer 2 is 100%.');
      layer2.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.id}: Expected Ch.${r.expectedChapter}, Got Ch.${r.actualChapter}`);
      });
    }

    if (!layer1.targetMet) {
      console.log('\n\u26A0\uFE0F Layer 1 (Proof Session) failures:');
      console.log('   GIR 2a may not be working correctly.');
      layer1.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.id}: Expected Ch.${r.expectedChapter}, Got Ch.${r.actualChapter}`);
        console.log(`     Key: ${r.keyDistinction}`);
      });
    }

    if (!layer3.targetMet) {
      console.log('\n\u26A0\uFE0F Layer 3 (Diversity) failures:');
      console.log('   Some edge cases may need attention.');
      layer3.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.id}: Expected Ch.${r.expectedChapter}, Got Ch.${r.actualChapter}`);
      });
    }
  }
  console.log('='.repeat(60) + '\n');

  process.exit(allMet ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

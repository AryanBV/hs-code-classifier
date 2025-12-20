/**
 * Question Enforcement Integration Test
 *
 * Tests that the question enforcement system correctly:
 * 1. Identifies mandatory dimensions for different product types
 * 2. Tracks coverage through conversation
 * 3. Prevents classification when mandatory dimensions are missing
 * 4. Generates fallback questions for uncovered dimensions
 *
 * Run with: npx ts-node scripts/test-question-enforcement.ts
 */

import {
  CRITICAL_DIMENSIONS,
  getRelevantDimensions,
  isDimensionCoveredInDescription,
  extractChaptersFromCodes,
} from '../src/types/critical-dimensions.types';

import {
  initializeCoverage,
  updateCoverageFromAnswers,
  validateCoverage,
  generateFallbackQuestions,
  logCoverageState,
} from '../src/services/question-tracker.service';

// ========================================
// Test Cases
// ========================================

interface TestCase {
  name: string;
  productDescription: string;
  candidateCodes: string[];
  expectedMandatoryDimensions: string[];
  expectedCoveredInDescription: string[];
}

const TEST_CASES: TestCase[] = [
  // ========== Agricultural Products ==========
  {
    name: 'Coffee (ambiguous)',
    productDescription: 'coffee beans',
    candidateCodes: ['0901.11.10', '0901.11.20', '0901.12.10', '0901.21.10'],
    expectedMandatoryDimensions: ['species_variety', 'processing_level', 'form_state'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Coffee (partially specified)',
    productDescription: 'roasted arabica coffee beans',
    candidateCodes: ['0901.21.10', '0901.21.20'],
    expectedMandatoryDimensions: ['species_variety', 'processing_level', 'form_state'],
    expectedCoveredInDescription: ['species_variety', 'processing_level'],
  },
  {
    name: 'Tea (ambiguous)',
    productDescription: 'tea leaves',
    candidateCodes: ['0902.10.10', '0902.20.10', '0902.30.10'],
    expectedMandatoryDimensions: ['species_variety', 'form_state', 'processing_level'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Rice (ambiguous)',
    productDescription: 'rice',
    candidateCodes: ['1006.10.10', '1006.20.10', '1006.30.10'],
    expectedMandatoryDimensions: ['species_variety', 'form_state', 'processing_level'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Rice (specified)',
    productDescription: 'basmati rice, milled',
    candidateCodes: ['1006.30.10', '1006.30.20'],
    expectedMandatoryDimensions: ['species_variety', 'form_state', 'processing_level'],
    expectedCoveredInDescription: ['species_variety', 'form_state'],
  },
  {
    name: 'Mango (ambiguous)',
    productDescription: 'mango',
    candidateCodes: ['0804.50.10', '0804.50.20', '0813.40.00'],
    expectedMandatoryDimensions: ['form_state'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Mango (specified)',
    productDescription: 'fresh alphonso mangoes',
    candidateCodes: ['0804.50.10', '0804.50.20'],
    expectedMandatoryDimensions: ['form_state'],
    expectedCoveredInDescription: ['form_state'],
  },

  // ========== Textiles ==========
  {
    name: 'Shirt (ambiguous)',
    productDescription: 'shirt',
    candidateCodes: ['6105.10.00', '6105.20.00', '6205.20.00'],
    expectedMandatoryDimensions: ['material'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Shirt (specified)',
    productDescription: '100% cotton mens shirt',
    candidateCodes: ['6105.10.00', '6205.20.00'],
    expectedMandatoryDimensions: ['material'],
    expectedCoveredInDescription: ['material'],
  },
  {
    name: 'Fabric (ambiguous)',
    productDescription: 'woven fabric',
    candidateCodes: ['5208.11.00', '5209.11.00', '5407.10.00'],
    expectedMandatoryDimensions: ['material'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Shoes (ambiguous)',
    productDescription: 'shoes',
    candidateCodes: ['6403.19.00', '6404.11.00', '6402.19.00'],
    expectedMandatoryDimensions: ['material'],
    expectedCoveredInDescription: [],
  },

  // ========== Machinery ==========
  {
    name: 'Pump (ambiguous)',
    productDescription: 'pump',
    candidateCodes: ['8413.30.00', '8413.60.00', '8413.70.00'],
    expectedMandatoryDimensions: ['product_type', 'end_use'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Pump (specified)',
    productDescription: 'centrifugal water pump for agricultural use',
    candidateCodes: ['8413.70.10', '8413.70.90'],
    expectedMandatoryDimensions: ['product_type', 'end_use'],
    expectedCoveredInDescription: ['product_type', 'end_use'],
  },
  {
    name: 'Motor (ambiguous)',
    productDescription: 'electric motor',
    candidateCodes: ['8501.10.00', '8501.31.00', '8501.40.00'],
    expectedMandatoryDimensions: ['product_type', 'end_use'],
    expectedCoveredInDescription: ['product_type'],
  },

  // ========== Oils ==========
  {
    name: 'Oil (ambiguous)',
    productDescription: 'vegetable oil',
    candidateCodes: ['1507.10.00', '1508.10.00', '1509.10.00'],
    expectedMandatoryDimensions: ['processing_level'],
    expectedCoveredInDescription: [],
  },
  {
    name: 'Oil (specified)',
    productDescription: 'refined sunflower oil for cooking',
    candidateCodes: ['1512.19.00', '1512.19.10'],
    expectedMandatoryDimensions: ['processing_level'],
    expectedCoveredInDescription: ['processing_level'],
  },
];

// ========================================
// Test Runner
// ========================================

function runTests(): void {
  console.log('='.repeat(60));
  console.log('QUESTION ENFORCEMENT INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\n📦 Test: ${testCase.name}`);
    console.log(`   Product: "${testCase.productDescription}"`);
    console.log(`   Codes: ${testCase.candidateCodes.slice(0, 3).join(', ')}...`);

    try {
      // Initialize coverage
      const coverage = initializeCoverage(
        'test-' + testCase.name.toLowerCase().replace(/\s+/g, '-'),
        testCase.productDescription,
        testCase.candidateCodes
      );

      // Check dimensions detected
      const detectedDimensions = coverage.dimensions.map(d => d.dimension);
      const mandatoryDetected = coverage.dimensions
        .filter(d => d.isMandatory)
        .map(d => d.dimension);

      // Check coverage status
      const coveredInDesc = coverage.dimensions
        .filter(d => d.status === 'covered_implicit')
        .map(d => d.dimension);

      // Validate
      const validation = validateCoverage(coverage, false);

      // Check expected mandatory dimensions
      let allExpectedFound = true;
      for (const expected of testCase.expectedMandatoryDimensions) {
        if (!mandatoryDetected.includes(expected)) {
          console.log(`   ❌ Missing expected mandatory: ${expected}`);
          allExpectedFound = false;
        }
      }

      // Check expected covered in description
      let allCoveredFound = true;
      for (const expected of testCase.expectedCoveredInDescription) {
        if (!coveredInDesc.includes(expected)) {
          console.log(`   ❌ Expected ${expected} to be covered in description`);
          allCoveredFound = false;
        }
      }

      // Check if classification should be blocked when mandatory missing
      const expectedBlocked = testCase.expectedMandatoryDimensions.some(
        dim => !testCase.expectedCoveredInDescription.includes(dim)
      );

      if (expectedBlocked && validation.isValid) {
        console.log(`   ❌ Expected classification to be blocked but it was allowed`);
        failed++;
      } else if (!expectedBlocked && !validation.isValid) {
        console.log(`   ❌ Expected classification to be allowed but it was blocked`);
        failed++;
      } else if (allExpectedFound && allCoveredFound) {
        console.log(`   ✅ PASSED`);
        console.log(`      Mandatory: [${mandatoryDetected.join(', ')}]`);
        console.log(`      Covered: [${coveredInDesc.join(', ')}]`);
        console.log(`      Classification blocked: ${!validation.isValid}`);
        passed++;
      } else {
        console.log(`   ❌ FAILED - dimension detection mismatch`);
        console.log(`      Detected mandatory: [${mandatoryDetected.join(', ')}]`);
        console.log(`      Detected covered: [${coveredInDesc.join(', ')}]`);
        failed++;
      }

      // Test fallback question generation
      if (!validation.isValid) {
        const fallbackQuestions = generateFallbackQuestions(coverage, 3);
        console.log(`      Fallback questions: ${fallbackQuestions.length}`);
        for (const q of fallbackQuestions) {
          console.log(`        - ${q.text}`);
        }
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${TEST_CASES.length}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

// ========================================
// Answer Flow Test
// ========================================

function testAnswerFlow(): void {
  console.log('\n' + '='.repeat(60));
  console.log('ANSWER FLOW TEST');
  console.log('='.repeat(60));

  const productDescription = 'coffee beans';
  const candidateCodes = ['0901.11.10', '0901.11.20', '0901.12.10', '0901.21.10'];

  console.log(`\nProduct: "${productDescription}"`);

  // Initialize
  let coverage = initializeCoverage('test-coffee-flow', productDescription, candidateCodes);
  console.log('\n1. Initial coverage:');
  console.log(`   Mandatory uncovered: ${coverage.dimensions.filter(d => d.isMandatory && d.status === 'uncovered').map(d => d.dimension).join(', ')}`);

  // Simulate first answer (species)
  const answers1 = { 'q1_species': 'Arabica' };
  const questions1 = [{ id: 'q1_species', text: 'What species?', options: ['Arabica', 'Robusta'], allowOther: true, priority: 'required' as const }];
  coverage = updateCoverageFromAnswers(coverage, answers1, questions1);
  console.log('\n2. After species answer:');
  console.log(`   Mandatory uncovered: ${coverage.dimensions.filter(d => d.isMandatory && d.status === 'uncovered').map(d => d.dimension).join(', ')}`);

  // Simulate second answer (processing)
  const answers2 = { 'q2_processing': 'Roasted' };
  const questions2 = [{ id: 'q2_processing', text: 'Processing level?', options: ['Roasted', 'Unroasted'], allowOther: true, priority: 'required' as const }];
  coverage = updateCoverageFromAnswers(coverage, answers2, questions2);
  console.log('\n3. After processing answer:');
  console.log(`   Mandatory uncovered: ${coverage.dimensions.filter(d => d.isMandatory && d.status === 'uncovered').map(d => d.dimension).join(', ')}`);

  // Check if we can classify now
  const validation = validateCoverage(coverage, false);
  console.log(`\n4. Final validation:`);
  console.log(`   Can classify: ${validation.isValid}`);
  console.log(`   Missing: ${validation.missingMandatory.join(', ') || 'none'}`);
}

// ========================================
// Main
// ========================================

console.log('Starting Question Enforcement Tests...\n');
runTests();
testAnswerFlow();
console.log('\nTests completed!');

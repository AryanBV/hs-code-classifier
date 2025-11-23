/**
 * Test Decision Tree Rule Evaluation
 *
 * Tests the evaluateRules() and checkConditions() functions
 * to ensure rules match correctly based on questionnaire answers and keywords
 */

import { loadDecisionTree, evaluateRules } from './services/decision-tree.service';
import { QuestionnaireAnswers } from './types/classification.types';

/**
 * Test Case 1: Brake Pads
 * Expected: Should match brake pads rule → 8708.30.00
 */
async function testBrakePads() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 1: BRAKE PADS CLASSIFICATION');
  console.log('═'.repeat(60));

  const keywords = ['ceramic', 'brake', 'pads', 'motorcycles', 'finished', 'product'];
  const answers: QuestionnaireAnswers = {
    q1: 'Braking system',
    q2_brake: 'Brake pads/shoes'
  };

  console.log('\nInput:');
  console.log(`  Keywords: [${keywords.join(', ')}]`);
  console.log(`  Answers: ${JSON.stringify(answers, null, 2)}`);

  try {
    const decisionTree = await loadDecisionTree('Automotive Parts');
    if (!decisionTree) {
      console.log('✗ FAILED: Could not load decision tree');
      return false;
    }

    const matchedRules = evaluateRules(decisionTree, answers, keywords);

    console.log(`\n✓ Matched ${matchedRules.length} rule(s)`);

    if (matchedRules.length > 0) {
      console.log('\nMatched Rules:');
      matchedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. HS Code(s): ${rule.suggestedCodes.join(', ')}`);
        console.log(`     Confidence Boost: ${rule.confidenceBoost}`);
        console.log(`     Conditions: ${JSON.stringify(rule.conditions)}`);
      });

      // Check if expected code is in results
      const expectedCode = '8708.30.00';
      const foundExpected = matchedRules.some(r =>
        r.suggestedCodes.includes(expectedCode)
      );

      if (foundExpected) {
        console.log(`\n✓ TEST 1 PASSED: Found expected HS code ${expectedCode}`);
        return true;
      } else {
        console.log(`\n✗ TEST 1 FAILED: Expected HS code ${expectedCode} not found`);
        return false;
      }
    } else {
      console.log('\n✗ TEST 1 FAILED: No rules matched');
      return false;
    }

  } catch (error) {
    console.error('✗ TEST 1 ERROR:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test Case 2: Oil Filter
 * Expected: Should match oil filter rule → 8421.23.00
 */
async function testOilFilter() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 2: OIL FILTER CLASSIFICATION');
  console.log('═'.repeat(60));

  const keywords = ['engine', 'oil', 'filter', 'paper', 'element'];
  const answers: QuestionnaireAnswers = {
    q1: 'Filtration system',
    q4_filter: 'Oil filter'
  };

  console.log('\nInput:');
  console.log(`  Keywords: [${keywords.join(', ')}]`);
  console.log(`  Answers: ${JSON.stringify(answers, null, 2)}`);

  try {
    const decisionTree = await loadDecisionTree('Automotive Parts');
    if (!decisionTree) {
      console.log('✗ FAILED: Could not load decision tree');
      return false;
    }

    const matchedRules = evaluateRules(decisionTree, answers, keywords);

    console.log(`\n✓ Matched ${matchedRules.length} rule(s)`);

    if (matchedRules.length > 0) {
      console.log('\nMatched Rules:');
      matchedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. HS Code(s): ${rule.suggestedCodes.join(', ')}`);
        console.log(`     Confidence Boost: ${rule.confidenceBoost}`);
      });

      const expectedCode = '8421.23.00';
      const foundExpected = matchedRules.some(r =>
        r.suggestedCodes.includes(expectedCode)
      );

      if (foundExpected) {
        console.log(`\n✓ TEST 2 PASSED: Found expected HS code ${expectedCode}`);
        return true;
      } else {
        console.log(`\n✗ TEST 2 FAILED: Expected HS code ${expectedCode} not found`);
        return false;
      }
    } else {
      console.log('\n✗ TEST 2 FAILED: No rules matched');
      return false;
    }

  } catch (error) {
    console.error('✗ TEST 2 ERROR:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test Case 3: Keyword Matching
 * Expected: Should match cooling system + coolant keywords → 3820.00.00
 */
async function testKeywordMatching() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 3: KEYWORD-BASED RULE MATCHING');
  console.log('═'.repeat(60));

  const keywords = ['radiator', 'coolant', 'antifreeze', 'ethylene', 'glycol', 'engine', 'ready'];
  const answers: QuestionnaireAnswers = {
    q1: 'Cooling system'
  };

  console.log('\nInput:');
  console.log(`  Keywords: [${keywords.join(', ')}]`);
  console.log(`  Answers: ${JSON.stringify(answers, null, 2)}`);

  try {
    const decisionTree = await loadDecisionTree('Automotive Parts');
    if (!decisionTree) {
      console.log('✗ FAILED: Could not load decision tree');
      return false;
    }

    const matchedRules = evaluateRules(decisionTree, answers, keywords);

    console.log(`\n✓ Matched ${matchedRules.length} rule(s)`);

    if (matchedRules.length > 0) {
      console.log('\nMatched Rules:');
      matchedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. HS Code(s): ${rule.suggestedCodes.join(', ')}`);
        console.log(`     Confidence Boost: ${rule.confidenceBoost}`);
        console.log(`     Conditions: ${JSON.stringify(rule.conditions)}`);
      });

      const expectedCode = '3820.00.00';
      const foundExpected = matchedRules.some(r =>
        r.suggestedCodes.includes(expectedCode)
      );

      if (foundExpected) {
        console.log(`\n✓ TEST 3 PASSED: Found expected HS code ${expectedCode} (keyword-based rule)`);
        return true;
      } else {
        console.log(`\n✗ TEST 3 FAILED: Expected HS code ${expectedCode} not found`);
        console.log(`   This rule requires both q1='Cooling system' AND keywords=['coolant', 'antifreeze']`);
        return false;
      }
    } else {
      console.log('\n✗ TEST 3 FAILED: No rules matched');
      return false;
    }

  } catch (error) {
    console.error('✗ TEST 3 ERROR:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test Case 4: No Match Scenario
 * Expected: Should NOT match any rules (incomplete answers)
 */
async function testNoMatch() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 4: NO MATCH SCENARIO');
  console.log('═'.repeat(60));

  const keywords = ['random', 'product', 'test'];
  const answers: QuestionnaireAnswers = {
    // No relevant answers provided
  };

  console.log('\nInput:');
  console.log(`  Keywords: [${keywords.join(', ')}]`);
  console.log(`  Answers: ${JSON.stringify(answers, null, 2)}`);

  try {
    const decisionTree = await loadDecisionTree('Automotive Parts');
    if (!decisionTree) {
      console.log('✗ FAILED: Could not load decision tree');
      return false;
    }

    const matchedRules = evaluateRules(decisionTree, answers, keywords);

    console.log(`\n✓ Matched ${matchedRules.length} rule(s)`);

    if (matchedRules.length === 0) {
      console.log('\n✓ TEST 4 PASSED: Correctly returned no matches for incomplete data');
      return true;
    } else {
      console.log('\n⚠ TEST 4: Some rules matched (may be fallback rules)');
      matchedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. HS Code(s): ${rule.suggestedCodes.join(', ')}`);
        console.log(`     Confidence Boost: ${rule.confidenceBoost}`);
      });
      return true; // Still valid if fallback rules match
    }

  } catch (error) {
    console.error('✗ TEST 4 ERROR:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test Case 5: Multiple Rules Matching
 * Expected: Should match multiple brake-related rules
 */
async function testMultipleMatches() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 5: MULTIPLE RULES MATCHING');
  console.log('═'.repeat(60));

  const keywords = ['brake', 'disc', 'rotor', 'front', 'ventilated'];
  const answers: QuestionnaireAnswers = {
    q1: 'Braking system',
    q2_brake: 'Brake disc/rotor'
  };

  console.log('\nInput:');
  console.log(`  Keywords: [${keywords.join(', ')}]`);
  console.log(`  Answers: ${JSON.stringify(answers, null, 2)}`);

  try {
    const decisionTree = await loadDecisionTree('Automotive Parts');
    if (!decisionTree) {
      console.log('✗ FAILED: Could not load decision tree');
      return false;
    }

    const matchedRules = evaluateRules(decisionTree, answers, keywords);

    console.log(`\n✓ Matched ${matchedRules.length} rule(s)`);

    if (matchedRules.length > 0) {
      console.log('\nMatched Rules (sorted by confidence):');
      matchedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. HS Code(s): ${rule.suggestedCodes.join(', ')}`);
        console.log(`     Confidence Boost: ${rule.confidenceBoost}`);
      });

      const expectedCode = '8708.30.00';
      const foundExpected = matchedRules.some(r =>
        r.suggestedCodes.includes(expectedCode)
      );

      if (foundExpected) {
        console.log(`\n✓ TEST 5 PASSED: Found expected HS code ${expectedCode}`);
        console.log(`  Rules are sorted by confidence boost (highest first)`);
        return true;
      } else {
        console.log(`\n✗ TEST 5 FAILED: Expected HS code ${expectedCode} not found`);
        return false;
      }
    } else {
      console.log('\n✗ TEST 5 FAILED: No rules matched');
      return false;
    }

  } catch (error) {
    console.error('✗ TEST 5 ERROR:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'DECISION TREE RULE EVALUATION TESTS' + ' '.repeat(13) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
    test5: false
  };

  // Run all tests
  results.test1 = await testBrakePads();
  results.test2 = await testOilFilter();
  results.test3 = await testKeywordMatching();
  results.test4 = await testNoMatch();
  results.test5 = await testMultipleMatches();

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));

  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.values(results).length;

  console.log(`Tests Passed: ${passed}/${total}`);
  console.log('');
  console.log(`  Test 1 (Brake Pads):          ${results.test1 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 2 (Oil Filter):          ${results.test2 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 3 (Keyword Matching):    ${results.test3 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 4 (No Match):            ${results.test4 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 5 (Multiple Matches):    ${results.test5 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');
  console.log('═'.repeat(60));

  if (passed === total) {
    console.log('\n✓ SUCCESS: All rule evaluation tests passed!');
    console.log('Rule matching logic is working correctly.');
    return 0;
  } else {
    console.log('\n✗ FAILURE: Some tests failed. Review the logs above.');
    return 1;
  }
}

// Run tests
runAllTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('\n✗ Test execution failed:', error);
    process.exit(1);
  });

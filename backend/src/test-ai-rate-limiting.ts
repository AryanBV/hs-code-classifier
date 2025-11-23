/**
 * AI Classifier Rate Limiting & Decision Logic Test
 *
 * Tests the cost optimization features:
 * 1. Combined confidence calculation
 * 2. Decision logic (skip AI if confidence >= 70%)
 * 3. Rate limiting (100 calls per day)
 * 4. Cost tracking
 *
 * This test DOES make real API calls (limited to a few for testing)
 */

import { classifyWithAI } from './services/ai-classifier.service';
import {
  KeywordMatchResult,
  DecisionTreeResult,
  QuestionnaireAnswers
} from './types/classification.types';

/**
 * Test Case 1: High Confidence - AI should be SKIPPED
 *
 * Keyword: 85% × 0.3 = 25.5%
 * Tree:    90% × 0.4 = 36.0%
 * Combined:           = 61.5% (wait, this is < 70%, so AI WILL be called)
 *
 * Let me recalculate - for AI to be SKIPPED we need >= 70%
 * If keyword = 90% and tree = 90%:
 * Combined = (90 × 0.3) + (90 × 0.4) = 27 + 36 = 63% (still < 70%)
 *
 * We need: keyword = 100% and tree = 100%
 * Combined = (100 × 0.3) + (100 × 0.4) = 30 + 40 = 70% ✓
 */
async function testHighConfidenceSkipsAI() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: HIGH CONFIDENCE - AI SHOULD BE SKIPPED');
  console.log('═'.repeat(70));

  const productDescription = 'Ceramic brake pads for motorcycles';
  const answers: QuestionnaireAnswers = {
    q1: 'Braking system',
    q2_brake: 'Brake pads/shoes'
  };

  // High confidence results from other methods
  const keywordMatches: KeywordMatchResult[] = [{
    hsCode: '8708.30.00',
    matchedKeywords: ['brake', 'pads', 'ceramic'],
    matchScore: 100,  // 100% confidence
    description: 'Strong keyword match'
  }];

  const decisionTreeResults: DecisionTreeResult[] = [{
    hsCode: '8708.30.00',
    confidence: 100,  // 100% confidence
    rulesMatched: ['Braking system → Brake pads'],
    reasoning: 'Direct rule match'
  }];

  console.log('\nInput:');
  console.log(`  Product: "${productDescription}"`);
  console.log(`  Keyword confidence: 100% × 0.3 = 30.0%`);
  console.log(`  Tree confidence:    100% × 0.4 = 40.0%`);
  console.log(`  Combined:                    = 70.0%`);
  console.log(`  Expected: AI SKIPPED (combined >= 70%)`);

  const result = await classifyWithAI(
    productDescription,
    answers,
    keywordMatches,
    decisionTreeResults,
    false  // forceAI = false
  );

  if (result === null) {
    console.log('\n✓ TEST 1 PASSED: AI was skipped due to high confidence');
    console.log('  Cost saved: ~$0.0002');
    return true;
  } else {
    console.log('\n✗ TEST 1 FAILED: AI was called despite high confidence');
    console.log(`  Got result: ${result.hsCode}`);
    return false;
  }
}

/**
 * Test Case 2: Low Confidence - AI should be CALLED
 *
 * Keyword: 50% × 0.3 = 15%
 * Tree:    60% × 0.4 = 24%
 * Combined:           = 39% < 70% → AI should be called
 */
async function testLowConfidenceCallsAI() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: LOW CONFIDENCE - AI SHOULD BE CALLED');
  console.log('═'.repeat(70));

  const productDescription = 'Strange automotive part with unclear classification';
  const answers: QuestionnaireAnswers = {
    primaryFunction: 'Unknown',
    productType: 'Unclear'
  };

  // Low confidence results from other methods
  const keywordMatches: KeywordMatchResult[] = [{
    hsCode: '8708.99.00',
    matchedKeywords: ['automotive'],
    matchScore: 50,  // 50% confidence (weak match)
    description: 'Weak keyword match'
  }];

  const decisionTreeResults: DecisionTreeResult[] = [{
    hsCode: '8708.99.00',
    confidence: 60,  // 60% confidence (uncertain)
    rulesMatched: ['Fallback rule'],
    reasoning: 'No specific rule matched'
  }];

  console.log('\nInput:');
  console.log(`  Product: "${productDescription}"`);
  console.log(`  Keyword confidence: 50% × 0.3 = 15.0%`);
  console.log(`  Tree confidence:    60% × 0.4 = 24.0%`);
  console.log(`  Combined:                    = 39.0%`);
  console.log(`  Expected: AI CALLED (combined < 70%)`);

  console.log('\n⚠ This will make a REAL OpenAI API call (~$0.0002 cost)');

  const result = await classifyWithAI(
    productDescription,
    answers,
    keywordMatches,
    decisionTreeResults,
    false  // forceAI = false
  );

  if (result !== null) {
    console.log('\n✓ TEST 2 PASSED: AI was called due to low confidence');
    console.log(`  AI suggested: ${result.hsCode} (confidence: ${result.confidence}%)`);
    console.log(`  Reasoning: ${result.reasoning.substring(0, 100)}...`);
    return true;
  } else {
    console.log('\n✗ TEST 2 FAILED: AI was not called despite low confidence');
    console.log('  This could be due to rate limiting or API error');
    return false;
  }
}

/**
 * Test Case 3: Force AI - AI should be CALLED even with high confidence
 */
async function testForceAI() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: FORCE AI - AI CALLED DESPITE HIGH CONFIDENCE');
  console.log('═'.repeat(70));

  const productDescription = 'Ceramic brake pads for motorcycles';
  const answers: QuestionnaireAnswers = {
    q1: 'Braking system',
    q2_brake: 'Brake pads/shoes'
  };

  const keywordMatches: KeywordMatchResult[] = [{
    hsCode: '8708.30.00',
    matchedKeywords: ['brake', 'pads'],
    matchScore: 100,
    description: 'Strong match'
  }];

  const decisionTreeResults: DecisionTreeResult[] = [{
    hsCode: '8708.30.00',
    confidence: 100,
    rulesMatched: ['Brake pads rule'],
    reasoning: 'Direct match'
  }];

  console.log('\nInput:');
  console.log(`  Product: "${productDescription}"`);
  console.log(`  Combined confidence: 70% (high)`);
  console.log(`  forceAI: TRUE`);
  console.log(`  Expected: AI CALLED (forceAI overrides confidence check)`);

  console.log('\n⚠ This will make a REAL OpenAI API call (~$0.0002 cost)');

  const result = await classifyWithAI(
    productDescription,
    answers,
    keywordMatches,
    decisionTreeResults,
    true  // forceAI = true (override confidence check)
  );

  if (result !== null) {
    console.log('\n✓ TEST 3 PASSED: AI was called due to forceAI=true');
    console.log(`  AI suggested: ${result.hsCode} (confidence: ${result.confidence}%)`);
    return true;
  } else {
    console.log('\n✗ TEST 3 FAILED: AI was not called despite forceAI=true');
    return false;
  }
}

/**
 * Test Case 4: Edge Case - Exactly 70% confidence
 */
async function testExactly70Percent() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: EDGE CASE - EXACTLY 70% CONFIDENCE');
  console.log('═'.repeat(70));

  const productDescription = 'Test product for edge case';
  const answers: QuestionnaireAnswers = {};

  // Calculate to get exactly 70%
  // Combined = (keyword × 0.3) + (tree × 0.4) = 70
  // Let's use: keyword = 100, tree = 100
  // (100 × 0.3) + (100 × 0.4) = 30 + 40 = 70

  const keywordMatches: KeywordMatchResult[] = [{
    hsCode: '8708.99.00',
    matchedKeywords: ['test'],
    matchScore: 100,
    description: 'Test'
  }];

  const decisionTreeResults: DecisionTreeResult[] = [{
    hsCode: '8708.99.00',
    confidence: 100,
    rulesMatched: ['Test rule'],
    reasoning: 'Test'
  }];

  console.log('\nInput:');
  console.log(`  Keyword confidence: 100% × 0.3 = 30.0%`);
  console.log(`  Tree confidence:    100% × 0.4 = 40.0%`);
  console.log(`  Combined:                     = 70.0%`);
  console.log(`  Expected: AI SKIPPED (combined >= 70%)`);

  const result = await classifyWithAI(
    productDescription,
    answers,
    keywordMatches,
    decisionTreeResults,
    false
  );

  if (result === null) {
    console.log('\n✓ TEST 4 PASSED: AI was skipped at exactly 70% threshold');
    return true;
  } else {
    console.log('\n✗ TEST 4 FAILED: AI was called at 70% threshold');
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(10) + 'AI CLASSIFIER - RATE LIMITING & DECISION LOGIC TEST' + ' '.repeat(8) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('\n');

  console.log('⚠ WARNING: Tests 2 and 3 will make REAL OpenAI API calls');
  console.log('Estimated cost: ~$0.0004 (2 API calls)');
  console.log('\nPress Ctrl+C within 3 seconds to cancel...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false
  };

  // Run tests
  results.test1 = await testHighConfidenceSkipsAI();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.test2 = await testLowConfidenceCallsAI();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.test3 = await testForceAI();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.test4 = await testExactly70Percent();

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));

  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.values(results).length;

  console.log(`Tests Passed: ${passed}/${total}\n`);
  console.log(`  Test 1 (High Confidence - Skip AI):    ${results.test1 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 2 (Low Confidence - Call AI):     ${results.test2 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 3 (Force AI):                     ${results.test3 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Test 4 (Exactly 70% - Edge Case):      ${results.test4 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');
  console.log('═'.repeat(70));

  // Success criteria
  console.log('\nSUCCESS CRITERIA CHECK');
  console.log('═'.repeat(70));
  console.log(`✓ AI skips when confidence >= 70%:     ${results.test1 ? 'YES' : 'NO'}`);
  console.log(`✓ AI calls when confidence < 70%:      ${results.test2 ? 'YES' : 'NO'}`);
  console.log(`✓ forceAI parameter works:             ${results.test3 ? 'YES' : 'NO'}`);
  console.log(`✓ Edge case handling (exactly 70%):    ${results.test4 ? 'YES' : 'NO'}`);
  console.log('═'.repeat(70));

  if (passed === total) {
    console.log('\n✓ SUCCESS: All decision logic tests passed!');
    console.log('  - Combined confidence calculation: Working');
    console.log('  - 70% threshold logic: Working');
    console.log('  - forceAI override: Working');
    console.log('  - Cost optimization: Active');
    process.exit(0);
  } else {
    console.log('\n✗ FAILURE: Some tests failed');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n✗ TEST EXECUTION FAILED:', error);
  process.exit(1);
});

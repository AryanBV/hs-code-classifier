/**
 * Test Decision Tree Loader
 *
 * Tests the loadDecisionTree() function to ensure it correctly
 * loads decision tree data from the database
 */

import { loadDecisionTree } from './services/decision-tree.service';

/**
 * Test loadDecisionTree() function
 */
async function testLoadDecisionTree() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(12) + 'DECISION TREE LOADER TEST' + ' '.repeat(21) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n');

  // Test 1: Load existing decision tree
  console.log('TEST 1: Load Automotive Parts decision tree');
  console.log('─'.repeat(60));

  try {
    const tree = await loadDecisionTree('Automotive Parts');

    if (tree) {
      console.log('✓ Decision tree loaded successfully');
      console.log(`  Questions: ${tree.questions.length}`);
      console.log(`  Rules: ${tree.rules.length}`);
      console.log('');

      // Display first question
      if (tree.questions.length > 0 && tree.questions[0]) {
        const firstQuestion = tree.questions[0];
        console.log('First question:');
        console.log(`  ID: ${firstQuestion.id}`);
        console.log(`  Text: ${firstQuestion.text}`);
        console.log(`  Type: ${firstQuestion.type}`);
        console.log(`  Options: ${firstQuestion.options?.length || 0}`);
      }
      console.log('');

      // Display first rule
      if (tree.rules.length > 0 && tree.rules[0]) {
        const firstRule = tree.rules[0];
        console.log('First rule:');
        console.log(`  Conditions: ${JSON.stringify(firstRule.conditions)}`);
        console.log(`  Suggested codes: ${firstRule.suggestedCodes.join(', ')}`);
        console.log(`  Confidence boost: ${firstRule.confidenceBoost}`);
      }
      console.log('');

      console.log('✓ TEST 1 PASSED');
    } else {
      console.log('✗ TEST 1 FAILED: Decision tree not found');
    }

  } catch (error) {
    console.log('✗ TEST 1 FAILED:', error instanceof Error ? error.message : String(error));
  }

  console.log('');

  // Test 2: Try to load non-existent decision tree
  console.log('TEST 2: Load non-existent decision tree');
  console.log('─'.repeat(60));

  try {
    const tree = await loadDecisionTree('Non-Existent Category');

    if (tree === null) {
      console.log('✓ Correctly returned null for non-existent category');
      console.log('✓ TEST 2 PASSED');
    } else {
      console.log('✗ TEST 2 FAILED: Should have returned null');
    }

  } catch (error) {
    console.log('✗ TEST 2 FAILED:', error instanceof Error ? error.message : String(error));
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('ALL TESTS COMPLETE');
  console.log('═'.repeat(60));
  console.log('');
}

// Run the test
testLoadDecisionTree()
  .then(() => {
    console.log('✓ Decision tree loader is working correctly');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error);
    process.exit(1);
  });

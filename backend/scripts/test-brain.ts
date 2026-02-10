// backend/scripts/test-brain.ts
//
// Brain diagnostic test (M3: ARY-27).
// Validates Brain + Router produce correct routing decisions on 10 test cases.
// Run: cd backend && npx tsx scripts/test-brain.ts

// CRITICAL: dotenv must load BEFORE classifier imports (OpenAI client reads env at module level)
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface TestCase {
  query: string;
  expectedDecision: 'classify' | 'ask_targeted' | 'disambiguate' | 'reject';
  expectedAction: 'classify' | 'ask' | 'reject';
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    query: 'ceramic brake pads for heavy trucks',
    expectedDecision: 'classify',
    expectedAction: 'classify',
    description: 'Vehicle part with material+form+use',
  },
  {
    query: "men's cotton t-shirt knitted",
    expectedDecision: 'classify',
    expectedAction: 'classify',
    description: 'Textile with all attributes specified',
  },
  {
    query: 'basmati rice',
    expectedDecision: 'classify',
    expectedAction: 'classify',
    description: 'Unambiguous single product',
  },
  {
    query: 'laptop',
    expectedDecision: 'classify',
    expectedAction: 'classify',
    description: 'Unambiguous single word',
  },
  {
    query: 'stainless steel hex bolts M8x50mm for automotive',
    expectedDecision: 'classify',
    expectedAction: 'classify',
    description: 'Fully specified industrial product',
  },
  {
    query: 'coffee',
    expectedDecision: 'ask_targeted',
    expectedAction: 'ask',
    description: 'Ambiguous processing state (raw vs instant)',
  },
  {
    query: 'gloves',
    expectedDecision: 'ask_targeted',
    expectedAction: 'ask',
    description: 'Multiple possible materials/chapters',
  },
  {
    query: 'jacket',
    expectedDecision: 'disambiguate',
    expectedAction: 'ask',
    description: 'Confusing pair: leather vs knitted vs woven',
  },
  {
    query: 'asdfghjkl',
    expectedDecision: 'reject',
    expectedAction: 'reject',
    description: 'Gibberish input',
  },
  {
    query: 'best price please contact',
    expectedDecision: 'reject',
    expectedAction: 'reject',
    description: 'Not a product description',
  },
];

async function runTests(): Promise<void> {
  // Dynamic imports AFTER dotenv has loaded
  const { analyzeBrain } = await import('../src/classifier/brain');
  const { route } = await import('../src/classifier/router');

  console.log('='.repeat(60));
  console.log('Brain Diagnostic Test (10 cases)');
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;
  const failures: string[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i]!;
    console.log(`[${i + 1}/10] "${tc.query}" — ${tc.description}`);

    try {
      const brainOutput = await analyzeBrain(tc.query);
      const routeDecision = route(brainOutput, tc.query);

      const actionMatch = routeDecision.action === tc.expectedAction;
      const decisionMatch = brainOutput.decision === tc.expectedDecision;

      if (actionMatch) {
        console.log(`  PASS: decision=${brainOutput.decision}, action=${routeDecision.action}, confidence=${brainOutput.confidence}`);
        passed++;

        if (!decisionMatch) {
          console.log(`  INFO: decision mismatch (expected ${tc.expectedDecision}, got ${brainOutput.decision}) but action is correct`);
        }
      } else {
        console.log(`  FAIL: expected action=${tc.expectedAction}, got action=${routeDecision.action}`);
        console.log(`        brain decision=${brainOutput.decision} (expected ${tc.expectedDecision})`);
        console.log(`        reasoning: ${brainOutput.reasoning}`);
        if (brainOutput.question?.text) {
          console.log(`        question: ${brainOutput.question.text}`);
        }
        console.log(`        suggested_chapters: [${brainOutput.suggested_chapters.join(', ')}]`);
        failures.push(`"${tc.query}": expected ${tc.expectedAction}, got ${routeDecision.action} (${brainOutput.decision})`);
      }
    } catch (error) {
      console.log(`  ERROR: ${error instanceof Error ? error.message : error}`);
      failures.push(`"${tc.query}": ERROR`);
    }

    console.log('');

    // Rate limiting between API calls
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('='.repeat(60));
  console.log(`RESULTS: ${passed}/10 passed (threshold: 8/10)`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    console.log('\nITERATION STRATEGY:');
    console.log('1. Over-classifying (ask->classify): Strengthen "ASK if" section in brain-prompt.ts');
    console.log('2. Over-asking (classify->ask): Strengthen "CLASSIFY if" section, add unambiguous examples');
    console.log('3. Wrong decision type (ask_targeted vs disambiguate): Clarify boundary in prompt');
    console.log('4. Reject boundary wrong: Clarify reject = non-products/gibberish only');
  }

  if (passed < 8) {
    console.log('\n*** BELOW THRESHOLD (8/10). Iterate on Brain prompt before proceeding. ***');
    process.exit(1);
  } else {
    console.log('\n*** PASSED. Brain is ready for pipeline wiring (ARY-28). ***');
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

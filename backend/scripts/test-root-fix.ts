/**
 * ROOT CAUSE FIX: Test Script
 *
 * Verifies that scoped semantic search correctly finds the best heading
 * when functional override is active.
 *
 * Run with: npx ts-node scripts/test-root-fix.ts
 */

import { getBestHeadingInChapter, getScopedSemanticCandidates } from '../src/services/multi-candidate-search.service';
import { checkFunctionalOverrides } from '../src/services/chapter-predictor.service';

async function testRootCauseFix() {
  console.log('='.repeat(80));
  console.log('ROOT CAUSE FIX: Testing Scoped Semantic Search');
  console.log('='.repeat(80));
  console.log();

  const testCases = [
    {
      query: 'brake pads for cars',
      expectedChapter: '87',
      expectedHeading: '8708', // Parts and accessories of vehicles
      description: 'Should find 8708 (vehicle parts), NOT 8701 (tractors)'
    },
    {
      query: 'ceramic brake pads',
      expectedChapter: '87',
      expectedHeading: '8708',
      description: 'Should find 8708 (vehicle parts), NOT 69xx (ceramics)'
    },
    {
      query: 'automotive brake disc',
      expectedChapter: '87',
      expectedHeading: '8708',
      description: 'Should find 8708 (vehicle parts)'
    },
    {
      query: 'car shock absorber',
      expectedChapter: '87',
      expectedHeading: '8708',
      description: 'Should find 8708 (suspension parts)'
    },
    {
      query: 'plastic toys for children',
      expectedChapter: '95',
      expectedHeading: '9503',
      description: 'Should find 9503 (toys), NOT 39xx (plastics)'
    },
    {
      query: 'wooden furniture',
      expectedChapter: '94',
      expectedHeading: '9403',
      description: 'Should find 9403 (furniture), NOT 44xx (wood)'
    },
    {
      query: 'stainless steel vacuum flask',
      expectedChapter: '96',
      expectedHeading: '9617',
      description: 'Should find 9617 (vacuum flasks)'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log('-'.repeat(60));
    console.log(`Test: "${test.query}"`);
    console.log(`Expected: Ch.${test.expectedChapter}, Heading ${test.expectedHeading}`);
    console.log(`Description: ${test.description}`);
    console.log();

    // Step 1: Check functional override
    const override = checkFunctionalOverrides(test.query);
    if (!override) {
      console.log('  ❌ FAILED: No functional override detected');
      failed++;
      continue;
    }

    if (override.forceChapter !== test.expectedChapter) {
      console.log(`  ❌ FAILED: Wrong chapter. Got ${override.forceChapter}, expected ${test.expectedChapter}`);
      failed++;
      continue;
    }
    console.log(`  ✓ Functional override: Ch.${override.forceChapter} (${override.reason})`);

    // Step 2: Get best heading using scoped semantic search
    const bestHeading = await getBestHeadingInChapter(test.query, test.expectedChapter);

    if (!bestHeading) {
      console.log('  ❌ FAILED: Could not find best heading');
      failed++;
      continue;
    }

    const gotHeading = bestHeading.code.substring(0, 4);
    if (gotHeading === test.expectedHeading) {
      console.log(`  ✓ Best heading: ${bestHeading.code} (score: ${bestHeading.score.toFixed(1)})`);
      console.log(`    ${bestHeading.description.substring(0, 60)}...`);
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log(`  ❌ FAILED: Wrong heading. Got ${gotHeading}, expected ${test.expectedHeading}`);
      console.log(`    ${bestHeading.code}: ${bestHeading.description.substring(0, 60)}...`);
      failed++;
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log(`RESULTS: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log('='.repeat(80));

  // Additional test: Show top 5 candidates for "brake pads for cars"
  console.log();
  console.log('DETAILED TEST: Top candidates for "brake pads for cars" in Ch.87');
  console.log('-'.repeat(60));

  const candidates = await getScopedSemanticCandidates('brake pads for cars', '87', 10);
  candidates.forEach((c, i) => {
    console.log(`${i + 1}. ${c.code}: ${c.description?.substring(0, 50)}... (score: ${c.score.toFixed(1)})`);
  });

  // Exit
  process.exit(failed > 0 ? 1 : 0);
}

testRootCauseFix().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});

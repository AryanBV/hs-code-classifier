/**
 * Test Hierarchy Expansion
 *
 * This script tests the hierarchy expansion functionality
 * on failed test cases to see if it improves results.
 */

import { PrismaClient } from '@prisma/client';
import { semanticSearchMulti } from '../src/services/multi-candidate-search.service';
import { expandCandidatesWithChildren } from '../src/services/hierarchy-expansion.service';

const prisma = new PrismaClient();

interface TestCase {
  query: string;
  expected: string;
  description: string;
}

const FAILED_TEST_CASES: TestCase[] = [
  {
    query: "children's plastic toys",
    expected: '9503.00',
    description: 'Toys (Chapter 95) - currently finding wrong chapter'
  },
  {
    query: 'solar panels',
    expected: '8541.40',
    description: 'Photovoltaic cells - currently finding generators'
  }
];

async function testHierarchyExpansion() {
  console.log('🧪 TESTING HIERARCHY EXPANSION');
  console.log('═'.repeat(80));
  console.log();

  for (const testCase of FAILED_TEST_CASES) {
    console.log(`\n📋 Test Case: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expected} (${testCase.description})`);
    console.log('─'.repeat(80));

    // Step 1: Get original semantic search results
    console.log('\n   Step 1: Original Semantic Search (top 20)');
    const originalCandidates = await semanticSearchMulti(testCase.query, 20);

    console.log(`   Found ${originalCandidates.length} candidates`);

    // Check if expected code is in original results
    const originalPosition = originalCandidates.findIndex(c =>
      c.code.startsWith(testCase.expected)
    );

    if (originalPosition >= 0 && originalCandidates[originalPosition]) {
      console.log(`   ✅ Expected code found at position #${originalPosition + 1}`);
      console.log(`      Code: ${originalCandidates[originalPosition].code}`);
      console.log(`      Score: ${originalCandidates[originalPosition].score.toFixed(2)}`);
    } else {
      console.log(`   ❌ Expected code NOT found in top 20`);
    }

    // Show top 5 original candidates
    console.log('\\n   Top 5 original candidates:');
    for (let i = 0; i < Math.min(5, originalCandidates.length); i++) {
      const c = originalCandidates[i];
      if (!c) continue;
      const isExpected = c.code.startsWith(testCase.expected);
      const marker = isExpected ? '✓' : ' ';
      console.log(`   ${marker} #${i + 1}. ${c.code} (${c.score.toFixed(2)}) - ${c.description?.substring(0, 60) || 'No description'}...`);
    }

    // Step 2: Apply hierarchy expansion
    console.log('\\n   Step 2: After Hierarchy Expansion');
    const expandedCandidates = await expandCandidatesWithChildren(originalCandidates);

    console.log(`   Expanded to ${expandedCandidates.length} candidates (+${expandedCandidates.length - originalCandidates.length})`);

    // Check if expected code is in expanded results
    const expandedPosition = expandedCandidates.findIndex(c =>
      c.code.startsWith(testCase.expected)
    );

    if (expandedPosition >= 0 && expandedCandidates[expandedPosition]) {
      console.log(`   ✅ Expected code found at position #${expandedPosition + 1}`);
      console.log(`      Code: ${expandedCandidates[expandedPosition].code}`);
      console.log(`      Score: ${expandedCandidates[expandedPosition].score.toFixed(2)}`);
      console.log(`      Source: ${expandedCandidates[expandedPosition].source}`);

      // Check if this is a new addition from hierarchy
      if (originalPosition < 0) {
        console.log(`      🎉 NEW! Added via hierarchy expansion!`);
      } else if (expandedPosition < originalPosition) {
        console.log(`      📈 Moved up ${originalPosition - expandedPosition} positions`);
      }
    } else {
      console.log(`   ❌ Expected code STILL not found after expansion`);
    }

    // Show top 10 expanded candidates
    console.log('\\n   Top 10 expanded candidates:');
    for (let i = 0; i < Math.min(10, expandedCandidates.length); i++) {
      const c = expandedCandidates[i];
      if (!c) continue;
      const isExpected = c.code.startsWith(testCase.expected);
      const marker = isExpected ? '✓' : ' ';
      const sourceMarker = c.source === 'hierarchy-child' || c.source === 'hierarchy-descendant' ? '[H]' : '';
      console.log(`   ${marker} #${i + 1}. ${c.code} (${c.score.toFixed(2)}) ${sourceMarker} - ${c.description?.substring(0, 50) || 'No description'}...`);
    }

    console.log('\\n' + '═'.repeat(80));
  }

  console.log('\\n✅ Hierarchy expansion testing complete!');
  console.log();
}

// Run the test
testHierarchyExpansion()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

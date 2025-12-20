/**
 * Test Phase 2 Improvements: Enhanced Candidate Ranking
 *
 * Tests keyword-aware scoring, query context parsing, and chapter prediction
 * on specific failed cases from the accuracy test.
 */

import { getTopCandidates } from '../src/services/multi-candidate-search.service';
import { parseQuery, explainQueryAnalysis } from '../src/services/query-parser.service';
import { predictChapters, explainChapterPredictions } from '../src/services/chapter-predictor.service';

interface TestCase {
  query: string;
  expectedCode: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    query: "steel nuts and bolts",
    expectedCode: "7318.15.00",
    description: "Should match BOTH 'nuts' AND 'bolts', not just one"
  },
  {
    query: "diesel engine for trucks",
    expectedCode: "8408.20",
    description: "Should classify the ENGINE, not the truck (context)"
  },
  {
    query: "coffee beans unroasted",
    expectedCode: "0901.11.00",
    description: "Should predict Chapter 09 (coffee/tea/spices)"
  },
  {
    query: "children's plastic toys",
    expectedCode: "9503.00",
    description: "Should predict Chapter 95 (toys)"
  },
  {
    query: "solar panels for electricity generation",
    expectedCode: "8541.40",
    description: "Should classify solar panels, not generators"
  }
];

async function testPhase2Improvements() {
  console.log('🧪 TESTING PHASE 2 IMPROVEMENTS');
  console.log('═'.repeat(80));
  console.log('Testing enhanced ranking with keyword scoring, context parsing, and chapter prediction\n');

  for (const testCase of testCases) {
    console.log('─'.repeat(80));
    console.log(`\n📋 Query: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expectedCode}`);
    console.log(`   Goal: ${testCase.description}\n`);

    // Show query analysis
    const queryAnalysis = parseQuery(testCase.query);
    console.log('🔍 QUERY ANALYSIS:');
    console.log(explainQueryAnalysis(queryAnalysis));

    // Show chapter predictions
    console.log('📚 CHAPTER PREDICTIONS:');
    console.log(explainChapterPredictions(testCase.query));

    // Get candidates with enhanced scoring
    console.log('🎯 TOP 10 CANDIDATES (Enhanced Scoring):');
    const candidates = await getTopCandidates(testCase.query, 10);

    candidates.forEach((candidate, idx) => {
      const isExpected = candidate.code === testCase.expectedCode ||
                        testCase.expectedCode.startsWith(candidate.code) ||
                        candidate.code.startsWith(testCase.expectedCode);

      const marker = isExpected ? ' ⭐ EXPECTED' : '';
      console.log(`   ${idx + 1}. ${candidate.code} (score: ${candidate.score.toFixed(2)})${marker}`);
      console.log(`      ${candidate.description?.substring(0, 80) || 'No description'}...`);
    });

    // Check if expected code is in top 10
    const expectedIndex = candidates.findIndex(c =>
      c.code === testCase.expectedCode ||
      testCase.expectedCode.startsWith(c.code) ||
      c.code.startsWith(testCase.expectedCode)
    );

    if (expectedIndex !== -1) {
      console.log(`\n   ✅ Expected code found at position ${expectedIndex + 1}`);
    } else {
      console.log(`\n   ❌ Expected code NOT in top 10`);
    }

    console.log();

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('═'.repeat(80));
  console.log('✅ Phase 2 improvements test completed');
  console.log('\nNext Steps:');
  console.log('  1. If results improved: Run full accuracy test');
  console.log('  2. If still issues: Proceed to Phase 3 (Hierarchy Expansion)');
  console.log('  3. Compare scores to understand which enhancement helped most');
}

testPhase2Improvements()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

import { getTopCandidates } from '../src/services/multi-candidate-search.service';
import * as fs from 'fs';
import * as path from 'path';

interface FailedCase {
  query: string;
  expectedCode: string;
  actualCode: string;
  category: string;
}

const failedCases: FailedCase[] = [
  { query: "cotton t-shirt", expectedCode: "6109.10.00", actualCode: "6102.20.00", category: "Textiles" },
  { query: "steel nuts and bolts", expectedCode: "7318.15.00", actualCode: "7318.16.00", category: "Base Metals" },
  { query: "wooden dining table", expectedCode: "9403.60.00", actualCode: "9403.40.00", category: "Furniture" },
  { query: "apple juice in glass bottles", expectedCode: "2009.79.00", actualCode: "2009.71.00", category: "Food & Beverages" },
  { query: "diesel engine for trucks", expectedCode: "8408.20", actualCode: "8704.23.00", category: "Machinery" },
  { query: "leather shoes for men", expectedCode: "6403.99", actualCode: "6403.20.11", category: "Footwear" },
  { query: "solar panels for electricity generation", expectedCode: "8541.40", actualCode: "8501.72.00", category: "Electronics" },
  { query: "coffee beans unroasted", expectedCode: "0901.11.00", actualCode: "0905.10.00", category: "Agricultural Products" },
  { query: "rubber tires for passenger cars", expectedCode: "4011.10", actualCode: "4011.20.10", category: "Rubber Products" },
  { query: "children's plastic toys", expectedCode: "9503.00", actualCode: "6702.10", category: "Toys" },
  { query: "wrist watch mechanical", expectedCode: "9101.21.00", actualCode: "9102.21.00", category: "Watches" },
  { query: "aircraft engine parts turbine blades", expectedCode: "8411.99", actualCode: "8411.91.00", category: "Aircraft Parts" },
  { query: "medical x-ray machine", expectedCode: "9022.14.00", actualCode: "9022.14.20", category: "Medical Equipment" }
];

async function analyzeFailedCases() {
  console.log('🔍 ANALYZING FAILED CASES - Are Expected Codes in Candidates?\n');
  console.log('═'.repeat(80));

  const summary = {
    totalFailed: failedCases.length,
    expectedInCandidates: 0,
    expectedNotInCandidates: 0,
    veryCloseMatch: 0,
    wrongChapter: 0
  };

  for (const failedCase of failedCases) {
    console.log(`\n📋 Query: "${failedCase.query}"`);
    console.log(`   Expected: ${failedCase.expectedCode}`);
    console.log(`   Got: ${failedCase.actualCode}`);

    // Get candidates
    const candidates = await getTopCandidates(failedCase.query, 50);

    // Find expected code
    const expectedIndex = candidates.findIndex(c => c.code === failedCase.expectedCode);

    if (expectedIndex !== -1) {
      summary.expectedInCandidates++;
      const candidate = candidates[expectedIndex]!;
      console.log(`   ✅ Expected code FOUND at position ${expectedIndex + 1}`);
      console.log(`      Score: ${candidate.score.toFixed(2)}, Match Type: ${candidate.matchType}`);
    } else {
      summary.expectedNotInCandidates++;
      console.log(`   ❌ Expected code NOT in top 50 candidates`);

      // Check if actual code is in candidates
      const actualIndex = candidates.findIndex(c => c.code === failedCase.actualCode);
      if (actualIndex !== -1) {
        const actualCandidate = candidates[actualIndex]!;
        console.log(`   ⚠️  Actual (wrong) code at position ${actualIndex + 1}`);
        console.log(`      Score: ${actualCandidate.score.toFixed(2)}, Match Type: ${actualCandidate.matchType}`);
      }
    }

    // Check if it's a close match (same heading)
    const expectedHeading = failedCase.expectedCode.substring(0, 4);
    const actualHeading = failedCase.actualCode.substring(0, 4);

    if (expectedHeading === actualHeading) {
      summary.veryCloseMatch++;
      console.log(`   📊 Close match: Same heading (${expectedHeading})`);
    }

    // Check if different chapter
    const expectedChapter = failedCase.expectedCode.substring(0, 2);
    const actualChapter = failedCase.actualCode.substring(0, 2);

    if (expectedChapter !== actualChapter) {
      summary.wrongChapter++;
      console.log(`   🚨 WRONG CHAPTER: Expected Ch.${expectedChapter}, Got Ch.${actualChapter}`);
    }

    // Show top 5 candidates
    console.log(`\n   Top 5 candidates:`);
    candidates.slice(0, 5).forEach((c, i) => {
      const marker = c.code === failedCase.expectedCode ? ' ⭐ EXPECTED' :
                     c.code === failedCase.actualCode ? ' ❌ ACTUAL' : '';
      console.log(`   ${i + 1}. ${c.code} (score: ${c.score.toFixed(2)})${marker}`);
    });

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Failed Cases: ${summary.totalFailed}`);
  console.log(`Expected Code IN Candidates: ${summary.expectedInCandidates} (${((summary.expectedInCandidates/summary.totalFailed)*100).toFixed(1)}%)`);
  console.log(`Expected Code NOT in Candidates: ${summary.expectedNotInCandidates} (${((summary.expectedNotInCandidates/summary.totalFailed)*100).toFixed(1)}%)`);
  console.log(`Very Close Match (same heading): ${summary.veryCloseMatch} (${((summary.veryCloseMatch/summary.totalFailed)*100).toFixed(1)}%)`);
  console.log(`Wrong Chapter: ${summary.wrongChapter} (${((summary.wrongChapter/summary.totalFailed)*100).toFixed(1)}%)`);

  console.log('\n💡 KEY INSIGHTS:');

  if (summary.expectedInCandidates > 0) {
    console.log(`   - ${summary.expectedInCandidates} cases: Expected code IS in candidates - LLM choosing wrong one`);
    console.log(`     → FIX: Improve LLM prompt OR candidate ranking`);
  }

  if (summary.expectedNotInCandidates > 0) {
    console.log(`   - ${summary.expectedNotInCandidates} cases: Expected code NOT in candidates - search quality issue`);
    console.log(`     → FIX: Improve embeddings, keywords, or search algorithm`);
  }

  if (summary.veryCloseMatch > 0) {
    console.log(`   - ${summary.veryCloseMatch} cases: Very close match (same heading, wrong subheading)`);
    console.log(`     → These may need expert human review or better data`);
  }

  if (summary.wrongChapter > 0) {
    console.log(`   - ${summary.wrongChapter} cases: COMPLETELY WRONG CHAPTER`);
    console.log(`     → CRITICAL: Semantic search finding wrong categories`);
  }

  console.log('\n═'.repeat(80));
}

analyzeFailedCases()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });

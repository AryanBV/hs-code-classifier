/**
 * Diagnostic script to trace "instant coffee" classification flow
 */

import { prisma } from '../src/utils/prisma';
import { parseQuery } from '../src/services/query-parser.service';
import {
  checkFunctionalOverrides,
  checkAmbiguousTerms,
  predictChapters
} from '../src/services/chapter-predictor.service';
import { filterHierarchyChildren } from '../src/services/elimination.service';

async function traceInstantCoffee() {
  const query = 'instant coffee';

  console.log('='.repeat(70));
  console.log('DIAGNOSTIC: Tracing "instant coffee" classification flow');
  console.log('='.repeat(70));

  // Step 1: Parse query
  console.log('\n--- STEP 1: Parse Query ---');
  const queryAnalysis = parseQuery(query);
  console.log('Primary subject:', queryAnalysis.primarySubject);
  console.log('Product type modifiers:', queryAnalysis.productTypeModifiers);
  console.log('Modifiers:', queryAnalysis.modifiers);
  console.log('Context:', queryAnalysis.context);

  // Step 2: Check functional override
  console.log('\n--- STEP 2: Check Functional Override ---');
  const functionalOverride = checkFunctionalOverrides(query);
  console.log('Functional override result:', functionalOverride);

  // Step 3: Check ambiguous terms
  console.log('\n--- STEP 3: Check Ambiguous Terms ---');
  const ambiguity = checkAmbiguousTerms(query);
  console.log('Ambiguity result:', ambiguity ? JSON.stringify(ambiguity, null, 2) : 'null (no ambiguity)');

  // Step 4: Get chapter predictions
  console.log('\n--- STEP 4: Chapter Predictions ---');
  const predictions = predictChapters(query);
  console.log('Predictions:', JSON.stringify(predictions, null, 2));

  // Step 5: Get all 4-digit headings (like getAllChapters does)
  console.log('\n--- STEP 5: Get All 4-Digit Headings ---');
  const headings = await prisma.hsCode.findMany({
    where: {
      code: {
        not: { contains: '.' }
      }
    },
    select: {
      code: true,
      description: true,
      isOther: true
    },
    orderBy: { code: 'asc' }
  });
  console.log(`Total 4-digit headings: ${headings.length}`);

  // Check if 2101 is in the list
  const heading2101 = headings.find(h => h.code === '2101');
  console.log('2101 in list:', heading2101 ? 'YES' : 'NO');
  if (heading2101) {
    console.log('  Description:', heading2101.description.substring(0, 80) + '...');
  }

  // Step 6: Filter by keywords/modifiers (simulating filterOptionsByKeywordsSimple)
  console.log('\n--- STEP 6: Simulate Keyword/Modifier Filtering ---');

  // Modifier filtering
  const productTypeModifiers = queryAnalysis.productTypeModifiers;
  console.log('Product type modifiers:', productTypeModifiers);

  // Check if 2101 would be excluded by modifier
  const desc2101 = heading2101?.description.toLowerCase() || '';
  const wantsInstant = productTypeModifiers.some(m =>
    ['instant', 'extract', 'soluble', 'essence', 'concentrate'].includes(m.toLowerCase())
  );
  console.log('User wants instant/extract:', wantsInstant);

  if (wantsInstant) {
    const rawRoastedPatterns = ['not roasted', 'roasted', 'coffee beans', 'raw'];
    const hasRawRoasted = rawRoastedPatterns.some(p => desc2101.includes(p));
    const hasExtract = desc2101.includes('extract') || desc2101.includes('instant') || desc2101.includes('essence');
    console.log('2101 has raw/roasted patterns:', hasRawRoasted);
    console.log('2101 has extract/instant/essence:', hasExtract);
    const shouldExclude2101 = hasRawRoasted && !hasExtract;
    console.log('2101 should be excluded by modifier:', shouldExclude2101);
  }

  // Keyword filtering
  const userKeywords = ['instant', 'coffee'];
  const coffeeRegex = /\bcoffee\b/i;
  const instantRegex = /\binstant\b/i;
  const matchesCoffee = coffeeRegex.test(desc2101);
  const matchesInstant = instantRegex.test(desc2101);
  console.log('2101 matches "coffee":', matchesCoffee);
  console.log('2101 matches "instant":', matchesInstant);
  console.log('2101 survives keyword filtering:', matchesCoffee || matchesInstant);

  // Step 7: Phase 3 Elimination
  console.log('\n--- STEP 7: Phase 3 Elimination Filter ---');
  const testOptions = headings.filter(h => h.code === '2101' || h.code === '0901').map(h => ({
    code: h.code,
    description: h.description,
    isOther: h.isOther || false,
    hasChildren: true
  }));

  console.log('Testing elimination on:', testOptions.map(o => o.code));

  const eliminationResult = filterHierarchyChildren(
    testOptions,
    {
      productTypeModifiers: queryAnalysis.productTypeModifiers,
      modifiers: queryAnalysis.modifiers,
      originalQuery: query
    }
  );

  console.log('Elimination result:');
  console.log('  Filtered children:', eliminationResult.filteredChildren.map(c => c.code));
  console.log('  Eliminated count:', eliminationResult.eliminatedCount);
  console.log('  Applied rules:', eliminationResult.appliedRules);
  console.log('  Auto-select code:', eliminationResult.autoSelectCode);

  // Step 8: Final result
  console.log('\n--- STEP 8: Expected Final Result ---');
  if (eliminationResult.filteredChildren.length > 0) {
    console.log('Should have options:', eliminationResult.filteredChildren.map(c => `${c.code}: ${c.description.substring(0, 40)}...`));
  } else {
    console.log('ERROR: All options filtered out!');
  }

  console.log('\n' + '='.repeat(70));
  console.log('END DIAGNOSTIC');
  console.log('='.repeat(70));

  await prisma.$disconnect();
}

traceInstantCoffee().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});

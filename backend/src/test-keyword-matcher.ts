/**
 * Test script for keyword-matcher.service.ts
 *
 * Tests:
 * 1. Keyword extraction with stopword filtering
 * 2. Full keyword matching against database
 */

import { extractKeywords, keywordMatch } from './services/keyword-matcher.service';

// Test products from your 20-product dataset
const TEST_PRODUCTS = [
  {
    name: 'Ceramic Brake Pads',
    description: 'Ceramic brake pads for motorcycles, finished product',
    expectedKeywords: ['ceramic', 'brake', 'pads', 'motorcycles', 'finished', 'product'],
    expectedHsCode: '8708.30.00'
  },
  {
    name: 'Engine Oil Filter',
    description: 'Engine oil filter paper element',
    expectedKeywords: ['engine', 'oil', 'filter', 'paper', 'element'],
    expectedHsCode: '8421.23.00'
  }
];

/**
 * Test 1: Keyword Extraction
 */
function testKeywordExtraction() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: KEYWORD EXTRACTION');
  console.log('='.repeat(60));

  for (const product of TEST_PRODUCTS) {
    console.log(`\nProduct: ${product.name}`);
    console.log(`Description: "${product.description}"`);

    const extracted = extractKeywords(product.description);

    console.log(`\nExtracted keywords:`);
    console.log(`  Primary: [${extracted.primary.join(', ')}]`);
    console.log(`  Secondary: [${extracted.secondary.join(', ')}]`);
    console.log(`  All (${extracted.filtered.length}): [${extracted.filtered.join(', ')}]`);

    // Validation
    const missingKeywords = product.expectedKeywords.filter(
      kw => !extracted.filtered.includes(kw)
    );

    if (missingKeywords.length === 0) {
      console.log(`✓ PASS: All expected keywords extracted`);
    } else {
      console.log(`✗ FAIL: Missing keywords: [${missingKeywords.join(', ')}]`);
    }

    // Check stopwords are filtered
    const stopwordCheck = ['the', 'a', 'for', 'is'].filter(
      sw => extracted.filtered.includes(sw)
    );

    if (stopwordCheck.length === 0) {
      console.log(`✓ PASS: Stopwords filtered correctly`);
    } else {
      console.log(`✗ FAIL: Stopwords found: [${stopwordCheck.join(', ')}]`);
    }
  }
}

/**
 * Test 2: Full Keyword Matching (Database)
 */
async function testKeywordMatching() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: KEYWORD MATCHING (DATABASE)');
  console.log('='.repeat(60));

  for (const product of TEST_PRODUCTS) {
    console.log(`\nProduct: ${product.name}`);
    console.log(`Description: "${product.description}"`);
    console.log(`Expected HS Code: ${product.expectedHsCode}`);

    try {
      const matches = await keywordMatch(product.description);

      console.log(`\nMatches found: ${matches.length}`);

      if (matches.length > 0) {
        console.log(`\nTop 3 matches:`);
        matches.slice(0, 3).forEach((match, index) => {
          const isExpected = match.hsCode === product.expectedHsCode ? '✓' : ' ';
          console.log(`  ${isExpected} ${index + 1}. ${match.hsCode} (score: ${match.matchScore})`);
          console.log(`     Matched keywords: [${match.matchedKeywords.join(', ')}]`);
          console.log(`     Description: ${match.description.substring(0, 60)}...`);
        });

        // Check if expected HS code is in top 3
        const topCodes = matches.slice(0, 3).map(m => m.hsCode);
        if (topCodes.includes(product.expectedHsCode)) {
          const rank = topCodes.indexOf(product.expectedHsCode) + 1;
          console.log(`\n✓ PASS: Expected HS code found at rank ${rank}`);
        } else {
          console.log(`\n✗ FAIL: Expected HS code not in top 3 matches`);
        }
      } else {
        console.log(`\n✗ FAIL: No matches found`);
      }
    } catch (error) {
      console.error(`\n✗ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'KEYWORD MATCHER SERVICE TESTS' + ' '.repeat(19) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // Test 1: Keyword Extraction (synchronous)
  testKeywordExtraction();

  // Test 2: Keyword Matching (async, requires database)
  await testKeywordMatching();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('Tests completed. Review results above.');
  console.log('Expected accuracy: 60%+ (top-1 match)');
  console.log('Expected performance: < 1 second per classification');
  console.log('='.repeat(60) + '\n');
}

// Run tests
runTests()
  .then(() => {
    console.log('✓ All tests completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test execution failed:', error);
    process.exit(1);
  });

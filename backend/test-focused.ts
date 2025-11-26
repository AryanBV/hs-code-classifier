/**
 * Focused Accuracy Test Suite - Quick validation across major categories
 * Uses direct layeredSearch without confidence-scorer overhead
 */

import { layeredSearch } from './src/services/layered-search.service';

interface TestCase {
  category: string;
  name: string;
  query: string;
  expectedCodes: string[]; // Expected chapter codes
}

const testCases: TestCase[] = [
  // Animal Products
  { category: 'Animal Products', name: 'Live Cattle', query: 'Live beef cattle breeding', expectedCodes: ['01'] },
  { category: 'Animal Products', name: 'Fresh Pork', query: 'Fresh pork meat cuts', expectedCodes: ['01', '02'] },
  { category: 'Animal Products', name: 'Chicken', query: 'Fresh chicken meat', expectedCodes: ['02'] },

  // Fruits & Produce
  { category: 'Fruits', name: 'Fresh Apples', query: 'Fresh red apples export', expectedCodes: ['08'] },
  { category: 'Fruits', name: 'Fresh Mangoes', query: 'Mangoes fresh tropical fruit', expectedCodes: ['08'] },
  { category: 'Fruits', name: 'Fresh Oranges', query: 'Fresh citrus oranges', expectedCodes: ['08'] },

  // Cereals
  { category: 'Cereals', name: 'Wheat', query: 'Wheat grains milling', expectedCodes: ['10'] },
  { category: 'Cereals', name: 'Rice', query: 'Milled rice consumption', expectedCodes: ['10'] },

  // Textiles
  { category: 'Textiles', name: 'Cotton Fabric', query: 'Cotton fabric woven cloth', expectedCodes: ['52'] },
  { category: 'Textiles', name: 'Wool', query: 'Wool textile fabric', expectedCodes: ['51', '52'] },

  // Machinery
  { category: 'Machinery', name: 'Diesel Engine', query: 'Diesel engine motor automotive', expectedCodes: ['84'] },
  { category: 'Machinery', name: 'Pump', query: 'Centrifugal pump mechanical', expectedCodes: ['84'] },

  // Electronics
  { category: 'Electronics', name: 'Mobile Phone', query: 'Mobile phone smartphone electronic', expectedCodes: ['85'] },
  { category: 'Electronics', name: 'Laptop Computer', query: 'Laptop computer electronic device', expectedCodes: ['84', '85'] },

  // Chemicals
  { category: 'Chemicals', name: 'Organic Chemical', query: 'Organic chemical compound', expectedCodes: ['29'] },
  { category: 'Chemicals', name: 'Plastic Resin', query: 'Plastic polymer resin material', expectedCodes: ['39'] },
];

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        FOCUSED ACCURACY TEST - QUICK MULTI-CATEGORY SUITE        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let passedTests = 0;
  let totalTests = testCases.length;
  const categoryResults: Record<string, { passed: number; total: number }> = {};

  for (const testCase of testCases) {
    const { category, name, query, expectedCodes } = testCase;

    if (!categoryResults[category]) {
      categoryResults[category] = { passed: 0, total: 0 };
    }
    categoryResults[category].total++;

    try {
      console.log(`\n[${category}] ${name}`);
      console.log(`Query: "${query}"`);

      const results = await layeredSearch(query, 3);
      const topResult = results.results[0];

      if (!topResult) {
        console.log(`❌ FAILED - No results returned`);
        continue;
      }

      const resultChapter = topResult.hsCode.substring(0, 2);
      const isMatch = expectedCodes.some(code => resultChapter === code || topResult.hsCode.startsWith(code));

      if (isMatch) {
        console.log(`✅ PASSED`);
        console.log(`   Top: ${topResult.hsCode} (${topResult.confidence}% confidence)`);
        passedTests++;
        categoryResults[category].passed++;
      } else {
        console.log(`❌ FAILED`);
        console.log(`   Got: ${topResult.hsCode} (Chapter ${resultChapter})`);
        console.log(`   Expected: Chapter ${expectedCodes.join(' or ')}`);
        console.log(`   Confidence: ${topResult.confidence}%`);
      }
    } catch (error) {
      console.log(`❌ ERROR - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                       RESULTS SUMMARY                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  const sortedCategories = Object.keys(categoryResults).sort();
  for (const category of sortedCategories) {
    const result = categoryResults[category];
    if (!result) continue;
    const { passed, total } = result;
    const percentage = ((passed / total) * 100).toFixed(0);
    const status = passed === total ? '✅' : passed === 0 ? '❌' : '⚠️ ';
    console.log(`${status} ${category.padEnd(20)} ${passed}/${total} (${percentage}%)`);
  }

  console.log('╠════════════════════════════════════════════════════════════════╣');
  const overallPercentage = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`║ OVERALL: ${passedTests}/${totalTests} TESTS PASSED (${overallPercentage}%)${' '.repeat(20)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit();
});

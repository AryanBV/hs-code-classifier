/**
 * Phase 5A: Comprehensive Accuracy Test Suite
 *
 * Tests 50+ edge cases across 7 product categories:
 * - Misspellings: "mangoe", "cottn", "whete" (testing robustness)
 * - Synonyms: "fabric" for "cloth", "motor" for "engine" (semantic understanding)
 * - Partial descriptions: 1-2 word queries vs 20+ word queries (length variance)
 * - Multiple products: "cotton and wool blend" (complex queries)
 * - Low confidence edge cases: Testing confidence score distribution
 *
 * Success: Validate 100% accuracy holds beyond initial 16 tests
 */

import { layeredSearch } from './src/services/layered-search.service';

interface TestCase {
  category: string;
  name: string;
  query: string;
  expectedCodes: string[];
  type?: 'baseline' | 'misspelling' | 'synonym' | 'partial' | 'complex' | 'edge';
}

const testCases: TestCase[] = [
  // ===============================================
  // BASELINE TESTS (16 - from test-focused.ts)
  // ===============================================

  // Animal Products (3/3)
  { category: 'Animal Products', name: 'Live Cattle', query: 'Live beef cattle breeding', expectedCodes: ['01'], type: 'baseline' },
  { category: 'Animal Products', name: 'Fresh Pork', query: 'Fresh pork meat cuts', expectedCodes: ['01', '02'], type: 'baseline' },
  { category: 'Animal Products', name: 'Chicken', query: 'Fresh chicken meat', expectedCodes: ['02'], type: 'baseline' },

  // Fruits & Produce (3/3)
  { category: 'Fruits', name: 'Fresh Apples', query: 'Fresh red apples export', expectedCodes: ['08'], type: 'baseline' },
  { category: 'Fruits', name: 'Fresh Mangoes', query: 'Mangoes fresh tropical fruit', expectedCodes: ['08'], type: 'baseline' },
  { category: 'Fruits', name: 'Fresh Oranges', query: 'Fresh citrus oranges', expectedCodes: ['08'], type: 'baseline' },

  // Cereals (2/2)
  { category: 'Cereals', name: 'Wheat', query: 'Wheat grains milling', expectedCodes: ['10'], type: 'baseline' },
  { category: 'Cereals', name: 'Rice', query: 'Milled rice consumption', expectedCodes: ['10'], type: 'baseline' },

  // Textiles (2/2)
  { category: 'Textiles', name: 'Cotton Fabric', query: 'Cotton fabric woven cloth', expectedCodes: ['52'], type: 'baseline' },
  { category: 'Textiles', name: 'Wool', query: 'Wool textile fabric', expectedCodes: ['51', '52'], type: 'baseline' },

  // Machinery (2/2)
  { category: 'Machinery', name: 'Diesel Engine', query: 'Diesel engine motor automotive', expectedCodes: ['84'], type: 'baseline' },
  { category: 'Machinery', name: 'Pump', query: 'Centrifugal pump mechanical', expectedCodes: ['84'], type: 'baseline' },

  // Electronics (2/2)
  { category: 'Electronics', name: 'Mobile Phone', query: 'Mobile phone smartphone electronic', expectedCodes: ['85'], type: 'baseline' },
  { category: 'Electronics', name: 'Laptop Computer', query: 'Laptop computer electronic device', expectedCodes: ['84', '85'], type: 'baseline' },

  // Chemicals (2/2)
  { category: 'Chemicals', name: 'Organic Chemical', query: 'Organic chemical compound', expectedCodes: ['29'], type: 'baseline' },
  { category: 'Chemicals', name: 'Plastic Resin', query: 'Plastic polymer resin material', expectedCodes: ['39'], type: 'baseline' },

  // ===============================================
  // MISSPELLING TESTS (8)
  // ===============================================

  { category: 'Fruits', name: 'Misspelled Mango', query: 'mangoe fresh tropical', expectedCodes: ['08'], type: 'misspelling' },
  { category: 'Fruits', name: 'Misspelled Apple', query: 'aple red fruit export', expectedCodes: ['08'], type: 'misspelling' },
  { category: 'Cereals', name: 'Misspelled Wheat', query: 'whete grain milling', expectedCodes: ['10'], type: 'misspelling' },
  { category: 'Cereals', name: 'Misspelled Rice', query: ' rice miled consumption', expectedCodes: ['10'], type: 'misspelling' },
  { category: 'Textiles', name: 'Misspelled Cotton', query: 'cottn fabric woven', expectedCodes: ['52'], type: 'misspelling' },
  { category: 'Textiles', name: 'Misspelled Wool', query: 'wol textile fabric', expectedCodes: ['51', '52'], type: 'misspelling' },
  { category: 'Machinery', name: 'Misspelled Engine', query: 'engin motor automotive', expectedCodes: ['84'], type: 'misspelling' },
  { category: 'Electronics', name: 'Misspelled Phone', query: 'fone smartphone electronic', expectedCodes: ['85'], type: 'misspelling' },

  // ===============================================
  // SYNONYM TESTS (8)
  // ===============================================

  { category: 'Fruits', name: 'Synonym: Tropical', query: 'tropical produce export market', expectedCodes: ['08'], type: 'synonym' },
  { category: 'Cereals', name: 'Synonym: Grain', query: 'grain milling flour production', expectedCodes: ['10'], type: 'synonym' },
  { category: 'Textiles', name: 'Synonym: Fabric', query: 'fabric cloth weaving textile', expectedCodes: ['52'], type: 'synonym' },
  { category: 'Textiles', name: 'Synonym: Material', query: 'textile material woven cotton', expectedCodes: ['52'], type: 'synonym' },
  { category: 'Machinery', name: 'Synonym: Motor', query: 'motor mechanical device automotive', expectedCodes: ['84'], type: 'synonym' },
  { category: 'Machinery', name: 'Synonym: Mechanical', query: 'mechanical pump compressor parts', expectedCodes: ['84'], type: 'synonym' },
  { category: 'Electronics', name: 'Synonym: Device', query: 'electronic device smartphone computer', expectedCodes: ['85'], type: 'synonym' },
  { category: 'Chemicals', name: 'Synonym: Material', query: 'chemical material compound organic', expectedCodes: ['29'], type: 'synonym' },

  // ===============================================
  // PARTIAL/SHORT QUERY TESTS (8)
  // ===============================================

  { category: 'Animal Products', name: 'Short: Beef', query: 'beef', expectedCodes: ['01', '02'], type: 'partial' },
  { category: 'Fruits', name: 'Short: Mango', query: 'mango', expectedCodes: ['08'], type: 'partial' },
  { category: 'Fruits', name: 'Short: Apple', query: 'apple', expectedCodes: ['08'], type: 'partial' },
  { category: 'Cereals', name: 'Short: Wheat', query: 'wheat', expectedCodes: ['10'], type: 'partial' },
  { category: 'Cereals', name: 'Short: Rice', query: 'rice', expectedCodes: ['10'], type: 'partial' },
  { category: 'Textiles', name: 'Short: Cotton', query: 'cotton', expectedCodes: ['52'], type: 'partial' },
  { category: 'Machinery', name: 'Short: Engine', query: 'engine', expectedCodes: ['84'], type: 'partial' },
  { category: 'Electronics', name: 'Short: Phone', query: 'phone', expectedCodes: ['85'], type: 'partial' },

  // ===============================================
  // COMPLEX/MULTI-PRODUCT TESTS (6)
  // ===============================================

  { category: 'Textiles', name: 'Cotton and Wool', query: 'cotton and wool blend fabric textile', expectedCodes: ['52', '53'], type: 'complex' },
  { category: 'Fruits', name: 'Mixed Fruits', query: 'apple orange mango fresh tropical fruit export', expectedCodes: ['08'], type: 'complex' },
  { category: 'Machinery', name: 'Engine and Pump', query: 'diesel engine and centrifugal pump mechanical', expectedCodes: ['84'], type: 'complex' },
  { category: 'Animal Products', name: 'Mixed Meat', query: 'beef pork chicken fresh meat cuts', expectedCodes: ['01', '02'], type: 'complex' },
  { category: 'Chemicals', name: 'Chemical and Plastic', query: 'organic chemical compound plastic polymer resin', expectedCodes: ['29', '39'], type: 'complex' },
  { category: 'Electronics', name: 'Phone and Computer', query: 'mobile phone smartphone laptop computer electronic device', expectedCodes: ['85'], type: 'complex' },

  // ===============================================
  // EDGE CASE TESTS (10)
  // ===============================================

  // Case sensitivity variations
  { category: 'Fruits', name: 'UPPERCASE', query: 'FRESH MANGO TROPICAL FRUIT', expectedCodes: ['08'], type: 'edge' },
  { category: 'Cereals', name: 'lowercase', query: 'wheat grains milling flour', expectedCodes: ['10'], type: 'edge' },

  // Very long descriptions
  { category: 'Textiles', name: 'Very Long', query: 'high quality premium woven cotton fabric material for apparel clothing textile industry export market', expectedCodes: ['52'], type: 'edge' },

  // Numbers and quantities
  { category: 'Fruits', name: 'With Numbers', query: '100kg fresh mango tropical fruit export', expectedCodes: ['08'], type: 'edge' },

  // Technical descriptions
  { category: 'Chemicals', name: 'Technical', query: 'polymeric compound with molecular weight distribution organic synthesis', expectedCodes: ['29'], type: 'edge' },

  // Multiple keywords mixed
  { category: 'Machinery', name: 'Multiple Keywords', query: 'automotive diesel engine motor pump compressor mechanical parts', expectedCodes: ['84'], type: 'edge' },

  // Partial word matching
  { category: 'Textiles', name: 'Partial Words', query: 'cott fab wov tex', expectedCodes: ['52'], type: 'edge' },

  // Brand-like terms
  { category: 'Electronics', name: 'Brand-like', query: 'smartphone mobile electronic communication device', expectedCodes: ['85'], type: 'edge' },

  // Industry specific terms
  { category: 'Animal Products', name: 'Industry Terms', query: 'livestock cattle bovine breeding stock', expectedCodes: ['01'], type: 'edge' },

  // Descriptive attributes
  { category: 'Fruits', name: 'Descriptive', query: 'sweet juicy organic mango fruit tropical region', expectedCodes: ['08'], type: 'edge' },

  // ===============================================
  // VALIDATION TESTS (Additional 4)
  // ===============================================

  // Ensure chapters are correct
  { category: 'Animal Products', name: 'Pork Meat', query: 'pork meat fresh cuts butcher', expectedCodes: ['01', '02'], type: 'baseline' },
  { category: 'Textiles', name: 'Silk', query: 'silk fabric material textile', expectedCodes: ['52', '53'], type: 'baseline' },
  { category: 'Chemicals', name: 'Industrial Plastic', query: 'industrial plastic polymer resin pellets', expectedCodes: ['39'], type: 'baseline' },
  { category: 'Metals', name: 'Steel', query: 'steel metal alloy plate sheet', expectedCodes: ['72', '73'], type: 'baseline' },
];

interface TestResult {
  testCase: TestCase;
  passed: boolean;
  resultChapter?: string;
  confidence?: number;
  error?: string;
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 5A: COMPREHENSIVE ACCURACY TEST SUITE (50+ Edge Cases)  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let passedTests = 0;
  let totalTests = testCases.length;
  const categoryResults: Record<string, { passed: number; total: number }> = {};
  const typeResults: Record<string, { passed: number; total: number }> = {};
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    const { category, name, query, expectedCodes, type = 'baseline' } = testCase;

    if (!categoryResults[category]) {
      categoryResults[category] = { passed: 0, total: 0 };
    }
    if (!typeResults[type]) {
      typeResults[type] = { passed: 0, total: 0 };
    }

    categoryResults[category].total++;
    typeResults[type].total++;

    try {
      const searchResults = await layeredSearch(query, 3);
      const topResult = searchResults.results[0];

      if (!topResult) {
        results.push({
          testCase,
          passed: false,
          error: 'No results returned'
        });
        continue;
      }

      const resultChapter = topResult.hsCode.substring(0, 2);
      const isMatch = expectedCodes.some(code => resultChapter === code || topResult.hsCode.startsWith(code));

      if (isMatch) {
        passedTests++;
        categoryResults[category].passed++;
        typeResults[type].passed++;
        results.push({
          testCase,
          passed: true,
          resultChapter,
          confidence: topResult.confidence
        });
      } else {
        results.push({
          testCase,
          passed: false,
          resultChapter,
          confidence: topResult.confidence
        });
      }
    } catch (error) {
      results.push({
        testCase,
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Print detailed results
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    DETAILED TEST RESULTS                       ║');
  console.log('╠════════════════════════════════════════════════════════════════╣\n');

  let currentType = '';
  for (const result of results) {
    if (result.testCase.type !== currentType) {
      currentType = result.testCase.type || 'baseline';
      console.log(`\n[${currentType.toUpperCase()}]`);
    }

    const statusEmoji = result.passed ? '✅' : '❌';
    const category = result.testCase.category.padEnd(18);
    const name = result.testCase.name.padEnd(20);
    console.log(`${statusEmoji} ${category} ${name} Query: "${result.testCase.query.substring(0, 40)}${result.testCase.query.length > 40 ? '...' : ''}"`);

    if (!result.passed) {
      console.log(`   Expected: Chapter ${result.testCase.expectedCodes.join(' or ')}`);
      if (result.resultChapter) {
        console.log(`   Got: Chapter ${result.resultChapter} (${result.confidence}% confidence)`);
      } else {
        console.log(`   Error: ${result.error}`);
      }
    } else {
      console.log(`   Got: Chapter ${result.resultChapter} (${result.confidence}% confidence)`);
    }
  }

  // Print category summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTS BY CATEGORY                         ║');
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

  // Print type summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTS BY TEST TYPE                        ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  const typeNames = ['baseline', 'misspelling', 'synonym', 'partial', 'complex', 'edge'];
  for (const type of typeNames) {
    const result = typeResults[type];
    if (!result) continue;
    const { passed, total } = result;
    const percentage = ((passed / total) * 100).toFixed(0);
    const status = passed === total ? '✅' : passed === 0 ? '❌' : '⚠️ ';
    console.log(`${status} ${type.padEnd(20)} ${passed}/${total} (${percentage}%)`);
  }

  // Print overall summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      OVERALL SUMMARY                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  const overallPercentage = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`║ PASSED: ${passedTests}/${totalTests} TESTS (${overallPercentage}%)${' '.repeat(Math.max(0, 45 - String(passedTests).length - String(totalTests).length - String(overallPercentage).length))}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Confidence analysis
  const confidentResults = results.filter(r => r.confidence !== undefined && r.passed);
  if (confidentResults.length > 0) {
    const confidences = confidentResults.map(r => r.confidence as number);
    const avgConfidence = (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1);
    const minConfidence = Math.min(...confidences);
    const maxConfidence = Math.max(...confidences);
    console.log('CONFIDENCE ANALYSIS (Passed Tests):');
    console.log(`  Average: ${avgConfidence}%`);
    console.log(`  Min: ${minConfidence}%`);
    console.log(`  Max: ${maxConfidence}%\n`);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

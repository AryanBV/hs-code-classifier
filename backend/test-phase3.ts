/**
 * Phase 3 Testing Script - COMPREHENSIVE MULTI-CATEGORY TEST SUITE
 * Tests the accuracy-first filtering pipeline across ALL major product categories
 * NOT dependent on single items - covers diverse products from each category
 */

import { classifyProduct } from './src/services/confidence-scorer.service';
import { detectProductState } from './src/services/product-context.service';
import { logger } from './src/utils/logger';

interface TestCase {
  name: string;
  description: string;
  expectedCodes: string[];
  shouldNotInclude: string[];
  category: string;  // Category for organized reporting
}

const testCases: TestCase[] = [
  // ===== CHAPTER 01-05: ANIMAL PRODUCTS =====
  {
    category: 'Animal Products',
    name: 'Live Cattle',
    description: 'Live beef cattle for breeding',
    expectedCodes: ['0102'],
    shouldNotInclude: ['0103', '0104']
  },
  {
    category: 'Animal Products',
    name: 'Fresh Pork Meat',
    description: 'Fresh pork meat cuts',
    expectedCodes: ['0103'],
    shouldNotInclude: ['0102', '0104']
  },
  {
    category: 'Animal Products',
    name: 'Poultry Chicken',
    description: 'Fresh chicken meat for cooking',
    expectedCodes: ['0105'],
    shouldNotInclude: ['0102', '0103']
  },
  {
    category: 'Animal Products',
    name: 'Fish Salmon',
    description: 'Fresh salmon fish fillets',
    expectedCodes: ['0302', '03'],
    shouldNotInclude: ['0402', '05']
  },

  // ===== CHAPTER 06-15: PLANT PRODUCTS & FOODSTUFFS =====
  {
    category: 'Fruits & Produce',
    name: 'Fresh Apples',
    description: 'Fresh red apples for export',
    expectedCodes: ['0808'],
    shouldNotInclude: ['0804', '2007']
  },
  {
    category: 'Fruits & Produce',
    name: 'Fresh Oranges',
    description: 'Fresh citrus oranges',
    expectedCodes: ['0805'],
    shouldNotInclude: ['0804', '0808']
  },
  {
    category: 'Fruits & Produce',
    name: 'Fresh Bananas',
    description: 'Fresh banana fruit bunches',
    expectedCodes: ['0803'],
    shouldNotInclude: ['0804', '0808']
  },
  {
    category: 'Fruits & Produce',
    name: 'Fresh Grapes',
    description: 'Fresh table grapes for consumption',
    expectedCodes: ['0806'],
    shouldNotInclude: ['0804', '0803']
  },
  {
    category: 'Fruits & Produce',
    name: 'Fresh Mangoes',
    description: 'Mangoes fresh fruit tropical',
    expectedCodes: ['0804'],
    shouldNotInclude: ['0803', '0808']
  },
  {
    category: 'Grains & Cereals',
    name: 'Wheat Grain',
    description: 'Wheat grains for milling',
    expectedCodes: ['1001'],
    shouldNotInclude: ['1002', '1003']
  },
  {
    category: 'Grains & Cereals',
    name: 'Rice Milled',
    description: 'Milled rice for consumption',
    expectedCodes: ['1006'],
    shouldNotInclude: ['1001', '1002']
  },
  {
    category: 'Grains & Cereals',
    name: 'Corn Maize',
    description: 'Corn maize grain for feed',
    expectedCodes: ['1005'],
    shouldNotInclude: ['1001', '1006']
  },
  {
    category: 'Sugar & Honey',
    name: 'Raw Sugar',
    description: 'Raw cane sugar crystals',
    expectedCodes: ['1701'],
    shouldNotInclude: ['1704', '1905']
  },
  {
    category: 'Spices & Condiments',
    name: 'Black Pepper',
    description: 'Black pepper spice ground',
    expectedCodes: ['0904'],
    shouldNotInclude: ['0905', '0906']
  },
  {
    category: 'Spices & Condiments',
    name: 'Turmeric Powder',
    description: 'Turmeric spice powder',
    expectedCodes: ['0910'],
    shouldNotInclude: ['0904', '0905']
  },

  // ===== CHAPTER 25-27: MINERAL PRODUCTS =====
  {
    category: 'Minerals & Stones',
    name: 'Crude Oil',
    description: 'Crude petroleum oil barrels',
    expectedCodes: ['2709'],
    shouldNotInclude: ['2710', '2711']
  },
  {
    category: 'Minerals & Stones',
    name: 'Natural Gas',
    description: 'Natural gas liquefied LNG',
    expectedCodes: ['2711'],
    shouldNotInclude: ['2709', '2710']
  },
  {
    category: 'Minerals & Stones',
    name: 'Iron Ore',
    description: 'Iron ore pellets concentrate',
    expectedCodes: ['2601'],
    shouldNotInclude: ['2602', '7201']
  },
  {
    category: 'Minerals & Stones',
    name: 'Copper Ore',
    description: 'Copper ore concentrates',
    expectedCodes: ['2603'],
    shouldNotInclude: ['2601', '2602']
  },

  // ===== CHAPTER 29-38: CHEMICALS =====
  {
    category: 'Chemicals',
    name: 'Organic Compounds',
    description: 'Organic chemical compounds synthesis',
    expectedCodes: ['2907', '29'],
    shouldNotInclude: ['38', '39']
  },
  {
    category: 'Chemicals',
    name: 'Pharmaceutical Products',
    description: 'Pharmaceutical medicine active ingredients',
    expectedCodes: ['2941', '30'],
    shouldNotInclude: ['29', '38']
  },
  {
    category: 'Chemicals',
    name: 'Fertilizer NPK',
    description: 'NPK fertilizer mineral nutrients',
    expectedCodes: ['3105'],
    shouldNotInclude: ['2909', '39']
  },

  // ===== CHAPTER 39-40: PLASTICS & RUBBER =====
  {
    category: 'Plastics & Polymers',
    name: 'Plastic Pellets',
    description: 'Plastic resin pellets polyethylene',
    expectedCodes: ['3901', '39'],
    shouldNotInclude: ['40', '54']
  },
  {
    category: 'Plastics & Polymers',
    name: 'PVC Vinyl',
    description: 'Polyvinyl chloride PVC resin',
    expectedCodes: ['3904'],
    shouldNotInclude: ['3901', '3902']
  },
  {
    category: 'Rubber Products',
    name: 'Natural Rubber',
    description: 'Natural rubber latex sheets',
    expectedCodes: ['4001'],
    shouldNotInclude: ['4002', '3901']
  },

  // ===== CHAPTER 50-63: TEXTILES =====
  {
    category: 'Raw Materials - Fiber',
    name: 'Raw Cotton',
    description: 'Raw cotton fiber bales',
    expectedCodes: ['5201'],
    shouldNotInclude: ['5202', '52']
  },
  {
    category: 'Raw Materials - Fiber',
    name: 'Wool Fleece',
    description: 'Wool fleece raw material',
    expectedCodes: ['5101'],
    shouldNotInclude: ['5102', '52']
  },
  {
    category: 'Yarn & Thread',
    name: 'Cotton Yarn',
    description: 'Cotton yarn thread for weaving',
    expectedCodes: ['5204'],
    shouldNotInclude: ['5205', '5208']
  },
  {
    category: 'Yarn & Thread',
    name: 'Synthetic Yarn',
    description: 'Polyester synthetic yarn',
    expectedCodes: ['5406'],
    shouldNotInclude: ['5204', '5408']
  },
  {
    category: 'Fabrics - Natural',
    name: 'Cotton Fabric Plain',
    description: 'Plain woven cotton fabric cloth',
    expectedCodes: ['5208', '52'],
    shouldNotInclude: ['5407', '54']
  },
  {
    category: 'Fabrics - Natural',
    name: 'Wool Fabric',
    description: 'Wool woven fabric textile apparel',
    expectedCodes: ['5111', '51'],
    shouldNotInclude: ['5208', '54']
  },
  {
    category: 'Fabrics - Natural',
    name: 'Silk Fabric',
    description: 'Silk woven fabric luxury cloth',
    expectedCodes: ['5007', '5008', '50'],
    shouldNotInclude: ['52', '54']
  },
  {
    category: 'Fabrics - Synthetic',
    name: 'Polyester Fabric',
    description: 'Polyester woven fabric synthetic',
    expectedCodes: ['5407', '54'],
    shouldNotInclude: ['5208', '52']
  },
  {
    category: 'Clothing & Apparel',
    name: 'Cotton T-Shirt',
    description: 'Cotton t-shirt for men apparel',
    expectedCodes: ['6109', '61'],
    shouldNotInclude: ['5208', '54']
  },
  {
    category: 'Clothing & Apparel',
    name: 'Denim Jeans',
    description: 'Denim jeans trousers pants',
    expectedCodes: ['6203', '62'],
    shouldNotInclude: ['6109', '61']
  },

  // ===== CHAPTER 64-67: FOOTWEAR & ACCESSORIES =====
  {
    category: 'Footwear',
    name: 'Leather Shoes',
    description: 'Leather shoes footwear',
    expectedCodes: ['6403', '64'],
    shouldNotInclude: ['6404', '65']
  },
  {
    category: 'Footwear',
    name: 'Rubber Shoes',
    description: 'Rubber sole athletic shoes',
    expectedCodes: ['6404'],
    shouldNotInclude: ['6403', '6405']
  },

  // ===== CHAPTER 68-71: STONE, GLASS, METALS =====
  {
    category: 'Stone & Cement',
    name: 'Portland Cement',
    description: 'Portland cement powder',
    expectedCodes: ['6829'],
    shouldNotInclude: ['6801', '6802']
  },
  {
    category: 'Glass Products',
    name: 'Glass Bottles',
    description: 'Glass bottles containers',
    expectedCodes: ['7010'],
    shouldNotInclude: ['7007', '7020']
  },
  {
    category: 'Iron & Steel',
    name: 'Steel Bars',
    description: 'Steel reinforcement bars rebar',
    expectedCodes: ['7213', '72'],
    shouldNotInclude: ['7307', '84']
  },
  {
    category: 'Iron & Steel',
    name: 'Stainless Steel Sheet',
    description: 'Stainless steel sheet metal',
    expectedCodes: ['7219', '7220'],
    shouldNotInclude: ['7208', '7210']
  },
  {
    category: 'Aluminum',
    name: 'Aluminum Ingots',
    description: 'Aluminum ingots metal',
    expectedCodes: ['7601'],
    shouldNotInclude: ['7603', '7608']
  },
  {
    category: 'Copper & Alloys',
    name: 'Copper Wire',
    description: 'Copper wire electrical',
    expectedCodes: ['7408'],
    shouldNotInclude: ['7407', '7409']
  },

  // ===== CHAPTER 84-85: MACHINERY & ELECTRICAL =====
  {
    category: 'Engines & Motors',
    name: 'Diesel Engine',
    description: 'Diesel engine internal combustion',
    expectedCodes: ['8408', '84'],
    shouldNotInclude: ['8407', '85']
  },
  {
    category: 'Engines & Motors',
    name: 'Electric Motor',
    description: 'Electric motor power equipment',
    expectedCodes: ['8501', '85'],
    shouldNotInclude: ['8408', '84']
  },
  {
    category: 'Pumps & Compressors',
    name: 'Water Pump',
    description: 'Water pump mechanical equipment',
    expectedCodes: ['8413', '84'],
    shouldNotInclude: ['8501', '85']
  },
  {
    category: 'Pumps & Compressors',
    name: 'Air Compressor',
    description: 'Air compressor industrial machine',
    expectedCodes: ['8414', '84'],
    shouldNotInclude: ['8413', '8501']
  },
  {
    category: 'Transformers & Power',
    name: 'Power Transformer',
    description: 'Power transformer electrical equipment',
    expectedCodes: ['8504', '85'],
    shouldNotInclude: ['8501', '8503']
  },
  {
    category: 'Electronics - Computing',
    name: 'Desktop Computer',
    description: 'Desktop computer electronic device',
    expectedCodes: ['8471'],
    shouldNotInclude: ['8517', '8528']
  },
  {
    category: 'Electronics - Computing',
    name: 'Computer Motherboard',
    description: 'Computer motherboard circuit board',
    expectedCodes: ['8534'],
    shouldNotInclude: ['8471', '8517']
  },
  {
    category: 'Electronics - Communication',
    name: 'Mobile Smartphone',
    description: 'Mobile telephone smartphone cellular',
    expectedCodes: ['8517'],
    shouldNotInclude: ['8471', '8528']
  },
  {
    category: 'Electronics - Communication',
    name: 'Wireless Router',
    description: 'Wireless router networking equipment',
    expectedCodes: ['8517'],
    shouldNotInclude: ['8471', '8528']
  },
  {
    category: 'Electronics - Cables & Wiring',
    name: 'USB Cable',
    description: 'USB electrical cable data transfer',
    expectedCodes: ['8544'],
    shouldNotInclude: ['8517', '8471']
  },
  {
    category: 'Electronics - Cables & Wiring',
    name: 'Power Cable',
    description: 'Electrical power cable wire',
    expectedCodes: ['8544'],
    shouldNotInclude: ['8543', '8537']
  },

  // ===== CHAPTER 87: VEHICLES & TRANSPORT =====
  {
    category: 'Automobiles',
    name: 'Car Vehicle',
    description: 'Automobile passenger car vehicle',
    expectedCodes: ['8703'],
    shouldNotInclude: ['8704', '8751']
  },
  {
    category: 'Automobiles',
    name: 'Truck Heavy Vehicle',
    description: 'Heavy truck cargo vehicle',
    expectedCodes: ['8704'],
    shouldNotInclude: ['8703', '8706']
  },
  {
    category: 'Motorcycles & Bikes',
    name: 'Motorcycle Bike',
    description: 'Motorcycle two wheeler vehicle',
    expectedCodes: ['8711'],
    shouldNotInclude: ['8703', '8712']
  },

  // ===== CHAPTER 88-90: MISC MANUFACTURED =====
  {
    category: 'Aircraft & Aviation',
    name: 'Aircraft Airplane',
    description: 'Aircraft airplane passenger vehicle',
    expectedCodes: ['8802'],
    shouldNotInclude: ['8704', '8803']
  },
  {
    category: 'Optical & Medical',
    name: 'Medical Stethoscope',
    description: 'Medical stethoscope diagnostic equipment',
    expectedCodes: ['9018'],
    shouldNotInclude: ['8517', '9019']
  },
  {
    category: 'Optical & Medical',
    name: 'Optical Lens',
    description: 'Optical lens glass precision',
    expectedCodes: ['9001'],
    shouldNotInclude: ['7007', '9018']
  },
];

async function runTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 3: COMPREHENSIVE MULTI-CATEGORY ACCURACY TEST SUITE    ║');
  console.log('║   Testing across ALL major HS code categories                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  let passedTests = 0;
  let totalTests = testCases.length;
  const categoryResults: { [key: string]: { passed: number; total: number } } = {};

  for (const testCase of testCases) {
    const category = testCase.category;
    if (!categoryResults[category]) {
      categoryResults[category] = { passed: 0, total: 0 };
    }
    categoryResults[category].total++;

    console.log(`\n--- [${category}] ${testCase.name} ---`);
    console.log(`Description: "${testCase.description}"`);

    try {
      // Detect product state first
      const productState = await detectProductState(testCase.description);
      console.log(`State: ${productState.state}`);

      // Run classification
      const result = await classifyProduct({
        productDescription: testCase.description,
        destinationCountry: 'US'
      });

      if (result.results.length === 0) {
        console.log('❌ FAILED: No results returned');
        continue;
      }

      const topResult = result.results[0];
      if (!topResult) {
        console.log('❌ FAILED: No top result');
        continue;
      }

      const topCode = topResult.hsCode;
      const topConfidence = topResult.confidence;
      const allCodes = result.results.map(r => r.hsCode);

      console.log(`Top: ${topCode} (${topConfidence}% conf) | Results: ${allCodes.join(', ')}`);

      // Check if expected code is in results
      const hasExpectedCode = testCase.expectedCodes.some(code => {
        const codeParts = code.split('.');
        const codePrefix = codeParts[0] || '';
        return allCodes.some(returnedCode => returnedCode.startsWith(codePrefix));
      });

      // Check if any forbidden code is in results
      const hasForbiddenCode = testCase.shouldNotInclude.some(code => {
        const codeParts = code.split('.');
        const codePrefix = codeParts[0] || '';
        return allCodes.some(returnedCode => returnedCode.startsWith(codePrefix));
      });

      if (hasExpectedCode && !hasForbiddenCode) {
        console.log('✅ PASSED');
        passedTests++;
        categoryResults[category].passed++;
      } else {
        console.log('❌ FAILED');
        if (!hasExpectedCode) console.log(`  - Expected: ${testCase.expectedCodes.join(' or ')}`);
        if (hasForbiddenCode) console.log(`  - Forbidden found: ${testCase.shouldNotInclude.join(' or ')}`);
      }

    } catch (error) {
      console.log(`❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Print category summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                       CATEGORY RESULTS                          ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  const sortedCategories = Object.keys(categoryResults).sort();
  for (const category of sortedCategories) {
    const result = categoryResults[category];
    if (!result) continue;
    const { passed, total } = result;
    const percentage = ((passed / total) * 100).toFixed(0);
    const status = passed === total ? '✅' : passed === 0 ? '❌' : '⚠️ ';
    console.log(`${status} ${category.padEnd(30)} ${passed}/${total} (${percentage}%)`);
  }

  console.log('╠════════════════════════════════════════════════════════════════╣');
  const overallPercentage = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`║ OVERALL: ${passedTests}/${totalTests} TESTS PASSED (${overallPercentage}%)${' '.repeat(25)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});

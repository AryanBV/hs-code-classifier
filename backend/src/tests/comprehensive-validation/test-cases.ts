// backend/src/tests/comprehensive-validation/test-cases.ts

export interface TestCase {
  id: string;
  category: string;
  input: string;
  expectedChapter: string;
  expectedHeading?: string;      // First 4 digits (optional - for accuracy measurement)
  expectedCode?: string;         // Full 8-digit code (optional - for exact match)
  acceptableChapters?: string[]; // Alternative valid chapters
  difficulty: 'easy' | 'medium' | 'hard';
  notes?: string;
}

export const testCases: TestCase[] = [

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 1: TEXTILES & APPAREL (Chapter 50-63)
  // Common Indian exports, various specificity levels
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'TEX001',
    category: 'Textiles',
    input: "men's cotton t-shirts",
    expectedChapter: '61',
    expectedHeading: '6109',
    expectedCode: '6109.10.00',
    difficulty: 'easy',
    notes: 'CRITICAL TEST - must classify by function (apparel) not material (cotton)'
  },
  {
    id: 'TEX002',
    category: 'Textiles',
    input: 'cotton bedsheets king size',
    expectedChapter: '63',
    expectedHeading: '6302',
    difficulty: 'easy',
    notes: 'Bed linen, not fabric'
  },
  {
    id: 'TEX003',
    category: 'Textiles',
    input: 'raw silk fabric unprocessed',
    expectedChapter: '50',
    expectedHeading: '5002',
    difficulty: 'medium',
    notes: 'Raw silk, not finished products'
  },
  {
    id: 'TEX004',
    category: 'Textiles',
    input: 'woolen sweaters hand knitted',
    expectedChapter: '61',
    expectedHeading: '6110',
    difficulty: 'easy'
  },
  {
    id: 'TEX005',
    category: 'Textiles',
    input: 'polyester sarees embroidered',
    expectedChapter: '62',
    expectedHeading: '6206',
    acceptableChapters: ['61', '62'],
    difficulty: 'medium',
    notes: 'Sarees can be under multiple headings'
  },
  {
    id: 'TEX006',
    category: 'Textiles',
    input: 'jute bags shopping',
    expectedChapter: '63',
    expectedHeading: '6305',
    difficulty: 'easy'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 2: FOOD & AGRICULTURAL PRODUCTS (Chapter 01-24)
  // Major Indian exports: spices, rice, tea, coffee
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'FOOD001',
    category: 'Food',
    input: 'basmati rice 5kg bags',
    expectedChapter: '10',
    expectedHeading: '1006',
    difficulty: 'easy'
  },
  {
    id: 'FOOD002',
    category: 'Food',
    input: 'arabica coffee beans roasted',
    expectedChapter: '09',
    expectedHeading: '0901',
    difficulty: 'easy'
  },
  {
    id: 'FOOD003',
    category: 'Food',
    input: 'instant coffee powder nescafe type',
    expectedChapter: '21',
    expectedHeading: '2101',
    difficulty: 'medium',
    notes: 'Instant coffee is Ch.21, not Ch.09'
  },
  {
    id: 'FOOD004',
    category: 'Food',
    input: 'darjeeling tea loose leaf',
    expectedChapter: '09',
    expectedHeading: '0902',
    difficulty: 'easy'
  },
  {
    id: 'FOOD005',
    category: 'Food',
    input: 'turmeric powder organic',
    expectedChapter: '09',
    expectedHeading: '0910',
    difficulty: 'easy'
  },
  {
    id: 'FOOD006',
    category: 'Food',
    input: 'alphonso mango fresh',
    expectedChapter: '08',
    expectedHeading: '0804',
    difficulty: 'easy'
  },
  {
    id: 'FOOD007',
    category: 'Food',
    input: 'dried mango slices',
    expectedChapter: '08',
    expectedHeading: '0804',
    difficulty: 'medium',
    notes: 'Dried fruit same chapter as fresh'
  },
  {
    id: 'FOOD008',
    category: 'Food',
    input: 'frozen shrimp peeled',
    expectedChapter: '03',
    expectedHeading: '0306',
    difficulty: 'easy'
  },
  {
    id: 'FOOD009',
    category: 'Food',
    input: 'black pepper whole',
    expectedChapter: '09',
    expectedHeading: '0904',
    difficulty: 'easy'
  },
  {
    id: 'FOOD010',
    category: 'Food',
    input: 'cashew nuts roasted salted',
    expectedChapter: '08',
    expectedHeading: '0801',
    acceptableChapters: ['08', '20'],
    difficulty: 'medium',
    notes: 'Processed nuts could be Ch.20'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 3: ELECTRONICS & MACHINERY (Chapter 84-85)
  // Modern exports, brand names, technical products
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'ELEC001',
    category: 'Electronics',
    input: 'LED light bulbs',
    expectedChapter: '85',
    expectedHeading: '8539',
    difficulty: 'easy'
  },
  {
    id: 'ELEC002',
    category: 'Electronics',
    input: 'mobile phone chargers USB',
    expectedChapter: '85',
    expectedHeading: '8504',
    difficulty: 'easy'
  },
  {
    id: 'ELEC003',
    category: 'Electronics',
    input: 'laptop computers',
    expectedChapter: '84',
    expectedHeading: '8471',
    difficulty: 'easy'
  },
  {
    id: 'ELEC004',
    category: 'Electronics',
    input: 'iPhone 15 smartphone',
    expectedChapter: '85',
    expectedHeading: '8517',
    difficulty: 'medium',
    notes: 'Brand name - should understand this is a phone'
  },
  {
    id: 'ELEC005',
    category: 'Electronics',
    input: 'Samsung television 55 inch',
    expectedChapter: '85',
    expectedHeading: '8528',
    difficulty: 'medium',
    notes: 'Brand name - should understand this is a TV'
  },
  {
    id: 'ELEC006',
    category: 'Electronics',
    input: 'electric motors 5HP',
    expectedChapter: '85',
    expectedHeading: '8501',
    difficulty: 'easy'
  },
  {
    id: 'ELEC007',
    category: 'Electronics',
    input: 'solar panels photovoltaic',
    expectedChapter: '85',
    expectedHeading: '8541',
    difficulty: 'medium'
  },
  {
    id: 'ELEC008',
    category: 'Electronics',
    input: 'air conditioner split unit',
    expectedChapter: '84',
    expectedHeading: '8415',
    difficulty: 'easy'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 4: CHEMICALS & PHARMACEUTICALS (Chapter 28-38)
  // Technical products, ayurvedic medicine
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'CHEM001',
    category: 'Chemicals',
    input: 'paracetamol tablets 500mg',
    expectedChapter: '30',
    expectedHeading: '3004',
    difficulty: 'easy'
  },
  {
    id: 'CHEM002',
    category: 'Chemicals',
    input: 'ayurvedic herbal medicine capsules',
    expectedChapter: '30',
    expectedHeading: '3004',
    acceptableChapters: ['30', '21'],
    difficulty: 'hard',
    notes: 'Ayurvedic can be medicament or food supplement'
  },
  {
    id: 'CHEM003',
    category: 'Chemicals',
    input: 'sodium hydroxide industrial grade',
    expectedChapter: '28',
    expectedHeading: '2815',
    difficulty: 'medium'
  },
  {
    id: 'CHEM004',
    category: 'Chemicals',
    input: 'hand sanitizer gel',
    expectedChapter: '38',
    expectedHeading: '3808',
    acceptableChapters: ['33', '38'],
    difficulty: 'medium'
  },
  {
    id: 'CHEM005',
    category: 'Chemicals',
    input: 'organic fertilizer npk',
    expectedChapter: '31',
    expectedHeading: '3105',
    difficulty: 'medium'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 5: METALS & METAL PRODUCTS (Chapter 72-83)
  // Steel, iron, aluminum products
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'MET001',
    category: 'Metals',
    input: 'stainless steel bolts M8',
    expectedChapter: '73',
    expectedHeading: '7318',
    difficulty: 'easy'
  },
  {
    id: 'MET002',
    category: 'Metals',
    input: 'aluminum sheets 2mm thick',
    expectedChapter: '76',
    expectedHeading: '7606',
    difficulty: 'easy'
  },
  {
    id: 'MET003',
    category: 'Metals',
    input: 'iron pipes galvanized',
    expectedChapter: '73',
    expectedHeading: '7306',
    difficulty: 'easy'
  },
  {
    id: 'MET004',
    category: 'Metals',
    input: 'copper wire electrical',
    expectedChapter: '74',
    expectedHeading: '7408',
    difficulty: 'easy'
  },
  {
    id: 'MET005',
    category: 'Metals',
    input: 'gold jewelry necklace',
    expectedChapter: '71',
    expectedHeading: '7113',
    difficulty: 'easy'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 6: AUTOMOTIVE & PARTS (Chapter 87)
  // Car parts, vehicles, accessories
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'AUTO001',
    category: 'Automotive',
    input: 'car brake pads ceramic',
    expectedChapter: '87',
    expectedHeading: '8708',
    difficulty: 'easy',
    notes: 'Function over material - brake pads not ceramics'
  },
  {
    id: 'AUTO002',
    category: 'Automotive',
    input: 'motorcycle spare parts engine',
    expectedChapter: '87',
    expectedHeading: '8714',
    difficulty: 'medium'
  },
  {
    id: 'AUTO003',
    category: 'Automotive',
    input: 'car tires radial 205/55R16',
    expectedChapter: '40',
    expectedHeading: '4011',
    difficulty: 'easy',
    notes: 'Tires are rubber products, not automotive'
  },
  {
    id: 'AUTO004',
    category: 'Automotive',
    input: 'bicycle complete assembled',
    expectedChapter: '87',
    expectedHeading: '8712',
    difficulty: 'easy'
  },
  {
    id: 'AUTO005',
    category: 'Automotive',
    input: 'auto rickshaw three wheeler',
    expectedChapter: '87',
    expectedHeading: '8703',
    difficulty: 'medium',
    notes: 'Indian specific vehicle type'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 7: FURNITURE & WOOD (Chapter 44, 94)
  // Wooden products, furniture
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'FURN001',
    category: 'Furniture',
    input: 'wooden dining table',
    expectedChapter: '94',
    expectedHeading: '9403',
    difficulty: 'easy'
  },
  {
    id: 'FURN002',
    category: 'Furniture',
    input: 'teak wood planks',
    expectedChapter: '44',
    expectedHeading: '4407',
    difficulty: 'easy',
    notes: 'Raw wood, not furniture'
  },
  {
    id: 'FURN003',
    category: 'Furniture',
    input: 'wooden chair with steel legs',
    expectedChapter: '94',
    expectedHeading: '9401',
    difficulty: 'hard',
    notes: 'Composite product - classify by primary material/function'
  },
  {
    id: 'FURN004',
    category: 'Furniture',
    input: 'bamboo handicrafts decorative',
    expectedChapter: '46',
    expectedHeading: '4602',
    difficulty: 'medium'
  },
  {
    id: 'FURN005',
    category: 'Furniture',
    input: 'plastic chairs outdoor',
    expectedChapter: '94',
    expectedHeading: '9401',
    difficulty: 'easy',
    notes: 'Furniture by function, not plastic products'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 8: VAGUE/INCOMPLETE INPUTS
  // Test how system handles ambiguous queries
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'VAGUE001',
    category: 'Vague',
    input: 'rice',
    expectedChapter: '10',
    expectedHeading: '1006',
    difficulty: 'medium',
    notes: 'Should ask clarifying questions or default to unmilled rice'
  },
  {
    id: 'VAGUE002',
    category: 'Vague',
    input: 'coffee',
    expectedChapter: '09',
    acceptableChapters: ['09', '21'],
    difficulty: 'medium',
    notes: 'Could be beans (09) or instant (21) - should ask'
  },
  {
    id: 'VAGUE003',
    category: 'Vague',
    input: 'clothes',
    expectedChapter: '62',
    acceptableChapters: ['61', '62', '63'],
    difficulty: 'hard',
    notes: 'Very vague - should ask type of clothing'
  },
  {
    id: 'VAGUE004',
    category: 'Vague',
    input: 'machine parts',
    expectedChapter: '84',
    acceptableChapters: ['84', '85', '87'],
    difficulty: 'hard',
    notes: 'Very vague - should ask what type of machine'
  },
  {
    id: 'VAGUE005',
    category: 'Vague',
    input: 'food items',
    expectedChapter: '21',
    acceptableChapters: ['04', '07', '08', '09', '10', '16', '17', '18', '19', '20', '21'],
    difficulty: 'hard',
    notes: 'Extremely vague - must ask clarifying question'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 9: COLLOQUIAL/INFORMAL TERMS
  // How people actually talk about products
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'COLL001',
    category: 'Colloquial',
    input: 'veggies fresh',
    expectedChapter: '07',
    difficulty: 'medium',
    notes: 'Colloquial for vegetables'
  },
  {
    id: 'COLL002',
    category: 'Colloquial',
    input: 'tshirts',
    expectedChapter: '61',
    expectedHeading: '6109',
    difficulty: 'easy',
    notes: 'No space, no apostrophe'
  },
  {
    id: 'COLL003',
    category: 'Colloquial',
    input: 'AC spare parts',
    expectedChapter: '84',
    expectedHeading: '8415',
    difficulty: 'medium',
    notes: 'AC = Air Conditioner'
  },
  {
    id: 'COLL004',
    category: 'Colloquial',
    input: 'phone covers silicone',
    expectedChapter: '39',
    acceptableChapters: ['39', '42'],
    difficulty: 'medium',
    notes: 'Phone accessories'
  },
  {
    id: 'COLL005',
    category: 'Colloquial',
    input: 'gym equipment weights',
    expectedChapter: '95',
    expectedHeading: '9506',
    difficulty: 'medium'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 10: MISSPELLINGS & TYPOS
  // Real-world input quality
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'TYPO001',
    category: 'Typos',
    input: 'cotten tshirts',
    expectedChapter: '61',
    expectedHeading: '6109',
    difficulty: 'medium',
    notes: 'Misspelled cotton'
  },
  {
    id: 'TYPO002',
    category: 'Typos',
    input: 'banannas fresh',
    expectedChapter: '08',
    expectedHeading: '0803',
    difficulty: 'medium',
    notes: 'Misspelled bananas'
  },
  {
    id: 'TYPO003',
    category: 'Typos',
    input: 'eletric motors',
    expectedChapter: '85',
    expectedHeading: '8501',
    difficulty: 'medium',
    notes: 'Misspelled electric'
  },
  {
    id: 'TYPO004',
    category: 'Typos',
    input: 'aluminium sheets',
    expectedChapter: '76',
    expectedHeading: '7606',
    difficulty: 'easy',
    notes: 'British spelling - should work'
  },
  {
    id: 'TYPO005',
    category: 'Typos',
    input: 'reconditioned auto parts',
    expectedChapter: '87',
    expectedHeading: '8708',
    difficulty: 'medium'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY 11: COMPOSITE/COMPLEX PRODUCTS
  // Products that span multiple categories
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'COMP001',
    category: 'Composite',
    input: 'leather handbag with metal clasp',
    expectedChapter: '42',
    expectedHeading: '4202',
    difficulty: 'medium',
    notes: 'Primary material is leather'
  },
  {
    id: 'COMP002',
    category: 'Composite',
    input: 'cotton shirt with polyester blend',
    expectedChapter: '62',
    acceptableChapters: ['61', '62'],
    difficulty: 'hard',
    notes: 'Depends on which material dominates'
  },
  {
    id: 'COMP003',
    category: 'Composite',
    input: 'gift set perfume and lotion',
    expectedChapter: '33',
    difficulty: 'hard',
    notes: 'Sets classified by primary item'
  },
  {
    id: 'COMP004',
    category: 'Composite',
    input: 'toy car with remote control',
    expectedChapter: '95',
    expectedHeading: '9503',
    difficulty: 'medium',
    notes: 'Toy, not electronics or vehicle'
  },
  {
    id: 'COMP005',
    category: 'Composite',
    input: 'stainless steel water bottle plastic cap',
    expectedChapter: '73',
    acceptableChapters: ['39', '73'],
    difficulty: 'hard',
    notes: 'Primary material is steel'
  }
];

// Export test cases grouped by category
export const testCasesByCategory = testCases.reduce((acc, tc) => {
  const arr = acc[tc.category] ?? [];
  arr.push(tc);
  acc[tc.category] = arr;
  return acc;
}, {} as Record<string, TestCase[]>);

// Export test cases grouped by difficulty
export const testCasesByDifficulty = testCases.reduce((acc, tc) => {
  const arr = acc[tc.difficulty] ?? [];
  arr.push(tc);
  acc[tc.difficulty] = arr;
  return acc;
}, {} as Record<string, TestCase[]>);

// Summary statistics
export const testSummary = {
  total: testCases.length,
  byCategory: Object.entries(testCasesByCategory).map(([cat, cases]) => ({
    category: cat,
    count: cases.length
  })),
  byDifficulty: Object.entries(testCasesByDifficulty).map(([diff, cases]) => ({
    difficulty: diff,
    count: cases.length
  }))
};

/**
 * Baseline Test Products - 30 diverse cases for before/after comparison
 *
 * Categories:
 * - Vehicle Parts (6) - GIR 2a critical tests (material vs function)
 * - Coffee/Tea (3) - Processing state distinctions
 * - Pharmaceuticals (3) - Dosage form vs bulk API
 * - Garments (4) - Knitted vs woven
 * - Confusing Pairs (6) - Chapter note edge cases
 * - Easy Products (5) - Sanity checks
 * - Hard Products (3) - Stress tests
 */

export interface BaselineProduct {
  id: string;
  query: string;
  expected: string;      // Full 8-digit code (with dots)
  chapter: string;       // 2-digit chapter
  heading: string;       // 4-digit heading
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keyDistinction: string;
}

export const BASELINE_TEST_PRODUCTS: BaselineProduct[] = [
  // ============================================
  // VEHICLE PARTS (6) - GIR 2a Critical Tests
  // These MUST classify by function (Ch.87), not material
  // ============================================
  {
    id: 'BL001',
    query: 'ceramic brake pads for heavy trucks',
    expected: '8708.30.00',
    chapter: '87',
    heading: '8708',
    category: 'Vehicle Parts',
    difficulty: 'hard',
    keyDistinction: 'GIR 2a: Ceramic material → function (vehicle brakes)'
  },
  {
    id: 'BL002',
    query: 'rubber oil seals for automobile engines',
    expected: '8708.99.00',
    chapter: '87',
    heading: '8708',
    category: 'Vehicle Parts',
    difficulty: 'hard',
    keyDistinction: 'GIR 2a: Rubber material → function (vehicle parts)'
  },
  {
    id: 'BL003',
    query: 'plastic bumper for Toyota Innova passenger car',
    expected: '8708.10.00',
    chapter: '87',
    heading: '8708',
    category: 'Vehicle Parts',
    difficulty: 'medium',
    keyDistinction: 'GIR 2a: Plastic material → function (vehicle bodywork)'
  },
  {
    id: 'BL004',
    query: 'truck tyre 315/80R22.5 radial new',
    expected: '4011.20.00',
    chapter: '40',
    heading: '4011',
    category: 'Vehicle Parts',
    difficulty: 'easy',
    keyDistinction: 'Tyres stay in Ch.40 (specific heading for tyres)'
  },
  {
    id: 'BL005',
    query: 'car battery 12V 65Ah lead-acid',
    expected: '8507.10.00',
    chapter: '85',
    heading: '8507',
    category: 'Vehicle Parts',
    difficulty: 'medium',
    keyDistinction: 'Batteries have specific heading in Ch.85'
  },
  {
    id: 'BL006',
    query: 'aluminium alloy wheel rims for passenger cars',
    expected: '8708.70.00',
    chapter: '87',
    heading: '8708',
    category: 'Vehicle Parts',
    difficulty: 'hard',
    keyDistinction: 'GIR 2a: Aluminium material → function (wheels)'
  },

  // ============================================
  // COFFEE/TEA (3) - Processing State
  // ============================================
  {
    id: 'BL007',
    query: 'arabica coffee beans grade A plantation not roasted',
    expected: '0901.11.10',
    chapter: '09',
    heading: '0901',
    category: 'Coffee',
    difficulty: 'easy',
    keyDistinction: 'Raw coffee → Ch.09'
  },
  {
    id: 'BL008',
    query: 'instant coffee powder spray dried soluble',
    expected: '2101.11.00',
    chapter: '21',
    heading: '2101',
    category: 'Coffee',
    difficulty: 'medium',
    keyDistinction: 'Processed/instant → Ch.21'
  },
  {
    id: 'BL009',
    query: 'roasted coffee beans whole not ground arabica',
    expected: '0901.21.00',
    chapter: '09',
    heading: '0901',
    category: 'Coffee',
    difficulty: 'medium',
    keyDistinction: 'Roasted but not extracted → Ch.09'
  },

  // ============================================
  // PHARMACEUTICALS (3) - Dosage vs Bulk
  // ============================================
  {
    id: 'BL010',
    query: 'paracetamol tablets 500mg blister pack for retail',
    expected: '3004.90.99',
    chapter: '30',
    heading: '3004',
    category: 'Pharmaceuticals',
    difficulty: 'easy',
    keyDistinction: 'Dosage form for retail → Ch.30'
  },
  {
    id: 'BL011',
    query: 'paracetamol powder bulk API pharmaceutical grade',
    expected: '2924.29.00',
    chapter: '29',
    heading: '2924',
    category: 'Pharmaceuticals',
    difficulty: 'hard',
    keyDistinction: 'Bulk API (not dosed) → Ch.29'
  },
  {
    id: 'BL012',
    query: 'vitamin C tablets 1000mg food supplement',
    expected: '2106.90.99',
    chapter: '21',
    heading: '2106',
    category: 'Pharmaceuticals',
    difficulty: 'hard',
    keyDistinction: 'Food supplement (not medicament) → Ch.21'
  },

  // ============================================
  // GARMENTS (4) - Knitted vs Woven
  // ============================================
  {
    id: 'BL013',
    query: "men's cotton t-shirt knitted casual",
    expected: '6109.10.00',
    chapter: '61',
    heading: '6109',
    category: 'Garments',
    difficulty: 'easy',
    keyDistinction: 'Knitted → Ch.61'
  },
  {
    id: 'BL014',
    query: "men's formal cotton shirt woven with collar",
    expected: '6205.20.00',
    chapter: '62',
    heading: '6205',
    category: 'Garments',
    difficulty: 'easy',
    keyDistinction: 'Woven → Ch.62'
  },
  {
    id: 'BL015',
    query: 'wool sweater knitted pullover hand-made',
    expected: '6110.11.00',
    chapter: '61',
    heading: '6110',
    category: 'Garments',
    difficulty: 'easy',
    keyDistinction: 'Knitted sweater → Ch.61'
  },
  {
    id: 'BL016',
    query: 'silk saree woven traditional handloom',
    expected: '6206.10.00',
    chapter: '62',
    heading: '6206',
    category: 'Garments',
    difficulty: 'medium',
    keyDistinction: 'Woven silk garment → Ch.62'
  },

  // ============================================
  // CONFUSING PAIRS (6) - Edge Cases
  // ============================================
  {
    id: 'BL017',
    query: 'mink fur coat full length ladies',
    expected: '4303.10.00',
    chapter: '43',
    heading: '4303',
    category: 'Confusing Pairs',
    difficulty: 'hard',
    keyDistinction: 'Furskin articles → Ch.43 (not textiles)'
  },
  {
    id: 'BL018',
    query: 'genuine leather jacket brown men',
    expected: '4203.10.00',
    chapter: '42',
    heading: '4203',
    category: 'Confusing Pairs',
    difficulty: 'medium',
    keyDistinction: 'Leather articles → Ch.42'
  },
  {
    id: 'BL019',
    query: 'tinplate steel sheets for canning industry',
    expected: '7210.12.00',
    chapter: '72',
    heading: '7210',
    category: 'Confusing Pairs',
    difficulty: 'hard',
    keyDistinction: 'Coated flat steel → Ch.72 (not articles Ch.73)'
  },
  {
    id: 'BL020',
    query: 'polyester filament yarn continuous single',
    expected: '5402.33.00',
    chapter: '54',
    heading: '5402',
    category: 'Confusing Pairs',
    difficulty: 'hard',
    keyDistinction: 'Filament (continuous) → Ch.54'
  },
  {
    id: 'BL021',
    query: 'polyester staple fiber short cut for spinning',
    expected: '5503.20.00',
    chapter: '55',
    heading: '5503',
    category: 'Confusing Pairs',
    difficulty: 'hard',
    keyDistinction: 'Staple (short) → Ch.55'
  },
  {
    id: 'BL022',
    query: 'coffee concentrate cold brew liquid extract',
    expected: '2101.11.00',
    chapter: '21',
    heading: '2101',
    category: 'Confusing Pairs',
    difficulty: 'hard',
    keyDistinction: 'Extract/concentrate → Ch.21'
  },

  // ============================================
  // EASY PRODUCTS (5) - Sanity Checks
  // ============================================
  {
    id: 'BL023',
    query: 'black pepper whole Malabar grade dried',
    expected: '0904.11.00',
    chapter: '09',
    heading: '0904',
    category: 'Spices',
    difficulty: 'easy',
    keyDistinction: 'Whole spice → Ch.09'
  },
  {
    id: 'BL024',
    query: 'electric motor AC induction 5HP industrial',
    expected: '8501.52.00',
    chapter: '85',
    heading: '8501',
    category: 'Machinery',
    difficulty: 'easy',
    keyDistinction: 'Electric motors → Ch.85'
  },
  {
    id: 'BL025',
    query: 'PVC pipe rigid for water supply construction',
    expected: '3917.23.00',
    chapter: '39',
    heading: '3917',
    category: 'Plastics',
    difficulty: 'easy',
    keyDistinction: 'Plastic pipes → Ch.39'
  },
  {
    id: 'BL026',
    query: 'natural rubber sheet smoked RSS grade',
    expected: '4001.21.00',
    chapter: '40',
    heading: '4001',
    category: 'Rubber',
    difficulty: 'easy',
    keyDistinction: 'Natural rubber → Ch.40'
  },
  {
    id: 'BL027',
    query: 'cotton socks knitted ankle length men',
    expected: '6115.95.00',
    chapter: '61',
    heading: '6115',
    category: 'Garments',
    difficulty: 'easy',
    keyDistinction: 'Knitted hosiery → Ch.61'
  },

  // ============================================
  // HARD PRODUCTS (3) - Stress Tests
  // ============================================
  {
    id: 'BL028',
    query: 'air filter element for diesel truck engine',
    expected: '8421.31.00',
    chapter: '84',
    heading: '8421',
    category: 'Vehicle Parts',
    difficulty: 'hard',
    keyDistinction: 'Filters have specific heading in Ch.84'
  },
  {
    id: 'BL029',
    query: 'silicone radiator hose for bus coolant system',
    expected: '8708.91.00',
    chapter: '87',
    heading: '8708',
    category: 'Vehicle Parts',
    difficulty: 'hard',
    keyDistinction: 'GIR 2a: Silicone material → function (radiator parts)'
  },
  {
    id: 'BL030',
    query: 'ibuprofen raw material powder bulk API',
    expected: '2918.99.00',
    chapter: '29',
    heading: '2918',
    category: 'Pharmaceuticals',
    difficulty: 'hard',
    keyDistinction: 'Bulk API (carboxylic acid) → Ch.29'
  }
];

// Export grouped by category for analysis
export const PRODUCTS_BY_CATEGORY = BASELINE_TEST_PRODUCTS.reduce<Record<string, BaselineProduct[]>>((acc, product) => {
  const category = product.category;
  if (!acc[category]) {
    acc[category] = [];
  }
  acc[category]!.push(product);
  return acc;
}, {});

// Export grouped by difficulty
export const PRODUCTS_BY_DIFFICULTY = {
  easy: BASELINE_TEST_PRODUCTS.filter(p => p.difficulty === 'easy'),
  medium: BASELINE_TEST_PRODUCTS.filter(p => p.difficulty === 'medium'),
  hard: BASELINE_TEST_PRODUCTS.filter(p => p.difficulty === 'hard')
};

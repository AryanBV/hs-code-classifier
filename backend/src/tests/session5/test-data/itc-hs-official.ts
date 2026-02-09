/**
 * Session 5: ITC-HS Official Products (20)
 *
 * Products based on official Indian ITC-HS tariff descriptions.
 * These are based on common export items and official classification patterns.
 * Source: Indian Customs Tariff / ITC-HS nomenclature patterns
 */

import { Session5TestProduct } from './types';

export const ITC_HS_OFFICIAL: Session5TestProduct[] = [
  // ============================================
  // PHARMACEUTICAL PRODUCTS (Ch.29/30)
  // ============================================
  {
    id: 'S5-ITC-001',
    query: 'paracetamol tablets 500mg blister pack retail',
    expectedChapter: '30',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Medicaments in dosage form Ch.30'
  },
  {
    id: 'S5-ITC-002',
    query: 'paracetamol powder bulk API pharmaceutical grade',
    expectedChapter: '29',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Bulk APIs (not dosage) Ch.29'
  },
  {
    id: 'S5-ITC-003',
    query: 'ibuprofen raw material powder bulk API',
    expectedChapter: '29',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Bulk organic chemicals Ch.29'
  },

  // ============================================
  // COFFEE PRODUCTS (Ch.09/21)
  // ============================================
  {
    id: 'S5-ITC-004',
    query: 'arabica coffee beans grade A plantation not roasted green',
    expectedChapter: '09',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Raw/green coffee Ch.09'
  },
  {
    id: 'S5-ITC-005',
    query: 'roasted coffee beans whole not ground arabica',
    expectedChapter: '09',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Roasted coffee (not extract) Ch.09'
  },
  {
    id: 'S5-ITC-006',
    query: 'instant coffee powder spray dried soluble',
    expectedChapter: '21',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Coffee extracts Ch.21'
  },
  {
    id: 'S5-ITC-007',
    query: 'coffee concentrate cold brew liquid extract',
    expectedChapter: '21',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Coffee extracts Ch.21'
  },

  // ============================================
  // TEXTILE RAW MATERIALS (Ch.50-55)
  // ============================================
  {
    id: 'S5-ITC-008',
    query: 'raw cotton not carded or combed Indian variety',
    expectedChapter: '52',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Raw cotton Ch.52'
  },
  {
    id: 'S5-ITC-009',
    query: 'polyester filament yarn continuous single high tenacity',
    expectedChapter: '54',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Filament yarn (continuous) Ch.54'
  },
  {
    id: 'S5-ITC-010',
    query: 'polyester staple fiber short cut for spinning',
    expectedChapter: '55',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Staple fiber (short) Ch.55'
  },

  // ============================================
  // LEATHER AND FUR (Ch.42/43)
  // ============================================
  {
    id: 'S5-ITC-011',
    query: 'genuine leather jacket brown mens casual',
    expectedChapter: '42',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Leather articles Ch.42'
  },
  {
    id: 'S5-ITC-012',
    query: 'leather handbag women genuine cowhide',
    expectedChapter: '42',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Leather bags Ch.42'
  },
  {
    id: 'S5-ITC-013',
    query: 'mink fur coat full length ladies luxury',
    expectedChapter: '43',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Furskin articles Ch.43'
  },

  // ============================================
  // METALS (Ch.72/73)
  // ============================================
  {
    id: 'S5-ITC-014',
    query: 'tinplate steel sheets for canning industry coated',
    expectedChapter: '72',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Coated flat steel products Ch.72'
  },
  {
    id: 'S5-ITC-015',
    query: 'stainless steel bolts hexagonal M10 grade A2',
    expectedChapter: '73',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Steel fasteners Ch.73'
  },

  // ============================================
  // MACHINERY (Ch.84/85)
  // ============================================
  {
    id: 'S5-ITC-016',
    query: 'electric motor AC induction 5HP industrial three phase',
    expectedChapter: '85',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Electric motors Ch.85'
  },
  {
    id: 'S5-ITC-017',
    query: 'centrifugal pump water industrial cast iron',
    expectedChapter: '84',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Pumps Ch.84'
  },

  // ============================================
  // FOOD PREPARATIONS (Ch.21)
  // ============================================
  {
    id: 'S5-ITC-018',
    query: 'vitamin C tablets 1000mg food supplement dietary',
    expectedChapter: '21',
    category: 'itc-official',
    difficulty: 'hard',
    source: 'itc-hs-pattern',
    keyDistinction: 'Food supplements Ch.21'
  },
  {
    id: 'S5-ITC-019',
    query: 'tomato ketchup bottled sauce condiment',
    expectedChapter: '21',
    category: 'itc-official',
    difficulty: 'easy',
    source: 'itc-hs-pattern',
    keyDistinction: 'Sauces and condiments Ch.21'
  },

  // ============================================
  // CEMENT (Ch.25/68)
  // ============================================
  {
    id: 'S5-ITC-020',
    query: 'portland cement powder bulk hydraulic binder',
    expectedChapter: '25',
    category: 'itc-official',
    difficulty: 'medium',
    source: 'itc-hs-pattern',
    keyDistinction: 'Raw cement powder Ch.25'
  }
];

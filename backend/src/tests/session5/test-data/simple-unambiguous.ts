/**
 * Session 5: Simple Unambiguous Products (40)
 *
 * Products where classification is OBVIOUS with single correct chapter.
 * Used as sanity checks to verify basic classifier functionality.
 */

import { Session5TestProduct } from './types';

export const SIMPLE_UNAMBIGUOUS: Session5TestProduct[] = [
  // ============================================
  // FOOD & AGRICULTURE (10 products)
  // ============================================
  {
    id: 'S5-SIMP-001',
    query: 'basmati rice long grain 5kg bag',
    expectedChapter: '10',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Cereals always Ch.10'
  },
  {
    id: 'S5-SIMP-002',
    query: 'fresh red apples Shimla variety',
    expectedChapter: '08',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Fresh fruit Ch.08'
  },
  {
    id: 'S5-SIMP-003',
    query: 'black pepper whole dried Malabar grade',
    expectedChapter: '09',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Whole spices Ch.09'
  },
  {
    id: 'S5-SIMP-004',
    query: 'refined white cane sugar crystal',
    expectedChapter: '17',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Sugar Ch.17'
  },
  {
    id: 'S5-SIMP-005',
    query: 'wheat flour all purpose maida',
    expectedChapter: '11',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Flour from cereals Ch.11'
  },
  {
    id: 'S5-SIMP-006',
    query: 'extra virgin olive oil cold pressed 1 liter',
    expectedChapter: '15',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Vegetable oils Ch.15'
  },
  {
    id: 'S5-SIMP-007',
    query: 'green tea leaves loose Darjeeling',
    expectedChapter: '09',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Tea Ch.09'
  },
  {
    id: 'S5-SIMP-008',
    query: 'turmeric powder ground haldi',
    expectedChapter: '09',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Ground spices Ch.09'
  },
  {
    id: 'S5-SIMP-009',
    query: 'fresh raw prawns shrimp frozen',
    expectedChapter: '03',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Crustaceans Ch.03'
  },
  {
    id: 'S5-SIMP-010',
    query: 'milk chocolate bar with almonds',
    expectedChapter: '18',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Chocolate products Ch.18'
  },

  // ============================================
  // TEXTILES (8 products)
  // ============================================
  {
    id: 'S5-SIMP-011',
    query: 'men cotton t-shirt knitted round neck casual',
    expectedChapter: '61',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Knitted garments Ch.61'
  },
  {
    id: 'S5-SIMP-012',
    query: 'women formal cotton shirt woven with collar',
    expectedChapter: '62',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Woven garments Ch.62'
  },
  {
    id: 'S5-SIMP-013',
    query: 'wool sweater knitted pullover hand made',
    expectedChapter: '61',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Knitted sweaters Ch.61'
  },
  {
    id: 'S5-SIMP-014',
    query: 'cotton bed sheet queen size white',
    expectedChapter: '63',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Bed linen Ch.63'
  },
  {
    id: 'S5-SIMP-015',
    query: 'bath towel cotton terry cloth blue',
    expectedChapter: '63',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Towels Ch.63'
  },
  {
    id: 'S5-SIMP-016',
    query: 'cotton socks knitted ankle length mens',
    expectedChapter: '61',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Knitted hosiery Ch.61'
  },
  {
    id: 'S5-SIMP-017',
    query: 'polyester curtains printed home decor',
    expectedChapter: '63',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Curtains Ch.63'
  },
  {
    id: 'S5-SIMP-018',
    query: 'silk saree woven traditional handloom Banarasi',
    expectedChapter: '62',
    category: 'simple',
    difficulty: 'medium',
    source: 'common-knowledge',
    keyDistinction: 'Woven garments Ch.62'
  },

  // ============================================
  // ELECTRONICS & APPLIANCES (7 products)
  // ============================================
  {
    id: 'S5-SIMP-019',
    query: 'laptop computer 15 inch Windows Intel i5',
    expectedChapter: '84',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Computers Ch.84'
  },
  {
    id: 'S5-SIMP-020',
    query: 'smartphone Android 6 inch display 5G',
    expectedChapter: '85',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Telephones Ch.85'
  },
  {
    id: 'S5-SIMP-021',
    query: 'LED television 55 inch smart TV 4K',
    expectedChapter: '85',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Televisions Ch.85'
  },
  {
    id: 'S5-SIMP-022',
    query: 'double door refrigerator frost free 300L',
    expectedChapter: '84',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Refrigerators Ch.84'
  },
  {
    id: 'S5-SIMP-023',
    query: 'front load washing machine automatic 7kg',
    expectedChapter: '84',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Washing machines Ch.84'
  },
  {
    id: 'S5-SIMP-024',
    query: 'microwave oven convection 25 liter stainless',
    expectedChapter: '85',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Microwave ovens Ch.85'
  },
  {
    id: 'S5-SIMP-025',
    query: 'split air conditioner 1.5 ton inverter',
    expectedChapter: '84',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Air conditioners Ch.84'
  },

  // ============================================
  // METALS (5 products)
  // ============================================
  {
    id: 'S5-SIMP-026',
    query: 'stainless steel pipes seamless industrial',
    expectedChapter: '73',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Steel articles Ch.73'
  },
  {
    id: 'S5-SIMP-027',
    query: 'copper wire bare electrical grade',
    expectedChapter: '74',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Copper articles Ch.74'
  },
  {
    id: 'S5-SIMP-028',
    query: 'aluminium sheets plain rolled',
    expectedChapter: '76',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Aluminum articles Ch.76'
  },
  {
    id: 'S5-SIMP-029',
    query: 'gold necklace 22 karat hallmarked jewelry',
    expectedChapter: '71',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Jewelry Ch.71'
  },
  {
    id: 'S5-SIMP-030',
    query: 'iron nails common wire construction',
    expectedChapter: '73',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Iron articles Ch.73'
  },

  // ============================================
  // PLASTICS & RUBBER (5 products)
  // ============================================
  {
    id: 'S5-SIMP-031',
    query: 'PVC pipe rigid 4 inch water supply',
    expectedChapter: '39',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Plastic pipes Ch.39'
  },
  {
    id: 'S5-SIMP-032',
    query: 'plastic bucket 20 liter with handle',
    expectedChapter: '39',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Plastic household articles Ch.39'
  },
  {
    id: 'S5-SIMP-033',
    query: 'rubber gloves industrial heavy duty latex',
    expectedChapter: '40',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Rubber articles Ch.40'
  },
  {
    id: 'S5-SIMP-034',
    query: 'polyethylene shopping bags carry bags',
    expectedChapter: '39',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Plastic bags Ch.39'
  },
  {
    id: 'S5-SIMP-035',
    query: 'natural rubber sheet smoked RSS grade',
    expectedChapter: '40',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Natural rubber Ch.40'
  },

  // ============================================
  // MISCELLANEOUS (5 products)
  // ============================================
  {
    id: 'S5-SIMP-036',
    query: 'wooden dining table teak 6 seater',
    expectedChapter: '94',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Furniture Ch.94'
  },
  {
    id: 'S5-SIMP-037',
    query: 'ballpoint pen blue ink plastic body',
    expectedChapter: '96',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Writing instruments Ch.96'
  },
  {
    id: 'S5-SIMP-038',
    query: 'umbrella folding automatic rain protection',
    expectedChapter: '66',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Umbrellas Ch.66'
  },
  {
    id: 'S5-SIMP-039',
    query: 'wristwatch quartz analog stainless steel',
    expectedChapter: '91',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Watches Ch.91'
  },
  {
    id: 'S5-SIMP-040',
    query: 'acoustic guitar wooden 6 string classical',
    expectedChapter: '92',
    category: 'simple',
    difficulty: 'easy',
    source: 'common-knowledge',
    keyDistinction: 'Musical instruments Ch.92'
  }
];

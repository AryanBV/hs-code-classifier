/**
 * Session 5: Ambiguous Products (15)
 *
 * Products where multiple chapters could be acceptable.
 * For these, both expectedChapter AND alternativeChapters are valid answers.
 * Used to test classifier handling of genuinely ambiguous cases.
 */

import { Session5TestProduct } from './types';

export const AMBIGUOUS_PRODUCTS: Session5TestProduct[] = [
  // ============================================
  // VEHICLE PARTS vs MATERIAL (GIR 2a edge cases)
  // ============================================
  {
    id: 'S5-AMB-001',
    query: 'spark plug for car engine ignition',
    expectedChapter: '85',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.85 (electrical ignition) or Ch.87 (vehicle parts)'
  },
  {
    id: 'S5-AMB-002',
    query: 'car windshield laminated safety glass',
    expectedChapter: '70',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.70 (safety glass) or Ch.87 (vehicle parts)'
  },
  {
    id: 'S5-AMB-003',
    query: 'rubber floor mat for car interior',
    expectedChapter: '40',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.40 (rubber articles) or Ch.87 (vehicle accessory)'
  },
  {
    id: 'S5-AMB-004',
    query: 'motorcycle helmet protective headgear',
    expectedChapter: '65',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.65 (headgear) or Ch.87 (vehicle accessory)'
  },
  {
    id: 'S5-AMB-005',
    query: 'car seat cover leather custom fit',
    expectedChapter: '42',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.42 (leather articles) or Ch.87 (vehicle accessory)'
  },
  {
    id: 'S5-AMB-006',
    query: 'vehicle headlight bulb halogen H4',
    expectedChapter: '85',
    alternativeChapters: ['87'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.85 (electric lamps) or Ch.87 (vehicle parts)'
  },

  // ============================================
  // COMPOSITE/MIXED MATERIALS
  // ============================================
  {
    id: 'S5-AMB-007',
    query: 'silicone sealant tube for construction',
    expectedChapter: '32',
    alternativeChapters: ['39'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.32 (mastics/putty) or Ch.39 (silicone/plastic)'
  },
  {
    id: 'S5-AMB-008',
    query: 'foam mattress memory foam polyurethane',
    expectedChapter: '94',
    alternativeChapters: ['39'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.94 (mattresses) or Ch.39 (cellular plastic)'
  },
  {
    id: 'S5-AMB-009',
    query: 'plastic chair stackable garden outdoor',
    expectedChapter: '94',
    alternativeChapters: ['39'],
    category: 'ambiguous',
    difficulty: 'easy',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.94 (furniture) or Ch.39 (plastic articles)'
  },

  // ============================================
  // TEXTILE CONSTRUCTION AMBIGUITY
  // ============================================
  {
    id: 'S5-AMB-010',
    query: 'sports bra lycra elastic womens fitness',
    expectedChapter: '61',
    alternativeChapters: ['62'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.61 (knitted) or Ch.62 (woven) - depends on construction'
  },
  {
    id: 'S5-AMB-011',
    query: 'canvas tote bag cotton shopping reusable',
    expectedChapter: '42',
    alternativeChapters: ['63'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.42 (bags) or Ch.63 (textile articles)'
  },

  // ============================================
  // ELECTRONICS AMBIGUITY
  // ============================================
  {
    id: 'S5-AMB-012',
    query: 'USB flash drive 64GB data storage',
    expectedChapter: '84',
    alternativeChapters: ['85'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.84 (computer storage) or Ch.85 (electronic)'
  },
  {
    id: 'S5-AMB-013',
    query: 'power bank lithium portable charger 10000mAh',
    expectedChapter: '85',
    alternativeChapters: ['84'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.85 (accumulators) or Ch.84 (computer accessory)'
  },

  // ============================================
  // SPORTS/RECREATION
  // ============================================
  {
    id: 'S5-AMB-014',
    query: 'yoga mat PVC exercise fitness',
    expectedChapter: '95',
    alternativeChapters: ['39'],
    category: 'ambiguous',
    difficulty: 'medium',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.95 (sports equipment) or Ch.39 (plastic sheet)'
  },
  {
    id: 'S5-AMB-015',
    query: 'drone with camera quadcopter aerial photography',
    expectedChapter: '88',
    alternativeChapters: ['85'],
    category: 'ambiguous',
    difficulty: 'hard',
    source: 'classification-ambiguity',
    keyDistinction: 'Ch.88 (aircraft/UAV) or Ch.85 (electronic device)'
  }
];

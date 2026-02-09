// backend/src/eval/test-suites/quick-suite.ts
//
// 20 hand-picked cases for fast feedback (~30 seconds)

import { EvalTestCase } from '../types';

export const quickSuite: EvalTestCase[] = [
  // ---- 5 Easy Classify ----
  {
    id: 'QK-01', query: 'basmati rice long grain 5kg bag',
    source: 'quick', category: 'food_agri',
    expected_routing: 'classify', expected_chapter: '10',
    difficulty: 'easy',
  },
  {
    id: 'QK-02', query: 'men cotton t-shirt knitted round neck casual',
    source: 'quick', category: 'textile',
    expected_routing: 'classify', expected_chapter: '61', expected_heading: '6109',
    difficulty: 'easy',
  },
  {
    id: 'QK-03', query: 'black pepper whole dried Malabar grade',
    source: 'quick', category: 'food_agri',
    expected_routing: 'classify', expected_chapter: '09', expected_heading: '0904',
    difficulty: 'easy',
  },
  {
    id: 'QK-04', query: 'PVC pipe rigid 4 inch water supply',
    source: 'quick', category: 'chemical',
    expected_routing: 'classify', expected_chapter: '39',
    difficulty: 'easy',
  },
  {
    id: 'QK-05', query: 'LED display screen',
    source: 'quick', category: 'electronics',
    expected_routing: 'classify', expected_chapter: '85', expected_heading: '8528',
    difficulty: 'easy',
  },

  // ---- 5 Medium Classify ----
  {
    id: 'QK-06', query: 'ceramic brake pads for heavy trucks',
    source: 'quick', category: 'automotive',
    expected_routing: 'classify', expected_chapter: '87', expected_heading: '8708',
    expected_code: '8708.30.00',
    difficulty: 'medium',
  },
  {
    id: 'QK-07', query: 'instant coffee powder spray dried soluble',
    source: 'quick', category: 'food_agri',
    expected_routing: 'classify', expected_chapter: '21', expected_heading: '2101',
    difficulty: 'medium',
  },
  {
    id: 'QK-08', query: 'portland cement powder bulk hydraulic binder',
    source: 'quick', category: 'chemical',
    expected_routing: 'classify', expected_chapter: '25', expected_heading: '2523',
    difficulty: 'medium',
  },
  {
    id: 'QK-09', query: 'lithium ion battery for laptop',
    source: 'quick', category: 'electronics',
    expected_routing: 'classify', expected_chapter: '85', expected_heading: '8507',
    difficulty: 'medium',
  },
  {
    id: 'QK-10', query: 'electric motor AC induction 5HP industrial three phase',
    source: 'quick', category: 'electronics',
    expected_routing: 'classify', expected_chapter: '85',
    difficulty: 'medium',
  },

  // ---- 5 Hard Classify ----
  {
    id: 'QK-11', query: 'paracetamol powder bulk API pharmaceutical grade',
    source: 'quick', category: 'chemical',
    expected_routing: 'classify', expected_chapter: '29', expected_heading: '2924',
    difficulty: 'hard',
  },
  {
    id: 'QK-12', query: 'mink fur coat full length ladies luxury',
    source: 'quick', category: 'edge_case',
    expected_routing: 'classify', expected_chapter: '43', expected_heading: '4303',
    difficulty: 'hard',
  },
  {
    id: 'QK-13', query: 'polyester filament yarn continuous single high tenacity',
    source: 'quick', category: 'textile',
    expected_routing: 'classify', expected_chapter: '54',
    difficulty: 'hard',
  },
  {
    id: 'QK-14', query: 'polyester staple fiber short cut for spinning',
    source: 'quick', category: 'textile',
    expected_routing: 'classify', expected_chapter: '55',
    difficulty: 'hard',
  },
  {
    id: 'QK-15', query: 'ibuprofen raw material powder bulk API',
    source: 'quick', category: 'chemical',
    expected_routing: 'classify', expected_chapter: '29',
    difficulty: 'hard',
  },

  // ---- 3 Ask Cases ----
  {
    id: 'QK-16', query: 'brake pads',
    source: 'quick', category: 'ambiguous',
    expected_routing: 'ask', difficulty: 'easy',
    expected_ambiguity: 'Missing vehicle type and material',
  },
  {
    id: 'QK-17', query: 'coffee',
    source: 'quick', category: 'ambiguous',
    expected_routing: 'ask', difficulty: 'easy',
    expected_ambiguity: 'Missing processing state (raw, roasted, instant)',
  },
  {
    id: 'QK-18', query: 'filter',
    source: 'quick', category: 'ambiguous',
    expected_routing: 'ask', difficulty: 'easy',
    expected_ambiguity: 'Missing type (air, oil, water, coffee)',
  },

  // ---- 2 Edge Cases ----
  {
    id: 'QK-19', query: 'drone with camera quadcopter aerial photography',
    source: 'quick', category: 'ambiguous',
    expected_routing: 'classify', expected_chapter: '88',
    alternative_chapters: ['85'],
    difficulty: 'hard',
    notes: 'Ch.88 (aircraft/UAV) or Ch.85 (electronic device)',
  },
  {
    id: 'QK-20', query: 'silicone sealant tube for construction',
    source: 'quick', category: 'ambiguous',
    expected_routing: 'classify', expected_chapter: '32',
    alternative_chapters: ['39'],
    difficulty: 'medium',
    notes: 'Ch.32 (mastics/putty) or Ch.39 (silicone/plastic)',
  },
];

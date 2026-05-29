// backend/src/eval/test-suites/master-suite.ts

import { EvalTestCase } from '../types';
import comprehensiveData from '../../tests/test-data/comprehensive-test-set.json';

// ---------------------------------------------------------------------------
// Category normalization
// ---------------------------------------------------------------------------

function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase();

  // Automotive
  if (lower.includes('vehicle') || lower.includes('chapter 87')) return 'automotive';

  // Food & Agriculture
  if (
    lower.includes('coffee') || lower.includes('tea') || lower.includes('spice') ||
    lower.includes('cereal') || lower.includes('rice') || lower.includes('fruit') ||
    lower.includes('vegetable') || lower.includes('fish') || lower.includes('seafood') ||
    lower.includes('sugar') || lower.includes('confection') || lower.includes('milling') ||
    lower.includes('oil seed') || lower.includes('fats') || lower.includes('oils') ||
    lower.includes('beverage') || lower.includes('chapter 03') || lower.includes('chapter 07') ||
    lower.includes('chapter 08') || lower.includes('chapter 09') || lower.includes('chapter 10') ||
    lower.includes('chapter 11') || lower.includes('chapter 12') || lower.includes('chapter 15') ||
    lower.includes('chapter 17') || lower.includes('chapter 19') || lower.includes('chapter 20') ||
    lower.includes('chapter 22')
  ) return 'food_agri';

  // Textile
  if (
    lower.includes('garment') || lower.includes('apparel') || lower.includes('textile') ||
    lower.includes('cotton') || lower.includes('knit') || lower.includes('woven') ||
    lower.includes('chapter 52') || lower.includes('chapter 54') || lower.includes('chapter 55') ||
    lower.includes('chapter 61') || lower.includes('chapter 62')
  ) return 'textile';

  // Chemical (pharmaceuticals, plastics, rubber, chemicals, cement, essential oils)
  if (
    lower.includes('pharma') || lower.includes('chemical') || lower.includes('plastic') ||
    lower.includes('rubber') || lower.includes('cement') || lower.includes('salt') ||
    lower.includes('mineral') || lower.includes('fuel') || lower.includes('essential oil') ||
    lower.includes('perfume') || lower.includes('chapter 25') || lower.includes('chapter 27') ||
    lower.includes('chapter 29') || lower.includes('chapter 30') || lower.includes('chapter 33') ||
    lower.includes('chapter 39') || lower.includes('chapter 40')
  ) return 'chemical';

  // Electronics
  if (
    lower.includes('electr') || lower.includes('chapter 85') ||
    lower.includes('optical') || lower.includes('medical') || lower.includes('chapter 90')
  ) return 'electronics';

  // Metal
  if (
    lower.includes('iron') || lower.includes('steel') || lower.includes('copper') ||
    lower.includes('alumin') || lower.includes('metal') || lower.includes('gem') ||
    lower.includes('jewel') || lower.includes('precious') ||
    lower.includes('chapter 71') || lower.includes('chapter 72') ||
    lower.includes('chapter 73') || lower.includes('chapter 74') || lower.includes('chapter 76')
  ) return 'metal';

  // Machinery
  if (lower.includes('machin') || lower.includes('chapter 84')) return 'electronics';

  // Edge cases
  if (lower.includes('confus') || lower.includes('edge')) return 'edge_case';

  // Wood, paper
  if (lower.includes('wood') || lower.includes('paper') || lower.includes('chapter 44') || lower.includes('chapter 48')) return 'other';

  return 'other';
}

// ---------------------------------------------------------------------------
// Import comprehensive-test-set.json (tier 1 + tier 2 only)
// ---------------------------------------------------------------------------

interface ComprehensiveCase {
  id: string;
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  expected8Digit: string;
  category: string;
  subcategory?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keyDistinction: string;
  source: string;
  notes?: string;
  tier: number;
  expectQuestion?: boolean;
}

const comprehensiveCases: EvalTestCase[] = (comprehensiveData.testCases as ComprehensiveCase[])
  .filter(tc => tc.tier === 1 || tc.tier === 2)
  .map(tc => ({
    id: tc.id,
    query: tc.query,
    source: `comprehensive-tier${tc.tier}`,
    category: normalizeCategory(tc.category),
    expected_routing: tc.expectQuestion ? 'ask' as const : 'classify' as const,
    expected_chapter: tc.expectedChapter,
    expected_heading: tc.expectedHeading,
    expected_code: tc.expected8Digit,
    difficulty: tc.difficulty,
    tier: tc.tier as 1 | 2 | 3,
    notes: tc.notes || tc.keyDistinction,
  }));

// ---------------------------------------------------------------------------
// Supplemental: Session5 unique cases (not in comprehensive set)
// ---------------------------------------------------------------------------

// Helper to check if a query already exists (case-insensitive prefix match)
const comprehensiveQueries = new Set(
  comprehensiveCases.map(c => c.query.toLowerCase().trim().substring(0, 30))
);

function isUnique(query: string): boolean {
  return !comprehensiveQueries.has(query.toLowerCase().trim().substring(0, 30));
}

// Session5 Ambiguous (15 cases) — all unique, have alternativeChapters
const ambiguousCases: EvalTestCase[] = [
  { id: 'S5-AMB-001', query: 'spark plug for car engine ignition', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8511', expected_code: '8511.10.00', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.85 (electrical ignition) or Ch.87 (vehicle parts)' },
  { id: 'S5-AMB-002', query: 'car windshield laminated safety glass', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '70', expected_heading: '7007', expected_code: '7007.21.90', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.70 (safety glass) or Ch.87 (vehicle parts)' },
  { id: 'S5-AMB-003', query: 'rubber floor mat for car interior', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '40', expected_heading: '4013', expected_code: '4013.10.10', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.40 (rubber articles) or Ch.87 (vehicle accessory)' },
  { id: 'S5-AMB-004', query: 'motorcycle helmet protective headgear', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '65', expected_heading: '6506', expected_code: '6506.10.20', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.65 (headgear) or Ch.87 (vehicle accessory)' },
  { id: 'S5-AMB-005', query: 'car seat cover leather custom fit', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '42', expected_heading: '4201', expected_code: '4201.00.00', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.42 (leather articles) or Ch.87 (vehicle accessory)' },
  { id: 'S5-AMB-006', query: 'vehicle headlight bulb halogen H4', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8539', expected_code: '8539.21.10', alternative_chapters: ['87'], difficulty: 'medium', notes: 'Ch.85 (electric lamps) or Ch.87 (vehicle parts)' },
  { id: 'S5-AMB-007', query: 'silicone sealant tube for construction', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '32', expected_heading: '3214', expected_code: '3214.90.10', alternative_chapters: ['39'], difficulty: 'medium', notes: 'Ch.32 (mastics/putty) or Ch.39 (silicone/plastic)' },
  { id: 'S5-AMB-008', query: 'foam mattress memory foam polyurethane', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '94', expected_heading: '9404', expected_code: '9404.29.20', alternative_chapters: ['39'], difficulty: 'medium', notes: 'Ch.94 (mattresses) or Ch.39 (cellular plastic)' },
  { id: 'S5-AMB-009', query: 'plastic chair stackable garden outdoor', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '94', alternative_chapters: ['39'], difficulty: 'easy', notes: 'Ch.94 (furniture) or Ch.39 (plastic articles)' },
  { id: 'S5-AMB-010', query: 'sports bra lycra elastic womens fitness', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '61', expected_heading: '6104', expected_code: '6104.43.00', alternative_chapters: ['62'], difficulty: 'medium', notes: 'Ch.61 (knitted) or Ch.62 (woven) - depends on construction' },
  { id: 'S5-AMB-011', query: 'canvas tote bag cotton shopping reusable', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '42', expected_heading: '4202', expected_code: '4202.22.20', alternative_chapters: ['63'], difficulty: 'medium', notes: 'Ch.42 (bags) or Ch.63 (textile articles)' },
  { id: 'S5-AMB-012', query: 'USB flash drive 64GB data storage', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '84', alternative_chapters: ['85'], difficulty: 'medium', notes: 'Ch.84 (computer storage) or Ch.85 (electronic)' },
  { id: 'S5-AMB-013', query: 'power bank lithium portable charger 10000mAh', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8513', expected_code: '8513.10.90', alternative_chapters: ['84'], difficulty: 'medium', notes: 'Ch.85 (accumulators) or Ch.84 (computer accessory)' },
  { id: 'S5-AMB-014', query: 'yoga mat PVC exercise fitness', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '95', expected_heading: '9506', expected_code: '9506.99.20', alternative_chapters: ['39'], difficulty: 'medium', notes: 'Ch.95 (sports equipment) or Ch.39 (plastic sheet)' },
  { id: 'S5-AMB-015', query: 'drone with camera quadcopter aerial photography', source: 'session5-ambiguous', category: 'ambiguous', expected_routing: 'classify', expected_chapter: '88', expected_heading: '8806', expected_code: '8806.22.00', alternative_chapters: ['85'], difficulty: 'hard', notes: 'Ch.88 (aircraft/UAV) or Ch.85 (electronic device)' },
];

// Session5 Automotive unique cases (not in comprehensive)
const automotiveSupplemental: EvalTestCase[] = [
  { id: 'S5-AUTO-002', query: 'brake drum cast iron for Tata truck rear axle', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8709', expected_code: '8708.30.00', difficulty: 'medium', notes: 'GIR 2a: cast iron -> function (brake drum)' },
  { id: 'S5-AUTO-003', query: 'disc brake rotor ventilated for passenger car', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8713', expected_code: '8708.30.00', difficulty: 'medium', notes: 'GIR 2a: steel rotor -> function (brakes)' },
  { id: 'S5-AUTO-005', query: 'piston rings chrome plated for diesel engine truck', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8706', expected_code: '8706.00.42', difficulty: 'hard', notes: 'GIR 2a: metal rings -> function (engine parts)' },
  { id: 'S5-AUTO-006', query: 'cylinder head gasket multi-layer steel for car engine', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', difficulty: 'hard', notes: 'GIR 2a: gasket -> function (engine seal)' },
  { id: 'S5-AUTO-010', query: 'side mirror assembly with glass for Hyundai i20', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', difficulty: 'medium', notes: 'GIR 2a: glass/plastic -> function (vehicle accessory)' },
  { id: 'S5-AUTO-011', query: 'car door handle chrome plated exterior', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', difficulty: 'medium', notes: 'GIR 2a: metal -> function (door parts)' },
  { id: 'S5-AUTO-012', query: 'coil spring suspension front for SUV', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8705', expected_code: '8705.20.00', difficulty: 'medium', notes: 'GIR 2a: steel spring -> function (suspension)' },
  { id: 'S5-AUTO-014', query: 'steering rack assembly hydraulic for sedan', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8715', expected_code: '8715.00.20', difficulty: 'medium', notes: 'GIR 2a: mechanical assembly -> function (steering)' },
  { id: 'S5-AUTO-015', query: 'clutch plate friction disc for Mahindra pickup', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8709', expected_code: '8708.93.00', difficulty: 'medium', notes: 'GIR 2a: friction material -> function (clutch)' },
  { id: 'S5-AUTO-016', query: 'drive shaft propeller shaft for truck', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', expected_heading: '8709', expected_code: '8709.90.00', difficulty: 'medium', notes: 'GIR 2a: steel shaft -> function (transmission)' },
  { id: 'S5-AUTO-020', query: 'oil filter cartridge for petrol engine car', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '84', expected_heading: '8408', expected_code: '8421.23.00', difficulty: 'hard', notes: 'Exception: Filters have specific heading 8421 in Ch.84' },
  { id: 'S5-AUTO-021', query: 'motorcycle tyre 120/80-17 tubeless radial', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '40', expected_heading: '4013', expected_code: '4013.90.20', difficulty: 'easy', notes: 'Exception: Tyres have specific heading 4011 in Ch.40' },
  { id: 'S5-AUTO-022', query: 'alternator 12V 100A for car engine', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8511', expected_code: '8502.13.60', difficulty: 'medium', notes: 'Electrical generators -> Ch.85 (specific heading 8511)' },
  { id: 'S5-AUTO-023', query: 'starter motor 12V for diesel truck', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8511', expected_code: '8511.40.00', difficulty: 'medium', notes: 'Electric motors -> Ch.85 (specific heading 8511)' },
  { id: 'S5-AUTO-024', query: 'wiper blade rubber refill for SUV windshield', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '87', difficulty: 'easy', notes: 'GIR 2a: rubber -> function (vehicle accessory)' },
  { id: 'S5-AUTO-025', query: 'timing belt rubber reinforced for Honda engine', source: 'session5-automotive', category: 'automotive', expected_routing: 'classify', expected_chapter: '40', expected_heading: '4010', expected_code: '4010.11.10', difficulty: 'medium', notes: 'Transmission belts have specific heading 4010 in Ch.40' },
];

// Session5 Simple unique cases (many overlap, include only truly unique ones)
const simpleSupplemental: EvalTestCase[] = [
  { id: 'S5-SIMP-002', query: 'fresh red apples Shimla variety', source: 'session5-simple', category: 'food_agri', expected_routing: 'classify', expected_chapter: '08', expected_heading: '0808', expected_code: '0808.10.00', difficulty: 'easy', notes: 'Fresh fruit Ch.08' },
  { id: 'S5-SIMP-004', query: 'refined white cane sugar crystal', source: 'session5-simple', category: 'food_agri', expected_routing: 'classify', expected_chapter: '17', expected_heading: '1701', expected_code: '1701.91.00', difficulty: 'easy', notes: 'Sugar Ch.17' },
  { id: 'S5-SIMP-005', query: 'wheat flour all purpose maida', source: 'session5-simple', category: 'food_agri', expected_routing: 'classify', expected_chapter: '11', expected_heading: '1101', expected_code: '1101.00.00', difficulty: 'easy', notes: 'Flour from cereals Ch.11' },
  { id: 'S5-SIMP-009', query: 'fresh raw prawns shrimp frozen', source: 'session5-simple', category: 'food_agri', expected_routing: 'classify', expected_chapter: '03', expected_heading: '0304', expected_code: '0306.17.50', difficulty: 'easy', notes: 'Crustaceans Ch.03' },
  { id: 'S5-SIMP-010', query: 'milk chocolate bar with almonds', source: 'session5-simple', category: 'food_agri', expected_routing: 'classify', expected_chapter: '18', expected_heading: '1806', expected_code: '1806.31.00', difficulty: 'easy', notes: 'Chocolate products Ch.18' },
  { id: 'S5-SIMP-014', query: 'cotton bed sheet queen size white', source: 'session5-simple', category: 'textile', expected_routing: 'classify', expected_chapter: '63', expected_heading: '6302', expected_code: '6302.10.10', difficulty: 'easy', notes: 'Bed linen Ch.63' },
  { id: 'S5-SIMP-015', query: 'bath towel cotton terry cloth blue', source: 'session5-simple', category: 'textile', expected_routing: 'classify', expected_chapter: '63', expected_heading: '6301', expected_code: '6301.30.00', difficulty: 'easy', notes: 'Towels Ch.63' },
  { id: 'S5-SIMP-017', query: 'polyester curtains printed home decor', source: 'session5-simple', category: 'textile', expected_routing: 'classify', expected_chapter: '63', expected_heading: '6303', expected_code: '6303.99.10', difficulty: 'easy', notes: 'Curtains Ch.63' },
  { id: 'S5-SIMP-019', query: 'laptop computer 15 inch Windows Intel i5', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '84', difficulty: 'easy', notes: 'Computers Ch.84' },
  { id: 'S5-SIMP-020', query: 'smartphone Android 6 inch display 5G', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '85', difficulty: 'easy', notes: 'Telephones Ch.85' },
  { id: 'S5-SIMP-021', query: 'LED television 55 inch smart TV 4K', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8524', expected_code: '8524.92.90', difficulty: 'easy', notes: 'Televisions Ch.85' },
  { id: 'S5-SIMP-022', query: 'double door refrigerator frost free 300L', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '84', expected_heading: '8418', expected_code: '8418.30.90', difficulty: 'easy', notes: 'Refrigerators Ch.84' },
  { id: 'S5-SIMP-023', query: 'front load washing machine automatic 7kg', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '84', expected_heading: '8450', expected_code: '8450.11.00', difficulty: 'easy', notes: 'Washing machines Ch.84' },
  { id: 'S5-SIMP-024', query: 'microwave oven convection 25 liter stainless', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '85', expected_heading: '8514', expected_code: '8514.11.00', difficulty: 'easy', notes: 'Microwave ovens Ch.85' },
  { id: 'S5-SIMP-025', query: 'split air conditioner 1.5 ton inverter', source: 'session5-simple', category: 'electronics', expected_routing: 'classify', expected_chapter: '84', expected_heading: '8415', expected_code: '8415.81.10', difficulty: 'easy', notes: 'Air conditioners Ch.84' },
  { id: 'S5-SIMP-029', query: 'gold necklace 22 karat hallmarked jewelry', source: 'session5-simple', category: 'metal', expected_routing: 'classify', expected_chapter: '71', expected_heading: '7108', expected_code: '7108.12.10', difficulty: 'easy', notes: 'Jewelry Ch.71' },
  { id: 'S5-SIMP-032', query: 'plastic bucket 20 liter with handle', source: 'session5-simple', category: 'chemical', expected_routing: 'classify', expected_chapter: '39', expected_heading: '3924', expected_code: '3925.10.00', difficulty: 'easy', notes: 'Plastic household articles Ch.39' },
  { id: 'S5-SIMP-033', query: 'rubber gloves industrial heavy duty latex', source: 'session5-simple', category: 'chemical', expected_routing: 'classify', expected_chapter: '40', expected_heading: '4015', expected_code: '4015.90.30', difficulty: 'easy', notes: 'Rubber articles Ch.40' },
  { id: 'S5-SIMP-034', query: 'polyethylene shopping bags carry bags', source: 'session5-simple', category: 'chemical', expected_routing: 'classify', expected_chapter: '39', expected_heading: '3923', expected_code: '3923.21.00', difficulty: 'easy', notes: 'Plastic bags Ch.39' },
  { id: 'S5-SIMP-036', query: 'wooden dining table teak 6 seater', source: 'session5-simple', category: 'other', expected_routing: 'classify', expected_chapter: '94', difficulty: 'easy', notes: 'Furniture Ch.94' },
  { id: 'S5-SIMP-037', query: 'ballpoint pen blue ink plastic body', source: 'session5-simple', category: 'other', expected_routing: 'classify', expected_chapter: '96', expected_heading: '9608', expected_code: '9608.10.11', difficulty: 'easy', notes: 'Writing instruments Ch.96' },
  { id: 'S5-SIMP-038', query: 'umbrella folding automatic rain protection', source: 'session5-simple', category: 'other', expected_routing: 'classify', expected_chapter: '66', expected_heading: '6601', expected_code: '6601.10.00', difficulty: 'easy', notes: 'Umbrellas Ch.66' },
  { id: 'S5-SIMP-039', query: 'wristwatch quartz analog stainless steel', source: 'session5-simple', category: 'other', expected_routing: 'classify', expected_chapter: '91', expected_heading: '9101', expected_code: '9101.21.00', difficulty: 'easy', notes: 'Watches Ch.91' },
  { id: 'S5-SIMP-040', query: 'acoustic guitar wooden 6 string classical', source: 'session5-simple', category: 'other', expected_routing: 'classify', expected_chapter: '92', expected_heading: '9202', expected_code: '9202.10.00', difficulty: 'easy', notes: 'Musical instruments Ch.92' },
];

// ---------------------------------------------------------------------------
// "Ask" cases — should trigger clarifying questions
// ---------------------------------------------------------------------------

const askCases: EvalTestCase[] = [
  // From integration-test.ts (3 cases)
  { id: 'ASK-001', query: 'brake pads', source: 'integration-test', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing vehicle type and material' },
  { id: 'ASK-002', query: 'coffee', source: 'integration-test', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing processing state (raw, roasted, instant)' },
  { id: 'ASK-003', query: 'filter', source: 'integration-test', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing type (air, oil, water, coffee)' },
  // Hand-written generic queries
  { id: 'ASK-004', query: 'metal parts', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing material type, form, function' },
  { id: 'ASK-005', query: 'rubber', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing form (raw, sheet, tube, article)' },
  { id: 'ASK-006', query: 'gloves', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing material (rubber, textile, leather) and use' },
  { id: 'ASK-007', query: 'steel', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing form (flat, long, articles)' },
  { id: 'ASK-008', query: 'tablets', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing type (pharmaceutical, electronic, stone)' },
  { id: 'ASK-009', query: 'oil', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing type (vegetable, mineral, essential, petroleum)' },
  { id: 'ASK-010', query: 'wire', source: 'hand-written', category: 'ambiguous', expected_routing: 'ask', difficulty: 'easy', expected_ambiguity: 'Missing material (copper, steel, aluminium) and use' },
];

// ---------------------------------------------------------------------------
// "Ask" cases v2 — single-word ambiguous (should trigger clarifying questions)
// ---------------------------------------------------------------------------

const askCasesSingleWord: EvalTestCase[] = [
  { id: 'ASK-011', query: 'rings', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be jewelry (Ch.71), piston rings (Ch.87), rubber seals (Ch.40), or iron/steel (Ch.73)' },
  { id: 'ASK-012', query: 'tubes', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be rubber (Ch.40), plastic (Ch.39), metal (Ch.73/76), or glass (Ch.70)' },
  { id: 'ASK-013', query: 'valves', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be taps/valves (Ch.84), vehicle engine (Ch.87), or rubber (Ch.40)' },
  { id: 'ASK-014', query: 'filters', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be filtering machinery (Ch.84), vehicle (Ch.87), or coffee (Ch.84)' },
  { id: 'ASK-015', query: 'springs', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be vehicle suspension (Ch.87), iron/steel (Ch.73), or mattress (Ch.94)' },
  { id: 'ASK-016', query: 'cord', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be textile (Ch.56), rubber (Ch.40), or electrical (Ch.85)' },
  { id: 'ASK-017', query: 'tape', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be adhesive (Ch.39), insulating (Ch.85), textile (Ch.58), or magnetic (Ch.85)' },
  { id: 'ASK-018', query: 'brush', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be paint brush (Ch.96), hair brush (Ch.96), or industrial (Ch.84)' },
  { id: 'ASK-019', query: 'caps', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be headwear (Ch.65), bottle caps (Ch.83), or plastic closures (Ch.39)' },
  { id: 'ASK-020', query: 'plate', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'hard', expected_ambiguity: 'Could be steel plate (Ch.72), ceramic plate (Ch.69), or tableware (Ch.69/73)' },
];

// ---------------------------------------------------------------------------
// "Ask" cases v2 — multi-word ambiguous (still insufficient for classification)
// ---------------------------------------------------------------------------

const askCasesMultiWord: EvalTestCase[] = [
  { id: 'ASK-021', query: 'rubber product for industrial use', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing specific product form (hose, seal, sheet, belt)' },
  { id: 'ASK-022', query: 'steel component', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing form (flat, long, pipe, fastener) and use' },
  { id: 'ASK-023', query: 'plastic container', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing specific type (bottle, box, drum) and use' },
  { id: 'ASK-024', query: 'electronic device', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing specific device type (phone, computer, sensor)' },
  { id: 'ASK-025', query: 'leather item for export', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing specific product (bag, belt, garment, wallet)' },
  { id: 'ASK-026', query: 'machine parts', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing machine type and specific part' },
  { id: 'ASK-027', query: 'chemical compound', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing compound type (organic, inorganic, pharmaceutical)' },
  { id: 'ASK-028', query: 'glass product', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing form (sheet, bottle, fiber, optical)' },
  { id: 'ASK-029', query: 'ceramic article', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing type (tableware, sanitary, industrial, decorative)' },
  { id: 'ASK-030', query: 'textile material', source: 'hand-written-ask-v2', category: 'ambiguous', expected_routing: 'ask', difficulty: 'medium', expected_ambiguity: 'Missing fiber type, form (yarn, fabric, garment), and construction' },
];

// ---------------------------------------------------------------------------
// "Reject" cases — nonsense/spam that should be rejected
// ---------------------------------------------------------------------------

const rejectCases: EvalTestCase[] = [
  { id: 'REJ-001', query: 'asdfghjkl', source: 'hand-written-ask-v2', category: 'edge_case', expected_routing: 'reject', difficulty: 'easy', notes: 'Keyboard mash - no product' },
  { id: 'REJ-002', query: 'hello how are you', source: 'hand-written-ask-v2', category: 'edge_case', expected_routing: 'reject', difficulty: 'easy', notes: 'Conversational - no product' },
  { id: 'REJ-003', query: 'buy 1 get 1 free', source: 'hand-written-ask-v2', category: 'edge_case', expected_routing: 'reject', difficulty: 'easy', notes: 'Marketing text - no product' },
  { id: 'REJ-004', query: 'best price please contact', source: 'hand-written-ask-v2', category: 'edge_case', expected_routing: 'reject', difficulty: 'easy', notes: 'Sales inquiry - no product' },
  { id: 'REJ-005', query: '\u{1F389}\u{1F38A}\u{1F388}', source: 'hand-written-ask-v2', category: 'edge_case', expected_routing: 'reject', difficulty: 'easy', notes: 'Emoji-only - no product' },
];

// ---------------------------------------------------------------------------
// Ground truth confidence flags
// ---------------------------------------------------------------------------

const CONFIDENCE_OVERRIDES: Record<string, 'high' | 'medium' | 'low'> = {
  // High confidence (7): well-known, unambiguous HS codes
  'S5-SIMP-002': 'high',   // fresh red apples -> Ch.08
  'S5-SIMP-004': 'high',   // refined white cane sugar -> Ch.17
  'S5-SIMP-005': 'high',   // wheat flour maida -> Ch.11
  'S5-SIMP-019': 'high',   // laptop computer -> Ch.84
  'S5-SIMP-020': 'high',   // smartphone -> Ch.85
  'S5-SIMP-029': 'high',   // gold necklace 22k -> Ch.71
  'S5-SIMP-040': 'high',   // acoustic guitar -> Ch.92
  // Medium confidence (7): plausible but could have edge-case interpretations
  'S5-AMB-001': 'medium',  // spark plug -> Ch.85 (could be argued Ch.87)
  'S5-AMB-003': 'medium',  // rubber floor mat -> Ch.40 (could be Ch.87)
  'S5-AMB-007': 'medium',  // silicone sealant -> Ch.32 (could be Ch.39)
  'S5-AMB-008': 'medium',  // foam mattress -> Ch.94 (could be Ch.39)
  'S5-AMB-012': 'medium',  // USB flash drive -> Ch.84 (could be Ch.85)
  'S5-AUTO-020': 'medium', // oil filter cartridge -> Ch.84 (exception)
  'S5-AUTO-025': 'medium', // timing belt rubber -> Ch.40 (exception)
  // Low confidence (6): ground truth might need revision
  'S5-AMB-004': 'low',     // motorcycle helmet -> Ch.65 (debatable vs Ch.87)
  'S5-AMB-005': 'low',     // car seat cover leather -> Ch.42 (debatable vs Ch.87)
  'S5-AMB-010': 'low',     // sports bra lycra -> Ch.61 (assumes knitted, could be woven)
  'S5-AMB-014': 'low',     // yoga mat PVC -> Ch.95 (debatable vs Ch.39)
  'S5-AMB-015': 'low',     // drone with camera -> Ch.88 (debatable vs Ch.85)
  'S5-AUTO-022': 'low',    // alternator 12V -> Ch.85 (heading 8511 is specific)
};

function applyConfidenceOverrides(cases: EvalTestCase[]): EvalTestCase[] {
  return cases.map(tc => {
    const confidence = CONFIDENCE_OVERRIDES[tc.id];
    return confidence ? { ...tc, ground_truth_confidence: confidence } : tc;
  });
}

// ---------------------------------------------------------------------------
// Gold-answer remediation overrides (2026-05-28)
// ---------------------------------------------------------------------------
//
// A full-suite consistency audit (src/eval/gold-consistency-audit.ts) found that
// the hand-authored S5-* block and some LLM-seeded comprehensive (TC*/EC*) cases
// had gold codes that mapped to the WRONG product, or expected_heading/chapter
// placeholders that contradicted the code. Because ~296 of the 386 cases are
// sourced from comprehensive-test-set.json (which is owned by a different agent),
// ALL corrections are applied here as a single override layer keyed by case id.
//
// Each override carries the corrected 8-digit `code` plus a `reason`. The applier
// re-derives expected_chapter = code[0:2] and expected_heading = code[0:4] so the
// three fields are always mutually consistent. Every code below was verified to
// exist in tariff_lines and re-derived via tariff_lines.description + HS GIRs.
// Full evidence: src/eval/GOLD-REMEDIATION-LOG.md.
interface GoldOverride {
  code: string;       // corrected 8-digit tariff line ('NNNN.NN.NN'), verified in DB
  reason: string;
  confidence?: 'high' | 'medium' | 'low';
}

const GOLD_OVERRIDES: Record<string, GoldOverride> = {
  // ── Comprehensive (JSON-sourced) wrong-code fixes ──
  TC103: { code: '0901.21.90', reason: 'Roasted coffee beans: 0901.11 is "not roasted"; roasted not-decaf coffee = 0901.21. Old 0901.11.44 = Rob cherry (raw).' },
  TC109: { code: '0910.30.20', reason: 'Turmeric fingers whole DRIED -> 0910.30.20 "Dried". Old 0910.30.10 = "Fresh".' },
  TC110: { code: '0910.30.30', reason: 'Turmeric POWDER ground -> 0910.30.30 "Powder". Old 0910.30.20 = "Dried".' },
  TC114: { code: '0907.10.20', reason: 'Whole dried cloves (flower buds) -> 0907.10.20 "Not Extracted (other than stem)". Old 0907.10.30 = "Stem".' },
  TC206: { code: '2942.00.12', reason: 'Ibuprofen bulk API powder -> 2942.00.12 "Ibuprofane" (Ch.29 organic compound). Old 2918.11.10 = Lactic acid.' },
  TC303: { code: '6205.20.90', reason: "Men's formal woven cotton shirt -> 6205.20.90 'Other'. Old 6205.20.10 = 'Handloom' (unwarranted)." },
  TC308: { code: '6112.12.00', reason: 'Polyester knitted tracksuit -> 6112.12.00 "Track suits: synthetic fibres". Old 6112.31.00 = mens swimwear.' },
  EC017: { code: '5503.30.90', reason: 'Acrylic staple fibre -> 5503.30.90 (acrylic/modacrylic, Other). Old 5503.11.10 = Aramid.' },
  EC019: { code: '4203.10.90', reason: "Men's long leather coat -> 4203.10.90 (apparel, Other). Old 4203.40.20 = clothing accessories (wrong subheading)." },
  EC021: { code: '4203.29.20', reason: 'Winter lined leather gloves -> 4203.29.20 "Other gloves". Old 4203.21.20 = sports gloves (mittens).' },
  EC023: { code: '6203.32.90', reason: "Men's woven cotton jacket -> 6203.32.90 'Other'. Old 6203.32.00 not in DB (subheading splits .10/.90)." },
  EC024: { code: '6201.40.90', reason: 'Nylon windbreaker/anorak (man-made) -> 6201.40.90 "Other". Old 6201.40.10 = overcoats/raincoats.' },
  EC028: { code: '6205.20.90', reason: "Men's formal woven cotton dress shirt -> 6205.20.90 'Other'. Old 6205.20.10 = 'Handloom'." },
  EC031: { code: '0901.21.90', reason: 'Roasted ground coffee -> 0901.21.90 (roasted, not decaf, Other). Old 0901.11.32 = not-roasted Rob parchment.' },
  EC032: { code: '0901.22.90', reason: 'Roasted + decaffeinated coffee -> 0901.22.90. Old 0901.11.44 = not roasted/not decaf.' },
  EC034: { code: '2101.11.90', reason: 'r4(2026-05-29): cold-brew coffee CONCENTRATE (no added ingredients) = extract/essence/concentrate of coffee -> 2101.11; .90 Other. 2101.12 is for PREPARATIONS with a basis of coffee (added ingredients). Supersedes prior-round 2101.12.00; now consistent with TC106 (also 2101.11.90). blind-law-verified (2 independent raters agree), user-approved.' },
  EC035: { code: '0901.21.90', reason: 'Espresso capsules (ground roasted coffee) -> 0901.21.90. Old 0901.90.10 = coffee husks/skins.' },
  EC003: { code: '4303.10.90', reason: 'r3(2026-05-29): farmed rabbit fur JACKET = article of apparel -> 4303.10.90 (apparel/accessories, Other). Corrects prior-round 4303.90.90 which is the residual "Other articles" line, not apparel; 4303.10 is eo nomine for apparel of furskin (GIR-1). blind-law-verified.' },
  EC010: { code: '8007.00.90', reason: 'Tin foil wrapping -> 8007.00.90 "Other" (article of tin). Old 8007.00.10 = "Blanks".' },
  EC041: { code: '3917.23.10', reason: 'Rigid PVC water-supply pipe -> 3917.23.10 (rigid, of vinyl chloride polymers, seamless). Old 3917.31.00 = flexible.' },
  EC042: { code: '3923.30.90', reason: 'Food-grade HDPE container -> 3923.30.90 "Other". Old 3923.30.10 = "Insulated ware".' },

  // ── Session5 automotive (inline) ──
  'S5-AUTO-002': { code: '8708.30.00', reason: 'Brake drum is a brake part -> 8708.30.00. Code already correct; expected_heading was placeholder 8709 -> 8708.' },
  'S5-AUTO-003': { code: '8708.30.00', reason: 'Disc brake rotor -> 8708.30.00. Code already correct; expected_heading placeholder 8713 -> 8708.' },
  'S5-AUTO-005': { code: '8409.99.13', reason: 'Piston rings -> 8409.99.13 (engine parts, piston rings). Old 8706.00.42 = chassis fitted with engines.' },
  'S5-AUTO-012': { code: '7320.20.00', reason: 'r4(2026-05-29): vehicle coil spring = helical spring of base metal -> 7320.20.00. Section XV Note 2(c) lists hdg 7320 (springs) as a "part of general use"; Section XVII Note 2(b) excludes parts of general use of base metal from Ch.87 -> NOT 8708.80 (suspension). Supersedes prior-round 8708.80.00. blind-law-verified (2 independent raters agree), user-approved.' },
  'S5-AUTO-014': { code: '8708.94.00', reason: 'Steering rack -> 8708.94.00 (steering wheels/columns/boxes). Old 8715.00.20 = baby carriages.' },
  'S5-AUTO-015': { code: '8708.93.00', reason: 'Clutch plate -> 8708.93.00 (clutches). Code already correct; expected_heading placeholder 8709 -> 8708.' },
  'S5-AUTO-016': { code: '8708.50.00', reason: 'Drive/propeller shaft -> 8708.50.00 (drive-axles & transmission components). Old 8709.90.00 = works-truck parts.' },
  'S5-AUTO-020': { code: '8421.23.00', reason: 'Oil filter for engine -> 8421.23.00. Code already correct; expected_heading placeholder 8408 -> 8421.' },
  'S5-AUTO-021': { code: '4011.40.10', reason: 'Motorcycle tyre -> 4011.40.10 (new pneumatic tyres, motorcycles). Old 4013.90.20 = inner tubes.' },
  'S5-AUTO-022': { code: '8511.50.00', reason: 'Car alternator -> 8511.50.00 (other generators for engines). Old 8502.13.60 = gensets >10000 kVA.' },

  // ── Session5 ambiguous (inline) ──
  'S5-AMB-003': { code: '4016.91.00', reason: 'Rubber car floor mat -> 4016.91.00 (floor coverings/mats of rubber). Old 4013.10.10 = inner tubes.' },
  'S5-AMB-005': { code: '4205.00.90', reason: 'Leather car seat cover -> 4205.00.90 (other articles of leather). Old 4201.00.00 = animal saddlery/harness.' },
  'S5-AMB-008': { code: '9404.21.90', reason: 'r3(2026-05-29): memory-foam PU mattress = mattress of CELLULAR plastics -> 9404.21.90 (Mattresses: of cellular rubber or plastics, Of Plastic). Corrects prior-round 9404.29.90 (other mattresses); WCO 9404.21 is the eo nomine cellular-plastics mattress subheading (GIR-1/GIR-6). blind-law-verified.' },
  'S5-AMB-010': { code: '6212.10.00', reason: 'Sports bra (brassiere) -> 6212.10.00 (heading 6212 covers brassieres knitted or not). Old 6104.43.00 = dresses. alternative_chapters already lists 62.' },
  'S5-AMB-013': { code: '8507.60.00', reason: 'Lithium power bank -> 8507.60.00 (lithium-ion accumulator). Old 8513.10.90 = portable electric lamps.' },
  'S5-AMB-014': { code: '9506.99.90', reason: 'PVC yoga/exercise mat -> 9506.99.90 "Other" (general exercise equipment). Old 9506.99.20 = cricket leg pads/bats.' },

  // ── Session5 simple (inline) ──
  'S5-SIMP-009': { code: '0306.17.90', reason: 'Frozen shrimps/prawns, species unspecified -> 0306.17.90 "Other". Old 0306.17.50 = "Flower shrimp" (arbitrary species); expected_heading 0304 also wrong.' },
  'S5-SIMP-021': { code: '8528.72.17', reason: 'r8(2026-05-29): 55" approx 140cm > 105cm -> size-band leaf 8528.72.17 is more specific than residual .19 per GIR-6. (Prior remediation had set .19 Other; old 8524.92.90 = bare display module.)' },
  'S5-SIMP-022': { code: '8418.10.90', reason: 'Double-door (combined) household refrigerator -> 8418.10.90. Old 8418.30.90 = chest-type freezer.' },
  'S5-SIMP-032': { code: '3924.90.90', reason: 'Plastic bucket 20L household -> 3924.90.90 (household articles of plastic, Other). Old 3925.10.00 = tanks/reservoirs >300L.' },
  'S5-SIMP-037': { code: '9608.10.19', reason: 'Ordinary blue-ink plastic ballpoint -> 9608.10.19 "Other". Old 9608.10.11 = high-value pens (US$100+).' },
  'S5-SIMP-039': { code: '9102.11.00', reason: 'Quartz steel wristwatch -> 9102.11.00 (electrically operated, base-metal case). Old 9101.21.00 = precious-metal case + automatic winding.' },
  'S5-SIMP-040': { code: '9202.90.00', reason: 'Acoustic guitar (plucked) -> 9202.90.00 "Other". Old 9202.10.00 = "Played with a bow".' },

  // ── r8 forensics corrections (2026-05-29, user-approved; each independently legally verified, law-first) ──
  'S5-SIMP-024': { code: '8516.50.00', reason: 'r8: microwave oven -> 8516.50.00 (eo nomine "Microwave ovens"). Old 8514.11.00 = industrial hot isostatic presses (GIR-1).' },
  'S5-SIMP-029': { code: '7113.19.11', reason: 'r8: 22k gold necklace = article of jewellery -> 7113.19.11 (of gold, unstudded). Old 7108.12.10 = unwrought gold bullion (Ch.71 Note 9).' },
  TC101: { code: '0901.11.11', reason: 'r8: query states grade A -> 0901.11.11 (Arabica plantation A Grade). Old 0901.11.12 = B Grade (GIR-6).' },
  TC003: { code: '4016.93.30', reason: 'r8: rubber oil seals -> 4016.93.30 (Rubber seals/oil seals). Old 8708.99.00 wrong: Section XVII Note 2(a) excludes vulcanised-rubber articles from Ch.87 parts.' },
  TC119: { code: '0902.20.90', reason: 'r8: loose green tea leaves (not waste) -> 0902.20.90 Other. Old 0902.20.40 = Green Tea WASTE.' },
  TC304: { code: '6203.42.90', reason: 'r8: denim jeans = cotton trousers -> 6203.42.90. Old 6203.19.10 = Suits of other textile materials (Ch.62 Note 3; jeans are trousers, not suits).' },
  EC037: { code: '8413.81.90', reason: 'r8: generic industrial hydraulic pump -> 8413.81.90 Other. Old 8413.81.30 = pumps designed primarily for handling water (GIR-6).' },
  DB016: { code: '1008.29.50', reason: 'r8: bare species name (no sowing-seed signal) = trade grain -> 1008.29.50. Old 1008.21.50 = Millet SEED for sowing.' },
  'S5-AUTO-024': { code: '8512.40.00', reason: 'r8: windscreen wiper blade -> 8512.40.00 (eo nomine wipers). Old chapter-only Ch.87 wrong: 8708.22 = windscreen GLASS; Section XVII Note 2(f) excludes Ch.85 electrical equipment.' },
  'S5-AMB-012': { code: '8523.51.00', reason: 'r8: USB flash drive = solid-state non-volatile storage -> 8523.51.00 (Ch.85 Note 6(a)). Old chapter-only Ch.84 wrong (it is Ch.85).' },

  // ── Round 3: r8/r9 sibling-audit corrections (2026-05-29, user-approved, blind-law-verified) ──
  TC013: { code: '4011.20.10', reason: 'r3(2026-05-29): truck tyre = lorry/bus tyre -> 4011.20 (used on buses or lorries) not 4011.10 (motor cars); .10 Radials per GIR-6. blind-law-verified.' },
  TC106: { code: '2101.11.90', reason: 'r3(2026-05-29): coffee extract/essence (concentrate) -> 2101.11 (extracts, essences and concentrates of coffee); .90 Other. blind-law-verified.' },
  TC015: { code: '6506.10.90', reason: 'r3(2026-05-29): safety/protective headgear -> 6506.10 (safety headgear); .90 Other (not .20 helmets-of-specific-type). blind-law-verified.' },
  EC001: { code: '4303.10.90', reason: 'r3(2026-05-29): fur garment = article of apparel of furskin -> 4303.10 (articles of apparel and clothing accessories); .90 Other (GIR-1). blind-law-verified.' },
  EC014: { code: '5404.19.90', reason: 'r3(2026-05-29): synthetic monofilament >=67 dtex, cross-section <=1mm -> 5404.19 (monofilament, Other); .90 Other. blind-law-verified.' },
  EC022: { code: '6202.20.10', reason: "r3(2026-05-29): women's overcoat/raincoat of man-made fibres (woven) -> 6202.20 (of man-made fibres); .10 overcoats, raincoats, car-coats, capes, cloaks and similar articles. blind-law-verified." },
  EC025: { code: '6105.10.90', reason: "r3(2026-05-29): men's knitted cotton shirt -> 6105.10 (men's/boys' shirts, knitted, of cotton); .90 Other (not handloom). blind-law-verified." },
  EC029: { code: '6203.42.90', reason: "r3(2026-05-29): men's woven cotton trousers -> 6203.42 (of cotton); .90 Other (GIR-1). blind-law-verified." },
  EC030: { code: '6204.59.99', reason: "r3(2026-05-29): women's woven skirt of other textile materials -> 6204.59 (skirts, of other textile materials); .99 Other: Other. blind-law-verified." },
  'S5-SIMP-004': { code: '1701.99.90', reason: 'r3(2026-05-29): refined white cane sugar (no added flavour/colour) -> 1701.99 (other cane/beet sugar, refined); .90 Other. Old 1701.91.00 = "containing added flavouring or colouring". blind-law-verified.' },
  'S5-SIMP-017': { code: '6303.92.00', reason: 'r3(2026-05-29): polyester (synthetic) curtains -> 6303.92.00 (curtains/interior blinds, of synthetic fibres) per GIR-1. blind-law-verified.' },
  'S5-SIMP-038': { code: '6601.91.00', reason: 'r3(2026-05-29): folding/automatic umbrella -> 6601.91.00 (umbrellas, having a telescopic shaft) per GIR-1/GIR-6. blind-law-verified.' },
  'S5-AMB-004': { code: '6506.10.90', reason: 'r3(2026-05-29): motorcycle (protective) helmet -> 6506.10 (safety headgear); .90 Other. Section XVII excludes headgear from Ch.87. blind-law-verified.' },
  'S5-AMB-006': { code: '8539.21.20', reason: 'r3(2026-05-29): halogen H4 vehicle headlight bulb -> 8539.21 (tungsten halogen filament lamps); .20 Other for automobiles (eo nomine, GIR-1). blind-law-verified.' },
  EC040: { code: '8504.22.00', reason: 'r3(2026-05-29): liquid-dielectric power transformer 650-10000 kVA -> 8504.22.00 per GIR-1/GIR-6 (power band). blind-law-verified.' },
  TC104: { code: '2101.11.20', reason: 'r3(2026-05-29): instant (soluble) coffee, not flavoured -> 2101.11.20 (extracts/essences/concentrates of coffee: instant coffee, not flavoured). blind-law-verified.' },
  'S5-SIMP-010': { code: '1806.32.00', reason: 'r3(2026-05-29): milk chocolate bar WITH almonds = chocolate in bars/slabs, not filled (added nuts != "filled" per HS) -> 1806.32.00 (Other, in blocks/slabs/bars: not filled). Old 1806.31.00 = "filled". blind-law-verified.' },
  'S5-AMB-007': { code: '3214.10.00', reason: 'r3(2026-05-29): silicone sealant for construction = mastic/caulking compound -> 3214.10.00 (glaziers putty, caulking compounds and other mastics). Resolves Ch.32 vs Ch.39 in favour of eo nomine mastics line (GIR-1). blind-law-verified.' },
  'S5-AUTO-025': { code: '4010.35.90', reason: 'r3(2026-05-29): Honda car engine timing belt = endless SYNCHRONOUS transmission belt, ~60-150cm circumference -> 4010.35 (endless synchronous belts, 60-150cm); .90 Other (residual rubber-content leaf; .10 is for rubber compound <25% by weight, no such signal). Transmission belt 4010.3x, NOT conveyor 4010.11. blind-law-verified; circumference assumed (low-confidence on band, but .35 is the standard car-timing-belt band).', confidence: 'low' },

  // ── Round 4: bucket-C sibling/leaf audit (2026-05-29, user-approved; two INDEPENDENT blind law-first raters agreed on both the error AND the corrected code). TC119 was EXCLUDED — its audit used stale pre-override gold (0902.20.40); the live gold is already r8's 0902.20.90. ──
  TC112: { code: '0909.31.29', reason: 'r4(2026-05-29): whole cumin spice ("jeera") -> 0909.31.29 Other. "Of seed quality" (.21) is an ITC-HS term of art for seed FOR SOWING, not the culinary spice; no sowing flag -> unmarked-default residual .29 (GIR-6). Old 0909.31.21. blind-law-verified (2 independent raters agree), user-approved.' },
  TC117: { code: '0910.20.10', reason: 'r4(2026-05-29): saffron "threads" are the dried STIGMAS of Crocus sativus -> 0910.20.10 Saffron stigma. Old 0910.20.20 = "Saffron stamen" (the low-value male part), botanically wrong for threads (GIR-1). blind-law-verified (2 independent raters agree), user-approved.' },
  EC018: { code: '5504.10.19', reason: 'r4(2026-05-29): plain viscose rayon staple fibre -> 5504.10.19 (Obtained from wood other than bamboo: Other). Old 5504.10.11 = special "Flame retardant Viscose Rayon fibre"; no flame-retardant flag -> unmarked-default residual. blind-law-verified (2 independent raters agree), user-approved.' },
  EC020: { code: '4203.10.90', reason: 'r4(2026-05-29): sleeveless leather vest/waistcoat -> 4203.10.90 Other. .10 is eo nomine "Jackets and jerseys"; a vest is neither -> residual leaf (GIR-1/GIR-6). Old 4203.10.10. blind-law-verified (2 independent raters agree), user-approved.', confidence: 'low' },
  'S5-SIMP-014': { code: '6302.31.00', reason: 'r4(2026-05-29): woven cotton bed sheet -> 6302.31.00 (Other bed linen: Of cotton). Old 6302.10.10 sits under 6302.10 = bed linen KNITTED OR CROCHETED; an ordinary bed sheet is woven (GIR-1). blind-law-verified (2 independent raters agree), user-approved.' },
  'S5-SIMP-025': { code: '8415.10.10', reason: 'r4(2026-05-29): wall-mounted residential split AC -> 8415.10.10 (Window or wall types, self-contained or split system: Split system). Old 8415.81.10 = "Split air-conditioner two tons and above" (contradicted by the 1.5-ton query). blind-law-verified (2 independent raters agree), user-approved.', confidence: 'medium' },
};

function deriveChapter(code: string): string {
  return code.replace(/\./g, '').substring(0, 2);
}
function deriveHeading(code: string): string {
  return code.replace(/\./g, '').substring(0, 4);
}

// Apply gold overrides: set corrected code and re-derive chapter/heading so all
// three expected_* fields are mutually consistent.
function applyGoldOverrides(cases: EvalTestCase[]): EvalTestCase[] {
  return cases.map(tc => {
    const ov = GOLD_OVERRIDES[tc.id];
    if (!ov) return tc;
    return {
      ...tc,
      expected_code: ov.code,
      expected_chapter: deriveChapter(ov.code),
      expected_heading: deriveHeading(ov.code),
      ground_truth_confidence: ov.confidence ?? tc.ground_truth_confidence,
    };
  });
}

// ---------------------------------------------------------------------------
// Round 5 — bad-gold query rewrites + drop (2026-05-30, user-approved)
// ---------------------------------------------------------------------------
//
// GOLD-REMEDIATION-LOG Round 5: 22 source cases whose queries were blind-verified
// to be CONTENTLESS schedule fragments (legal cross-references / heading skeletons
// with no real product signal). Each rewrite replaces the fragment with a realistic
// product phrasing that preserves the SAME gold leaf — we do NOT touch the gold
// code/chapter/heading here, only the `query` text. DB030 is DROPPED entirely: its
// "query" was a contentless legal cross-reference with no classifiable product.
//
// Applied as the INNERMOST transform in the allCases pipeline so rewrites flow
// through confidence overrides, gold overrides, and dedup. The out-of-boundary
// comprehensive-test-set.json is left untouched (owned by a different agent).
const QUERY_OVERRIDES: Record<string, string> = {
  DB007: 'black tea in retail packets not exceeding 25 g',
  DB025: 'Tobias acid (2-naphthylamine-1-sulphonic acid)',
  DB028: 'sulphanilic acid (para-aminobenzene sulphonic acid)',
  DB069: "women's knitted blouse of wool or fine animal hair",
  DB093: 'silico-manganese alloy steel wire',
  DB097: 'grain-oriented silicon electrical steel flat-rolled coil',
  DB118: 'additive manufacturing 3D printer by plastics or rubber deposit',
  DB191: 'endless rubber V-belt, rubber compound under 25% by weight',
  DB002: 'raw unroasted Robusta parchment coffee, PB grade',
  DB015: 'GI-recognised parboiled milled rice',
  DB057: 'single combed cotton yarn, count finer than 80s (under 125 decitex)',
  DB066: "women's knitted nightdress/lingerie of wool or fine animal hair",
  DB091: 'zinc-coated (galvanized) iron/steel angles, shapes and sections',
  DB092: 'stainless steel sheets and plates, thickness more than 4.75 mm',
  DB095: 'hot-rolled alloy steel flat product under 600 mm wide, thickness below 3 mm',
  DB107: 'seamless alloy steel tube/pipe up to 114.3 mm diameter',
  DB108: 'clad-metal article of iron or steel (e.g. clad steel fitting)',
  DB131: 'mechanically propelled parts of invalid carriages for disabled persons',
  DB143: 'parts and accessories of compound optical microscopes',
  DB144: 'parts and accessories of photographic laboratory apparatus',
  DB151: 'frozen strawberries, not containing added sugar',
  DB195: 'new pneumatic rubber tyres for construction, mining or industrial handling vehicles (OTR tyres)',
};

const DROPPED_CASE_IDS: ReadonlySet<string> = new Set<string>(['DB030']);

// Drop contentless cases first, then rewrite contentless-fragment queries to a
// realistic product phrasing (gold leaf preserved). See GOLD-REMEDIATION-LOG Round 5.
function applyQueryRewritesAndDrops(cases: EvalTestCase[]): EvalTestCase[] {
  return cases
    .filter(tc => !DROPPED_CASE_IDS.has(tc.id))
    .map(tc => {
      const rewritten = QUERY_OVERRIDES[tc.id];
      if (rewritten === undefined) return tc;
      return { ...tc, query: rewritten };
    });
}

// ---------------------------------------------------------------------------
// Combine and deduplicate
// ---------------------------------------------------------------------------

function deduplicateSuite(cases: EvalTestCase[]): EvalTestCase[] {
  const seen = new Map<string, EvalTestCase>();
  for (const tc of cases) {
    const key = tc.query.toLowerCase().trim().substring(0, 40);
    if (!seen.has(key)) {
      seen.set(key, tc);
    }
    // If duplicate, keep the first one (comprehensive has richer ground truth)
  }
  return Array.from(seen.values());
}

// applyQueryRewritesAndDrops is the INNERMOST transform (GOLD-REMEDIATION-LOG
// Round 5): query rewrites + DB030 drop flow through confidence + gold overrides
// + dedup so every downstream stage sees the realistic phrasing.
const allCases: EvalTestCase[] = applyGoldOverrides(
  applyConfidenceOverrides(
    applyQueryRewritesAndDrops([
      ...comprehensiveCases,
      ...ambiguousCases,
      ...automotiveSupplemental.filter(c => isUnique(c.query)),
      ...simpleSupplemental.filter(c => isUnique(c.query)),
      ...askCases,
      ...askCasesSingleWord,
      ...askCasesMultiWord,
      ...rejectCases,
    ])
  )
);

export const masterSuite: EvalTestCase[] = deduplicateSuite(allCases);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateSuite(suite: EvalTestCase[]): void {
  const errors: string[] = [];

  if (suite.length < 100) {
    errors.push(`Expected 100+ test cases, got ${suite.length}`);
  }

  const classifyCases = suite.filter(t => t.expected_routing === 'classify');
  if (classifyCases.length < 50) {
    errors.push(`Need 50+ classify cases, got ${classifyCases.length}`);
  }

  const askCasesCount = suite.filter(t => t.expected_routing === 'ask');
  if (askCasesCount.length < 5) {
    errors.push(`Need 5+ ask cases, got ${askCasesCount.length}`);
  }

  const rejectCasesCount = suite.filter(t => t.expected_routing === 'reject');
  // No minimum for reject yet — just count them

  const ids = suite.map(t => t.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    errors.push(`Duplicate IDs: ${[...new Set(dupes)].join(', ')}`);
  }

  const missingChapter = classifyCases.filter(t => !t.expected_chapter);
  if (missingChapter.length > 0) {
    errors.push(`${missingChapter.length} classify cases missing expected_chapter`);
  }

  if (errors.length > 0) {
    throw new Error(`Suite validation failed:\n${errors.join('\n')}`);
  }
}

// Run validation when executed directly
if (require.main === module) {
  validateSuite(masterSuite);
  const classify = masterSuite.filter(t => t.expected_routing === 'classify');
  const ask = masterSuite.filter(t => t.expected_routing === 'ask');
  const reject = masterSuite.filter(t => t.expected_routing === 'reject');
  const categories = [...new Set(masterSuite.map(t => t.category))].sort();

  console.log(`Suite valid: ${masterSuite.length} test cases`);
  console.log(`  classify: ${classify.length}`);
  console.log(`  ask: ${ask.length}`);
  console.log(`  reject: ${reject.length}`);
  console.log(`  categories: ${categories.join(', ')}`);
  console.log(`  with expected_chapter: ${masterSuite.filter(t => t.expected_chapter).length}`);
  console.log(`  with expected_heading: ${masterSuite.filter(t => t.expected_heading).length}`);
  console.log(`  with expected_code: ${masterSuite.filter(t => t.expected_code).length}`);
  console.log(`  with ground_truth_confidence: ${masterSuite.filter(t => t.ground_truth_confidence).length}`);
}

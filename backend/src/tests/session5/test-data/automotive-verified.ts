/**
 * Session 5: Automotive Products (25)
 *
 * Tests GIR 2a principle: Parts designed for vehicles classify by function,
 * not by material - UNLESS they have their own specific heading.
 *
 * Exceptions that stay in material chapters:
 * - Tyres -> Ch.40 (heading 4011)
 * - Batteries -> Ch.85 (heading 8507)
 * - Filters -> Ch.84 (heading 8421)
 */

import { Session5TestProduct } from './types';

export const AUTOMOTIVE_VERIFIED: Session5TestProduct[] = [
  // ============================================
  // BRAKE COMPONENTS (Ch.87 by function)
  // ============================================
  {
    id: 'S5-AUTO-001',
    query: 'ceramic brake pads for heavy trucks',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'baseline-verified',
    keyDistinction: 'GIR 2a: ceramic material -> function (vehicle brakes)'
  },
  {
    id: 'S5-AUTO-002',
    query: 'brake drum cast iron for Tata truck rear axle',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: cast iron -> function (brake drum)'
  },
  {
    id: 'S5-AUTO-003',
    query: 'disc brake rotor ventilated for passenger car',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: steel rotor -> function (brakes)'
  },

  // ============================================
  // ENGINE COMPONENTS (Ch.87 by function)
  // ============================================
  {
    id: 'S5-AUTO-004',
    query: 'rubber oil seals for automobile engines',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'baseline-verified',
    keyDistinction: 'GIR 2a: rubber material -> function (engine seal)'
  },
  {
    id: 'S5-AUTO-005',
    query: 'piston rings chrome plated for diesel engine truck',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: metal rings -> function (engine parts)'
  },
  {
    id: 'S5-AUTO-006',
    query: 'cylinder head gasket multi-layer steel for car engine',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: gasket -> function (engine seal)'
  },
  {
    id: 'S5-AUTO-007',
    query: 'silicone radiator hose for bus coolant system',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'baseline-verified',
    keyDistinction: 'GIR 2a: silicone -> function (radiator parts)'
  },

  // ============================================
  // BODY PARTS (Ch.87 by function)
  // ============================================
  {
    id: 'S5-AUTO-008',
    query: 'plastic bumper for Toyota Innova passenger car',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'baseline-verified',
    keyDistinction: 'GIR 2a: plastic -> function (vehicle bodywork)'
  },
  {
    id: 'S5-AUTO-009',
    query: 'aluminium alloy wheel rims for passenger cars',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'baseline-verified',
    keyDistinction: 'GIR 2a: aluminum -> function (wheels)'
  },
  {
    id: 'S5-AUTO-010',
    query: 'side mirror assembly with glass for Hyundai i20',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: glass/plastic -> function (vehicle accessory)'
  },
  {
    id: 'S5-AUTO-011',
    query: 'car door handle chrome plated exterior',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: metal -> function (door parts)'
  },

  // ============================================
  // SUSPENSION/STEERING (Ch.87 by function)
  // ============================================
  {
    id: 'S5-AUTO-012',
    query: 'coil spring suspension front for SUV',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: steel spring -> function (suspension)'
  },
  {
    id: 'S5-AUTO-013',
    query: 'rubber suspension bushing for truck chassis',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'hard',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: rubber -> function (suspension)'
  },
  {
    id: 'S5-AUTO-014',
    query: 'steering rack assembly hydraulic for sedan',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: mechanical assembly -> function (steering)'
  },

  // ============================================
  // TRANSMISSION (Ch.87 by function)
  // ============================================
  {
    id: 'S5-AUTO-015',
    query: 'clutch plate friction disc for Mahindra pickup',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: friction material -> function (clutch)'
  },
  {
    id: 'S5-AUTO-016',
    query: 'drive shaft propeller shaft for truck',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: steel shaft -> function (transmission)'
  },

  // ============================================
  // EXCEPTIONS: Products with OWN specific headings
  // ============================================
  {
    id: 'S5-AUTO-017',
    query: 'truck tyre 315/80R22.5 radial new pneumatic',
    expectedChapter: '40',
    category: 'automotive',
    difficulty: 'easy',
    source: 'baseline-verified',
    keyDistinction: 'Exception: Tyres have specific heading 4011 in Ch.40'
  },
  {
    id: 'S5-AUTO-018',
    query: 'car battery 12V 65Ah lead-acid starter',
    expectedChapter: '85',
    category: 'automotive',
    difficulty: 'medium',
    source: 'baseline-verified',
    keyDistinction: 'Exception: Batteries have specific heading 8507 in Ch.85'
  },
  {
    id: 'S5-AUTO-019',
    query: 'air filter element for diesel truck engine',
    expectedChapter: '84',
    category: 'automotive',
    difficulty: 'hard',
    source: 'baseline-verified',
    keyDistinction: 'Exception: Filters have specific heading 8421 in Ch.84'
  },
  {
    id: 'S5-AUTO-020',
    query: 'oil filter cartridge for petrol engine car',
    expectedChapter: '84',
    category: 'automotive',
    difficulty: 'hard',
    source: 'ai-generated',
    keyDistinction: 'Exception: Filters have specific heading 8421 in Ch.84'
  },
  {
    id: 'S5-AUTO-021',
    query: 'motorcycle tyre 120/80-17 tubeless radial',
    expectedChapter: '40',
    category: 'automotive',
    difficulty: 'easy',
    source: 'ai-generated',
    keyDistinction: 'Exception: Tyres have specific heading 4011 in Ch.40'
  },

  // ============================================
  // ELECTRICAL COMPONENTS (varies)
  // ============================================
  {
    id: 'S5-AUTO-022',
    query: 'alternator 12V 100A for car engine',
    expectedChapter: '85',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'Electrical generators -> Ch.85 (specific heading 8511)'
  },
  {
    id: 'S5-AUTO-023',
    query: 'starter motor 12V for diesel truck',
    expectedChapter: '85',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'Electric motors -> Ch.85 (specific heading 8511)'
  },
  {
    id: 'S5-AUTO-024',
    query: 'wiper blade rubber refill for SUV windshield',
    expectedChapter: '87',
    category: 'automotive',
    difficulty: 'easy',
    source: 'ai-generated',
    keyDistinction: 'GIR 2a: rubber -> function (vehicle accessory)'
  },
  {
    id: 'S5-AUTO-025',
    query: 'timing belt rubber reinforced for Honda engine',
    expectedChapter: '40',
    category: 'automotive',
    difficulty: 'medium',
    source: 'ai-generated',
    keyDistinction: 'Transmission belts have specific heading 4010 in Ch.40'
  }
];

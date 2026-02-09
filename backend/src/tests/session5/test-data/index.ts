/**
 * Session 5: Combined Test Data Index
 *
 * Combines all 100 test products from 4 categories:
 * - Automotive (25): GIR 2a tests
 * - Simple (40): Sanity checks
 * - ITC-HS Official (20): Official tariff patterns
 * - Ambiguous (15): Multiple acceptable answers
 */

import { Session5TestProduct } from './types';
import { AUTOMOTIVE_VERIFIED } from './automotive-verified';
import { SIMPLE_UNAMBIGUOUS } from './simple-unambiguous';
import { ITC_HS_OFFICIAL } from './itc-hs-official';
import { AMBIGUOUS_PRODUCTS } from './ambiguous-multi-chapter';

// Export individual categories
export { AUTOMOTIVE_VERIFIED } from './automotive-verified';
export { SIMPLE_UNAMBIGUOUS } from './simple-unambiguous';
export { ITC_HS_OFFICIAL } from './itc-hs-official';
export { AMBIGUOUS_PRODUCTS } from './ambiguous-multi-chapter';
export * from './types';

// Combined test set
export const SESSION5_ALL_PRODUCTS: Session5TestProduct[] = [
  ...AUTOMOTIVE_VERIFIED,
  ...SIMPLE_UNAMBIGUOUS,
  ...ITC_HS_OFFICIAL,
  ...AMBIGUOUS_PRODUCTS
];

// Validation
const counts = {
  automotive: AUTOMOTIVE_VERIFIED.length,
  simple: SIMPLE_UNAMBIGUOUS.length,
  'itc-official': ITC_HS_OFFICIAL.length,
  ambiguous: AMBIGUOUS_PRODUCTS.length,
  total: SESSION5_ALL_PRODUCTS.length
};

console.log('=== SESSION 5 TEST DATA LOADED ===');
console.log(`Automotive: ${counts.automotive} (target: 25)`);
console.log(`Simple: ${counts.simple} (target: 40)`);
console.log(`ITC-HS: ${counts['itc-official']} (target: 20)`);
console.log(`Ambiguous: ${counts.ambiguous} (target: 15)`);
console.log(`TOTAL: ${counts.total} (target: 100)`);

if (counts.total !== 100) {
  console.warn(`⚠️ Total products (${counts.total}) does not match target (100)`);
}

/**
 * Quick test to verify the instant coffee fix
 */

import { filterCandidatesByElimination, extractModifiersFromText } from '../src/services/elimination.service';

// Simulate candidates that would be returned for "instant coffee"
const mockCandidates = [
  { code: '2101', description: 'EXTRACTS, ESSENCES AND CONCENTRATES, OF COFFEE, TEA OR MATE AND PREPARATIONS WITH A BASIS OF THESE PRODUCTS; ROASTED CHICORY AND OTHER ROASTED COFFEE SUBSTITUTES, AND EXTRACTS' },
  { code: '2101.11', description: 'Extracts, essences and concentrates' },
  { code: '2101.11.10', description: 'Instant coffee (SPRAY DRIED)' },
  { code: '2101.11.20', description: 'Instant coffee (FREEZE DRIED / OTHER)' },
  { code: '0901', description: 'COFFEE, WHETHER OR NOT ROASTED OR DECAFFEINATED' },
  { code: '0901.11', description: 'Coffee, not roasted, not decaffeinated' },
  { code: '0901.21', description: 'Coffee, roasted, not decaffeinated' },
];

console.log('='.repeat(60));
console.log('TEST: Instant Coffee Fix Verification');
console.log('='.repeat(60));

// Test 1: "instant coffee" should keep Ch.21 codes
console.log('\n--- Test 1: "instant coffee" ---');
const modifiers1 = extractModifiersFromText('instant coffee');
console.log('Extracted modifiers:', modifiers1);

const result1 = filterCandidatesByElimination(mockCandidates, {
  originalQuery: 'instant coffee',
  productTypeModifiers: modifiers1
});

console.log('Filtered codes:', result1.filteredCodes.map(c => c.code));
console.log('Eliminated count:', result1.eliminatedCount);
console.log('Applied rules:', result1.appliedRules);

const hasChapter21 = result1.filteredCodes.some(c => c.code.startsWith('21'));
const hasChapter09 = result1.filteredCodes.some(c => c.code.startsWith('09'));
console.log(`✓ Has Ch.21 codes: ${hasChapter21}`);
console.log(`✓ Has Ch.09 codes: ${hasChapter09}`);

if (hasChapter21 && !hasChapter09) {
  console.log('✅ TEST 1 PASSED: "instant coffee" returns Ch.21 codes only');
} else {
  console.log('❌ TEST 1 FAILED: Expected only Ch.21 codes');
  process.exit(1);
}

// Test 2: "roasted coffee" should keep Ch.09 codes
console.log('\n--- Test 2: "roasted coffee beans" ---');
const modifiers2 = extractModifiersFromText('roasted coffee beans');
console.log('Extracted modifiers:', modifiers2);

const result2 = filterCandidatesByElimination(mockCandidates, {
  originalQuery: 'roasted coffee beans',
  productTypeModifiers: modifiers2
});

console.log('Filtered codes:', result2.filteredCodes.map(c => c.code));
const hasChapter21_2 = result2.filteredCodes.some(c => c.code.startsWith('21'));
const hasChapter09_2 = result2.filteredCodes.some(c => c.code.startsWith('09'));
console.log(`✓ Has Ch.21 codes: ${hasChapter21_2}`);
console.log(`✓ Has Ch.09 codes: ${hasChapter09_2}`);

if (hasChapter09_2 && !hasChapter21_2) {
  console.log('✅ TEST 2 PASSED: "roasted coffee beans" returns Ch.09 codes only');
} else {
  console.log('❌ TEST 2 FAILED: Expected only Ch.09 codes');
  process.exit(1);
}

// Test 3: 2101 should NOT be excluded due to "roasted chicory" in description
console.log('\n--- Test 3: 2101 description has "roasted" but should be KEPT ---');
const code2101 = mockCandidates.find(c => c.code === '2101');
console.log('2101 description contains "roasted":', code2101?.description.toLowerCase().includes('roasted'));
const code2101InResult = result1.filteredCodes.find(c => c.code === '2101');
if (code2101InResult) {
  console.log('✅ TEST 3 PASSED: 2101 was KEPT despite "roasted" in description');
} else {
  console.log('❌ TEST 3 FAILED: 2101 was incorrectly excluded');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('🎉 ALL TESTS PASSED! The instant coffee fix is working.');
console.log('='.repeat(60));

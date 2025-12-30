/**
 * Test script for Phase 3: Elimination Service
 *
 * Tests:
 * 1. "Arabica coffee beans" - should NOT show Robusta codes
 * 2. "Robusta coffee" - should NOT show Arabica codes
 * 3. "instant coffee" - should only show Ch.21 codes
 * 4. "brake pads" - should still work (regression test)
 */

import {
  filterCandidatesByElimination,
  extractModifiersFromText,
  extractModifiersFromAnswer,
  isQuestionStillRelevant
} from '../src/services/elimination.service';

// Test data - simulated HS code candidates
const coffeeCandidates = [
  { code: '0901.11.11', description: 'Coffee not roasted: Arabica plantation: A Grade' },
  { code: '0901.11.12', description: 'Coffee not roasted: Arabica plantation: B Grade' },
  { code: '0901.11.21', description: 'Coffee not roasted: Arabica cherry: A Grade' },
  { code: '0901.11.31', description: 'Coffee not roasted: Robusta parchment: AB Grade' },
  { code: '0901.11.32', description: 'Coffee not roasted: Robusta parchment: PB Grade' },
  { code: '0901.11.41', description: 'Coffee not roasted: Robusta cherry: AB Grade' },
  { code: '0901.12.00', description: 'Coffee roasted, not decaffeinated' },
  { code: '2101.11.00', description: 'Extracts, essences and concentrates, of coffee' },
  { code: '2101.11.10', description: 'Instant coffee, not flavoured' },
  { code: '2101.11.20', description: 'Instant coffee, flavoured' },
];

const brakePadCandidates = [
  { code: '8708.30.00', description: 'Brakes and servo-brakes; parts thereof' },
  { code: '8708.30.10', description: 'Brake pads for motor vehicles' },
  { code: '6813.81.00', description: 'Brake linings and pads (friction material)' },
  { code: '6913.10.00', description: 'Ceramic articles n.e.s.' },
];

console.log('='.repeat(60));
console.log('PHASE 3: Elimination Service Tests');
console.log('='.repeat(60));

// Test 1: Extract modifiers from text
console.log('\n--- Test 1: Extract Modifiers from Text ---');
const arabicaModifiers = extractModifiersFromText('Arabica coffee beans');
console.log(`"Arabica coffee beans" -> modifiers: [${arabicaModifiers.join(', ')}]`);

const robustaModifiers = extractModifiersFromText('Robusta coffee');
console.log(`"Robusta coffee" -> modifiers: [${robustaModifiers.join(', ')}]`);

const instantModifiers = extractModifiersFromText('instant coffee');
console.log(`"instant coffee" -> modifiers: [${instantModifiers.join(', ')}]`);

const brakePadModifiers = extractModifiersFromText('brake pads for cars');
console.log(`"brake pads for cars" -> modifiers: [${brakePadModifiers.join(', ')}]`);

// Test 2: Filter Arabica coffee (should exclude Robusta)
console.log('\n--- Test 2: Filter "Arabica coffee beans" ---');
const arabicaResult = filterCandidatesByElimination(coffeeCandidates, {
  productTypeModifiers: ['arabica', 'beans'],
  originalQuery: 'Arabica coffee beans'
});
console.log(`Input: ${coffeeCandidates.length} candidates`);
console.log(`Output: ${arabicaResult.filteredCodes.length} candidates`);
console.log(`Eliminated: ${arabicaResult.eliminatedCount}`);
console.log(`Applied rules: ${arabicaResult.appliedRules.join(', ')}`);
console.log('Remaining codes:');
arabicaResult.filteredCodes.forEach(c => console.log(`  - ${c.code}: ${c.description.substring(0, 50)}...`));

// Verify: Should NOT contain Robusta
const hasRobusta = arabicaResult.filteredCodes.some(c =>
  c.description.toLowerCase().includes('robusta')
);
console.log(`\nVERIFY: Contains Robusta? ${hasRobusta ? 'FAIL' : 'PASS'}`);

// Test 3: Filter Robusta coffee (should exclude Arabica)
console.log('\n--- Test 3: Filter "Robusta coffee" ---');
const robustaResult = filterCandidatesByElimination(coffeeCandidates, {
  productTypeModifiers: ['robusta'],
  originalQuery: 'Robusta coffee'
});
console.log(`Input: ${coffeeCandidates.length} candidates`);
console.log(`Output: ${robustaResult.filteredCodes.length} candidates`);
console.log(`Eliminated: ${robustaResult.eliminatedCount}`);
console.log('Remaining codes:');
robustaResult.filteredCodes.forEach(c => console.log(`  - ${c.code}: ${c.description.substring(0, 50)}...`));

// Verify: Should NOT contain Arabica
const hasArabica = robustaResult.filteredCodes.some(c =>
  c.description.toLowerCase().includes('arabica')
);
console.log(`\nVERIFY: Contains Arabica? ${hasArabica ? 'FAIL' : 'PASS'}`);

// Test 4: Filter instant coffee (should only be Ch.21)
console.log('\n--- Test 4: Filter "instant coffee" ---');
const instantResult = filterCandidatesByElimination(coffeeCandidates, {
  productTypeModifiers: ['instant'],
  originalQuery: 'instant coffee'
});
console.log(`Input: ${coffeeCandidates.length} candidates`);
console.log(`Output: ${instantResult.filteredCodes.length} candidates`);
console.log(`Eliminated: ${instantResult.eliminatedCount}`);
console.log('Remaining codes:');
instantResult.filteredCodes.forEach(c => console.log(`  - ${c.code}: ${c.description.substring(0, 50)}...`));

// Verify: All remaining should be Ch.21
const allCh21 = instantResult.filteredCodes.every(c => c.code.startsWith('21'));
console.log(`\nVERIFY: All Ch.21? ${allCh21 ? 'PASS' : 'FAIL'}`);

// Test 5: Brake pads (should not eliminate relevant codes)
console.log('\n--- Test 5: Filter "brake pads for cars" ---');
const brakePadResult = filterCandidatesByElimination(brakePadCandidates, {
  productTypeModifiers: [],
  originalQuery: 'brake pads for cars'
});
console.log(`Input: ${brakePadCandidates.length} candidates`);
console.log(`Output: ${brakePadResult.filteredCodes.length} candidates`);
console.log(`Eliminated: ${brakePadResult.eliminatedCount}`);
console.log('Remaining codes:');
brakePadResult.filteredCodes.forEach(c => console.log(`  - ${c.code}: ${c.description.substring(0, 50)}...`));

// Verify: Should contain 8708.30 codes
const has8708 = brakePadResult.filteredCodes.some(c => c.code.startsWith('8708'));
console.log(`\nVERIFY: Contains 8708 brake codes? ${has8708 ? 'PASS' : 'FAIL'}`);

// Test 6: Extract modifiers from answer
console.log('\n--- Test 6: Extract Modifiers from Answer ---');
const arabicaAnswer = extractModifiersFromAnswer({
  code: '0901.11.11',
  description: 'Coffee not roasted: Arabica plantation: A Grade'
});
console.log(`Answer "Arabica plantation A Grade" -> modifiers: [${arabicaAnswer.join(', ')}]`);

const robustaAnswer = extractModifiersFromAnswer({
  code: '0901.11.31',
  description: 'Coffee not roasted: Robusta parchment: AB Grade'
});
console.log(`Answer "Robusta parchment AB Grade" -> modifiers: [${robustaAnswer.join(', ')}]`);

// Test 7: Is question still relevant
console.log('\n--- Test 7: Is Question Still Relevant ---');
const arabicaOptions = [
  { code: '0901.11.11', description: 'Arabica plantation A Grade' },
  { code: '0901.11.12', description: 'Arabica plantation B Grade' },
  { code: '0901.11.31', description: 'Robusta parchment AB Grade' },
];
const relevanceCheck = isQuestionStillRelevant(arabicaOptions, {
  productTypeModifiers: ['arabica'],
  originalQuery: 'Arabica coffee'
});
console.log(`With "arabica" modifier:`);
console.log(`  Relevant: ${relevanceCheck.relevant}`);
console.log(`  Remaining options: ${relevanceCheck.remainingOptions}`);
if (relevanceCheck.autoSelectCode) {
  console.log(`  Auto-select code: ${relevanceCheck.autoSelectCode}`);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Test 2 (Arabica excludes Robusta): ${!hasRobusta ? 'PASS' : 'FAIL'}`);
console.log(`Test 3 (Robusta excludes Arabica): ${!hasArabica ? 'PASS' : 'FAIL'}`);
console.log(`Test 4 (Instant -> Ch.21 only): ${allCh21 ? 'PASS' : 'FAIL'}`);
console.log(`Test 5 (Brake pads -> 8708): ${has8708 ? 'PASS' : 'FAIL'}`);

const allPassed = !hasRobusta && !hasArabica && allCh21 && has8708;
console.log(`\nOVERALL: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

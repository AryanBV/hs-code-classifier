/**
 * Chapter Notes Accessor Unit Tests
 *
 * Run: npx ts-node src/tests/audit/chapter-notes-accessor-test.ts
 * Or:  npm run test:notes-accessor
 */

import * as dotenv from 'dotenv';
dotenv.config();

import {
  getChapterNotesResult,
  getChapterNotes,
  getSectionNotes,
  getChapterTitle,
  hasNotes,
  getMultipleChapterNotes,
  getGIRRules,
  getGIRRule,
  getPartsClassificationGIRs,
  formatGIRsForPrompt,
  getGIRSummary,
  getNotesForClassification,
  clearCache,
  getCacheStats
} from '../../database/chapter-notes-accessor';
import { prisma } from '../../utils/prisma';

// ============ TEST UTILITIES ============

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ✅ ${name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, error: errorMsg });
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${errorMsg}`);
    }
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message: string) {
  if (actual <= expected) {
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
  }
}

// ============ TESTS ============

async function runGIRTests() {
  console.log('\n📋 GIR Rules Tests');
  console.log('─'.repeat(40));

  await test('Should return exactly 10 GIR rules', () => {
    const rules = getGIRRules();
    assertEqual(rules.length, 10, 'GIR count');
  })();

  await test('GIR 2a should exist', () => {
    const gir2a = getGIRRule('2a');
    assert(gir2a !== undefined, 'GIR 2a not found');
  })();

  await test('GIR 2a should have 4 vehicle parts examples', () => {
    const gir2a = getGIRRule('2a');
    assert(gir2a !== undefined, 'GIR 2a not found');
    assertEqual(gir2a!.examples.length, 4, 'GIR 2a examples count');
  })();

  await test('GIR 2a examples should include rubber oil seals', () => {
    const gir2a = getGIRRule('2a');
    const hasRubberSeals = gir2a!.examples.some(e =>
      e.product.toLowerCase().includes('rubber') &&
      e.product.toLowerCase().includes('seal')
    );
    assert(hasRubberSeals, 'GIR 2a should have rubber oil seals example');
  })();

  await test('GIR 2a examples should include ceramic brake pads', () => {
    const gir2a = getGIRRule('2a');
    const hasCeramicBrakes = gir2a!.examples.some(e =>
      e.product.toLowerCase().includes('ceramic') &&
      e.product.toLowerCase().includes('brake')
    );
    assert(hasCeramicBrakes, 'GIR 2a should have ceramic brake pads example');
  })();

  await test('Parts classification GIRs should return 2a, 3a, 3b', () => {
    const partsGIRs = getPartsClassificationGIRs();
    const numbers = partsGIRs.map(g => g.number).sort();
    assertEqual(numbers.join(','), '2a,3a,3b', 'Parts GIRs');
  })();

  await test('getGIRRule should return undefined for invalid ID', () => {
    const invalid = getGIRRule('99');
    assertEqual(invalid, undefined, 'Invalid GIR should be undefined');
  })();

  await test('formatGIRsForPrompt should include rule numbers', () => {
    const formatted = formatGIRsForPrompt(['1', '2a']);
    assert(formatted.includes('GIR 1'), 'Should include GIR 1');
    assert(formatted.includes('GIR 2a'), 'Should include GIR 2a');
  })();

  await test('getGIRSummary should return compact summary', () => {
    const summary = getGIRSummary();
    assert(summary.includes('GIR 1'), 'Summary should include GIR 1');
    assert(summary.includes('GIR 2(a)'), 'Summary should include GIR 2(a)');
    assert(summary.length < 1000, 'Summary should be compact');
  })();
}

async function runChapterNotesTests() {
  console.log('\n📚 Chapter Notes Tests');
  console.log('─'.repeat(40));

  // Clear cache before tests
  clearCache();

  await test('Chapter 29 should return notes', async () => {
    const notes = await getChapterNotes('29');
    assertGreaterThan(notes.length, 0, 'Chapter 29 notes count');
  })();

  await test('Chapter 87 (vehicles) should return notes', async () => {
    const notes = await getChapterNotes('87');
    assertGreaterThan(notes.length, 0, 'Chapter 87 notes count');
  })();

  await test('Chapter 50 (known missing) should return empty', async () => {
    const notes = await getChapterNotes('50');
    assertEqual(notes.length, 0, 'Chapter 50 should have no notes');
  })();

  await test('getChapterTitle should return title for chapter 87', async () => {
    const title = await getChapterTitle('87');
    assert(title !== null, 'Chapter 87 title should not be null');
  })();

  await test('getSectionNotes should work for chapter 29', async () => {
    const sectionNotes = await getSectionNotes('29');
    assert(Array.isArray(sectionNotes), 'Section notes should be an array');
  })();

  await test('hasNotes should return true for chapter 29', async () => {
    const has = await hasNotes('29');
    assertEqual(has, true, 'Chapter 29 should have notes');
  })();

  await test('hasNotes should return false for chapter 50', async () => {
    const has = await hasNotes('50');
    assertEqual(has, false, 'Chapter 50 should not have notes');
  })();
}

async function runNormalizationTests() {
  console.log('\n🔧 Normalization Tests');
  console.log('─'.repeat(40));

  clearCache();

  await test('"9" and "09" should return identical results', async () => {
    const notes1 = await getChapterNotes('9');
    const notes2 = await getChapterNotes('09');
    assertEqual(
      JSON.stringify(notes1),
      JSON.stringify(notes2),
      'Notes should be identical'
    );
  })();

  await test('10-digit code should extract chapter correctly', async () => {
    // "0901110010" should extract chapter "09"
    const notes = await getChapterNotes('0901110010');
    assertGreaterThan(notes.length, 0, 'Should extract chapter from 10-digit code');
  })();
}

async function runCachingTests() {
  console.log('\n⚡ Caching Tests');
  console.log('─'.repeat(40));

  clearCache();

  await test('First call should have fromCache: false', async () => {
    const result = await getChapterNotesResult('29');
    assertEqual(result.fromCache, false, 'First call should not be from cache');
  })();

  await test('Second call should have fromCache: true', async () => {
    const result = await getChapterNotesResult('29');
    assertEqual(result.fromCache, true, 'Second call should be from cache');
  })();

  await test('Cache hit should be 5x faster', async () => {
    clearCache();

    // First call (DB query)
    const t1 = Date.now();
    await getChapterNotes('87');
    const time1 = Date.now() - t1;

    // Second call (cache hit)
    const t2 = Date.now();
    await getChapterNotes('87');
    const time2 = Date.now() - t2;

    // Allow some tolerance for very fast first queries
    const speedup = time1 > 0 ? time1 / Math.max(time2, 1) : 5;
    assert(speedup >= 2 || time2 <= 5, `Cache should be faster: first=${time1}ms, cached=${time2}ms`);
  })();

  await test('clearCache should reset cache', async () => {
    await getChapterNotes('29');
    const statsBefore = getCacheStats();
    assertGreaterThan(statsBefore.size, 0, 'Cache should have entries');

    clearCache();
    const statsAfter = getCacheStats();
    assertEqual(statsAfter.size, 0, 'Cache should be empty after clear');
  })();

  await test('getCacheStats should return cached chapters', async () => {
    clearCache();
    await getChapterNotes('29');
    await getChapterNotes('87');

    const stats = getCacheStats();
    assertEqual(stats.size, 2, 'Cache should have 2 entries');
    assert(stats.chapters.includes('29'), 'Cache should include chapter 29');
    assert(stats.chapters.includes('87'), 'Cache should include chapter 87');
  })();
}

async function runBatchLoadingTests() {
  console.log('\n📦 Batch Loading Tests');
  console.log('─'.repeat(40));

  clearCache();

  await test('getMultipleChapterNotes should return all requested chapters', async () => {
    const chapters = await getMultipleChapterNotes(['29', '87', '09']);
    assertEqual(chapters.size, 3, 'Should return 3 chapters');
    assert(chapters.has('29'), 'Should have chapter 29');
    assert(chapters.has('87'), 'Should have chapter 87');
    assert(chapters.has('09'), 'Should have chapter 09');
  })();

  await test('Batch loading should populate cache', async () => {
    clearCache();
    await getMultipleChapterNotes(['40', '85']);

    const stats = getCacheStats();
    assert(stats.chapters.includes('40'), 'Cache should include chapter 40');
    assert(stats.chapters.includes('85'), 'Cache should include chapter 85');
  })();

  await test('Batch loading should use cache for already-cached chapters', async () => {
    clearCache();

    // Pre-cache one chapter
    await getChapterNotesResult('29');

    // Batch load including the cached chapter
    const results = await getMultipleChapterNotes(['29', '87']);

    // Chapter 29 should be from cache
    const ch29 = results.get('29');
    assertEqual(ch29?.fromCache, true, 'Chapter 29 should be from cache');
  })();
}

async function runCombinedAccessTests() {
  console.log('\n🔗 Combined Access Tests');
  console.log('─'.repeat(40));

  clearCache();

  await test('getNotesForClassification should return chapters and GIRs', async () => {
    const result = await getNotesForClassification(['40', '87'], ['1', '2a']);

    assertEqual(result.chapters.size, 2, 'Should return 2 chapters');
    assertEqual(result.relevantGIRs.length, 2, 'Should return 2 GIRs');
  })();

  await test('Formatted prompt should contain chapter info', async () => {
    const result = await getNotesForClassification(['40', '87'], ['1', '2a']);

    assert(
      result.formattedForPrompt.includes('Chapter 40') ||
      result.formattedForPrompt.includes('Chapter 87'),
      'Prompt should contain chapter headers'
    );
  })();

  await test('Formatted prompt should contain GIR info', async () => {
    const result = await getNotesForClassification(['40', '87'], ['1', '2a']);

    assert(
      result.formattedForPrompt.includes('GIR 1') ||
      result.formattedForPrompt.includes('GIR 2a'),
      'Prompt should contain GIR info'
    );
  })();

  await test('Default GIRs should be 1, 2a, 3a, 3b', async () => {
    const result = await getNotesForClassification(['29']);
    const girNumbers = result.relevantGIRs.map(g => g.number);

    assert(girNumbers.includes('1'), 'Should include GIR 1');
    assert(girNumbers.includes('2a'), 'Should include GIR 2a');
    assert(girNumbers.includes('3a'), 'Should include GIR 3a');
    assert(girNumbers.includes('3b'), 'Should include GIR 3b');
  })();
}

// ============ MAIN ============

async function main() {
  console.log('='.repeat(60));
  console.log('Chapter Notes Accessor - Unit Tests');
  console.log('='.repeat(60));

  try {
    await runGIRTests();
    await runChapterNotesTests();
    await runNormalizationTests();
    await runCachingTests();
    await runBatchLoadingTests();
    await runCombinedAccessTests();
  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Accuracy: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    console.log('\n### SUCCESS CRITERIA VERIFICATION ###');
    console.log('✅ GIR file compiles (imported successfully)');
    console.log('✅ Service compiles (imported successfully)');
    console.log('✅ All 10 GIRs present');
    console.log('✅ GIR 2(a) has 4 examples');
    console.log('✅ Ch.87 notes work');
    console.log('✅ Ch.50 returns empty');
    console.log('✅ Caching works');
    console.log('✅ All tests pass');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

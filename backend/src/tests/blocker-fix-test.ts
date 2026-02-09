import dotenv from 'dotenv';
dotenv.config();
import { classify } from '../classifier';

interface BlockerTestCase {
  id: number;
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  bugCategory: string;
}

const BLOCKER_CASES: BlockerTestCase[] = [
  { id: 1, query: 'stainless steel kitchen knife', expectedChapter: '82', expectedHeading: '8211', bugCategory: 'Rule too broad' },
  { id: 2, query: 'plastic toy car', expectedChapter: '95', expectedHeading: '9503', bugCategory: 'Rule too broad' },
  { id: 3, query: 'leather handbag with textile strap', expectedChapter: '42', expectedHeading: '4202', bugCategory: 'LENGTH bug' },
  { id: 4, query: 'stainless steel thermos flask', expectedChapter: '96', expectedHeading: '9617', bugCategory: 'Rule too broad' },
  { id: 5, query: 'wooden picture frame', expectedChapter: '44', expectedHeading: '4414', bugCategory: 'LENGTH bug' },
];

async function runBlockerTests() {
  console.log('\n========================================');
  console.log('BLOCKER FIX TEST - 5 Known Failures');
  console.log('========================================\n');

  const results: { id: number; query: string; expected: string; got: string; chapterOk: boolean; headingOk: boolean; notFallback: boolean }[] = [];

  for (const tc of BLOCKER_CASES) {
    try {
      const result = await classify(tc.query, { skipSpecificityCheck: true });

      if (result.responseType === 'classification' && result.hsCode) {
        const chapter = result.hsCode.substring(0, 2);
        const heading = result.hsCode.substring(0, 4);
        const isFallback = result.hsCode.endsWith('.00.00') && result.description === 'Heading level classification';
        const chapterOk = chapter === tc.expectedChapter;
        const headingOk = heading === tc.expectedHeading;

        const status = chapterOk && headingOk && !isFallback ? '  PASS' : '  FAIL';
        console.log(`${status} [${tc.id}] "${tc.query}"`);
        console.log(`       Got: Ch.${chapter} / ${result.hsCode} | Expected: Ch.${tc.expectedChapter} / ${tc.expectedHeading}xx`);
        if (isFallback) console.log(`       WARNING: .00.00 fallback triggered`);

        results.push({ id: tc.id, query: tc.query, expected: `Ch.${tc.expectedChapter}/${tc.expectedHeading}`, got: `Ch.${chapter}/${result.hsCode}`, chapterOk, headingOk, notFallback: !isFallback });
      } else {
        console.log(`  FAIL [${tc.id}] "${tc.query}" → Asked question instead of classifying`);
        results.push({ id: tc.id, query: tc.query, expected: `Ch.${tc.expectedChapter}`, got: 'question', chapterOk: false, headingOk: false, notFallback: false });
      }
    } catch (error) {
      console.log(`  FAIL [${tc.id}] "${tc.query}" → ERROR: ${error}`);
      results.push({ id: tc.id, query: tc.query, expected: `Ch.${tc.expectedChapter}`, got: `error`, chapterOk: false, headingOk: false, notFallback: false });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const passed = results.filter(r => r.chapterOk && r.headingOk && r.notFallback).length;
  console.log(`\nResult: ${passed}/${results.length} blocker cases fixed`);
  process.exit(passed === results.length ? 0 : 1);
}

runBlockerTests();

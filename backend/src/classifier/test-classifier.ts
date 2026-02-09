// backend/src/classifier/test-classifier.ts

import 'dotenv/config';
import { classify } from './index';

const TEST_CASES = [
  {
    query: 'ceramic brake pads for heavy trucks',
    expectedChapter: '87',
    reason: 'Vehicle parts by function'
  },
  {
    query: 'arabica coffee beans grade A',
    expectedChapter: '09',
    reason: 'Raw coffee'
  },
  {
    query: 'instant coffee powder',
    expectedChapter: '21',
    reason: 'Processed coffee'
  },
  {
    query: 'portland cement powder bulk',
    expectedChapter: '25',
    reason: 'Raw cement'
  },
  {
    query: 'silk fabric woven',
    expectedChapter: '50',
    reason: 'Silk textiles'
  }
];

async function runTests() {
  console.log('Running Classification Tests\n');

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    try {
      const result = await classify(test.query);

      if (result.responseType === 'classification' && result.hsCode) {
        const chapter = result.hsCode.substring(0, 2);
        const success = chapter === test.expectedChapter;

        if (success) {
          console.log(`✅ PASS: "${test.query}"`);
          console.log(`   Expected Ch.${test.expectedChapter}, Got Ch.${chapter}`);
          passed++;
        } else {
          console.log(`❌ FAIL: "${test.query}"`);
          console.log(`   Expected Ch.${test.expectedChapter}, Got Ch.${chapter}`);
          console.log(`   Reason should be: ${test.reason}`);
          failed++;
        }
      } else {
        console.log(`⚠️ QUESTION: "${test.query}"`);
        console.log(`   System asked: ${result.question}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: "${test.query}"`);
      console.log(`   ${error}`);
      failed++;
    }

    console.log('');
  }

  console.log('========================================');
  console.log(`Results: ${passed}/${TEST_CASES.length} passed`);
  console.log('========================================');
}

runTests();

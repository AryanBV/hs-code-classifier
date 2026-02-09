// backend/src/tests/integration-test.ts

import dotenv from 'dotenv';
dotenv.config();

import { classify } from '../classifier';

interface TestCase {
  query: string;
  expectedChapter: string;
  expectedHeading?: string;  // 4-digit heading for deeper accuracy tracking
  expectedQuestion?: boolean;
  category: string;
}

const TEST_SUITE: TestCase[] = [
  // VEHICLE PARTS (Function over material) - Ch.87 Note 2
  { query: 'ceramic brake pads for heavy trucks', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' },
  { query: 'steel brake discs for cars', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' },
  { query: 'air filter for automobile engine', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' },
  { query: 'rubber suspension bushings for trucks', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' },
  { query: 'aluminium radiator for car', expectedChapter: '87', expectedHeading: '8708', category: 'Vehicle Parts' },

  // COFFEE (Processing state) - Ch.09 vs Ch.21
  { query: 'arabica coffee beans grade A', expectedChapter: '09', expectedHeading: '0901', category: 'Coffee' },
  { query: 'green coffee beans unroasted', expectedChapter: '09', expectedHeading: '0901', category: 'Coffee' },
  { query: 'roasted ground coffee', expectedChapter: '09', expectedHeading: '0901', category: 'Coffee' },
  { query: 'instant coffee powder', expectedChapter: '21', expectedHeading: '2101', category: 'Coffee' },
  { query: 'freeze-dried soluble coffee', expectedChapter: '21', expectedHeading: '2101', category: 'Coffee' },

  // CEMENT (Raw vs Article) - Ch.25 vs Ch.68
  { query: 'portland cement powder bulk', expectedChapter: '25', expectedHeading: '2523', category: 'Cement' },
  { query: 'cement clinker', expectedChapter: '25', expectedHeading: '2523', category: 'Cement' },
  { query: 'cement blocks for construction', expectedChapter: '68', expectedHeading: '6810', category: 'Cement' },
  { query: 'concrete tiles', expectedChapter: '68', expectedHeading: '6810', category: 'Cement' },

  // TEXTILES - Material + Construction
  { query: 'silk fabric woven', expectedChapter: '50', expectedHeading: '5007', category: 'Textiles' },
  { query: 'cotton woven fabric', expectedChapter: '52', expectedHeading: '5208', category: 'Textiles' },
  { query: 'knitted cotton t-shirt', expectedChapter: '61', expectedHeading: '6109', category: 'Textiles' },
  { query: 'woven cotton shirt men', expectedChapter: '62', expectedHeading: '6205', category: 'Textiles' },

  // SPICES - Ch.09
  { query: 'turmeric powder', expectedChapter: '09', expectedHeading: '0910', category: 'Spices' },
  { query: 'black pepper whole', expectedChapter: '09', expectedHeading: '0904', category: 'Spices' },
  { query: 'cardamom seeds', expectedChapter: '09', expectedHeading: '0908', category: 'Spices' },

  // PHARMACEUTICALS - Ch.30
  { query: 'paracetamol tablets 500mg', expectedChapter: '30', expectedHeading: '3004', category: 'Pharmaceuticals' },
  { query: 'amoxicillin capsules', expectedChapter: '30', expectedHeading: '3004', category: 'Pharmaceuticals' },

  // ELECTRONICS - Ch.85
  { query: 'lithium ion battery for laptop', expectedChapter: '85', expectedHeading: '8507', category: 'Electronics' },
  { query: 'LED display screen', expectedChapter: '85', expectedHeading: '8528', category: 'Electronics' },

  // SHOULD ASK QUESTION (Low specificity)
  { query: 'brake pads', expectedChapter: '', expectedQuestion: true, category: 'Questions' },
  { query: 'coffee', expectedChapter: '', expectedQuestion: true, category: 'Questions' },
  { query: 'filter', expectedChapter: '', expectedQuestion: true, category: 'Questions' },
];

async function runIntegrationTests() {
  console.log('\n========================================');
  console.log('INTEGRATION TEST SUITE');
  console.log('========================================\n');

  const results: { category: string; chapterPassed: number; headingPassed: number; total: number; failures: string[] }[] = [];
  const categories = [...new Set(TEST_SUITE.map(t => t.category))];

  let totalResponseTime = 0;
  let responseCount = 0;

  for (const category of categories) {
    const tests = TEST_SUITE.filter(t => t.category === category);
    let chapterPassed = 0;
    let headingPassed = 0;
    const failures: string[] = [];

    console.log(`\n--- ${category} ---`);

    for (const test of tests) {
      try {
        const startTime = Date.now();
        const result = await classify(test.query);
        const duration = Date.now() - startTime;
        totalResponseTime += duration;
        responseCount++;

        if (test.expectedQuestion) {
          // Should have asked a question
          if (result.responseType === 'question') {
            console.log(`✅ "${test.query}" → Asked question (${duration}ms)`);
            chapterPassed++;
            headingPassed++;
          } else {
            console.log(`❌ "${test.query}" → Should have asked question`);
            failures.push(`${test.query}: Should have asked question`);
          }
        } else {
          // Should have classified
          if (result.responseType === 'classification' && result.hsCode) {
            const chapter = result.hsCode.substring(0, 2);
            const heading = result.hsCode.substring(0, 4);

            const chapterCorrect = chapter === test.expectedChapter;
            const headingCorrect = !test.expectedHeading || heading === test.expectedHeading;

            if (chapterCorrect && headingCorrect) {
              console.log(`✅ "${test.query}" → ${result.hsCode} (${duration}ms)`);
              chapterPassed++;
              headingPassed++;
            } else if (chapterCorrect) {
              console.log(`⚠️ "${test.query}" → Ch.${chapter} ✓, Heading ${heading} (expected ${test.expectedHeading}) (${duration}ms)`);
              chapterPassed++;
              failures.push(`${test.query}: Heading ${heading}, expected ${test.expectedHeading}`);
            } else {
              console.log(`❌ "${test.query}" → Ch.${chapter} (expected Ch.${test.expectedChapter}) (${duration}ms)`);
              failures.push(`${test.query}: Got Ch.${chapter}, expected Ch.${test.expectedChapter}`);
            }
          } else {
            console.log(`❌ "${test.query}" → Unexpected question`);
            failures.push(`${test.query}: Asked question instead of classifying`);
          }
        }
      } catch (error) {
        console.log(`❌ "${test.query}" → ERROR: ${error}`);
        failures.push(`${test.query}: ${error}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    results.push({ category, chapterPassed, headingPassed, total: tests.length, failures });
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  let totalChapterPassed = 0;
  let totalHeadingPassed = 0;
  let totalTests = 0;

  for (const r of results) {
    const chapterPct = ((r.chapterPassed / r.total) * 100).toFixed(0);
    const headingPct = ((r.headingPassed / r.total) * 100).toFixed(0);
    const status = r.chapterPassed === r.total ? '✅' : '⚠️';
    console.log(`${status} ${r.category}: Chapter ${r.chapterPassed}/${r.total} (${chapterPct}%), Heading ${r.headingPassed}/${r.total} (${headingPct}%)`);

    if (r.failures.length > 0) {
      for (const f of r.failures) {
        console.log(`   ❌ ${f}`);
      }
    }

    totalChapterPassed += r.chapterPassed;
    totalHeadingPassed += r.headingPassed;
    totalTests += r.total;
  }

  const chapterAccuracy = ((totalChapterPassed / totalTests) * 100).toFixed(1);
  const headingAccuracy = ((totalHeadingPassed / totalTests) * 100).toFixed(1);
  const avgResponseTime = Math.round(totalResponseTime / responseCount);

  console.log('\n========================================');
  console.log('FINAL METRICS');
  console.log('========================================');
  console.log(`Chapter Accuracy:  ${totalChapterPassed}/${totalTests} (${chapterAccuracy}%) - Target: 95%`);
  console.log(`Heading Accuracy:  ${totalHeadingPassed}/${totalTests} (${headingAccuracy}%) - Target: 85%`);
  console.log(`Avg Response Time: ${avgResponseTime}ms - Target: <3000ms`);
  console.log('========================================\n');

  // Return results for CI
  return {
    chapterAccuracy: parseFloat(chapterAccuracy),
    headingAccuracy: parseFloat(headingAccuracy),
    avgResponseTime
  };
}

runIntegrationTests().then(results => {
  const targetsMet = results.chapterAccuracy >= 95 &&
                     results.headingAccuracy >= 85 &&
                     results.avgResponseTime < 3000;

  if (!targetsMet) {
    console.log('\n⚠️ WARNING: Some targets not met');
    if (results.chapterAccuracy < 95) console.log(`   Chapter accuracy ${results.chapterAccuracy}% < 95% target`);
    if (results.headingAccuracy < 85) console.log(`   Heading accuracy ${results.headingAccuracy}% < 85% target`);
    if (results.avgResponseTime >= 3000) console.log(`   Response time ${results.avgResponseTime}ms >= 3000ms target`);
    process.exit(1);
  } else {
    console.log('\n✅ All targets met! Ultimate HS Code Classifier ready.');
    process.exit(0);
  }
});

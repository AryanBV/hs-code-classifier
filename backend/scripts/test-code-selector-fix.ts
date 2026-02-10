// backend/scripts/test-code-selector-fix.ts
//
// Tests 3 known code-selector catch-all failures through full pipeline.
// Run: cd backend && $env:USE_BRAIN="true"; npx tsx scripts/test-code-selector-fix.ts

// CRITICAL: dotenv must load BEFORE classifier imports (OpenAI client reads env at module level)
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.USE_BRAIN = 'true';

interface TestCase {
  query: string;
  expectedCodePrefix: string;
  wrongCode: string;
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    query: 'plastic bumper for Toyota Innova',
    expectedCodePrefix: '8708.10',
    wrongCode: '8708.99.00',
    description: 'TC005: bumper → specific 8708.10.xx, NOT catch-all 8708.99.00',
  },
  {
    query: 'insulin injection 100IU/ml vial',
    expectedCodePrefix: '3004.31',
    wrongCode: '3004.90.00',
    description: 'TC207: insulin → specific 3004.31.xx, NOT catch-all 3004.90.00',
  },
  {
    query: 'DC motors: Wiper motor for automotive 12V',
    expectedCodePrefix: '8501.31',
    wrongCode: '8501.10.00',
    description: 'DB122: DC wiper motor → specific 8501.31.xx, NOT general 8501.10.00',
  },
];

async function run(): Promise<void> {
  const { classify } = await import('../src/classifier');

  console.log('='.repeat(60));
  console.log('Code Selector Anti-Catch-All Fix Test (3 cases)');
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i]!;
    console.log(`[${i + 1}/3] "${tc.query}"`);
    console.log(`  ${tc.description}`);

    try {
      const result = await classify(tc.query);

      if (result.responseType === 'question') {
        console.log(`  SKIP: Pipeline asked a question instead of classifying`);
        console.log('');
        continue;
      }

      const code = result.hsCode || '';

      if (code === tc.wrongCode) {
        console.log(`  FAIL: Got catch-all ${code} (this is the known bug)`);
      } else if (code.startsWith(tc.expectedCodePrefix)) {
        console.log(`  PASS: Got ${code} (matches expected prefix ${tc.expectedCodePrefix})`);
        passed++;
      } else {
        console.log(`  PARTIAL: Got ${code} (avoided catch-all but different prefix than ${tc.expectedCodePrefix})`);
        passed++; // Still counts as avoiding the catch-all
      }
      console.log(`  Confidence: ${result.confidence}%`);
      console.log(`  Reasoning: ${(result.reasoning || '').substring(0, 120)}`);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }

    console.log('');
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('='.repeat(60));
  console.log(`RESULTS: ${passed}/3 avoided catch-all codes`);
  console.log('='.repeat(60));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

// backend/scripts/test-heading-reranker.ts
//
// Tests 3 known heading-level failures through full pipeline with LLM re-ranker.
// Run: cd backend && $env:USE_BRAIN="true"; npx tsx scripts/test-heading-reranker.ts

// CRITICAL: dotenv must load BEFORE classifier imports (OpenAI client reads env at module level)
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.USE_BRAIN = 'true';

interface TestCase {
  query: string;
  expectedHeading: string;
  failedWith: string;
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    query: 'rubber oil seals for automobile engines',
    expectedHeading: '8708',
    failedWith: '8706',
    description: 'Vehicle parts: 8708 (parts+accessories) NOT 8706 (chassis)',
  },
  {
    query: 'denim jeans men\'s cotton woven',
    expectedHeading: '6203',
    failedWith: '6205',
    description: 'Textiles: 6203 (trousers) NOT 6205 (shirts)',
  },
  {
    query: 'Cumin, than black: seed quality',
    expectedHeading: '0909',
    failedWith: '0910',
    description: 'Spices: 0909 (cumin/anise/fennel) NOT 0910 (ginger/turmeric)',
  },
];

async function run(): Promise<void> {
  const { classify } = await import('../src/classifier');

  console.log('='.repeat(60));
  console.log('Heading Re-Ranker Test (3 known failure cases)');
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
      const heading = code.replace(/\./g, '').substring(0, 4);

      if (heading === tc.expectedHeading) {
        console.log(`  PASS: Got heading ${heading} (code: ${code})`);
        passed++;
      } else if (heading === tc.failedWith) {
        console.log(`  FAIL: Still getting old wrong heading ${heading} (code: ${code})`);
      } else {
        console.log(`  DIFFERENT: Got heading ${heading} (code: ${code}) — not expected ${tc.expectedHeading} but not old failure ${tc.failedWith} either`);
      }
      console.log(`  Confidence: ${result.confidence}%`);
      console.log(`  Reasoning: ${(result.reasoning || '').substring(0, 200)}`);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }

    console.log('');
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('='.repeat(60));
  console.log(`RESULTS: ${passed}/3 headings now correct`);
  console.log('='.repeat(60));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

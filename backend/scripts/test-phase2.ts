/**
 * PHASE 2: Chapter Predictor Test Script
 *
 * Tests the chapter predictor functionality including:
 * - Functional overrides (brake pads, toys, furniture, vacuum flasks)
 * - Ambiguous terms (coffee, tea)
 * - Chapter predictions
 *
 * Run with: npx ts-node scripts/test-phase2.ts
 */

import dotenv from 'dotenv';
dotenv.config();

// Import the chapter predictor functions
import {
  predictChapters,
  checkFunctionalOverrides,
  checkAmbiguousTerms,
  explainChapterPredictions,
  getPredictedChaptersArray
} from '../src/services/chapter-predictor.service';

// Import the multi-candidate search to test full flow
import { semanticSearchMulti } from '../src/services/multi-candidate-search.service';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

interface TestCase {
  query: string;
  expectedChapter: string;
  testType: 'functional_override' | 'ambiguous' | 'prediction' | 'full_search';
  description: string;
}

const testCases: TestCase[] = [
  // CRITICAL: Functional override tests - these must pass
  {
    query: 'brake pads for cars',
    expectedChapter: '87',
    testType: 'functional_override',
    description: 'Brake pads should go to Ch.87 (vehicle parts), NOT cosmetic pads'
  },
  {
    query: 'ceramic brake pads',
    expectedChapter: '87',
    testType: 'functional_override',
    description: 'Ceramic brake pads should go to Ch.87 (vehicle parts), NOT ceramics Ch.69'
  },
  {
    query: 'automotive brake pads',
    expectedChapter: '87',
    testType: 'functional_override',
    description: 'Automotive brake pads should go to Ch.87'
  },
  {
    query: 'plastic toys',
    expectedChapter: '95',
    testType: 'functional_override',
    description: 'Plastic toys should go to Ch.95 (toys), NOT plastics Ch.39'
  },
  {
    query: 'wooden furniture',
    expectedChapter: '94',
    testType: 'functional_override',
    description: 'Wooden furniture should go to Ch.94 (furniture), NOT wood Ch.44'
  },
  {
    query: 'vacuum flask',
    expectedChapter: '96',
    testType: 'functional_override',
    description: 'Vacuum flask should go to Ch.96 (miscellaneous)'
  },

  // Ambiguous term tests
  {
    query: 'coffee',
    expectedChapter: '',  // Should ask for disambiguation
    testType: 'ambiguous',
    description: 'Generic "coffee" should trigger disambiguation question'
  },

  // Clear prediction tests (not ambiguous)
  {
    query: 'instant coffee',
    expectedChapter: '21',
    testType: 'prediction',
    description: 'Instant coffee should predict Ch.21'
  },
  {
    query: 'roasted coffee beans',
    expectedChapter: '09',
    testType: 'prediction',
    description: 'Roasted coffee beans should predict Ch.09'
  },

  // Full search tests
  {
    query: 'brake pads for cars',
    expectedChapter: '87',
    testType: 'full_search',
    description: 'Full search for brake pads should return 87xx codes'
  },
  {
    query: 'ceramic brake pads',
    expectedChapter: '87',
    testType: 'full_search',
    description: 'Full search for ceramic brake pads should return 87xx codes'
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  log(`\n${'─'.repeat(80)}`, colors.cyan);
  log(`Testing: "${testCase.query}"`, colors.bright);
  log(`Expected: Ch.${testCase.expectedChapter || 'DISAMBIGUATION'}`, colors.blue);
  log(`Type: ${testCase.testType}`, colors.yellow);
  log(`${testCase.description}`, colors.reset);
  log('', colors.reset);

  let passed = false;

  try {
    switch (testCase.testType) {
      case 'functional_override': {
        const override = checkFunctionalOverrides(testCase.query);
        if (override) {
          log(`  Functional Override: Ch.${override.forceChapter}`, colors.green);
          log(`  Reason: ${override.reason}`, colors.reset);
          passed = override.forceChapter === testCase.expectedChapter;
        } else {
          log(`  No functional override found!`, colors.red);
          passed = false;
        }
        break;
      }

      case 'ambiguous': {
        const ambiguity = checkAmbiguousTerms(testCase.query);
        if (ambiguity) {
          log(`  Ambiguous term: "${ambiguity.term}"`, colors.yellow);
          log(`  Question: ${ambiguity.info.disambiguationQuestion}`, colors.reset);
          log(`  Options:`, colors.reset);
          ambiguity.info.options.forEach(opt => {
            log(`    - ${opt.label} → Ch.${opt.chapter}`, colors.reset);
          });
          passed = true; // We expected ambiguity
        } else {
          log(`  Not detected as ambiguous`, colors.red);
          passed = false;
        }
        break;
      }

      case 'prediction': {
        const result = predictChapters(testCase.query);
        log(`  Predictions:`, colors.reset);
        result.predictions.slice(0, 3).forEach((p, i) => {
          const isExpected = p.chapter === testCase.expectedChapter;
          const marker = isExpected ? '✓' : ' ';
          const color = isExpected ? colors.green : colors.reset;
          log(`  ${marker} ${i + 1}. Ch.${p.chapter} (${p.name}): ${(p.confidence * 100).toFixed(1)}%`, color);
        });

        if (result.functionalOverride) {
          log(`  Functional Override: Ch.${result.functionalOverride.chapter}`, colors.magenta);
          passed = result.functionalOverride.chapter === testCase.expectedChapter;
        } else {
          const topChapter = result.predictions[0]?.chapter;
          passed = topChapter === testCase.expectedChapter;
        }
        break;
      }

      case 'full_search': {
        log(`  Running full semantic search...`, colors.yellow);
        const results = await semanticSearchMulti(testCase.query, 20);

        // Check if majority of top 10 results are from expected chapter
        const top10 = results.slice(0, 10);
        const fromExpectedChapter = top10.filter(r => r.code.startsWith(testCase.expectedChapter));
        const percentage = (fromExpectedChapter.length / top10.length) * 100;

        log(`  Top 10 results:`, colors.reset);
        top10.forEach((r, i) => {
          const isExpected = r.code.startsWith(testCase.expectedChapter);
          const color = isExpected ? colors.green : colors.red;
          log(`    ${i + 1}. ${r.code}: ${r.description?.substring(0, 50)}... (score: ${r.score.toFixed(1)})`, color);
        });

        log(`  From Ch.${testCase.expectedChapter}: ${fromExpectedChapter.length}/10 (${percentage.toFixed(0)}%)`, colors.cyan);

        // Pass if at least 70% are from expected chapter
        passed = percentage >= 70;
        break;
      }
    }
  } catch (error) {
    log(`  ERROR: ${error}`, colors.red);
    passed = false;
  }

  if (passed) {
    log(`  ✅ PASSED`, colors.green);
  } else {
    log(`  ❌ FAILED`, colors.red);
  }

  return passed;
}

async function main() {
  console.log('\n');
  log('╔═══════════════════════════════════════════════════════════════════════════╗', colors.magenta);
  log('║                  PHASE 2: CHAPTER PREDICTOR TEST SUITE                     ║', colors.magenta);
  log('╚═══════════════════════════════════════════════════════════════════════════╝', colors.magenta);

  const results: { test: string; passed: boolean }[] = [];

  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    results.push({ test: testCase.query, passed });
  }

  // Summary
  console.log('\n');
  log('═'.repeat(80), colors.cyan);
  log('                           TEST SUMMARY', colors.bright);
  log('═'.repeat(80), colors.cyan);

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const color = r.passed ? colors.green : colors.red;
    log(`  ${status}  ${r.test}`, color);
  });

  console.log('\n');
  log(`  Total: ${results.length}  |  Passed: ${passedCount}  |  Failed: ${failedCount}`, colors.bright);

  if (failedCount === 0) {
    log('\n  🎉 ALL TESTS PASSED!', colors.green);
  } else {
    log(`\n  ⚠️  ${failedCount} TEST(S) FAILED`, colors.red);
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);

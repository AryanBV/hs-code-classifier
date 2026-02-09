/**
 * Session 5 A/B Test: Notes vs No Notes
 *
 * Tests ONLY products that take the LLM path (not rule path).
 * Compares classification accuracy with and without chapter notes.
 *
 * Purpose: Prove whether the notes system built in Sessions 1-3 is valuable.
 */

import dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });

import * as fs from 'fs';
import * as path from 'path';
import { extractAttributes } from '../../../classifier/attribute-extractor';
import { routeToChapter } from '../../../classifier/chapter-router';
import { applyChapterRules } from '../../../rules/chapter-rules';
import {
  SESSION5_ALL_PRODUCTS,
  Session5TestProduct,
  ABTestResult,
  ABTestMetrics
} from '../test-data';

const RATE_LIMIT_MS = 1000;  // Longer delay for A/B test (2 API calls per product)
const RESULTS_DIR = path.resolve(__dirname, '../results');

async function runABTest(): Promise<{
  metrics: ABTestMetrics;
  results: ABTestResult[];
}> {
  console.log('\n========================================');
  console.log('SESSION 5: A/B TEST - NOTES vs NO NOTES');
  console.log('========================================\n');

  // Filter to only LLM-path products
  console.log('Identifying LLM-path products...');
  const llmProducts = await filterLLMPathProducts();
  console.log(`Total products: ${SESSION5_ALL_PRODUCTS.length}`);
  console.log(`LLM path products: ${llmProducts.length}`);
  console.log(`Rule path products: ${SESSION5_ALL_PRODUCTS.length - llmProducts.length}\n`);

  if (llmProducts.length === 0) {
    console.log('\u26A0\uFE0F No products take LLM path - all matched rules');
    return {
      metrics: createEmptyMetrics(),
      results: []
    };
  }

  const results: ABTestResult[] = [];

  for (const [index, product] of llmProducts.entries()) {
    const progress = `[${index + 1}/${llmProducts.length}]`;

    try {
      const result = await runABTestForProduct(product);
      results.push(result);

      const notesIcon = result.notesImprovedResult ? '\uD83D\uDCC8'  // Chart increasing
        : (result.notesMadeADifference && !result.withNotesCorrect && result.withoutNotesCorrect) ? '\uD83D\uDCC9'  // Chart decreasing
        : '\u2796';  // Minus

      console.log(
        `${progress} ${notesIcon} ${product.id}: ` +
        `WithNotes=${result.withNotes.chapter} ` +
        `WithoutNotes=${result.withoutNotes.chapter} ` +
        `Expected=${product.expectedChapter}`
      );

      if (result.notesImprovedResult) {
        console.log(`         \u2705 Notes HELPED: ${result.withoutNotes.chapter} \u2192 ${result.withNotes.chapter}`);
      } else if (result.notesMadeADifference && !result.withNotesCorrect) {
        console.log(`         \u274C Notes HURT: ${result.withoutNotes.chapter} \u2192 ${result.withNotes.chapter}`);
      }
    } catch (error) {
      console.error(`${progress} \u274C ${product.id}: ERROR - ${error}`);
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  const metrics = calculateABMetrics(results);
  printABSummary(metrics, results, llmProducts);
  saveABResults(metrics, results, llmProducts);

  return { metrics, results };
}

async function filterLLMPathProducts(): Promise<Session5TestProduct[]> {
  const llmProducts: Session5TestProduct[] = [];

  for (const product of SESSION5_ALL_PRODUCTS) {
    const attrs = await extractAttributes(product.query);
    const matchedRule = applyChapterRules(attrs);

    // If no rule matches, this product takes the LLM path
    if (!matchedRule) {
      llmProducts.push(product);
    }
  }

  return llmProducts;
}

async function runABTestForProduct(
  product: Session5TestProduct
): Promise<ABTestResult> {
  const attrs = await extractAttributes(product.query);

  // Run WITH notes (normal path)
  delete process.env.DISABLE_CHAPTER_NOTES;
  const startWithNotes = Date.now();
  const withNotesResult = await routeToChapter(attrs);
  const timeWithNotes = Date.now() - startWithNotes;

  // Wait a bit to avoid rate limits
  await new Promise(r => setTimeout(r, 200));

  // Run WITHOUT notes
  process.env.DISABLE_CHAPTER_NOTES = 'true';
  const startWithoutNotes = Date.now();
  const withoutNotesResult = await routeToChapter(attrs);
  const timeWithoutNotes = Date.now() - startWithoutNotes;
  delete process.env.DISABLE_CHAPTER_NOTES;

  const acceptableChapters = [product.expectedChapter, ...(product.alternativeChapters || [])];
  const withNotesCorrect = acceptableChapters.includes(withNotesResult.chapter);
  const withoutNotesCorrect = acceptableChapters.includes(withoutNotesResult.chapter);

  return {
    testId: product.id,
    query: product.query,
    expectedChapter: product.expectedChapter,
    withNotes: {
      chapter: withNotesResult.chapter,
      confidence: withNotesResult.confidence,
      responseTimeMs: timeWithNotes,
      notesUsed: withNotesResult.notes_used || [],
      girsApplied: withNotesResult.girs_applied || [],
      reasoning: withNotesResult.reasoning
    },
    withoutNotes: {
      chapter: withoutNotesResult.chapter,
      confidence: withoutNotesResult.confidence,
      responseTimeMs: timeWithoutNotes,
      reasoning: withoutNotesResult.reasoning
    },
    withNotesCorrect,
    withoutNotesCorrect,
    notesMadeADifference: withNotesResult.chapter !== withoutNotesResult.chapter,
    notesImprovedResult: withNotesCorrect && !withoutNotesCorrect
  };
}

function calculateABMetrics(results: ABTestResult[]): ABTestMetrics {
  const total = results.length;

  if (total === 0) {
    return createEmptyMetrics();
  }

  const withNotesCorrect = results.filter(r => r.withNotesCorrect).length;
  const withoutNotesCorrect = results.filter(r => r.withoutNotesCorrect).length;

  const improved = results.filter(r =>
    r.withNotesCorrect && !r.withoutNotesCorrect
  ).length;

  const degraded = results.filter(r =>
    !r.withNotesCorrect && r.withoutNotesCorrect
  ).length;

  const noChange = results.filter(r =>
    !r.notesMadeADifference
  ).length;

  return {
    totalLLMProducts: total,
    withNotesAccuracy: (withNotesCorrect / total) * 100,
    withoutNotesAccuracy: (withoutNotesCorrect / total) * 100,
    notesImprovementRate: (improved / total) * 100,
    notesDegradeRate: (degraded / total) * 100,
    noChangeRate: (noChange / total) * 100,
    avgConfidenceWithNotes:
      results.reduce((sum, r) => sum + r.withNotes.confidence, 0) / total,
    avgConfidenceWithoutNotes:
      results.reduce((sum, r) => sum + r.withoutNotes.confidence, 0) / total,
    avgTimeWithNotes:
      results.reduce((sum, r) => sum + r.withNotes.responseTimeMs, 0) / total,
    avgTimeWithoutNotes:
      results.reduce((sum, r) => sum + r.withoutNotes.responseTimeMs, 0) / total
  };
}

function createEmptyMetrics(): ABTestMetrics {
  return {
    totalLLMProducts: 0,
    withNotesAccuracy: 0,
    withoutNotesAccuracy: 0,
    notesImprovementRate: 0,
    notesDegradeRate: 0,
    noChangeRate: 0,
    avgConfidenceWithNotes: 0,
    avgConfidenceWithoutNotes: 0,
    avgTimeWithNotes: 0,
    avgTimeWithoutNotes: 0
  };
}

function printABSummary(
  metrics: ABTestMetrics,
  results: ABTestResult[],
  llmProducts: Session5TestProduct[]
): void {
  console.log('\n========================================');
  console.log('A/B TEST RESULTS');
  console.log('========================================\n');

  console.log('=== ACCURACY COMPARISON ===');
  console.log(`LLM products tested: ${metrics.totalLLMProducts}`);
  console.log(`WITH notes accuracy: ${metrics.withNotesAccuracy.toFixed(1)}%`);
  console.log(`WITHOUT notes accuracy: ${metrics.withoutNotesAccuracy.toFixed(1)}%`);
  const improvement = metrics.withNotesAccuracy - metrics.withoutNotesAccuracy;
  console.log(`Notes improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%`);

  console.log('\n=== NOTES IMPACT ===');
  const improved = results.filter(r => r.notesImprovedResult).length;
  const degraded = results.filter(r => !r.withNotesCorrect && r.withoutNotesCorrect).length;
  const noChange = results.filter(r => !r.notesMadeADifference).length;
  const different = results.filter(r => r.notesMadeADifference).length;

  console.log(`Notes improved result: ${improved} products (${metrics.notesImprovementRate.toFixed(1)}%)`);
  console.log(`Notes degraded result: ${degraded} products (${metrics.notesDegradeRate.toFixed(1)}%)`);
  console.log(`Notes made no difference: ${noChange} products (${metrics.noChangeRate.toFixed(1)}%)`);
  console.log(`Notes changed result (either way): ${different} products`);

  console.log('\n=== CONFIDENCE & TIMING ===');
  console.log(`Avg confidence WITH notes: ${metrics.avgConfidenceWithNotes.toFixed(1)}`);
  console.log(`Avg confidence WITHOUT notes: ${metrics.avgConfidenceWithoutNotes.toFixed(1)}`);
  console.log(`Avg time WITH notes: ${Math.round(metrics.avgTimeWithNotes)}ms`);
  console.log(`Avg time WITHOUT notes: ${Math.round(metrics.avgTimeWithoutNotes)}ms`);

  // Target check
  console.log('\n=== TARGET CHECK ===');
  const notesHelp = improvement > 0;
  console.log(`Notes improvement > 0%: ${improvement.toFixed(1)}% ${notesHelp ? '\u2705' : '\u274C'}`);

  // Show cases where notes helped
  const helpedCases = results.filter(r => r.notesImprovedResult);
  if (helpedCases.length > 0) {
    console.log('\n=== CASES WHERE NOTES HELPED ===');
    helpedCases.slice(0, 10).forEach(r => {
      console.log(`${r.testId}: ${r.withoutNotes.chapter} \u2192 ${r.withNotes.chapter} (expected: ${r.expectedChapter})`);
      console.log(`  Query: "${r.query.substring(0, 60)}..."`);
    });
  }

  // Show cases where notes hurt
  const hurtCases = results.filter(r => !r.withNotesCorrect && r.withoutNotesCorrect);
  if (hurtCases.length > 0) {
    console.log('\n=== CASES WHERE NOTES HURT ===');
    hurtCases.slice(0, 10).forEach(r => {
      console.log(`${r.testId}: ${r.withoutNotes.chapter} \u2192 ${r.withNotes.chapter} (expected: ${r.expectedChapter})`);
      console.log(`  Query: "${r.query.substring(0, 60)}..."`);
    });
  }
}

function saveABResults(
  metrics: ABTestMetrics,
  results: ABTestResult[],
  llmProducts: Session5TestProduct[]
): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session5-ab-test-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  const improvement = metrics.withNotesAccuracy - metrics.withoutNotesAccuracy;

  const output = {
    session: 'Session 5 A/B Test: Notes vs No Notes',
    timestamp: new Date().toISOString(),
    model: 'gpt-4o-mini',
    summary: {
      llmProductsTested: metrics.totalLLMProducts,
      withNotesAccuracy: `${metrics.withNotesAccuracy.toFixed(1)}%`,
      withoutNotesAccuracy: `${metrics.withoutNotesAccuracy.toFixed(1)}%`,
      notesImprovement: `${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%`,
      notesValueTarget: 'improvement > 0%',
      targetMet: improvement > 0
    },
    metrics,
    results
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`\n\u2705 A/B test results saved to: ${filepath}`);
}

// Main execution
runABTest()
  .then(({ metrics }) => {
    const improvement = metrics.withNotesAccuracy - metrics.withoutNotesAccuracy;
    const notesHelp = improvement > 0;

    console.log('\n========================================');
    if (notesHelp) {
      console.log(`\u2705 NOTES PROVIDE VALUE (+${improvement.toFixed(1)}%)`);
      console.log('Sessions 1-3 notes system is worth keeping.');
    } else if (improvement === 0) {
      console.log('\u26A0\uFE0F NOTES NEUTRAL (no improvement)');
      console.log('Consider simplifying by removing notes system.');
    } else {
      console.log(`\u274C NOTES HURT ACCURACY (${improvement.toFixed(1)}%)`);
      console.log('Investigate why notes are degrading results.');
    }
    console.log('========================================\n');
    process.exit(notesHelp ? 0 : 1);
  })
  .catch(error => {
    console.error('A/B test failed:', error);
    process.exit(1);
  });

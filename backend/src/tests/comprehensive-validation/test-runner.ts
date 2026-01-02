// backend/src/tests/comprehensive-validation/test-runner.ts

import { testCases, TestCase, testSummary } from './test-cases';
import { classifyWithSemanticSearch } from '../../services/semantic-classifier.service';
import { prisma } from '../../utils/prisma';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  testCase: TestCase;
  response: any;
  timing: number;
  chapterCorrect: boolean;
  headingCorrect: boolean | null;
  codeCorrect: boolean | null;
  responseType: 'classification' | 'questions' | 'error';
  returnedCode?: string;
  returnedChapter?: string;
  error?: string;
}

interface ValidationReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    questions: number;
    errors: number;
    chapterAccuracy: number;
    headingAccuracy: number;
    avgResponseTime: number;
  };
  byCategory: Record<string, {
    total: number;
    passed: number;
    chapterAccuracy: number;
  }>;
  byDifficulty: Record<string, {
    total: number;
    passed: number;
    chapterAccuracy: number;
  }>;
  failurePatterns: {
    pattern: string;
    count: number;
    examples: string[];
  }[];
  allResults: TestResult[];
}

async function runSingleTest(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await classifyWithSemanticSearch({
      productDescription: testCase.input,
      sessionId: `test_${testCase.id}`
    });

    const timing = Date.now() - startTime;

    // Extract returned values
    let returnedCode: string | undefined;
    let returnedChapter: string | undefined;
    let responseType: 'classification' | 'questions' | 'error' = 'error';

    if (response.responseType === 'classification' && response.result) {
      responseType = 'classification';
      returnedCode = response.result.hsCode;
      returnedChapter = returnedCode?.substring(0, 2).replace(/^0/, '');
    } else if (response.responseType === 'questions') {
      responseType = 'questions';
      // Try to extract chapter from first question option
      if (response.questions?.[0]?.options?.[0]) {
        const firstOption = response.questions[0].options[0];
        const optionCode = firstOption.split('::')[0];
        returnedChapter = optionCode?.substring(0, 2).replace(/^0/, '');
      }
    }

    // Check correctness
    const expectedChapterNorm = testCase.expectedChapter.replace(/^0/, '');
    const returnedChapterNorm = returnedChapter?.replace(/^0/, '');

    const acceptableChapters = [
      expectedChapterNorm,
      ...(testCase.acceptableChapters?.map(c => c.replace(/^0/, '')) || [])
    ];

    const chapterCorrect = returnedChapterNorm
      ? acceptableChapters.includes(returnedChapterNorm)
      : false;

    const headingCorrect = testCase.expectedHeading && returnedCode
      ? returnedCode.startsWith(testCase.expectedHeading)
      : null;

    const codeCorrect = testCase.expectedCode && returnedCode
      ? returnedCode === testCase.expectedCode
      : null;

    return {
      testCase,
      response,
      timing,
      chapterCorrect,
      headingCorrect,
      codeCorrect,
      responseType,
      returnedCode,
      returnedChapter
    };

  } catch (error) {
    return {
      testCase,
      response: null,
      timing: Date.now() - startTime,
      chapterCorrect: false,
      headingCorrect: null,
      codeCorrect: null,
      responseType: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function analyzeFailurePatterns(results: TestResult[]): ValidationReport['failurePatterns'] {
  const patterns: Record<string, { count: number; examples: string[] }> = {};

  const failures = results.filter(r => !r.chapterCorrect);

  for (const result of failures) {
    // Pattern: Wrong chapter returned
    if (result.returnedChapter && result.returnedChapter !== result.testCase.expectedChapter.replace(/^0/, '')) {
      const key = `Expected Ch.${result.testCase.expectedChapter} but got Ch.${result.returnedChapter}`;
      if (!patterns[key]) patterns[key] = { count: 0, examples: [] };
      patterns[key].count++;
      if (patterns[key].examples.length < 3) {
        patterns[key].examples.push(result.testCase.input);
      }
    }

    // Pattern: Returned question instead of classification
    if (result.responseType === 'questions') {
      const key = 'Returned question instead of direct classification';
      if (!patterns[key]) patterns[key] = { count: 0, examples: [] };
      patterns[key].count++;
      if (patterns[key].examples.length < 3) {
        patterns[key].examples.push(`${result.testCase.input} (expected Ch.${result.testCase.expectedChapter})`);
      }
    }

    // Pattern: Error occurred
    if (result.responseType === 'error') {
      const key = `Error: ${result.error?.substring(0, 50) || 'Unknown'}`;
      if (!patterns[key]) patterns[key] = { count: 0, examples: [] };
      patterns[key].count++;
      if (patterns[key].examples.length < 3) {
        patterns[key].examples.push(result.testCase.input);
      }
    }

    // Pattern: Category-specific failures
    const catKey = `${result.testCase.category} category failures`;
    if (!patterns[catKey]) patterns[catKey] = { count: 0, examples: [] };
    patterns[catKey].count++;
    if (patterns[catKey].examples.length < 3) {
      patterns[catKey].examples.push(result.testCase.input);
    }
  }

  return Object.entries(patterns)
    .map(([pattern, data]) => ({ pattern, ...data }))
    .sort((a, b) => b.count - a.count);
}

function generateReport(results: TestResult[]): ValidationReport {
  const classifications = results.filter(r => r.responseType === 'classification');
  const questions = results.filter(r => r.responseType === 'questions');
  const errors = results.filter(r => r.responseType === 'error');

  const chapterCorrect = results.filter(r => r.chapterCorrect);
  const headingResults = results.filter(r => r.headingCorrect !== null);
  const headingCorrect = headingResults.filter(r => r.headingCorrect);

  // By category
  const byCategory: Record<string, { total: number; passed: number; chapterAccuracy: number }> = {};
  for (const result of results) {
    const cat = result.testCase.category;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, passed: 0, chapterAccuracy: 0 };
    byCategory[cat].total++;
    if (result.chapterCorrect) byCategory[cat].passed++;
  }
  for (const cat of Object.keys(byCategory)) {
    const catData = byCategory[cat];
    if (catData) {
      catData.chapterAccuracy = Math.round((catData.passed / catData.total) * 100);
    }
  }

  // By difficulty
  const byDifficulty: Record<string, { total: number; passed: number; chapterAccuracy: number }> = {};
  for (const result of results) {
    const diff = result.testCase.difficulty;
    if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, passed: 0, chapterAccuracy: 0 };
    byDifficulty[diff].total++;
    if (result.chapterCorrect) byDifficulty[diff].passed++;
  }
  for (const diff of Object.keys(byDifficulty)) {
    const diffData = byDifficulty[diff];
    if (diffData) {
      diffData.chapterAccuracy = Math.round((diffData.passed / diffData.total) * 100);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: chapterCorrect.length,
      failed: results.length - chapterCorrect.length,
      questions: questions.length,
      errors: errors.length,
      chapterAccuracy: Math.round((chapterCorrect.length / results.length) * 100),
      headingAccuracy: headingResults.length > 0
        ? Math.round((headingCorrect.length / headingResults.length) * 100)
        : 0,
      avgResponseTime: Math.round(results.reduce((sum, r) => sum + r.timing, 0) / results.length)
    },
    byCategory,
    byDifficulty,
    failurePatterns: analyzeFailurePatterns(results),
    allResults: results
  };
}

async function runAllTests(): Promise<ValidationReport> {
  console.log('='.repeat(70));
  console.log('  COMPREHENSIVE VALIDATION SUITE');
  console.log('  Testing', testCases.length, 'products across', testSummary.byCategory.length, 'categories');
  console.log('='.repeat(70));
  console.log();

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    if (!tc) continue;

    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${testCases.length}] Testing "${tc.input.substring(0, 40).padEnd(40)}" `);

    const result = await runSingleTest(tc);
    results.push(result);

    // Print result
    if (result.responseType === 'error') {
      console.log('ERROR');
    } else if (result.chapterCorrect) {
      console.log(`PASS Ch.${result.returnedChapter} (${result.responseType})`);
    } else {
      console.log(`FAIL Ch.${result.returnedChapter || '??'} (expected ${tc.expectedChapter})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const report = generateReport(results);

  // Save report to file
  const reportPath = path.join(__dirname, 'results', `validation-${Date.now()}.json`);
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log();
  console.log('='.repeat(70));
  console.log('  VALIDATION RESULTS');
  console.log('='.repeat(70));
  console.log();
  console.log(`  Total Tests:        ${report.summary.total}`);
  console.log(`  Chapter Correct:    ${report.summary.passed} (${report.summary.chapterAccuracy}%)`);
  console.log(`  Chapter Wrong:      ${report.summary.failed} (${100 - report.summary.chapterAccuracy}%)`);
  console.log(`  Asked Questions:    ${report.summary.questions}`);
  console.log(`  Errors:             ${report.summary.errors}`);
  console.log(`  Avg Response Time:  ${report.summary.avgResponseTime}ms`);
  console.log();
  console.log('  BY CATEGORY:');
  for (const [cat, data] of Object.entries(report.byCategory)) {
    if (data) {
      const filled = Math.floor(data.chapterAccuracy / 5);
      const empty = 20 - filled;
      const bar = '#'.repeat(filled) + '-'.repeat(empty);
      console.log(`    ${cat.padEnd(15)} [${bar}] ${data.chapterAccuracy}% (${data.passed}/${data.total})`);
    }
  }
  console.log();
  console.log('  BY DIFFICULTY:');
  for (const [diff, data] of Object.entries(report.byDifficulty)) {
    if (data) {
      const filled = Math.floor(data.chapterAccuracy / 5);
      const empty = 20 - filled;
      const bar = '#'.repeat(filled) + '-'.repeat(empty);
      console.log(`    ${diff.padEnd(10)} [${bar}] ${data.chapterAccuracy}% (${data.passed}/${data.total})`);
    }
  }
  console.log();
  console.log('  TOP FAILURE PATTERNS:');
  for (const pattern of report.failurePatterns.slice(0, 5)) {
    console.log(`    - ${pattern.pattern} (${pattern.count}x)`);
    for (const ex of pattern.examples) {
      console.log(`        "${ex}"`);
    }
  }
  console.log();
  console.log(`  Report saved to: ${reportPath}`);
  console.log('='.repeat(70));

  return report;
}

// Run if executed directly
runAllTests()
  .then(report => {
    console.log();
    console.log('Validation complete. Overall accuracy:', report.summary.chapterAccuracy + '%');
    process.exit(report.summary.chapterAccuracy >= 70 ? 0 : 1);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

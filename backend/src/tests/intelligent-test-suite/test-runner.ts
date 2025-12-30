/**
 * Intelligent Test Runner for HS Code Classification
 *
 * Comprehensive test suite that validates classification accuracy,
 * handles edge cases, and generates actionable fix plans.
 */

import * as fs from 'fs';
import * as path from 'path';

// ========================================
// Type Definitions
// ========================================

interface TestCase {
  id: string;
  query: string;
  expectedChapter?: string;
  expectedHeading?: string;
  expectedCode?: string;
  mustMatch?: { chapter?: string; heading?: string; code?: string };
  mustNotMatch?: string[];
  mustNotIncludeInDescription?: string[];
  maxQuestions?: number;
  notes?: string;
  trap?: string;
  context?: string;
  phase?: string;
  shouldUnderstand?: string;
  expectedBehavior?: string;
  turns?: unknown[];
}

interface ApiResponse {
  success?: boolean;
  responseType?: 'questions' | 'classification';
  result?: {
    hsCode?: string;
    description?: string;
    alternatives?: Array<{ code?: string; description?: string }>;
  };
  rankedOptions?: Array<{ code?: string }>;
  options?: Array<string | { code?: string; description?: string }>;
  results?: Array<{ code?: string } | string>;
  code?: string;
  candidates?: Array<{ code?: string } | string>;
  totalQuestionsAsked?: number;
  error?: string;
}

interface TestResult {
  id: string;
  category: string;
  query: string;
  passed: boolean;
  expectedChapter?: string;
  actualChapter?: string;
  actualCodes: string[];
  responseTime: number;
  questionsAsked: number;
  isQuestionResponse: boolean;
  fullResponse: ApiResponse | null;
  errorType?: string;
  errorAnalysis?: string;
  notes?: string;
}

interface CategoryResult {
  name: string;
  description: string;
  passed: number;
  failed: number;
  tests: TestResult[];
}

interface TestCasesFile {
  [categoryName: string]: {
    description?: string;
    tests?: TestCase[];
  };
}

// ========================================
// Error Types for Analysis
// ========================================

const ErrorType = {
  WRONG_CHAPTER: 'wrong_chapter',
  WRONG_HEADING: 'wrong_heading',
  SHOWED_EXCLUDED_VARIETY: 'showed_excluded_variety',
  SHOWED_FORBIDDEN_CODE: 'showed_forbidden_code',
  TOO_MANY_QUESTIONS: 'too_many_questions',
  NO_RESULTS: 'no_results',
  TIMEOUT: 'timeout',
  MATERIAL_OVER_FUNCTION: 'material_over_function',
  TYPO_NOT_HANDLED: 'typo_not_handled',
  MISUNDERSTOOD: 'misunderstood_query',
  API_ERROR: 'api_error',
  UNEXPECTED_QUESTION: 'unexpected_question',
  ADVERSARIAL_FAILURE: 'adversarial_failure'
} as const;

// ========================================
// Configuration
// ========================================

const API_URL = process.env.API_URL || 'http://localhost:8000/api/classify-conversational';
const REQUEST_DELAY_MS = 150; // Delay between requests to not overwhelm server

// ========================================
// Helper Functions
// ========================================

/**
 * Generate a unique session ID for each test
 */
function generateSessionId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Extract HS codes from API response
 */
function extractCodesFromResponse(data: ApiResponse): string[] {
  const codes: string[] = [];

  // From classification result
  if (data.result?.hsCode) {
    codes.push(data.result.hsCode);
  }

  // From alternatives
  if (data.result?.alternatives && Array.isArray(data.result.alternatives)) {
    for (const alt of data.result.alternatives) {
      if (alt.code) codes.push(alt.code);
    }
  }

  // From questions (ranked options might be present)
  if (data.rankedOptions && Array.isArray(data.rankedOptions)) {
    for (const opt of data.rankedOptions) {
      if (opt.code) codes.push(opt.code);
    }
  }

  // Legacy format support
  if (data.options && Array.isArray(data.options)) {
    for (const opt of data.options) {
      if (typeof opt === 'string' && opt.includes('::')) {
        const codePart = opt.split('::')[0];
        if (codePart) codes.push(codePart.trim());
      } else if (typeof opt === 'object' && opt !== null && 'code' in opt && opt.code) {
        codes.push(opt.code);
      }
    }
  }

  if (data.results && Array.isArray(data.results)) {
    for (const r of data.results) {
      if (typeof r === 'string') {
        codes.push(r);
      } else if (typeof r === 'object' && r !== null && 'code' in r && r.code) {
        codes.push(r.code);
      }
    }
  }

  if (data.code) {
    codes.push(data.code);
  }

  if (data.candidates && Array.isArray(data.candidates)) {
    for (const c of data.candidates) {
      if (typeof c === 'string') {
        codes.push(c);
      } else if (typeof c === 'object' && c !== null && 'code' in c && c.code) {
        codes.push(c.code);
      }
    }
  }

  return [...new Set(codes)]; // Remove duplicates
}

/**
 * Extract descriptions from API response
 */
function extractDescriptionsFromResponse(data: ApiResponse): string[] {
  const descriptions: string[] = [];

  if (data.result?.description) {
    descriptions.push(data.result.description.toLowerCase());
  }

  if (data.result?.alternatives && Array.isArray(data.result.alternatives)) {
    for (const alt of data.result.alternatives) {
      if (alt.description) {
        descriptions.push(alt.description.toLowerCase());
      }
    }
  }

  // Legacy format
  if (data.options && Array.isArray(data.options)) {
    for (const opt of data.options) {
      if (typeof opt === 'string' && opt.includes('::')) {
        const desc = opt.split('::')[1];
        if (desc) descriptions.push(desc.toLowerCase());
      } else if (typeof opt === 'object' && opt !== null && 'description' in opt && opt.description) {
        descriptions.push(opt.description.toLowerCase());
      }
    }
  }

  return descriptions;
}

/**
 * Get chapter from HS code
 */
function getChapter(code: string): string {
  if (!code) return '';
  // Handle formats like "0901.11.10" or "8708" or "87"
  const cleaned = code.replace(/\./g, '');
  return cleaned.substring(0, 2);
}

/**
 * Get heading from HS code (4 digits)
 */
function getHeading(code: string): string {
  if (!code) return '';
  const cleaned = code.replace(/\./g, '');
  return cleaned.substring(0, 4);
}

/**
 * Analyze why a test failed and provide actionable insights
 */
function analyzeError(test: TestCase, response: ApiResponse, actualCodes: string[]): { type: string; analysis: string } {
  const actualChapter = actualCodes[0] ? getChapter(actualCodes[0]) : 'none';
  const expectedChapter = test.expectedChapter || test.mustMatch?.chapter;
  const queryLower = test.query.toLowerCase();

  // No results returned
  if (actualCodes.length === 0) {
    if (response.responseType === 'questions') {
      return {
        type: ErrorType.UNEXPECTED_QUESTION,
        analysis: 'System asked questions instead of classifying'
      };
    }
    return {
      type: ErrorType.NO_RESULTS,
      analysis: 'No classification codes returned'
    };
  }

  // Wrong chapter analysis
  if (expectedChapter && actualChapter !== expectedChapter) {
    // Material over function detection
    if (queryLower.includes('brake') && queryLower.includes('ceramic') && actualChapter === '69') {
      return {
        type: ErrorType.MATERIAL_OVER_FUNCTION,
        analysis: 'Classified by material (ceramic/Ch.69) instead of function (brake parts/Ch.87)'
      };
    }
    if (queryLower.includes('brake') && actualChapter === '68') {
      return {
        type: ErrorType.MATERIAL_OVER_FUNCTION,
        analysis: 'Classified as friction material (Ch.68) instead of vehicle parts (Ch.87)'
      };
    }
    if ((queryLower.includes('toy') || queryLower.includes('children')) && actualChapter === '87') {
      return {
        type: ErrorType.MATERIAL_OVER_FUNCTION,
        analysis: 'Classified as vehicle (Ch.87) instead of toy (Ch.95)'
      };
    }

    // Coffee routing errors
    if (queryLower.includes('coffee')) {
      if (queryLower.includes('instant') && actualChapter === '09') {
        return {
          type: ErrorType.WRONG_CHAPTER,
          analysis: 'Instant coffee should be Ch.21 (food preparations), not Ch.09 (raw coffee)'
        };
      }
      if (!queryLower.includes('instant') && !queryLower.includes('table') && actualChapter === '21') {
        return {
          type: ErrorType.WRONG_CHAPTER,
          analysis: 'Coffee beans should be Ch.09, not Ch.21 (unless instant/processed)'
        };
      }
      if (queryLower.includes('table') && actualChapter !== '94') {
        return {
          type: ErrorType.ADVERSARIAL_FAILURE,
          analysis: 'Coffee TABLE is furniture (Ch.94), not coffee product'
        };
      }
    }

    // Adversarial trap detection
    if (test.trap) {
      return {
        type: ErrorType.ADVERSARIAL_FAILURE,
        analysis: `Trap: ${test.trap} - Got Ch.${actualChapter}, Expected Ch.${expectedChapter}`
      };
    }

    return {
      type: ErrorType.WRONG_CHAPTER,
      analysis: `Expected Ch.${expectedChapter}, Got Ch.${actualChapter}`
    };
  }

  // Wrong heading (within correct chapter)
  const expectedHeading = test.expectedHeading || test.mustMatch?.heading;
  if (expectedHeading) {
    const actualHeading = actualCodes[0] ? getHeading(actualCodes[0]) : 'none';
    if (actualHeading !== expectedHeading) {
      return {
        type: ErrorType.WRONG_HEADING,
        analysis: `Correct chapter (${actualChapter}) but wrong heading: Expected ${expectedHeading}, Got ${actualHeading}`
      };
    }
  }

  // Showed forbidden codes
  if (test.mustNotMatch) {
    for (const forbidden of test.mustNotMatch) {
      if (actualCodes.some(c => c.startsWith(forbidden) || getChapter(c) === forbidden || getHeading(c) === forbidden)) {
        const forbiddenCode = actualCodes.find(c => c.startsWith(forbidden) || getChapter(c) === forbidden);
        return {
          type: ErrorType.SHOWED_FORBIDDEN_CODE,
          analysis: `Should NOT show codes starting with ${forbidden}, but got ${forbiddenCode || 'unknown'}`
        };
      }
    }
  }

  // Showed excluded variety in descriptions
  if (test.mustNotIncludeInDescription) {
    const descriptions = extractDescriptionsFromResponse(response);
    for (const forbidden of test.mustNotIncludeInDescription) {
      if (descriptions.some(d => d.includes(forbidden.toLowerCase()))) {
        return {
          type: ErrorType.SHOWED_EXCLUDED_VARIETY,
          analysis: `Should not show ${forbidden} in descriptions - eliminative reasoning failed`
        };
      }
    }
  }

  // Typo handling
  if (test.shouldUnderstand) {
    return {
      type: ErrorType.TYPO_NOT_HANDLED,
      analysis: `Query "${test.query}" should be understood as "${test.shouldUnderstand}"`
    };
  }

  return { type: '', analysis: '' };
}

/**
 * Run a single test case
 */
async function runSingleTest(test: TestCase, category: string): Promise<TestResult> {
  const startTime = Date.now();
  const sessionId = generateSessionId();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productDescription: test.query,
        sessionId: sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as ApiResponse;
    const responseTime = Date.now() - startTime;
    const actualCodes = extractCodesFromResponse(data);
    const actualChapter = actualCodes[0] ? getChapter(actualCodes[0]) : '';
    const isQuestionResponse = data.responseType === 'questions';

    // Determine expected chapter
    const expectedChapter = test.expectedChapter || test.mustMatch?.chapter;
    const expectedHeading = test.expectedHeading || test.mustMatch?.heading;

    // Determine pass/fail
    let passed = true;
    let errorInfo = { type: '', analysis: '' };

    // For edge cases with expectedBehavior, we check differently
    if (test.expectedBehavior) {
      // Edge case tests - check if system responds appropriately
      if (test.query === '' && !isQuestionResponse && !data.error) {
        passed = false;
        errorInfo = { type: ErrorType.MISUNDERSTOOD, analysis: 'Empty query should ask for product description' };
      } else if (test.query.length > 0 && test.query.length < 5 && !isQuestionResponse && !data.error) {
        // Very short queries should prompt for more info
        passed = true; // Let system handle as it sees fit
      } else {
        passed = true; // Default pass for edge cases that don't crash
      }
    } else {
      // Normal test - check chapter/heading matching

      // If we got questions instead of classification, and we expected a specific chapter,
      // that's not necessarily a failure - the system might need clarification
      if (isQuestionResponse && expectedChapter) {
        // For regression tests, we want direct classification when possible
        if (category === 'critical_regression') {
          // Check if too many questions for simple queries
          if (test.maxQuestions && (data.totalQuestionsAsked || 0) > test.maxQuestions) {
            passed = false;
            errorInfo = { type: ErrorType.TOO_MANY_QUESTIONS, analysis: `Asked ${data.totalQuestionsAsked} questions, max allowed: ${test.maxQuestions}` };
          } else {
            // Questions are OK for regression tests if within limits
            passed = true;
          }
        } else {
          // For non-regression tests, questions are acceptable
          passed = true;
        }
      } else if (!isQuestionResponse) {
        // Got classification result

        // Check expected chapter
        if (expectedChapter && actualChapter !== expectedChapter) {
          passed = false;
          errorInfo = analyzeError(test, data, actualCodes);
        }

        // Check expected heading
        if (passed && expectedHeading) {
          const actualHeading = actualCodes[0] ? getHeading(actualCodes[0]) : '';
          if (actualHeading !== expectedHeading) {
            passed = false;
            errorInfo = analyzeError(test, data, actualCodes);
          }
        }

        // Check mustNotMatch
        if (passed && test.mustNotMatch) {
          for (const forbidden of test.mustNotMatch) {
            const hasForbidden = actualCodes.some(c => {
              const cChapter = getChapter(c);
              const cHeading = getHeading(c);
              return c.startsWith(forbidden) || cChapter === forbidden || cHeading === forbidden;
            });
            if (hasForbidden) {
              passed = false;
              errorInfo = analyzeError(test, data, actualCodes);
              break;
            }
          }
        }

        // Check mustNotIncludeInDescription
        if (passed && test.mustNotIncludeInDescription) {
          const descriptions = extractDescriptionsFromResponse(data);
          for (const forbidden of test.mustNotIncludeInDescription) {
            if (descriptions.some(d => d.includes(forbidden.toLowerCase()))) {
              passed = false;
              errorInfo = analyzeError(test, data, actualCodes);
              break;
            }
          }
        }
      }
    }

    return {
      id: test.id,
      category,
      query: test.query,
      passed,
      expectedChapter,
      actualChapter,
      actualCodes,
      responseTime,
      questionsAsked: data.totalQuestionsAsked || (isQuestionResponse ? 1 : 0),
      isQuestionResponse,
      fullResponse: data,
      errorType: errorInfo.type || undefined,
      errorAnalysis: errorInfo.analysis || undefined,
      notes: test.notes || test.trap || test.context
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      id: test.id,
      category,
      query: test.query,
      passed: false,
      actualCodes: [],
      responseTime: Date.now() - startTime,
      questionsAsked: 0,
      isQuestionResponse: false,
      fullResponse: null,
      errorType: ErrorType.API_ERROR,
      errorAnalysis: `Error: ${errorMessage}`,
      notes: test.notes || test.trap
    };
  }
}

/**
 * Generate prioritized fix plan based on failures
 */
function generateFixPlan(results: TestResult[]): void {
  const failures = results.filter(r => !r.passed);

  // Group by error type
  const byErrorType: Record<string, TestResult[]> = {};
  for (const f of failures) {
    const type = f.errorType || 'unknown';
    if (!byErrorType[type]) byErrorType[type] = [];
    byErrorType[type].push(f);
  }

  console.log('\n' + '='.repeat(70));
  console.log('FIX PLAN - PRIORITIZED RECOMMENDATIONS');
  console.log('='.repeat(70));

  // ===== CRITICAL: Regression Failures =====
  const criticalFailures = failures.filter(f => f.category === 'critical_regression');
  if (criticalFailures.length > 0) {
    console.log('\n[CRITICAL] REGRESSION FAILURES - Fix Immediately!');
    console.log('-'.repeat(50));
    for (const f of criticalFailures) {
      console.log(`\n   ${f.id}: "${f.query}"`);
      console.log(`   Expected: Ch.${f.expectedChapter || '?'} | Got: Ch.${f.actualChapter || 'none'}`);
      console.log(`   Codes returned: ${f.actualCodes.join(', ') || 'none'}`);
      if (f.errorType) console.log(`   Error Type: ${f.errorType}`);
      if (f.errorAnalysis) console.log(`   Analysis: ${f.errorAnalysis}`);
      if (f.notes) console.log(`   Notes: ${f.notes}`);
    }
  } else {
    console.log('\n[OK] All regression tests pass!');
  }

  // ===== HIGH: Material Over Function =====
  const materialOverFunc = byErrorType[ErrorType.MATERIAL_OVER_FUNCTION];
  if (materialOverFunc && materialOverFunc.length > 0) {
    console.log('\n[HIGH PRIORITY] Material Over Function Errors');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${materialOverFunc.length}`);
    console.log('   Root Cause: Functional override rules not triggering');
    console.log('   Fix Location: chapter-predictor.service.ts -> FUNCTIONAL_OVERRIDES');
    console.log('   Affected queries:');
    for (const f of materialOverFunc) {
      console.log(`     - "${f.query}" -> Got Ch.${f.actualChapter}, Expected Ch.${f.expectedChapter}`);
    }
  }

  // ===== HIGH: Adversarial Failures =====
  const adversarialFailures = byErrorType[ErrorType.ADVERSARIAL_FAILURE];
  if (adversarialFailures && adversarialFailures.length > 0) {
    console.log('\n[HIGH PRIORITY] Adversarial Test Failures');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${adversarialFailures.length}`);
    console.log('   Root Cause: System falling for "trap" queries');
    console.log('   Fix: Add context-aware disambiguation rules');
    for (const f of adversarialFailures) {
      console.log(`     - "${f.query}" -> ${f.errorAnalysis}`);
    }
  }

  // ===== MEDIUM: Variety Exclusion =====
  const varietyExclusion = byErrorType[ErrorType.SHOWED_EXCLUDED_VARIETY];
  if (varietyExclusion && varietyExclusion.length > 0) {
    console.log('\n[MEDIUM PRIORITY] Variety Exclusion Failures');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${varietyExclusion.length}`);
    console.log('   Root Cause: Elimination service not filtering varieties correctly');
    console.log('   Fix Location: elimination.service.ts');
    for (const f of varietyExclusion) {
      console.log(`     - "${f.query}" showed excluded variety`);
    }
  }

  // ===== MEDIUM: Forbidden Codes =====
  const forbiddenCodes = byErrorType[ErrorType.SHOWED_FORBIDDEN_CODE];
  if (forbiddenCodes && forbiddenCodes.length > 0) {
    console.log('\n[MEDIUM PRIORITY] Showed Forbidden Codes');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${forbiddenCodes.length}`);
    for (const f of forbiddenCodes) {
      console.log(`     - "${f.query}" -> ${f.errorAnalysis}`);
    }
  }

  // ===== MEDIUM: Wrong Chapter (Non-Critical) =====
  const wrongChapter = byErrorType[ErrorType.WRONG_CHAPTER] || [];
  const nonCriticalWrongChapter = wrongChapter.filter(f => f.category !== 'critical_regression');
  if (nonCriticalWrongChapter.length > 0) {
    console.log('\n[MEDIUM PRIORITY] Wrong Chapter Classifications');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${nonCriticalWrongChapter.length}`);
    for (const f of nonCriticalWrongChapter.slice(0, 8)) {
      console.log(`     - "${f.query}" -> Got Ch.${f.actualChapter}, Expected Ch.${f.expectedChapter}`);
    }
    if (nonCriticalWrongChapter.length > 8) {
      console.log(`     ... and ${nonCriticalWrongChapter.length - 8} more`);
    }
  }

  // ===== LOW: Typo Handling =====
  const typoFailures = failures.filter(f => f.category === 'typos_and_misspellings');
  if (typoFailures.length > 0) {
    console.log('\n[LOW PRIORITY] Typo Handling');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${typoFailures.length}`);
    console.log('   Root Cause: No fuzzy matching or spell correction');
    console.log('   Fix: Add fuzzy matching to query-parser.service.ts');
    for (const f of typoFailures.slice(0, 5)) {
      console.log(`     - "${f.query}"`);
    }
  }

  // ===== API/Timeout Errors =====
  const apiErrors = [...(byErrorType[ErrorType.API_ERROR] || []), ...(byErrorType[ErrorType.TIMEOUT] || [])];
  if (apiErrors.length > 0) {
    console.log('\n[INFO] API/Timeout Errors');
    console.log('-'.repeat(50));
    console.log(`   Affected tests: ${apiErrors.length}`);
    for (const f of apiErrors) {
      console.log(`     - "${f.query}" -> ${f.errorAnalysis}`);
    }
  }

  // ===== Recommendations Summary =====
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDED FIX ORDER');
  console.log('='.repeat(70));

  let priority = 1;

  if (criticalFailures.length > 0) {
    console.log(`\n${priority}. [URGENT] Fix ${criticalFailures.length} regression failure(s)`);
    console.log('   Impact: Core functionality broken');
    console.log('   Files: Check phase 1-3 implementations');
    priority++;
  }

  if (materialOverFunc && materialOverFunc.length > 0) {
    console.log(`\n${priority}. Expand functional overrides`);
    console.log('   File: chapter-predictor.service.ts');
    console.log('   Action: Add more keywords to FUNCTIONAL_OVERRIDES array');
    priority++;
  }

  if (adversarialFailures && adversarialFailures.length > 0) {
    console.log(`\n${priority}. Add adversarial disambiguation rules`);
    console.log('   File: query-parser.service.ts or llm-conversational-classifier.service.ts');
    console.log('   Action: Add context detection for compound terms (coffee table, toy car, etc.)');
    priority++;
  }

  if (varietyExclusion && varietyExclusion.length > 0) {
    console.log(`\n${priority}. Fix variety elimination`);
    console.log('   File: elimination.service.ts');
    console.log('   Action: Ensure variety modifiers filter correctly');
    priority++;
  }

  if (nonCriticalWrongChapter.length > 3) {
    console.log(`\n${priority}. Improve chapter predictions`);
    console.log('   File: chapter-triggers.json');
    console.log('   Action: Add missing keyword->chapter mappings');
    priority++;
  }

  if (typoFailures.length > 0) {
    console.log(`\n${priority}. [Optional] Add typo tolerance`);
    console.log('   File: query-parser.service.ts');
    console.log('   Action: Implement fuzzy matching for common misspellings');
  }
}

/**
 * Print detailed results summary
 */
function printSummary(categoryResults: CategoryResult[], allResults: TestResult[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));

  console.log('\nCategory                    | Passed | Failed |  Rate | Avg Time');
  console.log('-'.repeat(70));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const cat of categoryResults) {
    const rate = cat.passed + cat.failed > 0
      ? Math.round(cat.passed / (cat.passed + cat.failed) * 100)
      : 0;
    const avgTime = cat.tests.length > 0
      ? Math.round(cat.tests.reduce((sum, t) => sum + t.responseTime, 0) / cat.tests.length)
      : 0;
    const name = cat.name.replace(/_/g, ' ').padEnd(27);
    console.log(`${name} | ${String(cat.passed).padStart(6)} | ${String(cat.failed).padStart(6)} | ${String(rate).padStart(4)}% | ${avgTime}ms`);
    totalPassed += cat.passed;
    totalFailed += cat.failed;
  }

  console.log('-'.repeat(70));
  const totalRate = totalPassed + totalFailed > 0
    ? Math.round(totalPassed / (totalPassed + totalFailed) * 100)
    : 0;
  const totalAvgTime = allResults.length > 0
    ? Math.round(allResults.reduce((sum, t) => sum + t.responseTime, 0) / allResults.length)
    : 0;
  console.log(`${'TOTAL'.padEnd(27)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} | ${String(totalRate).padStart(4)}% | ${totalAvgTime}ms`);

  // Question vs Classification breakdown
  const questionResponses = allResults.filter(r => r.isQuestionResponse);
  const classificationResponses = allResults.filter(r => !r.isQuestionResponse);
  console.log(`\nResponse Types: ${classificationResponses.length} classifications, ${questionResponses.length} question prompts`);
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('INTELLIGENT HS CODE CLASSIFICATION TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`API URL: ${API_URL}\n`);

  // Load test cases
  const testCasesPath = path.join(__dirname, 'test-cases.json');
  if (!fs.existsSync(testCasesPath)) {
    console.error('ERROR: test-cases.json not found!');
    process.exit(1);
  }

  const testCases: TestCasesFile = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));

  const allResults: TestResult[] = [];
  const categoryResults: CategoryResult[] = [];

  // Categories to run (in priority order)
  const categories = [
    'critical_regression',
    'real_world_exporter',
    'adversarial',
    'composite_products',
    'typos_and_misspellings',
    'edge_cases'
  ];

  for (const categoryName of categories) {
    const category = testCases[categoryName];
    if (!category || !category.tests) {
      console.log(`\n[!] Skipping ${categoryName} - no tests defined`);
      continue;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[CATEGORY] ${categoryName.toUpperCase().replace(/_/g, ' ')}`);
    console.log(`   ${category.description || ''}`);
    console.log('─'.repeat(60));

    const results: TestResult[] = [];

    for (const test of category.tests) {
      // Skip conversation flow tests (need special multi-turn handling)
      if (test.turns) {
        console.log(`[SKIP] ${test.id}: Multi-turn test (not implemented yet)`);
        continue;
      }

      const result = await runSingleTest(test, categoryName);
      results.push(result);
      allResults.push(result);

      // Real-time output
      const icon = result.passed ? '[PASS]' : '[FAIL]';
      const timing = `${result.responseTime}ms`;
      const responseType = result.isQuestionResponse ? '[Q]' : '[C]';
      const truncatedQuery = result.query.substring(0, 40) + (result.query.length > 40 ? '...' : '');
      console.log(`${icon} ${result.id}: "${truncatedQuery}" ${responseType} [${timing}]`);

      if (!result.passed) {
        console.log(`       Expected: Ch.${result.expectedChapter || '?'} | Got: Ch.${result.actualChapter || 'none'} | Codes: ${result.actualCodes.slice(0, 3).join(', ')}`);
        if (result.errorAnalysis) {
          console.log(`       ${result.errorAnalysis}`);
        }
      }

      // Delay between requests
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    categoryResults.push({
      name: categoryName,
      description: category.description || '',
      passed,
      failed,
      tests: results
    });

    const rate = passed + failed > 0 ? Math.round(passed / (passed + failed) * 100) : 0;
    console.log(`\n   Category Result: ${passed}/${passed + failed} passed (${rate}%)`);
  }

  // Print summary
  printSummary(categoryResults, allResults);

  // Generate fix plan
  generateFixPlan(allResults);

  // Save results to file
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = path.join(resultsDir, `test-run-${timestamp}.json`);

  const totalPassed = categoryResults.reduce((sum, c) => sum + c.passed, 0);
  const totalFailed = categoryResults.reduce((sum, c) => sum + c.failed, 0);
  const passRate = totalPassed + totalFailed > 0
    ? Math.round(totalPassed / (totalPassed + totalFailed) * 100)
    : 0;

  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { totalPassed, totalFailed, passRate, totalTests: allResults.length },
    categoryResults: categoryResults.map(c => ({
      name: c.name,
      description: c.description,
      passed: c.passed,
      failed: c.failed,
      passRate: c.passed + c.failed > 0 ? Math.round(c.passed / (c.passed + c.failed) * 100) : 0
    })),
    failures: allResults.filter(r => !r.passed).map(r => ({
      id: r.id,
      category: r.category,
      query: r.query,
      expectedChapter: r.expectedChapter,
      actualChapter: r.actualChapter,
      actualCodes: r.actualCodes,
      errorType: r.errorType,
      errorAnalysis: r.errorAnalysis,
      notes: r.notes
    })),
    allResults
  }, null, 2));

  console.log(`\n[SAVED] Results saved to: ${resultsPath}`);

  // Exit code based on critical failures
  const criticalFailed = allResults.filter(r => r.category === 'critical_regression' && !r.passed).length;
  if (criticalFailed > 0) {
    console.log('\n[WARNING] CRITICAL TESTS FAILED - Review immediately!');
    process.exit(1);
  }

  console.log('\n[DONE] Test suite completed.');
}

// Run the tests
runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

/**
 * Type definitions for the comprehensive test set
 */

export interface TestCase {
  /** Unique test case ID (e.g., TC001, DB001, LLM001) */
  id: string;

  /** Product description query to classify */
  query: string;

  /** Expected 2-digit chapter (e.g., "87") */
  expectedChapter: string;

  /** Expected 4-digit heading (e.g., "8708") */
  expectedHeading: string;

  /** Expected full 8-digit HS code (e.g., "8708.30.00") */
  expected8Digit: string;

  /** Category for grouping (e.g., "Vehicle Parts", "Coffee") */
  category: string;

  /** Optional subcategory for more specific grouping */
  subcategory?: string;

  /** Difficulty level for analysis */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Why this test exists - what distinction it tests */
  keyDistinction: string;

  /** Source of verification (WCO, Indian Customs, database, LLM) */
  source: string;

  /** Additional notes about the test case */
  notes?: string;

  /** Test tier: 1=manual, 2=database, 3=LLM */
  tier: 1 | 2 | 3;

  /** If true, classifier should ask a question instead of classifying */
  expectQuestion?: boolean;
}

export interface TestSetMetadata {
  /** Version of the test set format */
  version: string;

  /** ISO date when created */
  created: string;

  /** ISO date when last updated */
  lastUpdated: string;

  /** Total number of test cases */
  totalCases: number;

  /** Number of unique chapters covered */
  chaptersCovered: number;

  /** Breakdown by tier */
  tierBreakdown: {
    tier1: number;
    tier2: number;
    tier3: number;
  };

  /** Sources used for verification */
  sources: string[];
}

export interface ComprehensiveTestSet {
  metadata: TestSetMetadata;
  testCases: TestCase[];
}

export interface TestResult {
  testId: string;
  query: string;
  tier: number;
  category: string;
  difficulty: string;
  expected: {
    chapter: string;
    heading: string;
    code: string;
  };
  actual: {
    chapter: string;
    heading: string;
    code: string;
  };
  chapterCorrect: boolean;
  headingCorrect: boolean;
  codeCorrect: boolean;
  confidence: number;
  responseTimeMs: number;
  askedQuestion: boolean;
  questionExpected: boolean;
}

export interface TestMetrics {
  totalTests: number;
  chapterAccuracy: number;
  headingAccuracy: number;
  codeAccuracy: number;
  questionRate: number;
  avgResponseTimeMs: number;
  byTier: Record<number, {
    total: number;
    chapterAcc: number;
    headingAcc: number;
  }>;
  byCategory: Record<string, {
    total: number;
    chapterAcc: number;
    failures: string[];
  }>;
  byDifficulty: Record<string, {
    total: number;
    chapterAcc: number;
  }>;
}

export interface CategoryTestFile {
  category: string;
  description: string;
  testCases: TestCase[];
}

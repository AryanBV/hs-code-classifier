/**
 * Session 5 Test Data Types
 * Types for validation with verified test data
 */

export interface Session5TestProduct {
  id: string;
  query: string;
  expectedChapter: string;
  alternativeChapters?: string[];
  category: 'automotive' | 'simple' | 'itc-official' | 'ambiguous';
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;
  keyDistinction?: string;
}

export interface Session5Result {
  testId: string;
  query: string;
  category: string;
  expectedChapter: string;
  actualChapter: string;
  alternativeChapters?: string[];
  correct: boolean;
  correctOrAlternative: boolean;
  pathTaken: 'rule' | 'llm';
  ruleApplied?: string;
  girsApplied?: string[];
  notesUsed?: string[];
  confidence: number;
  responseTimeMs: number;
  reasoning: string;
  error?: string;
}

export interface Session5Metrics {
  totalTests: number;
  timestamp: string;

  // Overall accuracy
  overallChapterAccuracy: number;
  overallWithAlternatives: number;

  // By path
  byPath: {
    rule: {
      total: number;
      correct: number;
      accuracy: number;
      avgConfidence: number;
      avgResponseTimeMs: number;
    };
    llm: {
      total: number;
      correct: number;
      accuracy: number;
      avgConfidence: number;
      avgResponseTimeMs: number;
    };
  };

  // By category
  byCategory: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
    pathBreakdown: { rule: number; llm: number };
  }>;

  // By difficulty
  byDifficulty: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;

  // Targets
  targets: {
    overallChapterAccuracy: { target: number; actual: number; met: boolean };
    llmPathAccuracy: { target: number; actual: number; met: boolean };
  };
}

export interface ABTestResult {
  testId: string;
  query: string;
  expectedChapter: string;

  withNotes: {
    chapter: string;
    confidence: number;
    responseTimeMs: number;
    notesUsed: string[];
    girsApplied: string[];
    reasoning: string;
  };

  withoutNotes: {
    chapter: string;
    confidence: number;
    responseTimeMs: number;
    reasoning: string;
  };

  withNotesCorrect: boolean;
  withoutNotesCorrect: boolean;
  notesMadeADifference: boolean;
  notesImprovedResult: boolean;
}

export interface ABTestMetrics {
  totalLLMProducts: number;
  withNotesAccuracy: number;
  withoutNotesAccuracy: number;
  notesImprovementRate: number;
  notesDegradeRate: number;
  noChangeRate: number;
  avgConfidenceWithNotes: number;
  avgConfidenceWithoutNotes: number;
  avgTimeWithNotes: number;
  avgTimeWithoutNotes: number;
}

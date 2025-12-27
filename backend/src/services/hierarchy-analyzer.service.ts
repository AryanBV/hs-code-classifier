/**
 * Hierarchy Analyzer Service
 *
 * Analyzes the HS code hierarchy to determine ALL questions needed for classification.
 * This enables asking the RIGHT questions at the RIGHT time.
 *
 * KEY INSIGHT:
 * The HS code hierarchy IS the decision tree:
 * - 2 digits = Chapter (e.g., 09 = Coffee, Tea)
 * - 4 digits = Heading (e.g., 0901 = Coffee)
 * - 6 digits = Subheading (e.g., 0901.11 = Coffee, not roasted, not decaf)
 * - 8 digits = Tariff (e.g., 0901.11.10 = Arabica)
 *
 * Each level in the hierarchy represents a QUESTION:
 * - Chapter level: "What category?" (rarely needed - usually obvious)
 * - Heading level: "What type within category?" (sometimes needed)
 * - Subheading level: "What specific variant?" (often needed)
 * - Tariff level: "What fine distinction?" (always needed for 8-digit)
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Candidate } from './multi-candidate-search.service';

// ========================================
// Types
// ========================================

export interface HierarchyLevel {
  level: number;         // 1 = chapter, 2 = heading, 3 = subheading, 4 = tariff
  name: string;          // e.g., "Chapter", "Heading"
  digitCount: number;    // 2, 4, 6, or 8
  isDecisionPoint: boolean;  // True if multiple branches at this level
  branches: HierarchyBranch[];
  requiredQuestion?: RequiredQuestion;
}

export interface HierarchyBranch {
  code: string;
  description: string;
  childCount: number;
  hasLeaves: boolean;    // True if this branch has 8-digit codes
  totalLeafCodes: number;
}

export interface RequiredQuestion {
  level: number;
  dimension: string;     // What dimension does this question address?
  questionText: string;
  options: QuestionOption[];
  isResolved: boolean;   // True if already answered by description
  resolvedValue?: string;
}

export interface QuestionOption {
  value: string;
  displayText: string;
  matchingCodes: string[];
  branchCode?: string;   // The hierarchy branch this option leads to
}

export interface HierarchyAnalysis {
  dominantChapter: string;
  dominantHeading: string;
  levels: HierarchyLevel[];
  totalDecisionPoints: number;
  requiredQuestions: RequiredQuestion[];
  resolvedQuestions: RequiredQuestion[];
  candidatePathways: CandidatePathway[];
}

export interface CandidatePathway {
  leafCode: string;      // 8-digit code
  description: string;
  pathway: string[];     // [chapter, heading, subheading, tariff]
  distinguishingFactors: string[];
}

// ========================================
// Main Analysis Function
// ========================================

/**
 * Analyze the HS code hierarchy for a set of candidates
 * Determines what questions are needed at each level
 */
export async function analyzeHierarchy(
  candidates: Candidate[],
  productDescription: string
): Promise<HierarchyAnalysis> {
  if (candidates.length === 0) {
    return createEmptyAnalysis();
  }

  const descLower = productDescription.toLowerCase();

  // Step 1: Find dominant chapter and heading
  const { dominantChapter, dominantHeading } = findDominantPath(candidates);

  // Step 2: Analyze each hierarchy level
  const levels = await analyzeAllLevels(candidates, dominantChapter, dominantHeading);

  // Step 3: Extract required questions from each level
  const { required, resolved } = extractRequiredQuestions(levels, descLower);

  // Step 4: Build candidate pathways
  const pathways = buildCandidatePathways(candidates);

  logger.info(`[HIERARCHY] Analysis complete: ${levels.length} levels, ` +
    `${required.length} questions needed, ${resolved.length} already resolved`);

  return {
    dominantChapter,
    dominantHeading,
    levels,
    totalDecisionPoints: levels.filter(l => l.isDecisionPoint).length,
    requiredQuestions: required,
    resolvedQuestions: resolved,
    candidatePathways: pathways
  };
}

/**
 * Create empty analysis for edge cases
 */
function createEmptyAnalysis(): HierarchyAnalysis {
  return {
    dominantChapter: '',
    dominantHeading: '',
    levels: [],
    totalDecisionPoints: 0,
    requiredQuestions: [],
    resolvedQuestions: [],
    candidatePathways: []
  };
}

// ========================================
// Path Finding
// ========================================

/**
 * Find the dominant path (chapter + heading) based on candidate scores
 */
function findDominantPath(candidates: Candidate[]): { dominantChapter: string; dominantHeading: string } {
  // Group by chapter
  const chapterScores = new Map<string, number>();
  const headingScores = new Map<string, number>();

  for (const candidate of candidates) {
    const chapter = candidate.code.substring(0, 2);
    const heading = candidate.code.substring(0, 4);

    chapterScores.set(chapter, (chapterScores.get(chapter) || 0) + candidate.score);
    headingScores.set(heading, (headingScores.get(heading) || 0) + candidate.score);
  }

  // Find dominant chapter
  let dominantChapter = '';
  let maxChapterScore = 0;
  for (const [chapter, score] of chapterScores) {
    if (score > maxChapterScore) {
      maxChapterScore = score;
      dominantChapter = chapter;
    }
  }

  // Find dominant heading within dominant chapter
  let dominantHeading = '';
  let maxHeadingScore = 0;
  for (const [heading, score] of headingScores) {
    if (heading.startsWith(dominantChapter) && score > maxHeadingScore) {
      maxHeadingScore = score;
      dominantHeading = heading;
    }
  }

  return { dominantChapter, dominantHeading };
}

// ========================================
// Level Analysis
// ========================================

/**
 * Analyze all hierarchy levels to find decision points
 */
async function analyzeAllLevels(
  candidates: Candidate[],
  dominantChapter: string,
  dominantHeading: string
): Promise<HierarchyLevel[]> {
  const levels: HierarchyLevel[] = [];

  // Filter candidates to dominant chapter
  const chapterCandidates = candidates.filter(c => c.code.startsWith(dominantChapter));

  // Level 1: Chapter (2 digits) - usually not needed
  const chapterLevel = await analyzeLevel(candidates, 1, 2);
  levels.push(chapterLevel);

  // Level 2: Heading (4 digits)
  const headingLevel = await analyzeLevel(chapterCandidates, 2, 4);
  levels.push(headingLevel);

  // Filter candidates to dominant heading
  const headingCandidates = chapterCandidates.filter(c => c.code.startsWith(dominantHeading));

  // Level 3: Subheading (6 digits)
  const subheadingLevel = await analyzeLevel(headingCandidates, 3, 6);
  levels.push(subheadingLevel);

  // Level 4: Tariff (8 digits)
  const tariffLevel = await analyzeLevel(headingCandidates, 4, 8);
  levels.push(tariffLevel);

  return levels;
}

/**
 * Analyze a single hierarchy level
 */
async function analyzeLevel(
  candidates: Candidate[],
  level: number,
  digitCount: number
): Promise<HierarchyLevel> {
  const levelNames = ['', 'Chapter', 'Heading', 'Subheading', 'Tariff'];

  // Group candidates by this level's code
  const groups = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    let levelCode: string;

    if (digitCount === 2) {
      levelCode = candidate.code.substring(0, 2);
    } else if (digitCount === 4) {
      levelCode = candidate.code.substring(0, 4);
    } else if (digitCount === 6) {
      levelCode = candidate.code.substring(0, 7); // Include dot: XXXX.XX
    } else {
      levelCode = candidate.code; // Full 8-digit: XXXX.XX.XX
    }

    if (!groups.has(levelCode)) {
      groups.set(levelCode, []);
    }
    groups.get(levelCode)!.push(candidate);
  }

  // Build branches
  const branches: HierarchyBranch[] = [];
  for (const [code, groupCandidates] of groups) {
    // Get description from database
    const codeInfo = await prisma.hsCode.findFirst({
      where: { code: code },
      select: { description: true }
    });

    branches.push({
      code,
      description: codeInfo?.description || code,
      childCount: groupCandidates.length,
      hasLeaves: groupCandidates.some(c => /^\d{4}\.\d{2}\.\d{2}$/.test(c.code)),
      totalLeafCodes: groupCandidates.filter(c => /^\d{4}\.\d{2}\.\d{2}$/.test(c.code)).length
    });
  }

  // Determine if this is a decision point (multiple branches)
  const isDecisionPoint = branches.length > 1;

  // Generate required question if decision point
  let requiredQuestion: RequiredQuestion | undefined;
  if (isDecisionPoint) {
    requiredQuestion = generateLevelQuestion(level, branches);
  }

  return {
    level,
    name: levelNames[level] || 'Unknown',
    digitCount,
    isDecisionPoint,
    branches,
    requiredQuestion
  };
}

/**
 * Generate question for a decision point level
 */
function generateLevelQuestion(level: number, branches: HierarchyBranch[]): RequiredQuestion {
  const levelQuestions: Record<number, string> = {
    1: 'What product category?',
    2: 'What type of product?',
    3: 'What specific variant?',
    4: 'Which specific classification?'
  };

  const dimensions: Record<number, string> = {
    1: 'Category',
    2: 'Type',
    3: 'Variant',
    4: 'Classification'
  };

  const options: QuestionOption[] = branches.map(branch => ({
    value: extractKeyTerms(branch.description),
    displayText: cleanDescription(branch.description),
    matchingCodes: [branch.code],
    branchCode: branch.code
  }));

  return {
    level,
    dimension: dimensions[level] || 'Type',
    questionText: levelQuestions[level] || 'Which type?',
    options,
    isResolved: false
  };
}

/**
 * Extract key terms from description for matching
 */
function extractKeyTerms(description: string): string {
  // Remove common prefixes and clean up
  return description
    .replace(/^(of |for |with |containing |made of )/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Clean description for display
 */
function cleanDescription(description: string): string {
  // Capitalize first letter and clean up
  const cleaned = description.trim();
  if (cleaned.length === 0) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ========================================
// Question Extraction
// ========================================

/**
 * Extract required questions from hierarchy levels
 */
function extractRequiredQuestions(
  levels: HierarchyLevel[],
  descLower: string
): { required: RequiredQuestion[]; resolved: RequiredQuestion[] } {
  const required: RequiredQuestion[] = [];
  const resolved: RequiredQuestion[] = [];

  for (const level of levels) {
    if (level.requiredQuestion) {
      const question = level.requiredQuestion;

      // Check if already resolved by description
      const matchedOption = question.options.find(opt =>
        descLower.includes(opt.value.toLowerCase()) ||
        opt.value.toLowerCase().split(' ').some(word =>
          word.length > 3 && descLower.includes(word)
        )
      );

      if (matchedOption) {
        question.isResolved = true;
        question.resolvedValue = matchedOption.displayText;
        resolved.push(question);
      } else {
        required.push(question);
      }
    }
  }

  return { required, resolved };
}

// ========================================
// Candidate Pathways
// ========================================

/**
 * Build pathway information for each candidate
 */
function buildCandidatePathways(candidates: Candidate[]): CandidatePathway[] {
  return candidates.slice(0, 20).map(candidate => {
    const code = candidate.code;
    const pathway = [
      code.substring(0, 2),           // Chapter
      code.substring(0, 4),           // Heading
      code.substring(0, 7),           // Subheading (XXXX.XX)
      code                            // Full code
    ];

    return {
      leafCode: code,
      description: '',  // Would need DB lookup
      pathway,
      distinguishingFactors: []  // Would need analysis
    };
  });
}

// ========================================
// Upfront Question Batching
// ========================================

/**
 * Get all questions that should be asked upfront (in round 1)
 *
 * STRATEGY:
 * - Include ALL critical questions (identity, type)
 * - Include important questions that affect many codes
 * - Skip questions that are already resolved by description
 */
export async function getUpfrontQuestions(
  candidates: Candidate[],
  productDescription: string,
  maxQuestions: number = 4
): Promise<RequiredQuestion[]> {
  const analysis = await analyzeHierarchy(candidates, productDescription);

  // Take unresolved questions, prioritized by level (lower = more important)
  const prioritized = analysis.requiredQuestions
    .filter(q => !q.isResolved)
    .sort((a, b) => a.level - b.level);

  // Limit to max questions, but always include level 3 (subheading) if present
  // as this is usually the most impactful decision point
  const selected: RequiredQuestion[] = [];

  // First, add subheading questions (level 3) - usually most important
  const subheadingQuestions = prioritized.filter(q => q.level === 3);
  selected.push(...subheadingQuestions.slice(0, 2));

  // Then add tariff questions (level 4) if space
  const tariffQuestions = prioritized.filter(q => q.level === 4);
  const remainingSlots = maxQuestions - selected.length;
  selected.push(...tariffQuestions.slice(0, Math.max(0, remainingSlots)));

  logger.info(`[UPFRONT] Selected ${selected.length} questions for round 1`);

  return selected.slice(0, maxQuestions);
}

/**
 * Check if hierarchy analysis shows we're ready to classify
 */
export function isReadyFromHierarchy(analysis: HierarchyAnalysis): { ready: boolean; reason: string } {
  // Ready if no unresolved questions
  if (analysis.requiredQuestions.length === 0) {
    return { ready: true, reason: 'All hierarchy decisions resolved' };
  }

  // Ready if only tariff level questions remain and there's a clear leader
  const nonTariffQuestions = analysis.requiredQuestions.filter(q => q.level < 4);
  if (nonTariffQuestions.length === 0 && analysis.candidatePathways.length <= 3) {
    return { ready: true, reason: 'Only fine distinctions remain with few candidates' };
  }

  return { ready: false, reason: `${analysis.requiredQuestions.length} questions still needed` };
}

export default {
  analyzeHierarchy,
  getUpfrontQuestions,
  isReadyFromHierarchy
};

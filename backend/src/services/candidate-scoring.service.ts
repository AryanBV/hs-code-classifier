/**
 * Candidate Scoring Service
 *
 * Enhances semantic similarity scores with keyword matching bonuses.
 *
 * Problem: Semantic search alone doesn't account for exact keyword matches.
 * Example: "steel nuts and bolts" matches both 7318.15 (bolts) and 7318.16 (nuts)
 *          equally, but code matching BOTH terms should rank higher.
 *
 * Solution: Add bonus points for:
 * - Each matched keyword (+2 points)
 * - Matching multiple keywords (+3 bonus)
 * - Matching ALL keywords (+5 bonus)
 */

export interface ScoringContext {
  code: string;
  description: string;
  keywords?: string[];
  commonProducts?: string[];
  synonyms?: string[];
}

/**
 * Extract meaningful terms from query (exclude stop words)
 */
export function extractMeaningfulTerms(query: string): string[] {
  const stopWords = new Set([
    'for', 'the', 'and', 'with', 'in', 'of', 'to', 'a', 'an',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'from', 'by', 'at', 'on', 'or', 'as'
  ]);

  return query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Calculate keyword matching bonus for a candidate
 *
 * @param query - User's search query
 * @param candidate - Candidate HS code with metadata
 * @returns Bonus score (0-15 points)
 */
export function calculateKeywordBonus(
  query: string,
  candidate: ScoringContext
): number {
  const queryTerms = extractMeaningfulTerms(query);

  if (queryTerms.length === 0) return 0;

  // Collect all searchable terms from candidate
  const codeTerms = [
    ...(candidate.keywords || []),
    ...(candidate.commonProducts || []),
    ...(candidate.synonyms || []),
    ...candidate.description.toLowerCase().split(/\s+/)
  ].map(t => t.toLowerCase());

  let keywordBonus = 0;
  let matchedTerms = 0;
  const matchedKeywords: string[] = [];

  // Check each query term
  for (const queryTerm of queryTerms) {
    const matched = codeTerms.some(codeTerm =>
      codeTerm.includes(queryTerm) || queryTerm.includes(codeTerm)
    );

    if (matched) {
      matchedTerms++;
      matchedKeywords.push(queryTerm);
      keywordBonus += 2; // +2 points per matched keyword
    }
  }

  // Bonus for matching MULTIPLE keywords (AND logic)
  // This helps "nuts and bolts" prefer code with both terms
  if (matchedTerms >= 2) {
    keywordBonus += 3; // Extra +3 for matching 2+ keywords
  }

  // Bonus for matching ALL keywords
  // This ensures comprehensive matches rank highest
  if (matchedTerms === queryTerms.length && queryTerms.length >= 2) {
    keywordBonus += 5; // Extra +5 for matching ALL keywords
  }

  return keywordBonus;
}

/**
 * Detect if query has function keywords (product type) vs material keywords
 */
function detectFunctionAndMaterialKeywords(query: string): {
  functionKeywords: string[];
  materialKeywords: string[];
} {
  const queryLower = query.toLowerCase();
  const queryTerms = extractMeaningfulTerms(query);
  
  // Material keywords
  const materialKeywords = [
    'cotton', 'wool', 'silk', 'synthetic', 'polyester', 'nylon',
    'steel', 'iron', 'aluminum', 'aluminium', 'copper', 'brass', 'stainless',
    'plastic', 'rubber', 'wood', 'wooden', 'metal', 'leather', 'glass',
    'ceramic', 'paper', 'cardboard', 'fabric', 'textile'
  ];
  
  // Function keywords (product types/categories)
  const functionKeywords = [
    'toy', 'toys', 'game', 'doll', 'puzzle',
    't-shirt', 'shirt', 'sweater', 'pants', 'dress', 'shoe', 'boot',
    'furniture', 'table', 'chair', 'bed', 'sofa', 'cabinet',
    'watch', 'clock', 'timepiece',
    'brake', 'brakes', 'brake pad', 'brake pads', 'tire', 'tyre',
    'bottle', 'container', 'can',
    'tool', 'tools', 'screwdriver', 'hammer', 'wrench',
    'vehicle', 'car', 'truck', 'motorcycle', 'bicycle',
    'piano', 'guitar', 'drum', 'violin',
    'flour', 'bread', 'pasta', 'juice'
  ];
  
  const foundFunctionKeywords = queryTerms.filter(term => 
    functionKeywords.some(fk => term.includes(fk) || fk.includes(term))
  );
  
  const foundMaterialKeywords = queryTerms.filter(term =>
    materialKeywords.some(mk => term.includes(mk) || mk.includes(term))
  );
  
  return {
    functionKeywords: foundFunctionKeywords,
    materialKeywords: foundMaterialKeywords
  };
}

/**
 * Calculate function-over-material bonus
 * When both function and material keywords present, prioritize function matches
 */
function calculateFunctionOverMaterialBonus(
  query: string,
  candidate: ScoringContext
): number {
  const { functionKeywords, materialKeywords } = detectFunctionAndMaterialKeywords(query);
  
  // Only apply if both function and material keywords are present
  if (functionKeywords.length === 0 || materialKeywords.length === 0) {
    return 0;
  }
  
  const candidateText = [
    candidate.description,
    ...(candidate.keywords || []),
    ...(candidate.commonProducts || []),
    ...(candidate.synonyms || [])
  ].join(' ').toLowerCase();
  
  // Check if candidate matches function keywords
  const matchesFunction = functionKeywords.some(fk => 
    candidateText.includes(fk.toLowerCase())
  );
  
  // Check if candidate matches material keywords
  const matchesMaterial = materialKeywords.some(mk =>
    candidateText.includes(mk.toLowerCase())
  );
  
  // Boost if matches function, penalize if only matches material
  if (matchesFunction && matchesMaterial) {
    return 5;  // Bonus for matching both
  } else if (matchesFunction && !matchesMaterial) {
    return 3;  // Bonus for matching function (even without material)
  } else if (!matchesFunction && matchesMaterial) {
    return -3;  // Penalty for only matching material when function keywords present
  }
  
  return 0;
}

/**
 * Calculate enhanced score combining semantic similarity + keyword matching + function-over-material
 *
 * @param query - User's search query
 * @param candidate - Candidate with metadata
 * @param semanticScore - Base semantic similarity score (0-10)
 * @returns Enhanced score (0-28 max: 10 semantic + 15 keyword + 3 function-over-material)
 */
export function calculateEnhancedScore(
  query: string,
  candidate: ScoringContext,
  semanticScore: number
): number {
  const keywordBonus = calculateKeywordBonus(query, candidate);
  const functionOverMaterialBonus = calculateFunctionOverMaterialBonus(query, candidate);
  const totalScore = semanticScore + keywordBonus + functionOverMaterialBonus;

  return totalScore;
}

/**
 * Get detailed scoring breakdown for debugging/analysis
 *
 * @param query - User's search query
 * @param candidate - Candidate with metadata
 * @param semanticScore - Base semantic similarity score
 * @returns Detailed scoring information
 */
export function getScoreBreakdown(
  query: string,
  candidate: ScoringContext,
  semanticScore: number
): {
  totalScore: number;
  semanticScore: number;
  keywordBonus: number;
  matchedKeywords: string[];
  queryTerms: string[];
} {
  const queryTerms = extractMeaningfulTerms(query);
  const codeTerms = [
    ...(candidate.keywords || []),
    ...(candidate.commonProducts || []),
    ...(candidate.synonyms || []),
    ...candidate.description.toLowerCase().split(/\s+/)
  ].map(t => t.toLowerCase());

  const matchedKeywords: string[] = [];
  let keywordBonus = 0;

  for (const queryTerm of queryTerms) {
    const matched = codeTerms.some(codeTerm =>
      codeTerm.includes(queryTerm) || queryTerm.includes(codeTerm)
    );
    if (matched) {
      matchedKeywords.push(queryTerm);
    }
  }

  keywordBonus = calculateKeywordBonus(query, candidate);

  return {
    totalScore: semanticScore + keywordBonus,
    semanticScore,
    keywordBonus,
    matchedKeywords,
    queryTerms
  };
}

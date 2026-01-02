/**
 * Semantic-First Classifier Service
 * 
 * THE NEW APPROACH: Use semantic search as the PRIMARY classification method.
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import OpenAI from 'openai';
import { rerankCandidates, applyReranking, RerankedCandidate } from './reranker.service';
import { analyzeInputSpecificity, logSpecificityAnalysis, SpecificityAnalysis } from './input-specificity.service';
import {
  analyzeQueryTerms,
  logTermAnalysis,
  TermAnalysis
} from './query-term-analyzer.service';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Types
export interface SemanticCandidate {
  code: string;
  description: string;
  chapter: string;
  similarity: number;
  isLeaf: boolean;
  level: number;
}

export interface CandidateAnalysis {
  candidates: SemanticCandidate[];
  topCandidate: SemanticCandidate | null;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  distinguishingAttribute: string | null;
  spanMultipleChapters: boolean;
  spanMultipleHeadings: boolean;
}

export interface ClassificationQuestion {
  id: string;
  text: string;
  attribute: string;
  options: QuestionOption[];
  reasoning: string;
}

export interface QuestionOption {
  code: string;
  label: string;
  description: string;
  codesIncluded: string[];
}

export interface ClassificationResult {
  type: 'classification' | 'question' | 'need_more_info' | 'error';
  code?: string;
  description?: string;
  confidence?: number;
  reasoning?: string;
  alternatives?: Array<{ code: string; description: string; similarity: number }>;
  question?: ClassificationQuestion;
  message?: string;
}

export interface ConversationContext {
  originalQuery: string;
  answeredQuestions: Array<{
    questionId: string;
    attribute: string;
    selectedCode: string;
    selectedLabel: string;
  }>;
  narrowedCandidates: SemanticCandidate[];
  accumulatedKeywords: string[];
}

// Constants
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const HIGH_CONFIDENCE_THRESHOLD = 0.55;
const CONFIDENCE_GAP_THRESHOLD = 0.08;
const MIN_SIMILARITY_THRESHOLD = 0.25;
const INITIAL_SEARCH_LIMIT = 30;
const FINAL_OPTIONS_LIMIT = 6;

// Core Functions
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    input: text,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error('Failed to generate embedding');
  return embedding;
}

export async function semanticSearchCandidates(
  query: string,
  limit: number = INITIAL_SEARCH_LIMIT,
  threshold: number = MIN_SIMILARITY_THRESHOLD
): Promise<SemanticCandidate[]> {
  logger.info(`[SEMANTIC] Searching: "${query}"`);
  
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const results: Array<{ code: string; description: string; chapter: string; similarity: string }> = await prisma.$queryRaw`
    SELECT code, description, chapter,
      ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
    FROM hs_codes
    WHERE (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  const candidates: SemanticCandidate[] = results.map(r => ({
    code: r.code,
    description: r.description,
    chapter: r.chapter,
    similarity: parseFloat(r.similarity),
    isLeaf: r.code.replace(/\./g, '').length >= 8,
    level: r.code.replace(/\./g, '').length
  }));

  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    if (topCandidate) {
      logger.info(`[SEMANTIC] Found ${candidates.length}, top: ${topCandidate.code} (${topCandidate.similarity})`);
    }
  }
  return candidates;
}

export function analyzeCandidates(
  candidates: SemanticCandidate[],
  specificity?: SpecificityAnalysis
): CandidateAnalysis {
  if (candidates.length === 0) {
    return {
      candidates: [], topCandidate: null, confidence: 'low', confidenceScore: 0,
      distinguishingAttribute: null, spanMultipleChapters: false, spanMultipleHeadings: false
    };
  }

  const top = candidates[0];
  if (!top) {
    return {
      candidates: [], topCandidate: null, confidence: 'low', confidenceScore: 0,
      distinguishingAttribute: null, spanMultipleChapters: false, spanMultipleHeadings: false
    };
  }

  const second = candidates.length > 1 ? candidates[1] : null;
  const gap = second ? top.similarity - second.similarity : 0.2;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  let confidenceScore = top.similarity;

  // Use adjusted thresholds if specificity analysis is provided
  const effectiveConfThreshold = specificity?.adjustedConfidenceThreshold ?? HIGH_CONFIDENCE_THRESHOLD;
  const effectiveGapThreshold = specificity?.adjustedGapThreshold ?? CONFIDENCE_GAP_THRESHOLD;

  // Log threshold adjustment
  if (specificity && (effectiveGapThreshold !== CONFIDENCE_GAP_THRESHOLD)) {
    logger.info(`[ANALYZE] Thresholds adjusted: gap ${(CONFIDENCE_GAP_THRESHOLD * 100).toFixed(1)}% → ${(effectiveGapThreshold * 100).toFixed(1)}%, conf ${(HIGH_CONFIDENCE_THRESHOLD * 100).toFixed(1)}% → ${(effectiveConfThreshold * 100).toFixed(1)}%`);
  }

  // HIGH: similarity >= threshold AND gap >= threshold
  if (top.similarity >= effectiveConfThreshold && gap >= effectiveGapThreshold) {
    confidence = 'high';
    confidenceScore = Math.min(0.99, top.similarity + gap);
    logger.info(`[ANALYZE] HIGH confidence: sim=${(top.similarity * 100).toFixed(1)}% >= ${(effectiveConfThreshold * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}% >= ${(effectiveGapThreshold * 100).toFixed(1)}%`);
  }
  // MEDIUM: similarity >= 45% AND gap >= 3%
  else if (top.similarity >= 0.45 && gap >= 0.03) {
    confidence = 'medium';
    logger.info(`[ANALYZE] MEDIUM confidence: sim=${(top.similarity * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}%`);
  }
  // LOW: everything else
  else {
    logger.info(`[ANALYZE] LOW confidence: sim=${(top.similarity * 100).toFixed(1)}%, gap=${(gap * 100).toFixed(1)}%`);
  }

  const topTen = candidates.slice(0, 10);
  const chapters = new Set(topTen.map(c => c.chapter));
  const headings = new Set(topTen.map(c => c.code.substring(0, 4)));

  let distinguishingAttribute: string | null = null;
  if (chapters.size > 1) distinguishingAttribute = 'chapter';
  else if (headings.size > 1) distinguishingAttribute = 'heading';
  else distinguishingAttribute = detectDistinguishingAttribute(topTen);

  logger.info(`[ANALYSIS] Confidence: ${confidence}, Chapters: ${chapters.size}, Headings: ${headings.size}`);

  return {
    candidates, topCandidate: top, confidence, confidenceScore, distinguishingAttribute,
    spanMultipleChapters: chapters.size > 1, spanMultipleHeadings: headings.size > 1
  };
}

function detectDistinguishingAttribute(candidates: SemanticCandidate[]): string | null {
  if (candidates.length < 2) return null;
  const descs = candidates.map(c => c.description.toLowerCase());
  
  const patterns: Array<{ name: string; re: RegExp[] }> = [
    { name: 'material', re: [/\bof cotton\b/, /\bof wool\b/, /\bof silk\b/, /\bof synthetic\b/] },
    { name: 'grade', re: [/\ba grade\b/, /\bb grade\b/, /\bc grade\b/, /\bab grade\b/, /\bpb grade\b/] },
    { name: 'processing', re: [/\bplantation\b/, /\bcherry\b/, /\bparchment\b/, /\broasted\b/, /\binstant\b/] },
    { name: 'variety', re: [/\barabica\b/, /\brobusta\b/, /\brob\b/, /\bbasmati\b/] },
  ];

  for (const p of patterns) {
    let count = 0;
    for (const d of descs) if (p.re.some(r => r.test(d))) count++;
    if (count >= 2 && count < descs.length) return p.name;
  }
  return 'specific_type';
}

// Question Generation
export async function generateQuestion(query: string, analysis: CandidateAnalysis): Promise<ClassificationQuestion | null> {
  const { candidates, spanMultipleChapters, spanMultipleHeadings, distinguishingAttribute } = analysis;
  if (candidates.length === 0) return null;
  
  if (spanMultipleChapters) return generateChapterQuestion(candidates, query);
  if (spanMultipleHeadings) return generateHeadingQuestion(candidates, query);
  return generateAttributeQuestion(candidates, distinguishingAttribute, query);
}

function generateChapterQuestion(candidates: SemanticCandidate[], query: string): ClassificationQuestion {
  const groups = new Map<string, SemanticCandidate[]>();
  for (const c of candidates.slice(0, 15)) {
    const arr = groups.get(c.chapter) || [];
    arr.push(c);
    groups.set(c.chapter, arr);
  }

  const sorted = [...groups.entries()]
    .filter(([, cands]) => cands.length > 0 && cands[0] !== undefined)
    .sort((a, b) => {
      const aFirst = a[1][0];
      const bFirst = b[1][0];
      return (bFirst?.similarity ?? 0) - (aFirst?.similarity ?? 0);
    })
    .slice(0, 5);

  const options: QuestionOption[] = sorted
    .filter(([, cands]) => cands[0] !== undefined)
    .map(([ch, cands]) => {
      const first = cands[0]!;
      return {
        code: ch,
        label: createFriendlyLabel(first.description),
        description: first.description,
        codesIncluded: cands.map(c => c.code)
      };
    });

  return {
    id: `chapter_${Date.now()}`, text: 'Which category best describes your product?',
    attribute: 'chapter', options, reasoning: `Product "${query}" could fall under multiple categories.`
  };
}

function generateHeadingQuestion(candidates: SemanticCandidate[], query: string): ClassificationQuestion {
  const groups = new Map<string, SemanticCandidate[]>();
  for (const c of candidates.slice(0, 15)) {
    const h = c.code.substring(0, 4);
    const arr = groups.get(h) || [];
    arr.push(c);
    groups.set(h, arr);
  }

  const sorted = [...groups.entries()]
    .filter(([, cands]) => cands.length > 0 && cands[0] !== undefined)
    .sort((a, b) => {
      const aFirst = a[1][0];
      const bFirst = b[1][0];
      return (bFirst?.similarity ?? 0) - (aFirst?.similarity ?? 0);
    })
    .slice(0, 5);

  const options: QuestionOption[] = sorted
    .filter(([, cands]) => cands[0] !== undefined)
    .map(([h, cands]) => {
      const first = cands[0]!;
      return {
        code: h,
        label: createFriendlyLabel(first.description),
        description: first.description,
        codesIncluded: cands.map(c => c.code)
      };
    });

  return {
    id: `heading_${Date.now()}`, text: 'Which type of product is this?',
    attribute: 'heading', options, reasoning: `Select the product type for "${query}".`
  };
}

function generateAttributeQuestion(candidates: SemanticCandidate[], attr: string | null, query: string): ClassificationQuestion {
  const groups = groupByAttribute(candidates.slice(0, 12), attr);

  if (groups.size === 0) {
    const options: QuestionOption[] = candidates.slice(0, FINAL_OPTIONS_LIMIT).map(c => ({
      code: c.code, label: createFriendlyLabel(c.description),
      description: c.description, codesIncluded: [c.code]
    }));
    return { id: `direct_${Date.now()}`, text: 'Which option best matches?', attribute: 'direct', options, reasoning: `Select for "${query}".` };
  }

  const sorted = [...groups.entries()]
    .filter(([, cands]) => cands.length > 0 && cands[0] !== undefined)
    .sort((a, b) => {
      const aFirst = a[1][0];
      const bFirst = b[1][0];
      return (bFirst?.similarity ?? 0) - (aFirst?.similarity ?? 0);
    })
    .slice(0, FINAL_OPTIONS_LIMIT);

  const options: QuestionOption[] = sorted
    .filter(([, cands]) => cands[0] !== undefined)
    .map(([val, cands]) => {
      const first = cands[0]!;
      return {
        code: first.code, label: capitalize(val),
        description: first.description, codesIncluded: cands.map(c => c.code)
      };
    });

  const qText: Record<string, string> = {
    material: 'What material?', grade: 'What grade?', processing: 'How processed?', variety: 'What variety?'
  };
  return { id: `attr_${Date.now()}`, text: qText[attr || ''] || 'Which option?', attribute: attr || 'type', options, reasoning: `Need ${attr} for "${query}".` };
}

function groupByAttribute(candidates: SemanticCandidate[], attr: string | null): Map<string, SemanticCandidate[]> {
  const groups = new Map<string, SemanticCandidate[]>();
  if (!attr) return groups;
  for (const c of candidates) {
    const val = extractAttrValue(c.description, attr);
    if (val) {
      const arr = groups.get(val) || [];
      arr.push(c);
      groups.set(val, arr);
    }
  }
  return groups;
}

function extractAttrValue(desc: string, attr: string): string | null {
  const d = desc.toLowerCase();
  if (attr === 'material') {
    const m = d.match(/of (cotton|wool|silk|synthetic|leather|plastic|steel)/);
    return m?.[1] ?? null;
  }
  if (attr === 'grade') {
    const g = d.match(/(a|b|c|ab|pb)\s*grade/i);
    return g?.[1] ? `${g[1].toUpperCase()} Grade` : null;
  }
  if (attr === 'processing') {
    if (d.includes('plantation')) return 'Plantation';
    if (d.includes('cherry')) return 'Cherry';
    if (d.includes('parchment')) return 'Parchment';
    if (d.includes('instant')) return 'Instant';
    return null;
  }
  if (attr === 'variety') {
    if (d.includes('arabica')) return 'Arabica';
    if (d.includes('robusta') || /\brob\b/.test(d)) return 'Robusta';
    return null;
  }
  const firstPart = desc.split(/[:\-–]/)[0];
  return firstPart?.trim().substring(0, 40) ?? null;
}

function createFriendlyLabel(desc: string): string {
  let l = desc.replace(/^[\d.]+\s*[-:]\s*/, '').replace(/^[-:\s]+/, '');
  l = l.replace(/,?\s*(whether or not|including|excluding).*$/i, '');
  l = l.split(/[,;]/)[0]?.trim() || l;
  l = capitalize(l);
  return l.length > 50 ? l.substring(0, 47) + '...' : l;
}

function capitalize(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }


// LLM Verification
async function llmVerify(query: string, candidates: SemanticCandidate[]): Promise<{ code: string; confidence: number; reasoning: string } | null> {
  if (candidates.length === 0) return null;
  
  const list = candidates.slice(0, 8).map((c, i) => `${i + 1}. ${c.code}: ${c.description} (${(c.similarity * 100).toFixed(1)}%)`).join('\n');
  const prompt = `Expert HS classifier. Select best code for: "${query}"\n\nCandidates:\n${list}\n\nRules: Function over material, prefer 8-digit, avoid "Other".\n\nRespond:\nCODE: [code]\nCONFIDENCE: [0-1]\nREASONING: [one line]`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 150
    });
    const text = resp.choices[0]?.message?.content || '';
    const code = text.match(/CODE:\s*(\d{4}(?:\.\d{2}){0,2})/)?.[1];
    const conf = text.match(/CONFIDENCE:\s*([\d.]+)/)?.[1];
    const reason = text.match(/REASONING:\s*(.+)/)?.[1];
    if (code) return { code, confidence: conf ? parseFloat(conf) : 0.7, reasoning: reason?.trim() || 'LLM verified' };
  } catch (e) { logger.error(`[LLM] ${e}`); }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMINANT CHAPTER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if candidates have a dominant chapter (80%+ of top results)
 * Used to allow direct classification even when technically multi-chapter
 */
function getDominantChapter(candidates: SemanticCandidate[], topN: number = 5): {
  hasDominant: boolean;
  dominantChapter: string | null;
  dominantPercentage: number;
} {
  if (candidates.length === 0) {
    return { hasDominant: false, dominantChapter: null, dominantPercentage: 0 };
  }

  // Get top N candidates
  const topCandidates = candidates.slice(0, Math.min(topN, candidates.length));

  // Count chapters
  const chapterCounts: Record<string, number> = {};
  for (const c of topCandidates) {
    const chapter = c.code.substring(0, 2);
    chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1;
  }

  // Find dominant chapter
  let maxCount = 0;
  let dominantChapter: string | null = null;
  for (const [chapter, count] of Object.entries(chapterCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantChapter = chapter;
    }
  }

  const dominantPercentage = maxCount / topCandidates.length;
  const hasDominant = dominantPercentage >= 0.8; // 80% threshold

  if (hasDominant) {
    logger.info(`[DOMINANT] Chapter ${dominantChapter} dominates: ${(dominantPercentage * 100).toFixed(0)}% of top ${topCandidates.length}`);
  }

  return { hasDominant, dominantChapter, dominantPercentage };
}

// Main Classification
export async function classifyProduct(query: string, context: ConversationContext | null = null): Promise<ClassificationResult> {
  try {
    if (!query || query.trim().length < 2) return { type: 'need_more_info', message: 'Please provide more details.' };

    logger.info(`[CLASSIFY] "${query}"`);

    // STEP 0: Analyze input specificity
    const specificity = analyzeInputSpecificity(query);
    logSpecificityAnalysis(query, specificity);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.2: Query Term Analysis
    // Analyze query terms to separate product from packaging/material
    // ═══════════════════════════════════════════════════════════════════════════
    const termAnalysis = analyzeQueryTerms(query);
    logTermAnalysis(termAnalysis);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.3: Use fullQueryWithoutPackaging instead of primaryQuery
    // This keeps material terms (cotton, silicone) which are important for
    // chapter selection, while still removing packaging terms (1kg, bags)
    // ═══════════════════════════════════════════════════════════════════════════

    // Use fullQueryWithoutPackaging - includes materials, excludes only packaging
    const searchQuery = (termAnalysis.fullQueryWithoutPackaging.length >= 3)
      ? termAnalysis.fullQueryWithoutPackaging
      : query;

    logger.info(`[CLASSIFY] Original query: "${query}"`);
    logger.info(`[CLASSIFY] Search query (full, no packaging): "${searchQuery}"`);
    logger.info(`[CLASSIFY] Primary query (for reference): "${termAnalysis.primaryQuery}"`);

    // Log what was removed (packaging terms)
    if (termAnalysis.packagingTerms.length > 0) {
      logger.info(`[CLASSIFY] Packaging terms excluded: [${termAnalysis.packagingTerms.join(', ')}]`);
    }

    // Build enhanced query for continuation (context)
    const baseQuery = context?.answeredQuestions.length
      ? `${searchQuery} ${context.answeredQuestions.map(q => q.selectedLabel).join(' ')}`
      : searchQuery;

    // STEP 1: Semantic Search - NOW USES CLEAN QUERY
    const rawCandidates = await semanticSearchCandidates(baseQuery);
    if (rawCandidates.length === 0) return { type: 'need_more_info', message: 'No matches found. Try different description.' };

    // STEP 1.5: RERANK - Function over Material
    logger.info(`[CLASSIFY] Applying function-over-material reranking...`);
    const rerankedCandidates = rerankCandidates(baseQuery, rawCandidates, { debug: true });
    let candidates = applyReranking(rerankedCandidates);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7.4.2: Material-Aware Chapter Guidance
    // If query has material terms, penalize raw material codes when product terms exist
    // ═══════════════════════════════════════════════════════════════════════════
    if (termAnalysis.hasMaterial && termAnalysis.productTerms.length > 0) {
      const materialTerms = termAnalysis.materialTerms;

      // Material to raw material code mapping (to PENALIZE)
      const rawMaterialCodes: Record<string, string[]> = {
        'silicone': ['3910'],      // Silicone oil - penalize when we have product terms like "cases"
        'rubber': ['4001', '4002', '4003'],  // Raw rubber
        'plastic': ['3901', '3902', '3903', '3904', '3905'],  // Raw plastics
        'leather': ['4101', '4102', '4103'],  // Raw hides
        'cotton': ['5201', '5202', '5203'],  // Raw cotton
        'wool': ['5101', '5102', '5103'],    // Raw wool
        'silk': ['5001', '5002', '5003'],    // Raw silk
        'steel': ['7201', '7202', '7203'],   // Raw iron/steel
        'iron': ['7201', '7202', '7203'],
        'aluminum': ['7601'],               // Raw aluminum
        'copper': ['7401', '7402', '7403'], // Raw copper
        'wood': ['4401', '4402', '4403'],   // Raw wood
        'glass': ['7001', '7002'],          // Raw glass
      };

      for (const material of materialTerms) {
        const rawCodes = rawMaterialCodes[material.toLowerCase()];
        if (rawCodes) {
          logger.info(`[MATERIAL-GUIDE] Material "${material}" detected with product "${termAnalysis.productTerms.join(', ')}"`);
          logger.info(`[MATERIAL-GUIDE] Penalizing raw material codes: ${rawCodes.join(', ')}`);

          candidates = candidates.map(c => {
            const heading = c.code.substring(0, 4);
            if (rawCodes.some(rc => heading.startsWith(rc))) {
              logger.info(`[MATERIAL-GUIDE] Penalizing raw material code ${c.code} (-20% similarity)`);
              return { ...c, similarity: Math.max(0, c.similarity - 0.20) };
            }
            return c;
          });

          // Re-sort after penalty
          candidates.sort((a, b) => b.similarity - a.similarity);
        }
      }
    }

    // Log reranking impact
    if (rawCandidates.length > 0 && candidates.length > 0) {
      const originalTop = rawCandidates[0];
      const newTop = candidates[0];
      if (originalTop && newTop && originalTop.code !== newTop.code) {
        logger.info(`[CLASSIFY] Reranking changed top result: ${originalTop.code} (Ch.${originalTop.chapter}) → ${newTop.code} (Ch.${newTop.chapter})`);
      }
    }

    const leafs = candidates.filter(c => c.isLeaf);
    const analysis = analyzeCandidates(leafs.length > 0 ? leafs : candidates, specificity);

    // HIGH CONFIDENCE
    if (analysis.confidence === 'high' && analysis.topCandidate) {
      logger.info(`[CLASSIFY] High → ${analysis.topCandidate.code}`);
      return buildResult(analysis.topCandidate, analysis.candidates.slice(1, 4), analysis.confidenceScore, query);
    }

    // HIGH SPECIFICITY PATH: Direct classification for specific product descriptions
    // Bypass multi-chapter check if there's a dominant chapter (80%+ of results)
    if (
      specificity.level === 'high' &&
      analysis.topCandidate &&
      analysis.topCandidate.similarity >= 0.50
    ) {
      // Check for dominant chapter
      const dominantCheck = getDominantChapter(candidates);

      // Allow direct classification if:
      // 1. Single chapter (original check), OR
      // 2. Dominant chapter exists (80%+ of results in same chapter)
      const canClassifyDirectly = !analysis.spanMultipleChapters || dominantCheck.hasDominant;

      if (canClassifyDirectly) {
        logger.info(`[CLASSIFY] Direct classification: high specificity (${(specificity.score * 100).toFixed(0)}%) with ${(analysis.topCandidate.similarity * 100).toFixed(1)}% similarity`);
        if (dominantCheck.hasDominant && analysis.spanMultipleChapters) {
          logger.info(`[CLASSIFY] Multi-chapter bypassed: Ch.${dominantCheck.dominantChapter} dominates at ${(dominantCheck.dominantPercentage * 100).toFixed(0)}%`);
        }

        return {
          type: 'classification',
          code: analysis.topCandidate.code,
          description: analysis.topCandidate.description,
          confidence: Math.round(analysis.topCandidate.similarity * 100),
          reasoning: `"${query}" → ${analysis.topCandidate.description}`,
          alternatives: candidates.slice(1, 4).map(c => ({
            code: c.code,
            description: c.description,
            similarity: c.similarity
          }))
        };
      } else {
        logger.info(`[CLASSIFY] High specificity but no dominant chapter - proceeding to questions`);
      }
    }

    // MEDIUM - LLM verify
    if (analysis.confidence === 'medium' && analysis.topCandidate) {
      const llm = await llmVerify(baseQuery, analysis.candidates);
      if (llm && llm.confidence >= 0.75) {
        const match = analysis.candidates.find(c => c.code === llm.code) || analysis.topCandidate;
        return buildResult(match, analysis.candidates.filter(c => c.code !== llm.code).slice(0, 3), llm.confidence, query, llm.reasoning);
      }
    }

    // LOW - Question
    const q = await generateQuestion(query, analysis);
    if (q) return { type: 'question', question: q };

    // Fallback
    if (analysis.topCandidate) {
      const llm = await llmVerify(baseQuery, analysis.candidates);
      if (llm) {
        const match = analysis.candidates.find(c => c.code === llm.code) || analysis.topCandidate;
        return buildResult(match, [], llm.confidence * 0.8, query, llm.reasoning);
      }
    }
    return { type: 'need_more_info', message: 'Unable to classify.' };
  } catch (e) {
    logger.error(`[CLASSIFY] ${e}`);
    return { type: 'error', message: `Error: ${e instanceof Error ? e.message : 'Unknown'}` };
  }
}

async function buildResult(top: SemanticCandidate, alts: SemanticCandidate[], conf: number, query: string, extra?: string): Promise<ClassificationResult> {
  const v = await prisma.hsCode.findFirst({ where: { code: top.code }, select: { code: true, description: true } });
  const code = v?.code || top.code;
  const desc = v?.description || top.description;
  let reasoning = `"${query}" → ${desc}`;
  if (extra) reasoning += `. ${extra}`;

  const alternatives = alts.filter(a => !a.description.toLowerCase().startsWith('other')).slice(0, 3)
    .map(a => ({ code: a.code, description: a.description, similarity: a.similarity }));

  return { type: 'classification', code, description: desc, confidence: Math.round(conf * 100), reasoning, alternatives };
}

// Answer Handling
export async function handleAnswer(originalQuery: string, question: ClassificationQuestion, selectedCode: string, prev: ConversationContext | null = null): Promise<ClassificationResult> {
  const opt = question.options.find(o => o.code === selectedCode);
  if (!opt) return { type: 'error', message: 'Invalid option.' };

  const ctx: ConversationContext = prev || { originalQuery, answeredQuestions: [], narrowedCandidates: [], accumulatedKeywords: [] };
  ctx.answeredQuestions.push({ questionId: question.id, attribute: question.attribute, selectedCode, selectedLabel: opt.label });
  ctx.accumulatedKeywords.push(opt.label.toLowerCase());

  if (opt.codesIncluded.length === 1) {
    const sc = opt.codesIncluded[0];
    if (sc && sc.replace(/\./g, '').length >= 8) {
      const info = await prisma.hsCode.findFirst({ where: { code: sc }, select: { code: true, description: true } });
      if (info) return { type: 'classification', code: info.code, description: info.description, confidence: 92, reasoning: `Selected: ${ctx.answeredQuestions.map(q => q.selectedLabel).join(', ')}` };
    }
  }
  return classifyProduct(originalQuery, ctx);
}

export function createConversationContext(q: string): ConversationContext {
  return { originalQuery: q, answeredQuestions: [], narrowedCandidates: [], accumulatedKeywords: [] };
}

// Legacy Format
export function convertToLegacyFormat(r: ClassificationResult): any {
  if (r.type === 'classification') {
    return { success: true, responseType: 'classification', data: {
      hsCode: r.code, description: r.description, confidence: r.confidence, reasoning: r.reasoning,
      alternatives: r.alternatives?.map(a => ({ code: a.code, description: a.description, reason: `Similar (${Math.round(a.similarity * 100)}%)` })) || []
    }};
  }
  if (r.type === 'question') {
    return { success: true, responseType: 'question', data: {
      questionContext: r.question?.reasoning,
      questions: [{ id: r.question?.id, text: r.question?.text, type: 'single', options: r.question?.options.map(o => ({ code: o.code, label: o.label, description: o.description })) || [], priority: 'high' }]
    }};
  }
  return { success: false, responseType: r.type, error: r.message };
}

export { semanticSearchCandidates as searchCandidates };

// ========================================
// PART B: Frontend Response Adapter
// ========================================

export interface FrontendResponse {
  success: boolean;
  conversationId: string;
  responseType: 'classification' | 'questions' | 'error';
  result?: {
    hsCode: string;
    description: string;
    confidence: number;
    reasoning: string;
    alternatives: Array<{ code: string; description: string; reason?: string }>;
  };
  questions?: Array<{
    id: string;
    text: string;
    options: string[];
    allowOther: boolean;
    priority: 'required' | 'optional';
  }>;
  questionContext?: string;
  conversationSummary?: {
    totalQuestions: number;
    productDescription: string;
    keyDecisions: string[];
  };
  roundNumber?: number;
  totalQuestionsAsked?: number;
  timestamp: string;
  error?: string;
}

// Conversation state cache (in-memory)
const conversationCache = new Map<string, {
  productDescription: string;
  context: ConversationContext;
  roundNumber: number;
  totalQuestionsAsked: number;
  keyDecisions: string[];
  lastQuestion?: ClassificationQuestion;
}>();

export function adaptForFrontend(
  result: ClassificationResult,
  conversationId: string,
  productDescription: string,
  roundNumber: number = 1,
  totalQuestionsAsked: number = 0,
  keyDecisions: string[] = []
): FrontendResponse {
  const timestamp = new Date().toISOString();

  // Handle classification result
  if (result.type === 'classification') {
    return {
      success: true,
      conversationId,
      responseType: 'classification',
      result: {
        hsCode: result.code || '',
        description: result.description || '',
        confidence: result.confidence || 0,
        reasoning: result.reasoning || '',
        alternatives: (result.alternatives || []).map(alt => ({
          code: alt.code,
          description: alt.description,
          reason: `Similarity: ${Math.round((alt.similarity || 0) * 100)}%`
        }))
      },
      conversationSummary: {
        totalQuestions: totalQuestionsAsked,
        productDescription,
        keyDecisions
      },
      timestamp
    };
  }

  // Handle question result
  if (result.type === 'question' && result.question) {
    // Convert question options from objects to "CODE::Label" strings
    const stringOptions = result.question.options.map(opt =>
      `${opt.code}::${opt.label}`
    );

    return {
      success: true,
      conversationId,
      responseType: 'questions',
      questions: [{
        id: result.question.id,
        text: result.question.text,
        options: stringOptions,
        allowOther: false,
        priority: 'required'
      }],
      questionContext: result.question.reasoning,
      roundNumber,
      totalQuestionsAsked,
      timestamp
    };
  }

  // Handle need_more_info
  if (result.type === 'need_more_info') {
    return {
      success: false,
      conversationId,
      responseType: 'error',
      error: result.message || 'Please provide more details about your product.',
      timestamp
    };
  }

  // Handle error
  return {
    success: false,
    conversationId,
    responseType: 'error',
    error: result.message || 'Classification failed',
    timestamp
  };
}

export async function classifyWithSemanticSearch(request: {
  productDescription: string;
  sessionId?: string;
  conversationId?: string;
  answers?: Record<string, string>;
}): Promise<FrontendResponse> {
  const { productDescription, conversationId, answers } = request;

  // Generate or use existing conversation ID
  const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Check if this is a continuation (answer to previous question)
    if (conversationId && answers && conversationCache.has(conversationId)) {
      const cached = conversationCache.get(conversationId)!;

      // Get the answer from the answers object
      const lastQuestion = cached.lastQuestion;
      if (lastQuestion) {
        const answerKeys = Object.keys(answers);
        const answerKey = answerKeys.find(k => k === lastQuestion.id) || answerKeys[0];
        const selectedValue = answerKey ? answers[answerKey] : undefined;

        if (selectedValue) {
          // Extract just the code part if it's in "CODE::Label" format
          const code = selectedValue.includes('::')
            ? selectedValue.split('::')[0]
            : selectedValue;

          // Record the decision
          const selectedOption = lastQuestion.options.find(o => o.code === code);
          if (selectedOption) {
            cached.keyDecisions.push(`${lastQuestion.attribute}: ${selectedOption.label}`);
          }

          // Handle the answer
          const result = await handleAnswer(
            cached.productDescription,
            lastQuestion,
            code ?? '',
            cached.context
          );

          cached.totalQuestionsAsked++;
          cached.roundNumber++;

          // If result is another question, cache it
          if (result.type === 'question' && result.question) {
            cached.lastQuestion = result.question;
            conversationCache.set(conversationId, cached);
          } else {
            // Classification complete, cleanup
            conversationCache.delete(conversationId);
          }

          return adaptForFrontend(
            result,
            conversationId,
            cached.productDescription,
            cached.roundNumber,
            cached.totalQuestionsAsked,
            cached.keyDecisions
          );
        }
      }
    }

    // New classification request
    const context = createConversationContext(productDescription);
    const result = await classifyProduct(productDescription, context);

    // Cache conversation state if it's a question
    if (result.type === 'question' && result.question) {
      conversationCache.set(convId, {
        productDescription,
        context,
        roundNumber: 1,
        totalQuestionsAsked: 1,
        keyDecisions: [],
        lastQuestion: result.question
      });
    }

    return adaptForFrontend(
      result,
      convId,
      productDescription,
      1,
      result.type === 'question' ? 1 : 0,
      []
    );

  } catch (error) {
    logger.error(`[SEMANTIC-CLASSIFY] Error: ${error}`);
    return {
      success: false,
      conversationId: convId,
      responseType: 'error',
      error: error instanceof Error ? error.message : 'Classification failed',
      timestamp: new Date().toISOString()
    };
  }
}

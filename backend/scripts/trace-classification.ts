/**
 * Classification Trace Script
 *
 * This script traces the classification pipeline step-by-step for debugging.
 * Run with: npx ts-node scripts/trace-classification.ts "your product description"
 *
 * Example: npx ts-node scripts/trace-classification.ts "coffee"
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, title: string) {
  console.log('\n' + '='.repeat(80));
  log(`STEP ${step}: ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(80));
}

function logSubStep(title: string) {
  log(`\n  → ${title}`, colors.yellow);
}

function logData(label: string, data: any) {
  log(`  ${label}:`, colors.dim);
  if (typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  } else {
    console.log(`    ${data}`);
  }
}

interface TraceResult {
  step: string;
  action: string;
  input: any;
  output: any;
  duration: number;
}

class ClassificationTracer {
  private traces: TraceResult[] = [];
  private productDescription: string;

  constructor(productDescription: string) {
    this.productDescription = productDescription;
  }

  async trace() {
    console.log('\n' + '█'.repeat(80));
    log(`CLASSIFICATION TRACE FOR: "${this.productDescription}"`, colors.bright + colors.green);
    console.log('█'.repeat(80));

    const startTime = Date.now();

    try {
      // Step 1: Query Analysis
      await this.step1_QueryAnalysis();

      // Step 2: Chapter Prediction
      await this.step2_ChapterPrediction();

      // Step 3: Database Search (Keywords + Fuzzy)
      await this.step3_DatabaseSearch();

      // Step 4: Hierarchy Expansion
      await this.step4_HierarchyExpansion();

      // Step 5: Candidate Enrichment
      await this.step5_CandidateEnrichment();

      // Step 6: LLM Classification
      await this.step6_LLMClassification();

      // Step 7: Final Result
      await this.step7_FinalResult();

    } catch (error) {
      log(`\nERROR: ${error}`, colors.red);
    }

    const totalTime = Date.now() - startTime;
    console.log('\n' + '█'.repeat(80));
    log(`TRACE COMPLETE - Total Time: ${totalTime}ms`, colors.bright + colors.green);
    console.log('█'.repeat(80));

    return this.traces;
  }

  async step1_QueryAnalysis() {
    logStep(1, 'QUERY ANALYSIS');
    const start = Date.now();

    logSubStep('Parsing query to extract primary subject and context');

    // Parse query patterns
    const patterns = [
      { regex: /(.+?)\s+for\s+(.+)/i, type: 'FOR' },
      { regex: /(.+?)\s+used\s+in\s+(.+)/i, type: 'USED_IN' },
      { regex: /(.+?)\s+in\s+(.+)/i, type: 'IN' },
      { regex: /(.+?)\s+of\s+(.+)/i, type: 'OF' },
      { regex: /(.+?)\s+from\s+(.+)/i, type: 'FROM' },
    ];

    let primarySubject = this.productDescription;
    let context: string[] = [];
    let modifiers: string[] = [];
    let patternMatched = 'NONE';

    for (const pattern of patterns) {
      const match = this.productDescription.match(pattern.regex);
      if (match) {
        primarySubject = match[1].trim();
        context.push(match[2].trim());
        patternMatched = pattern.type;
        break;
      }
    }

    // Extract modifiers (adjectives before main noun)
    const words = primarySubject.split(/\s+/);
    if (words.length > 1) {
      modifiers = words.slice(0, -1);
      primarySubject = words[words.length - 1];
    }

    const analysis = {
      originalQuery: this.productDescription,
      primarySubject,
      context,
      modifiers,
      patternMatched,
    };

    logData('Query Analysis Result', analysis);

    this.traces.push({
      step: '1',
      action: 'Query Analysis',
      input: this.productDescription,
      output: analysis,
      duration: Date.now() - start,
    });
  }

  async step2_ChapterPrediction() {
    logStep(2, 'CHAPTER PREDICTION');
    const start = Date.now();

    logSubStep('Using LLM to predict likely HS chapters');

    const prompt = `Given this product description: "${this.productDescription}"

Predict the most likely HS code chapters (2-digit) this product belongs to.
Consider:
- What is the primary material?
- What is the primary function?
- Is it a raw material, processed product, or finished good?

Return a JSON array of chapter predictions with reasoning:
[
  { "chapter": "09", "confidence": 0.9, "reason": "Coffee and tea products" },
  { "chapter": "21", "confidence": 0.7, "reason": "Miscellaneous food preparations" }
]

Return ONLY valid JSON, no other text.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });

      const content = response.choices[0].message.content || '[]';
      const predictions = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

      logData('Chapter Predictions', predictions);

      // Get chapter descriptions from database
      logSubStep('Fetching chapter descriptions from database');

      const chapters = await prisma.hsCode.findMany({
        where: {
          code: {
            in: predictions.map((p: any) => p.chapter),
          },
        },
        select: {
          code: true,
          description: true,
        },
      });

      logData('Chapter Details', chapters);

      this.traces.push({
        step: '2',
        action: 'Chapter Prediction',
        input: this.productDescription,
        output: { predictions, chapterDetails: chapters },
        duration: Date.now() - start,
      });
    } catch (error) {
      log(`  Error in chapter prediction: ${error}`, colors.red);
    }
  }

  async step3_DatabaseSearch() {
    logStep(3, 'DATABASE SEARCH');
    const start = Date.now();

    // 3a: Exact keyword match
    logSubStep('3a: Searching for exact keyword matches');

    const keywords = this.productDescription.toLowerCase().split(/\s+/);
    logData('Search Keywords', keywords);

    const exactMatches = await prisma.hsCode.findMany({
      where: {
        OR: keywords.map(kw => ({
          OR: [
            { keywords: { contains: kw, mode: 'insensitive' as const } },
            { commonProducts: { contains: kw, mode: 'insensitive' as const } },
            { synonyms: { contains: kw, mode: 'insensitive' as const } },
            { description: { contains: kw, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 20,
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
      },
    });

    logData(`Exact Matches Found (${exactMatches.length})`,
      exactMatches.map(m => ({
        code: m.code,
        description: m.description?.substring(0, 60) + '...',
        keywordsMatched: keywords.filter(kw =>
          m.keywords?.toLowerCase().includes(kw) ||
          m.commonProducts?.toLowerCase().includes(kw)
        ),
      }))
    );

    // 3b: Fuzzy search
    logSubStep('3b: Performing fuzzy search for similar terms');

    const fuzzyMatches = await prisma.hsCode.findMany({
      where: {
        OR: [
          { description: { contains: this.productDescription.split(' ')[0], mode: 'insensitive' as const } },
        ],
      },
      take: 20,
      select: {
        code: true,
        description: true,
      },
    });

    logData(`Fuzzy Matches Found (${fuzzyMatches.length})`,
      fuzzyMatches.slice(0, 10).map(m => ({
        code: m.code,
        description: m.description?.substring(0, 80) + '...',
      }))
    );

    // Combine and deduplicate
    const allCandidates = new Map<string, any>();

    exactMatches.forEach(m => {
      allCandidates.set(m.code, { ...m, source: 'exact', score: 100 });
    });

    fuzzyMatches.forEach(m => {
      if (!allCandidates.has(m.code)) {
        allCandidates.set(m.code, { ...m, source: 'fuzzy', score: 80 });
      }
    });

    logSubStep('Combined Candidates');
    logData('Total Unique Candidates', allCandidates.size);

    this.traces.push({
      step: '3',
      action: 'Database Search',
      input: { keywords, query: this.productDescription },
      output: {
        exactMatches: exactMatches.length,
        fuzzyMatches: fuzzyMatches.length,
        totalCandidates: allCandidates.size,
        topCandidates: Array.from(allCandidates.values()).slice(0, 10),
      },
      duration: Date.now() - start,
    });

    return Array.from(allCandidates.values());
  }

  async step4_HierarchyExpansion() {
    logStep(4, 'HIERARCHY EXPANSION');
    const start = Date.now();

    logSubStep('Expanding parent codes to include specific children');

    // Get some parent codes to expand
    const parentCodes = await prisma.hsCodeHierarchy.findMany({
      where: {
        OR: [
          { code: { startsWith: '09' } }, // Coffee chapter
          { code: { startsWith: '21' } }, // Misc food chapter
        ],
        level: { lte: 6 },
      },
      take: 10,
      select: {
        code: true,
        parentCode: true,
        level: true,
        childrenCodes: true,
      },
    });

    logData('Parent Codes Found', parentCodes.map(p => ({
      code: p.code,
      level: p.level,
      childCount: p.childrenCodes?.length || 0,
    })));

    // Expand to children
    logSubStep('Fetching child codes');

    const expandedCodes: any[] = [];
    for (const parent of parentCodes) {
      if (parent.childrenCodes && parent.childrenCodes.length > 0) {
        const children = await prisma.hsCode.findMany({
          where: {
            code: { in: parent.childrenCodes.slice(0, 5) },
          },
          select: {
            code: true,
            description: true,
          },
        });

        expandedCodes.push({
          parent: parent.code,
          children: children.map(c => ({
            code: c.code,
            description: c.description?.substring(0, 60) + '...',
            scoreAdjustment: '0.85x (15% penalty for child)',
          })),
        });
      }
    }

    logData('Expanded Hierarchy', expandedCodes);

    this.traces.push({
      step: '4',
      action: 'Hierarchy Expansion',
      input: parentCodes.map(p => p.code),
      output: expandedCodes,
      duration: Date.now() - start,
    });
  }

  async step5_CandidateEnrichment() {
    logStep(5, 'CANDIDATE ENRICHMENT');
    const start = Date.now();

    logSubStep('Building enriched context for top candidates');

    // Get relevant codes for our product
    const relevantCodes = await prisma.hsCode.findMany({
      where: {
        OR: [
          { description: { contains: 'coffee', mode: 'insensitive' as const } },
          { keywords: { contains: 'coffee', mode: 'insensitive' as const } },
          { code: { startsWith: '0901' } },
          { code: { startsWith: '2101' } },
        ],
      },
      take: 15,
      select: {
        code: true,
        description: true,
        keywords: true,
        synonyms: true,
        commonProducts: true,
        chapter: true,
        notes: true,
      },
    });

    const enrichedCandidates = relevantCodes.map(code => {
      const queryKeywords = this.productDescription.toLowerCase().split(/\s+/);
      const codeKeywords = (code.keywords || '').toLowerCase().split(',').map(k => k.trim());

      const matchedKeywords = queryKeywords.filter(qk =>
        codeKeywords.some(ck => ck.includes(qk) || qk.includes(ck))
      );

      const missingKeywords = queryKeywords.filter(qk =>
        !codeKeywords.some(ck => ck.includes(qk) || qk.includes(ck))
      );

      const hierarchyLevel = code.code.length <= 4 ? 'Chapter/Heading' :
                            code.code.length <= 6 ? 'Subheading' : 'Tariff Line';

      return {
        code: code.code,
        description: code.description?.substring(0, 80),
        chapter: code.chapter || code.code.substring(0, 2),
        hierarchyLevel,
        keywordAnalysis: {
          matched: matchedKeywords,
          missing: missingKeywords,
          matchScore: matchedKeywords.length / queryKeywords.length,
        },
        hasCommonProducts: !!code.commonProducts,
        hasSynonyms: !!code.synonyms,
      };
    });

    logData('Enriched Candidates', enrichedCandidates);

    this.traces.push({
      step: '5',
      action: 'Candidate Enrichment',
      input: relevantCodes.map(c => c.code),
      output: enrichedCandidates,
      duration: Date.now() - start,
    });

    return enrichedCandidates;
  }

  async step6_LLMClassification() {
    logStep(6, 'LLM CLASSIFICATION');
    const start = Date.now();

    logSubStep('Preparing candidate context for LLM');

    // Get candidates
    const candidates = await prisma.hsCode.findMany({
      where: {
        OR: [
          { description: { contains: 'coffee', mode: 'insensitive' as const } },
          { code: { startsWith: '0901' } },
          { code: { startsWith: '2101' } },
        ],
      },
      take: 20,
      orderBy: { code: 'asc' },
      select: {
        code: true,
        description: true,
        keywords: true,
      },
    });

    const candidateContext = candidates.map((c, i) =>
      `${i + 1}. ${c.code}: ${c.description}\n   Keywords: ${c.keywords || 'N/A'}`
    ).join('\n');

    logData('Candidate Context (sent to LLM)', candidateContext.substring(0, 500) + '...');

    logSubStep('Sending to GPT-4o-mini for final classification');

    const systemPrompt = `You are an expert HS code classifier. Given a product description and candidate codes, select the BEST matching code.

CLASSIFICATION RULES:
1. SPECIFICITY: Prefer 8-10 digit codes over 4-6 digit codes
2. FUNCTION: Classify by primary FUNCTION, not material (unless material IS the product)
3. PRIMARY SUBJECT: What the product IS, not what it's used for
4. KEYWORDS: All query keywords should be addressed by the selected code

CRITICAL EDGE CASES:
- Coffee beans (raw/roasted) → Chapter 09 (0901)
- Coffee extracts/instant coffee → Chapter 21 (2101)
- Coffee preparations/beverages → Chapter 21 (2101)

Return JSON:
{
  "selectedCode": "XXXXXXXX",
  "confidence": 0.95,
  "reasoning": "Step by step reasoning...",
  "alternatives": [
    { "code": "XXXXXXXX", "reason": "Why this could also work" }
  ]
}`;

    const userPrompt = `Product: "${this.productDescription}"

CANDIDATE CODES:
${candidateContext}

Select the best HS code. Return ONLY valid JSON.`;

    logData('System Prompt', systemPrompt.substring(0, 300) + '...');
    logData('User Prompt', userPrompt.substring(0, 300) + '...');

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      });

      const content = response.choices[0].message.content || '{}';
      logData('Raw LLM Response', content);

      const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

      logSubStep('LLM Classification Result');
      logData('Selected Code', result.selectedCode);
      logData('Confidence', result.confidence);
      logData('Reasoning', result.reasoning);
      logData('Alternatives', result.alternatives);

      this.traces.push({
        step: '6',
        action: 'LLM Classification',
        input: {
          productDescription: this.productDescription,
          candidateCount: candidates.length,
        },
        output: result,
        duration: Date.now() - start,
      });

      return result;
    } catch (error) {
      log(`  Error in LLM classification: ${error}`, colors.red);
      return null;
    }
  }

  async step7_FinalResult() {
    logStep(7, 'FINAL RESULT VALIDATION');
    const start = Date.now();

    logSubStep('Validating selected code exists in database');

    // Get the classification result from step 6
    const step6 = this.traces.find(t => t.step === '6');
    const llmResult = step6?.output;

    if (!llmResult?.selectedCode) {
      log('  No code selected from LLM', colors.red);
      return;
    }

    const selectedCode = await prisma.hsCode.findUnique({
      where: { code: llmResult.selectedCode },
      include: {
        hierarchy: true,
      },
    });

    if (selectedCode) {
      log(`  ✓ Code ${llmResult.selectedCode} FOUND in database`, colors.green);

      logData('Final Classification', {
        code: selectedCode.code,
        description: selectedCode.description,
        chapter: selectedCode.chapter,
        confidence: llmResult.confidence,
        reasoning: llmResult.reasoning,
      });

      // Get hierarchy path
      logSubStep('Building hierarchy path');

      const hierarchyPath = [];
      let currentCode = selectedCode.code;

      while (currentCode.length >= 2) {
        const parentCode = currentCode.length <= 2 ? currentCode :
                          currentCode.length <= 4 ? currentCode.substring(0, 2) :
                          currentCode.length <= 6 ? currentCode.substring(0, 4) :
                          currentCode.substring(0, 6);

        const parent = await prisma.hsCode.findFirst({
          where: { code: parentCode },
          select: { code: true, description: true },
        });

        if (parent) {
          hierarchyPath.unshift({
            code: parent.code,
            description: parent.description?.substring(0, 60),
          });
        }

        if (currentCode === parentCode) break;
        currentCode = parentCode;
      }

      logData('Hierarchy Path', hierarchyPath);

    } else {
      log(`  ✗ Code ${llmResult.selectedCode} NOT FOUND in database`, colors.red);
      logSubStep('Attempting fallback search');

      // Try parent code
      const parentCode = llmResult.selectedCode.substring(0, 6);
      const parent = await prisma.hsCode.findFirst({
        where: { code: { startsWith: parentCode } },
        select: { code: true, description: true },
      });

      if (parent) {
        log(`  Found parent/sibling: ${parent.code}`, colors.yellow);
        logData('Fallback Code', parent);
      }
    }

    this.traces.push({
      step: '7',
      action: 'Final Validation',
      input: llmResult?.selectedCode,
      output: {
        codeExists: !!selectedCode,
        finalCode: selectedCode?.code || 'FALLBACK_NEEDED',
        description: selectedCode?.description,
      },
      duration: Date.now() - start,
    });
  }

  exportTraces() {
    return {
      productDescription: this.productDescription,
      timestamp: new Date().toISOString(),
      traces: this.traces,
      summary: this.traces.map(t => ({
        step: t.step,
        action: t.action,
        duration: `${t.duration}ms`,
      })),
    };
  }
}

// Main execution
async function main() {
  const productDescription = process.argv[2] || 'coffee';

  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════════════════╗', colors.magenta);
  log('║            HS CODE CLASSIFICATION TRACER                                     ║', colors.magenta);
  log('║            Debug how products are classified step-by-step                    ║', colors.magenta);
  log('╚══════════════════════════════════════════════════════════════════════════════╝', colors.magenta);

  const tracer = new ClassificationTracer(productDescription);

  await tracer.trace();

  // Export traces to JSON file
  const traces = tracer.exportTraces();
  const fs = await import('fs');
  const filename = `trace_${productDescription.replace(/\s+/g, '_')}_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(traces, null, 2));

  log(`\nTrace exported to: ${filename}`, colors.green);

  await prisma.$disconnect();
}

main().catch(console.error);

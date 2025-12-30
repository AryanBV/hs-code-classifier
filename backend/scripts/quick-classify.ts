/**
 * Quick Classification Test Script
 *
 * Tests all three classification methods for a product and compares results.
 * Run with: npx ts-node scripts/quick-classify.ts "your product description"
 *
 * Example: npx ts-node scripts/quick-classify.ts "instant coffee"
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

interface ClassificationResult {
  method: string;
  code: string;
  description: string;
  confidence: number;
  reasoning: string;
  duration: number;
}

async function method1_KeywordSearch(product: string): Promise<ClassificationResult> {
  const start = Date.now();

  const keywords = product.toLowerCase().split(/\s+/);

  // For array fields (keywords, commonProducts, synonyms), use hasSome
  // For string fields (description), use contains
  const matches = await prisma.hsCode.findMany({
    where: {
      OR: [
        { keywords: { hasSome: keywords } },
        { commonProducts: { hasSome: keywords } },
        { synonyms: { hasSome: keywords } },
        ...keywords.map(kw => ({
          description: { contains: kw, mode: 'insensitive' as const },
        })),
      ],
    },
    orderBy: { code: 'asc' },
    take: 5,
  });

  const best = matches[0];

  return {
    method: 'Keyword Search',
    code: best?.code || 'NOT_FOUND',
    description: best?.description?.substring(0, 80) || 'No match',
    confidence: best ? 0.7 : 0,
    reasoning: `Found ${matches.length} matches using keywords: ${keywords.join(', ')}`,
    duration: Date.now() - start,
  };
}

async function method2_LLMDirect(product: string): Promise<ClassificationResult> {
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an HS code classification expert. Return the 8-digit Indian HS code for products.

IMPORTANT RULES:
- Raw/roasted coffee beans → 0901.xx.xx
- Instant coffee/coffee extracts → 2101.xx.xx
- Coffee preparations → 2101.xx.xx

Return JSON only: { "code": "XXXXXXXX", "confidence": 0.9, "reasoning": "..." }`,
      },
      {
        role: 'user',
        content: `What is the 8-digit HS code for: "${product}"`,
      },
    ],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || '{}';
  const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

  // Validate in database
  const dbMatch = await prisma.hsCode.findFirst({
    where: {
      OR: [
        { code: result.code },
        { code: { startsWith: result.code?.substring(0, 6) || '' } },
      ],
    },
  });

  return {
    method: 'LLM Direct',
    code: result.code || 'NOT_FOUND',
    description: dbMatch?.description?.substring(0, 80) || 'Code not in DB',
    confidence: result.confidence || 0,
    reasoning: result.reasoning || 'No reasoning provided',
    duration: Date.now() - start,
  };
}

async function method3_HybridWithCandidates(product: string): Promise<ClassificationResult> {
  const start = Date.now();

  // Step 1: Get candidates from DB
  const keywords = product.toLowerCase().split(/\s+/);

  const candidates = await prisma.hsCode.findMany({
    where: {
      OR: [
        { keywords: { hasSome: keywords } },
        { commonProducts: { hasSome: keywords } },
        { synonyms: { hasSome: keywords } },
        ...keywords.map(kw => ({
          description: { contains: kw, mode: 'insensitive' as const },
        })),
      ],
    },
    take: 30,
  });

  if (candidates.length === 0) {
    return {
      method: 'Hybrid (DB + LLM)',
      code: 'NOT_FOUND',
      description: 'No candidates found',
      confidence: 0,
      reasoning: 'Database search returned no results',
      duration: Date.now() - start,
    };
  }

  // Step 2: Let LLM choose from candidates
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.code}: ${c.description}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Select the BEST HS code from the candidates for the product.

RULES:
1. Prefer specific 8-digit codes over 4-6 digit
2. Match product FUNCTION, not just material
3. Coffee beans (raw/roasted) → Chapter 09
4. Instant coffee/extracts → Chapter 21

Return JSON: { "selectedCode": "XXXXXXXX", "confidence": 0.9, "reasoning": "..." }`,
      },
      {
        role: 'user',
        content: `Product: "${product}"

CANDIDATES:
${candidateList}`,
      },
    ],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || '{}';
  const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

  const selected = candidates.find(c => c.code === result.selectedCode);

  return {
    method: 'Hybrid (DB + LLM)',
    code: result.selectedCode || 'NOT_FOUND',
    description: selected?.description?.substring(0, 80) || 'Selected code not in candidates',
    confidence: result.confidence || 0,
    reasoning: result.reasoning || 'No reasoning provided',
    duration: Date.now() - start,
  };
}

async function showDatabaseCodes(product: string) {
  log('\n📊 DATABASE CODES FOR THIS PRODUCT:', colors.cyan);
  console.log('─'.repeat(80));

  const keywords = product.toLowerCase().split(/\s+/);

  const codes = await prisma.hsCode.findMany({
    where: {
      OR: [
        { keywords: { hasSome: keywords } },
        ...keywords.map(kw => ({
          description: { contains: kw, mode: 'insensitive' as const },
        })),
      ],
    },
    orderBy: { code: 'asc' },
    take: 20,
  });

  if (codes.length === 0) {
    log('  No codes found in database', colors.red);
    return;
  }

  codes.forEach(c => {
    const level = c.code.length <= 4 ? '📁' :
                  c.code.length <= 6 ? '📂' : '📄';
    console.log(`  ${level} ${c.code.padEnd(10)} ${c.description?.substring(0, 60) || ''}`);
  });
}

async function main() {
  const product = process.argv[2] || 'coffee';

  console.log('\n');
  log('╔═══════════════════════════════════════════════════════════════════════════╗', colors.magenta);
  log(`║  QUICK CLASSIFY: "${product}"`, colors.magenta);
  log('╚═══════════════════════════════════════════════════════════════════════════╝', colors.magenta);

  // Show available codes first
  await showDatabaseCodes(product);

  // Run all three methods
  console.log('\n');
  log('🔍 RUNNING CLASSIFICATION METHODS:', colors.cyan);
  console.log('═'.repeat(80));

  const results: ClassificationResult[] = [];

  // Method 1: Keyword Search
  log('\n[1] Keyword Search...', colors.yellow);
  const result1 = await method1_KeywordSearch(product);
  results.push(result1);
  log(`    Code: ${result1.code}`, colors.green);
  log(`    Desc: ${result1.description}`, colors.reset);
  log(`    Time: ${result1.duration}ms`, colors.reset);

  // Method 2: LLM Direct
  log('\n[2] LLM Direct Classification...', colors.yellow);
  const result2 = await method2_LLMDirect(product);
  results.push(result2);
  log(`    Code: ${result2.code}`, colors.green);
  log(`    Desc: ${result2.description}`, colors.reset);
  log(`    Reasoning: ${result2.reasoning}`, colors.reset);
  log(`    Time: ${result2.duration}ms`, colors.reset);

  // Method 3: Hybrid
  log('\n[3] Hybrid (DB Candidates + LLM Selection)...', colors.yellow);
  const result3 = await method3_HybridWithCandidates(product);
  results.push(result3);
  log(`    Code: ${result3.code}`, colors.green);
  log(`    Desc: ${result3.description}`, colors.reset);
  log(`    Reasoning: ${result3.reasoning}`, colors.reset);
  log(`    Time: ${result3.duration}ms`, colors.reset);

  // Summary comparison
  console.log('\n');
  log('📋 COMPARISON SUMMARY:', colors.cyan);
  console.log('═'.repeat(80));
  console.log(`${'Method'.padEnd(25)} ${'Code'.padEnd(12)} ${'Confidence'.padEnd(12)} ${'Time'.padEnd(10)}`);
  console.log('─'.repeat(80));

  results.forEach(r => {
    const confColor = r.confidence >= 0.8 ? colors.green :
                      r.confidence >= 0.5 ? colors.yellow : colors.red;
    console.log(
      `${r.method.padEnd(25)} ${r.code.padEnd(12)} ${confColor}${(r.confidence * 100).toFixed(0)}%${colors.reset}`.padEnd(30) +
      ` ${r.duration}ms`
    );
  });

  // Check agreement
  const uniqueCodes = [...new Set(results.map(r => r.code))];
  console.log('\n');
  if (uniqueCodes.length === 1) {
    log(`✅ ALL METHODS AGREE: ${uniqueCodes[0]}`, colors.green);
  } else {
    log(`⚠️  METHODS DISAGREE:`, colors.yellow);
    uniqueCodes.forEach(code => {
      const methods = results.filter(r => r.code === code).map(r => r.method);
      console.log(`    ${code}: ${methods.join(', ')}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);

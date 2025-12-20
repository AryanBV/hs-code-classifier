/**
 * Deep debug script to understand Category 2 failures
 * These are cases where the wrong 4-digit heading is selected
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { predictChapters, calculateChapterBoost } from '../src/services/chapter-predictor.service';
import { parseQuery, calculateContextBoost } from '../src/services/query-parser.service';
import { calculateEnhancedScore } from '../src/services/candidate-scoring.service';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface FailedCase {
  query: string;
  gotCode: string;
  expectedCode: string;
  expectedHeading: string;
}

// Category 2 failures - wrong 4-digit heading
const CATEGORY_2_FAILURES: FailedCase[] = [
  { query: "cotton t-shirt", gotCode: "6105.10", expectedCode: "6109.10.00", expectedHeading: "6109" },
  { query: "cotton fabric", gotCode: "5207.10.00", expectedCode: "5208", expectedHeading: "5208" },
  { query: "frozen fish", gotCode: "0304", expectedCode: "0303", expectedHeading: "0303" },
  { query: "wrist watch", gotCode: "9102", expectedCode: "9101", expectedHeading: "9101" },
];

async function deepDebug() {
  console.log('🔬 DEEP DEBUG: Category 2 Failures (Wrong Heading)\n');
  console.log('These failures select codes from the wrong 4-digit HS heading.\n');

  for (const testCase of CATEGORY_2_FAILURES) {
    console.log('═'.repeat(100));
    console.log(`Query: "${testCase.query}"`);
    console.log(`Got: ${testCase.gotCode} | Expected: ${testCase.expectedCode}`);
    console.log('─'.repeat(100));

    // 1. Check chapter prediction
    const predictedChapters = predictChapters(testCase.query);
    console.log(`\n📊 Chapter Predictions: ${predictedChapters.slice(0, 5).join(', ')}`);

    // 2. Generate embedding
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testCase.query
    });
    const queryEmbedding = response.data[0]?.embedding;

    if (!queryEmbedding) {
      console.log('ERROR: Could not generate embedding');
      continue;
    }

    // 3. Parse query
    const queryAnalysis = parseQuery(testCase.query);
    console.log(`Query Analysis: ${JSON.stringify(queryAnalysis)}`);

    // 4. Get both the "got" code and "expected" code details
    const [gotCode, expectedCode] = await Promise.all([
      prisma.hsCode.findFirst({
        where: { code: { startsWith: testCase.gotCode } },
        select: { code: true, description: true, keywords: true, commonProducts: true, synonyms: true }
      }),
      prisma.hsCode.findFirst({
        where: { code: { startsWith: testCase.expectedHeading } },
        select: { code: true, description: true, keywords: true, commonProducts: true, synonyms: true }
      })
    ]);

    console.log('\n📋 GOT Code Details:');
    if (gotCode) {
      console.log(`   Code: ${gotCode.code}`);
      console.log(`   Description: ${gotCode.description}`);
      console.log(`   Keywords: ${(gotCode.keywords || []).slice(0, 10).join(', ')}`);
      console.log(`   CommonProducts: ${(gotCode.commonProducts || []).slice(0, 5).join(', ')}`);
    }

    console.log('\n📋 EXPECTED Code Details:');
    if (expectedCode) {
      console.log(`   Code: ${expectedCode.code}`);
      console.log(`   Description: ${expectedCode.description}`);
      console.log(`   Keywords: ${(expectedCode.keywords || []).slice(0, 10).join(', ')}`);
      console.log(`   CommonProducts: ${(expectedCode.commonProducts || []).slice(0, 5).join(', ')}`);
    }

    // 5. Compare semantic similarity and scores for both
    await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

    // Get similarity for GOT code
    const gotSimilarity: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        keywords,
        common_products as "commonProducts",
        synonyms,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE code LIKE ${testCase.gotCode.split('.')[0] + '%'}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 3
    `;

    // Get similarity for EXPECTED code
    const expectedSimilarity: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        keywords,
        common_products as "commonProducts",
        synonyms,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE code LIKE ${testCase.expectedHeading + '%'}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 3
    `;

    console.log('\n📈 SEMANTIC SIMILARITY COMPARISON:');

    console.log(`\n   GOT heading (${testCase.gotCode.substring(0, 4)}):`);
    for (const r of gotSimilarity) {
      const semanticScore = Number(r.similarity) * 10;
      const keywordBonus = calculateEnhancedScore(testCase.query, {
        code: r.code,
        description: r.description,
        keywords: r.keywords,
        commonProducts: r.commonProducts,
        synonyms: r.synonyms
      }, 0);
      const contextBoost = calculateContextBoost({
        code: r.code,
        description: r.description,
        keywords: r.keywords,
        commonProducts: r.commonProducts
      }, queryAnalysis);
      const chapterBoost = calculateChapterBoost(r.code, predictedChapters);
      const totalScore = semanticScore + keywordBonus + contextBoost + chapterBoost;

      console.log(`   ${r.code.padEnd(14)} sim=${(Number(r.similarity)*100).toFixed(1)}% semantic=${semanticScore.toFixed(1)} kw=${keywordBonus.toFixed(1)} ctx=${contextBoost.toFixed(1)} ch=${chapterBoost} TOTAL=${totalScore.toFixed(1)}`);
    }

    console.log(`\n   EXPECTED heading (${testCase.expectedHeading}):`);
    for (const r of expectedSimilarity) {
      const semanticScore = Number(r.similarity) * 10;
      const keywordBonus = calculateEnhancedScore(testCase.query, {
        code: r.code,
        description: r.description,
        keywords: r.keywords,
        commonProducts: r.commonProducts,
        synonyms: r.synonyms
      }, 0);
      const contextBoost = calculateContextBoost({
        code: r.code,
        description: r.description,
        keywords: r.keywords,
        commonProducts: r.commonProducts
      }, queryAnalysis);
      const chapterBoost = calculateChapterBoost(r.code, predictedChapters);
      const totalScore = semanticScore + keywordBonus + contextBoost + chapterBoost;

      console.log(`   ${r.code.padEnd(14)} sim=${(Number(r.similarity)*100).toFixed(1)}% semantic=${semanticScore.toFixed(1)} kw=${keywordBonus.toFixed(1)} ctx=${contextBoost.toFixed(1)} ch=${chapterBoost} TOTAL=${totalScore.toFixed(1)}`);
    }

    // 6. Check what rank the expected code appears in full semantic search
    const fullResults: any[] = await prisma.$queryRaw`
      SELECT
        code,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 100
    `;

    const expectedRank = fullResults.findIndex(r => r.code.startsWith(testCase.expectedHeading));
    const gotRank = fullResults.findIndex(r => r.code.startsWith(testCase.gotCode.substring(0, 4)));

    console.log(`\n📍 RANKING in top 100 semantic results:`);
    console.log(`   GOT (${testCase.gotCode.substring(0, 4)}*): Position ${gotRank + 1}`);
    console.log(`   EXPECTED (${testCase.expectedHeading}*): Position ${expectedRank >= 0 ? expectedRank + 1 : 'NOT IN TOP 100'}`);

    console.log('\n');
  }

  await prisma.$disconnect();
}

deepDebug().catch(console.error);

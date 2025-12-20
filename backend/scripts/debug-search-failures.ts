/**
 * Debug script to understand why certain codes are not found in semantic search
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface FailedCase {
  query: string;
  expectedCode: string;
  expectedHeading: string;
  description: string;
}

const FAILED_CASES: FailedCase[] = [
  { query: "children's plastic toys", expectedCode: "9503.00", expectedHeading: "95", description: "Toys" },
  { query: "wheat flour", expectedCode: "1101.00", expectedHeading: "11", description: "Wheat flour" },
  { query: "cotton fabric", expectedCode: "5208", expectedHeading: "52", description: "Cotton fabrics" },
  { query: "cotton t-shirt", expectedCode: "6109.10.00", expectedHeading: "61", description: "T-shirts, knitted" }
];

async function debugSearchFailures() {
  console.log('🔍 DEBUGGING SEARCH FAILURES\n');

  for (const testCase of FAILED_CASES) {
    console.log('═'.repeat(80));
    console.log(`Query: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expectedCode} (Chapter ${testCase.expectedHeading})`);
    console.log('─'.repeat(80));

    // Generate query embedding
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testCase.query
    });
    const queryEmbedding = response.data[0]?.embedding;

    if (!queryEmbedding) {
      console.log('ERROR: Could not generate embedding');
      continue;
    }

    // Check if expected code has embedding
    const expectedCode = await prisma.hsCode.findFirst({
      where: { code: { startsWith: testCase.expectedCode.split('.')[0] } },
      select: { code: true, description: true, keywords: true, commonProducts: true }
    });

    console.log('\n📊 Expected Code Data:');
    if (expectedCode) {
      console.log(`   Code: ${expectedCode.code}`);
      console.log(`   Description: ${expectedCode.description}`);
      console.log(`   Keywords: ${(expectedCode.keywords || []).join(', ')}`);
      console.log(`   Common Products: ${(expectedCode.commonProducts || []).join(', ')}`);
    } else {
      console.log('   NOT FOUND IN DATABASE!');
    }

    // Find top 10 results from semantic search
    await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

    const results: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        keywords,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 20
    `;

    console.log('\n🔎 Top 20 Semantic Search Results:');
    results.forEach((r, i) => {
      const chapter = r.code.substring(0, 2);
      const isRightChapter = chapter === testCase.expectedHeading;
      const marker = isRightChapter ? '✅' : '  ';
      console.log(`   ${marker} ${i+1}. ${r.code.padEnd(12)} ${(Number(r.similarity) * 100).toFixed(1)}% - ${r.description.substring(0, 50)}...`);
    });

    // Check where the expected code actually ranks
    const expectedInResults: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL AND code LIKE ${testCase.expectedCode.split('.')[0] + '%'}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 5
    `;

    console.log(`\n📍 Best matches in expected chapter (${testCase.expectedHeading}):`);
    expectedInResults.forEach((r, i) => {
      console.log(`   ${i+1}. ${r.code.padEnd(12)} ${(Number(r.similarity) * 100).toFixed(1)}% - ${r.description.substring(0, 50)}...`);
    });

    console.log('');
  }

  await prisma.$disconnect();
}

debugSearchFailures().catch(console.error);

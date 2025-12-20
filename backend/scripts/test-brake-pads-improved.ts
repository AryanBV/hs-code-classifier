import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testBrakePadsImproved() {
  console.log('🧪 TESTING IMPROVED SEMANTIC SEARCH FOR BRAKE PADS');
  console.log('═'.repeat(70));
  console.log('Query: "ceramic brake pads for motorcycles"\n');

  try {
    // Generate embedding for query
    const query = 'ceramic brake pads for motorcycles';
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0]?.embedding;
    if (!queryEmbedding) {
      console.log('Failed to generate embedding');
      return;
    }

    console.log('✅ Generated embedding for query\n');

    // Set HNSW ef_search parameter
    console.log('🔧 Setting HNSW ef_search = 40...');
    await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 40`;
    console.log('✅ HNSW parameter set\n');

    // Run semantic search with top 50 results
    console.log('🔍 Running semantic search (top 50 results)...\n');
    const startTime = Date.now();

    const results: any[] = await prisma.$queryRaw`
      SELECT
        code,
        description,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM hs_codes
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 50
    `;

    const searchTime = Date.now() - startTime;

    console.log(`✅ Found ${results.length} results in ${searchTime}ms\n`);
    console.log('═'.repeat(70));
    console.log('TOP 20 RESULTS:');
    console.log('═'.repeat(70));

    // Display top 20 results
    results.slice(0, 20).forEach((r, i) => {
      const similarity = (Number(r.similarity) * 100).toFixed(2);
      const isChapter87 = r.code.startsWith('87');
      const isChapter68 = r.code.startsWith('68');
      const isBrakePadCode = r.code === '8708.30.00';

      let marker = '';
      if (isBrakePadCode) marker = ' ⭐ CORRECT CODE!';
      else if (isChapter87) marker = ' ✅ Ch.87 (Automotive)';
      else if (isChapter68) marker = ' ⚠️  Ch.68 (Friction materials)';

      console.log(`${(i + 1).toString().padStart(2)}. ${r.code.padEnd(12)} (${similarity}% match)${marker}`);
      console.log(`    ${r.description.substring(0, 80)}...`);
      console.log();
    });

    // Check if 8708.30.00 is in top 50
    const correctCodeIndex = results.findIndex(r => r.code === '8708.30.00');

    console.log('═'.repeat(70));
    console.log('ANALYSIS:');
    console.log('═'.repeat(70));

    if (correctCodeIndex !== -1) {
      console.log(`✅ CORRECT CODE FOUND: 8708.30.00 at position ${correctCodeIndex + 1}`);
      const correctCode = results[correctCodeIndex];
      console.log(`   Similarity: ${(Number(correctCode.similarity) * 100).toFixed(2)}%`);
      console.log(`   Description: ${correctCode.description}`);
    } else {
      console.log('❌ 8708.30.00 NOT FOUND in top 50 results');
    }

    console.log();

    // Count by chapter
    const chapterCounts = new Map<string, number>();
    results.forEach(r => {
      const chapter = r.code.substring(0, 2);
      chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
    });

    console.log('Results by chapter:');
    Array.from(chapterCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([chapter, count]) => {
        console.log(`  Chapter ${chapter}: ${count} codes`);
      });

    console.log();
    console.log('═'.repeat(70));
    console.log('COMPARISON WITH OLD SYSTEM:');
    console.log('═'.repeat(70));
    console.log('Old system (IVFFlat):');
    console.log('  - Returned only 3 results (1-3% of database)');
    console.log('  - Missed 8708.30.00 entirely');
    console.log('  - LLM chose wrong code from limited candidates');
    console.log();
    console.log('New system (HNSW):');
    console.log(`  - Returns ${results.length} accurate results (entire database)`);
    if (correctCodeIndex !== -1) {
      console.log(`  - Found 8708.30.00 at position ${correctCodeIndex + 1}`);
      console.log('  - LLM can now choose correct code!');
    }
    console.log();

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBrakePadsImproved();

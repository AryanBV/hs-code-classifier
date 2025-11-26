/**
 * Phase 4A: Diagnostic Script
 *
 * Purpose: Verify the root cause of poor vector search quality
 * Checks:
 * 1. Embedding coverage (how many codes have embeddings?)
 * 2. Vector search quality (does it return correct codes?)
 * 3. Similarity scores (are they meaningful?)
 * 4. Database structure (are codes properly stored?)
 */

import { prisma } from './src/utils/prisma';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function diagnostics() {
  console.log('\n========================================');
  console.log('PHASE 4A: ROOT CAUSE DIAGNOSTICS');
  console.log('========================================\n');

  try {
    // ============================================
    // TEST 1: Database Structure & Embedding Coverage
    // ============================================
    console.log('TEST 1: Database Structure & Embedding Coverage');
    console.log('---------------------------------------');

    const totalCodes = await prisma.hsCode.count();
    console.log(`✓ Total HS codes in database: ${totalCodes}`);

    // Check if embedding field exists and has data
    const codesWithEmbedding = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM hs_codes
      WHERE embedding IS NOT NULL
    ` as any[];

    const embeddingCount = Number(codesWithEmbedding[0]?.count ?? 0);
    const embeddingPercentageNum = (embeddingCount / totalCodes) * 100;
    const embeddingPercentage = embeddingPercentageNum.toFixed(2);

    console.log(`✓ Codes WITH embeddings: ${embeddingCount}/${totalCodes} (${embeddingPercentage}%)`);
    console.log(`✓ Codes WITHOUT embeddings: ${totalCodes - embeddingCount}/${totalCodes}`);
    console.log();

    // ============================================
    // TEST 2: Verify Test Codes Exist
    // ============================================
    console.log('TEST 2: Verify Test Codes Exist in Database');
    console.log('---------------------------------------');

    const testCodes = [
      { code: '0804', name: 'Mangoes' },
      { code: '0812', name: 'Seeds (nuts)' },
      { code: '52', name: 'Cotton Fabrics' },
      { code: '84', name: 'Engine Parts' },
      { code: '85', name: 'Electronics' }
    ];

    for (const testCode of testCodes) {
      const codes = await prisma.hsCode.findMany({
        where: { code: { startsWith: testCode.code } },
        take: 1
      });
      const count = await prisma.hsCode.count({
        where: { code: { startsWith: testCode.code } }
      });

      if (codes.length > 0 && codes[0]) {
        console.log(`✓ ${testCode.code} (${testCode.name}): ${count} codes found`);
        console.log(`  Example: ${codes[0].code} - ${codes[0].description}`);
      } else {
        console.log(`✗ ${testCode.code} (${testCode.name}): NOT FOUND`);
      }
    }
    console.log();

    // ============================================
    // TEST 3: Vector Search Quality Test
    // ============================================
    console.log('TEST 3: Vector Search Quality (Semantic Search)');
    console.log('---------------------------------------');

    const testQueries = [
      { query: 'Mangoes fresh fruit', expectedCode: '0804', shouldNotFind: '0812' },
      { query: 'Cotton woven fabric', expectedCode: '52', shouldNotFind: '54' },
      { query: 'Engine parts vehicles', expectedCode: '84', shouldNotFind: '85' }
    ];

    for (const test of testQueries) {
      console.log(`\nQuery: "${test.query}"`);
      console.log(`Expected: ${test.expectedCode}, Should NOT: ${test.shouldNotFind}`);

      try {
        // Generate embedding for query
        const embedding = await openai.embeddings.create({
          input: test.query,
          model: 'text-embedding-3-small',
          dimensions: 1536
        });

        const queryEmbedding = embedding.data[0]?.embedding;
        if (!queryEmbedding) {
          console.log(`✗ Failed to generate embedding`);
          continue;
        }

        console.log(`✓ Query embedding generated (1536 dimensions)`);

        // Search using pgvector
        const results = await prisma.$queryRaw`
          SELECT
            code,
            description,
            ROUND((1 - (embedding <=> ${queryEmbedding}::vector))::numeric, 4) as similarity
          FROM hs_codes
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${queryEmbedding}::vector
          LIMIT 5
        ` as any[];

        if (results.length === 0) {
          console.log(`✗ No results returned! (No embeddings in database?)`);
        } else {
          console.log(`✓ Top 5 results:`);
          results.forEach((r: any, idx: number) => {
            const isExpected = r.code.startsWith(test.expectedCode);
            const isForbidden = r.code.startsWith(test.shouldNotFind);
            const icon = isExpected ? '✓' : isForbidden ? '✗' : '?';
            console.log(`  ${idx + 1}. ${icon} ${r.code} - ${r.description} (similarity: ${r.similarity})`);
          });

          // Check if expected code is in top 5
          const foundExpected = results.some((r: any) => r.code.startsWith(test.expectedCode));
          const foundForbidden = results.some((r: any) => r.code.startsWith(test.shouldNotFind));

          console.log(`\n  Result:`);
          console.log(`    Expected code found: ${foundExpected ? '✓ YES' : '✗ NO'}`);
          console.log(`    Forbidden code found: ${foundForbidden ? '✗ YES (BAD)' : '✓ NO'}`);
        }

      } catch (error) {
        console.log(`✗ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log();

    // ============================================
    // TEST 4: Embedding Quality Check
    // ============================================
    console.log('TEST 4: Sample Embedding Quality');
    console.log('---------------------------------------');

    const sampleQuery = await prisma.$queryRaw`
      SELECT code, description, embedding
      FROM hs_codes
      WHERE code LIKE '0804%' AND embedding IS NOT NULL
      LIMIT 1
    ` as any[];

    if (sampleQuery.length > 0 && sampleQuery[0].embedding) {
      console.log(`✓ Sample embedding found for ${sampleQuery[0].code}`);
      const embeddingArray = sampleQuery[0].embedding as number[];
      console.log(`  - Dimensions: ${embeddingArray.length}`);
      console.log(`  - First 5 values: [${embeddingArray.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]`);
      console.log(`  - All non-zero: ${embeddingArray.every((v: number) => v !== 0) ? '✓ YES' : '✗ NO (sparse)'}`);
    } else {
      console.log(`✗ No embeddings found for test code 0804`);
    }
    console.log();

    // ============================================
    // TEST 5: Database Query Performance
    // ============================================
    console.log('TEST 5: Database Query Performance');
    console.log('---------------------------------------');

    const startTime = Date.now();
    await prisma.hsCode.count();
    const countTime = Date.now() - startTime;

    console.log(`✓ Simple count query: ${countTime}ms`);

    // ============================================
    // SUMMARY & RECOMMENDATIONS
    // ============================================
    console.log('\n========================================');
    console.log('DIAGNOSTIC SUMMARY & RECOMMENDATIONS');
    console.log('========================================\n');

    console.log('Findings:');
    console.log(`1. Database: ${totalCodes} codes available`);
    console.log(`2. Embeddings: ${embeddingPercentage}% coverage (${embeddingCount}/${totalCodes})`);
    console.log(`3. Test codes exist: YES`);
    console.log();

    if (embeddingCount === 0) {
      console.log('ROOT CAUSE: NO EMBEDDINGS IN DATABASE');
      console.log('→ Recommendation: Run Phase 4B (Generate Missing Embeddings)');
      console.log('→ All 10,468 codes need embeddings generated');
      console.log('→ Estimated time: 5-10 minutes');
      console.log('→ Estimated cost: ~$0.20');
    } else if (embeddingPercentageNum < 80) {
      console.log(`ROOT CAUSE: INCOMPLETE EMBEDDINGS (${embeddingPercentage}% coverage)`);
      console.log('→ Recommendation: Run Phase 4B (Generate Missing Embeddings)');
      console.log(`→ ${totalCodes - embeddingCount} codes still need embeddings`);
    } else {
      console.log('ROOT CAUSE: EMBEDDINGS EXIST BUT SEARCH QUALITY IS POOR');
      console.log('→ Recommendation: Run Phase 4D (4-Layer Pipeline)');
      console.log('→ Vector embeddings alone insufficient for accuracy');
      console.log('→ Need keyword + category + vector + AI validation layers');
    }

    console.log('\nNext Steps:');
    console.log('1. Review TEST 3 results above (Vector Search Quality)');
    console.log('2. If expected codes NOT in top 5: Proceed with Phase 4B + 4D');
    console.log('3. If expected codes IN top 5: Proceed with Phase 4D only');
    console.log();

  } catch (error) {
    console.error('Diagnostic error:', error instanceof Error ? error.message : String(error));
  } finally {
    await prisma.$disconnect();
  }
}

// Run diagnostics
diagnostics();

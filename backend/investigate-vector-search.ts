/**
 * Phase 5E-1: Vector Search Investigation
 *
 * Purpose: Diagnose why vector search returns 0 results for ~40% of queries
 *
 * Investigation tasks:
 * 1. Check embedding completeness (how many codes have embeddings)
 * 2. Test vector search with sample queries
 * 3. Profile which categories fail
 * 4. Analyze similarity scores and thresholds
 * 5. Check pgvector extension status
 */

import { prisma } from './src/utils/prisma';
import { VectorSearchService } from './src/services/vector-search.service';
import OpenAI from 'openai';
import { logger } from './src/utils/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const vectorSearch = new VectorSearchService(prisma, openai);

// Test queries from Phase 5D that failed vector search
const testQueries = [
  { query: 'Fresh fish salmon', expectedChapter: '03', category: 'Fish' },
  { query: 'Cow milk dairy', expectedChapter: '04', category: 'Dairy' },
  { query: 'Fresh tomato vegetable', expectedChapter: '07', category: 'Vegetables' },
  { query: 'Coffee beans beverage', expectedChapter: '09', category: 'Coffee' },
  { query: 'Live cattle animals', expectedChapter: '01', category: 'Live Animals' },
  { query: 'Fresh apple fruit', expectedChapter: '08', category: 'Fruits' },
  { query: 'Steel bar metal', expectedChapter: '72', category: 'Metals' },
  { query: 'Cotton fabric textile', expectedChapter: '52', category: 'Textiles' },
  { query: 'Smartphone electronics', expectedChapter: '85', category: 'Electronics' },
];

async function investigateVectorSearch() {
  console.log('\n🔍 PHASE 5E-1: VECTOR SEARCH INVESTIGATION\n');

  try {
    // TASK 1: Check embedding completeness
    console.log('📊 TASK 1: Embedding Completeness');
    console.log('==================================\n');

    const stats = await vectorSearch.getSearchStats();
    console.log(`Total HS codes: ${stats.totalCodes}`);
    console.log(`Codes with embeddings: ${stats.codesWithEmbeddings}`);
    console.log(`Completeness: ${stats.completeness}%\n`);

    if (stats.completeness < 95) {
      console.log('⚠️  WARNING: Less than 95% embeddings populated!');
      console.log(`   ${stats.totalCodes - stats.codesWithEmbeddings} codes missing embeddings\n`);
    } else {
      console.log('✅ Embeddings well-populated (>95%)\n');
    }

    // TASK 2: Test vector search with sample queries
    console.log('🔎 TASK 2: Sample Query Vector Search');
    console.log('====================================\n');

    const resultsByThreshold = new Map<number, { results: number; average: number }>();

    for (const test of testQueries) {
      console.log(`Query: "${test.query}" (Expected Chapter: ${test.expectedChapter})`);

      // Test with different thresholds
      const thresholds = [0.2, 0.3, 0.4, 0.5, 0.6];
      let bestThreshold = 0.5;
      let bestCount = 0;

      for (const threshold of thresholds) {
        try {
          const results = await vectorSearch.semanticSearch(test.query, {
            limit: 10,
            threshold: threshold
          });

          const matchesChapter = results.filter(r => r.chapter === test.expectedChapter);

          if (results.length > 0 && !resultsByThreshold.has(threshold)) {
            resultsByThreshold.set(threshold, { results: 0, average: 0 });
          }

          if (resultsByThreshold.has(threshold)) {
            const data = resultsByThreshold.get(threshold)!;
            data.results += results.length;
            data.average = data.results / (thresholds.indexOf(threshold) + 1);
          }

          if (matchesChapter.length > bestCount) {
            bestCount = matchesChapter.length;
            bestThreshold = threshold;
          }

          if (threshold === 0.5) {
            console.log(`  Threshold 0.5: ${results.length} results`);
            if (results.length > 0 && results[0]) {
              const topResult = results[0];
              console.log(`    Top result: ${topResult.code} (${topResult.description?.substring(0, 50) || 'N/A'}...)`);
              console.log(`    Similarity: ${((topResult.similarity ?? 0) * 100).toFixed(1)}%`);
              console.log(`    Chapter match: ${topResult.chapter === test.expectedChapter ? '✅' : '❌'}`);
            }
          }
        } catch (error) {
          console.log(`  Threshold ${threshold}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (bestCount > 0) {
        console.log(`  ✅ Best results at threshold ${bestThreshold}: ${bestCount} chapter matches\n`);
      } else {
        console.log(`  ❌ No chapter-matching results found with any threshold\n`);
      }
    }

    // TASK 3: Analyze threshold effectiveness
    console.log('📈 TASK 3: Threshold Analysis');
    console.log('=============================\n');

    for (const [threshold, data] of Array.from(resultsByThreshold.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`Threshold ${threshold}: Avg results = ${data.average.toFixed(1)}`);
    }

    // TASK 4: Check pgvector extension status
    console.log('\n🔧 TASK 4: Database Vector Configuration');
    console.log('========================================\n');

    try {
      const extensions = await prisma.$queryRaw<any[]>`
        SELECT extname, extversion FROM pg_extension WHERE extname LIKE '%vector%';
      `;

      if (extensions.length > 0) {
        console.log('✅ pgvector extension installed:');
        for (const ext of extensions) {
          console.log(`   ${ext.extname} v${ext.extversion}`);
        }
      } else {
        console.log('❌ pgvector extension NOT found!');
        console.log('   This is likely the root cause of vector search failures.');
      }
    } catch (error) {
      console.log(`⚠️  Could not check pgvector status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // TASK 5: Sample embedding inspection
    console.log('\n🔬 TASK 5: Sample Embedding Inspection');
    console.log('=====================================\n');

    const sampleCodes = await prisma.$queryRaw<any[]>`
      SELECT
        code,
        description,
        embedding::text as embedding_preview,
        (ARRAY_LENGTH(string_to_array(embedding::text, ','), 1) - 2) as embedding_dims
      FROM hs_codes
      WHERE embedding IS NOT NULL
      LIMIT 5;
    `;

    for (const sample of sampleCodes) {
      console.log(`Code: ${sample.code} - ${sample.description.substring(0, 40)}...`);
      console.log(`  Embedding dimensions: ${sample.embedding_dims}`);
    }

    // RECOMMENDATIONS
    console.log('\n💡 INVESTIGATION SUMMARY & RECOMMENDATIONS');
    console.log('==========================================\n');

    if (stats.completeness < 95) {
      console.log('🎯 Recommendation 1: Regenerate Missing Embeddings');
      console.log('  - Use text-embedding-3-small (current) to backfill gaps');
      console.log('  - Or upgrade to text-embedding-3-large for better quality\n');
    }

    console.log('🎯 Recommendation 2: Optimize Similarity Threshold');
    console.log('  - Current threshold: 0.5');
    console.log('  - Test results suggest adaptive thresholds (0.3-0.6) per category\n');

    console.log('🎯 Recommendation 3: Implement Hybrid Fallback');
    console.log('  - When vector search returns <3 results, fall back to keyword search');
    console.log('  - Combine both scores for final ranking\n');

  } catch (error) {
    logger.error('Investigation failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run investigation
investigateVectorSearch().then(() => {
  console.log('✅ Investigation complete\n');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

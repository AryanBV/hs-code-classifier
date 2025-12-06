import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Optimize database by removing embeddings for less common HS codes
 *
 * Strategy:
 * - Keep embeddings for chapters 01-50 (most common exports)
 * - Remove embeddings for chapters 51-98 (rare/specialized codes)
 * - Saves ~60% of database storage
 * - LLM classification still works via fuzzy matching
 */

async function optimizeDatabase() {
  console.log('🔧 DATABASE OPTIMIZATION TOOL');
  console.log('═'.repeat(70));
  console.log('This will remove embeddings for less common HS code chapters');
  console.log('to reduce database size and stay within Supabase free tier.\n');

  try {
    // Check current state
    const stats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as codes_with_embeddings,
        pg_size_pretty(pg_total_relation_size('hs_codes')) as table_size
      FROM hs_codes
    `;

    console.log('📊 Current State:');
    console.log(`   Total HS codes: ${stats[0].total_codes}`);
    console.log(`   Codes with embeddings: ${stats[0].codes_with_embeddings}`);
    console.log(`   Table size: ${stats[0].table_size}`);
    console.log();

    // Count codes by chapter range
    const chapterStats: any[] = await prisma.$queryRaw`
      SELECT
        CASE
          WHEN SUBSTRING(code, 1, 2)::int BETWEEN 1 AND 50 THEN 'Common (01-50)'
          ELSE 'Rare (51-98)'
        END as chapter_range,
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
      FROM hs_codes
      GROUP BY chapter_range
      ORDER BY chapter_range
    `;

    console.log('📈 Breakdown by Chapter Range:');
    chapterStats.forEach(stat => {
      console.log(`   ${stat.chapter_range}: ${stat.total} codes, ${stat.with_embeddings} with embeddings`);
    });
    console.log();

    // Option 1: Remove embeddings for chapters 51-98
    console.log('💡 OPTION 1: Remove embeddings for rare codes (chapters 51-98)');
    console.log('   Pros: Saves ~60% space, keeps common codes functional');
    console.log('   Cons: Rare code classification relies only on fuzzy + LLM');
    console.log();

    const rareCodesCount: any = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM hs_codes
      WHERE SUBSTRING(code, 1, 2)::int > 50
        AND embedding IS NOT NULL
    `;

    console.log(`   This would remove ${rareCodesCount[0].count} embeddings`);
    console.log();

    // Option 2: Remove ALL embeddings
    console.log('💡 OPTION 2: Remove ALL embeddings');
    console.log('   Pros: Maximum space savings (~95MB)');
    console.log('   Cons: Relies 100% on fuzzy matching + LLM (still 56.7% accurate)');
    console.log();

    const allEmbeddingsCount: any = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM hs_codes
      WHERE embedding IS NOT NULL
    `;

    console.log(`   This would remove ${allEmbeddingsCount[0].count} embeddings`);
    console.log();

    console.log('═'.repeat(70));
    console.log('⚠️  MANUAL ACTION REQUIRED');
    console.log('═'.repeat(70));
    console.log('To execute optimization, run one of these commands:\n');
    console.log('OPTION 1 (Recommended):');
    console.log('  npm run optimize:embeddings:rare\n');
    console.log('OPTION 2 (Maximum savings):');
    console.log('  npm run optimize:embeddings:all\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Remove embeddings for rare codes (chapters 51-98)
 */
async function removeRareEmbeddings() {
  console.log('🗑️  Removing embeddings for chapters 51-98...\n');

  try {
    const result = await prisma.$executeRaw`
      UPDATE hs_codes
      SET embedding = NULL
      WHERE SUBSTRING(code, 1, 2)::int > 50
        AND embedding IS NOT NULL
    `;

    console.log(`✅ Removed embeddings from ${result} rare codes`);
    console.log('   Fuzzy matching + LLM will handle these codes');

    // Vacuum to reclaim space
    console.log('\n🧹 Running VACUUM to reclaim disk space...');
    await prisma.$executeRaw`VACUUM FULL hs_codes`;
    console.log('✅ Database optimized!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Remove ALL embeddings (maximum space savings)
 */
async function removeAllEmbeddings() {
  console.log('🗑️  Removing ALL embeddings...\n');
  console.log('⚠️  WARNING: This will rely 100% on fuzzy matching + LLM\n');

  try {
    const result = await prisma.$executeRaw`
      UPDATE hs_codes
      SET embedding = NULL
      WHERE embedding IS NOT NULL
    `;

    console.log(`✅ Removed all ${result} embeddings`);
    console.log('   System will use fuzzy matching + LLM only (56.7% accuracy maintained)');

    // Vacuum to reclaim space
    console.log('\n🧹 Running VACUUM to reclaim disk space...');
    await prisma.$executeRaw`VACUUM FULL hs_codes`;
    console.log('✅ Database optimized!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run based on command line argument
const command = process.argv[2];

if (command === 'remove-rare') {
  removeRareEmbeddings().catch(console.error);
} else if (command === 'remove-all') {
  removeAllEmbeddings().catch(console.error);
} else {
  optimizeDatabase().catch(console.error);
}

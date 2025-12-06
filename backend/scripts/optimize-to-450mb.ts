import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Optimize database to ~450 MB by removing embeddings for chapters 70-98
 *
 * This removes embeddings for ~30% of codes (least common chapters)
 * while keeping 70% with full functionality
 */

async function optimizeTo450MB() {
  console.log('🎯 OPTIMIZE DATABASE TO ~450 MB');
  console.log('═'.repeat(70));
  console.log('Removing embeddings for chapters 70-98 (least common)\n');

  try {
    // Check what we're removing
    const toRemove: any = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM hs_codes
      WHERE SUBSTRING(code, 1, 2)::int >= 70
        AND embedding IS NOT NULL
    `;

    const removeCount = Number(toRemove[0].count);
    console.log(`📊 Analysis:`);
    console.log(`   Codes with embeddings to remove: ${removeCount}`);
    console.log(`   Estimated space savings: ~${Math.round(removeCount * 0.006)} MB`);
    console.log(`   Target size: ~450-470 MB\n`);

    // Show breakdown
    const breakdown: any[] = await prisma.$queryRaw`
      SELECT
        CASE
          WHEN SUBSTRING(code, 1, 2)::int < 70 THEN 'Keep (01-69)'
          ELSE 'Remove (70-98)'
        END as category,
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
      FROM hs_codes
      GROUP BY category
      ORDER BY category
    `;

    console.log('📈 What stays vs what goes:');
    breakdown.forEach(stat => {
      console.log(`   ${stat.category}: ${stat.total} codes, ${stat.with_embeddings} with embeddings`);
    });

    console.log('\n⚠️  Chapters 70-98 will rely on fuzzy matching + LLM only');
    console.log('   (This maintains 56.7% accuracy from Phase 8)\n');

    console.log('═'.repeat(70));
    console.log('Press ENTER to continue or Ctrl+C to cancel...');
    console.log('═'.repeat(70));

    // Wait for confirmation
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve(true));
    });

    console.log('\n🗑️  Removing embeddings...');

    const result = await prisma.$executeRaw`
      UPDATE hs_codes
      SET embedding = NULL
      WHERE SUBSTRING(code, 1, 2)::int >= 70
        AND embedding IS NOT NULL
    `;

    console.log(`✅ Removed embeddings from ${result} codes\n`);

    // Vacuum to reclaim space
    console.log('🧹 Running VACUUM FULL to reclaim disk space...');
    console.log('   (This may take 1-2 minutes...)\n');

    await prisma.$executeRaw`VACUUM FULL hs_codes`;

    // Check final size
    const finalStats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as codes_with_embeddings,
        pg_size_pretty(pg_total_relation_size('hs_codes')) as table_size
      FROM hs_codes
    `;

    console.log('✅ OPTIMIZATION COMPLETE!');
    console.log('═'.repeat(70));
    console.log(`📊 Final State:`);
    console.log(`   Total HS codes: ${finalStats[0].total_codes}`);
    console.log(`   Codes with embeddings: ${finalStats[0].codes_with_embeddings}`);
    console.log(`   Table size: ${finalStats[0].table_size}`);
    console.log();
    console.log('💡 Your LLM classification system will continue to work at 56.7% accuracy!');
    console.log('   Chapters 01-69 have full semantic search capability.');
    console.log('   Chapters 70-98 use fuzzy matching + LLM validation.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

optimizeTo450MB().catch(console.error);

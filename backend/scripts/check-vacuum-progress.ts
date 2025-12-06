import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProgress() {
  console.log('🔍 Checking VACUUM progress...\n');

  // Get detailed size info
  const sizeInfo: any = await prisma.$queryRaw`
    SELECT
      pg_size_pretty(pg_total_relation_size('hs_codes')) as total_size,
      pg_size_pretty(pg_relation_size('hs_codes')) as table_size,
      pg_size_pretty(pg_total_relation_size('hs_codes') - pg_relation_size('hs_codes')) as indexes_size,
      (pg_total_relation_size('hs_codes') / 1024 / 1024)::int as total_mb
    FROM hs_codes LIMIT 1
  `;

  // Get embedding counts
  const counts: any = await prisma.$queryRaw`
    SELECT
      COUNT(*) as total_codes,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
      COUNT(CASE WHEN embedding IS NULL THEN 1 END) as without_embeddings
    FROM hs_codes
  `;

  console.log('📊 Current Database State:');
  console.log(`   Total size: ${sizeInfo[0].total_size} (${sizeInfo[0].total_mb} MB)`);
  console.log(`   Table data: ${sizeInfo[0].table_size}`);
  console.log(`   Indexes: ${sizeInfo[0].indexes_size}`);
  console.log();
  console.log(`   Total codes: ${counts[0].total_codes}`);
  console.log(`   With embeddings: ${counts[0].with_embeddings} (${Math.round(Number(counts[0].with_embeddings) / Number(counts[0].total_codes) * 100)}%)`);
  console.log(`   Without embeddings: ${counts[0].without_embeddings} (${Math.round(Number(counts[0].without_embeddings) / Number(counts[0].total_codes) * 100)}%)`);
  console.log();

  // Check last vacuum time
  const vacuumInfo: any = await prisma.$queryRaw`
    SELECT
      schemaname,
      relname,
      last_vacuum,
      last_autovacuum,
      vacuum_count,
      autovacuum_count
    FROM pg_stat_user_tables
    WHERE relname = 'hs_codes'
  `;

  if (vacuumInfo[0]) {
    console.log('🧹 VACUUM History:');
    console.log(`   Last manual VACUUM: ${vacuumInfo[0].last_vacuum || 'Never'}`);
    console.log(`   Last auto-VACUUM: ${vacuumInfo[0].last_autovacuum || 'Never'}`);
    console.log(`   Manual VACUUM count: ${vacuumInfo[0].vacuum_count}`);
    console.log(`   Auto-VACUUM count: ${vacuumInfo[0].autovacuum_count}`);
    console.log();
  }

  // Expected size calculation
  const expectedSizeWithEmbeddings = Math.round(Number(counts[0].with_embeddings) * 0.032); // ~32KB per code with embedding
  const expectedSizeWithoutEmbeddings = Math.round(Number(counts[0].without_embeddings) * 0.002); // ~2KB per code without embedding
  const expectedTotal = expectedSizeWithEmbeddings + expectedSizeWithoutEmbeddings + 50; // +50MB for indexes/overhead

  console.log('💡 Expected Size After VACUUM FULL:');
  console.log(`   With embeddings (${counts[0].with_embeddings} codes): ~${expectedSizeWithEmbeddings} MB`);
  console.log(`   Without embeddings (${counts[0].without_embeddings} codes): ~${expectedSizeWithoutEmbeddings} MB`);
  console.log(`   Estimated total: ~${expectedTotal} MB`);
  console.log();

  const currentMB = Number(sizeInfo[0].total_mb);
  if (currentMB > expectedTotal + 50) {
    console.log(`⚠️  Current size (${currentMB} MB) is ${currentMB - expectedTotal} MB larger than expected`);
    console.log('   This space will be reclaimed when Supabase runs VACUUM FULL');
    console.log();
    console.log('🕐 Recommended Actions:');
    console.log('   1. Wait 24-48 hours for Supabase auto-vacuum');
    console.log('   2. Or contact Supabase support to request manual VACUUM FULL');
    console.log('   3. Or upgrade to Pro plan ($25/mo) which allows manual VACUUM');
  } else {
    console.log('✅ Database size looks normal! Space has been reclaimed.');
  }

  console.log();
  await prisma.$disconnect();
}

checkProgress().catch(console.error);

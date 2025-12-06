import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeMore() {
  console.log('🗑️  Removing embeddings for chapters 50-98...\n');

  const result = await prisma.$executeRaw`
    UPDATE hs_codes
    SET embedding = NULL
    WHERE SUBSTRING(code, 1, 2)::int >= 50
      AND embedding IS NOT NULL
  `;

  console.log(`✅ Removed embeddings from ${result} more codes\n`);

  const stats: any = await prisma.$queryRaw`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
      pg_size_pretty(pg_total_relation_size('hs_codes')) as table_size
    FROM hs_codes
  `;

  console.log('📊 Final State:');
  console.log(`   Total codes: ${stats[0].total}`);
  console.log(`   With embeddings: ${stats[0].with_embeddings}`);
  console.log(`   Table size: ${stats[0].table_size}`);
  console.log('\n✅ Done! Space will be reclaimed by Supabase auto-vacuum.\n');

  await prisma.$disconnect();
}

removeMore().catch(console.error);

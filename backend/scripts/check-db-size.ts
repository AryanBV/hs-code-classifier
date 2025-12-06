import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSize() {
  const stats: any = await prisma.$queryRaw`
    SELECT
      COUNT(*) as total_codes,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as codes_with_embeddings,
      pg_size_pretty(pg_total_relation_size('hs_codes')) as table_size
    FROM hs_codes
  `;

  console.log('\n📊 Current Database State:');
  console.log(`   Total HS codes: ${stats[0].total_codes}`);
  console.log(`   Codes with embeddings: ${stats[0].codes_with_embeddings}`);
  console.log(`   Table size: ${stats[0].table_size}\n`);

  await prisma.$disconnect();
}

checkSize().catch(console.error);

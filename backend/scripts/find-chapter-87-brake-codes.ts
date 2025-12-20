import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findChapter87BrakeCodes() {
  console.log('🔍 Searching for brake pad codes in Chapter 87...\n');

  const results: any[] = await prisma.$queryRaw`
    SELECT code, description, keywords, common_products as "commonProducts",
           CASE WHEN embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_embedding
    FROM hs_codes
    WHERE code LIKE '87%'
      AND (
        LOWER(description) LIKE '%brake%pad%'
        OR LOWER(description) LIKE '%brake%lining%'
        OR LOWER(keywords::text) LIKE '%brake%pad%'
        OR LOWER(common_products::text) LIKE '%brake%pad%'
      )
    ORDER BY code
  `;

  console.log(`Found ${results.length} brake pad codes in Chapter 87:\n`);

  results.forEach(r => {
    console.log(`Code: ${r.code}`);
    console.log(`  Description: ${r.description.substring(0, 100)}...`);
    console.log(`  Has embedding: ${r.has_embedding}`);
    console.log(`  Keywords: ${r.keywords?.join(', ')}`);
    console.log(`  Common products: ${r.commonProducts?.join(', ')}`);
    console.log();
  });

  await prisma.$disconnect();
}

findChapter87BrakeCodes();

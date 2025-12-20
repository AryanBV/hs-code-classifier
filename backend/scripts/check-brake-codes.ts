import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBrakeCodes() {
  console.log('🔍 Checking brake-related codes in database...\n');

  // Check if brake pad codes exist
  const brakeCodes: any[] = await prisma.$queryRaw`
    SELECT code, description,
           CASE WHEN embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_embedding,
           keywords, common_products
    FROM hs_codes
    WHERE LOWER(description) LIKE '%brake%'
       OR LOWER(description) LIKE '%friction%'
    ORDER BY code
    LIMIT 10
  `;

  console.log(`Found ${brakeCodes.length} brake-related codes:\n`);

  brakeCodes.forEach(c => {
    console.log(`Code: ${c.code}`);
    console.log(`  Description: ${c.description}`);
    console.log(`  Has embedding: ${c.has_embedding}`);
    console.log(`  Keywords: ${c.keywords?.join(', ') || 'None'}`);
    console.log(`  Common products: ${c.common_products?.join(', ') || 'None'}`);
    console.log();
  });

  // Check chapter range
  const chapterCheck: any[] = await prisma.$queryRaw`
    SELECT
      SUBSTRING(code, 1, 2) as chapter,
      COUNT(*) as total,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
    FROM hs_codes
    WHERE code LIKE '68%' OR code LIKE '87%'
    GROUP BY SUBSTRING(code, 1, 2)
    ORDER BY chapter
  `;

  console.log('Chapters 68 (ceramics) and 87 (vehicles/parts):');
  chapterCheck.forEach(c => {
    console.log(`  Chapter ${c.chapter}: ${c.total} codes, ${c.with_embeddings} with embeddings`);
  });

  await prisma.$disconnect();
}

checkBrakeCodes().catch(console.error);

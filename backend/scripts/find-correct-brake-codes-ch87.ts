import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findCorrectBrakeCodes() {
  console.log('🔍 Searching for CORRECT brake pad codes in Chapter 87 (Vehicle Parts)...\n');

  // Search for brake-related codes in heading 8708 (Parts and accessories of motor vehicles)
  const results: any[] = await prisma.$queryRaw`
    SELECT code, description, keywords, common_products as "commonProducts"
    FROM hs_codes
    WHERE code LIKE '8708%'
    ORDER BY code
    LIMIT 50
  `;

  console.log(`Found ${results.length} codes in heading 8708:\n`);

  results.forEach(r => {
    const isBrakeRelated =
      r.description?.toLowerCase().includes('brake') ||
      r.keywords?.some((k: string) => k.toLowerCase().includes('brake')) ||
      r.commonProducts?.some((p: string) => p.toLowerCase().includes('brake'));

    if (isBrakeRelated) {
      console.log(`✅ ${r.code}: ${r.description.substring(0, 80)}...`);
      console.log(`   Keywords: ${r.keywords?.join(', ')}`);
      console.log();
    } else {
      console.log(`  ${r.code}: ${r.description.substring(0, 60)}...`);
    }
  });

  await prisma.$disconnect();
}

findCorrectBrakeCodes();

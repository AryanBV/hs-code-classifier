import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpecificCodes() {
  console.log('Checking specific brake pad codes...\n');

  const codes = ['6813', '6813.20.10', '6813.81.00'];

  for (const code of codes) {
    const result: any = await prisma.$queryRaw`
      SELECT
        code,
        description,
        CASE WHEN embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_embedding,
        keywords
      FROM hs_codes
      WHERE code = ${code}
    `;

    if (result.length > 0) {
      console.log(`Code: ${result[0].code}`);
      console.log(`  Description: ${result[0].description.substring(0, 80)}...`);
      console.log(`  Has embedding: ${result[0].has_embedding}`);
      console.log(`  Keywords: ${result[0].keywords?.join(', ')}`);
      console.log();
    } else {
      console.log(`Code: ${code} - NOT FOUND`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

checkSpecificCodes();

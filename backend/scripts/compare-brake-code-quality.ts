import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function compareBrakeCodeQuality() {
  console.log('Comparing 6813 vs 6813.20.10 vs 6813.81.00\\n');

  const codes = ['6813', '6813.20.10', '6813.81.00'];

  for (const code of codes) {
    const result = await prisma.hsCode.findFirst({
      where: { code }
    });

    if (result) {
      console.log(`Code: ${result.code}`);
      console.log(`  Description: ${result.description}`);
      console.log(`  Keywords: ${result.keywords?.join(', ')}`);
      console.log(`  Common Products: ${result.commonProducts?.join(', ')}`);
      console.log(`  Synonyms: ${result.synonyms?.join(', ')}`);
      console.log(`  # Keywords: ${result.keywords?.length || 0}`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

compareBrakeCodeQuality();

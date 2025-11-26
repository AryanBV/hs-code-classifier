import { prisma } from './src/utils/prisma';

async function investigate() {
  try {
    console.log('\n===== DATABASE INVESTIGATION =====\n');

    // Check total codes
    const totalCodes = await prisma.hsCode.count();
    console.log(`Total HS codes in database: ${totalCodes}`);

    // Check for mango codes (0804)
    const mangoCodes = await prisma.hsCode.findMany({
      where: { code: { startsWith: '0804' } },
      select: { code: true, description: true }
    });
    console.log(`\nMango codes (0804): Found ${mangoCodes.length}`);
    mangoCodes.slice(0, 5).forEach((c: any) => console.log(`  ${c.code}: ${c.description}`));

    // Check for cotton codes (52)
    const cottonCodes = await prisma.hsCode.findMany({
      where: { code: { startsWith: '52' } },
      select: { code: true, description: true }
    });
    console.log(`\nCotton codes (52): Found ${cottonCodes.length}`);
    cottonCodes.slice(0, 5).forEach((c: any) => console.log(`  ${c.code}: ${c.description}`));

    // Check for engine codes (84)
    const engineCodes = await prisma.hsCode.findMany({
      where: { code: { startsWith: '84' } },
      select: { code: true, description: true }
    });
    console.log(`\nEngine codes (84): Found ${engineCodes.length}`);
    engineCodes.slice(0, 5).forEach((c: any) => console.log(`  ${c.code}: ${c.description}`));

    // Check for smartphone codes (85 - electronics)
    const smartphoneCodes = await prisma.hsCode.findMany({
      where: { code: { startsWith: '85' } },
      select: { code: true, description: true }
    });
    console.log(`\nSmartphone/Electronics codes (85): Found ${smartphoneCodes.length}`);
    smartphoneCodes.slice(0, 5).forEach((c: any) => console.log(`  ${c.code}: ${c.description}`));

    // Check for specific test codes
    console.log('\n===== SPECIFIC TEST CODES =====\n');
    const mango0804 = await prisma.hsCode.findFirst({
      where: { code: '0804.50.10' }
    });
    console.log(`0804.50.10 exists: ${mango0804 !== null}`);
    if (mango0804) console.log(`  Description: ${mango0804.description}`);

    const cotton5208 = await prisma.hsCode.findFirst({
      where: { code: { startsWith: '5208' } }
    });
    console.log(`52xx exists: ${cotton5208 !== null}`);
    if (cotton5208) console.log(`  Description: ${cotton5208.description}`);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await prisma.$disconnect();
  }
}

investigate();

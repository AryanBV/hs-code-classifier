import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function findLedCodes() {
  // Search for LED related codes
  const results = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '8539' }
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  console.log('8539 codes (lamps and lighting):');
  results.forEach(c => console.log(`  ${c.code.padEnd(14)} ${c.description.substring(0, 70)}`));

  // Also check 9405 (lighting fixtures)
  const fixtures = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '9405' }
    },
    select: { code: true, description: true },
    take: 20,
    orderBy: { code: 'asc' }
  });

  console.log('\n9405 codes (lighting fixtures):');
  fixtures.forEach(c => console.log(`  ${c.code.padEnd(14)} ${c.description.substring(0, 70)}`));

  await prisma.$disconnect();
}

findLedCodes().catch(console.error);

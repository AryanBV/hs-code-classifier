import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function check() {
  // Check solar panel codes
  const solar = await prisma.hsCode.findMany({
    where: {
      OR: [
        { code: { startsWith: '8541.4' } },
        { description: { contains: 'solar', mode: Prisma.QueryMode.insensitive } },
        { description: { contains: 'photovoltaic', mode: Prisma.QueryMode.insensitive } }
      ]
    },
    select: { code: true, description: true },
    take: 10
  });
  console.log('Solar/Photovoltaic codes:');
  solar.forEach(c => console.log(`  ${c.code} - ${c.description.substring(0, 60)}`));

  // Check LED codes
  const led = await prisma.hsCode.findMany({
    where: {
      OR: [
        { code: { startsWith: '8539.5' } },
        { description: { contains: 'LED', mode: Prisma.QueryMode.insensitive } },
        { description: { contains: 'light emitting', mode: Prisma.QueryMode.insensitive } }
      ]
    },
    select: { code: true, description: true },
    take: 10
  });
  console.log('\nLED codes:');
  led.forEach(c => console.log(`  ${c.code} - ${c.description.substring(0, 60)}`));

  // Check coffee codes
  const coffee = await prisma.hsCode.findMany({
    where: { code: { startsWith: '0901' } },
    select: { code: true, description: true },
    take: 10
  });
  console.log('\nCoffee codes (0901):');
  coffee.forEach(c => console.log(`  ${c.code} - ${c.description.substring(0, 60)}`));

  await prisma.$disconnect();
}
check().catch(console.error);

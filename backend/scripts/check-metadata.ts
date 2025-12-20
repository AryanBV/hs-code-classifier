/**
 * Check metadata for specific HS codes to understand why searches fail
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkMetadata() {
  // Check 0303 codes (frozen fish, whole)
  const codes0303 = await prisma.hsCode.findMany({
    where: { code: { startsWith: '0303' } },
    select: {
      code: true,
      description: true,
      keywords: true,
      commonProducts: true
    },
    take: 10
  });

  console.log('0303 codes (frozen fish, whole):');
  codes0303.forEach(c => {
    console.log(`  ${c.code.padEnd(14)} ${c.description.substring(0, 60)}`);
    console.log(`    Keywords: ${(c.keywords || []).slice(0, 5).join(', ')}`);
    console.log(`    Products: ${(c.commonProducts || []).slice(0, 3).join(', ')}`);
  });

  // Check if 0303 codes have embeddings
  const withEmbeddings0303: any[] = await prisma.$queryRaw`
    SELECT code, description
    FROM hs_codes
    WHERE code LIKE '0303%' AND embedding IS NOT NULL
    LIMIT 10
  `;
  console.log(`\n0303 codes WITH embeddings: ${withEmbeddings0303.length}`);
  withEmbeddings0303.forEach(c => console.log(`  ${c.code}`));

  // Check 6109 codes (t-shirts)
  const codes6109 = await prisma.hsCode.findMany({
    where: { code: { startsWith: '6109' } },
    select: {
      code: true,
      description: true,
      keywords: true,
      commonProducts: true
    },
    take: 10
  });

  console.log('\n\n6109 codes (T-shirts):');
  codes6109.forEach(c => {
    console.log(`  ${c.code.padEnd(14)} ${c.description.substring(0, 60)}`);
    console.log(`    Keywords: ${(c.keywords || []).slice(0, 5).join(', ')}`);
    console.log(`    Products: ${(c.commonProducts || []).slice(0, 3).join(', ')}`);
  });

  // Check 6105 codes (men's shirts)
  const codes6105 = await prisma.hsCode.findMany({
    where: { code: { startsWith: '6105' } },
    select: {
      code: true,
      description: true,
      keywords: true,
      commonProducts: true
    },
    take: 10
  });

  console.log('\n\n6105 codes (men\'s shirts):');
  codes6105.forEach(c => {
    console.log(`  ${c.code.padEnd(14)} ${c.description.substring(0, 60)}`);
    console.log(`    Keywords: ${(c.keywords || []).slice(0, 5).join(', ')}`);
    console.log(`    Products: ${(c.commonProducts || []).slice(0, 3).join(', ')}`);
  });

  await prisma.$disconnect();
}

checkMetadata().catch(console.error);

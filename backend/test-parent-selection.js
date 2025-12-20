const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get ALL coffee-related codes under 0901
  const candidates = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '0901' }
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  // Group by 7-char subheading (6 digits: XXXX.XX)
  const groups = {};
  candidates.forEach(c => {
    if (c.code.length >= 7) {
      const subheading = c.code.substring(0, 7);
      if (!groups[subheading]) groups[subheading] = [];
      groups[subheading].push(c);
    }
  });

  console.log('=== Coffee codes grouped by 6-digit subheading ===');
  for (const [subheading, items] of Object.entries(groups)) {
    console.log(`\n${subheading} (${items.length} codes):`);
    items.forEach(c => {
      console.log(`  ${c.code} - ${c.description.substring(0, 70)}`);
    });
  }

  // Now show what the children of 0901.21 look like
  console.log('\n\n=== CRITICAL: Children of 0901.21 (Roasted, Not decaffeinated) ===');
  const children0901_21 = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '0901.21' },
      NOT: { code: '0901.21' }
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  children0901_21.forEach(c => {
    const isBulk = c.description.toLowerCase().includes('bulk') ? ' [BULK]' : '';
    const isOther = c.description.toLowerCase() === 'other' ? ' [OTHER]' : '';
    console.log(`  ${c.code} - ${c.description}${isBulk}${isOther}`);
  });

  console.log('\n\n=== KEY INSIGHT ===');
  console.log('For "Roasted, Not decaffeinated" Arabica coffee:');
  console.log('- Parent should be 0901.21');
  console.log('- Children are 0901.21.10 (bulk) and 0901.21.90 (other)');
  console.log('- System MUST ask about packaging to distinguish these!');

  await prisma.$disconnect();
}
main().catch(console.error);

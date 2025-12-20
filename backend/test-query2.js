const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate the enhanced query after Round 1 answers
const enhancedQuery = 'coffee Arabica Cherry Roasted Not decaffeinated';

async function main() {
  // Get candidates via keyword search (simulating what the search would return)
  const candidates = await prisma.hsCode.findMany({
    where: {
      OR: [
        { code: { startsWith: '0901' } },
        { description: { contains: 'coffee', mode: 'insensitive' } }
      ]
    },
    select: { code: true, description: true },
    orderBy: { code: 'asc' }
  });

  // Group by 7-char subheading
  const groups = {};
  candidates.forEach(c => {
    const subheading = c.code.substring(0, 7);
    if (!groups[subheading]) groups[subheading] = [];
    groups[subheading].push(c);
  });

  console.log('Candidates grouped by subheading:');
  for (const [subheading, items] of Object.entries(groups)) {
    console.log(`\n${subheading} (${items.length} codes):`);
    items.slice(0, 5).forEach(c => console.log(`  ${c.code} - ${c.description.substring(0, 60)}`));
    if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);

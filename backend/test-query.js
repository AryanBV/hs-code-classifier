const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const children = await prisma.hsCode.findMany({
    where: {
      code: { startsWith: '0901.21' },
      NOT: { code: '0901.21' }
    },
    select: { code: true, description: true, keywords: true },
    orderBy: { code: 'asc' }
  });

  console.log('Children of 0901.21:');
  children.forEach(c => {
    console.log('  ', c.code, '-', c.description);
    console.log('    keywords:', c.keywords ? c.keywords.join(', ') : 'none');
  });

  await prisma.$disconnect();
}
main().catch(console.error);

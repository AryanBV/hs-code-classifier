import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check870830() {
  const code = await prisma.hsCode.findFirst({
    where: { code: '8708.30.00' }
  });

  if (code) {
    console.log('Code: 8708.30.00');
    console.log(`Description: ${code.description}`);
    console.log(`Keywords: ${code.keywords?.join(', ')}`);
    console.log(`Common Products: ${code.commonProducts?.join(', ')}`);
    console.log(`Synonyms: ${code.synonyms?.join(', ')}`);
  } else {
    console.log('Code 8708.30.00 NOT FOUND!');
  }

  await prisma.$disconnect();
}

check870830();

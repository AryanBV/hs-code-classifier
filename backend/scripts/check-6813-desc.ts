import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const code = await prisma.hsCode.findFirst({
    where: { code: '6813' }
  });

  console.log('Code:', code?.code);
  console.log('Description:', code?.description);

  await prisma.$disconnect();
}

check();

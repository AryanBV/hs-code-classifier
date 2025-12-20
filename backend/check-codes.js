
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const codes = ['5007', '5208', '6205', '6101', '6302', '9404', '2523', '6810'];
  for (const c of codes) {
    const r = await prisma.hsCode.findFirst({ where: { code: { startsWith: c } }, select: { code: true, description: true } });
    if (r) console.log(c + ': ' + r.description.substring(0,80));
  }
  await prisma.\();
}
run();


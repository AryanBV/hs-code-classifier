import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
  console.log('=== DIAGNOSTIC: Instant Coffee Classification ===\n');

  // 1. Check if Ch.21 codes exist
  console.log('1. Checking Chapter 21 codes in database...');
  const ch21Codes: any[] = await prisma.$queryRaw`
    SELECT code, description FROM "HsCode" WHERE code LIKE '21%' LIMIT 20
  `;
  console.log(`   Found ${ch21Codes.length} Ch.21 codes`);
  if (ch21Codes.length > 0) {
    console.log('   Sample codes:');
    ch21Codes.slice(0, 5).forEach(c => console.log(`     ${c.code}: ${c.description?.substring(0, 50)}...`));
  }

  // 2. Check specifically for 2101 codes
  console.log('\n2. Checking for 2101.xx (coffee extracts) codes...');
  const coffeeExtractCodes: any[] = await prisma.$queryRaw`
    SELECT code, description, keywords FROM "HsCode" WHERE code LIKE '2101%'
  `;
  console.log(`   Found ${coffeeExtractCodes.length} codes under 2101`);
  coffeeExtractCodes.forEach(c => {
    console.log(`     ${c.code}: ${c.description}`);
    console.log(`       Keywords: ${JSON.stringify(c.keywords) || 'NONE'}`);
  });

  // 3. Search for "instant" keyword anywhere
  console.log('\n3. Searching for codes with "instant" in description or keywords...');
  const instantCodes: any[] = await prisma.$queryRaw`
    SELECT code, description FROM "HsCode"
    WHERE description ILIKE '%instant%'
       OR 'instant' = ANY(keywords)
  `;
  console.log(`   Found ${instantCodes.length} codes with "instant"`);
  instantCodes.forEach(c => console.log(`     ${c.code}: ${c.description?.substring(0, 60)}`));

  // 4. Check for "coffee" in Ch.21
  console.log('\n4. Searching for "coffee" in Chapter 21...');
  const ch21Coffee: any[] = await prisma.$queryRaw`
    SELECT code, description FROM "HsCode"
    WHERE code LIKE '21%'
      AND (description ILIKE '%coffee%' OR 'coffee' = ANY(keywords))
  `;
  console.log(`   Found ${ch21Coffee.length} codes`);
  ch21Coffee.forEach(c => console.log(`     ${c.code}: ${c.description}`));

  // 5. Check for "coffee" anywhere in database
  console.log('\n5. Searching for ALL codes with "coffee"...');
  const allCoffee: any[] = await prisma.$queryRaw`
    SELECT code, description FROM "HsCode"
    WHERE description ILIKE '%coffee%' OR 'coffee' = ANY(keywords)
    LIMIT 20
  `;
  console.log(`   Found ${allCoffee.length} codes with "coffee"`);
  allCoffee.slice(0, 15).forEach(c => console.log(`     ${c.code}: ${c.description?.substring(0, 60)}`));

  // 6. Total database count
  console.log('\n6. Database statistics...');
  const totalCodes: any[] = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "HsCode"`;
  console.log(`   Total HS codes in database: ${totalCodes[0].count}`);

  const ch09Count: any[] = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "HsCode" WHERE code LIKE '09%'`;
  console.log(`   Chapter 09 codes: ${ch09Count[0].count}`);

  const ch21Count: any[] = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "HsCode" WHERE code LIKE '21%'`;
  console.log(`   Chapter 21 codes: ${ch21Count[0].count}`);

  await prisma.$disconnect();
}

diagnose().catch(console.error);

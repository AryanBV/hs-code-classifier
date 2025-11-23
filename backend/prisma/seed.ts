import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  // Try multiple possible paths for the HS codes JSON file
  const possiblePaths = [
    path.join(__dirname, 'hs-codes.json'),              // Railway: backend/prisma/hs-codes.json
    path.join(__dirname, '../../data/hs_codes_seed.json'), // Local: data/hs_codes_seed.json
  ];

  let dataPath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dataPath = p;
      break;
    }
  }

  if (!dataPath) {
    throw new Error('HS codes JSON file not found. Checked: ' + possiblePaths.join(', '));
  }

  console.log(`Loading HS codes from: ${dataPath}`);
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`Seeding ${data.length} HS codes...`);

  for (const record of data) {
    await prisma.hsCode.create({
      data: {
        code: record.code,
        chapter: record.chapter,
        heading: record.heading,
        subheading: record.subheading,
        countryCode: record.country_code,
        description: record.description,
        keywords: record.keywords,
        commonProducts: record.common_products,
      },
    });
    console.log(`OK ${record.code} - ${record.common_products[0]}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

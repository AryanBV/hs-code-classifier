import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkVectorIndex() {
  console.log('Checking pgvector index configuration...\n');

  // Check if index exists
  const indexes: any[] = await prisma.$queryRaw`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'hs_codes'
      AND indexname LIKE '%embedding%'
  `;

  console.log('Embedding indexes:');
  if (indexes.length === 0) {
    console.log('  ❌ NO INDEXES FOUND!');
  } else {
    indexes.forEach(idx => {
      console.log(`  ${idx.indexname}:`);
      console.log(`    ${idx.indexdef}`);
    });
  }

  console.log();

  // Check vector extension
  const extensions: any[] = await prisma.$queryRaw`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname = 'vector'
  `;

  console.log('pgvector extension:');
  if (extensions.length === 0) {
    console.log('  ❌ NOT INSTALLED!');
  } else {
    console.log(`  ✅ Installed (version ${extensions[0].extversion})`);
  }

  await prisma.$disconnect();
}

checkVectorIndex();

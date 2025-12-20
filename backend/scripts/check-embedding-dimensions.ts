import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEmbeddingDimensions() {
  console.log('Checking embedding dimensions...\n');

  // Get a sample embedding
  const sample: any[] = await prisma.$queryRaw`
    SELECT
      code,
      array_length(embedding::float[], 1) as dimensions
    FROM hs_codes
    WHERE embedding IS NOT NULL
    LIMIT 10
  `;

  console.log('Sample embedding dimensions:');
  sample.forEach(s => {
    console.log(`  ${s.code}: ${s.dimensions} dimensions`);
  });

  // Check for any NULL or invalid embeddings
  const nullCheck: any = await prisma.$queryRaw`
    SELECT COUNT(*) as total,
           COUNT(embedding) as with_embedding,
           COUNT(*) - COUNT(embedding) as null_embeddings
    FROM hs_codes
  `;

  console.log(`\nEmbedding status:`);
  console.log(`  Total codes: ${nullCheck[0].total}`);
  console.log(`  With embeddings: ${nullCheck[0].with_embedding}`);
  console.log(`  NULL embeddings: ${nullCheck[0].null_embeddings}`);

  await prisma.$disconnect();
}

checkEmbeddingDimensions();

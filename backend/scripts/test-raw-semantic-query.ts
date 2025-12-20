import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testRawSemanticQuery() {
  const query = 'ceramic brake pads for motorcycles';

  console.log(`Query: "${query}"\n`);

  // Generate embedding
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });

  const queryEmbedding = response.data[0]?.embedding;
  if (!queryEmbedding) {
    console.log('Failed to generate embedding');
    return;
  }

  console.log('Embedding generated:', queryEmbedding.length, 'dimensions\n');

  // Test 1: Count total codes with embeddings
  const totalCount: any = await prisma.$queryRaw`
    SELECT COUNT(*) as total
    FROM hs_codes
    WHERE embedding IS NOT NULL
  `;
  console.log('Total codes with embeddings:', totalCount[0].total, '\n');

  // Test 2: Get top 50 with similarity scores
  const results: any[] = await prisma.$queryRaw`
    SELECT
      code,
      description,
      1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM hs_codes
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT 50
  `;

  console.log(`Top 50 results:\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.code} (similarity: ${Number(r.similarity).toFixed(4)})`);
    if (r.code.startsWith('6813')) {
      console.log(`   ⭐ BRAKE CODE!`);
    }
  });

  await prisma.$disconnect();
}

testRawSemanticQuery();

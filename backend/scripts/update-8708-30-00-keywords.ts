import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function update870830Keywords() {
  console.log('Updating 8708.30.00 with better keywords for brake pads...\n');

  // Update keywords to include "brake pads"
  const updatedKeywords = [
    'brakes',
    'brake pads',
    'brake discs',
    'brake drums',
    'servo-brakes',
    'automotive brakes',
    'vehicle brakes',
    'braking systems',
    'brake components'
  ];

  const updatedCommonProducts = [
    'car brake pads',
    'motorcycle brake pads',
    'truck brake pads',
    'brake discs',
    'brake drums',
    'brake calipers',
    'disc brakes',
    'drum brakes'
  ];

  const updatedSynonyms = [
    'braking devices',
    'brake systems',
    'brake assemblies',
    'friction brakes',
    'disc brake pads',
    'drum brake shoes'
  ];

  // Update the record
  await prisma.hsCode.update({
    where: { code: '8708.30.00' },
    data: {
      keywords: updatedKeywords,
      commonProducts: updatedCommonProducts,
      synonyms: updatedSynonyms
    }
  });

  console.log('✅ Updated keywords, common products, and synonyms');
  console.log(`   Keywords: ${updatedKeywords.join(', ')}`);
  console.log();

  // Regenerate embedding
  console.log('Regenerating embedding with new data...');

  const code = await prisma.hsCode.findFirst({
    where: { code: '8708.30.00' }
  });

  if (!code) {
    console.log('Code not found!');
    return;
  }

  const enrichedText = `HS Code ${code.code}: ${code.description}. Keywords: ${updatedKeywords.join(', ')}. Common products: ${updatedCommonProducts.join(', ')}. Synonyms: ${updatedSynonyms.join(', ')}`;

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: enrichedText
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    console.log('Failed to generate embedding');
    return;
  }

  await prisma.$executeRaw`
    UPDATE hs_codes
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE code = '8708.30.00'
  `;

  console.log('✅ Regenerated embedding');
  console.log('\n🎉 8708.30.00 is now optimized for brake pad searches!');

  await prisma.$disconnect();
}

update870830Keywords();

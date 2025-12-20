/**
 * Fix metadata for LED and solar panel codes
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface MetadataFix {
  codePattern: string;
  keywords: string[];
  commonProducts: string[];
  synonyms?: string[];
}

const METADATA_FIXES: MetadataFix[] = [
  // LED lights
  {
    codePattern: '8539.51',
    keywords: ['led', 'led module', 'light emitting diode', 'led light', 'led lighting', 'led strip', 'led panel'],
    commonProducts: ['led modules', 'led strips', 'led panels', 'led arrays'],
    synonyms: ['led', 'light emitting diode', 'led module']
  },
  {
    codePattern: '8539.52',
    keywords: ['led bulb', 'led lamp', 'led light bulb', 'led lighting', 'led ceiling light', 'energy efficient light'],
    commonProducts: ['led bulbs', 'led lamps', 'led light bulbs', 'led tubes', 'led spotlights'],
    synonyms: ['led bulb', 'led lamp', 'led light']
  },

  // Solar panels / Photovoltaic
  {
    codePattern: '8541.41',
    keywords: ['solar panel', 'solar cell', 'photovoltaic', 'pv panel', 'solar module', 'solar energy', 'photovoltaic cell'],
    commonProducts: ['solar panels', 'photovoltaic cells', 'solar modules', 'pv panels'],
    synonyms: ['solar panel', 'pv panel', 'solar cell', 'photovoltaic']
  },
  {
    codePattern: '8541.42',
    keywords: ['solar panel', 'solar cell', 'photovoltaic', 'pv panel', 'solar module', 'solar array', 'solar energy panel'],
    commonProducts: ['solar panels', 'photovoltaic modules', 'solar cell arrays', 'solar energy systems'],
    synonyms: ['solar panel', 'pv module', 'solar array']
  },

  // Wrist watches - 9102 (non-precious metal case)
  {
    codePattern: '9102',
    keywords: ['wrist watch', 'wristwatch', 'watch', 'timepiece', 'quartz watch', 'digital watch', 'analog watch', 'sports watch'],
    commonProducts: ['wristwatches', 'digital watches', 'sports watches', 'quartz watches', 'analog watches'],
    synonyms: ['wristwatch', 'wrist watch', 'watch']
  }
];

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0]?.embedding || null;
  } catch (error) {
    console.error('Embedding error:', error);
    return null;
  }
}

async function fixMetadata() {
  console.log('🔧 FIXING LED AND SOLAR PANEL METADATA\n');

  let fixedCount = 0;
  let errorCount = 0;

  for (const fix of METADATA_FIXES) {
    console.log(`\n📝 Processing: ${fix.codePattern}`);

    const codes = await prisma.hsCode.findMany({
      where: { code: { startsWith: fix.codePattern } },
      select: { code: true, description: true, keywords: true, commonProducts: true }
    });

    if (codes.length === 0) {
      console.log(`   ⚠️ No codes found for pattern ${fix.codePattern}`);
      continue;
    }

    for (const code of codes) {
      const existingKeywords = code.keywords || [];
      const existingProducts = code.commonProducts || [];

      const mergedKeywords = [...new Set([...fix.keywords, ...existingKeywords])];
      const mergedProducts = [...new Set([...fix.commonProducts, ...existingProducts])];
      const synonyms = fix.synonyms || [];

      const embeddingText = [
        code.description,
        ...mergedKeywords,
        ...mergedProducts,
        ...synonyms
      ].join(' ');

      const embedding = await generateEmbedding(embeddingText);

      if (!embedding) {
        console.log(`   ❌ Failed to generate embedding for ${code.code}`);
        errorCount++;
        continue;
      }

      try {
        await prisma.$executeRaw`
          UPDATE hs_codes
          SET
            keywords = ${mergedKeywords}::text[],
            common_products = ${mergedProducts}::text[],
            synonyms = ${synonyms}::text[],
            embedding = ${JSON.stringify(embedding)}::vector
          WHERE code = ${code.code}
        `;

        console.log(`   ✅ Updated ${code.code}`);
        fixedCount++;
      } catch (err) {
        console.log(`   ❌ Error updating ${code.code}:`, err);
        errorCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Fixed: ${fixedCount} codes`);
  console.log(`❌ Errors: ${errorCount} codes`);

  await prisma.$disconnect();
}

fixMetadata().catch(console.error);

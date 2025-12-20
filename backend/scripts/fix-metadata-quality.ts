/**
 * Fix metadata quality issues for specific HS codes
 *
 * This script corrects known metadata problems that cause misclassification:
 * 1. 6109 codes need "t-shirt" in keywords/products (not just generic cotton)
 * 2. 0303 codes need "frozen fish" keywords
 * 3. Other known issues
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

// Targeted fixes for known problematic codes
const METADATA_FIXES: MetadataFix[] = [
  // T-shirts (6109) - heading clearly says "T-shirts, singlets and other vests"
  {
    codePattern: '6109.10.00',
    keywords: ['t-shirt', 'tshirt', 'tee shirt', 'cotton t-shirt', 'knitted shirt', 'singlet', 'vest', 'tank top', 'sleeveless', 'cotton clothing', 'casual wear'],
    commonProducts: ['cotton t-shirts', 'men\'s t-shirts', 'women\'s t-shirts', 'sports t-shirts', 'casual t-shirts', 'printed t-shirts', 'plain t-shirts'],
    synonyms: ['t-shirt', 'tee', 'tshirt', 'singlet', 'vest', 'tank top']
  },
  {
    codePattern: '6109',
    keywords: ['t-shirt', 'tshirt', 'singlet', 'vest', 'tank top', 'knitted', 'crocheted', 'casual wear'],
    commonProducts: ['t-shirts', 'singlets', 'vests', 'tank tops', 'sleeveless shirts'],
    synonyms: ['t-shirt', 'tee', 'singlet', 'undershirt']
  },
  {
    codePattern: '6109.90',
    keywords: ['t-shirt', 'singlet', 'vest', 'synthetic t-shirt', 'polyester t-shirt'],
    commonProducts: ['synthetic t-shirts', 'sports t-shirts', 'performance t-shirts'],
    synonyms: ['t-shirt', 'tee']
  },

  // Frozen fish, whole (0303) - distinct from fillets (0304)
  {
    codePattern: '0303',
    keywords: ['frozen fish', 'whole fish', 'frozen seafood', 'iced fish', 'frozen whole fish', 'fish frozen', 'seafood frozen'],
    commonProducts: ['frozen whole fish', 'frozen salmon', 'frozen tilapia', 'frozen tuna', 'frozen mackerel'],
    synonyms: ['frozen fish', 'iced fish', 'whole frozen fish']
  },
  {
    codePattern: '0303.11.00',
    keywords: ['frozen sockeye salmon', 'frozen red salmon', 'whole frozen salmon', 'frozen fish'],
    commonProducts: ['frozen sockeye salmon', 'whole frozen salmon'],
    synonyms: ['frozen salmon', 'red salmon']
  },
  {
    codePattern: '0303.12.00',
    keywords: ['frozen pacific salmon', 'frozen salmon', 'whole frozen salmon', 'frozen fish'],
    commonProducts: ['frozen pacific salmon', 'whole frozen salmon'],
    synonyms: ['frozen salmon', 'pacific salmon']
  },

  // Wrist watches distinction - 9101 is precious, 9102 is other
  {
    codePattern: '9101',
    keywords: ['wrist watch', 'wristwatch', 'luxury watch', 'gold watch', 'silver watch', 'precious metal watch', 'high-end watch'],
    commonProducts: ['gold wristwatches', 'luxury watches', 'precious metal watches', 'designer watches'],
    synonyms: ['wristwatch', 'wrist watch', 'luxury watch']
  },

  // Cotton fabric woven (5208) vs cotton yarn (5207)
  {
    codePattern: '5208',
    keywords: ['cotton fabric', 'woven cotton', 'cotton cloth', 'cotton textile', 'cotton material', 'plain weave cotton'],
    commonProducts: ['cotton fabric rolls', 'woven cotton material', 'cotton cloth for garments', 'cotton textile'],
    synonyms: ['cotton fabric', 'cotton cloth', 'woven cotton']
  },

  // Apple juice (2009.71 is Brix ≤ 20, 2009.79 is other)
  {
    codePattern: '2009.71',
    keywords: ['apple juice', 'pure apple juice', 'fresh apple juice', 'apple drink', 'unfermented apple juice'],
    commonProducts: ['apple juice', 'pure apple juice', 'apple juice bottles', 'apple juice cartons'],
    synonyms: ['apple juice', 'apple drink']
  },

  // Solar panels/photovoltaic cells
  {
    codePattern: '8541.40',
    keywords: ['solar panel', 'solar cell', 'photovoltaic', 'pv panel', 'solar module', 'solar energy'],
    commonProducts: ['solar panels', 'photovoltaic cells', 'solar modules', 'solar energy panels'],
    synonyms: ['solar panel', 'pv panel', 'solar cell']
  },

  // LED lights
  {
    codePattern: '8539.50',
    keywords: ['led', 'led light', 'led bulb', 'led lamp', 'light emitting diode', 'led lighting'],
    commonProducts: ['led bulbs', 'led lights', 'led lamps', 'led strips'],
    synonyms: ['led', 'led light', 'led bulb']
  },

  // Paper notebooks
  {
    codePattern: '4820.10',
    keywords: ['notebook', 'notepad', 'exercise book', 'writing pad', 'paper notebook', 'journal'],
    commonProducts: ['paper notebooks', 'school notebooks', 'office notepads', 'writing journals'],
    synonyms: ['notebook', 'notepad', 'writing pad']
  },

  // Leather footwear
  {
    codePattern: '6403.99',
    keywords: ['leather shoes', 'leather footwear', 'leather boots', 'dress shoes', 'casual leather shoes'],
    commonProducts: ['leather shoes', 'leather boots', 'leather sandals', 'dress shoes'],
    synonyms: ['leather shoes', 'leather footwear']
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
  console.log('🔧 FIXING METADATA QUALITY ISSUES\n');
  console.log('This script updates keywords, commonProducts, and regenerates embeddings\n');

  let fixedCount = 0;
  let errorCount = 0;

  for (const fix of METADATA_FIXES) {
    console.log(`\n📝 Processing: ${fix.codePattern}`);

    // Find matching codes
    const codes = await prisma.hsCode.findMany({
      where: { code: { startsWith: fix.codePattern } },
      select: { code: true, description: true, keywords: true, commonProducts: true }
    });

    if (codes.length === 0) {
      console.log(`   ⚠️ No codes found for pattern ${fix.codePattern}`);
      continue;
    }

    for (const code of codes) {
      // Merge existing keywords with new ones (preserve existing, add new)
      const existingKeywords = code.keywords || [];
      const existingProducts = code.commonProducts || [];

      const mergedKeywords = [...new Set([...fix.keywords, ...existingKeywords])];
      const mergedProducts = [...new Set([...fix.commonProducts, ...existingProducts])];
      const synonyms = fix.synonyms || [];

      // Generate new embedding with enriched text
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

      // Update the code
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

        console.log(`   ✅ Updated ${code.code} (${mergedKeywords.length} keywords, ${mergedProducts.length} products)`);
        fixedCount++;
      } catch (err) {
        console.log(`   ❌ Error updating ${code.code}:`, err);
        errorCount++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Fixed: ${fixedCount} codes`);
  console.log(`❌ Errors: ${errorCount} codes`);
  console.log(`${'═'.repeat(60)}`);

  await prisma.$disconnect();
}

fixMetadata().catch(console.error);

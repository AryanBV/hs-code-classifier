// @ts-nocheck
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// Configuration
// DEFAULT: Skip embeddings for speed (can be enabled with GENERATE_EMBEDDINGS=true)
const SKIP_EMBEDDINGS = process.env.GENERATE_EMBEDDINGS !== 'true';
const BATCH_SIZE = 100; // Process embeddings in batches
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

interface HSCodeData {
  hs_code: string;
  description: string;
  description_clean?: string;
  chapter: string;
  heading: string;
  subheading: string;
  basic_duty?: string;
  keywords?: string[];
  common_products?: string[];
  synonyms?: string[];
  embedding?: number[];
}

interface SynonymData {
  user_term: string;
  hs_term: string;
  hs_code: string;
  source: string;
}

/**
 * Generate embeddings for a batch of texts using OpenAI
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
  }

  console.log(`  Generating embeddings for ${texts.length} items...`);

  try {
    const response = await openai.embeddings.create({
      input: texts,
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });

    return response.data.map((item) => item.embedding);
  } catch (error: any) {
    console.error('  ❌ Error generating embeddings:', error.message);
    throw error;
  }
}

/**
 * Insert HS code with vector embedding using two-step approach
 * Step 1: Upsert the record using Prisma ORM
 * Step 2: Update embedding separately with raw SQL
 */
async function insertHsCodeWithEmbedding(
  code: HSCodeData,
  embedding?: number[]
): Promise<void> {
  // Detect if description contains "Other"
  const isOther = code.description.toLowerCase().includes('other');

  // Extract parent heading (first 4 digits)
  const parentHeading = code.heading;

  try {
    // Step 1: Insert/update using Prisma (skip embedding for now)
    await prisma.hsCode.upsert({
      where: { code: code.hs_code },
      update: {
        description: code.description,
        descriptionClean: code.description_clean || code.description,
        keywords: code.keywords || [],
        commonProducts: code.common_products || [],
        synonyms: code.synonyms || [],
        isOther,
        updatedAt: new Date(),
      },
      create: {
        code: code.hs_code,
        description: code.description,
        descriptionClean: code.description_clean || code.description,
        chapter: code.chapter,
        heading: code.heading,
        subheading: code.subheading || code.heading,
        countryCode: 'IN',
        dutyRate: code.basic_duty || null,
        keywords: code.keywords || [],
        commonProducts: code.common_products || [],
        synonyms: code.synonyms || [],
        isOther,
        parentHeading,
      },
    });

    // Step 2: Update embedding separately if provided
    if (embedding) {
      // Convert embedding to PostgreSQL vector format
      const embeddingStr = '[' + embedding.join(',') + ']';

      // Use raw SQL to update just the embedding field
      await prisma.$executeRawUnsafe(
        `UPDATE hs_codes SET embedding = $1::vector WHERE code = $2`,
        embeddingStr,
        code.hs_code
      );
    }
  } catch (error: any) {
    console.error(`  ❌ Error inserting ${code.hs_code}:`, error.message);
    throw error;
  }
}

/**
 * Seed HS Codes from JSON file
 */
async function seedHsCodes(): Promise<void> {
  console.log('\n📦 SEEDING HS CODES');
  console.log('═'.repeat(60));

  // Try multiple possible paths
  const possiblePaths = [
    path.join(__dirname, '../../data/hs_codes_clean.json'),  // Primary: Python pipeline output
    path.join(__dirname, 'hs-codes.json'),                    // Fallback: Local copy
    path.join(__dirname, '../../data/hs_codes_seed.json'),   // Fallback: Old format
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

  console.log(`📄 Loading from: ${dataPath}`);
  const hsCodes: HSCodeData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`✓ Loaded ${hsCodes.length} HS codes\n`);

  // Check if embeddings should be generated
  const shouldGenerateEmbeddings = !SKIP_EMBEDDINGS && openai;

  if (SKIP_EMBEDDINGS) {
    console.log('⚠️  Skipping embedding generation (SKIP_EMBEDDINGS=true)');
  } else if (!openai) {
    console.log('⚠️  Skipping embedding generation (OPENAI_API_KEY not set)');
  } else {
    console.log('🤖 Generating embeddings with OpenAI text-embedding-3-small');
  }

  console.log('\n📝 Inserting HS codes...\n');

  let successCount = 0;
  let errorCount = 0;

  if (shouldGenerateEmbeddings) {
    // Process in batches for embedding generation
    for (let i = 0; i < hsCodes.length; i += BATCH_SIZE) {
      const batch = hsCodes.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(hsCodes.length / BATCH_SIZE);

      console.log(`\nBatch ${batchNum}/${totalBatches} (codes ${i + 1}-${Math.min(i + BATCH_SIZE, hsCodes.length)})`);

      try {
        // Generate embeddings for batch
        const texts = batch.map(
          (code) => `${code.hs_code} ${code.description_clean || code.description}`
        );
        const embeddings = await generateEmbeddings(texts);

        // Insert each code with its embedding
        for (let j = 0; j < batch.length; j++) {
          try {
            await insertHsCodeWithEmbedding(batch[j], embeddings[j]);
            successCount++;

            if ((successCount) % 10 === 0 || successCount === hsCodes.length) {
              process.stdout.write(`\r  ✓ Inserted ${successCount}/${hsCodes.length} codes`);
            }
          } catch (error) {
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`\n  ❌ Batch ${batchNum} failed:`, error.message);
        errorCount += batch.length;
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < hsCodes.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  } else {
    // Insert without embeddings
    for (let i = 0; i < hsCodes.length; i++) {
      try {
        await insertHsCodeWithEmbedding(hsCodes[i]);
        successCount++;

        if ((successCount) % 10 === 0 || successCount === hsCodes.length) {
          process.stdout.write(`\r  ✓ Inserted ${successCount}/${hsCodes.length} codes`);
        }
      } catch (error) {
        errorCount++;
      }
    }
  }

  console.log('\n\n✅ HS Codes seeding complete!');
  console.log(`   Success: ${successCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
}

/**
 * Seed Product Synonyms from CSV file
 */
async function seedSynonyms(): Promise<void> {
  console.log('\n📚 SEEDING PRODUCT SYNONYMS');
  console.log('═'.repeat(60));

  const synonymPath = path.join(__dirname, '../../data/synonyms.csv');

  if (!fs.existsSync(synonymPath)) {
    console.log('⚠️  synonyms.csv not found, skipping synonym seeding');
    return;
  }

  console.log(`📄 Loading from: ${synonymPath}`);
  const csvContent = fs.readFileSync(synonymPath, 'utf-8');

  // Parse CSV
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    console.log('⚠️  synonyms.csv is empty');
    return;
  }
  const headers = lines[0]!.split(',');

  const synonyms: SynonymData[] = lines.slice(1).map((line) => {
    const values = line.split(',');
    return {
      user_term: values[0]?.trim() || '',
      hs_term: values[1]?.trim() || '',
      hs_code: values[2]?.trim() || '',
      source: values[3]?.trim() || 'manual',
    };
  }).filter(syn => syn.user_term && syn.hs_code);

  console.log(`✓ Loaded ${synonyms.length} synonym mappings\n`);

  console.log('📝 Inserting synonyms...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const synonym of synonyms) {
    try {
      // @ts-ignore
      await prisma.productSynonym.upsert({
        where: {
          id: 0, // Dummy value since we don't have a unique constraint on the actual fields
        },
        update: {},
        create: {
          canonicalTerm: synonym.hs_term,
          synonyms: [synonym.user_term],
          hsCode: synonym.hs_code,
          category: 'General', // Default category
          confidence: synonym.source === 'manual' ? 1.0 : 0.8,
        },
      });
      successCount++;

      if ((successCount) % 10 === 0 || successCount === synonyms.length) {
        process.stdout.write(`\r  ✓ Inserted ${successCount}/${synonyms.length} synonyms`);
      }
    } catch (error) {
      // If upsert fails, try to find and update existing
      try {
        // @ts-ignore
        const existing = await prisma.productSynonym.findFirst({
          where: {
            canonicalTerm: synonym.hs_term,
            hsCode: synonym.hs_code,
          },
        });

        if (existing) {
          // Append to existing synonyms array
          const newSynonyms = [...new Set([...existing.synonyms, synonym.user_term])];
          // @ts-ignore
          await prisma.productSynonym.update({
            where: { id: existing.id },
            data: { synonyms: newSynonyms },
          });
          successCount++;
        } else {
          // Create new
          // @ts-ignore
          await prisma.productSynonym.create({
            data: {
              canonicalTerm: synonym.hs_term,
              synonyms: [synonym.user_term],
              hsCode: synonym.hs_code,
              category: 'General',
              confidence: synonym.source === 'manual' ? 1.0 : 0.8,
            },
          });
          successCount++;
        }
      } catch (retryError) {
        errorCount++;
      }
    }
  }

  console.log('\n\n✅ Synonyms seeding complete!');
  console.log(`   Success: ${successCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
}

/**
 * Main seeding function
 */
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  HS CODE CLASSIFIER - DATABASE SEEDING');
  console.log('═'.repeat(60));

  try {
    // Seed HS codes
    await seedHsCodes();

    // Seed synonyms
    await seedSynonyms();

    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ ALL SEEDING COMPLETE!');
    console.log('═'.repeat(60));
    console.log('\n📊 Database Summary:');

    const hsCodeCount = await prisma.hsCode.count();
    const synonymCount = await prisma.productSynonym.count();

    console.log(`   HS Codes: ${hsCodeCount}`);
    console.log(`   Synonyms: ${synonymCount}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  }
}

// Execute main function
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

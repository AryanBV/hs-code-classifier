/**
 * Phase 3: Generate AI Metadata (keywords, commonProducts, synonyms)
 *
 * This script:
 * 1. Loads all HS codes from database
 * 2. Uses GPT-4o-mini to generate metadata for each code
 * 3. Stores metadata in keywords, commonProducts, synonyms fields
 * 4. Processes in batches with rate limiting
 * 5. Implements checkpoint system for resumability
 */

import { PrismaClient, Prisma } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration
const MODEL = 'gpt-4o-mini';
const BATCH_SIZE = 50; // Process 50 codes at a time
const CONCURRENT_REQUESTS = 5; // Process 5 codes in parallel
const CHECKPOINT_FILE = path.join(__dirname, '../../data/checkpoints/metadata-generation.json');
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const REQUEST_DELAY = 200; // 200ms delay between requests (optimized)

interface CodeMetadata {
  keywords: string[];
  commonProducts: string[];
  synonyms: string[];
}

interface Checkpoint {
  lastProcessedId: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  totalCost: number;
}

/**
 * Load checkpoint from file
 */
function loadCheckpoint(): Checkpoint | null {
  try {
    const checkpointDir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading checkpoint:', error);
  }
  return null;
}

/**
 * Save checkpoint to file
 */
function saveCheckpoint(checkpoint: Checkpoint): void {
  try {
    const checkpointDir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  } catch (error) {
    console.error('Error saving checkpoint:', error);
  }
}

/**
 * Generate metadata for a single HS code using GPT-4o-mini
 */
async function generateMetadata(
  code: string,
  description: string,
  retryCount = 0
): Promise<CodeMetadata | null> {
  try {
    const prompt = `You are an expert in harmonized system (HS) codes for international trade classification.

Given this HS code and description, extract relevant metadata:

HS Code: ${code}
Description: ${description}

Generate:
1. **keywords**: 5-7 highly relevant keywords for classification (e.g., "live", "animals", "horses", "livestock", "equine")
2. **commonProducts**: 3-5 typical real-world products that use this code (e.g., "racing horses", "farm horses", "breeding mares")
3. **synonyms**: 3-5 alternative terms or names (e.g., "equine", "ponies", "stallions", "mares")

Return ONLY valid JSON in this exact format:
{
  "keywords": ["keyword1", "keyword2", ...],
  "commonProducts": ["product1", "product2", ...],
  "synonyms": ["synonym1", "synonym2", ...]
}

Rules:
- Use lowercase for all terms
- Keep terms concise (1-3 words max)
- Focus on searchable, practical terms
- Avoid generic words like "other", "various"
- Return ONLY the JSON object, no markdown, no explanations`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a metadata extraction expert. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Low temperature for consistent extraction
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    const metadata = JSON.parse(content) as CodeMetadata;

    // Validate structure
    if (!metadata.keywords || !metadata.commonProducts || !metadata.synonyms) {
      throw new Error('Invalid metadata structure');
    }

    // Calculate cost (approximate)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);

    return {
      ...metadata,
      cost
    } as any;

  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`   Retry ${retryCount + 1}/${MAX_RETRIES} for ${code}...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateMetadata(code, description, retryCount + 1);
    }

    console.error(`   ❌ Failed to generate metadata for ${code}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Clean and validate metadata arrays
 */
function cleanMetadata(metadata: CodeMetadata): CodeMetadata {
  const clean = (arr: string[]) =>
    arr
      .filter(item => item && item.trim().length > 0)
      .map(item => item.toLowerCase().trim())
      .slice(0, 10); // Max 10 items per array

  return {
    keywords: clean(metadata.keywords || []),
    commonProducts: clean(metadata.commonProducts || []),
    synonyms: clean(metadata.synonyms || [])
  };
}

/**
 * Main execution function
 */
async function main() {
  console.log('🤖 PHASE 3: GENERATE AI METADATA');
  console.log('═'.repeat(70));
  console.log(`Model: ${MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log();

  try {
    // Load checkpoint
    let checkpoint: Checkpoint = loadCheckpoint() || {
      lastProcessedId: 0,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      totalCost: 0
    };

    const isResume = loadCheckpoint() !== null;

    if (isResume) {
      console.log('📋 Resuming from checkpoint:');
      console.log(`   Last processed ID: ${checkpoint.lastProcessedId}`);
      console.log(`   Processed: ${checkpoint.processedCount} codes`);
      console.log(`   Successes: ${checkpoint.successCount}`);
      console.log(`   Errors: ${checkpoint.errorCount}`);
      console.log(`   Total cost so far: $${checkpoint.totalCost.toFixed(4)}`);
      console.log();
    }

    // Get all codes that need metadata generation
    console.log('📊 Loading HS codes from database...');
    const allCodes = await prisma.hsCode.findMany({
      where: {
        id: {
          gt: checkpoint.lastProcessedId
        }
      },
      select: {
        id: true,
        code: true,
        description: true
      },
      orderBy: { id: 'asc' }
    });

    const totalToProcess = allCodes.length;
    const grandTotal = checkpoint.processedCount + totalToProcess;

    console.log(`   ✓ Found ${totalToProcess} codes to process`);
    console.log(`   Total in database: ${grandTotal}`);
    console.log();

    if (totalToProcess === 0) {
      console.log('✅ All codes already processed!');
      return;
    }

    // Create batches
    const batches = [];
    for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
      batches.push(allCodes.slice(i, i + BATCH_SIZE));
    }

    console.log(`🔄 Processing ${batches.length} batches...`);
    console.log(`   Estimated cost: $${((totalToProcess * 0.00009)).toFixed(4)}`);
    console.log(`   Estimated time: ~${Math.ceil(totalToProcess / 3)} seconds (with rate limiting)`);
    console.log();

    let batchCost = 0;

    // Process batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch) continue;

      const batchNum = batchIndex + 1;
      process.stdout.write(`   Batch ${batchNum}/${batches.length}: `);

      let batchSuccess = 0;
      let batchErrors = 0;

      // Process codes in parallel chunks
      for (let i = 0; i < batch.length; i += CONCURRENT_REQUESTS) {
        const chunk = batch.slice(i, i + CONCURRENT_REQUESTS);

        // Process chunk in parallel
        const results = await Promise.allSettled(
          chunk.map(async (codeData) => {
            try {
              // Generate metadata using GPT-4o-mini
              const metadata = await generateMetadata(
                codeData.code,
                codeData.description || ''
              );

              if (metadata) {
                const cleaned = cleanMetadata(metadata);

                // Update database
                await prisma.hsCode.update({
                  where: { id: codeData.id },
                  data: {
                    keywords: cleaned.keywords,
                    commonProducts: cleaned.commonProducts,
                    synonyms: cleaned.synonyms
                  }
                });

                return { success: true, id: codeData.id, cost: (metadata as any).cost || 0 };
              } else {
                return { success: false, id: codeData.id, cost: 0 };
              }
            } catch (error) {
              console.error(`\n   ❌ Error processing ${codeData.code}:`, error instanceof Error ? error.message : error);
              return { success: false, id: codeData.id, cost: 0 };
            }
          })
        );

        // Update checkpoint based on results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const value = result.value;
            if (value.success) {
              batchSuccess++;
              checkpoint.successCount++;
              batchCost += value.cost;
            } else {
              batchErrors++;
              checkpoint.errorCount++;
            }
            checkpoint.lastProcessedId = value.id;
            checkpoint.processedCount++;
          } else {
            batchErrors++;
            checkpoint.errorCount++;
          }
        }

        // Small delay between parallel chunks to respect rate limits
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }

      checkpoint.totalCost += batchCost;
      process.stdout.write(`✓ ${batchSuccess} success, ${batchErrors} errors (Cost: $${batchCost.toFixed(4)})\n`);

      // Save checkpoint after each batch
      saveCheckpoint(checkpoint);
      batchCost = 0;

      // Delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Final summary
    console.log('\n' + '═'.repeat(70));
    console.log('📈 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Successfully processed: ${checkpoint.successCount} codes`);
    if (checkpoint.errorCount > 0) {
      console.log(`❌ Errors: ${checkpoint.errorCount}`);
    }
    console.log(`💰 Total cost: $${checkpoint.totalCost.toFixed(4)}`);

    // Validation query
    console.log('\n📊 VALIDATION');
    console.log('─'.repeat(70));

    const stats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) as codes_with_keywords,
        COUNT(CASE WHEN common_products IS NOT NULL AND array_length(common_products, 1) > 0 THEN 1 END) as codes_with_products,
        COUNT(CASE WHEN synonyms IS NOT NULL AND array_length(synonyms, 1) > 0 THEN 1 END) as codes_with_synonyms
      FROM hs_codes
    `;

    const total = Number(stats[0].total_codes);
    const withKeywords = Number(stats[0].codes_with_keywords);
    const withProducts = Number(stats[0].codes_with_products);
    const withSynonyms = Number(stats[0].codes_with_synonyms);

    console.log(`Total codes: ${total}`);
    console.log(`Codes with keywords: ${withKeywords} (${((withKeywords/total)*100).toFixed(1)}%)`);
    console.log(`Codes with commonProducts: ${withProducts} (${((withProducts/total)*100).toFixed(1)}%)`);
    console.log(`Codes with synonyms: ${withSynonyms} (${((withSynonyms/total)*100).toFixed(1)}%)`);

    // Sample results
    console.log('\n📝 SAMPLE: First 3 codes with metadata:');
    const sample: any[] = await prisma.$queryRaw`
      SELECT code, description, keywords, common_products as "commonProducts", synonyms
      FROM hs_codes
      WHERE keywords IS NOT NULL
        AND array_length(keywords, 1) > 0
      ORDER BY code ASC
      LIMIT 3
    `;

    sample.forEach(code => {
      console.log(`\n   Code: ${code.code}`);
      console.log(`   Description: ${code.description?.substring(0, 60)}...`);
      console.log(`   Keywords: ${JSON.stringify(code.keywords)}`);
      console.log(`   Common Products: ${JSON.stringify(code.commonProducts)}`);
      console.log(`   Synonyms: ${JSON.stringify(code.synonyms)}`);
    });

    console.log('\n✅ Phase 3 Complete: AI metadata generation successful!\n');

    // Clean up checkpoint file
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log('🗑️  Checkpoint file removed (all codes processed)\n');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
    console.error('\n💾 Progress saved to checkpoint. Run script again to resume.\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });

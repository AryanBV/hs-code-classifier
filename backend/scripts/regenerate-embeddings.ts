import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100; // Process 100 codes at a time
const CHECKPOINT_FILE = path.join(__dirname, '../../data/checkpoints/embedding-regeneration.json');

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
    const dir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  } catch (error) {
    console.error('Error saving checkpoint:', error);
  }
}

/**
 * Create enriched text for embedding from code data
 */
function createEnrichedText(code: any): string {
  const parts: string[] = [];

  // Add code and description
  parts.push(`HS Code ${code.code}: ${code.description || ''}`);

  // Add keywords
  if (code.keywords && code.keywords.length > 0) {
    parts.push(`Keywords: ${code.keywords.join(', ')}`);
  }

  // Add common products
  if (code.commonProducts && code.commonProducts.length > 0) {
    parts.push(`Common products: ${code.commonProducts.join(', ')}`);
  }

  // Add synonyms
  if (code.synonyms && code.synonyms.length > 0) {
    parts.push(`Synonyms: ${code.synonyms.join(', ')}`);
  }

  // Add notes if available
  if (code.notes) {
    parts.push(`Notes: ${code.notes}`);
  }

  return parts.join('. ');
}

/**
 * Generate embedding for a batch of texts
 */
async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    return null;
  }
}

/**
 * Calculate cost for embeddings
 * text-embedding-3-small: $0.02 per 1M tokens
 */
function estimateCost(texts: string[]): number {
  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
  const estimatedTokens = totalChars / 4; // Rough estimate: 1 token ≈ 4 characters
  const costPerToken = 0.02 / 1_000_000;
  return estimatedTokens * costPerToken;
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔄 PHASE 4: REGENERATE EMBEDDINGS WITH ENRICHED METADATA');
  console.log('═'.repeat(70));
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log();

  try {
    // Load or initialize checkpoint
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

    // Get all codes that need embedding regeneration
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
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true,
        notes: true
      },
      orderBy: { id: 'asc' }
    });

    const totalToProcess = allCodes.length;
    const grandTotal = checkpoint.processedCount + totalToProcess;

    console.log(`   ✓ Found ${totalToProcess} codes to process`);
    console.log(`   Total in database: ${grandTotal}`);
    console.log();

    if (totalToProcess === 0) {
      console.log('✅ All embeddings already regenerated!');
      return;
    }

    // Create batches
    const batches = [];
    for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
      batches.push(allCodes.slice(i, i + BATCH_SIZE));
    }

    console.log(`🔄 Processing ${batches.length} batches...`);

    // Estimate cost
    const sampleTexts = allCodes.slice(0, 100).map(code => createEnrichedText(code));
    const estimatedCostPerCode = estimateCost(sampleTexts) / sampleTexts.length;
    const estimatedTotalCost = estimatedCostPerCode * totalToProcess;

    console.log(`   Estimated cost: $${estimatedTotalCost.toFixed(4)}`);
    console.log(`   Estimated time: ~${Math.ceil(batches.length * 2)} seconds`);
    console.log();

    // Process batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch) continue;

      const batchNum = batchIndex + 1;
      process.stdout.write(`   Batch ${batchNum}/${batches.length}: `);

      try {
        // Create enriched texts for this batch
        const texts = batch.map(code => createEnrichedText(code));

        // Generate embeddings
        const embeddings = await generateEmbeddings(texts);

        if (!embeddings) {
          console.log(`❌ Failed to generate embeddings`);
          checkpoint.errorCount += batch.length;
          continue;
        }

        // Update database with new embeddings using batch SQL (much faster!)
        // Build arrays for UNNEST-based batch update
        const ids = batch.map(code => code.id);
        const embeddingJsons = embeddings.map(emb => JSON.stringify(emb));

        // Single SQL query to update all 100 records at once
        await prisma.$executeRaw`
          UPDATE hs_codes
          SET embedding = data.embedding::vector
          FROM (
            SELECT
              UNNEST(${ids}::int[]) as id,
              UNNEST(${embeddingJsons}::text[]) as embedding
          ) as data
          WHERE hs_codes.id = data.id
        `;

        // Update checkpoint
        checkpoint.successCount += batch.length;
        checkpoint.processedCount += batch.length;
        checkpoint.lastProcessedId = batch[batch.length - 1]!.id;

        // Estimate cost for this batch
        const batchCost = estimateCost(texts);
        checkpoint.totalCost += batchCost;

        console.log(`✓ ${batch.length} embeddings regenerated (Cost: $${batchCost.toFixed(4)})`);

        // Save checkpoint after each batch
        saveCheckpoint(checkpoint);

      } catch (error) {
        console.log(`❌ Error: ${error instanceof Error ? error.message : error}`);
        checkpoint.errorCount += batch.length;
      }

      // Small delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📈 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Successfully processed: ${checkpoint.successCount} codes`);
    console.log(`❌ Errors: ${checkpoint.errorCount}`);
    console.log(`💰 Total cost: $${checkpoint.totalCost.toFixed(4)}`);

    // Validation
    console.log('\n📊 VALIDATION');
    console.log('─'.repeat(70));

    const stats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as codes_with_embeddings
      FROM hs_codes
    `;

    const total = Number(stats[0].total_codes);
    const withEmbeddings = Number(stats[0].codes_with_embeddings);

    console.log(`\nTotal codes: ${total}`);
    console.log(`Codes with embeddings: ${withEmbeddings} (${((withEmbeddings/total)*100).toFixed(1)}%)`);

    // Sample results
    console.log('\n📝 SAMPLE: First 3 codes with regenerated embeddings');
    console.log('─'.repeat(70));

    const sample: any[] = await prisma.$queryRaw`
      SELECT code, description, keywords, common_products as "commonProducts", synonyms, embedding
      FROM hs_codes
      WHERE embedding IS NOT NULL
      ORDER BY code ASC
      LIMIT 3
    `;

    sample.forEach(code => {
      const embedding = code.embedding;
      const embeddingPreview = embedding ? `[${embedding.slice(0, 5).map((n: number) => n.toFixed(4)).join(', ')}...]` : 'null';
      console.log(`\n✓ Code: ${code.code}`);
      console.log(`  Description: ${code.description?.substring(0, 50)}...`);
      console.log(`  Keywords: [${code.keywords?.join(', ') || 'none'}]`);
      console.log(`  Products: [${code.commonProducts?.join(', ') || 'none'}]`);
      console.log(`  Embedding: ${embeddingPreview} (${embedding?.length || 0} dimensions)`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Phase 4 Complete: Embeddings regenerated with enriched metadata!\n');

    // Clean up checkpoint file
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.log('\n💾 Progress saved to checkpoint. Run script again to resume.');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});

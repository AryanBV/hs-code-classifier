import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const BATCH_SIZE = 500; // Process 500 codes at once for efficiency
const CONCURRENT_BATCHES = 3; // Process 3 batches in parallel

/**
 * Create enriched text for embedding (same as Phase 4)
 */
function createEnrichedText(code: any): string {
  const parts: string[] = [];

  parts.push(`HS Code ${code.code}: ${code.description || ''}`);

  if (code.keywords && code.keywords.length > 0) {
    parts.push(`Keywords: ${code.keywords.join(', ')}`);
  }

  if (code.commonProducts && code.commonProducts.length > 0) {
    parts.push(`Common products: ${code.commonProducts.join(', ')}`);
  }

  if (code.synonyms && code.synonyms.length > 0) {
    parts.push(`Synonyms: ${code.synonyms.join(', ')}`);
  }

  if (code.notes) {
    parts.push(`Notes: ${code.notes}`);
  }

  return parts.join('. ');
}

/**
 * Restore embeddings for all codes that are missing them
 */
async function restoreAllEmbeddings() {
  console.log('🔄 RESTORE ALL EMBEDDINGS');
  console.log('═'.repeat(70));
  console.log('This will regenerate embeddings for all codes without them.\n');

  try {
    // Count codes without embeddings
    const stats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing_embeddings,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as existing_embeddings
      FROM hs_codes
    `;

    const totalCodes = Number(stats[0].total_codes);
    const missingCount = Number(stats[0].missing_embeddings);
    const existingCount = Number(stats[0].existing_embeddings);

    console.log('📊 Current State:');
    console.log(`   Total HS codes: ${totalCodes}`);
    console.log(`   With embeddings: ${existingCount}`);
    console.log(`   Missing embeddings: ${missingCount}`);
    console.log();

    if (missingCount === 0) {
      console.log('✅ All codes already have embeddings! Nothing to do.\n');
      return;
    }

    // Estimate cost and time
    const estimatedCost = (missingCount / 1000) * 0.02; // $0.02 per 1K tokens
    const estimatedMinutes = Math.ceil((missingCount / BATCH_SIZE) * 0.5); // ~30s per batch

    console.log('💰 Estimates:');
    console.log(`   Codes to process: ${missingCount}`);
    console.log(`   Estimated cost: $${estimatedCost.toFixed(3)}`);
    console.log(`   Estimated time: ${estimatedMinutes} minutes`);
    console.log();

    console.log('Starting in 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get codes without embeddings in batches
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    while (true) {
      // Fetch next batch of codes without embeddings using raw SQL
      const batch: any[] = await prisma.$queryRaw`
        SELECT id, code, description, keywords, common_products as "commonProducts", synonyms, notes
        FROM hs_codes
        WHERE embedding IS NULL
        LIMIT ${BATCH_SIZE}
      `;

      if (batch.length === 0) {
        console.log('\n✅ All embeddings restored!\n');
        break;
      }

      console.log(`\n📦 Processing batch ${Math.floor(processedCount / BATCH_SIZE) + 1} (${batch.length} codes)...`);

      // Create enriched texts
      const enrichedTexts = batch.map(code => createEnrichedText(code));

      try {
        // Generate embeddings
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: enrichedTexts
        });

        const embeddings = embeddingResponse.data.map(item => item.embedding);

        // Update database using batch SQL
        const ids = batch.map(code => code.id);
        const embeddingJsons = embeddings.map(emb => JSON.stringify(emb));

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

        successCount += batch.length;
        processedCount += batch.length;

        const progress = ((processedCount / missingCount) * 100).toFixed(1);
        console.log(`   ✅ Batch complete! Progress: ${processedCount}/${missingCount} (${progress}%)`);

      } catch (error) {
        console.error(`   ❌ Batch failed:`, error instanceof Error ? error.message : error);
        errorCount += batch.length;
        processedCount += batch.length;
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Final summary
    console.log('═'.repeat(70));
    console.log('📊 RESTORATION COMPLETE');
    console.log('═'.repeat(70));
    console.log(`   Total processed: ${processedCount}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log();

    // Check final state
    const finalStats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
        pg_size_pretty(pg_total_relation_size('hs_codes')) as table_size
      FROM hs_codes
    `;

    console.log('📈 Final Database State:');
    console.log(`   Total codes: ${finalStats[0].total_codes}`);
    console.log(`   With embeddings: ${finalStats[0].with_embeddings}`);
    console.log(`   Table size: ${finalStats[0].table_size}`);
    console.log();

    console.log('✅ All embeddings have been restored!');
    console.log('   Your classification system now has full functionality.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreAllEmbeddings().catch(console.error);

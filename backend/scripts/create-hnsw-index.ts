/**
 * Create HNSW Vector Index on hs_codes.embedding
 *
 * This script creates an HNSW index for approximate nearest neighbor search
 * on the embedding column. This accelerates cosine distance queries used by:
 *   - globalSemanticSearch() in database/hs-codes.ts
 *   - searchWithinChapter() in database/hs-codes.ts
 *
 * The index uses vector_cosine_ops to match the <=> (cosine distance) operator.
 *
 * Run: cd backend && npx ts-node scripts/create-hnsw-index.ts
 * Idempotent: Checks for existing index before creating.
 *
 * ARY-16: https://linear.app/aryan-b-v/issue/ARY-16
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

async function main() {
  console.log('='.repeat(60));
  console.log('HNSW Vector Index — Create Script');
  console.log('='.repeat(60));

  // Step 1: Check embedding coverage
  console.log('\n--- Step 1: Embedding Coverage ---');
  const coverage = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)::int as total_rows,
      COUNT(embedding)::int as with_embedding,
      (COUNT(*) - COUNT(embedding))::int as without_embedding
    FROM hs_codes
  `;
  const stats = coverage[0];
  console.log(`Total rows: ${stats.total_rows}`);
  console.log(`With embedding: ${stats.with_embedding}`);
  console.log(`Without embedding: ${stats.without_embedding}`);

  if (stats.with_embedding === 0) {
    console.error('ERROR: No embeddings found. Cannot create index.');
    process.exit(1);
  }

  // Step 2: Check for existing HNSW index
  console.log('\n--- Step 2: Check Existing Indexes ---');
  const existingIndexes = await prisma.$queryRaw<any[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'hs_codes'
      AND indexdef LIKE '%hnsw%'
  `;

  if (existingIndexes.length > 0) {
    console.log('HNSW index already exists:');
    for (const idx of existingIndexes) {
      console.log(`  ${idx.indexname}: ${idx.indexdef}`);
    }
    console.log('\nSkipping creation (idempotent).');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log('No existing HNSW index found. Creating...');

  // Step 3: Create HNSW index
  console.log('\n--- Step 3: Create HNSW Index ---');
  const startTime = Date.now();

  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_hs_codes_embedding_hnsw
    ON hs_codes
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Index created in ${elapsed}s`);

  // Step 4: Verify
  console.log('\n--- Step 4: Verify ---');
  const verifyIndexes = await prisma.$queryRaw<any[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'hs_codes'
      AND indexname = 'idx_hs_codes_embedding_hnsw'
  `;

  if (verifyIndexes.length === 1) {
    console.log('SUCCESS: HNSW index verified.');
    console.log(`  ${verifyIndexes[0].indexdef}`);
  } else {
    console.error('ERROR: Index not found after creation.');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE — ARY-16 HNSW Vector Index Created');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Script failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});

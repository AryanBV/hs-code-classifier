/**
 * Phase 2: Extract Notes from Chapter Files and Link to HS Codes
 *
 * This script:
 * 1. Loads all 97 chapter JSON files from data/extracted/
 * 2. For each HS code, extracts only relevant notes
 * 3. Stores notes in each code's JSONB field using hybrid approach
 * 4. Updates database in batches
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface HsCodeNotes {
  chapterNumber: string;
  chapterTitle?: string;
  sectionNotes: string[];
  chapterNotes: string[];
  policyConditions: Array<{
    number: number;
    description: string;
  }>;
  exportLicensingNotes: string;
}

interface ChapterData {
  chapter: string;
  chapterTitle: string;
  notes: {
    sectionNotes?: string[];
    chapterNotes?: string[];
    policyConditions?: Array<{ number: number; description: string }>;
    exportLicensingNotes?: string;
  };
  codes: Array<{
    code: string;
    description: string;
    exportPolicy: string;
  }>;
}

/**
 * Load all chapter files from data/extracted/ directory
 */
function loadAllChapterFiles(): Map<string, ChapterData> {
  const dataDir = path.join(__dirname, '../../data/extracted');
  const chapterMap = new Map<string, ChapterData>();

  console.log(`📂 Loading chapter files from: ${dataDir}`);

  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory not found: ${dataDir}`);
  }

  // Find all chapter_XX.json files
  const files = fs.readdirSync(dataDir)
    .filter(file => file.match(/^chapter_\d{2}\.json$/i))
    .sort();

  console.log(`   Found ${files.length} chapter files`);

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const chapterData: ChapterData = JSON.parse(content);

      // Extract chapter number (e.g., "01" from "chapter_01.json")
      const chapterNum = chapterData.chapter || file.match(/\d{2}/)?.[0] || '';

      if (chapterNum) {
        chapterMap.set(chapterNum, chapterData);
      }
    } catch (error) {
      console.error(`   ❌ Error loading ${file}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`   ✓ Successfully loaded ${chapterMap.size} chapters\n`);
  return chapterMap;
}

/**
 * Clean and normalize note text
 * Removes excessive whitespace and formatting artifacts
 */
function cleanNoteText(text: string): string {
  if (!text) return '';

  return text
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Remove common artifacts from PDF extraction
    .replace(/Sl\.No\.\s*Notes\s*Notification\s*(No\.)?\s*Notification\s*Date/gi, '')
    .replace(/Policy Condition\s*Sl\.No\./gi, '')
    .replace(/Export Licensing Notes\s*Sl\.No\./gi, '')
    .trim();
}

/**
 * Extract relevant notes for a specific HS code
 * Uses hybrid approach: only includes notes that apply to this code
 */
function extractRelevantNotes(
  hsCode: string,
  chapterData: ChapterData
): HsCodeNotes {
  const chapter = hsCode.substring(0, 2);

  // Extract and clean section notes (apply to all codes in this section)
  const sectionNotes = (chapterData.notes.sectionNotes || [])
    .map(cleanNoteText)
    .filter(note => note.length > 20) // Filter out very short/meaningless notes
    .slice(0, 5); // Limit to top 5 most relevant

  // Extract and clean chapter notes (apply to all codes in this chapter)
  const chapterNotes = (chapterData.notes.chapterNotes || [])
    .map(cleanNoteText)
    .filter(note => note.length > 20)
    .slice(0, 5);

  // Policy conditions - include all for now
  // TODO: Future enhancement - filter by relevance to specific code
  const policyConditions = (chapterData.notes.policyConditions || [])
    .map(pc => ({
      number: pc.number,
      description: cleanNoteText(pc.description)
    }))
    .filter(pc => pc.description.length > 10);

  // Export licensing notes
  const exportLicensingNotes = cleanNoteText(
    chapterData.notes.exportLicensingNotes || ''
  );

  return {
    chapterNumber: chapter,
    chapterTitle: chapterData.chapterTitle,
    sectionNotes,
    chapterNotes,
    policyConditions,
    exportLicensingNotes
  };
}

/**
 * Main execution function
 */
async function main() {
  console.log('🗒️  PHASE 2: EXTRACT NOTES AND LINK TO HS CODES');
  console.log('═'.repeat(70));
  console.log();

  try {
    // Step 1: Load all chapter files
    const chapterMap = loadAllChapterFiles();

    if (chapterMap.size === 0) {
      throw new Error('No chapter files found!');
    }

    // Step 2: Get all HS codes from database
    console.log('📊 Loading HS codes from database...');
    const allCodes = await prisma.hsCode.findMany({
      select: {
        id: true,
        code: true,
        chapter: true
      },
      orderBy: { code: 'asc' }
    });

    console.log(`   ✓ Loaded ${allCodes.length} HS codes\n`);

    if (allCodes.length === 0) {
      throw new Error('No HS codes found in database!');
    }

    // Step 3: Extract and link notes for each code
    console.log('🔗 Extracting and linking notes...\n');

    let successCount = 0;
    let errorCount = 0;
    let noChapterDataCount = 0;

    const BATCH_SIZE = 100;
    const batches = [];

    for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
      batches.push(allCodes.slice(i, i + BATCH_SIZE));
    }

    console.log(`   Processing ${batches.length} batches of ${BATCH_SIZE} codes each...\n`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;

      process.stdout.write(`   Batch ${batchNum}/${batches.length}: `);

      if (!batch) continue;

      for (const code of batch) {
        try {
          // Get chapter data
          const chapterData = chapterMap.get(code.chapter);

          if (!chapterData) {
            noChapterDataCount++;
            // Still count as success but with empty notes object
            await prisma.hsCode.update({
              where: { id: code.id },
              data: { notes: {} as any }
            });
            successCount++;
            continue;
          }

          // Extract relevant notes
          const notes = extractRelevantNotes(code.code, chapterData);

          // Update database
          await prisma.hsCode.update({
            where: { id: code.id },
            data: { notes: notes as any } // Prisma Json type
          });

          successCount++;
        } catch (error) {
          console.error(`\n   ❌ Error processing ${code.code}:`, error instanceof Error ? error.message : error);
          errorCount++;
        }
      }

      process.stdout.write(`✓ ${batch.length} codes processed\n`);

      // Small delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Step 4: Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📈 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Successfully processed: ${successCount} codes`);
    console.log(`⚠️  Codes without chapter data: ${noChapterDataCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }

    // Step 5: Validation query
    console.log('\n📊 VALIDATION');
    console.log('─'.repeat(70));

    const stats: any = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_codes,
        COUNT(notes) as codes_with_notes,
        ROUND(100.0 * COUNT(notes) / COUNT(*), 2) as coverage_percent
      FROM hs_codes
    `;

    console.log(`Total codes: ${stats[0].total_codes}`);
    console.log(`Codes with notes: ${stats[0].codes_with_notes}`);
    console.log(`Coverage: ${stats[0].coverage_percent}%`);

    // Sample a few codes
    console.log('\n📝 SAMPLE: First 3 codes with notes:');
    const sample = await prisma.hsCode.findMany({
      where: {
        notes: {
          not: {} as any
        }
      },
      select: {
        code: true,
        description: true,
        notes: true
      },
      take: 3,
      orderBy: { code: 'asc' }
    });

    sample.forEach(code => {
      const notes = code.notes as any;
      console.log(`\n   Code: ${code.code}`);
      console.log(`   Description: ${code.description?.substring(0, 60)}...`);
      console.log(`   Chapter Notes: ${notes?.chapterNotes?.length || 0}`);
      console.log(`   Policy Conditions: ${notes?.policyConditions?.length || 0}`);
      console.log(`   Section Notes: ${notes?.sectionNotes?.length || 0}`);
    });

    console.log('\n✅ Phase 2 Complete: Notes extraction and linking successful!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
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

/**
 * Merge All Tiers Script
 *
 * Combines Tier 1 (manual), Tier 2 (database), and Tier 3 (LLM) test cases
 * into a single comprehensive-test-set.json file.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  expected8Digit: string;
  category: string;
  subcategory?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keyDistinction: string;
  source: string;
  notes?: string;
  tier: 1 | 2 | 3;
  expectQuestion?: boolean;
  needsVerification?: boolean;
}

interface CategoryFile {
  category: string;
  description: string;
  testCases: TestCase[];
}

interface TierFile {
  metadata: Record<string, unknown>;
  testCases: TestCase[];
}

const BASE_DIR = path.join(__dirname);

// Tier 1 files (manual)
const TIER1_FILES = [
  'tier1-manual/vehicle-parts.json',
  'tier1-manual/coffee-tea-spices.json',
  'tier1-manual/pharmaceuticals.json',
  'tier1-manual/garments.json',
  'tier1-manual/edge-cases.json'
];

// Tier 2 file (database)
const TIER2_FILE = 'tier2-database/database-derived.json';

// Tier 3 file (LLM)
const TIER3_FILE = 'tier3-llm/llm-generated.json';

function loadJsonFile<T>(filePath: string): T | null {
  const fullPath = path.join(BASE_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: File not found: ${fullPath}`);
    return null;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as T;
}

function mergeTiers(): void {
  console.log('Merging all test tiers...\n');
  console.log('========================================');

  const allTestCases: TestCase[] = [];
  const chaptersFound = new Set<string>();
  const idSet = new Set<string>();

  // Load Tier 1 (Manual)
  console.log('\nLoading Tier 1 (Manual) files...');
  let tier1Count = 0;

  for (const file of TIER1_FILES) {
    const data = loadJsonFile<CategoryFile>(file);
    if (data && data.testCases) {
      console.log(`  ${file}: ${data.testCases.length} cases`);
      for (const tc of data.testCases) {
        // Validate no duplicate IDs
        if (idSet.has(tc.id)) {
          console.warn(`  Warning: Duplicate ID ${tc.id} in ${file}`);
          tc.id = `${tc.id}_dup`;
        }
        idSet.add(tc.id);

        // Ensure tier is set
        tc.tier = 1;

        allTestCases.push(tc);
        chaptersFound.add(tc.expectedChapter);
        tier1Count++;
      }
    }
  }
  console.log(`  Tier 1 total: ${tier1Count} cases`);

  // Load Tier 2 (Database)
  console.log('\nLoading Tier 2 (Database) file...');
  const tier2Data = loadJsonFile<TierFile>(TIER2_FILE);
  let tier2Count = 0;

  if (tier2Data && tier2Data.testCases) {
    console.log(`  ${TIER2_FILE}: ${tier2Data.testCases.length} cases`);
    for (const tc of tier2Data.testCases) {
      if (idSet.has(tc.id)) {
        console.warn(`  Warning: Duplicate ID ${tc.id}`);
        tc.id = `${tc.id}_t2`;
      }
      idSet.add(tc.id);
      tc.tier = 2;
      allTestCases.push(tc);
      chaptersFound.add(tc.expectedChapter);
      tier2Count++;
    }
  }
  console.log(`  Tier 2 total: ${tier2Count} cases`);

  // Load Tier 3 (LLM)
  console.log('\nLoading Tier 3 (LLM) file...');
  const tier3Data = loadJsonFile<TierFile>(TIER3_FILE);
  let tier3Count = 0;

  if (tier3Data && tier3Data.testCases) {
    console.log(`  ${TIER3_FILE}: ${tier3Data.testCases.length} cases`);
    for (const tc of tier3Data.testCases) {
      if (idSet.has(tc.id)) {
        console.warn(`  Warning: Duplicate ID ${tc.id}`);
        tc.id = `${tc.id}_t3`;
      }
      idSet.add(tc.id);
      tc.tier = 3;
      allTestCases.push(tc);
      chaptersFound.add(tc.expectedChapter);
      tier3Count++;
    }
  }
  console.log(`  Tier 3 total: ${tier3Count} cases`);

  // Sort chapters for display
  const sortedChapters = Array.from(chaptersFound).sort((a, b) =>
    parseInt(a) - parseInt(b)
  );

  // Calculate difficulty breakdown
  const byDifficulty = {
    easy: allTestCases.filter(tc => tc.difficulty === 'easy').length,
    medium: allTestCases.filter(tc => tc.difficulty === 'medium').length,
    hard: allTestCases.filter(tc => tc.difficulty === 'hard').length
  };

  // Calculate category breakdown
  const byCategory: Record<string, number> = {};
  for (const tc of allTestCases) {
    const catParts = tc.category.split(' - ');
    const cat = catParts[0] || tc.category; // Normalize category
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // Create comprehensive test set
  const comprehensiveSet = {
    metadata: {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalCases: allTestCases.length,
      chaptersCovered: chaptersFound.size,
      chapters: sortedChapters,
      tierBreakdown: {
        tier1: tier1Count,
        tier2: tier2Count,
        tier3: tier3Count
      },
      difficultyBreakdown: byDifficulty,
      sources: [
        'WCO Classification Opinion',
        'Indian Customs Tariff',
        'prompt.md manual verification',
        'confusing-chapter-pairs.ts',
        'hs_codes database',
        'LLM-generated (GPT-4o)'
      ],
      targets: {
        chapterAccuracy: 95,
        headingAccuracy: 85,
        responseTimeMs: 3000
      }
    },
    testCases: allTestCases
  };

  // Write output
  const outputPath = path.join(BASE_DIR, 'comprehensive-test-set.json');
  fs.writeFileSync(outputPath, JSON.stringify(comprehensiveSet, null, 2));

  // Print summary
  console.log('\n========================================');
  console.log('MERGE COMPLETE');
  console.log('========================================');
  console.log(`\nTotal test cases: ${allTestCases.length}`);
  console.log(`Chapters covered: ${chaptersFound.size}/97`);
  console.log(`\nTier breakdown:`);
  console.log(`  Tier 1 (Manual, HIGH confidence): ${tier1Count}`);
  console.log(`  Tier 2 (Database, MEDIUM confidence): ${tier2Count}`);
  console.log(`  Tier 3 (LLM, LOWER confidence): ${tier3Count}`);
  console.log(`\nDifficulty breakdown:`);
  console.log(`  Easy: ${byDifficulty.easy}`);
  console.log(`  Medium: ${byDifficulty.medium}`);
  console.log(`  Hard: ${byDifficulty.hard}`);
  console.log(`\nChapters covered: ${sortedChapters.join(', ')}`);
  console.log(`\nOutput: ${outputPath}`);
  console.log('========================================\n');

  // Check if we hit the 500 target
  if (allTestCases.length >= 500) {
    console.log('✅ Target of 500 test cases ACHIEVED!');
  } else {
    console.log(`⚠️ Current: ${allTestCases.length}/500 test cases`);
    console.log(`   Need ${500 - allTestCases.length} more cases to reach target.`);
  }
}

// Run
mergeTiers();

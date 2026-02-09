/**
 * Tier 2 Test Case Generator
 *
 * Generates 200 test cases from the hs_codes database table.
 * These are MEDIUM CONFIDENCE because the description comes directly from the database,
 * making the expected code ground truth by definition.
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface DbRow {
  code: string;
  description: string;
  chapter: string;
  heading: string;
}

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
  tier: 2;
}

// Priority chapters for Indian exports (more cases from these)
const HIGH_PRIORITY_CHAPTERS = [
  '09', '10', '29', '30', '39', '52', '61', '62', '71', '72', '73', '84', '85', '87', '90'
];

const MEDIUM_PRIORITY_CHAPTERS = [
  '08', '11', '15', '17', '19', '20', '25', '27', '40', '44', '48', '54', '55', '74', '76'
];

// Variations to add to make tests harder
function addVariation(description: string, variationType: number): string {
  const firstPart = description.split(',')[0];
  const firstClause = firstPart ? firstPart.split(';')[0] : description;

  switch (variationType) {
    case 0:
      // Take first clause only
      return (firstClause || description).trim();
    case 1:
      // Add export context
      return `${description} for export`;
    case 2:
      // Conversational style
      return `I need to export ${description.toLowerCase()}`;
    case 3:
      // Simplified (remove "of", "other", etc.)
      return description
        .replace(/\bof\b/gi, '')
        .replace(/\bother\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    case 4:
      // Add Indian context
      return `${description} made in India`;
    default:
      return description;
  }
}

// Get chapter name for category
function getChapterName(chapter: string): string {
  const chapterNames: Record<string, string> = {
    '01': 'Live Animals',
    '02': 'Meat',
    '03': 'Fish & Seafood',
    '04': 'Dairy & Eggs',
    '05': 'Animal Products',
    '06': 'Live Plants',
    '07': 'Vegetables',
    '08': 'Fruits & Nuts',
    '09': 'Coffee, Tea, Spices',
    '10': 'Cereals',
    '11': 'Milling Products',
    '12': 'Oil Seeds',
    '13': 'Lac, Gums, Resins',
    '14': 'Vegetable Plaiting',
    '15': 'Fats & Oils',
    '16': 'Meat Preparations',
    '17': 'Sugar & Confectionery',
    '18': 'Cocoa',
    '19': 'Cereal Preparations',
    '20': 'Vegetable Preparations',
    '21': 'Misc. Food Preparations',
    '22': 'Beverages',
    '23': 'Residues & Animal Feed',
    '24': 'Tobacco',
    '25': 'Salt, Stone, Cement',
    '26': 'Ores & Slag',
    '27': 'Mineral Fuels',
    '28': 'Inorganic Chemicals',
    '29': 'Organic Chemicals',
    '30': 'Pharmaceuticals',
    '31': 'Fertilizers',
    '32': 'Tanning, Dyes',
    '33': 'Essential Oils, Perfumes',
    '34': 'Soap, Wax',
    '35': 'Albuminoidal Substances',
    '36': 'Explosives',
    '37': 'Photographic Goods',
    '38': 'Misc. Chemicals',
    '39': 'Plastics',
    '40': 'Rubber',
    '41': 'Raw Hides, Skins',
    '42': 'Leather Articles',
    '43': 'Furskins',
    '44': 'Wood',
    '45': 'Cork',
    '46': 'Straw Articles',
    '47': 'Pulp',
    '48': 'Paper & Paperboard',
    '49': 'Printed Material',
    '50': 'Silk',
    '51': 'Wool',
    '52': 'Cotton',
    '53': 'Vegetable Fibers',
    '54': 'Man-made Filaments',
    '55': 'Man-made Staple Fibers',
    '56': 'Wadding, Felt',
    '57': 'Carpets',
    '58': 'Special Woven Fabrics',
    '59': 'Impregnated Textiles',
    '60': 'Knitted Fabrics',
    '61': 'Knitted Apparel',
    '62': 'Woven Apparel',
    '63': 'Made-up Textiles',
    '64': 'Footwear',
    '65': 'Headgear',
    '66': 'Umbrellas',
    '67': 'Feathers',
    '68': 'Stone, Cement Articles',
    '69': 'Ceramic Products',
    '70': 'Glass',
    '71': 'Gems & Jewelry',
    '72': 'Iron & Steel',
    '73': 'Iron & Steel Articles',
    '74': 'Copper',
    '75': 'Nickel',
    '76': 'Aluminium',
    '78': 'Lead',
    '79': 'Zinc',
    '80': 'Tin',
    '81': 'Other Base Metals',
    '82': 'Tools',
    '83': 'Base Metal Articles',
    '84': 'Machinery',
    '85': 'Electrical Equipment',
    '86': 'Railway',
    '87': 'Vehicles',
    '88': 'Aircraft',
    '89': 'Ships',
    '90': 'Optical & Medical',
    '91': 'Clocks & Watches',
    '92': 'Musical Instruments',
    '93': 'Arms & Ammunition',
    '94': 'Furniture',
    '95': 'Toys & Sports',
    '96': 'Misc. Manufactured',
    '97': 'Works of Art'
  };
  return chapterNames[chapter] || `Chapter ${chapter}`;
}

async function generateTier2TestCases(): Promise<TestCase[]> {
  console.log('Generating Tier 2 test cases from database...\n');

  const testCases: TestCase[] = [];
  let idCounter = 1;

  // Get chapter distribution
  const chapterCounts = await prisma.$queryRaw<{ chapter: string; count: bigint }[]>`
    SELECT
      SUBSTRING(code, 1, 2) as chapter,
      COUNT(*) as count
    FROM hs_codes
    WHERE LENGTH(code) >= 8
    AND description IS NOT NULL
    AND LENGTH(description) > 20
    AND description NOT LIKE '%Other%'
    GROUP BY SUBSTRING(code, 1, 2)
    ORDER BY count DESC
  `;

  console.log(`Found ${chapterCounts.length} chapters with eligible codes\n`);

  // Calculate cases per chapter
  const totalTarget = 200;
  let casesAdded = 0;

  // High priority chapters: 10 cases each
  for (const chapter of HIGH_PRIORITY_CHAPTERS) {
    if (casesAdded >= totalTarget) break;

    const casesForChapter = Math.min(10, totalTarget - casesAdded);

    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT
        code,
        description,
        SUBSTRING(code, 1, 2) as chapter,
        SUBSTRING(code, 1, 4) as heading
      FROM hs_codes
      WHERE SUBSTRING(code, 1, 2) = ${chapter}
      AND LENGTH(code) >= 8
      AND description IS NOT NULL
      AND LENGTH(description) > 20
      AND description NOT LIKE '%Other%'
      ORDER BY RANDOM()
      LIMIT ${casesForChapter}
    `;

    console.log(`Chapter ${chapter} (${getChapterName(chapter)}): ${rows.length} cases`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const variationType = i % 5;
      const isVaried = variationType > 0;

      testCases.push({
        id: `DB${String(idCounter++).padStart(3, '0')}`,
        query: isVaried ? addVariation(row.description, variationType) : row.description,
        expectedChapter: row.chapter,
        expectedHeading: row.heading,
        expected8Digit: row.code.substring(0, 10), // Normalize to 8-digit
        category: `Chapter ${row.chapter} - ${getChapterName(row.chapter)}`,
        difficulty: isVaried ? 'medium' : 'easy',
        keyDistinction: 'database_description',
        source: 'hs_codes table',
        tier: 2
      });
      casesAdded++;
    }
  }

  // Medium priority chapters: 5 cases each
  for (const chapter of MEDIUM_PRIORITY_CHAPTERS) {
    if (casesAdded >= totalTarget) break;

    const casesForChapter = Math.min(5, totalTarget - casesAdded);

    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT
        code,
        description,
        SUBSTRING(code, 1, 2) as chapter,
        SUBSTRING(code, 1, 4) as heading
      FROM hs_codes
      WHERE SUBSTRING(code, 1, 2) = ${chapter}
      AND LENGTH(code) >= 8
      AND description IS NOT NULL
      AND LENGTH(description) > 20
      AND description NOT LIKE '%Other%'
      ORDER BY RANDOM()
      LIMIT ${casesForChapter}
    `;

    if (rows.length > 0) {
      console.log(`Chapter ${chapter} (${getChapterName(chapter)}): ${rows.length} cases`);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const variationType = i % 5;
      const isVaried = variationType > 0;

      testCases.push({
        id: `DB${String(idCounter++).padStart(3, '0')}`,
        query: isVaried ? addVariation(row.description, variationType) : row.description,
        expectedChapter: row.chapter,
        expectedHeading: row.heading,
        expected8Digit: row.code.substring(0, 10),
        category: `Chapter ${row.chapter} - ${getChapterName(row.chapter)}`,
        difficulty: isVaried ? 'medium' : 'easy',
        keyDistinction: 'database_description',
        source: 'hs_codes table',
        tier: 2
      });
      casesAdded++;
    }
  }

  // Fill remaining with random chapters for coverage
  if (casesAdded < totalTarget) {
    const remaining = totalTarget - casesAdded;

    // Build exclusion list
    const allPriorityChapters = [...HIGH_PRIORITY_CHAPTERS, ...MEDIUM_PRIORITY_CHAPTERS];

    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT
        code,
        description,
        SUBSTRING(code, 1, 2) as chapter,
        SUBSTRING(code, 1, 4) as heading
      FROM hs_codes
      WHERE LENGTH(code) >= 8
      AND description IS NOT NULL
      AND LENGTH(description) > 20
      AND description NOT LIKE '%Other%'
      AND SUBSTRING(code, 1, 2) NOT IN (${allPriorityChapters.map(c => `'${c}'`).join(',')})
      ORDER BY RANDOM()
      LIMIT ${remaining}
    `;

    console.log(`\nAdditional chapters for coverage: ${rows.length} cases`);

    for (const row of rows) {
      if (!row) continue;

      testCases.push({
        id: `DB${String(idCounter++).padStart(3, '0')}`,
        query: row.description,
        expectedChapter: row.chapter,
        expectedHeading: row.heading,
        expected8Digit: row.code.substring(0, 10),
        category: `Chapter ${row.chapter} - ${getChapterName(row.chapter)}`,
        difficulty: 'easy',
        keyDistinction: 'database_description',
        source: 'hs_codes table',
        tier: 2
      });
    }
  }

  return testCases;
}

async function main() {
  try {
    const testCases = await generateTier2TestCases();

    // Count chapters covered
    const chapters = new Set(testCases.map(tc => tc.expectedChapter));

    const output = {
      metadata: {
        generated: new Date().toISOString(),
        count: testCases.length,
        chaptersCovered: chapters.size,
        tier: 2,
        source: 'hs_codes database',
        confidence: 'MEDIUM - descriptions are ground truth'
      },
      testCases
    };

    const outputPath = path.join(__dirname, 'database-derived.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('\n========================================');
    console.log('TIER 2 GENERATION COMPLETE');
    console.log('========================================');
    console.log(`Total cases: ${testCases.length}`);
    console.log(`Chapters covered: ${chapters.size}`);
    console.log(`Output: ${outputPath}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error generating Tier 2 test cases:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

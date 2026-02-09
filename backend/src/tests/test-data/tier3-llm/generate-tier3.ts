/**
 * Tier 3 Test Case Generator
 *
 * Uses GPT-4o to generate realistic product descriptions for Indian exporters.
 * These are LOWER CONFIDENCE and require 20% spot-checking.
 */

import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

interface GeneratedCase {
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  expected8Digit: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keyDistinction: string;
}

interface TestCase extends GeneratedCase {
  id: string;
  category: string;
  source: string;
  tier: 3;
  needsVerification: boolean;
}

// Chapters to generate test cases for
const CHAPTERS_TO_GENERATE = [
  { chapter: '10', name: 'Cereals (Rice, Wheat, Barley)', count: 12 },
  { chapter: '25', name: 'Salt, Minerals, Stone, Cement', count: 10 },
  { chapter: '39', name: 'Plastics and Articles', count: 12 },
  { chapter: '52', name: 'Cotton Fabrics', count: 12 },
  { chapter: '71', name: 'Precious Stones and Jewelry', count: 12 },
  { chapter: '72', name: 'Iron and Steel', count: 10 },
  { chapter: '73', name: 'Articles of Iron or Steel', count: 10 },
  { chapter: '74', name: 'Copper and Articles', count: 8 },
  { chapter: '76', name: 'Aluminium and Articles', count: 8 },
  { chapter: '84', name: 'Machinery and Mechanical', count: 15 },
  { chapter: '85', name: 'Electrical Equipment', count: 15 },
  { chapter: '90', name: 'Optical and Medical Instruments', count: 12 },
  { chapter: '03', name: 'Fish and Seafood', count: 8 },
  { chapter: '07', name: 'Vegetables', count: 8 },
  { chapter: '08', name: 'Fruits and Nuts', count: 8 },
  { chapter: '12', name: 'Oil Seeds', count: 6 },
  { chapter: '15', name: 'Fats and Oils', count: 6 },
  { chapter: '17', name: 'Sugar and Confectionery', count: 6 },
  { chapter: '19', name: 'Cereal Preparations', count: 6 },
  { chapter: '22', name: 'Beverages', count: 6 },
  { chapter: '33', name: 'Essential Oils and Perfumes', count: 6 },
  { chapter: '48', name: 'Paper and Paperboard', count: 6 }
];

async function generateForChapter(
  chapter: string,
  chapterName: string,
  count: number
): Promise<GeneratedCase[]> {
  const prompt = `You are an expert in HS (Harmonized System) tariff classification for Indian exports.

Generate ${count} realistic product descriptions that Indian exporters would use when classifying products for Chapter ${chapter}: ${chapterName}.

REQUIREMENTS:
1. Use natural language an Indian exporter would actually use (not official tariff descriptions)
2. Include realistic Indian product specifications (grades, sizes, origins like "Gujarat", "Tamil Nadu")
3. DO NOT include HS codes or chapter numbers in the query
4. Keep descriptions between 5-15 words
5. Mix difficulties:
   - "easy": Clear, unambiguous products (e.g., "basmati rice 1121 sella")
   - "medium": Products needing some specification (e.g., "rice flour for export")
   - "hard": Ambiguous products that could be multiple codes (e.g., "rice bran oil refined")
6. Ensure the expected HS codes are accurate for Indian Customs Tariff

IMPORTANT: The expected8Digit MUST be a real, valid HS code that exists in the Indian tariff schedule.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "query": "basmati rice 1121 sella parboiled 25kg bags",
    "expectedChapter": "10",
    "expectedHeading": "1006",
    "expected8Digit": "1006.30.00",
    "difficulty": "easy",
    "keyDistinction": "parboiled_rice"
  }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content || '[]';

    // Clean up response (remove markdown if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.slice(7);
    }
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(0, -3);
    }

    const cases = JSON.parse(cleanContent.trim()) as GeneratedCase[];
    return cases;

  } catch (error) {
    console.error(`Error generating for Chapter ${chapter}:`, error);
    return [];
  }
}

async function generateAllTier3(): Promise<TestCase[]> {
  console.log('Generating Tier 3 test cases using LLM...\n');
  console.log('========================================');

  const allCases: TestCase[] = [];
  let idCounter = 1;
  let totalGenerated = 0;

  for (const ch of CHAPTERS_TO_GENERATE) {
    console.log(`\nGenerating Chapter ${ch.chapter}: ${ch.name} (${ch.count} cases)...`);

    const cases = await generateForChapter(ch.chapter, ch.name, ch.count);

    console.log(`  Generated: ${cases.length} cases`);

    for (const c of cases) {
      allCases.push({
        id: `LLM${String(idCounter++).padStart(3, '0')}`,
        query: c.query,
        expectedChapter: c.expectedChapter,
        expectedHeading: c.expectedHeading,
        expected8Digit: c.expected8Digit,
        difficulty: c.difficulty,
        keyDistinction: c.keyDistinction,
        category: `Chapter ${ch.chapter} - ${ch.name}`,
        source: 'LLM-generated (GPT-4o)',
        tier: 3,
        needsVerification: true
      });
      totalGenerated++;
    }

    // Rate limiting - wait 1 second between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n========================================');
  console.log(`Total generated: ${totalGenerated} cases`);

  return allCases;
}

async function main() {
  try {
    const testCases = await generateAllTier3();

    // Count chapters covered
    const chapters = new Set(testCases.map(tc => tc.expectedChapter));

    // Count by difficulty
    const byDifficulty = {
      easy: testCases.filter(tc => tc.difficulty === 'easy').length,
      medium: testCases.filter(tc => tc.difficulty === 'medium').length,
      hard: testCases.filter(tc => tc.difficulty === 'hard').length
    };

    const output = {
      metadata: {
        generated: new Date().toISOString(),
        count: testCases.length,
        chaptersCovered: chapters.size,
        tier: 3,
        source: 'LLM-generated (GPT-4o)',
        confidence: 'LOWER - requires 20% spot-check verification',
        needsVerification: true,
        verifiedCount: 0,
        byDifficulty
      },
      testCases
    };

    const outputPath = path.join(__dirname, 'llm-generated.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('\n========================================');
    console.log('TIER 3 GENERATION COMPLETE');
    console.log('========================================');
    console.log(`Total cases: ${testCases.length}`);
    console.log(`Chapters covered: ${chapters.size}`);
    console.log(`Difficulty breakdown:`);
    console.log(`  Easy: ${byDifficulty.easy}`);
    console.log(`  Medium: ${byDifficulty.medium}`);
    console.log(`  Hard: ${byDifficulty.hard}`);
    console.log(`\nOutput: ${outputPath}`);
    console.log('\nNOTE: 20% of these cases should be verified against');
    console.log('Indian Customs Tariff before use in accuracy testing.');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error generating Tier 3 test cases:', error);
    throw error;
  }
}

main();

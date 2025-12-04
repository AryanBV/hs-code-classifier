#!/usr/bin/env ts-node
/**
 * Transform Extracted HS Codes Data
 *
 * Converts hs_codes_complete.json (from PDF extraction) to hs_codes_clean.json
 * format expected by the Prisma seed script.
 *
 * Input:  data/hs_codes_complete.json
 * Output: data/hs_codes_clean.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExtractedCode {
  code: string;
  description: string;
  exportPolicy: string;
  policyConditionRef: string;
  chapter: string;
  chapterTitle: string;
}

interface ExtractedData {
  version: string;
  generatedAt: string;
  source: string;
  totalChapters: number;
  totalCodes: number;
  statistics: {
    free: number;
    restricted: number;
    prohibited: number;
    duplicates: number;
  };
  chapters: Record<string, any>;
  codes: ExtractedCode[];
}

interface CleanCode {
  hs_code: string;
  description: string;
  chapter: string;
  heading: string;
  subheading: string;
  basic_duty?: string;
  keywords: string[];
  common_products: string[];
  synonyms: string[];
  export_policy: string;
}

/**
 * Derive heading from HS code
 * Examples:
 *   "0101.21.00" -> "0101.21"
 *   "0101" -> "0101"
 *   "8703.23.11" -> "8703.23"
 */
function deriveHeading(code: string): string {
  // Remove dots for processing
  const cleanCode = code.replace(/\./g, '');

  // Heading is first 6 digits (with dot after 4th digit)
  if (cleanCode.length >= 6) {
    return cleanCode.substring(0, 4) + '.' + cleanCode.substring(4, 6);
  } else if (cleanCode.length >= 4) {
    return cleanCode.substring(0, 4);
  }

  return code;
}

/**
 * Format subheading (full code with dots)
 * Examples:
 *   "01012100" -> "0101.21.00"
 *   "0101.21.00" -> "0101.21.00"
 */
function formatSubheading(code: string): string {
  // If already formatted with dots, return as-is
  if (code.includes('.')) {
    return code;
  }

  // Format: XXXX.XX.XX
  const clean = code.replace(/\./g, '');

  if (clean.length >= 8) {
    return clean.substring(0, 4) + '.' + clean.substring(4, 6) + '.' + clean.substring(6, 8);
  } else if (clean.length >= 6) {
    return clean.substring(0, 4) + '.' + clean.substring(4, 6);
  } else if (clean.length >= 4) {
    return clean.substring(0, 4);
  }

  return code;
}

/**
 * Main transformation function
 */
function transformData(): void {
  console.log('═'.repeat(80));
  console.log('HS CODE DATA TRANSFORMATION');
  console.log('═'.repeat(80));
  console.log();

  // Input file path
  const inputPath = path.join(__dirname, '../../data/hs_codes_complete.json');
  const outputPath = path.join(__dirname, '../../data/hs_codes_clean.json');

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading from: ${inputPath}`);

  // Read input file
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const extractedData: ExtractedData = JSON.parse(rawData);

  console.log(`\nInput Statistics:`);
  console.log(`  Total Codes: ${extractedData.totalCodes.toLocaleString()}`);
  console.log(`  Total Chapters: ${extractedData.totalChapters}`);
  console.log(`  Free: ${extractedData.statistics.free.toLocaleString()}`);
  console.log(`  Restricted: ${extractedData.statistics.restricted.toLocaleString()}`);
  console.log(`  Prohibited: ${extractedData.statistics.prohibited.toLocaleString()}`);
  console.log();

  console.log('Transforming codes...');

  // Transform codes
  const cleanCodes: CleanCode[] = extractedData.codes.map((code, index) => {
    // Show progress every 1000 codes
    if ((index + 1) % 1000 === 0) {
      process.stdout.write(`\r  Processed ${index + 1}/${extractedData.totalCodes} codes...`);
    }

    const heading = deriveHeading(code.code);
    const subheading = formatSubheading(code.code);

    return {
      hs_code: code.code,
      description: code.description,
      chapter: code.chapter,
      heading: heading,
      subheading: subheading,
      keywords: [],
      common_products: [],
      synonyms: [],
      export_policy: code.exportPolicy || 'Free',
    };
  });

  console.log(`\r  Processed ${extractedData.totalCodes}/${extractedData.totalCodes} codes... Done!`);
  console.log();

  // Write output file
  console.log(`Writing to: ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(cleanCodes, null, 2), 'utf-8');

  const outputSize = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${outputSize} MB`);
  console.log();

  // Validation
  console.log('Validation:');
  console.log(`  ✓ Total codes: ${cleanCodes.length.toLocaleString()}`);
  console.log(`  ✓ All codes have heading: ${cleanCodes.every(c => c.heading) ? 'Yes' : 'No'}`);
  console.log(`  ✓ All codes have subheading: ${cleanCodes.every(c => c.subheading) ? 'Yes' : 'No'}`);
  console.log(`  ✓ All codes have export_policy: ${cleanCodes.every(c => c.export_policy) ? 'Yes' : 'No'}`);
  console.log();

  // Sample output
  console.log('Sample transformed codes:');
  cleanCodes.slice(0, 3).forEach(code => {
    console.log(`  ${code.hs_code} | ${code.heading} | ${code.export_policy}`);
  });
  console.log();

  console.log('═'.repeat(80));
  console.log('✓ TRANSFORMATION COMPLETE');
  console.log('═'.repeat(80));
  console.log();
  console.log('Next step: Update seed.ts to handle export_policy field');
  console.log('Then run: cd backend && npx prisma migrate reset --force');
  console.log();
}

// Execute
try {
  transformData();
} catch (error: any) {
  console.error('\nError during transformation:', error.message);
  process.exit(1);
}

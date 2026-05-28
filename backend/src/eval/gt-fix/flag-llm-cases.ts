// backend/src/eval/gt-fix/flag-llm-cases.ts
// Flags LLM-generated tier3 cases and validates their codes against DB
// Usage: npx tsx --require dotenv/config src/eval/gt-fix/flag-llm-cases.ts

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { getTariffLine, closeClient } from './db';
import { GTFixProposal, GTFixReport, ConfidenceLevel } from './types';

interface ComprehensiveCase {
  id: string;
  query: string;
  expectedChapter: string;
  expectedHeading: string;
  expected8Digit: string;
  category: string;
  difficulty: string;
  source: string;
  tier: number;
  needsVerification?: boolean;
  keyDistinction?: string;
}

async function main() {
  // Load comprehensive test set directly (tier3 is filtered out of masterSuite)
  const dataPath = path.resolve(__dirname, '../../tests/test-data/comprehensive-test-set.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const allCases: ComprehensiveCase[] = data.testCases;

  // Filter to LLM-generated / needs-verification cases
  const llmCases = allCases.filter(tc =>
    tc.tier === 3 ||
    (tc.source && (tc.source.toLowerCase().includes('llm') || tc.source.toLowerCase().includes('gpt'))) ||
    tc.needsVerification === true
  );

  console.log(`Found ${llmCases.length} LLM-generated / needs-verification cases`);

  const proposals: GTFixProposal[] = [];
  let validCount = 0;
  let invalidCodeCount = 0;
  let inconsistentCount = 0;

  for (let i = 0; i < llmCases.length; i++) {
    const tc = llmCases[i]!;

    // Check code existence in DB
    const dbResult = await getTariffLine(tc.expected8Digit);
    const codeExists = !!dbResult;

    // Check internal consistency
    const codeNorm = tc.expected8Digit.replace(/\./g, '');
    const codeChapter = codeNorm.substring(0, 2);
    const codeHeading = codeNorm.substring(0, 4);
    const chapterConsistent = codeChapter === tc.expectedChapter;
    const headingConsistent = codeHeading === tc.expectedHeading;
    const isConsistent = chapterConsistent && headingConsistent;

    if (codeExists && isConsistent) {
      validCount++;
      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${llmCases.length}] Progress — ${validCount} valid so far`);
      }
      continue;
    }

    const issues: string[] = [];
    if (!codeExists) {
      invalidCodeCount++;
      issues.push('code_not_in_db');
    }
    if (!isConsistent) {
      inconsistentCount++;
      issues.push('inconsistent');
    }

    console.log(`[${i + 1}/${llmCases.length}] FLAGGED ${tc.id}: ${tc.expected8Digit} [${issues.join(', ')}]`);

    // Determine confidence and reasoning
    let confidence: ConfidenceLevel;
    let reasoning: string;

    if (!codeExists && !isConsistent) {
      confidence = 'LOW';
      reasoning = `Code ${tc.expected8Digit} NOT in DB AND inconsistent: ch=${tc.expectedChapter} heading=${tc.expectedHeading} but code implies ch=${codeChapter} heading=${codeHeading}. Source: ${tc.source}. Needs full manual review.`;
    } else if (!codeExists) {
      confidence = 'LOW';
      reasoning = `Code ${tc.expected8Digit} NOT in DB. Internal fields consistent. Source: ${tc.source}. LLM may have hallucinated this code.`;
    } else {
      confidence = 'MEDIUM';
      reasoning = `Code ${tc.expected8Digit} exists in DB but inconsistent: ch=${tc.expectedChapter} heading=${tc.expectedHeading} vs code-derived ch=${codeChapter} heading=${codeHeading}. Fix chapter/heading to match code.`;
    }

    proposals.push({
      case_id: tc.id,
      query: tc.query,
      source_file: 'comprehensive-test-set.json',
      fix_type: 'llm_flag',
      current_chapter: tc.expectedChapter,
      current_heading: tc.expectedHeading,
      current_code: tc.expected8Digit,
      proposed_chapter: codeChapter,
      proposed_heading: codeHeading,
      proposed_code: codeExists ? tc.expected8Digit : undefined,
      confidence,
      reasoning,
      candidates: dbResult ? [{ code: dbResult.code, description: dbResult.description }] : [],
      code_exists_in_db: codeExists,
      llm_source: tc.source,
      needs_verification: true,
      tier: tc.tier,
    });
  }

  // Build report
  const byConfidence: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const p of proposals) byConfidence[p.confidence]++;

  const report: GTFixReport = {
    metadata: {
      script: 'flag-llm-cases.ts',
      timestamp: new Date().toISOString(),
      total_cases_analyzed: llmCases.length,
      proposals_generated: proposals.length,
      by_confidence: byConfidence,
    },
    proposals,
  };

  const outputPath = path.resolve(__dirname, '../../../eval-results/gt-fix-llm-flags.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`\n=== flag-llm-cases SUMMARY ===`);
  console.log(`LLM cases analyzed: ${llmCases.length}`);
  console.log(`Valid + consistent: ${validCount}`);
  console.log(`Flagged:            ${proposals.length}`);
  console.log(`  Code not in DB:   ${invalidCodeCount}`);
  console.log(`  Inconsistent:     ${inconsistentCount}`);
  console.log(`  HIGH:   ${byConfidence.HIGH}`);
  console.log(`  MEDIUM: ${byConfidence.MEDIUM}`);
  console.log(`  LOW:    ${byConfidence.LOW}`);
  console.log(`Written to: ${outputPath}`);

  await closeClient();
}

main().catch(err => {
  console.error('Fatal:', err);
  closeClient().finally(() => process.exit(1));
});

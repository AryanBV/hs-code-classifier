// backend/src/eval/gt-fix/fix-invalid-codes.ts
// Validates expected codes in master suite against DB, proposes fixes for invalid ones
// Usage: npx tsx --require dotenv/config src/eval/gt-fix/fix-invalid-codes.ts

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { getTariffLine, getCodesUnderHeading, searchTariffLines, closeClient } from './db';
import { masterSuite } from '../test-suites/master-suite';
import { GTFixProposal, GTFixReport, DBCandidate, ConfidenceLevel } from './types';

async function main() {
  const casesWithCode = masterSuite.filter(
    tc => tc.expected_routing === 'classify' && tc.expected_code
  );

  console.log(`Analyzing ${casesWithCode.length} cases with expected_code...`);

  const proposals: GTFixProposal[] = [];
  let validCount = 0;

  for (let i = 0; i < casesWithCode.length; i++) {
    const tc = casesWithCode[i]!;
    const code = tc.expected_code!;

    // Check if code exists in DB
    const dbResult = await getTariffLine(code);

    if (dbResult) {
      validCount++;
      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${casesWithCode.length}] Progress check — ${validCount} valid so far`);
      }
      continue;
    }

    console.log(`[${i + 1}/${casesWithCode.length}] INVALID ${tc.id}: ${code} NOT in DB`);

    // Extract heading from code
    const codeNorm = code.replace(/\./g, '');
    const heading = codeNorm.substring(0, 4);
    const chapter = codeNorm.substring(0, 2);

    // Get all codes under same heading
    const headingCodes = await getCodesUnderHeading(heading);

    // Full-text candidate search within chapter (embedding-free; the legacy
    // pgvector/OpenAI path queried the dropped hs_codes table).
    const semanticResults = await searchTariffLines(tc.query, chapter, 10);

    // Build candidate list: heading codes first, then FTS results
    const candidates: DBCandidate[] = [];

    for (const hc of headingCodes) {
      const semMatch = semanticResults.find((sr) => sr.code === hc.code);
      candidates.push({
        code: hc.code,
        description: hc.description,
        similarity: semMatch?.similarity,
      });
    }

    // Add FTS results not already in candidates
    for (const sr of semanticResults) {
      if (!candidates.find(c => c.code === sr.code)) {
        candidates.push({
          code: sr.code,
          description: sr.description,
          similarity: sr.similarity,
        });
      }
    }

    // Sort: by similarity (desc), then by code (asc)
    candidates.sort((a, b) => {
      if (a.similarity !== undefined && b.similarity !== undefined) {
        return b.similarity - a.similarity;
      }
      if (a.similarity !== undefined) return -1;
      if (b.similarity !== undefined) return 1;
      return a.code.localeCompare(b.code);
    });

    // Determine proposed code and confidence
    const topCandidate = candidates[0];
    let confidence: ConfidenceLevel = 'LOW';
    let proposedCode: string | undefined;
    let reasoning: string;

    // Confidence based on heading match (key signal) and candidate count
    // Similarity scores in this DB are typically 0.15-0.55, not 0.70-0.95
    const sameHeadingCandidates = candidates.filter(
      c => c.code.replace(/\./g, '').substring(0, 4) === heading
    );

    if (headingCodes.length === 1 && headingCodes[0]) {
      confidence = 'HIGH';
      proposedCode = headingCodes[0].code;
      reasoning = `Only 1 tariff line under heading ${heading}: ${proposedCode} (${headingCodes[0].description}). Original ${code} not in DB.`;
    } else if (sameHeadingCandidates.length > 0 && sameHeadingCandidates[0]) {
      // Best candidate is in same heading as expected code — strong signal
      proposedCode = sameHeadingCandidates[0].code;
      if (sameHeadingCandidates.length === 1) {
        confidence = 'HIGH';
        reasoning = `Only match in heading ${heading}: ${proposedCode} (${sameHeadingCandidates[0].description}). Original ${code} not in DB.`;
      } else if (
        sameHeadingCandidates[0].similarity !== undefined &&
        sameHeadingCandidates[1]?.similarity !== undefined &&
        sameHeadingCandidates[0].similarity > sameHeadingCandidates[1].similarity * 1.3
      ) {
        confidence = 'HIGH';
        reasoning = `Top match in heading ${heading}: ${proposedCode} (sim=${sameHeadingCandidates[0].similarity.toFixed(3)}) clearly better than next (sim=${sameHeadingCandidates[1].similarity.toFixed(3)}). Original ${code} not in DB.`;
      } else {
        confidence = 'MEDIUM';
        reasoning = `${sameHeadingCandidates.length} candidates in heading ${heading}. Recommending ${proposedCode} (sim=${sameHeadingCandidates[0].similarity?.toFixed(3) ?? 'N/A'}). Original ${code} not in DB.`;
      }
    } else if (topCandidate) {
      confidence = 'LOW';
      proposedCode = topCandidate.code;
      const topHeading = topCandidate.code.replace(/\./g, '').substring(0, 4);
      reasoning = `No candidates in expected heading ${heading}. Best match ${topCandidate.code} is in heading ${topHeading}. Original ${code} not in DB. Needs manual review.`;
    } else {
      reasoning = `No candidates found under heading ${heading} or via semantic search. Original ${code} not in DB.`;
    }

    proposals.push({
      case_id: tc.id,
      query: tc.query,
      source_file: tc.source.includes('comprehensive') ? 'comprehensive-test-set.json' : 'master-suite.ts',
      fix_type: 'invalid_code',
      current_chapter: tc.expected_chapter,
      current_heading: tc.expected_heading,
      current_code: tc.expected_code,
      proposed_chapter: tc.expected_chapter,
      proposed_heading: tc.expected_heading,
      proposed_code: proposedCode,
      confidence,
      reasoning,
      candidates: candidates.slice(0, 5),
      code_exists_in_db: false,
    });
  }

  // Build report
  const byConfidence: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const p of proposals) byConfidence[p.confidence]++;

  const report: GTFixReport = {
    metadata: {
      script: 'fix-invalid-codes.ts',
      timestamp: new Date().toISOString(),
      total_cases_analyzed: casesWithCode.length,
      proposals_generated: proposals.length,
      by_confidence: byConfidence,
    },
    proposals,
  };

  const outputPath = path.resolve(__dirname, '../../../eval-results/gt-fix-invalid-codes.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`\n=== fix-invalid-codes SUMMARY ===`);
  console.log(`Valid codes:   ${validCount}`);
  console.log(`Invalid codes: ${proposals.length}`);
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

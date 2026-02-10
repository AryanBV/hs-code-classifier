// backend/src/eval/gt-fix/fix-missing-gt.ts
// Fills missing heading/code ground truth for session5 cases using pgvector search
// Usage: npx tsx --require dotenv/config src/eval/gt-fix/fix-missing-gt.ts

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { searchWithinChapter } from '../../database/hs-codes';
import { generateEmbedding } from '../../classifier/attribute-extractor';
import { masterSuite } from '../test-suites/master-suite';
import { GTFixProposal, GTFixReport, DBCandidate, ConfidenceLevel } from './types';
import { prisma } from '../../utils/prisma';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  // Cases with chapter but missing heading or code
  const missingGT = masterSuite.filter(tc =>
    tc.expected_routing === 'classify' &&
    tc.expected_chapter &&
    (!tc.expected_heading || !tc.expected_code)
  );

  console.log(`Found ${missingGT.length} cases with missing heading/code ground truth`);

  const proposals: GTFixProposal[] = [];

  for (let i = 0; i < missingGT.length; i++) {
    const tc = missingGT[i]!;
    const chapter = tc.expected_chapter!;

    console.log(`[${i + 1}/${missingGT.length}] ${tc.id}: "${tc.query}" (Ch.${chapter}) heading=${tc.expected_heading || 'MISSING'} code=${tc.expected_code || 'MISSING'}`);

    // Generate embedding for query
    const embedding = await generateEmbedding(tc.query);
    await delay(500); // Rate limit

    const candidates: DBCandidate[] = [];
    let proposedHeading: string | undefined = tc.expected_heading;
    let proposedCode: string | undefined = tc.expected_code;
    let headingSimilarity: number | undefined;
    let codeSimilarity: number | undefined;

    // Step 1: Find heading if missing
    if (!tc.expected_heading) {
      const headingResults = await searchWithinChapter(embedding, chapter, 4, 5);
      if (headingResults.length > 0) {
        const topHeading = headingResults[0]!;
        proposedHeading = topHeading.code;
        headingSimilarity = Number(topHeading.similarity);

        for (const hr of headingResults) {
          candidates.push({
            code: hr.code,
            description: hr.description,
            similarity: Number(hr.similarity),
          });
        }
      }
    }

    // Step 2: Find code if missing
    if (!tc.expected_code && proposedHeading) {
      const tariffResults = await searchWithinChapter(embedding, chapter, 10, 10);

      // Filter to codes under the proposed heading
      const headingNorm = proposedHeading.replace(/\./g, '').substring(0, 4);
      const underHeading = tariffResults.filter(
        (r: any) => r.code.replace(/\./g, '').substring(0, 4) === headingNorm
      );

      const codeSource = underHeading.length > 0 ? underHeading : tariffResults;

      if (codeSource.length > 0) {
        const topCode = codeSource[0]!;
        proposedCode = topCode.code;
        codeSimilarity = Number(topCode.similarity);

        for (const cr of codeSource) {
          if (!candidates.find(c => c.code === cr.code)) {
            candidates.push({
              code: cr.code,
              description: cr.description,
              similarity: Number(cr.similarity),
            });
          }
        }
      }
    }

    // Determine confidence
    // Similarity scores in this DB are typically 0.15-0.55 for product queries
    // vs HS code descriptions. Calibrated thresholds for this embedding space:
    let confidence: ConfidenceLevel = 'LOW';
    const hSim = headingSimilarity ?? 1.0; // If heading was already known, treat as perfect
    const cSim = codeSimilarity ?? 0;

    if (tc.expected_heading) {
      // Heading was known, only code was missing
      if (cSim > 0.40) confidence = 'HIGH';
      else if (cSim > 0.25) confidence = 'MEDIUM';
      else confidence = 'LOW';
    } else {
      // Both heading and code were missing
      if (hSim > 0.35 && cSim > 0.35) confidence = 'HIGH';
      else if (hSim > 0.22 && cSim > 0.22) confidence = 'MEDIUM';
      else confidence = 'LOW';
    }

    // Build reasoning
    const parts: string[] = [];
    if (!tc.expected_heading && proposedHeading) {
      parts.push(`Proposed heading ${proposedHeading} (sim=${hSim.toFixed(3)}).`);
    } else if (!tc.expected_heading) {
      parts.push(`No heading candidate found in chapter ${chapter}.`);
    }
    if (!tc.expected_code && proposedCode) {
      parts.push(`Proposed code ${proposedCode} (sim=${cSim.toFixed(3)}).`);
    } else if (!tc.expected_code) {
      parts.push(`No code candidate found.`);
    }
    if (tc.notes) {
      parts.push(`Notes: ${tc.notes}`);
    }

    proposals.push({
      case_id: tc.id,
      query: tc.query,
      source_file: tc.source,
      fix_type: 'missing_gt',
      current_chapter: tc.expected_chapter,
      current_heading: tc.expected_heading,
      current_code: tc.expected_code,
      proposed_chapter: tc.expected_chapter,
      proposed_heading: proposedHeading,
      proposed_code: proposedCode,
      confidence,
      reasoning: parts.join(' '),
      candidates: candidates.slice(0, 5),
      code_exists_in_db: !!proposedCode, // Proposed codes come from DB
    });
  }

  // Build report
  const byConfidence: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const p of proposals) byConfidence[p.confidence]++;

  const report: GTFixReport = {
    metadata: {
      script: 'fix-missing-gt.ts',
      timestamp: new Date().toISOString(),
      total_cases_analyzed: missingGT.length,
      proposals_generated: proposals.length,
      by_confidence: byConfidence,
    },
    proposals,
  };

  const outputPath = path.resolve(__dirname, '../../../eval-results/gt-fix-missing-gt.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`\n=== fix-missing-gt SUMMARY ===`);
  console.log(`Cases analyzed: ${missingGT.length}`);
  console.log(`Proposals: HIGH=${byConfidence.HIGH}, MEDIUM=${byConfidence.MEDIUM}, LOW=${byConfidence.LOW}`);
  console.log(`Written to: ${outputPath}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

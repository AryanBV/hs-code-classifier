// backend/src/eval/gt-fix/merge-and-review.ts
// Merges 3 subagent outputs into gt-fix-proposed.json and gt-fix-review.md
// Usage: npx tsx src/eval/gt-fix/merge-and-review.ts

import * as fs from 'fs';
import * as path from 'path';
import { GTFixReport, GTFixProposal, ConfidenceLevel } from './types';

const resultsDir = path.resolve(__dirname, '../../../eval-results');

function loadReport(filename: string): GTFixReport | null {
  const filepath = path.join(resultsDir, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`Missing: ${filepath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function main() {
  const invalidCodesReport = loadReport('gt-fix-invalid-codes.json');
  const missingGTReport = loadReport('gt-fix-missing-gt.json');
  const llmFlagsReport = loadReport('gt-fix-llm-flags.json');

  const allProposals: GTFixProposal[] = [
    ...(invalidCodesReport?.proposals ?? []),
    ...(missingGTReport?.proposals ?? []),
    ...(llmFlagsReport?.proposals ?? []),
  ];

  // Deduplicate by case_id (keep highest confidence)
  const confidenceOrder: Record<ConfidenceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const byId = new Map<string, GTFixProposal>();
  for (const p of allProposals) {
    const existing = byId.get(p.case_id);
    if (!existing || confidenceOrder[p.confidence] > confidenceOrder[existing.confidence]) {
      byId.set(p.case_id, p);
    }
  }
  const merged = Array.from(byId.values());

  // Sort: by fix_type, then confidence (HIGH first), then case_id
  const typeOrder = { invalid_code: 1, missing_gt: 2, llm_flag: 3 };
  merged.sort((a, b) => {
    const typeDiff = typeOrder[a.fix_type] - typeOrder[b.fix_type];
    if (typeDiff !== 0) return typeDiff;
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return a.case_id.localeCompare(b.case_id);
  });

  // === Write merged JSON ===
  const mergedOutput = {
    metadata: {
      date: new Date().toISOString().split('T')[0],
      total_cases: (invalidCodesReport?.metadata.total_cases_analyzed ?? 0) +
        (missingGTReport?.metadata.total_cases_analyzed ?? 0) +
        (llmFlagsReport?.metadata.total_cases_analyzed ?? 0),
      valid_codes: (invalidCodesReport?.metadata.total_cases_analyzed ?? 0) -
        (invalidCodesReport?.metadata.proposals_generated ?? 0),
      invalid_codes: invalidCodesReport?.metadata.proposals_generated ?? 0,
      missing_gt: missingGTReport?.metadata.proposals_generated ?? 0,
      llm_flagged: llmFlagsReport?.metadata.proposals_generated ?? 0,
    },
    invalid_code_fixes: merged.filter(p => p.fix_type === 'invalid_code').map(p => ({
      case_id: p.case_id,
      product: p.query,
      old_code: p.current_code,
      new_code: p.proposed_code,
      new_description: p.candidates[0]?.description ?? '',
      confidence: p.confidence,
      other_candidates: p.candidates.slice(1).map(c => ({
        code: c.code,
        description: c.description,
        similarity_score: c.similarity,
      })),
      reason: p.reasoning,
    })),
    missing_gt_fills: merged.filter(p => p.fix_type === 'missing_gt').map(p => ({
      case_id: p.case_id,
      product: p.query,
      chapter: p.current_chapter,
      suggested_heading: p.proposed_heading,
      suggested_code: p.proposed_code,
      suggested_description: p.candidates[0]?.description ?? '',
      confidence: p.confidence,
      candidates: p.candidates.map(c => ({
        code: c.code,
        description: c.description,
        similarity_score: c.similarity,
      })),
      reason: p.reasoning,
    })),
    llm_generated_flags: merged.filter(p => p.fix_type === 'llm_flag').map(p => ({
      case_id: p.case_id,
      product: p.query,
      source: p.llm_source,
      code_valid_in_db: p.code_exists_in_db,
      current_code: p.current_code,
      reason: p.reasoning,
    })),
  };

  const jsonPath = path.join(resultsDir, 'gt-fix-proposed.json');
  fs.writeFileSync(jsonPath, JSON.stringify(mergedOutput, null, 2));

  // === Generate markdown review ===
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  const totalCases = mergedOutput.metadata.total_cases;
  const validCodes = mergedOutput.metadata.valid_codes;
  const invalidCodes = mergedOutput.metadata.invalid_codes;
  const missingGT = mergedOutput.metadata.missing_gt;
  const llmFlagged = mergedOutput.metadata.llm_flagged;

  const invalidByConf = countByConfidence(merged.filter(p => p.fix_type === 'invalid_code'));
  const missingByConf = countByConfidence(merged.filter(p => p.fix_type === 'missing_gt'));

  w(`# Ground Truth Fix Review`);
  w(`Date: ${new Date().toISOString().split('T')[0]}`);
  w(`Total test cases analyzed: ${totalCases}`);
  w(``);
  w(`## Summary`);
  w(`- Valid codes (no change needed): ${validCodes}`);
  w(`- Invalid codes (to fix): ${invalidCodes} (HIGH: ${invalidByConf.HIGH}, MEDIUM: ${invalidByConf.MEDIUM}, LOW: ${invalidByConf.LOW})`);
  w(`- Missing GT (auto-filled): ${missingGT} (HIGH: ${missingByConf.HIGH}, MEDIUM: ${missingByConf.MEDIUM}, LOW: ${missingByConf.LOW})`);
  w(`- LLM-generated cases flagged: ${llmFlagged}`);
  w(``);

  // Section 1: Invalid Code Fixes
  const invalidProposals = merged.filter(p => p.fix_type === 'invalid_code');
  if (invalidProposals.length > 0) {
    w(`## Section 1: Invalid Code Fixes (${invalidProposals.length} cases)`);
    w(``);
    writeConfidenceSection(w, invalidProposals, 'HIGH', 'Auto-Fix Confidence: HIGH (only 1 plausible replacement)', formatInvalidRow);
    writeConfidenceSection(w, invalidProposals, 'MEDIUM', 'Auto-Fix Confidence: MEDIUM (2-3 candidates, one recommended)', formatInvalidRowMedium);
    writeConfidenceSection(w, invalidProposals, 'LOW', 'Auto-Fix Confidence: LOW (multiple candidates, need user decision)', formatInvalidRowLow);
  }

  // Section 2: Missing GT
  const missingProposals = merged.filter(p => p.fix_type === 'missing_gt');
  if (missingProposals.length > 0) {
    w(`## Section 2: Missing GT -- Auto-Filled (${missingProposals.length} cases)`);
    w(``);
    writeConfidenceSection(w, missingProposals, 'HIGH', 'Confidence: HIGH', formatMissingRow);
    writeConfidenceSection(w, missingProposals, 'MEDIUM', 'Confidence: MEDIUM', formatMissingRowDetailed);
    writeConfidenceSection(w, missingProposals, 'LOW', 'Confidence: LOW (need user decision)', formatMissingRowDetailed);
  }

  // Section 3: LLM-Generated Flags
  const llmProposals = merged.filter(p => p.fix_type === 'llm_flag');
  if (llmProposals.length > 0) {
    w(`## Section 3: LLM-Generated Cases (${llmProposals.length} flagged)`);
    w(``);
    w(`| # | Case ID | Product | Source | Code | Code in DB? | Issue |`);
    w(`|---|---------|---------|--------|------|-------------|-------|`);
    llmProposals.forEach((p, i) => {
      const queryShort = p.query.length > 35 ? p.query.substring(0, 32) + '...' : p.query;
      const issue = !p.code_exists_in_db ? 'Code not in DB' : 'Inconsistent fields';
      w(`| ${i + 1} | ${p.case_id} | ${queryShort} | ${p.llm_source || ''} | \`${p.current_code || ''}\` | ${p.code_exists_in_db ? 'Yes' : '**No**'} | ${issue} |`);
    });
    w(``);
  }

  // Section 4: Verification Checklist
  w(`## Section 4: Verification Checklist`);
  w(``);
  w(`User: please review each section and:`);
  w(`- [ ] Approve HIGH confidence fixes (or flag any you disagree with)`);
  w(`- [ ] Pick the correct code for MEDIUM confidence cases`);
  w(`- [ ] Pick the correct code for LOW confidence cases`);
  w(`- [ ] Confirm missing GT suggestions or provide corrections`);
  w(`- [ ] Decide whether to keep, fix, or remove LLM-generated cases`);
  w(``);
  w(`Reply with your decisions and I'll apply all changes in one commit.`);

  const mdPath = path.join(resultsDir, 'gt-fix-review.md');
  fs.writeFileSync(mdPath, lines.join('\n'));

  console.log(`Merged JSON: ${jsonPath}`);
  console.log(`Review MD:   ${mdPath}`);
  console.log(`Total proposals: ${merged.length}`);
}

// --- Helpers ---

function countByConfidence(proposals: GTFixProposal[]): Record<ConfidenceLevel, number> {
  const counts: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const p of proposals) counts[p.confidence]++;
  return counts;
}

function writeConfidenceSection(
  w: (s: string) => void,
  proposals: GTFixProposal[],
  conf: ConfidenceLevel,
  title: string,
  formatRow: (p: GTFixProposal, i: number) => string
) {
  const filtered = proposals.filter(p => p.confidence === conf);
  if (filtered.length === 0) return;

  w(`### ${title}`);
  w(``);

  if (conf === 'HIGH') {
    w(`| # | Case ID | Product | Old Code | New Code | New Description | Reason |`);
    w(`|---|---------|---------|----------|----------|-----------------|--------|`);
  } else if (conf === 'MEDIUM') {
    w(`| # | Case ID | Product | Old Code | Recommended Code | Rec. Description | Other Candidates |`);
    w(`|---|---------|---------|----------|------------------|------------------|------------------|`);
  } else {
    w(`| # | Case ID | Product | Old Code | Candidate 1 | Candidate 2 | Candidate 3 |`);
    w(`|---|---------|---------|----------|-------------|-------------|-------------|`);
  }

  filtered.forEach((p, i) => w(formatRow(p, i)));
  w(``);

  // Detailed view for MEDIUM/LOW
  if (conf !== 'HIGH' && filtered.length > 0) {
    w(`<details>`);
    w(`<summary>Detailed candidates for ${conf} confidence (${filtered.length} cases)</summary>`);
    w(``);
    for (const p of filtered) {
      w(`**${p.case_id}:** "${p.query}"`);
      w(`- Current: ch=${p.current_chapter} heading=${p.current_heading || 'NONE'} code=${p.current_code || 'NONE'}`);
      w(`- Proposed: ch=${p.proposed_chapter} heading=${p.proposed_heading || 'NONE'} code=${p.proposed_code || 'NONE'}`);
      w(`- Reasoning: ${p.reasoning}`);
      if (p.candidates.length > 0) {
        w(`- All candidates:`);
        for (const c of p.candidates) {
          w(`  - \`${c.code}\` ${c.description} (sim: ${c.similarity?.toFixed(3) ?? 'N/A'})`);
        }
      }
      w(``);
    }
    w(`</details>`);
    w(``);
  }
}

function formatInvalidRow(p: GTFixProposal, i: number): string {
  const q = p.query.length > 30 ? p.query.substring(0, 27) + '...' : p.query;
  const desc = p.candidates[0]?.description ?? '';
  const descShort = desc.length > 30 ? desc.substring(0, 27) + '...' : desc;
  const reasonShort = p.reasoning.length > 50 ? p.reasoning.substring(0, 47) + '...' : p.reasoning;
  return `| ${i + 1} | ${p.case_id} | ${q} | \`${p.current_code}\` | \`${p.proposed_code}\` | ${descShort} | ${reasonShort} |`;
}

function formatInvalidRowMedium(p: GTFixProposal, i: number): string {
  const q = p.query.length > 30 ? p.query.substring(0, 27) + '...' : p.query;
  const desc = p.candidates[0]?.description ?? '';
  const descShort = desc.length > 30 ? desc.substring(0, 27) + '...' : desc;
  const others = p.candidates.slice(1, 3).map(c => `\`${c.code}\``).join(', ') || 'none';
  return `| ${i + 1} | ${p.case_id} | ${q} | \`${p.current_code}\` | \`${p.proposed_code}\` | ${descShort} | ${others} |`;
}

function formatInvalidRowLow(p: GTFixProposal, i: number): string {
  const q = p.query.length > 30 ? p.query.substring(0, 27) + '...' : p.query;
  const c1 = p.candidates[0] ? `\`${p.candidates[0].code}\` ${p.candidates[0].description.substring(0, 20)}` : '-';
  const c2 = p.candidates[1] ? `\`${p.candidates[1].code}\` ${p.candidates[1].description.substring(0, 20)}` : '-';
  const c3 = p.candidates[2] ? `\`${p.candidates[2].code}\` ${p.candidates[2].description.substring(0, 20)}` : '-';
  return `| ${i + 1} | ${p.case_id} | ${q} | \`${p.current_code || 'NONE'}\` | ${c1} | ${c2} | ${c3} |`;
}

function formatMissingRow(p: GTFixProposal, i: number): string {
  const q = p.query.length > 30 ? p.query.substring(0, 27) + '...' : p.query;
  const desc = p.candidates[0]?.description ?? '';
  const descShort = desc.length > 30 ? desc.substring(0, 27) + '...' : desc;
  const reasonShort = p.reasoning.length > 50 ? p.reasoning.substring(0, 47) + '...' : p.reasoning;
  return `| ${i + 1} | ${p.case_id} | ${q} | \`${p.current_code || 'NONE'}\` | \`${p.proposed_code || 'NONE'}\` | ${descShort} | ${reasonShort} |`;
}

function formatMissingRowDetailed(p: GTFixProposal, i: number): string {
  return formatInvalidRowLow(p, i);
}

main();

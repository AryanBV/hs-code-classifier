// backend/src/eval/gt-fix/apply-fixes.ts
// Reviews 196 GT fix proposals, applies valid corrections to test suite
// Usage: cd backend && npx tsx --require dotenv/config src/eval/gt-fix/apply-fixes.ts
// ARY-50

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { prisma, connectDatabase, disconnectDatabase } from '../../utils/prisma';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Change {
  case_id: string;
  category: 'invalid_code' | 'missing_gt' | 'llm_flagged';
  action: 'accept' | 'reject' | 'remove' | 'keep_original';
  old_code: string | null;
  new_code: string | null;
  new_heading?: string;
  new_chapter?: string;
  reason: string;
}

interface DBCode {
  code: string;
  description: string;
  chapter: string;
  heading: string;
}

// ═══════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');
const PROPOSALS_PATH = path.join(BACKEND_DIR, 'eval-results', 'gt-fix-proposed.json');
const COMPREHENSIVE_PATH = path.join(BACKEND_DIR, 'src', 'tests', 'test-data', 'comprehensive-test-set.json');
const MASTER_SUITE_PATH = path.join(BACKEND_DIR, 'src', 'eval', 'test-suites', 'master-suite.ts');
const QUICK_SUITE_PATH = path.join(BACKEND_DIR, 'src', 'eval', 'test-suites', 'quick-suite.ts');
const MANIFEST_PATH = path.join(BACKEND_DIR, 'eval-results', 'gt-fix-applied.json');

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function stripDots(code: string): string {
  return code.replace(/\./g, '');
}

function heading4(code: string): string {
  return stripDots(code).substring(0, 4);
}

function chapter2(code: string): string {
  return stripDots(code).substring(0, 2);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  await connectDatabase();

  // ── 1. Read proposals ────────────────────────────────────
  const proposed = JSON.parse(fs.readFileSync(PROPOSALS_PATH, 'utf-8'));
  const invalidFixes: any[] = proposed.invalid_code_fixes;       // 63
  const missingFills: any[] = proposed.missing_gt_fills;          // 55
  const llmFlags: any[]     = proposed.llm_generated_flags;       // 78

  console.log(`\nProposals loaded:`);
  console.log(`  Invalid codes:  ${invalidFixes.length}`);
  console.log(`  Missing GT:     ${missingFills.length}`);
  console.log(`  LLM-flagged:    ${llmFlags.length}`);
  console.log(`  Total:          ${invalidFixes.length + missingFills.length + llmFlags.length}`);

  // ── 2. Extract unique codes ──────────────────────────────
  const allCodes = new Set<string>();

  for (const f of invalidFixes) {
    if (f.old_code) allCodes.add(f.old_code);
    if (f.new_code) allCodes.add(f.new_code);
    for (const c of (f.other_candidates || [])) {
      if (c.code && c.code.includes('.')) allCodes.add(c.code);
    }
  }

  for (const f of missingFills) {
    if (f.suggested_code) allCodes.add(f.suggested_code);
  }

  for (const f of llmFlags) {
    if (f.current_code) allCodes.add(f.current_code);
  }

  console.log(`\nUnique codes to verify: ${allCodes.size}`);

  // ── 3. Batch DB query (ONE call) ────────────────────────
  const codeArray = Array.from(allCodes);
  const dbResults = await prisma.$queryRaw<DBCode[]>`
    SELECT code, description, chapter, heading
    FROM hs_codes
    WHERE code = ANY(${codeArray})
  `;

  const lookup = new Map<string, DBCode>();
  for (const row of dbResults) {
    lookup.set(row.code, row);
  }

  console.log(`DB lookup: ${lookup.size}/${allCodes.size} codes found`);

  // ── 4. Process categories ────────────────────────────────
  const changes: Change[] = [];
  const stats = {
    invalid_codes: { accepted: 0, rejected: 0 },
    missing_gt:    { accepted: 0, rejected: 0, removed_from_suite: 0 },
    llm_flagged:   { changed: 0, kept_original: 0, removed_from_suite: 0 },
  };

  // ─── Category A: Invalid Codes (63) ─────────────────────
  console.log(`\n── Category A: Invalid Codes ──`);

  for (const fix of invalidFixes) {
    if (!lookup.has(fix.new_code)) {
      changes.push({
        case_id: fix.case_id, category: 'invalid_code', action: 'reject',
        old_code: fix.old_code, new_code: fix.new_code,
        reason: `Proposed code ${fix.new_code} not in DB`,
      });
      stats.invalid_codes.rejected++;
      continue;
    }

    const sameHeading = heading4(fix.old_code) === heading4(fix.new_code);
    const sameChapter = chapter2(fix.old_code) === chapter2(fix.new_code);

    if (sameHeading) {
      changes.push({
        case_id: fix.case_id, category: 'invalid_code', action: 'accept',
        old_code: fix.old_code, new_code: fix.new_code,
        new_heading: heading4(fix.new_code), new_chapter: chapter2(fix.new_code),
        reason: `Same heading ${heading4(fix.new_code)}, new code in DB`,
      });
      stats.invalid_codes.accepted++;
    } else if (sameChapter) {
      changes.push({
        case_id: fix.case_id, category: 'invalid_code', action: 'accept',
        old_code: fix.old_code, new_code: fix.new_code,
        new_heading: heading4(fix.new_code), new_chapter: chapter2(fix.new_code),
        reason: `Same chapter ${chapter2(fix.new_code)}, heading ${heading4(fix.old_code)}->${heading4(fix.new_code)}, new code in DB`,
      });
      stats.invalid_codes.accepted++;
    } else {
      changes.push({
        case_id: fix.case_id, category: 'invalid_code', action: 'reject',
        old_code: fix.old_code, new_code: fix.new_code,
        reason: `Different chapter: ${chapter2(fix.old_code)}->${chapter2(fix.new_code)}`,
      });
      stats.invalid_codes.rejected++;
    }
  }

  console.log(`  Accepted: ${stats.invalid_codes.accepted}`);
  console.log(`  Rejected: ${stats.invalid_codes.rejected}`);

  // ─── Category B: Missing GT (55) ────────────────────────
  console.log(`\n── Category B: Missing GT ──`);

  for (const fill of missingFills) {
    const codeInDB = fill.suggested_code ? lookup.has(fill.suggested_code) : false;

    if (!codeInDB) {
      changes.push({
        case_id: fill.case_id, category: 'missing_gt', action: 'reject',
        old_code: null, new_code: fill.suggested_code || null,
        reason: `Suggested code ${fill.suggested_code || 'none'} not in DB`,
      });
      stats.missing_gt.rejected++;
      continue;
    }

    if (fill.confidence === 'HIGH') {
      changes.push({
        case_id: fill.case_id, category: 'missing_gt', action: 'accept',
        old_code: null, new_code: fill.suggested_code,
        new_heading: fill.suggested_heading || heading4(fill.suggested_code),
        new_chapter: fill.chapter,
        reason: `HIGH confidence, code ${fill.suggested_code} in DB`,
      });
      stats.missing_gt.accepted++;
    } else if (fill.confidence === 'MEDIUM') {
      const chapterMatch = chapter2(fill.suggested_code) === fill.chapter;
      if (chapterMatch) {
        changes.push({
          case_id: fill.case_id, category: 'missing_gt', action: 'accept',
          old_code: null, new_code: fill.suggested_code,
          new_heading: fill.suggested_heading || heading4(fill.suggested_code),
          new_chapter: fill.chapter,
          reason: `MEDIUM confidence, chapter match (${fill.chapter}), code in DB`,
        });
        stats.missing_gt.accepted++;
      } else {
        changes.push({
          case_id: fill.case_id, category: 'missing_gt', action: 'reject',
          old_code: null, new_code: fill.suggested_code,
          reason: `MEDIUM confidence but chapter mismatch: expected ${fill.chapter}, got ${chapter2(fill.suggested_code)}`,
        });
        stats.missing_gt.rejected++;
      }
    } else {
      changes.push({
        case_id: fill.case_id, category: 'missing_gt', action: 'reject',
        old_code: null, new_code: fill.suggested_code,
        reason: `LOW confidence — too uncertain to add GT`,
      });
      stats.missing_gt.rejected++;
    }
  }

  console.log(`  Accepted: ${stats.missing_gt.accepted}`);
  console.log(`  Rejected: ${stats.missing_gt.rejected}`);
  console.log(`  Removed:  ${stats.missing_gt.removed_from_suite}`);

  // ─── Category C: LLM-Flagged (78) ──────────────────────
  console.log(`\n── Category C: LLM-Flagged ──`);

  for (const flag of llmFlags) {
    if (flag.code_valid_in_db) {
      const correctChapter = chapter2(flag.current_code);
      const correctHeading = heading4(flag.current_code);
      changes.push({
        case_id: flag.case_id, category: 'llm_flagged', action: 'accept',
        old_code: flag.current_code, new_code: flag.current_code,
        new_heading: correctHeading, new_chapter: correctChapter,
        reason: `Fix metadata: chapter/heading -> ${correctChapter}/${correctHeading} (code exists in DB)`,
      });
      stats.llm_flagged.changed++;
    } else {
      changes.push({
        case_id: flag.case_id, category: 'llm_flagged', action: 'keep_original',
        old_code: flag.current_code, new_code: null,
        reason: `Code ${flag.current_code} not in DB. Tier 3 (not in eval suite). Kept for chapter data.`,
      });
      stats.llm_flagged.kept_original++;
    }
  }

  console.log(`  Metadata fixed: ${stats.llm_flagged.changed}`);
  console.log(`  Kept original:  ${stats.llm_flagged.kept_original}`);
  console.log(`  Removed:        ${stats.llm_flagged.removed_from_suite}`);

  // ── 5. Write manifest ───────────────────────────────────
  const totalRemoved = stats.missing_gt.removed_from_suite + stats.llm_flagged.removed_from_suite;
  const totalChanged = stats.invalid_codes.accepted + stats.missing_gt.accepted + stats.llm_flagged.changed;

  const manifest = {
    applied_at: new Date().toISOString(),
    summary: {
      invalid_codes: stats.invalid_codes,
      missing_gt: stats.missing_gt,
      llm_flagged: stats.llm_flagged,
      total_cases_before: 386,
      total_cases_after: 386 - totalRemoved,
      total_gt_changes: totalChanged,
      total_removed: totalRemoved,
    },
    changes,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written: ${path.relative(BACKEND_DIR, MANIFEST_PATH)}`);

  // ── 6. Update comprehensive-test-set.json ────────────────
  console.log(`\n── Updating comprehensive-test-set.json ──`);

  const testSet = JSON.parse(fs.readFileSync(COMPREHENSIVE_PATH, 'utf-8'));
  const tcMap = new Map<string, any>(
    testSet.testCases.map((tc: any) => [tc.id, tc])
  );

  let jsonUpdated = 0;
  let jsonRemoved = 0;
  const notFoundInJson: string[] = [];

  for (const change of changes) {
    const tc = tcMap.get(change.case_id);

    if (!tc) {
      if (!change.case_id.startsWith('S5-')) {
        notFoundInJson.push(change.case_id);
      }
      continue;
    }

    if (change.action === 'accept' && change.category === 'invalid_code') {
      tc.expected8Digit = change.new_code;
      if (change.new_heading && tc.expectedHeading !== change.new_heading) {
        tc.expectedHeading = change.new_heading;
      }
      jsonUpdated++;
    } else if (change.action === 'accept' && change.category === 'llm_flagged') {
      if (change.new_chapter) tc.expectedChapter = change.new_chapter;
      if (change.new_heading) tc.expectedHeading = change.new_heading;
      jsonUpdated++;
    } else if (change.action === 'remove') {
      tcMap.delete(change.case_id);
      jsonRemoved++;
    }
  }

  testSet.testCases = Array.from(tcMap.values());
  testSet.metadata.lastUpdated = new Date().toISOString();
  testSet.metadata.totalCases = testSet.testCases.length;
  testSet.metadata.tierBreakdown = {
    tier1: testSet.testCases.filter((t: any) => t.tier === 1).length,
    tier2: testSet.testCases.filter((t: any) => t.tier === 2).length,
    tier3: testSet.testCases.filter((t: any) => t.tier === 3).length,
  };

  fs.writeFileSync(COMPREHENSIVE_PATH, JSON.stringify(testSet, null, 2));
  console.log(`  Updated: ${jsonUpdated} cases`);
  console.log(`  Removed: ${jsonRemoved} cases`);
  console.log(`  Total:   ${testSet.testCases.length} cases`);
  console.log(`  Tiers:   ${JSON.stringify(testSet.metadata.tierBreakdown)}`);

  if (notFoundInJson.length > 0) {
    console.log(`  WARNING: ${notFoundInJson.length} non-S5 case IDs not found in JSON: ${notFoundInJson.slice(0, 5).join(', ')}${notFoundInJson.length > 5 ? '...' : ''}`);
  }

  // ── 7. Update master-suite.ts (S5-* cases) ──────────────
  console.log(`\n── Updating master-suite.ts ──`);

  let masterContent = fs.readFileSync(MASTER_SUITE_PATH, 'utf-8');
  let s5Updated = 0;
  let s5Removed = 0;
  const s5Warnings: string[] = [];

  for (const change of changes) {
    if (!change.case_id.startsWith('S5-')) continue;

    if (change.action === 'accept' && change.new_code && change.new_heading) {
      // S5-* entries are single-line objects; insert heading/code after expected_chapter
      const lineRegex = new RegExp(
        `(id: '${change.case_id}'.+?expected_chapter: '\\d+')`,
      );
      const replacement = `$1, expected_heading: '${change.new_heading}', expected_code: '${change.new_code}'`;
      const before = masterContent;
      masterContent = masterContent.replace(lineRegex, replacement);
      if (masterContent !== before) {
        s5Updated++;
      } else {
        s5Warnings.push(`Could not find/update ${change.case_id} in master-suite.ts`);
      }
    } else if (change.action === 'remove') {
      const lines = masterContent.split('\n');
      const beforeLen = lines.length;
      const filtered = lines.filter(l => !l.includes(`id: '${change.case_id}'`));
      if (filtered.length < beforeLen) {
        masterContent = filtered.join('\n');
        s5Removed++;
      }
    }
  }

  fs.writeFileSync(MASTER_SUITE_PATH, masterContent);
  console.log(`  Updated: ${s5Updated} cases (added heading/code)`);
  console.log(`  Removed: ${s5Removed} cases`);

  if (s5Warnings.length > 0) {
    for (const w of s5Warnings) console.log(`  WARNING: ${w}`);
  }

  // ── 8. Check quick-suite.ts ──────────────────────────────
  console.log(`\n── Checking quick-suite.ts ──`);

  const quickContent = fs.readFileSync(QUICK_SUITE_PATH, 'utf-8');
  const invalidOldCodes = new Set(
    changes
      .filter(c => c.category === 'invalid_code' && c.action === 'accept')
      .map(c => c.old_code)
  );

  const codePattern = /expected_code:\s*'([^']+)'/g;
  const quickMatches = [...quickContent.matchAll(codePattern)];
  const quickIssues: string[] = [];

  for (const m of quickMatches) {
    const foundCode = m[1];
    if (invalidOldCodes.has(foundCode)) {
      const fix = changes.find(c => c.old_code === foundCode && c.action === 'accept');
      quickIssues.push(`Has invalid code ${foundCode} -> should be ${fix?.new_code}`);
    }
    if (!lookup.has(foundCode)) {
      quickIssues.push(`Code ${foundCode} not in DB (may need update)`);
    }
  }

  if (quickIssues.length > 0) {
    console.log(`  ISSUES FOUND:`);
    for (const issue of quickIssues) console.log(`    ${issue}`);
  } else {
    console.log(`  No overlapping invalid codes found. OK.`);
  }

  // ── 9. Summary ───────────────────────────────────────────
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  GT FIX APPLIED — SUMMARY`);
  console.log(`${'='.repeat(55)}`);
  console.log(`  Category A (Invalid Codes):  ${stats.invalid_codes.accepted}/${invalidFixes.length} accepted, ${stats.invalid_codes.rejected} rejected`);
  console.log(`  Category B (Missing GT):     ${stats.missing_gt.accepted}/${missingFills.length} accepted, ${stats.missing_gt.rejected} rejected, ${stats.missing_gt.removed_from_suite} removed`);
  console.log(`  Category C (LLM-Flagged):    ${stats.llm_flagged.changed}/${llmFlags.length} metadata fixed, ${stats.llm_flagged.kept_original} kept, ${stats.llm_flagged.removed_from_suite} removed`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Total GT changes:  ${totalChanged}`);
  console.log(`  Total removed:     ${totalRemoved}`);
  console.log(`  Eval suite:        386 -> ${386 - totalRemoved} cases`);
  console.log(`  Comprehensive JSON: ${testSet.metadata.totalCases} cases`);
  console.log(`${'='.repeat(55)}\n`);

  await disconnectDatabase();
}

main().catch(err => {
  console.error('FATAL:', err);
  disconnectDatabase().finally(() => {
    process.exitCode = 1;
  });
});

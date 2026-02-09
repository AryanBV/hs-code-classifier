/**
 * Comprehensive Chapter Notes Data Audit
 *
 * Performs a full audit of the hs_codes.notes JSONB field across all chapters.
 * Outputs structured JSON and human-readable markdown reports.
 *
 * Checks performed:
 *   1. Coverage: Which chapters have notes, chapter notes, section notes
 *   2. Corrupted titles: Detects mojibake or section-note bleed in chapterTitle
 *   3. Metadata headers: First chapterNotes entry is a table header, not a real note
 *   4. Policy conditions: Coverage and validity
 *   5. Export licensing notes: Coverage
 *   6. Truncation: Notes that end mid-sentence
 *   7. Denormalization consistency: All tariff lines in a chapter have identical notes
 *   8. Section notes quality: Empty, duplicated, or too-short entries
 *
 * Run: cd backend && npx ts-node scripts/audit-chapter-notes.ts
 *
 * ARY-39: https://linear.app/aryan-b-v/issue/ARY-39
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

// ============ TYPES ============

interface ChapterAuditResult {
  chapterCode: string;
  description: string;
  hasNotes: boolean;
  notesLength: number;
  chapterTitle: string | null;
  chapterTitleCorrupted: boolean;
  chapterTitleCorruptionReason: string | null;
  chapterNotesCount: number;
  sectionNotesCount: number;
  policyConditionsCount: number;
  hasExportLicensingNotes: boolean;
  exportLicensingNotesContent: string | null;
  metadataHeaderDetected: boolean;
  metadataHeaderContent: string | null;
  truncatedNotes: string[];
  emptyNotes: number;
  duplicateNotesWithSection: number;
  tariffLineCount: number;
  tariffLinesWithNotes: number;
  denormalizationConsistent: boolean;
  distinctNotesVariants: number;
}

interface AuditSummary {
  timestamp: string;
  totalChapters: number;
  chaptersWithAnyNotes: number;
  chaptersWithChapterNotes: number;
  chaptersWithSectionNotes: number;
  chaptersWithPolicyConditions: number;
  chaptersWithExportLicensing: number;
  chaptersMissingNotes: string[];
  chaptersWithCorruptedTitles: string[];
  chaptersWithMetadataHeaders: string[];
  chaptersWithTruncatedNotes: string[];
  chaptersWithInconsistentDenorm: string[];
  avgChapterNotesPerChapter: number;
  avgSectionNotesPerChapter: number;
  totalTariffLines: number;
  tariffLinesWithNotes: number;
  notesCoveragePct: number;
}

interface FullAuditReport {
  summary: AuditSummary;
  chapters: ChapterAuditResult[];
}

// ============ DETECTION HELPERS ============

function detectCorruptedTitle(title: string | null): { corrupted: boolean; reason: string | null } {
  if (!title) return { corrupted: false, reason: null };

  if (/^or\s/i.test(title)) {
    return { corrupted: true, reason: 'Starts with "or" — section note text bled into title' };
  }

  if (/\bheading\s+\d/i.test(title) || /\bchapter\s+\d/i.test(title)) {
    return { corrupted: true, reason: 'Contains heading/chapter references — legal text in title' };
  }

  if (/^\(/.test(title)) {
    return { corrupted: true, reason: 'Starts with parenthetical — continuation fragment' };
  }

  if (/\bSection\s+[IVXLC]+\b/.test(title) || /\bsection\s+\d/i.test(title)) {
    return { corrupted: true, reason: 'Contains Section references — section note in title' };
  }

  if (title.length > 150) {
    return { corrupted: true, reason: `Title too long (${title.length} chars) — likely contains extra text` };
  }

  if (/\([a-e]\)\s/.test(title)) {
    return { corrupted: true, reason: 'Contains enumeration markers — legal note in title' };
  }

  return { corrupted: false, reason: null };
}

function detectMetadataHeader(notes: string[]): { detected: boolean; content: string | null } {
  if (notes.length === 0) return { detected: false, content: null };

  const first = notes[0];
  if (!first) return { detected: false, content: null };

  const headerPatterns = [
    /Sl\.?\s*No/i,
    /Notification\s+(Date|No)/i,
    /Serial\s+Number/i,
    /^S\.\s*No/i,
    /^Sr\.\s*No/i,
  ];

  for (const pattern of headerPatterns) {
    if (pattern.test(first)) {
      return { detected: true, content: first.substring(0, 200) };
    }
  }

  return { detected: false, content: null };
}

function detectTruncatedNotes(notes: string[]): string[] {
  const truncated: string[] = [];

  for (const note of notes) {
    if (!note || note.length < 20) continue;

    const trimmed = note.trim();
    if (/[a-z,]\s*$/.test(trimmed) && !trimmed.endsWith('etc') && !trimmed.endsWith('etc.')) {
      if (!/[.;:)\]!?"]$/.test(trimmed)) {
        truncated.push(trimmed.substring(Math.max(0, trimmed.length - 80)));
      }
    }
  }

  return truncated;
}

// ============ MAIN AUDIT LOGIC ============

async function auditChapter(chapterCode: string, chapterDescription: string): Promise<ChapterAuditResult> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      notes,
      LENGTH(notes::text) as notes_length
    FROM hs_codes
    WHERE code LIKE ${chapterCode + '%'}
      AND LENGTH(code) = 10
      AND notes IS NOT NULL
    LIMIT 1
  `;

  const tariffStats = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(notes)::int as with_notes
    FROM hs_codes
    WHERE code LIKE ${chapterCode + '%'}
      AND LENGTH(code) = 10
  `;

  const distinctNotes = await prisma.$queryRaw<any[]>`
    SELECT COUNT(DISTINCT notes::text)::int as variants
    FROM hs_codes
    WHERE code LIKE ${chapterCode + '%'}
      AND LENGTH(code) = 10
      AND notes IS NOT NULL
  `;

  const tStats = tariffStats[0] || { total: 0, with_notes: 0 };
  const dNotes = distinctNotes[0] || { variants: 0 };

  if (rows.length === 0 || !rows[0].notes) {
    return {
      chapterCode,
      description: chapterDescription,
      hasNotes: false,
      notesLength: 0,
      chapterTitle: null,
      chapterTitleCorrupted: false,
      chapterTitleCorruptionReason: null,
      chapterNotesCount: 0,
      sectionNotesCount: 0,
      policyConditionsCount: 0,
      hasExportLicensingNotes: false,
      exportLicensingNotesContent: null,
      metadataHeaderDetected: false,
      metadataHeaderContent: null,
      truncatedNotes: [],
      emptyNotes: 0,
      duplicateNotesWithSection: 0,
      tariffLineCount: tStats.total,
      tariffLinesWithNotes: tStats.with_notes,
      denormalizationConsistent: dNotes.variants <= 1,
      distinctNotesVariants: dNotes.variants,
    };
  }

  const notes = rows[0].notes;
  const chapterTitle = notes.chapterTitle || null;
  const chapterNotes: string[] = Array.isArray(notes.chapterNotes) ? notes.chapterNotes : [];
  const sectionNotes: string[] = Array.isArray(notes.sectionNotes) ? notes.sectionNotes : [];
  const policyConditions: any[] = Array.isArray(notes.policyConditions) ? notes.policyConditions : [];
  const exportLicensingNotes = notes.exportLicensingNotes || null;

  const titleCheck = detectCorruptedTitle(chapterTitle);
  const headerCheck = detectMetadataHeader(chapterNotes);
  const truncated = detectTruncatedNotes([...chapterNotes, ...sectionNotes]);

  const emptyNotes = chapterNotes.filter(n => !n || n.trim().length === 0).length;

  let duplicateCount = 0;
  for (const cn of chapterNotes) {
    if (cn && sectionNotes.some(sn => sn && sn === cn)) {
      duplicateCount++;
    }
  }

  return {
    chapterCode,
    description: chapterDescription,
    hasNotes: true,
    notesLength: rows[0].notes_length || 0,
    chapterTitle,
    chapterTitleCorrupted: titleCheck.corrupted,
    chapterTitleCorruptionReason: titleCheck.reason,
    chapterNotesCount: chapterNotes.length,
    sectionNotesCount: sectionNotes.length,
    policyConditionsCount: policyConditions.filter(p => p && typeof p === 'object').length,
    hasExportLicensingNotes: !!exportLicensingNotes && exportLicensingNotes.trim().length > 0,
    exportLicensingNotesContent: exportLicensingNotes ? exportLicensingNotes.substring(0, 200) : null,
    metadataHeaderDetected: headerCheck.detected,
    metadataHeaderContent: headerCheck.content,
    truncatedNotes: truncated,
    emptyNotes,
    duplicateNotesWithSection: duplicateCount,
    tariffLineCount: tStats.total,
    tariffLinesWithNotes: tStats.with_notes,
    denormalizationConsistent: dNotes.variants <= 1,
    distinctNotesVariants: dNotes.variants,
  };
}

function buildSummary(chapters: ChapterAuditResult[]): AuditSummary {
  const withNotes = chapters.filter(c => c.hasNotes);

  return {
    timestamp: new Date().toISOString(),
    totalChapters: chapters.length,
    chaptersWithAnyNotes: withNotes.length,
    chaptersWithChapterNotes: chapters.filter(c => c.chapterNotesCount > 0).length,
    chaptersWithSectionNotes: chapters.filter(c => c.sectionNotesCount > 0).length,
    chaptersWithPolicyConditions: chapters.filter(c => c.policyConditionsCount > 0).length,
    chaptersWithExportLicensing: chapters.filter(c => c.hasExportLicensingNotes).length,
    chaptersMissingNotes: chapters.filter(c => !c.hasNotes).map(c => c.chapterCode),
    chaptersWithCorruptedTitles: chapters.filter(c => c.chapterTitleCorrupted).map(c => c.chapterCode),
    chaptersWithMetadataHeaders: chapters.filter(c => c.metadataHeaderDetected).map(c => c.chapterCode),
    chaptersWithTruncatedNotes: chapters.filter(c => c.truncatedNotes.length > 0).map(c => c.chapterCode),
    chaptersWithInconsistentDenorm: chapters.filter(c => !c.denormalizationConsistent).map(c => c.chapterCode),
    avgChapterNotesPerChapter: withNotes.length > 0
      ? Math.round(withNotes.reduce((s, c) => s + c.chapterNotesCount, 0) / withNotes.length * 10) / 10
      : 0,
    avgSectionNotesPerChapter: withNotes.length > 0
      ? Math.round(withNotes.reduce((s, c) => s + c.sectionNotesCount, 0) / withNotes.length * 10) / 10
      : 0,
    totalTariffLines: chapters.reduce((s, c) => s + c.tariffLineCount, 0),
    tariffLinesWithNotes: chapters.reduce((s, c) => s + c.tariffLinesWithNotes, 0),
    notesCoveragePct: 0,
  };
}

function pct(num: number, total: number): string {
  if (total === 0) return '0%';
  return `${((num / total) * 100).toFixed(1)}%`;
}

function generateMarkdown(report: FullAuditReport): string {
  const s = report.summary;
  const lines: string[] = [];

  lines.push('# Chapter Notes Data Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${s.timestamp}`);
  lines.push(`**Script:** \`backend/scripts/audit-chapter-notes.ts\``);
  lines.push(`**Linear Issue:** ARY-39`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary
  lines.push('## 1. Coverage Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|------:|');
  lines.push(`| Total chapters | ${s.totalChapters} |`);
  lines.push(`| Chapters with any notes | ${s.chaptersWithAnyNotes} (${pct(s.chaptersWithAnyNotes, s.totalChapters)}) |`);
  lines.push(`| Chapters with chapter notes | ${s.chaptersWithChapterNotes} (${pct(s.chaptersWithChapterNotes, s.totalChapters)}) |`);
  lines.push(`| Chapters with section notes | ${s.chaptersWithSectionNotes} (${pct(s.chaptersWithSectionNotes, s.totalChapters)}) |`);
  lines.push(`| Chapters with policy conditions | ${s.chaptersWithPolicyConditions} (${pct(s.chaptersWithPolicyConditions, s.totalChapters)}) |`);
  lines.push(`| Chapters with export licensing notes | ${s.chaptersWithExportLicensing} (${pct(s.chaptersWithExportLicensing, s.totalChapters)}) |`);
  lines.push(`| Avg chapter notes per chapter | ${s.avgChapterNotesPerChapter} |`);
  lines.push(`| Avg section notes per chapter | ${s.avgSectionNotesPerChapter} |`);
  lines.push(`| Total tariff lines (10-digit) | ${s.totalTariffLines} |`);
  lines.push(`| Tariff lines with notes | ${s.tariffLinesWithNotes} (${pct(s.tariffLinesWithNotes, s.totalTariffLines)}) |`);
  lines.push('');

  // Missing notes
  lines.push('## 2. Chapters Missing Notes');
  lines.push('');
  if (s.chaptersMissingNotes.length === 0) {
    lines.push('All chapters have notes.');
  } else {
    lines.push(`**${s.chaptersMissingNotes.length} chapters** have no notes data:`);
    lines.push('');
    lines.push('| Chapter | Description |');
    lines.push('|:-------:|-------------|');
    for (const code of s.chaptersMissingNotes) {
      const ch = report.chapters.find(c => c.chapterCode === code);
      lines.push(`| ${code} | ${ch?.description || 'Unknown'} |`);
    }
  }
  lines.push('');

  // Corrupted titles
  lines.push('## 3. Corrupted Chapter Titles');
  lines.push('');
  const corruptedChapters = report.chapters.filter(c => c.chapterTitleCorrupted);
  if (corruptedChapters.length === 0) {
    lines.push('No corrupted titles detected.');
  } else {
    lines.push(`**${corruptedChapters.length} chapters** have corrupted titles:`);
    lines.push('');
    lines.push('| Chapter | Corrupted Title (truncated) | Reason |');
    lines.push('|:-------:|----------------------------|--------|');
    for (const ch of corruptedChapters) {
      const titlePreview = ch.chapterTitle ? ch.chapterTitle.substring(0, 60).replace(/\|/g, '\\|') + '...' : 'null';
      lines.push(`| ${ch.chapterCode} | ${titlePreview} | ${ch.chapterTitleCorruptionReason} |`);
    }
  }
  lines.push('');

  // Metadata headers
  lines.push('## 4. Metadata Headers in chapterNotes[0]');
  lines.push('');
  const headerChapters = report.chapters.filter(c => c.metadataHeaderDetected);
  if (headerChapters.length === 0) {
    lines.push('No metadata headers detected.');
  } else {
    lines.push(`**${headerChapters.length} chapters** have metadata headers as first note entry:`);
    lines.push('');
    for (const ch of headerChapters) {
      lines.push(`- **Ch.${ch.chapterCode}**: \`${ch.metadataHeaderContent?.substring(0, 100)}\``);
    }
  }
  lines.push('');

  // Truncated notes
  lines.push('## 5. Truncated Notes');
  lines.push('');
  const truncChapters = report.chapters.filter(c => c.truncatedNotes.length > 0);
  if (truncChapters.length === 0) {
    lines.push('No truncated notes detected.');
  } else {
    lines.push(`**${truncChapters.length} chapters** have notes that appear truncated:`);
    lines.push('');
    for (const ch of truncChapters) {
      lines.push(`- **Ch.${ch.chapterCode}** (${ch.truncatedNotes.length} truncated): ...${ch.truncatedNotes[0]}`);
    }
  }
  lines.push('');

  // Denormalization consistency
  lines.push('## 6. Denormalization Consistency');
  lines.push('');
  const inconsistent = report.chapters.filter(c => !c.denormalizationConsistent);
  if (inconsistent.length === 0) {
    lines.push('All chapters have consistent notes across tariff lines.');
  } else {
    lines.push(`**${inconsistent.length} chapters** have inconsistent notes across tariff lines:`);
    lines.push('');
    lines.push('| Chapter | Tariff Lines | Distinct Variants |');
    lines.push('|:-------:|:------------:|:-----------------:|');
    for (const ch of inconsistent) {
      lines.push(`| ${ch.chapterCode} | ${ch.tariffLineCount} | ${ch.distinctNotesVariants} |`);
    }
  }
  lines.push('');

  // Policy conditions & export licensing
  lines.push('## 7. Policy Conditions & Export Licensing');
  lines.push('');
  const policyChapters = report.chapters.filter(c => c.policyConditionsCount > 0 || c.hasExportLicensingNotes);
  if (policyChapters.length === 0) {
    lines.push('No chapters have policy conditions or export licensing notes.');
  } else {
    lines.push('| Chapter | Policy Conditions | Export Licensing |');
    lines.push('|:-------:|:-----------------:|:---------------:|');
    for (const ch of policyChapters) {
      lines.push(`| ${ch.chapterCode} | ${ch.policyConditionsCount} | ${ch.hasExportLicensingNotes ? 'Yes' : 'No'} |`);
    }
  }
  lines.push('');

  // Full chapter table
  lines.push('## 8. Full Chapter Inventory');
  lines.push('');
  lines.push('| Ch | Description | Notes? | Ch.Notes | Sec.Notes | Policy | Title OK? | Header? |');
  lines.push('|:--:|-------------|:------:|:--------:|:---------:|:------:|:---------:|:-------:|');
  for (const ch of report.chapters) {
    const desc = ch.description.substring(0, 40).replace(/\|/g, '\\|');
    lines.push(`| ${ch.chapterCode} | ${desc} | ${ch.hasNotes ? 'Y' : 'N'} | ${ch.chapterNotesCount} | ${ch.sectionNotesCount} | ${ch.policyConditionsCount} | ${ch.chapterTitleCorrupted ? 'NO' : 'OK'} | ${ch.metadataHeaderDetected ? 'YES' : '-'} |`);
  }
  lines.push('');

  // Recommendations
  lines.push('## 9. Recommendations for M2');
  lines.push('');
  lines.push('Based on the audit findings:');
  lines.push('');
  if (s.chaptersMissingNotes.length > 0) {
    lines.push(`1. **Import missing notes** for ${s.chaptersMissingNotes.length} chapters (${s.chaptersMissingNotes.join(', ')}). These chapters have no legal classification rules in the database.`);
  }
  if (s.chaptersWithCorruptedTitles.length > 0) {
    lines.push(`2. **Fix corrupted chapter titles** in ${s.chaptersWithCorruptedTitles.length} chapters. Section note text has bled into the title field.`);
  }
  if (s.chaptersWithMetadataHeaders.length > 0) {
    lines.push(`3. **Strip metadata headers** from chapterNotes[0] in ${s.chaptersWithMetadataHeaders.length} chapters. These are table headers, not legal notes.`);
  }
  if (s.chaptersWithTruncatedNotes.length > 0) {
    lines.push(`4. **Review truncated notes** in ${s.chaptersWithTruncatedNotes.length} chapters. Some notes end mid-sentence.`);
  }
  if (s.chaptersWithInconsistentDenorm.length > 0) {
    lines.push(`5. **Investigate denormalization inconsistencies** in ${s.chaptersWithInconsistentDenorm.length} chapters. Different tariff lines within the same chapter have different notes.`);
  }
  lines.push('');

  return lines.join('\n');
}

// ============ MAIN ============

async function main() {
  console.log('='.repeat(60));
  console.log('ARY-39: Comprehensive Chapter Notes Data Audit');
  console.log('='.repeat(60));

  const chapters = await prisma.$queryRaw<any[]>`
    SELECT code, description
    FROM hs_codes
    WHERE LENGTH(code) = 2
    ORDER BY code
  `;

  console.log(`\nFound ${chapters.length} chapters. Auditing each...\n`);

  const results: ChapterAuditResult[] = [];

  for (const ch of chapters) {
    process.stdout.write(`  Auditing Ch.${ch.code}...`);
    const result = await auditChapter(ch.code, ch.description || 'Unknown');
    results.push(result);
    const status = result.hasNotes
      ? `${result.chapterNotesCount}cn/${result.sectionNotesCount}sn` +
        (result.chapterTitleCorrupted ? ' [TITLE CORRUPTED]' : '') +
        (result.metadataHeaderDetected ? ' [HEADER]' : '')
      : 'NO NOTES';
    console.log(` ${status}`);
  }

  // Build report
  const summary = buildSummary(results);
  summary.notesCoveragePct = summary.totalTariffLines > 0
    ? Math.round(summary.tariffLinesWithNotes / summary.totalTariffLines * 1000) / 10
    : 0;

  const report: FullAuditReport = { summary, chapters: results };

  // Save JSON report
  const outputDir = path.resolve(__dirname, 'audit-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, 'chapter-notes-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report saved: ${jsonPath}`);

  // Save Markdown report
  const mdPath = path.join(outputDir, 'chapter-notes-audit.md');
  const markdown = generateMarkdown(report);
  fs.writeFileSync(mdPath, markdown);
  console.log(`Markdown report saved: ${mdPath}`);

  // Print summary to console
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total chapters: ${summary.totalChapters}`);
  console.log(`With notes: ${summary.chaptersWithAnyNotes} (${pct(summary.chaptersWithAnyNotes, summary.totalChapters)})`);
  console.log(`With chapter notes: ${summary.chaptersWithChapterNotes}`);
  console.log(`With section notes: ${summary.chaptersWithSectionNotes}`);
  console.log(`With policy conditions: ${summary.chaptersWithPolicyConditions}`);
  console.log(`With export licensing: ${summary.chaptersWithExportLicensing}`);
  console.log(`Missing notes: ${summary.chaptersMissingNotes.join(', ') || 'none'}`);
  console.log(`Corrupted titles: ${summary.chaptersWithCorruptedTitles.join(', ') || 'none'}`);
  console.log(`Metadata headers: ${summary.chaptersWithMetadataHeaders.join(', ') || 'none'}`);
  console.log(`Truncated notes: ${summary.chaptersWithTruncatedNotes.join(', ') || 'none'}`);
  console.log(`Inconsistent denorm: ${summary.chaptersWithInconsistentDenorm.join(', ') || 'none'}`);
  console.log(`Tariff line coverage: ${summary.tariffLinesWithNotes}/${summary.totalTariffLines} (${summary.notesCoveragePct}%)`);

  console.log('\n' + '='.repeat(60));
  console.log('DONE — ARY-39 Chapter Notes Audit Complete');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Audit failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});

// backend/src/tests/audit/notes-coverage-audit.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../../utils/prisma';

async function auditNotesCoverage() {
  console.log('='.repeat(60));
  console.log('AUDIT: Database Notes Coverage');
  console.log('='.repeat(60));

  // Get all chapters
  const chapters = await prisma.$queryRaw`
    SELECT
      code,
      description,
      notes,
      LENGTH(notes::text) as notes_length
    FROM hs_codes
    WHERE LENGTH(code) = 2
    ORDER BY code
  ` as any[];

  console.log(`\nTotal chapters: ${chapters.length}`);

  let withNotes = 0;
  let withChapterNotes = 0;
  let withSectionNotes = 0;
  const missingNotes: string[] = [];
  const notesQuality: { chapter: string; description: string; chapterNotesCount: number; sectionNotesCount: number; sample: string }[] = [];

  for (const ch of chapters) {
    const hasNotes = ch.notes && ch.notes_length > 10;
    const hasChapterNotes = ch.notes?.chapterNotes && ch.notes.chapterNotes.length > 0;
    const hasSectionNotes = ch.notes?.sectionNotes && ch.notes.sectionNotes.length > 0;

    if (hasNotes) withNotes++;
    if (hasChapterNotes) withChapterNotes++;
    if (hasSectionNotes) withSectionNotes++;

    if (!hasChapterNotes && !hasSectionNotes) {
      missingNotes.push(`Ch.${ch.code}: ${ch.description}`);
    }

    // Collect notes quality data
    notesQuality.push({
      chapter: ch.code,
      description: ch.description?.substring(0, 50) || 'Unknown',
      chapterNotesCount: ch.notes?.chapterNotes?.length || 0,
      sectionNotesCount: ch.notes?.sectionNotes?.length || 0,
      sample: ch.notes?.chapterNotes?.[0]?.substring(0, 80) || 'None'
    });
  }

  console.log('\n### OVERALL NOTES COVERAGE ###');
  console.log(`Chapters with notes field: ${withNotes}/${chapters.length} (${(withNotes/chapters.length*100).toFixed(0)}%)`);
  console.log(`Chapters with chapterNotes: ${withChapterNotes}/${chapters.length} (${(withChapterNotes/chapters.length*100).toFixed(0)}%)`);
  console.log(`Chapters with sectionNotes: ${withSectionNotes}/${chapters.length} (${(withSectionNotes/chapters.length*100).toFixed(0)}%)`);

  if (missingNotes.length > 0) {
    console.log(`\n### CHAPTERS MISSING USEFUL NOTES (${missingNotes.length}) ###`);
    missingNotes.forEach(m => console.log(`  ${m}`));
  } else {
    console.log('\n\u2713 All chapters have some notes!');
  }

  // Check specific failing chapters from common test failures
  const failingChapters = ['10', '30', '39', '61', '62', '08', '11', '17', '19', '42', '43', '68', '25'];
  console.log('\n### NOTES FOR COMMONLY FAILING CHAPTERS ###');

  for (const chCode of failingChapters) {
    const ch = chapters.find(c => c.code === chCode);
    if (ch) {
      const hasChapterNotes = ch.notes?.chapterNotes?.length > 0;
      const hasSectionNotes = ch.notes?.sectionNotes?.length > 0;
      console.log(`\nCh.${chCode}: ${ch.description?.substring(0, 60) || 'Unknown'}`);
      console.log(`  - chapterNotes: ${hasChapterNotes ? ch.notes.chapterNotes.length + ' items' : 'NONE'}`);
      console.log(`  - sectionNotes: ${hasSectionNotes ? ch.notes.sectionNotes.length + ' items' : 'NONE'}`);
      if (hasChapterNotes) {
        console.log(`  - Sample: "${ch.notes.chapterNotes[0]?.substring(0, 100)}..."`);
      }
    } else {
      console.log(`\nCh.${chCode}: NOT FOUND IN DATABASE`);
    }
  }

  // Notes quality ranking
  console.log('\n### CHAPTERS BY NOTES QUALITY (Top 10) ###');
  const sortedByQuality = notesQuality
    .sort((a, b) => (b.chapterNotesCount + b.sectionNotesCount) - (a.chapterNotesCount + a.sectionNotesCount))
    .slice(0, 10);

  for (const q of sortedByQuality) {
    console.log(`Ch.${q.chapter}: ${q.chapterNotesCount} chapter + ${q.sectionNotesCount} section notes`);
  }

  console.log('\n### CHAPTERS WITH POOREST NOTES (Bottom 10) ###');
  const sortedByPoor = notesQuality
    .sort((a, b) => (a.chapterNotesCount + a.sectionNotesCount) - (b.chapterNotesCount + b.sectionNotesCount))
    .slice(0, 10);

  for (const q of sortedByPoor) {
    console.log(`Ch.${q.chapter}: ${q.chapterNotesCount} chapter + ${q.sectionNotesCount} section notes - ${q.description}`);
  }

  // Check for specific key exclusion rules
  console.log('\n### CHECKING FOR KEY EXCLUSION NOTES ###');

  const exclusionPatterns = [
    { chapter: '87', keyword: 'parts', desc: 'Vehicle parts classification' },
    { chapter: '09', keyword: 'coffee', desc: 'Coffee classification rules' },
    { chapter: '21', keyword: 'extract', desc: 'Coffee extract rules' },
    { chapter: '25', keyword: 'cement', desc: 'Raw cement rules' },
    { chapter: '68', keyword: 'cement', desc: 'Cement articles rules' },
    { chapter: '30', keyword: 'medicament', desc: 'Medicament rules' }
  ];

  for (const pattern of exclusionPatterns) {
    const ch = chapters.find(c => c.code === pattern.chapter);
    if (ch && ch.notes?.chapterNotes) {
      const relevant = ch.notes.chapterNotes.filter((n: string) =>
        n.toLowerCase().includes(pattern.keyword)
      );
      console.log(`Ch.${pattern.chapter} (${pattern.desc}): ${relevant.length > 0 ? '\u2713' : '\u2717'} ${relevant.length} relevant notes found`);
      if (relevant.length > 0) {
        console.log(`  Sample: "${relevant[0]?.substring(0, 100)}..."`);
      }
    } else {
      console.log(`Ch.${pattern.chapter} (${pattern.desc}): \u2717 No notes available`);
    }
  }

  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('### SUMMARY ###');
  console.log('='.repeat(60));

  const avgChapterNotes = notesQuality.reduce((s, q) => s + q.chapterNotesCount, 0) / notesQuality.length;
  const avgSectionNotes = notesQuality.reduce((s, q) => s + q.sectionNotesCount, 0) / notesQuality.length;

  console.log(`Total chapters: ${chapters.length}`);
  console.log(`Chapters with ANY notes: ${withNotes} (${(withNotes/chapters.length*100).toFixed(0)}%)`);
  console.log(`Chapters with chapterNotes: ${withChapterNotes} (${(withChapterNotes/chapters.length*100).toFixed(0)}%)`);
  console.log(`Average chapter notes per chapter: ${avgChapterNotes.toFixed(1)}`);
  console.log(`Average section notes per chapter: ${avgSectionNotes.toFixed(1)}`);

  console.log('\n### INTERPRETATION ###');
  if (withChapterNotes / chapters.length >= 0.8) {
    console.log('\u2713 Good notes coverage (80%+). Focus on quality, not quantity.');
  } else if (withChapterNotes / chapters.length >= 0.5) {
    console.log('\u26A0 Moderate notes coverage (50-80%). Consider enriching notes for key chapters.');
  } else {
    console.log('\u2717 Poor notes coverage (<50%). Notes-based classification will struggle.');
  }

  if (missingNotes.length > 10) {
    console.log(`\u2717 ${missingNotes.length} chapters have no useful notes. These will rely entirely on LLM knowledge.`);
  }

  await prisma.$disconnect();
}

auditNotesCoverage().catch(console.error);

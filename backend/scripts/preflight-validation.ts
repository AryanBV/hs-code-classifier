/**
 * Pre-flight validation: run the same strict + hierarchy checks as the load script,
 * WITHOUT touching the database. If this passes, the load script will too.
 *
 * Run: npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/preflight-validation.ts"
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');

const SECTIONS = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
]);

interface ExtractedChapter {
  chapter: string;
  section: string;
  title: string;
  headings: { heading: string; title: string; subheadings?: { subheading: string; title: string; tariff_lines?: { code: string }[] }[] }[];
}

function readJson(p: string): ExtractedChapter {
  return JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, '')) as ExtractedChapter;
}

function main(): void {
  const files = fs.readdirSync(EXTRACTED_DIR).filter((f) => /^chapter-\d{2}\.json$/i.test(f)).sort();
  let totalH = 0, totalSh = 0, totalTl = 0;
  let chaptersOk = 0, chaptersFailed = 0;
  const failures: { file: string; errors: string[] }[] = [];

  for (const f of files) {
    const data = readJson(path.join(EXTRACTED_DIR, f));
    const errors: string[] = [];

    // Strict
    if (!/^\d{2}$/.test(data.chapter)) errors.push(`bad chapter "${data.chapter}"`);
    if (!SECTIONS.has(data.section)) errors.push(`bad section "${data.section}"`);
    if (!data.title?.trim()) errors.push('empty title');
    if (!Array.isArray(data.headings) || data.headings.length === 0) errors.push('no headings');

    // Hierarchy
    let h = 0, sh = 0, tl = 0;
    for (const head of data.headings ?? []) {
      h += 1;
      if (!/^\d{4}$/.test(head.heading)) errors.push(`heading "${head.heading}" not 4-digit`);
      else if (!head.heading.startsWith(data.chapter)) errors.push(`heading "${head.heading}" wrong chapter prefix`);
      for (const subh of head.subheadings ?? []) {
        sh += 1;
        if (!/^\d{4}\.\d{2}$/.test(subh.subheading)) errors.push(`subheading "${subh.subheading}" not NNNN.NN`);
        else if (!subh.subheading.startsWith(head.heading)) errors.push(`subheading "${subh.subheading}" wrong heading prefix`);
        for (const t of subh.tariff_lines ?? []) {
          tl += 1;
          if (!/^\d{4}\.\d{2}\.\d{2}$/.test(t.code)) errors.push(`tariff_line "${t.code}" not NNNN.NN.NN`);
          else if (!t.code.startsWith(subh.subheading)) errors.push(`tariff_line "${t.code}" wrong subheading prefix`);
        }
      }
    }
    totalH += h; totalSh += sh; totalTl += tl;

    if (errors.length === 0) {
      chaptersOk += 1;
    } else {
      chaptersFailed += 1;
      failures.push({ file: f, errors });
    }
  }

  console.log('=== Pre-flight validation ===');
  console.log(`  chapters_ok:     ${chaptersOk} / ${files.length}`);
  console.log(`  chapters_failed: ${chaptersFailed}`);
  console.log(`  totals: ${totalH} headings, ${totalSh} subheadings, ${totalTl} tariff_lines`);

  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures.slice(0, 20)) {
      console.log(`    ${f.file}: ${f.errors.slice(0, 3).join('; ')}${f.errors.length > 3 ? ` ... +${f.errors.length - 3}` : ''}`);
    }
    process.exit(1);
  }
  console.log('\n  ✓ All chapters pass strict + hierarchy validation. Safe to load.');
}

main();

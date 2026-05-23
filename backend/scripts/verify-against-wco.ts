/**
 * Verify our extracted 6-digit subheadings against the WCO HS 2022 global standard.
 *
 * Inputs:
 *   - backend/data/extracted/chapter-NN.json (97 canonical files)
 *   - backend/data/wco-hs-2022-6digit.json   (5,394 WCO HS 2022 codes)
 *
 * Outputs (to console + backend/data/wco-verification-report.json):
 *   - Total subheadings in our extraction
 *   - Total in WCO
 *   - in_both (certified at 6-digit level)
 *   - ours_only_not_wco (must be all tagged `india_specific` after cleanup)
 *   - wco_only_not_ours (codes we may have missed)
 *   - per_chapter coverage table
 *
 * Run: npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/verify-against-wco.ts"
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');
const WCO_PATH = path.resolve(__dirname, '../data/wco-hs-2022-6digit.json');
const REPORT_PATH = path.resolve(__dirname, '../data/wco-verification-report.json');

interface OursSubheading { subheading: string; title: string; india_specific?: boolean; wco_2022_match?: boolean; tariff_lines: { code: string }[]; }
interface OursHeading { heading: string; subheadings: OursSubheading[]; }
interface OursChapter { chapter: string; headings: OursHeading[]; }
interface WcoCode { code: string; description: string; heading?: string; }

function readJsonBom<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, '')) as T;
}

interface Report {
  generated_at: string;
  totals: { ours: number; wco: number; in_both: number; agreement_pct: number };
  ours_only_not_wco: { code: string; title: string; chapter: string; india_specific: boolean }[];
  wco_only_not_ours: { code: string; description: string; heading: string | null }[];
  uncertified_ours_only_count: number;     // ours_only NOT tagged india_specific
  per_chapter: Record<string, { ours_sh: number; wco_sh: number; in_both: number; ours_only_uncertified: number }>;
}

function main(): void {
  // Load ours
  const oursSubs = new Map<string, { title: string; chapter: string; india_specific: boolean }>();
  for (const f of fs.readdirSync(EXTRACTED_DIR).sort()) {
    if (!/^chapter-\d{2}\.json$/i.test(f)) continue;
    const d = readJsonBom<OursChapter>(path.join(EXTRACTED_DIR, f));
    for (const h of d.headings) {
      for (const sh of h.subheadings) {
        oursSubs.set(sh.subheading, {
          title: sh.title,
          chapter: d.chapter,
          india_specific: sh.india_specific === true,
        });
      }
    }
  }

  // Load WCO
  const wcoData = readJsonBom<{ codes: WcoCode[] }>(WCO_PATH);
  const wcoCodes = new Map<string, { description: string; heading: string | null }>();
  for (const c of wcoData.codes) wcoCodes.set(c.code, { description: c.description, heading: c.heading ?? null });

  // Diff
  const oursOnly: Report['ours_only_not_wco'] = [];
  const wcoOnly: Report['wco_only_not_ours'] = [];
  let inBoth = 0;
  let uncertifiedOursOnly = 0;
  for (const [code, info] of oursSubs) {
    if (wcoCodes.has(code)) inBoth += 1;
    else {
      oursOnly.push({ code, title: info.title, chapter: info.chapter, india_specific: info.india_specific });
      if (!info.india_specific) uncertifiedOursOnly += 1;
    }
  }
  for (const [code, info] of wcoCodes) {
    if (!oursSubs.has(code)) wcoOnly.push({ code, description: info.description, heading: info.heading });
  }

  // Per-chapter
  const perChapter: Report['per_chapter'] = {};
  const chapters = new Set<string>();
  for (const v of oursSubs.values()) chapters.add(v.chapter);
  for (const ch of [...chapters].sort()) {
    const oursIn = [...oursSubs].filter(([, v]) => v.chapter === ch).map(([k]) => k);
    const wcoIn = [...wcoCodes].filter(([, v]) => v.heading?.startsWith(ch)).map(([k]) => k);
    const oursSet = new Set(oursIn);
    const wcoSet = new Set(wcoIn);
    let both = 0;
    for (const k of oursSet) if (wcoSet.has(k)) both += 1;
    const oursOnlyUncertified = oursIn.filter((k) => {
      const v = oursSubs.get(k);
      return v && !wcoSet.has(k) && !v.india_specific;
    }).length;
    perChapter[ch] = {
      ours_sh: oursSet.size,
      wco_sh: wcoSet.size,
      in_both: both,
      ours_only_uncertified: oursOnlyUncertified,
    };
  }

  const agreementPct = oursSubs.size > 0 ? (inBoth / oursSubs.size) * 100 : 0;
  const report: Report = {
    generated_at: new Date().toISOString(),
    totals: { ours: oursSubs.size, wco: wcoCodes.size, in_both: inBoth, agreement_pct: Number(agreementPct.toFixed(2)) },
    ours_only_not_wco: oursOnly.sort((a, b) => a.code.localeCompare(b.code)),
    wco_only_not_ours: wcoOnly.sort((a, b) => a.code.localeCompare(b.code)),
    uncertified_ours_only_count: uncertifiedOursOnly,
    per_chapter: perChapter,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  console.log('\n=== WCO HS 2022 Verification ===');
  console.log(`  ours subheadings:        ${oursSubs.size}`);
  console.log(`  WCO subheadings:         ${wcoCodes.size}`);
  console.log(`  in both:                 ${inBoth} (${agreementPct.toFixed(2)}%)`);
  console.log(`  ours-only (any):         ${oursOnly.length}`);
  console.log(`    of which india_specific tagged: ${oursOnly.length - uncertifiedOursOnly}`);
  console.log(`    UNCERTIFIED ours-only (not tagged, not in WCO): ${uncertifiedOursOnly}  ← these need review`);
  console.log(`  WCO-only (we missed):    ${wcoOnly.length}  ← codes potentially missing from our extraction`);
  console.log(`\n  report: ${REPORT_PATH}`);
  if (uncertifiedOursOnly > 0) {
    console.log(`\n  Uncertified ours-only subheadings (first 20):`);
    for (const o of oursOnly.filter((x) => !x.india_specific).slice(0, 20)) {
      console.log(`    ch-${o.chapter}  ${o.code}: ${o.title.slice(0, 70)}`);
    }
  }
}

main();

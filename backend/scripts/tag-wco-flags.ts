/**
 * For every subheading in the canonical JSONs, set `wco_2022_match` flag
 * based on whether the 6-digit code appears in the WCO HS 2022 list.
 *
 * Also tag the 5 PDF-verified India-retention codes from borderline-codes-verdict.json
 * as `india_specific: true` with a note explaining they're India retentions of
 * pre-HS-2022 subheadings.
 *
 * Idempotent.
 *
 * Run: npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/tag-wco-flags.ts"
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');
const WCO_PATH = path.resolve(__dirname, '../data/wco-hs-2022-6digit.json');
const VERDICT_PATH = path.resolve(__dirname, '../data/borderline-codes-verdict.json');

function readJsonBom<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, '')) as T;
}

function main(): void {
  const wco = readJsonBom<{ codes: { code: string }[] }>(WCO_PATH);
  const wcoSet = new Set(wco.codes.map((c) => c.code));

  const verdict = readJsonBom<{ set_a_ours_only: { code: string; reasoning: string }[] }>(VERDICT_PATH);
  const indiaRetentions = new Map<string, string>();
  for (const v of verdict.set_a_ours_only) {
    indiaRetentions.set(v.code, v.reasoning ?? 'India retention of pre-HS-2022 6-digit subheading (PDF-verified)');
  }

  let touched = 0, wcoMatchTrue = 0, wcoMatchFalse = 0, indiaTagged = 0;

  for (const f of fs.readdirSync(EXTRACTED_DIR).sort()) {
    if (!/^chapter-\d{2}\.json$/i.test(f)) continue;
    const fpath = path.join(EXTRACTED_DIR, f);
    const data = JSON.parse(fs.readFileSync(fpath, 'utf-8').replace(/^﻿/, ''));
    let changed = false;
    for (const h of data.headings ?? []) {
      for (const sh of h.subheadings ?? []) {
        const inWco = wcoSet.has(sh.subheading);
        const desiredWcoMatch = inWco;

        if (sh.wco_2022_match !== desiredWcoMatch) {
          sh.wco_2022_match = desiredWcoMatch;
          changed = true;
        }
        if (desiredWcoMatch) wcoMatchTrue += 1; else wcoMatchFalse += 1;

        // India-retention tagging (5 codes from verdict)
        if (indiaRetentions.has(sh.subheading)) {
          if (sh.india_specific !== true) {
            sh.india_specific = true;
            changed = true;
            indiaTagged += 1;
          }
          if (!sh.india_specific_note) {
            sh.india_specific_note = indiaRetentions.get(sh.subheading)!;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      fs.writeFileSync(fpath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      touched += 1;
    }
  }

  console.log(`  files touched:     ${touched}`);
  console.log(`  wco_2022_match=true:  ${wcoMatchTrue}`);
  console.log(`  wco_2022_match=false: ${wcoMatchFalse}`);
  console.log(`  newly india_specific tagged: ${indiaTagged}`);
}

main();

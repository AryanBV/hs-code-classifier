/**
 * Apply the verified verdict on the 10 ours-only 6-digit subheadings.
 *
 * Source of truth: backend/data/ours-only-verdict.json — produced by an agent that
 * read each chapter's source PDF and rendered pages as images to distinguish
 * heading-header captures (phantoms) from real India-specific policy entries.
 *
 * Actions:
 *   - Remove 8 PHANTOM_HEADING_HEADER subheadings (and their phantom NNNN.00.00 tariff lines):
 *       4409.00, 4415.00, 4419.00, 4420.00 (Ch.44)
 *       4703.00, 4704.00, 4707.00          (Ch.47)
 *       9705.00                            (Ch.97)
 *   - Tag 2 REAL_INDIA_NATIONAL subheadings as `india_specific: true`:
 *       3103.10 (Ch.31, Single Super Phosphate policy)
 *       8711.00 (Ch.87, Vintage motorcycles pre-1940)
 *
 * Idempotent: re-running produces no further changes.
 *
 * Run: npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/cleanup-phantom-subheadings.ts"
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');
const VERDICT_PATH = path.resolve(__dirname, '../data/ours-only-verdict.json');

interface Verdict {
  code: string;
  chapter: string;
  verdict: 'PHANTOM_HEADING_HEADER' | 'REAL_INDIA_NATIONAL' | 'OCR_ERROR' | 'AMBIGUOUS';
  decision: 'remove' | 'keep_as_india_specific' | 'manual_review';
  reasoning?: string;
  pdf_evidence?: string;
}

interface VerdictDoc { verdicts: Verdict[]; }

interface Note { number: string; text: string; }
interface TariffLine {
  code: string; description: string; unit?: string | null;
  export_policy?: string | null; policy_condition?: string | null;
}
interface Subheading {
  subheading: string; title: string; subheading_notes: Note[];
  tariff_lines: TariffLine[];
  india_specific?: boolean;
  wco_2022_match?: boolean;
  india_specific_note?: string;
}
interface Heading { heading: string; title: string; heading_notes: Note[]; subheadings: Subheading[]; }
interface ChapterDoc {
  chapter: string;
  policy_conditions: { condition_number: string | null; description: string; code: string | null }[];
  extraction_warnings?: string[];
  headings: Heading[];
  [k: string]: unknown;
}

function readJsonBom<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, '')) as T;
}

function writeJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function main(): void {
  const verdictDoc = readJsonBom<VerdictDoc>(VERDICT_PATH);
  const toRemove = new Map<string, Verdict>();   // chapter -> verdict (one per chapter for simplicity, expand if needed)
  const toTag = new Map<string, Verdict>();
  for (const v of verdictDoc.verdicts) {
    const key = `${v.chapter}|${v.code}`;
    if (v.decision === 'remove') toRemove.set(key, v);
    else if (v.decision === 'keep_as_india_specific') toTag.set(key, v);
  }
  console.log(`  ${toRemove.size} subheadings to REMOVE, ${toTag.size} to TAG as india_specific`);

  let removed = 0, tagged = 0, alreadyClean = 0;
  const affected: { chapter: string; action: string; code: string; detail: string }[] = [];

  // Group operations by chapter
  const allKeys = new Set([...toRemove.keys(), ...toTag.keys()]);
  const byChapter = new Map<string, { remove: string[]; tag: string[] }>();
  for (const key of allKeys) {
    const parts = key.split('|');
    const ch = parts[0]!;
    const code = parts[1]!;
    const entry = byChapter.get(ch) ?? { remove: [], tag: [] };
    if (toRemove.has(key)) entry.remove.push(code);
    else entry.tag.push(code);
    byChapter.set(ch, entry);
  }

  for (const [chapter, ops] of byChapter) {
    const fpath = path.join(EXTRACTED_DIR, `chapter-${chapter}.json`);
    if (!fs.existsSync(fpath)) {
      console.warn(`  ✗ ch-${chapter} not found at ${fpath}`);
      continue;
    }
    const data = readJsonBom<ChapterDoc>(fpath);
    let changed = false;

    // Removals
    for (const code of ops.remove) {
      for (const h of data.headings) {
        const before = h.subheadings.length;
        h.subheadings = h.subheadings.filter((s) => s.subheading !== code);
        if (h.subheadings.length < before) {
          removed += 1;
          changed = true;
          affected.push({ chapter, action: 'REMOVE', code, detail: `from heading ${h.heading}` });
        }
      }
    }

    // Tags
    for (const code of ops.tag) {
      for (const h of data.headings) {
        for (const sh of h.subheadings) {
          if (sh.subheading === code) {
            if (sh.india_specific === true && sh.wco_2022_match === false) {
              alreadyClean += 1;
              affected.push({ chapter, action: 'TAG (already)', code, detail: `from heading ${h.heading}` });
            } else {
              sh.india_specific = true;
              sh.wco_2022_match = false;
              const verdict = toTag.get(`${chapter}|${code}`);
              if (verdict?.reasoning) sh.india_specific_note = verdict.reasoning;
              tagged += 1;
              changed = true;
              affected.push({ chapter, action: 'TAG', code, detail: `from heading ${h.heading}` });
            }
          }
        }
      }
    }

    if (changed) {
      data.extraction_warnings = data.extraction_warnings ?? [];
      data.extraction_warnings.push(
        `[phantom-cleanup v2] Applied verdict from ours-only-verdict.json: removed ${ops.remove.length} phantom subheadings, tagged ${ops.tag.length} as india_specific.`,
      );
      writeJson(fpath, data);
    }
  }

  console.log(`\n  Summary:`);
  console.log(`    removed:       ${removed}`);
  console.log(`    tagged:        ${tagged}`);
  console.log(`    already_clean: ${alreadyClean}`);
  console.log(`\n  Actions:`);
  for (const a of affected) console.log(`    ch-${a.chapter}  ${a.action.padEnd(15)} ${a.code.padEnd(10)} ${a.detail}`);
}

main();

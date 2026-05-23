/**
 * Merge WCO HS chapter-notes patches into normalized chapter JSONs.
 *
 * Applies to outlier chapters whose Indian Schedule-2 PDFs had empty Notes columns:
 * Ch.50 Silk, Ch.53 Other Vegetable Textiles, Ch.64 Footwear, Ch.81 Other Base Metals.
 *
 * Patch files live at backend/data/wco-notes-patches/chapter-NN-notes.json
 * (produced by the WCO HMRC fetch subagent). They contain verbatim HS 2022 notes
 * from UK HMRC trade-tariff (canonical mirror of WCO HS).
 *
 * Merge rules (idempotent):
 *   - chapter_notes:           replace canonical with patch (canonical was empty)
 *   - section_notes:           replace if canonical empty; KEEP canonical otherwise
 *                              (sibling chapters in same section may have already captured)
 *   - chapter_subheading_notes: replace if canonical empty
 *   - definitions (new field): added at chapter level (Ch.64 only)
 *   - notes_sources:            new field listing each note's authoritative source
 *
 * Run AFTER normalize-extracted-chapters.ts has produced canonical files.
 *
 * Run: cd backend && npx ts-node scripts/apply-wco-patches.ts
 *
 * Phase 2c-patch.
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');
const PATCHES_DIR = path.resolve(__dirname, '../data/wco-notes-patches');
const OUTLIER_CHAPTERS = ['50', '53', '64', '81'];

interface Note {
  number: string;
  text: string;
}

interface Definition {
  term: string;
  text: string;
}

interface WcoPatch {
  chapter: string;
  source: string;
  fetched_at: string;
  chapter_notes?: Note[];
  section_notes?: Note[];
  subheading_notes?: Note[];
  definitions?: Definition[];
  fetch_warnings?: string[];
}

interface CanonicalChapter {
  chapter: string;
  chapter_notes: Note[];
  section_notes: Note[];
  chapter_subheading_notes: Note[];
  definitions?: Definition[];
  notes_sources?: Record<string, string>;
  [key: string]: unknown;
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function writeJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function main(): void {
  let merged = 0, skipped = 0;
  for (const chapter of OUTLIER_CHAPTERS) {
    const canonicalPath = path.join(EXTRACTED_DIR, `chapter-${chapter}.json`);
    const patchPath = path.join(PATCHES_DIR, `chapter-${chapter}-notes.json`);
    if (!fs.existsSync(canonicalPath)) {
      console.warn(`  ✗ ch-${chapter}: canonical missing at ${canonicalPath}`);
      skipped += 1;
      continue;
    }
    if (!fs.existsSync(patchPath)) {
      console.warn(`  ✗ ch-${chapter}: patch missing at ${patchPath}`);
      skipped += 1;
      continue;
    }
    const canonical = readJson<CanonicalChapter>(canonicalPath);
    const patch = readJson<WcoPatch>(patchPath);
    const fixes: string[] = [];

    if (patch.chapter_notes && patch.chapter_notes.length > 0) {
      if (canonical.chapter_notes.length === 0) {
        canonical.chapter_notes = patch.chapter_notes;
        fixes.push(`chapter_notes: 0 → ${patch.chapter_notes.length} (from WCO)`);
      } else {
        fixes.push(
          `chapter_notes: KEPT canonical (${canonical.chapter_notes.length}); WCO had ${patch.chapter_notes.length} (manual merge needed if PDF was wrong)`,
        );
      }
    }

    if (patch.section_notes && patch.section_notes.length > 0) {
      if (canonical.section_notes.length === 0) {
        canonical.section_notes = patch.section_notes;
        fixes.push(`section_notes: 0 → ${patch.section_notes.length} (from WCO)`);
      } else {
        fixes.push(`section_notes: KEPT canonical (${canonical.section_notes.length}); WCO had ${patch.section_notes.length}`);
      }
    }

    if (patch.subheading_notes && patch.subheading_notes.length > 0) {
      if (canonical.chapter_subheading_notes.length === 0) {
        canonical.chapter_subheading_notes = patch.subheading_notes;
        fixes.push(`chapter_subheading_notes: 0 → ${patch.subheading_notes.length} (from WCO)`);
      }
    }

    if (patch.definitions && patch.definitions.length > 0) {
      canonical.definitions = patch.definitions;
      fixes.push(`definitions: ${patch.definitions.length} added (legally-decisive Ch.${chapter} terms)`);
    }

    canonical.notes_sources = canonical.notes_sources ?? {};
    canonical.notes_sources.wco_patch_source = patch.source;
    canonical.notes_sources.wco_patch_fetched_at = patch.fetched_at;

    writeJson(canonicalPath, canonical);
    console.log(`  ✓ ch-${chapter}: ${fixes.join(' | ')}`);
    merged += 1;
  }
  console.log(`\n  merged: ${merged} / ${OUTLIER_CHAPTERS.length}, skipped: ${skipped}`);
}

main();

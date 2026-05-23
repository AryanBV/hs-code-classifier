/**
 * Load extracted chapter JSON files into the normalized HS schema.
 *
 * Reads `backend/data/extracted/chapter-NN.json` (97 canonical files, post-normalize
 * + WCO patches + phantom cleanup) and inserts them into the Phase 2f tables:
 *   sections, chapters, headings, subheadings, tariff_lines,
 *   chapter_exclusions, policy_conditions
 *
 * Strict validation:
 *   - Fails LOUDLY on missing critical keys (chapter, section, title, headings)
 *   - Validates code prefix consistency before INSERT (DB also checks via CHECK constraints)
 *   - Tracks expected row counts and reports per-chapter delta
 *
 * Idempotent: re-running upserts; chapter_exclusions/policy_conditions/tariff_lines
 * use delete-then-insert scoped to the chapter being processed.
 *
 * Run: cd backend && npx ts-node scripts/load-extracted-to-normalized.ts
 *
 * Phase 2f (extended with tariff_lines + WCO compliance flags).
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Prisma } from '@prisma/client';
import { prisma } from '../src/utils/prisma';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');

// Expected totals (post-cleanup; used for validation, not enforcement)
const EXPECTED = { chapters: 97, headings: 1232, subheadings: 5613, tariffLines: 12460 };

const SECTION_TITLES: Record<string, string> = {
  I: 'Live Animals; Animal Products',
  II: 'Vegetable Products',
  III: 'Animal or Vegetable Fats and Oils',
  IV: 'Prepared Foodstuffs; Beverages, Spirits, Vinegar; Tobacco',
  V: 'Mineral Products',
  VI: 'Products of the Chemical or Allied Industries',
  VII: 'Plastics and Articles thereof; Rubber and Articles thereof',
  VIII: 'Raw Hides and Skins, Leather, Furskins and Articles thereof',
  IX: 'Wood and Articles of Wood; Cork; Manufactures of Straw',
  X: 'Pulp of Wood; Paper and Paperboard',
  XI: 'Textiles and Textile Articles',
  XII: 'Footwear, Headgear, Umbrellas; Artificial Flowers',
  XIII: 'Articles of Stone, Plaster, Cement, Ceramics, Glass',
  XIV: 'Natural or Cultured Pearls, Precious Stones, Precious Metals',
  XV: 'Base Metals and Articles of Base Metal',
  XVI: 'Machinery and Mechanical Appliances; Electrical Equipment',
  XVII: 'Vehicles, Aircraft, Vessels and Associated Transport Equipment',
  XVIII: 'Optical, Photographic, Cinematographic, Measuring Instruments; Clocks; Musical Instruments',
  XIX: 'Arms and Ammunition; Parts and Accessories thereof',
  XX: 'Miscellaneous Manufactured Articles',
  XXI: "Works of Art, Collectors' Pieces and Antiques",
};

// ============================================================
// Types (canonical extracted JSON shape)
// ============================================================
interface ExtractedNote { number: string; text: string; notification_date?: string; notification_no?: string; }
interface ExtractedDefinition { term: string; text: string; }
interface ExtractedTariffLine {
  code: string;
  description: string;
  unit?: string | null;
  export_policy?: string | null;
  policy_condition?: string | null;
}
interface ExtractedSubheading {
  subheading: string;
  title: string;
  subheading_notes?: ExtractedNote[];
  tariff_lines?: ExtractedTariffLine[];
  india_specific?: boolean;
  wco_2022_match?: boolean;
  india_specific_note?: string;
}
interface ExtractedHeading {
  heading: string;
  title: string;
  heading_notes?: ExtractedNote[];
  subheadings?: ExtractedSubheading[];
}
interface ExtractedExclusion {
  excluded_product_text: string;
  redirects_to_chapter?: string | null;
  redirects_to_heading?: string | null;
  source_note_number?: string | null;
  source_note_text?: string | null;
}
interface ExtractedPolicyCondition {
  condition_number?: string | null;
  description: string;
  code?: string | null;
}
interface ExtractedChapter {
  chapter: string;
  section: string;
  title: string;
  source_pdf?: string | null;
  extracted_at?: string | null;
  extractor_model?: string | null;
  extraction_warnings?: string[];
  chapter_notes?: ExtractedNote[];
  section_notes?: ExtractedNote[];
  chapter_subheading_notes?: ExtractedNote[];
  supplementary_notes?: ExtractedNote[];
  export_licensing_notes?: ExtractedNote[];
  definitions?: ExtractedDefinition[];
  notes_sources?: Record<string, string>;
  exclusion_clauses?: ExtractedExclusion[];
  policy_conditions?: ExtractedPolicyCondition[];
  headings: ExtractedHeading[];
}

// ============================================================
// Helpers
// ============================================================
function readChapter(filePath: string): ExtractedChapter {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  return JSON.parse(raw) as ExtractedChapter;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

class LoadError extends Error {}

function strictRequire(file: string, chapter: ExtractedChapter): void {
  const errors: string[] = [];
  if (!chapter.chapter || !/^\d{2}$/.test(chapter.chapter)) {
    errors.push(`invalid chapter key: ${JSON.stringify(chapter.chapter)}`);
  }
  if (!chapter.section || !SECTION_TITLES[chapter.section]) {
    errors.push(`invalid section: ${JSON.stringify(chapter.section)}`);
  }
  if (!chapter.title || chapter.title.trim().length === 0) {
    errors.push('empty title');
  }
  if (!Array.isArray(chapter.headings) || chapter.headings.length === 0) {
    errors.push('no headings');
  }
  if (errors.length > 0) {
    throw new LoadError(`${file}: STRICT VALIDATION FAILED — ${errors.join('; ')}`);
  }
}

function validateHierarchy(file: string, chapter: ExtractedChapter): void {
  const errors: string[] = [];
  for (const h of chapter.headings) {
    if (!/^\d{4}$/.test(h.heading)) errors.push(`heading "${h.heading}" not 4-digit`);
    if (!h.heading.startsWith(chapter.chapter)) errors.push(`heading "${h.heading}" doesn't start with chapter "${chapter.chapter}"`);
    for (const sh of h.subheadings ?? []) {
      if (!/^\d{4}\.\d{2}$/.test(sh.subheading)) errors.push(`subheading "${sh.subheading}" not NNNN.NN`);
      else if (!sh.subheading.startsWith(h.heading)) errors.push(`subheading "${sh.subheading}" doesn't start with heading "${h.heading}"`);
      for (const tl of sh.tariff_lines ?? []) {
        if (!/^\d{4}\.\d{2}\.\d{2}$/.test(tl.code)) errors.push(`tariff_line "${tl.code}" not NNNN.NN.NN`);
        else if (!tl.code.startsWith(sh.subheading)) errors.push(`tariff_line "${tl.code}" doesn't start with subheading "${sh.subheading}"`);
      }
    }
  }
  if (errors.length > 0) {
    throw new LoadError(`${file}: HIERARCHY VALIDATION FAILED — ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` ... and ${errors.length - 5} more` : ''}`);
  }
}

interface LoadStats {
  chaptersLoaded: number;
  headings: number;
  subheadings: number;
  tariffLines: number;
  exclusions: number;
  policyConditions: number;
  warnings: string[];
  errors: string[];
}

// ============================================================
// Per-chapter load (single transaction per chapter)
// ============================================================
async function loadChapter(data: ExtractedChapter, stats: LoadStats, file: string, opts: { phase: 'hierarchy' | 'sidecars' }): Promise<void> {
  strictRequire(file, data);
  validateHierarchy(file, data);

  const sectionKey = data.section;
  const sectionTitle = SECTION_TITLES[sectionKey]!;
  const chapterKey = data.chapter;

  await prisma.$transaction(
    async (tx) => {
      if (opts.phase === 'hierarchy') {
      // 1. Section
      await tx.section.upsert({
        where: { section: sectionKey },
        create: { section: sectionKey, title: sectionTitle, notes: asJson(data.section_notes ?? []) },
        update: { title: sectionTitle, notes: asJson(data.section_notes ?? []) },
      });

      // 2. Chapter
      await tx.chapter.upsert({
        where: { chapter: chapterKey },
        create: {
          chapter: chapterKey,
          section: sectionKey,
          title: data.title,
          notes: asJson(data.chapter_notes ?? []),
          chapterSubheadingNotes: asJson(data.chapter_subheading_notes ?? []),
          supplementaryNotes: asJson(data.supplementary_notes ?? []),
          exportLicensingNotes: asJson(data.export_licensing_notes ?? []),
          definitions: asJson(data.definitions ?? []),
          extractionWarnings: asJson(data.extraction_warnings ?? []),
          notesSources: asJson(data.notes_sources ?? {}),
          sourcePdf: data.source_pdf ?? null,
          extractedAt: parseDateOrNull(data.extracted_at),
          verifiedAgainstWcoAt: new Date(),
        },
        update: {
          section: sectionKey,
          title: data.title,
          notes: asJson(data.chapter_notes ?? []),
          chapterSubheadingNotes: asJson(data.chapter_subheading_notes ?? []),
          supplementaryNotes: asJson(data.supplementary_notes ?? []),
          exportLicensingNotes: asJson(data.export_licensing_notes ?? []),
          definitions: asJson(data.definitions ?? []),
          extractionWarnings: asJson(data.extraction_warnings ?? []),
          notesSources: asJson(data.notes_sources ?? {}),
          sourcePdf: data.source_pdf ?? null,
          extractedAt: parseDateOrNull(data.extracted_at),
          verifiedAgainstWcoAt: new Date(),
        },
      });

      // 3. Headings + Subheadings + Tariff lines
      for (const h of data.headings) {
        await tx.heading.upsert({
          where: { heading: h.heading },
          create: { heading: h.heading, chapter: chapterKey, title: h.title, notes: asJson(h.heading_notes ?? []) },
          update: { chapter: chapterKey, title: h.title, notes: asJson(h.heading_notes ?? []) },
        });
        stats.headings += 1;

        for (const sh of h.subheadings ?? []) {
          await tx.subheading.upsert({
            where: { subheading: sh.subheading },
            create: {
              subheading: sh.subheading,
              heading: h.heading,
              title: sh.title,
              notes: asJson(sh.subheading_notes ?? []),
              indiaSpecific: sh.india_specific === true,
              wco2022Match: sh.wco_2022_match !== false,
              indiaSpecificNote: sh.india_specific_note ?? null,
            },
            update: {
              heading: h.heading,
              title: sh.title,
              notes: asJson(sh.subheading_notes ?? []),
              indiaSpecific: sh.india_specific === true,
              wco2022Match: sh.wco_2022_match !== false,
              indiaSpecificNote: sh.india_specific_note ?? null,
            },
          });
          stats.subheadings += 1;

          // Delete-then-insert tariff lines for this subheading (idempotent)
          await tx.tariffLine.deleteMany({ where: { subheading: sh.subheading } });
          const tlData = (sh.tariff_lines ?? []).map((tl) => ({
            code: tl.code,
            subheading: sh.subheading,
            description: tl.description,
            unit: tl.unit ?? null,
            exportPolicy: tl.export_policy ?? null,
            policyCondition: tl.policy_condition ?? null,
          }));
          if (tlData.length > 0) {
            await tx.tariffLine.createMany({ data: tlData });
            stats.tariffLines += tlData.length;
          }
        }
      }
      } // end phase=hierarchy

      if (opts.phase === 'sidecars') {
        // 4. Chapter exclusions (delete-then-insert)
        await tx.chapterExclusion.deleteMany({ where: { sourceChapter: chapterKey } });
        const exclusions = data.exclusion_clauses ?? [];
        if (exclusions.length > 0) {
          await tx.chapterExclusion.createMany({
            data: exclusions.map((e) => ({
              sourceChapter: chapterKey,
              excludedProductText: e.excluded_product_text,
              redirectsToChapter: e.redirects_to_chapter ?? null,
              redirectsToHeading: e.redirects_to_heading ?? null,
              sourceNoteNumber: e.source_note_number ?? null,
              sourceNoteText: e.source_note_text ?? null,
            })),
          });
          stats.exclusions += exclusions.length;
        }

        // 5. Policy conditions (delete chapter-scoped, recreate)
        await tx.policyCondition.deleteMany({ where: { chapter: chapterKey } });
        for (const pc of data.policy_conditions ?? []) {
          if (!pc.description) continue;
          const hasCode = !!pc.code;
          await tx.policyCondition.create({
            data: {
              chapter: hasCode ? null : chapterKey,
              code: hasCode ? (pc.code ?? null) : null,
              conditionNumber: pc.condition_number ?? null,
              description: pc.description,
            },
          });
          stats.policyConditions += 1;
        }
      }
    },
    { timeout: 60000 },
  );

  if (opts.phase === 'hierarchy') stats.chaptersLoaded += 1;
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  console.log(`[load-extracted] reading from ${EXTRACTED_DIR}`);
  const files = fs.readdirSync(EXTRACTED_DIR).filter((f) => /^chapter-\d{2}\.json$/i.test(f)).sort();

  if (files.length === 0) {
    console.error(`[load-extracted] FATAL: no chapter-NN.json files found. Aborting.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`[load-extracted] found ${files.length} chapter file(s)`);

  const stats: LoadStats = {
    chaptersLoaded: 0, headings: 0, subheadings: 0, tariffLines: 0,
    exclusions: 0, policyConditions: 0, warnings: [], errors: [],
  };

  // PASS 1: load hierarchy (sections, chapters, headings, subheadings, tariff_lines)
  // Skip exclusions/policy_conditions — their FK redirects can point to chapters
  // that haven't been loaded yet.
  console.log('\n[load-extracted] Pass 1: hierarchy (sections + chapters + headings + subheadings + tariff_lines)');
  for (const file of files) {
    const t0 = Date.now();
    try {
      const data = readChapter(path.join(EXTRACTED_DIR, file));
      await loadChapter(data, stats, file, { phase: 'hierarchy' });
      stats.chaptersLoaded += 0; // chaptersLoaded incremented inside; reset below for pass 2 not needed
      const ms = Date.now() - t0;
      const h = data.headings.length;
      const sh = data.headings.reduce((a, x) => a + (x.subheadings?.length ?? 0), 0);
      const tl = data.headings.reduce((a, x) => a + (x.subheadings?.reduce((b, y) => b + (y.tariff_lines?.length ?? 0), 0) ?? 0), 0);
      console.log(`  ✓ ${file} | ${h}h ${sh}sh ${tl}tl (${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`pass1 ${file}: ${msg}`);
      console.error(`  ✗ ${file} — ${msg}`);
    }
  }

  // PASS 2: chapter_exclusions + policy_conditions (FK redirects now resolvable)
  console.log('\n[load-extracted] Pass 2: chapter_exclusions + policy_conditions');
  for (const file of files) {
    const t0 = Date.now();
    try {
      const data = readChapter(path.join(EXTRACTED_DIR, file));
      const beforeExcl = stats.exclusions;
      const beforePc = stats.policyConditions;
      await loadChapter(data, stats, file, { phase: 'sidecars' });
      const dExcl = stats.exclusions - beforeExcl;
      const dPc = stats.policyConditions - beforePc;
      const ms = Date.now() - t0;
      console.log(`  ✓ ${file} | ${dExcl} excl, ${dPc} pol (${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`pass2 ${file}: ${msg}`);
      console.error(`  ✗ ${file} — ${msg}`);
    }
  }

  // Final validation: counts must match EXPECTED (within tolerance)
  console.log('\n=== Load Summary ===');
  console.log(`  chapters_loaded:    ${stats.chaptersLoaded.toString().padStart(5)} / ${EXPECTED.chapters} expected ${stats.chaptersLoaded === EXPECTED.chapters ? '✓' : '⚠'}`);
  console.log(`  headings:           ${stats.headings.toString().padStart(5)} / ${EXPECTED.headings} expected ${stats.headings === EXPECTED.headings ? '✓' : '⚠'}`);
  console.log(`  subheadings:        ${stats.subheadings.toString().padStart(5)} / ${EXPECTED.subheadings} expected ${stats.subheadings === EXPECTED.subheadings ? '✓' : '⚠'}`);
  console.log(`  tariff_lines:       ${stats.tariffLines.toString().padStart(5)} / ${EXPECTED.tariffLines} expected ${stats.tariffLines === EXPECTED.tariffLines ? '✓' : '⚠'}`);
  console.log(`  exclusions:         ${stats.exclusions}`);
  console.log(`  policy_conditions:  ${stats.policyConditions}`);

  if (stats.errors.length > 0) {
    console.error(`\n[load-extracted] ${stats.errors.length} error(s):`);
    for (const e of stats.errors) console.error(`  - ${e}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
  console.log('\n[load-extracted] ✓ all chapters loaded successfully');
}

main().catch(async (err) => {
  console.error('[load-extracted] FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});

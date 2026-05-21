/**
 * Load extracted chapter JSON files into the normalized HS schema.
 *
 * Reads `backend/data/extracted/chapter-NN.json` files produced by the
 * Phase 2b extraction pilot and upserts them into the Phase 2f tables:
 *   sections, chapters, headings, subheadings, chapter_exclusions, policy_conditions.
 *
 * Idempotent: re-running produces the same DB state.
 *   - Sections/chapters/headings/subheadings use upsert
 *   - chapter_exclusions and policy_conditions use delete-then-insert
 *     (scoped to the chapter being processed) so re-runs don't accumulate duplicates.
 *
 * Run: cd backend && npx ts-node scripts/load-extracted-to-normalized.ts
 *
 * Phase 2f.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Prisma } from '@prisma/client';
import { prisma } from '../src/utils/prisma';

// ============================================================
// Standard WCO section titles
// ============================================================
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
  XVIII:
    'Optical, Photographic, Cinematographic, Measuring Instruments; Clocks; Musical Instruments',
  XIX: 'Arms and Ammunition; Parts and Accessories thereof',
  XX: 'Miscellaneous Manufactured Articles',
  XXI: "Works of Art, Collectors' Pieces and Antiques",
};

// ============================================================
// Types matching the extracted chapter JSON shape
// ============================================================
interface ExtractedNote {
  number: string;
  text: string;
}

interface ExtractedTariffLine {
  code: string;
  description: string;
  unit?: string | null;
}

interface ExtractedSubheading {
  subheading: string;
  title: string;
  subheading_notes?: ExtractedNote[];
  tariff_lines?: ExtractedTariffLine[];
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
  title: string;
  section: string;
  chapter_notes?: ExtractedNote[];
  section_notes?: ExtractedNote[];
  exclusion_clauses?: ExtractedExclusion[];
  headings?: ExtractedHeading[];
  policy_conditions?: ExtractedPolicyCondition[];
  source_pdf?: string | null;
  extracted_at?: string | null;
}

// ============================================================
// Helpers
// ============================================================
const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');

function listChapterFiles(): string[] {
  if (!fs.existsSync(EXTRACTED_DIR)) {
    return [];
  }
  return fs
    .readdirSync(EXTRACTED_DIR)
    .filter((f) => /^chapter-\d{2}\.json$/i.test(f))
    .sort();
}

function readChapter(file: string): ExtractedChapter {
  const full = path.join(EXTRACTED_DIR, file);
  const raw = fs.readFileSync(full, 'utf-8');
  return JSON.parse(raw) as ExtractedChapter;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Convert an array of notes into a Prisma-acceptable JSON value.
// Prisma's `Json` columns require `InputJsonValue`, which doesn't structurally
// match our typed interfaces — so we serialize through JSON.parse(JSON.stringify(...)).
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

interface LoadStats {
  chaptersLoaded: number;
  headings: number;
  subheadings: number;
  exclusions: number;
  policyConditions: number;
  warnings: string[];
}

// ============================================================
// Per-chapter load (single transaction)
// ============================================================
async function loadChapter(data: ExtractedChapter, stats: LoadStats, file: string): Promise<void> {
  const sectionKey = data.section?.trim();
  if (!sectionKey) {
    stats.warnings.push(`${file}: missing "section" field — skipped`);
    return;
  }
  const sectionTitle = SECTION_TITLES[sectionKey];
  if (!sectionTitle) {
    stats.warnings.push(
      `${file}: unknown section "${sectionKey}" — not in WCO standard title map; skipped`,
    );
    return;
  }

  const chapterKey = data.chapter?.trim();
  if (!chapterKey) {
    stats.warnings.push(`${file}: missing "chapter" field — skipped`);
    return;
  }

  const sectionNotes = data.section_notes ?? [];
  const chapterNotes = data.chapter_notes ?? [];
  const headings = data.headings ?? [];
  const exclusions = data.exclusion_clauses ?? [];
  const policyConditions = data.policy_conditions ?? [];

  await prisma.$transaction(async (tx) => {
    // 1. Upsert section
    await tx.section.upsert({
      where: { section: sectionKey },
      create: {
        section: sectionKey,
        title: sectionTitle,
        notes: asJson(sectionNotes),
      },
      update: {
        title: sectionTitle,
        notes: asJson(sectionNotes),
      },
    });

    // 2. Upsert chapter
    await tx.chapter.upsert({
      where: { chapter: chapterKey },
      create: {
        chapter: chapterKey,
        section: sectionKey,
        title: data.title ?? '',
        notes: asJson(chapterNotes),
        sourcePdf: data.source_pdf ?? null,
        extractedAt: parseDateOrNull(data.extracted_at),
      },
      update: {
        section: sectionKey,
        title: data.title ?? '',
        notes: asJson(chapterNotes),
        sourcePdf: data.source_pdf ?? null,
        extractedAt: parseDateOrNull(data.extracted_at),
      },
    });

    // 3. Upsert headings + subheadings
    for (const h of headings) {
      const headingKey = h.heading?.trim();
      if (!headingKey) continue;

      await tx.heading.upsert({
        where: { heading: headingKey },
        create: {
          heading: headingKey,
          chapter: chapterKey,
          title: h.title ?? '',
          notes: asJson(h.heading_notes ?? []),
        },
        update: {
          chapter: chapterKey,
          title: h.title ?? '',
          notes: asJson(h.heading_notes ?? []),
        },
      });
      stats.headings += 1;

      for (const sh of h.subheadings ?? []) {
        const subKey = sh.subheading?.trim();
        if (!subKey) continue;

        await tx.subheading.upsert({
          where: { subheading: subKey },
          create: {
            subheading: subKey,
            heading: headingKey,
            title: sh.title ?? '',
            notes: asJson(sh.subheading_notes ?? []),
          },
          update: {
            heading: headingKey,
            title: sh.title ?? '',
            notes: asJson(sh.subheading_notes ?? []),
          },
        });
        stats.subheadings += 1;
      }
    }

    // 4. Replace chapter exclusions for this chapter
    await tx.chapterExclusion.deleteMany({ where: { sourceChapter: chapterKey } });
    if (exclusions.length > 0) {
      await tx.chapterExclusion.createMany({
        data: exclusions.map((e) => ({
          sourceChapter: chapterKey,
          excludedProductText: e.excluded_product_text ?? '',
          redirectsToChapter: e.redirects_to_chapter ?? null,
          redirectsToHeading: e.redirects_to_heading ?? null,
          sourceNoteNumber: e.source_note_number ?? null,
          sourceNoteText: e.source_note_text ?? null,
        })),
      });
      stats.exclusions += exclusions.length;
    }

    // 5. Replace policy conditions for this chapter
    //    Policies scoped to this chapter (chapter=chapterKey) are removed;
    //    code-scoped policies under this chapter are NOT in scope here (we
    //    only delete the chapter-scoped ones we own).
    await tx.policyCondition.deleteMany({ where: { chapter: chapterKey } });

    for (const pc of policyConditions) {
      if (!pc.description) continue;
      const hasCode = !!pc.code;
      // Schema CHECK constraint: exactly one of (chapter, code) must be set.
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
  });

  stats.chaptersLoaded += 1;
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  console.log(`[load-extracted] reading from ${EXTRACTED_DIR}`);
  const files = listChapterFiles();

  if (files.length === 0) {
    console.warn(
      `[load-extracted] WARNING: no chapter-NN.json files found in ${EXTRACTED_DIR}. Nothing to load.`,
    );
    await prisma.$disconnect();
    return;
  }

  console.log(`[load-extracted] found ${files.length} chapter file(s)`);

  const stats: LoadStats = {
    chaptersLoaded: 0,
    headings: 0,
    subheadings: 0,
    exclusions: 0,
    policyConditions: 0,
    warnings: [],
  };

  for (const file of files) {
    try {
      const data = readChapter(file);
      const startedAt = Date.now();
      await loadChapter(data, stats, file);
      const ms = Date.now() - startedAt;
      console.log(
        `  ✓ ${file} — chapter ${data.chapter} | ${data.headings?.length ?? 0} headings, ` +
          `${(data.exclusion_clauses ?? []).length} exclusions (${ms}ms)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.warnings.push(`${file}: ${msg}`);
      console.error(`  ✗ ${file} — ${msg}`);
    }
  }

  console.log('\n[load-extracted] summary');
  console.log(`  chapters loaded:    ${stats.chaptersLoaded}`);
  console.log(`  headings upserted:  ${stats.headings}`);
  console.log(`  subheadings:        ${stats.subheadings}`);
  console.log(`  exclusions:         ${stats.exclusions}`);
  console.log(`  policy conditions:  ${stats.policyConditions}`);
  if (stats.warnings.length > 0) {
    console.log(`  warnings (${stats.warnings.length}):`);
    for (const w of stats.warnings) console.log(`    - ${w}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[load-extracted] fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});

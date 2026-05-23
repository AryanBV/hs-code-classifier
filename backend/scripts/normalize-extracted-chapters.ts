/**
 * Consolidate + normalize all 97 extracted chapter JSONs into a single
 * staging directory at `backend/data/extracted/`, applying schema fixes
 * for drift across the per-chapter worktrees.
 *
 * Sources:
 *   - 91 chapters from `C:\Export Business\hs-classifier-wt\ch-NN\backend\data\extracted\chapter-NN.json`
 *   - 4 pilot chapters (09, 30, 39, 87) from `feat/phase-2b-extraction-pilot` branch via git show
 *   - 2 chapters (48, 93) without local worktrees from `feat/phase-2c/chapter-NN` via git show
 *
 * Drift fixes:
 *   - Ch.90 wrong field names: chapter_title -> title, drop section_title, note_number -> number
 *   - Defaults for missing optional canonical keys (policy_conditions=[], extracted_at=today, etc.)
 *   - Preserve top-level subheading_notes, supplementary_notes, export_licensing_notes
 *     (canonical extras — kept at chapter level for load-script extension)
 *
 * Validates:
 *   - Required keys: chapter (NN), section (Roman), title (non-empty), headings (array)
 *   - Heading codes: 4-digit, prefixed with chapter
 *   - Subheading codes: NNNN.NN, prefixed with heading
 *   - Tariff line codes: NNNN.NN.NN, prefixed with subheading
 *
 * Idempotent: re-running produces same canonical files.
 *
 * Run: cd backend && npx ts-node scripts/normalize-extracted-chapters.ts
 *
 * Phase 2c-consolidate (precursor to Phase 2f load).
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================
// Config
// ============================================================
const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKTREE_BASE = 'C:/Export Business/hs-classifier-wt';
const OUTPUT_DIR = path.resolve(__dirname, '../data/extracted');

const ALL_CHAPTERS: string[] = [];
for (let i = 1; i <= 98; i++) {
  if (i === 77) continue; // reserved in HS
  ALL_CHAPTERS.push(String(i).padStart(2, '0'));
}

// Pilot chapters (extracted on phase-2b branch, no worktree)
const PILOT_CHAPTERS = new Set(['09', '30', '39', '87']);
const PILOT_BRANCH = 'feat/phase-2b-extraction-pilot';

const ROMAN_SECTIONS = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
]);

// ============================================================
// Canonical types
// ============================================================
interface Note {
  number: string;
  text: string;
  notification_date?: string;
  notification_no?: string;
}

interface TariffLine {
  code: string;
  description: string;
  unit?: string | null;
  export_policy?: string | null;       // additive: "Free" | "Restricted" | "Prohibited"
  policy_condition?: string | null;    // additive: per-line condition text
}

interface Subheading {
  subheading: string;
  title: string;
  subheading_notes: Note[];
  tariff_lines: TariffLine[];
}

interface Heading {
  heading: string;
  title: string;
  heading_notes: Note[];
  subheadings: Subheading[];
}

interface Exclusion {
  excluded_product_text: string;
  redirects_to_chapter: string | null;
  redirects_to_heading: string | null;
  source_note_number: string | null;
  source_note_text: string | null;
}

interface PolicyCondition {
  condition_number: string | null;
  description: string;
  code: string | null;
}

interface CanonicalChapter {
  chapter: string;
  section: string;
  title: string;
  source_pdf: string | null;
  extracted_at: string | null;
  extractor_model: string | null;
  extraction_warnings: string[];
  chapter_notes: Note[];
  section_notes: Note[];
  chapter_subheading_notes: Note[];    // chapter-wide subheading interpretation rules
  supplementary_notes: Note[];          // India-specific tariff-item clarifications
  export_licensing_notes: Note[];       // chapter-specific export policy clarifications
  exclusion_clauses: Exclusion[];
  policy_conditions: PolicyCondition[];
  headings: Heading[];
}

// ============================================================
// Helpers
// ============================================================
function loadFromWorktree(chapter: string): unknown | null {
  const p = path.join(WORKTREE_BASE, `ch-${chapter}`, 'backend/data/extracted', `chapter-${chapter}.json`);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function loadFromGitShow(chapter: string, branch: string): unknown | null {
  try {
    const raw = execSync(
      `git show ${branch}:backend/data/extracted/chapter-${chapter}.json`,
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function locateChapter(chapter: string): { source: string; data: unknown } | null {
  if (PILOT_CHAPTERS.has(chapter)) {
    const d = loadFromGitShow(chapter, PILOT_BRANCH);
    if (d) return { source: `git:${PILOT_BRANCH}`, data: d };
  }
  const wt = loadFromWorktree(chapter);
  if (wt) return { source: `worktree:ch-${chapter}`, data: wt };
  const gs = loadFromGitShow(chapter, `feat/phase-2c/chapter-${chapter}`);
  if (gs) return { source: `git:feat/phase-2c/chapter-${chapter}`, data: gs };
  return null;
}

// ============================================================
// Normalization
// ============================================================
interface DriftRecord {
  chapter: string;
  source: string;
  fixes: string[];
  warnings: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeNote(raw: unknown, drift: DriftRecord, where: string): Note | null {
  if (!isObject(raw)) return null;
  let number: string | null = null;
  if (typeof raw.number === 'string') number = raw.number;
  else if (typeof raw.note_number === 'string') {
    number = raw.note_number;
    drift.fixes.push(`${where}: renamed note_number -> number`);
  } else if (typeof raw.number === 'number') {
    number = String(raw.number);
  }
  const text = typeof raw.text === 'string' ? raw.text : null;
  if (number === null || text === null) {
    drift.warnings.push(`${where}: dropped malformed note (missing number/text)`);
    return null;
  }
  const note: Note = { number, text };
  if (typeof raw.notification_date === 'string') note.notification_date = raw.notification_date;
  if (typeof raw.notification_no === 'string') note.notification_no = raw.notification_no;
  return note;
}

function normalizeNotes(raw: unknown, drift: DriftRecord, where: string): Note[] {
  const out: Note[] = [];
  for (const item of asArray<unknown>(raw)) {
    const n = normalizeNote(item, drift, where);
    if (n) out.push(n);
  }
  return out;
}

function normalizeTariffLine(raw: unknown, drift: DriftRecord, where: string): TariffLine | null {
  if (!isObject(raw)) return null;
  const code = asString(raw.code);
  const description = asString(raw.description);
  if (!code || !description) {
    drift.warnings.push(`${where}: dropped tariff_line (missing code/description)`);
    return null;
  }
  const unit = typeof raw.unit === 'string' ? raw.unit : null;
  const export_policy = asString(raw.export_policy);
  const policy_condition = asString(raw.policy_condition);
  return { code, description, unit, export_policy, policy_condition };
}

function normalizeSubheading(raw: unknown, drift: DriftRecord, where: string): Subheading | null {
  if (!isObject(raw)) return null;
  // Accept variant keys: subheading_code, code (alias), description (alias for title)
  let subheading = asString(raw.subheading);
  if (!subheading && typeof raw.subheading_code === 'string') {
    subheading = raw.subheading_code;
    drift.fixes.push(`${where}: renamed subheading_code -> subheading`);
  }
  if (!subheading && typeof raw.code === 'string' && /^\d{4}\.\d{2}$/.test(raw.code)) {
    subheading = raw.code;
    drift.fixes.push(`${where}: renamed code -> subheading (NNNN.NN form)`);
  }
  let title = asString(raw.title);
  if (title === null && typeof raw.description === 'string') {
    title = raw.description;
    drift.fixes.push(`${where}: renamed description -> title`);
  }
  if (!subheading || title === null) {
    drift.warnings.push(`${where}: dropped subheading (missing subheading/title)`);
    return null;
  }
  const subheading_notes_raw = raw.subheading_notes ?? raw.sub_heading_notes;
  if (raw.sub_heading_notes !== undefined && raw.subheading_notes === undefined) {
    drift.fixes.push(`${where}: renamed sub_heading_notes -> subheading_notes`);
  }
  const subheading_notes = normalizeNotes(subheading_notes_raw, drift, `${where}.subheading_notes`);
  const tariff_lines: TariffLine[] = [];
  for (const t of asArray<unknown>(raw.tariff_lines)) {
    const tl = normalizeTariffLine(t, drift, `${where}.tariff_lines`);
    if (tl) tariff_lines.push(tl);
  }
  return { subheading, title, subheading_notes, tariff_lines };
}

function normalizeHeading(raw: unknown, drift: DriftRecord, where: string): Heading | null {
  if (!isObject(raw)) return null;
  // Accept variant keys: heading_code, code (alias), description (alias for title)
  let heading = asString(raw.heading);
  if (!heading && typeof raw.heading_code === 'string') {
    heading = raw.heading_code;
    drift.fixes.push(`${where}: renamed heading_code -> heading`);
  }
  if (!heading && typeof raw.code === 'string' && /^\d{4}$/.test(raw.code)) {
    heading = raw.code;
    drift.fixes.push(`${where}: renamed code -> heading (4-digit form)`);
  }
  let title = asString(raw.title);
  if (title === null && typeof raw.description === 'string') {
    title = raw.description;
    drift.fixes.push(`${where}: renamed description -> title`);
  }
  if (!heading || title === null) {
    drift.warnings.push(`${where}: dropped heading (missing heading/title)`);
    return null;
  }
  const heading_notes = normalizeNotes(raw.heading_notes, drift, `${where}.heading_notes`);
  const subheadings: Subheading[] = [];
  for (const s of asArray<unknown>(raw.subheadings)) {
    const sh = normalizeSubheading(s, drift, `${where}.subheadings`);
    if (sh) subheadings.push(sh);
  }
  return { heading, title, heading_notes, subheadings };
}

function normalizeExclusion(raw: unknown, drift: DriftRecord, where: string): Exclusion | null {
  if (!isObject(raw)) return null;
  const excluded_product_text = asString(raw.excluded_product_text);
  if (!excluded_product_text) {
    drift.warnings.push(`${where}: dropped exclusion (missing excluded_product_text)`);
    return null;
  }
  return {
    excluded_product_text,
    redirects_to_chapter: asString(raw.redirects_to_chapter),
    redirects_to_heading: asString(raw.redirects_to_heading),
    source_note_number: asString(raw.source_note_number),
    source_note_text: asString(raw.source_note_text),
  };
}

function normalizePolicyCondition(raw: unknown, drift: DriftRecord, where: string): PolicyCondition | null {
  if (!isObject(raw)) return null;
  const description = asString(raw.description);
  if (!description) {
    drift.warnings.push(`${where}: dropped policy_condition (missing description)`);
    return null;
  }
  return {
    condition_number: asString(raw.condition_number),
    description,
    code: asString(raw.code),
  };
}

function normalizeChapter(raw: unknown, chapter: string, source: string): {
  canonical: CanonicalChapter | null;
  drift: DriftRecord;
} {
  const drift: DriftRecord = { chapter, source, fixes: [], warnings: [] };
  if (!isObject(raw)) {
    drift.warnings.push('top-level not an object');
    return { canonical: null, drift };
  }

  const chapterKey = asString(raw.chapter);
  if (!chapterKey || !/^\d{2}$/.test(chapterKey)) {
    drift.warnings.push(`invalid chapter key: ${JSON.stringify(raw.chapter)}`);
    return { canonical: null, drift };
  }
  if (chapterKey !== chapter) {
    drift.warnings.push(`chapter key mismatch: file says "${chapterKey}", expected "${chapter}"`);
    // Trust file value (may indicate mislabeled file but more often is correct)
  }

  // Title — handle Ch.90's chapter_title drift
  let title = asString(raw.title);
  if (!title && typeof raw.chapter_title === 'string') {
    title = raw.chapter_title;
    drift.fixes.push('renamed chapter_title -> title');
  }
  if (!title) {
    drift.warnings.push('missing title');
    title = '';
  }

  const section = asString(raw.section);
  if (!section || !ROMAN_SECTIONS.has(section)) {
    drift.warnings.push(`invalid section: ${JSON.stringify(raw.section)}`);
    return { canonical: null, drift };
  }

  // Headings
  const headings: Heading[] = [];
  for (const h of asArray<unknown>(raw.headings)) {
    const head = normalizeHeading(h, drift, `headings`);
    if (head) headings.push(head);
  }
  if (headings.length === 0) {
    drift.warnings.push('no headings extracted');
  }

  // Drift detection — record what we found
  const knownCanonicalKeys = new Set([
    'chapter', 'section', 'title', 'source_pdf', 'extracted_at', 'extractor_model',
    'extraction_warnings', 'chapter_notes', 'section_notes', 'subheading_notes',
    'chapter_subheading_notes', 'supplementary_notes', 'export_licensing_notes',
    'exclusion_clauses', 'policy_conditions', 'headings',
  ]);
  const knownLegacyKeys = new Set([
    'chapter_title', 'section_title', 'note_number',
    'heading_code', 'subheading_code', 'description', 'sub_heading_notes',
    'code', 'main_notes',
  ]);
  for (const key of Object.keys(raw)) {
    if (!knownCanonicalKeys.has(key) && !knownLegacyKeys.has(key)) {
      drift.warnings.push(`unknown top-level key (preserved as-is dropped): ${key}`);
    }
  }
  if ('chapter_title' in raw) drift.fixes.push('detected legacy chapter_title');
  if ('section_title' in raw) drift.fixes.push('dropped legacy section_title (load script computes from WCO map)');

  // Top-level subheading_notes (Ch.29, 64, 88, 97) — chapter-wide rules, kept canonical
  // Also handle variant: sub_heading_notes (underscore-h)
  const chapter_subheading_notes_raw =
    raw.subheading_notes ?? raw.chapter_subheading_notes ?? raw.sub_heading_notes;
  const chapter_subheading_notes = normalizeNotes(chapter_subheading_notes_raw, drift, 'chapter_subheading_notes');
  if (Array.isArray(raw.subheading_notes) && raw.subheading_notes.length > 0) {
    drift.fixes.push(`hoisted ${raw.subheading_notes.length} top-level subheading_notes -> chapter_subheading_notes`);
  }
  if (Array.isArray(raw.sub_heading_notes) && raw.sub_heading_notes.length > 0) {
    drift.fixes.push(`hoisted ${raw.sub_heading_notes.length} top-level sub_heading_notes -> chapter_subheading_notes`);
  }

  const canonical: CanonicalChapter = {
    chapter: chapterKey,
    section,
    title,
    source_pdf: asString(raw.source_pdf),
    extracted_at: asString(raw.extracted_at),
    extractor_model: asString(raw.extractor_model),
    extraction_warnings: asArray<string>(raw.extraction_warnings).filter(
      (s): s is string => typeof s === 'string',
    ),
    chapter_notes: normalizeNotes(raw.chapter_notes, drift, 'chapter_notes'),
    section_notes: normalizeNotes(raw.section_notes, drift, 'section_notes'),
    chapter_subheading_notes,
    supplementary_notes: normalizeNotes(raw.supplementary_notes, drift, 'supplementary_notes'),
    export_licensing_notes: normalizeNotes(raw.export_licensing_notes, drift, 'export_licensing_notes'),
    exclusion_clauses: asArray<unknown>(raw.exclusion_clauses)
      .map((e) => normalizeExclusion(e, drift, 'exclusion_clauses'))
      .filter((e): e is Exclusion => e !== null),
    policy_conditions: asArray<unknown>(raw.policy_conditions)
      .map((p) => normalizePolicyCondition(p, drift, 'policy_conditions'))
      .filter((p): p is PolicyCondition => p !== null),
    headings,
  };

  return { canonical, drift };
}

// ============================================================
// Validation (hierarchical code-format checks)
// ============================================================
function validateCanonical(c: CanonicalChapter): string[] {
  const errors: string[] = [];
  if (!/^\d{2}$/.test(c.chapter)) errors.push(`chapter "${c.chapter}" not 2 digits`);
  if (!ROMAN_SECTIONS.has(c.section)) errors.push(`section "${c.section}" not valid Roman`);
  if (!c.title.trim()) errors.push('title is empty');

  for (const h of c.headings) {
    if (!/^\d{4}$/.test(h.heading)) {
      errors.push(`heading "${h.heading}" not 4 digits`);
      continue;
    }
    if (!h.heading.startsWith(c.chapter)) {
      errors.push(`heading "${h.heading}" doesn't start with chapter "${c.chapter}"`);
    }
    for (const sh of h.subheadings) {
      if (!/^\d{4}\.\d{2}$/.test(sh.subheading)) {
        errors.push(`subheading "${sh.subheading}" not NNNN.NN format`);
        continue;
      }
      if (!sh.subheading.startsWith(h.heading)) {
        errors.push(`subheading "${sh.subheading}" doesn't start with heading "${h.heading}"`);
      }
      for (const tl of sh.tariff_lines) {
        if (!/^\d{4}\.\d{2}\.\d{2}$/.test(tl.code)) {
          errors.push(`tariff_line "${tl.code}" not NNNN.NN.NN format`);
          continue;
        }
        if (!tl.code.startsWith(sh.subheading)) {
          errors.push(`tariff_line "${tl.code}" doesn't start with subheading "${sh.subheading}"`);
        }
      }
    }
  }
  return errors;
}

// ============================================================
// Main
// ============================================================
function main(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allDrift: DriftRecord[] = [];
  const allErrors: { chapter: string; errors: string[] }[] = [];
  let totalH = 0, totalSh = 0, totalTl = 0;
  let written = 0, missing = 0;
  const missingChapters: string[] = [];

  for (const chapter of ALL_CHAPTERS) {
    const located = locateChapter(chapter);
    if (!located) {
      missing += 1;
      missingChapters.push(chapter);
      console.error(`  ✗ ch-${chapter} — NOT FOUND (no worktree, no git branch)`);
      continue;
    }
    const { canonical, drift } = normalizeChapter(located.data, chapter, located.source);
    if (!canonical) {
      allDrift.push(drift);
      console.error(`  ✗ ch-${chapter} — normalization failed: ${drift.warnings.join('; ')}`);
      continue;
    }
    const errors = validateCanonical(canonical);
    if (errors.length > 0) {
      allErrors.push({ chapter, errors });
    }
    allDrift.push(drift);

    const outPath = path.join(OUTPUT_DIR, `chapter-${chapter}.json`);
    fs.writeFileSync(outPath, JSON.stringify(canonical, null, 2) + '\n', 'utf-8');
    written += 1;
    const h = canonical.headings.length;
    const sh = canonical.headings.reduce((a, x) => a + x.subheadings.length, 0);
    const tl = canonical.headings.reduce(
      (a, x) => a + x.subheadings.reduce((b, y) => b + y.tariff_lines.length, 0),
      0,
    );
    totalH += h;
    totalSh += sh;
    totalTl += tl;
    const fixSummary = drift.fixes.length > 0 ? ` [fixes: ${drift.fixes.length}]` : '';
    const warnSummary = drift.warnings.length > 0 ? ` [warnings: ${drift.warnings.length}]` : '';
    const errSummary = errors.length > 0 ? ` [VALIDATION ERRORS: ${errors.length}]` : '';
    console.log(
      `  ✓ ch-${chapter} (${located.source.padEnd(30)}) → ${h}h ${sh}sh ${tl}tl${fixSummary}${warnSummary}${errSummary}`,
    );
  }

  // Audit report
  const reportPath = path.resolve(__dirname, '../data/normalize-audit-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        written,
        missing,
        missing_chapters: missingChapters,
        validation_errors: allErrors,
        drift_records: allDrift,
        totals: { headings: totalH, subheadings: totalSh, tariff_lines: totalTl },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );

  console.log('\n=== Summary ===');
  console.log(`  written:           ${written} / ${ALL_CHAPTERS.length}`);
  console.log(`  missing:           ${missing}`);
  if (missing > 0) console.log(`  missing chapters:  ${missingChapters.join(', ')}`);
  console.log(`  total headings:    ${totalH}`);
  console.log(`  total subheadings: ${totalSh}`);
  console.log(`  total tariff_lines: ${totalTl}`);
  console.log(`  chapters with fixes:        ${allDrift.filter((d) => d.fixes.length > 0).length}`);
  console.log(`  chapters with warnings:     ${allDrift.filter((d) => d.warnings.length > 0).length}`);
  console.log(`  chapters with validation errors: ${allErrors.length}`);
  console.log(`  audit report: ${reportPath}`);

  if (allErrors.length > 0) {
    console.log('\n=== Validation errors (first 20) ===');
    for (const { chapter, errors } of allErrors.slice(0, 20)) {
      console.log(`  ch-${chapter}:`);
      for (const e of errors.slice(0, 5)) console.log(`    - ${e}`);
      if (errors.length > 5) console.log(`    ... and ${errors.length - 5} more`);
    }
  }
}

main();

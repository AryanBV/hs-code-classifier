/**
 * Phase-1 Trade-Intelligence Aggregate + Ingest.
 *
 * Loads the build-time extraction output for the four Phase-1 schemes
 * (export_duty, rosctl, uqc) plus the source registry, normalizes and
 * column-projects every row, validates it against the live schema's shape,
 * and either prints a dry-run report or bulk-upserts into Supabase.
 *
 * TARGET (Supabase project waowoznsvaosgcgiivzo) — schema in
 *   frontend/supabase/migrations/0002_trade_intelligence.sql:
 *     export_duty_rates, rosctl_rates, uqc, trade_intel_sources
 *
 * Modes:
 *   --dry-run (default): load + normalize + validate + FK-check + print stats; NO writes
 *   --ingest:            do all of the above, then bulk INSERT ... ON CONFLICT DO UPDATE
 *
 * Exit codes:
 *   0 — success
 *   1 — validation / data failure
 *   2 — DB error
 *
 * Run:
 *   cd backend && npx tsx scripts/ingest-trade-intel-phase1.ts            # dry-run
 *   cd backend && npx tsx scripts/ingest-trade-intel-phase1.ts --ingest   # write
 *
 * Build-time only. NO Gemini / LLM calls. Reads DATABASE_URL from backend/.env
 * via dotenv (pooled Supavisor connection, port 6543) — never printed.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

/* ===========================================================================
 * Constants & paths
 * =========================================================================== */

const BACKEND_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(
  BACKEND_ROOT,
  'data/build-time/trade-intel-phase1/output',
);
const O2_PLAN_FILE = path.join(
  BACKEND_ROOT,
  'data/build-time/O2-tariff-line-attributes/chunks/plan.json',
);

const EXPORT_DUTY_FILE = path.join(DATA_ROOT, 'export_duty/all.json');
const ROSCTL_FILES = ['61', '62', '63'].map((c) =>
  path.join(DATA_ROOT, 'rosctl', `${c}.json`),
);
const UQC_DIR = path.join(DATA_ROOT, 'uqc');
const UQC_CHUNK_COUNT = 41; // o2-0 .. o2-40

const BATCH_SIZE = 500;
const CODE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

/* ---------------------------------------------------------------------------
 * Column projections — ONLY the real DB columns are inserted. Every other key
 * in the source JSON (scheme, uqc_raw, provenance_note, extraction_method, ...)
 * is dropped at projection time. Auto/defaulted columns (id, created_at,
 * last_checked) are not listed here; the DB fills them.
 * --------------------------------------------------------------------------- */

const EXPORT_DUTY_COLUMNS = [
  'code',
  'is_nil',
  'rate_text',
  'rate_pct',
  'rate_specific',
  'condition_text',
  'as_on',
  'source_url',
  'notification_ref',
  'mappable',
] as const;

const ROSCTL_COLUMNS = [
  'code',
  'rebate_pct',
  'cap_text',
  'cap_value',
  'cap_unit',
  'condition_text',
  'as_on',
  'source_url',
  'notification_ref',
  'mappable',
] as const;

const UQC_COLUMNS = [
  'code',
  'uqc_code',
  'uqc_label',
  'as_on',
  'source_url',
  'notification_ref',
] as const;

const SOURCES_COLUMNS = [
  'scheme',
  'as_on',
  'source_url',
  'notification_ref',
  'freshness_budget_days',
  'last_checked',
  'note',
] as const;

/* ===========================================================================
 * Normalization decisions (documented; see the dry-run NORMALIZATIONS section)
 * =========================================================================== */

/**
 * Canonical as_on per scheme.
 *
 *  - export_duty: 2022-05-21. Source data is already uniform on this date
 *    (Second Schedule consolidated to amendment notfn. 28/22 dt. 21.05.2022).
 *
 *  - rosctl: 2026-04-01. The 61/62 files stamp 2026-04-01; 63 stamps the
 *    window-end 2026-09-30. ALL three cite the SAME instrument — MoT Notfn.
 *    No. 14/26/2016-IT (Vol.II) dt. 07.03.2019, "continued unchanged to
 *    30-Sep-2026". The rates are in force across the whole window; the correct
 *    "as_on" (snapshot/effective-from date for this build) is the window start,
 *    2026-04-01 (FY26-27 H1). 2026-09-30 is the window END, not a snapshot
 *    date. Reconciling 63 onto 2026-04-01 makes one canonical snapshot date.
 *
 *  - uqc: 2023-05-01. The mixed 2022-01-01 / 2022-02-01 / 2023-04-01 /
 *    2023-05-01 stamps are extraction artifacts. There is ONE source edition:
 *    CBIC "Customs Tariff of India 2023 — First Schedule to the Customs Tariff
 *    Act, 1975, AS EFFECTIVE FROM 01-05-2023" (data/pdfs/cbic-official-tariff.pdf,
 *    title page; PDF created 2023-05-29). Every UQC row is stamped with that
 *    single edition date.
 */
const CANONICAL_AS_ON: Readonly<Record<'export_duty' | 'rosctl' | 'uqc', string>> = {
  export_duty: '2022-05-21',
  rosctl: '2026-04-01',
  uqc: '2023-05-01',
};

/**
 * RoSCTL cap_unit -> canonical UQC vocabulary.
 *
 * The uqc table's vocabulary (observed across the corpus) uses:
 *   KGS (Kilograms), NOS (Numbers/Units), PRS (Pairs), MTR, SQM, TON, TU, ...
 * There is NO "PCS" token in the UQC vocabulary; apparel chapters 61/62/63
 * denominate "pieces" as NOS in the uqc table (284 NOS vs 3 PRS vs 89 KGS in
 * the present ch.61/62/63 uqc rows). The 63 file uses 'Kg' for kilograms.
 *
 * Mapping (case-insensitive on the raw token):
 *   'PCS' -> 'NOS'   (pieces -> Numbers/Units, matching the uqc table)
 *   'Kg'  -> 'KGS'   (align to the uqc kilogram token)
 *   'KGS' -> 'KGS'   (already canonical)
 *   null  -> null    (no cap, no unit — preserved)
 */
const ROSCTL_CAP_UNIT_MAP: ReadonlyMap<string, string> = new Map([
  ['PCS', 'NOS'],
  ['KG', 'KGS'],
  ['KGS', 'KGS'],
]);

/**
 * 6904.10.00 UQC real conflict resolution.
 * o2-34 says TU (Thousand); o2-36 says THD (Thousands). The CBIC official
 * tariff (data/pdfs/cbic-official-tariff.pdf, heading 6904 "CERAMIC BUILDING
 * BRICKS...", the "- Building bricks" row) lists the unit as "Tu" => UQC TU.
 * We force 6904.10.00 to TU/Thousand and drop the THD variant.
 */
const UQC_CODE_OVERRIDE: ReadonlyMap<string, { uqc_code: string; uqc_label: string }> =
  new Map([['6904.10.00', { uqc_code: 'TU', uqc_label: 'Thousand' }]]);

/* Source registry rows (one per Phase-1 scheme). The per-value rows carry the
 * same as_on/source_url/notification_ref; this registry is the scheme-level
 * system of record for freshness_budget_days + last_checked. */
const TODAY = new Date().toISOString().slice(0, 10);

interface SourceRow {
  scheme: string;
  as_on: string;
  source_url: string;
  notification_ref: string;
  freshness_budget_days: number;
  last_checked: string;
  note: string;
}

const SOURCE_REGISTRY_ROWS: ReadonlyArray<SourceRow> = [
  {
    scheme: 'export_policy',
    as_on: '2022-05-21',
    source_url:
      'https://www.dgft.gov.in/CP/?opt=itc-hs-codes',
    notification_ref:
      'DGFT ITC(HS) 2022 Schedule 2 (Export Policy); export_policy/policy_condition snapshot already on tariff_lines (this registry stamps its freshness).',
    freshness_budget_days: 90,
    last_checked: TODAY,
    note:
      'Export-policy snapshot is recorded on tariff_lines.export_policy/policy_condition (+ tariff_lines.policy_as_on once backfilled). Tightest budget — DGFT amends frequently.',
  },
  {
    scheme: 'export_duty',
    as_on: CANONICAL_AS_ON.export_duty,
    source_url:
      'https://upload.indiacode.nic.in/schedulefile?aid=AC_CEN_2_2_00039_197551_1554713855359&rid=791',
    notification_ref:
      'Second Schedule, Customs Tariff Act 1975 (India Code), consolidated to amendment notfn. 28/22 dt. 21.05.2022; effective rates per exemption Notfn. 27/11-Cus dt. 01.03.2011 (as amended).',
    freshness_budget_days: 180,
    last_checked: TODAY,
    note:
      'Export duty / cess from the 2nd Schedule. Most lines carry no export duty (is_nil); only dutiable lines extracted. Stable but re-verify against new Finance Act / cess notifications.',
  },
  {
    scheme: 'rosctl',
    as_on: CANONICAL_AS_ON.rosctl,
    source_url:
      'https://texmin.nic.in/services/scheme-rebate-state-and-central-taxes-and-levies-export-apparelgarments-and-made-ups-rosctl',
    notification_ref:
      'Ministry of Textiles Notification No. 14/26/2016-IT (Vol.II) dt. 07.03.2019 (RoSCTL Schedules 1 & 2); continued unchanged to 30-Sep-2026.',
    freshness_budget_days: 180,
    last_checked: TODAY,
    note:
      'RoSCTL rebate for apparel/made-ups Ch.61/62/63 only. Mutually exclusive with RoDTEP on these chapters. Window 01-Apr-2026..30-Sep-2026; re-check before the window end.',
  },
  {
    scheme: 'uqc',
    as_on: CANONICAL_AS_ON.uqc,
    source_url:
      'https://www.cbic.gov.in/resources//htdocs-cbec/customs/cst2023-300323/cst2023-300323-idx.html',
    notification_ref:
      'CBIC Customs Tariff of India 2023 — First Schedule to the Customs Tariff Act, 1975, as effective from 01-05-2023 (Unit column). Build file: data/pdfs/cbic-official-tariff.pdf.',
    freshness_budget_days: 180,
    last_checked: TODAY,
    note:
      'Unit Quantity Code per 8-digit line from the CBIC 2023 tariff Unit column. tariff_lines.unit is 100% NULL — this is the canonical UQC source. NOTE coverage gap: chapters 01,20,26,28,39,54,59,61,81,94 have no UQC rows (see ingest report) — flag for re-extraction.',
  },
];

/* ===========================================================================
 * Types
 * =========================================================================== */

type Json = Record<string, unknown>;

interface ValidationIssue {
  scheme: string;
  code: string;
  message: string;
}

/* ===========================================================================
 * Helpers
 * =========================================================================== */

function die(msg: string, code: 1 | 2): never {
  console.error(`\n[FATAL] ${msg}`);
  process.exit(code);
}

function loadJsonArray(filePath: string): Json[] {
  if (!fs.existsSync(filePath)) die(`File not found: ${filePath}`, 1);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) die(`Not a JSON array: ${filePath}`, 1);
  return parsed as Json[];
}

/** Project a record down to exactly `columns`, dropping every other key. */
function project(rec: Json, columns: ReadonlyArray<string>): Json {
  const out: Json = {};
  for (const col of columns) {
    out[col] = col in rec ? rec[col] : null;
  }
  return out;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.0';
  return ((n / total) * 100).toFixed(1);
}

/* ===========================================================================
 * Loaders + normalizers (return column-projected rows ready for insert)
 * =========================================================================== */

function loadExportDuty(): Json[] {
  const raw = loadExportDutyRaw();
  return raw.map((rec) => {
    const row = project(rec, EXPORT_DUTY_COLUMNS);
    row.as_on = CANONICAL_AS_ON.export_duty;
    return row;
  });
}

function loadExportDutyRaw(): Json[] {
  return loadJsonArray(EXPORT_DUTY_FILE);
}

function loadRosctl(): Json[] {
  const out: Json[] = [];
  for (const file of ROSCTL_FILES) {
    const rows = loadJsonArray(file);
    for (const rec of rows) {
      const row = project(rec, ROSCTL_COLUMNS);
      // Normalize as_on to the single canonical RoSCTL snapshot date.
      row.as_on = CANONICAL_AS_ON.rosctl;
      // Normalize cap_unit to the UQC vocabulary. null/empty preserved.
      const rawUnit = row.cap_unit;
      if (rawUnit === null || rawUnit === undefined || rawUnit === '') {
        row.cap_unit = null;
      } else if (typeof rawUnit === 'string') {
        const mapped = ROSCTL_CAP_UNIT_MAP.get(rawUnit.toUpperCase());
        // Leave unmapped tokens as-is so validation surfaces them rather than
        // silently corrupting; the known vocab (PCS/KGS/Kg/null) all map.
        row.cap_unit = mapped ?? rawUnit;
      }
      // 63 file omits `mappable`; project() defaulted it to null. The column is
      // NOT NULL DEFAULT true — send true for the rows that lack it.
      if (row.mappable === null || row.mappable === undefined) {
        row.mappable = true;
      }
      out.push(row);
    }
  }
  return out;
}

interface UqcLoadResult {
  rows: Json[];
  rawRowCount: number;
  emptyChunks: string[];
  collisionCount: number; // codes seen >1 time across chunks
  identicalSafeCount: number; // collisions where all variants agree on uqc_code
  realConflicts: Array<{ code: string; variants: Array<{ chunk: string; uqc_code: string }> }>;
  overrideApplied: Array<{ code: string; to: string }>;
}

function loadUqc(): UqcLoadResult {
  // Gather all rows with their source chunk so collisions can be reported.
  const all: Array<{ rec: Json; chunk: string }> = [];
  const emptyChunks: string[] = [];

  for (let i = 0; i < UQC_CHUNK_COUNT; i++) {
    const chunk = `o2-${i}`;
    const file = path.join(UQC_DIR, `${chunk}.json`);
    if (!fs.existsSync(file)) continue;
    const rows = loadJsonArray(file);
    if (rows.length === 0) {
      emptyChunks.push(chunk);
      continue;
    }
    for (const rec of rows) all.push({ rec, chunk });
  }

  // Group by code to dedupe.
  const byCode = new Map<string, Array<{ rec: Json; chunk: string }>>();
  for (const item of all) {
    const code = String(item.rec.code);
    const arr = byCode.get(code) ?? [];
    arr.push(item);
    byCode.set(code, arr);
  }

  let collisionCount = 0;
  let identicalSafeCount = 0;
  const realConflicts: UqcLoadResult['realConflicts'] = [];
  const overrideApplied: UqcLoadResult['overrideApplied'] = [];

  const rows: Json[] = [];
  for (const [code, variants] of byCode) {
    if (variants.length > 1) collisionCount++;

    // Determine the winning record.
    let winner: Json;
    const override = UQC_CODE_OVERRIDE.get(code);
    const distinctUqc = new Set(variants.map((v) => String(v.rec.uqc_code)));

    if (override) {
      // Forced resolution from the CBIC PDF. Use the first variant as the base
      // for the other columns (source_url/notification_ref) and override the UQC.
      winner = { ...variants[0]!.rec };
      winner.uqc_code = override.uqc_code;
      winner.uqc_label = override.uqc_label;
      overrideApplied.push({ code, to: `${override.uqc_code}/${override.uqc_label}` });
      if (distinctUqc.size > 1) {
        realConflicts.push({
          code,
          variants: variants.map((v) => ({ chunk: v.chunk, uqc_code: String(v.rec.uqc_code) })),
        });
      }
    } else if (distinctUqc.size > 1) {
      // A real conflict with NO override rule — this must not happen silently.
      realConflicts.push({
        code,
        variants: variants.map((v) => ({ chunk: v.chunk, uqc_code: String(v.rec.uqc_code) })),
      });
      die(
        `Unresolved UQC conflict for ${code}: ${[...distinctUqc].join(' vs ')} ` +
          `(chunks: ${variants.map((v) => v.chunk).join(', ')}). Add a UQC_CODE_OVERRIDE entry.`,
        1,
      );
    } else {
      // Collision but all variants agree — identical-safe, keep one.
      winner = variants[0]!.rec;
      if (variants.length > 1) identicalSafeCount++;
    }

    const row = project(winner, UQC_COLUMNS);
    // Stamp every UQC row with the single canonical edition date.
    row.as_on = CANONICAL_AS_ON.uqc;
    rows.push(row);
  }

  return {
    rows,
    rawRowCount: all.length,
    emptyChunks,
    collisionCount,
    identicalSafeCount,
    realConflicts,
    overrideApplied,
  };
}

/* ===========================================================================
 * Validation (mirrors the DB CHECK / NOT NULL constraints — pre-ingest gate)
 * =========================================================================== */

function validateExportDuty(rows: Json[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const code = String(r.code);
    if (typeof r.code !== 'string' || !CODE_RE.test(code)) {
      issues.push({ scheme: 'export_duty', code, message: `bad code format` });
    }
    if (typeof r.is_nil !== 'boolean') {
      issues.push({ scheme: 'export_duty', code, message: `is_nil must be boolean` });
    }
    if (typeof r.mappable !== 'boolean') {
      issues.push({ scheme: 'export_duty', code, message: `mappable must be boolean` });
    }
    if (!r.as_on || !r.source_url) {
      issues.push({ scheme: 'export_duty', code, message: `as_on/source_url required` });
    }
    // DB CHECK: nil => no numeric rate; non-nil => has some rate signal.
    const hasRate =
      r.rate_text != null || r.rate_pct != null || r.rate_specific != null;
    if (r.is_nil === true && (r.rate_pct != null || r.rate_specific != null)) {
      issues.push({ scheme: 'export_duty', code, message: `is_nil but has rate_pct/specific` });
    }
    if (r.is_nil === false && !hasRate) {
      issues.push({ scheme: 'export_duty', code, message: `non-nil but no rate signal` });
    }
  }
  return issues;
}

function validateRosctl(rows: Json[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const code = String(r.code);
    if (typeof r.code !== 'string' || !CODE_RE.test(code)) {
      issues.push({ scheme: 'rosctl', code, message: `bad code format` });
    }
    if (!['61', '62', '63'].includes(code.slice(0, 2))) {
      issues.push({ scheme: 'rosctl', code, message: `code not in Ch.61/62/63 (DB CHECK)` });
    }
    if (typeof r.rebate_pct !== 'number') {
      issues.push({ scheme: 'rosctl', code, message: `rebate_pct must be number (NOT NULL)` });
    }
    if (typeof r.mappable !== 'boolean') {
      issues.push({ scheme: 'rosctl', code, message: `mappable must be boolean` });
    }
    if (!r.as_on || !r.source_url) {
      issues.push({ scheme: 'rosctl', code, message: `as_on/source_url required` });
    }
    if (r.cap_value != null && typeof r.cap_value !== 'number') {
      issues.push({ scheme: 'rosctl', code, message: `cap_value must be number|null` });
    }
  }
  return issues;
}

function validateUqc(rows: Json[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const code = String(r.code);
    if (typeof r.code !== 'string' || !CODE_RE.test(code)) {
      issues.push({ scheme: 'uqc', code, message: `bad code format` });
    }
    if (typeof r.uqc_code !== 'string' || r.uqc_code.length === 0) {
      issues.push({ scheme: 'uqc', code, message: `uqc_code required (NOT NULL)` });
    }
    if (!r.as_on || !r.source_url) {
      issues.push({ scheme: 'uqc', code, message: `as_on/source_url required` });
    }
  }
  return issues;
}

/* ===========================================================================
 * FK validity check (read-only) — every code must exist in tariff_lines
 * =========================================================================== */

async function checkFkValidity(
  pool: Pool,
  schemeCodes: Record<string, string[]>,
): Promise<Record<string, { total: number; valid: number; missing: string[] }>> {
  const client = await pool.connect();
  const out: Record<string, { total: number; valid: number; missing: string[] }> = {};
  try {
    for (const [scheme, codes] of Object.entries(schemeCodes)) {
      const distinct = [...new Set(codes)];
      if (distinct.length === 0) {
        out[scheme] = { total: 0, valid: 0, missing: [] };
        continue;
      }
      const res = await client.query<{ code: string }>(
        `SELECT t.code
           FROM unnest($1::text[]) AS t(code)
           WHERE NOT EXISTS (SELECT 1 FROM tariff_lines tl WHERE tl.code = t.code)`,
        [distinct],
      );
      const missing = res.rows.map((row) => row.code);
      out[scheme] = {
        total: distinct.length,
        valid: distinct.length - missing.length,
        missing,
      };
    }
  } finally {
    client.release();
  }
  return out;
}

/* ===========================================================================
 * Coverage gap analysis (uqc) — chapters with tariff_lines but no UQC
 * =========================================================================== */

async function analyzeUqcCoverage(
  pool: Pool,
  uqcCodes: string[],
): Promise<{
  coveredChapters: string[];
  dbChapters: string[];
  missingChapters: Array<{ chapter: string; tariffLines: number }>;
}> {
  const covered = new Set(uqcCodes.map((c) => c.slice(0, 2)));
  const client = await pool.connect();
  try {
    const res = await client.query<{ chapter: string; n: string }>(
      `SELECT left(code,2) AS chapter, count(*)::text AS n
         FROM tariff_lines GROUP BY 1 ORDER BY 1`,
    );
    const dbChapters = res.rows.map((r) => r.chapter);
    const missing: Array<{ chapter: string; tariffLines: number }> = [];
    for (const row of res.rows) {
      if (!covered.has(row.chapter)) {
        missing.push({ chapter: row.chapter, tariffLines: Number(row.n) });
      }
    }
    return { coveredChapters: [...covered].sort(), dbChapters, missingChapters: missing };
  } finally {
    client.release();
  }
}

/* ===========================================================================
 * O2 plan lookup — which chapters the empty uqc chunks were assigned
 * =========================================================================== */

interface O2Chunk {
  chunk_id: string;
  chapters: string[];
}

function emptyChunkChapters(emptyChunks: string[]): Array<{ chunk: string; chapters: string[] }> {
  if (!fs.existsSync(O2_PLAN_FILE)) return emptyChunks.map((c) => ({ chunk: c, chapters: [] }));
  const plan = JSON.parse(fs.readFileSync(O2_PLAN_FILE, 'utf-8')) as { chunks: O2Chunk[] };
  return emptyChunks.map((chunk) => {
    const idx = Number(chunk.replace('o2-', ''));
    const planChunk = plan.chunks[idx];
    return { chunk, chapters: planChunk ? planChunk.chapters : [] };
  });
}

/* ===========================================================================
 * Bulk upsert
 * =========================================================================== */

async function upsert(
  pool: Pool,
  table: string,
  columns: ReadonlyArray<string>,
  conflictCols: ReadonlyArray<string>,
  rows: Json[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    const updateCols = columns.filter((c) => !conflictCols.includes(c));
    const updateClause =
      updateCols.length > 0
        ? updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')
        : '';
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const conflictClause =
      updateClause.length > 0
        ? `ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ${updateClause}`
        : `ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(', ')}) DO NOTHING`;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const params: unknown[] = [];
      const valuePlaceholders: string[] = [];
      let p = 1;
      for (const row of batch) {
        const ph = columns.map(() => `$${p++}`).join(', ');
        valuePlaceholders.push(`(${ph})`);
        for (const col of columns) params.push(row[col] ?? null);
      }
      const sql = `INSERT INTO ${table} (${colList}) VALUES ${valuePlaceholders.join(
        ', ',
      )} ${conflictClause}`;
      try {
        await client.query(sql, params);
        inserted += batch.length;
        console.log(`  [${table}] batch upserted ${batch.length} (total ${inserted})`);
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        console.error(`[DB ERROR] ${table} batch failed: ${err instanceof Error ? err.message : String(err)}`);
        die(`DB error during ${table} upsert — rolled back`, 2);
      }
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  return inserted;
}

/* ===========================================================================
 * Main
 * =========================================================================== */

async function main(): Promise<void> {
  const isIngest = process.argv.slice(2).includes('--ingest');
  const mode = isIngest ? 'INGEST' : 'DRY-RUN';
  console.log(`\nPhase-1 Trade-Intel Ingest — mode: ${mode}`);
  console.log('='.repeat(60));

  // ---- Load + normalize -----------------------------------------------------
  const exportDutyRows = loadExportDuty();
  const rosctlRows = loadRosctl();
  const uqcResult = loadUqc();
  const uqcRows = uqcResult.rows;
  const sourceRows: Json[] = SOURCE_REGISTRY_ROWS.map((r) => project(r as unknown as Json, SOURCES_COLUMNS));

  // ---- Validate -------------------------------------------------------------
  const issues = [
    ...validateExportDuty(exportDutyRows),
    ...validateRosctl(rosctlRows),
    ...validateUqc(uqcRows),
  ];
  if (issues.length > 0) {
    console.error(`\n[VALIDATION] ${issues.length} issue(s):`);
    for (const it of issues.slice(0, 50)) {
      console.error(`  ${it.scheme} ${it.code}: ${it.message}`);
    }
    if (issues.length > 50) console.error(`  ... ${issues.length - 50} more`);
    die(`${issues.length} validation issue(s) — aborting`, 1);
  }

  // ---- DB-backed checks (read-only; also used by ingest) ---------------------
  const connStr = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connStr) die('DATABASE_URL not set in env (backend/.env)', 2);
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  let exitCode: 0 | 1 | 2 = 0;
  try {
    const fk = await checkFkValidity(pool, {
      export_duty: exportDutyRows.map((r) => String(r.code)),
      rosctl: rosctlRows.map((r) => String(r.code)),
      uqc: uqcRows.map((r) => String(r.code)),
    });

    const coverage = await analyzeUqcCoverage(pool, uqcRows.map((r) => String(r.code)));
    const emptyAssigned = emptyChunkChapters(uqcResult.emptyChunks);

    // ---- Report -------------------------------------------------------------
    console.log('\n===== ROW COUNTS TO INSERT =====');
    console.log(`  export_duty_rates : ${exportDutyRows.length}`);
    console.log(`  rosctl_rates      : ${rosctlRows.length}`);
    console.log(`  uqc               : ${uqcRows.length}  (from ${uqcResult.rawRowCount} raw rows after dedupe)`);
    console.log(`  trade_intel_sources: ${sourceRows.length}`);

    console.log('\n===== DISTINCT CODE COUNTS =====');
    console.log(`  export_duty : ${new Set(exportDutyRows.map((r) => r.code)).size}`);
    console.log(`  rosctl      : ${new Set(rosctlRows.map((r) => r.code)).size}`);
    console.log(`  uqc         : ${new Set(uqcRows.map((r) => r.code)).size}`);

    console.log('\n===== FK VALIDITY vs tariff_lines =====');
    for (const [scheme, r] of Object.entries(fk)) {
      const ok = r.missing.length === 0 ? 'ALL VALID' : `${r.missing.length} MISSING`;
      console.log(`  ${scheme.padEnd(12)}: ${r.valid}/${r.total} valid  ${ok}`);
      if (r.missing.length > 0) {
        console.log(`     missing: ${r.missing.slice(0, 20).join(', ')}${r.missing.length > 20 ? ' ...' : ''}`);
      }
    }

    console.log('\n===== 6904.10.00 UQC RESOLUTION =====');
    if (uqcResult.overrideApplied.length > 0) {
      for (const o of uqcResult.overrideApplied) {
        console.log(`  ${o.code} -> ${o.to}  (forced from CBIC tariff PDF "Building bricks" row, unit "Tu")`);
      }
    }
    console.log(`  UQC collisions: ${uqcResult.collisionCount}  (identical-safe kept-one: ${uqcResult.identicalSafeCount})`);
    if (uqcResult.realConflicts.length > 0) {
      console.log(`  real conflicts (differing uqc_code):`);
      for (const c of uqcResult.realConflicts) {
        console.log(`     ${c.code}: ${c.variants.map((v) => `${v.chunk}=${v.uqc_code}`).join(' vs ')}`);
      }
    }

    console.log('\n===== as_on NORMALIZATION =====');
    console.log(`  export_duty -> ${CANONICAL_AS_ON.export_duty} (uniform in source; 2nd-Sch consolidated to 28/22 dt.21.05.2022)`);
    console.log(`  rosctl      -> ${CANONICAL_AS_ON.rosctl} (61/62=2026-04-01, 63=2026-09-30 window-END; same MoT notfn 14/26/2016-IT; snapshot = window START)`);
    console.log(`  uqc         -> ${CANONICAL_AS_ON.uqc} (CBIC tariff 2023 "as effective from 01-05-2023"; mixed 2022/2023 stamps = artifacts)`);

    console.log('\n===== rosctl cap_unit NORMALIZATION =====');
    const capUnitDist: Record<string, number> = {};
    for (const r of rosctlRows) {
      const k = r.cap_unit === null || r.cap_unit === undefined ? '(null)' : String(r.cap_unit);
      capUnitDist[k] = (capUnitDist[k] ?? 0) + 1;
    }
    console.log(`  mapping: PCS->NOS, Kg->KGS, KGS->KGS, null->null`);
    console.log(`  result distribution: ${JSON.stringify(capUnitDist)}`);
    console.log(`  (uqc table uses NOS for pieces in Ch.61/62/63 — no PCS token exists in the UQC vocab)`);

    console.log('\n===== EMPTY uqc CHUNK FINDING =====');
    console.log(`  empty chunks: ${uqcResult.emptyChunks.join(', ') || '(none)'}`);
    for (const e of emptyAssigned) {
      console.log(`     ${e.chunk} -> O2 plan chapters: ${e.chapters.join(', ') || '(unknown)'}`);
    }

    console.log('\n===== uqc COVERAGE GAP (chapters with tariff_lines but NO UQC) =====');
    if (coverage.missingChapters.length === 0) {
      console.log('  none — full chapter coverage');
    } else {
      let totalMissingLines = 0;
      for (const m of coverage.missingChapters) {
        totalMissingLines += m.tariffLines;
        const note = m.chapter === '77' ? '  (reserved/unused HS chapter — legitimately empty)' : '';
        console.log(`     Ch.${m.chapter}: ${m.tariffLines} tariff_lines have NO UQC${note}`);
      }
      console.log(`  TOTAL tariff_lines lacking UQC: ${totalMissingLines}`);
      console.log(`  >>> FLAG: real chapters dropped from UQC extraction — re-extract before launch.`);
    }

    console.log('\n===== trade_intel_sources REGISTRY ROWS =====');
    for (const r of sourceRows) {
      console.log(`  ${String(r.scheme).padEnd(13)} as_on=${r.as_on} budget=${r.freshness_budget_days}d`);
    }

    // ---- Ingest -------------------------------------------------------------
    if (isIngest) {
      console.log('\n===== INGEST =====');
      const anyFkMissing = Object.values(fk).some((r) => r.missing.length > 0);
      if (anyFkMissing) die('FK-invalid codes present — refusing to ingest', 1);
      await upsert(pool, 'export_duty_rates', EXPORT_DUTY_COLUMNS, ['code', 'as_on'], exportDutyRows);
      await upsert(pool, 'rosctl_rates', ROSCTL_COLUMNS, ['code', 'as_on'], rosctlRows);
      await upsert(pool, 'uqc', UQC_COLUMNS, ['code'], uqcRows);
      await upsert(pool, 'trade_intel_sources', SOURCES_COLUMNS, ['scheme', 'as_on', 'source_url'], sourceRows);
      console.log('\nIngest complete.');
    } else {
      console.log('\nDry-run complete. No writes. Pass --ingest to write.');
    }
  } catch (err: unknown) {
    console.error('[ERROR]', err instanceof Error ? err.message : String(err));
    exitCode = 2;
  } finally {
    await pool.end();
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error('[UNHANDLED]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

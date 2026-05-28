/**
 * O2 Aggregate and Ingest — Post-processing pipeline for tariff_line_attributes extraction.
 *
 * Two modes:
 *   --dry-run (default): merge + validate + print stats; NO database writes
 *   --ingest:            merge + validate + bulk INSERT ... ON CONFLICT DO UPDATE
 *
 * Exit codes:
 *   0 — success
 *   1 — validation failure
 *   2 — DB error
 *
 * Run:
 *   cd backend && npx tsx scripts/o2-aggregate-and-ingest.ts
 *   cd backend && npx tsx scripts/o2-aggregate-and-ingest.ts --ingest
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

const BACKEND_ROOT = path.resolve(__dirname, '..');
const BASE_FILE    = path.join(BACKEND_ROOT, 'data/build-time/O2-tariff-line-attributes/extracted-attributes.json');
const CHUNKS_DIR   = path.join(BACKEND_ROOT, 'data/build-time/O2-tariff-line-attributes/chunks/output');
const PLAN_FILE    = path.join(BACKEND_ROOT, 'data/build-time/O2-tariff-line-attributes/chunks/plan.json');
const VALSET_FILE  = path.join(BACKEND_ROOT, 'data/build-time/O2-tariff-line-attributes/validation-set-50.json');

const BATCH_SIZE = 500;

const CODE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

/** The 42 expected fields in each extracted JSON record. */
const EXPECTED_FIELDS: ReadonlyArray<string> = [
  'code',
  'material', 'form', 'function_', 'intended_use', 'processing_state', 'composition',
  'composite_components',
  'carbon_pct', 'chromium_pct', 'manganese_pct', 'nickel_pct', 'silicon_pct',
  'phosphorus_pct', 'aluminum_pct', 'boron_pct', 'cobalt_pct', 'copper_pct',
  'lead_pct', 'molybdenum_pct', 'niobium_pct', 'titanium_pct', 'tungsten_pct',
  'vanadium_pct', 'zirconium_pct', 'iron_pct',
  'predominant_element',
  'sieve_pass_pct_1mm', 'sieve_pass_pct_5mm',
  'made_up', 'fabric_construction',
  'electrically_warmed', 'wearable', 'electrically_heated',
  'chemical_class', 'in_solution', 'solution_purpose',
  'intended_role',
  'extracted_at', 'extraction_model', 'extraction_notes', 'validation_status',
  'extraction_confidence',
];

/** Fields that are string[] (TEXT[] in DB). */
const ARRAY_STRING_FIELDS: ReadonlySet<string> = new Set([
  'material', 'form', 'function_', 'intended_use', 'processing_state', 'composition',
]);

/** Fields that are number | null (DOUBLE PRECISION / NUMERIC). */
const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
  'carbon_pct', 'chromium_pct', 'manganese_pct', 'nickel_pct', 'silicon_pct',
  'phosphorus_pct', 'aluminum_pct', 'boron_pct', 'cobalt_pct', 'copper_pct',
  'lead_pct', 'molybdenum_pct', 'niobium_pct', 'titanium_pct', 'tungsten_pct',
  'vanadium_pct', 'zirconium_pct', 'iron_pct',
  'sieve_pass_pct_1mm', 'sieve_pass_pct_5mm',
]);

/** Fields that are boolean | null. */
const BOOL_FIELDS: ReadonlySet<string> = new Set([
  'made_up', 'electrically_warmed', 'wearable', 'electrically_heated',
  'in_solution',
]);

/** Fields that are string | null. (fabric_construction is a controlled-vocab TEXT
 *  column in the DB — knitted/crocheted/woven/wadding/other — NOT a boolean.) */
const STRING_NULLABLE_FIELDS: ReadonlySet<string> = new Set([
  'predominant_element', 'chemical_class', 'solution_purpose', 'intended_role',
  'fabric_construction',
  'extracted_at', 'extraction_model', 'extraction_notes', 'validation_status',
  'extraction_confidence',
]);

/** composite_components is jsonb (array of objects) | null. */
const JSONB_FIELDS: ReadonlySet<string> = new Set(['composite_components']);

/** Controlled-vocabulary TEXT fields → DB CHECK-constraint allowed values.
 *  Enforced in the dry-run so it is a true pre-ingest gate: without this, a bad
 *  vocab value passes the type check and only fails mid-transaction at --ingest. */
const ENUM_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['chemical_class', new Set(['separate_organic_compound', 'separate_inorganic_compound', 'isomer_mixture', 'sugar_derivative', 'diazonium_salt', 'other'])],
  ['fabric_construction', new Set(['knitted', 'crocheted', 'woven', 'wadding', 'other'])],
  ['intended_role', new Set(['packaging', 'support', 'technical_use', 'implant', 'optical_element', 'other'])],
  ['solution_purpose', new Set(['safety_transport', 'specific_use', 'none'])],
  ['validation_status', new Set(['pending', 'validated', 'flagged'])],
]);

/** DB columns: same as EXPECTED_FIELDS minus extraction_confidence. */
const DB_COLUMNS: ReadonlyArray<string> = EXPECTED_FIELDS.filter(
  (f) => f !== 'extraction_confidence',
);

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

interface RawRecord {
  code: string;
  [key: string]: unknown;
}

interface ChunkPlan {
  chunk_id: string;
  chapters: string[];
  code_count_in_scope: number;
  input_file: string;
  deny_list_codes: string[];
}

interface Plan {
  chunks: ChunkPlan[];
}

interface MergedRecord extends RawRecord {
  _source: string; // filename for error messages
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function die(msg: string, code: 1 | 2): never {
  console.error(`\n[FATAL] ${msg}`);
  process.exit(code);
}

function loadJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

/* ---------------------------------------------------------------------------
 * Validation
 * --------------------------------------------------------------------------- */

function validateRecord(rec: RawRecord, source: string): string[] {
  const errors: string[] = [];

  // Code format
  if (typeof rec.code !== 'string' || !CODE_RE.test(rec.code)) {
    errors.push(`code "${String(rec.code)}" fails regex ${CODE_RE.source}`);
  }

  // All expected fields present
  for (const field of EXPECTED_FIELDS) {
    if (!(field in rec)) {
      errors.push(`missing field "${field}"`);
    }
  }

  // Type checks
  for (const field of ARRAY_STRING_FIELDS) {
    const val = rec[field];
    if (!Array.isArray(val)) {
      errors.push(`field "${field}" must be array, got ${typeof val}`);
    } else if (!val.every((v) => typeof v === 'string')) {
      errors.push(`field "${field}" must be string[], found non-string element`);
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const val = rec[field];
    if (val !== null && typeof val !== 'number') {
      errors.push(`field "${field}" must be number|null, got ${typeof val}`);
    }
  }

  for (const field of BOOL_FIELDS) {
    const val = rec[field];
    if (val !== null && typeof val !== 'boolean') {
      errors.push(`field "${field}" must be boolean|null, got ${typeof val}`);
    }
  }

  for (const field of STRING_NULLABLE_FIELDS) {
    const val = rec[field];
    if (val !== null && typeof val !== 'string') {
      errors.push(`field "${field}" must be string|null, got ${typeof val}`);
    }
  }

  for (const field of JSONB_FIELDS) {
    const val = rec[field];
    if (val !== null && !Array.isArray(val) && typeof val !== 'object') {
      errors.push(`field "${field}" must be object|array|null, got ${typeof val}`);
    }
  }

  // Enum membership (mirrors DB CHECK constraints) — catches bad vocab pre-ingest.
  for (const [field, allowed] of ENUM_FIELDS) {
    const val = rec[field];
    if (typeof val === 'string' && !allowed.has(val)) {
      errors.push(`field "${field}" value "${val}" violates DB CHECK (allowed: ${[...allowed].join(', ')})`);
    }
  }

  return errors;
}

/* ---------------------------------------------------------------------------
 * Discovery
 * --------------------------------------------------------------------------- */

function discoverFiles(plan: Plan): {
  baseExists: boolean;
  completedChunks: string[];
  missingChunks: string[];
  chunkFiles: Map<string, string>; // chunk_id -> absolute file path
} {
  const baseExists = fs.existsSync(BASE_FILE);

  const completedChunks: string[] = [];
  const missingChunks: string[] = [];
  const chunkFiles = new Map<string, string>();

  for (const chunk of plan.chunks) {
    const outputFile = path.join(CHUNKS_DIR, `${chunk.chunk_id}.json`);
    if (fs.existsSync(outputFile)) {
      completedChunks.push(chunk.chunk_id);
      chunkFiles.set(chunk.chunk_id, outputFile);
    } else {
      missingChunks.push(chunk.chunk_id);
    }
  }

  return { baseExists, completedChunks, missingChunks, chunkFiles };
}

/* ---------------------------------------------------------------------------
 * Load + merge
 * --------------------------------------------------------------------------- */

function loadAndMerge(
  baseExists: boolean,
  chunkFiles: Map<string, string>,
  valSetCodes: Set<string>,
  plan: Plan,
): {
  merged: Map<string, MergedRecord>;
  perChunkCounts: Map<string, number>;
  baseCount: number;
} {
  const merged = new Map<string, MergedRecord>();
  const perChunkCounts = new Map<string, number>();
  let baseCount = 0;
  let totalValidationErrors = 0;

  // Load base file (Ch.01)
  if (baseExists) {
    const raw = loadJson(BASE_FILE);
    if (!Array.isArray(raw)) die('extracted-attributes.json is not an array', 1);

    for (const item of raw as unknown[]) {
      const rec = item as RawRecord;
      const errs = validateRecord(rec, 'extracted-attributes.json');
      if (errs.length > 0) {
        console.error(`[VALIDATION] ${rec.code ?? '?'} (base): ${errs.join('; ')}`);
        totalValidationErrors++;
      }
      if (valSetCodes.has(rec.code)) {
        die(`Validation-set LEAK detected: code ${rec.code} found in extracted-attributes.json`, 1);
      }
      if (merged.has(rec.code)) {
        die(`DUPLICATE code ${rec.code} in extracted-attributes.json (already seen)`, 1);
      }
      merged.set(rec.code, { ...rec, _source: 'extracted-attributes.json' });
      baseCount++;
    }
    console.log(`  [base] extracted-attributes.json: ${baseCount} records`);
  }

  // Load each chunk
  for (const [chunkId, filePath] of chunkFiles.entries()) {
    const raw = loadJson(filePath);
    if (!Array.isArray(raw)) die(`${chunkId}.json is not an array`, 1);

    let chunkCount = 0;
    for (const item of raw as unknown[]) {
      const rec = item as RawRecord;
      const errs = validateRecord(rec, `${chunkId}.json`);
      if (errs.length > 0) {
        console.error(`[VALIDATION] ${rec.code ?? '?'} (${chunkId}): ${errs.join('; ')}`);
        totalValidationErrors++;
      }
      if (valSetCodes.has(rec.code)) {
        die(`Validation-set LEAK detected: code ${rec.code} found in ${chunkId}.json`, 1);
      }
      if (merged.has(rec.code)) {
        const existing = merged.get(rec.code)!;
        die(
          `DUPLICATE code ${rec.code}: found in both "${existing._source}" and "${chunkId}.json"`,
          1,
        );
      }
      merged.set(rec.code, { ...rec, _source: `${chunkId}.json` });
      chunkCount++;
    }
    perChunkCounts.set(chunkId, chunkCount);
    console.log(`  [chunk] ${chunkId}: ${chunkCount} records`);
  }

  if (totalValidationErrors > 0) {
    die(`${totalValidationErrors} validation error(s) found — aborting`, 1);
  }

  return { merged, perChunkCounts, baseCount };
}

/* ---------------------------------------------------------------------------
 * Stats report
 * --------------------------------------------------------------------------- */

function printStats(
  merged: Map<string, MergedRecord>,
  perChunkCounts: Map<string, number>,
  baseCount: number,
  plan: Plan,
  missingChunks: string[],
  completedChunks: string[],
): void {
  const total = merged.size;

  console.log('\n========== O2 AGGREGATE STATS ==========');
  console.log(`Total records merged:  ${total}`);
  console.log(`  Ch.01 base file:     ${baseCount}`);
  console.log(`  Chunk files:         ${total - baseCount}`);
  console.log(`  Chunks complete:     ${completedChunks.length} / ${plan.chunks.length}`);

  if (missingChunks.length > 0) {
    console.log(`\nMISSING chunks (${missingChunks.length}):`);
    for (const id of missingChunks) {
      const chunk = plan.chunks.find((c) => c.chunk_id === id);
      const scope = chunk?.code_count_in_scope ?? '?';
      console.log(`  - ${id}  (expected ~${scope} codes)`);
    }
  } else {
    console.log('\nAll 41 chunks COMPLETE.');
  }

  // Per-chunk count vs plan
  if (perChunkCounts.size > 0) {
    console.log('\nPer-chunk counts vs plan:');
    for (const chunk of plan.chunks) {
      const actual = perChunkCounts.get(chunk.chunk_id);
      if (actual === undefined) continue;
      const expected = chunk.code_count_in_scope;
      const match = actual === expected ? 'OK' : `MISMATCH (expected ${expected})`;
      console.log(`  ${chunk.chunk_id}: ${actual}  ${match}`);
    }
  }

  // Confidence distribution
  const confBuckets: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, OTHER: 0 };
  for (const rec of merged.values()) {
    const conf = typeof rec['extraction_confidence'] === 'string'
      ? (rec['extraction_confidence'] as string)
      : 'OTHER';
    if (conf === 'HIGH' || conf === 'MEDIUM' || conf === 'LOW') {
      confBuckets[conf] = (confBuckets[conf] ?? 0) + 1;
    } else {
      confBuckets['OTHER'] = (confBuckets['OTHER'] ?? 0) + 1;
    }
  }
  console.log('\nConfidence distribution:');
  for (const [k, v] of Object.entries(confBuckets)) {
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${k.padEnd(8)}: ${v}  (${pct}%)`);
  }

  // Field population stats
  console.log('\nField population stats:');

  // chemical_class
  const withChemClass = [...merged.values()].filter(
    (r) => r['chemical_class'] !== null && r['chemical_class'] !== undefined,
  ).length;
  console.log(
    `  chemical_class set:       ${withChemClass} / ${total}  (${pct(withChemClass, total)}%)`,
  );

  // At least one numeric_pct set
  const numericPctFields = [...NUMERIC_FIELDS];
  const withAnyPct = [...merged.values()].filter((r) =>
    numericPctFields.some((f) => r[f] !== null && r[f] !== undefined),
  ).length;
  console.log(
    `  any numeric_pct set:      ${withAnyPct} / ${total}  (${pct(withAnyPct, total)}%)`,
  );

  // composite_components set
  const withComposite = [...merged.values()].filter(
    (r) => r['composite_components'] !== null && r['composite_components'] !== undefined,
  ).length;
  console.log(
    `  composite_components set: ${withComposite} / ${total}  (${pct(withComposite, total)}%)`,
  );

  // extraction_notes set
  const withNotes = [...merged.values()].filter(
    (r) => r['extraction_notes'] !== null && r['extraction_notes'] !== undefined,
  ).length;
  console.log(
    `  extraction_notes set:     ${withNotes} / ${total}  (${pct(withNotes, total)}%)`,
  );

  console.log('\nValidation-set leak count: 0  (PASS)');
  console.log('=========================================\n');
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.0';
  return ((n / total) * 100).toFixed(1);
}

/* ---------------------------------------------------------------------------
 * Ingest
 * --------------------------------------------------------------------------- */

/**
 * Build a single row's parameter array for the INSERT, dropping extraction_confidence.
 * DB columns order matches DB_COLUMNS exactly.
 */
function buildRowParams(rec: MergedRecord): unknown[] {
  return DB_COLUMNS.map((col) => {
    const val = rec[col];
    if (val === undefined || val === null) return null;

    // composite_components is JSONB (array of objects). node-postgres serializes a
    // JS ARRAY parameter as a Postgres array literal — NOT as JSON — which makes
    // Postgres reject it ("invalid input syntax for type json"). Stringify it so it
    // is sent as text and parsed into jsonb. (TEXT[] columns are left as JS arrays,
    // which pg correctly serializes to Postgres arrays.)
    if (JSONB_FIELDS.has(col)) return JSON.stringify(val);

    return val;
  });
}

async function ingest(merged: Map<string, MergedRecord>): Promise<void> {
  // Prefer the pooled DATABASE_URL (Supavisor, port 6543) — the correct, working
  // connection for app-level DML. DIRECT_URL (port 5432) is migration-only and
  // currently rejects auth (it carries the pooler-style username against the
  // direct host, which Postgres rejects with 28P01).
  const connStr = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connStr) die('Neither DATABASE_URL nor DIRECT_URL is set in env', 2);

  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const client = await pool.connect();

  try {
    console.log('\nStarting ingest transaction...');
    await client.query('BEGIN');

    const records = [...merged.values()];
    let insertedTotal = 0;
    let batchNum = 0;

    // Build ON CONFLICT DO UPDATE SET clause (all DB columns except code)
    const updateCols = DB_COLUMNS.filter((c) => c !== 'code');
    const updateClause = updateCols
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      batchNum++;

      // Build multi-row parameterized INSERT
      const colCount = DB_COLUMNS.length;
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      for (const rec of batch) {
        const rowParams = buildRowParams(rec);
        const placeholders = rowParams.map(() => `$${paramIdx++}`).join(', ');
        valuePlaceholders.push(`(${placeholders})`);
        params.push(...rowParams);
      }

      const colList = DB_COLUMNS.map((c) => `"${c}"`).join(', ');
      const sql = `
        INSERT INTO tariff_line_attributes (${colList})
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (code) DO UPDATE SET ${updateClause}
      `;

      try {
        await client.query(sql, params);
        insertedTotal += batch.length;
        console.log(`  Batch ${batchNum}: upserted ${batch.length} rows (total so far: ${insertedTotal})`);
      } catch (err: unknown) {
        // Identify offending record for debugging
        const codes = batch.map((r) => r.code).join(', ');
        console.error(`[DB ERROR] Batch ${batchNum} failed. Codes in batch: ${codes}`);
        console.error(err instanceof Error ? err.message : String(err));
        await client.query('ROLLBACK');
        client.release();
        await pool.end();
        die(`DB error during batch ${batchNum} — transaction rolled back`, 2);
      }
    }

    await client.query('COMMIT');
    console.log(`\nCommit successful. ${insertedTotal} rows upserted.`);

    // Requery count
    const countRes = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tariff_line_attributes',
    );
    const newCount = countRes.rows[0]?.count ?? '?';
    console.log(`tariff_line_attributes total rows (post-ingest): ${newCount}`);
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[DB ERROR]', err instanceof Error ? err.message : String(err));
    client.release();
    await pool.end();
    die('Unexpected DB error — transaction rolled back', 2);
  } finally {
    client.release();
    await pool.end();
  }
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isIngest = args.includes('--ingest');
  const mode = isIngest ? 'INGEST' : 'DRY-RUN';

  console.log(`\nO2 Aggregate and Ingest — mode: ${mode}`);
  console.log('='.repeat(50));

  // Load plan
  if (!fs.existsSync(PLAN_FILE)) die(`plan.json not found at ${PLAN_FILE}`, 1);
  const plan = loadJson(PLAN_FILE) as Plan;
  if (!Array.isArray(plan.chunks)) die('plan.json has no chunks array', 1);

  // Load validation set codes
  if (!fs.existsSync(VALSET_FILE)) die(`validation-set-50.json not found at ${VALSET_FILE}`, 1);
  const valSetRaw = loadJson(VALSET_FILE) as Array<{ code: string }>;
  const valSetCodes = new Set(valSetRaw.map((v) => v.code));
  console.log(`Validation set: ${valSetCodes.size} codes loaded`);

  // Discover files
  console.log('\nDiscovering files...');
  const { baseExists, completedChunks, missingChunks, chunkFiles } = discoverFiles(plan);

  if (!baseExists && chunkFiles.size === 0) {
    console.log('\nNo output files found yet. Nothing to process.');
    console.log('Run extraction agents first, then re-run this script.');
    process.exit(0);
  }

  if (!baseExists) {
    console.warn('[WARN] Base file extracted-attributes.json not found — skipping Ch.01');
  }

  // Load and merge
  console.log('\nLoading and merging records...');
  const { merged, perChunkCounts, baseCount } = loadAndMerge(
    baseExists,
    chunkFiles,
    valSetCodes,
    plan,
  );

  // Stats
  printStats(merged, perChunkCounts, baseCount, plan, missingChunks, completedChunks);

  if (merged.size === 0) {
    console.log('No records to ingest. Exiting.');
    process.exit(0);
  }

  // Ingest if requested
  if (isIngest) {
    await ingest(merged);
  } else {
    console.log('Dry-run complete. Pass --ingest to write to the database.');
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[UNHANDLED]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

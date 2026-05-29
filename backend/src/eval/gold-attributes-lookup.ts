// backend/src/eval/gold-attributes-lookup.ts
//
// Gold tariff_line_attributes lookup for the answer-simulation harness.
//
// Returns the gold-true value array for a (code, discriminating-attribute) pair.
// The six discriminating attributes map 1:1 to string-array columns in
// `tariff_line_attributes`; the only name skew is `function` → `function_`
// (Postgres reserved word). Lookups are cached per code so a multi-round case
// (and repeated cases sharing a code) hits the source once.
//
// ORACLE DECONTAMINATION (Ultimate-Brain v2 §4): by DEFAULT the simulator answers
// from the IMMUTABLE P0 snapshot fixture `fixtures/gold-attributes-frozen.json`,
// NOT the live `tariff_line_attributes` table. P3 enrichment will later rewrite
// that table; reading it live would let ASK-recovery self-grade (the model is fed
// the answer it later learned). The live-DB read stays available behind
// `GOLD_ATTR_SOURCE=live` ONLY for regenerating the fixture / debugging.

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import type { AttributeKey } from '../classifier-v2/types';

/** AttributeKey → DB column name. Only `function` differs (`function_`). */
const ATTR_TO_COLUMN: Record<AttributeKey, string> = {
  material: 'material',
  form: 'form',
  function: 'function_',
  intended_use: 'intended_use',
  processing_state: 'processing_state',
  composition: 'composition',
};

/** Raw row: every discriminating column for one code (string[] or null). */
interface GoldAttributesRow {
  material: string[] | null;
  form: string[] | null;
  function_: string[] | null;
  intended_use: string[] | null;
  processing_state: string[] | null;
  composition: string[] | null;
}

let _pool: Pool | null = null;
const _cache = new Map<string, GoldAttributesRow | null>();

/** Loaded-once frozen fixture: code → six core attribute columns. */
let _frozen: Record<string, GoldAttributesRow> | null = null;

/** Absolute path to the immutable P0 snapshot fixture. */
const FROZEN_FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'gold-attributes-frozen.json');

/** True when the live-DB read is explicitly requested (regeneration/debug only). */
function useLiveSource(): boolean {
  return (process.env.GOLD_ATTR_SOURCE ?? '').toLowerCase() === 'live';
}

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error('gold-attributes-lookup: DATABASE_URL is not set in env');
  }
  _pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  return _pool;
}

/** Load + cache the frozen fixture once. Throws a clear error if it is missing. */
function loadFrozen(): Record<string, GoldAttributesRow> {
  if (_frozen) return _frozen;
  if (!fs.existsSync(FROZEN_FIXTURE_PATH)) {
    throw new Error(
      `gold-attributes-lookup: frozen fixture not found at ${FROZEN_FIXTURE_PATH}. ` +
        `Generate it with: npx tsx --require dotenv/config scripts/snapshot-gold-attributes.ts ` +
        `(or set GOLD_ATTR_SOURCE=live to read the DB directly).`,
    );
  }
  const raw = fs.readFileSync(FROZEN_FIXTURE_PATH, 'utf-8');
  _frozen = JSON.parse(raw) as Record<string, GoldAttributesRow>;
  return _frozen;
}

/**
 * Fetch the gold-true value array for one code + discriminating attribute.
 *
 * Source: the frozen P0 fixture by DEFAULT (oracle decontamination §4); the live
 * `tariff_line_attributes` table only when `GOLD_ATTR_SOURCE=live`.
 *
 * Returns `null` when the code has no attributes row, OR the column is null/empty
 * for that code (i.e. the gold provides no answer for this attribute — the caller
 * treats that as unanswerable). The per-code row is cached after the first read.
 * Signature + null-when-absent semantics are unchanged by the source switch.
 */
export async function getGoldAttributeValues(
  code: string,
  attribute: AttributeKey,
): Promise<string[] | null> {
  let row: GoldAttributesRow | null | undefined = _cache.get(code);
  if (row === undefined) {
    if (useLiveSource()) {
      const res = await getPool().query<GoldAttributesRow>(
        `SELECT material, form, function_, intended_use, processing_state, composition
         FROM tariff_line_attributes
         WHERE code = $1
         LIMIT 1`,
        [code],
      );
      row = res.rows[0] ?? null;
    } else {
      row = loadFrozen()[code] ?? null;
    }
    _cache.set(code, row);
  }
  if (row === null) return null;

  const column = ATTR_TO_COLUMN[attribute] as keyof GoldAttributesRow;
  const value = row[column];
  if (!Array.isArray(value) || value.length === 0) return null;
  return value;
}

/** Test/teardown hook — close the pool so the eval process can exit cleanly. */
export async function closeGoldAttributesPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  _cache.clear();
}

/** Test hook: drop the cached frozen fixture + per-code cache (forces a reload). */
export function _resetGoldAttributesCacheForTest(): void {
  _frozen = null;
  _cache.clear();
}

// backend/src/eval/gold-attributes-lookup.ts
//
// Gold tariff_line_attributes lookup for the answer-simulation harness.
//
// Returns the gold-true value array for a (code, discriminating-attribute) pair.
// The six discriminating attributes map 1:1 to string-array columns in
// `tariff_line_attributes`; the only name skew is `function` → `function_`
// (Postgres reserved word). Lookups are cached per code so a multi-round case
// (and repeated cases sharing a code) hits the DB once.

import { Pool } from 'pg';
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

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error('gold-attributes-lookup: DATABASE_URL is not set in env');
  }
  _pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  return _pool;
}

/**
 * Fetch the gold-true value array for one code + discriminating attribute.
 *
 * Returns `null` when the code has no attributes row, OR the column is null/empty
 * for that code (i.e. the gold provides no answer for this attribute — the caller
 * treats that as unanswerable). The per-code row is cached after the first query.
 */
export async function getGoldAttributeValues(
  code: string,
  attribute: AttributeKey,
): Promise<string[] | null> {
  let row: GoldAttributesRow | null | undefined = _cache.get(code);
  if (row === undefined) {
    const res = await getPool().query<GoldAttributesRow>(
      `SELECT material, form, function_, intended_use, processing_state, composition
       FROM tariff_line_attributes
       WHERE code = $1
       LIMIT 1`,
      [code],
    );
    row = res.rows[0] ?? null;
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

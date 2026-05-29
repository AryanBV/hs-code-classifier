// backend/scripts/snapshot-gold-attributes.ts
//
// Oracle decontamination (Ultimate-Brain v2 §4). Snapshots the SIX core
// attribute columns of `tariff_line_attributes` AS-OF-P0 into an immutable,
// version-controlled JSON fixture. The answer-simulator reads this frozen fixture
// by default so ASK-recovery cannot self-grade once P3 enrichment rewrites the
// live table.
//
// Read-only. Run from backend/:
//   npx tsx --require dotenv/config scripts/snapshot-gold-attributes.ts
//
// Output: backend/src/eval/fixtures/gold-attributes-frozen.json
//   { "<code>": { material, form, function_, intended_use, processing_state, composition }, ... }
// Each value is string[] (possibly empty) or null, mirroring the DB column.

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface FrozenAttributesRow {
  code: string;
  material: string[] | null;
  form: string[] | null;
  function_: string[] | null;
  intended_use: string[] | null;
  processing_state: string[] | null;
  composition: string[] | null;
}

type FrozenAttributes = Omit<FrozenAttributesRow, 'code'>;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error('snapshot-gold-attributes: DATABASE_URL is not set in env');
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  try {
    const res = await pool.query<FrozenAttributesRow>(
      `SELECT code, material, form, function_, intended_use, processing_state, composition
       FROM tariff_line_attributes
       ORDER BY code`,
    );

    // Object keyed by code → the six core columns. Deterministic key order (ORDER BY code).
    const out: Record<string, FrozenAttributes> = {};
    for (const row of res.rows) {
      out[row.code] = {
        material: row.material,
        form: row.form,
        function_: row.function_,
        intended_use: row.intended_use,
        processing_state: row.processing_state,
        composition: row.composition,
      };
    }

    const fixturesDir = path.resolve(__dirname, '../src/eval/fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    const outPath = path.join(fixturesDir, 'gold-attributes-frozen.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

    const count = Object.keys(out).length;
    console.log(`Snapshot written: ${outPath}`);
    console.log(`Rows: ${count}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

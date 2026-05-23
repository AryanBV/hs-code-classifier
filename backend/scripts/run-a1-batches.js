// Runs the A1 applier batches against Supabase Postgres directly.
// Usage: node backend/scripts/run-a1-batches.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BATCH_DIR = path.resolve(__dirname, '..', 'data', 'phase-3.5-prompts', 'batches');

const FILES_ORDER = [
  // A1c already applied via MCP - skip
  // 'A1c-batch-1.sql',
  // A1a batch 1 already applied via MCP
  // 'A1a-batch-1.sql',
  'A1a-batch-2.sql',
  'A1a-batch-3.sql',
  'A1a-batch-4.sql',
  'A1a-batch-5.sql',
  'A1a-batch-6.sql',
  'A1d-batch-1.sql',
  'A1d-batch-2.sql',
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('No DATABASE_URL/DIRECT_URL in env');
  console.log('Connecting via', url.replace(/:[^:@]*@/, ':***@'));

  const client = new Client({ connectionString: url });
  await client.connect();

  const summary = [];
  try {
    const pre = await client.query('SELECT count(*)::int AS c FROM chapter_exclusions');
    console.log(`PRE total: ${pre.rows[0].c}`);

    for (const fname of FILES_ORDER) {
      const fpath = path.join(BATCH_DIR, fname);
      const sql = fs.readFileSync(fpath, 'utf-8');
      const before = await client.query('SELECT count(*)::int AS c FROM chapter_exclusions');
      const t0 = Date.now();
      try {
        const res = await client.query(sql);
        const after = await client.query('SELECT count(*)::int AS c FROM chapter_exclusions');
        const inserted = after.rows[0].c - before.rows[0].c;
        const rowsReturned = Array.isArray(res) ? res[res.length - 1].rowCount : (res.rowCount || 0);
        const ms = Date.now() - t0;
        const line = `${fname}: inserted=${inserted}, returning_rows=${rowsReturned}, ms=${ms}`;
        console.log(line);
        summary.push({ file: fname, inserted, returning_rows: rowsReturned, ms });
      } catch (err) {
        console.error(`ERROR in ${fname}:`, err.message);
        summary.push({ file: fname, error: err.message });
        throw err;
      }
    }

    const post = await client.query('SELECT count(*)::int AS c FROM chapter_exclusions');
    console.log(`POST total: ${post.rows[0].c}`);
    console.log('SUMMARY:', JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

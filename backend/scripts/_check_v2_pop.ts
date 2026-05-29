import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const tables = ['chapters', 'headings', 'subheadings', 'tariff_lines'];
  
  console.log('=== embedding_v2 population ===');
  console.log('table_name'.padEnd(15) + 'total'.padStart(8) + 'v2_pop'.padStart(9) + 'v2_null'.padStart(9));
  for (const t of tables) {
    const r = await pool.query(`
      SELECT COUNT(*)::int total, COUNT(embedding_v2)::int v2pop, COUNT(*) FILTER (WHERE embedding_v2 IS NULL)::int v2null
      FROM ${t}
    `);
    const row = r.rows[0];
    console.log(
      t.padEnd(15) +
      String(row.total).padStart(8) +
      String(row.v2pop).padStart(9) +
      String(row.v2null).padStart(9)
    );
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

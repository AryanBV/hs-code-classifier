import 'dotenv/config';
import { Pool } from 'pg';
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  for (const t of ['chapters','headings','subheadings','tariff_lines']) {
    const r = await pool.query(`SELECT COUNT(*)::int total, COUNT(embedding_v2)::int v2 FROM ${t}`);
    console.log(`${t}: ${r.rows[0].v2}/${r.rows[0].total}`);
  }
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});

import 'dotenv/config';
import { Pool } from 'pg';
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const r = await pool.query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%embedding_v2_hnsw%' ORDER BY tablename`);
  console.log('v2 HNSW indexes built:', r.rows.length);
  for (const row of r.rows) console.log('  ', row.tablename, row.indexname);
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});

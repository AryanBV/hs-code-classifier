import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  const tables = ['chapters', 'headings', 'subheadings', 'tariff_lines'];

  console.log('=== Column types (embedding / embedding_v2) ===');
  const cols = await pool.query(`
    SELECT table_name, column_name, udt_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1)
      AND column_name IN ('embedding','embedding_v2')
    ORDER BY table_name, column_name
  `, [tables]);
  for (const r of cols.rows) console.log(`  ${r.table_name}.${r.column_name}  udt=${r.udt_name} data_type=${r.data_type}`);

  console.log('\n=== pgvector typmod (dimensions) for embedding columns ===');
  const typmod = await pool.query(`
    SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS full_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname = ANY($1)
      AND a.attname IN ('embedding','embedding_v2') AND NOT a.attisdropped
    ORDER BY c.relname, a.attname
  `, [tables]);
  for (const r of typmod.rows) console.log(`  ${r.table_name}.${r.column_name}  ${r.full_type}`);

  console.log('\n=== Existing indexes on these tables (vector-related) ===');
  const idx = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename = ANY($1)
      AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%' OR indexdef ILIKE '%vector%')
    ORDER BY tablename, indexname
  `, [tables]);
  for (const r of idx.rows) console.log(`  [${r.tablename}] ${r.indexname}\n      ${r.indexdef}`);

  console.log('\n=== Row counts + embedding population ===');
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*)::int total, COUNT(embedding)::int with_emb FROM ${t}`);
    console.log(`  ${t}: total=${r.rows[0].total} with_embedding=${r.rows[0].with_emb}`);
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

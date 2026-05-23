/**
 * Snapshot the legacy tables (hs_codes, hs_code_hierarchy, product_synonyms,
 * differentiators, heading_differentiator_summary) to JSON before they're
 * dropped in the Phase 2g cleanup.
 *
 * Output: backend/backups/legacy-tables-<ISO-date>.json
 *
 * This is the "insurance pg_dump" the user requested. Restorable via the
 * companion restore script (not built yet — JSON.parse + prisma.createMany).
 *
 * Run: cd backend && npx ts-node scripts/backup-legacy-tables.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

const BACKUP_DIR = path.resolve(__dirname, '../backups');

async function main(): Promise<void> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const outPath = path.join(BACKUP_DIR, `legacy-tables-${stamp}.json`);

  console.log(`[backup-legacy] dumping legacy tables to ${outPath}`);
  const t0 = Date.now();

  // Discover which legacy tables actually exist (Phase 2a already dropped some)
  const existing = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN
     ('hs_codes','hs_code_hierarchy','product_synonyms','differentiators','heading_differentiator_summary')`,
  );
  const presentTables = new Set(existing.map((r) => r.table_name));
  console.log(`  found legacy tables: ${[...presentTables].join(', ') || 'none'}`);

  const tables: Record<string, { row_count: number; rows: unknown[] }> = {};

  for (const table of ['hs_codes', 'hs_code_hierarchy', 'product_synonyms', 'differentiators', 'heading_differentiator_summary']) {
    if (!presentTables.has(table)) {
      tables[table] = { row_count: 0, rows: [] };
      continue;
    }
    // For hs_codes: SKIP embedding column entirely (too large, regenerated anyway)
    const query = table === 'hs_codes'
      ? 'SELECT id, code, description, chapter, heading, subheading, country_code, duty_rate, keywords, common_products, synonyms, export_policy, notes, is_other, parent_heading, created_at, updated_at FROM hs_codes'
      : `SELECT * FROM ${table}`;
    const rows = await prisma.$queryRawUnsafe<unknown[]>(query);
    tables[table] = { row_count: rows.length, rows };
  }

  const payload = {
    backed_up_at: new Date().toISOString(),
    note: 'Legacy table snapshot taken before Phase 2g drops these tables. embedding column on hs_codes cast to text for JSON serialization.',
    tables_found: [...presentTables],
    tables,
  };

  // BigInt-safe stringify (Prisma raw query returns BigInts for some columns)
  const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  fs.writeFileSync(outPath, json, 'utf-8');
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`  ✓ wrote ${outPath} (${sizeMB} MB)`);
  for (const [name, info] of Object.entries(tables)) {
    console.log(`    ${name}: ${info.row_count} rows`);
  }
  console.log(`  elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[backup-legacy] FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});

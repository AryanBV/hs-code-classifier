/**
 * Apply generated bulk-INSERT SQL files to the database in FK-safe order.
 *
 * Reads backend/data/load-sql/*.sql in alphabetical order and runs each
 * via $executeRawUnsafe. Each SQL file is a single multi-row INSERT.
 *
 * Run: npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/apply-load-sql.ts"
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

const SQL_DIR = path.resolve(__dirname, '../data/load-sql');

async function main(): Promise<void> {
  const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  console.log(`[apply-load-sql] found ${files.length} SQL files`);

  // Map filename prefix -> target table for idempotency check
  const PREFIX_TO_TABLE: Record<string, string> = {
    '01_': 'sections', '02_': 'chapters', '03_': 'headings',
    '04_': 'subheadings', '05_': 'tariff_lines',
    '06_': 'chapter_exclusions', '07_': 'policy_conditions',
  };

  // For each table, only apply if not yet loaded
  const tableCounts: Record<string, number> = {};
  for (const tbl of Array.from(new Set(Object.values(PREFIX_TO_TABLE)))) {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) as count FROM ${tbl}`);
    tableCounts[tbl] = Number(result[0]?.count ?? 0n);
  }

  // CLI flag: --only=06_chapter_exclusions (or any prefix substring) to apply only certain files
  const onlyFlag = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyFlag ? onlyFlag.slice('--only='.length) : null;

  for (const f of files) {
    if (only && !f.startsWith(only)) continue;
    const prefix = f.slice(0, 3);
    const tbl = PREFIX_TO_TABLE[prefix];
    if (tbl && tableCounts[tbl] && tableCounts[tbl]! > 0 && !only) {
      console.log(`  ⊘ ${f} skipped (${tbl} already has ${tableCounts[tbl]} rows)`);
      continue;
    }
    const t0 = Date.now();
    const sql = fs.readFileSync(path.join(SQL_DIR, f), 'utf-8');
    try {
      const result = await prisma.$executeRawUnsafe(sql);
      const ms = Date.now() - t0;
      const sizeKB = (sql.length / 1024).toFixed(0);
      console.log(`  ✓ ${f} (${sizeKB} KB, ${result} rows, ${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${f}: ${msg.slice(0, 500)}`);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // Final count check
  const rows = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(
    `SELECT
       (SELECT COUNT(*) FROM sections) AS sections,
       (SELECT COUNT(*) FROM chapters) AS chapters,
       (SELECT COUNT(*) FROM headings) AS headings,
       (SELECT COUNT(*) FROM subheadings) AS subheadings,
       (SELECT COUNT(*) FROM tariff_lines) AS tariff_lines,
       (SELECT COUNT(*) FROM chapter_exclusions) AS chapter_exclusions,
       (SELECT COUNT(*) FROM policy_conditions) AS policy_conditions`,
  );
  console.log('\n=== Final counts ===');
  const counts = rows[0] ?? {};
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)}${String(v).padStart(6)}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[apply-load-sql] FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});

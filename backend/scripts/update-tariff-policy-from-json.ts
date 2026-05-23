/**
 * After the policy-column re-extraction agents update canonical JSONs,
 * push the new export_policy + policy_condition values to the database.
 *
 * Strategy: Read all 97 JSONs → collect every (code, export_policy, policy_condition) triplet
 * → UPDATE tariff_lines in batches via $executeRawUnsafe with VALUES(...) UPDATE pattern.
 *
 * Idempotent: re-running has no effect once DB matches JSONs.
 *
 * Run: NODE_ENV=production npx ts-node "C:/Export Business/hs-code-classifier/backend/scripts/update-tariff-policy-from-json.ts"
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

const EXTRACTED_DIR = path.resolve(__dirname, '../data/extracted');

interface TariffLine {
  code: string;
  export_policy?: string | null;
  policy_condition?: string | null;
}
interface Subheading { tariff_lines?: TariffLine[]; }
interface Heading { subheadings?: Subheading[]; }
interface ChapterDoc { chapter: string; headings: Heading[]; }

function sqlLit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log('[update-tariff-policy] reading canonical JSONs...');
  const rows: TariffLine[] = [];
  for (const f of fs.readdirSync(EXTRACTED_DIR).sort()) {
    if (!/^chapter-\d{2}\.json$/i.test(f)) continue;
    const data = JSON.parse(fs.readFileSync(path.join(EXTRACTED_DIR, f), 'utf-8').replace(/^﻿/, '')) as ChapterDoc;
    for (const h of data.headings) {
      for (const sh of h.subheadings ?? []) {
        for (const tl of sh.tariff_lines ?? []) {
          rows.push({
            code: tl.code,
            export_policy: tl.export_policy ?? null,
            policy_condition: tl.policy_condition ?? null,
          });
        }
      }
    }
  }
  console.log(`  collected ${rows.length} tariff_lines from JSONs`);

  // Batch UPDATE via "UPDATE ... FROM (VALUES ...) AS v(code, ep, pc) WHERE tariff_lines.code = v.code"
  const BATCH = 1000;
  let totalUpdated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk
      .map((r) => `(${sqlLit(r.code)}, ${sqlLit(r.export_policy)}, ${sqlLit(r.policy_condition)})`)
      .join(',\n  ');
    const sql = `
      UPDATE tariff_lines AS tl
      SET export_policy = v.ep, policy_condition = v.pc
      FROM (VALUES\n  ${values}\n) AS v(code, ep, pc)
      WHERE tl.code = v.code
        AND (
          tl.export_policy IS DISTINCT FROM v.ep
          OR tl.policy_condition IS DISTINCT FROM v.pc
        );
    `;
    const tChunk = Date.now();
    const updated = await prisma.$executeRawUnsafe(sql);
    console.log(`  batch ${(i / BATCH) + 1}: ${chunk.length} candidates, ${updated} actually updated (${Date.now() - tChunk}ms)`);
    totalUpdated += Number(updated);
  }

  // Final stats
  const [stats] = await prisma.$queryRawUnsafe<{ free: bigint; restricted: bigint; prohibited: bigint; with_condition: bigint; total: bigint }[]>(
    `SELECT
       (SELECT COUNT(*) FROM tariff_lines WHERE export_policy = 'Free') AS free,
       (SELECT COUNT(*) FROM tariff_lines WHERE export_policy = 'Restricted') AS restricted,
       (SELECT COUNT(*) FROM tariff_lines WHERE export_policy = 'Prohibited') AS prohibited,
       (SELECT COUNT(*) FROM tariff_lines WHERE policy_condition IS NOT NULL) AS with_condition,
       (SELECT COUNT(*) FROM tariff_lines) AS total`,
  );

  console.log('\n=== Final tariff_lines policy distribution ===');
  console.log(`  Free:             ${stats?.free ?? 0}`);
  console.log(`  Restricted:       ${stats?.restricted ?? 0}`);
  console.log(`  Prohibited:       ${stats?.prohibited ?? 0}`);
  console.log(`  with condition:   ${stats?.with_condition ?? 0}`);
  console.log(`  total tariff_lines: ${stats?.total ?? 0}`);
  console.log(`  total UPDATEs:    ${totalUpdated}`);
  console.log(`  elapsed:          ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[update-tariff-policy] FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});

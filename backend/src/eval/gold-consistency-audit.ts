// backend/src/eval/gold-consistency-audit.ts
// Full-suite gold-answer consistency audit for the ~386-case master suite.
// Usage: cd backend && npx tsx --require dotenv/config src/eval/gold-consistency-audit.ts
//        (optional flag: --json  to also write eval-results/gold-consistency-audit.json)
//
// For every classify case with an expected_code it checks:
//   (a) expectedCode exists in tariff_lines
//   (b) expected_chapter === LEFT(code,2)
//   (c) expected_heading === LEFT(code,4)
//   (d) semantic plausibility: does the tariff_lines.description share a salient
//       token with the query? (heuristic flag for manual judgement)
//
// Cases are bucketed: OK / METADATA_INCONSISTENT / CODE_MISSING / SEMANTIC_SUSPECT.

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { masterSuite } from './test-suites/master-suite';
import { EvalTestCase } from './types';

type Bucket = 'OK' | 'METADATA_INCONSISTENT' | 'CODE_MISSING' | 'SEMANTIC_SUSPECT';

interface AuditRow {
  id: string;
  query: string;
  expected_code: string;
  expected_chapter?: string;
  expected_heading?: string;
  db_description: string | null;
  derived_chapter: string;
  derived_heading: string;
  chapter_ok: boolean;
  heading_ok: boolean;
  code_exists: boolean;
  shared_tokens: string[];
  bucket: Bucket;
}

// Stopwords + generic product words that are not salient nouns for plausibility.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'without', 'in', 'on', 'to', 'from',
  'by', 'at', 'as', 'is', 'are', 'be', 'this', 'that', 'these', 'those', 'other', 'others',
  'not', 'than', 'more', 'less', 'over', 'under', 'per', 'cent', 'kg', 'g', 'mm', 'cm', 'ton',
  'new', 'used', 'type', 'kind', 'set', 'sets', 'pcs', 'piece', 'pieces', 'item', 'items',
  'product', 'products', 'goods', 'article', 'articles', 'use', 'used', 'industrial', 'heavy',
  'duty', 'high', 'low', 'small', 'large', 'size', 'sized', 'made', 'grade', 'quality',
  'standard', 'premium', 'inch', 'liter', 'litre', 'ltr', 'volt', 'amp', 'watt', 'duty',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t))
  );
}

// Light singular/plural normalization so "bolts" matches "bolt".
function stem(t: string): string {
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
  if (t.endsWith('es') && t.length > 4) return t.slice(0, -2);
  if (t.endsWith('s') && t.length > 4) return t.slice(0, -1);
  return t;
}

function sharedSalient(query: string, desc: string | null): string[] {
  if (!desc) return [];
  const q = new Set([...tokenize(query)].map(stem));
  const d = new Set([...tokenize(desc)].map(stem));
  const out: string[] = [];
  for (const t of q) if (d.has(t)) out.push(t);
  return out;
}

function chapter2(code: string): string {
  return code.replace(/\./g, '').substring(0, 2);
}
function heading4(code: string): string {
  return code.replace(/\./g, '').substring(0, 4);
}

async function main(): Promise<void> {
  const writeJson = process.argv.includes('--json');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const cases: EvalTestCase[] = masterSuite.filter(
    (tc) => tc.expected_routing === 'classify' && !!tc.expected_code
  );

  // Batch-fetch all expected codes.
  const codes = [...new Set(cases.map((tc) => tc.expected_code!))];
  const dbRes = await c.query<{ code: string; description: string }>(
    `SELECT code, description FROM tariff_lines WHERE code = ANY($1::text[])`,
    [codes]
  );
  const descByCode = new Map<string, string>();
  for (const r of dbRes.rows) descByCode.set(r.code, r.description);

  const rows: AuditRow[] = [];
  for (const tc of cases) {
    const code = tc.expected_code!;
    const codeExists = descByCode.has(code);
    const desc = descByCode.get(code) ?? null;
    const dCh = chapter2(code);
    const dHd = heading4(code);
    const chapterOk = !tc.expected_chapter || tc.expected_chapter === dCh;
    const headingOk = !tc.expected_heading || tc.expected_heading === dHd;
    const shared = sharedSalient(tc.query, desc);

    let bucket: Bucket;
    if (!codeExists) bucket = 'CODE_MISSING';
    else if (!chapterOk || !headingOk) bucket = 'METADATA_INCONSISTENT';
    else if (shared.length === 0) bucket = 'SEMANTIC_SUSPECT';
    else bucket = 'OK';

    rows.push({
      id: tc.id,
      query: tc.query,
      expected_code: code,
      expected_chapter: tc.expected_chapter,
      expected_heading: tc.expected_heading,
      db_description: desc,
      derived_chapter: dCh,
      derived_heading: dHd,
      chapter_ok: chapterOk,
      heading_ok: headingOk,
      code_exists: codeExists,
      shared_tokens: shared,
      bucket,
    });
  }

  // ── Also report classify cases that have NO expected_code (missing GT) ──
  const noCode = masterSuite.filter(
    (tc) => tc.expected_routing === 'classify' && !tc.expected_code
  );

  // ── Report ──
  const byBucket: Record<Bucket, AuditRow[]> = {
    OK: [], METADATA_INCONSISTENT: [], CODE_MISSING: [], SEMANTIC_SUSPECT: [],
  };
  for (const r of rows) byBucket[r.bucket].push(r);

  const line = '='.repeat(80);
  console.log(line);
  console.log('GOLD CONSISTENCY AUDIT');
  console.log(line);
  console.log(`Total master-suite cases:           ${masterSuite.length}`);
  console.log(`Classify cases with expected_code:  ${cases.length}`);
  console.log(`Classify cases WITHOUT code (GT gap):${noCode.length}`);
  console.log('');
  console.log(`  OK:                    ${byBucket.OK.length}`);
  console.log(`  METADATA_INCONSISTENT: ${byBucket.METADATA_INCONSISTENT.length}`);
  console.log(`  CODE_MISSING:          ${byBucket.CODE_MISSING.length}`);
  console.log(`  SEMANTIC_SUSPECT:      ${byBucket.SEMANTIC_SUSPECT.length}`);
  console.log(line);

  const printBucket = (b: Bucket): void => {
    const list = byBucket[b];
    if (list.length === 0) return;
    console.log(`\n## ${b} (${list.length})`);
    for (const r of list) {
      const meta =
        b === 'METADATA_INCONSISTENT'
          ? ` [ch ${r.expected_chapter}->${r.derived_chapter}${r.chapter_ok ? '' : ' X'} | hd ${r.expected_heading}->${r.derived_heading}${r.heading_ok ? '' : ' X'}]`
          : '';
      console.log(
        `  ${r.id.padEnd(14)} ${r.expected_code}  "${r.query.slice(0, 46)}"${meta}`
      );
      console.log(
        `       DB: ${r.db_description ? r.db_description.slice(0, 72) : '<<NOT IN DB>>'}${
          b === 'SEMANTIC_SUSPECT' ? `  (shared: ${r.shared_tokens.join(',') || 'none'})` : ''
        }`
      );
    }
  };

  printBucket('CODE_MISSING');
  printBucket('METADATA_INCONSISTENT');
  printBucket('SEMANTIC_SUSPECT');

  if (noCode.length > 0) {
    console.log(`\n## CLASSIFY_NO_CODE (${noCode.length}) — chapter-only GT (not a defect, lower granularity)`);
    for (const tc of noCode) {
      console.log(`  ${tc.id.padEnd(14)} ch=${tc.expected_chapter ?? '?'} hd=${tc.expected_heading ?? '-'}  "${tc.query.slice(0, 50)}"`);
    }
  }

  const unresolved = byBucket.CODE_MISSING.length + byBucket.METADATA_INCONSISTENT.length;
  console.log(`\n${line}`);
  console.log(`HARD inconsistencies (CODE_MISSING + METADATA_INCONSISTENT): ${unresolved}`);
  console.log(`SEMANTIC_SUSPECT (needs manual judgement):                   ${byBucket.SEMANTIC_SUSPECT.length}`);
  console.log(line);

  if (writeJson) {
    const outPath = path.resolve(__dirname, '../../eval-results/gold-consistency-audit.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          totals: {
            master_suite: masterSuite.length,
            classify_with_code: cases.length,
            classify_no_code: noCode.length,
            ok: byBucket.OK.length,
            metadata_inconsistent: byBucket.METADATA_INCONSISTENT.length,
            code_missing: byBucket.CODE_MISSING.length,
            semantic_suspect: byBucket.SEMANTIC_SUSPECT.length,
          },
          rows,
          classify_no_code: noCode.map((t) => ({ id: t.id, query: t.query, chapter: t.expected_chapter, heading: t.expected_heading })),
        },
        null,
        2
      )
    );
    console.log(`JSON written: ${outPath}`);
  }

  await c.end();
  // Exit non-zero if hard inconsistencies remain (useful for CI / final verification).
  process.exitCode = unresolved > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

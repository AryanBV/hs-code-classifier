// Mechanical applier: converts A1c/A1a/A1d proposed_inserts → batched SQL files.
// Usage: node a1-applier.js
// Output: ./batches/{file}-batch-{n}.sql

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'batches');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const BATCH_SIZE = 50;

function sqlEscape(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function arrLit(arr) {
  if (arr == null || !Array.isArray(arr) || arr.length === 0) return 'NULL';
  const sorted = [...arr].map(String).sort();
  return 'ARRAY[' + sorted.map(s => sqlEscape(s)).join(',') + ']::text[]';
}

function rowSql(r) {
  const sc = sqlEscape(r.source_chapter);
  const txt = sqlEscape(r.excluded_product_text);
  const rc = arrLit(r.redirects_to_chapter);
  const rh = r.redirects_to_heading == null ? 'NULL' : sqlEscape(r.redirects_to_heading);
  const nn = r.source_note_number == null ? 'NULL' : sqlEscape(r.source_note_number);
  const nt = r.source_note_text == null ? 'NULL' : sqlEscape(r.source_note_text);
  return `(${sc}, ${txt}, ${rc}, ${rh}, ${nn}, ${nt})`;
}

function buildBatchSql(rows) {
  return `INSERT INTO chapter_exclusions (source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading, source_note_number, source_note_text)
VALUES
${rows.map(rowSql).join(',\n')}
ON CONFLICT ON CONSTRAINT chapter_exclusions_idempotent_key DO NOTHING
RETURNING id, source_chapter, source_note_number;`;
}

const files = [
  { name: 'A1c', path: path.join(DIR, 'A1c-output.json') },
  { name: 'A1a', path: path.join(DIR, 'A1a-output.json') },
  { name: 'A1d', path: path.join(DIR, 'A1d-output.json') },
];

const summary = {};

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(f.path, 'utf-8'));
  const inserts = data.proposed_inserts || [];

  // Validate / skip empty
  const valid = [];
  let skipped_empty = 0;
  for (const r of inserts) {
    if (!r.excluded_product_text || String(r.excluded_product_text).trim() === '') {
      skipped_empty++;
      continue;
    }
    valid.push(r);
  }

  // Batch
  const batches = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    batches.push(valid.slice(i, i + BATCH_SIZE));
  }

  batches.forEach((batch, idx) => {
    const sql = buildBatchSql(batch);
    const outPath = path.join(OUT, `${f.name}-batch-${idx + 1}.sql`);
    fs.writeFileSync(outPath, sql, 'utf-8');
  });

  summary[f.name] = {
    proposed: inserts.length,
    valid: valid.length,
    skipped_empty,
    batches: batches.length,
  };
}

console.log(JSON.stringify(summary, null, 2));

/* F5 normalization (per user decisions 2026-05-28):
 *   - DROP the exact free-text token "OEM-component" from intended_use[] (keep other tokens).
 *   - NORMALIZE predominant_element "Si" -> "silicon".
 * KEEP (no change): chemical_class="other", enrichment fields, dup-notes.
 * Rewrites only files that actually change; preserves 2-space indent + trailing newline. */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../data/build-time/O2-tariff-line-attributes');
const OUT = path.join(DIR, 'chunks/output');
const BASE = path.join(DIR, 'extracted-attributes.json');

const files = [BASE, ...fs.readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => path.join(OUT, f))];

let totalOemRemoved = 0;
let totalOemRecords = 0;
let totalSi = 0;
const touched = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const hadTrailingNewline = raw.endsWith('\n');
  const arr = JSON.parse(raw);
  let fileChanged = false;
  let fileOemRecords = 0;
  let fileSi = 0;

  for (const rec of arr) {
    if (Array.isArray(rec.intended_use)) {
      const before = rec.intended_use.length;
      const filtered = rec.intended_use.filter((t) => t !== 'OEM-component');
      if (filtered.length !== before) {
        const removed = before - filtered.length;
        rec.intended_use = filtered;
        totalOemRemoved += removed;
        fileOemRecords++;
        totalOemRecords++;
        fileChanged = true;
      }
    }
    if (rec.predominant_element === 'Si') {
      rec.predominant_element = 'silicon';
      totalSi++;
      fileSi++;
      fileChanged = true;
    }
  }

  if (fileChanged) {
    let out = JSON.stringify(arr, null, 2);
    if (hadTrailingNewline) out += '\n';
    fs.writeFileSync(file, out, 'utf8');
    touched.push(`${path.basename(file)}  (OEM-records: ${fileOemRecords}, Si: ${fileSi})`);
  }
}

console.log('=== F5 normalization applied ===');
console.log('"OEM-component" tokens removed :', totalOemRemoved, 'across', totalOemRecords, 'records');
console.log('predominant_element "Si"->"silicon":', totalSi, 'records');
console.log('files touched:', touched.length);
for (const t of touched) console.log('  -', t);

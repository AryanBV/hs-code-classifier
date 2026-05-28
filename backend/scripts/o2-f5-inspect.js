/* One-off read-only F5 inspection: exact corpus counts for normalization decisions. */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../data/build-time/O2-tariff-line-attributes');
const OUT = path.join(DIR, 'chunks/output');
const BASE = path.join(DIR, 'extracted-attributes.json');

const recs = [];
for (const item of JSON.parse(fs.readFileSync(BASE, 'utf8'))) recs.push({ ...item, _f: 'base' });
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.json'))) {
  for (const item of JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))) recs.push({ ...item, _f: f });
}
console.log('TOTAL records:', recs.length);

// (1) chemical_class distribution + which chapters have "other"
const cc = {};
const otherByChapter = {};
for (const r of recs) {
  const v = r.chemical_class === null || r.chemical_class === undefined ? 'NULL' : r.chemical_class;
  cc[v] = (cc[v] || 0) + 1;
  if (v === 'other') {
    const ch = r.code.slice(0, 2);
    otherByChapter[ch] = (otherByChapter[ch] || 0) + 1;
  }
}
console.log('\n(1) chemical_class distribution:');
for (const [k, v] of Object.entries(cc).sort((a, b) => b[1] - a[1])) console.log('   ', k.padEnd(32), v);
console.log('   chemical_class="other" by chapter:', JSON.stringify(otherByChapter));

// (4) "OEM-component"-style tokens in intended_use (free-text TEXT[], no DB CHECK)
const oem = recs.filter((r) => Array.isArray(r.intended_use) && r.intended_use.some((x) => typeof x === 'string' && /oem|component/i.test(x)));
const oemTokens = {};
for (const r of oem) for (const x of r.intended_use) if (/oem|component/i.test(x)) oemTokens[x] = (oemTokens[x] || 0) + 1;
console.log('\n(4) intended_use tokens matching /oem|component/i:', oem.length, 'records');
console.log('   tokens:', JSON.stringify(oemTokens));

// (5) predominant_element short/symbol-like values (not a full lowercase element word)
const pe = {};
for (const r of recs) {
  const v = r.predominant_element;
  if (typeof v === 'string' && v.length > 0) pe[v] = (pe[v] || 0) + 1;
}
const suspicious = Object.entries(pe).filter(([k]) => k.length <= 2 || /^[A-Z][a-z]?$/.test(k));
console.log('\n(5) predominant_element distinct values total:', Object.keys(pe).length);
console.log('   symbol-like (<=2 chars or Element-symbol case):', JSON.stringify(suspicious));

// (6) the 2 known benign dup-note pairs
const showNotes = ['2933.39.29', '2933.39.90', '6403.51.19', '6403.51.90'];
console.log('\n(6) dup-note pair spot-check:');
for (const code of showNotes) {
  const r = recs.find((x) => x.code === code);
  console.log('   ', code, '=>', r ? JSON.stringify((r.extraction_notes || '').slice(0, 90)) : 'NOT FOUND');
}

// Bonus: corpus-wide enum sanity for the 4 constrained text fields (independent of ingest script)
const ENUMS = {
  chemical_class: ['separate_organic_compound', 'separate_inorganic_compound', 'isomer_mixture', 'sugar_derivative', 'diazonium_salt', 'other'],
  fabric_construction: ['knitted', 'crocheted', 'woven', 'wadding', 'other'],
  intended_role: ['packaging', 'support', 'technical_use', 'implant', 'optical_element', 'other'],
  solution_purpose: ['safety_transport', 'specific_use', 'none'],
};
console.log('\n(BONUS) enum violations (corpus-wide, independent check):');
for (const [field, allowed] of Object.entries(ENUMS)) {
  const bad = {};
  for (const r of recs) {
    const v = r[field];
    if (typeof v === 'string' && !allowed.includes(v)) bad[v] = (bad[v] || 0) + 1;
  }
  console.log('   ', field.padEnd(20), Object.keys(bad).length === 0 ? 'CLEAN' : JSON.stringify(bad));
}

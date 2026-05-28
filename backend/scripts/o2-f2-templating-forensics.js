#!/usr/bin/env node
/**
 * O2-F2 Templating Forensics
 * Deterministic corpus-wide analysis of O2 chunk outputs for templating red flags.
 * No LLM calls. Pure data engineering.
 *
 * Reports:
 *  1. Corpus-wide signature diversity (unique sigs / total records)
 *  2. Cross-chunk verbatim-duplicate extraction_notes (codes sharing identical note text)
 *  3. Identical-signature clusters spanning distinct 4-digit headings (cross-heading red flag)
 *  4. Per-chunk diversity table (sig-diversity % + notes-uniqueness %, sorted ascending)
 *  5. Summary verdict: FLAG conditions
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const OUTPUT_DIR = path.resolve(
  __dirname,
  '../data/build-time/O2-tariff-line-attributes/chunks/output'
);
const BASE_FILE = path.resolve(
  __dirname,
  '../data/build-time/O2-tariff-line-attributes/extracted-attributes.json'
);

// Only load canonical chunk files (no .part*, .blocked*, .recovered*, .existing* variants)
const CHUNK_FILENAME_RE = /^(BIG|SC|SM)-[^.]+\.json$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadJsonArray(filepath) {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`  [WARN] Could not load ${filepath}: ${e.message}`);
    return [];
  }
}

/** Signature: JSON-stable sort of 5 array fields */
function recordSignature(r) {
  const pick = (arr) =>
    Array.isArray(arr) ? [...arr].sort().join('|') : String(arr ?? '');
  return JSON.stringify({
    material: pick(r.material),
    form: pick(r.form),
    function_: pick(r.function_),
    processing_state: pick(r.processing_state),
    composition: pick(r.composition),
  });
}

/** heading prefix = first 4 chars of the code, e.g. "0901" */
function heading(code) {
  return (code || '').replace(/\./g, '').substring(0, 4);
}

// ---------------------------------------------------------------------------
// Load corpus
// ---------------------------------------------------------------------------
console.log('=== O2-F2 Templating Forensics ===\n');

// Load base (Ch.01)
const baseRecords = loadJsonArray(BASE_FILE).map((r) => ({
  ...r,
  _chunkName: 'extracted-attributes.json (Ch.01)',
}));
console.log(`Base file records: ${baseRecords.length}`);

// Load chunk files
const chunkFiles = fs
  .readdirSync(OUTPUT_DIR)
  .filter((f) => CHUNK_FILENAME_RE.test(f))
  .sort();

console.log(`Canonical chunk files found: ${chunkFiles.length}`);
console.log('  ' + chunkFiles.join('\n  '));
console.log();

const chunkRecordsMap = {}; // filename -> records[]
for (const fname of chunkFiles) {
  const recs = loadJsonArray(path.join(OUTPUT_DIR, fname)).map((r) => ({
    ...r,
    _chunkName: fname,
  }));
  chunkRecordsMap[fname] = recs;
}

// Merge: deduplicate by `code` — last writer wins (chunk file overrides base if same code)
const byCode = new Map();
for (const r of baseRecords) {
  if (r.code) byCode.set(r.code, r);
}
for (const fname of chunkFiles) {
  for (const r of chunkRecordsMap[fname]) {
    if (r.code) byCode.set(r.code, r);
  }
}

const allRecords = Array.from(byCode.values());
console.log(`Total unique records (by code): ${allRecords.length}`);
const totalDupes =
  baseRecords.length +
  chunkFiles.reduce((s, f) => s + chunkRecordsMap[f].length, 0) -
  allRecords.length;
if (totalDupes > 0) {
  console.log(`  (Deduplication removed ${totalDupes} cross-source duplicates)`);
}
console.log();

// ---------------------------------------------------------------------------
// 1. Corpus-wide signature diversity
// ---------------------------------------------------------------------------
const sigSet = new Set();
const sigToRecords = new Map(); // sig -> code[]
for (const r of allRecords) {
  const sig = recordSignature(r);
  sigSet.add(sig);
  if (!sigToRecords.has(sig)) sigToRecords.set(sig, []);
  sigToRecords.get(sig).push(r.code);
}
const corpusDiversityPct = ((sigSet.size / allRecords.length) * 100).toFixed(1);

console.log('--- 1. Corpus-wide Signature Diversity ---');
console.log(`  Unique signatures : ${sigSet.size}`);
console.log(`  Total records     : ${allRecords.length}`);
console.log(`  Diversity         : ${corpusDiversityPct}%`);
console.log();

// ---------------------------------------------------------------------------
// 2. Cross-chunk verbatim-duplicate extraction_notes
// ---------------------------------------------------------------------------
console.log('--- 2. Cross-chunk Verbatim Duplicate extraction_notes ---');
const noteToEntries = new Map(); // note -> [{code, chunk}]
for (const r of allRecords) {
  const note = (r.extraction_notes || '').trim();
  if (!note) continue;
  if (!noteToEntries.has(note)) noteToEntries.set(note, []);
  noteToEntries.get(note).push({ code: r.code, chunk: r._chunkName });
}

const crossChunkDupNotes = [];
for (const [note, entries] of noteToEntries.entries()) {
  if (entries.length < 2) continue;
  // Check if entries span more than one chunk
  const chunks = new Set(entries.map((e) => e.chunk));
  if (chunks.size > 1) {
    crossChunkDupNotes.push({ note, entries, chunks: [...chunks] });
  }
}

// Also report within-corpus dups (any note appearing >1 time, regardless of chunk)
const anyDupNotes = [];
for (const [note, entries] of noteToEntries.entries()) {
  if (entries.length > 1) {
    anyDupNotes.push({ note, entries });
  }
}

if (crossChunkDupNotes.length === 0) {
  console.log('  No cross-chunk verbatim duplicate notes found. (Clean)');
} else {
  console.log(
    `  FOUND ${crossChunkDupNotes.length} cross-chunk verbatim duplicate note(s):`
  );
  for (const { note, entries, chunks } of crossChunkDupNotes) {
    console.log(`\n  NOTE: "${note.substring(0, 80)}${note.length > 80 ? '...' : ''}"`);
    console.log(`    Appears in chunks: ${chunks.join(', ')}`);
    console.log(`    Codes: ${entries.map((e) => e.code).join(', ')}`);
  }
}

if (anyDupNotes.length > 0 && crossChunkDupNotes.length === 0) {
  console.log(
    `  (${anyDupNotes.length} within-corpus dup notes exist but all are within the same chunk — benign)`
  );
} else if (anyDupNotes.length > 0) {
  console.log(`\n  Total within-corpus dup notes (any): ${anyDupNotes.length}`);
}
console.log();

// ---------------------------------------------------------------------------
// 3. Identical-signature clusters spanning DISTINCT 4-digit headings
// ---------------------------------------------------------------------------
console.log('--- 3. Identical-Signature Clusters Spanning Distinct Headings ---');
const crossHeadingClusters = [];
for (const [sig, codes] of sigToRecords.entries()) {
  if (codes.length < 2) continue;
  const headings = new Set(codes.map(heading));
  if (headings.size > 1) {
    crossHeadingClusters.push({ sig, codes, headings: [...headings] });
  }
}

// Sort by cluster size descending
crossHeadingClusters.sort((a, b) => b.codes.length - a.codes.length);

if (crossHeadingClusters.length === 0) {
  console.log('  No cross-heading identical-signature clusters found. (Clean)');
} else {
  console.log(
    `  FOUND ${crossHeadingClusters.length} cross-heading signature cluster(s):`
  );
  let shown = 0;
  for (const { sig, codes, headings } of crossHeadingClusters) {
    if (shown >= 20) {
      console.log(`  ... (${crossHeadingClusters.length - shown} more not shown)`);
      break;
    }
    const parsedSig = JSON.parse(sig);
    console.log(`\n  Cluster (${codes.length} records across ${headings.length} headings: ${headings.join(', ')})`);
    console.log(
      `    Sig: material=[${parsedSig.material}] form=[${parsedSig.form}] function_=[${parsedSig.function_}]`
    );
    console.log(`    Codes: ${codes.join(', ')}`);
    shown++;
  }
}
console.log();

// ---------------------------------------------------------------------------
// 4. Per-chunk diversity table
// ---------------------------------------------------------------------------
console.log('--- 4. Per-chunk Diversity Table (sorted ascending by sig-diversity) ---');

// Include base file in per-chunk table
const allChunkEntries = [
  { name: 'extracted-attributes.json', records: baseRecords },
  ...chunkFiles.map((f) => ({ name: f, records: chunkRecordsMap[f] })),
];

const perChunkStats = [];
for (const { name, records } of allChunkEntries) {
  if (records.length === 0) {
    perChunkStats.push({ name, count: 0, sigDivPct: 100, noteUniqPct: 100 });
    continue;
  }

  const sigs = new Set(records.map((r) => recordSignature(r)));
  const sigDivPct = (sigs.size / records.length) * 100;

  const notes = records
    .map((r) => (r.extraction_notes || '').trim())
    .filter(Boolean);
  const uniqueNotes = new Set(notes);
  const noteUniqPct =
    notes.length > 0 ? (uniqueNotes.size / notes.length) * 100 : 100;

  perChunkStats.push({
    name,
    count: records.length,
    sigDivPct: parseFloat(sigDivPct.toFixed(1)),
    noteUniqPct: parseFloat(noteUniqPct.toFixed(1)),
  });
}

// Sort ascending by sig diversity
perChunkStats.sort((a, b) => a.sigDivPct - b.sigDivPct);

const nameW = 45;
const header =
  'CHUNK'.padEnd(nameW) + 'RECS'.padStart(6) + '  SIG-DIV%'.padStart(10) + '  NOTE-UNIQ%'.padStart(12);
console.log('  ' + header);
console.log('  ' + '-'.repeat(header.length));
for (const s of perChunkStats) {
  const flag = s.sigDivPct < 70 ? ' *** LOW ***' : '';
  const row =
    s.name.padEnd(nameW) +
    String(s.count).padStart(6) +
    String(s.sigDivPct.toFixed(1) + '%').padStart(10) +
    String(s.noteUniqPct.toFixed(1) + '%').padStart(12) +
    flag;
  console.log('  ' + row);
}
console.log();

// ---------------------------------------------------------------------------
// 5. Summary verdict
// ---------------------------------------------------------------------------
console.log('--- 5. Summary Verdict ---');

const flags = [];

// Flag: any chunk <70% sig-diversity
const lowDivChunks = perChunkStats.filter(
  (s) => s.count >= 5 && s.sigDivPct < 70
);
if (lowDivChunks.length > 0) {
  flags.push(
    `LOW SIG-DIVERSITY: ${lowDivChunks.length} chunk(s) below 70%: ${lowDivChunks.map((s) => `${s.name} (${s.sigDivPct}%)`).join(', ')}`
  );
}

// Flag: cross-chunk verbatim dup notes
if (crossChunkDupNotes.length > 0) {
  flags.push(
    `CROSS-CHUNK DUP NOTES: ${crossChunkDupNotes.length} verbatim extraction_notes appear in multiple chunks`
  );
}

// Flag: cross-heading identical-signature cluster >3 records
const largeXHClusters = crossHeadingClusters.filter((c) => c.codes.length > 3);
if (largeXHClusters.length > 0) {
  flags.push(
    `LARGE CROSS-HEADING CLUSTERS: ${largeXHClusters.length} cluster(s) with >3 records spanning distinct headings`
  );
}

if (flags.length === 0) {
  console.log('  VERDICT: PASS — No major templating red flags detected.');
} else {
  console.log(`  VERDICT: FLAG — ${flags.length} issue(s) found:`);
  for (const f of flags) {
    console.log(`    [FLAG] ${f}`);
  }
}

console.log();
console.log(`Corpus sig-diversity: ${corpusDiversityPct}%`);
console.log(`Cross-chunk dup notes: ${crossChunkDupNotes.length}`);
console.log(`Cross-heading clusters (any size): ${crossHeadingClusters.length}`);
console.log(`Cross-heading clusters (>3 records): ${largeXHClusters.length}`);
console.log(`Chunks below 70% sig-diversity (min 5 records): ${lowDivChunks.length}`);
console.log('\nDone.');

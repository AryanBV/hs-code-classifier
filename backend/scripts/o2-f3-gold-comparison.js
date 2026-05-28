#!/usr/bin/env node
/**
 * O2-F3 Gold-Standard Comparison
 * Deterministic comparison of blind-extracted records vs gold validation set.
 * No LLM calls. Pure data engineering.
 *
 * Reports (for each code present in both blind and gold):
 *  1. Array-field Jaccard similarity per field + per-field mean across all codes
 *  2. Scalar/enum field exact-match agreement rates + disagreement listing
 *  3. Overall accuracy summary vs prior-failure benchmark
 *  4. Codes in gold but not blind, and vice versa
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(
  __dirname,
  '../data/build-time/O2-tariff-line-attributes'
);
const BLIND_FILE = path.join(DATA_DIR, 'f3-blind-extraction.json');
const GOLD_FILE = path.join(DATA_DIR, 'validation-set-50.json');

// ---------------------------------------------------------------------------
// Early exit if blind extraction not ready
// ---------------------------------------------------------------------------
if (!fs.existsSync(BLIND_FILE)) {
  console.log('F3 blind extraction not ready');
  console.log(`  (Expected file: ${BLIND_FILE})`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
function loadJsonArray(filepath, label) {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error(`ERROR: ${label} is not a JSON array`);
      process.exit(1);
    }
    return parsed;
  } catch (e) {
    console.error(`ERROR: Could not load ${label}: ${e.message}`);
    process.exit(1);
  }
}

console.log('=== O2-F3 Gold-Standard Comparison ===\n');

const blindRecords = loadJsonArray(BLIND_FILE, 'f3-blind-extraction.json');
const goldRecords = loadJsonArray(GOLD_FILE, 'validation-set-50.json');

console.log(`Blind records loaded : ${blindRecords.length}`);
console.log(`Gold records loaded  : ${goldRecords.length}`);
console.log();

// Index by code
const blindByCode = new Map(blindRecords.map((r) => [r.code, r]));
const goldByCode = new Map(goldRecords.map((r) => [r.code, r]));

const allCodes = new Set([...blindByCode.keys(), ...goldByCode.keys()]);
const matchedCodes = [...allCodes].filter(
  (c) => blindByCode.has(c) && goldByCode.has(c)
);
const onlyInGold = [...allCodes].filter(
  (c) => goldByCode.has(c) && !blindByCode.has(c)
);
const onlyInBlind = [...allCodes].filter(
  (c) => blindByCode.has(c) && !goldByCode.has(c)
);

console.log(`Codes in both blind + gold : ${matchedCodes.length}`);
console.log(`Codes only in gold         : ${onlyInGold.length}`);
console.log(`Codes only in blind        : ${onlyInBlind.length}`);
console.log();

if (matchedCodes.length === 0) {
  console.log('No matched codes to compare. Exiting.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------
const ARRAY_FIELDS = [
  'material',
  'form',
  'function_',
  'intended_use',
  'processing_state',
  'composition',
];

const SCALAR_FIELDS = [
  'chemical_class',
  'fabric_construction',
  'intended_role',
  'solution_purpose',
  'predominant_element',
  'made_up',
  'wearable',
  'electrically_heated',
  'in_solution',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tokenise an array field into a flat Set of lowercase tokens */
function tokenSet(arr) {
  const tokens = new Set();
  if (!Array.isArray(arr)) return tokens;
  for (const item of arr) {
    if (item == null) continue;
    // split on common delimiters and lowercase
    String(item)
      .toLowerCase()
      .split(/[\s,;/|]+/)
      .filter(Boolean)
      .forEach((t) => tokens.add(t));
  }
  return tokens;
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0; // both empty → agree
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1.0 : intersection / union;
}

function normalizeScalar(val) {
  if (val == null) return null;
  if (typeof val === 'boolean') return val;
  return String(val).toLowerCase().trim() || null;
}

// ---------------------------------------------------------------------------
// Compute per-record comparisons
// ---------------------------------------------------------------------------
// Per-field Jaccard accumulators
const jaccardSums = Object.fromEntries(ARRAY_FIELDS.map((f) => [f, 0]));
const jaccardCounts = Object.fromEntries(ARRAY_FIELDS.map((f) => [f, 0]));

// Per-field scalar agreement accumulators
const scalarAgree = Object.fromEntries(SCALAR_FIELDS.map((f) => [f, 0]));
const scalarTotal = Object.fromEntries(SCALAR_FIELDS.map((f) => [f, 0]));
const scalarDisagreements = []; // {code, field, blind, gold}

for (const code of matchedCodes.sort()) {
  const blind = blindByCode.get(code);
  const gold = goldByCode.get(code);

  // Array fields
  for (const field of ARRAY_FIELDS) {
    const bSet = tokenSet(blind[field]);
    const gSet = tokenSet(gold[field]);
    const j = jaccard(bSet, gSet);
    jaccardSums[field] += j;
    jaccardCounts[field]++;
  }

  // Scalar fields
  for (const field of SCALAR_FIELDS) {
    const bVal = normalizeScalar(blind[field]);
    const gVal = normalizeScalar(gold[field]);
    scalarTotal[field]++;
    if (bVal === gVal) {
      scalarAgree[field]++;
    } else {
      scalarDisagreements.push({
        code,
        field,
        blind: bVal,
        gold: gVal,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Array-field Jaccard results
// ---------------------------------------------------------------------------
console.log('--- 1. Array-Field Jaccard Similarity (mean across all matched codes) ---');
let totalJaccard = 0;
let fieldCount = 0;
for (const field of ARRAY_FIELDS) {
  const n = jaccardCounts[field];
  const mean = n > 0 ? jaccardSums[field] / n : 0;
  const pct = (mean * 100).toFixed(1);
  const bar = '='.repeat(Math.round(mean * 30));
  console.log(`  ${field.padEnd(18)} mean Jaccard: ${mean.toFixed(3)}  (${pct}%)  [${bar}]`);
  totalJaccard += mean;
  fieldCount++;
}
const overallMeanJaccard = fieldCount > 0 ? totalJaccard / fieldCount : 0;
console.log();
console.log(`  OVERALL mean array-Jaccard: ${overallMeanJaccard.toFixed(3)} (${(overallMeanJaccard * 100).toFixed(1)}%)`);
console.log();

// ---------------------------------------------------------------------------
// 2. Scalar/enum field agreement
// ---------------------------------------------------------------------------
console.log('--- 2. Scalar/Enum Field Agreement ---');
let totalScalarAgree = 0;
let totalScalarCases = 0;
for (const field of SCALAR_FIELDS) {
  const n = scalarTotal[field];
  const a = scalarAgree[field];
  const pct = n > 0 ? ((a / n) * 100).toFixed(1) : 'N/A';
  const flag = n > 0 && a / n < 0.7 ? ' ***' : '';
  console.log(`  ${field.padEnd(22)} ${String(a).padStart(3)}/${n}  (${pct}%)${flag}`);
  totalScalarAgree += a;
  totalScalarCases += n;
}
const overallScalarAgreePct =
  totalScalarCases > 0 ? (totalScalarAgree / totalScalarCases) * 100 : 0;
console.log();
console.log(
  `  OVERALL scalar agreement: ${totalScalarAgree}/${totalScalarCases} (${overallScalarAgreePct.toFixed(1)}%)`
);
console.log();

if (scalarDisagreements.length > 0) {
  console.log(`  Disagreements (${scalarDisagreements.length} total):`);
  // Group by field for readability
  const byField = {};
  for (const d of scalarDisagreements) {
    if (!byField[d.field]) byField[d.field] = [];
    byField[d.field].push(d);
  }
  for (const [field, diffs] of Object.entries(byField)) {
    console.log(`    [${field}]`);
    for (const d of diffs) {
      console.log(
        `      ${d.code}: blind=${JSON.stringify(d.blind)}  gold=${JSON.stringify(d.gold)}`
      );
    }
  }
} else {
  console.log('  No scalar/enum disagreements found.');
}
console.log();

// ---------------------------------------------------------------------------
// 3. Overall accuracy summary
// ---------------------------------------------------------------------------
console.log('--- 3. Overall Accuracy Summary ---');
console.log();
console.log(
  `  Mean array-Jaccard       : ${overallMeanJaccard.toFixed(3)}  (${(overallMeanJaccard * 100).toFixed(1)}%)`
);
console.log(
  `  Mean enum-agreement      : ${overallScalarAgreePct.toFixed(1)}%`
);
console.log();
console.log('  Benchmark comparison:');
console.log('    Jaccard 0.12-0.24 = TEMPLATING FAILURE (prior O2-v1 failure range)');
console.log('    Jaccard > 0.70    = GOOD');

if (overallMeanJaccard < 0.24) {
  console.log(
    `  [FAIL] Jaccard ${overallMeanJaccard.toFixed(3)} is in the templating-failure range (<0.24). Re-extraction needed.`
  );
} else if (overallMeanJaccard < 0.50) {
  console.log(
    `  [MARGINAL] Jaccard ${overallMeanJaccard.toFixed(3)} is above failure threshold but below 0.50. Review needed.`
  );
} else if (overallMeanJaccard < 0.70) {
  console.log(
    `  [ACCEPTABLE] Jaccard ${overallMeanJaccard.toFixed(3)} is above 0.50. Acceptable but not ideal.`
  );
} else {
  console.log(
    `  [GOOD] Jaccard ${overallMeanJaccard.toFixed(3)} meets the >0.70 target.`
  );
}
console.log();

// ---------------------------------------------------------------------------
// 4. Coverage gaps
// ---------------------------------------------------------------------------
console.log('--- 4. Coverage Gaps ---');
if (onlyInGold.length === 0) {
  console.log('  All gold codes present in blind extraction. (No gaps)');
} else {
  console.log(`  Codes in gold but NOT in blind (${onlyInGold.length}):`);
  console.log('    ' + onlyInGold.sort().join(', '));
}
if (onlyInBlind.length > 0) {
  console.log(`  Codes in blind but NOT in gold (${onlyInBlind.length}):`);
  console.log('    ' + onlyInBlind.sort().join(', '));
}
console.log();
console.log('Done.');

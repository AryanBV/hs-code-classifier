/**
 * O7 atomic-axis table — runtime loader (Stage S2; DARK until S4/S5 wires it).
 *
 * Loads the build-time O7 artifact
 * (`backend/data/build-time/O7-atomic-axis-typing/atomic-axes.json`) into a typed,
 * indexed lookup keyed by 6-digit subheading. For every MULTI-leaf subheading the
 * artifact records:
 *   - the discriminating CONCEPT-AXES (un-fused from the TLA arrays + leaf
 *     descriptions) — each axis = {axis, label, values_present, value_to_codes},
 *   - whether the subheading has a residual "Other / n.e.s." catch-all leaf and
 *     which code (so the divergence engine knows when NOT to ask —
 *     unmarked-default-wins), and
 *   - a classification: residual_default | askable_no_residual |
 *     single_axis_resolved | untypable.
 *
 * Loading is FAIL-SAFE (mirrors the O6 axis-table + L0 alias-map loaders): a
 * missing/corrupt file yields an EMPTY table, so a consumer simply gets `null` on
 * lookup rather than throwing — this can never break the pipeline. The parsed table
 * is cached at module scope; a test-only reset hook clears it.
 *
 * This module performs ZERO I/O beyond the one-time JSON read and is pure
 * thereafter. It is NOT yet called by any live path (Stage S4 wires the consumer).
 *
 * Derivation: backend/data/build-time/O7-atomic-axis-typing/DERIVATION.md
 */
import * as fs from 'fs';
import * as path from 'path';

/** Path to the O7 atomic-axis artifact (resolved from this module's location). */
const ATOMIC_AXES_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'build-time',
  'O7-atomic-axis-typing',
  'atomic-axes.json',
);

/** Classification of a multi-leaf subheading (mirrors the build-time enum). */
export type SubheadingClassification =
  | 'residual_default'
  | 'askable_no_residual'
  | 'single_axis_resolved'
  | 'untypable';

/** One discriminating concept-axis for a subheading. */
export interface AtomicAxis {
  /** Named concept-axis id (e.g. `thermal`, `grade`, `polymer`, `end_use`). */
  axis: string;
  /** Human-readable axis label (question scaffold). */
  label: string;
  /** Distinct value-ids present across the subheading's leaves, sorted (MECE set). */
  values_present: string[];
  /** value-id -> the 8-digit leaf codes carrying that value (the partition). */
  value_to_codes: Record<string, string[]>;
}

/** A typed multi-leaf subheading entry. */
export interface AtomicSubheadingEntry {
  /** 6-digit "NNNN.NN" subheading key. */
  subheading: string;
  heading: string;
  chapter: string;
  leaf_count: number;
  classification: SubheadingClassification;
  has_residual: boolean;
  residual_leaf_code: string | null;
  /** Discriminating axes (only those that VARY across the leaves), in priority order. */
  axes: AtomicAxis[];
  /** Raw `col::token` strings that vary across leaves but mapped to no axis (honest coverage). */
  unclassified_varying: string[];
}

/** The parsed table, indexed by subheading for O(1) lookup. */
export interface AtomicAxisTable {
  bySubheading: Map<string, AtomicSubheadingEntry>;
}

let _cached: AtomicAxisTable | null = null;

/** An always-valid empty table (the fail-safe degenerate value). */
function emptyTable(): AtomicAxisTable {
  return { bySubheading: new Map() };
}

/* ---------------------------------------------------------------------------
 * Parsing (defensive — any malformed entry is skipped, never thrown)
 * --------------------------------------------------------------------------- */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

const CLASSIFICATIONS: ReadonlySet<string> = new Set<SubheadingClassification>([
  'residual_default',
  'askable_no_residual',
  'single_axis_resolved',
  'untypable',
]);

function parseAxis(raw: unknown): AtomicAxis | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.axis !== 'string' || o.axis.length === 0) return null;
  if (!isStringArray(o.values_present) || o.values_present.length < 1) return null;
  if (o.value_to_codes === null || typeof o.value_to_codes !== 'object' || Array.isArray(o.value_to_codes)) return null;
  const value_to_codes: Record<string, string[]> = {};
  for (const [value, codes] of Object.entries(o.value_to_codes as Record<string, unknown>)) {
    if (!isStringArray(codes)) return null;
    value_to_codes[value] = codes.slice();
  }
  return {
    axis: o.axis,
    label: typeof o.label === 'string' ? o.label : o.axis,
    values_present: o.values_present.slice(),
    value_to_codes,
  };
}

function parseEntry(raw: unknown): AtomicSubheadingEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.subheading !== 'string' || !/^\d{4}\.\d{2}$/.test(o.subheading)) return null;
  if (typeof o.classification !== 'string' || !CLASSIFICATIONS.has(o.classification)) return null;

  const axes: AtomicAxis[] = [];
  if (Array.isArray(o.axes)) {
    for (const a of o.axes) {
      const parsed = parseAxis(a);
      if (parsed !== null) axes.push(parsed);
    }
  }

  const heading = typeof o.heading === 'string' ? o.heading : o.subheading.slice(0, 4);
  const chapter = typeof o.chapter === 'string' ? o.chapter : o.subheading.slice(0, 2);
  const leaf_count = typeof o.leaf_count === 'number' ? o.leaf_count : 0;
  const has_residual = o.has_residual === true;
  const residual_leaf_code =
    typeof o.residual_leaf_code === 'string' ? o.residual_leaf_code : null;
  const unclassified_varying = isStringArray(o.unclassified_varying)
    ? o.unclassified_varying.slice()
    : [];

  return {
    subheading: o.subheading,
    heading,
    chapter,
    leaf_count,
    classification: o.classification as SubheadingClassification,
    has_residual,
    residual_leaf_code,
    axes,
    unclassified_varying,
  };
}

export function parseAtomicAxisTable(rawJson: string): AtomicAxisTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return emptyTable();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyTable();
  const subsRaw = (parsed as Record<string, unknown>).subheadings;
  if (!Array.isArray(subsRaw)) return emptyTable();

  const bySubheading = new Map<string, AtomicSubheadingEntry>();
  for (const e of subsRaw) {
    const entry = parseEntry(e);
    if (entry !== null) bySubheading.set(entry.subheading, entry);
  }
  return { bySubheading };
}

/* ---------------------------------------------------------------------------
 * Public accessors
 * --------------------------------------------------------------------------- */

/**
 * Load (and cache) the atomic-axis table. FAIL-SAFE: a missing or corrupt file
 * returns an EMPTY table (lookups then return null) — it never throws. The table is
 * read from disk once and cached.
 */
export function loadAtomicAxisTable(): AtomicAxisTable {
  if (_cached !== null) return _cached;
  let raw: string;
  try {
    raw = fs.readFileSync(ATOMIC_AXES_PATH, 'utf8');
  } catch {
    _cached = emptyTable();
    return _cached;
  }
  _cached = parseAtomicAxisTable(raw);
  return _cached;
}

/** Look up the atomic-axis entry for a 6-digit subheading, or null on miss. */
export function getAtomicAxisEntry(subheading: string): AtomicSubheadingEntry | null {
  return loadAtomicAxisTable().bySubheading.get(subheading) ?? null;
}

/** Test-only: parse a table directly from a JSON string (bypasses the file/cache). */
export function _parseAtomicAxisTableForTesting(rawJson: string): AtomicAxisTable {
  return parseAtomicAxisTable(rawJson);
}

/** Test-only: clear the module-level cache so a re-load re-reads the file. */
export function _clearAtomicAxisCacheForTesting(): void {
  _cached = null;
}

/** Test-only: the resolved atomic-axis-table path. */
export function _getAtomicAxisPathForTesting(): string {
  return ATOMIC_AXES_PATH;
}

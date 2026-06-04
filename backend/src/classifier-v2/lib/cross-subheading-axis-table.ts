/**
 * Cross-subheading forced-choice axis table — runtime loader (Phase 4.x,
 * CROSS_SUBHEADING_ASK lever).
 *
 * Loads the build-time **O8** artifact
 * (`backend/data/build-time/O8-cross-subheading-axes/axes.json`) into a typed,
 * indexed lookup the orchestrator's POST-L3 cross-subheading gate uses. The table
 * names headings where ONE QGS-answerable axis (form / processing_state /
 * intended_use) splits the heading across 2+ subheadings — so a query silent on
 * that axis cannot pick a leaf and the brain is forced to guess (the "frozen
 * chicken" → 0207.12 vs 0207.14 bug).
 *
 * O8 SUPERSEDES O6: where O6 was a five-row hand-curated table with ONE
 * `FORM_AXIS` vocabulary, O8 is a GENERAL, corpus-wide, data-driven derivation
 * (every heading; axes un-fused into the shared O7 concept-axis namespace). The
 * artifact stays SHAPE-COMPATIBLE: this loader still reads `entries[]` with the
 * same per-entry fields (`heading`, `attribute`, `classes:{id:{values,
 * subheadings,label,example_code}}`, `question_text`), so the dark lever's consumer
 * is byte-identical. Each O8 entry additionally carries the O7 `axis` name and an
 * `all_axes` block (full multi-axis detail) — both IGNORED here, present for
 * downstream composition. Derivation: O8-cross-subheading-axes/DERIVATION.md.
 *
 * Loading is FAIL-SAFE (mirrors L0's alias-map loader): a missing/corrupt file
 * yields an EMPTY table, so the lever simply never fires rather than throwing — it
 * can never break the pipeline. The parsed table is cached at module scope; a
 * test-only reset hook clears it.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AttributeKey } from '../types';

/** Path to the O8 axis table (resolved from this module's location). */
const AXIS_TABLE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'build-time',
  'O8-cross-subheading-axes',
  'axes.json',
);

/** Axes the table is allowed to ask about (must be QGS-answerable AttributeKeys). */
const ALLOWED_AXES: ReadonlySet<AttributeKey> = new Set<AttributeKey>([
  'form',
  'processing_state',
  'intended_use',
]);

/** One macro-class of an axis (e.g. `whole` vs `cut`). */
export interface AxisClass {
  /** Stable macro-class id, surfaced as an answer option id. */
  id: string;
  /** Raw TLA values (lowercased) that map a candidate leaf into this class. */
  values: string[];
  /** Distinct 6-digit subheadings carrying this class within the heading. */
  subheadings: string[];
  /** Human-readable answer-option label. */
  label: string;
  /** A representative leaf code (docs / fallback option building). */
  example_code: string;
}

/** A forced-choice-axis entry for ONE heading. */
export interface CrossSubheadingAxisEntry {
  /** 4-digit heading the axis applies to. */
  heading: string;
  /** The determining (silent-default-absent) axis, as a QGS AttributeKey. */
  attribute: AttributeKey;
  /**
   * The O8/O7 concept-axis NAME (shared namespace, e.g. `presentation`,
   * `roasted`) when present in the artifact — additive, NOT load-bearing for the
   * dark lever (the gate keys off `attribute`/`classes`). Lets a downstream
   * consumer compose this cross-sub fork with the within-sub O7 axes by name.
   */
  axis?: string;
  /** macro-class id -> class definition (≥2 classes). */
  classes: Record<string, AxisClass>;
  /** Curated whole-vs-cut style question text. */
  question_text: string;
  /** Derivation note (never load-bearing). */
  notes?: string;
}

/** The parsed table, indexed by heading for O(1) lookup. */
export interface CrossSubheadingAxisTable {
  byHeading: Map<string, CrossSubheadingAxisEntry>;
}

let _cached: CrossSubheadingAxisTable | null = null;

/** An always-valid empty table (the fail-safe degenerate value). */
function emptyTable(): CrossSubheadingAxisTable {
  return { byHeading: new Map() };
}

/* ---------------------------------------------------------------------------
 * Parsing (defensive — any malformed entry is skipped, never thrown)
 * --------------------------------------------------------------------------- */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Parse a single axis-class object; returns null when malformed. */
function parseAxisClass(id: string, raw: unknown): AxisClass | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isStringArray(o.values) || o.values.length === 0) return null;
  if (!isStringArray(o.subheadings) || o.subheadings.length === 0) return null;
  if (typeof o.label !== 'string' || o.label.length === 0) return null;
  if (typeof o.example_code !== 'string' || o.example_code.length === 0) return null;
  return {
    id,
    values: o.values.map((v) => v.toLowerCase().trim()).filter((v) => v.length > 0),
    subheadings: o.subheadings.slice(),
    label: o.label,
    example_code: o.example_code,
  };
}

/** Parse a single heading entry; returns null when malformed / disallowed. */
function parseEntry(raw: unknown): CrossSubheadingAxisEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.heading !== 'string' || !/^\d{4}$/.test(o.heading)) return null;
  if (typeof o.attribute !== 'string' || !ALLOWED_AXES.has(o.attribute as AttributeKey)) return null;
  if (typeof o.question_text !== 'string' || o.question_text.length === 0) return null;
  if (o.classes === null || typeof o.classes !== 'object' || Array.isArray(o.classes)) return null;

  const classes: Record<string, AxisClass> = {};
  for (const [id, cRaw] of Object.entries(o.classes as Record<string, unknown>)) {
    const parsed = parseAxisClass(id, cRaw);
    if (parsed !== null) classes[id] = parsed;
  }
  // A forced-choice axis is meaningless with <2 macro-classes.
  if (Object.keys(classes).length < 2) return null;

  const entry: CrossSubheadingAxisEntry = {
    heading: o.heading,
    attribute: o.attribute as AttributeKey,
    classes,
    question_text: o.question_text,
  };
  if (typeof o.axis === 'string' && o.axis.length > 0) entry.axis = o.axis;
  if (typeof o.notes === 'string') entry.notes = o.notes;
  return entry;
}

function parseTable(rawJson: string): CrossSubheadingAxisTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return emptyTable();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyTable();
  const entriesRaw = (parsed as Record<string, unknown>).entries;
  if (!Array.isArray(entriesRaw)) return emptyTable();

  const byHeading = new Map<string, CrossSubheadingAxisEntry>();
  for (const e of entriesRaw) {
    const entry = parseEntry(e);
    if (entry !== null) byHeading.set(entry.heading, entry);
  }
  return { byHeading };
}

/* ---------------------------------------------------------------------------
 * Public accessors
 * --------------------------------------------------------------------------- */

/**
 * Load (and cache) the cross-subheading axis table. FAIL-SAFE: a missing or
 * corrupt file returns an EMPTY table (the lever then never fires) — it never
 * throws. The table is read from disk once and cached.
 */
export function loadCrossSubheadingAxisTable(): CrossSubheadingAxisTable {
  if (_cached !== null) return _cached;
  let raw: string;
  try {
    raw = fs.readFileSync(AXIS_TABLE_PATH, 'utf8');
  } catch {
    _cached = emptyTable();
    return _cached;
  }
  _cached = parseTable(raw);
  return _cached;
}

/** Look up the forced-choice-axis entry for a 4-digit heading, or null. */
export function getAxisEntryForHeading(heading: string): CrossSubheadingAxisEntry | null {
  return loadCrossSubheadingAxisTable().byHeading.get(heading) ?? null;
}

/** Test-only: parse a table directly from a JSON string (bypasses the file/cache). */
export function _parseTableForTesting(rawJson: string): CrossSubheadingAxisTable {
  return parseTable(rawJson);
}

/** Test-only: clear the module-level cache so a re-load re-reads the file. */
export function _clearAxisTableCacheForTesting(): void {
  _cached = null;
}

/** Test-only: the resolved axis-table path. */
export function _getAxisTablePathForTesting(): string {
  return AXIS_TABLE_PATH;
}

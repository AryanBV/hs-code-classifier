/**
 * O7 askable-surface table — runtime loader (Stage S3; DARK until S4 wires it).
 *
 * Loads the build-time S3 artifact
 * (`backend/data/build-time/O7-askable-surface/askable-surface.json`) into a typed,
 * indexed lookup keyed by 6-digit subheading. For every ENRICHED subheading the
 * artifact records the human-facing ASKABLE SURFACE the S4 divergence engine uses
 * to ask the right question in plain trade language:
 *   - the askable AXES in branch order (PRIMARY / coarse-to-fine first), each with
 *     a plain-trade `question`, MECE exporter-language `options` (each mapping to
 *     real leaf codes), an honest `residual_escape` (the REAL residual leaf
 *     description, never a blank "Other/None"), a `branch_order`, and an
 *     `option_answerability` self-assessment;
 *   - `enrichment_kind`: 'no_residual' (cannot default -> ask) or
 *     'primary_residual_override' (the REFINED rule: ask a PRIMARY axis EVEN OVER a
 *     residual leaf — coffee 0901.11 form/grade/variety); and
 *   - `ask_recommendation`: 'ask' (strong) or 'fallback_only' (only when retrieval
 *     is undecided — incidental-only no-residual subs, e.g. numeric power/kVA bands).
 *
 * Loading is FAIL-SAFE (mirrors the O6 axis-table + O7 atomic-axis loaders): a
 * missing/corrupt file yields an EMPTY table, so a consumer simply gets `null` on
 * lookup rather than throwing — this can never break the pipeline. The parsed table
 * is cached at module scope; a test-only reset hook clears it.
 *
 * This module performs ZERO I/O beyond the one-time JSON read and is pure
 * thereafter. It is NOT yet called by any live path (Stage S4 wires the consumer).
 *
 * Derivation: backend/data/build-time/O7-askable-surface/README.md
 */
import * as fs from 'fs';
import * as path from 'path';

/** Path to the S3 askable-surface artifact (resolved from this module's location). */
const ASKABLE_SURFACE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'build-time',
  'O7-askable-surface',
  'askable-surface.json',
);

/** Whether a non-expert exporter can reliably answer an axis. */
export type Answerability = 'easy' | 'moderate' | 'hard';

/** How the subheading was enriched (drives whether/when to ask). */
export type EnrichmentKind = 'no_residual' | 'primary_residual_override';

/** Strength of the ask recommendation. */
export type AskRecommendation = 'ask' | 'fallback_only';

/** One MECE answer option mapping exporter language to real leaf codes. */
export interface AskableOption {
  /** Stable snake_case option id. */
  id: string;
  /** Exporter-language MECE label. */
  label: string;
  /** Real surviving leaf codes this option maps to (>=1). */
  codes: string[];
}

/** The honest residual / escape leaf (real description, never a blank "Other"). */
export interface ResidualEscape {
  code: string;
  label: string;
}

/** One askable concept-axis for an enriched subheading. */
export interface AskableAxisEntry {
  /** Named concept-axis id (e.g. `coffee_form`, `fiber_type`, `power_rating`). */
  axis: string;
  /** True when the axis is a PRIMARY (core, exporter-known, splits-the-line) axis. */
  is_primary: boolean;
  /** Plain-trade exporter-facing question (no HS jargon, no codes). */
  question: string;
  /** MECE options in exporter language, each mapping to real leaf(s). */
  options: AskableOption[];
  /** Honest residual/escape (real residual leaf description); null when none. */
  residual_escape: ResidualEscape | null;
  /** 1-based branch order hint (PRIMARY + coarse axes first). */
  branch_order: number;
  /** Can a non-expert exporter answer this? */
  option_answerability: Answerability;
  /** True when answerability is 'hard' (S4 should be cautious). */
  answerability_flag: boolean;
}

/** An enriched askable-surface entry for one 6-digit subheading. */
export interface AskableSubEntry {
  /** 6-digit "NNNN.NN" subheading key. */
  subheading: string;
  heading: string;
  chapter: string;
  leaf_count: number;
  enrichment_kind: EnrichmentKind;
  has_residual: boolean;
  residual_leaf_code: string | null;
  ask_recommendation: AskRecommendation;
  /** Axes to ask, in branch order. */
  axes: AskableAxisEntry[];
}

/** The parsed table, indexed by subheading for O(1) lookup. */
export interface AskableSurfaceTable {
  bySubheading: Map<string, AskableSubEntry>;
}

let _cached: AskableSurfaceTable | null = null;

/** An always-valid empty table (the fail-safe degenerate value). */
function emptyTable(): AskableSurfaceTable {
  return { bySubheading: new Map() };
}

/* ---------------------------------------------------------------------------
 * Parsing (defensive — any malformed entry/axis is skipped, never thrown)
 * --------------------------------------------------------------------------- */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

const ENRICHMENT_KINDS: ReadonlySet<string> = new Set<EnrichmentKind>([
  'no_residual',
  'primary_residual_override',
]);
const ASK_RECS: ReadonlySet<string> = new Set<AskRecommendation>(['ask', 'fallback_only']);
const ANSWERABILITIES: ReadonlySet<string> = new Set<Answerability>(['easy', 'moderate', 'hard']);

function parseOption(raw: unknown): AskableOption | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return null;
  if (typeof o.label !== 'string' || o.label.length === 0) return null;
  if (!isStringArray(o.codes) || o.codes.length < 1) return null;
  return { id: o.id, label: o.label, codes: o.codes.slice() };
}

function parseResidualEscape(raw: unknown): ResidualEscape | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.code !== 'string' || o.code.length === 0) return null;
  if (typeof o.label !== 'string' || o.label.length === 0) return null;
  return { code: o.code, label: o.label };
}

function parseAxis(raw: unknown): AskableAxisEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.axis !== 'string' || o.axis.length === 0) return null;
  if (typeof o.question !== 'string' || o.question.length === 0) return null;
  if (!Array.isArray(o.options)) return null;

  const options: AskableOption[] = [];
  for (const opt of o.options) {
    const parsed = parseOption(opt);
    if (parsed !== null) options.push(parsed);
  }
  // A meaningful question needs >=2 real options.
  if (options.length < 2) return null;

  const answer: Answerability = ANSWERABILITIES.has(o.option_answerability as string)
    ? (o.option_answerability as Answerability)
    : 'moderate';

  return {
    axis: o.axis,
    is_primary: o.is_primary === true,
    question: o.question,
    options,
    residual_escape: parseResidualEscape(o.residual_escape),
    branch_order: typeof o.branch_order === 'number' ? o.branch_order : 0,
    option_answerability: answer,
    answerability_flag: o.answerability_flag === true || answer === 'hard',
  };
}

function parseEntry(raw: unknown): AskableSubEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.subheading !== 'string' || !/^\d{4}\.\d{2}$/.test(o.subheading)) return null;
  if (typeof o.enrichment_kind !== 'string' || !ENRICHMENT_KINDS.has(o.enrichment_kind)) return null;
  if (typeof o.ask_recommendation !== 'string' || !ASK_RECS.has(o.ask_recommendation)) return null;

  const axes: AskableAxisEntry[] = [];
  if (Array.isArray(o.axes)) {
    for (const a of o.axes) {
      const parsed = parseAxis(a);
      if (parsed !== null) axes.push(parsed);
    }
  }
  // An enriched sub with no usable axis is dropped (nothing to ask).
  if (axes.length < 1) return null;

  const heading = typeof o.heading === 'string' ? o.heading : o.subheading.slice(0, 4);
  const chapter = typeof o.chapter === 'string' ? o.chapter : o.subheading.slice(0, 2);
  const leaf_count = typeof o.leaf_count === 'number' ? o.leaf_count : 0;
  const has_residual = o.has_residual === true;
  const residual_leaf_code =
    typeof o.residual_leaf_code === 'string' ? o.residual_leaf_code : null;

  return {
    subheading: o.subheading,
    heading,
    chapter,
    leaf_count,
    enrichment_kind: o.enrichment_kind as EnrichmentKind,
    has_residual,
    residual_leaf_code,
    ask_recommendation: o.ask_recommendation as AskRecommendation,
    axes,
  };
}

export function parseAskableSurfaceTable(rawJson: string): AskableSurfaceTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return emptyTable();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyTable();
  const subsRaw = (parsed as Record<string, unknown>).subheadings;
  if (!Array.isArray(subsRaw)) return emptyTable();

  const bySubheading = new Map<string, AskableSubEntry>();
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
 * Load (and cache) the askable-surface table. FAIL-SAFE: a missing or corrupt file
 * returns an EMPTY table (lookups then return null) — it never throws. The table is
 * read from disk once and cached.
 */
export function loadAskableSurfaceTable(): AskableSurfaceTable {
  if (_cached !== null) return _cached;
  let raw: string;
  try {
    raw = fs.readFileSync(ASKABLE_SURFACE_PATH, 'utf8');
  } catch {
    _cached = emptyTable();
    return _cached;
  }
  _cached = parseAskableSurfaceTable(raw);
  return _cached;
}

/** Look up the askable-surface entry for a 6-digit subheading, or null on miss. */
export function getAskableSurfaceEntry(subheading: string): AskableSubEntry | null {
  return loadAskableSurfaceTable().bySubheading.get(subheading) ?? null;
}

/** Test-only: parse a table directly from a JSON string (bypasses the file/cache). */
export function _parseAskableSurfaceTableForTesting(rawJson: string): AskableSurfaceTable {
  return parseAskableSurfaceTable(rawJson);
}

/** Test-only: clear the module-level cache so a re-load re-reads the file. */
export function _clearAskableSurfaceCacheForTesting(): void {
  _cached = null;
}

/** Test-only: the resolved askable-surface-table path. */
export function _getAskableSurfacePathForTesting(): string {
  return ASKABLE_SURFACE_PATH;
}

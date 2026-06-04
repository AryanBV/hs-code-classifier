/**
 * Atomic-aware partition helper (Stage S2; DARK — NOT on any live ask path).
 *
 * This is the NEW, atomic-aware sibling of the frozen
 * `QGS-generator.partitionByAttribute`. Where the existing QGS partitions the
 * surviving candidates by a single TLA attribute COLUMN (so coffee's fused
 * `processing_state` array yields ONE jumbled question mixing roasted / decaf /
 * variety / grade), this helper partitions by the O7 CONCEPT-AXES — the un-fused
 * named axes (thermal, presentation, variety, form, grade, decaf, roasted, polymer,
 * end-use …). The result is one MECE option set PER concept-axis, scoped to the
 * leaves that actually survived L3, so the S4 divergence engine can ask ONE clean
 * question per axis instead of one jumble.
 *
 * It is PURE (no I/O, no Date, never throws): it reads the pre-loaded O7 table
 * (the caller passes the entry, or a code→entry resolver) and the live candidate
 * codes. The existing `partitionByAttribute` / `buildOptions` / `selectQuestionsGreedy`
 * in QGS-generator.ts are untouched — S4 will choose whether to swap this in behind
 * a flag at cutover.
 *
 * Shape compatibility: the per-axis option set reuses the same `TriageFallbackOption`
 * shape as the QGS so S4 can build a `ClarifyingQuestion` from it directly.
 */
import type { TriageFallbackOption } from '../types';
import type {
  AtomicSubheadingEntry,
  AtomicAxisTable,
} from './atomic-axis-table';

/** The 6-digit subheading ("NNNN.NN") of an 8-digit (or 6-digit) code; '' on miss. */
export function subheadingOfCode(code: string): string {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(code)) return code.slice(0, 7);
  if (/^\d{4}\.\d{2}$/.test(code)) return code;
  return '';
}

/** One concept-axis partition over the SURVIVING candidate leaves. */
export interface AtomicAxisPartition {
  /** Concept-axis id (e.g. `grade`, `polymer`, `end_use`). */
  axis: string;
  /** Human-readable axis label. */
  label: string;
  /** value-id -> surviving candidate codes carrying that value (the partition). */
  partition: Map<string, string[]>;
  /** Distinct value-ids that survive (≥2 when the axis still discriminates), sorted. */
  values_present: string[];
  /** MECE answer options (one per surviving value + an `other` escape hatch). */
  options: TriageFallbackOption[];
}

/** Outcome of an atomic-aware partition of a candidate set. */
export interface AtomicPartitionResult {
  /** The 6-digit subheading the candidates concentrate in ('' when they don't). */
  subheading: string;
  /** The O7 entry used (null when the sub is untyped / not multi-leaf / unknown). */
  entry: AtomicSubheadingEntry | null;
  /** True when a residual catch-all leaf exists — the engine should NOT ask. */
  has_residual: boolean;
  /** The residual leaf code when present (the unmarked-default winner), else null. */
  residual_leaf_code: string | null;
  /**
   * Discriminating concept-axes that STILL split the surviving leaves (≥2 distinct
   * surviving values). Empty when no axis discriminates the survivors (engine
   * falls back / classifies). Ordered by the O7 priority order.
   */
  axes: AtomicAxisPartition[];
}

/** Slug a value-id into a stable option id (^[a-z][a-z0-9_]*$). */
function slugifyValue(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug.length === 0) return 'opt';
  return /^[a-z]/.test(slug) ? slug : `v_${slug}`;
}

/** Title-case a value-id for a default human label. */
function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build MECE options for an axis partition (one per surviving value + `other`). */
function buildAxisOptions(
  partition: Map<string, string[]>,
  labels: Record<string, string>,
): TriageFallbackOption[] {
  // Order by partition size desc, then lexically asc (stable, deterministic).
  const entries = [...partition.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  const options: TriageFallbackOption[] = [];
  const usedIds = new Set<string>();
  for (const [value] of entries) {
    let id = slugifyValue(value);
    if (usedIds.has(id)) {
      let i = 2;
      while (usedIds.has(`${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    usedIds.add(id);
    options.push({ id, label: labels[value] ?? titleCase(value) });
  }
  options.push({ id: 'other', label: 'Other / not listed (please describe)' });
  return options;
}

/**
 * Determine the dominant 6-digit subheading of a candidate set: the subheading
 * carrying the most candidate codes. Ties broken by the lexically-smallest
 * subheading (deterministic). '' when no candidate resolves a subheading.
 */
export function dominantSubheading(candidateCodes: string[]): string {
  const counts = new Map<string, number>();
  for (const code of candidateCodes) {
    const sub = subheadingOfCode(code);
    if (sub.length === 0) continue;
    counts.set(sub, (counts.get(sub) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [sub, n] of counts) {
    if (n > bestN || (n === bestN && (best === '' || sub < best))) {
      best = sub;
      bestN = n;
    }
  }
  return best;
}

/**
 * Atomic-aware partition of a live candidate set into per-concept-axis MECE option
 * sets, using the O7 atomic-axis table.
 *
 * Algorithm (general, no per-case logic):
 *   1. Resolve the candidates' dominant 6-digit subheading and look up its O7 entry.
 *   2. If there is no entry (the sub is untyped / single-leaf / unknown) → return a
 *      result with `entry: null`, `axes: []` (the engine falls back to classify).
 *   3. For each of the entry's concept-axes, RESTRICT its value→codes partition to
 *      the SURVIVING candidate codes (a leaf the engine already pruned does not
 *      offer an answer). Keep the axis iff ≥2 distinct value-ids still survive (it
 *      still discriminates the live set). A leaf carrying NO typed value for an axis
 *      simply does not appear in that axis's partition (it neither blocks nor
 *      answers it).
 *   4. Emit `has_residual` / `residual_leaf_code` straight from the entry so the
 *      caller can apply unmarked-default-wins (do NOT ask when a residual exists).
 *
 * `optionLabels` lets the caller inject curated value→label maps (e.g. from
 * `question_templates`); when absent, value-ids are title-cased.
 *
 * Pure + total. Never throws; an unknown / empty candidate set yields an empty axis
 * list (and a null entry).
 */
export function partitionByAtomicAxis(
  candidateCodes: string[],
  table: AtomicAxisTable,
  optionLabels: Record<string, Record<string, string>> = {},
): AtomicPartitionResult {
  const subheading = dominantSubheading(candidateCodes);
  const entry = subheading.length > 0
    ? table.bySubheading.get(subheading) ?? null
    : null;

  if (entry === null) {
    return {
      subheading,
      entry: null,
      has_residual: false,
      residual_leaf_code: null,
      axes: [],
    };
  }

  const survivors = new Set(candidateCodes);
  const axes: AtomicAxisPartition[] = [];

  for (const ax of entry.axes) {
    // Restrict the value->codes partition to surviving candidate leaves.
    const partition = new Map<string, string[]>();
    for (const [value, codes] of Object.entries(ax.value_to_codes)) {
      const live = codes.filter((c) => survivors.has(c));
      if (live.length > 0) partition.set(value, live.sort());
    }
    // The axis still discriminates only if ≥2 distinct values survive.
    if (partition.size < 2) continue;
    const values_present = [...partition.keys()].sort();
    const labels = optionLabels[ax.axis] ?? {};
    axes.push({
      axis: ax.axis,
      label: ax.label,
      partition,
      values_present,
      options: buildAxisOptions(partition, labels),
    });
  }

  return {
    subheading,
    entry,
    has_residual: entry.has_residual,
    residual_leaf_code: entry.residual_leaf_code,
    axes,
  };
}

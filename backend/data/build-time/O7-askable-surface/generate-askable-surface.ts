/**
 * Stage S3 — Askable-surface generator (BUILD-TIME, no Gemini, corpus-only).
 *
 * Turns the S2 structural data (`O7-atomic-axis-typing/atomic-axes.json`) into a
 * BOUNDED, human-facing ASKABLE SURFACE the S4 divergence engine will use to ask
 * the RIGHT question in plain trade language WITHOUT over-asking.
 *
 * It enriches two disjoint sets of subheadings:
 *
 *   (a) NO-RESIDUAL ASKABLE subs (the 104 `askable_no_residual` +
 *       `single_axis_resolved`). A query silent on the axis CANNOT default to a
 *       residual leaf, so asking always beats a blind guess. We enrich every
 *       discriminating axis (PRIMARY first), but mark subs whose ONLY axes are
 *       INCIDENTAL with `ask_recommendation: 'fallback_only'` so S4 asks them only
 *       as a last resort (numeric power/kVA bands, gem-quality, dual-use end-use).
 *
 *   (b) PRIMARY-RESIDUAL OVERRIDE subs — residual-bearing subs whose UNRESOLVED
 *       axis is PRIMARY (coffee 0901.11 form/grade/variety; clean fresh-vs-frozen
 *       seafood splits). These are the REFINED-RULE overrides: ASK on the unpinned
 *       PRIMARY axis EVEN THOUGH the subheading has a residual leaf. We enrich ONLY
 *       the PRIMARY axes for these (the incidental axes still default to residual).
 *
 * For every enriched axis we emit: a plain-trade `question`, MECE `options` (each
 * option label in exporter language + the real surviving leaf codes it maps to),
 * an honest `residual_escape` carrying the REAL residual leaf description (never a
 * blank "Other/None"), a `branch_order` hint (PRIMARY/coarse axes first), and an
 * `option_answerability` self-assessment flagging axes a non-expert may not answer.
 *
 * Output `askable-surface.json` is the committed runtime artifact; the loader
 * (`backend/src/classifier-v2/lib/askable-surface-table.ts`) reads ONLY that JSON.
 * DARK: not wired to any live path (S4 wires the consumer).
 *
 * Run (build-time only, requires DATABASE_URL; no Gemini, no paid API):
 *   cd backend && npx tsx --require dotenv/config \
 *     data/build-time/O7-askable-surface/generate-askable-surface.ts
 *
 * Deterministic: re-running reproduces askable-surface.json byte-identically from
 * the same corpus + inputs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { AXIS_LANGUAGE, type Answerability } from './axis-language';

/* ---------------------------------------------------------------------------
 * Inputs / outputs
 * --------------------------------------------------------------------------- */

const HERE = __dirname;
const ATOMIC_AXES_PATH = path.resolve(HERE, '..', 'O7-atomic-axis-typing', 'atomic-axes.json');
const AXIS_PRIMACY_PATH = path.resolve(HERE, 'axis-primacy.json');
const OUT_PATH = path.resolve(HERE, 'askable-surface.json');

/* ---------------------------------------------------------------------------
 * Shapes (subset of the S2 atomic-axes.json)
 * --------------------------------------------------------------------------- */

interface RawAxis {
  axis: string;
  label: string;
  value_to_codes: Record<string, string[]>;
  values_present: string[];
}
interface RawSub {
  subheading: string;
  heading: string;
  chapter: string;
  leaf_count: number;
  classification: 'residual_default' | 'askable_no_residual' | 'single_axis_resolved' | 'untypable';
  has_residual: boolean;
  residual_leaf_code: string | null;
  axes: RawAxis[];
  unclassified_varying: string[];
}
interface AtomicAxesFile { subheadings: RawSub[] }

interface PrimacyEntry { axis: string; primacy: 'PRIMARY' | 'INCIDENTAL'; justification: string }
interface PrimacyFile { axes: PrimacyEntry[] }

/* ---------------------------------------------------------------------------
 * Output shapes (the committed artifact)
 * --------------------------------------------------------------------------- */

interface AskableOption {
  id: string;
  /** Exporter-language MECE label. */
  label: string;
  /** Real surviving leaf codes this option maps to (>=1). */
  codes: string[];
}
interface AskableAxisEntry {
  axis: string;
  is_primary: boolean;
  /** Plain-trade exporter-facing question (no HS jargon, no codes). */
  question: string;
  /** MECE options in exporter language, each mapping to real leaf(s). */
  options: AskableOption[];
  /** Honest residual/escape (real residual leaf description); null when none. */
  residual_escape: { code: string; label: string } | null;
  /** 1-based branch order hint (PRIMARY + coarse axes first). */
  branch_order: number;
  /** Can a non-expert exporter answer this? */
  option_answerability: Answerability;
  /** True when answerability is 'hard' (S4 should be cautious). */
  answerability_flag: boolean;
}
interface AskableSubEntry {
  subheading: string;
  heading: string;
  chapter: string;
  leaf_count: number;
  /** 'no_residual' (cannot default) | 'primary_residual_override' (refined rule). */
  enrichment_kind: 'no_residual' | 'primary_residual_override';
  has_residual: boolean;
  residual_leaf_code: string | null;
  /** 'ask' (strong) | 'fallback_only' (only when retrieval undecided — incidental-only). */
  ask_recommendation: 'ask' | 'fallback_only';
  /** Axes to ask, in branch order. */
  axes: AskableAxisEntry[];
}

/* ---------------------------------------------------------------------------
 * PRIMARY-residual override allow-list (the refined-rule overrides).
 *
 * Conservative + bounded: a residual-bearing sub is overridden ONLY when its
 * PRIMARY axis is a clean, exporter-answerable split. Coffee 0901.11 is the
 * flagship (form/grade/variety over a .90 residual). The seafood thermal splits
 * (0308.30 frozen-vs-live insects, 0309.10 fresh-vs-frozen flours) are clean
 * fresh/chilled-vs-frozen partitions the exporter always knows. Degenerate thermal
 * subs (where the token sits ON the residual leaf so the partition collapses) are
 * EXCLUDED — they fail the >=2-surviving-values discriminator at runtime anyway.
 * --------------------------------------------------------------------------- */
const PRIMARY_RESIDUAL_OVERRIDES: ReadonlySet<string> = new Set<string>([
  '0901.11', // coffee, not roasted, not decaf — form/grade/variety over .90 residual
  '0308.30', // aquatic invertebrates (sea cucumbers) — clean thermal split over .90
  '0309.10', // flours/meals/pellets of fish — clean fresh-vs-frozen split over .90
]);

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function slugifyValue(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug.length === 0) return 'opt';
  return /^[a-z]/.test(slug) ? slug : `v_${slug}`;
}

/** Format a numeric-band value-id (power/capacity/diameter/container) for humans. */
function formatBandValue(value: string): string {
  let s = value.toLowerCase().trim();
  // Strip redundant axis-name prefixes the band tokens carry.
  s = s.replace(/^(power|capacity|outer-diameter|container)-/, '');
  // Normalise comparison words.
  s = s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bup to\b/g, 'up to').replace(/\bover\b/g, 'over').replace(/\bor less\b/g, 'or less');
  // Fix embedded units (e.g. "1000kw" -> "1000 kW", "250000kva" -> "250000 kVA").
  s = s.replace(/(\d)kw\b/gi, '$1 kW').replace(/(\d)kva\b/gi, '$1 kVA');
  s = s.replace(/(\d)l\b/gi, '$1 L'); // "2l" -> "2 L"
  s = s.replace(/(\d)mm\b/gi, '$1 mm');
  // Capitalise the first letter only (avoids title-casing "to"/"over"/"up").
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(value: string): string {
  // Numeric-band value-ids get the dedicated band formatter.
  if (/\d/.test(value) && /(kw|kva|mm|-l-|\dl\b|over|up-to|or-less|to-)/i.test(value)) {
    return formatBandValue(value);
  }
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bgsm\b/gi, 'g/m2')
    .replace(/\bkw\b/gi, 'kW')
    .replace(/\bkva\b/gi, 'kVA')
    .replace(/\bmm\b/gi, 'mm')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A residual leaf description is "honest" only if it is not blank/whitespace. */
function honestResidualLabel(desc: string | undefined, code: string): string {
  const d = (desc ?? '').trim();
  if (d.length === 0) return `Other (${code})`;
  // Many residual descriptions are literally "Other" — keep the real text but make
  // it self-locating for the exporter (never a bare/blank "Other/None").
  return /^other(s)?$/i.test(d) ? `Other (none of the above) [${code}]` : d;
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const atomic = JSON.parse(fs.readFileSync(ATOMIC_AXES_PATH, 'utf8')) as AtomicAxesFile;
  const primacy = JSON.parse(fs.readFileSync(AXIS_PRIMACY_PATH, 'utf8')) as PrimacyFile;

  const isPrimary = new Map<string, boolean>();
  for (const p of primacy.axes) isPrimary.set(p.axis, p.primacy === 'PRIMARY');

  // Select the subs to enrich.
  const noResidual = atomic.subheadings.filter(
    (s) => s.classification === 'askable_no_residual' || s.classification === 'single_axis_resolved',
  );
  const overrides = atomic.subheadings.filter((s) => PRIMARY_RESIDUAL_OVERRIDES.has(s.subheading));

  // Collect every leaf code referenced (for description hydration).
  const codes = new Set<string>();
  for (const s of [...noResidual, ...overrides]) {
    for (const a of s.axes) for (const arr of Object.values(a.value_to_codes)) for (const c of arr) codes.add(c);
    if (s.residual_leaf_code) codes.add(s.residual_leaf_code);
  }

  // Hydrate descriptions from the corpus (read-only).
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (build-time only).');
  const client = new Client({ connectionString: url });
  await client.connect();
  const desc = new Map<string, string>();
  try {
    const res = await client.query<{ code: string; description: string }>(
      'SELECT code, description FROM tariff_lines WHERE code = ANY($1::text[])',
      [[...codes]],
    );
    for (const r of res.rows) desc.set(r.code, r.description ?? '');
  } finally {
    await client.end();
  }

  /**
   * Build ONE askable axis, PURIFIED to a strictly leaf-disjoint (MECE) choice.
   *
   * S2 arrays can tag a single leaf with MULTIPLE values of one axis (e.g. a fish
   * leaf "Live, fresh or chilled" carries both `live` and `fresh_or_chilled`; a
   * chemical leaf tagged both `powder` and `liquid`). A forced-choice question over
   * such options is ambiguous (two answers point to the same leaf). Purification:
   *   1. Build raw value->codes options.
   *   2. MERGE options with IDENTICAL leaf-sets into one (combined label) — the same
   *      leaf set is one real choice (e.g. fresh/chilled-or-live -> {.10}).
   *   3. After merging, DROP any leaf code still shared across 2+ distinct options
   *      (genuinely ambiguous on this axis — it falls through to the residual / brain).
   *   4. KEEP the axis only if >=2 options retain a NON-EMPTY, disjoint leaf set —
   *      otherwise it cannot cleanly separate the leaves and is returned as null
   *      (NOT asked: conservative, no ambiguous question).
   */
  const buildAxisEntry = (
    s: RawSub,
    a: RawAxis,
    branchOrder: number,
  ): AskableAxisEntry | null => {
    const lang = AXIS_LANGUAGE[a.axis];
    const primary = isPrimary.get(a.axis) ?? false;

    // Order values by partition size desc, then lexical (stable, deterministic).
    const valueEntries = [...Object.entries(a.value_to_codes)].sort((x, y) => {
      if (y[1].length !== x[1].length) return y[1].length - x[1].length;
      return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0;
    });

    interface RawOpt { id: string; label: string; codes: string[] }
    const rawOptions: RawOpt[] = [];
    const usedIds = new Set<string>();
    for (const [value, leafCodes] of valueEntries) {
      let id = slugifyValue(value);
      if (usedIds.has(id)) {
        let i = 2;
        while (usedIds.has(`${id}_${i}`)) i++;
        id = `${id}_${i}`;
      }
      usedIds.add(id);
      const label = lang?.valueLabels[value] ?? titleCase(value);
      rawOptions.push({ id, label, codes: [...new Set(leafCodes)].sort() });
    }

    // (2) Merge options whose leaf-sets are IDENTICAL into a single combined option.
    const byKey = new Map<string, RawOpt>();
    for (const opt of rawOptions) {
      const key = opt.codes.join('|');
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, { ...opt });
      } else {
        existing.label = `${existing.label} or ${opt.label}`;
        existing.id = `${existing.id}_or_${opt.id}`;
      }
    }
    const merged = [...byKey.values()];

    // (3) Drop leaf codes still shared across 2+ distinct merged options (ambiguous).
    const codeCount = new Map<string, number>();
    for (const opt of merged) for (const c of opt.codes) codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
    const purified: AskableOption[] = [];
    for (const opt of merged) {
      const disjoint = opt.codes.filter((c) => (codeCount.get(c) ?? 0) === 1);
      if (disjoint.length > 0) purified.push({ id: opt.id, label: opt.label, codes: disjoint.sort() });
    }

    // (4) Need >=2 cleanly-separating options for a real forced choice.
    if (purified.length < 2) return null;

    const residual_escape =
      s.has_residual && s.residual_leaf_code
        ? { code: s.residual_leaf_code, label: honestResidualLabel(desc.get(s.residual_leaf_code), s.residual_leaf_code) }
        : null;

    const answer: Answerability = lang?.answerability ?? 'moderate';

    return {
      axis: a.axis,
      is_primary: primary,
      question: lang?.question ?? `Which best describes the ${a.label.toLowerCase()}?`,
      options: purified,
      residual_escape,
      branch_order: branchOrder,
      option_answerability: answer,
      answerability_flag: answer === 'hard',
    };
  };

  /** Order axes: PRIMARY first, then by easy<moderate<hard answerability, then label. */
  const ANSWER_RANK: Record<Answerability, number> = { easy: 0, moderate: 1, hard: 2 };
  const orderAxes = (axes: RawAxis[]): RawAxis[] =>
    [...axes].sort((x, y) => {
      const px = isPrimary.get(x.axis) ? 0 : 1;
      const py = isPrimary.get(y.axis) ? 0 : 1;
      if (px !== py) return px - py;
      const ax = ANSWER_RANK[AXIS_LANGUAGE[x.axis]?.answerability ?? 'moderate'];
      const ay = ANSWER_RANK[AXIS_LANGUAGE[y.axis]?.answerability ?? 'moderate'];
      if (ax !== ay) return ax - ay;
      return x.axis < y.axis ? -1 : x.axis > y.axis ? 1 : 0;
    });

  /** Build, purify (MECE), drop-null, and re-number branch_order for an axis list. */
  const buildAxes = (s: RawSub, rawAxes: RawAxis[]): AskableAxisEntry[] => {
    const entries: AskableAxisEntry[] = [];
    for (const a of orderAxes(rawAxes)) {
      const built = buildAxisEntry(s, a, entries.length + 1);
      if (built !== null) entries.push({ ...built, branch_order: entries.length + 1 });
    }
    return entries;
  };

  const out: AskableSubEntry[] = [];
  let droppedNoCleanAxis = 0;

  // (a) No-residual askable subs — enrich ALL cleanly-separating axes.
  for (const s of noResidual) {
    const axisEntries = buildAxes(s, s.axes);
    if (axisEntries.length === 0) {
      droppedNoCleanAxis++; // no axis cleanly separates -> not askable, fail-safe
      continue;
    }
    const anyPrimary = axisEntries.some((a) => a.is_primary);
    out.push({
      subheading: s.subheading,
      heading: s.heading,
      chapter: s.chapter,
      leaf_count: s.leaf_count,
      enrichment_kind: 'no_residual',
      has_residual: s.has_residual,
      residual_leaf_code: s.residual_leaf_code,
      ask_recommendation: anyPrimary ? 'ask' : 'fallback_only',
      axes: axisEntries,
    });
  }

  // (b) PRIMARY-residual override subs — enrich ONLY the PRIMARY axes.
  for (const s of overrides) {
    const primaryAxes = s.axes.filter((a) => isPrimary.get(a.axis));
    if (primaryAxes.length === 0) continue; // nothing primary to override on
    const axisEntries = buildAxes(s, primaryAxes);
    if (axisEntries.length === 0) {
      droppedNoCleanAxis++; // override axis does not cleanly separate -> skip
      continue;
    }
    out.push({
      subheading: s.subheading,
      heading: s.heading,
      chapter: s.chapter,
      leaf_count: s.leaf_count,
      enrichment_kind: 'primary_residual_override',
      has_residual: s.has_residual,
      residual_leaf_code: s.residual_leaf_code,
      ask_recommendation: 'ask',
      axes: axisEntries,
    });
  }

  // Deterministic ordering of the output.
  out.sort((x, y) => (x.subheading < y.subheading ? -1 : x.subheading > y.subheading ? 1 : 0));

  const noResidualCount = out.filter((e) => e.enrichment_kind === 'no_residual').length;
  const overrideCount = out.filter((e) => e.enrichment_kind === 'primary_residual_override').length;
  const fallbackOnly = out.filter((e) => e.ask_recommendation === 'fallback_only').length;
  const answerabilityFlags = out.reduce(
    (n, e) => n + e.axes.filter((a) => a.answerability_flag).length,
    0,
  );

  const artifact = {
    schema_version: 1,
    description:
      'Stage S3 askable surface. Bounded, human-facing per-subheading enrichment for the S4 divergence engine: plain-trade questions, MECE exporter-language options mapping to real leaves, honest residual escapes, branch order, answerability flags. Two enrichment kinds: no_residual (cannot default -> ask) and primary_residual_override (refined ASK rule -> ask a PRIMARY axis even over a residual; coffee 0901.11). Derived build-time from atomic-axes.json + axis-primacy.json + corpus leaf descriptions; no Gemini. Loaded read-only by lib/askable-surface-table.ts. DARK until S4 wires it.',
    derived_at: '2026-06-04',
    stats: {
      total_enriched: out.length,
      no_residual_askable: noResidualCount,
      primary_residual_overrides: overrideCount,
      fallback_only_subs: fallbackOnly,
      answerability_hard_flags: answerabilityFlags,
      dropped_no_clean_axis: droppedNoCleanAxis,
    },
    subheadings: out,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `askable-surface.json written: ${out.length} subs (${noResidualCount} no-residual, ${overrideCount} primary-residual overrides; ${fallbackOnly} fallback-only; ${answerabilityFlags} hard-answerability flags; ${droppedNoCleanAxis} dropped for no leaf-disjoint axis).`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

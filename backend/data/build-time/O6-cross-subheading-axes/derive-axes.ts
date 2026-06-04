/**
 * O6 — Cross-Subheading Forced-Choice Axis derivation (BUILD-TIME, no Gemini).
 *
 * Purpose
 * -------
 * Derive, from the corpus ALONE (tariff_lines + tariff_line_attributes), the set
 * of 4-digit HEADINGS where a single QGS-answerable axis (form / processing_state
 * / intended_use) splits the heading ACROSS two or more 6-digit subheadings AND
 * there is NO residual catch-all leaf to absorb a product that is silent on that
 * axis. These are exactly the headings where a query that pins every OTHER axis
 * still cannot pick a leaf — so the v2 brain is forced to GUESS the missing axis
 * (the "frozen chicken" → 0207.12 vs 0207.14 bug). For those headings the right
 * behaviour is to ASK one targeted, answerable question, not to guess.
 *
 * Why a CURATED table and not a blunt SQL net
 * -------------------------------------------
 * The prior PRE-L4 sibling trigger over-fired (~33% ask-rate) because it asked on
 * every sibling group. A wide mechanical net here would repeat that mistake: most
 * headings with `form` variety DO carry a residual "Other" leaf, so the
 * unmarked-default-wins rule applies and NO ask is warranted. The discriminating
 * corpus signal is therefore the ABSENCE of a bare residual ("Other"/"n.e.s.")
 * leaf on the splitting axis. This script encodes that signal precisely and emits
 * a SMALL, high-precision table; the runtime gate adds three further uncertainty
 * conditions (concentration + query-silence + non-decisive retrieval) on top, so
 * the table is a NECESSARY-not-sufficient filter, never a standalone ask trigger.
 *
 * Output
 * ------
 * Writes `axes.json` (the committed runtime artifact) next to this file. The
 * runtime loader (`backend/src/classifier-v2/lib/cross-subheading-axis-table.ts`)
 * reads ONLY that JSON; this script never runs in prod.
 *
 * Run (build-time only, requires DATABASE_URL):
 *   cd backend && npx tsx --require dotenv/config \
 *     data/build-time/O6-cross-subheading-axes/derive-axes.ts
 *
 * The committed `axes.json` was produced by this script + an adjudication pass
 * (see DERIVATION.md). Re-running reproduces the same machine candidates; the
 * curated `notes`/`option_labels` are merged from the existing file so manual
 * adjudications survive a re-derive.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

/* ---------------------------------------------------------------------------
 * Axis macro-class vocabularies (corpus TLA value families)
 *
 * Each "axis" maps the raw TLA array values into a small number of MACRO-CLASSES
 * that a non-expert exporter can actually answer. For `form` the decision is
 * whole-animal vs cut; for `processing_state` it is fresh vs frozen vs preserved.
 * These vocabularies are the ONLY corpus-specific knowledge in the derivation —
 * everything else is structural (subheading spread + residual detection).
 * --------------------------------------------------------------------------- */

interface AxisClass {
  /** The macro-class id surfaced as an answer option (stable, snake_case). */
  id: string;
  /** Raw TLA values (lowercased) that map to this class. */
  values: string[];
}

interface AxisVocabulary {
  /** Public AttributeKey asked at runtime. */
  attribute: 'form' | 'processing_state' | 'intended_use';
  classes: AxisClass[];
}

const FORM_AXIS: AxisVocabulary = {
  attribute: 'form',
  classes: [
    { id: 'whole', values: ['carcass', 'half-carcass', 'whole-bird', 'whole'] },
    { id: 'cut', values: ['cut', 'offal', 'boneless', 'piece', 'fillet'] },
  ],
};

const ALL_AXES: AxisVocabulary[] = [FORM_AXIS];

/* ---------------------------------------------------------------------------
 * Residual detection
 * --------------------------------------------------------------------------- */

/**
 * A leaf is a BARE residual on the splitting axis when its description is an
 * unqualified "Other" / "n.e.s." at the relevant nesting level — i.e. a product
 * silent on the axis would fall INTO it (unmarked-default-wins). Any heading with
 * such a leaf is EXCLUDED: the brain has a safe default and must not ask.
 */
const BARE_RESIDUAL_RE = /(^|: |-+ *)other\s*$|n\.e\.s/i;

function isBareResidual(description: string): boolean {
  return BARE_RESIDUAL_RE.test(description.trim());
}

/* ---------------------------------------------------------------------------
 * Derivation
 * --------------------------------------------------------------------------- */

interface LeafRow {
  code: string;
  description: string;
  heading: string;
  subheading: string;
  form: string[] | null;
  processing_state: string[] | null;
  intended_use: string[] | null;
}

interface DerivedAxisEntry {
  heading: string;
  attribute: string;
  /** macro-class id -> the distinct subheadings carrying it. */
  class_to_subheadings: Record<string, string[]>;
  /** macro-class id -> a representative leaf code (for option building / docs). */
  class_to_example_code: Record<string, string>;
  derivation: {
    whole_leaves: number;
    cut_leaves: number;
    distinct_subheadings: number;
    has_bare_residual: boolean;
  };
}

function classify(values: string[] | null, vocab: AxisVocabulary): string | null {
  if (!values || values.length === 0) return null;
  const lower = new Set(values.map((v) => v.toLowerCase()));
  const hit: string[] = [];
  for (const cls of vocab.classes) {
    if (cls.values.some((v) => lower.has(v))) hit.push(cls.id);
  }
  // A leaf is class-assignable only when it lands in EXACTLY one macro-class
  // (a leaf that is both whole AND cut, e.g. goat "0204.50.00", is ambiguous and
  // does not anchor a clean split — treated as unclassed).
  return hit.length === 1 ? hit[0]! : null;
}

function deriveForVocab(leaves: LeafRow[], vocab: AxisVocabulary): DerivedAxisEntry[] {
  const byHeading = new Map<string, LeafRow[]>();
  for (const l of leaves) {
    const arr = byHeading.get(l.heading) ?? [];
    arr.push(l);
    byHeading.set(l.heading, arr);
  }

  const out: DerivedAxisEntry[] = [];
  for (const [heading, rows] of byHeading) {
    const classToSubs = new Map<string, Set<string>>();
    const classToExample = new Map<string, string>();
    let wholeLeaves = 0;
    let cutLeaves = 0;
    let hasResidual = false;

    const fieldOf = (l: LeafRow): string[] | null =>
      vocab.attribute === 'form'
        ? l.form
        : vocab.attribute === 'processing_state'
          ? l.processing_state
          : l.intended_use;

    for (const l of rows) {
      if (isBareResidual(l.description)) hasResidual = true;
      const cls = classify(fieldOf(l), vocab);
      if (cls === null) continue;
      if (cls === 'whole') wholeLeaves++;
      if (cls === 'cut') cutLeaves++;
      const set = classToSubs.get(cls) ?? new Set<string>();
      set.add(l.subheading);
      classToSubs.set(cls, set);
      if (!classToExample.has(cls)) classToExample.set(cls, l.code);
    }

    // GATE: >=2 distinct macro-classes, each across >=1 subheading, AND the two
    // classes land in DIFFERENT subheadings (cross-subheading), AND no residual.
    if (classToSubs.size < 2) continue;
    if (hasResidual) continue;
    const allSubs = new Set<string>();
    for (const s of classToSubs.values()) for (const x of s) allSubs.add(x);
    if (allSubs.size < 2) continue;

    out.push({
      heading,
      attribute: vocab.attribute,
      class_to_subheadings: Object.fromEntries(
        [...classToSubs].map(([k, v]) => [k, [...v].sort()]),
      ),
      class_to_example_code: Object.fromEntries(classToExample),
      derivation: {
        whole_leaves: wholeLeaves,
        cut_leaves: cutLeaves,
        distinct_subheadings: allSubs.size,
        has_bare_residual: hasResidual,
      },
    });
  }
  return out.sort((a, b) => a.heading.localeCompare(b.heading));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (build-time only).');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<LeafRow>(`
      SELECT tl.code, tl.description,
             LEFT(tl.code,4) AS heading, LEFT(tl.code,7) AS subheading,
             tla.form, tla.processing_state, tla.intended_use
      FROM tariff_lines tl
      JOIN tariff_line_attributes tla ON tla.code = tl.code
    `);

    const entries: DerivedAxisEntry[] = [];
    for (const vocab of ALL_AXES) entries.push(...deriveForVocab(rows, vocab));

    const outPath = path.resolve(__dirname, 'axes.machine.json');
    fs.writeFileSync(outPath, JSON.stringify({ derived_at: new Date().toISOString(), entries }, null, 2));
    // eslint-disable-next-line no-console
    console.log(`Derived ${entries.length} candidate axis entries -> ${outPath}`);
    for (const e of entries) {
      // eslint-disable-next-line no-console
      console.log(`  ${e.heading} [${e.attribute}] subs=${e.derivation.distinct_subheadings} classes=${Object.keys(e.class_to_subheadings).join('/')}`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

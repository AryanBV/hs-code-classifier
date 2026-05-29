// backend/scripts/_corpus_separator_analysis.ts
//
// DETERMINISTIC corpus-wide analysis of the 8-digit leaf-separator landscape.
//
// Purpose (data-lever sizing for P3 enrichment): for EVERY 6-digit subheading
// that has >=2 tariff_lines ("multi-leaf"), classify the SEPARATOR AXIS that
// distinguishes its sibling 8-digit leaves, then cross-reference each axis
// against the existing `tariff_line_attributes` 41-column schema to mark
// coverage yes|partial|no. This quantifies which discriminators the current
// TLA columns already capture and which are GAPS (the P3 enrichment targets).
//
// READ-ONLY. No runtime/eval files touched. Run from backend/:
//   npx tsx --require dotenv/config scripts/_corpus_separator_analysis.ts
//
// pg connection pattern mirrors src/eval/gold-attributes-lookup.ts and
// scripts/snapshot-gold-attributes.ts (DATABASE_URL, ssl rejectUnauthorized:false).

import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Separator-axis taxonomy
// ---------------------------------------------------------------------------

type SeparatorAxis =
  | 'value-threshold'
  | 'pct-composition'
  | 'end-use'
  | 'packing'
  | 'species-or-material'
  | 'residual-Other'
  | 'enumerated'
  | 'ambiguous';

// TLA-coverage verdict per axis (static cross-reference vs db/types.ts schema).
type Coverage = 'yes' | 'partial' | 'no';

interface AxisMeta {
  coverage: Coverage;
  tlaColumns: string;
}

// Static map: which 41-column TLA fields (if any) capture each axis.
// Derived from backend/src/classifier-v2/db/types.ts (TariffLineAttributes).
const AXIS_META: Record<SeparatorAxis, AxisMeta> = {
  'value-threshold': {
    coverage: 'no',
    tlaColumns: '(none — no value/price/per-unit column exists)',
  },
  'pct-composition': {
    // 18 numeric *_pct columns cover Ch.71-83 metal composition only; sieve %
    // for Ch.72; chemical % elsewhere (textile blends, dairy fat, etc.) NOT covered.
    coverage: 'partial',
    tlaColumns:
      'carbon_pct..iron_pct (18 metal pcts), sieve_pass_pct_1mm/5mm, predominant_element — metals only; non-metal % (blends/fat/sugar) uncovered',
  },
  'end-use': {
    coverage: 'partial',
    tlaColumns: 'intended_use[], function_[], intended_role (Ch.90) — free-text array, no closed enum per heading',
  },
  packing: {
    coverage: 'no',
    tlaColumns: '(none — no retail/bulk/packing column exists)',
  },
  'species-or-material': {
    coverage: 'yes',
    tlaColumns: 'material[], composition[]',
  },
  'residual-Other': {
    // Not a data column: needs an L4 elimination-reasoning mode, not enrichment.
    coverage: 'no',
    tlaColumns: '(not a column — needs L4 elimination/residual-reasoning mode)',
  },
  enumerated: {
    coverage: 'partial',
    tlaColumns: 'material[]/form[]/function_[] capture some named items; no closed per-subheading enum',
  },
  ambiguous: {
    coverage: 'no',
    tlaColumns: '(unclassified — no dominant pattern)',
  },
};

// ---------------------------------------------------------------------------
// Regex / heuristic axis detectors (applied per leaf description)
// ---------------------------------------------------------------------------

const RE_VALUE_THRESHOLD =
  /\b(exceeding|not exceeding|per\s+(kg|kilogram|piece|pc|pair|unit|litre|liter|sq\.?\s?m|square met|tonne|ton|carat|gram|gm|number|thousand)\b|rs\.?\s|rupees|value\b|valued\b|c\.?i\.?f|per\s+cent\s+ad\s+valorem|ad\s+valorem)/i;

const RE_PCT_COMPOSITION =
  /(\d+(\.\d+)?\s?%|\bper\s?cent\b|\bpercent\b|by\s+weight|\bcontaining\b|content\s+(of|exceeding|not)|\bw\.?\s?w\.?\b|fat\s+content|sugar\s+content|alcoholic\s+strength|by\s+volume)/i;

const RE_END_USE =
  /\b(of\s+a\s+kind\s+used|for\s+use\s+in|suitable\s+for\s+use|for\s+the\s+manufacture|for\s+manufacture|designed\s+for|intended\s+for|used\s+(in|for|as)\b|for\s+use\s+with)\b/i;

const RE_PACKING =
  /\b(retail|put\s+up\s+for\s+retail|bulk\b|in\s+bulk|packed\b|pre-?packed|in\s+packages|in\s+packs|packings|wholesale|unit\s+container|bottled|canned|in\s+containers|put\s+up\s+in|immediate\s+packing|sachet)\b/i;

const RE_RESIDUAL_OTHER = /^\s*other\b/i;

// "Containing"/"%": when both pct and value match, pct wins for the composition axis.
// (handled by dominance ordering below)

interface AxisFlags {
  valueThreshold: boolean;
  pctComposition: boolean;
  endUse: boolean;
  packing: boolean;
  residualOther: boolean;
}

function flagLeaf(desc: string): AxisFlags {
  const d = (desc ?? '').trim();
  return {
    valueThreshold: RE_VALUE_THRESHOLD.test(d),
    pctComposition: RE_PCT_COMPOSITION.test(d),
    endUse: RE_END_USE.test(d),
    packing: RE_PACKING.test(d),
    residualOther: RE_RESIDUAL_OTHER.test(d),
  };
}

// ---------------------------------------------------------------------------
// Subheading-level classification
// ---------------------------------------------------------------------------

interface LeafRow {
  code: string;
  description: string;
}

interface SubheadingGroup {
  subheading: string;
  subheadingDescription: string;
  leaves: LeafRow[];
}

interface ClassifiedSubheading {
  subheading: string;
  subheadingDescription: string;
  leafCount: number;
  leafDescriptions: string[];
  tags: SeparatorAxis[]; // all that apply
  dominant: SeparatorAxis;
}

/**
 * Token-set similarity used to detect the "enumerated" axis: if the sibling
 * leaves are mostly distinct named items (low pairwise overlap, no residual
 * "Other" / value / pct / end-use / packing signal), they are enumerated.
 */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const STRUCTURAL_STOP = new Set([
  'other',
  'others',
  'and',
  'the',
  'for',
  'with',
  'not',
  'than',
  'kind',
  'used',
  'use',
  'parts',
  'part',
]);

/** Mean pairwise Jaccard over the leaf content tokens (excluding structural stop). */
function meanPairwiseJaccard(descs: string[]): number {
  const sets = descs.map((d) => {
    const t = tokenize(d);
    for (const s of STRUCTURAL_STOP) t.delete(s);
    return t;
  });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccard(sets[i]!, sets[j]!);
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function classifyGroup(g: SubheadingGroup): ClassifiedSubheading {
  const descs = g.leaves.map((l) => l.description ?? '');
  const flags = descs.map(flagLeaf);

  const anyValue = flags.some((f) => f.valueThreshold);
  const anyPct = flags.some((f) => f.pctComposition);
  const anyEndUse = flags.some((f) => f.endUse);
  const anyPacking = flags.some((f) => f.packing);
  const anyResidualOther = flags.some((f) => f.residualOther);

  // Tags = every axis that applies (excluding the soft "enumerated"/"ambiguous"
  // which are computed as fallbacks for the dominant axis).
  const tags: SeparatorAxis[] = [];
  if (anyValue) tags.push('value-threshold');
  if (anyPct) tags.push('pct-composition');
  if (anyEndUse) tags.push('end-use');
  if (anyPacking) tags.push('packing');
  if (anyResidualOther) tags.push('residual-Other');

  // Whether each axis acts as a *discriminator*: some leaves carry it AND some
  // do not (i.e. it actually splits the siblings). A signal present on ALL
  // leaves equally does not discriminate — but for residual-Other a single
  // "Other" leaf vs named siblings is the canonical discriminator.
  const countValue = flags.filter((f) => f.valueThreshold).length;
  const countPct = flags.filter((f) => f.pctComposition).length;
  const countEndUse = flags.filter((f) => f.endUse).length;
  const countPacking = flags.filter((f) => f.packing).length;
  const countResidual = flags.filter((f) => f.residualOther).length;
  const total = descs.length;

  const discValue = countValue > 0 && countValue < total;
  const discPct = countPct > 0; // pct usually appears on threshold leaves; treat presence as discriminating
  const discEndUse = countEndUse > 0 && countEndUse < total;
  const discPacking = countPacking > 0;
  const discResidual = countResidual > 0 && countResidual < total; // 1+ "Other" vs named siblings

  // Detect species/material: low residual signal but the leaves look like named
  // material/species variants. Heuristic: no value/pct/packing/end-use/residual
  // discriminator AND the leaves share a common stem but differ by a content
  // noun (moderate Jaccard). We approximate via the meanPairwiseJaccard band.
  const mj = meanPairwiseJaccard(descs);

  // Dominance ordering (most specific / highest-confidence first). The first
  // matching discriminator becomes the dominant axis.
  let dominant: SeparatorAxis;
  if (discValue) {
    dominant = 'value-threshold';
  } else if (discPct) {
    dominant = 'pct-composition';
  } else if (discPacking) {
    dominant = 'packing';
  } else if (discEndUse) {
    dominant = 'end-use';
  } else if (discResidual) {
    dominant = 'residual-Other';
  } else if (mj >= 0.34) {
    // High shared-token overlap with a differing content noun → species/material
    // variants under a common product family.
    dominant = 'species-or-material';
  } else if (mj <= 0.12) {
    // Very low overlap → distinct named items (enumerated list).
    dominant = 'enumerated';
  } else {
    dominant = 'ambiguous';
  }

  // Make sure dominant is included in tags (species/material, enumerated,
  // ambiguous are not added above).
  if (!tags.includes(dominant)) tags.push(dominant);

  return {
    subheading: g.subheading,
    subheadingDescription: g.subheadingDescription,
    leafCount: g.leaves.length,
    leafDescriptions: descs,
    tags,
    dominant,
  };
}

// ---------------------------------------------------------------------------
// Deterministic sampling (seeded LCG) for the 30-record QC inspection
// ---------------------------------------------------------------------------

function seededShuffle<T>(arr: T[], seed: number): T[] {
  // Fisher-Yates with a deterministic LCG so the QC sample is reproducible.
  const a = arr.slice();
  let state = seed >>> 0;
  const next = (): number => {
    // Numerical Recipes LCG
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error('_corpus_separator_analysis: DATABASE_URL is not set in env');
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  try {
    // 1. Multi-leaf subheadings: every 6-digit subheading with >=2 tariff_lines,
    //    plus the subheading description and each sibling leaf description.
    const sql = `
      SELECT
        tl.subheading                       AS subheading,
        sh.title                             AS subheading_description,
        tl.code                              AS code,
        tl.description                       AS leaf_description
      FROM tariff_lines tl
      JOIN subheadings sh ON sh.subheading = tl.subheading
      WHERE tl.subheading IN (
        SELECT subheading
        FROM tariff_lines
        GROUP BY subheading
        HAVING COUNT(*) >= 2
      )
      ORDER BY tl.subheading, tl.code
    `;
    const res = await pool.query<{
      subheading: string;
      subheading_description: string | null;
      code: string;
      leaf_description: string | null;
    }>(sql);

    // Also fetch the total subheading count (single + multi leaf) for context.
    const totalShRes = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM subheadings`,
    );
    const totalSubheadings = Number(totalShRes.rows[0]?.n ?? '0');

    // Group rows by subheading.
    const groupsMap = new Map<string, SubheadingGroup>();
    for (const row of res.rows) {
      let g = groupsMap.get(row.subheading);
      if (!g) {
        g = {
          subheading: row.subheading,
          subheadingDescription: row.subheading_description ?? '',
          leaves: [],
        };
        groupsMap.set(row.subheading, g);
      }
      g.leaves.push({ code: row.code, description: row.leaf_description ?? '' });
    }

    const groups = Array.from(groupsMap.values());
    const multiLeafSubheadings = groups.length;

    // 2-3. Classify every group.
    const classified = groups.map(classifyGroup);

    // Histogram by dominant axis.
    const axisOrder: SeparatorAxis[] = [
      'value-threshold',
      'pct-composition',
      'end-use',
      'packing',
      'species-or-material',
      'residual-Other',
      'enumerated',
      'ambiguous',
    ];
    const dominantCounts = new Map<SeparatorAxis, number>();
    const anyTagCounts = new Map<SeparatorAxis, number>();
    for (const ax of axisOrder) {
      dominantCounts.set(ax, 0);
      anyTagCounts.set(ax, 0);
    }
    for (const c of classified) {
      dominantCounts.set(c.dominant, (dominantCounts.get(c.dominant) ?? 0) + 1);
      for (const t of new Set(c.tags)) {
        anyTagCounts.set(t, (anyTagCounts.get(t) ?? 0) + 1);
      }
    }

    const histogram = axisOrder.map((ax) => {
      const count = dominantCounts.get(ax) ?? 0;
      const meta = AXIS_META[ax];
      return {
        type: ax,
        subheadingCount: count,
        pctOfMultiLeaf: multiLeafSubheadings > 0 ? +((count / multiLeafSubheadings) * 100).toFixed(1) : 0,
        anyTagCount: anyTagCounts.get(ax) ?? 0,
        coveredByExistingTLA: meta.coverage,
        tlaColumns: meta.tlaColumns,
      };
    });

    // Top gap axes = highest-prevalence dominant axes whose coverage is 'no'.
    // (partial axes are secondary gaps; we surface 'no' as the primary P3 targets,
    //  but also include 'partial' high-prevalence ones in the printed output.)
    const gapCandidates = histogram
      .filter((h) => h.coveredByExistingTLA === 'no' || h.coveredByExistingTLA === 'partial')
      .filter((h) => h.type !== 'ambiguous')
      .sort((a, b) => b.subheadingCount - a.subheadingCount);

    // Build example subheadings (up to 3) + example leaf descriptions per gap axis.
    function examplesFor(ax: SeparatorAxis): {
      exampleSubheadings: string[];
      exampleLeafDescriptions: string[];
    } {
      const matches = classified.filter((c) => c.dominant === ax).slice(0, 3);
      const exampleSubheadings = matches.map(
        (m) => `${m.subheading} — ${truncate(m.subheadingDescription, 70)}`,
      );
      const exampleLeafDescriptions: string[] = [];
      for (const m of matches) {
        for (const d of m.leafDescriptions.slice(0, 3)) {
          exampleLeafDescriptions.push(`[${m.subheading}] ${truncate(d, 80)}`);
        }
      }
      return { exampleSubheadings, exampleLeafDescriptions };
    }

    // 4. Deterministic 30-record QC sample for manual precision inspection.
    const sample = seededShuffle(classified, 20260529).slice(0, 30);

    // -------------------- OUTPUT --------------------
    const out = {
      totalSubheadings,
      multiLeafSubheadings,
      singleLeafOrZero: totalSubheadings - multiLeafSubheadings,
      separatorHistogram: histogram,
      topGapAxes: gapCandidates.slice(0, 6).map((h) => ({
        axis: h.type,
        prevalenceSubheadings: h.subheadingCount,
        pctOfMultiLeaf: h.pctOfMultiLeaf,
        currentlyCovered: h.coveredByExistingTLA,
        tlaColumns: h.tlaColumns,
        ...examplesFor(h.type as SeparatorAxis),
      })),
      qcSample: sample.map((s) => ({
        subheading: s.subheading,
        dominant: s.dominant,
        tags: s.tags,
        subheadingDescription: truncate(s.subheadingDescription, 90),
        leaves: s.leafDescriptions.map((d) => truncate(d, 90)),
      })),
    };

    console.log('===== CORPUS SEPARATOR ANALYSIS =====');
    console.log(JSON.stringify(out, null, 2));
    console.log('===== END =====');
  } finally {
    await pool.end();
  }
}

function truncate(s: string, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

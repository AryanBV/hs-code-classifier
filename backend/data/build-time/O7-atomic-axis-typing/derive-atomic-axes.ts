/**
 * O7 — Atomic-Axis Typing + Residual-Default Detection (BUILD-TIME, no Gemini).
 *
 * Purpose
 * -------
 * The Stage S4 divergence engine needs, for EVERY multi-leaf subheading (a
 * 6-digit "NNNN.NN" carrying ≥2 eight-digit tariff_lines), a structural answer to
 * two questions:
 *
 *   (a) ATOMIC-AXIS TYPING — the tokens fused inside the TLA attribute arrays and
 *       the leaf descriptions actually encode SEVERAL independent concept-axes
 *       (e.g. coffee's single processing_state array
 *       `raw|not-roasted|not-decaffeinated|cherry|dry-processed|graded-AB` carries
 *       roasted, decaf, coffee-form, process-method and grade ALL AT ONCE). This
 *       job un-fuses them into NAMED axes (thermal, presentation, variety, form,
 *       grade, decaf, roasted, polymer, end-use …) so the engine can ask ONE clean
 *       question per axis instead of one jumbled question over a soup of tokens.
 *
 *   (b) RESIDUAL-DEFAULT DETECTION — does the subheading carry an "Other / n.e.s."
 *       catch-all leaf, and which code? When a residual exists, the project's
 *       UNMARKED-DEFAULT-WINS rule means a query silent on the axis defaults there
 *       and the engine must NOT ask. This is what tells the engine when to stay
 *       quiet.
 *
 * What an "axis" is, precisely (the core un-fusing transform)
 * ----------------------------------------------------------
 * The TLA arrays largely REPEAT the subheading-defining tokens on every leaf
 * (every 5208.52 leaf is `printed|plain-weave|weight-100-to-200gsm`). Those shared
 * tokens DEFINE the 6-digit subheading; they do NOT discriminate its leaves. The
 * discriminating signal is exactly the tokens (and description names) that VARY
 * across the leaves. So:
 *
 *   1. Map every leaf token (and a small set of description-derived names) through
 *      a CONCEPT-AXIS DICTIONARY: token -> named axis.
 *   2. For each axis, collect the value -> {leaf codes} partition over the sub's
 *      leaves.
 *   3. KEEP an axis as a discriminating axis for the sub iff its values VARY across
 *      the leaves (≥2 distinct values present, i.e. it splits the leaf set). A
 *      uniform axis (same value on every leaf) is subheading-defining, not asked.
 *   4. Tokens mapping to NO dictionary axis are recorded as `unclassified` so
 *      coverage is honest and measurable.
 *
 * Classification of each multi-leaf sub
 * -------------------------------------
 *   - residual_default      : has a bare "Other"/"n.e.s." catch-all leaf — a silent
 *                             query defaults there; the engine should NOT ask
 *                             (unmarked-default-wins).
 *   - askable_no_residual   : ≥1 discriminating axis fully typed AND NO residual —
 *                             a silent query cannot pick a leaf, so the engine asks
 *                             one clean per-axis question. (The high-value target.)
 *   - single_axis_resolved  : exactly one discriminating axis whose every value
 *                             maps to exactly one leaf AND no residual — one
 *                             question fully resolves the sub (a clean special case
 *                             of askable_no_residual, surfaced separately so the
 *                             engine can shortcut).
 *   - untypable             : leaves differ but on NO typed axis (only unclassified
 *                             tokens / no usable description signal). FAIL-SAFE: the
 *                             engine just lets the brain classify (never asks a
 *                             jumbled question).
 *
 * Output (next to this file)
 * --------------------------
 *   - atomic-axes.json  : the committed runtime artifact (loaded by
 *                         backend/src/classifier-v2/lib/atomic-axis-table.ts).
 *   - stats.json        : coverage + classification counts + hand-verify family
 *                         summaries (for the post-execution report; not loaded).
 *
 * Run (build-time only, requires DATABASE_URL; no Gemini, no paid API):
 *   cd backend && npx tsx --require dotenv/config \
 *     data/build-time/O7-atomic-axis-typing/derive-atomic-axes.ts
 *
 * This script never runs in prod; the runtime loader reads ONLY atomic-axes.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

/* ===========================================================================
 * 1) CONCEPT-AXIS DICTIONARY
 *
 * Maps the corpus's actual atomic TLA tokens (lowercased) to NAMED concept-axes.
 * Tokens are derived from the data (top within-subheading VARYING tokens across
 * all 2241 multi-leaf subs); the GROUPINGS are HS-sensible. Each axis carries the
 * source column(s) its tokens live in so we never cross-contaminate (a `solid`
 * physical-form token in `form` must not collide with a chemistry token).
 *
 * IMPORTANT: an axis is keyed by NAME. The same conceptual axis (e.g. `presentation`
 * whole-vs-cut) may receive tokens from more than one column.
 * =========================================================================== */

type SourceCol = 'form' | 'processing_state' | 'intended_use' | 'composition';

interface AxisDef {
  /** Named concept-axis id (stable, snake_case). */
  axis: string;
  /** Human label for the axis (used by the engine's question scaffold). */
  label: string;
  /** Which TLA columns this axis reads tokens from. */
  cols: SourceCol[];
  /**
   * value-id -> the exact lowercased atomic tokens that map to it. The value-id is
   * the canonical answer-bucket; multiple raw tokens can collapse into one value
   * (e.g. carcass + half-carcass + whole-bird -> `whole`).
   */
  values: Record<string, string[]>;
}

/**
 * The dictionary. Ordered by HS-importance; the order is also the deterministic
 * tiebreak when a token could (it never should) match two axes on the same column.
 */
const AXIS_DEFS: AxisDef[] = [
  /* --- Animal / food primary axes ------------------------------------------ */
  {
    axis: 'thermal',
    label: 'Fresh/chilled vs frozen',
    cols: ['processing_state'],
    values: {
      fresh_or_chilled: ['fresh', 'chilled', 'fresh-or-chilled'],
      frozen: ['frozen'],
      live: ['live'],
    },
  },
  {
    axis: 'presentation',
    label: 'Whole vs cuts vs offal',
    cols: ['form'],
    values: {
      whole: ['carcass', 'half-carcass', 'whole-bird', 'whole', 'whole-fish', 'whole-crustacean'],
      cut: ['cut', 'boneless', 'piece', 'fillet', 'with-bone'],
      offal: ['offal', 'liver', 'foie-gras'],
    },
  },

  /* --- Coffee / tea / spice family axes ------------------------------------ */
  {
    axis: 'roasted',
    label: 'Roasted vs not roasted',
    cols: ['processing_state'],
    values: {
      roasted: ['roasted'],
      not_roasted: ['not-roasted', 'unroasted'],
    },
  },
  {
    axis: 'decaffeinated',
    label: 'Decaffeinated vs not decaffeinated',
    cols: ['processing_state'],
    values: {
      decaffeinated: ['decaffeinated'],
      not_decaffeinated: ['not-decaffeinated'],
    },
  },
  {
    axis: 'coffee_form',
    label: 'Coffee form (plantation / cherry / parchment)',
    cols: ['processing_state'],
    values: {
      plantation: ['plantation'],
      cherry: ['cherry'],
      parchment: ['parchment'],
    },
  },
  {
    axis: 'process_method',
    label: 'Processing method (dry / wet)',
    cols: ['processing_state'],
    values: {
      dry_processed: ['dry-processed'],
      wet_processed: ['wet-processed'],
    },
  },
  {
    axis: 'grade',
    label: 'Grade',
    cols: ['processing_state'],
    values: {
      grade_a: ['graded-a'],
      grade_b: ['graded-b'],
      grade_c: ['graded-c'],
      grade_ab: ['graded-ab'],
      grade_pb: ['graded-pb', 'peaberry'],
      grade_bbb: ['graded-bbb'],
      bulk: ['bulk'],
    },
  },

  /* --- Textile axes -------------------------------------------------------- */
  {
    axis: 'textile_finish',
    label: 'Fabric finishing (unbleached / bleached / dyed / printed / yarn-dyed)',
    cols: ['processing_state'],
    values: {
      unbleached: ['unbleached', 'grey', 'greige'],
      bleached: ['bleached'],
      dyed: ['dyed', 'piece-dyed', 'tinted'],
      printed: ['printed'],
      yarn_dyed: ['of-yarns-of-different-colours'],
    },
  },
  {
    axis: 'weave',
    label: 'Weave construction',
    cols: ['processing_state'],
    values: {
      plain_weave: ['plain-weave', 'plain'],
      twill: ['twill-3-or-4-thread'],
      dobby: ['dobby-figured-weave'],
      damask: ['damask-figured-weave'],
      other_weave: ['other-weave'],
    },
  },
  {
    axis: 'fabric_weight',
    label: 'Fabric weight',
    cols: ['processing_state'],
    values: {
      not_more_than_100gsm: ['weight-not-more-than-100gsm'],
      weight_100_to_200gsm: ['weight-100-to-200gsm'],
      not_more_than_200gsm: ['weight-not-more-than-200gsm'],
      over_200gsm: ['weight-over-200gsm'],
    },
  },
  {
    axis: 'weaving_method',
    label: 'Handloom vs mill / power-loom',
    cols: ['processing_state', 'form'],
    values: {
      handloom: ['handloom-woven', 'handwoven', 'handloom', 'handspun'],
      mill: ['mill-woven', 'powerloom'],
    },
  },
  {
    axis: 'embellishment',
    label: 'Embellishment (embroidered / zari border / chikan)',
    cols: ['processing_state', 'composition'],
    values: {
      embroidered: ['embroidered'],
      zari_border: ['zari-border', 'with-metallic-zari-border'],
      chikan: ['chikan-craft'],
    },
  },

  /* --- Polymer / plastics / rubber axes ------------------------------------ */
  {
    axis: 'polymer',
    label: 'Polymer type',
    cols: ['composition'],
    values: {
      polyethylene: ['ethylene', 'polyethylene', 'polythene'],
      polypropylene: ['propylene', 'polypropylene-100pct'],
      pvc: ['vinyl-chloride', 'poly-vinyl-chloride', 'pvc'],
      polystyrene: ['styrene'],
      vinyl_acetate: ['vinyl-acetate'],
      acrylic: ['acrylic-polymer', 'acrylic-100pct', 'methyl-methacrylate'],
    },
  },
  {
    axis: 'cellularity',
    label: 'Cellular vs non-cellular / rigid vs flexible',
    cols: ['processing_state'],
    values: {
      cellular: ['cellular', 'foam'],
      non_cellular: ['non-cellular'],
      rigid: ['rigid'],
      flexible: ['flexible'],
    },
  },

  /* --- Metals axes --------------------------------------------------------- */
  {
    axis: 'metal_working',
    label: 'Working state (hot-rolled / cold-rolled / drawn / cast …)',
    cols: ['processing_state'],
    values: {
      hot_rolled: ['hot-rolled'],
      cold_rolled: ['cold-rolled', 'cold-drawn'],
      cast: ['cast'],
      forged: ['forged'],
      wrought: ['wrought'],
      unwrought: ['unwrought'],
    },
  },
  {
    axis: 'metal_coating',
    label: 'Coating (galvanized / coated / uncoated)',
    cols: ['processing_state'],
    values: {
      galvanized: ['galvanized', 'zinc-coated'],
      coated: ['coated'],
      uncoated: ['uncoated'],
    },
  },
  {
    axis: 'coil_state',
    label: 'In coils vs not in coils',
    cols: ['processing_state'],
    values: {
      in_coils: ['in-coils'],
      not_in_coils: ['not-in-coils'],
    },
  },
  {
    axis: 'pipe_construction',
    label: 'Seamless vs welded',
    cols: ['processing_state', 'form'],
    values: {
      seamless: ['seamless'],
      welded: ['welded'],
    },
  },

  /* --- Physical-form axis (generic) ---------------------------------------- */
  {
    axis: 'physical_form',
    label: 'Physical form',
    cols: ['form'],
    values: {
      powder: ['powder', 'powdered', 'flour', 'meal', 'flake', 'granule', 'pellet'],
      liquid: ['liquid', 'oil', 'syrup', 'solution', 'aqueous-solution', 'viscous'],
      solid: ['solid', 'lump', 'block', 'crystal', 'crystalline'],
      paste: ['paste', 'gel'],
      gas: ['gas'],
      sheet: ['sheet', 'plate', 'film', 'foil', 'strip', 'board'],
      bar: ['bar', 'rod', 'profile', 'wire'],
      tube: ['tube', 'pipe'],
    },
  },

  /* --- Chemistry axes ------------------------------------------------------ */
  {
    axis: 'chem_structure',
    label: 'Aromatic vs non-aromatic / saturated vs unsaturated',
    cols: ['processing_state'],
    values: {
      aromatic: ['aromatic'],
      unsaturated: ['unsaturated'],
      saturated: ['saturated'],
      halogenated: ['halogenated', 'chlorinated'],
    },
  },
  {
    axis: 'retail_packing',
    label: 'Retail vs bulk packing',
    cols: ['processing_state', 'form'],
    values: {
      for_retail_sale: ['for-retail-sale', 'put-up-for-retail-sale', 'retail-pack'],
      not_for_retail_sale: ['not-for-retail-sale', 'not-put-up-for-retail-sale'],
      bulk_packing: ['bulk', 'in-bulk-packing', 'bulk-packing'],
    },
  },

  /* --- End-use axis (intended_use names) ----------------------------------- */
  {
    axis: 'end_use',
    label: 'Intended end use',
    cols: ['intended_use'],
    values: {
      apparel: ['apparel', 'shirt-making', 'suit-making', 'traditional-mens-wear', 'traditional-womens-wear', 'traditional-wear', 'outerwear', 'sleepwear', 'nightwear'],
      household: ['household', 'furnishing', 'upholstery', 'curtains', 'curtain', 'bedlinen', 'bedding', 'mattress-cover', 'domestic', 'furnishing-fabric'],
      industrial: ['industrial', 'manufacturing', 'fabrication', 'construction'],
      packaging: ['packaging'],
      pharmaceutical: ['pharmaceutical', 'pharmaceutical-intermediate', 'pharmaceutical-synthesis', 'medical'],
      agricultural: ['agricultural', 'agriculture', 'agrochemical', 'sowing'],
      automotive: ['automotive', 'road', 'passenger-transport'],
    },
  },

  /* --- Textile fibre / material axis (Ch.50-63 apparel & made-ups) --------- */
  {
    axis: 'fiber_type',
    label: 'Fibre / textile material',
    cols: ['composition'],
    values: {
      cotton: ['cotton', 'cotton-100pct', 'cotton-85pct-or-more', 'cotton-under-85pct-mixed-with-man-made-fibres', 'cotton-blend'],
      silk: ['silk', 'silk-100pct'],
      wool: ['wool', 'wool-or-fine-animal-hair', 'wool-100pct', 'wool-85pct-or-more', 'wool-under-85pct', 'coarse-animal-hair-100pct'],
      synthetic_fibre: ['synthetic-fibre', 'synthetic-other-not-elsewhere-specified', 'polyester-100pct', 'nylon-85pct-or-more', 'acrylic-100pct'],
      artificial_fibre: ['artificial-fibre', 'artificial-other-not-elsewhere-specified', 'viscose-rayon-100pct', 'rayon-85pct-or-more', 'acetate', 'cellulose-acetate-100pct'],
      man_made_fibre: ['man-made-fibre', 'man-made-fibres'],
      jute: ['jute', 'jute-100pct', 'jute-50pct-or-more'],
      flax: ['flax-85pct-or-more', 'flax-less-than-85pct'],
    },
  },

  /* --- Component / part vs complete machine (Ch.84-90) --------------------- */
  {
    axis: 'machine_part',
    label: 'Complete machine vs part / accessory',
    cols: ['form'],
    values: {
      complete: ['machine', 'complete-equipment', 'apparatus', 'instrument', 'appliance', 'complete-preparation'],
      part: ['part', 'component'],
      accessory: ['accessory', 'made-up-accessory', 'fitting', 'attachment'],
    },
  },
  {
    axis: 'electric_machine',
    label: 'Motor vs generator',
    cols: ['form'],
    values: {
      motor: ['motor'],
      generator: ['generator', 'generating-set'],
    },
  },

  /* --- Vehicle axes (Ch.87) ------------------------------------------------ */
  {
    axis: 'vehicle_type',
    label: 'Vehicle body type',
    cols: ['form'],
    values: {
      bus: ['bus', 'minibus'],
      van: ['van', 'mini-van'],
      car: ['passenger-car', 'motor-car', 'people-carrier'],
      special_purpose: ['ambulance', 'prison-van', 'specialised-transport-vehicle'],
    },
  },
  {
    axis: 'air_conditioning',
    label: 'Air-conditioned vs not',
    cols: ['processing_state'],
    values: {
      air_conditioned: ['air-conditioned'],
      non_air_conditioned: ['non-air-conditioned'],
    },
  },
  {
    axis: 'body_construction',
    label: 'Body construction',
    cols: ['processing_state'],
    values: {
      monocoque: ['integrated-monocoque'],
      body_on_chassis: ['body-on-chassis'],
    },
  },

  /* --- Materials working-state / quality axes ------------------------------ */
  {
    axis: 'worked_state',
    label: 'Worked vs unworked',
    cols: ['processing_state', 'form'],
    values: {
      worked: ['worked'],
      unworked: ['unworked'],
      sorted: ['sorted'],
      unsorted: ['unsorted'],
    },
  },
  {
    axis: 'gem_quality',
    label: 'Industrial vs jewellery/non-industrial quality',
    cols: ['processing_state', 'intended_use'],
    values: {
      industrial: ['industrial', 'abrasive'],
      non_industrial: ['non-industrial', 'jewellery-making', 'gem-quality'],
    },
  },
  {
    axis: 'origin_nature',
    label: 'Natural vs synthetic',
    cols: ['processing_state'],
    values: {
      natural: ['natural'],
      synthetic: ['synthetic'],
      reconstructed: ['reconstructed'],
    },
  },
];

/* ===========================================================================
 * 1b) PATTERN-RULE AXES (numeric / systematic bands)
 *
 * Some genuine concept-axes are NUMERIC bands the corpus encodes as systematic
 * token families: engine power (`power-1000kw-to-5000kw`), transformer rating
 * (`5000kva-to-15000kva`), pipe outer diameter (`outer-diameter-above-219.1mm`),
 * container size (`container-over-2l`), and seat capacity (`over-13-seats`). Each
 * leaf gets a DISTINCT band, so they split a subheading cleanly. Enumerating
 * every band by hand is brittle; instead a small set of PREFIX/regex rules maps a
 * matching token to a named axis, using the token ITSELF as the value-id (the band
 * label). The rule fires on a column + regex; first match wins (after the exact
 * dictionary, which always takes precedence).
 * =========================================================================== */

interface PatternAxisRule {
  axis: string;
  label: string;
  cols: SourceCol[];
  test: RegExp;
}

const PATTERN_AXES: PatternAxisRule[] = [
  { axis: 'power_rating', label: 'Power / output rating', cols: ['processing_state'], test: /(^|[^a-z])(power-)?\d[\d.]*\s*kw(-to-|\b)|-kw-|over-\d[\d.]*kw|\bkw-to-/ },
  { axis: 'capacity_rating', label: 'Capacity rating (kVA)', cols: ['processing_state'], test: /\d[\d.]*\s*kva(-to-|\b)|over-\d[\d.]*kva/ },
  { axis: 'diameter_band', label: 'Outer-diameter band', cols: ['processing_state'], test: /^outer-diameter-/ },
  { axis: 'container_size', label: 'Container size band', cols: ['processing_state', 'form'], test: /^container-(over-)?\d/ },
  { axis: 'seat_capacity', label: 'Seating capacity', cols: ['processing_state'], test: /(^|-)(over|up-to|under)-\d+-seats?$|^over-\d+-persons?$/ },
];

/** A flat token -> [{axis, value, col}] index, built once. */
interface TokenAxisHit { axis: string; value: string; col: SourceCol; }
const TOKEN_INDEX: Map<string, TokenAxisHit[]> = (() => {
  const idx = new Map<string, TokenAxisHit[]>();
  for (const def of AXIS_DEFS) {
    for (const [value, tokens] of Object.entries(def.values)) {
      for (const tok of tokens) {
        const key = tok.toLowerCase();
        for (const col of def.cols) {
          const arr = idx.get(`${col}::${key}`) ?? [];
          arr.push({ axis: def.axis, value, col });
          idx.set(`${col}::${key}`, arr);
        }
      }
    }
  }
  return idx;
})();

const AXIS_LABEL: Map<string, string> = new Map<string, string>([
  ...AXIS_DEFS.map((d) => [d.axis, d.label] as [string, string]),
  ...PATTERN_AXES.map((p) => [p.axis, p.label] as [string, string]),
]);

/** Deterministic axis order = exact-dict order, then pattern-rule order. */
const AXIS_ORDER: Map<string, number> = new Map<string, number>([
  ...AXIS_DEFS.map((d, i) => [d.axis, i] as [string, number]),
  ...PATTERN_AXES.map((p, i) => [p.axis, AXIS_DEFS.length + i] as [string, number]),
]);

/**
 * Map a (column, token) to its axis hit(s); empty when the token is untyped.
 * Exact-dictionary hits take precedence; if none, the pattern rules are tried (the
 * token itself becomes the value-id, i.e. the band label). First match wins.
 */
function lookupToken(col: SourceCol, token: string): TokenAxisHit[] {
  const key = token.toLowerCase();
  const exact = TOKEN_INDEX.get(`${col}::${key}`);
  if (exact !== undefined && exact.length > 0) return exact;
  for (const rule of PATTERN_AXES) {
    if (rule.cols.includes(col) && rule.test.test(key)) {
      return [{ axis: rule.axis, value: key, col }];
    }
  }
  return [];
}

/* ===========================================================================
 * 2) RESIDUAL DETECTION
 *
 * A leaf is a residual/catch-all when its description is an unqualified "Other" /
 * "n.e.s." / "not elsewhere specified" at the relevant nesting level. The code
 * shape (.90 / .99 tail) is a SECONDARY corroborating signal — the description is
 * the primary, since some .90 lines are real named products (e.g. 0901.90.20
 * "Coffee substitutes") and some residuals are not .90 (.29/.19 "Other").
 * =========================================================================== */

const BARE_RESIDUAL_RE = /(^|:\s*|-+\s*)(other|others)\s*$|n\.?e\.?s|not elsewhere (specified|included)|not specified/i;

function isResidualDescription(description: string): boolean {
  return BARE_RESIDUAL_RE.test(description.trim());
}

/** The last two digits of the 8-digit code, e.g. "90" / "99" / "00". */
function codeTail(code: string): string {
  const m = /(\d{2})$/.exec(code);
  return m ? m[1]! : '';
}

/* ===========================================================================
 * 3) DERIVATION
 * =========================================================================== */

interface LeafRow {
  code: string;
  subheading: string;
  description: string;
  form: string[] | null;
  processing_state: string[] | null;
  intended_use: string[] | null;
  composition: string[] | null;
}

const COLS: SourceCol[] = ['form', 'processing_state', 'intended_use', 'composition'];

function colValues(leaf: LeafRow, col: SourceCol): string[] {
  const raw =
    col === 'form' ? leaf.form
      : col === 'processing_state' ? leaf.processing_state
        : col === 'intended_use' ? leaf.intended_use
          : leaf.composition;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/** One discriminating axis emitted for a subheading. */
interface DerivedAxis {
  axis: string;
  label: string;
  /** value-id -> the leaf codes carrying that value (the partition). */
  value_to_codes: Record<string, string[]>;
  /** Distinct value-ids present (sorted) — the MECE option set the engine offers. */
  values_present: string[];
}

interface DerivedSubheading {
  subheading: string;
  heading: string;
  chapter: string;
  leaf_count: number;
  classification: 'residual_default' | 'askable_no_residual' | 'single_axis_resolved' | 'untypable';
  has_residual: boolean;
  residual_leaf_code: string | null;
  /** Discriminating axes (only those that actually VARY across the leaves). */
  axes: DerivedAxis[];
  /** Raw tokens (col::token) that mapped to NO axis but DO vary across leaves. */
  unclassified_varying: string[];
}

/**
 * Compute the discriminating axes for a single multi-leaf subheading.
 *
 * For each (column, axis) we build value-id -> {leaf codes}. We keep the axis iff
 * it splits the leaves (≥2 distinct value-ids present). Tokens that map to no axis
 * AND vary across the leaves are recorded as unclassified_varying (honest coverage).
 */
function deriveSubheading(subheading: string, leaves: LeafRow[]): DerivedSubheading {
  const heading = subheading.slice(0, 4);
  const chapter = subheading.slice(0, 2);
  const leafCount = leaves.length;

  // ---- residual detection -------------------------------------------------
  let residualLeafCode: string | null = null;
  for (const l of leaves) {
    if (isResidualDescription(l.description)) {
      // Prefer a .90/.99 residual; otherwise take the first residual seen.
      const tail = codeTail(l.code);
      if (residualLeafCode === null || tail === '90' || tail === '99') {
        residualLeafCode = l.code;
      }
    }
  }
  const hasResidual = residualLeafCode !== null;

  // ---- axis derivation ----------------------------------------------------
  // axis -> value-id -> Set<leaf code>
  const axisMap = new Map<string, Map<string, Set<string>>>();
  // (col::token) -> Set<leaf code>, for tokens that map to NO axis.
  const untypedTokenLeaves = new Map<string, Set<string>>();

  for (const leaf of leaves) {
    for (const col of COLS) {
      for (const token of colValues(leaf, col)) {
        const hits = lookupToken(col, token);
        if (hits.length === 0) {
          const k = `${col}::${token}`;
          const s = untypedTokenLeaves.get(k) ?? new Set<string>();
          s.add(leaf.code);
          untypedTokenLeaves.set(k, s);
          continue;
        }
        // Deterministic: a token maps to the FIRST axis def order match.
        const hit = hits[0]!;
        const valMap = axisMap.get(hit.axis) ?? new Map<string, Set<string>>();
        const codeSet = valMap.get(hit.value) ?? new Set<string>();
        codeSet.add(leaf.code);
        valMap.set(hit.value, codeSet);
        axisMap.set(hit.axis, valMap);
      }
    }
  }

  // Keep only axes that VARY (≥2 distinct value-ids present across the leaves).
  const axes: DerivedAxis[] = [];
  for (const [axis, valMap] of axisMap) {
    if (valMap.size < 2) continue; // uniform across leaves => subheading-defining
    const value_to_codes: Record<string, string[]> = {};
    for (const [value, codes] of valMap) {
      value_to_codes[value] = [...codes].sort();
    }
    const values_present = Object.keys(value_to_codes).sort();
    axes.push({
      axis,
      label: AXIS_LABEL.get(axis) ?? axis,
      value_to_codes,
      values_present,
    });
  }
  // Stable axis order = exact-dict order then pattern rules (HS-importance), so the
  // engine surfaces questions in a deterministic priority.
  axes.sort((a, b) => (AXIS_ORDER.get(a.axis) ?? 999) - (AXIS_ORDER.get(b.axis) ?? 999));

  // Unclassified VARYING tokens: untyped tokens present on some-but-not-all leaves.
  const unclassified_varying: string[] = [];
  for (const [k, codes] of untypedTokenLeaves) {
    if (codes.size < leafCount) unclassified_varying.push(k);
  }
  unclassified_varying.sort();

  // ---- classification -----------------------------------------------------
  let classification: DerivedSubheading['classification'];
  if (hasResidual) {
    classification = 'residual_default';
  } else if (axes.length === 0) {
    classification = 'untypable';
  } else if (
    axes.length === 1 &&
    axes[0]!.values_present.length === leafCount &&
    Object.values(axes[0]!.value_to_codes).every((codes) => codes.length === 1)
  ) {
    classification = 'single_axis_resolved';
  } else {
    classification = 'askable_no_residual';
  }

  return {
    subheading,
    heading,
    chapter,
    leaf_count: leafCount,
    classification,
    has_residual: hasResidual,
    residual_leaf_code: residualLeafCode,
    axes,
    unclassified_varying,
  };
}

/* ===========================================================================
 * 4) MAIN
 * =========================================================================== */

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (build-time only).');
  const client = new Client({ connectionString: url });
  await client.connect();
  let derived: DerivedSubheading[];
  try {
    const { rows } = await client.query<LeafRow>(`
      SELECT tl.code, tl.subheading, tl.description,
             tla.form, tla.processing_state, tla.intended_use, tla.composition
      FROM tariff_lines tl
      LEFT JOIN tariff_line_attributes tla ON tla.code = tl.code
      ORDER BY tl.code
    `);

    // Group by subheading; keep only multi-leaf (>=2 tariff_lines).
    const bySub = new Map<string, LeafRow[]>();
    for (const r of rows) {
      const arr = bySub.get(r.subheading) ?? [];
      arr.push(r);
      bySub.set(r.subheading, arr);
    }
    derived = [];
    for (const [sub, leaves] of bySub) {
      if (leaves.length < 2) continue;
      derived.push(deriveSubheading(sub, leaves));
    }
    derived.sort((a, b) => a.subheading.localeCompare(b.subheading));
  } finally {
    await client.end();
  }

  // ---- coverage + stats ---------------------------------------------------
  const total = derived.length;
  const byClass: Record<string, number> = {
    residual_default: 0,
    askable_no_residual: 0,
    single_axis_resolved: 0,
    untypable: 0,
  };
  let fullyTyped = 0; // ≥1 typed axis AND no varying unclassified tokens
  let withResidual = 0;
  const axisUsage: Record<string, number> = {};
  for (const d of derived) {
    byClass[d.classification] = (byClass[d.classification] ?? 0) + 1;
    if (d.has_residual) withResidual++;
    if (d.axes.length >= 1 && d.unclassified_varying.length === 0) fullyTyped++;
    for (const ax of d.axes) axisUsage[ax.axis] = (axisUsage[ax.axis] ?? 0) + 1;
  }
  const askableCount = byClass.askable_no_residual! + byClass.single_axis_resolved!;

  // ---- hand-verify family summaries --------------------------------------
  const familyHeadings = ['0207', '0201', '0202', '0204', '0901', '5208', '3923'];
  const families: Record<string, unknown> = {};
  for (const h of familyHeadings) {
    const subs = derived.filter((d) => d.heading === h);
    families[h] = {
      multi_leaf_subheadings: subs.length,
      detail: subs.map((d) => ({
        subheading: d.subheading,
        leaves: d.leaf_count,
        classification: d.classification,
        residual_leaf_code: d.residual_leaf_code,
        axes: d.axes.map((a) => `${a.axis}{${a.values_present.join(',')}}`),
        unclassified_varying: d.unclassified_varying,
      })),
    };
  }

  // Notable untypable / ambiguous (for later adjudication): untypable subs +
  // askable subs that still carry varying unclassified tokens (partial coverage).
  const untypableList = derived
    .filter((d) => d.classification === 'untypable')
    .map((d) => ({ subheading: d.subheading, leaves: d.leaf_count, unclassified_varying: d.unclassified_varying }));
  const partialCoverage = derived
    .filter((d) => d.classification !== 'untypable' && d.classification !== 'residual_default' && d.axes.length >= 1 && d.unclassified_varying.length > 0)
    .map((d) => ({ subheading: d.subheading, leaves: d.leaf_count, axes: d.axes.map((a) => a.axis), unclassified_varying: d.unclassified_varying.slice(0, 8) }));

  const stats = {
    derived_at: new Date().toISOString().slice(0, 10),
    multi_leaf_subheadings: total,
    classification_counts: byClass,
    askable_no_residual_plus_single_axis: askableCount,
    askable_no_residual_only: byClass.askable_no_residual,
    single_axis_resolved_only: byClass.single_axis_resolved,
    residual_default_count: byClass.residual_default,
    residual_detection_coverage_pct: total > 0 ? Math.round((withResidual / total) * 1000) / 10 : 0,
    fully_typed_count: fullyTyped,
    fully_typed_pct: total > 0 ? Math.round((fullyTyped / total) * 1000) / 10 : 0,
    axis_usage: Object.fromEntries(Object.entries(axisUsage).sort((a, b) => b[1] - a[1])),
    untypable_count: untypableList.length,
    partial_coverage_count: partialCoverage.length,
    hand_verify_families: families,
    notable_untypable_sample: untypableList.slice(0, 40),
    notable_partial_coverage_sample: partialCoverage.slice(0, 40),
  };

  // ---- write artifacts ----------------------------------------------------
  const outDir = __dirname;
  const artifact = {
    schema_version: 1,
    description:
      'O7 atomic-axis typing + residual-default detection for every multi-leaf subheading (>=2 tariff_lines). For each sub: the discriminating concept-axes (un-fused from the TLA arrays + leaf descriptions), each axis = {axis,label,values_present,value_to_codes}; residual catch-all flag + code; and a classification (residual_default | askable_no_residual | single_axis_resolved | untypable). Derived build-time from tariff_lines + tariff_line_attributes (no Gemini); see DERIVATION.md. Loaded at runtime by lib/atomic-axis-table.ts. This is the structural foundation the S4 divergence engine uses to ask ONE clean question per axis and to know when NOT to ask (residual_default / untypable).',
    derived_at: stats.derived_at,
    axis_dictionary: [
      ...AXIS_DEFS.map((d) => ({ axis: d.axis, label: d.label, cols: d.cols, kind: 'exact' as const, value_ids: Object.keys(d.values) })),
      ...PATTERN_AXES.map((p) => ({ axis: p.axis, label: p.label, cols: p.cols, kind: 'pattern' as const, value_ids: [] as string[] })),
    ],
    subheadings: derived,
  };
  fs.writeFileSync(path.resolve(outDir, 'atomic-axes.json'), JSON.stringify(artifact, null, 2));
  fs.writeFileSync(path.resolve(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // ---- console report -----------------------------------------------------
  /* eslint-disable no-console */
  console.log(`O7 derivation complete. ${total} multi-leaf subheadings.`);
  console.log('classification_counts:', byClass);
  console.log(`askable_no_residual (+single_axis_resolved): ${byClass.askable_no_residual} (+${byClass.single_axis_resolved} = ${askableCount})`);
  console.log(`residual-detection coverage: ${stats.residual_detection_coverage_pct}% (${withResidual}/${total})`);
  console.log(`fully-typed (>=1 axis, no varying unclassified): ${stats.fully_typed_pct}% (${fullyTyped}/${total})`);
  console.log('axis usage:', stats.axis_usage);
  for (const h of familyHeadings) {
    console.log(`\nFamily ${h}:`, JSON.stringify(families[h], null, 2));
  }
  /* eslint-enable no-console */
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

export { deriveSubheading, isResidualDescription, lookupToken, AXIS_DEFS };
export type { DerivedSubheading, DerivedAxis, LeafRow };

/**
 * QGS — Question Generation System (Phase 4.2, M2-R1b).
 *
 * Candidate-aware, RIGHT-NUMBER clarifying-question generator. Given the LIVE
 * L3 candidate set + each candidate's tariff_line_attributes (core six axes +
 * the widened metadata discriminator columns), it:
 *
 *   1. Computes per-attribute INFORMATION GAIN under a uniform prior over
 *      candidates (sub-spec 02 §A — Shannon entropy reduction).
 *   2. GREEDILY selects a relevant NUMBER of questions in descending IG order,
 *      STOPPING when the residual candidate set is resolved (≤1 surviving leaf
 *      under the worst-case answer) OR the marginal IG drops below a threshold,
 *      with a HARD CAP and a FLOOR of 1.
 *   3. Builds each question's OPTIONS from the candidates' ACTUAL distinct
 *      differing values for that attribute (enriched with curated
 *      `question_templates.value_labels` when available), plus `other` / `none`
 *      escape hatches — so options always discriminate the real candidate set.
 *
 * The SILENT-DISCRIMINATOR guard is preserved at the wrapper boundary: when no
 * attribute discriminates the survivors (or no candidate carries a usable
 * attribute row), the generator yields NOTHING and the orchestrator falls back
 * to the L1 single-question (or LOW-confidence / unresolved) — it never
 * fabricates a question over an indistinguishable set.
 *
 * Spec references:
 *   - backend/docs/sub-specs/02-qgs-and-backtrack.md §A (IG formula + wrapper)
 *   - backend/docs/ARCHITECTURE.md §4.3 (QGS)
 *   - backend/src/classifier-v2/db/types.ts (QGS_ATTRIBUTE_KEYS, QuestionTemplate)
 *
 * NOTE: `function_` carries a trailing underscore at the TLA / DB layer (Postgres
 * reserved-word adjacency). The PUBLIC AttributeKey is `function`. This module
 * works internally in DB-column space and maps to AttributeKey only at the
 * question-building boundary (see DB_KEY_TO_ATTRIBUTE).
 */
import {
  getTariffLineAttributesForCodes,
  getQuestionTemplatesForAttribute,
  type QuestionTemplateRow,
} from '../lib/supabase-client';
import type {
  AttributeKey,
  ClarifyingQuestion,
  ClarifyingQuestionBatch,
  RetrievalCandidate,
  TriageFallbackOption,
} from '../types';

/* ---------------------------------------------------------------------------
 * Tuning constants (all overridable per-call for tests / calibration)
 * --------------------------------------------------------------------------- */

/** Maximum questions surfaced in one ASK turn. FLOOR is 1. */
export const QGS_HARD_CAP = 3;

/**
 * Marginal information-gain floor (bits). A greedily-selected question whose IG
 * over the CURRENT residual set is below this adds too little to justify asking,
 * so selection stops. 0.30 bits ≈ a split that moves ~1 candidate out of a
 * 4-way tie — anything weaker is noise, not a real discriminator.
 */
export const QGS_MARGINAL_IG_FLOOR = 0.3;

/**
 * DB-column attribute keys the QGS considers, in lexical order (the §A
 * tiebreak). These are the six CORE discriminating axes; metadata columns
 * (fabric_construction, chemical_class, predominant_element, …) are surfaced to
 * L4's sibling-diff but are NOT asked as user questions (no curated templates,
 * and they map to no public AttributeKey). Keeping QGS on the six core axes
 * keeps the answer space user-answerable and template-backed.
 */
export const QGS_DB_ATTRIBUTE_KEYS = [
  'composition',
  'form',
  'function_',
  'intended_use',
  'material',
  'processing_state',
] as const;

export type QGSDbAttributeKey = (typeof QGS_DB_ATTRIBUTE_KEYS)[number];

/** DB-column key → public AttributeKey (only `function_` differs). */
const DB_KEY_TO_ATTRIBUTE: Record<QGSDbAttributeKey, AttributeKey> = {
  composition: 'composition',
  form: 'form',
  function_: 'function',
  intended_use: 'intended_use',
  material: 'material',
  processing_state: 'processing_state',
};

/* ---------------------------------------------------------------------------
 * Errors
 * --------------------------------------------------------------------------- */

/**
 * Thrown by {@link computeInformationGain} when the candidate set is genuinely
 * indistinguishable on every shared attribute (no attribute yields IG > 0). The
 * wrapper catches this and signals "no QGS question" so the orchestrator falls
 * back cleanly (sub-spec 02 §A edge case 1).
 */
export class QGSIndistinguishableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QGSIndistinguishableError';
  }
}

/* ---------------------------------------------------------------------------
 * Pure information-gain core (sub-spec 02 §A)
 * --------------------------------------------------------------------------- */

/** Per-attribute IG result over a candidate set. */
export interface IGResult {
  selectedAttribute: QGSDbAttributeKey;
  igScore:           number;
  /** value → candidate codes that carry that value (partition of the set). */
  partition:         Map<string, string[]>;
}

/** A candidate's attribute record: DB-column key → string[] of values (core axes). */
export type CandidateAttributes = Record<string, unknown>;

/**
 * Read an attribute's value array off a (possibly loosely-typed) TLA record.
 * The DB fetcher returns the core six axes under their DB keys EXCEPT `function`
 * (it remaps `function_` → `function` for the L4 prompt). To be robust to BOTH
 * shapes, `function_` falls back to the `function` key. Non-array / missing →
 * empty (the attribute does not cover that candidate).
 */
function readAttrValues(rec: CandidateAttributes | undefined, dbKey: QGSDbAttributeKey): string[] {
  if (rec === undefined || rec === null) return [];
  let raw = rec[dbKey];
  if ((raw === undefined || raw === null) && dbKey === 'function_') {
    raw = rec['function'];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/**
 * Build the value→candidates partition for one attribute over the candidate set.
 * Returns the partition + how many candidates carry ANY value for the attribute.
 */
function partitionByAttribute(
  candidates: string[],
  attributes: Map<string, CandidateAttributes>,
  dbKey: QGSDbAttributeKey,
): { partition: Map<string, string[]>; covered: number } {
  const partition = new Map<string, string[]>();
  let covered = 0;
  for (const code of candidates) {
    const values = readAttrValues(attributes.get(code), dbKey);
    if (values.length === 0) continue;
    covered++;
    // De-dup a candidate's own repeated values so it lands in each bucket once.
    for (const v of new Set(values)) {
      const bucket = partition.get(v);
      if (bucket === undefined) partition.set(v, [code]);
      else bucket.push(code);
    }
  }
  return { partition, covered };
}

/**
 * Expected residual entropy E[H | a] for a partition over `n` candidates, under
 * a uniform prior. Each value v contributes P(a=v)·H(set|a=v) where the
 * probability mass is normalised by the number of (code, value) incidences so a
 * multi-valued candidate's mass is split, not double-counted.
 */
function expectedResidualEntropy(partition: Map<string, string[]>): number {
  let totalIncidence = 0;
  for (const [, codes] of partition) totalIncidence += codes.length;
  if (totalIncidence === 0) return 0;
  let expected = 0;
  for (const [, codes] of partition) {
    const pV = codes.length / totalIncidence;
    const hV = codes.length > 1 ? Math.log2(codes.length) : 0;
    expected += pV * hV;
  }
  return expected;
}

/**
 * Compute the single best discriminating attribute over a candidate set
 * (sub-spec 02 §A). Uniform prior; max-IG with lexical tiebreak.
 *
 * @throws QGSIndistinguishableError when no attribute yields IG > 0.
 * @throws Error on the caller-contract violation `candidates.length < 2`.
 */
export function computeInformationGain(
  candidates: string[],
  attributes: Map<string, CandidateAttributes>,
): IGResult {
  if (candidates.length < 2) {
    throw new Error('QGS contract violation: IG requires >=2 candidates');
  }
  const n = candidates.length;
  const priorEntropy = Math.log2(n);

  let bestAttr: QGSDbAttributeKey | null = null;
  let bestIG = 0;
  let bestPartition = new Map<string, string[]>();

  // Iterate in lexical order so the §A "lex-order tiebreak" is naturally the
  // FIRST max we encounter (strict > keeps the earliest on ties).
  for (const dbKey of QGS_DB_ATTRIBUTE_KEYS) {
    const { partition, covered } = partitionByAttribute(candidates, attributes, dbKey);
    if (covered < 2) continue; // attribute must be present in >=2 candidates
    if (partition.size < 2) continue; // a single value splits nothing
    const expected = expectedResidualEntropy(partition);
    const ig = priorEntropy - expected;
    if (ig > bestIG) {
      bestIG = ig;
      bestAttr = dbKey;
      bestPartition = partition;
    }
  }

  if (bestAttr === null || bestIG <= 0) {
    throw new QGSIndistinguishableError('No attribute discriminates the candidate set');
  }
  return { selectedAttribute: bestAttr, igScore: bestIG, partition: bestPartition };
}

/* ---------------------------------------------------------------------------
 * Greedy multi-question selection (RIGHT NUMBER + STOP + CAP + FLOOR)
 * --------------------------------------------------------------------------- */

/** One greedily-selected question step before option-building. */
export interface SelectedAttributeStep {
  dbKey:     QGSDbAttributeKey;
  igScore:   number;
  partition: Map<string, string[]>;
}

/**
 * Greedily select a RELEVANT NUMBER of discriminating attributes.
 *
 * Algorithm (general, no per-case logic):
 *   - Start with the full candidate set; compute IG over it; take the argmax
 *     attribute as Q1 (FLOOR 1 — always emit at least one when the set is
 *     distinguishable at all).
 *   - Simulate the WORST-CASE answer to Q's question: the largest partition
 *     bucket (the answer that leaves the most candidates alive). That bucket is
 *     the residual set for the next round.
 *   - Recompute IG over the residual set, excluding already-asked attributes,
 *     and select the next argmax — but STOP when:
 *       * the residual set has <2 candidates (ambiguity resolved), OR
 *       * the next attribute's marginal IG < `marginalFloor` (too little gain), OR
 *       * the HARD CAP is reached, OR
 *       * no further attribute discriminates the residual set.
 *
 * The worst-case (largest-bucket) residual is the principled stopping driver:
 * if even the worst answer leaves ≤1 candidate, one question suffices; if it
 * leaves several, another question is justified.
 */
export function selectQuestionsGreedy(
  candidates: string[],
  attributes: Map<string, CandidateAttributes>,
  opts: { hardCap?: number; marginalFloor?: number } = {},
): SelectedAttributeStep[] {
  const hardCap = opts.hardCap ?? QGS_HARD_CAP;
  const marginalFloor = opts.marginalFloor ?? QGS_MARGINAL_IG_FLOOR;

  const steps: SelectedAttributeStep[] = [];
  const asked = new Set<QGSDbAttributeKey>();
  let residual = [...candidates];

  while (steps.length < hardCap && residual.length >= 2) {
    let best: IGResult | null = null;
    try {
      best = computeInformationGain(residual, attributes);
    } catch {
      // QGSIndistinguishableError on the residual set — nothing more to ask.
      break;
    }
    if (asked.has(best.selectedAttribute)) {
      // The top attribute was already asked: drop it from contention and retry
      // over the residual by masking — recompute excluding asked attributes.
      const masked = computeBestExcluding(residual, attributes, asked);
      if (masked === null) break;
      best = masked;
    }

    // FLOOR: the first question is always emitted if the set is distinguishable.
    // Subsequent questions must clear the marginal IG floor.
    if (steps.length >= 1 && best.igScore < marginalFloor) break;

    steps.push({ dbKey: best.selectedAttribute, igScore: best.igScore, partition: best.partition });
    asked.add(best.selectedAttribute);

    // Worst-case residual = the largest bucket of the selected partition.
    let largest: string[] = [];
    for (const [, codes] of best.partition) {
      if (codes.length > largest.length) largest = codes;
    }
    // Guard against a degenerate partition that does not shrink the set (would
    // loop forever). If the worst-case residual is not strictly smaller, stop.
    if (largest.length >= residual.length) break;
    residual = largest;
  }

  return steps;
}

/**
 * Best discriminating attribute over `candidates` EXCLUDING a set of already-asked
 * attributes. Returns null when none of the remaining attributes discriminates.
 */
function computeBestExcluding(
  candidates: string[],
  attributes: Map<string, CandidateAttributes>,
  exclude: ReadonlySet<QGSDbAttributeKey>,
): IGResult | null {
  if (candidates.length < 2) return null;
  const n = candidates.length;
  const priorEntropy = Math.log2(n);
  let bestAttr: QGSDbAttributeKey | null = null;
  let bestIG = 0;
  let bestPartition = new Map<string, string[]>();
  for (const dbKey of QGS_DB_ATTRIBUTE_KEYS) {
    if (exclude.has(dbKey)) continue;
    const { partition, covered } = partitionByAttribute(candidates, attributes, dbKey);
    if (covered < 2 || partition.size < 2) continue;
    const ig = priorEntropy - expectedResidualEntropy(partition);
    if (ig > bestIG) {
      bestIG = ig;
      bestAttr = dbKey;
      bestPartition = partition;
    }
  }
  if (bestAttr === null || bestIG <= 0) return null;
  return { selectedAttribute: bestAttr, igScore: bestIG, partition: bestPartition };
}

/* ---------------------------------------------------------------------------
 * Option generation
 * --------------------------------------------------------------------------- */

/** Slug a free-text value into a stable snake_case option id (^[a-z][a-z0-9_]*$). */
export function slugifyValue(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug.length === 0) return 'opt';
  // Ensure it starts with a letter (the id regex requires a leading [a-z]).
  return /^[a-z]/.test(slug) ? slug : `v_${slug}`;
}

/** Max distinct candidate-derived options before we collapse the tail into `other`. */
const MAX_VALUE_OPTIONS = 4;

/**
 * Build the option list for one selected attribute.
 *
 * Options come from the candidates' ACTUAL DISTINGUISHING values for the
 * attribute. A value whose partition bucket covers EVERY candidate (a "universal"
 * value, e.g. "raw" present on all coffee leaves) discriminates nothing, so it is
 * DROPPED whenever ≥2 non-universal (genuinely-splitting) values remain — keeping
 * the option list to real discriminators, not noise shared by the whole set. When
 * fewer than 2 splitting values exist, universals are kept as a degenerate
 * fallback (the call-site `realOptionCount < 2` guard then decides whether the
 * question is usable at all).
 *
 * Values are ordered by descending partition size (most-common value first) then
 * lexically. Each value's label is the curated
 * `question_templates.value_labels[value]` when available, else the value
 * verbatim (title-cased). `other` / `none` escape hatches are always appended so
 * a user whose product matches no listed value (or none) can still answer — this
 * is what lets the SILENT-DISCRIMINATOR guard surface honestly downstream
 * (an `other`/`none` answer narrows nothing and the pipeline degrades to LOW
 * confidence rather than guessing).
 *
 * @param candidateCount number of candidates in the partitioned set (used to
 *   detect universal values). When omitted, the count is inferred as the max
 *   bucket size — a safe lower bound.
 */
export function buildOptions(
  partition: Map<string, string[]>,
  templateLabels: Record<string, string>,
  candidateCount?: number,
): TriageFallbackOption[] {
  const entries = [...partition.entries()];
  // Distinct values ordered by partition size desc, then lexically asc.
  const values = entries.sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  // Determine the candidate-set size to detect universal (all-covering) values.
  const n = candidateCount ?? values.reduce((m, [, codes]) => Math.max(m, codes.length), 0);
  // A value is "splitting" iff it does NOT cover the entire candidate set.
  const splitting = values.filter(([, codes]) => codes.length < n);
  // Use only splitting values when ≥2 remain; otherwise fall back to all values.
  const usable = splitting.length >= 2 ? splitting : values;

  const options: TriageFallbackOption[] = [];
  const usedIds = new Set<string>();

  const pushOption = (value: string, label: string): void => {
    let id = slugifyValue(value);
    // De-dup ids deterministically (two raw values can slug to the same token).
    if (usedIds.has(id)) {
      let i = 2;
      while (usedIds.has(`${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    usedIds.add(id);
    options.push({ id, label });
  };

  const head = usable.slice(0, MAX_VALUE_OPTIONS);
  for (const [value] of head) {
    const label = templateLabels[value] ?? titleCase(value);
    pushOption(value, label);
  }

  // If we truncated distinct values, fold the tail into a single `other`.
  const truncated = usable.length > MAX_VALUE_OPTIONS;
  if (truncated) {
    options.push({ id: 'other', label: 'Other — none of the above (please describe)' });
  } else {
    options.push({ id: 'other', label: 'Other / not listed (please describe)' });
  }
  options.push({ id: 'none', label: 'None / not applicable' });

  return options;
}

/** Title-case a snake/space value for a human-readable default label. */
function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------------------------------------------------------------------------
 * Template lookup
 * --------------------------------------------------------------------------- */

/**
 * Pick the most-relevant question_templates row for an attribute given the
 * candidate chapters. Preference order:
 *   1. A template whose chapter_scope overlaps the candidate chapters.
 *   2. A general template (chapter_scope === null/empty).
 *   3. The first row (lowest id) as a last resort.
 * Returns null when there is no row for the attribute at all.
 */
export function pickTemplate(
  rows: QuestionTemplateRow[],
  candidateChapters: ReadonlySet<string>,
): QuestionTemplateRow | null {
  if (rows.length === 0) return null;
  const scoped = rows.find(
    (r) => Array.isArray(r.chapter_scope)
      && r.chapter_scope.some((ch) => candidateChapters.has(ch)),
  );
  if (scoped) return scoped;
  const general = rows.find((r) => r.chapter_scope === null || (Array.isArray(r.chapter_scope) && r.chapter_scope.length === 0));
  if (general) return general;
  // Lowest-id deterministic fallback.
  return [...rows].sort((a, b) => a.id - b.id)[0] ?? null;
}

/* ---------------------------------------------------------------------------
 * Public wrapper (async; fetches TLA + templates; returns the batch)
 * --------------------------------------------------------------------------- */

/** Dependency-injection seam (tests pass doubles; prod uses the supabase client). */
export interface QGSDeps {
  fetchTLA: (codes: string[]) => Promise<Record<string, unknown>>;
  fetchTemplates: (attribute: string) => Promise<QuestionTemplateRow[]>;
}

const defaultDeps: QGSDeps = {
  fetchTLA: getTariffLineAttributesForCodes,
  fetchTemplates: getQuestionTemplatesForAttribute,
};

export interface SelectQGSBatchArgs {
  candidates:        RetrievalCandidate[];
  /** Override the hard cap (default {@link QGS_HARD_CAP}). */
  hardCap?:          number;
  /** Override the marginal IG floor (default {@link QGS_MARGINAL_IG_FLOOR}). */
  marginalFloor?:    number;
  /** Injectable deps (tests). */
  deps?:             Partial<QGSDeps>;
}

/**
 * Generate a candidate-aware clarifying-question BATCH for the live L3 set.
 *
 * Returns `null` when QGS yields nothing — the orchestrator MUST fall back to the
 * L1 single-question (or LOW-confidence). `null` is returned when:
 *   - fewer than 2 candidates survive having a usable TLA row (can't ask), OR
 *   - the surviving set is genuinely indistinguishable on every core attribute
 *     (SILENT-DISCRIMINATOR guard — no guessing), OR
 *   - greedy selection produced zero questions.
 *
 * Never throws on the indistinguishable path — that is a normal "no question"
 * outcome, not an error.
 */
export async function selectQGSBatch(
  args: SelectQGSBatchArgs,
): Promise<ClarifyingQuestionBatch | null> {
  const deps: QGSDeps = { ...defaultDeps, ...(args.deps ?? {}) };
  const allCodes = args.candidates.map((c) => c.code);
  if (allCodes.length < 2) return null;

  // 1) Fetch TLA rows; drop candidates with no row (sub-spec 02 §A edge case 3).
  const tlaByCode = await deps.fetchTLA(allCodes);
  const attributes = new Map<string, CandidateAttributes>();
  const survivors: string[] = [];
  for (const code of allCodes) {
    const rec = tlaByCode[code];
    if (rec !== undefined && rec !== null && typeof rec === 'object' && !Array.isArray(rec)) {
      attributes.set(code, rec as CandidateAttributes);
      survivors.push(code);
    }
  }
  if (survivors.length < 2) return null;

  // 2) Greedy multi-question selection (RIGHT NUMBER + STOP + CAP + FLOOR).
  const steps = selectQuestionsGreedy(survivors, attributes, {
    hardCap: args.hardCap,
    marginalFloor: args.marginalFloor,
  });
  if (steps.length === 0) return null;

  // Candidate chapters for template scoping.
  const candidateChapters = new Set<string>();
  for (const c of args.candidates) {
    const ch = c.parent_chain.chapter ?? (c.code.length >= 2 ? c.code.slice(0, 2) : null);
    if (ch) candidateChapters.add(ch);
  }

  // 3) Build a question per step (options from real values + curated labels).
  const questions: ClarifyingQuestion[] = [];
  for (const step of steps) {
    const publicAttr = DB_KEY_TO_ATTRIBUTE[step.dbKey];
    const templateRows = await deps.fetchTemplates(step.dbKey);
    const template = pickTemplate(templateRows, candidateChapters);
    const valueLabels: Record<string, string> = template?.value_labels ?? {};
    // Candidate count for this step = distinct codes appearing in its partition
    // (the residual set it discriminates). Drives universal-value detection.
    const stepCodes = new Set<string>();
    for (const [, codes] of step.partition) for (const c of codes) stepCodes.add(c);
    const options = buildOptions(step.partition, valueLabels, stepCodes.size);

    // A usable question needs ≥2 real discriminating options (excluding the two
    // escape hatches). If the partition collapsed to a single value, skip it.
    const realOptionCount = options.length - 2; // minus other + none
    if (realOptionCount < 2) continue;

    const questionText = template?.question_text
      ?? `Which best describes the product's ${publicAttr.replace(/_/g, ' ')}?`;

    questions.push({
      question_id: `ask_${step.dbKey}`,
      question_text: questionText,
      discriminating_attribute: publicAttr,
      options,
      info_gain_score: step.igScore,
      qgs_used: true,
    });
  }

  if (questions.length === 0) return null;

  const total = questions.reduce((s, q) => s + (q.info_gain_score ?? 0), 0);
  return { questions, total_ig_potential: total };
}

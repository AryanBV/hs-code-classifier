// backend/src/eval/divergence-smoke.ts
//
// ============================================================================
// RDC-X DIVERGENCE-ASK SMOKE HARNESS — free-tier-friendly, fail-soft.
//
// Measures the DIVERGENCE engine's ASK behaviour (Stage 3a / RDC-X) on the STAGED
// divergence gold (`gold/divergence-staging.ts`) — specifically OVER-ask (a false
// ask on a should-classify case) and UNDER-ask (a missed ask on a should-ask
// case), plus the simulated ASK→answer CHAIN that proves the asked questions are
// answerable and reach the gold leaf.
//
// This is a SMOKE harness, NOT the full eval runner: it runs a small (~18-case)
// subset SEQUENTIALLY (respecting the in-process Gemini rate-limiter), is FAIL-
// SOFT on 429/quota (records 'rate_limited' and CONTINUES — never crashes the
// whole run), and reports a per-case table + a SUMMARY via the FROZEN
// `askRateMetrics` primitive (metrics.ts), so its over/under-ask numbers are
// computed by the exact same code the master report uses.
//
// IT MAKES LIVE GEMINI CALLS — the ORCHESTRATOR runs it, NOT the build step. The
// caller supplies the levers via env, e.g.:
//
//   DIVERGENCE_ASK_ENABLED=true \
//     npx tsx --require dotenv/config src/eval/divergence-smoke.ts
//
//   # custom subset (comma-separated staged ids):
//   SMOKE_IDS=XSUB-A01,XSUB-A09,XSUB-B06 \
//   DIVERGENCE_ASK_ENABLED=true \
//     npx tsx --require dotenv/config src/eval/divergence-smoke.ts
//
// REUSE, not reinvent:
//   - the staged gold corpus           → gold/divergence-staging.ts (Groups A/B/C)
//   - the v2 brain entry point          → classifier-v2 classify()
//   - the ASK→answer CHAIN              → answer-simulator.ts runAnswerSimulation()
//                                         (gold-attribute-driven multi-turn, ≤3
//                                          rounds, returns final code + reached?)
//   - the over/under-ask SUMMARY        → metrics.ts askRateMetrics()
//   - 8-digit equality                  → scorer.ts normalizeHSCode()
//
// NOTE ON "pick the option whose codes include expected_code": the WIZARD-FACING
// `ClarifyingQuestion.options` carry only `{id,label}` — the per-option leaf
// `codes` are NOT exposed on the public ClassifyResult (they live INSIDE the
// divergence engine and are mapped away by `toClarifyingQuestion`). So the gold
// BRANCH is selected the canonical, tested way: `runAnswerSimulation` derives the
// gold-true `tariff_line_attributes` value for the asked axis and feeds the
// matching option — which is EXACTLY "answer onto the gold branch". When no
// offered option matches the gold value, the simulator returns 'UNANSWERABLE',
// which we surface as reached='unreachable' (no infinite loop).
// ============================================================================

import {
  divergenceStagingGroupA,
  divergenceStagingGroupB,
  divergenceStagingGroupC,
} from './gold/divergence-staging';
import type { EvalTestCase } from './types';
import { classify } from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import { runAnswerSimulation, type AnswerRecoveryResult } from './answer-simulator';
import { askRateMetrics, type AskRateCase, type AskTrigger, type RateCI } from './metrics';
import { normalizeHSCode } from './scorer';

/* ===========================================================================
 * Staged corpus index + default subset resolution
 * =========================================================================== */

/** Every staged case, A → B → C, indexed by id for fast SMOKE_IDS resolution. */
const ALL_STAGED: EvalTestCase[] = [
  ...divergenceStagingGroupA,
  ...divergenceStagingGroupB,
  ...divergenceStagingGroupC,
];
const STAGED_BY_ID = new Map<string, EvalTestCase>(ALL_STAGED.map((c) => [c.id, c]));

/**
 * The free-tier-friendly DEFAULT subset (~18 cases), per the brief:
 *   - Group A should-ASK:        A01 frozen chicken, A09 green coffee, A03 fresh
 *                                chicken, A10 cotton saree fabric, A12 plastic bag,
 *                                A04 frozen beef
 *   - Group B over-ask guards:   B06 bolt, B20 t-shirt, B18 basmati, B19 cement,
 *                                B14 battery charger, B17 gold jewellery
 *   - Group C sample:            the first 6 `classify`-labeled C cases.
 * Resolved against the live file so a renamed id is caught (not silently missing).
 */
const DEFAULT_GROUP_A_IDS = ['XSUB-A01', 'XSUB-A09', 'XSUB-A03', 'XSUB-A10', 'XSUB-A12', 'XSUB-A04'];
const DEFAULT_GROUP_B_IDS = ['XSUB-B06', 'XSUB-B20', 'XSUB-B18', 'XSUB-B19', 'XSUB-B14', 'XSUB-B17'];

/** First N `classify`-labeled Group C cases (the realistic cross-chapter sample). */
function firstClassifyGroupC(n: number): EvalTestCase[] {
  return divergenceStagingGroupC.filter((c) => c.expected_routing === 'classify').slice(0, n);
}

/** A note emitted when a requested default id is missing (nearest-sibling fallback). */
interface SubsetResolution {
  cases: EvalTestCase[];
  notes: string[];
}

/**
 * Resolve a requested id to a real case; on a miss, fall back to the NEAREST
 * sibling in the same group (same 5-char prefix, e.g. "XSUB-A") that is not
 * already chosen, and record a note. Returns null only when no sibling exists.
 */
function resolveOrNearest(
  id: string,
  chosen: Set<string>,
  notes: string[],
): EvalTestCase | null {
  const exact = STAGED_BY_ID.get(id);
  if (exact !== undefined) return exact;
  const prefix = id.slice(0, 6); // "XSUB-A" / "XSUB-B" / "XSUB-C"
  const sibling = ALL_STAGED.find((c) => c.id.startsWith(prefix) && !chosen.has(c.id));
  if (sibling === undefined) {
    notes.push(`requested id ${id} not found and no sibling under ${prefix}* available — SKIPPED`);
    return null;
  }
  notes.push(`requested id ${id} not found — substituted nearest sibling ${sibling.id} (${sibling.query})`);
  return sibling;
}

/** Build the run subset: SMOKE_IDS override (comma-separated) OR the default ~18. */
function resolveSubset(): SubsetResolution {
  const notes: string[] = [];
  const chosen = new Set<string>();
  const cases: EvalTestCase[] = [];

  const push = (tc: EvalTestCase | null): void => {
    if (tc === null || chosen.has(tc.id)) return;
    chosen.add(tc.id);
    cases.push(tc);
  };

  const raw = process.env.SMOKE_IDS;
  if (raw !== undefined && raw.trim().length > 0) {
    const ids = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const id of ids) push(resolveOrNearest(id, chosen, notes));
    if (cases.length === 0) {
      notes.push('SMOKE_IDS resolved to ZERO cases — falling back to the default subset.');
    } else {
      return { cases, notes };
    }
  }

  // Default subset.
  for (const id of DEFAULT_GROUP_A_IDS) push(resolveOrNearest(id, chosen, notes));
  for (const id of DEFAULT_GROUP_B_IDS) push(resolveOrNearest(id, chosen, notes));
  for (const tc of firstClassifyGroupC(6)) push(tc);
  return { cases, notes };
}

/* ===========================================================================
 * Per-case execution
 * =========================================================================== */

/** How the system actually routed a ClassifyResult. */
type ActualRouting = 'ask' | 'classify' | 'refuse' | 'rate_limited' | 'error';

/** Whether the simulated ASK→answer chain reached the gold leaf. */
type Reached = 'reached' | 'wrong_code' | 'unreachable' | 'still_asking' | 'rate_limited' | 'n/a';

interface CaseResult {
  tc: EvalTestCase;
  actualRouting: ActualRouting;
  /** The lever that fired the question (for the askRateMetrics slice). */
  askTrigger?: AskTrigger;
  /** The axis the system asked about (question.discriminating_attribute). */
  askedAxis?: string;
  /** The asked question's option labels (+ ids) — surfaced for inspection. */
  askedOptions?: Array<{ id: string; label: string }>;
  overAsk: boolean;
  underAsk: boolean;
  /** Chain-sim final code (when the chain ran and classified). */
  finalCode?: string;
  finalCodeCorrect?: boolean;
  reached: Reached;
  chainRounds?: number;
  errorMessage?: string;
}

/**
 * Detect a free-tier RATE-LIMIT / quota signal in either a thrown error message
 * OR a returned `system_error.message` (persistent 429 surfaces as a system_error
 * ClassifyResult after the client's own backoff is exhausted — see classify()
 * §7). Conservative: only the unambiguous quota/429 tokens count.
 */
function isRateLimitSignal(text: string | undefined | null): boolean {
  if (text === undefined || text === null) return false;
  return /\b429\b|resource_exhausted|resource has been exhausted|quota|rate[\s-]?limit|too many requests/i.test(
    text,
  );
}

/** Normalize a question's trigger to the AskTrigger vocabulary (default 'triage'). */
function triggerOf(result: ClassifyResult): AskTrigger {
  const t = result.question?.trigger;
  return t === 'sibling' || t === 'cross_subheading' || t === 'divergence' ? t : 'triage';
}

/** Extract the asked options ({id,label}) from an ASK result, for inspection. */
function optionsOf(result: ClassifyResult): Array<{ id: string; label: string }> {
  return (result.question?.options ?? []).map((o) => ({ id: o.id, label: o.label }));
}

/**
 * Run ONE case: classify, map routing, flag over/under-ask, and (when it asked AND
 * carries a gold code) run the gold-attribute-driven ASK→answer CHAIN. FAIL-SOFT:
 * any thrown error is caught; a 429/quota signal is recorded as 'rate_limited' and
 * the run CONTINUES.
 */
async function runCase(tc: EvalTestCase): Promise<CaseResult> {
  const base: CaseResult = {
    tc,
    actualRouting: 'error',
    overAsk: false,
    underAsk: false,
    reached: 'n/a',
  };

  let result: ClassifyResult;
  try {
    result = await classify(tc.query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isRateLimitSignal(msg)) {
      return { ...base, actualRouting: 'rate_limited', errorMessage: msg };
    }
    return { ...base, actualRouting: 'error', errorMessage: msg };
  }

  // A persistent transport/quota failure comes back as a system_error result.
  if (result.system_error !== undefined) {
    const msg = result.system_error.message;
    if (isRateLimitSignal(msg)) {
      return { ...base, actualRouting: 'rate_limited', errorMessage: msg };
    }
    return { ...base, actualRouting: 'error', errorMessage: `system_error[${result.system_error.stage}]: ${msg}` };
  }

  // Map decision → actual_routing.
  let actualRouting: ActualRouting;
  if (result.decision === 'ASK') actualRouting = 'ask';
  else if (result.decision === 'CLASSIFY') actualRouting = 'classify';
  else actualRouting = 'refuse';

  const overAsk = tc.expected_routing === 'classify' && actualRouting === 'ask';
  const underAsk = tc.expected_routing === 'ask' && actualRouting === 'classify';

  const out: CaseResult = { ...base, actualRouting, overAsk, underAsk };

  if (actualRouting === 'ask') {
    out.askTrigger = triggerOf(result);
    out.askedAxis = result.question?.discriminating_attribute;
    out.askedOptions = optionsOf(result);

    // CHAIN simulation — only when the case asked AND has a gold code. Reuse the
    // canonical gold-attribute-driven recovery (≤3 rounds, no infinite loop).
    if (tc.expected_code !== undefined && tc.expected_code.length > 0) {
      try {
        const rec: AnswerRecoveryResult = await runAnswerSimulation(tc.query, result, tc.expected_code);
        out.chainRounds = rec.rounds_attempted;
        if (rec.final_decision === 'UNANSWERABLE') {
          // No offered option matched the gold value (e.g. user's branch absent / 'other').
          out.reached = 'unreachable';
        } else if (rec.final_decision === 'CLASSIFY') {
          out.finalCode = rec.final_code_if_classify;
          const correct =
            rec.final_code_if_classify !== undefined &&
            normalizeHSCode(rec.final_code_if_classify) === normalizeHSCode(tc.expected_code);
          out.finalCodeCorrect = correct;
          out.reached = correct ? 'reached' : 'wrong_code';
        } else if (rec.final_decision === 'ASK') {
          out.reached = 'still_asking'; // hit the round cap without resolving
        } else {
          out.reached = 'wrong_code'; // REFUSE after answering = did not reach gold
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        out.reached = isRateLimitSignal(msg) ? 'rate_limited' : 'unreachable';
        out.errorMessage = msg;
      }
    }
  }

  return out;
}

/* ===========================================================================
 * Reporting
 * =========================================================================== */

const fmtPct = (r: RateCI): string => `${(r.rate * 100).toFixed(1)}% (${r.k}/${r.n})`;

/** Pad/truncate a cell to a fixed width for the monospaced per-case table. */
function cell(s: string, w: number): string {
  const v = s.length > w ? s.slice(0, w - 1) + '…' : s;
  return v.padEnd(w);
}

function printCaseTable(results: CaseResult[]): void {
  console.log('\n================================ PER-CASE TABLE ================================');
  const header =
    cell('id', 11) +
    cell('query', 26) +
    cell('exp', 9) +
    cell('act', 11) +
    cell('axis', 14) +
    cell('flag', 10) +
    cell('final → gold', 24) +
    'reached';
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const flag = r.overAsk ? 'OVER-ASK' : r.underAsk ? 'UNDER-ASK' : '-';
    const codePair =
      r.actualRouting === 'classify'
        ? `(direct) ${r.tc.expected_code ?? '?'}`
        : r.finalCode !== undefined
          ? `${r.finalCode} → ${r.tc.expected_code ?? '?'}`
          : r.tc.expected_code !== undefined
            ? `? → ${r.tc.expected_code}`
            : '-';
    console.log(
      cell(r.tc.id, 11) +
        cell(r.tc.query, 26) +
        cell(r.tc.expected_routing, 9) +
        cell(r.actualRouting, 11) +
        cell(r.askedAxis ?? '-', 14) +
        cell(flag, 10) +
        cell(codePair, 24) +
        r.reached,
    );
  }
}

function printSummary(results: CaseResult[], subsetNotes: string[]): void {
  // Build the askRateMetrics input. EXCLUDE rate_limited/error cases from the
  // routing-rate denominators (they are infra non-results, not model routing
  // decisions) — exactly as the master runner excludes per-case errors.
  const scored = results.filter(
    (r) => r.actualRouting === 'ask' || r.actualRouting === 'classify' || r.actualRouting === 'refuse',
  );
  const askRateCases: AskRateCase[] = scored.map((r) => ({
    expectedRouting: r.tc.expected_routing,
    actualRouting: r.actualRouting,
    ...(r.askTrigger ? { askTrigger: r.askTrigger } : {}),
  }));

  const ar = askRateMetrics(askRateCases);

  console.log('\n================================== SUMMARY ====================================');
  const rl = results.filter((r) => r.actualRouting === 'rate_limited').length;
  const errc = results.filter((r) => r.actualRouting === 'error').length;
  console.log(
    `cases run: ${results.length}  |  scored (routed): ${scored.length}  |  rate_limited: ${rl}  |  errors: ${errc}`,
  );

  // OVER-ASK == ask_rate within the should_not_ask (GT-classify) slice.
  console.log(`\nover_ask_rate  (should_not_ask slice) = ${fmtPct(ar.should_not_ask.ask_rate)}`);
  for (const t of ar.should_not_ask.by_trigger) {
    console.log(`    via ${t.trigger}: ${fmtPct(t.ask_rate)}`);
  }
  // UNDER-ASK == 1 − (ask_rate within the should_ask slice). Print both views.
  const askSlice = ar.should_ask.ask_rate;
  const underAskK = askSlice.n - askSlice.k;
  console.log(
    `under_ask_rate (should_ask slice)     = ${(askSlice.n > 0 ? (underAskK / askSlice.n) * 100 : 0).toFixed(1)}% (${underAskK}/${askSlice.n})   [asker recall = ${fmtPct(askSlice)}]`,
  );
  for (const t of ar.should_ask.by_trigger) {
    console.log(`    asked via ${t.trigger}: ${fmtPct(t.ask_rate)}`);
  }
  if (ar.should_reject.ask_rate.n > 0) {
    console.log(`should_reject ask_rate                = ${fmtPct(ar.should_reject.ask_rate)}`);
  }
  console.log(`overall ask volume                    = ${fmtPct(ar.overall.ask_rate)}`);

  // OVER-ASK list (the catastrophic mode the smoke exists to catch).
  const overAsks = results.filter((r) => r.overAsk);
  console.log(`\nOVER-ASKs: ${overAsks.length}`);
  for (const r of overAsks) {
    console.log(
      `  - ${r.tc.id} "${r.tc.query}" asked axis=${r.askedAxis ?? '?'} via ${r.askTrigger ?? '?'} ` +
        `[options: ${(r.askedOptions ?? []).map((o) => o.label).join(' / ')}]`,
    );
  }

  // UNDER-ASKs (a should-ask case the system classified instead).
  const underAsks = results.filter((r) => r.underAsk);
  console.log(`\nUNDER-ASKs: ${underAsks.length}`);
  for (const r of underAsks) {
    console.log(`  - ${r.tc.id} "${r.tc.query}" classified (no question) — gold wanted an ASK`);
  }

  // Correct final codes across the simulated chains (should-ask cases that reached gold).
  const reachedGold = results.filter((r) => r.reached === 'reached');
  const chainRan = results.filter((r) => r.actualRouting === 'ask' && r.tc.expected_code !== undefined);
  console.log(`\ncorrect final codes (chain reached gold): ${reachedGold.length}/${chainRan.length} asked-with-gold cases`);
  for (const r of chainRan) {
    console.log(
      `  - ${r.tc.id} "${r.tc.query}": ${r.reached}` +
        (r.finalCode !== undefined ? ` (final ${r.finalCode} vs gold ${r.tc.expected_code})` : '') +
        (r.chainRounds !== undefined ? ` [${r.chainRounds} round(s)]` : ''),
    );
  }

  // Spelled-out coffee + chicken chain traces (the canonical RDC-X exemplars).
  console.log('\n--- COFFEE / CHICKEN chain traces ---');
  const traceIds = ['XSUB-A01', 'XSUB-A03', 'XSUB-A09'];
  for (const id of traceIds) {
    const r = results.find((x) => x.tc.id === id);
    if (r === undefined) {
      console.log(`  ${id}: (not in this subset)`);
      continue;
    }
    if (r.actualRouting !== 'ask') {
      console.log(
        `  ${id} "${r.tc.query}": routed ${r.actualRouting} (expected ask) — ${r.underAsk ? 'UNDER-ASK' : 'no question'}`,
      );
      continue;
    }
    console.log(
      `  ${id} "${r.tc.query}": ASK on axis "${r.askedAxis}" via ${r.askTrigger}\n` +
        `      options: ${(r.askedOptions ?? []).map((o) => `${o.label}[${o.id}]`).join(' | ')}\n` +
        `      gold answer → ${r.reached}` +
        (r.finalCode !== undefined ? ` (reached ${r.finalCode}, gold ${r.tc.expected_code})` : ` (gold ${r.tc.expected_code})`),
    );
  }

  // One-line VERDICT heuristic.
  const overN = ar.should_not_ask.ask_rate.n;
  const overK = ar.should_not_ask.ask_rate.k;
  console.log(
    `\nVERDICT: over_ask=${overK}/${overN}, under_ask=${underAskK}/${askSlice.n}` +
      (rl > 0 ? ` (NOTE: ${rl} case(s) rate_limited — numbers are partial)` : ''),
  );

  if (subsetNotes.length > 0) {
    console.log('\nsubset notes:');
    for (const n of subsetNotes) console.log(`  - ${n}`);
  }
}

/* ===========================================================================
 * main
 * =========================================================================== */

async function main(): Promise<void> {
  const divergenceOn = process.env.DIVERGENCE_ASK_ENABLED === 'true';
  const { cases, notes } = resolveSubset();

  console.log('============================================================');
  console.log('RDC-X DIVERGENCE-ASK SMOKE HARNESS');
  console.log('============================================================');
  console.log(`DIVERGENCE_ASK_ENABLED = ${divergenceOn ? 'true (engine ON)' : 'false/unset (engine OFF — expect legacy no-ask behaviour)'}`);
  console.log(`SIBLING_ASK_ENABLED=${process.env.SIBLING_ASK_ENABLED ?? '(unset)'}  CROSS_SUBHEADING_ASK_ENABLED=${process.env.CROSS_SUBHEADING_ASK_ENABLED ?? '(unset)'}  CALIBRATED_CLASSIFY_ENABLED=${process.env.CALIBRATED_CLASSIFY_ENABLED ?? '(unset)'}`);
  console.log(`subset: ${cases.length} cases (${process.env.SMOKE_IDS ? 'SMOKE_IDS override' : 'default ~18'})`);
  console.log(`ids: ${cases.map((c) => c.id).join(', ')}`);

  const results: CaseResult[] = [];
  let i = 0;
  for (const tc of cases) {
    i++;
    const t0 = Date.now();
    // SEQUENTIAL on purpose: respect the in-process Gemini rate-limiter + free-tier
    // RPM/RPD caps. One classification = several Flash calls.
    const r = await runCase(tc);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const flag = r.overAsk ? ' [OVER-ASK]' : r.underAsk ? ' [UNDER-ASK]' : '';
    const extra =
      r.actualRouting === 'rate_limited'
        ? ' (RATE-LIMITED — continuing)'
        : r.actualRouting === 'error'
          ? ` (ERROR: ${r.errorMessage ?? '?'})`
          : r.actualRouting === 'ask'
            ? ` axis=${r.askedAxis ?? '?'} via ${r.askTrigger ?? '?'}; chain=${r.reached}`
            : '';
    console.log(
      `[${i}/${cases.length}] ${tc.id} "${tc.query}" exp=${tc.expected_routing} -> ${r.actualRouting}${flag}${extra}  (${dt}s)`,
    );
    results.push(r);
  }

  printCaseTable(results);
  printSummary(results, notes);
}

main().catch((err) => {
  // A truly unexpected top-level failure (NOT a per-case error — those are caught
  // inside runCase). Print and exit non-zero so the orchestrator notices.
  console.error('\nFATAL: divergence-smoke harness crashed:', err);
  process.exitCode = 1;
});

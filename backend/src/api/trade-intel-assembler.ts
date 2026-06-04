// backend/src/api/trade-intel-assembler.ts
//
// The trade-intelligence assembler: given a final 8-digit code (+ its chapter),
// query the Phase-1 trade-intel tables and assemble the additive
// `TradeIntelligence` DTO the frontend renders (EXPERIENCE-DESIGN §4.4 /
// TRADE-INTELLIGENCE-PLAN §5). NO Gemini. Read-only. Best-effort.
//
// THREE LOAD-BEARING BEHAVIOURS (each is documented inline at its site):
//   1. FRESHNESS = SHOW-WITH-ADVISORY (not hide). A datum older than its scheme's
//      freshness_budget_days is STILL SHOWN, with its asOn date and a per-scheme
//      `staleAdvisory` ("verify the current rate on CBIC/DGFT"). Hiding a
//      verified-current value behind a "verify only" placeholder is worse UX than
//      showing it dated with an advisory — the user loses the actual number that
//      is, in fact, correct (every 2nd-Schedule duty row is dated 2022-05-21, so
//      the strict-hide rule hid ALL of them). The separate honesty guards below
//      are NOT staleness and are unaffected:
//        - export-duty mappable=false → still WITHHOLDS the bare rate, shows the
//          verbatim condition + `verify` (a misattribution guard, not staleness);
//        - null status → grey "not specified", never Free;
//        - a control status with no condition → conditionMissing.
//      (The `TradeVerifyState` shape is retained for genuinely volatile schemes
//      should one ever need a true hide; Phase-1 never emits it for staleness.)
//   2. EXCLUSIVITY — Ch.61/62/63 → RoSCTL ONLY, never RoDTEP. Even if a stray
//      RoDTEP row exists for an apparel code, it is suppressed here.
//   3. FAIL-SAFE — any query throw / missing data yields a null-or-sparse
//      `TradeIntelligence` (or null). It NEVER throws, so it can never break or
//      delay a classification (the caller fire-and-forgets / swallows).
//
// EXPORT-POLICY BASELINE (the original show-with-advisory case, now the rule for
// every scheme): export policy is the anchor datum (the 2022 DGFT ITC(HS)
// snapshot on tariff_lines). It was always SHOWN with its asOn + a "verify
// current on DGFT" advisory when stale, never hidden — hiding a control status
// would have caused the very under-statement failure this feature prevents. As of
// this change every scheme (duty / incentive) follows that same show-with-advisory
// rule. This matches TRADE-INTELLIGENCE-PLAN §0 rule 2 and EXPERIENCE-DESIGN §4.1.

import type { ClassifyResult } from '../classifier-v2/types';
import {
  createTradeIntelQueries,
  type TradeIntelQueries,
  type ExportDutyRow,
  type RosctlRow,
  type RodtepRow,
  type UqcRow,
  type FreshnessBudgets,
  type ExportDutySource,
} from './trade-intel-queries';
import {
  normalizePolicyStatus,
  POLICY_SEVERITY,
  POLICY_PLAIN,
  DGFT_ITCHS_SCHEDULE_URL,
  TRADE_INTEL_DISCLAIMER,
  EXPORT_POLICY_STALE_ADVISORY,
  EXPORT_DUTY_STALE_ADVISORY,
  ROSCTL_STALE_ADVISORY,
  RODTEP_STALE_ADVISORY,
  ROSCTL_CHAPTERS,
  DEFAULT_FRESHNESS_BUDGET_DAYS,
  type ExportPolicyStatus,
  type PolicySeverity,
} from './trade-intel-constants';

/* ---------------------------------------------------------------------------
 * The TradeIntelligence DTO (additive; consumed by EXPERIENCE-DESIGN §4.4)
 *
 * Every leaf that carries a value/status also carries `asOn` + `sourceUrl` +
 * `indicative: true`. Shapes are sparse-friendly (each sub-block may be null).
 * --------------------------------------------------------------------------- */

/** Export-policy block — the anchor. NEVER hidden when stale (baseline exception). */
export interface TradeExportPolicy {
  /** The DGFT enum word kept verbatim, or null when not specified. */
  status:            ExportPolicyStatus | null;
  /** The one fixed per-status plain sentence (category definition, never paraphrase). */
  statusPlain:       string;
  /** danger=Prohibited, warning=Restricted/STE, notice=Free, grey=null. */
  severity:          PolicySeverity;
  /** The verbatim policy_condition (NEVER paraphrased), or null when absent. */
  conditionVerbatim: string | null;
  /** TRUE when status is Restricted/Prohibited/STE but no condition text is held. */
  conditionMissing:  boolean;
  /** YYYY-MM-DD snapshot date, or null. */
  asOn:              string | null;
  sourceUrl:         string;
  /**
   * TRUE when the snapshot is past its freshness budget. Per the baseline
   * exception the status is still SHOWN (with `staleAdvisory`), never hidden.
   */
  stale:             boolean;
  /** The "verify current on DGFT" advisory, present only when `stale`. */
  staleAdvisory:     string | null;
  indicative:        true;
}

/** Export duty (2nd Schedule). No row → NIL default dated to the export-duty source. */
export interface TradeExportDuty {
  isNil:             boolean;
  /** Verbatim rate text (e.g. "30%" / "Rs. 2500 per tonne"), or null for NIL. */
  rateText:          string | null;
  /** Verbatim condition/exemption note, or null. */
  conditionVerbatim: string | null;
  /**
   * FALSE when the 2nd-Schedule entry is not a clean 8-digit map. When false we
   * do NOT surface a bare rate — `verify` is set and the verbatim condition rides
   * instead, so the UI shows "see source", never a misattributed number.
   */
  mappable:          boolean;
  /**
   * TRUE only for the mappable=false honesty guard (route the user to the source
   * instead of a misattributed number). Staleness no longer sets this — a stale
   * value is now SHOWN with `stale`/`staleAdvisory`, not withheld.
   */
  verify:            boolean;
  /** TRUE when the snapshot is past its freshness budget. The value is still SHOWN. */
  stale:             boolean;
  /** The "verify current on CBIC" advisory, present only when `stale`. */
  staleAdvisory:     string | null;
  asOn:              string | null;
  sourceUrl:         string | null;
  indicative:        true;
}

/** RoSCTL / RoDTEP incentive (mutually exclusive). Rate + cap ALWAYS travel together. */
export interface TradeIncentive {
  kind:          'rosctl' | 'rodtep';
  /** The rebate/rate percent as a number (e.g. 6.05). */
  ratePct:       number;
  /** Verbatim per-unit value cap (e.g. "Rs. 1.4 per kg"), or null. */
  cap:           string | null;
  /** The UQC the cap is denominated in (e.g. "KGS"), or null. */
  capUnit:       string | null;
  /** TRUE when the snapshot is past its freshness budget. The value is still SHOWN. */
  stale:         boolean;
  /** The "verify current on DGFT" advisory, present only when `stale`. */
  staleAdvisory: string | null;
  asOn:          string;
  sourceUrl:     string;
  indicative:    true;
}

/** Unit Quantity Code. */
export interface TradeUqc {
  code:  string;
  label: string | null;
}

/**
 * A datum withheld for being stale-past-budget (NOT the export-policy baseline,
 * which is never withheld). Carries only the source link + asOn so the UI shows
 * "verify on DGFT/CBIC" instead of a stale value. (Reserved shape; emitted in
 * place of a value block when the strict freshness rule fires.)
 */
export interface TradeVerifyState {
  verifyOnly: true;
  asOn:       string | null;
  sourceUrl:  string | null;
  indicative: true;
}

/** Phase-1 advisory flag (SCOMET/QCO/AD-CVD). Reserved shape, empty in Phase 1. */
export interface TradeFlag {
  type:                'scomet' | 'qco' | 'adcvd';
  message:             string;
  sourceUrl:           string;
  versionDate:         string | null;
  absenceNotClearance: true;
}

export interface TradeIntelligence {
  /** Always present (the anchor). */
  exportPolicy: TradeExportPolicy;
  /** Export duty, or a verify-state when stale, or null when no source is held. */
  exportDuty:   TradeExportDuty | TradeVerifyState | null;
  /** The applicable incentive (exactly one, or null), or a verify-state when stale. */
  incentive:    TradeIncentive | TradeVerifyState | null;
  /** UQC, or null. */
  uqc:          TradeUqc | null;
  /** Phase-1: empty. Shape reserved for SCOMET/QCO/AD-CVD flags. */
  flags:        TradeFlag[];
  /** The §6 three-line indicative-not-official disclaimer (rides every block). */
  disclaimer:   string;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

/** Coerce a pg NUMERIC-as-string to a finite number, or null. */
function toNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Resolve the freshness budget for a scheme: registry value, else hard default. */
function budgetFor(scheme: string, budgets: FreshnessBudgets): number {
  const fromRegistry = budgets[scheme];
  if (typeof fromRegistry === 'number' && Number.isFinite(fromRegistry) && fromRegistry > 0) {
    return fromRegistry;
  }
  return DEFAULT_FRESHNESS_BUDGET_DAYS[scheme] ?? 180;
}

/** A datum is stale when its age exceeds its budget. age null → never stale (no date to judge). */
function isStale(ageDays: number | null | undefined, budgetDays: number): boolean {
  if (ageDays === null || ageDays === undefined) return false;
  return ageDays > budgetDays;
}

/**
 * Whole-day age of a YYYY-MM-DD snapshot vs today (UTC), or null when the date is
 * null/unparseable. The rate getters compute `age_days` in Postgres; the
 * export-duty SOURCE row (used to date the NIL default) does not carry an age, so
 * we derive it here in UTC to stay timezone-stable and mirror the SQL semantics.
 */
function ageDaysFromAsOn(asOn: string | null): number | null {
  if (asOn === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOn)) return null;
  const then = Date.parse(`${asOn}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.floor((now - then) / 86_400_000);
}

/* ---------------------------------------------------------------------------
 * Per-scheme builders
 * --------------------------------------------------------------------------- */

/**
 * Build the export-policy block. NEVER withheld for staleness (baseline
 * exception): when stale we SHOW the status + asOn + a verify advisory.
 *
 * conditionMissing = TRUE only when the status is a control (Restricted /
 * Prohibited / STE) AND no condition text is held — silence reads as "we do not
 * know", never as "no condition" (PLAN §1 step 3). For Free/null, a missing
 * condition is normal and conditionMissing stays false.
 */
function buildExportPolicy(
  rawStatus: string | null,
  conditionVerbatim: string | null,
  asOn: string | null,
  ageDays: number | null,
  budgets: FreshnessBudgets,
): TradeExportPolicy {
  const status = normalizePolicyStatus(rawStatus);
  const severity: PolicySeverity = status === null ? 'grey' : POLICY_SEVERITY[status];
  const statusPlain = POLICY_PLAIN[status ?? 'null'];

  const isControl = status === 'Restricted' || status === 'Prohibited' || status === 'STE';
  const condition = conditionVerbatim !== null && conditionVerbatim.trim().length > 0
    ? conditionVerbatim
    : null;
  const conditionMissing = isControl && condition === null;

  const stale = isStale(ageDays, budgetFor('export_policy', budgets));

  return {
    status,
    statusPlain,
    severity,
    conditionVerbatim: condition,
    conditionMissing,
    asOn,
    // Export policy has no per-line source row; it is the DGFT ITC(HS) Schedule.
    sourceUrl: DGFT_ITCHS_SCHEDULE_URL,
    stale,
    staleAdvisory: stale ? EXPORT_POLICY_STALE_ADVISORY : null,
    indicative: true,
  };
}

/**
 * Build the export-duty block. SHOW-WITH-ADVISORY for staleness.
 *   - No row → NIL default (Customs Tariff Note-4), dated to the export-duty
 *     SOURCE registry entry (NOT undated): "NIL — no export duty" still carries
 *     as_on + sourceUrl so a duty appearing between scrapes is the tracked risk.
 *     When no export-duty source is registered either, returns null (nothing to show).
 *   - mappable=false → never surface a bare rate; set `verify` and carry the
 *     verbatim condition instead. (A misattribution guard, NOT staleness.)
 *   - stale → still SHOW the value, with `stale: true` + a "verify on CBIC"
 *     advisory. The number is never hidden for age alone.
 */
function buildExportDuty(
  row: ExportDutyRow | null,
  budgets: FreshnessBudgets,
  dutySource: { asOn: string | null; sourceUrl: string | null },
): TradeExportDuty | TradeVerifyState | null {
  if (row === null) {
    // No row at all: NIL default IF we have a registered export-duty source to
    // date it to; otherwise null (we will not assert NIL with no source). Per
    // Customs-Tariff 2nd-Schedule Note 4, any line not listed there carries NIL
    // export duty — but we still DATE it to the source snapshot so a duty that
    // appears between scrapes is the tracked risk (SHOW-WITH-ADVISORY, not hide).
    if (dutySource.sourceUrl === null) return null;
    const nilStale = isStale(ageDaysFromAsOn(dutySource.asOn), budgetFor('export_duty', budgets));
    return {
      isNil:             true,
      rateText:          null,
      conditionVerbatim: null,
      mappable:          true,
      verify:            false,
      stale:             nilStale,
      staleAdvisory:     nilStale ? EXPORT_DUTY_STALE_ADVISORY : null,
      asOn:              dutySource.asOn,
      sourceUrl:         dutySource.sourceUrl,
      indicative:        true,
    };
  }

  // Staleness is shown, not hidden: compute it and attach the advisory below.
  const stale = isStale(row.age_days, budgetFor('export_duty', budgets));
  const staleAdvisory = stale ? EXPORT_DUTY_STALE_ADVISORY : null;

  // mappable=false → never a bare rate; verify + verbatim condition only. This is
  // a misattribution honesty guard (unchanged), independent of staleness — when a
  // mappable=false row is ALSO stale, the advisory still rides so the date is honest.
  if (!row.mappable) {
    return {
      isNil:             false,
      rateText:          null,
      conditionVerbatim: row.condition_text,
      mappable:          false,
      verify:            true,
      stale,
      staleAdvisory,
      asOn:              row.as_on,
      sourceUrl:         row.source_url,
      indicative:        true,
    };
  }

  return {
    isNil:             row.is_nil,
    rateText:          row.is_nil ? null : row.rate_text,
    conditionVerbatim: row.condition_text,
    mappable:          true,
    verify:            false,
    stale,
    staleAdvisory,
    asOn:              row.as_on,
    sourceUrl:         row.source_url,
    indicative:        true,
  };
}

/** Build a RoSCTL incentive from a row (or null). Stale → SHOWN with an advisory. */
function buildRosctl(
  row: RosctlRow | null,
  budgets: FreshnessBudgets,
): TradeIncentive | TradeVerifyState | null {
  if (row === null) return null;
  const ratePct = toNum(row.rebate_pct);
  if (ratePct === null) return null;
  const stale = isStale(row.age_days, budgetFor('rosctl', budgets));
  return {
    kind:          'rosctl',
    ratePct,
    cap:           row.cap_text,
    capUnit:       row.cap_unit,
    stale,
    staleAdvisory: stale ? ROSCTL_STALE_ADVISORY : null,
    asOn:          row.as_on,
    sourceUrl:     row.source_url,
    indicative:    true,
  };
}

/** Build a RoDTEP incentive from a row (or null). Stale → SHOWN with an advisory. */
function buildRodtep(
  row: RodtepRow | null,
  budgets: FreshnessBudgets,
): TradeIncentive | TradeVerifyState | null {
  if (row === null) return null;
  const ratePct = toNum(row.rate_pct);
  if (ratePct === null) return null;
  const stale = isStale(row.age_days, budgetFor('rodtep', budgets));
  return {
    kind:          'rodtep',
    ratePct,
    cap:           row.cap_text,
    capUnit:       row.cap_unit,
    stale,
    staleAdvisory: stale ? RODTEP_STALE_ADVISORY : null,
    asOn:          row.as_on,
    sourceUrl:     row.source_url,
    indicative:    true,
  };
}

/** Build the UQC block (no freshness gate — UQC is a stable identifier). */
function buildUqc(row: UqcRow | null): TradeUqc | null {
  if (row === null) return null;
  return { code: row.uqc_code, label: row.uqc_label };
}

/* ---------------------------------------------------------------------------
 * assembleTradeIntelligence
 * --------------------------------------------------------------------------- */

/**
 * Assemble the additive `TradeIntelligence` DTO for a final 8-digit code.
 *
 * FAIL-SAFE CONTRACT: this NEVER throws. On any DB error or total absence of
 * data it returns `null`. A partial failure (some schemes resolve, others throw)
 * still returns a populated-as-far-as-possible block. The caller can therefore
 * fire-and-forget it on the classify hot path without risking the classification.
 *
 * @param code    The final 8-digit tariff code ("NNNN.NN.NN").
 * @param chapter The 2-digit chapter (drives RoSCTL/RoDTEP exclusivity).
 * @param queries Injectable DB seam (defaults to the live-Postgres impl).
 */
export async function assembleTradeIntelligence(
  code: string,
  chapter: string,
  queries: TradeIntelQueries = createTradeIntelQueries(),
): Promise<TradeIntelligence | null> {
  try {
    // Each query is independently best-effort: a single scheme's failure resolves
    // to null/empty rather than rejecting the whole assembly.
    const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[trade-intel] scheme query failed (non-fatal): ${msg}`);
        return fallback;
      }
    };

    const isApparel = ROSCTL_CHAPTERS.has(chapter);

    const [
      policyRow,
      dutyRow,
      rosctlRow,
      // EXCLUSIVITY: on Ch.61/62/63 we do NOT even query RoDTEP — RoSCTL replaces
      // it. Off those chapters we do NOT query RoSCTL (it is structurally apparel-
      // only). This guarantees exactly one incentive family is ever considered.
      rodtepRow,
      uqcRow,
      budgets,
      dutySource,
    ] = await Promise.all([
      safe(queries.getPolicy(code), null),
      safe(queries.getExportDuty(code), null),
      isApparel ? safe(queries.getRosctl(code), null) : Promise.resolve(null),
      isApparel ? Promise.resolve(null) : safe(queries.getRodtep(code), null),
      safe(queries.getUqc(code), null),
      safe(queries.getFreshnessBudgets(), {} as FreshnessBudgets),
      safe(queries.getExportDutySource(), { asOn: null, sourceUrl: null } as ExportDutySource),
    ]);

    const exportPolicy = buildExportPolicy(
      policyRow?.export_policy ?? null,
      policyRow?.policy_condition ?? null,
      policyRow?.policy_as_on ?? null,
      policyRow?.age_days ?? null,
      budgets,
    );

    // Export-duty NIL default needs a registered export-duty source to date it to.
    // `dutySource` is the most-recent `trade_intel_sources` row for scheme=
    // 'export_duty' (as_on 2022-05-21 + the India-Code 2nd-Schedule URL). Threading
    // it lets the ~12,374 lines with NO export_duty_rates row show "NIL · as on
    // 2022-05-21 · verify on CBIC" instead of no duty datum at all. When a duty row
    // exists, ITS own as_on + source_url win (dutySource is used only for the NIL
    // default). When neither a row NOR a registered source exists, NIL is not
    // asserted (buildExportDuty returns null).
    const exportDuty = buildExportDuty(dutyRow, budgets, dutySource);

    // EXCLUSIVITY enforced structurally above; here we simply pick the one built.
    const incentive = isApparel ? buildRosctl(rosctlRow, budgets) : buildRodtep(rodtepRow, budgets);

    const uqc = buildUqc(uqcRow);

    return {
      exportPolicy,
      exportDuty,
      incentive,
      uqc,
      flags: [],
      disclaimer: TRADE_INTEL_DISCLAIMER,
    };
  } catch (err: unknown) {
    // Total fail-safe: never break or delay a classification.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[trade-intel] assembleTradeIntelligence failed (non-fatal): ${msg}`);
    return null;
  }
}

/**
 * Convenience: derive the chapter from an 8-digit code and assemble. Returns null
 * on a malformed code (fail-safe). Used by the API adapter wiring.
 */
export async function assembleTradeIntelligenceForCode(
  code: string,
  queries?: TradeIntelQueries,
): Promise<TradeIntelligence | null> {
  // Chapter = LEFT(code, 2). A valid ITC-HS leaf is "NNNN.NN.NN"; a 6-digit
  // subheading is "NNNN.NN". Either way the first two chars are the chapter.
  const chapter = code.slice(0, 2);
  if (!/^\d{2}$/.test(chapter)) return null;
  return assembleTradeIntelligence(code, chapter, queries);
}

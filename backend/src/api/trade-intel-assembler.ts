// backend/src/api/trade-intel-assembler.ts
//
// The trade-intelligence assembler: given a final 8-digit code (+ its chapter),
// query the Phase-1 trade-intel tables and assemble the additive
// `TradeIntelligence` DTO the frontend renders (EXPERIENCE-DESIGN §4.4 /
// TRADE-INTELLIGENCE-PLAN §5). NO Gemini. Read-only. Best-effort.
//
// THREE LOAD-BEARING BEHAVIOURS (each is documented inline at its site):
//   1. FRESHNESS — a datum older than its scheme's freshness_budget_days is
//      returned as a `verifyOnly` state (sourceUrl only, value withheld) rather
//      than shown stale. (EXCEPTION: the export-policy baseline — see below.)
//   2. EXCLUSIVITY — Ch.61/62/63 → RoSCTL ONLY, never RoDTEP. Even if a stray
//      RoDTEP row exists for an apparel code, it is suppressed here.
//   3. FAIL-SAFE — any query throw / missing data yields a null-or-sparse
//      `TradeIntelligence` (or null). It NEVER throws, so it can never break or
//      delay a classification (the caller fire-and-forgets / swallows).
//
// EXPORT-POLICY BASELINE EXCEPTION (intentional, do not "fix"):
//   Export policy is the only policy data we hold (the 2022 DGFT ITC(HS)
//   snapshot on tariff_lines). If we applied the normal "hide if stale" rule to
//   it, an aged snapshot would HIDE the single most important datum — the very
//   under-statement-of-a-control failure this feature exists to prevent. So for
//   export policy ONLY we SHOW the status WITH its asOn date and attach a
//   "verify current on DGFT" advisory (`stale: true`) instead of withholding it.
//   Every other scheme (duty / incentive / uqc) follows the strict hide-if-stale
//   rule via `verifyOnly`. This matches TRADE-INTELLIGENCE-PLAN §0 rule 2's
//   stated exception and EXPERIENCE-DESIGN §4.1.

import type { ClassifyResult } from '../classifier-v2/types';
import {
  createTradeIntelQueries,
  type TradeIntelQueries,
  type ExportDutyRow,
  type RosctlRow,
  type RodtepRow,
  type UqcRow,
  type FreshnessBudgets,
} from './trade-intel-queries';
import {
  normalizePolicyStatus,
  POLICY_SEVERITY,
  POLICY_PLAIN,
  DGFT_ITCHS_SCHEDULE_URL,
  TRADE_INTEL_DISCLAIMER,
  EXPORT_POLICY_STALE_ADVISORY,
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
  /** TRUE when not mappable OR stale — the UI must route the user to the source. */
  verify:            boolean;
  asOn:              string | null;
  sourceUrl:         string | null;
  indicative:        true;
}

/** RoSCTL / RoDTEP incentive (mutually exclusive). Rate + cap ALWAYS travel together. */
export interface TradeIncentive {
  kind:       'rosctl' | 'rodtep';
  /** The rebate/rate percent as a number (e.g. 6.05). */
  ratePct:    number;
  /** Verbatim per-unit value cap (e.g. "Rs. 1.4 per kg"), or null. */
  cap:        string | null;
  /** The UQC the cap is denominated in (e.g. "KGS"), or null. */
  capUnit:    string | null;
  asOn:       string;
  sourceUrl:  string;
  indicative: true;
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
 * Build the export-duty block.
 *   - No row → NIL default (Customs Tariff Note-4), dated to the export-duty
 *     SOURCE registry entry (NOT undated): "NIL — no export duty" still carries
 *     as_on + sourceUrl so a duty appearing between scrapes is the tracked risk.
 *     When no export-duty source is registered either, returns null (nothing to show).
 *   - mappable=false → never surface a bare rate; set `verify` and carry the
 *     verbatim condition instead.
 *   - stale → return a verify-state (value withheld).
 */
function buildExportDuty(
  row: ExportDutyRow | null,
  budgets: FreshnessBudgets,
  dutySource: { asOn: string | null; sourceUrl: string | null },
): TradeExportDuty | TradeVerifyState | null {
  if (row === null) {
    // No row at all: NIL default IF we have a registered export-duty source to
    // date it to; otherwise null (we will not assert NIL with no source).
    if (dutySource.sourceUrl === null) return null;
    return {
      isNil:             true,
      rateText:          null,
      conditionVerbatim: null,
      mappable:          true,
      verify:            false,
      asOn:              dutySource.asOn,
      sourceUrl:         dutySource.sourceUrl,
      indicative:        true,
    };
  }

  // Stale → strict hide-if-stale: a verify-state, value withheld.
  if (isStale(row.age_days, budgetFor('export_duty', budgets))) {
    return { verifyOnly: true, asOn: row.as_on, sourceUrl: row.source_url, indicative: true };
  }

  // mappable=false → never a bare rate; verify + verbatim condition only.
  if (!row.mappable) {
    return {
      isNil:             false,
      rateText:          null,
      conditionVerbatim: row.condition_text,
      mappable:          false,
      verify:            true,
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
    asOn:              row.as_on,
    sourceUrl:         row.source_url,
    indicative:        true,
  };
}

/** Build a RoSCTL incentive from a row (or null), applying freshness. */
function buildRosctl(
  row: RosctlRow | null,
  budgets: FreshnessBudgets,
): TradeIncentive | TradeVerifyState | null {
  if (row === null) return null;
  if (isStale(row.age_days, budgetFor('rosctl', budgets))) {
    return { verifyOnly: true, asOn: row.as_on, sourceUrl: row.source_url, indicative: true };
  }
  const ratePct = toNum(row.rebate_pct);
  if (ratePct === null) return null;
  return {
    kind:       'rosctl',
    ratePct,
    cap:        row.cap_text,
    capUnit:    row.cap_unit,
    asOn:       row.as_on,
    sourceUrl:  row.source_url,
    indicative: true,
  };
}

/** Build a RoDTEP incentive from a row (or null), applying freshness. */
function buildRodtep(
  row: RodtepRow | null,
  budgets: FreshnessBudgets,
): TradeIncentive | TradeVerifyState | null {
  if (row === null) return null;
  if (isStale(row.age_days, budgetFor('rodtep', budgets))) {
    return { verifyOnly: true, asOn: row.as_on, sourceUrl: row.source_url, indicative: true };
  }
  const ratePct = toNum(row.rate_pct);
  if (ratePct === null) return null;
  return {
    kind:       'rodtep',
    ratePct,
    cap:        row.cap_text,
    capUnit:    row.cap_unit,
    asOn:       row.as_on,
    sourceUrl:  row.source_url,
    indicative: true,
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
    ] = await Promise.all([
      safe(queries.getPolicy(code), null),
      safe(queries.getExportDuty(code), null),
      isApparel ? safe(queries.getRosctl(code), null) : Promise.resolve(null),
      isApparel ? Promise.resolve(null) : safe(queries.getRodtep(code), null),
      safe(queries.getUqc(code), null),
      safe(queries.getFreshnessBudgets(), {} as FreshnessBudgets),
    ]);

    const exportPolicy = buildExportPolicy(
      policyRow?.export_policy ?? null,
      policyRow?.policy_condition ?? null,
      policyRow?.policy_as_on ?? null,
      policyRow?.age_days ?? null,
      budgets,
    );

    // Export-duty NIL default needs a registered export-duty source to date it to.
    // We read that scheme's most-recent source via the budgets/source registry —
    // but the budgets map carries no asOn/url, so when there is NO export-duty row
    // and NO duty source, buildExportDuty returns null (we do not assert NIL with
    // no source). When a duty row exists, its own as_on + source_url are used.
    const exportDuty = buildExportDuty(dutyRow, budgets, { asOn: null, sourceUrl: null });

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

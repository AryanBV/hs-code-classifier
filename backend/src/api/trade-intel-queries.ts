// backend/src/api/trade-intel-queries.ts
//
// Read-only DB fetchers for the Phase-1 trade-intelligence tables. NO Gemini, NO
// writes. These hydrate the assembler (trade-intel-assembler.ts) by the final
// 8-digit code (+ its chapter for chapter-gated schemes).
//
// DESIGN NOTES:
//   - All `date` columns are returned as `::text` (YYYY-MM-DD) and freshness is a
//     SQL-computed `age_days = current_date - as_on`. Doing the date math in
//     Postgres keeps it timezone-stable (node-pg parses `date` into a local-tz
//     Date object, which can shift the day across the UTC boundary). This mirrors
//     `getUsageSummary`'s `::text` discipline in supabase-client.ts.
//   - Numeric columns (`rate_pct`, `cap_value`, ...) arrive from pg as `string`
//     (NUMERIC) — callers coerce as needed; we pass them through as-is here.
//   - Each table is queried independently so one missing/failed scheme never
//     blocks the others. The assembler runs them in parallel and tolerates
//     partial results.
//   - The injectable `TradeIntelQueries` seam lets the assembler unit-test
//     against in-memory rows with NO live Postgres (mirrors the v2-adapter deps
//     pattern).

import { getQueryRunner, type QueryRunner } from '../classifier-v2/lib/supabase-client';

/* ---------------------------------------------------------------------------
 * Raw row shapes (the subset of columns the assembler consumes)
 * --------------------------------------------------------------------------- */

/** Export-policy snapshot read from `tariff_lines` (the existing policy data). */
export interface PolicyRow {
  export_policy:    string | null;
  policy_condition: string | null;
  /** YYYY-MM-DD snapshot date, or null when not yet recorded. */
  policy_as_on:     string | null;
  /** current_date - policy_as_on (days); null when policy_as_on is null. */
  age_days:         number | null;
}

/** One `export_duty_rates` row (the most-recent snapshot for the code). */
export interface ExportDutyRow {
  is_nil:           boolean;
  rate_text:        string | null;
  rate_pct:         string | null;
  rate_specific:    string | null;
  condition_text:   string | null;
  mappable:         boolean;
  as_on:            string;
  age_days:         number;
  source_url:       string;
  notification_ref: string | null;
}

/** One `rosctl_rates` row. */
export interface RosctlRow {
  rebate_pct:       string;
  cap_text:         string | null;
  cap_value:        string | null;
  cap_unit:         string | null;
  condition_text:   string | null;
  mappable:         boolean;
  as_on:            string;
  age_days:         number;
  source_url:       string;
  notification_ref: string | null;
}

/** One `rodtep_rates` row. */
export interface RodtepRow {
  rate_pct:         string;
  cap_text:         string | null;
  cap_value:        string | null;
  cap_unit:         string | null;
  appendix:         string;
  condition_text:   string | null;
  mappable:         boolean;
  as_on:            string;
  age_days:         number;
  source_url:       string;
  notification_ref: string | null;
}

/** One `uqc` row. */
export interface UqcRow {
  uqc_code:         string;
  uqc_label:        string | null;
  as_on:            string;
  age_days:         number;
  source_url:       string;
  notification_ref: string | null;
}

/** Per-scheme freshness budget read from `trade_intel_sources`. */
export type FreshnessBudgets = Record<string, number>;

/**
 * The registered export-duty SOURCE (most-recent `trade_intel_sources` row for
 * scheme='export_duty'). Used to DATE the NIL default for the ~12,374 lines that
 * carry no `export_duty_rates` row: a non-dutiable good shows "NIL · as on <date>
 * · verify on CBIC" rather than no duty datum at all. `asOn`/`sourceUrl` are null
 * only when no export-duty source row is registered (then we do not assert NIL).
 */
export interface ExportDutySource {
  asOn:      string | null;
  sourceUrl: string | null;
}

/* ---------------------------------------------------------------------------
 * The injectable query interface the assembler depends on.
 * --------------------------------------------------------------------------- */

export interface TradeIntelQueries {
  getPolicy(code: string):       Promise<PolicyRow | null>;
  getExportDuty(code: string):   Promise<ExportDutyRow | null>;
  getRosctl(code: string):       Promise<RosctlRow | null>;
  getRodtep(code: string):       Promise<RodtepRow | null>;
  getUqc(code: string):          Promise<UqcRow | null>;
  /** Map of scheme → freshness_budget_days from trade_intel_sources (most recent per scheme). */
  getFreshnessBudgets():         Promise<FreshnessBudgets>;
  /** The most-recent registered export-duty source (asOn + sourceUrl) to date the NIL default. */
  getExportDutySource():         Promise<ExportDutySource>;
}

/* ---------------------------------------------------------------------------
 * The default (live-Postgres) implementation.
 *
 * Each getter selects the MOST RECENT snapshot for the code (ORDER BY as_on DESC
 * LIMIT 1) so that when several dated rows exist we always reflect the latest.
 * --------------------------------------------------------------------------- */

export function createTradeIntelQueries(runner: QueryRunner = getQueryRunner()): TradeIntelQueries {
  return {
    async getPolicy(code: string): Promise<PolicyRow | null> {
      const sql = `
        SELECT
          export_policy,
          policy_condition,
          policy_as_on::text                       AS policy_as_on,
          (current_date - policy_as_on)            AS age_days
        FROM tariff_lines
        WHERE code = $1
        LIMIT 1
      `;
      const res = await runner.query<PolicyRow>(sql, [code]);
      return res.rows[0] ?? null;
    },

    async getExportDuty(code: string): Promise<ExportDutyRow | null> {
      const sql = `
        SELECT
          is_nil,
          rate_text,
          rate_pct::text                AS rate_pct,
          rate_specific,
          condition_text,
          mappable,
          as_on::text                   AS as_on,
          (current_date - as_on)        AS age_days,
          source_url,
          notification_ref
        FROM export_duty_rates
        WHERE code = $1
        ORDER BY as_on DESC
        LIMIT 1
      `;
      const res = await runner.query<ExportDutyRow>(sql, [code]);
      return res.rows[0] ?? null;
    },

    async getRosctl(code: string): Promise<RosctlRow | null> {
      const sql = `
        SELECT
          rebate_pct::text              AS rebate_pct,
          cap_text,
          cap_value::text               AS cap_value,
          cap_unit,
          condition_text,
          mappable,
          as_on::text                   AS as_on,
          (current_date - as_on)        AS age_days,
          source_url,
          notification_ref
        FROM rosctl_rates
        WHERE code = $1
        ORDER BY as_on DESC
        LIMIT 1
      `;
      const res = await runner.query<RosctlRow>(sql, [code]);
      return res.rows[0] ?? null;
    },

    async getRodtep(code: string): Promise<RodtepRow | null> {
      const sql = `
        SELECT
          rate_pct::text                AS rate_pct,
          cap_text,
          cap_value::text               AS cap_value,
          cap_unit,
          appendix,
          condition_text,
          mappable,
          as_on::text                   AS as_on,
          (current_date - as_on)        AS age_days,
          source_url,
          notification_ref
        FROM rodtep_rates
        WHERE code = $1
        ORDER BY as_on DESC
        LIMIT 1
      `;
      const res = await runner.query<RodtepRow>(sql, [code]);
      return res.rows[0] ?? null;
    },

    async getUqc(code: string): Promise<UqcRow | null> {
      const sql = `
        SELECT
          uqc_code,
          uqc_label,
          as_on::text                   AS as_on,
          (current_date - as_on)        AS age_days,
          source_url,
          notification_ref
        FROM uqc
        WHERE code = $1
        ORDER BY as_on DESC
        LIMIT 1
      `;
      const res = await runner.query<UqcRow>(sql, [code]);
      return res.rows[0] ?? null;
    },

    async getFreshnessBudgets(): Promise<FreshnessBudgets> {
      // Most-recent row per scheme wins (DISTINCT ON ... ORDER BY as_on DESC).
      const sql = `
        SELECT DISTINCT ON (scheme)
          scheme,
          freshness_budget_days
        FROM trade_intel_sources
        ORDER BY scheme, as_on DESC
      `;
      const res = await runner.query<{ scheme: string; freshness_budget_days: number }>(sql);
      const out: FreshnessBudgets = {};
      for (const r of res.rows) {
        out[r.scheme] = Number(r.freshness_budget_days);
      }
      return out;
    },

    async getExportDutySource(): Promise<ExportDutySource> {
      // Most-recent registered export-duty source row. `as_on::text` keeps the
      // date timezone-stable (same discipline as the rate getters above). When no
      // row is registered we return nulls and the assembler will NOT assert NIL.
      const sql = `
        SELECT
          as_on::text   AS as_on,
          source_url
        FROM trade_intel_sources
        WHERE scheme = 'export_duty'
        ORDER BY as_on DESC
        LIMIT 1
      `;
      const res = await runner.query<{ as_on: string; source_url: string }>(sql);
      const row = res.rows[0];
      return { asOn: row?.as_on ?? null, sourceUrl: row?.source_url ?? null };
    },
  };
}

/**
 * Trade-Intelligence Staleness Report (read-only).
 *
 * The re-scrape reminder the trade-intel re-audit flagged as missing. Queries
 * `trade_intel_sources` (the scheme-level system of record for freshness) plus
 * the rate tables, and lists every scheme/row that is OVERDUE FOR A RE-CHECK:
 *
 *   STALE when  current_date - last_checked  >  freshness_budget_days
 *
 * `last_checked` is the operational "when did we last verify this source against
 * the authority" date (set per ingest). `freshness_budget_days` is the per-scheme
 * re-scrape interval. This is distinct from the runtime SHOW-WITH-ADVISORY rule
 * in trade-intel-assembler.ts, which gates on the DATA snapshot age (`as_on`) to
 * decide whether to attach a "verify on CBIC/DGFT" advisory to a SHOWN value. Both
 * are reported here so the operator sees (a) what to re-scrape now and (b) which
 * shown data is already past its advisory threshold.
 *
 * READ-ONLY. NO writes. NO Gemini / LLM. Reads DATABASE_URL from backend/.env via
 * dotenv (pooled Supavisor connection) — the connection string is never printed.
 *
 * Exit codes:
 *   0 — ran successfully (whether or not anything is stale)
 *   2 — DB / connection error
 *
 * Run:
 *   cd backend && npx tsx scripts/trade-intel-staleness.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';

/* ---------------------------------------------------------------------------
 * Row shapes
 * --------------------------------------------------------------------------- */

interface SourceStaleRow {
  scheme: string;
  as_on: string;
  last_checked: string;
  freshness_budget_days: number;
  days_since_checked: number;
  overdue_by_days: number;
  source_url: string;
}

interface SchemeRow {
  scheme: string;
  as_on: string;
  last_checked: string;
  freshness_budget_days: number;
  days_since_checked: number;
  days_since_as_on: number;
  source_url: string;
}

/** Per-scheme data-table snapshot context (which rate table backs each scheme). */
interface DataAgeRow {
  scheme: string;
  table_name: string;
  rows: number;
  min_as_on: string | null;
  max_as_on: string | null;
  max_age_days: number | null;
  past_advisory: number; // rows whose age exceeds the scheme's freshness budget
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function fail(msg: string): never {
  console.error(`\n[FATAL] ${msg}`);
  process.exit(2);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const connStr = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connStr) fail('DATABASE_URL not set in env (backend/.env)');

  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  try {
    const today = (
      await pool.query<{ d: string }>(`SELECT current_date::text AS d`)
    ).rows[0]?.d ?? '(unknown)';

    console.log('\nTrade-Intelligence Staleness Report');
    console.log('='.repeat(64));
    console.log(`Report date (DB current_date): ${today}`);
    console.log('Rule: STALE when  current_date - last_checked  >  freshness_budget_days');

    /* -------- 1. Source registry — the re-scrape reminder -------------------- */
    // Every scheme's source row, with its check-age and whether it is overdue.
    const allSources = await pool.query<SchemeRow>(`
      SELECT
        scheme,
        as_on::text                         AS as_on,
        last_checked::text                  AS last_checked,
        freshness_budget_days,
        (current_date - last_checked)       AS days_since_checked,
        (current_date - as_on)              AS days_since_as_on,
        source_url
      FROM trade_intel_sources
      ORDER BY (current_date - last_checked) - freshness_budget_days DESC, scheme
    `);

    const stale = await pool.query<SourceStaleRow>(`
      SELECT
        scheme,
        as_on::text                                              AS as_on,
        last_checked::text                                       AS last_checked,
        freshness_budget_days,
        (current_date - last_checked)                            AS days_since_checked,
        (current_date - last_checked) - freshness_budget_days    AS overdue_by_days,
        source_url
      FROM trade_intel_sources
      WHERE (current_date - last_checked) > freshness_budget_days
      ORDER BY (current_date - last_checked) - freshness_budget_days DESC, scheme
    `);

    console.log('\n----- 1. SOURCE RE-SCRAPE STATUS (trade_intel_sources) -----');
    console.log(
      `  ${pad('scheme', 14)} ${pad('last_checked', 13)} ${pad('budget', 8)} ${pad('age(d)', 8)} status`,
    );
    for (const r of allSources.rows) {
      const overdue = r.days_since_checked - r.freshness_budget_days;
      const status = overdue > 0 ? `STALE — overdue by ${overdue}d` : `ok (${-overdue}d to spare)`;
      console.log(
        `  ${pad(r.scheme, 14)} ${pad(r.last_checked, 13)} ${pad(String(r.freshness_budget_days) + 'd', 8)} ${pad(String(r.days_since_checked), 8)} ${status}`,
      );
    }

    if (stale.rows.length === 0) {
      console.log('\n  >>> No sources are overdue for a re-scrape.');
    } else {
      console.log(`\n  >>> ${stale.rows.length} scheme(s) OVERDUE for re-scrape:`);
      for (const r of stale.rows) {
        console.log(
          `      - ${r.scheme}: last checked ${r.last_checked} (${r.days_since_checked}d ago), ` +
            `budget ${r.freshness_budget_days}d → overdue by ${r.overdue_by_days}d. Re-verify: ${r.source_url}`,
        );
      }
    }

    /* -------- 2. Data-snapshot age vs budget (advisory threshold) ------------ */
    // Context: how old the SHOWN data is. A row past budget is still shown at
    // runtime (show-with-advisory) but is reported here so the operator knows how
    // much data is already carrying a "verify" advisory. export_policy lives on
    // tariff_lines (policy_as_on); the others have dedicated rate tables.
    const budgets = new Map<string, number>();
    for (const r of allSources.rows) budgets.set(r.scheme, r.freshness_budget_days);
    const b = (scheme: string): number => budgets.get(scheme) ?? 180;

    const dataAges: DataAgeRow[] = [];

    const rateTables: Array<{ scheme: string; table: string }> = [
      { scheme: 'export_duty', table: 'export_duty_rates' },
      { scheme: 'rosctl', table: 'rosctl_rates' },
      { scheme: 'rodtep', table: 'rodtep_rates' },
      { scheme: 'uqc', table: 'uqc' },
    ];

    for (const { scheme, table } of rateTables) {
      const budget = b(scheme);
      const res = await pool.query<{
        rows: string;
        min_as_on: string | null;
        max_as_on: string | null;
        max_age_days: string | null;
        past_advisory: string;
      }>(
        `SELECT
           count(*)::text                                         AS rows,
           min(as_on)::text                                       AS min_as_on,
           max(as_on)::text                                       AS max_as_on,
           max(current_date - as_on)::text                        AS max_age_days,
           count(*) FILTER (WHERE (current_date - as_on) > $1)::text AS past_advisory
         FROM ${table}`,
        [budget],
      );
      const row = res.rows[0];
      dataAges.push({
        scheme,
        table_name: table,
        rows: Number(row?.rows ?? 0),
        min_as_on: row?.min_as_on ?? null,
        max_as_on: row?.max_as_on ?? null,
        max_age_days: row?.max_age_days != null ? Number(row.max_age_days) : null,
        past_advisory: Number(row?.past_advisory ?? 0),
      });
    }

    // export_policy snapshot lives on tariff_lines.policy_as_on (not a rate table).
    const policyBudget = b('export_policy');
    const policyRes = await pool.query<{
      rows: string;
      min_as_on: string | null;
      max_as_on: string | null;
      max_age_days: string | null;
      past_advisory: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE policy_as_on IS NOT NULL)::text   AS rows,
         min(policy_as_on)::text                                  AS min_as_on,
         max(policy_as_on)::text                                  AS max_as_on,
         max(current_date - policy_as_on)::text                   AS max_age_days,
         count(*) FILTER (WHERE policy_as_on IS NOT NULL
                            AND (current_date - policy_as_on) > $1)::text AS past_advisory
       FROM tariff_lines`,
      [policyBudget],
    );
    const pr = policyRes.rows[0];
    dataAges.unshift({
      scheme: 'export_policy',
      table_name: 'tariff_lines.policy_as_on',
      rows: Number(pr?.rows ?? 0),
      min_as_on: pr?.min_as_on ?? null,
      max_as_on: pr?.max_as_on ?? null,
      max_age_days: pr?.max_age_days != null ? Number(pr.max_age_days) : null,
      past_advisory: Number(pr?.past_advisory ?? 0),
    });

    console.log('\n----- 2. DATA-SNAPSHOT AGE vs BUDGET (runtime advisory context) -----');
    console.log('  (rows past budget are still SHOWN at runtime, with a verify advisory)');
    console.log(
      `  ${pad('scheme', 14)} ${pad('rows', 7)} ${pad('newest as_on', 13)} ${pad('max age', 9)} ${pad('budget', 8)} past-budget`,
    );
    for (const d of dataAges) {
      const ageStr = d.max_age_days === null ? '—' : `${d.max_age_days}d`;
      const flag =
        d.rows === 0
          ? '(no rows)'
          : d.past_advisory > 0
            ? `${d.past_advisory} past budget → advisory`
            : 'all within budget';
      console.log(
        `  ${pad(d.scheme, 14)} ${pad(String(d.rows), 7)} ${pad(d.max_as_on ?? '—', 13)} ${pad(ageStr, 9)} ${pad(b(d.scheme) + 'd', 8)} ${flag}`,
      );
    }

    /* -------- 3. Summary ---------------------------------------------------- */
    console.log('\n----- SUMMARY -----');
    console.log(`  Sources overdue for re-scrape : ${stale.rows.length} / ${allSources.rows.length}`);
    const schemesPastAdvisory = dataAges.filter((d) => d.rows > 0 && d.past_advisory > 0);
    console.log(
      `  Schemes with data past advisory threshold: ${schemesPastAdvisory.length} ` +
        `(${schemesPastAdvisory.map((d) => d.scheme).join(', ') || 'none'})`,
    );
    if (stale.rows.length > 0) {
      console.log('  ACTION: re-scrape the overdue source(s) above and re-run the Phase-1 ingest.');
    } else {
      console.log('  No re-scrape action required right now.');
    }
    console.log('');
  } catch (err: unknown) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[UNHANDLED]', err instanceof Error ? err.message : String(err));
  process.exit(2);
});

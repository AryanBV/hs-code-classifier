// backend/src/api/trade-intel-constants.ts
//
// Pre-written, authored-once content + classification tables for the
// trade-intelligence assembler. NOTHING here is paraphrased from a specific
// code's condition text — these are CATEGORY definitions (one fixed sentence per
// export-policy enum) and a fixed disclaimer, per TRADE-INTELLIGENCE-PLAN.md §1
// (the SAFE-vs-RISKY boundary) and §6 (the indicative-not-official disclaimer).
//
// HONESTY RULES THIS MODULE ENCODES (PLAN §0/§1/§2):
//   - The plain sentence is a per-STATUS category definition, identical for every
//     code of that status. It is NEVER a restatement of a specific condition.
//   - The verbatim condition text is shown elsewhere (conditionVerbatim) and is
//     NEVER paraphrased.
//   - `null` status is grey ("not specified"), NEVER rendered as Free.
//   - Severity grading follows ANSI Z535: Prohibited=danger, Restricted+STE=warning,
//     Free=notice, null=grey.

/** The canonical DGFT export-policy status enum (kept verbatim where present). */
export type ExportPolicyStatus = 'Free' | 'Restricted' | 'Prohibited' | 'STE';

/** Severity grade driving UI prominence + colour (ANSI Z535, PLAN §2). */
export type PolicySeverity = 'danger' | 'warning' | 'notice' | 'grey';

/**
 * Map a raw `tariff_lines.export_policy` string to the canonical enum.
 *
 * The DB stores DGFT enum words; we normalise case/whitespace and accept the
 * common spellings. Anything we do NOT recognise (including null/empty) maps to
 * `null` → rendered grey "not specified", NEVER silently treated as Free.
 */
export function normalizePolicyStatus(raw: string | null | undefined): ExportPolicyStatus | null {
  if (raw === null || raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v === 'free') return 'Free';
  if (v === 'restricted') return 'Restricted';
  if (v === 'prohibited') return 'Prohibited';
  // DGFT renders State Trading Enterprise as "STE" or "State Trading Enterprise".
  if (v === 'ste' || v === 'state trading enterprise' || v === 'state trading') return 'STE';
  return null;
}

/** Severity per status (PLAN §2). null → 'grey'. */
export const POLICY_SEVERITY: Record<ExportPolicyStatus, Exclude<PolicySeverity, 'grey'>> = {
  Prohibited: 'danger',
  Restricted: 'warning',
  STE:        'warning',
  Free:       'notice',
};

/**
 * The ONE fixed plain-meaning sentence per status enum (PLAN §1, step 2).
 * Authored once; identical for every code of that status — a category definition,
 * not interpretation of any specific line. The `null` key covers "not specified".
 */
export const POLICY_PLAIN: Record<ExportPolicyStatus | 'null', string> = {
  Free:       'No DGFT export licence is needed for this line.',
  Restricted: 'This line needs a DGFT authorisation before export.',
  Prohibited: 'Export of this line is prohibited under current policy.',
  STE:        'This line may be exported only through a designated State Trading Enterprise.',
  null:       'This export-policy status is not specified in our data for this line. Check the DGFT ITC(HS) schedule.',
};

/**
 * Official DGFT ITC(HS) Schedule 2 deep link — the export-policy authority.
 * Used as the export-policy sourceUrl when a per-line snapshot does not carry its
 * own (it currently does not; the data lives on tariff_lines, not a value table).
 */
export const DGFT_ITCHS_SCHEDULE_URL = 'https://www.dgft.gov.in/CP/?opt=itc-hs-export-schedule-2';

/**
 * Bovine-meat legal-sensitivity note (type 'legal_sensitivity' TradeFlag).
 * Attached by the assembler to bovine meat/offal lines (headings 0201/0202/0206/0210).
 * Verbatim authored copy — a fixed, code-independent legal caveat, NOT a paraphrase
 * of any specific code's condition text. Indian policy prohibits cow/ox/calf beef
 * export outright; only carabeef (boneless buffalo meat) may be exported under
 * APEDA/FSSAI/DGFT conditions. Indicative, not legal advice.
 */
export const BOVINE_LEGAL_NOTE_MESSAGE =
  'This product is legally sensitive to export from India, so read this before you act on the code. Beef from cows, oxen and calves cannot be exported. India prohibits the export of cow, ox and calf beef outright, so no shipment of it can be filed regardless of the code shown here. The export of bovine meat in general is restricted under Indian policy. Boneless buffalo meat (carabeef) is the main bovine meat that may be exported, and only under conditions set by APEDA, FSSAI and DGFT, including registration of the plant, a veterinary certificate that the animal was not used for breeding, health and quality certification, and any licence the current policy requires. Buffalo carcasses and bone-in cuts do not get that exemption. This note is indicative and is not legal advice. Confirm the exact status and conditions for your specific product with DGFT or a licensed customs broker before you ship. Prevyl is not your customs broker and is not liable for export decisions made on this note.';

/**
 * The §6 three-line indicative-not-official disclaimer. Rides EVERY trade-intel
 * block (proximity, FTC), verbatim from TRADE-INTELLIGENCE-PLAN.md §6. No
 * em-dashes; never the words "guaranteed/accurate/correct".
 */
export const TRADE_INTEL_DISCLAIMER =
  'Indicative classification for guidance only. This ITC(HS) code, export-policy status and any conditions are drawn from the official DGFT ITC(HS) Schedule but are not legal, tax, or customs advice, carry no legal force, and Prevyl is not your customs broker. A correct code does not by itself mean the goods are cleared for export; licences, SCOMET, BIS/quality and destination rules may still apply. Always verify against the current ITC(HS) Schedule and DGFT/CBIC notifications, or a licensed Customs House Agent, before filing a shipping bill.';

/**
 * The advisory shown alongside the export-policy status when its snapshot is
 * older than the freshness budget. The export-policy 2022 baseline is the ONE
 * datum we never hide (it is the only policy data we hold) — instead we show the
 * status WITH its asOn date AND this advisory. See the assembler's
 * EXPORT-POLICY-BASELINE EXCEPTION comment for the full rationale.
 */
export const EXPORT_POLICY_STALE_ADVISORY =
  'This status reflects our last schedule snapshot and may be out of date. Verify the current status on DGFT before relying on it.';

/**
 * Per-scheme stale advisories for the money rows. SHOW-WITH-ADVISORY policy: a
 * datum past its freshness budget is still SHOWN with its asOn date, and one of
 * these calm secondary lines is attached (the same treatment the export-policy
 * baseline already gets). The value is never hidden for staleness alone; the
 * separate honesty guards (export-duty mappable=false, NIL, missing condition)
 * are unaffected. Each advisory names the authority to re-check on.
 */
export const EXPORT_DUTY_STALE_ADVISORY =
  'This rate reflects our last Customs Tariff snapshot and may be out of date. Verify the current export duty on CBIC before relying on it.';
export const ROSCTL_STALE_ADVISORY =
  'This rebate reflects our last RoSCTL snapshot and may be out of date. Verify the current RoSCTL rate on DGFT before relying on it.';
export const RODTEP_STALE_ADVISORY =
  'This rate reflects our last RoDTEP snapshot and may be out of date. Verify the current RoDTEP rate on DGFT before relying on it.';

/** The apparel/made-up chapters where RoSCTL REPLACES RoDTEP (PLAN §3, mutual exclusivity). */
export const ROSCTL_CHAPTERS: ReadonlySet<string> = new Set(['61', '62', '63']);

/** Default freshness budgets (days) by scheme — used only if the trade_intel_sources
 *  registry has no row for the scheme. Mirrors the migration 0002 comment + PLAN §7.2. */
export const DEFAULT_FRESHNESS_BUDGET_DAYS: Record<string, number> = {
  export_policy: 90,
  export_duty:   180,
  rosctl:        180,
  rodtep:        30,
  uqc:           180,
};

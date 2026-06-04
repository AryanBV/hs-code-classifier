// backend/src/api/trade-intel-assembler.test.ts
//
// Unit tests for the trade-intelligence assembler against MOCKED DB rows (no live
// Postgres, no Gemini). Covers the three task cases plus the load-bearing
// behaviours: shape, freshness, RoSCTL/RoDTEP exclusivity, the export-policy
// baseline exception, mappable=false → verify-not-bare-rate, and fail-safe.

import { describe, it, expect } from 'vitest';
import {
  assembleTradeIntelligence,
  assembleTradeIntelligenceForCode,
  type TradeIncentive,
  type TradeExportDuty,
} from './trade-intel-assembler';
import type {
  TradeIntelQueries,
  PolicyRow,
  ExportDutyRow,
  RosctlRow,
  RodtepRow,
  UqcRow,
  FreshnessBudgets,
  ExportDutySource,
} from './trade-intel-queries';

/* ---------------------------------------------------------------------------
 * Mock-query builder. Each scheme returns a fixed row (or null). Unspecified
 * schemes default to null; budgets default to the registry-empty case so the
 * assembler falls back to DEFAULT_FRESHNESS_BUDGET_DAYS.
 * --------------------------------------------------------------------------- */
function mockQueries(over: Partial<{
  policy:      PolicyRow | null;
  duty:        ExportDutyRow | null;
  rosctl:      RosctlRow | null;
  rodtep:      RodtepRow | null;
  uqc:         UqcRow | null;
  budgets:     FreshnessBudgets;
  dutySource:  ExportDutySource;
}> = {}): TradeIntelQueries {
  return {
    getPolicy:             async () => over.policy     ?? null,
    getExportDuty:         async () => over.duty       ?? null,
    getRosctl:             async () => over.rosctl     ?? null,
    getRodtep:             async () => over.rodtep     ?? null,
    getUqc:                async () => over.uqc        ?? null,
    getFreshnessBudgets:   async () => over.budgets    ?? {},
    // Default: NO registered export-duty source (so the absence-of-source path is
    // the default and existing tests are unaffected). Tests that exercise the NIL
    // default pass an explicit dutySource.
    getExportDutySource:   async () => over.dutySource ?? { asOn: null, sourceUrl: null },
  };
}

/** The registered export-duty source, mirroring the live trade_intel_sources row. */
const DUTY_SOURCE: ExportDutySource = {
  asOn:      '2022-05-21',
  sourceUrl: 'https://upload.indiacode.nic.in/schedulefile?aid=AC_CEN_2_2_00039_197551_1554713855359&rid=791',
};

/** Today as YYYY-MM-DD (UTC) — for the "fresh NIL default" case (age 0 < budget). */
const TODAY_ISO = new Date().toISOString().slice(0, 10);

const FREE_POLICY: PolicyRow = {
  export_policy:    'Free',
  policy_condition: null,
  policy_as_on:     '2022-01-01',
  age_days:         30, // fresh under the 90d export_policy budget
};

const NIL_DUTY: ExportDutyRow = {
  is_nil:           true,
  rate_text:        null,
  rate_pct:         null,
  rate_specific:    null,
  condition_text:   null,
  mappable:         true,
  as_on:            '2026-02-01',
  age_days:         10,
  source_url:       'https://example.test/customs-tariff',
  notification_ref: null,
};

// ---------------------------------------------------------------------------
// CASE 1 — 7318.15.00: Free policy, NIL duty, no incentive (Ch.73, not apparel),
// a UQC. Chapter 73 → RoDTEP family is queried but returns null here.
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — 7318.15.00 (Free / NIL duty / UQC / no incentive)', () => {
  const uqc: UqcRow = {
    uqc_code:         'KGS',
    uqc_label:        'Kilograms',
    as_on:            '2022-01-01',
    age_days:         100,
    source_url:       'https://example.test/uqc',
    notification_ref: null,
  };

  it('assembles the full Free/NIL/UQC shape with no incentive', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00',
      '73',
      mockQueries({ policy: FREE_POLICY, duty: NIL_DUTY, uqc }),
    );
    expect(ti).not.toBeNull();
    if (ti === null) throw new Error('unreachable');

    // Export policy: Free → notice, fresh, condition not missing (Free is not a control).
    expect(ti.exportPolicy.status).toBe('Free');
    expect(ti.exportPolicy.severity).toBe('notice');
    expect(ti.exportPolicy.statusPlain).toBe('No DGFT export licence is needed for this line.');
    expect(ti.exportPolicy.conditionMissing).toBe(false);
    expect(ti.exportPolicy.stale).toBe(false);
    expect(ti.exportPolicy.staleAdvisory).toBeNull();
    expect(ti.exportPolicy.asOn).toBe('2022-01-01');
    expect(ti.exportPolicy.indicative).toBe(true);

    // Export duty: NIL, dated + sourced.
    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.isNil).toBe(true);
    expect(duty.rateText).toBeNull();
    expect(duty.verify).toBe(false);
    expect(duty.asOn).toBe('2026-02-01');
    expect(duty.indicative).toBe(true);

    // No incentive (no rosctl/rodtep rows).
    expect(ti.incentive).toBeNull();

    // UQC present.
    expect(ti.uqc).toEqual({ code: 'KGS', label: 'Kilograms' });

    // Phase-1 flags empty; disclaimer present.
    expect(ti.flags).toEqual([]);
    expect(ti.disclaimer.length).toBeGreaterThan(0);
  });

  it('every datum carries indicative:true (export policy + duty)', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, duty: NIL_DUTY }),
    );
    if (ti === null) throw new Error('unreachable');
    expect(ti.exportPolicy.indicative).toBe(true);
    expect((ti.exportDuty as TradeExportDuty).indicative).toBe(true);
  });

  it('null export_policy renders grey "not specified", never Free', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({
        policy: { export_policy: null, policy_condition: null, policy_as_on: null, age_days: null },
      }),
    );
    if (ti === null) throw new Error('unreachable');
    expect(ti.exportPolicy.status).toBeNull();
    expect(ti.exportPolicy.severity).toBe('grey');
    expect(ti.exportPolicy.statusPlain).toContain('not specified');
    // Critically NOT the Free sentence.
    expect(ti.exportPolicy.statusPlain).not.toBe('No DGFT export licence is needed for this line.');
  });

  it('no export-duty row AND no duty source → exportDuty null (does not assert NIL without a source)', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY }), // no duty row, no source (default)
    );
    if (ti === null) throw new Error('unreachable');
    expect(ti.exportDuty).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NIL-DEFAULT WIRE (FIX 1) — for the ~12,374 lines with NO export_duty_rates row,
// the registered export-duty SOURCE dates the 2nd-Schedule-Note-4 NIL default so
// non-dutiable goods show "NIL · as on 2022-05-21 · verify on CBIC", not nothing.
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — export-duty NIL default dated to the registered source (FIX 1)', () => {
  it('no duty row BUT a registered source → NIL default dated + sourced (not null, not hidden)', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, dutySource: DUTY_SOURCE }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    // The NIL default fires (it no longer returns null when a source is present).
    expect('verifyOnly' in duty).toBe(false);
    expect(duty.isNil).toBe(true);
    expect(duty.rateText).toBeNull();
    expect(duty.mappable).toBe(true);
    expect(duty.verify).toBe(false); // NIL is not the misattribution guard
    // Dated + sourced to the registered export-duty source.
    expect(duty.asOn).toBe('2022-05-21');
    expect(duty.sourceUrl).toBe(DUTY_SOURCE.sourceUrl);
    expect(duty.indicative).toBe(true);
  });

  it('the dated NIL default is past the 180d budget → stale=true with a CBIC verify advisory', async () => {
    // The registered source as_on is 2022-05-21, far past the 180d export_duty
    // budget — the NIL default is SHOWN dated, with the advisory (show-with-advisory).
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, dutySource: DUTY_SOURCE }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.isNil).toBe(true);
    expect(duty.stale).toBe(true);
    expect(duty.staleAdvisory).not.toBeNull();
    expect(duty.staleAdvisory ?? '').toMatch(/CBIC/);
  });

  it('a recent (in-budget) registered source → NIL default shown fresh (stale=false, no advisory)', async () => {
    const recent: ExportDutySource = { asOn: TODAY_ISO, sourceUrl: DUTY_SOURCE.sourceUrl };
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, dutySource: recent }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.isNil).toBe(true);
    expect(duty.stale).toBe(false);
    expect(duty.staleAdvisory).toBeNull();
    expect(duty.asOn).toBe(TODAY_ISO);
  });

  it('an ACTUAL duty row still wins over the source (its own as_on/source_url are used)', async () => {
    // A registered source is present AND a real row exists — the row's own data
    // must be used (the source dates only the NIL default, never an existing row).
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, duty: NIL_DUTY, dutySource: DUTY_SOURCE }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.asOn).toBe('2026-02-01'); // NIL_DUTY.as_on, NOT the source date
    expect(duty.sourceUrl).toBe('https://example.test/customs-tariff');
  });

  it('NIL default for a NON-apparel chapter does not change incentive routing (RoDTEP family, null here)', async () => {
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, dutySource: DUTY_SOURCE }),
    );
    if (ti === null) throw new Error('unreachable');
    expect((ti.exportDuty as TradeExportDuty).isNil).toBe(true);
    expect(ti.incentive).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CASE 2 — Ch.61 code: RoSCTL incentive present; RoDTEP MUST be null (exclusivity).
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — Ch.61 (RoSCTL present, RoDTEP excluded)', () => {
  const rosctl: RosctlRow = {
    rebate_pct:       '6.05',
    cap_text:         'Rs. 50 per piece',
    cap_value:        '50',
    cap_unit:         'PCS',
    condition_text:   null,
    mappable:         true,
    as_on:            '2024-04-01',
    age_days:         100, // fresh under the 180d rosctl budget
    source_url:       'https://example.test/rosctl',
    notification_ref: null,
  };

  // A stray RoDTEP row that must be SUPPRESSED on an apparel chapter.
  const strayRodtep: RodtepRow = {
    rate_pct:         '0.8',
    cap_text:         'Rs. 1.4 per kg',
    cap_value:        '1.4',
    cap_unit:         'KGS',
    appendix:         '4R',
    condition_text:   null,
    mappable:         true,
    as_on:            '2026-03-23',
    age_days:         5,
    source_url:       'https://example.test/rodtep',
    notification_ref: null,
  };

  it('surfaces RoSCTL as the incentive and NEVER RoDTEP on Ch.61', async () => {
    const ti = await assembleTradeIntelligence(
      '6109.10.00',
      '61',
      mockQueries({ policy: FREE_POLICY, rosctl, rodtep: strayRodtep }),
    );
    if (ti === null) throw new Error('unreachable');

    expect(ti.incentive).not.toBeNull();
    const inc = ti.incentive as TradeIncentive;
    expect(inc.kind).toBe('rosctl');
    expect(inc.ratePct).toBe(6.05);
    expect(inc.cap).toBe('Rs. 50 per piece');
    expect(inc.capUnit).toBe('PCS');
    expect(inc.asOn).toBe('2024-04-01');
    expect(inc.indicative).toBe(true);
    // Exclusivity: the incentive is rosctl, NOT rodtep — even though a rodtep row exists.
    expect(inc.kind).not.toBe('rodtep');
  });

  it('exclusivity holds for Ch.62 and Ch.63 too', async () => {
    for (const chapter of ['62', '63']) {
      const ti = await assembleTradeIntelligence(
        `${chapter}10.10.00`, chapter,
        mockQueries({ policy: FREE_POLICY, rosctl, rodtep: strayRodtep }),
      );
      if (ti === null) throw new Error('unreachable');
      expect((ti.incentive as TradeIncentive).kind).toBe('rosctl');
    }
  });
});

// ---------------------------------------------------------------------------
// CASE 3 — Ch.41 code: export_duty mappable=false → verify-not-bare-rate.
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — Ch.41 (export_duty mappable=false)', () => {
  const unmappableDuty: ExportDutyRow = {
    is_nil:           false,
    rate_text:        '60% on FOB', // a rate exists in the source but is NOT 1:1 mappable
    rate_pct:         '60',
    rate_specific:    null,
    condition_text:   'Export duty on raw and semi-finished hides, skins and leather (2nd Schedule).',
    mappable:         false,
    as_on:            '2026-02-01',
    age_days:         10,
    source_url:       'https://example.test/customs-tariff-2nd-sched',
    notification_ref: null,
  };

  it('does NOT surface a bare rate; sets verify + carries the verbatim condition', async () => {
    const ti = await assembleTradeIntelligence(
      '4101.20.00',
      '41',
      mockQueries({ policy: FREE_POLICY, duty: unmappableDuty }),
    );
    if (ti === null) throw new Error('unreachable');

    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.mappable).toBe(false);
    expect(duty.verify).toBe(true);
    // The bare rate is withheld.
    expect(duty.rateText).toBeNull();
    // The verbatim condition rides instead (never paraphrased).
    expect(duty.conditionVerbatim).toBe(
      'Export duty on raw and semi-finished hides, skins and leather (2nd Schedule).',
    );
    expect(duty.asOn).toBe('2026-02-01');
    expect(duty.sourceUrl).toBe('https://example.test/customs-tariff-2nd-sched');
  });

  it('Ch.41 is NOT apparel → RoSCTL is never queried, incentive falls to RoDTEP (null here)', async () => {
    const ti = await assembleTradeIntelligence(
      '4101.20.00', '41',
      mockQueries({ policy: FREE_POLICY, duty: unmappableDuty }),
    );
    if (ti === null) throw new Error('unreachable');
    expect(ti.incentive).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FRESHNESS = SHOW-WITH-ADVISORY (not hide). A stale duty/incentive/policy is
// STILL SHOWN with its asOn date + a `stale`/`staleAdvisory` line. Hiding a
// verified-current value (every 2nd-Schedule duty row is dated 2022-05-21, far
// past the 180d budget) is worse UX than showing it dated with an advisory. The
// separate honesty guards (mappable=false / null / conditionMissing) are NOT
// staleness and are unaffected (covered elsewhere).
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — freshness (show-with-advisory)', () => {
  it('stale export duty (age > 180) → value SHOWN with stale + advisory (not withheld)', async () => {
    const staleDuty: ExportDutyRow = { ...NIL_DUTY, is_nil: false, rate_text: '30%', rate_pct: '30', age_days: 200 };
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, duty: staleDuty }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    // The value is SHOWN, not hidden — no verify-state.
    expect('verifyOnly' in duty).toBe(false);
    expect(duty.rateText).toBe('30%');
    expect(duty.mappable).toBe(true);
    expect(duty.verify).toBe(false); // staleness does NOT set the misattribution-verify flag
    // ... but flagged stale, with the advisory + the as-on date.
    expect(duty.stale).toBe(true);
    expect(duty.staleAdvisory).not.toBeNull();
    expect((duty.staleAdvisory ?? '')).toMatch(/CBIC/);
    expect(duty.asOn).toBe(staleDuty.as_on);
    expect(duty.sourceUrl).toBe(staleDuty.source_url);
  });

  it('fresh export duty → shown with stale=false and no advisory', async () => {
    const freshDuty: ExportDutyRow = { ...NIL_DUTY, is_nil: false, rate_text: '30%', rate_pct: '30', age_days: 10 };
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, duty: freshDuty }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    expect(duty.rateText).toBe('30%');
    expect(duty.stale).toBe(false);
    expect(duty.staleAdvisory).toBeNull();
  });

  it('stale RoDTEP (age > 30) → rate SHOWN with stale + advisory (not withheld)', async () => {
    const staleRodtep: RodtepRow = {
      rate_pct: '0.8', cap_text: 'Rs. 1.4 per kg', cap_value: '1.4', cap_unit: 'KGS',
      appendix: '4R', condition_text: null, mappable: true,
      as_on: '2026-01-01', age_days: 60, source_url: 'https://example.test/rodtep', notification_ref: null,
    };
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, rodtep: staleRodtep }),
    );
    if (ti === null) throw new Error('unreachable');
    const inc = ti.incentive as TradeIncentive;
    expect('verifyOnly' in inc).toBe(false);
    expect(inc.kind).toBe('rodtep');
    expect(inc.ratePct).toBe(0.8);
    expect(inc.cap).toBe('Rs. 1.4 per kg');
    expect(inc.stale).toBe(true);
    expect(inc.staleAdvisory).not.toBeNull();
    expect((inc.staleAdvisory ?? '')).toMatch(/RoDTEP/);
  });

  it('registry budget overrides the default (rodtep budget 7 → age 10 now stale but still SHOWN)', async () => {
    const rodtep: RodtepRow = {
      rate_pct: '0.8', cap_text: null, cap_value: null, cap_unit: null,
      appendix: '4R', condition_text: null, mappable: true,
      as_on: '2026-05-25', age_days: 10, source_url: 'https://example.test/rodtep', notification_ref: null,
    };
    // With the default 30d budget age 10 would be FRESH; the registry tightens it to 7.
    const ti = await assembleTradeIntelligence(
      '7318.15.00', '73',
      mockQueries({ policy: FREE_POLICY, rodtep, budgets: { rodtep: 7 } }),
    );
    if (ti === null) throw new Error('unreachable');
    const inc = ti.incentive as TradeIncentive;
    expect('verifyOnly' in inc).toBe(false);
    expect(inc.ratePct).toBe(0.8);
    expect(inc.stale).toBe(true);
    expect(inc.staleAdvisory).not.toBeNull();
  });

  it('stale RoSCTL (age > 180) → rate SHOWN with stale + advisory (apparel chapter)', async () => {
    const staleRosctl: RosctlRow = {
      rebate_pct: '6.05', cap_text: 'Rs. 50 per piece', cap_value: '50', cap_unit: 'PCS',
      condition_text: null, mappable: true,
      as_on: '2019-03-07', age_days: 2600, source_url: 'https://example.test/rosctl', notification_ref: null,
    };
    const ti = await assembleTradeIntelligence(
      '6109.10.00', '61',
      mockQueries({ policy: FREE_POLICY, rosctl: staleRosctl }),
    );
    if (ti === null) throw new Error('unreachable');
    const inc = ti.incentive as TradeIncentive;
    expect('verifyOnly' in inc).toBe(false);
    expect(inc.kind).toBe('rosctl');
    expect(inc.ratePct).toBe(6.05);
    expect(inc.stale).toBe(true);
    expect((inc.staleAdvisory ?? '')).toMatch(/RoSCTL/);
  });

  it('stale + mappable=false export duty → bare rate STILL withheld (guard intact), advisory rides', async () => {
    const staleUnmappable: ExportDutyRow = {
      is_nil: false, rate_text: '60% on FOB', rate_pct: '60', rate_specific: null,
      condition_text: 'Export duty on raw and semi-finished hides, skins and leather (2nd Schedule).',
      mappable: false, as_on: '2022-05-21', age_days: 1475,
      source_url: 'https://example.test/customs-tariff-2nd-sched', notification_ref: null,
    };
    const ti = await assembleTradeIntelligence(
      '4101.20.10', '41',
      mockQueries({ policy: FREE_POLICY, duty: staleUnmappable }),
    );
    if (ti === null) throw new Error('unreachable');
    const duty = ti.exportDuty as TradeExportDuty;
    // mappable=false honesty guard is INDEPENDENT of staleness: bare rate withheld.
    expect(duty.mappable).toBe(false);
    expect(duty.verify).toBe(true);
    expect(duty.rateText).toBeNull();
    expect(duty.conditionVerbatim).toBe(
      'Export duty on raw and semi-finished hides, skins and leather (2nd Schedule).',
    );
    // The date is still honest: stale flagged + advisory.
    expect(duty.stale).toBe(true);
    expect(duty.staleAdvisory).not.toBeNull();
  });

  it('EXPORT-POLICY BASELINE EXCEPTION: a stale policy snapshot is SHOWN (not hidden) with an advisory', async () => {
    const stalePolicy: PolicyRow = {
      export_policy: 'Restricted',
      policy_condition: 'Export permitted subject to Policy Condition 1 of this Chapter.',
      policy_as_on: '2022-01-01',
      age_days: 999, // far past the 90d budget
    };
    const ti = await assembleTradeIntelligence(
      '1006.30.10', '10',
      mockQueries({ policy: stalePolicy }),
    );
    if (ti === null) throw new Error('unreachable');
    // The status is STILL shown (never withheld) ...
    expect(ti.exportPolicy.status).toBe('Restricted');
    expect(ti.exportPolicy.severity).toBe('warning');
    // ... but flagged stale, with the verify advisory + asOn date.
    expect(ti.exportPolicy.stale).toBe(true);
    expect(ti.exportPolicy.staleAdvisory).not.toBeNull();
    expect(ti.exportPolicy.asOn).toBe('2022-01-01');
    // The verbatim condition is preserved (never paraphrased).
    expect(ti.exportPolicy.conditionVerbatim).toBe(
      'Export permitted subject to Policy Condition 1 of this Chapter.',
    );
    expect(ti.exportPolicy.conditionMissing).toBe(false);
  });

  it('Restricted/Prohibited with NO condition → conditionMissing=true (silence reads as "we do not hold it")', async () => {
    const noCondPolicy: PolicyRow = {
      export_policy: 'Prohibited',
      policy_condition: null,
      policy_as_on: '2026-05-13',
      age_days: 5,
    };
    const ti = await assembleTradeIntelligence(
      '1701.14.90', '17',
      mockQueries({ policy: noCondPolicy }),
    );
    if (ti === null) throw new Error('unreachable');
    expect(ti.exportPolicy.status).toBe('Prohibited');
    expect(ti.exportPolicy.severity).toBe('danger');
    expect(ti.exportPolicy.conditionVerbatim).toBeNull();
    expect(ti.exportPolicy.conditionMissing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FAIL-SAFE — a throwing query never breaks the classification.
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligence — fail-safe', () => {
  it('a single scheme throwing → that scheme null, the rest still assemble', async () => {
    const q: TradeIntelQueries = {
      getPolicy:            async () => FREE_POLICY,
      getExportDuty:        async () => { throw new Error('boom duty'); },
      getRosctl:            async () => null,
      getRodtep:            async () => null,
      getUqc:               async () => null,
      getFreshnessBudgets:  async () => ({}),
      getExportDutySource:  async () => ({ asOn: null, sourceUrl: null }),
    };
    const ti = await assembleTradeIntelligence('7318.15.00', '73', q);
    expect(ti).not.toBeNull();
    if (ti === null) throw new Error('unreachable');
    // Policy still assembled; the throwing duty scheme degraded to null.
    expect(ti.exportPolicy.status).toBe('Free');
    expect(ti.exportDuty).toBeNull();
  });

  it('ALL queries throwing → still returns a (sparse) block, never throws', async () => {
    const boom = (): never => { throw new Error('boom'); };
    const q: TradeIntelQueries = {
      getPolicy:            async () => boom(),
      getExportDuty:        async () => boom(),
      getRosctl:            async () => boom(),
      getRodtep:            async () => boom(),
      getUqc:               async () => boom(),
      getFreshnessBudgets:  async () => boom(),
      getExportDutySource:  async () => boom(),
    };
    // Must not reject.
    const ti = await assembleTradeIntelligence('7318.15.00', '73', q);
    expect(ti).not.toBeNull();
    if (ti === null) throw new Error('unreachable');
    // Policy degraded to "not specified" (grey), never throwing.
    expect(ti.exportPolicy.status).toBeNull();
    expect(ti.exportPolicy.severity).toBe('grey');
    expect(ti.exportDuty).toBeNull();
    expect(ti.incentive).toBeNull();
    expect(ti.uqc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// assembleTradeIntelligenceForCode — chapter derivation + malformed-code guard.
// ---------------------------------------------------------------------------
describe('assembleTradeIntelligenceForCode', () => {
  it('derives the chapter from the leading 2 digits and routes apparel to RoSCTL', async () => {
    const rosctl: RosctlRow = {
      rebate_pct: '6.05', cap_text: null, cap_value: null, cap_unit: null,
      condition_text: null, mappable: true, as_on: '2024-04-01', age_days: 10,
      source_url: 'https://example.test/rosctl', notification_ref: null,
    };
    const ti = await assembleTradeIntelligenceForCode(
      '6201.40.00',
      mockQueries({ policy: FREE_POLICY, rosctl }),
    );
    if (ti === null) throw new Error('unreachable');
    expect((ti.incentive as TradeIncentive).kind).toBe('rosctl');
  });

  it('returns null on a malformed code (no leading 2-digit chapter)', async () => {
    const ti = await assembleTradeIntelligenceForCode('not-a-code', mockQueries({ policy: FREE_POLICY }));
    expect(ti).toBeNull();
  });
});

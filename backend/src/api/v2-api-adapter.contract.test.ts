// backend/src/api/v2-api-adapter.contract.test.ts
//
// B5 DTO FREEZE contract test. Pins the SHAPE of all three responseType variants
// (classification | question | refused) of the FLAT external ApiClassifyResponse,
// including the B5-added confidenceBand (REQUIRED) + reserved confidenceP
// (OPTIONAL), the B1c/B5 alternatives cap, and the refused branch. This is a
// focused SHAPE test (key set + types + discriminator), NOT an exhaustive
// every-value pin — it guards against an accidental rename/nest/drop that would
// break the frozen frontend contract.

import { describe, it, expect } from 'vitest';
import { mapV2Result } from './v2-api-adapter';
import type {
  HydratedChainRow,
  TariffLineChainFetcher,
  SubheadingRowFetcher,
  SubheadingChildrenFetcher,
  TradeIntelligenceFetcher,
  ApiConfidenceBand,
} from './v2-api-adapter';
import type { ClassifyResult, SelectCitation } from '../classifier-v2/types';

// No-op trade-intel fetcher: keeps the contract test DB-free and pins the EXISTING
// key set (the additive `tradeIntelligence` field is OMITTED when null, so the
// frozen contract is preserved). The non-null case is covered in the assembler
// suite + the dedicated contract case below.
const noTradeIntel: TradeIntelligenceFetcher = async () => null;
const subRows: SubheadingRowFetcher = async () => [];
const subChildren: SubheadingChildrenFetcher = async () => [];

const base = { diagnostics: { escalation_path: [], latency_ms: 1, llm_calls: 1 } };

const citation: SelectCitation = {
  primary: {
    type: 'leaf_description',
    source_ref: 'tariff_lines:code=7318.15.00',
    verbatim_text: 'Other screws and bolts',
    note_or_exclusion_id: null,
  },
  gir_applied: 'GIR-1',
};

function fetcher(table: Record<string, string>): TariffLineChainFetcher {
  return async (codes: string[]): Promise<HydratedChainRow[]> =>
    codes.filter((c) => c in table).map((c) => ({ code: c, description: table[c]! }));
}

const CLASSIFICATION_KEYS = [
  'responseType',
  'hsCode',
  'description',
  'confidence',
  'confidenceBand',
  'reasoning',
  'alternatives',
  'isSixDigit',
  'exportPolicy',
  'policyCondition',
  'indiaSpecific',
  'selfConfidence',
  'citation',
  'components',
].sort();

describe('B5 contract — CLASSIFICATION variant shape', () => {
  it('pins the classification key set + new confidenceBand + reserved confidenceP', async () => {
    const r = {
      ...base,
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00',
        is_six_digit: false,
        export_policy: 'Free',
        policy_condition: null,
        india_specific: false,
        citation,
        reasoning_chain: ['r1', 'r2'],
        self_confidence: 'MEDIUM',
        alternatives_considered: ['7318.16.00'],
        components: null,
        escalated_to_deep_think: false,
      },
    } as ClassifyResult;

    const out = await mapV2Result(
      r,
      fetcher({ '7318.15.00': 'Bolts', '7318.16.00': 'Nuts' }),
      subRows,
      subChildren,
      noTradeIntel,
    );
    if (out.responseType !== 'classification') throw new Error('unreachable');

    // Discriminator + key set (mapper output — processingTimeMs is route-attached).
    expect(out.responseType).toBe('classification');
    expect(Object.keys(out).sort()).toEqual(CLASSIFICATION_KEYS);

    // Types.
    expect(typeof out.hsCode).toBe('string');
    expect(typeof out.description).toBe('string');
    expect(Number.isInteger(out.confidence)).toBe(true);
    expect(typeof out.reasoning).toBe('string');
    expect(Array.isArray(out.alternatives)).toBe(true);
    expect(typeof out.isSixDigit).toBe('boolean');
    expect(typeof out.indiaSpecific).toBe('boolean');

    // B5: confidenceBand REQUIRED + one of the frozen literals.
    const bands: ApiConfidenceBand[] = ['high', 'medium', 'low'];
    expect(bands).toContain(out.confidenceBand);
    // B5: confidenceP reserved + OPTIONAL → absent at launch.
    expect(out.confidenceP).toBeUndefined();

    // B1c/B5: alternatives are {code, description} objects.
    for (const alt of out.alternatives) {
      expect(Object.keys(alt).sort()).toEqual(['code', 'description']);
    }
  });

  it('alternatives are capped at 3 (B1c/B5)', async () => {
    const r = {
      ...base,
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00',
        is_six_digit: false,
        export_policy: null,
        policy_condition: null,
        india_specific: false,
        citation,
        reasoning_chain: [],
        self_confidence: 'LOW',
        alternatives_considered: ['a1', 'a2', 'a3', 'a4', 'a5'],
        components: null,
        escalated_to_deep_think: false,
      },
    } as ClassifyResult;

    const out = await mapV2Result(
      r,
      fetcher({ '7318.15.00': 'L', a1: '1', a2: '2', a3: '3', a4: '4', a5: '5' }),
      subRows,
      subChildren,
      noTradeIntel,
    );
    if (out.responseType !== 'classification') throw new Error('unreachable');
    expect(out.alternatives.length).toBe(3);
    // Cap preserves the FIRST 3 in model order (no reorder).
    expect(out.alternatives.map((a) => a.code)).toEqual(['a1', 'a2', 'a3']);
  });

  it('alternatives are NOT padded to reach 3 when fewer resolve', async () => {
    const r = {
      ...base,
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00',
        is_six_digit: false,
        export_policy: null,
        policy_condition: null,
        india_specific: false,
        citation,
        reasoning_chain: [],
        self_confidence: 'LOW',
        // Two real siblings + one non-code token the model emitted ('n/a').
        alternatives_considered: ['a1', 'n/a', 'a2'],
        components: null,
        escalated_to_deep_think: false,
      },
    } as ClassifyResult;

    // 'n/a' has no tariff row -> filtered out; only a1 + a2 survive (no padding).
    const out = await mapV2Result(
      r,
      fetcher({ '7318.15.00': 'L', a1: '1', a2: '2' }),
      subRows,
      subChildren,
      noTradeIntel,
    );
    if (out.responseType !== 'classification') throw new Error('unreachable');
    expect(out.alternatives.map((a) => a.code)).toEqual(['a1', 'a2']);
  });

  it('ADDITIVE: tradeIntelligence is OMITTED when the assembler returns null (frozen key set holds)', async () => {
    const r = {
      ...base,
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00',
        is_six_digit: false,
        export_policy: 'Free',
        policy_condition: null,
        india_specific: false,
        citation,
        reasoning_chain: ['r1'],
        self_confidence: 'HIGH',
        alternatives_considered: [],
        components: null,
        escalated_to_deep_think: false,
      },
    } as ClassifyResult;

    const out = await mapV2Result(r, fetcher({ '7318.15.00': 'Bolts' }), subRows, subChildren, noTradeIntel);
    if (out.responseType !== 'classification') throw new Error('unreachable');
    // Null → key absent → the pre-trade-intel CLASSIFICATION_KEYS set is unchanged.
    expect('tradeIntelligence' in out).toBe(false);
    expect(Object.keys(out).sort()).toEqual(CLASSIFICATION_KEYS);
  });

  it('ADDITIVE: tradeIntelligence is INCLUDED as an extra key when the assembler returns a block', async () => {
    const r = {
      ...base,
      decision: 'CLASSIFY',
      classification: {
        code: '7318.15.00',
        is_six_digit: false,
        export_policy: 'Free',
        policy_condition: null,
        india_specific: false,
        citation,
        reasoning_chain: ['r1'],
        self_confidence: 'HIGH',
        alternatives_considered: [],
        components: null,
        escalated_to_deep_think: false,
      },
    } as ClassifyResult;

    const withTi: TradeIntelligenceFetcher = async () => ({
      exportPolicy: {
        status: 'Free',
        statusPlain: 'No DGFT export licence is needed for this line.',
        severity: 'notice',
        conditionVerbatim: null,
        conditionMissing: false,
        asOn: '2022-01-01',
        sourceUrl: 'https://example.test/dgft',
        stale: false,
        staleAdvisory: null,
        indicative: true,
      },
      exportDuty: null,
      incentive: null,
      uqc: null,
      flags: [],
      disclaimer: 'Indicative classification for guidance only.',
    });

    const out = await mapV2Result(r, fetcher({ '7318.15.00': 'Bolts' }), subRows, subChildren, withTi);
    if (out.responseType !== 'classification') throw new Error('unreachable');
    // The additive key is present and is exactly the original set + tradeIntelligence.
    expect('tradeIntelligence' in out).toBe(true);
    expect(Object.keys(out).sort()).toEqual([...CLASSIFICATION_KEYS, 'tradeIntelligence'].sort());
    expect(out.tradeIntelligence?.exportPolicy.status).toBe('Free');
  });
});

describe('B5 contract — QUESTION variant shape', () => {
  it('pins the question key set + types', async () => {
    const r = {
      ...base,
      decision: 'ASK',
      question: {
        question_id: 'ask_form',
        question_text: 'Knitted or woven?',
        discriminating_attribute: 'form',
        options: [
          { id: 'knitted', label: 'Knitted' },
          { id: 'woven', label: 'Woven' },
        ],
      },
    } as unknown as ClassifyResult;

    const out = await mapV2Result(r);
    if (out.responseType !== 'question') throw new Error('unreachable');

    expect(Object.keys(out).sort()).toEqual(
      ['responseType', 'question', 'options', 'questionId', 'discriminatingAttribute'].sort(),
    );
    expect(out.responseType).toBe('question');
    expect(typeof out.question).toBe('string');
    expect(typeof out.questionId).toBe('string');
    expect(typeof out.discriminatingAttribute).toBe('string');
    for (const o of out.options) {
      expect(Object.keys(o).sort()).toEqual(['id', 'label']);
    }
  });
});

describe('B5 contract — REFUSED variant shape', () => {
  it('pins the refused key set + types (legacy never emitted this — frontend MUST handle it)', async () => {
    const r = {
      ...base,
      decision: 'REFUSE',
      refusal: {
        reason: 'This appears to be a service, not a physical good.',
        out_of_scope_class: 'services_not_goods',
        verifier_failures: [],
      },
    } as ClassifyResult;

    const out = await mapV2Result(r);
    if (out.responseType !== 'refused') throw new Error('unreachable');

    expect(Object.keys(out).sort()).toEqual(['responseType', 'message', 'reason'].sort());
    expect(out.responseType).toBe('refused');
    expect(typeof out.message).toBe('string');
    // reason is the out_of_scope_class enum OR null.
    expect(out.reason === null || typeof out.reason === 'string').toBe(true);
  });

  it('refused reason is null when out_of_scope_class is null', async () => {
    const r = {
      ...base,
      decision: 'REFUSE',
      refusal: { reason: 'no faithful match', out_of_scope_class: null, verifier_failures: [] },
    } as ClassifyResult;

    const out = await mapV2Result(r);
    if (out.responseType !== 'refused') throw new Error('unreachable');
    expect(out.reason).toBeNull();
  });
});

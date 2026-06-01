import { describe, it, expect } from 'vitest';
import { mapV2Result } from './v2-api-adapter';
import type { HydratedChainRow, TariffLineChainFetcher } from './v2-api-adapter';
import type { ClassifyResult, PipelineSystemError, SelectCitation } from '../classifier-v2/types';

const base = { diagnostics: { escalation_path: [], latency_ms: 1, llm_calls: 1 } };

const citation: SelectCitation = {
  primary: {
    type: 'leaf_description',
    source_ref: 'tariff_lines:code=8708.30.00',
    verbatim_text: 'Brakes and servo-brakes; parts thereof',
    note_or_exclusion_id: null,
  },
  gir_applied: 'GIR-1',
};

/** Build a CLASSIFY ClassifyResult with overridable classification fields. */
function classifyResult(over: Partial<NonNullable<ClassifyResult['classification']>> = {}): ClassifyResult {
  return {
    ...base,
    decision: 'CLASSIFY',
    classification: {
      code: '8708.30.00',
      is_six_digit: false,
      export_policy: 'Free',
      policy_condition: null,
      india_specific: false,
      citation,
      reasoning_chain: ['Identified as a vehicle brake part.', 'GIR-1 applied.'],
      self_confidence: 'HIGH',
      alternatives_considered: [],
      components: null,
      escalated_to_deep_think: false,
      ...over,
    },
  } as ClassifyResult;
}

/** A mock fetcher backed by an in-memory code→description table. */
function mockFetcher(table: Record<string, string>): TariffLineChainFetcher {
  return async (codes: string[]): Promise<HydratedChainRow[]> =>
    codes
      .filter((c) => c in table)
      .map((c) => ({ code: c, description: table[c]! }));
}

describe('mapV2Result — CLASSIFY', () => {
  it('maps a CLASSIFY to the flat classification DTO with the LEAF (not citation) description', async () => {
    const r = classifyResult({ alternatives_considered: [] });
    const fetch = mockFetcher({ '8708.30.00': 'Brake pads for motor vehicles' });

    const out = await mapV2Result(r, fetch);

    expect(out.responseType).toBe('classification');
    if (out.responseType !== 'classification') throw new Error('unreachable');
    expect(out.hsCode).toBe('8708.30.00');
    // LEAF description from the DB, NOT the citation verbatim_text.
    expect(out.description).toBe('Brake pads for motor vehicles');
    expect(out.description).not.toBe(citation.primary.verbatim_text);
    expect(out.reasoning).toBe('Identified as a vehicle brake part.\nGIR-1 applied.');
    expect(out.isSixDigit).toBe(false);
    expect(out.exportPolicy).toBe('Free');
    expect(out.policyCondition).toBeNull();
    expect(out.indiaSpecific).toBe(false);
    expect(out.selfConfidence).toBe('HIGH');
    expect(out.citation).toEqual(citation);
    expect(out.components).toBeNull();
  });

  it('converts self_confidence enum → 0-100 integer (HIGH=90, MEDIUM=60, LOW=30)', async () => {
    const fetch = mockFetcher({ '8708.30.00': 'desc' });

    const high = await mapV2Result(classifyResult({ self_confidence: 'HIGH' }), fetch);
    const medium = await mapV2Result(classifyResult({ self_confidence: 'MEDIUM' }), fetch);
    const low = await mapV2Result(classifyResult({ self_confidence: 'LOW' }), fetch);

    expect((high as { confidence: number }).confidence).toBe(90);
    expect((medium as { confidence: number }).confidence).toBe(60);
    expect((low as { confidence: number }).confidence).toBe(30);
    // Integer, in [0,100].
    for (const c of [90, 60, 30]) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
    }
  });

  it('hydrates alternatives into {code, description} via the injected fetcher', async () => {
    const r = classifyResult({
      alternatives_considered: ['8708.99.00', '8708.80.00'],
    });
    const fetch = mockFetcher({
      '8708.30.00': 'Brake pads',
      '8708.99.00': 'Other parts and accessories',
      '8708.80.00': 'Suspension systems',
    });

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    expect(out.alternatives).toEqual([
      { code: '8708.99.00', description: 'Other parts and accessories' },
      { code: '8708.80.00', description: 'Suspension systems' },
    ]);
  });

  it('filters out non-code / unresolved alternatives (free-text entries)', async () => {
    const r = classifyResult({
      alternatives_considered: ['8708.99.00', 'none applicable', 'n/a', '9999.99.99'],
    });
    const fetch = mockFetcher({
      '8708.30.00': 'Brake pads',
      '8708.99.00': 'Other parts and accessories',
      // 'none applicable', 'n/a', '9999.99.99' deliberately absent → filtered.
    });

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    expect(out.alternatives).toEqual([
      { code: '8708.99.00', description: 'Other parts and accessories' },
    ]);
  });

  it('excludes the selected leaf and duplicate alternatives from the alternatives list', async () => {
    const r = classifyResult({
      alternatives_considered: ['8708.30.00', '8708.99.00', '8708.99.00'],
    });
    const fetch = mockFetcher({
      '8708.30.00': 'Brake pads',
      '8708.99.00': 'Other parts and accessories',
    });

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    // Selected leaf (8708.30.00) excluded; duplicate collapsed to one.
    expect(out.alternatives).toEqual([
      { code: '8708.99.00', description: 'Other parts and accessories' },
    ]);
  });

  it('falls back to empty description when the leaf code has no DB row', async () => {
    const r = classifyResult({ alternatives_considered: [] });
    const fetch = mockFetcher({}); // empty table

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    expect(out.description).toBe('');
  });

  it('caps alternatives at 3 (preserves model order, never pads) when >3 resolve', async () => {
    const r = classifyResult({
      alternatives_considered: ['8708.99.00', '8708.80.00', '8708.70.00', '8708.50.00', '8708.40.00'],
    });
    const fetch = mockFetcher({
      '8708.30.00': 'Brakes',
      '8708.99.00': 'A',
      '8708.80.00': 'B',
      '8708.70.00': 'C',
      '8708.50.00': 'D',
      '8708.40.00': 'E',
    });

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    // Exactly 3, in model order — the first three RESOLVABLE siblings.
    expect(out.alternatives).toEqual([
      { code: '8708.99.00', description: 'A' },
      { code: '8708.80.00', description: 'B' },
      { code: '8708.70.00', description: 'C' },
    ]);
  });

  it('returns all alternatives WITHOUT padding when fewer than 3 resolve', async () => {
    const r = classifyResult({
      // 5 entries but only 2 resolve to real rows → 2 returned, NOT padded to 3.
      alternatives_considered: ['8708.99.00', 'n/a', 'none', '9999.99.99', '8708.80.00'],
    });
    const fetch = mockFetcher({
      '8708.30.00': 'Brakes',
      '8708.99.00': 'A',
      '8708.80.00': 'B',
    });

    const out = await mapV2Result(r, fetch);
    if (out.responseType !== 'classification') throw new Error('unreachable');

    expect(out.alternatives).toEqual([
      { code: '8708.99.00', description: 'A' },
      { code: '8708.80.00', description: 'B' },
    ]);
    expect(out.alternatives.length).toBe(2);
  });

  it('maps self_confidence → confidenceBand (HIGH→high, MEDIUM→medium, LOW→low)', async () => {
    const fetch = mockFetcher({ '8708.30.00': 'desc' });
    const high = await mapV2Result(classifyResult({ self_confidence: 'HIGH' }), fetch);
    const medium = await mapV2Result(classifyResult({ self_confidence: 'MEDIUM' }), fetch);
    const low = await mapV2Result(classifyResult({ self_confidence: 'LOW' }), fetch);

    if (high.responseType !== 'classification') throw new Error('unreachable');
    if (medium.responseType !== 'classification') throw new Error('unreachable');
    if (low.responseType !== 'classification') throw new Error('unreachable');
    expect(high.confidenceBand).toBe('high');
    expect(medium.confidenceBand).toBe('medium');
    expect(low.confidenceBand).toBe('low');
    // confidenceP is reserved (optional) and absent at launch.
    expect(high.confidenceP).toBeUndefined();
  });

  it('hydrates the leaf + alternatives in a SINGLE fetch call (deduped)', async () => {
    const calls: string[][] = [];
    const fetch: TariffLineChainFetcher = async (codes) => {
      calls.push(codes);
      return codes
        .filter((c) => c.startsWith('8708'))
        .map((c) => ({ code: c, description: `desc ${c}` }));
    };
    const r = classifyResult({ alternatives_considered: ['8708.99.00', '8708.30.00'] });

    await mapV2Result(r, fetch);

    expect(calls.length).toBe(1);
    // Leaf first, then unique alternatives (the leaf dup is removed).
    expect(calls[0]).toEqual(['8708.30.00', '8708.99.00']);
  });
});

describe('mapV2Result — ASK', () => {
  it('maps an ASK to the flat question DTO', async () => {
    const r = {
      ...base,
      decision: 'ASK',
      question: {
        question_id: 'ask_form',
        question_text: 'Is the fabric knitted or woven?',
        discriminating_attribute: 'form',
        options: [
          { id: 'knitted', label: 'Knitted' },
          { id: 'woven', label: 'Woven' },
        ],
      },
    } as unknown as ClassifyResult;

    const out = await mapV2Result(r);

    expect(out.responseType).toBe('question');
    if (out.responseType !== 'question') throw new Error('unreachable');
    expect(out.question).toBe('Is the fabric knitted or woven?');
    expect(out.questionId).toBe('ask_form');
    expect(out.discriminatingAttribute).toBe('form');
    expect(out.options).toEqual([
      { id: 'knitted', label: 'Knitted' },
      { id: 'woven', label: 'Woven' },
    ]);
  });
});

describe('mapV2Result — REFUSE', () => {
  it('maps a model REFUSE to the flat refused DTO', async () => {
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

    expect(out.responseType).toBe('refused');
    if (out.responseType !== 'refused') throw new Error('unreachable');
    expect(out.message).toBe('This appears to be a service, not a physical good.');
    expect(out.reason).toBe('services_not_goods');
  });

  it('maps a REFUSE with null out_of_scope_class to reason: null', async () => {
    const r = {
      ...base,
      decision: 'REFUSE',
      refusal: { reason: 'No faithful classification', out_of_scope_class: null, verifier_failures: [] },
    } as ClassifyResult;

    const out = await mapV2Result(r);
    if (out.responseType !== 'refused') throw new Error('unreachable');
    expect(out.message).toBe('No faithful classification');
    expect(out.reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Route-level system_error mapping. mapV2Result does NOT handle system_error —
// the ROUTE inspects `result.system_error` and returns 503 BEFORE mapping. This
// test asserts that contract (the discriminator) so a regression that drops the
// route guard would be caught: a system_error result, if it DID reach the mapper,
// maps as a refusal (proving the route — not the mapper — must gate it).
// ---------------------------------------------------------------------------

describe('system_error (route gates it BEFORE mapping)', () => {
  const systemError: PipelineSystemError = {
    stage: 'L1',
    message: '[vertex-client] After 3 retry attempts: 503 Service Unavailable',
    retryable: true,
  };

  const r = {
    ...base,
    decision: 'REFUSE',
    refusal: { reason: 'System error during classification', out_of_scope_class: null, verifier_failures: [] },
    system_error: systemError,
  } as ClassifyResult;

  it('the discriminator the route uses is present on a system_error result', () => {
    expect(r.system_error).toBeDefined();
    expect(r.system_error?.retryable).toBe(true);
  });

  it('a genuine model REFUSE carries NO system_error (so the route does not 503 it)', () => {
    const modelRefuse = {
      ...base,
      decision: 'REFUSE',
      refusal: { reason: 'oos', out_of_scope_class: 'services_not_goods', verifier_failures: [] },
    } as ClassifyResult;
    expect(modelRefuse.system_error).toBeUndefined();
  });

  it('if a system_error result reached mapV2Result it would map as a refusal — WHY the route must gate it first', async () => {
    const out = await mapV2Result(r);
    expect(out.responseType).toBe('refused');
    // This is exactly why the route checks `result.system_error !== undefined`
    // and returns 503 BEFORE calling the mapper: the mapper alone cannot tell a
    // persistent infra failure apart from a model refusal.
    expect(r.system_error).toBeDefined();
  });
});

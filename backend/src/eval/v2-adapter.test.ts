import { describe, it, expect } from 'vitest';
import { mapV2ToLegacy, isSystemError } from './v2-adapter';
import type { ClassifyResult, PipelineSystemError } from '../classifier-v2/types';

const base = { diagnostics: { escalation_path: [], latency_ms: 1, llm_calls: 1 } };

describe('mapV2ToLegacy', () => {
  it('maps CLASSIFY → classification with enum→number confidence', () => {
    const r = { ...base, decision: 'CLASSIFY', classification: {
      code: '8708.30.00', is_six_digit: false, export_policy: 'Free', policy_condition: null,
      india_specific: false,
      citation: { primary: { type: 'leaf_description', source_ref: 'x', verbatim_text: 'brake parts', note_or_exclusion_id: null }, gir_applied: 'GIR-1' },
      reasoning_chain: ['a', 'b'], self_confidence: 'HIGH', alternatives_considered: ['8708.99'],
      components: null, escalated_to_deep_think: false,
    } } as ClassifyResult;
    const out = mapV2ToLegacy(r);
    expect(out).toEqual({
      responseType: 'classification', hsCode: '8708.30.00', description: 'brake parts',
      confidence: 0.9, reasoning: 'a b', brain_used: false, context: '8708.99',
    });
  });
  it('maps ASK → question', () => {
    const r = { ...base, decision: 'ASK', question: { question_id: 'q1', question_text: 'Knitted or woven?', discriminating_attribute: 'form', options: [{ id: 'knit', label: 'Knitted' }, { id: 'woven', label: 'Woven' }] } } as unknown as ClassifyResult;
    const out = mapV2ToLegacy(r);
    expect(out?.responseType).toBe('question');
    expect(out?.question).toBe('Knitted or woven?');
    expect(out?.options).toEqual([{ id: 'knit', label: 'Knitted' }, { id: 'woven', label: 'Woven' }]);
  });
  it('maps model REFUSE → null', () => {
    const r = { ...base, decision: 'REFUSE', refusal: { reason: 'oos', out_of_scope_class: 'services_not_goods', verifier_failures: [] } } as ClassifyResult;
    expect(mapV2ToLegacy(r)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C1 (CRITICAL): a system_error result is an INFRA failure — it must be
// DETECTABLE as an error and NOT silently treated as a scored model 'reject'.
// ---------------------------------------------------------------------------

describe('isSystemError (C1 — system_error must NOT be scored as a reject)', () => {
  const systemError: PipelineSystemError = {
    stage: 'L1',
    message: '[vertex-client] After 3 retry attempts: 503 Service Unavailable',
    retryable: true,
  };

  // A persistent Vertex transport failure: the orchestrator surfaces it as a
  // REFUSE-decision result that ALSO carries `system_error` (the discriminator).
  const r = {
    ...base,
    decision: 'REFUSE',
    refusal: { reason: 'System error during classification', out_of_scope_class: null, verifier_failures: [] },
    system_error: systemError,
  } as ClassifyResult;

  it('flags a result carrying system_error as a system error', () => {
    expect(isSystemError(r)).toBe(true);
  });

  it('does NOT flag a genuine model REFUSE (no system_error) as a system error', () => {
    const modelRefuse = { ...base, decision: 'REFUSE', refusal: { reason: 'oos', out_of_scope_class: 'services_not_goods', verifier_failures: [] } } as ClassifyResult;
    expect(isSystemError(modelRefuse)).toBe(false);
  });

  it('mapV2ToLegacy(system_error) returns null — proving the runner (not the mapper) must gate it: null-as-reject would corrupt the baseline if scored', () => {
    // mapV2ToLegacy is pure and decision-driven: a REFUSE maps to null exactly
    // like a model refuse. This is WHY the runner must call isSystemError BEFORE
    // mapping/scoring — null alone cannot distinguish "model refused" from
    // "infra failed". The runner routes isSystemError → per-case ERROR bucket.
    expect(mapV2ToLegacy(r)).toBeNull();
    expect(isSystemError(r)).toBe(true); // the discriminator the runner uses
  });
});

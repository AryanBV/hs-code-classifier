import { describe, it, expect, vi } from 'vitest';
import { mapV2ToLegacy } from './v2-adapter';
import type { ClassifyResult } from '../classifier-v2/types';

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
  it('maps REFUSE → null', () => {
    const r = { ...base, decision: 'REFUSE', refusal: { reason: 'oos', out_of_scope_class: 'services_not_goods', verifier_failures: [] } } as ClassifyResult;
    expect(mapV2ToLegacy(r)).toBeNull();
  });
});

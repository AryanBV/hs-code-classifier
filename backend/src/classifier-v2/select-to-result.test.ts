import { describe, it, expect } from 'vitest';
import { selectToClassifyResult, buildDiagnostics } from './select-to-result';
import type { PipelineRunState, SelectOutput } from './types';

function mkState(overrides?: Partial<PipelineRunState>): PipelineRunState {
  return {
    query: 'stainless steel bolts M10',
    normalized_query: 'stainless steel bolts m10',
    previousAnswers: {},
    q_budget_remaining: 3,
    backtrack_attempted: false,
    escalation_path: ['L0', 'L1', 'L2', 'L3', 'L4'],
    trace: [],
    ...overrides,
  };
}

const mockSelect: SelectOutput = {
  selected_code: '7318.15.00',
  selected_code_is_six_digit: false,
  export_policy: 'Free',
  policy_condition: null,
  india_specific_flag: false,
  reasoning_chain: ['GIR-1 applies', 'Chapter 73 covers iron/steel articles'],
  citation: {
    primary: {
      type: 'leaf_description',
      source_ref: 'tariff_lines.code=7318.15.00',
      verbatim_text: 'Screws, bolts, nuts — of stainless steel',
      note_or_exclusion_id: null,
    },
    gir_applied: 'GIR-1',
  },
  exclusions_checked: [12, 34],
  self_confidence: 'HIGH',
  alternatives_considered: ['7318.14.00'],
  components: null,
  refusal: null,
};

describe('selectToClassifyResult', () => {
  it('returns decision CLASSIFY', () => {
    const result = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    expect(result.decision).toBe('CLASSIFY');
  });

  it('maps selected_code to classification.code', () => {
    const result = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    expect(result.classification?.code).toBe('7318.15.00');
  });

  it('uses empty string for code when selected_code is null', () => {
    const sel = { ...mockSelect, selected_code: null };
    const result = selectToClassifyResult(sel, mkState(), { escalated_to_deep_think: false });
    expect(result.classification?.code).toBe('');
  });

  it('maps is_six_digit from selected_code_is_six_digit', () => {
    const sel = { ...mockSelect, selected_code_is_six_digit: true };
    const result = selectToClassifyResult(sel, mkState(), { escalated_to_deep_think: false });
    expect(result.classification?.is_six_digit).toBe(true);
  });

  it('maps india_specific from india_specific_flag', () => {
    const sel = { ...mockSelect, india_specific_flag: true };
    const result = selectToClassifyResult(sel, mkState(), { escalated_to_deep_think: false });
    expect(result.classification?.india_specific).toBe(true);
  });

  it('passes through export_policy, policy_condition, reasoning_chain, citation, self_confidence', () => {
    const result = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    const c = result.classification!;
    expect(c.export_policy).toBe('Free');
    expect(c.policy_condition).toBeNull();
    expect(c.reasoning_chain).toEqual(['GIR-1 applies', 'Chapter 73 covers iron/steel articles']);
    expect(c.citation).toBe(mockSelect.citation);
    expect(c.self_confidence).toBe('HIGH');
  });

  it('passes through alternatives_considered and components', () => {
    const result = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    expect(result.classification?.alternatives_considered).toEqual(['7318.14.00']);
    expect(result.classification?.components).toBeNull();
  });

  it('sets escalated_to_deep_think from opts', () => {
    const r1 = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    const r2 = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: true });
    expect(r1.classification?.escalated_to_deep_think).toBe(false);
    expect(r2.classification?.escalated_to_deep_think).toBe(true);
  });

  it('does not set question or refusal on CLASSIFY result', () => {
    const result = selectToClassifyResult(mockSelect, mkState(), { escalated_to_deep_think: false });
    expect(result.question).toBeUndefined();
    expect(result.refusal).toBeUndefined();
  });
});

describe('buildDiagnostics', () => {
  it('copies escalation_path as a new array (no shared reference)', () => {
    const state = mkState();
    const diag = buildDiagnostics(state);
    state.escalation_path.push('L5');
    expect(diag.escalation_path).not.toContain('L5');
  });

  it('latency_ms is 0 when started_at is absent', () => {
    const diag = buildDiagnostics(mkState());
    expect(diag.latency_ms).toBe(0);
  });

  it('latency_ms is approximately correct when started_at is set', () => {
    const state = mkState({ started_at: Date.now() - 250 });
    const diag = buildDiagnostics(state);
    // Allow generous tolerance for CI variance
    expect(diag.latency_ms).toBeGreaterThanOrEqual(200);
    expect(diag.latency_ms).toBeLessThan(2000);
  });

  it('llm_calls is 0 when absent', () => {
    const diag = buildDiagnostics(mkState());
    expect(diag.llm_calls).toBe(0);
  });

  it('llm_calls reflects state.llm_calls when set', () => {
    const diag = buildDiagnostics(mkState({ llm_calls: 5 }));
    expect(diag.llm_calls).toBe(5);
  });

  it('escalation_path contains all state layers', () => {
    const diag = buildDiagnostics(mkState());
    expect(diag.escalation_path).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
  });
});

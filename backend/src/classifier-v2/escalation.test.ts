import { describe, it, expect } from 'vitest';
import { BaselineEscalation, sortedRuleSignature, noProgress } from './escalation';
import type { PipelineRunState, SelectOutput, VerifierRuleFailure } from './types';

/** Build a minimal VerifierRuleFailure carrying only the fields the helpers read. */
function mkFailure(rule_id: string): VerifierRuleFailure {
  return {
    rule_id,
    rule_name: rule_id,
    failure_detail: `${rule_id} failed`,
  };
}

function mkState(): PipelineRunState {
  return {
    query: 'q',
    normalized_query: 'q',
    previousAnswers: {},
    q_budget_remaining: 3,
    backtrack_attempted: false,
    escalation_path: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'],
    trace: [],
  };
}

const baseSelectOutput: SelectOutput = {
  selected_code: '7208.10.00',
  selected_code_is_six_digit: false,
  export_policy: 'Free',
  policy_condition: null,
  india_specific_flag: false,
  reasoning_chain: ['r'],
  citation: {
    primary: {
      type: 'leaf_description',
      source_ref: 'x',
      verbatim_text: 't',
      note_or_exclusion_id: null,
    },
    gir_applied: 'GIR-1',
  },
  exclusions_checked: [],
  self_confidence: 'LOW',
  alternatives_considered: [],
  components: null,
  refusal: null,
};

describe('BaselineEscalation', () => {
  describe('onVerifierExhausted', () => {
    it('emits best Select as CLASSIFY + flags would_escalate', () => {
      const s = mkState();
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.decision).toBe('CLASSIFY');
      expect(out.classification?.code).toBe('7208.10.00');
      expect(s.escalation_path).toContain('L6:would_escalate');
    });

    it('pushes L6:would_escalate BEFORE building diagnostics (so escalation_path includes it)', () => {
      const s = mkState();
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      // The diagnostics.escalation_path in the result must include 'L6:would_escalate'
      expect(out.diagnostics.escalation_path).toContain('L6:would_escalate');
    });

    it('sets escalated_to_deep_think to false', () => {
      const s = mkState();
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.classification?.escalated_to_deep_think).toBe(false);
    });

    it('maps all SelectOutput fields into classification correctly', () => {
      const s = mkState();
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.classification?.is_six_digit).toBe(false);
      expect(out.classification?.export_policy).toBe('Free');
      expect(out.classification?.policy_condition).toBeNull();
      expect(out.classification?.india_specific).toBe(false);
      expect(out.classification?.self_confidence).toBe('LOW');
      expect(out.classification?.reasoning_chain).toEqual(['r']);
      expect(out.classification?.alternatives_considered).toEqual([]);
      expect(out.classification?.components).toBeNull();
    });

    it('diagnostics.llm_calls defaults to 0 when state has no llm_calls', () => {
      const s = mkState(); // no llm_calls field
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.diagnostics.llm_calls).toBe(0);
    });

    it('diagnostics.latency_ms defaults to 0 when state has no started_at', () => {
      const s = mkState(); // no started_at field
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.diagnostics.latency_ms).toBe(0);
    });

    it('diagnostics.latency_ms is positive when state.started_at is set', () => {
      const s = { ...mkState(), started_at: Date.now() - 100 };
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.diagnostics.latency_ms).toBeGreaterThan(0);
    });

    it('diagnostics.llm_calls reflects state.llm_calls when set', () => {
      const s = { ...mkState(), llm_calls: 3 };
      const out = BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, []);

      expect(out.diagnostics.llm_calls).toBe(3);
    });

    it('accepts verifier failures param without throwing (FullEscalation interface compat)', () => {
      const s = mkState();
      const failures = [
        {
          rule_id: 'MV-01',
          rule_name: 'Code format',
          failure_detail: 'bad format',
        },
      ];
      expect(() =>
        BaselineEscalation.onVerifierExhausted(s, baseSelectOutput, failures),
      ).not.toThrow();
    });
  });

  describe('onZeroCandidates', () => {
    it('returns REFUSE with backtrack_no_fit out_of_scope_class', () => {
      const s = mkState();
      const out = BaselineEscalation.onZeroCandidates(s);

      expect(out.decision).toBe('REFUSE');
      expect(out.refusal?.out_of_scope_class).toBe('backtrack_no_fit');
    });

    it('returns empty verifier_failures array', () => {
      const s = mkState();
      const out = BaselineEscalation.onZeroCandidates(s);

      expect(out.refusal?.verifier_failures).toEqual([]);
    });

    it('includes a non-empty reason string', () => {
      const s = mkState();
      const out = BaselineEscalation.onZeroCandidates(s);

      expect(typeof out.refusal?.reason).toBe('string');
      expect((out.refusal?.reason ?? '').length).toBeGreaterThan(0);
    });

    it('diagnostics.escalation_path reflects current state (no mutation)', () => {
      const s = mkState();
      const out = BaselineEscalation.onZeroCandidates(s);

      expect(out.diagnostics.escalation_path).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
    });

    it('does not set classification or question fields', () => {
      const s = mkState();
      const out = BaselineEscalation.onZeroCandidates(s);

      expect(out.classification).toBeUndefined();
      expect(out.question).toBeUndefined();
    });
  });
});

describe('sortedRuleSignature', () => {
  it('is order-independent (["A","B"] === ["B","A"])', () => {
    expect(sortedRuleSignature([mkFailure('A'), mkFailure('B')])).toBe(
      sortedRuleSignature([mkFailure('B'), mkFailure('A')]),
    );
  });

  it('de-duplicates repeated rule_ids (["A","A"] === ["A"])', () => {
    expect(sortedRuleSignature([mkFailure('A'), mkFailure('A')])).toBe(
      sortedRuleSignature([mkFailure('A')]),
    );
  });

  it('distinguishes different rule sets', () => {
    expect(sortedRuleSignature([mkFailure('A')])).not.toBe(
      sortedRuleSignature([mkFailure('B')]),
    );
  });

  it('is the empty string for no failures', () => {
    expect(sortedRuleSignature([])).toBe('');
  });
});

describe('noProgress', () => {
  it('returns true when the code is unchanged (same non-null code)', () => {
    expect(
      noProgress('7318.15.00', '7318.15.00', [mkFailure('MV-01')], [mkFailure('MV-02')]),
    ).toBe(true);
  });

  it('returns true when the signature is unchanged regardless of code', () => {
    expect(
      noProgress('7318.15.00', '7318.16.00', [mkFailure('MV-01')], [mkFailure('MV-01')]),
    ).toBe(true);
  });

  it('returns false when BOTH the code and the signature differ', () => {
    expect(
      noProgress('7318.15.00', '7318.16.00', [mkFailure('MV-01')], [mkFailure('MV-02')]),
    ).toBe(false);
  });

  it('treats signature equality order-independently', () => {
    expect(
      noProgress(
        '7318.15.00',
        '7318.16.00',
        [mkFailure('MV-01'), mkFailure('MV-02')],
        [mkFailure('MV-02'), mkFailure('MV-01')],
      ),
    ).toBe(true);
  });

  it('treats signature equality de-duplicated', () => {
    expect(
      noProgress(
        '7318.15.00',
        '7318.16.00',
        [mkFailure('MV-01')],
        [mkFailure('MV-01'), mkFailure('MV-01')],
      ),
    ).toBe(true);
  });

  it('never matches the code clause when prevCode is null (only signature)', () => {
    // prevCode null, differing signatures → no progress is false.
    expect(
      noProgress(null, '7318.15.00', [mkFailure('MV-01')], [mkFailure('MV-02')]),
    ).toBe(false);
    // prevCode null, matching signature → bails on the signature clause only.
    expect(
      noProgress(null, '7318.15.00', [mkFailure('MV-01')], [mkFailure('MV-01')]),
    ).toBe(true);
  });

  it('ignores the signature clause when useSignature is false', () => {
    // Same signature but different code, useSignature=false → no bail (code-only).
    expect(
      noProgress('7318.15.00', '7318.16.00', [mkFailure('MV-01')], [mkFailure('MV-01')], false),
    ).toBe(false);
    // Same code still bails even with useSignature=false.
    expect(
      noProgress('7318.15.00', '7318.15.00', [mkFailure('MV-01')], [mkFailure('MV-02')], false),
    ).toBe(true);
  });
});

import type {
  PipelineRunState,
  SelectOutput,
  ClassifyResult,
  VerifierRuleFailure,
} from './types';
import { selectToClassifyResult, buildDiagnostics } from './select-to-result';

/**
 * Shared escalation_path markers. PRODUCED here (onVerifierExhausted) and in the
 * orchestrator repair loop (index.ts), CONSUMED by src/eval/runner.ts to compute
 * `verifier_rejected_but_correct`. Defined once so producer and consumer cannot
 * drift apart on the string convention.
 *
 *   - ESCALATION_REPAIR_PREFIX: each repair attempt records `${prefix}${i}`
 *     (i = 0,1,2), e.g. 'L5:repair0'. Consumer matches via startsWith.
 *   - ESCALATION_WOULD_ESCALATE_MARKER: pushed when the verifier rejected 3x with
 *     no repair and a real system WOULD escalate to L6.
 */
export const ESCALATION_REPAIR_PREFIX = 'L5:repair';
export const ESCALATION_WOULD_ESCALATE_MARKER = 'L6:would_escalate';

/**
 * EscalationPolicy — permanent seam for escalation handlers.
 *
 * BaselineEscalation (this file) is the minimal stub used until L6 (Tiebreak)
 * and L7 (Deep-Think) are built. A future FullEscalation will implement this
 * SAME interface with real L6→L5→L7 logic. Nothing here is throwaway.
 *
 * Orchestrator calls:
 *   - onVerifierExhausted: verifier rejected Select output 3 times with no repair
 *   - onZeroCandidates: L3 produced zero surviving candidates after backtracking
 */
export interface EscalationPolicy {
  onVerifierExhausted(
    state: PipelineRunState,
    best: SelectOutput,
    failures: VerifierRuleFailure[],
  ): ClassifyResult;

  onZeroCandidates(state: PipelineRunState): ClassifyResult;
}

/**
 * BaselineEscalation — minimal placeholder implementing EscalationPolicy.
 *
 * onVerifierExhausted:
 *   Emits the best Select result as-is, flagging that a real system WOULD escalate
 *   to L6 Tiebreak. Pushes 'L6:would_escalate' to state.escalation_path FIRST so
 *   the mutation is visible in the result's diagnostics.escalation_path.
 *
 * onZeroCandidates:
 *   Returns a REFUSE with out_of_scope_class='backtrack_no_fit'. No candidates
 *   survived exclusion + backtracking — the query cannot be classified.
 */
export const BaselineEscalation: EscalationPolicy = {
  onVerifierExhausted(
    state: PipelineRunState,
    best: SelectOutput,
    _failures: VerifierRuleFailure[],
  ): ClassifyResult {
    // Mutate escalation_path BEFORE building diagnostics so the flag appears in
    // diagnostics.escalation_path in the returned result.
    state.escalation_path.push(ESCALATION_WOULD_ESCALATE_MARKER);

    return selectToClassifyResult(best, state, { escalated_to_deep_think: false });
  },

  onZeroCandidates(state: PipelineRunState): ClassifyResult {
    return {
      decision: 'REFUSE',
      refusal: {
        reason: 'No tariff line fits after backtracking',
        out_of_scope_class: 'backtrack_no_fit',
        verifier_failures: [],
      },
      diagnostics: buildDiagnostics(state),
    };
  },
};

import type { SelectOutput, PipelineRunState, ClassifyResult } from './types';

/**
 * Map a SelectOutput into a CLASSIFY ClassifyResult.
 *
 * This is the SINGLE canonical source of the SelectOutput → ClassifyResult mapping.
 * Both the happy path (Task 6 orchestrator) and BaselineEscalation call this
 * function — never duplicate the mapping inline.
 */
export function selectToClassifyResult(
  best: SelectOutput,
  state: PipelineRunState,
  opts: { escalated_to_deep_think: boolean },
): ClassifyResult {
  return {
    decision: 'CLASSIFY',
    classification: {
      code: best.selected_code ?? '',
      is_six_digit: best.selected_code_is_six_digit,
      export_policy: best.export_policy,
      policy_condition: best.policy_condition,
      india_specific: best.india_specific_flag,
      citation: best.citation,
      reasoning_chain: best.reasoning_chain,
      self_confidence: best.self_confidence,
      alternatives_considered: best.alternatives_considered,
      components: best.components,
      escalated_to_deep_think: opts.escalated_to_deep_think,
    },
    diagnostics: buildDiagnostics(state),
  };
}

/**
 * Build the diagnostics block from PipelineRunState.
 *
 * Safe fallbacks: latency_ms = 0 when started_at is absent; llm_calls = 0 when
 * untracked. Exported so Task 6 orchestrator and escalation handlers can reuse it.
 */
export function buildDiagnostics(state: PipelineRunState): ClassifyResult['diagnostics'] {
  return {
    escalation_path: [...state.escalation_path],
    latency_ms: state.started_at !== undefined ? Date.now() - state.started_at : 0,
    llm_calls: state.llm_calls ?? 0,
  };
}

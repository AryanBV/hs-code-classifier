/**
 * Phase 1 eval — classifier stub (T12 / B1 deliverable).
 *
 * Returns null for every query. The Phase 1 eval runner uses this stub to
 * validate the end-to-end harness (case-loading → metrics → output JSON) BEFORE
 * the real classifier exists. Phase 4 will replace this stub with a real
 * implementation that builds on the new normalized schema.
 *
 * TODO(Phase 4): swap this stub for the real classifier. The Phase 4 entry
 *   point is planned at `backend/src/classifier-v2/index.ts` (see
 *   `backend/data/phase-3-spike-report.md` and the B5/B6/B7 Phase 4 prompts
 *   under `backend/data/phase-3.5-prompts/`). Keep the `EvalResult` shape
 *   below stable — the runner's metric computation depends on it.
 */

export interface EvalResult {
  selected_code: string | null;
  selected_code_is_six_digit?: boolean;
  export_policy?: string | null;
  policy_condition?: string | null;
  reasoning_chain?: string[];
  self_confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export async function classifyStub(
  _query: string,
  _previousAnswers?: Record<string, string>,
): Promise<EvalResult | null> {
  // Phase 4 implementation will replace this. Returning null lets the runner
  // exercise its "predicted is null" code path on every case.
  return null;
}

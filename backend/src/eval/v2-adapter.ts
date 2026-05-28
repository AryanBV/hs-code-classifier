import { classify as classifyV2 } from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import type { ClassificationResult } from '../classifier/types';

const CONF: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = { HIGH: 0.9, MEDIUM: 0.6, LOW: 0.3 };

/**
 * Map the v2 ClassifyResult onto the legacy ClassificationResult the scorer reads.
 *
 * PURE: no I/O, no side effects, deterministic. Maps ONLY the three model
 * decisions (CLASSIFY / ASK / REFUSE). A genuine model REFUSE → null, which the
 * scorer's `determineActualRouting(null)` treats as routing 'reject'.
 *
 * IMPORTANT (Task 12 C1): this function does NOT inspect `system_error`. A
 * `system_error` result is an INFRA failure, not a model decision — it must NOT
 * reach the scorer as a reject. Detecting it is the RUNNER's job via
 * {@link isSystemError} (called before scoring). Keeping that policy out of this
 * pure mapper avoids overloading `null` to mean both "model refused" and "infra
 * failed", which would corrupt the routing baseline.
 */
export function mapV2ToLegacy(r: ClassifyResult): ClassificationResult | null {
  if (r.decision === 'CLASSIFY' && r.classification) {
    const c = r.classification;
    return {
      responseType: 'classification',
      hsCode: c.code,
      description: c.citation?.primary?.verbatim_text ?? '',
      confidence: CONF[c.self_confidence],
      reasoning: c.reasoning_chain.join(' '),
      brain_used: c.escalated_to_deep_think,
      context: c.alternatives_considered.join('; '),
    };
  }
  if (r.decision === 'ASK' && r.question) {
    return {
      responseType: 'question',
      question: r.question.question_text,
      options: r.question.options.map((o) => ({ id: o.id, label: o.label })),
    };
  }
  return null; // model REFUSE → scorer's determineActualRouting(null) → 'reject'
}

/**
 * True iff the v2 result carries a persistent infra/transport `system_error`
 * (ARCHITECTURE §7). This is the discriminator the runner uses to route a case
 * into the per-case ERROR bucket BEFORE scoring — a model REFUSE never sets it.
 */
export function isSystemError(r: ClassifyResult): boolean {
  return r.system_error !== undefined;
}

/** Both views of a single v2 classification: the scored legacy shape + the raw result. */
export interface EvalClassifyResult {
  /** Mapped legacy shape consumed by the scorer. null on model REFUSE. */
  legacy: ClassificationResult | null;
  /** Raw v2 result — carries diagnostics + system_error the runner needs. */
  raw: ClassifyResult;
}

/**
 * Run the v2 classifier for one eval case and return BOTH the mapped legacy
 * shape (for scoring) AND the raw ClassifyResult (for diagnostics + the
 * system_error/error policy the runner owns). `mapV2ToLegacy` stays pure; this
 * thin wrapper is the only impure surface.
 */
export async function classifyForEval(query: string): Promise<EvalClassifyResult> {
  const raw = await classifyV2(query);
  return { legacy: mapV2ToLegacy(raw), raw };
}

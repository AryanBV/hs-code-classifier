import { classify as classifyV2 } from '../classifier-v2';
import type { ClassifyResult } from '../classifier-v2/types';
import type { ClassificationResult } from '../classifier/types';

const CONF: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = { HIGH: 0.9, MEDIUM: 0.6, LOW: 0.3 };

/** Map the v2 ClassifyResult onto the legacy ClassificationResult the scorer reads. */
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
  return null; // REFUSE → scorer's determineActualRouting(null) → 'reject'
}

export async function classifyForEval(query: string): Promise<ClassificationResult | null> {
  return mapV2ToLegacy(await classifyV2(query));
}

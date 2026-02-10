// backend/src/classifier/router.ts
//
// Deterministic router (M3: ARY-27).
// Converts BrainOutput into RouteDecision for the downstream pipeline.
// Pure function — no async, no AI, no database calls.

import {
  BrainOutput,
  RouteDecision,
  ExtractedAttributes,
  QuestionResponse,
} from './types';

/**
 * Convert BrainOutput to a pipeline-compatible RouteDecision.
 */
export function route(brain: BrainOutput, query: string = ''): RouteDecision {
  if (!brain || !brain.decision) {
    console.warn('[Router] Malformed BrainOutput — defaulting to classify');
    return buildClassifyFallback(brain, query);
  }

  switch (brain.decision) {
    case 'reject':
      return {
        action: 'reject',
        message: brain.reasoning || 'Input is not a valid product description.',
      };

    case 'ask_targeted':
    case 'disambiguate':
      return buildAskDecision(brain);

    case 'classify':
      return buildClassifyDecision(brain, query);

    default:
      console.warn(`[Router] Unknown decision "${brain.decision}" — defaulting to classify`);
      return buildClassifyFallback(brain, query);
  }
}

function buildClassifyDecision(brain: BrainOutput, query: string): RouteDecision {
  return {
    action: 'classify',
    attributes: brainToExtractedAttributes(brain, query),
    suggestedChapters: brain.suggested_chapters || [],
  };
}

function buildAskDecision(brain: BrainOutput): RouteDecision {
  const q = brain.question;

  if (!q || !q.text || !q.options || q.options.length === 0) {
    console.warn('[Router] Ask decision but question is empty — defaulting to classify');
    return buildClassifyFallback(brain);
  }

  const question: QuestionResponse = {
    question: q.text,
    options: q.options.map((opt, i) => ({
      id: opt.id || `opt_${i}`,
      label: opt.label,
      leads_to_chapter: opt.leads_to_chapter || undefined,
    })),
    context: q.context || brain.reasoning,
    attribute_needed: q.attribute_needed || 'unknown',
  };

  return {
    action: 'ask',
    question,
  };
}

function buildClassifyFallback(brain: BrainOutput | null, query: string = ''): RouteDecision {
  return {
    action: 'classify',
    attributes: brain ? brainToExtractedAttributes(brain, query) : { raw_query: query },
    suggestedChapters: brain?.suggested_chapters || [],
  };
}

/**
 * Convert BrainAttributes to ExtractedAttributes for downstream compatibility.
 * Empty strings become undefined. Drops brain-only fields (industry, origin).
 */
function brainToExtractedAttributes(brain: BrainOutput, query: string): ExtractedAttributes {
  const a = brain.attributes;
  return {
    material: a.material || undefined,
    form: a.form || undefined,
    function: a.function || undefined,
    intended_use: a.intended_use || undefined,
    processing_state: a.processing_state || undefined,
    composition: a.composition || undefined,
    raw_query: query,
  };
}

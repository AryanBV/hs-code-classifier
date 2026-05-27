/**
 * Phase 4 v2 classifier entry point.
 *
 * Architecture: backend/docs/ARCHITECTURE.md §2 (8-layer pipeline overview).
 * Layers L0..L8 are not yet implemented — they will land progressively as
 * Phase 4.1 / 4.2 / 4.3 ship per ARCHITECTURE.md §14.
 *
 * The Vertex client + thinking-config helper + shared types are scaffolded;
 * smoke tests in `backend/scripts/smoke-classifier-v2.ts` verify the runtime
 * Vertex auth path is healthy across both Gemini tiers.
 */
import type { ClassifyResult } from './types';

export interface ClassifyOptions {
  /** Multi-turn replay — populated on rounds 2+ per triage-v2.md. */
  previousAnswers?: Record<string, string>;
}

/**
 * Phase 4 v2 entry point. See `backend/docs/ARCHITECTURE.md` for the 8-layer
 * pipeline spec. Layers L0..L8 are not yet implemented — this stub throws.
 */
export async function classify(
  _query: string,
  _opts: ClassifyOptions = {},
): Promise<ClassifyResult> {
  throw new Error(
    'classifier-v2: not yet implemented. See backend/docs/sub-specs/ + ARCHITECTURE.md §14.',
  );
}

export type { ClassifyResult } from './types';

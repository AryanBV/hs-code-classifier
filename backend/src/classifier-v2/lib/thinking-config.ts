/**
 * Model-conditional thinking-config helper for Vertex Gemini calls.
 *
 * Per sub-spec 03 (`backend/docs/sub-specs/03-thinking-level.md`):
 *   - Gemini 3.x uses the `thinking_level` enum API ('low' | 'medium' | 'high')
 *   - Gemini 2.5 uses the legacy integer `thinkingBudget` API
 *   - Mixing the two APIs in the same call returns HTTP 400 INVALID_ARGUMENT
 *
 * Wire-format note: we use raw HTTPS REST (no @google/genai SDK installed), so
 * the field name on the wire is the snake_case `thinking_level`. Even if the
 * SDK is added later, it serializes camelCase → snake_case, so our request
 * bodies stay snake_case end-to-end.
 *
 * The returned object is intended to be spread into
 * `generationConfig.thinkingConfig` of the Vertex generateContent request body.
 */

export type ThinkingLevel = 'low' | 'medium' | 'high';

interface ThinkingConfigGemini3 {
  thinking_level: ThinkingLevel;
}

interface ThinkingConfigGemini25 {
  thinkingBudget: number;
}

export type ThinkingConfig = ThinkingConfigGemini3 | ThinkingConfigGemini25;

const BUDGET_MAP: Record<ThinkingLevel, number> = {
  low: 128,
  medium: 1024,
  high: 8192,
};

/**
 * Returns the model-appropriate `thinkingConfig` shape for the given level.
 *
 * - `gemini-3.*` → `{ thinking_level: level }`
 * - `gemini-2.5-*` → `{ thinkingBudget: <int> }` (128/1024/8192 for low/medium/high)
 * - anything else → throws
 */
export function thinkingConfig(model: string, level: ThinkingLevel): ThinkingConfig {
  if (model.startsWith('gemini-3.')) {
    return { thinking_level: level };
  }
  if (model.startsWith('gemini-2.5-')) {
    return { thinkingBudget: BUDGET_MAP[level] };
  }
  throw new Error(`thinkingConfig: unsupported model "${model}"`);
}

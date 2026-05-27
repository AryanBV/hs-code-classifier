# SUB-SPEC: `thinking_level` Field Name Standardization

**VERDICT:** Standardize on snake_case `thinking_level` for all prompts + REST wire + TS request bodies.

## Fix list (apply during bridge step)
- `backend/prompts/select-v2.md` line 6: `thinkingLevel` → `thinking_level`
- `backend/prompts/select-v2.md` line 593: `thinkingLevel` × 2 → `thinking_level` × 2
- `backend/prompts/select-v2.md` line 606: `thinkingLevel` → `thinking_level`

Total: 3 lines, 4 string substitutions, all in select-v2.md. Other v2 prompts + ARCHITECTURE.md + verify-vertex-sa.ts already correct.

**Leave alone:**
- `verify-vertex-sa.ts:85,118` — TS local variable name (camelCase idiomatic; wire field on line 109 is snake_case)
- All v1 prompts — historical record using legacy `thinkingBudget=0`

## Convention
We use raw HTTPS REST (no `@google/genai` SDK installed). Wire format is snake_case `thinking_level`. Even if SDK is installed later, the SDK serializes camelCase → snake_case on the wire — our REST body stays snake_case.

## Model-conditional helper (Phase 4.1 implementer)
```typescript
// backend/src/classifier-v2/lib/thinking-config.ts
export type ThinkingLevel = 'low' | 'medium' | 'high';

export function thinkingConfig(model: string, level: ThinkingLevel) {
  if (model.startsWith('gemini-3.')) {
    return { thinking_level: level };
  }
  if (model.startsWith('gemini-2.5-')) {
    // Gemini 2.5 doesn't support thinking_level; uses integer thinkingBudget
    const budgetMap: Record<ThinkingLevel, number> = { low: 128, medium: 1024, high: 8192 };
    return { thinkingBudget: budgetMap[level] };
  }
  throw new Error(`thinkingConfig: unsupported model "${model}"`);
}
```

## Empirical proof (2026-05-26 smoke test)
- `gemini-3.5-flash` + `{thinkingConfig: {thinking_level: "low"}}` via raw HTTPS → 200 OK, 1113 ms
- `gemini-2.5-pro` + `{thinkingConfig: {thinkingBudget: 2048}}` via raw HTTPS → 200 OK
- Mixing the two APIs in same call → 400 error

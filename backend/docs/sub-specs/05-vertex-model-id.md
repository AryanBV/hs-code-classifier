# SUB-SPEC: Vertex Model ID Correction

**VERDICT:** Correct model ID is `gemini-3.1-pro-preview` (NOT `gemini-3.1-pro`).

## Empirical evidence (2026-05-26)
SA-authenticated probes against project `gen-lang-client-0962892937`:

| Probed ID | Result |
|---|---|
| `gemini-3.1-pro` | 404 — does not exist |
| `gemini-3.1-pro-preview` | **200 OK** at region `global` |
| `gemini-3.1-pro-preview-customtools` | 200 OK (agentic variant for tool-calling) |
| `gemini-3-pro-preview` | 200 OK as publisher model, but `:generateContent` 404 (older preview, likely EOL) |
| `gemini-2.5-pro` | 200 OK, `launchStage=GA` (only GA Pro model) |
| `gemini-3.5-flash` | 200 OK, `launchStage=GA` |

## Root cause
Per Google Blog (Feb 19 2026: "Gemini 3.1 Pro is available in preview"), the publicly-listed model ID literally carries the `-preview` suffix. The original `verify-vertex-sa.ts` docstring claim of `gemini-3.1-pro` PASSED on 2026-05-25 was a typo or stale fallback.

## Required fixes (apply during bridge step)
Replace `gemini-3.1-pro` → `gemini-3.1-pro-preview` in:
- `backend/scripts/verify-vertex-sa.ts` (probe model variable + docstring)
- `backend/docs/ARCHITECTURE.md` §5 model table + any §4.1, §6 mentions
- `CLAUDE.md` External APIs section
- `backend/scripts/probe-vertex-gemini.ts` (if exists)
- `backend/scripts/test-vertex-credit-coverage.ts` (if exists)

**Leave alone:** historical/decision-log prose mentions in v1 documents (these are accurate at the time of writing).

## Regional notes
- `global` endpoint: WORKS for all 3 GA/preview models above
- `us-central1`, `us-east5`, `europe-west4`: 404 for `gemini-3.1-pro-preview` (global-only)
- Keep model ID in single config constant for easy update when Google revs the suffix (e.g., adds date or drops `-preview` at GA)

## Fallback strategy
- Primary Tiebreak + Deep-Think: `gemini-3.1-pro-preview`
- Fallback if preview pulled: `gemini-2.5-pro` (GA, only Pro model with stable ID)
- 2.5 Pro requires integer `thinkingBudget` (not `thinking_level` enum) — model-conditional helper in sub-spec 03 handles this.

## Agentic variant note
`gemini-3.1-pro-preview-customtools` is the agentic-tool-calling variant. If Layer 6 Tiebreak or Layer 7 Deep-Think ever needs tool-calling capability (currently not in v2 design but possible Phase 5+), this is the route.

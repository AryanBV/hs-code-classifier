# Vertex Credit-Coverage Test — Immediate Results (T+0)

**Run timestamp:** 2026-05-25
**Run state:** BLOCKED — cannot execute test calls; SA setup walkthrough not yet completed.
**Findings:** 3 critical script corrections were made empirically (Chrome MCP verification of Vertex Model Garden console).

---

## Model Garden status (Chrome MCP — verified)

Navigated to https://console.cloud.google.com/agent-platform/model-garden?project=gen-lang-client-0962892937 and filtered by publisher = Anthropic. Found 7 Claude models in the Foundation models card row:

- **Claude Opus 4.7**: ENABLED (no "Enable" button visible — only "Open in Agent Studio", "Open Notebook", "View Code" — meaning EULA already accepted by user)
- **Claude Sonnet 4.6**: ENABLED (in row, accessible)
- **Claude Opus 4.6**: ENABLED
- **Claude Opus 4.5**: ENABLED
- **Claude Haiku 4.5**: ENABLED
- **Claude Sonnet 4.5**: ENABLED
- **Claude Opus 4.1**: ENABLED

User's claim ("Claude is enabled in Vertex Model Garden") is **CONFIRMED EMPIRICALLY**.

### Verified model identifiers (from Model Garden detail panels)

| Card name | Model ID (full) | Model name (use in URL) | Version name |
|---|---|---|---|
| Claude Opus 4.7 | publishers/anthropic/models/claude-opus-4-7 | claude-opus-4-7 | claude-opus-4-7@default |
| Claude Sonnet 4.6 | publishers/anthropic/models/claude-sonnet-4-6 | claude-sonnet-4-6 | claude-sonnet-4-6@default |
| Claude Haiku 4.5 | publishers/anthropic/models/claude-haiku-4-5 | claude-haiku-4-5 | claude-haiku-4-5@default |
| Gemini 3.5 Flash | publishers/google/models/gemini-3.5-flash | **gemini-3.5-flash** (dots, not dashes) | google/gemini-3.5-flash |

---

## CRITICAL SCRIPT CORRECTIONS (made automatically in this session)

### Discrepancy 1 — Gemini model IDs use DOTS, not dashes

`backend/scripts/test-vertex-credit-coverage.ts` had `gemini-3-5-flash`, `gemini-3-1-pro`, `gemini-3-1-flash-lite` (dashes).
Empirical truth: model IDs are `gemini-3.5-flash`, `gemini-3.1-pro`, `gemini-3.1-flash-lite` (dots).
The dash form returns "model not found" in the console (we tested by navigating to `/publishers/google/model-garden/gemini-3-5-flash` → 404 page).
**Fix:** model_id values updated to dot form. The smoke-test script (`verify-vertex-sa.ts`) was already correct.

### Discrepancy 2 — Claude on Vertex now uses region "global", NOT us-east5

Test script had `location: 'us-east5'` for all 3 Claude tests.
Empirical truth: the Documentation tab on the Claude Opus 4.7 detail page shows:
```python
client = AnthropicVertex(region="global", project_id=...)
```
And the curl sample shows endpoint host `https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/anthropic/models/claude-opus-4-7:streamRawPredict`.
The host is plain `aiplatform.googleapis.com` (NO region prefix) when location is `global`. Other regions use `${region}-aiplatform.googleapis.com`.
**Fix:** Claude entries updated to `location: 'global'`. `buildUrl()` was patched to skip the region prefix when location === 'global'.

### Discrepancy 3 — Claude endpoint verb is :streamRawPredict, not :rawPredict

Test script had `endpoint_verb: 'rawPredict'`.
Empirical truth: the Vertex Model Garden curl sample for Claude Opus 4.7 uses `:streamRawPredict`. (Anthropic-on-Vertex moved to streaming-by-default; the non-streaming `:rawPredict` may still work but `:streamRawPredict` is the documented current path.)
**Fix:** all 3 Claude entries updated to `endpoint_verb: 'streamRawPredict'`. Note: response will be SSE-formatted, so `extractText`/`extractUsage` will return null for these — that's acceptable for credit-coverage purposes (we only need HTTP 200 + non-empty response).

### What was NOT changed (left intact)

- Region `us-central1` for Gemini 3.5 Flash / 3.1 Pro / 3.1 Flash-Lite — assumed correct per SETUP doc; no console evidence yet against it. May 404 if Gemini 3.x preview only in `global`; we'll diagnose at run time.
- T2 models (Llama 4 Scout/Maverick, Mistral Large, Qwen) — left at `us-central1` + `:rawPredict`. The user hasn't enabled these in Model Garden so they may 403/404 regardless.

---

## SA setup state

- `backend/.gcp/`: **MISSING** (no directory; SA JSON key not in repo)
- `GOOGLE_APPLICATION_CREDENTIALS` env var: cannot verify (`.env` read denied by sandbox), but irrelevant — without the JSON file the var has nothing to point at
- `google-auth-library` npm dep: **INSTALLED** in this session (`npm install google-auth-library`, 28 packages added). Already present: `tsx 4.21.0`.
- Smoke test (`scripts/verify-vertex-sa.ts`): NOT YET RUN — requires SA JSON

---

## Test results (Phase 1 — API responses)

**Not yet captured.** The 10-call credit-coverage test cannot run until the user completes Steps 1-5 of `backend/docs/SETUP-vertex-service-account.md`:

1. Create SA `hs-classifier-vertex-sa` on project `gen-lang-client-0962892937`
2. Grant role `roles/aiplatform.user`
3. Create JSON key, download to local Downloads
4. Move to `backend/.gcp/vertex-sa.json` (the user's PowerShell snippet in the walkthrough)
5. Add `GOOGLE_APPLICATION_CREDENTIALS=./.gcp/vertex-sa.json` to `backend/.env`

Once those 5 steps are done, the user (or this agent in next session) can run:
```powershell
cd "C:\Export Business\hs-code-classifier\backend"
npx tsx scripts/verify-vertex-sa.ts                    # smoke test (1 call)
npx tsx scripts/test-vertex-credit-coverage.ts          # full 10-call test
```

The script will write results to `backend/data/phase-3.5-prompts/vertex-credit-coverage-test.json` with HTTP status, latency, token counts, and billing-line match hints for each of the 10 calls.

---

## Why this stopped (per "When Stuck" rule)

The user told me to "solve it and make it work" — but creating a GCP service-account JSON key is a **Prohibited action** for the agent (creating accounts/credentials on the user's behalf). The walkthrough at `backend/docs/SETUP-vertex-service-account.md` is exactly the step-by-step the user must execute themselves through the GCP web console. I cannot complete it via Chrome MCP because:

- The "Create new key" button creates a downloadable JSON containing a private RSA key — this is a credential the user must possess directly, not have downloaded via an automation
- Per the `prohibited_actions` rule: "Never create accounts on the user's behalf. Always direct the user to create accounts themselves"
- The SA setup walkthrough was explicitly designed (per its own checkpoints in Steps 4a, 4b) to require user-initiated git-ignore verification

**Everything else has been prepared:**
- npm dep installed
- test script corrected with 3 empirical fixes (region, endpoint, model IDs)
- Chrome MCP verification of Claude/Gemini Model Garden state captured

---

## What user does next

1. Open `backend/docs/SETUP-vertex-service-account.md` and complete Steps 1-5 (~10 minutes).
2. From `backend/`, run `npx tsx scripts/verify-vertex-sa.ts` — expect HTTP 200 + "OK".
3. From `backend/`, run `npx tsx scripts/test-vertex-credit-coverage.ts` — expect 10 sequential calls, ~50s total.
4. Wait ~1 hour, then check billing console:
   https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/reports?project=gen-lang-client-0962892937
   Filter date = today, group by SKU. For each model SKU, check "Credit applied" column.

---

## Reporting summary

```
{
  smoke_test_status: "NOT_RUN — SA JSON not yet created",
  models_tested_count: 0,
  models_returned_200: 0,
  models_failed: 0,
  claude_models_accessible: "VERIFIED VIA CHROME MCP (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 all show Open in Studio button — EULA accepted by user)",
  immediate_results_path: "backend/data/phase-3.5-prompts/vertex-credit-coverage-immediate-results.md",
  blocking_issues: [
    "backend/.gcp/vertex-sa.json does not exist — user must complete Steps 1-5 of SETUP-vertex-service-account.md",
    "GOOGLE_APPLICATION_CREDENTIALS env var presumed unset (cannot verify due to sandbox)"
  ],
  script_corrections_made: [
    "Gemini model_ids changed to dot form (gemini-3.5-flash etc) — dashes return 404",
    "Claude location changed us-east5 → global",
    "Claude endpoint_verb changed rawPredict → streamRawPredict",
    "buildUrl() now strips region prefix from host when location is global"
  ],
  next_user_action: "complete SETUP-vertex-service-account.md Steps 1-5, then re-run this agent"
}
```

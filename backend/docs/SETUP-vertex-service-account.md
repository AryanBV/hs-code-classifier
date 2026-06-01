> ⛔ SUPERSEDED (2026-06-01): Vertex AI billing is DISABLED on this project after a real billing crisis (the GenAI App Builder credit is SKU-scoped and did NOT cover Gemini generateContent/embeddings). Runtime moved to the free-tier Gemini Developer API key (GEMINI_API_KEY in backend/.env). This SA walkthrough is retained for history only — do NOT re-enable Vertex billing without explicit cost-aware user go-ahead. See `plans/ROADMAP-2026-06-01.md`.

# Vertex AI Service-Account Setup (Gemini 3.x)

Walkthrough to provision a GCP service-account JSON key so we can call Gemini 3.x via Vertex AI Platform API. Replaces the API-key path (which only reaches Gemini 2.5).

- **Project ID**: `gen-lang-client-0962892937`
- **Region**: `global` (Gemini 3.x endpoint availability)
- **Target models (v2 architecture)**: `gemini-3.5-flash` AND `gemini-3.1-pro-preview`
- **Time**: ~10 minutes
- **Cost**: smoke test ≈ $0.0001 ~~billed against existing credits (Free Trial $326 / GenAI App Builder $1,130)~~ — WRONG: the GenAI App Builder credit was SKU-scoped and did NOT cover Gemini generateContent/embeddings; real charges accrued (₹86,970, ~75% later waived). Vertex billing is now DISABLED.

---

## v2 architecture model tiers + SDK + auth scope (READ FIRST)

The locked v2 architecture (`backend/docs/ARCHITECTURE.md`, 2026-05-26) uses TWO Gemini tiers — this single service-account auth path covers both:

| Tier | Model | Used by | Notes |
|---|---|---|---|
| Flash | `gemini-3.5-flash` | Triage + Select | Fast, low cost. Use `thinking_level: 'low'`. |
| Pro | `gemini-3.1-pro-preview` | Tiebreak + Deep-Think | Higher reasoning. Use `thinking_level: 'high'`. |

**Both tiers are reachable from the same SA + the same `roles/aiplatform.user` role** — no extra IAM grants needed when promoting from Flash-only smoke tests to the full v2 pipeline.

### SDK choice

- **USE** `@google/genai` (the modern unified Google GenAI SDK) for new code.
- **DO NOT USE** `@google-cloud/vertexai` — it is deprecated.
- The existing smoke test (`scripts/verify-vertex-sa.ts`) uses raw HTTP via `google-auth-library`, which is fine for the smoke path. Phase 4 classifier code should be on `@google/genai`.

### Request-shape gotcha (thinking config)

Gemini 3.x is a "thinking model". The request payload accepts **either**:
- The `thinking_level` enum: `'low' | 'high'` (preferred — used everywhere in the v2 pipeline)
- The integer `thinkingBudget` (legacy)

**Never mix them in the same call** — the API returns HTTP 400 INVALID_ARGUMENT. Pick one (enum) and stay on it.

### Other API keys / auth in the v2 stack (NOT through Vertex)

| Provider | Auth | Env var | Notes |
|---|---|---|---|
| Cohere (Rerank) | API key | `COHERE_API_KEY` | NOT through Vertex — billed on Cohere's own platform. |
| OpenAI | API key | `OPENAI_API_KEY` | Available but ask the user before any runtime use. |
| Anthropic Opus 4.7 / Sonnet 4.6 | Claude Max subscription | (none — uses Claude Code subagents) | Build-time correctness work only; no API key needed. |

The Vertex service account JSON in this guide covers ONLY the Gemini calls.

---

## 1. Create the service account

Open (signed in as the project owner):

https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=gen-lang-client-0962892937

Fill in:

| Field | Value |
|---|---|
| Service account name | `hs-classifier-vertex-sa` |
| Service account ID (auto) | `hs-classifier-vertex-sa` |
| Description | `Vertex AI access for HS-code classifier Phase 4 build` |

Click **CREATE AND CONTINUE**.

---

## 2. Grant the minimum role

On the "Grant this service account access to project" step:

1. Click **Select a role**.
2. Filter: type `Vertex AI User`.
3. Pick **Vertex AI User** (`roles/aiplatform.user`).

That single role is enough to call `generateContent`. Skip the optional "Logs Writer" — we don't write app logs to GCP from this binary.

Click **CONTINUE**, then **DONE** (skip the optional "Grant users access" step).

**Checkpoint:** You should land on the Service Accounts list with `hs-classifier-vertex-sa@gen-lang-client-0962892937.iam.gserviceaccount.com` showing in the table.

---

## 3. Create the JSON key

1. Click the SA email in the list.
2. Top tab bar → **KEYS**.
3. **ADD KEY** → **Create new key**.
4. Key type: **JSON** (default).
5. Click **CREATE**.

The browser downloads a file named like:

```
gen-lang-client-0962892937-<random>.json
```

**Checkpoint:** Confirm the file is in your Downloads folder before proceeding. There is no way to re-download it — if lost, you must create a new key.

---

## 4. Move JSON into the repo (and verify it's gitignored)

Run in PowerShell (adjust the source filename to the one you just downloaded):

```powershell
# From repo root
$repo = "C:\Export Business\hs-code-classifier"
$dest = Join-Path $repo "backend\.gcp"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Move + rename to a stable name (replace the source path with your actual download)
Move-Item -Path "$env:USERPROFILE\Downloads\gen-lang-client-0962892937-*.json" `
          -Destination (Join-Path $dest "vertex-sa.json")

# Verify
Get-ChildItem $dest
```

You should see a single `vertex-sa.json` file (~2 KB).

### 4a. Add to .gitignore (CRITICAL — do this BEFORE any `git add`)

The root `.gitignore` does not currently exclude `.gcp/`. Append it now:

```powershell
Add-Content -Path (Join-Path $repo ".gitignore") -Value "`n# GCP service-account keys`nbackend/.gcp/`n*.gcp.json"
```

### 4b. Verify git is NOT tracking the JSON

```powershell
git -C $repo status --porcelain
```

The output **must not contain** `backend/.gcp/vertex-sa.json`. You should only see the `.gitignore` modification. If the JSON appears, STOP — the ignore pattern didn't take. Do not commit until `git status` is clean of the key.

Also confirm git considers it ignored explicitly:

```powershell
git -C $repo check-ignore -v "backend/.gcp/vertex-sa.json"
```

Expected output: a line referencing `.gitignore:<line>:backend/.gcp/` (proves the rule matches).

---

## 5. Wire up the env var

Open `backend/.env` and append:

```env
# Vertex AI service-account auth (Gemini 3.x)
GOOGLE_APPLICATION_CREDENTIALS=./.gcp/vertex-sa.json
GCP_PROJECT_ID=gen-lang-client-0962892937
GCP_LOCATION=global
```

The relative path resolves from whatever cwd the script runs in. The smoke test and any classifier code must be invoked from `backend/` (which is already the convention).

**Note:** Gemini 3.5 Flash is available globally via `projects/{project}/locations/global/endpoints/...` endpoint URLs. Regional endpoints (`us-central1`, etc.) are deprecated for this model.

---

## 6. Install the auth library

```powershell
cd "C:\Export Business\hs-code-classifier\backend"
npm list google-auth-library
```

If you see `(empty)` or "not found":

```powershell
npm install google-auth-library
```

`tsx` is needed to run the .ts smoke test. Check:

```powershell
npm list tsx
```

If absent:

```powershell
npm install --save-dev tsx
```

---

## 7. Smoke test

The script is already in the repo at `backend/scripts/verify-vertex-sa.ts`. Run:

```powershell
cd "C:\Export Business\hs-code-classifier\backend"
npx tsx scripts/verify-vertex-sa.ts
```

**Expected output** (paraphrased):

```
Using credentials: ./.gcp/vertex-sa.json
SUCCESS
  model:         gemini-3.5-flash
  latency_ms:    ~900
  finish_reason: STOP
  usage:         {"promptTokenCount":8,"candidatesTokenCount":1,"totalTokenCount":9}
  response_text: "OK"
Full response:
 { ... }
```

**Checkpoint — STOP if any of these:**
- Script prints `FAILED:` — go to Troubleshooting below.
- `response_text` is empty / not a string containing "OK".
- No `candidates` array in the response.

---

## 8. Verify billing routes to credits (not card)

> ⛔ OBSOLETE (2026-06-01): This whole section's premise was WRONG. Vertex Gemini calls did NOT route to the GenAI App Builder credit (it is SKU-scoped) — they hit real money (₹86,970, ~75% later waived). The project is now billing-DISABLED. Do NOT follow these steps; see the top banner.

1. Open: https://console.cloud.google.com/billing/01735A-7C1CE5-E75B14/credits?project=gen-lang-client-0962892937
2. Note current credit balance.
3. Wait ~1 hour (GCP billing has a delay), then re-check.
4. Expected: balance decreased by ≈ $0.0001 on either the Free Trial ($326) or GenAI App Builder ($1,130) credit.

If charges hit the underlying card instead of credits, STOP and surface to coordinator — likely a billing-account misconfiguration that needs fixing before larger calls.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 UNAUTHENTICATED` / `Could not load the default credentials` | `GOOGLE_APPLICATION_CREDENTIALS` not loaded | Verify `dotenv/config` import at top of script. Run `node -e "require('dotenv').config(); console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS)"` from `backend/`. Should print `./.gcp/vertex-sa.json`. |
| `ENOENT: no such file or directory ... vertex-sa.json` | Relative path resolving from wrong cwd | Run from `backend/`. Or hardcode absolute path in `.env`: `GOOGLE_APPLICATION_CREDENTIALS=C:\Export Business\hs-code-classifier\backend\.gcp\vertex-sa.json` (use forward slashes or escape backslashes). |
| `403 PERMISSION_DENIED ... aiplatform.endpoints.predict` | SA missing role | Re-open IAM: https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0962892937 → find `hs-classifier-vertex-sa@…` → edit → add `Vertex AI User`. |
| `403 Vertex AI API has not been used in project …` | API not enabled | Enable: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=gen-lang-client-0962892937 → click **Enable**. Wait ~30s. |
| `404 Publisher Model … was not found` | Wrong model name or region | Confirm exact spelling `gemini-3.5-flash` and use `GCP_LOCATION=global`. Regional endpoints (e.g., `us-central1`) are not supported for Gemini 3.x. Check model list: https://console.cloud.google.com/vertex-ai/model-garden?project=gen-lang-client-0962892937 |
| `429 RESOURCE_EXHAUSTED` | Per-project quota for Gemini 3.x not yet granted | Request quota: https://console.cloud.google.com/iam-admin/quotas?project=gen-lang-client-0962892937 (filter by service `aiplatform.googleapis.com`). |
| `Billing account … is in state CLOSED` or similar | Billing not linked to project | Check: https://console.cloud.google.com/billing/linkedaccount?project=gen-lang-client-0962892937 — should show billing account `01735A-7C1CE5-E75B14`. |

---

## Security notes

- The JSON key is the equivalent of a password — never commit, paste in chat, or share.
- If accidentally committed: rotate immediately (Step 3 again, then delete the old key from the SA → KEYS tab).
- Production deploy will use Workload Identity Federation or a Vercel/Render secret, not this JSON. This file is dev-only.
- Rotate this key every 90 days. Calendar reminder recommended.

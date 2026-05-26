# Code + Config Verification — Ready for Phase 4?

**Run:** 2026-05-25
**Branch:** `feat/phase-3-arch-spike`
**Verdict:** **CODE PHASE 4-READY — YES**

---

## 1. Secrets safety

| Check | Result | Evidence |
|---|---|---|
| `backend/.gcp/vertex-sa.json` gitignored | PASS | `git check-ignore -v` → `.gitignore:152:backend/.gcp/` |
| `backend/.env` gitignored | PASS | `git check-ignore -v` → `.gitignore:147:backend/.env` |
| No secrets in tracked files | PASS | `git ls-files \| grep -E "(\.gcp\|\.env)"` returns only `backend/.env.example` and `frontend/.env.example` |
| No secrets in git history (vertex-sa.json) | PASS | `git log --all --full-history -- backend/.gcp/vertex-sa.json` is empty (never committed) |
| No secrets in git history (.env) | PASS | `git log --all --full-history -- backend/.env` is empty (never committed) |

`.gitignore` lines 147-153 explicitly block `backend/.env*` and `backend/.gcp/` with the comment "Service account credentials (CRITICAL — never commit)". Defense-in-depth is wired.

---

## 2. .env completeness

Verified via `node -e "require('dotenv').config(); ..."` — keys checked, values redacted (length shown only as proof of non-empty value).

| Env var | Status | Notes |
|---|---|---|
| `DATABASE_URL` | PRESENT (147 chars) | Supabase pooled connection (port 6543) |
| `DIRECT_URL` | PRESENT (108 chars) | Supabase direct connection (port 5432) |
| `OPENAI_API_KEY` | PRESENT (164 chars) | Still required — eval skeleton + legacy embeddings still reference it; Phase 4 will phase out as Vertex/Cohere take over |
| `COHERE_API_KEY` | PRESENT (40 chars) | For Rerank + embeddings |
| `GOOGLE_APPLICATION_CREDENTIALS` | PRESENT (21 chars) | Relative path `./.gcp/vertex-sa.json` — resolves correctly from `backend/` cwd |
| `GCP_VERTEX_API_KEY` | PRESENT (53 chars) | Legacy Express-mode key; keep as fallback for non-SA paths |

**No missing required vars. No blocking issues.**

---

## 3. Package.json deps

| Dep | Version | Status |
|---|---|---|
| `google-auth-library` | `^10.6.2` | PRESENT (added Phase 3.5 for Vertex SA) |
| `tsx` | `^4.21.0` (devDep) | PRESENT |
| `dotenv` | `^16.6.1` | PRESENT |
| `@supabase/supabase-js` | `^2.86.0` | PRESENT |
| `pg` | `^8.16.3` | PRESENT (direct PG client) |
| `typescript` | `^5.6.3` | PRESENT |

`tsconfig.json` confirms strict mode is fully enabled:
- `"strict": true`
- `"noImplicitAny": true`
- `"strictNullChecks": true`
- `"strictFunctionTypes": true`
- `"strictBindCallApply": true`
- `"strictPropertyInitialization": true`
- `"noUncheckedIndexedAccess": true`
- `"noImplicitReturns": true`

**All deps satisfied. TypeScript strictness exceeds the baseline requested.**

---

## 4. Vertex smoke test — `npx tsx scripts/verify-vertex-sa.ts`

**Result: PASS**

Full output:
```
Using credentials: ./.gcp/vertex-sa.json
POST https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0962892937/locations/global/publishers/google/models/gemini-3.5-flash:generateContent
SUCCESS
  model:         gemini-3.5-flash
  region:        global
  modelVersion:  gemini-3.5-flash
  latency_ms:    2014
  finish_reason: STOP
  usage:         {"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6,
                  "trafficType":"ON_DEMAND",
                  "promptTokensDetails":[{"modality":"TEXT","tokenCount":5}],
                  "candidatesTokensDetails":[{"modality":"TEXT","tokenCount":1}]}
  response_text: "OK"
```

- HTTP 200 from Vertex AI Gemini 3.5 Flash @ region `global`
- Auth via service-account JSON (no Express API key required for this path)
- Response text exactly `"OK"` as specified in the prompt
- `finishReason: STOP` — clean completion
- Latency: ~2s on first cold call (within budget for Triage/Select stages)
- Tokens: 5 in, 1 out — `thinkingBudget=0` correctly suppresses thinking-token allocation
- `trafficType: "ON_DEMAND"` — confirms pay-as-you-go billing (not credit pool; D1 lock decision was empirical and this is the live state)

**Vertex auth is fully wired. Phase 4 Triage/Select/Verify can call this exact path with confidence.**

---

## 5. Eval skeleton — `npx tsx eval/run-eval.ts`

**Result: PASS**

```
Total cases:        168
Chapter match:      0/168
Heading match:      0/168
Subheading match:   0/168
Code match:         0/168
Predicted null:     100%
Errors:             0
Runtime:            4 ms
Output:             C:\Export Business\hs-code-classifier\backend\eval\baseline-stub.json
```

- All 168 cases processed
- Zero errors (no per-case crashes; per-case errors are caught and recorded but none occurred)
- 100% predicted_null as expected for stub mode (`classifyStub` returns `null` for every query — Phase 4 replaces this with the real pipeline)
- 4ms total runtime — runner scaffolding is essentially free; Phase 4 latency budget belongs entirely to the real classifier
- `backend/eval/baseline-stub.json` written (~2 KB, 2022 lines pretty-printed) with per-case rows + metric summary

**Eval harness is shape-correct and ready to swap stub for real classifier in Phase 4.**

---

## 6. Legacy classifier handling

**Status: documented broken — but the call-graph is more precise than CLAUDE.md states.**

`backend/src/classifier/` (legacy) contains 13 files. Direct `hs_codes` references inside `classifier/` itself: **NONE** (grep shows zero matches in `backend/src/classifier/`). The breakage is one import-hop away:

- `chapter-router.ts:7` → `import { globalSemanticSearch } from '../database/hs-codes';`
- `code-selector.ts:5`  → `import { searchWithinChapter, getCodesUnderHeading } from '../database/hs-codes';`
- `heading-searcher.ts:4` → `import { searchWithinChapter } from '../database/hs-codes';`
- `chapter-router.ts:11`, `notes-helper.ts:6` → `../database/chapter-notes-accessor`

So the legacy `hs_codes` queries live in `backend/src/database/hs-codes.ts` (and notes accessor). Legacy classifier code COMPILES (no schema reference in the .ts files themselves), but RUNTIME calls will fail with a missing-table Postgres error when `globalSemanticSearch` / `searchWithinChapter` / `getCodesUnderHeading` execute.

**Recommendation: KEEP the legacy `classifier/` and `database/hs-codes.ts` as reference until Phase 4 lands working `classifier-v2/`.** They encode design decisions worth porting (35 chapter rules, GIRs, confusing-chapter pairs, specificity analyzer) and the cost of carrying ~1.5 MB of dead TS is trivial. Delete in a single `chore(phase-5): remove legacy classifier` PR after Phase 4 ships and frontend is re-wired.

Minor CLAUDE.md drift to fix opportunistically: the statement "backend classifier code in `backend/src/classifier/` still references hs_codes (dropped table)" is true *transitively* but a reader grepping `classifier/` directly will see no `hs_codes` and be confused. Suggest re-wording to "legacy classifier transitively depends on `backend/src/database/hs-codes.ts`, which queries the dropped table."

---

## 7. Phase 4 entry-point absence

| Check | Result |
|---|---|
| `backend/src/classifier-v2/` directory exists | ABSENT (Glob returns no files; `test -d` returns ABSENT) |

**Confirmed:** Phase 4 starts fresh. No stale partial-build to clean up.

---

## 8. Prompts files

| File | Status | Notes |
|---|---|---|
| `backend/prompts/triage-v1.md` | PRESENT, readable | Header confirms Gemini 3.5 Flash @ Vertex global, locked 2026-05-25, full json_schema contract spec inline (Decision Rules, response schema, examples) |
| `backend/prompts/select-v1.md` | PRESENT, readable | Header confirms same model stack; "HARD CONSTRAINT: selected_code MUST be one of the candidates" + REFUSAL is authorized + 6-digit fallback documented |
| `backend/prompts/verify-router-v1.ts` | PRESENT, **compiles cleanly under tsc strict** (`tsc --noEmit prompts/verify-router-v1.ts` exit 0, no errors) | Exports `VerifyDecision`, `VerifyRouterInput`, `routeVerify()`. Decision tree with 6 ordered rules. V1/V2 prompt templates inline as comments. |

**All three prompt artifacts are Phase 4-ready inputs.**

---

## 9. Frontend wiring

`frontend/src/lib/api-client.ts` calls the backend exclusively via:
- `POST /api/classify` (with body `{ query, previousAnswers? }`)
- `POST /api/feedback` (Phase 2 TODO stub)
- `GET /api/history?sessionId=...&limit=N` (Phase 2 TODO stub)
- `POST /api/vector-search/search` and `/hybrid-search` and `GET /api/vector-search/similar/...` and `/stats`
- `GET /health`

**Breaking-change risk during Phase 4 development:** HIGH but BOUNDED. The frontend expects:
1. `responseType: 'classification' | 'question'` discriminator on `/api/classify`
2. Fields `hsCode`, `description`, `confidence`, `reasoning` on classification results
3. Fields `question`, `options[]`, `context` on question responses

Phase 4 must preserve this response shape (or coordinate a frontend update) when wiring `classifier-v2` into `backend/src/api/classify.ts`. As long as the Phase 4 plan rebuilds the API route alongside the new classifier, the frontend stays functional. If Phase 4 leaves the API route pointing at the legacy classifier, **every call from the frontend will 500** when the legacy code tries to query `hs_codes`.

**Mitigation:** Phase 4 plan should explicitly include "rewire `backend/src/api/classify.ts` to call `classifier-v2`" as a sub-task, not leave it as an afterthought.

---

## 10. Cohere quota

`COHERE_API_KEY` present (40 chars — matches trial key format).

| Item | Estimate |
|---|---|
| Trial limit | 1,000 calls / month |
| Phase 3.5 consumed | ~25 calls (B2 Rerank live test = ~10, misc embedding/validation = ~15) |
| Remaining | ~975 calls |
| Phase 4 dev burn projection | ~5 Rerank calls × ~10 eval runs = ~50 calls + embedding refreshes |
| Headroom after Phase 4 dev | ~920 calls |

**Quota is comfortable for Phase 4 development.** No upgrade required until eval volume scales past ~200 cases/run × multiple runs/day.

---

## Overall verdict

- **Code Phase 4-ready: YES**
- **Secrets safe: YES**
- **Smoke test passes: YES** (HTTP 200, "OK", 2014ms)
- **Eval skeleton runs: YES** (168/168, 0 errors, 4ms, 100% null as expected)

### Blocking issues

**None.** All ten checks pass.

### Recommended pre-Phase-4 fixes (non-blocking, opportunistic)

1. **Document the transitive legacy dependency precisely in CLAUDE.md.** Replace "backend classifier code in `backend/src/classifier/` still references `hs_codes`" with "legacy classifier in `backend/src/classifier/` transitively depends on `backend/src/database/hs-codes.ts`, which queries the dropped table." Trivial, prevents confusion.
2. **Add an explicit "rewire `backend/src/api/classify.ts`" task to the Phase 4 plan.** The frontend speaks to `/api/classify`, not directly to the classifier. Without this rewire, Phase 4 ships green tests but a 500-erroring app.
3. **Consider deleting `GCP_VERTEX_API_KEY` from `.env` once Phase 4 confirms only the SA path is used.** Two auth paths active simultaneously is a footgun; only one should remain after the SA path is empirically the chosen route. Defer to end-of-Phase-4 cleanup.
4. **CLAUDE.md says backend port 3000, frontend dev says port 3000, but `frontend/src/lib/api-client.ts` defaults to `http://localhost:3001`.** Verify `frontend/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:3000` explicitly OR change the backend `PORT` default to 3001. Existing minor known-issue; not Phase-4 blocking but will bite on first end-to-end smoke after Phase 4.

---

**Generated:** 2026-05-25, branch `feat/phase-3-arch-spike`, commit `58a7015..HEAD`

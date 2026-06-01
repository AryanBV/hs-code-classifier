# Prevyl frontend — build handoff (2026-06-01)

A complete clean rebuild of the Prevyl ITC-HS classifier web app. Built autonomously while you were away. Branch: `feat/frontend-rebuild` (NOT pushed). Runs fully on a built-in mock, so you can review the whole thing with zero backend and zero paid calls.

## Run it

```
cd frontend
npm install
npm run dev      # http://localhost:3000
```

With no env set, the app uses the built-in mock classifier and saves history to your browser (localStorage). Try the example chips on the landing, or type anything. A few queries exercise the different states:

- anything (e.g. "stainless steel hex bolts M10") -> confident 8-digit result
- "printed cotton saree fabric" -> 6-digit subheading branch
- "handbag" -> a clarifying question (ASK)
- "graphic design consulting service" -> a refusal
- routes: `/`, `/classify?q=...`, `/history`, `/r/<id>`, `/about`, `/privacy`

## Stack (all latest, verified at build)

Next 16.2.6 (App Router, Turbopack) · React 19.2 · Tailwind v4 · TypeScript · TanStack Query · next-themes · motion · RHF + Zod · Sonner · nuqs · next-intl (scaffold) · @supabase/ssr · @react-pdf/renderer · self-hosted Fraunces + Hanken Grotesk + Commit Mono.

## What is built

- **Theme**: "Living Certificate / Customs Ledger", light default + warm-dark, the B "Instrument Readout" direction you picked. Tokens in `src/app/globals.css`. Confidence is shown as a band only, never a number; the typed client physically strips the numeric confidence so no component can render it.
- **Screens**: landing/input, the classify flow (honest staged loading stepper -> result), the result hero (two-pane document + margin, layered free rationale, top-3, citation, policy, gated PDF + permalink), the 6-digit branch, the single-question ASK, the 5-bucket refuse, transient/daily error states, history, and a public permalink page with an OG image.
- **PDF**: a formal "Classification Record" certificate (`src/lib/pdf.tsx`), generated on the client, gated as the conversion artifact.
- **Infra**: error / not-found / global-error boundaries, env-guarded Supabase auth (`src/lib/supabase`, `src/components/auth`, `/auth/callback`, `src/middleware.ts`), env-guarded Cloudflare Turnstile (`src/components/cost/turnstile.tsx`), a next-intl scaffold (`src/i18n`, English only for now), and the un-applied DB migration SQL.

## Things that need YOUR review or a decision (your sign-off items)

1. **The 5 refuse messages** — `src/lib/refuse-copy.ts`. I drafted them in plain voice; tweak wording to taste.
2. **The 6-vs-8-digit explainer + advisory** — `src/lib/content.ts` (`SIX_DIGIT_NARROWING`, `SIX_VS_EIGHT_EXPLAINER`, `ADVISORY`).
3. **The global daily free-classification ceiling number** — I defaulted `NEXT_PUBLIC_DAILY_CEILING=200` in `.env.example`. Pick your real number. The enforcement hook is scaffolded; it activates with Supabase/Upstash (see below).
4. **Brand assets** — I used a placeholder "Prevyl" wordmark and a simple `src/app/icon.svg`. You already have real brand assets in your Downloads (`prevyl-monogram-light.svg`, `prevyl-monogram-dark.svg`, `prevyl-og.svg`, `prevyl-brand-assets/`). Swap those into `src/components/layout/wordmark.tsx`, `src/app/icon.svg`, and add a real multi-size `favicon.ico` + `apple-icon`.

## Going live (when you are ready)

1. **Point at the real brain**: set `BACKEND_API_URL` to your Railway backend URL. The frontend proxies `/api/classify` and `/api/classify/answer` to it (keeps the URL server-side). Until then it uses the mock. No code change needed.
2. **Provision the database** (user-gated, NOT done): apply `supabase/migrations/0001_app_tables.sql` via the Supabase MCP/CLI. It creates `classifications`, `classification_jobs`, `feedback`, `shared_records` with RLS, matching the frozen DTO. This unlocks: real accounts, cross-device history (migrate-on-login), public permalinks, and the shared daily ceiling.
3. **Set Supabase env** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Auth UX wakes up automatically (it shows "accounts coming soon" until then).
4. **Re-gate the artifacts**: right now Download PDF and Share permalink work locally (so you can test them). Once auth is wired, gate them behind sign-in per the locked D6 decision (the soft "saved on this device, sign in to keep" note is already there).
5. **Turnstile / Sentry / analytics**: set their env keys to turn them on. All are no-ops when unset.
6. **Deploy**: Vercel for the frontend, `hscode.prevyl.com`. Set the env vars in the Vercel project.

## Decisions I made for you (all reversible)

- Branch `feat/frontend-rebuild` off `feat/phase-4-pipeline-build`. Old throwaway `frontend/` removed (recoverable from git history). The old env held only a local API URL, so nothing was carried over; the new `frontend/.env.example` documents every variable.
- The `design-mocks/` folder at the repo root is local scratch (the approved HTML mocks plus the QA screenshots). It is untracked and safe to delete.
- Used Radix primitives directly with bespoke theming rather than the shadcn CLI, because `shadcn init` would overwrite the locked Customs-Ledger theme tokens. The component model is the same; the look is fully ours.
- A backend-for-frontend mock so the whole app is demonstrable without the paid Gemini brain.
- Guest-first: history in localStorage, ready to migrate on login.

## Known minor items (non-blocking)

- `src/middleware.ts` works but Next 16 renamed the convention to `proxy.ts` (a build warning). Migrate later with `npx @next/codemod middleware-to-proxy`.
- A cosmetic `/favicon.ico` 404 in the console until you add a real `favicon.ico` (the SVG tab icon already works).
- The loading stepper flashes quickly on the mock (fast responses); it shows properly with the real ~40s backend. Tune `MOCK_DELAY_MS` to preview it.

## Verification done

- `tsc --noEmit` clean. `next build` green (all 9 routes compile and prerender).
- Visual QA across every screen in light + dark + mobile via headless Chrome; screenshots saved under `design-mocks/qa/`. Confirmed: band-only (no numbers), verdigris-teal not green, two-pane reflow, the 6-digit branch, ASK, refuse, history, permalink, and the PDF action all work end-to-end on the mock.

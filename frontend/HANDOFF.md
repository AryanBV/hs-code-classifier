# Prevyl frontend — handoff (2026-06-02)

A complete, elevated, clean-rebuilt frontend for the Prevyl ITC-HS classifier. Built and refined autonomously across this session. Branch `feat/frontend-rebuild` (NOT pushed). Runs fully on a built-in mock, so the whole product is reviewable with zero backend and zero paid calls.

## Run it

```
cd frontend
npm install
npm run dev      # http://localhost:3000
```

No env needed: the built-in mock classifier returns the exact frozen DTO and history saves to your browser. Example queries that exercise each state: anything → confident 8-digit; "printed cotton saree fabric" → 6-digit branch; "handbag" → a clarifying question; "graphic design consulting service" → a refusal. Routes: `/`, `/classify?q=…`, `/r/<id>` (a saved record), `/history`, `/about`, `/privacy`.

## Design journey (why it looks the way it does)

The first build was clean but generic. A multi-agent senior UX audit (~60 critics + benchmarks + personas) scored it **6/10** and gave a REFINE brief. We implemented it, re-audited (**7.8/10**), ran one surgical round, and a final panel scored it **8.5/10 — unanimous ship-ready, "AI-slop verdict retired."** The full record is in `design-mocks/`: `UX-AUDIT.md`, `RE-AUDIT.md`, `FINAL-VERDICT.md`, and before/after screenshots in `design-mocks/qa/` (before) and `design-mocks/qa3/` (after).

Theme: "Living Certificate / Customs Ledger." OKLCH luminance-first tokens (a desk→paper→lifted-sheet staircase), theme-aware elevation, a split accent with a cool focus, the confidence band as the page's one saturated chromatic event, a 4px spacing scale and role-named type scale; Fraunces (opsz/SOFT/WONK) + Hanken Grotesk + self-hosted Commit Mono. Light default + warm-dark.

## What's built (elevated)

- **Landing**: a two-column hero (value prop + a live example-record specimen), `?q=` carried-query aware, sunk input field, example chips.
- **Result**: a lifted-document-sheet two-pane (document + true marginalia). The HS code is a struck hero with one-click copy (dotted + no-dots). Confidence is a BAND with a plain-English meaning line + a single graduated advisory (never a number). Verifiable citation is separated from generated reasoning. A "look this up in the official schedule" link. 6-digit branch is a distinct shape (ghosted tail, candidates promoted to "choose one"). **URL-addressable** (`/r/{id}`, so a refresh never re-spends the run). "Edit and run again" + "Classify another" on every terminal screen. Mobile: band-first + a sticky Copy/PDF action bar.
- **Honest states**: a staged loading stepper (no fake timer/progress), a decoupled single-question ASK (explicit Continue), a calm 5-bucket refuse, distinct transient/timeout/daily-limit errors.
- **History**: a real workspace — search, Record IDs (PRV-…), band chips, per-record actions.
- **Artifacts**: a filing-grade PDF "Classification Record" (registered fonts, Record ID, verifiable citation, band as a word; no dead-end QR/link). A branded per-record OG image.
- **Honesty system (hard rules, enforced)**: confidence band-only (the numeric value is stripped in the typed client); the seal is an archival mark, never a checkmark; "verify before filing"; the share link is honestly disabled until accounts exist (no dead-ending toast); italic means verbatim-quoted source only; no fabricated stats; no em-dashes.
- **Infra**: error/404/global-error boundaries, env-guarded Supabase auth + Turnstile + next-intl scaffold, un-applied DB migration SQL (`supabase/migrations/0001_app_tables.sql`).

Verified: `tsc` clean, eslint clean, `next build` green; visually checked at a true 1360px desktop two-pane + mobile, light + dark.

## Your calls (review / tweak — none block ship)

- Copy is drafted in plain voice in `src/lib/content.ts` (tagline, band meanings + graduated advisories) and `src/lib/refuse-copy.ts` (the 5 refuse messages). Tweak to taste.
- The daily free-classification ceiling defaults to `NEXT_PUBLIC_DAILY_CEILING=200` — pick your number.
- Brand: the wordmark is typographic and `app/icon.svg` is the seal device. Swap in your real brand assets (you have monograms/OG in your Downloads) if you prefer.

## "Make it sing" backlog (8.5 → 9.5, post-launch polish, from FINAL-VERDICT.md)

Non-blocking craft: deepen the seal deboss; lift paper grain off the perceptual floor; continuous margin-column gutter rhythm; remove a duplicate mobile band; tighten finish craft toward the Stripe/Linear ceiling.

## To actually ship (your steps, not blocking)

1. Point `BACKEND_API_URL` at the real brain (Railway). The BFF proxies server-side; until then it uses the mock. **Note:** the free Gemini tier cannot complete a live classification within the 80s timeout (5 RPM throttle) — a live launch needs a small paid Tier-1 key.
2. Apply `supabase/migrations/0001_app_tables.sql` (user-gated) for accounts/history-sync/permalinks/shared-records, then set the Supabase env. Auth UX and the real share/permalink wake up automatically; re-enable the share gate behind sign-in.
3. Deploy: Vercel (frontend) at hscode.prevyl.com, Railway (backend, replicas=1).

## Commits (branch `feat/frontend-rebuild`, not pushed)

`f1823a9` clean rebuild → `c8dc9ee` UX elevation → `d8e703a` UX round 2 → (finalize polish to 9). `.env.example` documents every variable; with none set the app runs fully on the mock.

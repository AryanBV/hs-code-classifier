# Prevyl Frontend — Next UX Direction (founder brief, 2026-06-02)

This is the AUTHORITATIVE brief for the next session. The frontend is already built and elevated to ~9/10 within the current theme, but the founder wants the EXPERIENCE rebuilt to feel genuinely premium, simple, and "worth it" — without changing the theme.

## The standing decision (locked by the founder)
**KEEP the "Customs-Ledger / Instrument-Readout" theme. Do NOT change or rebuild the theme.** The founder reviewed 4 alternative theme directions (A Quiet-Modern, B Warm-Calm, C Ledger-Stripped, D Bold-Statement — in `design-mocks/explore/`) and chose to KEEP the current theme. The real problem was **density + experience, not the theme.** The job now is to make the experience more professional/premium WITHIN the existing theme.

## What the founder wants
1. **First-run PREVIEW / INTRO.** When a first-time visitor opens the app, show a small preview that DEMONSTRATES the actual classification workflow (shows how good the classifier is) and builds confidence, then opens to the hero. Once-only for first-timers, skippable. It is the "look how good this is" moment before the tool.
2. **HERO: simple but COMPLETE.** Only what is necessary, the right things with the right design. Simple does NOT mean empty — it means no unnecessary things. Today's hero is overloaded (tagline + headline + sub + labelled input + a chip wall + a trust strip + an example-record specimen all at once). Strip to the necessary; keep it premium.
3. **The WORKFLOW EXPERIENCE (type a description → click Classify → wait → result) must be the best experience the user has had on any website:**
   - From the click of Classify through to the result: "a beautiful thing they have never seen on any website." The processing/wait is a SIGNATURE, delightful, novel moment — within the theme and HONEST (keep real pipeline stages, NO fake progress bar/timer).
   - The end result: "worth the wait" — excellent, no clutter, the right things with the right design.
4. **"Put SIGNS behind it" = research-backed rationale.** A senior engineer/designer RESEARCHES and has a documented reason/evidence behind every decision; nothing arbitrary. Ground every choice (the intro, the hero content, the loading, the result) in research + a stated rationale, start to end. Document the WHY.

## Hard constraints (unchanged — carry forward)
- **Honesty:** confidence = BAND/word, never a number; never imply certainty; "verify before filing"; the seal is an archival mark, NEVER a checkmark; no fabricated stats; italic = verbatim citation only; the Share link stays honestly disabled until accounts/server records exist.
- Plain human copy, NO em-dashes (periods or middot ·).
- WCAG 2.2 AA; responsive (desktop two-pane + mobile thumb-first, sticky action bar); reduced-motion safe.
- **Keep the GOOD elevated parts:** band + plain-English meaning line + single graduated advisory; verifiable-citation vs generated-reasoning split; URL-addressable results (`/r/{id}` — refresh never re-spends the run); one-click copy-code; the "look this up in the official ITC(HS) schedule" link; history-as-workspace (search + Record IDs); the honest staged loading (keep the honesty, lose the clinical feel); the PDF "Classification Record".

## Where things stand (technical state)
- Stack: **Next 16.2.6 + React 19 + Tailwind v4**. Branch **`feat/frontend-rebuild`**, commits `f1823a9` (rebuild) → `c8dc9ee` (elevation) → `d8e703a` (round 2) → `f41c593` (finalize). **NOT pushed.** `tsc` + eslint + `next build` green.
- Runs fully on a built-in mock (zero paid calls): `cd frontend && npm run dev` → http://localhost:3000 (or `npx next start -p 3000`). Set `BACKEND_API_URL` to use the real brain — **needs a PAID Tier-1 Gemini key; the FREE tier 80s-times-out (5 requests/min), so live serving is not possible on free.**
- Design system: `src/app/globals.css` (OKLCH tokens, theme-aware elevation/shadows, 4px space scale, role-named type scale), self-hosted Fraunces (display) + Hanken Grotesk (body) + Commit Mono (codes).
- Screens / key files: `src/app/page.tsx` + `src/components/landing/landing-form.tsx` (HERO — to simplify); `src/components/result/*` (`classify-client.tsx` orchestrator, `loading-view.tsx`, `result-view.tsx`, `question-view.tsx`, `refused-view.tsx`, `error-view.tsx`, `result-actions.tsx`); `src/components/record/permalink-record.tsx`; `src/app/history`, `app/about`, `app/privacy`; UI primitives `src/components/ui/*`; copy `src/lib/content.ts` + `src/lib/refuse-copy.ts`; mock `src/lib/mock-data.ts` + `src/app/api/classify[/answer]/route.ts`; frozen DTO `src/lib/types.ts`.
- Audit history (reference): `design-mocks/UX-AUDIT.md` (6/10 → REFINE brief), `RE-AUDIT.md` (7.8), `FINAL-VERDICT.md` (8.5, unanimous ship-ready + post-launch polish backlog). Before/after screenshots: `design-mocks/qa/` (first build), `design-mocks/qa3/` (elevated). The 4 theme explorations (NOT chosen — keep current theme): `design-mocks/explore/`.

## Plan for the next session (build the experience, keep the theme)
1. **Research first ("signs"):** best-in-class first-run previews/onboarding; loading/wait experiences (perceived-performance, progressive disclosure, motion psychology) for a genuinely ~40s real wait; result "reveal" moments; trust signals for regulatory/customs tools; within-theme professionalism (typographic restraint, spacing rhythm). Write down the rationale behind each decision.
2. **Design visually for sign-off, then build, in order:**
   a. The first-run PREVIEW/INTRO (once-only, skippable) that demonstrates the workflow + classifier quality, then transitions into the hero.
   b. Simplify the HERO to necessary-only (keep the theme; remove the clutter).
   c. The signature CLASSIFY → LOADING → RESULT experience: a beautiful, novel, honest processing moment + a "worth-the-wait" result reveal. Keep all honesty + the good elevated parts; remove clutter.
   Surface visuals to the founder for sign-off at each step (the founder's gut on look/feel is the decider; show, don't tell).
3. **Verify:** `tsc`/eslint/`next build` green; screenshot at a VERIFIED ≥1180px desktop + mobile; commit per gate; do NOT push.

## Process learnings (do not re-learn the hard way)
- Forcing strict structured-output on ~60 parallel audit agents is FRAGILE (one non-compliant agent aborts the whole run). Use free-text-critiques-to-file + a synthesizer.
- The Chrome screenshot harness clamps the viewport to ~500px after device-metrics overrides — ALWAYS open a FRESH isolated browser context and verify `window.innerWidth >= 1180` before trusting a "desktop" screenshot, or you will judge desktop at mobile width.
- Kill leftover dev/preview servers when done (a lingering `next start` on :3000 + the backend on :3001 caused a port clash for the founder).
- The founder's GUT on look/feel overrides audit scores. Keep it SIMPLE — density was the real problem, not the theme.

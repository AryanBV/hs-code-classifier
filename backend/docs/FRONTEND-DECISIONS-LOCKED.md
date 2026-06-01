# Frontend Decisions — LOCKED (2026-06-01)

All 9 user-decisions made (each debated 3-4 options first; full debate in FRONTEND-DEBATE.md).

| # | Decision | LOCKED choice |
|---|----------|---------------|
| D1 | Rebuild approach | **Fresh Next 16 + Tailwind v4 + React 19 + latest shadcn** (clean greenfield; "best over fast"). Re-wire Vercel/env/Supabase once; verify-and-lock the exact modern stack as the FIRST build step (swap any lib not React-19/Tailwind-v4-ready for its current equivalent). |
| D2 | Responsive contract | **Adaptive dual-layout on container-query cards** — desktop (>=1024) two-pane "document left / living margin right" + history rail; mobile single column + bottom-sheets + safe-area sticky CTA. Breakpoints sm640/md768/lg1024/xl1280; two-pane engages at lg; 768-1024 = single-wide-column. |
| D3 | Signature feel + motion | **Ledger-line write-on (primary vocabulary) + one restrained stamp/emblem-settle beat.** Loading + reveal = one instrument. Budget: entrance-only 150-350ms, NO ambient motion, reduced-motion = instant, never imply certainty. Kill blob/glow/shimmer/float. |
| D4 | Refuse handling | **~5-bucket taxonomy + one recovery action each** (not-a-tradable-good / out-of-scope-or-fictional / restricted-or-prohibited / needs-more-detail / couldn't-confidently-place). Copy needs user sign-off. Maps existing `refused.reason` enum; no backend change. |
| D5 | 6 vs 8 digit | **Branch on `isSixDigit`** — confident 8-digit headlines the 8-digit + "verify before filing"; 6-digit case headlines the subheading as "careful narrowing" + 8-digit candidates to verify. Plain-language explainer needed (user sign-off). |
| D6 | Rationale record | **Full set, layered on-screen + complete gated PDF.** On-screen: headline + band + primary citation + top-3, expanders for full reasoning/verbatim/components/policy. PDF = complete filing-grade certificate. On-screen tier must surface enough moat before the gate. Layout needs user sign-off. |
| D7 | Loading UX | **Honest staged stepper** (real L0-L5 labels, no %/countdown, holds last step until response). Same component becomes the SSE loader later. Escape-hatch + real per-layer events DEFERRED to the streaming milestone. Single calm retry for timeout/503 (no discriminator in v1). |
| D8 | Language | **English-only + next-intl scaffold** from day one (Hindi = later content-add). Verify locked fonts' glyph coverage now. Keep markup auto-translate-friendly. |
| D9 | Shareable permalinks | **Opt-in public no-PII permalink + preview image** (private by default; explicit "Share" + "this will be public" confirm mints `/r/:id` with a Living-Certificate OG image). Pair with PDF for private CHA->client handoff. Architect RLS/jobId/OG + takedown path now. |

## Auto-handled (senior defaults, no user decision)
a11y to WCAG 2.1 AA (reduced-motion gating, >=4.5:1 contrast, aria-live, keyboard nav, 44px targets, focus-visible, axe/Lighthouse in CI) · performance/CWV (self-hosted Fraunces/Hanken/Commit-Mono via next/font/local, LazyMotion, LCP/CLS/bundle budgets) · SEO basics (metadata, JSON-LD, sitemap, robots, canonical; programmatic thin pages stay dropped) · brand TradeCode->Prevyl + light default · design-system foundation (Customs-Ledger tokens with TRUE light/dark parity, type scale, component inventory) · app-shell (not-found, error/global-error boundaries, query-preserving retry) · analytics cookieless (Plausible/PostHog) + Sentry PII-scrubbed (no cookie banner) · DPDP-minimal (Privacy/Terms/Disclaimer + one-time advisory ack + self-serve delete) · PWA manifest/icons · env/CORS/security hygiene · gate-artifacts-not-access (retire the stale 3-free gate) · bind to frozen v2 DTO + fix /answer contract + add 'refused' screen · confidence band-only (hide the %) · feedback 'code looks wrong' control.

## Final 3 decisions (cost / record / ASK) — LOCKED 2026-06-01 (post final-sweep)

- **A · Cost-protection:** shared-store global daily ceiling (Supabase/Upstash, survives restart/replicas) + invisible Cloudflare Turnstile on POST /classify + soft per-cookie/day friction (NOT an access gate). Keeps unlimited free classify; degrades to a calm "at capacity today" screen. (User signs off the daily number.)
- **B · Rationale record:** the COMPLETE record is FREE on-screen (all expanders); gate ONLY the formatted PDF download + the public permalink mint.
- **C · ASK:** single-question-at-a-time at launch (adapter reads questions[0]); RESERVE an optional questions[]/count DTO field so batched ASK is a pure additive fast-follow (no contract break).

**VERDICT: READY-TO-BUILD.** Final sweep steelmanned all 9 — none beaten by a better option. All decisions settled.

### Build-zero provisioning + auto-fixes (I handle, no user decision)
Provision (currently ABSENT in live Supabase — only 11 corpus tables exist): `classifications` (owner-RLS; frozen DTO + query + ts; guest=localStorage, migrate-on-login), `classification_jobs` (the table job-store already expects — flag-flippable async path), `feedback` (classification ref + emitted/suggested code + text), `shared_records` (own public-read RLS, PII-scrubbed snapshot). Auth UX (contextual sheet/modal + /auth/callback + return-to-intent + @supabase/ssr cookie sessions). Band-only STRUCTURAL (typed client omits confidence/selfConfidence). Strike the stale 3-free-gate rows in FRONTEND-PLAN.md §2. `motion` (not framer-motion) for React 19. Container-query result card (split off container width, not viewport). Inline-sync timeout plumbing (client → Railway directly, ~85s abort; verify Railway proxy idle > 80s). isSixDigit/empty-alternatives/blank-description empty states. "Don't save this" = skip server + localStorage write. Cookie inventory (functional counting cookie ≠ analytics → no banner). OG via next/og at /r/:id; uuid + edge rate-limit + sitemap + 410 takedown. First-run example chips (no Gemini-costing demo). Microcopy via the single en next-intl catalog. Sentry + ~80%-of-cap alert.

## Next
Design the HERO (result/rationale screen) visually — desktop two-pane + mobile — for sign-off FIRST, then loading/ASK/refuse/input/landing, then write the spec -> implementation plan -> build on the verified modern stack. Items needing explicit user sign-off during design: the 5 refuse copy blocks (D4), the 6-vs-8 plain-language explainer (D5), the on-screen layered layout + the PDF certificate layout (D6).

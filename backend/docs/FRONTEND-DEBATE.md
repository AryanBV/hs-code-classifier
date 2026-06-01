# Prevyl ITC-HS Frontend â€” Decision Debate

Free web tool for Indian SME exporters: type a product, get the **top-3 ITC-HS codes + a cited rationale record + an honest coarse confidence band** (high/medium/low â€” no percent gauge). Clean rebuild against a **frozen v2 DTO**, **inline-sync** v1 backend (one held request, 30â€“65s up to ~80s, no SSE yet), Living-Certificate / Customs-Ledger theme, deploy on Vercel + Railway + Supabase Tokyo.

Your two ranked priorities: **(1) best-in-class UI/UX that impresses at first sight; (2) genuinely responsive â€” native-feeling on mobile AND native-feeling on desktop, not one shrunk/blown-up into the other.** Below: every decision gets 3â€“4 genuinely-distinct options with honest trade-offs, then a recommendation.

---

## CLUSTER 1 â€” BUILD / STRUCTURE

### D1 â€” Rebuild approach (how to execute the clean rebuild)
*You already leaned: clean rebuild. The question below confirms HOW.*

**Option A â€” Full greenfield in place** (wipe `frontend/src`, rebuild on the same Next 14 app, salvage only plumbing)
- **Pros:** Cleanest mental model, fastest path to one coherent Living-Certificate codebase. Old code is audit-verified ~100% mismatched (wrong brand, wrong fonts, dark-default, single-code oracle, liar-bar, no refused state, wrong `/answer` contract, AND two competing UI systems wizard/ + classify/). Keeps Vercel project, CI, env, Railway/Supabase wiring untouched. Salvageable plumbing (next-themes, useReducedMotion pattern, Radix/shadcn primitives, cn.ts, safe-area tokens) copies forward in an afternoon.
- **Cons:** Hard cutover â€” a "dark period" with nothing rendering until the happy path is built. Slight risk of smuggling generic-AI habits forward if components are copied without re-judging.
- **When it wins:** Old code is genuinely throwaway (it is), team is one person holding the whole picture, no live traffic to protect. The default for a pre-revenue MVP with a verified-mismatched prototype.

**Option B â€” Greenfield in parallel route group, then swap** (build in `app/(v2)` or `src-next/`, flip root when ready)
- **Pros:** Old prototype stays runnable for reference; single atomic swap at the end; lower dark-period risk; reversible up to the swap.
- **Cons:** Two design systems and two token sets fight in one app (collisions, duplicate fonts, bigger node_modules). The App Router swap itself is non-trivial (route-group rename, middleware, metadata, sitemap). For a solo founder this is overhead protecting a demo nobody depends on â€” and the audit already documented what's wrong, so the old code's reference value is low.
- **When it wins:** Live traffic or a stakeholder needing a continuously-working URL, or you want to A/B old vs new. Neither holds here.

**Option C â€” Strangler: screen-by-screen behind a flag** (replace input, then result, then ASK, each gated)
- **Pros:** Small increments, each independently shippable/reviewable; low blast radius per merge; lets you validate one screen with a real user first.
- **Cons:** Worst fit â€” the screens share a frozen-DTO data layer, app shell, token system, and orchestration hook that ALL must change at once. You'd build throwaway adapter shims between broken-old and correct-new contracts. The flag infra is pure waste with no users to protect, and it drags the generic-AI shell along screen-by-screen.
- **When it wins:** Large apps with live users and a SOUND shared spine where only presentation changes. The opposite of here â€” the spine itself is what's broken.

**Option D â€” Fork to fresh Next 16 + Tailwind v4 project** (latest stack, migrate nothing)
- **Pros:** Newest platform (Next 16 PPR/Cache Components, Tailwind v4 CSS-first tokens, React 19); avoids a near-term upgrade; zero legacy baggage; clean git history.
- **Cons:** Biggest risk for the least product gain â€” you re-bootstrap Vercel linking, env, CI, ESLint, Supabase client, deploy config from scratch. Next 16 + Tailwind v4 + React 19 is a newer combo with more library-compat churn (shadcn/Motion/Radix edge cases) exactly when you want to build product, not debug the toolchain. The locked stack/theme don't require v4/16.
- **When it wins:** You're committed to Next 16 + Tailwind v4 anyway and want the migration done before investing in the design system.

**âž¡ï¸ Recommendation: Option A â€” full greenfield in place**, with a Tailwind v4 / Next 16 evaluation as a *separate later* step. The old frontend is audit-verified throwaway (two competing UI systems = textbook throwaway), and the broken spine (DTO binding, `/answer`, tokens, shell) kills the strangler. In-place keeps all deploy wiring intact, copies forward the real plumbing in an afternoon, and gives one coherent codebase fastest. **Guardrails:** (a) snapshot the old prototype on a tag/branch before wiping; (b) build the shared spine first â€” true light/dark tokens, app shell, frozen-DTO types, API client, then inputâ†’loadingâ†’result happy path â€” to shorten the dark period; (c) re-judge every salvaged component against the calm-motion budget (no blob/glow/shimmer); (d) treat v4/16 as a scoped upgrade AFTER the rebuild lands, never a prerequisite.

---

### D7 â€” v1 loading UX (presenting the 30â€“65s held request honestly, no SSE)

**Option A â€” Honest staged stepper mapped to real L0â€“L5 stages** (predicted-progress, no live events)
- **Pros:** Best perceived-progress and most on-brand â€” "Reading your product â†’ Narrowing chapters â†’ Selecting the code â†’ Rule-checking the result" mirrors the real pipeline, so labels are TRUE even though timing is estimated. Reads as an instrument doing real work. Stays honest if it never shows a % or a hard countdown. Forward-compatible: when SSE lands, the SAME component is driven by real events â€” zero visual rework.
- **Cons:** Advance timing is a guess, so a slow/fast run can lag or jump (soft liar-bar risk if tied to a fixed timer). Must advance on heuristic dwell-times and HOLD the last step until the real response arrives. Slightly more build than a spinner.
- **When it wins:** Long wait (it is) + genuinely-real stages (they are) + you want the same component to later consume SSE. Best alignment with the locked "honest instrument narrowing" decision.

**Option B â€” Elapsed-time counter + rotating substance** (what the engine does / HS facts / what GIR is)
- **Pros:** Radically honest about time (a counter promises nothing it can break); rotating substance turns dead wait into trust-building education and onboards first-time SME users. Trivially truthful; lowest liar-bar risk.
- **Cons:** An upward counter can amplify anxiety near the 80s ceiling â€” opposite of perceived-progress. Tips read as filler if the copy isn't genuinely useful, and it reads more "did-you-know loader" than precision instrument. No sense of nearing completion; partially throwaway when SSE lands.
- **When it wins:** When you can't honestly predict stage timing at all â€” OR folded INTO the stepper as secondary detail rather than the whole loader.

**Option C â€” Minimal calm "working" state** (one breathing seal / inking ledger-line + "this can take up to a minute", no stages, no timer)
- **Pros:** Maximum honesty, minimum overclaim â€” impossible to be "wrong". Cheapest to build, easiest to make beautiful and on-brand. Calm not anxious; trivial reduced-motion story; zero liar-bar risk.
- **Cons:** Worst perceived-progress for a 30â€“65s wait â€” nothing advancing makes a minute feel much longer; abandonment risk rises on mobile. Wastes the genuinely-true L0â€“L5 narrative. Can read as "is it stuck?"
- **When it wins:** Sub-10s waits, or zero truthful structure to show. Here it's a fine FALLBACK after the stepper runs its course (overflow / slow-run state).

**Option D â€” Optimistic determinate progress bar** (a % fill advancing on a timer)
- **Pros:** Most familiar; a filling bar reads instantly as "progress" and can reassure for the first ~20s.
- **Cons:** Directly re-introduces the **liar-bar the plan explicitly killed** â€” a determinate bar makes a quantitative promise inline-sync CANNOT honor (no real signal, runtimes vary 30â€“80s). It stalls at ~90% or jumps to 100% late, eroding trust on a product whose entire value is HONESTY. Kept only for completeness.
- **When it wins:** Only with a real monotonic signal (true SSE per-layer events with a known total) â€” which v1 does NOT have.

**âž¡ï¸ Recommendation: Option A â€” honest staged stepper on real L0â€“L5 stages**, with B's elapsed/substance folded in as secondary detail and C as the overflow fallback. The stages are genuinely real, so a stepper is both highest perceived-progress AND honest-by-construction â€” provided it shows no %, no hard countdown, and never lets a step pre-complete: advance on heuristic dwell-times, then HOLD on "Rule-checking the resultâ€¦" until the real HTTP response resolves. **Explicitly reject the determinate bar (D)** â€” it re-creates the killed liar-bar. **Two hard constraints from the audit:** (1) DEFER the "keep running / saved to History" escape hatch and any real per-layer events to the SSE + classification_jobs milestone â€” both are impossible on inline-sync and faking them re-introduces dishonesty; (2) the timeout-vs-503 split copy is NOT expressible (the adapter maps both to 503, no discriminator) â€” ship a single calm "this one's intricate â€” your product is saved, try again" retry that never loses the typed query. **Decisive long-term win:** the same stepper becomes the SSE loader later by swapping estimated dwell-times for real events â€” forward-compatible, not throwaway.

---

### D8 â€” i18n / language scope for v1

**Option A â€” English-only, NO i18n scaffold** (hardcoded strings, revisit later)
- **Pros:** Fastest, least machinery; keeps the design-heavy rebuild focused. Domain is overwhelmingly English (ITC-HS descriptions, GIR text, notes, the rationale record are English by source; target exporter reads functional English).
- **Cons:** Retrofitting i18n into a built React tree is genuinely expensive â€” every hardcoded string must be hunted and externalized (the audit flags this as expensive). Bakes in an English-only assumption that may not match the SME long tail.
- **When it wins:** Only if you'll NEVER localize, or the scaffold genuinely threatens the timeline. Weakest option â€” saves little, risks a costly retrofit.

**Option B â€” English-only at launch WITH next-intl scaffolding from day one** (one `en` catalog, locale-ready routing, glyph-safe fonts)
- **Pros:** Ships English now (zero translation work) while making Hindi/regional a later CONTENT add, not a re-architecture. In a from-scratch rebuild the marginal cost is tiny â€” you're authoring every string fresh, so dropping it in an `en` catalog is a habit, not extra work. De-risks the single most expensive retrofit. Forces clean copy/component separation, which also helps the brand-sensitive REFUSE/ASK voice.
- **Cons:** Modest upfront discipline tax (key naming, a t() wrapper, locale-routing config) that earns nothing until a second language ships â€” and may never. Slight over-engineering risk; one more dependency.
- **When it wins:** Credible-but-unscheduled chance of localization (true for an Indian-SME tool) + greenfield rebuild (true). The senior default.

**Option C â€” English + Hindi at launch** (full bilingual UI; HS/legal content stays English)
- **Pros:** Maximum reach into the SME long tail at launch; a genuine "built for Indian exporters" differentiator; avoids ever shipping an English-only first impression to Hindi-preferring users.
- **Cons:** Heavy and premature for a UX-first MVP â€” needs quality Hindi translation of all UI copy (the trust-critical REFUSE/ASK voice is hard to localize; bad Hindi erodes the trust you sell), a Devanagari body font matching the aesthetic, and bilingual QA â€” all competing with the design rebuild. The core value (codes, GIR citations, rationale) is irreducibly English/legal, so a Hindi wrapper around English content may confuse. No validated Hindi-only segment yet.
- **When it wins:** Buyer interviews show a large Hindi-preferring segment English-only would lose, AND you have translation/QA bandwidth that doesn't steal from the UX bar.

**Option D â€” English UI + on-demand machine auto-translate** (browser-translate-friendly markup / inline toggle)
- **Pros:** Near-zero build to gesture at multilingual; covers the entire long tail of Indian languages for free if markup is translation-friendly (semantic HTML, no text-in-images, lang attrs).
- **Cons:** Uncontrolled quality exactly where it matters most â€” auto-translated legal/REFUSE copy can mislead on a liability-adjacent product, undermining the honesty moat. You don't own the experience; typography may not survive; MT of customs terms is notoriously unreliable. A non-decision dressed as one.
- **When it wins:** As a passive accessibility nicety layered ON TOP of another choice â€” never the primary strategy.

**âž¡ï¸ Recommendation: Option B â€” English-only at launch WITH next-intl scaffolding from day one**, and keep markup auto-translate-friendly (the harmless layer of D) as a passive courtesy. The core value is irreducibly English/legal and the target exporter operates in functional English, so English-at-launch is defensible and keeps the rebuild focused. But the asymmetric cost is the decisive fact: i18n is cheap to scaffold in a from-scratch rebuild and expensive to retrofit â€” so scaffold now as cheap insurance, which also forces clean copy/component separation. **Reject A** (saves nothing, risks the costly retrofit). **Reject C** as premature (steals UX bandwidth; wraps Hindi UI around English legal content; no validated segment) â€” revisit only if buyer interviews surface a large Hindi-preferring segment. **Reject D as primary** (uncontrolled quality on liability copy undermines the moat). **Day-one actions:** install next-intl with a single `en` locale + locale-ready routing, externalize strings into `en` as you build, verify the locked fonts' glyph coverage now so a `hi` catalog + Devanagari face later is content-and-font work, never re-architecture.

---

## CLUSTER 2 â€” LAYOUT + VISUAL IDENTITY

### D2 â€” Responsive contract (native-mobile AND native-desktop per screen)
*You already leaned: desktop two-pane workspace + mobile thumb-tool. The question below confirms HOW it's implemented.*

**Option A â€” Adaptive dual-layout: desktop two-pane + mobile thumb-tool, distinct per-breakpoint layouts from ONE component tree** (your lean)
- **Pros:** Genuinely native on both ends (priority #2). Concrete per-screen contract â€” INPUT: mobile full-bleed column + safe-area sticky-bottom CTA; desktop centered command-bar hero (~720) with examples as editorial sidebar. LOADING: mobile full-screen stacked stepper; desktop SAME stepper in left pane + query echo / "what you'll get" skeleton in right pane (workspace frame present before result lands). ASK: mobile full-screen bottom-sheet, full-width option list (â‰¥44px, tap-state); desktop question in left pane, options as 2-up grid, right margin "why we ask this". RESULT/RATIONALE: mobile single column, code+description hero, band chip inline, accordions collapsed; desktop TWO-PANE â€” left "document" (code/description/top-3/components), right "living editorial margin" (RULE-CHECKED emblem + band, verbatim GIR citation, export-policy/India flag, advisory) visible without scrolling. HISTORY: mobile bottom-tab list with search; desktop persistent collapsible left rail. Breakpoints sm640/md768/lg1024/xl1280; two-pane at lg; 768â€“1024 = honest single-wide-column. Interaction grammar differs by modality (touch=tap/sheet/sticky-thumb; pointer=hover/keyboard/persistent-panels).
- **Cons:** Most design + build effort â€” two real layout modes per screen + an explicit 768â€“1024 tablet decision. Two code paths can drift unless disciplined (shared primitives + one layout-orchestrator per screen are mandatory). More viewport QA; heavier upfront spec.
- **When it wins:** First-impression polish and "this respects my device" ARE the competitive edge (they are â€” it's FREE, so craft is the moat), and the rationale record genuinely benefits from a second pane (citation+policy belong beside, not below). The default for a credibility instrument.

**Option B â€” Single fluid responsive column everywhere** (max-width clamps + clamp() type, 360â†’1440)
- **Pros:** Fastest to build, bulletproof to QA, naturally accessible (linear reading order), identical content order reads as a "document" on all viewports. Lowest drift risk.
- **Cons:** This IS the "blown-up mobile on desktop" anti-pattern you rejected â€” a ~720px column on a 1440 monitor leaves dead margins and strands citation/policy below the fold instead of beside the code. Fails priority #2's desktop half.
- **When it wins:** Brutally tight timeline, ~95% mobile traffic, or a v0 internal demo. Honest fallback, not the target.

**Option C â€” Container-query component-level adaptation** (components adapt to THEIR container, composed into a fluid grid)
- **Pros:** Most robust/future-proof â€” the same result card renders correctly full-width on mobile, in a two-pane workspace, in a history rail, AND in the planned embeddable API surface (the re-audit names that first-class, so this pays off twice). Decouples component design from page layout; shadcn + Tailwind v4 support `@container` natively.
- **Cons:** Higher conceptual overhead (think in container contexts, not screens); weaker devtool support; doesn't by itself decide the PAGE-level two-pane vs stack â€” you still need a layout decision on top (so it's really an implementation substrate under A). Over-engineering if the embeddable future never lands.
- **When it wins:** The SAME components must live in many container contexts â€” exactly this roadmap (web app + history rail + future embeddable widget + B2B embeds). Best adopted UNDER A's page-level contract.

**Option D â€” Separate mobile/desktop route trees or hard variants** (`useMediaQuery`-switched `<ResultMobile/>` vs `<ResultDesktop/>`, or `(mobile)`/`(desktop)` segments)
- **Pros:** Maximum freedom for a truly bespoke iOS-feeling mobile flow and a workstation-feeling desktop flow with zero compromise (mobile swipe-between-records, desktop multi-pane keyboard workspace).
- **Cons:** Double the surface to build/test/maintain â€” a solo-founder trap, every feature ships twice. SSR/SEO complexity (UA sniffing or client-only switches hurt LCP/CWV â€” the plan has CWV budgets). Trees rot out of sync. Almost never justified below a large team.
- **When it wins:** Scale with dedicated mobile + web teams, or two fundamentally different products. Overkill here.

**âž¡ï¸ Recommendation: Option A as the page-level contract, IMPLEMENTED on C's container-query substrate for the reusable cards** (result card, ASK card, history item). A is the only option satisfying priority #2 on both ends â€” the rationale record wants a second pane on desktop (citation + export-policy + emblem beside the code) while mobile wants a thumb-reachable sticky CTA, full-screen sheets, and accordion density. B is the named anti-pattern; D is a solo-founder maintenance trap. Folding C under A is the senior move: build result/ASK/history as container-query-aware components so they render correctly in the mobile stack, the desktop two-pane, the history rail, AND the future embeddable API â€” A's native feel today plus C's reuse dividend tomorrow without D's double-maintenance. Lock breakpoints sm640/md768/lg1024/xl1280, engage two-pane at lg=1024, rule 768â€“1024 as an honest single-wide-column. Mandate shared primitives + one layout-orchestrator per screen to prevent drift. **Spec the RESULT/RATIONALE hero first** (it's the moat artifact and the wow moment) â€” annotated, for sign-off before any build.

---

### D3 â€” Signature first-impression "wow" + motion language (a TRUST instrument; no blobs/glow/shimmer/float)

**Option A â€” Ledger-stamp / "certificate issued" reveal** (code stamps into the certificate field with a restrained emboss; GIR + verbatim citation writes on beneath)
- **Pros:** Most literally on-theme â€” the stamp IS the brand made kinetic, landing at the highest-payoff moment (result reveal after a long wait, peak attention). Memorable, screenshot-worthy, dignified. The citation write-on reinforces honesty/rigor (you SEE the legal basis inscribed). Instantly differentiates from generic chat AI.
- **Cons:** A seal can tip into kitsch or imply "VERIFIED/100%" overclaiming â€” dangerous given the honesty principle. Demands extreme restraint (quiet emboss + band-aware emblem, NEVER a green check + ka-chunk). Most animation to tune, easiest to overcook. Reduced-motion users must get the fully-formed certificate via crossfade (the signature beat is invisible to them).
- **When it wins:** The reveal is the emotional peak (it is) and the brand leans hard into the certificate metaphor (it does) â€” IF disciplined: emboss not green-check, band-honest emblem, ~250â€“350ms, reduced-motion = instant settled state.

**Option B â€” Calm underwriting / ledger-line write-on** (horizontal rules and field labels draw in leftâ†’right as the record assembles row by row)
- **Pros:** Reads as "careful, deliberate, being-recorded" â€” perfectly matches a reasonable-care compliance artifact. Lower kitsch risk than a stamp (no seal to overclaim). Degrades gracefully (reduced-motion shows the finished ledger). **Doubles as the LOADING narrative** (lines inscribe as real L0â†’L5 stages complete), unifying loading + reveal into ONE honest motion vocabulary instead of two disconnected effects. Cohesive and restrained.
- **Cons:** Less of a single punchy "wow" â€” a pleasing accumulation, not a peak, so fast-scrolling first-timers may not register a signature beat. Over-staggered row-by-row can feel slow (keep ~60â€“80ms stagger, total <500ms). Risk of looking like generic skeleton-shimmer if not visually distinct from a loading placeholder.
- **When it wins:** Cohesion + honesty + "carefully recorded" matter more than a single dramatic beat, and you want ONE motion vocabulary spanning loading AND reveal (a real DRY win). The crafted-but-safe pick.

**Option C â€” Typographic "document typesets itself"** (code snaps into Commit Mono with a tracking settle, description sets in Hanken, headings in Fraunces)
- **Pros:** Leans entirely on the locked premium typography as the signature â€” sophisticated, editorial, free of overclaim risk. Pure type motion is GPU-cheap, a11y-friendly, timeless. Reinforces "this is a document" through craft. Very hard to make look generic.
- **Cons:** Subtlest of the four â€” connoisseur-grade "wow" may be lost on a hurried, utilitarian SME exporter. Finicky to tune across three families; risks CLS if metrics aren't reserved (the plan has CLS budgets). Lowest immediate dazzle for a cold visitor.
- **When it wins:** A design-literate audience, or you want the safest-from-overclaim signature with the highest taste ceiling. For utilitarian exporters the payoff may under-deliver on "impress at first sight."

**Option D â€” Restrained near-static + ONE micro-moment** (UI essentially static; entire motion budget = a single ~200ms band-aware emblem settle on reveal)
- **Pros:** Lowest risk on every axis â€” zero overclaim, trivial reduced-motion, best CWV/perf, impossible to read as generic-AI, fastest to build, maximally "serious instrument." The single beat carries disproportionate intentional weight.
- **Cons:** May under-deliver on priority #1 â€” near-static can read as plain/unfinished against polished competitors, and a 200ms settle is barely a "wow." Leaves the long wait and the big reveal emotionally under-leveraged. Risks "austere" tipping into "boring."
- **When it wins:** User testing shows ANY motion erodes the trust read, a motion-averse audience, or as the guaranteed-safe floor if richer concepts test as gimmicky.

**âž¡ï¸ Recommendation: Option B (calm ledger-line write-on) as the PRIMARY motion vocabulary, with A's stamp reduced to a single restrained emblem-settle beat** at the moment the band + RULE-CHECKED emblem lands. The killer insight: loading (30â€“65s real L0â†’L5 stages) and the reveal are the SAME instrument inscribing a record â€” B lets one vocabulary span both (stages inscribe ledger rows during the wait; the finished record IS those rows settled), more cohesive and honest than bolting a separate stamp onto a separate liar-bar loader. Pure A risks "verified/100%" overclaim the honesty principle forbids; pure D under-delivers on priority #1; pure C is too subtle for a utilitarian audience. The hybrid gives a genuine signature beat without the overclaim. **MOTION-BUDGET RULE (lock this):** entrance/transition motion only, 150â€“350ms, eases on enter; NO persistent ambient motion (kill every blob/glow/shimmer/float/pulse); at most ONE signature beat per screen; everything gated behind `prefers-reduced-motion` (reduced = instant settled state, citation present, emblem static, zero stamp); motion must NEVER imply certainty (no green check, no "VERIFIED" flourish â€” the emblem reflects the honest band). Use Motion (Framer) with LazyMotion to stay in the CWV budget; reserve box metrics so the type/ledger settle is CLS 0.

---

## CLUSTER 3 â€” PRODUCT / CONTENT / COMPLIANCE

### D4 â€” REFUSE handling (when the tool honestly cannot classify)

**Option A â€” Small fixed reason-taxonomy (~5 buckets), each with calm copy + ONE recovery action**
- **Pros:** Maps the 9 real backend `OutOfScopeClass` enums into ~5 user-facing buckets so the message is always TRUE to why the brain stopped. Honesty ("abstaining is a feature") is only credible when the refusal is specific and the next step is actionable. A "too-vague â†’ add material/use" bucket converts many refuses into a successful retry â€” lifting effective answer-rate WITHOUT a wrong code. Differentiated copy reads as a careful instrument; one CTA per bucket keeps the screen calm.
- **Cons:** Needs an enumâ†’bucket map + approved per-bucket copy (real authoring + legal-tone work). Some refusals carry `reason=null` (non-triage/backtrack) so a sensible default bucket is mandatory. Mild mis-bucketing risk if the map drifts as the brain evolves.
- **When it wins:** A trust-first, honesty-as-moat product where the refusal screen is part of the brand promise and most refusals are recoverable.

**Option B â€” Single generic "we couldn't classify this"**
- **Pros:** Trivial to build, never mis-buckets, lowest maintenance, can't leak a condescending reason.
- **Cons:** Reads as a dead end / error, undercutting "abstaining is a feature." Gives no signal whether to rephrase or give up â€” depresses answer-rate AND trust at once. The weakest possible moment on an impress-first-sight product. Wastes the `out_of_scope_class` signal already computed.
- **When it wins:** Only as a stopgap if refusal volume is negligible and authoring bandwidth is zero â€” i.e., a throwaway MVP, which this explicitly is NOT.

**Option C â€” Refuse-that-always-offers-one-more-question** (push every refuse back into ASK)
- **Pros:** Maximizes answer-rate optics (rarely a hard "no"); conversational; recovers some prematurely-refused vague queries.
- **Cons:** Architecturally dishonest for most classes â€” contraband, weapons, services, fictional, extraterrestrial CANNOT be rescued by a question; asking implies a code exists when it doesn't (the exact overclaiming the product forbids). The brain ALREADY runs uncertainty-gated ASK before refusing; bolting on a guaranteed extra question re-fires the over-asking failure the team proved catastrophic. Adds a 30â€“65s + cost round-trip for cases that refuse again.
- **When it wins:** Only if refusals were dominated by premature-vagueness AND ASK wasn't already gated â€” neither holds. As a per-class action for too-vague/incoherent it collapses into A's recovery path.

**Option D â€” Refuse-that-degrades-to-a-6-digit best-effort** (always emit SOMETHING)
- **Pros:** Never an empty hand; always returns a code, which naive users may prefer; framed as "best we can do, verify heavily."
- **Cons:** Directly violates the locked posture ("better no output than a wrong code"). A refusal means candidates did NOT survive verification/backtracking or the thing is out-of-scope â€” forcing a 6-digit manufactures a confident-wrong answer, the one metric the team works hardest to zero. Legally worse: a code for contraband/weapons/services is actively harmful. Destroys the rule-checked/honest brand.
- **When it wins:** Essentially never here â€” only an entertainment/quote tool with no compliance stakes.

**âž¡ï¸ Recommendation: Option A â€” small fixed reason-taxonomy + one recovery action per bucket.** Collapse the 9 enums into ~5 buckets: (1) NOT A TRADABLE GOOD (services_not_goods + function_only_no_substance) â†’ "HS codes classify physical goods; describe a physical product"; (2) OUT OF SCOPE / FICTIONAL (extraterrestrial + fictional) â†’ calm "we classify real, tradable goods"; (3) RESTRICTED OR PROHIBITED (contraband + weapons_restricted_class) â†’ neutral, non-accusatory "this falls under restricted/prohibited trade â€” consult a licensed CHA/DGFT", NO classification attempt; (4) NEEDS MORE DETAIL (incoherent_query + too-vague) â†’ ONE recovery: edit query + add material/use (the only bucket routing back to input); (5) COULDN'T CONFIDENTLY PLACE (genuinely_indistinguishable + backtrack_no_fit + `reason=null` default) â†’ honest "we couldn't place this with confidence â€” abstaining rather than guess", optionally show the closest chapters considered (from trace) without asserting a code. Only A is consistent with the locked honesty posture AND lifts effective answer-rate via the bucket-4 retry, WITHOUT inventing codes (reject D) or over-asking (reject C). Reject B as too weak for a moat product. Author the 5 copy blocks for sign-off (liability-adjacent tone); always keep a safe default for `reason=null`. **Needs NO backend change** â€” the enum already exists in `refused.reason`.

---

### D5 â€” 6-digit vs 8-digit presentation (compliance: unlicensed AI â†’ 6-digit safe; 8-digit "for entry" is licensed customs work)
*You already leaned: honest 6-digit framing. The question below confirms the exact treatment.*

**Option A â€” Honest 6-digit headline + 8-digit leaves as "candidates to verify" + verify-before-filing note** (your lean)
- **Pros:** Encodes the only compliant posture exactly: when `isSixDigit` is true, the tool is honest it resolved to subheading level and the final 8-digit is the exporter's/CHA's call. The moat (top-3 + cited rationale) still shines â€” the 8-digit candidates appear as the DTO's `alternatives[]`, framed "to verify" not "to file." Differentiates the `isSixDigit` case visually (different hero + stronger advisory) so the UI is truthful about what the brain produced. Builds on existing DTO fields (`isSixDigit` + `alternatives[]`).
- **Cons:** Two hero layouts (6 vs 8) = more design/test surface, and the difference must be legible to a non-expert (needs a one-line plain-language explainer). Risk of under-selling a genuinely good 8-digit answer if framing is too hedged. Care needed so headline + candidates don't read as two competing answers.
- **When it wins:** A compliance instrument whose brand IS honesty and reasonable-care, where subheading-level truth is a trust asset â€” this product.

**Option B â€” Treat 6- and 8-digit identically** (one hero, `isSixDigit` ignored in layout)
- **Pros:** Simplest build (one component, no branch); always shows a full code, feels "finished"; no HS-hierarchy vocabulary to explain.
- **Cons:** Dishonest about granularity â€” an 8-digit code carries "for entry" connotations the unlicensed-AI posture forbids, and a 6-digit result styled as 8-digit overclaims precision. Throws away the deliberate `isSixDigit` signal; misses making "verify before filing" a differentiating feature. Undermines the reasonable-care moat.
- **When it wins:** Only a casual/educational lookup with no filing stakes â€” contradicts the positioning.

**Option C â€” ALWAYS lead with 6-digit; 8-digit ONLY ever as "candidates to verify"** (even when the brain returned a confident 8-digit)
- **Pros:** Maximally defensible â€” never headlines a filing-level code, eliminating "we told you to file this" liability. Uniform 6-digit hero is simpler than A's branch and still honest. Consistent "we narrow; you/CHA finalize" narrative.
- **Cons:** Throws away real value in the ~77% case where the brain DID confidently resolve an 8-digit leaf â€” burying a correct 8-digit as a mere "candidate" under-delivers and feels evasive, hurting first-impression and perceived accuracy. Truncating a known 8-digit to its 6-digit parent for the headline is its own small dishonesty. Frustrates sophisticated CHAs who want the leaf front-and-center.
- **When it wins:** Legal counsel demands the most defensive posture possible, or calibration shows 8-digit precision is too unreliable to headline â€” a risk/legal call, not pure UX.

**Option D â€” 8-digit headline + prominent licensed-broker disclaimer banner**
- **Pros:** Leads with the most precise answer (best perceived value / first impression) while a loud disclaimer carries the compliance load. Single hero. Honest in words.
- **Cons:** Relies on a disclaimer to neutralize a presentation that itself implies filing-readiness â€” the weakest form of honesty (the "hedge" the posture rejects vs genuine framing). A persistent banner fights the calm aesthetic and trains banner-blindness. Still ignores `isSixDigit` (an 8-digit-styled hero is impossible/fabricated when the brain only got to 6-digit). Closest to the overclaiming pattern the re-audit killed.
- **When it wins:** A speed/precision-first tool for expert users who treat disclaimers as noise â€” not the trust-first SME posture here.

**âž¡ï¸ Recommendation: Option A â€” honest 6-digit framing (your lean, and correct).** Branch the hero on `isSixDigit`: when FALSE (confident 8-digit, the common ~77% case) present the 8-digit as the headline with the standard "verify before filing" advisory and top-3 as siblings; when TRUE present the 6-digit subheading as the headline with a stronger plain-language note ("we've narrowed this to the 6-digit subheading; the final 8-digit depends on details a licensed CHA confirms for filing") and surface candidate 8-digit leaves as `alternatives[]` "candidates to verify." This respects what the brain actually produced in each case (rejecting C's blanket downgrade of good 8-digit answers and B's flattening) and frames rather than merely disclaims the boundary (rejecting D). It turns the legal constraint into a visible trust feature using only existing DTO fields. Add a one-line plain-language explainer of 6 vs 8 digit. The 6-digit branch must NOT feel like a downgrade â€” frame it as "careful narrowing."

---

### D6 â€” Rationale-record field set (the moat artifact â€” on-screen + gated PDF)

**Option A â€” Full reasonable-care set**
- **Pros:** This artifact IS the moat â€” no India competitor produces a cited 8-digit ITC-HS record with top-3 + GIR rationale, so completeness is the differentiator, not bloat. Every field already exists in the frozen DTO (hsCode, description, top-3 alternatives w/ descriptions, confidenceBand, GIR citation + verbatim note, plain-language reasoning, components for GIR-3b, exportPolicy/policyCondition, indiaSpecific) plus query + generated-on date â€” so "full" costs authoring/layout, not new backend work. A complete record is the defensible reasonable-care paper trail. Strongest first impression of rigor.
- **Cons:** On a phone, dumping every field at once is overwhelming and buries the headline â€” full-set MUST be paired with progressive disclosure or it becomes a wall (really an argument about HOW, see C/D). Verbatim legal notes can be long; raw display risks an intimidating block. Generated-on date + advisory must be unmissable on the PDF for the record to be legally meaningful.
- **When it wins:** A moat/reasonable-care product where completeness is the selling point and the DTO already carries everything â€” this product. The only real question is presentation.

**Option B â€” Lean subset (code + reasoning + date)**
- **Pros:** Cleanest, least intimidating, fastest to build and read; mobile-friendly by default; lowest legal-review surface.
- **Cons:** Discards the exact fields that ARE the moat â€” top-3 alternatives, GIR citation + verbatim note, export policy, India flag, components. Reduces the product to "AI guessed a code + a paragraph," indistinguishable from a ChatGPT prompt. A reasonable-care record without citations or alternatives is NOT one. Wastes rich DTO data already paid for.
- **When it wins:** Only a quick-lookup utility with no defensibility ambition â€” contradicts the moat strategy.

**Option C â€” Layered: concise default, expandable full (same surface, on-screen)**
- **Pros:** Resolves the only real objection to "full" â€” shows headline + band + the single most important citation up front, with "show full rationale / all citations / components / policy" expanders, so the screen impresses immediately AND the full record is one tap away. Excellent mobile fit (accordion/sheet) and desktop fit (editorial margin reveals depth). Keeps ALL fields (A's content, A's weakness removed). Matches the locked "balanced density (depth expandable)" decision verbatim.
- **Cons:** More interaction engineering (disclosure state, aria-expanded, deep-link to expanded sections for share/PDF parity). Risk users never expand and miss the depth unless the collapsed state teases it. Need an above-the-fold vs hidden content-hierarchy call.
- **When it wins:** The ON-SCREEN strategy for a full-field moat artifact that must also be calm and mobile-native â€” best of A's completeness and B's calm.

**Option D â€” Two-tier: concise on-screen, FULL in the gated PDF**
- **Pros:** Cleanly separates the free trust-funnel surface (concise, fast, impressive) from the gated reasonable-care deliverable (the full certificate PDF), reinforcing "gate artifacts, not access" â€” the complete record becomes a reason to create a free account/export. The PDF is where verbatim notes + full citations + components + date + advisory belong as a filing document anyway. Reduces on-screen density without losing any field overall.
- **Cons:** If "concise on-screen" is TOO lean it looks like B to a guest who never exports â€” the moat must still be VISIBLE, not just downloadable, to convert trust. Forces citation/alternatives mainly into the PDF â€” but those are precisely what should impress on first sight. Splitting across two renderers doubles layout work and risks on-screen/PDF drift.
- **When it wins:** Using the FULL record as the gated conversion carrot while keeping the public page lightweight â€” strong for gate-artifacts, but only if the on-screen tier still surfaces enough moat to earn trust before the gate.

**âž¡ï¸ Recommendation: Adopt the FULL field set (your lean is right â€” the DTO already carries every field), presented via a HYBRID of C and D.** On-screen = LAYERED (C): headline code/description + `isSixDigit` framing + confidence BAND (no %) + the primary GIR citation + a 2â€“3 line plain-language reasoning summary + top-3 visible, with expanders for the full reasoning chain, verbatim note, components (GIR-3b), and export-policy/India detail. Gated PDF "Classification Record" = the COMPLETE certificate (D): query, all three codes+descriptions, band, full GIR citation + verbatim note, full reasoning, components, export policy, India flag, generated-on date, advisory line â€” formatted as the filing-grade reasonable-care artifact. This gives the impressive, calm, mobile-native first impression (C) AND makes the complete record the gated conversion carrot (D), honoring "balanced density, depth expandable." Reject B (kills the moat) and raw-A (full-dump on mobile). **Critical constraint:** the on-screen concise tier must still surface enough citation + top-3 to earn trust BEFORE the gate, or the gate fires before the value lands. Draft both the on-screen layered layout and the PDF layout for sign-off (product + legal contents).

---

### D9 â€” Shareable result permalinks (public URL for a record, vs private)
*You already leaned: opt-in public, no-PII share. The question below confirms it.*

**Option A â€” Opt-in public, no-PII permalink + dynamic OG image** (your lean)
- **Pros:** Reconciles confidentiality and growth honestly: default private (honors "confidentiality as a feature" / "don't save this"), and ONLY an explicit "Share this record" mints a public, PII-stripped page (query + codes + citation + band â€” no account/email/internal trace). Gives the SEO/virality lever the re-audit wants WITHOUT thin-page spam â€” each shared page is a real human classification (genuine long-tail "HS code for [product]" content). A dynamic OG image of the certificate is a strong on-brand growth surface (the Living-Certificate seal renders beautifully in a Slack/WhatsApp/X preview). Designing it in now means nuqs/jobId routing + RLS + OG rendering are architected, not retrofitted.
- **Cons:** Requires SSR/ISR for `/r/:id`, an OG-image pipeline (Satori/@vercel/og), a public-read RLS policy distinct from the private default, and a PII-scrub guarantee (the query text itself must carry no confidential product/buyer info â€” needs a "this will be public" confirmation). Persistence implies a takedown/delete path. More moving parts than fully private.
- **When it wins:** A free, trust/SEO-funnel product that wants organic growth AND must keep a confidentiality promise â€” exactly this product.

**Option B â€” Fully private / client-only** (no permalinks, no public pages)
- **Pros:** Maximally honors confidentiality â€” nothing ever public, simplest RLS (owner-only), no OG pipeline, no takedown surface, no PII-leak risk. Smallest build, fastest v1. Zero ambiguity for privacy-sensitive exporters.
- **Cons:** Forfeits the only remaining organic-acquisition lever after programmatic SEO was dropped â€” the re-audit calls web a "trust/SEO funnel" but fully-private leaves no engine. No word-of-mouth/preview virality. A CHA can't send a client a link; they'd attach a PDF (higher friction).
- **When it wins:** v1 must be dead-simple and growth is deferred, or research says the audience is so confidentiality-averse any public-share is a liability. A safe, legitimate fallback.

**Option C â€” Public-by-default** (every record gets a public URL unless made private)
- **Pros:** Maximum SEO/virality with zero user effort â€” every classification becomes indexable long-tail content; fastest organic growth; network effects compound automatically.
- **Cons:** Directly violates the locked "confidentiality as a feature" / "don't save this" promise â€” product descriptions can encode confidential sourcing, buyers, or unreleased SKUs; making those public by default is a serious trust and potential DPDP breach. Inverts consent (opt-out). High leak risk the moment someone forgets to toggle. One leaked confidential query outweighs the SEO upside for a trust brand.
- **When it wins:** Only a non-sensitive, content-marketing-first product where every query is safe to publish â€” the opposite of confidential export classifications.

**Option D â€” Share-as-PDF/image only** (no public URL at all)
- **Pros:** User can share the record (gated PDF or rendered image) without ANY public page existing â€” strong confidentiality (artifact travels peer-to-peer, nothing indexable), still enables the CHAâ†’client handoff. No RLS/SSR/takedown complexity. Leans on the PDF the product already builds.
- **Cons:** No SEO value (no crawlable URL) and weak virality (a PDF/image has no click-through back to the tool, no OG funnel). Loses the "click preview â†’ land on hscode.prevyl.com" acquisition loop. A growth dead-end even if great for the recipient.
- **When it wins:** Priority is frictionless professional handoff + confidentiality with NO growth ambition from sharing â€” a strong middle option for sharing-as-utility but not sharing-as-marketing.

**âž¡ï¸ Recommendation: Option A â€” opt-in public, no-PII permalink + dynamic OG image (your lean, and the right balance).** It's the only option satisfying BOTH locked constraints at once: confidentiality-by-default (rejecting C's consent inversion, which risks leaking confidential data and breaches "don't save this") AND a genuine organic-growth engine to replace the dropped programmatic-SEO lever (rejecting B/D's growth dead-ends). Default every record private (owner-only RLS); an explicit "Share this record" â€” gated behind a clear "this page will be publicly viewable â€” it shows your query and the codes" confirmation â€” mints a PII-stripped `/r/:id` page rendered server-side with a Living-Certificate OG image. Because each shared page is a real human classification (not a generated stub), it's exactly the long-tail content wanted WITHOUT the dropped spam. Design nuqs/jobId routing + public-read RLS + @vercel/og + a takedown/delete path NOW so it isn't a retrofit. **Pair it with D's share-as-PDF** for the private CHAâ†’client handoff (complementary, not exclusive â€” PDF for confidential handoff, permalink for opt-in public growth). If you want v1 dead-simple, B is the safe fallback and the permalink ships fast-follow â€” but architect the RLS/jobId model to allow A from day one regardless.

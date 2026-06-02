# SIGNS — Research-Backed Rationale for the Prevyl Experience

> Authoritative design rationale for the experience rebuild (2026-06-02). Companion to `NEXT-UX-DIRECTION.md` (the founder brief). Produced from a 5-lane web-research pass (first-run intro · hero/5-second-test · long-wait loading · result reveal · premium-craft/trust). Every decision below is grounded in cited evidence. Where a pattern could backfire if overdone, the counter-evidence is called out. This doc governs four things: the first-run preview, the hero, the classify→loading→result sequence, and the cross-cutting craft/trust/honesty layer.

---

## 1. FIRST-RUN PREVIEW / INTRO

The wait is real (~40s up to 80s), so the intro must teach the workflow *and* set honest expectations before the user spends their first minute.

**KEY DECISIONS**

- **Demo a real, replayed classification (the actual product running), not a feature tour or tooltips** → interactive walkthroughs that let users complete a real task outperform passive tutorials; buyers will not commit without seeing the product work first → [Nielsen Norman: Onboarding Tutorials](https://www.nngroup.com/articles/onboarding-tutorials/), [Arcade: SaaS Demo Best Practices](https://www.arcade.software/post/saas-demo-best-practices).
- **Use a real, high-volume Indian export product as the sample (e.g. "stainless steel hex bolts M10" → ITC-HS leaf), never a toy like "widgets"** → specific real examples let exporters pattern-match "it works for my category"; toy samples signal a toy classifier → [Ipsos: B2B Sample Quality](https://www.ipsos.com/en-us/right-blend-quick-guide-ensuring-high-quality-b2b-market-research-sample).
- **Show the full triad in the preview: the code, the cited rationale, AND the confidence band (word, never %)** → code-only is far less persuasive; band-plus-rationale together signal honesty and reduce perceived legal risk → [Clutch: 8 Pillars of B2B Trust](https://clutch.co/resources/8-pillars-trust-examples-b2b-credibility).
- **Let the preview's wait *feel* like the real wait (compressed but honest staging), don't snap to an instant result** → if the demo resolves instantly, users distrust the real 40s wait and assume something is broken on their own run → [Buell & Norton: The Labor Illusion](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376).
- **Once-only, skippable at every step, never re-shown to returning visitors; auto-dismiss into the hero if ignored** → forced/repeating tours raise drop-off 30-50%; every additional gated step costs activation; a free tool with zero signup cannot afford ceremonial friction → [SaaS Factor: Onboarding Drop-Off](https://www.saasfactor.co/blogs/why-users-drop-off-during-onboarding-and-how-to-fix-it).
- **Frame the wait as care, not horsepower: "careful, so it tells you when to verify", not "powerful AI"** → transparency-as-care triggers reciprocity and sets the verify-before-filing expectation, lowering misuse and support load → [Buell & Norton: The Labor Illusion](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376).

**Why this, not that.** Not an autoplay marketing video (≈30-40% completion vs ≈60-67% for interactive, and it removes the agency risk-averse brokers want) and not a forced multi-step tour that traps the user behind a wall before they can type. The intro earns the wait by demonstrating it once, honestly, on a product they recognise.

---

## 2. THE HERO (simple but complete, passes the 5-second test)

The hero must answer "what does this do?" in one glance and make the input the obvious next move. Today's clutter (chip walls, trust strips, specimen previews above the input) gets stripped.

**KEY DECISIONS**

- **One outcome headline (≤8 words) + one primary input + one supporting line. Nothing else competes** → the hero is the first fixation zone and each extra choice raises decision time (Hick's Law); multi-CTA / badge-heavy heroes underperform → [NN/G: Testing Visual Design](https://www.nngroup.com/articles/testing-visual-design/), [Parallel: Hick's Law](https://www.parallelhq.com/blog/what-hick-s-law).
- **Make the input field the visual hero, with a real placeholder ("e.g. stainless steel hex bolts M10")** → a large, focused input is self-evident ("I type here, I get a result") faster than any clever copy; form-first heroes cut friction → [SaaS Hero: B2B Landing Optimization](https://www.saashero.net/design/optimize-b2b-landing-pages/).
- **Keep ONE explanatory sentence above the input ("Enter a product description to get the correct 8-digit ITC-HS export code")** → an input alone can read as a generic search bar; one sentence anchors the high-stakes purpose without clutter → [SaaS Hero: B2B Landing Optimization](https://www.saashero.net/design/optimize-b2b-landing-pages/).
- **No trust strips, no logo walls, no "Trusted by N exporters" in the hero** → for a tool, a real working result is the trust signal; premature badges read as defensive, and unverifiable counts violate our no-fabricated-stats rule → [SaaS Hero: Trust Signals](https://www.saashero.net/design/landing-page-design-trust-signals/).
- **No specimen result card above the input; if shown, it lives below the fold as "how it works"** → 54%+ of users stay above the fold and a stray example code is meaningless on first sight; the hero answers "what do I do," the result section answers "what do I get" → [Baymard: Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux), [CXL: Hero Image](https://cxl.com/blog/hero-image/).
- **If starter chips are used, place 3-4 broad category chips ("Metals", "Textiles", "Electronics") directly below the input, never above it** → chips are a safety net for the hesitant, but as a header they read as a menu and add friction; broad categories avoid anchoring users to one exact product → [Raw Studio: Contextual Prompts](https://raw.studio/blog/the-ux-hack-that-helps-ai-capture-user-intent/).

**Why this, not that.** Not an explanation-heavy hero stacked with disclaimers, testimonials and worked examples. The bottleneck for first-timers is clarity, not reassurance; risk is best handled in the *result* (confidence band + verify callout) and in a below-the-fold "how it works," so the 5-second test still holds.

---

## 3. CLASSIFY → LOADING → RESULT (the signature long-wait moment)

This is the heart of the rebuild. The wait is genuinely long, so we convert it into evidence of rigour, then pay it off with a calm single-hero reveal. Honest stages only. No fake bars, no countdowns.

**KEY DECISIONS — the loading state**

- **Show the real pipeline as honest, named stages ("Parsing product description" → "Searching the ITC-HS tariff database" → "Checking exclusions and precedents" → "Calibrating the confidence band")** → visible labour makes users *prefer* a longer wait to an instant result and value the outcome higher; it also legitimises our genuine multi-step reasoning → [Buell & Norton: The Labor Illusion](https://www.hbs.edu/faculty/Pages/item.aspx?num=40158), [Cloud Four: Truth, Lies and Progress Bars](https://cloudfour.com/thinks/truth-lies-and-progress-bars/).
- **Use a skeleton of the actual result card (code slot, band slot, rationale slot) instead of a spinner; spinners are for <10s only** → skeletons that mirror the final layout are perceived 30-50% faster and pre-teach the output format so the reveal lands without shock → [NN/G: Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/), [NN/G: Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/).
- **No fake progress bar and no countdown timer; if showing duration, give an honest range ("usually 35-60 seconds, depends on the description")** → a bar that loops, stalls at 90%, or jumps breaks an implicit contract and destroys trust permanently; honest uncertainty beats fake precision → [Cloud Four: Truth, Lies and Progress Bars](https://cloudfour.com/thinks/truth-lies-and-progress-bars/).
- **Rotate 6-10 domain micro-lessons during the wait (what a confidence band means, why ITC-HS adds Indian specificity), not generic "pro tips"** → occupied time feels shorter and the wait doubles as just-in-time onboarding for non-expert exporters; generic tips feel out of place in a high-stakes tool → [Maister: Psychology of Waiting Lines](https://davidmaister.com/articles/1/52/).
- **Keep motion slow and serene (3-5s breathing-pace shimmer, soft easing), matched to the warm-paper customs-ledger theme** → fast/jittery motion signals panic and raises stress in an already tense filing moment; slow motion signals control → [NN/G: Designing for Waits](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/).

**KEY DECISIONS — the result reveal**

- **Reveal the 8-digit code as a single centred hero first, then progressively disclose rationale, sources and band below** → after a long wait attention is heightened but fatigued; one focal payoff satisfies "worth it" while staggered disclosure respects cognitive load → [Stripe: Payment Successful Pages](https://stripe.com/resources/more/payment-successful-pages).
- **Entrance-only motion (single 300-500ms fade/gentle-scale), no loops, no pulse, and the archival seal is a process mark, never a checkmark** → looping/oversized motion feels cheap and fatiguing after 40s; a tick would imply false certainty, which our honesty rules forbid → [Pope Tech: Accessible Animation](https://blog.pope.tech/2025/12/08/design-accessible-animation-and-movement/).
- **Confidence is a calibrated word/band with a one-line basis ("matched 5 of 5 rule criteria" / "atypical description, manual review advised"), never a number** → verbal bands calibrate user judgment better than percentages, which invite false precision and cross-run obsession; words make uncertainty honest → [ConfTuner: Verbalized Confidence](https://arxiv.org/pdf/2508.18847).
- **Surface 2-3 specific, verifiable citations inline (the ITC-HS rule/heading text), with italic reserved strictly for verbatim quotes** → a defensible cited trail turns a compliance risk into something a broker can defend on challenge; vague or fabricated citations are catastrophic → [Thomson Reuters: Deep Research](https://legal.thomsonreuters.com/blog/what-is-deep-research-the-ai-research-assistant-that-thinks-like-a-legal-expert/).
- **Next-step affordances: prominent "Copy code", secondary "Share with broker", and a colored "Verify before filing" callout, but NO "File now" button** → copy/share match the compliance mindset; a prominent verify checkpoint is constructive friction; a file button would imply Prevyl owns legal responsibility → [IxDF: Affordances](https://ixdf.org/literature/topics/affordances/).
- **Handle the 80s timeout as a specific, actionable error (likely-ambiguous description → simplify / consult / use a broker), with retry plus alternatives, never a bare "try again"** → fast honest errors with guidance build trust; a hanging spinner or generic retry strands an expert under time pressure → [UXmatters: Handling Delays](https://www.uxmatters.com/mt/archives/2018/07/handling-delays.php).

**Why this, not that.** Not a generic spinner with "Processing…" (reads as broken at 40s) and not an everything-at-once result dump (information chaos that kills the payoff). And while a recent study warns that revealing reasoning can induce over-trust that crowds out human judgment ([arXiv 2511.04050](https://arxiv.org/html/2511.04050)), we resolve it by showing *selective* strongest evidence plus a confident-but-honest band and a verify checkpoint: rigour, not a parade of doubt.

---

## 4. CROSS-CUTTING PREMIUM CRAFT + TRUST + HONESTY

The frame around the correct code. Craft is necessary, not sufficient: the code being right is the real trust; design carries it.

**KEY DECISIONS**

- **Typographic restraint: serif display + grotesk body + monospace codes, with the single oxblood accent used only for meaning (decision points, the band), never decoration** → 46.1% of users judge credibility on visual design; premium tools use color for meaning not gradient-soup; consistent typography lifts trust → [Stanford Web Credibility](https://credibility.stanford.edu/guidelines/index.html).
- **Ruthless 4/8px spacing rhythm across every state and element** → predictable vertical rhythm lets the brain decode structure with less effort and reads as "someone thought this through"; it is an invisible but felt quality signal → [Design Systems: Space, Grids, Layouts](https://www.designsystems.com/space-grids-and-layouts/).
- **Design every edge state (no result, timeout, low confidence, empty) in the customs-ledger aesthetic with human language and a next action** → a large share of AI-generated UIs ship no empty/error state, so designed edge states are the anti-AI-slop craft signal and a trust moment → [Carlo Ciccarelli: Empty States in Fintech](https://www.carlociccarelli.com/post/mastering-empty-states-a-comprehensive-guide-to-ux-design-in-complex-applications-and-fintech).
- **Calibrated bands + "verify before filing" framed as professional rigour, never as "we might be wrong"** → honest uncertainty builds durable trust with repeat brokers and legally protects the tool; but it must read as best-practice rigour, since overdone doubt can make time-pressed users lose faith → [NN/G: Communicating Trustworthiness](https://www.nngroup.com/articles/communicating-trustworthiness/).
- **WCAG 2.2 AA from the start: keyboard nav, 4.5:1 contrast, visible themed focus rings, band conveyed by text+color (never color alone), full `prefers-reduced-motion` support (instant appearance, not slowed)** → accessibility is visible craft and a trust *maintainer*; color-only confidence excludes users and fails AA; reduced-motion prevents physical distress at the reveal → [W3C WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion).
- **Fast baseline performance (LCP < 2s) even though classification is 40-80s; consistency of accent, type, spacing and motion across every touchpoint** → a slow-loading shell reads as an unstable/sketchy tool regardless of the honest wait; consistency is the trust multiplier users internalise within a few interactions → [web.dev: Core Web Vitals Business Impact](https://web.dev/case-studies/vitals-business-impact).

**Why this, not that.** Not "flawless craft in every pixel" for its own sake. The evidence supports a *minimum-competence + honest-communication + consistency* model: a busy broker on a 4G laptop crosses the trust threshold with clean, consistent, accessible, honest design long before bespoke micro-rhythm pays off. Spend craft where it carries the code, not where it only impresses other designers.

---

## FAILURE MODES WE WILL AVOID

- **Toy or vague demo sample** ("widgets", "plastic items") → users infer the real classifier is equally vague; always use a real high-volume export product.
- **Instant demo result** → undercuts belief in the real 40s wait; the preview must stage honestly.
- **Forced / repeating / non-skippable onboarding, or a mid-demo email gate** → 30-50% drop-off, feels like gatekeeping on a free tool.
- **Hero clutter**: chip walls above the input, trust strips, logo walls, unverifiable "trusted by N", or a specimen card above the fold → all fail the 5-second test or fabricate stats.
- **Fake progress bar or countdown timer** → loops/stalls/jumps break an implicit contract and permanently destroy trust; banned outright.
- **Spinner-only / "Processing…" for a 40s wait** → reads as hung; use honest staged skeleton instead.
- **Claiming effort that doesn't exist** ("checks 50 databases") → dishonest labour illusion backfires when discovered.
- **Numeric confidence (e.g. "87%")** → false precision, cross-run obsession; bands only, never a number.
- **Archival seal rendered as a checkmark / "verified" tick** → implies certainty; the seal is a *process* mark only.
- **Everything-at-once result dump** → information chaos kills the payoff; reveal code first, disclose the rest.
- **Looping/pulsing/oversized reveal motion, or ignoring reduced-motion** → cheap, fatiguing, and a vestibular-accessibility failure.
- **Vague or fabricated citations** ("matches product type", non-existent rules) → catastrophic in a filing context; italic must be verbatim-quote only.
- **A "File now" button** → implies Prevyl owns legal responsibility; offer copy/share/verify instead.
- **Bare "try again" on timeout** → strands the user; give a specific cause + alternatives.
- **Color-only confidence band, invisible focus rings, slow shell load** → AA failures and instability signals.
- **Over-doing doubt** ("we might be wrong", "23% audit chance") → panics time-pressed brokers; frame verify as professional rigour.
- **Em-dashes / AI-tell copy** → use periods or a middot; keep copy plainly human.

---

## DECISION SUMMARY TABLE

| Element | Decision | One-line why | Source |
|---|---|---|---|
| First-run format | Real replayed classification, interactive, once-only, skippable | Showing the product beats tours; forced tours drop 30-50% | [NN/G Onboarding](https://www.nngroup.com/articles/onboarding-tutorials/) |
| Demo sample | Real high-volume Indian export product, not a toy | Lets exporters pattern-match "works for my category" | [Ipsos](https://www.ipsos.com/en-us/right-blend-quick-guide-ensuring-high-quality-b2b-market-research-sample) |
| Demo content | Code + cited rationale + word band together | Code-only is far less persuasive; triad signals honesty | [Clutch](https://clutch.co/resources/8-pillars-trust-examples-b2b-credibility) |
| Demo wait | Honest staged wait, not instant | Instant demo undercuts belief in the real 40s wait | [Buell & Norton](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376) |
| Hero structure | One headline + one input + one line; nothing else | First fixation zone; each extra choice slows decisions | [NN/G Visual Design](https://www.nngroup.com/articles/testing-visual-design/) |
| Hero centerpiece | Input field as the hero, real placeholder | Self-evident interaction beats clever copy | [SaaS Hero](https://www.saashero.net/design/optimize-b2b-landing-pages/) |
| Hero trust | No logo/trust strips above the input | A real working result is the trust signal | [SaaS Hero Trust](https://www.saashero.net/design/landing-page-design-trust-signals/) |
| Hero chips | 3-4 broad category chips below the input, if any | Safety net, not a menu; avoids anchoring | [Raw Studio](https://raw.studio/blog/the-ux-hack-that-helps-ai-capture-user-intent/) |
| Loading stages | Honest named pipeline stages | Visible labour makes a long wait preferred + valued | [Buell & Norton](https://www.hbs.edu/faculty/Pages/item.aspx?num=40158) |
| Loading visual | Skeleton of the result card, not a spinner | Perceived 30-50% faster; pre-teaches output | [NN/G Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/) |
| Progress | No fake bar / no countdown; honest range only | Broken bars destroy trust permanently | [Cloud Four](https://cloudfour.com/thinks/truth-lies-and-progress-bars/) |
| Wait content | 6-10 rotating domain micro-lessons | Occupied time feels shorter; doubles as onboarding | [Maister](https://davidmaister.com/articles/1/52/) |
| Wait motion | Slow 3-5s serene shimmer, soft easing | Fast motion signals panic; slow signals control | [NN/G Waits](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/) |
| Result reveal | Single hero code first, then disclose the rest | One focal payoff; staggered respects cognitive load | [Stripe](https://stripe.com/resources/more/payment-successful-pages) |
| Reveal motion | Entrance-only 300-500ms; seal ≠ checkmark | Loops feel cheap; a tick implies false certainty | [Pope Tech](https://blog.pope.tech/2025/12/08/design-accessible-animation-and-movement/) |
| Confidence | Calibrated word/band + one-line basis, never % | Verbal bands calibrate judgment; % invites false precision | [ConfTuner](https://arxiv.org/pdf/2508.18847) |
| Citations | 2-3 specific verifiable rules; italic = verbatim only | Defensible trail a broker can stand behind | [Thomson Reuters](https://legal.thomsonreuters.com/blog/what-is-deep-research-the-ai-research-assistant-that-thinks-like-a-legal-expert/) |
| Actions | Copy + Share + Verify callout; NO "File now" | Matches compliance mindset; no liability claim | [IxDF Affordances](https://ixdf.org/literature/topics/affordances/) |
| Timeout | Specific cause + alternatives, not "try again" | Fast honest errors with guidance build trust | [UXmatters](https://www.uxmatters.com/mt/archives/2018/07/handling-delays.php) |
| Type + color | Serif/grotesk/mono; oxblood for meaning only | Color-as-meaning reads premium, not AI-slop | [Stanford Web Credibility](https://credibility.stanford.edu/guidelines/index.html) |
| Spacing | Ruthless 4/8px rhythm everywhere | Predictable rhythm is a felt quality signal | [Design Systems](https://www.designsystems.com/space-grids-and-layouts/) |
| Edge states | Designed, human, themed, with a next action | Designed edge states = craft proof, anti-AI-slop | [Ciccarelli](https://www.carlociccarelli.com/post/mastering-empty-states-a-comprehensive-guide-to-ux-design-in-complex-applications-and-fintech) |
| Accessibility | WCAG 2.2 AA; text+color band; reduced-motion | Visible craft + trust maintainer; color-only fails AA | [W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) |
| Performance | LCP < 2s shell despite the 40-80s classify | Slow shell reads as an unstable/sketchy tool | [web.dev CWV](https://web.dev/case-studies/vitals-business-impact) |
| Honesty tone | Verify-before-filing as rigour, not "we may be wrong" | Honest but not doubt-parade; over-doubt panics brokers | [Standard Beagle](https://standardbeagle.com/designing-trust-in-ai-products/) |

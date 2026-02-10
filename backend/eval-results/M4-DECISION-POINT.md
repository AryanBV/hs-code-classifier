# M4 Decision Point — 2026-02-10

## Accuracy: Brain v1 on Clean GT

| Metric | Broken GT (old) | Clean GT (new) | Delta | Target |
|--------|----------------|----------------|-------|--------|
| Routing | 87.3% | 88.1% | +0.8 | ≥85% |
| Chapter | 68.2% | 82.3% | +14.1 | ≥90% |
| Heading | 35.1% | 53.4% | +18.3 | — |
| 8-digit Code | 17.9% | 31.5% | +13.7 | ≥75% |
| Weighted | 43.1% | 58.4% | +15.2 | — |

Suite: 386 clean cases (0 removed in ARY-50, 115 GT corrections applied). Delta is from GT fixes, not pipeline changes — same code ran both times. 302 of 311 correctly-routed classify cases have code GT.

## Where Failures Happen

204 code-level failures out of 302 classify cases with code GT (67.5% failure rate).

| Bucket | Count | % of Failures | Fixable? |
|--------|-------|--------------|----------|
| Right chapter, wrong heading | 81 | 39.7% | Yes |
| Brain routing wrong | 53 | 26.0% | Yes |
| Right heading, wrong code | 45 | 22.1% | Yes |
| Close miss | 23 | 11.3% | Partially |
| Genuine ambiguity | 2 | 1.0% | No |

Cascade waterfall (filtered to GT-available cases):
- 311 correctly-routed classify → 256 chapter correct (82.3%) → 166/249 heading correct (66.7%) → 96/166 code correct (57.8%)
- Each stage compounds: 0.823 × 0.667 × 0.578 = **31.7% theoretical code accuracy** — matches observed 31.5%.

## Top 3 Failure Patterns (with examples)

### Pattern 1: Right chapter, wrong heading — 81 cases (39.7%)

Heading search relies on pgvector semantic similarity with no LLM re-ranking. Hardcoded rules cover ~12 chapters only.

- **TC003** "rubber oil seals for automobile engines" → Expected 8708 (parts), got 8706 (chassis). Semantic similarity chose wrong heading within Ch.87.
- **TC304** "denim jeans men's cotton woven" → Expected 6203 (trousers), got 6205 (shirts). Heading-level distinction lost in embeddings.
- **DB004** "Cumin, than black: seed quality" → Expected 0909 (anise/cumin), got 0910 (ginger/spices). Fine-grained spice heading distinctions missed.

**Root cause:** pgvector cosine similarity cannot distinguish between headings within the same chapter — descriptions are too semantically similar. No LLM verification at heading level.
**Fix approach:** Add LLM re-ranking of top 3-5 heading candidates with chapter notes context.
**Estimated gain:** If fixed, +81 cases potentially correct at heading level → cascading to +26% heading accuracy.

### Pattern 2: Brain routing wrong — 53 cases (26.0%)

Top chapter confusions: Ch.61↔62 (10 cases, knitted vs woven), Ch.29→30 (5, bulk API vs pharma formulation), Ch.52→55 (4, cotton vs synthetic fiber), Ch.85→87 (3, electrical parts classified as vehicle parts).

- **TC010** "windscreen wiper motor 12V automotive" → Expected Ch.85 (electrical motors), got Ch.87 (vehicles). Brain over-indexes on "automotive" keyword.
- **TC205** "paracetamol powder bulk API" → Expected Ch.29 (organic chemicals), got Ch.30 (pharmaceuticals). Classic API-vs-formulation confusion.
- **DB062** "Skirts and divided skirts: Of wool" → Expected Ch.61 (knitted), got Ch.62 (woven). Knitted-vs-woven distinction missing from query.

**Root cause:** Brain has no domain-specific disambiguation rules for structurally similar chapters. Textile (61/62) accounts for 10 of 53 cases alone.
**Fix approach:** Add confusing-pair detection + disambiguation logic in Brain prompt. Improve textile/chemical domain coverage.
**Estimated gain:** Fixing Ch.61↔62 and Ch.29↔30 alone = +15 cases → +5% chapter accuracy.

### Pattern 3: Right heading, wrong code — 45 cases (22.1%)

Of 70 total code failures (heading correct), 36 (51.4%) selected an "Other"/general code (ending in .00 or .90) when a specific code existed. The code selector LLM has a "prefer general" bias in its prompt.

- **TC005** "plastic bumper for Toyota Innova" → Expected 8708.10.90, got 8708.99.00 (catch-all "Other parts").
- **TC207** "insulin injection 100IU/ml vial" → Expected 3004.31.10 (insulin-specific), got 3004.90.00 (catch-all).
- **DB122** "DC motors: Wiper motor" → Expected 8501.31.13 (specific DC motor), got 8501.10.00 (general motor).

**Root cause:** Code selector prompt contains "prefer the more general one" bias. India-specific tariff line distinctions (8-digit codes) require domain knowledge the LLM lacks.
**Fix approach:** Remove general-code bias from prompt. Add India-specific code descriptions and selection hints. Pass full product context to LLM.
**Estimated gain:** Removing "Other" code bias could fix ~36 cases → +12% code accuracy.

## Per-Category Accuracy

| Category | Cases | Code Accuracy | Worst Failure Bucket |
|----------|-------|--------------|---------------------|
| food_agri | 72 | 47.2% | Right chapter, wrong heading (13) |
| metal | 22 | 36.4% | Right chapter, wrong heading (8) |
| chemical | 42 | 35.7% | Right chapter, wrong heading (13) |
| electronics | 30 | 33.3% | Right chapter, wrong heading (9) |
| ambiguous | 13 | 30.8% | Brain routing wrong (3) |
| automotive | 34 | 23.5% | Right chapter, wrong heading (16) |
| textile | 36 | 22.2% | Brain routing wrong (19) |
| edge_case | 45 | 22.2% | Right chapter, wrong heading (13) |
| other | 8 | 12.5% | Right chapter, wrong heading (3) |

Every category is below 50%. Textile is worst at the chapter level (Brain confuses Ch.61/62). Automotive is worst at heading level (16 heading failures within Ch.87). Food/agri has the best accuracy but still fails at India-specific 8-digit codes (spice sub-codes).

## Decision

**Current code accuracy: 31.5%. This is 43.5 percentage points below our 75% target.**

### PATH C (<55%): Fundamental rethink

The pipeline loses accuracy at every stage, and the losses compound multiplicatively. No single fix gets us to 75%.

**Assessment:** 75% code accuracy requires ~90% at each stage (0.90³ = 0.73). Currently: chapter 82%, heading 67%, code 58%. The gap is structural, not incremental.

**Three-pronged fix (in priority order by ROI):**

1. **Heading re-ranking with LLM** (81 cases, 39.7% of failures) — Highest ROI. Add LLM re-ranking of top heading candidates using chapter notes. This is the single biggest bottleneck. Estimated: heading accuracy 67% → 80%+.

2. **Code selector prompt fix** (45+23 cases, 33.3% of failures) — Remove "prefer general" bias. Add India-specific tariff line context. 36 of 70 code failures chose catch-all codes. Estimated: code accuracy 58% → 70%+.

3. **Brain chapter routing improvements** (53 cases, 26.0% of failures) — Fix top confusing pairs (61/62 textiles, 29/30 pharma, 85/87 auto-electrical). Estimated: chapter accuracy 82% → 88%.

**Combined optimistic estimate:** 0.88 × 0.80 × 0.70 = **49.3% code accuracy** — still below 75%. Reaching 75% will also require GT gap fills (9 cases without heading/code GT), routing loss recovery (40 classify→ask cases), and iterative prompt refinement.

## Recommended Next Action

Start with **heading re-ranking** (Pattern 1) because it is the largest single bucket (81 cases), affects all categories, and the fix is well-defined: LLM re-ranks top 3-5 pgvector heading candidates using chapter notes. This unblocks code-level accuracy improvements downstream.

# Brain v1 Failure Analysis Report
**Date:** 2026-02-10
**Eval run:** brain-master-2026-02-10 (386 cases)
**Scope:** Analysis of WHERE and WHY accuracy drops in the classification pipeline

---

## 1. Failure Cascade

### Routing
| Metric | Count | Percentage |
|--------|-------|------------|
| Total cases | 386 | — |
| Routing correct | 337 | 87.3% |
| classify → ask (lost accuracy) | 40 | — |
| classify → reject/error | 3 | — |

### Ground Truth Coverage
| Level | Cases with GT | Missing GT |
|-------|---------------|------------|
| Chapter | 308 / 308 | 0 |
| Heading | 253 / 308 | 55 |
| Code | 253 / 308 | 55 |

> **Critical note:** The eval report metrics (heading 35.2%, code 17.9%) are **severely deflated** because 55 cases lack heading/code ground truth and are counted as failures.

### Classification Cascade (filtered to ground-truth-available cases)
| Stage | Correct | Denominator | Accuracy |
|-------|---------|-------------|----------|
| Chapter | 210 | 308 | 68.2% |
| Heading (correct chapter + has GT) | 108 | 179 | 60.3% |
| Code (correct heading + has GT) | 55 | 108 | 50.9% |

### Cascade Waterfall
```
386 total cases
├─ 337 routing correct (87.3%)
│  └─ 308 classify cases
│     ├─ 210 chapter correct (68.2%)
│     │  ├─ 108/179 heading correct with GT (60.3%)
│     │  │  └─ 55/108 code correct with GT (50.9%)
│     │  └─ 31 cases without heading GT (cannot evaluate)
│     └─ 98 chapter wrong
├─ 49 routing wrong
│  ├─ 40 classify→ask
│  ├─ 3 classify→reject/error
│  └─ 6 other misroutes
```

## 2. Brain vs Chapter-Router Accuracy

**Sample:** 50 cases, stratified by category from 308 classify cases.

| Metric | Brain | Router |
|--------|-------|--------|
| Chapter accuracy | 88.0% | 70.0% |
| Correct count | 44/50 | 35/50 |

### Overlap Matrix
| Outcome | Count | Meaning |
|---------|-------|---------|
| Both correct | 34 | Brain and router agree correctly |
| Brain-only right | 10 | **FREE WINS** — Brain recovers from router failures |
| Router-only right | 1 | **REGRESSION RISK** — trusting Brain would break these |
| Both wrong | 5 | Neither got it right |

**Net gain from trusting Brain: 10 - 1 = +9 cases**

**Verdict: Brain accuracy 88.0% > 80% → TRUST Brain's chapters directly.**

### Brain-Only-Right Cases (10 recovery opportunities)

- **DB167** [food_agri]: "Chemically pure maltose for export" — expected Ch.17, Brain=[17], Router=Ch.29
- **DB159** [food_agri]: "Groats and meal : -- maize (corn)" — expected Ch.11, Brain=[11], Router=Ch.10
- **DB012** [food_agri]: "Barnyard (Echinochloa esculenta (L.)) for export" — expected Ch.10, Brain=[10], Router=Ch.07
- **DB193** [chemical]: "I need to export chemically modified form of natural rubber including graft rubber" — expected Ch.40, Brain=[30,40,95], Router=Ch.29
- **S5-AUTO-022** [automotive]: "alternator 12V 100A for car engine" — expected Ch.85, Brain=[85], Router=Ch.87
- **DB057** [textile]: "Single yarn, of combed fibres : -- for export" — expected Ch.52, Brain=[55,52], Router=Ch.55
- **S5-SIMP-015** [textile]: "bath towel cotton terry cloth blue" — expected Ch.63, Brain=[63], Router=Ch.52
- **DB113** [electronics]: "I need to export with self-contained electric motor : -- saws" — expected Ch.84, Brain=[84], Router=Ch.85
- **DB126** [electronics]: "Motor starters for DC motors" — expected Ch.85, Brain=[85], Router=Ch.87
- **S5-AMB-015** [ambiguous]: "drone with camera quadcopter aerial photography" — expected Ch.88, Brain=[88], Router=Ch.37

### Router-Only-Right Cases (1 regression risk)

- **DB056** [textile]: "Cotton sewing thread, not" — expected Ch.52, Brain=[55], Router=Ch.52

### Per-Category Brain Accuracy
| Category | Brain% | Router% | Brain-only | Router-only | Cases |
|----------|--------|---------|------------|-------------|-------|
| food_agri | 92% | 67% | 3 | 0 | 12 |
| edge_case | 86% | 86% | 0 | 0 | 7 |
| chemical | 100% | 86% | 1 | 0 | 7 |
| automotive | 100% | 83% | 1 | 0 | 6 |
| textile | 83% | 67% | 2 | 1 | 6 |
| electronics | 80% | 40% | 2 | 0 | 5 |
| metal | 75% | 75% | 0 | 0 | 4 |
| ambiguous | 50% | 0% | 1 | 0 | 2 |
| other | 100% | 100% | 0 | 0 | 1 |

## 3. Chapter Failure Patterns

**98 cases** where chapter was wrong (of 308 correctly-routed classify cases).

### Top Confusion Patterns

**Ch.85 → Ch.87: 8 case(s)**
- TC010 [automotive]: "windscreen wiper motor 12V automotive"
- DB122 [electronics]: "DC motors: ----Wiper motor for export"
- DB123 [electronics]: "I need to export magnetic media : -- cards incorporating a magnetic stripe"
- ... and 5 more

**Ch.61 → Ch.62: 7 case(s)**
- DB061 [textile]: "Ensembles : -- Of cotton"
- DB062 [textile]: "Skirts and divided skirts : -- Of wool or fine animal hair for export"
- DB063 [textile]: "I need to export jackets and blazers : -- of cotton"
- ... and 4 more

**Ch.62 → Ch.52: 3 case(s)**
- TC304 [textile]: "denim jeans men's cotton woven"
- EC023 [edge_case]: "cotton jacket men woven"
- DB074 [textile]: "chadars, cotton: ---- White bleached"

**Ch.73 → Ch.84: 3 case(s)**
- DB106 [metal]: "Cookers and kitchen stoves"
- DB109 [metal]: "Low pressure cylinder (working pressure upto 35.2 kg/sq.cm than LPG)"
- DB110 [metal]: "Cookers and kitchen stoves made in India"

**Ch.84 → Ch.85: 3 case(s)**
- DB113 [electronics]: "I need to export with self-contained electric motor : -- saws"
- S5-AMB-012 [ambiguous]: "USB flash drive 64GB data storage"
- S5-SIMP-019 [electronics]: "laptop computer 15 inch Windows Intel i5"

**Ch.11 → Ch.10: 3 case(s)**
- DB158 [food_agri]: "I need to export starches : -- maize (corn) starch"
- DB159 [food_agri]: "Groats and meal : -- maize (corn)"
- DB160 [food_agri]: "Wheat gluten, whether or not dried made in India"

**Ch.17 → Ch.29: 3 case(s)**
- DB166 [food_agri]: "Chemically pure fructose"
- DB167 [food_agri]: "Chemically pure maltose for export"
- DB170 [food_agri]: "Dextrose: ---- In solid form made in India"

**Ch.65 → Ch.87: 2 case(s)**
- TC015 [automotive]: "motorcycle helmet ISI approved"
- S5-AMB-004 [ambiguous]: "motorcycle helmet protective headgear"

**Ch.42 → Ch.87: 2 case(s)**
- EC020 [edge_case]: "leather vest motorcycle"
- S5-AMB-005 [ambiguous]: "car seat cover leather custom fit"

**Ch.84 → Ch.87: 2 case(s)**
- EC036 [edge_case]: "diesel engine for truck"
- DB116 [electronics]: "Self-propelled trucks powered by an electric motor"

**Ch.40 → Ch.84: 2 case(s)**
- EC044 [edge_case]: "rubber hose hydraulic reinforced"
- S5-AUTO-025 [automotive]: "timing belt rubber reinforced for Honda engine"

**Ch.10 → Ch.XX: 2 case(s)**
- DB015 [food_agri]: "--- Parboiled: ---- Rice, GI recognised made in India"
- DB019 [food_agri]: "--- Parboiled: ---- Basmati rice"

**Ch.52 → Ch.63: 2 case(s)**
- DB053 [textile]: "I need to export furnishing fabrics (excluding pile and chenille fabrics)"
- DB055 [textile]: "Furnishing fabrics (excluding pile and chenille fabrics) made in India"

**Ch.72 → Ch.73: 2 case(s)**
- DB093 [metal]: "I need to export of silico-manganese steel"
- DB100 [metal]: "Waste and scrap of cast iron made in India"

**Ch.63 → Ch.52: 2 case(s)**
- S5-SIMP-014 [textile]: "cotton bed sheet queen size white"
- S5-SIMP-015 [textile]: "bath towel cotton terry cloth blue"

### Per-Category Chapter Accuracy
| Category | Correct | Total | Accuracy |
|----------|---------|-------|----------|
| food_agri | 55 | 71 | 77.5% |
| edge_case | 33 | 44 | 75.0% |
| chemical | 32 | 43 | 74.4% |
| automotive | 30 | 37 | 81.1% |
| textile | 16 | 35 | 45.7% |
| electronics | 19 | 31 | 61.3% |
| metal | 16 | 23 | 69.6% |
| ambiguous | 4 | 15 | 26.7% |
| other | 5 | 9 | 55.6% |

## 4. Heading Failure Patterns

**71 cases** where chapter was correct but heading was wrong (of 179 correct-chapter cases with heading ground truth).

### Top Heading Confusions

**0909 → 0910 (Ch.09): 3 case(s)**
- TC112 [food_agri]: "cumin seeds whole jeera"
- DB004 [food_agri]: "Cumin, than black: ---- seed quality"
- DB006 [food_agri]: "Cumin, black :---- Of seed quality"

**1008 → 1007 (Ch.10): 3 case(s)**
- DB014 [food_agri]: "Kodo (Paspalum scrobiculatum (L.))"
- DB016 [food_agri]: "Proso (Panicum miliaceum (L.))"
- DB020 [food_agri]: "Fonio (Digitaria spp) made in India"

**8708 → 8706 (Ch.87): 2 case(s)**
- TC003 [automotive]: "rubber oil seals for automobile engines"
- TC009 [automotive]: "fuel injection pump for car"

**7113 → 7110 (Ch.71): 2 case(s)**
- DB084 [metal]: "platinum :----Studded with diamonds heading 7104"
- DB090 [metal]: "Of platinum :----Studded with diamonds of heading 7102 made in India"

**7113 → 7108 (Ch.71): 2 case(s)**
- DB085 [metal]: "Of gold: ----Studded with diamonds of heading 7104 made in India"
- DB086 [metal]: "Of gold: ----Unstudded"

**8708 → 8713 (Ch.87): 1 case(s)**
- TC004 [automotive]: "aluminium alloy wheels for cars"

**8708 → 8714 (Ch.87): 1 case(s)**
- TC005 [automotive]: "plastic bumper for Toyota Innova"

**8708 → 8709 (Ch.87): 1 case(s)**
- TC006 [automotive]: "clutch plate assembly for Tata truck"

**8421 → 8408 (Ch.84): 1 case(s)**
- TC008 [automotive]: "air filter for diesel engine truck"

**4011 → 4012 (Ch.40): 1 case(s)**
- TC013 [automotive]: "truck tyre 315/80R22.5 radial"

**2924 → 2909 (Ch.29): 1 case(s)**
- TC205 [chemical]: "paracetamol powder bulk API"

**2918 → 2936 (Ch.29): 1 case(s)**
- TC206 [chemical]: "ibuprofen raw material powder"

**3004 → 3002 (Ch.30): 1 case(s)**
- TC207 [chemical]: "insulin injection 100IU/ml vial"

**3004 → 3005 (Ch.30): 1 case(s)**
- TC208 [chemical]: "povidone iodine solution 5% antiseptic"

**2106 → 2104 (Ch.21): 1 case(s)**
- TC210 [chemical]: "vitamin C tablets 1000mg food supplement"

### Root Cause Analysis

The heading searcher uses **pure pgvector cosine similarity** with NO re-ranking. Candidates are returned in embedding distance order. There is no LLM-based heading selection (TODO: ARY-42). This means:
1. Semantically similar but wrong headings outrank the correct one
2. Headings with more general descriptions tend to match better than specific ones
3. No chapter-notes-based heading disambiguation

## 5. Code Failure Patterns

**53 cases** where heading was correct but 8-digit code was wrong (of 108 correct-heading cases with code ground truth).

### "Other"/General Code Bias

**16 / 53 code failures (30.2%) selected a catch-all or general code** (ending in .00 or .90).

This is caused by the code selector prompt (code-selector.ts line 107):
> "If uncertain between codes, **prefer the more general one**"

This directly biases the LLM toward "Other" and "not elsewhere specified" codes.

### Example Code Failures

- **TC014** [automotive]: "inner tube for motorcycle tyre"
  - Expected: `4013.90.00` → Got: `4013.90.20`
- **TC101** [food_agri]: "arabica coffee beans grade A plantation"
  - Expected: `0901.11.10` → Got: `0901.11.11`
- **TC102** [food_agri]: "robusta coffee beans raw green"
  - Expected: `0901.11.90` → Got: `0901.11.45`
- **TC103** [food_agri]: "roasted coffee beans whole not ground"
  - Expected: `0901.21.00` → Got: `0901.11.45`
- **TC104** [food_agri]: "instant coffee powder spray dried"
  - Expected: `2101.11.00` → Got: `2101.11.20`
- **TC105** [food_agri]: "freeze dried soluble coffee granules"
  - Expected: `2101.11.00` → Got: `2101.11.20`
- **TC106** [food_agri]: "coffee extract liquid concentrate"
  - Expected: `2101.11.00` → Got: `2101.12.00` **← "Other" code**
- **TC107** [food_agri]: "black pepper whole Malabar grade"
  - Expected: `0904.11.00` → Got: `0904.11.40`
- **TC108** [food_agri]: "ground black pepper powder"
  - Expected: `0904.12.00` → Got: `0904.11.40`
- **TC109** [food_agri]: "turmeric fingers whole dried"
  - Expected: `0910.30.10` → Got: `0910.30.20`

## 6. Recommended Fixes (Ranked by Impact)

### Fix 1: Pass Brain `suggested_chapters` to chapter-router
- **Addresses:** ~62 cases (extrapolated: 10/50 sample rate × 308 classify cases)
- **Evidence:** Brain accuracy 88.0% vs Router 70.0%. Brain-only-right: 10, Router-only-right: 1. Net gain: +9 cases.
- **Mechanism:** Add `suggestedChapters?: string[]` parameter to `routeToChapter()`. Use Brain's chapters to constrain semantic search or as prior weights.
- **Risk:** Low (1 regression in 50 cases). Add fallback: if Brain's chapters don't match, fall back to full search.
- **Effort:** Medium
- **Expected impact:** Chapter accuracy from 68.2% to ~80-85%

### Fix 2: Fix code selector prompt — "prefer SPECIFIC" not "general"
- **Addresses:** 16 / 53 code failures (30.2% of code-stage failures)
- **Evidence:** 30.2% of code failures selected "Other"/general codes. The prompt explicitly says "prefer the more general one."
- **Mechanism:** Change prompt rule 3 from "prefer the more general one" to "prefer the most specific code matching the product."
- **Risk:** Low (may cause some over-specification, but HS system rewards specificity)
- **Effort:** Low (single line change)
- **Expected impact:** Code accuracy from 50.9% to ~60-65%

### Fix 3: Add LLM re-ranking to heading searcher
- **Addresses:** 71 heading failures
- **Evidence:** Heading searcher uses pure pgvector similarity with no re-ranking. Semantically similar but wrong headings outrank correct ones.
- **Mechanism:** After pgvector returns top candidates, use LLM to re-rank based on product attributes and chapter notes.
- **Risk:** Medium (adds latency + LLM cost per classification)
- **Effort:** High
- **Expected impact:** Heading accuracy from 60.3% to ~70-75%

### Fix 4: Switch chapter-router LLM to strict `json_schema`
- **Addresses:** Unknown number of cases with malformed LLM responses
- **Evidence:** Chapter-router uses `json_object` (line 179 of chapter-router.ts) instead of strict `json_schema`. CLAUDE.md explicitly warns against this. Brain already uses `json_schema` correctly.
- **Mechanism:** Change `response_format` from `{ type: 'json_object' }` to `{ type: 'json_schema', json_schema: { ... } }`
- **Risk:** Low
- **Effort:** Low
- **Expected impact:** Small but prevents silent schema violations

### Fix 5: Stop dropping Brain's `industry` and `origin` attributes
- **Addresses:** Unknown (subtle context loss)
- **Evidence:** `brainToExtractedAttributes()` in router.ts drops `industry` and `origin` fields because `ExtractedAttributes` doesn't have them. This context could help heading/code selection.
- **Mechanism:** Add `industry?` and `origin?` to `ExtractedAttributes` interface, pass through pipeline.
- **Risk:** Low
- **Effort:** Low
- **Expected impact:** Small (helps edge cases where industry context matters)

## 7. Data Gaps

1. **55 classify cases lack heading/code ground truth** (Session5 supplemental + some DB cases). This makes heading and code accuracy numbers unreliable for those categories. Need to add ground truth for these cases.
2. **Brain chapter measurement is sampled** (50 of 308 cases). Full measurement would be more accurate but costs ~$0.40 for 308 API calls.
3. **Heading candidate list not logged** in eval results. Cannot determine if the correct heading was returned by pgvector but outranked, or not returned at all. Need verbose logging in heading-searcher.
4. **Per-stage confidence not logged.** The eval captures only the final composite confidence, not the component scores (chapter_confidence, heading_similarity, code_confidence). Need to log intermediate scores.
5. **No A/B test data** for prompt changes. Recommendations are based on structural analysis, not controlled experiments.

---
*Generated by `generate-report.ts` from eval results `brain-master-2026-02-10` and brain chapter accuracy data (2026-02-10T06:50:10.578Z).*
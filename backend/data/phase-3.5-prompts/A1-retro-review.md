# A1 Retroactive Quality Review

Adversarial review of 378 rows (id 2646-3023) inserted into `chapter_exclusions` by three sibling Opus subagents (A1c, A1a, A1d).

## Stats summary

| Metric | Value |
|---|---|
| Total rows inserted | 378 |
| ID range | 2646-3023 |
| A1c (positive-definition) | 30 rows (id 2646-2675) |
| A1a (section-note propagation) | 288 rows (id 2676-2963) |
| A1d (cross-candidate heading refs) | 60 rows (id 2964-3023) |
| Rows with NULL/empty redirects_to_chapter | 5 |
| Rows with NULL redirects_to_heading | 206 |
| Rows starting with "(a)" / "(b)" / "(f)" etc | 15 |
| Rows starting with "does not cover" | 8 |
| Rows containing paragraph-letter prefix | 26 |
| Mean / median excluded_product_text length | 113 / 103 chars |
| Min / max length | 19 / 356 chars |

**Per-section distribution** (top): Section XI Note 1 has 21 sub-clauses × 11 chapters = 231 rows (Ch.50/52/53/55/56/57/58/59/63 with 21 each; Ch.61/62 partial). Section XV Note 1 has 14 sub-clauses × 5 chapters = ~65 rows (Ch.76/78/79/80/81 with 5 each — partial; full Section XV note has more clauses). Section XVI Note 1 has 16 rows on Ch.85 only. Section XVII Note 5 has 4 rows on Ch.86/88.

**Per-chapter distribution** (top): Ch.56 / 63 / 85 / 59 / 57 each have 22-23 rows.

**Noise indicators**: 14 rows (id 2981-2994) have IDENTICAL excluded_product_text (Ch.39 Note 7 heading-explosion). 15 rows start with raw paragraph-letter prefix "(a)" / "(b)" / "(f)" / "(i)" / "(ii)" / "(iii)" / "(iv)". 8 rows start with "does not cover" or "does not apply" or "does not include" — raw PDF-text fragments rather than cleaned product descriptions. Multiple PDF OCR typos preserved verbatim ("manucture", "ofmetals", "basisforthe", "residuesfromthe", "chargesfor", "tract suits" instead of "track suits").

## Adversarial spot-checks

### A1c (positive-definition by restriction) — 5 weakest rules examined

**Row id=2646 — Ch.42 Note 1 'leather' definition — DELETE**
- Source note: "the term 'leather' INCLUDES chamois (including combination chamois) leather, patent leather, patent laminated leather and metallised leather."
- A1c interpretation: "Ch.42 'leather' is restricted to chamois/patent/metallised only" → excludes "imitation, synthetic, artificial or composition leather" and redirects to ch.39/59.
- **Verdict — DELETE**: This is a misinterpretation of "includes" (open list) as closed enumeration. WCO HS Note 1 here is an **expansive** definition meaning "leather" within Ch.42 *also encompasses* chamois/patent/metallised (varieties that might otherwise be argued to be classified elsewhere) — it does NOT restrict Ch.42 to only those types. Ch.42 covers ordinary leather goods (handbags, belts, gloves, saddlery) made from regular vegetable-tanned or chrome-tanned leather of Ch.41. This rule, if executed, would deflect almost every Ch.42 article to Ch.39/59 — major false positive. **DELETE.**

**Row id=2658 — Ch.44 Note 2 'densified wood' — DELETE or REDIRECT_ADJUST**
- Source note: definition of "densified wood" (chemical/physical treatment in excess of ordinary lamination producing increased density/hardness).
- A1c interpretation: "wood subjected to ordinary lamination-only treatment ... NOT 'densified wood'" → NULL redirect (no destination).
- **Verdict — DELETE**: This is a **positive definition** of what densified wood IS, not a chapter-level exclusion. Ordinary laminated wood is still in Ch.44 (heading 4412 "plywood, veneered panels and similar laminated wood"). The implementer has framed this as exclusion but there's no "Ch.44 does not cover" semantic — ordinary plywood stays in Ch.44. With NULL redirect, the rule has no actionable destination anyway. **DELETE.**

**Row id=2657 — Ch.40 Note 4 'synthetic rubber' test — KEEP (OK)**
- Source: rubber-like substances must pass vulcanisation-elongation-recovery test to qualify as "synthetic rubber" in heading 4002.
- A1c interpretation: substances failing test → exclude from Ch.40 → redirect to Ch.39.
- **Verdict — OK**: Legally correct. Substances that fail the rubber test are classified as plastics (Ch.39). Good rule.

**Row id=2672 — Ch.91 Note 2 'heading 9101 watches' — KEEP (OK)**
- Source: heading 9101 covers only watches with case wholly of precious metal or precious-metal-clad metal, or with pearls/precious/semi-precious stones, AND base-metal cases inlaid with such material.
- A1c interpretation: watches not meeting those material criteria → exclude → redirect to ch.91 heading 9102.
- **Verdict — OK**: Legally correct. Base-metal watches go to 9102, this is a real WCO rule. Good.

**Row id=2660 — Ch.57 Note 1 'carpets and other textile floor coverings' — KEEP (OK with FIX_TEXT optional)**
- Source: Ch.57 only covers floor coverings where textile material is the EXPOSED SURFACE.
- A1c interpretation: floor coverings where textile is not the exposed surface → exclude → ch.39/40/44/45/68.
- **Verdict — OK**: Correct restriction. Wood/rubber/cork floor coverings with merely a textile underlay go to their material chapter, not Ch.57. Good rule.

### A1a (section-note propagation) — 5 weakest rules examined

**Row id=2679 / 2683 / 2687 — Section VI Note 4 across Ch.29/31/34 — FIX or DELETE**
- Source note: "Where a product answers to a description in one or more of the headings in Section VI by virtue of being described by name or function and also to heading 3827, then it is classifiable in a heading that references the product by name or function and not under heading 3827."
- A1a interpretation: extracted as exclusion with NULL redirects.
- **Verdict — DELETE all 3 rows**: This is a tie-breaker rule between competing headings WITHIN Section VI (chapters 28-38), not a chapter-level exclusion. It tells the classifier which of two competing headings to pick — but it's not "Chapter X does not cover Y". With NULL redirect chapter+heading, the rule has no actionable destination. It's a GIR-style classification rule, not a chapter exclusion. Belongs in chapter_notes prompt context, not chapter_exclusions table. **DELETE.**

**Row id=2688 — Section VII Note 1 on Ch.39 — DELETE**
- Source note: classification of sets containing components from multiple Section VI/VII chapters per a heading-appropriate-to-resulting-product rule.
- A1a interpretation: NULL redirects.
- **Verdict — DELETE**: Same as above — set-classification GIR-adjacent rule, not a chapter exclusion. **DELETE.**

**Row id=2703 (and parallel rows 2724/2745/2766/2787/2808/2829/2850/2871 — Section XI Note 1(p) 'goods of Chapter 67' propagation) — FIX_TEXT**
- Source note: "goods of Chapter 67" (artificial flowers, feather articles, wigs).
- A1a captured 9 rows, each with text "goods of Chapter 67" (19 chars — at the very-short threshold).
- **Verdict — FIX_TEXT**: Text is too generic to drive FTS retrieval. Recommend expanding to "artificial flowers, feathers, prepared feathers and articles thereof, human hair wigs and other articles of Chapter 67" so the FTS index can match against product descriptions containing those terms. Same applies to all "goods of Chapter X" / "articles of Chapter X" very-short entries.

**Row id=2689 — Section XI Note 1(a) for Ch.50 — KEEP (OK)**
- Source: "animal brush-making bristles or hair (heading 0502); horsehair or horsehair waste (heading 0511)".
- A1a redirect: ch.05 → heading 0502.
- **Verdict — OK**: Correct propagation of Section XI exclusion clause to per-chapter rule. Good.

**Row id=2945 — Section XVI Note 1(c) for Ch.85 'bobbins, spools, cones...' — FIX_TEXT or REDIRECT_ADJUST**
- Source: "bobbins, spools, cops, cones, cores, reels or similar supports, of any material (for example, Chapter 39, 40, 44 or 48 or Section XV)".
- A1a redirect: ch.39, 40, 44, 48 (omits Section XV chapters 72-83).
- **Verdict — REDIRECT_ADJUST**: Section XV is mentioned in source — should add at least Ch.72/73/74/75/76/78/79/80/81 OR keep redirects minimal but include 73 (most common base-metal redirect). At a minimum add `73`. Optional.

### A1d (cross-candidate heading refs) — 5 weakest rules examined

**Rows id=2981-2994 (14 rows, Ch.39 Note 7 — "Heading 3915 does not apply to waste...") — CONSOLIDATE**
- Source: heading 3915 (plastic waste) does not apply to waste of single thermoplastic material transformed into primary forms — those go to headings 3901-3914.
- A1d emitted 14 ROWS (one per heading 3901→3914) all with IDENTICAL excluded_product_text.
- **Verdict — DELETE 13 of 14, keep 1 with cleaned text and reference the heading range**: This is noise-multiplication. The rule is ONE rule with 14 candidate target headings. Keep one row (e.g., id 2981 → redirects_to_chapter [39], redirects_to_heading "3901" as canonical anchor) OR DELETE all 14 since the rule is "stays in Ch.39 but pick a different heading" — has no chapter-routing value. The 14 rows pollute FTS results (every product containing "thermoplastic waste" hits 14 identical exclusion rules). **DELETE 13 of 14.**

**Rows id=2967-2970 (4 rows, Ch.26/28 Note 3 — "(a) slag, ash..." / "(f) precious stones...") — FIX_TEXT for id 2967, KEEP others**
- id 2967 (Ch.26): excluded_product_text has raw PDF artifacts: "basisforthe manucture of chemical compounds ofmetals, excluding ash and residuesfromthe incineration". Verbatim PDF errors preserved.
- id 2968/2969/2970 (Ch.28 Note 3 clause (f) → 3 redirects to headings 7103/7104/7105 with identical text): same noise-multiplication issue as the Ch.39 case.
- **Verdict — FIX_TEXT id 2967** (clean up "basisforthe" → "basis for the", "manucture" → "manufacture", "ofmetals" → "of metals", "residuesfromthe" → "residues from the"). DELETE 2 of 3 for id 2968/2969/2970 (keep one row with [71] redirect, drop the heading-explosion).

**Row id=2966 — Ch.26 Note 1 clause (f) "waste containing precious metal" — REDIRECT_ADJUST**
- Source: "...other waste or scrap containing precious metal or precious metal compounds, of a kind used principally for the recovery of precious metal (heading 7112 or 8549)".
- A1d redirect: only ch.85 / heading 8549.
- **Verdict — REDIRECT_ADJUST**: Source explicitly cites BOTH 7112 AND 8549. Missing redirect to ch.71 / heading 7112. UPDATE redirects_to_chapter to [71, 85].

**Rows id=3005-3011 — Ch.84 Note 2 sub-clauses (i)/(ii)/(iii)/(iv) — FIX_TEXT**
- Source: heading-disambiguation within Ch.84 ("heading 8419 does not cover germination plant (8436)", etc.)
- A1d captured 7 rows with intra-Ch.84 redirects. Texts start with raw "(i)" / "(ii)" / "(iii)" / "(iv)" prefixes.
- **Verdict — FIX_TEXT all 7**: Strip the paragraph-letter prefix and lead with the product (e.g., "germination plant, incubators or brooders" not "(i) germination plant..."). Rules themselves are correct heading-disambiguation rules; they redirect within Ch.84 (no chapter-level routing value) but help heading-search step.

**Row id=2964 — Ch.19 Note 1 "does not cover : (a) except in the case of stuffed products..." — FIX_TEXT**
- Source: Ch.19 Note 1 (a) — food preps with >20% sausage/meat/fish go to ch.16, etc.
- A1d text starts with "does not cover : (a) except in the case of stuffed products of heading 1902, food preparations containing more than 20%..." — raw PDF text dump.
- **Verdict — FIX_TEXT**: Replace with cleaner "food preparations containing more than 20% by weight of sausage, meat, meat offal, blood, insect, fish or crustaceans, molluscs or other aquatic invertebrates (except stuffed products of heading 1902)". Same pattern across id 2965, 2971, 2974/2975, 2977 (all start with "does not cover").

## Quality verdict per subagent

- **A1c (30 rules)**: **PASS_WITH_CLEANUP** — 2 issues found of 5 examined → ~14% defect rate extrapolated. Main legally-incorrect rule: id 2646 (Ch.42 leather closed-enum misread). Borderline: id 2658 (Ch.44 densified wood definition framed as exclusion with NULL redirect). The other 28 rules look legally defensible — A1c correctly identified WCO patterns like "heading X applies only to" (Ch.69 fired ceramics, Ch.91 9101 precious-metal watches, Ch.97 hand-printed engravings, Ch.40 synthetic rubber test). **2 DELETE + 0 REDIRECT_ADJUST + ~0 FIX_TEXT.**

- **A1a (288 rules)**: **PASS_WITH_CLEANUP** — 3-4 issues found of 5 examined; major share of issues is Section VI Note 4 / Section VII Note 1 misclassification (5 rows total) + Section XI Note 1(p) very-short text (9 rows). The bulk (~270 rows) are correct Section XI / XV / XVI / XVII note propagation that mirrors the official WCO rule structure. **5 DELETE (Section VI Note 4 × 3 + Section VII Note 1 × 1 + duplicate-text noise — assess case by case) + ~3 REDIRECT_ADJUST + ~9 FIX_TEXT (very-short text expansion).**

- **A1d (60 rules)**: **FAIL_WITH_HIGH_CLEANUP_VOLUME** — heading-explosion pattern produces ~22 redundant noise rows (Ch.39 Note 7 × 13 redundant + Ch.28 Note 3 × 2 redundant + Ch.85 Note 2 × 4 redundant + Ch.90 Note 1 × 2 redundant + Ch.96 Note 1(f) × 2 redundant) → ~37% noise rate. The remaining ~38 rules are individually legally correct but suffer from raw-PDF-text prefixes ("(i)", "does not cover :", paragraph-letter dumps) — 15+ rows need FIX_TEXT. **~23 DELETE + 1 REDIRECT_ADJUST (id 2966) + 15 FIX_TEXT.**

## Action recommendations (executable SQL)

### DELETE recommendations (high confidence)

```sql
-- A1c: Ch.42 leather closed-enum misread (legally incorrect)
DELETE FROM chapter_exclusions WHERE id = 2646;

-- A1c: Ch.44 densified-wood definition framed as exclusion (NULL redirect, definitional not exclusion)
DELETE FROM chapter_exclusions WHERE id = 2658;

-- A1a: Section VI Note 4 — GIR-style tie-breaker between competing Section VI headings (NULL redirects, not exclusion semantic)
DELETE FROM chapter_exclusions WHERE id IN (2679, 2683, 2687);

-- A1a: Section VII Note 1 — set-classification GIR rule, NULL redirects, not exclusion
DELETE FROM chapter_exclusions WHERE id = 2688;

-- A1d: Ch.39 Note 7 heading-explosion (keep id 2981 as canonical; delete 13 duplicates)
DELETE FROM chapter_exclusions WHERE id BETWEEN 2982 AND 2994;

-- A1d: Ch.28 Note 3 (f) precious-stones heading-explosion (keep id 2968 with redirect chapter 71; drop 2 redundant heading-specific rows)
DELETE FROM chapter_exclusions WHERE id IN (2969, 2970);

-- A1d: Ch.85 Note 2 heading-explosion (keep id 3012 as canonical; drop 4 redundants)
DELETE FROM chapter_exclusions WHERE id IN (3013, 3014, 3015, 3016);

-- A1d: Ch.90 Note 1 lifting-machinery heading-explosion (keep id 3017 as canonical; drop 2 redundants)
DELETE FROM chapter_exclusions WHERE id IN (3018, 3019);

-- A1d: Ch.96 Note 1 (f) heading-explosion (keep id 3021 as canonical with redirect heading 9003; drop 2 redundants 9017 / 9018)
DELETE FROM chapter_exclusions WHERE id IN (3022, 3023);

-- A1d: Ch.32 Note 1 (a) elements/compounds heading-explosion (keep id 2974 as canonical; drop 2 redundants)
DELETE FROM chapter_exclusions WHERE id IN (2975, 2976);

-- A1d: Ch.56 Note 4 heading-explosion 5404/5405 (keep id 2996 as canonical; drop redundant)
DELETE FROM chapter_exclusions WHERE id = 2997;
```

Total DELETE recommendations: **~30 rows** (2 from A1c + 5 from A1a + 23 from A1d).

### REDIRECT_ADJUST recommendations

```sql
-- A1d row 2966: Ch.26 Note 1 (f) — source cites heading 7112 OR 8549; currently redirect only includes 85
UPDATE chapter_exclusions
SET redirects_to_chapter = ARRAY['71','85']
WHERE id = 2966;
-- Note: leaves redirects_to_heading as 8549 since unique-key dedup; OR split into 2 rows.

-- A1a row 2945 (Section XVI Note 1(c) on Ch.85): add Section XV base-metal redirects (mainly 73)
UPDATE chapter_exclusions
SET redirects_to_chapter = ARRAY['39','40','44','48','73']
WHERE id = 2945;
```

### FIX_TEXT recommendations (highest priority — strip raw PDF noise prefixes)

```sql
-- A1d Ch.19 Note 1: strip "does not cover : (a) except in the case of stuffed products..." prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'food preparations containing more than 20% by weight of sausage, meat, meat offal, blood, insect, fish or crustaceans, molluscs or other aquatic invertebrates (except stuffed products of heading 1902)'
WHERE id = 2964;

-- A1d Ch.22 Note 1: strip "does not cover:" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'products of Chapter 22 (other than heading 2209) prepared for culinary purposes and thereby rendered unsuitable for consumption as beverages (heading 2103)'
WHERE id = 2965;

-- A1d Ch.26 Note 3: fix PDF OCR typos
UPDATE chapter_exclusions
SET excluded_product_text = 'slag, ash and residues of a kind used in industry either for the extraction of metals or as a basis for the manufacture of chemical compounds of metals, excluding ash and residues from the incineration of municipal waste (heading 2621)'
WHERE id = 2967;

-- A1d Ch.29 Note 2 (a): strip "does not cover : (a)" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'goods of heading 1504 or crude glycerol of heading 1520'
WHERE id = 2971;

-- A1d Ch.29 Note 2 (b): strip "(b)" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'ethyl alcohol (heading 2207 or 2208)'
WHERE id = 2972;

-- A1d Ch.29 Note 2 (f): strip "(f)" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'urea (heading 3102 or 3105)'
WHERE id = 2973;

-- A1d Ch.32 Note 1 (after consolidating): clean
UPDATE chapter_exclusions
SET excluded_product_text = 'separate chemically defined elements or compounds (except those of heading 3203/3204, inorganic lumino-phores of heading 3206, glass from fused quartz of heading 7001, dyes/colouring matter of heading 3204, or stains/colouring matter retail-packed of heading 3212)'
WHERE id = 2974;

-- A1d Ch.33 Note 1 (a): strip "does not cover: (a)" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'natural oleoresins or vegetable extracts of heading 1301 or 1302'
WHERE id = 2977;

-- A1d Ch.38 Note 1 (1)/(3)/(e): strip paragraph-letter prefixes
UPDATE chapter_exclusions
SET excluded_product_text = 'artificial graphite (heading 3801)'
WHERE id = 2978;

UPDATE chapter_exclusions
SET excluded_product_text = 'products put up as charges for fire-extinguishers or in fire-extinguishing grenades (heading 3813)'
WHERE id = 2979;

UPDATE chapter_exclusions
SET excluded_product_text = 'medicaments (heading 3003 or 3004)'
WHERE id = 2980;

-- A1d Ch.39 Note 7 (after consolidating to id 2981): clean
UPDATE chapter_exclusions
SET excluded_product_text = 'waste, parings and scrap of a single thermoplastic material transformed into primary forms (classified in headings 3901 to 3914, not 3915)'
WHERE id = 2981;

-- A1d Ch.42 Note 2 (b): strip "(b)" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'articles of apparel or clothing accessories (except gloves, mittens and mitts), lined with furskin or artificial fur, or with furskin or artificial fur attached on the outside (except as mere trimming) — heading 4303 or 4304'
WHERE id = 2995;

-- A1d Ch.56 Note 4: strip "does not cover" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'textile yarn, or strip or the like of heading 5404 or 5405, in which the impregnation, coating or covering cannot be seen with the naked eye (Chapters 50 to 55)'
WHERE id = 2996;

-- A1d Ch.61 Note 3 — typo fix "tract" -> "track"
UPDATE chapter_exclusions
SET excluded_product_text = 'track suits or ski suits (heading 6112) — knitted/crocheted variant'
WHERE id = 2998;

UPDATE chapter_exclusions
SET excluded_product_text = 'track suits and ski suits (heading 6211) — woven variant'
WHERE id = 2999;

-- A1d Ch.64 Note 2: strip "does not include" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'pegs, protectors, eyelets, hooks, buckles, ornaments, braid, laces, pompons or other trimmings (classified per material); buttons or other goods of heading 9606'
WHERE id = 3002;

-- A1d Ch.72 Note 1: strip "does not include" prefix
UPDATE chapter_exclusions
SET excluded_product_text = 'products of heading 7301 or 7302 (railway/tramway track construction material)'
WHERE id = 3003;

-- A1d Ch.84 Note 2 sub-clauses: strip "(i)", "(ii)" etc prefixes
UPDATE chapter_exclusions
SET excluded_product_text = 'sewing machines for closing bags or similar containers (heading 8452)'
WHERE id = 3005;

UPDATE chapter_exclusions
SET excluded_product_text = 'ink-jet printing machines (heading 8443)'
WHERE id = 3006;

UPDATE chapter_exclusions
SET excluded_product_text = 'germination plant, incubators or brooders (heading 8436)'
WHERE id = 3007;

UPDATE chapter_exclusions
SET excluded_product_text = 'grain dampening machines (heading 8437)'
WHERE id = 3008;

UPDATE chapter_exclusions
SET excluded_product_text = 'diffusing apparatus for sugar juice extraction (heading 8438)'
WHERE id = 3009;

UPDATE chapter_exclusions
SET excluded_product_text = 'machinery for heat-treatment of textile yarns, fabrics or made-up textile articles (heading 8451)'
WHERE id = 3010;

UPDATE chapter_exclusions
SET excluded_product_text = 'water-jet cutting machines (heading 8456)'
WHERE id = 3011;

-- A1d Ch.91 Note 1: clean
UPDATE chapter_exclusions
SET excluded_product_text = 'clock or watch springs — classified as clock/watch parts (heading 9114)'
WHERE id = 3020;

-- A1d Ch.96 Note 1 (f) (after consolidating to id 3021): clean
UPDATE chapter_exclusions
SET excluded_product_text = 'articles of Chapter 90 (for example, spectacle frames of heading 9003)'
WHERE id = 3021;

-- A1a "goods of Chapter 67" rows (9 rows) — expand for FTS retrieval
UPDATE chapter_exclusions
SET excluded_product_text = 'artificial flowers, feathers, prepared feathers and articles thereof, human hair wigs, and other articles of Chapter 67'
WHERE id IN (2703, 2724, 2745, 2766, 2787, 2808, 2829, 2850, 2871);

-- A1a "articles of Chapter 97" rows (9 rows) — expand
UPDATE chapter_exclusions
SET excluded_product_text = 'works of art, collectors'' pieces and antiques of Chapter 97'
WHERE id IN (2709, 2730, 2751, 2772, 2793, 2814, 2835, 2856, 2877);
```

## Confidence assessment

**Are the 378 rules collectively SAFE to use as Phase 4 retrieval input?**
→ **CONDITIONALLY YES — after applying the ~30 DELETEs and 25+ FIX_TEXTs above.**

**Floor confidence breakdown of original 378 rules:**

| Quality tier | Approx count | % of 378 |
|---|---|---|
| High-quality, ready for Phase 4 retrieval | 290 | 77% |
| Noisy but correct (FIX_TEXT to improve FTS) | 38 | 10% |
| Heading-explosion noise (DELETE redundants) | 23 | 6% |
| Definitional / GIR-style (DELETE — wrong table) | 5 | 1.3% |
| Legally incorrect (DELETE — false positive risk) | 2 | 0.5% |
| Borderline (KEEP with caveat) | 20 | 5.2% |

**Post-cleanup expected**: ~345 rules (after DELETE-30 and consolidation) at 90%+ quality. Acceptable for Phase 4 retrieval.

**Highest-risk single rule**: id 2646 (Ch.42 leather closed-enum misread) — if left in place, would route ordinary leather goods to Ch.39/59. **Recommend DELETE before Phase 4 build.**

**Second-highest risk**: id 2658 (Ch.44 densified wood definition with NULL redirect) — even if not actively harmful at chapter-routing layer (NULL redirect means no deflection), it pollutes the chapter_exclusions FTS index with text that isn't an exclusion. **Recommend DELETE.**

## Notes for coordinator

1. **No raw `source_note_text` dumps detected** — implementer subagents did write distinct `excluded_product_text` separate from `source_note_text` in all 378 rows. Good discipline.
2. **No rules violating CHECK constraints / FK** — trigger validation caught any malformed redirects, so 378/378 inserts succeeded the schema validation layer.
3. **A1a Section XI / XV / XVI propagation is the strongest output** — the 9-row replication per section-note clause is correct WCO HS modeling. Don't deduplicate the cross-chapter copies.
4. **A1d's heading-explosion pattern is the dominant defect** — single Note → N rows with identical text. This is a design issue in A1d's prompt, not just per-rule mistakes. For future similar work, prompt should explicitly say "one row per distinct excluded_product_text, redirects_to_heading should be the FIRST/CANONICAL heading or NULL if range".
5. **PDF OCR artifacts** (manucture, ofmetals, basisforthe, tract suits, chargesfor) propagated from source `chapter-NN.json` files into chapter_exclusions verbatim. Worth a separate sweep to fix these in the source JSON files too — not just in chapter_exclusions.
6. **Section VI Note 4 / Section VII Note 1**: these are GIR-style/tie-breaker rules. If chapter_exclusions is strictly "X does not cover Y → goes to Z", they don't belong. If the table is allowed to hold heading-disambiguation rules too, they need clearer text. Recommend DELETE pending coordinator policy decision on table semantics.
7. **Two reasonable design choices left to coordinator**:
   (a) Whether to keep "intra-chapter heading-disambiguation" rules (e.g., id 3005-3011 — Ch.84 Note 2 with source_chapter=84 redirect_chapter=84). These have no chapter-routing value but help heading-step retrieval. If KEEP, FIX_TEXT all of them. If DELETE, drop all rows where source_chapter equals the sole redirect_chapter element.
   (b) How aggressive to be on the "goods of Chapter X" very-short text expansion — currently 18 rows (9 × Ch.67 + 9 × Ch.97) plus more like "articles of Chapter 94/95/96". These are correct rules but have weak FTS strings.

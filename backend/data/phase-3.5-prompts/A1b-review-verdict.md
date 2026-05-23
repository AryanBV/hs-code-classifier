# A1b Combined Spec + Quality Review

**Reviewer:** spec+quality gate (Phase 3.5, T4)
**Input:** `backend/data/phase-3.5-prompts/A1b-output.json` (5 proposed reciprocals from 485 candidates)
**DB:** Supabase `waowoznsvaosgcgiivzo` — `chapter_exclusions` table, 1531 rows pre-insert
**Method:** Stage 1 spec compliance (8 checks) → Stage 2 adversarial WCO-defensibility → Stage 3 coverage-gap call

---

## Stage 1: Spec compliance (5 rules)

Legend: `Y` = pass, `N` = fail, `-` = N/A.
`PF8 dedupe` = `SELECT` against the exact tuple `(source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading)` returning 0 rows.

| # | Rule | src_ch exists | excl_text clean | redir_ch valid+sorted | redir_hdg valid | source_note format OK | source_note_text non-empty | PF8 dedupe (0 rows) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Ch.09 → Ch.21 / 2101 (coffee/tea/maté extracts) | Y (chapters has '09') | Y (`extracts, essences and concentrates of coffee, tea or mate (heading 2101)` — single line, no prefixes) | Y (`["21"]`, single elem ⇒ trivially sorted, '21' exists) | Y ('2101' exists in headings) | Y (`A1b-reciprocal-of-Ch21-Note-1(b)+1(c)+1(d)` — clearly marked synthetic) | Y (cites Ch.21 reciprocals + Ch.13 sister) | Y (verified via execute_sql) | **PASS** |
| 2 | Ch.07 → Ch.20 (preparations of vegetables) | Y | Y (`vegetables prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)`) | Y (`["20"]`, '20' exists) | NULL (acceptable per spec) | Y (`A1b-reciprocal-of-Ch20-Note-1(a)`) | Y | Y (0 rows) | **PASS** |
| 3 | Ch.08 → Ch.20 (preparations of fruit/nuts) | Y | Y (`fruit or nuts prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)`) | Y (`["20"]`) | NULL | Y (`A1b-reciprocal-of-Ch20-Note-1(a)`) | Y | Y (0 rows) | **PASS** |
| 4 | Ch.02 → Ch.16 (preparations of meat) | Y | Y (`preparations of meat, meat offal or blood (headings 1601 to 1603)`) | Y (`["16"]`) | NULL | Y (`A1b-reciprocal-of-Ch16-Note-1`) | Y | Y (0 rows) | **PASS** |
| 5 | Ch.03 → Ch.16 (broader fish preparations) | Y | Y (`preparations of fish, crustaceans, molluscs or other aquatic invertebrates (Chapter 16)`) | Y (`["16"]`) | NULL | Y (`A1b-reciprocal-of-Ch16-Note-1`) | Y (explicitly notes the row complements but does not duplicate existing narrow Note 1(d) caviar→1604 row, which differs on both `source_note_number` AND `excluded_product_text`) | Y (0 rows; existing Ch.03 Note 1(d) caviar row differs on both `source_note_number` and `excluded_product_text` ⇒ no UNIQUE constraint hit) | **PASS** |

**Stage 1 result: 5 / 5 PASS.** Proceed to Stage 2.

### Spec-stage sanity checks performed

- **Chapters exist:** `SELECT chapter FROM chapters WHERE chapter IN ('02','03','07','08','09','16','20','21')` → all 8 returned. Y.
- **Heading 2101 exists:** `SELECT heading FROM headings WHERE heading = '2101'` → 1 row. Y.
- **PF8 batch check:** The composite `WHERE (s,e,n,rc,rh) = (...)` query covering all 5 proposed tuples returned **0 rows** — none collide with existing UNIQUE-key tuples.
- **Sister-evidence claims verified by direct DB read:**
  - Ch.13 Note 1(c) `extracts of coffee, tea or mate → ["21"]/2101` — present, verbatim wording match for A1b-1.
  - Ch.11 Note 1 `vegetables, prepared or preserved → ["20"]/2001|2004|2005` — present, 3 rows, sister-shape for A1b-2/A1b-3.
  - Ch.20 Note 1(a) `vegetables, fruit or nuts, prepared or preserved by the processes specified in Chapter 7, 8 or 11` → fans out to `["07"]`, `["08"]`, `["11"]` (3 rows). Confirmed reciprocal target for A1b-2/A1b-3.
  - Ch.16 Note 1 — 4 rows, including `→ ["02"]` and `→ ["03"]` reciprocal targets for A1b-4/A1b-5. Verified.
  - Ch.21 Notes 1(b), 1(c), 1(d) — present, 4 rows targeting Ch.09 (roasted-substitutes/0901, flavoured tea/0902, spices of 0904-0910). Confirms A1b-1 is the genuine missing reciprocal.

### Asymmetry confirmed (the gap is real)

- `Ch.09 → Ch.21` forward edges: 3 rows total, but only 1 points to Ch.21, and that 1 is `→ 2103` (mixed condiments), **not 2101**. The extracts edge is genuinely missing.
- `Ch.08` forward edges: 1 row (`Note 1`, `inedible nuts or fruits`, `redirects=NULL`). Zero to Ch.20.
- `Ch.07` forward edges: 6 rows, zero to Ch.20.
- `Ch.02` forward edges: 6 rows, zero to Ch.16.
- `Ch.03` forward edges: 6 rows; the only Ch.16 edge is the narrow `caviar substitutes → 1604` row, which A1b correctly identified as too narrow.

---

## Stage 2: Quality (adversarial WCO defensibility)

### Rule #1 — Ch.09 → Ch.21 / heading 2101 (coffee, tea, maté extracts)

- **WCO HSE basis:** Confirmed. The WCO HS 2022 General Explanatory Notes for Chapter 9 explicitly list, among items NOT covered: *"Preparations consisting of coffee, tea or maté extracts, essences or concentrates (heading 21.01)."* This is canonical, not paraphrased.
- **Spike-case-2 alignment:** Trace for "freeze-dried instant coffee" — Triage stage extracts attributes (coffee, processed, soluble, freeze-dried). Lexical pre-filter currently routes to Ch.09 on token "coffee". Without an outbound 09→2101 edge, the wizard has no chapter-level redirect signal back to 21. With this rule firing on FTS hit against `extracts, essences and concentrates of coffee, tea or mate (heading 2101)`, the redirect emits a hard candidate for Ch.21 heading 2101. **Rule does solve the spike case.**
- **False-positive risk:** Low. The text contains the WCO-defining terms "extracts, essences and concentrates" — these will not match raw-coffee queries ("green coffee beans", "Arabica cherries", "ground roasted coffee for filter brewing"). The risk surface is "instant" or "soluble" coffee queries; both are correctly Ch.21 destinations per WCO, so a hit is the correct behaviour, not a false positive.
- **Boundary clarity:** Unambiguous. Roasted-but-not-extracted coffee = 0901; extract/essence/concentrate = 2101. WCO HSE defines extract as "the soluble solids derived from coffee/tea/maté beans/leaves by water extraction" — there is no in-between state in the WCO scheme.
- **FTS quality:** Good. Contains canonical vocabulary (extracts, essences, concentrates, coffee, tea, mate) likely to appear in any reasonable user query for instant coffee. The `(heading 2101)` parenthetical is also harmless for FTS.

**Quality verdict: APPROVE.**

### Rule #2 — Ch.07 → Ch.20 (preparations of vegetables)

- **WCO HSE basis:** Confirmed. WCO Ch.7 General Explanatory Note: *"This Chapter covers vegetables, including the products listed in Note 3 to the Chapter, whether fresh, chilled, frozen (uncooked or cooked by steaming or boiling in water), provisionally preserved or dried (including dehydrated, evaporated or freeze-dried). Vegetables prepared or preserved otherwise than as provided for in this Chapter are excluded from it (Chapter 20)."* Canonical. The proposed text is a tight paraphrase of this.
- **Spike-case alignment:** No specific spike case targets this, but A1b-2 is the mirror of the in-DB Ch.20 Note 1(a) `→ ["07"]` row. Triage cases of "pickled cucumbers", "preserved mushrooms in brine", "canned sweetcorn" will currently false-route to Ch.07 on the noun token without an outbound exclusion. This rule provides the WCO-defensible redirect.
- **False-positive risk:** Borderline cases worth flagging:
  - "Frozen broccoli" — per Ch.7 General Note, freezing IS a Ch.7 process (`frozen (uncooked or cooked by steaming or boiling in water)`). So a query for plain frozen broccoli should NOT match the exclusion text — and it won't, since the phrase "prepared or preserved otherwise than by the processes specified in this Chapter" requires "otherwise". FTS may still surface this rule but the LLM picker will correctly read the rule text as a process-state filter.
  - "Sweetcorn in airtight container with vinegar" — correctly Ch.20 (heading 2001).
  No genuine false-positive surface identified.
- **Boundary clarity:** Clear. The WCO HSE Ch.20 General Note enumerates the included processes (`cooked, packed in oil, prepared with vinegar, preserved with sugar, etc.`). Anything beyond Ch.7's listed processes is Ch.20.
- **FTS quality:** Strong. "Prepared", "preserved", "vegetables" are exact match tokens for the most common preparation queries.

**Quality verdict: APPROVE.**

### Rule #3 — Ch.08 → Ch.20 (preparations of fruit/nuts)

- **WCO HSE basis:** Confirmed. WCO Ch.8 General Explanatory Note: *"This Chapter covers fruit, nuts and peel of citrus fruit or melons, generally intended for human consumption (whether as presented or after processing). They may be fresh (including chilled), frozen (whether or not previously cooked by steaming or boiling in water, or containing added sweetening matter), or dried (including dehydrated, evaporated or freeze-dried); provided they are unsuitable in that state for immediate consumption, they may be in provisional preservation (e.g., by sulphur dioxide gas, in brine, in sulphur water or in other preservative solutions). [...] The Chapter excludes [...] fruit and nuts, prepared or preserved otherwise (Chapter 20)."* Canonical.
- **Spike-case alignment:** No direct spike case, but covers "canned peaches", "fruit jam", "glazed cherries", "fruit cocktail in syrup" — all should route to Ch.20 (headings 2007/2008/2009). Mirror of A1b-2.
- **False-positive risk:** Same shape as #2. "Frozen mango", "dried apricots", "dehydrated banana chips" remain in Ch.08 by the Ch.08 General Note. Only "otherwise prepared" hits Ch.20. The exclusion text correctly requires "otherwise than by the processes specified in this Chapter" — so the LLM picker has the disambiguating clause.
- **Boundary clarity:** Strong. WCO HSE Ch.20 General Note lists the included preparation processes; Ch.08 General Note lists its own. No overlap.
- **FTS quality:** Strong. "Fruit", "nuts", "prepared", "preserved" cover the relevant token surface.

**Quality verdict: APPROVE.**

### Rule #4 — Ch.02 → Ch.16 (preparations of meat)

- **WCO HSE basis:** Confirmed. WCO Ch.2 General Explanatory Note states the chapter does NOT cover *"Preparations of meat, meat offal or blood of heading 16.01 to 16.03 (Chapter 16)."* — the exact wording the implementer used.
- **Spike-case alignment:** No direct spike case, but the rule directly serves the "sausages", "corned beef", "salami", "luncheon meat", "canned ham" query family. Currently Ch.02 has zero forward edges to Ch.16, so the Triage will get stuck on Ch.02 for these queries.
- **False-positive risk:** Low. The text uses "preparations" (a WCO term-of-art) and lists "meat, meat offal or blood". Plain "frozen beef", "fresh chicken breast", "lamb chops" are not "preparations" and will not match the text under FTS scoring. Borderline products like "marinated chicken breast frozen" — under WCO HSE, marinating with seasonings sufficient to constitute "preparation" pushes the product to Ch.16; this is the correct WCO outcome.
- **Boundary clarity:** Sharp by WCO design. Ch.2 = raw, frozen, chilled, salted, in brine, dried, smoked (per Note 1(a) inclusion list). Ch.16 = "prepared or preserved otherwise" — cooked, in containers, sausages, etc.
- **FTS quality:** Strong. "Preparations", "meat", "meat offal", "blood", and the `1601 to 1603` parenthetical all yield good token surface.

**Quality verdict: APPROVE.**

### Rule #5 — Ch.03 → Ch.16 (broader fish preparations)

- **WCO HSE basis:** Confirmed. WCO Ch.3 General Explanatory Note excludes *"Fish (including livers, roes and milt thereof) and crustaceans, molluscs and other aquatic invertebrates, prepared or preserved (Chapter 16)."*
- **Coexistence with existing narrow row:** The existing Ch.03 Note 1(d) row `caviar or caviar substitutes prepared from fish eggs → ["16"]/1604` covers ONE narrow case. The proposed broader row covers ALL fish/crustacean/mollusc preparations. PF8 collision check returned 0 rows because both `source_note_number` AND `excluded_product_text` differ. The implementer's choice to add a complementary row (rather than mutate the existing verbatim-PDF row) is correct and aligns with the project rule "never mutate PDF-sourced rows".
- **Spike-case alignment:** No direct spike case, but the rule serves "canned tuna", "canned sardines", "fish balls", "smoked salmon in retail pack", "fish fingers", "anchovy paste", "fish sauce". Currently the only Ch.03 → Ch.16 redirect is for caviar/1604.
- **False-positive risk:** Low. The exclusion text "preparations of fish, crustaceans, molluscs or other aquatic invertebrates" uses the WCO term-of-art. Plain "fresh tuna", "frozen prawns", "chilled mackerel fillets" are not "preparations". Borderline cases like "smoked salmon (cold-smoked, vacuum-packed, fresh)": per WCO HSE Ch.3 General Note, smoked fish remains in Ch.3 (heading 0305) — the FTS match against the proposed text is plausible but the LLM picker will correctly read "preparations" as a higher-bar process. Minor residual risk; mitigation is the same as rule #4 (the LLM has the rule text and can disambiguate).
- **Boundary clarity:** WCO HSE Ch.3 vs Ch.16 boundary: Ch.3 = fresh/chilled/frozen/dried/salted/in brine/smoked/cooked-before-or-during-smoking. Ch.16 = otherwise prepared or preserved (canned, with sauces, fish balls, fish meal-paste, surimi products, fish sausages, anchovy paste, fish protein concentrates of heading 1604/1605). Sharp.
- **FTS quality:** Strong. Covers "preparations", "fish", "crustaceans", "molluscs", "aquatic invertebrates".

**Quality verdict: APPROVE.**

---

## Stage 3: Coverage gaps (Ch.10 ↔ Ch.11, Ch.41)

### Findings from DB

- **Ch.41 forward edges:** 0 rows in `chapter_exclusions WHERE source_chapter='41'`. A1b's claim verified.
- **Ch.10 forward edges:** 2 rows — Note 1(b) `grains which have been hulled or otherwise worked` with `redirects_to_chapter=NULL` (incomplete extraction), and Note 2 `sweet corn → ["07"]`. The Ch.10 ↔ Ch.11 boundary in Note 1(b) is present-but-broken (NULL redirect).
- **Ch.11 → Ch.10:** 0 rows.

### Adversarial assessment

These gaps are **real and structurally different from A1b's scope**:

- A1b's scope: "asymmetric reciprocals" — pairs where X→Y exists, Y→X missing. Both gaps here are "missing-both" or "broken-redirect" cases, not asymmetric.
- The Ch.10 Note 1(b) NULL-redirect is a **data-completion bug** (the rule text exists but the redirect target was not extracted). Fixing it is a single UPDATE, not a new INSERT — and it should be matched to the chapter PDF, not invented.
- Ch.41 zero-edges is a **wholesale extraction gap** — the WCO Ch.41 General Note has multiple exclusions (e.g., parings of hides → 0511; ash of hides → 2621; gold-beaters' skin → 4111; etc.) that were missed by the original PDF extractor.

### Verdict on coverage gaps

**Do NOT bundle into the A1b APPLY action. Defer to a new task.**

Rationale:
1. **Different shape of work:** A1b is "judgement-heavy reciprocal inference from WCO HSE general notes". The Ch.10/Ch.41 gap is "re-extraction from chapter PDF + redirect-target inference". Conflating them would dilute A1b's clean audit trail.
2. **Different risk profile:** A1b inserts use a `A1b-reciprocal-of-...` synthetic `source_note_number` (clearly marked as inferred). Ch.10/Ch.41 fixes need verbatim PDF source notes, which only an extractor agent (A1c-style) should produce.
3. **Different blast radius:** Ch.41 = 7 headings, ~50 tariff_lines; not on the critical path for any spike case 1-10. Ch.10/Ch.11 is on the critical path but the asymmetric A1b rules already in this batch don't depend on it.

**Recommendation:** Open a new sibling task **A1c — chapter-exclusions extraction-gap closure (Ch.10 + Ch.41 + scan for other NULL-redirect rows)**. Out of scope for A1b APPLY. Coordinator should add this as task #16 (or assign to T11 ARCHITECTURE.md follow-up) and run it after T7 audits.

---

## Final action recommendation per rule

1. **Ch.09 → Ch.21 / 2101 (extracts of coffee, tea, maté):** **APPLY**
2. **Ch.07 → Ch.20 (vegetables prepared/preserved):** **APPLY**
3. **Ch.08 → Ch.20 (fruit/nuts prepared/preserved):** **APPLY**
4. **Ch.02 → Ch.16 (preparations of meat):** **APPLY**
5. **Ch.03 → Ch.16 (broader fish preparations):** **APPLY**

**Coverage-gap verdict:** Defer Ch.10↔Ch.11 and Ch.41 to a new A1c-style task. Do not bundle.

---

## Final executable SQL (APPROVED rules — all 5)

Idempotent via `ON CONFLICT DO NOTHING` against the existing `UNIQUE NULLS NOT DISTINCT (source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading)` constraint. Wrapped in a transaction so all 5 land or none do.

```sql
BEGIN;

INSERT INTO chapter_exclusions
  (source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading, source_note_number, source_note_text)
VALUES
  (
    '09',
    'extracts, essences and concentrates of coffee, tea or mate (heading 2101)',
    ARRAY['21']::text[],
    '2101',
    'A1b-reciprocal-of-Ch21-Note-1(b)+1(c)+1(d)',
    'WCO HSE General Note to Chapter 09 excludes preparations consisting of extracts, essences or concentrates of coffee, tea or mate (heading 21.01). Reciprocal of Chapter 21 Note 1(b) (roasted coffee substitutes containing coffee -> 0901), Note 1(c) (flavoured tea -> 0902), and Note 1(d) (spices of headings 0904-0910). Sister-evidence: Chapter 13 Note 1(c) excludes ''extracts of coffee, tea or mate'' -> 2101 with identical wording (DB row exists). Closes spike case 2 (freeze-dried instant coffee, instant tea preparations).'
  ),
  (
    '07',
    'vegetables prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)',
    ARRAY['20']::text[],
    NULL,
    'A1b-reciprocal-of-Ch20-Note-1(a)',
    'WCO HSE General Note to Chapter 07 excludes vegetables prepared or preserved otherwise than as provided for in this Chapter (Chapter 20). Reciprocal of Chapter 20 Note 1(a) (already in DB) which excludes preparations preserved by Ch.7, 8 or 11 processes back to those chapters. Sister-evidence: Chapter 11 Note 1(d) already in DB excludes ''vegetables, prepared or preserved'' -> 2001/2004/2005 with the same shape.'
  ),
  (
    '08',
    'fruit or nuts prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)',
    ARRAY['20']::text[],
    NULL,
    'A1b-reciprocal-of-Ch20-Note-1(a)',
    'WCO HSE General Note to Chapter 08 excludes fruit and nuts prepared or preserved otherwise than as provided for in this Chapter (Chapter 20). Reciprocal of Chapter 20 Note 1(a) (already in DB) which excludes preparations preserved by Ch.7, 8 or 11 processes back to those chapters. Mirror of A1b-rule for Ch.07.'
  ),
  (
    '02',
    'preparations of meat, meat offal or blood (headings 1601 to 1603)',
    ARRAY['16']::text[],
    NULL,
    'A1b-reciprocal-of-Ch16-Note-1',
    'WCO HSE General Note to Chapter 02 excludes preparations of meat, meat offal or blood of headings 16.01 to 16.03. Reciprocal of Chapter 16 Note 1 (already in DB) which excludes meat preserved by Ch.2 processes back to Ch.2. Process-state boundary at the same level of authority as the vegetable Ch.7/8 <-> Ch.20 reciprocals.'
  ),
  (
    '03',
    'preparations of fish, crustaceans, molluscs or other aquatic invertebrates (Chapter 16)',
    ARRAY['16']::text[],
    NULL,
    'A1b-reciprocal-of-Ch16-Note-1',
    'WCO HSE General Note to Chapter 03 excludes preparations of fish, crustaceans, molluscs or other aquatic invertebrates of Chapter 16. Reciprocal of Chapter 16 Note 1 (already in DB). The existing Chapter 3 Note 1(d) row in DB only covers the narrow case of caviar/caviar substitutes -> 1604; the WCO HSE General Note excludes the BROADER category of all fish preparations. This row complements (does not duplicate) the existing 1604 caviar row - source_note_number and excluded_product_text differ.'
  )
ON CONFLICT (source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading) DO NOTHING;

-- Verify: should return 5 rows, all from this batch.
SELECT source_chapter, source_note_number, redirects_to_chapter, redirects_to_heading
FROM chapter_exclusions
WHERE source_note_number LIKE 'A1b-reciprocal-of-%'
ORDER BY source_chapter;

COMMIT;
```

### Post-apply sanity check

After commit, run:

```sql
SELECT source_chapter, COUNT(*) AS forward_edges
FROM chapter_exclusions
WHERE source_chapter IN ('02','03','07','08','09')
GROUP BY source_chapter
ORDER BY source_chapter;
```

Expected delta from baseline (pre-apply totals shown in parentheses):
- `02`: 7 (was 6)
- `03`: 7 (was 6)
- `07`: 7 (was 6)
- `08`: 2 (was 1)
- `09`: 4 (was 3)

If any count is off, roll back and investigate.

---

## Reviewer notes for coordinator

1. **A1b was conservative — appropriately so.** 5 from 485 is a high-precision shortlist, all WCO-canonical and process-state-bounded. None of the 5 are speculative.
2. **No over-proposal detected.** Each rule has WCO HSE General Note text as direct source AND in-DB sister-evidence (Ch.13 Note 1(c), Ch.11 Note 1, Ch.16 Note 1, Ch.20 Note 1(a), Ch.21 Notes 1(b)/1(c)/1(d)) — the highest-evidence tier available short of verbatim PDF extraction.
3. **No under-proposal detected for the in-scope class** (asymmetric reciprocals with clean WCO basis). The candidates A1b dropped (Section XV base-metal broadcasts, Section XI textile broadcasts, Section XVII vehicle→machinery, Ch.04→Ch.16 with overlap concern, Ch.50 silk→apparel) were all dropped for defensible reasons.
4. **The `A1b-reciprocal-of-...` synthetic source_note_number convention is clean** and explicitly marks these rows as inferred-not-extracted. Recommend keeping the convention. If the coordinator later prefers `WCO-HSE-General-Note-Ch.XX` style, a single UPDATE can rename them later — the audit trail is already in `source_note_text`.
5. **Spike case 2 is genuinely solved by rule #1.** Verified by tracing the freeze-dried instant coffee query path through the proposed pipeline. The other 4 rules are systematic fixes that benefit any reasonable preparation/preservation query starting at the raw-material chapter.
6. **Coverage gaps Ch.10/Ch.11 and Ch.41 are real but out of A1b scope.** Recommend new task A1c (extraction-gap closure) scheduled after T7 audits.

---

## Coordinator return payload

```json
{
  "spec_pass": 5,
  "quality_approve": 5,
  "revise": 0,
  "reject": 0,
  "coverage_gap_verdict": "defer-to-new-A1c-task",
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/A1b-review-verdict.md"
}
```

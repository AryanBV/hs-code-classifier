# Case 10 V1 Re-Run — stainless steel watch bracelet replacement strap

**Phase 3.5 state:** A5 migrated `chapter_exclusions.redirects_to_chapter` to text[]. Rule id 2217 (Ch.71 Note 3(l)) has text "articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments)" BUT redirects_to_chapter=['90'] only — **A1 extraction captured one destination instead of all three**. fts_search_text puts 9113.20.90 at rank-1.

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / **RULES_GAP** (single text column truncated multi-chapter destinations; required text[] migration + correct query construction).

**Re-run verdict:** RULES_GAP → **RULES_GAP (residual)**. Structural fix (text[] column) succeeded. But A1 backfill incomplete — rule 2217 should have `redirects_to_chapter=['90','91','92']` to match its own text. Single-row UPDATE recommended. Case still CORRECT via retrieval rank-1 + Ch.91 heading 9113 title match, so the defect is latent.

```yaml
case_id: case-10
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "9113.20.90"
  expected_code: "tariff_line under 9113.20 (not 7113)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: RULES_GAP
gap_description: "Rule id 2217 (Ch.71 Note 3(l)) has source text mentioning 'Chapter 90, 91 or 92' but redirects_to_chapter=['90'] only. A5 text[] migration succeeded structurally but A1 extraction left this rule under-populated. Single-row fix: UPDATE chapter_exclusions SET redirects_to_chapter=ARRAY['90','91','92'] WHERE id=2217. Recommend a sweep for the same pattern across all rules whose excluded_product_text mentions multiple chapter numbers but redirects_to_chapter has cardinality 1. Latent defect — case still CORRECT because retrieval rank-1 + heading 9113 title 'Watch straps, watch bands and watch bracelets' resolve via Stage 2+4."
data_dependency: "Latent defect in A1 rule extraction completeness; not blocking on this case but will block similar Ch.71→Ch.92 (musical) or Ch.71→Ch.90 (scientific) queries."
phase_3_5_resolution: "A5 text[] migration unblocked multi-destination architecture. A7 fts_search_text strongly surfaces 9113.20.90. Residual A1 extraction completeness gap — recommend pre-commit fix."
```

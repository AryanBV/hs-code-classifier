# Case 14 V1 Re-Run (control) — filter → engine → diesel truck (multi-Q)

**Phase 3.5 state:** Heading 8421 still has 9/12 empty subheading titles in `subheadings.title`. fts_search_text for 8421.23.00 = "Nuclear Reactors, Boilers, Machinery And Mechanical Appliances; Parts Thereof Centrifuges, including centrifugal dryers; filtering or purifying machinery and apparatus, for liquids or gases.  Filtering or purifying machinery and apparatus for liquids : -- Oil or petrol-filters for internal combustion engines" — parent context now denormalized. Both 8421.23.00 and 8421.31.00 surface in FTS on plainto_tsquery('engine filter').

**Original verdict:** CORRECT_CODE / DIRECT / EXPENSIVE / MEDIUM / NONE (with note that empty subheading titles are bypassed by cascade 2.4b heading-fallback; within-heading ambiguity at Q-budget=2 accepted as residual).

**Re-run verdict:** Unchanged. Control case stays clean — fts_search_text now ALSO bypasses the empty-subheading-title problem (independent of cosine cascade 2.4b). Within-heading ambiguity (.23 oil/fuel vs .31 intake-air) remains, accepted residual.

```yaml
case_id: case-14
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8421.23.00"
  expected_code: "tariff_line under heading 8421 (8421.23.00 or 8421.31.00)"
path_quality: DIRECT
cost_class: EXPENSIVE
confidence_signal: MEDIUM
gap_class: NONE
gap_description: null
data_dependency: "Heading 8421 still has 9/12 empty subheading titles. Mitigated by both cosine cascade 2.4b heading-fallback AND new fts_search_text parent-title denorm. Double-belt now exists. Within-heading ambiguity (.23 vs .31) remains as accepted residual; Q-budget=2 not enough to discriminate, surfaces to user with disclaimer."
phase_3_5_resolution: "Control case, no fix expected. A7 fts_search_text denorm adds a second mitigation path for the empty-subheading-title issue (was already mitigated by cosine cascade 2.4b in spike). No regression."
```

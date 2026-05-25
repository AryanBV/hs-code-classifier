# Case 4 V1 Re-Run (control) — mens knitted cotton ensemble

**Phase 3.5 state:** Ch.62→Ch.61 "knit" exclusion remains active. fts_search_text puts 6103.22.00 ("Ensembles : -- Of cotton") at FTS rank-1 on plainto_tsquery('knitted cotton ensemble').

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / NONE.

**Re-run verdict:** Unchanged. Control case stays clean — no regression. fts_search_text additionally strengthens retrieval (parent-title context "Mens or boys suits, ensembles, jackets..." denorm).

```yaml
case_id: case-4
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "6103.22.00"
  expected_code: "tariff_line under heading 6103"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
phase_3_5_resolution: "Control case, no fix expected. A7 fts_search_text denorm strengthens FTS retrieval (parent heading title 'Mens or boys suits, ensembles, jackets...' is now in fts_search_text). No regression."
```

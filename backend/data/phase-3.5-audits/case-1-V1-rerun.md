# Case 1 V1 Re-Run — rubber suspension bushings for trucks

**Phase 3.5 state:** rule id 2419 (Section XVII Note 2(a)) fires on "rubber bush" tsquery; redirects_to_chapter=['40'] (text[]); fts_search_text for 4016.99.60 includes parent context.

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / NONE (with note that dispatch's stated "expected 8708" was legally inverted; legally-correct answer is 4016.99.60).

**Re-run verdict:** Unchanged. Pipeline still selects 4016.99.60 via Section XVII Note 2(a) carve-out. New fts_search_text additionally surfaces 4016.99.60 in the FTS leg via parent-title denorm.

```yaml
case_id: case-1
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "4016.99.60"
  expected_code: "4016.99.60 (legally correct per Section XVII Note 2(a); dispatch's stated 8708 is inverted)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
phase_3_5_resolution: "No fix required — case was already CORRECT in spike. A1 rule id 2419 (Section XVII Note 2(a)) remains correctly populated with redirects_to_chapter=['40'], redirects_to_heading='4016'. A7 fts_search_text denorm additionally surfaces 4016.99.60 in the FTS leg via parent-title context, making this case even more robust."
```

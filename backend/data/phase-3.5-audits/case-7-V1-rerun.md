# Case 7 V1 Re-Run (control) — vintage motorcycle 1939 collectible

**Phase 3.5 state:** 8711.00.00 description still has full india_specific label ("Vintage Motorcycles, parts and components thereof manufactured prior to 1.1.1940"). india_specific_note populated.

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / NONE.

**Re-run verdict:** Unchanged. Control case stays clean — fts_search_text puts 8711.00.00 at rank-1, india_specific_note is intact, no regression.

```yaml
case_id: case-7
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8711.00.00"
  expected_code: "tariff_line under subheading 8711.00 (india_specific retention)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: "subheadings.india_specific=true + india_specific_note must be injected into Select prompt whenever any final candidate carries india_specific=true. Verified populated for 8711.00."
phase_3_5_resolution: "Control case, no fix expected. A7 fts_search_text denorm reinforces retrieval. india_specific_note unchanged and correct. No regression."
```

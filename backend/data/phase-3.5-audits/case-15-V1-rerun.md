# Case 15 V1 Re-Run (control) — stnls stl hex bolt M10 grade 8.8 zinc plated

**Phase 3.5 state:** 7318.15 subheading title is empty in `subheadings.title` but fts_search_text for 7318.15.00 = "Articles Of Iron Or Steel Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel.  Threaded articles : -- Other screws and bolts, whether or not with their nuts or washers" — parent context now denormalized. FTS on plainto_tsquery('hex bolt steel') with OR semantics puts 7318.15.00 at rank-1.

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / NONE (with notes_on_robustness flagging FTS leg returns 0 hits for mangled query "stnls stl", reliance on cosine + reranker, and legacy chapter_rules' "stainless" .includes() weakness).

**Re-run verdict:** Unchanged. Control case stays clean — fts_search_text now lights up on cleaned tokens "hex bolt steel" with strong rank. Cohere cosine cascade still load-bearing for the mangled-token form. No regression.

```yaml
case_id: case-15
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "7318.15.00"
  expected_code: "tariff_line under subheading 7318.15 (only code: 7318.15.00)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
phase_3_5_resolution: "Control case, no fix expected. A7 fts_search_text denorm makes the FTS leg productive on cleaned tokens ('hex', 'bolt', 'steel', 'screw') via parent-title context — previously the bare description 'Threaded articles' was too sparse for FTS. Cosine cascade remains load-bearing for the truly-mangled form ('stnls stl') but FTS now contributes meaningfully. No regression."
```

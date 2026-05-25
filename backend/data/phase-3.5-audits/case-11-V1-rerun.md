# Case 11 V1 Re-Run — crude petroleum oil

**Phase 3.5 state:** 2709.00.10 data: description="PETROLEUM CRUDE", export_policy="Restricted", policy_condition="Export is allowed through Indian Oil Corporation Limited (IOCL) only." All present and correct.

**Original verdict:** CORRECT_CODE / DIRECT / CHEAP / HIGH / **SELECT_GAP** (Phase 4 Select json_schema must declare `export_policy` and `policy_condition` as REQUIRED output fields; without that schema commitment, policy doesn't surface to user).

**Re-run verdict:** SELECT_GAP unchanged. Phase 3.5 was scoped to data hardening (chapter_exclusions, fts_search_text, sections.notes); the Phase 4 Select schema is tracked under T10/T11 (B5/B6/B7 prompt drafts + ARCHITECTURE.md). Data is intact; nothing to fix here.

```yaml
case_id: case-11
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "2709.00.10"
  expected_code: "2709.00.10 + Restricted/IOCL STE policy"
path_quality: DIRECT
cost_class: CHEAP
confidence_signal: HIGH
gap_class: SELECT_GAP
gap_description: "Phase 4 Select json_schema must declare export_policy and policy_condition as REQUIRED output fields. Data is present at tariff_lines (export_policy='Restricted', policy_condition='Export is allowed through Indian Oil Corporation Limited (IOCL) only.'); architecture spec must require Select to project them. Tracked under T10 (B5/B6 Phase 4 prompt drafts) and T11 (ARCHITECTURE.md)."
data_dependency: NONE
phase_3_5_resolution: "Out of Phase 3.5 scope by design. Phase 3.5 was data-hardening; the Select schema gap is a Phase 4 spec concern. Carry forward to T10/T11."
```

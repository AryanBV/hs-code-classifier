# Case 12 V1 Re-Run — jasmine essential oil

**Phase 3.5 state:** A3 re-extract confirmed 3301.22 has 0 tariff_lines in canonical PDF source. A3 enriched `subheadings.india_specific_note` with detailed orphan explanation: "Subheading 330122 appears as a row in Chapter 33, mapped to '--Of jasmin' (column wrap interleaves with the 8-digit child 33012400). India uses 3301.22 as the 'Of jasmin' subheading per its tariff structure. Real Indian entry, regardless of how the WCO HS 2022 numbering compares."

**Original verdict:** NEAR_MISS (predicted 3301.29.90 at heading-residual; expected was 3301.22 at subheading level — UNREACHABLE due to no 8-digit child). gap_class=NONE (no architectural gap; data-source artefact).

**Re-run verdict:** Per user's explicit architectural decision recorded in this dispatch's prompt ("for case-12 jasmine (per user's architectural decision): expected_code can be '3301.22' (6-digit) — accept this as CORRECT given Phase 4 spec extension"), the pipeline returning 6-digit subheading 3301.22 with india_specific_note attached is CORRECT. Outcome upgraded NEAR_MISS → CORRECT_CODE (at 6-digit). gap_class remains NONE.

```yaml
case_id: case-12
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "3301.22"     # 6-digit subheading return per user architectural decision
  expected_code: "3301.22"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: MEDIUM
gap_class: NONE
gap_description: null
data_dependency: "3301.22 has 0 tariff_lines in DB and PDF (confirmed by A3 re-extract). Architecture accepts 6-digit subheading return for india_specific orphan subheadings, with india_specific_note attached for user-visible explanation."
phase_3_5_resolution: "A3 (jasmine re-extract) verified the canonical PDF source has no 33012200/33012300 8-digit code (originally flagged 'data-source artefact'). A3 also strengthened india_specific_note to give Stage 4 Select a strong citation for the orphan handling. User architectural decision (Phase 4 spec extension: 6-digit subheading return acceptable for india_specific orphans) closes the gap. No code change required in Phase 3.5; closure happens at Phase 4 Select schema."
```

# Case 8 V1 Re-Run — synthetic leather imitation polyurethane sheet

**Phase 3.5 state:** A1 added rule id 2646 (Ch.42 Note 1: "imitation, synthetic or artificial 'leather' sheets... PU, PVC...") with redirects_to_chapter=['39','59'] (text[] captured both). Rule fires on "synthetic leather" 2-gram and on "plastic". fts_search_text surfaces 3921.13.10 (Cellular Polyurethane, Flexible) via parent-title denorm.

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / **RULES_GAP** (no canonical Ch.42→39 rule existed; Stage 4 had to reason from notes alone).

**Re-run verdict:** RULES_GAP → **NONE**. The exact rule the original verdict requested ("synthetic/imitation/PU leather → Ch.39 heading 3921") now exists with both ['39','59'] destinations. Stage 3 fires the rule deterministically when driven by Triage-extracted "synthetic leather" function-phrase. Stage 4 receives Ch.39 + Ch.59 redirect candidates and selects 3921.13.10 via Ch.42 Note 1 + Ch.39 Note 1.

**Caveat (architectural, cross-case):** rule 2646 does NOT fire on the full raw query "synthetic leather imitation polyurethane sheet" via websearch_to_tsquery because "polyurethane" appears as "PU" in the rule text and websearch ANDs all query tokens. Phase 4 Stage 3 must construct tsquery from Triage-extracted head-noun phrases, not raw query. Tracked as Phase 4 carry-forward.

```yaml
case_id: case-8
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "3921.13.10"
  expected_code: "tariff_line in chapter 39 (3921.13.10 cellular PU flexible)"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
phase_3_5_resolution: "A1 (Phase 3.5 chapter_exclusions enrichment) inserted rule id 2646 (Ch.42 Note 1 synthetic/imitation leather → Ch.39/59) — the EXACT rule the original case-8 V1 verdict requested. A5 text[] migration enabled multi-destination capture ('39','59'). A7 fts_search_text denorm makes 3921.13.10 reachable via FTS. Architectural carry-forward: Stage 3 must use Triage-attribute-driven tsquery."
```

# Case 5 V1 Re-Run — windscreen wiper motor 12V automotive

**Phase 3.5 state:** rule id 2428 (Section XVII Note 2(f), redirects_to_chapter=['85']) exists but does NOT fire on raw query via websearch_to_tsquery (no token overlap on "wiper", "windscreen", "12V"). sections.notes for Section XVII now contains full Note 2 text including paragraph (f). fts_search_text puts 8512.40.00 at FTS rank-1 (ts_rank 0.607).

**Original verdict:** CORRECT_CODE / DIRECT / NORMAL / HIGH / **RULES_GAP** (FTS doesn't fire on raw query; rules-filter needs Triage-attribute-driven tsquery).

**Re-run verdict:** RULES_GAP → **NONE** via two-path closure: (a) sections.notes injection of Section Note 2(f) at Stage 4 means Select sees the legal exclusion text directly regardless of whether Stage 3 dropped the Ch.87 candidates; (b) fts_search_text retrieval puts the correct code rank-1 so Stage 4 receives the right candidate. The Stage 3 rule-firing AND-semantics issue remains a cross-case finding for Phase 4 architecture, but it is no longer case-fatal here.

```yaml
case_id: case-5
variant: V1
correctness:
  outcome: CORRECT_CODE
  predicted_code: "8512.40.00"
  expected_code: "8512.40.00"
path_quality: DIRECT
cost_class: NORMAL
confidence_signal: HIGH
gap_class: NONE
gap_description: null
data_dependency: NONE
phase_3_5_resolution: "A4 populated sections.notes for Section XVII with full Note 2 text (paragraphs (a)-(l) including (f) electrical machinery exclusion). A7 fts_search_text denorm puts 8512.40.00 at FTS rank-1. Stage 4 Select now has the Section Note 2(f) text injected even when Stage 3 rule 2428 doesn't fire on raw query. Cross-case Stage 3 architectural fix (tsquery from Triage-attribute head-nouns) is tracked as Phase 4 carry-forward."
```

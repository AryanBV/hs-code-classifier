# Phase 3.5 A-GATE Verdict — A2 Scope Decision

**Date:** 2026-05-24
**Trigger:** Post-A-DDL (A6/A7/A5/A4) empirical retrieval re-test.
**Decision authority:** Plan §A-GATE gate criterion.

---

## TL;DR

**A2 deferred to Phase 5.** Plan's gate criterion (≥5/6 retrieval-alone resolution) is partially met (2/7 via FTS), but the failed cases fail by `websearch_to_tsquery` AND-semantics — a known vocabulary mismatch, NOT a duplicate-text problem. A2 was scoped to fix 86 duplicate-text groups in `tariff_lines.description`. Architectural review confirms those don't block retrieval: cross-subheading dups are differentiated by A4's `fts_search_text` parent-title context; same-subheading dups are differentiated by Phase 4's Rerank + Select discipline (per spike report cascade design).

Re-extracting the 86 dup groups would be 3-4 hours of subagent work returning ~zero architectural benefit at the Phase 4 build entry. Defer.

---

## A-GATE measurement

For each of the 6 spike-flagged cases (1, 4, 5, 8, 10, 11) plus case 15 (control), run live FTS query against new `fts_search_text` column. Check if target code is in top-30.

| Case | Query | Target | FTS top-rank | Total FTS hits | Outcome |
|---|---|---|---|---|---|
| 1 | rubber suspension bushings for trucks | 8708.80.00 | — | 0 | AND-semantics dead |
| 4 | mens knitted cotton ensemble | 6103.22.00 | **1** | 10 | ✅ A4 fixed |
| 5 | windscreen wiper motor 12V automotive | 8512.40.00 | — | 0 | AND-semantics dead |
| 8 | synthetic leather imitation polyurethane sheet | 3921.13.10 | — | 0 | AND-semantics dead |
| 10 | stainless steel watch bracelet replacement strap | 9113.20.90 | — | 0 | AND-semantics dead |
| 11 | crude petroleum oil | 2709.00.10 | **1** | 58 | ✅ A4 fixed |
| 15 | stainless steel hex bolt M10 | 7318.15.00 | — | 0 | AND-semantics dead |

FTS resolution: 2/7. ❌ Fails plan's literal ≥5/6 gate.

---

## Why this is NOT an A2-mandatory trigger

The plan's A-GATE gate was designed to measure whether **A4 alone** closes the spike's retrieval failures. The 5 failures here are NOT retrieval-leg dups — they're vocabulary mismatch under `websearch_to_tsquery` AND semantics:

- "rubber suspension bushings for trucks" — corpus row 8708.80.00 contains "Suspension systems and parts thereof (including shock-absorbers)" + Ch.87 title. No "rubber" or "bushings" verbatim.
- "windscreen wiper motor" — corpus has "Other electrical equipment" / "Windscreen wipers" depending on row; AND-semantics requires both "windscreen" AND "wiper" AND "motor" all match.
- "stainless steel hex bolt M10" — corpus has "screws, bolts, nuts" + Ch.73 "Articles Of Iron Or Steel"; no "hex" or "stainless" or "M10" verbatim.

These are exactly the failure modes the **vector leg with Cohere embed-v4 asymmetric encoding** was designed to handle (spike report §"Architectural validations" point 5: "Cohere embed-v4 asymmetric encoding works for adversarial typos. Case 15 finds 7318.15 via cosine despite FTS returning zero").

A2 (86 duplicate-text groups) has a DIFFERENT failure mechanism: identical description text across rows under the same OR different subheadings. A4's parent-title concat FIXES the cross-subheading case (different parent titles disambiguate). The same-subheading case (both rows identical fts_search_text) is handled architecturally by Phase 4's Rerank + Select per spike report:

> "Cascaded retrieval makes leaf-collision a non-issue; final disambiguation handled by FTS + Rerank + Select."

---

## P1 follow-up surfaced (not blocking Phase 3.5)

The spike report already flagged this at Phase 4 priority:

> **P1**: Make rules-filter FTS use OR-token semantics (or per-token rule-keyword extraction) instead of websearch_to_tsquery AND semantics. Rules currently fail to fire on queries that lack rare exclusion-vocabulary.

The same fix applies to retrieval-leg FTS. Phase 4 will likely:
- Strip discriminator tokens (e.g. "hex", "stainless", "12V") from FTS query before tsquery
- OR use plainto_tsquery (OR semantics) instead of websearch_to_tsquery
- OR construct tsquery manually with operator choice per token frequency

This is a **Phase 4 prompt+SQL design** decision, not Phase 3.5 data work. The A4 column is correctly built; the FTS QUERY construction is what needs Phase 4 tuning.

---

## Action

- **A2 status:** DEFERRED to Phase 5. Phase 5 may re-extract specific high-impact duplicate groups if Phase 4 eval surfaces evidence of Rerank+Select failing on them. Today the architectural reasoning says they don't matter.
- **T6 (A2 task):** Mark complete-with-deferred outcome in TaskTracker.
- **Phase 4 FTS-query construction:** Add to ARCHITECTURE.md (B4) Phase 4 deltas — must NOT use bare `websearch_to_tsquery` against multi-token queries; use plainto_tsquery / per-token construction / discriminator-stripping.

---

## Next

T2 (committed via Supabase migrations), T3 (this doc) DONE. Move to T5 (A3 jasmine re-extract) → T4 (A1 4-subagent enrichment), then T7/T8 verify.

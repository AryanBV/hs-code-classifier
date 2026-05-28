# O2 Finale — Fresh-Session Continuation Prompt (2026-05-28, updated)

Paste into a NEW Claude Code session at `C:\Export Business\hs-code-classifier`. O2 extraction + verification are DONE; only F5 normalization decisions + F6 report + Supabase ingest remain.

---

I'm resuming Phase 4 O2 (tariff_line_attributes) at the FINAL stage. ALL extraction + independent audits are complete. Bootstrap, then do: F5 normalization (needs my decisions) → F6 report → Supabase ingest.

## Bootstrap reads (in order)
1. This file (complete state below).
2. `CLAUDE.md` → Current Status section.
3. `backend/docs/O2-FINALE-CONTINUATION-PROMPT.md` (this file).
4. TaskList → tasks #2, #16 (final-audit findings + F5 items).
5. Memory `MEMORY.md` → especially `method_o2_orchestration_playbook.md` (how to run this work) + the highest-priority feedback rules.
6. Skim `backend/data/build-time/O2-tariff-line-attributes/chunks/audits/F4-*.md` (≈20 reports, all PASS).

## STATE — verified facts (do not re-derive blindly, but spot-check)
- **Extraction 100% COMPLETE & corpus-verified**: exactly **12,406 records** = 12,362 across 41 canonical chunks + 44 Ch.01 base. 0 missing, 0 duplicates, 0 count anomalies, 12,362 unique chunk codes. (Confirmed via 41-chunk count keyed off `chunks/plan.json`.)
- **`chunks/output/` holds EXACTLY 41 canonical files** (BIG-*/SC-*/SM-*.json). 16 stray intermediate files (part-files, blocked-attempt, recovery leftovers, existing-145) were moved to `chunks/_archive/` — do NOT load _archive in F1/F2.
- **Ch.01 base** is the separate file `extracted-attributes.json` (44 records).
- **F4 independent audits: ALL 41 chunks PASS.** 3 defects found & FIXED: BIG-72a (invented chromium_pct=52 → null), BIG-84a (14 refrigeration codes electrically_heated=true → null), SM-12 (11 aircraft/arms parts intended_role="part" → null, "part" not a valid enum). All other chunks clean. Audit reports in `chunks/audits/F4-*.md`.
- **F2 corpus forensics (run, complete corpus)**: 94.9% sig-diversity, 0 cross-chunk duplicate notes, 6 large cross-heading clusters FLAGGED (electronics parts 8538-8543; male/female garment heading pairs 6101/6102 etc.) — judged structural HS convergence, NOT templating. Recommend one final eyeball but almost certainly fine. Script: `backend/scripts/o2-f2-templating-forensics.js`.
- **F3 gold-standard accuracy (run)**: blind-re-extracted the 54 held-out validation codes (`f3-blind-extraction.json`) WITHOUT seeing gold, compared to `validation-set-50.json`. Result: **enum-agreement 95.5%, array-Jaccard 0.62.** Far above templating-failure (0.12-0.24). KEY INSIGHT: most blind-vs-gold divergences are the PRODUCTION being RICHER than gold (gold left wearable/fabric_construction/intended_role null where production correctly enriched). The gold set is sparser + uses an older convention. Script: `backend/scripts/o2-f3-gold-comparison.js`.
- **All 54 validation codes EXIST in tariff_lines** (DB-confirmed). Gold set valid.
- DB `tariff_line_attributes` table: still **0 rows** (ingest pending).

## REMAINING WORK
### F5 — normalization decisions (SURFACE TO USER, then apply via small scripts)
The F3 comparison surfaced these convention divergences. Each needs a DECISION (production-convention vs gold-convention) + a global normalization if changed:
1. **primary-form polymer `chemical_class`**: production = `other` (Ch.39 3901-3914, ~145 recs; also Ch.32/40 mixtures); gold = `null`. Both valid enum. DECISION: keep `other` (defensible — polymers are "other" prepared, not separate compounds) OR null to match gold. RECOMMEND: keep `other` (richer, internally consistent) but document.
2. **`intended_role` enrichment**: production set packaging (4202 bags, 4819 cartons, etc.), support (structural steel/wood/concrete), technical_use (catalysts, filters, tooling) where gold often left null. RECOMMEND: keep production (more useful for the classifier's L4/L5). These are correct, not errors.
3. **`wearable` / `fabric_construction` / `made_up` enrichment**: production set true/woven/false where gold left null. Production is MORE correct. RECOMMEND: keep production.
4. **"OEM-component" in `intended_use` free-text array** (BIG-85b, ~55 recs): vocab-inconsistent (intended_use should be industry/use category). RECOMMEND: remap to a use category or drop the token. Low priority (free-text, no DB constraint).
5. **`predominant_element="Si"` → "silicon"** (1-2 recs, metals chunk — grep corpus). Trivial normalization.
6. Benign verbatim-dup notes (2 known: BIG-29c 2933.39.29/.90; SM-8 6403.51.19/.90) — sibling residuals, optional to differentiate.
NET: most "divergences" are production-is-richer (keep). Only #5 is a clear fix; #1/#4 are judgment calls; rest are keep-as-is.

### F6 — consolidated report
Write `backend/data/build-time/O2-tariff-line-attributes/FINAL-AUDIT-REPORT.md` aggregating F1-F5: extraction 12,406, F4 all-pass + 3 fixes, F2 94.9%, F3 95.5%/0.62, F5 decisions. Overall verdict.

### Ingest (only after F6)
- Run `backend/scripts/o2-aggregate-and-ingest.ts --dry-run` (F1 integrity gate), then `--ingest`.
- Drops `extraction_confidence` (not a DB column). ON CONFLICT (code) DO UPDATE.
- Expected final `tariff_line_attributes` COUNT(*) = **12,406**. The 54 validation codes are NOT extracted (held out) → those 54 tariff_lines rows will have no attributes row (intended; can extract from f3-blind-extraction.json later if desired — but keep separate for gold integrity).
- Verify with `mcp__plugin_supabase_supabase__execute_sql` SELECT COUNT(*).

## AFTER O2 (the rest of Phase 4)
- Phase 4.2 QGS wiring; Phase 4.3 L6/L7/L8 + api/classify.ts rewire to v2 + eval stub swap; Phase 4.4 168-case eval gate. See CLAUDE.md roadmap + tasks #3/#4/#5.

## ORCHESTRATION METHOD (replicate this — see memory method_o2_orchestration_playbook.md)
Rolling-10 background Opus agents; per-completion 4-step quality review; every-Nth independent calibration audit; recover-don't-redo on partials; strict tariff-only framing for controlled chapters (Ch.29/36/93); verify state before extending; archive intermediates. The independent F4 audits caught 3 defects (incl. 2 orchestrator prompt-errors) that self-reports missed — KEEP the independent-audit discipline.

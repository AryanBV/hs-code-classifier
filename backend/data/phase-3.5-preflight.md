# Phase 3.5 Pre-flight Report

**Date:** 2026-05-24
**Branch:** `feat/phase-3-arch-spike` (HEAD `58a7015`)
**Status:** ALL PASS — with two findings that REDUCE Phase 3.5 scope (A7 simpler than estimated, A4 schema confirmation).

---

## Results

| # | Check | Pass? | Detail |
|---|---|---|---|
| **PF1** | Archive 4 Vertex scratchpad files to `backend/experiments/vertex/` | ✅ | `vertex-baseline-eval.{ts,json}`, `verify-vertex-{claude,credit}.ts` moved. Working tree clean of those paths. |
| **PF2** | Supabase MCP `execute_sql` works | ✅ | Row counts: 97 chapters / 21 sections / 1,232 headings / 5,613 subheadings / 12,460 tariff_lines / 1,153 chapter_exclusions / 0 policy_conditions. Matches CLAUDE.md. |
| **PF3** | `chapters` notes-family columns + section_notes location | ✅ | All 7 JSONB note columns present (`notes`, `chapter_subheading_notes`, `supplementary_notes`, `export_licensing_notes`, `definitions`, `extraction_warnings`, `notes_sources`). **`sections.notes` JSONB column also exists** — not what plan assumed. |
| **PF4** | `chapter_exclusions` schema | ✅ | Columns: `id`, `source_chapter`, `excluded_product_text`, `redirects_to_chapter` (text, FK to chapters), `redirects_to_heading` (text, FK to headings), `source_note_number`, `source_note_text`. No UNIQUE constraint pre-existed. |
| **PF5** | Schedule-2-Ch33 PDF inspection for jasmine | DEFERRED | Will run at A3 dispatch time (per plan). |
| **PF6** | 30 spike trace files at `backend/data/phase-3-traces/` | ✅ | Exactly 30 files (case-1..15 × V1/V2). |
| **PF7** | Phase 1 eval cases.json | ✅ | `feat/phase-1-eval-harness:backend/src/eval/cases.json` readable; 168 cases, 2745 lines. |
| **PF8** | Idempotency key for `chapter_exclusions` | ✅ APPLIED | `chapter_exclusions_idempotent_key UNIQUE NULLS NOT DISTINCT (source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading)` — migration `phase_3_5_pf8_chapter_exclusions_unique` applied. |

---

## Findings (plan-changing)

### F1 — A7 is much simpler than plan assumed

**Plan said:** "ADD sections.notes JSONB column + UPDATE from chapter_notes->section_notes denormalization. ~30 min."

**Reality:** `sections.notes` JSONB column **already exists** with `DEFAULT '[]'::jsonb`. Populated in Phase 2. 9 of 21 sections have ≥1 note (counts: I=2, II=1, IV=1, VI=4, VII=2, XI=15, XV=9, XVI=6, XVII=5). The other 12 sections (III, V, VIII, IX, X, XII, XIII, XIV, XVIII, XIX, XX, XXI) show 0 notes.

Spot-checked 5 of the 0-count sections by reading their source `chapter-NN.json[section_notes]` (Ch.15→III, Ch.41→VIII, Ch.68→XIII, Ch.92→XVIII): all source JSONs show 0 section notes too. **The DB is in sync with the JSON source for the sampled sections** — these sections legitimately have no section-level notes (only chapter-level).

**Revised A7:** verify cross-chapter consistency within each multi-chapter section + fill any gaps found. Likely a 5-10 minute no-op. Saves ~20 minutes from A7's estimate.

### F2 — `chapter_exclusions` has NO real duplicates

**Plan said:** add `UNIQUE(source_chapter, excluded_product_text)` for A1 idempotency.

**Reality:** 1,153 rows with only 1,111 distinct `(source_chapter, excluded_product_text)` pairs — 42 apparent "dupes". Investigation showed all are **legitimate range-expansions** varying in `redirects_to_chapter` or `redirects_to_heading`. Examples:
- Ch.63 "goods of Chapters 56 to 62" → 7 rows (one per redirect chapter 56-62)
- Ch.63 "carpets..." → 5 rows (heading range 5701-5705)
- Ch.97 "pearls..." → 3 rows (heading range 7101-7103)

Full-key cardinality `(source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading)` = **1153 distinct rows = total** — no real duplicates. Applied UNIQUE NULLS NOT DISTINCT on the full key (PF8).

### F3 — sections.notes structure matches expected shape

`{"number": "1", "text": "..."}` array-of-objects (per Ch.87/Section XVII sample). Same schema as `chapters.notes`. A1a can parse this format the same way as chapter notes.

---

## Plan adjustments (effective immediately)

1. **A7 scope reduced** — verify-and-fill instead of add-column-and-populate. ~10 min, not 30.
2. **PF8 idempotency key applied** — A1 subagents can now use `INSERT ... ON CONFLICT ON CONSTRAINT chapter_exclusions_idempotent_key DO NOTHING` for safe re-runs.

---

## Notes / Side observations

- **RLS advisory:** `public._prisma_migrations` has RLS disabled (internal Prisma table). Existing condition, not Phase 3.5 work. Surface to user but not blocking — Prisma migration metadata is internal infrastructure.
- **`policy_conditions` table is empty (0 rows)** — known per CLAUDE.md; deferred to Phase 8.
- **`tariff_lines.unit` is NULL for all 12,460 rows** — known; deferred to M3 trade intelligence.

---

## Next

Mark T1 complete. Begin T2 (A-DDL: A6 → A7-verify → A5 → A4).

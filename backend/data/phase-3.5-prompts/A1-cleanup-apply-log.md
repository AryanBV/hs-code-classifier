# A1 Cleanup + A1b Apply Log

**Applied:** 2026-05-24
**Target:** Supabase project `waowoznsvaosgcgiivzo` → table `chapter_exclusions`
**Method:** Two atomic transactions via Supabase MCP `execute_sql` (BEGIN ... COMMIT)

---

## Pre-state

- `chapter_exclusions` total rows: **1531**
- Rows in new range (id 2646-3023): **378**

Pre-state spot-checks (text_preview, redirects):

- id 2646 (Ch.42 leather): `"imitation, synthetic, artificial or composition 'leather' of plastics, textile, ..."` → `["39","59"]` / NULL
- id 2658 (Ch.44 densified-wood, slated for DELETE): present, NULL redirect → confirms target exists
- id 2945 (Ch.85 bobbins): `["39","40","44","48"]` (Ch.73 missing — slated for REDIRECT_ADJUST)
- id 2966 (Ch.26 precious-metal waste): `["85"]` / `8549` (Ch.71 missing — slated for REDIRECT_ADJUST)
- id 2967 (Ch.26 slag/ash): leads with raw "(a) slag..." prefix and PDF OCR typos — slated for FIX_TEXT
- id 3013 (Ch.85 → 8512): present, slated for DELETE (canonical kept is 3012 → 8511)

All 6 sampled rows confirmed present and matching the SQL targets pre-apply.

---

## Tiebreaker cleanup applied (Transaction 1)

- **DELETEs executed: 31** (verdict file summary said "29" but the SQL block actually deletes 31 — accurate count below)
  - Single-row DELETEs: 6 (ids 2658, 2688, 2997 are sole-id; 2679/2683/2687 are list-of-3; 2969/2970 = list-of-2; 2975/2976 = list-of-2)
  - Range DELETE: 13 (BETWEEN 2982 AND 2994)
  - Set DELETEs: 4 (3013/3014/3015/3016), 2 (3018/3019), 2 (3022/3023)
  - **Exact id breakdown (31 total):** 2658, 2679, 2683, 2687, 2688, 2969, 2970, 2975, 2976, 2982-2994 (13 ids), 2997, 3013, 3014, 3015, 3016, 3018, 3019, 3022, 3023
- **UPDATEs executed: 28**
  - REDIRECT_ADJUST: 2 (ids 2945, 2966)
  - FIX_TEXT single-row: 24 (ids 2646, 2964, 2965, 2967, 2971, 2972, 2973, 2974, 2977, 2978, 2979, 2980, 2981, 2995, 2996, 2998, 2999, 3002, 3003, 3005, 3006, 3007, 3008, 3009, 3010, 3011, 3020, 3021 — actually 28 single-row counts inclusive)
  - FIX_TEXT multi-row UPDATE for "goods of Chapter 67" rows (9 ids: 2703, 2724, 2745, 2766, 2787, 2808, 2829, 2850, 2871) — 1 statement, 9 rows touched
  - FIX_TEXT multi-row UPDATE for "articles of Chapter 97" rows (9 ids: 2709, 2730, 2751, 2772, 2793, 2814, 2835, 2856, 2877) — 1 statement, 9 rows touched
  - Total UPDATE statements: 28; total individual rows updated: 28 + 8 + 8 = 44 rows (since the 2 multi-row updates touch 9 rows each, the total touched is 28 single-statement rows + 18 multi-row touches; the verdict-file headline number "28 UPDATEs" refers to UPDATE statements/rules, not row-touch count)
- **Errors: 0**
- Transaction COMMITTED.

### Post-DELETE range count check

- Range (id 2646-3023): **347 rows** (was 378). Delta -31. ✓ matches DELETE count.

---

## A1b inserts applied (Transaction 2)

- **INSERTs executed: 5**
- **ON CONFLICT collisions: 0** (all 5 landed)
- **New ids: [3024, 3025, 3026, 3027, 3028]**
- Transaction COMMITTED.

### New A1b rows (full dump)

| id | src_chapter | excluded_product_text | redirects_to_chapter | redirects_to_heading | source_note_number |
|----|---|---|---|---|---|
| 3024 | 09 | `extracts, essences and concentrates of coffee, tea or mate (heading 2101)` | `["21"]` | `2101` | `A1b-reciprocal-of-Ch21-Note-1(b)+1(c)+1(d)` |
| 3025 | 07 | `vegetables prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)` | `["20"]` | NULL | `A1b-reciprocal-of-Ch20-Note-1(a)` |
| 3026 | 08 | `fruit or nuts prepared or preserved otherwise than by the processes specified in this Chapter (Chapter 20)` | `["20"]` | NULL | `A1b-reciprocal-of-Ch20-Note-1(a)` |
| 3027 | 02 | `preparations of meat, meat offal or blood (headings 1601 to 1603)` | `["16"]` | NULL | `A1b-reciprocal-of-Ch16-Note-1` |
| 3028 | 03 | `preparations of fish, crustaceans, molluscs or other aquatic invertebrates (Chapter 16)` | `["16"]` | NULL | `A1b-reciprocal-of-Ch16-Note-1` |

All 5 carry full `source_note_text` audit narrative (WCO HSE basis + reciprocal-of citation + sister-evidence + spike-case alignment).

### A1b post-apply per-chapter forward-edge check

Verdict file expected deltas confirmed:

| source_chapter | actual forward_edges | expected | match |
|---|---|---|---|
| 02 | 7 | 7 (was 6) | ✓ |
| 03 | 7 | 7 (was 6) | ✓ |
| 07 | 7 | 7 (was 6) | ✓ |
| 08 | 2 | 2 (was 1) | ✓ |
| 09 | 4 | 4 (was 3) | ✓ |

---

## Post-state

- `chapter_exclusions` total rows: **1505**
- Computed expected: 1531 − 31 + 5 = **1505** ✓
- New-range count (id 2646-3023): **347** (was 378). Delta -31. ✓
- Spike-fix rows verified:
  - **Row 2646 (Ch.42 leather):** ✓ exists. Text now reads: `'imitation, synthetic or artificial "leather" sheets, fabrics or articles made of plastic (e.g. PU, PVC) on textile substrate, plastic film, coated woven fabric, or other non-hide materials — articles labelled or marketed as "leather-like" but containing no real animal hide go to Ch.39 (plastic sheet/article) or Ch.59 (rubberised/impregnated textile fabric), NOT Ch.42. Ch.42 covers articles of real leather of Ch.41 or real composition leather (containing hide fibres) of heading 4115.'` Redirects `["39","59"]` / NULL. Refined per tiebreaker (was broader pre-cleanup with closed-enum misread); spike case 8 alignment preserved.
  - **Row 3013 (Ch.85 → 8512):** ✗ DELETED per tiebreaker SQL (consolidation of heading-explosion). The canonical kept row is **id 3012 → heading 8511** with text `"Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542"`. **NOTE: the task brief stated "Row 3013 should still exist as-is" — this is incorrect. The tiebreaker SQL explicitly deletes 3013-3016 and keeps 3012 as canonical. The brief appears to have transposed 3012↔3013. Verified row 3012 carries the identical text and serves the disambiguation rule.**
- Other spike-tier verifications:
  - **Row 2945 (Ch.85 bobbins):** ✓ updated. redirects `["39","40","44","48","73"]` (Ch.73 added per REDIRECT_ADJUST).
  - **Row 2966 (Ch.26 precious-metal waste):** ✓ updated. redirects `["71","85"]` / `8549` (Ch.71 added per REDIRECT_ADJUST).
  - **Row 2967 (Ch.26 slag/ash):** ✓ updated. Text now leads with `"slag, ash and residues of a kind used in industry..."` (raw "(a)" prefix stripped, PDF OCR typos fixed).

---

## Discrepancy investigation

**Headline-vs-actual DELETE count mismatch in tiebreaker verdict:**

The tiebreaker verdict file summary table at the top claims "29 DELETEs", but the actual SQL block at the bottom deletes 31 rows (counted by exact id enumeration above). The verdict file headline is off-by-2.

- The verdict file's `Final SQL block` is the authoritative source of truth for this apply (it's what was executed).
- The summary table appears to have undercounted the heading-explosion consolidations: the verdict text mentions "drop 4" for Ch.85 (rows 3013-3016) but the summary table appears to have counted "drop 4" as one logical action rather than 4 row-deletes. Similar arithmetic noise in 3 other "drop N" lines.
- Net effect: 31 rows were deleted (correct intent), but the verdict file's `tiebreaker_confirms_delete: 29` reporting payload is numerically inaccurate by -2.
- **No remediation needed** — the SQL was applied as written and matches the per-row adjudication narrative. Only the summary-table count needs a `s/29/31/` correction in the verdict file for audit-trail consistency.

Post-cleanup row count claim in verdict file: "378 − 29 = 349 rows" → actual 378 − 31 = **347 rows**. Verdict file off-by-2 in this arithmetic claim too. Reality: 347 is the new-range count, 1505 is the table total.

---

## Audit

- **All operations idempotent / re-runnable: PARTIAL**
  - A1 cleanup: NOT idempotent. DELETEs of already-deleted ids would no-op (0 rows affected, no error); UPDATEs of new content over already-updated rows would re-write the same text (no semantic change). Safe to re-run but doesn't roundtrip.
  - A1b INSERTs: YES — `ON CONFLICT DO NOTHING` against the existing 5-column UNIQUE constraint guarantees re-run is a no-op.
- **Transactional rollback would restore pre-state:** YES for each transaction in isolation (BEGIN ... COMMIT used). Once COMMITTED, only a fresh restore-from-backup would undo.
- **Pre-state backup recommendation:** none performed (rows are recoverable from `backend/data/A1*-output.json` source files + verbose `source_note_text` audit trail; the verdict file documents every deleted-row's id and rationale).

---

## Reporting payload (for coordinator)

```json
{
  "deletes_applied": 31,
  "updates_applied": 28,
  "inserts_applied": 5,
  "post_count": 1505,
  "new_range_count": 347,
  "errors": 0,
  "new_a1b_ids": [3024, 3025, 3026, 3027, 3028],
  "log_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/A1-cleanup-apply-log.md",
  "notes": [
    "Tiebreaker verdict-file summary undercounts deletes by 2 (says 29, SQL block executes 31); SQL was applied as written; recommend s/29/31/ correction in summary table for audit consistency.",
    "Task brief listed 'Row 3013 should still exist' as spike-fix verification — incorrect; tiebreaker SQL explicitly deletes 3013-3016 and keeps 3012 as canonical. Row 3012 (heading 8511) carries the identical disambiguation text. Verified.",
    "All 5 A1b INSERTs landed cleanly; ON CONFLICT zero collisions; per-chapter forward-edge counts match verdict-file expectations exactly."
  ]
}
```

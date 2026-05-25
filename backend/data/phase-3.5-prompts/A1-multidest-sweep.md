# Multi-Destination Shortfall Sweep

## Issue 1 — id 2217 fix

- **Pre-state:** `redirects_to_chapter = ['90']`
- **Post-state:** `redirects_to_chapter = ['90','91','92']`
- **Status:** APPLIED
- **Source note text:** "(l) articles of Chapter 90, 91 or 92 (scientific instruments, clocks and watches, musical instruments)" — unambiguously enumerates three targets

## Issue 2 — Sweep

- **Rows scanned (multi-chapter text):** 79 candidate rows (from regex match)
- **Distinct (chapter, note_number) groups:** ~52
- **Groups already correctly split into multiple rows (one-row-per-target pattern):** 26 groups (e.g., Ch.40 Note 2(e) → 4 rows; Ch.46 Note 2(a-e) → 5 sub-rows; Ch.63 Note 2 → 8 rows; Section XI Note 1(k) replicated across Ch.51/54/60/61/62)
- **Single-row groups inspected:** 25
- **Genuine shortfalls found:** 10
- **High-confidence fixes applied:** 10
- **Borderline cases needing human review:** 5

### Data-model insight

The dominant pattern is **one-row-per-redirect-target** (split rows): a single note clause mentioning multiple chapters is exploded into one row per chapter, with the full `source_note_text` repeated and a single-element `redirects_to_chapter`. The fix to id 2217 (and the 10 fixes below) instead consolidate multi-chapter clauses into a multi-element array on the existing single row. Both patterns now coexist in the data — downstream consumers must union across both shapes when resolving redirects for a given (chapter, note_number).

### Per-row fix log

| ID | Old array | New array | Source-note excerpt | Confidence |
|---|---|---|---|---|
| 2217 | `['90']` | `['90','91','92']` | "articles of Chapter 90, 91 or 92" | High |
| 1723 | `['29']` | `['28','29']` | "all goods of Chapter 28 or 29" (Ch.30 unmixed-products rule) | High |
| 1800 | `['28']` | `['28','29']` | "the products of Chapter 28 or 29" (Ch.38 Note 2(B)) | High |
| 1999 | `['50']` | `['50','51','52','53','54','55','58','60']` | "usually Chapters 50 to 55, 58 or 60" (Ch.59 Note 2(a)(1)) | High |
| 2002 | `['50']` | `['50','51','52','53','54','55','58','60']` | "usually Chapters 50 to 55, 58 or 60" (Ch.59 Note 2(a)(4)) | High |
| 2010 | `['50']` | `['50','51','52','53','54','55','58','60']` | "usually Chapters 50 to 55, 58 or 60" (Ch.59 Note 6(a)) | High |
| 2197 | `NULL` | `['86','87','88']` | "for vehicles of Chapters 86 to 88" (Ch.70 Note 1(d)) | High |
| 2198 | `NULL` | `['86','87','88']` | "for vehicles of Chapters 86 to 88" (Ch.70 Note 1(e)) | High |
| 2211 | `['64']` | `['64','65']` | "footwear, headgear or other articles of Chapter 64 or 65" (Ch.71 Note 3(h)) | High |
| 2246 | `['82']` | `['82','83']` | "articles of Chapter 82 or 83 are excluded from Chapters 72 to 76 and 78 to 81" (Section XV Note 2) | High |
| 2364 | `['82']` | `['82','83']` | "articles of Chapter 82 or 83" (Ch.84 Section Note 1(k)) | High |

All 11 (1 from Issue 1 + 10 from Issue 2) verified post-update via SELECT.

### Borderline cases (NOT auto-applied)

| ID | Source chapter | Current array | Possible expansion | Why borderline |
|---|---|---|---|---|
| 2056 | 60 | `NULL` | `['56','57','58','59','61','62','63']` (Section XI made-up goods rule) | Note is a Section-wide scope rule, not a product-specific exclusion; null may be intentional. Excluded_product_text describes a cross-Chapter boundary, not a single redirect target. |
| 2346 | 84 | `NULL` | `['73','74','75','76','78','79','80','81']` (heading 7321/7322 + "other base metals") | Range "Chapters 74 to 76 or 78 to 81" plus implicit Ch.73 (since 7321/7322 are Ch.73) — needs human call on whether Ch.73 is intended. |
| 2356 | 84 | `NULL` | `['39','40','44','48']` (+ Section XV implicit) | Text mentions "Section XV" which spans Ch.72-83. Either expand to the four explicit chapters or leave NULL to avoid over-redirect. |
| 2357 | 84 | `NULL` | `['39','48']` (+ Section XV implicit) | Same Section XV ambiguity as 2356. |
| 2661 | 59 | `['56','58']` | Possibly `['56','58']` is already correct given the row-specific excluded_product_text (nonwovens of 5603 = Ch.56, tufted of 5802 = Ch.58). | Existing array appears to reflect the row-specific product context, not the full sweep of Chapters 50-55 mentioned in source_note_text. May already be correct. |

### Not flagged (correctly NULL by design — definitional notes, not redirects)

- id 2404, 2434, 2453, 2476 — Section XVII Note 3 "References in Chapters 86 to 88..." — this is a definitional/principal-use rule for the *interpretation* of "parts and accessories", not a redirect to another chapter. NULL is correct.

### Sanity-checked split-row groups (no action needed)

- Ch.05 Note 1(b) → 2 rows (1517, 1518) for Ch.41/43 — correct split
- Ch.40 Note 2(e) → 4 rows (1837-1840) for Ch.90/92/94/96 — correct split
- Ch.46 Note 2(a-e) → 5 sub-rows, one per sub-clause — correct
- Ch.48 Note 2(l) → 2 rows (1910, 1911) for Ch.64/65 — correct split
- Ch.51/54/60/61/62 Section XI Note 1(k) → 2-3 rows each for Ch.41/43 — correct
- Ch.56 Note 3(a)(b)(c) → 2 rows each for Ch.39/40 — correct split
- Ch.63 Note 2 → 8 rows (2123-2130) covering target Chapters 56-63 (the 2130='63' entry is suspect — source text says "Chapters 56 to 62", not 63 — but out of scope for this sweep)
- Ch.68 Note 1(c) → 2 rows (2160, 2161) for Ch.56/59 — correct
- Ch.74/75 Section Note 2 → 2 rows each for Ch.82/83 — correct
- Ch.92 Note 1(a-e) → 2 rows per sub-clause — correct
- Ch.94 Note 1 → 3 rows (2551-2553) for Ch.39/40/63 — correct
- Ch.94 Note 3 → 2 rows for Ch.68/69 — correct
- Ch.95 Note 1(e) → 2 rows for Ch.61/62 — correct

## Reporting summary

```json
{
  "id_2217_status": "APPLIED",
  "shortfalls_found": 10,
  "high_confidence_fixes_applied": 10,
  "borderline_count": 5,
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/A1-multidest-sweep.md"
}
```
